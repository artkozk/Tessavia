const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
function harness(width = 252, options = {}) {
  const listeners = new Map();
  const registrations = new Map();
  const captured = new Set();
  const changes = [];
  let captures = 0;
  let now = 1000;
  const state = {};
  let mobile = true, modal = false, selection = null;
  const node = (selector, parentElement = null, extra = {}) => {
    const classes = new Set();
    return { selector, parentElement, hidden: false, scrollWidth: 300, clientWidth: 300, overflowX: 'visible',
      style: { removeProperty(key) { delete this[key]; } },
      classList: { contains: key => classes.has(key), add: (...keys) => keys.forEach(key => classes.add(key)), remove: (...keys) => keys.forEach(key => classes.delete(key)), toggle(key, value) { if (value) classes.add(key); else classes.delete(key); } },
      closest(selectors) { return selectors.split(',').map(value => value.trim()).includes(this.selector) ? this : this.parentElement?.closest(selectors) || null; },
      contains(target) { for (let current = target; current; current = current.parentElement) if (current === this) return true; return false; },
      setPointerCapture(id) { captures++; captured.add(id); }, hasPointerCapture: id => captured.has(id), releasePointerCapture: id => captured.delete(id),
      getBoundingClientRect: () => ({ width }), ...extra,
    };
  };
  const app = node('#app-root'), workspace = node('.workspace', app), sidebar = node('.sidebar', app), backdrop = node('#sidebar-backdrop', app);
  sidebar.classList.toggle('open', options.open !== false);
  const style = sidebar.style;
  const doc = { activeElement: null, hidden: false, querySelector: () => modal ? {} : null, getSelection: () => selection, addEventListener(name, callback, config) { listeners.set(name, callback); registrations.set(name, config); } };
  const win = { matchMedia: () => ({ matches: mobile }), getComputedStyle: element => ({ overflowX: element.overflowX }), addEventListener(name, callback) { listeners.set(name, callback); } };
  if (options.touchEvents) win.TouchEvent = function TouchEvent() {};
  const context = vm.createContext({
    state, document: doc,
    Date: { now: () => now },
    $: selector => ({ '.sidebar': sidebar, '#sidebar-backdrop': backdrop, '#app-root': app, '.workspace': workspace })[selector],
    window: win,
    setSidebarOpen(open) { sidebar.cancelSwipe(); sidebar.classList.toggle('open', open); changes.push(open); },
  });
  vm.runInContext(source.slice(source.indexOf('function bindSidebarSwipe()'), source.indexOf('function workspaceHasActiveInput()')), context);
  vm.runInContext('bindSidebarSwipe()', context);
  return {
    get closed() { return changes.includes(false); }, get open() { return sidebar.classList.contains('open'); }, get captures() { return captures; }, captured, sidebar, style, backdrop, workspace, app, node, state, doc, registrations, changes,
    set mobile(value) { mobile = value; }, set modal(value) { modal = value; }, set selection(value) { selection = value; },
    advanceTime(milliseconds) { now += milliseconds; },
    fire(type, values = {}) {
      const event = { type, target: sidebar, pointerId: 1, pointerType: 'pen', isPrimary: true, button: 0, clientX: 200, clientY: 100, detail: 1, cancelable: true, preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, stopImmediatePropagation() { this.stopped = true; }, ...values };
      listeners.get(type)(event);
      return event;
    },
    touch(type, values = {}) {
      const point = { identifier: 1, clientX: values.clientX ?? 200, clientY: values.clientY ?? 100 };
      const event = { type, target: sidebar.classList.contains('open') ? sidebar : workspace, cancelable: true, touches: type === 'touchend' || type === 'touchcancel' ? [] : [point], changedTouches: [point], preventDefault() { this.prevented = true; }, ...values };
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
  const h=harness(340); h.fire('pointerdown'); h.fire('pointermove',{clientX:135});
  assert.equal(h.style.transform,'translate3d(-65px, 0, 0)'); h.fire('pointerup'); assert.equal(h.closed,false);
  h.fire('pointerdown'); h.fire('pointermove',{clientX:130}); h.fire('pointerup'); assert.equal(h.closed,true);
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

test('touch opens from the middle of the page and leaves a tap untouched', () => {
  const h = harness(252, { open: false, touchEvents: true });
  const card = h.node('button', h.workspace);
  assert.equal(h.touch('touchstart', { target: card, clientX: 150 }).prevented, undefined);
  h.touch('touchend');
  assert.equal(h.fire('click', { target: card }).prevented, undefined);
  assert.equal(h.open, false);
  h.touch('touchstart', { target: card, clientX: 150 });
  // Reserve only an unambiguous horizontal move; the visual drag starts later.
  assert.equal(h.touch('touchmove', { clientX: 157 }).prevented, true);
  assert.equal(h.style.transform, undefined);
  assert.equal(h.touch('touchmove', { clientX: 235 }).prevented, true);
  assert.equal(h.style.transform, 'translate3d(-191px, 0, 0)');
  assert.equal(h.open, false);
  assert.equal(h.sidebar.classList.contains('swipe-opening'), true);
  h.touch('touchend');
  assert.equal(h.open, true);
  assert.equal(h.captures, 0);
  assert.equal(h.style.transform, undefined);
  assert.equal(h.sidebar.classList.contains('swipe-opening'), false);
  assert.equal(h.fire('click', { target: card }).prevented, true);
  assert.equal(h.registrations.get('touchstart').passive, true);
  assert.equal(h.registrations.get('touchmove').passive, false);
});

test('touch closes through a navigation child or the full backdrop without selecting it', () => {
  for (const surface of ['child', 'backdrop']) {
    const h = harness(252, { touchEvents: true });
    const target = surface === 'child' ? h.node('button', h.node('.project-nav-items', h.sidebar)) : h.backdrop;
    h.touch('touchstart', { target, clientX: 220 });
    h.touch('touchmove', { target, clientX: 212 });
    h.touch('touchmove', { target, clientX: 125 });
    h.touch('touchend', { target });
    assert.equal(h.closed, true, surface);
    assert.equal(h.fire('click', { target }).prevented, true, surface);
  }
});

test('vertical or ambiguous touch movement never reserves scrolling or changes direction later', () => {
  for (const [clientX, clientY] of [[152, 122], [170, 116], [140, 102]]) {
    const h = harness(252, { open: false, touchEvents: true });
    h.touch('touchstart', { clientX: 150 });
    assert.equal(h.touch('touchmove', { clientX, clientY }).prevented, undefined);
    assert.equal(h.touch('touchmove', { clientX: 280, clientY: 126 }).prevented, undefined);
    h.touch('touchend');
    assert.equal(h.open, false);
    assert.equal(h.fire('click').prevented, undefined);
  }
});

test('tiny touch jitter and a short intentional swipe do not open navigation', () => {
  const h = harness(252, { open: false, touchEvents: true });
  h.touch('touchstart', { clientX: 150 });
  assert.equal(h.touch('touchmove', { clientX: 153 }).prevented, undefined);
  h.touch('touchend'); assert.equal(h.open, false); assert.equal(h.fire('click').prevented, undefined);
  h.touch('touchstart', { clientX: 150 }); h.touch('touchmove', { clientX: 180 }); h.touch('touchend');
  assert.equal(h.open, false); assert.equal(h.style.transform, undefined); assert.equal(h.fire('click').prevented, true);
});

test('native horizontal containers keep the whole gesture, including either scroll boundary', () => {
  for (const scrollLeft of [0, 400]) {
    const h = harness(252, { open: false, touchEvents: true });
    const carousel = h.node('.custom-user-block', h.workspace, { scrollWidth: 700, clientWidth: 300, overflowX: 'auto', scrollLeft });
    const target = h.node('button', carousel);
    h.touch('touchstart', { target, clientX: 150 });
    assert.equal(h.touch('touchmove', { target, clientX: 245 }).prevented, undefined);
    h.touch('touchend'); assert.equal(h.open, false); assert.equal(h.fire('click').prevented, undefined);
  }
});

test('a vertical-only user block still permits intentional menu opening', () => {
  const h = harness(252, { open: false, touchEvents: true });
  const block = h.node('.custom-user-block', h.workspace, { scrollHeight: 900, clientHeight: 300, overflowX: 'auto' });
  h.touch('touchstart', { target: block, clientX: 160 }); h.touch('touchmove', { target: block, clientX: 250 }); h.touch('touchend');
  assert.equal(h.open, true);
});

test('controls, content editors, maps, media, chat gestures and known carousels keep their input', () => {
  const selectors = ['input', 'textarea', 'select', '[contenteditable]:not([contenteditable="false"])', '[role="slider"]', '.custom-select', '.drag-handle', '.widget-move-handle', '.widget-resize-handle', '[data-reorder-handle]', '[data-block-resize]', '.work-kanban', '.collection-board', '.research-option-deck', '.carousel', '.swiper', '.chat-bubble', '.chat-message', '.app-builder', '.page-layout-editing', 'canvas', 'iframe', 'audio', 'video', '[data-sidebar-swipe="off"]'];
  for (const selector of selectors) {
    const h = harness(252, { open: false, touchEvents: true });
    const target = h.node('span', h.node(selector, h.workspace));
    h.touch('touchstart', { target, clientX: 150 });
    assert.equal(h.touch('touchmove', { target, clientX: 250 }).prevented, undefined, selector);
    h.touch('touchend'); assert.equal(h.open, false, selector);
  }
});

test('focused input, active page edit, selected text, dialogs, desktop and hidden app block opening', () => {
  for (const condition of ['input', 'draft', 'selection', 'modal', 'desktop', 'hidden']) {
    const h = harness(252, { open: false, touchEvents: true });
    if (condition === 'input') h.doc.activeElement = h.node('input', h.workspace);
    if (condition === 'draft') h.state.pageLayoutDraft = {};
    if (condition === 'selection') h.selection = { type: 'Range' };
    if (condition === 'modal') h.modal = true;
    if (condition === 'desktop') h.mobile = false;
    if (condition === 'hidden') h.app.hidden = true;
    h.touch('touchstart', { clientX: 150 });
    assert.equal(h.touch('touchmove', { clientX: 250 }).prevented, undefined, condition);
    h.touch('touchend'); assert.equal(h.open, false, condition);
  }
});

test('browser-owned noncancelable touch movement cancels instead of opening after native panning', () => {
  for (const alreadyDragging of [false, true]) {
    const h = harness(252, { open: false, touchEvents: true });
    h.touch('touchstart', { clientX: 150 });
    if (alreadyDragging) h.touch('touchmove', { clientX: 180 });
    assert.equal(h.touch('touchmove', { clientX: 255, cancelable: false }).prevented, undefined);
    h.touch('touchend'); assert.equal(h.open, false); assert.equal(h.style.transform, undefined);
  }
});

test('multi-touch, cancellation, interrupted focus and viewport changes clear the preview', () => {
  for (const interruption of ['second-touch', 'multi-move', 'cancel', 'blur', 'hidden', 'modal', 'desktop']) {
    const h = harness(252, { open: false, touchEvents: true });
    h.touch('touchstart', { clientX: 150 }); h.touch('touchmove', { clientX: 245 });
    assert.ok(h.style.transform);
    if (interruption === 'second-touch') h.touch('touchstart', { touches: [{ identifier: 1 }, { identifier: 2 }] });
    if (interruption === 'multi-move') h.touch('touchmove', { touches: [{ identifier: 1 }, { identifier: 2 }] });
    if (interruption === 'cancel') h.touch('touchcancel');
    if (interruption === 'blur') h.fire('blur');
    if (interruption === 'hidden') { h.doc.hidden = true; h.fire('visibilitychange'); }
    if (interruption === 'modal') { h.modal = true; h.touch('touchmove', { clientX: 260 }); }
    if (interruption === 'desktop') { h.mobile = false; h.touch('touchmove', { clientX: 260 }); }
    h.touch('touchend');
    assert.equal(h.open, false, interruption); assert.equal(h.style.transform, undefined, interruption);
    assert.equal(h.backdrop.style.opacity, undefined, interruption);
    assert.equal(h.sidebar.classList.contains('swipe-opening'), false, interruption);
  }
});

test('Touch Events own touch input once; pen fallback remains available and mouse is ignored', () => {
  const h = harness(252, { open: false, touchEvents: true });
  for (const pointerType of ['mouse', 'touch']) {
    h.fire('pointerdown', { pointerType, target: h.workspace, clientX: 150 });
    h.fire('pointermove', { pointerType, clientX: 250 }); h.fire('pointerup', { pointerType });
    assert.equal(h.open, false, pointerType); assert.equal(h.captures, 0, pointerType);
  }
  h.touch('touchstart', { clientX: 150 }); h.touch('touchmove', { clientX: 180 });
  h.fire('pointercancel', { pointerType: 'touch' }); // Companion pointer stream must not cancel the touch stream.
  h.touch('touchmove', { clientX: 250 }); h.touch('touchend'); assert.equal(h.open, true);
  assert.deepEqual(h.changes, [true]);
  const fallback = harness(252, { open: false });
  fallback.fire('pointerdown', { pointerType: 'touch', target: fallback.workspace, clientX: 150 });
  fallback.fire('pointermove', { pointerType: 'touch', clientX: 245 }); fallback.fire('pointerup', { pointerType: 'touch' });
  assert.equal(fallback.open, true); assert.equal(fallback.captures, 1);
});

test('the next genuine mouse click is not swallowed after an interrupted touch gesture', () => {
  const h = harness(252, { open: false, touchEvents: true });
  h.touch('touchstart', { clientX: 150 }); h.touch('touchmove', { clientX: 180 }); h.touch('touchcancel');
  h.fire('pointerdown', { pointerType: 'mouse', target: h.workspace });
  assert.equal(h.fire('click', { target: h.workspace }).prevented, undefined);
});

test('ghost click suppression expires after 500 ms and is cleared on focus loss', () => {
  for (const reason of ['timeout', 'blur']) {
    const h = harness(252, { open: false, touchEvents: true });
    h.touch('touchstart', { clientX: 150 }); h.touch('touchmove', { clientX: 180 }); h.touch('touchcancel');
    if (reason === 'timeout') h.advanceTime(501);
    else h.fire('blur');
    assert.equal(h.fire('click', { target: h.workspace }).prevented, undefined, reason);
  }
});

test('a held swipe reserves its synthetic click when the finger finally lifts', () => {
  const h = harness(252, { open: false, touchEvents: true });
  h.touch('touchstart', { clientX: 150 }); h.touch('touchmove', { clientX: 245 });
  h.advanceTime(1500); h.touch('touchend');
  assert.equal(h.open, true);
  assert.equal(h.fire('click', { target: h.backdrop }).prevented, true);
});
