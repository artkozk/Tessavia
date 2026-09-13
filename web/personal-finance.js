const financeLimit = 1000000000000n;
const requestId = () => globalThis.crypto?.randomUUID?.() || `finance-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const localDate = (date = new Date()) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const amount = value => BigInt(value || 0);

export function parseFinanceMinor(value, { positive = false } = {}) {
  const text = String(value ?? '').trim().replace(/[ \u00a0\u202f]/g, '').replace(',', '.');
  if (!/^\d+(?:\.\d{1,2})?$/.test(text)) throw new Error('Введите сумму в рублях: например, 1250,50. Допустимы две цифры после запятой.');
  const [whole, fraction = ''] = text.split('.');
  const minor = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor > financeLimit || (positive && minor === 0n)) throw new Error(positive && minor === 0n ? 'Сумма должна быть больше нуля.' : 'Сумма слишком велика.');
  return Number(minor);
}

export function parseFinanceBasisPoints(value) {
  const points = parseFinanceMinor(value);
  if (points > 10000) throw new Error('Доля должна быть от 0 до 100%.');
  return points;
}

export function financeMoney(value) {
  const minor = amount(value), sign = minor < 0n ? '−' : '', absolute = minor < 0n ? -minor : minor;
  const whole = (absolute / 100n).toLocaleString('ru-RU');
  const fraction = absolute % 100n;
  return `${sign}${whole}${fraction ? `,${String(fraction).padStart(2, '0')}` : ''} ₽`;
}

const moneyInput = value => `${amount(value) / 100n}.${String(amount(value) % 100n).padStart(2, '0')}`;
const percent = value => String(Number(value) / 100).replace('.', ',');

export function createFinanceRequestDraft(id = requestId()) {
  let uncertain = null;
  return {
    isUncertain: () => uncertain !== null,
    async submit(payload, send) {
      const serialized = JSON.stringify(payload);
      if (uncertain !== null && uncertain !== serialized) throw new Error('Предыдущее сохранение ещё не подтверждено. Повторите его с прежними значениями или сначала проверьте журнал доходов.');
      try { const result = await send({ ...payload, clientRequestId: id }); uncertain = null; return result; }
      catch (error) { uncertain = !error.status || error.status >= 500 ? serialized : null; throw error; }
    },
  };
}

export function financeMonthRange(month) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month) || Number(month.slice(0, 4)) < 1900 || Number(month.slice(0, 4)) > 9998) throw new Error('Выберите месяц отчёта.');
  const [year, number] = month.split('-').map(Number);
  return { from: `${month}-01`, to: `${month}-${new Date(year, number, 0).getDate()}` };
}

export function validateFinanceDate(date) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '') || date < '1900-01-01' || date > '9998-12-31') throw new Error('Укажите дату от 01.01.1900 до 31.12.9998.');
  const parsed = new Date(`${date}T12:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new Error('Укажите существующую календарную дату.');
  return date;
}

export function financePayerKey(entry) {
  return entry.payerId ? `payer:${entry.payerId}` : entry.payer ? `legacy:${entry.payer}` : 'none:';
}

export function financePayerOptions(data) {
  const choices = new Map();
  for (const payer of data.counterparties || []) choices.set(`payer:${payer.id}`, { key: `payer:${payer.id}`, id: payer.id, name: payer.name, note: payer.note || '', archived: Boolean(payer.archived), legacy: false });
  for (const entry of data.entries || []) {
    const key = financePayerKey(entry);
    if (!choices.has(key)) choices.set(key, { key, id: entry.payerId || '', name: entry.payer || 'Не указан', note: '', archived: false, legacy: !entry.payerId && Boolean(entry.payer) });
  }
  return [...choices.values()];
}

export function filterFinanceByPayer(data, key = '') {
  return key ? { ...data, entries: (data.entries || []).filter(entry => financePayerKey(entry) === key) } : data;
}

export function financeEntryPayerPayload(entry, selection, counterparties, manual = '') {
  if (!selection || selection === '__manual__') return { payerId: '', payer: selection === '__manual__' ? manual.trim() : '', expectedPayerRevision: 0 };
  const payer = counterparties.find(item => item.id === selection);
  if (!payer || payer.archived && entry?.payerId !== selection) throw new Error('Плательщик недоступен для нового выбора. Обновите список и выберите действующего плательщика.');
  return { payerId: payer.id, payer: entry?.payerId === payer.id ? entry.payer : payer.name, expectedPayerRevision: payer.revision };
}

export function financeCounterpartyPayload(name, note = '') {
  const value = { name: String(name || '').trim(), note: String(note || '').trim() };
  if (!value.name || [...value.name].length > 160 || [...value.note].length > 2000) throw new Error('Укажите имя до 160 символов и заметку до 2000 символов.');
  return value;
}

export function summarizeFinance(data) {
  const result = { grossMinor: 0n, workerMinor: 0n, baseMinor: 0n, paidMinor: 0n, count: 0, buckets: [], sources: [], payers: [] };
  const buckets = new Map(), sources = new Map(), payers = new Map();
  const payerNames = new Map(financePayerOptions(data).map(payer => [payer.key, payer]));
  for (const entry of data.entries || []) {
    if (entry.voided) continue;
    result.count += 1;
    for (const key of ['grossMinor', 'workerMinor', 'baseMinor']) result[key] += amount(entry[key]);
    let source = sources.get(entry.sourceId);
    if (!source) { source = { id: entry.sourceId, name: entry.sourceName, grossMinor: 0n, workerMinor: 0n, baseMinor: 0n, count: 0 }; sources.set(entry.sourceId, source); }
    source.count += 1;
    for (const key of ['grossMinor', 'workerMinor', 'baseMinor']) source[key] += amount(entry[key]);
    const payerKey = financePayerKey(entry);
    let payer = payers.get(payerKey);
    if (!payer) { payer = { ...payerNames.get(payerKey), grossMinor: 0n, workerMinor: 0n, baseMinor: 0n, count: 0 }; payers.set(payerKey, payer); }
    payer.count += 1;
    for (const key of ['grossMinor', 'workerMinor', 'baseMinor']) payer[key] += amount(entry[key]);
    for (const allocation of entry.allocations || []) {
      let bucket = buckets.get(allocation.bucketId);
      if (!bucket) {
        const current = (data.buckets || []).find(item => item.id === allocation.bucketId);
        bucket = { id: allocation.bucketId, name: allocation.bucketName, destination: current?.destination || '', allocatedMinor: 0n, paidMinor: 0n, remainingMinor: 0n };
        buckets.set(allocation.bucketId, bucket);
      }
      bucket.allocatedMinor += amount(allocation.amountMinor);
      bucket.paidMinor += amount(allocation.paidMinor);
      bucket.remainingMinor = bucket.allocatedMinor - bucket.paidMinor;
      result.paidMinor += amount(allocation.paidMinor);
    }
  }
  result.buckets = [...buckets.values()]; result.sources = [...sources.values()]; result.payers = [...payers.values()];
  return result;
}

