export function readingAge(day, today) {
  if (!day) return { key: 'never', label: 'Ещё не читали' };
  const days = Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86400000));
  return { key: days <= 7 ? 'recent' : days <= 30 ? 'month' : days <= 90 ? 'old' : 'distant', label: days === 0 ? 'Сегодня' : `${days} дн. назад` };
}
export function nextTuesday(today) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + (2 - date.getUTCDay() + 7) % 7);
  return date.toISOString().slice(0, 10);
}
export function readingBookState(book, entries, today) {
  const own = entries.filter(entry => entry.book === book.id), full = own.filter(entry => entry.complete);
  const last = own.map(entry => entry.day).sort().at(-1) || '';
  return { count: new Set(full.map(entry => entry.chapter)).size, last, age: readingAge(last, today) };
}
const readingBookShortNames = [
  '', 'Быт', 'Исх', 'Лев', 'Чис', 'Втор', 'Нав', 'Суд', 'Руф', '1 Цар', '2 Цар', '3 Цар', '4 Цар',
  '1 Пар', '2 Пар', 'Езд', 'Неем', 'Есф', 'Иов', 'Пс', 'Притч', 'Еккл', 'Песн', 'Ис', 'Иер', 'Плач',
  'Иез', 'Дан', 'Ос', 'Иоиль', 'Ам', 'Авд', 'Иона', 'Мих', 'Наум', 'Авв', 'Соф', 'Агг', 'Зах', 'Мал',
  'Мф', 'Мк', 'Лк', 'Ин', 'Деян', 'Рим', '1 Кор', '2 Кор', 'Гал', 'Еф', 'Флп', 'Кол', '1 Фес',
  '2 Фес', '1 Тим', '2 Тим', 'Тит', 'Флм', 'Евр', 'Иак', '1 Петр', '2 Петр', '1 Ин', '2 Ин',
  '3 Ин', 'Иуд', 'Откр'
];
export function readingBookShortName(id) { return readingBookShortNames[Number(id)] || ''; }
export function readingTestament(id) { return Number(id) <= 39 ? 'old' : 'new'; }

