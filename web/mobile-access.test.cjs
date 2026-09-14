const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, 'mobile-access.js'), 'utf8').replaceAll('export ', '');
const app = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const origin = 'https://control.e-rd.ru', esc = value => String(value ?? '').replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;');
const fragment = (start, end) => app.slice(app.indexOf(start), app.indexOf(end));
function context(extra = {}) { const ctx = vm.createContext({ URL, Set, Promise, ...extra }); vm.runInContext(source, ctx); return ctx; }
const tick = () => new Promise(resolve => setImmediate(resolve));

test('launch accepts only one known same-origin action without data, nested routes, or alternate intents', () => {
  const ctx = context();
  for (const action of ['note', 'plan', 'notes', 'today', 'notifications']) assert.equal(ctx.mobileLaunchAction(`${origin}/?launch=${action}`, origin), action);
  for (const url of ['/?launch=delete', '/?launch=note&launch=plan', '/?launch=note&text=secret', '/?launch=note&invite=secret', '/?launch=note&interface-preset=x', '/?launch=note&redirect=https://evil.test', '/x?launch=note', '/?launch=note#plan', '//evil.test/?launch=note', 'javascript:alert(1)', 'https://name:pass@control.e-rd.ru/?launch=note', '/']) assert.equal(ctx.mobileLaunchAction(url, origin), '', url);
  assert.equal(ctx.mobileLaunchURL('delete'), '');
});

test('manifest keeps its identity and ordinary startup while offering three allowlisted launch shortcuts', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.webmanifest'), 'utf8')), ctx = context();
  assert.equal(manifest.start_url, '/'); assert.equal(manifest.id, '/'); assert.equal(manifest.scope, '/');
  assert.deepEqual(manifest.shortcuts.map(item => ctx.mobileLaunchAction(item.url, origin)), ['note', 'plan', 'today']);
  for (const item of manifest.shortcuts) assert.ok(item.name && item.icons.some(icon => icon.type === 'image/png'));
});

test('mobile access has one personal settings entry and uses the existing reminder settings action', async () => {
  const hubSource = fs.readFileSync(path.join(__dirname, 'settings-hub.js'), 'utf8').replaceAll('export ', ''), calls = [];
  const state = { me: { id: 7 }, activeWorkspaceId: 'team', view: 'work', workspacePages: [], collections: [] };
  const ctx = context({ state, activeWorkspace: () => ({}), canConfigureWorkspace: () => false, mobileAccessUI: { open: () => calls.push('mobile') }, reminderSettingsUI: { open: () => calls.push('reminders') } });
  vm.runInContext(hubSource, ctx);
  const groups = ctx.settingsHubSections({ personal: false, canConfigure: false }), entries = groups.flatMap(group => group.rows.filter(item => item.key === 'mobile-access').map(item => ({ ...item, section: group.id })));
  assert.equal(entries.length, 1); assert.equal(entries[0].section, 'personal'); assert.equal(entries[0].disabledReason, '');
  vm.runInContext(fragment('async function runSettingsAction(', 'function openAppearanceSettings('), ctx);
  await ctx.runSettingsAction('mobile-access', { context: { userId: 7, workspaceId: 'team', view: 'work' } }); await ctx.runSettingsAction('reminders', { context: { userId: 7, workspaceId: 'team', view: 'work' } });
  assert.deepEqual(calls, ['mobile', 'reminders']);
});

function uiHarness(search = '?launch=note') {
  const listeners = {}, swListeners = {}, media = { matches: false, addEventListener() {} }, calls = [], messages = [], replaced = [];
  let current = { userId: null, workspaceId: 'team', view: 'work', ready: false }, dialog;
  const node = attrs => ({ ...attrs, focus() { this.focused = true; }, select() { this.selected = true; } });
  const doc = { body: { append(item) { dialog = item; } }, createElement() {
    let html = '', nodes = {}, groups = {};
    return { open: false, setAttribute() {}, get innerHTML() { return html; }, set innerHTML(value) {
      html = value; nodes = {}; groups = {};
      for (const match of value.matchAll(/\b(data-mobile-[a-z-]+)(?:="([^"]*)")?/g)) {
        const [, attr, data = ''] = match, key = `[${attr}]`, camel = attr.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        const item = node({ dataset: { [camel]: data }, hidden: false, disabled: false, value: '', textContent: '' });
        (groups[key] ||= []).push(item); nodes[key] ||= item;
      }
    }, querySelector(selector) { return nodes[selector] || null; }, querySelectorAll(selector) { return groups[selector] || []; } };
  } };
  const win = { location: { href: origin + '/' + search, origin }, history: { state: { keep: true }, replaceState(state, title, url) { replaced.push({ state, url }); win.location.href = origin + url; } }, matchMedia: () => media, Notification: { permission: 'default' }, addEventListener(type, fn) { listeners[type] = fn; } };
  const nav = { onLine: true, userAgent: 'Android', serviceWorker: { addEventListener(type, fn) { swListeners[type] = fn; } } };
  const ctx = context(), ui = ctx.createMobileAccessUI({ getContext: () => current, runLaunch: async action => { calls.push(action); return true; }, openReminders: async () => calls.push('reminders'), escapeHTML: esc, icon: () => '<svg></svg>', openModal: item => item.open = true, requestDialogClose: async item => { item.open = false; return true; }, toast: (...args) => messages.push(args), win, nav, doc });
  return { ctx, ui, win, nav, listeners, swListeners, media, calls, messages, replaced, get dialog() { return dialog; }, get current() { return current; }, set current(value) { current = value; } };
}

