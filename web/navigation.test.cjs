const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function harness() {
  const entries = [];
  const state = { me: { id: 1 }, view: 'work', search: 'server', workViewMode: 'board', activeWorkspaceId: 'team', layoutDraft: null, workspaces: [{id:'team',kind:'team'},{id:'private',kind:'personal'}] };
  const history = {
    state: null,
    replaceState(entry) { this.state = entry; entries[entries.length ? entries.length - 1 : 0] = entry; },
    pushState(entry) { this.state = entry; entries.push(entry); },
  };
  const window = { scrollY: 240, scrollTo({top}) { this.scrollY = top; } };
  const context = vm.createContext({$:()=>null, state, history, window, structuredClone, confirm: () => true, toast() {}, setSidebarOpen() {}, render() {}, requestAnimationFrame(fn) { fn(); }, async switchWorkspace(id) { state.activeWorkspaceId = id; return true; } });
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'personal-navigation.js'),'utf8').replace('export function','function'),context);
  vm.runInContext(source.slice(source.indexOf('const routeFields ='), source.indexOf('const widgetNames =')), context);
  vm.runInContext(source.slice(source.indexOf('async function navigateToView('), source.indexOf('function metric(')), context);
  vm.runInContext(source.slice(source.indexOf('function pageLayoutDirty('), source.indexOf('function startPageLayoutEditor(')), context);
  return { state, history, window, context, entries, run: (code) => vm.runInContext(code, context) };
}

test('notifications back restores the work view, board, filter and scroll', async () => {
  const h = harness();
  h.run('initializeViewHistory(); navigateToView("notifications");');
  assert.equal(h.entries.length, 2);
  assert.equal(h.history.state.businessControlDepth, 1);
  h.history.state = h.entries[0];
  await h.run('restoreViewHistory(history.state)');
  assert.equal(h.state.view, 'work');
  assert.equal(h.state.search, 'server');
  assert.equal(h.state.workViewMode, 'board');
  assert.equal(h.window.scrollY, 240);
  h.history.state = h.entries[1];
  await h.run('restoreViewHistory(history.state)');
  assert.equal(h.state.view, 'notifications');
});

test('repeated opening of a section does not add duplicate entries', () => {
  const h = harness(); h.run('initializeViewHistory(); navigateToView("notifications"); navigateToView("notifications");');
  assert.equal(h.entries.length, 2);
});

test('history excludes record bodies and ignores entries of another account', async () => {
  const h = harness(); h.state.activeDetail = { description: 'private-body' };
  h.run('initializeViewHistory()');
  assert.equal(JSON.stringify(h.history.state).includes('private-body'), false);
  h.history.state = { businessControlAccount: 2, businessControlView: {view:'chat'} };
  await h.run('restoreViewHistory(history.state)');
  assert.equal(h.state.view, 'work');
});

test('overlay route is not overwritten by scrolling or draft edits', () => {
  const h = harness(); h.run('initializeViewHistory()');
  const entry = { ...h.history.state, businessControlOverlay: 'personal-dialog' };
  h.history.state = entry; h.window.scrollY = 600;
  h.run('rememberView()');
  assert.equal(h.history.state, entry);
  assert.equal(h.history.state.businessControlView.scrollY, 240);
});

test('reload restores section but does not resurrect an orphaned dialog', () => {
  const h = harness();
  h.state.activeWorkspaceId = 'private'; // loadData resolves the legacy scope before loading profiles.
  h.history.state = { businessControlAccount:1, businessControlOverlay:'personal-dialog', businessControlView:{workspaceId:'team',view:'personal',personalTab:'notes'} };
  h.run('initializeViewHistory()');
  assert.equal(h.state.view, 'personal');
  assert.equal(h.state.personalTab, 'notes');
  assert.equal(h.history.state.businessControlOverlay, undefined);
});

