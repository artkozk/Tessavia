const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const c = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(__dirname, 'personal-finance.js'), 'utf8').replaceAll('export ', ''), c);
const fixture = () => ({ buckets: [{ id: 'a', name: 'New title', destination: 'Savings' }, { id: 'b', name: 'Daily', destination: '' }], sources: [], entries: [
  { id: 'one', date: '2026-09-01', sourceId: 's', sourceName: 'Service', payer: 'Client', grossMinor: 10001, workerMinor: 2000, baseMinor: 8001, allocations: [{ bucketId: 'a', bucketName: 'Saved name', basisPoints: 5000, amountMinor: 4001, paidMinor: 1001 }, { bucketId: 'b', bucketName: 'Daily', basisPoints: 5000, amountMinor: 4000, paidMinor: 0 }] },
  { id: 'two', date: '2026-09-02', sourceId: 's', sourceName: 'Service', payer: 'Other', grossMinor: 101, workerMinor: 0, baseMinor: 101, allocations: [{ bucketId: 'a', bucketName: 'Saved name', basisPoints: 5000, amountMinor: 51, paidMinor: 51 }, { bucketId: 'b', bucketName: 'Daily', basisPoints: 5000, amountMinor: 50, paidMinor: 0 }] },
] });

test('money inputs keep cents exact and reject rounding, negative, exponent and out-of-range values', () => {
  for (const [text, expected] of [['0', 0], ['1,05', 105], ['1.5', 150], [' 1\u202f234,56 ', 123456], ['10000000000.00', 1000000000000]]) assert.equal(c.parseFinanceMinor(text), expected);
  for (const text of ['', '-1', '1e4', '1.001', '1,1.2', 'Infinity', '10000000000.01']) assert.throws(() => c.parseFinanceMinor(text));
  assert.throws(() => c.parseFinanceMinor('0', { positive: true }));
  assert.equal(c.parseFinanceBasisPoints('12,34'), 1234);
  assert.throws(() => c.parseFinanceBasisPoints('100.01'));
});

test('month report ranges include leap day and reject unsupported dates', () => {
  assert.equal(c.financeMonthRange('2024-02').to, '2024-02-29');
  assert.equal(c.financeMonthRange('2026-02').to, '2026-02-28');
  assert.equal(c.financeMonthRange('2026-12').to, '2026-12-31');
  for (const month of ['2026-00', '2026-13', '2026-9', '2026-09-01', '0001-01', '9999-12']) assert.throws(() => c.financeMonthRange(month));
});

test('income dates share report boundaries and reject impossible days before sending', () => {
  for (const date of ['1900-01-01', '2024-02-29', '9998-12-31']) assert.equal(c.validateFinanceDate(date), date);
  for (const date of ['', '1899-12-31', '9999-01-01', '1900-02-29', '2026-02-29', '2026-02-31', '2026-13-01', '2026-9-1']) assert.throws(() => c.validateFinanceDate(date));
});

test('report uses stored allocations, excludes voided incomes, and separates transfers from money allocated', () => {
  const data = fixture();
  data.entries.push({ ...data.entries[0], id: 'cancelled', voided: true, grossMinor: 999999999999 });
  const result = c.summarizeFinance(data);
  assert.equal(result.count, 2); assert.equal(result.grossMinor, 10102n); assert.equal(result.workerMinor, 2000n); assert.equal(result.baseMinor, 8102n); assert.equal(result.paidMinor, 1052n);
  assert.equal(result.buckets[0].name, 'Saved name'); assert.equal(result.buckets[0].destination, 'Savings');
  assert.equal(result.buckets[0].allocatedMinor, 4052n); assert.equal(result.buckets[0].remainingMinor, 3000n);
  assert.equal(result.buckets.reduce((sum, bucket) => sum + bucket.allocatedMinor, 0n), result.baseMinor);
  assert.equal(result.sources[0].grossMinor, 10102n);
});

test('totals and formatting preserve integer precision beyond normal floating point sums', () => {
  const data = fixture(); data.entries = Array.from({ length: 10000 }, (_, index) => ({ ...data.entries[0], grossMinor: 1000000000001, workerMinor: 0, baseMinor: 1000000000001, allocations: [] }));
  const result = c.summarizeFinance(data); assert.equal(result.grossMinor, 10000000000010000n);
  assert.equal(c.financeMoney(10000000000010001n).replace(/[ \u00a0\u202f]/g, ''), '100000000000100,01₽');
});

