const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'settings-hub.js'), 'utf8').replaceAll('export ', ''), context);
const sections = input => context.settingsHubSections(input);
const rows = (input, section) => sections(input).find(item => item.id === section).rows;
const admin = { canConfigure: true, workspaceId: 'a', workspaceName: 'Team A', view: 'page:one', pageName: 'My Page', pageApp: true, teamId: 'team', collections: [{ id: 'board', name: 'Board' }] };

test('a pending interface update remains reachable in the unified settings for every account', () => {
  assert.equal(rows({}, 'interface').some(item => item.key === 'shell-update'), false);
  const item = rows({ personal: true, shellUpdatePending: true }, 'interface').find(item => item.key === 'shell-update');
  assert.equal(item.title, 'Обновить интерфейс'); assert.equal(item.disabledReason, '');
});

test('ordinary members can browse sets and customize appearance, but cannot edit a shared page', () => {
  const member = { ...admin, canConfigure: false };
  assert.ok(rows(member, 'page').find(item => item.key === 'page-edit').disabledReason);
  assert.equal(rows(member, 'page').some(item => item.key === 'page-share'), false);
  assert.equal(rows(member, 'interface').find(item => item.key === 'page-library').disabledReason, '');
  assert.match(rows(member, 'interface').find(item => item.key === 'page-library').description, /Установка доступна администратору/);
  assert.equal(rows(member, 'interface').find(item => item.key === 'appearance').disabledReason, '');
  assert.equal(rows({ ...member, pageApp: false }, 'page').find(item => item.key === 'page-edit').disabledReason, '');
  assert.equal(rows(member, 'workspace').find(item => item.key === 'team').disabledReason, '');
});

test('page settings belong only to the current page/board and expose editing to administrators', () => {
  const board = { ...admin, pageApp: false, collectionId: 'board' };
  assert.equal(rows(admin, 'page').some(item => item.key === 'board-settings'), false);
  assert.equal(rows(board, 'page').some(item => item.key === 'board-settings'), true);
  assert.equal(rows({ ...board, canConfigure: false }, 'page').some(item => item.key === 'board-settings'), false);
  assert.equal(rows(board, 'page').some(item => item.key === 'page-share'), false);
  assert.equal(rows(admin, 'page').find(item => item.key === 'page-share').disabledReason, '');
  assert.match(sections(admin).find(item => item.id === 'page').description, /Team A.*общая структура/);
  assert.equal(rows({ ...board, layoutEditing: true }, 'page').find(item => item.key === 'page-edit').title, 'Продолжить редактирование');
});

test('personal space does not offer nonexistent team or boards and describes device isolation', () => {
  const personal = { personal: true, canConfigure: true, pageName: 'Календарь', deviceLabel: 'Телефон' };
  assert.equal(rows(personal, 'workspace').some(item => item.key === 'team' || item.key === 'boards'), false);
  assert.match(sections(personal).find(item => item.id === 'page').description, /Личное пространство.*Телефон/);
  assert.match(sections(personal).find(item => item.id === 'interface').description, /только для вас/);
  assert.doesNotMatch(sections({ ...personal, pageApp: true }).find(item => item.id === 'page').description, /общая/);
  assert.doesNotMatch(rows({ ...personal, pageApp: true }, 'page')[0].description, /общей/);
});

test('personal page management is visible once beside the current-page constructor', () => {
  const personal = { personal: true, canConfigure: true, pageApp: true };
  const entry = rows(personal, 'page').find(item => item.key === 'pages');
  assert.equal(entry.title, 'Мои страницы'); assert.equal(entry.disabledReason, '');
  assert.equal(sections(personal).flatMap(section => section.rows).filter(item => item.key === 'pages').length, 1);
  assert.equal(rows(personal, 'workspace').some(item => item.key === 'pages'), false);
  assert.equal(rows(admin, 'page').some(item => item.key === 'pages'), false);
  assert.equal(rows(admin, 'workspace').find(item => item.key === 'pages').title, 'Свои страницы');
});

test('record pages retain source settings and shared card templates remain reachable', () => {
  const recordPage = { ...admin, pageApp: false, pageId: 'records' };
  assert.equal(rows(recordPage, 'page').find(item => item.key === 'source-settings').disabledReason, '');
  assert.ok(rows({ ...recordPage, canConfigure: false }, 'page').find(item => item.key === 'source-settings').disabledReason);
  assert.equal(rows({ ...recordPage, pageApp: true }, 'page').some(item => item.key === 'source-settings'), false);
  assert.equal(rows({ ...recordPage, pageId: '' }, 'page').some(item => item.key === 'source-settings'), false);
  assert.equal(rows({ ...admin, canConfigure: false }, 'workspace').find(item => item.key === 'card-templates').disabledReason, '');
});

test('user names are escaped; tab panel labels and a disabled explanation survive rendering', () => {
  const escape = value => String(value).replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
  const html = context.settingsHubMarkup(sections({ ...admin, canConfigure: false, pageName: '<img onerror="bad">' }), 'page', escape, () => '');
  assert.ok(html.includes('&lt;img onerror=&quot;bad&quot;&gt;'));
  assert.ok(!html.includes('<img'));
  assert.match(html, /role="tabpanel" aria-labelledby="settings-tab-page"/);
  assert.match(html, /data-settings-action="page-edit" disabled/);
  assert.match(html, /Общие настройки меняет администратор/);
  assert.equal((html.match(/aria-selected="true"/g) || []).length, 1);
  assert.equal((html.match(/aria-label="Закрыть настройки"/g) || []).length, 1);
});
