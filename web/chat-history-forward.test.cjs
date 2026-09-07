const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync(__dirname+'/app.js','utf8');
const loader=source.slice(source.indexOf('async function loadChatThread('),source.indexOf('\nfunction scheduleChatPoll()',source.indexOf('async function loadChatThread(')));
const message=id=>({id,createdAt:id,body:id});
test('forward reading keeps loaded history, draft and new edge through periodic refresh',async()=>{
 const state={activeChatThreadId:'thread',chatSearch:'',chatHistoryAround:'a',chatMessages:[],view:'chat',chatDraftText:'keep this draft'},requests=[],renders=[];
 let page;
 const ctx=vm.createContext({state,URLSearchParams,JSON,document:{visibilityState:'visible',querySelector:()=>null,querySelectorAll:()=>[]},$:()=>null,captureProjectContext:()=>1,isProjectContextCurrent:()=>true,renderNav(){},renderChat(){renders.push(state.chatMessages.map(m=>m.id));},toast(){},mergeChatHistory:(old,incoming)=>[...new Map([...old,...incoming].map(m=>[m.id,m])).values()].sort((a,b)=>a.id.localeCompare(b.id)),api:async path=>{requests.push(path);return path.includes('/history?')?page:[];}});
 vm.runInContext(loader,ctx);
 page={messages:[message('a')],hasMore:false,nextBefore:'a',hasNewer:true,nextAfter:'a'};
 await ctx.loadChatThread('thread');assert.equal(state.chatHistoryAfter,'a');
 page={messages:[message('b'),message('c')],hasMore:false,hasNewer:true,nextAfter:'c',nextBefore:'b'};
 await ctx.loadChatThread('thread',false,false,true);
 assert.ok(requests.some(path=>path.endsWith('/history?after=a')));
 assert.deepEqual(state.chatMessages.map(m=>m.id),['a','b','c']);assert.equal(state.chatAppending,true);
 page={messages:[message('b'),{...message('c'),body:'edited'}],hasMore:true,nextBefore:'b',hasNewer:true,nextAfter:'c'};
 await ctx.loadChatThread('thread',true);
 assert.ok(requests.some(path=>path.endsWith('/history?around=c')));
 assert.deepEqual(state.chatMessages.map(m=>m.id),['a','b','c']);assert.equal(state.chatMessages[2].body,'edited');
 assert.equal(state.chatDraftText,'keep this draft');assert.equal(state.chatHistoryBefore,'a');
 page={messages:[],hasMore:false,hasNewer:false,nextBefore:'',nextAfter:''};
 await ctx.loadChatThread('thread',false,false,true);
 assert.equal(state.chatHistoryAfter,'c');assert.equal(state.chatHistoryNewer,false);
 assert.deepEqual(state.chatMessages.map(m=>m.id),['a','b','c']);
});

test('revocation clears an open conversation, closes its settings and selects only a remaining permitted thread',async()=>{
 const state={me:{id:2},activeWorkspaceId:'project',activeChatThreadId:'private',chatSearch:'',chatMessages:[message('secret')],chatPins:[message('secret')],chatDigests:new Map([['private','secret digest']]),chatThreads:[{id:'private'},{id:'general'}],view:'chat',chatDraftText:'keep draft'};
 let closed=false,stopped=false,saved='',selected='';const main={innerHTML:''};
 const ctx=vm.createContext({state,URLSearchParams,JSON,localStorage:{},document:{visibilityState:'visible',querySelector:selector=>selector.includes('.chat-group-dialog')?{}:null,querySelectorAll:()=>[]},$:selector=>selector==='#main-content'?main:null,captureProjectContext:()=>1,isProjectContextCurrent:()=>true,renderNav(){},renderChat(){},toast(){},persistChatDraft(){saved=state.chatDraftText;return true;},closeDialogImmediately(){closed=true;},cleanupChatCall(){stopped=true;},chooseConversation:(_storage,_owner,_workspace,threads)=>threads[0]?.id,activateChatConversation(id){selected=id;},api:async path=>{if(path.includes('/history?'))throw Object.assign(Error('forbidden'),{status:403});return path==='/api/chat/threads'?[{id:'general'}]:[];}});
 vm.runInContext(loader,ctx);await ctx.loadChatThread('private',true);
 assert.equal(state.chatMessages.length,0);assert.equal(state.chatPins.length,0);assert.equal(state.chatDigests.size,0);assert.equal(closed,true);assert.equal(stopped,true);assert.equal(saved,'keep draft');assert.equal(selected,'general');assert.match(main.innerHTML,/Доступ к разговору закрыт/);
});


test('filtered attachment and favorite views do not mark the entire conversation as read',async()=>{
 for(const mode of ['files','favorites','all']) {
  const state={activeChatThreadId:'thread',chatSearch:'',chatMessages:[],view:'chat',chatFilesOnly:mode==='files',chatFavoritesOnly:mode==='favorites',chatDraftText:'keep draft'},requests=[];
  const ctx=vm.createContext({state,URLSearchParams,JSON,document:{visibilityState:'visible',querySelector:()=>null,querySelectorAll:()=>[]},$:()=>null,captureProjectContext:()=>1,isProjectContextCurrent:()=>true,renderNav(){},renderChat(){},toast(){},api:async path=>{requests.push(path);return path.includes('/history?')?{messages:[message('a')],hasMore:false,nextBefore:'a',nextAfter:'a'}:path==='/api/chat/threads'?[{id:'thread',unreadCount:4}]:[];}});
  vm.runInContext(loader,ctx);await ctx.loadChatThread('thread');
  assert.equal(requests.some(path=>path.endsWith('/read')),mode==='all');
  assert.equal(requests.some(path=>path.includes('attachments=true')),mode==='files');
  assert.equal(state.chatDraftText,'keep draft');
 }
});
