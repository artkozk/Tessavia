const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const source=fs.readFileSync(path.join(__dirname,'app.js'),'utf8');

function historyHarness(flags={}) {
  const dialog={id:'workspace-dialog',dataset:{...flags},open:true},state={},calls=[];
  const history={state:{businessControlView:{view:'work'}},pushState:entry=>calls.push(['push',entry])};
  let pop;
  const context=vm.createContext({state,history,window:{addEventListener:(name,callback)=>{if(name==='popstate')pop=callback;}},topOpenDialog:()=>dialog.open?dialog:null,
    flushDialogDrafts:d=>calls.push(['flush',d.id]),protectedWorkspaceDialogs:new Set(['profile-dialog']),
    signalProtectedDialog:(d,message)=>calls.push(['notice',message]),dialogHasUnsavedChanges:d=>d.dataset.composerDirty==='true',
    closeDialogImmediately:d=>{d.open=false;calls.push(['close',d.id]);}});
  vm.runInContext(source.slice(source.indexOf("window.addEventListener('popstate'"),source.indexOf("window.addEventListener('beforeunload'")),context);
  return {dialog,state,calls,pop:()=>pop({state:history.state})};
}

test('Back preserves changed settings above the hub until explicit save or discard',()=>{
  const h=historyHarness({composerDirty:'true'});h.pop();
  assert.equal(h.dialog.open,true);assert.equal(h.dialog.dataset.composerDirty,'true');assert.equal(h.dialog.dataset.historyState,'true');
  assert.deepEqual(h.calls.map(call=>call[0]),['flush','push','notice']);
  assert.equal(h.calls[1][1].businessControlOverlay,'workspace-dialog');assert.match(h.calls[2][1],/несохранённые изменения/);
});

test('Back cannot close settings while a write is pending, even if the form is not marked dirty',()=>{
  const h=historyHarness({settingsSaving:'true',composerDirty:'false'});h.pop();
  assert.equal(h.dialog.open,true);assert.equal(h.dialog.dataset.settingsSaving,'true');
  assert.deepEqual(h.calls.map(call=>call[0]),['flush','push','notice']);assert.match(h.calls[2][1],/сохраняются/);
});

test('Back closes a clean settings leaf and leaves the underlying hub history entry intact',()=>{
  const h=historyHarness({composerDirty:'false',settingsSaving:'false'});h.pop();
  assert.equal(h.dialog.open,false);assert.equal(h.dialog.dataset.historyState,'false');
  assert.deepEqual(h.calls.map(call=>call[0]),['flush','close']);
});

test('existing protected profile editor still requires explicit close when clean',()=>{
  const h=historyHarness();h.dialog.id='profile-dialog';h.pop();
  assert.equal(h.dialog.open,true);assert.deepEqual(h.calls.map(call=>call[0]),['flush','push','notice']);assert.match(h.calls[2][1],/Рабочее окно осталось открытым/);
});

test('an explicitly closed overlay resumes its scheduled transition once',()=>{
  const h=historyHarness();h.state.suppressOverlayPop=true;let transitions=0;h.state.afterOverlayClose=()=>transitions++;
  h.pop();assert.equal(transitions,1);assert.equal(h.state.suppressOverlayPop,false);assert.equal(h.state.afterOverlayClose,null);assert.equal(h.calls.length,0);
});

test('device tabs cannot replace the appearance form during an in-flight save',()=>{
  const dialog={dataset:{settingsSaving:'true'}},notices=[];let discarded=0;
  const ctx=vm.createContext({$:selector=>selector==='#workspace-dialog'?dialog:null,toast:message=>notices.push(message),discardComposerChanges:()=>{discarded++;throw new Error('must not discard');}});
  vm.runInContext(source.slice(source.indexOf('function openAppearanceSettings('),source.indexOf('function openSettingsBoards(')),ctx);
  ctx.openAppearanceSettings('mobile');assert.equal(discarded,0);assert.deepEqual(notices,['Дождитесь сохранения настроек']);assert.equal(dialog.dataset.settingsSaving,'true');
});

