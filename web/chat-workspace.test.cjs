const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const modulePromise = import('data:text/javascript;base64,' + fs.readFileSync(__dirname+'/chat-workspace.js').toString('base64'));

test('selected conversation survives reload but only within the fresh permitted account and project list',async()=>{
 const {chooseConversation}=await modulePromise,values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},threads=[{id:'general'},{id:'direct'}];
 assert.equal(chooseConversation(storage,1,'project',threads,'direct'),'direct');
 assert.equal(chooseConversation(storage,1,'project',threads),'direct');
 assert.equal(chooseConversation(storage,2,'project',threads),'general');
 assert.equal(chooseConversation(storage,1,'other',threads),'general');
 assert.equal(chooseConversation(storage,1,'project',[{id:'general'}],'direct'),'general');
 assert.equal(chooseConversation(storage,1,'project',[]),'');
 assert.equal(chooseConversation({getItem(){throw Error('denied')},setItem(){throw Error('denied')}},1,'project',threads),'general');
});
test('conversation drafts survive reopening and remain isolated by account, workspace and thread',async()=>{
  const {chatDraftKey,readConversationDraft,writeConversationDraft}=await modulePromise;
  const values=new Map(),storage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
  const key=chatDraftKey(1,'project','direct-a');
  const draft={body:'Не потерять\nвторую строку',reply:'old-message',linked:'task',nonce:'one',edit:{id:'message',body:'Исправление'}};
  writeConversationDraft(storage,key,draft);
  assert.deepEqual(readConversationDraft(storage,key),draft);
  for(const other of [chatDraftKey(2,'project','direct-a'),chatDraftKey(1,'other','direct-a'),chatDraftKey(1,'project','group')])assert.equal(readConversationDraft(storage,other).body,'');
  writeConversationDraft(storage,key,{body:'',reply:'',linked:'',edit:{id:'message',body:''}});
  assert.equal(readConversationDraft(storage,key).edit.id,'message');
  writeConversationDraft(storage,key,{body:'',reply:'',linked:'',edit:null});
  assert.equal(values.size,0);
  storage.setItem(key,'{broken');assert.equal(readConversationDraft(storage,key).body,'');
});
test('history merge preserves old pages, applies edits and breaks timestamp ties consistently',async()=>{
  const {mergeChatHistory}=await modulePromise;
  const old=[{id:'b',createdAt:'2026-09-01',body:'before'},{id:'a',createdAt:'2026-09-01',body:'old'}];
  const merged=mergeChatHistory(old,[{id:'b',createdAt:'2026-09-01',body:'edited'},{id:'c',createdAt:'2026-09-02',body:'new'}]);
  assert.deepEqual(merged.map(item=>item.id),['a','b','c']);assert.equal(merged[1].body,'edited');assert.equal(old[0].body,'before');
});
test('mobile conversation drawer leaves taps alone and captures only a horizontal swipe',()=>{
  const source=fs.readFileSync(__dirname+'/app.js','utf8');
  const code=source.slice(source.indexOf('function bindChatDrawerSwipe()'),source.indexOf('function waitForIce('));
  const events={},classes=new Set(['show-threads']);let captures=0;
  const drawer={addEventListener:(name,fn)=>events[name]=fn,setPointerCapture:()=>captures++,style:{removeProperty:()=>{}},classList:{add:()=>{},remove:()=>{}}};
  const shell={addEventListener:()=>{},classList:{contains:name=>classes.has(name),remove:name=>classes.delete(name)}};
  vm.runInNewContext(code+';bindChatDrawerSwipe();',{$:selector=>selector==='.chat-thread-list'?drawer:shell,window:{matchMedia:()=>({matches:true})}});
  const down={isPrimary:true,pointerId:1,clientX:200,clientY:100};
  events.pointerdown(down);events.pointerup();assert.equal(captures,0);assert.ok(classes.has('show-threads'));
  events.pointerdown(down);events.pointermove({...down,clientX:197,clientY:150,preventDefault:()=>assert.fail('vertical scroll prevented')});events.pointerup();assert.equal(captures,0);
  events.pointerdown(down);events.pointermove({...down,clientX:110,clientY:102,preventDefault:()=>{}});events.pointerup();assert.equal(captures,1);assert.equal(classes.has('show-threads'),false);
});
test('pending chat isolates destinations and reconciles server IDs and author nonces without matching text',async()=>{
 const {pendingConversationItems}=await modulePromise;
 const context={owner:1,workspace:'a',thread:'direct'};
 const entry=(id,extra={})=>({id,...context,kind:'message',status:'queued',payload:{body:'same text'},createdAt:1,...extra});
 const items=[entry('first'),entry('second'),entry('other-owner',{owner:2}),entry('other-project',{workspace:'b'}),entry('other-thread',{thread:'group'}),entry('done',{status:'confirmed'}),entry('note',{kind:'note'}),entry('file',{kind:'attachment',status:'blocked',createdAt:2}),entry('paused',{status:'paused',createdAt:3})];
 assert.deepEqual(pendingConversationItems(items,[],context).map(item=>item.id),['first','second','file','paused']);
 assert.deepEqual(pendingConversationItems(items,[{id:'server',authorId:1,clientNonce:'first',body:'same text'}],context).map(item=>item.id),['second','file','paused']);
 assert.equal(pendingConversationItems(items,[{id:'server',authorId:2,clientNonce:'first'}],context).length,4);
 assert.equal(pendingConversationItems([entry('ack',{resultID:'server'})],[{id:'server',authorId:1}],context).length,0);
});


test('conversation lookup matches name tokens without changing order or searching message previews',async()=>{
 const {filterConversations}=await modulePromise;
 const threads=[{id:'pinned',title:'Ёлка — дизайн команды',pinned:true},{id:'dm',title:'',partnerUsername:'alice',lastMessage:'дизайн ёлки'},{id:'record',title:'Обсуждение',recordTitle:'План команды'}];
 const title=t=>t.title||t.partnerUsername;
 assert.deepEqual(filterConversations(threads,'  КОМАНДЫ   елка ',title).map(t=>t.id),['pinned']);
 assert.deepEqual(filterConversations(threads,'команды',title).map(t=>t.id),['pinned','record']);
 assert.deepEqual(filterConversations(threads,'ALICE',title).map(t=>t.id),['dm']);
 assert.deepEqual(filterConversations(threads,'дизайн ёлки',title),[]);
 assert.equal(filterConversations(threads,' ',title),threads);
 assert.deepEqual(threads.map(t=>t.id),['pinned','dm','record']);
});
