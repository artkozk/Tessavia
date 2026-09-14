// Permission belongs to a device. Account reminder preferences remain independent.
export function phonePushSupport(win, nav) {
  const ios = /iPad|iPhone|iPod/.test(nav.userAgent || '') || /Macintosh/.test(nav.userAgent || '') && nav.maxTouchPoints > 1;
  if (ios && !(nav.standalone || win.matchMedia?.('(display-mode: standalone)').matches)) return 'install';
  return win.isSecureContext && win.Notification && nav.serviceWorker && win.PushManager ? 'supported' : 'unsupported';
}

export function pushApplicationKey(value) {
  const raw = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  if (raw.length !== 65 || raw.charCodeAt(0) !== 4) throw new Error('Некорректный ключ доставки. Попробуйте позже.');
  return Uint8Array.from(raw, char => char.charCodeAt(0));
}

const statuses = {
  enabled: 'Подключено', accepted: 'Сервис доставки принял уведомление', retrying: 'Повторяем доставку',
  quiet: 'Отложено до конца тихих часов', obsolete: 'Неактуальное уведомление пропущено',
  disabled: 'Выключено', expired: 'Подписка истекла — подключите устройство заново',
  key_changed: 'Ключ доставки изменён — подключите устройство заново',
  cancelled: 'Проверка отменена: подключение уже не действует',
  rejected: 'Сервис отклонил доставку — подключите устройство заново', failed: 'Не удалось доставить уведомление',
};
export function pushStatusLabel(status) { return statuses[status] || 'Подключено'; }

// Kept separate from the view so permission, logout and delayed replies can be exercised.
export function createPhonePushController({ read, ready, requestPermission, permission, alive, remember, recalled }) {
  let settings = null, subscription = null, id = recalled() || '', busy = false, reconnect = false, ownerChanged = false;
  const checkedRead = async (...args) => {
    if (ownerChanged) throw new Error('Аккаунт изменился в другой вкладке. Сохраните текущий текст и войдите заново.');
    try { return await read(...args); }
    catch (failure) { if (failure.code === 'outbox_owner_changed' || failure.status === 401) { ownerChanged = true; reconnect = false; } throw failure; }
  };
  const snapshot = () => ({ settings, subscription: Boolean(subscription), id, busy, reconnect, ownerChanged,
    active: Boolean(subscription && permission() === 'granted' && settings?.devices.some(d => d.id === id && d.current && d.enabled)) });
  async function load() {
    const [config, registration] = await Promise.all([checkedRead('/api/me/push'), ready()]);
    if (!alive()) return snapshot();
    const currentSubscription = registration ? await registration.pushManager.getSubscription() : null;
    if (alive()) { settings = config; subscription = currentSubscription; if (config.devices.some(d => d.id === id && d.lastStatus === 'key_changed')) reconnect = true; }
    return snapshot();
  }
  async function enable(name, replace = false) {
    if (busy || !alive() || !settings?.configured) return snapshot();
    name = String(name || '').trim();
    if (!name || [...name].length > 80) throw new Error('Назовите устройство: от 1 до 80 символов.');
    busy = true;
    let created = null;
    try {
      if (ownerChanged) throw new Error('Аккаунт изменился в другой вкладке. Сохраните текущий текст и войдите заново.');
      // This call precedes every await: iOS requires an explicit user gesture.
      const permissionResult = permission() === 'granted' ? 'granted' : requestPermission();
      if (await permissionResult !== 'granted') throw new Error('Уведомления не разрешены. Измените разрешение в настройках браузера или телефона.');
      if (!alive()) return snapshot();
      // Cookie sharing across tabs can change the account without updating this page's state.
      // Check the owner-bound API before touching the browser's shared subscription.
      const latest = await checkedRead('/api/me/push');
      if (!alive()) return snapshot();
      settings = latest;
      if (!settings.configured) throw new Error('Доставка временно выключена на сервере. Попробуйте позже.');
      const registration = await ready();
      if (!alive()) return snapshot();
      if (!registration) throw new Error('Приложение ещё готовится. Обновите настройки через несколько секунд.');
      let existing = await registration.pushManager.getSubscription();
      if (!alive()) return snapshot();
      const desiredKey = pushApplicationKey(settings.publicKey), existingKey = existing?.options?.applicationServerKey;
      if (!replace && existingKey && String([...new Uint8Array(existingKey)]) !== String([...desiredKey])) {
        reconnect = true;
        throw new Error('Ключ доставки изменился. Переподключите устройство, чтобы получать уведомления.');
      }
      if (replace && existing) {
        if (!await existing.unsubscribe()) throw new Error('Не удалось отключить прежнюю подписку. Повторите попытку.');
        existing = null;
      }
      if (!alive()) return snapshot();
      const next = existing || (created = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: desiredKey }));
      if (!alive()) { if (created) await created.unsubscribe().catch(() => {}); return snapshot(); }
      const data = next.toJSON();
      const result = await checkedRead('/api/me/push/subscriptions', { method: 'POST', body: JSON.stringify({ endpoint: data.endpoint, keys: data.keys, name, expectedPublicKey: settings.publicKey }) });
      created = null; // The server accepted this explicit opt-in; closing the dialog does not undo it.
      if (!alive()) return snapshot();
      id = result.subscriptionId; remember(id); subscription = next; reconnect = false;
      return await load();
    } catch (failure) {
      if (created) await created.unsubscribe().catch(() => {});
      if (alive() && failure.status === 409 && !ownerChanged) reconnect = true;
      throw failure;
    } finally { busy = false; }
  }
  async function disable(deviceId) {
    if (busy || !alive() || !settings?.devices.some(d => d.id === deviceId)) return snapshot();
    busy = true;
    try {
      try { await checkedRead(`/api/me/push/subscriptions/${encodeURIComponent(deviceId)}`, { method: 'DELETE' }); }
      catch (failure) { if (failure.status !== 404) throw failure; } // A lost successful response is safe to retry.
      // Remote devices are revoked only on the server; never unsubscribe this browser for them.
      if (deviceId === id && alive()) {
        id = ''; remember('');
        if (subscription) await subscription.unsubscribe();
        subscription = null;
      }
      if (alive()) return await load();
      return snapshot();
    } finally { busy = false; }
  }
  async function test() {
    if (busy || !alive() || !snapshot().active) return null;
    busy = true;
    try { return await checkedRead('/api/me/push/test', { method: 'POST', body: JSON.stringify({ subscriptionId: id }) }); }
    finally { busy = false; }
  }
  return { load, enable, disable, test, snapshot };
}

