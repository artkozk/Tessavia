const widgetSourceKey = source => JSON.stringify([source.pageId, source.blockId]);
const widgetDate = value => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
};
const widgetDeviceStatus = device => device.lastUsedAt ? `Обновлялся ${widgetDate(device.lastUsedAt)}` : device.pairedAt ? 'Подключён · ещё не обновлялся' : 'Ожидает подключения';

export function mobileWidgetsMarkup(model, e, icon) {
  const groups = new Map();
  for (const source of model.sources) {
    if (!groups.has(source.pageId)) groups.set(source.pageId, { name: source.pageName, sources: [] });
    groups.get(source.pageId).sources.push(source);
  }
  const unavailable = model.loading || model.busy;
  return `<h3 id="mobile-widget-title">Виджеты Android</h3>
    <p>Выберите блок своей страницы и смотрите его на главном экране телефона. Сейчас доступны «Пункты и отметки» и «Прогресс». Отметки меняются в Tessavie; виджет показывает результат и позволяет обновить данные.</p>
    <p><a class="secondary mobile-widget-download" href="/downloads/tessavie-widgets-preview.apk" download>Скачать APK для проверки</a></p><p class="muted">Tessavie Widgets · только Android · предварительная версия.</p>
    <details><summary>Как подключить</summary><ol><li>Установите приложение Tessavie Widgets на Android и добавьте его виджет на главный экран.</li><li>Ниже выберите блок и получите код подключения.</li><li>Вставьте код в настройке виджета на телефоне в течение пяти минут.</li></ol><p class="muted">Кнопка в виджете открывает Tessavie. Для iPhone доступны установка сайта и ярлыки выше; системный виджет iOS пока не готов.</p></details>
    ${model.loading ? '<p role="status">Загружаем доступные блоки и подключения…</p>' : ''}
    ${model.sourceError ? `<p class="mobile-access-error" role="alert">${e(model.sourceError)}</p>` : ''}
    ${!model.loading && !model.sourceError && !model.sources.length ? '<p class="muted">В этом пространстве нет подходящих блоков. В конструкторе своей страницы добавьте и сохраните «Пункты и отметки» или «Прогресс», затем обновите список здесь.</p>' : ''}
    ${model.sources.length ? `<form data-mobile-widget-form class="mobile-widget-form"><label>Блок страницы<select data-mobile-widget-source required ${unavailable ? 'disabled' : ''}><option value="">Выберите блок</option>${[...groups.values()].map(group => `<optgroup label="${e(group.name)}">${group.sources.map(source => `<option value="${e(widgetSourceKey(source))}" ${widgetSourceKey(source) === model.draft.source ? 'selected' : ''}>${e(source.pageName)} · ${e(source.title || (source.kind === 'progress' ? 'Прогресс' : 'Пункты и отметки'))}</option>`).join('')}</optgroup>`).join('')}</select></label><label><span>Название устройства <span class="muted">· необязательно</span></span><input data-mobile-widget-name maxlength="80" autocomplete="off" placeholder="Например: Мой телефон" value="${e(model.draft.name)}" ${unavailable ? 'disabled' : ''}></label><p class="muted" id="mobile-widget-access-note">Выбранный блок и ваши личные отметки будут видны на главном экране телефона. Доступ действует 90 дней; его можно отключить ниже.</p><button type="submit" class="primary" data-mobile-widget-connect aria-describedby="mobile-widget-access-note" ${unavailable || !model.draft.source || model.pairing ? 'disabled' : ''}>${model.busy === 'create' ? 'Получаем код…' : 'Получить код подключения'}</button></form>` : ''}
    ${model.pairing ? `<div class="mobile-widget-pairing"><label>Код подключения<input data-mobile-widget-code readonly autocomplete="off" spellcheck="false" value="${e(model.pairing.pairingCode)}"></label><p>Вставьте код только в Tessavie Widgets. Действует до ${e(widgetDate(model.pairing.pairingExpiresAt))}.</p><div class="mobile-widget-actions"><button type="button" class="secondary" data-mobile-widget-copy>${icon('copy')} Скопировать код</button><button type="button" class="text-button" data-mobile-widget-clear>Скрыть код</button></div></div>` : ''}
    <div class="mobile-widget-devices"><h4>Доступ к виджетам</h4><p class="muted">Ваши подключения из всех пространств. Выход из сайта не отключает виджет; для этого нажмите «Отключить».</p>
    ${model.devicesError ? `<p class="mobile-access-error" role="alert">${e(model.devicesError)}</p>` : ''}
    ${model.devices.map(device => `<article><div><strong>${e(device.name || 'Android-виджет')}</strong><span>${e(device.pageName)} · ${e(device.title)}</span><small>${e(widgetDeviceStatus(device))} · Доступ до ${e(widgetDate(device.expiresAt))}</small></div><button type="button" class="text-button" data-mobile-widget-revoke="${e(device.id)}" aria-label="Отключить: ${e(device.name || device.title || 'Android-виджет')}" ${unavailable ? 'disabled' : ''}>${model.busy === device.id ? 'Отключаем…' : 'Отключить'}</button></article>`).join('')}
    ${!model.loading && !model.devicesError && !model.devices.length ? '<p>Подключений пока нет.</p>' : ''}</div>
    <button type="button" class="text-button" data-mobile-widget-reload ${unavailable ? 'disabled' : ''}>${icon('rotate')} ${model.sourceError || model.devicesError ? 'Повторить загрузку' : 'Обновить список'}</button>
    ${model.message ? `<p class="mobile-access-message" role="status">${e(model.message)}</p>` : ''}
    ${model.error ? `<p class="mobile-access-error" role="alert">${e(model.error)}</p>` : ''}`;
}

