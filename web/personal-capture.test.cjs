const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/app.js', 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function personalInboxNotes('), source.indexOf('function renderPersonalInbox(')), context);

test('personal inbox contains only explicitly captured notes without changing their order elsewhere', () => {
  const notes = [{id:'old',inInbox:true,createdAt:'2026-09-01'}, {id:'normal',inInbox:false,createdAt:'2026-09-03'}, {id:'new',inInbox:true,createdAt:'2026-09-02'}];
  assert.deepEqual(Array.from(context.personalInboxNotes(notes), n => n.id), ['new','old']);
  assert.deepEqual(notes.map(n => n.id), ['old','normal','new']);
});

test('late capture responses only clear the submitted draft, not a newer note', () => {
  assert.equal(context.captureDraftMatches(null, 'key', 'Text'), true);
  assert.equal(context.captureDraftMatches({values:{requestKey:'key',body:' Text '}}, 'key', 'Text'), true);
  assert.equal(context.captureDraftMatches({values:{requestKey:'new',body:'Text'}}, 'key', 'Text'), false);
  assert.equal(context.captureDraftMatches({values:{requestKey:'key',body:'New text'}}, 'key', 'Text'), false);
});

test('quick capture keeps private ownership, request identity and a single text input', () => {
  const capture = fs.readFileSync(__dirname + '/personal-inbox.js', 'utf8').split('async function bindList')[0];
  assert.match(capture, /await outbox\(\)\.addCapture\(body,key,owner\)/);
  assert.match(capture, /bindDraft\(form,scope\)/);
  assert.match(capture, /name="requestKey"/);
  assert.match(capture, /name="body"/);
  assert.doesNotMatch(capture, /name="(?:title|ownerId|workspaceId|dueAt)"/);
});
