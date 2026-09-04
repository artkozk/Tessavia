const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const context=vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'personal-today.js'),'utf8').replaceAll('export function','function'),context);
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
