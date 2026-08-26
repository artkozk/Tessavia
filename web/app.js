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
  risk: { label: 'Риски', singular: 'Риск', icon: 'shield' },
  hypothesis: { label: 'Гипотезы', singular: 'Гипотеза', icon: 'hypothesis' },
  experiment: { label: 'Эксперименты', singular: 'Эксперимент', icon: 'testTube' },
  inbox: { label: 'Входящие', singular: 'Входящее', icon: 'inbox' },
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
	bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>',
	reply: '<path d="m9 17-6-5 6-5v3h4a7 7 0 0 1 7 7v1a9 9 0 0 0-7-5H9Z"/>',
	smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
	video: '<path d="M15 10 21 7v10l-6-3Z"/><rect width="13" height="14" x="2" y="5" rx="2"/>',
	copy: '<rect width="13" height="13" x="8" y="8" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
	stop: '<rect width="12" height="12" x="6" y="6" rx="1"/>',
  lock: '<rect width="16" height="11" x="4" y="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  sparkles: '<path d="m12 3-1.2 3.3L7.5 7.5l3.3 1.2L12 12l1.2-3.3 3.3-1.2-3.3-1.2Z"/><path d="m18.5 13-.8 2.2-2.2.8 2.2.8.8 2.2.8-2.2 2.2-.8-2.2-.8ZM5.5 14l-.6 1.6-1.6.6 1.6.6.6 1.6.6-1.6 1.6-.6-1.6-.6Z"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15M10 11v6M14 11v6"/>',
  grip: '<circle cx="8" cy="7" r="1"/><circle cx="16" cy="7" r="1"/><circle cx="8" cy="12" r="1"/><circle cx="16" cy="12" r="1"/><circle cx="8" cy="17" r="1"/><circle cx="16" cy="17" r="1"/>',
  minus: '<path d="M5 12h14"/>',
  play: '<path d="m8 5 11 7-11 7Z"/>',
  pause: '<path d="M9 5v14M15 5v14"/>',
	more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
	phone: '<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 2 .7 2.9a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.5c.9.3 1.9.6 2.9.7a2 2 0 0 1 1.7 2Z"/>',
  mic: '<path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3M8 22h8"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v4M12 16h.01"/>',
  alertTriangle: '<path d="M10.3 3.7 2.2 18a2 2 0 0 0 1.8 3h16a2 2 0 0 0 1.8-3L13.7 3.7a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  hypothesis: '<path d="M9 3h6M10 3v4.5l-5 9A3 3 0 0 0 7.6 21h8.8a3 3 0 0 0 2.6-4.5l-5-9V3"/><path d="M8 14h8"/>',
  testTube: '<path d="m14.5 2-9 9a4.2 4.2 0 0 0 6 6l9-9"/><path d="m13 6 5 5M6.5 10.5l7 7"/>',
  inbox: '<path d="M4 4h16v14H4z"/><path d="M4 13h4l2 3h4l2-3h4"/>',
  undo: '<path d="M9 14 4 9l5-5"/><path d="M4 9h9a7 7 0 0 1 7 7v4"/>',
};

function icon(name, className = '') {
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name] || iconPaths.help}</svg>`;
}

const statusLabels = {
  draft: 'Черновик', inbox: 'Новая идея', review: 'На рассмотрении', main: 'Главная идея',
  rejected: 'Отклонено', planned: 'Не начато', in_progress: 'В работе', blocked: 'Заблокировано',
  completed: 'Выполнено', postponed: 'Перенесено', cancelled: 'Отменено', archived: 'Архив',
};

function statusLabel(record) {
  if (record?.type === 'task' && record.status === 'review') return 'На проверке';
	if (record?.type === 'decision' && record.status === 'completed') return 'Принято';
	if (record?.type === 'research' && record.status === 'completed') return 'Завершено';
  if (record?.type === 'risk' && record.status === 'completed') return 'Снижен';
  if (record?.type === 'experiment' && record.status === 'completed') return 'Проверен';
  if (record?.type === 'inbox' && record.status === 'inbox') return 'Нужно разобрать';
  return statusLabels[record?.status] || record?.status || '';
}

const statusesByType = {
  idea: ['inbox', 'review', 'main', 'rejected'],
  goal: ['planned', 'in_progress', 'blocked', 'completed', 'postponed', 'cancelled'],
  task: ['planned', 'in_progress', 'blocked', 'review', 'postponed', 'completed', 'cancelled'],
  question_set: ['planned', 'in_progress', 'blocked', 'completed', 'postponed', 'cancelled'],
	research: ['draft', 'in_progress', 'cancelled'],
	decision: ['completed', 'cancelled'],
  risk: ['planned', 'in_progress', 'blocked', 'review', 'completed', 'postponed', 'cancelled'],
  hypothesis: ['draft', 'review', 'in_progress', 'completed', 'rejected', 'cancelled'],
  experiment: ['planned', 'in_progress', 'blocked', 'review', 'completed', 'postponed', 'cancelled'],
  inbox: ['inbox', 'archived'],
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
  { key: 'risk', label: 'Риски', color: '#dc756f' },
  { key: 'hypothesis', label: 'Гипотезы', color: '#d9ad54' },
  { key: 'experiment', label: 'Эксперименты', color: '#7a9fc8' },
  { key: 'inbox', label: 'Входящие', color: '#9aa49f' },
  { key: 'question', label: 'Вопросы', color: '#78b5cf' },
  { key: 'answer', label: 'Ответы', color: '#e0ad54' },
  { key: 'joint_decision', label: 'Совместные итоги', color: '#58c09a' },
  { key: 'research_option', label: 'Варианты исследований', color: '#b4a8ef' },
];
const graphSettingDefaults = {
  showDiscussion: true, showOrphans: true, showArrows: true, physics: true,
  textFade: 38, nodeSize: 100, linkThickness: 100,
  centerForce: 46, repelForce: 58, linkForce: 54, linkDistance: 52,
};

const navItems = [
  ['dashboard', 'Обзор', 'dashboard', 'Работа'], ['work', 'Работа', 'checkSquare', 'Работа'],
	['chat', 'Чат', 'messages', 'Работа'],
  ['principles', 'Правила и критерии', 'bookOpen', 'Основа'], ['goal', 'Цели', 'target', 'Основа'],
  ['idea', 'Идеи', 'lightbulb', 'Бизнес'], ['research', 'Исследования', 'flask', 'Бизнес'],
  ['validation', 'Риски и проверки', 'shield', 'Бизнес'],
  ['outcomes', 'Решения и выводы', 'scale', 'Бизнес'], ['document', 'Документы', 'fileText', 'Бизнес'],
  ['graph', 'Карта связей', 'network', 'Контроль'],
  ['quality', 'Качество базы', 'shield', 'Контроль'],
  ['history', 'История', 'history', 'Контроль'],
  ['structure', 'Шаблоны карточек', 'settings', 'Настройки'],
];

const state = {
  me: null, users: [], records: [], notifications: [], activity: [], definitions: [], pendingQuestions: [],
  view: 'dashboard', search: '', statusFilter: '', ownerFilter: '', authMode: 'login', activeDetail: null,
  activeRecordTab: 'overview', activeActivity: null, historyMode: 'feed', activeRecordRequest: 0,
  workScope: 'all', workType: 'all', workStatus: 'active', workstreamFilter: 'all',
  workOrder: 'priority', workViewMode: 'list', ideaViewMode: 'board', workCalendarMonth: '', workSearchTimer: null, historyScope: 'project', historyActor: 'all', historyType: 'all',
  recordSearchTimer: null,
  graphResizeTimer: null,
  historyLoadedAll: false,
  graphData: null, graphInstance: null, graphFocusRecordId: '', graphDepth: 2, graphShowDiscussion: graphSettingDefaults.showDiscussion,
  graphBranchRootId: '', graphMoveBranch: true, graphMobileInitialized: false,
  graphTypeFilter: 'all', graphSearch: '', graphSelectedId: '', graphLinkSourceId: '', graphSettingsOpen: false,
  graphShowOrphans: graphSettingDefaults.showOrphans, graphShowArrows: graphSettingDefaults.showArrows, graphPhysics: graphSettingDefaults.physics,
  graphTextFade: graphSettingDefaults.textFade, graphNodeSize: graphSettingDefaults.nodeSize, graphLinkThickness: graphSettingDefaults.linkThickness,
  graphCenterForce: graphSettingDefaults.centerForce, graphRepelForce: graphSettingDefaults.repelForce,
  graphLinkForce: graphSettingDefaults.linkForce, graphLinkDistance: graphSettingDefaults.linkDistance,
  graphHiddenGroups: new Set(), graphGroupColors: Object.fromEntries(graphGroups.map((group) => [group.key, group.color])),
  graphSettingsLoaded: false, graphSearchTimer: null, graphTimelineTimer: null, graphTimelinePlaying: false, graphContextNodeId: '', graphDragBranch: null,
  recordWorkspace: [], activeWorkspaceRecordId: '', focusQuestionId: '',
  detailCache: new Map(), detailRequests: new Map(), searchTimer: null, suppressOverlayPop: false,
  presenceInteractions: 0, presenceLastSentAt: Date.now(), lastInteractionAt: Date.now(), aiSuggestionTimer: null,
  recordEditMode: false, editingQuestionAnswerId: '', aiAnalyses: new Map(), aiAnalysisLoading: '',
  aiQuestionDrafts: new Map(), aiQuestionDraftLoading: '', aiFieldDraftLoading: '', linkTargetIncludeInactive: false,
  researchComparisons: new Map(), researchComparisonRequests: new Map(), activeResearchOptionId: '',
  chatThreads: [], chatMessages: [], activeChatThreadId: '', chatLoadedThreadId: '', chatReplyToId: '', chatLinkedRecordId: '', chatFavoritesOnly: false,
  chatSearch: '', chatSearchOpen: false, chatDigests: new Map(), chatDigestLoading: '', chatUploadItems: [], chatEditingMessageId: '',
  chatSending: false, chatDraftNonce: '', chatDraftText: '', chatEmojiTarget: '', chatRecentEmojis: [], outcomeFilter: 'all',
  validationFilter: 'all',
  chatPollTimer: null, chatRecording: null, chatCall: null, chatIncomingCall: null, chatICEServers: null,
  savedViews: [], workingDraftTimers: new Map(), workingDraftPersistors: new WeakMap(), sidebarReturnFocus: null, liveRefreshRunning: false,
  dialogClosePending: new WeakSet(), lastDialogBackdropNotice: 0,
  syncRecordsSince: '1970-01-01T00:00:00Z', syncActivitySince: '1970-01-01T00:00:00Z',
  qualityReport: null, qualityFilter: 'all', teamCapacity: null, dashboardInsightsLoading: false,
};

const $ = (selector, root = document) => root.querySelector(selector);
const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

function renderMarkdown(value, empty = 'Не заполнено') {
  const source = String(value || '').trim();
  if (!source) return `<p class="markdown-empty">${escapeHTML(empty)}</p>`;
  if (!window.marked?.parse || !window.DOMPurify?.sanitize) return `<p>${escapeHTML(source).replace(/\n/g, '<br>')}</p>`;
  const normalized = source.replace(/^[\u200B-\u200F\uFEFF]/, '').replace(/\*{4}/g, '**\n\n**');
  const parsed = window.marked.parse(normalized, { gfm: true, breaks: true });
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

function markdownView(value, empty = 'Не заполнено') {
  return `<div class="markdown-view"><div class="markdown-body">${renderMarkdown(value, empty)}</div><button type="button" class="markdown-inline-expand" data-toggle-markdown hidden aria-expanded="false">${icon('chevronRight')} <span>Показать полностью</span></button></div>`;
}

function markdownPlain(value, empty = '') {
	const source = String(value || '').trim();
	if (!source) return empty;
  const template = document.createElement('template');
	template.innerHTML = renderMarkdown(source, empty);
	const parsed = (template.content.textContent || '').replace(/\s+/g, ' ').trim();
	if (parsed !== source.replace(/\s+/g, ' ').trim()) return parsed;
	return source
		.replace(/^#{1,6}\s+/gm, '')
		.replace(/^\s*(?:[-*+] |\d+[.)]\s+)/gm, '')
		.replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_~`>]/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

function markdownEditor(name, label, value, rows = 6, placeholder = '', suffix = '') {
  const id = `markdown-${String(name).replace(/[^a-z0-9_-]/gi, '-')}-${suffix || 'main'}`;
  const content = String(value || '').trim() ? renderMarkdown(value, '') : '';
  return `<div class="markdown-editor"><label for="${escapeHTML(id)}">${escapeHTML(label)}</label><div class="markdown-toolbar" role="toolbar" aria-label="Форматирование текста"><button type="button" data-md="bold" title="Полужирный (Ctrl+B)" aria-label="Полужирный"><b>B</b></button><button type="button" data-md="italic" title="Курсив (Ctrl+I)" aria-label="Курсив"><i>I</i></button><button type="button" data-md="heading2" title="Заголовок второго уровня (Ctrl+Alt+2)" aria-label="Заголовок второго уровня">H2</button><button type="button" data-md="list" title="Маркированный список (Ctrl+Shift+8)" aria-label="Маркированный список">${icon('menu')}</button><button type="button" data-md="ordered" title="Нумерованный список (Ctrl+Shift+7)" aria-label="Нумерованный список">1.</button><button type="button" data-md="quote" title="Цитата (Ctrl+Shift+.)" aria-label="Цитата">❯</button><button type="button" data-md="code" title="Блок кода (Ctrl+&#96;)" aria-label="Блок кода">&lt;/&gt;</button><button type="button" data-md="note" title="Примечание" aria-label="Примечание">i</button><button type="button" data-md="link" title="Ссылка (Ctrl+K)" aria-label="Ссылка">${icon('link')}</button><span class="markdown-toolbar-spacer"></span><button type="button" data-ai-draft-editor title="Предложить черновик AI" aria-label="Предложить черновик AI">${icon('sparkles')}</button><button type="button" data-open-notebook title="Развернуть редактор" aria-label="Развернуть редактор">${icon('maximize')}</button></div><div id="${escapeHTML(id)}" class="markdown-rich-editor markdown-body" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="${escapeHTML(placeholder)}" style="--editor-rows:${Math.max(3, Number(rows) || 6)}">${content}</div><textarea class="markdown-source" name="${escapeHTML(name)}" hidden tabindex="-1" aria-hidden="true">${escapeHTML(value || '')}</textarea></div>`;
}

function aiDraftTargetForEditor(editor) {
  const form = editor.closest('form');
  const name = $('.markdown-source', editor)?.name || '';
  if (!state.activeDetail?.record?.id || editor.closest('#create-dialog, #notebook-dialog')) return '';
  if (form?.id === 'record-edit-form' && ['description', 'progressNote', 'result'].includes(name)) return name;
  if (form?.classList.contains('section-form') || form?.id === 'custom-section-form') return 'section';
  if (form?.matches('[data-question-answer]')) return 'question_answer';
  if (form?.id === 'comment-form') return 'comment';
  if (form?.id === 'proof-form' || form?.classList.contains('completion-box')) return 'proof';
  return '';
}

function showAIFieldProposal(editor, draft) {
  editor.querySelector('.ai-field-proposal')?.remove();
  const proposal = document.createElement('div');
  proposal.className = 'ai-field-proposal';
  proposal.innerHTML = `<header><span>${icon('sparkles')}</span><div><strong>Черновик AI</strong><small>${escapeHTML(draft.rationale || 'Сформировано по контексту карточки')}</small></div></header><div class="markdown-body">${renderMarkdown(draft.value, '')}</div><footer><button type="button" class="primary" data-apply-ai-field>${icon('check')} Использовать</button><button type="button" class="secondary" data-dismiss-ai-field>Оставить свой текст</button></footer>`;
  editor.append(proposal);
  $('[data-apply-ai-field]', proposal).addEventListener('click', () => {
    setMarkdownEditorValue(editor, draft.value);
    proposal.remove();
    toast('AI-черновик вставлен. Его можно изменить перед сохранением');
  });
  $('[data-dismiss-ai-field]', proposal).addEventListener('click', () => proposal.remove());
}

async function requestAIFieldDraft(editor, target) {
  const button = $('[data-ai-draft-editor]', editor);
  const source = $('.markdown-source', editor);
  const form = editor.closest('form');
  const recordID = state.activeDetail?.record?.id;
  if (!button || !source || !recordID) return;
  button.disabled = true;
  button.classList.add('loading');
  try {
    const formContext = form ? Object.fromEntries([...new FormData(form).entries()].filter(([, value]) => typeof value === 'string')) : {};
    const draft = await api(`/api/records/${recordID}/ai-draft-field`, { method: 'POST', body: JSON.stringify({ target, label: editor.querySelector('label')?.textContent || target, currentValue: source.value, formContext }) });
    showAIFieldProposal(editor, draft);
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; button.classList.remove('loading'); }
}

function openNotebook({ title, value = '', onSave = null }) {
  const dialog = $('#notebook-dialog');
  const content = $('#notebook-dialog-content');
  content.innerHTML = `<div class="notebook-shell"><header><div><p class="eyebrow">Расширенный редактор</p><h2>${escapeHTML(title)}</h2></div><button type="button" class="icon-button" data-close-notebook aria-label="Закрыть">${icon('x')}</button></header><div class="notebook-body editor-only">${markdownEditor('notebookValue', 'Содержание', value, 22, 'Фиксируйте структуру, аргументы и выводы', 'fullscreen')}</div><footer><span>Ctrl+Enter — применить изменения</span><div><button type="button" class="secondary" data-close-notebook>Отмена</button><button type="button" class="primary" data-save-notebook>${icon('check')} Применить</button></div></footer></div>`;
  dialog.dataset.notebookDirty = 'false';
  $$('[data-close-notebook]', dialog).forEach((button) => button.addEventListener('click', () => requestDialogClose(dialog)));
  bindMarkdownEditors(dialog);
  const textarea = $('textarea[name="notebookValue"]', dialog);
  const richEditor = $('.markdown-rich-editor', dialog);
  const initialValue = textarea.value;
  textarea.addEventListener('input', () => { dialog.dataset.notebookDirty = String(textarea.value !== initialValue); });
  const save = () => { onSave?.(textarea.value); dialog.dataset.notebookDirty = 'false'; closeDialogImmediately(dialog); };
  $('[data-save-notebook]', dialog).addEventListener('click', save);
  richEditor.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.code === 'Enter') { event.preventDefault(); save(); } });
  openModal(dialog);
}

function richTextToMarkdown(root) {
  const children = (node) => [...node.childNodes].map(serialize).join('');
  const serialize = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return String(node.nodeValue || '').replace(/\u00a0/g, ' ');
    if (node.nodeType !== Node.ELEMENT_NODE) return '';
    const tag = node.tagName.toLowerCase();
    const body = children(node);
    if (tag === 'br') return '\n';
    if (tag === 'strong' || tag === 'b') return `**${body}**`;
    if (tag === 'em' || tag === 'i') return `*${body}*`;
    if (tag === 's' || tag === 'del') return `~~${body}~~`;
    if (tag === 'code' && node.parentElement?.tagName.toLowerCase() !== 'pre') return `\`${body.replace(/`/g, '\\`')}\``;
    if (tag === 'a') return `[${body || node.getAttribute('href') || 'ссылка'}](${node.getAttribute('href') || ''})`;
    if (/^h[1-6]$/.test(tag)) return `${'#'.repeat(Number(tag.slice(1)))} ${body.trim()}\n\n`;
    if (tag === 'p' || tag === 'div') return `${body.trimEnd()}\n\n`;
    if (tag === 'blockquote') return `${body.trim().split('\n').map((line) => `> ${line}`).join('\n')}\n\n`;
    if (tag === 'pre') return `\`\`\`\n${node.textContent || ''}\n\`\`\`\n\n`;
    if (tag === 'ul' || tag === 'ol') {
      const ordered = tag === 'ol';
      return `${[...node.children].filter((item) => item.tagName.toLowerCase() === 'li').map((item, index) => `${ordered ? `${index + 1}.` : '-'} ${children(item).trim()}`).join('\n')}\n\n`;
    }
    if (tag === 'li') return body;
    return body;
  };
  return children(root)
    .replace(/\*{4}/g, '**\n\n**')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function setMarkdownEditorValue(editor, value, notify = true) {
  const source = $('.markdown-source', editor);
  const rich = $('.markdown-rich-editor', editor);
  source.value = String(value || '');
  rich.innerHTML = source.value.trim() ? renderMarkdown(source.value, '') : '';
  if (notify) rich.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertReplacementText' }));
}

function applyRichTextAction(editor, action) {
  editor.focus();
  const commands = { bold: 'bold', italic: 'italic', list: 'insertUnorderedList', ordered: 'insertOrderedList' };
  if (commands[action]) document.execCommand(commands[action], false);
  else if (action === 'heading2') document.execCommand('formatBlock', false, 'h2');
  else if (action === 'quote' || action === 'note') document.execCommand('formatBlock', false, 'blockquote');
  else if (action === 'code') document.execCommand('formatBlock', false, 'pre');
  else if (action === 'link') {
    const selection = window.getSelection();
    const url = window.prompt('Адрес ссылки', 'https://');
    if (!url) return;
    if (selection?.isCollapsed) document.execCommand('insertHTML', false, `<a href="${escapeHTML(url)}">${escapeHTML(url)}</a>`);
    else document.execCommand('createLink', false, url);
  }
  editor.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'formatSetBlockTextDirection' }));
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
    if (editor.dataset.markdownBound === 'true') return;
    editor.dataset.markdownBound = 'true';
    const textarea = $('.markdown-source', editor);
    const richEditor = $('.markdown-rich-editor', editor);
    let restoringHistory = false;
    let historyIndex = 0;
    let editorHistory = [{ html: richEditor.innerHTML, source: textarea.value }];
    const sync = () => {
      textarea.value = richTextToMarkdown(richEditor);
      if (!restoringHistory) {
        const current = editorHistory[historyIndex];
        if (!current || current.html !== richEditor.innerHTML || current.source !== textarea.value) {
          editorHistory = editorHistory.slice(0, historyIndex + 1);
          editorHistory.push({ html: richEditor.innerHTML, source: textarea.value });
          if (editorHistory.length > 120) editorHistory.shift();
          historyIndex = editorHistory.length - 1;
        }
      }
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const restoreHistory = (direction) => {
      const nextIndex = Math.max(0, Math.min(editorHistory.length - 1, historyIndex + direction));
      if (nextIndex === historyIndex) return;
      historyIndex = nextIndex;
      const snapshot = editorHistory[historyIndex];
      restoringHistory = true;
      richEditor.innerHTML = snapshot.html;
      textarea.value = snapshot.source;
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      restoringHistory = false;
      richEditor.focus();
    };
    $$('[data-md]', editor).forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => applyRichTextAction(richEditor, button.dataset.md));
    });
    $('[data-open-notebook]', editor)?.addEventListener('click', () => openNotebook({ title: editor.querySelector('label')?.textContent || 'Редактор', value: textarea.value, onSave: (value) => setMarkdownEditorValue(editor, value) }));
    const aiDraftButton = $('[data-ai-draft-editor]', editor);
    const aiTarget = aiDraftTargetForEditor(editor);
    if (aiDraftButton && aiTarget) aiDraftButton.addEventListener('click', () => requestAIFieldDraft(editor, aiTarget));
    else if (aiDraftButton) aiDraftButton.hidden = true;
    richEditor.addEventListener('input', sync);
    richEditor.addEventListener('paste', (event) => {
      event.preventDefault();
      document.execCommand('insertText', false, event.clipboardData?.getData('text/plain') || '');
    });
    richEditor.addEventListener('beforeinput', (event) => {
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      event.preventDefault();
      restoreHistory(event.inputType === 'historyRedo' ? 1 : -1);
    });
    richEditor.addEventListener('keydown', (event) => {
      const shortcutKey = String(event.key || '').toLowerCase();
      if ((event.ctrlKey || event.metaKey) && !event.altKey && (event.code === 'KeyZ' || shortcutKey === 'z')) {
        event.preventDefault();
        event.stopPropagation();
        restoreHistory(event.shiftKey ? 1 : -1);
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.altKey && !event.shiftKey && (event.code === 'KeyY' || shortcutKey === 'y')) {
        event.preventDefault();
        event.stopPropagation();
        restoreHistory(1);
        return;
      }
      const action = markdownShortcutAction(event);
      if (action) {
        event.preventDefault();
        event.stopPropagation();
        applyRichTextAction(richEditor, action);
      } else if ((event.ctrlKey || event.metaKey) && event.code === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        editor.closest('form')?.requestSubmit();
      }
    });
  });
  bindMarkdownViews(root);
}

function bindMarkdownViews(root = document) {
  $$('.markdown-view', root).forEach((view) => {
    if (view.dataset.markdownViewBound === 'true') return;
    view.dataset.markdownViewBound = 'true';
    const body = $('.markdown-body', view);
    const button = $('[data-toggle-markdown]', view);
    requestAnimationFrame(() => {
      const threshold = Number.parseFloat(getComputedStyle(view).getPropertyValue('--markdown-collapse-height')) || 440;
      if (body.scrollHeight <= threshold + 8) return;
      view.classList.add('is-collapsible');
      button.hidden = false;
    });
    button.addEventListener('click', () => {
      const expanded = view.classList.toggle('is-expanded');
      button.setAttribute('aria-expanded', String(expanded));
      $('span', button).textContent = expanded ? 'Свернуть' : 'Показать полностью';
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
      event.preventDefault();
      event.stopPropagation();
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

function workingDraftKey(scope) {
  return `business-control:working-draft:${state.me?.id || 'anonymous'}:${scope}`;
}

function workingDraftValues(root) {
  const values = {};
  $$('[name]', root).forEach((field) => {
    if (field.disabled || field.type === 'file' || field.type === 'submit' || field.type === 'button') return;
    if (field.type === 'checkbox' || field.type === 'radio') values[field.name] = field.checked ? String(field.value || 'on') : '';
    else values[field.name] = String(field.value || '');
  });
  return values;
}

function loadWorkingDraft(scope) {
  try { return JSON.parse(localStorage.getItem(workingDraftKey(scope)) || 'null'); } catch (_) { return null; }
}

function clearWorkingDraft(scope) {
  clearTimeout(state.workingDraftTimers.get(scope));
  state.workingDraftTimers.delete(scope);
  try { localStorage.removeItem(workingDraftKey(scope)); } catch (_) {}
}

function clearWorkingDraftFor(root) {
  if (root?.dataset?.workingDraftScope) clearWorkingDraft(root.dataset.workingDraftScope);
  root?.classList.remove('has-unsaved-draft');
}

function applyWorkingDraft(root, values = {}) {
  Object.entries(values).forEach(([name, value]) => {
    const field = root.querySelector(`[name="${CSS.escape(name)}"]`);
    if (!field || field.type === 'file') return;
    if (field.type === 'checkbox' || field.type === 'radio') field.checked = String(field.value || 'on') === String(value);
    else field.value = String(value ?? '');
    field.dataset.userChanged = 'true';
    if (field.classList.contains('markdown-source')) setMarkdownEditorValue(field.closest('.markdown-editor'), field.value, false);
    if (field.tagName === 'SELECT') syncCustomSelect(field);
  });
}

function bindWorkingDraft(root, scope) {
  if (!root || !scope || root.dataset.workingDraftBound === 'true') return;
  root.dataset.workingDraftBound = 'true';
  root.dataset.workingDraftScope = scope;
  const baseline = workingDraftValues(root);
  const draft = loadWorkingDraft(scope);
  if (draft?.values && JSON.stringify(draft.values) !== JSON.stringify(baseline)) {
    applyWorkingDraft(root, draft.values);
    root.classList.add('has-unsaved-draft');
    const note = document.createElement('p');
    note.className = 'working-draft-note';
    note.textContent = 'Восстановлен несохранённый текст';
    root.prepend(note);
  }
  const persistNow = () => {
    clearTimeout(state.workingDraftTimers.get(scope));
    state.workingDraftTimers.delete(scope);
    const values = workingDraftValues(root);
    const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
    root.classList.toggle('has-unsaved-draft', dirty);
    try {
      if (!dirty) localStorage.removeItem(workingDraftKey(scope));
      else localStorage.setItem(workingDraftKey(scope), JSON.stringify({ values, savedAt: new Date().toISOString() }));
    } catch (_) {}
  };
  const persist = () => {
    root.classList.toggle('has-unsaved-draft', JSON.stringify(workingDraftValues(root)) !== JSON.stringify(baseline));
    clearTimeout(state.workingDraftTimers.get(scope));
    state.workingDraftTimers.set(scope, setTimeout(persistNow, 220));
  };
  state.workingDraftPersistors.set(root, persistNow);
  root.addEventListener('input', persist);
  root.addEventListener('change', persist);
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
  if (mod10 === 1 && mod100 !== 11) return `${count} обсуждение`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} обсуждения`;
  return `${count} обсуждений`;
}

function linksCountLabel(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod10 === 1 && mod100 !== 11) return `${count} связь с карточкой`;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return `${count} связи с карточками`;
  return `${count} связей с карточками`;
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
  return ['task', 'question_set', 'research', 'disagreement', 'meeting', 'risk', 'hypothesis', 'experiment', 'inbox'].includes(record.type);
}

function isActiveRecord(record) {
  if (isWorkRecord(record) && Number(record.progress) >= 100 && record.status !== 'review') return false;
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
	const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'same-origin',
    ...options,
		headers: { ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) },
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
  setSidebarOpen(false);
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
  const [users, records, notifications, activity, definitions, pendingQuestions, savedViews, chatThreads] = await Promise.all([
    api('/api/users'), api('/api/records?includeArchived=true'), api('/api/notifications'),
    api('/api/activity?limit=200'), api('/api/section-definitions'), api('/api/questions/pending'), api('/api/saved-views'), api('/api/chat/threads'),
  ]);
  const projectActivity = activity.filter((item) => typeMeta[item.entityType] || item.entityType === 'section_definition');
  const recordsByID = new Map(records.map((record) => [record.id, record]));
  state.detailCache.forEach((detail, id) => {
    const current = recordsByID.get(id);
    if (!current || current.updatedAt !== detail.record.updatedAt) state.detailCache.delete(id);
  });
  Object.assign(state, { users, records, notifications, activity: projectActivity, definitions, pendingQuestions, savedViews, chatThreads });
  state.syncRecordsSince = latestTimestamp(records, 'updatedAt', state.syncRecordsSince);
  state.syncActivitySince = latestTimestamp(projectActivity, 'createdAt', state.syncActivitySince);
  state.qualityReport = null;
  state.teamCapacity = null;
  state.historyLoadedAll = activity.length < 200;
  render();
}

function latestTimestamp(items, field, fallback = '1970-01-01T00:00:00Z') {
  return items.reduce((latest, item) => {
    const value = item?.[field];
    return value && new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, fallback);
}

async function syncProjectChanges({ renderCurrent = false, includeCompanions = true } = {}) {
  const query = new URLSearchParams({ recordsSince: state.syncRecordsSince, activitySince: state.syncActivitySince });
  const requests = [api(`/api/sync?${query}`)];
  if (includeCompanions) requests.push(api('/api/notifications'), api('/api/questions/pending'), api('/api/chat/threads'));
  const [changes, notifications, pendingQuestions, chatThreads] = await Promise.all(requests);
  const recordsByID = new Map(state.records.map((record) => [record.id, record]));
  let changed = false;
  (changes.records || []).forEach((record) => {
    const previous = recordsByID.get(record.id);
    if (!previous || previous.updatedAt !== record.updatedAt || JSON.stringify(previous.blockers || []) !== JSON.stringify(record.blockers || [])) changed = true;
    recordsByID.set(record.id, record);
    if (!previous || previous.updatedAt !== record.updatedAt) state.detailCache.delete(record.id);
  });
  state.records = [...recordsByID.values()];
  const knownActivity = new Set(state.activity.map((item) => item.id));
  const newActivity = (changes.activity || []).filter((item) => !knownActivity.has(item.id) && (typeMeta[item.entityType] || item.entityType === 'section_definition'));
  if (newActivity.length) state.activity = [...newActivity.slice().reverse(), ...state.activity].slice(0, 500);
  state.syncRecordsSince = latestTimestamp(changes.records || [], 'updatedAt', state.syncRecordsSince);
  state.syncActivitySince = latestTimestamp(changes.activity || [], 'createdAt', state.syncActivitySince);
  if (includeCompanions) Object.assign(state, { notifications, pendingQuestions, chatThreads });
  if (changed || newActivity.length) {
    state.qualityReport = null;
    state.teamCapacity = null;
  }
  renderNav();
  renderNotificationBadge();
  if (renderCurrent && (changed || newActivity.length || state.view === 'notifications')) renderContent();
  return { changed, activityChanged: Boolean(newActivity.length) };
}

function closeGlobalSearch({ clear = false, restoreFocus = false } = {}) {
  const search = $('#global-search');
  const input = $('#global-search-input');
  const results = $('#global-search-results');
  search.classList.remove('search-open');
  results.hidden = true;
  if (clear) {
    input.value = '';
    results.innerHTML = '';
  }
  input.blur();
  if (restoreFocus) $('#menu-button').focus({ preventScroll: true });
}

function bindGlobalEvents() {
  $$('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
  $('#auth-form').addEventListener('submit', submitAuth);
  $('#logout-button').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); location.reload(); });
  $('#profile-button').addEventListener('click', () => { setSidebarOpen(false); openProfile(state.me.id); });
  $('#new-record-button').addEventListener('click', (event) => { event.stopPropagation(); toggleCreateMenu(); });
  $('#notification-button').addEventListener('click', () => { state.view = 'notifications'; render(); });
  $('#onboarding-button').addEventListener('click', () => openOnboarding(0));
  const globalSearchInput = $('#global-search-input');
  globalSearchInput.addEventListener('input', () => {
    clearTimeout(state.searchTimer);
    state.searchTimer = setTimeout(() => runGlobalSearch(globalSearchInput.value), 180);
  });
  globalSearchInput.addEventListener('focus', () => {
    if (window.matchMedia('(max-width: 820px)').matches) $('#global-search').classList.add('search-open');
    if (globalSearchInput.value.trim()) runGlobalSearch(globalSearchInput.value);
  });
  $('#global-search-close').addEventListener('click', () => closeGlobalSearch({ clear: true, restoreFocus: true }));
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.code === 'KeyK' && !event.target.closest('.markdown-editor')) {
      event.preventDefault(); globalSearchInput.focus(); globalSearchInput.select();
    }
    if (event.key === 'Escape') {
      const transientOpen = Boolean(document.querySelector('.custom-select.open, .work-filter-menu[open], .work-create-menu[open], .record-more-actions[open], .chat-header-more[open], .chat-composer-more[open]'));
      const searchOpen = $('#global-search').classList.contains('search-open') || !$('#global-search-results').hidden;
      closeCustomSelects();
      if ($('#global-search').classList.contains('search-open')) {
        event.preventDefault();
        closeGlobalSearch({ clear: true, restoreFocus: true });
      } else if (!$('#global-search-results').hidden) $('#global-search-results').hidden = true;
      $('.work-filter-menu[open]')?.removeAttribute('open');
      $('.work-create-menu[open]')?.removeAttribute('open');
      $('.record-more-actions[open]')?.removeAttribute('open');
      $('.chat-header-more[open]')?.removeAttribute('open');
      $('.chat-composer-more[open]')?.removeAttribute('open');
      if (transientOpen) {
        event.preventDefault();
        event.stopPropagation();
      } else if (!searchOpen) {
        const dialog = [...$$('dialog[open]')].pop();
        if (dialog && protectedWorkspaceDialogs.has(dialog.id)) {
          event.preventDefault();
          event.stopPropagation();
          requestDialogClose(dialog);
        }
      }
    }
  });
  document.addEventListener('click', (event) => {
		if (event.target.closest('[data-close-chat-threads]')) $('.chat-shell')?.classList.remove('show-threads');
    if (!event.target.closest('.custom-select')) closeCustomSelects();
    if (!event.target.closest('.create-control')) $('#create-menu').hidden = true;
    if (!event.target.closest('#global-search')) {
      if (window.matchMedia('(max-width: 820px)').matches) closeGlobalSearch();
      else $('#global-search-results').hidden = true;
    }
    if (!event.target.closest('.work-filter-menu')) $('.work-filter-menu[open]')?.removeAttribute('open');
    if (!event.target.closest('.work-create-menu')) $('.work-create-menu[open]')?.removeAttribute('open');
    if (!event.target.closest('.record-more-actions')) $('.record-more-actions[open]')?.removeAttribute('open');
    if (!event.target.closest('.chat-header-more')) $('.chat-header-more[open]')?.removeAttribute('open');
    if (!event.target.closest('.chat-composer-more')) $('.chat-composer-more[open]')?.removeAttribute('open');
  });
  $('#menu-button').addEventListener('click', () => setSidebarOpen(!$('.sidebar').classList.contains('open')));
  $('#sidebar-close').addEventListener('click', () => setSidebarOpen(false));
  $('#sidebar-backdrop').addEventListener('click', (event) => {
    event.preventDefault();
    event.stopPropagation();
    setTimeout(() => setSidebarOpen(false), 0);
  });
  bindSidebarSwipe();
  bindDialogDismissalEvents();
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
    if (dialog) {
      flushDialogDrafts(dialog);
      if (dialogHasUnsavedChanges(dialog)) {
        history.pushState({ businessControlOverlay: dialog.id }, '');
        dialog.dataset.historyState = 'true';
        signalProtectedDialog(dialog, 'Есть несохранённые изменения. Сохраните их или закройте окно кнопкой ×.');
        return;
      }
      dialog.dataset.historyState = 'false';
      closeDialogImmediately(dialog);
      return;
    }
    if ($('.sidebar').classList.contains('open')) setSidebarOpen(false);
  });
  window.addEventListener('beforeunload', (event) => {
    const dialog = [...$$('dialog[open]')].pop();
    if (!dialog) return;
    flushDialogDrafts(dialog);
    if (!dialogHasUnsavedChanges(dialog)) return;
    event.preventDefault();
    event.returnValue = '';
  });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    $$('dialog[open]').forEach(flushDialogDrafts);
  });
  window.addEventListener('resize', () => {
    setSidebarOpen($('.sidebar').classList.contains('open'));
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
  setInterval(refreshLiveData, 30000);
}

function setSidebarOpen(open) {
  const sidebar = $('.sidebar');
  const workspace = $('.workspace');
  const mobile = window.matchMedia('(max-width: 820px)').matches;
  const shouldOpen = mobile && open;
  if (shouldOpen && !sidebar.classList.contains('open')) state.sidebarReturnFocus = document.activeElement;
  sidebar.style.removeProperty('transform');
  sidebar.classList.remove('dragging');
  sidebar.classList.toggle('open', shouldOpen);
  $('#sidebar-backdrop').classList.toggle('visible', shouldOpen);
  $('#sidebar-backdrop').tabIndex = shouldOpen ? 0 : -1;
  $('#menu-button').setAttribute('aria-expanded', shouldOpen ? 'true' : 'false');
  document.body.classList.toggle('mobile-nav-open', shouldOpen);
  workspace.inert = shouldOpen;
  workspace.setAttribute('aria-hidden', workspace.inert ? 'true' : 'false');
  if (shouldOpen) {
    sidebar.inert = false;
    sidebar.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => ($('.nav-item.active', sidebar) || $('.nav-item', sidebar) || $('#sidebar-close')).focus({ preventScroll: true }));
  } else if (state.sidebarReturnFocus?.isConnected) {
    state.sidebarReturnFocus.focus({ preventScroll: true });
    state.sidebarReturnFocus = null;
  }
  if (!shouldOpen) {
    sidebar.inert = mobile;
    sidebar.setAttribute('aria-hidden', mobile ? 'true' : 'false');
  }
}

function openModal(dialog) {
  if (dialog.open) return;
  dialog.showModal();
  history.pushState({ businessControlOverlay: dialog.id }, '');
  dialog.dataset.historyState = 'true';
}

const protectedWorkspaceDialogs = new Set(['record-dialog', 'create-dialog', 'notebook-dialog']);

function pointerIsOutsideDialog(event, dialog) {
  const rect = dialog.getBoundingClientRect();
  return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
}

function bindDialogBackdrop(dialog, onBackdrop) {
  let press = null;
  dialog.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0) return;
    press = { pointerId: event.pointerId, outside: pointerIsOutsideDialog(event, dialog) };
  });
  dialog.addEventListener('pointerup', (event) => {
    const shouldHandle = press?.pointerId === event.pointerId && press.outside && pointerIsOutsideDialog(event, dialog);
    press = null;
    if (shouldHandle) onBackdrop();
  });
  dialog.addEventListener('pointercancel', () => { press = null; });
}

function flushDialogDrafts(dialog) {
  $$('[data-working-draft-scope]', dialog).forEach((root) => state.workingDraftPersistors.get(root)?.());
  const editForm = $('#record-edit-form', dialog);
  if (editForm && state.activeDetail?.record) updateRecordFormState(editForm, state.activeDetail.record, true);
}

function dialogHasUnsavedChanges(dialog) {
  if (!dialog?.open) return false;
  if ($('#record-edit-form.dirty', dialog)) return true;
  if ($('.has-unsaved-draft', dialog)) return true;
  return dialog.dataset.notebookDirty === 'true';
}

function signalProtectedDialog(dialog, message = 'Рабочее окно закрывается кнопкой × или клавишей Escape.') {
  dialog.classList.remove('dismiss-attention');
  requestAnimationFrame(() => dialog.classList.add('dismiss-attention'));
  setTimeout(() => dialog.classList.remove('dismiss-attention'), 320);
  if (Date.now() - state.lastDialogBackdropNotice > 1800) {
    state.lastDialogBackdropNotice = Date.now();
    toast(message);
  }
}

function confirmUnsavedDialog(dialog) {
  return new Promise((resolve) => {
    const previousFocus = document.activeElement;
    const titleID = `${dialog.id}-close-title`;
    const notebook = dialog.id === 'notebook-dialog';
    const message = notebook
      ? 'Текст в расширенном редакторе ещё не применён. При закрытии изменения внутри этого окна будут отброшены.'
      : 'Изменения ещё не отправлены команде. Черновик сохранён на этом устройстве и восстановится при следующем открытии.';
    const leaveLabel = notebook ? 'Закрыть без применения' : 'Закрыть и оставить черновик';
    const guard = document.createElement('div');
    guard.className = 'dialog-close-guard';
    guard.innerHTML = `<section role="alertdialog" aria-modal="true" aria-labelledby="${titleID}"><span>${icon('edit')}</span><h3 id="${titleID}">Закрыть рабочее окно?</h3><p>${escapeHTML(message)}</p><div><button type="button" class="primary" data-keep-working>Продолжить работу</button><button type="button" class="secondary" data-leave-dialog>${escapeHTML(leaveLabel)}</button></div></section>`;
    const contentNodes = [...dialog.children];
    contentNodes.forEach((node) => { node.inert = true; });
    dialog.append(guard);
    const finish = (leave) => {
      guard.remove();
      contentNodes.forEach((node) => { node.inert = false; });
      if (!leave && previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
      resolve(leave);
    };
    $('[data-keep-working]', guard).addEventListener('click', () => finish(false));
    $('[data-leave-dialog]', guard).addEventListener('click', () => finish(true));
    guard.addEventListener('pointerdown', (event) => { if (event.target === guard) finish(false); });
    guard.addEventListener('keydown', (event) => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(false); } });
    $('[data-keep-working]', guard).focus({ preventScroll: true });
  });
}

async function confirmDialogTransition(dialog) {
  flushDialogDrafts(dialog);
  if (!dialogHasUnsavedChanges(dialog)) return true;
  if (state.dialogClosePending.has(dialog)) return false;
  state.dialogClosePending.add(dialog);
  try { return await confirmUnsavedDialog(dialog); }
  finally { state.dialogClosePending.delete(dialog); }
}

function closeDialogImmediately(dialog, returnValue = '') {
  if (!dialog?.open) return;
  dialog.dataset.notebookDirty = 'false';
  dialog.close(returnValue);
}

async function requestDialogClose(dialog, { returnValue = '' } = {}) {
  if (!dialog?.open) return true;
  const hadUnsavedChanges = dialogHasUnsavedChanges(dialog);
  if (!await confirmDialogTransition(dialog)) return false;
  if (hadUnsavedChanges) toast(dialog.id === 'notebook-dialog' ? 'Расширенный редактор закрыт без применения изменений.' : 'Окно закрыто. Несохранённый черновик оставлен на этом устройстве.');
  closeDialogImmediately(dialog, returnValue);
  return true;
}

function preventImplicitWorkspaceSubmit(form) {
  form?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.ctrlKey || event.metaKey || event.altKey) return;
    if (!event.target.matches('input:not([type="submit"]):not([type="button"]), select')) return;
    event.preventDefault();
  });
}

function bindDialogDismissalEvents() {
  $$('dialog').forEach((dialog) => {
    bindDialogBackdrop(dialog, () => {
      if (protectedWorkspaceDialogs.has(dialog.id)) signalProtectedDialog(dialog);
      else if (dialog.id === 'onboarding-dialog') finishOnboarding();
      else requestDialogClose(dialog, { returnValue: dialog.id === 'reason-dialog' ? 'cancel' : '' });
    });
    dialog.addEventListener('cancel', (event) => {
      if (!protectedWorkspaceDialogs.has(dialog.id)) return;
      event.preventDefault();
      requestDialogClose(dialog);
    });
  });
}

function bindSidebarSwipe() {
  const sidebar = $('.sidebar');
  const backdrop = $('#sidebar-backdrop');
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let deltaX = 0;
  let horizontal = false;
  const finish = () => {
    if (pointerId === null) return;
    const shouldClose = horizontal && deltaX < -64;
    pointerId = null;
    sidebar.classList.remove('dragging');
    sidebar.style.removeProperty('transform');
    backdrop.style.removeProperty('opacity');
    if (shouldClose) setSidebarOpen(false);
  };
  sidebar.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || !sidebar.classList.contains('open') || !window.matchMedia('(max-width: 820px)').matches) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    deltaX = 0;
    horizontal = false;
    sidebar.setPointerCapture?.(pointerId);
  });
  sidebar.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const moveX = event.clientX - startX;
    const moveY = event.clientY - startY;
    if (!horizontal && Math.abs(moveX) > 10) horizontal = Math.abs(moveX) > Math.abs(moveY);
    if (!horizontal) return;
    event.preventDefault();
    deltaX = Math.min(0, moveX);
    sidebar.classList.add('dragging');
    sidebar.style.transform = `translateX(${Math.max(-252, deltaX)}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 + deltaX / 252));
  });
  sidebar.addEventListener('pointerup', finish);
  sidebar.addEventListener('pointercancel', finish);
}

function workspaceHasActiveInput() {
  const active = document.activeElement;
  return Boolean(
    active?.matches('input, textarea, [contenteditable="true"]') ||
    document.querySelector('.chat-message-menu[open], .chat-header-more[open], .chat-composer-more[open], .chat-emoji-picker, .chat-composer-context > div, .chat-main.drag-files, .chat-composer.is-recording')
  );
}

async function refreshLiveData() {
  if (!state.me || document.hidden || state.liveRefreshRunning) return;
  state.liveRefreshRunning = true;
  try {
    const result = await syncProjectChanges();
    const overlayOpen = Boolean(document.querySelector('dialog[open]')) || $('.sidebar').classList.contains('open');
    if (!workspaceHasActiveInput() && !overlayOpen && state.view !== 'graph' && (result.changed || result.activityChanged || state.view === 'notifications')) renderContent();
  } catch (_) {
    // A background refresh must not interrupt active work. Foreground API actions report their errors explicitly.
  } finally {
    state.liveRefreshRunning = false;
  }
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
      closeGlobalSearch({ clear: true });
      const tab = button.dataset.targetTab || (button.dataset.researchOptionId ? 'content' : button.dataset.questionId ? 'questions' : 'overview');
      await openRecord(button.dataset.recordId, { tab, questionId: button.dataset.questionId, workspace: $('#record-dialog').open });
    }));
  } catch (error) {
    resultsNode.innerHTML = `<div class="search-empty">${escapeHTML(error.message)}</div>`;
  }
}

