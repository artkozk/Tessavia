const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const context = vm.createContext({});
vm.runInContext(fs.readFileSync(require('node:path').join(__dirname, 'page-labels.js'), 'utf8').replaceAll('export ', ''), context);
const { pageLabelTargets, applyPageLabels, updatePageTexts } = context;
function label(key, text, tag = 'span') {
  return { children: [], textContent: text, getAttribute: () => key, matches: () => ['input', 'textarea', 'select'].includes(tag), classList: { toggle() {} } };
}
test('caption overrides apply to all occurrences and reset to original without destroying content', () => {
  const a = label('income', 'Доход'), b = label('income', 'Доход');
  const root = { querySelectorAll: () => [a, b] };
  assert.equal(pageLabelTargets(root).length, 1);
  applyPageLabels(root, { 'label:income': 'Поступление' }, true);
  assert.equal(a.textContent, 'Поступление'); assert.equal(b.textContent, 'Поступление');
  applyPageLabels(root, {});
  assert.equal(a.textContent, 'Доход');
});
test('form inputs, nested controls and invalid keys cannot become label targets', () => {
  const input = label('value', '1000', 'input'), nested = label('button', 'button');
  nested.children = [{}];
  const root = { querySelectorAll: () => [input, nested, label('invalid key', 'Not a label')] };
  assert.equal(pageLabelTargets(root).length, 0);
});
test('editing visible labels preserves other page labels and does not mutate saved settings', () => {
  const previous = { heading: 'Мой бюджет', 'label:income': 'Поступление', hidden: 'Другой раздел' };
  const next = updatePageTexts(previous, [{ key: 'label:income', original: 'Доход', value: '  ' }, { key: 'label:expense', original: 'Расход', value: 'Оплата' }]);
  assert.equal(next.heading, 'Мой бюджет'); assert.equal(next.hidden, 'Другой раздел');
  assert.equal(next['label:income'], undefined); assert.equal(next['label:expense'], 'Оплата');
  assert.equal(previous['label:income'], 'Поступление');
});
test('labels have the same 160 code point bound as server and reject unsafe keys', () => {
  const next = updatePageTexts({}, [{ key: 'label:valid', value: '😀'.repeat(170) }, { key: '<bad>', value: 'ignored' }]);
  assert.equal([...next['label:valid']].length, 160); assert.equal(next['<bad>'], undefined);
});

test('legacy finance title remains a read-only fallback until explicitly edited', () => {
  const source = fs.readFileSync(require('node:path').join(__dirname, 'app.js'), 'utf8');
  const h = vm.createContext({ state: { view: 'personal', personalTab: 'finance' } });
  vm.runInContext(source.slice(source.indexOf('function pageTextValues('), source.indexOf('function openPageTextEditor(')), h);
  const layout = { texts: { heading: 'Мой бюджет' } };
  assert.equal(h.pageTextValues(layout)['label:finance-title'], 'Мой бюджет');
  assert.equal(layout.texts['label:finance-title'], undefined);
  layout.texts['label:finance-title'] = 'Мои счета';
  assert.equal(h.pageTextValues(layout)['label:finance-title'], 'Мои счета');
  h.state.personalTab = 'notes'; delete layout.texts['label:finance-title'];
  assert.equal(h.pageTextValues(layout)['label:finance-title'], undefined);
});
