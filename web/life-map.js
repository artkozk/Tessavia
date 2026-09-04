const DAY = 86400000;
const dateKey = value => value.toISOString().slice(0, 10);
export function civilDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && dateKey(date) === value ? date : null;
}
export function calendarMonth(start, offset) {
  const year = start.getUTCFullYear(), month = start.getUTCMonth() + offset;
  const first = new Date(start); first.setUTCDate(1); first.setUTCFullYear(year, month, 1);
  const last = new Date(first); last.setUTCMonth(last.getUTCMonth() + 1, 0);
  first.setUTCDate(Math.min(start.getUTCDate(), last.getUTCDate()));
  return first;
}
export function lifePeriods(birthDate, years, today, unit = 'months') {
  const birth = civilDate(birthDate), now = civilDate(today);
  if (!birth || !now || birth > now || !Number.isInteger(years) || years < 1 || years > 150) return null;
  const end = calendarMonth(birth, years * 12), totalDays = (end - birth) / DAY;
  const count = unit === 'weeks' ? Math.ceil(totalDays / 7) : years * 12;
  const periods = Array.from({ length: count }, (_, index) => {
    const start = unit === 'weeks' ? new Date(+birth + index * 7 * DAY) : calendarMonth(birth, index);
    const next = unit === 'weeks' ? new Date(Math.min(+end, +start + 7 * DAY)) : calendarMonth(birth, index + 1);
    return { index, start: dateKey(start), end: dateKey(next), days: (next - start) / DAY, state: now >= next ? 'past' : now >= start ? 'current' : 'future' };
  });
  const current = periods.findIndex(period => period.state === 'current');
  return { periods, current, completed: periods.filter(period => period.state === 'past').length, end: dateKey(end),
    elapsedDays: Math.min(totalDays, (now - birth) / DAY), totalDays, percent: Math.min(100, Math.max(0, (now - birth) / (end - birth) * 100)), passed: now >= end };
}

