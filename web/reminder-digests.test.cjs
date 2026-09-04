const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = fs.readFileSync(require.resolve('./reminder-settings.js'), 'utf8');
const app = fs.readFileSync(require.resolve('./app.js'), 'utf8');

test('reminder settings expose independent daily and weekly digest schedules', () => {
  for (const field of ['dailyDigestEnabled','dailyDigestTime','weeklyDigestEnabled','weeklyDigestWeekday','weeklyDigestTime']) {
    assert.match(settings, new RegExp(`name="${field}"`));
    assert.match(settings, new RegExp(`${field}:(?:Number\\()?form\\.elements\\.${field}`));
  }
  assert.match(settings, /Одна запись с итоговыми числами без названий личных дел и карточек/);
});

test('digest notifications open Today or the weekly Review without treating a digest as a project record', () => {
  assert.match(app, /Object\.hasOwn\(options, 'personalTab'\).*state\.personalTab = options\.personalTab/s);
  assert.match(app, /entityType==='personal_digest'.*startsWith\('weekly:'\).*personalTab:'review'/s);
  assert.match(app, /entityType==='personal_digest'.*personalTab:'today'/s);
});
