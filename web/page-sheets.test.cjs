const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const c = vm.createContext({});
vm.runInContext(fs.readFileSync(__dirname+'/page-sheets.js','utf8').replaceAll('export ',''),c);
const number = value => c.parseSheetNumber(value);
const formula = (id,start,steps=[]) => ({id,label:id,kind:'formula',start,steps});
const input = id => ({id,label:id,kind:'input'});
const constant = (id,value) => ({id,label:id,kind:'constant',value});

test('decimal parsing preserves six places, signs and boundaries without binary float',()=>{
  assert.equal(number(' +1 200,300001 '),1200300001n);
  assert.equal(c.sheetDecimal(number('-000.010000')),'-0.01');
  assert.equal(c.sheetDecimal(number('-0')),'0');
  assert.equal(number('1000000000000'),1000000000000000000n);
  for(const bad of ['',null,'NaN','Infinity','1e3','0.0000001','1000000000000.000001','-1000000000001','1.2.3'])assert.throws(()=>number(bad));
});
test('a sheet chains other results, preserves source input and exact decimal addition',()=>{
 const sheet={rows:[input('price'),input('quantity'),formula('total',{rowId:'price'},[{operation:'multiply',rowId:'quantity'}]),constant('advance','0.1'),formula('due',{rowId:'total'},[{operation:'subtract',rowId:'advance'}])]};
 const values={price:'0.1',quantity:'3'},before=JSON.stringify({sheet,values}),r=c.evaluateSheet(sheet,values);
 assert.equal(c.sheetDecimal(r.get('total').value),'0.3');assert.equal(c.sheetDecimal(r.get('due').value),'0.2');assert.equal(JSON.stringify({sheet,values}),before);
});
test('display precision never becomes an intermediate dependency value',()=>{
 const sheet={rows:[constant('a','1'),formula('third',{rowId:'a'},[{operation:'divide',value:'3'}]),formula('again',{rowId:'third'},[{operation:'multiply',value:'3'}])]};sheet.rows[1].precision=2;
 const r=c.evaluateSheet(sheet);assert.equal(c.formatSheetNumber(r.get('third').value,2),'0,33');assert.equal(c.sheetDecimal(r.get('again').value),'0.999999');
 assert.equal(c.formatSheetNumber(number('1.005'),2),'1,01');assert.equal(c.formatSheetNumber(number('-1.005'),2),'−1,01');
});
test('six-place division and multiplication round halves away from zero',()=>{
 for(const [start,expected] of [['0.000001','0.000001'],['-0.000001','-0.000001']]){
  const r=c.evaluateSheet({rows:[formula('x',{value:start},[{operation:'divide',value:'2'}])]});assert.equal(c.sheetDecimal(r.get('x').value),expected);
 }
 const r=c.evaluateSheet({rows:[formula('x',{value:'0.000001'},[{operation:'multiply',value:'0.5'}])]});assert.equal(r.get('x').value,1n);
});
test('missing input, missing references and zero division show errors, never invented zeros',()=>{
 const r=c.evaluateSheet({rows:[input('a'),formula('b',{rowId:'a'},[{operation:'add',value:'2'}]),formula('c',{rowId:'gone'}),formula('d',{value:'1'},[{operation:'divide',value:'0'}])]});
 for(const id of ['a','b','c','d'])assert.ok(r.get(id).error);
 assert.equal(c.evaluateSheet({rows:[input('a')]},{a:'0'}).get('a').value,0n);
});
test('cycles, unknown operations, duplicate operands and intermediate overflow fail explicitly',()=>{
 const r=c.evaluateSheet({rows:[formula('a',{rowId:'b'}),formula('b',{rowId:'a'}),formula('op',{value:'1'},[{operation:'execute',value:'2'}]),formula('operand',{rowId:'a',value:'1'}),formula('overflow',{value:'1000000000000'},[{operation:'add',value:'1'},{operation:'subtract',value:'1'}])]});
 for(const id of ['a','b','op','operand','overflow'])assert.ok(r.get(id).error);
 assert.match(r.get('a').error,/Циклическая/);
});
test('ordered steps and min/max support floors, caps and adjustable percentages',()=>{
 const rows=[formula('x',{value:'20'},[{operation:'subtract',value:'5'},{operation:'multiply',value:'0.4'},{operation:'max',value:'8'},{operation:'min',value:'9'}])];
 assert.equal(c.evaluateSheet({rows}).get('x').value,number('8'));
 rows[0].steps=Array.from({length:13},()=>({operation:'add',value:'0'}));assert.ok(c.evaluateSheet({rows}).get('x').error);
});
test('new sheet has no initial private input and markup escapes editable labels',()=>{
 let i=0;const sheet=c.initialSheet(()=>`r${++i}`);assert.equal(sheet.rows[0].kind,'input');assert.equal(sheet.rows[0].value,undefined);assert.equal(sheet.rows[1].start.rowId,sheet.rows[0].id);
 const e=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');sheet.rows[0].label='<img src=x>';sheet.rows[0].unit='" onclick="x';
 const html=c.sheetMarkup({id:'block',sheet},e,true);assert.ok(html.includes('&lt;img'));assert.ok(html.includes('&quot;'));assert.ok(html.includes('disabled'));assert.ok(!html.includes('data-sheet-save'));
});