function transitionHarness({pendingLeaf=false,leafOpen=true,hubOpen=true,refuseLeaf=false}={}) {
  const hub={id:'settings-dialog',open:hubOpen,dataset:{historyState:'true'}},leaf={id:'workspace-dialog',open:leafOpen&&!pendingLeaf,dataset:{historyState:pendingLeaf?'false':'true'}};
  const stack=[{businessControlView:{view:'work'}},{businessControlOverlay:'settings-dialog'},{businessControlOverlay:'workspace-dialog'}];
  const history={state:stack.at(-1)},calls=[],pending=pendingLeaf?['workspace-dialog']:[],state={suppressOverlayPop:pendingLeaf};let pop;
  const ctx=vm.createContext({state,history,$:selector=>selector==='#settings-dialog'?hub:null,topOpenDialog:()=>leaf.open?leaf:hub.open?hub:null,
    window:{addEventListener:(name,callback)=>{if(name==='popstate')pop=callback;}},
    requestDialogClose:async dialog=>{
      calls.push(['request-close',dialog.id]);if(dialog===leaf&&refuseLeaf)return false;
      dialog.open=false;
      if(dialog.dataset.historyState==='true'&&history.state.businessControlOverlay===dialog.id){dialog.dataset.historyState='false';state.suppressOverlayPop=true;pending.push(dialog.id);}
      return true;
    }});
  vm.runInContext(source.slice(source.indexOf('async function leaveSettingsFor('),source.indexOf('async function runSettingsAction(')),ctx);
  vm.runInContext(source.slice(source.indexOf("window.addEventListener('popstate'"),source.indexOf("window.addEventListener('beforeunload'")),ctx);
  return{hub,leaf,state,calls,pending,run:()=>ctx.leaveSettingsFor(()=>{calls.push(['action']);return 'navigated';}),
    pop:async()=>{assert.ok(pending.length,'a Back event must actually be pending');calls.push(['pop',pending.shift()]);stack.pop();history.state=stack.at(-1);pop({state:history.state});await new Promise(setImmediate);}};
}

test('leaving settings waits for a queued leaf Back, then hub Back, before navigating',async()=>{
  const h=transitionHarness({pendingLeaf:true});let previous=0;h.state.afterOverlayClose=()=>previous++;
  const result=h.run();assert.equal(h.calls.length,0);assert.equal(h.hub.open,true);
  await h.pop();assert.equal(previous,1);assert.equal(h.hub.open,false);assert.equal(h.calls.some(([kind])=>kind==='action'),false);
  assert.deepEqual(h.pending,['settings-dialog']);await h.pop();assert.equal(await result,'navigated');
  assert.deepEqual(h.calls,[['pop','workspace-dialog'],['request-close','settings-dialog'],['pop','settings-dialog'],['action']]);assert.equal(h.state.afterOverlayClose,null);
});

test('leaving settings closes an open leaf before closing the hub and running one action',async()=>{
  const h=transitionHarness(),result=h.run();await new Promise(setImmediate);
  assert.equal(h.leaf.open,false);assert.equal(h.hub.open,true);assert.deepEqual(h.pending,['workspace-dialog']);
  await h.pop();assert.equal(h.hub.open,false);assert.deepEqual(h.pending,['settings-dialog']);
  await h.pop();assert.equal(await result,'navigated');assert.deepEqual(h.calls,[['request-close','workspace-dialog'],['pop','workspace-dialog'],['request-close','settings-dialog'],['pop','settings-dialog'],['action']]);
});

test('refusing to close a leaf cancels settings navigation and preserves prior continuation',async()=>{
  const h=transitionHarness({refuseLeaf:true}),previous=()=>{};h.state.afterOverlayClose=previous;
  assert.equal(await h.run(),false);assert.equal(h.hub.open,true);assert.equal(h.leaf.open,true);assert.equal(h.state.afterOverlayClose,previous);assert.equal(h.pending.length,0);
  assert.deepEqual(h.calls,[['request-close','workspace-dialog']]);
});

test('settings transition runs directly when the hub is already closed',async()=>{
  const h=transitionHarness({hubOpen:false,leafOpen:false});assert.equal(await h.run(),'navigated');assert.deepEqual(h.calls,[['action']]);assert.equal(h.pending.length,0);
});

test('appearance and presets cannot overwrite an active page editor and work again after it ends',async()=>{
  const state={me:{id:7},activeWorkspaceId:'team',view:'calendar',workspacePages:[],collections:[]},calls=[];
  const ctx=vm.createContext({state,activeWorkspace:()=>({}),canConfigureWorkspace:()=>true,
    openAppearanceSettings:()=>calls.push('appearance'),openInterfacePresetsDialog:()=>calls.push('interface-presets')});
  vm.runInContext(source.slice(source.indexOf('async function runSettingsAction('),source.indexOf('function openAppearanceSettings(')),ctx);
  const context={userId:7,workspaceId:'team',view:'calendar'};
  for(const name of ['pageLayoutDraft','layoutDraft']){
    const draft={value:{texts:{heading:'Unsaved title'}}};state[name]=draft;
    for(const key of ['appearance','interface-presets'])await assert.rejects(ctx.runSettingsAction(key,{context}),/Сохраните или отмените редактирование страницы/);
    assert.equal(state[name],draft);assert.deepEqual(draft.value.texts,{heading:'Unsaved title'});delete state[name];
  }
  assert.equal(calls.length,0);await ctx.runSettingsAction('appearance',{context});await ctx.runSettingsAction('interface-presets',{context});assert.deepEqual(calls,['appearance','interface-presets']);
});
