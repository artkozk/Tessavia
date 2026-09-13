const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const hasDraft = source.slice(source.indexOf('function dialogHasUnsavedChanges('), source.indexOf('function signalProtectedDialog('));
const transitions = source.slice(source.indexOf('async function confirmDialogTransition('), source.indexOf('function preventImplicitWorkspaceSubmit('));

function harness({ panelType = 'caption', dirty = true, flushOK = true, legacyDiscard = false } = {}) {
  const prompts = [], closes = [], notices = [], legacyCalls = [], flushCalls = [];
  const state = { me: { id: 'owner' }, activeWorkspaceId: 'personal-workspace' };
  const panel = { kind: panelType, isConnected: true, draft: 'My unsaved text' };
  const dialog = {
    id: 'workspace-dialog', open: true, panel: panelType === 'other' ? null : panel,
    dataset: { composerDirty: String(dirty), notebookDirty: 'false' },
    close(value) { closes.push(value); this.open = false; },
  };
  const context = vm.createContext({
    state, dialog,
    $(selector, parent) {
      if (selector === '.finance-dialog, .page-text-editor') return parent.panel;
      if (selector === '#record-edit-form.dirty') return parent.recordDirty ? {} : null;
      if (selector === '.has-unsaved-draft') return parent.localDraft ? {} : null;
      throw new Error(`Unexpected selector ${selector}`);
    },
    askChoice(options) { return new Promise((resolve, reject) => prompts.push({ options, resolve, reject })); },
    discardComposerChanges(value) { legacyCalls.push(value); return legacyDiscard; },
    flushDialogDrafts(value) { flushCalls.push(value); return flushOK; },
    toast(...args) { notices.push(args); },
  });
  vm.runInContext(hasDraft + transitions, context);
  return { state, dialog, panel, prompts, closes, notices, legacyCalls, flushCalls, run: expression => vm.runInContext(expression, context) };
}

test('cancel leaves a dirty caption editor open with its text and flags intact', async () => {
  const h = harness();
  const closing = h.run('requestDialogClose(dialog)');
  assert.equal(h.prompts.length, 1); assert.equal(h.dialog.pendingDiscard, true);
  h.prompts[0].resolve('cancel');
  assert.equal(await closing, false); assert.equal(h.dialog.open, true);
  assert.equal(h.dialog.dataset.composerDirty, 'true'); assert.equal(h.panel.draft, 'My unsaved text');
  assert.equal(h.closes.length, 0); assert.equal(h.dialog.pendingDiscard, false);
  assert.equal(h.flushCalls.length, 0); assert.equal(h.legacyCalls.length, 0);
});

test('explicit discard clears the original finance draft flag and closes that dialog once', async () => {
  const h = harness({ panelType: 'finance' });
  const closing = h.run('requestDialogClose(dialog, {returnValue: "discarded"})');
  assert.equal(h.prompts.length, 1); assert.equal(h.dialog.open, true);
  h.prompts[0].resolve('discard');
  assert.equal(await closing, true); assert.equal(h.dialog.dataset.composerDirty, 'false');
  assert.equal(h.dialog.open, false); assert.deepEqual(h.closes, ['discarded']);
  assert.equal(h.notices.length, 0); assert.equal(h.dialog.pendingDiscard, false);
});

test('repeated close or transition while a prompt is pending creates only one question', async () => {
  const h = harness();
  const first = h.run('requestDialogClose(dialog)');
  assert.equal(await h.run('requestDialogClose(dialog)'), false);
  assert.equal(await h.run('confirmDialogTransition(dialog)'), false);
  assert.equal(h.prompts.length, 1); assert.equal(h.closes.length, 0);
  h.prompts[0].resolve('discard'); assert.equal(await first, true);
  assert.equal(h.closes.length, 1); assert.equal(h.dialog.pendingDiscard, false);
  assert.equal(await h.run('requestDialogClose(dialog)'), true);
  assert.equal(h.prompts.length, 1); assert.equal(h.closes.length, 1);
});

