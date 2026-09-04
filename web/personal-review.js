export function reviewWeekShift(value, days) {
  const date = new Date(`${value}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export const reviewActionLabels = {
  next_week: 'В следующую неделю',
  skip: 'Не брать',
  postpone: 'Вернуться позже',
  fix: 'Исправить источник',
};

const reviewPlural = (value, one, few, many) => {
  const amount = Math.abs(Number(value)) % 100, last = amount % 10;
  if (amount > 10 && amount < 20) return many;
  if (last === 1) return one;
  if (last > 1 && last < 5) return few;
  return many;
};

export function reviewHabitResultText(item) {
  const recorded = Number(item.recorded || 0), success = Number(item.success || 0);
  const parts = [`${recorded} ${reviewPlural(recorded, 'отметка', 'отметки', 'отметок')}`, `${success} выполнено`];
  for (const [key, label] of [['partial', 'частично'], ['failed', 'не выполнено'], ['skipped', 'пропущено']]) {
    const value = Number(item[key] || 0);
    if (value) parts.push(`${value} ${label}`);
  }
  const total = Number(item.totalValue || 0);
  if (total) parts.push(`${total} ${item.unit || ''}`.trim());
  return parts.join(' · ');
}

export function createPersonalReviewUI({ state, api, escapeHTML: esc, icon, renderPersonal, toast, openSource }) {
  const q = (selector, root = document) => root.querySelector(selector);
  let cache = null;
  let selectedWeek = '';
  let generation = 0;
  const pending = new Map();

  const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow';
  const key = item => `${item.sourceKind}:${item.sourceId}`;
  const requestKey = () => crypto.randomUUID();
  const read = async (path, options) => {
    const response = await api(path, options);
    if (response && typeof response === 'object' && 'ok' in response) {
      const value = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(value.error || 'Не удалось выполнить запрос');
        error.status = response.status;
        throw error;
      }
      return value;
    }
    return response;
  };

  function current() {
    return cache?.owner === state.me?.id ? cache : null;
  }

  async function load(force = false) {
    const owner = state.me?.id;
    if (!owner || current()?.loading && !force) return;
    const request = ++generation;
    cache = { owner, loading: true };
    const args = new URLSearchParams({ timezone: zone() });
    if (selectedWeek) args.set('week', selectedWeek);
    try {
      const value = await read(`/api/personal/review?${args}`);
      if (owner !== state.me?.id || request !== generation) return;
      selectedWeek = value.weekStart;
      cache = { owner, value };
    } catch (error) {
      if (owner !== state.me?.id || request !== generation) return;
      cache = { owner, error: error.message };
    }
    if (owner === state.me?.id && request === generation && state.view === 'personal' && state.personalTab === 'review') renderPersonal();
  }

  const dateLabel = value => value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${value.slice(0, 10)}T12:00:00Z`)) : '';
  const kindLabel = item => ({ plan: item.kind === 'event' ? 'Событие' : 'Личное дело', record: 'Карточка проекта', waiting: 'Ожидание', habit: 'Привычка' })[item.sourceKind] || 'Источник';

  function sourceButton(item, body) {
    return `<button type="button" class="personal-review-source" data-review-open="${esc(item.sourceId)}" data-review-kind="${esc(item.sourceKind)}" data-review-workspace="${esc(item.workspaceId || '')}">${body}${icon('chevronRight')}</button>`;
  }

  function resultRow(item) {
    const project = item.workspace ? `<span>${esc(item.workspace)}</span>` : item.context ? `<span>${esc(item.context)}</span>` : '';
    let detail = item.result ? `<p>${esc(item.result)}</p>` : '';
    if (item.sourceKind === 'habit') {
      detail = `<p>${esc(reviewHabitResultText(item))}</p>`;
    } else if (item.actualMinutes) {
      detail += `<p>${item.actualMinutes} мин фактически</p>`;
    }
    return `<article class="personal-review-row is-result">${sourceButton(item, `<span class="type-icon">${icon(item.sourceKind === 'habit' ? 'rotate' : 'check')}</span><span><small>${esc(kindLabel(item))}${item.date ? ` · ${esc(dateLabel(item.date))}` : ''}</small><strong>${esc(item.title)}</strong>${project}${detail}</span>`)}</article>`;
  }

  function decisionSelect(item) {
    const itemKey = key(item);
    const draft = pending.get(itemKey);
    const value = draft?.action || item.choice?.action || '';
    const options = Object.entries(reviewActionLabels).map(([action, label]) => `<option value="${action}" ${value === action ? 'selected' : ''}>${label}</option>`).join('');
    const status = draft?.saving ? '<small class="review-choice-state">Сохраняем…</small>' : draft?.error ? `<small class="review-choice-state is-error">${esc(draft.error)}</small><button type="button" class="text-button" data-review-retry="${esc(itemKey)}">${draft.conflict ? 'Сравнить и применить' : 'Повторить'}</button>` : item.choice ? `<small class="review-choice-state">Сохранено · ${esc(reviewActionLabels[item.choice.action])}</small>` : '';
    return `<div class="personal-review-choice"><label>Решение<select data-review-action="${esc(itemKey)}" ${draft?.saving ? 'disabled' : ''}><option value="">Выберите</option>${options}</select></label>${status}</div>`;
  }

  function attentionRow(item) {
    const context = item.workspace ? `<span>${esc(item.workspace)}</span>` : item.waitingFor ? `<span>${esc(item.waitingFor)}</span>` : item.context ? `<span>${esc(item.context)}</span>` : '';
    const date = item.expectedDate || item.date;
    return `<article class="personal-review-row">${sourceButton(item, `<span class="type-icon">${icon(item.kind === 'risk' ? 'shield' : item.kind === 'decision' ? 'scale' : item.sourceKind === 'waiting' ? 'clock' : 'checkSquare')}</span><span><small>${esc(kindLabel(item))}${date ? ` · ${esc(dateLabel(date))}` : ''}</small><strong>${esc(item.title)}</strong>${context}<p>${esc(item.reason)}</p></span>`)}${decisionSelect(item)}</article>`;
  }

  function section(title, note, data, rows, open = true) {
    if (!data) return '';
    return `<details class="personal-review-section" ${open ? 'open' : ''}><summary><span><strong>${esc(title)}</strong><small>${esc(note)}</small></span><b>${data.total}</b>${icon('chevronDown')}</summary><div class="personal-review-list">${data.items.map(rows).join('') || '<p class="muted">За эту неделю здесь ничего нет.</p>'}</div>${data.hasMore ? '<p class="muted review-limit">Показаны первые 50. Уточните источники перед следующим обзором.</p>' : ''}</details>`;
  }

  function render() {
    const stateCache = current();
    if (!stateCache) {
      void load();
      return '<section class="personal-section"><p class="muted">Загружаем недельный обзор…</p></section>';
    }
    if (stateCache.loading) return '<section class="personal-section"><p class="muted">Загружаем недельный обзор…</p></section>';
    if (stateCache.error) return `<section class="personal-section"><p class="form-error">${esc(stateCache.error)}</p><button type="button" class="secondary" data-review-reload>Повторить</button></section>`;
    const value = stateCache.value;
    const currentWeek = value.nextWeekStart > value.today;
    const results = value.completedPlans.total + value.completedRecords.total + value.habitResults.total;
    return `<section class="personal-review-page">
      <header class="personal-review-heading"><div><p class="eyebrow">Только для вас</p><h2>Обзор недели</h2><p>${esc(dateLabel(value.weekStart))} — ${esc(dateLabel(value.weekEnd))}</p></div><div><button type="button" class="icon-button" data-review-week="${reviewWeekShift(value.weekStart, -7)}" aria-label="Предыдущая неделя">${icon('chevronLeft')}</button><button type="button" class="secondary" data-review-current ${currentWeek ? 'disabled' : ''}>Текущая неделя</button><button type="button" class="icon-button" data-review-week="${reviewWeekShift(value.weekStart, 7)}" aria-label="Следующая неделя" ${currentWeek ? 'disabled' : ''}>${icon('chevronRight')}</button></div></header>
      <div class="personal-review-summary"><article><strong>${results}</strong><span>результатов и фактов</span></article><article><strong>${value.reviewed}/${value.candidates}</strong><span>сигналов разобрано</span><progress max="${Math.max(1, value.candidates)}" value="${value.reviewed}"></progress></article><article><strong>${value.waiting.total}</strong><span>внешних ожиданий</span></article></div>
      <p class="personal-review-rule">Выбор фиксирует решение обзора. Срок, приоритет и состояние меняются только в исходной карточке.</p>
      <div class="personal-review-columns"><div><h3>Что произошло</h3>${section('Личные результаты', 'Завершённые дела', value.completedPlans, resultRow)}${section('Результаты проектов', 'Доступные вам стартапы', value.completedRecords, resultRow)}${section('Привычки', 'Только фактические отметки', value.habitResults, resultRow)}</div><div><h3>Что решить</h3>${section('Внешние ответы', 'Ожидание не является блокером', value.waiting, attentionRow)}${section('Зависшие дела', 'Прошла дата или не было движения', value.stalled, attentionRow)}${section('Несвязанные дела', 'Показана вычисленная причина', value.unlinked, attentionRow, false)}${section('Решения без действия', 'По каждому проекту отдельно', value.decisions, attentionRow, false)}${section('Риски без действия', 'Активные карточки проектов', value.risks, attentionRow, false)}</div></div>
    </section>`;
  }

  function findItem(itemKey) {
    const value = current()?.value;
    if (!value) return null;
    for (const name of ['waiting', 'stalled', 'unlinked', 'decisions', 'risks']) {
      const found = value[name].items.find(item => key(item) === itemKey);
      if (found) return found;
    }
    return null;
  }

  async function save(item, action, retry = false) {
    const owner = state.me?.id;
    const itemKey = key(item);
    const previous = pending.get(itemKey);
    const draft = previous && previous.action === action ? previous : { action, requestKey: requestKey() };
    if (draft.saving) return;
    draft.saving = true;
    draft.error = '';
    pending.set(itemKey, draft);
    renderPersonal();
    const expectedRevision = item.choice?.revision || 0;
    if (retry || draft.conflict) draft.requestKey = requestKey();
    try {
      await read(`/api/personal/review/${current().value.weekStart}/${item.sourceKind}/${item.sourceId}`, { method: 'PUT', body: JSON.stringify({ action, note: item.choice?.note || '', expectedRevision, requestKey: draft.requestKey }) });
      if (owner !== state.me?.id) return;
      pending.delete(itemKey);
      cache = null;
      await load(true);
      toast('Решение обзора сохранено');
    } catch (error) {
      if (owner !== state.me?.id) return;
      draft.saving = false;
      draft.error = error.status === 409 ? 'В другом окне выбрано другое решение.' : error.message;
      draft.conflict = error.status === 409;
      pending.set(itemKey, draft);
      if (draft.conflict) {
        cache = null;
        await load(true);
      } else {
        renderPersonal();
      }
    }
  }

  function bind() {
    const root = q('.personal-content');
    if (!root || state.personalTab !== 'review') return;
    if (!current()) void load();
    root.querySelectorAll('[data-review-week]').forEach(button => button.onclick = () => {
      selectedWeek = button.dataset.reviewWeek;
      cache = null;
      renderPersonal();
    });
    q('[data-review-current]', root)?.addEventListener('click', () => {
      selectedWeek = '';
      cache = null;
      renderPersonal();
    });
    q('[data-review-reload]', root)?.addEventListener('click', () => {
      cache = null;
      renderPersonal();
    });
    root.querySelectorAll('[data-review-open]').forEach(button => button.onclick = () => openSource({ sourceKind: button.dataset.reviewKind, sourceId: button.dataset.reviewOpen, workspaceId: button.dataset.reviewWorkspace }));
    root.querySelectorAll('[data-review-action]').forEach(select => select.onchange = () => {
      const item = findItem(select.dataset.reviewAction);
      if (!item || !select.value) return;
      void save(item, select.value);
    });
    root.querySelectorAll('[data-review-retry]').forEach(button => button.onclick = () => {
      const item = findItem(button.dataset.reviewRetry);
      const draft = pending.get(button.dataset.reviewRetry);
      if (item && draft) void save(item, draft.action, true);
    });
  }

  function invalidate() {
    cache = null;
    generation++;
  }

  return { render, bind, invalidate };
}
