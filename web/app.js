const typeMeta = {
  goal: { label: 'Цели', singular: 'Цель', icon: 'target' },
  task: { label: 'Задачи', singular: 'Задача', icon: 'checkSquare' },
  question_set: { label: 'Вопросы', singular: 'Карточка вопросов', icon: 'messages' },
  idea: { label: 'Идеи', singular: 'Идея', icon: 'lightbulb' },
  criterion: { label: 'Критерии', singular: 'Критерий', icon: 'sliders' },
  research: { label: 'Исследования', singular: 'Исследование', icon: 'flask' },
  decision: { label: 'Решения', singular: 'Решение', icon: 'scale' },
  disagreement: { label: 'Разногласия', singular: 'Разногласие', icon: 'gitCompare' },
  document: { label: 'Документы', singular: 'Документ', icon: 'fileText' },
  meeting: { label: 'Встречи', singular: 'Встреча', icon: 'calendar' },
};

const iconPaths = {
  dashboard: '<rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/>',
  target: '<circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1"/>',
  checkSquare: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="m9 12 2 2 4-4"/>',
  messages: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/>',
  lightbulb: '<path d="M9 18h6M10 22h4"/><path d="M8.3 14.5A7 7 0 1 1 15.7 14.5c-.9.7-1.2 1.4-1.2 2.5h-5c0-1.1-.3-1.8-1.2-2.5Z"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3"/><path d="M7.5 15h9"/>',
  scale: '<path d="m16 16 3-8 3 8a5 5 0 0 1-6 0ZM2 16l3-8 3 8a5 5 0 0 1-6 0ZM7 21h10M12 3v18M3 7h18"/>',
  gitCompare: '<circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7M11 18H8a2 2 0 0 1-2-2V9"/>',
  fileText: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
  chevronRight: '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  archive: '<path d="M21 8v13H3V8M1 3h22v5H1zM10 12h4"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.1.1l2-2a5 5 0 0 0-7.1-7.1l-1.1 1.1"/><path d="M14 11a5 5 0 0 0-7.1-.1l-2 2A5 5 0 0 0 12 20l1.1-1.1"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.6 2.6 0 0 1 5 1c0 2-2.5 2-2.5 4M12 18h.01"/>',
  calendar: '<rect width="18" height="18" x="3" y="4" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
  bookOpen: '<path d="M2 3h6a4 4 0 0 1 4 4v14a4 4 0 0 0-4-4H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a4 4 0 0 1 4-4h6z"/>',
  network: '<circle cx="12" cy="5" r="3"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><path d="m10.6 7.7-4.2 8.1M13.4 7.7l4.2 8.1M8 19h8"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  maximize: '<path d="M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5"/>',
  rotate: '<path d="M21 12a9 9 0 1 1-2.6-6.4L21 8"/><path d="M21 3v5h-5"/>',
  flag: '<path d="M5 22V4M5 4h11l-1 4 1 4H5"/>',
  lock: '<rect width="16" height="11" x="4" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sparkles: '<path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2Z"/><path d="m18.5 13-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8ZM5.5 14l-.6 1.6-1.6.6 1.6.6.6 1.6.6-1.6 1.6-.6-1.6-.6Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>',
  grip: '<circle cx="8" cy="7" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.help}</svg>`;
}

const statusLabels = {
  draft: 'Черновик', inbox: 'Новая идея', review: 'На рассмотрении', main: 'Главная идея',
  rejected: 'Отклонено', planned: 'Не начато', in_progress: 'В работе', blocked: 'Заблокировано',
  completed: 'Выполнено', postponed: 'Перенесено', cancelled: 'Отменено', archived: 'Архив',
};

const statusesByType = {
  idea: ['inbox', 'review', 'main', 'rejected'],
  goal: ['planned', 'in_progress', 'blocked', 'completed', 'postponed', 'cancelled'],
  task: ['planned', 'in_progress', 'blocked', 'postponed', 'completed', 'cancelled'],
  question_set: ['planned', 'in_progress', 'blocked', 'completed', 'postponed', 'cancelled'],
  meeting: ['planned', 'in_progress', 'completed', 'postponed', 'cancelled'],
  default: ['draft', 'in_progress', 'completed', 'cancelled'],
};

const priorityLabels = { low: 'Низкий', normal: 'Обычный', high: 'Высокий', critical: 'Критический' };
const priorityWeight = { critical: 0, high: 1, normal: 2, low: 3 };
const workstreamLabels = { business: 'Бизнес', platform: 'Разработка платформы', operations: 'Операционная работа' };
const editPolicyLabels = { shared: 'Общая: команда может изменять', owner_only: 'Личная: изменяет только ответственный' };
const graphGroups = [
  { key: 'goal', label: 'Цели', color: '#ef8f6b' },
  { key: 'task', label: 'Задачи', color: '#70d6b5' },
  { key: 'question_set', label: 'Группы вопросов', color: '#72b7d2' },
  { key: 'idea', label: 'Идеи', color: '#e7bd61' },
  { key: 'criterion', label: 'Критерии', color: '#b7ae8c' },
  { key: 'research', label: 'Исследования', color: '#9d8fe8' },
  { key: 'decision', label: 'Решения', color: '#c697dc' },
  { key: 'disagreement', label: 'Разногласия', color: '#e47682' },
  { key: 'document', label: 'Документы', color: '#aeb8b3' },
  { key: 'meeting', label: 'Встречи', color: '#65c8c3' },
  { key: 'question', label: 'Вопросы', color: '#78b5cf' },
  { key: 'answer', label: 'Ответы', color: '#e0ad54' },
  { key: 'joint_decision', label: 'Совместные итоги', color: '#58c09a' },
  { key: 'research_option', label: 'Варианты исследований', color: '#b4a8ef' },
];
const graphSettingDefaults = {
  showDiscussion: true, showOrphans: true, showArrows: false, physics: true,
  textFade: 38, nodeSize: 100, linkThickness: 100,
  centerForce: 46, repelForce: 58, linkForce: 54, linkDistance: 52,
};

const navItems = [
  ['dashboard', 'Обзор', 'dashboard', 'Работа'], ['work', 'Работа', 'checkSquare', 'Работа'],
  ['principles', 'Правила и критерии', 'bookOpen', 'Основа'], ['goal', 'Цели', 'target', 'Основа'],
  ['idea', 'Идеи', 'lightbulb', 'Бизнес'], ['document', 'Документы', 'fileText', 'Бизнес'],
  ['graph', 'Карта связей', 'network', 'Контроль'],
  ['history', 'История', 'history', 'Контроль'],
  ['structure', 'Шаблоны карточек', 'settings', 'Настройки'],
];

const state = {
  me: null, users: [], records: [], notifications: [], activity: [], definitions: [], pendingQuestions: [],
  view: 'dashboard', search: '', statusFilter: '', ownerFilter: '', authMode: 'login', activeDetail: null,
  activeRecordTab: 'overview', activeActivity: null, historyMode: 'feed', activeRecordRequest: 0,
  workScope: 'all', workType: 'all', workStatus: 'active', workstreamFilter: 'all',
  workOrder: 'priority', workSearchTimer: null, historyScope: 'project', historyActor: 'all', historyType: 'all',
  recordSearchTimer: null,
  graphResizeTimer: null,
  historyLoadedAll: false,
  graphData: null, graphInstance: null, graphFocusRecordId: '', graphDepth: 2, graphShowDiscussion: graphSettingDefaults.showDiscussion,
  graphTypeFilter: 'all', graphSearch: '', graphSelectedId: '', graphLinkSourceId: '', graphSettingsOpen: false,
  graphShowOrphans: graphSettingDefaults.showOrphans, graphShowArrows: graphSettingDefaults.showArrows, graphPhysics: graphSettingDefaults.physics,
  graphTextFade: graphSettingDefaults.textFade, graphNodeSize: graphSettingDefaults.nodeSize, graphLinkThickness: graphSettingDefaults.linkThickness,
  graphCenterForce: graphSettingDefaults.centerForce, graphRepelForce: graphSettingDefaults.repelForce,
  graphLinkForce: graphSettingDefaults.linkForce, graphLinkDistance: graphSettingDefaults.linkDistance,
  graphHiddenGroups: new Set(), graphGroupColors: Object.fromEntries(graphGroups.map((group) => [group.key, group.color])),
  graphSettingsLoaded: false, graphSearchTimer: null, graphTimelineTimer: null, graphTimelinePlaying: false, graphContextNodeId: '',
  recordWorkspace: [], activeWorkspaceRecordId: '', focusQuestionId: '',
  detailCache: new Map(), detailRequests: new Map(), searchTimer: null, suppressOverlayPop: false,
  presenceInteractions: 0, presenceLastSentAt: Date.now(), lastInteractionAt: Date.now(), aiSuggestionTimer: null,
  recordEditMode: false, aiAnalyses: new Map(), aiAnalysisLoading: '',
  researchComparisons: new Map(), researchComparisonRequests: new Map(), activeResearchOptionId: '',
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function renderMarkdown(value, empty = 'Не заполнено') {
  const source = String(value || '').trim();
  if (!source) return `<p class="markdown-empty">${escapeHTML(empty)}</p>`;
  if (!window.marked?.parse || !window.DOMPurify?.sanitize) return `<p>${escapeHTML(source).replace(/\n/g, '<br>')}</p>`;
  const parsed = window.marked.parse(source.replace(/^[\u200B-\u200F\uFEFF]/, ''), { gfm: true, breaks: true });
  const clean = window.DOMPurify.sanitize(parsed, { USE_PROFILES: { html: true }, FORBID_TAGS: ['style'] });
  const template = document.createElement('template');
  template.innerHTML = clean;
  $$('a', template.content).forEach((link) => {
    const href = link.getAttribute('href') || '';
    if (!/^(https?:|mailto:)/i.test(href)) link.removeAttribute('href');
    else if (/^https?:/i.test(href)) { link.target = '_blank'; link.rel = 'noopener noreferrer'; }
  });
  return template.innerHTML;
}

function markdownEditor(name, label, value, rows = 6, placeholder = '', suffix = '') {
  const id = `markdown-${String(name).replace(/[^a-z0-9_-]/gi, '-')}-${suffix || 'main'}`;
  return `<div class="markdown-editor"><label for="${escapeHTML(id)}">${escapeHTML(label)}</label><div class="markdown-toolbar" role="toolbar" aria-label="Инструменты Markdown"><button type="button" data-md="bold" title="Полужирный (Ctrl+B)" aria-label="Полужирный"><b>B</b></button><button type="button" data-md="italic" title="Курсив (Ctrl+I)" aria-label="Курсив"><i>I</i></button><button type="button" data-md="heading2" title="Заголовок второго уровня (Ctrl+Alt+2)" aria-label="Заголовок второго уровня">H2</button><button type="button" data-md="list" title="Маркированный список (Ctrl+Shift+8)" aria-label="Маркированный список">${icon('menu')}</button><button type="button" data-md="ordered" title="Нумерованный список (Ctrl+Shift+7)" aria-label="Нумерованный список">1.</button><button type="button" data-md="quote" title="Цитата (Ctrl+Shift+.)" aria-label="Цитата">❯</button><button type="button" data-md="code" title="Встроенный код (Ctrl+&#96;)" aria-label="Встроенный код">&lt;/&gt;</button><button type="button" data-md="note" title="Примечание" aria-label="Примечание">i</button><button type="button" data-md="link" title="Ссылка (Ctrl+K)" aria-label="Ссылка">${icon('link')}</button></div><textarea id="${escapeHTML(id)}" name="${escapeHTML(name)}" rows="${rows}" placeholder="${escapeHTML(placeholder)}">${escapeHTML(value || '')}</textarea></div>`;
}

function applyMarkdownAction(textarea, action) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const lineStart = textarea.value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
  const lineEnd = textarea.value.indexOf('\n', end);
  const replace = (from, to, text, selectionStart, selectionEnd) => {
    textarea.setRangeText(text, from, to, 'preserve');
    textarea.setSelectionRange(selectionStart, selectionEnd);
  };
  const wrap = (open, close, placeholder) => {
    const wrappedBefore = textarea.value.slice(Math.max(0, start - open.length), start) === open;
    const wrappedAfter = textarea.value.slice(end, end + close.length) === close;
    if (selected && wrappedBefore && wrappedAfter) {
      replace(start - open.length, end + close.length, selected, start - open.length, end - open.length);
      return;
    }
    const content = selected || placeholder;
    const text = `${open}${content}${close}`;
    replace(start, end, text, start + open.length, start + open.length + content.length);
  };
  if (action === 'bold') {
    wrap('**', '**', 'текст');
  } else if (action === 'italic') {
    wrap('*', '*', 'текст');
  } else if (action === 'code') {
    wrap('`', '`', 'код');
  } else if (action === 'link') {
    const text = `[${selected || 'название'}](https://)`;
    replace(start, end, text, start + text.indexOf('https://'), start + text.indexOf('https://') + 8);
  } else {
    const to = lineEnd === -1 ? textarea.value.length : lineEnd;
    const lines = textarea.value.slice(lineStart, to).split('\n');
    const headingLevel = action.startsWith('heading') ? Number(action.replace('heading', '')) || 2 : 0;
    const patterns = { list: /^[-*+]\s+/, ordered: /^\d+[.)]\s+/, quote: /^>\s?/, note: /^>\s?\*\*Примечание:\*\*\s?/ };
    const pattern = headingLevel ? /^#{1,6}\s+/ : patterns[action];
    const allPrefixed = pattern && lines.every((line) => !line.trim() || pattern.test(line));
    const text = lines.map((line, index) => {
      if (!line.trim()) return line;
      if (allPrefixed) return line.replace(pattern, '');
      const clean = pattern ? line.replace(pattern, '') : line;
      if (headingLevel) return `${'#'.repeat(headingLevel)} ${clean}`;
      if (action === 'ordered') return `${index + 1}. ${clean}`;
      const prefixes = { list: '- ', quote: '> ', note: '> **Примечание:** ' };
      return `${prefixes[action] || ''}${clean}`;
    }).join('\n');
    const firstPrefixLength = text.match(/^(?:#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|>\s?(?:\*\*Примечание:\*\*\s?)?)/)?.[0].length || 0;
    replace(lineStart, to, text, lineStart + firstPrefixLength, lineStart + text.length);
  }
  textarea.focus();
  textarea.dispatchEvent(new Event('input', { bubbles: true }));
}

function markdownShortcutAction(event) {
  const command = event.ctrlKey || event.metaKey;
  if (!command) return '';
  if (event.altKey && !event.shiftKey && /^Digit[1-3]$/.test(event.code)) return `heading${event.code.slice(-1)}`;
  if (event.shiftKey && !event.altKey && event.code === 'Digit7') return 'ordered';
  if (event.shiftKey && !event.altKey && event.code === 'Digit8') return 'list';
  if (event.shiftKey && !event.altKey && event.code === 'Period') return 'quote';
  if (event.altKey || event.shiftKey) return '';
  return ({ KeyB: 'bold', KeyI: 'italic', KeyK: 'link', Backquote: 'code' })[event.code] || '';
}

function bindMarkdownEditors(root = document) {
  $$('.markdown-editor', root).forEach((editor) => {
    const textarea = $('textarea', editor);
    $$('[data-md]', editor).forEach((button) => button.addEventListener('click', () => applyMarkdownAction(textarea, button.dataset.md)));
    textarea?.addEventListener('keydown', (event) => {
      const action = markdownShortcutAction(event);
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        applyMarkdownAction(textarea, action);
      } else if ((event.ctrlKey || event.metaKey) && event.code === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        textarea.closest('form')?.requestSubmit();
      }
    });
  });
}

function closeCustomSelects(except = null) {
  $$('.custom-select.open').forEach((control) => {
    if (control !== except) {
      control.classList.remove('open');
      control.classList.remove('drop-up');
      control.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
}

function positionCustomSelectMenu(control) {
  control.classList.remove('drop-up');
  if (window.matchMedia('(max-width: 820px)').matches) return;
  const trigger = $('.custom-select-trigger', control);
  const menu = $('.custom-select-menu', control);
  const dialog = control.closest('dialog');
  if (!trigger || !menu) return;
  const triggerRect = trigger.getBoundingClientRect();
  const dialogRect = dialog?.getBoundingClientRect();
  const topBoundary = Math.max(12, dialogRect?.top || 0);
  const bottomBoundary = Math.min(window.innerHeight - 12, dialogRect?.bottom || window.innerHeight);
  const menuHeight = Math.min(menu.scrollHeight || 260, 260) + 8;
  const availableAbove = triggerRect.top - topBoundary;
  const availableBelow = bottomBoundary - triggerRect.bottom;
  control.classList.toggle('drop-up', availableBelow < menuHeight && availableAbove > availableBelow);
}

function syncCustomSelect(select) {
  const control = select.closest('.custom-select');
  if (!control) return;
  const selected = select.options[select.selectedIndex];
  const trigger = $('.custom-select-trigger', control);
  trigger.querySelector('span').textContent = selected?.textContent || 'Выберите';
  trigger.disabled = select.disabled;
  $$('.custom-select-option', control).forEach((option) => {
    const active = option.dataset.value === select.value;
    option.classList.toggle('selected', active);
    option.setAttribute('aria-selected', String(active));
  });
}

function enhanceSelect(select) {
  if (select.dataset.enhanced === 'true' || select.multiple || select.closest('.custom-select')) return;
  select.dataset.enhanced = 'true';
  const control = document.createElement('div');
  control.className = 'custom-select';
  select.parentNode.insertBefore(control, select);
  control.appendChild(select);
  select.classList.add('custom-select-native');
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `<span></span>${icon('chevronRight')}`;
  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('role', 'listbox');
  [...select.options].forEach((sourceOption) => {
    const option = document.createElement('button');
    option.type = 'button';
    option.className = 'custom-select-option';
    option.dataset.value = sourceOption.value;
    option.setAttribute('role', 'option');
    option.disabled = sourceOption.disabled;
    option.innerHTML = `<span>${escapeHTML(sourceOption.textContent)}</span>${icon('check')}`;
    option.addEventListener('click', () => {
      select.value = sourceOption.value;
      select.dispatchEvent(new Event('change', { bubbles: true }));
      syncCustomSelect(select);
      closeCustomSelects();
      trigger.focus();
    });
    menu.appendChild(option);
  });
  control.append(trigger, menu);
  control.addEventListener('click', (event) => {
    if (event.target === control && control.classList.contains('open')) closeCustomSelects();
  });
  trigger.addEventListener('click', () => {
    const willOpen = !control.classList.contains('open');
    closeCustomSelects(control);
    control.classList.toggle('open', willOpen);
    trigger.setAttribute('aria-expanded', String(willOpen));
    if (willOpen) {
      positionCustomSelectMenu(control);
      $('.custom-select-option.selected', control)?.focus({ preventScroll: true });
    } else {
      control.classList.remove('drop-up');
    }
  });
  trigger.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      control.classList.add('open');
      trigger.setAttribute('aria-expanded', 'true');
      positionCustomSelectMenu(control);
      const options = $$('.custom-select-option:not(:disabled)', control);
      const selectedIndex = Math.max(0, options.findIndex((option) => option.classList.contains('selected')));
      options[event.key === 'ArrowDown' ? selectedIndex : Math.max(0, selectedIndex - 1)]?.focus();
    }
  });
  menu.addEventListener('keydown', (event) => {
    const options = $$('.custom-select-option:not(:disabled)', control);
    const index = options.indexOf(document.activeElement);
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const next = event.key === 'ArrowDown' ? Math.min(options.length - 1, index + 1) : Math.max(0, index - 1);
      options[next]?.focus();
    } else if (event.key === 'Escape') {
      closeCustomSelects();
      trigger.focus();
    }
  });
  select.addEventListener('change', () => syncCustomSelect(select));
  syncCustomSelect(select);
}

function enhanceSelects(root = document) {
  $$('select:not([data-native-select])', root).forEach(enhanceSelect);
}

const dragScrollSelector = [
  '.status-tabs', '.view-switch', '.idea-actions', '.record-tabs', '.workstream-tabs',
  '.activity-chart > div', '.work-status-tabs', '.work-type-tabs', '.record-workspace-bar',
  '.graph-toolbar', '.graph-legend', '.template-editor > aside', '.record-context-strip',
  '.research-option-deck', '.markdown-toolbar',
].join(',');

function bindDragScroll(root = document) {
  const elements = [];
  if (root instanceof Element && root.matches(dragScrollSelector)) elements.push(root);
  elements.push(...$$(dragScrollSelector, root));
  elements.forEach((element) => {
    if (element.dataset.dragScrollBound === 'true') return;
    element.dataset.dragScrollBound = 'true';
    element.dataset.dragScroll = 'true';
    let pointerID = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let dragging = false;
    let suppressClick = false;

    const finish = (event) => {
      if (pointerID === null || (event?.pointerId !== undefined && event.pointerId !== pointerID)) return;
      suppressClick = dragging;
      element.classList.remove('drag-scroll-armed', 'is-drag-scrolling');
      if (element.hasPointerCapture?.(pointerID)) element.releasePointerCapture(pointerID);
      pointerID = null;
      dragging = false;
    };

    element.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'touch' || event.button !== 0 || event.target.closest('input, textarea, select, [contenteditable="true"]')) return;
      if (element.scrollWidth <= element.clientWidth + 2) return;
      pointerID = event.pointerId;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = element.scrollLeft;
      dragging = false;
      suppressClick = false;
      element.classList.add('drag-scroll-armed');
    });
    element.addEventListener('pointermove', (event) => {
      if (event.pointerId !== pointerID) return;
      const deltaX = event.clientX - startX;
      const deltaY = event.clientY - startY;
      if (!dragging && Math.abs(deltaX) > 6 && Math.abs(deltaX) >= Math.abs(deltaY)) {
        dragging = true;
        element.classList.add('is-drag-scrolling');
        element.setPointerCapture?.(pointerID);
      } else if (!dragging && Math.abs(deltaY) > 8 && Math.abs(deltaY) > Math.abs(deltaX)) {
        finish(event);
        return;
      }
      if (!dragging) return;
      event.preventDefault();
      element.scrollLeft = startScrollLeft - deltaX;
    }, { passive: false });
    element.addEventListener('pointerup', finish);
    element.addEventListener('pointercancel', finish);
    element.addEventListener('click', (event) => {
      if (!suppressClick) return;
      suppressClick = false;
      event.preventDefault();
      event.stopPropagation();
    }, true);
    element.addEventListener('dragstart', (event) => {
      if (pointerID !== null) event.preventDefault();
    });
  });
}

function escapeHTML(value = '') {
  return String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
}

function formatDate(value, withTime = false) {
  if (!value) return 'Без срока';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ru-RU', withTime ? { dateStyle: 'medium', timeStyle: 'short' } : { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
}

function toLocalInput(value) {
  if (!value) return '';
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function normalizedInstant(value) {
  if (!value) return '';
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? String(value) : String(time);
}

function recordDraftKey(recordId) {
  return `business-control:draft:${state.me?.id || 'anonymous'}:${recordId}`;
}

function loadRecordDraft(recordId) {
  try { return JSON.parse(localStorage.getItem(recordDraftKey(recordId)) || 'null'); } catch (_) { return null; }
}

function saveRecordDraft(recordId, values) {
  try { localStorage.setItem(recordDraftKey(recordId), JSON.stringify({ values, savedAt: new Date().toISOString() })); } catch (_) {}
}

function clearRecordDraft(recordId) {
  try { localStorage.removeItem(recordDraftKey(recordId)); } catch (_) {}
}

function recordFormValues(form) {
  const data = new FormData(form);
  return Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)]));
}

function applyRecordDraft(form, draft) {
  Object.entries(draft?.values || {}).forEach(([name, value]) => {
    const field = form.elements.namedItem(name);
    if (field && name !== 'reason') field.value = value;
  });
  updateRecordFormState(form, state.activeDetail.record, true);
}

function minutesLabel(minutes) {
  if (!minutes) return 'Не оценено';
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

function recordsCountLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return `${count} запись`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} записи`;
  return `${count} записей`;
}

function discussionsCountLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return `${count} обсуждения`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} обсуждений`;
  return `${count} обсуждений`;
}

function questionsCountLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return `${count} вопрос`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} вопроса`;
  return `${count} вопросов`;
}

function interactionsCountLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return `${count} взаимодействие`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} взаимодействия`;
  return `${count} взаимодействий`;
}

function deadlineState(record) {
  if (record.status === 'completed') return { className: 'done', label: 'Выполнено' };
  if (!record.dueAt) return { className: 'none', label: 'Без срока' };
  const delta = new Date(record.dueAt).getTime() - Date.now();
  if (delta < 0) return { className: 'overdue', label: `Просрочено · ${formatDate(record.dueAt)}` };
  if (delta <= 86400000) return { className: 'urgent', label: `Менее суток · ${formatDate(record.dueAt)}` };
  if (delta <= 259200000) return { className: 'soon', label: `Скоро · ${formatDate(record.dueAt)}` };
  return { className: 'normal', label: formatDate(record.dueAt) };
}

function isWorkRecord(record) {
  return ['task', 'question_set', 'research', 'decision', 'disagreement', 'meeting'].includes(record.type);
}

function isActiveRecord(record) {
  return !['completed', 'cancelled', 'archived', 'rejected'].includes(record.status);
}

function sortWorkRecords(a, b) {
  const priority = (priorityWeight[a.priority || 'normal'] ?? 2) - (priorityWeight[b.priority || 'normal'] ?? 2);
  if (priority) return priority;
  const deadline = sortByDeadline(a, b);
  if (deadline) return deadline;
  return new Date(b.updatedAt) - new Date(a.updatedAt);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    if (response.status === 401 && !path.startsWith('/api/auth/')) showAuth();
    const error = new Error(data.error || 'Ошибка запроса');
    error.status = response.status;
    throw error;
  }
  return data;
}

function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = 'toast'; }, 3200);
}

function showAuth() {
  $('#app-root').hidden = true;
  $('#auth-root').hidden = false;
}

function showApp() {
  $('#auth-root').hidden = true;
  $('#app-root').hidden = false;
  $('#user-name').textContent = state.me.username;
  $('#user-avatar').textContent = state.me.username.slice(0, 2).toUpperCase();
}

async function bootstrap() {
  bindGlobalEvents();
  enhanceSelects(document);
  bindDragScroll(document);
  const interfaceObserver = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => mutation.addedNodes.forEach((node) => {
      if (!(node instanceof Element)) return;
      if (node.matches('select')) enhanceSelect(node);
      enhanceSelects(node);
      bindDragScroll(node);
    }));
  });
  interfaceObserver.observe(document.body, { childList: true, subtree: true });
  try {
    state.me = await api('/api/me');
    showApp();
    await loadData();
    maybeShowOnboarding();
  } catch (error) {
    showAuth();
  }
}

async function loadData(silent = false) {
  if (!silent) $('#sync-state').textContent = 'Обновление…';
  const [users, records, notifications, activity, definitions, pendingQuestions] = await Promise.all([
    api('/api/users'), api('/api/records?includeArchived=true'), api('/api/notifications'),
    api('/api/activity?limit=200'), api('/api/section-definitions'), api('/api/questions/pending'),
  ]);
  const projectActivity = activity.filter((item) => typeMeta[item.entityType] || item.entityType === 'section_definition');
  const recordsByID = new Map(records.map((record) => [record.id, record]));
  state.detailCache.forEach((detail, id) => {
    const current = recordsByID.get(id);
    if (!current || current.updatedAt !== detail.record.updatedAt) state.detailCache.delete(id);
  });
  Object.assign(state, { users, records, notifications, activity: projectActivity, definitions, pendingQuestions });
  state.historyLoadedAll = activity.length < 200;
  $('#sync-state').textContent = 'На связи';
  render();
}

