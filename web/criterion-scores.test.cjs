const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const slice = (start,end) => source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
function harness() {
  const ctx=vm.createContext({state:{me:{id:1}},Map,Number,escapeHTML:v=>String(v).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;'),formatDate:v=>v,emptyState:v=>v});
  vm.runInContext(slice('function criterionAggregate(','function renderLinksBlock('),ctx);
  return ctx;
}
test('weighted personal scores distinguish missing from zero, ignore inactive and zero-weight criteria',()=>{
  const h=harness();
  const criteria=[{id:'a',criterionWeight:1},{id:'b',criterionWeight:3},{id:'c',criterionWeight:100},{id:'d',criterionWeight:0},{id:'e',criterionWeight:100,status:'archived'}];
  const result=h.criterionAggregate(criteria,[{criterionId:'a',score:0},{criterionId:'a',score:10},{criterionId:'b',score:9},{criterionId:'d',score:0},{criterionId:'e',score:0}]);
  assert.equal(result.value,8); // (mean(0,10)*1 + 9*3) / 4
  assert.equal(result.rows[2].mean,null);
  assert.equal(h.criterionAggregate([{id:'a',criterionWeight:1}],[{criterionId:'a',score:0}]).value,0);
  assert.equal(h.criterionAggregate(criteria,[]).value,null);
  assert.equal(h.criterionAggregate([{id:'a',criterionWeight:0}],[{criterionId:'a',score:10}]).value,null);
});
test('personal form never copies another participant vote or defaults an unrated participant to zero',()=>{
  const h=harness(), record={id:'r',ownerId:1,updatedAt:'r1'}, criterion={id:'c',title:'Спрос',description:'Описание',updatedAt:'c1',criterionWeight:2};
  const votes=[{criterionId:'c',evaluatedBy:2,evaluatorUsername:'partner',score:8,note:'Иная позиция',updatedAt:'v2'}];
  let html=h.renderCriteriaBlock(record,[criterion],votes,[]);
  let form=html.match(/<form class="criterion-personal-form"[\s\S]*?<\/form>/)[0];
  assert.match(form,/name="score"[^>]*value=""/);assert.doesNotMatch(form,/Иная позиция/);
  assert.match(html,/partner: 8 \/ 10/);assert.match(html,/Иная позиция/);assert.match(html,/не утверждён/);
  votes.push({criterionId:'c',evaluatedBy:1,evaluatorUsername:'owner',score:0,note:'Нет спроса',updatedAt:'v1'});
  html=h.renderCriteriaBlock(record,[criterion],votes,[{criterionId:'c',score:6,reason:'Обсудили',deciderUsername:'owner',updatedAt:'d1',needsReview:true}]);
  form=html.match(/<form class="criterion-personal-form"[\s\S]*?<\/form>/)[0];
  assert.match(form,/name="score"[^>]*value="0"/);assert.match(form,/name="expectedUpdatedAt" value="v1"/);
  assert.match(html,/Принятый итог: 6 \/ 10/);assert.match(html,/Итог требует пересмотра/);
});
test('read-only participant sees scores without voting or approving controls',()=>{
  const h=harness();
  const html=h.renderCriteriaBlock({ownerId:2,authorId:2,editPolicy:'owner_only'},[{id:'c',title:'Спрос',description:'',criterionWeight:1,ownerId:2,authorId:2,editPolicy:'owner_only'}],[],[]);
  assert.doesNotMatch(html,/class="criterion-(personal|weight|decision)-form"/);
});
test('a late save cannot replace a different card opened while the request was pending',async()=>{
  let resolve; const pending=new Promise(r=>{resolve=r});let rendered=0;
  const state={me:{id:1},activeWorkspaceId:'a',activeRecordRequest:1,activeDetail:{record:{id:'old'}},detailCache:new Map()};
  const h=vm.createContext({state,api:async()=>pending,fetchRecordDetail:async()=>({record:{id:'old'}}),syncProjectChanges:async()=>{},renderRecordDialog:()=>rendered++,toast(){}});
  vm.runInContext(slice('async function mutateDetail(','async function mutateRecord('),h);
  const saving=h.mutateDetail('/api/records/old/criteria/c',{method:'PUT'});
  state.activeRecordRequest++;state.activeDetail={record:{id:'new'}};resolve();await saving;
  assert.equal(state.activeDetail.record.id,'new');assert.equal(rendered,0);
});
