const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8');

test('question UI does not count a former participant in place of a current answer',()=>{
 const ctx=vm.createContext({state:{users:[{id:1},{id:2},{id:4}]},icon:()=>'',escapeHTML:s=>String(s).replaceAll('<','&lt;'),renderFounderAnswer:()=>'',renderDecisionComposer:()=>'<div>READY</div>',renderJointDecision:()=>''});
 vm.runInContext(source.slice(source.indexOf('function renderQuestionItem('),source.indexOf('function renderMissingFounder(')),ctx);
 const question={id:'q',body:'Test',activeAnswerCount:2,answers:[{authorId:1},{authorId:2},{authorId:3,authorUsername:'former',content:'Historical answer'}]};
 const blocked=ctx.renderQuestionItem(question,0,3);
 assert.match(blocked,/2 из 3 ответов/);assert.doesNotMatch(blocked,/READY/);assert.match(blocked,/Historical answer/);
 question.activeAnswerCount=3;question.answers.push({authorId:4});
 assert.match(ctx.renderQuestionItem(question,0,3),/READY/);
});

test('invalid calendar ranges are rejected before saving; undated and same-day plans remain valid',()=>{
 const ctx=vm.createContext({});
 vm.runInContext(source.slice(source.indexOf('function personalPlanDateError('),source.indexOf('function openPersonalEditor(')),ctx);
 const check=values=>ctx.personalPlanDateError({get:key=>values[key]||''});
 assert.equal(check({dateMode:'block',startsAt:'2026-09-08T11:00',endsAt:'2026-09-08T10:00'}).field,'endsAt');
 assert.equal(check({dateMode:'block',startsAt:'2026-09-08T11:00',endsAt:'2026-09-08T11:00'}).field,'endsAt');
 assert.equal(check({dateMode:'block',startsAt:'2026-09-08T11:00',endsAt:'2026-09-08T12:00'}),null);
 assert.equal(check({dateMode:'block',startsAt:'',endsAt:''}).field,'startsAt');
 assert.equal(check({dateMode:'days',startDate:'2026-09-08',endDate:'2026-09-07'}).field,'endDate');
 assert.equal(check({dateMode:'days',startDate:'2026-09-08',endDate:'2026-09-08'}),null);
 assert.equal(check({dateMode:'none'}),null);
 assert.equal(check({recurrenceCadence:'weekly',recurrenceStartDate:'2026-09-08',recurrenceUntilDate:'2026-09-07'}).field,'recurrenceUntilDate');
});

function aiHarness() {
 class Field {
  constructor(value='') {this.value=value;this.dataset={};this.events={};this.tagName='INPUT';}
  addEventListener(name,handler){(this.events[name]??=[]).push(handler);}
  dispatchEvent(event){return Promise.all((this.events[event.type]||[]).map(handler=>handler(event)));}
 }
 const fields=Object.fromEntries(Object.entries({title:'Test task',description:'',priority:'normal',workstream:'business',parentId:'',estimateMinutes:'0',isRoot:''}).map(([key,value])=>[key,new Field(value)]));
 fields.isRoot.type='checkbox';fields.isRoot.checked=false;
 const button=new Field(),status=new Field(),form={elements:fields,isConnected:true};let resolveRequest,calls=0;
 const suggestion={priority:'high',workstream:'platform',estimateMinutes:60,parentId:'parent',reason:'test'};
 const ctx=vm.createContext({Event:class{constructor(type){this.type=type;}},$:selector=>selector==='[data-ai-suggest]'?button:status,api:()=>{calls++;return new Promise(resolve=>{resolveRequest=resolve;});},state:{records:[{id:'parent',title:'Parent'}]},syncCustomSelect(){},priorityLabels:{high:'High'},workstreamLabels:{platform:'Platform'},minutesLabel:String});
 vm.runInContext(source.slice(source.indexOf('function bindCreateSuggestion('),source.indexOf('function actionLabel(')),ctx);
 ctx.bindCreateSuggestion(form,'task');
 return {fields,button,status,form,calls:()=>calls,resolve:()=>resolveRequest(suggestion),click:()=>button.dispatchEvent({type:'click'}),input:field=>fields[field].dispatchEvent({type:'input'})};
}

test('AI preview never changes the draft until explicitly applied',async()=>{
 const h=aiHarness();
 await h.input('title');assert.equal(h.calls(),0);
 const request=h.click();h.resolve();await request;
 assert.equal(h.fields.estimateMinutes.value,'0');assert.equal(h.fields.parentId.value,'');assert.equal(h.fields.priority.value,'normal');
 assert.equal(h.button.textContent,'Применить предложение');
 await h.click();assert.equal(h.fields.estimateMinutes.value,60);assert.equal(h.fields.parentId.value,'parent');
});

test('a late AI response cannot apply to edited text or overwrite a manual choice',async()=>{
 const h=aiHarness();const request=h.click();
 h.fields.title.value='Different task';await h.input('title');h.resolve();await request;
 assert.equal(h.fields.estimateMinutes.value,'0');assert.equal(h.button.textContent,'Предложить');
 const next=h.click();h.resolve();await next;
 h.fields.priority.value='critical';await h.input('priority');
 assert.equal(h.button.textContent,'Предложить');assert.equal(h.fields.priority.value,'critical');assert.equal(h.fields.estimateMinutes.value,'0');
});
