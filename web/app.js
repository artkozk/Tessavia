import { createChatGroupUI } from './chat-groups.js?v=20260907-chat-list-search-2';
import { filterConversations, conversationTimeLabel, pendingConversationItems, chatDraftKey, chooseConversation, readConversationDraft, writeConversationDraft, mergeChatHistory, createChatWorkspaceUI } from './chat-workspace.js?v=20260907-chat-list-search-2';
import { createPersonalCalendarUI } from './personal-calendar.js?v=20260907-chat-list-search-2';
import { createPersonalReviewUI } from './personal-review.js?v=20260904-personal-review-3';
import { createPersonalWaitingUI } from './personal-waiting.js?v=20260907-chat-list-search-2';
import { createHabitReminderUI } from './habit-reminders.js?v=20260904-habit-reminders-1';
import { createPersonalRemindersUI } from './personal-reminders.js?v=20260907-chat-list-search-2';
import { createReminderSettingsUI } from './reminder-settings.js?v=20260904-reminder-digests-1';
import { personalRoute } from './personal-navigation.js?v=20260907-chat-list-search-2';
import { createPersonalTodayUI, useProgressiveToday } from './personal-today.js?v=20260907-chat-list-search-2';
import { createFirstUseUI } from './first-use.js?v=20260904-first-use-4';
import { createPersonalInboxUI } from './personal-inbox.js?v=20260904-first-use-4';
import { createPersonalPublishUI } from './personal-publish.js?v=20260904-personal-batch-3';
import { createLifeMapUI } from './life-map.js?v=20260904-personal-batch-3';
import { createEmojiPickerUI, createEmojiPreferences, emojiKey, insertEmojiAtSelection } from './emoji-picker.js?v=20260904-chat-emoji-3';
import { createNoteMediaUI } from './note-media.js?v=20260904-note-media-3';
import { createNoteLibraryUI, parseNoteTags } from './note-library.js?v=20260904-note-media-3';
import { createHabitUI } from './habit-tracker.js?v=20260904-personal-waiting-4';
import { createReadingUI } from './reading.js?v=20260906-reading-groups-1';
import { createBulkWorkUI } from './bulk-work.js?v=20260904-bulk-actions-3';
import { createOutboxUI } from './outbox-ui.js?v=20260907-chat-list-search-2';
let offlineOutbox;
import { createGraphLayoutStore } from './graph-layout-state.js?v=20260903-graph-layouts-1';

﻿const typeMeta = {
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
  folder: '<path d="M3 6a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"/>',
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
  chevronLeft: '<path d="m15 18-6-6 6-6"/>',
  arrowLeft: '<path d="m12 19-7-7 7-7M5 12h14"/>',
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
	pin: '<path d="m16 3 5 5-3 1-4 4 1 4-2 2-3-5-7 7 7-7-5-3 2-2 4 1 4-4z"/>',
	bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1Z"/>',
	reply: '<path d="m9 17-6-5 6-5v3h4a7 7 0 0 1 7 7v1a9 9 0 0 0-7-5H9Z"/>',
	smile: '<circle cx="12" cy="12" r="9"/><path d="M8 14s1.5 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/>',
	video: '<path d="M15 10 21 7v10l-6-3Z"/><rect width="13" height="14" x="2" y="5" rx="2"/>',
	camera: '<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3z"/><circle cx="12" cy="13" r="3"/>',
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
	redo: '<path d="m15 14 5-5-5-5"/><path d="M20 9h-9a7 7 0 0 0-7 7v4"/>',
	arrowUp: '<path d="m6 10 6-6 6 6M12 4v16"/>',
	arrowDown: '<path d="m6 14 6 6 6-6M12 20V4"/>',
	eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
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
  if (record?.type === 'risk' && record.status === 'completed') return record.businessDetails?.occurred ? 'Последствия устранены' : 'Предотвращён';
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
  ['reading', 'Чтение Библии', 'bookOpen', 'Домашка'],
  ['personal', 'Личное', 'lock', 'Личное'],
  ['dashboard', 'Обзор', 'dashboard', 'Работа'], ['work', 'Работа', 'checkSquare', 'Работа'],
  ['calendar', 'Календарь', 'calendar', 'Работа'],
	['collections', 'Доски', 'network', 'Работа'],
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
  projectNavigation: { enabledViews: ['dashboard', 'work', 'calendar', 'collections', 'chat'] }, workspacePages: [], pageSearch: '',
  calendarScope: 'project', calendarDisplay: 'month', calendarMonth: '', calendarDay: '', calendarCollection: '', calendarOwner: '', calendarStatus: 'active', calendarColorBy: 'stage',
  notificationInbox: null, notificationStatus: 'unread', notificationPeriod: 'all', unreadCount: null,
  notificationRequest: 0, notificationLoading: false, notificationError: '', layoutDraft: null,
  me: null, users: [], records: [], notifications: [], activity: [], definitions: [], pendingQuestions: [],
	workspaces: [], activeWorkspaceId: localStorage.getItem('bizflow-active-workspace') || '', collections: [], activeCollectionId: '', collectionSearch: '', collectionOwnerFilter: '', collectionFieldFilters: {}, personal: null, personalLoading: false, personalTab: 'today', personalSuggestionTimer: null,
	interfacePreferences: { hiddenNavGroups: [], collapsedNavGroups: [], dashboardWidgets: ['focus', 'capture', 'capacity', 'quality'] }, teamDetail: null,
	interfaceProfiles: {},
	registrationChallenge: null, pendingInviteToken: new URLSearchParams(location.search).get('invite') || '', pendingInterfacePresetId: new URLSearchParams(location.search).get('interface-preset') || '', interfacePresetScope: 'mine', interfacePresetRequest: 0,
  view: 'dashboard', search: '', statusFilter: '', ownerFilter: '', authMode: 'login', activeDetail: null,
  activeRecordTab: 'overview', activeActivity: null, historyMode: 'feed', activeRecordRequest: 0,
  workScope: 'all', workType: 'all', workStatus: 'active', workstreamFilter: 'all',
  workOrder: 'priority', workViewMode: 'list', ideaViewMode: 'board', workCalendarMonth: '', calendarMode: 'cycle', calendarYear: new Date().getFullYear(), planningCycles: [], activePlanningCycle: null, workSearchTimer: null, historyScope: 'project', historyActor: 'all', historyType: 'all',
  recordSearchTimer: null,
  graphResizeTimer: null,
  historyLoadedAll: false,
  graphLayoutContext: null, graphLayoutInstances: new WeakMap(), graphRenderRequest: 0, graphPendingBranch: null, graphDataRequest: null, graphDataKey: '',
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

// A notebook is one editing surface. Named fields remain only for API/draft compatibility.
function notebookContent(title, body) {
  return '<div data-notebook-title>' + (escapeHTML(title || '') || '<br>') + '</div>' +
    (String(body || '').trim() ? renderMarkdown(body, '') : '<p><br></p>');
}

function syncNotebook(editor) {
  const rich = editor.querySelector('.markdown-rich-editor');
  if (!rich.firstChild) rich.innerHTML = notebookContent('', '');
  if (rich.firstChild.nodeType === Node.TEXT_NODE) {
    const block = document.createElement('div');
    rich.insertBefore(block, rich.firstChild);
    while (block.nextSibling?.nodeType === Node.TEXT_NODE) block.append(block.nextSibling);
  }
  const title = rich.firstElementChild;
  rich.querySelectorAll('[data-notebook-title]').forEach(node => node.removeAttribute('data-notebook-title'));
  title.setAttribute('data-notebook-title', '');
  const titleText = title.textContent.replace(/\u00a0/g, ' ').trim();
  editor.querySelector('[name="title"]').value = titleText;
  title.classList.toggle('is-empty', !titleText);
  if (!title.nextSibling) rich.insertAdjacentHTML('beforeend', '<p><br></p>');
  const body = rich.cloneNode(true);
  body.firstElementChild.remove();
  const source = editor.querySelector('.markdown-source');
  source.value = richTextToMarkdown(body);
  const firstBody = title.nextElementSibling;
  firstBody?.classList.toggle('notebook-body-empty', !source.value.trim());
  return source.value;
}

function focusNotebook(editor, body = false) {
  const rich = editor.querySelector('.markdown-rich-editor');
  rich.focus({ preventScroll: true });
  const target = body ? rich.firstElementChild.nextSibling : rich.firstElementChild;
  const range = document.createRange();
  range.selectNodeContents(target || rich);
  range.collapse(true);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
}

function notebookEnter(editor, event) {
  if (event.isComposing || event.keyCode === 229 || event.ctrlKey || event.metaKey) return false;
  if (!(event.type === 'keydown' ? event.key === 'Enter' : ['insertParagraph', 'insertLineBreak'].includes(event.inputType))) return false;
  const rich = editor.querySelector('.markdown-rich-editor');
  const title = rich.firstElementChild;
  const selection = window.getSelection();
  if (!selection?.rangeCount) return false;
  const range = selection.getRangeAt(0);
  if (!title.contains(range.startContainer) || !title.contains(range.endContainer)) return false;
  event.preventDefault();
  event.stopPropagation();
  range.deleteContents();
  const suffix = document.createRange();
  suffix.selectNodeContents(title);
  suffix.setStart(range.startContainer, range.startOffset);
  const fragment = suffix.extractContents();
  if (fragment.textContent) {
    const paragraph = document.createElement('p');
    paragraph.append(fragment);
    title.after(paragraph);
  }
  if (!title.textContent) title.innerHTML = '<br>';
  syncNotebook(editor);
  focusNotebook(editor, true);
  rich.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertParagraph' }));
  return true;
}

function markdownEditor(name, label, value, rows = 6, placeholder = '', suffix = '', options = {}) {
  const id = `markdown-${String(name).replace(/[^a-z0-9_-]/gi, '-')}-${suffix || 'main'}`;
  const content = options.notebookTitle !== undefined ? notebookContent(options.notebookTitle, value) : String(value || '').trim() ? renderMarkdown(value, '') : '';
  const editorClass = options.compact ? ' compact-toolbar' : '';
  const historyActions = options.history ? `<button type="button" data-md-history="undo" title="Отменить (Ctrl+Z)" aria-label="Отменить">${icon('undo')}</button><button type="button" data-md-history="redo" title="Повторить (Ctrl+Y)" aria-label="Повторить">${icon('redo')}</button>` : '';
  const aiAction = options.ai === false ? '' : `<button type="button" data-ai-draft-editor title="Предложить черновик AI" aria-label="Предложить черновик AI">${icon('sparkles')}</button>`;
  const expandAction = options.expand === false ? '' : `<button type="button" data-open-notebook title="Развернуть редактор" aria-label="Развернуть редактор">${icon('maximize')}</button>`;
  return `<div class="markdown-editor${editorClass}" ${options.notebookTitle !== undefined ? 'data-notebook' : ''}>${options.notebookTitle !== undefined ? `<input type="hidden" name="title" value="${escapeHTML(options.notebookTitle)}">` : ''}<label for="${escapeHTML(id)}">${escapeHTML(label)}</label><div class="markdown-toolbar" role="toolbar" aria-label="Форматирование текста">${historyActions}<button type="button" data-md="bold" title="Полужирный (Ctrl+B)" aria-label="Полужирный"><b>B</b></button><button type="button" data-md="italic" title="Курсив (Ctrl+I)" aria-label="Курсив"><i>I</i></button><button type="button" data-md="heading2" title="Заголовок второго уровня (Ctrl+Alt+2)" aria-label="Заголовок второго уровня">H2</button><button type="button" data-md="list" title="Маркированный список (Ctrl+Shift+8)" aria-label="Маркированный список">${icon('menu')}</button><button type="button" data-md="ordered" title="Нумерованный список (Ctrl+Shift+7)" aria-label="Нумерованный список">1.</button><button type="button" data-md="quote" title="Цитата (Ctrl+Shift+.)" aria-label="Цитата">❯</button><button type="button" data-md="code" title="Блок кода (Ctrl+&#96;)" aria-label="Блок кода">&lt;/&gt;</button><button type="button" data-md="note" title="Примечание" aria-label="Примечание">i</button><button type="button" data-md="link" title="Ссылка (Ctrl+K)" aria-label="Ссылка">${icon('link')}</button><span class="markdown-toolbar-spacer"></span>${aiAction}${expandAction}</div><div id="${escapeHTML(id)}" class="markdown-rich-editor markdown-body" contenteditable="true" role="textbox" aria-multiline="true" data-placeholder="${escapeHTML(placeholder)}" style="--editor-rows:${Math.max(3, Number(rows) || 6)}">${content}</div><textarea class="markdown-source" name="${escapeHTML(name)}" hidden tabindex="-1" aria-hidden="true">${escapeHTML(value || '')}</textarea></div>`;
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
  content.innerHTML = `<div class="notebook-shell"><header><div><p class="eyebrow">Расширенный редактор</p><h2>${escapeHTML(title)}</h2></div><button type="button" class="icon-button" data-close-notebook aria-label="Закрыть">${icon('x')}</button></header><div class="notebook-body editor-only">${markdownEditor('notebookValue', 'Содержание', value, 22, 'Фиксируйте структуру, аргументы и выводы', 'fullscreen')}</div><footer><div><button type="button" class="secondary" data-close-notebook>Закрыть</button><button type="button" class="primary" data-save-notebook>${icon('check')} Применить</button></div></footer></div>`;
  dialog.dataset.notebookDirty = 'false';
  $$('[data-close-notebook]', dialog).forEach((button) => button.addEventListener('click', () => requestDialogClose(dialog)));
  bindMarkdownEditors(dialog);
  const textarea = $('textarea[name="notebookValue"]', dialog);
  const richEditor = $('.markdown-rich-editor', dialog);
  const initialValue = textarea.value;
  textarea.addEventListener('input', () => { dialog.dataset.notebookDirty = String(textarea.value !== initialValue); onSave?.(textarea.value); });
  const save = () => { onSave?.(textarea.value); dialog.dataset.notebookDirty = 'false'; closeDialogImmediately(dialog); };
  $('[data-save-notebook]', dialog).addEventListener('click', save);
  richEditor.addEventListener('keydown', (event) => { if ((event.ctrlKey || event.metaKey) && event.code === 'Enter') { event.preventDefault(); save(); } });
  openModal(dialog);
}

function richTextToMarkdown(root) {
  const children = (node) => [...node.childNodes].reduce((result, child) => {
    // Browsers can leave plain text before the block created by Enter.
    const block = child.nodeType === Node.ELEMENT_NODE && /^(p|div|h[1-6]|blockquote|pre|ul|ol)$/.test(child.tagName.toLowerCase());
    const separator = block && result && !result.endsWith('\n') ? '\n\n' : '';
    return result + separator + serialize(child);
  }, '');
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
  rich.innerHTML = editor.hasAttribute('data-notebook') ? notebookContent(editor.querySelector('[name="title"]').value, source.value) : source.value.trim() ? renderMarkdown(source.value, '') : '';
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
    if (editor.hasAttribute('data-notebook')) syncNotebook(editor);
    let restoringHistory = false;
    let historyIndex = 0;
    let editorHistory = [{ html: richEditor.innerHTML, source: textarea.value }];
    let lastHistoryAt = 0;
    let lastHistoryInputType = '';
    const updateHistoryControls = () => {
      const undo = $('[data-md-history="undo"]', editor);
      const redo = $('[data-md-history="redo"]', editor);
      if (undo) undo.disabled = historyIndex <= 0;
      if (redo) redo.disabled = historyIndex >= editorHistory.length - 1;
    };
    const sync = (event) => {
      textarea.value = editor.hasAttribute('data-notebook') ? syncNotebook(editor) : richTextToMarkdown(richEditor);
      if (!restoringHistory) {
        const current = editorHistory[historyIndex];
        if (!current || current.html !== richEditor.innerHTML || current.source !== textarea.value) {
          const now = Date.now();
          const inputType = event?.inputType || 'input';
          const typingAction = inputType === 'input' || inputType === 'insertText' || inputType.startsWith('deleteContent');
          const sameTypingGroup = typingAction && (lastHistoryInputType === inputType || lastHistoryInputType === 'input' || inputType === 'input');
          const coalesce = sameTypingGroup && now - lastHistoryAt < 2500 && historyIndex === editorHistory.length - 1 && historyIndex > 0;
          if (coalesce) editorHistory[historyIndex] = { html: richEditor.innerHTML, source: textarea.value };
          else {
            editorHistory = editorHistory.slice(0, historyIndex + 1);
            editorHistory.push({ html: richEditor.innerHTML, source: textarea.value });
            if (editorHistory.length > 120) editorHistory.shift();
            historyIndex = editorHistory.length - 1;
          }
          lastHistoryAt = now;
          lastHistoryInputType = inputType;
        }
      }
      updateHistoryControls();
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
      if (editor.hasAttribute('data-notebook')) syncNotebook(editor);
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
      restoringHistory = false;
      lastHistoryAt = 0;
      lastHistoryInputType = '';
      updateHistoryControls();
      richEditor.focus();
    };
    $$('[data-md]', editor).forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => applyRichTextAction(richEditor, button.dataset.md));
    });
    $$('[data-md-history]', editor).forEach((button) => {
      button.addEventListener('mousedown', (event) => event.preventDefault());
      button.addEventListener('click', () => restoreHistory(button.dataset.mdHistory === 'redo' ? 1 : -1));
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
      if (editor.hasAttribute('data-notebook') && notebookEnter(editor, event)) return;
      if (event.inputType !== 'historyUndo' && event.inputType !== 'historyRedo') return;
      event.preventDefault();
      restoreHistory(event.inputType === 'historyRedo' ? 1 : -1);
    });
    richEditor.addEventListener('keydown', (event) => {
      if (editor.hasAttribute('data-notebook') && notebookEnter(editor, event)) return;
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
    updateHistoryControls();
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
      const menu = control.querySelector('.custom-select-menu');
      if (menu?.matches(':popover-open')) menu.hidePopover();
      control.classList.remove('open');
      control.classList.remove('drop-up');
      control.querySelector('.custom-select-trigger')?.setAttribute('aria-expanded', 'false');
    }
  });
}

function positionCustomSelectMenu(control) {
  const trigger = $('.custom-select-trigger', control);
  const menu = $('.custom-select-menu', control);
  if (!trigger || !menu) return;
  if (!menu.matches(':popover-open')) menu.showPopover();
  const viewport = window.visualViewport;
  const viewportTop = viewport?.offsetTop || 0;
  const viewportHeight = viewport?.height || window.innerHeight;
  const viewportWidth = viewport?.width || window.innerWidth;
  if (window.matchMedia('(max-width: 820px)').matches) {
    Object.assign(menu.style, { left: '12px', right: 'auto', top: 'auto', bottom: `${Math.max(12, window.innerHeight - viewportTop - viewportHeight + 12)}px`, width: `${viewportWidth - 24}px`, maxHeight: `${Math.min(360, viewportHeight * .55)}px` });
    return;
  }
  const triggerRect = trigger.getBoundingClientRect();
  const topBoundary = viewportTop + 12;
  const bottomBoundary = viewportTop + viewportHeight - 12;
  const availableAbove = triggerRect.top - topBoundary;
  const availableBelow = bottomBoundary - triggerRect.bottom;
  const above = availableBelow < 260 && availableAbove > availableBelow;
  const height = Math.max(44, Math.min(260, (above ? availableAbove : availableBelow) - 6));
  Object.assign(menu.style, { left: `${Math.max(12, Math.min(triggerRect.left, viewportWidth - Math.max(180, triggerRect.width) - 12))}px`, right: 'auto', bottom: 'auto', width: `${Math.min(viewportWidth - 24, Math.max(180, triggerRect.width))}px`, maxHeight: `${height}px`, top: `${above ? triggerRect.top - Math.min(menu.scrollHeight, height) - 6 : triggerRect.bottom + 6}px` });
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
  if (!('showPopover' in HTMLElement.prototype)) return;
  if (select.dataset.enhanced === 'true' || select.multiple || select.closest('.custom-select')) return;
  select.dataset.enhanced = 'true';
  const control = document.createElement('div');
  control.className = 'custom-select';
  select.parentNode.insertBefore(control, select);
  control.appendChild(select);
  select.classList.add('custom-select-native');
  select.setAttribute('aria-hidden', 'true');
  select.tabIndex = -1;
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'custom-select-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  trigger.innerHTML = `<span></span>${icon('chevronRight')}`;
  const menu = document.createElement('div');
  menu.className = 'custom-select-menu';
  menu.setAttribute('popover', 'manual');
  menu.id = `select-menu-${crypto.randomUUID()}`;
  trigger.setAttribute('aria-controls', menu.id);
  trigger.setAttribute('aria-label', select.getAttribute('aria-label') || select.closest('label')?.childNodes[0]?.textContent.trim() || 'Выберите');
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
      if (menu.matches(':popover-open')) menu.hidePopover();
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
    } else if (event.key === 'Tab') {
      closeCustomSelects();
      trigger.focus();
    }
  });
  select.addEventListener('change', () => syncCustomSelect(select));
  control.closest('dialog')?.addEventListener('close', () => { if (menu.matches(':popover-open')) menu.hidePopover(); });
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
  state.recordDraftFailures ||= new Set();
  try { localStorage.setItem(recordDraftKey(recordId), JSON.stringify({ values, savedAt: new Date().toISOString() })); state.recordDraftFailures.delete(recordId); }
  catch (_) { state.recordDraftFailures.add(recordId); }
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
    if (field.type === 'radio') { if (field.checked) values[field.name] = String(field.value); else if (!(field.name in values)) values[field.name] = ''; }
    else if (field.type === 'checkbox') {
      const group = $$(`[name="${CSS.escape(field.name)}"]`, root);
      values[field.name] = group.length > 1 ? group.filter((item) => item.checked).map((item) => String(item.value || 'on')) : field.checked ? String(field.value || 'on') : '';
    }
    else if (field.multiple) values[field.name] = [...field.selectedOptions].map((option) => option.value);
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
  state.workingDraftPersistors.delete(root);
  if (root?.dataset) delete root.dataset.workingDraftScope;
  root?.classList.remove('has-unsaved-draft');
  $('.working-draft-note', root)?.remove();
}

function applyWorkingDraft(root, values = {}) {
  Object.entries(values).forEach(([name, value]) => {
    $$(`[name="${CSS.escape(name)}"]`, root).forEach((field) => {
    if (!field || field.type === 'file') return;
    if (field.type === 'checkbox' || field.type === 'radio') field.checked = Array.isArray(value) ? value.includes(String(field.value || 'on')) : String(field.value || 'on') === String(value);
    else if (field.multiple && Array.isArray(value)) [...field.options].forEach((option) => { option.selected = value.includes(option.value); });
    else field.value = String(value ?? '');
    field.dataset.userChanged = 'true';
    if (field.classList.contains('markdown-source')) setMarkdownEditorValue(field.closest('.markdown-editor'), field.value, false);
    if (field.tagName === 'SELECT') syncCustomSelect(field);
    });
  });
  $$('[data-notebook]', root).forEach(editor => setMarkdownEditorValue(editor, $('.markdown-source', editor).value, false));
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
      delete root.dataset.draftSaveFailed;
    } catch (_) { root.dataset.draftSaveFailed = 'true'; }
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
  if (record.status === 'completed') return { className: 'done', label: statusLabel(record) };
  if (['archived', 'cancelled', 'rejected'].includes(record.status)) return { className: 'done', label: statusLabel(record) };
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

const pendingAPIReads = new Map();

async function api(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase();
  if (method !== 'GET') pendingAPIReads.clear();
  const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
  const workspace = state.activeWorkspaceId;
  const userID = state.me?.id;
  const projectEpoch = state.projectContextEpoch || 0;
  const accountPath = path.split('?')[0];
  const accountScoped = accountPath === '/api/me' || accountPath.startsWith('/api/me/') || accountPath === '/api/workspaces' || accountPath === '/api/teams' || accountPath.startsWith('/api/teams/') || accountPath.startsWith('/api/personal/') || accountPath === '/api/invitations/accept' || accountPath === '/api/auth/logout';
  const requestedWorkspace = options.headers?.['X-Workspace-ID'] || state.activeWorkspaceId;
  const workspaceHeader = requestedWorkspace && !accountScoped ? { 'X-Workspace-ID': requestedWorkspace } : {};
  const headers = { ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}), ...workspaceHeader, ...(options.headers || {}) };
  const key = method === 'GET' && !options.signal ? JSON.stringify([userID, workspace, path, headers]) : null;
  if (key && pendingAPIReads.has(key)) return pendingAPIReads.get(key);
  const timeoutMs = options.timeoutMs ?? (method === 'GET' ? 6000 : isFormData ? 180000 : /\/ai[-/]/.test(path) ? 120000 : 20000);
  const run = async () => {
    for (let attempt = 0; ; attempt++) {
      const controller = new AbortController();
      let timedOut = false;
      const abort = () => controller.abort();
      options.signal?.addEventListener('abort', abort, { once: true });
      if (options.signal?.aborted) abort();
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
      try {
        const { timeoutMs: ignoredTimeout, ...fetchOptions } = options;
        const response = await fetch(path, { credentials: 'same-origin', ...fetchOptions, method, headers, signal: controller.signal });
        if (response.status === 204) { if (method !== 'GET') pendingAPIReads.clear(); return null; }
        const data = await response.json().catch(error => { if (controller.signal.aborted) throw error; return {}; });
        if (!response.ok) {
          if (response.status === 401 && !path.startsWith('/api/auth/') && userID === state.me?.id && projectEpoch === (state.projectContextEpoch || 0)) showAuth();
          const error = new Error(data.error || 'Ошибка запроса');
          error.status = response.status;
          error.code = data.code;
          if(data.code === 'workspace_unavailable' && requestedWorkspace === state.activeWorkspaceId && userID === state.me?.id && projectEpoch === (state.projectContextEpoch || 0) && !accountScoped) void recoverWorkspaceAccess();
          throw error;
        }
        if (workspace === state.activeWorkspaceId && userID === state.me?.id && response.headers.has('X-Unread-Count')) state.unreadCount = Number(response.headers.get('X-Unread-Count'));
        if (method !== 'GET') pendingAPIReads.clear();
        return data;
      } catch (error) {
        const transient = timedOut || error instanceof TypeError || [502, 503, 504].includes(error.status);
        // Reads may be retried once; a write can have succeeded even if its reply was lost.
        if (method === 'GET' && attempt === 0 && transient && !options.signal?.aborted) continue;
        if (timedOut) {
          const timeout = new Error(method === 'GET' ? 'Сервер долго отвечает. Повторите загрузку.' : 'Ответ сервера задержался. Результат операции пока не подтверждён — проверьте его перед повтором.');
          timeout.code = 'REQUEST_TIMEOUT';
          throw timeout;
        }
        if (error instanceof TypeError) {
          const connection = new Error(method === 'GET' ? 'Не удалось связаться с сервером. Проверьте подключение и повторите загрузку.' : 'Связь с сервером прервалась. Изменения могли сохраниться — проверьте результат перед повтором.');
          connection.code = 'NETWORK_UNAVAILABLE';
          throw connection;
        }
        throw error;
      } finally {
        clearTimeout(timer);
        options.signal?.removeEventListener('abort', abort);
      }
    }
  };
  const pending = run();
  if (key) pendingAPIReads.set(key, pending);
  try { return await pending; }
  finally { if (key && pendingAPIReads.get(key) === pending) pendingAPIReads.delete(key); }
}

function toast(message, error = false) {
  const node = $('#toast');
  node.textContent = message;
  node.className = `toast visible${error ? ' error' : ''}`;
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = 'toast'; }, 3200);
}

function toastAction(message, label, action) {
  const node = $('#toast');
  node.replaceChildren(document.createTextNode(message));
  const button = document.createElement('button');
  button.type = 'button'; button.textContent = label;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try { await action(); } catch (error) { toast(error.message, true); }
  }, { once: true });
  node.append(button);
  node.className = 'toast visible action-toast';
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => { node.className = 'toast'; }, 9000);
}

function showAuth() {
  clearPrivateClientState();
  $('#app-root').hidden = true;
  $('#auth-root').hidden = false;
}

function clearPrivateClientState() {
  if (typeof offlineOutbox !== 'undefined') void offlineOutbox?.signOut();
  state.offlineMode = false;
  state.loadDataAbort?.abort();
  state.loadDataRequest = (state.loadDataRequest || 0) + 1;
  clearProjectClientState();
  state.me = null; state.teams = [];
  state.workspacePages = []; state.pageSearch = ''; state.projectNavigation = { enabledViews: ['dashboard', 'work', 'collections', 'chat'] };
  state.notificationInbox = null; state.unreadCount = null; state.notificationRequest += 1;
  state.notificationLoading = false; state.layoutDraft = null; state.pageLayoutDraft = null;
  state.viewHistoryInitialized = false;
  state.personal = null;
  state.personalLoading = false;
  state.workspaces = [];
	state.collections = [];
	state.interfacePreferences = { hiddenNavGroups: [], collapsedNavGroups: [], dashboardWidgets: ['focus', 'capture', 'capacity', 'quality'] };
	state.interfaceProfiles = {};
	state.teamDetail = null;
	state.activeCollectionId = '';
  state.personalTab = 'today';
  ['personal-dialog', 'profile-dialog'].forEach((id) => {
    const dialog = document.getElementById(id);
    if (dialog?.open) closeDialogImmediately(dialog);
  });
}

function showApp() {
  state.offlineMode = false;
  void offlineOutbox?.signIn(state.me);
  $('#auth-root').hidden = true;
  $('#app-root').hidden = false;
  $('#user-name').textContent = state.me.username;
	renderAvatarContent($('#user-avatar'), state.me);
  setSidebarOpen(false);
}

function initializeOfflineOutbox() {
offlineOutbox = createOutboxUI({
  user: () => state.me, workspace: () => state.activeWorkspaceId,
  openDialog: openModal, closeDialog: requestDialogClose, newPersonal: openPersonalEditor, newCapture:openPersonalCapture,
  escapeHTML, toast, toastAction, onAuthRequired: showAuth,
  onOfflineIdentity: account => { state.me = account; state.offlineMode = true; },
  onConfirmed: (item,result) => {
    if (item.owner !== state.me?.id || state.offlineMode) return;
    if (item.kind === 'habit-checkin') habitUI.confirmed(item.habit,item.date);
    if (item.kind === 'note-attachment') noteMediaUI.confirmed(item,result);
    if (['capture','note-to-plan'].includes(item.kind)) personalInboxUI.confirmed(item,result);
    if (['note','plan','habit-checkin','note-attachment','capture','note-to-plan'].includes(item.kind)) void loadPersonal({ force: true });
    else if (item.workspace === state.activeWorkspaceId && item.thread === state.activeChatThreadId) {
      if (!state.chatSearch && !state.chatFavoritesOnly && !state.chatHistoryAround && state.chatLoadedThreadId === item.thread) {
        state.chatMessages = mergeChatHistory(state.chatMessages,[result]);
        if (state.view === 'chat') renderChat();
      }
      void loadChatThread(item.thread,true);
    }
  },
});
}

async function bootstrap() {
  initializeOfflineOutbox();
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
    if (mutations.some((mutation) => mutation.target === $('#main-content') || $('#main-content')?.contains(mutation.target))) applyPageLayout();
  });
  interfaceObserver.observe(document.body, { childList: true, subtree: true });
  try {
    if (!navigator.onLine && await offlineOutbox.offline()) return;
    state.me = await api('/api/me');
    showApp();
    await loadData();
		maybeShowOnboarding();
		if (!maybeOpenPendingInvitation()) maybeOpenPendingInterfacePreset();
  } catch (error) {
    if(state.me) renderProjectLoadError(error); else if (![401,403].includes(error.status) && await offlineOutbox.offline()) return; else showAuth();
  }
}

function clearProjectClientState({ closeWindows = true } = {}) {
  state.projectContextEpoch = (state.projectContextEpoch || 0) + 1;
  state.projectDataReady = false;
  if(closeWindows) $$('dialog[open]').forEach(dialog=>{
    flushDialogDrafts(dialog);
    dialog.dataset.historyState='false';
    closeDialogImmediately(dialog);
  });
  state.activeRecordRequest += 1;
  state.notificationRequest += 1;
  state.records=[];state.users=[];state.notifications=[];state.activity=[];state.pendingQuestions=[];
  state.definitions=[];state.collections=[];state.workspacePages=[];state.savedViews=[];
  state.chatThreads=[];state.chatMessages=[];state.activeChatThreadId='';state.chatLoadedThreadId='';
  state.recordWorkspace=[];state.activeWorkspaceRecordId='';state.activeDetail=null;state.activeActivity=null;
  state.detailCache.clear();state.detailRequests.clear();state.researchComparisons.clear();state.researchComparisonRequests.clear();
  state.aiAnalyses.clear();state.aiQuestionDrafts.clear();
  state.graphInstance?.destroy();state.graphInstance=null;state.graphData=null;
  state.graphLayoutContext=null;state.graphRenderRequest++;state.graphDataRequest=null;state.graphDataKey='';
  state.graphFocusRecordId='';state.graphBranchRootId='';state.graphSelectedId='';state.graphLinkSourceId='';state.graphPendingBranch=null;
  state.notificationInbox=null;state.unreadCount=null;state.notificationLoading=false;
  state.qualityReport=null;state.teamCapacity=null;state.planningCycles=[];state.activePlanningCycle=null;
  state.activeCollectionId='';state.collectionSearch='';state.collectionOwnerFilter='';state.collectionFieldFilters={};
  state.calendarCollection='';state.calendarOwner='';state.calendarStatus='active';
  state.syncRecordsSince='1970-01-01T00:00:00Z';state.syncActivitySince='1970-01-01T00:00:00Z';state.syncAppliedCheckpoint='';
  closeGlobalSearch({clear:true});
}

function captureProjectContext() {
  return { user: state.me?.id, workspace: state.activeWorkspaceId, epoch: state.projectContextEpoch || 0 };
}

function isProjectContextCurrent(context) {
  return context.user === state.me?.id && context.workspace === state.activeWorkspaceId && context.epoch === (state.projectContextEpoch || 0);
}

function captureRecordView(recordID) {
  return { ...captureProjectContext(), recordID, request: state.activeRecordRequest, version: state.activeDetail?.record.updatedAt };
}

function isRecordViewCurrent(context) {
  return isProjectContextCurrent(context) && context.request === state.activeRecordRequest && state.activeDetail?.record.id === context.recordID && state.activeDetail.record.updatedAt === context.version && $('#record-dialog').open;
}

function renderProjectLoadError(error) {
  $('#main-content').innerHTML='<section class="project-load-error"><h2>Не удалось загрузить пространство</h2><p>'+escapeHTML(error.message)+'</p><button type="button" class="primary" data-retry-project>Повторить</button><button type="button" class="secondary" data-open-teams>Команды</button></section>';
  $('[data-retry-project]').addEventListener('click',()=>loadData().catch(renderProjectLoadError));
  $('[data-open-teams]').addEventListener('click',openTeamsDirectory);
}

async function recoverWorkspaceAccess() {
  if(state.workspaceRecovery)return state.workspaceRecovery;
  clearProjectClientState();
  state.layoutDraft=null;state.pageLayoutDraft=null;state.view='personal';
  $('#main-content').innerHTML='<div class="workspace-dialog-loading"><span class="spinner"></span><strong>Обновляем доступ</strong></div>';
  state.workspaceRecovery=loadData().then(()=>toast('Доступ к проекту изменился. Личное пространство остаётся доступным.')).catch(renderProjectLoadError).finally(()=>{state.workspaceRecovery=null;});
  return state.workspaceRecovery;
}

async function readProjectPages(path, { workspace = state.activeWorkspaceId, signal, onProgress } = {}) {
  const records = new Map(), activity = new Map(), cursors = new Set();
  let cursor = '', checkpoint = '';
  do {
    if (signal?.aborted) throw new Error('Загрузка отменена');
    const query = new URLSearchParams({ pageSize: '200' });
    if (cursor) query.set('cursor', cursor);
    const page = await api(`${path}${path.includes('?') ? '&' : '?'}${query}`, { signal, headers: { 'X-Workspace-ID': workspace } });
    if (signal?.aborted) throw new Error('Загрузка отменена');
    if (!Array.isArray(page.records) || !page.checkpoint || (checkpoint && checkpoint !== page.checkpoint)) throw new Error('Не удалось подтвердить полноту загрузки. Повторите запрос.');
    checkpoint = page.checkpoint;
    page.records.forEach(record => records.set(record.id, record));
    (page.activity || []).forEach(item => activity.set(item.id, item));
    onProgress?.(records.size);
    cursor = page.nextCursor || '';
    if (cursor && cursors.has(cursor)) throw new Error('Загрузка остановлена: сервер повторил страницу. Повторите запрос.');
    cursors.add(cursor);
  } while (cursor);
  return { records: [...records.values()], activity: [...activity.values()].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt) || a.id.localeCompare(b.id)), checkpoint };
}

function renderProjectLoading(controller) {
  state.projectDataReady = false;
  renderWorkspaceControl();
  renderNav();
  $('#main-content').innerHTML = '<section class="workspace-dialog-loading" aria-live="polite"><span class="spinner"></span><strong id="project-load-progress">Загружаем проект</strong><button type="button" class="secondary" data-cancel-project-load>Отменить загрузку</button></section>';
  $('[data-cancel-project-load]').addEventListener('click', () => controller.abort(), { once: true });
}

async function loadData(silent = false) {
  state.loadDataAbort?.abort();
  const controller = state.loadDataAbort = new AbortController();
  const request=state.loadDataRequest=(state.loadDataRequest||0)+1, userID=state.me?.id;
  const current = () => request === state.loadDataRequest && state.me?.id === userID;
  if (!silent && !state.records.length) renderProjectLoading(controller);
  try {
  const [workspaces,teams]=await Promise.all([api('/api/workspaces', {signal:controller.signal}),api('/api/teams', {signal:controller.signal})]);
  if(request!==state.loadDataRequest||state.me?.id!==userID)return;
  const previous=state.activeWorkspaceId;
  if(!workspaces.some(workspace=>workspace.id===previous)){
    state.activeWorkspaceId=previous ? workspaces.find(workspace=>workspace.kind==='personal')?.id || workspaces[0]?.id || '' : workspaces.find(workspace=>workspace.id==='bizflow-team')?.id || workspaces.find(workspace=>workspace.kind==='team')?.id || workspaces[0]?.id || '';
    if(previous){clearProjectClientState();state.layoutDraft=null;state.pageLayoutDraft=null;state.view='personal';state.calendarScope='personal';}
  }
  if (!state.viewHistoryInitialized && history.state?.businessControlAccount === state.me?.id) {
    const route = history.state.businessControlView;
    if (route?.workspaceId === state.activeWorkspaceId) {
      const resolved = personalRoute(route, workspaces);
      if (resolved.workspaceId) state.activeWorkspaceId = resolved.workspaceId;
    }
  }
  const workspace=state.activeWorkspaceId;
  if(!previous && workspaces.find(item=>item.id===workspace)?.kind==='personal'){state.view='personal';state.calendarScope='personal';}
  if(workspace)localStorage.setItem('bizflow-active-workspace',workspace);
  state.workspaces=workspaces;state.teams=teams;
  const projectAPI=path=>api(path,{signal:controller.signal,headers:{'X-Workspace-ID':workspace}});
  const [users,recordPage,notifications,activity,definitions,pendingQuestions,savedViews,chatThreads,planning,collections,desktopPreferences,mobilePreferences,projectNavigation,workspacePages]=await Promise.all([
    projectAPI('/api/users'),readProjectPages('/api/records?includeArchived=true', {workspace, signal:controller.signal, onProgress:count=>{ const progress=$('#project-load-progress'); if(current() && progress) progress.textContent=`Загружено карточек: ${count}`; }}),projectAPI('/api/notifications'),
    projectAPI('/api/activity?limit=200'),projectAPI('/api/section-definitions'),projectAPI('/api/questions/pending'),projectAPI('/api/saved-views'),projectAPI('/api/chat/threads'),projectAPI('/api/planning/cycles'),projectAPI('/api/collections'),projectAPI('/api/interface/preferences?device=desktop'),projectAPI('/api/interface/preferences?device=mobile'),
    projectAPI('/api/workspace/navigation'),projectAPI('/api/workspace/pages?includeArchived=true'),
  ]);
  if(request!==state.loadDataRequest||state.me?.id!==userID||workspace!==state.activeWorkspaceId)return;
  const records = recordPage.records.sort((a,b) => (a.dueAt ? 0 : 1) - (b.dueAt ? 0 : 1) || (a.dueAt || '').localeCompare(b.dueAt || '') || b.updatedAt.localeCompare(a.updatedAt) || a.id.localeCompare(b.id));
  state.projectDataReady = true;
  state.interfaceProfiles={desktop:desktopPreferences,mobile:mobilePreferences};
  const interfacePreferences=state.interfaceProfiles[interfaceDevice()];
  const projectActivity=activity.filter(item=>typeMeta[item.entityType]||['section_definition','planning_cycle','workspace_page','workspace'].includes(item.entityType));
  const recordsByID=new Map(records.map(record=>[record.id,record]));
  state.detailCache.forEach((detail,id)=>{const current=recordsByID.get(id);if(!current||current.updatedAt!==detail.record.updatedAt)state.detailCache.delete(id);});
  Object.assign(state,{users,records,notifications,activity:projectActivity,definitions,pendingQuestions,savedViews,chatThreads,workspaces,collections,interfacePreferences,projectNavigation,workspacePages,planningCycles:planning.cycles||[],activePlanningCycle:planning.active||null});
  if(!collections.some(collection=>collection.id===state.activeCollectionId))state.activeCollectionId=collections[0]?.id||'';
  state.syncRecordsSince=recordPage.checkpoint;
  state.syncAppliedCheckpoint=recordPage.checkpoint;
  state.syncActivitySince=latestTimestamp(projectActivity,'createdAt',state.syncActivitySince);
  state.qualityReport=null;state.teamCapacity=null;state.historyLoadedAll=activity.length<200;
  initializeViewHistory();
  if(previous&&previous!==workspace)rememberView();
  render();
  } catch (error) {
    if (!current()) return;
    if (controller.signal.aborted) throw new Error('Загрузка отменена. Можно повторить её или выбрать другое пространство.');
    throw error;
  } finally {
    if (current()) state.loadDataAbort = null;
  }
}

async function switchWorkspace(workspaceID, { restoring = false, keepView = false } = {}) {
  if(!workspaceID)return false;
  if(workspaceID===state.activeWorkspaceId)return true;
  for (const dialog of $$('dialog[open]')) if (!await confirmDialogTransition(dialog)) return false;
  if(!leavePageLayoutEditor())return false;
  if(state.layoutDraft&&!confirm('Выйти без сохранения раскладки?'))return false;
  state.layoutDraft=null;
  if(!restoring&&!keepView)rememberView();
  const previousView=state.view;
  clearProjectClientState();
  state.activeWorkspaceId=workspaceID;
  localStorage.setItem('bizflow-active-workspace',workspaceID);
  state.view=keepView?previousView:'dashboard';
  setSidebarOpen(false);
  $('#main-content').innerHTML='<div class="workspace-dialog-loading"><span class="spinner"></span><strong>Загружаем проект</strong></div>';
  try {await loadData();}
  catch(error){if(state.activeWorkspaceId!==workspaceID)return false;renderProjectLoadError(error);throw error;}
  if(state.activeWorkspaceId!==workspaceID)return false;
  if(!restoring&&!keepView)pushViewHistory();
  return state.activeWorkspaceId===workspaceID;
}

function latestTimestamp(items, field, fallback = '1970-01-01T00:00:00Z') {
  return items.reduce((latest, item) => {
    const value = item?.[field];
    return value && new Date(value).getTime() > new Date(latest).getTime() ? value : latest;
  }, fallback);
}

function compareSyncTimestamps(left, right) {
  const milliseconds = new Date(left).getTime() - new Date(right).getTime();
  const fraction = value => (String(value).match(/\.(\d+)(?:Z|[+-]\d{2}:\d{2})$/)?.[1] || '').padEnd(9, '0').slice(3, 9);
  return milliseconds || Number(fraction(left)) - Number(fraction(right));
}

async function syncProjectChanges({ renderCurrent = false, includeCompanions = true } = {}) {
  if (state.loadDataAbort) return { changed: false, activityChanged: false };
  const workspace = state.activeWorkspaceId;
  const userID = state.me?.id, generation = state.loadDataRequest;
  const current = checkpoint => workspace === state.activeWorkspaceId && userID === state.me?.id && generation === state.loadDataRequest &&
    (!state.syncAppliedCheckpoint || compareSyncTimestamps(checkpoint, state.syncAppliedCheckpoint) >= 0);
  const query = new URLSearchParams({ recordsSince: state.syncRecordsSince, activitySince: state.syncActivitySince });
  if (includeCompanions) refreshProjectCompanions(workspace).catch(() => {});
  const changes = await readProjectPages(`/api/sync?${query}`, {workspace});
  if (!current(changes.checkpoint)) return { changed: false, activityChanged: false };
  const projectActivity = changes.activity.filter(item => typeMeta[item.entityType] || ['section_definition', 'planning_cycle', 'workspace_page', 'workspace'].includes(item.entityType));
  let definitionsPatch = null;
  if (projectActivity.some(item => ['section_definition', 'workspace_page', 'workspace'].includes(item.entityType))) {
    const projectAPI = path => api(path, {headers: {'X-Workspace-ID': workspace}});
    const [definitions, projectNavigation, workspacePages] = await Promise.all([projectAPI('/api/section-definitions'), projectAPI('/api/workspace/navigation'), projectAPI('/api/workspace/pages?includeArchived=true')]);
    if (!current(changes.checkpoint)) return { changed: false, activityChanged: false };
    definitionsPatch = { definitions, projectNavigation, workspacePages };
  }
  const recordsByID = new Map(state.records.map(record => [record.id, record]));
  let changed = false;
  changes.records.forEach(record => {
    const previous = recordsByID.get(record.id);
    if (previous && compareSyncTimestamps(record.updatedAt, previous.updatedAt) < 0) return;
    if (!previous || previous.updatedAt !== record.updatedAt || JSON.stringify(previous.blockers || []) !== JSON.stringify(record.blockers || [])) changed = true;
    recordsByID.set(record.id, record);
    if (!previous || previous.updatedAt !== record.updatedAt) state.detailCache.delete(record.id);
  });
  state.records = [...recordsByID.values()];
  if (definitionsPatch) { Object.assign(state, definitionsPatch); state.detailCache.clear(); }
  const knownActivity = new Set(state.activity.map(item => item.id));
  const newActivity = projectActivity.filter(item => !knownActivity.has(item.id));
  if (newActivity.length) state.activity = [...newActivity.slice().reverse(), ...state.activity].slice(0, 500);
  state.syncRecordsSince = changes.checkpoint;
  state.syncActivitySince = changes.checkpoint;
  state.syncAppliedCheckpoint = changes.checkpoint;
  if (changed || newActivity.length) {
    state.contentRefreshPending = true;
    state.qualityReport = null;
    state.teamCapacity = null;
  }
  renderNav();
  renderNotificationBadge();
  if (renderCurrent && (changed || newActivity.length || state.view === 'notifications')) renderContent();
  return { changed, activityChanged: Boolean(newActivity.length) };
}

async function refreshProjectCompanions(workspace) {
  const userID = state.me?.id;
  const generation = state.loadDataRequest;
  await Promise.allSettled([
    ['notifications', '/api/notifications'], ['pendingQuestions', '/api/questions/pending'], ['chatThreads', '/api/chat/threads'],
  ].map(async ([field, path]) => {
    const value = await api(path);
    if (workspace !== state.activeWorkspaceId || userID !== state.me?.id || generation !== state.loadDataRequest) return;
    state[field] = value;
    renderNav();
    renderNotificationBadge();
  }));
}

function closeGlobalSearch({ clear = false, restoreFocus = false } = {}) {
  state.globalSearchRequest = (state.globalSearchRequest || 0) + 1;
  clearTimeout(state.searchTimer);
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
  document.addEventListener('pointerdown', (event) => closeTransientPanels(event.target), true);
  $$('[data-auth-mode]').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.authMode)));
  $('#auth-form').addEventListener('submit', submitAuth);
	$('#auth-change-registration').addEventListener('click', () => resetRegistrationVerification());
  $('#logout-button').addEventListener('click', async () => { await api('/api/auth/logout', { method: 'POST' }); await offlineOutbox.signOut({ broadcast: true }); location.reload(); });
  $('#profile-button').addEventListener('click', () => { setSidebarOpen(false); openProfile(state.me.id); });
  $('#new-record-button').addEventListener('click', (event) => {
    event.stopPropagation();
    if (activeWorkspace()?.readingEnabled && ['dashboard', 'reading'].includes(state.view)) readingUI.open();
    else if (personalWorkspacePage() && state.view !== 'day' && state.view !== 'calendar') openPersonalCapture();
    else if (personalWorkspacePage()) openPersonalEditor('note', '', state.view === 'day' ? { date: state.calendarDay } : {});
    else if (state.view === 'calendar') createCalendarEntry();
    else toggleCreateMenu();
  });
  $('#notification-button').addEventListener('click', () => navigateToView('notifications'));
  $('#onboarding-button').addEventListener('click', openOnboarding);
  $('#sidebar-help-button').addEventListener('click',()=>{setSidebarOpen(false);openOnboarding();});
	$('#interface-settings-button').addEventListener('click', () => openInterfaceSettings());
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
      if (closeTopTransientPanel()) { event.preventDefault(); event.stopPropagation(); return; }
      const searchOpen = $('#global-search').classList.contains('search-open') || !$('#global-search-results').hidden;
      if (searchOpen) {
        event.preventDefault();
        closeGlobalSearch({ clear: true, restoreFocus: true });
      } else {
        const dialog = topOpenDialog();
        if (dialog) {
          event.preventDefault();
          event.stopPropagation();
          requestDialogClose(dialog);
        } else if ($('.sidebar').classList.contains('open')) {
          event.preventDefault(); setSidebarOpen(false);
        } else if (state.calendarExpanded) {
          event.preventDefault();
          state.calendarExpanded = '';
          state.view === 'calendar' ? renderCalendarPage() : renderWorkList();
        }
      }
    }
  });
  document.addEventListener('click', (event) => {
		if (event.target.closest('[data-close-chat-threads]')) $('.chat-shell')?.classList.remove('show-threads');
    if (!event.target.closest('.custom-select')) closeCustomSelects();
    if (!event.target.closest('.create-control')) $('#create-menu').hidden = true;
    if (!event.target.closest('#global-search')) {
      closeGlobalSearch();
    }
    if (!event.target.closest('.work-filter-menu')) $('.work-filter-menu[open]')?.removeAttribute('open');
    if (!event.target.closest('.work-create-menu')) $('.work-create-menu[open]')?.removeAttribute('open');
    if (!event.target.closest('.record-more-actions')) $('.record-more-actions[open]')?.removeAttribute('open');
    if (!event.target.closest('.chat-header-more')) $('.chat-header-more[open]')?.removeAttribute('open');
    if (!event.target.closest('.chat-composer-more')) $('.chat-composer-more[open]')?.removeAttribute('open');
  });
  document.addEventListener('click', (event) => {
    const board = event.target.closest('[data-collection-tab]');
    if (board && board.dataset.collectionTab !== state.activeCollectionId && !leavePageLayoutEditor()) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
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
    queueMicrotask(refreshPendingContent);
    if (dialog.dataset.historyState === 'true' && history.state?.businessControlOverlay === dialog.id) {
      dialog.dataset.historyState = 'false';
      state.suppressOverlayPop = true;
      history.back();
    }
  }));
  window.addEventListener('popstate', (event) => {
    if (state.suppressOverlayPop) {
      state.suppressOverlayPop = false;
      const afterClose = state.afterOverlayClose; state.afterOverlayClose = null; afterClose?.();
      return;
    }
    const dialog = topOpenDialog();
    if (dialog) {
      flushDialogDrafts(dialog);
      if (protectedWorkspaceDialogs.has(dialog.id)) {
        history.pushState({ ...history.state, businessControlOverlay: dialog.id }, '');
        dialog.dataset.historyState = 'true';
        signalProtectedDialog(dialog, dialogHasUnsavedChanges(dialog)
          ? 'Есть несохранённые изменения. Сохраните их или закройте окно кнопкой ×.'
          : 'Рабочее окно осталось открытым. Закройте его явной кнопкой ×.');
        return;
      }
      dialog.dataset.historyState = 'false';
      closeDialogImmediately(dialog);
      return;
    }
    if ($('.sidebar').classList.contains('open')) setSidebarOpen(false);
    if (state.layoutDraft || state.pageLayoutDraft) {
      history.pushState(state.layoutHistoryEntry, '');
      toast('Сохраните раскладку или нажмите «Отмена».');
      return;
    }
    restoreViewHistory(event.state).catch((error) => toast(error.message, true));
  });
  window.addEventListener('beforeunload', (event) => {
    if (state.layoutDraft || pageLayoutDirty()) { event.preventDefault(); event.returnValue = ''; }
    const unsaved = $$('dialog[open]').map(dialog => { flushDialogDrafts(dialog); return dialogHasUnsavedChanges(dialog); }).some(Boolean);
    if (!unsaved) return;
    event.preventDefault();
    event.returnValue = '';
  });
  let rememberTimer;
  document.addEventListener('scroll', (event) => {
    if (event.target instanceof Element && event.target.closest('.custom-select-menu')) return;
    $$('.custom-select.open').forEach((control) => {
      const box = $('.custom-select-trigger', control).getBoundingClientRect();
      if (box.bottom < 0 || box.top > innerHeight) closeCustomSelects(); else positionCustomSelectMenu(control);
    });
  }, { capture: true, passive: true });
  window.addEventListener('scroll', () => {
    clearTimeout(rememberTimer);
    rememberTimer = setTimeout(rememberView, 160);
  }, { passive: true });
  document.addEventListener('change', () => setTimeout(rememberView, 0));
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    $$('dialog[open]').forEach(flushDialogDrafts);
  });
  window.addEventListener('resize', () => {
    const preferences = state.interfaceProfiles[interfaceDevice()];
    if (preferences && state.interfacePreferences !== preferences) {
      state.interfacePreferences = preferences;
      renderNav();
      if (state.layoutDraft) applyInterfaceLayout(); else renderContent();
    }
    $$('.custom-select.open').forEach(positionCustomSelectMenu);
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
  closeTransientPanels();
  rememberView();
  dialog.showModal();
  dialog.dataset.openOrder = String(state.dialogOpenSequence = (state.dialogOpenSequence || 0) + 1);
  history.pushState({ ...history.state, businessControlOverlay: dialog.id }, '');
  dialog.dataset.historyState = 'true';
}

const protectedWorkspaceDialogs = new Set(['record-dialog', 'create-dialog', 'personal-dialog', 'profile-dialog', 'notebook-dialog']);

function topOpenDialog() {
  return [...$$('dialog[open]')].sort((a, b) => Number(a.dataset.openOrder || 0) - Number(b.dataset.openOrder || 0)).pop();
}

function pointerIsOutsideDialog(event, dialog) {
  // A top-layer select menu can extend beyond the dialog's rectangle.
  if (event.target && event.target !== dialog && dialog.contains(event.target)) return false;
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
  return !$('[data-draft-save-failed="true"]', dialog) && !(editForm && state.recordDraftFailures?.has(state.activeDetail?.record.id));
}

function dialogHasUnsavedChanges(dialog) {
  if (!dialog?.open) return false;
  if (dialog.dataset.composerDirty === 'true') return true;
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

async function confirmDialogTransition(dialog) {
  if (dialog.dataset.profileBusy === 'true') { toast('Дождитесь завершения сохранения профиля'); return false; }
  if (dialog.dataset.composerDirty === 'true') return discardComposerChanges(dialog);
  if (!flushDialogDrafts(dialog)) { toast('Не удалось сохранить черновик на устройстве. Окно оставлено открытым', true); return false; }
  return true;
}

function closeDialogImmediately(dialog, returnValue = '') {
  if (!dialog?.open) return;
  dialog.dataset.notebookDirty = 'false';
  dialog.close(returnValue);
}

async function requestDialogClose(dialog, { returnValue = '' } = {}) {
  if (!dialog?.open) return true;
  const hadUnsavedChanges = dialogHasUnsavedChanges(dialog);
  const composer = dialog.dataset.composerDirty === 'true';
  if (!await confirmDialogTransition(dialog)) return false;
  if (hadUnsavedChanges && !composer && dialog.id !== 'notebook-dialog') toast('Черновик сохранён');
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
      event.preventDefault();
      requestDialogClose(dialog, { returnValue: dialog.id === 'reason-dialog' ? 'cancel' : '' });
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
  let suppressClick = false;
  const finish = (event) => {
    if (pointerId === null || event.pointerId !== pointerId) return;
    const shouldClose = event.type !== 'pointercancel' && horizontal && deltaX < -64;
    if (sidebar.hasPointerCapture?.(pointerId)) sidebar.releasePointerCapture(pointerId);
    pointerId = null;
    sidebar.classList.remove('dragging');
    sidebar.style.removeProperty('transform');
    backdrop.style.removeProperty('opacity');
    if (shouldClose) setSidebarOpen(false);
  };
  sidebar.addEventListener('pointerdown', (event) => {
    if (!event.isPrimary || event.button !== 0 || !sidebar.classList.contains('open') || !window.matchMedia('(max-width: 820px)').matches) return;
    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    deltaX = 0;
    horizontal = false;
    suppressClick = false;
  });
  sidebar.addEventListener('pointermove', (event) => {
    if (event.pointerId !== pointerId) return;
    const moveX = event.clientX - startX;
    const moveY = event.clientY - startY;
    if (!horizontal && Math.abs(moveX) > 10 && Math.abs(moveX) > Math.abs(moveY)) {
      horizontal = true;
      suppressClick = true;
      sidebar.setPointerCapture?.(pointerId);
    }
    if (!horizontal) return;
    event.preventDefault();
    deltaX = Math.min(0, moveX);
    sidebar.classList.add('dragging');
    sidebar.style.transform = `translateX(${Math.max(-252, deltaX)}px)`;
    backdrop.style.opacity = String(Math.max(0, 1 + deltaX / 252));
  });
  sidebar.addEventListener('pointerup', finish);
  sidebar.addEventListener('pointercancel', finish);
  sidebar.addEventListener('click', (event) => {
    if (!suppressClick || event.detail === 0) return;
    suppressClick = false;
    event.preventDefault(); event.stopPropagation();
  }, true);
}

function workspaceHasActiveInput() {
  const active = document.activeElement;
  return Boolean(
    active?.matches('input, textarea, [contenteditable="true"]') ||
    document.querySelector('.chat-message-menu[open], .chat-header-more[open], .chat-composer-more[open], .chat-emoji-picker, .chat-composer-context > div, .chat-main.drag-files, .chat-composer.is-recording')
  );
}

function refreshPendingContent() {
  if (!state.contentRefreshPending || state.layoutDraft || state.pageLayoutDraft || state.view === 'graph' || state.view === 'chat' || workspaceHasActiveInput() || document.querySelector('dialog[open]') || $('.sidebar').classList.contains('open')) return;
  const top = window.scrollY;
  renderContent();
  window.scrollTo({ top, behavior: 'instant' });
}

async function refreshLiveData() {
  if (state.offlineMode) return;
  if (!state.me || document.hidden || state.liveRefreshRunning) return;
  state.liveRefreshRunning = true;
  try {
    const previousCycleUpdate = state.activePlanningCycle?.updatedAt || '';
    const result = await syncProjectChanges();
    if (state.view === 'work' && state.workViewMode === 'calendar') await refreshPlanningCycles();
    const cycleChanged = previousCycleUpdate !== (state.activePlanningCycle?.updatedAt || '');
    const overlayOpen = Boolean(document.querySelector('dialog[open]')) || $('.sidebar').classList.contains('open');
    if (!state.layoutDraft && !state.pageLayoutDraft && !workspaceHasActiveInput() && !overlayOpen && state.view !== 'graph' && (result.changed || result.activityChanged || cycleChanged || state.contentRefreshPending || state.view === 'notifications')) renderContent();
  } catch (_) {
    // A background refresh must not interrupt active work. Foreground API actions report their errors explicitly.
  } finally {
    state.liveRefreshRunning = false;
  }
}

async function sendPresence() {
  if (state.offlineMode) return;
  if (!state.me || document.hidden) return;
  const now = Date.now();
  const active = now - state.lastInteractionAt < 90000;
  const elapsed = Math.min(60, Math.max(0, Math.round((now - state.presenceLastSentAt) / 1000)));
  const interactions = state.presenceInteractions;
  state.presenceLastSentAt = now; state.presenceInteractions = 0;
  try { await api('/api/presence', { method: 'POST', body: JSON.stringify({ activeSeconds: active ? elapsed : 0, interactions }) }); } catch (_) {}
}

async function runGlobalSearch(query) {
  const request = state.globalSearchRequest = (state.globalSearchRequest || 0) + 1;
  const context = captureProjectContext();
  const personal = state.workspaces?.find(workspace=>workspace.id===state.activeWorkspaceId)?.kind === 'personal';
  const normalized = query.trim();
  const current = () => request === state.globalSearchRequest && isProjectContextCurrent(context) && personal === (state.workspaces?.find(workspace=>workspace.id===state.activeWorkspaceId)?.kind === 'personal') && $('#global-search-input').value.trim() === normalized;
  const resultsNode = $('#global-search-results');
  if (!normalized) { resultsNode.hidden = true; resultsNode.innerHTML = ''; return; }
  resultsNode.hidden = false;
  resultsNode.innerHTML = `<div class="search-loading"><span class="spinner"></span> ${personal ? 'Ищем в личном пространстве' : 'Ищем во всём проекте'}</div>`;
  try {
    const results = await api(`${personal ? '/api/personal/search' : '/api/search'}?q=${encodeURIComponent(normalized)}`);
    if (!current()) return;
    resultsNode.innerHTML = results.length ? results.map(personal ? renderPersonalSearchResult : renderSearchResult).join('') : `<div class="search-empty">Ничего не найдено</div>`;
    $$('[data-search-result]', resultsNode).forEach(button => button.addEventListener('click', async () => {
      if (!current()) return;
      closeGlobalSearch({ clear: true });
      if (button.dataset.personalId) {
        await loadPersonal();
        if (!isProjectContextCurrent(context)) return;
        if (button.dataset.personalType === 'plan') openPersonalPlanDetails(button.dataset.personalId);
        else openPersonalEditor(button.dataset.personalType,button.dataset.personalId);
        return;
      }
      const tab = button.dataset.targetTab || (button.dataset.researchOptionId ? 'content' : button.dataset.questionId ? 'questions' : 'overview');
      await openRecord(button.dataset.recordId, { tab, questionId: button.dataset.questionId, workspace: $('#record-dialog').open });
    }));
  } catch (error) { if (current()) resultsNode.innerHTML = `<div class="search-empty">${escapeHTML(error.message)}</div>`; }
}

function renderPersonalSearchResult(result) {
  const labels={project:'Личный проект',goal:'Цель',note:'Заметка',plan:'Дело или событие',habit:'Привычка'},icons={project:'folder',goal:'target',note:'edit',plan:'calendar',habit:'checkSquare'};
  const context=markdownPlain(result.context||'','').replace(/\s+/g,' ').trim();
  return `<button type="button" class="global-search-result" data-search-result="${escapeHTML(result.id)}" data-personal-id="${escapeHTML(result.id)}" data-personal-type="${escapeHTML(result.type)}"><span class="type-icon">${icon(icons[result.type]||'fileText')}</span><span><small>${labels[result.type]||'Личная запись'} · Только для вас</small><strong>${escapeHTML(result.title)}</strong>${context?`<em>${escapeHTML(context.slice(0,150))}${context.length>150?'…':''}</em>`:''}</span>${icon('chevronRight')}</button>`;
}

function renderSearchResult(result) {
  const meta = typeMeta[result.type] || { singular: result.type === 'question' ? 'Вопрос' : result.type === 'answer' ? 'Ответ' : result.type === 'joint_decision' ? 'Совместный итог' : 'Запись', icon: result.type === 'question' || result.type === 'answer' ? 'messages' : result.type === 'joint_decision' ? 'scale' : 'fileText' };
  const context = markdownPlain(result.context || '', '').replace(/\s+/g, ' ').trim();
  const entityLabels = { research_option: 'Вариант исследования', section: 'Раздел карточки', comment: 'Комментарий', checklist: 'Шаг задачи', proof: 'Доказательство', attachment: 'Файл' };
  const label = entityLabels[result.entityKind] || meta.singular;
  return `<button type="button" class="global-search-result" data-search-result="${result.id}" data-record-id="${result.recordId}" data-question-id="${result.questionId || ''}" data-research-option-id="${result.researchOptionId || ''}" data-target-tab="${result.targetTab || ''}"><span class="type-icon">${icon(meta.icon)}</span><span><small>${escapeHTML(label)}</small><strong>${escapeHTML(result.title)}</strong>${context ? `<em>${escapeHTML(context.slice(0, 150))}${context.length > 150 ? '…' : ''}</em>` : ''}</span>${icon('chevronRight')}</button>`;
}

function setAuthMode(mode) {
	resetRegistrationVerification(false);
  state.authMode = mode;
  $$('[data-auth-mode]').forEach((button) => button.classList.toggle('active', button.dataset.authMode === mode));
  $('#auth-heading-title').textContent = mode === 'register' ? 'Создайте аккаунт' : 'Войдите в Tessavie';
	$('#auth-heading-copy').hidden = mode === 'register';
	$('#auth-heading-copy').textContent = 'Продолжите работу с того места, где остановились.';
  $('#email-field').hidden = mode !== 'register';
  $('#email-field input').required = mode === 'register';
  $('#login-label').textContent = mode === 'register' ? 'Логин' : 'Логин или почта';
  $('#auth-submit').textContent = mode === 'register' ? 'Создать аккаунт' : 'Войти';
  $('#auth-form').password.autocomplete = mode === 'register' ? 'new-password' : 'current-password';
  $('#auth-error').textContent = '';
}

function resetRegistrationVerification(clearError = true) {
	state.registrationChallenge = null;
	$('#auth-credentials-fields').hidden = false;
	$('#auth-verification-fields').hidden = true;
	$('#auth-testing-code').hidden = true;
	$('#auth-form').verificationCode.required = false;
	$('#auth-form').login.required = true;
	$('#auth-form').password.required = true;
	$('#auth-form').email.required = state.authMode === 'register';
	if (state.authMode === 'register') $('#auth-submit').textContent = 'Создать аккаунт';
	if (clearError) $('#auth-error').textContent = '';
}

function showRegistrationVerification(challenge) {
	state.registrationChallenge = challenge;
	$('#auth-credentials-fields').hidden = true;
	$('#auth-verification-fields').hidden = false;
	$('#auth-form').verificationCode.required = true;
	$('#auth-form').login.required = false;
	$('#auth-form').password.required = false;
	$('#auth-form').email.required = false;
	$('#auth-heading-title').textContent = 'Подтвердите регистрацию';
	$('#auth-heading-copy').hidden = false;
	$('#auth-heading-copy').textContent = 'Введите код в течение 15 минут. Аккаунт появится только после проверки.';
	$('#auth-submit').textContent = 'Подтвердить код';
	const testing = $('#auth-testing-code');
	if (challenge.testingCode) {
		testing.textContent = `Тестовый режим: код ${challenge.testingCode}`;
		testing.hidden = false;
		$('#auth-form').verificationCode.value = challenge.testingCode;
	}
	$('#auth-form').verificationCode.focus();
}

async function submitAuth(event) {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
	const verifying = state.authMode === 'register' && state.registrationChallenge;
	const body = verifying
		? { challengeId: state.registrationChallenge.challengeId, code: form.get('verificationCode') }
		: state.authMode === 'register'
    ? { email: form.get('email'), username: form.get('login'), password: form.get('password'), inviteToken: state.pendingInviteToken }
    : { login: form.get('login'), password: form.get('password') };
  try {
		const path = verifying ? '/api/auth/register/verify' : `/api/auth/${state.authMode}`;
    const authenticatedUser = await api(path, { method: 'POST', body: JSON.stringify(body) });
		if (state.authMode === 'register' && !verifying && authenticatedUser.challengeId) {
			showRegistrationVerification(authenticatedUser);
			return;
		}
		const invitationAcceptedDuringRegistration = state.authMode === 'register' && (state.pendingInviteToken || (verifying && state.registrationChallenge?.invitationPending));
		if (invitationAcceptedDuringRegistration) {
			state.pendingInviteToken = '';
			const url = new URL(location.href);
			url.searchParams.delete('invite');
			history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
		}
    clearPrivateClientState();
    state.me = authenticatedUser;
    showApp();
    await loadData();
		maybeShowOnboarding();
		if (!maybeOpenPendingInvitation()) maybeOpenPendingInterfacePreset();
  } catch (error) {
    $('#auth-error').textContent = error.message;
  }
}

function render() {
	renderWorkspaceControl();
  renderNav();
  renderNotificationBadge();
  renderContent();
}

function activeWorkspace() {
	return state.workspaces.find((workspace) => workspace.id === state.activeWorkspaceId) || null;
}

function canConfigureWorkspace() {
	return ['owner', 'admin'].includes(activeWorkspace()?.role);
}

function renderWorkspaceControl() {
	const root = $('#workspace-control');
	if (!root) return;
	const projects = state.workspaces.filter((workspace) => workspace.kind === 'team');
  const personalWorkspace = state.workspaces.find(workspace => workspace.kind === 'personal');
	const current = activeWorkspace();
	const grouped = new Map((state.teams || []).filter(team => !team.deletedAt).map(team => [team.id, { ...team, projects: [] }]));
	projects.forEach((project) => {
		const id = project.teamId || project.id;
		if (!grouped.has(id)) grouped.set(id, { id, name: project.teamName || project.name, role: project.teamRole || project.role, projects: [] });
		grouped.get(id).projects.push(project);
	});
	const roleLabel = current?.teamRole === 'owner' ? 'Владелец команды' : current?.teamRole === 'admin' ? 'Администратор команды' : current?.role === 'owner' ? 'Владелец' : current?.role === 'admin' ? 'Администратор команды' : 'Участник команды';
	const personal = current?.kind === 'personal';
	const projectName = personal ? 'Личное пространство' : current?.name || 'Выбрать команду';
	const contextLabel = personal ? 'Только вы' : '';
	const switcherTitle = `${projectName}${personal ? ` · ${contextLabel}` : current ? ` · ${roleLabel}` : ''}. Сменить пространство`;
  const personalOption = personalWorkspace ? `<button type="button" class="workspace-personal-option ${personalWorkspace.id === state.activeWorkspaceId ? 'active' : ''}" data-switch-personal="${personalWorkspace.id}" aria-current="${personalWorkspace.id === state.activeWorkspaceId ? 'page' : 'false'}"><span>${icon(personalWorkspace.id === state.activeWorkspaceId ? 'check' : 'lock')}</span><span><strong>Личное пространство</strong><small>Только вы · независимо от команд</small></span></button>` : '';
	const teamGroups = [...grouped.values()].map((team) => `<section class="workspace-team-group"><header><span><strong>${escapeHTML(team.name)}</strong><small>${teamRoleLabel(team.role)}</small></span><button type="button" class="icon-button" data-team-settings="${team.id}" title="Команда и участие" aria-label="Открыть команду ${escapeHTML(team.name)}">${icon('settings')}</button></header>${team.projects.map((project) => `<button type="button" class="${project.id === state.activeWorkspaceId ? 'active' : ''}" data-switch-workspace="${project.id}" aria-current="${project.id === state.activeWorkspaceId ? 'page' : 'false'}" title="${escapeHTML(project.name)}"><span>${icon(project.id === state.activeWorkspaceId ? 'check' : 'network')}</span><span><strong>${escapeHTML(project.name)}</strong><small>${escapeHTML(project.description || 'Рабочее пространство команды')}</small></span></button>`).join('')}</section>`).join('');
	root.innerHTML = `<details class="workspace-switcher"><summary title="${escapeHTML(switcherTitle)}" aria-label="${escapeHTML(`${projectName}. Сменить пространство`)}"><span>${icon(personal ? 'lock' : 'network')}</span><span><strong>${escapeHTML(projectName)}</strong>${personal ? `<small>${escapeHTML(contextLabel)}</small>` : ''}</span>${icon('chevronRight')}</summary><div>${personalOption}${teamGroups || '<p class="workspace-switcher-empty">Команд пока нет.</p>'}<button type="button" data-join-workspace>${icon('link')}<span><strong>Ввести код приглашения</strong><small>Присоединиться к команде</small></span></button><button type="button" data-create-workspace>${icon('plus')}<span><strong>Новая команда</strong><small>Отдельные участники и рабочее пространство</small></span></button></div></details>`;
  $('[data-switch-personal]',root)?.addEventListener('click',async event=>{ try { if(await switchWorkspace(event.currentTarget.dataset.switchPersonal)) navigateToView('personal'); } catch (_) {} });
	$$('[data-switch-workspace]', root).forEach((button) => button.addEventListener('click', () => { void switchWorkspace(button.dataset.switchWorkspace).catch(() => {}); }));
	$$('[data-team-settings]', root).forEach((button) => button.addEventListener('click', () => openTeamSettings(button.dataset.teamSettings)));
	$('[data-join-workspace]', root)?.addEventListener('click', () => openJoinTeamDialog());
	$('[data-create-workspace]', root)?.addEventListener('click', () => openWorkspaceCreateDialog());
}

function closeWorkspaceDialog() {
	if (!discardComposerChanges()) return;
	closeDialogImmediately($('#workspace-dialog'));
}

function openWorkspaceCreateDialog() {
	const dialog = $('#workspace-dialog');
	const content = $('#workspace-dialog-content');
	content.innerHTML = `<div class="workspace-editor-shell compact-workspace-editor"><header><div><p class="eyebrow">Новая команда</p><h2>Новая команда</h2><p>Создайте отдельную команду для стартапа или группы людей. Её участники и администраторы получают доступ только к этому рабочему пространству.</p></div><button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">${icon('x')}</button></header><form id="workspace-create-form" class="card-form"><label>Название команды<input name="name" required maxlength="100" placeholder="Например: Отдел продаж"></label><label>Описание<textarea name="description" rows="3" maxlength="800" placeholder="Что команда будет вести в Tessavie"></textarea></label><div class="form-actions"><button type="submit" class="primary">${icon('plus')} Создать</button><button type="button" class="secondary" data-close-workspace-dialog>Отмена</button></div></form></div>`;
	$$('[data-close-workspace-dialog]', dialog).forEach((button) => button.addEventListener('click', closeWorkspaceDialog));
	$('#workspace-create-form', dialog).addEventListener('submit', async (event) => {
		event.preventDefault();
		const submit = $('button[type="submit"]', event.currentTarget);
		if (submit.disabled) return;
		submit.disabled = true;
		const form = new FormData(event.currentTarget);
		try {
			const workspace = await api('/api/workspaces', { method: 'POST', body: JSON.stringify({ name: form.get('name'), description: form.get('description') }) });
			closeWorkspaceDialog();
			state.activeWorkspaceId = workspace.id;
			localStorage.setItem('bizflow-active-workspace', workspace.id);
			state.view = 'collections';
			await loadData();
			toast('Команда создана');
		} catch (error) { submit.disabled = false; toast(error.message, true); }
	});
	openModal(dialog);
}

function teamProjectChecks(projects, selectedIDs = [], name = 'projectId', disabled = false) {
	const selected = new Set(selectedIDs);
	return projects.map((project) => `<label class="check team-project-check"><input type="checkbox" name="${name}" value="${project.id}" ${selected.has(project.id) ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${escapeHTML(project.name)}</strong><small>${escapeHTML(project.description || 'Рабочее пространство команды')}</small></span></label>`).join('');
}

function teamRoleLabel(role) {
  return { owner: 'Владелец', admin: 'Администратор', member: 'Участник' }[role] || 'Участник';
}

function bindTeamSubmit(form, action) {
  form?.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (form.dataset.submitting === 'true') return;
    form.dataset.submitting = 'true';
    const submit = $('button[type="submit"]', form);
    if (submit) submit.disabled = true;
    try { await action(new FormData(form)); }
    catch (error) { if (form.isConnected) toast(error.message, true); }
    finally { delete form.dataset.submitting; if (submit?.isConnected) submit.disabled = false; }
  });
}

async function reloadTeamSettings(teamID, tab, shell) {
  await loadData(true);
  if ($('#workspace-dialog').open && shell.isConnected) await openTeamSettings(teamID, tab);
}

function teamMemberMarkup(team, member) {
  const canEdit = team.role === 'owner' && member.role !== 'owner' || team.role === 'admin' && member.role === 'member';
  if (!canEdit) return '<article class="team-person-row">' + avatarMarkup(member) + '<span><strong>' + escapeHTML(member.displayName || member.username) + '</strong><small>@' + escapeHTML(member.username) + '</small></span><em>' + teamRoleLabel(member.role) + '</em></article>';
  return '<form data-team-member-form="' + member.id + '" class="team-member-row"><header>' + avatarMarkup(member) + '<span><strong>' + escapeHTML(member.displayName || member.username) + '</strong><small>@' + escapeHTML(member.username) + '</small></span><label>Роль в этой команде<select name="role"><option value="member" ' + (member.role === 'member' ? 'selected' : '') + '>Участник</option><option value="admin" ' + (member.role === 'admin' ? 'selected' : '') + '>Администратор</option></select></label></header><div class="team-row-actions"><button type="submit" class="secondary" hidden>' + icon('check') + ' Сохранить роль</button><button type="button" class="icon-button danger-icon" data-remove-member="' + member.id + '" title="Исключить участника" aria-label="Исключить ' + escapeHTML(member.username) + '">' + icon('trash') + '</button></div></form>';
}

function teamInviteHistory(invites) {
  return invites.map(invite => {
    const active = !invite.revokedAt && new Date(invite.expiresAt) > new Date() && invite.useCount < invite.maxUses;
    return '<article class="' + (active ? '' : 'inactive') + '"><span>' + icon('link') + '</span><div><strong>' + teamRoleLabel(invite.role) + ' этой команды</strong><small>' + invite.useCount + ' из ' + invite.maxUses + ' использовано · до ' + formatDate(invite.expiresAt, true) + '</small></div>' + (active ? '<button type="button" class="icon-button" data-revoke-invite="' + invite.id + '" title="Отозвать" aria-label="Отозвать приглашение">' + icon('x') + '</button>' : '<em>Закрыто</em>') + '</article>';
  }).join('') || '<p class="muted">Приглашений ещё нет.</p>';
}

async function openTeamSettings(teamID, tab = 'members') {
  const dialog = $('#workspace-dialog'), content = $('#workspace-dialog-content');
  content.innerHTML = '<div class="workspace-dialog-loading"><span class="spinner"></span><strong>Загружаем команду</strong></div>';
  const loading = content.firstElementChild;
  openModal(dialog);
  const current = () => dialog.open && content.firstElementChild === loading;
  try {
    const team = await api('/api/teams/' + teamID);
    if (!current()) return;
    state.teamDetail = team;
    const manager = ['owner', 'admin'].includes(team.role), owner = team.role === 'owner';
    if (tab === 'projects') tab = 'members';
    const tabs = [['members','Участники'], ...(manager ? [['invites','Приглашения']] : []), ['settings','Настройки']];
    if (!tabs.some(([key])=>key===tab)) tab='members';
    const workspace = team.projects[0];
    const projectIDs = team.projects.map(project=>project.id);
    content.innerHTML = '<div class="workspace-editor-shell team-settings-shell"><header><div><p class="eyebrow">' + teamRoleLabel(team.role) + '</p><h2>' + escapeHTML(team.name) + '</h2>' + (team.description ? '<p>' + escapeHTML(team.description) + '</p>' : '') + '</div><div class="team-header-actions">' + (!owner ? '<button type="button" class="secondary danger-text" data-team-leave>' + icon('arrowLeft') + ' Выйти из команды</button>' : '') + '<button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">' + icon('x') + '</button></div></header>' +
      (workspace ? '<button type="button" class="team-workspace-summary" data-team-project="' + workspace.id + '"><span>' + icon('network') + '</span><span><small>Рабочее пространство команды</small><strong>' + escapeHTML(workspace.name) + '</strong></span>' + icon('chevronRight') + '</button>' : '') +
      '<nav class="team-settings-tabs" aria-label="Настройки команды">' + tabs.map(([key,label])=>'<button type="button" class="text-button ' + (tab===key?'active':'') + '" aria-pressed="' + (tab===key) + '" data-team-tab="' + key + '">' + label + '</button>').join('') + '</nav>' +
      '<section class="team-settings-section" data-team-panel="members" ' + (tab==='members'?'':'hidden') + '>' +
      (manager ? '<details class="team-inline-editor"><summary>' + icon('users') + ' Добавить по юзернейму</summary><form id="team-member-add-form" class="team-member-add"><label>Юзернейм<input name="username" required placeholder="@username" autocomplete="off"></label><label>Роль в этой команде<select name="role"><option value="member">Участник</option><option value="admin">Администратор</option></select></label><p class="team-role-hint">Доступ относится только к ' + escapeHTML(team.name) + '.</p><button type="submit" class="primary">' + icon('plus') + ' Добавить</button></form></details>' : '') +
      '<div class="team-member-list">' + team.members.map(member=>teamMemberMarkup(team,member)).join('') + '</div></section>' +
      (manager ? '<section class="team-settings-section" data-team-panel="invites" ' + (tab==='invites'?'':'hidden') + '><form id="team-invite-form"><div class="form-grid two"><label>Роль в этой команде<select name="role"><option value="member">Участник</option><option value="admin">Администратор</option></select></label><label>Действует, дней<input name="expiresDays" type="number" min="1" max="90" value="7"></label></div><p class="team-role-hint">Приглашение открывает только рабочее пространство этой команды.</p><button type="submit" class="primary">' + icon('link') + ' Создать приглашение</button></form><div id="team-invite-secret"></div><div class="team-invite-history">' + teamInviteHistory(team.invitations) + '</div></section>' : '') +
      '<section class="team-settings-section" data-team-panel="settings" ' + (tab==='settings'?'':'hidden') + '>' +
      (owner ? '<p class="team-role-hint">Чтобы выйти из команды, сначала передайте владение другому участнику. Если команда больше не нужна, её можно удалить в настройках.</p>' : '') +
      (manager ? '<form id="team-settings-form" class="card-form"><label>Название команды<input name="name" required maxlength="100" value="' + escapeHTML(team.name) + '"></label><label>Описание<textarea name="description" rows="3" maxlength="800">' + escapeHTML(team.description) + '</textarea></label><button type="submit" class="primary">' + icon('check') + ' Сохранить</button></form>' : '') +
      '<div class="team-lifecycle-actions">' + (owner ? '<button type="button" class="secondary" data-team-transfer>' + icon('users') + ' Передать владение</button><button type="button" class="secondary danger-text" data-team-delete>' + icon('trash') + ' Удалить команду</button>' : '<button type="button" class="secondary danger-text" data-team-leave>' + icon('arrowLeft') + ' Выйти из команды</button>') + '</div></section><footer><button type="button" class="text-button" data-team-directory>' + icon('arrowLeft') + ' Все команды</button></footer></div>';
    const shell = content.firstElementChild;
    $('[data-close-workspace-dialog]',shell).addEventListener('click', event => {
      event.stopPropagation();
      closeCustomSelects();
      closeWorkspaceDialog();
  });
    $('[data-team-directory]',shell).addEventListener('click',openTeamsDirectory);
    $$('[data-team-tab]',shell).forEach(button=>button.addEventListener('click',()=>{
      closeCustomSelects();
      $$('[data-team-tab]',shell).forEach(item=>{item.classList.toggle('active',item===button);item.setAttribute('aria-pressed',String(item===button));});
      $$('[data-team-panel]',shell).forEach(panel=>panel.hidden=panel.dataset.teamPanel!==button.dataset.teamTab);
    }));
    $$('[data-team-project]',shell).forEach(button=>button.addEventListener('click',async()=>{
      closeWorkspaceDialog();
      try { if(await switchWorkspace(button.dataset.teamProject)) navigateToView('collections'); } catch(error){toast(error.message,true);}
    }));
    bindTeamSubmit($('#team-member-add-form',shell),async form=>{
      await api('/api/teams/'+teamID+'/members',{method:'POST',body:JSON.stringify({username:form.get('username'),role:form.get('role'),projectIds:projectIDs})});
      await reloadTeamSettings(teamID,'members',shell); toast('Участник добавлен');
    });
    bindTeamSubmit($('#team-settings-form',shell),async form=>{
      await api('/api/teams/'+teamID,{method:'PATCH',body:JSON.stringify({name:form.get('name'),description:form.get('description')})});
      await reloadTeamSettings(teamID,'settings',shell); toast('Команда сохранена');
    });
    $$('[data-team-member-form]',shell).forEach(formNode=>{
      const original=formNode.elements.role.value;
      formNode.elements.role.addEventListener('change',()=>{formNode.querySelector('[type=submit]').hidden=formNode.elements.role.value===original;});
    });
    $$('[data-team-member-form]',shell).forEach(formNode=>bindTeamSubmit(formNode,async form=>{
      await api('/api/teams/'+teamID+'/members/'+formNode.dataset.teamMemberForm,{method:'PATCH',body:JSON.stringify({role:form.get('role'),projectIds:projectIDs})});
      await reloadTeamSettings(teamID,'members',shell); toast('Доступ сохранён');
    }));
    bindTeamSubmit($('#team-invite-form',shell),async form=>{
      const invite=await api('/api/teams/'+teamID+'/invitations',{method:'POST',body:JSON.stringify({role:form.get('role'),projectIds:projectIDs,expiresDays:Number(form.get('expiresDays')),maxUses:1})});
      if (!shell.isConnected || !dialog.open) return;
      $('#team-invite-secret',shell).innerHTML='<div class="team-invite-result"><label>Код приглашения<input readonly value="'+escapeHTML(invite.code)+'"></label><button type="button" class="icon-button" data-copy-code aria-label="Скопировать код">'+icon('copy')+'</button><label>Ссылка<input readonly value="'+escapeHTML(invite.url)+'"></label><button type="button" class="icon-button" data-copy-url aria-label="Скопировать ссылку">'+icon('copy')+'</button></div>';
      $('[data-copy-code]',shell).addEventListener('click',()=>copyToClipboard(invite.code,'Код скопирован'));
      $('[data-copy-url]',shell).addEventListener('click',()=>copyToClipboard(invite.url,'Ссылка скопирована'));
      team.invitations.unshift({...invite,useCount:0});
      $('.team-invite-history',shell).innerHTML=teamInviteHistory(team.invitations);
      bindRevocations(); toast('Приглашение создано');
    });
    function bindRevocations() {
      $$('[data-revoke-invite]',shell).forEach(button=>button.addEventListener('click',async()=>{
        if(button.disabled)return;button.disabled=true;
        try { await api('/api/teams/'+teamID+'/invitations/'+button.dataset.revokeInvite,{method:'DELETE'}); await reloadTeamSettings(teamID,'invites',shell);toast('Приглашение отозвано'); }
        catch(error){button.disabled=false;toast(error.message,true);}
      }));
    }
    bindRevocations();
    $('[data-team-delete]',shell)?.addEventListener('click',()=>openTeamLifecycleDialog(team,'delete'));
    $$('[data-team-leave]',shell).forEach(button=>button.addEventListener('click',()=>openTeamLifecycleDialog(team,'leave')));
    $$('[data-team-transfer]',shell).forEach(button=>button.addEventListener('click',()=>openTeamLifecycleDialog(team,'transfer')));
    $$('[data-remove-member]',shell).forEach(button=>button.addEventListener('click',()=>openTeamLifecycleDialog(team,'remove',team.members.find(member=>String(member.id)===button.dataset.removeMember))));
  } catch(error) {
    if (!current()) return;
    content.innerHTML='<div class="workspace-editor-shell compact-workspace-editor"><header><div><h2>Команда недоступна</h2><p>'+escapeHTML(error.message)+'</p></div><button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">'+icon('x')+'</button></header><button type="button" class="secondary" data-team-directory>'+icon('arrowLeft')+' Все команды</button></div>';
    $('[data-close-workspace-dialog]',content).addEventListener('click',closeWorkspaceDialog);
    $('[data-team-directory]',content).addEventListener('click',openTeamsDirectory);
  }
}

function openTeamLifecycleDialog(team, action, member = null) {
  const dialog=$('#workspace-dialog'),content=$('#workspace-dialog-content');
  const titles={delete:'Удалить команду?',leave:'Выйти из команды?',transfer:'Передать владение',remove:'Исключить участника?'};
  const labels={delete:'Удалить команду',leave:'Выйти из команды',transfer:'Передать владение',remove:'Исключить участника'};
  const copy=action==='delete'?'Команда станет недоступна всем участникам. Владелец сможет восстановить её в разделе «Удалённые команды». Личные данные не изменятся.':action==='transfer'?'Выбранный участник получит права владельца этой команды. Вы станете администратором.':'Доступ к рабочему пространству команды закроется. Незавершённые карточки и приёмка перейдут владельцу команды; авторство, история и личные данные сохранятся.';
  const targets=(team.members||[]).filter(item=>item.id!==state.me.id);
  content.innerHTML='<div class="workspace-editor-shell compact-workspace-editor team-lifecycle-dialog"><header><div><h2>'+titles[action]+'</h2><p>'+escapeHTML(team.name)+(member?' · @'+escapeHTML(member.username):'')+'</p></div><button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">'+icon('x')+'</button></header><p>'+copy+'</p><form class="card-form" id="team-lifecycle-form">'+
    (action==='delete'?'<label>Название команды для подтверждения<input name="name" required autocomplete="off" placeholder="'+escapeHTML(team.name)+'"></label>':'')+
    (action==='transfer'?(targets.length?'<label>Новый владелец<select name="userId">'+targets.map(item=>'<option value="'+item.id+'">'+escapeHTML(item.displayName||item.username)+' (@'+escapeHTML(item.username)+')</option>').join('')+'</select></label>':'<p class="muted">Сначала добавьте другого участника в команду.</p>'):'')+
    '<div class="form-actions"><button type="submit" class="'+(action==='delete'||action==='remove'?'secondary danger-text':'primary')+'" '+(action==='transfer'&&!targets.length?'disabled':'')+'>'+icon(action==='delete'||action==='remove'?'trash':action==='leave'?'arrowLeft':'check')+' '+labels[action]+'</button><button type="button" class="secondary" data-team-cancel>Отмена</button></div></form></div>';
  const shell=content.firstElementChild;
  $('[data-close-workspace-dialog]',shell).addEventListener('click',closeWorkspaceDialog);
  $('[data-team-cancel]',shell).addEventListener('click',()=>openTeamSettings(team.id,action==='remove'?'members':'settings'));
  bindTeamSubmit($('#team-lifecycle-form',shell),async form=>{
    const base='/api/teams/'+team.id;
    if(action==='delete')await api(base,{method:'DELETE',body:JSON.stringify({name:form.get('name')})});
    if(action==='leave')await api(base+'/leave',{method:'POST'});
    if(action==='transfer')await api(base+'/ownership',{method:'POST',body:JSON.stringify({userId:Number(form.get('userId'))})});
    if(action==='remove')await api(base+'/members/'+member.id,{method:'DELETE'});
    if(action==='transfer'||action==='remove')await reloadTeamSettings(team.id,'members',shell);
    else {if(shell.isConnected)closeWorkspaceDialog();await loadData();}
    toast({delete:'Команда удалена. Восстановление доступно в списке команд.',leave:'Вы вышли из команды',transfer:'Владение передано',remove:'Участник исключён'}[action]);
  });
  openModal(dialog);
}

async function copyToClipboard(value, successMessage) {
	try { await navigator.clipboard.writeText(value); toast(successMessage); } catch (_) { toast('Не удалось скопировать', true); }
}

function openJoinTeamDialog({ token = '', code = '' } = {}) {
	const dialog = $('#workspace-dialog');
	$('#workspace-dialog-content').innerHTML = `<div class="workspace-editor-shell compact-workspace-editor"><header><div><p class="eyebrow">Приглашение</p><h2>Присоединиться к команде</h2><p>${token ? 'Ссылка найдена. Подтвердите вступление в эту команду.' : 'Введите код, который прислал администратор команды.'}</p></div><button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">${icon('x')}</button></header><form id="join-team-form" class="card-form">${token ? '' : `<label>Код команды<input name="code" required autocomplete="one-time-code" value="${escapeHTML(code)}" placeholder="ABCD-2345"></label>`}<button type="submit" class="primary">${icon('check')} Присоединиться</button></form></div>`;
	$('[data-close-workspace-dialog]', dialog).addEventListener('click', closeWorkspaceDialog);
	$('#join-team-form', dialog).addEventListener('submit', async (event) => {
		event.preventDefault(); const form = new FormData(event.currentTarget); const submit = $('button[type="submit"]', event.currentTarget); submit.disabled = true;
		try {
			const accepted = await api('/api/invitations/accept', { method: 'POST', body: JSON.stringify({ token, code: form.get('code') || '' }) });
			state.pendingInviteToken = '';
			const url = new URL(location.href); url.searchParams.delete('invite'); history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
			closeWorkspaceDialog(); await loadData();
			toast('Вы присоединились к команде');
			if (accepted.teamId) {
				const team = await api(`/api/teams/${encodeURIComponent(accepted.teamId)}`);
				if (team.projects?.length === 1) await switchWorkspace(team.projects[0].id);
				else await openTeamSettings(accepted.teamId);
			}
			maybeOpenPendingInterfacePreset();
		} catch (error) { submit.disabled = false; toast(error.message, true); }
	});
	openModal(dialog);
}

function maybeOpenPendingInvitation() {
	if (!state.me || !state.pendingInviteToken) return false;
	const token = state.pendingInviteToken;
	state.pendingInviteToken = '';
	openJoinTeamDialog({ token });
	return true;
}

function renderNotificationBadge() {
  const unread = state.unreadCount ?? state.notifications.filter((item) => !item.readAt).length;
  const badge = $('#notification-badge');
  badge.textContent = unread > 99 ? '99+' : String(unread);
  badge.hidden = unread === 0;
}

function interfaceDevice() {
  return window.matchMedia('(max-width: 820px)').matches ? 'mobile' : 'desktop';
}

function deviceSelector(device) {
  return `<div class="segmented interface-device-tabs" role="group" aria-label="Устройство">${[['desktop', 'ПК'], ['mobile', 'Телефон']].map(([key, label]) => `<button type="button" class="segment ${device === key ? 'active' : ''}" aria-pressed="${device === key}" data-interface-device="${key}">${label}</button>`).join('')}</div>`;
}

function navigationCatalog(preferences = state.interfacePreferences) {
  if (state.workspaces?.find(workspace=>workspace.id===state.activeWorkspaceId)?.kind === 'personal') return [['personal','Сегодня','lock','Личное'],['calendar','Календарь','calendar','Личное']].map(([key,label,iconName,group])=>({key,label,iconName,group}));
  const enabled = new Set(state.projectNavigation.enabledViews || []);
  if (state.workspaces?.find(workspace => workspace.id === state.activeWorkspaceId)?.readingEnabled) enabled.add('reading');
  const builtin = navItems.filter(([key]) => key === 'personal' || enabled.has(key)).map(([key, label, iconName, group]) => ({ key, label, iconName, group }));
  const pages = state.workspacePages.filter((page) => !page.archived).map((page) => ({ key: `page:${page.id}`, label: page.name, iconName: page.viewMode === 'board' ? 'network' : 'fileText', group: 'Свои страницы' }));
  const items = [...builtin, ...pages];
  const order = preferences.navOrder || [];
  const positions = new Map(items.map((item, index) => [item.key, order.includes(item.key) ? order.indexOf(item.key) : order.length + index]));
  if (enabled.has('calendar') && !order.includes('calendar') && order.includes('work')) positions.set('calendar', order.indexOf('work') + 0.5);
  return items.sort((a, b) => positions.get(a.key) - positions.get(b.key));
}

function navCount(key) {
  if (state.projectDataReady === false) return '';
  if (key === 'work') return state.records.filter((record) => isWorkRecord(record) && isActiveRecord(record)).length;
  if (key === 'collections') return state.collections.length;
  if (key === 'chat') return state.chatThreads.reduce((sum, thread) => sum + thread.unreadCount, 0);
  if (key.startsWith('page:')) return workspacePageRecords(state.workspacePages.find((page) => `page:${page.id}` === key), '').length;
  return '';
}

function renderNav() {
  const preferences = state.interfacePreferences || {};
  const hidden = new Set(preferences.hiddenNavItems || []);
  const groups = new Set(preferences.hiddenNavGroups || []);
  const items = navigationCatalog().filter((item) => !hidden.has(item.key) && !groups.has(item.group));
  const personal = activeWorkspace()?.kind === 'personal';
  $('#main-nav').innerHTML = `<div class="project-nav-items">${items.map((item) => { const count = navCount(item.key); return `<button type="button" class="nav-item ${state.view === item.key ? 'active' : ''}" data-view="${escapeHTML(item.key)}" title="${escapeHTML(item.label)}">${icon(item.iconName)}<span>${escapeHTML(item.label)}</span>${count !== '' ? `<b>${count}</b>` : ''}</button>`; }).join('')}</div>${personal ? '' : `<button type="button" class="nav-item nav-configure" data-configure-navigation>${icon('sliders')}<span>Настроить меню</span></button>`}`;
  $$('[data-view]', $('#main-nav')).forEach((button) => button.addEventListener('click', () => navigateToView(button.dataset.view)));
  $('#main-nav').insertAdjacentHTML('beforeend', `<button type="button" class="nav-item" data-teams-directory>${icon('users')}<span>Команды</span></button>`);
  $('[data-teams-directory]').addEventListener('click', () => { setSidebarOpen(false); openTeamsDirectory(); });
  $('[data-configure-navigation]')?.addEventListener('click', () => { setSidebarOpen(false); openNavigationSettings(); });
}

async function saveInterfacePreferences(preferences = state.interfacePreferences) {
  const device = preferences.device || interfaceDevice();
  const workspace = state.activeWorkspaceId;
  const saved = await api(`/api/interface/preferences?device=${device}`, { method: 'PUT', body: JSON.stringify(preferences) });
  if (workspace === state.activeWorkspaceId) {
    state.interfaceProfiles[device] = saved;
    state.interfacePreferences = state.interfaceProfiles[interfaceDevice()];
  }
  return saved;
}

function openInterfaceSettings() {
  if (state.layoutDraft) {
    $('.layout-options').open = true;
    $('.layout-editor-header').scrollIntoView({ block: 'start', behavior: 'instant' });
    return;
  }
  startPageLayoutEditor();
}

function renderContent() {
  if (state.projectDataReady === false && state.view !== 'personal' && !(['calendar','day'].includes(state.view) && state.calendarScope === 'personal')) {
    if (state.loadDataAbort) renderProjectLoading(state.loadDataAbort);
    else renderProjectLoadError(new Error('Данные проекта ещё не загружены. Повторите загрузку, чтобы увидеть полный список.'));
    return;
  }
  state.contentRefreshPending = false;
  applyInterfaceLayout();
  const titles = Object.fromEntries(navItems);
  $('#main-content').classList.toggle('graph-main-content', state.view === 'graph');
  if (state.view !== 'graph' && state.graphInstance) {
    state.graphInstance.destroy(); state.graphInstance = null; state.graphLayoutContext = null; state.graphRenderRequest++;
  }
  if (state.view !== 'graph') state.graphLayoutContext = null;
  const personalArea = activeWorkspace()?.kind === 'personal';
  $('#global-search-input').placeholder = personalArea ? 'Найти в личном пространстве' : 'Найти во всём проекте';
  $('#global-search-input').setAttribute('aria-label',personalArea ? 'Поиск в личном пространстве' : 'Глобальный поиск по проекту');
  $('#notification-button').title = personalArea ? 'Личные уведомления' : 'Уведомления проекта';
  $('#notification-button').setAttribute('aria-label',$('#notification-button').title);
  $('#page-title').textContent = titles[state.view] || (state.view === 'notifications' ? 'Уведомления' : state.view === 'quality' ? 'Качество базы' : 'Обзор');
  const createButton = $('#new-record-button');
  const personalCreate = personalWorkspacePage();
  const quickCapture = personalCreate && state.view !== 'day' && state.view !== 'calendar';
  createButton.innerHTML = `${icon('plus')} ${quickCapture ? 'Записать' : personalCreate ? 'Заметка' : 'Создать'}`;
  createButton.setAttribute('aria-label', quickCapture ? 'Записать во входящие' : personalCreate ? 'Новая личная заметка' : 'Создать');
  createButton.title = createButton.getAttribute('aria-label');
  if (state.view.startsWith('page:')) { $('#page-title').textContent = state.workspacePages.find((page) => `page:${page.id}` === state.view)?.name || 'Страница'; return renderWorkspacePage(); }
  if (state.view === 'personal') return renderPersonal();
  if (state.view === 'reading' || (state.view === 'dashboard' && activeWorkspace()?.readingEnabled)) {
    $('#page-title').textContent = 'Чтение';
    createButton.innerHTML = `${icon('plus')} Чтение`;
    createButton.setAttribute('aria-label', 'Отметить чтение');
    createButton.title = 'Отметить чтение';
    return readingUI.render();
  }
  if (state.view === 'calendar') return renderCalendarPage();
  if (state.view === 'day') { $('#page-title').textContent = 'День'; return renderDayWorkspace(); }
  if (state.view === 'dashboard') return renderDashboard();
  if (state.view === 'work') return renderWorkList();
	if (state.view === 'collections') return renderCollections();
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
  const preferences = state.layoutDraft || state.interfacePreferences;
  const layout = interfaceLayout(preferences);
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
	const blocks = {
		focus: `<article class="focus-panel dashboard-widget dashboard-widget-focus">
        <div class="section-heading inverse"><div><p class="eyebrow">${attention.length ? `${attention.length} требуют внимания` : 'В порядке приоритета'}</p><h2>Следующая работа</h2></div><button class="text-button" data-go="work">Открыть всё ${icon('chevronRight')}</button></div>
        <div class="focus-list">${focusItems.length ? focusItems.map((item, index) => item.kind === 'work' ? renderFocusRecord(item.record, index === 0) : renderFocusQuestion(item.question, index === 0)).join('') : `<div class="focus-empty">${icon('check')}<strong>Открытой работы нет</strong><span>Создайте следующий конкретный шаг.</span></div>`}</div>
		</article>`,
		capture: `<aside class="capture-panel dashboard-widget dashboard-widget-capture">
        <div><p class="eyebrow">Создать</p><h3>Быстрая фиксация</h3></div>
        <div class="quick-actions"><button type="button" class="quick-action capture" data-quick-create="inbox"><span class="quick-icon">${icon('inbox')}</span><span><strong>Записать входящее</strong><small>Мысль без выбора типа и оценки</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action idea" data-quick-create="idea"><span class="quick-icon">${icon('lightbulb')}</span><span><strong>Идея</strong><small>Название, детали позже</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action task" data-quick-create="task"><span class="quick-icon">${icon('checkSquare')}</span><span><strong>Задача</strong><small>Кто, что и когда</small></span>${icon('chevronRight')}</button><button type="button" class="quick-action discussion" data-quick-create="question_set"><span class="quick-icon">${icon('messages')}</span><span><strong>Вопросы</strong><small>Два ответа и итог</small></span>${icon('chevronRight')}</button></div>
		</aside>`,
		capacity: `<article class="section-panel dashboard-widget dashboard-widget-capacity">
        <div class="section-heading"><div><p class="eyebrow">Команда</p><h3>Недельная загрузка</h3></div><span class="panel-note">Только работа со сроком на эту неделю</span></div>
        <div class="people-load">${state.users.map((user) => renderPersonLoad(user, work, capacityByUser.get(user.id))).join('') || emptyState('Второй участник появится после регистрации.')}</div>
		</article>`,
		quality: `<article class="section-panel dashboard-widget dashboard-widget-quality">
        <div class="section-heading"><div><p class="eyebrow">Память проекта</p><h3>Качество базы</h3></div><button class="text-button" data-go="quality">Проверить всё</button></div>
        <div class="compact-list quality-compact-list">${state.dashboardInsightsLoading && !state.qualityReport ? `<div class="dashboard-clear"><span class="spinner"></span><span><strong>Проверяем связи и результаты</strong><small>Ищем забытые и противоречивые записи.</small></span></div>` : qualityIssues.slice(0, 6).map(renderQualityCompact).join('') || `<div class="dashboard-clear">${icon('check')}<span><strong>Критичных пробелов нет</strong><small>Связи, результаты и актуальность знаний проверены.</small></span></div>`}</div>
		</article>`,
	};
  blocks.capture = `<aside class="capture-panel dashboard-widget dashboard-widget-capture"><div><p class="eyebrow">Создать</p><h3>Быстрая фиксация</h3></div><div class="quick-actions">${layout.quickActions.filter(projectAllowsType).map((key) => `<button type="button" class="quick-action" data-quick-create="${key}"><span class="quick-icon">${icon(typeMeta[key]?.icon || 'inbox')}</span><span><strong>${escapeHTML(typeMeta[key]?.singular || 'Входящее')}</strong></span>${icon('chevronRight')}</button>`).join('')}</div></aside>`;
	const widgets = (state.layoutDraft ? preferences.dashboardWidgets || ['focus', 'capture', 'capacity', 'quality'] : ['focus', 'capture', 'capacity', 'quality']).filter((key) => blocks[key] && (state.layoutDraft || key !== 'quality' || state.projectNavigation.enabledViews.includes('quality')));
  $('#main-content').innerHTML = `${state.layoutDraft ? renderLayoutEditorHeader() : `<div class="dashboard-config-row"><span><strong>${escapeHTML(activeWorkspace()?.name || 'Обзор')}</strong></span><button type="button" class="secondary" data-configure-dashboard>${icon('settings')} Настроить главную</button></div>`}<section class="dashboard-custom-grid ${state.layoutDraft ? 'layout-editing' : ''}">${widgets.map((key) => blocks[key]).join('')}</section>`;
  widgets.forEach((key) => {
    const block = $(`.dashboard-widget-${key}`); block.dataset.layoutWidget = key;
    block.style.setProperty('--widget-span', layout.widgetSpans[key]);
    if (state.layoutDraft) block.insertAdjacentHTML('afterbegin', renderWidgetControls(key));
  });
  bindOpenRecords();
  $$('[data-quick-create]').forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.quickCreate)));
  $$('[data-go]').forEach((button) => button.addEventListener('click', () => { navigateToView(button.dataset.go); }));
	$('[data-configure-dashboard]')?.addEventListener('click', () => startPageLayoutEditor());
  if (state.layoutDraft) bindLayoutEditor();
  loadDashboardInsights();
}

async function loadPersonal({ force = false } = {}) {
  if (state.personalLoading) { await state.personalLoadPromise.catch(() => {}); if (!force) return; }
  if (!force && (state.personal || state.personalError)) return;
  state.personalLoading = true;
  state.personalError = '';
  const expectedOwner = state.me?.id;
  const request = state.personalLoadRequest = (state.personalLoadRequest || 0) + 1;
  state.personalLoadPromise = api('/api/personal/overview');
  try {
    const result = await state.personalLoadPromise;
    if (expectedOwner !== state.me?.id || request !== state.personalLoadRequest) return;
    state.personal = result;
    personalCalendarUI.invalidate();
    personalTodayUI.invalidate();
    personalWaitingUI.invalidate();
    personalReviewUI.invalidate();
    personalRemindersUI.invalidate();
  } catch (error) {
    if (expectedOwner !== state.me?.id || request !== state.personalLoadRequest) return;
    state.personalError = error.message;
    toast(`Личное пространство не загрузилось: ${error.message}`, true);
  } finally {
    if (expectedOwner === state.me?.id && request === state.personalLoadRequest) state.personalLoading = false;
  }
  renderNav();
  if (state.view === 'personal') renderPersonal();
  if (state.view === 'calendar') renderCalendarPage();
  if (state.view === 'day') renderDayWorkspace();
}

function renderPersonal() {
  if (!state.personal) {
    if (state.personalError) return renderPersonalLoadError();
    $('#main-content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">Только для вас</p><h1>Личное пространство</h1></div></div><div class="personal-loading"><span class="spinner"></span><strong>${state.personalLoading ? 'Загружаем личные данные' : 'Открываем пространство'}</strong></div>`;
    loadPersonal();
    return;
  }
  const data = state.personal;
  const emptyPersonal = !['notes','plans','habits','projects','goals'].some(key=>data[key]?.length);
  const openPlans = data.plans.filter((plan) => plan.status === 'planned');
  const doneToday = data.habits.filter(h => !h.archivedAt && h.days?.some(d => d.date === h.today && d.state === 'success')).length;
  const inboxCount = data.notes.filter(note => note.inInbox).length;
  const tabs = [['today', 'Сегодня'], ['review', 'Обзор недели'], ['waiting', 'Ожидания'], ['inbox', `Входящие${inboxCount ? ` ${inboxCount}` : ''}`], ['projects', 'Проекты'], ['goals', 'Цели'], ['notes', 'Заметки'], ['plans', 'Дела'], ['habits', 'Привычки'], ['life', 'Карта времени']];
  $('#main-content').innerHTML = `
    <div class="page-heading personal-heading">
      <div><p class="eyebrow">${icon('lock')} Только для вас</p><h1>Личное пространство</h1><p>${escapeHTML(state.me.displayName || state.me.username)}</p></div>
      ${renderPersonalCreateMenu()}
    </div>
    ${emptyPersonal ? '' : `<section class="personal-summary" aria-label="Личная сводка"><article><span>Привычки сегодня</span><strong>${doneToday}/${data.habits.filter(h => !h.archivedAt && h.days?.some(d => d.date === h.today && d.planned)).length}</strong><small>отмечено</small></article><article><span>Незавершённые дела</span><strong>${openPlans.length}</strong><small>${openPlans.filter((plan) => plan.dueAt || plan.startDate || plan.startsAt || plan.occurrenceDate).length} запланировано</small></article><article><span>Проекты и цели</span><strong>${data.projects.length}/${data.goals.length}</strong><small>открыто</small></article></section>`}
    <div class="segmented personal-tabs" role="tablist" aria-label="Личные разделы">${tabs.filter(([key])=>['today','inbox','plans','notes'].includes(key)||key===state.personalTab).map(([key, label]) => `<button type="button" class="segment ${state.personalTab === key ? 'active' : ''}" data-personal-tab="${key}">${label}</button>`).join('')}<details class="personal-more-tabs"><summary class="segment">Ещё</summary><div>${tabs.filter(([key])=>!['today','inbox','plans','notes'].includes(key)&&key!==state.personalTab).map(([key,label])=>`<button type="button" data-personal-tab="${key}">${label}</button>`).join('')}</div></details></div>
    <div class="personal-content">${renderPersonalTab(data)}</div>`;
  $$('[data-personal-tab]').forEach((button) => button.addEventListener('click', () => { state.personalTab = button.dataset.personalTab; if(state.personalTab==='review')personalReviewUI.invalidate(); renderPersonal(); }));
  bindPersonalInteractions();
  $('.personal-heading').insertAdjacentHTML('beforeend', `<button type="button" class="secondary" data-personal-calendar>${icon('calendar')} Календарь</button>`);
  $('[data-personal-calendar]').addEventListener('click', () => openCalendar('personal'));
}

function renderPersonalCreateMenu() {
  return `<details class="personal-create-menu"><summary class="secondary">${icon('plus')} Создать</summary><div><button type="button" data-personal-capture>${icon('inbox')}<span><strong>Входящее</strong></span></button><button type="button" data-personal-create="project">${icon('folder')}<span><strong>Личный проект</strong><small>Контекст для целей и дел</small></span></button><button type="button" data-personal-create="goal">${icon('target')}<span><strong>Цель</strong><small>На месяц или 12 недель</small></span></button><button type="button" data-personal-create="plan">${icon('checkSquare')}<span><strong>Дело или событие</strong><small>Срок добавлять необязательно</small></span></button><button type="button" data-personal-create="note">${icon('edit')}<span><strong>Заметка</strong><small>Свободный текст и списки</small></span></button><button type="button" data-personal-waiting-new>${icon('clock')}<span><strong>Ожидание ответа</strong><small>Что и от кого ждёте</small></span></button><button type="button" data-personal-create="habit">${icon('rotate')}<span><strong>Привычка</strong><small>Регулярная отметка</small></span></button></div></details>`;
}

function renderPersonalTab(data) {
  if(state.personalTab==='today' && !personalWaitingUI.hasAny() && !['notes','plans','habits','projects','goals'].some(key=>data[key]?.length) && personalTodayUI.hasNoProjectContext())return `<section class="personal-section first-use-start"><h2>С чего начнём?</h2><p>Сохраните мысль или создайте первое дело. Материалы можно связать между собой позже.</p><div class="first-use-actions"><button type="button" class="primary" data-personal-capture>${icon('edit')} Записать мысль</button><button type="button" class="secondary" data-personal-create="plan">${icon('checkSquare')} Создать дело</button></div><button type="button" class="text-button" data-first-use-teams>Начать работу с командой</button></section>`;
  if (state.personalTab === 'life') return lifeMapUI.render(data.settings);
  if (state.personalTab === 'inbox') return renderPersonalInbox(data);
  if (state.personalTab === 'projects') return renderPersonalProjects(data);
  if (state.personalTab === 'goals') return renderPersonalGoals(data);
  if (state.personalTab === 'notes') return renderPersonalNotes(data.notes, data.links);
  if (state.personalTab === 'plans') return renderPersonalPlans(data.plans, data.links);
  if (state.personalTab === 'habits') return renderPersonalHabits(data.habits, data.links);
  if (state.personalTab === 'review') return personalReviewUI.render();
  if (state.personalTab === 'waiting') return personalWaitingUI.renderList();
  const notes = [...data.notes].sort((a, b) => Number(b.pinned) - Number(a.pinned)).slice(0, 4);
  return `<section class="personal-today-grid"><div class="personal-column">${personalTodayUI.renderBlocks(data)}${personalWaitingUI.renderToday()}${personalRemindersUI.render()}<section class="personal-section"><div class="section-heading"><div><p class="eyebrow">Ритм дня</p><h2>Привычки</h2></div>${data.habits.length ? `<span class="panel-note">${data.habits.filter((habit) => habit.currentStreak > 0).length} серий</span>` : ''}</div><div class="habit-list">${data.habits.filter(h => !h.archivedAt && !h.paused).map((habit) => renderHabitRow(habit, data.links, true)).join('') || personalEmpty('Привычек пока нет', 'habit', 'Добавить привычку')}</div></section>${personalTodayUI.renderPlans(data)}</div><div class="personal-column"><section class="personal-section life-section">${renderLifeMap(data.settings)}</section><section class="personal-section"><div class="section-heading"><div><p class="eyebrow">Под рукой</p><h2>Заметки</h2></div><button type="button" class="text-button" data-personal-tab-jump="notes">Все заметки</button></div><div class="personal-notes-preview">${notes.map((note) => renderNoteCard(note, data.links, true)).join('') || personalEmpty('Заметок пока нет', 'note', 'Создать заметку')}</div></section></div></section>`;
}

function renderPersonalProjects(data) {
  const cards = data.projects.map((project) => {
    const goals = data.goals.filter((goal) => goal.projectId === project.id && goal.status === 'planned');
    const plans = data.plans.filter((plan) => plan.projectId === project.id && plan.status === 'planned');
    return `<button type="button" class="personal-structure-card planner-tone-${project.colorKey || 'green'}" data-personal-edit="project" data-personal-id="${project.id}"><span>${icon('folder')}</span><strong>${escapeHTML(project.title)}</strong><small>${goals.length} целей · ${plans.length} незавершённых дел</small>${project.notes ? `<p>${escapeHTML(markdownPlain(project.notes).slice(0, 140))}</p>` : ''}</button>`;
  });
  return `<section class="personal-section"><div class="section-heading"><div><p class="eyebrow">Только для вас</p><h2>Личные проекты</h2></div><span class="panel-note">${data.projects.length}</span></div><div class="personal-structure-grid">${cards.join('') || personalEmpty('Личных проектов пока нет', 'project', 'Создать проект')}</div></section>`;
}

function renderPersonalGoals(data) {
  const cards = data.goals.map((goal) => {
    const project = data.projects.find((item) => item.id === goal.projectId);
    const unfinished = data.plans.filter((plan) => plan.goalId === goal.id && plan.status === 'planned').length;
    const horizon = goal.horizon === 'twelve_weeks' ? '12 недель' : goal.horizon === 'month' ? 'Месяц' : 'Свой период';
    return `<button type="button" class="personal-structure-card" data-personal-edit="goal" data-personal-id="${goal.id}"><span>${icon('target')}</span><strong>${escapeHTML(goal.title)}</strong><small>${horizon} · ${goal.progress}% · ${unfinished} незавершённых дел</small>${project ? `<em>${escapeHTML(project.title)}</em>` : ''}<progress max="100" value="${goal.progress}"></progress><p>${formatMinutes(goal.actualMinutes)} факт · ${formatMinutes(goal.plannedMinutes)} план</p></button>`;
  });
  return `<section class="personal-section"><div class="section-heading"><div><p class="eyebrow">Личный горизонт</p><h2>Цели</h2></div><span class="panel-note">${data.goals.length}</span></div><div class="personal-structure-grid">${cards.join('') || personalEmpty('Личных целей пока нет', 'goal', 'Добавить цель')}</div></section>`;
}

function formatMinutes(value) {
  const minutes = Number(value) || 0;
  return minutes >= 60 ? `${Math.floor(minutes / 60)} ч ${minutes % 60 ? `${minutes % 60} мин` : ''}`.trim() : `${minutes} мин`;
}

function renderPersonalNotes(notes, links) { return noteLibraryUI.render(notes, links); }

function personalInboxNotes(notes) {
  return notes.filter(note => note.inInbox).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function captureDraftMatches(draft, requestKey, body) {
  return !draft || draft.values?.requestKey === requestKey && String(draft.values?.body || '').trim() === body;
}

function renderPersonalInbox(data) {
  const notes = personalInboxNotes(data.notes);
  return `<section class="personal-section personal-inbox"><div class="section-heading"><h2>Входящие <span class="panel-note">${notes.length}</span></h2><button type="button" class="primary" data-personal-capture>${icon('plus')} Записать</button></div><p class="inbox-explanation">Записи, которые ещё нужно разобрать. Если требуется действие — сделайте из записи дело. Справочный материал оставьте в заметках: он сохранится без срока и напоминаний.</p><section class="inbox-local-pending" data-inbox-local hidden></section><div class="personal-note-grid">${notes.map(note => renderNoteCard(note, data.links)).join('') || `<div class="personal-empty"><span>${icon('inbox')}</span><strong>Всё разобрано</strong><p>Здесь появляются быстрые записи. Нажмите «Записать», когда нужно сохранить мысль и решить, что с ней делать, позже.</p></div>`}</div></section>`;
}

function openPersonalInbox() {
  if (!leavePageLayoutEditor()) return;
  state.personalTab = 'inbox';
  navigateToView('personal');
}

async function setPersonalInboxState(id, inInbox, button) {
  const note = state.personal?.notes.find(item => item.id === id);
  if (!note || button?.disabled) return;
  if (button) button.disabled = true;
  try {
    await api(`/api/personal/notes/${id}/inbox`, { method: 'PATCH', body: JSON.stringify({ inInbox, expectedUpdatedAt: note.updatedAt }) });
    await loadPersonal({ force: true });
    if (inInbox) toast('Возвращено во входящие');
    else toastAction('Сохранено в заметках', 'Вернуть', () => setPersonalInboxState(id, true));
  } catch (error) { toast(error.message, true); }
  finally { if (button?.isConnected) button.disabled = false; }
}

function openPersonalCapture() { personalInboxUI.openCapture(); }

function renderPersonalPlans(plans, links) {
  const active = plans.filter((plan) => plan.status === 'planned');
  const done = plans.filter((plan) => plan.status === 'done');
  return `<section class="personal-section"><div class="section-heading"><div><p class="eyebrow">Личный горизонт</p><h2>Дела</h2></div><span class="panel-note">${active.length} открыто</span></div><div class="personal-plan-groups"><div><h3>В работе</h3><div class="personal-list">${active.map((plan) => renderPlanRow(plan, links)).join('') || `<p class="personal-muted">Открытых планов нет.</p>`}</div></div>${done.length ? `<div><h3>Завершено</h3><div class="personal-list completed">${done.map((plan) => renderPlanRow(plan, links)).join('')}</div></div>` : ''}</div></section>`;
}

function renderPersonalHabits(habits, links) { return habitUI.renderList(habits); }

function renderNoteCard(note, links, compact = false) {
  const ownLinks = personalLinksFor(links, 'note', note.id);
  const body = markdownPlain(note.body).trim();
  const preview = body && body !== note.title ? `<div class="markdown-body">${renderMarkdown(note.body)}</div>` : '';
  return `<article class="personal-note ${compact ? 'compact' : ''}"><button type="button" class="personal-card-main" data-personal-edit="note" data-personal-id="${note.id}"><span>${note.inInbox ? icon('inbox') : note.pinned ? icon('bookmark') : icon('edit')}</span><strong>${escapeHTML(note.title)}</strong>${note.folderName || note.tags?.length ? `<small class="note-card-organization">${escapeHTML([note.folderName, ...(note.tags || []).map(tag => `#${tag}`)].filter(Boolean).join(' · '))}</small>` : ''}${preview}</button>${renderPersonalLinkChips(ownLinks)}<footer>${note.inInbox && !compact ? `<button type="button" class="text-button" data-inbox-make-plan="${note.id}">${icon('checkSquare')} Сделать делом</button><button type="button" class="text-button" data-inbox-keep-note="${note.id}">${icon('check')} Сохранить в заметках</button>` : ''}<time datetime="${escapeHTML(note.createdAt)}" title="Изменена ${escapeHTML(formatDate(note.updatedAt, true))}">Создана ${formatDate(note.createdAt, true)}</time><button type="button" class="text-button" data-personal-link="note" data-personal-id="${note.id}" data-personal-title="${escapeHTML(note.title)}">${icon('link')} Связать</button></footer></article>`;
}

function renderPlanRow(plan, links) {
  const ownLinks = personalLinksFor(links, 'plan', plan.id);
  const done = plan.status === 'done';
  const notes = markdownPlain(plan.notes).trim();
  const project = state.personal?.projects.find((item) => item.id === plan.projectId), goal = state.personal?.goals.find((item) => item.id === plan.goalId);
  const summary = [plan.itemKind === 'event' ? 'Событие' : 'Дело', project?.title, goal?.title, personalPlanDateLabel(plan), plan.occurrenceState === 'skipped' ? 'Пропущено' : '', plan.plannedMinutes || plan.actualMinutes ? `${formatMinutes(plan.actualMinutes)} факт / ${formatMinutes(plan.plannedMinutes)} план` : '', notes && notes !== plan.title ? notes.slice(0, 90) : ''].filter(Boolean).join(' · ');
  return `<article class="personal-plan ${done ? 'done' : ''}"><button type="button" class="personal-check-button ${done ? 'checked' : ''}" data-plan-toggle="${plan.id}" aria-label="${done ? 'Вернуть план в работу' : 'Отметить план выполненным'}">${icon('check')}</button><button type="button" class="personal-row-main" data-personal-edit="plan" data-personal-id="${plan.id}"><strong>${escapeHTML(plan.title)}</strong>${summary ? `<span>${escapeHTML(summary)}</span>` : ''}</button><button type="button" class="icon-button personal-link-button" data-personal-link="plan" data-personal-id="${plan.id}" data-personal-title="${escapeHTML(plan.title)}" title="Связать" aria-label="Связать план">${icon('link')}</button>${renderPersonalLinkChips(ownLinks)}</article>`;
}

const personalWaitingUI=createPersonalWaitingUI({state,api,escapeHTML,icon,openModal,closeDialog:requestDialogClose,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor,flushDrafts:flushDialogDrafts,renderPersonal,toast,openPlan:openPersonalPlanDetails});
const personalRemindersUI=createPersonalRemindersUI({state,api,escapeHTML,icon,openModal,closeDialog:requestDialogClose,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor,flushDrafts:flushDialogDrafts,toast,renderPersonal,openSource:openPersonalReminderSource,openHabit:openHabitReminderSource,openPlans:()=>navigateToView('personal',{personalTab:'plans'}),refreshNotifications:loadNotificationInbox});
async function openPersonalReminderSource(id){const owner=state.me?.id;await navigateToView('personal',{personalTab:'today'});if(owner!==state.me?.id)return;await loadPersonal({force:true});if(owner===state.me?.id)openPersonalPlanDetails(id);}
const reminderSettingsUI=createReminderSettingsUI({state,api,escapeHTML,icon,openModal,closeDialog:requestDialogClose,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor,flushDrafts:flushDialogDrafts,toast});
const personalTodayUI=createPersonalTodayUI({state,api,escapeHTML,icon,renderPersonal,renderPlanRow,formatMinutes,openPlan:openPersonalPlanDetails,openRecurrence:plan=>personalCalendarUI.openRecurrence(plan.id,plan),refreshPersonal:async()=>{await loadPersonal({force:true});if(state.personalError)throw new Error(state.personalError);},openProject:(id,workspaceId)=>openPersonalReviewSource({sourceKind:'record',sourceId:id,workspaceId}),togglePlan:togglePersonalPlan,openDay:openDayWorkspace,openModal,closeDialog:requestDialogClose,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor,flushDrafts:flushDialogDrafts,toast});
const firstUseUI = createFirstUseUI({state,api,escapeHTML,icon,activeWorkspace,canConfigureWorkspace,openModal,closeDialog:requestDialogClose,toast,
  actions:{capture:openPersonalCapture,inbox:openPersonalInbox,teams:openTeamsDirectory,board:openCollectionCreateDialog,menu:openNavigationSettings,page:openWorkspacePageEditor},
});

const personalInboxUI=createPersonalInboxUI({state,api,outbox:()=>offlineOutbox,escapeHTML,icon,renderMarkdown,openModal,closeDialog:requestDialogClose,flushDrafts:flushDialogDrafts,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor,loadDraft:loadWorkingDraft,draftMatches:captureDraftMatches,toast,toastAction,loadPersonal,openInbox:openPersonalInbox,openPlan:async id=>{await loadPersonal({force:true});openPersonalPlanDetails(id);}});
const personalPublishUI = createPersonalPublishUI({state,api,escapeHTML,icon,renderMarkdown,openModal,closeDialog:requestDialogClose,flushDrafts:flushDialogDrafts,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor,toast,openCopy:async(value,owner)=>{ if(owner!==state.me?.id)return; if(await switchWorkspace(value.workspaceId) && owner===state.me?.id)await openRecord(value.recordId); }});
const noteMediaUI = createNoteMediaUI({state, api, outbox: () => offlineOutbox, escapeHTML, icon, renderMarkdown, openModal, closeDialog: requestDialogClose, flushDrafts: flushDialogDrafts, loadPersonal, openPersonalEditor, toast, askChoice});
const noteLibraryUI = createNoteLibraryUI({state, api, escapeHTML, icon, renderNoteCard, renderPersonal, loadPersonal, openPersonalEditor, localISODate, openModal, closeDialog: requestDialogClose, enhanceSelects, bindDraft: bindWorkingDraft, clearDraft: clearWorkingDraftFor, flushDrafts: flushDialogDrafts, openArchive: () => noteMediaUI.openArchive(), askChoice, toast});
async function openHabitReminderSource(id) {
  const owner=state.me?.id;if(!owner)return;
  await navigateToView('personal',{personalTab:'habits'});
  await loadPersonal({force:true});if(owner!==state.me?.id)return;
  await habitUI.open(id);
}
const habitReminderUI=createHabitReminderUI({state,api,escapeHTML,icon,openModal,closeDialog:requestDialogClose,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor,flushDrafts:flushDialogDrafts,toast,loadPersonal});
const habitUI = createHabitUI({ openReminder:id=>habitReminderUI.open(id), outbox: () => offlineOutbox, escapeHTML, icon, api, state, toast, loadPersonal, openModal, closeDialog: requestDialogClose, bindDraft: bindWorkingDraft, clearDraft: clearWorkingDraftFor, flushDrafts: flushDialogDrafts, findHabit: id => findPersonalItem('habit', id), openLinks: openPersonalLinkDialog, renderPersonal });
async function openPersonalReviewSource(item) {
  const owner=state.me?.id;if(!owner)return;
  if(item.sourceKind==='plan')return openPersonalPlanDetails(item.sourceId);
  if(item.sourceKind==='waiting')return personalWaitingUI.open(item.sourceId);
  if(item.sourceKind==='habit')return habitUI.open(item.sourceId);
  if(item.sourceKind==='record'&&item.workspaceId){
    if(item.workspaceId!==state.activeWorkspaceId&&!await switchWorkspace(item.workspaceId))return;
    if(owner===state.me?.id&&item.workspaceId===state.activeWorkspaceId)await openRecord(item.sourceId);
  }
}
const personalReviewUI=createPersonalReviewUI({state,api,escapeHTML,icon,renderPersonal,toast,openSource:openPersonalReviewSource});
const personalCalendarUI=createPersonalCalendarUI({state,api,esc:escapeHTML,icon,rerender:()=>{if(state.calendarScope==='personal'){if(state.view==='calendar')renderCalendarPage();if(state.view==='day')renderDayWorkspace();}},openModal,closeDialog:requestDialogClose,toast,openSource:openPersonalReviewSource,openPlan:openPersonalPlanDetails,refreshPersonal:()=>loadPersonal({force:true}),formatDate,bindDraft:bindWorkingDraft,clearDraft:clearWorkingDraftFor});
const readingUI = createReadingUI({ escapeHTML, icon, api, state, toast, toastAction, openModal, closeDialog: requestDialogClose, bindDraft: bindWorkingDraft, clearDraft: clearWorkingDraftFor, loadData });
function renderHabitRow(habit, links, compact = false) { return habitUI.renderRow(habit, compact); }

const lifeMapUI = createLifeMapUI({ state, api, escapeHTML, icon, localISODate, renderPersonal, toast, bindWorkingDraft, clearWorkingDraftFor });
function renderLifeMap(settings) { return lifeMapUI.render(settings, true); }

function personalLinksFor(links, sourceType, sourceID) {
  const result = [], seen = new Set();
  for (const link of links || []) {
    const forward = link.sourceType === sourceType && link.sourceId === sourceID;
    const reverse = link.targetType === sourceType && link.targetId === sourceID;
    if (!forward && !reverse) continue;
    const item = forward ? link : { ...link, targetType: link.sourceType, targetId: link.sourceId, targetTitle: link.sourceTitle, targetWorkspaceId: '' };
    const key = `${item.targetType}:${item.targetId}`;
    if (!seen.has(key)) { result.push(item); seen.add(key); }
  }
  return result;
}

function renderPersonalLinkChips(links) {
  if (!links.length) return '';
  return `<div class="personal-link-chips">${links.map((link) => `<button type="button" data-personal-target-type="${link.targetType}" data-personal-target-id="${link.targetId}" title="Открыть связанную запись">${icon('link')} ${escapeHTML(link.targetTitle || 'Связанная запись')}</button>`).join('')}</div>`;
}

function personalEmpty(title, kind, action) {
  return `<div class="personal-empty"><span>${icon(kind === 'habit' ? 'checkSquare' : kind === 'plan' ? 'calendar' : 'edit')}</span><strong>${escapeHTML(title)}</strong><button type="button" class="text-button" data-personal-create="${kind}">${escapeHTML(action)}</button></div>`;
}

function localISODate(date = new Date()) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

function lastDates(count) {
  return Array.from({ length: count }, (_, index) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - (count - index - 1));
    return localISODate(date);
  });
}

function bindPersonalInteractions() {
  lifeMapUI.bind();
  personalTodayUI.bind();
  personalWaitingUI.bind();
  personalReviewUI.bind();
  personalRemindersUI.bind();
  $('[data-first-use-teams]')?.addEventListener('click',openTeamsDirectory);
  void personalInboxUI.bindList();
  $$('[data-inbox-make-plan]').forEach(button=>button.addEventListener('click',()=>personalInboxUI.openTriage(button.dataset.inboxMakePlan)));
  noteLibraryUI.bind();
  $$('[data-personal-capture]').forEach(button => button.addEventListener('click', openPersonalCapture));
  $$('[data-inbox-keep-note]').forEach(button => button.addEventListener('click', () => setPersonalInboxState(button.dataset.inboxKeepNote, false, button)));
  $$('[data-personal-waiting-new]').forEach(button=>button.addEventListener('click',()=>personalWaitingUI.open()));
  $$('[data-personal-tab-jump]').forEach((button) => button.addEventListener('click', () => { state.personalTab = button.dataset.personalTabJump; renderPersonal(); }));
  $$('[data-personal-edit]').forEach((button) => button.addEventListener('click', () => openPersonalTarget(button.dataset.personalEdit, button.dataset.personalId)));
  $$('[data-personal-create]').forEach((button) => button.addEventListener('click', () => {
    button.closest('details')?.removeAttribute('open');
    openPersonalEditor(button.dataset.personalCreate);
  }));
  $$('[data-plan-toggle]').forEach((button) => button.addEventListener('click', () => togglePersonalPlan(button.dataset.planToggle)));
  habitUI.bind();
  $$('[data-habit-check]').forEach((button) => button.addEventListener('click', () => toggleHabitCheckin(button.dataset.habitCheck, button.dataset.checkDate)));
  $$('[data-personal-link]').forEach((button) => button.addEventListener('click', () => openPersonalLinkDialog(button.dataset.personalLink, button.dataset.personalId, button.dataset.personalTitle)));
  $$('[data-personal-target-type]').forEach((button) => button.addEventListener('click', () => openPersonalTarget(button.dataset.personalTargetType, button.dataset.personalTargetId)));
  $$('[data-open-own-profile]').forEach((button) => button.addEventListener('click', () => openProfile(state.me.id)));
}

function findPersonalItem(kind, id) {
  const collection = kind === 'note' ? state.personal?.notes : kind === 'plan' ? state.personal?.plans : kind === 'project' ? state.personal?.projects : kind === 'goal' ? state.personal?.goals : state.personal?.habits;
  return (collection || []).find((item) => item.id === id);
}

async function togglePersonalPlan(id) {
  const plan = findPersonalItem('plan', id);
  if (!plan) return;
  try {
    await api(`/api/personal/plans/${id}`, { method: 'PATCH', body: JSON.stringify({ title: plan.titleGenerated ? '' : plan.title, notes: plan.notes || '', expectedUpdatedAt: plan.updatedAt, status: plan.status === 'done' ? 'planned' : 'done' }) });
    await loadPersonal({ force: true });
  } catch (error) { toast(error.message, true); }
}

async function toggleHabitCheckin(id, date) {
  const habit = findPersonalItem('habit', id);
  if (!habit) return;
  const completed = (habit.checkins || []).some((checkin) => checkin.date === date);
  try {
    await api(`/api/personal/habits/${id}/checkins/${date}`, completed ? { method: 'DELETE' } : { method: 'PUT', body: JSON.stringify({ value: 1, note: '' }) });
    await loadPersonal({ force: true });
  } catch (error) { toast(error.message, true); }
}

async function openPersonalTarget(type, id) {
  if (type === 'record') {
    const link = state.personal?.links.find((item) => item.targetType === 'record' && item.targetId === id);
    if (link?.targetWorkspaceId && link.targetWorkspaceId !== state.activeWorkspaceId) {
      await requestDialogClose($('#personal-dialog'));
      await switchWorkspace(link.targetWorkspaceId, { keepView: true });
      if (state.activeWorkspaceId !== link.targetWorkspaceId) return;
    }
    return openRecord(id);
  }
  if (type === 'plan') return openPersonalPlanDetails(id);
  openPersonalEditor(type, id);
}

function personalNoteSheet(item, { bodyName = 'body', pin = true } = {}) {
  const label = bodyName === 'notes' ? 'План' : pin ? 'Заметка' : 'Входящее';
  return `<section class="personal-note-sheet ${pin ? '' : 'inbox-note-sheet'}" aria-label="${label}">${pin ? `<label class="personal-note-pin" title="Закрепить заметку"><input class="sr-only" type="checkbox" name="pinned" aria-label="Закрепить заметку" ${item?.pinned ? 'checked' : ''}><span>${icon('bookmark')}</span></label>` : ''}${markdownEditor(bodyName, label, item?.body || '', 6, '', 'notebook-' + bodyName, { compact: true, history: true, ai: false, expand: false, notebookTitle: item?.titleGenerated ? '' : item?.title || '' })}</section>`;
}

function bindPersonalNoteSheet(form, bodyLabel = 'Заметка') {
  const editor = $('.markdown-editor[data-notebook]', form);
  $('.markdown-rich-editor', editor).setAttribute('aria-label', bodyLabel);
  editor.append($('.markdown-toolbar', editor));
  return () => syncNotebook(editor);
}

function personalProjectFields(item) {
  return `<label>Описание<textarea name="notes" rows="5" maxlength="100000" placeholder="Что входит в проект">${escapeHTML(item?.notes || '')}</textarea></label><fieldset class="plan-color-picker"><legend>Цвет</legend>${calendarColors().map(([key, label]) => `<label title="${label}"><input type="radio" name="colorKey" value="${key}" ${(item?.colorKey || 'green') === key ? 'checked' : ''} aria-label="${label}"><span class="planner-tone-${key}"></span></label>`).join('')}</fieldset>${item ? `<label>Состояние<select name="status"><option value="planned" ${item.status === 'planned' ? 'selected' : ''}>В работе</option><option value="done" ${item.status === 'done' ? 'selected' : ''}>Завершён</option></select></label>` : ''}`;
}

function personalGoalFields(item) {
  const projects = state.personal?.projects || [];
  return `<label>Личный проект<select name="projectId"><option value="">Без проекта</option>${projects.map((project) => `<option value="${project.id}" ${item?.projectId === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`).join('')}</select></label><label>Описание<textarea name="notes" rows="4" maxlength="100000">${escapeHTML(item?.notes || '')}</textarea></label><div class="form-grid two"><label>Горизонт<select name="horizon"><option value="month" ${(item?.horizon || 'month') === 'month' ? 'selected' : ''}>Месяц</option><option value="twelve_weeks" ${item?.horizon === 'twelve_weeks' ? 'selected' : ''}>12 недель</option><option value="custom" ${item?.horizon === 'custom' ? 'selected' : ''}>Свой период</option></select></label><label>Прогресс, %<input type="number" name="progress" min="0" max="100" value="${item?.progress || 0}"></label></div><div class="form-grid two"><label>Начало<input type="date" name="startDate" value="${escapeHTML(item?.startDate || localISODate())}" required></label><label>Окончание<input type="date" name="endDate" value="${escapeHTML(item?.endDate || '')}"></label></div><div class="form-grid two"><label>План, минут<input type="number" name="plannedMinutes" min="0" max="525600" value="${item?.plannedMinutes || 0}"></label><label>Факт, минут<input type="number" name="actualMinutes" min="0" max="525600" value="${item?.actualMinutes || 0}"></label></div>${item ? `<label>Состояние<select name="status"><option value="planned" ${item.status === 'planned' ? 'selected' : ''}>В работе</option><option value="done" ${item.status === 'done' ? 'selected' : ''}>Завершена</option></select></label>` : ''}`;
}

function personalRecurrenceLabel(rule) {
  if(!rule?.cadence)return 'Повторение';
  const every={daily:'Каждый день',weekly:'Каждую неделю',monthly:'Каждый месяц'};
  return Number(rule.interval||1)===1?every[rule.cadence]||'Повторение':`Каждые ${Number(rule.interval)} ${rule.cadence==='daily'?'дн.':rule.cadence==='weekly'?'нед.':'мес.'}`;
}

function personalRecurrenceFields(plan) {
  const rule=plan.recurrence||{},series=!!plan.seriesId;
  return `<details class="personal-recurrence" ${series?'open':''}><summary>${icon('rotate')} ${series?escapeHTML(personalRecurrenceLabel(rule)):'Повторение'} <small>${series?'настроено':'необязательно'}</small></summary><div>${series?`<label>Дата этого экземпляра<input type="date" name="occurrenceDate" value="${escapeHTML(plan.occurrenceDate||'')}"></label><p class="muted">Без изменения серии правки относятся только к этому экземпляру.</p>${rule.template?`<p class="recurrence-template-caption"><span>Шаблон серии</span><strong>${escapeHTML(rule.template.title)}</strong></p>`:''}${rule.needsReview?'<p class="muted">Серия создана раньше. Проверьте шаблон: прежние разовые правки могли попасть в него. Уже сохранённые дела не переписываются автоматически.</p>':''}<label class="check"><input type="checkbox" name="applyToSeries"><span>Изменить все незавершённые повторения</span></label><p class="muted" data-series-impact hidden>Название, описание, связи, цвет и время станут общими для незавершённых и будущих повторений. Выполненные дела и факт сохранятся. Уже созданные даты останутся; новый ритм действует на следующие экземпляры.</p>`:''}<fieldset class="recurrence-settings" data-series-settings ${series?'disabled':''}><div class="form-grid two"><label>Ритм<select name="recurrenceCadence">${series?'':'<option value="none">Не повторять</option>'}<option value="daily" ${rule.cadence==='daily'?'selected':''}>Каждый день</option><option value="weekly" ${rule.cadence==='weekly'?'selected':''}>Каждую неделю</option><option value="monthly" ${rule.cadence==='monthly'?'selected':''}>Каждый месяц</option></select></label><label>Интервал<input type="number" name="recurrenceInterval" min="1" max="365" value="${rule.interval||1}"></label></div><div class="form-grid two"><label>Первый день<input type="date" name="recurrenceStartDate" value="${escapeHTML(rule.startDate||plan.occurrenceDate||'')}"></label><label>Повторять до<input type="date" name="recurrenceUntilDate" value="${escapeHTML(rule.untilDate||'')}"></label></div>${series?`<label class="check"><input type="checkbox" name="recurrenceActive" ${rule.active?'checked':''}><span>Создавать следующие экземпляры</span></label>`:''}</fieldset></div></details>`;
}

function shiftPersonalOccurrenceDates(form,from,to) {
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to))return;
  const days=(Date.parse(to+'T00:00:00Z')-Date.parse(from+'T00:00:00Z'))/86400000;
  if(!Number.isFinite(days))return;
  ['startDate','endDate','dueAt','startsAt','endsAt'].forEach(name=>{const field=form.elements[name];if(!field?.value)return;const date=new Date(field.value.slice(0,10)+'T00:00:00Z');date.setUTCDate(date.getUTCDate()+days);if(!Number.isNaN(date.getTime()))field.value=date.toISOString().slice(0,10)+field.value.slice(10);});
}

function bindPersonalRecurrenceScope(form) {
  const scope=form.elements.applyToSeries,settings=form.querySelector('[data-series-settings]');
  if(!settings)return;
  const sync=()=>{
    settings.disabled=!!scope&&!scope.checked;
    settings.hidden=!!scope&&!scope.checked;
    const notice=form.querySelector('[data-series-impact]');if(notice)notice.hidden=!scope.checked;
    if(form.elements.occurrenceDate)form.elements.occurrenceDate.readOnly=!!scope?.checked;
    const none=!scope&&form.elements.recurrenceCadence.value==='none';
    ['recurrenceInterval','recurrenceStartDate','recurrenceUntilDate'].forEach(name=>{if(form.elements[name])form.elements[name].disabled=none;});
  };
  scope?.addEventListener('change',sync);form.elements.recurrenceCadence?.addEventListener('change',sync);sync();
  const occurrence=form.elements.occurrenceDate;let previous=occurrence?.value||'';
  occurrence?.addEventListener('change',()=>{if(!scope?.checked)shiftPersonalOccurrenceDates(form,previous,occurrence.value);previous=occurrence.value;form.dispatchEvent(new Event('input',{bubbles:true}));});
  ['startDate','dueAt','startsAt'].forEach(name=>form.elements[name]?.addEventListener('change',()=>{
    const mode=form.elements.dateMode?.value,wanted=mode==='days'?'startDate':mode==='time'?'dueAt':mode==='block'?'startsAt':'';
    if(occurrence&&wanted===name&&form.elements[name].value){occurrence.value=form.elements[name].value.slice(0,10);previous=occurrence.value;form.dispatchEvent(new Event('input',{bubbles:true}));}
  }));
}

function personalPlanContextFields(plan) {
  const projects = state.personal?.projects || [], goals = state.personal?.goals || [], parents = (state.personal?.plans || []).filter((item) => item.id !== plan.id && item.status === 'planned');
  const recurrence = plan.recurrence || {};
  return `<section class="personal-plan-context"><div class="form-grid two"><label>Тип<select name="itemKind"><option value="task" ${(plan.itemKind || 'task') === 'task' ? 'selected' : ''}>Дело</option><option value="event" ${plan.itemKind === 'event' ? 'selected' : ''}>Событие</option></select></label><label>Личный проект<select name="projectId"><option value="">Без проекта</option>${projects.map((project) => `<option value="${project.id}" ${plan.projectId === project.id ? 'selected' : ''}>${escapeHTML(project.title)}</option>`).join('')}</select></label></div><div class="form-grid two"><label>Цель<select name="goalId"><option value="">Без цели</option>${goals.map((goal) => `<option value="${goal.id}" ${plan.goalId === goal.id ? 'selected' : ''}>${escapeHTML(goal.title)}</option>`).join('')}</select></label><label>Родительское дело<select name="parentId"><option value="">Нет</option>${parents.map((parent) => `<option value="${parent.id}" ${plan.parentId === parent.id ? 'selected' : ''}>${escapeHTML(parent.title)}</option>`).join('')}</select></label></div><div class="form-grid two"><label>План, минут<input type="number" name="plannedMinutes" min="0" max="525600" value="${plan.plannedMinutes || 0}"></label><label>Факт, минут<input type="number" name="actualMinutes" min="0" max="525600" value="${plan.actualMinutes || 0}"></label></div>${personalRecurrenceFields(plan)}</section>`;
}

function personalPlanDateError(form) {
  const mode = form.get('dateMode');
  if (mode === 'block') {
    const start = Date.parse(form.get('startsAt')), end = Date.parse(form.get('endsAt'));
    if (!Number.isFinite(start)) return {field:'startsAt', message:'Укажите начало события'};
    if (!Number.isFinite(end)) return {field:'endsAt', message:'Укажите окончание события'};
    if (end <= start) return {field:'endsAt', message:'Окончание события должно быть позже начала'};
  }
  if (mode === 'days' && form.get('startDate') && form.get('endDate') && form.get('endDate') < form.get('startDate')) {
    return {field:'endDate', message:'Окончание периода не может быть раньше начала'};
  }
  if (form.get('recurrenceCadence') !== 'none' && form.get('recurrenceStartDate') && form.get('recurrenceUntilDate') && form.get('recurrenceUntilDate') < form.get('recurrenceStartDate')) {
    return {field:'recurrenceUntilDate', message:'Повторение не может закончиться раньше первого дня'};
  }
  return null;
}

function openPersonalEditor(kind, id = '', context = {}) {
  if (kind === 'habit') return id ? habitUI.open(id) : habitUI.settings();
  const item = id ? findPersonalItem(kind, id) : null;
  const dialog = $('#personal-dialog');
  const content = $('#personal-dialog-content');
  const labels = { note: 'Заметка', plan: 'Дело', habit: 'Привычка', project: 'Личный проект', goal: 'Цель' };
  const title = labels[kind] || labels.note;
  const body = kind === 'note'
    ? `${personalNoteSheet(item)}${noteLibraryUI.fields(item)}<label class="note-schedule-field">${icon('calendar')}<span>В календаре</span><input type="date" name="scheduledDate" aria-label="Дата заметки в календаре" value="${escapeHTML(item ? item.scheduledDate || '' : context.date || '')}"></label>${item?.createdAt ? `<small class="muted">Создана ${escapeHTML(formatDate(item.createdAt))}</small>` : ''}`
    : kind === 'plan'
      ? `${personalNoteSheet(item ? { ...item, body: item.notes } : null, { bodyName: 'notes', pin: false })}${item ? '' : '<details class="first-plan-options"><summary>Даты, повторение и другие параметры</summary>'}${personalPlanContextFields(item || {})}${personalPlanDateFields(item || { startDate: context.date || '', endDate: context.date || '' })}${item ? '' : '</details>'}`
      : kind === 'project' ? personalProjectFields(item)
        : kind === 'goal' ? personalGoalFields(item)
          : `<div class="form-grid two"><label>Режим<select name="scheduleKind"><option value="daily" ${(item?.scheduleKind || 'daily') === 'daily' ? 'selected' : ''}>Каждый день</option><option value="weekdays" ${item?.scheduleKind === 'weekdays' ? 'selected' : ''}>По будням</option><option value="weekly_target" ${item?.scheduleKind === 'weekly_target' ? 'selected' : ''}>Цель на неделю</option></select></label><label>Дней в неделю<input type="number" name="targetPerWeek" min="1" max="7" value="${item?.targetPerWeek || 7}"></label></div><div class="form-grid two"><label>Единица<input name="unit" maxlength="32" value="${escapeHTML(item?.unit || 'раз')}"></label><label>Начало<input type="date" name="startDate" value="${escapeHTML(item?.startDate || localISODate())}" ${item ? 'disabled' : ''}></label></div>`;
  const newHeading = kind === 'habit' ? 'Новая привычка' : kind === 'plan' ? 'Новое дело' : kind === 'project' ? 'Новый личный проект' : kind === 'goal' ? 'Новая цель' : 'Новая заметка';
  const titleField = ['habit', 'project', 'goal'].includes(kind)
    ? `<label>Название<input name="title" maxlength="240" required autofocus value="${escapeHTML(item?.title || '')}" placeholder="${kind === 'project' ? 'Например: ремонт квартиры' : kind === 'goal' ? 'Например: закончить курс к декабрю' : 'Например: читать 20 минут'}"></label>`
    : '';
  content.innerHTML = `<div class="dialog-header personal-editor-header"><div><span class="record-kind">${icon(kind === 'habit' ? 'checkSquare' : kind === 'plan' ? 'calendar' : 'edit')} Только для вас</span><h2>${kind === 'note' ? title : item ? escapeHTML(item.title) : newHeading}</h2></div><button type="button" class="close-button icon-button" data-close-personal aria-label="Закрыть">${icon('x')}</button></div><form id="personal-editor-form" class="card-form dialog-form personal-editor-form ${kind !== 'habit' ? 'personal-note-form' : ''}" novalidate>${titleField}${body}<div class="form-actions personal-editor-actions"><button type="submit" class="primary">${icon('check')} Сохранить</button>${item ? `<button type="button" class="secondary" data-publish-personal>Опубликовать в проект</button><button type="button" class="danger-text" data-archive-personal>В архив</button>` : ''}</div></form>`;
  $$('[data-close-personal]', dialog).forEach((button) => button.addEventListener('click', async () => { if (await requestDialogClose(dialog) && context.planId) openPersonalPlanDetails(context.planId); }));
  const editorForm = $('#personal-editor-form', dialog);
  const editorOwner = state.me.id;
  const draftScope = `personal:${state.me.id}:${kind}:${item?.id || context.planId || (context.date ? `day:${context.date}` : 'new')}`;
  bindWorkingDraft(editorForm, draftScope);
  if (kind === 'note') {
    const editor = $('.markdown-editor', editorForm);
    editor.append($('.markdown-toolbar', editor));
  }
  bindMarkdownEditors(dialog);
  const resizeNoteTitle = ['note', 'plan'].includes(kind) ? bindPersonalNoteSheet(editorForm, kind === 'plan' ? 'Дело' : 'Заметка') : null;
  if (kind === 'note') noteLibraryUI.bindEditor(editorForm, () => { syncNotebook($('.markdown-editor', editorForm)); const values = new FormData(editorForm); return {title: values.get('title'), body: values.get('body'), sourceID: item?.id || 'new'}; });
  if (kind === 'plan') {bindPersonalPlanDates(editorForm);bindPersonalRecurrenceScope(editorForm);}
  if(kind==='plan'&&!item){const options=$('.first-plan-options',editorForm);if(context.date||['startDate','endDate','startsAt','dueAt','projectId','goalId','parentId'].some(key=>editorForm.elements[key]?.value)||editorForm.elements.recurrenceCadence?.value!=='none')options.open=true;}
  if (item && kind === 'note') {
    $('.personal-note-sheet', editorForm).insertAdjacentHTML('afterend', renderPersonalLinkChips(personalLinksFor(state.personal.links, kind, id)));
    $$('[data-personal-target-type]', editorForm).forEach((button) => button.addEventListener('click', async () => { if (await requestDialogClose(dialog)) openPersonalTarget(button.dataset.personalTargetType, button.dataset.personalTargetId); }));
  }
  const noteMedia = kind === 'note' ? noteMediaUI.bindEditor(editorForm,item) : null;
  $('[data-publish-personal]',editorForm)?.addEventListener('click',()=>{ if(editorOwner===state.me?.id && flushDialogDrafts(dialog)){personalPublishUI.open(kind,id);void firstUseUI.tip('publication',$('.personal-publish-dialog'));} });
  let saving = false, preparing = false;
  editorForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving || preparing) return;
    preparing = true;
    let mediaCreation = {};
    try { if (noteMedia && !item) mediaCreation = await noteMedia.creation(); } catch (error) { toast(error.message,true); return; } finally { preparing = false; }
    if (editorOwner !== state.me?.id || !editorForm.isConnected || !dialog.open) return;
    const form = new FormData(editorForm);
    let payload;
    if (kind === 'note') payload = { folderId: form.get('folderId') || '', tags: parseNoteTags(form.get('noteTags')), title: form.get('title'), ...(item ? { expectedUpdatedAt: item.updatedAt } : {}), body: form.get('body'), scheduledDate: form.get('scheduledDate') || '', pinned: form.get('pinned') === 'on', ...(!item && context.planId ? { linkPlanId: context.planId } : {}) };
    else if (kind === 'plan') {
      const dateError = personalPlanDateError(form);
      if (dateError) { toast(dateError.message, true); editorForm.elements[dateError.field]?.focus(); return; }
      const mode = form.get('dateMode');
      if (mode === 'days' && !form.get('startDate') || mode === 'time' && !form.get('dueAt') || mode === 'block' && (!form.get('startsAt') || !form.get('endsAt'))) { toast('Заполните выбранные даты или выберите «Без даты»', true); return; }
      const cadence = form.get('recurrenceCadence');
      payload = { title: form.get('title'), notes: form.get('notes'), itemKind: form.get('itemKind'), projectId: form.get('projectId'), goalId: form.get('goalId'), parentId: form.get('parentId'), plannedMinutes: Number(form.get('plannedMinutes')), actualMinutes: Number(form.get('actualMinutes')), dueAt: mode === 'time' ? new Date(form.get('dueAt')).toISOString() : '', startDate: mode === 'days' ? form.get('startDate') : '', endDate: mode === 'days' ? form.get('endDate') : '', startsAt: mode === 'block' ? new Date(form.get('startsAt')).toISOString() : '', endsAt: mode === 'block' ? new Date(form.get('endsAt')).toISOString() : '', colorKey: form.get('colorKey'), ...(item?.seriesId ? { occurrenceDate: form.get('occurrenceDate'), expectedSeriesUpdatedAt:item.recurrence?.updatedAt||'' } : {}), ...(cadence && cadence !== 'none' ? { recurrence: { cadence, interval: Number(form.get('recurrenceInterval')) || 1, timezone: item?.recurrence?.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Moscow', startDate: form.get('recurrenceStartDate'), untilDate: form.get('recurrenceUntilDate'), active: item?.seriesId ? form.get('recurrenceActive') === 'on' : true } } : {}), ...(item ? { status: item.status, expectedUpdatedAt: item.updatedAt } : {}) };
    }
    else if (kind === 'project') payload = { title: form.get('title'), notes: form.get('notes'), colorKey: form.get('colorKey'), ...(item ? { status: form.get('status'), expectedUpdatedAt: item.updatedAt } : {}) };
    else if (kind === 'goal') payload = { title: form.get('title'), notes: form.get('notes'), projectId: form.get('projectId'), horizon: form.get('horizon'), startDate: form.get('startDate'), endDate: form.get('endDate'), progress: Number(form.get('progress')), plannedMinutes: Number(form.get('plannedMinutes')), actualMinutes: Number(form.get('actualMinutes')), ...(item ? { status: form.get('status'), expectedUpdatedAt: item.updatedAt } : {}) };
    else payload = { title: form.get('title'), scheduleKind: form.get('scheduleKind'), targetPerWeek: Number(form.get('targetPerWeek')), unit: form.get('unit'), ...(item ? {} : { startDate: form.get('startDate') }) };
    if (kind === 'note' && !String(payload.title || '').trim() && !String(payload.body || '').trim() && mediaCreation.files?.length) payload.title = mediaCreation.files[0].name;
    if (kind !== 'habit' && !String(payload.title || '').trim() && !String(kind === 'note' ? payload.body : payload.notes || '').trim()) {
      toast('Напишите текст или укажите название', true);
      $('.markdown-rich-editor', editorForm)?.focus();
      return;
    }
    const submit = $('button[type="submit"]', editorForm);
    saving = true;
    submit.disabled = true;
    try {
      if (!item && (kind === 'note' || kind === 'plan')) {
        editorForm.inert = true;
        const snapshot = JSON.stringify(workingDraftValues(editorForm));
        await offlineOutbox.addPersonal(kind, payload, editorOwner, mediaCreation);
        await noteMedia?.clear();
        const current = editorOwner === state.me?.id && editorForm.isConnected && dialog.open && snapshot === JSON.stringify(workingDraftValues(editorForm));
        if (current) { clearWorkingDraftFor(editorForm); await requestDialogClose(dialog); }
        if (editorOwner === state.me?.id) toastAction('Сохранено в этом браузере. Статус отправки доступен в очереди.', 'Проверить', () => offlineOutbox.open());
        void offlineOutbox.pump();
        return;
      }
      const seriesUpdate = kind === 'plan' && item?.seriesId && form.get('applyToSeries') === 'on';
      if (seriesUpdate && !payload.recurrence) { toast('Для изменения серии выберите ритм повторения', true); return; }
      const endpoint = seriesUpdate ? `/api/personal/plans/${item.id}/series` : `/api/personal/${kind === 'habit' ? 'habits' : `${kind}s`}${item ? `/${item.id}` : ''}`;
      const saved = await api(endpoint, { method: seriesUpdate ? 'PUT' : item ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      if (editorOwner !== state.me?.id || !editorForm.isConnected) return;
      clearWorkingDraftFor(editorForm);
      const stillHere = editorForm.isConnected && dialog.open;
      if (stillHere) await requestDialogClose(dialog);
      await loadPersonal({ force: true });
      if (stillHere && !dialog.open && (context.planId || kind === 'plan')) openPersonalPlanDetails(context.planId || saved.id);
      toast(`${title} ${kind === 'plan' ? 'сохранено' : kind === 'project' ? 'сохранён' : 'сохранена'}`);
    } catch (error) { toast(error.message, true); }
    finally { saving = false; submit.disabled = false; editorForm.inert = false; }
  });
  $('[data-archive-personal]', dialog)?.addEventListener('click', async () => {
    try {
      await api(`/api/personal/${kind === 'habit' ? 'habits' : `${kind}s`}/${item.id}`, { method: 'DELETE', ...(kind === 'note' ? {body:JSON.stringify({expectedUpdatedAt:item.updatedAt})} : {}) });
      if (kind !== 'note') clearWorkingDraftFor(editorForm);
      await requestDialogClose(dialog);
      await loadPersonal({ force: true });
      toast(`${title} ${kind === 'plan' ? 'перенесено' : kind === 'project' ? 'перенесён' : 'перенесена'} в архив`);
    } catch (error) { toast(error.message, true); }
  });
  openModal(dialog);
  requestAnimationFrame(() => {
    resizeNoteTitle?.();
    if (!item && ['note', 'plan'].includes(kind)) {
      focusNotebook($('.markdown-editor', editorForm));
    }
  });
}

function openPersonalLinkDialog(sourceType, sourceID, sourceTitle, context = {}) {
  const dialog = $('#personal-dialog');
  $('#personal-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${icon('link')} Личная связь</span><h2>${escapeHTML(sourceTitle)}</h2><p>Начните вводить название связанной карточки или личной записи.</p></div><button type="button" class="close-button icon-button" data-close-personal aria-label="Закрыть">${icon('x')}</button></div><div class="dialog-form personal-link-dialog"><label>Найти связь<input id="personal-link-search" type="search" autocomplete="off" autofocus placeholder="Например: отдых на даче"></label><div id="personal-link-results" class="personal-link-results"><p>Совпадения появятся здесь.</p></div></div>`;
  $('[data-close-personal]', dialog).addEventListener('click', () => requestDialogClose(dialog));
  const input = $('#personal-link-search', dialog);
  void firstUseUI.tip('relationships', $('.personal-link-dialog',dialog));
  let version = 0, saving = false;
  const localItems = () => (context.notesOnly ? ['note'] : ['note', 'plan', 'habit']).flatMap((type) => (state.personal?.[type === 'habit' ? 'habits' : `${type}s`] || []).map((item) => ({ type, id: item.id, title: item.title, subtitle: type === 'note' ? 'Личная заметка' : type === 'plan' ? 'Личный план' : 'Привычка' })));
  const showResults = (items) => {
    const resultsNode = $('#personal-link-results', dialog);
    const linked = new Set(personalLinksFor(state.personal.links, sourceType, sourceID).map((item) => `${item.targetType}:${item.targetId}`));
    items = items.filter((item) => !(item.type === sourceType && item.id === sourceID) && !linked.has(`${item.type}:${item.id}`));
    resultsNode.innerHTML = items.map((item) => `<button type="button" data-link-target-type="${item.type}" data-link-target-id="${item.id}"><span>${icon('link')}</span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.subtitle)}</small></button>`).join('') || '<p>Подходящих записей не найдено.</p>';
    $$('[data-link-target-id]', resultsNode).forEach((button) => button.addEventListener('click', async () => {
      if (saving) return;
      saving = true; resultsNode.inert = true;
      try {
        await api('/api/personal/links', { method: 'POST', body: JSON.stringify({ sourceType, sourceId: sourceID, targetType: button.dataset.linkTargetType, targetId: button.dataset.linkTargetId, relationType: 'related' }) });
        const stillHere = input.isConnected && dialog.open;
        if (stillHere) await requestDialogClose(dialog);
        await loadPersonal({ force: true });
        if (stillHere && !dialog.open && context.returnPlanId) openPersonalPlanDetails(context.returnPlanId);
        toast('Связь добавлена');
      } catch (error) { toast(error.message, true); }
      finally { saving = false; resultsNode.inert = false; }
    }));
  };
  input.addEventListener('input', () => {
    clearTimeout(state.personalSuggestionTimer);
    const request = ++version;
    const query = input.value.trim();
    if (query.length < 2 || context.notesOnly) { showResults(localItems().filter((item) => item.title.toLocaleLowerCase().includes(query.toLocaleLowerCase()))); return; }
    state.personalSuggestionTimer = setTimeout(async () => {
      const resultsNode = $('#personal-link-results', dialog);
      resultsNode.innerHTML = '<span class="spinner"></span>';
      try {
        const items = (await api(`/api/personal/suggestions?q=${encodeURIComponent(query)}`)).filter((item) => !(item.type === sourceType && item.id === sourceID));
        if (request === version && input.isConnected && dialog.open) showResults(items);
      } catch (error) { if (request === version && input.isConnected) resultsNode.innerHTML = `<p class="form-error">${escapeHTML(error.message)}</p>`; }
    }, 220);
  });
  showResults(localItems());
  if (context.returnPlanId) {
    $('[data-close-personal]', dialog).insertAdjacentHTML('beforebegin', `<button type="button" class="text-button" data-link-back>${icon('arrowLeft')} К плану</button>`);
    $('[data-link-back]', dialog).addEventListener('click', () => openPersonalPlanDetails(context.returnPlanId));
  }
  openModal(dialog);
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
  if (state.view === 'dashboard' && !state.layoutDraft) renderDashboard();
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

async function navigateToView(view, options = {}) {
	const normalized = ({ goals: 'goal', tasks: 'work', ideas: 'idea' })[view] || view;
  if (!leavePageLayoutEditor()) return;
  if (state.layoutDraft && !confirm('Выйти без сохранения раскладки?')) return;
  const request = state.viewRestoreRequest = (state.viewRestoreRequest || 0) + 1;
  const account = state.me?.id;
  state.layoutDraft = null;
  rememberView();
  const calendarScope = options.calendarScope || (state.workspaces.find(workspace => workspace.id === state.activeWorkspaceId)?.kind === 'personal' ? 'personal' : 'project');
  const route = personalRoute({ view: normalized, calendarScope, workspaceId: state.activeWorkspaceId }, state.workspaces);
  if (!route.workspaceId) { toast('Личное пространство недоступно. Обновите список пространств.', true); return false; }
  const changedWorkspace = route.workspaceId !== state.activeWorkspaceId;
  if (changedWorkspace) {
    try { if (!await switchWorkspace(route.workspaceId, { restoring: true })) return false; }
    catch (error) { toast(error.message, true); return false; }
    if (request !== state.viewRestoreRequest || account !== state.me?.id) return false;
  }
  const changedView = changedWorkspace || normalized !== state.view;
	state.view = normalized;
  if (['personal', 'calendar', 'day'].includes(normalized)) state.calendarScope = route.calendarScope;
  if (['calendar','day'].includes(normalized) && state.calendarScope === 'personal') personalCalendarUI.invalidate();
  if (normalized === 'personal' && Object.hasOwn(options, 'personalTab')) {
	state.personalTab = options.personalTab;
	if (state.personalTab === 'review') personalReviewUI.invalidate();
  }
  for (const key of ['calendarDay', 'calendarCollection', 'calendarOwner', 'calendarStatus', 'calendarExpanded']) {
    if (Object.hasOwn(options, key)) state[key] = options[key];
  }
  if (changedView) state.pageSearch = '';
  state.statusFilter = options.status || '';
  state.search = options.search || '';
	state.ownerFilter = options.ownerId ? String(options.ownerId) : '';
  if (changedView) pushViewHistory(); else rememberView();
  if (normalized === 'notifications') { state.notificationInbox = null; state.notificationError = ''; }
	setSidebarOpen(false);
	window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  render();
  return true;
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
  return `<button type="button" class="person-load capacity-${tone}" data-user-profile="${user.id}">${avatarMarkup(user)}<span class="person-main"><strong>${escapeHTML(user.displayName || user.username)}</strong><small>${note}</small><progress class="progress-track" max="100" value="${Math.min(100, utilization)}"></progress></span><b>${available ? `${utilization}%` : '—'}</b></button>`;
}

function renderPrinciples() {
  const groups = [
    { kind: 'preference', title: 'Критерии', copy: 'Требования к результату.', example: 'Критериев пока нет.', icon: 'target' },
    { kind: 'limitation', title: 'Ограничения', copy: 'Бюджет, условия и запреты.', example: 'Ограничений пока нет.', icon: 'archive' },
    { kind: 'rule', title: 'Правила', copy: 'Согласованный порядок работы.', example: 'Правил пока нет.', icon: 'scale' },
  ];
  const records = state.records.filter((record) => (['preference', 'limitation', 'rule'].includes(record.kind) || (record.type === 'criterion' && !record.kind)) && record.status !== 'archived');
  const reviewCount = records.filter((record) => knowledgeReviewState(record).tone === 'overdue').length;
  $('#main-content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">Общие требования</p><h1>Правила и критерии</h1><p>Критерии, ограничения и правила проекта.</p></div>${reviewCount ? `<div class="knowledge-review-summary" role="status">${icon('clock')} <span><strong>${reviewCount}</strong><small>требуют проверки</small></span></div>` : ''}</div><div class="principle-grid">${groups.map((group) => {
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

function hasOtherProjectParticipants() {
  const workspace = state.workspaces.find((item) => item.id === state.activeWorkspaceId);
  return workspace?.kind === 'team' && state.users.some((user) => user.id !== state.me?.id);
}

function workScopeOptions() {
  return [['all', 'Вся'], ['mine', 'Моя'], ...(hasOtherProjectParticipants() ? [['partner', 'Других']] : [])];
}

function normalizeWorkScope() {
  if (state.workScope === 'mine') return;
  if (state.workScope === 'partner' && hasOtherProjectParticipants()) return;
  state.workScope = 'all';
}

function workFilterCount() {
  return Number(Boolean(state.ownerFilter)) + Number(state.workType !== 'all') + Number(state.workstreamFilter !== 'all') + Number(state.workStatus !== 'active') + Number(state.workOrder !== 'priority');
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
  if (state.workCollection) records = state.records.filter((record) => record.collectionId === state.workCollection);
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
		{ key: 'completed', label: 'Завершено', statuses: ['completed'] },
		{ key: 'postponed', label: 'Отложено', statuses: ['postponed'] },
		{ key: 'cancelled', label: 'Отменено', statuses: ['cancelled', 'rejected', 'archived'] },
	];
	return `<section class="work-kanban" data-drag-scroll="true" data-work-scroll="board">${columns.map((column) => {
		const items = records.filter((record) => column.statuses.includes(record.status));
		const page = boardWindow(items, column.key);
		const empty = column.key === 'review' ? 'Отправьте задачу после результата и доказательства' : 'Перетащите карточку сюда';
		return `<div class="kanban-column" data-kanban-status="${column.key}"><header><strong>${column.label}</strong><span>${items.length}</span></header><div class="board-column-scroll" data-work-scroll="${column.key}" tabindex="0" aria-label="Карточки: ${column.label}">${page.items.map((record) => { const movable = !['question_set', 'inbox'].includes(record.type); const blockers = activeBlockers(record); return `<article class="kanban-card ${blockers.length ? 'has-blockers' : ''}" draggable="${movable}" data-kanban-record="${record.id}"><button type="button" data-open-record="${record.id}"><span><i class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</i><small>${escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(workstreamLabels[record.workstream || 'business'])}</small></span><strong>${escapeHTML(record.title)}</strong><p>${escapeHTML(markdownPlain(record.description, 'Без дополнительного контекста'))}</p>${blockers.length ? `<div class="kanban-blocker">${icon('lock')}<span><small>Ждёт завершения</small><strong>${escapeHTML(blockers[0].title)}</strong></span></div>` : ''}<footer>${record.type === 'inbox' ? `<em class="inbox-state">Нужно разобрать</em>` : `<em class="priority priority-${record.priority || 'normal'}">${icon('flag')} ${priorityLabels[record.priority || 'normal']}</em><span class="deadline ${deadlineState(record).className}">${escapeHTML(deadlineState(record).label)}</span>`}</footer></button>${movable ? `<button type="button" class="kanban-move" data-kanban-move="${record.id}" aria-label="Переместить карточку" title="Переместить">${icon('grip')}</button>` : ''}</article>`; }).join('') || `<div class="kanban-empty">${empty}</div>`}${renderBoardMore(page, column.key)}</div></div>`;
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
	if (targetStatus === 'completed') { await completeRecordFromAction(record); return; }
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

function dateFromKey(key) {
  return new Date(`${key}T12:00:00`);
}

function addCalendarDays(value, amount) {
  const date = value instanceof Date ? new Date(value) : dateFromKey(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function calendarRecordPool() {
  let records = state.records.filter((record) => isWorkRecord(record));
  if (state.workCollection) records = state.records.filter((record) => record.collectionId === state.workCollection);
  if (state.ownerFilter) records = records.filter((record) => String(record.ownerId) === state.ownerFilter);
  else if (state.workScope === 'mine') records = records.filter((record) => record.ownerId === state.me.id);
  else if (state.workScope === 'partner') records = records.filter((record) => record.ownerId !== state.me.id);
  if (state.workType !== 'all') records = records.filter((record) => record.type === state.workType);
  if (state.workstreamFilter !== 'all') records = records.filter((record) => record.workstream === state.workstreamFilter);
  if (state.workStatus === 'active') records = records.filter((record) => isActiveRecord(record));
  if (state.workStatus === 'overdue') records = records.filter((record) => isActiveRecord(record) && deadlineState(record).className === 'overdue');
  if (state.workStatus === 'completed') records = records.filter((record) => record.status === 'completed');
  if (state.workStatus === 'archived') records = records.filter((record) => record.status === 'archived');
  if (state.search) {
    const query = state.search.toLowerCase();
    records = records.filter((record) => `${record.title} ${record.description} ${record.ownerUsername}`.toLowerCase().includes(query));
  }
  return records;
}

function recordsByDueDate(records) {
  const dueMap = new Map();
  records.filter((record) => record.dueAt).forEach((record) => {
    const key = localDateKey(record.dueAt);
    if (!dueMap.has(key)) dueMap.set(key, []);
    dueMap.get(key).push(record);
  });
  dueMap.forEach((items) => items.sort(sortWorkRecords));
  return dueMap;
}

function calendarScore(records, startKey, endKey) {
  const planned = records.filter((record) => record.dueAt && localDateKey(record.dueAt) >= startKey && localDateKey(record.dueAt) <= endKey);
  const completed = planned.filter((record) => record.status === 'completed');
  return { planned: planned.length, completed: completed.length, percent: planned.length ? Math.round(completed.length * 100 / planned.length) : 0 };
}

function quarterClass(date) {
  return `quarter-${Math.floor(date.getMonth() / 3) + 1}`;
}

function calendarTaskChip(record, compact = false) {
  const completed = record.status === 'completed';
  const draggable = isActiveRecord(record);
  return `<button type="button" data-open-record="${record.id}" data-calendar-record="${record.id}" draggable="${draggable}" class="calendar-item priority-${record.priority || 'normal'} ${completed ? 'completed' : ''} ${compact ? 'compact' : ''}" title="${escapeHTML(record.title)}${draggable ? ' · перетащите, чтобы изменить срок' : ''}"><i>${escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(record.ownerUsername)}</i><strong>${escapeHTML(record.title)}</strong></button>`;
}

function calendarModeToolbar() {
  return `<div class="calendar-mode segmented compact" aria-label="Масштаб календаря">${[['cycle', '12 недель'], ['year', 'Год'], ['month', 'Месяц']].map(([value, label]) => `<button type="button" class="segment ${state.calendarMode === value ? 'active' : ''}" data-calendar-mode="${value}">${label}</button>`).join('')}</div>`;
}

function calendarPresentationKey(surface) {
  return `business-control:calendar:${state.me?.id}:${surface === 'personal' ? 'personal' : state.activeWorkspaceId}:${interfaceDevice()}:${surface}`;
}

function calendarPresentation(surface) {
  let saved = {};
  try { saved = JSON.parse(localStorage.getItem(calendarPresentationKey(surface)) || '{}') || {}; } catch (_) {}
  return { includeWork: saved.includeWork === true, journal: saved.journal === true, format: saved.format === 'circles' ? 'circles' : 'grid', zoom: Math.max(40, Math.min(100, Number(saved.zoom) || 100)) };
}

function saveCalendarPresentation(surface, patch) {
  const next = { ...calendarPresentation(surface), ...patch };
  next.zoom = Math.max(40, Math.min(100, Number(next.zoom) || 100));
  try { localStorage.setItem(calendarPresentationKey(surface), JSON.stringify(next)); } catch (_) { toast('Не удалось сохранить вид календаря на устройстве', true); }
  return next;
}

function calendarPresentationToolbar(surface) {
  const settings = calendarPresentation(surface);
  return `<div class="calendar-presentation" data-calendar-presentation="${surface}"><div class="segmented compact" aria-label="Формат календаря">${[['grid', 'Сетка'], ['circles', 'Круги']].map(([key, label]) => `<button type="button" class="segment ${settings.format === key ? 'active' : ''}" data-calendar-format="${key}" aria-pressed="${settings.format === key}">${label}</button>`).join('')}</div><label class="calendar-size"><span class="sr-only">Размер календаря</span><select data-native-select data-calendar-size aria-label="Размер календаря">${[40,50,60,70,80,90,100].map(size => `<option value="${size}" ${settings.zoom === size ? 'selected' : ''}>${size}%</option>`).join('')}</select></label><button type="button" class="icon-button" data-calendar-expand title="${state.calendarExpanded === surface ? 'Обычный размер' : 'На весь экран'}" aria-label="${state.calendarExpanded === surface ? 'Обычный размер' : 'На весь экран'}">${icon(state.calendarExpanded === surface ? 'x' : 'maximize')}</button></div>`;
}

function calendarSurfaceClass(surface) {
  return state.calendarExpanded === surface ? 'calendar-expanded' : '';
}

function bindCalendarPresentation(surface, root, rerender) {
  const toolbar = $('[data-calendar-presentation]', root);
  if (!toolbar) return;
  root.style.setProperty('--calendar-scale', calendarPresentation(surface).zoom / 100);
  root.dataset.calendarScalable = 'true';
  $$('[data-calendar-format]', toolbar).forEach((button) => button.addEventListener('click', () => { saveCalendarPresentation(surface, { format: button.dataset.calendarFormat }); if (surface !== 'work') state.calendarDisplay = 'month'; rerender(); }));
  const size = $('[data-calendar-size]', toolbar);
  const resize = (zoom) => {
    const next = saveCalendarPresentation(surface, { zoom });
    root.style.setProperty('--calendar-scale', next.zoom / 100);
    size.value = String(next.zoom);
    syncCustomSelect(size);
  };
  size.addEventListener('change', () => resize(Number(size.value)));
  root.addEventListener('wheel', (event) => {
    if (!event.ctrlKey || event.target.closest('[data-calendar-scalable]') !== root) return;
    event.preventDefault(); event.stopPropagation();
    resize(calendarPresentation(surface).zoom + (event.deltaY < 0 ? 10 : -10));
  }, { passive: false });
  $('[data-calendar-expand]', toolbar).addEventListener('click', () => { state.calendarExpanded = state.calendarExpanded === surface ? '' : surface; rerender(); });
}

function calendarTimeState(key, today = localDateKey(new Date())) {
  return key < today ? 'elapsed' : key === today ? 'current' : 'future';
}

function calendarCircle(key, entries, attribute = 'data-time-map-day', selected = '') {
  const timeState = calendarTimeState(key);
  const date = dateFromKey(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  const label = `${date}: ${({ elapsed: 'прошедший день', current: 'сегодня', future: 'впереди' })[timeState]}; записей: ${entries.length}`;
  return `<button type="button" class="calendar-circle ${timeState} ${selected === key ? 'selected' : ''} ${entries.length ? 'has-work' : ''}" ${attribute}="${key}" data-calendar-drop-date="${key}" aria-label="${escapeHTML(label)}" title="${escapeHTML(label)}" ${timeState === 'current' ? 'aria-current="date"' : ''}><span>${Number(key.slice(-2))}</span>${entries.length ? `<small>${entries.length}</small>` : ''}</button>`;
}

function calendarTimeLegend() {
  return '<div class="time-map-legend"><span><i class="elapsed"></i>Прошло</span><span><i class="current"></i>Сегодня</span><span><i></i>Впереди</span></div>';
}

function renderWorkTimeMap(records, dueMap) {
  const cycle = state.activePlanningCycle;
  let groups = [], heading = '';
  if (state.calendarMode === 'cycle') {
    if (!cycle) return renderCycleSetup();
    heading = renderCycleSummary(cycle, records);
    groups = Array.from({ length: 12 }, (_, index) => ({ label: `Неделя ${index + 1}`, tone: `quarter-${Math.floor(index / 3) + 1}`, days: Array.from({ length: 7 }, (_, day) => localDateKey(addCalendarDays(cycle.startDate, index * 7 + day))) }));
  } else {
    const year = Number(state.calendarYear) || new Date().getFullYear();
    const months = state.calendarMode === 'year' ? Array.from({ length: 12 }, (_, index) => new Date(year, index, 1, 12)) : [dateFromKey(state.workCalendarMonth || localDateKey(new Date()))];
    groups = months.map((month) => ({ label: month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' }), tone: quarterClass(month), days: Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, index) => localDateKey(new Date(month.getFullYear(), month.getMonth(), index + 1, 12))) }));
    heading = `<div class="calendar-period-nav"><button type="button" class="icon-button" data-calendar-shift="-1" aria-label="Предыдущий период">${icon('arrowLeft')}</button><h2>${state.calendarMode === 'year' ? `${year} год` : groups[0].label}</h2><button type="button" class="icon-button" data-calendar-shift="1" aria-label="Следующий период">${icon('chevronRight')}</button></div>`;
  }
  const days = groups.flatMap((group) => group.days), passed = days.filter((key) => calendarTimeState(key) === 'elapsed').length;
  const score = calendarScore(records, days[0], days[days.length - 1]);
  return `${heading}<div class="time-map-summary"><span>Время: <strong>${passed} из ${days.length} дней прошло</strong></span><span>Работа: <strong>${score.completed} из ${score.planned} завершено</strong></span></div>${calendarTimeLegend()}<div class="calendar-time-map">${groups.map((group) => `<section class="time-map-group ${group.tone}"><h3>${escapeHTML(group.label)}</h3><div class="time-map-days">${group.days.map((key) => calendarCircle(key, dueMap.get(key) || [])).join('')}</div></section>`).join('')}</div>`;
}

function openCalendarDay(date) {
  openDayWorkspace(date, 'project');
}

function renderCycleSetup() {
  const start = localDateKey(new Date());
  const month = dateFromKey(start).toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' });
  return `<section class="cycle-empty"><span>${icon('calendar')}</span><div><p class="eyebrow">Первый цикл</p><h2>Соберите ближайшие 12 недель в один план</h2><p>Выберите фактический первый день. Сроки существующих карточек автоматически попадут в соответствующие недели.</p></div><form data-cycle-create class="cycle-form"><label>Название<input name="title" maxlength="120" required value="12 недель · ${escapeHTML(month)}"></label><label>Первый день<input name="startDate" type="date" required value="${start}"><small>Недели будут отсчитываться от выбранной даты.</small></label><button type="submit" class="primary">${icon('plus')} Начать цикл</button></form></section>`;
}

function renderCycleSummary(cycle, records) {
  const todayKey = localDateKey(new Date());
  const score = calendarScore(records, cycle.startDate, cycle.endDate);
  const start = dateFromKey(cycle.startDate);
  const end = dateFromKey(cycle.endDate);
  const daysLeft = Math.max(0, Math.ceil((end - dateFromKey(todayKey)) / 86400000) + 1);
  const currentWeek = todayKey < cycle.startDate ? 0 : todayKey > cycle.endDate ? 12 : Math.floor((dateFromKey(todayKey) - start) / 604800000) + 1;
  return `<section class="cycle-summary"><div><p class="eyebrow">Активный 12-недельный год</p><h2>${escapeHTML(cycle.title)}</h2><p>${escapeHTML(start.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }))} — ${escapeHTML(end.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }))} · ${currentWeek ? `неделя ${currentWeek} из 12` : 'старт ещё впереди'}</p></div><div class="cycle-metrics"><span><strong>${daysLeft}</strong><small>дней осталось</small></span><span class="score-${score.planned && score.percent >= 80 ? 'good' : 'attention'}"><strong>${score.planned ? `${score.percent}%` : '—'}</strong><small>${score.completed} из ${score.planned} выполнено</small></span></div><details class="cycle-settings"><summary class="secondary">${icon('settings')} Настроить</summary><div><form data-cycle-update data-cycle-id="${cycle.id}"><label>Название<input name="title" maxlength="120" required value="${escapeHTML(cycle.title)}"></label><label>Первый день<input name="startDate" type="date" required value="${cycle.startDate}"></label><label>Причина изменения<input name="reason" placeholder="Нужна, если меняются даты"></label><button type="submit" class="secondary">Сохранить</button></form><button type="button" class="text-button danger" data-cycle-complete="${cycle.id}">Завершить цикл</button><hr><form data-cycle-create><strong>Начать новый цикл после недели анализа</strong><label>Название<input name="title" maxlength="120" required value="Следующие 12 недель"></label><label>Первый день<input name="startDate" type="date" required value="${localDateKey(addCalendarDays(cycle.reviewWeekStart, 7))}"></label><label>Почему меняем цикл<input name="reason" value="Текущий цикл завершён и проанализирован, начинается следующий"></label><button type="submit" class="primary">Начать новый</button></form></div></details></section>`;
}

function renderTwelveWeekCalendar(records, dueMap) {
  const cycle = state.activePlanningCycle;
  if (!cycle) return renderCycleSetup();
  const start = dateFromKey(cycle.startDate);
  const todayKey = localDateKey(new Date());
  const weeks = Array.from({ length: 12 }, (_, weekIndex) => {
    const weekStart = addCalendarDays(start, weekIndex * 7);
    const weekEnd = addCalendarDays(weekStart, 6);
    const startKey = localDateKey(weekStart);
    const endKey = localDateKey(weekEnd);
    const score = calendarScore(records, startKey, endKey);
    const current = todayKey >= startKey && todayKey <= endKey;
    const phase = Math.floor(weekIndex / 3) + 1;
    const days = Array.from({ length: 7 }, (_, dayIndex) => addCalendarDays(weekStart, dayIndex));
    return `<section class="cycle-week quarter-${phase} ${current ? 'current' : ''}"><header><div><span>Неделя ${weekIndex + 1}</span><strong>${weekStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })} — ${weekEnd.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' })}</strong></div><div class="week-score score-${score.planned && score.percent >= 80 ? 'good' : 'attention'}"><strong>${score.planned ? `${score.percent}%` : 'Без плана'}</strong><small>${score.completed}/${score.planned} · цель 80%</small></div></header><div class="cycle-days">${days.map((day) => {
      const key = localDateKey(day); const items = dueMap.get(key) || []; const past = key < todayKey; const today = key === todayKey;
      return `<div class="cycle-day ${past ? 'past' : ''} ${today ? 'today' : ''}" data-calendar-drop-date="${key}"><header><button type="button" class="calendar-open-day" data-calendar-open="${key}" aria-label="Открыть день ${key}">${day.toLocaleDateString('ru-RU', { weekday: 'short' })} ${day.getDate()}</button><button type="button" data-calendar-create="${key}" aria-label="Создать задачу на этот день">${icon('plus')}</button></header><div>${items.slice(0, 4).map((record) => calendarTaskChip(record, true)).join('')}${items.length > 4 ? `<small>Ещё ${items.length - 4}</small>` : ''}</div></div>`;
    }).join('')}</div></section>`;
  });
  return `${renderCycleSummary(cycle, records)}<div class="cycle-legend"><span><i></i>Прошедшие дни зачёркнуты</span><span>Перетащите активную карточку на другой день, чтобы изменить срок</span></div><div class="twelve-week-grid">${weeks.join('')}</div><div class="review-week"><span>${icon('history')}</span><div><strong>Неделя 13 · обзор и восстановление</strong><p>С ${dateFromKey(cycle.reviewWeekStart).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}: подведите итоги, перенесите только осознанно выбранную работу и сформируйте следующий цикл.</p></div></div>`;
}

function renderYearCalendar(records, dueMap) {
  const year = Number(state.calendarYear) || new Date().getFullYear();
  const todayKey = localDateKey(new Date());
  const months = Array.from({ length: 12 }, (_, monthIndex) => {
    const month = new Date(year, monthIndex, 1, 12);
    const offset = (month.getDay() + 6) % 7;
    const count = new Date(year, monthIndex + 1, 0).getDate();
    const cells = Array.from({ length: offset }, () => '<span class="year-day empty"></span>');
    for (let dayNumber = 1; dayNumber <= count; dayNumber += 1) {
      const day = new Date(year, monthIndex, dayNumber, 12); const key = localDateKey(day); const items = dueMap.get(key) || [];
      cells.push(`<button type="button" class="year-day ${key < todayKey ? 'past' : ''} ${key === todayKey ? 'today' : ''} ${items.length ? 'has-work' : ''}" data-calendar-day="${key}" title="${items.length ? `${items.length} ${recordsCountLabel(items.length).replace(/^\d+\s*/, '')}` : 'Открыть день'}"><span>${dayNumber}</span>${items.length ? `<i>${items.length}</i>` : ''}</button>`);
    }
    return `<section class="year-month ${quarterClass(month)}"><header><strong>${month.toLocaleDateString('ru-RU', { month: 'long' })}</strong><span>${[...dueMap.entries()].filter(([key]) => key.startsWith(`${year}-${String(monthIndex + 1).padStart(2, '0')}`)).reduce((sum, [, items]) => sum + items.length, 0)}</span></header><div class="year-weekdays">${['П','В','С','Ч','П','С','В'].map((day) => `<span>${day}</span>`).join('')}</div><div class="year-days">${cells.join('')}</div></section>`;
  });
  return `<div class="calendar-period-nav"><button type="button" class="icon-button" data-calendar-shift="-1" aria-label="Предыдущий год">‹</button><h2>${year} год</h2><button type="button" class="icon-button" data-calendar-shift="1" aria-label="Следующий год">›</button></div><div class="year-quarter-legend"><span class="quarter-1">Январь — март</span><span class="quarter-2">Апрель — июнь</span><span class="quarter-3">Июль — сентябрь</span><span class="quarter-4">Октябрь — декабрь</span></div><div class="year-calendar">${months.join('')}</div>`;
}

function renderMonthCalendar(records, dueMap) {
  const month = state.workCalendarMonth ? dateFromKey(state.workCalendarMonth) : new Date();
  month.setDate(1);
  state.workCalendarMonth = localDateKey(month);
  const start = new Date(month);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  const todayKey = localDateKey(new Date());
  const days = Array.from({ length: 42 }, (_, index) => addCalendarDays(start, index));
  const agendaGroups = [...dueMap.entries()].filter(([key]) => { const day = dateFromKey(key); return day.getMonth() === month.getMonth() && day.getFullYear() === month.getFullYear(); }).sort(([left], [right]) => left.localeCompare(right));
  return `<div class="calendar-period-nav"><button type="button" class="icon-button" data-calendar-shift="-1" aria-label="Предыдущий месяц">‹</button><h2>${month.toLocaleDateString('ru-RU', { month: 'long', year: 'numeric' })}</h2><button type="button" class="icon-button" data-calendar-shift="1" aria-label="Следующий месяц">›</button></div><div class="calendar-weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map((day) => `<span>${day}</span>`).join('')}</div><div class="calendar-grid">${days.map((day) => {
    const key = localDateKey(day); const items = dueMap.get(key) || []; const outside = day.getMonth() !== month.getMonth();
    return `<div class="calendar-day ${outside ? 'outside' : ''} ${key < todayKey ? 'past' : ''} ${key === todayKey ? 'today' : ''} ${quarterClass(day)}" data-calendar-drop-date="${key}"><header><button type="button" class="calendar-open-day" data-calendar-open="${key}" aria-label="Открыть день ${key}">${day.getDate()}</button><button type="button" data-calendar-create="${key}" aria-label="Создать задачу на этот день">${icon('plus')}</button></header><div>${items.slice(0, 4).map((record) => calendarTaskChip(record)).join('')}${items.length > 4 ? `<small>+ ещё ${items.length - 4}</small>` : ''}</div></div>`;
  }).join('')}</div><div class="calendar-agenda">${agendaGroups.length ? agendaGroups.map(([key, items]) => {
    const day = dateFromKey(key);
    return `<section class="calendar-agenda-day"><header><strong>${key === todayKey ? 'Сегодня' : escapeHTML(day.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</strong><span>${items.length}</span></header><div>${items.map((record) => `<button type="button" data-open-record="${record.id}" class="calendar-agenda-item priority-${record.priority || 'normal'}"><span class="type-icon type-${record.type}">${icon(typeMeta[record.type].icon)}</span><span><small>${escapeHTML(typeMeta[record.type].singular)} · ${escapeHTML(new Date(record.dueAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }))}</small><strong>${escapeHTML(record.title)}</strong><em>${escapeHTML(record.ownerUsername)}</em></span>${icon('chevronRight')}</button>`).join('')}</div></section>`;
  }).join('') : `<div class="guided-empty calendar-agenda-empty">${icon('calendar')}<h3>В этом месяце сроков нет</h3><p>Создайте работу на нужный день или назначьте срок существующей карточке.</p></div>`}</div>`;
}

function renderUnscheduledWork(records) {
  const unscheduled = records.filter((record) => !record.dueAt && isActiveRecord(record)).sort(sortWorkRecords);
  if (!unscheduled.length) return '';
  return `<details class="calendar-unscheduled"><summary><span>${icon('inbox')} Без срока</span><b>${unscheduled.length}</b><small>Перетащите карточку на день</small></summary><div>${unscheduled.slice(0, 12).map((record) => calendarTaskChip(record, true)).join('')}${unscheduled.length > 12 ? `<p>Ещё ${unscheduled.length - 12} — уточните фильтр очереди.</p>` : ''}</div></details>`;
}

function renderWorkCalendar() {
  const records = calendarRecordPool();
  const dueMap = recordsByDueDate(records);
  const body = calendarPresentation('work').format === 'circles' ? renderWorkTimeMap(records, dueMap) : state.calendarMode === 'year' ? renderYearCalendar(records, dueMap) : state.calendarMode === 'month' ? renderMonthCalendar(records, dueMap) : renderTwelveWeekCalendar(records, dueMap);
  return `<section class="work-calendar ${calendarSurfaceClass('work')}"><header class="calendar-commandbar">${calendarModeToolbar()}${calendarPresentationToolbar('work')}</header>${renderUnscheduledWork(records)}<div class="calendar-viewport">${body}</div></section>`;
}

function validCycleDate(value) {
  const date = dateFromKey(value);
  return Boolean(value) && !Number.isNaN(date.getTime()) && localDateKey(date) === value;
}

async function refreshPlanningCycles(payload = null) {
  const planning = payload || await api('/api/planning/cycles');
  state.planningCycles = planning.cycles || [];
  state.activePlanningCycle = planning.active || null;
}

async function submitPlanningCycle(form, cycleID = '') {
  const data = new FormData(form);
  const startDate = String(data.get('startDate') || '');
  if (!validCycleDate(startDate)) {
    toast('Выберите существующую дату начала цикла', true);
    form.elements.startDate?.focus();
    return;
  }
  const body = { title: String(data.get('title') || '').trim(), startDate, reason: String(data.get('reason') || '').trim() };
  if (cycleID) body.expectedUpdatedAt = state.planningCycles.find((cycle) => cycle.id === cycleID)?.updatedAt || '';
  try {
    const planning = await api(cycleID ? `/api/planning/cycles/${cycleID}` : '/api/planning/cycles', { method: cycleID ? 'PATCH' : 'POST', body: JSON.stringify(body) });
    await refreshPlanningCycles(planning);
    renderWorkList();
    toast(cycleID ? 'Настройки цикла сохранены' : 'Новый 12-недельный цикл начат');
  } catch (error) { toast(error.message, true); }
}

async function rescheduleCalendarRecord(recordID, dateKey) {
  const record = state.records.find((item) => item.id === recordID);
  if (!record || !isActiveRecord(record)) return;
  if (record.dueAt && localDateKey(record.dueAt) === dateKey) return;
  const previous = record.dueAt ? new Date(record.dueAt) : null;
  const due = dateFromKey(dateKey);
  due.setHours(previous ? previous.getHours() : 18, previous ? previous.getMinutes() : 0, 0, 0);
  try {
    await api(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ dueAt: due.toISOString(), reason: `Срок перенесён в календаре на ${due.toLocaleDateString('ru-RU')}`, expectedUpdatedAt: record.updatedAt }) });
    await syncProjectChanges();
    renderWorkList();
    toast(`Срок «${record.title}» перенесён на ${due.toLocaleDateString('ru-RU')}`);
  } catch (error) { toast(error.message, true); }
}

function bindCalendarDnD() {
  let recordID = '';
  $$('[data-calendar-record]').forEach((item) => {
    item.addEventListener('dragstart', (event) => {
      if (item.getAttribute('draggable') !== 'true') { event.preventDefault(); return; }
      recordID = item.dataset.calendarRecord;
      item.classList.add('dragging');
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', recordID);
    });
    item.addEventListener('dragend', () => { item.classList.remove('dragging'); $$('[data-calendar-drop-date]').forEach((day) => day.classList.remove('drop-target')); recordID = ''; });
  });
  $$('[data-calendar-drop-date]').forEach((day) => {
    day.addEventListener('dragover', (event) => { if (!recordID) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; day.classList.add('drop-target'); });
    day.addEventListener('dragleave', () => day.classList.remove('drop-target'));
    day.addEventListener('drop', (event) => { event.preventDefault(); day.classList.remove('drop-target'); const id = recordID || event.dataTransfer.getData('text/plain'); if (id) rescheduleCalendarRecord(id, day.dataset.calendarDropDate); });
  });
}

function bindCalendarControls() {
  const surface = $('.work-calendar');
  if (surface) bindCalendarPresentation('work', surface, renderWorkList);
  $$('[data-calendar-open]').forEach(button=>button.addEventListener('click',()=>openCalendarDay(button.dataset.calendarOpen)));
  if (surface) $$('.cycle-day, .calendar-day',surface).forEach(cell=>cell.addEventListener('click',event=>{ if(!event.target.closest('button, a, input')) openCalendarDay(cell.dataset.calendarDropDate); }));
  $$('[data-time-map-day]').forEach((button) => button.addEventListener('click', () => openCalendarDay(button.dataset.timeMapDay)));
  $$('[data-calendar-mode]').forEach((button) => button.addEventListener('click', () => { state.calendarMode = button.dataset.calendarMode; renderWorkList(); }));
  $$('[data-calendar-shift]').forEach((button) => button.addEventListener('click', () => {
    const shift = Number(button.dataset.calendarShift);
    if (state.calendarMode === 'year') state.calendarYear += shift;
    else { const month = state.workCalendarMonth ? dateFromKey(state.workCalendarMonth) : new Date(); month.setMonth(month.getMonth() + shift); state.workCalendarMonth = localDateKey(month); }
    renderWorkList();
  }));
  $$('[data-calendar-day]').forEach((button) => button.addEventListener('click', () => openCalendarDay(button.dataset.calendarDay)));
  $$('[data-calendar-create]').forEach((button) => button.addEventListener('click', (event) => { event.stopPropagation(); openCreateDialog('task', { dueAt: `${button.dataset.calendarCreate}T18:00` }); }));
  $$('[data-cycle-create]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); submitPlanningCycle(form); }));
  $$('[data-cycle-update]').forEach((form) => form.addEventListener('submit', (event) => { event.preventDefault(); submitPlanningCycle(form, form.dataset.cycleId); }));
  $$('[data-cycle-complete]').forEach((button) => button.addEventListener('click', async () => {
    const cycle = state.planningCycles.find((item) => item.id === button.dataset.cycleComplete); if (!cycle) return;
    const reason = await askText({ title: 'Завершить 12-недельный цикл', label: 'Каким итогом завершается цикл?', defaultValue: '12 недель завершены, результаты зафиксированы', required: true });
    if (!reason) return;
    try {
      const planning = await api(`/api/planning/cycles/${cycle.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', reason, expectedUpdatedAt: cycle.updatedAt }) });
      await refreshPlanningCycles(planning); renderWorkList(); toast('Цикл завершён и сохранён в истории');
    } catch (error) { toast(error.message, true); }
  }));
  bindCalendarDnD();
}

function currentWorkWindow() {
  const scope = `${state.me?.id || ''}:${state.activeWorkspaceId || ''}`;
  const filters = state.view === 'collections'
    ? [state.activeCollectionId, state.collectionSearch, state.collectionOwnerFilter, state.collectionFieldFilters]
    : [state.workViewMode, state.workCollection, state.workScope, state.ownerFilter, state.workType, state.workstreamFilter, state.workStatus, state.workOrder, state.search];
  const key = JSON.stringify([scope, state.view, filters]);
  if (state.workWindow?.key !== key) {
    const size = state.workWindow?.scope === scope ? state.workWindow.size : 25;
    state.workWindow = { key, scope, page: 1, size, limits: {}, scroll: {} };
  }
  return state.workWindow;
}

function workPage(records) {
  const window = currentWorkWindow();
  const pages = Math.max(1, Math.ceil(records.length / window.size));
  window.page = Math.min(pages, Math.max(1, window.page));
  const offset = (window.page - 1) * window.size;
  return { items: records.slice(offset, offset + window.size), pages, page: window.page, size: window.size, from: records.length ? offset + 1 : 0, to: Math.min(records.length, offset + window.size), total: records.length };
}

function renderWorkPagination(page) {
  return `<nav class="work-pagination" aria-label="Страницы работы"><span role="status">${page.from}–${page.to} из ${page.total}</span><label>На странице<select data-work-page-size>${[10,25,50].map(size => `<option value="${size}" ${size === page.size ? 'selected' : ''}>${size}</option>`).join('')}</select></label><div class="work-page-navigation"><button type="button" class="icon-button" data-work-page="${page.page - 1}" aria-label="Предыдущая страница" ${page.page === 1 ? 'disabled' : ''}>${icon('chevronLeft')}</button><form data-work-page-jump><label>Страница <input type="number" name="page" min="1" max="${page.pages}" value="${page.page}" aria-label="Номер страницы" required> из ${page.pages}</label><button type="submit" class="text-button">Перейти</button></form><button type="button" class="icon-button" data-work-page="${page.page + 1}" aria-label="Следующая страница" ${page.page === page.pages ? 'disabled' : ''}>${icon('chevronRight')}</button></div></nav>`;
}

function boardWindow(items, key) {
  const limit = currentWorkWindow().limits[key] || 20;
  return { items: items.slice(0, limit), remaining: Math.max(0, items.length - limit), count: Math.min(limit, items.length), total: items.length };
}

function renderBoardMore(page, key) {
  return page.remaining ? `<button type="button" class="secondary board-show-more" data-board-more="${key}">Показать ещё ${Math.min(20, page.remaining)}<small>${page.count} из ${page.total}</small></button>` : '';
}

function rememberWorkScroll() {
  const root = $('#main-content'), window = currentWorkWindow();
  if (root.dataset.workWindowKey !== window.key) return;
  $$('[data-work-scroll]', root).forEach(node => { window.scroll[node.dataset.workScroll] = [node.scrollLeft, node.scrollTop]; });
}

function bindWorkWindow(rerender) {
  const root = $('#main-content'), window = currentWorkWindow();
  root.dataset.workWindowKey = window.key;
  $$('[data-work-scroll]', root).forEach(node => {
    const position = window.scroll[node.dataset.workScroll];
    if (position) { node.scrollLeft = position[0]; node.scrollTop = position[1]; }
  });
  // The page layout observer can reparent blocks after this render.
  requestAnimationFrame(() => {
    if (state.workWindow !== window || root.dataset.workWindowKey !== window.key) return;
    $$('[data-work-scroll]', root).forEach(node => {
      const position = window.scroll[node.dataset.workScroll];
      if (position) { node.scrollLeft = position[0]; node.scrollTop = position[1]; }
    });
  });
  const go = page => {
    window.page = page;
    rerender();
    window.scroll.list = [0, 0];
    const list = $('[data-work-scroll="list"]', root); if (list) list.scrollTop = 0;
    $('[name="page"]', root)?.focus();
  };
  $$('[data-work-page]', root).forEach(button => button.addEventListener('click', () => go(Number(button.dataset.workPage))));
  $('[data-work-page-jump]', root)?.addEventListener('submit', event => { event.preventDefault(); go(Number(event.currentTarget.elements.page.value)); });
  $('[data-work-page-size]', root)?.addEventListener('change', event => {
    const size = Number(event.target.value); if (![10,25,50].includes(size)) return;
    window.size = size; go(1);
  });
  $$('[data-board-more]', root).forEach(button => button.addEventListener('click', () => {
    const key = button.dataset.boardMore;
    window.limits[key] = (window.limits[key] || 20) + 20;
    rerender();
    const next = $(`[data-board-more="${CSS.escape(key)}"]`, root);
    (next || $(`[data-work-scroll="${CSS.escape(key)}"]`, root))?.focus({preventScroll:true});
  }));
}


function renderWorkBody(records) {
  const collection = state.collections.find((item) => item.id === state.workCollection);
  if (state.workViewMode === 'kanban' && collection) return renderWorkCollectionBoard(records, collection);
  if (state.workViewMode === 'kanban') return renderWorkKanban(records);
  if (state.workViewMode === 'calendar') return renderWorkCalendar(records);
  const page = workPage(records);
  return `<section class="table-panel work-table-panel"><div class="record-table work-header"><span>Работа</span><span>Ответственный</span><span>Состояние</span><span>Срок / прогресс</span></div><div class="record-rows" data-work-scroll="list" tabindex="0" aria-label="Записи текущей страницы">${page.items.map(renderWorkRow).join('') || `<div class="guided-empty work-empty">${icon('checkSquare')}<h3>В этом фильтре работы нет</h3><p>Измените фильтр или создайте следующий конкретный шаг.</p></div>`}</div>${renderWorkPagination(page)}</section>`;
}

function currentWorkViewPayload() {
  return {
    name: '', viewMode: state.workViewMode === 'list' && state.workOrder === 'hierarchy' ? 'hierarchy' : state.workViewMode,
    filters: { scope: state.workScope, ownerId: state.ownerFilter, type: state.workType, workstream: state.workstreamFilter, status: state.workStatus, order: state.workOrder, search: state.search, collectionId: state.workCollection || '' },
  };
}

const bulkWorkUI = createBulkWorkUI({ state, api, escapeHTML, icon, renderWorkList, renderCollections, currentWorkWindow, savedPageLayout, captureProjectContext, isProjectContextCurrent, syncProjectChanges, openModal, closeDialog: requestDialogClose, enhanceSelects, toast, priorityLabels, workstreamLabels, statusLabels });

function renderWorkList() {
  normalizeWorkScope();
  if (!state.collections.some((item) => item.id === state.workCollection)) state.workCollection = '';
  const records = state.workViewMode === 'calendar' ? calendarRecordPool() : filteredWorkRecords();
  const activeFilters = workFilterCount();
  rememberWorkScroll();
  $('#main-content').innerHTML = `
    <div class="work-title-row"><div><p class="eyebrow">Единая очередь</p><h1>Работа команды</h1><p><strong>${records.length}</strong> ${recordsCountLabel(records.length).replace(/^\d+\s*/, '')} в текущем представлении</p></div><details class="work-create-menu"><summary class="primary">${icon('plus')} Создать работу</summary><div>${[['inbox', 'Входящее'], ['task', 'Задача'], ['question_set', 'Вопросы'], ['meeting', 'Встреча'], ['research', 'Сравнение вариантов'], ['experiment', 'Эксперимент']].map(([type, label]) => `<button type="button" data-work-create="${type}" ${type === 'research' ? 'data-work-mode="comparison"' : ''}>${icon(typeMeta[type].icon)}<span>${label}</span></button>`).join('')}</div></details></div>
    <section class="work-controls" aria-label="Фильтры рабочей очереди">
      <div class="work-scope segmented compact" role="group" aria-label="Чья работа">${workScopeOptions().map(([value, label]) => `<button type="button" class="segment ${!state.ownerFilter && state.workScope === value ? 'active' : ''}" aria-pressed="${!state.ownerFilter && state.workScope === value}" aria-label="${value === 'partner' ? 'Работа других участников' : `${label} работа`}" data-work-scope="${value}">${label}</button>`).join('')}</div>
      <div class="search-box work-search">${icon('search')}<input id="work-search" type="search" aria-label="Поиск в очереди работы" placeholder="Найти в этой очереди" value="${escapeHTML(state.search)}"></div>
		<div class="work-view-switch segmented compact" aria-label="Вид очереди">${[['list','menu','Список'],['kanban','network','Доска'],['calendar','calendar','Календарь']].map(([value, iconName, label]) => `<button type="button" class="segment ${state.workViewMode === value ? 'active' : ''}" data-work-view="${value}" title="${label}" aria-label="${label}">${icon(iconName)}<span>${label}</span></button>`).join('')}</div>
      <details class="work-filter-menu"><summary class="secondary">${icon('sliders')} Фильтры${activeFilters ? `<b>${activeFilters}</b>` : ''}</summary><button type="button" class="work-filter-backdrop" data-close-work-filters aria-label="Закрыть фильтры"></button><div class="work-filter-popover">
        <header><strong>Представление очереди</strong><button type="button" class="icon-button" data-close-work-filters aria-label="Закрыть фильтры">${icon('x')}</button></header>
        <label>Ответственный<select id="work-owner-select"><option value="">Все участники</option>${userOptions(state.ownerFilter)}</select></label>
        <label>Состояние<select id="work-status-select">${[['active', 'Активная работа'], ['overdue', 'Только просроченная'], ['completed', 'Выполненная'], ['archived', 'Архив'], ['all', 'Все состояния']].map(([value, label]) => `<option value="${value}" ${state.workStatus === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
        <label>Тип работы<select id="work-type-select">${workTypeFilters.map(([value, label]) => `<option value="${value}" ${state.workType === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
        <label>Направление<select id="workstream-select">${[['all', 'Все направления'], ...Object.entries(workstreamLabels)].map(([value, label]) => `<option value="${value}" ${state.workstreamFilter === value ? 'selected' : ''}>${escapeHTML(label)}</option>`).join('')}</select></label>
        <fieldset><legend>Порядок</legend><div class="segmented compact"><button type="button" class="segment ${state.workOrder === 'priority' ? 'active' : ''}" data-work-order="priority">По приоритету</button><button type="button" class="segment ${state.workOrder === 'hierarchy' ? 'active' : ''}" data-work-order="hierarchy">По иерархии</button></div></fieldset>
        <button type="button" class="text-button work-filter-reset" data-reset-work-filters>Сбросить дополнительные фильтры</button>
      </div></details>
    </section>
    <div class="work-view-summary"><span>${icon(state.workViewMode === 'calendar' ? 'calendar' : state.workViewMode === 'kanban' ? 'network' : state.workOrder === 'hierarchy' ? 'network' : 'flag')} ${state.workViewMode === 'calendar' ? 'Работа по срокам' : state.workViewMode === 'kanban' ? 'Работа по состояниям' : state.workOrder === 'hierarchy' ? 'Ветки и дочерние работы' : 'Сначала срочное и важное'}</span><span>${escapeHTML(workTypeFilters.find(([value]) => value === state.workType)?.[1] || 'Вся работа')} · ${escapeHTML(state.workstreamFilter === 'all' ? 'все направления' : workstreamLabels[state.workstreamFilter])}</span><details class="saved-view-menu"><summary class="text-button">Представления</summary><div>${state.savedViews.map((view) => `<span><button type="button" data-apply-saved-view="${view.id}">${escapeHTML(view.name)}</button><button type="button" data-delete-saved-view="${view.id}" aria-label="Удалить">${icon('x')}</button></span>`).join('') || '<p>Сохранённых представлений нет</p>'}<button type="button" data-save-work-view>${icon('plus')} Сохранить текущий вид</button><a href="/api/export?format=csv">Скачать CSV</a><a href="/api/export">Полный JSON</a></div></details></div>
    ${renderWorkBody(records)}`;
  $('.work-controls').insertAdjacentHTML('beforebegin', renderWorkBoardToolbar());
  bindWorkBoardToolbar();
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
  $('#work-owner-select').addEventListener('change', (event) => { state.ownerFilter = event.target.value; state.workScope = 'all'; renderWorkList(); });
  $('#work-type-select').addEventListener('change', (event) => { state.workType = event.target.value; renderWorkList(); });
  $('#workstream-select').addEventListener('change', (event) => { state.workstreamFilter = event.target.value; renderWorkList(); });
  $$('[data-work-order]').forEach((button) => button.addEventListener('click', () => { state.workOrder = button.dataset.workOrder; renderWorkList(); }));
	$$('[data-work-view]').forEach((button) => button.addEventListener('click', () => {
    state.workViewMode = button.dataset.workView;
    if (state.workViewMode === 'calendar' && state.workStatus === 'active') state.workStatus = 'all';
    renderWorkList();
  }));
  $$('[data-close-work-filters]').forEach((button) => button.addEventListener('click', () => $('.work-filter-menu').removeAttribute('open')));
  $('[data-reset-work-filters]')?.addEventListener('click', () => { state.ownerFilter = ''; state.workType = 'all'; state.workstreamFilter = 'all'; state.workStatus = 'active'; state.workOrder = 'priority'; renderWorkList(); });
  $$('[data-work-create]').forEach((button) => button.addEventListener('click', () => {
    state.workCollection = '';
    openCreateDialog(button.dataset.workCreate, { comparisonMode: button.dataset.workMode === 'comparison' });
  }));
	$('[data-save-work-view]')?.addEventListener('click', async () => {
		const name = await askText({ title: 'Сохранить представление', label: 'Название', required: true });
		if (!name) return;
		const payload = currentWorkViewPayload(); payload.name = name;
		try { await api('/api/saved-views', { method: 'POST', body: JSON.stringify(payload) }); state.savedViews = await api('/api/saved-views'); renderWorkList(); toast('Представление сохранено'); } catch (error) { toast(error.message, true); }
	});
	$$('[data-apply-saved-view]').forEach((button) => button.addEventListener('click', () => {
		const view = state.savedViews.find((item) => item.id === button.dataset.applySavedView); if (!view) return;
		const filters = typeof view.filters === 'string' ? JSON.parse(view.filters) : view.filters || {};
    state.workCollection = filters.collectionId || '';
		state.workViewMode = view.viewMode === 'hierarchy' ? 'list' : view.viewMode; state.workOrder = view.viewMode === 'hierarchy' ? 'hierarchy' : filters.order || 'priority';
		state.workScope = filters.scope || 'all'; state.ownerFilter = filters.ownerId || ''; state.workType = filters.type || 'all'; state.workstreamFilter = filters.workstream || 'all'; state.workStatus = filters.status || 'active'; state.search = filters.search || ''; renderWorkList();
	}));
	$$('[data-delete-saved-view]').forEach((button) => button.addEventListener('click', async () => { try { await api(`/api/saved-views/${button.dataset.deleteSavedView}`, { method: 'DELETE' }); state.savedViews = state.savedViews.filter((item) => item.id !== button.dataset.deleteSavedView); renderWorkList(); toast('Представление удалено'); } catch (error) { toast(error.message, true); } }));
	if (state.workViewMode === 'kanban') {
    const collection = state.collections.find((item) => item.id === state.workCollection);
    if (collection) {
      bindCollectionBoard(collection, renderWorkList);
      $$('[data-create-at-stage]').forEach((button) => button.addEventListener('click', () => openCollectionCardDialog(collection, null, button.dataset.createAtStage)));
    } else bindBoardDnD(renderWorkList);
  }
  if (state.workViewMode === 'calendar') bindCalendarControls();
  if (state.workViewMode !== 'kanban' || !state.workCollection) bindOpenRecords();
  bindWorkWindow(renderWorkList);
  bulkWorkUI.mount();
}

function activeCollection() {
	return state.collections.find((collection) => collection.id === state.activeCollectionId) || null;
}

function renderWorkBoardToolbar() {
  const collection = state.collections.find((item) => item.id === state.workCollection);
  return `<section class="work-board-toolbar"><label>Доска<select data-work-collection><option value="">Вся работа проекта</option>${state.collections.map((item) => `<option value="${item.id}" ${item.id === state.workCollection ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label><label>Состояние<select data-work-visible-status>${[['active', 'Активные'], ['completed', 'Завершённые'], ['all', 'Все'], ['overdue', 'Просроченные'], ['archived', 'Архив']].map(([key, label]) => `<option value="${key}" ${state.workStatus === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>${!collection || canConfigureWorkspace() ? `<button type="button" class="secondary" data-work-board-settings>${icon('settings')} ${collection ? 'Поля и колонки' : 'Настроить вид'}</button>` : ''}${canConfigureWorkspace() ? `<button type="button" class="icon-button" data-work-board-create aria-label="Новая доска" title="Новая доска">${icon('plus')}</button>` : ''}${collection ? `<button type="button" class="secondary" data-work-board-attach>${icon('link')} Добавить существующую</button>` : ''}</section>`;
}

function bindWorkBoardToolbar() {
  $('[data-work-collection]').addEventListener('change', (event) => { state.workCollection = event.target.value; state.workType = 'all'; state.workStatus = 'all'; renderWorkList(); });
  $('[data-work-visible-status]').addEventListener('change', (event) => { state.workStatus = event.target.value; renderWorkList(); });
  $('[data-work-board-create]')?.addEventListener('click', openCollectionCreateDialog);
  $('[data-work-board-settings]')?.addEventListener('click', () => {
    const collection = state.collections.find((item) => item.id === state.workCollection);
    if (collection) openCollectionSettingsDialog(collection);
    else {
      startPageLayoutEditor();
      const options = $('.page-layout-options'); if (options) options.open = true;
    }
  });
  $('[data-work-board-attach]')?.addEventListener('click', () => openExistingCardPicker(state.collections.find((item) => item.id === state.workCollection)));
}

function renderWorkCollectionBoard(records, collection) {
  return `<section class="collection-board" data-work-scroll="board" aria-label="Доска ${escapeHTML(collection.name)}">${collection.stages.map((stage) => {
    const items = records.filter((record) => record.stageId === stage.id || (!record.stageId && stage.id === collection.stages[0]?.id));
    const page = boardWindow(items, stage.id);
    return `<section class="collection-column tone-${stage.colorKey}" data-collection-drop="${stage.id}"><header><div><i></i><strong title="${escapeHTML(stage.name)}">${escapeHTML(stage.name)}</strong></div><span>${items.length}</span></header><div class="board-column-scroll" data-work-scroll="${stage.id}" tabindex="0" aria-label="Карточки: ${escapeHTML(stage.name)}">${page.items.map((record) => renderCollectionCard(record, collection)).join('') || '<p class="collection-column-empty">Перетащите карточку сюда</p>'}${renderBoardMore(page, stage.id)}</div><button type="button" class="collection-add-card" data-create-at-stage="${stage.id}">${icon('plus')} Добавить</button></section>`;
  }).join('')}</section>`;
}

function openExistingCardPicker(collection) {
  if (!collection) return;
  const dialog = $('#workspace-dialog'), content = $('#workspace-dialog-content');
  content.innerHTML = `<div class="workspace-editor-shell"><header><h2>Добавить на «${escapeHTML(collection.name)}»</h2><button type="button" class="icon-button" data-attach-close aria-label="Закрыть">${icon('x')}</button></header><label>Найти карточку<input type="search" data-attach-search></label><div data-attach-results></div></div>`;
  const renderItems = () => {
    const query = $('[data-attach-search]', content).value.toLowerCase();
    const records = state.records.filter((item) => !item.collectionId && item.status !== 'archived' && (item.editPolicy !== 'owner_only' || [item.ownerId, item.authorId].includes(state.me.id)) && item.title.toLowerCase().includes(query));
    $('[data-attach-results]', content).innerHTML = records.map((item) => `<button type="button" class="planner-entry" data-attach-record="${item.id}"><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(typeMeta[item.type].singular)} · ${escapeHTML(statusLabel(item))}</small></span>${icon('plus')}</button>`).join('') || '<p class="muted">Нет подходящих карточек без доски</p>';
    $$('[data-attach-record]', content).forEach((button) => button.addEventListener('click', () => openAssignRecordBoard(state.records.find((item) => item.id === button.dataset.attachRecord), collection.id)));
  };
  $('[data-attach-search]', content).addEventListener('input', renderItems);
  $('[data-attach-close]', content).addEventListener('click', () => requestDialogClose(dialog));
  renderItems(); openModal(dialog);
}

function openAssignRecordBoard(record, collectionID = '') {
  if (!record) return;
  const context = captureProjectContext();
  if (!state.collections.length) return openCollectionCreateDialog({ afterCreate: (created) => {
    if (isProjectContextCurrent(context)) openAssignRecordBoard(record, created.id);
  } });
  const dialog = $('#workspace-dialog'), content = $('#workspace-dialog-content');
  content.innerHTML = `<div class="workspace-editor-shell"><header><h2>Добавить на доску</h2><button type="button" class="icon-button" data-assign-close aria-label="Закрыть">${icon('x')}</button></header><p>${escapeHTML(record.title)}</p><p class="muted">Тип карточки, состояние и история сохранятся.</p><form id="assign-record-board"><label>Доска<select name="collectionId">${state.collections.map((item) => `<option value="${item.id}" ${item.id === collectionID ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label><label>Этап на доске<select name="stageId"></select></label><div class="form-grid two" data-assign-fields></div><button type="submit" class="primary">${icon('check')} Добавить на доску</button></form></div>`;
  const form = $('#assign-record-board', content);
  const selected = () => state.collections.find((item) => item.id === form.elements.collectionId.value);
  const renderFields = () => {
    const category = record.status === 'completed' ? 'done' : record.status === 'review' ? 'review' : ['in_progress', 'blocked'].includes(record.status) ? 'active' : 'backlog';
    const stages = selected().stages;
    const preferred = stages.find(stage => stage.category === category) || stages.find(stage => stage.category !== 'done') || stages[0];
    form.elements.stageId.innerHTML = stages.map(stage => `<option value="${stage.id}" ${stage.id === preferred?.id ? 'selected' : ''}>${escapeHTML(stage.name)}</option>`).join('');
    $('[data-assign-fields]', form).innerHTML = selected().fields.map((field) => collectionFieldInput(field, null)).join(''); enhanceSelects(form);bindCollectionMultiFields(form);
  };
  form.elements.collectionId.addEventListener('change', renderFields);
  $('[data-assign-close]', content).addEventListener('click', () => requestDialogClose(dialog));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = $('button[type="submit"]', form);
    if (button.disabled || !isProjectContextCurrent(context)) return;
    button.disabled = true;
    try {
      await api(`/api/records/${record.id}/collection`, { method: 'PUT', headers: { 'X-Workspace-ID': context.workspace }, body: JSON.stringify({ collectionId: selected().id, stageId: form.elements.stageId.value, values: customFieldsFromForm(form, selected().fields), expectedUpdatedAt: record.updatedAt }) });
      if (!isProjectContextCurrent(context)) return;
      state.detailCache.delete(record.id); await syncProjectChanges();
      if (!isProjectContextCurrent(context)) return;
      if (form.isConnected) closeDialogImmediately(dialog);
      if ($('#record-dialog').open && state.activeDetail?.record.id === record.id) {
        const detail = await fetchRecordDetail(record.id, true);
        if (!isProjectContextCurrent(context)) return;
        if ($('#record-dialog').open && state.activeDetail?.record.id === record.id) { state.activeDetail = detail; renderRecordDialog(); }
      }
      if (state.view === 'work') renderWorkList(); else renderContent();
      toast('Карточка добавлена без изменения состояния');
    } catch (error) { button.disabled = false; toast(error.message, true); }
  });
  renderFields(); openModal(dialog);
}

function collectionRecords(collectionID = state.activeCollectionId) {
	const query = state.collectionSearch.trim().toLowerCase();
  const fieldIDs = new Set((state.collections.find(item => item.id === collectionID)?.fields || []).map(field => field.id));
  Object.keys(state.collectionFieldFilters).forEach(id => { if (!fieldIDs.has(id)) delete state.collectionFieldFilters[id]; });
	return state.records.filter((record) => {
		if (record.collectionId !== collectionID || record.status === 'archived') return false;
		if (query && !`${record.title} ${record.description} ${record.ownerUsername}`.toLowerCase().includes(query)) return false;
		if (state.collectionOwnerFilter && String(record.ownerId) !== state.collectionOwnerFilter) return false;
		return Object.entries(state.collectionFieldFilters).every(([fieldID, expected]) => {
			if (!expected) return true;
			const value = record.customFields?.[fieldID];
			return Array.isArray(value) ? value.includes(expected) : String(value) === expected;
		});
	});
}

function fieldOption(field, id) {
	return field.options?.find((option) => option.id === id) || null;
}

function collectionFieldDisplay(field, value) {
	if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return '';
	if (field.fieldType === 'select') return fieldOption(field, value)?.name || '';
	if (field.fieldType === 'multi_select') return value.map((id) => fieldOption(field, id)?.name).filter(Boolean).join(', ');
	if (field.fieldType === 'user') return state.users.find((user) => user.id === Number(value))?.username || '';
	if (field.fieldType === 'checkbox') return value ? 'Да' : 'Нет';
	if (field.fieldType === 'money') return Number(value).toLocaleString('ru-RU', { maximumFractionDigits: 2 });
	if (field.fieldType === 'date' || field.fieldType === 'datetime') return formatDate(String(value), field.fieldType === 'datetime');
	if (field.fieldType === 'relation') return state.records.find((record) => record.id === value)?.title || 'Связанная карточка';
	return String(value);
}

function renderCollectionCard(record, collection, fields = null) {
  const cardLabel = record.type === (collection.defaultRecordType || 'task') ? collection.cardLabel : typeMeta[record.type]?.singular || 'Карточка';
  const visible = (key) => !fields || fields.includes(key);
  const visibleFields = collection.fields.filter((field) => fields ? fields.includes(`field:${field.id}`) : field.showOnCard).map((field) => ({field, value:collectionFieldDisplay(field,record.customFields?.[field.id])})).filter((item)=>item.value);
  return `<article class="collection-card priority-${record.priority || 'normal'}" draggable="true" data-collection-card="${record.id}"><button type="button" data-open-record="${record.id}"><header><span>${icon(typeMeta[record.type]?.icon || 'fileText')}<small>${escapeHTML(cardLabel)}</small></span><strong>${escapeHTML(record.title)}</strong></header>${visible('description') && record.description ? `<p>${escapeHTML(markdownPlain(record.description).slice(0,150))}</p>` : ''}${visibleFields.length ? `<div class="collection-card-fields">${visibleFields.slice(0,fields?visibleFields.length:4).map(({field,value})=>`<span data-page-field="field:${field.id}" class="field-tone-${field.fieldType === 'select' ? fieldOption(field, record.customFields?.[field.id])?.colorKey || 'neutral' : 'neutral'}"><small>${escapeHTML(field.name)}</small><b>${escapeHTML(value)}</b></span>`).join('')}</div>`:''}${visible('owner') || visible('due') ? `<footer>${visible('owner') ? avatarMarkup(state.users.find((user)=>user.id===record.ownerId)||{username:record.ownerUsername},'tiny'):''}<span>${visible('owner')?`<strong>${escapeHTML(record.ownerUsername)}</strong>`:''}${visible('due') && record.dueAt?`<small>${formatDate(record.dueAt)}</small>`:''}</span></footer>`:''}</button><label class="collection-stage-select"><span>Этап</span><select data-collection-stage="${record.id}" aria-label="Этап карточки ${escapeHTML(record.title)}">${collection.stages.map((stage)=>`<option value="${stage.id}" ${record.stageId===stage.id?'selected':''}>${escapeHTML(stage.name)}</option>`).join('')}</select></label></article>`;
}

function collectionFilterOptions(field) {
	if (field.fieldType === 'select' || field.fieldType === 'multi_select') return field.options.map((option) => `<option value="${option.id}">${escapeHTML(option.name)}</option>`).join('');
	if (field.fieldType === 'user') return state.users.map((user) => `<option value="${user.id}">${escapeHTML(user.displayName || user.username)}</option>`).join('');
	if (field.fieldType === 'checkbox') return '<option value="true">Да</option><option value="false">Нет</option>';
	return '';
}

function renderCollectionFilters(collection) {
	const fields = collection.fields.filter((field) => ['select', 'multi_select', 'user', 'checkbox'].includes(field.fieldType));
	const active = Boolean(state.collectionOwnerFilter || Object.values(state.collectionFieldFilters).some(Boolean));
	return `<section class="collection-filters" aria-label="Фильтры доски"><span>${icon('sliders')} Фильтры</span><label><span>Ответственный</span><select data-collection-owner-filter><option value="">Все</option>${state.users.map((user) => `<option value="${user.id}" ${state.collectionOwnerFilter === String(user.id) ? 'selected' : ''}>${escapeHTML(user.displayName || user.username)}</option>`).join('')}</select></label>${fields.map((field) => `<label><span>${escapeHTML(field.name)}</span><select data-collection-field-filter="${field.id}"><option value="">Все</option>${collectionFilterOptions(field)}</select></label>`).join('')}${active ? `<button type="button" class="text-button" data-reset-collection-filters>${icon('x')} Сбросить</button>` : ''}</section>`;
}

function renderCollections() {
	const workspace = activeWorkspace();
	if (!state.collections.length) {
		$('#main-content').innerHTML = `<div class="page-heading collection-page-heading"><div><p class="eyebrow">${escapeHTML(workspace?.name || 'Команда')}</p><h1>Доски</h1></div></div><div class="guided-empty collection-empty">${icon('network')}<h2>Досок пока нет</h2>${canConfigureWorkspace() ? `<button type="button" class="primary" data-create-collection>${icon('plus')} Создать первую доску</button>` : '<p>Создать доску может администратор проекта.</p>'}</div>`;
		$$('[data-create-collection]').forEach((button) => button.addEventListener('click', openCollectionCreateDialog));
		return;
	}
	const collection = activeCollection() || state.collections[0];
	state.activeCollectionId = collection.id;
	const records = collectionRecords(collection.id);
  rememberWorkScroll();
	$('#main-content').innerHTML = `<div class="page-heading collection-page-heading"><div><p class="eyebrow">${escapeHTML(workspace?.name || 'Команда')} · Конструктор процессов</p><h1>${escapeHTML(collection.name)}</h1><p>${escapeHTML(collection.description || `${collection.cardLabel}: настраиваемые этапы и поля`)}</p></div><div class="collection-page-actions"><button type="button" class="primary" data-create-collection-card>${icon('plus')} ${escapeHTML(collection.cardLabel)}</button>${canConfigureWorkspace() ? `<button type="button" class="secondary" data-configure-collection>${icon('settings')} Настроить</button>` : ''}</div></div><section class="collection-toolbar"><nav class="collection-tabs" aria-label="Доски">${state.collections.map((item) => `<button type="button" class="${item.id === collection.id ? 'active' : ''}" data-collection-tab="${item.id}"><span>${icon('network')}</span><strong>${escapeHTML(item.name)}</strong><small>${state.records.filter((record) => record.collectionId === item.id && record.status !== 'archived').length}</small></button>`).join('')}${canConfigureWorkspace() ? `<button type="button" class="collection-tab-add" data-create-collection title="Новая доска" aria-label="Новая доска">${icon('plus')}</button>` : ''}</nav><label class="collection-search">${icon('search')}<input type="search" value="${escapeHTML(state.collectionSearch)}" placeholder="Найти на доске" aria-label="Найти карточку на доске"></label></section>${renderCollectionFilters(collection)}${renderWorkCollectionBoard(records, collection)}`;
  const addBoard = $('[data-create-collection]');
  if (addBoard) addBoard.innerHTML = `${icon('plus')}<strong>Новая доска</strong>`;
  $('.collection-toolbar').insertAdjacentHTML('afterbegin', `<div class="collection-picker-mobile"><label>Доска<select data-collection-picker aria-label="Выбрать доску">${state.collections.map(item => `<option value="${item.id}" ${item.id === collection.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}</select></label>${canConfigureWorkspace() ? `<button type="button" class="icon-button" data-create-collection aria-label="Новая доска">${icon('plus')}</button>` : ''}</div>`);
  $('[data-collection-picker]').addEventListener('change', event => {state.activeCollectionId = event.currentTarget.value;state.collectionSearch = '';state.collectionOwnerFilter = '';state.collectionFieldFilters = {};renderCollections();});
  $$('[data-collection-tab]').forEach(button => {button.title = $('strong',button).textContent;});
  requestAnimationFrame(() => {
    const nav = $('.collection-tabs'), active = $('.collection-tabs > .active');
    if (!nav || !active || !nav.clientWidth) return;
    const bounds = nav.getBoundingClientRect(), item = active.getBoundingClientRect();
    if (item.right > bounds.right) nav.scrollLeft += item.right - bounds.right;
    else if (item.left < bounds.left) nav.scrollLeft += item.left - bounds.left;
  });
  $('.collection-toolbar').insertAdjacentHTML('beforeend', `<button type="button" class="secondary" data-board-calendar>${icon('calendar')} Календарь</button>`);
  $('[data-board-calendar]').addEventListener('click', () => openCalendar('project', collection.id));
	$$('[data-collection-tab]').forEach((button) => button.addEventListener('click', () => { state.activeCollectionId = button.dataset.collectionTab; state.collectionSearch = ''; state.collectionOwnerFilter = ''; state.collectionFieldFilters = {}; renderCollections(); }));
	$$('[data-create-collection]').forEach((button) => button.addEventListener('click', openCollectionCreateDialog));
	$('[data-configure-collection]')?.addEventListener('click', () => openCollectionSettingsDialog(collection));
	$('[data-create-collection-card]')?.addEventListener('click', () => openCollectionCardDialog(collection));
	$$('[data-create-at-stage]').forEach((button) => button.addEventListener('click', () => openCollectionCardDialog(collection, null, button.dataset.createAtStage)));
	$('.collection-search input')?.addEventListener('input', (event) => { state.collectionSearch = event.currentTarget.value; renderCollections(); requestAnimationFrame(() => { const input = $('.collection-search input'); input?.focus(); input?.setSelectionRange(input.value.length, input.value.length); }); });
	$('[data-collection-owner-filter]')?.addEventListener('change', (event) => { state.collectionOwnerFilter = event.currentTarget.value; renderCollections(); });
	$$('[data-collection-field-filter]').forEach((select) => { select.value = state.collectionFieldFilters[select.dataset.collectionFieldFilter] || ''; select.addEventListener('change', () => { state.collectionFieldFilters[select.dataset.collectionFieldFilter] = select.value; renderCollections(); }); });
	$('[data-reset-collection-filters]')?.addEventListener('click', () => { state.collectionOwnerFilter = ''; state.collectionFieldFilters = {}; renderCollections(); });
	bindCollectionBoard(collection);
  bindWorkWindow(renderCollections);
  bulkWorkUI.mount();
}

async function reloadCollections({ render = true } = {}) {
	state.collections = await api('/api/collections');
	if (!state.collections.some((collection) => collection.id === state.activeCollectionId)) state.activeCollectionId = state.collections[0]?.id || '';
	if (render && state.view === 'collections') renderCollections();
  if (render && state.view === 'work') renderWorkList();
}

function bindCollectionBoard(collection, rerender = renderCollections) {
	bindOpenRecords();
	$$('[data-collection-stage]').forEach((select) => select.addEventListener('change', async () => {
		await moveCollectionRecord(select.dataset.collectionStage, select.value, rerender);
	}));
	let draggedID = '';
	$$('[data-collection-card]').forEach((card) => {
		card.addEventListener('dragstart', (event) => { draggedID = card.dataset.collectionCard; card.classList.add('dragging'); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', draggedID); });
		card.addEventListener('dragend', () => { draggedID = ''; card.classList.remove('dragging'); $$('.collection-column').forEach((column) => column.classList.remove('drop-target')); });
	});
	$$('[data-collection-drop]').forEach((column) => {
		column.addEventListener('dragover', (event) => { if (!draggedID) return; event.preventDefault(); event.dataTransfer.dropEffect = 'move'; column.classList.add('drop-target'); });
		column.addEventListener('dragleave', (event) => { if (!column.contains(event.relatedTarget)) column.classList.remove('drop-target'); });
		column.addEventListener('drop', async (event) => { event.preventDefault(); column.classList.remove('drop-target'); const recordID = draggedID || event.dataTransfer.getData('text/plain'); if (recordID) await moveCollectionRecord(recordID, column.dataset.collectionDrop, rerender); });
	});
}

async function moveCollectionRecord(recordID, stageID, rerender = renderCollections) {
	const record = state.records.find((item) => item.id === recordID);
	if (!record || record.stageId === stageID) return;
	try {
		const updated = await api(`/api/records/${recordID}/stage`, { method: 'PUT', body: JSON.stringify({ stageId: stageID }) });
		state.records = state.records.map((item) => item.id === updated.id ? updated : item);
		state.detailCache.delete(updated.id);
		rerender();
	} catch (error) { toast(error.message, true); rerender(); }
}

function collectionFieldInput(field, value) {
	const name = `custom:${field.id}`;
	const required = field.required ? 'required' : '';
	const label = `${escapeHTML(field.name)}${field.required ? ' *' : ''}`;
	if (field.fieldType === 'long_text') return `<label>${label}<textarea name="${name}" rows="4" ${required}>${escapeHTML(value || '')}</textarea></label>`;
	if (field.fieldType === 'select') return `<label>${label}<select name="${name}" ${required}><option value="">Не выбрано</option>${field.options.map((option) => `<option value="${option.id}" ${value === option.id ? 'selected' : ''}>${escapeHTML(option.name)}</option>`).join('')}</select></label>`;
	if (field.fieldType === 'multi_select') return `<fieldset class="collection-multi-field" data-multi-field data-required="${field.required}"><legend>${label}</legend><div class="collection-multi-options">${field.options.map(option=>`<label class="check"><input type="checkbox" name="${name}" value="${option.id}" ${Array.isArray(value)&&value.includes(option.id)?'checked':''}><span>${escapeHTML(option.name)}</span></label>`).join('')}</div><small data-multi-count></small></fieldset>`;
	if (field.fieldType === 'user') return `<label>${label}<select name="${name}" ${required}><option value="">Не выбрано</option>${state.users.map((user) => `<option value="${user.id}" ${Number(value) === user.id ? 'selected' : ''}>${escapeHTML(user.username)}</option>`).join('')}</select></label>`;
	if (field.fieldType === 'checkbox') return `<label class="check collection-checkbox"><input type="checkbox" name="${name}" ${value ? 'checked' : ''}><span><strong>${label}</strong> <small>Да или нет</small></span></label>`;
	if (field.fieldType === 'relation') return `<label>${label}<select name="${name}" ${required}><option value="">Не выбрано</option>${state.records.filter((record) => record.status !== 'archived').map((record) => `<option value="${record.id}" ${value === record.id ? 'selected' : ''}>${escapeHTML(record.title)}</option>`).join('')}</select></label>`;
	const type = ({ number: 'number', money: 'number', date: 'date', datetime: 'datetime-local', url: 'url', email: 'email', phone: 'tel' })[field.fieldType] || 'text';
	const displayValue = field.fieldType === 'datetime' ? toLocalInput(value) : value ?? '';
	return `<label>${label}<input name="${name}" type="${type}" ${field.fieldType === 'money' ? 'step="0.01"' : field.fieldType === 'number' ? 'step="any"' : ''} value="${escapeHTML(displayValue)}" ${required}></label>`;
}

function bindCollectionMultiFields(root) {
  root.querySelectorAll('[data-multi-field]').forEach(group=>{
    const checks=[...group.querySelectorAll('input[type=checkbox]')];
    const sync=()=>{const count=checks.filter(item=>item.checked).length;checks[0]?.setCustomValidity(group.dataset.required==='true'&&!count?'Выберите хотя бы один вариант':'');group.querySelector('[data-multi-count]').textContent=count?`Выбрано: ${count}`:'Можно выбрать несколько вариантов';};
    group.addEventListener('change',sync);sync();
  });
}

function openCollectionFormPreview(collection) {
  const dialog=$('#reason-dialog'),root=$('#reason-dialog-content');
  root.innerHTML=`<div class="dialog-header constructor-form-header"><div><span class="record-kind">Предпросмотр формы</span><h2>${escapeHTML(collection.cardLabel||'Карточка')} · ${escapeHTML(collection.name)}</h2><p>Попробуйте заполнить поля. Пример не создаёт карточку и не меняет данные команды.</p></div><button type="button" class="icon-button" data-preview-close aria-label="Закрыть">${icon('x')}</button></div><form class="card-form dialog-form"><label>Название<input name="title" required maxlength="240" placeholder="Название будущей карточки"></label><label>Этап<select>${collection.stages.map(stage=>`<option>${escapeHTML(stage.name)}</option>`).join('')}</select></label><div class="form-grid two">${collection.fields.map(field=>collectionFieldInput(field,field.defaultValue)).join('')}</div><p role="status" data-preview-result></p><div class="form-actions"><button type="submit" class="secondary">Проверить заполнение</button><button type="button" class="primary" data-preview-close>Вернуться в конструктор</button></div></form>`;
  root.querySelectorAll('[data-preview-close]').forEach(button=>button.onclick=()=>dialog.close());
  root.querySelector('form').onsubmit=event=>{event.preventDefault();root.querySelector('[data-preview-result]').textContent='Поля заполнены корректно. Пример не сохранён.';};
  bindCollectionMultiFields(root);openModal(dialog);enhanceSelects(root);
}

function customFieldsFromForm(form, fields) {
	const values = {};
	fields.forEach((field) => {
		const control = form.elements.namedItem(`custom:${field.id}`);
		if (!control) return;
		if (field.fieldType === 'checkbox') values[field.id] = control.checked;
		else if (field.fieldType === 'multi_select') values[field.id] = [...form.querySelectorAll(`input[name="${CSS.escape('custom:'+field.id)}"]:checked`)].map(option=>option.value);
		else if (field.fieldType === 'number' || field.fieldType === 'money') values[field.id] = control.value === '' ? null : Number(control.value);
		else if (field.fieldType === 'user') values[field.id] = control.value === '' ? null : Number(control.value);
		else if (field.fieldType === 'datetime') values[field.id] = control.value ? new Date(control.value).toISOString() : '';
		else values[field.id] = control.value;
	});
	return values;
}

function openCollectionCardDialog(collection, record = null, stageID = '', defaults = {}) {
	const workspace = state.activeWorkspaceId;
	const dialog = $('#workspace-dialog');
	const fields = collection.fields || [];
	const content = $('#workspace-dialog-content');
	const editingFields = Boolean(record);
	content.innerHTML = `<div class="workspace-editor-shell collection-card-editor"><header><div><p class="eyebrow">${escapeHTML(collection.name)}</p><h2>${editingFields ? 'Поля карточки' : `Создать: ${escapeHTML(collection.cardLabel)}`}</h2><p>${editingFields ? escapeHTML(record.title) : 'Заполните только нужное сейчас. Остальные поля можно дополнить позже.'}</p></div><button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">${icon('x')}</button></header><form id="collection-card-form" class="card-form">${editingFields ? '' : `<label>Название<input name="title" required maxlength="240" placeholder="Что нужно сделать"></label><label>Описание<textarea name="description" rows="4" placeholder="Контекст, ожидаемый результат или детали"></textarea></label><div class="form-grid three"><label>Этап<select name="stageId">${collection.stages.map((stage) => `<option value="${stage.id}" ${(stageID || collection.stages[0]?.id) === stage.id ? 'selected' : ''}>${escapeHTML(stage.name)}</option>`).join('')}</select></label><label>Ответственный<select name="ownerId">${userOptions(state.me.id)}</select></label><label>Приоритет<select name="priority">${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${value === 'normal' ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div>`}<section class="collection-custom-fields"><header><strong>Поля доски</strong><small>${fields.length ? `${fields.length} настроено` : 'Поля пока не добавлены'}</small></header>${fields.length ? `<div class="form-grid two">${fields.map((field) => collectionFieldInput(field, record ? record.customFields?.[field.id] : field.defaultValue)).join('')}</div>` : '<p class="muted">Карточка будет использовать основные поля Tessavie. Администратор может добавить тип, номер, канал, клиента, сумму или другие свойства в настройках доски.</p>'}</section><div class="form-actions"><button type="submit" class="primary">${icon('check')} ${editingFields ? 'Сохранить поля' : 'Создать карточку'}</button><button type="button" class="secondary" data-close-workspace-dialog>Отмена</button></div></form></div>`;
	$$('[data-close-workspace-dialog]', dialog).forEach((button) => button.addEventListener('click', closeWorkspaceDialog));
	if (!record) $('.collection-custom-fields', content).insertAdjacentHTML('beforebegin', `<label>Срок <small>необязательно</small><input type="datetime-local" name="dueAt" value="${escapeHTML(defaults.dueAt || '')}"></label>`);
	enhanceSelects(dialog);
  const cardForm=$('#collection-card-form',dialog);
  bindWorkingDraft(cardForm,`collection-card:${workspace}:${collection.id}:${record?.id||'new'}`);
  bindCollectionMultiFields(cardForm);
	$('#collection-card-form', dialog).addEventListener('submit', async (event) => {
		event.preventDefault();
		const form = event.currentTarget;
		const submit = $('button[type="submit"]', form);
		if (submit.disabled) return;
		submit.disabled = true;
		const customFields = customFieldsFromForm(form, fields);
		try {
			let updated;
			if (record) {
				updated = await api(`/api/records/${record.id}/custom-fields`, { method: 'PUT', body: JSON.stringify({ values: customFields }) });
			} else {
				const values = new FormData(form);
				updated = await api('/api/records', { method: 'POST', body: JSON.stringify({ type: defaults.recordType || collection.defaultRecordType, title: values.get('title'), description: values.get('description'), ownerId: Number(values.get('ownerId')), priority: values.get('priority'), dueAt: values.get('dueAt') ? new Date(values.get('dueAt')).toISOString() : '', workstream: 'business', editPolicy: 'shared', collectionId: collection.id, stageId: values.get('stageId'), customFields }) });
			}
			if (workspace !== state.activeWorkspaceId) return;
			state.records = record ? state.records.map((item) => item.id === updated.id ? updated : item) : [updated, ...state.records];
			state.detailCache.delete(updated.id);
			if (form.isConnected) {clearWorkingDraftFor(form);closeWorkspaceDialog();}
			if ($('#record-dialog').open && state.activeDetail?.record.id === updated.id) await openRecord(updated.id, { force: true });
			else renderContent();
			toast(record ? 'Поля сохранены' : 'Карточка создана');
		} catch (error) { toast(error.message, true); }
		finally { submit.disabled = false; }
	});
	openModal(dialog);
}

function bindCollectionTemplatePicker(form, templates) {
  const select = form.elements.templateId, preview = form.querySelector('[data-template-preview]');
  const find = () => templates.find(item => item.id === select.value) || templates[0];
  let previous = find();
  const defaults = item => ({name:item.id === 'blank' ? '' : item.name,description:item.id === 'blank' ? '' : item.description,cardLabel:item.cardLabel});
  const render = () => {
    const item = find();
    preview.innerHTML = `<p>${escapeHTML(item.description)}</p><strong>Колонки</strong><p>${item.stages.map(stage => escapeHTML(stage.name)).join(' → ')}</p><strong>Поля</strong><p>${item.fields.length ? item.fields.map(field => escapeHTML(field.name)).join(' · ') : 'Добавите в конструкторе'}</p><small>Создаётся отдельная доска без тестовых карточек. Колонки и поля можно менять после создания.</small>`;
  };
  select.addEventListener('change', () => {
    const next = find(), oldValues = defaults(previous), newValues = defaults(next);
    for (const key of ['name','description','cardLabel']) {
      const input = form.elements[key];
      if (!input.value.trim() || input.value === oldValues[key]) input.value = newValues[key];
    }
    previous = next; render();
    form.dispatchEvent(new Event('input', {bubbles:true}));
  });
  render();
}

async function openCollectionCreateDialog({ afterCreate } = {}) {
	const workspace = state.activeWorkspaceId;
	const context = captureProjectContext();
	let templates;
	try { templates = await api('/api/collection-templates'); } catch (error) { toast(error.message, true); return; }
	if (!isProjectContextCurrent(context)) return;
	const dialog = $('#workspace-dialog');
	$('#workspace-dialog-content').innerHTML = `<div class="workspace-editor-shell"><header><div><p class="eyebrow">${escapeHTML(activeWorkspace()?.name || 'Команда')}</p><h2>Новая доска</h2><p>Этапы и поля можно менять без разработки. Связи и история остаются общими для всей команды.</p></div><button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">${icon('x')}</button></header><form id="collection-create-form" class="card-form"><label>Название доски<input name="name" required maxlength="100" placeholder="Например: CRM"></label><label>Описание<textarea name="description" rows="3" maxlength="800" placeholder="Какой процесс ведём на этой доске"></textarea></label><label>Как называть карточку<input name="cardLabel" maxlength="40" value="Задача" placeholder="Лид, сделка, кандидат, заявка"></label><div class="form-actions"><button type="submit" class="primary">${icon('plus')} Создать доску</button><button type="button" class="secondary" data-close-workspace-dialog>Отмена</button></div></form></div>`;
	$$('[data-close-workspace-dialog]', dialog).forEach((button) => button.addEventListener('click', closeWorkspaceDialog));
	const createForm = $('#collection-create-form', dialog);
	createForm.insertAdjacentHTML('afterbegin', `<label>С чего начать<select name="templateId">${templates.map(item => `<option value="${item.id}">${escapeHTML(item.name)}</option>`).join('')}</select></label><section class="collection-template-preview" data-template-preview aria-live="polite"></section>`);
	createForm.elements.cardLabel.value = templates[0].cardLabel;
	bindWorkingDraft(createForm, `collection-create:${workspace}`);
	bindCollectionTemplatePicker(createForm, templates);
	enhanceSelects(createForm);
	createForm.addEventListener('submit', async (event) => {
		event.preventDefault(); const element = event.currentTarget, form = new FormData(element), submit = $('button[type="submit"]', element);
		if (submit.disabled) return;
		submit.disabled = true;
		try {
			const created = await api('/api/collections', { method: 'POST', body: JSON.stringify({ name: form.get('name'), description: form.get('description'), cardLabel: form.get('cardLabel'), defaultRecordType: 'task', templateId: form.get('templateId') }) });
			clearWorkingDraftFor(element);
			if (workspace !== state.activeWorkspaceId) return;
			state.activeCollectionId = created.id;
      if (state.view === 'work') state.workCollection = created.id;
      const continueDialog = element.isConnected;
      if (continueDialog) closeWorkspaceDialog();
      await reloadCollections(); toast('Доска создана');
      if (workspace !== state.activeWorkspaceId) return;
      if (afterCreate) { if (continueDialog) afterCreate(created); return; }
      if (state.view === 'work') openCollectionSettingsDialog(state.collections.find((item) => item.id === created.id));
		} catch (error) { toast(error.message, true); }
		finally { submit.disabled = false; }
	});
	openModal(dialog);
}

function collectionSettingsStageRows(collection) {
	const categoryLabels = { backlog: 'Ожидает начала', active: 'Активная работа', review: 'Проверка', done: 'Финальный этап' };
	return collection.stages.map((stage) => `<div><i class="tone-${stage.colorKey}"></i><span><strong>${escapeHTML(stage.name)}</strong><small>${escapeHTML(categoryLabels[stage.category])}</small></span><button type="button" class="icon-button" data-edit-collection-stage="${stage.id}" aria-label="Переименовать этап" title="Переименовать этап">${icon('edit')}</button></div>`).join('');
}

function collectionSettingsFieldRows(collection, fieldTypes) {
	return collection.fields.map((field) => `<div><span>${icon('sliders')}</span><span><strong>${escapeHTML(field.name)}</strong><small>${escapeHTML(fieldTypes.find(([value]) => value === field.fieldType)?.[1] || field.fieldType)}${field.required ? ' · обязательное' : ''}${field.showOnCard ? ' · на карточке' : ''}</small></span><button type="button" class="icon-button" data-edit-collection-field="${field.id}" aria-label="Переименовать поле" title="Переименовать поле">${icon('edit')}</button></div>`).join('') || '<p class="muted">Пользовательских полей пока нет.</p>';
}

function askCollectionConfiguration(collection) {
	const dialog = $('#reason-dialog');
	$('#reason-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">Конструктор доски</span><h2>Параметры доски</h2></div><button type="button" class="icon-button" data-cancel-collection-config aria-label="Закрыть">${icon('x')}</button></div><form id="collection-config-form" class="card-form dialog-form"><label>Название<input name="name" required maxlength="100" value="${escapeHTML(collection.name)}"></label><label>Описание<textarea name="description" rows="3" maxlength="800">${escapeHTML(collection.description)}</textarea></label><label>Название карточки<input name="cardLabel" required maxlength="40" value="${escapeHTML(collection.cardLabel)}" placeholder="Задача, лид, заявка"></label><div class="form-actions"><button type="submit" class="primary">Сохранить</button><button type="button" class="secondary" data-cancel-collection-config>Отмена</button></div></form>`;
	return new Promise((resolve) => {
		let closing = false; let result = null;
		const finish = (value) => { if (closing) return; closing = true; result = value; dialog.close(); };
		$$('[data-cancel-collection-config]', dialog).forEach((button) => button.addEventListener('click', () => finish(null)));
		$('#collection-config-form', dialog).addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); finish({ name: String(form.get('name')).trim(), description: String(form.get('description')).trim(), cardLabel: String(form.get('cardLabel')).trim() }); });
		dialog.addEventListener('close', () => resolve(result), { once: true });
		openModal(dialog);
	});
}

function askCollectionStageConfiguration(stage) {
	const dialog = $('#reason-dialog');
	$('#reason-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">Этап процесса</span><h2>Настроить колонку</h2></div><button type="button" class="icon-button" data-cancel-stage-config aria-label="Закрыть">${icon('x')}</button></div><form id="stage-config-form" class="card-form dialog-form"><label>Название<input name="name" required maxlength="60" value="${escapeHTML(stage.name)}"></label><div class="form-grid two"><label>Состояние<select name="category"><option value="backlog" ${stage.category === 'backlog' ? 'selected' : ''}>Ожидает начала</option><option value="active" ${stage.category === 'active' ? 'selected' : ''}>Активная работа</option><option value="review" ${stage.category === 'review' ? 'selected' : ''}>Проверка</option><option value="done" ${stage.category === 'done' ? 'selected' : ''}>Финальный этап</option></select></label><label>Цвет<select name="colorKey"><option value="neutral" ${stage.colorKey === 'neutral' ? 'selected' : ''}>Нейтральный</option><option value="amber" ${stage.colorKey === 'amber' ? 'selected' : ''}>Жёлтый</option><option value="blue" ${stage.colorKey === 'blue' ? 'selected' : ''}>Синий</option><option value="green" ${stage.colorKey === 'green' ? 'selected' : ''}>Зелёный</option><option value="red" ${stage.colorKey === 'red' ? 'selected' : ''}>Красный</option><option value="violet" ${stage.colorKey === 'violet' ? 'selected' : ''}>Фиолетовый</option></select></label></div><div class="form-actions"><button type="submit" class="primary">Сохранить</button><button type="button" class="secondary" data-cancel-stage-config>Отмена</button></div></form>`;
	return new Promise((resolve) => {
		let closing = false; let result = null;
		const finish = (value) => { if (closing) return; closing = true; result = value; dialog.close(); };
		$$('[data-cancel-stage-config]', dialog).forEach((button) => button.addEventListener('click', () => finish(null)));
		$('#stage-config-form', dialog).addEventListener('submit', (event) => { event.preventDefault(); const form = new FormData(event.currentTarget); finish({ name: String(form.get('name')).trim(), category: form.get('category'), colorKey: form.get('colorKey') }); });
		dialog.addEventListener('close', () => resolve(result), { once: true });
		openModal(dialog); enhanceSelects(dialog);
	});
}

function askCollectionFieldConfiguration(field) {
	const dialog = $('#reason-dialog');
	$('#reason-dialog-content').innerHTML = `<div class="dialog-header constructor-form-header"><div><span class="record-kind">Пользовательское поле</span><h2>Настроить поле</h2></div><button type="button" class="icon-button" data-cancel-field-config aria-label="Закрыть">${icon('x')}</button></div><form id="field-config-form" class="card-form dialog-form"><label>Название<input name="name" required maxlength="80" value="${escapeHTML(field.name)}"></label><p class="muted">Тип поля не меняется после создания, чтобы уже заполненные данные оставались корректными.</p><label class="check"><input type="checkbox" name="required" ${field.required ? 'checked' : ''}> Обязательное поле</label><label class="check"><input type="checkbox" name="showOnCard" ${field.showOnCard ? 'checked' : ''}> Показывать значение на карточке</label><div class="form-actions"><button type="submit" class="primary">Сохранить</button><button type="button" class="secondary" data-cancel-field-config>Отмена</button></div></form>`;
  const configForm=$('#field-config-form',dialog),choice=['select','multi_select'].includes(field.fieldType);
  if(choice)$('.form-actions',configForm).insertAdjacentHTML('beforebegin',`<section class="collection-option-editor"><h3>Варианты ответа</h3><p class="muted">Переименование обновит подпись в существующих карточках. Выбранные значения сохранятся.</p>${field.options.map(option=>`<label>Вариант<input name="option:${option.id}" data-option-id="${option.id}" value="${escapeHTML(option.name)}" required maxlength="80"></label>`).join('')}<label>Новые варианты<textarea name="newOptions" rows="3" placeholder="Каждый вариант с новой строки"></textarea></label></section>`);
  const supportsDefault=!['user','relation'].includes(field.fieldType);
  if(supportsDefault){
    const enabled=field.defaultValue!==undefined&&field.defaultValue!==null;
    $('.form-actions',configForm).insertAdjacentHTML('beforebegin',`<details class="collection-default-config" ${enabled?'open':''}><summary>Начальное значение</summary><p class="muted">Подставляется в новые карточки. Старые значения сохраняются; при заполнении можно заменить или очистить.</p><label class="check"><input type="checkbox" name="useDefault" ${enabled?'checked':''}> Подставлять при создании</label><fieldset data-default-value>${collectionFieldInput({...field,name:'Значение',required:false},field.defaultValue)}</fieldset>${choice?'<p class="muted">Новые варианты появятся здесь после сохранения справочника.</p>':''}</details>`);
  }
  bindWorkingDraft(configForm,`collection-field-config:${state.activeWorkspaceId}:${field.id}`);
  if(supportsDefault){
    const syncDefault=()=>{$('[data-default-value]',configForm).disabled=!configForm.elements.useDefault.checked;};
    configForm.elements.useDefault.addEventListener('change',syncDefault);syncDefault();bindCollectionMultiFields(configForm);
  }
	return new Promise((resolve) => {
		let closing = false; let result = null;
		const finish = (value) => { if (closing||!flushDialogDrafts(dialog)) return; closing = true; result = value; dialog.close(); };
		$$('[data-cancel-field-config]', dialog).forEach((button) => button.addEventListener('click', () => finish(null)));
		$('#field-config-form', dialog).addEventListener('submit', (event) => { event.preventDefault(); const form = event.currentTarget;const value={ name: String(new FormData(form).get('name')).trim(), required: form.elements.required.checked, showOnCard: form.elements.showOnCard.checked };if(supportsDefault)value.defaultValue=form.elements.useDefault.checked?customFieldsFromForm(form,[field])[field.id]:null;if(choice)value.options=[...form.querySelectorAll('[data-option-id]')].map(input=>({id:input.dataset.optionId,name:input.value.trim()})).concat(form.elements.newOptions.value.split(/\r?\n/).map(name=>name.trim()).filter(Boolean).map(name=>({name})));finish(value); });
		dialog.addEventListener('close', () => resolve(result), { once: true });
		openModal(dialog);
	});
}

async function refreshCollectionSettingsDialog() {
	await reloadCollections({ render: false });
	if (state.view === 'collections') renderCollections();
	closeWorkspaceDialog();
	openCollectionSettingsDialog(activeCollection());
}

async function openCollectionSettingsDialog(collection, tab = 'fields') {
  if (!collection) return;
  const context = captureProjectContext(), dialog = $('#workspace-dialog'), content = $('#workspace-dialog-content');
  const fieldTypes = [['text','Короткий текст'],['long_text','Большой текст'],['number','Число'],['money','Сумма'],['date','Дата'],['datetime','Дата и время'],['select','Один вариант'],['multi_select','Несколько вариантов'],['user','Участник'],['checkbox','Да / нет'],['url','Ссылка'],['email','Почта'],['phone','Телефон'],['relation','Связанная карточка']];
  content.innerHTML = `<div class="workspace-editor-shell"><header><h2>Конструктор доски</h2><button type="button" class="icon-button" data-schema-close aria-label="Закрыть">${icon('x')}</button></header><p>Загружаем поля и колонки…</p></div>`;
  const loading = content.firstElementChild;
  $('[data-schema-close]', loading).addEventListener('click', closeWorkspaceDialog); openModal(dialog);
  let schema;
  try { schema = await api(`/api/collections/${collection.id}/schema`, { headers: { 'X-Workspace-ID': context.workspace } }); }
  catch (error) {
    if (loading.isConnected) { loading.insertAdjacentHTML('beforeend', `<p>${escapeHTML(error.message)}</p><button type="button" class="secondary" data-schema-retry>Повторить</button>`); $('[data-schema-retry]', loading).addEventListener('click', () => openCollectionSettingsDialog(collection, tab)); }
    return;
  }
  if (!isProjectContextCurrent(context) || !loading.isConnected || !dialog.open) return;
  const active = (kind) => schema[kind].filter(item => !item.archivedAt);
  const categories = {backlog:'Ожидает начала', active:'Активная работа', review:'Проверка', done:'Финальный этап'};
  const row = (kind, item, index, length) => `<article class="schema-row"><div><strong>${escapeHTML(item.name)}</strong><small>${kind === 'fields' ? escapeHTML(fieldTypes.find(([key]) => key === item.fieldType)?.[1] || item.fieldType) + (item.required ? ' · обязательное' : '') + (item.defaultValue!==undefined&&item.defaultValue!==null ? ' · начальное значение' : '') : escapeHTML(categories[item.category]) + ' · карточек: ' + item.recordCount}</small></div><div class="schema-row-actions">${item.archivedAt ? `<button type="button" class="secondary" data-schema-restore="${kind}" data-schema-id="${item.id}">${icon('rotate')} Восстановить</button>` : `<button type="button" class="icon-button" data-schema-move="${kind}" data-schema-id="${item.id}" data-direction="-1" ${index === 0 ? 'disabled' : ''} aria-label="Выше: ${escapeHTML(item.name)}">↑</button><button type="button" class="icon-button" data-schema-move="${kind}" data-schema-id="${item.id}" data-direction="1" ${index === length - 1 ? 'disabled' : ''} aria-label="Ниже: ${escapeHTML(item.name)}">↓</button><button type="button" class="icon-button" data-schema-edit="${kind}" data-schema-id="${item.id}" aria-label="Настроить: ${escapeHTML(item.name)}">${icon('edit')}</button><button type="button" class="icon-button danger-text" data-schema-delete="${kind}" data-schema-id="${item.id}" aria-label="Удалить: ${escapeHTML(item.name)}">${icon('trash')}</button>`}</div></article>`;
  const removed = ['fields','stages'].flatMap(kind => schema[kind].filter(item => item.archivedAt).map(item => row(kind,item,0,0))).join('');
  content.innerHTML = `<div class="workspace-editor-shell collection-settings-shell"><header><div><p class="eyebrow">Конструктор доски · для всей команды</p><h2>${escapeHTML(collection.name)}</h2></div><div class="collection-settings-header-actions"><button type="button" class="icon-button" data-edit-collection aria-label="Переименовать доску">${icon('edit')}</button><button type="button" class="icon-button" data-close-workspace-dialog aria-label="Закрыть">${icon('x')}</button></div></header>
    <nav class="team-settings-tabs" aria-label="Разделы конструктора">${[['fields','Поля'],['stages','Колонки'],['archive','Удалённые']].map(([key,label]) => `<button type="button" data-schema-tab="${key}" class="${tab === key ? 'active' : ''}" aria-pressed="${tab === key}">${label}</button>`).join('')}</nav>
    <section data-schema-panel="fields" ${tab !== 'fields' ? 'hidden' : ''}><p>Уберите ненужные поля, измените порядок и обязательность. Сохранённые значения удалённого поля можно вернуть.</p>${active('fields').map((item,index,items) => row('fields',item,index,items.length)).join('') || '<p class="muted">Пользовательских полей пока нет.</p>'}
      <details class="schema-create"><summary>${icon('plus')} Добавить поле</summary><form id="collection-field-form" class="card-form"><label>Название поля<input name="name" required maxlength="80"></label><label>Тип поля<select name="fieldType">${fieldTypes.map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label data-field-options hidden>Варианты через запятую<input name="options" placeholder="Первый, Второй"></label><label class="check"><input type="checkbox" name="required"> Обязательное</label><label class="check"><input type="checkbox" name="showOnCard" checked> Показывать на карточке доски</label><button type="submit" class="primary">${icon('plus')} Добавить поле</button></form></details>
    </section><section data-schema-panel="stages" ${tab !== 'stages' ? 'hidden' : ''}><p>Колонки можно переименовать, переставить и удалить. Карточки удаляемой колонки перемещаются в выбранную вами колонку с сохранением состояния.</p>${active('stages').map((item,index,items) => row('stages',item,index,items.length)).join('')}
      <details class="schema-create"><summary>${icon('plus')} Добавить колонку</summary><form id="collection-stage-form" class="card-form"><label>Название колонки<input name="name" required maxlength="60"></label><label>Смысл этапа<select name="category">${Object.entries(categories).map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><label>Цвет<select name="colorKey">${[['neutral','Нейтральный'],['amber','Жёлтый'],['blue','Синий'],['green','Зелёный'],['red','Красный'],['violet','Фиолетовый']].map(([key,label]) => `<option value="${key}">${label}</option>`).join('')}</select></label><button type="submit" class="primary">${icon('plus')} Добавить колонку</button></form></details>
    </section><section data-schema-panel="archive" ${tab !== 'archive' ? 'hidden' : ''}><p>Восстановление поля возвращает прежние значения. Восстановление колонки не перемещает карточки обратно.</p>${removed || '<p class="muted">Удалённых элементов нет.</p>'}</section></div>`;
  const shell = content.firstElementChild;
  $('[data-close-workspace-dialog]',shell).addEventListener('click',closeWorkspaceDialog);
  $('.collection-settings-header-actions',shell).insertAdjacentHTML('afterbegin',`<button type="button" class="secondary" data-schema-preview>${icon('eye')} Предпросмотр формы</button>`);
  $('[data-schema-preview]',shell).onclick=()=>openCollectionFormPreview({...collection,fields:active('fields'),stages:active('stages')});
  $$('[data-schema-tab]',shell).forEach(button => button.addEventListener('click', () => {
    tab = button.dataset.schemaTab; closeCustomSelects();
    $$('[data-schema-tab]',shell).forEach(item => {item.classList.toggle('active',item === button);item.setAttribute('aria-pressed',String(item === button));});
    $$('[data-schema-panel]',shell).forEach(panel => panel.hidden = panel.dataset.schemaPanel !== tab);
  }));
  let busy = false;
  const mutate = async (path,method,body,message) => {
    if (busy || !isProjectContextCurrent(context) || !shell.isConnected) return;
    if (!flushDialogDrafts(dialog)) return toast('Не удалось сохранить черновик на устройстве', true);
    busy = true;
    try {
      await api(path,{method,headers:{'X-Workspace-ID':context.workspace},body:JSON.stringify(body)});
      if (!isProjectContextCurrent(context)) return;
      if (method === 'POST' && path === base+'/fields') clearWorkingDraftFor($('#collection-field-form',shell));
      if (method === 'POST' && path === base+'/stages') clearWorkingDraftFor($('#collection-stage-form',shell));
      if (method === 'PATCH' && path.startsWith(base+'/fields/')) clearWorkingDraft(`collection-field-config:${context.workspace}:${path.split('/').at(-1)}`);
      state.detailCache.clear(); await reloadCollections({render:false}); await syncProjectChanges();
      if (isProjectContextCurrent(context) && $('#record-dialog').open && state.activeDetail && !state.recordEditMode && !dialogHasUnsavedChanges($('#record-dialog'))) renderRecordDialog();
      if (!isProjectContextCurrent(context) || !shell.isConnected || !dialog.open) return;
      if (state.view === 'work') renderWorkList(); else if (state.view === 'collections') renderCollections();
      await openCollectionSettingsDialog(state.collections.find(item => item.id === collection.id),tab); toast(message);
    } catch(error) { if (isProjectContextCurrent(context)) toast(error.message,true); }
    finally {busy = false;}
  };
  const base = `/api/collections/${collection.id}`;
  const fieldForm = $('#collection-field-form',shell);
  for (const kind of ['field','stage']) {
    const form = $(`#collection-${kind}-form`,shell);
    bindWorkingDraft(form, `collection-schema:${context.workspace}:${collection.id}:${kind}`);
    if (form.classList.contains('has-unsaved-draft')) form.closest('details').open = true;
  }
  const syncFieldOptions = () => {
    const enabled = ['select','multi_select'].includes(fieldForm.elements.fieldType.value);
    $('[data-field-options]',fieldForm).hidden = !enabled; fieldForm.elements.options.required = enabled;
  };
  fieldForm.elements.fieldType.addEventListener('change', syncFieldOptions); syncFieldOptions();
  bindTeamSubmit(fieldForm, data => mutate(base+'/fields','POST',{name:data.get('name'),fieldType:data.get('fieldType'),required:fieldForm.elements.required.checked,showOnCard:fieldForm.elements.showOnCard.checked,options:String(data.get('options') || '').split(',').map(item => item.trim()).filter(Boolean)},'Поле добавлено'));
  bindTeamSubmit($('#collection-stage-form',shell), data => mutate(base+'/stages','POST',{name:data.get('name'),category:data.get('category'),colorKey:data.get('colorKey')},'Колонка добавлена'));
  $('[data-edit-collection]',shell).addEventListener('click',async () => {const value = await askCollectionConfiguration(collection);if(value) await mutate(base,'PATCH',value,'Доска сохранена');});
  $$('[data-schema-edit]',shell).forEach(button => button.addEventListener('click',async () => {
    const kind = button.dataset.schemaEdit, item = schema[kind].find(item => item.id === button.dataset.schemaId);
    const value = await (kind === 'fields' ? askCollectionFieldConfiguration(item) : askCollectionStageConfiguration(item));
    if (value) await mutate(`${base}/${kind}/${item.id}`,'PATCH',{...value,expectedUpdatedAt:item.updatedAt},'Настройки сохранены');
  }));
  $$('[data-schema-delete]',shell).forEach(button => button.addEventListener('click',async () => {
    const kind = button.dataset.schemaDelete, item = schema[kind].find(item => item.id === button.dataset.schemaId);
    const move = kind === 'stages' && item.recordCount > 0;
    const choices = move ? active('stages').filter(stage => stage.id !== item.id).map(stage => ({value:stage.id,label:stage.name})) : [{value:'archive',label:'Удалить с возможностью восстановления'}];
    if (kind === 'stages' && active('stages').length === 1) return toast('На доске должна остаться хотя бы одна колонка',true);
    const answer = await askChoice({title:`Удалить «${item.name}»?`,label:move ? `Куда переместить карточки (${item.recordCount})? Их тип и состояние сохранятся.` : kind === 'fields' ? 'Поле исчезнет из форм и фильтров. Значения сохранятся в разделе «Удалённые».' : 'Пустую колонку можно будет восстановить.',choices});
    if (answer) await mutate(`${base}/${kind}/${item.id}`,'DELETE',{expectedUpdatedAt:item.updatedAt,moveToStageId:move ? answer : ''},kind === 'fields' ? 'Поле удалено. Значения сохранены.' : 'Колонка удалена');
  }));
  $$('[data-schema-restore]',shell).forEach(button => button.addEventListener('click', () => {
    const kind = button.dataset.schemaRestore, item = schema[kind].find(item => item.id === button.dataset.schemaId);
    return mutate(`${base}/${kind}/${item.id}/restore`,'POST',{expectedUpdatedAt:item.updatedAt},'Элемент восстановлен');
  }));
  $$('[data-schema-move]',shell).forEach(button => button.addEventListener('click', () => {
    const kind = button.dataset.schemaMove, items = active(kind), index = items.findIndex(item => item.id === button.dataset.schemaId), target = index + Number(button.dataset.direction);
    if (target < 0 || target >= items.length) return;
    const ids = items.map(item => item.id); [ids[index],ids[target]] = [ids[target],ids[index]];
    return mutate(base+'/schema-order','PUT',{kind,ids,versions:Object.fromEntries(items.map(item => [item.id,item.updatedAt]))},'Порядок сохранён');
  }));
  enhanceSelects(shell);
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


function persistChatDraft() {
  if (!state.chatDraftScope) return true;
  try {
    writeConversationDraft(localStorage,state.chatDraftScope,{body:state.chatDraftText||'',reply:state.chatReplyToId||'',linked:state.chatLinkedRecordId||'',nonce:state.chatDraftNonce||'',edit:state.chatEditingMessageId?{id:state.chatEditingMessageId,body:state.chatEditDraft?.body??state.chatMessages.find(item=>item.id===state.chatEditingMessageId)?.body??''}:null});
    return true;
  } catch (_) { toast('Не удалось сохранить черновик на устройстве. Оставьте диалог открытым.',true); return false; }
}
function restoreChatDraft() {
  const key=chatDraftKey(state.me?.id,state.activeWorkspaceId,state.activeChatThreadId);
  if (state.chatDraftScope===key) return;
  const draft=readConversationDraft(localStorage,key);
  state.chatDraftScope=key;state.chatDraftText=draft.body;state.chatReplyToId=draft.reply;state.chatLinkedRecordId=draft.linked;state.chatDraftNonce=draft.nonce;
  state.chatEditingMessageId=draft.edit?.id||'';state.chatEditDraft=draft.edit?{messageID:draft.edit.id,threadID:state.activeChatThreadId,context:captureProjectContext(),body:draft.edit.body}:null;state.chatHistoryQuery=null;state.chatHistoryAround='';state.chatSearch='';state.chatSearchOpen=false;state.chatFavoritesOnly=false;state.chatPins=[];
}
function activateChatConversation(id) {
  $('.chat-shell')?.classList.remove('show-threads');
  if(!persistChatDraft())return;
  state.activeChatThreadId=id;state.chatLoadedThreadId='';state.chatMessages=[];state.chatEmojiTarget='';
  restoreChatDraft();renderChat();
}
function updateChatComposerAction() {
  const form=$('#chat-composer');if(!form||state.chatRecording)return;
  const input=form.elements.body,hasContent=!!(input.value.trim()||state.chatLinkedRecordId||state.chatEditingMessageId);
  $('[data-chat-voice]',form).hidden=hasContent||state.chatSending;
  $('[type=submit]',form).hidden=!hasContent&&!state.chatSending;
  input.style.height='auto';const height=Math.max(44,input.scrollHeight);input.style.height=`${Math.min(160,height)}px`;input.style.overflowY=height>160?'auto':'hidden';
  syncChatViewport();
}
function syncChatViewport() {
  const main=$('#main-content');if(!main?.querySelector('.chat-shell'))return;
  const viewport=window.visualViewport;
  const bottom=viewport?viewport.height+viewport.offsetTop:innerHeight;
  main.style.setProperty('--chat-viewport-height',`${Math.max(200,bottom-main.getBoundingClientRect().top)}px`);
}
window.visualViewport?.addEventListener('resize',syncChatViewport);
window.addEventListener('resize',syncChatViewport);
async function jumpToChatMessage(id) {
  const message=$(`#chat-message-${CSS.escape(id)}`);
  if(message&&!state.chatSearch){message.scrollIntoView({behavior:'smooth',block:'center'});message.classList.add('highlight');return;}
  state.chatSearch='';state.chatSearchOpen=false;state.chatFavoritesOnly=false;state.chatHistoryAround=id;state.chatScrollTarget=id;state.chatHistoryQuery=null;
  await loadChatThread(state.activeChatThreadId);
}

function chatPresenceLabel(thread) {
	if (thread.kind !== 'direct') return `${thread.memberCount || 0} участников · ${thread.kind === 'group' ? 'Группа' : 'Общий чат проекта'}`;
	if (thread.partnerOnline) return 'в сети';
	if (!thread.partnerLastSeen) return 'ещё не заходил';
	const delta = Date.now() - new Date(thread.partnerLastSeen).getTime();
	if (delta < 5 * 60_000) return 'был недавно';
	return `был ${formatDate(thread.partnerLastSeen, true)}`;
}

function chatThreadTitle(thread) {
	if (!thread) return 'Диалог';
	return thread.kind === 'direct' ? (thread.partnerUsername || 'Личный диалог') : thread.kind === 'team' ? 'Общий чат проекта' : thread.title;
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

let chatEmojiStorage;
try { chatEmojiStorage = window.localStorage; } catch (_) { /* Optional preferences. */ }
const chatEmojiPreferences = createEmojiPreferences(chatEmojiStorage);
const chatEmojiPicker = createEmojiPickerUI({ preferences: chatEmojiPreferences, escapeHTML });
function chatRecentEmojiList() { return chatEmojiPreferences.quick(state.me?.id); }

function renderChatReactions(message) {
  return message.reactions.map(reaction => `<button type="button" class="chat-reaction ${reaction.mine ? 'mine' : ''}" data-chat-reaction="${message.id}" data-emoji="${escapeHTML(reaction.emoji)}" aria-pressed="${reaction.mine}" title="${escapeHTML(reaction.usernames.join(', '))}"><span>${escapeHTML(reaction.emoji)}</span><b>${reaction.count}</b></button>`).join('');
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
	if(message.messageType==='system')return `<div class="chat-system-event" id="chat-message-${message.id}" data-system-message="${message.id}"><span>${escapeHTML(message.body)}</span><time>${formatDate(message.createdAt,true)}</time></div>`;
	const mine = message.authorId === state.me.id;
	const reply = message.replyToId ? `<button type="button" class="chat-reply-preview" data-scroll-message="${message.replyToId}"><strong>${escapeHTML(message.replyAuthor)}</strong><span>${escapeHTML(markdownPlain(message.replyBody).slice(0, 120))}</span></button>` : '';
	const linked = message.linkedRecordId ? `<button type="button" class="chat-record-link" data-open-record="${message.linkedRecordId}"><span class="type-icon type-${message.linkedRecordType}">${icon(typeMeta[message.linkedRecordType]?.icon || 'fileText')}</span><span><small>${escapeHTML(typeMeta[message.linkedRecordType]?.singular || 'Карточка')}</small><strong>${escapeHTML(message.linkedRecordTitle)}</strong></span>${icon('chevronRight')}</button>` : '';
	const media = message.attachment ? chatMediaMarkup(message, `/api/chat/attachments/${message.attachment.id}`) : '';
	const reactions = renderChatReactions(message);
	const receipt = message.readBy.at(-1);
	const read = mine ? `<span class="chat-checks ${receipt ? 'read' : ''}" title="${receipt ? `Прочитано ${escapeHTML(formatDate(receipt.readAt, true))}` : 'Отправлено'}">${receipt ? '✓✓' : '✓'}</span>` : '';
	const ownActions = mine ? `${message.messageType === 'text' ? `<button type="button" data-chat-edit="${message.id}">${icon('edit')} Редактировать</button>` : ''}<button type="button" data-chat-archive="${message.id}">${icon('archive')} Убрать из чата</button>` : '';
	const projectActions = message.body ? `<button type="button" data-chat-create="decision" data-message-id="${message.id}">${icon('scale')} Зафиксировать решение</button><button type="button" data-chat-create="task" data-message-id="${message.id}">${icon('checkSquare')} Создать задачу</button>` : '';
	const quick = chatRecentEmojiList().slice(0, 5);
	return `<article class="chat-message ${mine ? 'mine' : ''} type-${message.messageType}" id="chat-message-${message.id}" data-chat-message="${message.id}"><div class="chat-bubble"><div class="chat-message-actions"><button type="button" data-chat-reply="${message.id}" title="Ответить" aria-label="Ответить">${icon('reply')}</button><button type="button" data-chat-emoji-more="${message.id}" title="Реакция" aria-label="Добавить реакцию">${icon('smile')}</button><details class="chat-message-menu"><summary aria-label="Другие действия">•••</summary><div><button type="button" data-chat-reply="${message.id}">${icon('reply')} Ответить</button><button type="button" data-chat-copy="${message.id}">${icon('copy')} Копировать</button><button type="button" data-chat-favorite="${message.id}">${icon('bookmark')} ${message.favorite ? 'Убрать из сохранённых' : 'Сохранить сообщение'}</button><button type="button" data-chat-pin="${message.id}">${icon('bookmark')} ${state.chatPins?.some(pin=>pin.id===message.id) ? 'Открепить для всех' : 'Закрепить в диалоге'}</button>${state.chatSearch ? `<button type="button" data-scroll-message="${message.id}">${icon('messages')} Открыть в переписке</button>` : ''}${projectActions}${ownActions}<span>${quick.map((emoji) => `<button type="button" data-chat-reaction="${message.id}" data-emoji="${escapeHTML(emoji)}">${escapeHTML(emoji)}</button>`).join('')}<button type="button" data-chat-emoji-more="${message.id}" aria-label="Все эмодзи">${icon('smile')}</button></span></div></details></div>${!mine ? `<header><strong>${escapeHTML(message.authorUsername)}</strong></header>` : ''}${reply}${message.body ? `<div class="markdown-body chat-message-body">${renderMarkdown(message.body)}</div>` : ''}${linked}${media}<footer>${message.favorite ? `<span class="chat-saved" title="Сохранено">${icon('bookmark')}</span>` : ''}<time>${formatDate(message.createdAt, true)}</time>${message.editedAt ? `<span title="Изменено ${escapeHTML(formatDate(message.editedAt, true))}">изменено</span>` : ''}${read}</footer></div>${reactions ? `<div class="chat-reactions">${reactions}<button type="button" class="chat-add-reaction" data-chat-emoji-more="${message.id}" aria-label="Добавить реакцию">${icon('smile')}</button></div>` : ''}</article>`;
}

let pendingChatRefresh = 0;
const pendingChatMarkup = new WeakMap();
async function refreshPendingChat() {
  const root = document.querySelector('[data-chat-outbox]');
  if (!root || state.view !== 'chat' || !offlineOutbox) return;
  const context = {owner:state.me?.id,workspace:state.activeWorkspaceId,thread:state.activeChatThreadId}, version = ++pendingChatRefresh;
  try {
    const all = await offlineOutbox.chatItems(context.owner);
    if (!root.isConnected || version !== pendingChatRefresh || context.owner !== state.me?.id || context.workspace !== state.activeWorkspaceId || context.thread !== state.activeChatThreadId) return;
    const items = pendingConversationItems(all,state.chatMessages,context);
    const labels = {queued:'Ожидает отправки',sending:'Отправляется',blocked:'Не удалось отправить',paused:'Повторы остановлены'};
    const markup = items.map(item => `<article class="chat-message mine chat-pending-message" data-pending-chat="${escapeHTML(item.id)}"><div class="chat-bubble">${item.payload?.body ? `<div class="markdown-body chat-message-body">${renderMarkdown(item.payload.body)}</div>` : ''}${item.fileName ? `<p class="chat-pending-file">${icon('fileText')} ${escapeHTML(item.fileName)}</p>` : ''}${item.payload?.linkedRecordId ? '<small>Прикреплена карточка</small>' : ''}<footer><time>${formatDate(new Date(item.createdAt).toISOString(),true)}</time><span>${escapeHTML(labels[item.status] || 'Ожидает отправки')}</span></footer>${item.error ? `<p class="chat-pending-error">${escapeHTML(item.error)}</p>` : ''}<div class="chat-pending-actions">${['queued','blocked','paused'].includes(item.status) ? '<button type="button" class="text-button" data-pending-retry>Повторить</button>' : ''}<button type="button" class="text-button" data-pending-queue>В очереди</button></div></div></article>`).join('');
    if (pendingChatMarkup.get(root) === markup) return;
    const list = root.closest('.chat-messages'), bottom = list.scrollHeight-list.scrollTop-list.clientHeight < 64, top = list.scrollTop;
    pendingChatMarkup.set(root,markup); root.innerHTML = markup;
    root.querySelectorAll('[data-pending-chat]').forEach(row => {
      row.querySelector('[data-pending-queue]').onclick = () => offlineOutbox.open();
      row.querySelector('[data-pending-retry]')?.addEventListener('click',async event => {
        event.currentTarget.disabled = true;
        const button = event.currentTarget;
        try { await offlineOutbox.retry(row.dataset.pendingChat); } catch(error) {toast(error.message,true);void refreshPendingChat();}
        finally {if(button.isConnected) button.disabled = false;}
      });
    });
    const empty = list.querySelector('.chat-empty'); if (empty) empty.hidden = items.length > 0;
    requestAnimationFrame(() => {if(root.isConnected) list.scrollTop = bottom ? list.scrollHeight : top;});
  } catch(error) {if(root.isConnected) root.textContent = 'Не удалось прочитать очередь этого браузера. Откройте очередь отправки.';}
}
window.addEventListener('tessavie-outbox-change',()=>{void refreshPendingChat();});

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
	if (state.chatFavoritesOnly) {
		const context = $('.chat-context-stack', main);
		context?.insertAdjacentHTML('afterbegin', `<div class="chat-filter-notice"><span>${icon('bookmark')} Сохранённые сообщения</span><button type="button" class="text-button" data-chat-clear-favorites>Показать все</button></div>`);
		$('[data-chat-clear-favorites]', main)?.addEventListener('click', () => { state.chatFavoritesOnly = false; state.chatLoadedThreadId = ''; renderChat(); });
		const empty = $('.chat-empty', main);
		if (empty) { $('strong', empty).textContent = 'Сохранённых сообщений нет'; $('p', empty).textContent = 'Сохраните нужное сообщение через его меню или вернитесь ко всей переписке.'; }
	}
	main.insertAdjacentHTML('beforeend', `<div class="chat-drop-overlay" aria-hidden="true"><span>${icon('fileText')}</span><strong>Отправить файлы</strong><small>Отпустите их в любом месте диалога</small></div>`);
	const form = $('#chat-composer');
	if (!form) return;
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

let chatListSearch={context:'',query:''};
function chatListQuery() {
  const context=JSON.stringify([state.me?.id,state.activeWorkspaceId,state.projectContextEpoch||0]);
  if(chatListSearch.context!==context)chatListSearch={context,query:''};
  return chatListSearch.query;
}
function applyChatListFilter() {
  const query=chatListQuery(), matching=new Set(filterConversations(state.chatThreads,query,chatThreadTitle).map(item=>item.id));
  $$('[data-chat-thread]').forEach(button=>{button.hidden=!matching.has(button.dataset.chatThread);});
  const empty=$('[data-chat-list-empty]');if(empty)empty.hidden=!query.trim()||matching.size>0;
  const clear=$('[data-clear-chat-list-search]');if(clear)clear.hidden=!query;
  const count=$('[data-chat-list-count]');if(count)count.textContent=query.trim()?`Найдено диалогов: ${matching.size}`:'';
}

function renderChat() {
  const drawerOpen=$('.chat-shell')?.classList.contains('show-threads');
  const listQuery=chatListQuery();
  const oldList=$('.chat-messages');
  const scroll=oldList?{thread:oldList.dataset.thread,top:oldList.scrollTop,height:oldList.scrollHeight,bottom:oldList.scrollHeight-oldList.scrollTop-oldList.clientHeight<64}:null;
  const focused=document.activeElement;
  const focusInfo=focused?.matches?.('#chat-composer textarea,.chat-search input,.chat-list-search input')?{selector:focused.matches('textarea')?'#chat-composer textarea':focused.closest('.chat-list-search')?'.chat-list-search input':'.chat-search input',start:focused.selectionStart,end:focused.selectionEnd}:null;
  chatEmojiPicker.close(false);
	clearTimeout(state.chatPollTimer);
	const selected=chooseConversation(localStorage,state.me?.id,state.activeWorkspaceId,state.chatThreads,state.activeChatThreadId);
  if(selected!==state.activeChatThreadId){state.activeChatThreadId=selected;state.chatLoadedThreadId='';state.chatMessages=[];}
	restoreChatDraft();persistChatDraft();
	const thread = state.chatThreads.find((item) => item.id === state.activeChatThreadId);
	if (thread && state.chatLoadedThreadId !== thread.id) {
		$('#main-content').innerHTML = `<div class="chat-loading"><span class="spinner"></span><strong>Открываем диалог</strong></div>`;
		loadChatThread(thread.id);
		return;
	}
	const messages = chatFilteredMessages();
	const editingMessage = state.chatMessages.find((message) => message.id === state.chatEditingMessageId) || (state.chatEditingMessageId && state.chatEditDraft ? {id:state.chatEditingMessageId,body:state.chatEditDraft.body} : null);
	const editDraft = state.chatEditDraft;
	const editingBody = editingMessage && editDraft?.messageID === editingMessage.id && editDraft.threadID === state.activeChatThreadId && isProjectContextCurrent(editDraft.context) ? editDraft.body : editingMessage?.body;
	const threadTitle = chatThreadTitle(thread);
	$('#main-content').innerHTML = `<section class="chat-shell ${drawerOpen ? 'show-threads' : ''}">
		<button type="button" class="chat-thread-backdrop" data-close-chat-threads aria-label="Закрыть список диалогов"></button>
		<aside class="chat-thread-list"><header><div><h1>Сообщения</h1><p>Диалоги, группы и работа проекта</p></div><button type="button" class="icon-button" data-new-chat-thread title="Новый разговор" aria-label="Новый разговор">${icon('plus')}</button><label class="chat-list-search">${icon('search')}<input type="search" maxlength="120" autocomplete="off" placeholder="Найти диалог" aria-label="Найти диалог" value="${escapeHTML(listQuery)}"><button type="button" class="icon-button" data-clear-chat-list-search aria-label="Очистить поиск диалогов" hidden>${icon('x')}</button></label></header><div>${state.chatThreads.map((item) => `<button type="button" class="chat-thread ${item.id === state.activeChatThreadId ? 'active' : ''}" data-chat-thread="${item.id}">${avatarMarkup(state.users.find((user) => user.username === item.partnerUsername) || { username: item.kind === 'team' ? item.partnerUsername || 'П' : item.title })}<span><strong>${escapeHTML(chatThreadTitle(item))}</strong><small>${escapeHTML(item.lastMessage || (item.kind === 'record' ? 'Обсуждение карточки' : chatPresenceLabel(item)))}</small></span><time datetime="${escapeHTML(item.lastMessageAt || '')}" title="${escapeHTML(formatDate(item.lastMessageAt, true))}">${escapeHTML(conversationTimeLabel(item.lastMessageAt))}${item.pinned ? `<span class="chat-personal-pin" title="Закреплён в вашем списке" aria-label="Закреплён в вашем списке">${icon('pin')}</span>` : ''}</time>${item.unreadCount ? `<b>${item.unreadCount}</b>` : ''}</button>`).join('') || '<div class="guided-empty compact">Диалоги ещё не созданы</div>'}<p class="chat-list-empty" data-chat-list-empty hidden>Диалог не найден. Попробуйте другое имя или название.</p><span class="sr-only" data-chat-list-count role="status"></span></div></aside>
		<main class="chat-main">${thread ? `<header class="chat-header"><button type="button" class="chat-mobile-threads icon-button" data-toggle-chat-threads title="Диалоги" aria-label="Диалоги">${icon('menu')}</button>${avatarMarkup(state.users.find((user) => user.username === thread.partnerUsername) || { username: thread.partnerUsername || thread.title })}<div><h2>${thread.kind === 'group' ? `<button type="button" class="chat-group-title" data-chat-group title="Участники и настройки">${escapeHTML(threadTitle)}</button>` : escapeHTML(threadTitle)}</h2><p class="${thread.partnerOnline ? 'online' : ''}">${thread.kind === 'record' ? `Ветка карточки · ${escapeHTML(thread.recordTitle)}` : escapeHTML(chatPresenceLabel(thread))}</p></div><div class="chat-header-actions">${thread.recordId ? `<button type="button" class="icon-button" data-open-record="${thread.recordId}" title="Открыть карточку">${icon('link')}</button>` : ''}<button type="button" class="icon-button ${state.chatSearchOpen ? 'active' : ''}" data-toggle-chat-search title="Поиск в диалоге">${icon('search')}</button><details class="chat-header-more"><summary class="icon-button" aria-label="Действия диалога" title="Действия диалога">${icon('more')}</summary><div>${thread.kind === 'group' ? `<button type="button" data-chat-group>${icon('users')}<span>Участники и настройки</span></button>` : ''}<button type="button" data-chat-personal-pin title="Только в вашем списке разговоров">${icon('pin')}<span>${thread.pinned ? 'Открепить из списка' : 'Закрепить в списке'}</span></button><button type="button" data-chat-ai-digest>${icon('sparkles')}<span>Собрать AI-выжимку</span></button><button type="button" class="${state.chatFavoritesOnly ? 'active' : ''}" data-chat-favorites>${icon('bookmark')}<span>${state.chatFavoritesOnly ? 'Все сообщения' : 'Сохранённые сообщения'}</span></button><button type="button" data-start-call>${icon('phone')}<span>Аудиозвонок</span></button></div></details></div>${state.chatSearchOpen ? `<label class="chat-search">${icon('search')}<input type="search" value="${escapeHTML(state.chatSearch)}" placeholder="Найти сообщение" aria-label="Поиск в диалоге"><button type="button" data-close-chat-search aria-label="Закрыть поиск">${icon('x')}</button></label>` : ''}</header><div class="chat-context-stack">${renderChatCallBanner(thread)}${renderChatDigest(thread)}${state.chatPins?.length ? `<details class="chat-pinned-list"><summary>Закреплённые · ${state.chatPins.length}</summary>${state.chatPins.map(pin=>`<button type="button" data-scroll-message="${pin.id}"><strong>${escapeHTML(pin.author)}</strong><span>${escapeHTML(markdownPlain(pin.body).slice(0,180)||'Вложение')}</span></button>`).join('')}</details>` : ''}</div><div class="chat-messages" data-drag-scroll="true">${state.chatHistoryAround ? `<button type="button" class="text-button chat-history-latest" data-chat-latest>К последним сообщениям</button>` : ''}${state.chatHistoryMore ? `<button type="button" class="text-button chat-history-older" data-chat-history-older>Ранние сообщения</button>` : ''}${renderChatTimeline(messages) || `<div class="chat-empty"><span>${icon(state.chatSearch ? 'search' : 'messages')}</span><strong>${state.chatSearch ? 'Совпадений нет' : 'Начните разговор'}</strong><p>${state.chatSearch ? 'Измените запрос или очистите поиск.' : `Напишите ${escapeHTML(threadTitle)} или прикрепите карточку проекта.`}</p></div>`}${state.chatHistoryAround && state.chatHistoryNewer && !state.chatSearch && !state.chatFavoritesOnly ? `<button type="button" class="text-button chat-history-newer" data-chat-history-newer>Следующие сообщения</button>` : ''}</div><div class="chat-composer-context">${editingMessage ? `<div><span>${icon('edit')}</span><span><strong>Редактирование сообщения</strong><small>Предыдущая версия останется в журнале.</small></span><button type="button" data-clear-chat-edit>${icon('x')}</button></div>` : ''}${state.chatReplyToId ? (() => { const reply = state.chatMessages.find((item) => item.id === state.chatReplyToId); return `<div><span>${icon('reply')}</span><span><strong>Ответ ${escapeHTML(reply?.authorUsername || '')}</strong><small>${escapeHTML(chatMessagePreview(reply || {}).slice(0, 120))}</small></span><button type="button" data-clear-chat-reply aria-label="Отменить ответ">${icon('x')}</button></div>`; })() : ''}${state.chatLinkedRecordId ? (() => { const linked = state.records.find((item) => item.id === state.chatLinkedRecordId); return `<div><span>${icon('link')}</span><span><strong>Прикреплена карточка</strong><small>${escapeHTML(linked?.title || '')}</small></span><button type="button" data-clear-chat-record>${icon('x')}</button></div>`; })() : ''}</div><form class="chat-composer" id="chat-composer"><label class="chat-drop" data-chat-drop><textarea name="body" rows="1" placeholder="${editingMessage ? 'Исправьте сообщение' : 'Сообщение'}" aria-label="Сообщение" ${state.chatSending ? 'disabled' : ''}>${escapeHTML(editingBody ?? state.chatDraftText)}</textarea><input type="file" name="file" multiple hidden></label><div class="chat-composer-actions"><details class="chat-composer-more"><summary class="icon-button" title="Вложения и дополнительные действия" aria-label="Вложения и дополнительные действия">${icon('plus')}</summary><div><button type="button" class="${state.chatEmojiTarget === 'composer' ? 'active' : ''}" data-chat-composer-emoji ${state.chatSending ? 'disabled' : ''}>${icon('smile')}<span>Эмодзи</span></button><button type="button" data-chat-attach ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('fileText')}<span>Отправить файл</span></button><button type="button" data-chat-link-record ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('link')}<span>Прикрепить карточку</span></button><button type="button" data-chat-video ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('video')}<span>Видеосообщение</span></button></div></details><button type="button" class="icon-button" data-chat-voice title="Записать голосовое" aria-label="Записать голосовое" ${editingMessage || state.chatSending ? 'disabled' : ''}>${icon('mic')}</button><button type="submit" class="primary icon-button" title="${editingMessage ? 'Сохранить' : 'Отправить'}" aria-label="${editingMessage ? 'Сохранить сообщение' : 'Отправить сообщение'}" ${state.chatSending ? 'disabled' : ''}>${state.chatSending ? '<span class="spinner"></span>' : icon(editingMessage ? 'check' : 'send')}</button></div><div class="chat-upload-progress" hidden><span></span><progress max="100" value="0"></progress></div></form>` : `<div class="chat-empty"><strong>Выберите диалог</strong></div>`}</main>
	</section>`;
	decorateChatUI();
	const mobileThreadsButton = $('[data-toggle-chat-threads]');
	if (mobileThreadsButton) mobileThreadsButton.innerHTML = icon('messages');
	bindChatEvents();
	$('.chat-messages')?.insertAdjacentHTML('beforeend','<div class="chat-pending-list" data-chat-outbox></div>');
	void refreshPendingChat();
	bindOpenRecords();
	updateChatComposerAction();
	requestAnimationFrame(() => {
    const list=$('.chat-messages');if(!list)return;list.dataset.thread=thread?.id||'';
    if(state.chatScrollTarget){const target=$(`#chat-message-${CSS.escape(state.chatScrollTarget)}`);target?.scrollIntoView({block:'center'});target?.classList.add('highlight');state.chatScrollTarget='';}
    else if(scroll?.thread===thread?.id&&(!scroll.bottom||state.chatAppending))list.scrollTop=scroll.top+(state.chatPrepending?list.scrollHeight-scroll.height:0);
    else list.scrollTop=list.scrollHeight;
    state.chatPrepending=false;state.chatAppending=false;
    if(focusInfo&&scroll?.thread===thread?.id){const input=$(focusInfo.selector);input?.focus({preventScroll:true});input?.setSelectionRange(focusInfo.start,focusInfo.end);}
  });
	scheduleChatPoll();
}

async function loadChatThread(threadID, silent = false, older = false, newer = false) {
  const context=captureProjectContext(),query=state.chatSearch||'',around=state.chatHistoryAround||'',favorites=!!state.chatFavoritesOnly;
  const signature=`${threadID}:${query}:${favorites}:${around}`;
  if((older||newer)&&state.chatHistoryLoading)return;
  if(silent&&(state.chatHistoryLoading||state.chatInputComposing||state.chatRecording||document.querySelector('.chat-message-menu[open],.chat-header-more[open],.chat-composer-more[open]')||[...document.querySelectorAll('.chat-messages audio,.chat-messages video')].some(media=>!media.paused)))return;
  const request=state.chatLoadRequest=(state.chatLoadRequest||0)+1;
  const params=new URLSearchParams();if(query)params.set('q',query);if(favorites)params.set('favorites','true');
  if(newer&&state.chatHistoryAfter)params.set('after',state.chatHistoryAfter);
  else {if(around)params.set('around',state.chatHistoryQuery===signature&&state.chatHistoryAfter||around);if(older&&state.chatHistoryBefore)params.set('before',state.chatHistoryBefore);}
  const list=$('.chat-messages'),atBottom=!list||list.scrollHeight-list.scrollTop-list.clientHeight<64;
  state.chatHistoryLoading=true;
  try {
    const [page,threads,pins]=await Promise.all([api(`/api/chat/threads/${threadID}/history?${params}`),api('/api/chat/threads'),api(`/api/chat/threads/${threadID}/pins`)]);
    if(!isProjectContextCurrent(context)||request!==state.chatLoadRequest||threadID!==state.activeChatThreadId)return;
    const previous=JSON.stringify([state.chatMessages,state.chatPins,state.chatThreads,state.chatHistoryNewer]);
    if(state.chatHistoryQuery!==signature){state.chatMessages=page.messages;state.chatHistoryMore=page.hasMore;state.chatHistoryBefore=page.nextBefore;state.chatHistoryAfter=page.nextAfter;state.chatHistoryNewer=page.hasNewer;}
    else if(older){state.chatMessages=mergeChatHistory(page.messages,state.chatMessages);state.chatHistoryMore=page.hasMore;state.chatHistoryBefore=page.nextBefore;state.chatPrepending=true;}
    else if(newer){state.chatMessages=mergeChatHistory(state.chatMessages,page.messages);state.chatHistoryAfter=page.nextAfter||state.chatHistoryAfter;state.chatHistoryNewer=page.hasNewer;state.chatAppending=true;}
    else {
      const oldest=page.messages[0];
      const prefix=oldest?state.chatMessages.filter(item=>item.createdAt<oldest.createdAt||item.createdAt===oldest.createdAt&&item.id<oldest.id):[];
      state.chatMessages=mergeChatHistory(prefix,page.messages);
      if(!prefix.length){state.chatHistoryMore=page.hasMore;state.chatHistoryBefore=page.nextBefore;}
      state.chatHistoryAfter=page.nextAfter||state.chatHistoryAfter;state.chatHistoryNewer=page.hasNewer;
    }
    state.chatThreads=threads;state.chatPins=pins;state.chatHistoryQuery=signature;state.chatLoadedThreadId=threadID;
    if(!query&&!around&&atBottom&&document.visibilityState==='visible'&&threads.find(item=>item.id===threadID)?.unreadCount>0) {
      await api(`/api/chat/threads/${threadID}/read`,{method:'POST'});
      if(!isProjectContextCurrent(context)||request!==state.chatLoadRequest)return;
      const thread=state.chatThreads.find(item=>item.id===threadID);if(thread)thread.unreadCount=0;
    }
    renderNav();
    if(state.view==='chat'&&(!silent||previous!==JSON.stringify([state.chatMessages,state.chatPins,state.chatThreads,state.chatHistoryNewer])))renderChat();
  }catch(error){
    if(isProjectContextCurrent(context)&&request===state.chatLoadRequest){
      state.chatHistoryError=error.message;
      if(error.status===403){
        // Membership can be revoked while this conversation is open on another device.
        const draftSaved=persistChatDraft();state.chatMessages=[];state.chatPins=[];state.chatDigests.delete(threadID);
        if(document.querySelector('#workspace-dialog .chat-group-dialog'))closeDialogImmediately($('#workspace-dialog'));
        cleanupChatCall();state.chatIncomingCall=null;
        state.chatThreads=state.chatThreads.filter(thread=>thread.id!==threadID);
        state.activeChatThreadId='';state.chatLoadedThreadId='';
        if(state.view==='chat')$('#main-content').innerHTML='<div class="chat-empty"><strong>Доступ к разговору закрыт</strong></div>';
        try {const threads=await api('/api/chat/threads');if(isProjectContextCurrent(context)&&request===state.chatLoadRequest)state.chatThreads=threads;}catch(_){}
        if(isProjectContextCurrent(context)&&request===state.chatLoadRequest&&state.view==='chat'){activateChatConversation(chooseConversation(localStorage,state.me.id,state.activeWorkspaceId,state.chatThreads));toast(draftSaved?'Доступ к разговору закрыт. Ваш черновик сохранён на этом устройстве.':'Доступ к разговору закрыт. Не удалось сохранить черновик в браузере.',true);}
      }else if(!silent)toast(error.message,true);
    }
  }
  finally{if(request===state.chatLoadRequest)state.chatHistoryLoading=false;}
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

async function uploadChatFiles(files, context = null, payload = null) {
  const batch = [...files].filter(file => file?.size > 0);
  if (!batch.length) return false;
  context ||= offlineOutbox.context(state.activeChatThreadId, state.chatThreads.find(thread => thread.id === state.activeChatThreadId)?.title);
  payload ||= { replyToId: state.chatReplyToId, linkedRecordId: state.chatLinkedRecordId };
  try {
    await offlineOutbox.addFiles(batch,context,payload);
    if (context.owner === state.me?.id && !(state.view === 'chat' && context.workspace === state.activeWorkspaceId && context.thread === state.activeChatThreadId)) toastAction('Файлы сохранены в браузере и ожидают отправки.', 'Очередь', () => offlineOutbox.open());
    void offlineOutbox.pump();
    return true;
  } catch (error) { toast(error.message || 'Не удалось сохранить файлы в браузере',true); return false; }
}

async function startChatRecording(kind = 'voice') {
	if (state.chatRecording) return;
  const destination = offlineOutbox.context(state.activeChatThreadId,state.chatThreads.find(thread => thread.id === state.activeChatThreadId)?.title);
  const messagePayload = { replyToId: state.chatReplyToId, linkedRecordId: state.chatLinkedRecordId };
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
			await uploadChatFiles([file],destination,messagePayload);
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

const chatReactionPending = new Set();
function chatReactionIntent(messageID, value, context) {
  const key = `${context.user}:${context.workspace}:${messageID}:${emojiKey(value)}`;
  const message = state.chatMessages.find(item => item.id === messageID);
  return { key, active: !message?.reactions.some(item => item.mine && emojiKey(item.emoji) === emojiKey(value)) };
}

async function saveChatReaction(messageID, value, context, threadID, intent) {
  if (!isProjectContextCurrent(context) || state.activeChatThreadId !== threadID) throw new Error('Обсуждение изменилось. Откройте выбор реакции заново.');
  if (chatReactionPending.has(intent.key)) return false;
  chatReactionPending.add(intent.key);
  try {
    await api(`/api/chat/messages/${messageID}/reaction`, { method: 'PUT', headers: { 'X-Workspace-ID': context.workspace, 'X-Outbox-Owner': String(context.user) }, body: JSON.stringify({ emoji: value, active: intent.active }) });
    if (!isProjectContextCurrent(context) || state.activeChatThreadId !== threadID || state.view !== 'chat') return false;
    // Update only reactions. Replacing the chat would discard selection and unsaved edits.
    const message = state.chatMessages.find(item => item.id === messageID);
    if (message) {
      const existing = message.reactions.find(item => emojiKey(item.emoji) === emojiKey(value));
      if (existing && existing.mine !== intent.active) {
        existing.count += intent.active ? 1 : -1; existing.mine = intent.active;
        existing.usernames = existing.usernames.filter(name => name !== state.me.username);
        if (intent.active) existing.usernames.push(state.me.username);
      } else if (!existing && intent.active) message.reactions.push({ emoji: value, mine: true, count: 1, usernames: [state.me.username] });
      message.reactions = message.reactions.filter(item => item.count > 0);
      const article = document.getElementById(`chat-message-${messageID}`);
      if (article) {
        let strip = $('.chat-reactions', article);
        if (!strip) { strip = document.createElement('div'); strip.className = 'chat-reactions'; article.append(strip); }
        strip.innerHTML = renderChatReactions(message) + `<button type="button" class="chat-add-reaction" data-chat-emoji-more="${messageID}" aria-label="Добавить реакцию">${icon('smile')}</button>`;
        bindChatReactionButtons(strip);
      }
    }
    return intent.active;
  } catch (error) {
    if (['NETWORK_UNAVAILABLE', 'REQUEST_TIMEOUT'].includes(error.code)) error.message = 'Не удалось получить подтверждение. Повторите сохранение реакции.';
    throw error;
  } finally { chatReactionPending.delete(intent.key); }
}

function openChatEmojiPicker(target, trigger) {
  const context = captureProjectContext(), threadID = state.activeChatThreadId, editingID = state.chatEditingMessageId;
  const textarea = $('#chat-composer textarea'), selection = textarea ? [textarea.selectionStart, textarea.selectionEnd] : [0, 0];
  const parent = $('.chat-main');
  if (!parent) return;
  const intents = new Map();
  const current = () => isProjectContextCurrent(context) && state.view === 'chat' && state.activeChatThreadId === threadID && state.chatEditingMessageId === editingID;
  chatEmojiPicker.open({ owner: context.user, target, trigger, restoreFocus: target === 'composer' ? textarea : trigger, parent, current,
    onClose() { state.chatEmojiTarget = ''; },
    async onChoose(value) {
      if (!current()) throw new Error('Обсуждение изменилось. Откройте выбор эмодзи заново.');
      if (target === 'composer') {
        if (!textarea?.isConnected) throw new Error('Редактор закрыт. Откройте выбор эмодзи заново.');
        insertEmojiAtSelection(textarea, value, ...selection);
        textarea.focus({ preventScroll: true });
        return true;
      }
      if (!intents.has(value)) intents.set(value, chatReactionIntent(target, value, context));
      return saveChatReaction(target, value, context, threadID, intents.get(value));
    },
  });
  state.chatEmojiTarget = document.querySelector('.chat-emoji-picker') ? target : '';
}

function bindChatReactionButtons(root = document) {
  $$('[data-chat-emoji-more]', root).forEach(button => button.addEventListener('click', () => openChatEmojiPicker(button.dataset.chatEmojiMore, button)));
  $$('[data-chat-reaction]', root).forEach(button => {
    let intent;
    button.addEventListener('click', async () => {
    const context = captureProjectContext(), value = button.dataset.emoji, messageID = button.dataset.chatReaction;
    intent ||= chatReactionIntent(messageID, value, context);
    button.disabled = true;
    try {
      const remember = await saveChatReaction(messageID, value, context, state.activeChatThreadId, intent);
      intent = null;
      if (remember && isProjectContextCurrent(context)) chatEmojiPreferences.remember(context.user, value);
    } catch (error) { if (isProjectContextCurrent(context)) toast(error.message, true); }
    finally { button.disabled = false; }
    });
  });
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
  applyChatListFilter();
  const listSearch=$('.chat-list-search input');
  listSearch?.addEventListener('compositionstart',()=>{state.chatInputComposing=true;});
  listSearch?.addEventListener('compositionend',()=>{state.chatInputComposing=false;});
  listSearch?.addEventListener('input',()=>{chatListQuery();chatListSearch.query=listSearch.value;applyChatListFilter();});
  $('[data-clear-chat-list-search]')?.addEventListener('click',()=>{chatListSearch.query='';listSearch.value='';applyChatListFilter();listSearch.focus();});
	$$('[data-chat-thread]').forEach(button=>button.addEventListener('click',()=>activateChatConversation(button.dataset.chatThread)));
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
  $('[data-chat-personal-pin]')?.addEventListener('click', async event => {
    const button=event.currentTarget, thread=state.chatThreads.find(item=>item.id===state.activeChatThreadId);
    if(!thread)return;
    const context=captureProjectContext(), pinned=!thread.pinned;
    button.disabled=true;
    try {
      await api(`/api/chat/threads/${thread.id}/personal-pin`,{method:'PUT',headers:{'X-Workspace-ID':context.workspace},body:JSON.stringify({pinned})});
      if(!isProjectContextCurrent(context)||state.view!=='chat'||state.activeChatThreadId!==thread.id)return;
      button.closest('details').open=false;
      await loadChatThread(thread.id);
      toast(pinned?'Разговор закреплён в вашем списке':'Разговор откреплён из списка');
    } catch(error) {if(isProjectContextCurrent(context))toast(error.message,true);}
    finally {if(button.isConnected)button.disabled=false;}
  });
	$('[data-new-chat-thread]')?.addEventListener('click',()=>createChatWorkspaceUI({state,api,esc:escapeHTML,icon,openModal,closeDialog:requestDialogClose,toast,activate:activateChatConversation}).openNew());
	$$('[data-chat-group]').forEach(button=>button.addEventListener('click',()=>{const groupContext=captureProjectContext();const menu=button.closest('details');if(menu)menu.open=false;createChatGroupUI({state,api,esc:escapeHTML,icon,openModal,closeDialog:requestDialogClose,toast,refresh:async(thread,left)=>{const context=groupContext;if(!isProjectContextCurrent(context))return;const threads=await api('/api/chat/threads');if(!isProjectContextCurrent(context))return;state.chatThreads=threads;if(left){activateChatConversation(chooseConversation(localStorage,state.me.id,state.activeWorkspaceId,threads));}else if(state.activeChatThreadId===thread){await loadChatThread(thread);}}}).open(state.activeChatThreadId);}));
	$('[data-chat-history-older]')?.addEventListener('click',()=>loadChatThread(state.activeChatThreadId,false,true));
	$('[data-chat-history-newer]')?.addEventListener('click',()=>loadChatThread(state.activeChatThreadId,false,false,true));
	$('[data-chat-latest]')?.addEventListener('click',async()=>{const thread=state.activeChatThreadId,context=captureProjectContext();state.chatHistoryAround='';state.chatHistoryQuery=null;await loadChatThread(thread);requestAnimationFrame(()=>{if(isProjectContextCurrent(context)&&thread===state.activeChatThreadId&&!state.chatHistoryAround&&!state.chatSearch){const list=$('.chat-messages');if(list)list.scrollTop=list.scrollHeight;}});});
	$$('[data-chat-pin]').forEach(button=>button.addEventListener('click',async()=>{const id=button.dataset.chatPin,context=captureProjectContext(),thread=state.activeChatThreadId;try{await api(`/api/chat/threads/${thread}/pins`,{method:'PUT',body:JSON.stringify({messageId:id,pinned:!state.chatPins?.some(pin=>pin.id===id)})});if(isProjectContextCurrent(context)&&state.activeChatThreadId===thread)await loadChatThread(thread);}catch(error){toast(error.message,true);}}));
	$('[data-chat-favorites]')?.addEventListener('click', () => { state.chatFavoritesOnly = !state.chatFavoritesOnly; state.chatLoadedThreadId = ''; renderChat(); });
	$('[data-toggle-chat-search]')?.addEventListener('click', () => { state.chatSearchOpen = !state.chatSearchOpen; if (!state.chatSearchOpen) { state.chatSearch = ''; state.chatLoadedThreadId=''; } renderChat(); requestAnimationFrame(() => $('.chat-search input')?.focus()); });
	$('[data-close-chat-search]')?.addEventListener('click', () => { state.chatSearchOpen = false; state.chatSearch = ''; state.chatHistoryQuery=null; loadChatThread(state.activeChatThreadId); });
	$('.chat-search input')?.addEventListener('input', (event) => {
		state.chatSearch = event.target.value;
		clearTimeout(state.chatSearchTimer);
		state.chatSearchTimer=setTimeout(()=>loadChatThread(state.activeChatThreadId),250);
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
	bindChatReactionButtons();
	$('[data-chat-composer-emoji]')?.addEventListener('click', event => openChatEmojiPicker('composer', event.currentTarget));
	$('[data-clear-chat-reply]')?.addEventListener('click', () => { state.chatReplyToId = ''; renderChat(); });
	$('[data-clear-chat-record]')?.addEventListener('click', () => { state.chatLinkedRecordId = ''; renderChat(); });
	$('[data-clear-chat-edit]')?.addEventListener('click', () => { state.chatEditingMessageId = ''; renderChat(); $('#chat-composer textarea')?.focus(); });
	$$('[data-chat-edit]').forEach((button) => button.addEventListener('click', () => {
		state.chatEditingMessageId = button.dataset.chatEdit; state.chatReplyToId = ''; state.chatLinkedRecordId = '';
		state.chatEditDraft = null;
		renderChat(); const editor = $('#chat-composer textarea'); editor?.focus(); editor?.setSelectionRange(editor.value.length, editor.value.length);
	}));
	$$('[data-chat-archive]').forEach((button) => button.addEventListener('click', async () => {
		const reason = await askText({ title: 'Убрать сообщение из чата', label: 'Почему сообщение больше не должно отображаться?', required: true });
		if (!reason) return;
		try { await api(`/api/chat/messages/${button.dataset.chatArchive}`, { method: 'DELETE', body: JSON.stringify({ reason }) }); state.chatMessages=state.chatMessages.filter(item=>item.id!==button.dataset.chatArchive); await loadChatThread(state.activeChatThreadId); }
		catch (error) { toast(error.message, true); }
	}));
	$$('[data-chat-favorite]').forEach((button) => button.addEventListener('click', async () => { await api(`/api/chat/messages/${button.dataset.chatFavorite}/favorite`, { method: 'POST' }); await loadChatThread(state.activeChatThreadId); }));

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
      popup.style.setProperty('--chat-menu-left',`${Math.max(8,Math.min(innerWidth-246,trigger.left))}px`);
      const height=Math.min(popup.scrollHeight,openUp?availableAbove:availableBelow);
      popup.style.setProperty('--chat-menu-top',`${Math.max(8,Math.min(innerHeight-height-8,openUp?trigger.top-height-6:trigger.bottom+6))}px`);
		});
	}));
	$$('[data-scroll-message]').forEach(button=>button.addEventListener('click',()=>jumpToChatMessage(button.dataset.scrollMessage)));
	$('[data-chat-link-record]')?.addEventListener('click', async () => { const records = state.records.filter(isActiveRecord); const id = await askChoice({ title: 'Прикрепить карточку', label: 'Карточка откроется прямо из сообщения', choices: records.map((record) => ({ value: record.id, label: `${typeMeta[record.type].singular}: ${record.title}` })) }); if (id) { state.chatLinkedRecordId = id; renderChat(); $('#chat-composer textarea')?.focus(); } });
	bindChatMediaPlayers(); bindChatMessageGestures(); bindChatDropSurface();
	const form = $('#chat-composer'); if (!form) return;
	if (state.chatRecording) {
		$('[data-cancel-chat-recording]', form)?.addEventListener('click', () => finishChatRecording(false));
		$('[data-send-chat-recording]', form)?.addEventListener('click', () => finishChatRecording(true));
		return;
	}
	const textarea = form.elements.body; const input = form.elements.file; const drop = $('[data-chat-drop]', form);
	textarea.addEventListener('compositionstart',()=>{state.chatInputComposing=true;});textarea.addEventListener('compositionend',()=>{state.chatInputComposing=false;});
	textarea.addEventListener('input', () => {
		if (state.chatEditingMessageId) {
			state.chatEditDraft = { messageID: state.chatEditingMessageId, threadID: state.activeChatThreadId, context: captureProjectContext(), body: textarea.value };
			persistChatDraft();updateChatComposerAction();return;
		}
		state.chatDraftText = textarea.value;
		state.chatDraftNonce = '';persistChatDraft();updateChatComposerAction();
	});
	textarea.addEventListener('keydown', (event) => { if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && !window.matchMedia('(pointer: coarse)').matches) { event.preventDefault(); form.requestSubmit(); } });
	textarea.addEventListener('paste', async (event) => { const files = [...(event.clipboardData?.files || [])]; if (!files.length) return; event.preventDefault(); await uploadChatFiles(files); });
	form.addEventListener('submit', async (event) => {
		event.preventDefault();
		if (state.chatSending) return;
		const body = textarea.value.trim();
		if (state.chatEditingMessageId) {
			if (!body) return toast('Сообщение не может быть пустым', true);
			state.chatSending = true; renderChat();
			const editContext=captureProjectContext(),editThread=state.activeChatThreadId,editID=state.chatEditingMessageId;
            try { await api(`/api/chat/messages/${editID}`, { method: 'PATCH', body: JSON.stringify({ body }) });
              if(isProjectContextCurrent(editContext)&&state.activeChatThreadId===editThread){const message=state.chatMessages.find(item=>item.id===editID);if(message){message.body=body;message.editedAt=new Date().toISOString();}state.chatEditingMessageId='';state.chatEditDraft=null;persistChatDraft();await loadChatThread(editThread);}
            }
			catch (error) { toast(error.message, true); }
			finally { state.chatSending = false; if (state.view === 'chat') renderChat(); }
			return;
		}
		if (!body && !state.chatLinkedRecordId) return;
		const clientNonce = chatClientNonce();
    const context = offlineOutbox.context(state.activeChatThreadId,state.chatThreads.find(thread => thread.id === state.activeChatThreadId)?.title);
    const payload = { body, replyToId: state.chatReplyToId, linkedRecordId: state.chatLinkedRecordId };
		state.chatSending = true; renderChat();
		try {
      await offlineOutbox.addMessage(payload,context);
      if (context.owner === state.me?.id && context.workspace === state.activeWorkspaceId && context.thread === state.activeChatThreadId && state.chatDraftNonce === clientNonce) {
        state.chatReplyToId = ''; state.chatLinkedRecordId = ''; state.chatDraftNonce = ''; state.chatDraftText = ''; persistChatDraft();
      }
      if (context.owner === state.me?.id && !(state.view === 'chat' && context.workspace === state.activeWorkspaceId && context.thread === state.activeChatThreadId)) toastAction('Сообщение сохранено в очередь отправки.', 'Проверить', () => offlineOutbox.open());
      void offlineOutbox.pump();
		} catch (error) { toast(error.message, true); }
		finally { state.chatSending = false; if (state.view === 'chat') renderChat(); }
	});
	$('[data-chat-attach]', form).addEventListener('click', () => input.click());
	input.addEventListener('change', async () => { if (await uploadChatFiles(input.files)) input.value = ''; });
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
	drawer.addEventListener('pointerdown', (event) => { if (!event.isPrimary) return; pointerID = event.pointerId; startX = event.clientX; startY = event.clientY; deltaX = 0; });
	drawer.addEventListener('pointermove', (event) => { if (event.pointerId !== pointerID) return; const moveX = event.clientX - startX; const moveY = event.clientY - startY; if (Math.abs(moveX) < 10 || Math.abs(moveX) <= Math.abs(moveY)) return; event.preventDefault(); drawer.setPointerCapture?.(pointerID); deltaX = Math.min(0, moveX); drawer.classList.add('dragging'); drawer.style.transform = `translateX(${deltaX}px)`; });
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
	const context=captureProjectContext(),thread=state.chatCall?.call?.threadId||state.activeChatThreadId;
	try {
		const call=await api(`/api/chat/threads/${thread}/calls/active`);
		if(!isProjectContextCurrent(context))return;
		if(!call){const hadCall=!!state.chatCall||!!state.chatIncomingCall;cleanupChatCall();state.chatIncomingCall=null;if(hadCall&&state.view==='chat')renderChat();return;}
		if (state.chatCall?.call?.id === call.id) {
			state.chatCall.call = call;
			if (call.answerSdp && !state.chatCall.connected && call.startedBy === state.me.id) { await state.chatCall.peer.setRemoteDescription(JSON.parse(call.answerSdp)); state.chatCall.connected = true; state.chatCall.startedAt = Date.now(); startCallClock(); if (state.view === 'chat') renderChat(); }
		} else if (call.startedBy !== state.me.id) { state.chatIncomingCall = call; if (state.view === 'chat' && !workspaceHasActiveInput()) renderChat(); }
	} catch (error) {if(isProjectContextCurrent(context)&&[401,403,404].includes(error.status)){cleanupChatCall();state.chatIncomingCall=null;}}
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

function normalizeGraphLayoutData(data = {}) {
  data = data && typeof data === 'object' ? data : {};
  const positions = {};
  for (const [id, point] of Object.entries(data.positions || {})) {
    if (/^(record|question|answer|decision|research-option):[A-Za-z0-9_-]{1,100}$/.test(id) && Number.isFinite(point?.x) && Number.isFinite(point?.y) && Math.abs(point.x) <= 1e6 && Math.abs(point.y) <= 1e6) positions[id] = { x: point.x, y: point.y };
  }
  const source = data.settings || {}, settings = { ...graphSettingDefaults, moveBranch: true, hiddenGroups: [], groupColors: Object.fromEntries(graphGroups.map(group => [group.key, group.color])) };
  for (const key of ['showDiscussion', 'showOrphans', 'showArrows', 'physics', 'moveBranch']) if (typeof source[key] === 'boolean') settings[key] = source[key];
  for (const [key, min, max] of [['textFade',0,100],['nodeSize',70,150],['linkThickness',60,180],['centerForce',0,100],['repelForce',0,100],['linkForce',0,100],['linkDistance',0,100]]) if (Number.isFinite(source[key])) settings[key] = Math.max(min, Math.min(max, source[key]));
  const groups = new Set(graphGroups.map(group => group.key));
  settings.hiddenGroups = Array.isArray(source.hiddenGroups) ? source.hiddenGroups.filter(key => groups.has(key)) : [];
  for (const [key, color] of Object.entries(source.groupColors || {})) if (groups.has(key) && /^#[a-f0-9]{6}$/i.test(color)) settings.groupColors[key] = color;
  return { positions, settings, search: String(data.search || '').slice(0,240), branchRootId: /^record:[A-Za-z0-9_-]{1,100}$/.test(data.branchRootId || '') ? data.branchRootId : '', depth: Math.max(1, Math.min(4, Math.round(Number(data.depth) || 2))) };
}

const graphDraftWindowId = (() => {
  try {
    const key = 'business-control:graph-draft-window:v1';
    let id = sessionStorage.getItem(key);
    if (!id) { id = crypto.randomUUID(); sessionStorage.setItem(key, id); }
    return id;
  } catch (_) { return null; }
})();

const graphLayoutStore = createGraphLayoutStore({
  api: (path, options) => api(path, options),
  draftId: graphDraftWindowId || 'temporary',
  storage: {
    getItem: key => graphDraftWindowId ? localStorage.getItem(key) : null,
    setItem: (key, value) => { if (!graphDraftWindowId) throw new Error('Черновик доступен только в текущем окне'); localStorage.setItem(key, value); },
    removeItem: key => localStorage.removeItem(key),
  },
  normalize: normalizeGraphLayoutData, isUserActive: user => state.me?.id === user,
  onChange: ctx => updateGraphLayoutStatus(ctx),
});

function graphLayoutView() { return state.graphFocusRecordId ? `record:${state.graphFocusRecordId}` : 'project'; }
function graphLayoutIsCurrent(ctx) {
  return state.graphLayoutContext === ctx && state.me?.id === ctx.user && state.activeWorkspaceId === ctx.workspace && graphLayoutView() === ctx.view;
}

function applyGraphLayoutData(data) {
  const saved = normalizeGraphLayoutData(data);
  for (const [key, value] of Object.entries(saved.settings)) {
    if (key === 'hiddenGroups') state.graphHiddenGroups = new Set(value);
    else if (key === 'groupColors') state.graphGroupColors = { ...value };
    else state[`graph${key[0].toUpperCase()}${key.slice(1)}`] = value;
  }
  state.graphSearch = saved.search; state.graphBranchRootId = saved.branchRootId; state.graphDepth = saved.depth;
}

function graphLayoutFromControls(ctx) {
  return { ...ctx.data, search: state.graphSearch, branchRootId: state.graphBranchRootId, depth: state.graphDepth, settings: {
    showDiscussion: state.graphShowDiscussion, showOrphans: state.graphShowOrphans, showArrows: state.graphShowArrows, physics: state.graphPhysics,
    textFade: state.graphTextFade, nodeSize: state.graphNodeSize, linkThickness: state.graphLinkThickness,
    centerForce: state.graphCenterForce, repelForce: state.graphRepelForce, linkForce: state.graphLinkForce, linkDistance: state.graphLinkDistance,
    moveBranch: state.graphMoveBranch, hiddenGroups: [...state.graphHiddenGroups], groupColors: { ...state.graphGroupColors },
  }};
}

function saveGraphSettings() {
  const ctx = state.graphLayoutContext;
  if (ctx && graphLayoutIsCurrent(ctx)) graphLayoutStore.change(ctx, graphLayoutFromControls(ctx));
}

function resetGraphSettings() {
  const ctx = state.graphLayoutContext;
  if (!ctx || !graphLayoutIsCurrent(ctx)) return;
  graphLayoutStore.change(ctx, { ...normalizeGraphLayoutData(), positions: ctx.data.positions });
  applyGraphLayoutData(ctx.data);
}

function importLegacyGraphLayout(ctx, data) {
  if (ctx.legacyChecked || !ctx.loaded || ctx.version || ctx.dirty || ctx.hadCache) return;
  ctx.legacyChecked = true;
  try {
    const positions = JSON.parse(localStorage.getItem(`business-control:graph-positions:${ctx.user}:v4`) || '{}');
    const settings = JSON.parse(localStorage.getItem(`business-control:graph-settings:${ctx.user}:v1`) || '{}');
    const ids = new Set(data.nodes.map(node => node.id));
    const scoped = Object.fromEntries(Object.entries(positions).filter(([id]) => ids.has(id)));
    if (Object.keys(scoped).length || Object.keys(settings).length) graphLayoutStore.change(ctx, { ...ctx.data, positions: scoped, settings }, { remember: false });
  } catch (_) {}
}

function updateGraphLayoutStatus(ctx = state.graphLayoutContext) {
  if (!ctx || !graphLayoutIsCurrent(ctx) || state.view !== 'graph') return;
  const target = $('#graph-layout-status');
  if (!target) return;
  const local = ctx.cacheError ? 'Черновик пока только в открытом окне.' : 'Ваш вариант сохранён в этом браузере.';
  target.innerHTML = ctx.conflict
    ? `<span>Раскладка изменилась в другом окне. ${local}</span><button type="button" data-graph-layout-action="remote">Загрузить серверную</button><button type="button" data-graph-layout-action="mine">Сохранить мою</button>`
    : ctx.error ? `<span>Не удалось синхронизировать раскладку. ${local} ${escapeHTML(ctx.error)}</span><button type="button" data-graph-layout-action="retry">Повторить</button>`
    : `<span>${ctx.saving ? 'Сохраняем раскладку…' : ctx.loading ? 'Проверяем раскладку…' : ctx.dirty ? (ctx.cacheError ? local : 'Изменения сохранены локально, ждём синхронизации…') : ctx.version ? 'Раскладка сохранена для этого проекта и вида' : 'Переместите узлы, чтобы сохранить раскладку'}</span>`;
  const undo = $('#graph-undo-layout'); if (undo) undo.disabled = !ctx.undo.length;
  $$('[data-graph-layout-action]', target).forEach(button => button.addEventListener('click', async () => {
    if (!graphLayoutIsCurrent(ctx)) return;
    button.disabled = true;
    const action = button.dataset.graphLayoutAction;
    const ok = await (action === 'remote' ? graphLayoutStore.acceptServer(ctx) : action === 'mine' ? graphLayoutStore.keepLocal(ctx) : graphLayoutStore.retry(ctx));
    if (ok && graphLayoutIsCurrent(ctx)) { applyGraphLayoutData(ctx.data); renderGraph(); }
    else updateGraphLayoutStatus(ctx);
  }));
}

async function ensureGraphData(force = false) {
  const user = state.me?.id, workspace = state.activeWorkspaceId, key = JSON.stringify([user, workspace]);
  if (!force && state.graphData && state.graphDataKey === key) return state.graphData;
  if (state.graphDataRequest?.key === key) return state.graphDataRequest.promise;
  const request = { key };
  request.promise = api('/api/graph', { headers: { 'X-Workspace-ID': workspace } }).then(data => {
    if (state.me?.id === user && state.activeWorkspaceId === workspace) { state.graphData = data; state.graphDataKey = key; }
    return data;
  }).finally(() => { if (state.graphDataRequest === request) state.graphDataRequest = null; });
  state.graphDataRequest = request;
  return request.promise;
}

function showGraphBranch(id) {
  state.graphFocusRecordId = ''; state.graphPendingBranch = { workspace: state.activeWorkspaceId, id };
  state.graphSelectedId = id; renderGraph();
}

function graphGroupKey(node) {
  return node.entityKind === 'record' ? node.type : node.entityKind;
}

function graphRange(name, label, value, min = 0, max = 100) {
  return `<label class="graph-setting-range"><span>${escapeHTML(label)}</span><input type="range" min="${min}" max="${max}" value="${value}" data-graph-range="${name}"><b>${value}</b></label>`;
}

function renderGraphSettings() {
  return `<aside id="graph-settings" class="graph-settings ${state.graphSettingsOpen ? 'open' : ''}" aria-label="Настройки карты" aria-hidden="${state.graphSettingsOpen ? 'false' : 'true'}" ${state.graphSettingsOpen ? '' : 'inert'}>
    <header><div><p class="eyebrow">Карта связей</p><h2>Настройки карты</h2></div><div><button type="button" class="text-button" data-reset-graph-settings>Сбросить</button><button type="button" class="icon-button" data-close-graph-settings aria-label="Закрыть">${icon('x')}</button></div></header>
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
  const request = ++state.graphRenderRequest;
  const ctx = graphLayoutStore.context({ user: state.me.id, workspace: state.activeWorkspaceId, view: graphLayoutView() });
  const entered = state.graphLayoutContext !== ctx;
  state.graphLayoutContext = ctx;
  $('#main-content').classList.add('graph-main-content');
  if (!state.graphData || (entered && !ctx.loaded)) $('#main-content').innerHTML = '<div class="graph-loading"><span class="spinner"></span><strong>Открываем карту проекта</strong></div>';
  try {
    const [data] = await Promise.all([ensureGraphData(entered), entered || !ctx.loaded ? graphLayoutStore.load(ctx) : Promise.resolve(ctx)]);
    if (request !== state.graphRenderRequest || state.view !== 'graph' || !graphLayoutIsCurrent(ctx)) return;
    importLegacyGraphLayout(ctx, data);
    if (ctx.view === 'project' && state.graphPendingBranch?.workspace === ctx.workspace) {
      graphLayoutStore.change(ctx, { ...ctx.data, branchRootId: state.graphPendingBranch.id }); state.graphPendingBranch = null;
    }
    applyGraphLayoutData(ctx.data);
    if (entered) { state.graphSelectedId = state.graphFocusRecordId ? `record:${state.graphFocusRecordId}` : state.graphBranchRootId; state.graphLinkSourceId = ''; }
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
        <div class="graph-icon-actions"><button type="button" class="icon-button" id="graph-undo-layout" title="Отменить изменение раскладки" aria-label="Отменить изменение раскладки" disabled>${icon('undo')}</button><button type="button" class="icon-button" id="graph-zoom-out" title="Уменьшить" aria-label="Уменьшить">${icon('minus')}</button><button type="button" class="icon-button" id="graph-zoom-in" title="Увеличить" aria-label="Увеличить">${icon('plus')}</button><button type="button" class="icon-button" id="graph-relayout" title="Перестроить карту" aria-label="Перестроить карту">${icon('rotate')}</button><button type="button" class="icon-button" id="graph-fit" title="Показать карту целиком" aria-label="Показать карту целиком">${icon('maximize')}</button><button type="button" class="icon-button ${state.graphSettingsOpen ? 'active' : ''}" id="graph-settings-toggle" title="Настройки карты" aria-label="Настройки карты">${icon('settings')}</button></div>
      </header>
      <div id="graph-layout-status" class="graph-layout-status" role="status" aria-live="polite"></div><div class="graph-stage"><div id="relationship-graph" tabindex="0" role="application" aria-label="Интерактивная карта связей"><div class="graph-loading"><span class="spinner"></span><strong>Строим карту проекта</strong></div></div><aside id="graph-inspector" class="graph-inspector ${state.graphSelectedId && !state.graphSettingsOpen ? 'open' : ''}" aria-hidden="${state.graphSelectedId && !state.graphSettingsOpen ? 'false' : 'true'}" ${state.graphSelectedId && !state.graphSettingsOpen ? '' : 'inert'}>${renderGraphInspector()}</aside>${renderGraphSettings()}<div id="graph-context-menu" class="graph-context-menu"></div></div>
      <footer class="graph-legend"><span><i class="legend-card"></i> Карточка</span><span><i class="legend-question"></i> Вопрос</span><span><i class="legend-answer"></i> Ответ</span><span><i class="legend-decision"></i> Итог</span><em>${state.graphMoveBranch ? 'Перетаскивание родителя двигает всю его ветку' : 'Перетаскивание двигает только выбранный узел'} · правый клик: действия</em></footer>
    </section>`;
  bindGraphControls();
  updateGraphLayoutStatus(ctx);
  mountGraph();
  if (ctx.dirty && !ctx.conflict && !ctx.error) void graphLayoutStore.save(ctx);
  } catch (error) {
    if (request !== state.graphRenderRequest || state.view !== 'graph' || !graphLayoutIsCurrent(ctx)) return;
    $('#main-content').innerHTML = `<div class="graph-error"><strong>Карта не загрузилась</strong><p>${escapeHTML(error.message)}</p><button type="button" class="secondary" id="graph-retry">Повторить</button></div>`;
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

function loadGraphPositions() { return state.graphLayoutContext?.data.positions || {}; }

function saveGraphPositions(cy = state.graphInstance) {
  const ctx = cy && state.graphLayoutInstances.get(cy);
  if (!ctx || cy !== state.graphInstance || !graphLayoutIsCurrent(ctx) || cy.destroyed()) return;
  const positions = { ...ctx.data.positions };
  cy.nodes().forEach(node => { const point = node.position(); positions[node.id()] = { x: point.x, y: point.y }; });
  graphLayoutStore.change(ctx, { ...ctx.data, positions }, { remember: false });
}

function clearGraphPositions() {
  const ctx = state.graphLayoutContext;
  if (ctx && graphLayoutIsCurrent(ctx)) graphLayoutStore.change(ctx, { ...ctx.data, positions: {} });
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
    fit: true, padding: window.innerWidth <= 560 ? 44 : 64, nodeDimensionsIncludeLabels: true,
  };
}

function updateGraphZoomStyles() {
  const cy = state.graphInstance;
  if (!cy) return;
  const zoom = cy.zoom();
  if (window.innerWidth <= 560 && cy.nodes().length <= 18) {
    cy.nodes().removeClass('zoom-compact').removeClass('zoom-hidden');
    cy.edges().toggleClass('zoom-hidden', zoom < .38);
    return;
  }
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
  // On narrow screens the fitted zoom is the only scale guaranteed to keep
  // labels inside the canvas. Raising it afterwards cropped edge nodes.
  if (window.innerWidth <= 560) return;
  const minimumZoom = nodeCount <= 18 ? .9 : .76;
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
  const usePreset = positioned > 0;
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
  const compactGraphViewport = window.innerWidth <= 560;
  const cy = window.cytoscape({
    container, elements, minZoom: .1, maxZoom: 3, boxSelectionEnabled: true,
    style: [
      { selector: 'node', style: { shape: 'ellipse', width: 'data(size)', height: 'data(size)', label: 'data(label)', 'font-family': 'Onest Local, sans-serif', 'font-size': compactGraphViewport ? 13 : 12, 'font-weight': 600, color: '#eef4f1', 'text-wrap': 'wrap', 'text-max-width': compactGraphViewport ? 104 : 148, 'text-valign': 'bottom', 'text-margin-y': compactGraphViewport ? 8 : 11, 'text-halign': 'center', 'line-height': 1.25, 'text-background-color': '#171d1a', 'text-background-opacity': .78, 'text-background-padding': 3, 'background-color': 'data(color)', 'background-opacity': .9, 'border-width': 1.5, 'border-color': '#e5eee9', 'border-opacity': .52, 'overlay-opacity': 0, 'transition-property': 'opacity, border-width, border-color, background-opacity, width, height', 'transition-duration': '.16s' } },
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
    layout: usePreset ? { name: 'preset', fit: true, padding: window.innerWidth <= 560 ? 44 : 48, animate: false } : (nodes.length > 1 ? graphLayoutOptions(true, nodes.length) : { name: 'grid', fit: true, padding: 48 }),
  });
  state.graphInstance = cy;
  state.graphLayoutInstances.set(cy, state.graphLayoutContext);
  $('#graph-count').textContent = `${nodes.length} · ${edges.length}`;
  cy.one('layoutstop', () => { if (state.graphInstance !== cy || cy.destroyed()) return; ensureReadableGraphView(cy); saveGraphPositions(cy); updateGraphZoomStyles(); });
  cy.ready(() => requestAnimationFrame(() => {
    if (state.graphInstance !== cy || cy.destroyed()) return;
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
    graphLayoutStore.checkpoint(state.graphLayoutInstances.get(cy));
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
    if (action === 'branch') showGraphBranch(current.id);
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
    fit: { eles: cy.elements(), padding: window.innerWidth <= 560 ? 44 : 54 },
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
	graphLayoutStore.checkpoint(state.graphLayoutInstances.get(cy));
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
	setTimeout(() => { if (state.graphInstance !== cy || cy.destroyed()) return; saveGraphPositions(cy); cy.animate({ fit: { eles: root.union(descendants.reduce((collection, node) => collection.union(node), cy.collection())), padding: 90 }, duration: 240 }); }, 290);
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
  $('#graph-search').addEventListener('input', (event) => { state.graphSearch = event.target.value; saveGraphSettings(); applyGraphSearch(); });
  $('#graph-branch-filter')?.addEventListener('change', event => showGraphBranch(event.target.value));
  $('#graph-move-branch')?.addEventListener('click', () => { state.graphMoveBranch = !state.graphMoveBranch; saveGraphSettings(); renderGraph(); toast(state.graphMoveBranch ? 'Режим ветки включён: родитель двигается вместе с потомками' : 'Теперь перемещается только один узел'); });
  $('#graph-depth')?.addEventListener('input', (event) => { state.graphDepth = Number(event.target.value); event.target.nextElementSibling.textContent = String(state.graphDepth); saveGraphSettings(); mountGraph(); });
  $('#graph-undo-layout')?.addEventListener('click', () => { const ctx = state.graphLayoutContext; if (graphLayoutStore.undo(ctx)) { applyGraphLayoutData(ctx.data); renderGraph(); } });
  $('#graph-fit').addEventListener('click', fitGraph);
  $('#graph-zoom-in').addEventListener('click', () => zoomGraph(1.18));
  $('#graph-zoom-out').addEventListener('click', () => zoomGraph(1 / 1.18));
  $('#graph-relayout').addEventListener('click', () => {
    const cy = state.graphInstance;
    if (!cy) return;
    clearGraphPositions();
    const layout = cy.layout(graphLayoutOptions(true));
    cy.one('layoutstop', () => { if (state.graphInstance !== cy || cy.destroyed()) return; ensureReadableGraphView(cy); saveGraphPositions(cy); updateGraphZoomStyles(); });
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
  $('[data-show-graph-branch]')?.addEventListener('click', () => { if (state.graphSelectedId) showGraphBranch(state.graphSelectedId); });
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
  const ctx = state.graphLayoutContext;
  const source = state.graphData.nodes.find((item) => item.id === state.graphLinkSourceId);
  const target = state.graphData.nodes.find((item) => item.id === state.graphSelectedId);
  if (!source || !target || source.entityKind !== 'record' || target.entityKind !== 'record') return;
  try {
    await api(`/api/records/${source.recordId}/links`, { method: 'POST', body: JSON.stringify({ targetId: target.recordId, relationType: $('#graph-relation-type').value, reason: 'Связь создана на карте проекта' }) });
    if (!ctx || !graphLayoutIsCurrent(ctx) || state.view !== 'graph') return;
    await ensureGraphData(true);
    if (!graphLayoutIsCurrent(ctx) || state.view !== 'graph') return;
    state.graphLinkSourceId = ''; state.detailCache.delete(source.recordId); state.detailCache.delete(target.recordId); mountGraph(); selectGraphNode(target.id, true); toast('Связь добавлена');
  } catch (error) { if (ctx && graphLayoutIsCurrent(ctx)) toast(error.message, true); }
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
  const workspace = state.activeWorkspaceId, user = state.me?.id;
  const renderLoading = !state.graphData;
  if (renderLoading) {
    $('#main-content').innerHTML = `<div class="entity-list-heading"><div><p class="eyebrow">Память проекта</p><h1>Решения и выводы</h1><p>Принятые решения, результаты исследований и совместные итоги вопросов.</p></div><button type="button" class="primary" data-outcome-create>${icon('plus')} Зафиксировать решение</button></div><div class="relations-loading page-loading"><span class="spinner"></span><strong>Собираем итоговые знания проекта</strong></div>`;
    $('[data-outcome-create]')?.addEventListener('click', () => openCreateDialog('decision'));
    try { await ensureGraphData(); } catch (error) { if (state.activeWorkspaceId === workspace && state.me?.id === user) toast(error.message, true); }
    if (state.view !== 'outcomes' || state.activeWorkspaceId !== workspace || state.me?.id !== user) return;
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
  if (detail.record.workspaceId && detail.record.workspaceId !== state.activeWorkspaceId) return null;
  return detail;
}

async function fetchRecordDetail(id, force = false) {
  if (!force) {
    const cached = cachedRecordDetail(id);
    if (cached) return cached;
  }
  if (state.detailRequests.has(id)) return state.detailRequests.get(id);
  const context = captureProjectContext();
  const request = api(`/api/records/${id}`).then((detail) => {
    if (!isProjectContextCurrent(context)) return detail;
    const previous = state.detailCache.get(id);
    if (previous?.relationsLoaded && previous.record.updatedAt === detail.record.updatedAt) {
      detail.links = previous.links;
      detail.scores = previous.scores;
      detail.scoreDecisions = previous.scoreDecisions || [];
      detail.researchOptions = previous.researchOptions || [];
      detail.relationsLoaded = true;
    }
    if (previous?.workflowLoaded && previous.record.updatedAt === detail.record.updatedAt) {
      detail.workflow = previous.workflow;
      detail.workflowLoaded = true;
    }
    state.detailCache.set(id, detail);
    return detail;
  }).finally(() => { if (state.detailRequests.get(id) === request) state.detailRequests.delete(id); });
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
  const context = captureProjectContext();
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
    if (requestID !== state.activeRecordRequest || !isProjectContextCurrent(context) || !$('#record-dialog').open) return;
    state.activeDetail = detail;
    addRecordWorkspaceItem(id, detail.record, true);
    renderRecordDialog();
  } catch (error) {
    if (requestID === state.activeRecordRequest && isProjectContextCurrent(context) && $('#record-dialog').open) renderRecordLoadError(id, error.message);
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

function recordTabItems(record, detail, activity) {
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
  return tabs;
}

function recordTabs(record, detail, activity) {
  return recordTabItems(record, detail, activity)
    .map(([key, label, count]) => `<button type="button" class="record-tab ${state.activeRecordTab === key ? 'active' : ''}" data-record-tab="${key}"><span>${label}</span>${count ? `<b>${count}</b>` : ''}</button>`)
    .join('');
}

function recordTabSelect(record, detail, activity) {
  const options = recordTabItems(record, detail, activity)
    .map(([key, label, count]) => `<option value="${key}" ${state.activeRecordTab === key ? 'selected' : ''}>${escapeHTML(count ? `${label} · ${count}` : label)}</option>`)
    .join('');
  return `<label class="record-tab-select" for="record-tab-select"><span>Раздел карточки</span><select id="record-tab-select" data-native-select>${options}</select></label>`;
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
    return `<section class="dossier-section business-read risk-read"><header><div><p class="eyebrow">Контроль риска</p><h3>${record.status === 'completed' ? statusLabel(record) : details.occurred ? 'Риск наступил' : score ? `Оценка ${score} из 25` : 'Нужна оценка'}</h3></div>${canEdit ? `<button type="button" class="icon-button" data-open-record-edit aria-label="Изменить риск">${icon('edit')}</button>` : ''}</header><div class="dossier-properties">${dossierProperty('Вероятность', details.probability ? `${details.probability} из 5` : 'Не оценена', '', false)}${dossierProperty('Влияние', details.impact ? `${details.impact} из 5` : 'Не оценено', '', false)}${dossierProperty('Состояние', record.status === 'completed' ? statusLabel(record) : details.occurred ? 'Наступил' : 'Не наступил', '', false, record.status !== 'completed' && details.occurred ? 'overdue' : '')}${dossierProperty('Следующая проверка', details.reviewAt ? formatDate(details.reviewAt, true) : 'Не назначена', '', false)}</div><div class="business-markdown"><span>Мера снижения</span>${markdownView(details.mitigation, 'Мера снижения пока не определена.')}</div></section>`;
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

function renderRecordCustomFieldsRead(record, canEdit) {
	if (!record.collectionId) return canEdit ? `<section class="dossier-section record-custom-fields"><header><div><p class="eyebrow">Доска</p><h3>Карточка пока без доски</h3></div><button type="button" class="secondary" data-assign-record-board>${icon('network')} Добавить на доску</button></header></section>` : '';
	const collection = state.collections.find((item) => item.id === record.collectionId);
	if (!collection) return '';
	return `<section class="dossier-section record-custom-fields"><header><div><p class="eyebrow">${escapeHTML(collection.name)}</p><h3>Поля карточки</h3></div>${canEdit ? `<button type="button" class="icon-button" data-edit-custom-fields aria-label="Изменить поля" title="Изменить поля">${icon('edit')}</button>` : ''}</header><div class="dossier-properties">${collection.fields.map((field) => dossierProperty(field.name, collectionFieldDisplay(field, record.customFields?.[field.id]) || 'Не указано', '', false)).join('') || '<p class="muted">На доске пока нет пользовательских полей.</p>'}</div></section>`;
}

function completionLabel(record) {
  if (record.type === 'risk') return record.businessDetails?.occurred ? 'Последствия устранены' : 'Риск предотвращён';
  return { goal: 'Цель достигнута', task: 'Завершить задачу', research: 'Завершить исследование', question_set: 'Завершить обсуждение', meeting: 'Встреча завершена', disagreement: 'Разногласие решено', hypothesis: 'Завершить проверку', experiment: 'Завершить эксперимент', document: 'Документ готов', criterion: 'Критерий готов' }[record.type] || '';
}

function renderRecordLifecycle(record, canEdit) {
  const label = completionLabel(record);
  if (!label || record.status === 'archived') return '';
  const closed = !isActiveRecord(record);
  return `<section class="record-lifecycle ${closed ? 'resolved' : ''}"><span><strong>${escapeHTML(statusLabel(record))}</strong>${record.completedAt && record.status === 'completed' ? `<small>${formatDate(record.completedAt, true)}</small>` : ''}</span>${canEdit ? `<button type="button" class="${closed ? 'secondary' : 'success'}" data-record-lifecycle="${closed ? 'reopen' : 'complete'}">${icon(closed ? 'rotate' : 'check')} ${closed ? 'Вернуть в работу' : escapeHTML(label)}</button>` : ''}</section>`;
}

async function completeRecordFromAction(record, reopen = false) {
  if (!completionLabel(record)) return;
  if (state.activeDetail?.record.id !== record.id || !$('#record-dialog').open) await openRecord(record.id);
  if (state.activeDetail?.record.id !== record.id) return;
  record = state.activeDetail.record;
  if (reopen) {
    return mutateRecord(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'in_progress', reason: 'Пользователь вернул карточку в работу', expectedUpdatedAt: record.updatedAt }) });
  }
  if (record.type === 'task') {
    if (!state.activeDetail.workflowLoaded) await loadRecordWorkflow(record.id);
    state.activeRecordTab = 'execution'; state.recordEditMode = false; renderRecordDialog();
    requestAnimationFrame(() => ($('#complete-task') || $('#proof-form'))?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    return;
  }
  if (record.type === 'research') { $('[data-complete-research]')?.click(); return; }
  if (['hypothesis', 'experiment'].includes(record.type) && (!record.result?.trim() || !record.businessDetails?.verdict || record.businessDetails.verdict === 'pending')) {
    state.recordEditMode = true; state.activeRecordTab = 'overview'; renderRecordDialog();
    toast('Укажите итог проверки и результат, затем завершите карточку');
    return;
  }
  await mutateRecord(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'completed', reason: completionLabel(record), expectedUpdatedAt: record.updatedAt }) });
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
			${renderRecordCustomFieldsRead(record, canEdit)}
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
    <div class="record-read-actions">${canEdit ? `<button type="button" class="primary" data-open-record-edit>${icon('edit')} Редактировать</button>${!record.collectionId ? `<button type="button" class="secondary" data-assign-record-board>${icon('network')} Добавить на доску</button>` : ''}${record.type === 'research' && record.status !== 'completed' ? `<button type="button" class="success" data-complete-research>${icon('check')} Завершить исследование</button>` : ''}` : ''}<button type="button" class="secondary" id="notify-partners">${icon('bell')} Уведомить</button><button type="button" class="secondary ai-action" data-analyze-record>${icon('sparkles')} AI-разбор</button><details class="record-more-actions"><summary class="icon-button" aria-label="Другие действия">•••</summary><div>${record.type === 'task' ? `<button type="button" id="convert-to-questions">${icon('messages')} Сделать карточкой вопросов</button>` : ''}${canEdit ? `<button type="button" class="danger-text" id="archive-record">${icon('archive')} В архив</button>` : ''}</div></details></div>
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
    <form id="record-edit-form" class="card-form record-overview-form ${record.type === 'inbox' ? 'personal-note-form inbox-record-form' : ''}" data-can-edit="${canEdit}">
      ${record.type === 'inbox' ? `${personalNoteSheet({ title: record.title, titleGenerated: record.titleGenerated, body: record.description }, { bodyName: 'description', pin: false })}<label>Статус<select name="status">${statuses.map(status => `<option value="${status}" ${record.status === status ? 'selected' : ''}>${statusLabel({ ...record, status })}</option>`).join('')}</select></label>` : `
      <div class="form-grid two"><label>Название<input name="title" value="${escapeHTML(record.title)}" required></label><label>${record.type === 'question_set' ? 'Статус рассчитывается автоматически' : 'Статус'}<select name="status" ${record.type === 'question_set' ? 'disabled' : ''}>${statuses.map((status) => `<option value="${status}" ${record.status === status ? 'selected' : ''}>${statusLabel({ ...record, status })}</option>`).join('')}</select></label></div>
      ${markdownEditor('description', language.description, record.description, 5, 'Контекст, факты и ожидаемый результат')}`}
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
  const visible = detail.sections.filter((section) => !section.hidden);
  const hidden = detail.sections.filter((section) => section.hidden && section.content);
  const sections = state.recordEditMode
    ? `<section class="accordion-stack content-stack">${visible.map(renderSection).join('')}<details class="accordion"><summary><span>Добавить свой раздел</span><small>Только для этой карточки</small></summary><form id="custom-section-form" class="inline-editor"><input name="title" placeholder="Название раздела" required>${markdownEditor('content', 'Содержание', '', 5, 'Факты, позиции и выводы', 'custom-section')}<button class="secondary" type="submit">Добавить раздел</button></form></details></section>`
    : `<section class="content-read-stack">${visible.map(renderSectionRead).join('')}</section>`;
  return `<div class="record-pane ${state.activeRecordTab === 'content' ? 'active' : ''}" data-record-pane="content">${comparison}${sections}${hidden.length ? `<details class="hidden-record-sections"><summary>Скрытые блоки с сохранёнными данными (${hidden.length})</summary>${hidden.map(state.recordEditMode ? renderSection : renderSectionRead).join('')}</details>` : ''}</div>`;
}

function renderQuestionWorkflow(detail) {
  const workflow = detail.questionWorkflow || { questions: [], userCount: state.users.length, answered: 0, expected: 0, resolved: 0 };
  const completion = workflow.questions.length ? Math.round(workflow.resolved * 100 / workflow.questions.length) : 0;
  return `<div class="record-pane ${state.activeRecordTab === 'questions' ? 'active' : ''}" data-record-pane="questions">
    <section class="question-summary"><div><p class="eyebrow">Совместная проработка</p><h3>${workflow.resolved} из ${workflow.questions.length} вопросов решено</h3><p>Каждый участник команды отвечает отдельно. Итог можно выбрать из ответа или сформулировать заново.</p></div><div class="question-progress"><strong>${completion}%</strong><progress class="progress-track" max="100" value="${completion}"></progress><small>${workflow.answered} из ${workflow.expected} ответов</small></div></section>
    <section class="question-list">${workflow.questions.map((question, index) => renderQuestionItem(question, index, workflow.userCount)).join('') || `<div class="guided-empty">${icon('messages')}<h3>Добавьте первый список вопросов</h3><p>Вставьте несколько строк. Каждая строка станет отдельным вопросом внутри этой карточки.</p></div>`}</section>
    <details class="add-questions" ${workflow.questions.length ? '' : 'open'}><summary>${icon('plus')} Добавить вопросы</summary><form id="add-questions-form"><label>Один вопрос на строку<textarea name="questions" rows="5" placeholder="Как распределяем роли?&#10;Как принимаем спорные решения?&#10;Как часто сверяем цели?" required></textarea><small>Нумерацию можно вставлять вместе с текстом, система уберёт её автоматически.</small></label><button type="submit" class="primary">${icon('plus')} Добавить в карточку</button></form></details>
  </div>`;
}

function renderQuestionItem(question, index, userCount) {
  const answered = question.activeAnswerCount ?? question.answers.length;
  const allAnswered = answered >= userCount && userCount > 0;
  const answerByUser = new Map(question.answers.map((answer) => [answer.authorId, answer]));
  const formerAnswers = question.answers.filter(answer => !state.users.some(user => user.id === answer.authorId));
  return `<article class="question-item ${question.decision ? 'resolved' : ''}" data-question-id-anchor="${question.id}">
    <header class="question-header"><span class="question-number">${index + 1}</span><div><h3>${escapeHTML(question.body)}</h3><p>${question.decision ? 'Совместный итог зафиксирован' : `${answered} из ${userCount} ответов готово`}</p></div><span class="status ${question.decision ? 'status-completed' : 'status-in_progress'}">${question.decision ? 'Решено' : 'Обсуждаем'}</span><button type="button" class="icon-button danger-icon" data-archive-question="${question.id}" title="Архивировать вопрос" aria-label="Архивировать вопрос">${icon('archive')}</button></header>
    <div class="answer-grid">${state.users.map((user) => renderFounderAnswer(question, user, answerByUser.get(user.id))).join('')}</div>
    ${formerAnswers.length ? `<details><summary>Ответы бывших участников · ${formerAnswers.length}</summary>${formerAnswers.map(answer => `<article class="answer-panel"><strong>${escapeHTML(answer.authorUsername)}</strong><p>${escapeHTML(answer.content)}</p></article>`).join('')}</details>` : ''}
    ${question.decision ? renderJointDecision(question) : allAnswered ? renderDecisionComposer(question) : `<div class="waiting-note">${icon('clock')} Итог станет доступен после ответов всех действующих участников этой команды.</div>`}
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
  return `<section class="answer-panel ${answer ? 'answered' : ''}"><header>${avatarMarkup(user)}<span><strong>${escapeHTML(user.displayName || user.username)}</strong><small>${answer ? `Ответ обновлён ${formatDate(answer.updatedAt, true)}` : 'Ответа пока нет'}</small></span>${controls}</header>${content}</section>`;
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
	return `<section class="decision-composer ${compact ? 'compact' : ''}"><div class="decision-composer-heading"><div><p class="eyebrow">Зафиксировать совместное решение</p><h4>Выберите готовый ответ или напишите новый итог</h4></div><div class="ai-question-actions"><button type="button" class="secondary ai-action" data-ai-question-draft="${question.id}" ${loading ? 'disabled' : ''}>${loading ? '<span class="spinner"></span> Формируем' : `${icon('sparkles')} Предложить общий итог`}</button><button type="button" class="secondary ai-action" data-ai-question-structure="${question.id}" ${loading ? 'disabled' : ''}>${icon('sliders')} Выделить правила и ограничения</button></div></div><div class="decision-options">${question.answers.map((answer) => `<button type="button" class="answer-choice" data-select-answer="${answer.id}" data-question-id="${question.id}">${avatarMarkup(state.users.find((user) => user.username === answer.authorUsername) || { username: answer.authorUsername }, 'tiny')}<span><strong>Принять ответ ${escapeHTML(answer.authorUsername)}</strong><small>${escapeHTML(markdownPlain(answer.content).slice(0, 120))}${markdownPlain(answer.content).length > 120 ? '…' : ''}</small></span>${icon('chevronRight')}</button>`).join('')}</div>${draft ? `<aside class="ai-question-draft-note"><strong>${icon('sparkles')} Редактируемый черновик ${draft.source === 'gemini' ? 'Gemini' : draft.source === 'groq' ? 'Groq' : ''}</strong><p>${escapeHTML(draft.rationale)}</p>${draft.suggestedOutputs?.length ? `<div class="ai-structure-preview"><span>Выделено для последующей фиксации:</span>${draft.suggestedOutputs.map((output) => `<b>${escapeHTML(questionOutputLabels[output.kind || output.type] || output.kind || typeMeta[output.type]?.singular || 'Сущность')}: ${escapeHTML(output.title)}</b>`).join('')}</div>` : ''}</aside>` : ''}<form class="custom-decision-form" data-custom-decision="${question.id}">${markdownEditor('content', 'Новый общий итог', initial, 6, 'Формулировка после обсуждения', `decision-${question.id}`)}<button type="submit" class="primary">${icon('check')} Сохранить общий итог</button></form></section>`;
}

function renderRecordRelations(record, detail, criteria, targets) {
  const content = detail.relationsLoaded
    ? `<section class="accordion-stack content-stack">${record.type === 'idea' ? renderCriteriaBlock(record, criteria, detail.scores, detail.scoreDecisions || [], true) : ''}${record.type === 'research' ? renderResearchStructuralRelations(detail.researchOptions || []) : ''}${renderLinksBlock(record, detail.links, targets, true)}</section>`
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

async function openRecordChat(recordID, button) {
  if (button.disabled) return;
  const context = captureRecordView(recordID);
  if (!isRecordViewCurrent(context) || !persistChatDraft()) return;
  button.disabled = true;
  try {
    const thread = await api('/api/chat/threads', {
      method: 'POST', headers: { 'X-Workspace-ID': context.workspace },
      body: JSON.stringify({ recordId: recordID }),
    });
    if (!isRecordViewCurrent(context)) return;
    const threads = await api('/api/chat/threads', { headers: { 'X-Workspace-ID': context.workspace } });
    if (!isRecordViewCurrent(context)) return;
    if (!threads.some(item => item.id === thread.id && item.recordId === recordID)) {
      throw new Error('Чат карточки недоступен. Обновите состав команды и повторите.');
    }
    if (!await requestDialogClose($('#record-dialog'))) return;
    if (!isProjectContextCurrent(context)) return;
    state.chatThreads = threads;
    state.activeChatThreadId = thread.id;
    state.chatLoadedThreadId = '';
    state.chatMessages = [];
    state.chatEmojiTarget = '';
    restoreChatDraft();
    state.chatHistoryQuery = null;
    state.chatHistoryAround = '';
    state.chatSearch = '';
    state.chatSearchOpen = false;
    state.chatFavoritesOnly = false;
    await navigateToView('chat');
  } catch (error) {
    if (isProjectContextCurrent(context)) toast(error.message, true);
  } finally {
    button.disabled = false;
  }
}

function renderDiscussionPane(detail) {
  if (!detail.workflowLoaded) return renderWorkflowLoading('discussion');
  const comments = detail.workflow.comments || [];
  const chatEntry = `<div class="record-chat-entry"><div><h3>Чат карточки</h3><p>Сообщения, ответы и файлы по этой работе.</p></div><button type="button" class="primary" data-open-record-chat>${icon('messages')} Открыть чат</button></div>`;
  return `<div class="record-pane ${state.activeRecordTab === 'discussion' ? 'active' : ''}" data-record-pane="discussion">${chatEntry}<section class="discussion-panel"><div class="section-heading"><div><h3>Комментарии карточки</h3><p>Здесь сохранены отдельные комментарии и упоминания. Переписка с ответами и файлами открывается кнопкой «Открыть чат».</p></div></div><div class="comment-list">${comments.map((comment) => { const author = state.users.find((user) => user.username === comment.authorUsername) || { username: comment.authorUsername }; return `<article class="comment"><header>${avatarMarkup(author)}<div><strong>${escapeHTML(author.displayName || author.username)}</strong><time>${formatDate(comment.createdAt, true)}</time></div></header>${markdownView(comment.body, '', `Комментарий ${comment.authorUsername}`)}</article>`; }).join('') || `<div class="guided-empty compact">${icon('messages')}<h3>Комментариев пока нет</h3><p>Для разговора с командой откройте чат этой карточки.</p></div>`}</div><form id="comment-form" class="comment-form">${markdownEditor('body', 'Новый комментарий', '', 6, `Например: @${state.users.find((user) => user.id !== state.me.id)?.username || 'партнёр'} посмотри аргументы`, 'comment')}<button type="submit" class="primary">${icon('send')} Отправить</button></form></section></div>`;
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
  const criteria = state.records.filter((item) => item.type === 'criterion');
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
    ${recordTabSelect(record, detail, activity)}
    ${renderRecordContextStrip(record)}
    ${!state.recordEditMode ? renderRecordLifecycle(record, canEdit) : ''}
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

function criterionAggregate(criteria, scores) {
  const groups = new Map();
  for (const score of scores) {
    if (!Number.isInteger(score.score) || score.score < 0 || score.score > 10) continue;
    if (!groups.has(score.criterionId)) groups.set(score.criterionId, []);
    groups.get(score.criterionId).push(score);
  }
  let numerator = 0, denominator = 0;
  const rows = criteria.map((criterion) => {
    const votes = groups.get(criterion.id) || [];
    const mean = votes.length ? votes.reduce((total, vote) => total + vote.score, 0) / votes.length : null;
    const weight = criterion.criterionWeight ?? 1;
    if (criterion.status !== 'archived' && mean !== null && weight > 0) { numerator += mean * weight; denominator += weight; }
    return { criterion, votes, mean, weight };
  });
  return { rows, value: denominator > 0 ? numerator / denominator : null };
}

function canEditCriterionRecord(record) {
  return record.editPolicy !== 'owner_only' || record.ownerId === state.me.id || record.authorId === state.me.id;
}

function renderCriteriaBlock(record, criteria, scores, decisions = [], open = false) {
  const aggregate = criterionAggregate(criteria, scores);
  const decisionMap = new Map(decisions.map((decision) => [decision.criterionId, decision]));
  const canEdit = canEditCriterionRecord(record);
  const canDecide = canEdit && (record.ownerId === state.me.id || record.decisionMakerId === state.me.id);
  const number = (value) => value === null ? 'Не оценено' : `${Number(value.toFixed(2)).toLocaleString('ru-RU')} / 10`;
  const version = (name, value) => `<input type="hidden" name="${name}" value="${escapeHTML(value || '')}">`;
  const cards = aggregate.rows.filter(({criterion, votes}) => criterion.status !== 'archived' || votes.length || decisionMap.has(criterion.id)).map(({criterion, votes, mean, weight}) => {
    const own = votes.find((vote) => vote.evaluatedBy === state.me.id);
    const decision = decisionMap.get(criterion.id);
    const archived = criterion.status === 'archived';
    return `<article class="criterion-card" data-criterion-card="${criterion.id}">
      <header><span class="criterion-kind">${archived ? 'Архив · ' : ''}${criterion.kind === 'limitation' ? 'Ограничение' : 'Критерий'}</span><strong>${escapeHTML(criterion.title)}</strong><p>${escapeHTML(criterion.description)}</p></header>
      <div class="criterion-metrics"><span>Средняя личных оценок: <strong>${number(mean)}</strong></span><span>Участников: ${votes.length} · Вес: ${weight}${weight === 0 || archived ? ' · не входит в общий показатель' : ''}</span></div>
      ${canEditCriterionRecord(criterion) && !archived ? `<form class="criterion-weight-form" data-criterion-id="${criterion.id}">${version('expectedUpdatedAt', criterion.updatedAt)}<label>Вес критерия<input name="criterionWeight" type="number" min="0" max="100" step="any" required value="${weight}"></label><button type="submit" class="text-button">Сохранить вес</button></form>` : ''}
      <ul class="criterion-votes">${votes.map((vote) => `<li><strong>${escapeHTML(vote.evaluatorUsername)}${vote.evaluatedBy === state.me.id ? ' · вы' : ''}: ${vote.score} / 10</strong><p>${escapeHTML(vote.note || 'Обоснование не было указано')}</p></li>`).join('') || '<li>Личных оценок пока нет.</li>'}</ul>
      ${canEdit && !archived ? `<form class="criterion-personal-form" data-criterion-id="${criterion.id}">${version('expectedUpdatedAt', own?.updatedAt)}<label>Ваша оценка<input name="score" type="number" min="0" max="10" step="1" required value="${own?.score ?? ''}" placeholder="Не оценено"></label><label>Обоснование<textarea name="note" rows="2" required maxlength="20000" placeholder="Почему такая оценка">${escapeHTML(own?.note || '')}</textarea></label><button class="secondary" type="submit">Сохранить свою оценку</button></form>` : ''}
      ${canEdit && own ? `<button type="button" class="text-button" data-withdraw-score="${criterion.id}" data-score-version="${escapeHTML(own.updatedAt)}">Снять свою оценку</button>` : ''}
      <section class="criterion-decision"><strong>Принятый итог: ${decision ? number(decision.score) : 'не утверждён'}</strong>${decision ? `<small>Утвердил ${escapeHTML(decision.deciderUsername)} · ${formatDate(decision.updatedAt, true)}</small><p>${escapeHTML(decision.reason)}</p>${decision.needsReview ? '<p class="criterion-review">После утверждения изменились оценки или критерий. Итог требует пересмотра.</p>' : ''}` : '<p>Итог фиксирует ответственный или назначенный принимающий решение.</p>'}
      ${canDecide && !archived ? `<details><summary>${decision ? 'Пересмотреть итог' : 'Утвердить итог'}</summary><form class="criterion-decision-form" data-criterion-id="${criterion.id}">${version('expectedUpdatedAt', decision?.updatedAt)}${version('expectedRecordUpdatedAt', record.updatedAt)}${version('expectedCriterionUpdatedAt', criterion.updatedAt)}<label>Итоговая оценка<input name="score" type="number" min="0" max="10" step="1" required value="${decision?.score ?? ''}" placeholder="Не утверждено"></label><label>Основание решения<textarea name="reason" rows="2" required maxlength="20000">${escapeHTML(decision?.reason || '')}</textarea></label><button class="secondary" type="submit">Утвердить итог</button></form></details>` : ''}</section>
    </article>`;
  }).join('');
  return `<details class="accordion" ${open ? 'open' : ''}><summary><span>Оценка по критериям</span><small>Личных оценок: ${scores.length} · 0 не подходит, 10 полностью подходит</small></summary><div class="criterion-aggregate"><strong>Общий показатель: ${number(aggregate.value)}</strong><p>Сумма (средняя личных оценок × вес) ÷ сумма весов оценённых активных критериев. Неоценённые критерии и вес 0 исключены. Принятые итоги показаны отдельно.</p></div><div class="criteria-list">${cards || emptyState('Сначала зафиксируйте критерии в разделе «Правила и критерии».')}</div></details>`;
}

async function submitCriterionForm(form, path, body, method = 'PUT') {
  if (form.dataset.saving === 'true') return;
  form.dataset.saving = 'true';
  const buttons = $$('button[type="submit"]', form);
  const fields = $$('input:not([type="hidden"]), textarea', form).map((field) => ({ field, readOnly: field.readOnly }));
  buttons.forEach((button) => { button.disabled = true; });
  fields.forEach(({ field }) => { field.readOnly = true; });
  try {
    await mutateDetail(path, { method, body: JSON.stringify(body) }, () => clearWorkingDraftFor(form));
  } finally {
    delete form.dataset.saving;
    buttons.forEach((button) => { button.disabled = false; });
    fields.forEach(({ field, readOnly }) => { field.readOnly = readOnly; });
  }
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
    const mobileTabs = $('#record-tab-select');
    if (mobileTabs) mobileTabs.value = state.activeRecordTab;
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
  $('#record-tab-select')?.addEventListener('change', (event) => {
    $(`[data-record-tab="${event.currentTarget.value}"]`)?.click();
  });
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
  $('[data-record-lifecycle]')?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { await completeRecordFromAction(record, button.dataset.recordLifecycle === 'reopen'); }
    finally { if (button.isConnected) button.disabled = false; }
  });
  $$('[data-edit-field]').forEach((button) => button.addEventListener('click', () => startEditing(button.dataset.editField)));
  $$('[data-assign-record-board]').forEach((button) => button.addEventListener('click', () => openAssignRecordBoard(record)));
	$('[data-edit-custom-fields]')?.addEventListener('click', () => {
		const collection = state.collections.find((item) => item.id === record.collectionId);
		if (collection) openCollectionCardDialog(collection, record);
	});
  if (record.collectionId && canConfigureWorkspace()) {
    $('.record-custom-fields > header')?.insertAdjacentHTML('beforeend', `<button type="button" class="icon-button" data-configure-record-fields title="Настроить поля доски" aria-label="Настроить поля доски">${icon('settings')}</button>`);
    $('[data-configure-record-fields]')?.addEventListener('click', () => openCollectionSettingsDialog(state.collections.find((item) => item.id === record.collectionId)));
  }
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
  $$('.criterion-personal-form, .criterion-decision-form, .criterion-weight-form').forEach((formNode) => formNode.addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.currentTarget, values = Object.fromEntries(new FormData(form));
    const criterionID = form.dataset.criterionId;
    if (form.classList.contains('criterion-weight-form')) {
      await submitCriterionForm(form, `/api/records/${criterionID}`, { criterionWeight: Number(values.criterionWeight), expectedUpdatedAt: values.expectedUpdatedAt, reason: 'Уточнён вес критерия в оценке' }, 'PATCH');
    } else {
      const decision = form.classList.contains('criterion-decision-form');
      await submitCriterionForm(form, `/api/records/${record.id}/criteria/${criterionID}${decision ? '/decision' : ''}`, { ...values, score: Number(values.score) });
    }
  }));
  $$('[data-withdraw-score]').forEach((button) => button.addEventListener('click', async () => {
    const reason = await askText({ title: 'Снять свою оценку', label: 'Почему оценка больше не актуальна?', required: true });
    if (!reason) return;
    await mutateDetail(`/api/records/${record.id}/criteria/${button.dataset.withdrawScore}`, { method: 'DELETE', body: JSON.stringify({ expectedUpdatedAt: button.dataset.scoreVersion, reason }) });
  }));
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
  $('[data-open-record-chat]')?.addEventListener('click', event => openRecordChat(record.id, event.currentTarget));
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
  if (editForm && record.type === 'inbox') {
    const resizeTitle = bindPersonalNoteSheet(editForm, 'Текст входящего');
    resizeTitle();
    $('[data-restore-draft]')?.addEventListener('click', resizeTitle);
  }
  bindRecordWorkingDrafts(record.id);
}

function bindRecordWorkingDrafts(recordID) {
  $$('.criterion-personal-form, .criterion-decision-form, .criterion-weight-form').forEach((form) => bindWorkingDraft(form, `record:${recordID}:${form.className}:${form.dataset.criterionId}`));
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
  const context = captureRecordView(recordID);
  try {
    const relations = await api(`/api/records/${recordID}/relations`);
    if (!isRecordViewCurrent(context)) return;
    state.activeDetail = { ...state.activeDetail, ...relations, relationsLoaded: true };
    state.detailCache.set(recordID, state.activeDetail);
    renderRecordDialog();
  } catch (error) {
    if (!isRecordViewCurrent(context)) return;
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
  const context = captureRecordView(recordID);
  try {
    const activity = await api(`/api/activity?entityId=${encodeURIComponent(recordID)}&limit=500`);
    if (!isRecordViewCurrent(context)) return;
    state.activeDetail = { ...state.activeDetail, activity, activityLoaded: true };
    state.detailCache.set(recordID, state.activeDetail);
    renderRecordDialog();
  } catch (error) {
    if (!isRecordViewCurrent(context)) return;
    toast(`История карточки не загрузилась: ${error.message}`, true);
  }
}

async function loadRecordWorkflow(recordID) {
  const context = captureRecordView(recordID);
  try {
    const workflow = await api(`/api/records/${recordID}/workflow`);
    if (!isRecordViewCurrent(context)) return;
    state.activeDetail = { ...state.activeDetail, workflow, workflowLoaded: true };
    state.detailCache.set(recordID, state.activeDetail);
    renderRecordDialog();
  } catch (error) {
    if (!isRecordViewCurrent(context)) return;
    const loading = $(`[data-record-pane="${state.activeRecordTab}"] .relations-loading`);
    if (loading) loading.innerHTML = `${icon('help')}<strong>Рабочие данные не загрузились</strong><small>${escapeHTML(error.message)}</small><button type="button" class="secondary" data-retry-workflow>Повторить</button>`;
    $('[data-retry-workflow]')?.addEventListener('click', () => loadRecordWorkflow(recordID));
  }
}

async function refreshActiveRecordWorkflow(recordID) {
  const context = captureRecordView(recordID);
  state.detailCache.delete(recordID);
  const [detail, workflow] = await Promise.all([fetchRecordDetail(recordID, true), api(`/api/records/${recordID}/workflow`), syncProjectChanges()]);
  if (!isRecordViewCurrent(context)) return;
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

async function mutateDetail(path, options, onSaved) {
  const recordID = state.activeDetail.record.id;
  const accountID = state.me.id, workspaceID = state.activeWorkspaceId, requestID = state.activeRecordRequest;
  const sameWorkspace = () => state.me?.id === accountID && state.activeWorkspaceId === workspaceID;
  const sameCard = () => sameWorkspace() && state.activeRecordRequest === requestID && state.activeDetail?.record.id === recordID;
  try {
    await api(path, { ...options, headers: { ...options?.headers, 'X-Workspace-ID': workspaceID } });
    if (!sameWorkspace()) return true;
    onSaved?.();
    state.detailCache.delete(recordID);
    const [detail] = await Promise.all([fetchRecordDetail(recordID, true), syncProjectChanges()]);
    if (!sameCard()) return true;
    state.activeDetail = detail;
    if (state.activeRecordTab === 'relations') {
      const relations = await api(`/api/records/${recordID}/relations`, { headers: { 'X-Workspace-ID': workspaceID } });
      if (!sameCard()) return true;
      state.activeDetail = { ...state.activeDetail, ...relations, relationsLoaded: true };
      state.detailCache.set(recordID, state.activeDetail);
    }
    renderRecordDialog();
    toast('Сохранено');
    return true;
  } catch (error) { if (sameCard()) toast(error.message, true); return false; }
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

function projectAllowsType(type) {
  const module = { idea: 'idea', research: 'research', goal: 'goal', decision: 'outcomes', disagreement: 'outcomes', criterion: 'principles', document: 'document', risk: 'validation', hypothesis: 'validation', experiment: 'validation' }[type];
  return !module || state.projectNavigation.enabledViews.includes(module);
}

function toggleCreateMenu() {
  const menu = $('#create-menu');
  menu.innerHTML = `
    <button type="button" data-personal-capture>${icon('lock')}<span><strong>Личное входящее</strong></span></button>
    <button type="button" data-create-type="inbox">${icon('inbox')}<span><strong>Входящее</strong><small>Сохранить мысль, не выбирая тип</small></span></button>
    <button type="button" data-create-type="idea">${icon('lightbulb')}<span><strong>Быстрая идея</strong><small>Сохранить мысль без оценки</small></span></button>
    <button type="button" data-create-type="task">${icon('checkSquare')}<span><strong>Задача</strong><small>Участнику проекта</small></span></button>
    <button type="button" data-create-type="meeting">${icon('calendar')}<span><strong>Встреча</strong><small>Повестка, заметки и результаты</small></span></button>
    <button type="button" data-create-type="question_set">${icon('messages')}<span><strong>Карточка вопросов</strong><small>Несколько вопросов, личные ответы и итоги</small></span></button>
    <button type="button" data-create-type="research" data-create-mode="comparison">${icon('flask')}<span><strong>Сравнение вариантов</strong><small>Общие параметры, плюсы, минусы и оценка</small></span></button>
    <button type="button" data-create-type="risk">${icon('shield')}<span><strong>Риск</strong><small>Вероятность, влияние и мера снижения</small></span></button>
    <button type="button" data-create-type="hypothesis">${icon('hypothesis')}<span><strong>Гипотеза</strong><small>Предположение и критерий проверки</small></span></button>
    <button type="button" data-create-type="experiment">${icon('testTube')}<span><strong>Эксперимент</strong><small>Метод, метрика и порог успеха</small></span></button>
    <button type="button" data-create-type="decision">${icon('scale')}<span><strong>Решение</strong><small>Выбор, основания и ответственный</small></span></button>
    <button type="button" data-create-type="goal">${icon('target')}<span><strong>Цель</strong><small>Результат, срок и прогресс</small></span></button>
    <button type="button" data-create-type="document">${icon('fileText')}<span><strong>Документ</strong><small>Материал или рабочая заметка</small></span></button>`;
  $$('[data-create-type]', menu).forEach((button) => { if (!projectAllowsType(button.dataset.createType)) button.remove(); });
  menu.hidden = !menu.hidden;
  $('[data-personal-capture]', menu).addEventListener('click', event => { event.stopPropagation(); openPersonalCapture(); });
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
  const writingFields = initialType === 'inbox' ? personalNoteSheet({ title: preset.title, body: preset.description }, { bodyName: 'description', pin: false }) : `<label>${titleLabel}<input name="title" required maxlength="240" autofocus value="${escapeHTML(preset.title || '')}" placeholder="${preset.comparisonMode ? 'Например: Выбор сервера' : initialType === 'question_set' ? 'Например: Договорённости основателей' : initialType === 'inbox' ? 'Короткая мысль или наблюдение' : ''}"></label>${markdownEditor('description', descriptionLabel, preset.description || '', initialType === 'inbox' ? 4 : 7, 'Факты, контекст и ожидаемый результат', 'create-record')}`;
  $('#create-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${icon(initialMeta.icon)} Новая запись</span><h2>${escapeHTML(displayName)}</h2></div><button type="button" class="close-button icon-button" data-close-create aria-label="Закрыть">${icon('x')}</button></div><form id="create-record-form" class="card-form dialog-form ${initialType === 'inbox' ? 'personal-note-form inbox-record-form' : ''}">${writingFields}<input type="hidden" name="type" value="${initialType}"><input type="hidden" name="kind" value="${escapeHTML(preset.kind || '')}">${renderBusinessDetailsFields(initialType)}${planned ? `<div class="form-grid two"><label>${initialType === 'question_set' ? 'Координатор' : initialType === 'meeting' ? 'Организатор' : 'Ответственный'}<select name="ownerId">${userOptions(state.me.id)}</select></label><label>${initialType === 'meeting' ? 'Дата и время' : 'Срок'}<input name="dueAt" type="datetime-local" value="${escapeHTML(preset.dueAt || '')}"></label></div><div class="form-grid two"><label>Приоритет<select name="priority">${Object.entries(priorityLabels).map(([value, label]) => `<option value="${value}" ${value === (preset.priority || 'normal') ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Оценка времени, минут<input name="estimateMinutes" type="number" min="0" value="${Number(preset.estimateMinutes || 0)}"></label></div>` : `<input type="hidden" name="ownerId" value="${state.me.id}"><input type="hidden" name="priority" value="${escapeHTML(preset.priority || 'normal')}"><input type="hidden" name="estimateMinutes" value="${Number(preset.estimateMinutes || 0)}">`}<details class="form-more create-organization" ${sourceRecord ? 'open' : ''}><summary>Место в проекте и доступ</summary><div class="form-more-body"><div class="form-grid three"><label>Направление<select name="workstream">${Object.entries(workstreamLabels).map(([value, label]) => `<option value="${value}" ${defaultWorkstream === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Доступ к изменениям<select name="editPolicy">${Object.entries(editPolicyLabels).map(([value, label]) => `<option value="${value}" ${defaultEditPolicy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Родитель<select name="parentId"><option value="">Без родителя</option>${parentOptions}</select></label></div><label class="root-toggle"><input name="isRoot" type="checkbox" ${preset.isRoot ? 'checked' : ''}> <span><strong>Новый корень</strong><small>Начать самостоятельную крупную ветку вместо продолжения текущей цепочки.</small></span></label></div></details><div class="ai-suggestion"><span class="ai-suggestion-icon">${icon('sparkles')}</span><span><strong>AI-структура</strong><small id="ai-suggestion-status">По запросу предложим приоритет, оценку времени и место в проекте. Применение — отдельным действием.</small></span><button type="button" class="secondary" data-ai-suggest>Предложить</button></div><div class="form-actions"><button type="submit" class="primary">${icon('plus')} Создать</button><button type="button" class="secondary" data-close-create>Отмена</button></div></form>`;
  $$('[data-close-create]').forEach((button) => button.addEventListener('click', () => requestDialogClose($('#create-dialog'))));
  const createForm = $('#create-record-form');
	if (initialType === 'inbox') createForm.querySelector('.ai-suggestion')?.remove();
	bindMarkdownEditors($('#create-dialog'));
  bindWorkingDraft(createForm, draftScope);
  const resizeInboxTitle = initialType === 'inbox' ? bindPersonalNoteSheet(createForm, 'Текст входящего') : null;
  preventImplicitWorkspaceSubmit(createForm);
  if (initialType !== 'inbox') bindCreateSuggestion(createForm, initialType);
  $('#create-record-form').addEventListener('submit', async (event) => {
    event.preventDefault(); const form = new FormData(event.currentTarget); const due = form.get('dueAt');
    const submit = $('button[type="submit"]', event.currentTarget);
    if (submit.disabled) return;
    if (initialType === 'decision' && !String(form.get('description') || '').trim()) {
      event.currentTarget.elements.description?.focus();
      return toast('Зафиксируйте содержание и основание решения', true);
    }
    submit.disabled = true;
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
      closeDialogImmediately($('#create-dialog')); await syncProjectChanges(); toast(linkError || 'Карточка создана', Boolean(linkError)); await openRecord(record.id, { workspace: Boolean(preset.sourceRecordId), tab: preset.comparisonMode ? 'content' : undefined });
    } catch (error) { toast(error.message, true); }
    finally { submit.disabled = false; }
  });
  openModal($('#create-dialog'));
  if (resizeInboxTitle) {
    resizeInboxTitle();
    focusNotebook($('.markdown-editor[data-notebook]', createForm), Boolean(createForm.elements.description.value.trim()));
  }
}

function bindCreateSuggestion(form, recordType) {
  const tracked = ['priority', 'workstream', 'parentId', 'estimateMinutes'];
  tracked.forEach((name) => form.elements[name]?.addEventListener('change', () => { form.elements[name].dataset.userChanged = 'true'; }));
  const root = form.elements.isRoot;
  const parent = form.elements.parentId;
  root?.addEventListener('change', () => { if (root.checked && parent) { parent.value = ''; syncCustomSelect(parent); } });
  parent?.addEventListener('change', () => { if (parent.value && root) root.checked = false; });
  let requestNumber = 0, pending = null;
  const button = $('[data-ai-suggest]', form);
  const status = $('#ai-suggestion-status');
  const fingerprint = () => JSON.stringify(['title', 'description', ...tracked, 'isRoot'].map(name => {
    const field = form.elements[name];
    return field?.type === 'checkbox' ? field.checked : field?.value || '';
  }));
  const invalidate = () => {
    requestNumber++;
    pending = null;
    button.disabled = false;
    button.textContent = 'Предложить';
    status.textContent = 'Предложение применяется только после вашего подтверждения.';
  };
  const suggest = async () => {
    const title = form.elements.title.value.trim();
    if (title.length < 4) { status.textContent = 'Сначала напишите название — хотя бы 4 символа.'; return; }
    const currentRequest = ++requestNumber;
    const before = fingerprint();
    button.disabled = true;
    status.textContent = 'Анализируем карточку…';
    try {
      const suggestion = await api('/api/ai/suggest-record', { method: 'POST', body: JSON.stringify({ type: recordType, title, description: form.elements.description.value }) });
      if (currentRequest !== requestNumber || !form.isConnected || before !== fingerprint()) return;
      pending = { suggestion, before };
      const parentTitle = suggestion.parentId ? state.records.find((record) => record.id === suggestion.parentId)?.title : '';
      const source = suggestion.source === 'gemini' ? 'Gemini' : suggestion.source === 'groq' ? 'Groq' : 'локальная модель';
      status.textContent = `${source}: ${priorityLabels[suggestion.priority]}, ${minutesLabel(suggestion.estimateMinutes)}, ${workstreamLabels[suggestion.workstream]}${parentTitle ? `, ветка «${parentTitle}»` : ', без родителя'}. ${suggestion.reason}`;
      button.textContent = 'Применить предложение';
    } catch (error) {
      if (currentRequest === requestNumber) status.textContent = `Не удалось получить предложение: ${error.message}`;
    } finally {
      if (currentRequest === requestNumber) button.disabled = false;
    }
  };
  button.addEventListener('click', () => {
    if (!pending) return suggest();
    if (pending.before !== fingerprint()) { invalidate(); return; }
    const { suggestion } = pending;
    tracked.forEach(name => {
      const field = form.elements[name];
      if (field && suggestion[name] !== undefined) {
        field.value = suggestion[name];
        if (field.tagName === 'SELECT') syncCustomSelect(field);
        field.dispatchEvent(new Event('change', { bubbles: true }));
      }
    });
    if (suggestion.parentId && root) root.checked = false;
    invalidate();
    status.textContent = 'Предложение применено. Проверьте поля перед созданием.';
  });
  ['title', 'description', ...tracked, 'isRoot'].forEach(name => {
    form.elements[name]?.addEventListener('input', invalidate);
    form.elements[name]?.addEventListener('change', invalidate);
  });
}

function actionLabel(action) {
  return ({ created: 'создал карточку', profile_updated: 'изменил профиль', avatar_updated: 'обновил фото профиля', avatar_removed: 'удалил фото профиля', capacity_updated: 'изменил доступное время', planning_cycle_created: 'начал 12-недельный цикл', planning_cycle_updated: 'изменил 12-недельный цикл', planning_cycle_replaced: 'заменил 12-недельный цикл', updated: 'изменил карточку', triaged: 'разобрал входящее', business_details_updated: 'обновил контрольные поля', change_undone: 'отменил ошибочное изменение', reordered: 'изменил порядок блоков', converted_to_questions: 'преобразовал в карточку вопросов', archived: 'перенёс в архив', section_updated: 'обновил раздел', link_created: 'создал связь', link_removed: 'убрал связь', criterion_scored: 'сохранил личную оценку', criterion_score_withdrawn: 'снял личную оценку', criterion_decision_updated: 'утвердил итог по критерию', proof_added: 'добавил доказательство', completed: 'завершил задачу', partners_notified: 'уведомил партнёра', questions_added: 'добавил вопросы', question_answered: 'ответил на вопрос', question_decided: 'зафиксировал совместное решение', question_archived: 'архивировал вопрос', output_created: 'превратил вывод в рабочую карточку', created_from_question: 'создал карточку из совместного вывода', research_option_created: 'добавил вариант исследования', research_option_updated: 'обновил вариант исследования', research_option_archived: 'архивировал вариант исследования', research_field_created: 'добавил поле сравнения', research_field_archived: 'архивировал поле сравнения', comment_added: 'добавил комментарий', checklist_added: 'добавил шаг', checklist_updated: 'обновил шаг', review_submitted: 'отправил результат на проверку', review_accepted: 'принял результат', review_rework: 'вернул задачу на доработку', attachment_added: 'приложил файл', recurrence_created: 'создал следующее повторение', recurrence_updated: 'изменил повторение' }[action] || action);
}

function activityActionLabel(item) {
  if (item.action === 'bulk_updated') return 'изменил карточку массовым действием';
  if (item.action === 'bulk_undone') return 'отменил массовое изменение';
  const schemaActions = {field_archived:'удалил поле доски',field_restored:'восстановил поле доски',stage_archived:'удалил колонку доски',stage_restored:'восстановил колонку доски',schema_reordered:'изменил порядок полей или колонок',collection_stage_relocated:'переместил карточку из удалённой колонки'};
  if (schemaActions[item.action]) return schemaActions[item.action];
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
  if (field === 'stageId' && value) return state.collections.flatMap(collection => collection.stages).find(stage => stage.id === value)?.name || 'Прежний этап доски';
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
  const fieldLabels = { stageId: 'Этап доски', criterionWeight: 'Вес критерия', username: 'Логин', type: 'Тип карточки', title: 'Название', description: 'Описание', status: 'Статус', ownerId: 'Ответственный', decisionMakerId: 'Принимает решение', dueAt: 'Срок', priority: 'Приоритет', workstream: 'Направление', editPolicy: 'Доступ', parentId: 'Родитель', isRoot: 'Иерархия', estimateMinutes: 'Оценка времени', actualMinutes: 'Фактическое время', progress: 'Прогресс', progressNote: 'Ход работы', result: 'Результат', summaryMd: 'Краткий вывод', prosMd: 'Плюсы', consMd: 'Минусы', notesMd: 'Заметки', rating: 'Оценка' };
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
  if (['criterion_scored', 'criterion_decision_updated'].includes(item.action) && details.score !== undefined) rows.push(['Оценка', `${details.score} из 10`]);
  if (item.action === 'criterion_scored' && details.note) rows.push(['Обоснование', details.note]);
  if (item.action === 'criterion_score_withdrawn' && details.before) rows.push(['Снятая оценка', `${details.before.score} / 10 · ${details.before.note || 'Без обоснования'}`]);
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
  if (item.entityType === 'user') return item.details?.username || 'Участник команды';
  if (item.entityType === 'collection') return item.details?.name || state.collections.find(collection => collection.id === item.entityId)?.name || 'Доска';
  return state.records.find((record) => record.id === item.entityId)?.title || item.details?.title || (item.entityType === 'section_definition' ? 'Шаблон карточки' : item.entityType === 'planning_cycle' ? '12-недельный цикл' : typeMeta[item.entityType]?.singular || 'Запись недоступна');
}

function renderActivityItem(item) {
  return `<button type="button" class="activity-item" data-open-event="${item.id}"><span class="history-marker">${icon(item.entityType === 'planning_cycle' ? 'calendar' : typeMeta[item.entityType]?.icon || 'history')}</span><span><strong>${escapeHTML(item.actorUsername)} ${escapeHTML(activityActionLabel(item))}</strong><small>${escapeHTML(activityContext(item))}</small></span><time>${formatDate(item.createdAt, true)}</time>${icon('chevronRight', 'activity-arrow')}</button>`;
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

function avatarMarkup(user, className = '') {
	const classes = ['avatar', className].filter(Boolean).join(' ');
	const content = user?.avatarUrl
		? `<img src="${escapeHTML(user.avatarUrl)}" alt="" loading="lazy">`
		: escapeHTML(userInitials(user));
	return `<span class="${classes}">${content}</span>`;
}

function renderAvatarContent(node, user) {
	if (!node) return;
	node.innerHTML = user?.avatarUrl ? `<img src="${escapeHTML(user.avatarUrl)}" alt="">` : escapeHTML(userInitials(user));
}

function renderProfilePhotoEditor(user) {
  return `<section class="profile-photo-editor"><button type="button" class="profile-avatar-picker" data-pick-avatar title="Изменить фото профиля" aria-label="Изменить фото профиля">${avatarMarkup(user, 'profile-avatar')}<span class="profile-camera" aria-hidden="true">${icon('camera')}</span></button><input id="profile-avatar-input" type="file" accept="image/jpeg,image/png" hidden><div><strong>Фото профиля</strong><small>JPEG или PNG · до 5 МБ</small><button type="button" class="quiet" data-delete-avatar ${user.avatarUrl ? '' : 'hidden'}>${icon('trash')} Удалить фото</button><progress id="profile-avatar-progress" max="100" value="0" aria-label="Загрузка фото" hidden></progress><small data-avatar-status role="status"></small></div></section>`;
}

function uploadProfileAvatar(file, onProgress) {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();
		xhr.open('POST', '/api/me/avatar');
		xhr.responseType = 'json';
		xhr.timeout = 60000;
		xhr.addEventListener('timeout', () => reject(new Error('Загрузка заняла слишком много времени. Попробуйте ещё раз.')));
		xhr.upload.addEventListener('progress', (event) => {
			if (event.lengthComputable) onProgress?.(Math.round(event.loaded * 100 / event.total));
		});
		xhr.addEventListener('load', () => {
			if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response);
			else reject(new Error(xhr.response?.error || 'Не удалось загрузить фото'));
		});
		xhr.addEventListener('error', () => reject(new Error('Не удалось связаться с сервером')));
		const form = new FormData();
		form.append('file', file);
		xhr.send(form);
	});
}

function profileRequestIsCurrent(dialog, requestId, viewerId, workspaceId) {
  return dialog.open && dialog.dataset.profileRequest === requestId && state.me?.id === viewerId && state.activeWorkspaceId === workspaceId;
}

function profileUpdatePayload(form) {
  const payload = { username: form.get('username'), displayName: form.get('displayName'), bio: form.get('bio') };
  if (form.has('birthDate')) payload.birthDate = form.get('birthDate');
  if (form.has('lifeExpectancyYears')) payload.lifeExpectancyYears = Number(form.get('lifeExpectancyYears'));
  return payload;
}

function renderProfileActivity(profile, ownProfile) {
  const maxSeconds = Math.max(1, ...profile.activity.map((day) => day.activeSeconds));
  const accuracy = profile.estimateMinutes > 0 && profile.actualMinutes > 0 ? Math.round(profile.actualMinutes * 100 / profile.estimateMinutes) : 0;
  const insight = estimateInsight(accuracy, profile.completedRecords);
  const capacityHours = profile.weeklyCapacityMinutes ? Number((profile.weeklyCapacityMinutes / 60).toFixed(1)) : 0;
  const capacityTone = !profile.weeklyCapacityMinutes ? 'unset' : profile.utilizationPercent > 100 ? 'overload' : profile.utilizationPercent >= 80 ? 'tight' : 'normal';
  return `<div class="profile-metrics">${ownProfile ? `<article><span>Активное время · 30 дней</span><strong>${durationLabel(profile.activeSeconds30Days)}</strong><small>Только взаимодействие с интерфейсом</small></article><article><span>Действия в проекте · 30 дней</span><strong>${profile.actions30Days}</strong><small>${interactionsCountLabel(profile.interactions30Days)} с UI</small></article>` : ''}<article><span>Завершено</span><strong>${profile.completedRecords}</strong><small>карточек в этом проекте</small></article><article><span>Факт к оценке</span><strong>${accuracy ? `${accuracy}%` : 'Нет данных'}</strong><small>${minutesLabel(profile.actualMinutes)} факт · ${minutesLabel(profile.estimateMinutes)} план</small></article></div><section class="estimate-insight ${insight.tone}">${icon('clock')}<div><strong>${escapeHTML(insight.title)}</strong><p>${escapeHTML(insight.text)}</p></div></section><section class="weekly-capacity capacity-${capacityTone}"><header><div><span>Рабочая неделя</span><h3>${profile.weeklyCapacityMinutes ? `${profile.utilizationPercent}% запланировано` : 'Ёмкость пока не задана'}</h3><p>${minutesLabel(profile.scheduledMinutes)} со сроком на этой неделе${profile.unscheduledMinutes ? ` · ${minutesLabel(profile.unscheduledMinutes)} без недельного слота` : ''}</p></div><strong>${profile.weeklyCapacityMinutes ? minutesLabel(profile.weeklyCapacityMinutes) : '—'}</strong></header><progress max="100" value="${Math.min(100, profile.utilizationPercent || 0)}"></progress>${ownProfile ? `<form id="capacity-form"><label>Доступно в неделю, часов<input name="hours" type="number" min="0" max="168" step="0.5" value="${capacityHours}"></label><button type="submit" class="secondary">Сохранить ёмкость</button></form>` : '<small>Ёмкость задаёт сам участник в своём профиле.</small>'}</section>${ownProfile ? `<section class="activity-chart"><header><h3>Активность по дням</h3><span>Последние 30 дней</span></header><div>${profile.activity.length ? profile.activity.slice().reverse().map((day) => `<span title="${escapeHTML(day.date)} · ${durationLabel(day.activeSeconds)} · ${interactionsCountLabel(day.interactions)}"><i data-level="${Math.max(1, Math.ceil(day.activeSeconds * 5 / maxSeconds))}"></i><small>${day.date.slice(8)}</small></span>`).join('') : `<p>Активность начнёт накапливаться после взаимодействия с новой версией.</p>`}</div></section>` : ''}<section class="profile-actions"><header><h3>Действия в этом проекте</h3><span>${profile.recentActions.length}</span></header><div class="activity-list">${profile.recentActions.map(renderActivityItem).join('') || emptyState('Действий пока нет.')}</div></section>`;
}

async function openProfile(userId) {
  const dialog = $('#profile-dialog');
  if (dialog.open && !await confirmDialogTransition(dialog)) return;
  const requestId = String(Number(dialog.dataset.profileRequest || 0) + 1);
  dialog.dataset.profileRequest = requestId;
  dialog.dataset.composerDirty = 'false';
  const ownProfile = Number(userId) === state.me.id;
  const viewerId = state.me.id;
  const workspaceId = state.activeWorkspaceId;
  const user = ownProfile ? state.me : state.users.find((item) => item.id === Number(userId));
  const profile = { user: user || { id: Number(userId), username: '', displayName: 'Участник', createdAt: '' } };
  const isCurrent = () => profileRequestIsCurrent(dialog, requestId, viewerId, workspaceId);
  openModal(dialog);
  try {
    const displayName = profile.user.displayName || profile.user.username;
    const settings = { birthDate: null, lifeExpectancyYears: 100 };
    $('#profile-dialog-content').innerHTML = `<div class="dialog-header"><div><span class="record-kind">${ownProfile ? 'Мой аккаунт' : 'Участник команды'}</span><h2>${ownProfile ? 'Профиль' : escapeHTML(displayName)}</h2><p>@${escapeHTML(profile.user.username)} · на платформе с ${formatDate(profile.user.createdAt)}</p></div><button type="button" class="close-button icon-button" data-close-profile aria-label="Закрыть">${icon('x')}</button></div><div class="profile-body">${!ownProfile ? `<section class="profile-summary">${avatarMarkup(profile.user, 'profile-avatar')}<div><h3>${escapeHTML(displayName)}</h3><p>@${escapeHTML(profile.user.username)}</p>${profile.user.bio ? `<div class="profile-bio">${escapeHTML(profile.user.bio).replace(/\n/g, '<br>')}</div>` : ''}</div>${ownProfile ? `<button type="button" class="secondary" data-edit-profile>${icon('edit')} Изменить профиль</button>` : ''}</section>` : ''}${ownProfile ? `<form id="profile-details-form" class="profile-editor">${renderProfilePhotoEditor(profile.user)}<div class="form-grid two"><label>Отображаемое имя<input name="displayName" maxlength="80" value="${escapeHTML(profile.user.displayName || '')}" placeholder="Как вас видят участники"></label><label>Имя пользователя<input name="username" maxlength="32" value="${escapeHTML(profile.user.username)}"></label></div><label>О себе<textarea name="bio" maxlength="800" rows="4" placeholder="Короткое публичное описание">${escapeHTML(profile.user.bio || '')}</textarea></label><div class="profile-private-fields"><div><span>${icon('lock')} Видно только вам</span><small>Эти данные используются только для личной карты времени.</small></div><div class="form-grid two"><label>Дата рождения<input name="birthDate" type="date" disabled value="${escapeHTML(settings.birthDate || '')}"></label><label>Горизонт, лет<input name="lifeExpectancyYears" type="number" disabled min="1" max="150" value=""></label></div><p class="profile-settings-status" data-profile-settings-status role="status">Загружаем личные настройки…</p></div><div class="form-actions"><button type="submit" class="primary">${icon('check')} Сохранить профиль</button><button type="button" class="secondary" data-cancel-profile-edit>Сбросить изменения</button></div></form><details class="profile-security"><summary>${icon('lock')} Безопасность аккаунта</summary><form id="password-form"><div class="form-grid two"><label>Текущий пароль<input name="currentPassword" type="password" autocomplete="current-password" required></label><label>Новый пароль<input name="newPassword" type="password" autocomplete="new-password" minlength="8" required></label></div><button type="submit" class="secondary">Изменить пароль</button></form></details><details class="profile-security" data-profile-ai><summary>${icon('sparkles')} Состояние AI</summary><section class="ai-provider-status checking" id="ai-provider-status">${icon('sparkles')}<div><strong>Состояние AI</strong><p>Локальный анализ доступен всегда.</p></div></section></details>` : ''}<details class="profile-security profile-activity-details" ${ownProfile ? '' : 'open'}><summary>Активность и нагрузка</summary><div data-profile-activity-body></div></details></div>`;
    $$('[data-close-profile]').forEach((button) => button.addEventListener('click', () => requestDialogClose(dialog)));
    const forms = $$('form', dialog);
    const formValues = (form) => JSON.stringify([...new FormData(form).entries()].filter(([key]) => key));
    const baselines = new Map(forms.map((form) => [form, formValues(form)]));
    const checkDirty = () => { dialog.dataset.composerDirty = String(forms.some((form) => formValues(form) !== baselines.get(form))); };
    forms.forEach((form) => { form.addEventListener('input', checkDirty); form.addEventListener('change', checkDirty); });
    const trackForm = (form) => {
      forms.push(form); baselines.set(form, formValues(form));
      form.addEventListener('input', checkDirty); form.addEventListener('change', checkDirty);
    };
    const markSaved = (form) => { baselines.set(form, formValues(form)); checkDirty(); };
    $('[data-cancel-profile-edit]', dialog)?.addEventListener('click', () => {
      const form = $('#profile-details-form', dialog);
      if (formValues(form) !== baselines.get(form) && !confirm('Сбросить несохранённые поля профиля? Фото останется без изменений.')) return;
      form.reset(); checkDirty();
    });
    $('[data-pick-avatar]', dialog)?.addEventListener('click', () => $('#profile-avatar-input', dialog).click());
    const syncAvatar = (user) => {
      state.me = { ...state.me, ...user };
      const own = state.users.find((item) => item.id === state.me.id);
      if (own) Object.assign(own, user);
      renderAvatarContent($('#user-avatar'), state.me);
      renderAvatarContent($('.profile-photo-editor .avatar', dialog), state.me);
      $('[data-delete-avatar]', dialog).hidden = !state.me.avatarUrl;
    };
		const setProfileBusy = (busy) => {
      dialog.dataset.profileBusy = String(busy);
      $$('button[type="submit"], [data-pick-avatar], [data-delete-avatar], [data-cancel-profile-edit]', dialog).forEach((button) => { button.disabled = busy; });
      $$('input:not([type="file"]), textarea', dialog).forEach((input) => { input.readOnly = busy; });
    };
		$('#profile-avatar-input', dialog)?.addEventListener('change', async (event) => {
			const input = event.currentTarget;
			const file = input.files?.[0];
			if (!file) return;
			if (file.size > 5 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type)) { input.value = ''; toast('Выберите JPEG или PNG размером до 5 МБ', true); return; }
			const progress = $('#profile-avatar-progress', dialog);
			progress.hidden = false; progress.value = 0; setProfileBusy(true);
			$('[data-avatar-status]', dialog).textContent = 'Загружаем фото…';
			try {
				const updated = await uploadProfileAvatar(file, (value) => { progress.value = value; });
				syncAvatar(updated);
				$('[data-avatar-status]', dialog).textContent = 'Фото обновлено';
				toast('Фото профиля обновлено');
			} catch (error) {
				$('[data-avatar-status]', dialog).textContent = error.message;
				toast(error.message, true);
			} finally { progress.hidden = true; input.value = ''; setProfileBusy(false); }
		});
		$('[data-delete-avatar]', dialog)?.addEventListener('click', async (event) => {
			if (!confirm('Удалить фото профиля?')) return;
			setProfileBusy(true);
			try {
				await api('/api/me/avatar', { method: 'DELETE' });
				syncAvatar({ avatarUrl: '' });
				$('[data-avatar-status]', dialog).textContent = 'Фото удалено';
				toast('Фото профиля удалено');
			} catch (error) { toast(error.message, true); }
      finally { setProfileBusy(false); }
		});
    $('#profile-details-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const node = event.currentTarget;
      const form = new FormData(node);
      if (dialog.dataset.profileBusy === 'true') return;
      setProfileBusy(true);
      try {
        const payload = profileUpdatePayload(form);
        state.me = await api('/api/me', { method: 'PATCH', body: JSON.stringify(payload) });
        profile.user = state.me;
        const member = state.users.find((item) => item.id === state.me.id);
        if (member) Object.assign(member, state.me);
        $('#user-name').textContent = state.me.username;
        renderAvatarContent($('#user-avatar'), state.me);
        if (state.personal && form.has('birthDate')) state.personal.settings = { birthDate: payload.birthDate || null, lifeExpectancyYears: payload.lifeExpectancyYears };
        markSaved(node);
        $$('input, textarea', node).forEach((input) => { if (input.type !== 'file') input.defaultValue = input.value; });
        toast('Профиль сохранён');
      } catch (error) { toast(error.message, true); }
      finally { setProfileBusy(false); }
    });
    $('#password-form')?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const node = event.currentTarget;
      const form = new FormData(node);
      if (dialog.dataset.profileBusy === 'true') return;
      setProfileBusy(true);
      try {
        await api('/api/me/password', { method: 'PUT', body: JSON.stringify({ currentPassword: form.get('currentPassword'), newPassword: form.get('newPassword') }) });
        node.reset(); markSaved(node);
        toast('Пароль изменён, остальные сессии завершены');
      } catch (error) { toast(error.message, true); }
      finally { setProfileBusy(false); }
    });
    const activityDetails = $('.profile-activity-details', dialog);
    let activityLoading = false, activityLoaded = false;
    const loadActivity = async () => {
      if (activityLoading || activityLoaded) return;
      activityLoading = true;
      const body = $('[data-profile-activity-body]', dialog);
      body.innerHTML = '<div class="profile-section-loading" role="status"><span class="spinner"></span>Загружаем активность…</div>';
      try {
        const activity = await api(`/api/users/${userId}/profile`, { headers: { 'X-Workspace-ID': workspaceId } });
        if (!isCurrent()) return;
        body.innerHTML = renderProfileActivity(activity, ownProfile);
        const capacityForm = $('#capacity-form', dialog);
        if (capacityForm) trackForm(capacityForm);
        $('#capacity-form', dialog)?.addEventListener('submit', async (event) => {
          event.preventDefault();
          const node = event.currentTarget;
          if (dialog.dataset.profileBusy === 'true') return;
          setProfileBusy(true);
          const hours = Number(new FormData(node).get('hours') || 0);
          try {
            state.teamCapacity = await api(`/api/users/${activity.user.id}/capacity`, { method: 'PUT', body: JSON.stringify({ weeklyMinutes: Math.round(hours * 60) }) });
            markSaved(node);
            toast('Недельная ёмкость сохранена');
          } catch (error) { toast(error.message, true); }
          finally { setProfileBusy(false); }
        });
        const recentActions = new Map(activity.recentActions.map((item) => [item.id, item]));
        $$('[data-open-event]', dialog).forEach((button) => button.addEventListener('click', () => openActivity(button.dataset.openEvent, recentActions.get(button.dataset.openEvent))));

        activityLoaded = true;
      } catch (error) {
        if (!isCurrent()) return;
        body.innerHTML = `<div class="profile-section-error" role="status"><p>${escapeHTML(error.message)}</p><button type="button" class="secondary" data-retry-profile-activity>Повторить загрузку</button></div>`;
        $('[data-retry-profile-activity]', body).addEventListener('click', loadActivity);
      } finally { activityLoading = false; }
    };
    activityDetails.addEventListener('toggle', () => { if (activityDetails.open) void loadActivity(); });
    if (!ownProfile) void loadActivity();
    if (ownProfile) {
      const loadSettings = async () => {
        const status = $('[data-profile-settings-status]', dialog);
        status.textContent = 'Загружаем личные настройки…';
        try {
          const basic = await api(`/api/users/${userId}/profile?view=basic`, { headers: { 'X-Workspace-ID': workspaceId } });
          if (!isCurrent()) return;
          const form = $('#profile-details-form', dialog);
          const baseline = new Map(JSON.parse(baselines.get(form)));
          for (const [name, value] of Object.entries(basic.settings)) {
            const field = form.elements[name];
            field.value = value ?? ''; field.defaultValue = field.value; field.disabled = false;
            field.readOnly = dialog.dataset.profileBusy === 'true';
            baseline.set(name, field.value);
          }
          baselines.set(form, JSON.stringify([...new FormData(form).entries()].map(([name,value]) => [name,baseline.has(name) ? baseline.get(name) : value])));
          checkDirty(); status.textContent = '';
        } catch (error) {
          if (!isCurrent()) return;
          status.innerHTML = `Личные настройки не загрузились. <button type="button" class="text-button" data-retry-profile-settings>Повторить</button>`;
          $('[data-retry-profile-settings]', status).addEventListener('click', loadSettings, { once: true });
        }
      };
      void loadSettings();
      let aiRequested = false;
      $('[data-profile-ai]', dialog).addEventListener('toggle', event => {
        if (!event.currentTarget.open || aiRequested) return;
        aiRequested = true;
      api('/api/ai/health').then((health) => {
			const node = $('#ai-provider-status', dialog); if (!node || !dialog.open || dialog.dataset.profileRequest !== requestId) return;
			const externalProvider = health.provider === 'gemini' ? 'Gemini' : health.provider === 'groq' ? 'Groq' : 'Внешняя модель';
			const provider = health.providerAvailable ? externalProvider : 'Локальный анализ активен';
			const model = health.model ? ` · ${health.model}` : '';
			const message = health.providerAvailable
				? health.message
				: health.configured ? `${externalProvider}${model} недоступен. ${health.message || 'Используются локальные правила.'}` : (health.message || 'Внешняя модель не настроена; используются локальные правила.');
			node.className = `ai-provider-status ${health.providerAvailable ? 'available' : 'fallback'}`;
			node.innerHTML = `${icon('sparkles')}<div><strong>${escapeHTML(`${provider}${health.providerAvailable ? model : ''}`)}</strong><p>${escapeHTML(message)}</p></div>`;
		}).catch(() => {});

      });
    }
  } catch (error) {
    if (!dialog.open || dialog.dataset.profileRequest !== requestId) return;
    $('#profile-dialog-content').innerHTML = `<div class="record-load-error">${icon('help')}<h2>Профиль не загрузился</h2><p>${escapeHTML(error.message)}</p><button type="button" class="secondary" data-close-profile>Закрыть</button></div>`;
    $('[data-close-profile]').addEventListener('click', () => requestDialogClose(dialog));
  }
}

function userInitials(user) {
  const source = String(user?.displayName || user?.username || '').trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return source.slice(0, 2).toUpperCase();
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
  const availableTypes = [...new Set(state.activity.map((item) => item.entityType))].filter((type) => typeMeta[type] || type === 'planning_cycle').sort((a, b) => (typeMeta[a]?.singular || '12-недельный цикл').localeCompare(typeMeta[b]?.singular || '12-недельный цикл', 'ru'));
  $('#main-content').innerHTML = `<div class="history-title"><div><p class="eyebrow">Память проекта</p><h1>История</h1><p>Решения и изменения в человеческом виде, с переходом к исходной карточке.</p></div><span>${activity.length} событий</span></div><section class="history-controls" aria-label="Фильтры истории"><div class="segmented compact"><button type="button" class="segment ${state.historyScope === 'project' ? 'active' : ''}" data-history-scope="project">Работа проекта</button><button type="button" class="segment ${state.historyScope === 'all' ? 'active' : ''}" data-history-scope="all">Включая настройки</button></div><label>Автор<select id="history-actor"><option value="all">Вся команда</option>${state.users.map((user) => `<option value="${user.id}" ${state.historyActor === String(user.id) ? 'selected' : ''}>${escapeHTML(user.username)}</option>`).join('')}</select></label><label>Объект<select id="history-type"><option value="all">Все карточки</option>${availableTypes.map((type) => `<option value="${type}" ${state.historyType === type ? 'selected' : ''}>${escapeHTML(typeMeta[type]?.singular || '12-недельный цикл')}</option>`).join('')}</select></label></section><section class="history-feed">${[...groups.entries()].map(([day, items]) => `<div class="history-day"><time>${escapeHTML(day)}</time><div class="activity-list">${items.map(renderActivityItem).join('')}</div></div>`).join('') || `<div class="guided-empty history-empty">${icon('history')}<h3>Событий в этом представлении нет</h3><p>Сбросьте фильтры или продолжите работу с карточками.</p></div>`}</section>${state.historyLoadedAll ? '' : `<div class="history-more"><button type="button" class="secondary" id="load-older-history">${icon('history')} Загрузить более ранние события</button></div>`}`;
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
    state.activity.push(...next.filter((item) => !known.has(item.id) && (typeMeta[item.entityType] || ['section_definition', 'planning_cycle'].includes(item.entityType))));
    state.historyLoadedAll = next.length < 200;
    renderHistory();
  } catch (error) {
    button.disabled = false; button.textContent = 'Повторить загрузку'; toast(error.message, true);
  }
}

function renderStructure() {
  const configurableTypes = Object.entries(typeMeta).filter(([key]) => !['question_set', 'meeting', 'risk', 'hypothesis', 'experiment', 'inbox'].includes(key));
  const selectedType = state.structureType || 'task';
  state.structureType = selectedType;
  const admin = canConfigureWorkspace();
  const definitions = state.definitions.filter((definition) => definition.scopeType === selectedType || !definition.scopeType);
  const active = definitions.filter((definition) => definition.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const hidden = definitions.filter((definition) => !definition.active).sort((a, b) => a.sortOrder - b.sortOrder);
  const actions = (definition) => {
    if (!admin) return '';
    return `<div class="template-actions"><button type="button" class="icon-button" data-rename-definition="${definition.id}" title="Переименовать" aria-label="Переименовать: ${escapeHTML(definition.name)}">${icon('edit')}</button><button type="button" class="icon-button" data-hide-definition="${definition.id}" title="Скрыть блок" aria-label="Скрыть: ${escapeHTML(definition.name)}">${icon('minus')}</button></div>`;
  };
  $('#main-content').innerHTML = `<div class="page-heading template-heading"><div><p class="eyebrow">${escapeHTML(activeWorkspace()?.name || 'Проект')}</p><h1>Содержимое карточек</h1></div><button type="button" class="secondary" data-back-to-composer>${icon('arrowLeft')} Меню и страницы</button></div><div class="template-editor"><aside>${configurableTypes.map(([key, meta]) => `<button type="button" data-structure-type="${key}" class="${selectedType === key ? 'active' : ''}">${icon(meta.icon)}<span>${meta.label}</span><b>${state.definitions.filter((definition) => definition.scopeType === key && definition.active).length}</b></button>`).join('')}</aside><section><header><h2>${typeMeta[selectedType].label}</h2>${admin ? '' : '<p>Шаблоны изменяет администратор проекта.</p>'}</header><div class="template-block-list" data-template-list>${active.map((definition) => `<article class="template-block" draggable="${admin && Boolean(definition.scopeType)}" data-template-block="${definition.id}" data-scope-type="${definition.scopeType || ''}">${admin ? `<button type="button" class="drag-handle" aria-label="Перетащить блок «${escapeHTML(definition.name)}»" title="Перетащить блок">${icon('grip')}</button>` : ''}<div class="template-block-name"><strong>${escapeHTML(definition.name)}</strong><small>${definition.scopeType ? typeMeta[definition.scopeType].label : 'Во всех типах карточек'}</small></div>${actions(definition)}</article>`).join('') || '<p class="composer-access-note">В шаблоне нет блоков.</p>'}${admin ? `<div class="template-drop-actions"><button type="button" class="template-add" data-add-template-block>${icon('plus')} Добавить блок</button><div class="template-trash" data-template-trash>${icon('archive')} Скрыть блок</div></div>` : ''}</div>${hidden.length ? `<details class="hidden-template-blocks"><summary>Скрытые блоки <b>${hidden.length}</b></summary><div>${hidden.map((definition) => `<button type="button" data-restore-definition="${definition.id}" ${admin ? '' : 'disabled'}>${icon('rotate')}<span><strong>${escapeHTML(definition.name)}</strong><small>Вернуть в шаблон</small></span></button>`).join('')}</div></details>` : ''}</section></div>`;
  $('[data-back-to-composer]').addEventListener('click', () => openNavigationSettings());
  $$('[data-structure-type]').forEach((button) => button.addEventListener('click', () => { state.structureType = button.dataset.structureType; renderStructure(); }));
  const refresh = async () => { state.detailCache.clear(); state.definitions = await api('/api/section-definitions'); renderStructure(); };
  const update = async (id, value) => { try { await api(`/api/section-definitions/${id}`, { method: 'PATCH', body: JSON.stringify(value) }); await refresh(); toast('Шаблон проекта сохранён'); } catch (error) { toast(error.message, true); } };
  $('[data-add-template-block]')?.addEventListener('click', async () => { const name = await askText({ title: 'Новый блок', label: 'Название', required: true }); if (!name) return; try { await api('/api/section-definitions', { method: 'POST', body: JSON.stringify({ name, scopeType: selectedType, kind: 'universal' }) }); await refresh(); } catch (error) { toast(error.message, true); } });
  $$('[data-hide-definition]').forEach((button) => button.addEventListener('click', () => update(button.dataset.hideDefinition, { active: false })));
  $$('[data-restore-definition]').forEach((button) => button.addEventListener('click', () => update(button.dataset.restoreDefinition, { active: true })));
  $$('[data-rename-definition]').forEach((button) => button.addEventListener('click', async () => { const definition = definitions.find((item) => item.id === button.dataset.renameDefinition); const name = await askText({ title: 'Название блока', label: 'Название', defaultValue: definition.name, required: true }); if (name && name !== definition.name) await update(definition.id, { name }); }));
  if (admin) bindTemplateDrag(selectedType);
}

async function saveTemplateOrder(scopeType, list) {
  const workspace = state.activeWorkspaceId;
  const orderedIds = $$('[data-template-block]', list).filter((row) => row.dataset.scopeType === scopeType).map((row) => row.dataset.templateBlock);
  if (!orderedIds.length) return;
  await api('/api/section-definitions/reorder', { method: 'POST', body: JSON.stringify({ scopeType, orderedIds }) });
  if (workspace !== state.activeWorkspaceId) return;
  orderedIds.forEach((id, index) => {
    const definition = state.definitions.find((item) => item.id === id);
    if (definition) definition.sortOrder = (index + 1) * 10;
  });
}

function bindTemplateDrag(scopeType) {
  const list = $('[data-template-list]');
  $('[data-template-trash]', list)?.remove();
  $$('[data-template-block]', list).forEach((row) => {
    row.draggable = false;
    const handle = $('.drag-handle', row);
    if (!handle) return;
    handle.disabled = row.dataset.scopeType !== scopeType;
    if (!handle.disabled) handle.dataset.reorderHandle = '';
  });
  bindReorderList(list, `[data-template-block][data-scope-type="${scopeType}"]`, async () => {
    await saveTemplateOrder(scopeType, list);
    toast('Порядок блоков сохранён');
  });
}

function renderNotifications() {
  const items = state.notificationInbox?.items || [];
  let day = '';
  const rows = items.map((item) => {
    const label = formatDate(item.createdAt);
    const heading = day === label ? '' : `<h3 class="notification-day">${escapeHTML(label)}</h3>`;
    day = label;
    return `${heading}<article class="notification-row ${item.readAt || item.obsolete ? '' : 'unread'}"><button type="button" class="notification" data-open-notification="${escapeHTML(item.id)}"><i></i><span><strong>${escapeHTML(item.title)}</strong><p>${escapeHTML(item.body)}</p><small>${formatDate(item.createdAt, true)}${item.obsolete ? ' · Историческое напоминание — проверьте источник' : ''}</small></span></button><button type="button" class="icon-button" data-notification-read="${escapeHTML(item.id)}" title="${item.readAt ? 'Отметить непрочитанным' : 'Отметить прочитанным'}" aria-label="${item.readAt ? 'Отметить непрочитанным' : 'Отметить прочитанным'}">${icon(item.readAt ? 'rotate' : 'check')}</button></article>`;
  }).join('');
  $('#main-content').innerHTML = `<section class="notification-inbox"><header class="notification-heading"><button type="button" class="secondary" data-notification-back>${icon('arrowLeft')} Назад</button><button type="button" class="text-button" data-reminder-settings>${icon('settings')} Напоминания</button><button type="button" class="text-button" id="read-all" ${state.unreadCount ? '' : 'disabled'}>${icon('check')} Прочитать все</button></header><div class="notification-filters"><div class="segmented" role="tablist" aria-label="Статус уведомлений">${[['unread', 'Новые'], ['read', 'Прочитанные'], ['all', 'Все']].map(([key, label]) => `<button type="button" role="tab" aria-selected="${state.notificationStatus === key}" class="segment ${state.notificationStatus === key ? 'active' : ''}" data-notification-status="${key}">${label}${key === 'unread' && state.unreadCount ? ` (${state.unreadCount})` : ''}</button>`).join('')}</div><label>Период<select id="notification-period">${[['all', 'За всё время'], ['today', 'Сегодня'], ['week', 'Последние 7 дней'], ['older', 'Раньше этой недели']].map(([key, label]) => `<option value="${key}" ${state.notificationPeriod === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label></div><div class="notification-list" aria-live="polite" aria-busy="${state.notificationLoading}">${rows || (!state.notificationLoading && !state.notificationError ? emptyState(state.notificationStatus === 'unread' ? 'Новых уведомлений нет.' : 'За этот период уведомлений нет.') : '')}</div>${state.notificationLoading ? '<p class="notification-loading">Загрузка...</p>' : ''}${state.notificationError ? `<div class="notification-error" role="alert"><p>${escapeHTML(state.notificationError)}</p><button type="button" class="secondary" data-notification-retry>Повторить</button></div>` : ''}${state.notificationInbox?.nextCursor && !state.notificationLoading ? '<button type="button" class="secondary" data-notification-more>Загрузить ещё</button>' : ''}</section>`;
  $('[data-reminder-settings]').addEventListener('click',reminderSettingsUI.open);
  $('[data-notification-back]').addEventListener('click', () => { if ((history.state?.businessControlDepth || 0) > 0) history.back(); else navigateToView('dashboard'); });
  $$('[data-notification-status]').forEach((button) => button.addEventListener('click', () => { state.notificationStatus = button.dataset.notificationStatus; loadNotificationInbox(); }));
  $('#notification-period').addEventListener('change', (event) => { state.notificationPeriod = event.target.value; loadNotificationInbox(); });
  $('[data-notification-more]')?.addEventListener('click', () => loadNotificationInbox(true));
  $('[data-notification-retry]')?.addEventListener('click', () => loadNotificationInbox(Boolean(items.length)));
  $('#read-all').addEventListener('click', async (event) => {
    event.currentTarget.disabled = true;
    try { await api('/api/notifications/read-all', { method: 'POST' }); await loadNotificationInbox(); } catch (error) { toast(error.message, true); renderNotifications(); }
  });
  $$('[data-notification-read]').forEach((button) => button.addEventListener('click', async () => {
    const item = items.find((entry) => entry.id === button.dataset.notificationRead); button.disabled = true;
    try { await api(`/api/notifications/${item.id}/${item.readAt ? 'unread' : 'read'}`, { method: 'POST' }); await loadNotificationInbox(); } catch (error) { toast(error.message, true); button.disabled = false; }
  }));
  $$('[data-open-notification]').forEach((button) => button.addEventListener('click', async () => {
    const item = items.find((entry) => entry.id === button.dataset.openNotification); button.disabled = true;
    try {
      await api(`/api/notifications/${item.id}/read`, { method: 'POST' });
      if(item.entityType==='personal_plan'&&item.entityId){await openPersonalReminderSource(item.entityId);}
      else if(item.entityType==='personal_habit'&&item.entityId){await openHabitReminderSource(item.entityId);}
	  else if(item.entityType==='personal_digest'&&item.entityId?.startsWith('weekly:')){await navigateToView('personal',{personalTab:'review'});}
	  else if(item.entityType==='personal_digest'){await navigateToView('personal',{personalTab:'today'});}
      else if(item.entityType==='waiting_ping'&&item.workspaceId&&item.workspaceId!==state.activeWorkspaceId){await switchWorkspace(item.workspaceId,{keepView:true});}
      else if (item.entityId) {
        if (item.workspaceId && item.workspaceId !== state.activeWorkspaceId) await switchWorkspace(item.workspaceId, { keepView: true });
        await openRecord(item.entityId);
      }
      await loadNotificationInbox();
    } catch (error) { toast(error.message, true); button.disabled = false; }
  }));
  if (!state.notificationInbox && !state.notificationLoading && !state.notificationError) loadNotificationInbox();
}

async function loadNotificationInbox(append = false) {
  if (state.view === 'notifications') rememberView();
  const request = ++state.notificationRequest;
  const accountID = state.me?.id;
  const query = new URLSearchParams({ status: state.notificationStatus });
  if (append && state.notificationInbox?.nextCursor) query.set('cursor', state.notificationInbox.nextCursor);
  const boundary = new Date(); boundary.setHours(0, 0, 0, 0);
  if (state.notificationPeriod === 'week') boundary.setDate(boundary.getDate() - 6);
  if (state.notificationPeriod === 'older') boundary.setDate(boundary.getDate() - (boundary.getDay() + 6) % 7);
  if (state.notificationPeriod !== 'all') query.set(state.notificationPeriod === 'older' ? 'before' : 'since', boundary.toISOString());
  if (!append) state.notificationInbox = null;
  state.notificationLoading = true; state.notificationError = '';
  if (state.view === 'notifications') renderNotifications();
  try {
    const page = await api(`/api/notifications/inbox?${query}`);
    if (request !== state.notificationRequest || accountID !== state.me?.id) return;
    const previous = append ? state.notificationInbox?.items || [] : [];
    state.notificationInbox = { ...page, items: [...new Map([...previous, ...page.items].map((item) => [item.id, item])).values()] };
    state.unreadCount = page.unreadCount;
  } catch (error) { if (request === state.notificationRequest) state.notificationError = error.message; }
  finally {
    if (request === state.notificationRequest) {
      state.notificationLoading = false; renderNotificationBadge();
      if (state.view === 'notifications') renderNotifications();
    }
  }
}

// Help is explicit and contextual; initial actions live in the empty workspace.
function maybeShowOnboarding() {}
function openOnboarding() { return firstUseUI.open(); }
function finishOnboarding() { if ($('#onboarding-dialog').open) closeDialogImmediately($('#onboarding-dialog')); }

// Only view state goes into browser history, never record bodies or account data.
const routeFields = ['view', 'search', 'statusFilter', 'ownerFilter', 'personalTab', 'workScope', 'workType', 'workStatus', 'workstreamFilter', 'workOrder', 'workViewMode', 'ideaViewMode', 'workCalendarMonth', 'calendarMode', 'calendarYear', 'activeCollectionId', 'collectionSearch', 'collectionOwnerFilter', 'collectionFieldFilters', 'historyMode', 'historyScope', 'historyActor', 'historyType', 'notificationStatus', 'notificationPeriod', 'pageSearch'];
routeFields.push('workCollection', 'calendarScope', 'calendarDisplay', 'calendarMonth', 'calendarDay', 'calendarCollection', 'calendarOwner', 'calendarStatus', 'calendarColorBy');

function viewSnapshot() {
  return { ...Object.fromEntries(routeFields.map((key) => [key, structuredClone(state[key])])), workspaceId: state.activeWorkspaceId, scrollY: window.scrollY };
}

function initializeViewHistory() {
  if (state.viewHistoryInitialized) return;
  state.viewHistoryInitialized = true;
  const initialRoute=personalRoute(viewSnapshot(),state.workspaces);
  state.view=initialRoute.view;state.calendarScope=initialRoute.calendarScope;
  if (history.state?.businessControlAccount === state.me?.id && history.state?.businessControlView) {
    const route = personalRoute(history.state.businessControlView, state.workspaces);
    if (route.workspaceId === state.activeWorkspaceId) routeFields.forEach((key) => { if (Object.hasOwn(route, key)) state[key] = structuredClone(route[key]); });
    const entry = { ...history.state, businessControlView: route }; delete entry.businessControlOverlay;
    history.replaceState(entry, ''); history.scrollRestoration = 'manual';
    return;
  }
  history.replaceState({ businessControlAccount: state.me?.id, businessControlDepth: 0, businessControlView: viewSnapshot() }, '');
  history.scrollRestoration = 'manual';
}

function rememberView() {
  if (!state.me || history.state?.businessControlOverlay) return;
  history.replaceState({ ...history.state, businessControlAccount: state.me.id, businessControlView: viewSnapshot() }, '');
}

function pushViewHistory() {
  history.pushState({ businessControlAccount: state.me?.id, businessControlDepth: (history.state?.businessControlDepth || 0) + 1, businessControlView: { ...viewSnapshot(), scrollY: 0 } }, '');
}

async function restoreViewHistory(entry) {
  if (!entry?.businessControlView || entry.businessControlAccount !== state.me?.id) return;
  const request = state.viewRestoreRequest = (state.viewRestoreRequest || 0) + 1;
  const userID = state.me.id;
  const current = () => request === state.viewRestoreRequest && state.me?.id === userID;
  state.layoutDraft = null;
  const route = personalRoute(entry.businessControlView, state.workspaces);
  if (!route.workspaceId) { toast('Личное пространство недоступно.', true); return; }
  if (route.workspaceId !== state.activeWorkspaceId && !await switchWorkspace(route.workspaceId, { restoring: true })) { if (current()) rememberView(); return; }
  if (!current() || route.workspaceId !== state.activeWorkspaceId) return;
  routeFields.forEach((key) => { if (Object.hasOwn(route, key)) state[key] = structuredClone(route[key]); });
  if (route.workspaceId !== entry.businessControlView.workspaceId) rememberView();
  if (state.view === 'notifications') { state.notificationInbox = null; state.notificationError = ''; }
  render();
  requestAnimationFrame(() => { if (current()) window.scrollTo({ top: route.scrollY || 0, behavior: 'instant' }); });
}

function closeTransientPanels(target = null) {
  const selectors = '.workspace-switcher[open], .personal-create-menu[open], .work-filter-menu[open], .work-create-menu[open], .record-more-actions[open], .chat-header-more[open], .chat-composer-more[open], .chat-message-menu[open]';
  $$(selectors).forEach((panel) => { if (!target || !panel.contains(target)) panel.open = false; });
  closeCustomSelects(target?.closest('.custom-select') || null);
}

function closeTopTransientPanel() {
  const select = $('.custom-select.open');
  if (select) { closeCustomSelects(); $('.custom-select-trigger', select)?.focus({ preventScroll: true }); return true; }
  const emoji = $('.chat-emoji-picker');
  if (emoji) { chatEmojiPicker.close(); return true; }
  const panel = $$('.workspace-switcher[open], .personal-create-menu[open], .work-filter-menu[open], .work-create-menu[open], .record-more-actions[open], .chat-header-more[open], .chat-composer-more[open], .chat-message-menu[open]').pop();
  if (panel) { panel.open = false; $('summary', panel)?.focus({ preventScroll: true }); return true; }
  const create = $('#create-menu');
  if (create && !create.hidden) { create.hidden = true; $('#new-record-button')?.focus({ preventScroll: true }); return true; }
  return false;
}

function discardComposerChanges(dialog = $('#workspace-dialog')) {
  if (dialog.dataset.composerDirty === 'true' && !confirm('Выйти без сохранения настроек?')) return false;
  dialog.dataset.composerDirty = 'false';
  return true;
}

function bindComposerForm(form) {
  form.addEventListener('input', () => { $('#workspace-dialog').dataset.composerDirty = 'true'; });
  form.addEventListener('change', () => { $('#workspace-dialog').dataset.composerDirty = 'true'; });
}

function bindReorderList(list, rowSelector, onCommit) {
  if (!list) return;
  let drag = null;
  let busy = false;
  const listeners = [];
  const listen = (node, type, handler) => { node.addEventListener(type, handler); listeners.push(() => node.removeEventListener(type, handler)); };
  const rows = () => $$(rowSelector, list);
  const status = document.createElement('span');
  status.className = 'sr-only'; status.setAttribute('role', 'status'); list.append(status);
  const restore = (order, anchor) => order.forEach((row) => list.insertBefore(row, anchor));
  const commit = async (row, order, anchor) => {
    if (rows().every((item, index) => item === order[index])) return;
    busy = true;
    try {
      await onCommit();
      status.textContent = `Позиция ${rows().indexOf(row) + 1} из ${rows().length}`;
    } catch (error) { if (list.isConnected) restore(order, anchor); toast(error.message, true); }
    finally { busy = false; }
  };
  rows().forEach((row) => {
    const handle = $('[data-reorder-handle]', row);
    if (!handle) return;
    handle.setAttribute('aria-keyshortcuts', 'ArrowUp ArrowDown Home End');
    listen(handle, 'pointerdown', (event) => {
      if (busy || event.button !== 0 || event.isPrimary === false) return;
      event.preventDefault(); handle.focus({ preventScroll: true });
      const order = rows();
      drag = { row, handle, order, anchor: order.at(-1).nextSibling, id: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
      list.setPointerCapture(event.pointerId);
    });
    listen(handle, 'keydown', async (event) => {
      if (busy || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const order = rows(), index = order.indexOf(row), anchor = order.at(-1).nextSibling;
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? order.length - 1 : index + (event.key === 'ArrowUp' ? -1 : 1);
      if (!order[next] || next === index) return;
      if (next < index) order[next].before(row); else order[next].after(row);
      await commit(row, order, anchor);
      if (handle.isConnected) handle.focus({ preventScroll: true });
    });
  });
  listen(list, 'pointermove', (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return;
    drag.moved = true; drag.row.classList.add('reorder-dragging'); event.preventDefault();
    const target = rows().find((row) => { const box = row.getBoundingClientRect(); return row !== drag.row && event.clientY >= box.top && event.clientY <= box.bottom; });
    if (target) {
      const box = target.getBoundingClientRect();
      if (event.clientY < box.top + box.height / 2) target.before(drag.row); else target.after(drag.row);
    }
    const scroller = list.closest('dialog') || document.scrollingElement;
    const box = list.closest('dialog')?.getBoundingClientRect() || { top: 0, bottom: innerHeight };
    if (event.clientY < box.top + 60) scroller.scrollBy(0, -18);
    if (event.clientY > Math.min(box.bottom, innerHeight) - 60) scroller.scrollBy(0, 18);
  });
  const finish = async (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    const done = drag; drag = null;
    if (list.hasPointerCapture(event.pointerId)) list.releasePointerCapture(event.pointerId);
    done.row.classList.remove('reorder-dragging');
    if (event.type === 'pointercancel' || event.type === 'lostpointercapture') { restore(done.order, done.anchor); return; }
    if (done.moved) await commit(done.row, done.order, done.anchor);
  };
  listen(list, 'pointerup', finish);
  listen(list, 'pointercancel', finish);
  listen(list, 'lostpointercapture', finish);
  return () => { drag = null; listeners.splice(0).forEach((remove) => remove()); status.remove(); };
}

function interfacePresetShareURL(id) {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('interface-preset', id);
  return url.toString();
}

function maybeOpenPendingInterfacePreset() {
  if (!state.me || !state.pendingInterfacePresetId) return false;
  const id = state.pendingInterfacePresetId;
  state.pendingInterfacePresetId = '';
  const url = new URL(location.href);
  url.searchParams.delete('interface-preset');
  history.replaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  openInterfacePresetDetail(id, 'public');
  return true;
}

function interfacePresetSummaryText(summary) {
  return `Блоков главной: ${summary.dashboardWidgets} · Страниц: ${summary.customizedPages} · ${summary.density === 'compact' ? 'Компактно' : 'Обычно'}`;
}

function renderInterfacePresetComposition(summaries) {
  const pageNames = { ...Object.fromEntries(navItems.map(([key, label]) => [key, label])), notifications: 'Уведомления' };
  return `<details class="preset-composition"><summary>Состав набора</summary><div>${[['desktop', 'ПК'], ['mobile', 'Телефон']].map(([device, label]) => {
    const value = summaries[device];
    const hidden = [...(value.hiddenNavigation || []).map((key) => pageNames[key] || key), ...(value.hiddenGroups || []).map((group) => `Группа: ${group}`)];
    return `<section><h4>${label}</h4><dl><dt>Скрыто в меню</dt><dd>${escapeHTML(hidden.join(', ') || 'Ничего')}</dd><dt>Порядок главной</dt><dd>${escapeHTML((value.dashboardOrder || []).map((key) => widgetNames[key] || key).join(' → '))}</dd><dt>Отдельные раскладки страниц</dt><dd>${escapeHTML((value.pageKeys || []).map((key) => pageNames[key] || key).join(', ') || 'По умолчанию')}</dd>${device === 'desktop' ? `<dt>Ширина рабочей области</dt><dd>${value.contentWidth} px</dd>` : ''}</dl></section>`;
  }).join('')}</div></details>`;
}

function applyInterfacePresetProfiles(profiles) {
  Object.assign(state.interfaceProfiles, profiles);
  state.interfacePreferences = state.interfaceProfiles[interfaceDevice()];
  render();
}

async function undoInterfacePresetApplication(id, workspace) {
  if (state.activeWorkspaceId !== workspace) throw new Error('Для отмены вернитесь в исходный проект');
  const undone = await api(`/api/interface/preset-applications/${id}/undo`, { method: 'POST', body: '{}' });
  if (state.activeWorkspaceId !== workspace) return;
  applyInterfacePresetProfiles(undone.profiles);
  toast('Предыдущие настройки восстановлены');
}

function openPresetsFromLayout() {
  if (state.layoutDraft && JSON.stringify(state.layoutDraft) !== state.layoutBaseline && !confirm('Открыть наборы без сохранения текущей раскладки?')) return;
  if (!leavePageLayoutEditor()) return;
  state.layoutDraft = null;
  render();
  openInterfacePresetsDialog();
}

async function openInterfacePresetsDialog(scope = state.interfacePresetScope, query = '') {
  const dialog = $('#workspace-dialog');
  if (!discardComposerChanges(dialog)) return;
  state.interfacePresetScope = scope;
  const request = ++state.interfacePresetRequest;
  const content = $('#workspace-dialog-content');
  content.innerHTML = `<div class="workspace-dialog-loading" data-preset-loading="${request}"><span class="spinner"></span><strong>Загружаем наборы</strong></div>`;
  openModal(dialog);
  try {
    const [presets, latest] = await Promise.all([api(`/api/interface/presets?scope=${encodeURIComponent(scope)}&q=${encodeURIComponent(query)}`), api('/api/interface/preset-applications/latest')]);
    if (!dialog.open || !$(`[data-preset-loading="${request}"]`, content)) return;
    content.innerHTML = `<div class="workspace-editor-shell interface-presets-shell"><header><div><p class="eyebrow">Персонализация</p><h2>Наборы интерфейса</h2></div><button type="button" class="icon-button" data-close-presets aria-label="Закрыть">${icon('x')}</button></header><div class="preset-library-toolbar"><div class="segmented" role="tablist" aria-label="Наборы интерфейса">${[['mine', 'Мои'], ['public', 'Публичные']].map(([key, label]) => `<button type="button" class="segment ${scope === key ? 'active' : ''}" role="tab" aria-selected="${scope === key}" data-preset-scope="${key}">${label}</button>`).join('')}</div><button type="button" class="primary" data-new-preset>${icon('plus')} Сохранить текущий</button></div><form class="preset-search"><label>${icon('search')}<input type="search" name="query" value="${escapeHTML(query)}" placeholder="Найти набор" aria-label="Найти набор"></label><button type="submit" class="secondary">Найти</button></form><div class="preset-library-list">${presets.map((preset) => `<article class="preset-library-item"><div><h3>${escapeHTML(preset.name)}</h3>${preset.description ? `<p>${escapeHTML(preset.description)}</p>` : ''}<small>@${escapeHTML(preset.ownerUsername)} · ${preset.visibility === 'public' ? 'Публичный' : 'Только у вас'}${preset.useCount ? ` · Применений: ${preset.useCount}` : ''}</small><div class="preset-device-lines"><span><b>ПК</b> ${interfacePresetSummaryText(preset.summary.desktop)}</span><span><b>Телефон</b> ${interfacePresetSummaryText(preset.summary.mobile)}</span></div></div><button type="button" class="secondary" data-open-preset="${preset.id}">Посмотреть ${icon('chevronRight')}</button></article>`).join('') || `<div class="preset-library-empty"><h3>${query ? 'Наборы не найдены' : scope === 'mine' ? 'Сохранённых наборов пока нет' : 'Публичных наборов пока нет'}</h3></div>`}</div><footer class="composer-shortcuts"><button type="button" class="text-button" data-preset-menu>${icon('arrowLeft')} Меню и страницы</button></footer></div>`;
    $('[data-close-presets]', dialog).addEventListener('click', closeWorkspaceDialog);
    if (latest) {
      $('.preset-search', dialog).insertAdjacentHTML('afterend', `<div class="preset-last-application"><span><strong>${escapeHTML(latest.presetName)}</strong><small>Последнее применение · ${formatDate(latest.createdAt)}${latest.canUndo ? '' : ' · После него настройки менялись'}</small></span><button type="button" class="secondary" data-undo-preset ${latest.canUndo ? '' : 'disabled'}>${icon('undo')} Отменить</button></div>`);
      $('[data-undo-preset]', dialog).addEventListener('click', async (event) => {
        const button = event.currentTarget; button.disabled = true;
        try { await undoInterfacePresetApplication(latest.id, state.activeWorkspaceId); if (dialog.open && button.isConnected) await openInterfacePresetsDialog(scope, query); }
        catch (error) { button.disabled = false; toast(error.message, true); }
      });
    }
    $('[data-preset-menu]', dialog).addEventListener('click', () => openNavigationSettings());
    $('[data-new-preset]', dialog).addEventListener('click', () => openCreateInterfacePresetDialog());
    $$('[data-preset-scope]', dialog).forEach((button) => button.addEventListener('click', () => openInterfacePresetsDialog(button.dataset.presetScope)));
    $$('[data-open-preset]', dialog).forEach((button) => button.addEventListener('click', () => openInterfacePresetDetail(button.dataset.openPreset, scope)));
    $('.preset-search', dialog).addEventListener('submit', (event) => { event.preventDefault(); openInterfacePresetsDialog(scope, new FormData(event.currentTarget).get('query').trim()); });
  } catch (error) {
    if (!dialog.open || !$(`[data-preset-loading="${request}"]`, content)) return;
    content.innerHTML = `<div class="workspace-editor-shell interface-presets-shell"><header><div><h2>Наборы не загрузились</h2><p>${escapeHTML(error.message)}</p></div><button type="button" class="icon-button" data-close-presets aria-label="Закрыть">${icon('x')}</button></header><button type="button" class="secondary" data-retry-presets>Повторить</button></div>`;
    $('[data-close-presets]', dialog).addEventListener('click', closeWorkspaceDialog);
    $('[data-retry-presets]', dialog).addEventListener('click', () => openInterfacePresetsDialog(scope, query));
  }
}

function openCreateInterfacePresetDialog(preset = null, backScope = 'mine') {
  const dialog = $('#workspace-dialog');
  if (!discardComposerChanges(dialog)) return;
  $('#workspace-dialog-content').innerHTML = `<div class="workspace-editor-shell interface-presets-shell"><header><div><p class="eyebrow">${escapeHTML(activeWorkspace()?.name || 'Текущий проект')}</p><h2>${preset ? 'Изменить набор' : 'Сохранить набор'}</h2></div><button type="button" class="icon-button" data-close-presets aria-label="Закрыть">${icon('x')}</button></header><form id="interface-preset-form" class="card-form"><label>Название<input name="name" required maxlength="80" value="${escapeHTML(preset?.name || '')}" placeholder="Например: Подготовка к экзамену"></label><label>Описание<textarea name="description" rows="3" maxlength="500" placeholder="Для каких задач подходит набор">${escapeHTML(preset?.description || '')}</textarea></label><label class="check"><input type="checkbox" name="public" ${preset?.visibility === 'public' ? 'checked' : ''}><span>Опубликовать в общем каталоге</span></label><p class="preset-privacy-note">${preset ? 'Название, описание и публикация. Сохранённые раскладки не изменятся.' : 'Сохраняются раскладки ПК и телефона. Записи, доски, свои страницы, поля проекта и данные участников не публикуются.'}</p><div class="form-actions"><button type="submit" class="primary">${icon('check')} ${preset ? 'Сохранить изменения' : 'Сохранить набор'}</button><button type="button" class="secondary" data-preset-back>Назад</button></div></form></div>`;
  $('[data-close-presets]', dialog).addEventListener('click', closeWorkspaceDialog);
  $('[data-preset-back]', dialog).addEventListener('click', () => preset ? openInterfacePresetDetail(preset.id, backScope) : openInterfacePresetsDialog());
  const form = $('#interface-preset-form', dialog);
  bindComposerForm(form);
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const values = new FormData(form), button = $('button[type="submit"]', form);
    button.disabled = true;
    try {
      const saved = await api(preset ? `/api/interface/presets/${preset.id}` : '/api/interface/presets', { method: preset ? 'PATCH' : 'POST', body: JSON.stringify({ name: values.get('name'), description: values.get('description'), visibility: values.has('public') ? 'public' : 'private', ...(preset ? { expectedUpdatedAt: preset.updatedAt } : {}) }) });
      if (dialog.open && form.isConnected) {
        dialog.dataset.composerDirty = 'false';
        await openInterfacePresetDetail(saved.id, backScope);
      }
      toast('Набор сохранён');
    } catch (error) { button.disabled = false; toast(error.message, true); }
  });
  openModal(dialog);
  $('[name="name"]', form).focus();
}

async function openInterfacePresetDetail(id, backScope = state.interfacePresetScope) {
  const dialog = $('#workspace-dialog');
  if (!discardComposerChanges(dialog)) return;
  const request = ++state.interfacePresetRequest;
  const content = $('#workspace-dialog-content');
  content.innerHTML = `<div class="workspace-dialog-loading" data-preset-loading="${request}"><span class="spinner"></span><strong>Сравниваем настройки</strong></div>`;
  openModal(dialog);
  try {
    const preset = await api(`/api/interface/presets/${encodeURIComponent(id)}`);
    if (!dialog.open || !$(`[data-preset-loading="${request}"]`, content)) return;
    content.innerHTML = `<div class="workspace-editor-shell interface-presets-shell"><header><div><p class="eyebrow">Набор · @${escapeHTML(preset.ownerUsername)}</p><h2>${escapeHTML(preset.name)}</h2>${preset.description ? `<p>${escapeHTML(preset.description)}</p>` : ''}</div><button type="button" class="icon-button" data-close-presets aria-label="Закрыть">${icon('x')}</button></header><section class="preset-preview"><h3>Применить для себя в «${escapeHTML(activeWorkspace()?.name || 'Текущий проект')}»</h3><div class="preset-preview-devices">${[['desktop', 'ПК'], ['mobile', 'Телефон']].map(([device, label]) => { const summary = preset.summary[device]; return `<label class="preset-device-choice"><input type="checkbox" name="presetDevice" value="${device}" checked><span><strong>${label}</strong><small>${summary.changed ? 'Настройки изменятся' : 'Настройки уже совпадают'}</small><span>${interfacePresetSummaryText(summary)}</span><span>Скрыто пунктов меню: ${summary.hiddenMenuItems} · Действий в панели: ${summary.visibleToolbarItems}</span></span></label>`; }).join('')}</div><p class="preset-privacy-note">Раскладки выбранных устройств будут заменены. Карточки и доступы не изменятся. Сразу после применения можно вернуть прежние настройки.</p><div class="form-actions"><button type="button" class="primary" data-apply-preset>${icon('check')} Применить набор</button><button type="button" class="secondary" data-preset-back>Назад</button></div></section>${preset.visibility === 'public' ? `<div class="preset-share-row"><button type="button" class="secondary" data-copy-preset>${icon('link')} Скопировать ссылку</button><span>Публичный набор</span></div>` : ''}${preset.mine ? `<details class="preset-management"><summary>Управление набором</summary><div><button type="button" class="secondary" data-toggle-preset-public>${icon(preset.visibility === 'public' ? 'lock' : 'users')} ${preset.visibility === 'public' ? 'Снять с публикации' : 'Опубликовать'}</button><button type="button" class="secondary" data-refresh-preset>${icon('rotate')} Обновить текущими настройками</button><button type="button" class="text-button danger-text" data-delete-preset>${icon('trash')} Удалить набор</button></div></details>` : ''}</div>`;
    $('[data-close-presets]', dialog).addEventListener('click', closeWorkspaceDialog);
    $('[data-preset-back]', dialog).addEventListener('click', () => openInterfacePresetsDialog(backScope));
    $('.preset-preview-devices', dialog).insertAdjacentHTML('afterend', renderInterfacePresetComposition(preset.summary));
    if (preset.mine) {
      $('.preset-management > div', dialog).insertAdjacentHTML('afterbegin', `<button type="button" class="secondary" data-edit-preset>${icon('edit')} Название и описание</button>`);
      $('[data-edit-preset]', dialog).addEventListener('click', () => openCreateInterfacePresetDialog(preset, backScope));
    }
    $('[data-copy-preset]', dialog)?.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(interfacePresetShareURL(preset.id)); toast('Ссылка скопирована'); } catch { toast('Браузер не разрешил копирование ссылки', true); }
    });
    $('[data-apply-preset]', dialog).addEventListener('click', async (event) => {
      const devices = $$('[name="presetDevice"]:checked', dialog).map((input) => input.value);
      if (!devices.length) { toast('Выберите хотя бы одно устройство'); return; }
      const button = event.currentTarget, workspace = state.activeWorkspaceId;
      button.disabled = true;
      try {
        const applied = await api(`/api/interface/presets/${preset.id}/apply`, { method: 'POST', body: JSON.stringify({ devices }) });
        if (workspace !== state.activeWorkspaceId) return;
        if (dialog.open && button.isConnected) closeWorkspaceDialog();
        applyInterfacePresetProfiles(applied.profiles);
        toastAction('Набор применён', 'Отменить', () => undoInterfacePresetApplication(applied.applicationId, workspace));
      } catch (error) { button.disabled = false; toast(error.message, true); }
    });
    const updatePreset = async (changes, button) => {
      button.disabled = true;
      try { await api(`/api/interface/presets/${preset.id}`, { method: 'PATCH', body: JSON.stringify({ ...changes, expectedUpdatedAt: preset.updatedAt }) }); if (dialog.open && button.isConnected) await openInterfacePresetDetail(preset.id, backScope); }
      catch (error) { button.disabled = false; toast(error.message, true); }
    };
    $('[data-toggle-preset-public]', dialog)?.addEventListener('click', (event) => updatePreset({ visibility: preset.visibility === 'public' ? 'private' : 'public' }, event.currentTarget));
    $('[data-refresh-preset]', dialog)?.addEventListener('click', (event) => { if (confirm('Заменить содержимое набора текущими сохранёнными настройками ПК и телефона?')) updatePreset({ refreshFromCurrent: true }, event.currentTarget); });
    $('[data-delete-preset]', dialog)?.addEventListener('click', async (event) => {
      if (!confirm('Удалить этот набор? Уже применённые настройки других людей сохранятся.')) return;
      const button = event.currentTarget; button.disabled = true;
      try { await api(`/api/interface/presets/${preset.id}`, { method: 'DELETE' }); if (dialog.open && button.isConnected) await openInterfacePresetsDialog('mine'); toast('Набор удалён'); }
      catch (error) { button.disabled = false; toast(error.message, true); }
    });
  } catch (error) {
    if (!dialog.open || !$(`[data-preset-loading="${request}"]`, content)) return;
    content.innerHTML = `<div class="workspace-editor-shell interface-presets-shell"><header><div><h2>Набор недоступен</h2><p>${escapeHTML(error.message)}</p></div><button type="button" class="icon-button" data-close-presets aria-label="Закрыть">${icon('x')}</button></header><button type="button" class="secondary" data-preset-back>${icon('arrowLeft')} К наборам</button></div>`;
    $('[data-close-presets]', dialog).addEventListener('click', closeWorkspaceDialog);
    $('[data-preset-back]', dialog).addEventListener('click', () => openInterfacePresetsDialog(backScope));
  }
}

function openNavigationSettings(tab = 'menu', device = interfaceDevice()) {
  const dialog = $('#workspace-dialog');
  if (!discardComposerChanges(dialog)) return;
  const admin = canConfigureWorkspace();
  const preferences = state.interfaceProfiles[device] || state.interfacePreferences;
  const items = navigationCatalog(preferences);
  const hidden = new Set(preferences.hiddenNavItems || []);
  const hiddenGroups = new Set(preferences.hiddenNavGroups || []);
  const tabs = [['menu', 'Моё меню'], ['modules', 'Разделы проекта'], ['pages', 'Свои страницы']];
  let body = '';
  if (tab === 'menu') body = `${deviceSelector(device)}<form id="navigation-personal-form"><div class="composer-rows">${items.map((item) => `<div class="composer-menu-row" data-menu-key="${escapeHTML(item.key)}"><button type="button" class="drag-handle" data-reorder-handle aria-label="Переместить: ${escapeHTML(item.label)}" title="Переместить">${icon('grip')}</button><label class="check"><input type="checkbox" name="visibleItem" value="${escapeHTML(item.key)}" ${!hidden.has(item.key) && !hiddenGroups.has(item.group) ? 'checked' : ''}><span>${escapeHTML(item.label)}</span></label></div>`).join('')}</div><div class="form-actions"><button type="submit" class="primary">${icon('check')} Сохранить меню ${device === 'mobile' ? 'телефона' : 'ПК'}</button><button type="button" class="secondary" data-reset-nav>По умолчанию</button></div></form>`;
  if (tab === 'modules') body = `<form id="project-modules-form"><div class="composer-module-grid">${navItems.filter(([key]) => key !== 'personal').map(([key, label, iconName]) => `<label class="check module-option"><input type="checkbox" name="module" value="${key}" ${state.projectNavigation.enabledViews.includes(key) ? 'checked' : ''} ${admin ? '' : 'disabled'}><span>${icon(iconName)} ${escapeHTML(label)}</span></label>`).join('')}</div>${admin ? '<div class="form-actions"><button type="submit" class="primary">Сохранить разделы проекта</button></div>' : '<p class="composer-access-note">Состав разделов настраивает администратор проекта.</p>'}</form>`;
  if (tab === 'pages') body = `${admin ? `<button type="button" class="primary" data-new-page>${icon('plus')} Создать страницу</button>` : ''}<div class="composer-page-list">${state.workspacePages.map((page) => `<article><div><strong>${escapeHTML(page.name)}</strong><small>${page.archived ? 'В архиве' : page.collectionId ? escapeHTML(state.collections.find((collection) => collection.id === page.collectionId)?.name || 'Доска недоступна') : 'Карточки проекта'} · ${page.viewMode === 'board' ? 'Доска' : 'Список'}</small></div>${admin ? `<button type="button" class="icon-button" data-configure-page="${page.id}" aria-label="Настроить страницу ${escapeHTML(page.name)}" title="Настроить">${icon('edit')}</button><button type="button" class="icon-button" data-archive-page="${page.id}" aria-label="${page.archived ? 'Восстановить' : 'Архивировать'} страницу ${escapeHTML(page.name)}" title="${page.archived ? 'Восстановить' : 'Архивировать'}">${icon(page.archived ? 'rotate' : 'archive')}</button>` : ''}</article>`).join('') || '<p class="composer-access-note">Своих страниц пока нет.</p>'}</div>`;
  $('#workspace-dialog-content').innerHTML = `<div class="workspace-editor-shell navigation-settings-shell"><header><div><p class="eyebrow">${escapeHTML(activeWorkspace()?.name || 'Проект')}</p><h2>Меню и страницы</h2><p>${tab === 'menu' ? 'Ваше меню, только для вас' : 'Общие настройки этого проекта'}</p></div><button type="button" class="icon-button" data-close-composer aria-label="Закрыть">${icon('x')}</button></header><div class="segmented composer-tabs" role="tablist" aria-label="Настройка меню">${tabs.map(([key, label]) => `<button type="button" class="segment ${key === tab ? 'active' : ''}" role="tab" aria-selected="${key === tab}" data-composer-tab="${key}">${label}</button>`).join('')}</div>${body}<footer class="composer-shortcuts"><button type="button" class="text-button" data-composer-layout>${icon('sliders')} Настроить страницу</button><button type="button" class="text-button" data-composer-templates>${icon('settings')} Содержимое карточек</button></footer></div>`;
  $('[data-close-composer]', dialog).addEventListener('click', closeWorkspaceDialog);
  $$('[data-composer-tab]', dialog).forEach((button) => button.addEventListener('click', () => openNavigationSettings(button.dataset.composerTab, device)));
  $$('[data-interface-device]', dialog).forEach((button) => button.addEventListener('click', () => openNavigationSettings('menu', button.dataset.interfaceDevice)));
  const leaveFor = (view, after) => {
    if (!discardComposerChanges(dialog)) return;
    state.afterOverlayClose = async () => { if (await navigateToView(view)) after?.(); };
    closeWorkspaceDialog();
  };
  $('[data-composer-layout]', dialog).addEventListener('click', () => leaveFor(state.view, () => startPageLayoutEditor(device)));
  $('[data-composer-templates]', dialog).addEventListener('click', () => leaveFor('structure'));
  $('.composer-shortcuts', dialog).insertAdjacentHTML('beforeend', `<button type="button" class="text-button" data-composer-presets>${icon('copy')} Наборы интерфейса</button>`);
  $('[data-composer-presets]', dialog).addEventListener('click', openPresetsFromLayout);
  const personalForm = $('#navigation-personal-form', dialog);
  if (personalForm) {
    bindComposerForm(personalForm);
    bindReorderList($('.composer-rows', personalForm), '[data-menu-key]', () => { dialog.dataset.composerDirty = 'true'; });
    personalForm.addEventListener('submit', async (event) => {
      event.preventDefault(); const button = $('button[type="submit"]', personalForm); button.disabled = true;
      const visible = new Set(new FormData(personalForm).getAll('visibleItem'));
      const next = { ...preferences, device, hiddenNavGroups: [], hiddenNavItems: [...(preferences.hiddenNavItems || []).filter((key) => !items.some((item) => item.key === key)), ...items.filter((item) => !visible.has(item.key)).map((item) => item.key)], navOrder: $$('[data-menu-key]', personalForm).map((row) => row.dataset.menuKey) };
      try { await saveInterfacePreferences(next); dialog.dataset.composerDirty = 'false'; closeWorkspaceDialog(); renderNav(); toast('Ваше меню сохранено'); } catch (error) { button.disabled = false; toast(error.message, true); }
    });
    $('[data-reset-nav]', personalForm).addEventListener('click', async () => {
      try { await saveInterfacePreferences({ ...preferences, device, hiddenNavGroups: [], collapsedNavGroups: [], hiddenNavItems: [], navOrder: [] }); dialog.dataset.composerDirty = 'false'; openNavigationSettings('menu', device); renderNav(); } catch (error) { toast(error.message, true); }
    });
  }
  const modulesForm = $('#project-modules-form', dialog);
  if (modulesForm) {
    bindComposerForm(modulesForm);
    modulesForm.addEventListener('submit', async (event) => {
      event.preventDefault(); const button = $('button[type="submit"]', modulesForm); button.disabled = true;
      try {
        state.projectNavigation = await api('/api/workspace/navigation', { method: 'PUT', body: JSON.stringify({ enabledViews: new FormData(modulesForm).getAll('module') }) });
        dialog.dataset.composerDirty = 'false'; closeWorkspaceDialog(); renderNav(); renderContent(); toast('Разделы проекта сохранены');
      } catch (error) { button.disabled = false; toast(error.message, true); }
    });
  }
  $('[data-new-page]', dialog)?.addEventListener('click', () => openWorkspacePageEditor());
  $$('[data-configure-page]', dialog).forEach((button) => button.addEventListener('click', () => openWorkspacePageEditor(state.workspacePages.find((page) => page.id === button.dataset.configurePage))));
  $$('[data-archive-page]', dialog).forEach((button) => button.addEventListener('click', async () => {
    const page = state.workspacePages.find((item) => item.id === button.dataset.archivePage);
    if (!page.archived && !confirm(`Архивировать страницу «${page.name}»? Карточки и данные сохранятся.`)) return;
    button.disabled = true;
    try { await api(`/api/workspace/pages/${page.id}`, { method: 'PATCH', body: JSON.stringify({ ...page, archived: !page.archived }) }); state.workspacePages = await api('/api/workspace/pages?includeArchived=true'); renderNav(); if (state.view === `page:${page.id}`) renderContent(); openNavigationSettings('pages'); } catch (error) { button.disabled = false; toast(error.message, true); }
  }));
  openModal(dialog);
}

function openWorkspacePageEditor(page = null) {
  const dialog = $('#workspace-dialog');
  if (!discardComposerChanges(dialog)) return;
  const value = page || { name: '', collectionId: '', recordType: '', statusFilter: 'active', ownerFilter: 'all', viewMode: 'list', fields: ['description', 'owner', 'status', 'due'] };
  $('#workspace-dialog-content').innerHTML = `<div class="workspace-editor-shell navigation-settings-shell"><header><div><p class="eyebrow">${escapeHTML(activeWorkspace()?.name || 'Проект')}</p><h2>${page ? 'Настройка страницы' : 'Новая страница'}</h2></div><button type="button" class="icon-button" data-page-editor-close aria-label="Закрыть">${icon('x')}</button></header><form id="workspace-page-form" class="card-form"><label>Название в меню<input name="name" value="${escapeHTML(value.name)}" required maxlength="80" placeholder="Например: Мои задачи"></label><div class="composer-field-grid"><label>Источник<select name="collectionId"><option value="">Все карточки проекта</option>${state.collections.map((collection) => `<option value="${collection.id}" ${value.collectionId === collection.id ? 'selected' : ''}>${escapeHTML(collection.name)}</option>`).join('')}</select></label><label>Состояние<select name="statusFilter">${[['active','В работе'],['completed','Завершённые'],['all','Все, кроме архива']].map(([key,label]) => `<option value="${key}" ${value.statusFilter === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><label>Ответственный<select name="ownerFilter"><option value="all">Все участники проекта</option><option value="me" ${value.ownerFilter === 'me' ? 'selected' : ''}>Назначено мне</option></select></label><label>Вид<select name="viewMode"><option value="list">Список</option><option value="board" ${value.viewMode === 'board' ? 'selected' : ''}>Доска по этапам</option></select></label></div><fieldset class="composer-fields page-type-picker"><legend>Типы карточек</legend><label class="check"><input type="checkbox" name="allTypes" ${workspacePageTypes(value).length ? '' : 'checked'}><span>Все типы</span></label><div data-page-types>${Object.entries(typeMeta).map(([key, meta]) => `<label class="check"><input type="checkbox" name="recordTypes" value="${key}" ${workspacePageTypes(value).includes(key) ? 'checked' : ''}><span>${icon(meta.icon)} ${escapeHTML(meta.label)}</span></label>`).join('')}</div></fieldset><output class="page-source-preview" data-page-preview aria-live="polite"></output><fieldset class="composer-fields"><legend>Отображаемые поля</legend><div data-page-fields></div></fieldset><div class="form-actions"><button type="submit" class="primary">${icon('check')} ${page ? 'Сохранить страницу' : 'Создать страницу'}</button><button type="button" class="secondary" data-page-editor-back>Назад</button></div></form></div>`;
  const form = $('#workspace-page-form', dialog);
  void firstUseUI.tip('constructor',form);
  let fields = new Set(value.fields);
  const syncFields = () => {
    const collection = state.collections.find((item) => item.id === form.elements.collectionId.value);
    const choices = [['description','Описание'],['owner','Ответственный'],['status','Состояние'],['due','Срок'], ...(collection?.fields || []).map((field) => [`field:${field.id}`,field.name])];
    $('[data-page-fields]', form).innerHTML = choices.map(([key,label]) => `<label class="check"><input type="checkbox" name="field" value="${key}" ${fields.has(key) ? 'checked' : ''}><span>${escapeHTML(label)}</span></label>`).join('');
    form.elements.viewMode.disabled = !collection;
    if (!collection) form.elements.viewMode.value = 'list';
    syncCustomSelect(form.elements.viewMode);
  };
  enhanceSelects(form); syncFields(); bindComposerForm(form);
  const syncTypes = () => {
    const all = form.elements.allTypes.checked;
    $$('[name="recordTypes"]', form).forEach((input) => { input.disabled = all; });
    const selected = all ? [] : new FormData(form).getAll('recordTypes');
    const preview = workspacePageRecords({ ...value, collectionId: form.elements.collectionId.value, recordTypes: selected, ownerFilter: form.elements.ownerFilter.value, statusFilter: form.elements.statusFilter.value }, '');
    const summary = all ? 'Все типы' : selected.map((key) => typeMeta[key].label).join(' + ');
    $('[data-page-preview]', form).textContent = summary ? summary + ' · ' + recordsCountLabel(preview.length) : 'Выберите хотя бы один тип';
    form.elements.allTypes.setCustomValidity(!all && !selected.length ? 'Выберите типы карточек или «Все типы»' : '');
  };
  form.addEventListener('change', syncTypes); syncTypes();
  form.elements.collectionId.addEventListener('change', () => { fields = new Set(new FormData(form).getAll('field')); syncFields(); });
  $('[data-page-editor-close]', dialog).addEventListener('click', closeWorkspaceDialog);
  $('[data-page-editor-back]', dialog).addEventListener('click', () => openNavigationSettings('pages'));
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); const button = $('button[type="submit"]',form); button.disabled=true;
    const data = new FormData(form); const payload = { ...value, name:data.get('name'),collectionId:data.get('collectionId'),recordType:'',recordTypes:data.has('allTypes') ? [] : data.getAll('recordTypes'),statusFilter:data.get('statusFilter'),ownerFilter:data.get('ownerFilter'),viewMode:data.get('viewMode') || 'list',fields:data.getAll('field') };
    try {
      const saved = await api(`/api/workspace/pages${page ? `/${page.id}` : ''}`, { method: page ? 'PATCH' : 'POST', body: JSON.stringify(payload) });
      page = saved;
      state.workspacePages = await api('/api/workspace/pages?includeArchived=true'); dialog.dataset.composerDirty='false';
      state.afterOverlayClose = () => navigateToView(`page:${saved.id}`);
      closeWorkspaceDialog(); renderNav(); toast('Страница сохранена');
    } catch(error) { button.disabled=false; toast(error.message,true); }
  });
  openModal(dialog);
}

function workspacePageTypes(page) {
  return Array.isArray(page?.recordTypes) ? page.recordTypes : page?.recordType ? [page.recordType] : [];
}

function workspacePageRecords(page, search = state.pageSearch) {
  if (!page || page.archived) return [];
  const query = (search || '').trim().toLowerCase();
  const types = workspacePageTypes(page);
  return state.records.filter((record) => record.status !== 'archived' && (!page.collectionId || record.collectionId === page.collectionId) && (!types.length || types.includes(record.type)) && (page.ownerFilter !== 'me' || record.ownerId === state.me.id) && (page.statusFilter === 'all' || (page.statusFilter === 'active' ? isActiveRecord(record) : record.status === 'completed' || (isWorkRecord(record) && Number(record.progress) >= 100 && !['review', 'cancelled', 'rejected'].includes(record.status)))) && (!query || `${record.title} ${markdownPlain(record.description)}`.toLowerCase().includes(query)));
}

function renderWorkspacePage() {
  const page = state.workspacePages.find((item) => `page:${item.id}` === state.view && !item.archived);
  if (!page) { $('#main-content').innerHTML='<div class="guided-empty"><h2>Страница недоступна</h2><button type="button" class="secondary" data-page-library>Мои страницы</button></div>'; $('[data-page-library]').addEventListener('click',()=>openNavigationSettings('pages')); return; }
  const records = workspacePageRecords(page);
  const collection = state.collections.find((item) => item.id === page.collectionId);
  const selectedTypes = workspacePageTypes(page);
  const createTypes = selectedTypes.length ? selectedTypes : collection ? [collection.defaultRecordType] : Object.keys(typeMeta).filter(projectAllowsType);
  const labels = {description:'Описание',owner:'Ответственный',status:'Состояние',due:'Срок'};
  const fieldValue = (record,key) => key === 'owner' ? record.ownerUsername : key === 'status' ? statusLabel(record) : key === 'due' ? (record.dueAt ? formatDate(record.dueAt) : '') : collection?.fields.find((field)=>`field:${field.id}`===key) ? collectionFieldDisplay(collection.fields.find((field)=>`field:${field.id}`===key),record.customFields?.[key.slice(6)]) : '';
  const list = `<section class="custom-page-list">${records.map((record)=>`<button type="button" class="custom-page-row" data-open-record="${record.id}"><span class="custom-page-title"><small class="custom-page-kind">${icon(typeMeta[record.type]?.icon || 'fileText')}${escapeHTML(typeMeta[record.type]?.singular || record.type)}</small><strong>${escapeHTML(record.title)}</strong>${page.fields.includes('description') && record.description ? `<span>${escapeHTML(markdownPlain(record.description))}</span>`:''}</span><span class="custom-page-fields">${page.fields.filter((key)=>key!=='description').map((key)=>`<span data-page-field="${escapeHTML(key)}"><small>${escapeHTML(labels[key] || collection?.fields.find((field)=>`field:${field.id}`===key)?.name || '')}</small><b>${escapeHTML(fieldValue(record,key) || '—')}</b></span>`).join('')}</span>${icon('chevronRight')}</button>`).join('') || '<p class="composer-access-note">Карточек по этим условиям нет.</p>'}</section>`;
  const board = collection ? `<section class="collection-board">${collection.stages.map((stage)=>{const items=records.filter((record)=>record.stageId===stage.id || (!record.stageId && stage.id===collection.stages[0]?.id));return `<section class="collection-column tone-${stage.colorKey}" data-collection-drop="${stage.id}"><header><div><i></i><strong>${escapeHTML(stage.name)}</strong></div><span>${items.length}</span></header><div>${items.map((record)=>renderCollectionCard(record,collection,page.fields)).join('') || '<p class="collection-column-empty">Нет карточек</p>'}</div></section>`;}).join('')}</section>` : list;
  $('#main-content').innerHTML=`<div class="page-heading"><div><p class="eyebrow">${escapeHTML(activeWorkspace()?.name || 'Проект')}</p><h1>${escapeHTML(page.name)}</h1><p>${recordsCountLabel(records.length)}</p></div><div class="custom-page-actions">${createTypes.length > 1 ? `<label class="page-create-type"><span class="sr-only">Тип новой карточки</span><select data-page-create-type aria-label="Тип новой карточки">${createTypes.map((key) => `<option value="${key}" ${state.pageCreateTypes?.[page.id] === key ? 'selected' : ''}>${escapeHTML(typeMeta[key]?.singular || key)}</option>`).join('')}</select></label>` : ''}<button type="button" class="primary" data-page-create>${icon('plus')} Добавить</button>${canConfigureWorkspace()?`<button type="button" class="secondary" data-page-configure>${icon('sliders')} Источник и поля</button>`:''}</div></div><label class="custom-page-search">${icon('search')}<input type="search" value="${escapeHTML(state.pageSearch)}" placeholder="Найти на странице" aria-label="Найти на странице"></label>${page.viewMode==='board'?board:list}`;
  $('[data-page-configure]')?.addEventListener('click',()=>openWorkspacePageEditor(page));
  enhanceSelects($('.custom-page-actions'));
  $('[data-page-create-type]')?.addEventListener('change', (event) => {
    state.pageCreateTypes ||= {};
    state.pageCreateTypes[page.id] = event.currentTarget.value;
  });
  $('[data-page-create]').addEventListener('click', () => {
    const recordType = $('[data-page-create-type]')?.value || createTypes[0] || 'task';
    if (collection) openCollectionCardDialog(collection, null, '', { recordType });
    else openCreateDialog(recordType);
  });
  $('.custom-page-search input').addEventListener('input',(event)=>{state.pageSearch=event.currentTarget.value;renderWorkspacePage(); const input=$('.custom-page-search input');input.focus();});
  if (page.viewMode==='board' && collection) bindCollectionBoard(collection,renderWorkspacePage); else bindOpenRecords();
}

const widgetNames = { focus: 'Следующая работа', capture: 'Быстрая фиксация', capacity: 'Недельная загрузка', quality: 'Качество базы' };
const toolbarNames = { help: 'Помощь', notifications: 'Уведомления', create: 'Создание' };
const toolbarSelectors = { help: '#onboarding-button', notifications: '#notification-button', create: '.create-control' };

function interfaceLayout(preferences = state.layoutDraft || (state.pageLayoutDraft ? state.interfaceProfiles[state.pageLayoutDraft.device] : state.interfacePreferences)) {
  const value = preferences?.layout || {};
  return { contentWidth: 1500, sidebarWidth: 238, sidebarSide: 'left', density: 'comfortable', ...value,
    widgetSpans: { focus: 8, capture: 4, capacity: 6, quality: 6, ...value.widgetSpans },
    toolbarActions: value.toolbarActions || ['help', 'notifications', 'create'],
    quickActions: value.quickActions || ['inbox', 'idea', 'task', 'question_set'] };
}

function applyInterfaceLayout() {
  const base = interfaceLayout();
  const page = currentPageLayout();
  const layout = state.layoutDraft ? base : { ...base, contentWidth: page.contentWidth || base.contentWidth, density: page.density || base.density, toolbarActions: page.toolbarActions || base.toolbarActions };
  const root = $('#app-root');
  root.style.setProperty('--content-width', `${layout.contentWidth}px`);
  root.style.setProperty('--sidebar-width', `${layout.sidebarWidth}px`);
  root.dataset.sidebarSide = layout.sidebarSide;
  root.dataset.density = layout.density;
  root.dataset.layoutDevice = state.pageLayoutDraft?.device || state.layoutDraft?.device || interfaceDevice();
  Object.entries(toolbarSelectors).forEach(([key, selector]) => {
    const button = $(selector); const index = layout.toolbarActions.indexOf(key);
    button.hidden = index < 0; button.style.order = index + 1;
  });
  const actions = $('.topbar-actions');
  const ordered = [$('#interface-settings-button'), ...layout.toolbarActions.map((key) => $(toolbarSelectors[key])), ...Object.keys(toolbarSelectors).filter((key) => !layout.toolbarActions.includes(key)).map((key) => $(toolbarSelectors[key]))];
  if (ordered.some((button, index) => actions.children[index] !== button)) ordered.forEach((button) => actions.append(button));
}

function renderLayoutFields(layout, device = state.layoutDraft?.device || interfaceDevice()) {
  const ordered = [...layout.toolbarActions, ...Object.keys(toolbarNames).filter((key) => !layout.toolbarActions.includes(key))];
  const desktopFields = device === 'desktop' ? `<label>Ширина рабочей области <output data-width-output>${layout.contentWidth} px</output><input type="range" name="contentWidth" min="900" max="2200" step="50" value="${layout.contentWidth}"></label><label>Ширина меню <output data-sidebar-output>${layout.sidebarWidth} px</output><input type="range" name="sidebarWidth" min="196" max="340" step="2" value="${layout.sidebarWidth}"></label><label>Расположение меню<select name="sidebarSide"><option value="left" ${layout.sidebarSide === 'left' ? 'selected' : ''}>Слева</option><option value="right" ${layout.sidebarSide === 'right' ? 'selected' : ''}>Справа</option></select></label>` : '';
  return `<details class="layout-options"><summary>${device === 'mobile' ? 'Плотность и кнопки' : 'Размеры, меню и кнопки'}</summary><div class="layout-options-grid">${desktopFields}<label>Плотность<select name="density"><option value="comfortable" ${layout.density === 'comfortable' ? 'selected' : ''}>Обычная</option><option value="compact" ${layout.density === 'compact' ? 'selected' : ''}>Компактная</option></select></label><fieldset><legend>Кнопки верхней панели</legend><div class="layout-action-order">${ordered.map((key) => `<div data-toolbar-action="${key}"><button type="button" class="drag-handle" data-reorder-handle title="Переместить" aria-label="Переместить: ${toolbarNames[key]}">${icon('grip')}</button><label class="check"><input type="checkbox" name="toolbarAction" value="${key}" ${layout.toolbarActions.includes(key) ? 'checked' : ''}><span>${toolbarNames[key]}</span></label></div>`).join('')}</div></fieldset><fieldset><legend>Быстрая фиксация</legend><div class="layout-quick-options">${['inbox', 'idea', 'task', 'question_set', 'research', 'decision', 'document', 'goal'].map((key) => `<label class="check"><input type="checkbox" name="quickAction" value="${key}" ${layout.quickActions.includes(key) ? 'checked' : ''}><span>${escapeHTML(typeMeta[key]?.singular || 'Входящее')}</span></label>`).join('')}</div></fieldset></div></details>`;
}

function readLayoutFields(root, layout) {
  return { ...layout, contentWidth: Number($('[name="contentWidth"]', root)?.value || layout.contentWidth), sidebarWidth: Number($('[name="sidebarWidth"]', root)?.value || layout.sidebarWidth), sidebarSide: $('[name="sidebarSide"]', root)?.value || layout.sidebarSide, density: $('[name="density"]', root).value,
    toolbarActions: $$('[data-toolbar-action]', root).filter((row) => $('input', row).checked).map((row) => row.dataset.toolbarAction),
    quickActions: $$('[name="quickAction"]:checked', root).map((input) => input.value) };
}

function bindLayoutFields(root, onChange = () => {}) {
  const changed = () => {
    if ($('[data-width-output]', root)) $('[data-width-output]', root).textContent = `${$('[name="contentWidth"]', root).value} px`;
    if ($('[data-sidebar-output]', root)) $('[data-sidebar-output]', root).textContent = `${$('[name="sidebarWidth"]', root).value} px`;
    onChange();
  };
  $$('.layout-options input', root).forEach((input) => input.addEventListener('input', changed));
  $$('.layout-options select', root).forEach((input) => input.addEventListener('change', changed));
  bindReorderList($('.layout-action-order', root), '[data-toolbar-action]', changed);
}

function startLayoutEditor(device = interfaceDevice()) {
  if (!leavePageLayoutEditor()) return;
  rememberView();
  state.layoutHistoryEntry = structuredClone(history.state);
  state.layoutDraft = structuredClone(state.interfaceProfiles[device] || state.interfacePreferences);
  state.layoutDraft.device = device;
  state.layoutDraft.layout = interfaceLayout(state.layoutDraft);
  state.layoutBaseline = JSON.stringify(state.layoutDraft);
  applyInterfaceLayout();
  renderDashboard();
}

function renderLayoutEditorHeader() {
  const missing = Object.keys(widgetNames).filter((key) => !state.layoutDraft.dashboardWidgets.includes(key));
  return `<section class="layout-editor-header"><div class="layout-editor-actions"><h2>Настройка главной</h2><button type="button" class="primary" data-layout-save>${icon('check')} Сохранить</button><button type="button" class="secondary" data-layout-cancel>Отмена</button><button type="button" class="icon-button" data-layout-reset title="Раскладка по умолчанию" aria-label="Раскладка по умолчанию">${icon('rotate')}</button></div>${deviceSelector(state.layoutDraft.device)}${renderLayoutFields(interfaceLayout())}${missing.length ? `<div class="layout-add-blocks">${missing.map((key) => `<button type="button" class="secondary" data-layout-add="${key}">${icon('plus')} ${widgetNames[key]}</button>`).join('')}</div>` : ''}<span class="sr-only" role="status" id="layout-move-status"></span></section>`;
}

function renderWidgetControls(key) {
  const span = interfaceLayout().widgetSpans[key];
  const desktop = (state.layoutDraft?.device || interfaceDevice()) === 'desktop';
  return `<div class="widget-edit-tools"><button type="button" class="icon-button widget-move-handle" data-widget-drag="${key}" title="Переместить блок" aria-label="Переместить: ${widgetNames[key]}" aria-keyshortcuts="ArrowUp ArrowDown">${icon('grip')}</button>${desktop ? `<label>Ширина<select data-widget-span="${key}">${[[4, '1/3'], [6, '1/2'], [8, '2/3'], [12, 'Вся']].map(([value, label]) => `<option value="${value}" ${span === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}<button type="button" class="icon-button" data-layout-hide="${key}" title="Скрыть блок" aria-label="Скрыть: ${widgetNames[key]}">${icon('x')}</button></div>${desktop ? `<button type="button" class="widget-resize-handle" data-widget-resize="${key}" title="Изменить ширину" aria-label="Изменить ширину: ${widgetNames[key]}">${icon('chevronRight')}</button>` : ''}`;
}

function moveLayoutWidget(key, target, after = false) {
  const order = state.layoutDraft.dashboardWidgets.filter((item) => item !== key);
  const index = order.indexOf(target);
  if (index < 0) return;
  order.splice(index + Number(after), 0, key);
  state.layoutDraft.dashboardWidgets = order;
  renderDashboard();
  $(`[data-widget-drag="${key}"]`)?.focus({ preventScroll: true });
  $('#layout-move-status').textContent = `${widgetNames[key]}: позиция ${order.indexOf(key) + 1}`;
}

function bindLayoutEditor() {
  const header = $('.layout-editor-header');
  $('.layout-editor-actions', header).insertAdjacentHTML('beforeend', `<button type="button" class="secondary" data-layout-presets>${icon('copy')} Наборы</button>`);
  $('[data-layout-presets]', header).addEventListener('click', openPresetsFromLayout);
  $$('[data-interface-device]', header).forEach((button) => button.addEventListener('click', () => {
    if (button.dataset.interfaceDevice === state.layoutDraft.device) return;
    if (JSON.stringify(state.layoutDraft) !== state.layoutBaseline && !confirm('Сменить устройство без сохранения раскладки?')) return;
    startLayoutEditor(button.dataset.interfaceDevice); applyInterfaceLayout();
  }));
  bindLayoutFields(header, () => {
    state.layoutDraft.layout = readLayoutFields(header, interfaceLayout()); applyInterfaceLayout();
    const actions = $('.dashboard-widget-capture .quick-actions');
    if (actions) {
      actions.innerHTML = interfaceLayout().quickActions.filter(projectAllowsType).map((key) => `<button type="button" class="quick-action" data-quick-create="${key}"><span class="quick-icon">${icon(typeMeta[key]?.icon || 'inbox')}</span><span><strong>${escapeHTML(typeMeta[key]?.singular || 'Входящее')}</strong></span>${icon('chevronRight')}</button>`).join('');
      $$('[data-quick-create]', actions).forEach((button) => button.addEventListener('click', () => openCreateDialog(button.dataset.quickCreate)));
    }
  });
  $('[data-layout-cancel]').addEventListener('click', () => { state.layoutDraft = null; render(); });
  $('[data-layout-reset]').addEventListener('click', () => { state.layoutDraft = { ...state.layoutDraft, dashboardWidgets: Object.keys(widgetNames), layout: { ...interfaceLayout({}), pages: state.layoutDraft.layout.pages } }; render(); });
  $('[data-layout-save]').addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    const workspaceID = state.activeWorkspaceId; const draft = state.layoutDraft;
    state.layoutDraft.layout = readLayoutFields(header, interfaceLayout());
    try {
      await saveInterfacePreferences(draft);
      if (workspaceID !== state.activeWorkspaceId || draft !== state.layoutDraft) return;
      state.layoutDraft = null; render(); toast('Раскладка сохранена');
    } catch (error) { toast(error.message, true); button.disabled = false; }
  });
  $$('[data-layout-add]').forEach((button) => button.addEventListener('click', () => { state.layoutDraft.dashboardWidgets.push(button.dataset.layoutAdd); renderDashboard(); }));
  $$('[data-layout-hide]').forEach((button) => button.addEventListener('click', () => {
    if (state.layoutDraft.dashboardWidgets.length === 1) { toast('Оставьте хотя бы один блок'); return; }
    state.layoutDraft.dashboardWidgets = state.layoutDraft.dashboardWidgets.filter((key) => key !== button.dataset.layoutHide); renderDashboard();
  }));
  $$('[data-widget-span]').forEach((select) => select.addEventListener('change', () => { state.layoutDraft.layout.widgetSpans[select.dataset.widgetSpan] = Number(select.value); select.closest('[data-layout-widget]').style.setProperty('--widget-span', select.value); }));
  $$('[data-widget-drag]').forEach((button) => button.addEventListener('keydown', (event) => {
    if (!['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    event.preventDefault();
    const key = button.dataset.widgetDrag; const delta = event.key === 'ArrowUp' ? -1 : 1; const order = state.layoutDraft.dashboardWidgets;
    const target = order[order.indexOf(key) + delta]; if (target) moveLayoutWidget(key, target, delta > 0);
  }));
  $$('[data-widget-drag], [data-widget-resize]').forEach((handle) => {
    let drag = null;
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return;
      const key = handle.dataset.widgetDrag || handle.dataset.widgetResize;
      drag = { key, pointer: event.pointerId, x: event.clientX, y: event.clientY, span: interfaceLayout().widgetSpans[key], target: '', after: false };
      handle.setPointerCapture(event.pointerId); handle.closest('[data-layout-widget]').classList.add('layout-dragging');
    });
    handle.addEventListener('pointermove', (event) => {
      if (!drag || drag.pointer !== event.pointerId) return;
      if (handle.hasAttribute('data-widget-resize')) {
        const columns = $('.dashboard-custom-grid').getBoundingClientRect().width / 12;
        const requested = drag.span + (event.clientX - drag.x) / columns;
        const span = [4, 6, 8, 12].reduce((best, item) => Math.abs(item - requested) < Math.abs(best - requested) ? item : best, 4);
        state.layoutDraft.layout.widgetSpans[drag.key] = span;
        handle.closest('[data-layout-widget]').style.setProperty('--widget-span', span);
        return;
      }
      const target = $$('[data-layout-widget]').find((block) => { const box = block.getBoundingClientRect(); return block.dataset.layoutWidget !== drag.key && event.clientX >= box.left && event.clientX <= box.right && event.clientY >= box.top && event.clientY <= box.bottom; });
      $$('[data-layout-widget]').forEach((block) => block.classList.toggle('layout-drop-target', block === target));
      drag.target = target?.dataset.layoutWidget || '';
      if (target) { const box = target.getBoundingClientRect(); drag.after = event.clientY > box.top + box.height / 2; }
      if (event.clientY > innerHeight - 70) window.scrollBy(0, 18);
      if (event.clientY < 100) window.scrollBy(0, -18);
    });
    const finish = (event) => {
      if (!drag || drag.pointer !== event.pointerId) return;
      const done = drag; drag = null;
      $$('[data-layout-widget]').forEach((block) => block.classList.remove('layout-dragging', 'layout-drop-target'));
      if (event.type === 'pointercancel') { state.layoutDraft.layout.widgetSpans[done.key] = done.span; renderDashboard(); return; }
      if (done.target) moveLayoutWidget(done.key, done.target, done.after);
      else if (handle.hasAttribute('data-widget-resize')) renderDashboard();
    };
    handle.addEventListener('pointerup', finish); handle.addEventListener('pointercancel', finish);
  });
}

function pageLayoutKey() {
  if (state.view === 'day' || state.view === 'calendar') return `${state.view}:${state.calendarScope === 'personal' ? 'personal' : 'project'}`;
  return state.view === 'collections' && state.activeCollectionId ? `collection:${state.activeCollectionId}` : state.view;
}

function currentPageLayout() {
  if (state.layoutDraft) return {};
  const draft = state.pageLayoutDraft;
  if (draft?.key === pageLayoutKey()) return draft.value;
  return savedPageLayout(state.interfacePreferences);
}

function savedPageLayout(profile) {
  const saved = profile?.layout?.pages?.[pageLayoutKey()];
  if (state.view === 'work') return defaultWorkBoardLayout(saved);
  if (saved) return saved;
  if (state.view === 'calendar') return profile?.layout?.pages?.calendar || {};
  if (state.view === 'dashboard') {
    const keys = ['focus', 'capture', 'capacity', 'quality'];
    const visible = profile?.dashboardWidgets || keys;
    return { order: ['heading', ...visible], hiddenBlocks: keys.filter(key => !visible.includes(key)), blockSpans: profile?.layout?.widgetSpans || {} };
  }
  return {};
}

function defaultWorkBoardLayout(saved = {}) {
  // Preserve an explicit column selection, including the choice to show all.
  const systemColumns = ['inbox', 'queued', 'in_progress', 'blocked', 'review', 'completed', 'postponed', 'cancelled'].map(key => `column:${key}`);
  if (saved.workBoardColumnsConfigured || saved.hiddenFields?.some(key => systemColumns.includes(key))) return saved;
  return { ...saved, hiddenFields: [...(saved.hiddenFields || []), 'column:inbox', 'column:blocked', 'column:review'] };
}

function pageLayoutCatalog() {
  const block = (key, label, selector, required = false, span = 12) => ({ key, label, selector, required, span });
  const field = (key, label, selector) => ({ key, label, selector });
  const tableFields = [
    field('description', 'Описание', '.record-table:not(.work-row) .record-title > span > small, .work-row .record-title > span > em, .kanban-card > button > p'),
    field('owner', 'Ответственный', '.record-table > span:nth-child(2), .idea-kanban-card > button > span > small'),
    field('status', 'Состояние и приоритет', '.record-table > span:nth-child(3), .kanban-card .priority'),
    field('due', 'Дата и прогресс', '.record-table > span:nth-child(4), .kanban-card .deadline'),
  ];
  const heading = block('heading', 'Заголовок и создание', ':scope > .page-heading, :scope > .personal-heading, :scope > .entity-list-heading, :scope > .work-title-row, :scope > .history-title');
  const list = block('records', 'Карточки', ':scope > .table-panel, :scope > .work-kanban, :scope > .work-calendar, :scope > .idea-stage-board, :scope > .collection-board', true);
  // All work views share one layout key, including boards with custom stages.
  const workRecords = { ...list, label: state.workViewMode === 'kanban' ? 'Доска' : state.workViewMode === 'calendar' ? 'Календарь' : 'Карточки' };
  const catalog = {
    dashboard: [block('heading', 'Заголовок', '.dashboard-config-row'), ...[['focus','Следующая работа',8],['capture','Быстрая фиксация',4],['capacity','Недельная загрузка',6],['quality','Качество базы',6]].map(([key,label,span]) => block(key,label,`.dashboard-widget-${key}`,false,span))],
    day: [block('heading','Дата и действия','.day-workspace-heading',true), block('records','Планы и карточки','.day-workspace-records',true,6), block('notes','Заметки дня','.day-workspace-notes',false,6)],
    calendar: [heading, block('filters', 'Вид и фильтры', '.planner-controls', true), block('month', 'Календарь и расписание', '.planner-body', true), block('undated', 'Без даты', '.planner-undated')],
    work: [heading, block('filters', 'Поиск и фильтры', ':scope > .work-controls', true), block('summary', 'Сводка и представления', ':scope > .work-view-summary'), block('boards', 'Доска и её настройки', '.work-board-toolbar'), workRecords],
    personal: [heading, block('first-use','Первый шаг','.first-use-start'), block('summary', 'Личная сводка', '.personal-summary'), block('tabs', 'Разделы', '.personal-tabs', true), block('day-focus','Главное дело','.today-focus',false,6), block('day-time','События и свободное время','.today-schedule',false,6), block('day-attention','Требует внимания','.today-attention',false,6), block('day-waiting','Ожидания','.today-waiting',false,6), block('day-reminders','Личные напоминания','.today-reminders',false,6), block('habits', 'Привычки', '.personal-today-grid .personal-section:has(> .habit-list)', false, 6), block('plans', 'Дела на сегодня', '.today-plans', false, 6), block('day-project-work','Моя работа в проектах','.today-project-work',false,6), block('life', 'Карта времени', '.personal-today-grid .life-section', false, 6), block('notes', 'Последние заметки', '.personal-today-grid .personal-section:has(> .personal-notes-preview)', false, 6)],
    collections: [heading, block('search', 'Доски и поиск', '.collection-toolbar', true), block('filters', 'Фильтры', '.collection-filters', true), block('records', 'Доска', ':scope > .collection-board, :scope > .collection-empty', true)],
    principles: [heading, ...[['preference', 'Критерии'], ['limitation', 'Ограничения'], ['rule', 'Правила']].map(([key, label]) => block(key, label, `.principle-column:has([data-create-principle="${key}"])`, false, 4))],
    validation: [heading, block('summary', 'Сводка проверок', '.validation-summary'), block('filters', 'Фильтры', '.validation-filter', true), block('records', 'Риски и проверки', '.validation-list', true)],
    outcomes: [heading, block('filters', 'Фильтры результатов', '.outcome-filter', true), block('records', 'Решения и выводы', '.outcome-list', true)],
    quality: [heading, block('summary', 'Сводка качества', '.quality-summary'), block('filters', 'Фильтры', '.quality-filters', true), block('records', 'Результаты проверки', '.quality-list', true)],
    history: [heading, block('filters', 'Фильтры истории', '.history-controls', true), block('records', 'События', '.history-feed', true)],
    notifications: [block('heading', 'Возврат и действия', '.notification-heading', true), block('filters', 'Статус и период', '.notification-filters', true), block('records', 'Уведомления', '.notification-list', true)],
    chat: [block('digest', 'AI-выжимка', '.chat-digest')],
    graph: [block('legend', 'Обозначения карты', '.graph-legend')],
    structure: [heading, block('hidden', 'Скрытые блоки шаблона', '.hidden-template-blocks')],
  };
  let blocks = catalog[state.view] || [heading, block('filters', 'Поиск и фильтры', '.entity-list-controls', true), list];
  let fields = typeMeta[state.view] || state.view === 'work' ? tableFields : [];
  if (state.view === 'chat') fields = [field('voice', 'Запись голосового', '[data-chat-voice]'), field('ai', 'AI-выжимка в меню', '[data-chat-ai-digest]')];
  if (state.view === 'graph') fields = [field('count', 'Количество объектов', '.graph-count'), field('zoom', 'Кнопки масштаба', '#graph-zoom-in, #graph-zoom-out')];
  if (state.view === 'personal' && state.personalTab && state.personalTab !== 'today') blocks = [heading, block('summary', 'Личная сводка', '.personal-summary'), block('tabs','Разделы','.personal-tabs',true), block('records','Записи','.personal-content',true)];
  if (state.view === 'personal') fields = [field('noteDates', 'Дата заметки', '.personal-note footer time'), field('notePreview', 'Текст в списке заметок', '.personal-note .markdown-body')];
  const customPage = state.workspacePages.find((item) => `page:${item.id}` === state.view);
  const collection = state.view === 'collections' ? activeCollection() : state.view === 'work' ? state.collections.find(item => item.id === state.workCollection) : customPage ? state.collections.find((item) => item.id === customPage.collectionId) : null;
  if (customPage) blocks = [heading, block('filters', 'Поиск', '.custom-page-search', true), block('records', 'Карточки', '.custom-page-list, :scope > .collection-board', true)];
  if (collection || customPage) fields = [
    field('description', 'Описание', '.collection-card > button > p, .custom-page-title > span'),
    field('owner', 'Ответственный', '.collection-card footer .avatar, .collection-card footer strong, [data-page-field="owner"]'),
    field('due', 'Срок', '.collection-card footer small, [data-page-field="due"]'),
    field('status', 'Состояние', '[data-page-field="status"]'),
    ...(collection?.fields || []).map((item) => field(`field:${item.id}`, item.name, `[data-page-field="field:${CSS.escape(item.id)}"]`)),
  ].filter((item) => !customPage || customPage.fields.includes(item.key));
  if (collection && !customPage) fields = fields.filter((item) => item.key !== 'status');
  if (state.view === 'work' && state.workViewMode === 'kanban' && !collection) fields = [...fields,
    ...[['inbox','Разобрать'],['queued','Не начато'],['in_progress','В работе'],['blocked','Заблокировано'],['review','На проверке'],['completed','Завершено'],['postponed','Отложено'],['cancelled','Отменено']].map(([key,label]) => field(`column:${key}`, `Колонка: ${label}`, `[data-kanban-status="${key}"]`)),
  ];
  if (collection && !customPage) fields = [...fields, ...collection.stages.map(stage => field(`column:${stage.id}`, `Колонка: ${stage.name}`, `[data-collection-drop="${CSS.escape(stage.id)}"]`))];
  return { blocks, fields };
}

function pageLayoutDirty() {
  const draft = state.pageLayoutDraft;
  return Boolean(draft && JSON.stringify(draft.value) !== draft.baseline);
}

function leavePageLayoutEditor() {
  if (state.pageLayoutSaving) { toast('Дождитесь сохранения настроек'); return false; }
  if (pageLayoutDirty() && !confirm('Выйти без сохранения настройки страницы?')) return false;
  state.pageLayoutDraft = null;
  return true;
}

function startPageLayoutEditor(device = interfaceDevice()) {
  if (!leavePageLayoutEditor()) return;
  $('.page-layout-editor')?.remove();
  $$('.page-block-tools').forEach((node) => node.remove());
  $$('[data-page-block]').forEach((node) => node.parentElement.pageReorderCleanup?.());
  const key = pageLayoutKey();
  const value = structuredClone(savedPageLayout(state.interfaceProfiles[device]));
  for (const widget of value.widgets || []) {
    try {
      const zoom = Number(localStorage.getItem(widgetScaleKey(widget, device)));
      if (zoom) value.blockSettings = {...value.blockSettings, [widget]: {...value.blockSettings?.[widget], scale: Math.max(40, Math.min(100, zoom))}};
    } catch (_) {}
  }
  state.pageLayoutDraft = { key, device, value, baseline: JSON.stringify(value) };
  rememberView(); state.layoutHistoryEntry = structuredClone(history.state);
  applyInterfaceLayout(); applyPageLayout();
  $('.page-layout-editor')?.scrollIntoView({ block: 'start', behavior: 'instant' });
}

function renderPageLayoutEditor(catalog) {
  const draft = state.pageLayoutDraft, value = draft.value;
  const title = $('#page-title').textContent;
  const desktop = draft.device === 'desktop';
  return `<section class="page-layout-editor"><header><h2>Настроить: ${escapeHTML(title)}</h2><div><button type="button" class="primary" data-page-layout-save>${icon('check')} Сохранить</button><button type="button" class="secondary" data-page-layout-cancel>Отмена</button><button type="button" class="icon-button" data-page-layout-reset title="Сбросить только эту страницу" aria-label="Сбросить только эту страницу">${icon('rotate')}</button></div></header>${deviceSelector(draft.device)}<details class="page-layout-options"><summary>Размеры, поля и действия</summary><div class="page-layout-options-grid"><label>Плотность<select name="pageDensity"><option value="">Как во всём интерфейсе</option><option value="comfortable" ${value.density === 'comfortable' ? 'selected' : ''}>Обычная</option><option value="compact" ${value.density === 'compact' ? 'selected' : ''}>Компактная</option></select></label>${desktop && !['chat', 'graph'].includes(state.view) ? `<label>Ширина страницы<select name="pageWidth">${[[0,'Как во всём интерфейсе'],[1000,'Узкая'],[1500,'Обычная'],[2200,'Широкая']].map(([n,label]) => `<option value="${n}" ${Number(value.contentWidth || 0) === n ? 'selected' : ''}>${label}</option>`).join('')}</select></label>` : ''}${catalog.fields.length ? `<fieldset><legend>Поля и элементы</legend>${catalog.fields.map((field) => `<label class="check"><input type="checkbox" data-page-field-toggle="${escapeHTML(field.key)}" ${value.hiddenFields?.includes(field.key) ? '' : 'checked'}><span>${escapeHTML(field.label)}</span></label>`).join('')}</fieldset>` : ''}<fieldset><legend>Верхняя панель</legend><label class="check"><input type="checkbox" data-page-toolbar-inherit ${value.toolbarActions ? '' : 'checked'}><span>Как во всём интерфейсе</span></label><div class="page-toolbar-order">${[...(value.toolbarActions || interfaceLayout().toolbarActions), ...Object.keys(toolbarNames).filter((key) => !(value.toolbarActions || interfaceLayout().toolbarActions).includes(key))].map((key) => `<div data-page-toolbar="${key}"><button type="button" class="drag-handle" data-reorder-handle ${value.toolbarActions ? '' : 'disabled'} title="Переместить" aria-label="Переместить: ${toolbarNames[key]}">${icon('grip')}</button><label class="check"><input type="checkbox" ${(value.toolbarActions || interfaceLayout().toolbarActions).includes(key) ? 'checked' : ''} ${value.toolbarActions ? '' : 'disabled'}><span>${toolbarNames[key]}</span></label></div>`).join('')}</div></fieldset></div></details><div class="page-layout-restore">${catalog.blocks.filter((block) => !block.required && value.hiddenBlocks?.includes(block.key)).map((block) => `<button type="button" class="secondary" data-page-block-restore="${block.key}">${icon('plus')} ${escapeHTML(block.label)}</button>`).join('')}</div></section>`;
}

function bindPageLayoutEditor(editor, catalog) {
  const draft = state.pageLayoutDraft;
  $('header > div', editor).insertAdjacentHTML('beforeend', `<button type="button" class="secondary" data-layout-presets>${icon('copy')} Наборы</button>`);
  $('[data-layout-presets]', editor).addEventListener('click', openPresetsFromLayout);
  if (pageWidgetsSupported()) {
    $('header > div', editor).insertAdjacentHTML('afterbegin', `<button type="button" class="secondary" data-page-widget-library>${icon('plus')} Добавить блок</button>`);
    $('[data-page-widget-library]', editor).addEventListener('click', openWidgetLibrary);
  }
  const refresh = () => { editor.remove(); applyInterfaceLayout(); applyPageLayout(); };
  $('[data-page-layout-cancel]', editor).addEventListener('click', () => { state.pageLayoutDraft = null; editor.remove(); applyInterfaceLayout(); applyPageLayout(); });
  $('[data-page-layout-reset]', editor).addEventListener('click', () => { draft.value = state.view === 'work' ? defaultWorkBoardLayout() : {}; refresh(); });
  $$('[data-interface-device]', editor).forEach((button) => button.addEventListener('click', () => { if (button.dataset.interfaceDevice !== draft.device) startPageLayoutEditor(button.dataset.interfaceDevice); }));
  $('[name="pageDensity"]', editor).addEventListener('change', (event) => { draft.value.density = event.target.value; applyInterfaceLayout(); });
  $('[name="pageWidth"]', editor)?.addEventListener('change', (event) => { draft.value.contentWidth = Number(event.target.value); applyInterfaceLayout(); });
  $$('[data-page-field-toggle]', editor).forEach((input) => input.addEventListener('change', () => { draft.value.hiddenFields = $$('[data-page-field-toggle]', editor).filter((item) => !item.checked).map((item) => item.dataset.pageFieldToggle); if (state.view === 'work' && !state.workCollection && input.dataset.pageFieldToggle.startsWith('column:')) draft.value.workBoardColumnsConfigured = true; applyPageLayout(); }));
  const toolbar = $('.page-toolbar-order', editor);
  const updateToolbar = () => { draft.value.toolbarActions = $$('[data-page-toolbar]', toolbar).filter((row) => $('input', row).checked).map((row) => row.dataset.pageToolbar); applyInterfaceLayout(); };
  $('[data-page-toolbar-inherit]', editor).addEventListener('change', (event) => { if (event.target.checked) delete draft.value.toolbarActions; else draft.value.toolbarActions = [...interfaceLayout().toolbarActions]; refresh(); });
  $$('input', toolbar).forEach((input) => input.addEventListener('change', updateToolbar));
  bindReorderList(toolbar, '[data-page-toolbar]', () => { if (draft.value.toolbarActions) updateToolbar(); });
  $$('[data-page-block-restore]', editor).forEach((button) => button.addEventListener('click', () => { draft.value.hiddenBlocks = (draft.value.hiddenBlocks || []).filter((key) => key !== button.dataset.pageBlockRestore); refresh(); }));
  $('[data-page-layout-save]', editor).addEventListener('click', async () => {
    if (state.pageLayoutSaving) return;
    state.pageLayoutSaving = true;
    $('#main-content').inert = true;
    const workspace = state.activeWorkspaceId;
    $$('button, input, select', editor).forEach((item) => { item.disabled = true; });
    try {
      const preferences = structuredClone(state.interfaceProfiles[draft.device]);
      preferences.layout.pages = { ...preferences.layout.pages, [draft.key]: structuredClone(draft.value) };
      await saveInterfacePreferences(preferences);
      if (workspace !== state.activeWorkspaceId || state.pageLayoutDraft !== draft) return;
      for (const widget of workspaceWidgetCatalog()) { try { localStorage.removeItem(widgetScaleKey(widget.key, draft.device)); } catch (_) {} }
      state.pageLayoutDraft = null; editor.remove(); applyInterfaceLayout(); applyPageLayout(); toast('Настройка страницы сохранена');
    } catch (error) { toast(error.message, true); refresh(); }
    finally { state.pageLayoutSaving = false; $('#main-content').inert = false; }
  });
}

function applyPageLayout() {
  const root = $('#main-content');
  if (!state.me || !root || state.layoutDraft || $('.reorder-dragging, .page-block-resizing', root)) return;
  if (state.pageLayoutDraft && state.pageLayoutDraft.key !== pageLayoutKey()) { state.pageLayoutDraft = null; $('.page-layout-editor', root)?.remove(); }
  applyInterfaceLayout();
  const draft = state.pageLayoutDraft, editing = Boolean(draft), value = currentPageLayout(), catalog = pageLayoutCatalog();
  const progressiveToday = state.view === 'personal' && state.personalTab === 'today' && useProgressiveToday(value, editing);
  const emptyTodayBlocks = progressiveToday && state.personal ? personalTodayUI.hiddenBlocks(state.personal, personalWaitingUI.hasContent(), personalRemindersUI.hasContent()) : [];
  if (state.view === 'personal' && state.personalTab !== 'today' && useProgressiveToday(value, editing)) emptyTodayBlocks.push('summary');
  mountWorkspaceWidgets(root, catalog, value);
  const items = catalog.blocks.map(block => ({ block, node: $(`[data-page-block="${block.key}"]`,root) || $(block.selector,root) })).filter(item => item.node);
  items.forEach(({block,node}) => { node.dataset.pageBlock = block.key; });
  // Move existing nodes, preserving editors, focus and event handlers. No copies of records are made.
  if (pageWidgetsSupported() && items.length) {
    let grid = $(':scope > .workspace-page-grid',root);
    if (!grid) { grid = document.createElement('section'); grid.className = 'workspace-page-grid page-block-grid'; root.append(grid); }
    items.forEach(({node}) => { if (node.parentElement !== grid) grid.append(node); });
    for (const selector of ['.personal-column','.personal-today-grid','.personal-content','.dashboard-custom-grid','.principle-grid']) {
      $$(selector,root).filter(node => !node.dataset.pageBlock && !node.children.length).forEach(node => node.remove());
    }
  }
  root.classList.toggle('page-layout-editing',editing);
  root.classList.toggle('page-mobile-preview',editing && draft.device === 'mobile');
  if (!editing) {
    $$('[data-page-block]',root).forEach(node => { node.parentElement.pageReorderCleanup?.(); node.parentElement.pageReorderCleanup = null; node.parentElement.pageReorderDraft = null; });
    $$('.page-block-tools, [data-block-resize]',root).forEach(node => node.remove());
    $('.page-layout-editor',root)?.remove();
  } else if (!$('.page-layout-editor',root)) {
    root.insertAdjacentHTML('afterbegin',renderPageLayoutEditor(catalog));
    bindPageLayoutEditor($('.page-layout-editor',root),catalog);
  }
  const order = [...new Set([...(value.order||[]),...catalog.blocks.map(block=>block.key)])], groups = new Map();
  items.forEach(item => {
    const {node,block}=item;
    node.classList.toggle('page-block-hidden',!block.required && (value.hiddenBlocks||[]).includes(block.key));
    node.classList.toggle('today-empty-block', emptyTodayBlocks.includes(block.key));
    if(!groups.has(node.parentElement))groups.set(node.parentElement,[]);
    groups.get(node.parentElement).push(item);
    applyBlockGeometry(node,block,value);
  });
  groups.forEach((group,parent)=> {
    const sorted=group.slice().sort((a,b)=>order.indexOf(a.block.key)-order.indexOf(b.block.key));
    const nodes=new Set(group.map(item=>item.node)),current=[...parent.children].filter(node=>nodes.has(node));
    sorted.forEach(({node},index)=>{if(current[index]===node)return;parent.insertBefore(node,current[index]);current.splice(current.indexOf(node),1);current.splice(index,0,node);});
    let toolsChanged=false;
    group.forEach(({block,node})=> {
      if (editing && node.pageToolsValue !== value) { $$('.page-block-tools, [data-block-resize]',node).forEach(tool=>tool.remove()); node.pageToolsValue=value; }
      if(!editing || $('.page-block-tools',node))return;
      toolsChanged=true;
      node.insertAdjacentHTML('beforeend',`<div class="page-block-tools"><button type="button" class="drag-handle" data-reorder-handle aria-label="Переместить: ${escapeHTML(block.label)}" title="Переместить">${icon('grip')}</button><strong>${escapeHTML(block.label)}</strong><button type="button" class="icon-button" data-page-block-settings title="Настройки блока" aria-label="Настройки: ${escapeHTML(block.label)}">${icon('sliders')}</button>${!block.required?`<button type="button" class="icon-button" data-page-block-hide title="Скрыть блок" aria-label="Скрыть: ${escapeHTML(block.label)}">${icon('minus')}</button>`:''}</div>${parent.classList.contains('page-block-grid')?`<button type="button" class="block-resize-handle" data-block-resize aria-label="Изменить размер: ${escapeHTML(block.label)}" title="Изменить размер" aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown">${icon('maximize')}</button>`:''}`);
      $('[data-page-block-hide]',node)?.addEventListener('click',()=>{ if(state.pageLayoutSaving)return;value.hiddenBlocks=[...new Set([...(value.hiddenBlocks||[]),block.key])];$('.page-layout-editor',root)?.remove();applyPageLayout(); });
      $('[data-page-block-settings]',node).addEventListener('click',()=>openBlockSettings(block));
      bindBlockResize(node,block);
    });
    const signature=group.map(item=>item.block.key).join(',');
    if(editing && (parent.pageReorderDraft!==draft || parent.pageReorderKeys!==signature || toolsChanged)) {
      parent.pageReorderCleanup?.();parent.pageReorderDraft=draft;parent.pageReorderKeys=signature;
      parent.pageReorderCleanup=bindReorderList(parent,':scope > [data-page-block]:not(.page-block-hidden)',()=> {
        if(state.pageLayoutSaving)return;
        const keys=[...parent.children].filter(node=>nodes.has(node)).map(node=>node.dataset.pageBlock);
        value.order=[...(value.order||[]).filter(key=>!keys.includes(key)),...keys];
      });
    }
  });
  catalog.fields.forEach(field=>$$(field.selector,root).forEach(node=>node.classList.toggle('page-field-hidden',value.hiddenFields?.includes(field.key)||false)));
  $$('.work-kanban[data-work-scroll="board"]', root).forEach(board => board.classList.toggle('work-kanban-five', $$(':scope > .kanban-column:not(.page-field-hidden)', board).length === 5));
  if(state.view==='work'||typeMeta[state.view]) {
    const columns=['minmax(180px, 2.2fr)',...['owner','status','due'].filter(key=>!value.hiddenFields?.includes(key)).map(()=>'minmax(100px, 1fr)')];
    $$('.record-table',root).forEach(row=>row.style.setProperty('--page-table-columns',columns.join(' ')));
  }
}

function calendarColors() {
  return [['green', 'Зелёный'], ['blue', 'Синий'], ['amber', 'Жёлтый'], ['purple', 'Фиолетовый'], ['red', 'Красный'], ['neutral', 'Серый']];
}

function personalPlanDateFields(plan) {
  const mode = plan.startDate ? 'days' : plan.startsAt ? 'block' : plan.dueAt ? 'time' : 'none';
  return `<div class="plan-date-fields"><label>Когда<select name="dateMode">${[['none', 'Без даты'], ['days', 'День или период'], ['time', 'Срок'], ['block', 'Временной блок']].map(([key, label]) => `<option value="${key}" ${mode === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label><div class="form-grid two" data-plan-dates="days"><label>Начало<input type="date" name="startDate" value="${escapeHTML(plan.startDate || '')}"></label><label>Окончание<input type="date" name="endDate" value="${escapeHTML(plan.endDate || '')}"></label></div><label data-plan-dates="time">Срок<input type="datetime-local" name="dueAt" value="${escapeHTML(toLocalInput(plan.dueAt || ''))}"></label><div class="form-grid two" data-plan-dates="block"><label>Начало события<input type="datetime-local" name="startsAt" value="${escapeHTML(toLocalInput(plan.startsAt || ''))}"></label><label>Окончание события<input type="datetime-local" name="endsAt" value="${escapeHTML(toLocalInput(plan.endsAt || ''))}"></label></div><fieldset class="plan-color-picker"><legend>Цвет</legend>${calendarColors().map(([key, label]) => `<label title="${label}"><input type="radio" name="colorKey" value="${key}" ${(plan.colorKey || 'green') === key ? 'checked' : ''} aria-label="${label}"><span class="planner-tone-${key}"></span></label>`).join('')}</fieldset></div>`;
}

function bindPersonalPlanDates(form) {
  const update = () => $$('[data-plan-dates]', form).forEach((node) => { node.hidden = node.dataset.planDates !== form.elements.dateMode.value; });
  form.elements.dateMode.addEventListener('change', update);
  form.elements.startDate.addEventListener('change', () => { if (!form.elements.endDate.value || form.elements.endDate.value < form.elements.startDate.value) form.elements.endDate.value = form.elements.startDate.value; });
  update();
}

function personalPlanDateLabel(plan) {
  if (plan.startsAt) return `${formatDate(plan.startsAt, true)} — ${new Date(plan.endsAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`;
  if (!plan.startDate) {
    if (plan.dueAt) return `Срок ${formatDate(plan.dueAt, true)}`;
    if (plan.occurrenceDate) return `${dateFromKey(plan.occurrenceDate).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })} · повторение`;
    return 'Без даты';
  }
  const label = (value) => dateFromKey(value).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
  return plan.endDate && plan.endDate !== plan.startDate ? `${label(plan.startDate)} - ${label(plan.endDate)}` : label(plan.startDate);
}

function openPersonalPlanDetails(id) {
  const plan = findPersonalItem('plan', id);
  if (!plan) { toast('План недоступен', true); return; }
  const dialog = $('#personal-dialog'), content = $('#personal-dialog-content');
  const links = personalLinksFor(state.personal.links, 'plan', id);
  const notes = links.filter((link) => link.targetType === 'note').map((link) => ({ link, note: findPersonalItem('note', link.targetId) })).filter((item) => item.note);
  const project = state.personal.projects.find((item) => item.id === plan.projectId), goal = state.personal.goals.find((item) => item.id === plan.goalId), children = state.personal.plans.filter((item) => item.parentId === plan.id && item.status === 'planned');
  content.innerHTML = `<div class="dialog-header personal-plan-header"><div><span class="record-kind">${icon('lock')} ${plan.itemKind === 'event' ? 'Личное событие' : 'Личное дело'}</span><h2>${escapeHTML(plan.title)}</h2><p>${escapeHTML(personalPlanDateLabel(plan))}</p></div><button type="button" class="icon-button" data-plan-close aria-label="Закрыть">${icon('x')}</button></div><div class="dialog-form plan-hub"><div class="plan-hub-actions"><button type="button" class="secondary" data-plan-reminder>${icon('bell')} Напомнить</button><button type="button" class="secondary" data-plan-waiting>${icon('clock')} Жду ответа</button><button type="button" class="secondary" data-plan-edit>${icon('edit')} Изменить</button><button type="button" class="secondary" data-plan-complete>${icon(plan.status === 'done' ? 'rotate' : 'check')} ${plan.status === 'done' ? 'Вернуть в дела' : 'Выполнено'}</button>${plan.seriesId && plan.status === 'planned' ? `<button type="button" class="secondary" data-plan-skip>${icon('chevronRight')} Пропустить экземпляр</button>` : ''}</div><div class="personal-plan-facts">${plan.occurrenceState === 'skipped' ? '<span>Экземпляр пропущен</span>' : ''}<span>${formatMinutes(plan.actualMinutes)} факт</span><span>${formatMinutes(plan.plannedMinutes)} план</span>${plan.recurrence ? `<span>${plan.recurrence.active ? 'Серия активна' : 'Серия остановлена'} · ${escapeHTML(personalRecurrenceLabel(plan.recurrence))}</span>` : ''}</div>${project ? `<button type="button" class="personal-context-link" data-personal-edit="project" data-personal-id="${project.id}">${icon('folder')} ${escapeHTML(project.title)}</button>` : ''}${goal ? `<button type="button" class="personal-context-link" data-personal-edit="goal" data-personal-id="${goal.id}">${icon('target')} ${escapeHTML(goal.title)}</button>` : ''}${children.length ? `<section><h3>Подзадачи <small>${children.length}</small></h3>${children.map((child) => renderPlanRow(child, state.personal.links)).join('')}</section>` : ''}${plan.notes ? `<div class="markdown-body">${renderMarkdown(plan.notes)}</div>` : ''}<section class="plan-hub-notes"><header><h3>Заметки <small>${notes.length}</small></h3><div><button type="button" class="secondary" data-plan-new-note>${icon('plus')} Заметка</button><button type="button" class="text-button" data-plan-link-note>${icon('link')} Связать</button></div></header>${notes.map(({ link, note }) => `<article><header><h4>${escapeHTML(note.title)}</h4><div><button type="button" class="icon-button" data-plan-note="${note.id}" title="Редактировать заметку" aria-label="Редактировать заметку">${icon('edit')}</button><button type="button" class="icon-button" data-unlink-note="${link.id}" title="Убрать связь с планом" aria-label="Убрать связь с планом">${icon('x')}</button></div></header><div class="markdown-body">${renderMarkdown(note.body)}</div></article>`).join('') || '<p class="muted">Связанных заметок пока нет.</p>'}</section>${renderPersonalLinkChips(links.filter((link) => link.targetType !== 'note'))}</div>`;
  $('[data-plan-close]', content).addEventListener('click', () => requestDialogClose(dialog));
  $('[data-plan-reminder]',content).onclick=()=>personalRemindersUI.open(id);
  $('[data-plan-waiting]',content).onclick=()=>personalWaitingUI.open('',id);
  $('[data-plan-edit]', content).addEventListener('click', () => openPersonalEditor('plan', id));
  $('[data-plan-new-note]', content).addEventListener('click', () => openPersonalEditor('note', '', { planId: id }));
  $('[data-plan-link-note]', content).addEventListener('click', () => openPersonalLinkDialog('plan', id, plan.title, { notesOnly: true, returnPlanId: id }));
  $$('[data-plan-note]', content).forEach((button) => button.addEventListener('click', () => openPersonalEditor('note', button.dataset.planNote, { planId: id })));
  const completeButton = $('[data-plan-complete]', content);
  if (plan.status !== 'done') completeButton.innerHTML = `${icon('check')} Завершить`;
  completeButton.addEventListener('click', async () => { completeButton.disabled = true; await togglePersonalPlan(id); if (completeButton.isConnected && dialog.open) openPersonalPlanDetails(id); });
  $('[data-plan-skip]', content)?.addEventListener('click', async (event) => {
    const button = event.currentTarget; button.disabled = true;
    try { await api(`/api/personal/plans/${id}/skip`, { method: 'POST', body: JSON.stringify({ expectedUpdatedAt: plan.updatedAt }) }); await loadPersonal({ force: true }); if (dialog.open) openPersonalPlanDetails(id); toast('Экземпляр пропущен'); }
    catch (error) { button.disabled = false; toast(error.message, true); }
  });
  $$('[data-personal-edit]', content).forEach((button) => button.addEventListener('click', () => openPersonalEditor(button.dataset.personalEdit, button.dataset.personalId)));
  $$('[data-plan-toggle]', content).forEach((button) => button.addEventListener('click', () => togglePersonalPlan(button.dataset.planToggle)));
  $$('[data-unlink-note]', content).forEach((button) => button.addEventListener('click', async () => {
    if (!confirm('Убрать связь? Сама заметка останется в личном пространстве.')) return;
    button.disabled = true;
    try { await api(`/api/personal/links/${button.dataset.unlinkNote}`, { method: 'DELETE' }); await loadPersonal({ force: true }); if (button.isConnected && dialog.open) openPersonalPlanDetails(id); } catch (error) { button.disabled = false; toast(error.message, true); }
  }));
  $$('[data-personal-target-type]', content).forEach((button) => button.addEventListener('click', () => openPersonalTarget(button.dataset.personalTargetType, button.dataset.personalTargetId)));
  openModal(dialog);
}

async function openTeamsDirectory() {
  const dialog=$('#workspace-dialog'),content=$('#workspace-dialog-content');
  content.innerHTML='<div class="workspace-dialog-loading"><span class="spinner"></span><strong>Загружаем команды</strong></div>';
  const loading=content.firstElementChild;
  openModal(dialog);
  try {
    const teams=await api('/api/teams?includeDeleted=true');
    if(!dialog.open||content.firstElementChild!==loading)return;
    state.teams=teams.filter(team=>!team.deletedAt);
    const deleted=teams.filter(team=>team.deletedAt);
    content.innerHTML='<div class="workspace-editor-shell teams-directory"><header><div><p class="eyebrow">Независимые группы людей</p><h2>Команды</h2></div><button type="button" class="icon-button" data-directory-close aria-label="Закрыть">'+icon('x')+'</button></header><div class="plan-hub-actions"><button type="button" class="primary" data-directory-create>'+icon('plus')+' Новая команда</button><button type="button" class="secondary" data-directory-join>'+icon('link')+' Присоединиться</button></div>'+
      state.teams.map(team=>{
        const projects=state.workspaces.filter(project=>project.teamId===team.id);
        return '<section><header><div><h3>'+escapeHTML(team.name)+'</h3><small>'+teamRoleLabel(team.role)+' · отдельный состав участников</small></div><div class="directory-team-actions"><button type="button" class="secondary" data-directory-team="'+team.id+'">'+icon('users')+' Управление</button>'+(team.role!=='owner'?'<button type="button" class="text-button danger-text" data-directory-leave="'+team.id+'">'+icon('arrowLeft')+' Выйти</button>':'')+'</div></header>'+
          projects.map(project=>'<button type="button" class="directory-project" data-directory-project="'+project.id+'">'+icon(project.id===state.activeWorkspaceId?'check':'network')+'<span><strong>'+escapeHTML(project.name)+'</strong><small>'+escapeHTML(project.description||'')+'</small></span>'+icon('chevronRight')+'</button>').join('')+
          (projects.length?'':'<p class="muted">Рабочее пространство команды недоступно.</p>')+'</section>';
      }).join('')+(state.teams.length?'':'<p class="muted">Вы пока не участвуете в командах.</p>')+
      (deleted.length?'<details class="deleted-teams"><summary>Удалённые команды · '+deleted.length+'</summary>'+deleted.map(team=>'<article><div><strong>'+escapeHTML(team.name)+'</strong><small>Удалена '+formatDate(team.deletedAt,true)+'</small></div><button type="button" class="secondary" data-restore-team="'+team.id+'">'+icon('rotate')+' Восстановить</button></article>').join('')+'</details>':'')+'</div>';
    const shell=content.firstElementChild;
    $('[data-directory-close]',shell).addEventListener('click',closeWorkspaceDialog);
    $('[data-directory-create]',shell).addEventListener('click',openWorkspaceCreateDialog);
    $('[data-directory-join]',shell).addEventListener('click',()=>openJoinTeamDialog());
    $$('[data-directory-team]',shell).forEach(button=>button.addEventListener('click',()=>openTeamSettings(button.dataset.directoryTeam)));
    $$('[data-directory-leave]',shell).forEach(button=>button.addEventListener('click',()=>openTeamLifecycleDialog(state.teams.find(team=>team.id===button.dataset.directoryLeave),'leave')));
    $$('[data-directory-project]',shell).forEach(button=>button.addEventListener('click',async()=>{closeWorkspaceDialog();try{if(await switchWorkspace(button.dataset.directoryProject))navigateToView('collections');}catch(error){toast(error.message,true);}}));
    $$('[data-restore-team]',shell).forEach(button=>button.addEventListener('click',async()=>{
      if(button.disabled)return;button.disabled=true;
      try{await api('/api/teams/'+button.dataset.restoreTeam+'/restore',{method:'POST'});await loadData(true);if(dialog.open&&shell.isConnected)await openTeamsDirectory();toast('Команда восстановлена. Старые приглашения остаются отозванными.');}
      catch(error){button.disabled=false;toast(error.message,true);}
    }));
  } catch(error) {
    if(!dialog.open||content.firstElementChild!==loading)return;
    content.innerHTML='<div class="workspace-editor-shell"><header><h2>Команды не загрузились</h2><button type="button" class="icon-button" data-directory-close aria-label="Закрыть">'+icon('x')+'</button></header><p>'+escapeHTML(error.message)+'</p><button type="button" class="secondary" data-directory-retry>Повторить</button></div>';
    $('[data-directory-close]',content).addEventListener('click',closeWorkspaceDialog);
    $('[data-directory-retry]',content).addEventListener('click',openTeamsDirectory);
  }
}

function openCalendar(scope = 'project', collectionID = '') {
  return navigateToView('calendar', { calendarScope: scope, calendarCollection: collectionID, calendarOwner: '', calendarStatus: 'active' });
}

function plannerRange(item, personal) {
  if (personal && item.startDate) return [item.startDate, item.endDate || item.startDate];
  if (personal && item.startsAt) { const start = new Date(item.startsAt), end = new Date(item.endsAt || item.startsAt); return [localDateKey(start), localDateKey(end > start ? new Date(end.getTime() - 1) : start)]; }
  if (personal && item.occurrenceDate) return [item.occurrenceDate, item.occurrenceDate];
  if (!item.dueAt) return ['', ''];
  const key = localDateKey(new Date(item.dueAt));
  return [key, key];
}

function plannerMatchesDay(item, day, personal) {
  const [start, end] = plannerRange(item, personal);
  return Boolean(start && start <= day && end >= day);
}

function plannerItems() {
  const personal = state.calendarScope === 'personal';
  const personalItems = [...(state.personal?.plans || []), ...(state.personal?.notes || []).filter(note=>note.scheduledDate || calendarPresentation('personal').journal).map(note => ({...note, calendarKind:'note', startDate:note.scheduledDate || localDateKey(new Date(note.createdAt)), endDate:note.scheduledDate || localDateKey(new Date(note.createdAt)), status:'planned'}))];
  if (personal) personalItems.push(...personalCalendarUI.recurrences());
  if (personal && calendarPresentation('personal').includeWork) personalItems.push(...personalCalendarUI.entries());
  return (personal ? personalItems : state.records).filter((item) => {
    if (item.status === 'archived' || item.status === 'cancelled') return false;
    const done = personal ? item.status === 'done' : !isActiveRecord(item);
    if (state.calendarStatus === 'active' && done || state.calendarStatus === 'done' && !done) return false;
    return personal || ((!state.calendarCollection || item.collectionId === state.calendarCollection) && (!state.calendarOwner || String(item.ownerId) === state.calendarOwner));
  });
}

function plannerTone(item) {
  if (item.calendarKind === 'work') return 'blue';
  let color = item.colorKey || 'green';
  if (state.calendarScope !== 'personal') {
    const stage = state.collections.find((board) => board.id === item.collectionId)?.stages.find((value) => value.id === item.stageId);
    color = state.calendarColorBy === 'priority' ? ({ critical: 'red', high: 'amber', normal: 'green', low: 'neutral' })[item.priority] : stage?.colorKey || 'blue';
  }
  return calendarColors().some(([key]) => key === color) ? color : 'neutral';
}

function plannerEntry(item) {
  const personal = state.calendarScope === 'personal';
  const subtitle = item.calendarKind === 'recurrence' ? 'Будущее повторение · '+personalPlanDateLabel(item) : item.calendarKind === 'work' ? `${item.workspace} · ${item.startsAt ? personalPlanDateLabel(item) : item.dueAt ? 'Срок: '+formatDate(item.dueAt,true) : 'Без времени'}` : personal ? item.calendarKind === 'note' ? 'Заметка' : personalPlanDateLabel(item) : `${item.ownerUsername || ''}${item.dueAt ? ` · ${formatDate(item.dueAt, true)}` : ' · Без срока'}`;
  return `<button type="button" class="planner-entry planner-tone-${plannerTone(item)}" data-planner-entry="${item.id}" data-planner-kind="${item.calendarKind || ''}"><i></i><span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(subtitle)}</small></span>${icon('chevronRight')}</button>`;
}

function bindPersonalCalendarControls(root) {
  root.insertAdjacentHTML('beforeend', `<div class="personal-calendar-options"><label class="check"><input type="checkbox" data-calendar-include-work ${calendarPresentation('personal').includeWork?'checked':''}><span>Показывать мои рабочие задачи</span></label><button type="button" class="text-button" data-calendar-work-plan>${icon('plus')} Запланировать рабочую задачу</button></div>${personalCalendarUI.banner()}`);
  $('[data-calendar-include-work]',root).addEventListener('change',event=>{saveCalendarPresentation('personal',{includeWork:event.target.checked});if(state.view==='day')renderDayWorkspace();else renderCalendarPage();});
  personalCalendarUI.bind(root);
}

function renderCalendarPage() {
  const optionsOpen = Boolean($('.planner-view-options')?.open);
  const personal = state.calendarScope === 'personal';
  if (personal && !state.personal && state.personalError) return renderPersonalLoadError();
  if (personal && !state.personal) { $('#main-content').innerHTML = '<p>Загружаем личный календарь...</p>'; loadPersonal(); return; }
  state.calendarMonth ||= localISODate().slice(0, 7);
  state.calendarDay ||= localISODate();
  const month = dateFromKey(`${state.calendarMonth}-01`), today = localISODate();
  const start = addCalendarDays(month, -(month.getDay() + 6) % 7);
  const days = Array.from({ length: 42 }, (_, index) => localDateKey(addCalendarDays(start, index)));
  if (personal) personalCalendarUI.ensure(days[0],localDateKey(addCalendarDays(start,42)));
  const items = plannerItems(), forDay = (key) => items.filter((item) => plannerMatchesDay(item, key, personal));
  const selected = forDay(state.calendarDay), undated = items.filter((item) => !plannerRange(item, personal)[0]);
  const option = (key, label, value) => `<option value="${escapeHTML(key)}" ${String(value) === String(key) ? 'selected' : ''}>${escapeHTML(label)}</option>`;
  const monthDays = days.filter((key) => key.startsWith(state.calendarMonth));
  const agenda = monthDays.filter((key) => forDay(key).length).map((key) => `<section><h3>${escapeHTML(dateFromKey(key).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }))}</h3>${forDay(key).map(plannerEntry).join('')}</section>`).join('');
  $('#main-content').innerHTML = `<div class="page-heading"><div><p class="eyebrow">${escapeHTML(personal ? 'Только для вас' : activeWorkspace()?.name || 'Проект')}</p><h1>Календарь</h1></div><button type="button" class="primary" data-planner-create>${icon('plus')} ${personal ? 'Дело или событие' : 'Карточка'}</button></div><section class="planner-controls"><div class="planner-switches"><div class="segmented" aria-label="Пространство календаря">${[['personal', 'Личное'], ['project', 'Проект']].map(([key, label]) => `<button type="button" class="segment ${state.calendarScope === key ? 'active' : ''}" aria-pressed="${state.calendarScope === key}" data-planner-scope="${key}">${label}</button>`).join('')}</div><div class="segmented" aria-label="Вид календаря">${[['month', 'Месяц'], ['agenda', 'Расписание']].map(([key, label]) => `<button type="button" class="segment ${state.calendarDisplay === key ? 'active' : ''}" data-planner-display="${key}">${label}</button>`).join('')}</div>${!personal ? `<button type="button" class="text-button" data-planner-cycle>12 недель и год ${icon('chevronRight')}</button>` : ''}</div><div class="planner-filters">${!personal ? `<label>Доска<select data-planner-filter="calendarCollection">${option('', 'Все доски', state.calendarCollection)}${state.collections.map((board) => option(board.id, board.name, state.calendarCollection)).join('')}</select></label><label>Ответственный<select data-planner-filter="calendarOwner">${option('', 'Все', state.calendarOwner)}${state.users.map((user) => option(user.id, user.username, state.calendarOwner)).join('')}</select></label>` : ''}<label>Состояние<select data-planner-filter="calendarStatus">${[['active', 'Открытые'], ['done', 'Завершённые'], ['all', 'Все']].map(([key, label]) => option(key, label, state.calendarStatus)).join('')}</select></label>${!personal ? `<label>Цвет<select data-planner-filter="calendarColorBy">${option('stage', 'По этапу доски', state.calendarColorBy)}${option('priority', 'По приоритету', state.calendarColorBy)}</select></label>` : ''}<button type="button" class="text-button" data-planner-reset>Сбросить</button></div></section><section class="planner-body"><header class="planner-period"><button type="button" class="icon-button" data-planner-shift="-1" aria-label="Предыдущий месяц">${icon('arrowLeft')}</button><label><span class="sr-only">Месяц</span><input type="month" data-planner-month value="${state.calendarMonth}" min="1900-01" max="9998-12"></label><button type="button" class="icon-button" data-planner-shift="1" aria-label="Следующий месяц">${icon('chevronRight')}</button><button type="button" class="text-button" data-planner-today>Сегодня</button></header>${state.calendarDisplay === 'agenda' ? `<div class="planner-agenda">${agenda || '<p class="muted">В этом месяце записей по выбранным фильтрам нет.</p>'}</div>` : `<div class="planner-month"><div class="planner-weekdays">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map((day) => `<span>${day}</span>`).join('')}</div><div class="planner-grid">${days.map((key) => { const entries = forDay(key); return `<button type="button" data-planner-day="${key}" class="planner-day ${!key.startsWith(state.calendarMonth) ? 'outside' : ''} ${key === today ? 'today' : ''} ${key === state.calendarDay ? 'selected' : ''}" aria-pressed="${key === state.calendarDay}" aria-label="${key}: ${entries.length} записей"><b>${Number(key.slice(-2))}</b><span class="planner-day-preview">${entries.slice(0, 2).map((item) => `<span class="planner-mini planner-tone-${plannerTone(item)}">${escapeHTML(item.title)}</span>`).join('')}${entries.length > 2 ? `<small>+${entries.length - 2}</small>` : ''}</span><span class="planner-day-dots" aria-hidden="true">${entries.slice(0, 3).map((item) => `<i class="planner-tone-${plannerTone(item)}"></i>`).join('')}${entries.length > 3 ? `<small>+${entries.length - 3}</small>` : ''}</span></button>`; }).join('')}</div></div><section class="planner-selected"><header><h2>${escapeHTML(dateFromKey(state.calendarDay).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', weekday: 'long' }))}</h2><div><button type="button" class="text-button" data-planner-create>${icon('plus')} ${personal ? 'Дело или событие' : 'Карточка'}</button>${!personal ? `<button type="button" class="text-button" data-planner-assign>${icon('link')} Назначить карточку</button>` : ''}</div></header>${selected.map(plannerEntry).join('') || '<p class="muted">На этот день записей по выбранным фильтрам нет.</p>'}</section>`}</section><details class="planner-undated"><summary>Без даты <b>${undated.length}</b></summary>${undated.map(plannerEntry).join('') || '<p class="muted">Записей без даты нет.</p>'}</details>`;
  const root = $('#main-content');
  const calendarSurface = personal ? 'personal' : 'project';
  if (personal) bindPersonalCalendarControls($('.planner-controls',root));
  const calendarBody = $('.planner-body', root);
  calendarBody.classList.toggle('calendar-expanded', state.calendarExpanded === calendarSurface);
  calendarBody.insertAdjacentHTML('afterbegin', `<details class="planner-view-options"><summary>Вид и фильтры${state.calendarStatus!=='all'||state.calendarOwner||state.calendarCollection?' · включены':''}</summary><div>${calendarPresentationToolbar(calendarSurface)}${personal?`<label class="check"><input type="checkbox" data-planner-journal ${calendarPresentation('personal').journal?'checked':''}><span>Показывать также заметки по дате создания</span></label>`:''}</div></details>`);
  $('.planner-view-options > div',root).append($('.planner-filters',root));
  $('.planner-view-options',root).open = optionsOpen;
  $('[data-planner-journal]',root)?.addEventListener('change',event=>{saveCalendarPresentation('personal',{journal:event.target.checked});renderCalendarPage();});
  if (state.calendarDisplay !== 'agenda' && calendarPresentation(calendarSurface).format === 'circles') {
    $('.planner-month', root).innerHTML = `${calendarTimeLegend()}<div class="planner-circle-grid">${monthDays.map((key) => calendarCircle(key, forDay(key), 'data-planner-day', state.calendarDay)).join('')}</div>`;
  }
  bindCalendarPresentation(calendarSurface, calendarBody, renderCalendarPage);
  $$('[data-planner-scope]', root).forEach((button) => button.addEventListener('click', () => { state.calendarScope = button.dataset.plannerScope; renderCalendarPage(); }));
  $$('[data-planner-display]', root).forEach((button) => button.addEventListener('click', () => { state.calendarDisplay = button.dataset.plannerDisplay; renderCalendarPage(); }));
  $$('[data-planner-filter]', root).forEach((select) => select.addEventListener('change', () => { state[select.dataset.plannerFilter] = select.value; renderCalendarPage(); }));
  $$('[data-planner-entry]', root).forEach((button) => button.addEventListener('click', () => button.dataset.plannerKind === 'recurrence' ? personalCalendarUI.openRecurrence(button.dataset.plannerEntry) : button.dataset.plannerKind === 'work' ? personalCalendarUI.openWork(button.dataset.plannerEntry.slice(5)) : personal ? button.dataset.plannerKind === 'note' ? openPersonalEditor('note', button.dataset.plannerEntry) : openPersonalPlanDetails(button.dataset.plannerEntry) : openRecord(button.dataset.plannerEntry)));
  $$('[data-planner-create]', root).forEach((button) => button.addEventListener('click', createCalendarEntry));
  $$('[data-planner-day]', root).forEach((button) => button.addEventListener('click', () => openDayWorkspace(button.dataset.plannerDay, state.calendarScope)));
  $$('[data-planner-shift]', root).forEach((button) => button.addEventListener('click', () => { const next = new Date(month); next.setMonth(next.getMonth() + Number(button.dataset.plannerShift)); state.calendarMonth = localDateKey(next).slice(0, 7); state.calendarDay = `${state.calendarMonth}-01`; renderCalendarPage(); }));
  $('[data-planner-month]', root).addEventListener('change', (event) => { if (!event.target.value || !event.target.validity.valid) return; state.calendarMonth = event.target.value; state.calendarDay = `${state.calendarMonth}-01`; renderCalendarPage(); });
  $('[data-planner-today]', root).addEventListener('click', () => { state.calendarMonth = today.slice(0, 7); state.calendarDay = today; renderCalendarPage(); });
  $('[data-planner-reset]', root).addEventListener('click', () => { state.calendarCollection = ''; state.calendarOwner = ''; state.calendarStatus = 'all'; renderCalendarPage(); });
  $('[data-planner-assign]', root)?.addEventListener('click', openCalendarCardPicker);
  $('[data-planner-cycle]', root)?.addEventListener('click', async () => { state.workViewMode = 'calendar'; await refreshPlanningCycles(); navigateToView('work'); });
  enhanceSelects(root);
  applyPageLayout();
}

function createCalendarEntry() {
  const date = state.calendarDay || localISODate();
  if (state.calendarScope === 'personal') return openPersonalEditor('plan', '', { date });
  const collection = state.collections.find((item) => item.id === state.calendarCollection);
  if (collection) return openCollectionCardDialog(collection, null, '', { dueAt: `${date}T18:00` });
  openCreateDialog('task', { dueAt: `${date}T18:00` });
}

function openCalendarCardPicker() {
  const workspace = state.activeWorkspaceId, dialog = $('#workspace-dialog'), content = $('#workspace-dialog-content');
  content.innerHTML = `<div class="workspace-editor-shell"><header><h2>Назначить срок карточке</h2><button type="button" class="icon-button" data-picker-close aria-label="Закрыть">${icon('x')}</button></header><label>Дата и время<input type="datetime-local" data-picker-date value="${state.calendarDay || localISODate()}T18:00"></label><label>Карточка<input type="search" data-picker-search placeholder="Найти по названию"></label><div class="personal-link-results" data-picker-results></div></div>`;
  $('[data-picker-close]', content).addEventListener('click', closeWorkspaceDialog);
  const search = $('[data-picker-search]', content), results = $('[data-picker-results]', content), dateInput = $('[data-picker-date]', content);
  let saving = false;
  const show = () => {
    const items = plannerItems().filter((item) => isActiveRecord(item) && item.title.toLocaleLowerCase().includes(search.value.trim().toLocaleLowerCase()));
    results.innerHTML = items.map((item) => `<button type="button" data-schedule-card="${item.id}"><strong>${escapeHTML(item.title)}</strong><small>${item.dueAt ? `Срок: ${escapeHTML(formatDate(item.dueAt, true))}` : 'Без срока'}</small></button>`).join('') || '<p>Доступных карточек по выбранным фильтрам нет.</p>';
    $$('[data-schedule-card]', results).forEach((button) => button.addEventListener('click', async () => {
      if (saving) return;
      if (!dateInput.value || !dateInput.validity.valid) { toast('Укажите дату и время', true); return; }
      const record = items.find((item) => item.id === button.dataset.scheduleCard);
      saving = true; results.inert = true;
      try {
        const updated = await api(`/api/records/${record.id}`, { method: 'PATCH', body: JSON.stringify({ dueAt: new Date(dateInput.value).toISOString(), expectedUpdatedAt: record.updatedAt, reason: 'Срок назначен в календаре' }) });
        if (workspace !== state.activeWorkspaceId) return;
        state.records = state.records.map((item) => item.id === updated.id ? updated : item); state.detailCache.delete(updated.id);
        if (button.isConnected) closeWorkspaceDialog();
        if (state.view === 'calendar') renderCalendarPage();
        if (state.view === 'day') renderDayWorkspace();
        toast('Срок карточки сохранён');
      } catch (error) { toast(error.message, true); }
      finally { saving = false; results.inert = false; }
    }));
  };
  search.addEventListener('input', show); show(); openModal(dialog);
}

function renderPersonalLoadError() {
  $('#main-content').innerHTML = `<div class="guided-empty"><h2>Не удалось загрузить личные данные</h2><p>${escapeHTML(state.personalError || '')}</p><button type="button" class="secondary" data-retry-personal>Повторить</button></div>`;
  $('[data-retry-personal]').addEventListener('click', () => loadPersonal({ force: true }));
}

function noteCalendarDate(note) {
  if (note.scheduledDate != null) return note.scheduledDate;
  return note.createdAt ? localDateKey(new Date(note.createdAt)) : '';
}

function dayWorkspaceItems(scope, day, personal = state.personal, records = state.records) {
  if (scope !== 'personal') {
    const scheduled = (records || []).filter(item => item.status !== 'archived' && plannerMatchesDay(item, day, false));
    return { records: scheduled.filter(item => item.type !== 'document'), notes: scheduled.filter(item => item.type === 'document') };
  }
  const plans = (personal?.plans || []).filter(item => item.status !== 'archived' && plannerMatchesDay(item, day, true));
  const ids = new Set(plans.map(item => item.id)), noteIDs = new Set();
  for (const link of personal?.links || []) {
    if (link.sourceType === 'plan' && ids.has(link.sourceId) && link.targetType === 'note') noteIDs.add(link.targetId);
    if (link.targetType === 'plan' && ids.has(link.targetId) && link.sourceType === 'note') noteIDs.add(link.sourceId);
  }
  const notes = (personal?.notes || []).filter(note => noteCalendarDate(note) === day || noteIDs.has(note.id));
  return { records: plans, notes };
}

function personalWorkspacePage() {
  return state.view === 'personal' || ['calendar', 'day'].includes(state.view) && state.calendarScope === 'personal';
}

function openDayWorkspace(date, scope) {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
  return navigateToView('day', { calendarScope: scope === 'personal' ? 'personal' : 'project', calendarDay: date, calendarCollection: '', calendarOwner: '', calendarExpanded: '' });
}

function dayRecordRow(item, personal) {
  if (item.calendarKind === 'work') return `<button type="button" class="day-record-row" data-day-item="${item.recordId}" data-day-kind="work">${icon('checkSquare')}<span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(item.workspace)} · ${escapeHTML(item.startsAt?personalPlanDateLabel(item):'Срок: '+formatDate(item.dueAt,true))}</small></span>${icon('chevronRight')}</button>`;
  const status = item.calendarKind === 'recurrence' ? 'Будущее повторение' : personal && item.occurrenceState === 'skipped' ? 'Пропущено' : personal ? item.status === 'done' ? 'Завершён' : 'Запланирован' : statusLabel(item);
  const when = personal ? personalPlanDateLabel(item) : item.dueAt ? formatDate(item.dueAt, true) : '';
  return `<button type="button" class="day-record-row" data-day-item="${item.id}" data-day-kind="${item.calendarKind === 'recurrence' ? 'recurrence' : personal ? 'plan' : 'record'}">${icon(personal ? 'calendar' : typeMeta[item.type]?.icon || 'fileText')}<span><strong>${escapeHTML(item.title)}</strong><small>${escapeHTML(status)}${when ? ` · ${escapeHTML(when)}` : ''}${!personal && item.ownerUsername ? ` · ${escapeHTML(item.ownerUsername)}` : ''}</small></span>${icon('chevronRight')}</button>`;
}

function bindDayItems(root) {
  $$('[data-day-item]', root).forEach(button => button.addEventListener('click', () => {
    if (button.dataset.dayKind === 'recurrence') personalCalendarUI.openRecurrence(button.dataset.dayItem);
    else if (button.dataset.dayKind === 'work') personalCalendarUI.openWork(button.dataset.dayItem);
    else if (button.dataset.dayKind === 'plan') openPersonalPlanDetails(button.dataset.dayItem);
    else if (button.dataset.dayKind === 'note') openPersonalEditor('note', button.dataset.dayItem);
    else openRecord(button.dataset.dayItem);
  }));
}

function renderDayWorkspace() {
  const personal = state.calendarScope === 'personal', date = state.calendarDay || localISODate();
  if (personal && !state.personal) {
    if (state.personalError) return renderPersonalLoadError();
    $('#main-content').innerHTML = '<p class="muted">Загружаем записи дня...</p>'; loadPersonal(); return;
  }
  const data = dayWorkspaceItems(personal ? 'personal' : 'project', date), root = $('#main-content');
  if (personal) {
    personalCalendarUI.ensure(date,localDateKey(addCalendarDays(date,1)));
    data.records.push(...personalCalendarUI.recurrences().filter(item=>plannerMatchesDay(item,date,true)));
    if (calendarPresentation('personal').includeWork) data.records.push(...personalCalendarUI.entries().filter(item=>plannerMatchesDay(item,date,true)));
  }
  root.innerHTML = `<header class="day-workspace-heading"><div class="day-workspace-nav"><button type="button" class="secondary" data-day-back>${icon('arrowLeft')} Назад</button><div><button type="button" class="icon-button" data-day-shift="-1" aria-label="Предыдущий день">${icon('arrowLeft')}</button><input type="date" aria-label="Открытый день" value="${date}" data-day-date><button type="button" class="icon-button" data-day-shift="1" aria-label="Следующий день">${icon('chevronRight')}</button></div></div><div class="section-heading"><div><p class="eyebrow">${escapeHTML(personal ? 'Личное' : activeWorkspace()?.name || 'Проект')}</p><h1>${escapeHTML(dateFromKey(date).toLocaleDateString('ru-RU', {weekday:'long',day:'numeric',month:'long'}))}</h1></div><button type="button" class="icon-button" data-day-layout title="Настроить день" aria-label="Настроить день">${icon('sliders')}</button></div></header><section class="day-workspace-records"><header class="section-heading"><h2>${personal ? 'Планы' : 'Карточки'} <small>${data.records.length}</small></h2><div><button type="button" class="text-button" data-day-new>${icon('plus')} ${personal ? 'Дело или событие' : 'Карточка'}</button>${!personal ? `<button type="button" class="icon-button" data-day-assign aria-label="Назначить существующую карточку" title="Назначить существующую карточку">${icon('link')}</button>` : ''}</div></header>${data.records.map(item => dayRecordRow(item, personal)).join('') || '<p class="muted">На этот день ничего не запланировано.</p>'}</section><section class="day-workspace-notes"><header class="section-heading"><h2>Заметки <small>${data.notes.length}</small></h2><button type="button" class="text-button" data-day-note>${icon('plus')} Заметка</button></header>${data.notes.map(note => `<article class="day-note"><button type="button" class="day-note-title" data-day-kind="${personal ? 'note' : 'record'}" data-day-item="${note.id}">${icon('edit')}<strong>${escapeHTML(note.title)}</strong></button><div class="markdown-body">${renderMarkdown(personal ? note.body : note.description || '')}</div>${personal ? `<small class="muted">${noteCalendarDate(note) === date ? 'На этот день' : 'Связана с планом'}${note.createdAt ? ` · Создана ${escapeHTML(formatDate(note.createdAt))}` : ''}</small>` : ''}</article>`).join('') || '<p class="muted">Заметок на этот день пока нет.</p>'}</section>`;
  if (personal) bindPersonalCalendarControls($('.day-workspace-heading',root));
  $('[data-day-back]',root).addEventListener('click', () => { if (!leavePageLayoutEditor()) return; if ((history.state?.businessControlDepth || 0) > 0) history.back(); else openCalendar(state.calendarScope); });
  const changeDay = next => { if (!next || !leavePageLayoutEditor()) return; state.calendarDay = next; rememberView(); renderDayWorkspace(); };
  $$('[data-day-shift]',root).forEach(button => button.addEventListener('click', () => changeDay(localDateKey(addCalendarDays(date, Number(button.dataset.dayShift))))));
  $('[data-day-date]',root).addEventListener('change', event => { if (event.target.validity.valid) changeDay(event.target.value); });
  $('[data-day-new]',root).addEventListener('click', createCalendarEntry);
  $('[data-day-note]',root).addEventListener('click', () => personal ? openPersonalEditor('note','',{date}) : openCreateDialog('document',{dueAt:date+'T18:00'}));
  $('[data-day-assign]',root)?.addEventListener('click', openCalendarCardPicker);
  $('[data-day-layout]',root).addEventListener('click', () => startPageLayoutEditor());
  bindDayItems(root); applyPageLayout();
}

function pageWidgetsSupported() {
  return !['chat','graph','structure','notifications','history','quality'].includes(state.view);
}

function workspaceWidgetCatalog() {
  if (!pageWidgetsSupported()) return [];
  const personal = personalWorkspacePage();
  const definitions = [
    ['calendar','Мини-календарь','calendar',4], ['agenda','Расписание дня','calendar',6],
    ...(personal ? [['notes','Заметки','edit',6],['plans','Планы','calendar',6],['habits','Привычки','checkSquare',6]]
      : [['tasks','Задачи','checkSquare',6],['research','Исследования','flask',6],['risks','Риски','shield',6],['goals','Цели','target',6]]),
  ];
  return definitions.map(([key,label,image,span]) => ({key:'widget:'+key,label,image,span,required:false,selector:'[data-page-widget="'+key+'"]'}));
}

function widgetScaleKey(key, device = state.pageLayoutDraft?.device || interfaceDevice()) {
  return `business-control:widget-size:${state.me?.id}:${state.activeWorkspaceId}:${device}:${pageLayoutKey()}:${key}`;
}

function widgetScale(block, settings) {
  if (!state.pageLayoutDraft) {
    try { const stored = Number(localStorage.getItem(widgetScaleKey(block.key))); if (stored) return Math.max(40, Math.min(100, stored)); } catch (_) {}
  }
  return Math.max(40, Math.min(100, Number(settings.scale) || 100));
}

function renderWorkspaceWidget(block, settings) {
  const personal = personalWorkspacePage(), kind = block.key.slice(7), limit = settings.limit || 6;
  const scope = personal ? 'personal' : 'project', date = state.view === 'day' ? state.calendarDay : localISODate();
  let body = '';
  if (personal && !state.personal) return '<p class="muted">Личные данные ещё загружаются.</p>';
  if (kind === 'calendar') {
    state.widgetMonths ||= {};
    const key = pageLayoutKey()+':'+block.key;
    const monthKey = state.widgetMonths[key] || date.slice(0,7), month = dateFromKey(monthKey+'-01');
    const first = addCalendarDays(month, -(month.getDay()+6)%7);
    const days = Array.from({length:42},(_,i) => localDateKey(addCalendarDays(first,i)));
    body = `<div class="mini-calendar" data-calendar-scalable><header><button type="button" class="icon-button" data-widget-month="-1" aria-label="Предыдущий месяц">${icon('arrowLeft')}</button><button type="button" class="text-button" data-widget-today>${escapeHTML(month.toLocaleDateString('ru-RU',{month:'long',year:'numeric'}))}</button><button type="button" class="icon-button" data-widget-month="1" aria-label="Следующий месяц">${icon('chevronRight')}</button></header><div class="mini-calendar-weekdays">${['Пн','Вт','Ср','Чт','Пт','Сб','Вс'].map(day=>`<span>${day}</span>`).join('')}</div><div class="mini-calendar-days ${settings.format === 'circles' ? 'mini-calendar-circles' : ''}">${days.map(day => { const items=dayWorkspaceItems(scope,day),count=items.records.length+items.notes.length; return `<button type="button" class="${day.startsWith(monthKey)?'':'outside'} ${calendarTimeState(day)}" data-widget-day="${day}" aria-label="${day}: ${count} записей" ${day===localISODate()?'aria-current="date"':''}><span>${Number(day.slice(-2))}</span><i class="${count?'has-entries':''}" aria-hidden="true"></i></button>`; }).join('')}</div></div>`;
  } else if (kind === 'notes') {
    const notes = state.personal?.notes || [];
    body = notes.slice(0,limit).map(note=>`<button type="button" class="day-record-row" data-day-kind="note" data-day-item="${note.id}">${icon('edit')}<span><strong>${escapeHTML(note.title)}</strong><small>${escapeHTML(markdownPlain(note.body).slice(0,100))}</small></span></button>`).join('');
    body += `<button type="button" class="text-button" data-widget-personal-tab="notes">Все заметки · ${notes.length} ${icon('chevronRight')}</button>`;
  } else if (kind === 'habits') {
    body = (state.personal?.habits || []).filter(habit => !habit.archivedAt && !habit.paused).slice(0,limit).map(habit => `<button type="button" class="day-record-row" data-widget-personal-tab="habits">${icon('checkSquare')}<span><strong>${escapeHTML(habit.title)}</strong><small>Серия: ${habit.currentStreak || 0} ${escapeHTML(habit.summary?.streakUnit || 'плановых дней')}</small></span></button>`).join('');
    body += '<button type="button" class="text-button" data-widget-personal-tab="habits">Все привычки</button>';
  } else {
    let items = [];
    if (kind === 'agenda') { const data=dayWorkspaceItems(scope,date); items=[...data.records,...data.notes.map(note=>({...note,calendarKind:'note'}))]; }
    else if (kind === 'plans') items = (state.personal?.plans || []).filter(item=>item.status!=='done');
    else { const type = {tasks:'task',research:'research',risks:'risk',goals:'goal'}[kind]; items=state.records.filter(item=>item.type===type&&isActiveRecord(item)).slice().sort(sortWorkRecords); }
    body = items.slice(0,limit).map(item=> personal && item.calendarKind==='note' ? `<button type="button" class="day-record-row" data-day-kind="note" data-day-item="${item.id}">${icon('edit')}<strong>${escapeHTML(item.title)}</strong></button>` : dayRecordRow(item,personal)).join('') || '<p class="muted">Записей пока нет.</p>';
    body += kind === 'agenda' ? `<button type="button" class="text-button" data-widget-day="${date}">Открыть день · ${items.length} ${icon('chevronRight')}</button>` : personal ? '<button type="button" class="text-button" data-widget-personal-tab="plans">Все дела</button>' : `<button type="button" class="text-button" data-widget-record-type="${{tasks:'task',research:'research',risks:'risk',goals:'goal'}[kind]}">Открыть всё · ${items.length}</button>`;
  }
  return `<header class="workspace-widget-heading"><h2>${icon(block.image)} ${escapeHTML(block.label)}</h2></header>${body}`;
}

function bindWorkspaceWidget(node, block, settings) {
  bindDayItems(node);
  $$('[data-widget-day]',node).forEach(button=>button.addEventListener('click',()=>openDayWorkspace(button.dataset.widgetDay,personalWorkspacePage()?'personal':'project')));
  $$('[data-widget-personal-tab]',node).forEach(button=>button.addEventListener('click',()=>{ if (!leavePageLayoutEditor()) return; state.personalTab=button.dataset.widgetPersonalTab; navigateToView('personal'); }));
  $$('[data-widget-record-type]',node).forEach(button=>button.addEventListener('click',()=>navigateToView(button.dataset.widgetRecordType==='task'?'work':button.dataset.widgetRecordType)));
  const redraw=()=> { node.dataset.widgetSignature=''; applyPageLayout(); };
  const key=pageLayoutKey()+':'+block.key;
  $$('[data-widget-month]',node).forEach(button=>button.addEventListener('click',()=> {
    const month=dateFromKey((state.widgetMonths?.[key]||localISODate().slice(0,7))+'-01');
    month.setMonth(month.getMonth()+Number(button.dataset.widgetMonth));
    state.widgetMonths[key]=localDateKey(month).slice(0,7); redraw();
  }));
  $('[data-widget-today]',node)?.addEventListener('click',()=>{state.widgetMonths[key]=localISODate().slice(0,7);redraw();});
  const calendar=$('.mini-calendar',node);
  // Apply through CSSOM, like the main calendar: CSP rejects inline style markup.
  if (calendar) calendar.style.setProperty('--calendar-scale',widgetScale(block,settings)/100);
  if (calendar) calendar.addEventListener('wheel',event=>{
    if (!event.ctrlKey) return;
    event.preventDefault(); event.stopPropagation();
    const next=Math.max(40,Math.min(100,Math.round(widgetScale(block,settings)/10)*10+(event.deltaY<0?10:-10)));
    if (state.pageLayoutDraft) {
      const value=state.pageLayoutDraft.value;
      value.blockSettings={...value.blockSettings,[block.key]:{...settings,scale:next}};
      settings.scale=next;
    } else {
      try { localStorage.setItem(widgetScaleKey(block.key),String(next)); } catch (_) { toast('Размер не удалось сохранить',true); }
    }
    calendar.style.setProperty('--calendar-scale',next/100);
  },{passive:false});
}

function mountWorkspaceWidgets(root, catalog, value) {
  const available=workspaceWidgetCatalog(), enabled=new Set(value.widgets || []);
  $$('[data-page-widget]',root).forEach(node=>{ if (!available.some(block=>block.key===node.dataset.pageBlock && enabled.has(block.key))) node.remove(); });
  for (const block of available.filter(block=>enabled.has(block.key))) {
    let node=$(block.selector,root);
    if (!node) { node=document.createElement('section');node.className='workspace-widget';node.dataset.pageWidget=block.key.slice(7);node.dataset.pageBlock=block.key;root.append(node); }
    const settings=value.blockSettings?.[block.key]||{};
    const signature=JSON.stringify([settings,state.widgetMonths?.[pageLayoutKey()+':'+block.key],Boolean(state.personal),state.view==='day'?state.calendarDay:'',Boolean(state.pageLayoutDraft)]);
    if(node.dataset.widgetSignature!==signature) {
      node.innerHTML=renderWorkspaceWidget(block,settings);node.dataset.widgetSignature=signature;
      bindWorkspaceWidget(node,block,settings);
      node.parentElement.pageReorderDraft=null;
    }
    catalog.blocks.push(block);
  }
}

function openWidgetLibrary() {
  const draft=state.pageLayoutDraft;
  if(!draft || state.pageLayoutSaving) return;
  const dialog=$('#workspace-dialog'),content=$('#workspace-dialog-content'),value=draft.value;
  const blocks=workspaceWidgetCatalog();
  content.innerHTML=`<div class="workspace-editor-shell"><header><h2>Добавить блок</h2><button type="button" class="icon-button" data-library-close aria-label="Закрыть">${icon('x')}</button></header><div class="widget-library">${blocks.map(block=>`<button type="button" class="widget-library-item" data-widget-add="${block.key}" ${value.widgets?.includes(block.key)&&!value.hiddenBlocks?.includes(block.key)?'disabled':''}>${icon(block.image)}<strong>${escapeHTML(block.label)}</strong>${icon(value.widgets?.includes(block.key)&&!value.hiddenBlocks?.includes(block.key)?'check':'plus')}</button>`).join('')}</div></div>`;
  $('[data-library-close]',content).addEventListener('click',()=>requestDialogClose(dialog));
  $$('[data-widget-add]',content).forEach(button=>button.addEventListener('click',async()=>{
    if(state.pageLayoutDraft!==draft)return;
    const key=button.dataset.widgetAdd;
    value.widgets=[...new Set([...(value.widgets||[]),key])];
    value.hiddenBlocks=(value.hiddenBlocks||[]).filter(item=>item!==key);
    await requestDialogClose(dialog); $('.page-layout-editor')?.remove(); applyPageLayout();
    $(`[data-page-block="${key}"]`)?.scrollIntoView({block:'center',behavior:'smooth'});
  }));
  openModal(dialog);
}

function pageBlockGeometry(value, block) {
  const settings=value.blockSettings?.[block.key]||{};
  const span=Math.max(2,Math.min(12,Number(value.blockSpans?.[block.key])||block.span||12));
  return {span,column:settings.column ? Math.max(1,Math.min(13-span,settings.column)):0,height:settings.height?Math.max(160,Math.min(1600,settings.height)):0};
}

function applyBlockGeometry(node, block, value) {
  const geometry=pageBlockGeometry(value,block),settings=value.blockSettings?.[block.key]||{};
  node.style.setProperty('--page-block-span',geometry.span);
  node.style.setProperty('--page-block-column',geometry.column||'auto');
  node.style.setProperty('--page-block-height',geometry.height?geometry.height+'px':'auto');
  node.classList.toggle('page-block-fixed-height',Boolean(geometry.height));
  node.classList.toggle('page-block-compact',settings.density==='compact');
}

function openBlockSettings(block) {
  const draft=state.pageLayoutDraft;
  if(!draft || state.pageLayoutSaving)return;
  const value=draft.value,geometry=pageBlockGeometry(value,block),settings=value.blockSettings?.[block.key]||{},desktop=draft.device==='desktop';
  const dialog=$('#workspace-dialog'),content=$('#workspace-dialog-content');
  content.innerHTML=`<form class="workspace-editor-shell block-settings-form"><header><h2>${escapeHTML(block.label)}</h2><button type="button" class="icon-button" data-block-settings-close aria-label="Закрыть">${icon('x')}</button></header><div class="form-grid two">${desktop?`<label>Ширина в колонках<input type="number" name="span" min="2" max="12" value="${geometry.span}"></label><label>Начальная колонка<input type="number" name="column" min="0" max="${13-geometry.span}" value="${geometry.column}"></label>`:''}<label>Высота<input type="number" name="height" min="160" max="1600" step="10" placeholder="По содержимому" value="${geometry.height||''}"></label><label>Плотность<select name="density"><option value="">По умолчанию</option><option value="compact" ${settings.density==='compact'?'selected':''}>Компактная</option><option value="comfortable" ${settings.density==='comfortable'?'selected':''}>Обычная</option></select></label>${block.key.startsWith('widget:')&&block.key!=='widget:calendar'?`<label>Количество записей<input type="number" name="limit" min="1" max="50" value="${settings.limit||6}"></label>`:''}${block.key==='widget:calendar'?`<label>Вид<select name="format"><option value="grid">Сетка</option><option value="circles" ${settings.format==='circles'?'selected':''}>Круги</option></select></label><label>Размер<select name="scale">${[40,50,60,70,80,90,100].map(n=>`<option value="${n}" ${widgetScale(block,settings)===n?'selected':''}>${n}%</option>`).join('')}</select></label>`:''}</div><footer class="form-actions"><button type="submit" class="primary">${icon('check')} Применить</button><button type="button" class="text-button" data-block-size-reset>По умолчанию</button></footer></form>`;
  const form=$('form',content);
  $('[data-block-settings-close]',content).addEventListener('click',()=>requestDialogClose(dialog));
  $('[name=span]',form)?.addEventListener('input',event=>{const column=$('[name=column]',form);column.max=String(13-Number(event.target.value));column.value=String(Math.max(0,Math.min(Number(column.max),Number(column.value))));});
  const finish=async()=> { await requestDialogClose(dialog);applyPageLayout(); };
  form.addEventListener('submit',async event=>{
    event.preventDefault();if(state.pageLayoutDraft!==draft||!form.reportValidity())return;
    const data=new FormData(form);
    if(desktop)value.blockSpans={...value.blockSpans,[block.key]:Number(data.get('span'))};
    value.blockSettings={...value.blockSettings,[block.key]:{...settings,column:desktop?Number(data.get('column')):settings.column||0,height:Number(data.get('height'))||0,density:data.get('density'),limit:Number(data.get('limit'))||settings.limit||0,format:data.get('format')||settings.format||'',scale:Number(data.get('scale'))||settings.scale||0}};
    if (data.has('scale')) { try { localStorage.removeItem(widgetScaleKey(block.key)); } catch (_) {} }
    await finish();
  });
  $('[data-block-size-reset]',form).addEventListener('click',async()=> { if(state.pageLayoutDraft!==draft)return;delete value.blockSettings?.[block.key];delete value.blockSpans?.[block.key];await finish(); });
  openModal(dialog);enhanceSelects(content);
}

function bindBlockResize(node, block) {
  const handle=$('[data-block-resize]',node);
  if(!handle)return;
  let resize=null;
  const update=(span,height)=>{
    const value=state.pageLayoutDraft?.value;if(!value)return;
    value.blockSpans={...value.blockSpans,[block.key]:Math.max(2,Math.min(12,span))};
    value.blockSettings={...value.blockSettings,[block.key]:{...value.blockSettings?.[block.key],height:Math.max(160,Math.min(1600,Math.round(height/10)*10))}};
    applyBlockGeometry(node,block,value);
  };
  handle.addEventListener('pointerdown',event=>{
    if(event.button!==0||state.pageLayoutSaving)return;
    event.preventDefault();event.stopPropagation();
    const value=state.pageLayoutDraft.value,box=node.getBoundingClientRect();
    resize={x:event.clientX,y:event.clientY,width:box.width,height:box.height,geometry:pageBlockGeometry(value,block),spans:structuredClone(value.blockSpans),settings:structuredClone(value.blockSettings),id:event.pointerId};
    node.classList.add('page-block-resizing');handle.setPointerCapture(event.pointerId);
  });
  handle.addEventListener('pointermove',event=>{
    if(!resize||resize.id!==event.pointerId)return;
    const columnWidth=(node.parentElement.clientWidth+18)/12;
    const desktop=state.pageLayoutDraft.device==='desktop'&&innerWidth>820;
    update(desktop?Math.round((resize.width+event.clientX-resize.x+18)/columnWidth):resize.geometry.span,resize.height+event.clientY-resize.y);
  });
  const finish=event=>{
    if(!resize||resize.id!==event.pointerId)return;
    const previous=resize;resize=null;node.classList.remove('page-block-resizing');
    if(handle.hasPointerCapture(event.pointerId))handle.releasePointerCapture(event.pointerId);
    if(event.type==='pointercancel' || event.type==='lostpointercapture') {
      const value=state.pageLayoutDraft.value;
      if(previous.spans===undefined)delete value.blockSpans;else value.blockSpans=previous.spans;
      if(previous.settings===undefined)delete value.blockSettings;else value.blockSettings=previous.settings;
      applyBlockGeometry(node,block,value);
    }
  };
  handle.addEventListener('pointerup',finish);handle.addEventListener('pointercancel',finish);handle.addEventListener('lostpointercapture',finish);
  handle.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;
    event.preventDefault();const current=pageBlockGeometry(state.pageLayoutDraft.value,block),desktop=state.pageLayoutDraft.device==='desktop';
    update(current.span+(desktop?(event.key==='ArrowLeft'?-1:event.key==='ArrowRight'?1:0):0),(current.height||node.clientHeight)+(event.key==='ArrowUp'?-20:event.key==='ArrowDown'?20:0));
  });
}


bootstrap();
