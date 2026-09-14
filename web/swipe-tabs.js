const installedSwipeTabs = new WeakMap();
const swipeInteractive = 'input, textarea, select, label, summary, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="slider"], [role="spinbutton"], [role="combobox"], [draggable="true"], .custom-select, .drag-handle, .widget-move-handle, .widget-resize-handle, [data-reorder-handle], [data-block-resize], [data-widget-drag], [data-widget-resize]';
const swipeEditing = 'input, textarea, select, [contenteditable]:not([contenteditable="false"]), [role="textbox"], [role="combobox"]';
const swipeOwned = 'canvas, iframe, audio, video, [role="application"], [data-swipe-tabs-ignore], .graph-stage, #relationship-graph, .chat-bubble, .chat-message, .chat-thread-drawer, .app-builder, .page-layout-editing, .layout-editing, .work-kanban, .collection-board, .research-option-deck, .carousel, [data-carousel], [aria-roledescription="carousel"], .swiper, .swiper-container';

function swipeElement(target) {
  return target?.nodeType === 3 ? target.parentElement : target;
}

function swipeSelected(tab) {
  return tab.getAttribute('aria-selected') === 'true' || tab.getAttribute('aria-pressed') === 'true';
}

function swipeTabs(root) {
  return [...root.querySelectorAll('[data-swipe-tab]')].filter(tab => tab.closest('[data-swipe-tabs]') === root &&
    tab.closest('[data-swipe-tablist]')?.closest('[data-swipe-tabs]') === root);
}

// Moving the tab strip must never scroll the page or a containing dialog.
export function revealSwipeTab(rootOrTab) {
  const root = rootOrTab?.closest?.('[data-swipe-tabs]');
  if (!root?.isConnected) return;
  const tab = rootOrTab.matches('[data-swipe-tab]') ? rootOrTab : swipeTabs(root).find(swipeSelected);
  const strip = tab?.closest('[data-swipe-tablist]');
  if (!strip || strip.closest('[data-swipe-tabs]') !== root || strip.clientWidth <= 0) return;
  const bounds = strip.getBoundingClientRect(), item = tab.getBoundingClientRect();
  const left = bounds.left + (strip.clientLeft || 0) + 8, right = left + strip.clientWidth - 16;
  const delta = item.left < left ? item.left - left : item.right > right ? item.right - right : 0;
  if (delta) strip.scrollLeft += delta;
}

/** Install one opt-in controller. Touches over controls, native scrollers and
 *  the tab strip keep their existing owner; only the content panel can swipe. */