test('a cold launch waits for authentication and data, consumes once, and keeps existing browser history state', async () => {
  const h = uiHarness(); await h.ui.consumeLaunch(); assert.equal(h.calls.length, 0); assert.equal(h.replaced.length, 0);
  h.ui.resetPrivate(); h.current = { ...h.current, userId: 7 }; await h.ui.consumeLaunch(); assert.equal(h.calls.length, 0);
  h.current.ready = true; await h.ui.consumeLaunch(); await h.ui.consumeLaunch(); assert.deepEqual(h.calls, ['note']); assert.equal(h.replaced[0].url, '/'); assert.equal(h.replaced[0].state.keep, true);
});

test('an authenticated account reset cancels its pending launch and does not carry it into another account', async () => {
  const h = uiHarness(); h.current = { ...h.current, userId: 7 }; h.ui.resetPrivate(); h.current = { ...h.current, userId: 8, ready: true }; await h.ui.consumeLaunch(); assert.deepEqual(h.calls, []); assert.equal(h.replaced.at(-1).url, '/');
  const mixed = uiHarness('?launch=note&invite=invite-token'); mixed.current = { ...mixed.current, userId: 7, ready: true }; await mixed.ui.consumeLaunch(); assert.equal(mixed.calls.length, 0); assert.equal(mixed.replaced.length, 0, 'unrelated invitation parameters are not removed');
});

test('only the app service worker message can request notifications and it waits for authentication', async () => {
  const h = uiHarness('');
  for (const event of [{ data: { type: 'tessavie-open-notifications' } }, { data: { type: 'tessavie-open-notifications' }, source: { scriptURL: 'https://evil.test/sw.js' } }, { data: { type: 'open-record', url: '/admin' }, source: { scriptURL: origin + '/sw.js' } }]) h.swListeners.message(event);
  h.swListeners.message({ data: { type: 'tessavie-open-notifications' }, source: { scriptURL: origin + '/sw.js?v=1' } }); await tick(); assert.equal(h.calls.length, 0);
  h.current = { ...h.current, userId: 7, ready: true }; await h.ui.consumeLaunch(); assert.deepEqual(h.calls, ['notifications']);
});

test('installation is offered only from a real browser event and requested once by a user button', async () => {
  const h = uiHarness(''); h.current = { ...h.current, userId: 7, ready: true }; h.ui.open(); assert.equal(h.dialog.querySelector('[data-mobile-install]'), null);
  let prompted = 0, prevented = 0; h.listeners.beforeinstallprompt({ preventDefault() { prevented++; }, prompt() { prompted++; }, userChoice: Promise.resolve({ outcome: 'dismissed' }) });
  assert.equal(prevented, 1); assert.equal(prompted, 0); const button = h.dialog.querySelector('[data-mobile-install]'); await button.onclick(); await button.onclick(); assert.equal(prompted, 1); assert.match(h.dialog.querySelector('[data-mobile-access-message]').textContent, /Установка отменена/); assert.equal(h.dialog.querySelector('[data-mobile-install]'), null);
  assert.equal(h.win.Notification.permission, 'default');
});

test('install completion after closing or changing account cannot repaint a different settings session', async () => {
  const h = uiHarness(''); h.current = { ...h.current, userId: 7, ready: true }; h.ui.open(); let finish;
  h.listeners.beforeinstallprompt({ preventDefault() {}, prompt() {}, userChoice: new Promise(resolve => finish = resolve) });
  const oldHTML = h.dialog.innerHTML, installing = h.dialog.querySelector('[data-mobile-install]').onclick(); await tick(); h.current = { ...h.current, userId: 8 }; finish({ outcome: 'accepted' }); await installing; assert.equal(h.dialog.innerHTML, oldHTML);
});

test('mobile help distinguishes unknown install state, browser permission, and shortcuts from live widgets', () => {
  const ctx = context(), device = { standalone: false, ios: true, online: true, permission: 'granted' }, html = ctx.mobileAccessMarkup(device, {}, esc, () => '');
  assert.match(html, /Открыто в браузере/); assert.match(html, /нельзя определить/); assert.match(html, /живые системные виджеты ещё не реализованы/); assert.match(html, /Браузер разрешает уведомления/); assert.doesNotMatch(html, /Уведомления подключены/); assert.equal((html.match(/data-mobile-launch=/g) || []).length, 4); assert.match(html, /<details open><summary>iPhone/);
  const standalone = ctx.mobileAccessMarkup({ ...device, standalone: true }, { promptAvailable: true }, esc, () => ''); assert.match(standalone, /Открыто как приложение/); assert.doesNotMatch(standalone, /data-mobile-install/);
});

