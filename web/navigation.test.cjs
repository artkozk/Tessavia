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
  const context = vm.createContext({ state, history, window, structuredClone, confirm: () => true, toast() {}, setSidebarOpen() {}, render() {}, requestAnimationFrame(fn) { fn(); }, async switchWorkspace(id) { state.activeWorkspaceId = id; return true; } });
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
