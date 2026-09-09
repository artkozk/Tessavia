// A private page always belongs to the account's personal workspace.
export function personalRoute(route, workspaces) {
  if (route.view === 'dashboard' && workspaces.some(item=>item.id===route.workspaceId && item.kind==='personal')) route={...route,view:'personal',calendarScope:'personal'};
  // An explicit source switch inside a calendar keeps that calendar's workspace
  // and interface profile. Legacy private links still resolve to personal below.
  if (route.view === 'calendar' && ['personal', 'project'].includes(route.calendarScope) && route.calendarContextWorkspaceId === route.workspaceId && workspaces.some(item => item.id === route.workspaceId)) return { ...route };
  route = { ...route, calendarContextWorkspaceId: '' };
  const privatePage = route.view === 'personal' || ['calendar', 'day'].includes(route.view) && route.calendarScope === 'personal';
  if (!privatePage) return { ...route };
  const workspace = workspaces.find(item => item.kind === 'personal');
  return { ...route, workspaceId: workspace?.id || '', calendarScope: 'personal' };
}
