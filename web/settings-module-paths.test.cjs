const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const read=name=>fs.readFileSync(path.join(__dirname,name),'utf8').replaceAll('\r\n','\n');
const deferred=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
const day=()=>({date:'2026-09-10',settings:{timezone:'UTC',start:'08:00',end:'22:00',updatedAt:'version-one'},focus:{},recurrences:[]});

function todayHarness(api){
 const state={me:{id:17},view:'work',personalTab:'notes',activeWorkspaceId:'team'},requests=[],drafts=[],notifications=[];
 let renders=0,refreshes=0,form=null,loading=null;
 const dialog={open:false},close={};
 const content={html:'',set innerHTML(html){
   this.html=html;if(form)form.isConnected=false;if(loading)loading.isConnected=false;form=null;loading=null;
   if(html.includes('data-day-settings-loading')){
     const status={children:[],text:'',set textContent(value){this.text=value;this.children=[];},get textContent(){return this.text;},append(child){this.children.push(child);}};
     loading={isConnected:true,status,querySelector:s=>s==='[role=status]'?status:null};
   }
   if(html.includes('<form>')){
     const elements=Object.fromEntries(['version','timezone','start','end'].map(name=>[name,{value:html.match(new RegExp(`name="${name}"[^>]*value="([^"]*)"`))?.[1]||''}]));elements.timezone.value='UTC';
     const button={disabled:false},error={hidden:true,children:[],append(child){this.children.push(child);}};
     form={isConnected:true,elements,inert:false,button,error,querySelector:s=>s==='[type=submit]'?button:s==='[role=alert]'?error:null};
   }
 },get innerHTML(){return this.html;},querySelector:s=>s==='[data-today-close]'?close:s==='[data-day-settings-loading]'?loading:s==='form'?form:null};
 const document={querySelector:s=>s==='#workspace-dialog'?dialog:s==='#workspace-dialog-content'?content:null,querySelectorAll:()=>[],createElement:()=>({})};
 const ctx=vm.createContext({document,Intl,Date,encodeURIComponent,setInterval(){}});
 vm.runInContext(read('personal-today.js').replaceAll('export function','function'),ctx);
 const ui=ctx.createPersonalTodayUI({state,api:async(url,options)=>{requests.push({url,options});return api(url,options);},escapeHTML:String,icon:()=>'',renderPersonal(){renders++;},refreshPersonal(){refreshes++;},openModal:d=>{d.open=true;},closeDialog:async d=>{d.open=false;return true;},bindDraft:(f,key)=>drafts.push(key),clearDraft(){},flushDrafts:()=>true,toast:(...args)=>notifications.push(args)});
 return{ui,state,dialog,content,requests,drafts,notifications,get form(){return form;},get loading(){return loading;},get renders(){return renders;},get refreshes(){return refreshes;}};
}

test('day settings open from a team page without loading Today or needing cached personal data',async()=>{
 const h=todayHarness(async()=>day());
 assert.equal(await h.ui.openSettings(),true);
 assert.equal(h.state.view,'work');assert.equal(h.state.activeWorkspaceId,'team');assert.equal(h.renders,0);assert.equal(h.refreshes,0);
 assert.equal(h.requests.length,1);assert.match(h.requests[0].url,/^\/api\/personal\/day\?timezone=/);assert.equal(h.requests[0].options.headers['X-Outbox-Owner'],'17');
 assert.deepEqual(h.drafts,['personal:17:day-settings']);assert.equal(h.form.elements.version.value,'version-one');
 h.form.elements.start.value='09:15';h.form.elements.end.value='23:00';
 await h.form.onsubmit({preventDefault(){}});
 const saved=h.requests.find(r=>r.options.method==='PUT');assert.equal(saved.url,'/api/personal/day/settings');assert.deepEqual(JSON.parse(saved.options.body),{timezone:'UTC',start:'09:15',end:'23:00',expectedUpdatedAt:'version-one'});
 assert.equal(h.dialog.open,false);assert.equal(h.renders,0);assert.equal(h.refreshes,0);assert.equal(h.state.view,'work');
});

test('day settings ignore a delayed response after changing account or closing the leaf',async()=>{
 for(const action of ['account','close']){
   const pending=deferred(),h=todayHarness(()=>pending.promise),opened=h.ui.openSettings();
   assert.equal(h.dialog.open,true);
   if(action==='account')h.state.me={id:23};else h.dialog.open=false;
   pending.resolve(day());assert.equal(await opened,false);assert.equal(h.form,null);assert.deepEqual(h.drafts,[]);
 }
});

