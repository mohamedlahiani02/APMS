/* Only the public offline notice is cached. Business data always uses the network. */
const CACHE = 'apms-offline-v1';
const OFFLINE = '/offline.html';
self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.add(new Request(OFFLINE, { cache: 'reload' }))));
});
self.addEventListener('activate', event => {
  event.waitUntil(Promise.all([
    caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('apms-offline-') && key !== CACHE).map(key => caches.delete(key)))),
    self.clients.claim(),
  ]));
});
self.addEventListener('message', event => {
  if (event.data?.type === 'ACTIVATE_UPDATE') self.skipWaiting();
});
self.addEventListener('fetch', event => {
  const request = event.request;
  const url = new URL(request.url);
  // Never intercept API, export, mutation, RSC, or cross-origin requests.
  if (request.method !== 'GET' || request.mode !== 'navigate' || url.origin !== self.location.origin ||
      url.pathname === '/api' || url.pathname.startsWith('/api/') ||
      url.pathname === '/internal' || url.pathname.startsWith('/internal/')) return;
  event.respondWith(fetch(request).catch(async () =>
    (await caches.match(OFFLINE, { cacheName: CACHE })) || new Response('Connexion indisponible. Veuillez réessayer.', { status: 503, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  ));
});
