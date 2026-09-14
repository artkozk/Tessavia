const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'swipe-tabs.js'), 'utf8').replaceAll('export ', '');

function harness(options = {}) {
  let now = 1000, mobile = true, reducedMotion = false, enabled = true, owner = 'user-a/workspace-a', selection = null;
  const frames = new Map(), timers = new Map(), calls = [], registrations = [], all = [];
  let serial = 0;
  const emitter = value => Object.assign(value, {
    listeners: new Map(),
    addEventListener(type, callback, config) {
      const list = this.listeners.get(type) || [];
      list.push(callback); this.listeners.set(type, list); registrations.push({ surface: this, type, config });
    },
    removeEventListener(type, callback) { this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== callback)); },
    fire(type, extra = {}) {
      const event = { type, target: this, detail: 1, cancelable: true,
        preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; }, ...extra };
      for (const callback of [...(this.listeners.get(type) || [])]) { callback(event); if (event.stopped) break; }
      return event;
    },
  });
  const node = (tag = 'div', attributes = {}, parent = null, extra = {}) => {
    const classes = new Set(), attributesMap = { ...attributes };
    const item = emitter({ tag, nodeType: 1, parentElement: parent, children: [], hidden: false, disabled: false,
      clientWidth: 320, scrollWidth: 320, clientHeight: 100, scrollHeight: 100, clientLeft: 0, scrollLeft: 0, scrollTop: 0,
      rect: { left: 0, right: 320, width: 320 }, display: 'block', visibility: 'visible', overflowX: 'visible', overflowY: 'visible',
      getAttribute(name) { return this.hidden && name === 'hidden' ? '' : attributesMap[name] ?? null; },
      setAttribute(name, value) { attributesMap[name] = String(value); },
      removeAttribute(name) { delete attributesMap[name]; },
      classList: { add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name) },
      getBoundingClientRect() { return this.rect; },
      contains(target) { for (let current = target; current; current = current.parentElement) if (current === this) return true; return false; },
      get isConnected() { return this === body || Boolean(this.parentElement?.isConnected); },
      matches(selector) {
        return selector.split(',').some(part => {
          let value = part.trim();
          const not = /:not\((.*?)\)/.exec(value);
          if (not) { if (this.matches(not[1])) return false; value = value.replace(not[0], ''); }
          if (value.startsWith('.')) return classes.has(value.slice(1));
          if (value.startsWith('#')) return this.getAttribute('id') === value.slice(1);
          const attr = /\[([\w-]+)(?:="([^"]*)")?\]/.exec(value);
          if (attr) {
            const before = value.slice(0, attr.index);
            return (!before || before === this.tag) && this.getAttribute(attr[1]) !== null && (attr[2] === undefined || this.getAttribute(attr[1]) === attr[2]);
          }
          return value === this.tag;
        });
      },
      closest(selector) { for (let current = this; current; current = current.parentElement) if (current.matches(selector)) return current; return null; },
      querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); },
      querySelector(selector) { return this.querySelectorAll(selector)[0] || null; },
      click() {
        const click = doc.fire('click', { target: this, detail: 0 });
        if (!click.prevented && !this.disabled) this.onClick?.();
      },
      ...extra,
    });
    parent?.children.push(item); all.push(item); return item;
  };
  const body = node('body');
  const doc = emitter({ activeElement: null, hidden: false, getSelection: () => selection,
    querySelectorAll: selector => body.querySelectorAll(selector), querySelector: selector => body.querySelector(selector) });
  const win = emitter({ getComputedStyle: item => item,
    matchMedia: query => ({ matches: query.includes('prefers-reduced-motion') ? reducedMotion : mobile }),
    requestAnimationFrame(callback) { const id = ++serial; frames.set(id, callback); return id; }, cancelAnimationFrame: id => frames.delete(id),
    setTimeout(callback, delay) { const id = ++serial; timers.set(id, { callback, at: now + delay }); return id; }, clearTimeout: id => timers.delete(id),
  });
  let root, strip, panel, text, tabs;
  function makeRoot(selected = 'today') {
    const previous = root;
    if (previous) { previous.parentElement.children = previous.parentElement.children.filter(item => item !== previous); previous.parentElement = null; }
    root = node('section', { 'data-swipe-tabs': 'personal-habits', 'data-sidebar-swipe': 'off' }, body);
    strip = node('nav', { 'data-swipe-tablist': '' }, root, { clientWidth: 304, scrollWidth: 560, overflowX: 'auto', scrollTop: 19, rect: { left: 8, right: 312, width: 304 } });
    panel = node('div', { 'data-swipe-panel': '' }, root, { rect: { left: 8, right: 312, width: 304 } });
    text = node('p', {}, panel);
    tabs = ['today', 'all', 'do', 'avoid', 'paused'].map((key, index) => {
      const tab = node('button', { 'data-swipe-tab': key, 'aria-pressed': String(key === selected) }, strip,
        { rect: { left: 8 + index * 100, right: 108 + index * 100, width: 100 } });
      tab.onClick = () => {
        calls.push(key);
        if (options.rerender) makeRoot(key);
        else tabs.forEach(item => item.setAttribute('aria-pressed', String(item === tab)));
      };
      return tab;
    });
    return root;
  }
  makeRoot(options.selected || 'today');
  const ctx = vm.createContext({ Date: { now: () => now } });
  vm.runInContext(source, ctx);
  const install = () => ctx.installSwipeTabs({ doc, win, isEnabled: () => enabled, getContext: () => owner });
  let dispose = install();
  const point = (x = 200, y = 100, id = 1) => ({ identifier: id, clientX: x, clientY: y });
  const touch = (type, x = 200, y = 100, extra = {}) => doc.fire(type, { target: text,
    touches: ['touchend', 'touchcancel'].includes(type) ? [] : [point(x, y)], changedTouches: [point(x, y)], ...extra });
  const flush = () => { for (const [id, callback] of [...frames]) { frames.delete(id); callback(); } };
  const swipe = (end = 120) => { touch('touchstart'); touch('touchmove', end); touch('touchend', end); flush(); };
  return { doc, win, body, node, touch, swipe, flush, calls, registrations, frames, timers, ctx, makeRoot,
    get root() { return root; }, get strip() { return strip; }, get panel() { return panel; }, get text() { return text; }, get tabs() { return tabs; },
    get selected() { return tabs.find(tab => tab.getAttribute('aria-pressed') === 'true')?.getAttribute('data-swipe-tab'); },
    set enabled(value) { enabled = value; }, set mobile(value) { mobile = value; }, set reducedMotion(value) { reducedMotion = value; }, set owner(value) { owner = value; }, set selection(value) { selection = value; },
    advanceTime(ms) { now += ms; for (const [id, timer] of [...timers]) if (timer.at <= now) { timers.delete(id); timer.callback(); } },
    dispose() { dispose(); }, reinstall() { dispose = install(); },
  };
}

