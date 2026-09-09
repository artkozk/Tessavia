const settingsSections = [
  { id: 'page', title: 'Текущая страница', icon: 'fileText' },
  { id: 'interface', title: 'Интерфейс', icon: 'sliders' },
  { id: 'personal', title: 'Личные настройки', icon: 'settings' },
  { id: 'workspace', title: 'Пространство', icon: 'folder' },
];

// This catalog chooses entry points only. Existing editors remain responsible
// for persistence, draft recovery and server-side access checks.
export function settingsHubSections(context = {}) {
  const admin = Boolean(context.canConfigure);
  const customPage = Boolean(context.pageApp);
  const collections = Array.isArray(context.collections) ? context.collections : [];
  const adminReason = 'Общие настройки меняет администратор пространства.';
  const row = (key, title, description, icon, disabledReason = '') => ({ key, title, description, icon, disabledReason });
  const groups = {
    page: [
      row('page-edit', context.layoutEditing ? 'Продолжить редактирование' : customPage ? 'Конструктор страницы' : 'Оформление страницы', customPage
        ? `Блоки, текст, данные и действия ${context.personal ? 'на этой странице' : 'на общей странице'}.`
        : 'Порядок, размеры, цвета и видимость блоков. Изменения только для вас.', 'edit', customPage && !admin ? adminReason : ''),
      ...(context.pageId && !customPage ? [row('source-settings', 'Источник и поля страницы', 'Данные, выбранные поля и правила отображения страницы.', 'fileText', admin ? '' : adminReason)] : []),
      ...(context.collectionId && admin ? [row('board-settings', 'Настройки доски', 'Поля, колонки и правила работы с карточками.', 'network')] : []),
      ...(customPage && admin ? [row('page-share', 'Сохранить страницу как набор', 'Передать готовую структуру для независимой установки.', 'copy')] : []),
    ],
    interface: [
      row('menu', 'Меню и разделы', 'Выберите пункты меню и их порядок.', 'menu'),
      row('appearance', 'Плотность и панели', 'Размеры рабочей области, бокового меню и верхней панели.', 'sliders'),
      row('interface-presets', 'Наборы оформления', 'Сохранить или применить оформление интерфейса.', 'copy'),
      row('page-library', 'Наборы страниц', admin ? 'Посмотреть готовые страницы и установить подходящую.' : 'Посмотреть готовые страницы. Установка доступна администратору.', 'fileText'),
    ],
    personal: [
      row('profile', 'Профиль и аккаунт', 'Имя, фотография, сведения о себе и безопасность.', 'users'),
      row('reminders', 'Уведомления и напоминания', 'Когда и о чём напоминать лично вам.', 'bell'),
      row('day', 'Границы дня', 'Начало и завершение дня для личного планирования.', 'clock'),
    ],
    workspace: [
      row('pages', 'Свои страницы', 'Создание, названия и состав страниц пространства.', 'fileText', admin ? '' : adminReason),
      row('modules', 'Разделы пространства', 'Функции, доступные в этом пространстве.', 'dashboard', admin ? '' : adminReason),
      row('card-templates', 'Содержимое карточек', 'Стандартные поля и блоки типов карточек.', 'checkSquare'),
      ...(context.teamId ? [row('team', 'Участники и доступы', admin ? 'Состав команды, роли и приглашения.' : 'Посмотреть состав команды и доступные роли.', 'users')] : []),
      ...(collections.length ? [row('boards', 'Доски и поля', 'Структура данных, поля и колонки досок.', 'network', admin ? '' : adminReason)] : []),
    ],
  };
  const scope = context.personal ? 'Личное пространство' : (context.workspaceName || 'Текущее пространство');
  return settingsSections.map(section => ({
    ...section,
    description: section.id === 'page'
      ? `${context.pageName || 'Текущая страница'} · ${scope}${customPage ? context.personal ? ' · структура страницы' : ' · общая структура' : ` · ${context.deviceLabel || 'это устройство'}`}`
      : section.id === 'interface'
        ? `Оформление только для вас · ${scope} · ${context.deviceLabel || 'это устройство'}`
        : section.id === 'personal'
          ? 'Ваш аккаунт и личные предпочтения.'
          : `${scope}${context.personal ? ' · доступно только вам' : ' · общие настройки участников'}`,
    rows: groups[section.id],
  }));
}

