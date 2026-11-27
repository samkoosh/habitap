/* Habitap service worker: makes the game open fast and survive flaky connections.
   - Page and species list: network first, cached copy if offline (so new dailies always show up).
   - Static files and map data: cached copy first, refreshed in the background.
   - The daily puzzle API is never cached here (the Worker sets its own cache headers). */
const CACHE = 'habitap-v1';
const SHELL = ['./', 'd3.min.js', 'manifest.webmanifest', 'icons/icon.svg', 'icons/icon-192.png'];
const NETWORK_FIRST = /\/(index\.html|species\.json)?$/;
const CACHEABLE_HOSTS = ['cdn.jsdelivr.net', 'unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && !CACHEABLE_HOSTS.includes(url.hostname)) return;

  if (req.mode === 'navigate' || (sameOrigin && NETWORK_FIRST.test(url.pathname))) {
    e.respondWith(fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => caches.match(req).then(r => r || caches.match('./'))));
    return;
  }

  e.respondWith(caches.match(req).then(hit => {
    const fresh = fetch(req).then(res => {
      if (res.ok) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); }
      return res;
    }).catch(() => hit);
    return hit || fresh;
  }));
});
