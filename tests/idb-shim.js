// The smallest IndexedDB js/db.js cannot tell from the real one, so the offline
// queue can be DRIVEN by a test instead of only read as text. Sibling of
// gas-shim.js, which does the same job for the Apps Script runtime.
//
// It is deliberately not a general IndexedDB: it implements exactly the calls
// db.js makes (open/onupgradeneeded, transaction → objectStore, put, delete,
// getAll, get, clear, objectStoreNames.contains, createObjectStore) and nothing
// else. A shim that guessed at more would be a second implementation to keep
// honest, and this file has no tests of its own.
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function fakeIndexedDB() {
  const dbs = {};
  const fire = function (obj, ev) { const h = obj['on' + ev]; if (h) h({ target: obj }); };
  const later = function (fn) { return Promise.resolve().then(fn); };
  const wrap = function (db) {
    return {
      objectStoreNames: { contains: function (s) { return !!db.stores[s]; } },
      createObjectStore: function (s) { db.stores[s] = {}; return {}; },
      transaction: function (name) {
        const t = { oncomplete: null, onerror: null, error: null };
        const rows = db.stores[name];
        // an unknown store must fail the way the real one does, not silently
        if (!rows) later(function () { t.error = new Error('NotFoundError: ' + name); fire(t, 'error'); });
        const os = {
          // stored by value, like the real thing — a caller mutating the object
          // it handed in must not reach back into the database
          put: function (o) { rows[o.id] = JSON.parse(JSON.stringify(o)); },
          delete: function (id) { delete rows[id]; },
          clear: function () {
            const r = { result: undefined };
            Object.keys(rows).forEach(function (k) { delete rows[k]; });
            later(function () { fire(r, 'success'); });
            return r;
          },
          getAll: function () {
            const r = { result: null };
            later(function () {
              r.result = Object.keys(rows).map(function (k) { return rows[k]; });
              fire(r, 'success');
            });
            return r;
          },
          get: function (id) {
            const r = { result: null };
            later(function () { r.result = rows[id]; fire(r, 'success'); });
            return r;
          },
        };
        t.objectStore = function () { return os; };
        if (rows) later(function () { later(function () { fire(t, 'complete'); }); });
        return t;
      },
    };
  };
  return {
    open: function (name, ver) {
      const req = { result: null, error: null };
      later(function () {
        let db = dbs[name];
        if (!db) db = dbs[name] = { name: name, version: 0, stores: {} };
        req.result = wrap(db);
        if (db.version < ver) { db.version = ver; fire(req, 'upgradeneeded'); }
        fire(req, 'success');
      });
      return req;
    },
  };
}

