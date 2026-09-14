const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(__dirname + '/habit-tracker.js', 'utf8');
const load = async () => import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
test('habit date navigation keeps leap-day and year boundaries', async () => {
 const { habitRange, shiftHabitDate } = await load();
 assert.deepEqual(habitRange('2024-03-31','month',-1),{from:'2024-02-01',to:'2024-02-29'});
 assert.deepEqual(habitRange('2026-01-01','week'),{from:'2025-12-26',to:'2026-01-01'});
 const range=habitRange('2026-09-04','quarter');assert.equal((new Date(range.to)-new Date(range.from))/86400000+1,84);
 assert.equal(shiftHabitDate('2024-02-28',1),'2024-02-29');
});
test('anti habit labels distinguish missing data, clean days and excess', async () => {
 const {habitStateLabel,habitScheduleLabel}=await load();
 assert.equal(habitStateLabel({state:'pending',rule:{mode:'quit'}}),'Нет отметки');
 assert.equal(habitStateLabel({state:'success',rule:{mode:'quit'}}),'День без действия');
 assert.equal(habitStateLabel({state:'failed',rule:{mode:'reduce'}}),'Лимит превышен');
 assert.equal(habitScheduleLabel({cadence:'weekly',periodTarget:3,periodMeasure:'days'}),'3 успешных дней за неделю');
 assert.equal(habitScheduleLabel({cadence:'monthly',periodTarget:300,periodMeasure:'volume',unit:'мин'}),'300 мин за месяц');
});
test('weekly list keeps seven aligned dates without inventing missed days before creation', async () => {
 const {habitWeekDays}=await load();
 const today={date:'2026-01-02',state:'success',checkin:{value:0},rule:{mode:'quit'}};
 const result=habitWeekDays({today:today.date,startDate:'2026-01-01',days:[{date:'2026-01-01',state:'pending'},today]});
 assert.equal(result.length,7);
 assert.deepEqual(result.map(d=>d.date),['2025-12-27','2025-12-28','2025-12-29','2025-12-30','2025-12-31','2026-01-01','2026-01-02']);
 assert.ok(result.slice(0,5).every(d=>d.state==='unavailable' && d.beforeStart));
 assert.equal(result[5].state,'pending');
 assert.equal(result[6],today);
 assert.equal(result[6].checkin.value,0);
});
test('habit UI and modified queue parse and respect the production CSP', () => {
 new vm.Script(source.replace(/^export /gm,''));
 new vm.Script(fs.readFileSync(__dirname+'/outbox-ui.js','utf8').replace(/^import .*;$/gm,'').replace(/^export /gm,''));
 assert.doesNotMatch(source,/style="/);
 const embed=fs.readFileSync(__dirname+'/assets.go','utf8');assert.match(embed,/habit-tracker\.js/);
 const sw=fs.readFileSync(__dirname+'/sw.js','utf8');assert.match(sw,/habit-tracker\.js\?v=/);
});
test('snooze labels keep elapsed-hour and midnight semantics in the habit timezone', async () => {
 const {habitSnoozeLabel}=await load();
 assert.match(habitSnoozeLabel({state:'measured',value:10.5,snoozedAt:'2026-03-08T06:30:00Z'},'2026-03-08','America/New_York'),/03:30/);
 assert.match(habitSnoozeLabel({state:'snoozed',updatedAt:'2026-09-04T20:30:00Z'},'2026-09-04','Europe/Moscow'),/до конца дня/);
 assert.match(habitSnoozeLabel(null,'2026-09-04','UTC'),/не меняет результат/);
});

function uiHarness(habit, options = {}) {
 const calls = [], toasts = [], queued = [], loads = [];
 const state = { me: { id: 'owner' }, personal: { habits: [] } };
 const context = vm.createContext({
  setInterval() {}, navigator: { onLine: options.online !== false }, Event,
  document: Object.defineProperties({ visibilityState: 'visible', addEventListener() {}, querySelectorAll() { return []; } }, Object.getOwnPropertyDescriptors(options.document || {})),
  window: { addEventListener() {}, ...options.window },
 });
 vm.runInContext(source.replace(/^export /gm, ''), context);
 const ui = context.createHabitUI({
  escapeHTML: text => String(text).replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;'),
  icon: () => '', state, toast: (...args) => toasts.push(args), findHabit: id => habit.id === id ? habit : null,
  api: async (...args) => { calls.push(args);if (options.api) return options.api(...args); },
  loadPersonal: async () => { loads.push(true);await options.loadPersonal?.(); }, outbox: () => ({
   pendingHabits: async () => options.pending || [], addHabit: async (...args) => queued.push(args), pump() {},
  }),
  ...options.ctx,
 });
 const button = date => ({ dataset: { habitQuick: habit.id, ...(date ? { habitDate: date } : {}) }, isConnected: true, disabled: false, addEventListener(_, handler) { this.click = handler; } });
 const bind = buttons => ui.bind({ querySelectorAll: selector => selector === '[data-habit-quick]' ? buttons : [] });
 return { ui, state, calls, toasts, queued, loads, button, bind };
}
const quickHabit = (mode = 'quit') => ({ id: 'h1', title: 'Не смотреть YouTube Shorts', today: '2026-09-14', startDate: '2026-09-08', revision: 3, rule: { mode, target: mode === 'quit' ? 0 : 1, cadence: 'daily', unit: 'раз' }, days: [{ date: '2026-09-13', state: 'pending', editable: true, rule: { mode } }, { date: '2026-09-14', state: 'pending', editable: true, rule: { mode } }] });

test('today cards offer one check-in while keeping previous dates behind explicit history', () => {
 const habit = quickHabit();habit.days[0].state = 'success';habit.days[0].checkin = { state: 'measured', value: 0 };
 const { ui } = uiHarness(habit);
 for (const compact of [true, false]) {
  const html = ui.renderRow(habit, compact);
  assert.match(html, /data-habit-date="2026-09-14" data-habit-quick="h1"/);
  assert.equal((html.match(/data-habit-date=/g) || []).length, 1);
  assert.doesNotMatch(html, /habit-entry-week|data-habit-date="2026-09-13"/);
  assert.match(html, /Сегодня<\/span><strong>Ещё не отмечено/);
  assert.match(html, /habit-entry-history[^>]*data-habit-open="h1"/);
  assert.doesNotMatch(html, /<form|<textarea|<input/);
 }
 habit.days[1] = { ...habit.days[1], state: 'success', checkin: { state: 'measured', value: 0 } };
 const done = ui.renderRow(habit, true);
 assert.doesNotMatch(done, /data-habit-quick/);
 assert.match(done, /data-habit-date="2026-09-14" data-habit-day="h1"/);
 assert.match(done, /Изменить отметку/);
 assert.match(done, /День без действия/);
});

test('today count follows each habit local date and counts only explicitly successful current days', async () => {
 const { habitTodaySummary } = await load();
 const habit = quickHabit();
 habit.currentStreak = 100;habit.days[0].state = 'success';habit.days[1].planned = true;
 const completed = { ...quickHabit('build'), today: '2026-09-13', days: [{ date: '2026-09-13', planned: true, state: 'success' }] };
 const recordedExtra = { ...quickHabit('reduce'), days: [{ date: '2026-09-14', planned: false, state: 'success', checkin: { state: 'measured', value: 0 } }] };
 const partial = { ...quickHabit('duration'), days: [{ date: '2026-09-14', planned: true, state: 'partial', checkin: { state: 'measured', value: 10 } }] };
 assert.deepEqual(habitTodaySummary([habit, completed, recordedExtra, partial]), { scheduled: 4, done: 2, label: '2 из 4 сегодня' });
 assert.deepEqual(habitTodaySummary([
  { ...completed, archivedAt: '2026-09-14' }, { ...completed, paused: true },
  { ...habit, days: [habit.days[0]] }, { ...habit, days: [{ date: habit.today, planned: false, state: 'rest' }] },
 ]), { scheduled: 0, done: 0, label: 'Нет на сегодня' });
 for (const state of ['pending', 'skipped', 'snoozed', 'failed', 'partial']) {
  assert.deepEqual(habitTodaySummary([{ ...habit, days: [{ date: habit.today, planned: true, state }] }]), { scheduled: 1, done: 0, label: '0 из 1 сегодня' });
 }
});

test('current numeric progress preserves measured zero and fractions but does not invent a value for failure', () => {
 const habit = quickHabit('reduce');habit.rule.unit = 'мин';
 const { ui } = uiHarness(habit);
 for (const value of [0, 10.5]) {
  habit.days[1] = { ...habit.days[1], rule: habit.rule, state: 'partial', checkin: { state: 'measured', value } };
  const html = ui.renderRow(habit, true);
  assert.match(html, new RegExp(`habit-entry-measure">${value} мин`));
  assert.match(html, /Изменить отметку/);
  assert.doesNotMatch(html, /data-habit-quick/);
 }
 habit.days[1].checkin = { state: 'failed', value: 0 };
 assert.doesNotMatch(ui.renderRow(habit), /habit-entry-measure/);
 habit.days[1] = { ...habit.days[1], state: 'rest', editable: false, checkin: null };
 const rest = ui.renderRow(habit);
 assert.match(rest, /Отдых/);assert.doesNotMatch(rest, /data-habit-quick|data-habit-day=/);assert.match(rest, /habit-entry-history/);
});

test('history button opens the full current-month tracker without writing or forcing a day editor', async () => {
 const dialog = { open: false }, content = { innerHTML: '', querySelector: () => null }, flushed = [];
 let finish;
 const h = uiHarness(quickHabit(), {
  document: { querySelector: selector => selector === '#personal-dialog' ? dialog : content },
  api: () => new Promise(resolve => { finish = resolve; }),
  ctx: { flushDrafts: value => flushed.push(value), openModal: value => { value.open = true; } },
 });
 const history = { dataset: { habitOpen: 'h1' }, addEventListener(_, listener) { this.click = listener; } };
 h.ui.bind({ querySelectorAll: selector => selector === '[data-habit-open]' ? [history] : [] });
 const opening = history.click();
 assert.equal(dialog.open, true);assert.equal(flushed[0], dialog);
 assert.equal(h.calls[0][0], '/api/personal/habits/h1/tracker?from=2026-09-01&to=2026-09-30');
 assert.equal(h.calls[0][1], undefined);assert.match(content.innerHTML, /Открываем трекер/);
 dialog.open = false;finish({});await opening;
 assert.equal(h.calls.length, 1);assert.equal(h.queued.length, 0);
});

test('direct check-ins use historical rules, preserve notes and never overwrite saved outcomes', async () => {
 const { habitQuickPayload } = await load();
 const habit = quickHabit('quantity');
 const day = { date: '2026-09-13', rule: { mode: 'quit' }, state: 'snoozed', editable: true, checkin: { note: 'Оставить заметку', updatedAt: 'v2' } };
 assert.deepEqual(habitQuickPayload(habit, day), { state: 'measured', value: 0, note: 'Оставить заметку', expectedUpdatedAt: 'v2', revision: 3 });
 for (const state of ['success', 'failed', 'skipped', 'rest', 'future', 'paused', 'partial']) assert.equal(habitQuickPayload(habit, { ...day, state }), null);
 assert.equal(habitQuickPayload(habit, { ...day, editable: false }), null);
 assert.equal(habitQuickPayload(habit, { ...day, rule: { mode: 'reduce' } }), null);
 assert.equal(habitQuickPayload(habit, { ...day, rule: { mode: 'duration' } }), null);
});

test('one click saves a clean anti-habit day or ordinary completion without prompting for text', async () => {
 for (const [mode, value] of [['quit', 0], ['build', 1]]) {
  const h = uiHarness(quickHabit(mode)), button = h.button('2026-09-13');h.bind([button]);
  await button.click();
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0][0], '/api/personal/habits/h1/checkins/2026-09-13');
  assert.deepEqual(JSON.parse(h.calls[0][1].body), { state: 'measured', value, note: '', expectedUpdatedAt: '', revision: 3 });
  assert.equal(h.calls[0][1].headers['X-Outbox-Owner'], 'owner');
  assert.equal(h.loads.length, 1);
  assert.equal(button.disabled, false);
 }
});

