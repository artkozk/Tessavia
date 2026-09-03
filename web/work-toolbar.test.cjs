const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));

test('input defaults keep toggle exclusions at zero specificity so search padding wins', () => {
  assert.match(css, /input:where\(:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)\)/);
  assert.doesNotMatch(css, /input:not\(\[type="checkbox"\]\):not\(\[type="radio"\]\)/);
  assert.match(css, /\.work-search input, \.graph-search input\s*\{\s*padding-left: 36px;/);
  assert.match(css, /input\[type="checkbox"\], input\[type="radio"\]\s*\{[^}]*width: 18px;[^}]*padding: 0;/);
});

test('toolbar offers other work only in a project with another participant', () => {
  const toolbar = slice('function renderWorkList()', 'function renderWorkBoardToolbar()');
  const helpers = slice('function hasOtherProjectParticipants()', 'function workFilterCount()');
  const state = { activeWorkspaceId: 'team', workspaces: [{ id: 'team', kind: 'team' }], users: [{ id: 1 }, { id: 2 }], me: { id: 1 } };
  const context = vm.createContext({ state });
  vm.runInContext(helpers, context);
  assert.equal(JSON.stringify(context.workScopeOptions()), JSON.stringify([['all', 'Вся'], ['mine', 'Моя'], ['partner', 'Других']]));
  state.workScope = 'partner'; context.normalizeWorkScope(); assert.equal(state.workScope, 'partner');
  state.users = [{ id: 1 }];
  assert.equal(JSON.stringify(context.workScopeOptions()), JSON.stringify([['all', 'Вся'], ['mine', 'Моя']]));
  context.normalizeWorkScope(); assert.equal(state.workScope, 'all');
  state.workScope = 'partner'; state.workspaces[0].kind = 'personal'; state.users.push({ id: 2 });
  context.normalizeWorkScope(); assert.equal(state.workScope, 'all');
  for (const [previous, expected] of [[undefined, 'all'], ['unknown', 'all'], ['all', 'all'], ['mine', 'mine']]) {
    state.workScope = previous; context.normalizeWorkScope(); assert.equal(state.workScope, expected);
  }
  assert.match(toolbar, /workScopeOptions\(\)\.map/);
  assert.match(toolbar, /\? 'Работа других участников'/);
  assert.doesNotMatch(toolbar, /Партнёра|Других участников/);
  assert.match(toolbar, /aria-label="Поиск в очереди работы"/);
  assert.match(toolbar, /aria-label="Чья работа"/);
  assert.match(toolbar, /aria-pressed=/);
  assert.match(css, /\.work-scope \{ width: max-content; max-width: 100%; justify-self: start; \}/);
  const scopeBlocks = css.match(/\.work-scope\s*\{[^}]*\}/g) || [];
  assert.equal(scopeBlocks.some((block) => /(?:^|[;{])\s*width:\s*100%/.test(block)), false);
  assert.match(css, /\.work-scope \.segment \{ flex: 0 0 auto; \}/);
});

test('list and calendar show every other participant and preserve specific-owner precedence', () => {
  const state = { me: { id: 1 }, records: [1, 2, 3].map(ownerId => ({ id: String(ownerId), ownerId, type: 'task', status: 'planned' })),
    workScope: 'partner', workType: 'all', workstreamFilter: 'all', workStatus: 'active', workOrder: 'priority' };
  const context = vm.createContext({ state, isWorkRecord: () => true, isActiveRecord: () => true, sortWorkRecords: () => 0 });
  vm.runInContext(slice('function filteredWorkRecords()', 'function renderWorkKanban(') + slice('function calendarRecordPool()', 'function recordsByDueDate('), context);
  for (const fn of ['filteredWorkRecords', 'calendarRecordPool']) {
    assert.deepEqual(Array.from(context[fn](), item => item.id), ['2', '3']);
    state.ownerFilter = '3';
    assert.deepEqual(Array.from(context[fn](), item => item.id), ['3']);
    state.ownerFilter = '';
    state.workScope = 'mine';
    assert.deepEqual(Array.from(context[fn](), item => item.id), ['1']);
    state.ownerFilter = '3';
    assert.deepEqual(Array.from(context[fn](), item => item.id), ['3']);
    state.ownerFilter = '';
    state.workScope = 'all';
    assert.equal(context[fn]().length, 3);
    state.workScope = 'partner';
  }
});

test('specific owner is visible in additional filters, counted and resettable', () => {
  const toolbar = slice('function renderWorkList()', 'function renderWorkBoardToolbar()');
  assert.match(toolbar, /Ответственный<select id="work-owner-select"/);
  assert.match(toolbar, /userOptions\(state.ownerFilter\)/);
  assert.match(toolbar, /\$\('#work-owner-select'\)\.addEventListener\('change'/);
  assert.match(toolbar, /data-reset-work-filters[^\n]*state.ownerFilter = ''/);
  const context = vm.createContext({ state: { workType: 'all', workstreamFilter: 'all', workStatus: 'active', workOrder: 'priority', ownerFilter: '' } });
  vm.runInContext(slice('function workFilterCount()', 'function hierarchyDepth('), context);
  assert.equal(context.workFilterCount(), 0);
  context.state.ownerFilter = '3';
  assert.equal(context.workFilterCount(), 1);
});