function bindGlobalEvents() {
  $$('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
  $('#auth-form').addEventListener('submit', submitAuth);
  $('#logout-button').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); });
  $('#profile-button').addEventListener('click', () => openProfile(state.me.id));
  $('#new-record-button').addEventListener('click', (event) => { event.stopPropagation(); toggleCreateMenu(); });
  $('#notification-button').addEventListener('click', () => { state.view = 'notifications'; render(); });
  $('#onboarding-button').addEventListener('click', () => openOnboarding(0));
  const globalSearchInput = $('#global-search-input');
  globalSearchInput.addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => runGlobalSearch(globalSearchInput.value), 180);
  });
  globalSearchInput.addEventListener('focus', () => { if (globalSearchInput.value.trim()) runGlobalSearch(globalSearchInput.value); });
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyK' && !event.target.closest('.markdown-editor')) {
      event.preventDefault(); globalSearchInput.focus(); globalSearchInput.select();
    }
    if (event.key === 'Escape') {
      closeCustomSelects();
      if (!$('#global-search-results').hidden) $('#global-search-results').hidden = true;
      $('.work-filter-menu[open]')?.removeAttribute('open');
      $('.work-create-menu[open]')?.removeAttribute('open');
      $('.record-more-actions[open]')?.removeAttribute('open');
    }
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('.custom-select')) closeCustomSelects();
    if (!event.target.closest('.create-control')) $('#create-menu').hidden = true;
    if (!event.target.closest('#global-search')) $('#global-search-results').hidden = true;
    if (!event.target.closest('.work-filter-menu')) $('.work-filter-menu[open]')?.removeAttribute('open');
    if (!event.target.closest('.work-create-menu')) $('.work-create-menu[open]')?.removeAttribute('open');
    if (!event.target.closest('.record-more-actions')) $('.record-more-actions[open]')?.removeAttribute('open');
  });
  $('#menu-button').addEventListener('click', () => setSidebarOpen(!$('.sidebar').classList.contains('open')));
  $('#sidebar-close').addEventListener('click', () => setSidebarOpen(false));
  $('#sidebar-backdrop').addEventListener('click', () => setSidebarOpen(false));
  bindSidebarSwipe();
  $('#record-dialog').addEventListener('click', (event) => { if (event.target === $('#record-dialog')) $('#record-dialog').close(); });
  $('#event-dialog').addEventListener('click', (event) => { if (event.target === $('#event-dialog')) $('#event-dialog').close(); });
  $('#create-dialog').addEventListener('click', (event) => { if (event.target === $('#create-dialog')) $('#create-dialog').close(); });
  $('#reason-dialog').addEventListener('click', (event) => { if (event.target === $('#reason-dialog')) $('#reason-dialog').close('cancel'); });
  $('#onboarding-dialog').addEventListener('click', (event) => { if (event.target === $('#onboarding-dialog')) finishOnboarding(); });
  $('#profile-dialog').addEventListener('click', (event) => { if (event.target === $('#profile-dialog')) $('#profile-dialog').close(); });
  $$('dialog').forEach((dialog) => dialog.addEventListener('close', () => {
    if (dialog.dataset.historyState === 'true' && history.state?.businessControlOverlay === dialog.id) {
      dialog.dataset.historyState = 'false';
      state.suppressOverlayPop = true;
      history.back();
    }
  }));
  window.addEventListener('popstate', () => {
    if (state.suppressOverlayPop) { state.suppressOverlayPop = false; return; }
    const dialog = [...$$('dialog[open]')].pop();
    if (dialog) { dialog.dataset.historyState = 'false'; dialog.close(); return; }
    if ($('.sidebar').classList.contains('open')) setSidebarOpen(false);
  });
  window.addEventListener('resize', () => {
    clearTimeout(state.graphResizeTimer);
    state.graphResizeTimer = setTimeout(() => {
      if (!state.graphInstance || state.view !== 'graph') return;
      state.graphInstance.resize();
      state.graphInstance.fit(undefined, window.innerWidth <= 560 ? 26 : 48);
    }, 140);
  });
  ['pointerdown', 'keydown', 'touchstart'].forEach((eventName) => document.addEventListener(eventName, () => {
    state.lastInteractionAt = Date.now(); state.presenceInteractions += 1;
  }, { passive: true }));
  setInterval(sendPresence, 30000);
  setInterval(async () => {
    if (!state.me) return;
    try {
      state.notifications = await api('/api/notifications');
      renderNav();
      renderNotificationBadge();
      if (state.view === 'notifications') renderContent();
    } catch (_) {}
  }, 30000);
}

function setSidebarOpen(open) {
  $('.sidebar').classList.toggle('open', open);
  $('#sidebar-backdrop').classList.toggle('visible', open);
  document.body.classList.toggle('mobile-nav-open', open);
}

function openModal(dialog) {
  if (dialog.open) return;
  dialog.showModal();
  history.pushState({ businessControlOverlay: dialog.id }, '');
  dialog.dataset.historyState = 'true';
}

function bindSidebarSwipe() {
  const sidebar = $('.sidebar');
  let startX = 0;
  let currentX = 0;
  sidebar.addEventListener('touchstart', (event) => { startX = event.touches[0].clientX; currentX = startX; }, { passive: true });
  sidebar.addEventListener('touchmove', (event) => { currentX = event.touches[0].clientX; }, { passive: true });
  sidebar.addEventListener('touchend', () => {
    if (startX - currentX > 56) setSidebarOpen(false);
    startX = 0; currentX = 0;
  }, { passive: true });
}

async function sendPresence() {
  if (!state.me || document.hidden) return;
  const now = Date.now();
  const active = now - state.lastInteractionAt < 90000;
  const elapsed = Math.min(60, Math.max(0, Math.round((now - state.presenceLastSentAt) / 1000)));
  const interactions = state.presenceInteractions;
  state.presenceLastSentAt = now; state.presenceInteractions = 0;
  try { await api('/api/presence', { method: 'POST', body: JSON.stringify({ activeSeconds: active ? elapsed : 0, interactions }) }); } catch (_) {}
}

async function runGlobalSearch(query) {
  const resultsNode = $('#global-search-results');
  const normalized = query.trim();
  if (!normalized) { resultsNode.hidden = true; resultsNode.innerHTML = ''; return; }
  resultsNode.hidden = false;
  resultsNode.innerHTML = `<div class="search-loading"><span class="spinner"></span> Ищем во всём проекте</div>`;
  try {
    const results = await api(`/api/search?q=${encodeURIComponent(normalized)}`);
    if ($('#global-search-input').value.trim() !== normalized) return;
    resultsNode.innerHTML = results.length ? results.map(renderSearchResult).join('') : `<div class="search-empty">Ничего не найдено</div>`;
    $$('[data-search-result]', resultsNode).forEach((button) => button.addEventListener('click', async () => {
      resultsNode.hidden = true;
      $('#global-search-input').value = '';
      const tab = button.dataset.researchOptionId ? 'content' : button.dataset.questionId ? 'questions' : 'overview';
      await openRecord(button.dataset.recordId, { tab, questionId: button.dataset.questionId, workspace: $('#record-dialog').open });
    }));
  } catch (error) {
    resultsNode.innerHTML = `<div class="search-empty">${escapeHTML(error.message)}</div>`;
  }
}

function renderSearchResult(result) {
  const meta = typeMeta[result.type] || { singular: result.type === 'question' ? 'Вопрос' : result.type === 'answer' ? 'Ответ' : result.type === 'joint_decision' ? 'Совместный итог' : 'Запись', icon: result.type === 'question' || result.type === 'answer' ? 'messages' : result.type === 'joint_decision' ? 'scale' : 'fileText' };
  const context = String(result.context || '').replace(/\s+/g, ' ').trim();
  const label = result.entityKind === 'research_option' ? 'Вариант исследования' : meta.singular;
  return `<button type="button" class="global-search-result" data-search-result="${result.id}" data-record-id="${result.recordId}" data-question-id="${result.questionId || ''}" data-research-option-id="${result.researchOptionId || ''}"><span class="type-icon">${icon(meta.icon)}</span><span><small>${escapeHTML(label)}</small><strong>${escapeHTML(result.title)}</strong>${context ? `<em>${escapeHTML(context.slice(0, 150))}${context.length > 150 ? '…' : ''}</em>` : ''}</span>${icon('chevronRight')}</button>`;
}

function setAuthMode(mode) {
  state.authMode = mode;
  $$('[data-auth-mode]').forEach((button) => button.classList.toggle('active', button.dataset.authMode === mode));
  $('#auth-heading-title').textContent = mode === 'register' ? 'Создайте аккаунт' : 'Войдите в проект';
  $('#auth-heading-copy').textContent = mode === 'register' ? 'Регистрация займёт меньше минуты, подтверждение почты не требуется.' : 'Продолжите работу с того места, где остановились.';
  $('#email-field').hidden = mode !== 'register';
  $('#email-field input').required = mode === 'register';
  $('#login-label').textContent = mode === 'register' ? 'Логин' : 'Логин или почта';
  $('#auth-submit').textContent = mode === 'register' ? 'Создать аккаунт' : 'Войти';
  $('#auth-form').password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const body = state.authMode === 'register'
    ? { email: form.get('email'), username: form.get('login'), password: form.get('password') }
    : { login: form.get('login'), password: form.get('password') };
  try {
    state.me = await api(`/api/auth/${state.authMode}`, { method: 'POST', body: JSON.stringify(body) });
    showApp();
    await loadData();
    maybeShowOnboarding();
  } catch (error) {
    $('#auth-error').textContent = error.message;
  }
}

function render() {
  renderNav();
  renderNotificationBadge();
  renderContent();
}

function renderNotificationBadge() {
  const unread = state.notifications.filter((item) => !item.readAt).length;
  const badge = $('#notification-badge');
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.hidden = unread === 0;
}

function renderNav() {
  let group = '';
  $('#main-nav').innerHTML = navItems.map(([key, label, iconName, itemGroup]) => {
    const count = key === 'work'
      ? state.records.filter((record) => isWorkRecord(record) && isActiveRecord(record)).length
      : typeMeta[key] ? state.records.filter((record) => record.type === key && record.status !== 'archived').length : '';
    const groupLabel = group !== itemGroup ? `<p class="nav-group">${escapeHTML(itemGroup)}</p>` : '';
    group = itemGroup;
    return `${groupLabel}<button type="button" class="nav-item ${state.view === key ? 'active' : ''}" data-view="${key}" title="${escapeHTML(label)}">${icon(iconName)}<span>${escapeHTML(label)}</span>${count !== '' ? `<b>${count}</b>` : ''}</button>`;
  }).join('');
  $$('[data-view]', $('#main-nav')).forEach((button) => button.addEventListener('click', () => {
    state.view = button.dataset.view; state.statusFilter = ''; state.search = ''; state.ownerFilter = '';
    setSidebarOpen(false); render();
  }));
}

function renderContent() {
  const titles = Object.fromEntries(navItems);
  $('#main-content').classList.toggle('graph-main-content', state.view === 'graph');
  if (state.view !== 'graph' && state.graphInstance) {
    state.graphInstance.destroy(); state.graphInstance = null;
  }
  $('#page-title').textContent = titles[state.view] || (state.view === 'notifications' ? 'Уведомления' : 'Обзор');
  if (state.view === 'dashboard') return renderDashboard();
  if (state.view === 'work') return renderWorkList();
  if (state.view === 'graph') return renderGraph();
  if (typeMeta[state.view]) return renderRecordList(state.view);
  if (state.view === 'history') return renderHistory();
  if (state.view === 'principles') return renderPrinciples();
  if (state.view === 'structure') return renderStructure();
  if (state.view === 'notifications') return renderNotifications();
}

