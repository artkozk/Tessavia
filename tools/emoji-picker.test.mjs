import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { prepareCatalog, searchEmoji, createEmojiPreferences, insertEmojiAtSelection } from '../web/emoji-picker.js';

const data = JSON.parse(await readFile(new URL('../web/vendor/emoji-17.0-cldr48.2.json', import.meta.url)));
const catalog = prepareCatalog(data);
test('every RGI sequence is reachable, including mixed tones, tag flags and families', () => {
  assert.equal(catalog.items.length, 3944);
  assert.equal(catalog.groups.length, 9);
  for (const item of catalog.items) assert.equal(searchEmoji(catalog, { query: item.value })[0]?.value, item.value);
  assert.equal(searchEmoji(catalog, { variants: true }).length, 3944);
  for (const value of ['👩🏽‍❤️‍💋‍👨🏿', '👨‍👩‍👧‍👦', '🇷🇺', '🫱🏽‍🫲🏿']) assert.equal(searchEmoji(catalog, { query: value })[0].value, value);
});
test('search supports Russian, English, categories and preferred skin tones', () => {
  assert.ok(searchEmoji(catalog, { query: 'улыбка' }).length);
  assert.ok(searchEmoji(catalog, { query: 'heart' }).length);
  assert.ok(searchEmoji(catalog, { query: 'флаг россия' }).some(item => item.value === '🇷🇺'));
  assert.ok(searchEmoji(catalog, { group: '8' }).every(item => item.group === 8));
  assert.ok(searchEmoji(catalog, { tone: 3 }).some(item => item.value === '👍🏽'));
  assert.equal(searchEmoji(catalog, { query: 'nonsense no result' }).length, 0);
});
test('history and tone are isolated by owner and do not import unowned legacy storage', () => {
  const saved = new Map([['business-control:chat-recent-emojis', '["🤯"]']]);
  const prefs = createEmojiPreferences({ getItem: key => saved.get(key), setItem: (key, value) => saved.set(key, value) });
  prefs.remember(1, '👍', 1); prefs.remember(1, '👍', 2); prefs.remember(1, '❤️', 3); prefs.tone(1, 4);
  assert.deepEqual(prefs.list(1), ['❤️', '👍']);
  assert.deepEqual(prefs.list(1, 'frequent'), ['👍', '❤️']);
  assert.deepEqual(prefs.list(2), []); assert.equal(prefs.read(2).tone, 0);
  assert.equal(prefs.read(1).tone, 4); assert.ok(!prefs.quick(2).includes('🤯'));
  prefs.remember(1, '❤', 4); assert.equal(prefs.read(1).entries.length, 2);
  assert.equal(saved.get('business-control:chat-recent-emojis'), '["🤯"]');
});
test('disabled, corrupt and full storage do not break input or leak history', () => {
  const prefs = createEmojiPreferences({ getItem: () => '{broken', setItem: () => { throw Error('quota'); } });
  prefs.remember(1, '😀', 1); prefs.remember(1, '🥳', 2);
  assert.deepEqual(prefs.list(1), ['🥳', '😀']); assert.deepEqual(prefs.list(2), []);
  const blocked = createEmojiPreferences(); blocked.remember(3, '✅'); assert.deepEqual(blocked.list(3), ['✅']);
});
test('inserting a compound emoji replaces UTF-16 selection and emits input without submitting', () => {
  const events = [], textarea = { value: 'начало 😀 конец', selectionStart: 7, selectionEnd: 9,
    setRangeText(value, start, end) { this.value = this.value.slice(0, start) + value + this.value.slice(end); this.selectionStart = this.selectionEnd = start + value.length; },
    dispatchEvent(event) { events.push(event.type); },
  };
  insertEmojiAtSelection(textarea, '👩🏽‍❤️‍💋‍👨🏿');
  assert.equal(textarea.value, 'начало 👩🏽‍❤️‍💋‍👨🏿 конец'); assert.deepEqual(events, ['input']);
  assert.equal(textarea.selectionStart, 'начало 👩🏽‍❤️‍💋‍👨🏿'.length);
});