test('confirmation approves a transition without itself physically closing the editor', async () => {
  const h = harness();
  const transition = h.run('confirmDialogTransition(dialog)');
  h.prompts[0].resolve('discard');
  assert.equal(await transition, true); assert.equal(h.dialog.open, true);
  assert.equal(h.dialog.dataset.composerDirty, 'false'); assert.equal(h.closes.length, 0);
});

for (const [name, change] of [
  ['owner', h => { h.state.me = { id: 'another-owner' }; }],
  ['sign out', h => { h.state.me = null; }],
  ['workspace', h => { h.state.activeWorkspaceId = 'another-workspace'; }],
  ['panel replacement', h => { h.dialog.panel = { kind: 'caption', isConnected: true, draft: 'New owner text' }; }],
  ['panel detachment', h => { h.panel.isConnected = false; }],
  ['already closed dialog', h => { h.dialog.open = false; }],
  ['save starts while confirmation is open', h => { h.dialog.dataset.settingsSaving = 'true'; }],
]) {
  test(`late discard after ${name} cannot close or clear another context`, async () => {
    const h = harness(); const originalPanel = h.panel;
    const closing = h.run('requestDialogClose(dialog)'); change(h); h.prompts[0].resolve('discard');
    assert.equal(await closing, false); assert.equal(h.dialog.dataset.composerDirty, 'true');
    assert.equal(originalPanel.draft, 'My unsaved text'); assert.equal(h.closes.length, 0);
    assert.equal(h.dialog.pendingDiscard, false);
    if (name === 'panel replacement') assert.equal(h.dialog.panel.draft, 'New owner text');
  });
}

test('active settings and profile saves block the transition before asking about discard', async () => {
  for (const key of ['settingsSaving', 'profileBusy']) {
    const h = harness(); h.dialog.dataset[key] = 'true';
    assert.equal(await h.run('requestDialogClose(dialog)'), false);
    assert.equal(h.prompts.length, 0); assert.equal(h.closes.length, 0);
    assert.equal(h.dialog.dataset.composerDirty, 'true'); assert.equal(h.dialog.open, true);
    assert.equal(h.notices.length, 1);
  }
});

test('dismissed question without a discard value leaves the original form untouched and can be asked again', async () => {
  const h = harness(); const first = h.run('confirmEditedPanelClose(dialog)');
  h.prompts[0].resolve(undefined); assert.equal(await first, false);
  assert.equal(h.dialog.pendingDiscard, false); assert.equal(h.dialog.dataset.composerDirty, 'true');
  const second = h.run('confirmEditedPanelClose(dialog)'); assert.equal(h.prompts.length, 2);
  h.prompts[1].resolve('cancel'); assert.equal(await second, false);
  assert.equal(h.panel.draft, 'My unsaved text');
});

test('a rejected question releases the pending guard without clearing the dirty form', async () => {
  const h = harness(); const closing = h.run('requestDialogClose(dialog)');
  h.prompts[0].reject(new Error('Question interrupted'));
  await assert.rejects(closing, /Question interrupted/);
  assert.equal(h.dialog.pendingDiscard, false); assert.equal(h.dialog.dataset.composerDirty, 'true');
  assert.equal(h.closes.length, 0); assert.equal(h.dialog.open, true);
});

test('ordinary composers keep their existing discard flow and clean editors retain draft flushing', async () => {
  const ordinary = harness({ panelType: 'other' });
  assert.equal(await ordinary.run('confirmDialogTransition(dialog)'), false);
  assert.equal(ordinary.legacyCalls.length, 1); assert.equal(ordinary.prompts.length, 0);
  const clean = harness({ dirty: false });
  assert.equal(await clean.run('requestDialogClose(dialog)'), true);
  assert.equal(clean.flushCalls.length, 1); assert.equal(clean.prompts.length, 0); assert.equal(clean.closes.length, 1);
  const failedFlush = harness({ dirty: false, flushOK: false });
  assert.equal(await failedFlush.run('requestDialogClose(dialog)'), false);
  assert.equal(failedFlush.dialog.open, true); assert.equal(failedFlush.closes.length, 0); assert.equal(failedFlush.notices.length, 1);
});
