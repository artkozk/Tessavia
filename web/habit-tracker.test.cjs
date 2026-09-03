const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/habit-tracker.js', 'utf8');
const load = async () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('habit date navigation keeps leap-day and year boundaries', async () => {
 const { habitRange, shiftHabitDate } = await load();
 assert.deepEqual(habitRange('2024-03-31','month',-1),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(habitRange('2026-01-01','week'),{from:'2025-12-26',to:'2026-01-01'});
 const range=habitRange('2026-09-04','quarter');assert.equal((new Date(range.to)-new Date(range.from))/86400000+1,84);
 assert.equal(shiftHabitDate('2024-02-28',1),'2024-02-29');
});
test('anti habit labels distinguish missing data, clean days and excess', async () => {
 const {habitStateLabel,habitScheduleLabel}=await load();
 assert.equal(habitStateLabel({state:'pending',rule:{mode:'quit'}}),'Нет отметки');
 assert.equal(habitStateLabel({state:'success',rule:{mode:'quit'}}),'День без действия');
 assert.equal(habitStateLabel({state:'failed',rule:{mode:'reduce'}}),'Лимит превышен');
 assert.equal(habitScheduleLabel({cadence:'weekly',periodTarget:3,periodMeasure:'days'}),'3 успешных дней за неделю');
 assert.equal(habitScheduleLabel({cadence:'monthly',periodTarget:300,periodMeasure:'volume',unit:'мин'}),'300 мин за месяц');
});
test('habit UI and modified queue parse and respect the production CSP', () => {
 new vm.Script(source.replace(/^export /gm,''));
 new vm.Script(fs.readFileSync(__dirname+'/outbox-ui.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,''));
 assert.doesNotMatch(source,/style="/);
 const embed=fs.readFileSync(__dirname+'/assets.go','utf8');assert.match(embed,/habit-tracker\.js/);
 const sw=fs.readFileSync(__dirname+'/sw.js','utf8');assert.match(sw,/habit-tracker\.js\?v=/);
});
