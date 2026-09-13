const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// Exercise the actual async editor with a small dialog surface. Browser layout and
// native form validation belong to the UI acceptance pass, not this harness.
function surface(){return{firstElementChild:null,nodes:new Map(),_html:'',set innerHTML(value){
 this._html=value;this.firstElementChild={inert:false};this.nodes=new Map();const elements={};
 for(const tag of value.match(/<(?:input|textarea|select)\b[^>]*>/g)||[]){const name=tag.match(/\bname="([^"]+)"/)?.[1];if(name)elements[name]={value:tag.match(/\bvalue="([^"]*)"/)?.[1]||''};}
 for(const tag of value.match(/<(?:button|form|input)\b[^>]*>/g)||[]){
  const attrs=[...tag.matchAll(/\b(data-(?:builder|app|template|component)-[a-z-]+)(?:="([^"]*)")?/g)];
  if(!attrs.length&&!/type="submit"/.test(tag))continue;
  const node={disabled:false,value:'',dataset:{},elements,reportValidity:()=>true,addEventListener(type,handler){this[`on${type}`]=handler;},querySelector:selector=>this.querySelector(selector),querySelectorAll:selector=>this.querySelectorAll(selector)};
  const add=key=>{if(!this.nodes.has(key))this.nodes.set(key,[]);this.nodes.get(key).push(node);};
  for(const [,attr,content] of attrs){node.dataset[attr.slice(5).replace(/-([a-z])/g,(_,letter)=>letter.toUpperCase())]=content||'';add(`[${attr}]`);}
  if(/type="submit"/.test(tag))add('[type=submit]');
 }
},get innerHTML(){return this._html;},querySelector(selector){return this.nodes.get(selector)?.[0]||null;},querySelectorAll(selector){return this.nodes.get(selector)||[];}};}
function harness(){
 const box={open:false,dataset:{}},host=surface(),main=surface(),state={me:{id:'owner'},activeWorkspaceId:'personal',view:'page:page',workspaces:[{id:'personal',kind:'personal'}],collections:[],records:[]};
 const calls=[],toasts=[],storage=new Map(),reads=[],stats={opened:0,closed:0,reloads:0},page={id:'page',name:'Page'};
 let reload=()=>Promise.resolve();
 const $=(selector,root)=>root?root.querySelector(selector):({'#workspace-dialog':box,'#workspace-dialog-content':host,'#main-content':main}[selector]||null);
 const context=vm.createContext({structuredClone,crypto:{randomUUID:()=> 'new-id'},localStorage:{getItem(key){reads.push(key);return storage.get(key)||null;},setItem(key,value){storage.set(key,value);},removeItem(key){storage.delete(key);}},
  createPageDataUI:()=>({mount(){}}),mountPageForms(){},applyElementStyles(){},migrateFormElementStyles(){},blockVisible:()=>true,blockOutline:def=>def.blocks.map(block=>({block,depth:0})),groupChoices:()=>[],elementStyleConfig:()=>'',visibilityConfig:()=>''});
 for(const file of ['page-sheets.js','page-components.js','page-apps.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8').replaceAll('\r\n','\n').replace(/^import .*;\n/gm,'').replaceAll('export ',''),context);
 context.createPageSheetUI=()=>({mount(){},reset(){}});
 context.options={state,api:(url,options)=>{const pending=deferred();calls.push({url,options,...pending});return pending.promise;},escapeHTML:String,icon:()=>'', $, $$:(selector,root)=>root?.querySelectorAll(selector)||[],
  openModal(){if(box.open)return;box.open=true;box.dataset.openOrder=String(++stats.opened);},requestDialogClose:async()=>{if(box.dataset.settingsSaving==='true')return false;stats.closed++;box.open=false;return true;},toast:(message,error)=>toasts.push({message,error}),canConfigureWorkspace:()=>true,reloadPages:()=>{stats.reloads++;return reload();},navigate:view=>state.view=view,formDependencies:{},dataDependencies:{}};
 const ui=vm.runInContext('createPageAppUI(options)',context);
 return{box,host,main,state,calls,toasts,storage,reads,stats,page,ui,setReload:fn=>reload=fn};
}
const loaded=(blocks=[])=>({revision:1,definition:{version:1,blocks},marks:{},sheets:{secret:{values:{private:'999'},revision:1}}});
async function openEditor(h,blocks=[]){const pending=h.ui.edit(h.page);h.calls[0].resolve(loaded(blocks));await pending;assert.equal(h.box.open,true);}

