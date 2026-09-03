const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const moduleSource = fs.readFileSync(path.join(__dirname,'graph-layout-state.js'),'utf8');
const appSource = fs.readFileSync(path.join(__dirname,'app.js'),'utf8');
const clone = v => JSON.parse(JSON.stringify(v));
const normal = v => ({positions:{},settings:{},search:'',branchRootId:'',depth:2,...v});
const scope = {user:1,workspace:'A',view:'project'};
const point = x => normal({positions:{'record:a':{x,y:10}}});
const deferred = () => { let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve}; };
function fixture() {
  const rows = new Map(), disk = new Map(), calls = [];
  let active = 1;
  const storage = {getItem:key=>disk.get(key),setItem:(key,value)=>disk.set(key,value),removeItem:key=>disk.delete(key)};
  const api = async (url,options) => {
    const view = new URL(url,'https://test').searchParams.get('view');
    const key=JSON.stringify([active,options.headers['X-Workspace-ID'],view]);
    calls.push({method:options.method || 'GET',key});
    const before=rows.get(key) || {view,version:0,updatedAt:'',data:normal()};
    if(options.method !== 'PUT') return clone(before);
    const body=JSON.parse(options.body);
    if(body.expectedVersion !== before.version) throw Object.assign(new Error('conflict'),{status:409});
    const result={view,version:before.version+1,updatedAt:`v${before.version+1}`,data:body.data};rows.set(key,clone(result));return result;
  };
  function store(override = api, targetStorage = storage, draftId = '') {
    const context=vm.createContext({setTimeout,clearTimeout,Map,Set,JSON,Object,Number,encodeURIComponent});
    vm.runInContext(moduleSource.replace('export function','function'),context);
    return context.createGraphLayoutStore({api:override,storage:targetStorage,normalize:normal,isUserActive:user=>user===active,delay:10,draftId});
  }
  return {store,api,rows,disk,calls,storage,setActive:user=>{active=user}};
}
const change=(store,ctx,data)=>store.change(ctx,data,{autoSave:false});
test('another device loads server positions; project, local view and account remain independent',async()=>{
  const f=fixture(),one=f.store(),a=one.context(scope);await one.load(a);change(one,a,point(42));assert.equal(await one.save(a),true);
  const otherDevice=f.store(f.api,{getItem:()=>null,setItem(){}}),copy=otherDevice.context(scope);await otherDevice.load(copy);assert.equal(copy.data.positions['record:a'].x,42);
  const projectB=one.context({...scope,workspace:'B'}),local=one.context({...scope,view:'record:a'});
  await one.load(projectB);await one.load(local);assert.equal(projectB.version,0);assert.equal(local.version,0);
  f.setActive(2);const another=one.context({...scope,user:2});await one.load(another);assert.equal(another.version,0);
  assert.equal(new Set([a.key,projectB.key,local.key,another.key]).size,4);
});
test('two windows retain the losing draft; both explicit conflict resolutions work',async()=>{
  const f=fixture(),one=f.store(),two=f.store(f.api,{getItem:()=>null,setItem(){}}),a=one.context(scope),b=two.context(scope);
  await one.load(a);await two.load(b);change(one,a,point(10));change(two,b,point(20));await one.save(a);
  assert.equal(await two.save(b),false);assert.equal(b.conflict,true);assert.equal(b.data.positions['record:a'].x,20);
  assert.equal(await two.keepLocal(b),true);assert.equal(b.version,2);
  change(one,a,point(30));await one.save(a);assert.equal(a.conflict,true);
  assert.equal(await one.acceptServer(a),true);assert.equal(a.data.positions['record:a'].x,20);assert.equal(a.dirty,false);
});
test('edits made while saving are serialized into a second version without being marked saved early',async()=>{
  const f=fixture(),gate=deferred();let blocked=true;
  const store=f.store(async(url,options)=>{if(options.method==='PUT'&&blocked){blocked=false;await gate.promise;}return f.api(url,options);});
  const ctx=store.context(scope);await store.load(ctx);change(store,ctx,point(1));const first=store.save(ctx);
  change(store,ctx,point(2));gate.resolve();await first;assert.equal(ctx.dirty,true);assert.equal(ctx.version,1);
  await store.save(ctx);assert.equal(ctx.version,2);assert.equal(ctx.dirty,false);assert.equal(ctx.data.positions['record:a'].x,2);
});
test('lost successful write response is confirmed by a read and never repeated',async()=>{
  const f=fixture();let dropped=false;
  const store=f.store(async(url,options)=>{const result=await f.api(url,options);if(options.method==='PUT'&&!dropped){dropped=true;throw new Error('connection lost');}return result;});
  const ctx=store.context(scope);await store.load(ctx);change(store,ctx,point(7));assert.equal(await store.save(ctx),true);
  assert.equal(ctx.version,1);assert.equal(ctx.dirty,false);assert.equal(f.calls.filter(call=>call.method==='PUT').length,1);
});
test('offline draft survives reload and retries against the preserved server version',async()=>{
  const f=fixture();let offline=false;
  const api=async(...args)=>{if(offline)throw new Error('offline');return f.api(...args)};
  const store=f.store(api),ctx=store.context(scope);await store.load(ctx);offline=true;change(store,ctx,point(9));await store.save(ctx);
  assert.equal(ctx.dirty,true);assert.equal(ctx.error,'offline');
  const reopened=f.store(api),copy=reopened.context(scope);assert.equal(copy.data.positions['record:a'].x,9);assert.equal(copy.dirty,true);
  offline=false;assert.equal(await reopened.retry(copy),true);assert.equal(copy.dirty,false);assert.equal(copy.version,1);
});
test('reset and undo save only the current layout; an inactive account cannot send its pending draft',async()=>{
  const f=fixture(),store=f.store(),ctx=store.context(scope);await store.load(ctx);change(store,ctx,point(4));await store.save(ctx);
  change(store,ctx,normal());await store.save(ctx);assert.equal(Object.keys(ctx.data.positions).length,0);
  assert.equal(store.undo(ctx),true);await store.save(ctx);assert.equal(ctx.data.positions['record:a'].x,4);assert.equal(ctx.version,3);
  change(store,ctx,point(8));f.setActive(2);const calls=f.calls.length;assert.equal(await store.save(ctx),false);assert.equal(f.calls.length,calls);assert.equal(ctx.dirty,true);
});
test('a late read cannot regress a version committed by an intervening save',async()=>{
  const f=fixture(),gate=deferred();let hold=false;
  const store=f.store(async(url,options)=>{const result=await f.api(url,options);if(!options.method&&hold){hold=false;await gate.promise;}return result});
  const ctx=store.context(scope);await store.load(ctx);hold=true;const read=store.load(ctx);change(store,ctx,point(6));await store.save(ctx);gate.resolve();await read;
  assert.equal(ctx.version,1);assert.equal(ctx.data.positions['record:a'].x,6);assert.equal(ctx.dirty,false);
});
test('graph data from a departed project cannot overwrite the active graph',async()=>{
  const pending={A:deferred(),B:deferred()},state={me:{id:1},activeWorkspaceId:'A',graphData:null};
  const h=vm.createContext({state,api:async(_url,options)=>pending[options.headers['X-Workspace-ID']].promise});
  vm.runInContext(appSource.slice(appSource.indexOf('async function ensureGraphData('),appSource.indexOf('function showGraphBranch(')),h);
  const a=h.ensureGraphData();state.activeWorkspaceId='B';const b=h.ensureGraphData();pending.B.resolve({nodes:[{id:'B'}]});await b;pending.A.resolve({nodes:[{id:'A'}]});await a;
  assert.equal(state.graphData.nodes[0].id,'B');
});