export function settingsHubMarkup(sections, active, escapeHTML, icon) {
  const e = value => escapeHTML(String(value ?? ''));
  const section = sections.find(item => item.id === active) || sections[0];
  return `<header class="settings-hub-header"><h2 id="settings-hub-title">Настройки</h2><button type="button" class="icon-button" data-settings-close aria-label="Закрыть настройки">${icon('x')}</button></header>
    <div class="settings-hub-layout">
      <nav class="settings-hub-nav" role="tablist" aria-label="Разделы настроек">${sections.map(item => `<button type="button" role="tab" id="settings-tab-${item.id}" aria-controls="settings-panel" aria-selected="${item.id === section.id}" tabindex="${item.id === section.id ? '0' : '-1'}" data-settings-section="${item.id}"><span aria-hidden="true">${icon(item.icon)}</span><span>${e(item.title)}</span></button>`).join('')}</nav>
      <section class="settings-hub-panel" id="settings-panel" role="tabpanel" aria-labelledby="settings-tab-${section.id}" tabindex="0">
        <div class="settings-hub-context"><h3>${e(section.title)}</h3><p>${e(section.description)}</p></div>
        <div class="settings-hub-rows">${section.rows.map(item => `<button type="button" class="settings-hub-row" data-settings-action="${item.key}"${item.disabledReason ? ' disabled' : ''}><span class="settings-hub-row-icon" aria-hidden="true">${icon(item.icon)}</span><span class="settings-hub-row-copy"><strong>${e(item.title)}</strong><span>${e(item.description)}</span>${item.disabledReason ? `<small>${e(item.disabledReason)}</small>` : ''}</span><span class="settings-hub-row-arrow" aria-hidden="true">${icon('chevronRight')}</span></button>`).join('')}</div>
        <p class="settings-hub-status" role="status" data-settings-status hidden></p>
        <p class="settings-hub-error" role="alert" data-settings-error hidden></p>
      </section>
    </div>`;
}

export function createSettingsHub({ getContext, escapeHTML, icon, openModal, requestDialogClose, runAction }) {
  // Create before the app binds its shared dialog history/backdrop handlers.
  const dialog = document.createElement('dialog');
  dialog.id = 'settings-dialog';
  dialog.className = 'settings-hub';
  dialog.setAttribute('aria-labelledby', 'settings-hub-title');
  document.body.append(dialog);
  let active = 'page', context = null, sections = [], busy = false, revision = 0;

  function setBusy(value) {
    busy = value;
    dialog.setAttribute('aria-busy', String(value));
    dialog.querySelectorAll('button').forEach(button => {
      const item = sections.flatMap(section => section.rows).find(row => row.key === button.dataset.settingsAction);
      button.disabled = value || Boolean(item?.disabledReason);
    });
    const status = dialog.querySelector('[data-settings-status]');
    if (status) { status.hidden = !value; status.textContent = value ? 'Открываем настройки…' : ''; }
  }

  function paint(focusTab = false) {
    dialog.innerHTML = settingsHubMarkup(sections, active, escapeHTML, icon);
    dialog.querySelector('[role="tablist"]').setAttribute('aria-orientation', window.matchMedia('(max-width: 640px)').matches ? 'horizontal' : 'vertical');
    dialog.querySelector('[data-settings-close]').onclick = close;
    dialog.querySelectorAll('[data-settings-section]').forEach(button => {
      button.onclick = () => { if (!busy) { active = button.dataset.settingsSection; paint(true); } };
      button.onkeydown = event => {
        const direction = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
        if (direction === undefined && event.key !== 'Home' && event.key !== 'End') return;
        event.preventDefault();
        if (busy) return;
        const index = sections.findIndex(item => item.id === active);
        active = sections[event.key === 'Home' ? 0 : event.key === 'End' ? sections.length - 1 : (index + direction + sections.length) % sections.length].id;
        paint(true);
      };
    });
    dialog.querySelectorAll('[data-settings-action]').forEach(button => {
      button.onclick = async () => {
        const item = sections.find(section => section.id === active)?.rows.find(row => row.key === button.dataset.settingsAction);
        if (busy || !item || item.disabledReason) return;
        const turn = revision;
        const error = dialog.querySelector('[data-settings-error]');
        error.hidden = true;
        setBusy(true);
        try {
          // The parent retains this hub behind existing leaf dialogs. It closes
          // the hub explicitly when an action starts an inline page editor.
          await runAction(item.key, { section: active, context });
        } catch (cause) {
          if (turn === revision && dialog.open) {
            error.textContent = cause?.message || 'Не удалось открыть настройки. Попробуйте ещё раз.';
            error.hidden = false;
          }
        } finally {
          if (turn === revision) setBusy(false);
        }
      };
    });
    setBusy(false);
    if (focusTab) dialog.querySelector(`[data-settings-section="${active}"]`).focus();
  }

  function open(section = 'page') {
    revision += 1;
    const source = getContext() || {};
    context = { ...source, collections: (Array.isArray(source.collections) ? source.collections : []).map(item => ({ ...item })) };
    sections = settingsHubSections(context);
    active = sections.some(item => item.id === section) ? section : 'page';
    paint();
    openModal(dialog);
    dialog.querySelector(`[data-settings-section="${active}"]`).focus({ preventScroll: true });
  }

  async function close() {
    return requestDialogClose(dialog);
  }

  return { open, close };
}