function renderSearchResult(result) {
  const meta = typeMeta[result.type] || { singular: result.type === 'question' ? 'Вопрос' : result.type === 'answer' ? 'Ответ' : result.type === 'joint_decision' ? 'Совместный итог' : 'Запись', icon: result.type === 'question' || result.type === 'answer' ? 'messages' : result.type === 'joint_decision' ? 'scale' : 'fileText' };
  const context = markdownPlain(result.context || '', '').replace(/\s+/g, ' ').trim();
  const entityLabels = { research_option: 'Вариант исследования', section: 'Раздел карточки', comment: 'Комментарий', checklist: 'Шаг задачи', proof: 'Доказательство', attachment: 'Файл' };
  const label = entityLabels[result.entityKind] || meta.singular;
  return `<button type="button" class="global-search-result" data-search-result="${result.id}" data-record-id="${result.recordId}" data-question-id="${result.questionId || ''}" data-research-option-id="${result.researchOptionId || ''}" data-target-tab="${result.targetTab || ''}"><span class="type-icon">${icon(meta.icon)}</span><span><small>${escapeHTML(label)}</small><strong>${escapeHTML(result.title)}</strong>${context ? `<em>${escapeHTML(context.slice(0, 150))}${context.length > 150 ? '…' : ''}</em>` : ''}</span>${icon('chevronRight')}</button>`;
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
			: key === 'chat' ? state.chatThreads.reduce((sum, thread) => sum + thread.unreadCount, 0)
      : key === 'validation' ? state.records.filter((record) => ['risk', 'hypothesis', 'experiment'].includes(record.type) && record.status !== 'archived').length
      : key === 'outcomes' ? state.records.filter((record) => record.type === 'decision' || (record.type === 'research' && record.status === 'completed')).length
      : typeMeta[key] ? state.records.filter((record) => record.type === key && record.status !== 'archived').length : '';
    const groupLabel = group !== itemGroup ? `<p class="nav-group">${escapeHTML(itemGroup)}</p>` : '';
    group = itemGroup;
    return `${groupLabel}<button type="button" class="nav-item ${state.view === key ? 'active' : ''}" data-view="${key}" title="${escapeHTML(label)}">${icon(iconName)}<span>${escapeHTML(label)}</span>${count !== '' ? `<b>${count}</b>` : ''}</button>`;
  }).join('');
  $$('[data-view]', $('#main-nav')).forEach((button) => button.addEventListener('click', () => {
		navigateToView(button.dataset.view);
  }));
}

function renderContent() {
  const titles = Object.fromEntries(navItems);
  $('#main-content').classList.toggle('graph-main-content', state.view === 'graph');
  if (state.view !== 'graph' && state.graphInstance) {
    state.graphInstance.destroy(); state.graphInstance = null;
  }
  $('#page-title').textContent = titles[state.view] || (state.view === 'notifications' ? 'Уведомления' : state.view === 'quality' ? 'Качество базы' : 'Обзор');
  if (state.view === 'dashboard') return renderDashboard();
  if (state.view === 'work') return renderWorkList();
	if (state.view === 'chat') return renderChat();
  if (state.view === 'outcomes') return renderOutcomes();
  if (state.view === 'validation') return renderValidation();
  if (state.view === 'graph') return renderGraph();
  if (typeMeta[state.view]) return renderRecordList(state.view);
  if (state.view === 'history') return renderHistory();
  if (state.view === 'principles') return renderPrinciples();
  if (state.view === 'quality') return renderQuality();
  if (state.view === 'structure') return renderStructure();
  if (state.view === 'notifications') return renderNotifications();
}

function renderDashboard() {
  const work = state.records.filter((record) => isWorkRecord(record) && isActiveRecord(record));
  const myWork = work.filter((record) => record.ownerId === state.me.id);
  const attention = myWork.filter((record) => ['overdue', 'urgent'].includes(deadlineState(record).className) || ['high', 'critical'].includes(record.priority));
  const capacityByUser = new Map((state.teamCapacity || []).map((item) => [item.user.id, item]));
  const qualityIssues = state.qualityReport?.issues || [];
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
        <div class="quick-actions"><button type="button" class="quick-action capture" data-quick-create="inbox"><span class="quick-icon">${icon('inbox')}</span><span><strong>Записать входящее</strong><small>Мысль без выбора типа и оценки</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action idea" data-quick-create="idea"><span class="quick-icon">${icon('lightbulb')}</span><span><strong>Идея</strong><small>Название, детали позже</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action task" data-quick-create="task"><span class="quick-icon">${icon('checkSquare')}</span><span><strong>Задача</strong><small>Кто, что и когда</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action discussion" data-quick-create="question_set"><span class="quick-icon">${icon('messages')}</span><span><strong>Вопросы</strong><small>Два ответа и итог</small></span>${icon('chevronRight')}</button></div>
      </aside>
    </section>
    <section class="dashboard-grid">
      <div class="section-panel">
        <div class="section-heading"><div><p class="eyebrow">Команда</p><h3>Недельная загрузка</h3></div><span class="panel-note">Только работа со сроком на эту неделю</span></div>
        <div class="people-load">${state.users.map((user) => renderPersonLoad(user, work, capacityByUser.get(user.id))).join('') || emptyState('Второй участник появится после регистрации.')}</div>
      </div>
      <div class="section-panel">
        <div class="section-heading"><div><p class="eyebrow">Память проекта</p><h3>Качество базы</h3></div><button class="text-button" data-go="quality">Проверить всё</button></div>
        <div class="compact-list quality-compact-list">${state.dashboardInsightsLoading && !state.qualityReport ? `<div class="dashboard-clear"><span class="spinner"></span><span><strong>Проверяем связи и результаты</strong><small>Ищем забытые и противоречивые записи.</small></span></div>` : qualityIssues.slice(0, 6).map(renderQualityCompact).join('') || `<div class="dashboard-clear">${icon('check')}<span><strong>Критичных пробелов нет</strong><small>Связи, результаты и актуальность знаний проверены.</small></span></div>`}</div>
      </div>
    </section>`;
  bindOpenRecords();
  $$('[data-quick-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.quickCreate)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => { navigateToView(button.dataset.go); }));
  loadDashboardInsights();
}

async function loadDashboardInsights(force = false) {
  if (state.dashboardInsightsLoading || (!force && state.qualityReport && state.teamCapacity)) return;
  state.dashboardInsightsLoading = true;
  try {
    const [qualityReport, teamCapacity] = await Promise.all([api('/api/quality'), api('/api/team/capacity')]);
    state.qualityReport = qualityReport;
    state.teamCapacity = teamCapacity;
  } catch (error) {
    if (state.view === 'dashboard' || state.view === 'quality') toast(`Контроль проекта не обновлён: ${error.message}`, true);
  } finally {
    state.dashboardInsightsLoading = false;
  }
  if (state.view === 'dashboard') renderDashboard();
  else if (state.view === 'quality') renderQuality();
}

const qualityIssueLabels = {
  orphan: 'Нет места в проекте', missing_result: 'Нет результата', overdue_review: 'Знание устарело',
  stale: 'Давно без движения', missing_source: 'Не указан источник', duplicate: 'Возможный дубль', cycle: 'Цикл иерархии',
};

function renderQualityCompact(issue) {
  const meta = typeMeta[issue.recordType] || typeMeta.document;
  return `<button type="button" class="compact-record quality-issue severity-${issue.severity}" data-open-record="${issue.recordId}"><span class="type-icon type-${issue.recordType}">${icon(meta.icon)}</span><span><strong>${escapeHTML(issue.title)}</strong><small>${escapeHTML(qualityIssueLabels[issue.code] || issue.message)} · ${escapeHTML(issue.message)}</small></span><em>${issue.severity === 'critical' ? 'Важно' : issue.severity === 'warning' ? 'Проверить' : 'Позже'}</em>${icon('chevronRight', 'row-chevron')}</button>`;
}

function renderQuality() {
  if (!state.qualityReport) {
    $('#main-content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">Контроль памяти</p><h1>Качество базы</h1><p>Проверяем, можно ли восстановить происхождение, решение и результат каждой цепочки.</p></div></div><div class="quality-loading"><span class="spinner"></span><strong>Проверяем проект</strong><p>Анализируем связи, результаты, актуальность и возможные дубли.</p></div>`;
    loadDashboardInsights(true);
    return;
  }
  const report = state.qualityReport;
  const filters = [['all', 'Все'], ['critical', 'Критично'], ['warning', 'Проверить'], ['info', 'Позже']];
  const issues = state.qualityFilter === 'all' ? report.issues : report.issues.filter((issue) => issue.severity === state.qualityFilter);
  $('#main-content').innerHTML = `<div class="page-heading quality-heading"><div><p class="eyebrow">Контроль памяти</p><h1>Качество базы</h1><p>Здесь нет автоматического удаления. Каждый сигнал ведёт к исходной карточке и исправляется вручную.</p></div><button type="button" class="secondary" id="refresh-quality">${icon('rotate')} Проверить снова</button></div><section class="quality-summary"><article><span>Критично</span><strong>${report.counts.critical || 0}</strong><small>мешает восстановить результат</small></article><article><span>Проверить</span><strong>${report.counts.warning || 0}</strong><small>ослабляет связи и основания</small></article><article><span>Позже</span><strong>${report.counts.info || 0}</strong><small>забытые черновики и планы</small></article></section><div class="segmented quality-filters">${filters.map(([value, label]) => `<button type="button" class="segment ${state.qualityFilter === value ? 'active' : ''}" data-quality-filter="${value}">${label}<b>${value === 'all' ? report.counts.total || 0 : report.counts[value] || 0}</b></button>`).join('')}</div><section class="quality-list">${issues.map((issue) => `<button type="button" class="quality-row severity-${issue.severity}" data-open-record="${issue.recordId}"><span class="quality-severity">${icon(issue.severity === 'critical' ? 'alertTriangle' : issue.severity === 'warning' ? 'shield' : 'clock')}</span><span><small>${escapeHTML(qualityIssueLabels[issue.code] || 'Проверка')}</small><strong>${escapeHTML(issue.title)}</strong><p>${escapeHTML(issue.message)}</p><em>${escapeHTML((typeMeta[issue.recordType] || typeMeta.document).singular)}</em></span>${icon('chevronRight')}</button>`).join('') || `<div class="guided-empty quality-empty">${icon('check')}<h3>В этом представлении пробелов нет</h3><p>Система не нашла карточек, требующих такого уровня внимания.</p></div>`}</section>`;
  $$('[data-quality-filter]').forEach((button) => button.addEventListener('click', () => { state.qualityFilter = button.dataset.qualityFilter; renderQuality(); }));
  $('#refresh-quality').addEventListener('click', () => { state.qualityReport = null; loadDashboardInsights(true); renderQuality(); });
  bindOpenRecords();
}

function navigateToView(view, options = {}) {
	const normalized = ({ goals: 'goal', tasks: 'work', ideas: 'idea' })[view] || view;
	state.view = normalized;
  state.statusFilter = options.status || '';
  state.search = options.search || '';
	state.ownerFilter = options.ownerId ? String(options.ownerId) : '';
	setSidebarOpen(false);
	window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  render();
}

function metric(label, value, note, tone = '', iconName = 'dashboard') {
  return `<div class="metric ${tone}"><span class="metric-icon">${icon(iconName)}</span><span>${escapeHTML(label)}</span><strong>${value}</strong><small>${escapeHTML(note)}</small></div>`;
}

function renderFocusRecord(record, primary = false) {
  const deadline = deadlineState(record);
	const blockers = activeBlockers(record);
  if (record.type === 'inbox') {
    return `<button type="button" class="focus-record focus-inbox ${primary ? 'primary-focus' : ''}" data-open-record="${record.id}"><span class="focus-marker">${icon(typeMeta[record.type].icon)}</span><span class="focus-copy"><small>${primary ? 'Новая запись' : 'Входящее'} · ${escapeHTML(record.ownerUsername)}</small><strong>${escapeHTML(record.title)}</strong><span><em class="inbox-state">Нужно разобрать</em></span></span><span class="focus-next-step"><b>Определить тип</b><small>Без потери карточки</small></span>${icon('chevronRight', 'row-chevron')}</button>`;
  }
  return `<button type="button" class="focus-record ${primary ? 'primary-focus' : ''} ${blockers.length ? 'has-blockers' : ''}" data-open-record="${record.id}"><span class="focus-marker">${icon(typeMeta[record.type].icon)}</span><span class="focus-copy"><small>${primary ? 'Следующая работа' : escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(record.ownerUsername)}</small><strong>${escapeHTML(record.title)}</strong><span><em class="priority priority-${record.priority || 'normal'}">${priorityLabels[record.priority || 'normal']}</em><em class="deadline ${deadline.className}">${escapeHTML(deadline.label)}</em></span></span>${blockers.length ? `<span class="focus-blocker"><b>${icon('lock')} Ждёт</b><small>${escapeHTML(blockers[0].title)}${blockers.length > 1 ? ` · ещё ${blockers.length - 1}` : ''}</small></span>` : `<span class="focus-progress"><b>${record.progress}%</b><progress class="focus-meter" max="100" value="${record.progress}"></progress></span>`}${icon('chevronRight', 'row-chevron')}</button>`;
}

function renderFocusQuestion(question, primary = false) {
  const deadline = question.dueAt ? formatDate(question.dueAt) : 'Без срока';
  return `<button type="button" class="focus-record focus-question ${primary ? 'primary-focus' : ''}" data-open-record="${question.recordId}"><span class="focus-marker">${icon('messages')}</span><span class="focus-copy"><small>Ждёт вашего ответа · ${escapeHTML(question.recordTitle)}</small><strong>${escapeHTML(question.body)}</strong><em class="deadline normal">${escapeHTML(deadline)}</em></span><span class="focus-progress"><b>Ответить</b><progress class="focus-meter" max="100" value="0"></progress></span>${icon('chevronRight', 'row-chevron')}</button>`;
}

function renderPersonLoad(user, tasks, capacity = null) {
  const owned = tasks.filter((task) => task.ownerId === user.id);
  const planned = capacity?.scheduledMinutes || 0;
  const available = capacity?.weeklyCapacityMinutes || 0;
  const utilization = capacity?.utilizationPercent || 0;
  const tone = !available ? 'unset' : utilization > 100 ? 'overload' : utilization >= 80 ? 'tight' : 'normal';
  const note = available ? `${minutesLabel(planned)} из ${minutesLabel(available)}${capacity.unscheduledRecords ? ` · ${capacity.unscheduledRecords} без недели` : ''}` : `${recordsCountLabel(owned.length)} · укажите доступное время`;
  return `<button type="button" class="person-load capacity-${tone}" data-user-profile="${user.id}"><span class="avatar">${escapeHTML(user.username.slice(0, 2).toUpperCase())}</span><span class="person-main"><strong>${escapeHTML(user.username)}</strong><small>${note}</small><progress class="progress-track" max="100" value="${Math.min(100, utilization)}"></progress></span><b>${available ? `${utilization}%` : '—'}</b></button>`;
}