test('two windows sharing browser storage keep separate pending drafts across reload',async()=>{
  const f=fixture(),one=f.store(f.api,f.storage,'window-one'),two=f.store(f.api,f.storage,'window-two');
  const a=one.context(scope),b=two.context(scope);await one.load(a);await two.load(b);
  change(one,a,point(11));change(two,b,point(22));
  const reopened=f.store(f.api,f.storage,'window-one'),restored=reopened.context(scope);
  assert.equal(restored.data.positions['record:a'].x,11);assert.equal(restored.dirty,true);
  await two.save(b);await reopened.load(restored);assert.equal(restored.conflict,true);assert.equal(restored.data.positions['record:a'].x,11);
  assert.equal(JSON.parse(f.disk.get(restored.draftKey)).data.positions['record:a'].x,11);
  await reopened.acceptServer(restored);assert.equal(restored.data.positions['record:a'].x,22);assert.equal(f.disk.has(restored.draftKey),false);
});

test('legacy positions migrate only for current graph nodes and the original key remains intact',()=>{
  const legacy = JSON.stringify({'record:a':{x:1,y:2},'record:other-project':{x:9,y:9}});
  const disk=new Map([['business-control:graph-positions:1:v4',legacy],['business-control:graph-settings:1:v1',JSON.stringify({showDiscussion:false})]]);
  let changed;
  const h=vm.createContext({localStorage:{getItem:key=>disk.get(key)},Set,JSON,Object,graphLayoutStore:{change:(_ctx,data)=>changed=data}});
  vm.runInContext(appSource.slice(appSource.indexOf('function importLegacyGraphLayout('),appSource.indexOf('function updateGraphLayoutStatus(')),h);
  h.importLegacyGraphLayout({user:1,loaded:true,version:0,dirty:false,hadCache:false,data:normal()},{nodes:[{id:'record:a'}]});
  assert.deepEqual(Object.keys(changed.positions),['record:a']);assert.equal(changed.settings.showDiscussion,false);
  assert.equal(disk.get('business-control:graph-positions:1:v4'),legacy);
});
