const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'select-positioning.js'), 'utf8').replaceAll('export ', ''), context);
const place = context.selectMenuPosition;
const viewport = { left: 0, top: 0, width: 390, height: 780 };
const anchorAt = (top, left = 20, width = 350, height = 44) => ({ top, bottom: top + height, left, right: left + width, width });

test('finance source in the upper half opens immediately below its field, not at the screen bottom', () => {
  const anchor = anchorAt(190);
  const result = place({ anchor, viewport, contentHeight: 150 });
  assert.equal(result.placement, 'below');
  assert.equal(result.top - anchor.bottom, 6);
  assert.equal(result.left, anchor.left);
  assert.equal(result.width, anchor.width);
  assert.equal(result.height, 150);
});

test('payer near the bottom opens above with its whole short list visible', () => {
  const anchor = anchorAt(650);
  const result = place({ anchor, viewport, contentHeight: 180 });
  assert.equal(result.placement, 'above');
  assert.equal(anchor.top - (result.top + result.height), 6);
  assert.equal(result.height, 180);
});

test('long lists get a bounded scroll area and choose the side with useful room', () => {
  const result = place({ anchor: anchorAt(370), viewport, contentHeight: 2400 });
  assert.equal(result.placement, 'below');
  assert.equal(result.height, 320);
  const keyboard = place({ anchor: anchorAt(170), viewport: { ...viewport, height: 350 }, contentHeight: 2400 });
  assert.equal(keyboard.placement, 'above');
  assert.ok(keyboard.height >= 88 && keyboard.height < 320);
  assert.ok(keyboard.top >= 12);
});

test('keyboard, visual viewport offsets, zoom and safe areas bound all four sides', () => {
  const result = place({ anchor: anchorAt(350, 340, 340), viewport: { left: 160, top: 180, width: 230, height: 350 }, contentHeight: 700, safeInsets: { top: 20, right: 24, bottom: 34, left: 16 } });
  assert.ok(result.left >= 176);
  assert.ok(result.left + result.width <= 366);
  assert.ok(result.top >= 200);
  assert.ok(result.top + result.height <= 496);
  assert.notEqual(result.placement, 'viewport');
});

test('short one-option menu remains anchored even when there is only room for one row', () => {
  const anchor = anchorAt(70);
  const result = place({ anchor, viewport: { ...viewport, height: 180 }, contentHeight: 50 });
  assert.equal(result.placement, 'above');
  assert.equal(result.height, 50);
});

test('insufficient space and an offscreen anchor explicitly use a constrained labelled fallback', () => {
  const insufficient = place({ anchor: anchorAt(70), viewport: { ...viewport, height: 180 }, contentHeight: 600 });
  assert.equal(insufficient.placement, 'viewport');
  assert.equal(insufficient.reason, 'space');
  assert.ok(insufficient.top >= 12 && insufficient.top + insufficient.height <= 168);
  const hidden = place({ anchor: anchorAt(680), viewport: { ...viewport, height: 350 }, contentHeight: 250 });
  assert.equal(hidden.placement, 'viewport');
  assert.equal(hidden.reason, 'anchor-hidden');
});

test('viewport and anchor combinations never overflow visible bounds', () => {
  for (const width of [240, 320, 390, 820, 1440]) {
    for (const height of [150, 350, 780]) {
      for (const left of [-90, 12, width - 30]) {
        for (const top of [-150, 20, height / 2, height - 40, height + 40]) {
          const result = place({ anchor: anchorAt(top, left, width), viewport: { left: 0, top: 0, width, height }, contentHeight: 900 });
          assert.ok(result.left >= 12 && result.left + result.width <= width - 12);
          assert.ok(result.top >= 12 && result.top + result.height <= height - 12);
        }
      }
    }
  }
});

test('selected option is revealed by scrolling only the list and clamping at its ends', () => {
  const base = { scrollTop: 0, clientHeight: 200, scrollHeight: 1200, menuTop: 100, optionTop: 900, optionBottom: 944 };
  assert.equal(context.selectOptionScrollTop(base), 650);
  assert.equal(context.selectOptionScrollTop({ ...base, scrollTop: 650, optionTop: 250, optionBottom: 294 }), 650);
  assert.equal(context.selectOptionScrollTop({ ...base, scrollTop: 650, optionTop: 50, optionBottom: 94 }), 594);
  assert.equal(context.selectOptionScrollTop({ ...base, optionTop: 2200, optionBottom: 2244 }), 1000);
});

