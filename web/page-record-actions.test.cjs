const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const c=vm.createContext({});vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'page-record-actions.js'),'utf8').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'page-action-conditions.js'),'utf8').replaceAll('export ',''),c);
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


test('conditions match the shared server cases including empty, zero, sets and time zones',()=>{
 const cases=JSON.parse(fs.readFileSync(require('node:path').join(__dirname,'page-action-condition-cases.json'),'utf8'));
 for(const [index,item] of cases.entries()){
  c.rule={fieldId:'field',operator:item.operator,value:item.value};c.record={customFields:{field:item.current}};c.fields=[{id:'field',fieldType:item.kind}];
  assert.equal(run('conditionMatches(rule,record,fields)'),item.expected,'case '+index);
 }
});
test('unavailable action remains visible with escaped explanation',()=>{
 c.collection={fields:[{id:'hours',name:'<b>Hours</b>',fieldType:'number'}]};c.block={actions:[{id:'reset',label:'Reset',condition:{fieldId:'hours',operator:'gt',value:0}}]};c.record={id:'record',title:'Request',customFields:{hours:0}};c.display=(_field,value)=>String(value);
 const html=run('recordActionMenu(block,record,e,collection,display)');assert.match(html,/disabled/);assert.ok(html.includes('&lt;b&gt;Hours'));assert.ok(html.includes('больше: 0'));
});


test('numeric action editor exposes arithmetic without offering it for text fields',()=>{
 c.block={actions:[{id:'one',label:'One more',fieldId:'n',operation:'add',value:1}]};c.collection={fields:[{id:'n',name:'Count',fieldType:'number'}]};c.input=(field,value)=>field.name+':'+value;
 let html=run('recordActionConfig(block,collection,e,input)');assert.match(html,/data-action-operation/);assert.match(html,/Сколько прибавить:1/);assert.match(html,/Отрицательное число/);
 c.collection.fields[0].fieldType='text';html=run('recordActionConfig(block,collection,e,input)');assert.ok(html.includes('Взять из другого поля'));assert.ok(!html.includes('Прибавить к текущему'));
});
test('switching action modes and fields resets operand while preserving independent condition',()=>{
 c.action={id:'one',fieldId:'n',operation:'set',value:42,condition:{fieldId:'n',operator:'lt',value:10}};c.block={actions:[c.action]};c.collection={fields:[{id:'n',fieldType:'number'},{id:'t',fieldType:'text'}]};
 c.input={value:'add',closest:selector=>selector==='[data-record-action]'?{dataset:{recordAction:'one'}}:null,hasAttribute:attr=>attr==='data-action-operation'};
 run('updateActionProperty(input,block,collection)');assert.equal(c.action.operation,'add');assert.equal(c.action.value,1);assert.equal(c.action.condition.value,10);
 c.input.value='t';c.input.hasAttribute=attr=>attr==='data-action-field';run('updateActionProperty(input,block,collection)');assert.equal(c.action.operation,'set');assert.equal(c.action.value,null);
});
test('copy choices are type-compatible and exclude self, options and cross-type coercion',()=>{
 c.collection={fields:[{id:'n',fieldType:'number'},{id:'m',fieldType:'money'},{id:'t',fieldType:'text'},{id:'l',fieldType:'long_text'},{id:'s',fieldType:'select'},{id:'u',fieldType:'user'},{id:'c',fieldType:'checkbox'},{id:'c2',fieldType:'checkbox'}]};
 assert.equal(JSON.stringify(run('compatibleActionSourceFields(collection,collection.fields[0]).map(f=>f.id)')),'["m"]');assert.equal(JSON.stringify(run('compatibleActionSourceFields(collection,collection.fields[2]).map(f=>f.id)')),'["l"]');assert.equal(run('compatibleActionSourceFields(collection,collection.fields[4]).length'),0);
 assert.equal(JSON.stringify(run('compatibleActionSourceFields(collection,collection.fields[6]).map(f=>f.id)')),'["c2"]');
});
test('copy editor replaces literal input, stores source and clears it on another mode',()=>{
 c.action={id:'a',fieldId:'n',label:'Copy',operation:'set',value:4};c.block={actions:[c.action]};c.collection={fields:[{id:'n',name:'Target',fieldType:'number'},{id:'s',name:'<b>Source</b>',fieldType:'number'}]};
 c.input={value:'copy',closest:sel=>sel==='[data-record-action]'?{dataset:{recordAction:'a'}}:null,hasAttribute:attr=>attr==='data-action-operation'};run('updateActionProperty(input,block,collection)');assert.equal(c.action.sourceFieldId,'s');assert.equal(c.action.value,null);
 c.fieldInput=()=>'<input data-literal>';const html=run('recordActionConfig(block,collection,e,fieldInput)');assert.ok(html.includes('data-action-source-field'));assert.ok(!html.includes('data-literal'));assert.ok(html.includes('&lt;b&gt;Source'));
 c.input.value='set';run('updateActionProperty(input,block,collection)');assert.equal(c.action.sourceFieldId,undefined);
});

