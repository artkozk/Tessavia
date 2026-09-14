const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),moduleSource=fs.readFileSync(path.join(__dirname,'personal-plan-references.js'),'utf8').replaceAll('export ','');
const fragment=(a,b)=>app.slice(app.indexOf(a),app.indexOf(b));
const esc=value=>String(value??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
const unesc=value=>String(value).replaceAll('&quot;','"').replaceAll('&lt;','<').replaceAll('&gt;','>').replaceAll('&amp;','&');
function fixture(){
 const plan={id:'child',title:'Fix car',notes:'Original notes',projectId:'old-project',goalId:'old-goal',parentId:'old-parent',itemKind:'task',status:'planned',updatedAt:'version-1'};
 return {plan,personal:{projects:[{id:'active-project',title:'Current project',status:'planned'}],goals:[{id:'active-goal',title:'Current goal',status:'planned'}],plans:[plan,{id:'active-parent',title:'Current parent',status:'planned'},{id:'done-parent',title:'Completed parent',status:'done'}],historicalReferences:{projects:[{id:'old-project',title:'My archived project'},{id:'other-archive',title:'Unrelated archive'}],goals:[{id:'old-goal',title:'My archived goal'}],parents:[{id:'old-parent',title:'My archived parent'}]}}};
}
function moduleContext(extra={}){const ctx=vm.createContext({Event,...extra});vm.runInContext(moduleSource,ctx);return ctx;}

test('only the current historical relationship is included alongside ordinary active choices',()=>{
 const ctx=moduleContext(),{personal,plan}=fixture();
 for(const kind of ['project','goal','parent']){
  const html=ctx.personalPlanReferenceOptions(personal,plan,kind,esc);
  assert.match(html,new RegExp(`value="old-${kind}" selected`));assert.match(html,/в архиве/);assert.match(html,new RegExp(`value="active-${kind}"`));assert.doesNotMatch(html,/Unrelated archive|done-parent|value="child"/);
  assert.doesNotMatch(ctx.personalPlanReferenceOptions(personal,{},kind,esc),/old-|archive|в архиве/);
 }
 plan.parentId='done-parent';const completed=ctx.personalPlanReferenceOptions(personal,plan,'parent',esc);assert.match(completed,/value="done-parent" selected/);assert.match(completed,/завершено/);
});

test('unavailable IDs are retained without inventing titles and cannot pass validation until explicitly changed',()=>{
 const ctx=moduleContext(),{personal,plan}=fixture();plan.parentId='foreign-parent';
 const html=ctx.personalPlanReferenceOptions(personal,plan,'parent',esc);assert.match(html,/value="foreign-parent" selected/);assert.match(html,/Недоступная связь/);
 assert.equal(ctx.personalPlanReferenceError(personal,plan,plan).field,'parentId');
 assert.equal(ctx.personalPlanReferenceError(personal,plan,{...plan,parentId:''}),null);
 assert.equal(ctx.personalPlanReferenceError(personal,plan,{...plan,parentId:'active-parent'}),null);
 assert.equal(ctx.personalPlanReferenceError(personal,plan,{...plan,parentId:'active-parent',projectId:'other-archive'}).field,'projectId');
 assert.equal(ctx.personalPlanReferenceError(personal,{}, {projectId:'old-project'}).field,'projectId');
});

test('details label archived relationships without links to unavailable editors and escape long names',()=>{
 const ctx=moduleContext(),{personal,plan}=fixture();personal.historicalReferences.projects[0].title='<script>private</script>'+'VeryLong'.repeat(100);
 const html=ctx.personalPlanReferenceDetails(personal,plan,esc,()=>'<i></i>');assert.equal((html.match(/data-personal-reference-state="archived"/g)||[]).length,3);assert.doesNotMatch(html,/<button|data-personal-edit|data-plan-parent|<script>/);assert.match(html,/&lt;script&gt;/);
 plan.parentId='foreign-parent';const unavailable=ctx.personalPlanReferenceDetails(personal,plan,esc,()=> '');assert.match(unavailable,/data-personal-reference-state="unavailable"/);assert.doesNotMatch(unavailable,/foreign-parent/);
 plan.projectId='active-project';plan.goalId='active-goal';plan.parentId='done-parent';const active=ctx.personalPlanReferenceDetails(personal,plan,esc,()=> '');assert.match(active,/data-personal-edit="project"/);assert.match(active,/data-personal-edit="goal"/);assert.match(active,/data-plan-parent="done-parent"/);assert.match(active,/Завершено/);
});

// Model native single-select behavior: assigning an absent value loses selection.
// This is the failure which used to silently detach a restored relationship.
function field(name,value='',options=null){
 const item={name,type:options?'select-one':'text',tagName:options?'SELECT':'INPUT',options:options||[],dataset:{},classList:{contains:()=>false},listeners:{},disabled:false,ownerDocument:documentModel,setCustomValidity(message){this.validationMessage=message;},focus(){this.focused=true;},addEventListener(type,fn){const previous=this.listeners[type];this.listeners[type]=previous?(...args)=>{previous(...args);fn(...args);}:fn;},hasAttribute(attr){return attr==='data-personal-plan-reference'&&['projectId','goalId','parentId'].includes(name);},append(option){this.options.push(option);},closest(){return null;}};
 let selected='';Object.defineProperty(item,'value',{get:()=>selected,set:next=>{next=String(next);selected=options&&!item.options.some(option=>option.value===next)?'':next;}});item.value=value;return item;
}
const documentModel={createElement(tag){if(tag==='option')return {value:'',textContent:''};const buttons={};for(const action of ['review','discard','refresh'])buttons[`[data-personal-plan-${action}-draft]`]={focus(){this.focused=true;}};return{tagName:tag,innerHTML:'',querySelector(selector){return this.innerHTML.includes(selector.slice(1,-1))?buttons[selector]:null;},remove(){this.removed=true;},button:buttons['[data-personal-plan-review-draft]'],buttons};}};
function parseForm(html){
 const elements={},notices={};
 for(const match of html.matchAll(/<(input|textarea|select)\b([^>]*)(?:>([\s\S]*?)<\/\1>|>)/g)){
  const [,tag,attrs,body='']=match,name=attrs.match(/\bname="([^"]+)"/)?.[1];if(!name)continue;
  const options=tag==='select'?[...body.matchAll(/<option\b([^>]*)>([\s\S]*?)<\/option>/g)].map(([,attrs,text])=>({value:unesc(attrs.match(/value="([^"]*)"/)?.[1]||''),textContent:unesc(text),selected:/\bselected\b/.test(attrs)})):null;
  const value=options?(options.find(option=>option.selected)||options[0])?.value||'':tag==='textarea'?unesc(body):unesc(attrs.match(/value="([^"]*)"/)?.[1]||'');elements[name]=field(name,value,options);if(tag==='input')elements[name].type=attrs.match(/type="([^"]*)"/)?.[1]||'text';
 }
 for(const kind of ['project','goal','parent'])notices[kind]={textContent:'',hidden:true};
 const form={elements,panels:[],listeners:{},isConnected:true,ownerDocument:documentModel,prepend(panel){this.panels.unshift(panel);},dispatchEvent(event){this.listeners[event.type]?.(event);},addEventListener(type,fn){this.listeners[type]=fn;},querySelector(selector){const kind=selector.match(/data-personal-reference-notice="([^"]+)"/)?.[1];if(kind)return notices[kind];if(selector==='.personal-plan-draft-review')return this.panels.find(panel=>!panel.removed)||null;return this.panels.find(panel=>!panel.removed)?.querySelector(selector)||null;}};
 return form;
}

test('the actual draft applier keeps absent personal reference IDs and the draft serializer preserves them',()=>{
 const ctx=moduleContext({CSS:{escape:x=>x},state:{},escapeHTML:esc,syncCustomSelect(){},$$:(selector,root)=>selector==='[name]'?Object.values(root.elements):selector==='[data-notebook]'?[]:[root.elements[selector.match(/name="([^"]+)"/)?.[1]]].filter(Boolean)});
 vm.runInContext(fragment('function workingDraftValues(', 'function loadWorkingDraft(')+fragment('function applyWorkingDraft(', 'function bindWorkingDraft('),ctx);
 const form={elements:{parentId:field('parentId','',[{value:'',textContent:'None'}]),expectedUpdatedAt:field('expectedUpdatedAt','server-new-version')}};form.elements.expectedUpdatedAt.type='hidden';
 ctx.applyWorkingDraft(form,{parentId:'unavailable-draft-parent',expectedUpdatedAt:'original-draft-version'});assert.equal(form.elements.parentId.value,'unavailable-draft-parent');assert.match(form.elements.parentId.options[1].textContent,/Связь из черновика недоступна/);assert.equal(ctx.workingDraftValues(form).parentId,'unavailable-draft-parent');assert.equal(ctx.workingDraftValues(form).expectedUpdatedAt,'original-draft-version');
 form.elements.expectedUpdatedAt.value='';assert.equal(ctx.workingDraftValues(form).expectedUpdatedAt,'','an unreviewed legacy draft must not acquire a current version when persisted');
});

test('reference notices explain retained archives and disappear only after a deliberate available choice',()=>{
 const {personal,plan}=fixture(),ctx=moduleContext({state:{personal},escapeHTML:esc,personalRecurrenceFields:()=>''});vm.runInContext(fragment('function personalPlanContextFields(', 'function personalPlanDateError('),ctx);
 const form=parseForm(ctx.personalPlanContextFields(plan));ctx.bindPersonalPlanReferenceFields(form,personal,plan);
 const project=form.elements.projectId,notice=form.querySelector('[data-personal-reference-notice="project"]');assert.equal(project.value,'old-project');assert.match(notice.textContent,/В архиве/);assert.equal(project.validationMessage,'');
 project.value='active-project';project.listeners.change();assert.match(notice.textContent,/«Без проекта» сохранит проект цели/);assert.equal(form.elements.goalId.value,'old-goal');
 form.elements.goalId.value='';form.elements.goalId.listeners.change();assert.equal(notice.hidden,true);
 project.value='';project.listeners.change();assert.equal(notice.hidden,true);assert.equal(project.value,'');
});

function editorHarness({draft=null,planPatch={}}={}){
 const {personal,plan}=fixture();Object.assign(plan,planPatch);const state={me:{id:1},activeWorkspaceId:'personal',view:'personal:plans',personal},dialog={open:false},calls=[],toasts=[],opened=[],counts={cleared:0,closed:0,loaded:0};let form;
 const content={set innerHTML(html){this.html=html;if(form)form.isConnected=false;form=parseForm(html);},get innerHTML(){return this.html;}};
 const submit={disabled:false},$=(selector,root)=>selector==='#personal-dialog'?dialog:selector==='#personal-dialog-content'?content:selector==='#personal-editor-form'?form:selector==='button[type="submit"]'?submit:root?.querySelector?.(selector)||null;
 const ctx=moduleContext({state,Event,Intl,Date,Number,escapeHTML:esc,icon:()=>'',document:documentModel,FormData:class{constructor(form){this.values=Object.fromEntries(Object.entries(form.elements).map(([key,field])=>[key,field.value]));}get(key){return this.values[key]??null;}},$: $, $$:()=>[],findPersonalItem:(_kind,id)=>state.personal.plans.find(item=>item.id===id),personalNoteSheet:item=>`<input name="title" value="${esc(item.title)}"><textarea name="notes">${esc(item.body)}</textarea>`,personalPlanDateFields:()=>'<select name="dateMode"><option value="none">Без даты</option></select><input name="colorKey" value="green">',personalRecurrenceFields:()=>'<select name="recurrenceCadence"><option value="none">Нет</option></select>',personalPlanDateLabel:()=> 'Без даты',bindPersonalPlanDates(){},bindPersonalRecurrenceScope(){},bindMarkdownEditors(){},bindPersonalNoteSheet:()=>()=>{},loadWorkingDraft:()=>draft,bindWorkingDraft(root){if(draft?.values)for(const [key,value]of Object.entries(draft.values)){const input=root.elements[key];if(!input)continue;if(input.hasAttribute('data-personal-plan-reference'))ctx.restorePersonalPlanReferenceChoice(input,value);input.value=value;}},flushDialogDrafts:()=>{draft={values:Object.fromEntries(Object.entries(form.elements).map(([key,input])=>[key,input.value]))};return true;},openModal:()=>dialog.open=true,requestAnimationFrame:fn=>fn(),api:(url,options)=>new Promise((resolve,reject)=>calls.push({url,options,resolve,reject})),toast:(...args)=>toasts.push(args),clearWorkingDraftFor:()=>{counts.cleared++;draft=null;},requestDialogClose:async()=>{counts.closed++;dialog.open=false;return true;},loadPersonal:async()=>{counts.loaded++;},openPersonalPlanDetails:id=>opened.push(id)});
 vm.runInContext(fragment('function personalPlanContextFields(', 'function personalPlanDateError(')+fragment('function personalPlanDateError(', 'function openPersonalLinkDialog('),ctx);
 ctx.openPersonalEditor('plan',plan.id);
 return{ctx,state,plan,personal,dialog,content,calls,toasts,opened,counts,get form(){return form;},send:()=>form.listeners.submit({preventDefault(){}})};
}

test('actual editor PATCH retains all archived IDs while editing the title and uses the stored draft CAS',async()=>{
 const h=editorHarness({draft:{values:{title:'Changed title',expectedUpdatedAt:'version-1',projectId:'old-project',goalId:'old-goal',parentId:'old-parent'}}});
 const sending=h.send();await Promise.resolve();const body=JSON.parse(h.calls[0].options.body);assert.equal(body.title,'Changed title');assert.equal(body.projectId,'old-project');assert.equal(body.goalId,'old-goal');assert.equal(body.parentId,'old-parent');assert.equal(body.expectedUpdatedAt,'version-1');assert.equal(h.calls[0].options.headers['X-Outbox-Owner'],'1');
 h.calls[0].reject(Object.assign(new Error('Updated elsewhere'),{status:409}));await sending;assert.equal(h.counts.cleared,0);assert.equal(h.counts.closed,0);assert.equal(h.form.elements.expectedUpdatedAt.value,'version-1');assert.equal(h.form.elements.title.value,'Changed title');
});

test('actual editor refuses an unavailable relationship until explicitly removed, then sends the empty ID',async()=>{
 const h=editorHarness({planPatch:{parentId:'foreign-parent'}});assert.equal(h.form.elements.parentId.value,'foreign-parent');await h.send();assert.equal(h.calls.length,0);assert.match(h.toasts.at(-1)[0],/связь недоступна/);
 h.form.elements.parentId.value='';h.form.elements.parentId.listeners.change();const sending=h.send();await Promise.resolve();assert.equal(JSON.parse(h.calls[0].options.body).parentId,'');h.calls[0].resolve({id:h.plan.id});await sending;assert.equal(h.counts.cleared,1);
});

test('legacy drafts without a version require an explicit comparison and remain unversioned until accepted',async()=>{
 for(const version of [undefined,'']){
  const values={title:'Old unsaved title',notes:'Old unsaved notes',...(version===undefined?{}:{expectedUpdatedAt:version})},h=editorHarness({draft:{values}});
  assert.equal(h.form.elements.expectedUpdatedAt.value,'');assert.equal(h.form.elements.title.value,'Old unsaved title');assert.match(h.form.panels[0].innerHTML,/Original notes/);assert.match(h.form.panels[0].innerHTML,/My archived project/);
  await h.send();assert.equal(h.calls.length,0);assert.equal(h.form.elements.expectedUpdatedAt.value,'');
  h.form.panels[0].button.onclick();assert.equal(h.form.elements.expectedUpdatedAt.value,'version-1');const sending=h.send();await Promise.resolve();assert.equal(JSON.parse(h.calls[0].options.body).expectedUpdatedAt,'version-1');h.calls[0].reject(Object.assign(new Error('Still conflicted'),{status:409}));await sending;assert.equal(h.counts.cleared,0);
 }
});

test('legacy comparison and late editor replies cannot affect another owner workspace route or dialog',async()=>{
 for(const scope of ['owner','workspace','route','dialog']){
  const h=editorHarness({draft:{values:{title:'Old draft'}}}),accept=h.form.panels[0].button.onclick;
  if(scope==='owner')h.state.me={id:2};if(scope==='workspace')h.state.activeWorkspaceId='other';if(scope==='route')h.state.view='elsewhere';if(scope==='dialog')h.form.isConnected=false;
  accept();assert.equal(h.form.elements.expectedUpdatedAt.value,'');await h.send();assert.equal(h.calls.length,0);
  const late=editorHarness(),sending=late.send();await Promise.resolve();if(scope==='owner')late.state.me={id:2};if(scope==='workspace')late.state.activeWorkspaceId='other';if(scope==='route')late.state.view='elsewhere';if(scope==='dialog')late.form.isConnected=false;
  late.calls[0].resolve({id:late.plan.id});await sending;assert.equal(late.counts.cleared,0);assert.equal(late.counts.closed,0);assert.equal(late.counts.loaded,0);assert.equal(late.opened.length,0);
 }
});

test('a known stale draft requires explicit comparison, accepts only the displayed version, or can be discarded',async()=>{
 const h=editorHarness({draft:{values:{title:'My earlier draft',expectedUpdatedAt:'version-0'}}});
 assert.equal(h.form.elements.expectedUpdatedAt.value,'version-0');assert.match(h.form.panels[0].innerHTML,/После создания черновика дело изменилось/);
 await h.send();assert.equal(h.calls.length,0);
 h.plan.updatedAt='version-2';h.form.panels[0].button.onclick();assert.equal(h.form.elements.expectedUpdatedAt.value,'version-1','acceptance uses the version shown when the comparison was rendered');
 const sending=h.send();await Promise.resolve();assert.equal(JSON.parse(h.calls[0].options.body).expectedUpdatedAt,'version-1');h.calls[0].reject(Object.assign(new Error('Changed again'),{status:409}));await sending;
 assert.equal(h.form.elements.title.value,'My earlier draft');assert.equal(h.counts.cleared,0);
 const discard=editorHarness({draft:{values:{title:'My earlier draft',expectedUpdatedAt:'version-0'}}}),oldForm=discard.form;
 oldForm.querySelector('[data-personal-plan-discard-draft]').onclick();assert.equal(discard.counts.cleared,1);assert.equal(oldForm.isConnected,false);assert.equal(discard.form.elements.title.value,'Fix car');assert.equal(discard.form.elements.expectedUpdatedAt.value,'version-1');assert.equal(discard.form.personalPlanReviewRequired,undefined);assert.equal(discard.calls.length,0);
});

test('a real 409 can refresh, compare, and submit the preserved draft without closing the editor',async()=>{
 const h=editorHarness();h.form.elements.title.value='My unsaved change';
 let sending=h.send();await Promise.resolve();assert.equal(h.form.inert,true);h.calls[0].reject(Object.assign(new Error('Changed elsewhere'),{status:409}));await sending;
 assert.equal(h.form.inert,false);assert.equal(h.form.elements.expectedUpdatedAt.value,'version-1');await h.send();assert.equal(h.calls.length,1,'a repeated submit cannot skip the conflict review');
 const beforeRefresh=h.form,button=beforeRefresh.querySelector('[data-personal-plan-refresh-draft]');
 h.ctx.loadPersonal=async()=>{h.state.personal={...h.personal,plans:h.personal.plans.map(item=>item.id===h.plan.id?{...item,title:'Saved in another window',updatedAt:'version-2'}:item)};};
 await button.onclick({currentTarget:button});assert.equal(beforeRefresh.isConnected,false);assert.equal(h.form.elements.title.value,'My unsaved change');assert.equal(h.form.elements.expectedUpdatedAt.value,'version-1');assert.match(h.form.panels[0].innerHTML,/Saved in another window/);assert.equal(h.counts.cleared,0);
 h.form.querySelector('[data-personal-plan-review-draft]').onclick();assert.equal(h.form.elements.expectedUpdatedAt.value,'version-2');sending=h.send();await Promise.resolve();const payload=JSON.parse(h.calls[1].options.body);assert.equal(payload.title,'My unsaved change');assert.equal(payload.expectedUpdatedAt,'version-2');assert.equal(payload.parentId,'old-parent');h.calls[1].resolve({id:h.plan.id});await sending;assert.equal(h.counts.cleared,1);
});

test('conflict refresh retains the draft on storage failure, load failure, disappearance, and a late context change',async()=>{
 for(const condition of ['storage','network','missing','owner','workspace','route','dialog']){
  const h=editorHarness();h.form.elements.title.value='Keep this draft';const sending=h.send();await Promise.resolve();h.calls[0].reject(Object.assign(new Error('Changed elsewhere'),{status:409}));await sending;
  const oldForm=h.form,button=oldForm.querySelector('[data-personal-plan-refresh-draft]');let loaded=0;
  if(condition==='storage')h.ctx.flushDialogDrafts=()=>false;
  h.ctx.loadPersonal=async()=>{loaded++;if(condition==='network')h.state.personalError='Offline';if(condition==='missing')h.state.personal={...h.personal,plans:[]};if(condition==='owner')h.state.me={id:2};if(condition==='workspace')h.state.activeWorkspaceId='other';if(condition==='route')h.state.view='other';if(condition==='dialog')oldForm.isConnected=false;};
  await button.onclick({currentTarget:button});assert.equal(loaded,condition==='storage'?0:1);assert.equal(h.form,oldForm);assert.equal(oldForm.elements.title.value,'Keep this draft');assert.equal(oldForm.elements.expectedUpdatedAt.value,'version-1');assert.equal(h.counts.cleared,0);assert.equal(button.disabled,false);assert.equal(oldForm.inert,false);
 }
});

test('discarding a reviewed draft cannot clear a different owner or workspace draft',()=>{
 for(const condition of ['owner','workspace','route','dialog']){
  const h=editorHarness({draft:{values:{title:'Keep old draft',expectedUpdatedAt:'version-0'}}}),oldForm=h.form,discard=oldForm.querySelector('[data-personal-plan-discard-draft]');
  if(condition==='owner')h.state.me={id:2};if(condition==='workspace')h.state.activeWorkspaceId='other';if(condition==='route')h.state.view='other';if(condition==='dialog')oldForm.isConnected=false;
  discard.onclick();assert.equal(h.counts.cleared,0);assert.equal(h.form,oldForm);assert.equal(oldForm.elements.expectedUpdatedAt.value,'version-0');
 }
});

test('completing a plan preserves stored references and an unavailable one opens explicit repair without PATCH',async()=>{
 const {personal,plan}=fixture(),calls=[],opened=[],state={me:{id:1},activeWorkspaceId:'personal',view:'personal',personal};
 const ctx=moduleContext({state,findPersonalItem:()=>plan,api:async(url,options)=>calls.push({url,options}),loadPersonal:async()=>{},toast(){},openPersonalEditor:(kind,id)=>opened.push({kind,id})});vm.runInContext(fragment('async function togglePersonalPlan(', 'async function toggleHabitCheckin('),ctx);
 await ctx.togglePersonalPlan(plan.id);const body=JSON.parse(calls[0].options.body);assert.equal(body.status,'done');assert.equal(body.expectedUpdatedAt,'version-1');assert.equal(Object.hasOwn(body,'projectId'),false);assert.equal(plan.projectId,'old-project');
 plan.parentId='foreign-parent';await ctx.togglePersonalPlan(plan.id);assert.equal(calls.length,1);assert.equal(opened[0].id,'child');
});