export function mountPhonePushSettings({ container, state, read, escapeHTML: e, alive, win = window, nav = navigator }) {
  const support = phonePushSupport(win, nav), owner = state.me?.id;
  const current = () => alive() && container.isConnected && owner === state.me?.id;
  const storageKey = `tessavie:push-device:${owner}`;
  const ready = () => support === 'supported' ? nav.serviceWorker.getRegistration('/') : Promise.resolve(null);
  const controller = createPhonePushController({ read, ready, alive: current,
    permission: () => win.Notification?.permission,
    requestPermission: () => win.Notification.requestPermission(),
    recalled: () => { try { return win.localStorage.getItem(storageKey); } catch (_) { return ''; } },
    remember: value => { try { if (value) win.localStorage.setItem(storageKey, value); else win.localStorage.removeItem(storageKey); } catch (_) { /* Opt-in still works during this visit. */ } },
  });
  let name = /iPhone|iPad|iPod/.test(nav.userAgent || '') ? 'Мой iPhone или iPad' : /Android/.test(nav.userAgent || '') ? 'Мой Android' : 'Этот компьютер';
  let message = '', error = '', loading = true;
  const q = selector => container.querySelector(selector);
  function render() {
    if (!current()) return;
    const view = controller.snapshot(), config = view.settings, denied = win.Notification?.permission === 'denied';
    container.innerHTML = `<h3 id="phone-push-title">На этом устройстве</h3><p>Включите уведомления на нужном телефоне. Другие устройства сами не подключаются.</p>
      ${support === 'install' ? '<p class="muted">На iPhone и iPad добавьте Tessavie на экран «Домой» и откройте с её значка. Уведомления доступны в iOS 16.4 и новее.</p>' : support === 'unsupported' ? '<p class="muted">Этот браузер не поддерживает доставку в текущем режиме. Откройте установленную Tessavie на телефоне через защищённое соединение.</p>' : ''}
      ${loading ? '<p role="status">Проверяем подключение…</p>' : config && !config.configured ? '<p class="muted">Доставка на устройства пока не настроена. Уведомления внутри Tessavie продолжают работать.</p>' : ''}
      ${denied ? '<p class="muted">Уведомления заблокированы в браузере или настройках телефона. Разрешите их там и нажмите «Обновить».</p>' : ''}
      ${config?.configured && support === 'supported' ? view.active ? `<p class="phone-push-active">Уведомления включены на этом устройстве</p><div class="phone-push-actions"><button type="button" class="secondary" data-push-test>Проверить доставку</button><button type="button" class="text-button" data-push-disable="${e(view.id)}">Выключить здесь</button></div>` : `<label>Название устройства<input data-push-name maxlength="80" autocomplete="off" value="${e(name)}"></label><button type="button" class="primary" data-push-enable ${denied ? 'disabled' : ''}>${view.reconnect ? 'Переподключить для этого аккаунта' : 'Включить на этом устройстве'}</button>${view.reconnect ? '<p class="muted">Прежняя браузерная подписка будет отключена, новая будет относиться к текущему аккаунту.</p>' : ''}` : ''}
      <p class="phone-push-feedback" role="status" ${message ? '' : 'hidden'}>${e(message)}</p><p class="form-error" role="alert" ${error ? '' : 'hidden'}>${e(error)}</p>
      ${config?.devices.length ? `<details class="phone-push-devices"><summary>Подключённые устройства · ${config.devices.length}</summary><ul>${config.devices.map(device => `<li><div><strong>${e(device.name)}</strong><small>${e(pushStatusLabel(device.lastStatus))}${device.current ? ' · Этот вход' : ''}</small></div><button type="button" class="text-button" data-push-disable="${e(device.id)}" aria-label="Отключить ${e(device.name)}">Отключить</button></li>`).join('')}</ul></details>` : ''}
      <button type="button" class="text-button" data-push-refresh ${loading ? 'disabled' : ''}>Обновить</button><details><summary>Как работает доставка</summary><p class="muted">На экране блокировки — только «Есть новое уведомление», без текста заметок, сумм и названий дел. Тихие часы действуют и здесь. Ручная проверка отправляется сразу. Принятие сервисом доставки ещё не подтверждает показ на телефоне: он зависит от сети, режима фокусирования и разрешений ОС. Выход из аккаунта отключает подписку этого входа.</p></details>`;
    if (q('[data-push-name]')) q('[data-push-name]').oninput = event => { name = event.target.value; };
    if (q('[data-push-enable]')) q('[data-push-enable]').onclick = () => act(() => controller.enable(name, view.reconnect), 'Устройство подключено. Можно отправить проверку.');
    if (q('[data-push-test]')) q('[data-push-test]').onclick = () => act(async () => {
      const result = await controller.test();
      return result ? { message: result.status === 'queued' ? 'Проверка в очереди. Посмотрите уведомления телефона.' : pushStatusLabel(result.status) + '. Посмотрите уведомления телефона.' } : null;
    });
    container.querySelectorAll('[data-push-disable]').forEach(button => { button.onclick = () => act(() => controller.disable(button.dataset.pushDisable), 'Доставка на выбранное устройство отключена.'); });
    q('[data-push-refresh]').onclick = refresh;
    if (loading || view.ownerChanged) container.querySelectorAll('button,input').forEach(node => { node.disabled = true; });
  }
  async function act(operation, success = '') {
    if (!current() || controller.snapshot().busy) return;
    error = ''; message = '';
    // Start before disabling controls: permission remains part of the button gesture.
    const pending = operation();
    container.querySelectorAll('button,input').forEach(node => { node.disabled = true; });
    try { const result = await pending; if (current()) message = result?.message || success; }
    catch (failure) { if (current()) error = failure instanceof DOMException ? 'Браузер не смог подключить уведомления. Проверьте разрешение и соединение, затем повторите.' : failure.message || 'Не удалось изменить подключение. Повторите попытку.'; }
    if (current()) render();
  }
  async function refresh() {
    if (!current() || controller.snapshot().busy) return;
    loading = true; error = ''; render();
    try { await controller.load(); } catch (_) { if (current()) error = 'Не удалось проверить устройства. Проверьте соединение и нажмите «Обновить».'; }
    loading = false; render();
  }
  render(); refresh();
  return controller;
}
