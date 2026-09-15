import { createMobileWidgetsUI } from './mobile-widgets.js?v=20260915-team-finance-media-1';

const launchActions = new Set(['note', 'plan', 'today', 'notes', 'notifications']);

export function mobileLaunchAction(value, origin) {
  try {
    const url = new URL(value, origin);
    if (url.origin !== new URL(origin).origin || url.pathname !== '/' || url.hash || url.username || url.password) return '';
    const entries = [...url.searchParams];
    return entries.length === 1 && entries[0][0] === 'launch' && launchActions.has(entries[0][1]) ? entries[0][1] : '';
  } catch (_) { return ''; }
}

export function mobileLaunchURL(action) {
  return launchActions.has(action) ? `/?launch=${action}` : '';
}

export function mobileNotificationMessage(event, origin) {
  if (event?.data?.type !== 'tessavie-open-notifications' || !event.source?.scriptURL) return false;
  try { const source = new URL(event.source.scriptURL); return source.origin === origin && source.pathname === '/sw.js'; }
  catch (_) { return false; }
}

export function mobileDeviceState(win, nav) {
  return {
    standalone: Boolean(win.matchMedia?.('(display-mode: standalone)').matches || nav.standalone),
    ios: /iPad|iPhone|iPod/.test(nav.userAgent || '') || /Macintosh/.test(nav.userAgent || '') && nav.maxTouchPoints > 1,
    android: /Android/.test(nav.userAgent || ''),
    online: nav.onLine !== false,
    permission: win.Notification?.permission || 'unsupported',
  };
}

export function mobileAccessMarkup(device, { promptAvailable = false, installed = false } = {}, e, icon) {
  const status = device.standalone ? 'Открыто как приложение' : installed ? 'Установка подтверждена' : 'Открыто в браузере';
  const permission = { granted: 'Браузер разрешает уведомления', denied: 'Браузер блокирует уведомления', default: 'Разрешение уведомлений ещё не запрошено', unsupported: 'В этом режиме браузер не предоставляет уведомления' }[device.permission] || 'Проверьте настройки уведомлений';
  const shortcuts = [
    ['note', 'Новая заметка', 'Сразу открыть редактор. Несохранённый черновик восстановится.', 'edit'],
    ['notes', 'Мои заметки', 'Открыть личную библиотеку заметок.', 'fileText'],
    ['plan', 'Новое дело', 'Записать дело или событие в личное пространство.', 'checkSquare'],
    ['today', 'Сегодня', 'Открыть ваш личный экран без изменения его настройки.', 'calendar'],
  ];
  return `<header class="mobile-access-header"><div><p class="eyebrow">Личные настройки</p><h2 id="mobile-access-title">На телефоне</h2></div><button type="button" class="icon-button" data-mobile-access-close aria-label="Закрыть">${icon('x')}</button></header>
    <div class="mobile-access-body">
      <section aria-labelledby="mobile-install-title"><h3 id="mobile-install-title">Tessavie на экране телефона</h3><p>Добавьте приложение на главный экран, чтобы открывать его одним нажатием.</p><p class="mobile-access-device" role="status" data-mobile-device-status>${e(status)} · ${device.online ? 'Браузер в сети' : 'Браузер без сети'}</p>
      ${promptAvailable && !device.standalone && !installed ? '<button type="button" class="primary" data-mobile-install>Установить Tessavie</button>' : ''}
      ${device.standalone ? '<p class="muted">Вы уже открыли отдельное окно приложения. Ваши страницы и настройки остаются прежними.</p>' : installed ? '<p class="muted">Откройте Tessavie с нового значка на главном экране.</p>' : '<p class="muted">Если кнопки установки нет, используйте меню браузера. По этой вкладке нельзя определить, установлен ли уже отдельный экземпляр приложения.</p>'}
      <details${device.ios && !device.standalone ? ' open' : ''}><summary>iPhone и iPad</summary><ol><li>Откройте этот сайт в Safari.</li><li>В меню браузера выберите «Поделиться», затем «На экран “Домой”».</li><li>Если есть переключатель «Открыть как веб-приложение», включите его. Нажмите «Добавить».</li><li>Запускайте Tessavie с появившегося значка.</li></ol><a href="https://support.apple.com/ru-ru/guide/iphone/iphea86e5236/ios" target="_blank" rel="noopener noreferrer">Инструкция Apple</a></details>
      <details${device.android && !device.standalone ? ' open' : ''}><summary>Android</summary><ol><li>Откройте этот сайт в Chrome.</li><li>Нажмите ⋮ и выберите «Добавить на главный экран», затем «Установить», если этот пункт доступен.</li><li>Подтвердите добавление и запускайте Tessavie с нового значка.</li></ol><a href="https://support.google.com/chrome/answer/9658361?co=GENIE.Platform%3DAndroid&amp;hl=ru" target="_blank" rel="noopener noreferrer">Инструкция Chrome</a></details></section>
      <section aria-labelledby="mobile-shortcuts-title"><h3 id="mobile-shortcuts-title">Быстрый доступ</h3><p>Откройте нужный раздел или скопируйте его ссылку для своего ярлыка.</p><div class="mobile-access-shortcuts">${shortcuts.map(([action, title, description, glyph]) => `<article><a href="${mobileLaunchURL(action)}" data-mobile-launch="${action}">${icon(glyph)}<span><strong>${e(title)}</strong><small>${e(description)}</small></span></a><button type="button" class="icon-button" data-mobile-copy="${action}" aria-label="Скопировать ссылку: ${e(title)}" title="Скопировать ссылку">${icon('link')}</button></article>`).join('')}</div><p class="muted">В Android удерживайте значок установленной Tessavie: если система поддерживает быстрые команды, появятся «Новая заметка», «Новое дело» и «Сегодня». Состав меню зависит от браузера и системы.</p><details><summary>Отдельный ярлык на iPhone</summary><p>В приложении «Быстрые команды» создайте команду с действием «Открыть URL» и вставьте скопированную ссылку. Затем добавьте команду на экран «Домой». Она открывает выбранный раздел после входа в аккаунт.</p></details><label class="mobile-access-copy-fallback" data-mobile-copy-fallback hidden>Ссылка для копирования<input readonly type="url" data-mobile-copy-value></label></section>
      <section aria-labelledby="mobile-notification-title"><h3 id="mobile-notification-title">Уведомления</h3><p>${e(permission)}. Подключение этого устройства и проверка доставки находятся в настройках напоминаний.</p><button type="button" class="secondary" data-mobile-reminders>${icon('bell')} Уведомления и напоминания</button></section>
      <section aria-labelledby="mobile-widget-title" data-mobile-widgets><h3 id="mobile-widget-title">Виджеты Android</h3><p>Подключите блок своей страницы к виджету на главном экране Android. Для iPhone установка сайта и ярлыки описаны выше; системный виджет iOS пока не готов.</p></section>
      <p class="mobile-access-message" data-mobile-access-message role="status" hidden></p><p class="mobile-access-error" data-mobile-access-error role="alert" hidden></p>
    </div>`;
}