test('editor discards stale GET after account, workspace, view or dialog replacement',async()=>{
 for(const change of [h=>h.state.me={id:'other'},h=>h.state.activeWorkspaceId='other',h=>h.state.view='personal',h=>{h.host.innerHTML='<p>Other dialog</p>';}]){
  const h=harness(),pending=h.ui.edit(h.page);change(h);h.calls[0].resolve(loaded());await pending;
  assert.equal(h.stats.opened,0);assert.equal(h.reads.length,0);assert.equal(h.toasts.length,0);
 }
});

test('latest editor request wins when two page loads finish out of order',async()=>{
 const h=harness(),first=h.ui.edit(h.page),second=h.ui.edit(h.page);
 h.calls[1].resolve(loaded());await second;const root=h.host.firstElementChild;
 h.calls[0].resolve(loaded());await first;assert.equal(h.stats.opened,1);assert.equal(h.host.firstElementChild,root);
});

test('stale Save handler cannot submit under another account',async()=>{
 const h=harness();await openEditor(h);const save=h.host.querySelector('[data-builder-save]').onclick;h.state.me={id:'other'};
 await save();assert.equal(h.calls.length,1);assert.equal(h.storage.size,0);
});

test('a failed reopen keeps the visible editor and its Save handler usable',async()=>{
 const h=harness();await openEditor(h);const root=h.host.firstElementChild,save=h.host.querySelector('[data-builder-save]').onclick;
 const reopening=h.ui.edit(h.page);h.calls[1].reject(new Error('Load unavailable'));await reopening;
 assert.equal(h.host.firstElementChild,root);const saving=save();assert.equal(h.calls.length,3);assert.equal(h.calls[2].options.method,'PUT');
 h.state.me={id:'other'};h.calls[2].resolve(loaded());await saving;
});

test('a pending reopen cannot replace an editor whose Save began after that GET',async()=>{
 const h=harness();await openEditor(h);const root=h.host.firstElementChild,reopening=h.ui.edit(h.page);
 const saving=h.host.querySelector('[data-builder-save]').onclick();h.calls[1].resolve(loaded());await reopening;
 assert.equal(h.host.firstElementChild,root);assert.equal(root.inert,true);assert.equal(h.box.dataset.settingsSaving,'true');
 h.state.me={id:'other'};h.calls[2].resolve(loaded());await saving;
});

test('closing an untouched editor preserves the offered unsaved draft',async()=>{
 const h=harness(),key='tessavie:app-draft:owner:personal:page',draft=JSON.stringify({revision:1,definition:{version:1,blocks:[]},pageName:'Unsaved title',pendingItems:{}});
 h.storage.set(key,draft);await openEditor(h);assert.match(h.host.innerHTML,/Есть несохранённый черновик/);
 assert.equal(h.host.querySelector('[data-builder-save]').disabled,true);assert.equal(h.host.querySelector('[data-builder-page-name]').disabled,true);
 await h.host.querySelector('[data-builder-save]').onclick();await h.host.querySelector('[data-builder-cancel]').onclick();assert.equal(h.calls.length,1);assert.equal(h.storage.get(key),draft);
 await h.host.querySelector('[data-builder-close]').onclick();assert.equal(h.storage.get(key),draft);assert.equal(h.stats.closed,1);
});

test('restoring or discarding a draft explicitly unlocks the chosen editing version',async()=>{
 for(const choice of ['restore','discard']){
  const h=harness(),key='tessavie:app-draft:owner:personal:page';h.storage.set(key,JSON.stringify({revision:1,definition:{version:1,blocks:[]},pageName:'Restored title',pendingItems:{}}));await openEditor(h);
  h.host.querySelector(`[data-builder-${choice}]`).onclick();assert.equal(h.host.querySelector('[data-builder-save]').disabled,false);
  if(choice==='restore'){await h.host.querySelector('[data-builder-close]').onclick();assert.equal(JSON.parse(h.storage.get(key)).pageName,'Restored title');}
  else{assert.equal(h.storage.has(key),false);h.host.querySelector('[data-builder-page-name]').oninput({target:{value:'New draft'}});assert.equal(JSON.parse(h.storage.get(key)).pageName,'New draft');}
 }
});