test('CSV has one row per income, zeroes missing buckets, and omits cancelled incomes', () => {
  const data = fixture(); data.entries.push({ ...data.entries[0], id: 'cancelled', voided: true });
  const csv = c.financeCSV(data), rows = csv.slice(1).split('\r\n');
  assert.equal(rows.length, 3);
  const values = rows.slice(1).map(row => row.split(';').map(cell => cell.slice(1, -1)));
  assert.equal(values.reduce((sum, row) => sum + c.parseFinanceMinor(row[3]), 0), 10102);
  assert.equal(values[0].length, 13); assert.equal(values[0][7], '40.01'); assert.equal(values[0][8], '10.01');
  data.entries[1].allocations = [];
  assert.match(c.financeCSV(data).split('\r\n')[2], /"0\.00";"0\.00";"0\.00"/);
});

test('CSV escapes formulas in user values and headers, including quotes and line breaks', () => {
  const data = fixture(); data.entries[0].sourceName = '=2+2'; data.entries[0].payer = '  @command'; data.entries[0].note = '"Quoted"\nnext'; data.entries[0].allocations[0].bucketName = '-Danger';
  const csv = c.financeCSV(data);
  assert.ok(csv.includes('"\'=2+2"')); assert.ok(csv.includes('"\'  @command"')); assert.ok(csv.includes('"\'-Danger: распределено, RUB"'));
  assert.ok(csv.includes('"""Quoted""\nnext"'));
});

test('an uncertain create retry keeps the same key and payload; changed payload is blocked', async () => {
  const draft = c.createFinanceRequestDraft('stable-key'), sent = [];
  const payload = { sourceId: 's', grossMinor: 15000, expectedSourceRevision: 1 };
  await assert.rejects(draft.submit(payload, body => { sent.push(body); throw new Error('Network failed'); }));
  assert.equal(draft.isUncertain(), true);
  await assert.rejects(draft.submit({ ...payload, grossMinor: 16000 }, () => { throw new Error('must not send'); }), /прежними значениями/);
  const saved = await draft.submit(payload, body => { sent.push(body); return { id: 'same-entry' }; });
  assert.equal(saved.id, 'same-entry'); assert.equal(draft.isUncertain(), false);
  assert.equal(JSON.stringify(sent[0]), JSON.stringify(sent[1])); assert.equal(sent[0].clientRequestId, 'stable-key');
});

test('a known rejected request can review new source rules and retry with the same draft id', async () => {
  const draft = c.createFinanceRequestDraft('stable-key');
  await assert.rejects(draft.submit({ expectedSourceRevision: 1 }, () => { throw Object.assign(new Error('Source changed'), { status: 409 }); }));
  assert.equal(draft.isUncertain(), false);
  const result = await draft.submit({ expectedSourceRevision: 2 }, body => body);
  assert.equal(result.expectedSourceRevision, 2); assert.equal(result.clientRequestId, 'stable-key');
});

test('payer report keeps identity across rename without rewriting income names', () => {
  const data = fixture(); data.counterparties = [{ id: 'client', name: 'Renamed client', note: 'Long collaboration', revision: 2 }];
  data.entries[0].payerId = 'client'; data.entries[0].payer = 'Original name'; data.entries[1].payerId = 'client'; data.entries[1].payer = 'Renamed client';
  const report = c.summarizeFinance(data);
  assert.equal(report.payers.length, 1); assert.equal(report.payers[0].name, 'Renamed client'); assert.equal(report.payers[0].count, 2); assert.equal(report.payers[0].grossMinor, 10102n);
  assert.equal(data.entries[0].payer, 'Original name');
});

test('equal names do not merge two directory people or a historical free-text payer', () => {
  const data = fixture(); data.counterparties = [{ id: 'one', name: 'Alex', note: 'Person A' }, { id: 'two', name: 'Alex', note: 'Person B', archived: true }];
  data.entries = [
    { ...data.entries[0], payerId: 'one', payer: 'Alex' },
    { ...data.entries[1], payerId: 'two', payer: 'Alex' },
    { ...data.entries[1], id: 'legacy', payerId: '', payer: 'Alex' },
    { ...data.entries[1], id: 'none', payerId: '', payer: '' },
  ];
  const report = c.summarizeFinance(data);
  assert.equal(report.payers.length, 4);
  assert.deepEqual(Array.from(report.payers, payer => payer.key), ['payer:one', 'payer:two', 'legacy:Alex', 'none:']);
  assert.equal(report.payers.find(payer => payer.key === 'payer:two').archived, true);
  assert.equal(report.payers.find(payer => payer.key === 'legacy:Alex').legacy, true);
});

test('payer filter scopes totals, sources, buckets, journal and CSV to the same incomes', () => {
  const data = fixture(); data.entries[0].payerId = 'first'; data.entries[1].payerId = 'second'; data.entries.push({ ...data.entries[0], id: 'void', voided: true });
  const scoped = c.filterFinanceByPayer(data, 'payer:first'), report = c.summarizeFinance(scoped);
  assert.equal(scoped.entries.length, 2); assert.equal(report.count, 1); assert.equal(report.grossMinor, 10001n);
  assert.equal(report.sources[0].grossMinor, 10001n); assert.equal(report.buckets[0].allocatedMinor, 4001n);
  assert.equal(c.financeCSV(scoped).split('\r\n').length, 2);
  assert.equal(c.filterFinanceByPayer(data, ''), data);
  assert.equal(c.summarizeFinance(c.filterFinanceByPayer(data, 'payer:missing')).grossMinor, 0n);
});

