// Built-in personal pages share data, but have independent routes and layouts.
export function personalNavigationItems() {
  return [
    ['personal', 'Сегодня', 'lock', true],
    ['calendar', 'Календарь', 'calendar', true],
    ['personal:plans', 'Дела', 'checkSquare', true],
    ['personal:habits', 'Привычки', 'rotate', true],
    ['personal:finance', 'Финансы', 'scale', false],
    ['personal:inbox', 'Входящие', 'inbox', false],
    ['personal:notes', 'Заметки', 'edit', false],
    ['personal:projects', 'Личные проекты', 'folder', false],
    ['personal:goals', 'Цели', 'target', false],
    ['personal:waiting', 'Ожидания', 'clock', false],
    ['personal:review', 'Обзор недели', 'history', false],
    ['personal:life', 'Карта времени', 'calendar', false],
  ].map(([key, label, iconName, defaultVisible]) => ({ key, label, iconName, defaultVisible, group: 'Личное' }));
}

export function personalNavigationKey(tab) {
  const key = `personal:${tab}`;
  return personalNavigationItems().some(item => item.key === key) ? key : 'personal';
}

export function navigationItemVisible(item, preferences = {}) {
  if (preferences.hiddenNavItems?.includes(item.key) || preferences.hiddenNavGroups?.includes(item.group)) return false;
  // Once saved, the complete order represents the user's explicit selection.
  return item.defaultVisible !== false || preferences.navOrder?.includes(item.key) === true;
}

export function navigationOrderWithInactive(previous = [], selected = []) {
  const order = [...new Set(selected)];
  // Keep an archived page's slot for its later restoration.
  previous.forEach((key, index) => { if (!order.includes(key)) order.splice(Math.min(index, order.length), 0, key); });
  return order;
}

export function personalNavigationTarget(view, options = {}) {
  if (view.startsWith('personal:')) {
    const key = personalNavigationKey(view.slice(9));
    return { view: 'personal', personalTab: key === 'personal' ? 'today' : key.slice(9) };
  }
  if (view === 'personal') {
    const key = personalNavigationKey(options.personalTab);
    return { view, personalTab: key === 'personal' ? 'today' : key.slice(9) };
  }
  return { view };
}

// A private page always belongs to the account's personal workspace.
export function personalRoute(route, workspaces) {
  route = { ...route, ...personalNavigationTarget(route.view, route) };
  if (route.view === 'dashboard' && workspaces.some(item=>item.id===route.workspaceId && item.kind==='personal')) route={...route,view:'personal',personalTab:'today',calendarScope:'personal'};
  if (route.view === 'finance' && workspaces.some(item => item.id === route.workspaceId && item.kind === 'personal')) route = {...route, view:'personal', personalTab:'finance'};
  // An explicit source switch inside a calendar keeps that calendar's workspace
  // and interface profile. Legacy private links still resolve to personal below.
  if (route.view === 'calendar' && ['personal', 'project'].includes(route.calendarScope) && route.calendarContextWorkspaceId === route.workspaceId && workspaces.some(item => item.id === route.workspaceId)) return { ...route };
  route = { ...route, calendarContextWorkspaceId: '' };
  const privatePage = route.view === 'personal' || ['calendar', 'day'].includes(route.view) && route.calendarScope === 'personal';
  if (!privatePage) return { ...route };
  const workspace = workspaces.find(item => item.kind === 'personal');
  return { ...route, workspaceId: workspace?.id || '', calendarScope: 'personal' };
}
