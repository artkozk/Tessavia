export const habitModes = { build: 'Выполнять действие', quantity: 'Набирать количество', duration: 'Уделять время', quit: 'Отказаться', reduce: 'Сокращать' };
export const habitStates = { success: 'Выполнено', failed: 'Не выполнено', partial: 'Частично', pending: 'Нет отметки', skipped: 'Осознанный пропуск', snoozed: 'Позже сегодня', paused: 'Пауза', rest: 'Отдых', future: 'Впереди', moved: 'Перенесено' };
const weekdays = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const symbols = { success: '✓', failed: '×', partial: '◐', pending: '·', skipped: '—', snoozed: '◷', paused: 'Ⅱ', rest: '·', future: '·', moved: '↗' };
const iso = d => d.toISOString().slice(0, 10);
export function shiftHabitDate(value, days) { const d = new Date(`${value}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + days); return iso(d); }
export function habitRange(today, period, offset = 0) {
  const d = new Date(`${today}T12:00:00Z`);
  if (period === 'month') { d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + offset); const from = iso(d); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return { from, to: iso(d) }; }
  const count = period === 'week' ? 7 : 84;
  const to = shiftHabitDate(today, offset * count); return { from: shiftHabitDate(to, 1 - count), to };
}
export function habitStateLabel(day) {
  if (day.rule?.mode === 'quit') return day.state === 'success' ? 'День без действия' : day.state === 'failed' ? 'Был срыв' : habitStates[day.state];
  if (day.rule?.mode === 'reduce') return day.state === 'success' ? 'В пределах лимита' : day.state === 'failed' ? 'Лимит превышен' : habitStates[day.state];
  return habitStates[day.state] || day.state;
}
export function habitScheduleLabel(rule) {
  if (rule.cadence === 'weekdays') return (rule.weekdays || []).map(d => weekdays[d]).join(', ');
  if (rule.cadence === 'interval') return `Каждые ${rule.interval} дн.`;
  if (rule.cadence === 'weekly' || rule.cadence === 'monthly') return `${rule.periodTarget} ${rule.periodMeasure === 'days' ? 'успешных дней' : rule.unit} за ${rule.cadence === 'weekly' ? 'неделю' : 'месяц'}`;
  return 'Каждый день';
}

// Keep dates aligned even when a habit was created fewer than seven days ago.
// A placeholder is not a missed check-in and cannot be edited.
export function habitWeekDays(habit) {
  const days = new Map((habit.days || []).map(day => [day.date, day]));
  return Array.from({ length: 7 }, (_, index) => {
    const date = shiftHabitDate(habit.today, index - 6);
    return days.get(date) || { date, state: 'unavailable', beforeStart: date < habit.startDate };
  });
}

export function createHabitUI(ctx) {
  const { escapeHTML: e, icon, api, state, toast, loadPersonal, openModal, closeDialog, bindDraft, clearDraft, flushDrafts, findHabit, openLinks } = ctx;
  let filter = 'today', account = null, request = 0;
  const dialog = () => document.querySelector('#personal-dialog');
  const content = () => document.querySelector('#personal-dialog-content');
  const dateLabel = date => new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
  const option = (value, label, current) => `<option value="${e(value)}" ${value === current ? 'selected' : ''}>${e(label)}</option>`;
  const goalLabel = r => r.mode === 'quit' ? 'Без действия · 0' : r.mode === 'reduce' ? `Не больше ${r.target} ${r.unit}` : `${r.target} ${r.unit}`;
  const syncAccount = () => { if (account !== state.me?.id) { filter = 'today'; account = state.me?.id; request++; } };
  async function saveMeasurement(h, date, payload) {
    const owner = state.me.id;
    try {
      if (!navigator.onLine) throw Object.assign(new Error('Нет сети'), { code: 'NETWORK_UNAVAILABLE' });
      await api(`/api/personal/habits/${h.id}/checkins/${date}`, { method: 'PUT', body: JSON.stringify(payload), headers: { 'X-Outbox-Owner': String(owner) } });
      return false;
    } catch (error) {
      if (!['NETWORK_UNAVAILABLE', 'REQUEST_TIMEOUT'].includes(error.code) && ![502,503,504].includes(error.status)) throw error;
      await ctx.outbox().addHabit(h.id, date, payload, owner, `${h.title} · ${date}`);
      void ctx.outbox().pump();
      return true;
    }
  }
  async function pendingBadges() {
    const owner = state.me?.id;if (!owner || !ctx.outbox()) return;
    try {
      const items = await ctx.outbox().pendingHabits(owner);if (owner !== state.me?.id) return;
      document.querySelectorAll('[data-habit-pending]').forEach(el => {
        const pending = items.filter(item => item.habit === el.dataset.habitPending);
        el.textContent = pending.length ? `${pending.length} результатов в очереди отправки` : '';
        el.hidden = !pending.length;
      });
    } catch (_) { /* The queue reports local storage errors when saving. */ }
  }
  let refreshingDay = false;
  function refreshDay() {
    if (!state.me?.id || document.visibilityState !== 'visible') return;
    const staleDay = (state.personal?.habits || []).some(h => new Intl.DateTimeFormat('en-CA',{timeZone:h.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()) !== h.today);
    if (staleDay && !refreshingDay && navigator.onLine) { refreshingDay = true;void loadPersonal({force:true}).finally(() => {refreshingDay=false;}); }
  }
  setInterval(refreshDay, 60000);document.addEventListener('visibilitychange',refreshDay);
  window.addEventListener('tessavie-outbox-change' , () => { void pendingBadges(); });
  function renderRow(h, compact = false) {
    const today = h.days?.find(d => d.date === h.today), r = h.rule || {};
    const quick = today?.editable && ['pending', 'snoozed', 'partial'].includes(today.state);
    const subtitle = [r.mode === 'quit' ? 'Отказ' : r.mode !== 'build' ? goalLabel(r) : '', habitScheduleLabel(r)].filter(Boolean).join(' · ');
    const status = h.archivedAt ? 'В архиве' : h.paused ? 'На паузе' : today ? habitStateLabel(today) : 'Вне расписания';
    return `<article class="habit-entry ${compact ? 'compact' : ''}" data-habit-color="${e(h.colorKey)}">
      <div class="habit-entry-main"><span class="habit-emblem" aria-hidden="true">${icon(h.iconKey || 'checkSquare')}</span><div><button class="habit-entry-title" type="button" data-habit-open="${h.id}" title="${e(h.title)}">${e(h.title)}</button><p class="habit-entry-meta">${e(subtitle)}${h.currentStreak ? `<span title="Текущая серия: ${h.currentStreak} ${e(h.summary?.streakUnit || 'плановых дней')}"> · Серия ${h.currentStreak}</span>` : ''}</p><p class="habit-entry-pending" data-habit-pending="${h.id}" role="status" hidden></p></div></div>
      <div class="habit-entry-week" role="group" aria-label="Последние семь дней: ${e(h.title)}">${habitWeekDays(h).map(d => {
        const label = d.state === 'unavailable' ? d.beforeStart ? 'До начала привычки' : 'Нет данных за дату' : habitStateLabel(d);
        return `<button type="button" class="habit-cell is-${d.state} ${d.date === h.today ? 'is-today' : ''}" ${d.state === 'unavailable' ? 'disabled' : `data-habit-date="${d.date}" data-habit-open="${h.id}"`} aria-label="${e(dateLabel(d.date))}: ${e(label)}" ${d.date === h.today ? 'aria-current="date"' : ''} title="${e(dateLabel(d.date))}: ${e(label)}"><small>${weekdays[new Date(`${d.date}T12:00:00Z`).getUTCDay()]}</small><span class="habit-cell-mark" aria-hidden="true">${symbols[d.state] || '—'}</span></button>`;
      }).join('')}</div>
      <div class="habit-entry-action"><span class="habit-entry-status ${today?.state === 'success' ? 'is-done' : ''}">${e(status)}</span>${quick && (r.mode === 'build' || r.mode === 'quit') ? `<button type="button" class="secondary" data-habit-quick="${h.id}">${r.mode === 'quit' ? 'Без действия' : 'Отметить'}</button>` : `<button type="button" class="text-button" data-habit-open="${h.id}" data-habit-date="${h.today}">${today?.editable ? today.checkin ? 'Изменить' : 'Записать' : 'Трекер'}</button>`}</div>
      <button type="button" class="icon-button habit-entry-settings" data-habit-settings="${h.id}" aria-label="Настроить привычку ${e(h.title)}">${icon('settings')}</button>
    </article>`;
  }
  function renderList(habits) {
    syncAccount();
    const shown = habits.filter(h => filter === 'archive' ? h.archivedAt : !h.archivedAt && (filter === 'all' || filter === 'paused' && h.paused || filter === 'anti' && ['quit', 'reduce'].includes(h.rule.mode) || filter === 'build' && !['quit', 'reduce'].includes(h.rule.mode) || filter === 'today' && h.days?.some(d => d.date === h.today && d.planned)));
    return `<section class="personal-section habit-section"><div class="section-heading"><div class="habit-section-title"><h2>Привычки</h2><span class="habit-count" aria-label="Привычек в списке: ${shown.length}">${shown.length}</span></div><button type="button" class="text-button" data-habit-new>${icon('plus')} Добавить</button></div><div class="habit-filters" role="group" aria-label="Фильтр привычек">${[['today', 'Сегодня'], ['all', 'Все'], ['build', 'Делать'], ['anti', 'Отказ и сокращение'], ['paused', 'Пауза'], ['archive', 'Архив']].map(([value, label]) => `<button type="button" aria-pressed="${filter === value}" data-habit-filter="${value}">${label}</button>`).join('')}</div><div class="habit-ledger" role="region" aria-label="Список привычек" tabindex="0">${shown.map(h => renderRow(h)).join('') || '<div class="personal-empty"><strong>Здесь пока нет привычек</strong><p>Выберите другой фильтр или добавьте свою привычку.</p><button type="button" class="text-button" data-habit-new>Добавить привычку</button></div>'}</div><p class="habit-list-hint">Семь последних дней. Нажмите на день, чтобы посмотреть или изменить отметку.</p></section>`;
  }
  function bind(root = document) {
    void pendingBadges();refreshDay();
    root.querySelectorAll('[data-habit-new]').forEach(b => b.addEventListener('click', () => settings()));
    root.querySelectorAll('[data-habit-open]').forEach(b => b.addEventListener('click', () => open(b.dataset.habitOpen, b.dataset.habitDate)));
    root.querySelectorAll('[data-habit-settings]').forEach(b => b.addEventListener('click', () => settings(findHabit(b.dataset.habitSettings))));
    root.querySelectorAll('[data-habit-filter]').forEach(b => b.addEventListener('click', () => { filter = b.dataset.habitFilter; ctx.renderPersonal(); }));
    root.querySelectorAll('[data-habit-quick]').forEach(b => b.addEventListener('click', async () => {
      const h = findHabit(b.dataset.habitQuick), day = h.days.find(d => d.date === h.today); b.disabled = true;
      try { const queued = await saveMeasurement(h, h.today, { state: 'measured', value: h.rule.mode === 'quit' ? 0 : h.rule.target, note: day.checkin?.note || '', expectedUpdatedAt: day.checkin?.updatedAt || '', revision: h.revision }); if (queued) { toast('Результат сохранён в браузере и ждёт отправки');void pendingBadges(); } else await loadPersonal({ force: true }); }
      catch (error) { toast(error.message, true); b.disabled = false; }
    }));
  }
  function header(title, subtitle = 'Только для вас') {
    return `<div class="dialog-header"><div><p class="eyebrow">${e(subtitle)}</p><h2>${e(title)}</h2></div><button type="button" class="icon-button" data-habit-close aria-label="Закрыть">${icon('x')}</button></div>`;
  }
  function show(html) {
    flushDrafts(dialog()); content().innerHTML = html;
    content().querySelector('[data-habit-close]')?.addEventListener('click', () => closeDialog(dialog()));
    if (!dialog().open) openModal(dialog());
  }
  async function open(id, selectedDate = '', period = 'month', offset = 0) {
    syncAccount(); const owner = account, seq = ++request, known = findHabit(id);
    if (!known) return;
    const range = habitRange(known.today, period, offset);
    show(`${header(known.title)}<p role="status">Открываем трекер…</p>`);
    try {
      const data = await api(`/api/personal/habits/${id}/tracker?from=${range.from}&to=${range.to}`);
      if (owner !== state.me?.id || seq !== request || !dialog().open) return;
      drawTracker(data, selectedDate, period, offset);
    } catch (error) { if (seq === request && owner === state.me?.id) { content().querySelector('[role="status"]').textContent = error.message; } }
  }
  function drawTracker(data, selectedDate, period, offset) {
    const h = data.habit, s = data.summary;
    const days = new Map(data.days.map(d => [d.date, d]));
    const calendar = []; let date = data.from;
    while (date <= data.to) { calendar.push(days.get(date) || { date, state: date < h.startDate ? 'rest' : 'future', rule: h.rule }); date = shiftHabitDate(date, 1); }
    const padding = (new Date(`${data.from}T12:00:00Z`).getUTCDay() + 6) % 7;
    const quota = ['weekly', 'monthly'].includes(h.rule.cadence);
    show(`${header(h.title, `${habitModes[h.rule.mode]} · ${h.timezone}`)}<div class="habit-tracker"><div class="habit-tracker-intro"><p>${e(h.description || goalLabel(h.rule))}</p><button type="button" class="secondary" data-settings>${icon('settings')} Настройки</button>${h.archivedAt ? '' : '<button type="button" class="text-button" data-habit-reminder>Напоминание</button>'}<button type="button" class="text-button" data-links>${icon('link')} Связать с целью</button></div><div class="habit-tracker-controls"><label>Период<select data-period>${[['week', 'Неделя'], ['month', 'Месяц'], ['quarter', '12 недель']].map(([v, t]) => option(v, t, period)).join('')}</select></label><div class="habit-period-navigation"><button type="button" class="icon-button" data-back aria-label="Предыдущий период">${icon('chevronLeft')}</button><strong>${e(dateLabel(data.from))} — ${e(dateLabel(data.to))}</strong><button type="button" class="icon-button" data-forward aria-label="Следующий период" ${offset >= 0 ? 'disabled' : ''}>${icon('chevronRight')}</button></div><button type="button" class="icon-button" data-now aria-label="К текущему периоду" title="К текущему периоду">${icon('calendar')}</button></div><div class="habit-stats" aria-label="Статистика привычки"><div><span>Выполнение</span><strong>${s.percent == null ? '—' : `${s.percent}%`}</strong></div><div><span>Текущая серия</span><strong>${s.currentStreak}</strong></div><div><span>Лучшая серия</span><strong>${s.bestStreak}</strong></div></div><p class="habit-stats-caption">${e(s.streakUnit)} · ${quota ? 'выполнение по завершённым периодам' : 'выполнение по прошедшим плановым дням'}</p>${['quit', 'reduce', 'quantity', 'duration'].includes(h.rule.mode) ? `<p class="habit-measure-summary">Факт за период: <b>${s.total} ${e(h.rule.unit)}</b>${['quit', 'reduce'].includes(h.rule.mode) ? ` · ${h.rule.mode === 'quit' ? 'Дней без действия' : 'Дней в пределах лимита'}: ${s.success} · ${h.rule.mode === 'quit' ? 'Дней со срывом' : 'Превышений'}: ${s.failed}${s.lastLapse ? ` · Последний случай: ${e(dateLabel(s.lastLapse))}` : ''}` : ''}</p>` : ''}${data.periods.length ? `<div class="habit-periods">${data.periods.map(p => `<div><span>${e(dateLabel(p.start))} — ${e(dateLabel(p.end))}</span><strong>${p.actual} / ${p.target} ${e(p.measure === 'days' ? 'дней' : h.rule.unit)}</strong><small>${p.state === 'success' ? 'Цель достигнута' : p.state === 'failed' ? 'Период завершён ниже цели' : p.state === 'rest' ? 'Нет плана' : 'Период продолжается'}</small></div>`).join('')}</div>` : ''}<div class="habit-calendar" aria-label="Календарь привычки">${[1, 2, 3, 4, 5, 6, 0].map(i => `<span class="habit-calendar-weekday">${weekdays[i]}</span>`).join('')}${'<span></span>'.repeat(padding)}${calendar.map(d => `<button type="button" class="habit-calendar-day is-${d.state} ${d.date === h.today ? 'is-today' : ''}" data-day="${d.date}" aria-label="${e(dateLabel(d.date))}: ${e(habitStateLabel(d))}"><span>${Number(d.date.slice(-2))}</span><b>${symbols[d.state]}</b>${d.checkin && d.checkin.state === 'measured' ? `<small>${d.checkin.value}</small>` : ''}${d.checkin?.note ? '<i aria-label="Есть заметка">•</i>' : ''}</button>`).join('')}</div><details class="habit-details habit-stat-details"><summary>Обозначения и подробная статистика</summary><div class="habit-legend">${['success', 'partial', 'failed', 'pending', 'skipped', 'paused', 'moved'].map(k => `<span><b class="is-${k}">${symbols[k]}</b>${e(habitStateLabel({ state: k, rule: h.rule }))}</span>`).join('')}</div><p>${s.success} успешно · ${s.partial} частично · ${s.failed} не выполнено<br>${s.unmarked} без отметки · ${s.skipped} пропущено · ${s.paused} на паузе</p><p class="personal-muted">Будущее, отдых и пропуски исключены из процента. Незавершённый сегодня день ждёт результата. Серии учитывают историю текущего ритма.</p></details><div data-day-editor></div><details class="habit-details"><summary>Ритм по дням недели</summary><div class="habit-weekday-stats">${[1, 2, 3, 4, 5, 6, 0].map(i => `<span><strong>${weekdays[i]}</strong>${s.weekdays[i].success} / ${s.weekdays[i].planned}<small>${s.weekdays[i].planned ? `${Math.round(s.weekdays[i].success / s.weekdays[i].planned * 100)}%` : 'Нет данных'}</small></span>`).join('')}</div><p class="personal-muted">Успешные / прошедшие плановые дни. Малое количество наблюдений ещё не показывает устойчивый ритм.</p></details><details class="habit-details"><summary>История целей и пауз</summary><p><a class="text-button" href="/api/personal/habits/${h.id}/export" download>Скачать личную историю (JSON)</a></p>${h.rules.map(r => `<p>С ${e(dateLabel(r.effectiveDate))}: ${e(goalLabel(r))} · ${e(habitScheduleLabel(r))}${r.endDate ? ` · до ${e(dateLabel(r.endDate))}` : ''}</p>`).join('')}${h.pauses.filter(p => !p.endDate || p.endDate >= p.startDate).map(p => `<p>${p.reason === 'archive' ? 'Архив' : 'Пауза'}: ${e(dateLabel(p.startDate))} — ${p.endDate ? e(dateLabel(p.endDate)) : 'до возобновления'}</p>`).join('')}</details><div class="habit-lifecycle">${h.archivedAt ? '<button type="button" class="primary" data-lifecycle="restore">Восстановить привычку</button>' : `${h.paused ? '<button type="button" class="secondary" data-lifecycle="resume">Возобновить сегодня</button>' : '<label>Пауза до (необязательно)<input type="date" data-pause-end></label><button type="button" class="secondary" data-lifecycle="pause">Поставить на паузу</button>'}<button type="button" class="danger-text" data-lifecycle="archive">В архив</button>`}</div></div>`);
    const root = content();
    root.querySelector('[data-settings]').addEventListener('click', () => settings(h));
    root.querySelector('[data-habit-reminder]')?.addEventListener('click', () => ctx.openReminder(h.id));
    root.querySelector('[data-links]').addEventListener('click', async () => { if (await closeDialog(dialog())) openLinks('habit', h.id, h.title); });
    root.querySelector('[data-period]').addEventListener('change', event => open(h.id, '', event.target.value, 0));
    root.querySelector('[data-back]').addEventListener('click', () => open(h.id, '', period, offset - 1));
    root.querySelector('[data-forward]').addEventListener('click', () => open(h.id, '', period, offset + 1));
    root.querySelector('[data-now]').addEventListener('click', () => open(h.id, h.today, period, 0));
    const edit = value => { const d = days.get(value); if (d) dayEditor(h, d, () => open(h.id, value, period, offset)); else root.querySelector('[data-day-editor]').innerHTML = '<p class="personal-muted">Дата вне периода привычки.</p>'; root.querySelector('[data-day-editor]').scrollIntoView({block:'nearest'}); };
    root.querySelectorAll('[data-day]').forEach(b => b.addEventListener('click', () => edit(b.dataset.day)));
    root.querySelectorAll('[data-lifecycle]').forEach(b => b.addEventListener('click', async () => {
      b.disabled = true;const action = b.dataset.lifecycle;
      try { await api(`/api/personal/habits/${h.id}${action === 'archive' ? '' : `/${action}`}`, { method: action === 'archive' ? 'DELETE' : 'POST', body: JSON.stringify({ revision: h.revision, endDate: action === 'pause' ? root.querySelector('[data-pause-end]').value : '' }) }); await loadPersonal({ force: true }); await open(h.id, '', period, offset); }
      catch (error) { toast(error.message, true); b.disabled = false; }
    }));
    if (selectedDate && days.has(selectedDate)) edit(selectedDate);
  }
  function dayEditor(h, day, refresh) {
    flushDrafts(dialog());
    const root = content().querySelector('[data-day-editor]'), r = day.rule, c = day.checkin;
    const moveAllowed = !h.archivedAt && !h.paused && day.date >= h.today && day.planned && !c && !['quit', 'reduce'].includes(r.mode) && !['weekly', 'monthly'].includes(r.cadence);
    if (!day.editable) { root.innerHTML = `<section class="habit-day-editor"><h3>${e(dateLabel(day.date))} · ${e(habitStateLabel(day))}</h3><p>${day.sourceDate ? `Связанная дата: ${e(dateLabel(day.sourceDate))}.` : 'Этот день не требует отметки.'}</p>${moveAllowed ? moveForm(day) : ''}</section>`;if (moveAllowed) bindMove(root, h, day, refresh);return; }
    root.innerHTML = `<form class="habit-day-editor"><h3>${e(dateLabel(day.date))}</h3><p>${e(goalLabel(r))}${day.sourceDate ? ` · перенесено с ${e(dateLabel(day.sourceDate))}` : ''}. Цель на эту дату сохранена в истории.</p><div class="form-grid two"><label>Результат<select name="state">${option('measured', r.mode === 'quit' ? 'Записать число случаев (0 — без действия)' : 'Записать факт', c?.state || 'measured')}${option('failed', r.mode === 'quit' ? 'Был срыв, количество неизвестно' : 'Не выполнено', c?.state)}${option('skipped', 'Осознанный пропуск', c?.state)}${day.date === h.today ? option('snoozed', 'Позже сегодня', c?.state) : ''}</select></label><label>Факт, ${e(r.unit)}<input type="number" name="value" min="0" max="1000000" step="any" value="${c?.value ?? (r.mode === 'quit' || r.mode === 'reduce' ? 0 : r.target)}" required></label></div><div class="habit-increments">${(r.unit === 'мин' ? [5, 15, 30] : [1, 2, 5]).map(n => `<button type="button" class="text-button" data-increment="${n}">+${n} ${e(r.unit)}</button>`).join('')}<span class="personal-muted">Добавить к показанному факту, затем сохранить</span></div><label>Заметка / причина пропуска<textarea name="note" maxlength="1000" rows="3" placeholder="Что помогло или помешало?">${e(c?.note || '')}</textarea></label><p class="form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Сохранить результат</button>${c ? '<button type="button" class="danger-text" data-clear>Убрать отметку</button>' : ''}</div></form>${moveAllowed ? moveForm(day) : ''}`;
    const form = root.querySelector('form');bindDraft(form, `habit-day:${state.me.id}:${h.id}:${day.date}`);
    const sync = () => { form.elements.value.disabled = form.elements.state.value !== 'measured'; form.querySelectorAll('[data-increment]').forEach(b => { b.disabled = form.elements.value.disabled; }); };
    form.elements.state.addEventListener('change', sync);sync();
    form.querySelectorAll('[data-increment]').forEach(b => b.addEventListener('click', () => { form.elements.value.value = Math.min(1000000, Math.round((Number(form.elements.value.value) + Number(b.dataset.increment)) * 1000000) / 1000000);form.elements.value.dispatchEvent(new Event('input', { bubbles: true })); }));
    let busy = false;
    const save = async deleting => {
      if (busy || !deleting && !form.reportValidity()) return;busy = true;form.inert = true;
      try {
        const payload = { value: Number(form.elements.value.value), state: form.elements.state.value, note: form.elements.note.value, expectedUpdatedAt: c?.updatedAt || '', revision: h.revision };
        if (deleting) await api(`/api/personal/habits/${h.id}/checkins/${day.date}`, { method: 'DELETE', body: JSON.stringify(payload) });
        else if (await saveMeasurement(h, day.date, payload)) {
          clearDraft(form);form.innerHTML = '<p role="status">Результат сохранён в этом браузере. Ожидает отправки; календарь изменится после подтверждения сервера.</p><button type="button" class="secondary" data-show-queue>Открыть очередь отправки</button>';
          form.dataset.habitWaiting = h.id;form.dataset.habitDate = day.date;
          form.habitRefresh = refresh;
          form.querySelector('[data-show-queue]').onclick = () => ctx.outbox().open();return;
        }
        clearDraft(form);await loadPersonal({ force: true });await refresh();
      }
      catch (error) { const alert = form.querySelector('[role="alert"]');alert.textContent = error.message;alert.hidden = false; }
      finally { busy = false;form.inert = false; }
    };
    form.addEventListener('submit', event => { event.preventDefault();void save(false); });
    form.querySelector('[data-clear]')?.addEventListener('click', () => save(true));
    if (moveAllowed) bindMove(root, h, day, refresh);
  }
  function moveForm(day) { return `<form class="habit-move-form"><label>Перенести на свободный день<input type="date" name="targetDate" min="${day.date}" required></label><button type="submit" class="secondary">Перенести</button><small>Исходный день освобождается; второй результат не начисляется.</small><p role="alert" hidden></p></form>`; }
  function bindMove(root, h, day, refresh) { const form = root.querySelector('.habit-move-form');form.addEventListener('submit', async event => { event.preventDefault();form.inert = true;try { await api(`/api/personal/habits/${h.id}/moves`, { method: 'POST', body: JSON.stringify({ sourceDate: day.date, targetDate: form.elements.targetDate.value, revision: h.revision }) });await loadPersonal({ force: true });await refresh(); } catch (error) { const alert = form.querySelector('[role="alert"]');alert.textContent = error.message;alert.hidden = false; } finally { form.inert = false; } }); }
  function settings(h = null) {
    syncAccount();request++;
    const tomorrow = shiftHabitDate(h?.today || iso(new Date()), 1);
    const r = h?.rules?.findLast(rule => rule.effectiveDate > h.today) || h?.rule || { mode: 'build', cadence: 'daily', target: 1, unit: 'раз', interval: 1, periodTarget: 3, periodMeasure: 'days', weekdays: [1, 2, 3, 4, 5], endDate: '' };
    const today = h?.today || new Intl.DateTimeFormat('en-CA', { timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone }).format(new Date());
    let effective = r.effectiveDate > today ? r.effectiveDate : tomorrow;
    if (r.cadence === 'weekly') { const d = new Date(`${effective}T12:00:00Z`);effective = shiftHabitDate(effective, (8 - d.getUTCDay()) % 7); }
    if (r.cadence === 'monthly') { const d = new Date(`${effective}T12:00:00Z`);if (d.getUTCDate() !== 1) {d.setUTCMonth(d.getUTCMonth() + 1, 1);effective = iso(d);} }
    show(`${header(h ? 'Настройки привычки' : 'Новая привычка')}<form class="habit-settings card-form"><label>Название<input name="title" maxlength="160" required value="${e(h?.title || '')}" placeholder="Например: читать, ходить пешком, меньше соцсетей"></label><label>Описание<textarea name="description" maxlength="5000" rows="2" placeholder="Зачем мне это и какое действие поможет?">${e(h?.description || '')}</textarea></label><div class="form-grid two"><label>Что отслеживаем<select name="mode" ${h ? 'disabled' : ''}>${Object.entries(habitModes).map(([v, t]) => option(v, t, r.mode)).join('')}</select></label><label>Цель / верхний лимит<input name="target" type="number" min="0" max="1000000" step="any" required value="${r.target}"></label><label>Единица<input name="unit" maxlength="32" required value="${e(r.unit)}" ${h ? 'readonly' : ''}></label><label>Расписание<select name="cadence">${[['daily', 'Каждый день'], ['weekdays', 'Выбранные дни недели'], ['interval', 'Каждые N дней'], ['weekly', 'Цель за неделю'], ['monthly', 'Цель за месяц']].map(([v, t]) => option(v, t, r.cadence)).join('')}</select></label></div><p class="personal-muted" data-mode-help></p><fieldset class="habit-weekday-picker" data-when="weekdays"><legend>Дни недели</legend>${[1, 2, 3, 4, 5, 6, 0].map(n => `<label><input type="checkbox" name="weekdays" value="${n}" ${r.weekdays?.includes(n) ? 'checked' : ''}>${weekdays[n]}</label>`).join('')}</fieldset><label data-when="interval">Интервал, дней<input name="interval" type="number" min="1" max="365" value="${r.interval}"></label><div class="form-grid two" data-when="period"><label>Цель за период<input name="periodTarget" type="number" min="0.01" max="1000000" step="any" value="${r.periodTarget}"></label><label>Как считать<select name="periodMeasure">${option('days', 'Успешные дни (день считается один раз)', r.periodMeasure)}${option('volume', 'Сумма количества / времени', r.periodMeasure)}</select></label></div><div class="form-grid two"><label>Первый день<input type="date" name="startDate" value="${e(h?.startDate || today)}" ${h ? 'disabled' : ''} required></label><label>Последний день (необязательно)<input type="date" name="endDate" value="${e(r.endDate || '')}"></label></div>${h ? `<label>Новая цель действует с<input type="date" name="effectiveDate" min="${tomorrow}" value="${effective}" required></label><p class="personal-muted">Прошлые даты сохраняют прежнюю цель. Для недельного/месячного ритма выберите начало следующего периода. Режим и единица измерения сохраняются.</p>` : `<label>Часовой пояс<input name="timezone" value="${e(Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow')}" required></label>`}${h ? '<button type="button" class="text-button" data-habit-reminder>Настроить напоминание</button><small class="personal-muted">Время меняется отдельно и сразу, без изменения цели.</small>' : `<label>Напоминать в<input type="time" name="reminderTime" value="${e(r.reminderTime || '')}"></label><small class="personal-muted">По часовому поясу привычки, во входящих Tessavie и на экране «Сегодня». Пустое поле — без напоминаний.</small>`}<div class="form-grid two"><label>Цвет<select name="colorKey">${[['green', 'Зелёный'], ['blue', 'Синий'], ['purple', 'Фиолетовый'], ['orange', 'Оранжевый'], ['pink', 'Розовый']].map(([v, t]) => option(v, t, h?.colorKey || 'green')).join('')}</select></label><label>Значок<select name="iconKey">${[['checkSquare', 'Отметка'], ['heart', 'Здоровье'], ['book', 'Чтение'], ['clock', 'Время'], ['activity', 'Движение'], ['target', 'Цель']].map(([v, t]) => option(v, t, h?.iconKey || 'checkSquare')).join('')}</select></label></div><p role="alert" class="form-error" hidden></p><div class="form-actions"><button type="submit" class="primary">${h ? 'Сохранить настройки' : 'Создать привычку'}</button>${h ? '<button type="button" class="secondary" data-return>К трекеру</button>' : ''}</div></form>`);
    const form = content().querySelector('form');bindDraft(form, `habit-settings:${state.me.id}:${h?.id || 'new'}`);
    const sync = () => {
      const mode = form.elements.mode.value, cadence = form.elements.cadence.value;
      form.querySelectorAll('[data-when]').forEach(el => { el.hidden = el.dataset.when === 'period' ? !['weekly', 'monthly'].includes(cadence) : el.dataset.when !== cadence;el.querySelectorAll('input,select').forEach(input => { input.disabled = el.hidden; }); });
      form.elements.target.readOnly = mode === 'quit' || mode === 'build';if (mode === 'quit') form.elements.target.value = 0;if (mode === 'build') form.elements.target.value = 1;
      form.querySelector('[data-mode-help]').textContent = mode === 'quit' ? 'Явно отмечайте день без действия или число случаев. Пустой день не станет автоматически успешным.' : mode === 'reduce' ? 'Записывайте фактическое количество, включая ноль. Успех — значение не выше лимита.' : mode === 'duration' ? 'Время хранится в минутах. Можно добавлять несколько подходов к итогу дня.' : 'Для количественной цели можно записывать дробный и частичный результат.';
    };
    form.elements.mode.addEventListener('change', () => { if (!h) form.elements.unit.value = form.elements.mode.value === 'duration' ? 'мин' : 'раз';sync(); });form.elements.cadence.addEventListener('change', sync);sync();
    form.querySelector('[data-return]')?.addEventListener('click', () => open(h.id));
    form.querySelector('[data-habit-reminder]')?.addEventListener('click', () => ctx.openReminder(h.id));
    const owner = state.me.id;let busy = false;
    form.addEventListener('submit', async event => {
      event.preventDefault();if (busy || !form.reportValidity()) return;
      const f = new FormData(form);const rule = { mode: h?.rule.mode || f.get('mode'), cadence: f.get('cadence'), target: Number(f.get('target')), unit: f.get('unit'), interval: Number(form.elements.interval.value), weekdays: [...form.querySelectorAll('[name="weekdays"]:checked')].map(input => Number(input.value)), periodTarget: Number(form.elements.periodTarget.value), periodMeasure: form.elements.periodMeasure.value, endDate: f.get('endDate'), reminderTime: h ? r.reminderTime || '' : f.get('reminderTime'), effectiveDate: f.get('effectiveDate') || '' };
      const payload = { title: f.get('title'), description: f.get('description'), colorKey: f.get('colorKey'), iconKey: f.get('iconKey'), timezone: h?.timezone || f.get('timezone'), startDate: h?.startDate || f.get('startDate'), rule, ...(h ? { revision: h.revision } : {}) };
      busy = true;form.inert = true;
      try { const result = await api(`/api/personal/habits${h ? `/${h.id}` : ''}`, { method: h ? 'PATCH' : 'POST', body: JSON.stringify(payload) });if (owner !== state.me?.id) return;clearDraft(form);await loadPersonal({ force: true });await open(result.id); }
      catch (error) { const alert = form.querySelector('[role="alert"]');alert.textContent = error.message;alert.hidden = false; }
      finally {busy = false;form.inert = false;}
    });
  }
  function confirmed(id,date) {
    const form = content().querySelector('[data-habit-waiting]');
    if (form?.dataset.habitWaiting !== id || form.dataset.habitDate !== date) return;
    form.querySelector('[role="status"]').textContent = 'Результат подтверждён сервером.';
    const button = form.querySelector('[data-show-queue]');button.textContent = 'Обновить календарь';button.onclick = () => form.habitRefresh();
  }
  return { renderRow, renderList, bind, open, settings, confirmed };
}