function renderDashboard() {
  const work = state.records.filter((record) => isWorkRecord(record) && isActiveRecord(record));
  const myWork = work.filter((record) => record.ownerId === state.me.id);
  const attention = myWork.filter((record) => ['overdue', 'urgent'].includes(deadlineState(record).className) || ['high', 'critical'].includes(record.priority));
  const teamAttention = work.filter((record) => ['overdue', 'urgent'].includes(deadlineState(record).className) || ['high', 'critical'].includes(record.priority)).sort(sortWorkRecords);
  const pendingRecordIDs = new Set(state.pendingQuestions.map((question) => question.recordId));
  const focusWork = myWork.filter((record) => record.type !== 'question_set' || !pendingRecordIDs.has(record.id)).slice().sort(sortWorkRecords).slice(0, 4);
  const focusItems = [
    ...state.pendingQuestions.map((question) => ({ kind: 'question', question })),
    ...focusWork.map((record) => ({ kind: 'work', record })),
  ].slice(0, 4);
  $('#main-content').innerHTML = `
    <section class="workbench-grid">
      <article class="focus-panel">
        <div class="section-heading inverse"><div><p class="eyebrow">${attention.length ? `${attention.length} требуют внимания` : 'В порядке приоритета'}</p><h2>Следующая работа</h2></div><button class="text-button" data-go="work">Открыть всё ${icon('chevronRight')}</button></div>
        <div class="focus-list">${focusItems.length ? focusItems.map((item, index) => item.kind === 'work' ? renderFocusRecord(item.record, index === 0) : renderFocusQuestion(item.question, index === 0)).join('') : `<div class="focus-empty">${icon('check')}<strong>Открытой работы нет</strong><span>Создайте следующий конкретный шаг.</span></div>`}</div>
      </article>
      <aside class="capture-panel">
        <div><p class="eyebrow">Создать</p><h3>Быстрая фиксация</h3></div>
        <div class="quick-actions"><button type="button" class="quick-action idea" data-quick-create="idea"><span class="quick-icon">${icon('lightbulb')}</span><span><strong>Идея</strong><small>Название, детали позже</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action task" data-quick-create="task"><span class="quick-icon">${icon('checkSquare')}</span><span><strong>Задача</strong><small>Кто, что и когда</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action discussion" data-quick-create="meeting"><span class="quick-icon">${icon('calendar')}</span><span><strong>Встреча</strong><small>Заметки и результаты</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action discussion" data-quick-create="question_set"><span class="quick-icon">${icon('messages')}</span><span><strong>Вопросы</strong><small>Два ответа и итог</small></span>${icon('chevronRight')}</button></div>
      </aside>
    </section>
    <section class="dashboard-grid">
      <div class="section-panel">
        <div class="section-heading"><div><p class="eyebrow">Команда</p><h3>Распределение работы</h3></div><span class="panel-note">${minutesLabel(work.reduce((sum, item) => sum + item.estimateMinutes, 0))} в плане</span></div>
        <div class="people-load">${state.users.map((user) => renderPersonLoad(user, work)).join('') || emptyState('Второй участник появится после регистрации.')}</div>
      </div>
      <div class="section-panel">
        <div class="section-heading"><div><p class="eyebrow">Требует внимания</p><h3>Риски команды</h3></div><button class="text-button" data-go="work">Открыть очередь</button></div>
        <div class="compact-list">${teamAttention.slice(0, 7).map(renderCompactRecord).join('') || `<div class="dashboard-clear">${icon('check')}<span><strong>Срочных рисков нет</strong><small>Высокие приоритеты и приближающиеся сроки появятся здесь автоматически.</small></span></div>`}</div>
      </div>
    </section>`;
  bindOpenRecords();
  $$('[data-quick-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.quickCreate)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => { navigateToView(button.dataset.go); }));
}

function navigateToView(view, options = {}) {
  state.view = view;
  state.statusFilter = options.status || '';
  state.search = options.search || '';
  state.ownerFilter = options.ownerId ? String(options.ownerId) : '';
  render();
}

function metric(label, value, note, tone = '', iconName = 'dashboard') {
  return `<div class="metric ${tone}"><span class="metric-icon">${icon(iconName)}</span><span>${escapeHTML(label)}</span><strong>${value}</strong><small>${escapeHTML(note)}</small></div>`;
}

function renderFocusRecord(record, primary = false) {
  const deadline = deadlineState(record);
  return `<button type="button" class="focus-record ${primary ? 'primary-focus' : ''}" data-open-record="${record.id}"><span class="focus-marker">${icon(typeMeta[record.type].icon)}</span><span class="focus-copy"><small>${primary ? 'Следующая работа' : escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(record.ownerUsername)}</small><strong>${escapeHTML(record.title)}</strong><span><em class="priority priority-${record.priority || 'normal'}">${priorityLabels[record.priority || 'normal']}</em><em class="deadline ${deadline.className}">${escapeHTML(deadline.label)}</em></span></span><span class="focus-progress"><b>${record.progress}%</b><progress class="focus-meter" max="100" value="${record.progress}"></progress></span>${icon('chevronRight', 'row-chevron')}</button>`;
}

function renderFocusQuestion(question, primary = false) {
  const deadline = question.dueAt ? formatDate(question.dueAt) : 'Без срока';
  return `<button type="button" class="focus-record focus-question ${primary ? 'primary-focus' : ''}" data-open-record="${question.recordId}"><span class="focus-marker">${icon('messages')}</span><span class="focus-copy"><small>Ждёт вашего ответа · ${escapeHTML(question.recordTitle)}</small><strong>${escapeHTML(question.body)}</strong><em class="deadline normal">${escapeHTML(deadline)}</em></span><span class="focus-progress"><b>Ответить</b><progress class="focus-meter" max="100" value="0"></progress></span>${icon('chevronRight', 'row-chevron')}</button>`;
}

function renderPersonLoad(user, tasks) {
  const owned = tasks.filter((task) => task.ownerId === user.id);
  const minutes = owned.reduce((sum, task) => sum + task.estimateMinutes, 0);
  const progress = owned.length ? Math.round(owned.reduce((sum, task) => sum + task.progress, 0) / owned.length) : 0;
  return `<button type="button" class="person-load" data-user-profile="${user.id}"><span class="avatar">${escapeHTML(user.username.slice(0, 2).toUpperCase())}</span><span class="person-main"><strong>${escapeHTML(user.username)}</strong><small>${recordsCountLabel(owned.length)} · ${minutesLabel(minutes)}</small><progress class="progress-track" max="100" value="${progress}"></progress></span><b>${progress}%</b></button>`;
}

function renderPrinciples() {
  const groups = [
    { kind: 'preference', title: 'Что нам подходит', copy: 'Положительные критерии выбора сфер и идей.', example: 'Например: спрос можно проверить без больших вложений.', icon: 'target' },
    { kind: 'limitation', title: 'Чего избегаем', copy: 'Ограничения, которые идея не должна нарушать.', example: 'Например: бизнес не требует постоянной публичности основателя.', icon: 'archive' },
    { kind: 'rule', title: 'Как принимаем решения', copy: 'Договорённости, к которым возвращаемся при разногласиях.', example: 'Например: контрольное решение принимает владелец направления.', icon: 'scale' },
  ];
  const records = state.records.filter((record) => (['preference', 'limitation', 'rule'].includes(record.kind) || (record.type === 'criterion' && !record.kind)) && record.status !== 'archived');
  $('#main-content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">Основа отбора</p><h1>Правила и критерии</h1><p>Рабочие выводы, которые влияют на выбор идей и совместные решения.</p></div></div><div class="principle-grid">${groups.map((group) => {
    const items = records.filter((record) => record.kind === group.kind || (group.kind === 'preference' && record.type === 'criterion' && !record.kind));
    return `<section class="principle-column"><header><span class="type-icon">${icon(group.icon)}</span><div><h3>${group.title}</h3><p>${group.copy}</p></div><b>${items.length}</b></header><div class="principle-list">${items.map((record) => `<button type="button" data-open-record="${record.id}"><strong>${escapeHTML(record.title)}</strong><span>${escapeHTML(record.description || 'Без пояснения')}</span>${icon('chevronRight')}</button>`).join('') || `<div class="principle-empty"><p>${escapeHTML(group.example)}</p><button type="button" data-create-principle="${group.kind}">${icon('plus')} Добавить первый пункт</button></div>`}</div>${items.length ? `<button type="button" class="text-button principle-add" data-create-principle="${group.kind}">${icon('plus')} Добавить</button>` : ''}</section>`;
  }).join('')}</div>`;
  bindOpenRecords();
  $$('[data-create-principle]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.createPrinciple === 'rule' ? 'decision' : 'criterion', { kind: button.dataset.createPrinciple })));
}

function sortByDeadline(a, b) {
  if (!a.dueAt && !b.dueAt) return 0;
  if (!a.dueAt) return 1;
  if (!b.dueAt) return -1;
  return new Date(a.dueAt) - new Date(b.dueAt);
}

function renderCompactRecord(record) {
  const deadline = deadlineState(record);
  return `<button type="button" class="compact-record" data-open-record="${record.id}"><span class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</span><span><strong>${escapeHTML(record.title)}</strong><small>${escapeHTML(record.ownerUsername)} · ${minutesLabel(record.estimateMinutes)}</small></span><em class="deadline ${deadline.className}">${escapeHTML(deadline.label)}</em>${icon('chevronRight', 'row-chevron')}</button>`;
}

const workTypeFilters = [
  ['all', 'Вся работа'], ['task', 'Задачи'], ['question_set', 'Вопросы'], ['research', 'Исследования'],
  ['decision', 'Решения'], ['disagreement', 'Разногласия'], ['meeting', 'Встречи'],
];

function workFilterCount() {
  return Number(state.workType !== 'all') + Number(state.workstreamFilter !== 'all') + Number(state.workStatus !== 'active') + Number(state.workOrder !== 'priority');
}

function hierarchyDepth(record) {
  const recordsByID = new Map(state.records.map((item) => [item.id, item]));
  let depth = 0;
  let current = record;
  const visited = new Set([record.id]);
  while (current.parentId && recordsByID.has(current.parentId) && depth < 6) {
    if (visited.has(current.parentId)) break;
    visited.add(current.parentId);
    current = recordsByID.get(current.parentId);
    depth += 1;
  }
  return depth;
}

function sortWorkHierarchy(records) {
  const visible = new Map(records.map((record) => [record.id, record]));
  const children = new Map();
  const roots = [];
  records.forEach((record) => {
    if (record.parentId && visible.has(record.parentId)) {
      if (!children.has(record.parentId)) children.set(record.parentId, []);
      children.get(record.parentId).push(record);
    } else {
      roots.push(record);
    }
  });
  const compare = (a, b) => Number(b.isRoot) - Number(a.isRoot) || sortWorkRecords(a, b);
  roots.sort(compare);
  children.forEach((items) => items.sort(compare));
  const ordered = [];
  const visit = (record) => {
    ordered.push(record);
    (children.get(record.id) || []).forEach(visit);
  };
  roots.forEach(visit);
  return ordered;
}

function renderWorkList() {
  let records = state.records.filter((record) => isWorkRecord(record));
  if (state.ownerFilter) records = records.filter((record) => String(record.ownerId) === state.ownerFilter);
  else if (state.workScope === 'mine') records = records.filter((record) => record.ownerId === state.me.id);
  else if (state.workScope === 'partner') records = records.filter((record) => record.ownerId !== state.me.id);
  if (state.workType !== 'all') records = records.filter((record) => record.type === state.workType);
  if (state.workstreamFilter !== 'all') records = records.filter((record) => record.workstream === state.workstreamFilter);
  if (state.workStatus === 'active') records = records.filter(isActiveRecord);
  if (state.workStatus === 'overdue') records = records.filter((record) => isActiveRecord(record) && deadlineState(record).className === 'overdue');
  if (state.workStatus === 'completed') records = records.filter((record) => record.status === 'completed');
  if (state.workStatus === 'archived') records = records.filter((record) => record.status === 'archived');
  if (state.search) {
    const query = state.search.toLowerCase();
    records = records.filter((record) => `${record.title} ${record.description} ${record.ownerUsername}`.toLowerCase().includes(query));
  }
  records = state.workOrder === 'hierarchy' ? sortWorkHierarchy(records) : records.sort(sortWorkRecords);
  const activeFilters = workFilterCount();
  $('#main-content').innerHTML = `
    <div class="work-title-row"><div><p class="eyebrow">Единая очередь</p><h1>Работа команды</h1><p><strong>${records.length}</strong> ${recordsCountLabel(records.length).replace(/^\d+\s*/, '')} в текущем представлении</p></div><details class="work-create-menu"><summary class="primary">${icon('plus')} Создать работу</summary><div>${[['task', 'Задача'], ['question_set', 'Вопросы'], ['meeting', 'Встреча'], ['research', 'Сравнение вариантов'], ['decision', 'Решение']].map(([type, label]) => `<button type="button" data-work-create="${type}" ${type === 'research' ? 'data-work-mode="comparison"' : ''}>${icon(typeMeta[type].icon)}<span>${label}</span></button>`).join('')}</div></details></div>
    <section class="work-controls" aria-label="Фильтры рабочей очереди">
      <div class="work-scope segmented compact">${[['all', 'Вся'], ['mine', 'Моя'], ['partner', 'Партнёра']].map(([value, label]) => `<button type="button" class="segment ${!state.ownerFilter && state.workScope === value ? 'active' : ''}" data-work-scope="${value}">${label}</button>`).join('')}</div>
      <div class="search-box work-search">${icon('search')}<input id="work-search" type="search" placeholder="Найти в этой очереди" value="${escapeHTML(state.search)}"></div>
      <details class="work-filter-menu"><summary class="secondary">${icon('sliders')} Фильтры${activeFilters ? `<b>${activeFilters}</b>` : ''}</summary><button type="button" class="work-filter-backdrop" data-close-work-filters aria-label="Закрыть фильтры"></button><div class="work-filter-popover">
        <header><strong>Представление очереди</strong><button type="button" class="icon-button" data-close-work-filters aria-label="Закрыть фильтры">${icon('x')}</button></header>
        <label>Состояние<select id="work-status-select">${[['active', 'Активная работа'], ['overdue', 'Только просроченная'], ['completed', 'Выполненная'], ['archived', 'Архив'], ['all', 'Все состояния']].map(([value, label]) => `<option value="${value}" ${state.workStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Тип работы<select id="work-type-select">${workTypeFilters.map(([value, label]) => `<option value="${value}" ${state.workType === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
        <label>Направление<select id="workstream-select">${[['all', 'Все направления'], ...Object.entries(workstreamLabels)].map(([value, label]) => `<option value="${value}" ${state.workstreamFilter === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
        <fieldset><legend>Порядок</legend><div class="segmented compact"><button type="button" class="segment ${state.workOrder === 'priority' ? 'active' : ''}" data-work-order="priority">По приоритету</button><button type="button" class="segment ${state.workOrder === 'hierarchy' ? 'active' : ''}" data-work-order="hierarchy">По иерархии</button></div></fieldset>
        <button type="button" class="text-button work-filter-reset" data-reset-work-filters>Сбросить дополнительные фильтры</button>
      </div></details>
    </section>
    <div class="work-view-summary"><span>${icon(state.workOrder === 'hierarchy' ? 'network' : 'flag')} ${state.workOrder === 'hierarchy' ? 'Ветки и дочерние работы' : 'Сначала срочное и важное'}</span><span>${escapeHTML(workTypeFilters.find(([value]) => value === state.workType)?.[1] || 'Вся работа')} · ${escapeHTML(state.workstreamFilter === 'all' ? 'все направления' : workstreamLabels[state.workstreamFilter])}</span></div>
    <section class="table-panel work-table-panel">
      <div class="record-table work-header"><span>Работа</span><span>Ответственный</span><span>Состояние</span><span>Срок / прогресс</span></div>
      <div class="record-rows">${records.map(renderWorkRow).join('') || `<div class="guided-empty work-empty">${icon('checkSquare')}<h3>В этом фильтре работы нет</h3><p>Измените фильтр или создайте следующий конкретный шаг.</p></div>`}</div>
    </section>`;
  $('#work-search').addEventListener('input', (event) => {
    state.search = event.target.value;
    clearTimeout(state.workSearchTimer);
    state.workSearchTimer = setTimeout(() => {
      renderWorkList();
      const input = $('#work-search');
      input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }, 160);
  });
  $$('[data-work-scope]').forEach((button) => button.addEventListener('click', () => { state.ownerFilter = ''; state.workScope = button.dataset.workScope; renderWorkList(); }));
  $('#work-status-select').addEventListener('change', (event) => { state.workStatus = event.target.value; renderWorkList(); });
  $('#work-type-select').addEventListener('change', (event) => { state.workType = event.target.value; renderWorkList(); });
  $('#workstream-select').addEventListener('change', (event) => { state.workstreamFilter = event.target.value; renderWorkList(); });
  $$('[data-work-order]').forEach((button) => button.addEventListener('click', () => { state.workOrder = button.dataset.workOrder; renderWorkList(); }));
  $$('[data-close-work-filters]').forEach((button) => button.addEventListener('click', () => $('.work-filter-menu').removeAttribute('open')));
  $('[data-reset-work-filters]')?.addEventListener('click', () => { state.workType = 'all'; state.workstreamFilter = 'all'; state.workStatus = 'active'; state.workOrder = 'priority'; renderWorkList(); });
  $$('[data-work-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.workCreate, { comparisonMode: button.dataset.workMode === 'comparison' })));
  bindOpenRecords();
}

function renderWorkRow(record) {
  const deadline = deadlineState(record);
  const priority = record.priority || 'normal';
  const parent = record.parentId ? state.records.find((item) => item.id === record.parentId) : null;
  const depth = state.workOrder === 'hierarchy' ? hierarchyDepth(record) : 0;
  const hierarchy = record.isRoot ? 'Корень проекта' : parent ? `В ветке: ${parent.title}` : 'Без родителя';
  return `<button type="button" class="record-table row work-row type-row-${record.type} ${state.workOrder === 'hierarchy' ? 'hierarchy-row' : ''}" data-depth="${Math.min(depth, 6)}" data-open-record="${record.id}">
    <span class="record-title"><i class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</i><span><small>${escapeHTML(typeMeta[record.type].singular)}<b class="workstream-mark workstream-${record.workstream || 'business'}">${escapeHTML(workstreamLabels[record.workstream || 'business'])}</b></small><strong>${escapeHTML(record.title)}</strong><em>${escapeHTML(record.description || 'Без дополнительного контекста')}</em>${state.workOrder === 'hierarchy' || record.isRoot ? `<i class="hierarchy-caption">${icon(record.isRoot ? 'target' : 'network')} ${escapeHTML(hierarchy)}</i>` : ''}</span></span>
    <span><b class="owner-chip">${escapeHTML(record.ownerUsername)}</b><small>${record.editPolicy === 'owner_only' ? 'Только владелец' : 'Общая'} · ${minutesLabel(record.estimateMinutes)}</small></span>
    <span><em class="priority priority-${priority}">${icon('flag')} ${priorityLabels[priority]}</em><small>${escapeHTML(statusLabels[record.status] || record.status)}</small></span>
    <span><em class="deadline ${deadline.className}">${escapeHTML(deadline.label)}</em><progress class="progress-track" max="100" value="${record.progress}"></progress><small>${record.progress}%</small></span>
  </button>`;
}

function graphSettingsKey() {
  return `business-control:graph-settings:${state.me?.id || 'anonymous'}:v1`;
}

function loadGraphSettings() {
  if (state.graphSettingsLoaded) return;
  state.graphSettingsLoaded = true;
  try {
    const saved = JSON.parse(localStorage.getItem(graphSettingsKey()) || '{}');
    state.graphShowDiscussion = saved.showDiscussion ?? graphSettingDefaults.showDiscussion;
    state.graphShowOrphans = saved.showOrphans ?? graphSettingDefaults.showOrphans;
    state.graphShowArrows = saved.showArrows ?? graphSettingDefaults.showArrows;
    state.graphPhysics = saved.physics ?? graphSettingDefaults.physics;
    state.graphTextFade = Number(saved.textFade ?? graphSettingDefaults.textFade);
    state.graphNodeSize = Number(saved.nodeSize ?? graphSettingDefaults.nodeSize);
    state.graphLinkThickness = Number(saved.linkThickness ?? graphSettingDefaults.linkThickness);
    state.graphCenterForce = Number(saved.centerForce ?? graphSettingDefaults.centerForce);
    state.graphRepelForce = Number(saved.repelForce ?? graphSettingDefaults.repelForce);
    state.graphLinkForce = Number(saved.linkForce ?? graphSettingDefaults.linkForce);
    state.graphLinkDistance = Number(saved.linkDistance ?? graphSettingDefaults.linkDistance);
    state.graphHiddenGroups = new Set(Array.isArray(saved.hiddenGroups) ? saved.hiddenGroups : []);
    state.graphGroupColors = { ...state.graphGroupColors, ...(saved.groupColors || {}) };
  } catch (_) {}
}

function saveGraphSettings() {
  try {
    localStorage.setItem(graphSettingsKey(), JSON.stringify({
      showDiscussion: state.graphShowDiscussion, showOrphans: state.graphShowOrphans,
      showArrows: state.graphShowArrows, physics: state.graphPhysics,
      textFade: state.graphTextFade, nodeSize: state.graphNodeSize, linkThickness: state.graphLinkThickness,
      centerForce: state.graphCenterForce, repelForce: state.graphRepelForce,
      linkForce: state.graphLinkForce, linkDistance: state.graphLinkDistance,
      hiddenGroups: [...state.graphHiddenGroups], groupColors: state.graphGroupColors,
    }));
  } catch (_) {}
}

function resetGraphSettings() {
  Object.assign(state, {
    graphShowDiscussion: graphSettingDefaults.showDiscussion, graphShowOrphans: graphSettingDefaults.showOrphans,
    graphShowArrows: graphSettingDefaults.showArrows, graphPhysics: graphSettingDefaults.physics,
    graphTextFade: graphSettingDefaults.textFade, graphNodeSize: graphSettingDefaults.nodeSize,
    graphLinkThickness: graphSettingDefaults.linkThickness, graphCenterForce: graphSettingDefaults.centerForce,
    graphRepelForce: graphSettingDefaults.repelForce, graphLinkForce: graphSettingDefaults.linkForce,
    graphLinkDistance: graphSettingDefaults.linkDistance,
  });
  state.graphHiddenGroups = new Set();
  state.graphGroupColors = Object.fromEntries(graphGroups.map((group) => [group.key, group.color]));
  saveGraphSettings();
}

function graphGroupKey(node) {
  return node.entityKind === 'record' ? node.type : node.entityKind;
}

function graphRange(name, label, value, min = 0, max = 100) {
  return `<label class="graph-setting-range"><span>${escapeHTML(label)}</span><input type="range" min="${min}" max="${max}" value="${value}" data-graph-range="${name}"><b>${value}</b></label>`;
}

function renderGraphSettings() {
  return `<aside id="graph-settings" class="graph-settings ${state.graphSettingsOpen ? 'open' : ''}" aria-label="Настройки карты">
    <header><div><p class="eyebrow">Graph View</p><h2>Настройки карты</h2></div><div><button type="button" class="text-button" data-reset-graph-settings>Сбросить</button><button type="button" class="icon-button" data-close-graph-settings aria-label="Закрыть">${icon('x')}</button></div></header>
    <div class="graph-settings-body">
      <section><h3>Фильтры</h3><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="showDiscussion" ${state.graphShowDiscussion ? 'checked' : ''}><span>Вопросы и ответы</span></label><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="showOrphans" ${state.graphShowOrphans ? 'checked' : ''}><span>Объекты без связей</span></label></section>
      <section><h3>Группы</h3><div class="graph-group-list">${graphGroups.map((group) => `<label class="graph-group-row"><input type="checkbox" data-graph-group="${group.key}" ${state.graphHiddenGroups.has(group.key) ? '' : 'checked'}><input type="color" data-graph-group-color="${group.key}" value="${escapeHTML(state.graphGroupColors[group.key] || group.color)}" aria-label="Цвет группы ${escapeHTML(group.label)}"><span>${escapeHTML(group.label)}</span></label>`).join('')}</div></section>
      <section><h3>Отображение</h3><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="showArrows" ${state.graphShowArrows ? 'checked' : ''}><span>Стрелки связей</span></label>${graphRange('textFade', 'Исчезновение подписей', state.graphTextFade)}${graphRange('nodeSize', 'Размер узлов', state.graphNodeSize, 70, 150)}${graphRange('linkThickness', 'Толщина связей', state.graphLinkThickness, 60, 180)}<button type="button" class="secondary graph-timeline-button" data-graph-timeline>${icon(state.graphTimelinePlaying ? 'pause' : 'play')} ${state.graphTimelinePlaying ? 'Остановить анимацию' : 'Показать развитие'}</button></section>
      <section><h3>Физика</h3><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="physics" ${state.graphPhysics ? 'checked' : ''}><span>Упругое перестроение</span></label>${graphRange('centerForce', 'Сила центра', state.graphCenterForce)}${graphRange('repelForce', 'Отталкивание', state.graphRepelForce)}${graphRange('linkForce', 'Сила связей', state.graphLinkForce)}${graphRange('linkDistance', 'Длина связей', state.graphLinkDistance)}</section>
    </div>
  </aside>`;
}

async function renderGraph() {
  loadGraphSettings();
  $('#main-content').classList.add('graph-main-content');
  $('#main-content').innerHTML = `
    <section class="graph-workspace">
      <header class="graph-toolbar">
        <div class="graph-mode segmented compact"><button type="button" class="segment ${!state.graphFocusRecordId ? 'active' : ''}" data-graph-mode="global">Весь проект</button><button type="button" class="segment ${state.graphFocusRecordId ? 'active' : ''}" data-graph-mode="local" ${state.graphFocusRecordId ? '' : 'disabled'}>Локальная карта</button></div>
        <div class="search-box graph-search">${icon('search')}<input id="graph-search" type="search" value="${escapeHTML(state.graphSearch)}" placeholder="Фильтр объектов"></div>
        ${state.graphFocusRecordId ? `<label class="graph-depth">Глубина <input id="graph-depth" type="range" min="1" max="4" value="${state.graphDepth}"><b>${state.graphDepth}</b></label>` : ''}
        <span class="graph-count" id="graph-count"></span>
        <div class="graph-icon-actions"><button type="button" class="icon-button" id="graph-zoom-out" title="Уменьшить" aria-label="Уменьшить">${icon('minus')}</button><button type="button" class="icon-button" id="graph-zoom-in" title="Увеличить" aria-label="Увеличить">${icon('plus')}</button><button type="button" class="icon-button" id="graph-relayout" title="Перестроить карту" aria-label="Перестроить карту">${icon('rotate')}</button><button type="button" class="icon-button" id="graph-fit" title="Показать карту целиком" aria-label="Показать карту целиком">${icon('maximize')}</button><button type="button" class="icon-button ${state.graphSettingsOpen ? 'active' : ''}" id="graph-settings-toggle" title="Настройки карты" aria-label="Настройки карты">${icon('settings')}</button></div>
      </header>
      <div class="graph-stage"><div id="relationship-graph" tabindex="0" role="application" aria-label="Интерактивная карта связей"><div class="graph-loading"><span class="spinner"></span><strong>Строим карту проекта</strong></div></div><aside id="graph-inspector" class="graph-inspector ${state.graphSelectedId && !state.graphSettingsOpen ? 'open' : ''}">${renderGraphInspector()}</aside>${renderGraphSettings()}<div id="graph-context-menu" class="graph-context-menu"></div></div>
      <footer class="graph-legend"><span><i class="legend-card"></i> Карточка</span><span><i class="legend-question"></i> Вопрос</span><span><i class="legend-answer"></i> Ответ</span><span><i class="legend-decision"></i> Итог</span><em>Колесо / + −: масштаб · перетаскивание: движение · правый клик: действия</em></footer>
    </section>`;
  bindGraphControls();
  try {
    if (!state.graphData) state.graphData = await api('/api/graph');
    if (state.view !== 'graph') return;
    mountGraph();
  } catch (error) {
    $('#relationship-graph').innerHTML = `<div class="graph-error">${icon('help')}<strong>Карта не загрузилась</strong><p>${escapeHTML(error.message)}</p><button type="button" class="secondary" id="graph-retry">Повторить</button></div>`;
    $('#graph-retry')?.addEventListener('click', () => { state.graphData = null; renderGraph(); });
  }
}

function graphVisibleElements() {
  const data = state.graphData || { nodes: [], edges: [] };
  const nodeByID = new Map(data.nodes.map((node) => [node.id, node]));
  let allowed = new Set(data.nodes.map((node) => node.id));
  if (!state.graphShowDiscussion) allowed = new Set([...allowed].filter((id) => !['question', 'answer', 'joint_decision'].includes(nodeByID.get(id)?.entityKind)));
  allowed = new Set([...allowed].filter((id) => !state.graphHiddenGroups.has(graphGroupKey(nodeByID.get(id)))));
  if (!state.graphShowOrphans) {
    const connected = new Set();
    data.edges.forEach((edge) => { connected.add(edge.source); connected.add(edge.target); });
    allowed = new Set([...allowed].filter((id) => connected.has(id)));
  }
  if (state.graphFocusRecordId) {
    const root = `record:${state.graphFocusRecordId}`;
    const outgoing = new Map(data.nodes.map((node) => [node.id, new Set()]));
    const incoming = new Map(data.nodes.map((node) => [node.id, new Set()]));
    data.edges.forEach((edge) => {
      outgoing.get(edge.source)?.add(edge.target);
      incoming.get(edge.target)?.add(edge.source);
    });
    const local = new Set([root]);
    let descendants = [root];
    let ancestors = [root];
    for (let depth = 0; depth < state.graphDepth; depth += 1) {
      const nextDescendants = [];
      const nextAncestors = [];
      descendants.forEach((id) => (outgoing.get(id) || []).forEach((neighbor) => {
        if (!local.has(neighbor)) { local.add(neighbor); nextDescendants.push(neighbor); }
      }));
      ancestors.forEach((id) => (incoming.get(id) || []).forEach((neighbor) => {
        if (!local.has(neighbor)) { local.add(neighbor); nextAncestors.push(neighbor); }
      }));
      descendants = nextDescendants;
      ancestors = nextAncestors;
    }
    allowed = new Set([...allowed].filter((id) => local.has(id)));
  }
  const query = state.graphSearch.trim().toLowerCase();
  if (query) {
    allowed = new Set([...allowed].filter((id) => {
      const node = nodeByID.get(id);
      return `${node?.title || ''} ${node?.description || ''} ${node?.ownerUsername || ''} ${node?.type || ''}`.toLowerCase().includes(query);
    }));
  }
  const nodes = data.nodes.filter((node) => allowed.has(node.id));
  const edges = data.edges.filter((edge) => allowed.has(edge.source) && allowed.has(edge.target));
  return { nodes, edges };
}

function graphNodeLabel(node) {
  const title = String(node.title || '').replace(/\s+/g, ' ').trim();
  return title.length > 58 ? `${title.slice(0, 55)}…` : title;
}

function graphPositionKey() {
  return `business-control:graph-positions:${state.me?.id || 'anonymous'}:v3`;
}

function loadGraphPositions() {
  try { return JSON.parse(localStorage.getItem(graphPositionKey()) || '{}'); } catch (_) { return {}; }
}

function saveGraphPositions(cy = state.graphInstance) {
  if (!cy) return;
  const positions = loadGraphPositions();
  cy.nodes().forEach((node) => { positions[node.id()] = node.position(); });
  try { localStorage.setItem(graphPositionKey(), JSON.stringify(positions)); } catch (_) {}
}

function clearGraphPositions() {
  try { localStorage.removeItem(graphPositionKey()); } catch (_) {}
}

function graphHierarchyDescendants(cy, rootID) {
  const result = new Set();
  let frontier = [rootID];
  while (frontier.length) {
    const parentID = frontier.shift();
    cy.edges(`[relationType = "parent_of"][source = "${parentID}"]`).forEach((edge) => {
      const childID = edge.target().id();
      if (!result.has(childID)) { result.add(childID); frontier.push(childID); }
    });
  }
  return [...result];
}

function graphLayoutOptions(randomize = false, nodeCount = state.graphInstance?.nodes().length || 0) {
  const compact = nodeCount > 0 && nodeCount <= 40;
  return {
    name: 'cose', animate: state.graphPhysics, animationDuration: state.graphPhysics ? 560 : 0, animationEasing: 'ease-out-cubic', randomize,
    nodeRepulsion: (compact ? 3400 : 5200) + state.graphRepelForce * (compact ? 72 : 110),
    idealEdgeLength: 48 + state.graphLinkDistance * (compact ? 1.35 : 1.8),
    edgeElasticity: 24 + state.graphLinkForce * 1.8,
    gravity: .02 + state.graphCenterForce * .0036,
    componentSpacing: compact ? 92 : 132, nestingFactor: 1.15,
    numIter: compact ? 900 : 1300, initialTemp: 170, coolingFactor: .96, minTemp: 1,
    fit: true, padding: window.innerWidth <= 560 ? 30 : 64,
  };
}

function updateGraphZoomStyles() {
  const cy = state.graphInstance;
  if (!cy) return;
  const zoom = cy.zoom();
  const fadeThreshold = .24 + state.graphTextFade * .009;
  cy.nodes().toggleClass('zoom-compact', zoom < fadeThreshold + .16).toggleClass('zoom-hidden', zoom < fadeThreshold);
  cy.edges().toggleClass('zoom-hidden', zoom < fadeThreshold + .12);
}

function ensureReadableGraphView(cy) {
  if (!cy || cy.nodes().length > 40 || cy.zoom() >= .72) return;
  cy.zoom(.72);
  cy.center(cy.nodes());
}

function mountGraph() {
  if (!window.cytoscape) throw new Error('Модуль визуализации не загружен');
  clearTimeout(state.graphTimelineTimer);
  state.graphTimelinePlaying = false;
  if (state.graphInstance) state.graphInstance.destroy();
  const { nodes, edges } = graphVisibleElements();
  const degree = new Map(nodes.map((node) => [node.id, 0]));
  edges.forEach((edge) => { degree.set(edge.source, (degree.get(edge.source) || 0) + 1); degree.set(edge.target, (degree.get(edge.target) || 0) + 1); });
  const savedPositions = loadGraphPositions();
  const positioned = nodes.filter((node) => savedPositions[node.id]).length;
  const usePreset = nodes.length > 0 && positioned / nodes.length >= .75;
  const positionedPoints = Object.values(savedPositions).filter((position) => Number.isFinite(position?.x) && Number.isFinite(position?.y));
  const savedCenter = positionedPoints.length ? positionedPoints.reduce((total, position) => ({ x: total.x + position.x / positionedPoints.length, y: total.y + position.y / positionedPoints.length }), { x: 0, y: 0 }) : { x: 0, y: 0 };
  const fallbackPosition = (index) => {
    const angle = index * 2.399963;
    const radius = 190 + Math.sqrt(index + 1) * 72;
    return { x: savedCenter.x + Math.cos(angle) * radius, y: savedCenter.y + Math.sin(angle) * radius };
  };
  const elements = [
    ...nodes.map((node, index) => {
      const nodeDegree = degree.get(node.id) || 0;
      const size = Math.round((25 + Math.sqrt(nodeDegree + 1) * 8 + (node.isRoot ? 9 : 0)) * state.graphNodeSize / 100);
      return { data: { ...node, label: graphNodeLabel(node), size, degree: nodeDegree, color: state.graphGroupColors[graphGroupKey(node)] || '#8aa49a' }, position: savedPositions[node.id] || fallbackPosition(index), classes: `kind-${node.entityKind} type-${node.type} ${node.isRoot ? 'is-root' : ''} ${node.status === 'archived' ? 'is-archived' : ''}` };
    }),
    ...edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label, relationType: edge.relationType, arrow: state.graphShowArrows ? 'triangle' : 'none' }, classes: `relation-${edge.relationType}` })),
  ];
  const container = $('#relationship-graph');
  container.innerHTML = '';
  const cy = window.cytoscape({
    container, elements, minZoom: .1, maxZoom: 3, boxSelectionEnabled: true,
    style: [
      { selector: 'node', style: { shape: 'ellipse', width: 'data(size)', height: 'data(size)', label: 'data(label)', 'font-family': 'Onest Local, sans-serif', 'font-size': 11, 'font-weight': 600, color: '#d9e2de', 'text-wrap': 'wrap', 'text-max-width': 126, 'text-valign': 'bottom', 'text-margin-y': 10, 'text-halign': 'center', 'line-height': 1.22, 'background-color': 'data(color)', 'background-opacity': .82, 'border-width': 1.5, 'border-color': '#e5eee9', 'border-opacity': .44, 'overlay-opacity': 0, 'transition-property': 'opacity, border-width, border-color, background-opacity, width, height', 'transition-duration': '.16s' } },
      { selector: 'node.is-root', style: { 'border-width': 3, 'border-color': '#f6fbf8', 'background-opacity': 1, 'font-size': 12, 'font-weight': 700 } },
      { selector: 'node.kind-joint_decision', style: { shape: 'diamond' } },
      { selector: 'node.kind-question', style: { shape: 'round-rectangle' } },
      { selector: 'node:selected', style: { 'border-width': 4, 'border-color': '#ffffff', 'background-opacity': 1, 'underlay-color': '#7de3bf', 'underlay-opacity': .18, 'underlay-padding': 9 } },
      { selector: 'edge', style: { width: 1.1 * state.graphLinkThickness / 100, 'curve-style': 'bezier', 'line-color': '#80928a', 'line-opacity': .42, 'target-arrow-color': '#9aaba4', 'target-arrow-shape': 'data(arrow)', 'arrow-scale': .58, label: 'data(label)', 'font-family': 'Onest Local, sans-serif', 'font-size': 9, color: '#c5d0cb', 'text-opacity': 0, 'text-background-color': '#1d2723', 'text-background-opacity': .88, 'text-background-padding': 4, 'text-rotation': 'autorotate', 'overlay-opacity': 0, 'transition-property': 'opacity, line-color, width, text-opacity, line-opacity', 'transition-duration': '.16s' } },
      { selector: 'edge.relation-produced, edge.relation-leads_to', style: { width: 1.8 * state.graphLinkThickness / 100, 'line-color': '#6eb89f', 'target-arrow-color': '#6eb89f' } },
      { selector: '.is-dimmed', style: { opacity: .06, 'text-opacity': 0 } },
      { selector: 'node.is-path', style: { 'border-width': 2.5, 'border-color': '#a8f1d7', 'background-opacity': 1 } },
      { selector: 'edge.is-path', style: { width: 2.3 * state.graphLinkThickness / 100, 'line-color': '#7ed3b5', 'line-opacity': .9, 'target-arrow-color': '#7ed3b5', 'text-opacity': 1 } },
      { selector: 'edge.show-label', style: { 'text-opacity': 1 } },
      { selector: 'node.zoom-compact', style: { 'font-size': 9 } },
      { selector: 'node.zoom-hidden', style: { 'text-opacity': 0 } },
      { selector: 'edge.zoom-hidden', style: { 'text-opacity': 0 } },
      { selector: '.link-source', style: { 'border-width': 4, 'border-color': '#ef9ca5', 'underlay-color': '#ef7180', 'underlay-opacity': .16, 'underlay-padding': 9 } },
      { selector: '.timeline-hidden', style: { opacity: 0, 'text-opacity': 0 } },
    ],
    layout: usePreset ? { name: 'preset', fit: true, padding: window.innerWidth <= 560 ? 28 : 48, animate: false } : (nodes.length > 1 ? graphLayoutOptions(true, nodes.length) : { name: 'grid', fit: true, padding: 48 }),
  });
  state.graphInstance = cy;
  $('#graph-count').textContent = `${nodes.length} · ${edges.length}`;
  cy.one('layoutstop', () => { ensureReadableGraphView(cy); saveGraphPositions(cy); updateGraphZoomStyles(); });
  cy.ready(() => requestAnimationFrame(() => saveGraphPositions(cy)));
  cy.on('zoom', updateGraphZoomStyles);
  cy.on('tap', 'node', (event) => selectGraphNode(event.target.id()));
  cy.on('mouseover', 'node', (event) => highlightGraphNeighborhood(event.target));
  cy.on('mouseout', 'node', applyGraphEmphasis);
  cy.on('tap', (event) => { closeGraphContextMenu(); if (event.target === cy) selectGraphNode(''); });
  cy.on('cxttap', 'node', (event) => openGraphContextMenu(event.target.id()));
  cy.on('free', 'node', () => saveGraphPositions(cy));
  let lastTapped = { id: '', time: 0 };
  cy.on('tap', 'node', (event) => {
    const now = Date.now(); const id = event.target.id();
    if (lastTapped.id === id && now - lastTapped.time < 360) openGraphNode(event.target.data());
    lastTapped = { id, time: now };
  });
  if (state.graphSelectedId && cy.$id(state.graphSelectedId).length) selectGraphNode(state.graphSelectedId, true);
  else if (state.graphFocusRecordId && cy.$id(`record:${state.graphFocusRecordId}`).length) selectGraphNode(`record:${state.graphFocusRecordId}`, true);
  applyGraphEmphasis();
  updateGraphZoomStyles();
  container.focus({ preventScroll: true });
}

function highlightGraphNeighborhood(node) {
  const cy = state.graphInstance;
  if (!cy) return;
  cy.elements().addClass('is-dimmed').removeClass('is-path show-label');
  node.closedNeighborhood().removeClass('is-dimmed').addClass('is-path');
  node.connectedEdges().addClass('show-label');
  node.removeClass('is-path');
}

function graphBranchElements(nodeID) {
  const cy = state.graphInstance;
  const nodeIDs = new Set([nodeID]);
  const walk = (direction) => {
    let frontier = [nodeID];
    while (frontier.length) {
      const current = frontier.shift();
      const selector = direction === 'down' ? `[relationType = "parent_of"][source = "${current}"]` : `[relationType = "parent_of"][target = "${current}"]`;
      cy.edges(selector).forEach((edge) => {
        const next = direction === 'down' ? edge.target().id() : edge.source().id();
        if (!nodeIDs.has(next)) { nodeIDs.add(next); frontier.push(next); }
      });
    }
  };
  walk('down'); walk('up');
  cy.$id(nodeID).connectedEdges().forEach((edge) => nodeIDs.add(edge.source().id() === nodeID ? edge.target().id() : edge.source().id()));
  const nodes = cy.nodes().filter((node) => nodeIDs.has(node.id()));
  const edges = cy.edges().filter((edge) => nodeIDs.has(edge.source().id()) && nodeIDs.has(edge.target().id()));
  return nodes.union(edges);
}

function applyGraphEmphasis() {
  const cy = state.graphInstance;
  if (!cy) return;
  cy.elements().removeClass('is-dimmed is-path show-label');
  const query = state.graphSearch.trim().toLowerCase();
  if (query) {
    const matches = cy.nodes().filter((node) => `${node.data('title')} ${node.data('description') || ''}`.toLowerCase().includes(query));
    cy.elements().addClass('is-dimmed');
    matches.forEach((node) => node.closedNeighborhood().removeClass('is-dimmed'));
    matches.connectedEdges().addClass('show-label');
    return;
  }
  if (state.graphSelectedId && cy.$id(state.graphSelectedId).length) {
    const branch = graphBranchElements(state.graphSelectedId);
    cy.elements().addClass('is-dimmed');
    branch.removeClass('is-dimmed').addClass('is-path');
    cy.$id(state.graphSelectedId).removeClass('is-path');
  }
  updateGraphZoomStyles();
}

function applyGraphSearch() {
  clearTimeout(state.graphSearchTimer);
  state.graphSearchTimer = setTimeout(() => mountGraph(), 220);
}

function selectGraphNode(id, skipCenter = false) {
  const cy = state.graphInstance;
  if (!cy) return;
  state.graphSelectedId = id;
  cy.$(':selected').unselect();
  if (id && cy.$id(id).length) {
    cy.$id(id).select();
    if (!skipCenter) cy.animate({ center: { eles: cy.$id(id) }, zoom: Math.max(cy.zoom(), .78), duration: 210 });
  }
  applyGraphEmphasis();
  $('#graph-inspector').innerHTML = renderGraphInspector();
  bindGraphInspector();
  $('#graph-inspector').classList.toggle('open', Boolean(id));
}

function renderGraphInspector() {
  const node = state.graphData?.nodes.find((item) => item.id === state.graphSelectedId);
  if (!node) return `<div class="graph-inspector-empty">${icon('network')}<strong>Выберите объект</strong><p>Здесь появятся содержание, ближайшие связи и быстрые действия.</p></div>`;
  const meta = typeMeta[node.type] || { singular: node.entityKind === 'question' ? 'Вопрос' : node.entityKind === 'answer' ? 'Ответ основателя' : node.entityKind === 'joint_decision' ? 'Совместный итог' : node.entityKind === 'research_option' ? 'Вариант исследования' : 'Объект', icon: node.entityKind === 'joint_decision' ? 'scale' : node.entityKind === 'research_option' ? 'flask' : 'messages' };
  const edges = (state.graphData?.edges || []).filter((edge) => edge.source === node.id || edge.target === node.id);
  const neighbors = edges.slice(0, 8).map((edge) => {
    const targetID = edge.source === node.id ? edge.target : edge.source;
    const target = state.graphData.nodes.find((item) => item.id === targetID);
    return target ? `<button type="button" data-graph-neighbor="${target.id}"><span>${escapeHTML(edge.label)}</span><strong>${escapeHTML(target.title)}</strong></button>` : '';
  }).join('');
  const recordNode = node.entityKind === 'record';
  const canLink = recordNode && (node.editPolicy !== 'owner_only' || node.ownerUsername === state.me.username);
  const sourceActive = state.graphLinkSourceId === node.id;
  const context = recordNode ? `<div class="graph-node-context"><span class="workstream-mark workstream-${node.workstream || 'business'}">${escapeHTML(workstreamLabels[node.workstream || 'business'])}</span>${node.isRoot ? '<span class="root-mark">Новый корень</span>' : ''}${node.editPolicy === 'owner_only' ? `<span class="access-mark">${icon('lock')} Только владелец</span>` : ''}</div>` : '';
  return `<div class="graph-inspector-head"><span class="type-icon">${icon(meta.icon)}</span><button type="button" class="icon-button" data-close-graph-inspector aria-label="Закрыть">${icon('x')}</button></div><small>${escapeHTML(meta.singular)}${node.ownerUsername ? ` · ${escapeHTML(node.ownerUsername)}` : ''}</small><h2>${escapeHTML(node.title)}</h2>${context}${node.description ? `<p>${escapeHTML(node.description).replace(/\n/g, '<br>')}</p>` : ''}<div class="graph-inspector-actions"><button type="button" class="primary" data-open-graph-node>${icon('chevronRight')} Открыть</button><button type="button" class="secondary" data-focus-graph-node>${icon('network')} В фокус</button>${canLink ? `<button type="button" class="secondary ${sourceActive ? 'danger-action' : ''}" data-graph-link-source>${icon('link')} ${sourceActive ? 'Отменить связь' : state.graphLinkSourceId ? 'Связать сюда' : 'Создать связь'}</button>` : ''}</div>${state.graphLinkSourceId && state.graphLinkSourceId !== node.id && recordNode ? `<div class="graph-link-callout"><strong>Создать связь с выбранной карточкой?</strong><select id="graph-relation-type"><option value="related">Связано</option><option value="supports">Поддерживает</option><option value="depends_on">Зависит от</option><option value="leads_to">Приводит к</option></select><button type="button" class="primary" data-confirm-graph-link>Связать</button></div>` : ''}<section class="graph-neighbors"><header><span>Ближайшие связи</span><b>${edges.length}</b></header>${neighbors || '<p>Связей пока нет.</p>'}</section>`;
}

function closeGraphContextMenu() {
  state.graphContextNodeId = '';
  $('#graph-context-menu')?.classList.remove('open');
}

function openGraphContextMenu(nodeID) {
  const node = state.graphData?.nodes.find((item) => item.id === nodeID);
  const menu = $('#graph-context-menu');
  if (!node || !menu) return;
  state.graphContextNodeId = nodeID;
  const canLink = node.entityKind === 'record' && (node.editPolicy !== 'owner_only' || node.ownerUsername === state.me.username);
  menu.innerHTML = `<strong>${escapeHTML(graphNodeLabel(node))}</strong><button type="button" data-graph-context="open">${icon('chevronRight')} Открыть</button><button type="button" data-graph-context="focus">${icon('network')} Локальная карта</button>${canLink ? `<button type="button" data-graph-context="link">${icon('link')} ${state.graphLinkSourceId ? 'Связать с выбранным' : 'Начать связь'}</button>` : ''}`;
  menu.classList.add('open');
  $$('[data-graph-context]', menu).forEach((button) => button.addEventListener('click', () => {
    const current = state.graphData.nodes.find((item) => item.id === state.graphContextNodeId);
    const action = button.dataset.graphContext;
    closeGraphContextMenu();
    if (!current) return;
    if (action === 'open') openGraphNode(current);
    if (action === 'focus') { state.graphFocusRecordId = current.recordId; state.graphSelectedId = current.id; renderGraph(); }
    if (action === 'link') {
      selectGraphNode(current.id, true);
      if (!state.graphLinkSourceId) state.graphLinkSourceId = current.id;
      $('#graph-inspector').innerHTML = renderGraphInspector();
      $('#graph-inspector').classList.add('open');
      bindGraphInspector();
      state.graphInstance.nodes().removeClass('link-source');
      if (state.graphLinkSourceId) state.graphInstance.$id(state.graphLinkSourceId).addClass('link-source');
    }
  }));
}

function fitGraph() {
  const cy = state.graphInstance;
  if (!cy || !cy.nodes().length) return;
  cy.animate({ fit: { eles: cy.elements(), padding: window.innerWidth <= 560 ? 28 : 54 }, duration: 240 });
}

function zoomGraph(multiplier) {
  const cy = state.graphInstance;
  if (!cy) return;
  cy.animate({ zoom: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * multiplier)), duration: 130 });
}

