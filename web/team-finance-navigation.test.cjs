const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
for (const file of ['personal-navigation.js', 'settings-hub.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8').replaceAll('export function', 'function'), context);
}
const spaces = [{id:'mine',kind:'personal'}, {id:'a',kind:'team'}, {id:'b',kind:'team'}];
const route = input => JSON.parse(JSON.stringify(context.personalRoute(input, spaces)));

test('team finance stays in the selected team instead of redirecting to personal income', () => {
  for (const workspaceId of ['a','b']) {
    const actual = route({view:'finance',workspaceId});
    assert.equal(actual.workspaceId, workspaceId);
    assert.equal(actual.view, 'finance');
    assert.equal(actual.personalTab, undefined);
  }
});

test('personal finance routes remain private even when opened from a team', () => {
  const actual = route({view:'personal:finance',workspaceId:'a'});
  assert.equal(actual.workspaceId, 'mine');
  assert.equal(actual.view, 'personal');
  assert.equal(actual.personalTab, 'finance');
  const alias = route({view:'finance',workspaceId:'mine'});
  assert.equal(alias.workspaceId,'mine');
  assert.equal(alias.view,'personal');
  assert.equal(alias.personalTab,'finance');
});

test('the settings hub names personal finance explicitly and separates team sources', () => {
  const shared = context.settingsHubSections({personal:false,canConfigure:true,workspaceName:'Team A'});
  const personal = shared.find(x=>x.id==='personal').rows.find(x=>x.key==='finance');
  assert.equal(personal.title,'Личные финансы');
  const team = shared.find(x=>x.id==='workspace').rows.find(x=>x.key==='team-finance');
  assert.equal(team.title,'Финансы команды');
  assert.match(team.description,/источника/);
  const privateSections = context.settingsHubSections({personal:true,canConfigure:true});
  assert.equal(privateSections.flatMap(x=>x.rows).some(x=>x.key==='team-finance'),false);
});
