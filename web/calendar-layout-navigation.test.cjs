const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

function harness() {
  const state = { view: 'calendar', calendarScope: 'personal', calendarMonth: '2026-09', calendarDay: '2026-09-04', calendarExpanded: 'personal', activeWorkspaceId: 'personal-workspace', interfacePreferences: { layout: { pages: { 'calendar:personal': { blockSpans: { month: 4, heading: 8 }, order: ['filters', 'month', 'heading'] } } } } };
  const events = [];
  const context = vm.createContext({ state, confirm: () => false, toast: message => events.push(['toast', message]), rememberView: () => events.push(['remember', state.calendarScope]), pushViewHistory: () => events.push(['push', state.calendarScope]), renderCalendarPage: () => events.push(['render', state.calendarScope]) });
  for (const [start, end] of [['function pageLayoutKey(', 'function pageLayoutCatalog('], ['function pageLayoutDirty(', 'function startPageLayoutEditor('], ['function changeCalendarScope(', 'function renderCalendarPage(']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
  }
  return { state, events, context, run: code => vm.runInContext(code, context) };
}

test('cancelled calendar scope change preserves the complete draft, source and history', () => {
  const h = harness();
  const draft = { key: 'calendar:personal', value: { blockSpans: { month: 5 }, texts: { heading: 'Несохранённое название' } }, baseline: '{}' };
  h.state.pageLayoutDraft = draft;
  assert.equal(h.run("changeCalendarScope('project')"), false);
  assert.equal(h.state.pageLayoutDraft, draft);
  assert.equal(h.state.calendarScope, 'personal');
  assert.equal(h.state.calendarExpanded, 'personal');
  assert.equal(h.state.activeWorkspaceId, 'personal-workspace');
  assert.equal(h.state.calendarContextWorkspaceId, undefined);
  assert.deepEqual(h.events, []);
});

test('approved calendar scope change renders inherited saved geometry and preserves selected month/day', () => {
  const h = harness(); h.context.confirm = () => true;
  h.state.pageLayoutDraft = { key: 'calendar:personal', value: { blockSpans: { month: 5 } }, baseline: '{}' };
  assert.equal(h.run("changeCalendarScope('project')"), true);
  assert.equal(h.state.pageLayoutDraft, null);
  assert.equal(h.run('currentPageLayout().blockSpans.month'), 4);
  assert.equal(h.state.calendarMonth, '2026-09');
  assert.equal(h.state.calendarDay, '2026-09-04');
  assert.equal(h.state.activeWorkspaceId, 'personal-workspace');
  assert.equal(h.state.calendarContextWorkspaceId, 'personal-workspace');
  assert.equal(h.state.calendarExpanded, '');
  assert.deepEqual(h.events, [['remember', 'personal'], ['push', 'project'], ['render', 'project']]);
  assert.equal(h.run("changeCalendarScope('personal')"), true);
  assert.equal(h.run('currentPageLayout().blockSpans.month'), 4);
});

test('same calendar scope and invalid scope are no-ops even with a dirty draft', () => {
  const h = harness(); const draft = { key: 'calendar:personal', value: { density: 'compact' }, baseline: '{}' };
  h.state.pageLayoutDraft = draft;
  h.context.confirm = () => { throw new Error('No navigation should be attempted'); };
  for (const scope of ['personal', '', 'other']) assert.equal(h.run(`changeCalendarScope('${scope}')`), false);
  assert.equal(h.state.pageLayoutDraft, draft);
  assert.deepEqual(h.events, []);
});

test('calendar scope stays put while page settings are being saved', () => {
  const h = harness(); h.state.pageLayoutSaving = true;
  assert.equal(h.run("changeCalendarScope('project')"), false);
  assert.equal(h.state.calendarScope, 'personal');
  assert.deepEqual(h.events.map(event => event[0]), ['toast']);
});
