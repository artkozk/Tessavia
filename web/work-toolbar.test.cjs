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

test('team scope has an explicit plural label and preserves saved partner keys', () => {
  const toolbar = slice('function renderWorkList()', 'function renderWorkBoardToolbar()');
  assert.match(toolbar, /\['partner', 'Других участников'\]/);
  assert.doesNotMatch(toolbar, /Партнёра/);
  assert.match(toolbar, /aria-label="Поиск в очереди работы"/);
  assert.match(toolbar, /aria-label="Чья работа"/);
  assert.match(toolbar, /aria-pressed=/);
  assert.match(css, /\.work-scope \.segment \{ flex: 1 1 auto; \}/);
  assert.doesNotMatch(css, /\.work-scope \.segment \{ flex: 1; \}/);
});

test('both list and calendar include every other participant, with owner filter taking precedence', () => {
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
    state.workScope = 'all';
    assert.equal(context[fn]().length, 3);
    state.workScope = 'partner';
  }
});
