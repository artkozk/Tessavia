const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function harness() {
  const listeners = new Map();
  const captured = new Set();
  let closed = false;
  let captures = 0;
  const style = { removeProperty() {} };
  const sidebar = {
    classList: { contains: () => true, add() {}, remove() {} }, style,
    addEventListener(name, callback) { listeners.set(name, callback); },
    setPointerCapture(id) { captures++; captured.add(id); },
    hasPointerCapture(id) { return captured.has(id); },
    releasePointerCapture(id) { captured.delete(id); },
  };
  const context = vm.createContext({
    $: (selector) => selector === '.sidebar' ? sidebar : { style },
    window: { matchMedia: () => ({ matches: true }) },
    setSidebarOpen(open) { closed = !open; },
  });
  vm.runInContext(source.slice(source.indexOf('function bindSidebarSwipe()'), source.indexOf('function workspaceHasActiveInput()')), context);
  vm.runInContext('bindSidebarSwipe()', context);
  return {
    get closed() { return closed; }, get captures() { return captures; }, captured,
    fire(type, values = {}) {
      const event = { type, pointerId: 1, isPrimary: true, button: 0, clientX: 200, clientY: 100, detail: 1, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
      listeners.get(type)(event);
      return event;
    },
  };
}

test('a normal menu tap retains its child click target', () => {
  const h = harness();
  h.fire('pointerdown'); h.fire('pointerup');
  assert.equal(h.captures, 0);
  assert.equal(h.fire('click').prevented, undefined);
  assert.equal(h.closed, false);
});

test('vertical scrolling does not capture or close navigation', () => {
  const h = harness(); h.fire('pointerdown');
  h.fire('pointermove', {clientX:180, clientY:200}); h.fire('pointercancel');
  assert.equal(h.captures, 0); assert.equal(h.closed, false);
});

test('horizontal swipe captures only after movement and closes without activating a link', () => {
  const h = harness(); h.fire('pointerdown');
  assert.equal(h.captures, 0);
  h.fire('pointermove', {clientX:100});
  assert.equal(h.captures, 1);
  h.fire('pointerup');
  assert.equal(h.captured.size, 0); assert.equal(h.closed, true);
  assert.equal(h.fire('click').prevented, true);
  h.fire('pointerdown'); h.fire('pointerup');
  assert.equal(h.fire('click').prevented, undefined);
});

test('cancelled horizontal swipe leaves the menu open', () => {
  const h = harness(); h.fire('pointerdown');
  h.fire('pointermove', {clientX:100}); h.fire('pointercancel');
  assert.equal(h.closed, false); assert.equal(h.captured.size, 0);
});