export function createLifeMapUI({ state, api, escapeHTML: esc, icon, localISODate, renderPersonal, toast, bindWorkingDraft, clearWorkingDraftFor }) {
  const views = new Map();
  function view() {
    if (!views.has(state.me.id)) views.set(state.me.id, { unit: 'months', page: null });
    return views.get(state.me.id);
  }
  function render(settings, compact = false) {
    const ui = view(), model = lifePeriods(settings.birthDate, settings.lifeExpectancyYears, localISODate(new Date()), ui.unit);
    const heading = `<div class="section-heading"><div><p class="eyebrow">Только для вас</p><h2>Карта времени</h2></div>${compact ? '<button type="button" class="text-button" data-personal-tab-jump="life">Открыть карту</button>' : ''}</div>`;
    const settingsForm = `<details class="life-map-settings" ${model ? '' : 'open'}><summary>Дата рождения и горизонт</summary><form class="life-settings-form"><label>Дата рождения<input type="date" name="birthDate" value="${esc(settings.birthDate || '')}" max="${localISODate(new Date())}" required></label><label>Выбранный горизонт, лет<input type="number" name="years" min="1" max="150" step="1" value="${settings.lifeExpectancyYears || 100}" required></label><div class="life-horizons" aria-label="Горизонт"><button type="button" data-life-years="70">70</button><button type="button" data-life-years="80">80</button><button type="button" data-life-years="90">90</button><button type="button" data-life-years="100">100</button></div><p class="muted">Дата рождения видна только вам. Горизонт можно изменить в любой момент.</p><button type="submit" class="secondary">Сохранить настройки карты</button><p data-life-error role="alert" hidden></p></form></details>`;
    if (!model) return `<section class="life-map-panel">${heading}<p>Время внутри выбранного горизонта</p>${compact ? '<p class="muted">Укажите дату рождения на отдельном экране карты.</p>' : settingsForm}</section>`;
    const unitLabel = ui.unit === 'weeks' ? 'недель' : 'месяцев';
    const summary = `<p>Время внутри выбранного горизонта</p><div class="life-map-summary"><strong>${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 1 }).format(model.percent)}%</strong><span>${model.completed} из ${model.periods.length} полных ${unitLabel}</span></div><p class="muted">${model.passed ? 'Выбранный горизонт уже пройден. При желании выберите другой.' : 'Прошедшее время — не оценка достижений и не прогноз продолжительности жизни.'}</p>`;
    if (compact) return `<section class="life-map-panel">${heading}${summary}</section>`;
    const size = ui.unit === 'weeks' ? 260 : 120, pages = Math.ceil(model.periods.length / size);
    const currentPage = Math.floor((model.current < 0 ? model.periods.length - 1 : model.current) / size);
    const page = Math.max(0, Math.min(pages - 1, ui.page ?? currentPage));
    const visible = model.periods.slice(page * size, (page + 1) * size);
    const format = value => civilDate(value).toLocaleDateString('ru-RU', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' });
    const currentText = model.current >= 0 ? `Текущий период: ${format(model.periods[model.current].start)} — ${format(dateKey(new Date(+civilDate(model.periods[model.current].end) - DAY)))}` : `Граница горизонта: ${format(model.end)}`;
    return `<section class="life-map-panel life-map-full">${heading}${summary}<div class="life-map-toolbar"><div class="segmented" aria-label="Единица карты"><button type="button" class="segment ${ui.unit === 'months' ? 'active' : ''}" aria-pressed="${ui.unit === 'months'}" data-life-unit="months">Месяцы</button><button type="button" class="segment ${ui.unit === 'weeks' ? 'active' : ''}" aria-pressed="${ui.unit === 'weeks'}" data-life-unit="weeks">Недели</button></div><button type="button" class="text-button" data-life-current>К текущему периоду</button></div><p class="life-current-period">${currentText}</p><div class="life-map-legend"><span><i class="past"></i>Прошло</span><span><i class="current"></i>Сейчас</span><span><i></i>Впереди</span></div><div class="life-map-window"><header><button type="button" class="icon-button" data-life-page="${page - 1}" ${page === 0 ? 'disabled' : ''} aria-label="Предыдущий отрезок">${icon('chevronLeft')}</button><span>${ui.unit === 'weeks' ? 'Недели' : 'Месяцы'} ${visible[0].index + 1}–${visible.at(-1).index + 1}<small>${format(visible[0].start)} — ${format(dateKey(new Date(+civilDate(visible.at(-1).end) - DAY)))}</small></span><button type="button" class="icon-button" data-life-page="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''} aria-label="Следующий отрезок">${icon('chevronRight')}</button></header><div class="life-period-grid ${ui.unit}" role="img" aria-label="${esc(currentText)}. ${model.completed} полных ${unitLabel} прошло из ${model.periods.length}.">${visible.map(period => `<i class="${period.state}" title="${format(period.start)} — ${format(dateKey(new Date(+civilDate(period.end) - DAY)))}${period.days < 7 && ui.unit === 'weeks' ? ' · неполная неделя' : ''}" aria-hidden="true"></i>`).join('')}</div><small class="muted">Каждый круг — один период от даты рождения. Последняя неделя может быть неполной.</small></div>${settingsForm}</section>`;
  }
  function bind() {
    document.querySelectorAll('[data-life-unit]').forEach(button => button.addEventListener('click', () => { view().unit = button.dataset.lifeUnit; view().page = null; renderPersonal(); }));
    document.querySelectorAll('[data-life-page]').forEach(button => button.addEventListener('click', () => { view().page = Number(button.dataset.lifePage); renderPersonal(); }));
    document.querySelector('[data-life-current]')?.addEventListener('click', () => { view().page = null; renderPersonal(); });
    const form = document.querySelector('.life-settings-form');
    if (!form) return;
    const owner = state.me.id, original = { ...state.personal.settings };
    bindWorkingDraft(form, `personal:${owner}:life-settings`);
    // A unit/tab switch can replace this non-dialog form before the usual debounce.
    form.addEventListener('input', () => state.workingDraftPersistors.get(form)?.());
    form.addEventListener('change', () => state.workingDraftPersistors.get(form)?.());
    form.querySelectorAll('[data-life-years]').forEach(button => button.addEventListener('click', () => { form.elements.years.value = button.dataset.lifeYears; form.elements.years.dispatchEvent(new Event('input', { bubbles: true })); }));
    form.addEventListener('submit', async event => {
      event.preventDefault(); const button = form.querySelector('[type=submit]'), error = form.querySelector('[data-life-error]');
      if (button.disabled || owner !== state.me?.id) return;
      button.disabled = true; error.hidden = true;
      try {
        const value = await api('/api/personal/life/settings', { method: 'PUT', headers: { 'X-Outbox-Owner': String(owner) }, body: JSON.stringify({ birthDate: form.elements.birthDate.value, lifeExpectancyYears: Number(form.elements.years.value), expectedBirthDate: original.birthDate || '', expectedYears: original.lifeExpectancyYears }) });
        if (owner !== state.me?.id) return;
        state.personal.settings = value; clearWorkingDraftFor(form); view().page = null; toast('Настройки карты сохранены');
        if (form.isConnected) renderPersonal();
      } catch (failure) { if (form.isConnected && owner === state.me?.id) { error.textContent = failure.message; error.hidden = false; } }
      finally { button.disabled = false; }
    });
  }
  return { render, bind };
}
