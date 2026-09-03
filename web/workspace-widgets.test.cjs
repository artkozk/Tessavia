const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname,'app.js'),'utf8');
function harness() {
  const state={view:'personal',calendarScope:'personal',records:[],personal:{plans:[],notes:[],links:[]},interfacePreferences:{}};
  const context=vm.createContext({state,localDateKey:d=>d.toISOString().slice(0,10)});
  for(const [start,end] of [['function plannerRange(','function plannerTone('],['function noteCalendarDate(','function openDayWorkspace('],['function pageWidgetsSupported(','function widgetScaleKey('],['function pageBlockGeometry(','function applyBlockGeometry('],['function pageLayoutKey(','function pageLayoutCatalog(']]) {
    vm.runInContext(source.slice(source.indexOf(start),source.indexOf(end)),context);
  }
  return {state,run:code=>vm.runInContext(code,context)};
}
test('notes default to their creation date, explicit rescheduling never changes creation',()=>{
  const h=harness();
  assert.equal(h.run("noteCalendarDate({createdAt:'2026-09-03T10:00:00Z'})"),'2026-09-03');
  assert.equal(h.run("noteCalendarDate({createdAt:'2026-09-03T10:00:00Z',scheduledDate:'2026-09-05'})"),'2026-09-05');
  assert.equal(h.run("noteCalendarDate({createdAt:'2026-09-03T10:00:00Z',scheduledDate:''})"),'');
});
test('day collects dated and linked notes once, supports both directions and multi-day completed plans',()=>{
  const h=harness();h.state.personal={plans:[{id:'p',startDate:'2026-09-05',endDate:'2026-09-06',status:'done'},{id:'archived',startDate:'2026-09-05',status:'archived'}],notes:[{id:'n',scheduledDate:'2026-09-05'},{id:'linked',createdAt:'2026-09-01T12:00:00Z'},{id:'other',scheduledDate:'2026-09-07'}],links:[{sourceType:'note',sourceId:'n',targetType:'plan',targetId:'p'},{sourceType:'plan',sourceId:'p',targetType:'note',targetId:'linked'}]};
  assert.equal(h.run("dayWorkspaceItems('personal','2026-09-05').notes.length"),2);
  assert.equal(h.run("dayWorkspaceItems('personal','2026-09-06').notes.length"),2);
  assert.equal(h.run("dayWorkspaceItems('personal','2026-09-05').records.length"),1);
  assert.equal(h.run("dayWorkspaceItems('personal','2026-09-04').notes.length"),0);
});
test('project day never includes private notes and includes prevented risk and dated document',()=>{
  const h=harness();h.state.personal.notes=[{id:'private',scheduledDate:'2026-09-05'}];
  h.state.records=[{id:'risk',type:'risk',status:'completed',dueAt:'2026-09-05T12:00:00Z'},{id:'doc',type:'document',dueAt:'2026-09-05T12:00:00Z'},{id:'old',type:'task',status:'archived',dueAt:'2026-09-05T12:00:00Z'}];
  assert.equal(h.run("dayWorkspaceItems('project','2026-09-05').records[0].id"),'risk');
  assert.equal(h.run("dayWorkspaceItems('project','2026-09-05').notes.length"),1);
  assert.equal(h.run("dayWorkspaceItems('project','2026-09-05').notes[0].id"),'doc');
});
test('widgets are scoped and available on working pages, not inserted into the live chat canvas',()=>{
  const h=harness();assert.ok(h.run("workspaceWidgetCatalog().some(b=>b.key==='widget:calendar')"));
  assert.ok(h.run("workspaceWidgetCatalog().some(b=>b.key==='widget:notes')"));
  h.state.view='dashboard';assert.ok(!h.run("workspaceWidgetCatalog().some(b=>b.key==='widget:notes')"));
  for(const view of ['dashboard','work','collections','page:custom','calendar','day']){h.state.view=view;assert.ok(h.run('workspaceWidgetCatalog().length')>0,view);}
  h.state.view='chat';assert.equal(h.run('workspaceWidgetCatalog().length'),0);
});
test('geometry clamps to grid and calendar/day profiles are scoped but not keyed by individual dates',()=>{
  const h=harness();
  assert.equal(h.run("pageBlockGeometry({blockSpans:{x:8},blockSettings:{x:{column:12,height:3000}}},{key:'x'}).column"),5);
  assert.equal(h.run("pageBlockGeometry({blockSettings:{x:{height:3000}}},{key:'x',span:4}).height"),1600);
  assert.equal(h.run("pageBlockGeometry({},{key:'x',span:4}).height"),0);
  h.state.view='day';assert.equal(h.run('pageLayoutKey()'),'day:personal');h.state.calendarDay='2028-01-01';assert.equal(h.run('pageLayoutKey()'),'day:personal');h.state.calendarScope='project';assert.equal(h.run('pageLayoutKey()'),'day:project');
});
test('dashboard defaults preserve legacy visibility and widths until the new page is saved',()=>{
  const h=harness();h.state.view='dashboard';h.state.interfacePreferences={dashboardWidgets:['capacity','focus'],layout:{widgetSpans:{focus:6},pages:{}}};
  assert.equal(h.run('currentPageLayout().order[0]'),'heading');assert.equal(h.run('currentPageLayout().order[1]'),'capacity');assert.equal(h.run('currentPageLayout().blockSpans.focus'),6);assert.ok(h.run("currentPageLayout().hiddenBlocks.includes('capture')"));
});
test('visible zoom slider is gone; all work calendar day modes open the day workspace',()=>{
  assert.doesNotMatch(source.slice(source.indexOf('function calendarPresentationToolbar('),source.indexOf('function calendarSurfaceClass(')),/type="range"/);
  assert.match(source,/data-calendar-open=/);assert.match(source,/openCalendarDay\(button.dataset.calendarDay\)/);
});

test('an option outside the dialog rectangle remains part of the dialog, not its backdrop',()=>{
  const target={},dialog={contains:node=>node===target,getBoundingClientRect:()=>({left:100,right:400,top:100,bottom:300})};
  const context=vm.createContext({dialog,target});
  vm.runInContext(source.slice(source.indexOf('function pointerIsOutsideDialog('),source.indexOf('function bindDialogBackdrop(')),context);
  assert.equal(vm.runInContext('pointerIsOutsideDialog({target,clientX:200,clientY:350},dialog)',context),false);
  assert.equal(vm.runInContext('pointerIsOutsideDialog({target:dialog,clientX:200,clientY:350},dialog)',context),true);
});
