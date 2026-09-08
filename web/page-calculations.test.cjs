const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({});for(const name of ['page-calculations.js','page-record-bindings.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export ',''),c);
const run=s=>vm.runInContext(s,c),setup=()=>{c.collection={fields:[{id:'n',name:'Количество',fieldType:'number'},{id:'price',name:'Цена',fieldType:'money'},{id:'read',name:'Прочитано',fieldType:'number'}]};c.record={title:'Original',customFields:{n:10,price:2.5,read:4}};c.b={fieldId:'n',calculation:[],precision:2,emptyText:'Нет результата'};};
test('ordered calculation uses previous result and never writes into original fields',()=>{
 setup();c.b.calculation=[{operation:'multiply',fieldId:'price'},{operation:'subtract',value:3},{operation:'divide',value:2}];const before=JSON.stringify(c.record),result=run('evaluateCalculation(b,record,collection)');assert.equal(result.value,11);assert.deepEqual(Array.from(result.trace,x=>x.value),[10,25,22,11]);assert.equal(JSON.stringify(c.record),before);
 [c.b.calculation[0],c.b.calculation[1]]=[c.b.calculation[1],c.b.calculation[0]];assert.equal(run('evaluateCalculation(b,record,collection).value'),8.75);
});
test('reading remaining and percentage support clamps, negative numbers and exact zero',()=>{
 setup();c.b.calculation=[{operation:'subtract',fieldId:'read'},{operation:'max',value:0}];assert.equal(run('evaluateCalculation(b,record,collection).value'),6);c.record.customFields.read=12;assert.equal(run('evaluateCalculation(b,record,collection).value'),0);c.b.fieldId='read';c.b.calculation=[{operation:'divide',fieldId:'n'},{operation:'multiply',value:100},{operation:'min',value:100}];assert.equal(run('evaluateCalculation(b,record,collection).value'),100);c.b.calculation=[{operation:'subtract',value:15}];assert.equal(run('evaluateCalculation(b,record,collection).value'),-3);
});
test('missing operands, changed types, zero division and overflow use explained fallback rather than NaN or zero',()=>{
 setup();c.b.calculation=[{operation:'divide',fieldId:'read'}];c.record.customFields.read=0;assert.match(run('evaluateCalculation(b,record,collection).error'),/ноль/);assert.equal(run('recordBindingText(b,record,collection,()=>"unused")'),'Нет результата');
 for(const value of [null,undefined,'',false,'4',NaN,Infinity]){c.record.customFields.read=value;assert.ok(run('evaluateCalculation(b,record,collection).error'));}
 c.record.customFields.read=4;c.collection.fields[2].fieldType='text';assert.match(run('evaluateCalculation(b,record,collection).error'),/числовым/);c.b.calculation=[{operation:'multiply',value:1e15}];assert.match(run('evaluateCalculation(b,record,collection).error'),/диапазон/);
});
test('rounding happens once at final display and precision zero survives',()=>{
 setup();c.record.customFields.n=1;c.b.calculation=[{operation:'divide',value:3},{operation:'multiply',value:3}];assert.equal(run('evaluateCalculation(b,record,collection).value'),1);assert.equal(run('formatCalculation(1.23456,0)'),'1');assert.equal(run('formatCalculation(1.23456,3)'),'1,235');c.b.prefix='Всего: ';c.b.suffix=' шт.';assert.equal(run('recordBindingText(b,record,collection,()=>"unused")'),'Всего: 1 шт.');
});
test('malformed expressions fail closed and editor escapes field labels',()=>{
 setup();for(const step of [{operation:'eval',value:1},{operation:'add',value:1,fieldId:'read'},{operation:'add'},{operation:'add',value:1e16}]){c.b.calculation=[step];assert.ok(run('evaluateCalculation(b,record,collection).error'));}c.b.calculation=Array(9).fill({operation:'add',value:0});assert.ok(run('evaluateCalculation(b,record,collection).error'));c.b.calculation=[{operation:'add',fieldId:'read'}];c.collection.fields[2].name='<script>';c.e=s=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;');const html=run('calculationConfig(b,collection,e)');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<script>'));assert.match(html,/data-calculation-remove/);assert.match(html,/Шаг 1/);
});
