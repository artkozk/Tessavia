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
