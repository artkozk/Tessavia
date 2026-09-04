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

export function createReadingUI(ctx) {
  const { state, api, escapeHTML: e, icon, toast, openModal, closeDialog, bindDraft, clearDraft, loadData } = ctx;
  let data = null, scope = '', request = 0, tab = 'today', period = 'week', selectedBook = 43;
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
  const bookOptions = id => data.books.map(b => option(b.id, b.name, id)).join('');
  const groupOptions = id => data.groups.map(g => option(g.id, g.name, id)).join('');
  const call = (path, payload, method = 'POST') => api(`/api/reading${path}`, { method, body: JSON.stringify(payload), headers: { 'X-Workspace-ID': state.activeWorkspaceId, 'X-Outbox-Owner': String(state.me.id) } });
  async function render() {
    const context = key(), sequence = ++request;
    if (scope !== context) { scope = context; data = null; tab = 'today'; selectedBook = 43; }
    root().innerHTML = '<section class="reading-page"><p role="status">Загружаем дневник чтения…</p></section>';
    try {
      const value = await api(`/api/reading?period=${period}`);
      if (context !== key() || sequence !== request || !active()) return;
      data = value; paint();
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
    const tabs = [['today', 'Сегодня'], ['map', 'Карта Библии'], ['plans', 'Ко вторнику'], ['journal', 'Мой дневник'], ['ranking', 'Рейтинг'], ['groups', 'Группы']];
    root().innerHTML = `<div class="reading-page"><header class="reading-heading"><div><p class="eyebrow">Домашняя группа · ${e(data.today)} · Москва</p><h2>Время для Слова</h2><p class="reading-muted">Личное чтение, размышления и подготовка к встрече.</p></div><button class="primary" data-reading-log>${icon('bookOpen')} Отметить чтение</button></header>
      <nav class="reading-tabs" aria-label="Разделы чтения">${tabs.map(([id, title]) => `<button data-reading-tab="${id}" aria-current="${tab === id ? 'page' : 'false'}">${title}</button>`).join('')}</nav>
      ${!data.groupId ? `<section class="reading-panel"><h3>Выберите свою домашку</h3><p>Сначала присоединитесь к группе. Отметки и заметки принадлежат вам; в рейтинг группы попадёт ваш вклад.</p><form id="reading-join"><label>Группа<select name="groupId">${groupOptions('')}</select></label><button class="primary">Присоединиться</button></form></section>` : ''}
      <div id="reading-tab-content">${tab === 'today' ? todayView() : tab === 'map' ? mapView() : tab === 'plans' ? plansView() : tab === 'journal' ? journalView() : tab === 'ranking' ? rankingView() : groupsView()}</div></div>`;
    root().querySelectorAll('[data-reading-tab]').forEach(b => b.onclick = () => { tab = b.dataset.readingTab; paint(); });
    root().querySelectorAll('[data-reading-log]').forEach(b => b.onclick = () => entryForm());
    root().querySelectorAll('[data-reading-next]').forEach(b => b.onclick = () => entryForm({ book: data.nextBook, first: data.nextChapter, last: data.nextChapter }));
    root().querySelectorAll('[data-reading-book]').forEach(b => b.onclick = () => { selectedBook = Number(b.dataset.readingBook); paint(); root().querySelector('.reading-chapters')?.scrollIntoView({ block: 'center' }); });
    root().querySelectorAll('[data-reading-chapter]').forEach(b => b.onclick = () => entryForm({ book: selectedBook, first: Number(b.dataset.readingChapter), last: Number(b.dataset.readingChapter) }));
    root().querySelectorAll('[data-reading-edit]').forEach(b => b.onclick = () => entryForm({}, [...data.entries,...(data.cancelledEntries||[])].find(item => item.id === b.dataset.readingEdit)));
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
  function todayView() {
    const todayEntries = data.entries.filter(item => item.day === data.today);
    const days = Array.from({ length: 7 }, (_, i) => { const d = new Date(`${data.today}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + i - 6); return d.toISOString().slice(0, 10); });
    return `<section class="reading-summary"><div><strong>${todayEntries.filter(x => x.complete).length}</strong><span>глав сегодня</span></div><div><strong>${data.currentStreak}</strong><span>дней подряд</span></div><div><strong>${data.bestStreak}</strong><span>лучшая серия</span></div></section>
      <div class="reading-week" aria-label="Последние семь дней">${days.map(day => `<div><span>${day.slice(5)}</span><strong aria-label="${day}: ${data.entries.some(item => item.day === day) ? 'есть чтение' : 'нет отметки'}">${data.entries.some(item => item.day === day) ? '✓' : '—'}</strong></div>`).join('')}</div>
      <p class="reading-muted">${todayEntries.length ? 'Сегодня чтение отмечено.' : 'Сегодня ещё можно продолжить серию.'} После 00:00 по Москве вчерашний день закрывается. Заморозок нет.</p>
      <div class="reading-columns"><section class="reading-panel"><p class="eyebrow">Личный маршрут</p><h3>${data.nextBook ? e(`${bookName(data.nextBook)} ${data.nextChapter}`) : 'Маршрут завершён'}</h3><p>Следующая глава после последнего полного личного чтения. План группы ведётся отдельно.</p>${data.nextBook ? '<button data-reading-next>Прочитал эту главу</button>' : '<button data-reading-log>Выбрать новое чтение</button>'}</section><section class="reading-panel"><p class="eyebrow">Достижения</p><h3>Шаг за шагом</h3><div class="reading-badges">${[7, 30, 90, 365].map(n => `<span class="${data.bestStreak >= n ? 'earned' : ''}">${data.bestStreak >= n ? '✓ ' : ''}${n} дней</span>`).join('')}</div><p>Достигнутый рубеж остаётся в лучшей серии, даже если текущая прервалась.</p></section></div>
      ${plansView(true)}`;
  }
  function mapView() {
    const book = data.books.find(b => b.id === selectedBook);
    return `<section class="reading-panel"><h3>Что осталось в памяти</h3><p>Каталог: 66 книг. Насыщенность показывает давность отметки, число — охват полных глав.</p><div class="reading-legend">${[['never','Никогда'],['recent','До 7 дней'],['month','8–30 дней'],['old','31–90 дней'],['distant','Больше 90 дней']].map(([key,label])=>`<span class="reading-age-${key}">${label}</span>`).join('')}</div>
      <div class="reading-books">${data.books.map(b => {const s=readingBookState(b,data.entries,data.today);return `<button class="reading-book reading-age-${s.age.key}" data-reading-book="${b.id}" aria-pressed="${b.id===selectedBook}"><strong>${e(b.name)}</strong><span>${s.count}/${b.chapters} глав</span><small>${s.age.label}</small></button>`;}).join('')}</div></section>
      <section class="reading-panel"><h3>${e(book.name)} · по главам</h3><p>✓ — полностью, ◐ — частично. Нажмите главу, чтобы отметить сегодняшнее чтение.</p><div class="reading-chapters">${Array.from({length:book.chapters},(_,i)=>{const chapter=i+1;const own=data.entries.filter(x=>x.book===book.id&&x.chapter===chapter).sort((a,b)=>a.day.localeCompare(b.day));const last=own.at(-1);const age=readingAge(last?.day,data.today);return `<button data-reading-chapter="${chapter}" class="reading-age-${age.key}" title="${e(`${book.name} ${chapter}: ${age.label}${last?`, ${last.day}`:''}`)}" aria-label="${e(`${book.name} ${chapter}: ${age.label}${last?`, ${last.complete?'полностью':'частично'}`:''}`)}">${chapter}${last?last.complete?' ✓':' ◐':''}</button>`;}).join('')}</div></section>`;
  }
  function plansView(preview = false) {
    const plans = data.plans.filter(p => !preview || (!p.cancelledAt && p.groupId === data.groupId && p.meetingDay >= data.today)).slice(0, preview ? 3 : 200);
    return `<section class="reading-panel"><div class="reading-heading"><div><p class="eyebrow">Встречаемся по вторникам</p><h3>Подготовка к домашке</h3></div>${data.groups.some(g=>leader(g.id))?'<button data-plan-create>Добавить план</button>':''}</div>${plans.map(p=>`<article class="reading-plan"><header><strong>${e(p.title)}</strong><span>${e(p.meetingDay)} · ${e(group(p.groupId)?.name||'')}</span></header><p>${e(passage(p))}${p.reference?` · ${e(p.reference)}`:''}</p><p class="reading-text">${e(p.questions)}</p>${p.cancelledAt?`<p>Отменён: ${e(p.cancelReason)}</p>`:`<p>Мой прогресс: ${p.done}/${p.last-p.first+1} полных глав ${p.meetingDay<data.today?'· встреча прошла':''}</p>${p.meetingDay>=data.today&&data.groupId===p.groupId?`<button data-reading-plan="${p.id}">${p.done===p.last-p.first+1?'Перечитать':'Отметить прочитанное'}</button>`:''}${leader(p.groupId)?`<details><summary>Как готовится группа</summary>${p.progress.map(pr=>`<p>@${e(pr.username)}: ${pr.done}/${p.last-p.first+1}</p>`).join('')||'<p>Пока нет участников</p>'}</details><button class="text-button" data-plan-cancel="${p.id}">Отменить с причиной</button>`:''}`}</article>`).join('')||'<p>Лидер ещё не опубликовал план. Местописания не назначаются автоматически.</p>'}</section>`;
  }
  function journalView() {
    const cancelled = (data.cancelledEntries||[]).map(item=>`<article class="reading-journal-row"><strong>${e(passage(item))} · ${e(item.day)} · отменено</strong><p class="reading-text">${e(item.note)}</p>${item.day===data.today?`<button data-reading-edit="${item.id}">Восстановить сегодняшнюю отметку</button>`:''}</article>`).join('');
    const entryRow = (item, shared=false) => `<article class="reading-journal-row" data-journal-row><header><strong>${e(passage(item))} ${item.complete?'✓':'◐'}</strong><span>${e(item.day)}${shared?` · @${e(item.username)}`:''}</span></header><p class="reading-text">${e(item.note||'Без заметки')}</p><small>${item.stream==='group'?'Подготовка к группе':'Личное чтение'} · ${item.shared?'Заметка открыта группе':'Заметка только для меня'}</small>${!shared&&item.day===data.today?`<button class="text-button" data-reading-edit="${item.id}">Исправить сегодняшнюю отметку</button>`:''}</article>`;
    return `<section class="reading-panel"><h3>Мой дневник</h3><label>Найти книгу, дату или мысль<input type="search" data-journal-search placeholder="Например: Иоанна или надежда"></label>${[...data.entries].reverse().map(item=>entryRow(item)).join('')||'<p>Пока нет отметок. Начните с сегодняшнего чтения.</p>'}${cancelled?`<details><summary>Отменённые отметки</summary>${cancelled}</details>`:''}</section><section class="reading-panel"><h3>Мысли моей группы</h3><p>Только заметки, которыми авторы явно поделились.</p>${data.sharedNotes.map(item=>entryRow(item,true)).join('')||'<p>Пока никто не поделился заметкой.</p>'}</section>`;
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
