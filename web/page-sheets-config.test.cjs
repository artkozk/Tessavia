const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({structuredClone});
vm.runInContext(fs.readFileSync(__dirname+'/page-sheets.js','utf8').replaceAll('export ',''),context);
const escape = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');

function editor(rows) {
  const block={id:'sheet',kind:'sheet',sheet:{rows}},listeners={},previews=new Map(),options=rows.map(row=>({value:row.id,textContent:row.label}));
  const menuLabels=new Map(rows.map(row=>[`.custom-select-option[data-value="${row.id}"] span`,{textContent:row.label}])),triggerLabel={textContent:rows[0]?.label};
  const control={querySelector:selector=>selector==='.custom-select-trigger span'?triggerLabel:menuLabels.get(selector)};
  const select={value:rows[0]?.id,closest:()=>control};
  options.forEach(option=>option.closest=()=>select);
  const removals=rows.map(row=>({closest:()=>({dataset:{sheetEditRow:row.id}})}));
  let persists=0,draws=0;
  for(const row of rows) {
    const input={dataset:{sheetInput:row.id},value:'',attributes:{'aria-label':row.label},setAttribute(key,value){this.attributes[key]=value;}};
    previews.set(`[data-sheet-row="${row.id}"] label`,{textContent:row.label});
    previews.set(`[data-app-element~="sheetUnit:${row.id}"]`,{textContent:row.unit||''});
    previews.set(`[data-sheet-error="${row.id}"]`,{});
    previews.set(`[data-sheet-result="${row.id}"]`,row.kind==='input'?null:{});
    previews.set(`[data-sheet-input="${row.id}"]`,row.kind==='input'?input:null);
  }
  const preview={innerHTML:'',querySelector:selector=>previews.get(selector)||(['.app-sheet-controls','[data-sheet-conflict]'].includes(selector)?{remove(){}}:null),querySelectorAll:()=>rows.filter(row=>row.kind==='input').map(row=>previews.get(`[data-sheet-input="${row.id}"]`))};
  const add={};
  const config={
    querySelector:selector=>selector==='[data-sheet-config-preview]'?preview:selector==='[data-sheet-row-add]'?add:null,
    querySelectorAll:selector=>selector==='[data-sheet-row-remove]'?removals:selector==='[data-sheet-operand-row] option'?options:[],
    addEventListener(type,handler){(listeners[type]||=[]).push(handler);},
  };
  context.bindSheetConfig({querySelector:()=>config},block,{uid:()=>'',persist:()=>persists++,draw:()=>draws++,e:escape,previewInputs:{sheet:{value:'7'}}});
  function edit(row,key,value) {
    const node={tagName:'INPUT',value,dataset:{sheetRowProperty:key},selectionStart:value.length,closest:()=>({dataset:{sheetEditRow:row.id}}),hasAttribute:attribute=>attribute==='data-sheet-row-property'};
    for(const handler of listeners.input)handler({target:node});
    return node;
  }
  return {block,removals,preview,options,edit,control,select,get persists(){return persists;},get draws(){return draws;}};
}

test('sheet editor disables the last row removal and guards a dispatched click',()=>{
  const rows=[{id:'value',label:'Number',kind:'input'}],h=editor(rows);
  const button=context.sheetConfig(h.block,escape).match(/<button[^>]*data-sheet-row-remove[^>]*>/)[0];
  assert.match(button,/\bdisabled\b/);assert.match(button,/title="[^"]*хотя бы одна строка[^"]*"/);
  h.removals[0].onclick();assert.equal(rows.length,1);assert.equal(h.persists,0);assert.equal(h.draws,0);
  const two=editor([{id:'value',label:'Number',kind:'input'},{id:'second',label:'Second',kind:'input'}]);
  two.removals[1].onclick();assert.equal(two.block.sheet.rows.length,1);assert.equal(two.draws,1);
  two.removals[0].onclick();assert.equal(two.block.sheet.rows.length,1);assert.equal(two.draws,1);
});

