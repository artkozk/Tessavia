const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));

// Exercise the actual async editor with a small dialog surface. Browser layout and
// native form validation belong to the UI acceptance pass, not this harness.
function surface(){return{firstElementChild:null,nodes:new Map(),_html:'',set innerHTML(value){this._html=value;this.firstElementChild={inert:false};this.nodes=new Map();for(const attr of value.match(/data-builder-[a-z-]+/g)||[])this.nodes.set(`[${attr}]`,{disabled:false,value:'',reportValidity:()=>true,addEventListener(){}});},get innerHTML(){return this._html;},querySelector(selector){return this.nodes.get(selector)||null;},querySelectorAll(){return[];}};}
function harness(){
 const box={open:false,dataset:{}},host=surface(),main=surface(),state={me:{id:'owner'},activeWorkspaceId:'personal',view:'page:page',collections:[],records:[]};
 const calls=[],toasts=[],storage=new Map(),reads=[],stats={opened:0,closed:0,reloads:0},page={id:'page',name:'Page'};
 let reload=()=>Promise.resolve();
 const $=(selector,root)=>root?root.querySelector(selector):({'#workspace-dialog':box,'#workspace-dialog-content':host,'#main-content':main}[selector]||null);
 const context=vm.createContext({structuredClone,crypto:{randomUUID:()=> 'new-id'},localStorage:{getItem(key){reads.push(key);return storage.get(key)||null;},setItem(key,value){storage.set(key,value);},removeItem(key){storage.delete(key);}},
  createPageDataUI:()=>({mount(){}}),mountPageForms(){},applyElementStyles(){},migrateFormElementStyles(){},blockVisible:()=>true,blockOutline:def=>def.blocks.map(block=>({block,depth:0})),groupChoices:()=>[],elementStyleConfig:()=>'',visibilityConfig:()=>''});
 for(const file of ['page-sheets.js','page-apps.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8').replaceAll('\r\n','\n').replace(/^import .*;\n/gm,'').replaceAll('export ',''),context);
 context.createPageSheetUI=()=>({mount(){},reset(){}});
 context.options={state,api:(url,options)=>{const pending=deferred();calls.push({url,options,...pending});return pending.promise;},escapeHTML:String,icon:()=>'', $, $$:()=>[],
  openModal(){box.open=true;box.dataset.openOrder=String(++stats.opened);},requestDialogClose:async()=>{if(box.dataset.settingsSaving==='true')return false;stats.closed++;box.open=false;return true;},toast:(message,error)=>toasts.push({message,error}),canConfigureWorkspace:()=>true,reloadPages:()=>{stats.reloads++;return reload();},navigate(){},formDependencies:{},dataDependencies:{}};
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
