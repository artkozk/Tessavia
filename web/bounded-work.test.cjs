const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const helpers = source.slice(source.indexOf('function currentWorkWindow('), source.indexOf('function renderWorkBody('));
test('the complete embedded UI parses, including collection markup', () => {
  new vm.Script(source.replace(/^import .*;$/gm, ''), {filename:'app.js'});
});
function setup() {
  const state = {me:{id:1},activeWorkspaceId:'team-a',view:'work',workViewMode:'list',workStatus:'all',search:''};
  const context = vm.createContext({state,icon:()=>'',CSS:{escape:String}});
  vm.runInContext(helpers,context);
  return context;
}
test('1201 records remain searchable; page boundaries, empty results and shrinking pages are exact', () => {
  const ctx=setup(), records=Array.from({length:1201},(_,i)=>({id:i+1,title:`Task ${i+1}`}));
  const first=ctx.workPage(records);
  assert.equal(first.items.length,25);assert.equal(first.pages,49);assert.equal(first.total,1201);
  ctx.currentWorkWindow().page=49;
  assert.deepEqual(Array.from(ctx.workPage(records).items,item=>item.id),[1201]);
  assert.equal(ctx.workPage(records.slice(0,26)).page,2);
  assert.equal(ctx.workPage([]).from,0);assert.equal(ctx.workPage([]).page,1);
  ctx.state.search='Task 1201';
  assert.equal(ctx.workPage(records.filter(item=>item.title===ctx.state.search)).items[0].id,1201);
  assert.equal(records.length,1201);
});
test('query changes reset pages and chunks; another account or team cannot inherit window state', () => {
  const ctx=setup(), current=ctx.currentWorkWindow();
  current.page=4;current.size=50;current.limits.completed=80;current.scroll.completed=[0,800];
  assert.equal(ctx.currentWorkWindow(),current);
  ctx.state.search='filter';let next=ctx.currentWorkWindow();
  assert.equal(next.page,1);assert.equal(next.size,50);assert.equal(Object.keys(next.limits).length,0);assert.equal(Object.keys(next.scroll).length,0);
  ctx.state.activeWorkspaceId='team-b';next=ctx.currentWorkWindow();assert.equal(next.size,25);
  next.page=2;ctx.state.me.id=2;assert.equal(ctx.currentWorkWindow().page,1);
  ctx.state.view='collections';ctx.state.activeCollectionId='board-a';ctx.currentWorkWindow().limits.stage=40;
  ctx.state.activeCollectionId='board-b';assert.equal(Object.keys(ctx.currentWorkWindow().limits).length,0);
});
test('board chunks preserve full counts and reveal every card without changing the source', () => {
  const ctx=setup(), records=Array.from({length:82},(_,id)=>({id}));
  assert.equal(ctx.boardWindow(records,'completed').items.length,20);
  assert.equal(ctx.boardWindow(records,'completed').total,82);
  ctx.currentWorkWindow().limits.completed=80;
  assert.equal(ctx.boardWindow(records,'completed').remaining,2);
  assert.match(ctx.renderBoardMore(ctx.boardWindow(records,'completed'),'completed'),/Показать ещё 2/);
  ctx.currentWorkWindow().limits.completed=100;
  assert.equal(ctx.boardWindow(records,'completed').items.length,82);
  assert.equal(ctx.renderBoardMore(ctx.boardWindow(records,'completed'),'completed'),'');
  assert.equal(records.length,82);
});
test('layout reparenting cannot reset a column scroll after more cards are rendered', () => {
  const ctx=setup(), window=ctx.currentWorkWindow(), root={dataset:{workWindowKey:window.key}};
  const node={dataset:{workScroll:'queued'},scrollLeft:0,scrollTop:1800};
  ctx.$=selector=>selector==='#main-content'?root:null;
  ctx.$$=selector=>selector==='[data-work-scroll]'?[node]:[];
  let frame;ctx.requestAnimationFrame=fn=>frame=fn;
  ctx.rememberWorkScroll();node.scrollTop=0;ctx.bindWorkWindow(()=>{});
  assert.equal(node.scrollTop,1800);
  node.scrollTop=0;frame();assert.equal(node.scrollTop,1800);
  ctx.state.activeWorkspaceId='other';ctx.currentWorkWindow();node.scrollTop=0;frame();assert.equal(node.scrollTop,0);
});
test('general board configures a personal view; custom schema stays scoped to the selected board', () => {
  const code=source.slice(source.indexOf('function bindWorkBoardToolbar('),source.indexOf('function renderWorkCollectionBoard('));
  let action,selected,view=0;
  const ctx=vm.createContext({state:{collections:[{id:'other'},{id:'chosen'}],workCollection:''},
    $:selector=>({addEventListener:(name,fn)=>{if(selector==='[data-work-board-settings]')action=fn;}}),
    openCollectionCreateDialog:()=>{},openCollectionSettingsDialog:item=>selected=item.id,startPageLayoutEditor:()=>view++});
  vm.runInContext(code,ctx);ctx.bindWorkBoardToolbar();action();assert.equal(view,1);assert.equal(selected,undefined);
  ctx.state.workCollection='chosen';action();assert.equal(selected,'chosen');assert.equal(view,1);
});