function renderPrinciples() {
  const groups = [
    { kind: 'preference', title: 'Что нам подходит', copy: 'Положительные критерии выбора сфер и идей.', example: 'Например: спрос можно проверить без больших вложений.', icon: 'target' },
    { kind: 'limitation', title: 'Чего избегаем', copy: 'Ограничения, которые идея не должна нарушать.', example: 'Например: бизнес не требует постоянной публичности основателя.', icon: 'archive' },
    { kind: 'rule', title: 'Как принимаем решения', copy: 'Договорённости, к которым возвращаемся при разногласиях.', example: 'Например: контрольное решение принимает владелец направления.', icon: 'scale' },
  ];
  const records = state.records.filter((record) => (['preference', 'limitation', 'rule'].includes(record.kind) || (record.type === 'criterion' && !record.kind)) && record.status !== 'archived');
  const reviewCount = records.filter((record) => knowledgeReviewState(record).tone === 'overdue').length;
  $('#main-content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">Основа отбора</p><h1>Правила и критерии</h1><p>Рабочие выводы, которые влияют на выбор идей и совместные решения.</p></div>${reviewCount ? `<div class="knowledge-review-summary" role="status">${icon('clock')} <span><strong>${reviewCount}</strong><small>требуют проверки</small></span></div>` : ''}</div><div class="principle-grid">${groups.map((group) => {
    const items = records.filter((record) => record.kind === group.kind || (group.kind === 'preference' && record.type === 'criterion' && !record.kind));
    return `<section class="principle-column"><header><span class="type-icon">${icon(group.icon)}</span><div><h3>${group.title}</h3><p>${group.copy}</p></div><b>${items.length}</b></header><div class="principle-list">${items.map(renderPrincipleItem).join('') || `<div class="principle-empty"><p>${escapeHTML(group.example)}</p><button type="button" data-create-principle="${group.kind}">${icon('plus')} Добавить первый пункт</button></div>`}</div>${items.length ? `<button type="button" class="text-button principle-add" data-create-principle="${group.kind}">${icon('plus')} Добавить</button>` : ''}</section>`;
  }).join('')}</div>`;
  bindOpenRecords();
  $$('[data-create-principle]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.createPrinciple === 'rule' ? 'decision' : 'criterion', { kind: button.dataset.createPrinciple })));
}

function knowledgeReviewState(record) {
	const reviewAt = record.businessDetails?.reviewAt;
	if (!reviewAt) return { label: 'Без даты проверки', tone: 'normal' };
	const overdue = new Date(reviewAt).getTime() < Date.now();
	return { label: `${overdue ? 'Проверить' : 'Проверка'} · ${formatDate(reviewAt)}`, tone: overdue ? 'overdue' : 'planned' };
}

function renderPrincipleItem(record) {
	const origin = record.parentId ? state.records.find((item) => item.id === record.parentId) : null;
	const review = knowledgeReviewState(record);
	const applicability = record.businessDetails?.applicability || '';
	const sourceLabel = origin ? `${icon('link')} Из «${escapeHTML(origin.title)}»` : record.businessDetails?.sourceExcerpt ? `${icon('fileText')} Основание сохранено` : `${icon('fileText')} Источник не указан`;
	return `<button type="button" data-open-record="${record.id}" class="principle-item review-${review.tone}"><span class="principle-copy"><strong>${escapeHTML(record.title)}</strong><span>${escapeHTML(markdownPlain(record.description, 'Без пояснения'))}</span><small>${sourceLabel}${applicability ? ` · ${escapeHTML(applicability)}` : ''}</small><em>${escapeHTML(review.label)}</em></span>${icon('chevronRight')}</button>`;
}

function sortByDeadline(a, b) {
  if (!a.dueAt && !b.dueAt) return 0;
  if (!a.dueAt) return 1;
  if (!b.dueAt) return -1;
  return new Date(a.dueAt) - new Date(b.dueAt);
}

function renderCompactRecord(record) {
  const deadline = deadlineState(record);
	const blockers = activeBlockers(record);
  return `<button type="button" class="compact-record ${blockers.length ? 'has-blockers' : ''}" data-open-record="${record.id}"><span class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</span><span><strong>${escapeHTML(record.title)}</strong><small>${blockers.length ? `Ждёт: ${escapeHTML(blockers[0].title)}` : `${escapeHTML(record.ownerUsername)} · ${minutesLabel(record.estimateMinutes)}`}</small></span><em class="deadline ${blockers.length ? 'blocked' : deadline.className}">${blockers.length ? `${blockers.length} блок.` : escapeHTML(deadline.label)}</em>${icon('chevronRight', 'row-chevron')}</button>`;
}

function activeBlockers(record) {
	return Array.isArray(record?.blockers) ? record.blockers : [];
}

const workTypeFilters = [
  ['all', 'Вся работа'], ['task', 'Задачи'], ['question_set', 'Вопросы'], ['research', 'Исследования'],
  ['inbox', 'Входящие'], ['risk', 'Риски'], ['hypothesis', 'Гипотезы'], ['experiment', 'Эксперименты'],
  ['disagreement', 'Разногласия'], ['meeting', 'Встречи'],
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

function filteredWorkRecords() {
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
  return state.workOrder === 'hierarchy' ? sortWorkHierarchy(records) : records.sort(sortWorkRecords);
}

function renderWorkKanban(records) {
	const columns = [
		{ key: 'inbox', label: 'Разобрать', statuses: ['inbox'] },
		{ key: 'queued', label: 'Не начато', statuses: ['draft', 'planned'] },
		{ key: 'in_progress', label: 'В работе', statuses: ['in_progress'] },
		{ key: 'blocked', label: 'Заблокировано', statuses: ['blocked'] },
		{ key: 'review', label: 'На проверке', statuses: ['review'] },
	];
	return `<section class="work-kanban" data-drag-scroll="true">${columns.map((column) => {
		const items = records.filter((record) => column.statuses.includes(record.status));
		const empty = column.key === 'review' ? 'Отправьте задачу после результата и доказательства' : 'Перетащите карточку сюда';
		return `<div class="kanban-column" data-kanban-status="${column.key}"><header><strong>${column.label}</strong><span>${items.length}</span></header><div>${items.map((record) => { const movable = !['question_set', 'inbox'].includes(record.type); const blockers = activeBlockers(record); return `<article class="kanban-card ${blockers.length ? 'has-blockers' : ''}" draggable="${movable}" data-kanban-record="${record.id}"><button type="button" data-open-record="${record.id}"><span><i class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</i><small>${escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(workstreamLabels[record.workstream || 'business'])}</small></span><strong>${escapeHTML(record.title)}</strong><p>${escapeHTML(markdownPlain(record.description, 'Без дополнительного контекста'))}</p>${blockers.length ? `<div class="kanban-blocker">${icon('lock')}<span><small>Ждёт завершения</small><strong>${escapeHTML(blockers[0].title)}</strong></span></div>` : ''}<footer>${record.type === 'inbox' ? `<em class="inbox-state">Нужно разобрать</em>` : `<em class="priority priority-${record.priority || 'normal'}">${icon('flag')} ${priorityLabels[record.priority || 'normal']}</em><span class="deadline ${deadlineState(record).className}">${escapeHTML(deadlineState(record).label)}</span>`}</footer></button>${movable ? `<button type="button" class="kanban-move" data-kanban-move="${record.id}" aria-label="Переместить карточку" title="Переместить">${icon('grip')}</button>` : ''}</article>`; }).join('') || `<div class="kanban-empty">${empty}</div>`}</div></div>`;
	}).join('')}</section>`;
}

function resolvedBoardStatus(record, targetStatus) {
	if (targetStatus !== 'queued') return targetStatus;
	return (statusesByType[record.type] || statusesByType.default).includes('planned') ? 'planned' : 'draft';
}

function allowedBoardStatuses(record) {
	if (record.type === 'idea') return ['inbox', 'review', 'main', 'rejected'];
	if (record.type === 'task') return ['planned', 'in_progress', 'blocked', 'review', 'postponed', 'cancelled'];
	if (record.type === 'research') return ['draft', 'in_progress', 'cancelled'];
	if (record.type === 'question_set') return [];
	return (statusesByType[record.type] || statusesByType.default).filter((status) => status !== 'completed');
}

async function moveBoardRecord(recordID, targetStatus, rerender) {
	const record = state.records.find((item) => item.id === recordID);
	if (!record) return;
	targetStatus = resolvedBoardStatus(record, targetStatus);
	if (record.status === targetStatus) return;
	if (record.type === 'task' && targetStatus === 'review' && record.status !== 'review') {
		await openRecord(record.id);
		state.activeRecordTab = 'overview';
		renderRecordDialog();
		toast('Добавьте результат и доказательство, затем отправьте задачу на проверку');
		return;
	}
	if (!allowedBoardStatuses(record).includes(targetStatus)) {
		return toast(record.type === 'task' && ['review', 'completed'].includes(targetStatus) ? 'Задача отправляется на проверку только вместе с доказательством' : record.type === 'research' && targetStatus === 'completed' ? 'Исследование завершается после фиксации вывода' : 'Этот переход недоступен для карточки', true);
	}
	const reason = await askText({ title: 'Изменить этап', label: `Почему «${record.title}» переходит в «${statusLabels[targetStatus]}»?`, required: true });
	if (!reason) return rerender();
	try {
		await api(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ status: targetStatus, reason, expectedUpdatedAt: record.updatedAt }) });
		await syncProjectChanges(); rerender(); toast('Этап карточки изменён');
	} catch (error) { toast(error.message, true); rerender(); }
}

function bindBoardDnD(rerender) {
	let draggedID = '';
	$$('[data-kanban-record]').forEach((card) => {
		card.addEventListener('dragstart', (event) => { draggedID = card.dataset.kanbanRecord; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedID); });
		card.addEventListener('dragend', () => { card.classList.remove('dragging'); $$('.kanban-column.drop-target').forEach((column) => column.classList.remove('drop-target')); draggedID = ''; });
	});
	$$('[data-kanban-status]').forEach((column) => {
		column.addEventListener('dragover', (event) => { if (!draggedID) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; column.classList.add('drop-target'); });
		column.addEventListener('dragleave', (event) => { if (!column.contains(event.relatedTarget)) column.classList.remove('drop-target'); });
		column.addEventListener('drop', (event) => { event.preventDefault(); column.classList.remove('drop-target'); const id = draggedID || event.dataTransfer.getData('text/plain'); moveBoardRecord(id, column.dataset.kanbanStatus, rerender); });
	});
	$$('[data-kanban-move]').forEach((button) => button.addEventListener('click', async (event) => {
		if (button.dataset.dragged === 'true') { button.dataset.dragged = 'false'; return; }
		event.stopPropagation();
		const record = state.records.find((item) => item.id === button.dataset.kanbanMove);
		const choices = allowedBoardStatuses(record).filter((status) => status !== record.status);
		const status = await askChoice({ title: 'Переместить карточку', label: 'Новый этап', choices: choices.map((value) => ({ value, label: statusLabels[value] })) });
		if (status) moveBoardRecord(record.id, status, rerender);
	}));
	$$('[data-kanban-move]').forEach((button) => {
		let pointer = null;
		const clearPointerDrag = (active = pointer) => {
			active?.preview?.remove();
			active?.card?.classList.remove('dragging');
			$$('.kanban-column.drop-target').forEach((column) => column.classList.remove('drop-target'));
			document.body.classList.remove('kanban-pointer-drag');
		};
		button.addEventListener('pointerdown', (event) => {
			if (event.button !== undefined && event.button !== 0) return;
			const card = button.closest('[data-kanban-record]');
			pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, card, target: null, preview: null, moved: false };
			button.setPointerCapture?.(event.pointerId);
		});
		button.addEventListener('pointermove', (event) => {
			if (!pointer || event.pointerId !== pointer.id) return;
			const distance = Math.hypot(event.clientX - pointer.x, event.clientY - pointer.y);
			if (!pointer.moved && distance < 7) return;
			if (!pointer.moved) {
				pointer.moved = true;
				button.dataset.dragged = 'true';
				pointer.card.classList.add('dragging');
				document.body.classList.add('kanban-pointer-drag');
				pointer.preview = pointer.card.cloneNode(true);
				pointer.preview.className = 'kanban-drag-preview';
				pointer.preview.removeAttribute('draggable');
				document.body.append(pointer.preview);
			}
			event.preventDefault();
			pointer.preview.style.transform = `translate3d(${event.clientX + 14}px, ${event.clientY + 14}px, 0)`;
			const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-kanban-status]');
			if (target !== pointer.target) {
				pointer.target?.classList.remove('drop-target');
				pointer.target = target;
				pointer.target?.classList.add('drop-target');
			}
		}, { passive: false });
		const finishPointer = (event) => {
			if (!pointer || event.pointerId !== pointer.id) return;
			const snapshot = pointer;
			pointer = null;
			clearPointerDrag(snapshot);
			button.releasePointerCapture?.(event.pointerId);
			if (!snapshot.moved || !snapshot.target) return;
			event.preventDefault();
			event.stopPropagation();
			moveBoardRecord(button.dataset.kanbanMove, snapshot.target.dataset.kanbanStatus, rerender);
		};
		button.addEventListener('pointerup', finishPointer);
		button.addEventListener('pointercancel', (event) => { if (pointer?.id === event.pointerId) { const snapshot = pointer; pointer = null; clearPointerDrag(snapshot); } });
	});
}

function renderIdeaStageBoard(records) {
	const columns = [['inbox', 'Новые'], ['review', 'На рассмотрении'], ['main', 'Главные'], ['rejected', 'Отклонённые']];
	return `<section class="work-kanban idea-stage-board">${columns.map(([status, label]) => { const items = records.filter((record) => record.status === status); return `<div class="kanban-column idea-stage-${status}" data-kanban-status="${status}"><header><strong>${label}</strong><span>${items.length}</span></header><div>${items.map((record) => `<article class="kanban-card idea-kanban-card" draggable="true" data-kanban-record="${record.id}"><button type="button" data-open-record="${record.id}"><span><i class="type-icon type-idea">${icon('lightbulb')}</i><small>${escapeHTML(record.ownerUsername)} · ${formatDate(record.updatedAt)}</small></span><strong>${escapeHTML(record.title)}</strong><p>${escapeHTML(markdownPlain(record.description, 'Детали можно заполнить позже'))}</p></button><button type="button" class="kanban-move" data-kanban-move="${record.id}" aria-label="Переместить идею">${icon('grip')}</button></article>`).join('') || '<div class="kanban-empty">Перетащите идею сюда</div>'}</div></div>`; }).join('')}</section>`;
}

function localDateKey(value) {
  const date = new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function renderWorkCalendar(records) {
  const month = state.workCalendarMonth ? new Date(`${state.workCalendarMonth}T12:00:00`) : new Date();
  month.setDate(1);
  state.workCalendarMonth = localDateKey(month);
  const start = new Date(month);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const dueMap = new Map();
  records.filter((record) => record.dueAt).forEach((record) => {
    const key = localDateKey(record.dueAt);
    if (!dueMap.has(key)) dueMap.set(key, []);
    dueMap.get(key).push(record);
  });
  const days = Array.from({ length: 42 }, (_, index) => { const day = new Date(start); day.setDate(start.getDate() + index); return day; });
  const agendaGroups = [...dueMap.entries()]
    .filter(([key]) => {
      const day = new Date(`${key}T12:00:00`);
      return day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear();
    })
    .sort(([left], [right]) => left.localeCompare(right));
  return `<section class="work-calendar"><header><button type="button" class="icon-button" data-calendar-shift="-1" aria-label="Предыдущий месяц">‹</button><h2>${month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2><button type="button" class="icon-button" data-calendar-shift="1" aria-label="Следующий месяц">›</button></header><div class="calendar-weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${days.map((day) => {
    const key = localDateKey(day); const items = dueMap.get(key) || []; const outside = day.getMonth() !== month.getMonth(); const today = key === localDateKey(new Date());
    return `<div class="calendar-day ${outside ? 'outside' : ''} ${today ? 'today' : ''}"><span>${day.getDate()}</span><div>${items.slice(0, 4).map((record) => `<button type="button" data-open-record="${record.id}" class="calendar-item priority-${record.priority || 'normal'}"><i>${escapeHTML(typeMeta[record.type].singular)}</i><strong>${escapeHTML(record.title)}</strong></button>`).join('')}${items.length > 4 ? `<small>+ ещё ${items.length - 4}</small>` : ''}</div></div>`;
  }).join('')}</div><div class="calendar-agenda">${agendaGroups.length ? agendaGroups.map(([key, items]) => {
    const day = new Date(`${key}T12:00:00`);
    const today = key === localDateKey(new Date());
    return `<section class="calendar-agenda-day"><header><strong>${today ? 'Сегодня' : escapeHTML(day.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</strong><span>${items.length}</span></header><div>${items.sort((left, right) => new Date(left.dueAt) - new Date(right.dueAt)).map((record) => `<button type="button" data-open-record="${record.id}" class="calendar-agenda-item priority-${record.priority || 'normal'}"><span class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</span><span><small>${escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(new Date(record.dueAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))}</small><strong>${escapeHTML(record.title)}</strong><em>${escapeHTML(record.ownerUsername)}</em></span>${icon('chevronRight')}</button>`).join('')}</div></section>`;
  }).join('') : `<div class="guided-empty calendar-agenda-empty">${icon('calendar')}<h3>В этом месяце сроков нет</h3><p>Работа с назначенной датой появится здесь по порядку.</p></div>`}</div></section>`;
}

function renderWorkBody(records) {
  if (state.workViewMode === 'kanban') return renderWorkKanban(records);
  if (state.workViewMode === 'calendar') return renderWorkCalendar(records);
  return `<section class="table-panel work-table-panel"><div class="record-table work-header"><span>Работа</span><span>Ответственный</span><span>Состояние</span><span>Срок / прогресс</span></div><div class="record-rows">${records.map(renderWorkRow).join('') || `<div class="guided-empty work-empty">${icon('checkSquare')}<h3>В этом фильтре работы нет</h3><p>Измените фильтр или создайте следующий конкретный шаг.</p></div>`}</div></section>`;
}

function currentWorkViewPayload() {
  return {
    name: '', viewMode: state.workViewMode === 'list' && state.workOrder === 'hierarchy' ? 'hierarchy' : state.workViewMode,
    filters: { scope: state.workScope, ownerId: state.ownerFilter, type: state.workType, workstream: state.workstreamFilter, status: state.workStatus, order: state.workOrder, search: state.search },
  };
}

function renderWorkList() {
  const records = filteredWorkRecords();
  const activeFilters = workFilterCount();
  $('#main-content').innerHTML = `
    <div class="work-title-row"><div><p class="eyebrow">Единая очередь</p><h1>Работа команды</h1><p><strong>${records.length}</strong> ${recordsCountLabel(records.length).replace(/^\d+\s*/, '')} в текущем представлении</p></div><details class="work-create-menu"><summary class="primary">${icon('plus')} Создать работу</summary><div>${[['inbox', 'Входящее'], ['task', 'Задача'], ['question_set', 'Вопросы'], ['meeting', 'Встреча'], ['research', 'Сравнение вариантов'], ['experiment', 'Эксперимент']].map(([type, label]) => `<button type="button" data-work-create="${type}" ${type === 'research' ? 'data-work-mode="comparison"' : ''}>${icon(typeMeta[type].icon)}<span>${label}</span></button>`).join('')}</div></details></div>
    <section class="work-controls" aria-label="Фильтры рабочей очереди">
      <div class="work-scope segmented compact">${[['all', 'Вся'], ['mine', 'Моя'], ['partner', 'Партнёра']].map(([value, label]) => `<button type="button" class="segment ${!state.ownerFilter && state.workScope === value ? 'active' : ''}" data-work-scope="${value}">${label}</button>`).join('')}</div>
      <div class="search-box work-search">${icon('search')}<input id="work-search" type="search" placeholder="Найти в этой очереди" value="${escapeHTML(state.search)}"></div>
		<div class="work-view-switch segmented compact" aria-label="Вид очереди">${[['list','menu','Список'],['kanban','network','Доска'],['calendar','calendar','Календарь']].map(([value, iconName, label]) => `<button type="button" class="segment ${state.workViewMode === value ? 'active' : ''}" data-work-view="${value}" title="${label}" aria-label="${label}">${icon(iconName)}<span>${label}</span></button>`).join('')}</div>
      <details class="work-filter-menu"><summary class="secondary">${icon('sliders')} Фильтры${activeFilters ? `<b>${activeFilters}</b>` : ''}</summary><button type="button" class="work-filter-backdrop" data-close-work-filters aria-label="Закрыть фильтры"></button><div class="work-filter-popover">
        <header><strong>Представление очереди</strong><button type="button" class="icon-button" data-close-work-filters aria-label="Закрыть фильтры">${icon('x')}</button></header>
        <label>Состояние<select id="work-status-select">${[['active', 'Активная работа'], ['overdue', 'Только просроченная'], ['completed', 'Выполненная'], ['archived', 'Архив'], ['all', 'Все состояния']].map(([value, label]) => `<option value="${value}" ${state.workStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Тип работы<select id="work-type-select">${workTypeFilters.map(([value, label]) => `<option value="${value}" ${state.workType === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
        <label>Направление<select id="workstream-select">${[['all', 'Все направления'], ...Object.entries(workstreamLabels)].map(([value, label]) => `<option value="${value}" ${state.workstreamFilter === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
        <fieldset><legend>Порядок</legend><div class="segmented compact"><button type="button" class="segment ${state.workOrder === 'priority' ? 'active' : ''}" data-work-order="priority">По приоритету</button><button type="button" class="segment ${state.workOrder === 'hierarchy' ? 'active' : ''}" data-work-order="hierarchy">По иерархии</button></div></fieldset>
        <button type="button" class="text-button work-filter-reset" data-reset-work-filters>Сбросить дополнительные фильтры</button>
      </div></details>
    </section>
    <div class="work-view-summary"><span>${icon(state.workViewMode === 'calendar' ? 'calendar' : state.workViewMode === 'kanban' ? 'network' : state.workOrder === 'hierarchy' ? 'network' : 'flag')} ${state.workViewMode === 'calendar' ? 'Работа по срокам' : state.workViewMode === 'kanban' ? 'Работа по состояниям' : state.workOrder === 'hierarchy' ? 'Ветки и дочерние работы' : 'Сначала срочное и важное'}</span><span>${escapeHTML(workTypeFilters.find(([value]) => value === state.workType)?.[1] || 'Вся работа')} · ${escapeHTML(state.workstreamFilter === 'all' ? 'все направления' : workstreamLabels[state.workstreamFilter])}</span><details class="saved-view-menu"><summary class="text-button">Представления</summary><div>${state.savedViews.map((view) => `<span><button type="button" data-apply-saved-view="${view.id}">${escapeHTML(view.name)}</button><button type="button" data-delete-saved-view="${view.id}" aria-label="Удалить">${icon('x')}</button></span>`).join('') || '<p>Сохранённых представлений нет</p>'}<button type="button" data-save-work-view>${icon('plus')} Сохранить текущий вид</button><a href="/api/export?format=csv">Скачать CSV</a><a href="/api/export">Полный JSON</a></div></details></div>
    ${renderWorkBody(records)}`;
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
	$$('[data-work-view]').forEach((button) => button.addEventListener('click', () => { state.workViewMode = button.dataset.workView; renderWorkList(); }));
	$$('[data-calendar-shift]').forEach((button) => button.addEventListener('click', () => { const month = new Date(`${state.workCalendarMonth}T12:00:00`); month.setMonth(month.getMonth() + Number(button.dataset.calendarShift)); state.workCalendarMonth = localDateKey(month); renderWorkList(); }));
  $$('[data-close-work-filters]').forEach((button) => button.addEventListener('click', () => $('.work-filter-menu').removeAttribute('open')));
  $('[data-reset-work-filters]')?.addEventListener('click', () => { state.workType = 'all'; state.workstreamFilter = 'all'; state.workStatus = 'active'; state.workOrder = 'priority'; renderWorkList(); });
  $$('[data-work-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.workCreate, { comparisonMode: button.dataset.workMode === 'comparison' })));
	$('[data-save-work-view]')?.addEventListener('click', async () => {
		const name = await askText({ title: 'Сохранить представление', label: 'Название', required: true });
		if (!name) return;
		const payload = currentWorkViewPayload(); payload.name = name;
		try { await api('/api/saved-views', { method: 'POST', body: JSON.stringify(payload) }); state.savedViews = await api('/api/saved-views'); renderWorkList(); toast('Представление сохранено'); } catch (error) { toast(error.message, true); }
	});
	$$('[data-apply-saved-view]').forEach((button) => button.addEventListener('click', () => {
		const view = state.savedViews.find((item) => item.id === button.dataset.applySavedView); if (!view) return;
		const filters = typeof view.filters === 'string' ? JSON.parse(view.filters) : view.filters || {};
		state.workViewMode = view.viewMode === 'hierarchy' ? 'list' : view.viewMode; state.workOrder = view.viewMode === 'hierarchy' ? 'hierarchy' : filters.order || 'priority';
		state.workScope = filters.scope || 'all'; state.ownerFilter = filters.ownerId || ''; state.workType = filters.type || 'all'; state.workstreamFilter = filters.workstream || 'all'; state.workStatus = filters.status || 'active'; state.search = filters.search || ''; renderWorkList();
	}));
	$$('[data-delete-saved-view]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/api/saved-views/${button.dataset.deleteSavedView}`, { method: 'DELETE' }); state.savedViews = state.savedViews.filter((item) => item.id !== button.dataset.deleteSavedView); renderWorkList(); toast('Представление удалено'); } catch (error) { toast(error.message, true); } }));
	if (state.workViewMode === 'kanban') bindBoardDnD(renderWorkList);
  bindOpenRecords();
}

function renderWorkRow(record) {
  const deadline = deadlineState(record);
  const priority = record.priority || 'normal';
  const parent = record.parentId ? state.records.find((item) => item.id === record.parentId) : null;
  const depth = state.workOrder === 'hierarchy' ? hierarchyDepth(record) : 0;
  const hierarchy = record.isRoot ? 'Корень проекта' : parent ? `В ветке: ${parent.title}` : 'Без родителя';
  const isInbox = record.type === 'inbox';
	const blockers = activeBlockers(record);
  return `<button type="button" class="record-table row work-row type-row-${record.type} ${state.workOrder === 'hierarchy' ? 'hierarchy-row' : ''} ${blockers.length ? 'has-blockers' : ''}" data-depth="${Math.min(depth, 6)}" data-open-record="${record.id}">
    <span class="record-title"><i class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</i><span><small>${escapeHTML(typeMeta[record.type].singular)}<b class="workstream-mark workstream-${record.workstream || 'business'}">${escapeHTML(workstreamLabels[record.workstream || 'business'])}</b></small><strong>${escapeHTML(record.title)}</strong><em>${escapeHTML(markdownPlain(record.description, 'Без дополнительного контекста'))}</em>${blockers.length ? `<i class="blocker-caption">${icon('lock')} Ждёт: ${escapeHTML(blockers[0].title)}${blockers.length > 1 ? ` · ещё ${blockers.length - 1}` : ''}</i>` : ''}${state.workOrder === 'hierarchy' || record.isRoot ? `<i class="hierarchy-caption">${icon(record.isRoot ? 'target' : 'network')} ${escapeHTML(hierarchy)}</i>` : ''}</span></span>
    <span><b class="owner-chip">${escapeHTML(record.ownerUsername)}</b><small>${record.editPolicy === 'owner_only' ? 'Только владелец' : 'Общая'}${isInbox ? '' : ` · ${minutesLabel(record.estimateMinutes)}`}</small></span>
    <span>${isInbox ? `<em class="inbox-state">Входящее</em><small>Нужно разобрать</small>` : `<em class="priority priority-${priority}">${icon('flag')} ${priorityLabels[priority]}</em><small>${escapeHTML(statusLabel(record))}</small>`}</span>
    <span>${isInbox ? `<b class="work-next-step">Определить тип</b><small>Карточка уже сохранена</small>` : `<em class="deadline ${deadline.className}">${escapeHTML(deadline.label)}</em><progress class="progress-track" max="100" value="${record.progress}"></progress><small>${record.progress}%</small>`}</span>
  </button>`;
}

function chatPresenceLabel(thread) {
	if (thread.partnerOnline) return 'в сети';
	if (!thread.partnerLastSeen) return 'ещё не заходил';
	const delta = Date.now() - new Date(thread.partnerLastSeen).getTime();
	if (delta < 5 * 60_000) return 'был недавно';
	return `был ${formatDate(thread.partnerLastSeen, true)}`;
}

function chatThreadTitle(thread) {
	if (!thread) return 'Диалог';
	return thread.kind === 'team' ? (thread.partnerUsername || 'Партнёр') : thread.title;
}

function chatClientNonce() {
	if (!state.chatDraftNonce) state.chatDraftNonce = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
	return state.chatDraftNonce;
}

function chatMessagePreview(message) {
	if (message.messageType === 'voice') return 'Голосовое сообщение';
	if (message.messageType === 'file') return message.attachment?.originalName || 'Файл';
	return markdownPlain(message.body, message.linkedRecordTitle || 'Сообщение');
}

const chatEmojiCatalog = {
	'Смайлы': ['😀','😃','😄','😁','😅','😂','🤣','😊','🙂','🙃','😉','😍','🥰','😘','😎','🤓','🧐','🤔','🫡','🤨','😐','😶','🙄','😬','😮','😴','🥳','😤','😢','😭','😡'],
	'Жесты': ['👍','👎','👌','✌️','🤞','🤝','👏','🙌','🫶','🙏','💪','👀','🧠','🫂','☝️','✋','🤚','👋','🫡','💯'],
	'Работа': ['✅','❌','⚠️','❗','❓','💡','🎯','🚀','📌','📎','📝','📊','📈','🔍','🧪','🛠️','⏳','🔥','⭐','🏆'],
	'Знаки': ['❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','✨','🎉','⚡','☀️','🌙','🔔','🔒','🔗','➡️','⬆️','⬇️'],
};

function chatRecentEmojiList() {
	if (!state.chatRecentEmojis.length) {
		try { state.chatRecentEmojis = JSON.parse(localStorage.getItem('business-control:chat-recent-emojis') || '[]'); } catch (_) { state.chatRecentEmojis = []; }
	}
	const used = state.chatMessages.flatMap((message) => message.reactions || []).sort((left, right) => right.count - left.count).map((reaction) => reaction.emoji);
	return [...new Set([...state.chatRecentEmojis, ...used, '👍','✅','❤️','😂','🤔','🔥'])].slice(0, 12);
}

function rememberChatEmoji(emoji) {
	state.chatRecentEmojis = [emoji, ...state.chatRecentEmojis.filter((item) => item !== emoji)].slice(0, 18);
	try { localStorage.setItem('business-control:chat-recent-emojis', JSON.stringify(state.chatRecentEmojis)); } catch (_) { /* Recent reactions are an optional local convenience. */ }
}

function renderChatEmojiPicker() {
	if (!state.chatEmojiTarget) return '';
	return `<section class="chat-emoji-picker" aria-label="Выбор эмодзи"><header><strong>${state.chatEmojiTarget === 'composer' ? 'Добавить эмодзи' : 'Реакция на сообщение'}</strong><button type="button" class="icon-button" data-close-chat-emoji aria-label="Закрыть">${icon('x')}</button></header><div class="chat-emoji-recent"><span>Частые</span><div>${chatRecentEmojiList().map((emoji) => `<button type="button" data-chat-emoji-choice="${escapeHTML(emoji)}">${escapeHTML(emoji)}</button>`).join('')}</div></div><div class="chat-emoji-catalog">${Object.entries(chatEmojiCatalog).map(([label, emojis]) => `<section><span>${escapeHTML(label)}</span><div>${emojis.map((emoji) => `<button type="button" data-chat-emoji-choice="${escapeHTML(emoji)}">${escapeHTML(emoji)}</button>`).join('')}</div></section>`).join('')}</div><form class="chat-emoji-custom"><input type="text" maxlength="16" inputmode="text" placeholder="Вставьте любой эмодзи" aria-label="Любой эмодзи"><button type="submit" class="secondary">Добавить</button></form></section>`;
}

function chatMediaMarkup(message, source) {
	const attachment = message.attachment;
	if (!attachment) return '';
	if (message.messageType === 'voice') {
		return `<div class="chat-voice" data-chat-audio><button type="button" class="chat-media-control" data-audio-toggle aria-label="Воспроизвести">${icon('play')}</button><div class="chat-waveform" aria-hidden="true">${Array.from({ length: 32 }, (_, index) => `<i style="--wave:${24 + ((index * 17) % 68)}%"></i>`).join('')}</div><input type="range" min="0" max="1000" value="0" data-audio-seek aria-label="Позиция голосового сообщения"><time data-audio-time>0:00</time><audio preload="metadata" src="${source}"></audio></div>`;
	}
	if (attachment.contentType?.startsWith('image/')) {
		return `<a class="chat-image" href="${source}" target="_blank" title="Открыть изображение"><img src="${source}" alt="${escapeHTML(attachment.originalName)}" loading="lazy"></a>`;
	}
	if (attachment.contentType?.startsWith('video/')) {
		return `<div class="chat-video-note"><video controls playsinline preload="metadata" src="${source}" aria-label="Видеосообщение"></video></div>`;
	}
	return `<a class="chat-file" href="${source}" target="_blank"><span class="type-icon type-document">${icon('fileText')}</span><span><strong>${escapeHTML(attachment.originalName)}</strong><small>${formatFileSize(attachment.sizeBytes)}</small></span>${icon('chevronRight')}</a>`;
}

function renderChatMessage(message) {
	const mine = message.authorId === state.me.id;
	const reply = message.replyToId ? `<button type="button" class="chat-reply-preview" data-scroll-message="${message.replyToId}"><strong>${escapeHTML(message.replyAuthor)}</strong><span>${escapeHTML(markdownPlain(message.replyBody).slice(0, 120))}</span></button>` : '';
	const linked = message.linkedRecordId ? `<button type="button" class="chat-record-link" data-open-record="${message.linkedRecordId}"><span class="type-icon type-${message.linkedRecordType}">${icon(typeMeta[message.linkedRecordType]?.icon || 'fileText')}</span><span><small>${escapeHTML(typeMeta[message.linkedRecordType]?.singular || 'Карточка')}</small><strong>${escapeHTML(message.linkedRecordTitle)}</strong></span>${icon('chevronRight')}</button>` : '';
	const media = message.attachment ? chatMediaMarkup(message, `/api/chat/attachments/${message.attachment.id}`) : '';
	const reactions = message.reactions.map((reaction) => `<button type="button" class="chat-reaction ${reaction.mine ? 'mine' : ''}" data-chat-reaction="${message.id}" data-emoji="${escapeHTML(reaction.emoji)}" title="${escapeHTML(reaction.usernames.join(', '))}"><span>${escapeHTML(reaction.emoji)}</span><b>${reaction.count}</b></button>`).join('');
	const receipt = message.readBy.at(-1);
	const read = mine ? `<span class="chat-checks ${receipt ? 'read' : ''}" title="${receipt ? `Прочитано ${escapeHTML(formatDate(receipt.readAt, true))}` : 'Отправлено'}">${receipt ? '✓✓' : '✓'}</span>` : '';
	const ownActions = mine ? `${message.messageType === 'text' ? `<button type="button" data-chat-edit="${message.id}">${icon('edit')} Редактировать</button>` : ''}<button type="button" data-chat-archive="${message.id}">${icon('archive')} Убрать из чата</button>` : '';
	const projectActions = message.body ? `<button type="button" data-chat-create="decision" data-message-id="${message.id}">${icon('scale')} Зафиксировать решение</button><button type="button" data-chat-create="task" data-message-id="${message.id}">${icon('checkSquare')} Создать задачу</button>` : '';
	const quick = chatRecentEmojiList().slice(0, 5);
	return `<article class="chat-message ${mine ? 'mine' : ''} type-${message.messageType}" id="chat-message-${message.id}" data-chat-message="${message.id}"><div class="chat-message-actions"><button type="button" data-chat-reply="${message.id}" title="Ответить" aria-label="Ответить">${icon('reply')}</button><button type="button" data-chat-emoji-more="${message.id}" title="Реакция" aria-label="Добавить реакцию">${icon('smile')}</button><details class="chat-message-menu"><summary aria-label="Другие действия">•••</summary><div><button type="button" data-chat-reply="${message.id}">${icon('reply')} Ответить</button><button type="button" data-chat-copy="${message.id}">${icon('copy')} Копировать</button><button type="button" data-chat-favorite="${message.id}">${icon('bookmark')} ${message.favorite ? 'Убрать из сохранённых' : 'Сохранить сообщение'}</button>${projectActions}${ownActions}<span>${quick.map((emoji) => `<button type="button" data-chat-reaction="${message.id}" data-emoji="${escapeHTML(emoji)}">${escapeHTML(emoji)}</button>`).join('')}<button type="button" data-chat-emoji-more="${message.id}" aria-label="Все эмодзи">${icon('smile')}</button></span></div></details></div><div class="chat-bubble">${!mine ? `<header><strong>${escapeHTML(message.authorUsername)}</strong></header>` : ''}${reply}${message.body ? `<div class="markdown-body chat-message-body">${renderMarkdown(message.body)}</div>` : ''}${linked}${media}<footer>${message.favorite ? `<span class="chat-saved" title="Сохранено">${icon('bookmark')}</span>` : ''}<time>${formatDate(message.createdAt, true)}</time>${message.editedAt ? `<span title="Изменено ${escapeHTML(formatDate(message.editedAt, true))}">изменено</span>` : ''}${read}</footer></div>${reactions ? `<div class="chat-reactions">${reactions}<button type="button" class="chat-add-reaction" data-chat-emoji-more="${message.id}" aria-label="Добавить реакцию">${icon('smile')}</button></div>` : ''}${state.chatEmojiTarget === message.id ? renderChatEmojiPicker() : ''}</article>`;
}

function renderChatTimeline(messages) {
	let previousDay = '';
	return messages.map((message) => {
		const date = new Date(message.createdAt);
		const day = Number.isNaN(date.getTime()) ? '' : date.toISOString().slice(0, 10);
		const separator = day && day !== previousDay ? `<div class="chat-day"><span>${escapeHTML(date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: date.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' }))}</span></div>` : '';
		previousDay = day || previousDay;
		return separator + renderChatMessage(message);
	}).join('');
}

function recordingTimeLabel(startedAt = Date.now()) {
	const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
	return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function decorateChatUI() {
	const main = $('.chat-main');
	const favoriteButton = $('[data-chat-favorites]');
	if (favoriteButton) {
		favoriteButton.title = state.chatFavoritesOnly ? 'Показать все сообщения' : 'Сохранённые сообщения';
		favoriteButton.setAttribute('aria-label', favoriteButton.title);
		const favoriteLabel = $('span', favoriteButton);
		if (favoriteLabel) favoriteLabel.textContent = favoriteButton.title;
	}
	if (!main) return;
	main.insertAdjacentHTML('beforeend', `<div class="chat-drop-overlay" aria-hidden="true"><span>${icon('fileText')}</span><strong>Отправить файлы</strong><small>Отпустите их в любом месте диалога</small></div>`);
	const form = $('#chat-composer');
	if (!form) return;
	if (state.chatEmojiTarget === 'composer') form.insertAdjacentHTML('beforebegin', renderChatEmojiPicker());
	if (state.chatRecording) {
		form.classList.add('is-recording');
		form.innerHTML = `<div class="chat-recording-strip"><span class="chat-recording-pulse"></span><strong>${state.chatRecording.kind === 'video' ? 'Видеосообщение' : 'Голосовое сообщение'}</strong><time data-recording-duration>${recordingTimeLabel(state.chatRecording.startedAt)}</time><button type="button" class="text-button danger-text" data-cancel-chat-recording>${icon('trash')} Отмена</button><button type="button" class="primary" data-send-chat-recording>${icon('send')} Отправить</button></div>`;
		return;
	}
}

function renderChatCallBanner(thread) {
	const call = state.chatCall?.call || state.chatIncomingCall;
	if (!call) return '';
	const incoming = call.startedBy !== state.me.id && call.status === 'ringing' && !state.chatCall;
	const active = state.chatCall?.call?.status === 'active' || state.chatCall?.connected;
	return `<section class="chat-call-banner ${incoming ? 'incoming' : active ? 'active' : ''}"><span class="chat-call-icon">${icon('phone')}</span><div><strong>${incoming ? `${escapeHTML(call.startedUsername)} звонит` : active ? 'Аудиозвонок идёт' : 'Ожидаем ответа'}</strong><small>${active ? '<span id="chat-call-duration">00:00</span> · микрофон включён' : escapeHTML(thread.partnerUsername || 'Партнёр')}</small></div>${incoming ? `<button type="button" class="success" data-accept-call>${icon('phone')} Ответить</button><button type="button" class="secondary danger-text" data-end-call>Отклонить</button>` : `<button type="button" class="secondary danger-text" data-end-call>${icon('phone')} Завершить</button>`}</section>`;
}

function renderChatDigest(thread) {
	if (state.chatDigestLoading === thread.id) {
		return `<section class="chat-digest loading"><span class="spinner"></span><div><strong>AI собирает контекст разговора</strong><small>Читаем сообщения и досье связанных карточек. Ничего не сохраняется автоматически.</small></div></section>`;
	}
	const digest = state.chatDigests.get(thread.id);
	if (!digest) return '';
	const source = digest.source === 'gemini' ? 'Gemini' : digest.source === 'groq' ? 'Groq' : 'AI';
	return `<section class="chat-digest"><header><div><span>${icon('sparkles')}</span><div><p class="eyebrow">Выжимка · ${escapeHTML(source)}</p><h3>Что зафиксировано в обсуждении</h3></div></div><button type="button" class="icon-button" data-close-chat-digest aria-label="Скрыть выжимку">${icon('x')}</button></header><div class="markdown-body">${renderMarkdown(digest.summary, 'Выжимка не сформирована.')}</div>${digest.decisions?.length ? `<div class="chat-digest-list decisions"><span>Решения</span>${digest.decisions.map((item) => `<p>${icon('check')}<span>${escapeHTML(item)}</span></p>`).join('')}</div>` : ''}${digest.openQuestions?.length ? `<div class="chat-digest-list questions"><span>Открытые вопросы</span>${digest.openQuestions.map((item) => `<p>${icon('help')}<span>${escapeHTML(item)}</span></p>`).join('')}</div>` : ''}${digest.suggestedOutputs?.length ? `<div class="chat-digest-outputs"><span>Можно вынести в проект</span>${digest.suggestedOutputs.map((output, index) => `<button type="button" data-chat-ai-output="${index}"><span class="type-icon type-${output.type}">${icon(typeMeta[output.type]?.icon || 'fileText')}</span><span><strong>${escapeHTML(typeMeta[output.type]?.singular || 'Карточка')}: ${escapeHTML(output.title)}</strong><small>${escapeHTML(output.reason || 'Предложено по обсуждению')}</small></span>${icon('plus')}</button>`).join('')}</div>` : ''}<p class="ai-disclaimer">Голосовые сообщения без расшифровки отмечаются как непрочитанные AI. Вы подтверждаете каждую новую карточку отдельно.</p></section>`;
}

function chatFilteredMessages() {
	const query = state.chatSearch.trim().toLowerCase();
	if (!query) return state.chatMessages;
	return state.chatMessages.filter((message) => `${message.body || ''} ${message.authorUsername || ''} ${message.linkedRecordTitle || ''} ${message.attachment?.originalName || ''}`.toLowerCase().includes(query));
}

function renderChat() {
	clearTimeout(state.chatPollTimer);
	if (!state.activeChatThreadId && state.chatThreads.length) state.activeChatThreadId = state.chatThreads[0].id;
	const thread = state.chatThreads.find((item) => item.id === state.activeChatThreadId);
	if (thread && state.chatLoadedThreadId !== thread.id) {
		$('#main-content').innerHTML = `<div class="chat-loading"><span class="spinner"></span><strong>Открываем диалог</strong></div>`;
		loadChatThread(thread.id);
		return;
	}
	const messages = chatFilteredMessages();
	const editingMessage = state.chatMessages.find((message) => message.id === state.chatEditingMessageId);
	const threadTitle = chatThreadTitle(thread);
	$('#main-content').innerHTML = `<section class="chat-shell">
		<button type="button" class="chat-thread-backdrop" data-close-chat-threads aria-label="Закрыть список диалогов"></button>
		<aside class="chat-thread-list"><header><div><h1>Сообщения</h1><p>Личный диалог и обсуждения карточек</p></div><button type="button" class="icon-button" data-new-chat-thread title="Новая ветка">${icon('plus')}</button></header><div>${state.chatThreads.map((item) => `<button type="button" class="chat-thread ${item.id === state.activeChatThreadId ? 'active' : ''}" data-chat-thread="${item.id}"><span class="avatar">${escapeHTML((item.kind === 'team' ? item.partnerUsername || 'П' : item.title).slice(0, 2).toUpperCase())}</span><span><strong>${escapeHTML(chatThreadTitle(item))}</strong><small>${escapeHTML(item.lastMessage || (item.kind === 'record' ? 'Обсуждение карточки' : chatPresenceLabel(item)))}</small></span><time>${item.lastMessageAt ? formatDate(item.lastMessageAt) : ''}</time>${item.unreadCount ? `<b>${item.unreadCount}</b>` : ''}</button>`).join('') || '<div class="guided-empty compact">Диалоги ещё не созданы</div>'}</div></aside>
		<main class="chat-main">${thread ? `<header class="chat-header"><button type="button" class="chat-mobile-threads icon-button" data-toggle-chat-threads title="Диалоги" aria-label="Диалоги">${icon('menu')}</button><span class="avatar">${escapeHTML((thread.partnerUsername || thread.title).slice(0, 2).toUpperCase())}</span><div><h2>${escapeHTML(threadTitle)}</h2><p class="${thread.partnerOnline ? 'online' : ''}">${thread.kind === 'record' ? `Ветка карточки · ${escapeHTML(thread.recordTitle)}` : escapeHTML(chatPresenceLabel(thread))}</p></div><div class="chat-header-actions">${thread.recordId ? `<button type="button" class="icon-button" data-open-record="${thread.recordId}" title="Открыть карточку">${icon('link')}</button>` : ''}<button type="button" class="icon-button ${state.chatSearchOpen ? 'active' : ''}" data-toggle-chat-search title="Поиск в диалоге">${icon('search')}</button><details class="chat-header-more"><summary class="icon-button" aria-label="Действия диалога" title="Действия диалога">${icon('more')}</summary><div><button type="button" data-chat-ai-digest>${icon('sparkles')}<span>Собрать AI-выжимку</span></button><button type="button" class="${state.chatFavoritesOnly ? 'active' : ''}" data-chat-favorites>${icon('bookmark')}<span>${state.chatFavoritesOnly ? 'Все сообщения' : 'Сохранённые сообщения'}</span></button><button type="button" data-start-call>${icon('phone')}<span>Аудиозвонок</span></button></div></details></div>${state.chatSearchOpen ? `<label class="chat-search">${icon('search')}<input type="search" value="${escapeHTML(state.chatSearch)}" placeholder="Найти сообщение" aria-label="Поиск в диалоге"><button type="button" data-close-chat-search aria-label="Закрыть поиск">${icon('x')}</button></label>` : ''}</header><div class="chat-context-stack">${renderChatCallBanner(thread)}${renderChatDigest(thread)}</div><div class="chat-messages" data-drag-scroll="true">${renderChatTimeline(messages) || `<div class="chat-empty"><span>${icon(state.chatSearch ? 'search' : 'messages')}</span><strong>${state.chatSearch ? 'Совпадений нет' : 'Начните разговор'}</strong><p>${state.chatSearch ? 'Измените запрос или очистите поиск.' : `Напишите ${escapeHTML(threadTitle)} или прикрепите карточку проекта.`}</p></div>`}</div><div class="chat-composer-context">${editingMessage ? `<div><span>${icon('edit')}</span><span><strong>Редактирование сообщения</strong><small>Предыдущая версия останется в журнале.</small></span><button type="button" data-clear-chat-edit>${icon('x')}</button></div>` : ''}${state.chatReplyToId ? (() => { const reply = state.chatMessages.find((item) => item.id === state.chatReplyToId); return `<div><span>${icon('reply')}</span><span><strong>Ответ ${escapeHTML(reply?.authorUsername || '')}</strong><small>${escapeHTML(chatMessagePreview(reply || {}).slice(0, 120))}</small></span><button type="button" data-clear-chat-reply aria-label="Отменить ответ">${icon('x')}</button></div>`; })() : ''}${state.chatLinkedRecordId ? (() => { const linked = state.records.find((item) => item.id === state.chatLinkedRecordId); return `<div><span>${icon('link')}</span><span><strong>Прикреплена карточка</strong><small>${escapeHTML(linked?.title || '')}</small></span><button type="button" data-clear-chat-record>${icon('x')}</button></div>`; })() : ''}</div><form class="chat-composer" id="chat-composer"><label class="chat-drop" data-chat-drop><textarea name="body" rows="1" placeholder="${editingMessage ? 'Исправьте сообщение' : 'Сообщение'}" aria-label="Сообщение" ${state.chatSending ? 'disabled' : ''}>${escapeHTML(editingMessage?.body ?? state.chatDraftText)}</textarea><input type="file" name="file" multiple hidden></label><div class="chat-composer-actions"><details class="chat-composer-more"><summary class="icon-button" title="Вложения и дополнительные действия" aria-label="Вложения и дополнительные действия">${icon('plus')}</summary><div><button type="button" class="${state.chatEmojiTarget === 'composer' ? 'active' : ''}" data-chat-composer-emoji ${state.chatSending ? 'disabled' : ''}>${icon('smile')}<span>Эмодзи</span></button><button type="button" data-chat-attach ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('fileText')}<span>Отправить файл</span></button><button type="button" data-chat-link-record ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('link')}<span>Прикрепить карточку</span></button><button type="button" data-chat-video ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('video')}<span>Видеосообщение</span></button></div></details><button type="button" class="icon-button" data-chat-voice title="Записать голосовое" aria-label="Записать голосовое" ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('mic')}</button><button type="submit" class="primary icon-button" title="${editingMessage ? 'Сохранить' : 'Отправить'}" aria-label="${editingMessage ? 'Сохранить сообщение' : 'Отправить сообщение'}" ${state.chatSending ? 'disabled' : ''}>${state.chatSending ? '<span class="spinner"></span>' : icon(editingMessage ? 'check' : 'send')}</button></div><div class="chat-upload-progress" hidden><span></span><progress max="100" value="0"></progress></div></form>` : `<div class="chat-empty"><strong>Выберите диалог</strong></div>`}</main>
	</section>`;
	decorateChatUI();
	const mobileThreadsButton = $('[data-toggle-chat-threads]');
	if (mobileThreadsButton) mobileThreadsButton.innerHTML = icon('messages');
	bindChatEvents();
	bindOpenRecords();
	requestAnimationFrame(() => { const list = $('.chat-messages'); if (list) list.scrollTop = list.scrollHeight; });
	scheduleChatPoll();
}

async function loadChatThread(threadID, silent = false) {
	try {
		const [messages, threads] = await Promise.all([api(`/api/chat/threads/${threadID}/messages${state.chatFavoritesOnly ? '?favorites=true' : ''}`), api('/api/chat/threads')]);
		state.chatMessages = messages; state.chatThreads = threads; state.chatLoadedThreadId = threadID; state.activeChatThreadId = threadID;
		await api(`/api/chat/threads/${threadID}/read`, { method: 'POST' });
		const activeThread = state.chatThreads.find((item) => item.id === threadID);
		if (activeThread) activeThread.unreadCount = 0;
		renderNav();
		if (!silent && state.view === 'chat') renderChat();
		else if (silent && state.view === 'chat' && !workspaceHasActiveInput()) renderChat();
	} catch (error) { if (!silent) toast(error.message, true); }
}

function scheduleChatPoll() {
	clearTimeout(state.chatPollTimer);
	if (state.view !== 'chat' || !state.activeChatThreadId) return;
	state.chatPollTimer = setTimeout(async () => {
		await loadChatThread(state.activeChatThreadId, true);
		await pollChatCall();
		scheduleChatPoll();
	}, 3000);
}

function renderChatUploadProgress() {
	const progressBox = $('.chat-upload-progress');
	if (!progressBox) return;
	progressBox.hidden = state.chatUploadItems.length === 0;
	progressBox.innerHTML = state.chatUploadItems.map((item) => `<div class="chat-upload-item ${item.status}"><span><strong>${escapeHTML(item.name)}</strong><small>${item.status === 'done' ? 'Загружено' : item.status === 'error' ? escapeHTML(item.error || 'Ошибка') : `${item.progress}%`}</small></span><progress max="100" value="${item.progress}"></progress></div>`).join('');
}

async function sendChatAttachment(file, itemID = '') {
	const item = state.chatUploadItems.find((entry) => entry.id === itemID);
	if (item) { item.status = 'uploading'; renderChatUploadProgress(); }
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest(); xhr.open('POST', `/api/chat/threads/${state.activeChatThreadId}/attachments`); xhr.withCredentials = true;
		xhr.upload.onprogress = (event) => { if (event.lengthComputable && item) { item.progress = Math.round(event.loaded * 100 / event.total); renderChatUploadProgress(); } };
		xhr.onload = () => xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error((() => { try { return JSON.parse(xhr.responseText).error; } catch (_) { return 'Файл не отправлен'; } })()));
		xhr.onerror = () => reject(new Error('Соединение прервано'));
		const body = new FormData(); body.append('file', file, file.name); body.append('replyToId', state.chatReplyToId); body.append('linkedRecordId', state.chatLinkedRecordId); xhr.send(body);
	}).then(() => { if (item) { item.progress = 100; item.status = 'done'; renderChatUploadProgress(); } }).catch((error) => { if (item) { item.status = 'error'; item.error = error.message; renderChatUploadProgress(); } throw error; });
}