function stopGraphTimeline(reveal = true) {
  clearTimeout(state.graphTimelineTimer);
  state.graphTimelineTimer = null;
  state.graphTimelinePlaying = false;
  if (reveal) state.graphInstance?.elements().removeClass('timeline-hidden');
  const button = $('[data-graph-timeline]');
  if (button) button.innerHTML = `${icon('play')} Показать развитие`;
}

function toggleGraphTimeline() {
  const cy = state.graphInstance;
  if (!cy) return;
  if (state.graphTimelinePlaying) { stopGraphTimeline(true); return; }
  const nodes = cy.nodes().toArray().sort((left, right) => new Date(left.data('createdAt')) - new Date(right.data('createdAt')));
  if (!nodes.length) return;
  state.graphTimelinePlaying = true;
  cy.elements().addClass('timeline-hidden');
  const button = $('[data-graph-timeline]');
  if (button) button.innerHTML = `${icon('pause')} Остановить анимацию`;
  let index = 0;
  const revealNext = () => {
    if (!state.graphTimelinePlaying || !state.graphInstance) return;
    const batch = nodes.slice(index, index + Math.max(1, Math.ceil(nodes.length / 28)));
    batch.forEach((node) => {
      node.removeClass('timeline-hidden');
      node.connectedEdges().filter((edge) => !edge.source().hasClass('timeline-hidden') && !edge.target().hasClass('timeline-hidden')).removeClass('timeline-hidden');
    });
    index += batch.length;
    if (index >= nodes.length) { stopGraphTimeline(true); return; }
    state.graphTimelineTimer = setTimeout(revealNext, 140);
  };
  revealNext();
}

function bindGraphKeyboard() {
  const container = $('#relationship-graph');
  container?.addEventListener('keydown', (event) => {
    const cy = state.graphInstance;
    if (!cy) return;
    if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomGraph(1.18); }
    else if (event.key === '-') { event.preventDefault(); zoomGraph(1 / 1.18); }
    else if (event.key === '0') { event.preventDefault(); fitGraph(); }
    else if (event.key === 'Enter' && state.graphSelectedId) {
      event.preventDefault(); openGraphNode(state.graphData.nodes.find((item) => item.id === state.graphSelectedId));
    } else if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const step = event.shiftKey ? 90 : 34;
      const pan = { x: 0, y: 0 };
      if (event.key === 'ArrowUp') pan.y = step;
      if (event.key === 'ArrowDown') pan.y = -step;
      if (event.key === 'ArrowLeft') pan.x = step;
      if (event.key === 'ArrowRight') pan.x = -step;
      cy.panBy(pan);
    }
  });
}

function bindGraphControls() {
  $$('[data-graph-mode]').forEach((button) => button.addEventListener('click', () => { if (button.dataset.graphMode === 'global') state.graphFocusRecordId = ''; renderGraph(); }));
  $('#graph-search').addEventListener('input', (event) => { state.graphSearch = event.target.value; applyGraphSearch(); });
  $('#graph-depth')?.addEventListener('input', (event) => { state.graphDepth = Number(event.target.value); event.target.nextElementSibling.textContent = String(state.graphDepth); mountGraph(); });
  $('#graph-fit').addEventListener('click', fitGraph);
  $('#graph-zoom-in').addEventListener('click', () => zoomGraph(1.18));
  $('#graph-zoom-out').addEventListener('click', () => zoomGraph(1 / 1.18));
  $('#graph-relayout').addEventListener('click', () => {
    if (!state.graphInstance) return;
    clearGraphPositions();
    const layout = state.graphInstance.layout(graphLayoutOptions(true));
    state.graphInstance.one('layoutstop', () => { ensureReadableGraphView(state.graphInstance); saveGraphPositions(); updateGraphZoomStyles(); });
    layout.run();
  });
  $('#graph-settings-toggle').addEventListener('click', () => {
    state.graphSettingsOpen = !state.graphSettingsOpen;
    $('#graph-settings').classList.toggle('open', state.graphSettingsOpen);
    $('#graph-settings-toggle').classList.toggle('active', state.graphSettingsOpen);
    $('#graph-inspector').classList.toggle('open', Boolean(state.graphSelectedId) && !state.graphSettingsOpen);
  });
  $('[data-close-graph-settings]')?.addEventListener('click', () => {
    state.graphSettingsOpen = false; $('#graph-settings').classList.remove('open'); $('#graph-settings-toggle').classList.remove('active');
    $('#graph-inspector').classList.toggle('open', Boolean(state.graphSelectedId));
  });
  $('[data-reset-graph-settings]')?.addEventListener('click', () => { resetGraphSettings(); renderGraph(); });
  const settingMap = { showDiscussion: 'graphShowDiscussion', showOrphans: 'graphShowOrphans', showArrows: 'graphShowArrows', physics: 'graphPhysics' };
  $$('[data-graph-setting]').forEach((input) => input.addEventListener('change', () => {
    state[settingMap[input.dataset.graphSetting]] = input.checked; saveGraphSettings();
    if (input.dataset.graphSetting !== 'physics') mountGraph();
  }));
  $$('[data-graph-group]').forEach((input) => input.addEventListener('change', () => {
    if (input.checked) state.graphHiddenGroups.delete(input.dataset.graphGroup); else state.graphHiddenGroups.add(input.dataset.graphGroup);
    saveGraphSettings(); mountGraph();
  }));
  $$('[data-graph-group-color]').forEach((input) => input.addEventListener('change', () => {
    state.graphGroupColors[input.dataset.graphGroupColor] = input.value; saveGraphSettings(); mountGraph();
  }));
  const rangeMap = { textFade: 'graphTextFade', nodeSize: 'graphNodeSize', linkThickness: 'graphLinkThickness', centerForce: 'graphCenterForce', repelForce: 'graphRepelForce', linkForce: 'graphLinkForce', linkDistance: 'graphLinkDistance' };
  $$('[data-graph-range]').forEach((input) => {
    input.addEventListener('input', () => { state[rangeMap[input.dataset.graphRange]] = Number(input.value); input.nextElementSibling.textContent = input.value; });
    input.addEventListener('change', () => { saveGraphSettings(); mountGraph(); });
  });
  $('[data-graph-timeline]')?.addEventListener('click', toggleGraphTimeline);
  bindGraphKeyboard();
}

function bindGraphInspector() {
  $('[data-close-graph-inspector]')?.addEventListener('click', () => selectGraphNode(''));
  $('[data-open-graph-node]')?.addEventListener('click', () => {
    const node = state.graphData.nodes.find((item) => item.id === state.graphSelectedId); if (node) openGraphNode(node);
  });
  $('[data-focus-graph-node]')?.addEventListener('click', () => {
    const node = state.graphData.nodes.find((item) => item.id === state.graphSelectedId); if (!node) return;
    state.graphFocusRecordId = node.recordId; state.graphDepth = 2; renderGraph();
  });
  $$('[data-graph-neighbor]').forEach((button) => button.addEventListener('click', () => selectGraphNode(button.dataset.graphNeighbor)));
  $('[data-graph-link-source]')?.addEventListener('click', () => {
    const node = state.graphData.nodes.find((item) => item.id === state.graphSelectedId); if (!node || node.entityKind !== 'record') return;
    if (!state.graphLinkSourceId) state.graphLinkSourceId = node.id;
    else if (state.graphLinkSourceId === node.id) state.graphLinkSourceId = '';
    $('#graph-inspector').innerHTML = renderGraphInspector(); bindGraphInspector();
    state.graphInstance.nodes().removeClass('link-source');
    if (state.graphLinkSourceId) state.graphInstance.$id(state.graphLinkSourceId).addClass('link-source');
  });
  $('[data-confirm-graph-link]')?.addEventListener('click', createGraphLink);
}

async function createGraphLink() {
  const source = state.graphData.nodes.find((item) => item.id === state.graphLinkSourceId);
  const target = state.graphData.nodes.find((item) => item.id === state.graphSelectedId);
  if (!source || !target || source.entityKind !== 'record' || target.entityKind !== 'record') return;
  try {
    await api(`/api/records/${source.recordId}/links`, { method: 'POST', body: JSON.stringify({ targetId: target.recordId, relationType: $('#graph-relation-type').value, reason: 'Связь создана на карте проекта' }) });
    state.graphData = await api('/api/graph'); state.graphLinkSourceId = ''; state.detailCache.delete(source.recordId); state.detailCache.delete(target.recordId); mountGraph(); selectGraphNode(target.id, true); toast('Связь добавлена');
  } catch (error) { toast(error.message, true); }
}

function openGraphNode(node) {
  if (!node?.recordId) return;
  openRecord(node.recordId, { tab: node.researchOptionId ? 'content' : node.questionId ? 'questions' : 'overview', questionId: node.questionId, workspace: false });
}

function openGraphForRecord(recordId) {
  $('#record-dialog').close();
  state.graphFocusRecordId = recordId; state.graphSelectedId = `record:${recordId}`; state.graphDepth = 2; state.view = 'graph'; render();
}

