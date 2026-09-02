const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

function harness() {
  const state = { me: {id: 1}, pageSearch: '', records: [], workspacePages: [], projectNavigation: {enabledViews: ['work']}, interfacePreferences: {navOrder: []} };
  const context = vm.createContext({state, navItems: [['personal','Personal'],['work','Work'],['idea','Ideas']], markdownPlain: value => value || '', isWorkRecord: record => record.type === 'task'});
  for (const [start,end] of [['function isActiveRecord(', 'function sortWorkRecords('], ['function navigationCatalog(', 'function navCount('], ['function projectAllowsType(', 'function toggleCreateMenu('], ['function workspacePageRecords(', 'function renderWorkspacePage(']]) {
    vm.runInContext(source.slice(source.indexOf(start), source.indexOf(end)), context);
  }
  return {state, run: code => vm.runInContext(code, context)};
}

test('project modules and archived pages stay out of navigation, personal order is stable', () => {
  const h = harness();
  h.state.workspacePages = [{id:'one',name:'Mine'}, {id:'old',archived:true}];
  h.state.interfacePreferences.navOrder = ['page:one','work'];
  assert.equal(h.run('navigationCatalog().map(item => item.key).join(",")'), 'page:one,work,personal');
  assert.equal(h.run('navigationCatalog().map(item => item.key).join(",")'), 'page:one,work,personal');
  assert.equal(h.run('projectAllowsType("idea")'), false);
  assert.equal(h.run('projectAllowsType("task")'), true);
  h.state.projectNavigation.enabledViews.push('idea');
  assert.equal(h.run('projectAllowsType("idea")'), true);
});

test('page filters separate done, cancelled, review, owners and collections', () => {
  const h = harness();
  h.state.records = [
    {id:'open',type:'task',title:'Alpha',status:'planned',ownerId:1,collectionId:'a'},
    {id:'done',type:'task',title:'Alpha done',status:'completed',ownerId:1,collectionId:'a'},
    {id:'cancelled',type:'task',status:'cancelled',ownerId:1,collectionId:'a'},
    {id:'review',type:'task',status:'review',progress:100,ownerId:1,collectionId:'a'},
    {id:'foreign',type:'task',status:'planned',ownerId:2,collectionId:'b'},
    {id:'archive',type:'task',status:'archived',ownerId:1,collectionId:'a'},
  ];
  h.run('var page = {collectionId:"a", ownerFilter:"me", statusFilter:"active"}');
  assert.equal(h.run('workspacePageRecords(page).map(x=>x.id).join(",")'), 'open,review');
  assert.equal(h.run('workspacePageRecords({...page,statusFilter:"completed"}).map(x=>x.id).join(",")'), 'done');
  assert.equal(h.run('workspacePageRecords({...page,statusFilter:"all"}).length'), 4);
  assert.equal(h.run('workspacePageRecords(page,"ALPHA").length'), 1);
  assert.equal(h.run('workspacePageRecords({...page,archived:true}).length'), 0);
});

test('outside press closes temporary menus without closing a working editor', () => {
  const inside = {closest: () => null};
  const panel = {open:true, contains:target=>target===inside};
  const context = vm.createContext({$$:()=>[panel], closeCustomSelects() {}});
  vm.runInContext(source.slice(source.indexOf('function closeTransientPanels('),source.indexOf('function discardComposerChanges(')),context);
  context.inside = inside;
  vm.runInContext('closeTransientPanels(inside)',context);
  assert.equal(panel.open,true);
  vm.runInContext('closeTransientPanels()',context);
  assert.equal(panel.open,false);
});

test('unsaved composer settings require explicit discard', () => {
  const dialog = {dataset:{composerDirty:'true'}};
  const context = vm.createContext({dialog,confirm:()=>false});
  vm.runInContext(source.slice(source.indexOf('function discardComposerChanges('),source.indexOf('function bindComposerForm(')),context);
  assert.equal(vm.runInContext('discardComposerChanges(dialog)',context),false);
  assert.equal(dialog.dataset.composerDirty,'true');
  context.confirm=()=>true;
  assert.equal(vm.runInContext('discardComposerChanges(dialog)',context),true);
  assert.equal(dialog.dataset.composerDirty,'false');
});
