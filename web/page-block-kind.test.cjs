const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const helper = fs.readFileSync(path.join(__dirname, 'page-block-kind.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, 'page-apps.js'), 'utf8');
// Execute the real property event pipeline: protecting only change is too late
// because native select input already updates and persists the definition.
const handlers = source.slice(source.indexOf('const kindGuard='), source.indexOf("if(b.kind==='records')bindRecordCardConfig", source.indexOf('const kindGuard=')));
const collectPendingSource = source.slice(source.indexOf('function collectPending()'), source.indexOf('function properties()', source.indexOf('function collectPending()')));

function block() {
  return {
    id: 'records-one', kind: 'records', title: 'Список заявок', collectionId: 'board',
    actions: [{ id: 'approve', label: 'Принять', fieldId: 'status', value: 'approved',
      condition: { mode: 'all', conditions: [{ fieldId: 'amount', operator: 'gt', value: 0 }] },
      changes: [{ fieldId: 'total', operation: 'add', value: 15 }] }],
    recordBindings: { title: { fieldId: 'name', suffix: ' · заявка' } },
    recordCard: { enabled: true, parts: [{ id: 'main', kind: 'field', fieldId: 'name' }] },
    fields: ['amount'], elementStyles: { 'fieldValue:amount': { color: '#126a55' } },
  };
}

function element(tag = 'div') {
  return {
    tag, dataset: {}, attributes: {}, children: [],
    append(...children) { this.children.push(...children); },
    setAttribute(key, value) { this.attributes[key] = value; },
    querySelector(selector) {
      if (selector === '[data-block-kind-catalog]') return this.children.find(child => 'blockKindCatalog' in child.dataset) || null;
      return null;
    },
  };
}

function harness(value = block()) {
  const kind = { name: 'kind', value: value.kind, type: 'select-one', dataset: {}, attributes: {}, hasAttribute: () => false, setAttribute(key, value) { this.attributes[key] = value; } };
  const trigger = element('button'), form = { elements: { kind }, warning: null, querySelector(selector) { return selector === '[data-block-kind-warning]' ? this.warning : null; } };
  const anchor = { insertAdjacentElement(position, warning) { assert.equal(position, 'afterend');form.warning = warning; } };
  kind.closest = selector => selector === '.custom-select' ? { querySelector: () => trigger } : anchor;
  let saved = 0, painted = 0, previewed = 0, scrolled = 0;
  const buttons = ['heading', 'text', 'records'].map(kind => ({ dataset: { builderAdd: kind }, focused: 0, scrollIntoView() { scrolled++; }, focus(options) { assert.equal(options.preventScroll, true);this.focused++; } }));
  const catalog = { scrollIntoView() { scrolled++; } };
  const definition = { blocks: [value] }, pendingItems = {};
  const context = vm.createContext({
    b: value, form, state: { collections: [] }, definition, pendingItems, uid: () => 'new-item', toast: () => {},
    document: { createElement: element }, content: () => form,
    $: selector => selector === '.app-block-library' ? catalog : selector === '[data-builder-add]' ? buttons[0] : null,
    $$: (selector, root) => selector === '[data-builder-add]' && root === catalog ? buttons : [],
    updateVisibility: () => false, updateDataConfig: () => false, updatePageFinanceConfig: () => false, updateActionProperty: () => false, updateFormProperty: () => false,
    persist: () => { saved++; }, draw: () => { painted++; }, refreshElementPreview: () => { previewed++; },
  });
  vm.runInContext(helper.replace(/^export /gm, ''), context);
  vm.runInContext(handlers, context);
  vm.runInContext(collectPendingSource, context);
  return {
    value, form, trigger, kind, buttons, definition, pendingItems,
    get saved() { return saved; }, get painted() { return painted; }, get previewed() { return previewed; }, get scrolled() { return scrolled; },
    fire(type, next, input = kind) { input.value = next;return form[`on${type}`]({ type, target: input }); },
    collect() { return context.collectPending(); },
  };
}

test('native input then change retains kind, actions, conditions and every other block setting without persisting', () => {
  const h = harness(), original = JSON.stringify(h.value), actions = h.value.actions;
  h.fire('input', 'text');
  assert.equal(h.kind.value, 'records');
  h.fire('change', h.kind.value);
  assert.equal(JSON.stringify(h.value), original);
  assert.equal(h.value.actions, actions);
  assert.equal(h.saved, 0);assert.equal(h.painted, 0);assert.equal(h.previewed, 0);
});

test('the custom select change-only path rejects before mutation and resets its native value', () => {
  const h = harness(), original = JSON.stringify(h.value);
  h.fire('change', 'tracker');
  assert.equal(h.kind.value, 'records');assert.equal(JSON.stringify(h.value), original);assert.equal(h.saved, 0);
});

test('both events are safe even if a picker repeats its rejected value on change', () => {
  const h = harness(), original = JSON.stringify(h.value);
  h.fire('input', 'text');h.fire('change', 'text');
  assert.equal(JSON.stringify(h.value), original);assert.equal(h.saved, 0);assert.equal(h.kind.value, 'records');
});

test('inline explanation remains next to properties and its keyboard button focuses the existing catalog choice', () => {
  const h = harness();h.fire('change', 'text');
  const warning = h.form.warning;
  assert.equal(warning.attributes.role, 'status');assert.equal(warning.attributes['aria-live'], 'polite');
  assert.match(warning.children[0].textContent, /Добавьте блок нужного типа рядом/);
  assert.equal(h.trigger.attributes['aria-describedby'], warning.id);
  assert.equal(h.kind.attributes['aria-describedby'], warning.id);
  const add = warning.querySelector('[data-block-kind-catalog]');
  assert.equal(add.type, 'button');add.onclick();
  assert.equal(h.scrolled, 1);assert.equal(h.buttons.find(button => button.dataset.builderAdd === 'text').focused, 1);
  assert.equal(h.saved, 0);assert.equal(h.value.kind, 'records');
});

test('repeated attempts reuse one explanation and update the desired catalog item', () => {
  const h = harness();h.fire('change', 'text');const warning = h.form.warning;
  h.fire('change', 'heading');assert.equal(h.form.warning, warning);
  warning.querySelector('[data-block-kind-catalog]').onclick();
  assert.equal(h.buttons.find(button => button.dataset.builderAdd === 'heading').focused, 1);
  assert.equal(h.buttons.find(button => button.dataset.builderAdd === 'text').focused, 0);
});

test('lists without actions retain the existing type change behavior', () => {
  for (const actions of [[], undefined]) {
    const value = block();value.actions = actions;
    const h = harness(value);h.fire('input', 'text');h.fire('change', 'text');
    assert.equal(h.value.kind, 'text');assert.ok(h.saved > 0);assert.equal(h.painted, 1);assert.equal(h.form.warning, null);
  }
});

test('a rejected kind selection does not block title edits or change actions', () => {
  const h = harness(), original = JSON.stringify(h.value.actions);
  h.fire('input', 'text');
  const title = { name: 'title', type: 'text', dataset: {}, hasAttribute: () => false };
  h.fire('input', 'Новое название', title);
  assert.equal(h.value.title, 'Новое название');assert.equal(h.saved, 1);
  h.fire('change', h.kind.value);
  assert.equal(h.saved, 1);assert.equal(JSON.stringify(h.value.actions), original);
});

test('explicitly removing actions through their editor allows a later kind change', () => {
  const h = harness();h.fire('input', 'text');h.value.actions = [];
  h.fire('change', 'text');
  assert.equal(h.value.kind, 'text');assert.ok(h.saved > 0);
});

test('collectPending and the following serialization cannot reapply the rejected select value', () => {
  const h = harness(), original = JSON.stringify(h.value);
  h.definition.blocks.push({ id: 'tracker', kind: 'tracker', items: [] });
  h.pendingItems.tracker = 'Новый пункт';
  h.fire('input', 'text');h.fire('change', h.kind.value);
  assert.equal(h.collect(), true);
  const saved = JSON.parse(JSON.stringify({ definition: h.definition })).definition;
  assert.equal(JSON.stringify(saved.blocks[0]), original);
  assert.equal(saved.blocks[1].items[0].label, 'Новый пункт');
  assert.equal(h.kind.value, 'records');assert.equal(h.saved, 0);
});
