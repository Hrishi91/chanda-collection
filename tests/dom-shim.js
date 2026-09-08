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

// A282: enough of a query engine to press a button.
//
// The shim captures innerHTML rather than parsing it, which held every RENDER
// survivor and no WIRING one — a bulk handler that went back to handing out
// every report could not be caught, and that handler was the actual bug. So the
// painted HTML is scanned for TAGS and their attributes: no tree, no text
// nodes, no CSS cascade, just "which elements are in here and what are they
// marked with", which is what `[data-x]` wiring needs.
//
// Unsupported selectors THROW. A query engine that quietly answers "nothing" to
// a selector it does not understand is a harness that reports every wiring test
// as passing.
const VOID = { INPUT: 1, BR: 1, IMG: 1, HR: 1, META: 1, LINK: 1, OPTION: 0 };
// The scan is MEMOISED per (owner, html). Wiring attaches `onclick` to the
// element a query returned, so a query that builds fresh stubs every time hands
// the handler to an object nobody will ever see again — the buttons look wired
// and no test can press one. Same HTML, same objects; a repaint changes the HTML
// and the memo falls away with it.
function scanCached(owner, html, doc) {
  if (owner && owner.__scanFor === html) return owner.__scan;
  const list = scanTags(html, doc);
  if (owner) { owner.__scanFor = html; owner.__scan = list; }
  return list;
}
function scanTags(html, doc) {
  const out = [];
  const TAG = /<([a-zA-Z][\w-]*)((?:\s+[\w-]+(?:="[^"]*")?)*)\s*\/?>/g;
  let m;
  while ((m = TAG.exec(html))) {
    const tag = m[1].toUpperCase(), attrs = {};
    const A = /([\w-]+)(?:="([^"]*)")?/g;
    let a;
    while ((a = A.exec(m[2]))) { if (a[1]) attrs[a[1].toLowerCase()] = a[2] === undefined ? '' : a[2]; }
    const e = el(attrs.id || '', doc);
    e.tagName = tag;
    e.className = attrs['class'] || '';
    e.disabled = 'disabled' in attrs;
    e.hidden = 'hidden' in attrs;
    if ('value' in attrs) e.value = attrs.value;
    e.__attrs = attrs;
    // …and what is INSIDE it, so `b.querySelector('span')` finds the span the way
    // it does in a browser. Matching close tag, counting same-name nesting; void
    // elements have none. Without this, paintNav's
    // `b.querySelector('span').textContent = …` threw on null and every screen
    // test died — a query engine that finds an element but not its contents is
    // worse than one that finds nothing, because the first looks like it works.
    if (!VOID[tag] && m[0].charAt(m[0].length - 2) !== '/') {
      const openRe = new RegExp('<' + m[1] + '(?=[\\s>/])', 'gi');
      const closeRe = new RegExp('</' + m[1] + '\\s*>', 'gi');
      let depth = 1, at = m.index + m[0].length, end = -1;
      while (depth > 0) {
        closeRe.lastIndex = at; openRe.lastIndex = at;
        const c = closeRe.exec(html);
        if (!c) break;
        const o = openRe.exec(html);
        if (o && o.index < c.index) { depth++; at = o.index + 1; continue; }
        depth--; at = c.index + c[0].length;
        if (depth === 0) end = c.index;
      }
      if (end >= 0) e.__html = html.slice(m.index + m[0].length, end);
    }
    Object.keys(attrs).forEach(function (k) {
      if (k.indexOf('data-') !== 0) return;
      const camel = k.slice(5).replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
      e.dataset[camel] = attrs[k];
    });
    out.push(e);
  }
  return out;
}
function matchSel(e, sel) {
  const s = String(sel).trim();
  // "#id tag" / "#id [data-x]" — the descendant form this app uses for its nav
  const sp = s.split(/\s+/);
  const last = sp[sp.length - 1];
  const bracket = last.match(/^\[([\w-]+)(?:="([^"]*)")?\]$/);
  if (bracket) {
    const v = e.__attrs ? e.__attrs[bracket[1].toLowerCase()] : undefined;
    if (v === undefined) return false;
    return bracket[2] === undefined ? true : v === bracket[2];
  }
  if (last.charAt(0) === '#') return e.id === last.slice(1);
  if (last.charAt(0) === '.') return (' ' + e.className + ' ').indexOf(' ' + last.slice(1) + ' ') >= 0;
  if (/^[a-zA-Z][\w-]*$/.test(last)) return e.tagName === last.toUpperCase();
  throw new Error('dom-shim: selector not supported — ' + s +
    ' (add it rather than letting a wiring test pass on an empty answer)');
}

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
  e.querySelectorAll = function (sel) {
    return scanCached(e, e.__html || '', doc).filter(function (x) { return matchSel(x, sel); });
  };
  e.querySelector = function (sel) { return e.querySelectorAll(sel)[0] || null; };
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
    // the document searches everything painted so far, newest paint per element
    querySelectorAll: function (sel) {
      // A descendant selector SCOPES the search — `#bottomnav button` means the
      // buttons inside #bottomnav, not every button on the phone. Ignoring the
      // prefix matched buttons from other screens, handed paintNav one with no
      // <span> in it, and threw. Honour the scope; a selector whose scope has
      // painted nothing correctly answers nothing.
      const parts = String(sel).trim().split(/\s+/);
      const out = [];
      if (parts.length > 1 && parts[0].charAt(0) === '#') {
        const root = byId[parts[0].slice(1)];
        if (!root) return out;
        scanCached(root, root.__html || '', doc).forEach(function (x) {
          if (matchSel(x, parts.slice(1).join(' '))) out.push(x);
        });
        return out;
      }
      Object.keys(byId).forEach(function (k) {
        scanCached(byId[k], byId[k].__html || '', doc).forEach(function (x) {
          if (matchSel(x, sel)) out.push(x);
        });
      });
      return out;
    },
    querySelector: function (sel) { return doc.querySelectorAll(sel)[0] || null; },
    createElement: function (tag) {
      const e = el('', doc);
      e.tagName = String(tag || 'div').toUpperCase();
      // A279: finishing an entry builds the donor's RECEIPT on a canvas, so a
      // flow test that reaches the end walks straight into getContext(). This
      // measures and draws nothing — a receipt's PIXELS are the browser's
      // business; what a test here holds is that the flow got that far.
      if (e.tagName === 'CANVAS') {
        e.width = 0; e.height = 0;
        e.getContext = function () {
          const noop = function () {};
          return { fillRect: noop, strokeRect: noop, clearRect: noop, fillText: noop,
            strokeText: noop, beginPath: noop, closePath: noop, moveTo: noop, lineTo: noop,
            arc: noop, rect: noop, fill: noop, stroke: noop, save: noop, restore: noop,
            translate: noop, rotate: noop, scale: noop, clip: noop, drawImage: noop,
            setLineDash: noop, createLinearGradient: function () { return { addColorStop: noop }; },
            measureText: function (t) { return { width: String(t || '').length * 6 }; },
            font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textAlign: 'left',
            textBaseline: 'alphabetic', globalAlpha: 1 };
        };
        e.toDataURL = function () { return 'data:image/png;base64,'; };
        e.toBlob = function (cb) { if (cb) cb(null); };
      }
      return e;
    },
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
  // a logo may be loaded before a receipt is drawn; nothing here has one, so
  // the load never fires and the receipt resolves without it, exactly as offline
  box.Image = function () { this.onload = null; this.onerror = null; this.src = ''; };
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
      // `reply` may be an object (every call answers it) or a function. A
      // function that returns nothing means NO ANSWER for that action — which
      // is how a test opens the admin panel without also handing `pull` an
      // instant reply and re-arming the render loop above.
      const r = typeof o.reply === 'function' ? o.reply(action, payload) : o.reply;
      if (r) return Promise.resolve(r);
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
               " t: t, canEntry: canEntry, frozen: frozen," +
               // A279: the guided flow. It is the one part of this file that is a
               // STATE MACHINE rather than a paint, so a test has to be able to
               // answer a question and see the next one — startFlow, submitAnswer,
               // goBack, and the flow builders that make the definitions.
               " startFlow: startFlow, submitAnswer: submitAnswer, submitSheet: submitSheet, goBack: goBack," +
               " newPartyFlow: newPartyFlow, paymentFlow: paymentFlow, dailyFlow: dailyFlow," +
               " expenseFlow: expenseFlow, collectionExpenseFlow: collectionExpenseFlow," +
               " handoverFlow: handoverFlow, transferFlow: transferFlow, dutyFlow: dutyFlow," +
               " flow: function () { return flowState; }, admGo: admGo };\n";
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
      // Wait for painting to SETTLE, not for the first paint. A screen paints a
      // shell and then fills its parts — the report writes "আসছে…" into
      // #my-summary and replaces it a promise later — so stopping at the first
      // repaint reads a loading state and calls it a screen.
      let n = 0, quiet = 0, seen = doc.__painted.length;
      const wait = function () {
        if (++n > 60) return Promise.resolve();
        if (doc.__painted.length !== seen) { seen = doc.__painted.length; quiet = 0; }
        else if (n > 3) quiet++;
        if (quiet >= 4) return Promise.resolve();
        return turn().then(wait);
      };
      return wait().then(function () { return doc.__byId.view ? doc.__byId.view.innerHTML : ''; });
    },
  };
}

module.exports = { loadApp: loadApp, makeDocument: makeDocument };