test('real positioning adapts to the keyboard without rebuilding or moving the form draft', () => {
  let anchor = anchorAt(190), expanded = false;
  const form = { scrollTop: 120, draft: { amount: '1000', note: 'Не терять' } };
  const menu = { style: {}, dataset: {}, scrollTop: 0, scrollHeight: 150, querySelector: () => null, matches: () => expanded, showPopover: () => { expanded = true; } };
  const trigger = { getBoundingClientRect: () => anchor };
  const window = { visualViewport: { offsetLeft: 0, offsetTop: 0, width: 390, height: 780 } };
  const local = vm.createContext({ window, selectMenuPosition: place, selectOptionScrollTop: context.selectOptionScrollTop, $: (selector) => selector.includes('trigger') ? trigger : menu, getComputedStyle: () => ({ getPropertyValue: () => '0', borderTopWidth: '1', borderBottomWidth: '1' }) });
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function positionCustomSelectMenu('), source.indexOf('function syncCustomSelect(')), local);
  local.positionCustomSelectMenu({});
  assert.equal(menu.style.top, '240px');
  assert.equal(menu.dataset.placement, 'below');
  window.visualViewport.height = 330;
  local.positionCustomSelectMenu({});
  assert.equal(menu.dataset.placement, 'above');
  assert.ok(parseFloat(menu.style.top) >= 12);
  assert.deepEqual(form, { scrollTop: 120, draft: { amount: '1000', note: 'Не терять' } });
  let focusOptions;
  const option = { focus: (options) => { focusOptions = options; }, getBoundingClientRect: () => ({ top: 500, bottom: 544 }) };
  Object.assign(menu, { scrollTop: 0, clientHeight: 200, clientTop: 1, scrollHeight: 1000, getBoundingClientRect: () => ({ top: 100 }) });
  local.focusCustomSelectOption(option, menu);
  assert.equal(focusOptions.preventScroll, true);
  assert.equal(menu.scrollTop, 249);
  assert.equal(form.scrollTop, 120);
});

test('a sticky fallback label cannot cover a focused option after scrolling', () => {
  const state = { scrollTop: 280, clientHeight: 200, scrollHeight: 1200, menuTop: 100, optionTop: 120, optionBottom: 164, topInset: 50 };
  const scrollTop = context.selectOptionScrollTop(state);
  assert.equal(scrollTop, 244);
  assert.equal(state.optionTop + state.scrollTop - scrollTop - state.menuTop, 56);
  // Moving to a row below the visible bottom still reveals the complete touch target.
  assert.equal(context.selectOptionScrollTop({ ...state, optionTop: 300, optionBottom: 344 }), 330);
});

test('resizing an open list preserves its scroll and reveals focused rows after the height shrinks', () => {
  let focused = null;
  const menu = { dataset: {}, scrollTop: 500, scrollHeight: 1200, clientTop: 1, matches: () => true, querySelector: (selector) => selector === '.custom-select-option:focus' ? focused : null };
  // Browsers clamp scrollTop to zero when measuring the menu at unconstrained height.
  menu.style = new Proxy({}, { set(target, key, value) { target[key] = value; if (key === 'maxHeight' && value === 'none') menu.scrollTop = 0; return true; } });
  Object.defineProperty(menu, 'clientHeight', { get: () => parseFloat(menu.style.maxHeight) - 2 });
  menu.getBoundingClientRect = () => ({ top: parseFloat(menu.style.top) });
  const trigger = { getBoundingClientRect: () => anchorAt(190) };
  const window = { visualViewport: { offsetLeft: 0, offsetTop: 0, width: 390, height: 780 } };
  const local = vm.createContext({ window, selectMenuPosition: place, selectOptionScrollTop: context.selectOptionScrollTop, $: (selector) => selector.includes('trigger') ? trigger : menu, getComputedStyle: () => ({ getPropertyValue: () => '0', borderTopWidth: '1', borderBottomWidth: '1' }) });
  const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
  vm.runInContext(source.slice(source.indexOf('function positionCustomSelectMenu('), source.indexOf('function syncCustomSelect(')), local);
  local.positionCustomSelectMenu({});
  assert.equal(menu.scrollTop, 500, 'measuring the menu must not reset the reader to its first row');
  let focusCalls = 0;
  focused = { focus: () => { focusCalls++; }, getBoundingClientRect: () => { const top = menu.getBoundingClientRect().top + menu.clientTop + 740 - menu.scrollTop; return { top, bottom: top + 44 }; } };
  window.visualViewport.height = 330;
  local.positionCustomSelectMenu({});
  const rect = focused.getBoundingClientRect();
  const visibleTop = menu.getBoundingClientRect().top + menu.clientTop;
  assert.ok(rect.top >= visibleTop + 6);
  assert.ok(rect.bottom <= visibleTop + menu.clientHeight - 6);
  assert.ok(menu.scrollTop > 500);
  assert.equal(focusCalls, 0, 'a resize reveals existing focus without stealing or resetting it');
});
