const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(__dirname+'/personal-review.js')).toString('base64'));

test('weekly review moves by calendar weeks across month and leap boundaries',async()=>{
  const {reviewWeekShift}=await load();
  assert.equal(reviewWeekShift('2026-03-02',-7),'2026-02-23');
  assert.equal(reviewWeekShift('2024-02-26',7),'2024-03-04');
  assert.equal(reviewWeekShift('2026-12-28',7),'2027-01-04');
});

test('weekly review exposes four explicit and distinct planning choices',async()=>{
  const {reviewActionLabels}=await load(), entries=Object.entries(reviewActionLabels);
  assert.deepEqual(entries.map(([key])=>key),['next_week','skip','postpone','fix']);
  assert.equal(new Set(entries.map(([,label])=>label)).size,4);
});

test('habit result treats omitted zero counters as zero and uses Russian count forms',async()=>{
  const {reviewHabitResultText}=await load();
  assert.equal(reviewHabitResultText({recorded:1,partial:1,totalValue:15.5,unit:'мин'}),'1 отметка · 0 выполнено · 1 частично · 15.5 мин');
  assert.match(reviewHabitResultText({recorded:2,success:2}),/^2 отметки/);
  assert.match(reviewHabitResultText({recorded:5,success:5}),/^5 отметок/);
  assert.doesNotMatch(reviewHabitResultText({recorded:1}),/undefined/);
});
