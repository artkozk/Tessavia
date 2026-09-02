const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const fragment = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));

test('explicit close flushes a draft without asking again; storage failure keeps the window', async () => {
  let saved = 0, closed = 0, canSave = true;
  const dialog = {id:'personal-dialog',open:true,dataset:{},close() {closed++;this.open=false;}};
  const context = vm.createContext({toast() {},dialog,flushDialogDrafts(){saved++;return canSave;},dialogHasUnsavedChanges:()=>true,confirm(){throw Error('Unexpected prompt');},discardComposerChanges:()=>true});
  vm.runInContext(fragment('async function confirmDialogTransition(', 'function preventImplicitWorkspaceSubmit('), context);
  assert.equal(await vm.runInContext('requestDialogClose(dialog)', context), true);
  assert.equal(saved, 1); assert.equal(closed, 1);
  dialog.open=true; canSave=false;
  assert.equal(await vm.runInContext('requestDialogClose(dialog)', context), false);
  assert.equal(closed, 1); assert.equal(dialog.open,true);
});

test('Escape target follows opening order, not placement of dialogs in HTML', () => {
  const first={id:'first',dataset:{openOrder:'9'}}, second={id:'second',dataset:{openOrder:'2'}};
  const context=vm.createContext({$$:()=>[first,second]});
  vm.runInContext(fragment('function topOpenDialog(', 'function pointerIsOutsideDialog('),context);
  assert.equal(vm.runInContext('topOpenDialog().id',context),'first');
  const keyboard=source.slice(source.indexOf("if (event.key === 'Escape')",source.indexOf('function bindGlobalEvents(')),source.indexOf("document.addEventListener('click'",source.indexOf('function bindGlobalEvents(')));
  assert.ok(keyboard.includes('requestDialogClose(dialog)'));
  assert.ok(!keyboard.includes('signalProtectedDialog'));
});

test('calendar format and zoom are separated across account, project, device and personal scope', () => {
  const values=new Map(),state={me:{id:1},activeWorkspaceId:'one'};
  let device='desktop';
  const context=vm.createContext({state,interfaceDevice:()=>device,localStorage:{getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)},toast(){}});
  vm.runInContext(fragment('function calendarPresentationKey(', 'function calendarPresentationToolbar('),context);
  const run=code=>vm.runInContext(code,context);
  run("saveCalendarPresentation('work',{format:'circles',zoom:160})");
  assert.equal(run("calendarPresentation('work').zoom"),160);
  device='mobile'; assert.equal(run("calendarPresentation('work').zoom"),100);
  device='desktop';state.activeWorkspaceId='two';assert.equal(run("calendarPresentation('work').format"),'grid');
  run("saveCalendarPresentation('personal',{format:'circles',zoom:500})");
  state.activeWorkspaceId='three';assert.equal(run("calendarPresentation('personal').zoom"),180);
  state.me.id=2;assert.equal(run("calendarPresentation('personal').zoom"),100);
});

test('passed time and completion require distinct states; review at 100 percent is not complete', () => {
  const context=vm.createContext({localDateKey:value=>String(value).slice(0,10)});
  vm.runInContext(fragment('function calendarScore(', 'function quarterClass('),context);
  vm.runInContext(fragment('function calendarTimeState(', 'function calendarCircle('),context);
  assert.equal(vm.runInContext("calendarTimeState('2026-09-01','2026-09-03')",context),'elapsed');
  assert.equal(vm.runInContext("calendarTimeState('2026-09-03','2026-09-03')",context),'current');
  assert.equal(vm.runInContext("calendarTimeState('2026-09-04','2026-09-03')",context),'future');
  const score=vm.runInContext("calendarScore([{dueAt:'2026-09-02',status:'review',progress:100},{dueAt:'2026-09-02',status:'completed',progress:100}], '2026-09-01','2026-09-07')",context);
  assert.equal(score.completed,1);assert.equal(score.planned,2);assert.equal(score.percent,50);
});

test('risk closure distinguishes prevention from addressing an occurred risk', () => {
  const context=vm.createContext({});
  vm.runInContext(fragment('const statusLabels =', 'const statusesByType ='),context);
  vm.runInContext(fragment('function completionLabel(', 'function renderRecordLifecycle('),context);
  assert.equal(vm.runInContext("statusLabel({type:'risk',status:'completed'})",context),'Предотвращён');
  assert.equal(vm.runInContext("completionLabel({type:'risk',businessDetails:{occurred:true}})",context),'Последствия устранены');
});

test('radio color and multiple choices survive draft serialization', () => {
  const fields=[{name:'color',type:'radio',value:'green',checked:true},{name:'color',type:'radio',value:'blue',checked:false},{name:'module',type:'checkbox',value:'work',checked:true},{name:'module',type:'checkbox',value:'chat',checked:false}];
  const context=vm.createContext({CSS:{escape:value=>value},$$:selector=>selector==='[name]'?fields:fields.filter(field=>selector.includes('"'+field.name+'"'))});
  vm.runInContext(fragment('function workingDraftValues(', 'function loadWorkingDraft('),context);
  const values=vm.runInContext('workingDraftValues({})',context);
  assert.equal(values.color,'green');assert.equal(JSON.stringify(values.module),'["work"]');
});

test('active calendar filter excludes a prevented risk', () => {
  const context=vm.createContext({state:{records:[{type:'risk',status:'completed'},{type:'task',status:'planned'}],workType:'all',workstreamFilter:'all',workStatus:'active'},isWorkRecord:()=>true,isActiveRecord:record=>record.status!=='completed'});
  vm.runInContext(fragment('function calendarRecordPool(', 'function recordsByDueDate('),context);
  assert.equal(vm.runInContext('calendarRecordPool().length',context),1);
  assert.equal(vm.runInContext('calendarRecordPool()[0].type',context),'task');
});
