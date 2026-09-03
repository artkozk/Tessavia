const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function harness() {
  const state = { view: 'work', workspacePages: [], collections: [], interfacePreferences: { layout: { pages: { work: { density: 'compact' }, idea: { hiddenFields: ['owner'] } } } } };
  const context = vm.createContext({ state, CSS: { escape: v => v }, typeMeta: { idea: {}, research: {}, goal: {}, document: {} }, activeCollection: () => null, confirm: () => false, toast() {} });
  vm.runInContext(source.slice(source.indexOf('function pageLayoutKey('), source.indexOf('function startPageLayoutEditor(')), context);
  return { state, context, run: code => vm.runInContext(code, context) };
}
test('page settings are keyed by route and by individual CRM board', () => {
  const h = harness();
  assert.equal(h.run('currentPageLayout().density'), 'compact');
  h.state.view = 'idea';
  assert.equal(h.run('currentPageLayout().hiddenFields[0]'), 'owner');
  h.state.view = 'collections'; h.state.activeCollectionId = 'one';
  assert.equal(h.run('pageLayoutKey()'), 'collection:one');
  h.state.activeCollectionId = 'two';
  assert.equal(h.run('pageLayoutKey()'), 'collection:two');
  h.state.view = 'page:custom'; assert.equal(h.run('pageLayoutKey()'), 'page:custom');
});
test('draft previews only its own page and dashboard preview stays independent', () => {
  const h = harness();
  h.state.pageLayoutDraft = { key: 'work', value: { density: 'comfortable' } };
  assert.equal(h.run('currentPageLayout().density'), 'comfortable');
  h.state.view = 'idea'; assert.equal(h.run('currentPageLayout().hiddenFields[0]'), 'owner');
  h.state.layoutDraft = {}; assert.equal(h.run('Object.keys(currentPageLayout()).length'), 0);
});
test('all standard sections and custom pages expose an explicit catalog', () => {
  const h = harness();
  for (const view of ['work','personal','collections','principles','validation','outcomes','quality','history','notifications','chat','graph','structure','idea','research','goal','document']) {
    h.state.view = view;
    const catalog = h.run('pageLayoutCatalog()');
    assert.ok(catalog.blocks.length, view);
    assert.equal(new Set(catalog.blocks.map(b => b.key)).size, catalog.blocks.length, view);
  }
  h.state.workspacePages = [{id:'custom',fields:['owner']}]; h.state.view='page:custom';
  const custom = h.run('pageLayoutCatalog()');
  assert.deepEqual(Array.from(custom.fields, f=>f.key), ['owner']);
});
test('core controls cannot be hidden and the chat composer is not movable', () => {
  const h = harness();
  for (const view of ['work','collections','notifications','idea','history']) {
    h.state.view = view;
    assert.equal(h.run('pageLayoutCatalog().blocks.find(b=>b.key==="filters").required'), true);
    assert.equal(h.run('pageLayoutCatalog().blocks.find(b=>b.key==="records").required'), true);
  }
  h.state.view='chat'; assert.ok(h.run('pageLayoutCatalog().blocks.every(b=>!b.selector.includes("composer"))'));
});

test('work boards are registered after their controls, including custom-stage boards', () => {
  const h = harness();
  const expected = ['heading', 'filters', 'summary', 'boards', 'records'];
  for (const [mode, label, surface] of [
    ['list', 'Карточки', '.table-panel'],
    ['kanban', 'Доска', '.work-kanban'],
    ['kanban', 'Доска', '.collection-board'],
    ['calendar', 'Календарь', '.work-calendar'],
  ]) {
    h.state.workViewMode = mode;
    const blocks = h.run('pageLayoutCatalog().blocks');
    assert.deepEqual(Array.from(blocks, b => b.key), expected);
    const records = blocks.find(b => b.key === 'records');
    assert.ok(records.selector.split(', ').includes(':scope > ' + surface), surface);
    assert.equal(records.label, label);
    assert.equal(records.required, true);
  }
});
test('cancelled navigation retains changes; unchanged drafts leave without confirmation', () => {
  const h = harness();
  h.state.pageLayoutDraft={key:'work',value:{density:'compact'},baseline:'{}'};
  assert.equal(h.run('leavePageLayoutEditor()'),false);
  assert.ok(h.state.pageLayoutDraft);
  h.state.pageLayoutDraft.value={};
  assert.equal(h.run('leavePageLayoutEditor()'),true);
  assert.equal(h.state.pageLayoutDraft,null);
  h.state.pageLayoutSaving=true;
  assert.equal(h.run('leavePageLayoutEditor()'),false);
});
test('device editor offers desktop width only on desktop', () => {
  const h = harness();
  Object.assign(h.context, {$:()=>({textContent:'Page'}),icon:()=>'',escapeHTML:v=>v,deviceSelector:()=>'',toolbarNames:{create:'Create'},interfaceLayout:()=>({toolbarActions:['create']})});
  vm.runInContext(source.slice(source.indexOf('function renderPageLayoutEditor('), source.indexOf('function bindPageLayoutEditor(')),h.context);
  h.state.pageLayoutDraft={device:'mobile',value:{}};
  assert.doesNotMatch(h.run('renderPageLayoutEditor({blocks:[],fields:[]})'), /name="pageWidth"/);
  h.state.pageLayoutDraft.device='desktop';
  assert.match(h.run('renderPageLayoutEditor({blocks:[],fields:[]})'), /name="pageWidth"/);
});

test('render observer does not undo a pointer drag before it is committed', () => {
  const root={};
  const context=vm.createContext({state:{me:{id:1}},$:(selector)=>selector==='#main-content'?root:selector.includes('.reorder-dragging')?{}:null});
  vm.runInContext(source.slice(source.indexOf('function applyPageLayout('),source.lastIndexOf('bootstrap();')),context);
  assert.doesNotThrow(()=>vm.runInContext('applyPageLayout()',context));
});

test('resetting the dashboard keeps all other page settings', () => {
  const handlers = {};
  const pages = { work: { hiddenFields: ['owner'] } };
  const state = { layoutDraft: { layout: { pages }, dashboardWidgets: ['focus'] } };
  const context = vm.createContext({ state, widgetNames: {focus:'Focus'}, icon:()=>'', openPresetsFromLayout(){}, interfaceLayout:()=>({density:'comfortable'}), render(){}, bindLayoutFields(){}, $$:()=>[], $:selector=>({insertAdjacentHTML(){},addEventListener:(type,fn)=>{handlers[selector]=fn;}}) });
  vm.runInContext(source.slice(source.indexOf('function bindLayoutEditor('),source.indexOf('function pageLayoutKey(')),context);
  vm.runInContext('bindLayoutEditor()',context);
  handlers['[data-layout-reset]']();
  assert.equal(state.layoutDraft.layout.pages,pages);
});
