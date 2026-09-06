const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'personal-today.js'),'utf8').replaceAll('export function','function'),context);

test('first note does not activate empty tools, but real work and signals remain visible',()=>{
 const data={plans:[],notes:[{id:'note',inInbox:true}],habits:[],projects:[],goals:[],settings:{}};
 const day={focus:{planId:''},today:[],events:[],completed:[],upcoming:[],overdue:[],projectWork:{total:0},projectAttention:{total:0},timeKnown:false};
 let hidden=context.todayHiddenBlocks(data,day,false,false);
 for(const key of ['summary','plans','habits','life','day-time','day-attention','day-project-work','day-waiting','day-reminders'])assert.ok(hidden.includes(key),key);
 assert.ok(!hidden.includes('notes'));
 data.plans.push({id:'work',status:'planned'});data.habits.push({id:'habit',paused:false});
 hidden=context.todayHiddenBlocks(data,{...day,today:['work'],events:['work'],overdue:['work'],projectWork:{total:1}},true,true);
 for(const key of ['plans','habits','day-time','day-attention','day-project-work','day-waiting','day-reminders'])assert.ok(!hidden.includes(key),key);
});

test('configured time, completed day and future work are useful even without active work today',()=>{
 const data={plans:[{id:'done',status:'done'},{id:'future',status:'planned'}],notes:[],habits:[{paused:true},{archivedAt:'yesterday'}],settings:{birthDate:'1990-01-01'}};
 const hidden=context.todayHiddenBlocks(data,{focus:{},completed:['done'],upcoming:['future'],timeKnown:true},true,true);
 for(const key of ['plans','day-time','life','day-waiting','day-reminders'])assert.ok(!hidden.includes(key),key);
 assert.ok(hidden.includes('habits'));
});

test('saved layouts and their editor preserve explicit choices, including showing empty blocks',()=>{
 assert.equal(context.useProgressiveToday({},false),true);
 assert.equal(context.useProgressiveToday({},true),false);
 assert.equal(context.useProgressiveToday({order:['life','plans'],hiddenBlocks:[]},false),false);
 assert.equal(context.useProgressiveToday({blockSpans:{life:6}},false),false);
});
test('day sections only resolve available personal entities and keep future work separate',()=>{
 const plans=[{id:'now',status:'planned'},{id:'later',status:'planned'},{id:'done',status:'done'}];
 const groups=context.todayPlanGroups(plans,{today:['now','revoked'],upcoming:['later'],completed:['done'],focus:{planId:'done'}});
 assert.deepEqual(Array.from(groups.today,item=>item.id),['now']);assert.equal(groups.upcoming[0].id,'later');assert.equal(groups.focus.status,'done');
 assert.equal(context.todayPlanGroups(plans,{focus:{planId:'missing'}}).focus,null);
 assert.equal(context.todayPlanGroups(plans,null).today.length,0);
});

test('calendar includes the second day of a time block but excludes an exact midnight end',()=>{
 const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),ctx=vm.createContext({localDateKey:value=>new Date(value).toISOString().slice(0,10)});
 vm.runInContext(source.slice(source.indexOf('function plannerRange('),source.indexOf('function plannerItems(')),ctx);
 const plan={startsAt:'2026-09-03T23:00:00Z',endsAt:'2026-09-04T01:00:00Z'};
 assert.equal(ctx.plannerMatchesDay(plan,'2026-09-04',true),true);
 assert.equal(ctx.plannerMatchesDay({...plan,endsAt:'2026-09-04T00:00:00Z'},'2026-09-04',true),false);
});
