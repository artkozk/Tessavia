const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(__dirname+'/reading.js','utf8')).toString('base64'));
test('age uses calendar days and distinguishes never from old',async()=>{
 const {readingAge}=await modulePromise;
 assert.equal(readingAge('', '2026-09-04').key,'never');
 for(const [day,key] of [['2026-09-04','recent'],['2026-08-28','recent'],['2026-08-27','month'],['2026-08-05','month'],['2026-08-04','old'],['2025-09-04','distant']])assert.equal(readingAge(day,'2026-09-04').key,key);
 assert.equal(readingAge('2026-09-03','2026-09-04').label,'1 дн. назад');
});
test('Tuesday default includes today and crosses year correctly',async()=>{
 const {nextTuesday}=await modulePromise;
 assert.equal(nextTuesday('2026-09-04'),'2026-09-08');
 assert.equal(nextTuesday('2026-09-08'),'2026-09-08');
 assert.equal(nextTuesday('2026-12-31'),'2027-01-05');
});
test('book coverage counts distinct complete chapters, not repeated or partial marks',async()=>{
 const {readingBookState}=await modulePromise;
 const result=readingBookState({id:43,chapters:21},[{book:43,chapter:5,complete:true,day:'2026-09-01'},{book:43,chapter:5,complete:true,day:'2026-09-02'},{book:43,chapter:6,complete:false,day:'2026-09-04'}],'2026-09-04');
 assert.equal(result.count,1);assert.equal(result.last,'2026-09-04');
});
test('reading forms have scoped drafts, safe rendering and no offline writes',()=>{
 const source=fs.readFileSync(__dirname+'/reading.js','utf8');
 assert.ok(source.includes('`reading:${context}:${draft}`'));
 assert.ok(source.includes("'X-Outbox-Owner': String(state.me.id)"));
 assert.ok(source.includes('e(item.note'));
 assert.ok(!source.includes('outbox.enqueue'));
 assert.ok(source.includes('context !== key()'));
 const sw=fs.readFileSync(__dirname+'/sw.js','utf8');
 assert.ok(sw.includes("'/reading.js?v=20260904-reading-1'"));
});