test('archived payer is retained for an existing income but unavailable as a new selection', () => {
  const counterparties = [{ id: 'archived', name: 'New name', archived: true, revision: 9 }, { id: 'active', name: 'Active name', revision: 3 }];
  const existing = { payerId: 'archived', payer: 'Saved name' };
  const same = c.financeEntryPayerPayload(existing, 'archived', counterparties);
  assert.equal(same.payerId, 'archived'); assert.equal(same.payer, 'Saved name'); assert.equal(same.expectedPayerRevision, 9);
  assert.throws(() => c.financeEntryPayerPayload(null, 'archived', counterparties));
  assert.throws(() => c.financeEntryPayerPayload(existing, 'missing', counterparties));
  const changed = c.financeEntryPayerPayload(existing, 'active', counterparties);
  assert.equal(changed.payer, 'Active name'); assert.equal(changed.expectedPayerRevision, 3);
});

test('explicit unlink and manual payer do not silently recreate or reuse a directory identity', () => {
  const entry = { payerId: 'client', payer: 'Saved' };
  const unlinked = c.financeEntryPayerPayload(entry, '__manual__', [], '  Free text  ');
  assert.equal(unlinked.payerId, ''); assert.equal(unlinked.payer, 'Free text'); assert.equal(unlinked.expectedPayerRevision, 0);
  const empty = c.financeEntryPayerPayload(entry, '', []);
  assert.equal(empty.payerId, ''); assert.equal(empty.payer, '');
});

test('counterparty input accepts people or companies without a mandatory type and respects server limits', () => {
  const input = c.financeCounterpartyPayload('  Company  ', '  My note  ');
  assert.equal(input.name, 'Company'); assert.equal(input.note, 'My note'); assert.equal(input.kind, undefined);
  assert.equal(c.financeCounterpartyPayload('Я'.repeat(160), '😀'.repeat(2000)).name.length, 160);
  for (const [name, note] of [['', 'Note'], ['N'.repeat(161), ''], ['Name', 'N'.repeat(2001)]]) assert.throws(() => c.financeCounterpartyPayload(name, note));
});

test('income retry retains the newly created payer ID and revision without another directory write', async () => {
  const draft = c.createFinanceRequestDraft('payer-income-draft'), payload = { payerId: 'created-once', payer: 'Client', expectedPayerRevision: 1, grossMinor: 10000 }, calls = [];
  await assert.rejects(draft.submit(payload, body => { calls.push(body); throw new Error('Unknown result'); }));
  await draft.submit(payload, body => { calls.push(body); return { id: 'income' }; });
  assert.equal(calls.length, 2); assert.equal(JSON.stringify(calls[0]), JSON.stringify(calls[1])); assert.equal(calls[1].payerId, 'created-once');
  const retry = c.createFinanceRequestDraft('payer-rule-draft');
  await assert.rejects(retry.submit(payload, () => { throw Object.assign(new Error('Payer changed'), { status: 409 }); }));
  assert.equal((await retry.submit({ ...payload, payer: 'Renamed', expectedPayerRevision: 2 }, body => body)).expectedPayerRevision, 2);
});

test('today and Monday-based week presets retain real calendar boundaries across months and years', () => {
  assert.deepEqual(JSON.parse(JSON.stringify(c.financeReportRange('2026-09', 'today', '2026-09-14'))), { from: '2026-09-14', to: '2026-09-14' });
  assert.deepEqual(JSON.parse(JSON.stringify(c.financeReportRange('2026-09', 'week', '2026-09-13'))), { from: '2026-09-07', to: '2026-09-13' });
  assert.deepEqual(JSON.parse(JSON.stringify(c.financeReportRange('2027-01', 'week', '2027-01-01'))), { from: '2026-12-28', to: '2027-01-03' });
  assert.equal(c.financeReportRange('2024-02', 'month', '2026-09-14').to, '2024-02-29');
  assert.equal(c.financeReportRange('9998-12', 'week', '9998-12-31').to, '9998-12-31');
  assert.throws(() => c.financeReportRange('2026-09', 'week', '2026-02-30'));
});