// Load js/db.js into a fresh context with an empty database. `settings` seeds
// localStorage (the ck_* keys Settings reads). Returns { DB, Settings, store }.
function loadDB(settings) {
  const store = Object.assign({}, settings || {});
  const box = {
    indexedDB: fakeIndexedDB(),
    localStorage: {
      getItem: function (k) { return (k in store) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    },
    crypto: { randomUUID: function () { box.__n = (box.__n || 0) + 1; return 'uuid-' + box.__n; } },
    JSON: JSON, Math: Math, Number: Number, String: String, Date: Date,
    Array: Array, Object: Object, Promise: Promise,
  };
  box.window = box;
  vm.createContext(box);
  // db.js is `const DB = (function(){…})()`, and a top-level const does not land
  // on a vm context's global — hand it out explicitly.
  const src = fs.readFileSync(path.join(__dirname, '..', 'js', 'db.js'), 'utf8');
  vm.runInContext(src + '\n;globalThis.__DB = DB;', box);
  return { DB: box.__DB, Settings: box.Settings, store: store };
}

// db.js and sync.js have to live in ONE context — sync.js reads DB, Settings and
// Auth as globals — so the push loop gets its own bootstrapper rather than
// reusing loadDB's context. `opts`:
//   reply       what the fake Auth.call resolves with
//   callFails   message to reject Auth.call with instead
//   loggedOut   Auth.loggedIn() answers false
//   hold        park the reply until box.__release() — for testing what happens
//               DURING a round trip rather than racing it
//   noUrl       no CONFIG.SCRIPT_URL, so configured() answers false
//   settings    extra ck_* localStorage keys
// Returns { Sync, DB, box }: `box.__sent` is every Auth.call made, and
// `box.window.dispatchEvent` can be replaced to watch events as they fire.
function bootSync(opts) {
  const o = opts || {};
  const store = Object.assign({ ck_epoch: 'e1' }, o.settings || {});
  const box = {
    indexedDB: fakeIndexedDB(),
    localStorage: {
      getItem: function (k) { return (k in store) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    },
    crypto: { randomUUID: function () { box.__n = (box.__n || 0) + 1; return 'uuid-' + box.__n; } },
    CONFIG: { SCRIPT_URL: o.noUrl ? '' : 'https://example.invalid/exec' },
    CustomEvent: function (n, d) { this.type = n; this.detail = d; },
    JSON: JSON, Math: Math, Number: Number, String: String, Date: Date,
    Array: Array, Object: Object, Promise: Promise,
  };
  box.window = box;
  box.window.dispatchEvent = function () {};
  vm.createContext(box);
  const read = function (f) { return fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'); };
  vm.runInContext(read('db.js'), box);
  box.Auth = {
    loggedIn: function () { return !o.loggedOut; },
    token: function () { return 'tok'; },
    call: function (action, payload) {
      box.__sent = box.__sent || [];
      box.__sent.push({ action: action, payload: payload });
      if (o.callFails) return Promise.reject(new Error(o.callFails));
      const answer = o.reply || { ok: true, savedIds: [], rejectedIds: [] };
      // `hold: true` parks the reply until box.__release() is called, so a test
      // can do something (an Undo, a second syncNow) at a KNOWN point inside the
      // round trip instead of racing it.
      if (!o.hold) return Promise.resolve(answer);
      return new Promise(function (res) { box.__release = function () { res(answer); }; });
    },
  };
  vm.runInContext(read('sync.js') + '\n;globalThis.__S = Sync; globalThis.__DB = DB;', box);
  return { Sync: box.__S, DB: box.__DB, box: box, store: store };
}

// A269 — js/auth.js, run rather than read.
//
// The module survey found `isAdmin: !!u && u.role === 'admin'` untested: turn
// that `&&` into `||` and every logged-in person is an admin, with 3,574 green
// assertions saying nothing. auth.js needs almost nothing to run — localStorage,
// Settings, window, fetch — so "it is browser code" was never the reason.
//
// `opts`:
//   session     { token, user } seeded into ck_token / ck_user
//   srvVersion  what the server last said (ck_srv_version)
//   srvSchema   …and its contract number (ck_srv_schema)
//   replies     queue of response objects the fake fetch resolves with, in order
//   fetchFails  reject the fetch instead (a dead link)
//   noUrl       no CONFIG.SCRIPT_URL, so call() refuses before the network
// Returns { Auth, store, events, sent }: `events` is every window event fired,
// `sent` every request body, `store` the localStorage as a plain object.
function loadAuth(opts) {
  const o = opts || {};
  const store = {};
  if (o.session) {
    if (o.session.token !== undefined) store.ck_token = String(o.session.token);
    if (o.session.user !== undefined) store.ck_user = JSON.stringify(o.session.user);
  }
  if (o.srvVersion !== undefined) store.ck_srv_version = String(o.srvVersion);
  if (o.srvSchema !== undefined) store.ck_srv_schema = String(o.srvSchema);
  Object.assign(store, o.settings || {});
  const events = [], sent = [];
  const replies = (o.replies || []).slice();
  const box = {
    localStorage: {
      getItem: function (k) { return (k in store) ? store[k] : null; },
      setItem: function (k, v) { store[k] = String(v); },
      removeItem: function (k) { delete store[k]; },
    },
    CONFIG: { SCRIPT_URL: o.noUrl ? '' : 'https://example.invalid/exec' },
    CustomEvent: function (n, d) { this.type = n; this.detail = d && d.detail; },
    setTimeout: setTimeout, clearTimeout: clearTimeout,
    fetch: function (url, init) {
      sent.push(JSON.parse(init.body));
      if (o.fetchFails) return Promise.reject(new Error('boom'));
      const r = replies.length ? replies.shift() : { ok: true };
      return Promise.resolve({ json: function () { return Promise.resolve(r); } });
    },
    JSON: JSON, Math: Math, Number: Number, String: String, Date: Date,
    Array: Array, Object: Object, Promise: Promise, RegExp: RegExp, Error: Error,
  };
  box.window = box;
  box.window.dispatchEvent = function (e) { events.push({ type: e.type, detail: e.detail }); };
  vm.createContext(box);
  const read = function (f) { return fs.readFileSync(path.join(__dirname, '..', 'js', f), 'utf8'); };
  vm.runInContext(read('db.js'), box);          // Settings
  vm.runInContext(read('aggregate.js'), box);   // Aggregate.roleOf, used by saveSession
  vm.runInContext(read('auth.js') + '\n;globalThis.__A = Auth;', box);
  return { Auth: box.__A, store: store, events: events, sent: sent, box: box };
}

// fakeIndexedDB is exported too: sync.js reads DB and Settings as globals, so a
// test that drives the push loop has to run db.js and sync.js in ONE context of
// its own rather than reusing loadDB's.
module.exports = { loadDB: loadDB, bootSync: bootSync, fakeIndexedDB: fakeIndexedDB, loadAuth: loadAuth };
