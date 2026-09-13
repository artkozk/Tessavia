const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const load=()=>import('data:text/javascript;base64,'+Buffer.from(fs.readFileSync(__dirname+'/personal-waiting.js')).toString('base64'));
test('waiting captions distinguish overdue, due today, future and missing dates',async()=>{const {waitingDateLabel}=await load(),today='2026-09-04';assert.match(waitingDateLabel({expectedDate:'2026-09-03',sinceDate:'2026-09-01',overdue:true},today),/Просрочено/);assert.match(waitingDateLabel({expectedDate:today,sinceDate:'2026-09-01'},today),/сегодня/);assert.match(waitingDateLabel({expectedDate:'2026-09-10',sinceDate:'2026-09-01'},today),/2026-09-10/);assert.match(waitingDateLabel({expectedDate:'',sinceDate:'2026-09-01'},today),/Ждём с/);});
test('waiting pages remain bounded and navigable',async()=>{const {waitingPages}=await load();assert.deepEqual(waitingPages(41,2,20),{pages:3,previous:true,next:true});assert.deepEqual(waitingPages(0,1,20),{pages:1,previous:false,next:false});});
test('waiting ping preview discloses the private title only after explicit choice',async()=>{const {waitingPingPreview,waitingPingName}=await load();assert.equal(waitingPingPreview('artkozk','Первый стартап','Секретный расчёт',false),'@artkozk ждёт вашего ответа в «Первый стартап»');assert.equal(waitingPingPreview('artkozk','Первый стартап','Секретный расчёт',true),'@artkozk ждёт вашего ответа в «Первый стартап»: «Секретный расчёт»');assert.equal(waitingPingName({username:'partner',displayName:''}),'@partner');assert.equal(waitingPingName({username:'partner',displayName:'Партнёр'}),'Партнёр');});

test('all waiting action delegates navigation and cannot mutate a cancelled page draft',()=>{
  const vm=require('node:vm');
  for(const approved of [false,true]){
    let click,renders=0;const calls=[],draft={key:'personal',value:{texts:{heading:'Unsaved title'}}},state={me:{id:1},view:'personal',personalTab:'today',pageLayoutDraft:draft};
    const button={addEventListener:(_,fn)=>click=fn},root={querySelectorAll:()=>[],querySelector:selector=>selector==='[data-waiting-all]'?button:null};
    const context=vm.createContext({document:{querySelector:()=>root}});
    vm.runInContext(fs.readFileSync(__dirname+'/personal-waiting.js','utf8').replaceAll('export ',''),context);
    const ui=context.createPersonalWaitingUI({state,api:()=>new Promise(()=>{}),navigate:view=>{calls.push(view);if(!approved)return false;state.personalTab='waiting';state.pageLayoutDraft=null;return true;},renderPersonal:()=>renders++});
    ui.bind();click();
    assert.deepEqual(calls,['personal:waiting']);assert.equal(renders,0,'action bypassed the route renderer');
    assert.equal(state.personalTab,approved?'waiting':'today');assert.equal(state.pageLayoutDraft,approved?null:draft);
  }
});