test('account balances use full history and never subtract transfer marks or apply payer filters twice', () => {
  const data = fixture();
  data.balances = [{ bucketId: 'a', allocatedMinor: 204052, spentMinor: 60000, balanceMinor: 144052, periodAllocatedMinor: 4052, periodSpentMinor: 10000, openingMinor: 150000 }];
  const full = c.financeAccountBalances(data), filtered = c.financeAccountBalances(c.filterFinanceByPayer(data, 'legacy:Client'));
  assert.equal(full[0].balanceMinor, 144052n); assert.equal(full[0].paidMinor, undefined);
  assert.equal(full[0].openingMinor + full[0].periodAllocatedMinor - full[0].periodSpentMinor, full[0].balanceMinor);
  assert.equal(filtered[0].balanceMinor, full[0].balanceMinor);
  assert.equal(c.summarizeFinance(data).paidMinor, 1052n);
  assert.equal(full[1].balanceMinor, 0n);
});

test('accounts preserve negative and archived balances even when the selected month has no income', () => {
  const data = { entries: [], buckets: [{ id: 'car', name: 'Машина', archived: true }, { id: 'tithe', name: 'Десятина' }], balances: [{ bucketId: 'car', allocatedMinor: 10000, spentMinor: 15000, balanceMinor: -5000, openingMinor: -3000, periodAllocatedMinor: 0, periodSpentMinor: 2000 }, { bucketId: 'tithe', allocatedMinor: 100000, spentMinor: 75000, balanceMinor: 25000, openingMinor: 30000, periodAllocatedMinor: 0, periodSpentMinor: 5000 }] };
  const result = c.financeAccountBalances(data);
  assert.equal(result[0].archived, true); assert.equal(result[0].balanceMinor, -5000n);
  assert.equal(result[1].balanceMinor, 25000n);
  assert.equal(c.financeMoney(result[0].balanceMinor).replace(/\s/g, ''), '−50₽');
});

test('expense input records a refuel or weekly tithe payment against an explicit account with exact cents', () => {
  const buckets = [{ id: 'car', revision: 3 }, { id: 'tithe', revision: 7 }];
  const refuel = c.financeExpensePayload({ bucketId: 'car', amount: '1 500,25', date: '2026-09-14', note: '  Заправка  ', payee: ' АЗС ' }, buckets);
  assert.equal(refuel.amountMinor, 150025); assert.equal(refuel.bucketId, 'car'); assert.equal(refuel.expectedBucketRevision, 3);
  assert.equal(refuel.note, 'Заправка'); assert.equal(refuel.payee, 'АЗС'); assert.equal(refuel.expectedRevision, undefined);
  const tithe = c.financeExpensePayload({ bucketId: 'tithe', amount: '800', date: '2026-09-13', note: 'Десятина за неделю' }, buckets, { id: 'e', bucketId: 'tithe', revision: 4 });
  assert.equal(tithe.amountMinor, 80000); assert.equal(tithe.expectedRevision, 4); assert.equal(tithe.payee, '');
  assert.equal(tithe.grossMinor, undefined); assert.equal(tithe.paidMinor, undefined);
});

test('expense validation rejects invalid money/date, unknown accounts and archived new choices while allowing same-account repair', () => {
  const buckets = [{ id: 'old', archived: true, revision: 2 }, { id: 'active', revision: 1 }], values = { bucketId: 'active', amount: '10.25', date: '2026-09-14' };
  for (const change of [{ amount: '0' }, { amount: '-1' }, { amount: '1.001' }, { date: '2026-02-29' }, { bucketId: 'missing' }, { bucketId: 'old' }, { payee: 'я'.repeat(121) }, { note: '😀'.repeat(2001) }]) assert.throws(() => c.financeExpensePayload({ ...values, ...change }, buckets));
  const edited = c.financeExpensePayload({ ...values, bucketId: 'old' }, buckets, { bucketId: 'old', revision: 6 });
  assert.equal(edited.expectedRevision, 6); assert.equal(edited.bucketId, 'old');
  assert.throws(() => c.financeExpensePayload({ ...values, bucketId: 'old' }, buckets, { bucketId: 'active', revision: 6 }));
});

test('mixed history sorts by day and creation time, retains cancelled audit rows and supports expense-only view', () => {
  const data = fixture(); data.expenses = [{ id: 'fuel', bucketId: 'b', bucketName: 'Daily', date: '2026-09-02', createdAt: '2026-09-02T13:00:00Z', amountMinor: 2500, note: 'Fuel' }, { id: 'void', bucketId: 'a', date: '2026-09-03', amountMinor: 100, voided: true }];
  const rows = c.financeJournal(data);
  assert.deepEqual(Array.from(rows, row => row.id), ['void', 'fuel', 'two', 'one']);
  assert.equal(rows[0].voided, true); assert.equal(rows[1].kind, 'expense'); assert.equal(rows[1].journalAmountMinor, 2500n);
  assert.equal(c.financeJournal(data, { kind: 'expense' }).length, 2);
  assert.equal(c.financeJournal(data, { kind: 'income' }).length, 2);
});