export function createMobileAccessUI({ api, getContext, runLaunch, openReminders, escapeHTML, icon, openModal, requestDialogClose, toast, enhance, win = window, nav = navigator, doc = document }) {
  const dialog = doc.createElement('dialog');
  dialog.id = 'mobile-access-dialog'; dialog.className = 'mobile-access-dialog';
  dialog.setAttribute('aria-labelledby', 'mobile-access-title'); doc.body.append(dialog);
  let context = null, revision = 0, deferredPrompt = null, installed = false, installBusy = false, launching = false;
  let pendingLaunch = mobileLaunchAction(win.location.href, win.location.origin);
  const owns = () => context && dialog.open && ['userId', 'workspaceId', 'view'].every(key => getContext()?.[key] === context[key]);
  const widgets = api ? createMobileWidgetsUI({ api, getContext, isOpen: owns, escapeHTML, icon, enhance, nav }) : null;
  dialog.addEventListener?.('close', () => widgets?.reset());
  const cleanLaunchURL = () => {
    const url = new URL(win.location.href);
    if (!url.searchParams.has('launch')) return;
    url.searchParams.delete('launch'); win.history.replaceState(win.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  };
  const announce = (message, error = false) => {
    if (!owns()) return;
    const node = dialog.querySelector(error ? '[data-mobile-access-error]' : '[data-mobile-access-message]');
    node.textContent = message; node.hidden = false;
  };
  async function launch(action) {
    const current = getContext();
    if (!launchActions.has(action) || launching || !current?.userId || !current.ready) return false;
    launching = true;
    try { return await runLaunch(action); }
    catch (error) { if (getContext()?.userId === current.userId) toast(error.message || 'Не удалось открыть раздел', true); return false; }
    finally { launching = false; if (pendingLaunch) void Promise.resolve().then(consumeLaunch); }
  }
  async function consumeLaunch() {
    const current = getContext();
    if (!pendingLaunch || !current?.userId || !current.ready || launching) return false;
    const action = pendingLaunch; pendingLaunch = ''; cleanLaunchURL();
    return launch(action);
  }
  function paint(preserve = false) {
    const scrollTop = dialog.scrollTop, detailStates = preserve ? [...dialog.querySelectorAll('details')].map(item => item.open) : [];
    const focused = preserve && dialog.contains?.(doc.activeElement) ? doc.activeElement : null;
    const focusAttribute = ['data-mobile-access-close', 'data-mobile-install', 'data-mobile-launch', 'data-mobile-copy', 'data-mobile-reminders', 'data-mobile-widget-name', 'data-mobile-widget-source'].find(name => focused?.hasAttribute?.(name));
    const focusValue = focusAttribute ? focused.getAttribute(focusAttribute) : '';
    dialog.innerHTML = mobileAccessMarkup(mobileDeviceState(win, nav), { promptAvailable: Boolean(deferredPrompt), installed }, escapeHTML, icon);
    widgets?.mount(dialog.querySelector('[data-mobile-widgets]'));
    dialog.querySelector('[data-mobile-access-close]').onclick = () => requestDialogClose(dialog);
    dialog.querySelectorAll('[data-mobile-launch]').forEach(link => link.onclick = event => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button > 0) return;
      event.preventDefault(); if (owns()) void launch(link.dataset.mobileLaunch);
    });
    dialog.querySelectorAll('[data-mobile-copy]').forEach(button => button.onclick = async () => {
      if (!owns()) return;
      const turn = revision, url = new URL(mobileLaunchURL(button.dataset.mobileCopy), win.location.origin).href;
      try { if (!nav.clipboard?.writeText) throw new Error('Clipboard unavailable'); await nav.clipboard.writeText(url); if (turn === revision) announce('Ссылка скопирована'); }
      catch (_) { if (!owns() || turn !== revision) return; const field = dialog.querySelector('[data-mobile-copy-value]'); dialog.querySelector('[data-mobile-copy-fallback]').hidden = false; field.value = url; field.focus(); field.select(); announce('Выделите и скопируйте ссылку'); }
    });
    dialog.querySelector('[data-mobile-reminders]').onclick = () => { if (owns()) void openReminders(); };
    const install = dialog.querySelector('[data-mobile-install]');
    if (install) {
      install.disabled = installBusy;
      install.onclick = async () => {
        if (!owns() || installBusy || !deferredPrompt) return;
        const prompt = deferredPrompt, turn = revision; deferredPrompt = null; installBusy = true; install.disabled = true;
        try {
          await prompt.prompt(); const choice = await prompt.userChoice;
          if (!owns() || turn !== revision) return;
          paint(true); announce(choice?.outcome === 'accepted' ? 'Установка подтверждена. Дождитесь появления значка на главном экране.' : 'Установка отменена. Её можно повторить через меню браузера.');
        } catch (_) { if (owns() && turn === revision) { paint(true); announce('Не удалось открыть установку. Используйте инструкцию для вашего браузера.', true); } }
        finally { installBusy = false; }
      };
    }
    if (preserve) {
      dialog.querySelectorAll('details').forEach((item, index) => { if (index < detailStates.length) item.open = detailStates[index]; });
      dialog.scrollTop = scrollTop;
      if (focusAttribute) [...dialog.querySelectorAll(`[${focusAttribute}]`)].find(item => item.getAttribute(focusAttribute) === focusValue)?.focus({preventScroll:true});
    }
  }
  const repaint = () => { if (owns()) paint(true); };
  win.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferredPrompt = event; repaint(); });
  win.addEventListener('appinstalled', () => { installed = true; deferredPrompt = null; repaint(); });
  win.addEventListener('online', repaint); win.addEventListener('offline', repaint);
  win.matchMedia?.('(display-mode: standalone)').addEventListener?.('change', repaint);
  nav.serviceWorker?.addEventListener('message', event => {
    if (!mobileNotificationMessage(event, win.location.origin)) return;
    pendingLaunch = 'notifications'; void consumeLaunch();
  });
  return {
    open() { if (!getContext()?.userId) return; context = { ...getContext() }; revision++; paint(); openModal(dialog); void widgets?.open(); },
    consumeLaunch,
    resetPrivate() { revision++; context = null; widgets?.reset(); if (getContext()?.userId) { pendingLaunch = ''; cleanLaunchURL(); } },
  };
}
