const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, 'styles.css'), 'utf8');
const collections = source.slice(source.indexOf('function renderCollections()'), source.indexOf('async function reloadCollections'));

test('empty boards heading remains a vertical text block', () => {
  assert.match(collections, /collection-page-heading"><div><p class="eyebrow">/);
  assert.doesNotMatch(css, /\.collection-page-heading > div:last-child/);
  assert.match(css, /\.section-heading > div, \.list-toolbar > div, \.page-heading > div \{ display: grid;/);
});

test('non-empty boards use a named actions container at every breakpoint', () => {
  assert.match(collections, /class="collection-page-actions"/);
  assert.match(css, /\.collection-page-heading > \.collection-page-actions \{ display: flex;/);
  assert.match(css, /\.collection-page-heading > \.collection-page-actions \{ display: grid; grid-template-columns: 1fr auto;/);
  assert.match(css, /\.collection-page-heading > \.collection-page-actions \{ grid-template-columns: minmax\(0, 1fr\); \}/);
});
