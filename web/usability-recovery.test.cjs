const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const path=require('node:path');
test('full horizon includes every month and week, detail is initially collapsed',()=>{
 const context=vm.createContext({Map,Date,Intl});
 vm.runInContext(fs.readFileSync(path.join(__dirname,'life-map.js'),'utf8').replaceAll('export ',''),context);
 for(const years of [80,150]){
  const html=vm.runInContext(`createLifeMapUI({state:{me:{id:1}},escapeHTML:v=>v,icon:()=>'',localISODate:()=> '2026-09-07'}).render({birthDate:'2000-01-01',lifeExpectancyYears:${years}})`,context);
  assert.equal((html.match(/<circle /g)||[]).length,years*12);
  assert.match(html,/life-map-overview/);
  assert.match(html,/<details class="life-map-detail" >/);
 }
});

test('completion remains visible on a board without changing list filters',()=>{
 const app=fs.readFileSync(path.join(__dirname,'app.js'),'utf8'),state={view:'work',workViewMode:'kanban',workStatus:'active'},c=vm.createContext({state});
 vm.runInContext(app.slice(app.indexOf('function showCompletedWorkOnBoard('),app.indexOf('async function moveCollectionRecord(')),c);
 vm.runInContext("showCompletedWorkOnBoard({status:'completed'})",c);assert.equal(state.workStatus,'all');
 state.workViewMode='list';state.workStatus='active';vm.runInContext("showCompletedWorkOnBoard({status:'completed'})",c);assert.equal(state.workStatus,'active');
 state.workViewMode='kanban';vm.runInContext("showCompletedWorkOnBoard({status:'in_progress'})",c);assert.equal(state.workStatus,'active');
});
