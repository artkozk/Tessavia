// A private page always belongs to the account's personal workspace.
export function personalRoute(route, workspaces) {
  const privatePage = route.view === 'personal' || ['calendar', 'day'].includes(route.view) && route.calendarScope === 'personal';
  if (!privatePage) return { ...route };
  const workspace = workspaces.find(item => item.kind === 'personal');
  return { ...route, workspaceId: workspace?.id || '', calendarScope: 'personal' };
}
