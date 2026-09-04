const CACHE = 'tessavie-shell-20260904-habit-snooze-1';
const ASSETS = [
  '/', '/habit-reminders.js?v=20260904-habit-reminders-1', '/app.js?v=20260904-habit-snooze-1', '/styles.css?v=20260904-habit-snooze-1',
  '/reminder-settings.js?v=20260904-habit-reminders-1',
  '/personal-reminders.js?v=20260904-habit-reminders-1',
  '/personal-navigation.js?v=20260904-personal-scope-1',
  '/personal-today.js?v=20260904-personal-day-3',
  '/life-map.js?v=20260904-personal-batch-3', '/personal-publish.js?v=20260904-personal-batch-3',
  '/personal-inbox.js?v=20260904-first-use-4', '/first-use.js?v=20260904-first-use-4',
  '/reading.js?v=20260904-reading-1',
  '/emoji-picker.js?v=20260904-chat-emoji-3', '/vendor/emoji-17.0-cldr48.2.json',
  '/outbox-ui.js?v=20260904-first-use-4', '/offline-outbox.js?v=20260903-offline-outbox-3',
  '/note-media.js?v=20260904-note-media-3',
  '/note-library.js?v=20260904-note-media-3',
  '/bulk-work.js?v=20260904-bulk-actions-3',
  '/habit-tracker.js?v=20260904-habit-snooze-1',
  '/graph-layout-state.js?v=20260903-graph-layouts-1', '/manifest.webmanifest',
  '/vendor/cytoscape-3.34.1.min.js', '/vendor/marked-18.0.9.umd.js', '/vendor/dompurify-3.4.13.min.js',
  '/fonts/Inter-Regular.woff2', '/fonts/Inter-SemiBold.woff2', '/fonts/Inter-Bold.woff2', '/fonts/Onest-Variable.ttf',
  '/brand/tessavie-logo.svg?v=linked-1', '/brand/tessavie-logo-light.svg?v=linked-1',
  '/brand/tessavie-mark.svg?v=linked-1', '/brand/tessavie-192.png?v=linked-1', '/brand/tessavie-512.png?v=linked-1', '/brand/tessavie-maskable-512.png?v=linked-1',
];
const allowed = new Set(ASSETS.slice(1).map(path => new URL(path,self.location.origin).href));
self.addEventListener('install', event => event.waitUntil((async () => {
  const cache = await caches.open(CACHE);
  // Installation is atomic: a failed asset keeps the prior complete shell active.
  await cache.addAll(ASSETS.map(path => new Request(path,{ cache: 'reload', credentials: 'omit' })));
  await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
  for (const name of await caches.keys()) if (name.startsWith('tessavie-shell-') && name !== CACHE) await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
  const request = event.request, url = new URL(request.url);
  if (request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Explicit allowlist excludes all API responses, private files and sessions.
  if (request.mode === 'navigate' && (url.pathname === '/' || url.pathname === '/index.html')) {
    event.respondWith((async () => {
      const controller = new AbortController(), timer = setTimeout(() => controller.abort(),4000);
      try { const response = await fetch(request,{signal:controller.signal}); if (response.ok) return response; throw new Error('shell unavailable'); }
      catch (_) { return (await caches.open(CACHE)).match('/'); }
      finally { clearTimeout(timer); }
    })());
  } else if (allowed.has(url.href)) {
    event.respondWith((async () => (await (await caches.open(CACHE)).match(request)) || fetch(request))());
  }
});