export function installSwipeTabs({ doc = document, win = window, isEnabled = () => true, getContext = () => '', maxWidth = 820 } = {}) {
  installedSwipeTabs.get(doc)?.();
  let gesture = null, suppressClickUntil = 0, frame = null, stopAnimation = null, disposed = false;
  const listeners = [];
  const listen = (surface, name, callback, options) => {
    surface.addEventListener(name, callback, options);
    listeners.push(() => surface.removeEventListener(name, callback, options));
  };
  const now = () => Date.now();
  const hasSelection = () => {
    const selection = doc.getSelection?.();
    return selection?.type === 'Range' || selection?.isCollapsed === false;
  };
  const allowed = root => Boolean(!disposed && root?.isConnected && !doc.hidden &&
    !root.closest('[hidden], [inert], [aria-hidden="true"]') &&
    win.matchMedia(`(max-width: ${maxWidth}px)`).matches && !doc.querySelector('dialog[open]') &&
    !hasSelection() && !doc.activeElement?.matches?.(swipeEditing) && isEnabled(root));
  const enabledTab = tab => {
    if (tab.disabled || tab.getAttribute('aria-disabled') === 'true' || tab.closest('[hidden], [inert], [aria-hidden="true"]')) return false;
    const style = win.getComputedStyle(tab);
    return style.display !== 'none' && style.visibility !== 'hidden';
  };
  const ownsGesture = (target, panel, root) => {
    for (let node = target; node && root.contains(node); node = node.parentElement) {
      if (node.matches(swipeInteractive) || node.matches(swipeOwned)) return true;
      const style = win.getComputedStyle(node);
      if (node.scrollWidth > node.clientWidth + 2 && /^(auto|scroll|overlay)$/.test(style.overflowX)) return true;
      // A nested scroll area remains its own interaction surface, including at
      // its first/last item. The page panel itself can still scroll vertically.
      if (node !== panel && node !== root && node.scrollHeight > node.clientHeight + 2 && /^(auto|scroll|overlay)$/.test(style.overflowY)) return true;
      if (node === root) break;
    }
    return false;
  };
  const valid = value => Boolean(value && allowed(value.root) && value.panel.isConnected &&
    value.panel.closest('[data-swipe-tabs]') === value.root && getContext() === value.context &&
    swipeTabs(value.root).find(swipeSelected) === value.selected && enabledTab(value.selected));
  const cancel = () => {
    if (gesture?.claimed) suppressClickUntil = now() + 500;
    gesture = null;
  };
  const freshRoot = (root, key) => {
    if (root.isConnected || !key) return root;
    const matches = [...doc.querySelectorAll('[data-swipe-tabs]')].filter(node => node.getAttribute('data-swipe-tabs') === key);
    return matches.length === 1 ? matches[0] : null;
  };
  const scheduleReveal = (root, direction = '', expectedKey = '') => {
    if (frame !== null) win.cancelAnimationFrame(frame);
    const key = root.getAttribute('data-swipe-tabs'), context = getContext();
    frame = win.requestAnimationFrame(() => {
      frame = null;
      const current = freshRoot(root, key);
      if (!allowed(current) || getContext() !== context) return;
      const selected = swipeTabs(current).find(swipeSelected);
      if (!selected || expectedKey && selected.getAttribute('data-swipe-tab') !== expectedKey) return;
      revealSwipeTab(selected);
      if (!direction || win.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      const panel = [...current.querySelectorAll('[data-swipe-panel]')].find(node => node.closest('[data-swipe-tabs]') === current);
      if (!panel) return;
      stopAnimation?.();
      const className = direction === 'next' ? 'swipe-tabs-next' : 'swipe-tabs-previous';
      let timer;
      const clear = event => {
        if (event && event.target !== panel) return;
        panel.classList.remove(className);
        panel.removeEventListener('animationend', clear);
        win.clearTimeout(timer);
        if (stopAnimation === clear) stopAnimation = null;
      };
      stopAnimation = clear;
      panel.classList.add(className);
      panel.addEventListener('animationend', clear);
      timer = win.setTimeout(clear, 250);
    });
  };
  listen(doc, 'touchstart', event => {
    cancel();
    suppressClickUntil = 0;
    if (event.defaultPrevented || event.touches.length !== 1) return;
    const target = swipeElement(event.target), panel = target?.closest?.('[data-swipe-panel]');
    const root = panel?.closest('[data-swipe-tabs]');
    if (!root || !allowed(root) || target.closest('[data-swipe-tablist]') || ownsGesture(target, panel, root)) return;
    const tabs = swipeTabs(root), selected = tabs.find(swipeSelected);
    if (!selected || !enabledTab(selected)) return;
    const point = event.touches[0];
    gesture = { root, panel, selected, context: getContext(), id: point.identifier, x: point.clientX, y: point.clientY,
      distance: 0, direction: 0, claimed: false, next: null };
  }, { capture: true, passive: true });
  listen(doc, 'touchmove', event => {
    if (!gesture) return;
    if (event.defaultPrevented || event.touches.length !== 1 || !valid(gesture)) { cancel(); return; }
    const point = [...event.touches].find(item => item.identifier === gesture.id);
    if (!point) { cancel(); return; }
    const dx = point.clientX - gesture.x, dy = point.clientY - gesture.y;
    if (!gesture.claimed) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 5) return;
      if (Math.abs(dx) <= Math.abs(dy) * 1.5) { cancel(); return; }
      gesture.direction = dx < 0 ? -1 : 1;
      const tabs = swipeTabs(gesture.root).filter(enabledTab), index = tabs.indexOf(gesture.selected);
      gesture.next = tabs[index + (gesture.direction === -1 ? 1 : -1)];
      if (!gesture.next) { cancel(); return; }
    }
    if (!event.cancelable) { cancel(); return; }
    event.preventDefault();
    gesture.claimed = true;
    gesture.distance = Math.max(0, dx * gesture.direction);
    suppressClickUntil = now() + 500;
  }, { capture: true, passive: false });
  listen(doc, 'touchend', event => {
    if (!gesture) return;
    const value = gesture, point = [...event.changedTouches].find(item => item.identifier === value.id);
    const distance = point ? Math.max(0, (point.clientX - value.x) * value.direction) : 0;
    const threshold = Math.max(56, Math.min(80, value.panel.getBoundingClientRect().width * 0.18));
    const tabs = swipeTabs(value.root).filter(enabledTab), next = tabs[tabs.indexOf(value.selected) + (value.direction === -1 ? 1 : -1)];
    const commit = !event.defaultPrevented && !event.touches.length && point && value.claimed && distance >= threshold && valid(value) &&
      value.next?.isConnected && enabledTab(value.next) && next === value.next && value.next.closest('[data-swipe-tabs]') === value.root;
    cancel();
    if (!commit) return;
    const nextKey = value.next.getAttribute('data-swipe-tab');
    value.next.click();
    scheduleReveal(value.root, value.direction === -1 ? 'next' : 'previous', nextKey);
  }, { capture: true, passive: true });
  listen(doc, 'touchcancel', cancel, { capture: true, passive: true });
  // New physical input is not the compatibility click following the swipe.
  listen(doc, 'pointerdown', event => {
    if (!gesture) suppressClickUntil = 0;
    if (gesture && (event.pointerType === 'mouse' || event.isPrimary === false)) cancel();
  }, true);
  listen(doc, 'click', event => {
    if (suppressClickUntil && now() <= suppressClickUntil && event.detail !== 0) {
      suppressClickUntil = 0;
      event.preventDefault();
      event.stopImmediatePropagation();
      return;
    }
    const tab = swipeElement(event.target)?.closest?.('[data-swipe-tab]');
    const root = tab?.closest('[data-swipe-tabs]');
    if (root && enabledTab(tab)) scheduleReveal(root);
  }, true);
  listen(win, 'blur', () => { cancel(); suppressClickUntil = 0; });
  listen(win, 'resize', cancel);
  listen(doc, 'contextmenu', cancel, true);
  listen(doc, 'visibilitychange', () => { if (doc.hidden) cancel(); });
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    cancel();
    suppressClickUntil = 0;
    if (frame !== null) win.cancelAnimationFrame(frame);
    stopAnimation?.();
    listeners.forEach(remove => remove());
    if (installedSwipeTabs.get(doc) === dispose) installedSwipeTabs.delete(doc);
  };
  installedSwipeTabs.set(doc, dispose);
  return dispose;
}