export function createReadingUI(ctx) {
  const { state, api, escapeHTML: e, icon, toast, toastAction, openModal, closeDialog, bindDraft, clearDraft, loadData } = ctx;
  let data = null, scope = '', request = 0, tab = 'read', period = 'week', selectedBook = 0;
  const root = () => document.querySelector('#main-content');
  const dialog = () => document.querySelector('#personal-dialog');
  const body = () => document.querySelector('#personal-dialog-content');
  const key = () => `${state.me?.id}:${state.activeWorkspaceId}`;
  const active = () => ['reading', 'dashboard'].includes(state.view);
  const admin = () => ['owner', 'admin'].includes(state.workspaces.find(w => w.id === state.activeWorkspaceId)?.role);
  const group = id => data.groups.find(g => g.id === id);
  const leader = id => admin() || group(id)?.leaderId === state.me.id;
  const profileName = (userId, username = '', displayName = '') => String(displayName || state.users.find(user => user.id === userId)?.displayName || username || 'Участник').trim();
  const plural = (value, one, few, many) => { const number = Math.abs(Number(value)) % 100, last = number % 10; return `${value} ${number > 10 && number < 20 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many}`; };
  const pluralNoun = (value, one, few, many) => plural(value, one, few, many).replace(/^\S+\s+/, '');
  const initials = name => name.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join('').toLocaleUpperCase('ru') || '•';
  const displayDay = (value, short = false) => new Intl.DateTimeFormat('ru-RU', short ? { day: 'numeric', month: 'short' } : { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00Z`));
  const bookName = id => data.books.find(b => b.id === Number(id))?.name || '';
  const option = (value, name, selected) => `<option value="${e(String(value))}" ${String(value) === String(selected) ? 'selected' : ''}>${e(name)}</option>`;
  const passage = item => `${bookName(item.book)} ${item.first || item.chapter}${item.last && item.last !== item.first ? `–${item.last}` : ''}`;
  const reflectionPassage = item => item.book && item.chapter ? `${bookName(item.book)} ${item.chapter}` : 'Без привязки к главе';
  const bookOptions = id => data.books.map(b => option(b.id, b.name, id)).join('');
  const groupOptions = id => data.groups.map(g => option(g.id, g.name, id)).join('');
  const selectedBookKey = () => `reading:selected-book:${key()}`;
  const restoreSelectedBook = () => {
    let stored = 0;
    try { stored = Number(localStorage.getItem(selectedBookKey())); } catch (_) { /* storage may be unavailable */ }
    selectedBook = data.books.some(book => book.id === stored) ? stored : (data.nextBook || 43);
  };
  const saveSelectedBook = () => { try { localStorage.setItem(selectedBookKey(), String(selectedBook)); } catch (_) { /* keep the in-memory choice */ } };
  const call = (path, payload, method = 'POST') => api(`/api/reading${path}`, { method, body: JSON.stringify(payload), headers: { 'X-Workspace-ID': state.activeWorkspaceId, 'X-Outbox-Owner': String(state.me.id) } });
  async function render() {
    const context = key(), sequence = ++request;
    if (scope !== context) { scope = context; data = null; tab = 'read'; selectedBook = 0; }
    root().innerHTML = '<section class="reading-page"><p role="status">Загружаем дневник чтения…</p></section>';
    try {
      const value = await api(`/api/reading?period=${period}`);
      if (context !== key() || sequence !== request || !active()) return;
      data = value; if (!selectedBook) restoreSelectedBook(); paint();
    } catch (error) {
      if (context !== key() || sequence !== request || !active()) return;
      root().innerHTML = `<section class="reading-page"><div class="reading-panel section-panel reading-error"><h2>Чтение Библии</h2><p role="alert">${e(error.message)}</p>${error.status === 404 && admin() ? '<button class="primary" data-reading-enable>Включить чтение в этой команде</button>' : '<button class="secondary" data-reading-retry>Повторить</button>'}</div></section>`;
      root().querySelector('[data-reading-retry]')?.addEventListener('click', render);
      root().querySelector('[data-reading-enable]')?.addEventListener('click', async event => {
        event.target.disabled = true;
        try { await call('/enable', {}); await loadData(); await render(); } catch (err) { toast(err.message, true); event.target.disabled = false; }
      });
    }
  }
  function paint() {
    const tabs = [['read', 'Чтение'], ['today', 'Серия'], ['plans', 'Ко вторнику'], ['journal', 'Мой дневник'], ['ranking', 'Рейтинг'], ['groups', 'Группы']];
    root().innerHTML = `<div class="reading-page"><header class="reading-hero page-heading"><div><p class="eyebrow">Домашняя группа · ${e(displayDay(data.today, true))} · Москва</p><h2>Время для Слова</h2><p>Выберите книгу и одним нажатием отметьте прочитанную главу.</p></div><button class="secondary reading-main-action" data-reading-log>${icon('bookOpen')} Диапазон / частично</button></header>
      <nav class="reading-tabs segmented" role="tablist" aria-label="Разделы чтения">${tabs.map(([id, title]) => `<button class="reading-tab segment ${tab === id ? 'active' : ''}" role="tab" data-reading-tab="${id}" aria-selected="${tab === id}" aria-current="${tab === id ? 'page' : 'false'}">${title}</button>`).join('')}</nav>
      ${!data.groupId ? `<section class="reading-panel section-panel reading-join-panel"><div><p class="eyebrow">Первый шаг</p><h3>Выберите домашнюю группу</h3><p>Ваши отметки останутся личными, а в общий рейтинг попадёт только количество прочитанных глав.</p></div><form id="reading-join"><label>Группа<select name="groupId">${groupOptions('')}</select></label><button class="primary">Присоединиться</button></form></section>` : ''}
      <div id="reading-tab-content">${tab === 'read' ? readView() : tab === 'today' ? todayView() : tab === 'plans' ? plansView() : tab === 'journal' ? journalView() : tab === 'ranking' ? rankingView() : groupsView()}</div></div>`;
    const tabStrip = root().querySelector('.reading-tabs'), currentTab = tabStrip?.querySelector('[aria-current="page"]');
    if (tabStrip && currentTab && tabStrip.scrollWidth > tabStrip.clientWidth) {
      tabStrip.scrollLeft = Math.max(0, currentTab.offsetLeft - 12);
    }
    root().querySelectorAll('[data-reading-tab]').forEach(b => b.onclick = () => { tab = b.dataset.readingTab; paint(); });
    root().querySelectorAll('[data-reading-log]').forEach(b => b.onclick = () => entryForm());
    root().querySelectorAll('[data-reading-log-current]').forEach(b => b.onclick = () => {
      const first = data.nextBook === selectedBook ? data.nextChapter : 1;
      entryForm({ book: selectedBook, first, last: first });
    });
    root().querySelectorAll('[data-reading-next]').forEach(b => b.onclick = openSuggested);
    root().querySelectorAll('[data-reading-book-picker]').forEach(b => b.onclick = bookPicker);
    root().querySelectorAll('[data-reading-book]').forEach(b => b.onclick = () => { selectedBook = Number(b.dataset.readingBook); saveSelectedBook(); paint(); root().querySelector('.reading-reader')?.scrollIntoView({ block: 'start' }); });
    root().querySelectorAll('[data-reading-chapter]').forEach(b => b.onclick = () => fastMark(selectedBook, Number(b.dataset.readingChapter), b));
    root().querySelectorAll('[data-reading-edit]').forEach(b => b.onclick = () => entryForm({}, [...data.entries,...(data.cancelledEntries||[])].find(item => item.id === b.dataset.readingEdit)));
    root().querySelector('[data-reflection-new]')?.addEventListener('click', () => reflectionForm());
    root().querySelectorAll('[data-reflection-edit]').forEach(b => b.onclick = () => reflectionForm(data.reflections.find(item => item.id === b.dataset.reflectionEdit)));
    root().querySelectorAll('[data-reading-plan]').forEach(b => b.onclick = () => { const p = data.plans.find(p => p.id === b.dataset.readingPlan); entryForm({ book: p.book, first: p.next || p.first, last: p.last, stream: 'group' }); });
    root().querySelectorAll('[data-plan-create]').forEach(b => b.onclick = () => planForm());
    root().querySelectorAll('[data-plan-cancel]').forEach(b => b.onclick = () => cancelPlan(b.dataset.planCancel));
    root().querySelectorAll('[data-group-edit]').forEach(b => b.onclick = () => groupForm(group(b.dataset.groupEdit)));
    root().querySelector('[data-group-create]')?.addEventListener('click', () => groupForm());
    root().querySelector('[data-reading-period]')?.addEventListener('change', event => { period = event.target.value; render(); });
    root().querySelector('#reading-join')?.addEventListener('submit', async event => {
      event.preventDefault(); const form = event.target, button = form.querySelector('button'); button.disabled = true;
      try { await call('/join', { groupId: new FormData(form).get('groupId') }); await render(); } catch (err) { toast(err.message, true); button.disabled = false; }
    });
    root().querySelector('[data-group-switch]')?.addEventListener('change', async event => {
      const id = event.target.value; if (!confirm('Сменить группу? Ранее заработанные очки останутся в прежней группе.')) { paint(); return; }
      try { await call('/join', { groupId: id }); await render(); } catch (err) { toast(err.message, true); paint(); }
    });
    root().querySelector('[data-journal-search]')?.addEventListener('input', event => {
      const text = event.target.value.toLocaleLowerCase('ru'), journal = event.target.closest('.reading-journal');
      journal.querySelectorAll('[data-journal-row]').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase('ru').includes(text); });
      journal.querySelectorAll('[data-journal-day]').forEach(day => { day.hidden = ![...day.querySelectorAll('[data-journal-row]')].some(row => !row.hidden); });
      const empty = journal.querySelector('[data-journal-empty]'); if (empty) empty.hidden = !text || [...journal.querySelectorAll('[data-journal-row]')].some(row => !row.hidden);
    });
  }
  async function fastMark(book, chapter, button) {
    if (!data.groupId) { toast('Сначала выберите свою домашнюю группу', true); return; }
    const existing = data.entries.find(item => item.day === data.today && item.book === book && item.chapter === chapter);
    if (existing) { entryForm({}, existing); return; }
    button.disabled = true; button.setAttribute('aria-busy', 'true');
    try {
      const saved = await call('/entries', { day: data.today, book, first: chapter, last: chapter, complete: true, stream: 'personal', note: '', shared: false });
      await render();
      if (saved.added) {
        const marked = data.entries.find(item => item.day === data.today && item.book === book && item.chapter === chapter);
        if (toastAction && marked) toastAction(`${bookName(book)} ${chapter} — прочитано`, 'Добавить пометку', () => entryForm({}, marked));
        else toast(`${bookName(book)} ${chapter} отмечена. Пометку можно добавить позже.`);
      }
      else {
        const current = data.entries.find(item => item.day === data.today && item.book === book && item.chapter === chapter);
        if (current) entryForm({}, current); else toast('Глава уже отмечена. Обновите страницу, чтобы увидеть запись.', true);
      }
    } catch (error) {
      toast(error.message, true);
      if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  }
  function openSuggested() {
    if (!data.nextBook) return;
    selectedBook = data.nextBook; saveSelectedBook(); tab = 'read'; paint();
    const target = root().querySelector(`[data-reading-chapter="${data.nextChapter}"]`);
    try { target?.focus({ preventScroll: true }); } catch { target?.focus(); }
    root().querySelector('.reading-reader')?.scrollIntoView({ block: 'start' });
  }
  function bookGrid(testament, attribute) {
    return `<div class="reading-testament-grid">${data.books.filter(item => readingTestament(item.id) === testament).map(item => {
      const state = readingBookState(item, data.entries, data.today), selected = item.id === selectedBook;
      return `<button class="reading-testament-book reading-age-${state.age.key}" ${attribute}="${item.id}" data-book-filter="${e(`${item.name} ${readingBookShortName(item.id)}`.toLocaleLowerCase('ru'))}" aria-pressed="${selected}" title="${e(`${item.name}: ${state.count}/${item.chapters} глав, ${state.age.label}`)}" aria-label="${e(`${item.name}: прочитано ${state.count} из ${item.chapters} глав, ${state.age.label}`)}"><strong>${e(readingBookShortName(item.id))}</strong><small aria-hidden="true">${state.count}/${item.chapters}</small></button>`;
    }).join('')}</div>`;
  }
  function bookPicker() {
    body().innerHTML = `<section class="reading-book-picker"><header><div><p class="eyebrow">Книги Библии</p><h2>Выберите книгу</h2></div><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></header><label class="reading-book-search"><span>Найти книгу</span><input type="search" inputmode="search" autocomplete="off" placeholder="Например, Иоанна"></label><div class="reading-legend">${[['never','Не читал'],['recent','До 7 дней'],['month','8–30 дней'],['old','31–90 дней'],['distant','Больше 90 дней']].map(([key,label])=>`<span class="reading-age-${key}">${label}</span>`).join('')}</div><section class="reading-picker-testament" data-reading-picker-testament><h3>Ветхий Завет</h3>${bookGrid('old','data-reading-pick')}</section><section class="reading-picker-testament" data-reading-picker-testament><h3>Новый Завет</h3>${bookGrid('new','data-reading-pick')}</section></section>`;
    body().querySelector('[data-close]').onclick = () => closeDialog(dialog());
    body().querySelectorAll('[data-reading-pick]').forEach(button => button.onclick = async () => {
      selectedBook = Number(button.dataset.readingPick); saveSelectedBook();
      await closeDialog(dialog()); paint();
      root().querySelector('.reading-reader')?.scrollIntoView({ block: 'start' });
    });
    body().querySelector('.reading-book-search input').addEventListener('input', event => {
      const query = event.target.value.trim().toLocaleLowerCase('ru');
      body().querySelectorAll('[data-reading-pick]').forEach(button => { button.hidden = Boolean(query && !button.dataset.bookFilter.includes(query)); });
      body().querySelectorAll('[data-reading-picker-testament]').forEach(section => { section.hidden = !section.querySelector('[data-reading-pick]:not([hidden])'); });
    });
    openModal(dialog());
  }
  function readView() {
    const book = data.books.find(item => item.id === selectedBook) || data.books[42];
    const state = readingBookState(book, data.entries, data.today);
    const next = data.nextBook ? `${bookName(data.nextBook)} ${data.nextChapter}` : 'Маршрут завершён';
    const chapterButtons = Array.from({ length: book.chapters }, (_, index) => {
      const chapter = index + 1;
      const own = data.entries.filter(item => item.book === book.id && item.chapter === chapter).sort((a, b) => a.day.localeCompare(b.day));
      const last = own.at(-1), today = own.find(item => item.day === data.today), age = readingAge(last?.day, data.today);
      const stateText = today ? `отмечена сегодня, ${today.complete ? 'полностью' : 'частично'}; нажмите, чтобы добавить пометку или исправить` : `${age.label}${last ? `, ${last.complete ? 'полностью' : 'частично'}` : ''}; нажмите, чтобы отметить сегодня`;
      const classes = [`reading-age-${age.key}`, today ? 'is-read-today' : '', data.nextBook === book.id && data.nextChapter === chapter ? 'is-next' : ''].filter(Boolean).join(' ');
      return `<button data-reading-fast data-reading-chapter="${chapter}" class="${classes}" title="${e(`${book.name} ${chapter}: ${stateText}`)}" aria-label="${e(`${book.name} ${chapter}: ${stateText}`)}"><span>${chapter}</span>${last ? `<small aria-hidden="true">${today ? '✓' : last.complete ? '•' : '◐'}</small>` : ''}</button>`;
    }).join('');
    const route = !data.nextBook ? `<span class="reading-muted">${e(next)}</span>` : data.nextBook === book.id ? `<span class="reading-route-hint">Дальше по маршруту — глава ${data.nextChapter}</span>` : `<button class="reading-next" data-reading-next>Продолжить: ${e(next)} →</button>`;
    return `<section class="reading-panel section-panel reading-reader"><div class="reading-book-bar"><button class="reading-current-book" data-reading-book-picker aria-label="Выбрать книгу. Сейчас открыта ${e(book.name)}"><span><small>Книга</small><strong>${e(book.name)}</strong></span><span class="reading-current-state"><small>${state.count}/${book.chapters} глав</small><b aria-hidden="true">⌄</b></span></button><button class="reading-reader-more icon-button" data-reading-log-current aria-label="Отметить диапазон или частичное чтение" title="Диапазон или частичное чтение">•••</button></div><div class="reading-route">${route}</div><p class="reading-reader-help">Одно нажатие на главу — прочитано сегодня. Повторное откроет пометку.</p><div class="reading-chapter-circles" aria-label="Главы книги ${e(book.name)}">${chapterButtons}</div></section>
      <section class="reading-panel section-panel reading-catalog"><div><h3>Книги Библии</h3><p>На телефоне этот каталог открывается нажатием на текущую книгу. Цвет показывает давность, число — охват полных глав.</p></div><div class="reading-legend">${[['never','Не читал'],['recent','До 7 дней'],['month','8–30 дней'],['old','31–90 дней'],['distant','Больше 90 дней']].map(([key,label])=>`<span class="reading-age-${key}">${label}</span>`).join('')}</div><h4>Ветхий Завет</h4>${bookGrid('old','data-reading-book')}<h4>Новый Завет</h4>${bookGrid('new','data-reading-book')}</section>`;
  }
  function todayView() {
    const todayEntries = data.entries.filter(item => item.day === data.today);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${data.today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i - 6); return d.toISOString().slice(0, 10); });
    const complete = todayEntries.filter(item => item.complete).length;
    return `<section class="reading-today-overview section-panel"><div class="reading-summary"><article><span>Сегодня</span><strong>${complete}</strong><small>${pluralNoun(complete, 'глава', 'главы', 'глав')}</small></article><article><span>Текущая серия</span><strong>${data.currentStreak}</strong><small>${pluralNoun(data.currentStreak, 'день', 'дня', 'дней')}</small></article><article><span>Лучшая серия</span><strong>${data.bestStreak}</strong><small>${pluralNoun(data.bestStreak, 'день', 'дня', 'дней')}</small></article></div>
      <div class="reading-week" aria-label="Последние семь дней">${days.map(day => { const marked = data.entries.some(item => item.day === day); return `<div class="${day === data.today ? 'today' : ''} ${marked ? 'marked' : ''}"><span>${e(displayDay(day, true))}</span><strong aria-label="${day}: ${marked ? 'есть чтение' : 'нет отметки'}">${marked ? '✓' : '—'}</strong></div>`; }).join('')}</div>
      <p class="reading-day-note">${todayEntries.length ? `${icon('check')} Сегодня чтение отмечено` : `${icon('clock')} Сегодня ещё можно продолжить серию`}<span>Новый день начинается в 00:00 по Москве.</span></p></section>
      <div class="reading-columns"><section class="reading-panel section-panel reading-route-card"><p class="eyebrow">Личный маршрут</p><h3>${data.nextBook ? e(`${bookName(data.nextBook)} ${data.nextChapter}`) : 'Маршрут завершён'}</h3><p>Продолжите с главы после последнего полного личного чтения. План группы ведётся отдельно.</p>${data.nextBook ? `<button class="primary" data-reading-next>${icon('bookOpen')} Открыть следующую главу</button>` : `<button class="secondary" data-reading-log>${icon('bookOpen')} Выбрать новое чтение</button>`}</section><section class="reading-panel section-panel"><p class="eyebrow">Достижения</p><h3>Шаг за шагом</h3><div class="reading-badges">${[7, 30, 90, 365].map(n => `<span class="${data.bestStreak >= n ? 'earned' : ''}">${data.bestStreak >= n ? '✓ ' : ''}${n} дней</span>`).join('')}</div><p>Открытый рубеж остаётся в достижениях, даже если текущая серия прервалась.</p></section></div>
      ${plansView(true)}`;
  }
  function plansView(preview = false) {
    const plans = data.plans.filter(p => !preview || (!p.cancelledAt && p.groupId === data.groupId && p.meetingDay >= data.today)).slice(0, preview ? 3 : 200);
    return `<section class="reading-panel section-panel"><div class="reading-section-heading section-heading"><div><p class="eyebrow">Встречаемся по вторникам</p><h3>Подготовка к домашке</h3></div>${data.groups.some(g=>leader(g.id))?`<button class="secondary" data-plan-create>${icon('plus')} Добавить план</button>`:''}</div><div class="reading-plan-list">${plans.map(p=>`<article class="reading-plan ${p.cancelledAt?'cancelled':''}"><header><div><strong>${e(p.title)}</strong><small>${e(group(p.groupId)?.name||'Без группы')}</small></div><time datetime="${e(p.meetingDay)}">${e(displayDay(p.meetingDay))}</time></header><p class="reading-passage">${icon('bookOpen')} <strong>${e(passage(p))}</strong>${p.reference?`<span>${e(p.reference)}</span>`:''}</p>${p.questions?`<p class="reading-text">${e(p.questions)}</p>`:''}${p.cancelledAt?`<p class="reading-cancelled">Отменён: ${e(p.cancelReason)}</p>`:`<div class="reading-plan-progress"><span>Мой прогресс</span><strong>${p.done}/${p.last-p.first+1}</strong>${p.meetingDay<data.today?'<small>Встреча прошла</small>':''}</div><div class="reading-row-actions">${p.meetingDay>=data.today&&data.groupId===p.groupId?`<button class="secondary" data-reading-plan="${p.id}">${p.done===p.last-p.first+1?'Перечитать':'Отметить прочитанное'}</button>`:''}${leader(p.groupId)?`<details class="reading-team-progress"><summary>Как готовится группа</summary>${p.progress.map(pr=>`<p><span>${e(profileName(pr.userId,pr.username,pr.displayName))}</span><strong>${pr.done}/${p.last-p.first+1}</strong></p>`).join('')||'<p>Пока нет участников</p>'}</details><button class="text-button" data-plan-cancel="${p.id}">Отменить план</button>`:''}</div>`}</article>`).join('')||`<div class="reading-empty">${icon('calendar')}<strong>Плана пока нет</strong><p>Когда лидер опубликует подготовку к встрече, она появится здесь.</p></div>`}</div></section>`;
  }
  function journalView() {
    const entryRow = (item, shared=false) => `<article class="reading-journal-row" data-journal-row><div class="reading-entry-main"><span class="reading-entry-state">${item.complete?'✓':'◐'}</span><div><strong>${e(passage(item))}</strong>${shared?`<small>${e(profileName(item.userId,item.username,item.displayName))}</small>`:''}</div></div>${item.note?`<p class="reading-text">${e(item.note)}</p>`:''}<footer><span>${item.stream==='group'?'Подготовка к группе':'Личное чтение'}${item.shared?' · открыто группе':' · только для меня'}</span>${!shared&&item.day===data.today?`<button class="text-button" data-reading-edit="${item.id}">Изменить</button>`:''}</footer></article>`;
    const reflectionRow = (item, shared=false) => `<article class="reading-journal-row reflection" data-journal-row><div class="reading-entry-main"><span class="reading-entry-state">${icon('edit')}</span><div><strong>${e(item.title||reflectionPassage(item))}</strong>${shared?`<small>${e(profileName(item.userId,item.username,item.displayName))}</small>`:item.title?`<small>${e(reflectionPassage(item))}</small>`:''}</div></div><p class="reading-text">${e(item.body)}</p><footer><span>${item.shared?'Открыто группе':'Только для меня'} · не влияет на серию</span>${!shared?`<button class="text-button" data-reflection-edit="${item.id}">Изменить</button>`:''}</footer></article>`;
    const grouped = items => {
      const byDay = new Map();
      items.sort((a,b)=>b.item.day.localeCompare(a.item.day)).forEach(row => { if (!byDay.has(row.item.day)) byDay.set(row.item.day, []); byDay.get(row.item.day).push(row); });
      return [...byDay].map(([day,rows])=>`<section class="reading-journal-day" data-journal-day><header><time datetime="${e(day)}">${e(displayDay(day))}</time><span>${plural(rows.length,'запись','записи','записей')}</span></header>${rows.map(row=>row.kind==='reflection'?reflectionRow(row.item,row.shared):entryRow(row.item,row.shared)).join('')}</section>`).join('');
    };
    const ownRows = grouped([...(data.reflections||[]).map(item=>({kind:'reflection',item,shared:false})),...data.entries.map(item=>({kind:'entry',item,shared:false}))]);
    const sharedItems = [...(data.sharedReflections||[]).map(item=>({kind:'reflection',item,shared:true})),...data.sharedNotes.map(item=>({kind:'entry',item,shared:true}))];
    const sharedRows = grouped(sharedItems);
    const cancelled = (data.cancelledEntries||[]).map(item=>`<article class="reading-journal-row"><div class="reading-entry-main"><span class="reading-entry-state cancelled">×</span><div><strong>${e(passage(item))}</strong><small>${e(displayDay(item.day))}</small></div></div>${item.note?`<p class="reading-text">${e(item.note)}</p>`:''}${item.day===data.today?`<footer><span>Ошибочная отметка</span><button class="text-button" data-reading-edit="${item.id}">Восстановить</button></footer>`:''}</article>`).join('');
    return `<section class="reading-panel section-panel reading-journal"><div class="reading-section-heading section-heading"><div><p class="eyebrow">Личная история</p><h3>Мой дневник</h3></div><button class="secondary" data-reflection-new>${icon('edit')} Записать мысль</button></div><label class="reading-search">${icon('search')}<span class="sr-only">Найти книгу, дату или мысль</span><input type="search" data-journal-search placeholder="Найти книгу, дату или мысль"></label><div class="reading-journal-days">${ownRows||`<div class="reading-empty">${icon('bookOpen')}<strong>Дневник пока пуст</strong><p>Отметьте чтение или сохраните отдельную мысль.</p></div>`}</div><p class="reading-search-empty" data-journal-empty hidden>По этому запросу ничего не найдено.</p>${cancelled?`<details class="reading-cancelled-list"><summary>Отменённые отметки · ${data.cancelledEntries.length}</summary>${cancelled}</details>`:''}</section><section class="reading-panel section-panel"><div class="reading-section-heading section-heading"><div><p class="eyebrow">Домашняя группа</p><h3>Общие мысли</h3></div><span class="reading-count">${sharedItems.length}</span></div><p>Здесь видны только записи, которыми участники решили поделиться.</p><div class="reading-journal-days">${sharedRows||`<div class="reading-empty compact">${icon('users')}<strong>Общих мыслей пока нет</strong></div>`}</div></section>`;
  }
  function rankingView() {
    return `<section class="reading-panel section-panel"><div class="reading-section-heading section-heading reading-ranking-heading"><div><p class="eyebrow">Личный результат</p><h3>Читаем вместе</h3></div><label>Период<select data-reading-period>${[['week','Последние 7 дней'],['month','Последние 30 дней'],['all','Всё время']].map(([v,l])=>option(v,l,period)).join('')}</select></label></div><p>Место определяется по полным главам. При одинаковом результате участники делят одну позицию.</p><div class="reading-ranking">${data.ranking.map(rank=>{const name=profileName(rank.userId,rank.username,rank.displayName);return `<article><strong class="reading-rank-place">${rank.place}</strong><span class="reading-person-avatar" aria-hidden="true">${e(initials(name))}</span><div class="reading-rank-person"><b>${e(name)}</b><small>${e(group(rank.groupId)?.name||'Без группы')}</small></div><div class="reading-rank-result"><b>${plural(rank.chapters,'глава','главы','глав')}</b><small>${plural(rank.days,'день','дня','дней')} · серия ${rank.currentStreak}</small></div></article>`;}).join('')}</div></section><section class="reading-panel section-panel"><div class="reading-section-heading section-heading"><div><p class="eyebrow">Последние 7 дней</p><h3>Регулярность групп</h3></div></div><p>Считаются дни чтения относительно доступных дней участия, поэтому размер группы не влияет на место.</p><div class="reading-group-stats">${[...data.groups].sort((a,b)=>(b.activeDays/(b.possibleDays||1))-(a.activeDays/(a.possibleDays||1))).map(g=>{const percent=g.possibleDays?Math.round(100*g.activeDays/g.possibleDays):0;return `<article><header><div><strong>${e(g.name)}</strong><small>${plural(g.members,'участник','участника','участников')}</small></div><b>${g.possibleDays?`${percent}%`:'—'}</b></header><progress max="100" value="${percent}"></progress><p>${g.possibleDays?`${g.activeDays} из ${g.possibleDays} доступных дней`:'Пока недостаточно данных'}</p></article>`;}).join('')}</div></section>`;
  }
  function groupsView() {
    return `<section class="reading-panel section-panel reading-groups-panel"><div class="reading-section-heading section-heading"><div><p class="eyebrow">Люди и подготовка</p><h3>Домашние группы</h3></div>${admin()?`<button class="primary" data-group-create>${icon('plus')} Создать группу</button>`:''}</div><p>У каждой группы свой лидер и план встречи. Общий рейтинг остаётся внутри этой команды.</p>${data.groupId?`<div class="reading-current-group"><label>Моя группа<select data-group-switch>${groupOptions(data.groupId)}</select></label><p>Группу можно сменить до первой отметки за сегодня. Прошлые результаты останутся на прежнем месте.</p></div>`:''}<div class="reading-group-grid">${data.groups.map(g=>{const leaderUser=state.users.find(user=>user.id===g.leaderId);const name=profileName(g.leaderId,leaderUser?.username,leaderUser?.displayName);return `<article class="reading-group-card ${g.id===data.groupId?'current':''}"><header><span>${icon('users')}</span><div><strong>${e(g.name)}</strong>${g.id===data.groupId?'<small>Моя группа</small>':''}</div></header><dl><div><dt>Лидер</dt><dd>${e(name)}</dd></div><div><dt>Состав</dt><dd>${plural(g.members,'участник','участника','участников')}</dd></div></dl>${admin()?`<button class="secondary" data-group-edit="${g.id}">${icon('sliders')} Настроить</button>`:''}</article>`;}).join('')}</div><p class="reading-footer-hint">Новых участников можно добавить в разделе «Команды».</p></section>`;
  }
  function showForm(title, html, draft, submit) {
    const context = key();
    body().innerHTML = `<form class="reading-form"><div class="modal-heading"><h2>${e(title)}</h2><button type="button" class="icon-button" data-close aria-label="Закрыть">${icon('x')}</button></div>${html}<p class="reading-form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Сохранить</button></div></form>`;
    const form = body().querySelector('form'); bindDraft(form, `reading:${context}:${draft}`);
    form.querySelector('[data-close]').onclick = () => closeDialog(dialog());
    form.onsubmit = async event => {
      event.preventDefault(); if (context !== key()) return;
      const button = form.querySelector('[type=submit]'), error = form.querySelector('[role=alert]'); button.disabled = true; error.hidden = true;
      try { await submit(new FormData(form)); if (context !== key()) return; clearDraft(form); await closeDialog(dialog()); await render(); }
      catch (err) { error.textContent = err.message; error.hidden = false; }
      finally { button.disabled = false; }
    };
    openModal(dialog()); return form;
  }
  function rangeFields(book,first,last) {
    return `<label>Книга<select name="book">${bookOptions(book)}</select></label><div class="reading-range"><label>С главы<input name="first" type="number" min="1" max="150" required value="${first}"></label><label>По главу<input name="last" type="number" min="1" max="150" required value="${last}"></label></div>`;
  }
  function entryForm(seed = {}, item = null) {
    if (!data.groupId) {toast('Сначала выберите свою домашнюю группу',true);return;}
    const date = data.today, initial = { book: data.nextBook || 43, first: data.nextChapter || 1, last: data.nextChapter || 1, stream: 'personal', ...seed };
    const form = showForm(item?'Исправить отметку':'Сегодня почитал',`${item?`<p>${e(passage(item))}</p>`:rangeFields(initial.book,initial.first,initial.last)}<p>${e(date)} · Москва. После полуночи этот день закрывается.</p>${!item?`<label>Зачем читаю<select name="stream">${option('personal','Личное чтение',initial.stream)}${option('group','Подготовка к группе',initial.stream)}</select></label>`:''}<label class="check"><input type="checkbox" name="complete" ${!item||item.complete?'checked':''}> Прочитал главу / все выбранные главы полностью</label><label>Мысли или точные стихи<textarea name="note" rows="5" maxlength="10000" placeholder="Что открылось в этом месте?">${e(item?.note||'')}</textarea></label><label class="check"><input type="checkbox" name="shared" ${item?.shared?'checked':''}> Поделиться заметкой с моей группой</label><p class="reading-muted">По умолчанию мысли видны только вам. Частичное чтение продлевает серию, но не даёт очко полной главы.</p>${item?'<label class="check"><input type="checkbox" name="cancel"> Отменить ошибочную отметку (сегодня)</label>':''}`,
      item?`entry:${item.id}`:`new:${date}`, async f => {
        const payload={note:String(f.get('note')||''),shared:f.has('shared'),complete:f.has('complete')};
        if(item) await call(`/entries/${item.id}`,{...payload,expectedUpdatedAt:item.updatedAt,cancel:f.has('cancel'),restore:!!item.cancelledAt},'PATCH');
        else {const saved=await call('/entries',{...payload,day:date,book:Number(f.get('book')),first:Number(f.get('first')),last:Number(f.get('last')),stream:f.get('stream')});if(!saved.added)throw new Error('Эти главы уже отмечены сегодня. Изменить заметку или дополнить частичное чтение можно в «Моём дневнике».');}
      });
    const select = form.querySelector('[name=book]');
    if(select)select.addEventListener('change',()=>{const max=data.books.find(b=>b.id===Number(select.value)).chapters;for(const name of ['first','last']){const field=form.elements[name];field.max=max;if(Number(field.value)>max)field.value=1;}});
  }
  function reflectionForm(item = null) {
    if (!data.groupId) {toast('Сначала выберите свою домашнюю группу',true);return;}
    const selected = item?.book || '';
    const form = showForm(item?'Редактировать мысль':'Новая мысль',`<p>${item?`${e(item.day)} · созданную мысль можно дополнять и позже`:`${e(data.today)} · Москва`}. Это запись дневника, она не отмечает чтение и не меняет серию.</p><label>Название<input name="title" maxlength="160" value="${e(item?.title||'')}" placeholder="Необязательно"></label><label>Место<select name="book"><option value="">Без привязки к главе</option>${bookOptions(selected)}</select></label><label>Глава<input name="chapter" type="number" min="1" max="150" value="${item?.chapter||''}" ${selected?'':'disabled'}></label><label>Мысль<textarea name="body" rows="7" maxlength="10000" required placeholder="Что хочется сохранить?">${e(item?.body||'')}</textarea></label><label class="check"><input type="checkbox" name="shared" ${item?.shared?'checked':''}> Поделиться с моей текущей группой</label><p class="reading-muted">По умолчанию текст виден только вам. После смены группы ранее опубликованная мысль больше не показывается прежней группе.</p>`, `reflection:${item?.id||'new'}`, async f => {
      const rawBook=String(f.get('book')||''),rawChapter=String(f.get('chapter')||'');
      const payload={title:String(f.get('title')||''),body:String(f.get('body')||''),shared:f.has('shared'),book:rawBook?Number(rawBook):null,chapter:rawBook&&rawChapter?Number(rawChapter):null};
      await call(item?`/reflections/${item.id}`:'/reflections',item?{...payload,expectedUpdatedAt:item.updatedAt}:payload,item?'PATCH':'POST');
    });
    const book=form.elements.book,chapter=form.elements.chapter;
    book.addEventListener('change',()=>{chapter.disabled=!book.value;if(!book.value){chapter.value='';return;}const max=data.books.find(item=>item.id===Number(book.value)).chapters;chapter.max=max;if(!chapter.value||Number(chapter.value)>max)chapter.value=1;});
  }
  function planForm() {
    const available=data.groups.filter(g=>leader(g.id));
    showForm('План к встрече',`<label>Группа<select name="groupId">${available.map(g=>option(g.id,g.name,data.groupId)).join('')}</select></label><label>Тема<input name="title" required maxlength="160"></label><label>Дата встречи<input type="date" name="meetingDay" required min="${data.today}" value="${nextTuesday(data.today)}"></label>${rangeFields(43,1,1)}<label>Уточнение местописания<input name="reference" maxlength="300" placeholder="Например: особое внимание стихам 1–12"></label><label>Вопросы для обсуждения<textarea name="questions" rows="5" maxlength="10000"></textarea></label><p>Готовность считается по полным главам. Для нескольких книг добавьте несколько пунктов. План можно отменить с причиной, история останется.</p>`,'plan:new',f=>call('/plans',{groupId:f.get('groupId'),title:f.get('title'),meetingDay:f.get('meetingDay'),book:Number(f.get('book')),first:Number(f.get('first')),last:Number(f.get('last')),reference:f.get('reference'),questions:f.get('questions')}));
  }
  function cancelPlan(id) {showForm('Отменить план','<label>Причина<textarea name="reason" required maxlength="1000"></textarea></label>',`cancel:${id}`,f=>call(`/plans/${id}/cancel`,{reason:f.get('reason')}));}
  function groupForm(g=null) {
    showForm(g?'Настроить группу':'Новая домашняя группа',`<label>Название<input name="name" required maxlength="100" value="${e(g?.name||'')}"></label><label>Лидер<select name="leaderId">${state.users.map(u=>option(u.id,profileName(u.id,u.username,u.displayName),g?.leaderId||state.me.id)).join('')}</select></label>`,'group:'+(g?.id||'new'),f=>call(g?`/groups/${g.id}`:'/groups',{name:f.get('name'),leaderId:Number(f.get('leaderId'))},g?'PATCH':'POST'));
  }
  return {render, open: () => { if (data && scope === key()) entryForm(); else toast('Дождитесь загрузки чтения', true); }};
}
