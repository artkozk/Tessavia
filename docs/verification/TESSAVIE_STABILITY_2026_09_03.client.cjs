const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('web/app.js','utf8');
function part(start,end) { const a=source.indexOf(start), b=source.indexOf(end,a); if(a<0||b<0)throw Error('Source boundary missing');return source.slice(a,b); }
function deferred() { let resolve; const promise=new Promise(r=>resolve=r);return {promise,resolve}; }
function context(api) {
 const c=vm.createContext({api, Map, Set, URLSearchParams,
 state:{me:{id:1},activeWorkspaceId:'A',view:'work',records:[{id:'A-old',updatedAt:'2026-01-01'}],activity:[],detailCache:new Map(),researchComparisons:new Map(),syncRecordsSince:'1970-01-01',syncActivitySince:'1970-01-01'},
 localStorage:{setItem(){}},typeMeta:{task:{}},interfaceDevice:()=> 'desktop',
 initializeViewHistory(){},render(){},leavePageLayoutEditor:()=>true,confirm:()=>true,rememberView(){},setSidebarOpen(){},pushViewHistory(){}});
 vm.runInContext(part('async function loadData(', 'async function syncProjectChanges('),c);return c;
}
function payload(path,project) {
 if(path==='/api/workspaces') return [{id:'A',kind:'team'},{id:'B',kind:'team'}];
 if(path==='/api/records?includeArchived=true') return [{id:project+'-record',updatedAt:'2026-09-03T12:00:00Z'}];
 if(path==='/api/planning/cycles')return {cycles:[]};
 if(path.startsWith('/api/interface/preferences')||path==='/api/workspace/navigation')return {};
 return [];
}
(async()=>{
 const requestedA=deferred(), releaseA=deferred(); let c;
 c=context(async path=> { const project=c.state.activeWorkspaceId;
   if(path.startsWith('/api/records?')&&project==='A'){requestedA.resolve();await releaseA.promise;}
   return payload(path,project);
 });
 const first=c.loadData();await requestedA.promise;c.state.activeWorkspaceId='B';await c.loadData();releaseA.resolve();await first;
 console.log(JSON.stringify({probe:'workspace_response_race',activeProject:c.state.activeWorkspaceId,displayedRecord:c.state.records[0].id}));
 const failed=context(async path=>{if(path==='/api/chat/threads')throw Error('Gateway timeout');return payload(path,'B');});
 try{await failed.switchWorkspace('B');}catch(e){}
 console.log(JSON.stringify({probe:'workspace_load_failure',activeProject:failed.state.activeWorkspaceId,retainedRecord:failed.state.records[0].id}));

 const boot=vm.createContext({state:{},bindGlobalEvents(){},enhanceSelects(){},bindDragScroll(){},document:{body:{}},MutationObserver:class{observe(){}},api:async()=>({id:1}),showApp(){},loadData:async()=>{throw Error('Transient 502');},showAuth(){boot.showedAuth=true;}});
 vm.runInContext(part('async function bootstrap()', 'async function loadData('),boot);await boot.bootstrap();
 console.log(JSON.stringify({probe:'bootstrap_transient_failure',authenticatedUser:boot.state.me.id,loginFormShown:boot.showedAuth}));

 const auth=vm.createContext({state:{me:{id:1},activeWorkspaceId:'A'},AbortController,Headers,FormData,TypeError,setTimeout,clearTimeout,
 fetch:async()=>({status:401,ok:false,headers:new Headers(),json:async()=>({error:'Current password is incorrect'})}),showAuth(){auth.showedAuth=true;}});
 vm.runInContext(part('const pendingAPIReads =','function toast('),auth);
 try{await auth.api('/api/me/password',{method:'PUT',body:JSON.stringify({currentPassword:'incorrect',newPassword:'synthetic-new-password'})});}catch(e){}
 console.log(JSON.stringify({probe:'incorrect_current_password',authenticatedUser:auth.state.me.id,loginFormShown:auth.showedAuth}));

 const memory=new Map(),graph=vm.createContext({state:{me:{id:1},activeWorkspaceId:'A'},localStorage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v),removeItem:k=>memory.delete(k)}});
 vm.runInContext(part('function graphPositionKey()', 'function graphHierarchyDescendants('),graph);
 graph.saveGraphPositions({nodes:()=>[{id:()=> 'nodeA',position:()=>({x:100,y:100})}]});
 graph.state.activeWorkspaceId='B';graph.clearGraphPositions();graph.state.activeWorkspaceId='A';
 console.log(JSON.stringify({probe:'graph_reset_cross_project',projectAPositionsAfterResetInB:graph.loadGraphPositions()}));
})().catch(e=>{console.error(e);process.exitCode=1;});