test('per-account history shows the allocated income share and does not charge full income to every account', () => {
  const data = fixture(); data.expenses = [{ id: 'expense-a', bucketId: 'a', date: '2026-09-03', amountMinor: 2000 }, { id: 'expense-b', bucketId: 'b', date: '2026-09-03', amountMinor: 1000 }];
  const rows = c.financeJournal(data, { bucketId: 'a' });
  assert.equal(rows.length, 3); assert.equal(rows.find(row => row.id === 'one').journalAmountMinor, 4001n);
  assert.equal(rows.filter(row => row.kind === 'income').reduce((sum, row) => sum + row.journalAmountMinor, 0n), 4052n);
  assert.equal(rows.some(row => row.id === 'expense-b'), false);
  const scoped = c.financeJournal(data, { kind: 'income', payerKey: 'legacy:Client', bucketId: 'a' });
  assert.equal(scoped.length, 1); assert.equal(scoped[0].id, 'one');
  assert.equal(c.financeJournal(data, { payerKey: 'legacy:Client' }).filter(row => row.kind === 'expense').length, 2);
});

test('operation export keeps income and expense columns separate and excludes cancelled entries', () => {
  const data = fixture(); data.expenses = [{ id: 'fuel', bucketId: 'b', bucketName: '=bad', date: '2026-09-03', amountMinor: 1234, payee: '@payee', note: '"Refuel"\nToday' }, { id: 'void', bucketId: 'b', date: '2026-09-03', amountMinor: 80000, voided: true }];
  const csv = c.financeLedgerCSV(c.financeJournal(data));
  assert.ok(csv.includes('"Приход, RUB";"Расход, RUB"'));
  assert.ok(csv.includes('"0.00";"12.34"'));
  assert.ok(csv.includes('"100.01";"0.00"'));
  assert.ok(csv.includes('"\'=bad"')); assert.ok(csv.includes('"\'@payee"'));
  assert.ok(csv.includes('"""Refuel""\nToday"')); assert.equal(csv.includes('800.00'), false);
  const accountCSV = c.financeLedgerCSV(c.financeJournal(data, { bucketId: 'a' }));
  assert.ok(accountCSV.includes('"40.01";"0.00"')); assert.equal(accountCSV.includes('"100.01"'), false);
});

test('expense uncertain retry keeps original account and exact amount; known bucket revision conflict can be corrected', async () => {
  const draft = c.createFinanceRequestDraft('expense-stable-key'), sent = [];
  const payload = c.financeExpensePayload({ bucketId: 'car', amount: '10,25', date: '2026-09-14', note: 'Fuel' }, [{ id: 'car', revision: 1 }]);
  await assert.rejects(draft.submit(payload, value => { sent.push(value); throw new Error('Connection lost'); }));
  await assert.rejects(draft.submit({ ...payload, bucketId: 'tithe' }, () => assert.fail('Changed account must not be sent')));
  await draft.submit(payload, value => { sent.push(value); return { id: 'saved-expense' }; });
  assert.equal(JSON.stringify(sent[0]), JSON.stringify(sent[1])); assert.equal(sent[1].amountMinor, 1025);
  await assert.rejects(draft.submit(payload, () => { throw Object.assign(new Error('Bucket changed'), { status: 409 }); }));
  const result = await draft.submit({ ...payload, expectedBucketRevision: 2 }, value => value);
  assert.equal(result.clientRequestId, 'expense-stable-key'); assert.equal(result.expectedBucketRevision, 2);
});

function financeUIHarness({ team = false, expose = false } = {}) {
  const buttons = new Map(), calls = [], html = [];
  const makeButton = (dataset = {}) => ({ dataset, addEventListener(name, action) { this[name] = action; } });
  const periodButtons = ['today', 'week', 'month'].map(financePeriod => makeButton({ financePeriod }));
  const viewButtons = ['accounts', 'history'].map(financeView => makeButton({ financeView }));
  const root = {
    querySelector(selector) { if (!buttons.has(selector)) buttons.set(selector, makeButton()); return buttons.get(selector); },
    querySelectorAll(selector) { return selector === '[data-finance-period]' ? periodButtons : selector === '[data-finance-view]' ? viewButtons : []; },
  };
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : ['2026-09-14T12:00:00Z'])); } }
  const state = { me: { id: 'first-owner' }, activeWorkspaceId: 'private', view: 'personal', personalTab: 'finance' };
  const context = vm.createContext({ Date: Clock, document: { querySelector(selector) { return selector === '[data-personal-finance]' ? root : null; } } });
  let source = fs.readFileSync(path.join(__dirname, 'personal-finance.js'), 'utf8').replaceAll('export ', '');
  if (expose) source = source.replace('return { render, bind, openSettings, reset, invalidate };', 'return { render, bind, openSettings, reset, invalidate, context, request, teamSourceSettings };');
  vm.runInContext(source, context);
  let ui;
  ui = context.createPersonalFinanceUI({ state, api(url, options) { return new Promise((resolve, reject) => calls.push({ url, options, resolve, reject })); }, escapeHTML: value => value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('"', '&quot;'), icon: () => '', toast: () => {}, renderPersonal() { html.push(ui.render()); }, ...(team ? { getScope: () => ({ kind: 'team', workspaceId: state.activeWorkspaceId, workspaceName: 'Current team' }), isVisible: () => true, onOpenSource() {} } : {}) });
  return { state, ui, calls, html, buttons, periodButtons, viewButtons, tick: () => new Promise(resolve => setImmediate(resolve)) };
}

