const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

function harness(response, invitation = '') {
  const calls = [];
  const state = {authMode: 'register', pendingInviteToken: invitation, registrationChallenge: null};
  const context = vm.createContext({
    state, URL, JSON, location: {href: 'https://example.test/?invite=invitation'},
    history: {state: null, replaceState: (...args) => calls.push(['history', ...args])},
    FormData: class { get(key) { return {email: 'qa@example.test', login: 'qa_user', password: 'qa-password'}[key]; } },
    api: async (path) => { calls.push(['api',path]); return response; },
    showRegistrationVerification: value => calls.push(['challenge',value]),
    clearPrivateClientState() {}, showApp: () => calls.push(['app']),
    loadData: async () => calls.push(['load']), maybeShowOnboarding() {},
    maybeOpenPendingInvitation: () => { calls.push(['invite',state.pendingInviteToken]); return false; },
    maybeOpenPendingInterfacePreset() {}, $: () => ({textContent:''}),
  });
  vm.runInContext(source.slice(source.indexOf('async function submitAuth('),source.indexOf('\nfunction render()')),context);
  return {state,calls,submit: () => context.submitAuth({preventDefault() {},currentTarget:{}})};
}

test('direct registration opens the application without a verification step', async () => {
  const h=harness({id:12,username:'qa_user'});
  await h.submit();
  assert.equal(h.state.me.id,12);
  assert.equal(h.calls.filter(c=>c[0]==='challenge').length,0);
  assert.equal(h.calls.filter(c=>c[0]==='app').length,1);
});
test('registration by invitation does not consume the invitation a second time', async () => {
  const h=harness({id:12,username:'qa_user'},'invitation');
  await h.submit();
  assert.equal(h.state.pendingInviteToken,'');
  assert.deepEqual(h.calls.filter(c=>c[0]==='api'),[['api','/api/auth/register']]);
});
test('normal verification remains supported when the server requests a code', async () => {
  const h=harness({challengeId:'challenge',testingCode:'123456'});
  await h.submit();
  assert.equal(h.calls.filter(c=>c[0]==='challenge').length,1);
  assert.equal(h.calls.filter(c=>c[0]==='app').length,0);
});
