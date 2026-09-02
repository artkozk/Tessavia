const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function harness() {
  const state = {calendarScope:'personal', calendarStatus:'active', collections:[], records:[], personal:{plans:[]}};
  const context = vm.createContext({ state, localDateKey: date => date.toISOString().slice(0,10), isActiveRecord: item => item.status !== 'completed', isWorkRecord: () => true });
  vm.runInContext(source.slice(source.indexOf('function plannerRange('), source.indexOf('function plannerTone(')), context);
  vm.runInContext(source.slice(source.indexOf('function personalLinksFor('), source.indexOf('function renderPersonalLinkChips(')), context);
  return {state, run: code => vm.runInContext(code, context)};
}
test('multi-day personal plans cover both boundaries and never require enumerating their duration', () => {
  const h = harness();
  h.state.personal.plans = [{id:'trip',startDate:'2026-09-05',endDate:'2026-09-06',status:'planned'}];
  assert.equal(h.run("plannerMatchesDay(plannerItems()[0], '2026-09-05', true)"), true);
  assert.equal(h.run("plannerMatchesDay(plannerItems()[0], '2026-09-06', true)"), true);
  assert.equal(h.run("plannerMatchesDay(plannerItems()[0], '2026-09-07', true)"), false);
  assert.equal(h.run("plannerMatchesDay({}, '2026-09-05', true)"), false);
});
test('personal and project filters do not mix data or mutate source records', () => {
  const h = harness();
  h.state.personal.plans = [{id:'private',status:'planned'}];
  h.state.records = [{id:'team',status:'in_progress',ownerId:1,collectionId:'a'}, {id:'other',status:'completed',ownerId:2,collectionId:'b'}];
  assert.equal(h.run('plannerItems()[0].id'), 'private');
  h.state.calendarScope='project'; h.state.calendarCollection='a'; h.state.calendarOwner='1';
  assert.equal(h.run('plannerItems().length'), 1);
  assert.equal(h.run('plannerItems()[0].id'), 'team');
  h.state.calendarStatus='done'; assert.equal(h.run('plannerItems().length'), 0);
  assert.equal(h.state.records.length, 2);
});
test('a note created first appears in its linked plan, reverse duplicates are collapsed', () => {
  const h = harness();
  const links = [{id:'l1',sourceType:'note',sourceId:'n',sourceTitle:'Shopping',targetType:'plan',targetId:'p',targetTitle:'Trip'}, {id:'l2',sourceType:'plan',sourceId:'p',sourceTitle:'Trip',targetType:'note',targetId:'n',targetTitle:'Shopping'}];
  h.state.links = links;
  assert.equal(h.run("personalLinksFor(state.links,'plan','p').length"),1);
  assert.equal(h.run("personalLinksFor(state.links,'plan','p')[0].targetTitle"),'Shopping');
  assert.equal(h.run("personalLinksFor(state.links,'note','n')[0].targetTitle"),'Trip');
  assert.equal(links[0].targetType, 'plan');
});
