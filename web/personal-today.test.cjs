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


test('forecasts resolve in Today without entering real plan storage or exposing completion controls',async()=>{
 const forecast={id:'recurrence:series:2026-09-07',calendarKind:'recurrence',title:'Review',occurrenceDate:'2026-09-07',status:'planned'};
 const state={me:{id:1},view:'personal',personalTab:'today'};
 const summary={date:'2026-09-07',settings:{timezone:'UTC'},focus:{},recurrences:[forecast],today:[forecast.id],events:[forecast.id],upcoming:[forecast.id],projectWork:{items:[]},projectAttention:{items:[]},timeKnown:false};
 const root={},button={dataset:{todayOpen:forecast.id}};let opened=null,realCalls=0,rowCalls=0;
 const ctx=vm.createContext({Intl,Date,encodeURIComponent,setInterval(){},document:{querySelector:s=>s==='.today-focus'?root:null,querySelectorAll:s=>s==='[data-today-open]'?[button]:[]}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'personal-today.js'),'utf8').replaceAll('export function','function'),ctx);
 const ui=ctx.createPersonalTodayUI({state,api:()=>Promise.resolve(summary),escapeHTML:String,icon:()=>'',renderPersonal(){},renderPlanRow(){rowCalls++;return 'real-row';},formatMinutes:String,openPlan(){realCalls++;},openRecurrence:item=>opened=item});
 ui.bind();await new Promise(setImmediate);ui.bind();button.onclick();assert.equal(opened,forecast);assert.equal(realCalls,0);
 const data={plans:[],links:[],projects:[],goals:[]};const html=ui.renderPlans(data);
 assert.match(html,/Повторение по серии/);assert.match(html,/7 дней/);assert.equal(rowCalls,0);assert.equal(data.plans.length,0);
 assert.ok(!ctx.todayHiddenBlocks(data,summary,false,false).includes('plans'));
 state.me={id:2};opened=null;button.onclick();assert.equal(opened,null);assert.equal(realCalls,0);
});


test('an occurrence materialized in another tab refreshes personal sources before replacing the forecast',async()=>{
 const state={me:{id:1},view:'personal',personalTab:'today',personal:{plans:[]}},summary={focus:{},upcoming:['new-real'],recurrences:[]};
 let refreshes=0,ui;
 const ctx=vm.createContext({Intl,Date,encodeURIComponent,setInterval(){},document:{querySelector:s=>s==='.today-focus'?{}:null,querySelectorAll:()=>[]}});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'personal-today.js'),'utf8').replaceAll('export function','function'),ctx);
 ui=ctx.createPersonalTodayUI({state,api:()=>Promise.resolve(summary),escapeHTML:String,icon:()=>'',renderPersonal(){},refreshPersonal:async()=>{refreshes++;state.personal.plans=[{id:'new-real',title:'Created elsewhere',status:'planned'}];ui.invalidate();},renderPlanRow:plan=>plan.title});
 ui.bind();await new Promise(setImmediate);assert.equal(refreshes,1);
 ui.bind();await new Promise(setImmediate);assert.equal(refreshes,1);
 assert.match(ui.renderPlans({plans:state.personal.plans,links:[]}),/Created elsewhere/);
});
