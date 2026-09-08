const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});for(const name of ['page-calculations.js','page-record-bindings.js'])vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,name),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),c);
const run=s=>vm.runInContext(s,c);
test('row text resolves each record independently without changing source and handles zero false empty',()=>{
 c.collection={fields:[{id:'n',fieldType:'number'},{id:'c',fieldType:'checkbox'}]};c.block={recordBindings:{title:{fieldId:'n',prefix:'Прочитано: ',suffix:' глав',emptyText:'Нет оценки'},subtitle:{fieldId:'c',prefix:'Проверено: '}}};c.display=(f,v)=>f.fieldType==='checkbox'?(v?'Да':'Нет'):String(v);c.record={title:'Original',customFields:{n:0,c:false}};
 const before=JSON.stringify(c.record);let v=run('recordRowText(block,record,collection,display)');assert.equal(v.title,'Прочитано: 0 глав');assert.equal(v.subtitle,'Проверено: Нет');assert.equal(JSON.stringify(c.record),before);
 c.record={title:'Second',customFields:{}};v=run('recordRowText(block,record,collection,display)');assert.equal(v.title,'Нет оценки');assert.equal(v.subtitle,'');delete c.block.recordBindings.title;assert.equal(run('recordRowText(block,record,collection,display).title'),'Second');
});
test('missing or unsupported fields and removed select values use fallback rather than raw IDs',()=>{
 c.binding={fieldId:'f',prefix:'Prefix',emptyText:'Empty'};c.record={title:'R',customFields:{f:'old'}};c.collection={fields:[{id:'f',fieldType:'select'}]};c.display=()=>'';assert.equal(run('recordBindingText(binding,record,collection,display)'),'Empty');
 c.collection.fields[0].fieldType='relation';c.display=()=>{throw Error('must not read relation')};assert.equal(run('recordBindingText(binding,record,collection,display)'),'Empty');c.collection.fields=[];assert.equal(run('recordBindingText(binding,record,collection,display)'),'Empty');
});
test('binding editor escapes schema and template text, provides explicit removal and empty state',()=>{
 c.block={recordBindings:{title:{fieldId:'f',prefix:'<img>',emptyText:'<script>'}}};c.collection={fields:[{id:'f',name:'<b>Name</b>',fieldType:'text'},{id:'secret',name:'Relation',fieldType:'relation'}]};c.e=v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');const html=run('recordBindingConfig(block,collection,e)');assert.match(html,/&lt;img&gt;/);assert.match(html,/&lt;b&gt;Name/);assert.ok(!html.includes('value="secret"'));assert.match(html,/data-binding-remove/);assert.match(html,/Если значение пустое/);
});
