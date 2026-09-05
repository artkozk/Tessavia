const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const today = fs.readFileSync(require.resolve('./personal-today.js'), 'utf8');
const app = fs.readFileSync(require.resolve('./app.js'), 'utf8');
const styles = fs.readFileSync(require.resolve('./styles.css'), 'utf8');

test('Today explains bounded project work and attention without mixing completed records', () => {
  assert.match(today, /projectAttention\?\.total/);
  assert.match(today, /Просрочек, ожидающей вас приёмки и критических рисков нет/);
  assert.match(today, /Моя работа в проектах/);
  assert.match(today, /projectWork\?\.hasMore/);
  assert.match(today, /data-today-project-workspace/);
});

test('Today project rows open their exact workspace source and remain configurable', () => {
  assert.match(app, /openProject:\(id,workspaceId\)=>openPersonalReviewSource/);
  assert.match(app, /block\('day-project-work','Моя работа в проектах','\.today-project-work'/);
  assert.match(styles, /\.today-project-row/);
});

test('a project-only account loads Today before deciding whether first-use applies', () => {
  assert.match(today, /hasNoProjectContext/);
  assert.match(app, /personalTodayUI\.hasNoProjectContext\(\)/);
});
