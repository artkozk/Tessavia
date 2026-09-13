const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function harness(width = 252) {
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
    getBoundingClientRect() { return {width}; },
  };
  const context = vm.createContext({
    $: (selector) => selector === '.sidebar' ? sidebar : { style },
    window: { matchMedia: () => ({ matches: true }) },
    setSidebarOpen(open) { closed = !open; },
  });
  vm.runInContext(source.slice(source.indexOf('function bindSidebarSwipe()'), source.indexOf('function workspaceHasActiveInput()')), context);
  vm.runInContext('bindSidebarSwipe()', context);
  return {
    get closed() { return closed; }, get captures() { return captures; }, captured, sidebar, style,
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

test('a short swipe returns to the open menu without selecting a link', () => {
  const h = harness(); h.fire('pointerdown'); h.fire('pointermove', {clientX:170}); h.fire('pointerup');
  assert.equal(h.closed, false); assert.equal(h.captured.size,0); assert.equal(h.fire('click').prevented,true);
});

test('once vertical scrolling starts, later horizontal drift cannot close the menu', () => {
  const h = harness(); h.fire('pointerdown'); h.fire('pointermove', {clientX:190,clientY:125});
  h.fire('pointermove', {clientX:80,clientY:130}); h.fire('pointerup');
  assert.equal(h.captures,0); assert.equal(h.closed,false);
});

test('a rightward gesture never captures navigation', () => {
  const h=harness(); h.fire('pointerdown'); h.fire('pointermove',{clientX:270}); h.fire('pointerup');
  assert.equal(h.captures,0); assert.equal(h.closed,false); assert.equal(h.fire('click').prevented,undefined);
});

test('drag distance and close threshold follow the measured menu width', () => {
  const h=harness(340); h.fire('pointerdown'); h.fire('pointermove',{clientX:120});
  assert.equal(h.style.transform,'translate3d(-80px, 0, 0)'); h.fire('pointerup'); assert.equal(h.closed,false);
  h.fire('pointerdown'); h.fire('pointermove',{clientX:110}); h.fire('pointerup'); assert.equal(h.closed,true);
});

test('losing pointer capture cancels the swipe instead of closing', () => {
  const h=harness(); h.fire('pointerdown'); h.fire('pointermove',{clientX:80}); h.fire('lostpointercapture');
  assert.equal(h.closed,false); assert.equal(h.captured.size,0);
});

test('a second touch cancels tracking without committing the first gesture', () => {
  const h=harness(); h.fire('pointerdown'); h.fire('pointermove',{clientX:80}); h.fire('pointerdown',{pointerId:2,isPrimary:false}); h.fire('pointerup');
  assert.equal(h.closed,false); assert.equal(h.captured.size,0);
});

test('editing a control and keyboard activation are not swipe gestures', () => {
  const h=harness(); h.fire('pointerdown',{target:{closest:()=>({})}}); h.fire('pointermove',{clientX:50}); h.fire('pointerup');
  assert.equal(h.captures,0); assert.equal(h.fire('click',{detail:0}).prevented,undefined);
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