test('a delayed Back cannot replace a newer navigation or a different account', async () => {
  for(const change of ['view','account']) {
    const h=harness();let finish;
    h.context.switchWorkspace=async id=>{h.state.activeWorkspaceId=id;await new Promise(resolve=>{finish=resolve;});return true;};
    h.context.entry={businessControlAccount:1,businessControlView:{workspaceId:'two',view:'chat',scrollY:900}};
    const restoring=h.run('restoreViewHistory(entry)');
    if(change==='view')h.run('navigateToView("work")');else h.state.me={id:2};
    const expectedView=h.state.view,expectedScroll=h.window.scrollY;
    finish();await restoring;
    assert.equal(h.state.view,expectedView);assert.equal(h.window.scrollY,expectedScroll);
  }
});

test('Back repairs a legacy private route without changing its tab or scroll', async()=>{
  const h=harness();h.run('initializeViewHistory()');
  h.history.state={businessControlAccount:1,businessControlView:{workspaceId:'team',view:'personal',personalTab:'habits',scrollY:110}};
  await h.run('restoreViewHistory(history.state)');
  assert.equal(h.state.activeWorkspaceId,'private');assert.equal(h.state.personalTab,'habits');
  assert.equal(h.window.scrollY,110);assert.equal(h.history.state.businessControlView.workspaceId,'private');
});

test('reload and Back preserve an explicitly switched calendar workspace and layout profile', async () => {
  const h = harness();
  h.state.view = 'calendar'; h.state.calendarScope = 'personal';
  h.state.calendarContextWorkspaceId = 'team'; h.state.calendarMonth = '2026-10';
  h.state.interfacePreferences = { marker: 'team-calendar-layout' };
  h.history.state = { businessControlAccount: 1, businessControlView: { view: 'calendar', workspaceId: 'team', calendarScope: 'personal', calendarContextWorkspaceId: 'team', calendarMonth: '2026-09', calendarDay: '2026-09-04', scrollY: 180 } };
  h.run('initializeViewHistory()');
  assert.equal(h.state.activeWorkspaceId, 'team');
  assert.equal(h.state.calendarScope, 'personal');
  assert.equal(h.state.calendarMonth, '2026-09');
  assert.equal(h.history.state.businessControlView.workspaceId, 'team');
  h.state.calendarScope = 'project';
  h.context.switchWorkspace = async () => { throw new Error('Explicit calendar source must not switch workspace'); };
  await h.run('restoreViewHistory(history.state)');
  assert.equal(h.state.calendarScope, 'personal');
  assert.equal(h.state.activeWorkspaceId, 'team');
  assert.equal(h.state.interfacePreferences.marker, 'team-calendar-layout');
  assert.equal(h.window.scrollY, 180);
});

test('restoring old history cannot borrow explicit calendar context from a later entry', async () => {
  const h = harness();
  h.state.view = 'calendar'; h.state.calendarScope = 'personal'; h.state.calendarContextWorkspaceId = 'team';
  const oldEntry = { businessControlAccount: 1, businessControlView: { view: 'calendar', workspaceId: 'team', calendarScope: 'project' } };
  h.history.state = oldEntry;
  await h.run('restoreViewHistory(history.state)');
  assert.equal(h.state.activeWorkspaceId, 'team');
  assert.equal(h.state.calendarScope, 'project');
  assert.equal(h.state.calendarContextWorkspaceId, '');
  h.run('rememberView()');
  assert.equal(h.history.state.businessControlView.calendarContextWorkspaceId, '');
  h.state.viewHistoryInitialized = false; h.state.calendarContextWorkspaceId = 'stale-workspace';
  h.run('initializeViewHistory()');
  assert.equal(h.state.calendarContextWorkspaceId, '');
});

test('personal startup and legacy dashboard history open personal home while calendar dates survive',()=>{
 for(const entry of [null,{view:'dashboard',workspaceId:'private'},{view:'day',workspaceId:'private',calendarScope:'personal',calendarDay:'2026-09-21'}]){
  const h=harness();h.state.activeWorkspaceId='private';h.state.view='dashboard';
  if(entry)h.history.state={businessControlAccount:1,businessControlView:entry};
  h.run('initializeViewHistory()');assert.equal(h.state.view,entry?.view==='day'?'day':'personal');
  if(entry?.view==='day')assert.equal(h.state.calendarDay,'2026-09-21');else assert.equal(h.state.calendarScope,'personal');
 }
});
