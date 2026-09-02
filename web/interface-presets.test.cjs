const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
const load = (context, name, next) => vm.runInContext(source.slice(source.indexOf(`function ${name}(`), source.indexOf(`function ${next}(`)), context);

test('shared links contain only the preset and not invitations or the current route', () => {
  const context = vm.createContext({ URL, location: { pathname: '/', origin: 'https://control.e-rd.ru', search: '?invite=secret', hash: '#private-record' } });
  load(context, 'interfacePresetShareURL', 'maybeOpenPendingInterfacePreset');
  assert.equal(vm.runInContext('interfacePresetShareURL("abc")', context), 'https://control.e-rd.ru/?interface-preset=abc');
});

test('a pending share opens after login and is consumed only once', () => {
  const opened = [], replacements = [];
  const state = { me: null, pendingInterfacePresetId: 'abc' };
  const context = vm.createContext({ state, URL, location: { href: 'https://example.test/?interface-preset=abc&other=1#work' }, history: { state: { view: 'work' }, replaceState(...args) { replacements.push(args); } }, openInterfacePresetDetail: (...args) => opened.push(args) });
  load(context, 'maybeOpenPendingInterfacePreset', 'interfacePresetSummaryText');
  assert.equal(vm.runInContext('maybeOpenPendingInterfacePreset()', context), false);
  state.me = { id: 1 };
  assert.equal(vm.runInContext('maybeOpenPendingInterfacePreset()', context), true);
  assert.deepEqual(opened, [['abc', 'public']]);
  assert.equal(replacements[0][2], '/?other=1#work');
  assert.equal(vm.runInContext('maybeOpenPendingInterfacePreset()', context), false);
});

test('applying a mobile-only response keeps the desktop profile untouched', () => {
  const desktop = { device: 'desktop', layout: { contentWidth: 1800 } };
  const state = { interfaceProfiles: { desktop, mobile: {} } };
  let renders = 0;
  const context = vm.createContext({ state, interfaceDevice: () => 'desktop', render: () => renders++ });
  load(context, 'applyInterfacePresetProfiles', 'openPresetsFromLayout');
  vm.runInContext('applyInterfacePresetProfiles({mobile:{device:"mobile",layout:{density:"compact"}}})', context);
  assert.equal(state.interfaceProfiles.desktop, desktop);
  assert.equal(state.interfacePreferences, desktop);
  assert.equal(state.interfaceProfiles.mobile.layout.density, 'compact');
  assert.equal(renders, 1);
});

test('opening presets never silently discards an unsaved layout', () => {
  let opened = 0, rendered = 0;
  const state = { layoutDraft: { changed: true }, layoutBaseline: '{}' };
  const context = vm.createContext({ state, confirm: () => false, leavePageLayoutEditor: () => true, render: () => rendered++, openInterfacePresetsDialog: () => opened++ });
  vm.runInContext(source.slice(source.indexOf('function openPresetsFromLayout('), source.indexOf('async function openInterfacePresetsDialog(')), context);
  vm.runInContext('openPresetsFromLayout()', context);
  assert.ok(state.layoutDraft);
  assert.equal(opened, 0);
  context.confirm = () => true;
  vm.runInContext('openPresetsFromLayout()', context);
  assert.equal(state.layoutDraft, null);
  assert.equal(opened, 1);
  assert.equal(rendered, 1);
});

test('preset dialogs ignore stale async responses after another dialog has replaced them', () => {
  assert.match(source, /if \(!dialog\.open \|\| !\$\(`\[data-preset-loading="\$\{request\}"\]`, content\)\) return;/);
  assert.match(source, /if \(workspace !== state\.activeWorkspaceId\) return;/);
});

test('saving a preset does not reopen a closed dialog or clear another form', async () => {
  for (const replaced of [false, true]) {
    let submitted, resolveRequest, opened = 0;
    const button = { disabled: false };
    const form = { isConnected: true, addEventListener(type, handler) { if (type === 'submit') submitted = handler; } };
    const dialog = { open: true, dataset: { composerDirty: 'true' } };
    const content = { innerHTML: '' };
    const passive = { addEventListener() {}, focus() {} };
    const context = vm.createContext({
      $: (selector) => selector === '#workspace-dialog' ? dialog : selector === '#workspace-dialog-content' ? content : selector === '#interface-preset-form' ? form : selector === 'button[type="submit"]' ? button : passive,
      discardComposerChanges: () => true, activeWorkspace: () => ({ name: 'QA' }), escapeHTML: (value) => value, icon: () => '',
      bindComposerForm() {}, openModal() {}, closeWorkspaceDialog() {}, toast() {},
      FormData: class { get(name) { return name === 'name' ? 'QA preset' : ''; } has() { return false; } },
      api: () => new Promise((resolve) => { resolveRequest = resolve; }),
      openInterfacePresetDetail: () => opened++,
    });
    vm.runInContext(source.slice(source.indexOf('function openCreateInterfacePresetDialog('), source.indexOf('async function openInterfacePresetDetail(')), context);
    vm.runInContext('openCreateInterfacePresetDialog()', context);
    const pending = submitted({ preventDefault() {} });
    if (replaced) form.isConnected = false;
    else dialog.open = false;
    resolveRequest({ id: 'saved' });
    await pending;
    assert.equal(opened, 0);
    assert.equal(dialog.dataset.composerDirty, 'true');
  }
});