test('compound editor keeps independent values and condition when editing a later field',()=>{
 c.action={id:'a',label:'Approve',fieldId:'n',operation:'copy',sourceFieldId:'s',condition:{fieldId:'s',operator:'not_empty'},changes:[{fieldId:'flag',value:false}]};c.block={actions:[c.action]};c.collection={fields:[{id:'n',fieldType:'number'},{id:'s',fieldType:'number'},{id:'flag',fieldType:'checkbox'}]};
 const change={dataset:{actionChange:'1'},querySelector:()=>({querySelectorAll:()=>[{checked:true}]})};
 c.input={closest:sel=>sel==='[data-record-action]'?{dataset:{recordAction:'a'}}:sel==='[data-action-change]'?change:null,hasAttribute:()=>false};
 run('updateActionProperty(input,block,collection)');assert.equal(c.action.changes[0].value,true);assert.equal(c.action.sourceFieldId,'s');assert.equal(c.action.condition.fieldId,'s');
});
test('removing first change promotes next without losing button identity or condition',()=>{
 c.action={id:'a',label:'Approve',fieldId:'n',operation:'copy',sourceFieldId:'s',condition:{fieldId:'s',operator:'not_empty'},changes:[{fieldId:'flag',value:false},{fieldId:'count',operation:'add',value:1}]};
 assert.equal(run('removeActionChange(action,0)'),true);assert.equal(c.action.fieldId,'flag');assert.equal(c.action.sourceFieldId,undefined);assert.equal(c.action.value,false);assert.equal(c.action.id,'a');assert.equal(c.action.condition.fieldId,'s');assert.equal(c.action.changes.length,1);
 run('removeActionChange(action,1)');assert.equal(run('removeActionChange(action,0)'),false);assert.equal(c.action.fieldId,'flag');
});

test('condition groups agree on all/any with zero and false and fail closed on invalid groups',()=>{
 c.fields=[{id:'n',fieldType:'number'},{id:'flag',fieldType:'checkbox'}];c.record={customFields:{n:0,flag:false}};c.group={mode:'all',conditions:[{fieldId:'n',operator:'gt',value:0},{fieldId:'flag',operator:'eq',value:false}]};
 assert.equal(run('conditionMatches(group,record,fields)'),false);c.group.mode='any';assert.equal(run('conditionMatches(group,record,fields)'),true);c.record.customFields.flag=true;assert.equal(run('conditionMatches(group,record,fields)'),false);
 c.group.conditions=[];assert.equal(run('conditionMatches(group,record,fields)'),false);c.group={mode:'all',conditions:[{mode:'any',conditions:[]}]};assert.equal(run('conditionMatches(group,record,fields)'),false);
});
test('editing and removing group conditions preserves independent rules then explicitly clears the last',()=>{
 c.action={condition:{mode:'any',conditions:[{fieldId:'n',operator:'gt',value:0},{fieldId:'flag',operator:'eq',value:false}]}};c.collection={fields:[{id:'n',fieldType:'number'},{id:'flag',fieldType:'checkbox'}]};
 const row={dataset:{conditionIndex:'1'},querySelector:()=>({querySelectorAll:()=>[{checked:true}]})};c.input={closest:sel=>sel==='[data-condition-editor]'?{}:sel==='[data-condition-index]'?row:null,hasAttribute:()=>false};
 run('updateConditionProperty(input,action,collection,readActionValue)');assert.equal(c.action.condition.conditions[1].value,true);assert.equal(c.action.condition.conditions[0].value,0);
 run('removeActionCondition(action,0)');assert.equal(c.action.condition.fieldId,'flag');assert.equal(c.action.condition.mode,undefined);run('removeActionCondition(action,0)');assert.equal(c.action.condition,undefined);
});
test('group review lists all checks and escapes field labels',()=>{
 c.value={condition:{mode:'any',conditions:[{fieldId:'n',operator:'gt',value:0},{fieldId:'flag',operator:'eq',value:false}]},conditionFields:[{id:'n',name:'<b>Estimate</b>',fieldType:'number'},{id:'flag',name:'Ready',fieldType:'checkbox'}],conditionResults:[false,true]};c.display=(_,v)=>String(v);
 const html=run('conditionReview(value,e,display)');assert.ok(html.includes('Достаточно любого'));assert.ok(html.includes('Не выполнено'));assert.ok(html.includes('Выполнено'));assert.ok(html.includes('&lt;b&gt;Estimate'));assert.ok(!html.includes('<b>Estimate'));
});
