// App-shell cache. Bump VERSION on every deploy that changes app files.
const VERSION = 'chanda-v3.44.0';
// config.js is intentionally NOT precached — it carries the live backend URL
// and is served network-first (no-store) by the fetch handler so it can never
// be stale. Precaching it here would risk baking in a stale copy at install.
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/i18n.js', 'js/numparse.js', 'js/aggregate.js', 'js/db.js',
  'js/auth.js', 'js/help.js', 'js/voice.js', 'js/sync.js', 'js/lists.js', 'js/app.js',
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(ASSETS); })
    .then(function () { return self.skipWaiting(); }));
});
self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; })
      .map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return; // sync POSTs go straight to network
  const url = new URL(e.request.url);
  if (url.origin !== location.origin) return; // Apps Script GET etc.
  // network-first for navigation (fresh app), cache-first for assets
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).catch(function () { return caches.match('./'); }));
    return;
  }
  // config.js carries the live backend URL — never serve it stale. Network-
  // first (refresh the cache on success) so a device that cached an older
  // config can't get stuck on an empty SCRIPT_URL; falls back to cache offline.
  if (url.pathname.endsWith('/config.js') || url.pathname.endsWith('js/config.js')) {
    // no-store: bypass the browser HTTP cache too (GitHub Pages sends
    // max-age=600), otherwise "network-first" would still hand back a stale
    // config from disk cache for up to 10 min. Always hit the origin online.
    e.respondWith(fetch(e.request, { cache: 'no-store' }).then(function (resp) {
      const copy = resp.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return resp;
    }).catch(function () { return caches.match(e.request); }));
    return;
  }
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (resp) {
      const copy = resp.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return resp;
    });
  }));
});
