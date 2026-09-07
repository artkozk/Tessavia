const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/personal-calendar.js','utf8').replaceAll('export function','function');
function harness(){
 const state={me:{id:1},view:'calendar',calendarScope:'personal'},calls=[];let resolve,reject,renders=0;
 const ctx=vm.createContext({Intl,URLSearchParams,Date,document:{visibilityState:'visible'},setTimeout:()=>0,clearTimeout(){}});
 vm.runInContext(source,ctx);
 const ui=ctx.createPersonalCalendarUI({state,api:path=>{calls.push(path);return new Promise((ok,bad)=>{resolve=ok;reject=bad;});},esc:String,icon:()=>'',rerender:()=>renders++});
 return {state,ui,calls,resolve:result=>resolve(result),reject:()=>reject(new Error('Offline')),renders:()=>renders};
}
test('hidden work still produces a reviewable conflict banner and failures never report an empty schedule',async()=>{
 const h=harness();h.ui.ensure('2026-09-01','2026-10-01');assert.match(h.ui.banner(),/Проверяем/);
 assert.ok(!h.calls[0].includes('includeWork'));h.resolve({work:[],conflicts:[{id:'pair',confirmed:false}]});await new Promise(setImmediate);
 assert.match(h.ui.banner(),/Пересечения по времени: 1/);assert.match(h.ui.banner(),/скрытая рабочая занятость/);
 h.ui.ensure('2026-09-01','2026-10-01',true);h.reject();await new Promise(setImmediate);
 assert.match(h.ui.banner(),/Не удалось проверить/);assert.match(h.ui.banner(),/Повторить/);
});
test('late private calendar responses cannot populate another account or a changed period',async()=>{
 for(const change of ['account','period']){
  const h=harness();h.ui.ensure('2026-09-01','2026-10-01');const resolve=h.resolve;
  if(change==='account')h.state.me={id:2};else h.ui.invalidate();
  resolve({work:[{id:'secret'}],conflicts:[]});await new Promise(setImmediate);
  assert.equal(h.ui.entries().length,0);assert.equal(h.renders(),0);
 }
});

test('unchanged periodic responses do not redraw the calendar and steal keyboard focus',async()=>{
 const h=harness(),result={work:[],conflicts:[]};
 h.ui.ensure('2026-09-01','2026-10-01');h.resolve(result);await new Promise(setImmediate);
 assert.equal(h.renders(),1);
 h.ui.ensure('2026-09-01','2026-10-01',true);h.resolve(result);await new Promise(setImmediate);
 assert.equal(h.renders(),1);
});

test('forecast preview is read-only until explicit opening and ignores a late response after dismissal',async()=>{
 for(const mode of ['calendar','today','dismiss']){
  const dismiss=mode==='dismiss';
  const state={me:{id:1},view:'calendar',calendarScope:'personal'},dialog={open:false},button={disabled:false},error={hidden:true},close={};
  const root={innerHTML:'',contains:b=>b===button,querySelector:s=>s==='[data-close]'?close:s==='[data-materialize]'?button:error};
  const calls=[];let resolve,opened='',refreshes=0;
  const ctx=vm.createContext({Intl,URLSearchParams,Date,encodeURIComponent,document:{visibilityState:'visible',querySelector:s=>s==='#workspace-dialog'?dialog:root},setTimeout:()=>0,clearTimeout(){}});vm.runInContext(source,ctx);
  const item={id:'recurrence:s:2026-09-14',seriesId:'s',title:'Future',notes:'note',occurrenceDate:'2026-09-14',recurrence:{updatedAt:'v1'}};
  const ui=ctx.createPersonalCalendarUI({state,api:(path,options)=>{calls.push({path,options});return options?new Promise(ok=>resolve=ok):Promise.resolve({work:[],conflicts:[],recurrences:[item]});},esc:String,icon:()=>'',rerender(){},openModal:d=>d.open=true,closeDialog:d=>{d.open=false;return true;},openPlan:id=>opened=id,refreshPersonal:()=>{refreshes++;},toast(){}});
  if(mode!=='today'){ui.ensure('2026-09-01','2026-10-01');await new Promise(setImmediate);}
  await ui.openRecurrence(item.id,mode==='today'?item:null);
  const reads=mode==='today'?0:1;assert.equal(calls.length,reads);assert.equal(dialog.open,true);assert.match(root.innerHTML,/Будущее повторение/);
  const pending=button.onclick({currentTarget:button});await button.onclick({currentTarget:button});assert.equal(calls.length,reads+1);
  assert.equal(JSON.parse(calls[reads].options.body).expectedSeriesUpdatedAt,'v1');
  if(dismiss)close.onclick();resolve({id:'real'});await pending;
  assert.equal(opened,dismiss?'':'real');assert.equal(refreshes,dismiss?0:1);assert.equal(button.disabled,false);
 }
});
