const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
function fn(name,next){return source.slice(source.indexOf('function '+name+'('),source.indexOf('function '+next+'(',source.indexOf('function '+name+'(')));}
test('required multiple choice accepts any selected checkbox and rejects an empty selection',()=>{
 let change;const inputs=[false,false].map(checked=>({checked,setCustomValidity(value){this.error=value}})),count={};
 const group={dataset:{required:'true'},querySelectorAll:()=>inputs,querySelector:()=>count,addEventListener:(_,fn)=>change=fn};
 const ctx=vm.createContext({});vm.runInContext(fn('bindCollectionMultiFields','openCollectionFormPreview'),ctx);
 ctx.bindCollectionMultiFields({querySelectorAll:()=>[group]});assert.ok(inputs[0].error);
 inputs[1].checked=true;change();assert.equal(inputs[0].error,'');assert.equal(count.textContent,'Выбрано: 1');
 inputs[0].checked=true;change();assert.equal(count.textContent,'Выбрано: 2');
 inputs.forEach(item=>item.checked=false);change();assert.ok(inputs[0].error);
 group.dataset.required='false';change();assert.equal(inputs[0].error,'');
});
test('multiple-choice payload contains stable option IDs for one, several and no choices',()=>{
 const ctx=vm.createContext({CSS:{escape:value=>value}});vm.runInContext(fn('customFieldsFromForm','openCollectionCardDialog'),ctx);
 for(const values of [[],['a'],['b','a']]){
  const form={elements:{namedItem:()=>({})},querySelectorAll:()=>values.map(value=>({value}))};
  assert.equal(JSON.stringify(ctx.customFieldsFromForm(form,[{id:'field',fieldType:'multi_select'}])),JSON.stringify({field:values}));
 }
});
test('template switching updates defaults but preserves custom text and restores the selected preview',()=>{
 let change,events=0;const preview={};
 const templates=[{id:'blank',name:'Свой процесс',description:'Описание основы',cardLabel:'Карточка',stages:[],fields:[]},{id:'sales',name:'Продажи',description:'Воронка',cardLabel:'Сделка',stages:[{name:'Контакт'}],fields:[{name:'Компания'}]},{id:'content',name:'Публикации',description:'Выпуск',cardLabel:'Материал',stages:[],fields:[]}];
 const elements={templateId:{value:'blank',addEventListener:(_,fn)=>change=fn},name:{value:''},description:{value:''},cardLabel:{value:'Карточка'}};
 const form={elements,querySelector:()=>preview,dispatchEvent:()=>events++};
 const ctx=vm.createContext({escapeHTML:value=>value,Event:class{}});
 vm.runInContext(fn('bindCollectionTemplatePicker','openCollectionCreateDialog').replace(/async\s*$/,''),ctx);
 ctx.bindCollectionTemplatePicker(form,templates);
 elements.templateId.value='sales';change();assert.equal(elements.name.value,'Продажи');assert.equal(elements.cardLabel.value,'Сделка');assert.match(preview.innerHTML,/Компания/);
 elements.name.value='Моя команда';elements.description.value='Мой процесс';elements.templateId.value='content';change();
 assert.equal(elements.name.value,'Моя команда');assert.equal(elements.description.value,'Мой процесс');assert.equal(elements.cardLabel.value,'Материал');assert.equal(events,2);
 ctx.bindCollectionTemplatePicker(form,templates);assert.match(preview.innerHTML,/Выпуск/);assert.equal(elements.name.value,'Моя команда');
});