test('copy failure offers a selectable URL and quick launch preserves modified-link browser behavior', async () => {
  const h = uiHarness(''); h.current = { ...h.current, userId: 7, ready: true }; h.ui.open();
  await h.dialog.querySelectorAll('[data-mobile-copy]')[0].onclick(); const field = h.dialog.querySelector('[data-mobile-copy-value]'); assert.equal(field.value, origin + '/?launch=note'); assert.equal(field.selected, true);
  let prevented = 0; const link = h.dialog.querySelectorAll('[data-mobile-launch]')[0]; link.onclick({ ctrlKey: true, preventDefault() { prevented++; } }); await tick(); assert.equal(h.calls.length, 0); assert.equal(prevented, 0);
  link.onclick({ preventDefault() { prevented++; } }); await tick(); assert.deepEqual(h.calls, ['note']); assert.equal(prevented, 1);
});

function launchHarness() {
  const state = { me: { id: 7 }, activeWorkspaceId: 'team', view: 'work', projectDataReady: true, projectContextEpoch: 1, viewRestoreRequest: 1 }, calls = [];
  const ctx = context({ state, leaveSettingsFor: async (action, options) => { calls.push(['leave', options.closeAll]); return action(); }, navigateToView: async (view, options) => { calls.push(['navigate', view, options.personalTab]); state.view = view; state.personalTab = options.personalTab; state.viewRestoreRequest++; if (view === 'personal') state.activeWorkspaceId = 'private'; return true; }, loadPersonal: async () => calls.push(['load']), openPersonalEditor: kind => calls.push(['editor', kind]) });
  vm.runInContext(fragment('async function runMobileLaunch(', 'async function runSettingsAction('), ctx); return { ctx, state, calls };
}

test('actual launch handler uses the ordinary private editor and notifications preserve workspace', async () => {
  const note = launchHarness(); assert.equal(await note.ctx.runMobileLaunch('note'), true); assert.deepEqual(note.calls, [['leave', true], ['navigate', 'personal', 'notes'], ['load'], ['editor', 'note']]);
  const inbox = launchHarness(); assert.equal(await inbox.ctx.runMobileLaunch('notifications'), true); assert.equal(inbox.state.activeWorkspaceId, 'team'); assert.deepEqual(inbox.calls, [['leave', true], ['navigate', 'notifications', 'today']]);
  const unknown = launchHarness(); await unknown.ctx.runMobileLaunch('delete'); assert.equal(unknown.calls.length, 0);
});

test('launch does not replace an editor when saving its draft fails or a later reply belongs to another context', async () => {
  const refused = launchHarness(); refused.ctx.leaveSettingsFor = async () => false; assert.equal(await refused.ctx.runMobileLaunch('note'), false); assert.equal(refused.calls.length, 0);
  for (const condition of ['owner', 'workspace', 'view', 'request', 'error']) {
    const h = launchHarness(); h.ctx.loadPersonal = async () => { if (condition === 'owner') h.state.me = { id: 9 }; if (condition === 'workspace') h.state.activeWorkspaceId = 'other'; if (condition === 'view') h.state.view = 'work'; if (condition === 'request') h.state.viewRestoreRequest++; if (condition === 'error') h.state.personalError = 'Unavailable'; };
    assert.equal(await h.ctx.runMobileLaunch('note'), false); assert.equal(h.calls.some(item => item[0] === 'editor'), false);
  }
  const changed = launchHarness(); changed.ctx.leaveSettingsFor = async action => { changed.state.projectContextEpoch++; return action(); }; assert.equal(await changed.ctx.runMobileLaunch('note'), false); assert.equal(changed.calls.length, 0);
});

test('shared overlay closer preserves a refused draft and waits for overlay history before launch', async () => {
  const state = {}, dialog = { id: 'personal-dialog', open: true, dataset: { historyState: 'true' } }, history = { state: { businessControlOverlay: 'personal-dialog' } }, calls = [];
  const ctx = context({ state, history, $: () => null, topOpenDialog: () => dialog.open ? dialog : null, requestDialogClose: async () => false }); vm.runInContext(fragment('async function leaveSettingsFor(', 'async function runMobileLaunch('), ctx);
  assert.equal(await ctx.leaveSettingsFor(() => calls.push('launch'), { closeAll: true }), false); assert.equal(calls.length, 0);
  ctx.requestDialogClose = async () => { calls.push('flush draft'); dialog.open = false; state.suppressOverlayPop = true; return true; };
  const closing = ctx.leaveSettingsFor(() => calls.push('launch'), { closeAll: true }); await tick(); assert.deepEqual(calls, ['flush draft']); state.suppressOverlayPop = false; const resume = state.afterOverlayClose; state.afterOverlayClose = null; await resume(); await closing; assert.deepEqual(calls, ['flush draft', 'launch']);
});
