const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
const response = (value, status = 200) => ({status, ok:status < 400, headers:new Headers(), json:async () => value});
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return {promise,resolve}; };
function client(fetch) {
  const context = vm.createContext({fetch, AbortController, Headers, FormData, TypeError, setTimeout, clearTimeout,
    state:{me:{id:1}, activeWorkspaceId:'project-a'}, showAuth() { context.signedOut = true; }});
  vm.runInContext(source.slice(source.indexOf('const pendingAPIReads ='), source.indexOf('function toast(')), context);
  return context;
}

test('concurrent identical reads share one request; different projects remain isolated', async () => {
  const gate = deferred(); const calls = [];
  const c = client((path, options) => { calls.push(options.headers['X-Workspace-ID']); return gate.promise; });
  const a = c.api('/api/records'); const b = c.api('/api/records');
  c.state.activeWorkspaceId = 'project-b'; const other = c.api('/api/records');
  assert.deepEqual(calls, ['project-a','project-b']);
  gate.resolve(response({ok:true})); await Promise.all([a,b,other]);
});

test('a dropped read retries once, while writes and validation failures never repeat', async () => {
  let calls = 0;
  const c = client(async () => { if (++calls === 1) throw new TypeError('connection lost'); return response({id:1}); });
  assert.equal((await c.api('/api/records')).id,1); assert.equal(calls,2);
  calls=0; const write = client(async () => { calls++; throw new TypeError('connection lost'); });
  await assert.rejects(write.api('/api/records',{method:'POST',body:'{}'})); assert.equal(calls,1);
  calls=0; const denied = client(async () => { calls++; return response({error:'Denied'},403); });
  await assert.rejects(denied.api('/api/records'), {status:403}); assert.equal(calls,1);
});

test('the deadline also covers a stalled response body, then releases the pending request', async () => {
  let calls=0;
  const c=client(async (path, options) => { calls++; return {...response({}),json:() => new Promise((resolve,reject) => {
    options.signal.addEventListener('abort',()=>reject(Object.assign(new Error('aborted'),{name:'AbortError'})),{once:true});
  })}; });
  await assert.rejects(c.api('/api/records',{timeoutMs:5}),{code:'REQUEST_TIMEOUT'}); assert.equal(calls,2);
  await assert.rejects(c.api('/api/records',{timeoutMs:5}),{code:'REQUEST_TIMEOUT'}); assert.equal(calls,4);
});

test('explicit cancellation is respected without automatic retry', async () => {
  let calls=0; const abort=new AbortController();
  const c=client((path,options)=>{ calls++; return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(new Error('cancelled')),{once:true})); });
  const request=c.api('/api/records',{signal:abort.signal}); abort.abort();
  await assert.rejects(request,/cancelled/); assert.equal(calls,1);
});

test('successful writes prevent reuse of a read started before the change', async () => {
  const gate=deferred(); let gets=0;
  const c=client(async (path,options)=> options.method==='POST' ? response({saved:true}) : ++gets===1 ? gate.promise : response({version:2}));
  const old=c.api('/api/records'); await c.api('/api/records',{method:'POST',body:'{}'});
  assert.equal((await c.api('/api/records')).version,2); assert.equal(gets,2);
  gate.resolve(response({version:1})); await old;
});

test('saving-related sync finishes even when chat is slow; late companions cannot cross projects', async () => {
  const chat=deferred();
  const c=vm.createContext({URLSearchParams, state:{me:{id:1},activeWorkspaceId:'a',records:[],activity:[],syncRecordsSince:'1970',syncActivitySince:'1970',detailCache:new Map()},
    typeMeta:{}, latestTimestamp:(items,field,fallback)=>fallback,renderNav(){},renderNotificationBadge(){},
    api:async path => path.includes('/api/sync?') ? {records:[],activity:[]} : path==='/api/chat/threads' ? chat.promise : []});
  vm.runInContext(source.slice(source.indexOf('async function syncProjectChanges('), source.indexOf('function closeGlobalSearch(')),c);
  await Promise.race([c.syncProjectChanges(),new Promise((resolve,reject)=>setTimeout(()=>reject(new Error('sync waited for chat')),100))]);
  c.state.activeWorkspaceId='b'; chat.resolve([{id:'private-a'}]); await new Promise(resolve=>setImmediate(resolve));
  assert.equal(c.state.chatThreads,undefined);
});