function renderRecordList(type) {
  let records = state.records.filter((record) => record.type === type);
  if (!state.statusFilter) records = records.filter((record) => record.status !== 'archived');
  if (state.statusFilter) records = records.filter((record) => record.status === state.statusFilter);
  if (state.ownerFilter) records = records.filter((record) => String(record.ownerId) === state.ownerFilter);
  if (state.search) {
    const query = state.search.toLowerCase();
    records = records.filter((record) => `${record.title} ${record.description}`.toLowerCase().includes(query));
  }
  const statusTabs = type === 'idea' ? ['all', 'inbox', 'review', 'main', 'rejected', 'archived'] : ['all', ...(statusesByType[type] || statusesByType.default), 'archived'];
  const listCopy = {
    goal: 'Результаты, к которым движется команда, со сроком и измеримым прогрессом.',
    idea: 'Все мысли сохраняются сразу, а оценка и переход между этапами происходят позже.',
    document: 'Материалы и ссылки, которые нужны для решений и выполнения работы.',
    research: 'Проверки гипотез с ожидаемым выводом и сроком.',
    decision: 'Зафиксированные решения, их основания и ответственные.',
    disagreement: 'Позиции сторон и итог разногласия без потери аргументов.',
    meeting: 'Созвоны, заметки, договорённости и появившаяся работа.',
  }[type] || 'Карточки проекта с единым источником данных и сохранённой историей.';
  const emptyTitle = ({ goal: 'Пока нет ни одной цели', idea: 'Пока нет ни одной идеи', document: 'Пока нет ни одного документа', research: 'Пока нет ни одного исследования', decision: 'Пока нет ни одного решения', disagreement: 'Пока нет ни одного разногласия', meeting: 'Пока нет ни одной встречи' })[type] || 'Пока нет ни одной карточки';
  const createLabel = ({ goal: 'Создать цель', idea: 'Создать идею', document: 'Создать документ', research: 'Создать исследование', decision: 'Создать решение', disagreement: 'Зафиксировать разногласие', meeting: 'Создать встречу' })[type] || 'Создать карточку';
  $('#main-content').innerHTML = `
    <div class="entity-list-heading"><div><p class="eyebrow">${type === 'idea' ? 'Банк гипотез' : type === 'goal' ? 'Направление движения' : 'База проекта'}</p><h1>${escapeHTML(typeMeta[type].label)}</h1><p>${escapeHTML(listCopy)}</p></div><button type="button" class="primary" data-record-create="${type}">${icon('plus')} ${escapeHTML(createLabel)}</button></div>
    <section class="entity-list-controls" aria-label="Фильтры раздела">
      <div class="search-box">${icon('search')}<input id="record-search" type="search" placeholder="Найти в разделе" value="${escapeHTML(state.search)}"></div>
      <label><span>${type === 'question_set' ? 'Координатор' : type === 'meeting' ? 'Организатор' : 'Ответственный'}</span><select id="owner-filter"><option value="">${type === 'question_set' ? 'Все координаторы' : type === 'meeting' ? 'Все организаторы' : 'Все ответственные'}</option>${state.users.map((user) => `<option value="${user.id}" ${state.ownerFilter === String(user.id) ? 'selected' : ''}>${escapeHTML(user.username)}</option>`).join('')}</select></label>
      <label><span>Состояние</span><select id="record-status-filter">${statusTabs.map((status) => `<option value="${status === 'all' ? '' : status}" ${state.statusFilter === (status === 'all' ? '' : status) ? 'selected' : ''}>${status === 'all' ? 'Все состояния' : statusLabels[status]}</option>`).join('')}</select></label>
      <span class="record-total">${recordsCountLabel(records.length)}</span>
    </section>
    <section class="table-panel">
      <div class="record-table header ${['task', 'goal', 'question_set', 'meeting'].includes(type) ? '' : 'simple'}"><span>Карточка</span><span>${type === 'question_set' ? 'Координатор' : type === 'meeting' ? 'Организатор' : 'Ответственный'}</span><span>Статус</span><span>${['task', 'goal', 'question_set', 'meeting'].includes(type) ? 'Дата / прогресс' : 'Изменено'}</span></div>
      <div class="record-rows">${records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(renderRecordRow).join('') || `<div class="guided-empty entity-empty">${icon(typeMeta[type].icon)}<h3>${state.search || state.statusFilter || state.ownerFilter ? 'В этом фильтре ничего нет' : escapeHTML(emptyTitle)}</h3><p>${state.search || state.statusFilter || state.ownerFilter ? 'Измените условия фильтра или создайте новую карточку.' : 'Создайте первую карточку. Её можно заполнить и связать с другими объектами позже.'}</p><button type="button" class="primary" data-record-create="${type}">${icon('plus')} ${escapeHTML(createLabel)}</button></div>`}</div>
    </section>`;
  $('#record-search').addEventListener('input', (event) => {
    state.search = event.target.value;
    clearTimeout(state.recordSearchTimer);
    state.recordSearchTimer = setTimeout(() => {
      renderRecordList(type);
      const input = $('#record-search'); input.focus(); input.setSelectionRange(input.value.length, input.value.length);
    }, 160);
  });
  $('#owner-filter').addEventListener('change', (event) => { state.ownerFilter = event.target.value; renderRecordList(type); });
  $('#record-status-filter').addEventListener('change', (event) => { state.statusFilter = event.target.value; renderRecordList(type); });
  $$('[data-record-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.recordCreate)));
  bindOpenRecords();
}

function renderRecordRow(record) {
  const isPlannable = ['task', 'goal', 'question_set', 'meeting'].includes(record.type);
  const deadline = deadlineState(record);
  return `<button type="button" class="record-table row ${isPlannable ? '' : 'simple'}" data-open-record="${record.id}">
    <span class="record-title"><i class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</i><span><strong>${escapeHTML(record.title)}</strong><small>${escapeHTML(record.description || 'Без описания')}</small></span></span>
    <span><b class="owner-chip">${escapeHTML(record.ownerUsername)}</b><small>создал ${escapeHTML(record.authorUsername)}</small></span>
    <span><em class="status status-${record.status}">${escapeHTML(statusLabels[record.status] || record.status)}</em></span>
    <span>${isPlannable ? `<em class="deadline ${deadline.className}">${escapeHTML(deadline.label)}</em><progress class="progress-track" max="100" value="${record.progress}"></progress><small>${record.progress}% · ${minutesLabel(record.estimateMinutes)}</small>` : `<b>${formatDate(record.updatedAt, true)}</b><small>${record.type === 'idea' ? 'Одна карточка во всех списках' : typeMeta[record.type].singular}</small>`}</span>
  </button>`;
}

function emptyState(text) {
  return `<div class="empty-state">${escapeHTML(text)}</div>`;
}

function bindOpenRecords() {
  $$('[data-open-record]').forEach((node) => {
    node.addEventListener('click', () => openRecord(node.dataset.openRecord));
    node.addEventListener('pointerenter', () => prefetchRecord(node.dataset.openRecord), { once: true });
    node.addEventListener('focus', () => prefetchRecord(node.dataset.openRecord), { once: true });
  });
  $$('[data-open-event]').forEach((node) => node.addEventListener('click', () => openActivity(node.dataset.openEvent)));
  $$('[data-owner-filter]').forEach((node) => node.addEventListener('click', () => navigateToView('work', { ownerId: node.dataset.ownerFilter })));
  $$('[data-user-profile]').forEach((node) => node.addEventListener('click', () => openProfile(Number(node.dataset.userProfile))));
}

function cachedRecordDetail(id) {
  const detail = state.detailCache.get(id);
  const summary = state.records.find((record) => record.id === id);
  if (!detail || (summary && summary.updatedAt !== detail.record.updatedAt)) return null;
  return detail;
}

async function fetchRecordDetail(id, force = false) {
  if (!force) {
    const cached = cachedRecordDetail(id);
    if (cached) return cached;
  }
  if (state.detailRequests.has(id)) return state.detailRequests.get(id);
  const request = api(`/api/records/${id}`).then((detail) => {
    const previous = state.detailCache.get(id);
    if (previous?.relationsLoaded && previous.record.updatedAt === detail.record.updatedAt) {
      detail.links = previous.links;
      detail.scores = previous.scores;
      detail.researchOptions = previous.researchOptions || [];
      detail.relationsLoaded = true;
    }
    state.detailCache.set(id, detail);
    return detail;
  }).finally(() => state.detailRequests.delete(id));
  state.detailRequests.set(id, request);
  return request;
}

function prefetchRecord(id) {
  if (!cachedRecordDetail(id) && !state.detailRequests.has(id)) fetchRecordDetail(id).catch(() => {});
}

function addRecordWorkspaceItem(id, summary, preserve) {
  if (!preserve) state.recordWorkspace = [];
  const existing = state.recordWorkspace.find((item) => item.id === id);
  if (!existing) {
    state.recordWorkspace.push({ id, title: summary?.title || 'Карточка', type: summary?.type || 'document' });
    if (state.recordWorkspace.length > 6) state.recordWorkspace.shift();
  } else if (summary) {
    existing.title = summary.title;
    existing.type = summary.type;
  }
  state.activeWorkspaceRecordId = id;
}

async function openRecord(id, options = {}) {
  const requestID = ++state.activeRecordRequest;
  if (state.activeWorkspaceRecordId !== id || options.edit !== true) {
    state.recordEditMode = Boolean(options.edit);
    state.activeResearchOptionId = '';
  }
  const cached = cachedRecordDetail(id);
  const summary = state.records.find((record) => record.id === id);
  const preserveWorkspace = Boolean(options.workspace || ($('#record-dialog').open && state.recordWorkspace.length));
  addRecordWorkspaceItem(id, cached?.record || summary, preserveWorkspace);
  state.focusQuestionId = options.questionId || '';
  state.activeRecordTab = options.tab || ((cached?.record.type || summary?.type) === 'question_set' ? 'questions' : 'overview');
  if (cached) {
    state.activeDetail = cached;
    renderRecordDialog();
  } else {
    state.activeDetail = null;
    renderRecordLoading(summary);
  }
  openModal($('#record-dialog'));
  try {
    const detail = await fetchRecordDetail(id, Boolean(cached));
    if (requestID !== state.activeRecordRequest || !$('#record-dialog').open) return;
    state.activeDetail = detail;
    addRecordWorkspaceItem(id, detail.record, true);
    renderRecordDialog();
  } catch (error) {
    if (requestID === state.activeRecordRequest) renderRecordLoadError(id, error.message);
  }
}

function renderRecordWorkspace() {
  if (state.recordWorkspace.length < 2) return '';
  return `<nav class="record-workspace-bar" aria-label="Открытые связанные карточки">${state.recordWorkspace.map((item) => `<span class="workspace-tab ${item.id === state.activeWorkspaceRecordId ? 'active' : ''}"><button type="button" data-workspace-record="${item.id}">${icon(typeMeta[item.type]?.icon || 'fileText')}<b>${escapeHTML(item.title)}</b></button><button type="button" data-close-workspace="${item.id}" aria-label="Закрыть ${escapeHTML(item.title)}">${icon('x')}</button></span>`).join('')}</nav>`;
}

function bindRecordWorkspace() {
  $$('[data-workspace-record]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.workspaceRecord, { workspace: true })));
  $$('[data-close-workspace]').forEach((button) => button.addEventListener('click', async (event) => {
    event.stopPropagation();
    const id = button.dataset.closeWorkspace;
    const index = state.recordWorkspace.findIndex((item) => item.id === id);
    state.recordWorkspace = state.recordWorkspace.filter((item) => item.id !== id);
    if (id !== state.activeWorkspaceRecordId) { renderRecordDialog(); return; }
    const next = state.recordWorkspace[Math.max(0, index - 1)];
    if (!next) { $('#record-dialog').close(); return; }
    await openRecord(next.id, { workspace: true });
  }));
}

function renderRecordLoading(summary) {
  const meta = typeMeta[summary?.type] || { singular: 'Карточка', icon: 'fileText' };
  $('#record-dialog-content').innerHTML = `<div class="record-shell record-type-${summary?.type || 'document'} loading-shell ${state.recordWorkspace.length > 1 ? 'has-workspace' : ''}">${renderRecordWorkspace()}<div class="dialog-header record-dialog-header"><div><span class="record-kind">${icon(meta.icon)} ${escapeHTML(meta.singular)}</span><h2>${escapeHTML(summary?.title || 'Загружаем карточку')}</h2><p>Основные данные появятся сразу после ответа сервера</p></div><button type="button" class="close-button icon-button" data-close-dialog aria-label="Закрыть">${icon('x')}</button></div><div class="loading-tabs"><i></i><i></i><i></i></div><div class="dialog-layout"><div class="dialog-main"><div class="record-skeleton"><span class="skeleton-line wide"></span><span class="skeleton-line medium"></span><span class="skeleton-block"></span><div><span class="skeleton-line"></span><span class="skeleton-line short"></span></div></div></div><aside class="dialog-aside"><span class="skeleton-line"></span><span class="skeleton-line short"></span><span class="skeleton-line"></span></aside></div></div>`;
  $('[data-close-dialog]').addEventListener('click', () => $('#record-dialog').close());
  bindRecordWorkspace();
}

function renderRecordLoadError(id, message) {
  $('#record-dialog-content').innerHTML = `<div class="record-load-error">${icon('help')}<h2>Карточка не загрузилась</h2><p>${escapeHTML(message)}</p><div><button type="button" class="primary" data-retry-record="${id}">Повторить</button><button type="button" class="secondary" data-close-dialog>Закрыть</button></div></div>`;
  $('[data-retry-record]').addEventListener('click', () => openRecord(id));
  $('[data-close-dialog]').addEventListener('click', () => $('#record-dialog').close());
}

function recordTabs(record, detail, activity) {
  const filledSections = detail.sections.filter((section) => section.content).length;
  const relationCount = detail.relationsLoaded ? detail.links.length + (detail.researchOptions?.length || 0) : 0;
  const tabs = [
    ['overview', 'Обзор', ''],
    ['content', 'Содержание', `${filledSections}/${detail.sections.length}`],
    ['relations', record.type === 'idea' ? 'Критерии и связи' : 'Связи', detail.relationsLoaded ? `${relationCount}` : ''],
    ['history', 'История', `${activity.length}`],
  ];
  if (record.type === 'question_set') {
    const workflow = detail.questionWorkflow || { questions: [], resolved: 0 };
    tabs.unshift(['questions', 'Вопросы и ответы', `${workflow.resolved}/${workflow.questions.length}`]);
    tabs.splice(2, 1);
  }
  return tabs.map(([key, label, count]) => `<button type="button" class="record-tab ${state.activeRecordTab === key ? 'active' : ''}" data-record-tab="${key}"><span>${label}</span>${count ? `<b>${count}</b>` : ''}</button>`).join('');
}

function nextRecordOptions(record) {
  return {
    goal: [['task', '', 'Задача'], ['criterion', 'preference', 'Критерий'], ['research', '', 'Исследование']],
    task: [['decision', '', 'Решение'], ['document', '', 'Документ'], ['question_set', '', 'Вопросы']],
    question_set: [['decision', 'insight', 'Вывод'], ['task', '', 'Задача'], ['criterion', 'preference', 'Критерий']],
    idea: [['research', '', 'Исследование'], ['task', '', 'Задача'], ['decision', '', 'Решение']],
    research: [['decision', '', 'Решение'], ['criterion', 'preference', 'Критерий'], ['task', '', 'Задача']],
    decision: [['task', '', 'Задача'], ['goal', '', 'Цель'], ['decision', 'rule', 'Правило']],
    disagreement: [['decision', '', 'Решение'], ['decision', 'rule', 'Правило'], ['question_set', '', 'Вопросы']],
    criterion: [['research', '', 'Исследование'], ['idea', '', 'Идея']],
    document: [['task', '', 'Задача'], ['decision', '', 'Решение']],
    meeting: [['task', '', 'Задача'], ['decision', '', 'Решение'], ['criterion', 'limitation', 'Ограничение'], ['idea', '', 'Идея'], ['research', '', 'Исследование']],
  }[record.type] || [];
}

function renderNextActions(record) {
  const options = nextRecordOptions(record);
  if (!options.length) return '';
  return `<section class="meeting-results next-actions"><header><div><p class="eyebrow">Следующий результат</p><h3>Продолжить цепочку</h3></div><button type="button" class="text-button" data-record-graph="${record.id}">${icon('network')} Посмотреть связи</button></header><div>${options.map(([type, kind, label]) => `<button type="button" data-create-linked="${type}" data-linked-kind="${kind}">${icon(typeMeta[type].icon)} ${label}</button>`).join('')}</div></section>`;
}

function renderHierarchyPanel(record) {
  const parent = record.parentId ? state.records.find((item) => item.id === record.parentId) : null;
  const children = state.records.filter((item) => item.parentId === record.id && item.status !== 'archived');
  if (!record.isRoot && !parent && !children.length) return '';
  return `<section class="hierarchy-panel">
    <header><div><p class="eyebrow">Место в проекте</p><h3>${record.isRoot ? 'Самостоятельная ветка' : parent ? 'Продолжение рабочей цепочки' : 'Начало цепочки'}</h3></div><button type="button" class="text-button" data-record-graph="${record.id}">${icon('network')} На карте</button></header>
    <div class="hierarchy-path">${parent ? `<button type="button" data-related-record="${parent.id}"><small>Родитель</small><strong>${escapeHTML(parent.title)}</strong></button><span>${icon('chevronRight')}</span>` : ''}<div><small>${record.isRoot ? 'Корень' : 'Текущая карточка'}</small><strong>${escapeHTML(record.title)}</strong></div></div>
    ${children.length ? `<div class="hierarchy-children"><span>Дочерние работы · ${children.length}</span>${children.slice(0, 6).map((item) => `<button type="button" data-related-record="${item.id}">${icon(typeMeta[item.type]?.icon || 'fileText')}<span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(typeMeta[item.type]?.singular || 'Карточка')} · ${escapeHTML(statusLabels[item.status] || item.status)}</small></span>${icon('chevronRight')}</button>`).join('')}</div>` : ''}
  </section>`;
}

function dossierProperty(label, value, field, canEdit, tone = '') {
  const tag = canEdit && field ? 'button' : 'div';
  return `<${tag} ${canEdit && field ? `type="button" data-edit-field="${field}"` : ''} class="dossier-property ${tone}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || 'Не указано')}</strong>${canEdit && field ? icon('edit') : ''}</${tag}>`;
}

function renderAIAnalysis(record, canEdit) {
  if (state.aiAnalysisLoading === record.id) {
    return `<section class="ai-analysis loading"><span class="spinner"></span><div><strong>AI разбирает карточку</strong><p>Проверяем контекст, риски, связи и следующий предметный результат.</p></div></section>`;
  }
  const analysis = state.aiAnalyses.get(record.id);
  if (!analysis) return '';
  const source = analysis.source === 'groq' ? 'Groq' : 'локальные правила';
  return `<section class="ai-analysis">
    <header><span>${icon('sparkles')}</span><div><p class="eyebrow">AI-разбор · ${escapeHTML(source)}</p><h3>Что требует внимания</h3></div><b>${Math.round((analysis.confidence || 0) * 100)}%</b></header>
    <p class="ai-summary">${escapeHTML(analysis.summary)}</p>
    <div class="ai-analysis-grid">
      <div><span>Пробелы</span>${analysis.gaps.length ? `<ul>${analysis.gaps.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p>Критичных пробелов не найдено.</p>'}</div>
      <div class="ai-risks"><span>Риски</span>${analysis.risks.length ? `<ul>${analysis.risks.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p>Явных рисков не найдено.</p>'}</div>
    </div>
    <div class="ai-next"><span>Следующий проверяемый шаг</span><strong>${escapeHTML(analysis.nextAction)}</strong><div>${canEdit ? `<button type="button" class="secondary" data-ai-create-next>${icon('plus')} Создать задачу</button>` : ''}${canEdit && (analysis.priority !== record.priority || analysis.estimateMinutes !== record.estimateMinutes) ? `<button type="button" class="secondary" data-ai-apply-plan>${icon('check')} Применить ${escapeHTML(priorityLabels[analysis.priority])}, ${minutesLabel(analysis.estimateMinutes)}</button>` : ''}</div></div>
    ${analysis.suggestedLinks.length ? `<div class="ai-proposals"><span>Предлагаемые связи</span>${analysis.suggestedLinks.map((link) => `<button type="button" data-ai-link="${link.recordId}" data-ai-relation="${link.relationType}" ${canEdit ? '' : 'disabled'}><strong>${escapeHTML(link.title)}</strong><small>${escapeHTML(link.reason)}</small>${icon('link')}</button>`).join('')}</div>` : ''}
    ${analysis.suggestedOutputs.length ? `<div class="ai-proposals"><span>Из заметок можно создать</span>${analysis.suggestedOutputs.map((output, index) => `<button type="button" data-ai-output-index="${index}" ${canEdit ? '' : 'disabled'}><strong>${escapeHTML(typeMeta[output.type]?.singular || 'Карточка')}: ${escapeHTML(output.title)}</strong><small>${escapeHTML(output.reason)}</small>${icon('plus')}</button>`).join('')}</div>` : ''}
    <p class="ai-disclaimer">AI предлагает структуру, но не меняет факты, решения и сроки без вашего действия.</p>
  </section>`;
}

function renderRecordReadOverview(record, options) {
  const { language, hasDeadline, hasDecisionMaker, hasPriority, hasEstimate, hasManualProgress, hasResult, hasExecution, dueLabel, canEdit } = options;
  const origin = state.activeDetail.derivation;
  const draft = loadRecordDraft(record.id);
  const ownerLabel = language.owner;
  const deadline = deadlineState(record);
  return `<div class="record-pane ${state.activeRecordTab === 'overview' ? 'active' : ''}" data-record-pane="overview">
    ${origin ? `<button type="button" class="origin-trace" data-related-record="${origin.sourceRecordId}"><span>${icon('link')}</span><span><small>Создано из совместного вывода</small><strong>${escapeHTML(origin.questionBody)}</strong><em>${escapeHTML(origin.decisionContent)}</em></span>${icon('chevronRight')}</button>` : ''}
    ${draft ? `<div class="draft-banner"><span><strong>Есть несохранённый черновик</strong><small>Продолжите редактирование или удалите локальную версию.</small></span><div><button type="button" class="secondary" data-open-record-edit>Продолжить</button><button type="button" class="text-button" data-discard-draft>Удалить</button></div></div>` : ''}
    ${canEdit ? '' : `<div class="access-banner">${icon('lock')}<span><strong>Личная карточка ${escapeHTML(record.ownerUsername)}</strong><small>Просмотр доступен команде, изменять содержание может только ответственный.</small></span></div>`}
    ${renderHierarchyPanel(record)}
    <article class="record-dossier">
      <section class="dossier-section dossier-context"><header><div><p class="eyebrow">Содержание</p><h3>${escapeHTML(language.description)}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-edit-field="description" aria-label="Изменить описание" title="Изменить описание">${icon('edit')}</button>` : ''}</header><div class="markdown-body">${renderMarkdown(record.description, 'Контекст пока не заполнен.')}</div></section>
      ${hasExecution ? `<section class="dossier-section"><header><div><p class="eyebrow">Контроль</p><h3>${record.type === 'question_set' ? 'Обсуждение и срок' : record.type === 'meeting' ? 'Организация встречи' : 'Исполнение'}</h3></div></header><div class="dossier-properties">
        ${dossierProperty(ownerLabel, record.ownerUsername, 'ownerId', canEdit)}
        ${dossierProperty('Статус', statusLabels[record.status] || record.status, record.type === 'question_set' ? '' : 'status', canEdit)}
        ${hasDeadline ? dossierProperty(dueLabel, deadline.label, 'dueAt', canEdit, deadline.className) : ''}
        ${hasPriority ? dossierProperty('Приоритет', priorityLabels[record.priority || 'normal'], 'priority', canEdit, `priority-${record.priority || 'normal'}`) : ''}
        ${hasEstimate ? dossierProperty('План', minutesLabel(record.estimateMinutes), 'estimateMinutes', canEdit) + dossierProperty('Факт', minutesLabel(record.actualMinutes), 'actualMinutes', canEdit) : ''}
        ${hasManualProgress ? dossierProperty('Прогресс', `${record.progress}%`, 'progress', canEdit) : ''}
        ${hasDecisionMaker ? dossierProperty('Принимает решение', record.decisionMakerUsername || 'Не указан', 'decisionMakerId', canEdit) : ''}
      </div>${record.progressNote ? `<div class="dossier-note"><span>Последнее обновление</span><p>${escapeHTML(record.progressNote)}</p></div>` : ''}</section>` : `<section class="dossier-section"><header><div><p class="eyebrow">Ответственность</p><h3>Владелец карточки</h3></div></header><div class="dossier-properties">${dossierProperty(ownerLabel, record.ownerUsername, 'ownerId', canEdit)}${dossierProperty('Статус', statusLabels[record.status] || record.status, 'status', canEdit)}</div></section>`}
      ${hasResult ? `<section class="dossier-section dossier-result"><header><div><p class="eyebrow">Результат</p><h3>${record.type === 'research' ? 'Вывод исследования' : record.type === 'decision' ? 'Принятое решение' : record.type === 'disagreement' ? 'Результат разбора' : 'Достигнутый результат'}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-edit-field="result" aria-label="Изменить результат" title="Изменить результат">${icon('edit')}</button>` : ''}</header><div class="markdown-body">${renderMarkdown(record.result, 'Результат ещё не зафиксирован.')}</div></section>` : ''}
      <section class="dossier-meta"><span>${escapeHTML(workstreamLabels[record.workstream || 'business'])}</span><span>${record.editPolicy === 'owner_only' ? 'Личная карточка' : 'Общая карточка'}</span><span>${record.isRoot ? 'Корень ветки' : record.parentId ? 'Есть родитель' : 'Без родителя'}</span><button type="button" data-edit-field="workstream" ${canEdit ? '' : 'disabled'}>${icon('settings')} Настроить</button></section>
    </article>
    <div class="record-read-actions">${canEdit ? `<button type="button" class="primary" data-open-record-edit>${icon('edit')} Редактировать</button>` : ''}<button type="button" class="secondary" id="notify-partners">${icon('bell')} Уведомить</button><button type="button" class="secondary ai-action" data-analyze-record>${icon('sparkles')} AI-разбор</button><details class="record-more-actions"><summary class="icon-button" aria-label="Другие действия">•••</summary><div>${record.type === 'task' ? `<button type="button" id="convert-to-questions">${icon('messages')} Сделать карточкой вопросов</button>` : ''}${canEdit ? `<button type="button" class="danger-text" id="archive-record">${icon('archive')} В архив</button>` : ''}</div></details></div>
    ${renderAIAnalysis(record, canEdit)}
    ${renderNextActions(record)}
    ${record.type === 'task' ? renderProofBlock(record, state.activeDetail.proofs) : ''}
  </div>`;
}

function renderRecordOverview(record, statuses) {
  const draft = loadRecordDraft(record.id);
  const language = {
    task: { description: 'Контекст и условия готовности', owner: 'Исполнитель' },
    goal: { description: 'Какой результат должен быть достигнут', owner: 'Владелец цели' },
    question_set: { description: 'Контекст обсуждения', owner: 'Координатор' },
    idea: { description: 'Краткая гипотеза или суть мысли', owner: 'Куратор' },
    criterion: { description: 'Что означает критерий и как его оценивать', owner: 'Владелец критерия' },
    research: { description: 'Исследовательский вопрос и ожидаемый вывод', owner: 'Исследователь' },
    decision: { description: 'Какой вопрос решаем и какие варианты рассмотрены', owner: 'Ответственный' },
    disagreement: { description: 'Предмет разногласия и контекст', owner: 'Координатор' },
    document: { description: 'Краткое содержание документа', owner: 'Владелец' },
    meeting: { description: 'Повестка, заметки и договорённости', owner: 'Организатор' },
  }[record.type];
  const hasDeadline = ['task', 'goal', 'question_set', 'research', 'decision', 'disagreement', 'meeting'].includes(record.type);
  const hasDecisionMaker = ['decision', 'disagreement'].includes(record.type);
  const hasPriority = isWorkRecord(record) || record.type === 'goal';
  const hasEstimate = isWorkRecord(record) || record.type === 'goal';
  const hasManualProgress = record.type !== 'question_set' && (isWorkRecord(record) || record.type === 'goal');
  const hasResult = ['task', 'goal', 'research', 'decision', 'disagreement'].includes(record.type);
  const planningTitle = record.type === 'task' ? 'Исполнение задачи' : record.type === 'question_set' ? 'Срок и приоритет обсуждения' : record.type === 'meeting' ? 'Организатор и время' : hasDecisionMaker ? 'Ответственность за решение' : hasDeadline ? 'Планирование' : 'Владелец карточки';
  const dueLabel = ({ meeting: 'Дата и время', research: 'Срок исследования', decision: 'Срок решения', disagreement: 'Срок разбора' })[record.type] || 'Срок';
  const planningGrid = hasDecisionMaker && hasDeadline ? 'three' : hasDeadline ? 'two' : 'one';
  const hasExecution = hasDeadline || hasDecisionMaker || hasPriority || hasEstimate || hasManualProgress || hasResult;
  const origin = state.activeDetail.derivation;
  const canEdit = record.editPolicy !== 'owner_only' || record.ownerId === state.me.id;
  const canManageAccess = record.ownerId === state.me.id;
  const parentOptions = state.records.filter((item) => item.id !== record.id && item.status !== 'archived').map((item) => `<option value="${item.id}" ${record.parentId === item.id ? 'selected' : ''}>${escapeHTML(typeMeta[item.type]?.singular || 'Карточка')}: ${escapeHTML(item.title)}</option>`).join('');
  if (!state.recordEditMode) {
    return renderRecordReadOverview(record, { language, hasDeadline, hasDecisionMaker, hasPriority, hasEstimate, hasManualProgress, hasResult, hasExecution, dueLabel, canEdit });
  }
  return `<div class="record-pane ${state.activeRecordTab === 'overview' ? 'active' : ''}" data-record-pane="overview">
    ${origin ? `<button type="button" class="origin-trace" data-related-record="${origin.sourceRecordId}"><span>${icon('link')}</span><span><small>Создано из совместного вывода</small><strong>${escapeHTML(origin.questionBody)}</strong><em>${escapeHTML(origin.decisionContent)}</em></span>${icon('chevronRight')}</button>` : ''}
    ${draft ? `<div class="draft-banner"><span><strong>Найден несохранённый черновик</strong><small>Можно восстановить текст или удалить черновик.</small></span><div><button type="button" class="secondary" data-restore-draft>Восстановить</button><button type="button" class="text-button" data-discard-draft>Удалить</button></div></div>` : ''}
    ${canEdit ? '' : `<div class="access-banner">${icon('lock')}<span><strong>Личная карточка ${escapeHTML(record.ownerUsername)}</strong><small>Вы можете просматривать её ход и связи, но изменять содержание может только ответственный.</small></span></div>`}
    ${renderHierarchyPanel(record)}
    <form id="record-edit-form" class="card-form record-overview-form" data-can-edit="${canEdit}">
      <div class="form-grid two"><label>Название<input name="title" value="${escapeHTML(record.title)}" required></label><label>${record.type === 'question_set' ? 'Статус рассчитывается автоматически' : 'Статус'}<select name="status" ${record.type === 'question_set' ? 'disabled' : ''}>${statuses.map((status) => `<option value="${status}" ${record.status === status ? 'selected' : ''}>${statusLabels[status]}</option>`).join('')}</select></label></div>
      ${markdownEditor('description', language.description, record.description, 5, 'Контекст, факты и ожидаемый результат')}
      ${hasExecution ? `<section class="execution-fields"><header><span>${icon(record.type === 'question_set' ? 'messages' : record.type === 'meeting' ? 'calendar' : 'checkSquare')}</span><div><h3>${planningTitle}</h3><p>${record.type === 'question_set' ? 'Карточка участвует в общей очереди наравне с задачами.' : 'Поля, по которым команда контролирует выполнение.'}</p></div></header>
        <div class="form-grid ${planningGrid}"><label>${language.owner}<select name="ownerId" ${canManageAccess ? '' : 'disabled'}>${userOptions(record.ownerId)}</select></label>${hasDecisionMaker ? `<label>Принимает решение<select name="decisionMakerId"><option value="">Не указан</option>${userOptions(record.decisionMakerId)}</select></label>` : ''}${hasDeadline ? `<label>${dueLabel}<input name="dueAt" type="datetime-local" value="${toLocalInput(record.dueAt)}"></label>` : ''}</div>
        ${(hasPriority || hasEstimate || hasManualProgress) ? `<div class="form-grid ${hasEstimate && hasManualProgress ? 'four' : 'three'}">${hasPriority ? `<label>Приоритет<select name="priority">${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${record.priority === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}${hasEstimate ? `<label>План, минут<input name="estimateMinutes" type="number" min="0" value="${record.estimateMinutes}"></label><label>Факт, минут<input name="actualMinutes" type="number" min="0" value="${record.actualMinutes || 0}"></label>` : ''}${hasManualProgress ? `<label>Прогресс, %<input name="progress" type="number" min="0" max="100" value="${record.progress}"></label>` : ''}</div>` : ''}
        ${hasManualProgress ? `<label>Текущее обновление<input name="progressNote" value="${escapeHTML(record.progressNote)}" placeholder="Что изменилось с прошлого раза"></label>` : ''}
        ${hasResult ? markdownEditor('result', record.type === 'research' ? 'Вывод исследования' : record.type === 'decision' ? 'Принятое решение' : record.type === 'disagreement' ? 'Результат разбора' : 'Достигнутый результат', record.result, 4, 'Зафиксируйте итог и основания') : ''}
        ${record.type === 'question_set' ? `<div class="derived-progress"><span>Прогресс обсуждения рассчитывается по принятым итогам</span><strong>${record.progress}%</strong></div>` : ''}
      </section>` : `<div class="form-grid one"><label>${language.owner}<select name="ownerId" ${canManageAccess ? '' : 'disabled'}>${userOptions(record.ownerId)}</select></label></div>`}
      <details class="form-more organization-fields"><summary>Доступ и место в проекте</summary><div class="form-more-body"><div class="form-grid three"><label>Направление<select name="workstream">${Object.entries(workstreamLabels).map(([value, label]) => `<option value="${value}" ${record.workstream === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Кто может изменять<select name="editPolicy" ${canManageAccess ? '' : 'disabled'}>${Object.entries(editPolicyLabels).map(([value, label]) => `<option value="${value}" ${record.editPolicy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Родительская карточка<select name="parentId"><option value="">Без родителя</option>${parentOptions}</select></label></div><label class="root-toggle"><input name="isRoot" type="checkbox" ${record.isRoot ? 'checked' : ''}> <span><strong>Сделать новым корнем</strong><small>Карточка станет самостоятельным началом новой крупной ветки и потеряет текущего родителя.</small></span></label></div></details>
      <label id="record-reason-field" class="reason-field" hidden>Причина изменения <input name="reason" placeholder="Почему изменился статус или срок"></label>
      <div class="form-actions record-form-actions"><button type="submit" class="primary">${icon('check')} Сохранить</button><button type="button" class="secondary" data-cancel-record-edit>Отмена</button><span class="form-save-state" id="record-save-state">Изменений нет</span></div>
    </form>
  </div>`;
}

async function loadResearchComparison(recordID, force = false) {
  if (!force && state.researchComparisons.has(recordID)) return state.researchComparisons.get(recordID);
  if (state.researchComparisonRequests.has(recordID)) return state.researchComparisonRequests.get(recordID);
  const request = api(`/api/records/${recordID}/research-comparison`).then((comparison) => {
    state.researchComparisons.set(recordID, comparison);
    return comparison;
  }).finally(() => state.researchComparisonRequests.delete(recordID));
  state.researchComparisonRequests.set(recordID, request);
  return request;
}

function renderResearchFieldValue(field, value) {
  if (!String(value || '').trim()) return '<span class="comparison-value-empty">Не указано</span>';
  if (field.fieldType === 'url' && /^https?:\/\//i.test(value)) return `<a href="${escapeHTML(value)}" target="_blank" rel="noopener noreferrer">${escapeHTML(value)}</a>`;
  if (field.fieldType === 'rating') return `<strong>${escapeHTML(value)} / 10</strong>`;
  return `<strong>${escapeHTML(value)}</strong>`;
}

function renderResearchOptionCard(option, fields, canEdit) {
  const metrics = fields.map((field) => `<div><span>${escapeHTML(field.name)}</span>${renderResearchFieldValue(field, option.values?.[field.id] || '')}</div>`).join('');
  return `<article class="research-option-card" data-research-option-card="${option.id}">
    <header><div><p class="eyebrow">Вариант ${option.sortOrder + 1}</p><h3>${escapeHTML(option.title)}</h3></div><div class="research-rating"><strong>${Number(option.rating).toLocaleString('ru-RU')}<small>/10</small></strong><progress max="10" value="${Number(option.rating)}"></progress></div></header>
    <div class="research-option-summary markdown-body">${renderMarkdown(option.summaryMd, 'Краткое описание пока не заполнено.')}</div>
    ${metrics ? `<section class="research-metrics">${metrics}</section>` : ''}
    <div class="research-arguments"><section class="research-pros"><h4>${icon('plus')} Плюсы</h4><div class="markdown-body">${renderMarkdown(option.prosMd, 'Плюсы пока не зафиксированы.')}</div></section><section class="research-cons"><h4>${icon('minus')} Минусы</h4><div class="markdown-body">${renderMarkdown(option.consMd, 'Минусы пока не зафиксированы.')}</div></section></div>
    ${option.notesMd ? `<section class="research-notes"><h4>Детали и оговорки</h4><div class="markdown-body">${renderMarkdown(option.notesMd)}</div></section>` : ''}
    <footer><span>Обновил ${escapeHTML(option.updatedByUsername)} · ${formatDate(option.updatedAt, true)}</span>${canEdit ? `<div><button type="button" class="text-button" data-edit-research-option="${option.id}">${icon('edit')} Изменить</button><button type="button" class="text-button danger-text" data-archive-research-option="${option.id}">${icon('archive')} В архив</button></div>` : ''}</footer>
  </article>`;
}

function researchValueInput(field, value) {
  const type = field.fieldType === 'url' ? 'url' : field.fieldType === 'number' || field.fieldType === 'rating' ? 'number' : 'text';
  const range = field.fieldType === 'rating' ? 'min="0" max="10" step="0.1"' : field.fieldType === 'number' ? 'step="any"' : '';
  return `<label>${escapeHTML(field.name)}<input name="field:${field.id}" type="${type}" ${range} value="${escapeHTML(value || '')}" placeholder="${field.fieldType === 'rating' ? '0–10' : ''}"></label>`;
}

function renderResearchOptionEditor(comparison) {
  const option = comparison.options.find((item) => item.id === state.activeResearchOptionId);
  const isNew = state.activeResearchOptionId === 'new';
  if (!isNew && !option) return '';
  return `<form id="research-option-form" class="research-option-editor" data-option-id="${escapeHTML(option?.id || '')}">
    <header><div><p class="eyebrow">${isNew ? 'Новый вариант' : 'Редактирование варианта'}</p><h3>${isNew ? 'Добавить сервер или другой вариант' : escapeHTML(option.title)}</h3></div><button type="button" class="icon-button" data-cancel-research-option aria-label="Закрыть">${icon('x')}</button></header>
    <div class="form-grid two"><label>Название<input name="title" required maxlength="160" value="${escapeHTML(option?.title || '')}" placeholder="Например: Timeweb Cloud"></label><label>Общая оценка, 0–10<input name="rating" type="number" min="0" max="10" step="0.1" value="${Number(option?.rating || 0)}"></label></div>
    ${comparison.fields.length ? `<div class="research-field-inputs">${comparison.fields.map((field) => researchValueInput(field, option?.values?.[field.id])).join('')}</div>` : ''}
    ${markdownEditor('summaryMd', 'Краткий вывод', option?.summaryMd || '', 4, 'Для чего подходит вариант и чем отличается', 'research-summary')}
    <div class="form-grid two markdown-columns">${markdownEditor('prosMd', 'Плюсы', option?.prosMd || '', 7, '- Сильная сторона\n- Ещё один плюс', 'research-pros')}${markdownEditor('consMd', 'Минусы', option?.consMd || '', 7, '- Ограничение\n- Возможный риск', 'research-cons')}</div>
    ${markdownEditor('notesMd', 'Детали, расчёты и примечания', option?.notesMd || '', 7, '## Конфигурация\n\n> **Примечание:** важная оговорка', 'research-notes')}
    ${isNew ? '' : '<label>Причина изменения (необязательно)<input name="reason" placeholder="Что уточнили или почему изменилась оценка"></label>'}
    <div class="form-actions"><button type="submit" class="primary">${icon('check')} ${isNew ? 'Добавить вариант' : 'Сохранить вариант'}</button><button type="button" class="secondary" data-cancel-research-option>Отмена</button></div>
  </form>`;
}

function renderResearchComparison(record, canEdit) {
  const comparison = state.researchComparisons.get(record.id);
  if (!comparison) return `<section class="research-comparison"><div class="relations-loading"><span class="spinner"></span><strong>Загружаем варианты</strong><small>Остальная карточка уже доступна.</small></div></section>`;
  const editing = canEdit && state.recordEditMode;
  return `<section class="research-comparison">
    <header class="research-comparison-header"><div><p class="eyebrow">Сравнение</p><h2>Рассмотренные варианты</h2><p>Каждый вариант хранит одинаковые параметры, отдельные плюсы, минусы и обоснованную оценку.</p></div>${editing ? `<button type="button" class="primary" data-new-research-option>${icon('plus')} Добавить вариант</button>` : ''}</header>
    ${editing ? `<div class="research-field-settings"><div><strong>Поля сравнения</strong><span>Добавьте характеристики, которые должны быть у всех вариантов.</span></div><div class="research-field-chips">${comparison.fields.map((field) => `<span>${escapeHTML(field.name)}<button type="button" data-archive-research-field="${field.id}" aria-label="Архивировать ${escapeHTML(field.name)}">${icon('x')}</button></span>`).join('') || '<em>Пока только общая оценка</em>'}</div><form id="research-field-form"><input name="name" required maxlength="80" placeholder="Например: Цена в месяц"><select name="fieldType"><option value="text">Текст</option><option value="number">Число</option><option value="url">Ссылка</option><option value="rating">Оценка 0–10</option></select><button type="submit" class="secondary">${icon('plus')} Поле</button></form></div>` : ''}
    ${editing && state.activeResearchOptionId ? renderResearchOptionEditor(comparison) : ''}
    <div class="research-option-deck">${comparison.options.map((option) => renderResearchOptionCard(option, comparison.fields, editing)).join('') || `<div class="guided-empty research-empty">${icon('flask')}<h3>Варианты ещё не добавлены</h3><p>${editing ? 'Создайте карточки Begget, Timeweb Cloud и других серверов. Затем заполните одни и те же параметры и сравните оценки.' : 'Исследователь ещё не добавил варианты для сравнения.'}</p>${editing ? `<button type="button" class="primary" data-new-research-option>${icon('plus')} Добавить первый вариант</button>` : ''}</div>`}</div>
  </section>`;
}

function renderSectionRead(section) {
  return `<article class="content-read-section"><header><div><h3>${escapeHTML(section.title)}</h3>${section.updatedByName ? `<small>Обновил ${escapeHTML(section.updatedByName)} · ${formatDate(section.updatedAt, true)}</small>` : ''}</div></header><div class="markdown-body">${renderMarkdown(section.content)}</div></article>`;
}

function renderRecordContent(detail) {
  const record = detail.record;
  const canEdit = record.editPolicy !== 'owner_only' || record.ownerId === state.me.id;
  const comparison = record.type === 'research' ? renderResearchComparison(record, canEdit) : '';
  const sections = state.recordEditMode
    ? `<section class="accordion-stack content-stack">${detail.sections.map(renderSection).join('')}<details class="accordion"><summary><span>Добавить свой раздел</span><small>Только для этой карточки</small></summary><form id="custom-section-form" class="inline-editor"><input name="title" placeholder="Название раздела" required>${markdownEditor('content', 'Содержание', '', 5, 'Факты, позиции и выводы', 'custom-section')}<button class="secondary" type="submit">Добавить раздел</button></form></details></section>`
    : `<section class="content-read-stack">${detail.sections.map(renderSectionRead).join('')}</section>`;
  return `<div class="record-pane ${state.activeRecordTab === 'content' ? 'active' : ''}" data-record-pane="content">${comparison}${sections}</div>`;
}

function renderQuestionWorkflow(detail) {
  const workflow = detail.questionWorkflow || { questions: [], userCount: state.users.length, answered: 0, expected: 0, resolved: 0 };
  const completion = workflow.questions.length ? Math.round(workflow.resolved * 100 / workflow.questions.length) : 0;
  return `<div class="record-pane ${state.activeRecordTab === 'questions' ? 'active' : ''}" data-record-pane="questions">
    <section class="question-summary"><div><p class="eyebrow">Совместная проработка</p><h3>${workflow.resolved} из ${workflow.questions.length} вопросов решено</h3><p>Каждый основатель отвечает отдельно. Итог можно выбрать из ответа или сформулировать заново.</p></div><div class="question-progress"><strong>${completion}%</strong><progress class="progress-track" max="100" value="${completion}"></progress><small>${workflow.answered} из ${workflow.expected} ответов</small></div></section>
    <section class="question-list">${workflow.questions.map((question, index) => renderQuestionItem(question, index, workflow.userCount)).join('') || `<div class="guided-empty">${icon('messages')}<h3>Добавьте первый список вопросов</h3><p>Вставьте несколько строк. Каждая строка станет отдельным вопросом внутри этой карточки.</p></div>`}</section>
    <details class="add-questions" ${workflow.questions.length ? '' : 'open'}><summary>${icon('plus')} Добавить вопросы</summary><form id="add-questions-form"><label>Один вопрос на строку<textarea name="questions" rows="5" placeholder="Как распределяем роли?&#10;Как принимаем спорные решения?&#10;Как часто сверяем цели?" required></textarea><small>Нумерацию можно вставлять вместе с текстом, система уберёт её автоматически.</small></label><button type="submit" class="primary">${icon('plus')} Добавить в карточку</button></form></details>
  </div>`;
}

function renderQuestionItem(question, index, userCount) {
  const allAnswered = question.answers.length >= userCount && userCount > 0;
  const answerByUser = new Map(question.answers.map((answer) => [answer.authorId, answer]));
  return `<article class="question-item ${question.decision ? 'resolved' : ''}" data-question-id-anchor="${question.id}">
    <header class="question-header"><span class="question-number">${index + 1}</span><div><h3>${escapeHTML(question.body)}</h3><p>${question.decision ? 'Совместный итог зафиксирован' : `${question.answers.length} из ${userCount} ответов готово`}</p></div><span class="status ${question.decision ? 'status-completed' : 'status-in_progress'}">${question.decision ? 'Решено' : 'Обсуждаем'}</span><button type="button" class="icon-button danger-icon" data-archive-question="${question.id}" title="Архивировать вопрос" aria-label="Архивировать вопрос">${icon('archive')}</button></header>
    <div class="answer-grid">${state.users.map((user) => renderFounderAnswer(question, user, answerByUser.get(user.id))).join('')}${state.users.length < 2 ? renderMissingFounder() : ''}</div>
    ${question.decision ? renderJointDecision(question) : allAnswered ? renderDecisionComposer(question) : `<div class="waiting-note">${icon('clock')} Итог станет доступен после ответов всех основателей.</div>`}
  </article>`;
}

function renderMissingFounder() {
  return `<section class="answer-panel missing-founder"><header><span class="avatar">?</span><span><strong>Второй основатель</strong><small>Аккаунт ещё не зарегистрирован</small></span></header><div class="answer-placeholder">После регистрации партнёр увидит этот вопрос в блоке «Ждут ответа».</div></section>`;
}

function renderFounderAnswer(question, user, answer) {
  const isMe = user.id === state.me.id;
  return `<section class="answer-panel ${answer ? 'answered' : ''}"><header><span class="avatar">${escapeHTML(user.username.slice(0, 2).toUpperCase())}</span><span><strong>${escapeHTML(user.username)}</strong><small>${answer ? `Ответ обновлён ${formatDate(answer.updatedAt, true)}` : 'Ответа пока нет'}</small></span>${answer ? `<span class="answer-ready">${icon('check')} Готово</span>` : ''}</header>${isMe ? `<form class="answer-form" data-question-answer="${question.id}"><textarea name="content" rows="5" placeholder="Ваш развёрнутый ответ" required>${escapeHTML(answer?.content || '')}</textarea><button type="submit" class="secondary">${icon('send')} ${answer ? 'Обновить ответ' : 'Отправить ответ'}</button></form>` : answer ? `<div class="answer-content">${escapeHTML(answer.content).replace(/\n/g, '<br>')}</div>` : `<div class="answer-placeholder">Ожидаем позицию партнёра</div>`}</section>`;
}

function renderJointDecision(question) {
  const source = question.decision.sourceAuthorUsername ? `Выбрано из ответа ${question.decision.sourceAuthorUsername}` : 'Сформулировано после обсуждения';
  const outputLabels = { preference: 'Критерий', limitation: 'Ограничение', rule: 'Правило', insight: 'Вывод', task: 'Задача', idea: 'Идея', research: 'Исследование', goal: 'Цель' };
  return `<section class="joint-decision"><span class="decision-icon">${icon('scale')}</span><div><p class="eyebrow">Совместный итог</p><blockquote>${escapeHTML(question.decision.content).replace(/\n/g, '<br>')}</blockquote><small>${escapeHTML(source)} · зафиксировал ${escapeHTML(question.decision.decidedByUsername)}</small>${question.outputs?.length ? `<div class="decision-outputs"><span>Уже используется:</span>${question.outputs.map((output) => `<button type="button" data-related-record="${output.recordId}">${escapeHTML(outputLabels[output.kind || output.type] || typeMeta[output.type]?.singular || 'Карточка')}: ${escapeHTML(output.title)}</button>`).join('')}</div>` : ''}</div><div class="decision-actions"><details class="output-menu"><summary>${icon('plus')} Использовать вывод</summary><div>${Object.entries(outputLabels).map(([kind, label]) => `<button type="button" data-create-output="${kind}" data-question-id="${question.id}">${escapeHTML(label)}</button>`).join('')}</div></details><details><summary>${icon('edit')} Изменить итог</summary>${renderDecisionComposer(question, true)}</details></div></section>`;
}

function renderDecisionComposer(question, compact = false) {
  return `<section class="decision-composer ${compact ? 'compact' : ''}"><div><p class="eyebrow">Зафиксировать совместное решение</p><h4>Выберите готовый ответ или напишите новый итог</h4></div><div class="decision-options">${question.answers.map((answer) => `<button type="button" class="answer-choice" data-select-answer="${answer.id}" data-question-id="${question.id}"><span class="avatar tiny">${escapeHTML(answer.authorUsername.slice(0, 2).toUpperCase())}</span><span><strong>Принять ответ ${escapeHTML(answer.authorUsername)}</strong><small>${escapeHTML(answer.content.slice(0, 120))}${answer.content.length > 120 ? '…' : ''}</small></span>${icon('chevronRight')}</button>`).join('')}</div><form class="custom-decision-form" data-custom-decision="${question.id}"><textarea name="content" rows="4" placeholder="Новая совместная формулировка после обсуждения" required>${compact && question.decision && !question.decision.sourceAnswerId ? escapeHTML(question.decision.content) : ''}</textarea><button type="submit" class="primary">${icon('check')} Сохранить общий итог</button></form></section>`;
}

function renderRecordRelations(record, detail, criteria, targets) {
  const content = detail.relationsLoaded
    ? `<section class="accordion-stack content-stack">${record.type === 'idea' ? renderCriteriaBlock(criteria, detail.scores, true) : ''}${record.type === 'research' ? renderResearchStructuralRelations(detail.researchOptions || []) : ''}${renderLinksBlock(record, detail.links, targets, true)}</section>`
    : `<div class="relations-loading"><span class="spinner"></span><strong>Подготавливаем связи</strong><small>Основная карточка уже доступна, эта часть загружается отдельно.</small></div>`;
  return `<div class="record-pane ${state.activeRecordTab === 'relations' ? 'active' : ''}" data-record-pane="relations">${content}</div>`;
}

function renderResearchStructuralRelations(options) {
  return `<section class="structural-relations"><header><div><p class="eyebrow">Внутри исследования</p><h3>Варианты сравнения</h3></div><strong>${options.length}</strong></header><p>Это самостоятельные сущности исследования. Они участвуют в поиске и карте связей, но не смешиваются с внешними карточками проекта.</p><div>${options.map((option) => `<button type="button" data-open-research-option="${option.id}"><span class="type-icon type-research">${icon('flask')}</span><span><strong>${escapeHTML(option.title)}</strong><small>Оценка ${Number(option.rating).toLocaleString('ru-RU')} из 10</small></span>${icon('chevronRight')}</button>`).join('') || `<div class="structural-empty">Варианты появятся здесь после добавления в разделе «Содержание».</div>`}</div></section>`;
}

function renderRecordHistory(activity) {
  return `<div class="record-pane ${state.activeRecordTab === 'history' ? 'active' : ''}" data-record-pane="history"><section class="history-pane"><div class="section-heading"><div><p class="eyebrow">Аудит карточки</p><h3>${activity.length} событий</h3></div></div><div class="activity-list">${activity.map(renderActivityItem).join('') || emptyState('Изменений пока нет.')}</div></section></div>`;
}

function recordActivity(detail) {
  return detail.activityLoaded ? detail.activity : state.activity.filter((item) => item.entityId === detail.record.id);
}

function renderRecordContextStrip(record) {
  const hasDeadline = ['task', 'goal', 'question_set', 'research', 'decision', 'disagreement', 'meeting'].includes(record.type);
  return `<div class="record-context-strip"><span><small>Ответственный</small><strong>${escapeHTML(record.ownerUsername)}</strong></span><span><small>Статус</small><strong>${escapeHTML(statusLabels[record.status] || record.status)}</strong></span>${isWorkRecord(record) || record.type === 'goal' ? `<span><small>Приоритет</small><strong>${escapeHTML(priorityLabels[record.priority || 'normal'])}</strong></span>` : ''}${hasDeadline ? `<span><small>${record.type === 'meeting' ? 'Дата' : 'Срок'}</small><strong class="deadline ${deadlineState(record).className}">${escapeHTML(deadlineState(record).label)}</strong></span>` : ''}</div>`;
}

function renderRecordDialog() {
  const detail = state.activeDetail;
  const record = detail.record;
  const statuses = [...(statusesByType[record.type] || statusesByType.default)];
  if (!statuses.includes(record.status)) statuses.push(record.status);
  const allLinkTargets = state.records.filter((item) => item.id !== record.id && item.status !== 'archived');
  const criteria = state.records.filter((item) => item.type === 'criterion' && item.status !== 'archived');
  const activity = recordActivity(detail);
  const hasDeadline = ['task', 'goal', 'question_set', 'research', 'decision', 'disagreement', 'meeting'].includes(record.type);
  const canEdit = record.editPolicy !== 'owner_only' || record.ownerId === state.me.id;
  const parent = record.parentId ? state.records.find((item) => item.id === record.parentId) : null;
  const children = state.records.filter((item) => item.parentId === record.id && item.status !== 'archived');
  const ideaActions = record.type === 'idea' ? `<div class="idea-actions">${['review', 'main', 'rejected'].map((status) => `<button type="button" class="stage-action ${status}" data-stage="${status}" ${record.status === status || !canEdit ? 'disabled' : ''}>${statusLabels[status]}</button>`).join('')}</div>` : '';
  $('#record-dialog-content').innerHTML = `
    <div class="record-shell record-type-${record.type} ${state.recordWorkspace.length > 1 ? 'has-workspace' : ''}">
    ${renderRecordWorkspace()}
    <div class="dialog-header record-dialog-header"><div><span class="record-kind">${icon(typeMeta[record.type].icon)} ${typeMeta[record.type].singular}</span><h2>${escapeHTML(record.title)}</h2><p>Создал ${escapeHTML(record.authorUsername)} · ${formatDate(record.createdAt, true)}</p></div><div class="record-header-actions">${canEdit && !state.recordEditMode ? `<button type="button" class="secondary record-header-edit" data-open-record-edit>${icon('edit')} Редактировать</button>` : ''}<button type="button" class="icon-button" data-record-graph="${record.id}" title="Открыть локальную карту" aria-label="Открыть локальную карту">${icon('network')}</button><button type="button" class="close-button icon-button" data-close-dialog aria-label="Закрыть">${icon('x')}</button></div></div>
    ${ideaActions}
    <nav class="record-tabs" aria-label="Разделы карточки">${recordTabs(record, detail, activity)}</nav>
    ${renderRecordContextStrip(record)}
    <div class="dialog-layout">
      <div class="dialog-main">
        ${record.type === 'question_set' ? renderQuestionWorkflow(detail) : ''}
        ${renderRecordOverview(record, statuses)}
        ${renderRecordContent(detail)}
        ${renderRecordRelations(record, detail, criteria, allLinkTargets)}
        ${renderRecordHistory(activity)}
      </div>
      <aside class="dialog-aside">
        <div class="fact"><span>${record.type === 'question_set' ? 'Координатор' : record.type === 'meeting' ? 'Организатор' : 'Ответственный'}</span><strong>${escapeHTML(record.ownerUsername)}</strong></div>
        <div class="fact"><span>Статус</span><strong>${escapeHTML(statusLabels[record.status])}</strong></div>
        <div class="fact"><span>Направление</span><strong class="workstream-mark workstream-${record.workstream || 'business'}">${escapeHTML(workstreamLabels[record.workstream || 'business'])}</strong></div>
        <div class="fact"><span>Доступ</span><strong>${record.editPolicy === 'owner_only' ? `${icon('lock')} Только владелец` : 'Общая карточка'}</strong></div>
        ${record.isRoot ? `<div class="fact"><span>Иерархия</span><strong>Новый корень</strong></div>` : parent ? `<button type="button" class="fact fact-link" data-related-record="${parent.id}"><span>Родитель</span><strong>${escapeHTML(parent.title)}</strong></button>` : ''}
        ${children.length ? `<div class="fact"><span>Дочерних карточек</span><strong>${children.length}</strong></div>` : ''}
        ${hasDeadline ? `<div class="fact"><span>${record.type === 'meeting' ? 'Дата' : 'Срок'}</span><strong class="deadline ${deadlineState(record).className}">${escapeHTML(deadlineState(record).label)}</strong></div>` : ''}
        <div class="fact"><span>Изменено</span><strong>${formatDate(record.updatedAt, true)}</strong></div>
        ${record.type === 'task' ? `<div class="fact"><span>Доказательств</span><strong>${record.proofCount}</strong></div>` : ''}
        ${record.type === 'question_set' ? `<div class="fact"><span>Решено вопросов</span><strong>${detail.questionWorkflow.resolved} / ${detail.questionWorkflow.questions.length}</strong></div>` : ''}
      </aside>
    </div></div>`;
  bindRecordDialogEvents();
  applyRecordAccess(record, canEdit);
  bindRecordWorkspace();
  $$('[data-record-graph]').forEach((button) => button.addEventListener('click', () => openGraphForRecord(record.id)));
  if (record.type === 'research' && state.activeRecordTab === 'content' && !state.researchComparisons.has(record.id) && !state.researchComparisonRequests.has(record.id)) {
    loadResearchComparison(record.id).then(() => {
      if (state.activeDetail?.record.id === record.id && state.activeRecordTab === 'content') renderRecordDialog();
    }).catch((error) => toast(error.message, true));
  }
  if (state.focusQuestionId) {
    requestAnimationFrame(() => {
      const question = $(`[data-question-id-anchor="${CSS.escape(state.focusQuestionId)}"]`);
      question?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      question?.classList.add('question-focus');
      state.focusQuestionId = '';
    });
  }
}

function applyRecordAccess(record, canEdit) {
  const root = $('#record-dialog');
  root.classList.remove('record-readonly');
  if (canEdit) return;
  const mutationSelectors = ['#record-edit-form input', '#record-edit-form select', '#record-edit-form textarea', '#record-edit-form button', '.section-form input', '.section-form textarea', '.section-form button', '#custom-section-form input', '#custom-section-form textarea', '#custom-section-form button', '.criterion-form input', '.criterion-form button', '#link-form select', '#link-form button', '[data-remove-link]', '[data-create-linked]', '[data-create-from-record]', '[data-ai-link]', '[data-ai-apply-plan]', '[data-ai-create-next]', '[data-ai-output-index]', '[data-open-record-edit]', '[data-edit-field]', '#add-questions-form textarea', '#add-questions-form button', '[data-select-answer]', '[data-custom-decision] textarea', '[data-custom-decision] button', '[data-create-output]', '[data-archive-question]', '[data-new-research-option]', '[data-edit-research-option]', '[data-archive-research-option]', '[data-archive-research-field]', '#research-option-form input', '#research-option-form textarea', '#research-option-form button', '#research-field-form input', '#research-field-form select', '#research-field-form button', '#notify-partners', '#archive-record', '#convert-to-questions'];
  $$(mutationSelectors.join(','), root).forEach((node) => { node.disabled = true; node.setAttribute('aria-disabled', 'true'); });
  root.classList.add('record-readonly');
}

function userOptions(selected) {
  return state.users.map((user) => `<option value="${user.id}" ${Number(selected) === user.id ? 'selected' : ''}>${escapeHTML(user.username)}</option>`).join('');
}

function renderSection(section) {
  return `<details class="accordion"><summary><span>${escapeHTML(section.title)}</span><small>${section.content ? 'Заполнено' : 'Не заполнено'}</small></summary><form class="section-form inline-editor" data-section-id="${escapeHTML(section.id)}" data-definition-id="${escapeHTML(section.definitionId || '')}"><label>Название<input name="title" value="${escapeHTML(section.title)}" ${section.definitionId ? 'readonly' : ''}></label>${markdownEditor('content', 'Содержание', section.content, 7, 'Запишите факты, позиции и выводы', `section-${section.id || section.definitionId || 'new'}`)}<label>Причина изменения (необязательно)<input name="reason" placeholder="Что уточнили и почему"></label><button class="secondary" type="submit">Сохранить раздел</button></form></details>`;
}

function renderCriteriaBlock(criteria, scores, open = false) {
  const scoreMap = new Map(scores.map((score) => [score.criterionId, score]));
  const kindLabels = { preference: 'Критерий', limitation: 'Ограничение' };
  return `<details class="accordion" ${open ? 'open' : ''}><summary><span>Оценка по критериям</span><small>${scores.length} оценок · 0 не подходит, 10 полностью подходит</small></summary><div class="criteria-list">${criteria.map((criterion) => { const current = scoreMap.get(criterion.id); return `<form class="criterion-form" data-criterion-id="${criterion.id}"><div><span class="criterion-kind">${kindLabels[criterion.kind] || 'Критерий'}</span><strong>${escapeHTML(criterion.title)}</strong><small>${escapeHTML(criterion.description)}</small></div><input name="score" type="number" min="0" max="10" value="${current?.score ?? 0}" aria-label="Оценка соответствия от 0 до 10"><input name="note" value="${escapeHTML(current?.note || '')}" placeholder="Почему такая оценка"><button class="secondary" type="submit">Оценить</button></form>`; }).join('') || emptyState('Сначала зафиксируйте критерии в разделе «Правила и критерии».')}</div></details>`;
}

function renderLinksBlock(record, links, targets, open = false) {
  const relationLabel = (link) => {
    const outgoing = link.sourceId === record.id;
    const labels = {
      related: ['Связано', 'Связано'], supports: ['Поддерживает', 'Поддерживается'],
      depends_on: ['Зависит от', 'Нужно для'], result_of: ['Является результатом', 'Дало результат'],
      leads_to: ['Приводит к', 'Следует из'], produced: ['Породило', 'Создано из'],
    };
    return (labels[link.relationType] || [link.relationType, link.relationType])[outgoing ? 0 : 1];
  };
  const createOptions = nextRecordOptions(record);
  return `<details class="accordion" ${open ? 'open' : ''}><summary><span>Внешние связи</span><small>${links.length} связей с карточками</small></summary>${createOptions.length ? `<div class="linked-create"><span>Создать следующий объект</span>${createOptions.map(([type, kind, label]) => `<button type="button" data-create-linked="${type}" data-linked-kind="${kind}">${icon(typeMeta[type].icon)} ${label}</button>`).join('')}</div>` : ''}<div class="linked-list">${links.map((link) => `<div class="linked-item"><button type="button" data-related-record="${link.record.id}"><i class="type-icon type-${link.record.type}">${icon(typeMeta[link.record.type].icon)}</i><span><strong>${escapeHTML(link.record.title)}</strong><small>${escapeHTML(relationLabel(link))} · ${typeMeta[link.record.type].singular}</small></span></button><button type="button" class="icon-button danger-icon remove-link" data-remove-link="${link.id}" aria-label="Убрать связь" title="Убрать связь">${icon('x')}</button></div>`).join('') || emptyState('Явных связей с другими карточками пока нет.')}</div><form id="link-form" class="link-form"><select name="targetId" required><option value="">Выберите существующую карточку</option>${targets.map((target) => `<option value="${target.id}">${typeMeta[target.type].singular}: ${escapeHTML(target.title)}</option>`).join('')}</select><select name="relationType"><option value="related">Связано</option><option value="supports">Поддерживает</option><option value="depends_on">Зависит от</option><option value="result_of">Является результатом</option><option value="leads_to">Приводит к</option></select><button class="secondary" type="submit">${icon('link')} Связать</button></form></details>`;
}

function renderProofBlock(record, proofs) {
  const canComplete = record.ownerId === state.me.id || record.editPolicy === 'shared';
  return `<details class="accordion" open><summary><span>Подтверждение результата</span><small>${proofs.length} приложено</small></summary><div class="proof-list">${proofs.map((proof) => `<article class="proof"><header><strong>${escapeHTML(proof.authorUsername)}</strong><time>${formatDate(proof.createdAt, true)}</time></header>${proof.kind === 'link' && /^https?:\/\//i.test(proof.content) ? `<a href="${escapeHTML(proof.content)}" target="_blank" rel="noreferrer">${escapeHTML(proof.content)}</a>` : `<p>${escapeHTML(proof.content).replace(/\n/g, '<br>')}</p>`}</article>`).join('') || emptyState('Перед завершением приложите результат или ссылку на него.')}</div>${canComplete ? `<form id="proof-form" class="proof-form"><select name="kind"><option value="text">Текст</option><option value="link">Ссылка</option></select><textarea name="content" rows="4" placeholder="Что сделано или где находится результат" required></textarea><button class="secondary" type="submit">Приложить</button></form><div class="completion-box"><label>Краткий итог<textarea id="completion-result" rows="3" placeholder="Что получили в результате"></textarea></label><label class="check"><input id="notify-on-complete" type="checkbox" checked> Уведомить партнёра</label><button type="button" class="success" id="complete-task" ${proofs.length ? '' : 'disabled'}>Завершить задачу</button></div>` : ''}</details>`;
}

function buildRecordUpdate(form, record) {
  const values = recordFormValues(form);
  const body = { expectedUpdatedAt: record.updatedAt };
  const compare = (key, next, previous) => { if (String(next ?? '') !== String(previous ?? '')) body[key] = next; };
  compare('title', values.title.trim(), record.title);
  compare('description', values.description.trim(), record.description);
  if ('status' in values) compare('status', values.status, record.status);
  if ('ownerId' in values) compare('ownerId', Number(values.ownerId), record.ownerId);
  if ('decisionMakerId' in values) {
    if (values.decisionMakerId) compare('decisionMakerId', Number(values.decisionMakerId), record.decisionMakerId);
    else if (record.decisionMakerId) body.clearDecisionMaker = true;
  }
  if ('dueAt' in values) {
    const dueISO = values.dueAt ? new Date(values.dueAt).toISOString() : '';
    if (normalizedInstant(dueISO) !== normalizedInstant(record.dueAt)) body.dueAt = dueISO;
  }
  if ('priority' in values) compare('priority', values.priority, record.priority || 'normal');
  if ('workstream' in values) compare('workstream', values.workstream, record.workstream || 'business');
  if ('editPolicy' in values) compare('editPolicy', values.editPolicy, record.editPolicy || 'shared');
  if ('parentId' in values) compare('parentId', values.parentId, record.parentId || '');
  if (form.elements.isRoot) compare('isRoot', form.elements.isRoot.checked, Boolean(record.isRoot));
  if ('estimateMinutes' in values) compare('estimateMinutes', Number(values.estimateMinutes), record.estimateMinutes);
  if ('actualMinutes' in values) compare('actualMinutes', Number(values.actualMinutes), record.actualMinutes || 0);
  if ('progress' in values) compare('progress', Number(values.progress), record.progress);
  if ('progressNote' in values) compare('progressNote', values.progressNote.trim(), record.progressNote);
  if ('result' in values) compare('result', values.result.trim(), record.result);
  const substantiveKeys = Object.keys(body).filter((key) => key !== 'expectedUpdatedAt');
  const reasonRequired = Object.prototype.hasOwnProperty.call(body, 'status') || Object.prototype.hasOwnProperty.call(body, 'dueAt');
  if (reasonRequired) body.reason = values.reason.trim();
  return { body, substantiveKeys, reasonRequired, values };
}

function updateRecordFormState(form, record, persist = false) {
  const { substantiveKeys, reasonRequired, values } = buildRecordUpdate(form, record);
  const reasonField = $('#record-reason-field');
  if (reasonField) {
    reasonField.hidden = !reasonRequired;
    reasonField.querySelector('input').required = reasonRequired;
  }
  const status = $('#record-save-state');
  if (status) status.textContent = substantiveKeys.length ? 'Есть несохранённые изменения' : 'Изменений нет';
  form.classList.toggle('dirty', substantiveKeys.length > 0);
  if (persist && substantiveKeys.length) saveRecordDraft(record.id, values);
  if (persist && !substantiveKeys.length) clearRecordDraft(record.id);
}

function bindRecordDialogEvents() {
  const detail = state.activeDetail;
  const record = detail.record;
  $('[data-close-dialog]').addEventListener('click', () => $('#record-dialog').close());
  $$('[data-record-tab]').forEach((button) => button.addEventListener('click', async () => {
    state.activeRecordTab = button.dataset.recordTab;
    $$('.record-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.recordTab === state.activeRecordTab));
    $$('[data-record-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.recordPane === state.activeRecordTab));
    if (state.activeRecordTab === 'relations' && !state.activeDetail.relationsLoaded) await loadRecordRelations(record.id);
    if (state.activeRecordTab === 'history' && !state.activeDetail.activityLoaded) await loadRecordActivity(record.id);
    if (state.activeRecordTab === 'content' && record.type === 'research' && !state.researchComparisons.has(record.id)) {
      try {
        await loadResearchComparison(record.id);
        if (state.activeDetail?.record.id === record.id && state.activeRecordTab === 'content') renderRecordDialog();
      } catch (error) { toast(error.message, true); }
    }
  }));
  const startEditing = (field = '') => {
    state.recordEditMode = true;
    renderRecordDialog();
    requestAnimationFrame(() => {
      if (state.activeRecordTab === 'content') {
        ($('[data-new-research-option]') || $('.accordion summary', $('#record-dialog')))?.focus();
        return;
      }
      const form = $('#record-edit-form');
      const input = field ? form?.elements.namedItem(field) : form?.elements.namedItem('title');
      if (!input) return;
      const trigger = input.closest('.custom-select')?.querySelector('.custom-select-trigger');
      (trigger || input).focus();
      if (typeof input.select === 'function' && !trigger) input.select();
    });
  };
  $$('[data-open-record-edit]').forEach((button) => button.addEventListener('click', () => startEditing()));
  $$('[data-edit-field]').forEach((button) => button.addEventListener('click', () => startEditing(button.dataset.editField)));
  const editForm = $('#record-edit-form');
  if (editForm) {
    const rootToggle = editForm.elements.isRoot;
    const parentSelect = editForm.elements.parentId;
    rootToggle?.addEventListener('change', () => {
      if (rootToggle.checked && parentSelect) { parentSelect.value = ''; syncCustomSelect(parentSelect); }
    });
    parentSelect?.addEventListener('change', () => {
      if (parentSelect.value && rootToggle) rootToggle.checked = false;
    });
    editForm.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        editForm.requestSubmit();
      }
    });
    editForm.addEventListener('input', () => updateRecordFormState(editForm, record, true));
    editForm.addEventListener('change', () => updateRecordFormState(editForm, record, true));
    $('[data-restore-draft]')?.addEventListener('click', () => {
      applyRecordDraft(editForm, loadRecordDraft(record.id));
      $('[data-restore-draft]').closest('.draft-banner').remove();
      toast('Черновик восстановлен');
    });
    $('[data-cancel-record-edit]')?.addEventListener('click', () => { state.recordEditMode = false; renderRecordDialog(); });
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { body, substantiveKeys, reasonRequired } = buildRecordUpdate(event.currentTarget, record);
      if (!substantiveKeys.length) return toast('Изменений нет');
      if (reasonRequired && !body.reason) {
        $('#record-reason-field').hidden = false;
        event.currentTarget.elements.reason.focus();
        return toast('Укажите причину изменения статуса или срока', true);
      }
      await mutateRecord(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify(body) }, false, true);
    });
  }
  $('[data-discard-draft]')?.addEventListener('click', () => {
    clearRecordDraft(record.id);
    $('[data-discard-draft]').closest('.draft-banner').remove();
    toast('Черновик удалён');
  });
  $('[data-analyze-record]')?.addEventListener('click', async () => {
    state.aiAnalysisLoading = record.id;
    renderRecordDialog();
    try {
      const analysis = await api(`/api/records/${record.id}/ai-analysis`, { method: 'POST' });
      state.aiAnalyses.set(record.id, analysis);
      toast(analysis.source === 'groq' ? 'AI-разбор готов' : 'Локальный разбор готов');
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.aiAnalysisLoading = '';
      if (state.activeDetail?.record.id === record.id) renderRecordDialog();
    }
  });
  $('[data-ai-apply-plan]')?.addEventListener('click', async () => {
    const analysis = state.aiAnalyses.get(record.id);
    if (!analysis) return;
    const body = { expectedUpdatedAt: record.updatedAt };
    if (analysis.priority !== record.priority) body.priority = analysis.priority;
    if (analysis.estimateMinutes !== record.estimateMinutes) body.estimateMinutes = analysis.estimateMinutes;
    await mutateRecord(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify(body) });
  });
  $('[data-ai-create-next]')?.addEventListener('click', () => {
    const analysis = state.aiAnalyses.get(record.id);
    if (!analysis) return;
    openCreateDialog('task', { title: analysis.nextAction, description: `Следующий шаг по карточке «${record.title}».\n\n${analysis.nextAction}`, sourceRecordId: record.id, relationType: 'leads_to', reason: 'Следующий шаг предложен AI и подтверждён пользователем', priority: analysis.priority, estimateMinutes: analysis.estimateMinutes });
  });
  $$('[data-ai-link]').forEach((button) => button.addEventListener('click', async () => {
    await mutateDetail(`/api/records/${record.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: button.dataset.aiLink, relationType: button.dataset.aiRelation }) });
  }));
  $$('[data-ai-output-index]').forEach((button) => button.addEventListener('click', () => {
    const output = state.aiAnalyses.get(record.id)?.suggestedOutputs?.[Number(button.dataset.aiOutputIndex)];
    if (!output) return;
    openCreateDialog(output.type, { kind: output.kind, title: output.title, description: output.description, priority: output.priority, estimateMinutes: output.estimateMinutes, sourceRecordId: record.id, relationType: 'produced', reason: 'Сущность извлечена AI из карточки и подтверждена пользователем' });
  }));
  $$('[data-stage]').forEach((button) => button.addEventListener('click', async () => {
    const reason = await askText({ title: 'Причина решения', label: `Почему идея переходит в статус «${statusLabels[button.dataset.stage]}»?`, required: true });
    if (reason === null) return;
    await mutateRecord(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.stage, reason, expectedUpdatedAt: record.updatedAt }) });
  }));
  $('#notify-partners')?.addEventListener('click', async () => {
    const message = await askText({ title: 'Уведомить партнёра', label: 'Сообщение', defaultValue: `Посмотри карточку «${record.title}»`, required: true });
    if (message === null) return;
    try { await api(`/api/records/${record.id}/notify`, { method: 'POST', body: JSON.stringify({ message }) }); toast('Уведомление отправлено'); await loadData(true); } catch (error) { toast(error.message, true); }
  });
  $('#archive-record')?.addEventListener('click', async () => {
    const reason = await askText({ title: 'Перенести в архив', label: 'Почему карточка больше не активна?', required: true });
    if (!reason) return;
    await mutateRecord(`/api/records/${record.id}/archive`, { method: 'POST', body: JSON.stringify({ reason }) }, true);
  });
  $('#convert-to-questions')?.addEventListener('click', async () => {
    const reason = await askText({ title: 'Преобразовать карточку', label: 'Почему эта запись должна стать карточкой вопросов?', defaultValue: 'Задача изначально создана для совместной проработки списка вопросов', required: true });
    if (!reason) return;
    state.activeRecordTab = 'questions';
    const converted = await mutateRecord(`/api/records/${record.id}/convert-to-questions`, { method: 'POST', body: JSON.stringify({ reason, expectedUpdatedAt: record.updatedAt }) });
    if (converted) toast('Карточка преобразована. Теперь добавьте вопросы по одному на строку');
    else state.activeRecordTab = 'overview';
  });
  $$('.section-form').forEach((formNode) => formNode.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutateDetail(`/api/records/${record.id}/sections`, { method: 'POST', body: JSON.stringify({ sectionId: event.currentTarget.dataset.sectionId, definitionId: event.currentTarget.dataset.definitionId || null, title: form.get('title'), content: form.get('content'), reason: form.get('reason') }) });
  }));
  $('#custom-section-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutateDetail(`/api/records/${record.id}/sections`, { method: 'POST', body: JSON.stringify({ title: form.get('title'), content: form.get('content') }) }); });
  $$('[data-new-research-option]').forEach((button) => button.addEventListener('click', () => { state.activeResearchOptionId = 'new'; renderRecordDialog(); requestAnimationFrame(() => $('#research-option-form input[name="title"]')?.focus()); }));
  $$('[data-edit-research-option]').forEach((button) => button.addEventListener('click', () => { state.activeResearchOptionId = button.dataset.editResearchOption; renderRecordDialog(); requestAnimationFrame(() => $('#research-option-form input[name="title"]')?.focus()); }));
  $$('[data-cancel-research-option]').forEach((button) => button.addEventListener('click', () => { state.activeResearchOptionId = ''; renderRecordDialog(); }));
  $('#research-option-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const comparison = state.researchComparisons.get(record.id);
    const optionID = event.currentTarget.dataset.optionId;
    const option = comparison?.options.find((item) => item.id === optionID);
    const values = {};
    comparison?.fields.forEach((field) => { values[field.id] = String(form.get(`field:${field.id}`) || ''); });
    const body = { title: form.get('title'), rating: Number(form.get('rating') || 0), summaryMd: form.get('summaryMd'), prosMd: form.get('prosMd'), consMd: form.get('consMd'), notesMd: form.get('notesMd'), reason: form.get('reason') || '', expectedUpdatedAt: option?.updatedAt || '', values };
    await mutateResearchComparison(record.id, optionID ? `/api/records/${record.id}/research-options/${optionID}` : `/api/records/${record.id}/research-options`, { method: optionID ? 'PATCH' : 'POST', body: JSON.stringify(body) }, optionID ? 'Вариант обновлён' : 'Вариант добавлен');
  });
  $('#research-field-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutateResearchComparison(record.id, `/api/records/${record.id}/research-fields`, { method: 'POST', body: JSON.stringify({ name: form.get('name'), fieldType: form.get('fieldType') }) }, 'Поле сравнения добавлено');
  });
  $$('[data-archive-research-option]').forEach((button) => button.addEventListener('click', async () => {
    const reason = await askText({ title: 'Архивировать вариант', label: 'Почему этот вариант больше не рассматривается?', required: true });
    if (!reason) return;
    await mutateResearchComparison(record.id, `/api/records/${record.id}/research-options/${button.dataset.archiveResearchOption}/archive`, { method: 'POST', body: JSON.stringify({ reason }) }, 'Вариант перенесён в архив');
  }));
  $$('[data-archive-research-field]').forEach((button) => button.addEventListener('click', async () => {
    const reason = await askText({ title: 'Архивировать поле', label: 'Почему параметр больше не нужен для сравнения?', required: true });
    if (!reason) return;
    await mutateResearchComparison(record.id, `/api/records/${record.id}/research-fields/${button.dataset.archiveResearchField}/archive`, { method: 'POST', body: JSON.stringify({ reason }) }, 'Поле сравнения архивировано');
  }));
  $$('.criterion-form').forEach((formNode) => formNode.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutateDetail(`/api/records/${record.id}/criteria/${event.currentTarget.dataset.criterionId}`, { method: 'PUT', body: JSON.stringify({ score: Number(form.get('score')), note: form.get('note'), reason: '' }) }); }));
  $('#link-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutateDetail(`/api/records/${record.id}/links`, { method: 'POST', body: JSON.stringify({ targetId: form.get('targetId'), relationType: form.get('relationType') }) }); });
  $$('[data-remove-link]').forEach((button) => button.addEventListener('click', async () => { const reason = await askText({ title: 'Убрать связь', label: 'Почему связь больше не актуальна?', required: true }); if (!reason) return; await mutateDetail(`/api/records/${record.id}/links/${button.dataset.removeLink}/remove`, { method: 'POST', body: JSON.stringify({ reason }) }); }));
  $$('[data-related-record]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.relatedRecord, { workspace: true })));
  $$('[data-open-research-option]').forEach((button) => button.addEventListener('click', async () => {
    const optionID = button.dataset.openResearchOption;
    state.activeRecordTab = 'content';
    try {
      await loadResearchComparison(record.id);
      if (state.activeDetail?.record.id !== record.id) return;
      renderRecordDialog();
      requestAnimationFrame(() => {
        const option = $(`[data-research-option-card="${CSS.escape(optionID)}"]`, $('#record-dialog'));
        option?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
        option?.classList.add('is-linked-focus');
        setTimeout(() => option?.classList.remove('is-linked-focus'), 1600);
      });
    } catch (error) { toast(error.message, true); }
  }));
  $$('[data-create-from-record]').forEach((button) => button.addEventListener('click', () => {
    const requested = button.dataset.createFromRecord;
    const type = requested === 'limitation' ? 'criterion' : requested;
    openCreateDialog(type, { kind: requested === 'limitation' ? 'limitation' : '', description: `Источник: встреча «${record.title}»\n\n${record.description}`.trim(), sourceRecordId: record.id, relationType: 'produced', reason: 'Создано из заметок встречи' });
  }));
  $$('[data-create-linked]').forEach((button) => button.addEventListener('click', () => {
    openCreateDialog(button.dataset.createLinked, { kind: button.dataset.linkedKind, sourceRecordId: record.id, relationType: 'leads_to', reason: `Следующий объект создан из карточки «${record.title}»` });
  }));
  $$('[data-open-event]', $('#record-dialog')).forEach((button) => button.addEventListener('click', () => openActivity(button.dataset.openEvent)));
  $('#add-questions-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutateDetail(`/api/records/${record.id}/questions`, { method: 'POST', body: JSON.stringify({ questions: form.get('questions') }) });
  });
  $$('[data-question-answer]').forEach((formNode) => formNode.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutateDetail(`/api/records/${record.id}/questions/${event.currentTarget.dataset.questionAnswer}/answer`, { method: 'PUT', body: JSON.stringify({ content: form.get('content') }) });
  }));
  $$('[data-select-answer]').forEach((button) => button.addEventListener('click', async () => {
    await mutateDetail(`/api/records/${record.id}/questions/${button.dataset.questionId}/decision`, { method: 'POST', body: JSON.stringify({ mode: 'answer', answerId: button.dataset.selectAnswer }) });
  }));
  $$('[data-custom-decision]').forEach((formNode) => formNode.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutateDetail(`/api/records/${record.id}/questions/${event.currentTarget.dataset.customDecision}/decision`, { method: 'POST', body: JSON.stringify({ mode: 'custom', content: form.get('content') }) });
  }));
  $$('[data-create-output]').forEach((button) => button.addEventListener('click', () => {
    const question = detail.questionWorkflow.questions.find((item) => item.id === button.dataset.questionId);
    if (!question?.decision) return;
    const titles = { preference: question.decision.content, limitation: question.decision.content, rule: question.body, insight: question.body, task: `Реализовать: ${question.body}`, idea: question.decision.content, research: `Проверить: ${question.body}`, goal: question.decision.content };
    openQuestionOutputDialog(record, question, button.dataset.createOutput, String(titles[button.dataset.createOutput] || question.body).slice(0, 240));
  }));
  $$('[data-archive-question]').forEach((button) => button.addEventListener('click', async () => {
    const reason = await askText({ title: 'Архивировать вопрос', label: 'Почему вопрос больше не нужен?', required: true });
    if (!reason) return;
    await mutateDetail(`/api/records/${record.id}/questions/${button.dataset.archiveQuestion}/archive`, { method: 'POST', body: JSON.stringify({ reason }) });
  }));
  if ($('#proof-form')) $('#proof-form').addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); await mutateDetail(`/api/records/${record.id}/proofs`, { method: 'POST', body: JSON.stringify({ kind: form.get('kind'), content: form.get('content') }) }); });
  if ($('#complete-task')) $('#complete-task').addEventListener('click', async () => { await mutateRecord(`/api/records/${record.id}/complete`, { method: 'POST', body: JSON.stringify({ result: $('#completion-result').value, notifyPartners: $('#notify-on-complete').checked }) }); });
  bindMarkdownEditors($('#record-dialog'));
}

