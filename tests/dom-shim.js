// A277 — run js/app.js.
//
// The full survey said what nothing else could: 288 of 352 mutations of that
// file survive, and 66 of the 72 things that ever "caught" one were a regex over
// its source text. The remaining survivors are the DRAWING — which sentence
// appears, which class is set, which row is shown — and there is exactly one way
// to hold that: build the screen and read what it says.
//
// No jsdom, and no package.json: this repo is a no-build-step PWA and adding a
// dependency is not a test's decision to make. The DOM surface app.js actually
// uses is small and countable — 9 document APIs, ~26 element ones, and the
// weight is all in getElementById / innerHTML / dataset / onclick — so the shim
// is written by hand here, the same way tests/gas-shim.js and tests/idb-shim.js
// already stand in for Apps Script and IndexedDB.
//
// WHAT THIS DOES NOT DO, said plainly so nobody reads more into a green run than
// is there: innerHTML is CAPTURED, not parsed. There is no element tree, so
// querySelectorAll after a paint answers empty and wiring cannot be driven from
// here. What is tested is what the screen SAYS — which is where the survivors
// live. Anything that depends on a real tree stays the browser's job.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { fakeIndexedDB } = require('./idb-shim.js');

function el(id, doc) {
  const e = {
    id: id || '', tagName: 'DIV', isConnected: true, hidden: false, disabled: false,
    value: '', textContent: '', checked: false,
    dataset: {}, style: {}, files: null, parentNode: null, children: [],
    onclick: null, oninput: null, onchange: null, onkeydown: null, onsubmit: null,
    __html: '',
  };
  const set = {};
  e.classList = {
    add: function () { for (let i = 0; i < arguments.length; i++) set[arguments[i]] = 1; },
    remove: function () { for (let i = 0; i < arguments.length; i++) delete set[arguments[i]]; },
    contains: function (c) { return !!set[c]; },
    toggle: function (c, on) {
      const want = arguments.length > 1 ? !!on : !set[c];
      if (want) set[c] = 1; else delete set[c];
      return want;
    },
    __all: function () { return Object.keys(set); },
  };
  Object.defineProperty(e, 'innerHTML', {
    get: function () { return e.__html; },
    set: function (v) { e.__html = String(v); if (doc) doc.__painted.push({ id: e.id, html: e.__html }); },
  });
  e.querySelector = function () { return el('', doc); };
  e.querySelectorAll = function () { return []; };
  e.addEventListener = function () {};
  e.removeEventListener = function () {};
  e.setAttribute = function (k, v) { e[k] = v; };
  e.getAttribute = function (k) { return k in e ? e[k] : null; };
  e.removeAttribute = function (k) { delete e[k]; };
  e.closest = function () { return null; };
  e.matches = function () { return false; };
  e.appendChild = function (c) { e.children.push(c); return c; };
  e.remove = function () { e.isConnected = false; };
  e.focus = function () {}; e.blur = function () {}; e.click = function () {};
  e.select = function () {}; e.scrollIntoView = function () {};
  e.getBoundingClientRect = function () { return { top: 0, bottom: 0, height: 0, width: 0 }; };
  return e;
}

function makeDocument() {
  const byId = {};
  const doc = {
    __painted: [],            // every innerHTML assignment, in order
    title: '',
    hidden: false,
    activeElement: null,
    // DOMContentLoaded is RECORDED and never fired: app.js boots inside it, and
    // a harness that boots is a harness that starts polling, pulling and
    // navigating before a test has said anything.
    __ready: [],
    addEventListener: function (name, fn) { if (name === 'DOMContentLoaded') doc.__ready.push(fn); },
    removeEventListener: function () {},
    getElementById: function (id) { return byId[id] || (byId[id] = el(id, doc)); },
    querySelector: function () { return el('', doc); },
    querySelectorAll: function () { return []; },
    createElement: function (tag) { const e = el('', doc); e.tagName = String(tag || 'div').toUpperCase(); return e; },
    __el: function (id) { return byId[id]; },
    __byId: byId,
  };
  doc.body = el('body', doc);
  doc.documentElement = el('html', doc);
  return doc;
}

