// UI: view router + guided chat-style entry engine + dashboards.
(function () {
  const $view = function () { return document.getElementById('view'); };
  const SIDES = ['main_malda', 'main_balurghat', 'harirampur', 'singhadaha'];
  const REPORT_IDS = ['overview', 'dues', 'inhand', 'collectors', 'areas', 'expenses', 'daily'];
  let flowState = null;

  // offline fallback; the server's reportList is the authority when online
  function myReports() {
    const u = Auth.current();
    if (!u) return [];
    if (u.role === 'admin') return REPORT_IDS.slice();
    const g = String(u.reports || '').split(',').filter(Boolean);
    if (u.cashier === 1 && g.indexOf('inhand') < 0) g.push('inhand');
    return g.filter(function (r) { return REPORT_IDS.indexOf(r) >= 0; });
  }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, 2200);
  }
  // Toast with an inline Undo action (5s window) — used after an instant save
  // so entry stays fast (no confirm screen) without losing an escape hatch.
  function toastUndo(msg, onUndo) {
    const el = document.createElement('div');
    el.className = 'toast toast-undo';
    el.innerHTML = '<span>' + esc(msg) + '</span><button class="toast-undo-btn">' + esc(t('undo')) + '</button>';
    document.body.appendChild(el);
    let done = false;
    const finish = function () {
      if (done) return; done = true;
      el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300);
    };
    setTimeout(function () { el.classList.add('show'); }, 10);
    const timer = setTimeout(finish, 5000);
    el.querySelector('.toast-undo-btn').onclick = function () {
      clearTimeout(timer); finish(); onUndo();
    };
  }
  // Retract the rows a just-finished save created. Rows that never left the
  // device (synced:0, no push in flight) are cleanly deleted; anything that
  // synced — or MIGHT have (push mid-flight) — gets a void record instead,
  // because a local delete of a server-known row silently resurrects on the
  // next pull. Undo-as-void is a sanctioned self-correction within the 5s
  // window; the audit trail keeps the original + the void (reason: 'undo').
  function attemptUndo(list) {
    let voided = false;
    Promise.all((list || []).map(function (u) {
      return DB.get(u.store, u.id).then(function (row) {
        if (!row) return;
        // Synced — or a push is mid-flight, so the row may already be on its
        // way to the Sheet: a local delete would silently resurrect on the
        // next pull. The only correct retraction then is a VOID record
        // (audit-preserving, syncs like any entry, excluded everywhere).
        if (row.synced || Sync.busy()) {
          voided = true;
          return DB.put('voids', DB.newRow({ targetStore: u.store, targetId: u.id, reason: 'undo' }));
        }
        return DB.del(u.store, u.id);
      });
    })).then(function () {
      toast(t(voided ? 'undo_voided' : 'undo_done'));
      updateBadge(); autoSync();
      render();
    });
  }
  // Calendar date in IST (UTC+5:30), independent of the device timezone —
  // a plain toISOString() is UTC, so a midnight–5:30am IST entry would get
  // stamped with the previous day.
  function todayISO() {
    return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  }
  // Display a date as a clean IST day (YYYY-MM-DD), whatever the stored form:
  // a plain "2026-07-24", an ISO round-tripped through the Sheet
  // ("2026-07-23T18:30:00.000Z" = 24 Jul IST), or a Date.toString(). Falls back
  // to the raw string if unparseable, so it never blanks a value.
  function fmtDate(v) {
    if (!v) return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;          // already a plain day
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;
    return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  }
  // Indian mobile: strip spaces/dashes/brackets and an optional +91 / 91 / 0
  // prefix, leaving the 10-digit national number.
  function cleanPhoneIN(s) {
    return String(s || '').replace(/[\s\-()]/g, '').replace(/^(\+?91|0)/, '');
  }
  // null if a valid 10-digit Indian mobile, else an error key.
  function phoneErrIN(s) {
    return /^\d{10}$/.test(cleanPhoneIN(s)) ? null : 'err_phone_in';
  }
  // IST day + time "YYYY-MM-DD HH:MM" for the audit log (when matters there)
  function fmtDateTime(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const s = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString();
    return s.slice(0, 10) + ' ' + s.slice(11, 16);
  }
  // Back button for drill-in screens (party/admin/cashier) that aren't a
  // bottom-nav tab, so users aren't stranded without an obvious way back.
  function backBar(toView, params) {
    setTimeout(function () {
      const b = document.getElementById('back-bar');
      if (b) b.onclick = function () { navigate(toView, params); };
    }, 0);
    return '<button class="ghost back-bar" id="back-bar">← ' + esc(t('back')) + '</button>';
  }

  // ---------- header / nav ----------
  let unsyncedN = 0; // mirrored synchronously for the beforeunload guard
  function updateBadge() {
    DB.unsyncedCount().then(function (n) {
      unsyncedN = n;
      const b = document.getElementById('sync-badge');
      if (!b) return;
      b.textContent = n ? '⏳ ' + n : '✅';
      b.className = 'badge ' + (n ? 'warn' : 'ok');
      b.title = n ? n + t('unsynced_n') : t('all_synced');
    });
    // unread chat marker on the 💬 tab — read from the same local snapshot the
    // screen uses, so it never disagrees with what is actually there
    const dot = document.getElementById('msg-dot');
    if (dot && Auth.loggedIn()) {
      viewData().then(function (data) {
        const f = Aggregate.messageFeed(data, meForMsg(), msgSeen());
        dot.hidden = !f.unread;
        dot.textContent = f.unread > 9 ? '9+' : String(f.unread || '');
        dot.className = 'nav-dot' + (f.mentioned ? ' me' : '');
      }).catch(function () {});
    } else if (dot) dot.hidden = true;
  }
  // Debounced so a burst of entries (e.g. bulk-shop mode) coalesces into one
  // sync ~1s after the last save instead of a round-trip per entry.
  let syncTimer = null;
  function autoSync() {
    if (!Sync.configured()) return;
    clearTimeout(syncTimer);
    syncTimer = setTimeout(function () {
      Sync.syncNow().then(function (r) {
        if (r.ok && r.sent) { toast('☁️ Sync: ' + r.sent); pullCentral(); } // refresh the snapshot after a push
        updateBadge();
        if (r.reason === 'busy') autoSync(); // a sync was in flight — retry the tail
      });
    }, 1000);
  }

  // ---------- pull-down: one central snapshot, render every screen local ----------
  let centralData = null, centralCursor = '', centralYear = '';
  let centralConfig = {}; // receipt-design config (committee name/logo/footer/colour/layout)
  try { centralConfig = JSON.parse(localStorage.getItem('ck_config') || '{}') || {}; } catch (e) { centralConfig = {}; }
  try { centralData = JSON.parse(localStorage.getItem('ck_central') || 'null'); } catch (e) { centralData = null; }
  try { centralCursor = localStorage.getItem('ck_central_cursor') || ''; } catch (e) { centralCursor = ''; }
  try { centralYear = localStorage.getItem('ck_central_year') || ''; } catch (e) { centralYear = ''; }
  // merge a delta (only changed rows) into the cached snapshot, upsert by id.
  // There are no hard deletes (voids are soft), so merge-only stays correct.
  // Returns which stores actually changed. Chat is separated from the rest:
  // ten people talking during a collection round would otherwise rebuild the
  // ledger every 60 seconds — losing scroll position, and wiping the search box
  // under somebody's finger — for rows that change no figure on the screen.
  function mergeDelta(delta) {
    let changed = false, chatOnly = true;
    DB.STORES.forEach(function (s) {
      const incoming = delta[s] || [];
      if (!incoming.length) return;
      changed = true;
      if (s !== 'messages') chatOnly = false;
      const byId = {};
      (centralData[s] || []).forEach(function (r) { if (r && r.id != null) byId[r.id] = r; });
      incoming.forEach(function (r) { if (r && r.id != null) byId[r.id] = r; });
      centralData[s] = Object.keys(byId).map(function (k) { return byId[k]; });
    });
    return { changed: changed, chatOnly: changed && chatOnly };
  }
  function pullCentral() {
    if (!navigator.onLine || !Sync.configured() || !Auth.loggedIn()) return Promise.resolve();
    const year = String(Settings.get('year'));
    // switching year invalidates the snapshot — force a full pull, never merge
    // one year's delta into another year's cache.
    if (centralYear !== year) { centralData = null; centralCursor = ''; centralYear = year; }
    const params = { token: Auth.token(), year: year };
    // ask for a delta only when we already hold a snapshot at a known cursor
    if (centralData && centralCursor) params.since = centralCursor;
    return Auth.call('pull', params).then(function (resp) {
      // system reset (admin went live): a new data_epoch means the server
      // discarded training data — wipe this device's local cache too, then
      // re-pull fresh so training entries never linger via viewData's merge.
      const newEpoch = (resp.config && resp.config.data_epoch) || '';
      let seenEpoch = ''; try { seenEpoch = localStorage.getItem('ck_epoch') || ''; } catch (e) {}
      if (newEpoch && newEpoch !== seenEpoch) {
        try { localStorage.setItem('ck_epoch', newEpoch); } catch (e) {}
        if (resp.config) { centralConfig = resp.config; try { localStorage.setItem('ck_config', JSON.stringify(centralConfig)); } catch (e) {} }
        centralData = null; centralCursor = '';
        try { localStorage.removeItem('ck_central'); localStorage.removeItem('ck_central_cursor'); } catch (e) {}
        return DB.clearAll().then(function () { return pullCentral(); }); // clean full pull
      }
      let changed, chatOnly = false;
      if (resp.mode === 'delta' && centralData) {
        const m = mergeDelta(resp.data || {});
        changed = m.changed; chatOnly = m.chatOnly;
      } else {
        centralData = resp.data || null; // full snapshot (first pull / cache miss)
        changed = true;
      }
      if (resp.cursor != null) centralCursor = String(resp.cursor);
      centralYear = year;
      if (resp.config) { centralConfig = resp.config; try { localStorage.setItem('ck_config', JSON.stringify(centralConfig)); } catch (e) {} updateTrainingBar(); }
      // notifications ride the pull now — apply them and stop the separate
      // 60s notifications poll (halves the server calls per device)
      if (resp.notif) { notifViaPull = true; applyNotifications(resp.notif.notifications, resp.notif.items); }
      // adopt the fresh user: admin's permission/role changes land within a
      // pull (≤60s) instead of waiting for a re-login
      if (resp.me && Auth.loggedIn()) {
        const prev = JSON.stringify(Auth.current() || {});
        if (prev !== JSON.stringify(resp.me)) {
          try { localStorage.setItem('ck_user', JSON.stringify(resp.me)); } catch (e) {}
          Settings.set('collectorName', resp.me.name);
          Settings.set('collectorRole', Aggregate.roleOf(resp.me.role, resp.me.cashier));
          changed = true; // re-render below so hidden/shown tiles update
        }
      }
      try {
        localStorage.setItem('ck_central', JSON.stringify(centralData));
        localStorage.setItem('ck_central_cursor', centralCursor);
        localStorage.setItem('ck_central_year', centralYear);
      } catch (e) { /* quota */ }
      // a mention has to reach the phone, and messages land here — so this is
      // the one place it can be checked without a poll of its own
      viewData().then(function (d2) {
        checkMentionNotify(d2);
        chatLoadHTML = chatLoadBannerHTML(checkChatLoad(d2));
        renderNotifBanner();
      }).catch(function () {});
      updateBadge(); // unread chat count on the 💬 tab
      if (!changed || flowState) return; // idle poll (empty delta) → no re-render
      // new chat and nothing else: the badge and the chat screen are the only
      // things that could look different, so leave every other screen alone
      if (chatOnly) { if (current.view === 'messages') renderMessages(); return; }
      // findparty: refresh results in place (rebuilding the shell steals input
      // focus and flashes "loading" → looked like blinking). Its #fp-results
      // swap never touches the search box, so it's safe even mid-typing.
      if (current.view === 'findparty') { if (document.getElementById('fp-search')) refreshFindParty(); return; }
      // Other screens fully rebuild their DOM (incl. the search box). Skip the
      // background re-render while the user is typing so we don't steal focus.
      const el = document.activeElement;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      if (['list', 'party', 'report'].indexOf(current.view) >= 0) render();
    }).catch(function () { /* offline — keep the cached snapshot */ });
  }
  // central snapshot overlaid with this device's own rows (so a just-saved
  // entry shows before it syncs back). Falls back to local-only if no pull yet.
  function viewData() {
    return DB.allData().then(function (local) {
      if (!centralData) return local;
      const merged = {};
      DB.STORES.forEach(function (s) {
        const byId = {};
        (centralData[s] || []).forEach(function (r) { if (r && r.id != null) byId[r.id] = r; });
        (local[s] || []).forEach(function (r) { if (r && r.id != null) byId[r.id] = r; }); // local wins
        merged[s] = Object.keys(byId).map(function (k) { return byId[k]; });
      });
      return merged;
    });
  }

  // ---------- in-app notifications ----------
  // Actionable counts (handovers to confirm, users to approve) polled while
  // the app is open; shown as a home banner + OS notification when new.
  let notifCounts = { handovers: 0, approvals: 0, corrections: 0 };
  let notifItems = { handovers: [], approvals: [], corrections: [] };
  let notifTimer = null, notifWired = false;
  function osNotify(body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🙏 ' + pujaName(), { body: body, icon: 'icons/icon-192.png', tag: 'chanda-notif' });
      }
    } catch (e) { /* ignore */ }
  }
  function notifText() {
    const parts = [];
    if (notifCounts.handovers > 0) parts.push(notifCounts.handovers + ' ' + t('notif_handovers'));
    if (notifCounts.approvals > 0) parts.push(notifCounts.approvals + ' ' + t('notif_approvals'));
    if (notifCounts.corrections > 0) parts.push(notifCounts.corrections + ' ' + t('notif_corrections'));
    return parts.join(' • ');
  }
  function notifRow(msg, actions) {
    return '<div class="notif-item" style="display:block">' +
      '<div>' + msg + '</div>' +
      '<div class="chips" style="margin:6px 0 0">' + actions + '</div></div>';
  }
  // Rich, actionable feed: each pending item shows who/what + inline buttons.
  // Falls back to the plain count when detail items aren't available (e.g. an
  // older backend that only returns counts).
  let chatLoadHTML = '';
  function renderNotifBanner() {
    const el = document.getElementById('notif-banner');
    if (!el) return;
    const it = notifItems || {};
    const haveDetail = (it.approvals && it.approvals.length) || (it.handovers && it.handovers.length) || (it.corrections && it.corrections.length);
    let html = '';
    (it.approvals || []).forEach(function (a) {
      html += notifRow('🙋 <b>' + esc(a.name) + '</b> (@' + esc(a.username) + ') — ' + esc(t('notif_wants_approve')),
        '<button class="chip on" data-na="approve-user" data-id="' + esc(a.userId) + '">' + esc(t('approve')) + '</button>' +
        '<button class="chip" data-na="decline-user" data-id="' + esc(a.userId) + '">🚫 ' + esc(t('notif_decline')) + '</button>' +
        '<button class="chip" data-nav="admin">👁 ' + esc(t('view')) + '</button>');
    });
    (it.handovers || []).forEach(function (h) {
      html += notifRow('💰 <b>' + esc(h.from) + '</b> — ' + fmtMoney(h.amount) + ' <span class="row-sub">' + esc(fmtDate(h.date)) + '</span>' + breakdownLines(h),
        '<button class="chip on" data-na="confirm-handover" data-id="' + esc(h.id) + '">✅ ' + esc(t('confirm_received')) + '</button>' +
        '<button class="chip" data-nav="cashier">👁 ' + esc(t('view')) + '</button>');
    });
    (it.corrections || []).forEach(function (c) {
      html += notifRow('⚠️ ' + esc(c.reason || (c.targetStore + '/' + c.targetId)) +
          (c.by ? ' <span class="row-sub">— ' + esc(c.by) + '</span>' : ''),
        '<button class="chip" data-nav="review">👁 ' + esc(t('review_btn')) + '</button>');
    });
    // fallback: no detail from the server → show the old count chips
    if (!haveDetail) {
      if (notifCounts.handovers > 0) html += '<button class="notif-item" data-nav="cashier">🔔 ' + notifCounts.handovers + ' ' + esc(t('notif_handovers')) + ' ›</button>';
      if (notifCounts.approvals > 0) html += '<button class="notif-item" data-nav="admin">🔔 ' + notifCounts.approvals + ' ' + esc(t('notif_approvals')) + ' ›</button>';
      if (notifCounts.corrections > 0) html += '<button class="notif-item" data-nav="review">🔔 ' + notifCounts.corrections + ' ' + esc(t('notif_corrections')) + ' ›</button>';
    }
    el.innerHTML = (chatLoadHTML || '') + html;
    const offBtn = document.getElementById('chat-off-btn');
    if (offBtn) offBtn.onclick = function () {
      if (!window.confirm(t('chat_stop_confirm'))) return;
      offBtn.disabled = true;
      Auth.call('setConfig', { token: Auth.token(), key: 'chat_off', value: 'on' })
        .then(function () { centralConfig.chat_off = 'on'; toast(t('chat_stopped')); render(); })
        .catch(function (e) { offBtn.disabled = false; toast(errMsg(e)); });
    };
    el.querySelectorAll('[data-nav]').forEach(function (b) {
      b.onclick = function () { navigate(b.dataset.nav); };
    });
    el.querySelectorAll('[data-na]').forEach(function (b) {
      b.onclick = function () {
        b.disabled = true;
        const act = b.dataset.na, id = b.dataset.id, tok = Auth.token();
        const call = act === 'approve-user' ? Auth.call('setStatus', { token: tok, userId: id, status: 'approved', year: Settings.get('year') })
          : act === 'decline-user' ? Auth.call('setStatus', { token: tok, userId: id, status: 'blocked' })
          : Auth.call('confirmHandover', { token: tok, id: id });
        call.then(function () {
          toast(t('saved'));
          if (notifViaPull) pullCentral(); else checkNotifications(); // refresh the feed
          if (!flowState && REFRESHABLE.indexOf(current.view) >= 0) render();
        }).catch(function (e) { b.disabled = false; toast(errMsg(e)); });
      };
    });
  }
  // Apply a notification payload (from `pull` or the standalone action):
  // update the banner, toast on new items, refresh the current data view.
  function applyNotifications(n, items) {
    n = n || { handovers: 0, approvals: 0, corrections: 0 };
    const total = (n.handovers || 0) + (n.approvals || 0) + (n.corrections || 0);
    const prev = (notifCounts.handovers || 0) + (notifCounts.approvals || 0) + (notifCounts.corrections || 0);
    const changed = total !== prev;
    notifCounts = n;
    notifItems = items || { handovers: [], approvals: [], corrections: [] };
    renderNotifBanner();
    if (total > prev) { const m = notifText(); if (m) { toast('🔔 ' + m); osNotify(m); } }
    // auto-refresh a data view (e.g. admin panel) when the count changes,
    // so a new registration/handover shows without a manual refresh
    if (changed && Auth.loggedIn() && !flowState && current.view !== 'home' &&
        REFRESHABLE.indexOf(current.view) >= 0) render();
  }
  // once pull carries the feed, the standalone poll is redundant (halves calls)
  let notifViaPull = false;
  function checkNotifications() {
    if (!Auth.loggedIn() || !navigator.onLine || !Sync.configured()) return;
    Auth.call('notifications', { token: Auth.token(), year: Settings.get('year') })
      .then(function (resp) { applyNotifications(resp.notifications, resp.items); })
      .catch(function () { /* offline / not ready */ });
  }
  // Returning to the app (or a pull-to-refresh) re-renders the current data
  // view so users never have to manually refresh — skipped mid-entry and on
  // transient screens.
  const REFRESHABLE = ['home', 'list', 'report', 'admin', 'cashier', 'party', 'entries', 'review', 'hbook', 'messages'];
  function onAppFocus() {
    if (!notifViaPull) checkNotifications(); // old backend only — pull carries it otherwise
    autoSync(); // push anything still pending when the user returns
    Lists.refresh(); // pick up admin edits to areas/locations
    pullCentral(); // refresh the central snapshot (incl. notifications + me)
    if (Auth.loggedIn() && !flowState && REFRESHABLE.indexOf(current.view) >= 0) render();
  }
  function startNotifPolling() {
    if (!notifWired) {
      notifWired = true;
      document.addEventListener('visibilitychange', function () { if (!document.hidden) onAppFocus(); });
      window.addEventListener('focus', onAppFocus);
      wirePullToRefresh();
    }
    if (!notifTimer) notifTimer = setInterval(function () {
      if (!document.hidden) { if (!notifViaPull) checkNotifications(); Lists.refresh(); pullCentral(); }
    }, 60000);
    if (!notifViaPull) checkNotifications();
    Lists.refresh(); // populate the areas/locations cache
    pullCentral(); // pull the central snapshot on login
  }
  // Minimal pull-to-refresh: pull down > ~80px from the very top → refresh.
  function wirePullToRefresh() {
    let startY = 0, pulling = false;
    document.addEventListener('touchstart', function (e) {
      pulling = (window.scrollY <= 0 && e.touches.length === 1);
      if (pulling) startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (pulling && (e.changedTouches[0].clientY - startY) > 80 && !flowState) {
        toast('🔄'); onAppFocus();
      }
      pulling = false;
    }, { passive: true });
  }

  // ---------- flow engine ----------
  // step: {key, qKey, kind:text|amount|choice, options:[{v,labelKey}], optional, showIf(answers)}
  function startFlow(def) {
    flowState = { def: def, answers: Object.assign({}, def.presets || {}), idx: 0 };
    // A normal flow skips any step whose answer is already known (presets are
    // context, not input). An EDIT is the opposite: every answer is known, and
    // the point is to walk through them and change what is wrong.
    if (def.editing) { renderEntry(); try { history.pushState({ v: 'entry' }, ''); } catch (e) {} return; }
    try { history.pushState({ v: 'entry' }, ''); } catch (e) {} // Back cancels the entry
    skipHidden();
    renderEntry();
  }
  function visible(step) { return !step.showIf || step.showIf(flowState.answers); }
  function skipHidden() {
    const st = flowState.def.steps, editing = flowState.def.editing;
    while (flowState.idx < st.length &&
           (!visible(st[flowState.idx]) ||
            (!editing && flowState.answers[st[flowState.idx].key] !== undefined))) {
      flowState.idx++;
    }
  }
  function answerDisplay(step, val) {
    if (val === null || val === undefined || val === '') return '—';
    if (step.kind === 'amount') return fmtMoney(val);
    if (step.kind === 'choice') {
      const opts = step.optionsFn ? step.optionsFn(flowState.answers) : step.options;
      const o = opts.find(function (o) { return o.v === val; });
      return o ? (o.labelKey ? t(o.labelKey) : o.label) : val;
    }
    if (step.kind === 'sheet') {
      // show what the sheet actually hands over: total, then each category
      let cash = 0, upi = 0;
      const parts = Object.keys(val || {}).map(function (k) {
        const c = Number(val[k].cash) || 0, u = Number(val[k].upi) || 0;
        cash += c; upi += u;
        const cat = step.categories.find(function (x) { return x.key === k; });
        return (cat ? t(cat.labelKey) : k) + ' ' + fmtMoney(c + u);
      });
      return fmtMoney(cash + upi) + (parts.length ? ' (' + parts.join(', ') + ')' : '');
    }
    return val;
  }
  function submitAnswer(raw) {
    // Guard: after the LAST answer the old step UI stays on screen while
    // finishFlow saves async — a double-tap used to read steps[idx] =
    // undefined and throw. Ignore taps once past the end or mid-save.
    const step = flowState && flowState.def.steps[flowState.idx];
    if (!step || savingFlow) return;
    let val = raw;
    if (step.kind === 'amount') {
      if (raw === null) { val = null; } // skipped
      else {
        val = NumParse.parseAmount(raw);
        if (isNaN(val)) { toast(t('invalid_amount')); return; }
        // a stuck key turns ৫০০ into ৫০০০০০০ and silently skews every total;
        // anything this large in a para chanda is a typo until confirmed.
        if (val > 100000 && !window.confirm(t('amount_big_confirm').replace('{amt}', fmtMoney(val)))) return;
      }
    } else if (raw !== null && !step.optional && !String(raw || '').trim()) {
      // every text step is mandatory unless explicitly marked optional —
      // a blank name used to sail through and land as an unsearchable row.
      toast(t(step.required ? 'comment_required' : 'field_required')); return;
    } else if (step.validate && raw !== null && String(raw || '').trim()) {
      // value-level format check (e.g. phone). Only runs when something was
      // actually entered, so an optional field can still be left blank.
      const err = step.validate(String(raw).trim());
      if (err) { toast(t(err)); return; }
      if (step.clean) val = step.clean(String(raw).trim());
    }
    flowState.answers[step.key] = val;
    Voice.stop();
    flowState.idx++; skipHidden();
    if (flowState.idx >= flowState.def.steps.length) finishFlow();
    else renderEntry();
  }
  // Save immediately once the last step is answered — no separate confirm
  // screen (the chat transcript above already shows every answer). A failed
  // save (e.g. total ₹0) rewinds to the field that needs fixing instead of
  // losing the rest of the answers.
  let savingFlow = false; // blocks stray taps while the async save runs
  function finishFlow() {
    const def = flowState.def;
    savingFlow = true;
    // Correcting an entry is append-only, like everything else here: the old row
    // is VOIDED and a new one written. Nothing is overwritten, so "what did it
    // say before, and who changed it" always has an answer, the receipt serial
    // is not silently reused, and two phones editing at once cannot produce a
    // row that is half one edit and half the other.
    const pre = def.editing
      ? DB.put('voids', DB.newRow({ targetStore: def.editing.store, targetId: def.editing.id,
                                    reason: 'edit — ' + (def.editing.reason || '') }))
      : Promise.resolve();
    pre.then(function () { return def.save(flowState.answers); }).then(function (result) {
      savingFlow = false;
      const r = result || {};
      flowState = null;
      updateBadge(); autoSync();
      if (r.after && r.after.navigateTo) navigate(r.after.navigateTo, r.after.params);
      else if (r.after) renderAfter(r.after);
      else navigate(def.returnTo || 'home');
      if (r.undo && r.undo.length) toastUndo(t('saved'), function () { attemptUndo(r.undo); });
      else toast(t('saved'));
    }).catch(function (e) {
      savingFlow = false;
      const msg = String(e && e.message);
      if (msg === 'zero') { toast(t('amount_zero')); rewindToAmount() || goBack(); }
      else if (msg === 'cancelled') { rewindToKey('name') || goBack(); }
      else { toast(t('amount_zero')); rewindToAmount() || goBack(); }
    });
  }
  // Land back on the money-amount step after a zero-total rejection.
  function rewindToAmount() {
    const steps = flowState.def.steps;
    for (let i = steps.length - 1; i >= 0; i--) {
      if (visible(steps[i]) && steps[i].kind === 'amount') {
        delete flowState.answers[steps[i].key];
        flowState.idx = i; renderEntry();
        return true;
      }
    }
    return false;
  }
  // Land back on a named step (e.g. 'name', after a declined duplicate-party
  // confirm) so the user can change exactly the field that caused the issue.
  function rewindToKey(key) {
    const steps = flowState.def.steps;
    const i = steps.findIndex(function (s) { return s.key === key; });
    if (i < 0) return false;
    delete flowState.answers[key];
    flowState.idx = i; renderEntry();
    return true;
  }
  function goBack() {
    Voice.stop();
    // step back to the previous VISIBLE step; skip hidden ones (e.g. bus
    // name/number in a toto/road flow). If none remain, leave the flow.
    let i = flowState.idx - 1;
    while (i >= 0 && !visible(flowState.def.steps[i])) i--;
    if (i < 0) { flowState = null; navigate('home'); return; }
    delete flowState.answers[flowState.def.steps[i].key];
    flowState.idx = i;
    renderEntry();
  }

  // Only ever called with flowState.idx pointing at an unanswered, visible
  // step — the last step's submitAnswer routes straight to finishFlow()
  // instead of back here, so there is no separate confirm screen to render.
  function renderEntry() {
    const def = flowState.def, steps = def.steps;
    let html = '<div class="flow"><div class="flow-title">' + esc(def.title) + '</div><div class="chat">';
    for (let i = 0; i < flowState.idx && i < steps.length; i++) {
      const s = steps[i];
      if (!visible(s) || flowState.answers[s.key] === undefined) continue;
      html += '<div class="bubble q">' + esc(t(s.qKey)) + '</div>';
      html += '<div class="bubble a">' + esc(answerDisplay(s, flowState.answers[s.key])) + '</div>';
    }
    const s = steps[flowState.idx];
    html += '<div class="bubble q now">' + esc(t(s.qKey)) + '</div></div>';
    if (s.kind === 'choice') {
      // optionsFn: options that depend on earlier answers (e.g. handover's
      // cash/UPI chips showing the selected categories' actual amounts)
      html += '<div class="chips">' + (s.optionsFn ? s.optionsFn(flowState.answers) : s.options).map(function (o) {
        return '<button class="chip" data-v="' + esc(o.v) + '">' +
               esc(o.labelKey ? t(o.labelKey) : o.label) + '</button>';
      }).join('') + '</div>';
    } else if (s.kind === 'sheet') {
      // ONE screen for a handover: every source category gets its OWN cash and
      // UPI box, prefilled with what's actually in hand. Hand over everything →
      // change nothing, just Next. Hand over part → edit that one box. A box is
      // capped at the available figure so the books can never go negative, and
      // a category with no money of that type shows "—" instead of an input.
      const groups = [
        // bus sits with the new-entry types, exactly as on the home screen
        // (it names a donor and issues a receipt); road/toto are the
        // anonymous street rounds.
        { key: 'entry', labelKey: 'grp_entry', cats: s.categories.filter(function (c) { return ['shop', 'person', 'member', 'payment', 'bus'].indexOf(c.key) >= 0; }) },
        { key: 'daily', labelKey: 'grp_daily', cats: s.categories.filter(function (c) { return ['road', 'toto'].indexOf(c.key) >= 0; }) },
        { key: 'other', labelKey: 'grp_received', cats: s.categories.filter(function (c) { return c.key === 'received' || c.key === 'other'; }) },
        // (a collector is never a handover RECIPIENT — the "to" list is
        // cashiers and admins only — so in practice these last two are empty
        // for them and the group does not render)
      ].filter(function (g) { return g.cats.length; });
      // cash and UPI are SEPARATE tap-to-select chips carrying the real
      // figure — nothing is typed; the total is simply what is selected.
      // Everything starts selected, so handing over the lot = change nothing.
      const cell = function (c, kind) {
        const avail = kind === 'cash' ? c.cash : c.upi;
        if (avail <= 0) return '<span class="sh-none">—</span>';
        return '<button class="sh-pick on" data-cat="' + esc(c.key) + '" data-kind="' + kind +
          '" data-amt="' + avail + '">' + (kind === 'cash' ? '💵' : '📱') + ' ' + fmtMoney(avail) + '</button>';
      };
      const catRow = function (c) {
        return '<div class="sh-row"><span class="cat-name">' + esc(t(c.labelKey || CAT_LABEL_KEYS[c.key] || 'cat_other')) + '</span>' +
          '<span class="sh-picks">' + cell(c, 'cash') + cell(c, 'upi') + '</span></div>';
      };
      html += '<div class="sh-actions"><button class="chip" id="sh-all">' + esc(t('sheet_all')) +
        '</button><button class="chip" id="sh-none">' + esc(t('sheet_none')) + '</button></div>' +
        groups.map(function (g) {
          return '<div class="cat-group"><div class="cat-group-head">' + esc(t(g.labelKey)) + '</div>' +
            g.cats.map(catRow).join('') + '</div>';
        }).join('') +
        '<div class="cat-selected" id="sh-total"></div>' +
        '<div class="flow-actions"><button id="sh-next" class="primary">' + esc(t('next')) + '</button></div>';
    } else if (s.kind === 'cashsheet') {
      // A cashier's position, read-only, then two boxes. Nothing here is
      // selectable: the money is pooled, so there is no honest category to pick.
      const v = s.view, money = function (o) {
        return '<span class="cat-split">💵' + fmtMoney(o.cash) + ' · 📱' + fmtMoney(o.upi) + '</span>' +
               '<b class="cat-tot">' + fmtMoney(o.cash + o.upi) + '</b>';
      };
      const group = function (labelKey, cats) {
        if (!cats.length) return '';
        const sub = cats.reduce(function (a, c) { return { cash: a.cash + c.cash, upi: a.upi + c.upi }; }, { cash: 0, upi: 0 });
        return '<div class="cat-group"><div class="cat-group-head">' + esc(t(labelKey)) + '</div>' +
          cats.map(function (c) {
            return '<div class="sh-row ro"><span class="cat-name">' + esc(t(c.labelKey)) + '</span>' + money(c) + '</div>';
          }).join('') +
          '<div class="sh-row ro sub"><span class="cat-name"></span>' + money(sub) + '</div></div>';
      };
      const inGrp = function (keys) { return s.cats.filter(function (c) { return keys.indexOf(c.key) >= 0; }); };
      html += group('grp_entry', inGrp(['shop', 'person', 'member', 'payment', 'bus'])) +
        group('grp_daily', inGrp(['road', 'toto'])) +
        (v.byGiver.length ? '<div class="cat-group"><div class="cat-group-head">' + esc(t('grp_received')) + '</div>' +
          v.byGiver.map(function (g) {
            return '<div class="sh-row ro"><span class="cat-name">🧑 ' + esc(g.name) + '</span>' + money(g) + '</div>';
          }).join('') +
          '<div class="sh-row ro sub"><span class="cat-name"></span>' + money(v.received) + '</div></div>' : '') +
        '<div class="cat-group tot-group">' +
          '<div class="sh-row ro"><span class="cat-name">' + esc(t('cs_total_in')) + '</span>' + money(v.totalIn) + '</div>' +
          '<div class="sh-row ro"><span class="cat-name">' + esc(t('cs_spent')) + '</span>' + money(v.spent) + '</div>' +
          '<div class="sh-row ro"><span class="cat-name">' + esc(t('cs_sent')) + '</span>' + money(v.out) + '</div>' +
          '<div class="sh-row ro have"><span class="cat-name">' + esc(t('cs_available')) + '</span>' + money(v.available) + '</div>' +
        '</div>' +
        '<div class="section">' + esc(t('q_handover_amount')) + '</div>' +
        '<div class="cs-inputs">' +
          '<label>💵 ' + esc(t('cash')) + '<input id="cs-cash" inputmode="numeric" autocomplete="off"></label>' +
          '<label>📱 ' + esc(t('upi')) + '<input id="cs-upi" inputmode="numeric" autocomplete="off"></label>' +
        '</div>' +
        '<div class="cat-selected" id="cs-total"></div>' +
        '<div class="flow-actions"><button id="cs-next" class="primary">' + esc(t('next')) + '</button></div>';
    } else {
      // when correcting, the box opens with what the entry says today, so a
      // one-field fix is one tap on Next for everything else
      const prev = flowState.def.editing && flowState.answers[s.key] !== undefined
        ? String(flowState.answers[s.key]) : '';
      html += '<div class="input-row">' +
        '<input id="flow-input" ' + (s.kind === 'amount' ? 'inputmode="text" placeholder="৫০০ / পাঁচশো"' : '') +
        ' value="' + esc(prev) + '" autocomplete="off">' +
        (Voice.supported() ? '<button id="mic-btn" class="mic">🎤</button>' : '') +
        '<button id="next-btn" class="primary">' + esc(t('next')) + '</button></div>' +
        '<div class="hint" id="flow-hint">' + esc(Voice.supported() ? t('mic_hint') : '') + '</div>';
    }
    html += '<div class="flow-actions">' +
      (s.optional ? '<button id="skip-btn" class="ghost">' + esc(t('skip')) + '</button>' : '') +
      '<button id="back-btn" class="ghost">' + esc(t('back')) + '</button></div>';
    html += '</div>';
    $view().innerHTML = html;

    // wire up
    document.querySelectorAll('.chip').forEach(function (c) {
      if (flowState.def.editing && String(flowState.answers[s.key]) === c.dataset.v) c.classList.add('on');
      c.onclick = function () { submitAnswer(c.dataset.v); };
    });
    const input = document.getElementById('flow-input');
    if (input) {
      input.focus();
      input.onkeydown = function (e) { if (e.key === 'Enter') submitAnswer(input.value.trim()); };
      const nextB = document.getElementById('next-btn');
      if (nextB) nextB.onclick = function () { submitAnswer(input.value.trim()); };
      const mic = document.getElementById('mic-btn');
      if (mic) mic.onclick = function () {
        const hint = document.getElementById('flow-hint');
        mic.classList.add('rec'); hint.textContent = t('listening');
        Voice.start(function (txt) {
          input.value = txt;
          // async voice result may land after the flow finished/cancelled
          const s = flowState && flowState.def.steps[flowState.idx];
          if (!s) return;
          if (s.kind === 'amount') {
            const v = NumParse.parseAmount(txt);
            hint.textContent = isNaN(v) ? t('invalid_amount') : (t('parsed_hint') + ': ' + fmtMoney(v));
          } else { hint.textContent = t('mic_hint'); }
        }, function () { mic.classList.remove('rec'); },
        function (err) {
          mic.classList.remove('rec');
          hint.textContent = (err === 'network') ? t('need_net_voice') : t('no_mic');
        });
      };
    }
    const skipB = document.getElementById('skip-btn');
    if (skipB) skipB.onclick = function () {
      // same double-tap guard as submitAnswer: past the last step there IS
      // no current step — reading .kind here used to throw
      const st = flowState && flowState.def.steps[flowState.idx];
      if (!st) return;
      submitAnswer(st.kind === 'amount' ? null : '');
    };
    const backB = document.getElementById('back-btn');
    if (backB) backB.onclick = goBack;
    if (s.kind === 'cashsheet') wireCashSheet(s);
    if (s.kind === 'sheet') {
      const picks = Array.prototype.slice.call(document.querySelectorAll('.sh-pick'));
      const totalEl = document.getElementById('sh-total');
      const nextB = document.getElementById('sh-next');
      const refresh = function () {
        let cash = 0, upi = 0;
        picks.forEach(function (b) {
          if (!b.classList.contains('on')) return;
          const v = Number(b.dataset.amt) || 0;
          if (b.dataset.kind === 'cash') cash += v; else upi += v;
        });
        totalEl.innerHTML = esc(t('sheet_total')) + ': ' +
          '<span class="cat-split">💵' + fmtMoney(cash) + ' · 📱' + fmtMoney(upi) + '</span>' +
          '<b class="cat-tot">' + fmtMoney(cash + upi) + '</b>';
        nextB.disabled = (cash + upi) <= 0;
      };
      picks.forEach(function (b) { b.onclick = function () { b.classList.toggle('on'); refresh(); }; });
      document.getElementById('sh-all').onclick = function () {
        picks.forEach(function (b) { b.classList.add('on'); }); refresh();
      };
      document.getElementById('sh-none').onclick = function () {
        picks.forEach(function (b) { b.classList.remove('on'); }); refresh();
      };
      refresh();
      nextB.onclick = function () {
        const per = {};
        picks.forEach(function (b) {
          if (!b.classList.contains('on')) return;
          const k = b.dataset.cat;
          per[k] = per[k] || { cash: 0, upi: 0 };
          per[k][b.dataset.kind] += Number(b.dataset.amt) || 0;
        });
        submitSheet(per);
      };
    }
  }
  function wireCashSheet(s) {
    const cashEl = document.getElementById('cs-cash'), upiEl = document.getElementById('cs-upi');
    const totalEl = document.getElementById('cs-total'), nextB = document.getElementById('cs-next');
    if (!cashEl || !upiEl || !nextB) return;
    const have = s.view.availableTotal;
    const num = function (el) { const n = NumParse.parseAmount(el.value.trim()); return isNaN(n) ? 0 : Math.max(0, n); };
    const refresh = function () {
      const c = num(cashEl), u = num(upiEl), tot = c + u;
      // Cash and UPI are NOT capped separately: a cashier may hand over in
      // whatever form they have — settle a UPI balance in notes, or the other
      // way round. Only the TOTAL has to fit what they hold.
      const over = tot > have;
      totalEl.innerHTML = esc(t('sheet_total')) + ': ' +
        '<span class="cat-split">💵' + fmtMoney(c) + ' · 📱' + fmtMoney(u) + '</span>' +
        '<b class="cat-tot' + (over ? ' over' : '') + '">' + fmtMoney(tot) + '</b>' +
        (over ? '<div class="cs-warn">⚠️ ' + esc(t('cs_over')) + ' ' + fmtMoney(have) + '</div>' : '');
      nextB.disabled = tot <= 0 || over;
    };
    cashEl.oninput = refresh; upiEl.oninput = refresh;
    refresh();
    nextB.onclick = function () {
      const c = num(cashEl), u = num(upiEl);
      if (c + u <= 0 || c + u > have) return;
      submitSheet({ __cash: c, __upi: u });
    };
  }
  // The category step's confirm — sets cashAmount/upiAmount directly from the
  // selected chips (bypassing the hidden manual payMode/cashAmount/upiAmount
  // steps entirely) and advances like a normal submitAnswer.
  // The sheet's answer IS the breakdown: {cat: {cash, upi}} of exactly what
  // is being handed over. No mode question afterwards — each row already
  // said cash and UPI separately.
  function submitSheet(per) {
    const step = flowState.def.steps[flowState.idx];
    flowState.answers[step.key] = per;
    flowState.idx++; skipHidden();
    if (flowState.idx >= flowState.def.steps.length) finishFlow(); else renderEntry();
  }
  function renderAfter(opts) {
    $view().innerHTML = '<div class="card center"><div class="big-emoji">✅</div>' +
      opts.buttons.map(function (b, i) {
        return '<button class="primary big block" data-i="' + i + '">' + esc(b.label) + '</button>';
      }).join('') + '</div>';
    document.querySelectorAll('[data-i]').forEach(function (el) {
      el.onclick = function () { opts.buttons[Number(el.dataset.i)].action(); };
    });
  }

  // ---------- flow definitions ----------
  function sideOptions() {
    return Lists.get('area').map(function (a) { return { v: a.id, label: Lists.labelOf('area', a.id) }; });
  }
  function locationOptions() {
    return Lists.get('location').map(function (l) { return { v: l.id, label: Lists.labelOf('location', l.id) }; });
  }
  function modeOptions(withNone) {
    const o = [{ v: 'cash', labelKey: 'mode_cash' }, { v: 'upi', labelKey: 'mode_upi' },
               { v: 'both', labelKey: 'mode_both' }];
    if (withNone) o.unshift({ v: 'none', labelKey: 'mode_none' });
    return o;
  }
  function needCash(a) { return a.payMode === 'cash' || a.payMode === 'both'; }
  function needUpi(a) { return a.payMode === 'upi' || a.payMode === 'both'; }
  function moneyOf(a) {
    const cash = Number(a.cashAmount) || 0, upi = Number(a.upiAmount) || 0;
    return { cash: cash, upi: upi, total: cash + upi };
  }
  // shared step block: mode chip + conditional cash/UPI amounts
  function moneySteps(withNone) {
    return [
      { key: 'payMode', qKey: withNone ? 'q_pay_now_mode' : 'q_mode', kind: 'choice', options: modeOptions(withNone) },
      { key: 'cashAmount', qKey: 'q_cash_amount', kind: 'amount', showIf: needCash },
      { key: 'upiAmount', qKey: 'q_upi_amount', kind: 'amount', showIf: needUpi },
    ];
  }
  function savePartyAndFirstPayment(type, a) {
    const party = DB.newRow({
      type: type, name: a.name, owner: a.owner || '', side: a.side || '',
      location: a.location || '', phone: a.phone || '', pledged: a.pledged || 0,
    });
    const m = moneyOf(a);
    let paymentId = null;
    return DB.put('parties', party).then(function () {
      if (m.total > 0) {
        const pay = DB.newRow({
          partyId: party.id, partyName: party.name, amount: m.total,
          cashAmount: m.cash, upiAmount: m.upi, date: todayISO(), note: '',
        });
        paymentId = pay.id;
        return DB.put('payments', pay);
      }
    }).then(function () { return { party: party, paymentId: paymentId }; });
  }
  // Every new party — with or without a first payment — offers a fast
  // continue (➕ another same-type entry, side sticky for shops) so a
  // collector working door-to-door never has to detour through home. This
  // replaced the old separate "bulk shop" mode: a single 🏪/🙍/🤝 tile now
  // behaves the same way every time.
  function newPartyFlow(type, presets) {
    return {
      title: t('new_entry') + ' — ' + t('type_' + type),
      presets: presets || {},
      steps: [
        { key: 'name', qKey: type === 'shop' ? 'q_shop_name' : 'q_person_name', kind: 'text' },
        { key: 'owner', qKey: 'q_owner_name', kind: 'text', optional: true,
          showIf: function () { return type === 'shop'; } },
        { key: 'side', qKey: 'q_side', kind: 'choice', options: sideOptions(), showIf: function () { return type === 'shop'; } },
        { key: 'location', qKey: 'q_location', kind: 'choice', options: locationOptions(), optional: true,
          showIf: function () { return type !== 'shop' && Lists.get('location').length > 0; } },
        { key: 'phone', qKey: 'q_phone', kind: 'text', optional: true,
          validate: phoneErrIN, clean: cleanPhoneIN },
        { key: 'pledged', qKey: 'q_pledged', kind: 'amount' },
      ].concat(moneySteps(true)),
      save: function (a) {
        // dup check against the CENTRAL snapshot + own rows (viewData), not
        // just this device — two collectors adding the same shop from two
        // phones used to both sail through and double the donor centrally.
        return viewData().then(function (data) {
          const nm = String(a.name || '').trim().toLowerCase();
          const dup = (data.parties || []).some(function (p) { return String(p.name || '').trim().toLowerCase() === nm; });
          if (dup && !window.confirm(t('dup_party_warn'))) throw new Error('cancelled');
          return savePartyAndFirstPayment(type, a);
        }).then(function (res) {
          const undo = [{ store: 'parties', id: res.party.id }];
          if (res.paymentId) undo.push({ store: 'payments', id: res.paymentId });
          // a first payment was taken → straight to the receipt (something to
          // hand the donor); the receipt screen itself offers "➕ আরেকটা [type]".
          if (res.paymentId) return { undo: undo,
            after: { navigateTo: 'receipt', params: { partyId: res.party.id, payId: res.paymentId } } };
          // no payment yet ("পরে দেবে") → straight to the continue screen.
          return { undo: undo, after: { buttons: [
            { label: t('one_more') + ' ' + t('new_' + type), action: function () {
                startFlow(newPartyFlow(type, type === 'shop' ? { side: res.party.side } : {})); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] } };
        });
      },
    };
  }
  // origin: 'list' | 'findparty' — where the collector was browsing/searching
  // before opening this party, so the receipt screen can send them straight
  // back to the same search results (not a "new entry" — a payment is
  // against a party someone already picked, unlike a fresh shop/person/bus).
  function paymentFlow(party, origin) {
    return {
      title: t('add_payment') + ' — ' + party.name,
      steps: moneySteps(false).concat([
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ]),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        const row = DB.newRow({
          partyId: party.id, partyName: party.name, amount: m.total,
          cashAmount: m.cash, upiAmount: m.upi,
          date: todayISO(), note: a.note || '',
          // A correction keeps the ORIGINAL serial. The donor already has that
          // number on their phone; re-sharing under the same one replaces the
          // old message instead of leaving them with two receipts for one
          // donation. The server only mints a serial when the field is empty,
          // so carrying it is also what stops a second one being burned.
          receiptNo: a.__receipt || '',
        });
        // straight to the receipt screen — that's the whole point of a
        // payment: something to hand the donor on the spot.
        return DB.put('payments', row).then(function () {
          return { undo: [{ store: 'payments', id: row.id }],
            after: { navigateTo: 'receipt', params: { partyId: party.id, payId: row.id, origin: origin || 'list' } } };
        });
      },
    };
  }
  // available: {cash, upi} — what this collector/cashier actually has right
  // now (Aggregate.myAvailable). Shown in the title and offered as a
  // one-tap "use all" on the matching amount step, so a handover matches
  // reality instead of a typed/misremembered figure. Typing still works —
  // a partial handover (keeping some back) is common and legitimate.
  function handoverFlow(cashierOpts, available, cashView) {
    const avail = available || { cash: 0, upi: 0 };
    // cashierOpts: [{username, name}] (new server) or [name] (older server) or
    // null/[] → free-text. Normalise both shapes.
    const opts = (cashierOpts || []).map(function (c) {
      return typeof c === 'string' ? { username: c, name: c } : c;
    });
    const byUser = {};
    opts.forEach(function (c) { byUser[c.username] = c.name; });
    const toStep = opts.length
      ? { key: 'to', qKey: 'q_handover_to', kind: 'choice',
          options: opts.map(function (c) { return { v: c.username, label: c.name }; }) }
      : { key: 'to', qKey: 'q_handover_to', kind: 'text' };
    // Source categories the collector/cashier actually holds money in —
    // চাঁদা / রোড / টোটো / বাস / অন্যের-জমা. Only categories with money
    // appear (which also makes the list permission-shaped: you can't hold
    // bus money without bus access). Flow: pick categories → pick নগদ/UPI/
    // দুটোই (each chip shows the selected categories' real amount) → save.
    // "✏️ অন্য পরিমাণ" escapes to manual typed entry for partial handovers.
    const CAT_LABELS = { shop: 'new_shop', person: 'new_person', member: 'new_member',
                         payment: 'cat_payment', bus: 'daily_bus',
                         road: 'daily_road', toto: 'daily_toto', received: 'cat_received',
                         other: 'cat_other' };
    const catsOf = function (src) {
      return Object.keys(CAT_LABELS).filter(function (k) {
        return src[k] && (src[k].cash + src[k].upi) > 0;
      }).map(function (k) {
        // clamp BOTH the chip total and the selectable subtypes the same way,
        // so the label always equals what selecting the chip actually gives
        const c = Math.max(0, src[k].cash), u = Math.max(0, src[k].upi);
        return { key: k, labelKey: CAT_LABELS[k], amount: c + u, cash: c, upi: u };
      });
    };
    const categories = catsOf(avail.byCat || {});
    // TWO different screens, because the two jobs are genuinely different.
    //
    // A COLLECTOR knows which round each note came from, so they pick
    // categories and the handover carries an exact per-category breakdown.
    //
    // A CASHIER/ADMIN holds money pooled from many people; asking them to
    // attribute it category by category would be guesswork dressed up as
    // precision — and slow. They get their position laid out read-only and type
    // one cash figure and one UPI figure. The category trail therefore ends at
    // the cashier hop, on purpose: what reaches the next person is recorded as
    // "handed over by X", with the sender's position at that moment saved
    // alongside it.
    const cashierMode = !!(cashView && Auth.isCashier());
    const moneySteps_ = cashierMode
      ? [{ key: 'cashsheet', qKey: 'q_handover_amount', kind: 'cashsheet', view: cashView, cats: catsOf(cashView.collectedByCat) }]
      : categories.length
      ? [{ key: 'sheet', qKey: 'q_handover_sheet', kind: 'sheet', categories: categories }]
      : [
          { key: 'payMode', qKey: 'q_mode', kind: 'choice', options: modeOptions(false) },
          { key: 'cashAmount', qKey: 'q_cash_amount', kind: 'amount', showIf: needCash },
          { key: 'upiAmount', qKey: 'q_upi_amount', kind: 'amount', showIf: needUpi },
        ];
    return {
      title: t('handover_title') + (avail.cash || avail.upi
        ? ' — ' + t('you_have') + ': 💵' + fmtMoney(avail.cash) + ' · 📱' + fmtMoney(avail.upi) : ''),
      steps: [toStep].concat(moneySteps_, [
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ]),
      save: function (a) {
        let m, breakdown = null;
        if (a.cashsheet && typeof a.cashsheet === 'object') {
          // A cashier types one cash and one UPI figure — there is no honest
          // category to record, so instead the row keeps a SNAPSHOT of where
          // they stood at that moment. Six months later "what did Jadav have
          // when he passed this on?" still has an answer. The `__` prefix marks
          // it as metadata so no reader mistakes it for a category.
          const c = Number(a.cashsheet.__cash) || 0, u = Number(a.cashsheet.__upi) || 0;
          const v = cashView || {};
          breakdown = { __snap: { totalIn: v.totalIn, spent: v.spent, sent: v.out, available: v.available } };
          m = { cash: c, upi: u, total: c + u };
        } else if (a.sheet && typeof a.sheet === 'object') {
          // the sheet already IS the per-category, per-money-type split —
          // store it verbatim so both sides' books stay exact
          breakdown = {}; let cash = 0, upi = 0;
          Object.keys(a.sheet).forEach(function (k) {
            const c = Number(a.sheet[k].cash) || 0, u = Number(a.sheet[k].upi) || 0;
            if (c > 0 || u > 0) { breakdown[k] = { cash: c, upi: u }; cash += c; upi += u; }
          });
          m = { cash: cash, upi: upi, total: cash + upi };
        } else m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        // when picked from the list, a.to is a username → resolve name + id;
        // when typed free (offline), a.to is a name with no id.
        const toId = byUser[a.to] !== undefined ? a.to : '';
        const toName = byUser[a.to] !== undefined ? byUser[a.to] : a.to;
        const row = DB.newRow({
          from: Settings.get('collectorName'), fromId: Settings.get('collectorUsername') || '',
          to: toName, toId: toId,
          amount: m.total, cashAmount: m.cash, upiAmount: m.upi,
          date: todayISO(), note: a.note || '',
          status: 'pending', confirmedBy: '', confirmedAt: '',
          breakdown: breakdown ? JSON.stringify(breakdown) : '',
        });
        return DB.put('handovers', row).then(function () {
          return { undo: [{ store: 'handovers', id: row.id }], after: { buttons: [
            { label: t('one_more') + ' ' + t('handover_title'), action: function () { startHandover(); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] } };
        });
      },
    };
  }
  function startHandover() {
    const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
    const availP = viewData().then(function (data) {
      return { avail: Aggregate.myAvailable(data, ident),
               // only a cashier/admin uses this, but computing it always keeps
               // the two code paths from drifting apart
               view: Aggregate.cashierView(data, ident) };
    });
    // a cashier/admin is also a valid handover recipient for everyone ELSE,
    // so the server list rightly includes them — but they can't hand money
    // to themselves, so drop their own name from their own "to" list.
    const others = function (list) {
      return (list || []).filter(function (c) { return c.username !== ident; });
    };
    if (navigator.onLine && Sync.configured()) {
      Auth.call('cashiers', { token: Auth.token() })
        .then(function (resp) { return availP.then(function (a) { startFlow(handoverFlow(others(resp.cashiers), a.avail, a.view)); }); })
        .catch(function () { availP.then(function (a) { startFlow(handoverFlow(null, a.avail, a.view)); }); });
    } else {
      availP.then(function (a) { startFlow(handoverFlow(null, a.avail, a.view)); });
    }
  }
  function dailyFlow(type) {
    return {
      title: t('daily_' + type),
      steps: [
        { key: 'busName', qKey: 'q_bus_name', kind: 'text', showIf: function () { return type === 'bus'; } },
        { key: 'busNumber', qKey: 'q_bus_number', kind: 'text', showIf: function () { return type === 'bus'; } },
      ].concat(moneySteps(false), [
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ]),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        const row = DB.newRow({
          type: type, busName: a.busName || '', busNumber: a.busNumber || '',
          amount: m.total, cashAmount: m.cash, upiAmount: m.upi,
          date: todayISO(), note: a.note || '',
          receiptNo: a.__receipt || '', // a corrected bus receipt keeps its number
        });
        return DB.put('daily', row).then(function () {
          const undo = [{ store: 'daily', id: row.id }];
          // a bus entry has a receipt (name + number); road/toto don't have a
          // donor identity, so they keep the quick add-another/expense screen.
          if (type === 'bus') return { undo: undo,
            after: { navigateTo: 'receipt', params: { store: 'daily', id: row.id } } };
          return { undo: undo, after: { buttons: [
            { label: '➕ ' + t('daily_' + type), action: function () { startFlow(dailyFlow(type)); } },
            { label: t('coll_expense'), action: function () { startFlow(collectionExpenseFlow(type)); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] } };
        });
      },
    };
  }
  const OTHER_SUBJECT = '__other__';
  // Which pots this person can spend from — the same source categories the
  // handover screen shows, each with its real figure. Empty pots aren't
  // offered; a lone pot needs no question (it's implied).
  // Which pot did this money come out of? ALWAYS asked, and 'other' is always
  // on the list — an expense with no named pot used to be spread over whatever
  // categories happened to hold money when the report was computed, so the same
  // bill moved between categories as unrelated money arrived. Naming the pot at
  // entry time fixes it there for good.
  function srcCatOptions(available) {
    const byCat = (available && available.byCat) || {};
    return Object.keys(CAT_LABEL_KEYS).filter(function (k) {
      return k !== 'other' && byCat[k] && (byCat[k].cash + byCat[k].upi) > 0;
    }).map(function (k) {
      return { v: k, label: t(CAT_LABEL_KEYS[k]) + ' ' + fmtMoney(byCat[k].cash + byCat[k].upi) };
    }).concat([{ v: 'other', label: t('cat_other') }]);
  }
  // Puja expense (cashier/admin): pick an admin-defined subject; multiple
  // cashiers may part-pay the same subject. "Other" forces a comment.
  // `available` (Aggregate.myAvailable) lets the spender say WHICH pot the
  // money came out of, so the per-category books stay exact on the spend side
  // too — the same precision the handover sheet gives on the transfer side.
  function expenseFlow(subjects, available) {
    const opts = (subjects || []).map(function (s) { return { v: s.name, label: s.name }; });
    opts.push({ v: OTHER_SUBJECT, labelKey: 'subject_other' });
    const potOptions = srcCatOptions(available);
    return {
      title: t('expense'),
      steps: [
        { key: 'subject', qKey: 'q_subject', kind: 'choice', options: opts },
      ].concat(moneySteps(false), [
        // no showIf: always asked, so srcCat is never blank on a new row
        { key: 'srcCat', qKey: 'q_src_cat', kind: 'choice', options: potOptions },
      ]).concat([
        { key: 'comment', qKey: 'q_comment_req', kind: 'text', required: true,
          showIf: function (a) { return a.subject === OTHER_SUBJECT; } },
        { key: 'comment', qKey: 'q_note', kind: 'text', optional: true,
          showIf: function (a) { return a.subject !== OTHER_SUBJECT; } },
      ]),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        const isOther = a.subject === OTHER_SUBJECT;
        const row = DB.newRow({
          subject: isOther ? 'Other' : a.subject, desc: a.comment || '',
          amount: m.total, cashAmount: m.cash, upiAmount: m.upi,
          srcCat: a.srcCat || 'other',
          spentBy: Settings.get('collectorName'),
          source: 'general', collectionType: '', date: todayISO(),
        });
        return DB.put('expenses', row).then(function () {
          return { undo: [{ store: 'expenses', id: row.id }], after: { buttons: [
            { label: t('one_more') + ' ' + t('expense'), action: function () { startExpense(); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] } };
        });
      },
    };
  }
  function startExpense(edit) {
    const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
    const availP = viewData().then(function (data) { return Aggregate.myAvailable(data, ident); });
    const go = function (subjects) {
      availP.then(function (avail) {
        const def = expenseFlow(subjects, avail);
        if (edit) {
          def.presets = edit.presets; def.editing = edit.editing;
          def.title = t('edit_title') + ' — ' + def.title; def.returnTo = 'entries';
        }
        startFlow(def);
      });
    };
    if (navigator.onLine && Sync.configured() && Auth.loggedIn()) {
      Auth.call('listSubjects', { token: Auth.token() })
        .then(function (r) { go(r.subjects || []); }).catch(function () { go(null); });
    } else go(null);
  }
  // Collector's own spend while collecting — free text, no subject.
  function collectionExpenseFlow(collectionType) {
    return {
      title: t('coll_expense'),
      steps: [
        { key: 'desc', qKey: 'q_desc', kind: 'text' },
      ].concat(moneySteps(false)),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        const row = DB.newRow({
          subject: '', desc: a.desc, amount: m.total,
          cashAmount: m.cash, upiAmount: m.upi,
          // spent out of the round it happened on — no need to ask
          srcCat: collectionType || '',
          spentBy: Settings.get('collectorName'),
          source: 'collection', collectionType: collectionType || '', date: todayISO(),
        });
        return DB.put('expenses', row).then(function () {
          return { undo: [{ store: 'expenses', id: row.id }], after: { buttons: [
            { label: t('one_more') + ' ' + t('coll_expense'), action: function () { startFlow(collectionExpenseFlow(collectionType)); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] } };
        });
      },
    };
  }

  // ---------- views ----------
  function renderHome() {
    DB.allData().then(function (data) {
      const today = todayISO();
      const meId = Settings.get('collectorUsername') || Settings.get('collectorName');
      const myToday = data.payments.concat(data.daily).filter(function (r) {
        return (r.collectorId || r.collector) === meId && (r.date === today || (r.createdAt || '').slice(0, 10) === today);
      }).reduce(function (a, r) { return a + Number(r.amount || 0); }, 0);
      const cashier = Auth.isCashier();
      // One tile per permission key, so what an admin grants and what the
      // collector sees are the same six words. Bus sits with the new-entry
      // tiles (it names a donor and issues a receipt); road/toto are the rounds.
      const tile = function (key, go, icon, labelKey) {
        return canEntry(key) ? '<button class="tile" data-go="' + go + '">' + icon + ' ' + esc(t(labelKey)) + '</button>' : '';
      };
      const partyTiles =
        tile('shop', 'shop', '🏪', 'new_shop') +
        tile('person', 'person', '🙍', 'new_person') +
        tile('member', 'member', '🤝', 'new_member') +
        tile('bus', 'bus', '🚌', 'daily_bus');
      const dailyTiles =
        tile('road', 'road', '🛣️', 'daily_road') +
        tile('toto', 'toto', '🛺', 'daily_toto') +
        (cashier ? '<button class="tile" data-go="expense">🧾 ' + esc(t('expense')) + '</button>' : '');
      // চাঁদা নেওয়া is common: a later instalment may reach whoever is nearest,
      // no matter who first wrote the donor down.
      const paymentTile =
        '<div class="grid one"><button class="tile wide" data-go="list">💰 ' + esc(t('add_payment')) + ' / ' + esc(t('dues_only')) + '</button></div>';
      const cashTiles =
        '<button class="tile" data-go="handover">' + esc(t('handover')) + '</button>' + // common to everyone
        '<button class="tile" data-go="hbook">📗 ' + esc(t('hb_title')) + '</button>' +
        (cashier ? '<button class="tile" data-go="cashier">' + esc(t('confirm_handover')) + '</button>' : '') +
        (canReview() ? '<button class="tile" data-go="review">🛠️ ' + esc(t('review_title')) + '</button>' : '');
      // NOTHING GRANTED → nothing to show but how to get unstuck. Hrishi's rule,
      // and it holds for cashiers too: somebody who collects nothing has no
      // money to hand over and no book to read. Chat stays open — that is the
      // one thing everybody has — but the real fix is a phone call, so the
      // admin's number is right here.
      if (!hasAnyGrant()) {
        $view().innerHTML =
          '<div id="notif-banner"></div>' +
          '<div class="hero"><div>🙏 ' + esc(pujaName()) + ' ' + Settings.get('year') + '</div>' +
          '<div class="hero-sub">' + esc(Settings.get('collectorName')) + '</div></div>' +
          noGrantCard();
        renderNotifBanner();
        wireNav();
        return;
      }
      $view().innerHTML =
        '<div id="notif-banner"></div>' +
        '<div class="hero"><div>🙏 ' + esc(pujaName()) + ' ' + Settings.get('year') + '</div>' +
        '<div class="hero-sub">' + esc(Settings.get('collectorName')) + ' • ' + esc(t('my_today')) + ': <b>' + fmtMoney(myToday) + '</b></div></div>' +
        (partyTiles ? '<div class="section">' + esc(t('new_entry')) + '</div><div class="grid">' + partyTiles + '</div>' : '') +
        (dailyTiles ? '<div class="section">' + esc(t('today_daily')) + '</div><div class="grid">' + dailyTiles + '</div>' : '') +
        paymentTile +
        (cashTiles ? '<div class="grid" style="margin-top:10px">' + cashTiles + '</div>' : '') +
        '<div class="grid one" style="margin-top:10px"><button class="tile wide" data-go="entries">✏️ ' +
          esc(t('my_entries_title')) + '</button></div>';
      // refresh the areas/locations cache (≤1.5s), then run — so an admin's
      // just-added area shows the moment a collector opens a new-entry form.
      const freshThen = function (fn) {
        Promise.race([Lists.refresh(), new Promise(function (r) { setTimeout(r, 1500); })]).then(fn);
      };
      wireNav();
      renderNotifBanner();   // show cached counts immediately
      if (!notifViaPull) checkNotifications();  // old backend only; pull refreshes otherwise
    });
  }

  // Has this person been set up at all? One answer, used by every screen, so
  // the ledger and the reports cannot disagree with the home screen about
  // whether somebody is ready to work.
  function hasAnyGrant() {
    if (Auth.isAdmin()) return true;
    return String((Auth.current() || {}).entries || '').split(',').filter(Boolean).length > 0;
  }
  function noGrantCard() {
    return '<div class="card" style="border:1.5px solid #d9a441;background:#fff8e8">' +
      '<b>' + esc(t('home_no_perm_title')) + '</b>' +
      '<div class="row-sub" style="margin-top:4px">' + esc(t('home_no_perm_body')) + '</div>' +
      adminContactHTML() + '</div>';
  }

  // Who to ring when the app cannot help you. Read from the pulled user list
  // when it is there, so it works offline too; falls back to just the name.
  function adminContactHTML() {
    const a = (msgUserCache || []).filter(function (u) { return u.role === 'admin'; })[0] ||
              { name: Settings.get('adminName') || '', phone: Settings.get('adminPhone') || '' };
    if (!a.name && !a.phone) return '';
    const digits = String(a.phone || '').replace(/\D/g, '');
    const wa = digits ? (digits.length === 10 ? '91' + digits : digits.replace(/^0/, '')) : '';
    return '<div class="row-sub" style="margin-top:10px"><b>' + esc(a.name || '') + '</b>' +
      (a.phone ? ' · 📞 ' + esc(a.phone) : '') + '</div>' +
      (digits ? '<div class="chips" style="margin-top:6px">' +
        '<a class="chip" href="tel:' + esc(digits) + '">' + esc(t('home_call_admin')) + '</a>' +
        '<a class="chip" href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">' + esc(t('home_wa_admin')) + '</a>' +
        '</div>' : '');
  }

  // Every data-go button behaves the same wherever it appears, so a screen that
  // wants to offer a tile does not have to re-implement the routing.
  function wireNav() {
    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () {
        const g = b.dataset.go;
        if (g === 'shop' || g === 'person' || g === 'member') freshThen(function () { startFlow(newPartyFlow(g)); });
        else if (g === 'road' || g === 'toto' || g === 'bus') startFlow(dailyFlow(g));
        else if (g === 'expense') startExpense();
        else if (g === 'handover') startHandover();
        else navigate(g);
      };
    });
  }

  let listFilter = 'all', listQuery = '';
  let findParties = [], findQuery = '';
  function renderList() {
    // LOOKING is not DOING. Somebody who has been granted nothing can still
    // read the ledger — it is the committee's own book and they are on the
    // committee. What their grants control is what they can ENTER, which is
    // the home screen's tiles and the chips below.
    // reads the central snapshot (+ own rows) locally — instant, all-collector
    viewData().then(function (data) {
      drawList(data, Aggregate.computeTotals(data).paidByParty);
    });
  }
  // Bus collections belong in the ledger, not in the daily-rounds report: a bus
  // is a named donor with a receipt, exactly like a shop. Rows come from the
  // `daily` store (type 'bus'), so they need their own renderer.
  function drawBusList(data) {
    const v = {}; (data.voids || []).forEach(function (x) { if (x.targetId) v[x.targetId] = 1; });
    let rows = (data.daily || []).filter(function (r) { return r.type === 'bus' && !v[r.id]; });
    if (listQuery) {
      const q = listQuery.toLowerCase();
      rows = rows.filter(function (r) {
        return String(r.busName || '').toLowerCase().indexOf(q) >= 0 ||
               String(r.busNumber || '').toLowerCase().indexOf(q) >= 0;
      });
    }
    rows.sort(function (a, b) { return String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')); });
    const total = rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
    return (rows.length ? '<div class="row" style="cursor:default"><div><b>' + esc(t('total')) +
        '</b><div class="row-sub">' + rows.length + ' ' + esc(t('daily_bus')) + '</div></div><b>' + fmtMoney(total) + '</b></div>' : '') +
      (rows.length ? rows.map(function (r) {
        return '<div class="row" data-busid="' + esc(r.id) + '"><div><b>' + esc(r.busName || t('daily_bus')) + '</b>' +
          '<div class="row-sub">' + esc(r.busNumber || '') + (r.busNumber ? ' • ' : '') + esc(fmtDate(r.date || r.createdAt)) +
          (r.collector ? ' • ' + esc(r.collector) : '') + (r.receiptNo ? ' • 🧾 ' + esc(r.receiptNo) : '') + '</div></div>' +
          '<div class="row-right">' + fmtMoney(r.amount) + '</div></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>');
  }
  // Category chips shared by the ledger and "দাতা খুঁজি" (someone else's donor),
  // so both screens read the same way. They mirror what this person may collect;
  // "সব" always shows, because a later instalment is common to everyone and you
  // must be able to look ANY donor up. `withBus` is off on find-party — you take
  // instalments from donors, and a bus pays once with a receipt.
  function typeChips(current, withBus) {
    const kinds = [['shop', t('type_shop')], ['person', t('type_person')], ['member', t('type_member')]]
      .concat(withBus ? [['bus', t('daily_bus')]] : []);
    const tabs = [['all', t('all')]].concat(kinds.filter(function (k) { return canEntry(k[0]); }));
    const valid = tabs.some(function (tb) { return tb[0] === current; }) ? current : 'all';
    return { valid: valid, html: '<div class="chips tabs">' + tabs.map(function (tb) {
      return '<button class="chip' + (valid === tb[0] ? ' on' : '') + '" data-f="' + tb[0] + '">' + esc(tb[1]) + '</button>';
    }).join('') + '</div>' };
  }
  // "শুধু বাকি" is a TOGGLE, not one more category — otherwise picking বাকি
  // threw away the category filter and every type came back mixed together.
  // Now দোকান + শুধু বাকি, ব্যক্তি + শুধু বাকি … all work.
  function dueChip(on) {
    return '<div class="chips" style="margin:-4px 0 10px"><button class="chip' + (on ? ' on' : '') +
      '" data-duetoggle="1">' + (on ? '🔴 ' : '') + esc(t('dues_only')) + '</button></div>';
  }
  let listDueOnly = false, findFilter = 'all', findDueOnly = false;
  function drawList(data, paidBy) {
      const chips = typeChips(listFilter, true);
      listFilter = chips.valid;
      const busRows = listFilter === 'bus';
      let rows = data.parties.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      if (listFilter !== 'all' && !busRows) rows = rows.filter(function (p) { return p.type === listFilter; });
      if (listDueOnly) rows = rows.filter(function (p) { return (Number(p.pledged) || 0) - (paidBy[p.id] || 0) > 0; });
      if (listQuery) rows = rows.filter(function (p) { return matchParty(p, listQuery); });
      $view().innerHTML =
        (canEntry('otherdonor') ? '<button id="find-party" class="ghost big block">🔍 ' + esc(t('find_party_btn')) + '</button>' : '') +
        '<input id="search" class="search" placeholder="' + esc(t('search')) + '" value="' + esc(listQuery) + '">' +
        chips.html + (busRows ? '' : dueChip(listDueOnly)) +
        (busRows ? drawBusList(data) :
        (rows.length ? rows.map(function (p) {
          const paid = paidBy[p.id] || 0, due = (Number(p.pledged) || 0) - paid;
          return '<div class="row" data-id="' + p.id + '">' +
            '<div><b>' + esc(p.name) + '</b><div class="row-sub">' +
            esc(t('type_' + p.type)) + (p.side ? ' • ' + esc(Lists.labelOf('area', p.side)) : '') +
            (p.location ? ' • ' + esc(Lists.labelOf('location', p.location)) : '') +
            (p.owner ? ' • ' + esc(p.owner) : '') + '</div></div>' +
            '<div class="row-right">' + fmtMoney(paid) + '/' + fmtMoney(p.pledged) +
            (due > 0 ? '<span class="due-chip">' + esc(t('due')) + ' ' + fmtMoney(due) + '</span>'
                     : '<span class="ok-chip">✅</span>') + '</div></div>';
        }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>'));
      const fpBtn = document.getElementById('find-party');
      if (fpBtn) fpBtn.onclick = function () { findQuery = ''; navigate('findparty'); };
      document.getElementById('search').oninput = function (e) { listQuery = e.target.value; renderList(); };
      document.querySelectorAll('[data-f]').forEach(function (c) {
        c.onclick = function () { listFilter = c.dataset.f; renderList(); };
      });
      const dueBtn = document.querySelector('[data-duetoggle]');
      if (dueBtn) dueBtn.onclick = function () { listDueOnly = !listDueOnly; renderList(); };
      document.querySelectorAll('.row[data-id]').forEach(function (r) {
        r.onclick = function () { navigate('party', { id: r.dataset.id }); };
      });
      // a bus row opens its receipt — the same one the collector shared at entry
      document.querySelectorAll('.row[data-busid]').forEach(function (r) {
        r.onclick = function () { navigate('receipt', { store: 'daily', id: r.dataset.busid, back: 'list' }); };
      });
  }
  // Find ANY party (created by any collector) and add a payment against its
  // balance — so a collector who receives a later installment can record it
  // even though they didn't create the party.
  function renderFindParty() {
    // Reaching donors somebody else wrote down is its own grant: it shows one
    // collector the whole committee's donor list, which is not every collector's
    // business. Guard the ROUTE too, not just the button — Back and history can
    // reach a screen whose button is hidden.
    if (!canEntry('otherdonor')) { navigate('list'); return; }
    const chips = typeChips(findFilter, false);
    findFilter = chips.valid;
    $view().innerHTML = backBar('list') + '<div class="flow-title">' + esc(t('find_party_title')) + '</div>' +
      '<div class="hint" style="margin-bottom:8px">' + esc(t('find_party_hint')) + '</div>' +
      '<input id="fp-search" class="search" placeholder="' + esc(t('search')) + '" value="' + esc(findQuery) + '">' +
      chips.html + dueChip(findDueOnly) +
      '<div id="fp-results"><div class="empty">' + esc(t('loading')) + '</div></div>';
    document.getElementById('fp-search').oninput = function (e) { findQuery = e.target.value; renderFPResults(); };
    document.querySelectorAll('[data-f]').forEach(function (c) {
      c.onclick = function () { findFilter = c.dataset.f; renderFindParty(); };
    });
    const dueBtn = document.querySelector('[data-duetoggle]');
    if (dueBtn) dueBtn.onclick = function () { findDueOnly = !findDueOnly; renderFindParty(); };
    refreshFindParty();
  }
  // Reloads the party data + results only, WITHOUT rebuilding the shell — so a
  // background pull can refresh the list in place without stealing input focus
  // or flashing the "loading" placeholder (which looked like blinking).
  function refreshFindParty() {
    return viewData().then(function (data) {              // local central snapshot — instant
      const paidBy = Aggregate.computeTotals(data).paidByParty;
      // "অন্য কারো দাতা" means exactly that — OTHER people's. One's own donors
      // are already the 📒 ledger's job; listing them here too made the two
      // screens the same list twice and buried the ones you actually came
      // looking for.
      const meId = Settings.get('collectorUsername') || Settings.get('collectorName');
      findParties = data.parties.filter(function (p) {
        return (p.collectorId || p.collector) !== meId;
      }).map(function (p) {
        return { id: p.id, name: p.name, type: p.type, side: p.side, location: p.location, owner: p.owner,
                 phone: p.phone, collector: p.collector, pledged: Number(p.pledged) || 0, paid: paidBy[p.id] || 0 };
      });
      renderFPResults();
    });
  }
  function renderFPResults() {
    const el = document.getElementById('fp-results'); if (!el) return;
    const rows = findParties.filter(function (p) {
      if (findFilter !== 'all' && p.type !== findFilter) return false;
      if (findDueOnly && (p.pledged || 0) - (p.paid || 0) <= 0) return false;
      return matchParty(p, findQuery);
    }).sort(function (a, b) { return ((b.pledged - b.paid) || 0) - ((a.pledged - a.paid) || 0); });
    el.innerHTML = rows.length ? rows.map(function (p) {
      const due = (p.pledged || 0) - (p.paid || 0);
      return '<div class="row" data-fp="' + esc(p.id) + '"><div><b>' + esc(p.name) + '</b><div class="row-sub">' +
        esc(t('type_' + p.type)) + (p.side ? ' • ' + esc(Lists.labelOf('area', p.side)) : '') +
        (p.collector ? ' • ' + esc(p.collector) : '') + '</div></div>' +
        '<div class="row-right">' + fmtMoney(p.paid) + '/' + fmtMoney(p.pledged) +
        (due > 0 ? '<span class="due-chip">' + esc(t('due')) + ' ' + fmtMoney(due) + '</span>'
                 : '<span class="ok-chip">✅</span>') + '</div></div>';
    }).join('') : '<div class="empty">' + esc(t('fp_none')) + '</div>';
    el.querySelectorAll('[data-fp]').forEach(function (r) {
      r.onclick = function () {
        const p = findParties.find(function (x) { return x.id === r.dataset.fp; });
        if (p) startFlow(paymentFlow(p, 'findparty'));
      };
    });
  }

  function renderParty(params) {
    viewData().then(function (data) {                    // central snapshot (+ own), instant
      const p = (data.parties || []).filter(function (x) { return x.id === params.id; })[0];
      if (!p) { navigate('list'); return; }
      const voidedOf = {};
      (data.voids || []).forEach(function (v) { if (v.targetStore === 'payments') voidedOf[v.targetId] = v.reason || '✓'; });
      const pays = (data.payments || []).filter(function (x) { return x.partyId === p.id; });
      drawParty(p, pays, true, voidedOf);
    });
  }
  // Renders a party card + a per-collector breakdown + the payment history.
  // `pays` is device-local (central=false) or all-collector (central=true).
  function drawParty(p, pays, central, voidedOf) {
    voidedOf = voidedOf || {};
    const live = pays.filter(function (x) { return voidedOf[x.id] === undefined; });
    const paid = live.reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
    const due = (Number(p.pledged) || 0) - paid;
    const byC = {}, nameByC = {};
    live.forEach(function (x) { const k = x.collectorId || x.collector || '?'; byC[k] = (byC[k] || 0) + (Number(x.amount) || 0); nameByC[k] = x.collector || k; });
    const keys = Object.keys(byC).sort(function (a, b) { return byC[b] - byC[a]; });
    const sorted = pays.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    $view().innerHTML = backBar('list') +
      '<div class="card"><div class="card-title">' + esc(p.name) + '</div>' +
      '<div class="row-sub">' + esc(t('type_' + p.type)) +
      (p.side ? ' • ' + esc(Lists.labelOf('area', p.side)) : '') +
      (p.location ? ' • ' + esc(Lists.labelOf('location', p.location)) : '') +
      (p.owner ? ' • ' + esc(p.owner) : '') +
      (p.phone ? ' • 📞 ' + esc(p.phone) : '') + '</div>' +
      '<div class="stat3">' +
      '<div><span>' + esc(t('pledged')) + '</span><b>' + fmtMoney(p.pledged) + '</b></div>' +
      '<div><span>' + esc(t('paid')) + '</span><b>' + fmtMoney(paid) + '</b></div>' +
      '<div class="' + (due > 0 ? 'red' : 'green') + '"><span>' + esc(t('due')) + '</span><b>' + fmtMoney(due) + '</b></div>' +
      '</div>' +
      '<button id="pay-btn" class="primary big block">💰 ' + esc(t('add_payment')) + '</button>' +
      (due > 0 && p.phone ? '<button id="remind-btn" class="ghost big block">📞 ' + esc(t('remind_btn')) + '</button>' : '') +
      '</div>' +
      (keys.length ? '<div class="section">' + esc(t('who_collected')) + '</div><div class="card">' +
        keys.map(function (k) {
          return '<div class="row" style="cursor:default"><div>' + esc(nameByC[k]) + '</div><b>' + fmtMoney(byC[k]) + '</b></div>';
        }).join('') + '</div>' : '') +
      '<div class="section">' + esc(t('payments_history')) +
        (central ? '' : ' <span class="row-sub">(' + esc(t('local_report')) + ')</span>') + '</div>' +
      (sorted.length ? sorted.map(function (x) {
        const isVoid = voidedOf[x.id] !== undefined;
        const reason = isVoid && voidedOf[x.id] !== '✓' ? ': ' + esc(voidedOf[x.id]) : '';
        return '<div class="row' + (isVoid ? ' voided' : '') + '"><div>' + esc(fmtDate(x.date || x.createdAt)) +
          '<div class="row-sub">' + esc(x.collector || '') + (x.note ? ' • ' + esc(x.note) : '') +
          (isVoid ? ' • <span class="void-tag">' + esc(t('voided_label')) + reason + '</span>' : '') + '</div></div>' +
          '<b>' + fmtMoney(x.amount) + '</b>' +
          (isVoid ? '' : '<button class="chip" data-receipt="' + esc(x.id) + '">🧾</button>') +
          (isVoid || !canVoid(x) ? '' : '<button class="chip void-btn" data-void="' + esc(x.id) + '">' + esc(t('void_btn')) + '</button>') + '</div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>');
    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.onclick = function () { startFlow(paymentFlow(p, 'list')); };
    const remindBtn = document.getElementById('remind-btn');
    if (remindBtn) remindBtn.onclick = function () {
      // opens WhatsApp with a pre-filled reminder — the collector still taps
      // send themselves (never auto-sent).
      const digits = String(p.phone || '').replace(/\D/g, '');
      if (!digits) { toast(t('no_phone')); return; }
      const num = digits.length === 10 ? '91' + digits : digits; // default +91
      const msg = t('remind_msg').replace('{name}', p.name).replace('{due}', fmtMoney(due));
      window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
    };
    document.querySelectorAll('[data-void]').forEach(function (b) {
      b.onclick = function () { renderVoidReason('payments', b.dataset.void, function () { navigate('party', { id: p.id }); }); };
    });
    document.querySelectorAll('[data-receipt]').forEach(function (b) {
      b.onclick = function () { navigate('receipt', { partyId: p.id, payId: b.dataset.receipt }); };
    });
  }
  // Integer rupees → Bengali words (Indian grouping), for "কথায়" on the receipt.
  function banglaNumWords(num) {
    num = Math.floor(Math.abs(Number(num)) || 0);
    const O = ['শূন্য', 'এক', 'দুই', 'তিন', 'চার', 'পাঁচ', 'ছয়', 'সাত', 'আট', 'নয়', 'দশ', 'এগারো', 'বারো', 'তেরো', 'চৌদ্দ', 'পনেরো', 'ষোলো', 'সতেরো', 'আঠারো', 'উনিশ', 'কুড়ি', 'একুশ', 'বাইশ', 'তেইশ', 'চব্বিশ', 'পঁচিশ', 'ছাব্বিশ', 'সাতাশ', 'আটাশ', 'ঊনত্রিশ', 'ত্রিশ', 'একত্রিশ', 'বত্রিশ', 'তেত্রিশ', 'চৌত্রিশ', 'পঁয়ত্রিশ', 'ছত্রিশ', 'সাঁইত্রিশ', 'আটত্রিশ', 'ঊনচল্লিশ', 'চল্লিশ', 'একচল্লিশ', 'বিয়াল্লিশ', 'তেতাল্লিশ', 'চুয়াল্লিশ', 'পঁয়তাল্লিশ', 'ছেচল্লিশ', 'সাতচল্লিশ', 'আটচল্লিশ', 'ঊনপঞ্চাশ', 'পঞ্চাশ', 'একান্ন', 'বায়ান্ন', 'তিপ্পান্ন', 'চুয়ান্ন', 'পঞ্চান্ন', 'ছাপ্পান্ন', 'সাতান্ন', 'আটান্ন', 'ঊনষাট', 'ষাট', 'একষট্টি', 'বাষট্টি', 'তেষট্টি', 'চৌষট্টি', 'পঁয়ষট্টি', 'ছেষট্টি', 'সাতষট্টি', 'আটষট্টি', 'ঊনসত্তর', 'সত্তর', 'একাত্তর', 'বাহাত্তর', 'তিয়াত্তর', 'চুয়াত্তর', 'পঁচাত্তর', 'ছিয়াত্তর', 'সাতাত্তর', 'আটাত্তর', 'ঊনআশি', 'আশি', 'একাশি', 'বিরাশি', 'তিরাশি', 'চুরাশি', 'পঁচাশি', 'ছিয়াশি', 'সাতাশি', 'আটাশি', 'ঊননব্বই', 'নব্বই', 'একানব্বই', 'বিরানব্বই', 'তিরানব্বই', 'চুরানব্বই', 'পঁচানব্বই', 'ছিয়ানব্বই', 'সাতানব্বই', 'আটানব্বই', 'নিরানব্বই'];
    if (num === 0) return O[0];
    const p = [];
    const cr = Math.floor(num / 10000000); num %= 10000000;
    const lk = Math.floor(num / 100000); num %= 100000;
    const th = Math.floor(num / 1000); num %= 1000;
    const hu = Math.floor(num / 100); num %= 100;
    if (cr) p.push(O[cr] + ' কোটি');
    if (lk) p.push(O[lk] + ' লক্ষ');
    if (th) p.push(O[th] + ' হাজার');
    if (hu) p.push(O[hu] + ' শো');
    if (num) p.push(O[num]);
    return p.join(' ');
  }
  function toBengaliDigits(s) { return String(s).replace(/[0-9]/g, function (d) { return '০১২৩৪৫৬৭৮৯'[d]; }); }
  // receipt money: ₹ + Indian grouping in Bengali digits — "₹১,৫০০".
  function rcpMoney(n) { return '₹' + toBengaliDigits(Number(n || 0).toLocaleString('en-IN')); }
  // Live vs training. The system starts in training; admin flips it via goLive.
  function isLive() { return (centralConfig || {}).live_mode === 'on'; }
  // The committee's puja name (admin-set) stands in for the app title everywhere
  // it shows; falls back to "চাঁদা খাতা" until an admin sets it.
  function pujaName() { return (centralConfig && centralConfig.puja_name) || t('app_title'); }
  // Search normalisation: NFC (so Bengali composed/decomposed forms match),
  // trim, collapse spaces, and lowercase (English). Bengali has no case, so
  // this works for both scripts.
  function normText(s) { return String(s == null ? '' : s).normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim(); }
  // A party matches if EVERY word in the query appears somewhere across its
  // name, owner, phone, area and location — so "কমল মালদা" or "9998 malda" work.
  function matchParty(p, query) {
    const q = normText(query); if (!q) return true;
    const hay = normText([p.name, p.owner, p.phone,
      p.side ? Lists.labelOf('area', p.side) : '', p.location ? Lists.labelOf('location', p.location) : ''].join(' '));
    return q.split(' ').every(function (w) { return hay.indexOf(w) >= 0; });
  }
  // Which things this user may collect (admin sets it per user; empty = all, so
  // nobody is accidentally locked out). Keys are the six collection categories
  // plus 'review' — see Aggregate.PERM_KEYS for the whole story. Passing a
  // falsy key means "common to everyone" and is always allowed.
  function canEntry(key) { return Aggregate.permAllowed(Auth.current(), key); }
  // The cashier's correction desk is now its own grant. Base requirement is
  // unchanged (cashier or admin); on top of that the admin may withhold it.
  function canReview() { return Auth.isCashier() && canEntry('review'); }
  // Persistent training strip under the header — shows on EVERY screen until the
  // admin goes live (it lives outside #view, so a re-render can't drop it). Also
  // keeps the header title in sync with the puja name.
  function updateTrainingBar() {
    const at = document.getElementById('app-title');
    if (at && Auth.loggedIn()) at.textContent = '🙏 ' + pujaName();
    const el = document.getElementById('training-bar'); if (!el) return;
    if (isLive() || !Auth.loggedIn()) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.cssText = 'display:block;background:#f6b93b;color:#5a3a00;text-align:center;' +
      'font-weight:bold;font-size:14px;padding:7px 12px;border-bottom:2px solid #d9891a;line-height:1.35';
    el.innerHTML = '🟡 ' + esc(t('training_mode')) + ' — ' + esc(t('training_hint'));
  }
  // admin-configured receipt design (falls back to sensible defaults)
  function receiptConfig() {
    const c = centralConfig || {};
    return {
      layout: c.receipt_layout || 'classic',
      puja: c.puja_name || c.committee_name || t('app_title'), // top, big
      committee: c.committee_name || '',                        // bottom, signatory
      footer: c.receipt_footer || t('receipt_thanks'),
      color: c.receipt_color || '#c0392b',
      logo: c.committee_logo || '',
    };
  }
  // Build a donation-receipt canvas from a data object, honouring the admin's
  // layout + branding. Async (a logo may need loading) → returns a Promise.
  // rc: {donorName, donorSub, date, amount, cashUpi, paidTotal, pledged, due,
  //      collector, receiptNo}
  function buildReceiptCanvas(rc, cfgOverride) {
    const cfg = cfgOverride || receiptConfig();
    return new Promise(function (resolve) {
      const W = 720, H = 620, c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d'), accent = cfg.color, ink = '#1e1a17', muted = '#7a7167';
      const year = String(Settings.get('year') || '');
      const wrap = function (text, x, y, maxW, lh, align) {
        const words = String(text).split(' '); let line = '';
        for (let i = 0; i < words.length; i++) {
          const test = line ? line + ' ' + words[i] : words[i];
          if (g.measureText(test).width > maxW && line) { g.fillText(line, align === 'center' ? W / 2 : x, y); line = words[i]; y += lh; }
          else line = test;
        }
        if (line) { g.fillText(line, align === 'center' ? W / 2 : x, y); y += lh; }
        return y;
      };
      const draw = function (logoImg) {
        g.fillStyle = '#fffdf8'; g.fillRect(0, 0, W, H); // warm paper
        const drawLogo = function (x, y, s) { if (logoImg) { try { g.drawImage(logoImg, x, y, s, s); } catch (e) {} } };
        // ---- decorative frame ----
        if (cfg.layout === 'minimal') {
          g.strokeStyle = '#e6ddcf'; g.lineWidth = 1; g.strokeRect(18, 18, W - 36, H - 36);
        } else {
          g.strokeStyle = accent; g.lineWidth = 10; g.strokeRect(12, 12, W - 24, H - 24);
          g.strokeStyle = accent; g.lineWidth = 2; g.strokeRect(26, 26, W - 52, H - 52);
          // corner diamonds
          [[26, 26], [W - 26, 26], [26, H - 26], [W - 26, H - 26]].forEach(function (pt) {
            g.save(); g.translate(pt[0], pt[1]); g.rotate(Math.PI / 4); g.fillStyle = accent; g.fillRect(-7, -7, 14, 14); g.restore();
          });
        }
        // ---- header: invocation + committee ----
        g.textAlign = 'center';
        g.fillStyle = accent; g.font = '19px serif';
        g.fillText('ॐ  শ্রী শ্রী সিদ্ধিদাতা গণেশায় নমঃ', W / 2, 66);
        drawLogo(W / 2 - 30, 78, 60);
        g.fillStyle = accent; g.font = 'bold 34px sans-serif';
        g.fillText(cfg.puja, W / 2, 176);
        g.fillStyle = muted; g.font = '18px sans-serif';
        g.fillText('প্রাপ্তি রসিদ  ·  বর্ষ ' + toBengaliDigits(year), W / 2, 204);
        // divider
        g.strokeStyle = '#e6ddcf'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(60, 224); g.lineTo(W - 60, 224); g.stroke();
        g.textAlign = 'left';
        // ---- serial (red, right) ----
        g.textAlign = 'right'; g.fillStyle = '#c0201a'; g.font = 'bold 20px sans-serif';
        g.fillText('নং  ' + (rc.receiptNo || '—'), W - 60, 258);
        // A correction re-uses the ORIGINAL serial, so the donor gets a second
        // message carrying the same number. Without this stamp they would
        // reasonably think they had been counted twice — and it goes in the
        // IMAGE, because a caption is the part an app may throw away.
        if (rc.corrected) {
          g.textAlign = 'right'; g.fillStyle = '#c0201a'; g.font = 'bold 15px sans-serif';
          g.fillText(t('rcp_corrected_stamp'), W - 60, 280);
        }
        g.textAlign = 'left';
        // ---- body: prose acknowledgement ----
        let y = 292; const lx = 62, maxW = W - 124;
        g.fillStyle = ink; g.font = '22px sans-serif';
        y = wrap(rc.donorLine + '  এর নিকট হইতে শ্রী শ্রী গণেশ পূজার চাঁদা বাবদ —', lx, y, maxW, 34);
        y += 12;
        g.fillStyle = accent; g.font = 'bold 32px sans-serif';
        const amtTxt = rcpMoney(rc.amount) + '/-';
        g.fillText(amtTxt, lx, y);
        const amtW = g.measureText(amtTxt).width;
        g.fillStyle = ink; g.font = 'italic 21px sans-serif';
        g.fillText('(' + banglaNumWords(rc.amount) + ' টাকা মাত্র)', lx + amtW + 24, y); y += 40;
        g.fillStyle = ink; g.font = '22px sans-serif';
        g.fillText('সাদরে গৃহীত হইল।' + (rc.cashUpi ? '   ' + rc.cashUpi : ''), lx, y); y += 44;
        // totals strip (party payments only — a bus/one-off has no pledge)
        if (rc.showTotals) {
          g.fillStyle = muted; g.font = '18px sans-serif';
          g.fillText('প্রতিশ্রুত ' + rcpMoney(rc.pledged) + '    ·    মোট জমা ' + rcpMoney(rc.paidTotal) + '    ·    বাকি ' + rcpMoney(rc.due), lx, y);
        }
        // ---- date+time (left) + signatory block (right) ----
        const sy = H - 96;
        g.fillStyle = ink; g.font = '17px sans-serif';
        g.fillText('তারিখ ও সময়: ' + toBengaliDigits(fmtDateTime(rc.datetime || rc.date)), lx, sy);
        g.textAlign = 'right';
        g.fillStyle = muted; g.font = '17px sans-serif';
        g.fillText(t('receipt_thanking'), W - 62, sy);
        g.fillStyle = accent; g.font = 'bold 19px sans-serif';
        g.fillText(cfg.committee || cfg.puja, W - 62, sy + 26);
        g.textAlign = 'left';
        // ---- footer ----
        g.textAlign = 'center'; g.fillStyle = accent; g.font = 'italic 20px serif';
        g.fillText(cfg.footer, W / 2, H - 40);
        g.textAlign = 'left';
        // ---- training watermark (diagonal, until admin goes live) ----
        if (!isLive()) {
          g.save(); g.translate(W / 2, H / 2); g.rotate(-Math.PI / 8);
          g.fillStyle = 'rgba(180,120,120,0.22)'; g.font = 'bold 84px sans-serif'; g.textAlign = 'center';
          g.fillText('নমুনা · SAMPLE', 0, 0); g.restore();
        }
        resolve(c);
      };
      if (cfg.logo) { const im = new Image(); im.onload = function () { draw(im); }; im.onerror = function () { draw(null); }; im.src = cfg.logo; }
      else draw(null);
    });
  }
  function canvasToBlob(c) {
    return new Promise(function (res) {
      if (c.toBlob) c.toBlob(res);
      else { const u = c.toDataURL('image/png'), bin = atob(u.split(',')[1]), a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); res(new Blob([a], { type: 'image/png' })); }
    });
  }
  const cashUpiNote = function (r) {
    return (Number(r.upiAmount) > 0 && Number(r.cashAmount) > 0)
      ? '(' + t('cash') + ' ' + fmtMoney(r.cashAmount) + ' + UPI ' + fmtMoney(r.upiAmount) + ')' : '';
  };
  // Acknowledgement subject, by donor type:
  //  person/member → শ্রী/শ্রীমতী <name>
  //  shop          → শ্রী/শ্রীমতী <owner>, <shop name>  (owner optional)
  //  bus (daily)   → <bus name> (নং <number>) — no honorific
  function partyDonorLine(p) {
    if (p.type === 'shop') {
      return p.owner ? 'শ্রী/শ্রীমতী ' + p.owner + ', ' + p.name : p.name;
    }
    return 'শ্রী/শ্রীমতী ' + p.name;
  }
  function rcFromPayment(p, pay, paidTotal, due) {
    return { donorLine: partyDonorLine(p), showTotals: true,
      date: pay.date || pay.createdAt, datetime: pay.createdAt || pay.date,
      amount: pay.amount, cashUpi: cashUpiNote(pay),
      paidTotal: paidTotal, pledged: p.pledged, due: due, receiptNo: pay.receiptNo || '' };
  }
  // Receipt for a daily bus collection (name + number, one-off → no totals).
  function rcFromDailyBus(d) {
    return { donorLine: (d.busName || t('type_bus')) + (d.busNumber ? ' (নং ' + d.busNumber + ')' : ''),
      showTotals: false, date: d.date || d.createdAt, datetime: d.createdAt || d.date,
      amount: d.amount, cashUpi: cashUpiNote(d), receiptNo: d.receiptNo || '' };
  }
  // The words that go WITH a receipt, wherever it is sent. One function, so the
  // WhatsApp caption and the SMS body can never say different things.
  function receiptMessage(rc) {
    const cfg = receiptConfig();
    return [
      '🙏 ' + cfg.committee,
      t('rcp_msg_thanks'),
      rc.corrected ? t('rcp_msg_corrected') : '',
      '',
      rc.donorLine,
      t('receipt_amount') + ': ' + rcpMoney(rc.amount) + '/- (' + banglaNumWords(rc.amount) + ' টাকা মাত্র)',
      (rc.showTotals ? t('paid') + ': ' + rcpMoney(rc.paidTotal) + '/' + rcpMoney(rc.pledged) +
        '   ' + t('due') + ': ' + rcpMoney(rc.due) : ''),
      (rc.receiptNo ? t('receipt_no') + ' ' + rc.receiptNo : '') +
        (rc.date ? ' · ' + fmtDate(rc.date) : ''),
      cfg.footer,
    ].filter(function (x) { return x !== ''; }).join('\n');
  }
  // 📷 image receipt → Web Share (WhatsApp etc.); download fallback offline.
  // The text rides along as the caption where the target app keeps it — Android
  // WhatsApp usually does, iOS often drops it when a file is attached. That is
  // their behaviour, not ours, and nothing is lost when it happens: every word
  // of the message is also drawn INSIDE the receipt image.
  function shareReceiptImage(rc) {
    buildReceiptCanvas(rc).then(canvasToBlob).then(function (blob) {
      const file = new File([blob], 'receipt.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: t('receipt_title'), text: receiptMessage(rc) }).catch(function () {});
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = 'receipt-' + (rc.donorName || 'chanda') + '.png'; a.click();
        toast(t('receipt_saved'));
      }
    });
  }
  // 💬 text receipt → SMS/message (an image can't ride SMS). Opens the messaging
  // app with the text pre-filled; the collector taps send.
  function shareReceiptText(rc, phone) {
    const lines = receiptMessage(rc);
    const digits = String(phone || '').replace(/\D/g, '');
    const num = digits ? (digits.length === 10 ? '+91' + digits : '+' + digits.replace(/^0/, '')) : '';
    // `?body=` works on Android; iOS is lenient with it too
    window.open('sms:' + num + '?body=' + encodeURIComponent(lines), '_blank');
  }
  // Receipt screen for a party payment ({partyId, payId}) OR a daily bus entry
  // ({store:'daily', id}). Ensures the server serial (syncs first if needed).
  function renderReceiptShare(params) {
    const isBus = params.store === 'daily';
    // a bus receipt can be reached from two places (my entries, and the
    // ledger's bus tab) — go back where the user actually came from
    const backView = isBus ? (params.back || 'entries') : 'party', backParams = isBus ? undefined : { id: params.partyId };
    $view().innerHTML = backBar(backView, backParams) + '<div class="empty">' + esc(t('loading')) + '</div>';
    viewData().then(function (data) {
      let rc, phone = '', store, id, party = null;
      if (isBus) {
        const d = (data.daily || []).filter(function (x) { return x.id === params.id; })[0];
        if (!d) { navigate('entries'); return; }
        rc = rcFromDailyBus(d); store = 'daily'; id = d.id;
      } else {
        const p = (data.parties || []).filter(function (x) { return x.id === params.partyId; })[0];
        const pay = (data.payments || []).filter(function (x) { return x.id === params.payId; })[0];
        if (!p || !pay) { navigate('list'); return; }
        const voided = {}; (data.voids || []).forEach(function (v) { if (v.targetStore === 'payments') voided[v.targetId] = 1; });
        const paid = (data.payments || []).filter(function (x) { return x.partyId === p.id && !voided[x.id]; })
          .reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
        rc = rcFromPayment(p, pay, paid, (Number(p.pledged) || 0) - paid); phone = p.phone; store = 'payments'; id = pay.id;
        party = p;
      }
      // Fast-continue, same idea as the daily add-another screen:
      //  - bus → another bus entry (unambiguous, no search involved).
      //  - a payment reached via search/list (params.origin set) → back to
      //    that same search, NOT a "new entry" (a payment targets a party
      //    someone already picked, so there's no natural "next" to create).
      //  - a brand-new party's first payment (no origin) → another same-type
      //    party, side sticky for shops — this is what "bulk mode" used to do.
      let contHtml = '', contWire = function () {};
      if (isBus) {
        contHtml = '<button id="rcp-again" class="ghost big block">➕ ' + esc(t('daily_bus')) + '</button>' +
          '<button id="rcp-skip" class="ghost big block">' + esc(t('done_for_now')) + '</button>';
        contWire = function () {
          document.getElementById('rcp-again').onclick = function () { startFlow(dailyFlow('bus')); };
          document.getElementById('rcp-skip').onclick = function () { navigate('home'); };
        };
      } else if (params.origin) {
        contHtml = '<button id="rcp-again" class="ghost big block">' + esc(t('back_to_search')) + '</button>' +
          '<button id="rcp-skip" class="ghost big block">' + esc(t('done_for_now')) + '</button>';
        contWire = function () {
          document.getElementById('rcp-again').onclick = function () { navigate(params.origin); };
          document.getElementById('rcp-skip').onclick = function () { navigate('home'); };
        };
      } else {
        contHtml = '<button id="rcp-again" class="ghost big block">' + esc(t('one_more')) + ' ' + esc(t('new_' + party.type)) + '</button>' +
          '<button id="rcp-skip" class="ghost big block">' + esc(t('done_for_now')) + '</button>';
        contWire = function () {
          document.getElementById('rcp-again').onclick = function () {
            startFlow(newPartyFlow(party.type, party.type === 'shop' ? { side: party.side } : {})); };
          document.getElementById('rcp-skip').onclick = function () { navigate('home'); };
        };
      }
      // same serial on a voided row → this receipt replaces an earlier one
      if (rc.receiptNo) {
        const voided = {}; (data.voids || []).forEach(function (v) { if (v.targetId) voided[v.targetId] = 1; });
        rc.corrected = (data.payments || []).concat(data.daily || []).some(function (r) {
          return r.id !== id && voided[r.id] && String(r.receiptNo || '') === String(rc.receiptNo);
        });
      }
      const paint = function () {
        $view().innerHTML = backBar(backView, backParams) + '<div class="flow-title">' + esc(t('receipt_title')) + '</div>' +
          '<img id="rcp-img" alt="" style="width:100%;max-width:420px;display:block;margin:0 auto 12px;border:1px solid #eee;border-radius:10px">' +
          (rc.receiptNo ? '' : '<div class="hint" style="text-align:center">' + esc(t('receipt_no_pending')) + '</div>') +
          '<button id="rcp-wa" class="primary big block">📷 ' + esc(t('receipt_send_img')) + '</button>' +
          '<button id="rcp-sms" class="ghost big block">💬 ' + esc(t('receipt_send_sms')) + '</button>' + contHtml;
        buildReceiptCanvas(rc).then(function (cv) { const im = document.getElementById('rcp-img'); if (im) im.src = cv.toDataURL('image/png'); });
        document.getElementById('rcp-wa').onclick = function () { shareReceiptImage(rc); };
        document.getElementById('rcp-sms').onclick = function () { shareReceiptText(rc, phone); };
        contWire();
      };
      paint();
      // if no serial yet, sync + pull to obtain one, then redraw
      if (!rc.receiptNo && navigator.onLine && Sync.configured()) {
        Sync.syncNow().then(function () { return pullCentral(); }).then(function () {
          return viewData().then(function (d2) {
            const e2 = (d2[store] || []).filter(function (x) { return x.id === id; })[0];
            if (e2 && e2.receiptNo && current.view === 'receipt') { rc.receiptNo = e2.receiptNo; paint(); }
          });
        }).catch(function () {});
      }
    });
  }

  // Void a payment (audit-preserving correction): records a reason into the
  // `voids` store; aggregation then drops that payment id everywhere.
  // Separation of duties: who may void an entry.
  //  admin → anything · cashier → a regular collector's entry (not own) ·
  //  collector → nothing (they flag/request instead).
  function canVoid(entry) {
    const u = Auth.current();
    if (!u) return false;
    if (u.role === 'admin') return true;
    const myId = Settings.get('collectorUsername') || u.username;
    if (entry.collectorId && entry.collectorId === myId) return false; // never one's own
    // rowRole, not a raw compare: the server used to store the Users-sheet word
    // ('user'), which never equalled 'collector' — so this silently returned
    // false for every collector's entry and the cashier saw no Undo at all.
    if (u.cashier === 1) return Aggregate.rowRole(entry.collectorRole) === 'collector';
    return false;
  }
  // one-line description of any entry (for lists + a flag's stored summary)
  function entrySummary(store, r) {
    const amt = fmtMoney(r.amount);
    if (store === 'payments') return (r.partyName || '?') + ' — ' + amt;
    if (store === 'daily') return t('type_' + r.type) + ' — ' + amt;
    if (store === 'expenses') return (r.subject || r.desc || t('expense')) + ' — ' + amt;
    if (store === 'handovers') return t('handover') + ' → ' + (r.to || '?') + ' — ' + amt;
    return amt;
  }
  function renderVoidReason(targetStore, targetId, backFn) {
    $view().innerHTML = '<button class="ghost back-bar" id="void-back">← ' + esc(t('back')) + '</button>' +
      '<div class="card center onboard"><div class="big-emoji">✖️</div>' +
      '<h2>' + esc(t('void_title')) + '</h2>' +
      '<div class="hint">' + esc(t('void_hint')) + '</div>' +
      '<div class="field"><label>' + esc(t('q_void_reason')) + '</label><input id="void-reason" autocomplete="off"></div>' +
      '<button id="void-ok" class="primary big block">' + esc(t('void_confirm')) + '</button>' +
      '<button id="void-cancel" class="ghost block">' + esc(t('cancel')) + '</button></div>';
    document.getElementById('void-back').onclick = backFn;
    document.getElementById('void-cancel').onclick = backFn;
    document.getElementById('void-ok').onclick = function () {
      const reason = document.getElementById('void-reason').value.trim();
      if (!reason) { toast(t('void_need_reason')); return; }
      this.disabled = true;
      DB.put('voids', DB.newRow({ targetStore: targetStore, targetId: targetId, reason: reason }))
        .then(function () { toast(t('voided_done')); updateBadge(); autoSync(); backFn(); });
    };
  }
  // Correcting your own flagged entry. The old row is voided and a new one
  // written (see finishFlow) — so it reads as an edit, but the book stays
  // append-only and the previous values survive for anyone who asks.
  function startEdit(store, row, reason) {
    const money = {
      payMode: (Number(row.cashAmount) > 0 && Number(row.upiAmount) > 0) ? 'both'
             : (Number(row.upiAmount) > 0 ? 'upi' : 'cash'),
      cashAmount: Number(row.cashAmount) || (Number(row.upiAmount) ? 0 : Number(row.amount) || 0),
      upiAmount: Number(row.upiAmount) || 0,
      note: row.note || '',
    };
    let def = null;
    if (store === 'payments') {
      def = paymentFlow({ id: row.partyId, name: row.partyName || '' }, 'entries');
      def.presets = Object.assign({ __receipt: row.receiptNo || '' }, money);
    } else if (store === 'daily') {
      def = dailyFlow(row.type);
      def.presets = Object.assign({ busName: row.busName || '', busNumber: row.busNumber || '',
                                    __receipt: row.receiptNo || '' }, money);
    } else if (store === 'expenses') {
      // the expense flow needs its subject list; reuse the same loader the
      // normal entry path uses so an offline edit still works
      startExpense({ presets: Object.assign({ subject: row.subject || '', comment: row.desc || '',
                                              srcCat: row.srcCat || '' }, money),
                     editing: { store: store, id: row.id, reason: reason } });
      return;
    }
    if (!def) return;
    def.editing = { store: store, id: row.id, reason: reason };
    def.title = t('edit_title') + ' — ' + def.title;
    def.returnTo = 'entries';
    startFlow(def);
  }
  // A collector can't void their own entry — they flag it for a cashier/admin.
  function renderFlag(targetStore, targetId, summary, backFn) {
    $view().innerHTML = '<button class="ghost back-bar" id="flag-back">← ' + esc(t('back')) + '</button>' +
      '<div class="card center onboard"><div class="big-emoji">⚠️</div>' +
      '<h2>' + esc(t('flag_title')) + '</h2>' +
      '<div class="hint">' + esc(t('flag_hint')) + '</div>' +
      (summary ? '<div class="row" style="cursor:default"><b>' + esc(summary) + '</b></div>' : '') +
      '<div class="field"><label>' + esc(t('q_void_reason')) + '</label><input id="flag-reason" autocomplete="off"></div>' +
      '<button id="flag-ok" class="primary big block">' + esc(t('flag_confirm')) + '</button>' +
      '<button id="flag-cancel" class="ghost block">' + esc(t('cancel')) + '</button></div>';
    document.getElementById('flag-back').onclick = backFn;
    document.getElementById('flag-cancel').onclick = backFn;
    document.getElementById('flag-ok').onclick = function () {
      const reason = document.getElementById('flag-reason').value.trim();
      if (!reason) { toast(t('void_need_reason')); return; }
      this.disabled = true;
      DB.put('corrections', DB.newRow({ targetStore: targetStore, targetId: targetId,
        targetSummary: summary, reason: reason, status: 'pending' }))
        .then(function () { toast(t('flagged_done')); updateBadge(); autoSync(); backFn(); });
    };
  }
  // "My entries" — the device's own entries, each voidable (if permitted) or
  // flaggable (if it's your own and you can't self-void).
  let entriesScope = 'mine'; // 'mine' = this device's own | 'all' = everyone's daily/expense (from the snapshot)
  function renderMyEntries() {
    const all = entriesScope === 'all';
    // "all" spans every collector, so it must read the central snapshot, not
    // just this device. Payments stay out of "all" — party detail already shows
    // every collector's payments, and all payments together would be a wall.
    (all ? viewData() : DB.allData()).then(function (data) {
      const voided = {}; (data.voids || []).forEach(function (v) { voided[v.targetId] = 1; });
      const flagged = {}; (data.corrections || []).forEach(function (c) { if (c.status !== 'rejected') flagged[c.targetId] = 1; });
      const meId = Settings.get('collectorUsername') || Settings.get('collectorName');
      const mine = function (r) { return (r.collectorId || r.collector) === meId; };
      const stores = all ? ['daily', 'expenses'] : ['payments', 'daily', 'expenses', 'handovers'];
      const list = [];
      stores.forEach(function (store) {
        (data[store] || []).forEach(function (r) { if (all || mine(r)) list.push({ store: store, r: r }); });
      });
      list.sort(function (a, b) { return String(b.r.createdAt || '').localeCompare(String(a.r.createdAt || '')); });
      const rowsHTML = list.length ? list.map(function (it) {
        const r = it.r, isVoid = !!voided[r.id], isFlag = !!flagged[r.id];
        const who = all ? ' • 🧑 ' + esc(r.collector || r.collectorId || '?') : ''; // who made it
        const tag = isVoid ? ' • <span class="void-tag">' + esc(t('voided_label')) + '</span>'
          : isFlag ? ' • <span class="void-tag">⚠️ ' + esc(t('flag_pending')) + '</span>'
          : r.rejected ? ' • <span class="void-tag">' + esc(t('rejected_label')) + '</span>' : '';
        const busReceipt = (!isVoid && it.store === 'daily' && r.type === 'bus')
          ? '<button class="chip" data-drcp="' + esc(r.id) + '">🧾</button>' : '';
        // Once you have flagged your OWN entry you may fix it yourself: you have
        // declared it wrong, and nobody knows better than you what it should
        // say. Only the person who made it, and only these three stores — a
        // handover has two sides and is settled by confirming, not editing.
        const mineNow = (r.collectorId || r.collector) === meId;
        const canEdit = isFlag && !isVoid && mineNow &&
          ['payments', 'daily', 'expenses'].indexOf(it.store) >= 0;
        const editBtn = canEdit
          ? '<button class="chip void-btn" data-ed="' + it.store + '|' + esc(r.id) + '">✏️ ' + esc(t('fix_btn')) + '</button>'
          : '';
        const action = busReceipt + editBtn + ((isVoid || isFlag) ? '' :
          (canVoid(r) ? '<button class="chip void-btn" data-vd="' + it.store + '|' + esc(r.id) + '">' + esc(t('void_btn')) + '</button>'
                      : '<button class="chip void-btn" data-fl="' + it.store + '|' + esc(r.id) + '">' + esc(t('flag_btn')) + '</button>'));
        return '<div class="row' + (isVoid ? ' voided' : '') + '" style="cursor:default"><div style="flex:1 1 60%"><b>' +
          esc(entrySummary(it.store, r)) + '</b><div class="row-sub">' + esc(fmtDate(r.date || r.createdAt)) + who + tag + '</div>' +
          (it.store === 'handovers' ? breakdownLines(r) : '') + '</div>' +
          action + '</div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>';
      const tabs = '<div class="chips tabs" style="margin-bottom:10px">' +
        '<button class="chip' + (all ? '' : ' on') + '" data-escope="mine">' + esc(t('entries_mine')) + '</button>' +
        '<button class="chip' + (all ? ' on' : '') + '" data-escope="all">' + esc(t('entries_all')) + '</button></div>';
      $view().innerHTML = backBar('home') + '<div class="flow-title">' + esc(t('my_entries_title')) + '</div>' + tabs +
        '<div class="hint" style="margin-bottom:10px">' + esc(t(all ? 'entries_all_hint' : 'my_entries_hint')) + '</div>' + rowsHTML;
      document.querySelectorAll('[data-escope]').forEach(function (b) {
        b.onclick = function () { entriesScope = b.dataset.escope; renderMyEntries(); };
      });
      document.querySelectorAll('[data-vd]').forEach(function (b) {
        b.onclick = function () { const p = b.dataset.vd.split('|'); renderVoidReason(p[0], p[1], function () { navigate('entries'); }); };
      });
      document.querySelectorAll('[data-fl]').forEach(function (b) {
        b.onclick = function () {
          const p = b.dataset.fl.split('|'), it = list.find(function (x) { return x.r.id === p[1]; });
          renderFlag(p[0], p[1], it ? entrySummary(p[0], it.r) : '', function () { navigate('entries'); });
        };
      });
      document.querySelectorAll('[data-ed]').forEach(function (b) {
        b.onclick = function () {
          const p = b.dataset.ed.split('|'), it = list.find(function (x) { return x.r.id === p[1]; });
          if (!it) return;
          const c = (data.corrections || []).filter(function (x) { return x.targetId === p[1] && x.status !== 'rejected'; })[0];
          startEdit(it.store, it.r, c ? c.reason : '');
        };
      });
      document.querySelectorAll('[data-drcp]').forEach(function (b) {
        b.onclick = function () { navigate('receipt', { store: 'daily', id: b.dataset.drcp }); };
      });
    });
  }
  // Cashier/admin: review collectors' correction flags → approve (void) / reject.
  function renderReviewCorrections() {
    if (!canReview()) { $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('not_cashier')) + '</div>'; return; }
    $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('loading')) + '</div>';
    Promise.all([
      Auth.call('pendingCorrections', { token: Auth.token(), year: Settings.get('year') }),
      viewData(),
    ]).then(function (both) {
      const resp = both[0], data = both[1];
      // A flag whose target the author has already corrected is settled — the
      // old row is voided and a new one stands in its place. Showing it here
      // would invite a second void on a row that is already gone.
      const done = {}; (data.voids || []).forEach(function (v) { if (v.targetId) done[v.targetId] = 1; });
      const list = (resp.corrections || []).filter(function (c) { return !done[c.targetId]; });
      const html = list.length ? list.map(function (c) {
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 100%"><b>' +
          esc(c.targetSummary || c.targetStore) + '</b><div class="row-sub">' + esc(c.collector || '') +
          ' • ' + esc(c.reason) + '</div></div><div class="chips" style="margin-top:8px">' +
          '<button class="chip" data-corr-ok="' + esc(c.id) + '">' + esc(t('corr_approve')) + '</button>' +
          '<button class="chip" data-corr-no="' + esc(c.id) + '">' + esc(t('corr_reject')) + '</button></div></div>';
      }).join('') : '<div class="empty">' + esc(t('none_here')) + '</div>';
      $view().innerHTML = backBar('home') + '<div class="flow-title">' + esc(t('review_title')) + '</div>' + html;
      const resolve = function (id, decision, okMsg) {
        return function () {
          this.disabled = true;
          Auth.call('resolveCorrection', { token: Auth.token(), id: id, decision: decision })
            .then(function () { toast(okMsg); renderReviewCorrections(); })
            .catch(function (e) { toast(errMsg(e)); renderReviewCorrections(); });
        };
      };
      document.querySelectorAll('[data-corr-ok]').forEach(function (b) { b.onclick = resolve(b.dataset.corrOk, 'approve', t('voided_done')); });
      document.querySelectorAll('[data-corr-no]').forEach(function (b) { b.onclick = resolve(b.dataset.corrNo, 'reject', t('corr_rejected')); });
    }).catch(function () { $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('needs_net')) + '</div>'; });
  }

  function totalsHTML(tt, title) {
    function typeRow(k) {
      const b = tt.byType[k];
      return '<div class="row"><div>' + esc(t('type_' + k)) + ' (' + b.count + ')</div>' +
        '<div class="row-right">' + fmtMoney(b.paid) + ' / ' + fmtMoney(b.pledged) + '</div></div>';
    }
    function dailyRow(k) {
      return '<div class="row"><div>' + esc(t('type_' + k)) + '</div><b>' + fmtMoney(tt.dailyByType[k]) + '</b></div>';
    }
    return '<div class="card"><div class="card-title">' + esc(title) + '</div>' +
      '<div class="stat3">' +
      '<div><span>' + esc(t('total_collection')) + '</span><b>' + fmtMoney(tt.totalCollection) + '</b></div>' +
      '<div><span>' + esc(t('total_expense')) + '</span><b>' + fmtMoney(tt.totalExpense) + '</b></div>' +
      '<div class="green"><span>' + esc(t('in_hand')) + '</span><b>' + fmtMoney(tt.inHand) + '</b></div>' +
      '</div>' +
      '<div class="stat3"><div><span>' + esc(t('total_pledged')) + '</span><b>' + fmtMoney(tt.totalPledged) + '</b></div>' +
      '<div class="red"><span>' + esc(t('total_due')) + '</span><b>' + fmtMoney(tt.totalDue) + '</b></div><div></div></div>' +
      '<div class="stat3"><div><span>' + esc(t('total_cash')) + '</span><b>' + fmtMoney(tt.totalCash) + '</b></div>' +
      '<div><span>' + esc(t('total_upi')) + '</span><b>' + fmtMoney(tt.totalUpi) + '</b></div><div></div></div>' +
      typeRow('shop') + typeRow('person') + typeRow('member') +
      dailyRow('road') + dailyRow('toto') + dailyRow('bus') + '</div>';
  }

  // --- per-report renderers (server computes; client renders read-only) ---
  function reportDuesHTML(d) {
    const rows = d.rows || [];
    return '<div class="card"><div class="card-title">' + esc(t('report_dues')) +
      ' — ' + esc(t('total_due')) + ': ' + fmtMoney(d.totalDue) + '</div>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="row" style="cursor:default"><div><b>' + esc(r.name) + '</b><div class="row-sub">' +
          esc(t('type_' + r.type)) + (r.side ? ' • ' + esc(Lists.labelOf('area', r.side)) : '') +
          (r.owner ? ' • ' + esc(r.owner) : '') + '</div></div>' +
          '<div class="row-right">' + fmtMoney(r.paid) + '/' + fmtMoney(r.pledged) +
          '<span class="due-chip">' + esc(t('due')) + ' ' + fmtMoney(r.due) + '</span></div></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  // compact per-category line for the central in-hand report (the full table
  // lives in each person's own summary)
  function byCatInline(byCat) {
    if (!byCat) return '';
    const parts = Object.keys(CAT_LABEL_KEYS).filter(function (k) {
      return byCat[k] && (byCat[k].cash || byCat[k].upi);
    }).map(function (k) {
      const c = byCat[k].cash, u = byCat[k].upi;
      return esc(t(CAT_LABEL_KEYS[k])) + ' ' + fmtMoney(c + u) +
        ' <span class="bd-split">💵' + fmtMoney(c) + '·📱' + fmtMoney(u) + '</span>';
    });
    return parts.length ? '<div class="row-sub bd-line">' + parts.join(' &nbsp;•&nbsp; ') + '</div>' : '';
  }
  function reportInhandHTML(d) {
    const rows = d.rows || [];
    if (!rows.length) return '<div class="empty">' + esc(t('no_entries')) + '</div>';
    return '<div class="card"><div class="card-title">' + esc(t('report_inhand')) + '</div>' +
      rows.map(function (r) {
        const parts = [esc(t('collected_col')) + ' ' + fmtMoney(r.collected)];
        if (r.received) parts.push(esc(t('received_col')) + ' ' + fmtMoney(r.received));
        if (r.handedOver) parts.push(esc(t('handed_col')) + ' ' + fmtMoney(r.handedOver));
        if (r.spent) parts.push(esc(t('spent_col')) + ' ' + fmtMoney(r.spent));
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 60%"><b>' + esc(r.collector) + '</b>' +
          '<div class="row-sub">' + parts.join(' • ') + '</div>' +
          (r.pending ? '<div class="row-sub">⏳ ' + esc(t('my_pending')) + ': ' + fmtMoney(r.pending) + '</div>' : '') +
          byCatInline(r.byCat) +
          '</div><div class="row-right"><span class="' + (r.inHand > 0 ? 'red' : 'green') + '"><b>' +
          fmtMoney(r.inHand) + '</b></span><div class="row-sub">' + esc(t('inhand_col')) + '</div></div></div>';
      }).join('') + '</div>';
  }
  // "কোন খাতে কত আছে" — the same source-category × cash/UPI table the
  // handover screen uses, so a collector can answer "how much bus money do I
  // still hold?" from the report too, not only mid-handover.
  // order = how every report lists the pots; bus grouped with the new-entry
  // types to match the home screen and the handover sheet
  const OWN_SRC = Aggregate.OWN_SRC;
  const CAT_LABEL_KEYS = { shop: 'new_shop', person: 'new_person', member: 'new_member',
                           payment: 'cat_payment', bus: 'daily_bus',
                           road: 'daily_road', toto: 'daily_toto', received: 'cat_received',
                           other: 'cat_other' };
  function byCatHTML(byCat) {
    if (!byCat) return '';
    const rows = Object.keys(CAT_LABEL_KEYS)
      .filter(function (k) { return byCat[k] && (byCat[k].cash || byCat[k].upi); })
      .map(function (k) {
        const c = byCat[k].cash, u = byCat[k].upi;
        return '<div class="row" style="cursor:default"><div class="cat-name">' + esc(t(CAT_LABEL_KEYS[k])) + '</div>' +
          '<span class="cat-split">💵' + fmtMoney(c) + ' · 📱' + fmtMoney(u) + '</span>' +
          '<b class="cat-tot">' + fmtMoney(c + u) + '</b></div>';
      });
    if (!rows.length) return '';
    return '<div class="section" style="margin-top:14px">' + esc(t('my_by_cat')) + '</div>' + rows.join('');
  }
  // "কাকে কত জমা দিয়েছি" — each receiver by name, then the categories that went
  // to them. Read straight off one's own outgoing handovers, which already
  // record both, so this can never disagree with the receiver's own screen.
  function handedToHTML(list) {
    if (!list || !list.length) return '';
    return '<div class="section" style="margin-top:14px">' + esc(t('my_handed_to')) + '</div>' +
      list.map(function (r) {
        return '<div class="row" style="cursor:default;flex-wrap:wrap"><div style="flex:1 1 60%"><b>🧑 ' +
          esc(r.name) + '</b>' +
          (r.pending ? '<div class="row-sub">⏳ ' + esc(t('my_pending')) + ' ' + fmtMoney(r.pending) + '</div>' : '') +
          '</div><span class="cat-split">💵' + fmtMoney(r.cash) + ' · 📱' + fmtMoney(r.upi) + '</span>' +
          '<b class="cat-tot">' + fmtMoney(r.total) + '</b>' +
          (r.cats.length ? '<div style="flex-basis:100%">' + r.cats.map(function (c) {
            return '<div class="bd-line">' + esc(t(CAT_LABEL_KEYS[c.key] || 'cat_other')) + ' — 💵' +
              fmtMoney(c.cash) + ' · 📱' + fmtMoney(c.upi) + '</div>';
          }).join('') + '</div>' : '') + '</div>';
      }).join('');
  }
  function mySummaryHTML(d, deviceOnly) {
    return '<div class="card"><div class="card-title">' + esc(t('my_summary')) + '</div>' +
      (deviceOnly ? '<div class="row-sub" style="margin-bottom:8px">' + esc(t('my_device_note')) + '</div>' : '') +
      '<div class="stat3">' +
        '<div class="' + (d.inHand > 0 ? 'red' : 'green') + '"><span>' + esc(t('my_inhand')) + '</span><b>' + fmtMoney(d.inHand) + '</b></div>' +
        '<div><span>' + esc(t('my_collected')) + '</span><b>' + fmtMoney(d.collected) + '</b></div>' +
        '<div><span>' + esc(t('my_handed')) + '</span><b>' + fmtMoney(d.handedOver || 0) + '</b></div>' +
      '</div>' +
      '<div class="stat3">' +
        '<div><span>' + esc(t('cash')) + '</span><b>' + fmtMoney(d.cash) + '</b></div>' +
        '<div><span>' + esc(t('upi')) + '</span><b>' + fmtMoney(d.upi) + '</b></div>' +
        '<div><span>' + esc(t('my_received')) + '</span><b>' + fmtMoney(d.received || 0) + '</b></div>' +
      '</div>' +
      (d.pending ? '<div class="row" style="cursor:default"><div>⏳ ' + esc(t('my_pending')) + '</div><b>' + fmtMoney(d.pending) + '</b></div>' : '') +
      // no separate road/toto/bus strip: byCatHTML below shows every category
      // with its cash/UPI split AND groups bus with the new entries, so the old
      // strip only repeated the same money under a second, wrong grouping.
      byCatHTML(d.byCat) +
      handedToHTML(d.handedTo) +
      '</div>' +
      (d.expenses && d.expenses.length ?
        '<div class="card"><div class="card-title">' + esc(t('my_expenses')) + ' — ' + fmtMoney(d.expenseTotal) + '</div>' +
        d.expenses.map(function (e) {
          return '<div class="row" style="cursor:default"><div><b>' + esc(e.desc) + '</b><div class="row-sub">' +
            esc(fmtDate(e.date)) + '</div></div><b>' + fmtMoney(e.amount) + '</b></div>';
        }).join('') + '</div>' : '');
  }
  function reportCollectorsHTML(d) {
    const rows = d.rows || [];
    return '<div class="card"><div class="card-title">' + esc(t('report_collectors')) + '</div>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="row" style="cursor:default"><div><b>' + esc(r.collector) + '</b>' +
          '<div class="row-sub">💵' + fmtMoney(r.cash || 0) + ' · 📱' + fmtMoney(r.upi || 0) + '</div></div><b>' +
          fmtMoney(r.total) + '</b></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  function reportExpensesHTML(d) {
    const rows = d.rows || [], bySubject = d.bySubject || [];
    return '<div class="card"><div class="card-title">' + esc(t('report_expenses')) +
      ' — ' + esc(t('total_expense')) + ': ' + fmtMoney(d.total) +
      '<div class="row-sub">💵' + fmtMoney(d.totalCash || 0) + ' · 📱' + fmtMoney(d.totalUpi || 0) + '</div></div>' +
      (bySubject.length ? '<div class="row-sub" style="margin-bottom:6px">' + esc(t('by_subject')) + '</div>' +
        bySubject.map(function (s) {
          return '<div class="row" style="cursor:default"><div><b>' + esc(s.subject) + '</b>' +
            '<div class="row-sub">' + s.count + ' ' + esc(t('entries')) +
            ' • 💵' + fmtMoney(s.cash || 0) + ' · 📱' + fmtMoney(s.upi || 0) + '</div></div><b>' + fmtMoney(s.total) + '</b></div>';
        }).join('') : '') + '</div>' +
      '<div class="card"><div class="card-title">' + esc(t('entries')) + '</div>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="row" style="cursor:default"><div><b>' + esc(r.subject || '—') + '</b>' +
          (r.desc ? ' <span class="row-sub">— ' + esc(r.desc) + '</span>' : '') +
          '<div class="row-sub">' + esc(fmtDate(r.date)) + (r.spentBy ? ' • ' + esc(r.spentBy) : '') +
          (r.source === 'collection' ? ' • ' + esc(t('coll_expense')) : '') +
          ' • 💵' + fmtMoney(r.cash) + ' · 📱' + fmtMoney(r.upi) +
          (r.srcCat && CAT_LABEL_KEYS[r.srcCat] ? ' • ' + esc(t(CAT_LABEL_KEYS[r.srcCat])) : '') + '</div></div>' +
          '<b>' + fmtMoney(r.amount) + '</b></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  function reportDailyHTML(d) {
    const rows = d.rows || [], bt = d.byType || { road: 0, toto: 0 };
    return '<div class="card"><div class="card-title">' + esc(t('report_daily')) + '</div>' +
      '<div class="stat3"><div><span>' + esc(t('type_road')) + '</span><b>' + fmtMoney(bt.road) + '</b></div>' +
      '<div><span>' + esc(t('type_toto')) + '</span><b>' + fmtMoney(bt.toto) + '</b></div>' +
      '<div><span>' + esc(t('total')) + '</span><b>' + fmtMoney((bt.road || 0) + (bt.toto || 0)) + '</b></div></div>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="row" style="cursor:default"><div>' + esc(fmtDate(r.date)) + ' • ' +
          esc(t('type_' + r.type)) + '</div><b>' + fmtMoney(r.amount) + '</b></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  function reportAreasHTML(d) {
    const rows = d.rows || [];
    const medal = ['🥇', '🥈', '🥉'];
    return '<div class="card"><div class="card-title">' + esc(t('report_areas')) +
      ' — ' + esc(t('paid')) + ': ' + fmtMoney(d.totalPaid) + '</div>' +
      (rows.length ? rows.map(function (r, i) {
        const label = r.area === '—' ? t('no_area') : Lists.labelOf('area', r.area);
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 60%"><b>' +
          (medal[i] || '') + ' ' + esc(label) + '</b>' +
          '<div class="row-sub">' + r.count + ' ' + esc(t('parties_n')) +
          (r.due > 0 ? ' • ' + esc(t('due')) + ' ' + fmtMoney(r.due) : ' • ✅') + '</div></div>' +
          '<div class="row-right"><b>' + fmtMoney(r.paid) + '</b>' +
          '<div class="row-sub">/ ' + fmtMoney(r.pledged) + '</div></div></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  function reportHTML(id, d) {
    if (id === 'overview') return totalsHTML(d, t('report_overview'));
    if (id === 'dues') return reportDuesHTML(d);
    if (id === 'inhand') return reportInhandHTML(d);
    if (id === 'collectors') return reportCollectorsHTML(d);
    if (id === 'areas') return reportAreasHTML(d);
    if (id === 'expenses') return reportExpensesHTML(d);
    if (id === 'daily') return reportDailyHTML(d);
    return '';
  }

  // A handover's stored breakdown → "দোকান 💵₹300 · 📱₹200" lines, so the
  // RECEIVER sees exactly the same detail the giver picked. Falls back to
  // nothing for legacy rows that carry no breakdown.
  function breakdownLines(h) {
    if (!h || !h.breakdown) return '';
    let bd; try { bd = JSON.parse(h.breakdown); } catch (e) { return ''; }
    if (!bd || typeof bd !== 'object') return '';
    const parts = Object.keys(bd).map(function (k) {
      const c = Number(bd[k].cash) || 0, u = Number(bd[k].upi) || 0;
      const label = CAT_LABEL_KEYS[k] ? t(CAT_LABEL_KEYS[k]) : k;
      return '<span class="bd-item">' + esc(label) + ' <b>' + fmtMoney(c + u) + '</b>' +
        '<span class="bd-split">💵' + fmtMoney(c) + ' · 📱' + fmtMoney(u) + '</span></span>';
    });
    return parts.length ? '<div class="bd-line">' + parts.join('') + '</div>' : '';
  }
  // "জমা-খাতা" — everything this person handed over and everything handed to
  // them, in one place. Personal, so no report permission gates it, and it
  // reads the local snapshot, so it works with no signal.
  let hbFilter = 'all'; // all | in | out
  function renderHandoverBook() {
    const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
    viewData().then(function (data) {
      const r = Aggregate.handoverReport(data, ident);
      const money = function (o) {
        return '<span class="cat-split">💵' + fmtMoney(o.cash) + ' · 📱' + fmtMoney(o.upi) + '</span>' +
               '<b class="cat-tot">' + fmtMoney(o.total) + '</b>';
      };
      const head = '<div class="cat-group tot-group">' +
        '<div class="sh-row ro"><span class="cat-name">📥 ' + esc(t('hb_received')) + '</span>' + money(r.received) + '</div>' +
        (r.pendingIn.total ? '<div class="sh-row ro"><span class="cat-name">⏳ ' + esc(t('hb_pending_in')) + '</span>' + money(r.pendingIn) + '</div>' : '') +
        '<div class="sh-row ro"><span class="cat-name">📤 ' + esc(t('hb_sent')) + '</span>' + money(r.sent) + '</div>' +
        (r.pendingOut.total ? '<div class="sh-row ro"><span class="cat-name">⏳ ' + esc(t('hb_pending_out')) + '</span>' + money(r.pendingOut) + '</div>' : '') +
        '</div>';
      const tabs = [['all', t('all')], ['in', '📥 ' + t('hb_received')], ['out', '📤 ' + t('hb_sent')]];
      const rows = r.rows.filter(function (x) { return hbFilter === 'all' || x.dir === hbFilter; });
      const body = rows.length ? rows.map(function (x) {
        const detail = x.cats.length
          ? x.cats.map(function (c) {
              return '<div class="bd-line">' + esc(t(CAT_LABEL_KEYS[c.key] || 'cat_other')) +
                ' — 💵' + fmtMoney(c.cash) + ' · 📱' + fmtMoney(c.upi) + '</div>';
            }).join('')
          : (x.snap ? '<div class="bd-line">' + esc(t('hb_snap')) + ' — ' +
              esc(t('cs_available')) + ' 💵' + fmtMoney((x.snap.available || {}).cash) +
              ' · 📱' + fmtMoney((x.snap.available || {}).upi) + '</div>' : '');
        return '<div class="row hb-row" data-hb="' + esc(x.id) + '" style="flex-wrap:wrap">' +
          '<div style="flex:1 1 55%"><b>' + (x.dir === 'in' ? '📥 ' : '📤 ') + esc(x.who) + '</b>' +
          '<div class="row-sub">' + esc(fmtDate(x.date)) +
          (x.status !== 'confirmed' ? ' • ⏳ ' + esc(t('flag_pending')) : ' • ✅') +
          (x.note ? ' • ' + esc(x.note) : '') + '</div></div>' + money(x) +
          (detail ? '<div class="hb-detail" hidden>' + detail + '</div>' : '') + '</div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>';
      $view().innerHTML = backBar('home') + '<div class="flow-title">' + esc(t('hb_title')) + '</div>' +
        head +
        '<div class="chips tabs">' + tabs.map(function (tb) {
          return '<button class="chip' + (hbFilter === tb[0] ? ' on' : '') + '" data-hbf="' + tb[0] + '">' + esc(tb[1]) + '</button>';
        }).join('') + '</div>' + body;
      document.querySelectorAll('[data-hbf]').forEach(function (b) {
        b.onclick = function () { hbFilter = b.dataset.hbf; renderHandoverBook(); };
      });
      // tap a row to open its detail — the same breakdown the sender chose
      document.querySelectorAll('.hb-row').forEach(function (el) {
        const det = el.querySelector('.hb-detail');
        if (!det) return;
        el.style.cursor = 'pointer';
        el.onclick = function () { det.hidden = !det.hidden; };
      });
    });
  }
  function renderCashier() {
    if (!Auth.isCashier()) { $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('not_cashier')) + '</div>'; return; }
    $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('loading')) + '</div>';
    Auth.call('pendingHandovers', { token: Auth.token(), year: Settings.get('year') }).then(function (resp) {
      const mine = resp.handovers || [];
      const pending = mine.filter(function (h) { return h.status !== 'confirmed'; });
      const done = mine.filter(function (h) { return h.status === 'confirmed'; })
        .sort(function (a, b) { return String(b.confirmedAt).localeCompare(String(a.confirmedAt)); }).slice(0, 15);
      function card(h, withBtn) {
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div><b>' + esc(h.from) + '</b>' +
          '<div class="row-sub">' + esc(fmtDate(h.date)) + (h.note ? ' • ' + esc(h.note) : '') +
          ' • ' + esc(t('cash')) + ' ' + fmtMoney(h.cashAmount) + ' + UPI ' + fmtMoney(h.upiAmount) + '</div></div>' +
          '<b>' + fmtMoney(h.amount) + '</b>' +
          '<div style="flex-basis:100%">' + breakdownLines(h) + '</div>' +
          (withBtn ? '<div style="flex-basis:100%;margin-top:8px"><button class="primary" data-hid="' +
            esc(h.id) + '">' + esc(t('confirm_receive')) + '</button></div>' : '') + '</div>';
      }
      // RECEIVED and SENT are separate parts: this screen is where a cashier
      // acts on what is coming in, but they also need to see what they have
      // passed on without leaving it. The sent side reads the local snapshot,
      // so it is there even when the pending fetch is all that needed the net.
      const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
      viewData().then(function (data) {
        const book = Aggregate.handoverReport(data, ident);
        const outRows = book.rows.filter(function (x) { return x.dir === 'out'; }).slice(0, 15);
        $view().innerHTML = backBar('home') + '<div class="flow-title">' + esc(t('confirm_handover')) + '</div>' +
          '<div class="section">📥 ' + esc(t('pending_handovers')) + ' (' + pending.length + ')</div>' +
          (pending.length ? pending.map(function (h) { return card(h, true); }).join('')
                          : '<div class="empty">' + esc(t('none_here')) + '</div>') +
          '<div class="section">📥 ' + esc(t('confirmed_handovers')) + '</div>' +
          (done.length ? done.map(function (h) { return card(h, false); }).join('')
                       : '<div class="empty">' + esc(t('none_here')) + '</div>') +
          '<div class="section">📤 ' + esc(t('hb_sent')) + '</div>' +
          (outRows.length ? outRows.map(function (x) {
            return '<div class="row" style="cursor:default;flex-wrap:wrap"><div style="flex:1 1 55%"><b>' +
              esc(x.who) + '</b><div class="row-sub">' + esc(fmtDate(x.date)) +
              (x.status !== 'confirmed' ? ' • ⏳ ' + esc(t('flag_pending')) : ' • ✅') + '</div></div>' +
              '<span class="cat-split">💵' + fmtMoney(x.cash) + ' · 📱' + fmtMoney(x.upi) + '</span>' +
              '<b class="cat-tot">' + fmtMoney(x.total) + '</b></div>';
          }).join('') : '<div class="empty">' + esc(t('none_here')) + '</div>') +
          '<div class="grid one" style="margin-top:10px"><button class="tile wide" data-go="hbook">📗 ' +
            esc(t('hb_title')) + '</button></div>';
        wireNav();
        document.querySelectorAll('[data-hid]').forEach(function (b) {
          b.onclick = function () {
            b.disabled = true;
            Auth.call('confirmHandover', { token: Auth.token(), id: b.dataset.hid })
              .then(function () { toast(t('saved')); renderCashier(); })
              .catch(function (e) { b.disabled = false; toast(errMsg(e)); });
          };
        });
      });
      return;
      document.querySelectorAll('[data-hid]').forEach(function (b) {
        b.onclick = function () {
          b.disabled = true;
          Auth.call('confirmHandover', { token: Auth.token(), id: b.dataset.hid })
            .then(function () { toast(t('saved')); renderCashier(); })
            .catch(function (e) { b.disabled = false; toast(errMsg(e)); });
        };
      });
    }).catch(function () {
      $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('needs_net')) + '</div>';
    });
  }

  function renderReport() {
    // Everything renders from the local pull snapshot (viewData) via Aggregate —
    // one aggregation path, instant, offline-capable, no per-report round-trip.
    // A person's own summary is their own money, so it stays whatever else is
    // withheld; the central-reports picker already says so when it is empty.
    $view().innerHTML = '<div id="reconcile-warn"></div>' +
      '<div id="my-summary"><div class="empty">' + esc(t('loading')) + '</div></div>' +
      '<div class="section">' + esc(t('central_reports')) + '</div>' +
      '<div id="report-picker"></div>' +
      '<div id="report-body"></div>';
    loadMySummary();
    showReportButtons(myReports());   // permission list is local — no round-trip
    checkReconcile();
  }
  // Surface the money invariant to admins/cashiers: Σ everyone's in-hand must
  // equal total collected − total expenses. A mismatch means a broken entry —
  // better a loud banner now than a dispute at the end of the puja.
  function checkReconcile() {
    if (!Auth.isCashier()) return; // admins are cashiers here too
    viewData().then(function (data) {
      const el = document.getElementById('reconcile-warn'); if (!el) return;
      const r = Aggregate.reconcile(data);
      const others = r.anomalies.filter(function (a) { return a.type !== 'unbalanced'; });
      if (r.balanced && !others.length) { el.innerHTML = ''; return; }
      let msg = '';
      if (!r.balanced) {
        msg += esc(t('reconcile_off').replace('{diff}', rcpMoney(Math.abs(r.totalInHand - r.expected)))) + '<br>';
      }
      if (others.length) msg += esc(t('reconcile_anoms').replace('{n}', others.length));
      el.innerHTML = '<div class="card" style="border:1.5px solid #c0392b;background:#fdecea">' +
        '<b>⚠️ ' + esc(t('reconcile_title')) + '</b><div class="row-sub" style="margin-top:4px">' + msg + '</div></div>';
    });
  }
  function loadMySummary() {
    const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
    viewData().then(function (data) {
      const el = document.getElementById('my-summary');
      if (!el) return; // view changed while computing
      el.innerHTML = mySummaryHTML(Aggregate.personalSummary(data, ident), false);
    });
  }
  function showReportButtons(ids) {
    const picker = document.getElementById('report-picker');
    if (!picker) return;
    if (!ids.length) {
      picker.innerHTML = '<div class="empty">' + esc(t('no_reports_msg')) + '</div>';
      return;
    }
    picker.innerHTML = '<div class="chips">' + ids.map(function (id) {
      return '<button class="chip" data-rep="' + esc(id) + '">' + esc(t('report_' + id)) + '</button>';
    }).join('') + '</div>';
    picker.querySelectorAll('[data-rep]').forEach(function (b) {
      b.onclick = function () {
        picker.querySelectorAll('.chip').forEach(function (c) { c.classList.remove('on'); });
        b.classList.add('on');
        loadReport(b.dataset.rep);
      };
    });
  }
  function loadReport(id) {
    viewData().then(function (data) {
      const body = document.getElementById('report-body');
      if (!body) return; // view changed while computing
      try {
        body.innerHTML = reportHTML(id, Aggregate.computeReport(id, data)) +
          '<button id="report-pdf" class="ghost big block">📄 ' + esc(t('report_pdf_btn')) + '</button>';
        document.getElementById('report-pdf').onclick = function () { printReport(id); };
      }
      catch (e) { body.innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>'; }
    });
  }
  // Print the current report via the browser's print dialog — on a phone the
  // user picks "Save as PDF". No library, works offline. A #print-area is
  // filled with a headed copy of the report; @media print CSS shows only it.
  function printReport(id) {
    viewData().then(function (data) {
      let area = document.getElementById('print-area');
      if (!area) { area = document.createElement('div'); area.id = 'print-area'; document.body.appendChild(area); }
      const now = toBengaliDigits(fmtDateTime(new Date().toISOString()));
      area.innerHTML =
        '<div class="p-head"><div class="p-puja">' + esc(pujaName()) + '</div>' +
        '<div class="p-sub">' + esc(t('report_' + id)) + ' · ' + esc(String(Settings.get('year'))) + '</div>' +
        '<div class="p-meta">' + esc(t('printed_on')) + ': ' + esc(now) + (isLive() ? '' : ' · ' + esc(t('training_mode'))) + '</div></div>' +
        reportHTML(id, Aggregate.computeReport(id, data));
      window.print();
    });
  }

  function renderSettings() {
    const user = Auth.current() || { name: '?', username: '?' };
    // scriptUrl is a backend override for testing — admins only, so a
    // collector can't accidentally edit it and break their own sync.
    // The year decides which book every entry lands in — one collector nudging
    // it puts their whole day in the wrong year, invisibly. Admin only.
    const fields = [];
    if (Auth.isAdmin()) fields.push(['year', 'year', 'number'], ['scriptUrl', 'script_url', 'text']);
    $view().innerHTML = '<div class="card"><div class="card-title">👤 ' + esc(user.name) +
      (user.role === 'admin' ? ' 👑' : '') + (Auth.isCashier() ? ' 💰' : '') + '</div>' +
      '<div class="row-sub">' + esc(t('logged_in_as')) + ': @' + esc(user.username) + '</div></div>' +
      (Auth.isAdmin() ? '<button id="adm-btn" class="primary big block">' + esc(t('admin_panel')) + '</button>' : '') +
      '<button id="help-btn" class="ghost big block">' + esc(t('help_btn')) + '</button>' +
      (('Notification' in window) ? '<button id="notif-btn" class="ghost big block">' + esc(t('notif_enable')) + '</button>' : '') +
      '<div class="card">' +
      '<div class="field"><label>' + esc(t('language')) + '</label>' +
      '<div class="chips"><button class="chip' + (Settings.get('lang') === 'bn' ? ' on' : '') + '" data-l="bn">বাংলা</button>' +
      '<button class="chip' + (Settings.get('lang') === 'en' ? ' on' : '') + '" data-l="en">English</button></div></div>' +
      fields.map(function (f) {
        return '<div class="field"><label>' + esc(t(f[1])) + '</label>' +
          '<input type="' + f[2] + '" data-k="' + f[0] + '" value="' + esc(Settings.get(f[0])) + '"></div>';
      }).join('') + '</div>' +
      '<button id="sync-btn" class="primary big block">☁️ ' + esc(t('sync_now')) + '</button>' +
      '<button id="export-btn" class="ghost big block">' + esc(t('export_backup')) + '</button>' +
      // Importing a JSON file rewrites this device's book. In anyone's hands but
      // the admin's that is a way to quietly ruin your own figures, and there is
      // no reason a collector would ever need it.
      (Auth.isAdmin() ? '<button id="import-btn" class="ghost big block">' + esc(t('import_backup')) + '</button>' +
        '<input type="file" id="import-file" accept=".json" hidden>' : '') +
      '<button id="chpw-btn" class="ghost big block">🔑 ' + esc(t('change_pw_title')) + '</button>' +
      '<button id="logout-btn" class="ghost big block">🚪 ' + esc(t('logout')) + '</button>' +
      '<div class="empty">v2 • ' + esc(location.hostname) + '</div>';
    const admB = document.getElementById('adm-btn');
    if (admB) admB.onclick = function () { navigate('admin'); };
    document.getElementById('help-btn').onclick = function () { navigate('help'); };
    const notifBtn = document.getElementById('notif-btn');
    if (notifBtn) notifBtn.onclick = function () {
      if (Notification.permission === 'granted') { toast(t('notif_on')); checkNotifications(); return; }
      Notification.requestPermission().then(function (p) { toast(p === 'granted' ? t('notif_on') : t('notif_off')); });
    };
    document.getElementById('chpw-btn').onclick = function () { renderChangePw(false); };
    document.getElementById('logout-btn').onclick = function () {
      DB.unsyncedCount().then(function (n) {
        if (n > 0) { toast('⏳ ' + n + t('unsynced_n')); return; } // never strand unsynced entries
        // drop the central snapshot so the next login starts with a clean full pull
        centralData = null; centralCursor = ''; centralYear = '';
        ['ck_central', 'ck_central_cursor', 'ck_central_year'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        Auth.logout(); authView = 'login'; navigate('home');
      });
    };
    document.querySelectorAll('[data-l]').forEach(function (b) {
      b.onclick = function () { Settings.set('lang', b.dataset.l); render(); };
    });
    document.querySelectorAll('[data-k]').forEach(function (i) {
      i.onchange = function () { Settings.set(i.dataset.k, i.value.trim()); };
    });
    document.getElementById('sync-btn').onclick = function () {
      Sync.syncNow().then(function (r) {
        toast(r.ok ? t('all_synced') : (r.reason === 'not-configured' ? t('sync_not_configured') : t('sync_fail')));
        updateBadge();
      });
    };
    document.getElementById('export-btn').onclick = function () {
      DB.allData().then(function (data) {
        const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(),
          collector: Settings.get('collectorName'), year: Settings.get('year'), data: data }, null, 2)],
          { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'chanda-backup-' + Settings.get('collectorName') + '-' + todayISO() + '.json';
        a.click();
      });
    };
    const fileEl = document.getElementById('import-file');
    const impBtn = document.getElementById('import-btn');
    if (impBtn) impBtn.onclick = function () { fileEl.click(); };
    if (fileEl) fileEl.onchange = function () {
      const f = fileEl.files[0]; if (!f) return;
      f.text().then(function (txt) {
        let d;
        try { d = (JSON.parse(txt) || {}).data; } catch (e) { d = null; }
        if (!d || typeof d !== 'object') { toast(t('import_bad')); fileEl.value = ''; return; }
        // keep only known stores and rows that carry an id
        const clean = {}, counts = [];
        DB.STORES.forEach(function (s) {
          const rows = Array.isArray(d[s]) ? d[s].filter(function (r) { return r && r.id; }) : [];
          if (rows.length) { clean[s] = rows; counts.push(rows.length + ' ' + s); }
        });
        fileEl.value = '';
        if (!counts.length) { toast(t('import_empty')); return; }
        // WHOSE book is this? A file usually comes off a collector's dead or
        // wiped phone, and every row in it belongs to them — not to the admin
        // doing the restoring. Ask once, stamp every row, so the money lands
        // against the right person instead of inflating the admin's in-hand.
        renderImportOwner(counts, function (owner) {
          const stamped = {};
          Object.keys(clean).forEach(function (st) {
            stamped[st] = clean[st].map(function (r) {
              if (!owner) return r;
              return Object.assign({}, r, { collector: owner.name, collectorId: owner.username, synced: 0 });
            });
          });
          Promise.all(Object.keys(stamped).map(function (st) { return DB.bulkPut(st, stamped[st]); }))
            .then(function () { toast(t('saved')); updateBadge(); navigate('settings'); })
            .catch(function () { toast(t('fetch_fail')); });
        });
      }).catch(function () { toast(t('import_bad')); fileEl.value = ''; });
    };
  }

  // Who does an imported file belong to? Admin-only screen, shown between
  // choosing the file and writing anything, so the answer is given before the
  // rows exist rather than corrected afterwards.
  function renderImportOwner(counts, done) {
    $view().innerHTML = backBar('settings') + '<div class="flow-title">' + esc(t('import_owner_title')) + '</div>' +
      '<div class="hint" style="margin-bottom:10px">' + esc(t('import_owner_hint')) + '</div>' +
      '<div class="card"><div class="row-sub">' + esc(counts.join(' · ')) + '</div></div>' +
      '<div id="imp-users"><div class="empty">' + esc(t('loading')) + '</div></div>';
    const paint = function (users) {
      document.getElementById('imp-users').innerHTML =
        users.map(function (u) {
          return '<div class="row" data-impu="' + esc(u.username) + '"><div><b>' + esc(u.name) + '</b>' +
            '<div class="row-sub">@' + esc(u.username) + '</div></div></div>';
        }).join('') +
        '<button id="imp-keep" class="ghost big block" style="margin-top:10px">' + esc(t('import_owner_keep')) + '</button>';
      document.querySelectorAll('[data-impu]').forEach(function (el) {
        el.onclick = function () {
          const u = users.filter(function (x) { return x.username === el.dataset.impu; })[0];
          if (u && window.confirm(t('import_confirm') + '\n\n' + u.name + '\n' + counts.join(', '))) done(u);
        };
      });
      document.getElementById('imp-keep').onclick = function () {
        if (window.confirm(t('import_confirm') + '\n\n' + counts.join(', '))) done(null);
      };
    };
    Auth.call('listUsers', { token: Auth.token() })
      .then(function (r) {
        paint((r.users || []).filter(function (u) { return u.status === 'approved'; })
          .map(function (u) { return { username: u.username, name: u.name }; }));
      })
      .catch(function () { paint([]); }); // offline: only "keep as written" is offered
  }

  // Tell the ADMIN when the chat starts costing something, and give them the
  // switch right there. Only the admin, only when the level changes — a warning
  // that repeats every minute is a warning nobody reads.
  let chatWarned = null;
  function checkChatLoad(data) {
    if (!Auth.isAdmin() || !chatOn()) return null;
    const l = Aggregate.chatLoad(data);
    if (l.level !== 'ok' && chatWarned !== l.level) {
      chatWarned = l.level;
      osNotify(t(l.level === 'high' ? 'chat_load_high' : 'chat_load_watch') +
               ' — ' + l.count + ' / ' + Math.round(l.bytes / 1024) + ' KB');
    }
    if (l.level === 'ok') chatWarned = null;
    return l;
  }
  function chatLoadBannerHTML(l) {
    if (!l || l.level === 'ok') return '';
    return notifRow((l.level === 'high' ? '🔴 ' : '🟠 ') +
      esc(t(l.level === 'high' ? 'chat_load_high' : 'chat_load_watch')) +
      ' <span class="row-sub">' + l.count + ' ' + esc(t('chat_msgs')) + ' · ' +
      Math.round(l.bytes / 1024) + ' KB · ' + esc(t('chat_per_day')) + ' ' + l.perDay + '</span>',
      '<button class="chip" id="chat-off-btn">' + esc(t('chat_stop_btn')) + '</button>');
  }
  // A mention has to reach the phone, not just the tab. Messages arrive with the
  // 60s pull, so this runs after every pull rather than on a timer of its own.
  // `msgNotified` keeps the last id already announced, so re-opening the app or
  // a second pull cannot buzz twice for the same message.
  let msgNotified = null;
  function checkMentionNotify(data) {
    if (!Auth.loggedIn()) return;
    const me = meForMsg();
    const feed = Aggregate.messageFeed(data, me, msgSeen());
    const mine = feed.rows.filter(function (r) { return r.unread && r.forMe; });
    if (!mine.length) return;
    const last = mine[mine.length - 1];
    if (msgNotified === last.id) return;
    // first run after a reload only primes the marker — otherwise opening the
    // app would replay a notification for something already read elsewhere
    const first = msgNotified === null;
    msgNotified = last.id;
    if (first) return;
    osNotify('💬 ' + (last.collector || '') + ': ' + String(last.text || '').slice(0, 90));
  }

  // The admin can switch the chat off (Config `chat_off`). The nav tab, the
  // route and the send button all read this one answer.
  function chatOn() { return String((centralConfig || {}).chat_off || '') !== 'on'; }

  // ---------- committee chat ----------
  // One window, everybody in it. Messages are just another store, so they ride
  // the pull the app already makes every 60s — no polling of its own, which on
  // Apps Script would burn the daily runtime quota within hours.
  function msgSeenKey() { return 'ck_msg_seen'; }
  function msgSeen() { try { return localStorage.getItem(msgSeenKey()) || ''; } catch (e) { return ''; } }
  function msgMarkSeen(iso) { try { localStorage.setItem(msgSeenKey(), iso); } catch (e) {} }
  function meForMsg() {
    const u = Auth.current() || {};
    return { username: Settings.get('collectorUsername') || u.username || '',
             role: u.role || '', cashier: u.cashier || 0 };
  }
  let msgDraft = '';
  function renderMessages() {
    const me = meForMsg();
    viewData().then(function (data) {
      const feed = Aggregate.messageFeed(data, me, msgSeen());
      const rows = feed.rows.slice(-200); // a season's chat, not an archive
      const body = rows.length ? rows.map(function (r) {
        const mine = String(r.collectorId || r.collector) === me.username;
        return '<div class="msg' + (mine ? ' mine' : '') + (r.forMe && !mine ? ' formeone' : '') + '">' +
          '<div class="msg-who">' + esc(r.collector || r.collectorId || '?') +
            '<span class="msg-when">' + esc(fmtDateTime(r.createdAt)) + '</span></div>' +
          '<div class="msg-text">' + highlightMentions(r.text || '') + '</div></div>';
      }).join('') : '<div class="empty">' + esc(t('msg_empty')) + '</div>';
      $view().innerHTML = '<div class="flow-title">' + esc(t('msg_title')) + '</div>' +
        '<div class="hint" style="margin-bottom:8px">' + esc(t('msg_hint')) + '</div>' +
        '<div id="msg-list" class="msg-list">' + body + '</div>' +
        '<div id="msg-picker" class="chips" hidden></div>' +
        '<div class="input-row msg-compose">' +
          '<input id="msg-input" placeholder="' + esc(t('msg_ph')) + '" autocomplete="off" value="' + esc(msgDraft) + '">' +
          '<button id="msg-at" class="ghost">@</button>' +
          '<button id="msg-send" class="primary">' + esc(t('msg_send')) + '</button>' +
        '</div>';
      const list = document.getElementById('msg-list');
      if (list) list.scrollTop = list.scrollHeight;
      // reading the screen IS the read receipt
      if (rows.length) msgMarkSeen(String(rows[rows.length - 1].createdAt || ''));
      updateBadge();
      const input = document.getElementById('msg-input');
      input.oninput = function () { msgDraft = input.value; };
      document.getElementById('msg-at').onclick = function () { toggleMentionPicker(input); };
      document.getElementById('msg-send').onclick = function () { sendMessage(input); };
      input.onkeydown = function (e) { if (e.key === 'Enter') sendMessage(input); };
    });
  }
  function highlightMentions(txt) {
    return esc(txt).replace(/@([a-z0-9._-]+)/gi, '<b class="msg-at">@$1</b>');
  }
  // @ offers the three groups plus every approved user, so a name never has to
  // be spelled from memory (and a typo'd mention notifies nobody).
  function toggleMentionPicker(input) {
    const box = document.getElementById('msg-picker');
    if (!box.hidden) { box.hidden = true; return; }
    const paint = function (users) {
      box.innerHTML = [['all', t('msg_grp_all')], ['cashiers', t('msg_grp_cashiers')], ['admin', t('msg_grp_admin')]]
        .map(function (g) { return '<button class="chip" data-at="' + g[0] + '">@' + esc(g[1]) + '</button>'; }).join('') +
        users.map(function (u) {
          return '<button class="chip" data-at="' + esc(u.username) + '">@' + esc(u.name) + '</button>';
        }).join('');
      box.hidden = false;
      box.querySelectorAll('[data-at]').forEach(function (b) {
        b.onclick = function () {
          input.value = (input.value.trim() + ' @' + b.dataset.at + ' ').replace(/^\s+/, '');
          msgDraft = input.value; box.hidden = true; input.focus();
        };
      });
    };
    const cached = msgUserCache;
    if (cached) { paint(cached); return; }
    Auth.call('cashiers', { token: Auth.token() })
      .then(function (r) { msgUserCache = r.cashiers || []; paint(msgUserCache); })
      .catch(function () { paint([]); }); // offline → groups only, still usable
  }
  let msgUserCache = null;
  function sendMessage(input) {
    const txt = String(input.value || '').trim();
    if (!txt) return;
    if (!chatOn()) { toast(t('chat_off_toast')); return; }
    // the mentions column is derived from the text, so what you typed and who
    // gets notified can never disagree
    const mentions = (txt.match(/@([a-z0-9._-]+)/gi) || []).map(function (m) { return m.slice(1).toLowerCase(); });
    const row = DB.newRow({ text: txt, mentions: mentions.join(',') });
    input.value = ''; msgDraft = '';
    DB.put('messages', row).then(function () { updateBadge(); autoSync(); renderMessages(); });
  }

  // ---------- in-app guide ----------
  function renderHelp() {
    const lang = Settings.get('lang');
    const secs = (window.HELP || []).map(function (s) {
      return '<div class="card"><div class="card-title">' + esc(s.icon + ' ' + s.title[lang]) + '</div>' +
        s.body[lang].map(function (p) { return '<div class="help-p">' + p + '</div>'; }).join('') + '</div>';
    }).join('');
    $view().innerHTML = backBar('settings') + '<div class="flow-title">' + esc(t('help_title')) + '</div>' + secs;
  }

  // ---------- auth views ----------
  let authView = 'login'; // login | register | forgot | regdone
  function errMsg(e) {
    const code = String(e && e.message || e).replace(/-/g, '_');
    const key = 'err_' + (code === 'year_not_approved' ? 'year' : code);
    return I18N[key] ? t(key) : t('err_network');
  }
  const USERNAME_RE = /^[a-z0-9._-]{3,20}$/;
  function authError(msg) {
    const el = document.getElementById('auth-err');
    if (el) { el.textContent = msg || ''; el.style.display = msg ? 'block' : 'none'; }
  }
  function langChips() {
    setTimeout(function () {
      document.querySelectorAll('[data-l]').forEach(function (b) {
        // full render() (not just the card) so header + bottom nav switch too
        b.onclick = function () { Settings.set('lang', b.dataset.l); render(); };
      });
    }, 0);
    return '<div class="chips center"><button class="chip' + (Settings.get('lang') === 'bn' ? ' on' : '') +
      '" data-l="bn">বাংলা</button><button class="chip' + (Settings.get('lang') === 'en' ? ' on' : '') +
      '" data-l="en">English</button></div>';
  }
  function renderAuth() {
    if (authView === 'register') return renderRegister();
    if (authView === 'forgot' || authView === 'regdone') return renderAuthMsg();
    renderLogin();
  }
  function renderLogin() {
    $view().innerHTML = '<div class="card center onboard">' +
      '<img src="icons/icon-192.png" alt="" width="104" height="104" style="border-radius:22px;margin:4px auto 10px;display:block">' +
      '<h2>🙏 ' + esc(pujaName()) + '</h2>' + langChips() +
      '<div class="field"><label>' + esc(t('username')) + '</label>' +
      '<input id="lg-user" autocapitalize="none" autocomplete="username"></div>' +
      '<div class="field"><label>' + esc(t('password')) + '</label>' +
      '<input id="lg-pw" type="password" autocomplete="current-password"></div>' +
      '<div id="auth-err" class="auth-err" style="display:none"></div>' +
      '<button id="lg-btn" class="primary big block">' + esc(t('login_btn')) + '</button>' +
      '<button id="lg-reg" class="ghost block">' + esc(t('no_account_register')) + '</button>' +
      '<button id="lg-forgot" class="ghost block">' + esc(t('forgot_link')) + '</button>' +
      (navigator.onLine ? '' : '<div class="hint">' + esc(t('login_needs_net')) + '</div>') +
      '</div>';
    document.getElementById('lg-reg').onclick = function () { authView = 'register'; renderAuth(); };
    document.getElementById('lg-forgot').onclick = function () { authView = 'forgot'; renderAuth(); };
    document.getElementById('lg-btn').onclick = function () {
      authError('');
      const user = document.getElementById('lg-user').value.trim();
      const pw = document.getElementById('lg-pw').value;
      if (!user || !pw) { authError(t('fill_all')); return; }
      const btn = this; btn.disabled = true;
      Auth.login(user, pw)
        .then(function () { navigate('home'); autoSync(); })
        .catch(function (e) { btn.disabled = false; authError(errMsg(e)); });
    };
  }
  function renderRegister() {
    $view().innerHTML = '<div class="card center onboard"><h2>' + esc(t('register_title')) + '</h2>' +
      langChips() +
      '<div class="field"><label>' + esc(t('full_name')) + '</label><input id="rg-name"></div>' +
      '<div class="field"><label>' + esc(t('username')) + '</label>' +
      '<input id="rg-user" autocapitalize="none" autocorrect="off" spellcheck="false">' +
      '<div class="hint" id="rg-user-hint">' + esc(t('username_rule')) + '</div></div>' +
      '<div class="field"><label>' + esc(t('q_phone')) + '</label><input id="rg-phone" inputmode="tel"></div>' +
      '<div class="field"><label>' + esc(t('password')) + '</label><input id="rg-pw" type="password">' +
      '<div class="hint">' + esc(t('password_rule')) + '</div></div>' +
      '<div class="field"><label>' + esc(t('confirm_password')) + '</label><input id="rg-pw2" type="password"></div>' +
      '<div id="auth-err" class="auth-err" style="display:none"></div>' +
      '<button id="rg-btn" class="primary big block">' + esc(t('register_btn')) + '</button>' +
      '<button id="rg-back" class="ghost block">' + esc(t('back_to_login')) + '</button></div>';
    document.getElementById('rg-back').onclick = function () { authView = 'login'; renderAuth(); };
    // live username feedback as they type
    const userEl = document.getElementById('rg-user'), hint = document.getElementById('rg-user-hint');
    userEl.oninput = function () {
      const v = userEl.value.trim();
      if (!v) { hint.textContent = t('username_rule'); hint.className = 'hint'; }
      else if (USERNAME_RE.test(v)) { hint.textContent = t('username_ok'); hint.className = 'hint ok-hint'; }
      else { hint.textContent = t('username_rule'); hint.className = 'hint err-hint'; }
    };
    document.getElementById('rg-btn').onclick = function () {
      authError('');
      const name = document.getElementById('rg-name').value.trim();
      const username = userEl.value.trim();
      const pw = document.getElementById('rg-pw').value;
      const pw2 = document.getElementById('rg-pw2').value;
      // client-side checks with clear, persistent messages
      if (!name) { authError(t('fill_all')); return; }
      if (!USERNAME_RE.test(username)) { authError(t('err_bad_username')); return; }
      if (pw.length < 6) { authError(t('err_bad_input')); return; }
      if (pw !== pw2) { authError(t('pw_mismatch')); return; }
      const phone = document.getElementById('rg-phone').value.trim();
      if (phone && phoneErrIN(phone)) { authError(t('err_phone_in')); return; }
      const btn = this; btn.disabled = true;
      Auth.register({ name: name, username: username,
        phone: phone ? cleanPhoneIN(phone) : '', password: pw,
      }).then(function (resp) {
        if (resp && resp.first) { authView = 'login'; toast(t('reg_admin_msg')); }
        else authView = 'regdone';
        renderAuth();
      }).catch(function (e) { btn.disabled = false; authError(errMsg(e)); });
    };
  }
  function renderAuthMsg() {
    const msg = authView === 'forgot' ? t('forgot_msg') : t('reg_done_msg');
    $view().innerHTML = '<div class="card center onboard"><div class="big-emoji">' +
      (authView === 'forgot' ? '🔑' : '📨') + '</div>' +
      '<p style="line-height:1.6">' + esc(msg) + '</p>' +
      '<button id="am-back" class="primary big block">' + esc(t('back_to_login')) + '</button></div>';
    document.getElementById('am-back').onclick = function () { authView = 'login'; renderAuth(); };
  }
  function renderChangePw(forced) {
    $view().innerHTML = '<div class="card center onboard"><h2>' + esc(t('change_pw_title')) + '</h2>' +
      (forced ? '<div class="hint">' + esc(t('must_change_msg')) + '</div>' : '') +
      (forced ? '' : '<div class="field"><label>' + esc(t('old_password')) + '</label>' +
        '<input id="cp-old" type="password"></div>') +
      '<div class="field"><label>' + esc(t('new_password')) + '</label><input id="cp-new" type="password"></div>' +
      '<div class="field"><label>' + esc(t('confirm_password')) + '</label><input id="cp-new2" type="password"></div>' +
      '<button id="cp-btn" class="primary big block">' + esc(t('change_pw_btn')) + '</button>' +
      (forced ? '' : '<button id="cp-back" class="ghost block">' + esc(t('back')) + '</button>') +
      '</div>';
    const backB = document.getElementById('cp-back');
    if (backB) backB.onclick = function () { navigate('settings'); };
    document.getElementById('cp-btn').onclick = function () {
      const nw = document.getElementById('cp-new').value;
      if (nw !== document.getElementById('cp-new2').value) { toast(t('pw_mismatch')); return; }
      const oldEl = document.getElementById('cp-old');
      const btn = this; btn.disabled = true;
      Auth.changePassword(oldEl ? oldEl.value : '', nw)
        .then(function () { toast(t('saved')); navigate('home'); })
        .catch(function (e) { btn.disabled = false; toast(errMsg(e)); });
    };
  }

  // ---------- admin panel ----------
  function adminAction(action, payload, after) {
    Auth.call(action, Object.assign({ token: Auth.token() }, payload))
      .then(function (resp) { after && after(resp); renderAdmin(); })
      .catch(function (e) { toast(errMsg(e)); });
  }
  // human label for an audit action code (falls back to the raw code)
  function auditLabel(action) {
    const lang = Settings.get('lang') === 'en' ? 'en' : 'bn';
    const M = {
      'void': { bn: '🚫 বাতিল', en: '🚫 Void' },
      'correction:approve': { bn: '✅ সংশোধন মঞ্জুর', en: '✅ Correction approved' },
      'correction:reject': { bn: '❌ সংশোধন নাকচ', en: '❌ Correction rejected' },
      'handover:confirm': { bn: '💰 জমা নিশ্চিত', en: '💰 Handover confirmed' },
      'admin:grant': { bn: '👑 admin দেওয়া', en: '👑 Admin granted' },
      'admin:revoke': { bn: '👑 admin সরানো', en: '👑 Admin revoked' },
      'cashier:on': { bn: '💰 ক্যাশিয়ার করা', en: '💰 Made cashier' },
      'cashier:off': { bn: 'ক্যাশিয়ার সরানো', en: 'Removed cashier' },
      'status:approved': { bn: '✅ approve করা', en: '✅ Approved' },
      'status:blocked': { bn: '🚫 block করা', en: '🚫 Blocked' },
      'status:pending': { bn: 'pending করা', en: 'Set pending' },
      'reports': { bn: '📊 report permission', en: '📊 Report perms' },
      'areas': { bn: '📍 এলাকা assign', en: '📍 Areas assigned' },
      'entries': { bn: '✏️ entry permission', en: '✏️ Entry perms' },
      'password:reset': { bn: '🔑 পাসওয়ার্ড রিসেট', en: '🔑 Password reset' },
      'session:release': { bn: '🔓 সেশন ছাড়া', en: '🔓 Session released' },
      'subject:add': { bn: '➕ বিষয় যোগ', en: '➕ Subject added' },
      'subject:edit': { bn: '✏️ বিষয় বদল', en: '✏️ Subject edited' },
      'subject:remove': { bn: '🗑️ বিষয় সরানো', en: '🗑️ Subject removed' },
      'area:add': { bn: '➕ এলাকা যোগ', en: '➕ Area added' },
      'location:add': { bn: '➕ location যোগ', en: '➕ Location added' },
      'item:edit': { bn: '✏️ তালিকা বদল', en: '✏️ List edited' },
      'item:remove': { bn: '🗑️ তালিকা সরানো', en: '🗑️ List removed' },
    };
    return (M[action] && M[action][lang]) || action;
  }
  function renderAuditLog() {
    $view().innerHTML = backBar('admin') + '<div class="flow-title">' + esc(t('audit_title')) + '</div>' +
      '<div id="audit-body"><div class="empty">' + esc(t('loading')) + '</div></div>';
    Auth.call('auditLog', { token: Auth.token(), limit: 150 }).then(function (resp) {
      const body = document.getElementById('audit-body'); if (!body) return;
      const log = resp.log || [];
      body.innerHTML = log.length ? '<div class="card">' + log.map(function (e) {
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 100%"><b>' + esc(auditLabel(e.action)) + '</b>' +
          (e.detail ? ' <span class="row-sub">' + esc(e.detail) + '</span>' : '') +
          '<div class="row-sub">' + esc(e.actor || '?') + ' • ' + esc(fmtDateTime(e.ts)) + '</div></div></div>';
      }).join('') + '</div>' : '<div class="empty">' + esc(t('audit_empty')) + '</div>';
    }).catch(function (e) {
      const body = document.getElementById('audit-body'); if (body) body.innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>';
    });
  }
  // Resize an uploaded logo to fit a Google Sheets cell (<50000 chars). Returns
  // a dataURL under the limit, or rejects with an error key.
  function fitLogo(file) {
    return new Promise(function (resolve, reject) {
      if (!/^image\/(png|jpeg)$/.test(file.type)) return reject('err_logo_type');
      if (file.size > 3 * 1024 * 1024) return reject('err_logo_big');
      const fr = new FileReader();
      fr.onerror = function () { reject('err_logo_read'); };
      fr.onload = function () {
        const im = new Image();
        im.onerror = function () { reject('err_logo_read'); };
        im.onload = function () {
          const sizes = [128, 112, 96, 80];
          for (let i = 0; i < sizes.length; i++) {
            const s = sizes[i], cv = document.createElement('canvas');
            const scale = Math.min(s / im.width, s / im.height, 1);
            cv.width = Math.round(im.width * scale); cv.height = Math.round(im.height * scale);
            cv.getContext('2d').drawImage(im, 0, 0, cv.width, cv.height);
            let url = cv.toDataURL('image/png');
            if (url.length > 45000) url = cv.toDataURL('image/jpeg', 0.82);
            if (url.length <= 45000) return resolve(url);
          }
          reject('err_logo_big');
        };
        im.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  function renderReceiptConfig() {
    const form = {
      receipt_layout: centralConfig.receipt_layout || 'classic',
      puja_name: centralConfig.puja_name || centralConfig.committee_name || '',
      committee_name: centralConfig.committee_name || '',
      receipt_footer: centralConfig.receipt_footer || '',
      receipt_color: centralConfig.receipt_color || '#c0392b',
      committee_logo: centralConfig.committee_logo || '',
      receipt_digits: String(Number(centralConfig.receipt_digits) || 6),
    };
    const layouts = [['classic', t('rl_classic')], ['festive', t('rl_festive')], ['minimal', t('rl_minimal')]];
    const colors = ['#c0392b', '#7b1113', '#1e7d3a', '#2a4d9b', '#8a5a00'];
    const digitOpts = ['4', '5', '6', '7'];
    const sampleRC = { donorLine: 'শ্রী/শ্রীমতী রমেশ সাহা, কমল স্টোর্স', showTotals: true,
      date: todayISO(), datetime: new Date().toISOString(),
      amount: 500, cashUpi: '', paidTotal: 500, pledged: 1000, due: 500, receiptNo: '' };
    function drawPreview() {
      const d = Math.min(9, Math.max(4, Number(form.receipt_digits) || 6));
      sampleRC.receiptNo = String(Settings.get('year') || '2026') + String(1).padStart(d, '0');
      buildReceiptCanvas(sampleRC, {
        layout: form.receipt_layout, puja: form.puja_name || t('app_title'), committee: form.committee_name,
        footer: form.receipt_footer || t('receipt_thanks'), color: form.receipt_color, logo: form.committee_logo,
      }).then(function (cv) {
        const img = document.getElementById('rc-preview'); if (img) img.src = cv.toDataURL('image/png');
      });
    }
    function paint() {
      $view().innerHTML = backBar('admin') + '<div class="flow-title">' + esc(t('receipt_design_title')) + '</div>' +
        '<img id="rc-preview" alt="" style="width:100%;max-width:420px;display:block;margin:0 auto 12px;border:1px solid #eee;border-radius:10px">' +
        '<div class="card">' +
        '<div class="field"><label>' + esc(t('rl_layout')) + '</label><div class="chips">' +
          layouts.map(function (l) { return '<button class="chip' + (form.receipt_layout === l[0] ? ' on' : '') + '" data-rl="' + l[0] + '">' + esc(l[1]) + '</button>'; }).join('') + '</div></div>' +
        '<div class="field"><label>' + esc(t('rc_puja')) + '</label><input id="rc-puja" value="' + esc(form.puja_name) + '" placeholder="' + esc(t('app_title')) + '"></div>' +
        '<div class="field"><label>' + esc(t('rc_committee')) + '</label><input id="rc-name" value="' + esc(form.committee_name) + '"></div>' +
        '<div class="field"><label>' + esc(t('rc_footer')) + '</label><input id="rc-footer" value="' + esc(form.receipt_footer) + '" placeholder="' + esc(t('receipt_thanks')) + '"></div>' +
        '<div class="field"><label>' + esc(t('rc_color')) + '</label><div class="chips">' +
          colors.map(function (c) { return '<button class="chip' + (form.receipt_color === c ? ' on' : '') + '" data-rcol="' + c + '" style="background:' + c + ';color:#fff">●</button>'; }).join('') + '</div></div>' +
        '<div class="field"><label>' + esc(t('rc_logo')) + '</label>' +
          '<input type="file" id="rc-logo" accept="image/png,image/jpeg">' +
          (form.committee_logo ? ' <button class="chip" id="rc-logo-rm">' + esc(t('rc_logo_remove')) + '</button>' : '') +
          '<div class="hint">' + esc(t('rc_logo_hint')) + '</div></div>' +
        '<div class="field"><label>' + esc(t('rc_digits')) + '</label><div class="chips">' +
          digitOpts.map(function (d) { return '<button class="chip' + (form.receipt_digits === d ? ' on' : '') + '" data-rdig="' + d + '">' + esc(toBengaliDigits(d)) + '</button>'; }).join('') + '</div>' +
          '<div class="hint">' + esc(t('rc_digits_hint')) + '</div></div>' +
        '</div>' +
        '<button id="rc-save" class="primary big block">' + esc(t('save')) + '</button>';
      drawPreview();
      document.querySelectorAll('[data-rl]').forEach(function (b) { b.onclick = function () { form.receipt_layout = b.dataset.rl; paint(); }; });
      document.querySelectorAll('[data-rcol]').forEach(function (b) { b.onclick = function () { form.receipt_color = b.dataset.rcol; paint(); }; });
      document.querySelectorAll('[data-rdig]').forEach(function (b) { b.onclick = function () { form.receipt_digits = b.dataset.rdig; paint(); }; });
      document.getElementById('rc-puja').oninput = function (e) { form.puja_name = e.target.value; drawPreview(); };
      document.getElementById('rc-name').oninput = function (e) { form.committee_name = e.target.value; drawPreview(); };
      document.getElementById('rc-footer').oninput = function (e) { form.receipt_footer = e.target.value; drawPreview(); };
      document.getElementById('rc-logo').onchange = function (e) {
        const f = e.target.files && e.target.files[0]; if (!f) return;
        fitLogo(f).then(function (url) { form.committee_logo = url; paint(); })
          .catch(function (k) { toast(t(k) || t('err_logo_read')); });
      };
      const rm = document.getElementById('rc-logo-rm');
      if (rm) rm.onclick = function () { form.committee_logo = ''; paint(); };
      document.getElementById('rc-save').onclick = function () {
        const btn = this; btn.disabled = true;
        Auth.call('setConfig', { token: Auth.token(), config: form }).then(function () {
          centralConfig = Object.assign({}, centralConfig, form);
          try { localStorage.setItem('ck_config', JSON.stringify(centralConfig)); } catch (e) {}
          toast(t('saved')); navigate('admin');
        }).catch(function (e) { btn.disabled = false; toast(errMsg(e)); });
      };
    }
    paint();
  }
  let admOpenUser = '';
  function renderAdmin() {
    $view().innerHTML = backBar('settings') + '<div class="empty">' + esc(t('loading')) + '</div>';
    Promise.all([
      Auth.call('listUsers', { token: Auth.token() }),
      Auth.call('listSubjects', { token: Auth.token() }).catch(function () { return { subjects: [] }; }),
      Auth.call('listItems', { token: Auth.token() }).catch(function () { return { items: [] }; }),
    ]).then(function (res) {
      const resp = res[0], subjects = res[1].subjects || [], items = res[2].items || [];
      const areas = items.filter(function (i) { return i.kind === 'area'; });
      const locations = items.filter(function (i) { return i.kind === 'location'; });
      const year = String(Settings.get('year'));
      const groups = { pending: [], approved: [], blocked: [] };
      resp.users.forEach(function (u) { (groups[u.status] || groups.blocked).push(u); });
      function userCard(u) {
        const hasYear = u.years.split(',').indexOf(year) >= 0;
        let btns = '';
        if (u.status === 'pending') {
          btns = '<button class="chip" data-act="approve" data-id="' + u.id + '">' + esc(t('approve')) + '</button>';
        } else if (u.status === 'approved') {
          if (!hasYear) btns += '<button class="chip" data-act="year" data-id="' + u.id + '">' + esc(t('give_year_access')) + '</button>';
          btns += '<button class="chip" data-act="cashier" data-id="' + u.id + '" data-v="' + (u.cashier ? 0 : 1) + '">' +
                  esc(u.cashier ? t('remove_cashier') : t('make_cashier')) + '</button>' +
                  '<button class="chip" data-act="role" data-id="' + u.id + '" data-v="' + (u.role === 'admin' ? 'user' : 'admin') + '">' +
                  esc(u.role === 'admin' ? t('remove_admin') : t('make_admin')) + '</button>' +
                  '<button class="chip" data-act="reset" data-id="' + u.id + '">' + esc(t('reset_pw')) + '</button>' +
                  '<button class="chip" data-act="release" data-id="' + u.id + '">' + esc(t('release_session')) + '</button>' +
                  (u.role === 'admin' ? '' : '<button class="chip" data-act="block" data-id="' + u.id + '">' + esc(t('block')) + '</button>');
        } else {
          btns = '<button class="chip" data-act="unblock" data-id="' + u.id + '">' + esc(t('unblock')) + '</button>';
        }
        // ONE user open at a time. Every user fully expanded put ~280 chips on a
        // single screen for a committee this size, which is not a list anyone
        // can read — the summary line says what they have, and the detail is
        // one tap away without leaving the page.
        const open = admOpenUser === u.id;
        const body = u.status === 'approved'
          ? '<div class="chips" style="margin:8px 0 0">' + btns + '</div>' +
            entriesChips(u) + reportChips(u) + areaChips(u)
          : '<div class="chips" style="margin:8px 0 0">' + btns + '</div>';
        return '<div class="adm-user' + (open ? ' open' : '') + '">' +
          '<button class="adm-user-head" data-uopen="' + u.id + '">' +
            '<span class="adm-user-name"><b>' + esc(u.name) + '</b>' +
              (u.role === 'admin' ? ' 👑' : '') + (u.cashier ? ' 💰' : '') +
              '<span class="row-sub">' + esc(userSummary(u)) + '</span></span>' +
            '<span class="adm-caret">' + (open ? '▾' : '›') + '</span>' +
          '</button>' +
          '<div class="adm-user-body"' + (open ? '' : ' hidden') + '>' +
            '<div class="row-sub" style="margin-bottom:8px">@' + esc(u.username) +
              (u.phone ? ' • 📞 ' + esc(u.phone) : '') + ' • ' + esc(u.years || '—') + '</div>' +
            body + '</div></div>';
      }
      // One line that says what this person actually has, so the list can be
      // read without opening anybody.
      function userSummary(u) {
        if (u.status !== 'approved') return '@' + u.username;
        if (u.role === 'admin') return t('sum_admin_all');
        const ent = String(u.entries || '').split(',').filter(Boolean);
        const entTxt = !ent.length ? '⚠️ ' + t('sum_none')
          : ent.filter(function (k) { return Aggregate.ENTRY_KINDS.indexOf(k) >= 0; })
               .map(function (k) { return t(CAT_LABEL_KEYS[k] || k); }).join(', ') || '⚠️ ' + t('sum_none');
        const reps = String(u.reports || '').split(',').filter(Boolean).length + (u.cashier ? 1 : 0);
        const ars = String(u.areas || '').split(',').filter(Boolean).length;
        return [entTxt,
                reps ? reps + ' ' + t('sum_reports') : t('sum_no_report'),
                ars ? ars + ' ' + t('sum_areas') : t('sum_no_area')].join(' · ');
      }
      // What this user may collect, one chip per category (empty = all). Drives
      // the home tiles AND the ledger tabs, so a grant and what it opens are
      // always the same word. `review` rides along — it is the cashier's
      // correction desk, not a category, hence the separator.
      // heading · all/none shortcuts · state note · the chips
      function permGroup(u, titleKey, kind, chips, note, isDefaultAll, isEmpty) {
        return '<div class="perm-grp"><div class="perm-head">' + esc(t(titleKey)) +
            '<span class="perm-bulk">' +
              '<button class="chip mini" data-bulk="' + kind + '" data-bulk-user="' + u.id + '" data-bulk-on="1">' + esc(t('bulk_all')) + '</button>' +
              '<button class="chip mini" data-bulk="' + kind + '" data-bulk-user="' + u.id + '" data-bulk-on="0">' + esc(t('bulk_none')) + '</button>' +
            '</span></div>' +
          // "nothing set" and "everything explicitly granted" look identical in
          // chips, so say which one it is instead of leaving it to be guessed
          // Nothing granted is a real state with real consequences — this person
          // cannot make a single entry — so it is said loudly, not left to be
          // inferred from a row of grey chips.
          (isEmpty ? '<div class="perm-warn">⚠️ ' + esc(t('perm_none_yet')) + '</div>' : '') +
          '<div class="chips" style="margin:4px 0 0">' + chips + '</div>' +
          (note ? '<div class="perm-note">' + esc(note) + '</div>' : '') + '</div>';
      }
      function entriesChips(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        const set = String(u.entries || '').split(',').filter(Boolean);
        const kinds = [['shop', t('new_shop')], ['person', t('new_person')], ['member', t('new_member')],
                       ['bus', t('daily_bus')], ['road', t('daily_road')], ['toto', t('daily_toto')],
                       ['review', t('review_title')], ['otherdonor', t('perm_otherdonor')]];
        const chips = kinds.map(function (k) {
          const on = set.indexOf(k[0]) >= 0;
          return '<button class="chip' + (on ? ' on' : '') + '" data-ent-user="' + u.id + '" data-ent-id="' + k[0] + '">' + esc(k[1]) + '</button>';
        }).join('');
        return permGroup(u, 'entry_perms', 'ent', chips, t('perms_common'), false, !set.length);
      }
      // which master areas a collector is responsible for (drives area reports)
      function areaChips(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        const mine = String(u.areas || '').split(',').filter(Boolean);
        const chips = areas.length ? areas.map(function (a) {
          const on = mine.indexOf(a.id) >= 0;
          return '<button class="chip' + (on ? ' on' : '') + '" data-area-user="' + u.id + '" data-area-id="' + esc(a.id) + '">' +
            esc(Settings.get('lang') === 'en' ? (a.nameEn || a.nameBn) : (a.nameBn || a.nameEn)) + '</button>';
        }).join('') : '<span class="row-sub">' + esc(t('no_areas_yet')) + '</span>';
        return permGroup(u, 'assign_areas', 'area', chips, '', false);
      }
      function reportChips(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        const granted = String(u.reports || '').split(',').filter(Boolean);
        const chips = REPORT_IDS.map(function (rid) {
          const autoCashier = (rid === 'inhand' && u.cashier);
          const on = autoCashier || granted.indexOf(rid) >= 0;
          return '<button class="chip' + (on ? ' on' : '') + '" data-rep-user="' + u.id +
            '" data-rep-id="' + rid + '"' + (autoCashier ? ' disabled title="auto"' : '') + '>' +
            esc(t('report_' + rid)) + '</button>';
        }).join('');
        return permGroup(u, 'report_perms', 'rep', chips,
                         u.cashier ? t('inhand_auto_cashier') : '', false);
      }
      function section(key, list) {
        return '<div class="section">' + esc(t(key)) + ' (' + list.length + ')</div>' +
          (list.length ? list.map(userCard).join('') : '<div class="empty">' + esc(t('none_here')) + '</div>');
      }
      const subjectsCard = '<div class="card"><div class="card-title">' + esc(t('manage_subjects')) + '</div>' +
        '<div class="input-row"><input id="subj-input" placeholder="' + esc(t('add_subject_ph')) + '" autocomplete="off">' +
        '<button id="subj-add" class="primary">' + esc(t('add_btn')) + '</button></div>' +
        (subjects.length ? subjects.map(function (s) {
          return '<div class="row" style="cursor:default"><div><b>' + esc(s.name) + '</b></div><div class="chips" style="margin:0">' +
            '<button class="chip" data-subj-edit="' + esc(s.id) + '">' + esc(t('edit_btn')) + '</button>' +
            '<button class="chip" data-subj-del="' + esc(s.id) + '">' + esc(t('del_btn')) + '</button></div></div>';
        }).join('') : '<div class="empty">' + esc(t('no_subjects')) + '</div>') + '</div>';
      // bilingual master-list manager (areas, person locations)
      function listMgmtCard(kind, titleKey, list) {
        return '<div class="card"><div class="card-title">' + esc(t(titleKey)) + '</div>' +
          '<div class="input-row"><input id="li-bn-' + kind + '" placeholder="' + esc(t('name_bn')) + '" autocomplete="off">' +
          '<input id="li-en-' + kind + '" placeholder="' + esc(t('name_en')) + '" autocomplete="off">' +
          '<button class="primary" data-li-add="' + kind + '">' + esc(t('add_btn')) + '</button></div>' +
          (list.length ? list.map(function (it) {
            return '<div class="row" style="cursor:default"><div><b>' + esc(it.nameBn) + '</b>' +
              '<div class="row-sub">' + esc(it.nameEn) + '</div></div><div class="chips" style="margin:0">' +
              '<button class="chip" data-li-edit="' + esc(it.id) + '">' + esc(t('edit_btn')) + '</button>' +
              '<button class="chip" data-li-del="' + esc(it.id) + '">' + esc(t('del_btn')) + '</button></div></div>';
          }).join('') : '<div class="empty">' + esc(t('no_items')) + '</div>') + '</div>';
      }
      // Grouped into collapsible sections (native <details>) so the admin sees
      // four tidy groups instead of a wall of buttons and cards. Users opens by
      // default (approvals are the most frequent job); a pending user forces it.
      const fold = function (icon, titleKey, badge, inner, open) {
        return '<details class="adm-fold"' + (open ? ' open' : '') + '><summary>' + icon + ' ' + esc(t(titleKey)) +
          (badge ? ' <span class="badge warn" style="margin-left:6px">' + badge + '</span>' : '') +
          '</summary><div class="adm-fold-body">' + inner + '</div></details>';
      };
      $view().innerHTML = backBar('settings') + '<div class="flow-title">' + esc(t('admin_panel')) + '</div>' +
        (isLive() ? '' : '<div class="card" style="border:1.5px solid #d9a441;background:#fff8e8">' +
          '<b>🟡 ' + esc(t('training_mode')) + '</b><div class="row-sub">' + esc(t('training_admin_hint')) + '</div>' +
          '<button id="golive-btn" class="primary big block" style="margin-top:8px">🚀 ' + esc(t('golive_btn')) + '</button>' +
          // Practice runs leave the book full of junk. This clears it and stays
          // in training, so the next rehearsal starts from a clean sheet —
          // unlike Go Live, which is one-way. Only ever offered while training.
          '<button id="clear-tr-btn" class="ghost block" style="margin-top:6px">🧹 ' + esc(t('clear_training_btn')) + '</button>' +
          '<div class="row-sub" style="margin-top:6px">' + esc(t('clear_training_hint')) + '</div></div>') +
        '<button id="adm-refresh" class="ghost block">' + esc(t('refresh')) + '</button>' +
        fold('👥', 'adm_users', groups.pending.length || '',
          section('pending_users', groups.pending) +
          section('approved_users', groups.approved) +
          section('blocked_users', groups.blocked), true) +
        fold('🧾', 'adm_lists', '',
          '<button id="receipt-btn" class="ghost big block">' + esc(t('receipt_design_btn')) + '</button>' +
          subjectsCard +
          listMgmtCard('area', 'manage_areas', areas) +
          listMgmtCard('location', 'manage_locations', locations), false) +
        fold('🗂️', 'adm_data', '',
          // the chat switch lives with the other data controls, and always says
          // what it is costing — so turning it back on is an informed choice
          '<div class="row" style="cursor:default;flex-wrap:wrap"><div style="flex:1 1 60%"><b>💬 ' +
            esc(t('nav_messages')) + '</b><div class="row-sub" id="chat-load-line">—</div></div>' +
            '<button class="chip" id="chat-toggle">' +
              esc(chatOn() ? t('chat_stop_btn') : t('chat_restart_btn')) + '</button></div>' +
          '<button id="audit-btn" class="ghost big block">' + esc(t('audit_btn')) + '</button>' +
          '<button id="backup-btn" class="ghost big block">' + esc(t('backup_now_btn')) + '</button>' +
          '<button id="restore-btn" class="ghost big block">' + esc(t('restore_btn')) + '</button>' +
          '<button id="rollover-btn" class="ghost big block">' + esc(t('rollover_btn')) + '</button>', false);
      document.getElementById('adm-refresh').onclick = renderAdmin;
      const clearBtn = document.getElementById('clear-tr-btn');
      if (clearBtn) clearBtn.onclick = function () {
        if (isLive()) { toast(t('already_live')); return; }
        if (!window.confirm(t('clear_training_confirm1'))) return;
        const typed = window.prompt(t('clear_training_confirm2'));
        if (String(typed || '').trim().toUpperCase() !== 'CLEAR') { toast(t('golive_cancelled')); return; }
        clearBtn.disabled = true;
        Auth.call('clearTraining', { token: Auth.token(), confirm: 'CLEAR' })
          .then(function (r) {
            // the server bumped data_epoch, so this device must drop its own
            // copy too — otherwise the phone keeps showing rows the sheet lost
            return DB.clearAll().then(function () {
              toast(t('clear_training_done') + (r && r.backup ? ' · ' + r.backup : ''));
              return pullCentral();
            });
          })
          .then(function () { updateBadge(); navigate('home'); })
          .catch(function (e) { clearBtn.disabled = false; toast(errMsg(e)); });
      };
      const goLiveBtn = document.getElementById('golive-btn');
      if (goLiveBtn) goLiveBtn.onclick = function () {
        // destructive + one-way → three gates: confirm, type LIVE, final confirm
        if (!window.confirm(t('golive_confirm1'))) return;
        const typed = window.prompt(t('golive_confirm2'));
        if (String(typed || '').trim().toUpperCase() !== 'LIVE') { toast(t('golive_cancelled')); return; }
        // ask the serial digit-width before locking it in (year + N digits)
        const curDigits = Number(centralConfig.receipt_digits) || 6;
        const dRaw = window.prompt(t('golive_digits'), String(curDigits));
        if (dRaw === null) { toast(t('golive_cancelled')); return; }
        const digits = Math.min(9, Math.max(4, Number(dRaw) || 6));
        const sample = String(Settings.get('year') || '2026') + String(1).padStart(digits, '0');
        if (!window.confirm(t('golive_confirm3').replace('{sample}', sample))) return;
        const btn = this; btn.disabled = true;
        Auth.call('goLive', { token: Auth.token(), digits: digits }).then(function () {
          toast(t('golive_done'));
          pullCentral().then(function () { navigate('home'); }); // epoch bump wipes local training data
        }).catch(function (e) { btn.disabled = false; toast(errMsg(e)); });
      };
      const chatTog = document.getElementById('chat-toggle');
      if (chatTog) chatTog.onclick = function () {
        const turningOff = chatOn();
        if (turningOff && !window.confirm(t('chat_stop_confirm'))) return;
        chatTog.disabled = true;
        Auth.call('setConfig', { token: Auth.token(), key: 'chat_off', value: turningOff ? 'on' : '' })
          .then(function () {
            centralConfig.chat_off = turningOff ? 'on' : '';
            toast(t(turningOff ? 'chat_stopped' : 'saved')); renderAdmin();
          })
          .catch(function (e) { chatTog.disabled = false; toast(errMsg(e)); });
      };
      viewData().then(function (d2) {
        const l = Aggregate.chatLoad(d2), el = document.getElementById('chat-load-line');
        if (el) el.textContent = l.count + ' ' + t('chat_msgs') + ' · ' + Math.round(l.bytes / 1024) +
          ' KB · ' + t('chat_per_day') + ' ' + l.perDay +
          (l.level === 'ok' ? '' : (l.level === 'high' ? '  🔴' : '  🟠'));
      }).catch(function () {});
      document.getElementById('audit-btn').onclick = function () { navigate('audit'); };
      document.getElementById('receipt-btn').onclick = function () { navigate('receiptcfg'); };
      // on-demand snapshot — the cheap insurance before anything one-way
      document.getElementById('backup-btn').onclick = function () {
        const b = this; b.disabled = true;
        Auth.call('backupNow', { token: Auth.token() })
          .then(function (r) { b.disabled = false; alert(t('backup_done').replace('{f}', r.file)); })
          .catch(function (e) { b.disabled = false; toast(errMsg(e)); });
      };
      // restore: pick a snapshot, then type RESTORE — the server takes a
      // safety backup of the CURRENT state first, so this is itself undoable
      document.getElementById('restore-btn').onclick = function () {
        Auth.call('listBackups', { token: Auth.token() }).then(function (r) {
          const list = r.backups || [];
          if (!list.length) { alert(t('restore_none')); return; }
          const menu = list.slice(0, 10).map(function (f, i) { return (i + 1) + '. ' + f.name; }).join('\n');
          const pick = window.prompt(t('restore_pick') + '\n\n' + menu);
          const idx = Number(pick) - 1;
          if (!(idx >= 0 && idx < list.length)) return;
          if (!window.confirm(t('restore_confirm').replace('{f}', list[idx].name))) return;
          if (String(window.prompt(t('restore_type')) || '').trim().toUpperCase() !== 'RESTORE') return;
          Auth.call('restoreBackup', { token: Auth.token(), fileId: list[idx].id, confirm: 'RESTORE' })
            .then(function (res) {
              alert(t('restore_done').replace('{n}', (res.restored || []).join(', ')).replace('{s}', res.safetyBackup));
              DB.clearAll().then(function () { location.reload(); }); // re-pull the restored data
            }).catch(function (e) { toast(errMsg(e)); });
        }).catch(function (e) { toast(errMsg(e)); });
      };
      document.getElementById('rollover-btn').onclick = function () {
        const from = Number(Settings.get('year')), to = from + 1;
        if (!window.confirm(t('rollover_confirm').replace('{from}', from).replace('{to}', to))) return;
        Auth.call('rolloverYear', { token: Auth.token(), fromYear: from, toYear: to })
          .then(function (r) { alert(t('rollover_done').replace('{n}', r.count).replace('{to}', to)); })
          .catch(function (e) { toast(errMsg(e)); });
      };
      document.getElementById('subj-add').onclick = function () {
        const name = document.getElementById('subj-input').value.trim();
        if (!name) return;
        adminAction('addSubject', { name: name });
      };
      document.getElementById('subj-input').onkeydown = function (e) {
        if (e.key === 'Enter') document.getElementById('subj-add').click();
      };
      document.querySelectorAll('[data-subj-del]').forEach(function (b) {
        b.onclick = function () { adminAction('removeSubject', { id: b.dataset.subjDel }); };
      });
      document.querySelectorAll('[data-subj-edit]').forEach(function (b) {
        b.onclick = function () {
          const s = subjects.find(function (x) { return x.id === b.dataset.subjEdit; }) || {};
          const nm = window.prompt(t('edit_item_title'), s.name || ''); if (nm === null) return;
          if (nm.trim()) adminAction('editSubject', { id: b.dataset.subjEdit, name: nm.trim() });
        };
      });
      const afterList = function () { Lists.refresh(); }; // refresh the client cache too
      document.querySelectorAll('[data-li-add]').forEach(function (b) {
        b.onclick = function () {
          const kind = b.dataset.liAdd;
          const bn = document.getElementById('li-bn-' + kind).value.trim();
          const en = document.getElementById('li-en-' + kind).value.trim();
          if (!bn && !en) return;
          adminAction('addItem', { kind: kind, nameBn: bn, nameEn: en }, afterList);
        };
      });
      document.querySelectorAll('[data-li-del]').forEach(function (b) {
        b.onclick = function () { adminAction('removeItem', { id: b.dataset.liDel }, afterList); };
      });
      document.querySelectorAll('[data-li-edit]').forEach(function (b) {
        b.onclick = function () {
          const it = items.find(function (x) { return x.id === b.dataset.liEdit; }) || {};
          const bn = window.prompt(t('name_bn'), it.nameBn || ''); if (bn === null) return;
          const en = window.prompt(t('name_en'), it.nameEn || ''); if (en === null) return;
          adminAction('editItem', { id: b.dataset.liEdit, nameBn: bn.trim(), nameEn: en.trim() }, afterList);
        };
      });
      document.querySelectorAll('[data-act]').forEach(function (b) {
        const id = b.dataset.id;
        b.onclick = function () {
          if (b.dataset.act === 'approve') adminAction('setStatus', { userId: id, status: 'approved', year: Settings.get('year') });
          else if (b.dataset.act === 'year') adminAction('approveYear', { userId: id, year: Settings.get('year') });
          else if (b.dataset.act === 'cashier') adminAction('setCashier', { userId: id, cashier: Number(b.dataset.v) });
          else if (b.dataset.act === 'role') adminAction('setRole', { userId: id, role: b.dataset.v });
          else if (b.dataset.act === 'block') adminAction('setStatus', { userId: id, status: 'blocked' });
          else if (b.dataset.act === 'unblock') adminAction('setStatus', { userId: id, status: 'approved', year: Settings.get('year') });
          else if (b.dataset.act === 'reset') adminAction('resetPassword', { userId: id }, function (r) {
            alert(t('temp_pw_is') + ':\n\n' + r.tempPassword);
          });
          else if (b.dataset.act === 'release') {
            if (window.confirm(t('release_confirm'))) adminAction('releaseSession', { userId: id }, function () { toast(t('release_done')); });
          }
        };
      });
      document.querySelectorAll('[data-uopen]').forEach(function (b) {
        b.onclick = function () {
          const id = b.dataset.uopen;
          admOpenUser = (admOpenUser === id) ? '' : id;
          document.querySelectorAll('.adm-user').forEach(function (el) {
            const mine = el.querySelector('[data-uopen]').dataset.uopen === admOpenUser;
            el.classList.toggle('open', mine);
            el.querySelector('.adm-user-body').hidden = !mine;
            el.querySelector('.adm-caret').textContent = mine ? '▾' : '›';
          });
          if (admOpenUser) b.scrollIntoView({ block: 'nearest' });
        };
      });
      // [সব দাও] / [সব নাও] — the chips still work one by one; this only saves
      // tapping seven reports for eleven people.
      document.querySelectorAll('[data-bulk]').forEach(function (b) {
        b.onclick = function () {
          const uid = b.dataset.bulkUser, on = b.dataset.bulkOn === '1';
          const u = resp.users.find(function (x) { return x.id === uid; });
          if (!u) return;
          if (b.dataset.bulk === 'ent') adminAction('setEntries', { userId: uid, entries: on ? Aggregate.PERM_KEYS.slice() : [] });
          else if (b.dataset.bulk === 'rep') adminAction('setReports', { userId: uid, reports: on ? REPORT_IDS.slice() : [] });
          else adminAction('setAreas', { userId: uid, areas: on ? areas.map(function (a) { return a.id; }) : [] });
        };
      });
      document.querySelectorAll('[data-rep-user]').forEach(function (b) {
        b.onclick = function () {
          if (b.disabled) return;
          const uid = b.dataset.repUser, rid = b.dataset.repId;
          const u = resp.users.find(function (x) { return x.id === uid; });
          const set = String(u.reports || '').split(',').filter(Boolean);
          const i = set.indexOf(rid);
          if (i >= 0) set.splice(i, 1); else set.push(rid);
          adminAction('setReports', { userId: uid, reports: set });
        };
      });
      document.querySelectorAll('[data-area-user]').forEach(function (b) {
        b.onclick = function () {
          const uid = b.dataset.areaUser, aid = b.dataset.areaId;
          const u = resp.users.find(function (x) { return x.id === uid; });
          const set = String(u.areas || '').split(',').filter(Boolean);
          const i = set.indexOf(aid);
          if (i >= 0) set.splice(i, 1); else set.push(aid);
          adminAction('setAreas', { userId: uid, areas: set });
        };
      });
      document.querySelectorAll('[data-ent-user]').forEach(function (b) {
        b.onclick = function () {
          const uid = b.dataset.entUser, kind = b.dataset.entId;
          const u = resp.users.find(function (x) { return x.id === uid; });
          // An empty field grants nothing, so a chip means exactly what it
          // shows and toggling is a plain add/remove — no "materialise all"
          // step, which is where the retired key names used to leak back in.
          const set = String(u.entries || '').split(',').filter(Boolean);
          const i = set.indexOf(kind);
          if (i >= 0) set.splice(i, 1); else set.push(kind);
          adminAction('setEntries', { userId: uid, entries: set });
        };
      });
    }).catch(function (e) { $view().innerHTML = backBar('settings') + '<div class="empty">' + esc(errMsg(e)) + '</div>'; });
  }

  // ---------- router ----------
  let current = { view: 'home', params: {} };
  function navigate(view, params) {
    current = { view: view, params: params || {} };
    flowState = view === 'entry' ? flowState : null;
    // push a history entry so the phone/browser Back button steps back
    // through the app instead of leaving it.
    try { history.pushState({ v: view, p: current.params }, ''); } catch (e) {}
    render();
    window.scrollTo(0, 0); // a user navigation starts at the top of the new screen
  }
  function render() {
    document.getElementById('app-title').textContent = '🙏 ' + pujaName();
    updateTrainingBar(); // persistent training strip + header title, every screen
    document.querySelectorAll('#bottomnav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.nav === current.view);
      const k = b.dataset.nav;
      if (k === 'messages') b.hidden = !chatOn();
      b.querySelector('span').textContent = t(k === 'list' ? 'khata' : (k === 'messages' ? 'nav_messages' : k));
    });
    if (!Auth.loggedIn()) { renderAuth(); updateBadge(); return; }
    startNotifPolling();
    const user = Auth.current();
    if (user && user.mustChange) { renderChangePw(true); updateBadge(); return; }
    if (flowState) { renderEntry(); return; }
    if (current.view === 'home') renderHome();
    else if (current.view === 'list') renderList();
    else if (current.view === 'party') renderParty(current.params);
    else if (current.view === 'report') renderReport();
    else if (current.view === 'settings') renderSettings();
    else if (current.view === 'admin') { Auth.isAdmin() ? renderAdmin() : renderHome(); }
    else if (current.view === 'cashier') renderCashier();
    else if (current.view === 'hbook') renderHandoverBook();
    else if (current.view === 'messages') { chatOn() ? renderMessages() : renderHome(); }
    else if (current.view === 'entries') renderMyEntries();
    else if (current.view === 'findparty') renderFindParty();
    else if (current.view === 'review') renderReviewCorrections();
    else if (current.view === 'audit') { Auth.isAdmin() ? renderAuditLog() : renderHome(); }
    else if (current.view === 'receiptcfg') { Auth.isAdmin() ? renderReceiptConfig() : renderHome(); }
    else if (current.view === 'receipt') renderReceiptShare(current.params);
    else if (current.view === 'help') renderHelp();
    else renderHome();
    updateBadge();
  }

  window.addEventListener('online', autoSync);
  // phone/browser Back button → step back in the app (in a flow, cancel it)
  window.addEventListener('popstate', function (e) {
    Voice.stop(); flowState = null;
    const s = e.state, v = (s && s.v) || 'home';
    current = { view: v === 'entry' ? 'home' : v, params: (s && s.p) || {} };
    render();
    // no scrollTo here: the browser's native scroll restoration returns Back to
    // where the user was on the previous screen, which is what we want.
  });
  // Session invalidated (another device logged in with this account, or blocked):
  // Auth.call already cleared the local session — bounce to login with a note.
  let authKicked = false;
  window.addEventListener('ck-auth-invalid', function (e) {
    if (authKicked) return; authKicked = true;
    Voice.stop(); flowState = null; authView = 'login';
    toast(e.detail === 'blocked' ? t('err_blocked') : t('session_taken'));
    navigate('home'); // render() → not logged in → login screen
    setTimeout(function () { authKicked = false; }, 3000);
  });
  // ask the browser not to evict our IndexedDB under storage pressure
  if (navigator.storage && navigator.storage.persist) { try { navigator.storage.persist(); } catch (e) {} }
  // warn before leaving/closing if there are entries not yet synced to the sheet
  window.addEventListener('beforeunload', function (e) {
    if (unsyncedN > 0) { e.preventDefault(); e.returnValue = ''; }
  });
  document.addEventListener('DOMContentLoaded', function () {
    document.querySelectorAll('#bottomnav button').forEach(function (b) {
      b.onclick = function () { Voice.stop(); flowState = null; navigate(b.dataset.nav); };
    });
    document.getElementById('sync-badge').onclick = function () {
      Sync.syncNow().then(function (r) {
        toast(r.ok ? t('all_synced') : (r.reason === 'not-configured' ? t('sync_not_configured') : t('sync_fail')));
        updateBadge();
      });
    };
    render();
    autoSync();
    if ('serviceWorker' in navigator) {
      // When an UPDATED SW takes control (skipWaiting + clients.claim), reload
      // once so the page picks up fresh assets — chiefly config.js — instead of
      // running stale in-memory code until the user manually closes the app.
      // Guard: on the very first install there is no prior controller, and
      // clients.claim fires controllerchange too — don't reload in that case.
      const hadController = !!navigator.serviceWorker.controller;
      let swReloaded = false;
      navigator.serviceWorker.addEventListener('controllerchange', function () {
        if (!hadController || swReloaded) return;
        swReloaded = true;
        location.reload();
      });
      navigator.serviceWorker.register('sw.js');
    }
  });
})();