test('pending Save protects close and ignores completion after another dialog takes over',async()=>{
 const h=harness();await openEditor(h);const savedRoot=h.host.firstElementChild,save=h.host.querySelector('[data-builder-save]').onclick();
 assert.equal(savedRoot.inert,true);assert.equal(h.box.dataset.settingsSaving,'true');
 await h.host.querySelector('[data-builder-close]').onclick();await h.host.querySelector('[data-builder-cancel]').onclick();assert.equal(h.stats.closed,0);
 h.host.innerHTML='<p>New dialog</p>';const replacement=h.host.firstElementChild;h.box.dataset.settingsSaving='true';
 h.calls[1].resolve(loaded());await save;
 assert.equal(h.stats.closed,0);assert.equal(h.stats.reloads,0);assert.equal(h.host.firstElementChild,replacement);assert.equal(h.box.dataset.settingsSaving,'true');assert.equal(h.toasts.length,0);
});

test('Save does not close the next dialog after a delayed page-list refresh',async()=>{
 const h=harness();await openEditor(h);const refreshing=deferred();h.setReload(()=>refreshing.promise);
 const save=h.host.querySelector('[data-builder-save]').onclick();h.calls[1].resolve(loaded());await tick();assert.equal(h.stats.reloads,1);
 h.host.innerHTML='<p>Another editor</p>';refreshing.resolve();await save;assert.equal(h.stats.closed,0);assert.equal(h.toasts.length,0);
});

test('normal Save canonicalizes schema-only numbers, closes once and refreshes the page',async()=>{
 const h=harness(),blocks=[{id:'text',kind:'text',title:'Text',sheet:{rows:[{id:'constant',kind:'constant',label:'Rate',value:'12,5',precision:2}]}}];
 await openEditor(h,blocks);const input=h.host.querySelector('[data-builder-page-name]');input.oninput({target:{value:'Renamed'}});assert.equal(h.storage.size,1);
 const save=h.host.querySelector('[data-builder-save]').onclick(),body=JSON.parse(h.calls[1].options.body);
 assert.equal(body.definition.blocks[0].sheet.rows[0].value,'12.5');assert.equal(body.sheets,undefined);assert.ok(!h.calls[1].options.body.includes('999'));assert.equal(body.pageName,'Renamed');assert.equal(body.expectedRevision,1);
 assert.equal(h.calls[1].options.headers['X-Outbox-Owner'],'owner');assert.equal(h.calls[1].options.headers['X-Workspace-ID'],'personal');
 h.calls[1].resolve(loaded(blocks));await tick();assert.equal(h.stats.closed,1);assert.equal(h.calls.length,3);
 h.calls[2].resolve(loaded(blocks));await save;assert.equal(h.storage.size,0);assert.equal(h.page.name,'Renamed');assert.equal(h.box.dataset.settingsSaving,'false');assert.equal(h.toasts.at(-1).message,'Страница сохранена');
});

test('a personal page is created in the active private workspace and opens its own constructor',async()=>{
 const h=harness();assert.equal(await h.ui.create(),true);assert.match(h.host.innerHTML,/Новая личная страница/);assert.match(h.host.innerHTML,/доступна только вам/);
 const form=h.host.querySelector('[data-app-create-form]');form.elements.name.value='My pages';const saving=form.onsubmit({preventDefault(){},currentTarget:form});
 assert.equal(h.calls[0].url,'/api/workspace/pages');assert.equal(h.calls[0].options.headers['X-Workspace-ID'],'personal');assert.equal(h.calls[0].options.headers['X-Outbox-Owner'],'owner');
 h.calls[0].resolve({id:'created',name:'My pages'});await tick();assert.equal(h.calls[1].url,'/api/workspace/pages/created/app');assert.deepEqual(JSON.parse(h.calls[1].options.body).definition,{version:1,blocks:[]});
 h.calls[1].resolve(loaded());await tick();assert.equal(h.calls[2].url,'/api/workspace/pages/created/app');assert.equal(h.state.view,'page:created');
 h.calls[2].resolve(loaded());await saving;assert.equal(h.box.open,true);assert.match(h.host.innerHTML,/Конструктор · личная страница/);assert.doesNotMatch(h.host.innerHTML,/общая страница/);
});

