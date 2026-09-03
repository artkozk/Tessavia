const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const fragment = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

test('personal navigation and create menu expose projects, goals, tasks and events', () => {
  const render = fragment('function renderPersonal()', 'function renderPersonalNotes(');
  assert.match(render, /\['projects', 'Проекты'\]/);
  assert.match(render, /\['goals', 'Цели'\]/);
  assert.match(render, /data-personal-create="project"/);
  assert.match(render, /data-personal-create="goal"/);
  assert.match(render, /Дело или событие/);
  assert.match(render, /Незавершённые дела/);
});

test('personal planning editor keeps deadline, time block, recurrence and actual time distinct', () => {
  const editor = fragment('function personalProjectFields(', 'function openPersonalLinkDialog(') + fragment('function personalPlanDateFields(', 'function personalPlanDateLabel(');
  for (const field of ['itemKind', 'projectId', 'goalId', 'parentId', 'plannedMinutes', 'actualMinutes', 'startsAt', 'endsAt', 'recurrenceCadence', 'occurrenceDate', 'applyToSeries']) {
    assert.match(editor, new RegExp(`name="${field}"`));
  }
  assert.match(editor, /\/api\/personal\/plans\/\$\{item\.id\}\/series/);
  assert.match(source, /\/api\/personal\/plans\/\$\{id\}\/skip/);
});

test('calendar uses a recurring occurrence without inventing a deadline', () => {
  const context = vm.createContext({localDateKey: () => '2026-09-03'});
  vm.runInContext(fragment('function plannerRange(', 'function plannerMatchesDay('), context);
  context.item = {occurrenceDate: '2026-09-04', dueAt: null, startDate: '', startsAt: null};
  assert.deepEqual(Array.from(vm.runInContext('plannerRange(item,true)', context)), ['2026-09-04', '2026-09-04']);
  assert.deepEqual(Array.from(vm.runInContext('plannerRange(item,false)', context)), ['', '']);
});

test('private search labels and opens projects and goals as personal entities', () => {
  const search = fragment('function renderPersonalSearchResult(', 'function renderSearchResult(');
  assert.match(search, /project:'Личный проект'/);
  assert.match(search, /goal:'Цель'/);
  assert.match(fragment('async function runGlobalSearch(', 'function setAuthMode('), /openPersonalEditor\(button\.dataset\.personalType/);
});