async function mutateResearchComparison(recordID, url, options, successMessage) {
  try {
    const comparison = await api(url, options);
    state.researchComparisons.set(recordID, comparison);
    state.activeResearchOptionId = '';
    const detail = await fetchRecordDetail(recordID, true);
    if (state.activeDetail?.record.id !== recordID) return;
    state.activeDetail = detail;
    const index = state.records.findIndex((item) => item.id === recordID);
    if (index >= 0) state.records[index] = detail.record;
    renderRecordDialog();
    toast(successMessage);
  } catch (error) { toast(error.message, true); }
}

async function loadRecordRelations(recordID) {
  try {
    const relations = await api(`/api/records/${recordID}/relations`);
    if (!state.activeDetail || state.activeDetail.record.id !== recordID) return;
    state.activeDetail = { ...state.activeDetail, ...relations, relationsLoaded: true };
    state.detailCache.set(recordID, state.activeDetail);
    renderRecordDialog();
  } catch (error) {
    const loading = $('.relations-loading');
    if (loading) loading.innerHTML = `${icon('help')}<strong>Связи не загрузились</strong><small>${escapeHTML(error.message)}</small><button type="button" class="secondary" data-retry-relations>Повторить</button>`;
    $('[data-retry-relations]')?.addEventListener('click', () => loadRecordRelations(recordID));
  }
}