test('day settings show a failed load and retry in place without changing the page',async()=>{
 let calls=0;const h=todayHarness(async()=>{if(!calls++)throw new Error('Нет соединения');return day();});
 assert.equal(await h.ui.openSettings(),false);assert.equal(h.loading.status.textContent,'Нет соединения');assert.equal(h.loading.status.children[0].textContent,'Повторить');
 h.loading.status.children[0].onclick();await tick();
 assert.ok(h.form);assert.equal(h.state.view,'work');assert.equal(h.requests.length,2);
});

test('day settings never overwrite another open workspace editor',async()=>{
 const h=todayHarness(async()=>day());h.dialog.open=true;h.content.innerHTML='Existing unsaved editor';
 assert.equal(await h.ui.openSettings(),false);assert.equal(h.content.innerHTML,'Existing unsaved editor');assert.equal(h.requests.length,0);
});

test('day settings keep changed fields and allow saving again after a failed write',async()=>{
 let writes=0;const h=todayHarness(async(url,options)=>{if(options.method==='PUT'&&!writes++)throw new Error('Сохранение недоступно');return day();});
 await h.ui.openSettings();const form=h.form;form.elements.start.value='10:30';await form.onsubmit({preventDefault(){}});
 assert.equal(h.dialog.open,true);assert.equal(form.elements.start.value,'10:30');assert.equal(form.error.hidden,false);assert.equal(form.error.textContent,'Сохранение недоступно');assert.equal(form.button.disabled,false);assert.equal(form.inert,false);
 await form.onsubmit({preventDefault(){}});assert.equal(h.dialog.open,false);assert.equal(writes,2);
});

test('own page keeps editing and sharing callable without displaying configuration buttons in viewing mode',async()=>{
 const state={me:{id:17},view:'page:p1',activeWorkspaceId:'team',workspacePages:[],collections:[],records:[]},root={innerHTML:''},title={},dialog={dataset:{}},content={innerHTML:''},close={},form={},toasts=[];let opened=0,admin=true;
 const q=(selector,parent)=>parent===content?(selector==='[data-app-close]'?close:selector==='[data-app-share-form]'?form:null):selector==='#main-content'?root:selector==='#page-title'?title:selector==='#workspace-dialog'?dialog:selector==='#workspace-dialog-content'?content:null;
 const ctx=vm.createContext({createPageSheetUI:()=>({mount(){},reset(){}}),createPageMediaUI:()=>({mount(){}}),createPageDataUI:()=>({mount(){}}),applyElementStyles(){},mountPageForms(){},recordActionMenu(){},recordRowText(){},Intl});
 vm.runInContext(read('page-apps.js').replace(/^import .*;\n/gm,'').replaceAll('export ',''),ctx);
 const ui=ctx.createPageAppUI({state,api:async()=>({revision:1,definition:{version:1,blocks:[]},marks:{}}),escapeHTML:String,icon:()=>'', $:q,$$:()=>[],openModal(){opened++;},requestDialogClose:async()=>true,canConfigureWorkspace:()=>admin,toast:(...args)=>toasts.push(args)});
 assert.equal(await ui.share(),false);assert.match(toasts.pop()[0],/ещё не загрузилась/);assert.equal(opened,0);
 await ui.render({id:'p1',name:'Мой день',app:true});
 assert.doesNotMatch(root.innerHTML,/data-app-edit|data-app-share|app-page-actions/);assert.match(root.innerHTML,/Настройки → Текущая страница/);assert.equal(typeof ui.edit,'function');assert.equal(typeof ui.share,'function');
 await ui.share();assert.equal(opened,1);assert.match(content.innerHTML,/Сохранить страницу как набор/);assert.equal(typeof form.onsubmit,'function');
 state.view='calendar';assert.equal(await ui.share(),false);assert.match(toasts.pop()[0],/ещё не загрузилась/);assert.equal(opened,1);
 state.view='page:p1';admin=false;assert.equal(await ui.share(),false);assert.match(toasts.pop()[0],/администратор/);assert.equal(opened,1);
 await ui.render({id:'p1',name:'Мой день',app:true});assert.doesNotMatch(root.innerHTML,/чтобы добавить/);
});
