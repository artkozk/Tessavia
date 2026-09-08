const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'page-record-actions.js'),'utf8').replaceAll('export ',''),c);
const run=code=>vm.runInContext(code,c);
test('action values preserve zero, false and all selected options',()=>{
 c.root={querySelectorAll:()=>[{value:'0',checked:false}]};c.field={fieldType:'number'};assert.equal(run('readActionValue(root,field)'),0);
 c.field.fieldType='checkbox';assert.equal(run('readActionValue(root,field)'),false);
 c.root={querySelectorAll:()=>[{value:'a',checked:true},{value:'b',checked:false},{value:'c',checked:true}]};c.field.fieldType='multi_select';assert.equal(JSON.stringify(run('readActionValue(root,field)')),'["a","c"]');
});
test('portable action choices exclude references tied to source workspace',()=>{
 c.collection={fields:[{id:'number',fieldType:'number'},{id:'user',fieldType:'user'},{id:'related',fieldType:'relation'},{id:'multi',fieldType:'multi_select'}]};assert.equal(JSON.stringify(run('actionFields(collection).map(f=>f.id)')),'["number","multi"]');
});
test('record action menus escape user labels and are absent without configured actions',()=>{
 c.e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');c.block={actions:[{id:'one',label:'<img src=x>'}]};c.record={id:'record',title:'<b>Request</b>'};
 const html=run('recordActionMenu(block,record,e)');assert.ok(!html.includes('<img'));assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&lt;b&gt;Request'));assert.equal(run('recordActionMenu({},record,e)'),'');
});