async function uploadChatFiles(files) {
	const queue = [...files].filter((file) => file?.size > 0);
	if (!queue.length) return;
	state.chatUploadItems = queue.map((file, index) => ({ id: `${Date.now()}-${index}`, name: file.name, progress: 0, status: 'waiting', error: '' }));
	renderChatUploadProgress();
	for (let index = 0; index < queue.length; index += 1) {
		try { await sendChatAttachment(queue[index], state.chatUploadItems[index].id); }
		catch (error) { toast(`${queue[index].name}: ${error.message}`, true); }
	}
	await loadChatThread(state.activeChatThreadId);
	renderChatUploadProgress();
	setTimeout(() => { state.chatUploadItems = []; renderChatUploadProgress(); }, 1800);
}

async function startChatRecording(kind = 'voice') {
	if (state.chatRecording) return;
	try {
		const constraints = kind === 'video' ? { audio: true, video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } } } : { audio: true };
		const stream = await navigator.mediaDevices.getUserMedia(constraints);
		const preferred = kind === 'video' ? ['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'] : ['audio/webm;codecs=opus','audio/webm'];
		const mimeType = preferred.find((type) => window.MediaRecorder?.isTypeSupported?.(type)) || '';
		const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
		const recording = { kind, recorder, stream, chunks: [], startedAt: Date.now(), cancelled: false, timer: null };
		recorder.ondataavailable = (event) => { if (event.data.size) recording.chunks.push(event.data); };
		recorder.onstop = async () => {
			clearInterval(recording.timer);
			stream.getTracks().forEach((track) => track.stop());
			const shouldSend = !recording.cancelled && recording.chunks.length > 0;
			state.chatRecording = null;
			if (state.view === 'chat') renderChat();
			if (!shouldSend) return;
			const type = recorder.mimeType || (kind === 'video' ? 'video/webm' : 'audio/webm');
			const blob = new Blob(recording.chunks, { type });
			const prefix = kind === 'video' ? 'video-note' : 'voice';
			const file = new File([blob], `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.webm`, { type });
			await uploadChatFiles([file]);
		};
		state.chatRecording = recording;
		recorder.start(250);
		recording.timer = setInterval(() => { const timer = $('[data-recording-duration]'); if (timer) timer.textContent = recordingTimeLabel(recording.startedAt); }, 500);
		renderChat();
	} catch (_) { toast(kind === 'video' ? 'Не удалось получить доступ к камере и микрофону' : 'Не удалось получить доступ к микрофону', true); }
}

function finishChatRecording(send) {
	const recording = state.chatRecording;
	if (!recording) return;
	recording.cancelled = !send;
	if (recording.recorder.state !== 'inactive') recording.recorder.stop();
}

function chatTime(seconds) {
	if (!Number.isFinite(seconds)) return '0:00';
	return `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}

function bindChatMediaPlayers() {
	$$('[data-chat-audio]').forEach((player) => {
		const audio = $('audio', player); const toggle = $('[data-audio-toggle]', player); const seek = $('[data-audio-seek]', player); const label = $('[data-audio-time]', player);
		if (!audio || !toggle || !seek || !label) return;
		const paint = () => { const ratio = audio.duration ? audio.currentTime / audio.duration : 0; seek.value = String(Math.round(ratio * 1000)); label.textContent = `${chatTime(audio.currentTime)} / ${chatTime(audio.duration)}`; player.style.setProperty('--audio-progress', `${ratio * 100}%`); };
		audio.addEventListener('loadedmetadata', paint); audio.addEventListener('timeupdate', paint);
		audio.addEventListener('play', () => { toggle.innerHTML = icon('pause'); player.classList.add('playing'); });
		audio.addEventListener('pause', () => { toggle.innerHTML = icon('play'); player.classList.remove('playing'); });
		audio.addEventListener('ended', () => { audio.currentTime = 0; paint(); });
		toggle.addEventListener('click', () => { $$('[data-chat-audio] audio').forEach((item) => { if (item !== audio) item.pause(); }); if (audio.paused) audio.play(); else audio.pause(); });
		seek.addEventListener('input', () => { if (audio.duration) audio.currentTime = Number(seek.value) * audio.duration / 1000; paint(); });
	});
}

async function applyChatEmoji(emoji) {
	const value = String(emoji || '').trim();
	if (!value) return;
	rememberChatEmoji(value);
	const target = state.chatEmojiTarget;
	state.chatEmojiTarget = '';
	if (target === 'composer') {
		state.chatDraftText = `${state.chatDraftText}${state.chatDraftText && !/\s$/.test(state.chatDraftText) ? ' ' : ''}${value}`;
		renderChat();
		const textarea = $('#chat-composer textarea'); textarea?.focus(); textarea?.setSelectionRange(textarea.value.length, textarea.value.length);
		return;
	}
	try { await api(`/api/chat/messages/${target}/reaction`, { method: 'POST', body: JSON.stringify({ emoji: value }) }); await loadChatThread(state.activeChatThreadId); }
	catch (error) { toast(error.message, true); }
}

function bindChatMessageGestures() {
	$$('.chat-message').forEach((message) => {
		const bubble = $('.chat-bubble', message); const menu = $('.chat-message-menu', message);
		bubble?.addEventListener('dblclick', (event) => { if (event.target.closest('a,button,input,audio,video')) return; state.chatReplyToId = message.dataset.chatMessage; renderChat(); $('#chat-composer textarea')?.focus(); });
		bubble?.addEventListener('contextmenu', (event) => { if (!menu) return; event.preventDefault(); $$('.chat-message-menu[open]').forEach((item) => { if (item !== menu) item.removeAttribute('open'); }); menu.setAttribute('open', ''); });
		let pointer = null;
		bubble?.addEventListener('pointerdown', (event) => { if (!event.isPrimary || event.target.closest('button,a,input,audio,video,details')) return; pointer = { id: event.pointerId, x: event.clientX, y: event.clientY, delta: 0 }; });
		bubble?.addEventListener('pointermove', (event) => { if (!pointer || pointer.id !== event.pointerId) return; const dx = event.clientX - pointer.x; const dy = event.clientY - pointer.y; if (Math.abs(dx) <= Math.abs(dy) || dx < 0) return; pointer.delta = Math.min(dx, 72); bubble.style.transform = `translateX(${pointer.delta}px)`; message.classList.toggle('reply-ready', pointer.delta > 52); });
		const finish = () => { if (!pointer) return; const reply = pointer.delta > 52; pointer = null; bubble.style.removeProperty('transform'); message.classList.remove('reply-ready'); if (reply) { state.chatReplyToId = message.dataset.chatMessage; renderChat(); $('#chat-composer textarea')?.focus(); } };
		bubble?.addEventListener('pointerup', finish); bubble?.addEventListener('pointercancel', finish);
	});
}

function bindChatDropSurface() {
	const main = $('.chat-main');
	if (!main) return;
	const hasFiles = (event) => [...(event.dataTransfer?.types || [])].includes('Files');
	main.addEventListener('dragenter', (event) => { if (!hasFiles(event)) return; event.preventDefault(); main.classList.add('drag-files'); });
	main.addEventListener('dragover', (event) => { if (!hasFiles(event)) return; event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; main.classList.add('drag-files'); });
	main.addEventListener('dragleave', (event) => { if (!main.contains(event.relatedTarget)) main.classList.remove('drag-files'); });
	main.addEventListener('drop', async (event) => { if (!hasFiles(event)) return; event.preventDefault(); main.classList.remove('drag-files'); await uploadChatFiles(event.dataTransfer.files); });
}

function bindChatEvents() {
	$$('[data-chat-thread]').forEach((button) => button.addEventListener('click', () => { state.activeChatThreadId = button.dataset.chatThread; state.chatLoadedThreadId = ''; state.chatMessages = []; state.chatSearch = ''; state.chatSearchOpen = false; state.chatEditingMessageId = ''; state.chatReplyToId = ''; state.chatLinkedRecordId = ''; state.chatDraftNonce = ''; state.chatDraftText = ''; state.chatEmojiTarget = ''; $('.chat-shell')?.classList.remove('show-threads'); renderChat(); }));
	$('[data-toggle-chat-threads]')?.addEventListener('click', () => $('.chat-shell').classList.toggle('show-threads'));
	const chatThreadBackdrop = $('[data-close-chat-threads]');
	const closeChatThreads = (event) => {
		event.preventDefault();
		event.stopPropagation();
		$('.chat-shell')?.classList.remove('show-threads');
	};
	chatThreadBackdrop?.addEventListener('pointerdown', closeChatThreads);
	chatThreadBackdrop?.addEventListener('click', closeChatThreads);
	const shell = $('.chat-shell');
	shell?.addEventListener('click', (event) => { if (event.target === shell && shell.classList.contains('show-threads')) shell.classList.remove('show-threads'); });
	bindChatDrawerSwipe();
	$('[data-new-chat-thread]')?.addEventListener('click', async () => { const active = state.records.filter(isActiveRecord); const recordID = await askChoice({ title: 'Новая ветка обсуждения', label: 'Выберите карточку', choices: active.slice(0, 80).map((record) => ({ value: record.id, label: `${typeMeta[record.type].singular}: ${record.title}` })) }); if (!recordID) return; try { const thread = await api('/api/chat/threads', { method: 'POST', body: JSON.stringify({ recordId: recordID }) }); state.chatThreads = await api('/api/chat/threads'); state.activeChatThreadId = thread.id; state.chatLoadedThreadId = ''; renderChat(); } catch (error) { toast(error.message, true); } });
	$('[data-chat-favorites]')?.addEventListener('click', () => { state.chatFavoritesOnly = !state.chatFavoritesOnly; state.chatLoadedThreadId = ''; renderChat(); });
	$('[data-toggle-chat-search]')?.addEventListener('click', () => { state.chatSearchOpen = !state.chatSearchOpen; if (!state.chatSearchOpen) state.chatSearch = ''; renderChat(); requestAnimationFrame(() => $('.chat-search input')?.focus()); });
	$('[data-close-chat-search]')?.addEventListener('click', () => { state.chatSearchOpen = false; state.chatSearch = ''; renderChat(); });
	$('.chat-search input')?.addEventListener('input', (event) => {
		state.chatSearch = event.target.value;
		clearTimeout(state.chatSearchTimer);
		state.chatSearchTimer = setTimeout(() => { renderChat(); const input = $('.chat-search input'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }, 130);
	});
	$('[data-chat-ai-digest]')?.addEventListener('click', async () => {
		state.chatDigestLoading = state.activeChatThreadId; renderChat();
		try { const digest = await api(`/api/chat/threads/${state.activeChatThreadId}/ai-digest`, { method: 'POST' }); state.chatDigests.set(state.activeChatThreadId, digest); }
		catch (error) { toast(error.message, true); }
		finally { state.chatDigestLoading = ''; if (state.view === 'chat') renderChat(); }
	});
	$('[data-close-chat-digest]')?.addEventListener('click', () => { state.chatDigests.delete(state.activeChatThreadId); renderChat(); });
	$$('[data-chat-ai-output]').forEach((button) => button.addEventListener('click', () => {
		const output = state.chatDigests.get(state.activeChatThreadId)?.suggestedOutputs?.[Number(button.dataset.chatAiOutput)];
		const thread = state.chatThreads.find((item) => item.id === state.activeChatThreadId);
		if (!output) return;
		openCreateDialog(output.type, { kind: output.kind, title: output.title, description: output.description, priority: output.priority, estimateMinutes: output.estimateMinutes, sourceRecordId: thread?.recordId || '', relationType: 'produced', reason: 'Сущность извлечена AI из командного обсуждения и подтверждена пользователем' });
	}));
	$$('[data-chat-reply]').forEach((button) => button.addEventListener('click', () => { state.chatReplyToId = button.dataset.chatReply; renderChat(); $('#chat-composer textarea')?.focus(); }));
	$$('[data-chat-copy]').forEach((button) => button.addEventListener('click', async () => { const message = state.chatMessages.find((item) => item.id === button.dataset.chatCopy); if (!message) return; try { await navigator.clipboard.writeText(message.body || chatMessagePreview(message)); toast('Сообщение скопировано'); } catch (_) { toast('Не удалось скопировать сообщение', true); } }));
	$$('[data-chat-emoji-more]').forEach((button) => button.addEventListener('click', () => { state.chatEmojiTarget = state.chatEmojiTarget === button.dataset.chatEmojiMore ? '' : button.dataset.chatEmojiMore; renderChat(); }));
	$('[data-chat-composer-emoji]')?.addEventListener('click', () => { state.chatEmojiTarget = state.chatEmojiTarget === 'composer' ? '' : 'composer'; renderChat(); $('#chat-composer textarea')?.focus(); });
	$('[data-close-chat-emoji]')?.addEventListener('click', () => { state.chatEmojiTarget = ''; renderChat(); });
	$$('[data-chat-emoji-choice]').forEach((button) => button.addEventListener('click', () => applyChatEmoji(button.dataset.chatEmojiChoice)));
	$('.chat-emoji-custom')?.addEventListener('submit', (event) => { event.preventDefault(); applyChatEmoji($('input', event.currentTarget).value); });
	$('[data-clear-chat-reply]')?.addEventListener('click', () => { state.chatReplyToId = ''; renderChat(); });
	$('[data-clear-chat-record]')?.addEventListener('click', () => { state.chatLinkedRecordId = ''; renderChat(); });
	$('[data-clear-chat-edit]')?.addEventListener('click', () => { state.chatEditingMessageId = ''; renderChat(); $('#chat-composer textarea')?.focus(); });
	$$('[data-chat-edit]').forEach((button) => button.addEventListener('click', () => {
		state.chatEditingMessageId = button.dataset.chatEdit; state.chatReplyToId = ''; state.chatLinkedRecordId = '';
		renderChat(); const editor = $('#chat-composer textarea'); editor?.focus(); editor?.setSelectionRange(editor.value.length, editor.value.length);
	}));
	$$('[data-chat-archive]').forEach((button) => button.addEventListener('click', async () => {
		const reason = await askText({ title: 'Убрать сообщение из чата', label: 'Почему сообщение больше не должно отображаться?', required: true });
		if (!reason) return;
		try { await api(`/api/chat/messages/${button.dataset.chatArchive}`, { method: 'DELETE', body: JSON.stringify({ reason }) }); await loadChatThread(state.activeChatThreadId); }
		catch (error) { toast(error.message, true); }
	}));
	$$('[data-chat-favorite]').forEach((button) => button.addEventListener('click', async () => { await api(`/api/chat/messages/${button.dataset.chatFavorite}/favorite`, { method: 'POST' }); await loadChatThread(state.activeChatThreadId); }));
	$$('[data-chat-reaction]').forEach((button) => button.addEventListener('click', async () => { rememberChatEmoji(button.dataset.emoji); await api(`/api/chat/messages/${button.dataset.chatReaction}/reaction`, { method: 'POST', body: JSON.stringify({ emoji: button.dataset.emoji }) }); await loadChatThread(state.activeChatThreadId); }));
	$$('[data-chat-create]').forEach((button) => button.addEventListener('click', () => {
		const message = state.chatMessages.find((item) => item.id === button.dataset.messageId);
		if (!message?.body) return;
		const type = button.dataset.chatCreate;
		const plain = markdownPlain(message.body);
		openCreateDialog(type, {
			title: `${type === 'decision' ? 'Решение' : 'Задача'}: ${plain.slice(0, 180)}`,
			description: `${message.body}\n\nИсточник: сообщение ${message.authorUsername} от ${formatDate(message.createdAt, true)}`,
			sourceRecordId: message.linkedRecordId || '', relationType: type === 'decision' ? 'produced' : 'leads_to',
			reason: 'Карточка зафиксирована из командного обсуждения',
		});
	}));
	$$('.chat-message-menu').forEach((menu) => menu.addEventListener('toggle', () => {
		if (!menu.open) { menu.classList.remove('open-up'); return; }
		requestAnimationFrame(() => {
			const popup = menu.querySelector(':scope > div');
			const viewport = $('.chat-messages')?.getBoundingClientRect();
			const trigger = menu.querySelector('summary')?.getBoundingClientRect();
			if (!popup || !viewport || !trigger) return;
			const availableAbove = Math.max(150, trigger.top - viewport.top - 44);
			const availableBelow = Math.max(150, viewport.bottom - trigger.top - 44);
			const openUp = availableAbove > availableBelow;
			menu.classList.toggle('open-up', openUp);
			popup.style.maxHeight = `${Math.floor(openUp ? availableAbove : availableBelow)}px`;
		});
	}));
	$$('[data-scroll-message]').forEach((button) => button.addEventListener('click', () => { const message = $(`#chat-message-${CSS.escape(button.dataset.scrollMessage)}`); message?.scrollIntoView({ behavior: 'smooth', block: 'center' }); message?.classList.add('highlight'); setTimeout(() => message?.classList.remove('highlight'), 1400); }));
	$('[data-chat-link-record]')?.addEventListener('click', async () => { const records = state.records.filter(isActiveRecord); const id = await askChoice({ title: 'Прикрепить карточку', label: 'Карточка откроется прямо из сообщения', choices: records.slice(0, 80).map((record) => ({ value: record.id, label: `${typeMeta[record.type].singular}: ${record.title}` })) }); if (id) { state.chatLinkedRecordId = id; renderChat(); $('#chat-composer textarea')?.focus(); } });
	bindChatMediaPlayers(); bindChatMessageGestures(); bindChatDropSurface();
	const form = $('#chat-composer'); if (!form) return;
	if (state.chatRecording) {
		$('[data-cancel-chat-recording]', form)?.addEventListener('click', () => finishChatRecording(false));
		$('[data-send-chat-recording]', form)?.addEventListener('click', () => finishChatRecording(true));
		return;
	}
	const textarea = form.elements.body; const input = form.elements.file; const drop = $('[data-chat-drop]', form);
	textarea.addEventListener('input', () => {
		if (state.chatEditingMessageId) return;
		state.chatDraftText = textarea.value;
		state.chatDraftNonce = '';
	});
	textarea.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); form.requestSubmit(); } });
	textarea.addEventListener('paste', async (event) => { const files = [...(event.clipboardData?.files || [])]; if (!files.length) return; event.preventDefault(); await uploadChatFiles(files); });
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (state.chatSending) return;
		const body = textarea.value.trim();
		if (state.chatEditingMessageId) {
			if (!body) return toast('Сообщение не может быть пустым', true);
			state.chatSending = true; renderChat();
			try { await api(`/api/chat/messages/${state.chatEditingMessageId}`, { method: 'PATCH', body: JSON.stringify({ body }) }); state.chatEditingMessageId = ''; await loadChatThread(state.activeChatThreadId); }
			catch (error) { toast(error.message, true); }
			finally { state.chatSending = false; if (state.view === 'chat') renderChat(); }
			return;
		}
		if (!body && !state.chatLinkedRecordId) return;
		const clientNonce = chatClientNonce();
		state.chatSending = true; renderChat();
		try {
			await api(`/api/chat/threads/${state.activeChatThreadId}/messages`, { method: 'POST', body: JSON.stringify({ body, replyToId: state.chatReplyToId, linkedRecordId: state.chatLinkedRecordId, clientNonce }) });
			state.chatReplyToId = ''; state.chatLinkedRecordId = ''; state.chatDraftNonce = ''; state.chatDraftText = '';
			await loadChatThread(state.activeChatThreadId);
		} catch (error) { toast(error.message, true); }
		finally { state.chatSending = false; if (state.view === 'chat') renderChat(); }
	});
	$('[data-chat-attach]', form).addEventListener('click', () => input.click());
	input.addEventListener('change', async () => { await uploadChatFiles(input.files); input.value = ''; });
	['dragenter','dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); drop.classList.add('drag-active'); }));
	drop.addEventListener('dragleave', () => drop.classList.remove('drag-active'));
	drop.addEventListener('drop', async (event) => { event.preventDefault(); event.stopPropagation(); drop.classList.remove('drag-active'); await uploadChatFiles(event.dataTransfer.files); });
	$('[data-chat-voice]', form).addEventListener('click', () => startChatRecording('voice'));
	$('[data-chat-video]', form)?.addEventListener('click', () => startChatRecording('video'));
	$('[data-start-call]')?.addEventListener('click', startChatCall);
	$('[data-accept-call]')?.addEventListener('click', acceptChatCall);
	$$('[data-end-call]').forEach((button) => button.addEventListener('click', endChatCall));
}

function bindChatDrawerSwipe() {
	const drawer = $('.chat-thread-list'); const shell = $('.chat-shell');
	if (!drawer || !shell || !window.matchMedia('(max-width: 820px)').matches) return;
	shell.addEventListener('click', (event) => {
		if (event.target === shell && shell.classList.contains('show-threads')) shell.classList.remove('show-threads');
	});
	let pointerID = null; let startX = 0; let startY = 0; let deltaX = 0;
	const finish = () => { if (pointerID === null) return; const close = deltaX < -56; pointerID = null; drawer.style.removeProperty('transform'); drawer.classList.remove('dragging'); if (close) shell.classList.remove('show-threads'); };
	drawer.addEventListener('pointerdown', (event) => { if (!event.isPrimary) return; pointerID = event.pointerId; startX = event.clientX; startY = event.clientY; deltaX = 0; drawer.setPointerCapture?.(pointerID); });
	drawer.addEventListener('pointermove', (event) => { if (event.pointerId !== pointerID) return; const moveX = event.clientX - startX; const moveY = event.clientY - startY; if (Math.abs(moveX) < 10 || Math.abs(moveX) <= Math.abs(moveY)) return; event.preventDefault(); deltaX = Math.min(0, moveX); drawer.classList.add('dragging'); drawer.style.transform = `translateX(${deltaX}px)`; });
	drawer.addEventListener('pointerup', finish); drawer.addEventListener('pointercancel', finish);
}

function waitForIce(peer) {
	if (peer.iceGatheringState === 'complete') return Promise.resolve();
	return new Promise((resolve) => { const done = () => { if (peer.iceGatheringState === 'complete') { peer.removeEventListener('icegatheringstatechange', done); resolve(); } }; peer.addEventListener('icegatheringstatechange', done); setTimeout(resolve, 2500); });
}

async function createChatPeer() {
	if (!state.chatICEServers) {
		const config = await api('/api/chat/ice-config');
		state.chatICEServers = Array.isArray(config.iceServers) && config.iceServers.length ? config.iceServers : [{ urls: ['stun:control.e-rd.ru:3478'] }];
	}
	const peer = new RTCPeerConnection({ iceServers: state.chatICEServers });
	const localStream = await navigator.mediaDevices.getUserMedia({ audio: true }); localStream.getTracks().forEach((track) => peer.addTrack(track, localStream));
	const remoteAudio = document.createElement('audio'); remoteAudio.autoplay = true; remoteAudio.playsInline = true; remoteAudio.hidden = true; document.body.appendChild(remoteAudio);
	peer.ontrack = (event) => { remoteAudio.srcObject = event.streams[0]; };
	return { peer, localStream, remoteAudio, connected: false, startedAt: Date.now() };
}

async function startChatCall() {
	if (state.chatCall) return;
	try { const session = await createChatPeer(); const offer = await session.peer.createOffer({ offerToReceiveAudio: true }); await session.peer.setLocalDescription(offer); await waitForIce(session.peer); const call = await api(`/api/chat/threads/${state.activeChatThreadId}/calls`, { method: 'POST', body: JSON.stringify({ offerSdp: JSON.stringify(session.peer.localDescription) }) }); session.call = call; state.chatCall = session; renderChat(); } catch (error) { toast(error.message || 'Не удалось начать звонок', true); cleanupChatCall(); }
}

async function acceptChatCall() {
	const incoming = state.chatIncomingCall; if (!incoming) return;
	try { const session = await createChatPeer(); session.call = incoming; await session.peer.setRemoteDescription(JSON.parse(incoming.offerSdp)); const answer = await session.peer.createAnswer(); await session.peer.setLocalDescription(answer); await waitForIce(session.peer); const call = await api(`/api/chat/calls/${incoming.id}/answer`, { method: 'POST', body: JSON.stringify({ answerSdp: JSON.stringify(session.peer.localDescription) }) }); session.call = call; session.connected = true; state.chatCall = session; state.chatIncomingCall = null; startCallClock(); renderChat(); } catch (error) { toast(error.message || 'Не удалось принять звонок', true); cleanupChatCall(); }
}

async function pollChatCall() {
	if (!state.activeChatThreadId) return;
	try {
		const response = await fetch(`/api/chat/threads/${state.activeChatThreadId}/calls/active`, { credentials: 'same-origin' });
		if (response.status === 204) { if (!state.chatCall) state.chatIncomingCall = null; return; }
		const call = await response.json();
		if (state.chatCall?.call?.id === call.id) {
			state.chatCall.call = call;
			if (call.answerSdp && !state.chatCall.connected && call.startedBy === state.me.id) { await state.chatCall.peer.setRemoteDescription(JSON.parse(call.answerSdp)); state.chatCall.connected = true; state.chatCall.startedAt = Date.now(); startCallClock(); if (state.view === 'chat') renderChat(); }
		} else if (call.startedBy !== state.me.id) { state.chatIncomingCall = call; if (state.view === 'chat' && !workspaceHasActiveInput()) renderChat(); }
	} catch (_) {}
}

function startCallClock() {
	clearInterval(state.chatCall?.clock);
	if (!state.chatCall) return;
	state.chatCall.clock = setInterval(() => { const node = $('#chat-call-duration'); if (!node || !state.chatCall) return; const seconds = Math.floor((Date.now() - state.chatCall.startedAt) / 1000); node.textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }, 1000);
}

function cleanupChatCall() {
	if (!state.chatCall) return; clearInterval(state.chatCall.clock); state.chatCall.peer?.close(); state.chatCall.localStream?.getTracks().forEach((track) => track.stop()); state.chatCall.remoteAudio?.remove(); state.chatCall = null;
}

async function endChatCall() {
	const call = state.chatCall?.call || state.chatIncomingCall; if (!call) return;
	try { await api(`/api/chat/calls/${call.id}/end`, { method: 'POST' }); } catch (_) {}
	cleanupChatCall(); state.chatIncomingCall = null; await loadChatThread(state.activeChatThreadId);
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
    state.graphMoveBranch = saved.moveBranch ?? true;
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
      moveBranch: state.graphMoveBranch,
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
    graphLinkDistance: graphSettingDefaults.linkDistance, graphMoveBranch: true,
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
  return `<aside id="graph-settings" class="graph-settings ${state.graphSettingsOpen ? 'open' : ''}" aria-label="Настройки карты" aria-hidden="${state.graphSettingsOpen ? 'false' : 'true'}" ${state.graphSettingsOpen ? '' : 'inert'}>
    <header><div><p class="eyebrow">Graph View</p><h2>Настройки карты</h2></div><div><button type="button" class="text-button" data-reset-graph-settings>Сбросить</button><button type="button" class="icon-button" data-close-graph-settings aria-label="Закрыть">${icon('x')}</button></div></header>
    <div class="graph-settings-body">
      <section><h3>Фильтры</h3><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="showDiscussion" ${state.graphShowDiscussion ? 'checked' : ''}><span>Вопросы и ответы</span></label><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="showOrphans" ${state.graphShowOrphans ? 'checked' : ''}><span>Объекты без связей</span></label></section>
      <section><h3>Группы</h3><div class="graph-group-list">${graphGroups.map((group) => `<label class="graph-group-row"><input type="checkbox" data-graph-group="${group.key}" ${state.graphHiddenGroups.has(group.key) ? '' : 'checked'}><input type="color" data-graph-group-color="${group.key}" value="${escapeHTML(state.graphGroupColors[group.key] || group.color)}" aria-label="Цвет группы ${escapeHTML(group.label)}"><span>${escapeHTML(group.label)}</span></label>`).join('')}</div></section>
      <section><h3>Отображение</h3><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="showArrows" ${state.graphShowArrows ? 'checked' : ''}><span>Стрелки связей</span></label>${graphRange('textFade', 'Исчезновение подписей', state.graphTextFade)}${graphRange('nodeSize', 'Размер узлов', state.graphNodeSize, 70, 150)}${graphRange('linkThickness', 'Толщина связей', state.graphLinkThickness, 60, 180)}<button type="button" class="secondary graph-timeline-button" data-graph-timeline>${icon(state.graphTimelinePlaying ? 'pause' : 'play')} ${state.graphTimelinePlaying ? 'Остановить анимацию' : 'Показать развитие'}</button></section>
      <section><h3>Физика</h3><label class="graph-setting-toggle"><input type="checkbox" data-graph-setting="physics" ${state.graphPhysics ? 'checked' : ''}><span>Упругое перестроение</span></label>${graphRange('centerForce', 'Сила центра', state.graphCenterForce)}${graphRange('repelForce', 'Отталкивание', state.graphRepelForce)}${graphRange('linkForce', 'Сила связей', state.graphLinkForce)}${graphRange('linkDistance', 'Длина связей', state.graphLinkDistance)}</section>
    </div>
  </aside>`;
}

function graphBranchChoices() {
  const data = state.graphData || { nodes: [], edges: [] };
  const childCount = new Map();
  data.edges.filter((edge) => edge.relationType === 'parent_of').forEach((edge) => childCount.set(edge.source, (childCount.get(edge.source) || 0) + 1));
  return data.nodes
    .filter((node) => node.entityKind === 'record' && (node.isRoot || childCount.has(node.id) || node.id === state.graphBranchRootId))
    .sort((left, right) => Number(right.isRoot) - Number(left.isRoot) || String(left.title).localeCompare(String(right.title), 'ru'))
    .map((node) => ({ id: node.id, title: node.title, type: node.type, count: childCount.get(node.id) || 0, root: node.isRoot }));
}

