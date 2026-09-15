const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function harness() {
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  const state = { activeWorkspaceId: 'team', workspaces: [{id:'team',kind:'team'},{id:'mine',kind:'personal'}],
    projectNavigation:{enabledViews:['dashboard','work','calendar','collections','chat']},
    workspacePages:[], interfacePreferences:{} };
  const context = vm.createContext({state});
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'personal-navigation.js'), 'utf8').replaceAll('export function','function'), context);
  vm.runInContext(source.slice(source.indexOf('const navItems = ['), source.indexOf('const state = {')), context);
  vm.runInContext(source.slice(source.indexOf('function navigationCatalog('), source.indexOf('function navCount(')), context);
  return {state, context,
    catalog: preferences => Array.from(context.navigationCatalog(preferences)),
    visible: preferences => Array.from(context.navigationCatalog(preferences)).filter(item=>context.navigationItemVisible(item, preferences)).map(item=>item.key)};
}

test('older team profiles offer finance in menu settings without enabling it for everyone', () => {
  const h = harness();
  assert.equal(h.catalog({}).filter(item=>item.key==='finance').length,1);
  assert.equal(h.catalog({}).find(item=>item.key==='finance').defaultVisible,false);
  assert.deepEqual(h.visible({}),['personal','dashboard','work','calendar','collections','chat']);
  assert.equal(h.state.projectNavigation.enabledViews.includes('finance'),false);
});

test('saving finance in a personal team menu survives reloading and keeps the team route', () => {
  const h = harness();
  const order = h.catalog({}).map(item=>item.key);
  const saved = JSON.parse(JSON.stringify({navOrder:order, hiddenNavItems:[],hiddenNavGroups:[]}));
  const restored = harness();
  assert.equal(restored.visible(saved).includes('finance'),true);
  assert.equal(restored.visible(saved).some(key=>key==='personal:finance'),false);
  assert.equal(restored.context.personalRoute({view:'finance',workspaceId:'team'},restored.state.workspaces).workspaceId,'team');
});

test('unchecked finance remains hidden after a complete catalogue order is saved', () => {
  const h = harness();
  const saved = {navOrder:h.catalog({}).map(item=>item.key),hiddenNavItems:['finance']};
  assert.equal(h.visible(saved).includes('finance'),false);
  assert.equal(h.visible({...saved,hiddenNavItems:[]}).includes('finance'),true);
  assert.equal(h.visible({...saved,hiddenNavItems:[],hiddenNavGroups:['Работа']}).includes('finance'),false);
});

test('a mobile opt-in does not change the desktop menu or another team profile', () => {
  const h = harness();
  const mobile = {navOrder:['finance','work'],hiddenNavItems:[]};
  assert.equal(h.visible(mobile)[0],'finance');
  assert.equal(h.visible({}).includes('finance'),false);
  h.state.activeWorkspaceId='another'; h.state.workspaces.push({id:'another',kind:'team'});
  assert.equal(h.visible({}).includes('finance'),false);
});

test('explicit shared finance, hidden choices and private routes keep their previous meaning', () => {
  const h = harness();
  h.state.projectNavigation.enabledViews.push('finance');
  assert.equal(h.visible({}).includes('finance'),true);
  assert.equal(h.visible({hiddenNavItems:['finance']}).includes('finance'),false);
  h.state.activeWorkspaceId='mine';
  assert.equal(h.catalog({}).some(item=>item.key==='finance'),false);
  assert.equal(h.catalog({}).some(item=>item.key==='personal:finance'),true);
  assert.equal(h.visible({}).includes('personal:finance'),false);
});
