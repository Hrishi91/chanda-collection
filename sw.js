// App-shell cache. Bump VERSION on every deploy that changes app files.
const VERSION = 'chanda-v4.34.7';
// A55: SHELL is what the app cannot run without. EXTRAS is everything else.
//
// They used to be one all-or-nothing list, and the two icons are 456 KB of it —
// 44% of the download, needed by no offline screen. One flaky fetch on a pandal
// network aborted the WHOLE precache, and nothing ever asked whether it had
// worked, so a collector could walk around all evening believing the app worked
// offline when it had never cached a byte.
const SHELL = [
  './', 'index.html', 'css/style.css',
  'js/i18n.js', 'js/numparse.js', 'js/aggregate.js', 'js/db.js',
  'js/auth.js', 'js/help.js', 'js/voice.js', 'js/sync.js', 'js/lists.js', 'js/app.js',
];
const EXTRAS = ['manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
                // A66: iOS fetches this at Add-to-Home-Screen time; caching it
                // costs 48 KB and means the icon appears even on a bad line
                'icons/apple-touch-icon.png',
                // A96: config.js used to be left out of the precache on the
                // theory that a copy stored at install could go stale. It
                // cannot — the fetch handler below serves it network-first with
                // no-store, so while there is a network the cached copy is
                // never the one that answers, and `cache: 'reload'` means the
                // install fetch itself comes from the origin.
                //
                // What leaving it out actually cost: on the very FIRST visit
                // the page fetches config.js BEFORE the worker controls the
                // page, so nothing caches it. A collector who installs, logs
                // in, then reloads offline before ever loading online again has
                // an app with no SCRIPT_URL — and the app tells them "this
                // phone was never paired with the central book, tell admin",
                // which is both false and alarming. Their entries were safe the
                // whole time. EXTRAS, not SHELL: a config that will not
                // download must not cost them the offline app either.
                'js/config.js'];

// A28: `cache.addAll(urls)` fetches through the browser's HTTP cache, and
// GitHub Pages says `max-age=600` on every file. So a phone that had opened the
// app within the last 10 minutes could fill the BRAND-NEW cache with the OLD
// js — the version bump gets spent on stale content, and nothing tries again
// until the NEXT deploy. That is exactly how a device ends up reporting the new
// version while running yesterday's code.
// `cache: 'reload'` bypasses the HTTP cache for these fetches, so an install
// always stores what the server has right now.
self.addEventListener('install', function (e) {
  var get = function (c, u) {
    return fetch(new Request(u, { cache: 'reload' })).then(function (r) {
      if (!r.ok) throw new Error('asset ' + u + ' ' + r.status);
      return c.put(u, r);
    });
  };
  e.waitUntil(caches.open(VERSION).then(function (c) {
    // the shell is still all-or-nothing on purpose: half a shell is a blank app
    return Promise.all(SHELL.map(function (u) { return get(c, u); })).then(function () {
      // …the extras are not. An icon that will not download must never cost the
      // collector their offline app.
      return Promise.all(EXTRAS.map(function (u) { return get(c, u).catch(function () {}); }));
    });
  }).then(function () { return self.skipWaiting(); }));
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
    // A55: `.catch` only fires on a HARD failure. The characteristic pandal
    // network completes TCP and TLS and then goes quiet — the browser will sit
    // on that for 30–120 s showing a white screen, with a perfectly good cached
    // shell one line away. Race the network against a 4 s timer and take
    // whichever answers first.
    e.respondWith(new Promise(function (resolve) {
      var settled = false;
      // A73 (audit #5 V13): `if (!settled && r)` was the bug. When
      // caches.match('./') resolves UNDEFINED — an evicted entry, which is
      // ordinary on the low-storage Androids this exists for, or a cache that
      // never filled — `r` is falsy, nothing resolves, and respondWith hangs
      // FOREVER on a white screen.
      //
      // Before A55 a cache miss simply rejected and the browser painted its own
      // offline page at once. So the 30–120 s white screen A55 was written to
      // remove became an unbounded one, in exactly the population A55 protects.
      // The guard has to be on `settled` alone; a network error is a real,
      // final answer and the browser knows what to do with it.
      var done = function (r) {
        if (settled) return;
        settled = true;
        resolve(r || Response.error());
      };
      var fallback = function () {
        caches.match('./').then(done).catch(function () { done(null); });
      };
      var timer = setTimeout(fallback, 4000);
      // the late fetch is DISCARDED, not merged — the earlier comment claimed
      // it "refreshes", and it does not
      fetch(e.request).then(function (r) { clearTimeout(timer); done(r); })
        .catch(function () { clearTimeout(timer); fallback(); });
    }));
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

// A31: answer "which version are you?" so the app can print the version it is
// REALLY running and warn when the worker is holding a different one. The cache
// name alone could not tell those apart, which made a stuck update look fine.
self.addEventListener('message', function (e) {
  if (e.data && e.data.q === 'version' && e.ports && e.ports[0]) e.ports[0].postMessage(VERSION);
});