test('touch left/right switches one adjacent tab through the existing click, including fresh rendered DOM', () => {
  const h = harness({ rerender: true }); const first = h.root;
  h.swipe(); assert.equal(h.selected, 'all'); assert.equal(first.isConnected, false);
  h.swipe(280); assert.equal(h.selected, 'today'); assert.deepEqual(h.calls, ['all', 'today']);
  assert.equal(h.registrations.find(item => item.type === 'touchstart').config.passive, true);
  assert.equal(h.registrations.find(item => item.type === 'touchmove').config.passive, false);
});

test('ordinary tap and under-five-pixel jitter never prevent clicks or change selection', () => {
  const h = harness(); assert.equal(h.touch('touchstart').prevented, undefined);
  assert.equal(h.touch('touchmove', 197, 103).prevented, undefined); h.touch('touchend', 197, 103);
  assert.equal(h.doc.fire('click', { target: h.text }).prevented, undefined); assert.deepEqual(h.calls, []);
});

test('first clear horizontal touch is reserved early, while committing requires 56 px on a narrow panel', () => {
  const h = harness(); h.touch('touchstart'); assert.equal(h.touch('touchmove', 194, 102).prevented, true);
  assert.deepEqual(h.calls, []); h.touch('touchend', 150); assert.deepEqual(h.calls, []);
  assert.equal(h.doc.fire('click').prevented, true);
  h.touch('touchstart'); h.touch('touchmove', 144); h.touch('touchend', 144); assert.deepEqual(h.calls, ['all']);
});

test('larger panels have a measured threshold capped at 80 px', () => {
  const h = harness(); h.panel.rect.width = 700;
  h.swipe(125); assert.equal(h.selected, 'today'); h.swipe(120); assert.equal(h.selected, 'all');
});

test('first vertical or ambiguous move permanently leaves this gesture to normal scrolling', () => {
  for (const [x, y] of [[199, 108], [193, 105], [194, 106]]) {
    const h = harness(); h.touch('touchstart'); assert.equal(h.touch('touchmove', x, y).prevented, undefined);
    assert.equal(h.touch('touchmove', 100).prevented, undefined); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
    assert.equal(h.doc.fire('click').prevented, undefined);
  }
});

