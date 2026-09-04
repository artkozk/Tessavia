const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const media = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'note-media.js'),'utf8').replaceAll('export function','function'),media);
const outbox = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'outbox-ui.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function'),outbox);

test('note files reject empty, oversized and excessive batches before enqueue',()=>{
  assert.throws(()=>media.validateNoteFiles([{size:0}]),/15 МБ/);
  assert.throws(()=>media.validateNoteFiles([{size:15*1024*1024+1}]),/15 МБ/);
  assert.throws(()=>media.validateNoteFiles([{size:1}],20),/20 файлов/);
  assert.doesNotThrow(()=>media.validateNoteFiles([{size:15*1024*1024}],19));
});

test('nginx HTML rejection retains HTTP status instead of causing endless upload retries',()=>{
  assert.throws(()=>outbox.parseNoteUploadResponse(413,'<html>Too large</html>'),e=>e.status===413 && /размер/.test(e.message));
  assert.throws(()=>outbox.parseNoteUploadResponse(401,'Login required'),e=>e.status===401);
  assert.throws(()=>outbox.parseNoteUploadResponse(409,'{"error":"Changed account","code":"outbox_owner_changed"}'),e=>e.status===409 && e.code==='outbox_owner_changed');
  assert.throws(()=>outbox.parseNoteUploadResponse(200,'truncated'),e=>e.status===200);
  assert.equal(outbox.parseNoteUploadResponse(201,'{"id":"file-id"}').id,'file-id');
});

test('reopening a saved note still shows files waiting for their parent receipt',()=>{
  const items=[{kind:'note',id:'entry',noteRequestKey:'parent',owner:1,status:'confirmed',resultID:'note-id'},
    {kind:'note-attachment',id:'file',noteRequestKey:'parent',owner:1,status:'queued'},
    {kind:'note-attachment',id:'other',noteRequestKey:'parent',owner:2,status:'queued'},
    {kind:'note-attachment',id:'done',noteRequestKey:'parent',owner:1,status:'confirmed'}];
  const pending=outbox.pendingNoteFileEntries(items);
  assert.equal(pending.length,2);assert.equal(pending[0].note,'note-id');assert.equal(pending[1].note,undefined);
  assert.equal(items[1].note,undefined);assert.equal(pending[0].noteRequestKey,'parent');
});

test('a new note and its files share a stable parent receipt and preserve file bytes',async()=>{
  const blob=new Blob(['private file']),payload={title:'Note',body:'Text'};
  const items=outbox.noteCreateEntries('note',payload,[{name:'file.txt',blob}],'parent-key');
  assert.equal(items.length,2);assert.equal(items[0].noteRequestKey,'parent-key');
  assert.equal(items[1].noteRequestKey,'parent-key');assert.equal(items[1].kind,'note-attachment');
  assert.equal(await items[1].blob.text(),'private file');assert.equal(items[1].fileName,'file.txt');
  assert.equal(items[1].workspace,undefined);assert.equal(items[1].thread,undefined);
  assert.throws(()=>outbox.noteCreateEntries('note',payload,[{name:'file.txt',blob}]),/ключ/);
  assert.throws(()=>outbox.noteCreateEntries('plan',payload,[{name:'file.txt',blob}],'key'),/ключ/);
  assert.equal(outbox.noteCreateEntries('note',payload)[0].noteRequestKey,undefined);
});

test('file draft storage waits for transaction commit, reports quota abort and keeps owner keys distinct',async()=>{
  let tx, request, saved;
  const db={transaction(){tx={objectStore(){return{put(item){saved=item;},get(key){request={key};return request;},delete(key){saved=key;}};}};return tx;}};
  const idb={open(){const opening={result:db};queueMicrotask(()=>opening.onsuccess());return opening;}};
  const store=media.createNoteFileDraftStore(idb);
  let finished=false;
  const draft={key:'personal:1:note:new',requestKey:'stable-key',files:[{name:'one.txt',blob:new Blob(['one'])}]};
  const write=store.put(draft).then(()=>{finished=true;});
  for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(finished,false);assert.equal(saved,draft);tx.oncomplete();await write;
  const failed=store.put({...draft,files:[]});for(let i=0;i<8;i++)await Promise.resolve();
  tx.error=new Error('QuotaExceededError');tx.onabort();await assert.rejects(failed,/Quota/);
  const other=store.get('personal:2:note:new');for(let i=0;i<8;i++)await Promise.resolve();
  assert.equal(request.key,'personal:2:note:new');request.onsuccess({target:{result:undefined}});tx.oncomplete();assert.equal(await other,null);
  const get=store.get(draft.key);for(let i=0;i<8;i++)await Promise.resolve();
  request.onsuccess({target:{result:draft}});tx.oncomplete();assert.equal((await get).requestKey,'stable-key');
});