test('two controls for the same day share one in-flight save and recover after an error', async () => {
 let finish;
 const h = uiHarness(quickHabit(), { api: () => new Promise((resolve, reject) => { finish = reject; }) });
 const a = h.button(), b = h.button('2026-09-14');h.bind([a, b]);
 const saving = a.click();await new Promise(setImmediate);await b.click();
 assert.equal(h.calls.length, 1);
 finish(new Error('Проверка ошибки'));await saving;
 assert.equal(a.disabled, false);assert.equal(h.loads.length, 0);assert.equal(h.toasts.at(-1)[0], 'Проверка ошибки');
 const retry = b.click();await new Promise(setImmediate);assert.equal(h.calls.length, 2);finish(new Error('Повтор'));await retry;
});

test('offline check-in retains measured zero and an already queued day is not duplicated', async () => {
 const h = uiHarness(quickHabit(), { online: false }), button = h.button();h.bind([button]);await button.click();
 assert.equal(h.calls.length, 0);assert.equal(h.queued.length, 1);assert.equal(h.queued[0][2].value, 0);assert.equal(h.queued[0][2].note, '');
 const waiting = uiHarness(quickHabit(), { pending: [{ habit: 'h1', date: '2026-09-14' }] }), retry = waiting.button();waiting.bind([retry]);await retry.click();
 assert.equal(waiting.calls.length, 0);assert.equal(waiting.queued.length, 0);assert.match(waiting.toasts[0][0], /уже ждёт отправки/);
});

