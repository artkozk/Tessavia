import { test } from 'node:test';
import assert from 'node:assert/strict';
import { lifePeriods } from '../web/life-map.js';

test('months count anniversaries, not calendar-month changes', () => {
  const before = lifePeriods('2000-01-31', 80, '2000-02-01');
  assert.equal(before.completed, 0); assert.equal(before.current, 0);
  assert.equal(before.periods[0].end, '2000-02-29');
  const next = lifePeriods('2000-01-31', 80, '2000-02-29');
  assert.equal(next.completed, 1); assert.equal(next.periods[1].end, '2000-03-31');
});
test('weeks use civil days, preserve a partial last week and ignore DST', () => {
  const model = lifePeriods('2024-03-30', 1, '2024-04-06', 'weeks');
  assert.equal(model.completed, 1); assert.equal(model.current, 1);
  assert.equal(model.periods.length, 53); assert.equal(model.periods.at(-1).days, 1);
  assert.equal(model.periods.reduce((sum, period) => sum + period.days, 0), model.totalDays);
});
test('leap birthdays and exceeded horizons stay bounded without a false current period', () => {
  const model = lifePeriods('2000-02-29', 1, '2001-02-28', 'weeks');
  assert.equal(model.end, '2001-02-28'); assert.equal(model.passed, true);
  assert.equal(model.current, -1); assert.equal(model.percent, 100);
  assert.equal(model.completed, model.periods.length);
});
test('all periods form a continuous bounded horizon', () => {
  for (const unit of ['months', 'weeks']) for (const years of [1,70,80,90,100,150]) {
    const model = lifePeriods('1988-02-29', years, '2026-09-04', unit);
    assert.equal(model.periods[0].start, '1988-02-29');
    assert.equal(model.periods.at(-1).end, model.end);
    for (let i=1;i<model.periods.length;i++) assert.equal(model.periods[i-1].end, model.periods[i].start);
    assert.ok(model.periods.filter(p => p.state === 'current').length <= 1);
  }
});
test('invalid or future dates and invalid horizons do not create plausible statistics', () => {
  for (const [birth,years] of [['2026-02-30',80],['2027-01-01',80],['',80],['2000-01-01',0],['2000-01-01',151],['2000-01-01',1.2]]) assert.equal(lifePeriods(birth, years, '2026-09-04'), null);
});