function askText({ title, label, defaultValue = '', required = false }) {
  const dialog = $('#reason-dialog');
  $('#reason-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">Фиксация решения</span><h2>${escapeHTML(title)}</h2></div><button type="button" class="close-button" data-cancel-reason aria-label="Закрыть">×</button></div><form id="reason-form" class="card-form dialog-form"><label>${escapeHTML(label)}<textarea name="value" rows="4" ${required ? 'required' : ''}>${escapeHTML(defaultValue)}</textarea></label><div class="form-actions"><button type="submit" class="primary">Подтвердить</button><button type="button" class="secondary" data-cancel-reason>Отмена</button></div></form>`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => { if (settled) return; settled = true; dialog.close(); resolve(value); };
    $$('[data-cancel-reason]', dialog).forEach((button) => button.addEventListener('click', () => finish(null)));
    $('#reason-form').addEventListener('submit', (event) => { event.preventDefault(); const value = new FormData(event.currentTarget).get('value').trim(); if (required && !value) return; finish(value); });
    dialog.addEventListener('close', () => { if (!settled) { settled = true; resolve(null); } }, { once: true });
    openModal(dialog);
  });
}

async function loadRecordActivity(recordID) {
  try {
    const activity = await api(`/api/activity?entityId=${encodeURIComponent(recordID)}&limit=500`);
    if (!state.activeDetail || state.activeDetail.record.id !== recordID) return;
    state.activeDetail = { ...state.activeDetail, activity, activityLoaded: true };
    state.detailCache.set(recordID, state.activeDetail);
    renderRecordDialog();
  } catch (error) {
    toast(`История карточки не загрузилась: ${error.message}`, true);
  }
}

function openQuestionOutputDialog(sourceRecord, question, kind, defaultTitle) {
  const labels = { preference: 'Критерий выбора', limitation: 'Ограничение', rule: 'Правило', insight: 'Вывод', task: 'Задача', idea: 'Идея', research: 'Исследование', goal: 'Цель' };
  const planned = ['task', 'goal', 'research'].includes(kind);
  $('#create-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${icon('link')} Результат совместного вывода</span><h2>${labels[kind]}</h2><p>Источник сохранится автоматически: группа вопросов → вопрос → совместный итог → новая карточка.</p></div><button type="button" class="close-button icon-button" data-close-create aria-label="Закрыть">${icon('x')}</button></div><form id="question-output-form" class="card-form dialog-form"><div class="source-context"><span>Вопрос</span><strong>${escapeHTML(question.body)}</strong><blockquote>${escapeHTML(question.decision.content)}</blockquote></div><label>Название<input name="title" required maxlength="240" value="${escapeHTML(defaultTitle)}"></label><label>Как применять<textarea name="description" rows="4">${escapeHTML(question.decision.content)}</textarea></label>${planned ? `<div class="form-grid two"><label>Ответственный<select name="ownerId">${userOptions(state.me.id)}</select></label><label>Срок<input name="dueAt" type="datetime-local"></label></div>` : `<input type="hidden" name="ownerId" value="${state.me.id}">`}<div class="form-actions"><button type="submit" class="primary">${icon('plus')} Создать и связать</button><button type="button" class="secondary" data-close-create>Отмена</button></div></form>`;
  $$('[data-close-create]').forEach((button) => button.addEventListener('click', () => $('#create-dialog').close()));
  $('#question-output-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const due = form.get('dueAt');
    try {
      const output = await api(`/api/records/${sourceRecord.id}/questions/${question.id}/outputs`, { method: 'POST', body: JSON.stringify({ kind, title: form.get('title'), description: form.get('description'), ownerId: Number(form.get('ownerId')), dueAt: due ? new Date(due).toISOString() : '' }) });
      $('#create-dialog').close();
      state.detailCache.delete(sourceRecord.id);
      await loadData(true);
      toast('Результат создан и связан');
      await openRecord(output.id, { workspace: true });
    } catch (error) { toast(error.message, true); }
  });
  openModal($('#create-dialog'));
}

async function mutateDetail(path, options) {
  try {
    const recordID = state.activeDetail.record.id;
    await api(path, options);
    state.detailCache.delete(recordID);
    const [detail] = await Promise.all([fetchRecordDetail(recordID, true), loadData(true)]);
    state.activeDetail = detail;
    if (state.activeRecordTab === 'relations') {
      const relations = await api(`/api/records/${recordID}/relations`);
      state.activeDetail = { ...state.activeDetail, ...relations, relationsLoaded: true };
      state.detailCache.set(recordID, state.activeDetail);
    }
    renderRecordDialog();
    toast('Сохранено');
    return true;
  } catch (error) { toast(error.message, true); return false; }
}

async function mutateRecord(path, options, close = false, clearDraftOnSuccess = false) {
  try {
    const recordID = state.activeDetail.record.id;
    await api(path, options);
    if (clearDraftOnSuccess) clearRecordDraft(recordID);
    if (clearDraftOnSuccess) state.recordEditMode = false;
    state.aiAnalyses.delete(recordID);
    state.detailCache.delete(recordID);
    const [detail] = await Promise.all([close ? Promise.resolve(null) : fetchRecordDetail(recordID, true), loadData(true)]);
    if (close) $('#record-dialog').close();
    else { state.activeDetail = detail; renderRecordDialog(); }
    toast('Сохранено');
    return true;
  } catch (error) {
    toast(error.message, true);
    return false;
  }
}

function toggleCreateMenu() {
  const menu = $('#create-menu');
  menu.innerHTML = `
    <button type="button" data-create-type="idea">${icon('lightbulb')}<span><strong>Быстрая идея</strong><small>Сохранить мысль без оценки</small></span></button>
    <button type="button" data-create-type="task">${icon('checkSquare')}<span><strong>Задача</strong><small>Себе или партнёру</small></span></button>
    <button type="button" data-create-type="meeting">${icon('calendar')}<span><strong>Встреча</strong><small>Повестка, заметки и результаты</small></span></button>
    <button type="button" data-create-type="question_set">${icon('messages')}<span><strong>Карточка вопросов</strong><small>Несколько вопросов, личные ответы и итоги</small></span></button>
    <button type="button" data-create-type="research" data-create-mode="comparison">${icon('flask')}<span><strong>Сравнение вариантов</strong><small>Общие параметры, плюсы, минусы и оценка</small></span></button>
    <button type="button" data-create-type="decision">${icon('scale')}<span><strong>Решение</strong><small>Выбор, основания и ответственный</small></span></button>
    <button type="button" data-create-type="goal">${icon('target')}<span><strong>Цель</strong><small>Результат, срок и прогресс</small></span></button>
    <button type="button" data-create-type="document">${icon('fileText')}<span><strong>Документ</strong><small>Материал или рабочая заметка</small></span></button>`;
  menu.hidden = !menu.hidden;
  $$('[data-create-type]', menu).forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation(); menu.hidden = true; openCreateDialog(button.dataset.createType, { comparisonMode: button.dataset.createMode === 'comparison' });
  }));
}

function openCreateDialog(initialType = 'idea', preset = {}) {
  const initialMeta = typeMeta[initialType];
  const sourceRecord = preset.sourceRecordId ? state.records.find((record) => record.id === preset.sourceRecordId) : null;
  const defaultWorkstream = preset.workstream || sourceRecord?.workstream || 'business';
  const defaultParentID = preset.parentId ?? sourceRecord?.id ?? '';
  const defaultEditPolicy = preset.editPolicy || 'shared';
  const kindLabels = { preference: 'Критерий выбора', limitation: 'Ограничение', rule: 'Правило', insight: 'Вывод' };
  const displayName = preset.comparisonMode ? 'Сравнение вариантов' : kindLabels[preset.kind] || initialMeta.singular;
  const titleLabel = preset.comparisonMode ? 'Что сравниваем' : initialType === 'question_set' ? 'Название группы вопросов' : initialType === 'meeting' ? 'Тема встречи' : 'Название';
  const descriptionLabel = preset.comparisonMode ? 'Зачем сравниваем и какой вывод нужен' : preset.kind === 'limitation' ? 'Как применять ограничение' : preset.kind === 'rule' ? 'Формулировка и область действия' : initialType === 'question_set' ? 'Зачем обсуждаем' : initialType === 'meeting' ? 'Повестка и заметки' : initialType === 'task' ? 'Ожидаемый результат' : 'Краткое описание';
  const parentOptions = state.records.filter((record) => record.status !== 'archived').map((record) => `<option value="${record.id}" ${defaultParentID === record.id ? 'selected' : ''}>${escapeHTML(typeMeta[record.type]?.singular || 'Карточка')}: ${escapeHTML(record.title)}</option>`).join('');
  const planned = ['task', 'goal', 'research', 'question_set', 'meeting', 'decision', 'disagreement'].includes(initialType);
  $('#create-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${icon(initialMeta.icon)} Новая запись</span><h2>${escapeHTML(displayName)}</h2></div><button type="button" class="close-button icon-button" data-close-create aria-label="Закрыть">${icon('x')}</button></div><form id="create-record-form" class="card-form dialog-form"><label>${titleLabel}<input name="title" required maxlength="240" autofocus value="${escapeHTML(preset.title || '')}" placeholder="${preset.comparisonMode ? 'Например: Выбор сервера' : initialType === 'question_set' ? 'Например: Договорённости основателей' : ''}"></label><label>${descriptionLabel}<textarea name="description" rows="5">${escapeHTML(preset.description || '')}</textarea></label><input type="hidden" name="type" value="${initialType}"><input type="hidden" name="kind" value="${escapeHTML(preset.kind || '')}">${planned ? `<div class="form-grid two"><label>${initialType === 'question_set' ? 'Координатор' : initialType === 'meeting' ? 'Организатор' : 'Ответственный'}<select name="ownerId">${userOptions(state.me.id)}</select></label><label>${initialType === 'meeting' ? 'Дата и время' : 'Срок'}<input name="dueAt" type="datetime-local"></label></div><div class="form-grid two"><label>Приоритет<select name="priority">${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${value === (preset.priority || 'normal') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Оценка времени, минут<input name="estimateMinutes" type="number" min="0" value="${Number(preset.estimateMinutes || 0)}"></label></div>` : `<input type="hidden" name="ownerId" value="${state.me.id}"><input type="hidden" name="priority" value="${escapeHTML(preset.priority || 'normal')}"><input type="hidden" name="estimateMinutes" value="${Number(preset.estimateMinutes || 0)}">`}<details class="form-more create-organization" ${sourceRecord ? 'open' : ''}><summary>Место в проекте и доступ</summary><div class="form-more-body"><div class="form-grid three"><label>Направление<select name="workstream">${Object.entries(workstreamLabels).map(([value, label]) => `<option value="${value}" ${defaultWorkstream === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Доступ к изменениям<select name="editPolicy">${Object.entries(editPolicyLabels).map(([value, label]) => `<option value="${value}" ${defaultEditPolicy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Родитель<select name="parentId"><option value="">Без родителя</option>${parentOptions}</select></label></div><label class="root-toggle"><input name="isRoot" type="checkbox" ${preset.isRoot ? 'checked' : ''}> <span><strong>Новый корень</strong><small>Начать самостоятельную крупную ветку вместо продолжения текущей цепочки.</small></span></label></div></details><div class="ai-suggestion"><span class="ai-suggestion-icon">${icon('sparkles')}</span><span><strong>AI-структура</strong><small id="ai-suggestion-status">После названия система предложит приоритет, оценку времени, направление и место в иерархии.</small></span><button type="button" class="secondary" data-ai-suggest>Предложить</button></div><div class="form-actions"><button type="submit" class="primary">${icon('plus')} Создать</button><button type="button" class="secondary" data-close-create>Отмена</button></div></form>`;
  $$('[data-close-create]').forEach((button) => button.addEventListener('click', () => $('#create-dialog').close()));
  const createForm = $('#create-record-form');
  bindCreateSuggestion(createForm, initialType);
  $('#create-record-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const due = form.get('dueAt');
    try {
      const record = await api('/api/records', { method: 'POST', body: JSON.stringify({ type: form.get('type'), kind: form.get('kind'), title: form.get('title'), description: form.get('description'), ownerId: Number(form.get('ownerId')), dueAt: due ? new Date(due).toISOString() : '', priority: form.get('priority') || 'normal', workstream: form.get('workstream') || 'business', editPolicy: form.get('editPolicy') || 'shared', parentId: form.get('parentId') || '', isRoot: event.currentTarget.elements.isRoot.checked, estimateMinutes: Number(form.get('estimateMinutes')) }) });
      let linkError = '';
      if (preset.sourceRecordId) {
        try {
          await api(`/api/records/${preset.sourceRecordId}/links`, { method: 'POST', body: JSON.stringify({ targetId: record.id, relationType: preset.relationType || 'leads_to', reason: preset.reason || 'Карточка создана из связанного рабочего контекста' }) });
          state.detailCache.delete(preset.sourceRecordId);
        } catch (error) {
          linkError = `Карточка создана, но связь не добавлена: ${error.message}`;
        }
      }
      $('#create-dialog').close(); await loadData(true); toast(linkError || 'Карточка создана', Boolean(linkError)); await openRecord(record.id, { workspace: Boolean(preset.sourceRecordId), edit: true, tab: preset.comparisonMode ? 'content' : undefined });
    } catch (error) { toast(error.message, true); }
  });
  openModal($('#create-dialog'));
}

function bindCreateSuggestion(form, recordType) {
  const tracked = ['priority', 'workstream', 'parentId', 'estimateMinutes'];
  tracked.forEach((name) => form.elements[name]?.addEventListener('change', () => { form.elements[name].dataset.userChanged = 'true'; }));
  const root = form.elements.isRoot;
  const parent = form.elements.parentId;
  root?.addEventListener('change', () => { if (root.checked && parent) { parent.value = ''; syncCustomSelect(parent); } });
  parent?.addEventListener('change', () => { if (parent.value && root) root.checked = false; });
  let requestNumber = 0;
  const suggest = async (force = false) => {
    const title = form.elements.title.value.trim();
    if (title.length < 4) return;
    const currentRequest = ++requestNumber;
    const status = $('#ai-suggestion-status');
    status.textContent = 'Анализируем карточку…';
    try {
      const suggestion = await api('/api/ai/suggest-record', { method: 'POST', body: JSON.stringify({ type: recordType, title, description: form.elements.description.value }) });
      if (currentRequest !== requestNumber || !form.isConnected) return;
      tracked.forEach((name) => {
        const field = form.elements[name];
        if (field && (force || field.dataset.userChanged !== 'true') && suggestion[name] !== undefined) {
          field.value = suggestion[name];
          if (field.tagName === 'SELECT') syncCustomSelect(field);
        }
      });
      if (suggestion.parentId && root) root.checked = false;
      const parentTitle = suggestion.parentId ? state.records.find((record) => record.id === suggestion.parentId)?.title : '';
      const source = suggestion.source === 'groq' ? 'Groq' : 'локальная модель';
      status.textContent = `${source}: ${priorityLabels[suggestion.priority]}, ${minutesLabel(suggestion.estimateMinutes)}, ${workstreamLabels[suggestion.workstream]}${parentTitle ? `, ветка «${parentTitle}»` : ', без родителя'}. ${suggestion.reason}`;
    } catch (error) {
      if (currentRequest === requestNumber) status.textContent = `Не удалось получить предложение: ${error.message}`;
    }
  };
  $('[data-ai-suggest]', form).addEventListener('click', () => suggest(true));
  ['title', 'description'].forEach((name) => form.elements[name].addEventListener('input', () => {
    clearTimeout(state.aiSuggestionTimer);
    state.aiSuggestionTimer = setTimeout(() => suggest(false), 1200);
  }));
  if (form.elements.title.value.trim().length >= 4) suggest(false);
}

function actionLabel(action) {
  return ({ created: 'создал карточку', profile_updated: 'изменил профиль', updated: 'изменил карточку', reordered: 'изменил порядок блоков', converted_to_questions: 'преобразовал в карточку вопросов', archived: 'перенёс в архив', section_updated: 'обновил раздел', link_created: 'создал связь', link_removed: 'убрал связь', criterion_scored: 'оценил по критерию', proof_added: 'добавил доказательство', completed: 'завершил задачу', partners_notified: 'уведомил партнёра', questions_added: 'добавил вопросы', question_answered: 'ответил на вопрос', question_decided: 'зафиксировал совместное решение', question_archived: 'архивировал вопрос', output_created: 'превратил вывод в рабочую карточку', created_from_question: 'создал карточку из совместного вывода', research_option_created: 'добавил вариант исследования', research_option_updated: 'обновил вариант исследования', research_option_archived: 'архивировал вариант исследования', research_field_created: 'добавил поле сравнения', research_field_archived: 'архивировал поле сравнения' }[action] || action);
}

function activityActionLabel(item) {
  if (item.entityType === 'user' && item.action === 'created') return 'зарегистрировался в проекте';
  return actionLabel(item.action);
}

function formatActivityValue(value, truncate = true) {
  if (value === null || value === undefined || value === '') return 'не указано';
  if (typeof value === 'object') return JSON.stringify(value);
  const text = String(value);
  return truncate && text.length > 140 ? `${text.slice(0, 137)}…` : text;
}

function activityDisplayValue(field, value, truncate = true) {
  if (field === 'status' && value) return statusLabels[value] || value;
  if (field === 'type' && value) return typeMeta[value]?.singular || value;
  if ((field === 'ownerId' || field === 'decisionMakerId') && value) return state.users.find((user) => user.id === Number(value))?.username || value;
  if (field === 'dueAt' && value) return formatDate(value, true);
  if (field === 'estimateMinutes' && value !== null && value !== undefined) return minutesLabel(Number(value));
  if (field === 'progress' && value !== null && value !== undefined) return `${value}%`;
  if (field === 'priority' && value) return priorityLabels[value] || value;
  if (field === 'workstream' && value) return workstreamLabels[value] || value;
  if (field === 'editPolicy' && value) return editPolicyLabels[value] || value;
  if (field === 'parentId' && value) return state.records.find((record) => record.id === value)?.title || value;
  if (field === 'actualMinutes' && value !== null && value !== undefined) return minutesLabel(Number(value));
  if (field === 'isRoot') return value ? 'Новый корень' : 'Обычная ветка';
  return formatActivityValue(value, truncate);
}