test('creation stops between requests when the account or workspace changes',async()=>{
 for(const change of [h=>h.state.me={id:'other'},h=>h.state.activeWorkspaceId='other']){
  const h=harness();await h.ui.create();const form=h.host.querySelector('[data-app-create-form]');form.elements.name.value='Draft';const saving=form.onsubmit({preventDefault(){},currentTarget:form});
  change(h);h.calls[0].resolve({id:'created',name:'Draft'});await saving;
  assert.equal(h.calls.length,1);assert.equal(h.stats.reloads,0);assert.equal(h.stats.closed,0);assert.equal(h.state.view,'page:page');
 }
});

test('a delayed library cannot overwrite a closed or replaced dialog or another account',async()=>{
 for(const change of [h=>h.state.me={id:'other'},h=>h.box.open=false,h=>{h.host.innerHTML='<p>Another dialog</p>';}]){
  const h=harness();await h.ui.create();const pending=h.ui.library();change(h);h.calls[0].resolve([]);assert.equal(await pending,false);assert.doesNotMatch(h.host.innerHTML,/class="app-template-list"/);
 }
});

async function openKit(h){
 const listing=h.ui.library();h.calls[0].resolve([{id:'kit',name:'Kit',description:'',visibility:'public'}]);await listing;
 const preview=h.host.querySelector('[data-app-template]').onclick();h.calls[1].resolve({id:'kit',name:'Kit',definition:{version:1,blocks:[]}});await preview;
}

test('kit installation makes an independent personal page and states the destination',async()=>{
 const h=harness();await openKit(h);assert.match(h.host.innerHTML,/Личная копия · Личное пространство/);assert.match(h.host.innerHTML,/Добавить в мои страницы/);
 const installing=h.host.querySelector('[data-app-install]').onclick();assert.equal(h.calls[2].url,'/api/page-app/templates/kit/install');assert.equal(h.calls[2].options.headers['X-Workspace-ID'],'personal');
 h.calls[2].resolve({id:'copy',name:'Kit'});await installing;assert.equal(h.state.view,'page:copy');assert.equal(h.stats.closed,1);assert.equal(h.stats.reloads,1);
});

test('installation completion cannot close a replacement dialog or navigate another workspace',async()=>{
 for(const change of [h=>h.state.activeWorkspaceId='team',h=>{h.host.innerHTML='<p>Other form</p>';}]){
  const h=harness();await openKit(h);const installing=h.host.querySelector('[data-app-install]').onclick();change(h);h.calls[2].resolve({id:'copy',name:'Kit'});await installing;
  assert.equal(h.state.view,'page:page');assert.equal(h.stats.closed,0);assert.equal(h.stats.reloads,0);
 }
});

async function openComponentPreview(h){
 const library=h.host.querySelector('[data-builder-components]').onclick();h.calls.at(-1).resolve([{id:'component',name:'Own block',description:''}]);await library;
 const preview=h.host.querySelector('[data-component-preview]').onclick();h.calls.at(-1).resolve({id:'component',name:'Own block',definition:{version:1,blocks:[{id:'root',kind:'group',title:'Group'}]}});await preview;
}

test('component library cannot take over after account, route or dialog changes',async()=>{
 for(const change of [h=>h.state.me={id:'other'},h=>h.state.view='personal',h=>h.host.innerHTML='<p>New dialog</p>']){
  const h=harness();await openEditor(h);const listing=h.host.querySelector('[data-builder-components]').onclick();change(h);const before=h.host.innerHTML;h.calls[1].resolve([{id:'private',name:'PRIVATE COMPONENT'}]);await listing;
  assert.equal(h.host.innerHTML,before);assert.ok(!h.host.innerHTML.includes('PRIVATE COMPONENT'));
 }
});

