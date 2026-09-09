const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

function harness() {
  const calls = [];
  const state = { me: { id: 7 }, activeWorkspaceId: 'team', view: 'work', workspacePages: [], collections: [{ id: 'chosen' }, { id: 'other' }] };
  const context = vm.createContext({ state, activeWorkspace: () => ({teamId:'team-id'}), canConfigureWorkspace: () => true,
    openCollectionSettingsDialog: collection => calls.push(['board', collection.id]), openWorkspacePageEditor: page => calls.push(['source',page.id]),
    pageAppUI: { edit: page => calls.push(['app',page.id]), share: () => calls.push(['share']) },
    openProfile: id => calls.push(['profile',id]), openNavigationSettings: key => calls.push(['navigation',key]),
    reminderSettingsUI: {open: () => calls.push(['reminders'])}, personalTodayUI: {openSettings: () => calls.push(['day'])},
    leaveSettingsFor: action => action(), startPageLayoutEditor: () => calls.push(['layout']), $: () => null });
  vm.runInContext(source.slice(source.indexOf('async function runSettingsAction('),source.indexOf('function openAppearanceSettings(')),context);
  return {state,context,calls, run:(key,overrides={}) => context.runSettingsAction(key,{context:{userId:7,workspaceId:'team',view:'work',collectionId:'chosen',...overrides}})};
}

test('settings edits the selected board and refuses stale workspace/account/view context', async () => {
  const h=harness(); await h.run('board-settings'); assert.deepEqual(h.calls,[['board','chosen']]);
  for(const bad of [{userId:9},{workspaceId:'another'},{view:'personal'}]) await assert.rejects(h.run('board-settings',bad),/Пространство изменилось/);
  assert.equal(h.calls.length,1);
});

test('member can customize their view and personal preferences but cannot edit shared schema', async () => {
  const h=harness();h.context.canConfigureWorkspace=()=>false;
  await assert.rejects(h.run('board-settings'),/администратор/);
  await h.run('page-edit');await h.run('profile');await h.run('reminders');await h.run('day');
  assert.deepEqual(h.calls,[['layout'],['profile',7],['reminders'],['day']]);
});

test('custom page structure and record-page source use the current page, not a previous editor', async () => {
  const h=harness();h.state.workspacePages=[{id:'app',app:true},{id:'list',app:false}];
  await h.run('page-edit',{pageId:'app'});await h.run('source-settings',{pageId:'list'});
  assert.deepEqual(h.calls,[['app','app'],['source','list']]);
  h.context.canConfigureWorkspace=()=>false;
  await assert.rejects(h.run('page-edit',{pageId:'app'}),/администратор/);
  await assert.rejects(h.run('source-settings',{pageId:'list'}),/администратор/);
});
