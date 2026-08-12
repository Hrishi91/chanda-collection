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
      // rejected: the server refused this row (permission gate) — retrying
      // forever would just re-refuse it, so it leaves the queue for good.
      data[s].forEach(function (r) { if (!r.synced && !r.rejected) recs.push({ store: s, row: r }); });
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
      return Auth.call('push', { token: Auth.token(), records: recs,
            // A53: the epoch this batch was written under. The server refuses
            // the batch if the book has been reset since — a phone that was
            // offline across go-live must not pour training money into the live
            // book, where it would collect fresh serials and be indistinguishable
            // from real receipts.
            epoch: (function () { try { return localStorage.getItem('ck_epoch') || ''; } catch (e) { return ''; } })() })
        .then(function (resp) {
          const savedIds = {};
          (resp.savedIds || []).forEach(function (id) { savedIds[id] = 1; });
          const rejectedIds = {};
          (resp.rejectedIds || []).forEach(function (id) { rejectedIds[id] = 1; });
          const receipts = resp.receipts || {}; // paymentId → server-assigned serial
          // A94: counted here and announced AFTER every write has landed.
          //
          // A54 fired `ck-rejected` the moment the flag was set on the in-memory
          // row — before DB.put resolved. The listener answers by reading
          // DB.rejectedCount(), which still said 0, and its own `if (!n) return`
          // swallowed the toast. So the one thing A54 exists for — telling the
          // collector AT THE MOMENT it happens, while they can still do
          // something — never happened once. The badge hid it: updateBadge runs
          // later, off autoSync's callback, by which time the write has landed,
          // so 🚫 1 appeared and the silence looked intentional.
          let rejectedNow = 0;
          const updates = [];
          DB.STORES.forEach(function (s) {
            data[s].forEach(function (r) {
              if (!savedIds[r.id] && !rejectedIds[r.id]) return;
              // Re-read before writing: the row may have been deleted (Undo)
              // while the push was in flight — never resurrect it from this
              // stale snapshot. (The push itself already went out; Undo
              // handles that side by writing a void instead of deleting.)
              updates.push(DB.get(s, r.id).then(function (live) {
                if (!live) return;
                if (savedIds[live.id]) {
                  live.synced = 1; live.syncedAt = new Date().toISOString();
                  if ((s === 'payments' || s === 'daily') && receipts[live.id]) live.receiptNo = receipts[live.id]; // adopt the serial
                } else {
                  // A54: out of the queue, but NOT silent. This is the moment
                  // the collector can still do something about it — later they
                  // would have to notice a small tag inside ✏️ আমার entry, which
                  // nobody opens unless something already looks wrong.
                  live.rejected = 1;
                  rejectedNow++;
                }
                return DB.put(s, live);
              }));
            });
          });
          return Promise.all(updates).then(function () {
            inFlight = false;
            // after the writes, so the listener's own count agrees with the book
            if (rejectedNow) { try { window.dispatchEvent(new CustomEvent('ck-rejected')); } catch (e) {} }
            return { ok: true, sent: (resp.savedIds || []).length };
          });
        });
    }).catch(function (e) {
      inFlight = false;
      return { ok: false, reason: String(e && e.message || e) };
    });
  }

  // busy(): a push is mid-flight — Undo uses this to switch from delete to
  // void, since the row may already be on its way to the Sheet.
  return { syncNow: syncNow, configured: configured, busy: function () { return inFlight; } };
})();