test('late success after an account change does not refresh or notify another account', async () => {
 let finish;
 const h = uiHarness(quickHabit(), { api: () => new Promise(resolve => { finish = resolve; }) }), button = h.button();h.bind([button]);
 const saving = button.click();await new Promise(setImmediate);h.state.me = { id: 'other' };finish();await saving;
 assert.equal(h.loads.length, 0);assert.equal(h.toasts.length, 0);
});

test('quantity and time prompts describe the value rather than asking for a fact', async () => {
 const { habitMeasureLabel } = await load();
 assert.equal(habitMeasureLabel({ mode: 'duration', unit: 'мин' }), 'Сколько минут за день?');
 assert.equal(habitMeasureLabel({ mode: 'reduce', unit: 'мин' }), 'Сколько за день, мин?');
 assert.equal(habitMeasureLabel({ mode: 'quantity', unit: 'л' }), 'Количество за день, л');
});

test('unknown failure or skip does not invent zero in the measurement editor', async () => {
 const { habitMeasuredValue } = await load();
 for (const state of ['failed', 'skipped', 'snoozed']) assert.equal(habitMeasuredValue({ state, value: 0 }), '');
 assert.equal(habitMeasuredValue(null), '');
 assert.equal(habitMeasuredValue({ state: 'measured', value: 0 }), 0);
 assert.equal(habitMeasuredValue({ state: 'measured', value: 2.5 }), 2.5);
 assert.equal(habitMeasuredValue({ state: 'measured', value: NaN }), '');
});

