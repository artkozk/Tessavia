const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const fragment = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
function contextHelpers(context) {
  if (source.includes('function captureProjectContext(')) vm.runInContext(fragment('function captureProjectContext(', 'function renderProjectLoadError('), context);
}
function deferred() { let resolve, reject; const promise = new Promise((a,b)=>{resolve=a;reject=b;}); return {promise,resolve,reject}; }

test('a late prefetch cannot repopulate the cache after switching project or account', async () => {
  for (const change of ['project','account','epoch']) {
    const pending=deferred();
    const state={me:{id:1},activeWorkspaceId:'one',projectContextEpoch:0,records:[],detailCache:new Map(),detailRequests:new Map()};
    const context=vm.createContext({state,api:()=>pending.promise}); contextHelpers(context);
    vm.runInContext(fragment('function cachedRecordDetail(', 'function prefetchRecord('),context);
    const request=vm.runInContext("fetchRecordDetail('a')",context);
    state.detailCache.clear();state.detailRequests.clear();
    if(change==='project')state.activeWorkspaceId='two';
    if(change==='account')state.me={id:2};
    if(change==='epoch')state.projectContextEpoch++;
    pending.resolve({record:{id:'a',workspaceId:'one',updatedAt:'1'}});await request;
    assert.equal(state.detailCache.size,0,change+' leaked a late record');
  }
});

test('an obsolete request cannot remove the replacement request for the same record', async () => {
  const first=deferred(),second=deferred();let count=0;
  const state={me:{id:1},activeWorkspaceId:'one',projectContextEpoch:0,records:[],detailCache:new Map(),detailRequests:new Map()};
  const context=vm.createContext({state,api:()=>++count===1?first.promise:second.promise});contextHelpers(context);
  vm.runInContext(fragment('function cachedRecordDetail(', 'function prefetchRecord('),context);
  const old=vm.runInContext("fetchRecordDetail('a')",context);
  state.detailRequests.clear();state.projectContextEpoch++;
  const fresh=vm.runInContext("fetchRecordDetail('a')",context), replacement=state.detailRequests.get('a');
  first.resolve({record:{id:'a',workspaceId:'one',updatedAt:'old'}});await old;
  assert.equal(state.detailRequests.get('a'),replacement);
  second.resolve({record:{id:'a',workspaceId:'one',updatedAt:'new'}});await fresh;
  assert.equal(state.detailCache.get('a').record.updatedAt,'new');
});

test('the cache never serves a known record from a different workspace', () => {
  const state={me:{id:1},activeWorkspaceId:'two',records:[],detailCache:new Map([['a',{record:{id:'a',workspaceId:'one',updatedAt:'1'}}]])};
  const context=vm.createContext({state});
  vm.runInContext(fragment('function cachedRecordDetail(', 'async function fetchRecordDetail('),context);
  assert.equal(vm.runInContext("cachedRecordDetail('a')",context),null);
});

test('old search success or error cannot replace results of the new project', async () => {
  for(const fail of [false,true]) {
    const old=deferred(),fresh=deferred();let count=0;
    const state={me:{id:1},activeWorkspaceId:'one',projectContextEpoch:0};
    const input={value:'same'},results={hidden:true,innerHTML:''};
    const context=vm.createContext({state,$:selector=>selector==='#global-search-input'?input:results,$$:()=>[],api:()=>++count===1?old.promise:fresh.promise,renderSearchResult:item=>item.title,escapeHTML:value=>value});contextHelpers(context);
    vm.runInContext(fragment('async function runGlobalSearch(', 'function renderSearchResult('),context);
    const oldRequest=vm.runInContext("runGlobalSearch('same')",context);
    state.activeWorkspaceId='two';state.projectContextEpoch++;
    const freshRequest=vm.runInContext("runGlobalSearch('same')",context);
    fresh.resolve([{title:'Current project'}]);await freshRequest;
    if(fail)old.reject(new Error('Obsolete error'));else old.resolve([{title:'Private old result'}]);
    await oldRequest;
    assert.equal(results.innerHTML,'Current project');
  }
});