export function financeCSV(data) {
  const cell = value => {
    let text = String(value ?? '');
    if (/^[\s]*[=+\-@]/.test(text) || /^[\t\r\n]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
  };
  const entries = (data.entries || []).filter(entry => !entry.voided);
  const buckets = new Map();
  for (const entry of entries) for (const part of entry.allocations || []) if (!buckets.has(part.bucketId)) buckets.set(part.bucketId, part.bucketName);
  const rows = [['Дата', 'Источник', 'От кого', 'Доход, RUB', 'Исполнителям, RUB', 'К распределению, RUB', 'Примечание', ...[...buckets.values()].flatMap(name => [`${name}: распределено, RUB`, `${name}: отмечено переводом, RUB`, `${name}: осталось, RUB`])]];
  // One income per row: summing the income column must not count it once per bucket.
  for (const entry of entries) rows.push([
    entry.date, entry.sourceName, entry.payer, moneyInput(entry.grossMinor), moneyInput(entry.workerMinor), moneyInput(entry.baseMinor), entry.note,
    ...[...buckets.keys()].flatMap(id => { const part = entry.allocations.find(item => item.bucketId === id); return part ? [moneyInput(part.amountMinor), moneyInput(part.paidMinor), moneyInput(amount(part.amountMinor) - amount(part.paidMinor))] : ['0.00', '0.00', '0.00']; }),
  ]);
  return '\ufeff' + rows.map(row => row.map(cell).join(';')).join('\r\n');
}

export function createPersonalFinanceUI({ state, api, escapeHTML, icon, openModal, requestDialogClose, toast, enhanceSelects, bindComposerForm, renderPersonal }) {
  const e = value => escapeHTML(String(value ?? ''));
  const q = (selector, root = document) => root.querySelector(selector);
  const qa = (selector, root = document) => [...root.querySelectorAll(selector)];
  const dialog = () => q('#workspace-dialog'), content = () => q('#workspace-dialog-content');
  const dateLabel = date => /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? new Date(`${date}T12:00:00`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) : date;
  let month = localDate().slice(0, 7), payerFilter = '', cached = null, pending = null, generation = 0, dialogTurn = 0, ownerSeen = null;
  const owner = () => state.me?.id;
  const visible = () => state.view === 'personal' && state.personalTab === 'finance';
  const context = () => ({ owner: owner(), workspace: state.activeWorkspaceId });
  const same = ctx => ctx.owner === owner() && ctx.workspace === state.activeWorkspaceId;
  const request = (ctx, path = '', options = {}) => api(`/api/personal/finance${path}`, { ...options, headers: { ...options.headers, 'X-Outbox-Owner': String(ctx.owner) } });
  const current = () => cached?.owner === owner() && cached.month === month ? cached.data : null;
  function accountBoundary() { if (ownerSeen !== owner()) { ownerSeen = owner(); cached = null; pending = null; generation += 1; month = localDate().slice(0, 7); payerFilter = ''; } }
  function repaint() { if (visible() && !state.pageLayoutDraft && !state.layoutDraft) renderPersonal(); }
  function invalidate() { generation += 1; cached = null; pending = null; }

  async function load({ force = false } = {}) {
    accountBoundary(); const ctx = context(); if (!ctx.owner) return null;
    const key = `${ctx.owner}:${ctx.workspace}:${month}`;
    if (!force && current()) return current();
    if (!force && pending?.key === key) return pending.promise;
    const turn = ++generation, selected = month, range = financeMonthRange(selected);
    const entry = { key, promise: null }; pending = entry;
    entry.promise = (async () => {
      try {
        const data = await request(ctx, `?from=${range.from}&to=${range.to}`);
        if (!same(ctx) || turn !== generation || month !== selected) return null;
        cached = { owner: ctx.owner, month: selected, data }; return data;
      } catch (error) {
        if (same(ctx) && turn === generation && month === selected) cached = { owner: ctx.owner, month: selected, error: error.message };
        return null;
      } finally { if (pending === entry) pending = null; if (same(ctx) && turn === generation) repaint(); }
    })();
    return entry.promise;
  }

  const errorLine = () => cached?.owner === owner() && cached.month === month && cached.error
    ? `<div class="finance-load-state"><p class="form-error" role="alert">${e(cached.error)}</p><button type="button" class="secondary" data-finance-retry>Повторить</button></div>`
    : '<p class="finance-load-state muted" role="status">Загружаем личные финансы…</p>';
  const reportStat = (label, value) => `<div><span>${e(label)}</span><strong>${e(financeMoney(value))}</strong></div>`;
  const payerChoiceLabel = payer => `${payer.name}${payer.legacy ? ' · без справочника' : ''}${payer.archived ? ' · архив' : ''}${payer.note ? ` · ${payer.note.slice(0, 60)}${payer.note.length > 60 ? '…' : ''}` : ''}`;
  function render() {
    accountBoundary();
    const data = current(), scoped = data ? filterFinanceByPayer(data, payerFilter) : null, report = scoped ? summarizeFinance(scoped) : null;
    const activeSources = data?.sources?.filter(item => !item.archived) || [];
    const journal = scoped?.entries || [], choices = data ? financePayerOptions(data) : [];
    if (payerFilter && !choices.some(payer => payer.key === payerFilter)) choices.push({ key: payerFilter, name: payerFilter.startsWith('legacy:') ? payerFilter.slice(7) : payerFilter === 'none:' ? 'Не указан' : 'Выбранный плательщик', legacy: payerFilter.startsWith('legacy:') });
    const selectedPayer = choices.find(payer => payer.key === payerFilter);
    return `<section class="personal-finance" data-personal-finance>
      <header class="finance-heading"><div><h2>Финансы</h2><p>Доходы и распределение · только для вас</p></div><button type="button" class="primary" data-finance-add ${activeSources.length ? '' : 'disabled'}>${icon('plus')} Добавить доход</button></header>
      <div class="finance-toolbar"><label>Месяц<input type="month" data-finance-month value="${e(month)}" min="1900-01" max="9998-12" aria-label="Месяц отчёта"></label>${data ? `<label class="finance-payer-filter">Плательщик<select data-finance-payer-filter aria-label="Плательщик в отчёте"><option value="">Все плательщики</option>${choices.map(payer => `<option value="${e(payer.key)}" ${payer.key === payerFilter ? 'selected' : ''}>${e(payerChoiceLabel(payer))}</option>`).join('')}</select></label>` : ''}<button type="button" class="text-button" data-finance-refresh ${pending ? 'disabled' : ''}>${icon('rotate')} Обновить</button>${journal.some(entry => !entry.voided) ? `<button type="button" class="text-button" data-finance-export>${icon('download')} Скачать CSV</button>` : ''}</div>
      ${data ? `<div class="finance-report-scope" role="status"><p>${payerFilter ? `Все суммы, распределение и доходы ниже: ${e(payerChoiceLabel(selectedPayer))} · ${e(month)}` : `Все плательщики · ${e(month)}`}</p>${payerFilter ? '<button type="button" class="text-button" data-finance-clear-payer>Сбросить фильтр</button>' : ''}</div>` : ''}
      ${data ? `${!activeSources.length ? `<div class="finance-empty"><h3>${data.sources.length ? 'Нет активных источников дохода' : 'Начните со своих правил'}</h3><p>Создайте направления, затем источник дохода и доли распределения. У каждого дохода сохранится свой расчёт.</p><button type="button" class="secondary" data-finance-settings>${icon('settings')} Настроить финансы</button></div>` : ''}
      <div class="finance-totals" aria-label="${payerFilter ? 'Итоги выбранного плательщика за месяц' : 'Итоги месяца'}">${reportStat('Доход', report.grossMinor)}${reportStat('Исполнителям', report.workerMinor)}${reportStat('К распределению', report.baseMinor)}</div>
      <section class="finance-section"><div class="section-heading"><h3>По направлениям</h3><span class="muted">Записей: ${report.count}</span></div><p class="finance-caption">«Отмечено» — ваш учёт перевода. Tessavie не переводит деньги и не проверяет банк.</p>
        ${report.buckets.length ? `<div class="finance-buckets">${report.buckets.map(bucket => `<article class="finance-bucket"><div><h4>${e(bucket.name)}</h4><p>${bucket.destination ? e(bucket.destination) : 'Назначение не указано'}</p></div><div class="finance-bucket-amounts">${reportStat('Распределено', bucket.allocatedMinor)}${reportStat('Отмечено', bucket.paidMinor)}${reportStat('Осталось', bucket.remainingMinor)}</div><progress max="1000" value="${bucket.allocatedMinor ? Number(bucket.paidMinor * 1000n / bucket.allocatedMinor) : 0}" aria-label="${e(`Переводы: ${bucket.name}`)}"></progress></article>`).join('')}</div>` : '<p class="finance-empty-note">В этом месяце пока нет распределённых доходов.</p>'}
      </section>
      <section class="finance-section"><div class="section-heading"><h3 data-finance-journal-heading tabindex="-1">Доходы</h3><span class="muted">${journal.length}</span></div>${journal.length ? `<div class="finance-journal">${journal.map(entry => `<button type="button" class="finance-income ${entry.voided ? 'is-voided' : ''}" data-finance-entry="${e(entry.id)}"><time>${e(dateLabel(entry.date))}</time><span><strong>${e(entry.sourceName)}</strong><small>${e(entry.payer || 'Плательщик не указан')}${entry.voided ? ' · Отменён' : ''}</small>${entry.note ? `<small class="finance-income-note">${e(entry.note)}</small>` : ''}</span><strong>${e(financeMoney(entry.grossMinor))}</strong><span aria-hidden="true">${icon('chevronRight')}</span></button>`).join('')}</div>` : `<p class="finance-empty-note">${payerFilter ? 'У выбранного плательщика нет доходов в этом месяце. Можно сменить месяц или сбросить фильтр.' : 'В выбранном месяце доходов нет. Добавленный доход появится здесь вместе с разбором распределения.'}</p>`}</section>
      ${report.sources.length ? `<details class="finance-sources-report"><summary>Отчёт по источникам</summary><div>${report.sources.map(source => `<article><h4>${e(source.name)}</h4><div class="finance-bucket-amounts">${reportStat('Доход', source.grossMinor)}${reportStat('Исполнителям', source.workerMinor)}${reportStat('К распределению', source.baseMinor)}</div></article>`).join('')}</div></details>` : ''}
      ${report.payers.length ? `<details class="finance-payers-report" ${payerFilter ? 'open' : ''}><summary>Отчёт по плательщикам</summary><div>${report.payers.map(payer => `<button type="button" data-finance-payer-report="${e(payer.key)}"><span class="finance-payer-report-name"><strong>${e(payer.name)}</strong><small>${payer.legacy ? 'Без связи со справочником · ' : ''}${payer.archived ? 'В архиве · ' : ''}Доходов: ${payer.count}</small></span><span class="finance-payer-report-metric"><small>Доход</small><strong>${e(financeMoney(payer.grossMinor))}</strong></span><span class="finance-payer-report-metric"><small>К распределению</small><strong>${e(financeMoney(payer.baseMinor))}</strong></span><span aria-hidden="true">${icon('chevronRight')}</span></button>`).join('')}</div></details>` : ''}` : errorLine()}
    </section>`;
  }

  function bind() {
    const root = q('[data-personal-finance]'); if (!root) return;
    if (!current() && !cached?.error) void load();
    q('[data-finance-month]', root).onchange = event => { try { financeMonthRange(event.target.value); month = event.target.value; invalidate(); repaint(); void load(); } catch (error) { event.target.value = month; toast(error.message, true); } };
    q('[data-finance-retry]', root)?.addEventListener('click', () => { invalidate(); repaint(); void load(); });
    q('[data-finance-refresh]', root)?.addEventListener('click', () => { invalidate(); repaint(); void load(); });
    q('[data-finance-add]', root)?.addEventListener('click', () => openEntryForm());
    q('[data-finance-settings]', root)?.addEventListener('click', openSettings);
    enhanceSelects?.(root);
    q('[data-finance-payer-filter]', root)?.addEventListener('change', event => { payerFilter = event.target.value; repaint(); });
    q('[data-finance-clear-payer]', root)?.addEventListener('click', () => { payerFilter = ''; repaint(); });
    qa('[data-finance-payer-report]', root).forEach(button => button.onclick = () => { payerFilter = button.dataset.financePayerReport; repaint(); const heading = q('[data-finance-journal-heading]'); heading?.scrollIntoView({ block: 'start' }); heading?.focus({ preventScroll: true }); });
    qa('[data-finance-entry]', root).forEach(button => button.onclick = () => openEntry(button.dataset.financeEntry));
    q('[data-finance-export]', root)?.addEventListener('click', () => {
      const data = current(); if (!data) return;
      const url = URL.createObjectURL(new Blob([financeCSV(filterFinanceByPayer(data, payerFilter))], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = `Tessavie-finance-${month}${payerFilter ? '-payer' : ''}.csv`; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
  }

  async function replaceDialog(title, body, back = null) {
    const box = dialog(); if (!box || !owner()) return null;
    if (box.dataset.settingsSaving === 'true') { toast('Дождитесь завершения сохранения.'); return null; }
    if (box.open && (box.dataset.financeOwner !== String(owner()) || !q('[data-finance-dialog]', content()))) return null;
    if (box.open && box.dataset.composerDirty === 'true' && !confirm('Перейти без сохранения изменений?')) return null;
    box.dataset.composerDirty = 'false'; box.dataset.financeOwner = String(owner());
    const turn = ++dialogTurn, ctx = context();
    content().innerHTML = `<div class="workspace-editor-shell finance-dialog" data-finance-dialog="${turn}"><header><div>${back ? `<button type="button" class="text-button finance-back" data-finance-back>${icon('chevronLeft')} Назад</button>` : ''}<h2>${e(title)}</h2></div><button type="button" class="icon-button" data-finance-close aria-label="Закрыть финансы">${icon('x')}</button></header>${body}</div>`;
    const root = q('[data-finance-dialog]', content());
    q('[data-finance-close]', root).onclick = () => requestDialogClose(box);
    q('[data-finance-back]', root)?.addEventListener('click', back);
    openModal(box); enhanceSelects?.(root);
    // Reusing the shared dialog must not carry the bottom of the previous form
    // into a new entry, transfer result or settings page.
    box.scrollTop = 0; content().scrollTop = 0; root.scrollTop = 0;
    q('[data-finance-close]', root).focus({ preventScroll: true });
    return { root, ctx, turn, alive: () => same(ctx) && turn === dialogTurn && root.isConnected && box.open };
  }

  const formError = '<p class="form-error" data-finance-main-error role="alert" hidden></p>';
  const submitRow = label => `<div class="form-actions"><button type="submit" class="primary">${e(label)}</button></div>`;
  const moneyField = (name, label, value = '', required = true) => `<label>${e(label)}<input name="${name}" inputmode="decimal" type="text" autocomplete="off" ${required ? 'required' : ''} value="${e(value)}" placeholder="0,00"></label>`;
  function bindForm(view, save, after, onFailure = null) {
    const form = q('form', view.root); if (!form) return;
    bindComposerForm?.(form); let busy = false;
    form.onsubmit = async event => {
      event.preventDefault(); if (busy || !view.alive() || dialog().dataset.settingsSaving === 'true') return;
      const error = q('[data-finance-main-error]', form); error.hidden = true;
      busy = true; form.inert = true; dialog().dataset.settingsSaving = 'true'; qa('[type="submit"]', form).forEach(button => button.disabled = true);
      try {
        const result = await save(form, view.ctx);
        if (same(view.ctx)) invalidate();
        if (!view.alive()) return;
        dialog().dataset.composerDirty = 'false'; delete dialog().dataset.settingsSaving;
        await after(result);
        if (same(view.ctx)) { void load(); toast('Сохранено'); }
      } catch (failure) {
        if (view.alive()) { error.textContent = failure.message || 'Не удалось сохранить. Введённые значения остались в форме.'; error.hidden = false; onFailure?.(failure, form, error); }
      } finally { busy = false; if (form.isConnected) { delete dialog().dataset.settingsSaving; form.inert = false; qa('[type="submit"]', form).forEach(button => button.disabled = form.dataset.financeUncertainCreate === 'true'); } }
    };
  }

  async function ensureData() { return current() || await load(); }
  async function refreshThen(action) {
    const ctx = context(), turn = dialogTurn, wasOpen = dialog()?.open, data = await load({ force: true });
    if (same(ctx) && turn === dialogTurn && (!wasOpen || dialog()?.open)) await action(data);
  }

  async function openEntry(id, supplied = null) {
    const ctx = context(), turn = dialogTurn, data = await ensureData(), entry = supplied || data?.entries.find(item => item.id === id); if (!same(ctx) || turn !== dialogTurn || !entry) return;
    const view = await replaceDialog(entry.voided ? 'Отменённый доход' : 'Разбор дохода', `<div class="finance-entry-meta"><strong>${e(entry.sourceName)}</strong><span>${e(dateLabel(entry.date))}${entry.payer ? ` · ${e(entry.payer)}` : ''}</span>${entry.note ? `<p>${e(entry.note)}</p>` : ''}</div><div class="finance-totals">${reportStat('Доход', entry.grossMinor)}${reportStat('Исполнителям', entry.workerMinor)}${reportStat('К распределению', entry.baseMinor)}</div>${entry.voided ? '<p class="finance-notice">Доход исключён из отчёта. Расчёт и отметки сохранены; его можно восстановить.</p>' : ''}<div class="finance-entry-parts">${entry.allocations.map(part => `<article><div class="section-heading"><h3>${e(part.bucketName)}</h3><span>${e(percent(part.basisPoints))}%</span></div><p class="muted">${e(data?.buckets.find(bucket => bucket.id === part.bucketId)?.destination || 'Назначение не указано')}</p><div class="finance-bucket-amounts">${reportStat('Распределено', part.amountMinor)}${reportStat('Отмечено', part.paidMinor)}${reportStat('Осталось', amount(part.amountMinor) - amount(part.paidMinor))}</div>${!entry.voided ? `<div class="form-actions">${part.paidMinor < part.amountMinor ? `<button type="button" class="secondary" data-finance-transfer="${e(part.bucketId)}">Отметить перевод</button>` : '<span class="finance-settled">Вся сумма отмечена</span>'}${part.paidMinor > 0 ? `<button type="button" class="text-button" data-finance-correct="${e(part.bucketId)}">Исправить отметку</button>` : ''}</div>` : ''}</article>`).join('')}</div><p class="finance-caption">Отметка означает, что вы сами выполнили перевод. Связи с банком пока нет.</p><footer class="form-actions">${entry.voided ? '' : `<button type="button" class="secondary" data-finance-edit>${icon('edit')} Изменить доход</button>`}<button type="button" class="${entry.voided ? 'secondary' : 'danger-text'}" data-finance-void>${entry.voided ? 'Восстановить доход' : 'Отменить доход'}</button></footer>`);
    if (!view) return;
    q('[data-finance-edit]', view.root)?.addEventListener('click', () => openEntryForm(entry));
    q('[data-finance-void]', view.root).onclick = () => openVoid(entry);
    qa('[data-finance-transfer]', view.root).forEach(button => button.onclick = () => openTransfer(entry, button.dataset.financeTransfer));
    qa('[data-finance-correct]', view.root).forEach(button => button.onclick = () => openTransfer(entry, button.dataset.financeCorrect, true));
  }

  async function openEntryForm(entry = null) {
    const ctx = context(), turn = dialogTurn; let data = await ensureData(); if (!same(ctx) || turn !== dialogTurn || !data) return;
    let sources = data.sources.filter(source => !source.archived || source.id === entry?.sourceId);
    if (!sources.length) return openSettings();
    const initialSource = sources.find(source => source.id === entry?.sourceId) || sources[0], draft = createFinanceRequestDraft();
    let counterparties = data.counterparties || [], payerCreateBusy = false, payerCreateUncertain = false;
    const payerOptions = selectedId => `<option value="" ${!selectedId ? 'selected' : ''}>Не указан</option>${counterparties.filter(payer => !payer.archived || payer.id === entry?.payerId || payer.id === selectedId).map(payer => `<option value="${e(payer.id)}" ${payer.id === selectedId ? 'selected' : ''}>${e(payerChoiceLabel(payer))}</option>`).join('')}<option value="__manual__" ${selectedId === '__manual__' ? 'selected' : ''}>Указать без справочника</option>`;
    const initialPayer = entry?.payerId || (entry?.payer ? '__manual__' : '');
    const payerFields = `<div class="finance-payer-choice"><label>Плательщик<select name="payerId">${payerOptions(initialPayer)}</select></label><p class="finance-caption" data-finance-payer-context></p><label data-finance-payer-manual ${initialPayer === '__manual__' ? '' : 'hidden'}>От кого, без справочника<input name="payer" maxlength="160" value="${e(entry?.payerId ? '' : entry?.payer || '')}" placeholder="Имя человека или название компании"><small>Текст сохранится в доходе. Автоматической связи со справочником не будет.</small></label><details class="finance-inline-payer" data-finance-inline-payer><summary>Новый плательщик</summary><div><label>Имя или название<input name="newPayerName" maxlength="160" autocomplete="off"></label><label>Заметка о плательщике<textarea name="newPayerNote" rows="2" maxlength="2000" placeholder="Необязательно. Общая заметка, а не описание этого дохода"></textarea></label><p class="form-error" role="alert" data-finance-inline-error hidden></p><div class="form-actions"><button type="button" class="secondary" data-finance-inline-save>Создать и выбрать</button><button type="button" class="text-button" data-finance-inline-cancel>Отмена</button><button type="button" class="text-button" data-finance-inline-refresh hidden>Обновить список плательщиков</button></div></div></details></div>`;
    const view = await replaceDialog(entry ? 'Изменить доход' : 'Добавить доход', `<form class="finance-form"><div class="form-grid two"><label>Источник<select name="sourceId">${sources.map(source => `<option value="${e(source.id)}" ${source.id === initialSource.id ? 'selected' : ''}>${e(source.name)}${source.archived ? ' · в архиве' : ''}</option>`).join('')}</select></label><label>Дата<input type="date" name="date" required min="1900-01-01" max="9998-12-31" value="${e(entry?.date || (localDate().startsWith(month) ? localDate() : `${month}-01`))}"></label></div><div class="form-grid two">${moneyField('grossMinor', 'Доход, ₽', entry ? moneyInput(entry.grossMinor) : '')}<div data-finance-worker>${moneyField('workerMinor', 'Выплаты исполнителям, ₽', entry ? moneyInput(entry.workerMinor) : '0')}</div></div><p class="finance-base-preview" data-finance-base></p>${payerFields}<label>Пометка к доходу<textarea name="note" rows="3" maxlength="2000" placeholder="Например, за какую работу или период получены деньги">${e(entry?.note || '')}</textarea></label><div class="finance-rule-preview" data-finance-rules></div>${formError}${submitRow(entry ? 'Сохранить изменения' : 'Добавить доход')}</form>`, entry ? () => openEntry(entry.id, entry) : null);
    if (!view) return;
    const form = q('form', view.root);
    const selected = () => sources.find(source => source.id === form.elements.sourceId.value);
    function rebuildSelect(name, markup, onchange) {
      let select = form.elements[name]; const wrapper = select.closest('.custom-select');
      if (wrapper) { const fresh = document.createElement('select'); fresh.name = name; wrapper.replaceWith(fresh); select = fresh; }
      select.innerHTML = markup; select.onchange = onchange; enhanceSelects?.(form); return select;
    }
    function payerPreview() {
      const id = form.elements.payerId.value, payer = counterparties.find(item => item.id === id);
      q('[data-finance-payer-manual]', form).hidden = id !== '__manual__';
      const description = q('[data-finance-payer-context]', form);
      description.textContent = payer ? `${payer.note || ''}${payer.archived ? `${payer.note ? ' ' : ''}Плательщик в архиве.` : ''}${entry?.payerId === id && entry.payer !== payer.name ? ` В этом доходе сохранено имя «${entry.payer}».` : ''}` : '';
      description.hidden = !description.textContent;
    }
    function clearInlinePayer() {
      form.elements.newPayerName.value = ''; form.elements.newPayerNote.value = ''; payerCreateUncertain = false;
      q('[data-finance-inline-error]', form).hidden = true; q('[data-finance-inline-refresh]', form).hidden = true; q('[data-finance-inline-save]', form).disabled = false;
      q('[data-finance-inline-payer]', form).open = false; form.dispatchEvent(new Event('input', { bubbles: true }));
    }
    form.elements.payerId.onchange = () => { payerPreview(); if (payerCreateUncertain && counterparties.some(payer => payer.id === form.elements.payerId.value)) clearInlinePayer(); };
    q('[data-finance-inline-cancel]', form).onclick = () => { if (!payerCreateBusy && !draft.isUncertain()) clearInlinePayer(); };
    q('[data-finance-inline-save]', form).onclick = async () => {
      if (!view.alive() || payerCreateBusy || payerCreateUncertain || draft.isUncertain() || dialog().dataset.settingsSaving === 'true') return;
      const error = q('[data-finance-inline-error]', form); error.hidden = true;
      let payload; try { payload = financeCounterpartyPayload(form.elements.newPayerName.value, form.elements.newPayerNote.value); } catch (cause) { error.textContent = cause.message; error.hidden = false; return; }
      payerCreateBusy = true; form.inert = true; dialog().dataset.settingsSaving = 'true';
      try {
        const created = await request(view.ctx, '/counterparties', { method: 'POST', body: JSON.stringify(payload) });
        if (!view.alive()) return;
        counterparties = [...counterparties.filter(payer => payer.id !== created.id), created]; data.counterparties = counterparties;
        clearInlinePayer(); rebuildSelect('payerId', payerOptions(created.id), payerPreview); payerPreview();
        dialog().dataset.composerDirty = 'true'; invalidate(); void load();
      } catch (cause) {
        if (view.alive()) {
          payerCreateUncertain = !cause.status || cause.status >= 500;
          error.textContent = payerCreateUncertain ? 'Не удалось подтвердить создание. Обновите список и проверьте, появился ли плательщик. Если появился — выберите его выше; поля дохода сохранены.' : cause.message;
          error.hidden = false; q('[data-finance-inline-refresh]', form).hidden = !payerCreateUncertain;
        }
      } finally { payerCreateBusy = false; if (view.alive()) { form.inert = false; delete dialog().dataset.settingsSaving; q('[data-finance-inline-save]', form).disabled = payerCreateUncertain; } }
    };
    q('[data-finance-inline-refresh]', form).onclick = async event => {
      if (!view.alive() || draft.isUncertain()) return; const button = event.currentTarget; button.disabled = true; dialog().dataset.settingsSaving = 'true';
      try {
        const updated = await load({ force: true }); if (!view.alive()) return;
        if (!updated) throw new Error(cached?.error || 'Не удалось загрузить плательщиков.');
        const id = form.elements.payerId.value; counterparties = updated.counterparties || []; data.counterparties = counterparties;
        rebuildSelect('payerId', payerOptions(id), () => { payerPreview(); if (counterparties.some(payer => payer.id === form.elements.payerId.value)) clearInlinePayer(); });
        q('[data-finance-inline-error]', form).textContent = 'Список обновлён. Выберите сохранённого плательщика в поле выше. Если его нет, отмените добавление и создайте заново после проверки.';
      } catch (cause) { if (view.alive()) { q('[data-finance-inline-error]', form).textContent = cause.message; q('[data-finance-inline-error]', form).hidden = false; } }
      finally { if (view.alive()) { button.disabled = false; delete dialog().dataset.settingsSaving; } }
    };
    function preview() {
      const source = selected(); if (!source) return;
      const sameSource = entry && source.id === entry.sourceId;
      const deduct = sameSource ? Boolean(entry.deductWorkers) : source.deductWorkers;
      q('[data-finance-worker]', form).hidden = !deduct;
      form.elements.workerMinor.required = deduct;
      try { const gross = parseFinanceMinor(form.elements.grossMinor.value), workers = deduct ? parseFinanceMinor(form.elements.workerMinor.value) : 0; q('[data-finance-base]', form).textContent = workers > gross ? 'Выплаты исполнителям не могут превышать доход.' : `К распределению: ${financeMoney(gross - workers)}`; } catch { q('[data-finance-base]', form).textContent = 'Распределение рассчитывается после выплат исполнителям.'; }
      const rules = sameSource ? entry.allocations : source.allocations;
      q('[data-finance-rules]', form).innerHTML = `<strong>${sameSource ? 'Сохранённое правило этого дохода' : 'Распределение источника'}</strong><p>${rules.map(rule => `${e(rule.bucketName || data.buckets.find(bucket => bucket.id === rule.bucketId)?.name || 'Направление')} · ${e(percent(rule.basisPoints))}%`).join(' · ')}</p><small>Точный расчёт по копейкам появится после сохранения.${sameSource ? ' Изменения правил источника не переписывают этот доход.' : ''}</small>`;
    }
    form.addEventListener('input', preview); form.elements.sourceId.onchange = preview; preview(); payerPreview();
    bindForm(view, (form, ctx) => {
      const source = selected(), grossMinor = parseFinanceMinor(form.elements.grossMinor.value, { positive: true });
      const workerMinor = q('[data-finance-worker]', form).hidden ? 0 : parseFinanceMinor(form.elements.workerMinor.value);
      if (workerMinor > grossMinor) throw new Error('Выплаты исполнителям не могут превышать доход.');
      if (source.archived && source.id !== entry?.sourceId) throw new Error('Источник в архиве. Выберите действующий источник.');
      if (form.elements.newPayerName.value.trim() || form.elements.newPayerNote.value.trim()) throw new Error('Сначала создайте плательщика или отмените его добавление. Поля дохода остаются в форме.');
      const payerData = financeEntryPayerPayload(entry, form.elements.payerId.value, counterparties, form.elements.payer.value);
      const payload = { sourceId: source.id, expectedSourceRevision: source.revision, date: validateFinanceDate(form.elements.date.value), ...payerData, note: form.elements.note.value.trim(), grossMinor, workerMinor, ...(entry ? { expectedRevision: entry.revision } : {}) };
      const send = body => request(ctx, `/entries${entry ? `/${entry.id}` : ''}`, { method: entry ? 'PUT' : 'POST', body: JSON.stringify(body) });
      return entry ? send(payload) : draft.submit(payload, send);
    }, async result => { month = result.date.slice(0, 7); if (payerFilter && financePayerKey(result) !== payerFilter) payerFilter = ''; await refreshThen(() => openEntry(result.id, result)); }, (failure, form, error) => {
      qa('[data-finance-recovery]', form).forEach(node => node.remove());
      const locked = !entry && draft.isUncertain();
      qa('input, textarea', form).forEach(input => { input.readOnly = locked; });
      qa('select', form).forEach(select => { select.disabled = locked; });
      qa('.custom-select-trigger', form).forEach(button => { button.disabled = locked; });
      q('[data-finance-inline-save]', form).disabled = locked || payerCreateUncertain;
      q('[data-finance-inline-cancel]', form).disabled = locked;
      if ((!entry && !locked && failure.status !== 409 && (!failure.status || failure.status < 500)) || (failure.status && failure.status < 500 && failure.status !== 409)) return;
      const recovery = document.createElement('div'); recovery.className = 'finance-save-recovery'; recovery.dataset.financeRecovery = 'true';
      const description = document.createElement('p'); description.className = 'finance-caption';
      if (!entry && draft.isUncertain()) {
        description.textContent = 'Ответ о сохранении не получен. Повторная отправка тех же значений проверит прежний запрос и не создаст второй доход. Пока запрос не подтверждён, значения менять нельзя.';
      } else if (failure.status === 409) {
        description.textContent = 'Данные изменились. Обновление источников и плательщиков сохранит суммы, дату и текст. Проверьте имя плательщика и доли перед повторным сохранением.';
      } else description.textContent = 'Введённые значения остались в форме.';
      recovery.append(description);
      if (failure.status === 409) {
        const refresh = document.createElement('button'); refresh.type = 'button'; refresh.className = 'secondary'; refresh.textContent = 'Обновить источники и плательщиков';
        refresh.onclick = async () => {
          if (!view.alive()) return; refresh.disabled = true; dialog().dataset.settingsSaving = 'true';
          try {
            const updated = await load({ force: true }); if (!view.alive()) return;
            if (!updated) throw new Error(cached?.error || 'Не удалось обновить источники и плательщиков.');
            const selectedId = form.elements.sourceId.value, selectedPayerId = form.elements.payerId.value;
            data = updated; sources = updated.sources.filter(source => !source.archived || source.id === entry?.sourceId || source.id === selectedId); counterparties = updated.counterparties || [];
            const sourceSelect = rebuildSelect('sourceId', sources.map(source => `<option value="${e(source.id)}" ${source.id === selectedId ? 'selected' : ''}>${e(source.name)}${source.archived ? ' · в архиве' : ''}</option>`).join(''), preview);
            rebuildSelect('payerId', payerOptions(selectedPayerId), payerPreview);
            sourceSelect.dispatchEvent(new Event('change', { bubbles: true })); preview(); payerPreview();
            description.textContent = 'Источники и плательщики обновлены. Ваши суммы, дата и текст сохранены. Проверьте имя плательщика и доли, затем повторите сохранение.';
            error.hidden = true;
            if (entry) {
              const latest = updated.entries.find(item => item.id === entry.id);
              if (latest && latest.revision !== entry.revision) {
                const prior = q('[data-finance-conflict-current]', recovery); prior?.remove();
                const actual = document.createElement('div'); actual.dataset.financeConflictCurrent = 'true'; actual.className = 'finance-notice';
                actual.innerHTML = `<p><strong>Сейчас сохранено</strong></p><p>${e(dateLabel(latest.date))} · ${e(latest.sourceName)} · ${e(financeMoney(latest.grossMinor))}${latest.payer ? ` · ${e(latest.payer)}` : ''}</p><p>Исполнителям: ${e(financeMoney(latest.workerMinor))}${latest.voided ? ' · Доход отменён' : ''}</p>${latest.note ? `<p>${e(latest.note)}</p>` : ''}`;
                if (!latest.voided) {
                  const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'secondary'; accept.textContent = 'Продолжить с этой версией';
                  accept.onclick = () => { entry = latest; preview(); description.textContent = 'Введённые значения сохранены в форме. При нажатии «Сохранить изменения» они заменят показанную актуальную версию. Проверьте суммы и распределение.'; accept.disabled = true; };
                  actual.append(accept);
                }
                recovery.append(actual); description.textContent += ' Сам доход тоже изменён; текущие значения показаны ниже.';
              }
            }
          } catch (cause) { if (view.alive()) { error.textContent = cause.message; error.hidden = false; } }
          finally { if (view.alive()) { refresh.disabled = false; delete dialog().dataset.settingsSaving; } }
        };
        recovery.append(refresh);
      }
      const journal = document.createElement('button'); journal.type = 'button'; journal.className = 'text-button'; journal.textContent = 'Проверить журнал доходов';
      journal.onclick = async () => {
        if (!view.alive()) return; journal.disabled = true;
        const updated = await load({ force: true }); if (!view.alive()) return;
        const prior = q('[data-finance-recovery-journal]', recovery); prior?.remove();
        const list = document.createElement('div'); list.dataset.financeRecoveryJournal = 'true';
        if (!updated) list.textContent = cached?.error || 'Журнал не загрузился. Можно повторить проверку.';
        else { list.innerHTML = `<p class="finance-caption">Записи за ${e(month)}. Форма выше сохранена.</p><div class="finance-recovery-journal">${updated.entries.slice(0, 30).map(item => `<p><span>${e(dateLabel(item.date))} · ${e(item.sourceName)}${item.payer ? ` · ${e(item.payer)}` : ''}${item.voided ? ' · Отменён' : ''}</span><strong>${e(financeMoney(item.grossMinor))}</strong></p>`).join('') || '<p>Доходов пока нет.</p>'}</div>`; }
        recovery.append(list); journal.disabled = false;
      };
      recovery.append(journal); error.after(recovery);
    });
  }

  async function openTransfer(entry, bucketId, correction = false) {
    const part = entry.allocations.find(item => item.bucketId === bucketId); if (!part) return;
    const view = await replaceDialog(correction ? 'Исправить отметку' : 'Отметить перевод', `<form class="finance-form"><div class="finance-entry-meta"><strong>${e(part.bucketName)}</strong><p>Распределено ${e(financeMoney(part.amountMinor))}. Уже отмечено ${e(financeMoney(part.paidMinor))}.</p></div>${moneyField('paid', correction ? 'Всего переведено, ₽' : 'Сумма нового перевода, ₽', correction ? moneyInput(part.paidMinor) : '')}<p class="finance-caption">${correction ? 'Укажите правильный итог. Ноль уберёт прежнюю отметку.' : 'Эта сумма добавится к уже отмеченным переводам.'} Это учёт выполненного вами перевода, без операции в банке.</p>${formError}${submitRow(correction ? 'Сохранить исправление' : 'Отметить перевод')}</form>`, () => openEntry(entry.id, entry));
    if (!view) return;
    bindForm(view, (form, ctx) => {
      const entered = parseFinanceMinor(form.elements.paid.value, { positive: !correction }), paidMinor = correction ? entered : part.paidMinor + entered;
      if (paidMinor > part.amountMinor) throw new Error(`Можно отметить не больше ${financeMoney(part.amountMinor)} — столько распределено на это направление.`);
      return request(ctx, `/entries/${entry.id}/transfers`, { method: 'PATCH', body: JSON.stringify({ expectedRevision: entry.revision, bucketId, paidMinor }) });
    }, result => refreshThen(() => openEntry(result.id, result)));
  }

  async function openVoid(entry) {
    const hasPaid = entry.allocations.some(part => part.paidMinor > 0);
    const view = await replaceDialog(entry.voided ? 'Восстановить доход' : 'Отменить доход', `<form class="finance-form"><p>${entry.voided ? 'Доход и его сохранённое распределение снова войдут в отчёт.' : 'Доход и его распределение будут исключены из отчёта. История сохранится, доход можно будет восстановить.'}</p><div class="finance-entry-meta"><strong>${e(entry.sourceName)} · ${e(financeMoney(entry.grossMinor))}</strong><span>${e(dateLabel(entry.date))}</span></div>${hasPaid && !entry.voided ? '<p class="finance-notice">В этом доходе есть отмеченные переводы. Сначала проверьте их и исправьте отметки в разборе дохода; доход с переводами отменить нельзя.</p>' : `${formError}${submitRow(entry.voided ? 'Восстановить доход' : 'Отменить доход')}`}</form>`, () => openEntry(entry.id, entry));
    if (!view) return;
    if (hasPaid && !entry.voided) return;
    bindForm(view, (_, ctx) => request(ctx, `/entries/${entry.id}/void`, { method: 'PATCH', body: JSON.stringify({ expectedRevision: entry.revision, voided: !entry.voided }) }), result => refreshThen(() => openEntry(result.id, result)));
  }

  async function openSettings() {
    accountBoundary(); if (!owner()) return false;
    const loading = await replaceDialog('Настройки финансов', '<p role="status">Загружаем плательщиков, направления и правила…</p>');
    if (!loading) return false;
    const data = await ensureData(); if (!loading.alive()) return false;
    if (!data) {
      q('[role="status"]', loading.root).textContent = cached?.error || 'Настройки не загрузились.';
      const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary'; retry.textContent = 'Повторить';
      retry.onclick = () => { invalidate(); void openSettings(); }; loading.root.append(retry); return false;
    }
    const activeBuckets = data.buckets.filter(bucket => !bucket.archived);
    const view = await replaceDialog('Настройки финансов', `<p class="finance-caption">Личные плательщики, направления и правила источников. Изменения справочников действуют на новые доходы; прежние имена и расчёты сохраняются.</p>
      <section class="finance-settings-section"><div class="section-heading"><div><h3>Плательщики</h3><p class="muted">Люди и компании, от которых поступают деньги</p></div><button type="button" class="secondary" data-finance-payer-add>${icon('plus')} Плательщик</button></div><div class="finance-settings-list">${(data.counterparties || []).map(payer => `<button type="button" data-finance-payer="${e(payer.id)}"><span><strong>${e(payer.name)}</strong><small>${e(payer.note || 'Без заметки')}${payer.archived ? ' · В архиве' : ''}</small></span>${icon('chevronRight')}</button>`).join('') || '<p class="finance-empty-note">Сохраните имя человека или название компании и общую заметку. В каждом доходе можно будет выбрать плательщика и добавить отдельную пометку.</p>'}</div></section>
      <section class="finance-settings-section"><div class="section-heading"><div><h3>Направления</h3><p class="muted">На что откладывать и куда переводить</p></div><button type="button" class="secondary" data-finance-bucket-add>${icon('plus')} Направление</button></div><div class="finance-settings-list">${data.buckets.map(bucket => `<button type="button" data-finance-bucket="${e(bucket.id)}"><span><strong>${e(bucket.name)}</strong><small>${e(bucket.destination || 'Назначение не указано')}${bucket.archived ? ' · В архиве' : ''}</small></span>${icon('chevronRight')}</button>`).join('') || '<p class="finance-empty-note">Добавьте первое направление. Например, цель, накопления или текущие расходы — названия выбираете вы.</p>'}</div></section>
      <section class="finance-settings-section"><div class="section-heading"><div><h3>Источники дохода</h3><p class="muted">Как распределять поступления</p></div><button type="button" class="secondary" data-finance-source-add ${activeBuckets.length ? '' : 'disabled'}>${icon('plus')} Источник</button></div><div class="finance-settings-list">${data.sources.map(source => `<button type="button" data-finance-source="${e(source.id)}"><span><strong>${e(source.name)}</strong><small>${source.deductWorkers ? 'После выплат исполнителям' : 'От полной суммы'}${source.archived ? ' · В архиве' : ''}</small></span>${icon('chevronRight')}</button>`).join('') || `<p class="finance-empty-note">${activeBuckets.length ? 'Создайте источник и задайте доли. Их сумма должна составлять 100%.' : 'Сначала добавьте хотя бы одно активное направление.'}</p>`}</div></section>`);
    if (!view) return false;
    q('[data-finance-payer-add]', view.root).onclick = () => openCounterpartyForm();
    qa('[data-finance-payer]', view.root).forEach(button => button.onclick = () => openCounterpartyForm((data.counterparties || []).find(payer => payer.id === button.dataset.financePayer)));
    q('[data-finance-bucket-add]', view.root).onclick = () => openBucketForm();
    q('[data-finance-source-add]', view.root).onclick = () => openSourceForm();
    qa('[data-finance-bucket]', view.root).forEach(button => button.onclick = () => openBucketForm(data.buckets.find(bucket => bucket.id === button.dataset.financeBucket)));
    qa('[data-finance-source]', view.root).forEach(button => button.onclick = () => openSourceForm(data.sources.find(source => source.id === button.dataset.financeSource)));
    return true;
  }

  async function openCounterpartyForm(payer = null) {
    let creationUncertain = false, savingStarted = false;
    const view = await replaceDialog(payer ? 'Изменить плательщика' : 'Новый плательщик', `<form class="finance-form"><label>Имя или название<input name="name" maxlength="160" required value="${e(payer?.name || '')}" placeholder="Имя человека или название компании"></label><label>Заметка о плательщике<textarea name="note" maxlength="2000" rows="4" placeholder="Необязательно. Общие сведения для следующих доходов">${e(payer?.note || '')}</textarea></label>${payer ? `<label class="finance-checkbox"><input type="checkbox" name="archived" ${payer.archived ? 'checked' : ''}> Убрать в архив</label><p class="finance-caption">Архивный плательщик остаётся в истории и отчётах. Для новых доходов его нельзя выбрать, пока не восстановите.</p>` : '<p class="finance-caption">Плательщики принадлежат только вашему аккаунту. Одинаковые имена разрешены; заметка помогает их различать.</p>'}${formError}${submitRow(payer ? 'Сохранить плательщика' : 'Добавить плательщика')}</form>`, openSettings);
    if (!view) return;
    bindForm(view, (form, ctx) => {
      if (creationUncertain) throw new Error('Сначала проверьте список плательщиков после неподтверждённого сохранения.');
      savingStarted = false;
      const payload = { ...financeCounterpartyPayload(form.elements.name.value, form.elements.note.value), archived: Boolean(form.elements.archived?.checked), ...(payer ? { expectedRevision: payer.revision } : {}) };
      savingStarted = true;
      return request(ctx, `/counterparties${payer ? `/${payer.id}` : ''}`, { method: payer ? 'PUT' : 'POST', body: JSON.stringify(payload) }).catch(failure => {
        if (!payer && (!failure.status || failure.status >= 500)) { creationUncertain = true; form.dataset.financeUncertainCreate = 'true'; }
        throw failure;
      });
    }, () => refreshThen(openSettings), (failure, form, error) => {
      qa('[data-finance-payer-recovery]', form).forEach(node => node.remove());
      if (!savingStarted || (failure.status && failure.status < 500 && failure.status !== 409)) return;
      const recovery = document.createElement('div'); recovery.className = 'finance-save-recovery'; recovery.dataset.financePayerRecovery = 'true';
      const explanation = document.createElement('p'); explanation.className = 'finance-caption'; explanation.textContent = payer ? 'Введённые имя и заметка остались в форме. Проверьте актуальную версию перед сохранением.' : 'Если ответ о создании не получен, сначала проверьте список — новый плательщик мог уже сохраниться.';
      recovery.append(explanation);
      const check = document.createElement('button'); check.type = 'button'; check.className = 'secondary'; check.textContent = payer ? 'Показать текущую версию' : 'Проверить список плательщиков';
      check.onclick = async () => {
        if (!view.alive() || dialog().dataset.settingsSaving === 'true') return; check.disabled = true; dialog().dataset.settingsSaving = 'true';
        try {
          const updated = await load({ force: true }); if (!view.alive()) return;
          if (!updated) throw new Error(cached?.error || 'Список не загрузился.');
          qa('[data-finance-payer-actual]', recovery).forEach(node => node.remove());
          const actual = document.createElement('div'); actual.dataset.financePayerActual = 'true'; actual.className = 'finance-notice';
          if (payer) {
            const latest = (updated.counterparties || []).find(item => item.id === payer.id);
            if (!latest) throw new Error('Плательщик больше не доступен.');
            actual.innerHTML = `<p><strong>${e(latest.name)}</strong>${latest.archived ? ' · В архиве' : ''}</p><p>${e(latest.note || 'Без заметки')}</p>`;
            const accept = document.createElement('button'); accept.type = 'button'; accept.className = 'secondary'; accept.textContent = 'Продолжить с этой версией';
            accept.onclick = () => { payer = latest; explanation.textContent = 'Ваши поля сохранены. При сохранении они заменят показанную версию.'; accept.disabled = true; error.hidden = true; }; actual.append(accept);
          } else {
            actual.innerHTML = (updated.counterparties || []).map(item => `<div><p><strong>${e(item.name)}</strong>${item.archived ? ' · В архиве' : ''}<br>${e(item.note || '')}</p><button type="button" class="text-button" data-finance-recovered-payer="${e(item.id)}">Открыть этого плательщика</button></div>`).join('') || '<p>Плательщиков пока нет.</p>';
            qa('[data-finance-recovered-payer]', actual).forEach(button => button.onclick = () => openCounterpartyForm(updated.counterparties.find(item => item.id === button.dataset.financeRecoveredPayer)));
            const retry = document.createElement('button'); retry.type = 'button'; retry.className = 'secondary'; retry.textContent = 'Проверено: создать новую запись';
            retry.onclick = () => { creationUncertain = false; delete form.dataset.financeUncertainCreate; qa('[type="submit"]', form).forEach(button => button.disabled = false); explanation.textContent = 'Список проверен. Введённые имя и заметка остались в форме; теперь можно повторить создание новой записи.'; retry.disabled = true; };
            actual.append(retry);
          }
          recovery.append(actual);
        } catch (cause) { if (view.alive()) { error.textContent = cause.message; error.hidden = false; } }
        finally { if (view.alive()) { check.disabled = false; delete dialog().dataset.settingsSaving; } }
      };
      recovery.append(check); error.after(recovery);
    });
  }

  async function openBucketForm(bucket = null) {
    const view = await replaceDialog(bucket ? 'Изменить направление' : 'Новое направление', `<form class="finance-form"><label>Название<input name="name" maxlength="120" required value="${e(bucket?.name || '')}"></label><label>Куда переводить<input name="destination" maxlength="240" value="${e(bucket?.destination || '')}" placeholder="Например, название счёта или способ перевода"><small>Необязательно. Реквизиты и номер счёта не нужны.</small></label>${bucket ? `<label class="finance-checkbox"><input type="checkbox" name="archived" ${bucket.archived ? 'checked' : ''}> Убрать в архив</label><p class="finance-caption">Архив сохраняет историю. Чтобы убрать направление из будущих доходов, проверьте правила использующих его источников.</p>` : ''}${formError}${submitRow(bucket ? 'Сохранить направление' : 'Добавить направление')}</form>`, openSettings);
    if (!view) return;
    bindForm(view, (form, ctx) => request(ctx, `/buckets${bucket ? `/${bucket.id}` : ''}`, { method: bucket ? 'PUT' : 'POST', body: JSON.stringify({ name: form.elements.name.value.trim(), destination: form.elements.destination.value.trim(), archived: Boolean(form.elements.archived?.checked), ...(bucket ? { expectedRevision: bucket.revision } : {}) }) }), () => refreshThen(openSettings));
  }

  async function openSourceForm(source = null) {
    const ctx = context(), turn = dialogTurn, data = await ensureData(); if (!same(ctx) || turn !== dialogTurn || !data) return;
    const buckets = data.buckets.filter(bucket => !bucket.archived || source?.allocations.some(rule => rule.bucketId === bucket.id));
    if (!buckets.length) return openSettings();
    const initial = source?.allocations || [{ bucketId: buckets[0].id, basisPoints: 10000 }];
    const ruleRow = (rule, index) => `<div class="finance-rule-row" data-finance-rule><label>Направление<select data-rule-bucket aria-label="Направление ${index + 1}">${buckets.map(bucket => `<option value="${e(bucket.id)}" ${bucket.id === rule.bucketId ? 'selected' : ''}>${e(bucket.name)}${bucket.archived ? ' · В архиве' : ''}</option>`).join('')}</select></label><label>Доля, %<input type="text" inputmode="decimal" data-rule-weight value="${e(percent(rule.basisPoints))}" required aria-label="Доля ${index + 1}, проценты"></label><button type="button" class="icon-button" data-rule-remove aria-label="Убрать направление ${index + 1}">${icon('x')}</button></div>`;
    const view = await replaceDialog(source ? 'Изменить источник' : 'Новый источник дохода', `<form class="finance-form"><label>Название<input name="name" maxlength="120" required value="${e(source?.name || '')}"></label><label class="finance-checkbox"><input type="checkbox" name="deductWorkers" ${source?.deductWorkers ? 'checked' : ''}> Сначала вычитать выплаты исполнителям</label><p class="finance-caption">Если включено, доли применяются к остатку после выплат исполнителям. Если выключено — ко всей сумме дохода.</p><fieldset class="finance-rules"><legend>Распределение</legend><div data-finance-rule-list>${initial.map(ruleRow).join('')}</div><p class="finance-rule-total" data-finance-rule-total role="status"></p><button type="button" class="text-button" data-finance-rule-add>${icon('plus')} Ещё направление</button></fieldset>${source ? `<label class="finance-checkbox"><input type="checkbox" name="archived" ${source.archived ? 'checked' : ''}> Убрать источник в архив</label>` : ''}<p class="finance-caption">Общая доля — 100%. Сохранённые доходы не пересчитываются после изменения источника.</p>${formError}${submitRow(source ? 'Сохранить источник' : 'Добавить источник')}</form>`, openSettings);
    if (!view) return;
    const form = q('form', view.root), list = q('[data-finance-rule-list]', form);
    function rules() { return qa('[data-finance-rule]', list).map(row => ({ bucketId: q('[data-rule-bucket]', row).value, basisPoints: parseFinanceBasisPoints(q('[data-rule-weight]', row).value) })); }
    function total() {
      const output = q('[data-finance-rule-total]', form);
      try { const value = rules().reduce((sum, rule) => sum + rule.basisPoints, 0); output.textContent = value === 10000 ? 'Всего 100% — всё распределено' : `Всего ${percent(value)}% · ${value < 10000 ? `осталось ${percent(10000 - value)}%` : `уберите ${percent(value - 10000)}%`}`; output.dataset.valid = String(value === 10000); }
      catch { output.textContent = 'Введите доли от 0 до 100 с точностью до двух знаков.'; output.dataset.valid = 'false'; }
      const selected = qa('[data-rule-bucket]', list).map(select => select.value);
      q('[data-finance-rule-add]', form).disabled = selected.length >= 20 || !buckets.some(bucket => !bucket.archived && !selected.includes(bucket.id));
    }
    function bindRows() {
      qa('[data-finance-rule]', list).forEach((row, index) => {
        q('[data-rule-bucket]', row).setAttribute('aria-label', `Направление ${index + 1}`);
        q('[data-rule-weight]', row).setAttribute('aria-label', `Доля ${index + 1}, проценты`);
        q('[data-rule-remove]', row).setAttribute('aria-label', `Убрать направление ${index + 1}`);
      });
      qa('[data-rule-remove]', list).forEach(button => button.onclick = () => { button.closest('[data-finance-rule]').remove(); form.dispatchEvent(new Event('input', { bubbles: true })); total(); });
      enhanceSelects?.(list); total();
    }
    q('[data-finance-rule-add]', form).onclick = () => {
      const selected = qa('[data-rule-bucket]', list).map(select => select.value), next = buckets.find(bucket => !bucket.archived && !selected.includes(bucket.id));
      if (!next || selected.length >= 20) return;
      list.insertAdjacentHTML('beforeend', ruleRow({ bucketId: next.id, basisPoints: 0 }, selected.length)); bindRows(); form.dispatchEvent(new Event('input', { bubbles: true }));
    };
    form.addEventListener('input', total); form.addEventListener('change', total); bindRows();
    bindForm(view, (form, ctx) => {
      const allocations = rules();
      if (!allocations.length || allocations.some(rule => rule.basisPoints <= 0)) throw new Error('Укажите положительную долю для каждого направления или уберите ненужную строку.');
      if (new Set(allocations.map(rule => rule.bucketId)).size !== allocations.length) throw new Error('Каждое направление можно выбрать только один раз.');
      if (allocations.reduce((sum, rule) => sum + rule.basisPoints, 0) !== 10000) throw new Error('Сумма долей должна составлять ровно 100%.');
      return request(ctx, `/sources${source ? `/${source.id}` : ''}`, { method: source ? 'PUT' : 'POST', body: JSON.stringify({ name: form.elements.name.value.trim(), deductWorkers: form.elements.deductWorkers.checked, allocations, archived: Boolean(form.elements.archived?.checked), ...(source ? { expectedRevision: source.revision } : {}) }) });
    }, () => refreshThen(openSettings));
  }

  function reset() { ownerSeen = null; month = localDate().slice(0, 7); payerFilter = ''; invalidate(); dialogTurn += 1; if (dialog()?.dataset.financeOwner) { delete dialog().dataset.settingsSaving; delete dialog().dataset.financeOwner; } }
  dialog()?.addEventListener('close', () => { if (dialog().dataset.financeOwner) { delete dialog().dataset.financeOwner; delete dialog().dataset.settingsSaving; dialog().dataset.composerDirty = 'false'; dialogTurn += 1; } });
  return { render, bind, openSettings, reset, invalidate };
}
