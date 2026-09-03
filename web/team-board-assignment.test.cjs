const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');

test('unassigned editable cards of every kind offer board assignment', () => {
  const fn = source.slice(source.indexOf('function renderRecordCustomFieldsRead('), source.indexOf('function completionLabel('));
  const context = { state: { collections: [] }, icon: () => '', escapeHTML: String };
  vm.createContext(context); vm.runInContext(fn, context);
  for (const type of ['goal','task','question_set','idea','criterion','research','decision','disagreement','document','meeting','risk','hypothesis','experiment','inbox']) {
    assert.match(context.renderRecordCustomFieldsRead({type}, true), /data-assign-record-board/);
    assert.match(context.renderRecordCustomFieldsRead({type}, true), /Добавить на доску/);
    assert.doesNotMatch(context.renderRecordCustomFieldsRead({type}, false), /data-assign-record-board/);
  }
});

test('team settings expose current team roles and direct exit without project subsets', () => {
  const settings = source.slice(source.indexOf('async function openTeamSettings('), source.indexOf('function renderNav('));
  assert.match(settings, /data-team-leave/);
  assert.match(settings, /Рабочее пространство команды/);
  assert.doesNotMatch(settings, /id="team-project-form"|data-team-panel="projects"/);
  assert.match(source, /Администратор управляет только этой командой/);
});
