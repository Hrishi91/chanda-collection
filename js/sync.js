// Sync to Apps Script web app. POST body is text/plain JSON (avoids
// CORS preflight, which Apps Script cannot answer). Server upserts by id.
const Sync = (function () {
  let inFlight = false;

  function configured() { return !!Settings.get('scriptUrl'); }

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
    inFlight = true;
    return DB.allData().then(function (data) {
      const recs = collectUnsynced(data);
      if (!recs.length) { inFlight = false; return { ok: true, sent: 0 }; }
      return fetch(Settings.get('scriptUrl'), {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ secret: Settings.get('secret'), action: 'push', records: recs }),
      }).then(function (r) { return r.json(); })
        .then(function (resp) {
          if (!resp.ok) throw new Error(resp.error || 'server rejected');
          const savedIds = {};
          (resp.savedIds || []).forEach(function (id) { savedIds[id] = 1; });
          const updates = [];
          DB.STORES.forEach(function (s) {
            const rows = data[s].filter(function (r) { return savedIds[r.id]; });
            rows.forEach(function (r) { r.synced = 1; r.syncedAt = new Date().toISOString(); });
            if (rows.length) updates.push(DB.bulkPut(s, rows));
          });
          return Promise.all(updates).then(function () {
            inFlight = false; return { ok: true, sent: resp.savedIds.length };
          });
        });
    }).catch(function (e) {
      inFlight = false;
      return { ok: false, reason: String(e && e.message || e) };
    });
  }

  // Central dump: all rows from the Sheet (all collectors), aggregated client-side.
  function fetchCentral() {
    if (!configured()) return Promise.reject(new Error('not-configured'));
    const u = Settings.get('scriptUrl') +
      '?action=dump&year=' + Settings.get('year') +
      '&secret=' + encodeURIComponent(Settings.get('secret'));
    return fetch(u).then(function (r) { return r.json(); })
      .then(function (resp) {
        if (!resp.ok) throw new Error(resp.error || 'server rejected');
        return resp.data; // {parties, payments, daily, expenses}
      });
  }

  return { syncNow: syncNow, fetchCentral: fetchCentral, configured: configured };
})();
