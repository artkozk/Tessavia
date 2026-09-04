// Local Unicode 17.0 / CLDR 48.2 catalog. No third-party runtime requests.
export const EMOJI_DATA_URL = '/vendor/emoji-17.0-cldr48.2.json';
const defaults = ['👍', '✅', '❤️', '😂', '🤔', '🔥'];
const normalize = value => String(value).toLocaleLowerCase('ru').replaceAll('ё', 'е');
export const emojiKey = value => String(value).replaceAll('\ufe0f', '');
const tones = value => [...value].filter(c => c.codePointAt(0) >= 0x1f3fb && c.codePointAt(0) <= 0x1f3ff);

export function prepareCatalog(data) {
  const items = data.items.map(([value, name, english, keywords, group, base]) => ({
    value, name, group, base, tones: tones(value), search: normalize(`${name} ${english} ${keywords} ${data.groups[group]}`),
  }));
  const byKey = new Map(items.map(item => [emojiKey(item.value), item]));
  const families = new Map();
  for (const item of items) {
    if (!families.has(item.base)) families.set(item.base, []);
    families.get(item.base).push(item);
  }
  return { items, groups: data.groups, byKey, families, bases: items.filter(item => item.value === item.base) };
}

export function searchEmoji(catalog, { query = '', group = 'all', tone = 0, variants = false, values = null } = {}) {
  const exact = catalog.byKey.get(emojiKey(query.trim()));
  if (exact) return [exact];
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  let items = values ? values.map(value => catalog.byKey.get(emojiKey(value))).filter(Boolean) : variants ? catalog.items : catalog.bases;
  if (!values && !variants && tone > 0) {
    const modifier = String.fromCodePoint(0x1f3fa + tone);
    items = items.map(item => catalog.families.get(item.base).find(variant => variant.tones.length && variant.tones.every(value => value === modifier)) || item);
  }
  return items.filter(item => (group === 'all' || item.group === Number(group)) && words.every(word => item.search.includes(word)));
}

// The old unscoped storage is deliberately not imported: its owner is unknown.
export function createEmojiPreferences(storage) {
  const memory = new Map();
  const memoryOnly = new Set();
  const safe = value => typeof value === 'string' && value.length <= 64 && !/[\u0000-\u001f<>]/.test(value);
  const key = owner => `tessavie:chat-emoji:v1:${String(owner)}`;
  function read(owner) {
    if (!owner) return { tone: 0, entries: [] };
    if (memoryOnly.has(String(owner))) return memory.get(String(owner));
    try {
      const raw = storage?.getItem(key(owner));
      if (raw) {
        const value = JSON.parse(raw);
        return { tone: Number.isInteger(value.tone) && value.tone >= 0 && value.tone <= 5 ? value.tone : 0,
          entries: Array.isArray(value.entries) ? value.entries.filter(item => safe(item.emoji) && Number.isFinite(item.count) && item.count > 0 && Number.isFinite(item.last)).slice(0, 128) : [] };
      }
    } catch (_) { /* Storage is optional; account-scoped memory remains available. */ }
    return memory.get(String(owner)) || { tone: 0, entries: [] };
  }
  function save(owner, value) {
    if (!owner) return;
    memory.set(String(owner), value);
    try { storage?.setItem(key(owner), JSON.stringify(value)); } catch (_) { memoryOnly.add(String(owner)); }
  }
  return {
    read,
    tone(owner, tone) { const value = read(owner); save(owner, { ...value, tone }); },
    remember(owner, emoji, now = Date.now()) {
      if (!safe(emoji)) return;
      const value = read(owner), old = value.entries.find(item => emojiKey(item.emoji) === emojiKey(emoji));
      save(owner, { ...value, entries: [{ emoji, count: Math.min((old?.count || 0) + 1, 1000000), last: now }, ...value.entries.filter(item => emojiKey(item.emoji) !== emojiKey(emoji))].slice(0, 128) });
    },
    list(owner, mode = 'recent') {
      const entries = [...read(owner).entries].sort((a, b) => mode === 'frequent' ? b.count - a.count || b.last - a.last : b.last - a.last);
      return entries.map(item => item.emoji);
    },
    quick(owner) { return [...new Set([...this.list(owner, 'frequent'), ...defaults])].slice(0, 12); },
  };
}

