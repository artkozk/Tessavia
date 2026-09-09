const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const c=vm.createContext({});
for(const name of ['habit-tracker.js','personal-today.js','page-data-sources.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,name),'utf8').replaceAll('\r\n','\n').replace(/^import .*;\n/gm,'').replaceAll('export ',''),c);
const run=code=>vm.runInContext(code,c);
c.e=value=>String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
test('habit feed respects schedule, success and pause rather than resetting daily marks',()=>{
 c.personal={habits:[{id:'a',title:'Walk',today:'2026-09-08',rule:{mode:'build',cadence:'daily'},days:[{date:'2026-09-08',state:'success',planned:true}]},{id:'b',title:'Rest day',today:'2026-09-08',rule:{mode:'build',cadence:'daily'},days:[{date:'2026-09-08',state:'rest',planned:false}]},{id:'c',paused:true}]};
 assert.equal(run("personalDataRows('habits',personal,null,'today').length"),1);assert.equal(run("personalDataRows('habits',personal,null,'today')[0].status"),'Выполнено');assert.equal(run("personalDataRows('habits',personal,null,'all').length"),2);
});
test('reading and completion are independent controls; partial/cancelled marks preserve notes and revision',()=>{
 c.rows=[{id:'1',reader:true,title:'Chapter',action:'Done'}];c.config={fields:[],hideAction:true};assert.ok(run('dataRowsMarkup(rows,config,e)').includes('data-source-read'));
 c.config.hideReader=true;assert.ok(!run('dataRowsMarkup(rows,config,e)').includes('data-source-read'));
 c.reading={today:'2026-09-08',entries:[{id:'p',book:43,chapter:2,day:'2026-09-08',note:'Keep private note',shared:false,updatedAt:'revision'}]};
 let request=run('readingCompletionRequest(reading,43,2)');assert.equal(request.method,'PATCH');assert.equal(request.body.note,'Keep private note');assert.equal(request.body.expectedUpdatedAt,'revision');assert.equal(request.body.shared,false);
 c.reading.cancelledEntries=[{...c.reading.entries[0],id:'c',chapter:3,cancelledAt:'time'}];request=run('readingCompletionRequest(reading,43,3)');assert.equal(request.body.restore,true);
 request=run('readingCompletionRequest(reading,43,4)');assert.equal(request.method,'POST');assert.equal(request.body.day,'2026-09-08');assert.equal(request.body.shared,false);
});
test('plan feed merges recurrence and real items without duplicates and filters day',()=>{
 c.personal={plans:[{id:'p',title:'Today',status:'planned'},{id:'d',title:'Done',status:'done'},{id:'later',title:'Later',status:'planned'}]};c.day={focus:{},today:['p'],completed:['d'],events:['p'],recurrences:[{id:'p',title:'duplicate',status:'planned'}]};
 assert.equal(JSON.stringify(run("personalDataRows('plans',personal,day,'today').map(r=>r.id)")),'["p","d"]');assert.equal(run("personalDataRows('plans',personal,day,'open').length"),2);
});
test('work feed deduplicates attention and assigned rows by workspace and record',()=>{
 c.day={projectWork:{items:[{id:'p',workspaceId:'one',title:'Work'}]},projectAttention:{items:[{id:'p',workspaceId:'one',title:'Work'}]}};assert.equal(run("personalDataRows('work',{},day).length"),1);
});
test('fields and actions can be hidden independently and user text stays escaped',()=>{
 c.rows=[{id:'a',title:'<img>',description:'private detail',status:'Done',action:'<script>'}];c.config={fields:['title'],hideAction:true};let html=run('dataRowsMarkup(rows,config,e)');assert.ok(html.includes('&lt;img&gt;'));assert.ok(!html.includes('private detail'));assert.ok(!html.includes('data-source-action'));
 c.config.fields=[];c.config.hideAction=false;html=run('dataRowsMarkup(rows,config,e)');assert.ok(html.includes('&lt;script&gt;'));assert.ok(!html.includes('<img>'));
});
