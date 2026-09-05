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
test('compact book labels follow the canonical catalogue and split at the testaments',async()=>{
 const {readingBookShortName,readingTestament}=await modulePromise;
 assert.equal(readingBookShortName(1),'Быт');
 assert.equal(readingBookShortName(39),'Мал');
 assert.equal(readingBookShortName(40),'Мф');
 assert.equal(readingBookShortName(45),'Рим');
 assert.equal(readingBookShortName(59),'Иак');
 assert.equal(readingBookShortName(66),'Откр');
 assert.equal(readingTestament(39),'old');
 assert.equal(readingTestament(40),'new');
});
test('reading forms have scoped drafts, safe rendering and no offline writes',()=>{
 const source=fs.readFileSync(__dirname+'/reading.js','utf8');
 assert.ok(source.includes('`reading:${context}:${draft}`'));
 assert.ok(source.includes("'X-Outbox-Owner': String(state.me.id)"));
 assert.ok(source.includes('e(item.note'));
 assert.ok(!source.includes('outbox.enqueue'));
 assert.ok(source.includes('context !== key()'));
 const sw=fs.readFileSync(__dirname+'/sw.js','utf8');
 assert.ok(sw.includes("'/reading.js?v=20260905-reading-mobile-2'"));
});
test('chapter grid uses a one-tap complete personal mark and keeps editing deliberate',()=>{
 const source=fs.readFileSync(__dirname+'/reading.js','utf8');
 assert.ok(source.includes('data-reading-fast'));
 assert.ok(source.includes("complete: true, stream: 'personal', note: '', shared: false"));
 assert.ok(source.includes('if (existing) { entryForm({}, existing); return; }'));
 assert.ok(source.includes("toastAction(`${bookName(book)} ${chapter} — прочитано`, 'Добавить пометку'"));
 assert.ok(source.includes("['read', 'Чтение']"));
 assert.ok(source.includes('<h4>Ветхий Завет</h4>'));
 assert.ok(source.includes('<h4>Новый Завет</h4>'));
 assert.ok(!source.includes('outbox.enqueue'));
});
test('mobile reader keeps books in a picker and suggestions navigate without recording',()=>{
 const source=fs.readFileSync(__dirname+'/reading.js','utf8');
 const styles=fs.readFileSync(__dirname+'/styles.css','utf8');
 assert.ok(source.includes('data-reading-book-picker'));
 assert.ok(source.includes('class="reading-book-picker"'));
 assert.ok(source.includes("bookGrid('old','data-reading-pick')"));
 assert.ok(source.includes("bookGrid('new','data-reading-pick')"));
 assert.ok(source.includes("onclick = openSuggested"));
 assert.ok(source.includes("tab = 'read'; paint()"));
 assert.ok(styles.includes('.reading-page > .reading-heading { display: none; }'));
 assert.ok(styles.includes('.reading-catalog { display: none; }'));
 assert.ok(styles.includes('flex-wrap: nowrap; overflow-x: auto'));
});
test('standalone reflections are private by default, editable and separate from reading marks',()=>{
 const source=fs.readFileSync(__dirname+'/reading.js','utf8');
 assert.ok(source.includes("call(item?`/reflections/${item.id}`:'/reflections'"));
 assert.ok(source.includes("item?.shared?'checked':''"));
 assert.ok(source.includes('она не отмечает чтение и не меняет серию'));
 assert.ok(source.includes('e(item.body)'));
 assert.ok(source.includes("`reflection:${item?.id||'new'}`"));
});
