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
  const { state, api, escapeHTML: e, icon, toast, openModal, closeDialog, bindDraft, clearDraft, loadData } = ctx;
  let data = null, scope = '', request = 0, tab = 'read', period = 'week', selectedBook = 0;
  const root = () => document.querySelector('#main-content');
  const dialog = () => document.querySelector('#personal-dialog');
  const body = () => document.querySelector('#personal-dialog-content');
  const key = () => `${state.me?.id}:${state.activeWorkspaceId}`;
  const active = () => ['reading', 'dashboard'].includes(state.view);
  const admin = () => ['owner', 'admin'].includes(state.workspaces.find(w => w.id === state.activeWorkspaceId)?.role);
  const group = id => data.groups.find(g => g.id === id);
  const leader = id => admin() || group(id)?.leaderId === state.me.id;
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
      root().innerHTML = `<section class="reading-page"><h2>Чтение Библии</h2><p role="alert">${e(error.message)}</p>${error.status === 404 && admin() ? '<button class="primary" data-reading-enable>Включить чтение в этой команде</button>' : '<button data-reading-retry>Повторить</button>'}</section>`;
      root().querySelector('[data-reading-retry]')?.addEventListener('click', render);
      root().querySelector('[data-reading-enable]')?.addEventListener('click', async event => {
        event.target.disabled = true;
        try { await call('/enable', {}); await loadData(); await render(); } catch (err) { toast(err.message, true); event.target.disabled = false; }
      });
    }
  }
  function paint() {
    const tabs = [['read', 'Чтение'], ['today', 'Серия'], ['plans', 'Ко вторнику'], ['journal', 'Мой дневник'], ['ranking', 'Рейтинг'], ['groups', 'Группы']];
    root().innerHTML = `<div class="reading-page"><header class="reading-heading"><div><p class="eyebrow">Домашняя группа · ${e(data.today)} · Москва</p><h2>Время для Слова</h2><p class="reading-muted">Выберите книгу и одним нажатием отметьте прочитанную главу.</p></div><button data-reading-log>${icon('bookOpen')} Диапазон / частично</button></header>
      <nav class="reading-tabs" aria-label="Разделы чтения">${tabs.map(([id, title]) => `<button data-reading-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}">${title}</button>`).join('')}</nav>
      ${!data.groupId ? `<section class="reading-panel"><h3>Выберите свою домашку</h3><p>Сначала присоединитесь к группе. Отметки и заметки принадлежат вам; в рейтинг группы попадёт ваш вклад.</p><form id="reading-join"><label>Группа<select name="groupId">${groupOptions('')}</select></label><button class="primary">Присоединиться</button></form></section>` : ''}
      <div id="reading-tab-content">${tab === 'read' ? readView() : tab === 'today' ? todayView() : tab === 'plans' ? plansView() : tab === 'journal' ? journalView() : tab === 'ranking' ? rankingView() : groupsView()}</div></div>`;
    root().querySelectorAll('[data-reading-tab]').forEach(b => b.onclick = () => { tab = b.dataset.readingTab; paint(); });
    root().querySelectorAll('[data-reading-log]').forEach(b => b.onclick = () => entryForm());
    root().querySelectorAll('[data-reading-next]').forEach(b => b.onclick = () => fastMark(data.nextBook, data.nextChapter, b));
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
      const text = event.target.value.toLocaleLowerCase('ru'); root().querySelectorAll('[data-journal-row]').forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase('ru').includes(text); });
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
      if (saved.added) toast(`${bookName(book)} ${chapter} отмечена. Пометку можно добавить позже.`);
      else {
        const current = data.entries.find(item => item.day === data.today && item.book === book && item.chapter === chapter);
        if (current) entryForm({}, current); else toast('Глава уже отмечена. Обновите страницу, чтобы увидеть запись.', true);
      }
    } catch (error) {
      toast(error.message, true);
      if (button.isConnected) { button.disabled = false; button.removeAttribute('aria-busy'); }
    }
  }
  function readView() {
    const book = data.books.find(item => item.id === selectedBook) || data.books[42];
    const next = data.nextBook ? `${bookName(data.nextBook)} ${data.nextChapter}` : 'Маршрут завершён';
    const chapterButtons = Array.from({ length: book.chapters }, (_, index) => {
      const chapter = index + 1;
      const own = data.entries.filter(item => item.book === book.id && item.chapter === chapter).sort((a, b) => a.day.localeCompare(b.day));
      const last = own.at(-1), today = own.find(item => item.day === data.today), age = readingAge(last?.day, data.today);
      const stateText = today ? `отмечена сегодня, ${today.complete ? 'полностью' : 'частично'}; нажмите, чтобы добавить пометку или исправить` : `${age.label}${last ? `, ${last.complete ? 'полностью' : 'частично'}` : ''}; нажмите, чтобы отметить сегодня`;
      const classes = [`reading-age-${age.key}`, today ? 'is-read-today' : '', data.nextBook === book.id && data.nextChapter === chapter ? 'is-next' : ''].filter(Boolean).join(' ');
      return `<button data-reading-fast data-reading-chapter="${chapter}" class="${classes}" title="${e(`${book.name} ${chapter}: ${stateText}`)}" aria-label="${e(`${book.name} ${chapter}: ${stateText}`)}"><span>${chapter}</span>${last ? `<small aria-hidden="true">${today ? '✓' : last.complete ? '•' : '◐'}</small>` : ''}</button>`;
    }).join('');
    const bookGrid = testament => `<div class="reading-testament-grid">${data.books.filter(item => readingTestament(item.id) === testament).map(item => {
      const state = readingBookState(item, data.entries, data.today), selected = item.id === book.id;
      return `<button class="reading-testament-book reading-age-${state.age.key}" data-reading-book="${item.id}" aria-pressed="${selected}" title="${e(`${item.name}: ${state.count}/${item.chapters} глав, ${state.age.label}`)}" aria-label="${e(`${item.name}: прочитано ${state.count} из ${item.chapters} глав, ${state.age.label}`)}"><strong>${e(readingBookShortName(item.id))}</strong><small aria-hidden="true">${state.count}/${item.chapters}</small></button>`;
    }).join('')}</div>`;
    return `<section class="reading-panel reading-reader"><div class="reading-reader-heading"><div><p class="eyebrow">Открытая книга</p><h3>${e(book.name)}</h3></div>${data.nextBook ? `<button class="reading-next" data-reading-next title="Отметить предложенную главу">Следующая: ${e(next)}</button>` : `<span class="reading-muted">${e(next)}</span>`}</div><p>Нажмите номер — глава сразу отметится за сегодня. Нажмите отмеченную сегодня ещё раз, чтобы добавить пометку или исправить запись.</p><div class="reading-chapter-circles" aria-label="Главы книги ${e(book.name)}">${chapterButtons}</div></section>
      <section class="reading-panel reading-catalog"><div><h3>Книги Библии</h3><p>Цвет показывает, как давно вы читали книгу. Точная дата и охват доступны в подсказке и для экранного диктора.</p></div><div class="reading-legend">${[['never','Не читал'],['recent','До 7 дней'],['month','8–30 дней'],['old','31–90 дней'],['distant','Больше 90 дней']].map(([key,label])=>`<span class="reading-age-${key}">${label}</span>`).join('')}</div><h4>Ветхий Завет</h4>${bookGrid('old')}<h4>Новый Завет</h4>${bookGrid('new')}</section>`;
  }
  function todayView() {
    const todayEntries = data.entries.filter(item => item.day === data.today);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${data.today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i - 6); return d.toISOString().slice(0, 10); });
    return `<section class="reading-summary"><div><strong>${todayEntries.filter(x => x.complete).length}</strong><span>глав сегодня</span></div><div><strong>${data.currentStreak}</strong><span>дней подряд</span></div><div><strong>${data.bestStreak}</strong><span>лучшая серия</span></div></section>
      <div class="reading-week" aria-label="Последние семь дней">${days.map(day => `<div><span>${day.slice(5)}</span><strong aria-label="${day}: ${data.entries.some(item => item.day === day) ? 'есть чтение' : 'нет отметки'}">${data.entries.some(item => item.day === day) ? '✓' : '—'}</strong></div>`).join('')}</div>
      <p class="reading-muted">${todayEntries.length ? 'Сегодня чтение отмечено.' : 'Сегодня ещё можно продолжить серию.'} После 00:00 по Москве вчерашний день закрывается. Заморозок нет.</p>
      <div class="reading-columns"><section class="reading-panel"><p class="eyebrow">Личный маршрут</p><h3>${data.nextBook ? e(`${bookName(data.nextBook)} ${data.nextChapter}`) : 'Маршрут завершён'}</h3><p>Следующая глава после последнего полного личного чтения. План группы ведётся отдельно.</p>${data.nextBook ? '<button data-reading-next>Прочитал эту главу</button>' : '<button data-reading-log>Выбрать новое чтение</button>'}</section><section class="reading-panel"><p class="eyebrow">Достижения</p><h3>Шаг за шагом</h3><div class="reading-badges">${[7, 30, 90, 365].map(n => `<span class="${data.bestStreak >= n ? 'earned' : ''}">${data.bestStreak >= n ? '✓ ' : ''}${n} дней</span>`).join('')}</div><p>Достигнутый рубеж остаётся в лучшей серии, даже если текущая прервалась.</p></section></div>
      ${plansView(true)}`;
  }
  function plansView(preview = false) {
    const plans = data.plans.filter(p => !preview || (!p.cancelledAt && p.groupId === data.groupId && p.meetingDay >= data.today)).slice(0, preview ? 3 : 200);
    return `<section class="reading-panel"><div class="reading-heading"><div><p class="eyebrow">Встречаемся по вторникам</p><h3>Подготовка к домашке</h3></div>${data.groups.some(g=>leader(g.id))?'<button data-plan-create>Добавить план</button>':''}</div>${plans.map(p=>`<article class="reading-plan"><header><strong>${e(p.title)}</strong><span>${e(p.meetingDay)} · ${e(group(p.groupId)?.name||'')}</span></header><p>${e(passage(p))}${p.reference?` · ${e(p.reference)}`:''}</p><p class="reading-text">${e(p.questions)}</p>${p.cancelledAt?`<p>Отменён: ${e(p.cancelReason)}</p>`:`<p>Мой прогресс: ${p.done}/${p.last-p.first+1} полных глав ${p.meetingDay<data.today?'· встреча прошла':''}</p>${p.meetingDay>=data.today&&data.groupId===p.groupId?`<button data-reading-plan="${p.id}">${p.done===p.last-p.first+1?'Перечитать':'Отметить прочитанное'}</button>`:''}${leader(p.groupId)?`<details><summary>Как готовится группа</summary>${p.progress.map(pr=>`<p>@${e(pr.username)}: ${pr.done}/${p.last-p.first+1}</p>`).join('')||'<p>Пока нет участников</p>'}</details><button class="text-button" data-plan-cancel="${p.id}">Отменить с причиной</button>`:''}`}</article>`).join('')||'<p>Лидер ещё не опубликовал план. Местописания не назначаются автоматически.</p>'}</section>`;
  }
  function journalView() {
    const cancelled = (data.cancelledEntries||[]).map(item=>`<article class="reading-journal-row"><strong>${e(passage(item))} · ${e(item.day)} · отменено</strong><p class="reading-text">${e(item.note)}</p>${item.day===data.today?`<button data-reading-edit="${item.id}">Восстановить сегодняшнюю отметку</button>`:''}</article>`).join('');
    const entryRow = (item, shared=false) => `<article class="reading-journal-row" data-journal-row><header><strong>${e(passage(item))} ${item.complete?'✓':'◐'}</strong><span>${e(item.day)}${shared?` · @${e(item.username)}`:''}</span></header><p class="reading-text">${e(item.note||'Без заметки')}</p><small>${item.stream==='group'?'Подготовка к группе':'Личное чтение'} · ${item.shared?'Заметка открыта группе':'Заметка только для меня'}</small>${!shared&&item.day===data.today?`<button class="text-button" data-reading-edit="${item.id}">Исправить сегодняшнюю отметку</button>`:''}</article>`;
    const reflectionRow = (item, shared=false) => `<article class="reading-journal-row" data-journal-row><header><strong>${e(item.title||reflectionPassage(item))}</strong><span>${e(item.day)}${shared?` · @${e(item.username)}`:''}</span></header>${item.title?`<small>${e(reflectionPassage(item))}</small>`:''}<p class="reading-text">${e(item.body)}</p><small>${item.shared?'Мысль открыта группе':'Мысль только для меня'} · не влияет на серию и рейтинг</small>${!shared?`<button class="text-button" data-reflection-edit="${item.id}">Редактировать мысль</button>`:''}</article>`;
    const ownRows = [...data.reflections].reverse().map(item=>reflectionRow(item)).join('') + [...data.entries].reverse().map(item=>entryRow(item)).join('');
    const sharedRows = data.sharedReflections.map(item=>reflectionRow(item,true)).join('') + data.sharedNotes.map(item=>entryRow(item,true)).join('');
    return `<section class="reading-panel"><div class="reading-heading"><div><h3>Мой дневник</h3><p>Отметки чтения и отдельные мысли хранятся вместе.</p></div><button data-reflection-new>Записать мысль</button></div><label>Найти книгу, дату или мысль<input type="search" data-journal-search placeholder="Например: Иоанна или надежда"></label>${ownRows||'<p>Пока нет записей. Можно отметить чтение или сохранить отдельную мысль.</p>'}${cancelled?`<details><summary>Отменённые отметки</summary>${cancelled}</details>`:''}</section><section class="reading-panel"><h3>Мысли моей группы</h3><p>Только заметки и отдельные мысли, которыми авторы явно поделились.</p>${sharedRows||'<p>Пока никто не поделился мыслью.</p>'}</section>`;
  }
  function rankingView() {
    return `<section class="reading-panel"><div class="reading-heading"><h3>Читаем вместе</h3><label>Период<select data-reading-period>${[['week','Последние 7 дней'],['month','Последние 30 дней'],['all','Всё время']].map(([v,l])=>option(v,l,period)).join('')}</select></label></div><p>Место по полным главам. Одна глава — максимум один раз в день. Это статистика отметок, не оценка веры.</p><div class="reading-ranking">${data.ranking.map(rank=>`<article><strong>#${rank.place}</strong><div><b>@${e(rank.username)}</b><small>${e(group(rank.groupId)?.name||'Без группы')}</small></div><div><b>${rank.chapters} глав</b><small>${rank.days} дн. · серия ${rank.currentStreak}</small></div></article>`).join('')}</div></section><section class="reading-panel"><h3>Регулярность групп · 7 дней</h3><p>Дни чтения / доступные дни участия. Большая группа не получает преимущество только из-за размера.</p>${[...data.groups].sort((a,b)=>(b.activeDays/(b.possibleDays||1))-(a.activeDays/(a.possibleDays||1))).map(g=>`<article class="reading-plan"><strong>${e(g.name)}</strong><p>${g.possibleDays?`${Math.round(100*g.activeDays/g.possibleDays)}% · ${g.activeDays}/${g.possibleDays} дней`:'Пока нет данных'} · ${g.members} участников</p></article>`).join('')}</section>`;
  }
  function groupsView() {
    return `<section class="reading-panel"><div class="reading-heading"><h3>Домашние группы</h3>${admin()?'<button data-group-create>Создать группу</button>':''}</div><p>У каждой группы свои лидер и планы. Общее пространство и рейтинг принадлежат команде.</p>${data.groupId?`<label>Моя группа<select data-group-switch>${groupOptions(data.groupId)}</select></label><p class="reading-muted">Смена доступна до первой отметки за день. Прошлый вклад остаётся в исходной группе.</p>`:''}${data.groups.map(g=>`<article class="reading-plan"><strong>${e(g.name)}</strong><p>Лидер: @${e(state.users.find(u=>u.id===g.leaderId)?.username||String(g.leaderId))} · ${g.members} участников</p>${admin()?`<button data-group-edit="${g.id}">Название и лидер</button>`:''}</article>`).join('')}<p>Новых людей приглашайте через существующее управление командой: по логину, ссылке или коду.</p></section>`;
  }
  function showForm(title, html, draft, submit) {
    const context = key();
    body().innerHTML = `<form class="reading-form"><div class="modal-heading"><h2>${e(title)}</h2><button type="button" data-close aria-label="Закрыть">×</button></div>${html}<p class="reading-form-error" role="alert" hidden></p><div class="form-actions"><button type="submit" class="primary">Сохранить</button></div></form>`;
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
    showForm(g?'Настроить группу':'Новая домашняя группа',`<label>Название<input name="name" required maxlength="100" value="${e(g?.name||'')}"></label><label>Лидер<select name="leaderId">${state.users.map(u=>option(u.id,`@${u.username}`,g?.leaderId||state.me.id)).join('')}</select></label>`,'group:'+(g?.id||'new'),f=>call(g?`/groups/${g.id}`:'/groups',{name:f.get('name'),leaderId:Number(f.get('leaderId'))},g?'PATCH':'POST'));
  }
  return {render, open: () => { if (data && scope === key()) entryForm(); else toast('Дождитесь загрузки чтения', true); }};
}
