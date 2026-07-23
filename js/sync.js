// Sync to Apps Script web app, authenticated with the login token.
// (Auth.call posts text/plain JSON — no CORS preflight.)
const Sync = (function () {
  let inFlight = false;

  function configured() {
    return !!(Settings.get('scriptUrl') || (window.CONFIG && CONFIG.SCRIPT_URL));
  }

  function collectUnsynced(data) {
    const recs = [];
    DB.STORES.forEach(function (s) {
      data[s].forEach(function (r) { if (!r.synced) recs.push({ store: s, row: r }); });
    });
    return recs;
  }

  function syncNow() {
    if (inFlight) return Promise.resolve({ ok: false, reason: 'busy' });
    if (!configured()) return Promise.resolve({ ok: false, reason: 'not-configured' });
    if (!Auth.loggedIn()) return Promise.resolve({ ok: false, reason: 'not-logged-in' });
    inFlight = true;
    return DB.allData().then(function (data) {
      const recs = collectUnsynced(data);
      if (!recs.length) { inFlight = false; return { ok: true, sent: 0 }; }
      return Auth.call('push', { token: Auth.token(), records: recs })
        .then(function (resp) {
          const savedIds = {};
          (resp.savedIds || []).forEach(function (id) { savedIds[id] = 1; });
          const updates = [];
          DB.STORES.forEach(function (s) {
            const rows = data[s].filter(function (r) { return savedIds[r.id]; });
            rows.forEach(function (r) { r.synced = 1; r.syncedAt = new Date().toISOString(); });
            if (rows.length) updates.push(DB.bulkPut(s, rows));
          });
          return Promise.all(updates).then(function () {
            inFlight = false; return { ok: true, sent: (resp.savedIds || []).length };
          });
        });
    }).catch(function (e) {
      inFlight = false;
      return { ok: false, reason: String(e && e.message || e) };
    });
  }

  return { syncNow: syncNow, configured: configured };
})();