test('direction stays locked and a reversal or shorter finish does not accidentally select another tab', () => {
  const h = harness({ selected: 'all' }); h.touch('touchstart'); h.touch('touchmove', 110);
  h.touch('touchmove', 300); h.touch('touchend', 300); assert.equal(h.selected, 'all');
  h.touch('touchstart'); h.touch('touchmove', 100); h.touch('touchend', 170); assert.equal(h.selected, 'all');
});

test('disabled and hidden tabs are skipped; first/last tab bounds do not wrap or claim scrolling', () => {
  const h = harness(); h.tabs[1].disabled = true; h.tabs[2].hidden = true;
  h.swipe(); assert.equal(h.selected, 'avoid');
  h.tabs[4].setAttribute('aria-disabled', 'true');
  h.touch('touchstart'); assert.equal(h.touch('touchmove', 100).prevented, undefined); h.touch('touchend', 100);
  assert.deepEqual(h.calls, ['avoid']);
  const first = harness(); first.touch('touchstart'); assert.equal(first.touch('touchmove', 280).prevented, undefined); first.touch('touchend', 280); assert.deepEqual(first.calls, []);
});

test('header retains native horizontal scrolling and regular tab activation remains available', () => {
  const h = harness(); h.touch('touchstart', 200, 100, { target: h.tabs[1] });
  assert.equal(h.touch('touchmove', 100).prevented, undefined); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
  h.tabs[1].click(); h.flush(); assert.equal(h.selected, 'all');
});

test('text controls, drag handles and owned carousel surfaces keep their interactions', () => {
  for (const [tag, attrs, className] of [
    ['input', {}], ['textarea', {}], ['select', {}], ['summary', {}], ['label', {}],
    ['span', { contenteditable: '' }], ['div', { role: 'slider' }], ['div', { draggable: 'true' }],
    ['div', { 'data-widget-resize': '' }], ['div', { 'data-swipe-tabs-ignore': '' }], ['div', {}, 'carousel'], ['div', {}, 'drag-handle'],
    ['canvas', {}], ['video', {}], ['div', { 'aria-roledescription': 'carousel' }],
  ]) {
    const h = harness(), item = h.node(tag, attrs, h.panel); if (className) item.classList.add(className);
    const child = h.node('span', {}, item);
    h.touch('touchstart', 200, 100, { target: child }); assert.equal(h.touch('touchmove', 100).prevented, undefined, `${tag} ${JSON.stringify(attrs)} ${className}`);
    h.touch('touchend', 100); assert.deepEqual(h.calls, []);
  }
});

test('ordinary card buttons and links permit swipes without opening the original action; normal taps still work', () => {
  for (const [tag, attrs] of [['button', {}], ['a', { href: '/habit' }], ['span', { role: 'button' }]]) {
    const h = harness(), action = h.node(tag, attrs, h.panel);
    let opened = 0;
    const nativeClick = () => {
      const event = h.doc.fire('click', { target: action });
      if (!event.prevented) opened++;
      return event;
    };
    h.touch('touchstart', 200, 100, { target: action }); h.touch('touchend');
    assert.equal(nativeClick().prevented, undefined); assert.equal(opened, 1);
    h.touch('touchstart', 200, 100, { target: action }); h.touch('touchmove', 100); h.touch('touchend', 100);
    assert.equal(nativeClick().prevented, true); assert.equal(opened, 1); assert.deepEqual(h.calls, ['all']);
    h.touch('touchstart', 200, 100, { target: action }); h.touch('touchend');
    assert.equal(nativeClick().prevented, undefined); assert.equal(opened, 2);
  }
});

test('horizontal inner lists retain ownership at either scroll boundary, including arbitrary containers', () => {
  for (const scrollLeft of [0, 300]) {
    const h = harness(), scroller = h.node('div', {}, h.panel, { scrollWidth: 620, clientWidth: 320, overflowX: 'auto', scrollLeft });
    const child = h.node('span', {}, scroller);
    h.touch('touchstart', 200, 100, { target: child }); assert.equal(h.touch('touchmove', 100).prevented, undefined); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
  }
});

test('nested vertical scroll areas remain independent while a vertically scrolling panel permits tabs', () => {
  const h = harness(), inner = h.node('div', {}, h.panel, { scrollHeight: 500, clientHeight: 100, overflowY: 'auto' });
  h.touch('touchstart', 200, 100, { target: inner }); assert.equal(h.touch('touchmove', 100).prevented, undefined); h.touch('touchend', 100);
  h.panel.scrollHeight = 1000; h.panel.overflowY = 'auto'; h.swipe(); assert.deepEqual(h.calls, ['all']);
});

