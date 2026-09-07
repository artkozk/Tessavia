const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const modulePromise=import('data:text/javascript;base64,'+fs.readFileSync(__dirname+'/chat-groups.js').toString('base64'));
test('group controls follow group roles, protect the owner and expose explicit orphan recovery',async()=>{
 const {groupMemberActions:actions}=await modulePromise;
 const owner={id:1,role:'owner',active:true},admin={id:2,role:'admin',active:true},member={id:3,role:'member',active:true};
 assert.deepEqual(actions({role:'member'},admin,3),[]);
 assert.deepEqual(actions({role:'admin'},owner,2),[]);
 assert.deepEqual(actions({role:'admin'},member,2),['remove']);
 assert.deepEqual(actions({role:'owner'},admin,1),['transfer','member','remove']);
 assert.deepEqual(actions({role:'owner'},member,1),['transfer','admin','remove']);
 assert.deepEqual(actions({role:'owner'},owner,1),[]);
 assert.deepEqual(actions({role:'owner'},{...member,active:false},1),['remove']);
 assert.deepEqual(actions({role:'member',canRecoverOwner:true},member,3),['transfer']);
 assert.deepEqual(actions({role:'member',canRecoverOwner:true},{...owner,active:false},3),[]);
});

test('ended or forbidden calls release media and never become phantom incoming calls',async()=>{
 const source=fs.readFileSync(__dirname+'/app.js','utf8'),start=source.indexOf('async function pollChatCall()'),poll=source.slice(start,source.indexOf('\nfunction startCallClock()',start));
 const vm=require('node:vm');
 for(const response of [null,403]){
  let stopped=0;
  const state={activeChatThreadId:'other',chatCall:{call:{id:'call',threadId:'private'}},chatIncomingCall:null,view:'chat'};
  const ctx=vm.createContext({state,captureProjectContext:()=>1,isProjectContextCurrent:()=>true,api:async path=>{assert.equal(path,'/api/chat/threads/private/calls/active');if(response===403)throw Object.assign(Error('forbidden'),{status:403});return null;},cleanupChatCall(){stopped++;state.chatCall=null;},renderChat(){}});
  vm.runInContext(poll,ctx);await ctx.pollChatCall();assert.equal(stopped,1);assert.equal(state.chatCall,null);assert.equal(state.chatIncomingCall,null);
 }
});
