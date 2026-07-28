// IndexedDB wrapper. Stores: parties, payments, daily, expenses.
// Every row: {id: uuid, year, collector, createdAt, synced: 0|1, ...}
const DB = (function () {
  const NAME = 'chanda-khata', VER = 5; // v2:+handovers v3:+voids v4:+corrections v5:+messages
  const STORES = ['parties', 'payments', 'daily', 'expenses', 'handovers', 'voids', 'corrections', 'messages'];
  let dbp = null;

  function open() {
    if (dbp) return dbp;
    dbp = new Promise(function (res, rej) {
      const req = indexedDB.open(NAME, VER);
      req.onupgradeneeded = function (e) {
        const db = e.target.result;
        STORES.forEach(function (s) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        });
      };
      req.onsuccess = function () { res(req.result); };
      req.onerror = function () { rej(req.error); };
    });
    return dbp;
  }

  function tx(store, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        const t = db.transaction(store, mode);
        const out = fn(t.objectStore(store));
        t.oncomplete = function () { res(out && out.result !== undefined ? out.result : out); };
        t.onerror = function () { rej(t.error); };
      });
    });
  }

  // A screen paint used to cost THREE full traversals of every object store:
  // the screen's own read, unsyncedCount's, and the chat badge's. Nothing had
  // changed between them. `version` bumps on every write; allData hands back
  // the same snapshot until it does. Correctness rests entirely on bumping in
  // EVERY write path — put, del, bulkPut, clearAll — so they all go through
  // `touch()` and nothing writes without it.
  let version = 0, cached = null, cachedAt = -1;
  function touch() { version++; cached = null; }
  function put(store, obj) { touch(); return tx(store, 'readwrite', function (s) { s.put(obj); return obj; }); }
  // Only safe to call on a row that never left the device (synced:0) — used by
  // the entry-flow Undo toast to cleanly retract an unsynced save.
  function del(store, id) { touch(); return tx(store, 'readwrite', function (s) { s.delete(id); }); }
  function bulkPut(store, objs) {
    touch();
    return tx(store, 'readwrite', function (s) { objs.forEach(function (o) { s.put(o); }); return objs.length; });
  }
  function getAll(store) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        const r = db.transaction(store).objectStore(store).getAll();
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }
  function get(store, id) {
    return open().then(function (db) {
      return new Promise(function (res, rej) {
        const r = db.transaction(store).objectStore(store).get(id);
        r.onsuccess = function () { res(r.result); };
        r.onerror = function () { rej(r.error); };
      });
    });
  }

  function allData() {
    // Serve the same snapshot until something is written. The promise itself is
    // cached, so several callers in one paint share ONE traversal rather than
    // racing three of their own.
    if (cached && cachedAt === version) return cached;
    const v = version;
    const p = Promise.all(STORES.map(getAll)).then(function (r) {
      const out = {};
      STORES.forEach(function (s, i) { out[s] = r[i]; });
      return out;
    });
    // only keep it if no write landed while we were reading
    if (v === version) { cached = p; cachedAt = v; }
    return p;
  }
  // the version a caller can memoise against (viewData does)
  function dataVersion() { return version; }
  // Wipe every store (used when the system goes live and training data is
  // discarded). Clears all local rows across all stores.
  function clearAll() {
    touch();
    return open().then(function (db) {
      return Promise.all(STORES.map(function (s) {
        return new Promise(function (res, rej) {
          const r = db.transaction(s, 'readwrite').objectStore(s).clear();
          r.onsuccess = function () { res(); }; r.onerror = function () { rej(r.error); };
        });
      }));
    });
  }
  function unsyncedCount() {
    return allData().then(function (d) {
      return STORES.reduce(function (n, s) {
        // rejected rows left the queue for good — don't count them as pending
        return n + d[s].filter(function (r) { return !r.synced && !r.rejected; }).length;
      }, 0);
    });
  }
  // A54 (audit 1.4): rows the SERVER REFUSED. They are not pending — retrying
  // would only be refused again — but excluding them from the badge meant it
  // flipped from ⏳ 3 to ✅ "সব sync হয়ে গেছে" while a donor walked away with a
  // numbered receipt for money that is in nobody's book. reconcile cannot catch
  // it either: the row is not there to be inconsistent with. Counted separately
  // so the header can say so in its own colour.
  function rejectedCount() {
    return allData().then(function (d) {
      return STORES.reduce(function (n, s) {
        return n + d[s].filter(function (r) { return r.rejected; }).length;
      }, 0);
    });
  }

  function newRow(extra) {
    return Object.assign({
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
      year: Settings.get('year'),
      collector: Settings.get('collectorName') || '?',      // display name
      collectorId: Settings.get('collectorUsername') || '',  // stable identity
      collectorRole: Settings.get('collectorRole') || 'collector', // for void permissions
      createdAt: new Date().toISOString(),
      synced: 0,
    }, extra);
  }

  return { STORES: STORES, put: put, del: del, bulkPut: bulkPut, getAll: getAll, get: get,
           allData: allData, unsyncedCount: unsyncedCount, rejectedCount: rejectedCount, newRow: newRow, clearAll: clearAll,
           dataVersion: dataVersion };
})();

// Tiny localStorage settings helper.
// Assigned to window (not `const`) so `window.Settings` resolves — i18n.js
// guards t() with `window.Settings && …`; a top-level const is not a window
// property, which pinned the language to Bengali (English toggle did nothing).
window.Settings = {
  get: function (k) {
    const v = localStorage.getItem('ck_' + k);
    if (k === 'year') return v ? Number(v) : new Date().getFullYear();
    if (k === 'lang') return v || 'bn';
    return v || '';
  },
  set: function (k, v) { localStorage.setItem('ck_' + k, String(v)); },
};
