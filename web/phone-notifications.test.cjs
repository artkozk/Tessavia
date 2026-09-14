const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, 'phone-notifications.js'), 'utf8').replaceAll('export function', 'function');
const ctx = { atob, Uint8Array, URL, DOMException }; vm.createContext(ctx); vm.runInContext(source, ctx);
const key = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 9)]).toString('base64url');
function fixture(options = {}) {
  let live = true, saved = options.id || '', perm = options.permission || 'default', unsubscribed = 0, requestCalls = 0, readyCalls = 0;
  const requests = [], devices = options.devices || [], subscription = { toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/test', expirationTime: null, keys: { p256dh: 'public', auth: 'auth' } }), unsubscribe: async () => { unsubscribed++; return true; } };
  let existing = options.existing ? subscription : null;
  const registration = { pushManager: { getSubscription: async () => existing, subscribe: async () => { existing = subscription; if (options.afterSubscribe) options.afterSubscribe(() => { live = false; }); return subscription; } } };
  const controller = ctx.createPhonePushController({
    read: async (url, request) => {
      requests.push({ url, request });
      if (options.fail && request?.method === 'POST') throw Object.assign(new Error('Conflict'), { status: options.fail, code: options.failCode });
      if (options.beforeRead) options.beforeRead(url, request);
      if (url === '/api/me/push') return { configured: true, publicKey: options.nextKey?.() || key, devices };
      if (url.endsWith('/subscriptions')) { devices.push({ id: 'new-id', current: true, enabled: true }); return { subscriptionId: 'new-id' }; }
      if (url.endsWith('/test')) return { deliveryId: 'test', status: 'queued' };
      if (request?.method === 'DELETE') { const index = devices.findIndex(d => url.split('/').at(-1) === d.id); if (index >= 0) devices.splice(index, 1); }
    },
    ready: async () => { readyCalls++; return registration; },
    requestPermission: () => { requestCalls++; return options.permissionPromise || (perm = 'granted'); }, permission: () => perm,
    alive: () => live, remember: value => { saved = value; }, recalled: () => saved,
  });
  return { controller, requests, devices, subscription, stop: () => { live = false; }, get saved() { return saved; }, get unsubscribed() { return unsubscribed; }, get requestCalls() { return requestCalls; }, get readyCalls() { return readyCalls; } };
}
test('iPhone requires home screen; feature detection does not claim support from UA', () => {
  const win = { isSecureContext: true, Notification: {}, PushManager: {} };
  assert.equal(ctx.phonePushSupport(win, { userAgent: 'iPhone', serviceWorker: {} }), 'install');
  assert.equal(ctx.phonePushSupport(win, { userAgent: 'iPhone', standalone: true, serviceWorker: {} }), 'supported');
  assert.equal(ctx.phonePushSupport({ ...win, isSecureContext: false }, { serviceWorker: {} }), 'unsupported');
});
test('opening settings reads only; enable requests permission synchronously and sends exact DTO', async () => {
  const f = fixture(); await f.controller.load(); assert.equal(f.requestCalls, 0);
  const before = f.readyCalls, pending = f.controller.enable('Телефон');
  assert.equal(f.requestCalls, 1); assert.equal(f.readyCalls, before);
  await pending;
  const post = f.requests.find(r => r.url.endsWith('/subscriptions'));
  assert.deepEqual(JSON.parse(post.request.body), { endpoint: 'https://fcm.googleapis.com/test', keys: { p256dh: 'public', auth: 'auth' }, name: 'Телефон', expectedPublicKey: key });
  assert.equal(f.saved, 'new-id'); assert.equal(f.controller.snapshot().active, true);
});
test('logout during permission prevents subscription and server registration', async () => {
  let resolve; const f = fixture({ permissionPromise: new Promise(r => { resolve = r; }) });
  await f.controller.load(); const pending = f.controller.enable('Телефон'); f.stop(); resolve('granted'); await pending;
  assert.equal(f.requests.filter(r => r.request).length, 0); assert.equal(f.saved, '');
});
test('logout after browser subscription cleans the unregistered subscription', async () => {
  const f = fixture({ afterSubscribe: stop => stop() }); await f.controller.load(); await f.controller.enable('Телефон');
  assert.equal(f.unsubscribed, 1); assert.equal(f.requests.filter(r => r.request).length, 0);
});
test('failed registration cleans only a newly created subscription', async () => {
  const f = fixture({ fail: 503 }); await f.controller.load(); await assert.rejects(f.controller.enable('Телефон'));
  assert.equal(f.unsubscribed, 1); assert.equal(f.saved, ''); assert.equal(f.controller.snapshot().active, false);
});
test('another account conflict requires explicit reconnect; never silently unsubscribes', async () => {
  const f = fixture({ existing: true, fail: 409 }); await f.controller.load(); await assert.rejects(f.controller.enable('Телефон'));
  assert.equal(f.unsubscribed, 0); assert.equal(f.controller.snapshot().reconnect, true);
  await assert.rejects(f.controller.enable('Телефон', true)); assert.equal(f.unsubscribed, 2);
});
test('disabling a remote device cannot unsubscribe this browser', async () => {
  const f = fixture({ id: 'here', existing: true, permission: 'granted', devices: [{ id: 'here', current: true, enabled: true }, { id: 'there', current: false, enabled: true }] });
  await f.controller.load(); await f.controller.disable('there'); assert.equal(f.unsubscribed, 0); assert.equal(f.saved, 'here');
  await f.controller.disable('here'); assert.equal(f.unsubscribed, 1); assert.equal(f.saved, '');
});
test('test delivery requires confirmed local subscription; accepted is not displayed', async () => {
  const f = fixture({ id: 'here', devices: [{ id: 'here', current: true, enabled: true }] });
  await f.controller.load(); assert.equal(await f.controller.test(), null);
  assert.equal(ctx.pushStatusLabel('accepted'), 'Сервис доставки принял уведомление');
});
test('stale account response cannot turn reconnect into unsubscribing another account', async () => {
  const f = fixture({ existing: true, fail: 409, failCode: 'outbox_owner_changed' });
  await f.controller.load(); await assert.rejects(f.controller.enable('Телефон'));
  assert.equal(f.controller.snapshot().reconnect, false); assert.equal(f.controller.snapshot().ownerChanged, true);
  await assert.rejects(f.controller.enable('Телефон', true)); assert.equal(f.unsubscribed, 0);
});
test('fresh owner check precedes any explicit replacement of the browser subscription', async () => {
  let changed = false;
  const f = fixture({ existing: true, beforeRead: () => { if (changed) throw Object.assign(new Error('Account changed'), { status: 409, code: 'outbox_owner_changed' }); } });
  await f.controller.load(); changed = true; await assert.rejects(f.controller.enable('Телефон', true)); assert.equal(f.unsubscribed, 0);
});
test('rotated VAPID key asks for explicit replacement instead of registering an unusable old endpoint', async () => {
  const f = fixture({ existing: true }); f.subscription.options = { applicationServerKey: new Uint8Array(65).buffer };
  await f.controller.load(); await assert.rejects(f.controller.enable('Телефон'), /Ключ доставки/);
  assert.equal(f.controller.snapshot().reconnect, true); assert.equal(f.unsubscribed, 0);
  await f.controller.enable('Телефон', true); assert.equal(f.unsubscribed, 1);
});
test('retrying a lost successful device removal accepts 404 and clears the local subscription', async () => {
  const f = fixture({ id: 'here', existing: true, permission: 'granted', devices: [{ id: 'here', current: true, enabled: true }], beforeRead: (url, request) => { if (request?.method === 'DELETE') throw Object.assign(new Error('Already gone'), { status: 404 }); } });
  await f.controller.load(); await f.controller.disable('here'); assert.equal(f.unsubscribed, 1); assert.equal(f.saved, '');
});
test('VAPID change while settings are open uses the fresh preflight key', async () => {
  let next = key;
  const f = fixture({ existing: true, nextKey: () => next });
  f.subscription.options = { applicationServerKey: Uint8Array.from(Buffer.from(key, 'base64url')).buffer };
  await f.controller.load(); next = Buffer.concat([Buffer.from([4]), Buffer.alloc(64, 8)]).toString('base64url');
  await assert.rejects(f.controller.enable('Телефон'), /Ключ доставки/);
  assert.equal(f.controller.snapshot().reconnect, true); assert.equal(f.unsubscribed, 0);
  assert.equal(f.requests.filter(r => r.request?.method === 'POST').length, 0);
});
function worker() {
  const listeners = {}, shown = [], opened = [];
  const self = { location: { origin: 'https://test.invalid' }, addEventListener: (type, fn) => { listeners[type] = fn; }, registration: { showNotification: async (...args) => shown.push(args) }, clients: { matchAll: async () => [], openWindow: async url => opened.push(url) } };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, 'sw.js'), 'utf8'), { self, URL, Set });
  return { self, listeners, shown, opened };
}
test('push ignores private body, foreign URL and arbitrary tag; malformed payload stays neutral', async () => {
  const f = worker(); let pending;
  f.listeners.push({ data: { json: () => ({ version: 1, type: 'notification', body: 'PRIVATE', url: 'https://evil.invalid', tag: 'PRIVATE' }) }, waitUntil: p => { pending = p; } }); await pending;
  assert.equal(f.shown[0][1].body, 'Есть новое уведомление'); assert.equal(f.shown[0][1].tag, 'tessavie-notification');
  assert.equal(JSON.stringify(f.shown).includes('PRIVATE'), false);
  f.listeners.push({ data: { json: () => { throw Error('bad'); } }, waitUntil: p => { pending = p; } }); await pending; assert.equal(f.shown.length, 2);
});
test('notification click focuses a same-origin app without navigating away from a draft', async () => {
  const f = worker(); let pending, focused = 0, posted;
  f.self.clients.matchAll = async () => [{ url: 'https://evil.invalid/', focused: true }, { url: 'https://test.invalid/', focus: async () => { focused++; }, postMessage: msg => { posted = msg; }, navigate: () => assert.fail('must preserve draft') }];
  f.listeners.notificationclick({ notification: { close() {}, data: { url: 'https://evil.invalid' } }, waitUntil: p => { pending = p; } }); await pending;
  assert.equal(focused, 1); assert.equal(posted.type, 'tessavie-open-notifications'); assert.deepEqual(f.opened, []);
});
test('cold notification click opens only the fixed inbox launch URL', async () => {
  const f = worker(); let pending;
  f.listeners.notificationclick({ notification: { close() {} }, waitUntil: p => { pending = p; } }); await pending;
  assert.deepEqual(f.opened, ['/?launch=notifications']);
});