export function createMobileWidgetsUI({ api, getContext, isOpen, escapeHTML, icon, enhance = () => {}, nav = navigator, now = Date.now, schedule = setTimeout, cancel = clearTimeout }) {
  let root = null, context = null, revision = 0, listRevision = 0, timer = null;
  let model = empty();
  function empty() { return { sources: [], devices: [], draft: { source: '', name: '' }, pairing: null, loading: false, busy: '', sourceError: '', devicesError: '', error: '', message: '' }; }
  const owns = () => Boolean(root && context && isOpen() && ['userId', 'workspaceId', 'view'].every(key => context[key] === getContext()?.[key]));
  const valid = turn => turn === revision && owns();
  const options = extra => ({ ...extra, headers: { 'X-Workspace-ID': context.workspaceId, 'X-Outbox-Owner': String(context.userId) } });
  function clearPairing() { if (timer !== null) cancel(timer); timer = null; model.pairing = null; }
  function expired() {
    if (!model.pairing || Date.parse(model.pairing.pairingExpiresAt) > now()) return false;
    clearPairing(); model.message = 'Срок кода истёк. Если виджет ещё не подключён, получите новый код.'; return true;
  }
  function paint() {
    if (!owns()) return;
    expired();
    root.innerHTML = mobileWidgetsMarkup(model, escapeHTML, icon);
    const source = root.querySelector('[data-mobile-widget-source]'), name = root.querySelector('[data-mobile-widget-name]');
    if (source) source.onchange = () => { if (owns() && !model.busy) { model.draft.source = source.value; const button = root.querySelector('[data-mobile-widget-connect]'); if (button) button.disabled = !source.value || Boolean(model.pairing); } };
    if (name) name.oninput = () => { if (owns() && !model.busy) model.draft.name = name.value; };
    const form = root.querySelector('[data-mobile-widget-form]');
    if (form) form.onsubmit = event => { event.preventDefault(); return create(); };
    root.querySelector('[data-mobile-widget-reload]').onclick = () => load();
    const copy = root.querySelector('[data-mobile-widget-copy]'); if (copy) copy.onclick = () => copyCode();
    const clear = root.querySelector('[data-mobile-widget-clear]'); if (clear) clear.onclick = () => { if (owns()) { clearPairing(); model.message = 'Код скрыт. Подключения можно отключить ниже.'; paint(); } };
    root.querySelectorAll('[data-mobile-widget-revoke]').forEach(button => { button.onclick = () => revoke(button.dataset.mobileWidgetRevoke); });
    enhance(root);
  }
  async function load() {
    if (!owns() || model.loading || model.busy) return;
    const turn = revision, read = ++listRevision;
    model.loading = true; model.error = ''; model.sourceError = ''; model.devicesError = ''; paint();
    const [sources, devices] = await Promise.allSettled([api('/api/me/widgets/sources', options()), api('/api/me/widgets', options())]);
    if (!valid(turn)) return;
    model.loading = false;
    if (sources.status === 'fulfilled' && Array.isArray(sources.value?.sources)) {
      model.sources = sources.value.sources;
      if (!model.sources.some(source => widgetSourceKey(source) === model.draft.source)) model.draft.source = '';
    } else { model.sources = []; model.sourceError = 'Не удалось загрузить блоки. Повторите загрузку.'; }
    if (read === listRevision) {
      if (devices.status === 'fulfilled' && Array.isArray(devices.value?.devices)) model.devices = devices.value.devices;
      else model.devicesError = 'Не удалось загрузить подключения. Повторите загрузку.';
    }
    paint();
  }
  async function create() {
    if (!owns() || model.busy || model.loading || model.pairing) return;
    const source = model.sources.find(item => widgetSourceKey(item) === model.draft.source);
    if (!source) { model.error = 'Выберите блок страницы.'; paint(); return; }
    const name = model.draft.name.trim();
    if ([...name].length > 80) { model.error = 'Название устройства должно быть не длиннее 80 символов.'; paint(); return; }
    const turn = revision, requestOptions = options({ method: 'POST', body: JSON.stringify({ pageId: source.pageId, blockId: source.blockId, name }) });
    listRevision++;
    model.busy = 'create'; model.error = ''; model.message = ''; paint();
    try {
      const result = await api('/api/me/widgets', requestOptions);
      if (!valid(turn)) return;
      const expires = Date.parse(result?.pairingExpiresAt);
      if (!result?.id || !/^[a-f0-9]{32}$/.test(result.pairingCode || '') || !Number.isFinite(expires) || expires <= now()) throw new Error('invalid_pairing');
      clearPairing(); model.pairing = result; model.message = 'Код готов. Вставьте его в настройке виджета на телефоне.';
      timer = schedule(() => { timer = null; if (valid(turn)) { expired(); paint(); } }, Math.max(1, expires - now() + 50));
      model.busy = ''; paint();
      // Read the saved grant independently: a list failure must not discard a valid one-time code.
      const read = ++listRevision;
      try { const list = await api('/api/me/widgets', options()); if (valid(turn) && read === listRevision && Array.isArray(list?.devices)) { model.devices = list.devices; model.devicesError = ''; paint(); } }
      catch (_) { if (valid(turn) && read === listRevision) { model.devicesError = 'Код создан, но список подключений не обновился. Повторите загрузку.'; paint(); } }
    } catch (_) {
      if (valid(turn)) { model.error = 'Не удалось получить код. Проверьте список подключений перед повтором: запрос мог сохраниться на сервере.'; model.busy = ''; paint(); }
    }
  }
  async function copyCode() {
    if (!owns() || !model.pairing) return;
    if (expired()) { paint(); return; }
    const turn = revision, code = model.pairing.pairingCode;
    try {
      if (!nav.clipboard?.writeText) throw new Error('clipboard_unavailable');
      await nav.clipboard.writeText(code);
      if (valid(turn) && model.pairing?.pairingCode === code) { model.message = 'Код скопирован. Вставьте его в настройке виджета.'; paint(); }
    } catch (_) {
      if (!valid(turn) || model.pairing?.pairingCode !== code) return;
      model.message = 'Копирование недоступно. Выделите код и скопируйте его вручную.'; paint();
      const field = root.querySelector('[data-mobile-widget-code]'); field?.focus(); field?.select();
    }
  }
  async function revoke(id) {
    if (!owns() || model.loading || model.busy || !model.devices.some(device => device.id === id)) return;
    const turn = revision, requestOptions = options({ method: 'DELETE' });
    listRevision++;
    model.busy = id; model.error = ''; model.message = ''; paint();
    try {
      await api(`/api/me/widgets/${encodeURIComponent(id)}`, requestOptions);
      if (!valid(turn)) return;
      model.devices = model.devices.filter(device => device.id !== id);
      if (model.pairing?.id === id) clearPairing();
      model.message = 'Доступ отключён. При следующем обновлении виджет удалит старые данные.';
    } catch (_) { if (valid(turn)) model.error = 'Не удалось отключить доступ. Проверьте соединение и повторите.'; }
    finally { if (valid(turn)) { model.busy = ''; paint(); } }
  }
  return {
    mount(element) { root = element; if (owns()) paint(); },
    open() { this.reset(); context = { ...getContext() }; return load(); },
    reset() { revision++; listRevision++; clearPairing(); model = empty(); context = null; if (root) root.innerHTML = ''; },
  };
}