test('switching project stops before clearing data when a draft cannot be preserved', async () => {
  let cleared=0,loads=0;
  const state={activeWorkspaceId:'one',view:'work',layoutDraft:null};
  const context=vm.createContext({state,$$:()=>[{open:true,dataset:{},id:'personal-dialog'}],confirmDialogTransition:async()=>false,leavePageLayoutEditor:()=>true,rememberView(){},clearProjectClientState(){cleared++;},localStorage:{setItem(){}},setSidebarOpen(){},$:()=>({}),async loadData(){loads++;},pushViewHistory(){}});
  vm.runInContext(fragment('async function switchWorkspace(', 'function latestTimestamp('),context);
  assert.equal(await vm.runInContext("switchWorkspace('two')",context),false);
  assert.equal(cleared,0);assert.equal(loads,0);assert.equal(state.activeWorkspaceId,'one');
});

test('late lazy details and their errors cannot repaint a reopened record', async () => {
  const fragments=[['loadRecordRelations','function askText('],['loadRecordActivity','async function loadRecordWorkflow('],['loadRecordWorkflow','async function refreshActiveRecordWorkflow(']];
  for(const [name,end] of fragments) for(const fail of [false,true]) {
    const pending=deferred();let renders=0,toasts=0;
    const state={me:{id:1},activeWorkspaceId:'one',activeRecordRequest:1,activeDetail:{record:{id:'a',updatedAt:'1'}},detailCache:new Map()};
    const loading={innerHTML:'Current loading',open:true};
    const context=vm.createContext({state,api:()=>pending.promise,$:()=>loading,renderRecordDialog(){renders++;},toast(){toasts++;}});contextHelpers(context);
    vm.runInContext(fragment('async function '+name+'(',end),context);
    const request=vm.runInContext(name+"('a')",context);
    state.activeRecordRequest=2;
    if(fail)pending.reject(new Error('Old window'));else pending.resolve({links:['old']});
    await request;
    assert.equal(renders,0,name);assert.equal(toasts,0,name);assert.equal(loading.innerHTML,'Current loading');assert.equal(state.detailCache.size,0);
  }
});

test('closing a search invalidates pending responses even if its text is unchanged', async () => {
  const pending=deferred();
  const state={me:{id:1},activeWorkspaceId:'one'};
  const results={hidden:false,innerHTML:''},input={value:'same',blur(){}};
  const context=vm.createContext({state,clearTimeout,$:selector=>selector==='#global-search-results'?results:selector==='#global-search-input'?input:{classList:{remove(){}}},$$:()=>[],api:()=>pending.promise,renderSearchResult:item=>item.title,escapeHTML:value=>value});contextHelpers(context);
  vm.runInContext(fragment('function closeGlobalSearch(', 'function bindGlobalEvents('),context);
  vm.runInContext(fragment('async function runGlobalSearch(', 'function renderSearchResult('),context);
  const request=vm.runInContext("runGlobalSearch('same')",context);
  vm.runInContext('closeGlobalSearch()',context);const before=results.innerHTML;
  pending.resolve([{title:'Late answer'}]);await request;
  assert.equal(results.hidden,true);assert.equal(results.innerHTML,before);
});

test('Escape dismisses the innermost select before a menu and the create menu', () => {
  let selected=true,focus=0;
  const panel={open:true},create={hidden:false};
  const trigger={focus(){focus++;}};
  const context=vm.createContext({state:{},$:selector=>selector==='.custom-select.open'?(selected?{}:null):selector==='.chat-emoji-picker'?null:selector==='#create-menu'?create:trigger,$$:()=>panel.open?[panel]:[],closeCustomSelects(){selected=false;}});
  vm.runInContext(fragment('function closeTopTransientPanel(', 'function discardComposerChanges('),context);
  assert.equal(vm.runInContext('closeTopTransientPanel()',context),true);assert.equal(panel.open,true);assert.equal(create.hidden,false);
  assert.equal(vm.runInContext('closeTopTransientPanel()',context),true);assert.equal(panel.open,false);assert.equal(create.hidden,false);
  assert.equal(vm.runInContext('closeTopTransientPanel()',context),true);assert.equal(create.hidden,true);assert.equal(focus,3);
  assert.equal(vm.runInContext('closeTopTransientPanel()',context),false);
});
