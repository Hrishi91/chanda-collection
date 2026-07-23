// App-shell cache. Bump VERSION on every deploy that changes app files.
const VERSION = 'chanda-v2.0.0';
const ASSETS = [
  './', 'index.html', 'css/style.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/config.js', 'js/i18n.js', 'js/numparse.js', 'js/aggregate.js', 'js/db.js',
  'js/auth.js', 'js/voice.js', 'js/sync.js', 'js/app.js',
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
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).then(function (resp) {
      const copy = resp.clone();
      caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
      return resp;
    });
  }));
});