// `opts`:
//   user       the logged-in user object (Auth.current); null = logged out
//   settings   ck_* values Settings.get should answer with
//   central    the server snapshot (setCentral) — parties/payments/daily/…
//   local      rows to put in the local DB, as { store: [rows] }
//   lists      what Lists.get(kind) answers with
//   config     centralConfig-ish values the app reads through pullCentral
// Returns { app, doc, painted(), html(id), box, DB, calls }.
function loadApp(opts) {
  const o = opts || {};
  // Settings reads INDIVIDUAL `ck_<name>` keys, not one blob — a trap this repo
  // has written down twice and walked into twice. `settings` is given in plain
  // names here and prefixed on the way in, so a test cannot get it wrong.
  const store = {};
  const plain = Object.assign({
    year: '2026', lang: 'bn',
    collectorUsername: o.user ? o.user.username : '',
    collectorName: o.user ? (o.user.name || o.user.username) : '',
    collectorRole: o.user ? (o.user.role === 'admin' ? 'admin' : (o.user.cashier === 1 ? 'cashier' : 'collector')) : '',
  }, o.settings || {});
  Object.keys(plain).forEach(function (k) { store['ck_' + k] = String(plain[k]); });
  // The snapshot goes in the way a PHONE holds it — ck_central plus
  // ck_central_year — not by reaching for setCentral(). js/app.js discards the
  // cache on the first pull whenever centralYear disagrees with the year
  // (A75's guard, and it is right), so a snapshot injected through the setter
  // vanished the moment anything pulled, and every screen painted empty while
  // looking like it worked.
  if (o.central) {
    store.ck_central = JSON.stringify(o.central);
    store.ck_central_year = String(plain.year);
  }
  const doc = makeDocument();
  const calls = [];
  const box = {
    document: doc,
    indexedDB: fakeIndexedDB(),
    localStorage: {
      getItem: function (k) { return (k in store) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    },
    crypto: { randomUUID: function () { box.__n = (box.__n || 0) + 1; return 'uuid-' + box.__n; } },
    navigator: { onLine: o.online === undefined ? true : !!o.online, userAgent: 'test' },
    location: { href: 'http://localhost/', reload: function () { calls.push(['reload']); } },
    history: { pushState: function () {}, replaceState: function () {}, state: null },
    CONFIG: { SCRIPT_URL: 'https://example.invalid/exec' },
    CustomEvent: function (n, d) { this.type = n; this.detail = d && d.detail; },
    setTimeout: function () { return 0; },   // no background work in a harness
    clearTimeout: function () {},
    setInterval: function () { return 0; },
    clearInterval: function () {},
    requestAnimationFrame: function (f) { f(); return 0; },
    alert: function (m) { calls.push(['alert', String(m)]); },
    confirm: function (m) { calls.push(['confirm', String(m)]); return true; },
    prompt: function () { return null; },
    scrollTo: function () {},
    fetch: function () { return Promise.reject(new Error('network')); },
    console: console,
    JSON: JSON, Math: Math, Number: Number, String: String, Date: Date, Array: Array,
    Object: Object, Promise: Promise, RegExp: RegExp, Error: Error, isNaN: isNaN,
    parseInt: parseInt, parseFloat: parseFloat, encodeURIComponent: encodeURIComponent,
    decodeURIComponent: decodeURIComponent, Intl: typeof Intl !== 'undefined' ? Intl : undefined,
  };
  box.window = box;
  box.self = box;
  box.window.addEventListener = function () {};
  box.window.removeEventListener = function () {};
  box.window.scrollY = 0;
  vm.createContext(box);
  const read = function (f) { return fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'); };

  // `const DB = (function(){…})()` is a top-level const, and a top-level const
  // does NOT land on a vm context's global — so the first version of this shim
  // ran js/app.js with DB undefined and still painted a screen, because the
  // pre-data half of renderList draws before viewData() is ever called. A
  // harness that paints something is not a harness that works. Hand it out
  // explicitly and then check it is there.
  vm.runInContext(read('db.js') + '\n;globalThis.DB = DB;', box);   // DB + Settings
  vm.runInContext(read('i18n.js'), box);        // t / tBn / fmtMoney / I18N
  vm.runInContext(read('numparse.js'), box);
  vm.runInContext(read('aggregate.js'), box);
  box.Aggregate = box.Aggregate || box.window.Aggregate;
  ['DB', 'Settings', 'Aggregate', 'NumParse', 't', 'fmtMoney'].forEach(function (n) {
    if (!box[n]) throw new Error('dom-shim: ' + n + ' never reached the context');
  });

  box.Auth = {
    APP_VERSION: 'chanda-test', APP_SCHEMA: 5,
    current: function () { return o.user || null; },
    token: function () { return o.user ? 'tok' : ''; },
    loggedIn: function () { return !!o.user; },
    isAdmin: function () { return !!o.user && o.user.role === 'admin'; },
    isCashier: function () { return !!o.user && (o.user.cashier === 1 || o.user.role === 'admin'); },
    schemaCmp: function () { return 0; },
    versionCmp: function () { return 0; },
    serverVersion: function () { return 'chanda-test'; },
    // A server that answers INSTANTLY is not a fast server, it is a feedback
    // loop: pullCentral().then(…render()) and applyNotifications(…render())
    // both repaint on an answer, and a render that triggers a pull that answers
    // in zero time re-renders for ever. In a browser the round trip is a
    // macrotask measured in seconds; here it starved the event loop and ate two
    // gigabytes in six seconds.
    //
    // The default is therefore NO NETWORK, which is also the honest default for
    // an offline-first app: every screen must paint from the local snapshot.
    // A test that wants an answer passes `reply`.
    call: function (action, payload) {
      calls.push([action, payload]);
      if (o.reply) return Promise.resolve(typeof o.reply === 'function' ? o.reply(action, payload) : o.reply);
      return Promise.reject(new Error('network'));
    },
    logout: function () { calls.push(['logout']); },
  };
  box.Sync = {
    configured: function () { return true; },
    busy: function () { return false; },
    syncNow: function () { return Promise.resolve({ ok: true, sent: 0 }); },
    pendingCount: function () { return Promise.resolve(0); },
  };
  const lists = Object.assign({ area: [], location: [], position: [], subject: [] }, o.lists || {});
  box.Lists = {
    get: function (k) { return lists[k] || []; },
    labelOf: function (k, id) {
      const it = (lists[k] || []).filter(function (x) { return x.id === id; })[0];
      return it ? (it.nameBn || it.nameEn || id) : id;
    },
    itemOf: function (k, id) { return (lists[k] || []).filter(function (x) { return x.id === id; })[0] || null; },
    permsOf: function (id) { const i = this.itemOf('position', id); return String((i && i.perms) || '').split(',').filter(Boolean); },
    maxOf: function (id) { const i = this.itemOf('position', id); return Math.max(0, Number(i && i.maxCount) || 0); },
    levelOf: function (id) { const i = this.itemOf('position', id); return Math.max(0, Number(i && i.level) || 0); },
    isFull: function () { return false; },
    maxMap: function () { return {}; },
    refresh: function () { return Promise.resolve(); },
  };
  box.Voice = { supported: function () { return false; }, start: function () { return null; }, stop: function () {} };
  box.Help = { sectionFor: function () { return ''; }, html: function () { return ''; } };

  // The shim reaches INTO the IIFE, because js/app.js exports nothing: the hook
  // goes in just before the closing `})();`, so module-locals are in scope. If
  // that ending ever changes this throws rather than silently testing nothing.
  const src = read('app.js');
  const end = '\n})();';
  const cut = src.lastIndexOf(end);
  if (cut < 0) throw new Error('dom-shim: js/app.js no longer ends with the IIFE close it is patched at');
  const hook = "\n  globalThis.__app = { render: render, navigate: navigate, setCentral: setCentral," +
               " viewData: viewData, current: function () { return current; }," +
               " t: t, canEntry: canEntry, frozen: frozen };\n";
  vm.runInContext(src.slice(0, cut) + hook + src.slice(cut), box);
  if (!box.__app) throw new Error('dom-shim: the hook did not land');

  const DB = box.DB;
  const seed = o.local || {};
  const ready = Promise.all(Object.keys(seed).map(function (s) {
    return Promise.all((seed[s] || []).map(function (r) { return DB.put(s, r); }));
  }));

  return {
    ready: ready,
    app: box.__app,
    doc: doc, box: box, DB: DB, calls: calls, store: store,
    // the last thing painted into #view, which is the screen under test
    html: function (id) {
      const e = doc.__byId[id || 'view'];
      return e ? e.innerHTML : '';
    },
    painted: function () { return doc.__painted; },
    // Paint a screen and wait for the data promise behind it to settle.
    //
    // Real event-loop turns, from the HOST realm — not a chain of microtasks.
    // The first version spun 40 microtasks and always read the PRE-data paint,
    // because js/db.js resolves through the fake IndexedDB's own queue and the
    // screen's second innerHTML lands a macrotask later. It looked like a
    // working harness and was measuring the loading state.
    show: function (view, params) {
      box.__app.navigate(view, params);
      const turn = function () { return new Promise(function (r) { setImmediate(r); }); };
      let n = 0;
      const before = doc.__painted.length;
      const wait = function () {
        if (++n > 30) return Promise.resolve();
        // stop as soon as the screen has painted again AND settled for a turn
        if (doc.__painted.length > before && n > 3) return Promise.resolve();
        return turn().then(wait);
      };
      return wait().then(function () { return doc.__byId.view ? doc.__byId.view.innerHTML : ''; });
    },
  };
}

module.exports = { loadApp: loadApp, makeDocument: makeDocument };