test('finance screen moves between full-history account balances and dated expense history without mixing totals', async () => {
  const h = financeUIHarness(), data = fixture(); data.sources = [{ id: 's', name: 'Service' }];
  data.balances = [{ bucketId: 'a', allocatedMinor: 204052, spentMinor: 60000, balanceMinor: 144052, periodAllocatedMinor: 4052, periodSpentMinor: 10000, openingMinor: 150000 }];
  data.expenses = [{ id: 'fuel', bucketId: 'a', bucketName: 'Car', amountMinor: 10000, date: '2026-09-14', note: 'Refuel', revision: 1 }];
  h.ui.render(); h.ui.bind(); assert.match(h.calls[0].url, /from=2026-09-01&to=2026-09-30$/);
  h.calls[0].resolve(data); await h.tick();
  const accounts = h.ui.render(); assert.match(accounts, /1[\s\u00a0\u202f]440,52 ₽/); assert.ok(accounts.includes('data-finance-accounts-block')); assert.ok(accounts.includes('Refuel'));
  h.viewButtons[1].onclick(); const history = h.ui.render();
  assert.ok(history.includes('data-finance-history-block')); assert.equal(history.includes('data-finance-accounts-block'), false); assert.ok(history.includes('пн, 14 сентября 2026 г.'));
  assert.ok(history.includes('data-finance-expense="fuel"')); assert.ok(history.includes('−100 ₽'));
  h.viewButtons[0].onclick(); assert.ok(h.ui.render().includes('data-finance-accounts-block'));
});

test('late prior-period and prior-owner responses cannot overwrite the selected finance view', async () => {
  const h = financeUIHarness(); h.ui.render(); h.ui.bind();
  h.periodButtons[0].onclick(); assert.match(h.calls[1].url, /from=2026-09-14&to=2026-09-14$/);
  h.calls[1].resolve({ buckets: [], sources: [], entries: [], expenses: [], balances: [] }); await h.tick();
  h.calls[0].resolve({ buckets: [], sources: [], entries: [{ id: 'old', sourceName: 'STALE MONTH', allocations: [] }], expenses: [] }); await h.tick();
  assert.equal(h.ui.render().includes('STALE MONTH'), false);
  h.ui.invalidate(); h.ui.bind(); const previousOwner = h.calls[2];
  h.state.me = { id: 'second-owner' }; h.ui.reset(); h.ui.render(); h.ui.bind(); const nextOwner = h.calls[3];
  assert.equal(previousOwner.options.headers['X-Outbox-Owner'], 'first-owner'); assert.equal(nextOwner.options.headers['X-Outbox-Owner'], 'second-owner');
  previousOwner.resolve({ buckets: [{ id: 'private', name: 'OTHER ACCOUNT SECRET' }], sources: [], entries: [], expenses: [], balances: [] }); await h.tick();
  assert.equal(h.ui.render().includes('OTHER ACCOUNT SECRET'), false);
  nextOwner.resolve({ buckets: [{ id: 'own', name: 'OWN ACCOUNT' }], sources: [], entries: [], expenses: [], balances: [] }); await h.tick();
  assert.ok(h.ui.render().includes('OWN ACCOUNT')); assert.equal(h.ui.render().includes('OTHER ACCOUNT SECRET'), false);
});