test('no swipe outside an opt-in panel, on desktop, with a selection, active input, dialog or editing guard', () => {
  const cases = [h => h.mobile = false, h => h.selection = { type: 'Range' }, h => h.enabled = false,
    h => h.doc.activeElement = h.node('textarea', {}, h.body), h => h.node('dialog', { open: '' }, h.body),
    h => h.root.hidden = true, h => h.root.setAttribute('inert', ''), h => h.doc.hidden = true];
  for (const prepare of cases) { const h = harness(); prepare(h); h.swipe(); assert.deepEqual(h.calls, []); }
  const h = harness(); h.touch('touchstart', 200, 100, { target: h.body }); h.touch('touchmove', 100); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
});

test('changes in account/workspace, active selection, rendering or editing cancel an in-flight touch', () => {
  for (const change of [h => h.owner = 'user-b/workspace-a', h => h.owner = 'user-a/workspace-b', h => h.enabled = false,
    h => h.tabs[1].click(), h => h.makeRoot(), h => h.mobile = false, h => h.doc.hidden = true, h => h.node('dialog', { open: '' }, h.body)]) {
    const h = harness(); h.touch('touchstart'); h.touch('touchmove', 100); const calls = h.calls.length;
    change(h); const after = h.calls.length; h.touch('touchend', 100); assert.equal(h.calls.length, after); assert.ok(after >= calls);
  }
});

test('disabling the destination during a swipe cannot activate it', () => {
  const h = harness(); h.touch('touchstart'); h.touch('touchmove', 100); h.tabs[1].disabled = true; h.touch('touchend', 100); assert.deepEqual(h.calls, []);
});

test('reordering tabs after a swipe starts cannot activate a destination which is no longer adjacent', () => {
  const h = harness(); h.touch('touchstart'); h.touch('touchmove', 100);
  h.strip.children = [h.tabs[0], h.tabs[2], h.tabs[1], h.tabs[3], h.tabs[4]];
  h.touch('touchend', 100); assert.deepEqual(h.calls, []);
});

test('touchcancel, noncancelable moves, second fingers and wrong identifiers never commit', () => {
  for (const cancel of [h => h.touch('touchcancel', 100), h => h.touch('touchmove', 100, 100, { cancelable: false }),
    h => h.touch('touchmove', 100, 100, { touches: [{ identifier: 2, clientX: 100, clientY: 100 }] }),
    h => h.touch('touchstart', 100, 100, { touches: [{ identifier: 1 }, { identifier: 2 }] }),
    h => h.touch('touchmove', 100, 100, { touches: [{ identifier: 1 }, { identifier: 2 }] })]) {
    const h = harness(); h.touch('touchstart'); h.touch('touchmove', 100); cancel(h); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
  }
  const h = harness(); h.touch('touchstart'); assert.equal(h.touch('touchmove', 100, 100, { cancelable: false }).prevented, undefined); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
});

test('window blur, resize, context menu and document hiding clear pending gestures', () => {
  for (const cancel of [h => h.win.fire('blur'), h => h.win.fire('resize'), h => h.doc.fire('contextmenu'), h => { h.doc.hidden = true; h.doc.fire('visibilitychange'); }]) {
    const h = harness(); h.touch('touchstart'); h.touch('touchmove', 100); cancel(h); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
  }
});

test('events already claimed by another component cannot switch tabs', () => {
  const h = harness(); h.touch('touchstart', 200, 100, { defaultPrevented: true }); h.touch('touchmove', 100); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
  h.touch('touchstart'); h.touch('touchmove', 100, 100, { defaultPrevented: true }); h.touch('touchend', 100); assert.deepEqual(h.calls, []);
  h.touch('touchstart'); h.touch('touchmove', 100); h.touch('touchend', 100, 100, { defaultPrevented: true }); assert.deepEqual(h.calls, []);
});

test('a bounded ghost click is suppressed without suppressing keyboard activation or the next tap', () => {
  const h = harness(); h.swipe(); assert.equal(h.doc.fire('click', { detail: 0 }).prevented, undefined);
  assert.equal(h.doc.fire('click').prevented, true); assert.equal(h.doc.fire('click').prevented, undefined);
  h.swipe(); h.touch('touchstart'); h.touch('touchend'); assert.equal(h.doc.fire('click').prevented, undefined);
  h.swipe(); h.advanceTime(501); assert.equal(h.doc.fire('click').prevented, undefined);
});

test('holding a claimed gesture renews ghost protection on release; subsequent mouse input is untouched', () => {
  const h = harness(); h.touch('touchstart'); h.touch('touchmove', 100); h.advanceTime(1200); h.touch('touchend', 100);
  assert.equal(h.doc.fire('click').prevented, true);
  h.swipe(); h.doc.fire('pointerdown', { pointerType: 'mouse', isPrimary: true }); assert.equal(h.doc.fire('click').prevented, undefined);
});

