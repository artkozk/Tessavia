const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'mobile-widgets.js'), 'utf8').replaceAll('export ', '');
const esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
const unesc = value => String(value ?? '').replaceAll('&quot;', '"').replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&amp;', '&');
const block = { pageId: 'page-one', pageName: 'Моя страница', blockId: 'block-one', title: 'Чтение', kind: 'tracker' };
const device = { id: 'device-one', name: 'Мой телефон', pageName: block.pageName, title: block.title, createdAt: '2026-09-14T10:00:00Z', lastUsedAt: '', expiresAt: '2026-12-13T10:00:00Z' };
const start = Date.parse('2026-09-14T10:00:00Z'), pairing = { id: device.id, pairingCode: 'abcdef0123456789abcdef0123456789', pairingExpiresAt: '2026-09-14T10:05:00Z' };
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fakeRoot() {
  let html = '', groups = {};
  return { get innerHTML() { return html; }, set innerHTML(value) {
    html = value; groups = {};
    for (const tag of html.matchAll(/<[^>]+>/g)) for (const match of tag[0].matchAll(/\b(data-mobile-widget-[a-z-]+)(?:="([^"]*)")?/g)) {
      const [, attr, raw = ''] = match, camel = attr.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      const node = { dataset: { [camel]: unesc(raw) }, disabled: /\bdisabled\b/.test(tag[0]), value: unesc(tag[0].match(/\bvalue="([^"]*)"/)?.[1]), focus() { this.focused = true; }, select() { this.selected = true; } };
      (groups[`[${attr}]`] ||= []).push(node);
    }
  }, querySelector(selector) { return groups[selector]?.[0] || null; }, querySelectorAll(selector) { return groups[selector] || []; } };
}
function harness() {
  const root = fakeRoot(), calls = [], timers = new Map(), clipboard = [];
  let current = { userId: 7, workspaceId: 'private', view: 'page:one' }, opened = true, time = start, timerID = 0;
  let handler = async (url, options = {}) => options.method === 'POST' ? pairing : options.method === 'DELETE' ? null : url.endsWith('/sources') ? { sources: [block] } : { devices: [device] };
  const ctx = vm.createContext({ Date, Map, Set, Promise, encodeURIComponent }); vm.runInContext(source, ctx);
  const nav = { clipboard: { async writeText(value) { clipboard.push(value); } } };
  const ui = ctx.createMobileWidgetsUI({ api: async (url, options) => { calls.push({ url, options }); return handler(url, options); }, getContext: () => current, isOpen: () => opened, escapeHTML: esc, icon: () => '', nav, now: () => time, schedule: (fn, delay) => { timers.set(++timerID, { fn, delay }); return timerID; }, cancel: id => timers.delete(id) });
  ui.mount(root);
  return { ui, root, calls, timers, clipboard, nav, ctx, node: name => root.querySelector(`[data-mobile-widget-${name}]`),
    select() { const node = this.node('source'); node.value = JSON.stringify([block.pageId, block.blockId]); node.onchange(); },
    name(value) { const node = this.node('name'); node.value = value; node.oninput(); },
    submit() { return this.node('form').onsubmit({ preventDefault() {} }); },
    set handler(value) { handler = value; }, set current(value) { current = value; }, get current() { return current; }, set opened(value) { opened = value; }, set time(value) { time = value; },
  };
}

test('the chosen constructor source and device name reach the captured workspace without automatic clipboard access', async () => {
  const h = harness(); await h.ui.open(); assert.equal(h.node('connect').disabled, true);
  h.select(); h.name('Рабочий телефон'); assert.equal(h.node('connect').disabled, false);
  await h.submit(); const post = h.calls.find(call => call.options.method === 'POST');
  assert.deepEqual(JSON.parse(post.options.body), { pageId: block.pageId, blockId: block.blockId, name: 'Рабочий телефон' });
  assert.equal(post.options.headers['X-Workspace-ID'], 'private'); assert.equal(post.options.headers['X-Outbox-Owner'], '7');
  assert.equal(h.clipboard.length, 0); assert.equal(h.node('code').value, pairing.pairingCode); assert.equal(h.node('connect').disabled, true);
  await h.node('copy').onclick(); assert.deepEqual(h.clipboard, [pairing.pairingCode]); assert.match(h.root.innerHTML, /Код скопирован/);
});

test('a source load cannot repaint after close, account switch or workspace switch', async () => {
  for (const change of ['close', 'account', 'workspace', 'view']) {
    const h = harness(), pending = deferred(); h.handler = () => pending.promise;
    const opening = h.ui.open(), original = h.root.innerHTML;
    if (change === 'close') h.opened = false;
    else h.current = { ...h.current, [change === 'account' ? 'userId' : change === 'workspace' ? 'workspaceId' : 'view']: 'changed' };
    pending.resolve({ sources: [block], devices: [device] }); await opening;
    assert.equal(h.root.innerHTML, original); assert.equal(h.node('source'), null);
  }
});

test('reset drops one-time codes and stale create responses never reappear in another session', async () => {
  const h = harness(); await h.ui.open(); h.select(); const pending = deferred(); h.handler = () => pending.promise;
  const submitting = h.submit(); h.ui.reset(); h.current = { ...h.current, userId: 8 }; pending.resolve(pairing); await submitting;
  assert.equal(h.root.innerHTML, ''); assert.equal(h.timers.size, 0); assert.equal(h.clipboard.length, 0);
  const active = harness(); await active.ui.open(); active.select(); await active.submit(); assert.equal(active.timers.size, 1);
  active.ui.reset(); assert.equal(active.timers.size, 0); assert.equal(active.root.innerHTML, '');
});

test('refresh and list failure preserve the source, name and successfully issued code', async () => {
  const h = harness(); await h.ui.open(); h.select(); h.name('Не терять черновик');
  h.handler = async (url, options) => { if (options.method === 'POST') return pairing; throw new Error('offline'); };
  await h.submit(); assert.equal(h.node('code').value, pairing.pairingCode); assert.match(h.root.innerHTML, /список подключений не обновился/);
  assert.equal(h.node('name').value, 'Не терять черновик');
  h.handler = async url => url.endsWith('/sources') ? { sources: [block] } : { devices: [device] };
  await h.node('reload').onclick(); assert.equal(h.node('name').value, 'Не терять черновик'); assert.equal(h.node('code').value, pairing.pairingCode);
  assert.match(h.root.innerHTML, /selected>Моя страница · Чтение/);
});

test('an installation-window repaint keeps the widget draft and one-time code without issuing another grant', async () => {
  const h = harness(); await h.ui.open(); h.select(); h.name('Мой сохранённый выбор'); await h.submit();
  const repainted = fakeRoot(); h.ui.mount(repainted);
  assert.equal(repainted.querySelector('[data-mobile-widget-name]').value, 'Мой сохранённый выбор');
  assert.equal(repainted.querySelector('[data-mobile-widget-code]').value, pairing.pairingCode);
  assert.match(repainted.innerHTML, /selected>Моя страница · Чтение/); assert.equal(h.calls.filter(call => call.options.method === 'POST').length, 1);
});

test('copy failure selects a read-only fallback and expired codes cannot be copied', async () => {
  const h = harness(); await h.ui.open(); h.select(); await h.submit(); h.nav.clipboard.writeText = async () => { throw new Error('denied'); };
  await h.node('copy').onclick(); assert.equal(h.node('code').focused, true); assert.equal(h.node('code').selected, true); assert.match(h.root.innerHTML, /скопируйте его вручную/);
  h.time = start + 300001; await h.node('copy').onclick(); assert.equal(h.node('code'), null); assert.equal(h.node('copy'), null); assert.match(h.root.innerHTML, /Срок кода истёк/);
});

test('expiry timer hides the code and reset cancels the timer', async () => {
  const h = harness(); await h.ui.open(); h.select(); await h.submit(); const timer = [...h.timers.values()][0];
  assert.equal(timer.delay, 300050); h.time = start + 300050; timer.fn(); assert.equal(h.node('code'), null); assert.equal(h.node('connect').disabled, false);
});

test('revoke is explicit, blocks duplicates and removes only the confirmed device and its code', async () => {
  const h = harness(); await h.ui.open(); h.select(); await h.submit(); const pending = deferred();
  h.handler = () => pending.promise; const button = h.node('revoke'), revoking = button.onclick(); await button.onclick();
  assert.equal(h.calls.filter(call => call.options.method === 'DELETE').length, 1); assert.equal(h.node('revoke').disabled, true); assert.ok(h.node('code'));
  pending.resolve(null); await revoking; assert.equal(h.node('revoke'), null); assert.equal(h.node('code'), null); assert.match(h.root.innerHTML, /Доступ отключён/);
  const deletion = h.calls.find(call => call.options.method === 'DELETE'); assert.equal(deletion.url, '/api/me/widgets/device-one'); assert.equal(deletion.options.headers['X-Outbox-Owner'], '7');
});

test('failed and stale revocations keep other settings intact and allow an explicit retry', async () => {
  const h = harness(); await h.ui.open(); h.select(); h.name('Черновик'); h.handler = async () => { throw new Error('offline'); };
  await h.node('revoke').onclick(); assert.ok(h.node('revoke')); assert.equal(h.node('revoke').disabled, false); assert.match(h.root.innerHTML, /Не удалось отключить/); assert.equal(h.node('name').value, 'Черновик');
  const pending = deferred(); h.handler = () => pending.promise; const revoking = h.node('revoke').onclick(), original = h.root.innerHTML;
  h.current = { ...h.current, workspaceId: 'another' }; pending.resolve(null); await revoking; assert.equal(h.root.innerHTML, original);
});

test('a delayed device-list response after code creation cannot resurrect a revoked grant', async () => {
  const h = harness(); await h.ui.open(); h.select(); const pending = deferred();
  h.handler = async (url, options) => options.method === 'POST' ? pairing : options.method === 'DELETE' ? null : pending.promise;
  const saving = h.submit(); await tick(); assert.ok(h.node('code'));
  await h.node('revoke').onclick(); assert.equal(h.node('revoke'), null);
  pending.resolve({ devices: [device] }); await saving; assert.equal(h.node('revoke'), null); assert.equal(h.node('code'), null);
});

test('issued code, redeemed grant and refreshed device are distinct states', () => {
  const h = harness(), model = { sources: [], devices: [device], draft: { source: '', name: '' } };
  assert.match(h.ctx.mobileWidgetsMarkup(model, esc, () => ''), /Ожидает подключения/);
  model.devices = [{ ...device, pairedAt: '2026-09-14T10:01:00Z' }];
  assert.match(h.ctx.mobileWidgetsMarkup(model, esc, () => ''), /Подключён · ещё не обновлялся/);
  model.devices[0].lastUsedAt = '2026-09-14T10:02:00Z';
  const refreshed = h.ctx.mobileWidgetsMarkup(model, esc, () => ''); assert.match(refreshed, /Обновлялся/); assert.doesNotMatch(refreshed, /Ожидает подключения/);
});

test('source labels retain the page name even when the shared select flattens option groups', () => {
  const h = harness(), model = { sources: [block, { ...block, pageId: 'page-two', pageName: 'Работа' }], devices: [], draft: { source: '', name: '' } };
  const html = h.ctx.mobileWidgetsMarkup(model, esc, () => '');
  assert.match(html, />Моя страница · Чтение<\/option>/); assert.match(html, />Работа · Чтение<\/option>/);
});

test('empty sources give a constructor route; names and code values are escaped, and no parallel sidebar is created', async () => {
  const h = harness(); h.handler = async url => url.endsWith('/sources') ? { sources: [] } : { devices: [] }; await h.ui.open();
  assert.equal(h.node('form'), null); assert.match(h.root.innerHTML, /конструкторе своей страницы/); assert.match(h.root.innerHTML, /Скачать APK для проверки/); assert.doesNotMatch(h.root.innerHTML, /data-view|data-personal-menu-add/);
  const html = h.ctx.mobileWidgetsMarkup({ sources: [{ ...block, pageName: '<img src=x>', title: '<b>bad</b>' }], devices: [{ ...device, name: '<script>bad</script>' }], draft: { source: '', name: '" onfocus="bad' } }, esc, () => '');
  assert.doesNotMatch(html, /<img|<script|<b>bad|value="" onfocus/); assert.match(html, /&lt;img/); assert.match(html, /Выход из сайта не отключает/);
});

test('double create clicks send only one request and a failed create never invents a code', async () => {
  const h = harness(); await h.ui.open(); h.select(); const pending = deferred(); h.handler = () => pending.promise;
  const submit = h.node('form').onsubmit, saving = submit({ preventDefault() {} }); await submit({ preventDefault() {} });
  assert.equal(h.calls.filter(call => call.options.method === 'POST').length, 1); pending.reject(new Error('network')); await saving;
  assert.equal(h.node('code'), null); assert.match(h.root.innerHTML, /запрос мог сохраниться на сервере/); assert.equal(h.node('connect').disabled, false);
});