test('dirty finance back waits for one confirmation and ignores an answer after account changes', async () => {
  const state = { me: { id: 'owner' }, activeWorkspaceId: 'private' }, confirmations = [];
  const box = { open: true, dataset: { financeOwner: 'owner', composerDirty: 'true' }, addEventListener() {} };
  const close = { focus() {} }, root = { isConnected: true, querySelector: selector => selector === '[data-finance-close]' ? close : null };
  const content = { innerHTML: 'UNCHANGED DRAFT', querySelector: () => root };
  const ctx = vm.createContext({ document: { querySelector: selector => selector === '#workspace-dialog' ? box : selector === '#workspace-dialog-content' ? content : null } });
  const source = fs.readFileSync(path.join(__dirname, 'personal-finance.js'), 'utf8').replaceAll('export ', '').replace('return { render, bind, openSettings, reset, invalidate };', 'return { render, bind, openSettings, reset, invalidate, replaceDialog };');
  vm.runInContext(source, ctx);
  const ui = ctx.createPersonalFinanceUI({ state, api: () => {}, escapeHTML: value => value, icon: () => '', openModal: () => {}, requestDialogClose: () => {}, toast: () => {}, renderPersonal: () => {}, confirmDiscard: () => new Promise(resolve => confirmations.push(resolve)) });
  const first = ui.replaceDialog('Next', 'NEW');
  assert.equal(confirmations.length, 1); assert.equal(content.innerHTML, 'UNCHANGED DRAFT');
  assert.equal(await ui.replaceDialog('Another', 'OTHER'), null); assert.equal(confirmations.length, 1);
  confirmations[0](false); assert.equal(await first, null); assert.equal(box.dataset.composerDirty, 'true');
  const changedOwner = ui.replaceDialog('Next', 'NEW'); state.me = { id: 'another' }; confirmations[1](true);
  assert.equal(await changedOwner, null); assert.equal(content.innerHTML, 'UNCHANGED DRAFT');
  state.me = { id: 'owner' };
  const accepted = ui.replaceDialog('Next', 'NEW'); confirmations[2](true);
  const view = await accepted; assert.equal(view.alive(), true); assert.equal(box.dataset.composerDirty, 'false'); assert.ok(content.innerHTML.includes('NEW'));
});

test('income preview explains the selected worker rule and never subtracts hidden worker values', () => {
  assert.equal(c.financeIncomeBasePreview('', '500', false), 'Доли считаются от всей суммы дохода.');
  assert.equal(c.financeIncomeBasePreview('', '500', true), 'Распределение рассчитывается после выплат исполнителям.');
  assert.equal(c.financeIncomeBasePreview('100', '500', false), 'К распределению: 100 ₽');
  assert.equal(c.financeIncomeBasePreview('100', '25,50', true), 'К распределению: 74,50 ₽');
  assert.equal(c.financeIncomeBasePreview('100', '101', true), 'Выплаты исполнителям не могут превышать доход.');
});

const teamFinance = (workspaceId, extras = {}) => ({ buckets: [], sources: [], counterparties: [], entries: [], expenses: [], balances: [], ...extras, scope: { kind: 'team', workspaceId, workspaceName: `Team ${workspaceId}`, sourceWorkspaceId: workspaceId, sourceWorkspaceName: `Team ${workspaceId}`, linked: false, canWrite: true, canConfigure: true, revision: 1, ...extras.scope } });

test('team finance starts with its own empty ledger and never requests the personal endpoint', async () => {
  const h = financeUIHarness({ team: true }); h.state.activeWorkspaceId = 'team-a'; h.ui.render(); h.ui.bind();
  assert.match(h.calls[0].url, /^\/api\/workspace\/finance\?/);
  assert.equal(h.calls[0].options.headers['X-Workspace-ID'], 'team-a');
  h.calls[0].resolve(teamFinance('team-a')); await h.tick();
  const html = h.ui.render();
  assert.match(html, /Финансы команды/); assert.match(html, /Учёт.*пустого списка/);
  assert.equal(/data-finance-account-history=/.test(html), false);
  assert.equal(/Машина|Десятина|Папе/.test(html), false);
  assert.equal(h.calls.some(call => call.url.includes('/personal/')), false);
});

test('changing teams immediately hides prior balances and discards a delayed previous-team reply', async () => {
  const h = financeUIHarness({ team: true }); h.state.activeWorkspaceId = 'a'; h.ui.render(); h.ui.bind();
  h.state.activeWorkspaceId = 'b'; h.ui.render(); h.ui.bind();
  h.calls[1].resolve(teamFinance('b', { buckets: [{ id: 'b-only', name: 'B OWN ACCOUNT' }] })); await h.tick();
  h.calls[0].resolve(teamFinance('a', { buckets: [{ id: 'a-only', name: 'A CONFIDENTIAL BALANCE' }] })); await h.tick();
  assert.match(h.ui.render(), /B OWN ACCOUNT/); assert.doesNotMatch(h.ui.render(), /A CONFIDENTIAL/);
  h.state.activeWorkspaceId = 'c';
  assert.doesNotMatch(h.ui.render(), /B OWN ACCOUNT/);
});

test('a team response missing or mismatching the confirmed scope fails closed instead of showing personal rows', async () => {
  for (const scope of [undefined, { kind: 'personal' }, { kind: 'team', workspaceId: 'other' }]) {
    const h = financeUIHarness({ team: true }); h.state.activeWorkspaceId = 'team-a'; h.ui.render(); h.ui.bind();
    h.calls[0].resolve({ ...teamFinance('team-a'), scope, buckets: [{ id: 'secret', name: 'DO NOT SHOW' }] }); await h.tick();
    assert.doesNotMatch(h.ui.render(), /DO NOT SHOW/); assert.match(h.ui.render(), /Не удалось подтвердить команду/);
  }
});