function activityChanges(item, full = false) {
  const fieldLabels = { username: 'Логин', type: 'Тип карточки', title: 'Название', description: 'Описание', status: 'Статус', ownerId: 'Ответственный', decisionMakerId: 'Принимает решение', dueAt: 'Срок', priority: 'Приоритет', workstream: 'Направление', editPolicy: 'Доступ', parentId: 'Родитель', isRoot: 'Иерархия', estimateMinutes: 'Оценка времени', actualMinutes: 'Фактическое время', progress: 'Прогресс', progressNote: 'Ход работы', result: 'Результат' };
  const changes = Object.entries(item.details || {}).filter(([, value]) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'before') && Object.prototype.hasOwnProperty.call(value, 'after'));
  if (!changes.length && Object.prototype.hasOwnProperty.call(item.details || {}, 'before') && Object.prototype.hasOwnProperty.call(item.details || {}, 'after')) {
    changes.push([item.details?.section || 'Содержание', { before: item.details.before, after: item.details.after }]);
  }
  if (!changes.length) return '';
  return changes.map(([field, value]) => `<span class="change-line"><b>${escapeHTML(fieldLabels[field] || field)}:</b> <del>${escapeHTML(activityDisplayValue(field, value.before, !full))}</del><i>→</i><ins>${escapeHTML(activityDisplayValue(field, value.after, !full))}</ins></span>`).join('');
}

function activityDetails(item) {
  const details = item.details || {};
  const rows = [];
  const target = details.targetId ? state.records.find((record) => record.id === details.targetId) : null;
  const relationLabels = { related: 'связано', supports: 'поддерживает', depends_on: 'зависит от', result_of: 'является результатом', leads_to: 'приводит к', produced: 'порождает' };
  if (item.action === 'questions_added' && details.count) rows.push(['Добавлено вопросов', String(details.count)]);
  if (['link_created', 'link_removed'].includes(item.action) && target) rows.push(['Связанная карточка', `${typeMeta[target.type]?.singular || 'Карточка'} «${target.title}»`]);
  if (['link_created', 'link_removed'].includes(item.action) && details.relationType) rows.push(['Характер связи', relationLabels[details.relationType] || details.relationType]);
  if (item.action === 'criterion_scored' && details.score !== undefined) rows.push(['Оценка', `${details.score} из 10`]);
  if (item.action === 'criterion_scored' && details.note) rows.push(['Обоснование', details.note]);
  if (item.action === 'proof_added') rows.push(['Подтверждение', details.kind === 'link' ? 'Ссылка' : 'Текстовый результат']);
  if (item.action === 'completed' && details.result) rows.push(['Полученный результат', details.result]);
  if (item.action === 'partners_notified' && details.message) rows.push(['Сообщение партнёру', details.message]);
  if (item.action === 'section_updated' && details.section) rows.push(['Раздел', details.section]);
  if (item.action.startsWith('research_option_') && details.title) rows.push(['Вариант', details.title?.after || details.title]);
  if (item.action.startsWith('research_field_') && details.name) rows.push(['Поле сравнения', details.name]);
  if (item.action === 'research_option_created' && details.rating !== undefined) rows.push(['Оценка', `${details.rating} из 10`]);
  if (!rows.length) return '';
  return `<dl class="event-details">${rows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(String(value))}</dd></div>`).join('')}</dl>`;
}

function activityContext(item) {
  const details = item.details || {};
  if (item.action === 'questions_added' && details.count) return questionsCountLabel(Number(details.count));
  if (item.action === 'question_answered') return 'Личная позиция сохранена';
  if (item.action === 'question_decided') return 'Совместный итог зафиксирован';
  if (item.action === 'link_created') {
    const target = state.records.find((record) => record.id === details.targetId);
    return target ? `Связь с «${target.title}»` : 'Новая связь между карточками';
  }
  if (item.action === 'proof_added') return 'Добавлено подтверждение результата';
  if (item.action.startsWith('research_option_')) return details.title?.after || details.title || 'Изменён вариант сравнения';
  if (item.action.startsWith('research_field_')) return details.name || 'Изменена структура сравнения';
  if (item.reason) return `Причина: ${item.reason}`;
  return recordTitleByActivity(item);
}

function recordTitleByActivity(item) {
  if (item.entityType === 'user') return item.details?.username || 'Участник проекта';
  return state.records.find((record) => record.id === item.entityId)?.title || item.details?.title || (item.entityType === 'section_definition' ? 'Шаблон карточки' : typeMeta[item.entityType]?.singular || 'Запись недоступна');
}

function renderActivityItem(item) {
  return `<button type="button" class="activity-item" data-open-event="${item.id}"><span class="history-marker">${icon(typeMeta[item.entityType]?.icon || 'history')}</span><span><strong>${escapeHTML(item.actorUsername)} ${escapeHTML(activityActionLabel(item))}</strong><small>${escapeHTML(activityContext(item))}</small></span><time>${formatDate(item.createdAt, true)}</time>${icon('chevronRight', 'activity-arrow')}</button>`;
}

function durationLabel(seconds) {
  if (!seconds) return 'Нет данных';
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  if (!hours) return `${minutes} мин`;
  return minutes ? `${hours} ч ${minutes} мин` : `${hours} ч`;
}

function estimateInsight(accuracy, completedRecords) {
  if (!accuracy || !completedRecords) return { tone: 'neutral', title: 'Калибровка появится после завершённых работ', text: 'Заполняйте плановое и фактическое время: система покажет, насколько реалистичны оценки.' };
  if (accuracy > 140) return { tone: 'warning', title: 'Оценки времени системно занижены', text: `Фактическое время составляет ${accuracy}% от плана. Для похожих задач стоит увеличить следующую оценку.` };
  if (accuracy < 60) return { tone: 'info', title: 'Оценки времени завышены', text: `Фактическое время составляет ${accuracy}% от плана. Следующие похожие задачи можно оценивать смелее.` };
  return { tone: 'success', title: 'Оценки близки к факту', text: `Фактическое время составляет ${accuracy}% от плана. Текущая калибровка выглядит рабочей.` };
}

async function openProfile(userId) {
  const dialog = $('#profile-dialog');
  const user = state.users.find((item) => item.id === Number(userId));
  $('#profile-dialog-content').innerHTML = `<div class="profile-loading"><span class="spinner"></span><strong>Загружаем активность ${escapeHTML(user?.username || '')}</strong></div>`;
  openModal(dialog);
  try {
    const profile = await api(`/api/users/${userId}/profile`);
    const maxSeconds = Math.max(1, ...profile.activity.map((day) => day.activeSeconds));
    const accuracy = profile.estimateMinutes > 0 && profile.actualMinutes > 0 ? Math.round(profile.actualMinutes * 100 / profile.estimateMinutes) : 0;
    const insight = estimateInsight(accuracy, profile.completedRecords);
    $('#profile-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">Участник проекта</span><h2>${escapeHTML(profile.user.username)}</h2><p>На платформе с ${formatDate(profile.user.createdAt)}</p></div><button type="button" class="close-button icon-button" data-close-profile aria-label="Закрыть">${icon('x')}</button></div><div class="profile-body"><section class="profile-summary"><span class="avatar profile-avatar">${escapeHTML(profile.user.username.slice(0, 2).toUpperCase())}</span><div><h3>${escapeHTML(profile.user.username)}</h3><p>${profile.user.id === state.me.id ? 'Ваш профиль активности' : 'Активность сооснователя'}</p></div>${profile.user.id === state.me.id ? `<button type="button" class="secondary" data-edit-profile>${icon('edit')} Изменить логин</button>` : ''}</section><div class="profile-metrics"><article><span>Активное время · 30 дней</span><strong>${durationLabel(profile.activeSeconds30Days)}</strong><small>Только взаимодействие с интерфейсом</small></article><article><span>Действия · 30 дней</span><strong>${profile.actions30Days}</strong><small>${interactionsCountLabel(profile.interactions30Days)} с UI</small></article><article><span>Завершено</span><strong>${profile.completedRecords}</strong><small>карточек с результатом</small></article><article><span>Факт к оценке</span><strong>${accuracy ? `${accuracy}%` : 'Нет данных'}</strong><small>${minutesLabel(profile.actualMinutes)} факт · ${minutesLabel(profile.estimateMinutes)} план</small></article></div><section class="estimate-insight ${insight.tone}">${icon('clock')}<div><strong>${escapeHTML(insight.title)}</strong><p>${escapeHTML(insight.text)}</p></div></section><section class="activity-chart"><header><h3>Активность по дням</h3><span>Последние 30 дней</span></header><div>${profile.activity.length ? profile.activity.slice().reverse().map((day) => `<span title="${escapeHTML(day.date)} · ${durationLabel(day.activeSeconds)} · ${interactionsCountLabel(day.interactions)}"><i data-level="${Math.max(1, Math.ceil(day.activeSeconds * 5 / maxSeconds))}"></i><small>${day.date.slice(8)}</small></span>`).join('') : `<p>Активность начнёт накапливаться после взаимодействия с новой версией.</p>`}</div></section><section class="profile-actions"><header><h3>Последние действия</h3><span>${profile.recentActions.length}</span></header><div class="activity-list">${profile.recentActions.map(renderActivityItem).join('') || emptyState('Действий пока нет.')}</div></section></div>`;
    $$('[data-close-profile]').forEach((button) => button.addEventListener('click', () => dialog.close()));
    $('[data-edit-profile]')?.addEventListener('click', async () => {
      const username = await askText({ title: 'Изменить логин', label: 'Новый логин', defaultValue: state.me.username, required: true });
      if (!username || username === state.me.username) return;
      try {
        state.me = await api('/api/me', { method: 'PATCH', body: JSON.stringify({ username }) });
        $('#user-name').textContent = state.me.username; $('#user-avatar').textContent = state.me.username.slice(0, 2).toUpperCase();
        await loadData(true); await openProfile(state.me.id); toast('Логин изменён');
      } catch (error) { toast(error.message, true); }
    });
    const recentActions = new Map(profile.recentActions.map((item) => [item.id, item]));
    $$('[data-open-event]', dialog).forEach((button) => button.addEventListener('click', () => openActivity(button.dataset.openEvent, recentActions.get(button.dataset.openEvent))));
  } catch (error) {
    $('#profile-dialog-content').innerHTML = `<div class="record-load-error">${icon('help')}<h2>Профиль не загрузился</h2><p>${escapeHTML(error.message)}</p><button type="button" class="secondary" data-close-profile>Закрыть</button></div>`;
    $('[data-close-profile]').addEventListener('click', () => dialog.close());
  }
}

function openActivity(id, suppliedItem = null) {
  const item = suppliedItem || state.activity.find((activity) => activity.id === id);
  if (!item) return toast('Событие не найдено', true);
  state.activeActivity = item;
  const record = state.records.find((candidate) => candidate.id === item.entityId);
  $('#event-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${formatDate(item.createdAt, true)} · ${escapeHTML(item.actorUsername)}</span><h2>${escapeHTML(activityActionLabel(item))}</h2><p>${escapeHTML(recordTitleByActivity(item))}</p></div><button type="button" class="close-button icon-button" data-close-event aria-label="Закрыть">${icon('x')}</button></div><div class="event-body">${item.reason ? `<section class="event-reason-block"><span>Почему</span><p>${escapeHTML(item.reason)}</p></section>` : ''}${activityChanges(item, true) ? `<section class="event-section"><h3>Что изменилось</h3><div class="event-change-list">${activityChanges(item, true)}</div></section>` : ''}${activityDetails(item) ? `<section class="event-section"><h3>Содержание события</h3>${activityDetails(item)}</section>` : ''}<div class="form-actions">${record ? `<button type="button" class="primary" data-event-record="${record.id}">Открыть карточку</button>` : ''}<button type="button" class="secondary" data-close-event>Закрыть</button></div></div>`;
  $$('[data-close-event]', $('#event-dialog')).forEach((button) => button.addEventListener('click', () => $('#event-dialog').close()));
  $('[data-event-record]')?.addEventListener('click', async (event) => { $('#event-dialog').close(); await openRecord(event.currentTarget.dataset.eventRecord); });
  openModal($('#event-dialog'));
}

function renderHistory() {
  let activity = state.activity.filter((item) => state.historyScope === 'all' || (item.entityType !== 'section_definition' && item.entityType !== 'user'));
  if (state.historyActor !== 'all') activity = activity.filter((item) => String(item.actorId) === state.historyActor);
  if (state.historyType !== 'all') activity = activity.filter((item) => item.entityType === state.historyType);
  const groups = new Map();
  activity.forEach((item) => {
    const day = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(item.createdAt));
    if (!groups.has(day)) groups.set(day, []);
    groups.get(day).push(item);
  });
  const availableTypes = [...new Set(state.activity.map((item) => item.entityType))].filter((type) => typeMeta[type]).sort((a, b) => typeMeta[a].singular.localeCompare(typeMeta[b].singular, 'ru'));
  $('#main-content').innerHTML = `<div class="history-title"><div><p class="eyebrow">Память проекта</p><h1>История</h1><p>Решения и изменения в человеческом виде, с переходом к исходной карточке.</p></div><span>${activity.length} событий</span></div><section class="history-controls" aria-label="Фильтры истории"><div class="segmented compact"><button type="button" class="segment ${state.historyScope === 'project' ? 'active' : ''}" data-history-scope="project">Работа проекта</button><button type="button" class="segment ${state.historyScope === 'all' ? 'active' : ''}" data-history-scope="all">Включая настройки</button></div><label>Автор<select id="history-actor"><option value="all">Вся команда</option>${state.users.map((user) => `<option value="${user.id}" ${state.historyActor === String(user.id) ? 'selected' : ''}>${escapeHTML(user.username)}</option>`).join('')}</select></label><label>Объект<select id="history-type"><option value="all">Все карточки</option>${availableTypes.map((type) => `<option value="${type}" ${state.historyType === type ? 'selected' : ''}>${escapeHTML(typeMeta[type].singular)}</option>`).join('')}</select></label></section><section class="history-feed">${[...groups.entries()].map(([day, items]) => `<div class="history-day"><time>${escapeHTML(day)}</time><div class="activity-list">${items.map(renderActivityItem).join('')}</div></div>`).join('') || `<div class="guided-empty history-empty">${icon('history')}<h3>Событий в этом представлении нет</h3><p>Сбросьте фильтры или продолжите работу с карточками.</p></div>`}</section>${state.historyLoadedAll ? '' : `<div class="history-more"><button type="button" class="secondary" id="load-older-history">${icon('history')} Загрузить более ранние события</button></div>`}`;
  $$('[data-history-scope]').forEach((button) => button.addEventListener('click', () => { state.historyScope = button.dataset.historyScope; renderHistory(); }));
  $('#history-actor').addEventListener('change', (event) => { state.historyActor = event.target.value; renderHistory(); });
  $('#history-type').addEventListener('change', (event) => { state.historyType = event.target.value; renderHistory(); });
  $('#load-older-history')?.addEventListener('click', loadOlderHistory);
  bindOpenRecords();
}

async function loadOlderHistory() {
  const button = $('#load-older-history');
  button.disabled = true; button.textContent = 'Загружаем…';
  try {
    const next = await api(`/api/activity?limit=200&offset=${state.activity.length}`);
    const known = new Set(state.activity.map((item) => item.id));
    state.activity.push(...next.filter((item) => !known.has(item.id) && (typeMeta[item.entityType] || item.entityType === 'section_definition')));
    state.historyLoadedAll = next.length < 200;
    renderHistory();
  } catch (error) {
    button.disabled = false; button.textContent = 'Повторить загрузку'; toast(error.message, true);
  }
}

function renderStructure() {
  const configurableTypes = Object.entries(typeMeta).filter(([key]) => !['question_set', 'meeting'].includes(key));
  const selectedType = state.structureType || 'idea';
  state.structureType = selectedType;
  const definitions = state.definitions.filter((definition) => definition.scopeType === selectedType || !definition.scopeType);
  const active = definitions.filter((definition) => definition.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const hidden = definitions.filter((definition) => !definition.active).sort((a, b) => a.sortOrder - b.sortOrder);
  $('#main-content').innerHTML = `<div class="page-heading template-heading"><div><p class="eyebrow">Настройки структуры</p><h1>Шаблоны карточек</h1><p>Перетащите блоки в нужный порядок. Это меняет только смысловую структуру новых и существующих карточек, а не их данные.</p></div></div><div class="template-editor"><aside>${configurableTypes.map(([key, meta]) => `<button type="button" data-structure-type="${key}" class="${selectedType === key ? 'active' : ''}">${icon(meta.icon)}<span>${meta.label}</span><b>${state.definitions.filter((definition) => definition.scopeType === key && definition.active).length}</b></button>`).join('')}</aside><section><header><div><p class="eyebrow">Содержание карточки</p><h2>${typeMeta[selectedType].label}</h2><p>Верхний блок появится первым во вкладке «Содержание».</p></div></header><div class="template-block-list" data-template-list>${active.map((definition) => `<article class="template-block" draggable="true" data-template-block="${definition.id}" data-scope-type="${definition.scopeType || ''}"><button type="button" class="drag-handle" aria-label="Перетащить блок «${escapeHTML(definition.name)}»" title="Перетащить блок">${icon('grip')}</button><div><strong>${escapeHTML(definition.name)}</strong><small>${definition.scopeType ? `Только ${typeMeta[definition.scopeType].label.toLowerCase()}` : 'Общий блок для всех карточек'}</small></div><span class="template-position">${icon('check')}</span></article>`).join('') || `<div class="guided-empty template-empty">${icon('settings')}<h3>Содержательных блоков пока нет</h3><p>Добавьте первый блок, чтобы карточка не превращалась в свободную заметку.</p></div>`}<div class="template-drop-actions"><button type="button" class="template-add" data-add-template-block>${icon('plus')}<span><strong>Добавить блок</strong><small>Новый смысловой раздел карточки</small></span></button><div class="template-trash" data-template-trash>${icon('trash')}<span><strong>Убрать из шаблона</strong><small>Блок можно восстановить позже</small></span></div></div></div>${hidden.length ? `<details class="hidden-template-blocks"><summary>Скрытые блоки <b>${hidden.length}</b></summary><div>${hidden.map((definition) => `<button type="button" data-restore-definition="${definition.id}">${icon('rotate')}<span><strong>${escapeHTML(definition.name)}</strong><small>Вернуть в шаблон</small></span></button>`).join('')}</div></details>` : ''}</section></div>`;
  $$('[data-structure-type]').forEach((button) => button.addEventListener('click', () => { state.structureType = button.dataset.structureType; renderStructure(); }));
  $('[data-add-template-block]').addEventListener('click', async () => { const name = await askText({ title: `Новый блок для «${typeMeta[selectedType].label}»`, label: 'Название смыслового блока', required: true }); if (!name) return; try { await api('/api/section-definitions', { method: 'POST', body: JSON.stringify({ name, scopeType: selectedType, kind: 'universal' }) }); await loadData(true); state.structureType = selectedType; renderStructure(); toast('Блок добавлен'); } catch (error) { toast(error.message, true); } });
  $$('[data-restore-definition]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/api/section-definitions/${button.dataset.restoreDefinition}`, { method: 'PATCH', body: JSON.stringify({ active: true, reason: 'Пункт снова нужен в шаблоне' }) }); await loadData(true); state.structureType = selectedType; renderStructure(); toast('Блок возвращён'); } catch (error) { toast(error.message, true); } }));
  bindTemplateDrag(selectedType);
}

async function saveTemplateOrder(scopeType, list) {
  const orderedIds = $$('[data-template-block]', list).filter((row) => row.dataset.scopeType === scopeType).map((row) => row.dataset.templateBlock);
  if (!orderedIds.length) return;
  await api('/api/section-definitions/reorder', { method: 'POST', body: JSON.stringify({ scopeType, orderedIds }) });
  orderedIds.forEach((id, index) => {
    const definition = state.definitions.find((item) => item.id === id);
    if (definition) definition.sortOrder = (index + 1) * 10;
  });
}

function bindTemplateDrag(scopeType) {
  const list = $('[data-template-list]');
  const trash = $('[data-template-trash]');
  if (!list || !trash) return;
  let dragged = null;
  let droppedInTrash = false;
  let pointerDrag = null;
  const clearTargets = () => $$('[data-template-block]', list).forEach((row) => row.classList.remove('drop-before', 'drop-after'));
  const begin = (row) => {
    dragged = row; droppedInTrash = false;
    row.classList.add('dragging'); list.classList.add('is-dragging');
  };
  const finish = async () => {
    if (!dragged) return;
    const moved = dragged;
    list.classList.remove('is-dragging'); trash.classList.remove('active'); clearTargets();
    document.body.classList.remove('template-pointer-drag');
    moved.classList.remove('dragging'); dragged = null;
    if (droppedInTrash) { droppedInTrash = false; return; }
    try { await saveTemplateOrder(scopeType, list); toast('Порядок блоков сохранён'); } catch (error) { toast(error.message, true); renderStructure(); }
  };
  const hideDragged = async () => {
    if (!dragged) return;
    const id = dragged.dataset.templateBlock;
    droppedInTrash = true; trash.classList.remove('active'); dragged.classList.add('removing');
    try {
      await api(`/api/section-definitions/${id}`, { method: 'PATCH', body: JSON.stringify({ active: false, reason: 'Блок убран из шаблона через зону удаления' }) });
      await loadData(true); state.structureType = scopeType; renderStructure(); toast('Блок скрыт. Его можно вернуть ниже списка');
    } catch (error) { droppedInTrash = false; toast(error.message, true); renderStructure(); }
  };
  $$('[data-template-block]', list).forEach((row) => {
    row.addEventListener('dragstart', (event) => {
      if (row.dataset.scopeType !== scopeType) { event.preventDefault(); return; }
      begin(row);
      event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', row.dataset.templateBlock);
    });
    row.addEventListener('dragover', (event) => {
      if (!dragged || row === dragged) return;
      event.preventDefault(); clearTargets();
      const before = event.clientY < row.getBoundingClientRect().top + row.offsetHeight / 2;
      row.classList.add(before ? 'drop-before' : 'drop-after');
      list.insertBefore(dragged, before ? row : row.nextSibling);
    });
    row.addEventListener('dragend', finish);
    const handle = $('.drag-handle', row);
    handle?.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || row.dataset.scopeType !== scopeType) return;
      event.preventDefault(); begin(row); document.body.classList.add('template-pointer-drag');
      pointerDrag = { id: event.pointerId, handle };
      handle.setPointerCapture?.(event.pointerId);
    });
    handle?.addEventListener('pointermove', (event) => {
      if (!pointerDrag || pointerDrag.id !== event.pointerId || !dragged) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY);
      const overTrash = target?.closest('[data-template-trash]');
      trash.classList.toggle('active', Boolean(overTrash));
      if (overTrash) { clearTargets(); return; }
      const targetRow = target?.closest('[data-template-block]');
      if (!targetRow || targetRow === dragged || !list.contains(targetRow)) return;
      clearTargets();
      const before = event.clientY < targetRow.getBoundingClientRect().top + targetRow.offsetHeight / 2;
      targetRow.classList.add(before ? 'drop-before' : 'drop-after');
      list.insertBefore(dragged, before ? targetRow : targetRow.nextSibling);
    });
    const endPointerDrag = async (event) => {
      if (!pointerDrag || pointerDrag.id !== event.pointerId) return;
      const remove = trash.classList.contains('active');
      pointerDrag.handle.releasePointerCapture?.(event.pointerId); pointerDrag = null;
      if (remove) await hideDragged(); else await finish();
    };
    handle?.addEventListener('pointerup', endPointerDrag);
    handle?.addEventListener('pointercancel', async () => { pointerDrag = null; await finish(); });
    handle?.addEventListener('keydown', async (event) => {
      if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault();
      const sibling = event.key === 'ArrowUp' ? row.previousElementSibling : row.nextElementSibling;
      if (!sibling?.matches('[data-template-block]')) return;
      if (event.key === 'ArrowUp') list.insertBefore(row, sibling); else list.insertBefore(sibling, row);
      try { await saveTemplateOrder(scopeType, list); renderStructure(); toast('Порядок блоков сохранён'); } catch (error) { toast(error.message, true); }
    });
  });
  trash.addEventListener('dragover', (event) => { if (!dragged) return; event.preventDefault(); trash.classList.add('active'); event.dataTransfer.dropEffect = 'move'; });
  trash.addEventListener('dragleave', () => trash.classList.remove('active'));
  trash.addEventListener('drop', async (event) => {
    event.preventDefault();
    if (!dragged) return;
    await hideDragged();
  });
}

function renderNotifications() {
  $('#main-content').innerHTML = `<div class="list-toolbar"><div><p class="eyebrow">Личный кабинет</p><h3>Уведомления</h3></div><button type="button" class="secondary" id="read-all">Прочитать все</button></div><section class="section-panel"><div class="notification-list">${state.notifications.map((item) => `<button type="button" class="notification ${item.readAt ? '' : 'unread'}" data-notification-id="${item.id}" data-entity-id="${escapeHTML(item.entityId || '')}"><i></i><span><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.body)}</p><small>${formatDate(item.createdAt, true)}</small></span></button>`).join('') || emptyState('Уведомлений пока нет.')}</div></section>`;
  $('#read-all').addEventListener('click', async () => { await api('/api/notifications/read-all', { method: 'POST' }); await loadData(true); });
  $$('[data-notification-id]').forEach((button) => button.addEventListener('click', async () => { await api(`/api/notifications/${button.dataset.notificationId}/read`, { method: 'POST' }); if (button.dataset.entityId) await openRecord(button.dataset.entityId); await loadData(true); }));
}

const onboardingSteps = [
  { icon: 'checkSquare', label: 'Единая очередь', title: 'Вся исполнимая работа находится в «Работе»', text: 'Задачи, вопросы, исследования, решения и встречи не разнесены по дублирующим экранам. Переключайте исполнителя и откройте «Фильтры», когда нужен конкретный тип или направление.' },
  { icon: 'lock', label: 'Личное и общее', title: 'Доступ задаётся для каждой карточки', text: 'Общую карточку ведут оба основателя. В личной карточке партнёр видит ход работы, но изменить содержание может только ответственный.' },
  { icon: 'flask', label: 'Исследования', title: 'Сравнивайте варианты отдельными карточками', text: 'Откройте исследование, нажмите «Редактировать» и во вкладке «Содержание» добавьте общие поля и варианты. У каждого варианта есть оценка, Markdown-описание, плюсы, минусы и заметки; при следующем открытии вы увидите готовый обзор без полей ввода.' },
  { icon: 'messages', label: 'Совместные вопросы', title: 'Одна карточка хранит список вопросов', text: 'Каждый основатель отвечает отдельно. После двух ответов зафиксируйте общий итог и превратите его в критерий, ограничение, правило, идею или задачу.' },
  { icon: 'network', label: 'Причины и следствия', title: 'Продолжайте цепочку из исходной карточки', text: 'Создавайте следующий объект через «Продолжить цепочку». Родитель виден в иерархии, а полная причинная картина открывается на карте связей.' },
  { icon: 'sparkles', label: 'AI без автопилота', title: 'Нейросеть предлагает, основатель подтверждает', text: 'AI помогает оценить время, приоритет, пробелы, риски и возможные связи. Ни одно поле, решение или новая карточка не меняются без вашего явного действия.' },
  { icon: 'history', label: 'Ничего не исчезает', title: 'Статус меняет представление, а не объект', text: 'Срок, статус, причина, автор и результат остаются в истории. Завершённая задача требует доказательства, а архив не удаляет карточку.' },
];

function onboardingKey() {
  return `business-control:onboarding:${state.me?.id || 'anonymous'}:v5`;
}

function maybeShowOnboarding() {
  try { if (!localStorage.getItem(onboardingKey())) openOnboarding(0); } catch (_) {}
}

function openOnboarding(step = 0) {
  const item = onboardingSteps[step];
  const dialog = $('#onboarding-dialog');
  $('#onboarding-dialog-content').innerHTML = `<div class="onboarding-visual"><span>${icon(item.icon)}</span><div class="onboarding-chain">${onboardingSteps.map((_, index) => `<i class="${index <= step ? 'active' : ''}"></i>`).join('')}</div></div><div class="onboarding-copy"><p class="eyebrow">${escapeHTML(item.label)} · ${step + 1}/${onboardingSteps.length}</p><h2>${escapeHTML(item.title)}</h2><p>${escapeHTML(item.text)}</p><div class="onboarding-actions">${step ? `<button type="button" class="secondary" data-onboarding-step="${step - 1}">Назад</button>` : `<button type="button" class="text-button" data-skip-onboarding>Пропустить</button>`}<button type="button" class="primary" data-onboarding-step="${step + 1}">${step === onboardingSteps.length - 1 ? `${icon('check')} Начать работу` : `Далее ${icon('chevronRight')}`}</button></div></div>`;
  $$('[data-onboarding-step]', dialog).forEach((button) => button.addEventListener('click', () => { const next = Number(button.dataset.onboardingStep); if (next >= onboardingSteps.length) finishOnboarding(); else openOnboarding(next); }));
  $('[data-skip-onboarding]', dialog)?.addEventListener('click', finishOnboarding);
  openModal(dialog);
}

function finishOnboarding() {
  try { localStorage.setItem(onboardingKey(), new Date().toISOString()); } catch (_) {}
  if ($('#onboarding-dialog').open) $('#onboarding-dialog').close();
}

bootstrap();
