const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const media = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname,'note-media.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function'),media);
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

function savedNoteHarness(){
  const nodes=new Map(),events={},windowEvents={},panels=[],queue=[],uploads=[],state={me:{id:1},activeWorkspaceId:'personal-one'};
  const node=()=>({innerHTML:'',textContent:'',hidden:false,isConnected:true,classList:{add(){},remove(){}},querySelector(selector){if(!nodes.has(selector))nodes.set(selector,node());return nodes.get(selector);},querySelectorAll(){return[];}});
  const root=node(),dialog={open:true},actions={before(value){this.inserted=value;},append(value){this.history=value;}},form={isConnected:true,body:'UNSAVED NOTE TEXT',dataset:{workingDraftScope:'personal:1:note:note'},closest:()=>dialog,querySelector:()=>actions,addEventListener:(type,handler)=>{events[type]=handler;}};
  let refreshes=0,apiCalls=0;
  const local=vm.createContext({document:{createElement:tag=>tag==='section'?root:node()},window:{addEventListener:(type,handler)=>{windowEvents[type]=handler;}},createMediaVariantsUI:options=>({mount(host,context){panels.push({host,context,options});return{async addFiles(files){uploads.push(files);},async refresh(){refreshes++;},dispose(){}};}})});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'note-media.js'),'utf8').replace(/^import .*;\r?\n/gm,'').replaceAll('export function','function'),local);
  const ui=local.createNoteMediaUI({state,api(){apiCalls++;throw new Error('Legacy saved-note read must not run');},outbox:()=>({pendingNoteFiles:()=>new Promise(resolve=>queue.push(resolve)),open(){}}),escapeHTML:value=>String(value).replaceAll('<','&lt;'),icon:()=>'',openModal(){},closeDialog(){},flushDrafts:()=>true,toast(){}});
  const binding=ui.bindEditor(form,{id:'note',title:'Saved title'});
  return{ui,binding,state,form,dialog,actions,root,nodes,events,windowEvents,panels,queue,uploads,get refreshes(){return refreshes;},get apiCalls(){return apiCalls;},tick:async()=>{for(let i=0;i<12;i++)await Promise.resolve();}};
}

test('saved notes mount the shared variant gallery beside the text draft and route only file paste/drop payloads',async()=>{
  const h=savedNoteHarness(),panel=h.panels[0];
  assert.equal(panel.context.kind,'note');assert.equal(panel.context.noteId,'note');assert.equal(panel.context.ownerId,1);assert.equal(panel.context.workspaceId,'personal-one');
  assert.equal(typeof panel.options.draftStore.get,'function');assert.equal(h.actions.inserted,h.root);assert.equal(h.actions.history.textContent,'История заметки');assert.equal(h.apiCalls,0);
  let prevented=0;const controls={preventDefault(){prevented++;},stopImmediatePropagation(){}};
  h.events.paste({...controls,clipboardData:{files:[]}});assert.equal(prevented,0);
  const photo={name:'Sketch.png',size:20};h.events.paste({...controls,clipboardData:{files:[photo]}});await h.tick();
  assert.equal(prevented,1);assert.equal(h.uploads.length,1);assert.equal(h.uploads[0][0],photo);assert.equal(h.form.body,'UNSAVED NOTE TEXT');
  h.events.drop({...controls,dataTransfer:{files:[photo]}});await h.tick();assert.equal(h.uploads.length,2);
  assert.deepEqual(Array.from((await h.binding.creation()).files),[]);
});

test('saved note gallery refuses stale owner/workspace or a closed note editor without swallowing another paste',async()=>{
  const h=savedNoteHarness(),context=h.panels[0].context;
  assert.equal(context.isCurrent(),true);h.state.activeWorkspaceId='another';assert.equal(context.isCurrent(),false);
  let prevented=false;h.events.paste({clipboardData:{files:[{size:1}]},preventDefault(){prevented=true;},stopImmediatePropagation(){}});await h.tick();
  assert.equal(prevented,false);assert.equal(h.uploads.length,0);
  h.state.activeWorkspaceId='personal-one';h.state.me={id:2};assert.equal(context.isCurrent(),false);
  h.state.me={id:1};h.dialog.open=false;assert.equal(context.isCurrent(),false);
});

test('saved note legacy outbox remains visible and refreshes the shared gallery only after its original confirmation',async()=>{
  const h=savedNoteHarness();
  h.queue[0]([{id:'own',owner:1,note:'note',fileName:'Original sketch',status:'sending'},{id:'other',owner:1,note:'other-note',fileName:'Other note private file'},{id:'foreign',owner:2,note:'note',fileName:'Other owner private file'}]);await h.tick();
  const legacy=h.nodes.get('[data-note-file-legacy-pending]');assert.equal(legacy.hidden,false);assert.match(legacy.innerHTML,/Original sketch/);assert.doesNotMatch(legacy.innerHTML,/Other note private file|Other owner private file/);
  h.ui.confirmed({kind:'note-attachment',owner:2,note:'note'},{});assert.equal(h.refreshes,0);
  h.ui.confirmed({kind:'note-attachment',owner:1,note:'note'},{});assert.equal(h.refreshes,1);h.queue[1]([]);await h.tick();
  assert.equal(legacy.hidden,true);assert.equal(h.form.body,'UNSAVED NOTE TEXT');
});

test('a late old note queue result cannot reveal names after switching accounts',async()=>{
  const h=savedNoteHarness();h.state.me={id:2};
  h.queue[0]([{id:'old',owner:1,note:'note',fileName:'FORBIDDEN PRIVATE FILE'}]);await h.tick();
  assert.equal(h.nodes.get('[data-note-file-legacy-pending]'),undefined);
  assert.equal(h.form.body,'UNSAVED NOTE TEXT');
});