test('the time habit list action asks for time rather than quantity', () => {
 const habit = quickHabit('duration');habit.rule.unit = 'мин';
 const { ui } = uiHarness(habit), html = ui.renderRow(habit);
 assert.match(html, />Указать время<\/button>/);
 assert.doesNotMatch(html, /Указать количество/);
});

function positionHarness({ rowShift = 0, delay = false } = {}) {
 const oldLedger = { scrollTop: 240 }, nextLedger = { scrollTop: 0 }, scrolls = [], focus = [], listeners = new Map();
 let rendered = false, finish;
 const nextButton = { dataset: { habitDate: '2026-09-14' }, focus: value => focus.push(value) };
 const oldRow = { dataset: { habitRow: 'h1' }, getBoundingClientRect: () => ({ top: 1000 - oldLedger.scrollTop - 600 }), closest: () => oldLedger };
 const nextRow = { dataset: { habitRow: 'h1' }, getBoundingClientRect: () => ({ top: 1000 + rowShift - nextLedger.scrollTop - 600 }), closest: () => nextLedger, querySelectorAll: () => [nextButton] };
 const document = { get activeElement() { return button; }, querySelectorAll: selector => selector === '[data-habit-row]' ? [rendered ? nextRow : oldRow] : [] };
 const h = uiHarness(quickHabit(), {
  document, window: {
   addEventListener: (type, listener) => listeners.set(type, listener),
   removeEventListener: (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); },
   scrollBy: value => scrolls.push(value),
  },
  api: delay ? () => new Promise(resolve => { finish = resolve; }) : undefined,
  loadPersonal: () => { rendered = true; },
 });
 const button = h.button('2026-09-14');button.closest = () => oldRow;h.bind([button]);
 return { ...h, button, oldLedger, nextLedger, scrolls, focus, listeners, finish: () => finish() };
}

test('a desktop check-in restores its replaced ledger before applying any page reflow', async () => {
 const h = positionHarness();await h.button.click();
 assert.equal(h.loads.length, 1);
 assert.equal(h.nextLedger.scrollTop, 240, 'the replacement must reveal the original row');
 assert.equal(h.scrolls.length, 0, 'the list scroll must not be incorrectly applied to the window');
 assert.equal(h.focus.length, 1);assert.equal(h.focus[0].preventScroll, true);
 for (const event of ['wheel', 'touchmove', 'keydown', 'resize']) assert.equal(h.listeners.has(event), false, 'temporary listeners must be removed');
});

test('page anchoring handles residual reflow after the desktop ledger position is restored', async () => {
 const h = positionHarness({ rowShift: 32 });await h.button.click();
 assert.equal(h.nextLedger.scrollTop, 240);
 assert.equal(h.scrolls.length, 1);assert.equal(h.scrolls[0].top, 32);assert.equal(h.scrolls[0].behavior, 'instant');
});

test('deliberate scrolling or navigation cancels both ledger and window restoration', async () => {
 for (const interruption of ['wheel', 'touchmove', 'keydown', 'resize', 'navigation']) {
  const h = positionHarness({ delay: true }), saving = h.button.click();await new Promise(setImmediate);
  if (interruption === 'navigation') h.state.personalTab = 'notes';
  else h.listeners.get(interruption)({ type: interruption, key: 'PageDown' });
  h.finish();await saving;
  assert.equal(h.nextLedger.scrollTop, 0, interruption);
  assert.equal(h.scrolls.length, 0, interruption);assert.equal(h.focus.length, 0, interruption);
  for (const event of ['wheel', 'touchmove', 'keydown', 'resize']) assert.equal(h.listeners.has(event), false);
 }
});