export function insertEmojiAtSelection(textarea, value, start = textarea.selectionStart, end = textarea.selectionEnd) {
  textarea.setRangeText(value, start, end, 'end');
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

let catalogPromise;
export function loadEmojiCatalog() {
  if (!catalogPromise) catalogPromise = (async () => {
    const controller = new AbortController(), timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(EMOJI_DATA_URL, { signal: controller.signal, credentials: 'omit' });
      if (!response.ok) throw new Error('catalog unavailable');
      return prepareCatalog(await response.json());
    } finally { clearTimeout(timeout); }
  })().catch(error => { catalogPromise = null; throw error; });
  return catalogPromise;
}

export function createEmojiPickerUI({ preferences, escapeHTML }) {
  let opened;
  const esc = escapeHTML;
  function close(restore = true) {
    if (!opened) return;
    const previous = opened;
    opened = null;
    previous.controller.abort(); previous.root.remove(); previous.onClose();
    if (restore && previous.trigger?.isConnected) previous.trigger.focus({ preventScroll: true });
  }
  async function open({ owner, target, trigger, restoreFocus = trigger, parent, current, onChoose, onClose }) {
    if (opened?.target === target && opened.root.isConnected) { close(); return; }
    close(false);
    const root = document.createElement('section'), controller = new AbortController();
    root.className = 'chat-emoji-picker emoji-browser';
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-label', target === 'composer' ? 'Добавить эмодзи' : 'Реакция на сообщение');
    root.innerHTML = `<header><strong>${target === 'composer' ? 'Добавить эмодзи' : 'Реакция на сообщение'}</strong><button type="button" class="icon-button" data-emoji-close aria-label="Закрыть выбор эмодзи">×</button></header><input type="search" placeholder="Поиск: улыбка, флаг, heart" aria-label="Поиск эмодзи" autocomplete="off"><div class="emoji-browser-options"><select aria-label="Категория эмодзи"><option value="all">Все категории</option><option value="recent">Недавние</option><option value="frequent">Частые</option></select><select aria-label="Тон кожи"><option value="0">Тон: стандартный</option>${['🏻', '🏼', '🏽', '🏾', '🏿'].map((tone, i) => `<option value="${i + 1}">${tone} Тон ${i + 1}</option>`).join('')}</select></div><label class="emoji-variants-option"><input type="checkbox">Все варианты, включая разные тона кожи</label><div class="emoji-browser-status" role="status">Загружаем каталог…</div><div class="emoji-browser-results"></div><button type="button" class="text-button" data-emoji-more hidden>Показать ещё</button><div class="emoji-browser-error" role="alert" hidden></div>`;
    parent.append(root);
    const instance = opened = { root, controller, target, trigger: restoreFocus, onClose };
    const observer = new MutationObserver(() => { if (opened === instance && !root.isConnected) close(false); });
    observer.observe(document.body, { childList: true, subtree: true });
    controller.signal.addEventListener('abort', () => observer.disconnect(), { once: true });
    const active = () => opened === instance && root.isConnected && current();
    const input = root.querySelector('input[type=search]'), category = root.querySelector('select'), tone = root.querySelectorAll('select')[1], variants = root.querySelector('input[type=checkbox]');
    const results = root.querySelector('.emoji-browser-results'), status = root.querySelector('[role=status]'), error = root.querySelector('[role=alert]'), more = root.querySelector('[data-emoji-more]');
    tone.value = String(preferences.read(owner).tone);
    let catalog, limit = 72, busy = false, retry;
    const listen = (node, type, fn) => node.addEventListener(type, fn, { signal: controller.signal });
    const position = () => {
      const bounds = trigger.getBoundingClientRect(), viewport = window.visualViewport;
      const width = viewport?.width || window.innerWidth, height = viewport?.height || window.innerHeight;
      const left = viewport?.offsetLeft || 0, top = viewport?.offsetTop || 0;
      root.style.width = `${Math.min(384, width - 16)}px`;
      root.style.maxHeight = `${height - 16}px`;
      root.style.left = `${Math.max(left + 8, Math.min(bounds.left, left + width - root.offsetWidth - 8))}px`;
      root.style.top = `${Math.max(top + 8, Math.min(bounds.bottom + 8, top + height - root.offsetHeight - 8))}px`;
    };
    function paint() {
      if (!active() || !catalog) return;
      const history = ['recent', 'frequent'].includes(category.value);
      const list = searchEmoji(catalog, { query: input.value, group: history ? 'all' : category.value, tone: Number(tone.value), variants: variants.checked, values: history ? preferences.list(owner, category.value) : null });
      status.textContent = list.length ? `${Math.min(limit, list.length)} из ${list.length}` : history ? 'Здесь появятся использованные вами эмодзи' : 'Ничего не найдено. Попробуйте другое название.';
      results.innerHTML = list.slice(0, limit).map(item => `<button type="button" data-emoji-value="${esc(item.value)}" aria-label="${esc(item.name)}" title="${esc(item.name)}"><span aria-hidden="true">${esc(item.value)}</span></button>`).join('');
      more.hidden = list.length <= limit;
      position();
    }
    function fail(message, action) {
      retry = action;
      error.hidden = false;
      error.innerHTML = `<span>${esc(message)}</span><button type="button" class="text-button" data-emoji-retry>Повторить</button>`;
      position();
    }
    async function choose(value) {
      if (!active() || busy) return;
      busy = true; error.hidden = true; root.setAttribute('aria-busy', 'true');
      try {
        const remembered = await onChoose(value);
        if (!active()) return;
        if (remembered !== false) preferences.remember(owner, value);
        close();
      } catch (failure) {
        if (active()) fail(failure.message || 'Не удалось сохранить реакцию', () => choose(value));
      } finally { busy = false; root.removeAttribute('aria-busy'); }
    }
    listen(root, 'click', event => {
      if (event.target.closest('[data-emoji-close]')) { close(); return; }
      const choice = event.target.closest('[data-emoji-value]');
      if (choice) choose(choice.dataset.emojiValue);
      if (event.target.closest('[data-emoji-retry]')) retry?.();
    });
    listen(input, 'input', () => { limit = 72; paint(); });
    listen(category, 'change', () => { limit = 72; paint(); });
    listen(variants, 'change', () => { limit = 72; paint(); });
    listen(tone, 'change', () => { preferences.tone(owner, Number(tone.value)); paint(); });
    listen(more, 'click', () => { limit += 72; paint(); });
    listen(root, 'keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key === 'Tab') {
        const controls = [...root.querySelectorAll('button,input,select')].filter(node => !node.hidden && node.offsetParent !== null && !node.disabled);
        if (event.shiftKey && event.target === controls[0]) { event.preventDefault(); controls.at(-1)?.focus(); }
        else if (!event.shiftKey && event.target === controls.at(-1)) { event.preventDefault(); controls[0]?.focus(); }
      }
    });
    listen(document, 'pointerdown', event => { if (!root.contains(event.target) && !trigger.contains(event.target)) close(false); });
    listen(window, 'resize', position);
    if (window.visualViewport) { listen(window.visualViewport, 'resize', position); listen(window.visualViewport, 'scroll', position); }
    position();
    // Touch keyboards should open on demand, leaving the catalog visible initially.
    if (window.matchMedia('(pointer: fine)').matches) input.focus({ preventScroll: true });
    async function load() {
      error.hidden = true; status.textContent = 'Загружаем каталог…';
      try {
        catalog = await loadEmojiCatalog();
        if (!active()) return;
        category.insertAdjacentHTML('beforeend', catalog.groups.map((label, index) => `<option value="${index}">${esc(label)}</option>`).join(''));
        paint();
      } catch (_) {
        if (active()) { status.textContent = ''; fail('Каталог пока недоступен. Проверьте соединение.', load); }
      }
    }
    await load();
  }
  return { open, close };
}