async function renderGraph() {
  loadGraphSettings();
  $('#main-content').classList.add('graph-main-content');
  if (window.innerWidth <= 560 && state.graphData && !state.graphMobileInitialized) {
    state.graphMobileInitialized = true;
    if (!state.graphFocusRecordId && !state.graphBranchRootId) {
      const preferredBranch = graphBranchChoices()[0];
      if (preferredBranch) state.graphBranchRootId = preferredBranch.id;
    }
  }
  const branchChoices = graphBranchChoices();
  $('#main-content').innerHTML = `
    <section class="graph-workspace">
      <header class="graph-toolbar">
        <div class="graph-mode segmented compact"><button type="button" class="segment ${!state.graphFocusRecordId ? 'active' : ''}" data-graph-mode="global">Весь проект</button><button type="button" class="segment ${state.graphFocusRecordId ? 'active' : ''}" data-graph-mode="local" ${state.graphFocusRecordId ? '' : 'disabled'}>Локальная карта</button></div>
        <div class="search-box graph-search">${icon('search')}<input id="graph-search" type="search" value="${escapeHTML(state.graphSearch)}" placeholder="Фильтр объектов"></div>
        <label class="graph-branch-picker"><span>Ветка</span><select id="graph-branch-filter"><option value="">Все ветки проекта</option>${branchChoices.map((item) => `<option value="${item.id}" ${state.graphBranchRootId === item.id ? 'selected' : ''}>${item.root ? 'Корень' : typeMeta[item.type]?.singular || 'Карточка'}: ${escapeHTML(item.title)} (${item.count})</option>`).join('')}</select></label>
        <button type="button" class="graph-branch-move ${state.graphMoveBranch ? 'active' : ''}" id="graph-move-branch" aria-pressed="${state.graphMoveBranch}" title="${state.graphMoveBranch ? 'Родитель перемещается вместе со всеми дочерними узлами' : 'Перемещать только один выбранный узел'}">${icon('network')}<span><strong>${state.graphMoveBranch ? 'Ветка целиком' : 'Один узел'}</strong><small>${state.graphMoveBranch ? 'родитель + потомки' : 'без потомков'}</small></span></button>
        ${state.graphFocusRecordId ? `<label class="graph-depth">Глубина <input id="graph-depth" type="range" min="1" max="4" value="${state.graphDepth}"><b>${state.graphDepth}</b></label>` : ''}
        <span class="graph-count" id="graph-count"></span>
        <div class="graph-icon-actions"><button type="button" class="icon-button" id="graph-zoom-out" title="Уменьшить" aria-label="Уменьшить">${icon('minus')}</button><button type="button" class="icon-button" id="graph-zoom-in" title="Увеличить" aria-label="Увеличить">${icon('plus')}</button><button type="button" class="icon-button" id="graph-relayout" title="Перестроить карту" aria-label="Перестроить карту">${icon('rotate')}</button><button type="button" class="icon-button" id="graph-fit" title="Показать карту целиком" aria-label="Показать карту целиком">${icon('maximize')}</button><button type="button" class="icon-button ${state.graphSettingsOpen ? 'active' : ''}" id="graph-settings-toggle" title="Настройки карты" aria-label="Настройки карты">${icon('settings')}</button></div>
      </header>
      <div class="graph-stage"><div id="relationship-graph" tabindex="0" role="application" aria-label="Интерактивная карта связей"><div class="graph-loading"><span class="spinner"></span><strong>Строим карту проекта</strong></div></div><aside id="graph-inspector" class="graph-inspector ${state.graphSelectedId && !state.graphSettingsOpen ? 'open' : ''}" aria-hidden="${state.graphSelectedId && !state.graphSettingsOpen ? 'false' : 'true'}" ${state.graphSelectedId && !state.graphSettingsOpen ? '' : 'inert'}>${renderGraphInspector()}</aside>${renderGraphSettings()}<div id="graph-context-menu" class="graph-context-menu"></div></div>
      <footer class="graph-legend"><span><i class="legend-card"></i> Карточка</span><span><i class="legend-question"></i> Вопрос</span><span><i class="legend-answer"></i> Ответ</span><span><i class="legend-decision"></i> Итог</span><em>${state.graphMoveBranch ? 'Перетаскивание родителя двигает всю его ветку' : 'Перетаскивание двигает только выбранный узел'} · правый клик: действия</em></footer>
    </section>`;
  bindGraphControls();
  try {
    if (!state.graphData) {
      state.graphData = await api('/api/graph');
      if (state.view === 'graph') renderGraph();
      return;
    }
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
  if (state.graphBranchRootId && nodeByID.has(state.graphBranchRootId)) {
    const branch = new Set([state.graphBranchRootId]);
    let frontier = [state.graphBranchRootId];
    while (frontier.length) {
      const parentID = frontier.shift();
      data.edges.filter((edge) => edge.relationType === 'parent_of' && edge.source === parentID).forEach((edge) => {
        if (!branch.has(edge.target)) { branch.add(edge.target); frontier.push(edge.target); }
      });
    }
    let expanded = true;
    while (expanded) {
      expanded = false;
      data.edges.forEach((edge) => {
        const source = nodeByID.get(edge.source); const target = nodeByID.get(edge.target);
        if (branch.has(edge.source) && target?.entityKind !== 'record' && !branch.has(edge.target)) { branch.add(edge.target); expanded = true; }
        if (branch.has(edge.target) && source?.entityKind !== 'record' && !branch.has(edge.source)) { branch.add(edge.source); expanded = true; }
      });
    }
    allowed = new Set([...allowed].filter((id) => branch.has(id)));
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
  return `business-control:graph-positions:${state.me?.id || 'anonymous'}:v4`;
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
	const childRelations = new Set(['parent_of', 'contains', 'answered_by', 'decided_as', 'contains_option', 'produced', 'leads_to']);
  while (frontier.length) {
    const parentID = frontier.shift();
	cy.edges().filter((edge) => edge.source().id() === parentID && childRelations.has(edge.data('relationType'))).forEach((edge) => {
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
    nodeRepulsion: (compact ? 4400 : 5200) + state.graphRepelForce * (compact ? 88 : 110),
    idealEdgeLength: 64 + state.graphLinkDistance * (compact ? 1.55 : 1.8),
    edgeElasticity: 24 + state.graphLinkForce * 1.8,
    gravity: .02 + state.graphCenterForce * .0036,
    componentSpacing: compact ? 124 : 132, nestingFactor: 1.15,
    numIter: compact ? 900 : 1300, initialTemp: 170, coolingFactor: .96, minTemp: 1,
    fit: true, padding: window.innerWidth <= 560 ? 30 : 64, nodeDimensionsIncludeLabels: true,
  };
}

function updateGraphZoomStyles() {
  const cy = state.graphInstance;
  if (!cy) return;
  const zoom = cy.zoom();
  const fadeThreshold = window.innerWidth <= 560 ? .16 + state.graphTextFade * .0055 : .24 + state.graphTextFade * .009;
  cy.nodes().toggleClass('zoom-compact', zoom < fadeThreshold + .16).toggleClass('zoom-hidden', zoom < fadeThreshold);
  cy.edges().toggleClass('zoom-hidden', zoom < fadeThreshold + .12);
}

function ensureReadableGraphView(cy) {
  if (!cy || cy.nodes().length > 40) return;
  const nodeCount = cy.nodes().length;
  const maximumZoom = nodeCount <= 2 ? (window.innerWidth <= 560 ? .9 : 1.05) : nodeCount <= 8 ? 1.3 : Infinity;
  if (cy.zoom() > maximumZoom) {
    cy.zoom(maximumZoom);
    cy.center(cy.nodes());
    return;
  }
  const minimumZoom = nodeCount <= 18 ? (window.innerWidth <= 560 ? .62 : .9) : (window.innerWidth <= 560 ? .52 : .76);
  if (cy.zoom() >= minimumZoom) return;
  cy.zoom(minimumZoom);
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
      const size = Math.round((29 + Math.sqrt(nodeDegree + 1) * 9 + (node.isRoot ? 10 : 0)) * state.graphNodeSize / 100);
      return { data: { ...node, label: graphNodeLabel(node), size, degree: nodeDegree, color: state.graphGroupColors[graphGroupKey(node)] || '#8aa49a' }, position: savedPositions[node.id] || fallbackPosition(index), classes: `kind-${node.entityKind} type-${node.type} ${node.isRoot ? 'is-root' : ''} ${node.status === 'archived' ? 'is-archived' : ''}` };
    }),
    ...edges.map((edge) => ({ data: { id: edge.id, source: edge.source, target: edge.target, label: edge.label, relationType: edge.relationType, arrow: state.graphShowArrows ? 'triangle' : 'none' }, classes: `relation-${edge.relationType}` })),
  ];
  const container = $('#relationship-graph');
  container.innerHTML = '';
  const cy = window.cytoscape({
    container, elements, minZoom: .1, maxZoom: 3, boxSelectionEnabled: true,
    style: [
      { selector: 'node', style: { shape: 'ellipse', width: 'data(size)', height: 'data(size)', label: 'data(label)', 'font-family': 'Onest Local, sans-serif', 'font-size': 12, 'font-weight': 600, color: '#eef4f1', 'text-wrap': 'wrap', 'text-max-width': 148, 'text-valign': 'bottom', 'text-margin-y': 11, 'text-halign': 'center', 'line-height': 1.25, 'text-background-color': '#171d1a', 'text-background-opacity': .78, 'text-background-padding': 3, 'background-color': 'data(color)', 'background-opacity': .9, 'border-width': 1.5, 'border-color': '#e5eee9', 'border-opacity': .52, 'overlay-opacity': 0, 'transition-property': 'opacity, border-width, border-color, background-opacity, width, height', 'transition-duration': '.16s' } },
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
      { selector: 'node.zoom-compact', style: { 'font-size': 10 } },
      { selector: 'node.zoom-hidden', style: { 'text-opacity': 0 } },
      { selector: 'edge.zoom-hidden', style: { 'text-opacity': 0 } },
      { selector: '.link-source', style: { 'border-width': 4, 'border-color': '#ef9ca5', 'underlay-color': '#ef7180', 'underlay-opacity': .16, 'underlay-padding': 9 } },
	  { selector: 'node.branch-moving', style: { 'border-width': 3, 'border-color': '#9ee6cd', 'underlay-color': '#70caae', 'underlay-opacity': .14, 'underlay-padding': 8 } },
	  { selector: 'edge.branch-moving', style: { width: 2.4 * state.graphLinkThickness / 100, 'line-color': '#7fd1b5', 'line-opacity': .86, 'target-arrow-color': '#7fd1b5' } },
      { selector: '.timeline-hidden', style: { opacity: 0, 'text-opacity': 0 } },
    ],
    layout: usePreset ? { name: 'preset', fit: true, padding: window.innerWidth <= 560 ? 28 : 48, animate: false } : (nodes.length > 1 ? graphLayoutOptions(true, nodes.length) : { name: 'grid', fit: true, padding: 48 }),
  });
  state.graphInstance = cy;
  $('#graph-count').textContent = `${nodes.length} · ${edges.length}`;
  cy.one('layoutstop', () => { ensureReadableGraphView(cy); saveGraphPositions(cy); updateGraphZoomStyles(); });
  cy.ready(() => requestAnimationFrame(() => {
    // Preset layouts can finish before the layoutstop listener is registered.
    // Reapplying the readable floor keeps labels and tap targets usable on mobile.
    ensureReadableGraphView(cy);
    saveGraphPositions(cy);
    updateGraphZoomStyles();
  }));
  cy.on('zoom', updateGraphZoomStyles);
  cy.on('tap', 'node', (event) => selectGraphNode(event.target.id()));
  cy.on('mouseover', 'node', (event) => highlightGraphNeighborhood(event.target));
  cy.on('mouseout', 'node', applyGraphEmphasis);
  cy.on('tap', (event) => { closeGraphContextMenu(); if (event.target === cy) selectGraphNode(''); });
  cy.on('cxttap', 'node', (event) => openGraphContextMenu(event.target.id()));
  cy.on('grab', 'node', (event) => {
    const root = event.target;
    const descendants = (state.graphMoveBranch ? graphHierarchyDescendants(cy, root.id()) : [])
      .map((id) => cy.$id(id))
      .filter((node) => node.length);
    state.graphDragBranch = {
      rootID: root.id(),
      rootStart: { ...root.position() },
      descendants: descendants.map((node) => ({ node, start: { ...node.position() } })),
    };
	if (state.graphMoveBranch && descendants.length) {
		const branchNodes = root.union(descendants.reduce((collection, node) => collection.union(node), cy.collection()));
		branchNodes.addClass('branch-moving');
		cy.edges().filter((edge) => branchNodes.contains(edge.source()) && branchNodes.contains(edge.target())).addClass('branch-moving');
	}
  });
  cy.on('drag', 'node', (event) => {
    const branch = state.graphDragBranch;
    if (!branch || branch.rootID !== event.target.id() || !branch.descendants.length) return;
    const current = event.target.position();
    const delta = { x: current.x - branch.rootStart.x, y: current.y - branch.rootStart.y };
    cy.batch(() => branch.descendants.forEach(({ node, start }) => node.position({ x: start.x + delta.x, y: start.y + delta.y })));
  });
  cy.on('free', 'node', () => { cy.elements().removeClass('branch-moving'); state.graphDragBranch = null; saveGraphPositions(cy); });
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

function setGraphPanelOpen(selector, open) {
  const panel = $(selector);
  if (!panel) return;
  panel.classList.toggle('open', open);
  panel.inert = !open;
  panel.setAttribute('aria-hidden', open ? 'false' : 'true');
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
  setGraphPanelOpen('#graph-inspector', Boolean(id) && !state.graphSettingsOpen);
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
  return `<div class="graph-inspector-head"><span class="type-icon">${icon(meta.icon)}</span><button type="button" class="icon-button" data-close-graph-inspector aria-label="Закрыть">${icon('x')}</button></div><small>${escapeHTML(meta.singular)}${node.ownerUsername ? ` · ${escapeHTML(node.ownerUsername)}` : ''}</small><h2>${escapeHTML(node.title)}</h2>${context}${node.description ? `<p>${escapeHTML(node.description).replace(/\n/g, '<br>')}</p>` : ''}<div class="graph-inspector-actions"><button type="button" class="primary" data-open-graph-node>${icon('chevronRight')} Открыть</button><button type="button" class="secondary" data-focus-graph-node>${icon('network')} В фокус</button>${recordNode ? `<button type="button" class="secondary" data-show-graph-branch>${icon('gitCompare')} Только эта ветка</button><button type="button" class="secondary" data-arrange-graph-branch>${icon('network')} Собрать ветку рядом</button>` : ''}${canLink ? `<button type="button" class="secondary ${sourceActive ? 'danger-action' : ''}" data-graph-link-source>${icon('link')} ${sourceActive ? 'Отменить связь' : state.graphLinkSourceId ? 'Связать сюда' : 'Создать связь'}</button>` : ''}</div>${state.graphLinkSourceId && state.graphLinkSourceId !== node.id && recordNode ? `<div class="graph-link-callout"><strong>Создать связь с выбранной карточкой?</strong><select id="graph-relation-type"><option value="related">Связано</option><option value="supports">Поддерживает</option><option value="depends_on">Зависит от</option><option value="leads_to">Приводит к</option></select><button type="button" class="primary" data-confirm-graph-link>Связать</button></div>` : ''}<section class="graph-neighbors"><header><span>Ближайшие связи</span><b>${edges.length}</b></header>${neighbors || '<p>Связей пока нет.</p>'}</section>`;
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
  menu.innerHTML = `<strong>${escapeHTML(graphNodeLabel(node))}</strong><button type="button" data-graph-context="open">${icon('chevronRight')} Открыть</button><button type="button" data-graph-context="focus">${icon('network')} Локальная карта</button>${node.entityKind === 'record' ? `<button type="button" data-graph-context="branch">${icon('gitCompare')} Только эта ветка</button>` : ''}${canLink ? `<button type="button" data-graph-context="link">${icon('link')} ${state.graphLinkSourceId ? 'Связать с выбранным' : 'Начать связь'}</button>` : ''}`;
  menu.classList.add('open');
  $$('[data-graph-context]', menu).forEach((button) => button.addEventListener('click', () => {
    const current = state.graphData.nodes.find((item) => item.id === state.graphContextNodeId);
    const action = button.dataset.graphContext;
    closeGraphContextMenu();
    if (!current) return;
    if (action === 'open') openGraphNode(current);
    if (action === 'focus') { state.graphFocusRecordId = current.recordId; state.graphSelectedId = current.id; renderGraph(); }
    if (action === 'branch') { state.graphFocusRecordId = ''; state.graphBranchRootId = current.id; state.graphSelectedId = current.id; renderGraph(); }
    if (action === 'link') {
      selectGraphNode(current.id, true);
      if (!state.graphLinkSourceId) state.graphLinkSourceId = current.id;
      $('#graph-inspector').innerHTML = renderGraphInspector();
      setGraphPanelOpen('#graph-inspector', true);
      bindGraphInspector();
      state.graphInstance.nodes().removeClass('link-source');
      if (state.graphLinkSourceId) state.graphInstance.$id(state.graphLinkSourceId).addClass('link-source');
    }
  }));
}

function fitGraph() {
  const cy = state.graphInstance;
  if (!cy || !cy.nodes().length) return;
  cy.animate({
    fit: { eles: cy.elements(), padding: window.innerWidth <= 560 ? 28 : 54 },
    duration: 240,
    complete: () => { ensureReadableGraphView(cy); updateGraphZoomStyles(); },
  });
}

function zoomGraph(multiplier) {
  const cy = state.graphInstance;
  if (!cy) return;
  cy.animate({ zoom: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * multiplier)), duration: 130 });
}

function arrangeSelectedGraphBranch() {
	const cy = state.graphInstance; const root = cy?.$id(state.graphSelectedId);
	if (!cy || !root?.length) return;
	const descendants = graphHierarchyDescendants(cy, root.id()).map((id) => cy.$id(id)).filter((node) => node.length);
	if (!descendants.length) { toast('У выбранного объекта нет дочерней ветки'); return; }
	const levels = new Map([[root.id(), 0]]); const queue = [root.id()];
	const childRelations = new Set(['parent_of', 'contains', 'answered_by', 'decided_as', 'contains_option', 'produced', 'leads_to']);
	while (queue.length) {
		const parentID = queue.shift(); const level = levels.get(parentID) || 0;
		cy.edges().filter((edge) => edge.source().id() === parentID && childRelations.has(edge.data('relationType'))).forEach((edge) => { const childID = edge.target().id(); if (!levels.has(childID)) { levels.set(childID, level + 1); queue.push(childID); } });
	}
	const rootPosition = root.position();
	const grouped = new Map(); descendants.forEach((node) => { const level = Math.max(1, levels.get(node.id()) || 1); if (!grouped.has(level)) grouped.set(level, []); grouped.get(level).push(node); });
	cy.batch(() => grouped.forEach((nodes, level) => nodes.forEach((node, index) => {
		const spacing = Math.max(112, 360 / Math.max(1, nodes.length));
		node.animate({ position: { x: rootPosition.x + level * 225, y: rootPosition.y + (index - (nodes.length - 1) / 2) * spacing }, duration: 260, easing: 'ease-out-cubic' });
	})));
	setTimeout(() => { saveGraphPositions(cy); cy.animate({ fit: { eles: root.union(descendants.reduce((collection, node) => collection.union(node), cy.collection())), padding: 90 }, duration: 240 }); }, 290);
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
  $('#graph-branch-filter')?.addEventListener('change', (event) => { state.graphBranchRootId = event.target.value; state.graphFocusRecordId = ''; state.graphSelectedId = event.target.value || ''; mountGraph(); });
  $('#graph-move-branch')?.addEventListener('click', () => { state.graphMoveBranch = !state.graphMoveBranch; saveGraphSettings(); renderGraph(); toast(state.graphMoveBranch ? 'Режим ветки включён: родитель двигается вместе с потомками' : 'Теперь перемещается только один узел'); });
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
    setGraphPanelOpen('#graph-settings', state.graphSettingsOpen);
    $('#graph-settings-toggle').classList.toggle('active', state.graphSettingsOpen);
    setGraphPanelOpen('#graph-inspector', Boolean(state.graphSelectedId) && !state.graphSettingsOpen);
  });
  $('[data-close-graph-settings]')?.addEventListener('click', () => {
    state.graphSettingsOpen = false; setGraphPanelOpen('#graph-settings', false); $('#graph-settings-toggle').classList.remove('active');
    setGraphPanelOpen('#graph-inspector', Boolean(state.graphSelectedId));
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
  $('[data-show-graph-branch]')?.addEventListener('click', () => { if (!state.graphSelectedId) return; state.graphFocusRecordId = ''; state.graphBranchRootId = state.graphSelectedId; renderGraph(); });
	$('[data-arrange-graph-branch]')?.addEventListener('click', arrangeSelectedGraphBranch);
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

async function openGraphForRecord(recordId) {
  if (!await confirmDialogTransition($('#record-dialog'))) return;
  closeDialogImmediately($('#record-dialog'));
  state.graphFocusRecordId = recordId; state.graphBranchRootId = ''; state.graphSelectedId = `record:${recordId}`; state.graphDepth = 2; state.view = 'graph'; render();
}

function renderValidation() {
  const types = ['risk', 'hypothesis', 'experiment'];
  const all = state.records.filter((record) => types.includes(record.type) && record.status !== 'archived');
  const records = (state.validationFilter === 'all' ? all : all.filter((record) => record.type === state.validationFilter))
    .slice().sort((left, right) => Number(isActiveRecord(right)) - Number(isActiveRecord(left)) || sortWorkRecords(left, right));
  const filters = [['all', 'Все проверки'], ['risk', 'Риски'], ['hypothesis', 'Гипотезы'], ['experiment', 'Эксперименты']];
  const counts = Object.fromEntries(filters.map(([key]) => [key, key === 'all' ? all.length : all.filter((record) => record.type === key).length]));
  const verdictLabels = { pending: 'Ожидает проверки', confirmed: 'Подтверждено', rejected: 'Опровергнуто', inconclusive: 'Недостаточно данных' };
  $('#main-content').innerHTML = `<div class="entity-list-heading validation-heading"><div><p class="eyebrow">Контроль предположений</p><h1>Риски и проверки</h1><p>Риски показывают, что может помешать. Гипотезы формулируют предположение, эксперименты дают проверяемый ответ.</p></div><div class="heading-actions"><button type="button" class="secondary" data-validation-create="risk">${icon('shield')} Риск</button><button type="button" class="primary" data-validation-create="hypothesis">${icon('plus')} Гипотеза</button></div></div>
    <section class="validation-summary"><article><span>Открытые риски</span><strong>${all.filter((record) => record.type === 'risk' && isActiveRecord(record)).length}</strong><small>требуют владельца и меры снижения</small></article><article><span>На проверке</span><strong>${all.filter((record) => ['hypothesis', 'experiment'].includes(record.type) && isActiveRecord(record)).length}</strong><small>должны закончиться выводом</small></article><button type="button" data-validation-create="experiment">${icon('testTube')}<span><strong>Новый эксперимент</strong><small>Метод, метрика и порог успеха</small></span>${icon('chevronRight')}</button></section>
    <section class="validation-filter segmented">${filters.map(([key, label]) => `<button type="button" class="segment ${state.validationFilter === key ? 'active' : ''}" data-validation-filter="${key}">${escapeHTML(label)} <b>${counts[key]}</b></button>`).join('')}</section>
    <section class="validation-list">${records.map((record) => { const details = record.businessDetails || {}; const score = record.type === 'risk' && details.probability && details.impact ? details.probability * details.impact : 0; const outcome = record.type === 'risk' ? (details.occurred ? 'Риск наступил' : score ? `Оценка ${score} из 25` : 'Оценка не задана') : verdictLabels[details.verdict] || 'Ожидает проверки'; return `<button type="button" class="validation-row type-${record.type} ${isActiveRecord(record) ? '' : 'resolved'}" data-open-record="${record.id}"><span class="validation-icon">${icon(typeMeta[record.type].icon)}</span><span><small>${escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(record.ownerUsername)}</small><strong>${escapeHTML(record.title)}</strong><p>${escapeHTML(markdownPlain(record.description, 'Контекст ещё не описан.'))}</p></span><span class="validation-state"><b>${escapeHTML(outcome)}</b><small>${escapeHTML(statusLabel(record))}</small></span>${icon('chevronRight')}</button>`; }).join('') || `<div class="guided-empty entity-empty">${icon(typeMeta[state.validationFilter]?.icon || 'shield')}<h3>Записей в этом представлении нет</h3><p>Зафиксируйте риск или сформулируйте проверяемую гипотезу вместо хранения сомнений в заметках.</p></div>`}</section>`;
  $$('[data-validation-filter]').forEach((button) => button.addEventListener('click', () => { state.validationFilter = button.dataset.validationFilter; renderValidation(); }));
  $$('[data-validation-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.validationCreate)));
  bindOpenRecords();
}

async function renderOutcomes() {
  const renderLoading = !state.graphData;
  if (renderLoading) {
    $('#main-content').innerHTML = `<div class="entity-list-heading"><div><p class="eyebrow">Память проекта</p><h1>Решения и выводы</h1><p>Принятые решения, результаты исследований и совместные итоги вопросов.</p></div><button type="button" class="primary" data-outcome-create>${icon('plus')} Зафиксировать решение</button></div><div class="relations-loading page-loading"><span class="spinner"></span><strong>Собираем итоговые знания проекта</strong></div>`;
    $('[data-outcome-create]')?.addEventListener('click', () => openCreateDialog('decision'));
    try { state.graphData = await api('/api/graph'); } catch (error) { toast(error.message, true); }
    if (state.view !== 'outcomes') return;
  }
  const decisions = state.records
    .filter((record) => record.type === 'decision' && record.status !== 'archived' && record.status !== 'cancelled')
    .map((record) => ({ id: `record:${record.id}`, kind: record.kind === 'rule' ? 'rule' : 'decision', lifecycle: record.businessDetails?.decisionState || 'active', reviewAt: record.businessDetails?.reviewAt, recordId: record.id, title: record.title, body: record.description || record.result, author: record.authorUsername, updatedAt: record.updatedAt }));
  const research = state.records
    .filter((record) => record.type === 'research' && record.status === 'completed' && record.status !== 'archived')
    .map((record) => ({ id: `record:${record.id}`, kind: 'research', recordId: record.id, title: record.title, body: record.result || record.description, author: record.ownerUsername, updatedAt: record.completedAt || record.updatedAt }));
  const questionTitles = new Map((state.graphData?.nodes || []).filter((node) => node.entityKind === 'question').map((node) => [node.questionId, node.title]));
  const joint = (state.graphData?.nodes || [])
    .filter((node) => node.entityKind === 'joint_decision')
    .map((node) => ({ id: node.id, kind: 'joint', recordId: node.recordId, questionId: node.questionId, title: questionTitles.get(node.questionId) || 'Совместный итог', body: node.description, author: node.ownerUsername, updatedAt: node.updatedAt }));
  let items = [...decisions, ...research, ...joint].sort((left, right) => new Date(right.updatedAt) - new Date(left.updatedAt));
  if (state.outcomeFilter === 'active') items = items.filter((item) => ['decision', 'rule'].includes(item.kind) && item.lifecycle === 'active');
  else if (state.outcomeFilter === 'review') items = items.filter((item) => ['decision', 'rule'].includes(item.kind) && item.lifecycle === 'review');
  else if (state.outcomeFilter !== 'all') items = items.filter((item) => item.kind === state.outcomeFilter || (state.outcomeFilter === 'decision' && item.kind === 'rule'));
  const filters = [['all', 'Все'], ['active', 'Действуют'], ['review', 'К пересмотру'], ['research', 'Исследования'], ['joint', 'Совместные итоги']];
  const counts = { all: decisions.length + research.length + joint.length, active: decisions.filter((item) => item.lifecycle === 'active').length, review: decisions.filter((item) => item.lifecycle === 'review').length, research: research.length, joint: joint.length };
  const kindMeta = {
    decision: ['Решение', 'scale'], rule: ['Правило', 'bookOpen'], research: ['Вывод исследования', 'flask'], joint: ['Совместный итог', 'messages'],
  };
  $('#main-content').innerHTML = `<div class="entity-list-heading outcome-heading"><div><p class="eyebrow">Память проекта</p><h1>Решения и выводы</h1><p>Здесь остаётся то, к чему команда пришла и на чём основывает следующую работу.</p></div><button type="button" class="primary" data-outcome-create>${icon('plus')} Зафиксировать решение</button></div>
    <section class="outcome-filter segmented">${filters.map(([key, label]) => `<button type="button" class="segment ${state.outcomeFilter === key ? 'active' : ''}" data-outcome-filter="${key}">${escapeHTML(label)} <b>${counts[key]}</b></button>`).join('')}</section>
    <section class="outcome-list">${items.map((item) => { const meta = kindMeta[item.kind] || kindMeta.decision; const lifecycle = item.lifecycle ? `<em class="decision-lifecycle state-${item.lifecycle}">${escapeHTML(decisionStateLabels[item.lifecycle] || item.lifecycle)}${item.reviewAt && item.lifecycle === 'review' ? ` · до ${formatDate(item.reviewAt)}` : ''}</em>` : ''; return `<button type="button" class="outcome-row kind-${item.kind} ${item.lifecycle === 'superseded' ? 'superseded' : ''}" data-outcome-record="${item.recordId}" data-outcome-question="${item.questionId || ''}"><span class="type-icon">${icon(meta[1])}</span><span><small>${escapeHTML(meta[0])}${lifecycle}</small><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(markdownPlain(item.body, 'Итог зафиксирован без дополнительного описания.'))}</p><em>${escapeHTML(item.author || 'Команда')} · ${formatDate(item.updatedAt, true)}</em></span>${icon('chevronRight')}</button>`; }).join('') || `<div class="guided-empty entity-empty">${icon('scale')}<h3>В этом представлении итогов пока нет</h3><p>Завершите исследование, примите совместный итог вопроса или зафиксируйте отдельное решение.</p></div>`}</section>`;
  $$('[data-outcome-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog('decision')));
  $$('[data-outcome-filter]').forEach((button) => button.addEventListener('click', () => { state.outcomeFilter = button.dataset.outcomeFilter; renderOutcomes(); }));
  $$('[data-outcome-record]').forEach((button) => button.addEventListener('click', () => openRecord(button.dataset.outcomeRecord, { tab: button.dataset.outcomeQuestion ? 'questions' : 'overview', questionId: button.dataset.outcomeQuestion })));
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
  const entityStatuses = [...(statusesByType[type] || statusesByType.default)];
  if (type === 'research' && !entityStatuses.includes('completed')) entityStatuses.push('completed');
  const statusTabs = type === 'idea' ? ['all', 'inbox', 'review', 'main', 'rejected', 'archived'] : ['all', ...entityStatuses, 'archived'];
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
      <label><span>Состояние</span><select id="record-status-filter">${statusTabs.map((status) => `<option value="${status === 'all' ? '' : status}" ${state.statusFilter === (status === 'all' ? '' : status) ? 'selected' : ''}>${status === 'all' ? 'Все состояния' : type === 'decision' && status === 'completed' ? 'Принято' : type === 'research' && status === 'completed' ? 'Завершено' : statusLabels[status]}</option>`).join('')}</select></label>
      ${type === 'idea' ? `<div class="segmented compact entity-view-switch"><button type="button" class="segment ${state.ideaViewMode === 'board' ? 'active' : ''}" data-idea-view="board">${icon('network')} Доска</button><button type="button" class="segment ${state.ideaViewMode === 'list' ? 'active' : ''}" data-idea-view="list">${icon('menu')} Список</button></div>` : ''}
      <span class="record-total">${recordsCountLabel(records.length)}</span>
    </section>
    ${type === 'idea' && state.ideaViewMode === 'board' ? renderIdeaStageBoard(records) : `<section class="table-panel">
      <div class="record-table header ${['task', 'goal', 'question_set', 'meeting'].includes(type) ? '' : 'simple'}"><span>Карточка</span><span>${type === 'question_set' ? 'Координатор' : type === 'meeting' ? 'Организатор' : 'Ответственный'}</span><span>Статус</span><span>${['task', 'goal', 'question_set', 'meeting'].includes(type) ? 'Дата / прогресс' : 'Изменено'}</span></div>
      <div class="record-rows">${records.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).map(renderRecordRow).join('') || `<div class="guided-empty entity-empty">${icon(typeMeta[type].icon)}<h3>${state.search || state.statusFilter || state.ownerFilter ? 'В этом фильтре ничего нет' : escapeHTML(emptyTitle)}</h3><p>${state.search || state.statusFilter || state.ownerFilter ? 'Измените условия фильтра.' : 'Создайте первую карточку. Её можно заполнить и связать с другими объектами позже.'}</p></div>`}</div>
    </section>`}`;
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
	$$('[data-idea-view]').forEach((button) => button.addEventListener('click', () => { state.ideaViewMode = button.dataset.ideaView; renderRecordList(type); }));
  $$('[data-record-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.recordCreate)));
	if (type === 'idea' && state.ideaViewMode === 'board') bindBoardDnD(() => renderRecordList(type));
  bindOpenRecords();
}

function renderRecordRow(record) {
  const isPlannable = ['task', 'goal', 'question_set', 'meeting'].includes(record.type);
  const deadline = deadlineState(record);
  return `<button type="button" class="record-table row ${isPlannable ? '' : 'simple'}" data-open-record="${record.id}">
    <span class="record-title"><i class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</i><span><strong>${escapeHTML(record.title)}</strong><small>${escapeHTML(markdownPlain(record.description, 'Без описания'))}</small></span></span>
    <span><b class="owner-chip">${escapeHTML(record.ownerUsername)}</b><small>создал ${escapeHTML(record.authorUsername)}</small></span>
    <span><em class="status status-${record.status}">${escapeHTML(statusLabel(record))}</em></span>
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
    if (previous?.workflowLoaded && previous.record.updatedAt === detail.record.updatedAt) {
      detail.workflow = previous.workflow;
      detail.workflowLoaded = true;
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
  const recordDialog = $('#record-dialog');
  if (recordDialog.open && state.activeWorkspaceRecordId && state.activeWorkspaceRecordId !== id) {
    if (!await confirmDialogTransition(recordDialog)) return false;
  }
  const requestID = ++state.activeRecordRequest;
  if (state.activeWorkspaceRecordId !== id) state.editingQuestionAnswerId = '';
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
  return true;
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
    if (id === state.activeWorkspaceRecordId && !await confirmDialogTransition($('#record-dialog'))) return;
    const index = state.recordWorkspace.findIndex((item) => item.id === id);
    state.recordWorkspace = state.recordWorkspace.filter((item) => item.id !== id);
    if (id !== state.activeWorkspaceRecordId) { renderRecordDialog(); return; }
    const next = state.recordWorkspace[Math.max(0, index - 1)];
    if (!next) { closeDialogImmediately($('#record-dialog')); return; }
    await openRecord(next.id, { workspace: true });
  }));
}

function renderRecordLoading(summary) {
  const meta = typeMeta[summary?.type] || { singular: 'Карточка', icon: 'fileText' };
  $('#record-dialog-content').innerHTML = `<div class="record-shell record-type-${summary?.type || 'document'} loading-shell ${state.recordWorkspace.length > 1 ? 'has-workspace' : ''}">${renderRecordWorkspace()}<div class="dialog-header record-dialog-header"><div><span class="record-kind">${icon(meta.icon)} ${escapeHTML(meta.singular)}</span><h2>${escapeHTML(summary?.title || 'Загружаем карточку')}</h2><p>Основные данные появятся сразу после ответа сервера</p></div><button type="button" class="close-button icon-button" data-close-dialog aria-label="Закрыть">${icon('x')}</button></div><div class="loading-tabs"><i></i><i></i><i></i></div><div class="dialog-layout"><div class="dialog-main"><div class="record-skeleton"><span class="skeleton-line wide"></span><span class="skeleton-line medium"></span><span class="skeleton-block"></span><div><span class="skeleton-line"></span><span class="skeleton-line short"></span></div></div></div><aside class="dialog-aside"><span class="skeleton-line"></span><span class="skeleton-line short"></span><span class="skeleton-line"></span></aside></div></div>`;
  $('[data-close-dialog]').addEventListener('click', () => requestDialogClose($('#record-dialog')));
  bindRecordWorkspace();
}

function renderRecordLoadError(id, message) {
  $('#record-dialog-content').innerHTML = `<div class="record-load-error">${icon('help')}<h2>Карточка не загрузилась</h2><p>${escapeHTML(message)}</p><div><button type="button" class="primary" data-retry-record="${id}">Повторить</button><button type="button" class="secondary" data-close-dialog>Закрыть</button></div></div>`;
  $('[data-retry-record]').addEventListener('click', () => openRecord(id));
  $('[data-close-dialog]').addEventListener('click', () => requestDialogClose($('#record-dialog')));
}

function recordTabs(record, detail, activity) {
  const filledSections = detail.sections.filter((section) => section.content).length;
  const relationCount = detail.relationsLoaded ? detail.links.length + (detail.researchOptions?.length || 0) : 0;
  const comparison = record.type === 'research' ? state.researchComparisons.get(record.id) : null;
  const contentCount = comparison ? (comparison.options?.length ? String(comparison.options.length) : '') : `${filledSections}/${detail.sections.length}`;
  const workflow = detail.workflow || {};
  const tabs = [
    ['overview', 'Обзор', ''],
    ['content', 'Содержание', contentCount],
    ['relations', record.type === 'idea' ? 'Критерии и связи' : 'Связи', detail.relationsLoaded ? `${relationCount}` : ''],
    ['history', 'История', `${activity.length}`],
  ];
  if (record.type === 'task') tabs.splice(2, 0, ['execution', 'Исполнение', detail.workflowLoaded ? `${(workflow.checklist || []).filter((item) => item.status === 'completed').length}/${(workflow.checklist || []).length}` : '']);
  tabs.splice(tabs.length - 2, 0,
    ['discussion', 'Обсуждение', detail.workflowLoaded && workflow.comments?.length ? `${workflow.comments.length}` : ''],
    ['files', 'Файлы', detail.workflowLoaded && workflow.attachments?.length ? `${workflow.attachments.length}` : ''],
  );
  if (record.type === 'question_set') {
    const workflow = detail.questionWorkflow || { questions: [], resolved: 0 };
    tabs.unshift(['questions', 'Вопросы и ответы', `${workflow.resolved}/${workflow.questions.length}`]);
    tabs.splice(2, 1);
  }
  if (record.type === 'inbox') tabs.splice(1, 1);
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
    risk: [['task', '', 'Мера снижения'], ['experiment', '', 'Проверка риска'], ['decision', '', 'Решение']],
    hypothesis: [['experiment', '', 'Эксперимент'], ['research', '', 'Исследование'], ['decision', 'insight', 'Вывод']],
    experiment: [['decision', '', 'Решение'], ['task', '', 'Следующий шаг'], ['hypothesis', '', 'Новая гипотеза']],
  }[record.type] || [];
}

function renderNextActions(record) {
  const options = nextRecordOptions(record);
  if (!options.length) return '';
  return `<section class="meeting-results next-actions"><header><div><p class="eyebrow">Следующий результат</p><h3>Продолжить цепочку</h3></div><button type="button" class="text-button" data-record-graph="${record.id}">${icon('network')} Посмотреть связи</button></header><div>${options.map(([type, kind, label]) => `<button type="button" data-create-linked="${type}" data-linked-kind="${kind}">${icon(typeMeta[type].icon)} ${label}</button>`).join('')}</div></section>`;
}

function renderHierarchyPanel(record, canEdit = false) {
  const parent = record.parentId ? state.records.find((item) => item.id === record.parentId) : null;
  const children = state.records.filter((item) => item.parentId === record.id && item.status !== 'archived');
  if (!canEdit && !record.isRoot && !parent && !children.length) return '';
  return `<section class="hierarchy-panel">
    <header><div><p class="eyebrow">Иерархия работы</p><h3>${record.isRoot ? 'Самостоятельная ветка' : parent ? 'Продолжение рабочей цепочки' : 'Пока без родителя'}</h3><p>Родитель отвечает на вопрос «из какой работы появилась эта карточка». Стрелка идёт от родителя к результату или следующему шагу.</p></div><div>${canEdit ? `<button type="button" class="text-button" data-change-parent>${icon('edit')} Изменить родителя</button>` : ''}<button type="button" class="text-button" data-record-graph="${record.id}">${icon('network')} На карте</button></div></header>
    <div class="hierarchy-path">${parent ? `<button type="button" data-related-record="${parent.id}"><small>Родитель</small><strong>${escapeHTML(parent.title)}</strong></button><span>${icon('chevronRight')}</span>` : ''}<div><small>${record.isRoot ? 'Корень' : 'Текущая карточка'}</small><strong>${escapeHTML(record.title)}</strong></div></div>
    ${children.length ? `<div class="hierarchy-children"><span>Дочерние работы · ${children.length}</span>${children.slice(0, 6).map((item) => `<button type="button" data-related-record="${item.id}">${icon(typeMeta[item.type]?.icon || 'fileText')}<span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(typeMeta[item.type]?.singular || 'Карточка')} · ${escapeHTML(statusLabels[item.status] || item.status)}</small></span>${icon('chevronRight')}</button>`).join('')}</div>` : ''}
  </section>`;
}

async function changeRecordParent(record) {
  const descendants = new Set([record.id]);
  let changed = true;
  while (changed) {
    changed = false;
    state.records.forEach((candidate) => {
      if (candidate.parentId && descendants.has(candidate.parentId) && !descendants.has(candidate.id)) {
        descendants.add(candidate.id);
        changed = true;
      }
    });
  }
  const choices = [
    { value: '__root__', label: 'Новый корень: самостоятельная крупная ветка' },
    { value: '__none__', label: 'Без родителя: пока не определено происхождение' },
    ...state.records
      .filter((candidate) => !descendants.has(candidate.id) && candidate.status !== 'archived')
      .sort((left, right) => Number(right.isRoot) - Number(left.isRoot) || left.title.localeCompare(right.title, 'ru'))
      .map((candidate) => ({ value: candidate.id, label: `${typeMeta[candidate.type]?.singular || 'Карточка'}: ${candidate.title}` })),
  ];
  const selected = await askChoice({
    title: 'Откуда появилась эта карточка?',
    label: 'Это изменит причинную иерархию. Тематические связи настраиваются отдельно во вкладке «Связи».',
    choices,
  });
  if (!selected) return;
  if ((selected === '__root__' && record.isRoot) || (selected === '__none__' && !record.isRoot && !record.parentId) || selected === record.parentId) {
    toast('Это место в иерархии уже выбрано');
    return;
  }
  const reason = await askText({ title: 'Причина изменения иерархии', label: 'Почему карточка появилась из другого шага или стала самостоятельной веткой?', required: true });
  if (!reason) return;
  const body = selected === '__root__'
    ? { isRoot: true, clearParent: true }
    : selected === '__none__'
      ? { parentId: '', clearParent: true, isRoot: false }
      : { parentId: selected, isRoot: false };
  await mutateRecord(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ ...body, reason, expectedUpdatedAt: record.updatedAt }) });
}

function dossierProperty(label, value, field, canEdit, tone = '') {
  const tag = canEdit && field ? 'button' : 'div';
  return `<${tag} ${canEdit && field ? `type="button" data-edit-field="${field}"` : ''} class="dossier-property ${tone}"><span>${escapeHTML(label)}</span><strong>${escapeHTML(value || 'Не указано')}</strong>${canEdit && field ? icon('edit') : ''}</${tag}>`;
}

function renderAIContextCoverage(coverage = {}) {
  const parts = [];
  if (coverage.researchOptions) parts.push(`${coverage.researchOptions} ${coverage.researchOptions === 1 ? 'вариант' : 'варианта'}`);
  if (coverage.researchFields) parts.push(`${coverage.researchFields} параметров`);
  if (coverage.sections) parts.push(`${coverage.sections} разделов`);
  if (coverage.questions) parts.push(`${coverage.questions} вопросов`);
  if (coverage.answers) parts.push(`${coverage.answers} ответов`);
  if (coverage.relations) parts.push(`${coverage.relations} связей`);
  if (coverage.comments) parts.push(`${coverage.comments} комментариев`);
  if (coverage.historyEvents) parts.push(`${coverage.historyEvents} событий`);
  return `<div class="ai-context-coverage">${icon('check')}<span><strong>AI прочитал: ${escapeHTML(parts.join(' · ') || 'основные поля карточки')}</strong>${coverage.contextTruncated ? '<small>Очень большой контекст был безопасно сокращён.</small>' : '<small>Разбор построен по доступному досье карточки.</small>'}</span></div>`;
}

