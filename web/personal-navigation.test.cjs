const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
function harness() {
 const state={me:{id:1},view:'work',activeWorkspaceId:'team',calendarScope:'project',workspaces:[{id:'team',kind:'team'},{id:'private',kind:'personal'}]};
 const history=[],renders=[];
 const ctx=vm.createContext({$:()=>null,state,personalCalendarUI:{invalidate(){}},leavePageLayoutEditor:()=>true,confirm:()=>true,rememberView:()=>history.push([state.activeWorkspaceId,state.view]),pushViewHistory:()=>history.push([state.activeWorkspaceId,state.view]),toast(){},setSidebarOpen(){},window:{scrollTo(){}},render:()=>renders.push([state.activeWorkspaceId,state.view])});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'personal-navigation.js'),'utf8').replace('export function','function'),ctx);
 vm.runInContext(source.slice(source.indexOf('async function navigateToView('),source.indexOf('function metric(')),ctx);
 ctx.switchWorkspace=async id=>{state.activeWorkspaceId=id;state.view='dashboard';return true;};
 return {ctx,state,history,renders,run:code=>vm.runInContext(code,ctx)};
}
test('private navigation saves team history before switching and retains the target day',async()=>{
 const h=harness();
 assert.equal(await h.run("navigateToView('day',{calendarScope:'personal',calendarDay:'2026-09-04'})"),true);
 assert.deepEqual(h.history,[['team','work'],['private','day']]);
 assert.equal(h.state.calendarDay,'2026-09-04');assert.equal(h.state.calendarScope,'personal');
 assert.deepEqual(h.renders,[['private','day']]);
});
test('private navigation respects cancelled draft transition and ignores stale account completion',async()=>{
 const h=harness();h.ctx.switchWorkspace=async()=>false;
 assert.equal(await h.run("navigateToView('personal')"),false);assert.equal(h.state.view,'work');assert.equal(h.renders.length,0);
 h.ctx.switchWorkspace=async id=>{h.state.activeWorkspaceId=id;h.state.me={id:2};return true;};
 assert.equal(await h.run("navigateToView('personal')"),false);assert.equal(h.renders.length,0);
});
test('legacy private routes resolve to personal scope while team calendars stay in their project',()=>{
 const h=harness();
 for(const view of ['personal','calendar','day']) assert.equal(h.run(`personalRoute({view:'${view}',calendarScope:'personal',workspaceId:'team'},state.workspaces).workspaceId`),'private');
 assert.equal(h.run("personalRoute({view:'calendar',calendarScope:'project',workspaceId:'team'},state.workspaces).workspaceId"),'team');
 assert.equal(h.run("personalRoute({view:'personal',workspaceId:'team'},[]).workspaceId"),'');
});

test('sidebar calendar follows the current workspace even after visiting a personal calendar',async()=>{
 const h=harness();h.state.calendarScope='personal';
 assert.equal(await h.run("navigateToView('calendar')"),true);
 assert.equal(h.state.activeWorkspaceId,'team');assert.equal(h.state.calendarScope,'project');assert.equal(h.state.view,'calendar');
 h.state.activeWorkspaceId='private';h.state.calendarScope='project';
 assert.equal(await h.run("navigateToView('calendar')"),true);
  assert.equal(h.state.activeWorkspaceId,'private');assert.equal(h.state.calendarScope,'personal');
});

test('only an explicit calendar source context preserves its allowed workspace', () => {
 const h = harness();
 assert.equal(h.run("personalRoute({view:'calendar',calendarScope:'personal',workspaceId:'team',calendarContextWorkspaceId:'team'},state.workspaces).workspaceId"),'team');
 for (const context of ['', 'private', 'unknown']) assert.equal(h.run(`personalRoute({view:'calendar',calendarScope:'personal',workspaceId:'team',calendarContextWorkspaceId:'${context}'},state.workspaces).workspaceId`),'private');
 assert.equal(h.run("personalRoute({view:'calendar',calendarScope:'personal',workspaceId:'unknown',calendarContextWorkspaceId:'unknown'},state.workspaces).workspaceId"),'private');
 assert.equal(h.run("personalRoute({view:'personal',workspaceId:'team',calendarContextWorkspaceId:'team'},state.workspaces).workspaceId"),'private');
 assert.equal(h.run("personalRoute({view:'day',calendarScope:'personal',workspaceId:'team',calendarContextWorkspaceId:'team'},state.workspaces).workspaceId"),'private');
 for (const view of ['personal', 'day', 'work']) assert.equal(h.run(`personalRoute({view:'${view}',calendarScope:'personal',workspaceId:'team',calendarContextWorkspaceId:'team'},state.workspaces).calendarContextWorkspaceId`),'');
 assert.equal(h.run("personalRoute({view:'calendar',calendarScope:'invalid',workspaceId:'team',calendarContextWorkspaceId:'team'},state.workspaces).calendarContextWorkspaceId"),'');
});

test('normal sidebar navigation clears the previous inline calendar source context', async () => {
 const h = harness(); h.state.calendarContextWorkspaceId = 'team'; h.state.calendarScope = 'personal';
 assert.equal(await h.run("navigateToView('calendar')"),true);
 assert.equal(h.state.activeWorkspaceId,'team'); assert.equal(h.state.calendarScope,'project');
 assert.equal(h.state.calendarContextWorkspaceId,'');
});