test('mouse movement never starts tab switching and touch-associated pointercancel cannot cancel Touch Events', () => {
  const h = harness(); h.doc.fire('pointerdown', { pointerType: 'mouse' }); h.doc.fire('pointermove', { clientX: 100 }); h.doc.fire('pointerup'); assert.deepEqual(h.calls, []);
  h.touch('touchstart'); h.touch('touchmove', 100); h.doc.fire('pointercancel', { pointerType: 'touch' }); h.touch('touchend', 100); assert.deepEqual(h.calls, ['all']);
});

test('reveal adjusts only the tab strip horizontally, preserving vertical scroll and avoiding page APIs', () => {
  const h = harness({ selected: 'avoid' }); h.strip.scrollTop = 42;
  h.ctx.revealSwipeTab(h.root); assert.equal(h.strip.scrollLeft, 104); assert.equal(h.strip.scrollTop, 42);
  h.tabs[3].rect = { left: 150, right: 250, width: 100 }; h.ctx.revealSwipeTab(h.tabs[3]); assert.equal(h.strip.scrollLeft, 104);
  h.tabs[3].rect = { left: -40, right: 60, width: 100 }; h.ctx.revealSwipeTab(h.tabs[3]); assert.equal(h.strip.scrollLeft, 48);
  assert.equal(h.strip.scrollTop, 42);
});

test('a successful swipe reveals the actual fresh selected tab and has a bounded, reduced-motion-aware animation', () => {
  const h = harness({ rerender: true }); h.swipe(); assert.equal(h.panel.classList.contains('swipe-tabs-next'), true);
  assert.equal(h.timers.size, 1); h.advanceTime(251); assert.equal(h.panel.classList.contains('swipe-tabs-next'), false); assert.equal(h.timers.size, 0);
  h.swipe(280); assert.equal(h.panel.classList.contains('swipe-tabs-previous'), true);
  h.panel.fire('animationend'); assert.equal(h.panel.classList.contains('swipe-tabs-previous'), false);
  h.reducedMotion = true; h.swipe(); assert.equal(h.panel.classList.contains('swipe-tabs-next'), false);
});

test('disposal and repeated installation remove listeners, pending animation and delayed work', () => {
  const h = harness(); h.reinstall(); h.swipe(); assert.deepEqual(h.calls, ['all']);
  assert.equal(h.doc.listeners.get('touchmove').length, 1); assert.equal(h.timers.size, 1);
  h.dispose(); h.dispose(); assert.equal(h.timers.size, 0); assert.equal(h.doc.listeners.get('touchmove').length, 0);
  h.swipe(); assert.deepEqual(h.calls, ['all']);
  const pending = harness(); pending.tabs[1].click(); assert.equal(pending.frames.size, 1); pending.dispose(); assert.equal(pending.frames.size, 0);
});

test('text-node targets work and nested opt-in panels activate only their own tab set', () => {
  const h = harness(); h.touch('touchstart', 200, 100, { target: { nodeType: 3, parentElement: h.text } });
  h.touch('touchmove', 100); h.touch('touchend', 100); assert.deepEqual(h.calls, ['all']);
  const inner = h.node('section', { 'data-swipe-tabs': 'inner' }, h.panel), list = h.node('nav', { 'data-swipe-tablist': '' }, inner);
  const first = h.node('button', { 'data-swipe-tab': 'one', 'aria-selected': 'true' }, list);
  const second = h.node('button', { 'data-swipe-tab': 'two', 'aria-selected': 'false' }, list);
  let clicks = 0; second.onClick = () => { clicks++; first.setAttribute('aria-selected', 'false'); second.setAttribute('aria-selected', 'true'); };
  const panel = h.node('div', { 'data-swipe-panel': '' }, inner);
  h.touch('touchstart', 200, 100, { target: panel }); h.touch('touchmove', 100); h.touch('touchend', 100);
  assert.equal(clicks, 1); assert.deepEqual(h.calls, ['all']);
});

test('a stale scheduled reveal cannot animate another account or a removed tab root', () => {
  const h = harness(); h.touch('touchstart'); h.touch('touchmove', 100); h.touch('touchend', 100);
  h.owner = 'someone-else'; h.flush(); assert.equal(h.timers.size, 0);
  const detached = harness(); detached.touch('touchstart'); detached.touch('touchmove', 100); detached.touch('touchend', 100);
  detached.root.parentElement.children = []; detached.root.parentElement = null; detached.flush(); assert.equal(detached.timers.size, 0);
});
