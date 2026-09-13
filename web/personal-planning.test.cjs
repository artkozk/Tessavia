const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const fragment = (from, to) => source.slice(source.indexOf(from), source.indexOf(to));

test('personal navigation and create menu expose projects, goals, tasks and events', () => {
  const render = fragment('function renderPersonal()', 'function renderPersonalNotes(');
  const context=vm.createContext({icon:()=>'',state:{personalTab:'today'}});
  vm.runInContext(fs.readFileSync(require('node:path').join(__dirname,'personal-navigation.js'),'utf8').replaceAll('export function','function'),context);
  vm.runInContext(fragment('function renderPersonalCreateMenu(', 'function renderPersonalTab('),context);
  const pages=context.personalNavigationItems(),menu=context.renderPersonalCreateMenu();
  assert.equal(pages.some(item=>item.key==='personal:projects'),true);assert.equal(pages.some(item=>item.key==='personal:goals'),true);
  assert.match(menu, /data-personal-create="project"/);assert.match(menu, /data-personal-create="goal"/);assert.match(menu, /Дело или событие/);
  assert.match(render, /Незавершённые дела/);
});

test('personal planning editor keeps deadline, time block, recurrence and actual time distinct', () => {
  const editor = fragment('function personalProjectFields(', 'function openPersonalLinkDialog(') + fragment('function personalPlanDateFields(', 'function personalPlanDateLabel(');
  for (const field of ['itemKind', 'projectId', 'goalId', 'parentId', 'plannedMinutes', 'actualMinutes', 'startsAt', 'endsAt', 'recurrenceCadence', 'occurrenceDate', 'applyToSeries']) {
    assert.match(editor, new RegExp(`name="${field}"`));
  }
  assert.match(editor, /\/api\/personal\/plans\/\$\{item\.id\}\/series/);
  assert.match(source, /\/api\/personal\/plans\/\$\{id\}\/skip/);
});

test('calendar uses a recurring occurrence without inventing a deadline', () => {
  const context = vm.createContext({localDateKey: () => '2026-09-03'});
  vm.runInContext(fragment('function plannerRange(', 'function plannerMatchesDay('), context);
  context.item = {occurrenceDate: '2026-09-04', dueAt: null, startDate: '', startsAt: null};
  assert.deepEqual(Array.from(vm.runInContext('plannerRange(item,true)', context)), ['2026-09-04', '2026-09-04']);
  assert.deepEqual(Array.from(vm.runInContext('plannerRange(item,false)', context)), ['', '']);
});

test('private search labels and opens projects and goals as personal entities', () => {
  const search = fragment('function renderPersonalSearchResult(', 'function renderSearchResult(');
  assert.match(search, /project:'Личный проект'/);
  assert.match(search, /goal:'Цель'/);
  assert.match(fragment('async function runGlobalSearch(', 'function setAuthMode('), /openPersonalEditor\(button\.dataset\.personalType/);
});

test('recurrence scope keeps rule controls explicit and shifts only calendar dates of a moved instance',()=>{
 const code=fragment('function personalRecurrenceLabel(', 'function personalPlanContextFields(');
 const ctx=vm.createContext({Date,Number,Event,escapeHTML:value=>String(value),icon:()=>''});vm.runInContext(code,ctx);
 const markup=ctx.personalRecurrenceFields({seriesId:'series',occurrenceDate:'2026-09-07',recurrence:{cadence:'weekly',interval:1,active:true,template:{title:'Original template'}}});
 assert.match(markup,/data-series-settings disabled/);assert.match(markup,/Original template/);assert.match(markup,/Изменить все незавершённые повторения/);
 const fields={startDate:{value:'2026-09-07'},endDate:{value:'2026-09-09'},startsAt:{value:'2026-09-07T10:00'},endsAt:{value:'2026-09-07T11:00'},dueAt:{value:''}};
 ctx.shiftPersonalOccurrenceDates({elements:fields},'2026-09-07','2026-09-14');
 assert.equal(fields.startsAt.value,'2026-09-14T10:00');assert.equal(fields.endsAt.value,'2026-09-14T11:00');assert.equal(fields.endDate.value,'2026-09-16');assert.equal(fields.dueAt.value,'');
 let scopeChange;const settings={disabled:false},notice={hidden:false},scope={checked:false,addEventListener(_event,fn){scopeChange=fn;}},cadence={value:'weekly',addEventListener(){}};
 const form={elements:{applyToSeries:scope,recurrenceCadence:cadence,recurrenceInterval:{},recurrenceStartDate:{},recurrenceUntilDate:{}},querySelector:selector=>selector==='[data-series-settings]'?settings:notice};
 ctx.bindPersonalRecurrenceScope(form);assert.equal(settings.disabled,true);assert.equal(notice.hidden,true);scope.checked=true;scopeChange();assert.equal(settings.disabled,false);assert.equal(notice.hidden,false);
});
