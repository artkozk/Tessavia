const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const modulePromise = import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(path.join(__dirname,'offline-outbox.js'),'utf8')).toString('base64'));
function memoryStore() {
  const rows = new Map();
  return { rows, list: async owner => [...rows.values()].filter(item => item.owner === owner).map(item => structuredClone(item)),
    addMany: async items => { for (const item of items) rows.set(item.id,structuredClone(item)); },
    update: async (id,change) => { const item = rows.get(id); if (!item) return null; const next = change(structuredClone(item)); if (next === undefined) return null; if (next === null) rows.delete(id); else rows.set(id,structuredClone(next)); return next; },
  };
}
function deferred() { let resolve,reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return {promise,resolve,reject}; }
async function fixture(options={}) {
  const { createOutboxQueue } = await modulePromise;
  const store = options.store || memoryStore(); let clock=10000, id=0;
  const queue = createOutboxQueue({ store, verifyOwner: async () => {}, send: async item => ({id:'server-'+item.id}), now: () => clock, uuid: () => 'test-key-'+(++id), ...options });
  queue.setOwner(1);
  return {queue,store,advance: ms => { clock+=ms; }};
}
const note = () => ({kind:'note',payload:{body:'Local text'},title:'Local text'});

test('durable enqueue waits for commit and propagates quota failure', async () => {
  const commit=deferred();const {queue}=await fixture({store:{...memoryStore(),addMany:()=>commit.promise}});
  let cleared=false;const write=queue.enqueue([note()],1).then(()=>{cleared=true;});
  await Promise.resolve();assert.equal(cleared,false);commit.reject(new Error('QuotaExceededError'));
  await assert.rejects(write,/Quota/);assert.equal(cleared,false);
});
test('lost acknowledgment and restart reuse the original key, preserving later files', async () => {
  const server=new Map();let dropped=false;
  const {queue,store,advance}=await fixture({send:async item=>{server.set(item.id,'server-'+item.id);if(!dropped){dropped=true;throw new Error('lost reply');}return{id:server.get(item.id)};}});
  const entries=await queue.enqueue([note(),{kind:'attachment',blob:new Blob(['file']),fileName:'one.txt',payload:{}}],1);
  await queue.pump();assert.equal((await store.list(1)).find(item=>item.id===entries[0].id).status,'queued');assert.equal(server.size,2);
  advance(10000);
  const restarted=await fixture({store,now:()=>30000,send:async item=>({id:server.get(item.id)})});await restarted.queue.pump();
  assert.equal(server.size,2);assert.ok((await store.list(1)).every(item=>item.status==='confirmed' && !item.blob));
});
test('two windows claim each item once, and crashed leases expire', async () => {
  const store=memoryStore(),sendGate=deferred();let sends=0;
  const a=await fixture({store,send:async()=>{sends++;await sendGate.promise;return{id:'one'};}});
  const b=await fixture({store,uuid:()=>crypto.randomUUID(),send:async()=>{sends++;return{id:'one'};}});
  await a.queue.enqueue([note()],1);const first=a.queue.pump();
  for(let i=0;i<8;i++)await Promise.resolve();await b.queue.pump();assert.equal(sends,1);
  sendGate.resolve();await first;
  const [entry]=await a.queue.enqueue([note()],1);
  await store.update(entry.id,item=>({...item,status:'sending',leaseUntil:20000,attempts:1}));
  await b.queue.pump();assert.equal(sends,1);b.advance(20000);await b.queue.pump();assert.equal(sends,2);
});
test('account switch while verifying or sending cannot send or display the next old item', async () => {
  const gate=deferred();let sends=0,confirmed=0;
  const a=await fixture({verifyOwner:()=>gate.promise,send:async()=>{sends++;return{id:'one'};}});
  await a.queue.enqueue([note()],1);const pump=a.queue.pump();a.queue.setOwner(2);gate.resolve();await pump;assert.equal(sends,0);
  await assert.rejects(a.queue.enqueue([note()],1),/Аккаунт/);
  const sent=deferred();const b=await fixture({send:async()=>{sends++;return sent.promise;},confirmed:()=>confirmed++});
  await b.queue.enqueue([note(),note()],1);const run=b.queue.pump();for(let i=0;i<8;i++)await Promise.resolve();b.queue.setOwner(2);sent.resolve({id:'ack-for-one'});await run;
  assert.equal(sends,1);assert.equal(confirmed,0);assert.equal((await b.store.list(1)).filter(item=>item.status==='queued').length,1);assert.equal((await b.store.list(2)).length,0);
});
test('revoked access and conflicts keep text, require explicit retry, and retain destination', async () => {
  let calls=0;const {queue,store}=await fixture({send:async item=>{calls++;assert.equal(item.workspace,'original');assert.equal(item.thread,'original-thread');throw Object.assign(new Error('No access'),{status:403});}});
  const [entry]=await queue.enqueue([{kind:'message',workspace:'original',thread:'original-thread',payload:{body:'Kept text'}}],1);
  await queue.pump();await queue.pump();assert.equal(calls,1);
  const [saved]=await store.list(1);assert.equal(saved.status,'blocked');assert.equal(saved.payload.body,'Kept text');
  await queue.retry(entry.id);await queue.pump();assert.equal(calls,2);
});
test('cancel removes only never-attempted entries; stopping uncertain writes preserves key/text', async () => {
  const {queue,store}=await fixture({send:async()=>{throw new Error('offline');}});
  const [first,second]=await queue.enqueue([note(),note()],1);await queue.stop(first.id);assert.equal(store.rows.has(first.id),false);
  await queue.pump();await queue.stop(second.id);assert.equal(store.rows.get(second.id).status,'paused');assert.equal(store.rows.get(second.id).payload.body,'Local text');await queue.pump();assert.equal(store.rows.get(second.id).attempts,1);
});
test('server account precondition pauses the queue and prevents the next send', async () => {
  let called=0,auth=0;const {queue,store}=await fixture({send:async()=>{called++;throw Object.assign(new Error('Changed cookie'),{status:409,code:'outbox_owner_changed'});},authRequired:()=>auth++});
  await queue.enqueue([note(),note()],1);await queue.pump();await queue.pump();assert.equal(called,1);assert.equal(auth,1);assert.equal((await store.list(1)).length,2);
});
test('service worker caches only allowlisted static files and never intercepts private APIs', () => {
  const handlers={};const context=vm.createContext({URL,Set,self:{location:{origin:'https://example.test'},addEventListener:(name,handler)=>{handlers[name]=handler;}}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'sw.js'),'utf8'),context);
  for(const route of ['/api/me','/api/personal/overview','/api/chat/attachments/file','/api/export','/unknown','https://other.test/app.js']) {
    let intercepted=false;handlers.fetch({request:{method:'GET',url:new URL(route,'https://example.test').href,mode:'cors'},respondWith:()=>{intercepted=true;}});assert.equal(intercepted,false,route);
  }
});
