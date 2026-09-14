const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
const outboxSource = fs.readFileSync(__dirname + '/outbox-ui.js', 'utf8');
const bootstrap = source.slice(source.indexOf('async function bootstrap()'), source.indexOf('function clearProjectClientState('));
const sessionStart = bootstrap.indexOf('\n  try {');
assert.ok(sessionStart >= 0, 'bootstrap session boundary must exist');
const sessionSource = 'async function runStartup() {\n' + bootstrap.slice(sessionStart + 1);
const response = (value, status = 200) => ({status, ok:status < 400, headers:new Headers(), json:async () => value});

function client({online, fetch}) {
  const events = {requests:0, offline:0, auth:0, app:0, loaded:0, projectErrors:0};
  const context = vm.createContext({
    fetch:async (...args) => { events.requests++; return fetch(...args); },
    navigator:{onLine:online}, AbortController, Headers, FormData, TypeError, setTimeout, clearTimeout,
    state:{me:null, activeWorkspaceId:''},
    offlineOutbox:{offline:async () => { events.offline++; context.state.me = {id:1}; context.state.offlineMode = true; return true; }},
    showAuth() { events.auth++; context.state.me = null; },
    showApp() { events.app++; context.state.offlineMode = false; },
    loadData:async () => { events.loaded++; },
    maybeShowOnboarding() {}, maybeOpenPendingInvitation:() => true, maybeOpenPendingInterfacePreset() {},
    renderProjectLoadError() { events.projectErrors++; },
  });
  vm.runInContext(source.slice(source.indexOf('const pendingAPIReads ='), source.indexOf('function toast(')), context);
  vm.runInContext(sessionSource, context);
  return {context, events};
}

test('a reachable server opens the app despite the browser reporting offline', async () => {
  const c = client({online:false, fetch:async path => {
    assert.equal(path, '/api/me');
    return response({id:1, username:'owner'});
  }});
  await c.context.runStartup();
  assert.equal(c.events.requests, 1);
  assert.equal(c.events.offline, 0);
  assert.equal(c.events.app, 1);
  assert.equal(c.events.loaded, 1);
});

test('an actual connection failure keeps the local account available for either network hint', async () => {
  for (const online of [false, true]) {
    const c = client({online, fetch:async () => { throw new TypeError('Failed to fetch'); }});
    await c.context.runStartup();
    assert.equal(c.events.requests, 2, 'the existing read retry must reach the server');
    assert.equal(c.events.offline, 1);
    assert.equal(c.context.state.offlineMode, true);
    assert.equal(c.events.app, 0);
    assert.equal(c.events.auth, 0);
  }
});

test('401 and 403 require authentication instead of claiming a connection failure', async () => {
  for (const online of [false, true]) {
    for (const status of [401, 403]) {
      const c = client({online, fetch:async () => response({error:'Access denied'}, status)});
      await c.context.runStartup();
      assert.equal(c.events.requests, 1);
      assert.equal(c.events.offline, 0);
      assert.ok(c.events.auth > 0);
      assert.equal(c.events.app, 0);
    }
  }
});

test('the existing reconnect button retries the server after a failed launch with a stale offline hint', async () => {
  let reachable = false;
  const fetch = async () => { if (!reachable) throw new TypeError('Failed to fetch'); return response({id:1}); };
  const first = client({online:false, fetch});
  await first.context.runStartup();
  assert.equal(first.events.offline, 1);
  assert.equal(first.events.requests, 2);

  const button = {};
  let restarted, reloads = 0;
  const reconnect = outboxSource.split('\n').find(line => line.includes("local.querySelector('[data-reconnect]').onclick"));
  assert.ok(reconnect, 'the existing manual reconnect handler must exist');
  vm.runInNewContext(reconnect, {
    local:{querySelector:selector => { assert.equal(selector, '[data-reconnect]'); return button; }},
    location:{reload:() => { reloads++; restarted = client({online:false, fetch}); return restarted.context.runStartup(); }},
  });
  assert.equal(reloads, 0, 'entering the local screen must not automatically reload over drafts');
  reachable = true;
  await button.onclick();
  assert.equal(reloads, 1);
  assert.equal(restarted.events.requests, 1);
  assert.equal(restarted.events.offline, 0);
  assert.equal(restarted.events.app, 1);
});

test('the HTML entry and offline shell request the same recovery release', () => {
  const index = fs.readFileSync(__dirname + '/index.html', 'utf8');
  const worker = fs.readFileSync(__dirname + '/sw.js', 'utf8');
  const entry = index.match(/src="(\/app\.js\?v=[^"]+)"/)?.[1];
  assert.ok(entry, 'the main module must have an explicit cache version');
  assert.ok(worker.includes("'" + entry + "'"));
  assert.ok(worker.includes("const CACHE = 'tessavie-shell-" + entry.split('?v=')[1] + "';"));
});