test('labels, accessible input names, reference options and units update without replacing editor nodes',()=>{
  const row={id:'value',label:'Old name',unit:'Old unit',kind:'input'},other={id:'other',label:'Other',kind:'input'},h=editor([row,other]);
  const previewInput=h.preview.querySelector('[data-sheet-input="value"]'),schemaBefore=JSON.stringify(h.block.sheet);
  const label='<New & name>',node=h.edit(row,'label',label);
  assert.equal(row.label,label);assert.equal(node.selectionStart,label.length);assert.equal(node.value,label);
  assert.equal(h.preview.querySelector('[data-sheet-row="value"] label').textContent,label);
  assert.equal(previewInput.attributes['aria-label'],label);assert.equal(h.options[0].textContent,label);assert.equal(h.options[0].value,'value');assert.equal(h.options[1].textContent,'Other');
  assert.equal(h.control.querySelector('.custom-select-option[data-value="value"] span').textContent,label);assert.equal(h.control.querySelector('.custom-select-trigger span').textContent,label);
  h.select.value='other';h.control.querySelector('.custom-select-trigger span').textContent='Other';
  h.edit(row,'unit','hours <total>');assert.equal(h.preview.querySelector('[data-app-element~="sheetUnit:value"]').textContent,'hours <total>');
  h.edit(row,'label','');assert.equal(h.options[0].textContent,'Без названия');assert.equal(previewInput.attributes['aria-label'],'');
  assert.equal(h.control.querySelector('.custom-select-option[data-value="value"] span').textContent,'Без названия');assert.equal(h.control.querySelector('.custom-select-trigger span').textContent,'Other');
  assert.equal(h.preview.querySelector('[data-sheet-input="value"]'),previewInput);assert.equal(previewInput.value,'7');
  assert.equal(h.draws,0);assert.equal(h.persists,3);assert.notEqual(JSON.stringify(h.block.sheet),schemaBefore);assert.equal(row.value,undefined);
});

test('schema serialization normalizes comma numbers even when change never fired, without adding preview input',()=>{
  const source={id:'value',label:'Quantity',kind:'input'},price={id:'price',label:'Price',kind:'constant',value:'125.5'},h=editor([source,price]);
  const privateInputs={sheet:{value:'2,5'}};
  h.edit(price,'value','125,5'); // input fires; no blur/change event before Save.
  const definition={version:1,blocks:[h.block,{id:'inactive',kind:'text',sheet:{rows:[{id:'formula',kind:'formula',label:'Dormant formula',start:{value:' +1 234,500000 '},steps:[{operation:'multiply',value:'-0,25'},{operation:'add',rowId:'value'}]}]}}]};
  const before=JSON.stringify(definition),privateBefore=JSON.stringify(privateInputs),normalized=context.normalizeSheetNumbers(definition);
  assert.equal(normalized.blocks[0].sheet.rows[1].value,'125.5');assert.equal(normalized.blocks[1].sheet.rows[0].start.value,'1234.5');assert.equal(normalized.blocks[1].sheet.rows[0].steps[0].value,'-0.25');
  assert.equal(normalized.blocks[1].sheet.rows[0].steps[1].rowId,'value');assert.equal(normalized.blocks[0].sheet.rows[0].value,undefined);
  assert.equal(JSON.stringify(definition),before);assert.equal(JSON.stringify(privateInputs),privateBefore);assert.equal(JSON.stringify(normalized).includes('2,5'),false);
  assert.notEqual(normalized,definition);assert.notEqual(normalized.blocks[0].sheet.rows[0],source);
});

test('invalid schema number reports its row and cannot partially change the draft or embed private input',()=>{
  const definition={blocks:[{id:'sheet',sheet:{rows:[{id:'valid',kind:'constant',label:'Valid',value:'1,25'},{id:'invalid',kind:'formula',label:'Total',start:{value:'0'},steps:[{operation:'add',value:'abc'}]}]}}]},before=JSON.stringify(definition);
  assert.throws(()=>context.normalizeSheetNumbers(definition),/Строка «Total»: Введите число/);assert.equal(JSON.stringify(definition),before);
  const privateDefinition={blocks:[{sheet:{rows:[{id:'private',kind:'input',label:'Private',value:'1234567'}]}}]};
  assert.throws(()=>context.normalizeSheetNumbers(privateDefinition),/Личные числа ввода не входят/);
});
