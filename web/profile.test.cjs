const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');

test('avatar is a keyboard-operable circle, file chooser accepts supported images', () => {
  const context = vm.createContext({ icon: name => `<svg data-icon="${name}"></svg>`, avatarMarkup: () => '<span class="avatar"></span>' });
  vm.runInContext(source.slice(source.indexOf('function renderProfilePhotoEditor('), source.indexOf('function uploadProfileAvatar(')), context);
  const html = vm.runInContext('renderProfilePhotoEditor({})', context);
  assert.match(html, /<button type="button" class="profile-avatar-picker"/);
  assert.match(html, /aria-label="Изменить фото профиля"/);
  assert.match(html, /data-icon="camera"/);
  assert.match(html, /accept="image\/jpeg,image\/png"/);
  assert.doesNotMatch(html, /Выбрать фото/);
});

test('photo upload completes or times out without reopening profile', async () => {
  let xhr;
  class XHR {
    constructor() { xhr = this; this.events = {}; this.upload = {addEventListener(){}}; }
    open() {} send() {} addEventListener(name, fn) {this.events[name] = fn;}
  }
  const context = vm.createContext({ XMLHttpRequest: XHR, FormData: class {append() {}} });
  vm.runInContext(source.slice(source.indexOf('function uploadProfileAvatar('), source.indexOf('async function openProfile(')), context);
  const success = vm.runInContext('uploadProfileAvatar({})', context);
  assert.equal(xhr.timeout, 60000);
  xhr.status = 200; xhr.response = {avatarUrl:'/photo'}; xhr.events.load();
  assert.equal((await success).avatarUrl, '/photo');
  const failure = vm.runInContext('uploadProfileAvatar({})', context);
  xhr.events.timeout();
  await assert.rejects(failure, /слишком много времени/);
});

test('profile save handlers preserve form references across awaits and photo preserves fields', () => {
  const profile = source.slice(source.indexOf('async function openProfile('), source.indexOf('function userInitials('));
  assert.doesNotMatch(profile, /await openProfile\(/);
  assert.doesNotMatch(profile, /event.currentTarget.reset\(/);
  assert.match(profile, /dialog.dataset.profileRequest !== requestId/);
  assert.match(profile, /form.addEventListener\('input', checkDirty\)/);
  assert.match(profile, /syncAvatar\(updated\)/);
});