test('linked finance labels its source and retains reports/export but removes creation and account-spending actions', async () => {
  const h = financeUIHarness({ team: true }); h.state.activeWorkspaceId = 'viewer'; h.ui.render(); h.ui.bind();
  const data = fixture(); data.sources = [{ id: 's', name: 'Income' }];
  h.calls[0].resolve(teamFinance('viewer', { ...data, scope: { sourceWorkspaceId: 'source', sourceWorkspaceName: '<Source & team>', linked: true, canWrite: false } })); await h.tick();
  const html = h.ui.render();
  assert.match(html, /Источник: &lt;Source &amp; team>/); assert.match(html, /только при собственном доступе/);
  assert.match(html, /data-finance-open-source="source"/); assert.match(html, /data-finance-export/);
  assert.doesNotMatch(html, /data-finance-add|data-finance-expense-add/);
  h.viewButtons[1].onclick(); assert.match(h.ui.render(), /data-finance-ledger-export/);
});

test('a read-only member of the owning team cannot dispatch a write through a stale action', async () => {
  const h = financeUIHarness({ team: true, expose: true }); h.ui.render(); h.ui.bind();
  h.calls[0].resolve(teamFinance('private', { scope: { canWrite: false, canConfigure: false } })); await h.tick();
  assert.doesNotMatch(h.ui.render(), /data-finance-add|data-finance-expense-add/);
  await assert.rejects(h.ui.request(h.ui.context(), '/expenses', { method: 'POST', body: '{}' }), /только для просмотра/);
  assert.equal(h.calls.length, 1);
});

test('open team forms pin source and revision; a later source change cannot silently retarget their requests', async () => {
  const h = financeUIHarness({ team: true, expose: true }); h.state.activeWorkspaceId = 'a'; h.ui.render(); h.ui.bind();
  h.calls[0].resolve(teamFinance('a', { scope: { revision: 3 } })); await h.tick();
  const draft = h.ui.context();
  h.ui.invalidate(); h.ui.bind(); h.calls[1].resolve(teamFinance('a', { scope: { revision: 5 } })); await h.tick();
  const saving = h.ui.request(draft, '/expenses', { method: 'POST', body: '{"amountMinor":12345}' });
  assert.equal(h.calls[2].options.headers['X-Finance-Source'], 'a');
  assert.equal(h.calls[2].options.headers['X-Finance-Revision'], '3');
  assert.equal(h.calls[2].options.headers['X-Workspace-ID'], 'a');
  h.calls[2].reject(Object.assign(new Error('Источник изменился'), { status: 409 }));
  await assert.rejects(saving, /Источник изменился/);
  h.state.activeWorkspaceId = 'b';
  await assert.rejects(h.ui.request(draft, '/expenses', { method: 'POST', body: '{}' }), /Пространство изменилось/);
  assert.equal(h.calls.length, 3);
});

test('personal finance keeps its own API even while its settings are opened from a team workspace', async () => {
  const h = financeUIHarness(); h.state.activeWorkspaceId = 'business'; h.ui.render(); h.ui.bind();
  assert.match(h.calls[0].url, /^\/api\/personal\/finance\?/);
  assert.equal(h.calls[0].options.headers['X-Finance-Source'], undefined);
  h.calls[0].resolve({ buckets: [{ id: 'my', name: 'My savings' }], sources: [], entries: [] }); await h.tick();
  assert.match(h.ui.render(), /My savings/); assert.doesNotMatch(h.ui.render(), /Финансы команды/);
});

test('source settings keep a lost link selected, offer an explicit own-ledger return, and do not expose its hidden name', () => {
  const h = financeUIHarness({ team: true, expose: true });
  const settings = { scope: { workspaceId: 'own', sourceWorkspaceId: 'lost', canConfigure: true, sourceAvailable: false }, options: [{ workspaceId: 'own', workspaceName: 'Own' }, { workspaceId: 'allowed', workspaceName: 'Allowed <team>' }] };
  const html = h.ui.teamSourceSettings(settings, null);
  assert.match(html, /value="lost" selected disabled/);
  assert.match(html, /value="own" >Собственные финансы этой команды/);
  assert.match(html, /Allowed &lt;team>/); assert.match(html, /Возврат к собственным финансам сохраняет прежние/);
  assert.doesNotMatch(html, /value="own" selected/);
  settings.scope.canConfigure = false;
  assert.doesNotMatch(h.ui.teamSourceSettings(settings, null), /<form|<select/);
});