function renderAIAnalysis(record, canEdit) {
  if (state.aiAnalysisLoading === record.id) {
    return `<section class="ai-analysis loading"><span class="spinner"></span><div><strong>AI разбирает карточку</strong><p>Проверяем контекст, риски, связи и следующий предметный результат.</p></div></section>`;
  }
  const analysis = state.aiAnalyses.get(record.id);
  if (!analysis) return '';
  const source = analysis.source === 'gemini' ? 'Gemini' : analysis.source === 'groq' ? 'Groq' : 'локальные правила';
  return `<section class="ai-analysis">
    <header><span>${icon('sparkles')}</span><div><p class="eyebrow">AI-разбор · ${escapeHTML(source)}</p><h3>Что требует внимания</h3></div><b>${Math.round((analysis.confidence || 0) * 100)}%</b></header>
    ${renderAIContextCoverage(analysis.contextCoverage)}
    <div class="ai-summary markdown-body">${renderMarkdown(analysis.summary, 'Выжимка не сформирована.')}</div>
    ${analysis.proposedDecision ? `<div class="ai-proposed-decision"><span>Предлагаемый итог</span><div class="markdown-body">${renderMarkdown(analysis.proposedDecision)}</div>${canEdit ? `<button type="button" class="secondary" data-ai-create-decision>${icon('scale')} Создать решение из черновика</button>` : ''}</div>` : ''}
    <div class="ai-analysis-grid">
      <div><span>Пробелы</span>${analysis.gaps.length ? `<ul>${analysis.gaps.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p>Критичных пробелов не найдено.</p>'}</div>
      <div class="ai-risks"><span>Риски</span>${analysis.risks.length ? `<ul>${analysis.risks.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>` : '<p>Явных рисков не найдено.</p>'}</div>
    </div>
    <div class="ai-next"><span>Следующий проверяемый шаг</span><strong>${escapeHTML(analysis.nextAction)}</strong><div>${canEdit ? `<button type="button" class="secondary" data-ai-create-next>${icon('plus')} Создать задачу</button>` : ''}${canEdit && (analysis.priority !== record.priority || analysis.estimateMinutes !== record.estimateMinutes) ? `<button type="button" class="secondary" data-ai-apply-plan>${icon('check')} Применить ${escapeHTML(priorityLabels[analysis.priority])}, ${minutesLabel(analysis.estimateMinutes)}</button>` : ''}</div></div>
    ${analysis.suggestedLinks.length ? `<div class="ai-proposals"><span>Предлагаемые связи</span>${analysis.suggestedLinks.map((link) => `<button type="button" data-ai-link="${link.recordId}" data-ai-relation="${link.relationType}" ${canEdit ? '' : 'disabled'}><strong>${escapeHTML(link.title)}</strong><small>${escapeHTML(link.reason)}</small>${icon('link')}</button>`).join('')}</div>` : ''}
    ${analysis.suggestedOutputs.length ? `<div class="ai-proposals"><span>Можно зафиксировать отдельными карточками</span>${analysis.suggestedOutputs.map((output, index) => `<button type="button" data-ai-output-index="${index}" ${canEdit ? '' : 'disabled'}><strong>${escapeHTML(typeMeta[output.type]?.singular || 'Карточка')}: ${escapeHTML(output.title)}</strong><small>${escapeHTML(output.reason)}</small>${icon('plus')}</button>`).join('')}</div>` : ''}
    <p class="ai-disclaimer">AI предлагает структуру, но не меняет факты, решения и сроки без вашего действия.</p>
  </section>`;
}

const decisionStateLabels = { active: 'Действует', review: 'Требует пересмотра', superseded: 'Заменено' };
const verdictLabels = { pending: 'Ожидает проверки', confirmed: 'Подтверждено', rejected: 'Опровергнуто', inconclusive: 'Недостаточно данных' };

function renderBusinessDetailsRead(record, canEdit) {
  const details = record.businessDetails || {};
  if (record.type === 'inbox') return `<section class="dossier-section business-read inbox-read"><header><div><p class="eyebrow">Разбор входящего</p><h3>Во что превратить эту запись?</h3></div></header><p>Карточка сохранит название, текст, автора, историю и связи. Меняется только её рабочий тип.</p>${canEdit ? `<div class="inbox-triage-actions">${[['task', 'Задача'], ['idea', 'Идея'], ['question_set', 'Вопросы'], ['research', 'Исследование'], ['risk', 'Риск'], ['hypothesis', 'Гипотеза'], ['experiment', 'Эксперимент'], ['document', 'Документ']].map(([type, label]) => `<button type="button" class="secondary" data-triage-inbox="${type}">${icon(typeMeta[type].icon)} ${label}</button>`).join('')}</div>` : ''}</section>`;
  if (record.type === 'risk') {
    const score = Number(details.probability || 0) * Number(details.impact || 0);
    return `<section class="dossier-section business-read risk-read"><header><div><p class="eyebrow">Контроль риска</p><h3>${details.occurred ? 'Риск наступил' : score ? `Оценка ${score} из 25` : 'Нужна оценка'}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-open-record-edit aria-label="Изменить риск">${icon('edit')}</button>` : ''}</header><div class="dossier-properties">${dossierProperty('Вероятность', details.probability ? `${details.probability} из 5` : 'Не оценена', '', false)}${dossierProperty('Влияние', details.impact ? `${details.impact} из 5` : 'Не оценено', '', false)}${dossierProperty('Состояние', details.occurred ? 'Наступил' : 'Не наступил', '', false, details.occurred ? 'overdue' : '')}${dossierProperty('Следующая проверка', details.reviewAt ? formatDate(details.reviewAt, true) : 'Не назначена', '', false)}</div><div class="business-markdown"><span>Мера снижения</span>${markdownView(details.mitigation, 'Мера снижения пока не определена.')}</div></section>`;
  }
  if (record.type === 'hypothesis' || record.type === 'experiment') return `<section class="dossier-section business-read experiment-read"><header><div><p class="eyebrow">Проверяемость</p><h3>${escapeHTML(verdictLabels[details.verdict] || 'Ожидает проверки')}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-open-record-edit aria-label="Изменить проверку">${icon('edit')}</button>` : ''}</header><div class="dossier-properties">${dossierProperty('Метрика', details.metric || 'Не задана', '', false)}${dossierProperty('Порог успеха', details.successThreshold || 'Не задан', '', false)}</div><div class="business-markdown"><span>${record.type === 'experiment' ? 'Метод эксперимента' : 'Способ проверки'}</span>${markdownView(details.experimentMethod, 'Способ проверки пока не описан.')}</div></section>`;
  if (record.type === 'decision') {
    const replaced = details.supersedesId ? state.records.find((item) => item.id === details.supersedesId) : null;
    return `<section class="dossier-section business-read decision-read state-${details.decisionState || 'active'}"><header><div><p class="eyebrow">Актуальность решения</p><h3>${escapeHTML(decisionStateLabels[details.decisionState] || 'Действует')}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-open-record-edit aria-label="Изменить актуальность">${icon('edit')}</button>` : ''}</header><div class="dossier-properties">${dossierProperty('Действует с', details.effectiveAt ? formatDate(details.effectiveAt, true) : formatDate(record.createdAt, true), '', false)}${dossierProperty('Пересмотреть', details.reviewAt ? formatDate(details.reviewAt, true) : 'Дата не назначена', '', false)}${details.applicability ? dossierProperty('Применяется к', details.applicability, '', false) : ''}</div>${details.sourceExcerpt ? `<div class="business-markdown knowledge-source"><span>Основание</span>${markdownView(details.sourceExcerpt)}</div>` : ''}${replaced ? `<button type="button" class="decision-replaces" data-related-record="${replaced.id}">${icon('undo')}<span><small>Заменяет прежнее решение</small><strong>${escapeHTML(replaced.title)}</strong></span>${icon('chevronRight')}</button>` : ''}</section>`;
  }
	if (record.type === 'criterion') {
		const review = knowledgeReviewState(record);
		return `<section class="dossier-section business-read knowledge-read review-${review.tone}"><header><div><p class="eyebrow">Применение знания</p><h3>${escapeHTML(details.applicability || 'Область применения не указана')}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-open-record-edit aria-label="Уточнить критерий">${icon('edit')}</button>` : ''}</header><div class="dossier-properties">${dossierProperty('Проверка актуальности', review.label, '', false, review.tone === 'overdue' ? 'overdue' : '')}${dossierProperty('Происхождение', record.parentId ? 'Связано с исходной карточкой' : details.sourceExcerpt ? 'Основание сохранено в карточке' : 'Источник не указан', '', false)}</div>${details.sourceExcerpt ? `<div class="business-markdown knowledge-source"><span>Исходная формулировка</span>${markdownView(details.sourceExcerpt)}</div>` : ''}</section>`;
	}
  return '';
}

function renderBlockersPanel(record) {
	const blockers = activeBlockers(record);
	if (!blockers.length) return '';
	return `<section class="active-blockers-panel"><header><span>${icon('lock')}</span><div><p class="eyebrow">Блокирующие зависимости</p><h3>Работа ждёт ${blockers.length === 1 ? 'одну карточку' : `${blockers.length} карточки`}</h3></div></header><p>Связь «зависит от» снимается из этого списка автоматически, когда блокирующая карточка завершена или отменена.</p><div>${blockers.map((blocker) => `<button type="button" data-related-record="${blocker.id}"><span class="type-icon type-${blocker.type}">${icon(typeMeta[blocker.type]?.icon || 'fileText')}</span><span><small>${escapeHTML(typeMeta[blocker.type]?.singular || 'Карточка')} · ${escapeHTML(blocker.ownerUsername)}</small><strong>${escapeHTML(blocker.title)}</strong></span>${icon('chevronRight')}</button>`).join('')}</div></section>`;
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
    ${renderHierarchyPanel(record, canEdit)}
		${renderBlockersPanel(record)}
    <article class="record-dossier">
      <section class="dossier-section dossier-context"><header><div><p class="eyebrow">Содержание</p><h3>${escapeHTML(language.description)}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-edit-field="description" aria-label="Изменить описание" title="Изменить описание">${icon('edit')}</button>` : ''}</header>${markdownView(record.description, 'Контекст пока не заполнен.', language.description)}</section>
      ${renderBusinessDetailsRead(record, canEdit)}
      ${hasExecution ? `<section class="dossier-section"><header><div><p class="eyebrow">Контроль</p><h3>${record.type === 'question_set' ? 'Обсуждение и срок' : record.type === 'meeting' ? 'Организация встречи' : 'Исполнение'}</h3></div></header><div class="dossier-properties">
        ${dossierProperty(ownerLabel, record.ownerUsername, 'ownerId', canEdit)}
        ${dossierProperty('Статус', statusLabel(record), record.type === 'question_set' ? '' : 'status', canEdit)}
        ${hasDeadline ? dossierProperty(dueLabel, deadline.label, 'dueAt', canEdit, deadline.className) : ''}
        ${hasPriority ? dossierProperty('Приоритет', priorityLabels[record.priority || 'normal'], 'priority', canEdit, `priority-${record.priority || 'normal'}`) : ''}
        ${hasEstimate ? dossierProperty('План', minutesLabel(record.estimateMinutes), 'estimateMinutes', canEdit) + dossierProperty('Факт', minutesLabel(record.actualMinutes), 'actualMinutes', canEdit) : ''}
        ${record.type === 'research' ? dossierProperty('Готовность исследования', `${record.progress}%`, '', false) : hasManualProgress ? dossierProperty('Прогресс', `${record.progress}%`, 'progress', canEdit) : ''}
        ${hasDecisionMaker ? dossierProperty('Принимает решение', record.decisionMakerUsername || 'Не указан', 'decisionMakerId', canEdit) : ''}
      </div>${record.progressNote ? `<div class="dossier-note"><span>Последнее обновление</span><p>${escapeHTML(record.progressNote)}</p></div>` : ''}</section>` : `<section class="dossier-section"><header><div><p class="eyebrow">Ответственность</p><h3>Владелец карточки</h3></div></header><div class="dossier-properties">${dossierProperty(ownerLabel, record.ownerUsername, 'ownerId', canEdit)}${dossierProperty('Статус', statusLabel(record), 'status', canEdit)}</div></section>`}
      ${hasResult ? `<section class="dossier-section dossier-result"><header><div><p class="eyebrow">Результат</p><h3>${record.type === 'research' ? 'Вывод исследования' : record.type === 'decision' ? 'Принятое решение' : record.type === 'disagreement' ? 'Результат разбора' : 'Достигнутый результат'}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-edit-field="result" aria-label="Изменить результат" title="Изменить результат">${icon('edit')}</button>` : ''}</header>${markdownView(record.result, 'Результат ещё не зафиксирован.', 'Результат карточки')}</section>` : ''}
      <section class="dossier-meta"><span>${escapeHTML(workstreamLabels[record.workstream || 'business'])}</span><span>${record.editPolicy === 'owner_only' ? 'Личная карточка' : 'Общая карточка'}</span><span>${record.isRoot ? 'Корень ветки' : record.parentId ? 'Есть родитель' : 'Без родителя'}</span><button type="button" data-edit-field="workstream" ${canEdit ? '' : 'disabled'}>${icon('settings')} Настроить</button></section>
    </article>
    ${record.type === 'research' && record.status !== 'completed' ? `<section class="research-progress-explainer"><div><span>Готовность ${record.progress}%</span><strong>${record.result ? 'Вывод готов к подтверждению' : 'Зафиксируйте вывод после сравнения'}</strong><p>Процент складывается из вопроса исследования, структуры сравнения, вариантов, их заполненности и итогового вывода. 100% устанавливается только явным завершением.</p></div><progress max="100" value="${record.progress}"></progress></section>` : ''}
    <div class="record-read-actions">${canEdit ? `<button type="button" class="primary" data-open-record-edit>${icon('edit')} Редактировать</button>${record.type === 'research' && record.status !== 'completed' ? `<button type="button" class="success" data-complete-research>${icon('check')} Завершить исследование</button>` : ''}` : ''}<button type="button" class="secondary" id="notify-partners">${icon('bell')} Уведомить</button><button type="button" class="secondary ai-action" data-analyze-record>${icon('sparkles')} AI-разбор</button><details class="record-more-actions"><summary class="icon-button" aria-label="Другие действия">•••</summary><div>${record.type === 'task' ? `<button type="button" id="convert-to-questions">${icon('messages')} Сделать карточкой вопросов</button>` : ''}${canEdit ? `<button type="button" class="danger-text" id="archive-record">${icon('archive')} В архив</button>` : ''}</div></details></div>
    ${renderAIAnalysis(record, canEdit)}
    ${renderNextActions(record)}
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
    decision: { description: 'Принятое решение и его основания', owner: 'Зафиксировал' },
    disagreement: { description: 'Предмет разногласия и контекст', owner: 'Координатор' },
    document: { description: 'Краткое содержание документа', owner: 'Владелец' },
    meeting: { description: 'Повестка, заметки и договорённости', owner: 'Организатор' },
    risk: { description: 'Сценарий риска и возможные последствия', owner: 'Владелец риска' },
    hypothesis: { description: 'Проверяемое предположение', owner: 'Владелец гипотезы' },
    experiment: { description: 'Что проверяем и зачем', owner: 'Ответственный за эксперимент' },
    inbox: { description: 'Необработанная мысль или наблюдение', owner: 'Автор разбора' },
  }[record.type];
  const hasDeadline = ['task', 'goal', 'question_set', 'research', 'disagreement', 'meeting', 'risk', 'hypothesis', 'experiment'].includes(record.type);
  const hasDecisionMaker = ['disagreement'].includes(record.type);
  const hasPriority = (isWorkRecord(record) && record.type !== 'inbox') || record.type === 'goal';
  const hasEstimate = (isWorkRecord(record) && record.type !== 'inbox') || record.type === 'goal';
  const hasManualProgress = !['question_set', 'research', 'inbox'].includes(record.type) && (isWorkRecord(record) || record.type === 'goal');
  const hasResult = ['task', 'goal', 'research', 'disagreement', 'risk', 'hypothesis', 'experiment'].includes(record.type);
  const planningTitle = record.type === 'task' ? 'Исполнение задачи' : record.type === 'question_set' ? 'Срок и приоритет обсуждения' : record.type === 'meeting' ? 'Организатор и время' : hasDecisionMaker ? 'Ответственность за решение' : hasDeadline ? 'Планирование' : 'Владелец карточки';
  const dueLabel = ({ meeting: 'Дата и время', research: 'Срок исследования', disagreement: 'Срок разбора' })[record.type] || 'Срок';
  const planningGrid = hasDecisionMaker && hasDeadline ? 'three' : hasDeadline ? 'two' : 'one';
  const hasExecution = hasDeadline || hasDecisionMaker || hasPriority || hasEstimate || hasManualProgress || hasResult;
  const origin = state.activeDetail.derivation;
  const canEdit = record.editPolicy !== 'owner_only' || record.ownerId === state.me.id || record.authorId === state.me.id;
  const canManageAccess = record.ownerId === state.me.id || record.authorId === state.me.id;
  const parentOptions = state.records.filter((item) => item.id !== record.id && (isActiveRecord(item) || item.id === record.parentId)).map((item) => `<option value="${item.id}" ${record.parentId === item.id ? 'selected' : ''}>${escapeHTML(typeMeta[item.type]?.singular || 'Карточка')}: ${escapeHTML(item.title)}</option>`).join('');
  if (!state.recordEditMode) {
    return renderRecordReadOverview(record, { language, hasDeadline, hasDecisionMaker, hasPriority, hasEstimate, hasManualProgress, hasResult, hasExecution, dueLabel, canEdit });
  }
  return `<div class="record-pane ${state.activeRecordTab === 'overview' ? 'active' : ''}" data-record-pane="overview">
    ${origin ? `<button type="button" class="origin-trace" data-related-record="${origin.sourceRecordId}"><span>${icon('link')}</span><span><small>Создано из совместного вывода</small><strong>${escapeHTML(origin.questionBody)}</strong><em>${escapeHTML(origin.decisionContent)}</em></span>${icon('chevronRight')}</button>` : ''}
    ${draft ? `<div class="draft-banner"><span><strong>Найден несохранённый черновик</strong><small>Можно восстановить текст или удалить черновик.</small></span><div><button type="button" class="secondary" data-restore-draft>Восстановить</button><button type="button" class="text-button" data-discard-draft>Удалить</button></div></div>` : ''}
    ${canEdit ? '' : `<div class="access-banner">${icon('lock')}<span><strong>Личная карточка ${escapeHTML(record.ownerUsername)}</strong><small>Вы можете просматривать её ход и связи, но изменять содержание может только ответственный.</small></span></div>`}
    ${renderHierarchyPanel(record, canEdit)}
    <form id="record-edit-form" class="card-form record-overview-form" data-can-edit="${canEdit}">
      <div class="form-grid two"><label>Название<input name="title" value="${escapeHTML(record.title)}" required></label><label>${record.type === 'question_set' ? 'Статус рассчитывается автоматически' : 'Статус'}<select name="status" ${record.type === 'question_set' ? 'disabled' : ''}>${statuses.map((status) => `<option value="${status}" ${record.status === status ? 'selected' : ''}>${record.type === 'task' && status === 'review' ? 'На проверке' : record.type === 'inbox' && status === 'inbox' ? 'Нужно разобрать' : statusLabels[status]}</option>`).join('')}</select></label></div>
      ${markdownEditor('description', language.description, record.description, 5, 'Контекст, факты и ожидаемый результат')}
      ${renderBusinessDetailsFields(record.type, record.businessDetails || {}, record.id)}
      ${hasExecution ? `<section class="execution-fields"><header><span>${icon(record.type === 'question_set' ? 'messages' : record.type === 'meeting' ? 'calendar' : 'checkSquare')}</span><div><h3>${planningTitle}</h3><p>${record.type === 'question_set' ? 'Карточка участвует в общей очереди наравне с задачами.' : 'Поля, по которым команда контролирует выполнение.'}</p></div></header>
        <div class="form-grid ${planningGrid}"><label>${language.owner}<select name="ownerId" ${canManageAccess ? '' : 'disabled'}>${userOptions(record.ownerId)}</select></label>${hasDecisionMaker ? `<label>Принимает решение<select name="decisionMakerId"><option value="">Не указан</option>${userOptions(record.decisionMakerId)}</select></label>` : ''}${hasDeadline ? `<label>${dueLabel}<input name="dueAt" type="datetime-local" value="${toLocalInput(record.dueAt)}"></label>` : ''}</div>
        ${(hasPriority || hasEstimate || hasManualProgress) ? `<div class="form-grid ${hasEstimate && hasManualProgress ? 'four' : 'three'}">${hasPriority ? `<label>Приоритет<select name="priority">${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${record.priority === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}${hasEstimate ? `<label>План, минут<input name="estimateMinutes" type="number" min="0" value="${record.estimateMinutes}"></label><label>Факт, минут<input name="actualMinutes" type="number" min="0" value="${record.actualMinutes || 0}"></label>` : ''}${hasManualProgress ? `<label>Прогресс, %<input name="progress" type="number" min="0" max="100" value="${record.progress}"></label>` : ''}</div>` : ''}
        ${hasManualProgress ? `<label>Текущее обновление<input name="progressNote" value="${escapeHTML(record.progressNote)}" placeholder="Что изменилось с прошлого раза"></label>` : ''}
        ${hasResult ? markdownEditor('result', record.type === 'research' ? 'Вывод исследования' : record.type === 'decision' ? 'Принятое решение' : record.type === 'disagreement' ? 'Результат разбора' : 'Достигнутый результат', record.result, 4, 'Зафиксируйте итог и основания') : ''}
        ${record.type === 'question_set' ? `<div class="derived-progress"><span>Прогресс обсуждения рассчитывается по принятым итогам</span><strong>${record.progress}%</strong></div>` : record.type === 'research' ? `<div class="derived-progress"><span>Готовность вычисляется из вопроса, полей, вариантов, их заполненности и вывода. Вручную процент не задаётся.</span><strong>${record.progress}%</strong></div>` : ''}
      </section>` : `<div class="form-grid one"><label>${language.owner}<select name="ownerId" ${canManageAccess ? '' : 'disabled'}>${userOptions(record.ownerId)}</select></label></div>`}
      <details class="form-more organization-fields"><summary>Доступ и место в проекте</summary><div class="form-more-body"><div class="form-grid three"><label>Направление<select name="workstream">${Object.entries(workstreamLabels).map(([value, label]) => `<option value="${value}" ${record.workstream === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Кто может изменять<select name="editPolicy" ${canManageAccess ? '' : 'disabled'}>${Object.entries(editPolicyLabels).map(([value, label]) => `<option value="${value}" ${record.editPolicy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Из какой карточки появилась<select name="parentId"><option value="">Ни из какой: без родителя</option>${parentOptions}</select><small>Это иерархия происхождения, а не просто тематическая связь.</small></label></div><label class="root-toggle"><input name="isRoot" type="checkbox" ${record.isRoot ? 'checked' : ''}> <span><strong>Сделать новым корнем</strong><small>Карточка станет самостоятельным началом новой крупной ветки и потеряет текущего родителя.</small></span></label></div></details>
      <label id="record-reason-field" class="reason-field" hidden>Причина изменения <input name="reason" placeholder="Почему изменилось состояние, срок или место в цепочке"></label>
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
    <header><div><p class="eyebrow">${isNew ? 'Новый вариант' : 'Редактирование варианта'}</p><h3>${isNew ? 'Добавить сервер или другой вариант' : escapeHTML(option.title)}</h3></div><div><button type="button" class="secondary ai-action" data-ai-fill-research-option>${icon('sparkles')} Заполнить пропуски AI</button><button type="button" class="icon-button" data-cancel-research-option aria-label="Закрыть">${icon('x')}</button></div></header>
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
  return `<article class="content-read-section"><header><div><h3>${escapeHTML(section.title)}</h3>${section.updatedByName ? `<small>Обновил ${escapeHTML(section.updatedByName)} · ${formatDate(section.updatedAt, true)}</small>` : ''}</div></header>${markdownView(section.content, 'Раздел пока не заполнен.', section.title)}</article>`;
}

function renderRecordContent(detail) {
  const record = detail.record;
  const canEdit = record.editPolicy !== 'owner_only' || record.ownerId === state.me.id || record.authorId === state.me.id;
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
  const editing = isMe && (!answer || state.editingQuestionAnswerId === question.id);
  const controls = answer ? `<span class="answer-ready">${icon('check')} Готово</span>${isMe ? `<button type="button" class="icon-button answer-edit" data-edit-question-answer="${question.id}" title="Изменить ответ" aria-label="Изменить ответ">${icon('edit')}</button>` : ''}` : '';
  const content = editing
    ? `<form class="answer-form" data-question-answer="${question.id}">${markdownEditor('content', 'Ваш ответ', answer?.content || '', 7, 'Развёрнутая позиция, аргументы и примеры', `answer-${question.id}`)}<div class="answer-form-actions"><button type="submit" class="secondary">${icon('send')} ${answer ? 'Сохранить ответ' : 'Отправить ответ'}</button>${answer ? `<button type="button" class="text-button" data-cancel-question-answer="${question.id}">Отмена</button>` : ''}</div></form>`
    : answer ? `<div class="answer-read">${markdownView(answer.content, 'Ответ пуст.')}</div>` : `<div class="answer-placeholder">Ожидаем позицию партнёра</div>`;
  return `<section class="answer-panel ${answer ? 'answered' : ''}"><header><span class="avatar">${escapeHTML(user.username.slice(0, 2).toUpperCase())}</span><span><strong>${escapeHTML(user.username)}</strong><small>${answer ? `Ответ обновлён ${formatDate(answer.updatedAt, true)}` : 'Ответа пока нет'}</small></span>${controls}</header>${content}</section>`;
}

const questionOutputLabels = Object.freeze({
  preference: 'Критерий',
  limitation: 'Ограничение',
  rule: 'Правило',
  insight: 'Вывод',
  task: 'Задача',
  idea: 'Идея',
  research: 'Исследование',
  goal: 'Цель',
});

function renderJointDecision(question) {
  const source = question.decision.sourceAuthorUsername ? `Выбрано из ответа ${question.decision.sourceAuthorUsername}` : 'Сформулировано после обсуждения';
  const draft = state.aiQuestionDrafts.get(question.id);
	return `<section class="joint-decision"><span class="decision-icon">${icon('scale')}</span><div><p class="eyebrow">Совместный итог</p>${markdownView(question.decision.content, 'Итог пуст.', 'Совместный итог')}<small>${escapeHTML(source)} · зафиксировал ${escapeHTML(question.decision.decidedByUsername)}</small>${question.outputs?.length ? `<div class="decision-outputs"><span>Уже используется:</span>${question.outputs.map((output) => `<button type="button" data-related-record="${output.recordId}">${escapeHTML(questionOutputLabels[output.kind || output.type] || typeMeta[output.type]?.singular || 'Карточка')}: ${escapeHTML(output.title)}</button>`).join('')}</div>` : ''}${draft?.suggestedOutputs?.length ? `<div class="ai-question-outputs"><span>AI выделил самостоятельные сущности. Подтвердите нужные:</span>${draft.suggestedOutputs.map((output, index) => `<button type="button" data-ai-question-output-index="${index}" data-question-id="${question.id}">${icon('sparkles')} ${escapeHTML(questionOutputLabels[output.kind || output.type] || typeMeta[output.type]?.singular || 'Карточка')}: ${escapeHTML(output.title)}</button>`).join('')}</div>` : ''}</div><div class="decision-actions"><button type="button" class="secondary ai-action" data-ai-question-structure="${question.id}">${icon('sparkles')} Выделить правила и ограничения</button><details class="output-menu"><summary>${icon('plus')} Использовать вывод</summary><div>${Object.entries(questionOutputLabels).map(([kind, label]) => `<button type="button" data-create-output="${kind}" data-question-id="${question.id}">${escapeHTML(label)}</button>`).join('')}</div></details><details><summary>${icon('edit')} Изменить итог</summary>${renderDecisionComposer(question, true)}</details></div></section>`;
}

function renderDecisionComposer(question, compact = false) {
  const draft = state.aiQuestionDrafts.get(question.id);
	const loading = state.aiQuestionDraftLoading === question.id;
	const initial = draft?.decision || (compact && question.decision && !question.decision.sourceAnswerId ? question.decision.content : '');
	return `<section class="decision-composer ${compact ? 'compact' : ''}"><div class="decision-composer-heading"><div><p class="eyebrow">Зафиксировать совместное решение</p><h4>Выберите готовый ответ или напишите новый итог</h4></div><div class="ai-question-actions"><button type="button" class="secondary ai-action" data-ai-question-draft="${question.id}" ${loading ? 'disabled' : ''}>${loading ? '<span class="spinner"></span> Формируем' : `${icon('sparkles')} Предложить общий итог`}</button><button type="button" class="secondary ai-action" data-ai-question-structure="${question.id}" ${loading ? 'disabled' : ''}>${icon('sliders')} Выделить правила и ограничения</button></div></div><div class="decision-options">${question.answers.map((answer) => `<button type="button" class="answer-choice" data-select-answer="${answer.id}" data-question-id="${question.id}"><span class="avatar tiny">${escapeHTML(answer.authorUsername.slice(0, 2).toUpperCase())}</span><span><strong>Принять ответ ${escapeHTML(answer.authorUsername)}</strong><small>${escapeHTML(markdownPlain(answer.content).slice(0, 120))}${markdownPlain(answer.content).length > 120 ? '…' : ''}</small></span>${icon('chevronRight')}</button>`).join('')}</div>${draft ? `<aside class="ai-question-draft-note"><strong>${icon('sparkles')} Редактируемый черновик ${draft.source === 'gemini' ? 'Gemini' : draft.source === 'groq' ? 'Groq' : ''}</strong><p>${escapeHTML(draft.rationale)}</p>${draft.suggestedOutputs?.length ? `<div class="ai-structure-preview"><span>Выделено для последующей фиксации:</span>${draft.suggestedOutputs.map((output) => `<b>${escapeHTML(questionOutputLabels[output.kind || output.type] || output.kind || typeMeta[output.type]?.singular || 'Сущность')}: ${escapeHTML(output.title)}</b>`).join('')}</div>` : ''}</aside>` : ''}<form class="custom-decision-form" data-custom-decision="${question.id}">${markdownEditor('content', 'Новый общий итог', initial, 6, 'Формулировка после обсуждения', `decision-${question.id}`)}<button type="submit" class="primary">${icon('check')} Сохранить общий итог</button></form></section>`;
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

function renderWorkflowLoading(tab) {
  return `<div class="record-pane ${state.activeRecordTab === tab ? 'active' : ''}" data-record-pane="${tab}"><div class="relations-loading"><span class="spinner"></span><strong>Загружаем рабочие данные</strong><small>Остальные части карточки уже доступны.</small></div></div>`;
}

function reviewLabel(action) {
  return ({ submitted: 'Отправил результат на проверку', accepted: 'Принял результат', rework: 'Вернул задачу на доработку' })[action] || action;
}

function renderChecklistItem(record, item, canEdit) {
  const canExecute = canEdit || !item.ownerId || item.ownerId === state.me.id;
  return `<article class="checklist-item ${item.status}">
    <button type="button" class="checklist-toggle" data-checklist-toggle="${item.id}" data-next-status="${item.status === 'completed' ? 'open' : 'completed'}" ${canExecute ? '' : 'disabled'} aria-label="${item.status === 'completed' ? 'Вернуть шаг в работу' : 'Завершить шаг'}">${item.status === 'completed' ? icon('check') : ''}</button>
    <div><strong>${escapeHTML(item.title)}</strong><small>${item.ownerUsername ? escapeHTML(item.ownerUsername) : 'Без отдельного исполнителя'}${item.completedAt ? ` · выполнено ${formatDate(item.completedAt, true)}` : ''}</small>${item.proofText ? markdownView(item.proofText, '', `Отчёт по шагу «${item.title}»`) : ''}</div>
    ${canExecute ? `<details class="checklist-edit"><summary class="icon-button" aria-label="Отчёт по шагу">•••</summary><form data-checklist-report="${item.id}">${canEdit ? `<label>Шаг<input name="title" value="${escapeHTML(item.title)}" maxlength="300"></label><label>Исполнитель<select name="ownerId"><option value="">Без отдельного исполнителя</option>${userOptions(item.ownerId)}</select></label>` : ''}${markdownEditor('proofText', 'Отчёт по шагу', item.proofText || '', 5, 'Что сделано и где результат', `checklist-${item.id}`)}<div class="form-actions"><button type="submit" class="secondary">Сохранить</button></div></form></details>` : ''}
  </article>`;
}

function renderExecutionPane(record, detail, canEdit) {
  if (!detail.workflowLoaded) return renderWorkflowLoading('execution');
  const workflow = detail.workflow;
  const checklist = workflow.checklist || [];
  const completed = checklist.filter((item) => item.status === 'completed').length;
  const recurrence = workflow.recurrence || { cadence: 'none', interval: 1, active: false };
  return `<div class="record-pane ${state.activeRecordTab === 'execution' ? 'active' : ''}" data-record-pane="execution">
    <section class="execution-summary"><div><p class="eyebrow">План выполнения</p><h3>${completed} из ${checklist.length} шагов готово</h3></div><progress class="progress-track" max="100" value="${checklist.length ? Math.round(completed * 100 / checklist.length) : 0}"></progress></section>
    <section class="checklist-panel"><div class="section-heading"><div><h3>Шаги и подзадачи</h3><p>У каждого шага может быть свой исполнитель и короткий отчёт.</p></div></div><div class="checklist-list">${checklist.map((item) => renderChecklistItem(record, item, canEdit)).join('') || `<div class="guided-empty compact">${icon('checkSquare')}<h3>Разбейте задачу на проверяемые шаги</h3><p>Это показывает фактический ход работы без ручного процента.</p></div>`}</div>${canEdit ? `<form id="checklist-add-form" class="checklist-add"><input name="title" required maxlength="300" placeholder="Новый шаг"><select name="ownerId"><option value="">Без отдельного исполнителя</option>${userOptions(record.ownerId)}</select><button type="submit" class="secondary">${icon('plus')} Добавить</button></form>` : ''}</section>
    ${renderProofBlock(record, detail.proofs, workflow.reviews || [])}
    <section class="recurrence-panel"><div><p class="eyebrow">Повторение</p><h3>Следующая задача после завершения</h3><p>Система создаст новую связанную карточку с теми же шагами и новым сроком.</p></div>${canEdit ? `<form id="recurrence-form"><label class="check"><input name="active" type="checkbox" ${recurrence.active ? 'checked' : ''}> Повторять</label><input name="interval" type="number" min="1" max="365" value="${Number(recurrence.interval || 1)}" aria-label="Интервал"><select name="cadence"><option value="daily" ${recurrence.cadence === 'daily' ? 'selected' : ''}>дней</option><option value="weekly" ${recurrence.cadence === 'weekly' ? 'selected' : ''}>недель</option><option value="monthly" ${recurrence.cadence === 'monthly' ? 'selected' : ''}>месяцев</option></select><button type="submit" class="secondary">Сохранить</button></form>` : `<strong>${recurrence.active ? `Каждые ${recurrence.interval} · ${recurrence.cadence}` : 'Не повторяется'}</strong>`}</section>
  </div>`;
}

function renderDiscussionPane(detail) {
  if (!detail.workflowLoaded) return renderWorkflowLoading('discussion');
  const comments = detail.workflow.comments || [];
  return `<div class="record-pane ${state.activeRecordTab === 'discussion' ? 'active' : ''}" data-record-pane="discussion"><section class="discussion-panel"><div class="section-heading"><div><p class="eyebrow">Командный контекст</p><h3>Обсуждение</h3><p>Упомяните партнёра через @логин. Комментарии не редактируются и остаются в истории.</p></div></div><div class="comment-list">${comments.map((comment) => `<article class="comment"><header><span class="avatar">${escapeHTML(comment.authorUsername.slice(0, 2).toUpperCase())}</span><div><strong>${escapeHTML(comment.authorUsername)}</strong><time>${formatDate(comment.createdAt, true)}</time></div></header>${markdownView(comment.body, '', `Комментарий ${comment.authorUsername}`)}</article>`).join('') || `<div class="guided-empty compact">${icon('messages')}<h3>Обсуждение ещё не начато</h3><p>Фиксируйте вопросы и договорённости рядом с самой карточкой.</p></div>`}</div><form id="comment-form" class="comment-form">${markdownEditor('body', 'Новый комментарий', '', 6, `Например: @${state.users.find((user) => user.id !== state.me.id)?.username || 'партнёр'} посмотри аргументы`, 'comment')}<button type="submit" class="primary">${icon('send')} Отправить</button></form></section></div>`;
}

function formatFileSize(bytes) {
  const value = Number(bytes || 0);
  if (value < 1024) return `${value} Б`;
  if (value < 1048576) return `${Math.round(value / 1024)} КБ`;
  return `${(value / 1048576).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} МБ`;
}

function renderFilesPane(detail, canEdit) {
  if (!detail.workflowLoaded) return renderWorkflowLoading('files');
  const attachments = detail.workflow.attachments || [];
  return `<div class="record-pane ${state.activeRecordTab === 'files' ? 'active' : ''}" data-record-pane="files"><section class="files-panel"><div class="section-heading"><div><p class="eyebrow">Материалы карточки</p><h3>Файлы</h3><p>Файл нельзя бесследно удалить; имя, автор, размер и контрольная сумма остаются в аудите.</p></div></div><div class="attachment-list">${attachments.map((file) => `<a class="attachment" href="/api/attachments/${file.id}/download"><span class="type-icon type-document">${icon('fileText')}</span><span><strong>${escapeHTML(file.originalName)}</strong><small>${formatFileSize(file.sizeBytes)} · ${escapeHTML(file.uploaderUsername)} · ${formatDate(file.createdAt, true)}</small></span>${icon('chevronRight')}</a>`).join('') || `<div class="guided-empty compact">${icon('fileText')}<h3>Файлов пока нет</h3><p>Приложите отчёт, таблицу, изображение или исходный документ.</p></div>`}</div>${canEdit ? `<form id="attachment-form" class="attachment-form"><label class="file-drop" data-file-drop><input name="files" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.txt,.md,.csv,.xlsx,.docx,.pptx,.zip"><span class="file-drop-icon">${icon('fileText')}</span><span><strong>Перетащите файлы сюда</strong><small>или выберите несколько файлов · до 15 МБ каждый</small></span><button type="button" class="secondary" data-choose-files>${icon('plus')} Выбрать</button></label><div class="upload-queue" id="upload-queue" aria-live="polite"></div><button type="submit" class="primary upload-submit" disabled>${icon('send')} Загрузить выбранные</button></form>` : ''}</section></div>`;
}

function renderUploadQueue(files) {
	const queue = $('#upload-queue');
	const submit = $('#attachment-form .upload-submit');
	if (!queue || !submit) return;
	queue.innerHTML = files.map((file, index) => `<div class="upload-item" data-upload-index="${index}"><span class="type-icon type-document">${icon('fileText')}</span><span><strong>${escapeHTML(file.name)}</strong><small>${formatFileSize(file.size)} · готов к загрузке</small><progress max="100" value="0"></progress></span><b>0%</b></div>`).join('');
	submit.disabled = files.length === 0;
}

function uploadAttachmentFile(recordID, file, row) {
	return new Promise((resolve, reject) => {
		if (file.size > 15 * 1024 * 1024) return reject(new Error('Файл больше 15 МБ'));
		const xhr = new XMLHttpRequest();
		xhr.open('POST', `/api/records/${recordID}/attachments`);
		xhr.withCredentials = true;
		const progress = $('progress', row);
		const percent = $('b', row);
		const meta = $('small', row);
		xhr.upload.addEventListener('progress', (event) => {
			if (!event.lengthComputable) return;
			const value = Math.round(event.loaded * 100 / event.total);
			progress.value = value; percent.textContent = `${value}%`; meta.textContent = `${formatFileSize(file.size)} · загружается`;
		});
		xhr.addEventListener('load', () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				progress.value = 100; percent.textContent = '100%'; meta.textContent = `${formatFileSize(file.size)} · загружен`; row.classList.add('complete'); resolve(); return;
			}
			let message = 'Не удалось загрузить файл';
			try { message = JSON.parse(xhr.responseText).error || message; } catch (_) {}
			reject(new Error(message));
		});
		xhr.addEventListener('error', () => reject(new Error('Соединение прервано')));
		xhr.addEventListener('abort', () => reject(new Error('Загрузка отменена')));
		const body = new FormData(); body.append('file', file, file.name); xhr.send(body);
	});
}

async function uploadAttachmentBatch(recordID, files) {
	const selected = [...files];
	if (!selected.length) return;
	renderUploadQueue(selected);
	const submit = $('#attachment-form .upload-submit');
	if (submit) submit.disabled = true;
	let succeeded = 0;
	for (let index = 0; index < selected.length; index += 1) {
		const row = $(`[data-upload-index="${index}"]`);
		try { await uploadAttachmentFile(recordID, selected[index], row); succeeded += 1; }
		catch (error) { row?.classList.add('failed'); const meta = $('small', row); const percent = $('b', row); if (meta) meta.textContent = error.message; if (percent) percent.textContent = 'Ошибка'; }
	}
	if (succeeded) await refreshActiveRecordWorkflow(recordID);
	toast(succeeded === selected.length ? `Загружено файлов: ${succeeded}` : `Загружено ${succeeded} из ${selected.length}`, succeeded !== selected.length);
}

function recordActivity(detail) {
  return detail.activityLoaded ? detail.activity : state.activity.filter((item) => item.entityId === detail.record.id);
}

function renderRecordContextStrip(record) {
  const hasDeadline = ['task', 'goal', 'question_set', 'research', 'disagreement', 'meeting', 'risk', 'hypothesis', 'experiment'].includes(record.type);
	const blockers = activeBlockers(record);
  return `<div class="record-context-strip"><span><small>Ответственный</small><strong>${escapeHTML(record.ownerUsername)}</strong></span><span><small>Статус</small><strong>${escapeHTML(statusLabel(record))}</strong></span>${blockers.length ? `<span class="context-blocker"><small>Зависимости</small><strong>${blockers.length} активн.</strong></span>` : ''}${(isWorkRecord(record) && record.type !== 'inbox') || record.type === 'goal' ? `<span><small>Приоритет</small><strong>${escapeHTML(priorityLabels[record.priority || 'normal'])}</strong></span>` : ''}${hasDeadline ? `<span><small>${record.type === 'meeting' ? 'Дата' : 'Срок'}</small><strong class="deadline ${deadlineState(record).className}">${escapeHTML(deadlineState(record).label)}</strong></span>` : ''}</div>`;
}

function renderRecordDialog() {
  const detail = state.activeDetail;
  const record = detail.record;
  const statuses = [...(statusesByType[record.type] || statusesByType.default)];
  if (!statuses.includes(record.status)) statuses.push(record.status);
  const linkedIDs = new Set((detail.links || []).map((link) => link.record.id));
	const allLinkTargets = state.records
		.filter((item) => item.id !== record.id && !linkedIDs.has(item.id) && (state.linkTargetIncludeInactive || isActiveRecord(item)))
		.sort((left, right) => Number(right.workstream === record.workstream) - Number(left.workstream === record.workstream) || new Date(right.updatedAt) - new Date(left.updatedAt));
  const criteria = state.records.filter((item) => item.type === 'criterion' && item.status !== 'archived');
  const activity = recordActivity(detail);
  const hasDeadline = ['task', 'goal', 'question_set', 'research', 'disagreement', 'meeting', 'risk', 'hypothesis', 'experiment'].includes(record.type);
  const canEdit = record.editPolicy !== 'owner_only' || record.ownerId === state.me.id || record.authorId === state.me.id;
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
		${record.type === 'task' ? renderExecutionPane(record, detail, canEdit) : ''}
		${renderDiscussionPane(detail)}
		${renderFilesPane(detail, canEdit)}
        ${renderRecordRelations(record, detail, criteria, allLinkTargets)}
        ${renderRecordHistory(activity)}
      </div>
      <aside class="dialog-aside">
        <div class="fact"><span>${record.type === 'question_set' ? 'Координатор' : record.type === 'meeting' ? 'Организатор' : 'Ответственный'}</span><strong>${escapeHTML(record.ownerUsername)}</strong></div>
        <div class="fact"><span>Статус</span><strong>${escapeHTML(statusLabel(record))}</strong></div>
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
  const mutationSelectors = ['#record-edit-form input', '#record-edit-form select', '#record-edit-form textarea', '#record-edit-form button', '.section-form input', '.section-form textarea', '.section-form button', '#custom-section-form input', '#custom-section-form textarea', '#custom-section-form button', '.criterion-form input', '.criterion-form button', '#link-form select', '#link-form button', '[data-remove-link]', '[data-create-linked]', '[data-create-from-record]', '[data-ai-link]', '[data-ai-apply-plan]', '[data-ai-create-next]', '[data-ai-create-decision]', '[data-ai-output-index]', '[data-ai-question-output-index]', '[data-ai-fill-research-option]', '[data-complete-research]', '[data-open-record-edit]', '[data-edit-field]', '#add-questions-form textarea', '#add-questions-form button', '[data-select-answer]', '[data-custom-decision] textarea', '[data-custom-decision] button', '[data-create-output]', '[data-archive-question]', '[data-new-research-option]', '[data-edit-research-option]', '[data-archive-research-option]', '[data-archive-research-field]', '#research-option-form input', '#research-option-form textarea', '#research-option-form button', '#research-field-form input', '#research-field-form select', '#research-field-form button', '#notify-partners', '#archive-record', '#convert-to-questions'];
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
  return `<details class="accordion" ${open ? 'open' : ''}><summary><span>Смысловые связи</span><small>${linksCountLabel(links.length)}</small></summary><div class="link-semantics-note">${icon('help')}<span><strong>Это не иерархия.</strong> Здесь фиксируется влияние или общая тема. Родителя меняйте в блоке «Иерархия работы» на вкладке «Обзор».</span></div>${createOptions.length ? `<div class="linked-create"><span>Создать следующий объект</span>${createOptions.map(([type, kind, label]) => `<button type="button" data-create-linked="${type}" data-linked-kind="${kind}">${icon(typeMeta[type].icon)} ${label}</button>`).join('')}</div>` : ''}<div class="linked-list">${links.map((link) => `<div class="linked-item"><button type="button" data-related-record="${link.record.id}"><i class="type-icon type-${link.record.type}">${icon(typeMeta[link.record.type].icon)}</i><span><strong>${escapeHTML(link.record.title)}</strong><small>${escapeHTML(relationLabel(link))} · ${typeMeta[link.record.type].singular}</small></span></button><button type="button" class="icon-button danger-icon remove-link" data-remove-link="${link.id}" aria-label="Убрать связь" title="Убрать связь">${icon('x')}</button></div>`).join('') || emptyState('Явных смысловых связей с другими карточками пока нет.')}</div><div class="link-picker-tools"><label>${icon('search')}<input id="link-target-search" type="search" placeholder="Найти активную карточку"></label><button type="button" class="text-button" data-link-target-scope>${state.linkTargetIncludeInactive ? 'Скрыть завершённые' : 'Показать завершённые и архивные'}</button></div><form id="link-form" class="link-form"><select name="targetId" required><option value="">${targets.length ? 'Выберите существующую карточку' : 'Подходящих активных карточек нет'}</option>${targets.map((target) => `<option value="${target.id}">${typeMeta[target.type].singular}: ${escapeHTML(target.title)}</option>`).join('')}</select><select name="relationType" aria-label="Как текущая карточка связана с выбранной"><option value="related">Общая тема, без направления</option><option value="supports">Текущая поддерживает выбранную</option><option value="depends_on">Текущая зависит от выбранной</option><option value="result_of">Текущая — результат выбранной</option><option value="leads_to">Текущая приводит к выбранной</option></select><button class="secondary" type="submit" ${targets.length ? '' : 'disabled'}>${icon('link')} Связать</button></form></details>`;
}

function renderProofBlock(record, proofs, reviews = []) {
  const canComplete = record.ownerId === state.me.id || record.editPolicy === 'shared';
  const reviewerID = record.decisionMakerId || record.authorId;
  const canReview = record.status === 'review' && reviewerID === state.me.id;
  const needsReview = record.authorId !== record.ownerId || Boolean(record.decisionMakerId);
  const active = !['completed', 'cancelled', 'archived'].includes(record.status);
  return `<section class="proof-panel"><div class="section-heading"><div><p class="eyebrow">Результат задачи</p><h3>Доказательства и приёмка</h3><p>${needsReview ? 'После отчёта постановщик или принимающий подтверждает результат.' : 'Личная задача завершается сразу после добавления результата.'}</p></div><strong>${proofs.length}</strong></div><div class="proof-list">${proofs.map((proof) => `<article class="proof"><header><strong>${escapeHTML(proof.authorUsername)}</strong><time>${formatDate(proof.createdAt, true)}</time></header>${proof.kind === 'link' && /^https?:\/\//i.test(proof.content) ? `<a href="${escapeHTML(proof.content)}" target="_blank" rel="noreferrer">${escapeHTML(proof.content)}</a>` : markdownView(proof.content, '', 'Доказательство выполнения')}</article>`).join('') || `<div class="guided-empty compact">${icon('checkSquare')}<h3>Подтверждений пока нет</h3><p>Приложите текстовый результат или ссылку до отправки на проверку.</p></div>`}</div>${canComplete && active && record.status !== 'review' ? `<form id="proof-form" class="proof-form"><select name="kind"><option value="text">Текст</option><option value="link">Ссылка</option></select>${markdownEditor('content', 'Доказательство', '', 5, 'Что сделано или где находится результат', 'task-proof')}<button class="secondary" type="submit">Приложить</button></form><div class="completion-box">${markdownEditor('result', 'Краткий итог', record.result || '', 5, 'Что получили в результате', 'task-result')}<label class="check"><input id="notify-on-complete" type="checkbox" checked> Уведомить партнёра</label><button type="button" class="success" id="complete-task" ${proofs.length ? '' : 'disabled'}>${needsReview ? 'Отправить на проверку' : 'Завершить задачу'}</button></div>` : ''}${record.status === 'review' ? `<div class="review-banner"><span>${icon('clock')}</span><div><strong>${canReview ? 'Результат ждёт вашего решения' : 'Результат отправлен на проверку'}</strong><p>${escapeHTML(record.result || 'Исполнитель не добавил итог.')}</p></div>${canReview ? `<div><button type="button" class="success" data-review-task="accept">${icon('check')} Принять</button><button type="button" class="secondary" data-review-task="rework">Вернуть</button></div>` : ''}</div>` : ''}${reviews.length ? `<div class="review-history"><h4>История приёмки</h4>${reviews.map((review) => `<article><span class="history-node"></span><div><strong>${escapeHTML(review.actorUsername)} · ${escapeHTML(reviewLabel(review.action))}</strong>${review.reason ? `<p>${escapeHTML(review.reason)}</p>` : ''}<small>${formatDate(review.createdAt, true)}</small></div></article>`).join('')}</div>` : ''}</section>`;
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
  const businessDetails = businessDetailsFromForm(form, record.type);
  if (businessDetails) {
    const previous = record.businessDetails || {};
    const normalizedPrevious = record.type === 'risk'
      ? { probability: Number(previous.probability || 0), impact: Number(previous.impact || 0), mitigation: previous.mitigation || '', occurred: Boolean(previous.occurred) }
      : record.type === 'decision'
        ? { decisionState: previous.decisionState || 'active', supersedesId: previous.supersedesId || '', effectiveAt: previous.effectiveAt ? new Date(previous.effectiveAt).toISOString() : '', reviewAt: previous.reviewAt ? new Date(previous.reviewAt).toISOString() : '' }
        : { metric: previous.metric || '', successThreshold: previous.successThreshold || '', experimentMethod: previous.experimentMethod || '', verdict: previous.verdict || 'pending' };
    if (JSON.stringify(businessDetails) !== JSON.stringify(normalizedPrevious)) body.businessDetails = businessDetails;
  }
  const substantiveKeys = Object.keys(body).filter((key) => key !== 'expectedUpdatedAt');
  const previousDetails = record.businessDetails || {};
  const importantBusinessChange = body.businessDetails && ((record.type === 'decision' && (body.businessDetails.decisionState !== (previousDetails.decisionState || 'active') || body.businessDetails.supersedesId !== (previousDetails.supersedesId || ''))) || (record.type === 'risk' && body.businessDetails.occurred !== Boolean(previousDetails.occurred)));
  const reasonRequired = ['status', 'dueAt', 'parentId', 'isRoot'].some((key) => Object.prototype.hasOwnProperty.call(body, key)) || importantBusinessChange;
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
  $('[data-close-dialog]').addEventListener('click', () => requestDialogClose($('#record-dialog')));
  $$('[data-record-tab]').forEach((button) => button.addEventListener('click', async () => {
    state.activeRecordTab = button.dataset.recordTab;
    $$('.record-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.recordTab === state.activeRecordTab));
    $$('[data-record-pane]').forEach((pane) => pane.classList.toggle('active', pane.dataset.recordPane === state.activeRecordTab));
    if (state.activeRecordTab === 'relations' && !state.activeDetail.relationsLoaded) await loadRecordRelations(record.id);
    if (state.activeRecordTab === 'history' && !state.activeDetail.activityLoaded) await loadRecordActivity(record.id);
		if (['execution', 'discussion', 'files'].includes(state.activeRecordTab) && !state.activeDetail.workflowLoaded) await loadRecordWorkflow(record.id);
    if (state.activeRecordTab === 'content' && record.type === 'research' && !state.researchComparisons.has(record.id)) {
      try {
        await loadResearchComparison(record.id);
        if (state.activeDetail?.record.id === record.id && state.activeRecordTab === 'content') renderRecordDialog();
      } catch (error) { toast(error.message, true); }
    }
  }));
  const startEditing = (field = '') => {
    state.activeRecordTab = 'overview';
    state.recordEditMode = true;
    renderRecordDialog();
    requestAnimationFrame(() => {
      const form = $('#record-edit-form');
      const input = field ? form?.elements.namedItem(field) : form?.elements.namedItem('title');
      if (!input) return;
      input.closest('details')?.setAttribute('open', '');
      const trigger = input.closest('.custom-select')?.querySelector('.custom-select-trigger');
      (trigger || input).focus();
      if (typeof input.select === 'function' && !trigger) input.select();
    });
  };
  $$('[data-open-record-edit]').forEach((button) => button.addEventListener('click', () => startEditing()));
  $$('[data-edit-field]').forEach((button) => button.addEventListener('click', () => startEditing(button.dataset.editField)));
  $('[data-change-parent]')?.addEventListener('click', () => changeRecordParent(record));
  $$('[data-triage-inbox]').forEach((button) => button.addEventListener('click', async () => {
    const targetType = button.dataset.triageInbox;
    const reasons = {
      task: 'Из записи следует конкретная работа',
      idea: 'Запись описывает идею для дальнейшего отбора',
      question_set: 'Тему нужно отдельно обсудить обоим основателям',
      research: 'Для вывода нужно собрать и сравнить данные',
      risk: 'Запись описывает возможную помеху или потерю',
      hypothesis: 'Запись содержит предположение, которое нужно проверить',
      experiment: 'Нужна отдельная проверка с метрикой и порогом успеха',
      document: 'Это справочный материал без отдельного рабочего процесса',
    };
    const reason = await askText({ title: `Сделать карточкой «${typeMeta[targetType].singular}»`, label: 'Почему выбран этот тип?', defaultValue: reasons[targetType] || 'Записи назначен подходящий рабочий тип', required: true });
    if (!reason) return;
    await mutateRecord(`/api/records/${record.id}/triage`, { method: 'POST', body: JSON.stringify({ targetType, reason }) });
  }));
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
    $('[data-cancel-record-edit]')?.addEventListener('click', async () => {
      if (!await confirmDialogTransition($('#record-dialog'))) return;
      state.recordEditMode = false;
      renderRecordDialog();
    });
    editForm.addEventListener('submit', async (event) => {
      event.preventDefault();
      const { body, substantiveKeys, reasonRequired } = buildRecordUpdate(event.currentTarget, record);
      if (!substantiveKeys.length) return toast('Изменений нет');
      if (reasonRequired && !body.reason) {
        $('#record-reason-field').hidden = false;
        event.currentTarget.elements.reason.focus();
        return toast('Укажите причину изменения статуса, срока или места в иерархии', true);
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
      toast(analysis.source === 'gemini' ? 'Разбор Gemini готов' : analysis.source === 'groq' ? 'Разбор Groq готов' : 'Локальный разбор готов');
    } catch (error) {
      toast(error.message, true);
    } finally {
      state.aiAnalysisLoading = '';
      if (state.activeDetail?.record.id === record.id) renderRecordDialog();
    }
  });
	$('[data-complete-research]')?.addEventListener('click', async () => {
		if (!record.result?.trim()) {
			startEditing('result');
			return toast('Сначала зафиксируйте вывод исследования');
		}
		const reason = await askText({ title: 'Завершить исследование', label: 'Что подтверждает готовность вывода?', defaultValue: 'Варианты сравнены, итог сформулирован и готов к совместному решению', required: true });
		if (!reason) return;
		await mutateRecord(`/api/records/${record.id}/complete-research`, { method: 'POST', body: JSON.stringify({ result: record.result, reason }) });
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
  $('[data-ai-create-decision]')?.addEventListener('click', () => {
    const analysis = state.aiAnalyses.get(record.id);
    if (!analysis?.proposedDecision) return;
    openCreateDialog('decision', { title: `Итог: ${record.title}`.slice(0, 240), description: analysis.proposedDecision, sourceRecordId: record.id, relationType: 'produced', reason: 'AI подготовил черновик по полному досье; пользователь подтвердил создание решения' });
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
    try { await api(`/api/records/${record.id}/notify`, { method: 'POST', body: JSON.stringify({ message }) }); toast('Уведомление отправлено'); await syncProjectChanges(); } catch (error) { toast(error.message, true); }
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
    const saved = await mutateDetail(`/api/records/${record.id}/sections`, { method: 'POST', body: JSON.stringify({ sectionId: event.currentTarget.dataset.sectionId, definitionId: event.currentTarget.dataset.definitionId || null, title: form.get('title'), content: form.get('content'), reason: form.get('reason') }) });
    if (saved) clearWorkingDraftFor(event.currentTarget);
  }));
  $('#custom-section-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const saved = await mutateDetail(`/api/records/${record.id}/sections`, { method: 'POST', body: JSON.stringify({ title: form.get('title'), content: form.get('content') }) }); if (saved) clearWorkingDraftFor(event.currentTarget); });
  $$('[data-new-research-option]').forEach((button) => button.addEventListener('click', () => { state.activeResearchOptionId = 'new'; renderRecordDialog(); requestAnimationFrame(() => $('#research-option-form input[name="title"]')?.focus()); }));
  $$('[data-edit-research-option]').forEach((button) => button.addEventListener('click', () => { state.activeResearchOptionId = button.dataset.editResearchOption; renderRecordDialog(); requestAnimationFrame(() => $('#research-option-form input[name="title"]')?.focus()); }));
  $$('[data-cancel-research-option]').forEach((button) => button.addEventListener('click', () => { state.activeResearchOptionId = ''; renderRecordDialog(); }));
	$('[data-ai-fill-research-option]')?.addEventListener('click', async (event) => {
		const form = $('#research-option-form');
		const button = event.currentTarget;
		const context = Object.fromEntries([...new FormData(form).entries()].filter(([, value]) => typeof value === 'string'));
		button.disabled = true; button.innerHTML = '<span class="spinner"></span> Формируем';
		try {
			const draft = await api(`/api/records/${record.id}/ai-draft-field`, { method: 'POST', body: JSON.stringify({ target: 'research_option', label: `Вариант исследования ${context.title || ''}`, formContext: context }) });
			let filled = 0;
			for (const name of ['summaryMd', 'prosMd', 'consMd', 'notesMd']) {
				const source = form.elements[name];
				if (!source?.value.trim() && draft.fields?.[name]) {
					const editor = source.closest('.markdown-editor');
					if (editor) setMarkdownEditorValue(editor, draft.fields[name]); else source.value = draft.fields[name];
					filled += 1;
				}
			}
			toast(filled ? `AI заполнил пустых смысловых полей: ${filled}` : 'Заполненный вручную текст не изменён');
		} catch (error) { toast(error.message, true); }
		finally { if (button.isConnected) { button.disabled = false; button.innerHTML = `${icon('sparkles')} Заполнить пропуски AI`; } }
	});
  $('#research-option-form')?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const comparison = state.researchComparisons.get(record.id);
    const optionID = event.currentTarget.dataset.optionId;
    const option = comparison?.options.find((item) => item.id === optionID);
    const values = {};
    comparison?.fields.forEach((field) => { values[field.id] = String(form.get(`field:${field.id}`) || ''); });
    const body = { title: form.get('title'), rating: Number(form.get('rating') || 0), summaryMd: form.get('summaryMd'), prosMd: form.get('prosMd'), consMd: form.get('consMd'), notesMd: form.get('notesMd'), reason: form.get('reason') || '', expectedUpdatedAt: option?.updatedAt || '', values };
    const saved = await mutateResearchComparison(record.id, optionID ? `/api/records/${record.id}/research-options/${optionID}` : `/api/records/${record.id}/research-options`, { method: optionID ? 'PATCH' : 'POST', body: JSON.stringify(body) }, optionID ? 'Вариант обновлён' : 'Вариант добавлен');
    if (saved) clearWorkingDraftFor(event.currentTarget);
  });
  $('#research-field-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const saved = await mutateResearchComparison(record.id, `/api/records/${record.id}/research-fields`, { method: 'POST', body: JSON.stringify({ name: form.get('name'), fieldType: form.get('fieldType') }) }, 'Поле сравнения добавлено');
    if (saved) clearWorkingDraftFor(event.currentTarget);
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
	$('[data-link-target-scope]')?.addEventListener('click', () => { state.linkTargetIncludeInactive = !state.linkTargetIncludeInactive; renderRecordDialog(); });
	$('#link-target-search')?.addEventListener('input', (event) => {
		const query = event.currentTarget.value.trim().toLocaleLowerCase('ru-RU');
		const select = $('#link-form select[name="targetId"]');
		$$('.custom-select-option', select?.closest('.custom-select')).forEach((option) => {
			if (!option.dataset.value) return;
			option.hidden = Boolean(query) && !option.textContent.toLocaleLowerCase('ru-RU').includes(query);
		});
	});
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
    const saved = await mutateDetail(`/api/records/${record.id}/questions`, { method: 'POST', body: JSON.stringify({ questions: form.get('questions') }) });
    if (saved) clearWorkingDraftFor(event.currentTarget);
  });
  $$('[data-edit-question-answer]').forEach((button) => button.addEventListener('click', () => {
    state.editingQuestionAnswerId = button.dataset.editQuestionAnswer;
    renderRecordDialog();
    requestAnimationFrame(() => $(`[data-question-answer="${CSS.escape(state.editingQuestionAnswerId)}"] .markdown-rich-editor`)?.focus());
  }));
  $$('[data-cancel-question-answer]').forEach((button) => button.addEventListener('click', () => {
    state.editingQuestionAnswerId = '';
    renderRecordDialog();
  }));
  $$('[data-question-answer]').forEach((formNode) => formNode.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const questionID = event.currentTarget.dataset.questionAnswer;
    const previousEditing = state.editingQuestionAnswerId;
    state.editingQuestionAnswerId = '';
    const saved = await mutateDetail(`/api/records/${record.id}/questions/${questionID}/answer`, { method: 'PUT', body: JSON.stringify({ content: form.get('content') }) });
    if (saved) clearWorkingDraftFor(event.currentTarget);
    if (!saved) {
      state.editingQuestionAnswerId = previousEditing || questionID;
      renderRecordDialog();
    }
  }));
  $$('[data-select-answer]').forEach((button) => button.addEventListener('click', async () => {
    await mutateDetail(`/api/records/${record.id}/questions/${button.dataset.questionId}/decision`, { method: 'POST', body: JSON.stringify({ mode: 'answer', answerId: button.dataset.selectAnswer }) });
  }));
  $$('[data-custom-decision]').forEach((formNode) => formNode.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const saved = await mutateDetail(`/api/records/${record.id}/questions/${event.currentTarget.dataset.customDecision}/decision`, { method: 'POST', body: JSON.stringify({ mode: 'custom', content: form.get('content') }) });
    if (saved) clearWorkingDraftFor(event.currentTarget);
  }));
	$$('[data-ai-question-draft]').forEach((button) => button.addEventListener('click', async () => {
		const questionID = button.dataset.aiQuestionDraft;
		state.aiQuestionDraftLoading = questionID;
		renderRecordDialog();
		try {
			const draft = await api(`/api/records/${record.id}/questions/${questionID}/ai-draft`, { method: 'POST' });
			state.aiQuestionDrafts.set(questionID, draft);
			toast('AI подготовил редактируемый общий итог');
		} catch (error) { toast(error.message, true); }
		finally { state.aiQuestionDraftLoading = ''; if (state.activeDetail?.record.id === record.id) renderRecordDialog(); }
	}));
	$$('[data-ai-question-structure]').forEach((button) => button.addEventListener('click', async () => {
		const questionID = button.dataset.aiQuestionStructure;
		state.aiQuestionDraftLoading = questionID;
		renderRecordDialog();
		try {
			const draft = await api(`/api/records/${record.id}/questions/${questionID}/ai-draft?mode=structure`, { method: 'POST' });
			state.aiQuestionDrafts.set(questionID, draft);
			toast(draft.suggestedOutputs?.length ? 'AI выделил правила, ограничения и критерии' : 'Явных правил и ограничений в ответах не найдено');
		} catch (error) { toast(error.message, true); }
		finally { state.aiQuestionDraftLoading = ''; if (state.activeDetail?.record.id === record.id) renderRecordDialog(); }
	}));
	$$('[data-ai-question-output-index]').forEach((button) => button.addEventListener('click', () => {
		const question = detail.questionWorkflow.questions.find((item) => item.id === button.dataset.questionId);
		const output = state.aiQuestionDrafts.get(button.dataset.questionId)?.suggestedOutputs?.[Number(button.dataset.aiQuestionOutputIndex)];
		if (!question?.decision || !output) return;
		openQuestionOutputDialog(record, question, output.kind || output.type, output.title, output);
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
  $('#checklist-add-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const saved = await mutateWorkflow(`/api/records/${record.id}/checklist`, { method: 'POST', body: JSON.stringify({ title: form.get('title'), ownerId: form.get('ownerId') ? Number(form.get('ownerId')) : null }) });
    if (saved) clearWorkingDraftFor(event.currentTarget);
  });
  $$('[data-checklist-toggle]').forEach((button) => button.addEventListener('click', async () => {
    await mutateWorkflow(`/api/records/${record.id}/checklist/${button.dataset.checklistToggle}`, { method: 'PATCH', body: JSON.stringify({ status: button.dataset.nextStatus }) });
  }));
  $$('[data-checklist-report]').forEach((formNode) => formNode.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const body = { proofText: form.get('proofText') || '' };
    if (event.currentTarget.elements.title) body.title = form.get('title');
    if (event.currentTarget.elements.ownerId) { if (form.get('ownerId')) body.ownerId = Number(form.get('ownerId')); else body.clearOwner = true; }
    const saved = await mutateWorkflow(`/api/records/${record.id}/checklist/${event.currentTarget.dataset.checklistReport}`, { method: 'PATCH', body: JSON.stringify(body) });
    if (saved) clearWorkingDraftFor(event.currentTarget);
  }));
  $('#comment-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    const saved = await mutateWorkflow(`/api/records/${record.id}/comments`, { method: 'POST', body: JSON.stringify({ body: form.get('body') }) });
    if (saved) clearWorkingDraftFor(event.currentTarget);
  });
	const attachmentForm = $('#attachment-form');
	if (attachmentForm) {
		const input = attachmentForm.elements.files;
		const drop = $('[data-file-drop]', attachmentForm);
		const showSelection = () => renderUploadQueue([...input.files]);
		$('[data-choose-files]', attachmentForm)?.addEventListener('click', (event) => { event.preventDefault(); input.click(); });
		input.addEventListener('change', showSelection);
		['dragenter', 'dragover'].forEach((name) => drop.addEventListener(name, (event) => { event.preventDefault(); event.dataTransfer.dropEffect = 'copy'; drop.classList.add('drag-active'); }));
		['dragleave', 'dragend'].forEach((name) => drop.addEventListener(name, () => drop.classList.remove('drag-active')));
		drop.addEventListener('drop', async (event) => {
			event.preventDefault(); drop.classList.remove('drag-active');
			await uploadAttachmentBatch(record.id, event.dataTransfer.files);
		});
		attachmentForm.addEventListener('submit', async (event) => { event.preventDefault(); await uploadAttachmentBatch(record.id, input.files); });
	}
  $('#recurrence-form')?.addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget);
    await mutateWorkflow(`/api/records/${record.id}/recurrence`, { method: 'PUT', body: JSON.stringify({ active: form.get('active') === 'on', interval: Number(form.get('interval') || 1), cadence: form.get('cadence') }) });
  });
  $('#proof-form')?.addEventListener('submit', async (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); const saved = await mutateWorkflow(`/api/records/${record.id}/proofs`, { method: 'POST', body: JSON.stringify({ kind: form.get('kind'), content: form.get('content') }) }); if (saved) clearWorkingDraftFor(event.currentTarget); });
  $('#complete-task')?.addEventListener('click', async () => {
    const result = $('.completion-box textarea[name="result"]')?.value.trim() || '';
    if (!result) return toast('Кратко опишите полученный результат', true);
    const completionBox = $('.completion-box');
    const saved = await mutateWorkflow(`/api/records/${record.id}/complete`, { method: 'POST', body: JSON.stringify({ result, notifyPartners: $('#notify-on-complete').checked }) }, record.authorId !== record.ownerId || record.decisionMakerId ? 'Результат отправлен на проверку' : 'Задача завершена');
    if (saved) clearWorkingDraftFor(completionBox);
  });
  $$('[data-review-task]').forEach((button) => button.addEventListener('click', async () => {
    const decision = button.dataset.reviewTask;
    const reason = decision === 'rework' ? await askText({ title: 'Вернуть на доработку', label: 'Что именно нужно исправить?', required: true }) : await askText({ title: 'Принять результат', label: 'Комментарий к приёмке (необязательно)' });
    if (reason === null) return;
    await mutateWorkflow(`/api/records/${record.id}/review`, { method: 'POST', body: JSON.stringify({ decision, reason }) }, decision === 'accept' ? 'Результат принят' : 'Задача возвращена на доработку');
  }));
  bindMarkdownEditors($('#record-dialog'));
  bindRecordWorkingDrafts(record.id);
}

function bindRecordWorkingDrafts(recordID) {
  $$('.section-form').forEach((form) => bindWorkingDraft(form, `record:${recordID}:section:${form.dataset.sectionId || form.dataset.definitionId || 'new'}`));
  bindWorkingDraft($('#custom-section-form'), `record:${recordID}:section:custom`);
  bindWorkingDraft($('#research-option-form'), `record:${recordID}:research-option:${$('#research-option-form')?.dataset.optionId || 'new'}`);
  bindWorkingDraft($('#research-field-form'), `record:${recordID}:research-field:new`);
  bindWorkingDraft($('#add-questions-form'), `record:${recordID}:questions:add`);
  $$('[data-question-answer]').forEach((form) => bindWorkingDraft(form, `record:${recordID}:answer:${form.dataset.questionAnswer}`));
  $$('[data-custom-decision]').forEach((form) => bindWorkingDraft(form, `record:${recordID}:decision:${form.dataset.customDecision}`));
  bindWorkingDraft($('#checklist-add-form'), `record:${recordID}:checklist:new`);
  $$('[data-checklist-report]').forEach((form) => bindWorkingDraft(form, `record:${recordID}:checklist:${form.dataset.checklistReport}`));
  bindWorkingDraft($('#comment-form'), `record:${recordID}:comment:new`);
  bindWorkingDraft($('#proof-form'), `record:${recordID}:proof:new`);
  bindWorkingDraft($('.completion-box'), `record:${recordID}:completion`);
}

async function mutateResearchComparison(recordID, url, options, successMessage) {
  try {
    const comparison = await api(url, options);
    state.researchComparisons.set(recordID, comparison);
    state.activeResearchOptionId = '';
    const detail = await fetchRecordDetail(recordID, true);
    if (state.activeDetail?.record.id !== recordID) return true;
    state.activeDetail = detail;
    const index = state.records.findIndex((item) => item.id === recordID);
    if (index >= 0) state.records[index] = detail.record;
    renderRecordDialog();
    toast(successMessage);
    return true;
  } catch (error) { toast(error.message, true); return false; }
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
  $('#reason-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">Фиксация решения</span><h2>${escapeHTML(title)}</h2></div><button type="button" class="close-button" data-cancel-reason aria-label="Закрыть">×</button></div><form id="reason-form" class="card-form dialog-form" novalidate><label>${escapeHTML(label)}<textarea name="value" rows="4" ${required ? 'required' : ''}>${escapeHTML(defaultValue)}</textarea></label><p class="field-error" data-reason-error hidden>Укажите причину перехода.</p><div class="form-actions"><button type="submit" class="primary" data-confirm-reason>Подтвердить</button><button type="button" class="secondary" data-cancel-reason>Отмена</button></div></form>`;
  return new Promise((resolve) => {
		let closing = false;
		let result = null;
		const finish = (value) => { if (closing) return; closing = true; result = value; dialog.close(); };
		const confirm = () => {
			const textarea = $('#reason-form textarea[name="value"]');
			const value = String(textarea?.value || '').trim();
			const error = $('[data-reason-error]', dialog);
			if (required && !value) { error.hidden = false; textarea?.focus(); return; }
			finish(value);
		};
    $$('[data-cancel-reason]', dialog).forEach((button) => button.addEventListener('click', () => finish(null)));
		$('[data-confirm-reason]', dialog).addEventListener('click', (event) => { event.preventDefault(); confirm(); });
		$('#reason-form').addEventListener('submit', (event) => { event.preventDefault(); confirm(); });
		dialog.addEventListener('close', () => resolve(result), { once: true });
    openModal(dialog);
  });
}

function askChoice({ title, label, choices }) {
	const dialog = $('#reason-dialog');
	$('#reason-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">Рабочий процесс</span><h2>${escapeHTML(title)}</h2></div><button type="button" class="close-button" data-cancel-choice aria-label="Закрыть">×</button></div><div class="choice-dialog"><p>${escapeHTML(label)}</p><div>${choices.map((choice) => `<button type="button" class="choice-row" data-choice="${escapeHTML(choice.value)}"><span>${escapeHTML(choice.label)}</span>${icon('chevronRight')}</button>`).join('')}</div><button type="button" class="secondary" data-cancel-choice>Отмена</button></div>`;
	return new Promise((resolve) => {
		let closing = false;
		let result = null;
		const finish = (value) => { if (closing) return; closing = true; result = value; dialog.close(); };
		$$('[data-choice]', dialog).forEach((button) => button.addEventListener('click', () => finish(button.dataset.choice)));
		$$('[data-cancel-choice]', dialog).forEach((button) => button.addEventListener('click', () => finish(null)));
		dialog.addEventListener('close', () => resolve(result), { once: true });
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

async function loadRecordWorkflow(recordID) {
  try {
    const workflow = await api(`/api/records/${recordID}/workflow`);
    if (!state.activeDetail || state.activeDetail.record.id !== recordID) return;
    state.activeDetail = { ...state.activeDetail, workflow, workflowLoaded: true };
    state.detailCache.set(recordID, state.activeDetail);
    renderRecordDialog();
  } catch (error) {
    const loading = $(`[data-record-pane="${state.activeRecordTab}"] .relations-loading`);
    if (loading) loading.innerHTML = `${icon('help')}<strong>Рабочие данные не загрузились</strong><small>${escapeHTML(error.message)}</small><button type="button" class="secondary" data-retry-workflow>Повторить</button>`;
    $('[data-retry-workflow]')?.addEventListener('click', () => loadRecordWorkflow(recordID));
  }
}

async function refreshActiveRecordWorkflow(recordID) {
  state.detailCache.delete(recordID);
  const [detail, workflow] = await Promise.all([fetchRecordDetail(recordID, true), api(`/api/records/${recordID}/workflow`), syncProjectChanges()]);
  if (!state.activeDetail || state.activeDetail.record.id !== recordID) return;
  state.activeDetail = { ...detail, workflow, workflowLoaded: true };
  state.detailCache.set(recordID, state.activeDetail);
  renderRecordDialog();
}

async function mutateWorkflow(path, options, successMessage = 'Сохранено') {
  try {
    const recordID = state.activeDetail.record.id;
    await api(path, options);
    await refreshActiveRecordWorkflow(recordID);
    toast(successMessage);
    return true;
  } catch (error) {
    toast(error.message, true);
    return false;
  }
}

function openQuestionOutputDialog(sourceRecord, question, kind, defaultTitle, preset = {}) {
  const labels = { preference: 'Критерий выбора', limitation: 'Ограничение', rule: 'Правило', insight: 'Вывод', task: 'Задача', idea: 'Идея', research: 'Исследование', goal: 'Цель' };
  const planned = ['task', 'goal', 'research'].includes(kind);
  const draftScope = `question-output:${sourceRecord.id}:${question.id}:${kind}`;
  $('#create-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${icon('link')} Результат совместного вывода</span><h2>${labels[kind]}</h2><p>Источник сохранится автоматически: группа вопросов → вопрос → совместный итог → новая карточка.</p></div><button type="button" class="close-button icon-button" data-close-create aria-label="Закрыть">${icon('x')}</button></div><form id="question-output-form" class="card-form dialog-form"><div class="source-context"><span>Вопрос</span><strong>${escapeHTML(question.body)}</strong>${markdownView(question.decision.content, '', 'Исходный совместный итог')}</div><label>Название<input name="title" required maxlength="240" value="${escapeHTML(preset.title || defaultTitle)}"></label>${markdownEditor('description', 'Как применять', preset.description || question.decision.content, 6, 'Область действия и следующий шаг', 'question-output')}${planned ? `<div class="form-grid two"><label>Ответственный<select name="ownerId">${userOptions(state.me.id)}</select></label><label>Срок<input name="dueAt" type="datetime-local"></label></div>` : `<input type="hidden" name="ownerId" value="${state.me.id}">`}<div class="form-actions"><button type="submit" class="primary">${icon('plus')} Создать и связать</button><button type="button" class="secondary" data-close-create>Отмена</button></div></form>`;
  $$('[data-close-create]').forEach((button) => button.addEventListener('click', () => requestDialogClose($('#create-dialog'))));
  $('#question-output-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const due = form.get('dueAt');
    try {
      const output = await api(`/api/records/${sourceRecord.id}/questions/${question.id}/outputs`, { method: 'POST', body: JSON.stringify({ kind, title: form.get('title'), description: form.get('description'), ownerId: Number(form.get('ownerId')), dueAt: due ? new Date(due).toISOString() : '' }) });
      clearWorkingDraft(draftScope);
      closeDialogImmediately($('#create-dialog'));
      state.detailCache.delete(sourceRecord.id);
      await syncProjectChanges();
      toast('Результат создан и связан');
      await openRecord(output.id, { workspace: true });
    } catch (error) { toast(error.message, true); }
  });
  bindMarkdownEditors($('#create-dialog'));
  bindWorkingDraft($('#question-output-form'), draftScope);
  preventImplicitWorkspaceSubmit($('#question-output-form'));
  openModal($('#create-dialog'));
}

async function mutateDetail(path, options) {
  try {
    const recordID = state.activeDetail.record.id;
    await api(path, options);
    state.detailCache.delete(recordID);
    const [detail] = await Promise.all([fetchRecordDetail(recordID, true), syncProjectChanges()]);
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
    const [detail] = await Promise.all([close ? Promise.resolve(null) : fetchRecordDetail(recordID, true), syncProjectChanges()]);
    if (close) closeDialogImmediately($('#record-dialog'));
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
    <button type="button" data-create-type="inbox">${icon('inbox')}<span><strong>Входящее</strong><small>Сохранить мысль, не выбирая тип</small></span></button>
    <button type="button" data-create-type="idea">${icon('lightbulb')}<span><strong>Быстрая идея</strong><small>Сохранить мысль без оценки</small></span></button>
    <button type="button" data-create-type="task">${icon('checkSquare')}<span><strong>Задача</strong><small>Себе или партнёру</small></span></button>
    <button type="button" data-create-type="meeting">${icon('calendar')}<span><strong>Встреча</strong><small>Повестка, заметки и результаты</small></span></button>
    <button type="button" data-create-type="question_set">${icon('messages')}<span><strong>Карточка вопросов</strong><small>Несколько вопросов, личные ответы и итоги</small></span></button>
    <button type="button" data-create-type="research" data-create-mode="comparison">${icon('flask')}<span><strong>Сравнение вариантов</strong><small>Общие параметры, плюсы, минусы и оценка</small></span></button>
    <button type="button" data-create-type="risk">${icon('shield')}<span><strong>Риск</strong><small>Вероятность, влияние и мера снижения</small></span></button>
    <button type="button" data-create-type="hypothesis">${icon('hypothesis')}<span><strong>Гипотеза</strong><small>Предположение и критерий проверки</small></span></button>
    <button type="button" data-create-type="experiment">${icon('testTube')}<span><strong>Эксперимент</strong><small>Метод, метрика и порог успеха</small></span></button>
    <button type="button" data-create-type="decision">${icon('scale')}<span><strong>Решение</strong><small>Выбор, основания и ответственный</small></span></button>
    <button type="button" data-create-type="goal">${icon('target')}<span><strong>Цель</strong><small>Результат, срок и прогресс</small></span></button>
    <button type="button" data-create-type="document">${icon('fileText')}<span><strong>Документ</strong><small>Материал или рабочая заметка</small></span></button>`;
  menu.hidden = !menu.hidden;
  $$('[data-create-type]', menu).forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation(); menu.hidden = true; openCreateDialog(button.dataset.createType, { comparisonMode: button.dataset.createMode === 'comparison' });
  }));
}

function renderBusinessDetailsFields(recordType, details = {}, recordID = '') {
  const ratingOptions = (selected) => [0, 1, 2, 3, 4, 5].map((value) => `<option value="${value}" ${Number(selected || 0) === value ? 'selected' : ''}>${value ? `${value} из 5` : 'Не оценено'}</option>`).join('');
  const verdictOptions = [['pending', 'Ожидает проверки'], ['confirmed', 'Подтверждено'], ['rejected', 'Опровергнуто'], ['inconclusive', 'Недостаточно данных']];
  if (recordType === 'risk') return `<section class="business-fields risk-fields"><header><span>${icon('shield')}</span><div><h3>Оценка риска</h3><p>Оценка помогает сравнивать риски, а не заменяет обоснование.</p></div></header><div class="form-grid two"><label>Вероятность<select name="businessProbability">${ratingOptions(details.probability)}</select></label><label>Влияние<select name="businessImpact">${ratingOptions(details.impact)}</select></label></div>${markdownEditor('businessMitigation', 'Как снизить риск', details.mitigation || '', 4, 'Конкретная мера, владелец или сигнал для реакции', 'risk-mitigation')}<div class="form-grid two"><label>Проверить актуальность<input name="businessReviewAt" type="datetime-local" value="${toLocalInput(details.reviewAt)}"></label><label class="check"><input name="businessOccurred" type="checkbox" ${details.occurred ? 'checked' : ''}> Риск уже наступил</label></div></section>`;
  if (recordType === 'hypothesis' || recordType === 'experiment') return `<section class="business-fields experiment-fields"><header><span>${icon(recordType === 'experiment' ? 'testTube' : 'hypothesis')}</span><div><h3>${recordType === 'experiment' ? 'Протокол эксперимента' : 'Проверка гипотезы'}</h3><p>Результат должен быть проверяемым: метрика, порог успеха и итог.</p></div></header><div class="form-grid two"><label>Метрика<input name="businessMetric" value="${escapeHTML(details.metric || '')}" placeholder="Например: 10 заявок за неделю"></label><label>Порог успеха<input name="businessThreshold" value="${escapeHTML(details.successThreshold || '')}" placeholder="Как поймём, что гипотеза верна"></label></div>${markdownEditor('businessMethod', recordType === 'experiment' ? 'Метод и ход проверки' : 'Как будем проверять', details.experimentMethod || '', 4, 'Выборка, шаги и источник данных', `${recordType}-method`)}<label>Итог проверки<select name="businessVerdict">${verdictOptions.map(([value, label]) => `<option value="${value}" ${(details.verdict || 'pending') === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label></section>`;
  if (recordType === 'decision') {
    const decisions = state.records.filter((record) => record.type === 'decision' && record.id !== recordID && record.status !== 'archived');
    return `<section class="business-fields decision-fields"><header><span>${icon('scale')}</span><div><h3>Жизненный цикл решения</h3><p>Решение остаётся в истории, даже когда требует пересмотра или заменено новым.</p></div></header><div class="form-grid two"><label>Актуальность<select name="businessDecisionState"><option value="active" ${(details.decisionState || 'active') === 'active' ? 'selected' : ''}>Действует</option><option value="review" ${details.decisionState === 'review' ? 'selected' : ''}>Требует пересмотра</option><option value="superseded" ${details.decisionState === 'superseded' ? 'selected' : ''}>Заменено</option></select></label><label>Заменяет решение<select name="businessSupersedesId"><option value="">Не заменяет другое</option>${decisions.map((record) => `<option value="${record.id}" ${details.supersedesId === record.id ? 'selected' : ''}>${escapeHTML(record.title)}</option>`).join('')}</select></label></div><div class="form-grid two"><label>Действует с<input name="businessEffectiveAt" type="datetime-local" value="${toLocalInput(details.effectiveAt)}"></label><label>Пересмотреть не позднее<input name="businessReviewAt" type="datetime-local" value="${toLocalInput(details.reviewAt)}"></label></div><label>Где применяется<input name="businessApplicability" value="${escapeHTML(details.applicability || '')}" placeholder="Например: контрольные решения по своему направлению"></label>${markdownEditor('businessSourceExcerpt', 'Основание или исходная формулировка', details.sourceExcerpt || '', 3, 'Фрагмент договорённости, встречи или совместного итога', 'decision-source')}</section>`;
  }
	if (recordType === 'criterion') return `<section class="business-fields knowledge-fields"><header><span>${icon('target')}</span><div><h3>Применение и происхождение</h3><p>Зафиксируйте, где использовать критерий и когда проверить его актуальность.</p></div></header><div class="form-grid two"><label>Где применяется<input name="businessApplicability" value="${escapeHTML(details.applicability || '')}" placeholder="Например: первичный отбор бизнес-идей"></label><label>Проверить актуальность<input name="businessReviewAt" type="datetime-local" value="${toLocalInput(details.reviewAt)}"></label></div>${markdownEditor('businessSourceExcerpt', 'Исходная формулировка', details.sourceExcerpt || '', 3, 'Фрагмент совместного итога, встречи или исследования', 'criterion-source')}</section>`;
  return '';
}

function businessDetailsFromForm(form, recordType) {
  const value = (name) => form.elements[name]?.value || '';
  if (recordType === 'risk') return { probability: Number(value('businessProbability')), impact: Number(value('businessImpact')), mitigation: value('businessMitigation').trim(), occurred: Boolean(form.elements.businessOccurred?.checked), reviewAt: value('businessReviewAt') ? new Date(value('businessReviewAt')).toISOString() : '' };
  if (recordType === 'hypothesis' || recordType === 'experiment') return { metric: value('businessMetric').trim(), successThreshold: value('businessThreshold').trim(), experimentMethod: value('businessMethod').trim(), verdict: value('businessVerdict') || 'pending' };
  if (recordType === 'decision') return { decisionState: value('businessDecisionState') || 'active', supersedesId: value('businessSupersedesId'), effectiveAt: value('businessEffectiveAt') ? new Date(value('businessEffectiveAt')).toISOString() : '', reviewAt: value('businessReviewAt') ? new Date(value('businessReviewAt')).toISOString() : '', applicability: value('businessApplicability').trim(), sourceExcerpt: value('businessSourceExcerpt').trim() };
	if (recordType === 'criterion') return { applicability: value('businessApplicability').trim(), sourceExcerpt: value('businessSourceExcerpt').trim(), reviewAt: value('businessReviewAt') ? new Date(value('businessReviewAt')).toISOString() : '' };
  return null;
}

function openCreateDialog(initialType = 'idea', preset = {}) {
  const initialMeta = typeMeta[initialType];
  const sourceRecord = preset.sourceRecordId ? state.records.find((record) => record.id === preset.sourceRecordId) : null;
  const defaultWorkstream = preset.workstream || sourceRecord?.workstream || 'business';
  const defaultParentID = preset.parentId ?? sourceRecord?.id ?? '';
  const defaultEditPolicy = preset.editPolicy || 'shared';
  const kindLabels = { preference: 'Критерий выбора', limitation: 'Ограничение', rule: 'Правило', insight: 'Вывод' };
  const displayName = preset.comparisonMode ? 'Сравнение вариантов' : kindLabels[preset.kind] || initialMeta.singular;
  const titleLabel = preset.comparisonMode ? 'Что сравниваем' : initialType === 'question_set' ? 'Название группы вопросов' : initialType === 'meeting' ? 'Тема встречи' : initialType === 'inbox' ? 'Что нужно не потерять' : 'Название';
  const descriptionLabel = preset.comparisonMode ? 'Зачем сравниваем и какой вывод нужен' : preset.kind === 'limitation' ? 'Как применять ограничение' : preset.kind === 'rule' ? 'Формулировка и область действия' : initialType === 'question_set' ? 'Зачем обсуждаем' : initialType === 'meeting' ? 'Повестка и заметки' : initialType === 'task' ? 'Ожидаемый результат' : initialType === 'risk' ? 'Что может произойти и почему это важно' : initialType === 'hypothesis' ? 'Проверяемое предположение' : initialType === 'experiment' ? 'Что именно хотим проверить' : initialType === 'decision' ? 'Что решили и на каких основаниях' : 'Краткое описание';
  const draftScope = `create:${initialType}:${preset.kind || 'default'}:${preset.comparisonMode ? 'comparison' : 'record'}:${preset.sourceRecordId || 'root'}`;
  const parentOptions = state.records.filter((record) => record.status !== 'archived').map((record) => `<option value="${record.id}" ${defaultParentID === record.id ? 'selected' : ''}>${escapeHTML(typeMeta[record.type]?.singular || 'Карточка')}: ${escapeHTML(record.title)}</option>`).join('');
  const planned = ['task', 'goal', 'research', 'question_set', 'meeting', 'disagreement', 'risk', 'hypothesis', 'experiment'].includes(initialType);
  $('#create-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${icon(initialMeta.icon)} Новая запись</span><h2>${escapeHTML(displayName)}</h2></div><button type="button" class="close-button icon-button" data-close-create aria-label="Закрыть">${icon('x')}</button></div><form id="create-record-form" class="card-form dialog-form"><label>${titleLabel}<input name="title" required maxlength="240" autofocus value="${escapeHTML(preset.title || '')}" placeholder="${preset.comparisonMode ? 'Например: Выбор сервера' : initialType === 'question_set' ? 'Например: Договорённости основателей' : initialType === 'inbox' ? 'Короткая мысль или наблюдение' : ''}"></label>${markdownEditor('description', descriptionLabel, preset.description || '', initialType === 'inbox' ? 4 : 7, 'Факты, контекст и ожидаемый результат', 'create-record')}<input type="hidden" name="type" value="${initialType}"><input type="hidden" name="kind" value="${escapeHTML(preset.kind || '')}">${renderBusinessDetailsFields(initialType)}${planned ? `<div class="form-grid two"><label>${initialType === 'question_set' ? 'Координатор' : initialType === 'meeting' ? 'Организатор' : 'Ответственный'}<select name="ownerId">${userOptions(state.me.id)}</select></label><label>${initialType === 'meeting' ? 'Дата и время' : 'Срок'}<input name="dueAt" type="datetime-local"></label></div><div class="form-grid two"><label>Приоритет<select name="priority">${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${value === (preset.priority || 'normal') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Оценка времени, минут<input name="estimateMinutes" type="number" min="0" value="${Number(preset.estimateMinutes || 0)}"></label></div>` : `<input type="hidden" name="ownerId" value="${state.me.id}"><input type="hidden" name="priority" value="${escapeHTML(preset.priority || 'normal')}"><input type="hidden" name="estimateMinutes" value="${Number(preset.estimateMinutes || 0)}">`}<details class="form-more create-organization" ${sourceRecord ? 'open' : ''}><summary>Место в проекте и доступ</summary><div class="form-more-body"><div class="form-grid three"><label>Направление<select name="workstream">${Object.entries(workstreamLabels).map(([value, label]) => `<option value="${value}" ${defaultWorkstream === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Доступ к изменениям<select name="editPolicy">${Object.entries(editPolicyLabels).map(([value, label]) => `<option value="${value}" ${defaultEditPolicy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Родитель<select name="parentId"><option value="">Без родителя</option>${parentOptions}</select></label></div><label class="root-toggle"><input name="isRoot" type="checkbox" ${preset.isRoot ? 'checked' : ''}> <span><strong>Новый корень</strong><small>Начать самостоятельную крупную ветку вместо продолжения текущей цепочки.</small></span></label></div></details><div class="ai-suggestion"><span class="ai-suggestion-icon">${icon('sparkles')}</span><span><strong>AI-структура</strong><small id="ai-suggestion-status">После названия система предложит приоритет, оценку времени, направление и место в иерархии.</small></span><button type="button" class="secondary" data-ai-suggest>Предложить</button></div><div class="form-actions"><button type="submit" class="primary">${icon('plus')} Создать</button><button type="button" class="secondary" data-close-create>Отмена</button></div></form>`;
  $$('[data-close-create]').forEach((button) => button.addEventListener('click', () => requestDialogClose($('#create-dialog'))));
  const createForm = $('#create-record-form');
	if (initialType === 'inbox') createForm.querySelector('.ai-suggestion')?.remove();
	bindMarkdownEditors($('#create-dialog'));
  bindWorkingDraft(createForm, draftScope);
  preventImplicitWorkspaceSubmit(createForm);
  if (initialType !== 'inbox') bindCreateSuggestion(createForm, initialType);
  $('#create-record-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const due = form.get('dueAt');
    if (initialType === 'decision' && !String(form.get('description') || '').trim()) {
      event.currentTarget.elements.description?.focus();
      return toast('Зафиксируйте содержание и основание решения', true);
    }
    try {
      const record = await api('/api/records', { method: 'POST', body: JSON.stringify({ type: form.get('type'), kind: form.get('kind'), title: form.get('title'), description: form.get('description'), ownerId: Number(form.get('ownerId')), dueAt: due ? new Date(due).toISOString() : '', priority: form.get('priority') || 'normal', workstream: form.get('workstream') || 'business', editPolicy: form.get('editPolicy') || 'shared', parentId: form.get('parentId') || '', isRoot: event.currentTarget.elements.isRoot.checked, estimateMinutes: Number(form.get('estimateMinutes')), businessDetails: businessDetailsFromForm(event.currentTarget, initialType) }) });
      let linkError = '';
      if (preset.sourceRecordId) {
        try {
          await api(`/api/records/${preset.sourceRecordId}/links`, { method: 'POST', body: JSON.stringify({ targetId: record.id, relationType: preset.relationType || 'leads_to', reason: preset.reason || 'Карточка создана из связанного рабочего контекста' }) });
          state.detailCache.delete(preset.sourceRecordId);
        } catch (error) {
          linkError = `Карточка создана, но связь не добавлена: ${error.message}`;
        }
      }
      clearWorkingDraft(draftScope);
      closeDialogImmediately($('#create-dialog')); await syncProjectChanges(); toast(linkError || 'Карточка создана', Boolean(linkError)); await openRecord(record.id, { workspace: Boolean(preset.sourceRecordId), edit: true, tab: preset.comparisonMode ? 'content' : undefined });
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
      const source = suggestion.source === 'gemini' ? 'Gemini' : suggestion.source === 'groq' ? 'Groq' : 'локальная модель';
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
  return ({ created: 'создал карточку', profile_updated: 'изменил профиль', capacity_updated: 'изменил доступное время', updated: 'изменил карточку', triaged: 'разобрал входящее', business_details_updated: 'обновил контрольные поля', change_undone: 'отменил ошибочное изменение', reordered: 'изменил порядок блоков', converted_to_questions: 'преобразовал в карточку вопросов', archived: 'перенёс в архив', section_updated: 'обновил раздел', link_created: 'создал связь', link_removed: 'убрал связь', criterion_scored: 'оценил по критерию', proof_added: 'добавил доказательство', completed: 'завершил задачу', partners_notified: 'уведомил партнёра', questions_added: 'добавил вопросы', question_answered: 'ответил на вопрос', question_decided: 'зафиксировал совместное решение', question_archived: 'архивировал вопрос', output_created: 'превратил вывод в рабочую карточку', created_from_question: 'создал карточку из совместного вывода', research_option_created: 'добавил вариант исследования', research_option_updated: 'обновил вариант исследования', research_option_archived: 'архивировал вариант исследования', research_field_created: 'добавил поле сравнения', research_field_archived: 'архивировал поле сравнения', comment_added: 'добавил комментарий', checklist_added: 'добавил шаг', checklist_updated: 'обновил шаг', review_submitted: 'отправил результат на проверку', review_accepted: 'принял результат', review_rework: 'вернул задачу на доработку', attachment_added: 'приложил файл', recurrence_created: 'создал следующее повторение', recurrence_updated: 'изменил повторение' }[action] || action);
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
  if (['description', 'summaryMd', 'prosMd', 'consMd', 'notesMd', 'progressNote', 'result'].includes(field)) return markdownPlain(value || '', 'не указано');
  return formatActivityValue(value, truncate);
}

function activityChanges(item, full = false) {
  const fieldLabels = { username: 'Логин', type: 'Тип карточки', title: 'Название', description: 'Описание', status: 'Статус', ownerId: 'Ответственный', decisionMakerId: 'Принимает решение', dueAt: 'Срок', priority: 'Приоритет', workstream: 'Направление', editPolicy: 'Доступ', parentId: 'Родитель', isRoot: 'Иерархия', estimateMinutes: 'Оценка времени', actualMinutes: 'Фактическое время', progress: 'Прогресс', progressNote: 'Ход работы', result: 'Результат', summaryMd: 'Краткий вывод', prosMd: 'Плюсы', consMd: 'Минусы', notesMd: 'Заметки', rating: 'Оценка' };
  const changes = Object.entries(item.details || {}).filter(([field, value]) => value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'before') && Object.prototype.hasOwnProperty.call(value, 'after') && activityDisplayValue(field, value.before, false) !== activityDisplayValue(field, value.after, false));
  if (!changes.length && Object.prototype.hasOwnProperty.call(item.details || {}, 'before') && Object.prototype.hasOwnProperty.call(item.details || {}, 'after')) {
    changes.push([item.details?.section || 'Содержание', { before: item.details.before, after: item.details.after }]);
  }
  if (!changes.length) return '';
  return changes.map(([field, value]) => `<span class="change-line"><b>${escapeHTML(fieldLabels[field] || field)}:</b> <del>${escapeHTML(activityDisplayValue(field, value.before, !full))}</del><i>→</i><ins>${escapeHTML(activityDisplayValue(field, value.after, !full))}</ins></span>`).join('');
}

function activityDetails(item) {
  const details = item.details || {};
  const rows = [];
  const record = state.records.find((candidate) => candidate.id === item.entityId);
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
  if (item.action.startsWith('research_option_') && (details.title || details.optionTitle)) rows.push(['Вариант', details.title?.after || details.title || details.optionTitle]);
  if (item.action.startsWith('research_field_') && details.name) rows.push(['Поле сравнения', details.name]);
  if (item.action === 'research_option_created' && details.rating !== undefined) rows.push(['Оценка', `${details.rating} из 10`]);
	if (item.action === 'checklist_added' && details.title) rows.push(['Новый шаг', details.title]);
	if (item.action === 'attachment_added' && details.name) rows.push(['Файл', `${details.name} · ${formatFileSize(details.sizeBytes)}`]);
	if (item.action === 'review_submitted') rows.push(['Приёмка', 'Результат передан проверяющему']);
	if (item.action === 'review_accepted') rows.push(['Приёмка', 'Результат подтверждён']);
	if (item.action === 'review_rework') rows.push(['Приёмка', 'Нужна доработка']);
	if (item.action === 'recurrence_created' && details.dueAt) rows.push(['Следующий срок', formatDate(details.dueAt, true)]);
  if (item.action === 'created' && record) {
    rows.push(['Тип', typeMeta[record.type]?.singular || 'Карточка']);
    rows.push(['Ответственный', record.ownerUsername]);
    rows.push(['Текущее состояние', statusLabel(record)]);
  }
  if (item.action === 'question_answered') rows.push(['Результат', 'Личная позиция сохранена в исходной карточке вопроса']);
  if (item.action === 'question_decided') rows.push(['Результат', 'Совместный итог сохранён и доступен для создания следующей сущности']);
  if (item.action === 'capacity_updated') rows.push(['Доступно в неделю', minutesLabel(Number(details.weeklyMinutes || 0))]);
  if (!rows.length) rows.push(['Событие', activityContext(item)]);
  return `<dl class="event-details">${rows.map(([label, value]) => `<div><dt>${escapeHTML(label)}</dt><dd>${escapeHTML(String(value))}</dd></div>`).join('')}</dl>`;
}

function activityContext(item) {
  const details = item.details || {};
  if (item.action === 'capacity_updated') return `${minutesLabel(Number(details.weeklyMinutes || 0))} доступно в неделю`;
  if (item.action === 'questions_added' && details.count) return questionsCountLabel(Number(details.count));
  if (item.action === 'question_answered') return 'Личная позиция сохранена';
  if (item.action === 'question_decided') return 'Совместный итог зафиксирован';
  if (item.action === 'link_created') {
    const target = state.records.find((record) => record.id === details.targetId);
    return target ? `Связь с «${target.title}»` : 'Новая связь между карточками';
  }
  if (item.action === 'proof_added') return 'Добавлено подтверждение результата';
	if (item.action === 'comment_added') return 'Новый контекст в обсуждении';
	if (item.action === 'checklist_added') return details.title || 'Добавлен проверяемый шаг';
	if (item.action === 'checklist_updated') return 'Обновлён ход выполнения шага';
	if (item.action === 'review_submitted') return 'Результат ждёт решения постановщика';
	if (item.action === 'review_accepted') return 'Задача принята и завершена';
	if (item.action === 'review_rework') return item.reason ? `Доработать: ${item.reason}` : 'Задача возвращена исполнителю';
	if (item.action === 'attachment_added') return details.name || 'Приложен файл';
	if (item.action === 'recurrence_created') return 'Создана новая связанная задача';
  if (item.action.startsWith('research_option_')) return details.title?.after || details.title || details.optionTitle || 'Изменён вариант сравнения';
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
    const capacityHours = profile.weeklyCapacityMinutes ? Number((profile.weeklyCapacityMinutes / 60).toFixed(1)) : 0;
    const capacityTone = !profile.weeklyCapacityMinutes ? 'unset' : profile.utilizationPercent > 100 ? 'overload' : profile.utilizationPercent >= 80 ? 'tight' : 'normal';
    $('#profile-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">Участник проекта</span><h2>${escapeHTML(profile.user.username)}</h2><p>На платформе с ${formatDate(profile.user.createdAt)}</p></div><button type="button" class="close-button icon-button" data-close-profile aria-label="Закрыть">${icon('x')}</button></div><div class="profile-body"><section class="profile-summary"><span class="avatar profile-avatar">${escapeHTML(profile.user.username.slice(0, 2).toUpperCase())}</span><div><h3>${escapeHTML(profile.user.username)}</h3><p>${profile.user.id === state.me.id ? 'Ваш профиль активности' : 'Активность сооснователя'}</p></div>${profile.user.id === state.me.id ? `<button type="button" class="secondary" data-edit-profile>${icon('edit')} Изменить логин</button>` : ''}</section>${profile.user.id === state.me.id ? `<section class="ai-provider-status checking" id="ai-provider-status">${icon('sparkles')}<div><strong>Проверяем AI</strong><p>Локальный анализ доступен всегда.</p></div></section>` : ''}<div class="profile-metrics"><article><span>Активное время · 30 дней</span><strong>${durationLabel(profile.activeSeconds30Days)}</strong><small>Только взаимодействие с интерфейсом</small></article><article><span>Действия · 30 дней</span><strong>${profile.actions30Days}</strong><small>${interactionsCountLabel(profile.interactions30Days)} с UI</small></article><article><span>Завершено</span><strong>${profile.completedRecords}</strong><small>карточек с результатом</small></article><article><span>Факт к оценке</span><strong>${accuracy ? `${accuracy}%` : 'Нет данных'}</strong><small>${minutesLabel(profile.actualMinutes)} факт · ${minutesLabel(profile.estimateMinutes)} план</small></article></div><section class="estimate-insight ${insight.tone}">${icon('clock')}<div><strong>${escapeHTML(insight.title)}</strong><p>${escapeHTML(insight.text)}</p></div></section><section class="weekly-capacity capacity-${capacityTone}"><header><div><span>Рабочая неделя</span><h3>${profile.weeklyCapacityMinutes ? `${profile.utilizationPercent}% запланировано` : 'Ёмкость пока не задана'}</h3><p>${minutesLabel(profile.scheduledMinutes)} со сроком на этой неделе${profile.unscheduledMinutes ? ` · ${minutesLabel(profile.unscheduledMinutes)} без недельного слота` : ''}</p></div><strong>${profile.weeklyCapacityMinutes ? minutesLabel(profile.weeklyCapacityMinutes) : '—'}</strong></header><progress max="100" value="${Math.min(100, profile.utilizationPercent || 0)}"></progress>${profile.user.id === state.me.id ? `<form id="capacity-form"><label>Доступно в неделю, часов<input name="hours" type="number" min="0" max="168" step="0.5" value="${capacityHours}"></label><button type="submit" class="secondary">Сохранить ёмкость</button></form>` : '<small>Ёмкость задаёт сам участник в своём профиле.</small>'}</section><section class="activity-chart"><header><h3>Активность по дням</h3><span>Последние 30 дней</span></header><div>${profile.activity.length ? profile.activity.slice().reverse().map((day) => `<span title="${escapeHTML(day.date)} · ${durationLabel(day.activeSeconds)} · ${interactionsCountLabel(day.interactions)}"><i data-level="${Math.max(1, Math.ceil(day.activeSeconds * 5 / maxSeconds))}"></i><small>${day.date.slice(8)}</small></span>`).join('') : `<p>Активность начнёт накапливаться после взаимодействия с новой версией.</p>`}</div></section><section class="profile-actions"><header><h3>Последние действия</h3><span>${profile.recentActions.length}</span></header><div class="activity-list">${profile.recentActions.map(renderActivityItem).join('') || emptyState('Действий пока нет.')}</div></section></div>`;
    $$('[data-close-profile]').forEach((button) => button.addEventListener('click', () => requestDialogClose(dialog)));
    $('[data-edit-profile]')?.addEventListener('click', async () => {
      const username = await askText({ title: 'Изменить логин', label: 'Новый логин', defaultValue: state.me.username, required: true });
      if (!username || username === state.me.username) return;
      try {
        state.me = await api('/api/me', { method: 'PATCH', body: JSON.stringify({ username }) });
        $('#user-name').textContent = state.me.username; $('#user-avatar').textContent = state.me.username.slice(0, 2).toUpperCase();
        await loadData(true); await openProfile(state.me.id); toast('Логин изменён');
      } catch (error) { toast(error.message, true); }
    });
    $('#capacity-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const hours = Number(new FormData(event.currentTarget).get('hours') || 0);
      try {
        state.teamCapacity = await api(`/api/users/${profile.user.id}/capacity`, { method: 'PUT', body: JSON.stringify({ weeklyMinutes: Math.round(hours * 60) }) });
        await openProfile(profile.user.id);
        toast('Недельная ёмкость сохранена');
      } catch (error) { toast(error.message, true); }
    });
    const recentActions = new Map(profile.recentActions.map((item) => [item.id, item]));
    $$('[data-open-event]', dialog).forEach((button) => button.addEventListener('click', () => openActivity(button.dataset.openEvent, recentActions.get(button.dataset.openEvent))));
		if (profile.user.id === state.me.id) api('/api/ai/health').then((health) => {
			const node = $('#ai-provider-status', dialog); if (!node) return;
			const externalProvider = health.provider === 'gemini' ? 'Gemini' : health.provider === 'groq' ? 'Groq' : 'Внешняя модель';
			const provider = health.providerAvailable ? externalProvider : 'Локальный анализ активен';
			const model = health.model ? ` · ${health.model}` : '';
			const message = health.providerAvailable
				? health.message
				: health.configured ? `${externalProvider}${model} недоступен. ${health.message || 'Используются локальные правила.'}` : (health.message || 'Внешняя модель не настроена; используются локальные правила.');
			node.className = `ai-provider-status ${health.providerAvailable ? 'available' : 'fallback'}`;
			node.innerHTML = `${icon('sparkles')}<div><strong>${escapeHTML(`${provider}${health.providerAvailable ? model : ''}`)}</strong><p>${escapeHTML(message)}</p></div>`;
		}).catch(() => {});
  } catch (error) {
    $('#profile-dialog-content').innerHTML = `<div class="record-load-error">${icon('help')}<h2>Профиль не загрузился</h2><p>${escapeHTML(error.message)}</p><button type="button" class="secondary" data-close-profile>Закрыть</button></div>`;
    $('[data-close-profile]').addEventListener('click', () => requestDialogClose(dialog));
  }
}

function openActivity(id, suppliedItem = null) {
  const item = suppliedItem || state.activity.find((activity) => activity.id === id);
  if (!item) return toast('Событие не найдено', true);
  state.activeActivity = item;
  const record = state.records.find((candidate) => candidate.id === item.entityId);
  const undoable = activityIsSafelyUndoable(item);
  $('#event-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${formatDate(item.createdAt, true)} · ${escapeHTML(item.actorUsername)}</span><h2>${escapeHTML(activityActionLabel(item))}</h2><p>${escapeHTML(recordTitleByActivity(item))}</p></div><button type="button" class="close-button icon-button" data-close-event aria-label="Закрыть">${icon('x')}</button></div><div class="event-body">${item.reason ? `<section class="event-reason-block"><span>Почему</span><p>${escapeHTML(item.reason)}</p></section>` : ''}${activityChanges(item, true) ? `<section class="event-section"><h3>Что изменилось</h3><div class="event-change-list">${activityChanges(item, true)}</div></section>` : ''}${activityDetails(item) ? `<section class="event-section"><h3>Содержание события</h3>${activityDetails(item)}</section>` : ''}${undoable ? `<aside class="undo-note">${icon('undo')}<span><strong>Ошибочное действие?</strong><small>Отмена сработает, только если карточка или связь после этого не менялась.</small></span></aside>` : ''}<div class="form-actions">${record ? `<button type="button" class="primary" data-event-record="${record.id}">Открыть карточку</button>` : ''}${undoable ? `<button type="button" class="secondary" data-undo-activity="${item.id}">${icon('undo')} Отменить действие</button>` : ''}<button type="button" class="secondary" data-close-event>Закрыть</button></div></div>`;
  $$('[data-close-event]', $('#event-dialog')).forEach((button) => button.addEventListener('click', () => requestDialogClose($('#event-dialog'))));
  $('[data-event-record]')?.addEventListener('click', async (event) => { closeDialogImmediately($('#event-dialog')); await openRecord(event.currentTarget.dataset.eventRecord); });
  $('[data-undo-activity]')?.addEventListener('click', async (event) => {
    const confirmed = await askChoice({ title: 'Отменить действие?', label: 'Изменение вернётся к предыдущему значению, а сама отмена останется в истории.', choices: [{ value: 'undo', label: 'Да, отменить действие' }] });
    if (confirmed !== 'undo') return;
    try {
      await api(`/api/activity/${event.currentTarget.dataset.undoActivity}/undo`, { method: 'POST', body: '{}' });
      closeDialogImmediately($('#event-dialog')); await syncProjectChanges(); render(); toast('Действие отменено, запись сохранена в истории');
    } catch (error) { toast(error.message, true); }
  });
  openModal($('#event-dialog'));
}

function activityIsSafelyUndoable(item) {
  if (item.actorId !== state.me.id) return false;
  if (['link_created', 'link_removed'].includes(item.action)) return true;
  if (item.action !== 'updated') return false;
  const changes = Object.entries(item.details || {});
  if (!changes.length) return false;
  const allowed = new Set(['status', 'parentId', 'isRoot', 'priority']);
  return changes.every(([field, change]) => {
    if (!allowed.has(field) || !change || typeof change !== 'object' || !Object.prototype.hasOwnProperty.call(change, 'after')) return false;
    return field !== 'status' || !['completed', 'archived'].includes(change.after);
  });
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
  const configurableTypes = Object.entries(typeMeta).filter(([key]) => !['question_set', 'meeting', 'risk', 'hypothesis', 'experiment', 'inbox'].includes(key));
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
  $('#main-content').innerHTML = `<div class="list-toolbar"><div><p class="eyebrow">Личный кабинет</p><h3>Уведомления</h3></div><button type="button" class="secondary" id="read-all" ${state.notifications.some((item) => !item.readAt) ? '' : 'disabled'}>Прочитать все</button></div><section class="section-panel"><div class="notification-list">${state.notifications.map((item) => `<button type="button" class="notification ${item.readAt ? '' : 'unread'}" data-notification-id="${item.id}" data-entity-id="${escapeHTML(item.entityId || '')}"><i></i><span><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.body)}</p><small>${formatDate(item.createdAt, true)}</small></span></button>`).join('') || emptyState('Уведомлений пока нет.')}</div></section>`;
  $('#read-all').addEventListener('click', async () => { await api('/api/notifications/read-all', { method: 'POST' }); await syncProjectChanges({ renderCurrent: true }); });
  $$('[data-notification-id]').forEach((button) => button.addEventListener('click', async () => { await api(`/api/notifications/${button.dataset.notificationId}/read`, { method: 'POST' }); if (button.dataset.entityId) await openRecord(button.dataset.entityId); await syncProjectChanges(); }));
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
  if ($('#onboarding-dialog').open) closeDialogImmediately($('#onboarding-dialog'));
}

bootstrap();
