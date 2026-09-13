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

test('work board defaults hide three optional states without replacing personal settings', () => {
  const h = harness();
  assert.deepEqual(Array.from(h.run('currentPageLayout().hiddenFields')), ['column:inbox','column:blocked','column:review']);
  assert.equal(h.run('currentPageLayout().density'),'compact');
  assert.equal(h.state.interfacePreferences.layout.pages.work.hiddenFields,undefined);
  h.state.interfacePreferences.layout.pages.work.hiddenFields=['owner'];
  assert.deepEqual(Array.from(h.run('currentPageLayout().hiddenFields')), ['owner','column:inbox','column:blocked','column:review']);
  h.state.interfacePreferences.layout.pages.work.hiddenFields=['column:completed'];
  assert.deepEqual(Array.from(h.run('currentPageLayout().hiddenFields')), ['column:completed']);
  h.state.interfacePreferences.layout.pages.work.hiddenFields=['column:custom-stage'];
  assert.deepEqual(Array.from(h.run('currentPageLayout().hiddenFields')), ['column:custom-stage','column:inbox','column:blocked','column:review']);
  h.state.interfacePreferences.layout.pages.work={hiddenFields:[],workBoardColumnsConfigured:true};
  assert.deepEqual(Array.from(h.run('currentPageLayout().hiddenFields')), []);
  h.state.view='collections';h.state.activeCollectionId='custom';
  assert.equal(h.run('currentPageLayout().hiddenFields'),undefined);
});
test('draft previews only its own page and dashboard preview stays independent', () => {
  const h = harness();
  h.state.pageLayoutDraft = { key: 'work', value: { density: 'comfortable' } };
  assert.equal(h.run('currentPageLayout().density'), 'comfortable');
  h.state.view = 'idea'; assert.equal(h.run('currentPageLayout().hiddenFields[0]'), 'owner');
  h.state.layoutDraft = {}; assert.equal(h.run('Object.keys(currentPageLayout()).length'), 0);
});

test('personal sections inherit legacy layouts without sharing future edits', () => {
  const h=harness();h.state.view='personal';h.state.personalTab='today';
  const legacy={texts:{heading:'Моя страница'},blockSpans:{records:6},hiddenBlocks:['life']};
  h.state.interfacePreferences.layout.pages={personal:legacy};
  assert.equal(h.run('pageLayoutKey()'),'personal');
  for(const tab of ['notes','habits','finance']) {
    h.state.personalTab=tab;assert.equal(h.run('pageLayoutKey()'),`personal:${tab}`);
    assert.equal(h.run('currentPageLayout()'),legacy);
  }
  h.state.interfacePreferences.layout.pages['personal:finance']={texts:{heading:'Мой доход'}};
  assert.equal(h.run('currentPageLayout().texts.heading'),'Мой доход');
  h.state.personalTab='habits';assert.equal(h.run('currentPageLayout().texts.heading'),'Моя страница');
  h.state.interfacePreferences.layout.pages['personal:habits']={};
  assert.equal(h.run('Object.keys(currentPageLayout()).length'),0);
  assert.deepEqual(legacy,{texts:{heading:'Моя страница'},blockSpans:{records:6},hiddenBlocks:['life']});
});

test('calendar scopes inherit an existing layout until a separate override is saved', () => {
  const h = harness();
  const personal = { order: ['filters', 'month', 'heading'], blockSpans: { month: 4, heading: 8 }, blockSettings: { month: { height: 560 } }, texts: { heading: 'Мой календарь' }, hiddenBlocks: ['undated'] };
  h.state.interfacePreferences.layout.pages = { 'calendar:personal': personal };
  h.state.view = 'calendar'; h.state.calendarScope = 'project';
  assert.equal(h.run('currentPageLayout()'), personal);
  // The shared fallback is read-only: entering the other scope creates no saved override.
  assert.deepEqual(Object.keys(h.state.interfacePreferences.layout.pages), ['calendar:personal']);
  h.state.calendarMonth = '2026-10'; h.state.calendarDisplay = 'agenda';
  assert.equal(h.run('currentPageLayout().blockSettings.month.height'), 560);
  h.state.interfacePreferences.layout.pages['calendar:project'] = { texts: { heading: 'Командный календарь' } };
  assert.equal(h.run('currentPageLayout().texts.heading'), 'Командный календарь');
  h.state.calendarScope = 'personal';
  assert.equal(h.run('currentPageLayout()'), personal);
});

test('explicit calendar reset and legacy layout win over the opposite scope', () => {
  const h = harness(); h.state.view = 'calendar'; h.state.calendarScope = 'personal';
  h.state.interfacePreferences.layout.pages = { 'calendar:project': { blockSpans: { month: 4 } }, 'calendar:personal': {} };
  assert.equal(h.run('Object.keys(currentPageLayout()).length'), 0);
  delete h.state.interfacePreferences.layout.pages['calendar:personal'];
  h.state.interfacePreferences.layout.pages.calendar = { blockSpans: { month: 6 } };
  assert.equal(h.run('currentPageLayout().blockSpans.month'), 6);
  delete h.state.interfacePreferences.layout.pages.calendar;
  assert.equal(h.run('currentPageLayout().blockSpans.month'), 4);
  // No fallback is fetched from another user/workspace/device profile.
  h.state.interfacePreferences = { layout: { pages: {} } };
  assert.equal(h.run('Object.keys(currentPageLayout()).length'), 0);
  h.state.view = 'day';
  assert.equal(h.run('Object.keys(currentPageLayout()).length'), 0);
});

test('editing inherited calendar geometry makes an independent draft', () => {
  const h = harness(); h.state.view = 'calendar'; h.state.calendarScope = 'project';
  const personal = { blockSpans: { month: 4 }, blockSettings: { month: { height: 560 } } };
  h.state.interfacePreferences.layout.pages = { 'calendar:personal': personal };
  h.state.pageLayoutDraft = { key: 'calendar:project', value: structuredClone(h.run('savedPageLayout(state.interfacePreferences)')) };
  h.state.pageLayoutDraft.value.blockSettings.month.height = 780;
  assert.equal(h.run('currentPageLayout().blockSettings.month.height'), 780);
  assert.equal(personal.blockSettings.month.height, 560);
  h.state.pageLayoutDraft = null;
  assert.equal(h.run('currentPageLayout().blockSettings.month.height'), 560);
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
