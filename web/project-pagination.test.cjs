const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const slice = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const checkpoint = '2026-09-03T12:00:00.001Z';
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise, resolve}; };

function harness(api, overrides = {}) {
  const state = {me:{id:1},activeWorkspaceId:'A',loadDataRequest:0,records:[{id:'old',updatedAt:checkpoint}],activity:[],detailCache:new Map(),
    syncRecordsSince:'1970-01-01T00:00:00Z',syncActivitySince:'1970-01-01T00:00:00Z'};
  const ctx = vm.createContext({state, api, Map, Set, URLSearchParams, AbortController, Date, history:{state:null},
    $:()=>null,localStorage:{setItem(){}},typeMeta:{task:{}},interfaceDevice:()=> 'desktop',initializeViewHistory(){},render(){},
    refreshProjectCompanions:async()=>{},renderNav(){},renderNotificationBadge(){},renderContent(){},rememberView(){},
    ...overrides});
  vm.runInContext(slice('async function readProjectPages(', 'async function refreshProjectCompanions('),ctx);
  return ctx;
}

test('all pages are collected with the captured workspace and one checkpoint', async () => {
  const calls = [], progress = [];
  const h = harness(async (path,options) => {
    calls.push({path,workspace:options.headers['X-Workspace-ID']});
    const n = calls.length;
    return {records:Array.from({length:n===3?101:200},(_,i)=>({id:String((n-1)*200+i)})),checkpoint,nextCursor:n<3?`page${n}`:''};
  });
  const result = await h.readProjectPages('/api/records?includeArchived=true',{workspace:'B',onProgress:n=>progress.push(n)});
  assert.equal(result.records.length,501);
  assert.deepEqual(progress,[200,400,501]);
  assert.ok(calls.every(c=>c.workspace==='B'));
  assert.match(calls[1].path,/cursor=page1/);
});

test('cancellation during a page never returns a partial project or starts another page', async () => {
  const pending=deferred(), controller=new AbortController(); let calls=0;
  const h=harness(async()=>{calls++;await pending.promise;return{records:[{id:'one'}],checkpoint,nextCursor:'next'};});
  const request=h.readProjectPages('/api/records',{signal:controller.signal});
  controller.abort();pending.resolve();
  await assert.rejects(request,/отменена/);
  assert.equal(calls,1);
});

test('repeated cursor or inconsistent checkpoint is reported instead of a false complete list',async()=>{
  const h=harness(async()=>({records:[],checkpoint,nextCursor:'same'}));
  await assert.rejects(h.readProjectPages('/api/records'),/повторил страницу/);
  let count=0;
  const changed=harness(async()=>({records:[],checkpoint:count++?checkpoint+'changed':checkpoint,nextCursor:'next'}));
  await assert.rejects(changed.readProjectPages('/api/records'),/полноту загрузки/);
});

test('an unloaded project does not expose zero as a complete counter',()=>{
  const h=harness(async()=>{});
  vm.runInContext(slice('function navCount(', 'function renderNav('),h);
  h.state.projectDataReady=false;
  assert.equal(h.navCount('work'),'');
  assert.equal(h.navCount('collections'),'');
});

function payload(path,workspace){
  if(path==='/api/workspaces')return[{id:'A',kind:'team'},{id:'B',kind:'team'}];
  if(path.startsWith('/api/records?'))return{records:[{id:workspace+'-record',updatedAt:checkpoint}],checkpoint,nextCursor:''};
  if(path==='/api/planning/cycles')return{cycles:[]};
  if(path.startsWith('/api/interface/preferences')||path==='/api/workspace/navigation')return{};
  return[];
}

test('late success and failure from the previous project cannot replace the selected project',async()=>{
  for(const fail of [false,true]){
    const started=deferred(),release=deferred();
    const h=harness(async(path,options)=>{
      const workspace=options?.headers?.['X-Workspace-ID']||'A';
      if(path.startsWith('/api/records?')&&workspace==='A'){started.resolve();await release.promise;if(fail)throw Error('Old project failed');}
      return payload(path,workspace);
    });
    const a=h.loadData();await started.promise;h.state.activeWorkspaceId='B';await h.loadData();release.resolve();await a;
    assert.equal(h.state.records[0].id,'B-record');
    assert.equal(h.state.syncRecordsSince,checkpoint);
  }
});

test('sync from an old account or load generation is ignored, including A to B to A',async()=>{
  for(const change of [h=>h.state.me={id:2},h=>h.state.loadDataRequest++]){
    const pending=deferred();
    const h=harness(async()=>{await pending.promise;return{records:[{id:'leaked',updatedAt:checkpoint}],activity:[],checkpoint,nextCursor:''};});
    const request=h.syncProjectChanges({includeCompanions:false});change(h);pending.resolve();await request;
    assert.equal(h.state.records.length,1);
    assert.equal(h.state.records[0].id,'old');
  }
});

test('late older sync cannot rewind a record or checkpoint, even within one millisecond',async()=>{
  const first=deferred();let count=0;
  const h=harness(async()=>{
    const n=++count;if(n===1)await first.promise;
    const stamp=`2026-09-03T12:00:00.00100000${n}Z`;
    return{records:[{id:'old',title:n===1?'older':'newer',updatedAt:stamp}],activity:[],checkpoint:stamp,nextCursor:''};
  });
  const a=h.syncProjectChanges({includeCompanions:false});await h.syncProjectChanges({includeCompanions:false});first.resolve();await a;
  assert.equal(h.state.records[0].title,'newer');
  assert.equal(h.state.syncRecordsSince,'2026-09-03T12:00:00.001000002Z');
});