test('component insertion explicitly saves the host draft, locks close and uses the new revision',async()=>{
 const h=harness();await openEditor(h);h.host.querySelector('[data-builder-page-name]').oninput({target:{value:'Draft name'}});await openComponentPreview(h);
 assert.match(h.host.innerHTML,/Вставить и сохранить страницу/);assert.match(h.host.innerHTML,/Вставка сохранит текущие изменения/);
 const insert=h.host.querySelector('[data-component-insert]').onclick,first=insert();await insert();assert.equal(h.calls.length,4);const request=JSON.parse(h.calls[3].options.body);assert.equal(request.pageName,'Draft name');assert.equal(request.expectedRevision,1);assert.equal(request.componentId,'component');assert.equal(request.sheets,undefined);assert.ok(!h.calls[3].options.body.includes('999'));
 assert.equal(h.box.dataset.settingsSaving,'true');await h.host.querySelector('[data-builder-close]').onclick();assert.equal(h.stats.closed,0);
 h.calls[3].resolve({...loaded(),revision:2,rootBlockId:'copy',pageName:'Draft name'});await tick();h.calls[4].resolve({...loaded(),revision:2});await first;
 assert.equal(h.storage.size,0);assert.equal(h.box.dataset.settingsSaving,'false');assert.match(h.host.innerHTML,/data-builder-components/);
 const save=h.host.querySelector('[data-builder-save]').onclick();assert.equal(JSON.parse(h.calls[5].options.body).expectedRevision,2);h.state.me={id:'other'};h.calls[5].resolve(loaded());await save;
});

test('unknown insertion outcome survives closing, reload and a newer server revision without duplication',async()=>{
 const h=harness();await openEditor(h);await openComponentPreview(h);const inserting=h.host.querySelector('[data-component-insert]').onclick();const exact=h.calls[3].options.body;
 h.calls[3].reject(new TypeError('Connection interrupted'));await inserting;assert.match(h.host.innerHTML,/Проверить и продолжить/);const stored=JSON.parse([...h.storage.values()][0]);assert.equal(stored.componentRequest.kind,'insert');assert.equal(JSON.stringify(stored.componentRequest.body),exact);
 await h.host.querySelector('[data-builder-close]').onclick();const reopening=h.ui.edit(h.page);h.calls[4].resolve({...loaded(),revision:2});await reopening;
 assert.match(h.host.innerHTML,/data-builder-restore/);h.host.querySelector('[data-builder-restore]').onclick();assert.match(h.host.innerHTML,/Проверить и продолжить/);assert.equal(h.host.querySelector('[data-builder-save]').disabled,true);
 const retry=h.host.querySelector('[data-component-retry]').onclick();assert.equal(h.calls[5].options.body,exact);h.calls[5].resolve({...loaded(),revision:2,alreadyInserted:true,rootBlockId:'copy',pageName:'Page'});await tick();h.calls[6].resolve({...loaded(),revision:2});await retry;
 assert.equal(h.storage.size,0);assert.match(h.host.innerHTML,/data-builder-components/);
});

test('an uncommitted insertion recovered after a conflict cannot save an old draft under a newer revision',async()=>{
 const h=harness();await openEditor(h);h.host.querySelector('[data-builder-page-name]').oninput({target:{value:'Keep my unsaved changes'}});await openComponentPreview(h);const inserting=h.host.querySelector('[data-component-insert]').onclick();h.calls[3].reject(new TypeError('No response'));await inserting;
 await h.host.querySelector('[data-builder-close]').onclick();const opening=h.ui.edit(h.page);h.calls[4].resolve({...loaded(),revision:3});await opening;h.host.querySelector('[data-builder-restore]').onclick();
 const retry=h.host.querySelector('[data-component-retry]').onclick();h.calls[5].reject(Object.assign(new Error('Revision conflict'),{status:409}));await retry;h.host.querySelector('[data-component-back]').onclick();
 const save=h.host.querySelector('[data-builder-save]').onclick();assert.equal(JSON.parse(h.calls[6].options.body).expectedRevision,1);h.calls[6].reject(Object.assign(new Error('Revision conflict'),{status:409}));await save;
 const draft=JSON.parse([...h.storage.values()][0]);assert.equal(draft.revision,1);assert.equal(draft.componentRequest,null);assert.equal(h.box.open,true);
});
