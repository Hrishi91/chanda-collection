// IndexedDB wrapper. Stores: parties, payments, daily, expenses.
// Every row: {id: uuid, year, collector, createdAt, synced: 0|1, ...}
const DB = (function () {
  const NAME = 'chanda-khata', VER = 1;
  const STORES = ['parties', 'payments', 'daily', 'expenses'];
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

  function put(store, obj) { return tx(store, 'readwrite', function (s) { s.put(obj); return obj; }); }
  function bulkPut(store, objs) {
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
    return Promise.all(STORES.map(getAll)).then(function (r) {
      return { parties: r[0], payments: r[1], daily: r[2], expenses: r[3] };
    });
  }
  function unsyncedCount() {
    return allData().then(function (d) {
      return STORES.reduce(function (n, s) {
        return n + d[s === 'parties' ? 'parties' : s].filter(function (r) { return !r.synced; }).length;
      }, 0);
    });
  }

  function newRow(extra) {
    return Object.assign({
      id: (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random()),
      year: Settings.get('year'),
      collector: Settings.get('collectorName') || '?',
      createdAt: new Date().toISOString(),
      synced: 0,
    }, extra);
  }

  return { STORES: STORES, put: put, bulkPut: bulkPut, getAll: getAll, get: get,
           allData: allData, unsyncedCount: unsyncedCount, newRow: newRow };
})();

// Tiny localStorage settings helper.
const Settings = {
  get: function (k) {
    const v = localStorage.getItem('ck_' + k);
    if (k === 'year') return v ? Number(v) : new Date().getFullYear();
    if (k === 'lang') return v || 'bn';
    return v || '';
  },
  set: function (k, v) { localStorage.setItem('ck_' + k, String(v)); },
};
