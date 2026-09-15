const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8').replaceAll('\r\n','\n');
const callbacks=source.slice(source.indexOf('async function openPageFinanceAction('),source.indexOf('\nfunction renderTeamFinance()',source.indexOf('async function openPageFinanceAction(')));
const pending=()=>{let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return{promise,resolve,reject};};
const tick=()=>new Promise(setImmediate);
function harness(){
 const state={me:{id:1},activeWorkspaceId:'a',view:'page:first',personalTab:'today',projectContextEpoch:1,viewRestoreRequest:1,workspaces:[{id:'a',kind:'team'},{id:'b',kind:'team'},{id:'private',kind:'personal'}],personal:{goals:[{id:'goal'}],plans:[{id:'plan'}]}};
 const events=[],calls=[],dialog={open:true,addEventListener:(...args)=>events.push(args)};
 const ctx=vm.createContext({state,activeWorkspace:()=>state.workspaces.find(w=>w.id===state.activeWorkspaceId),$:()=>dialog,toast:(...args)=>calls.push(['toast',...args]),
  leaveSettingsFor:async action=>action(),
  navigateToView:async view=>{state.viewRestoreRequest++;state.activeWorkspaceId='private';state.projectContextEpoch++;state.view='personal';state.personalTab=view.split(':')[1];calls.push(['navigate',view]);return true;},
  switchWorkspace:async id=>{state.activeWorkspaceId=id;state.view='dashboard';state.projectContextEpoch++;return true;},
  loadPersonal:async()=>{},openRecord:id=>{calls.push(['record',id]);return true;},openPersonalEditor:(kind,id)=>{calls.push(['editor',kind,id]);return true;},
  personalFinanceUI:{openAction:async()=>true},teamFinanceUI:{openAction:async()=>true}});
 vm.runInContext(callbacks,ctx);return{state,ctx,events,calls};
}
test('finance block callback pins page and navigation generation through delayed opening',async()=>{
 for(const change of [state=>{state.view='page:second';},state=>{state.viewRestoreRequest++;},state=>{state.projectContextEpoch++;}]){
  const h=harness(),wait=pending();let options;
  h.ctx.teamFinanceUI.openAction=async(action,value)=>{options=value;await wait.promise;return value.guard();};
  const opening=h.ctx.openPageFinanceAction({action:'income',workspaceId:'a',ownerId:1,sourceWorkspaceId:'a',sourceRevision:0});
  assert.equal(options.guard(),true);change(h.state);assert.equal(options.guard(),false);wait.resolve();
  assert.equal(await opening,false);assert.equal(h.events.length,0);
 }
});
test('finance linked navigation does not take over a new route while its source dialog closes',async()=>{
 const h=harness(),wait=pending();h.ctx.leaveSettingsFor=async action=>{await wait.promise;return action();};
 const opening=h.ctx.openFinanceRelated({kind:'record',id:'card',workspaceId:'b'});
 h.state.view='calendar';h.state.viewRestoreRequest++;wait.resolve();
 assert.equal(await opening,false);assert.equal(h.calls.length,0);assert.equal(h.state.activeWorkspaceId,'a');
});
test('personal linked object ignores late overview after another tab, route generation, account, or load failure',async()=>{
 for(const change of [state=>{state.personalTab='habits';},state=>{state.viewRestoreRequest++;},state=>{state.me={id:2};},state=>{state.personalError='Network failure';}]){
  const h=harness(),wait=pending();h.ctx.loadPersonal=()=>wait.promise;
  const opening=h.ctx.openFinanceRelated({kind:'personal_goal',id:'goal'});await tick();
  change(h.state);wait.resolve();assert.equal(await opening,false);assert.equal(h.calls.filter(row=>row[0]==='editor').length,0);
 }
});
test('team linked card is not opened after a competing navigation during source team loading',async()=>{
 const h=harness(),wait=pending();h.ctx.switchWorkspace=async id=>{h.state.activeWorkspaceId=id;await wait.promise;return true;};
 const opening=h.ctx.openFinanceRelated({kind:'record',id:'card',workspaceId:'b'});await tick();
 h.state.viewRestoreRequest++;h.state.view='page:other';wait.resolve();
 assert.equal(await opening,false);assert.equal(h.calls.filter(row=>row[0]==='record').length,0);
});
test('linked personal and team objects open normally, without creating financial operations',async()=>{
 const h=harness();assert.equal(await h.ctx.openFinanceRelated({kind:'personal_plan',id:'plan'}),true);
 assert.deepEqual(h.calls,[['navigate','personal:plans'],['editor','plan','plan']]);
 const team=harness();assert.equal(await team.ctx.openFinanceRelated({kind:'record',id:'card',workspaceId:'b'}),true);
 assert.deepEqual(team.calls,[['record','card']]);
});
test('linked object failure stays visible after the finance dialog closes and is suppressed for a new account',async()=>{
 const h=harness();h.state.personal.goals=[];
 assert.equal(await h.ctx.openFinanceRelated({kind:'personal_goal',id:'missing'}),false);
 assert.equal(h.calls.filter(row=>row[0]==='toast').length,1);assert.match(h.calls.at(-1)[1],/больше недоступен/);
 const switched=harness(),wait=pending();switched.ctx.loadPersonal=()=>wait.promise;
 const opening=switched.ctx.openFinanceRelated({kind:'personal_goal',id:'goal'});await tick();switched.state.me={id:2};wait.reject(new Error('Old account error'));
 assert.equal(await opening,false);assert.equal(switched.calls.filter(row=>row[0]==='toast').length,0);
});
