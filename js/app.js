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
  // null if a valid Indian mobile (10 digits, starts 6–9), else an error key.
  function phoneErrIN(s) {
    return /^[6-9]\d{9}$/.test(cleanPhoneIN(s)) ? null : 'err_phone_in';
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
  function mergeDelta(delta) {
    let changed = false;
    DB.STORES.forEach(function (s) {
      const incoming = delta[s] || [];
      if (!incoming.length) return;
      changed = true;
      const byId = {};
      (centralData[s] || []).forEach(function (r) { if (r && r.id != null) byId[r.id] = r; });
      incoming.forEach(function (r) { if (r && r.id != null) byId[r.id] = r; });
      centralData[s] = Object.keys(byId).map(function (k) { return byId[k]; });
    });
    return changed;
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
      let changed;
      if (resp.mode === 'delta' && centralData) {
        changed = mergeDelta(resp.data || {});
      } else {
        centralData = resp.data || null; // full snapshot (first pull / cache miss)
        changed = true;
      }
      if (resp.cursor != null) centralCursor = String(resp.cursor);
      centralYear = year;
      if (resp.config) { centralConfig = resp.config; try { localStorage.setItem('ck_config', JSON.stringify(centralConfig)); } catch (e) {} }
      try {
        localStorage.setItem('ck_central', JSON.stringify(centralData));
        localStorage.setItem('ck_central_cursor', centralCursor);
        localStorage.setItem('ck_central_year', centralYear);
      } catch (e) { /* quota */ }
      if (!changed || flowState) return; // idle poll (empty delta) → no re-render
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
        new Notification('🙏 ' + t('app_title'), { body: body, icon: 'icons/icon-192.png', tag: 'chanda-notif' });
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
      html += notifRow('💰 <b>' + esc(h.from) + '</b> — ' + fmtMoney(h.amount) + ' <span class="row-sub">' + esc(fmtDate(h.date)) + '</span>',
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
    el.innerHTML = html;
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
          checkNotifications();
          if (!flowState && REFRESHABLE.indexOf(current.view) >= 0) render();
        }).catch(function (e) { b.disabled = false; toast(errMsg(e)); });
      };
    });
  }
  function checkNotifications() {
    if (!Auth.loggedIn() || !navigator.onLine || !Sync.configured()) return;
    Auth.call('notifications', { token: Auth.token(), year: Settings.get('year') })
      .then(function (resp) {
        const n = resp.notifications || { handovers: 0, approvals: 0, corrections: 0 };
        const total = (n.handovers || 0) + (n.approvals || 0) + (n.corrections || 0);
        const prev = (notifCounts.handovers || 0) + (notifCounts.approvals || 0) + (notifCounts.corrections || 0);
        const changed = total !== prev;
        notifCounts = n;
        notifItems = resp.items || { handovers: [], approvals: [], corrections: [] };
        renderNotifBanner();
        if (total > prev) { const m = notifText(); if (m) { toast('🔔 ' + m); osNotify(m); } }
        // auto-refresh a data view (e.g. admin panel) when the count changes,
        // so a new registration/handover shows without a manual refresh
        if (changed && Auth.loggedIn() && !flowState && current.view !== 'home' &&
            REFRESHABLE.indexOf(current.view) >= 0) render();
      }).catch(function () { /* offline / not ready */ });
  }
  // Returning to the app (or a pull-to-refresh) re-renders the current data
  // view so users never have to manually refresh — skipped mid-entry and on
  // transient screens.
  const REFRESHABLE = ['home', 'list', 'report', 'admin', 'cashier', 'party', 'entries', 'review'];
  function onAppFocus() {
    checkNotifications();
    autoSync(); // push anything still pending when the user returns
    Lists.refresh(); // pick up admin edits to areas/locations
    pullCentral(); // refresh the central snapshot
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
      if (!document.hidden) { checkNotifications(); Lists.refresh(); pullCentral(); }
    }, 60000);
    checkNotifications();
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
    flowState = { def: def, answers: Object.assign({}, def.presets || {}), idx: 0, editIdx: -1 };
    try { history.pushState({ v: 'entry' }, ''); } catch (e) {} // Back cancels the entry
    skipHidden();
    renderEntry();
  }
  function visible(step) { return !step.showIf || step.showIf(flowState.answers); }
  function skipHidden() {
    const st = flowState.def.steps;
    while (flowState.idx < st.length &&
           (!visible(st[flowState.idx]) || flowState.answers[st[flowState.idx].key] !== undefined)) {
      flowState.idx++;
    }
  }
  function answerDisplay(step, val) {
    if (val === null || val === undefined || val === '') return '—';
    if (step.kind === 'amount') return fmtMoney(val);
    if (step.kind === 'choice') {
      const o = step.options.find(function (o) { return o.v === val; });
      return o ? (o.labelKey ? t(o.labelKey) : o.label) : val;
    }
    return val;
  }
  function submitAnswer(raw) {
    const step = flowState.def.steps[flowState.idx];
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
    if (flowState.editIdx >= 0) { flowState.editIdx = -1; flowState.idx = flowState.def.steps.length; }
    else { flowState.idx++; skipHidden(); }
    renderEntry();
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

  function renderEntry() {
    const def = flowState.def, steps = def.steps;
    let html = '<div class="flow"><div class="flow-title">' + esc(def.title) + '</div><div class="chat">';
    for (let i = 0; i < flowState.idx && i < steps.length; i++) {
      const s = steps[i];
      if (!visible(s) || flowState.answers[s.key] === undefined) continue;
      html += '<div class="bubble q">' + esc(t(s.qKey)) + '</div>';
      html += '<div class="bubble a">' + esc(answerDisplay(s, flowState.answers[s.key])) + '</div>';
    }
    if (flowState.idx < steps.length) {
      const s = steps[flowState.idx];
      html += '<div class="bubble q now">' + esc(t(s.qKey)) + '</div></div>';
      if (s.kind === 'choice') {
        html += '<div class="chips">' + s.options.map(function (o) {
          return '<button class="chip" data-v="' + esc(o.v) + '">' +
                 esc(o.labelKey ? t(o.labelKey) : o.label) + '</button>';
        }).join('') + '</div>';
      } else {
        html += '<div class="input-row">' +
          '<input id="flow-input" ' + (s.kind === 'amount' ? 'inputmode="text" placeholder="৫০০ / পাঁচশো"' : '') +
          ' autocomplete="off">' +
          (Voice.supported() ? '<button id="mic-btn" class="mic">🎤</button>' : '') +
          '<button id="next-btn" class="primary">' + esc(t('next')) + '</button></div>' +
          '<div class="hint" id="flow-hint">' + esc(Voice.supported() ? t('mic_hint') : '') + '</div>';
      }
      html += '<div class="flow-actions">' +
        (s.optional ? '<button id="skip-btn" class="ghost">' + esc(t('skip')) + '</button>' : '') +
        '<button id="back-btn" class="ghost">' + esc(t('back')) + '</button></div>';
    } else {
      // summary + confirm
      html += '</div><div class="card summary"><div class="card-title">' + esc(t('confirm_title')) + '</div>' +
        '<div class="hint" style="margin:-4px 0 8px">' + esc(t('edit_hint')) + '</div>';
      steps.forEach(function (s, i) {
        if (!visible(s) || flowState.answers[s.key] === undefined) return;
        html += '<div class="sum-row" data-i="' + i + '"><span>' + esc(t(s.qKey)) + '</span>' +
                '<b>' + esc(answerDisplay(s, flowState.answers[s.key])) + '</b> ✏️</div>';
      });
      html += '</div><div class="flow-actions">' +
        '<button id="save-btn" class="primary big">' + esc(t('save')) + '</button>' +
        '<button id="cancel-btn" class="ghost">' + esc(t('cancel')) + '</button></div>';
    }
    html += '</div>';
    $view().innerHTML = html;

    // wire up
    document.querySelectorAll('.chip').forEach(function (c) {
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
          const s = flowState.def.steps[flowState.idx];
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
    if (skipB) skipB.onclick = function () { submitAnswer(flowState.def.steps[flowState.idx].kind === 'amount' ? null : ''); };
    const backB = document.getElementById('back-btn');
    if (backB) backB.onclick = goBack;
    document.querySelectorAll('.sum-row').forEach(function (r) {
      r.onclick = function () {
        const i = Number(r.dataset.i);
        flowState.editIdx = i; flowState.idx = i;
        delete flowState.answers[flowState.def.steps[i].key];
        renderEntry();
      };
    });
    const saveB = document.getElementById('save-btn');
    if (saveB) saveB.onclick = function () {
      saveB.disabled = true;
      flowState.def.save(flowState.answers).then(function (afterOpts) {
        toast(t('saved')); updateBadge(); autoSync();
        if (afterOpts) renderAfter(afterOpts); else navigate(flowState.def.returnTo || 'home');
      }).catch(function (e) {
        saveB.disabled = false;
        if (String(e && e.message) !== 'cancelled') toast(t('amount_zero'));
      });
    };
    const cancelB = document.getElementById('cancel-btn');
    if (cancelB) cancelB.onclick = function () { flowState = null; navigate('home'); };
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
    return DB.put('parties', party).then(function () {
      if (m.total > 0) {
        return DB.put('payments', DB.newRow({
          partyId: party.id, partyName: party.name, amount: m.total,
          cashAmount: m.cash, upiAmount: m.upi, date: todayISO(), note: '',
        }));
      }
    }).then(function () { return party; });
  }
  function newPartyFlow(type, presets, bulk) {
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
        return DB.getAll('parties').then(function (existing) {
          const nm = String(a.name || '').trim().toLowerCase();
          const dup = existing.some(function (p) { return String(p.name || '').trim().toLowerCase() === nm; });
          if (dup && !window.confirm(t('dup_party_warn'))) throw new Error('cancelled');
          return savePartyAndFirstPayment(type, a);
        }).then(function (party) {
          if (!bulk) return null;
          return { buttons: [
            { label: t('one_more_shop'), action: function () {
                startFlow(newPartyFlow('shop', { side: party.side }, true)); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] };
        });
      },
    };
  }
  function paymentFlow(party) {
    return {
      title: t('add_payment') + ' — ' + party.name,
      returnTo: 'list',
      steps: moneySteps(false).concat([
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ]),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        return DB.put('payments', DB.newRow({
          partyId: party.id, partyName: party.name, amount: m.total,
          cashAmount: m.cash, upiAmount: m.upi,
          date: todayISO(), note: a.note || '',
        })).then(function () { return null; });
      },
    };
  }
  function handoverFlow(cashierOpts) {
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
    return {
      title: t('handover_title'),
      steps: [toStep].concat(moneySteps(false), [
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ]),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        // when picked from the list, a.to is a username → resolve name + id;
        // when typed free (offline), a.to is a name with no id.
        const toId = byUser[a.to] !== undefined ? a.to : '';
        const toName = byUser[a.to] !== undefined ? byUser[a.to] : a.to;
        return DB.put('handovers', DB.newRow({
          from: Settings.get('collectorName'), fromId: Settings.get('collectorUsername') || '',
          to: toName, toId: toId,
          amount: m.total, cashAmount: m.cash, upiAmount: m.upi,
          date: todayISO(), note: a.note || '',
          status: 'pending', confirmedBy: '', confirmedAt: '',
        })).then(function () { return null; });
      },
    };
  }
  function startHandover() {
    if (navigator.onLine && Sync.configured()) {
      Auth.call('cashiers', { token: Auth.token() })
        .then(function (resp) { startFlow(handoverFlow(resp.cashiers || [])); })
        .catch(function () { startFlow(handoverFlow(null)); });
    } else startFlow(handoverFlow(null));
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
        return DB.put('daily', DB.newRow({
          type: type, busName: a.busName || '', busNumber: a.busNumber || '',
          amount: m.total, cashAmount: m.cash, upiAmount: m.upi,
          date: todayISO(), note: a.note || '',
        })).then(function () {
          return { buttons: [
            { label: '➕ ' + t('daily_' + type), action: function () { startFlow(dailyFlow(type)); } },
            { label: t('coll_expense'), action: function () { startFlow(collectionExpenseFlow(type)); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] };
        });
      },
    };
  }
  const OTHER_SUBJECT = '__other__';
  // Puja expense (cashier/admin): pick an admin-defined subject; multiple
  // cashiers may part-pay the same subject. "Other" forces a comment.
  function expenseFlow(subjects) {
    const opts = (subjects || []).map(function (s) { return { v: s.name, label: s.name }; });
    opts.push({ v: OTHER_SUBJECT, labelKey: 'subject_other' });
    return {
      title: t('expense'),
      steps: [
        { key: 'subject', qKey: 'q_subject', kind: 'choice', options: opts },
        { key: 'amount', qKey: 'q_amount', kind: 'amount' },
        { key: 'comment', qKey: 'q_comment_req', kind: 'text', required: true,
          showIf: function (a) { return a.subject === OTHER_SUBJECT; } },
        { key: 'comment', qKey: 'q_note', kind: 'text', optional: true,
          showIf: function (a) { return a.subject !== OTHER_SUBJECT; } },
      ],
      save: function (a) {
        if (!(Number(a.amount) > 0)) return Promise.reject(new Error('zero'));
        const isOther = a.subject === OTHER_SUBJECT;
        return DB.put('expenses', DB.newRow({
          subject: isOther ? 'Other' : a.subject, desc: a.comment || '',
          amount: a.amount, spentBy: Settings.get('collectorName'),
          source: 'general', collectionType: '', date: todayISO(),
        })).then(function () { return null; });
      },
    };
  }
  function startExpense() {
    const go = function (subjects) { startFlow(expenseFlow(subjects)); };
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
        { key: 'amount', qKey: 'q_amount', kind: 'amount' },
      ],
      save: function (a) {
        if (!(Number(a.amount) > 0)) return Promise.reject(new Error('zero'));
        return DB.put('expenses', DB.newRow({
          subject: '', desc: a.desc, amount: a.amount, spentBy: Settings.get('collectorName'),
          source: 'collection', collectionType: collectionType || '', date: todayISO(),
        })).then(function () { return null; });
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
      $view().innerHTML =
        '<div id="notif-banner"></div>' +
        '<div class="hero"><div>🙏 ' + esc(t('welcome_title')) + ' ' + Settings.get('year') + '</div>' +
        '<div class="hero-sub">' + esc(Settings.get('collectorName')) + ' • ' + esc(t('my_today')) + ': <b>' + fmtMoney(myToday) + '</b></div></div>' +
        '<div class="section">' + esc(t('new_entry')) + '</div>' +
        '<div class="grid">' +
          '<button class="tile" data-go="shop">🏪 ' + esc(t('new_shop')) + '</button>' +
          '<button class="tile" data-go="person">🙍 ' + esc(t('new_person')) + '</button>' +
          '<button class="tile" data-go="member">🤝 ' + esc(t('new_member')) + '</button>' +
          '<button class="tile" data-go="bulk">🏪🏪 ' + esc(t('bulk_shop')) + '</button>' +
        '</div>' +
        '<div class="section">' + esc(t('today_daily')) + '</div>' +
        '<div class="grid">' +
          '<button class="tile" data-go="road">🛣️ ' + esc(t('daily_road')) + '</button>' +
          '<button class="tile" data-go="toto">🛺 ' + esc(t('daily_toto')) + '</button>' +
          '<button class="tile" data-go="bus">🚌 ' + esc(t('daily_bus')) + '</button>' +
          // puja expenses are recorded by the cashier/admin (who holds the money)
          (Auth.isCashier() ? '<button class="tile" data-go="expense">🧾 ' + esc(t('expense')) + '</button>' : '') +
        '</div>' +
        '<div class="grid one"><button class="tile wide" data-go="list">💰 ' + esc(t('add_payment')) +
        ' / ' + esc(t('dues_only')) + '</button></div>' +
        '<div class="grid" style="margin-top:10px">' +
          '<button class="tile" data-go="handover">' + esc(t('handover')) + '</button>' +
          (Auth.isCashier()
            ? '<button class="tile" data-go="cashier">' + esc(t('confirm_handover')) + '</button>' +
              '<button class="tile" data-go="review">🛠️ ' + esc(t('review_title')) + '</button>' : '') +
        '</div>' +
        '<div class="grid one" style="margin-top:10px"><button class="tile wide" data-go="entries">✏️ ' +
          esc(t('my_entries_title')) + '</button></div>';
      // refresh the areas/locations cache (≤1.5s), then run — so an admin's
      // just-added area shows the moment a collector opens a new-entry form.
      const freshThen = function (fn) {
        Promise.race([Lists.refresh(), new Promise(function (r) { setTimeout(r, 1500); })]).then(fn);
      };
      document.querySelectorAll('[data-go]').forEach(function (b) {
        b.onclick = function () {
          const g = b.dataset.go;
          if (g === 'shop' || g === 'person' || g === 'member') freshThen(function () { startFlow(newPartyFlow(g)); });
          else if (g === 'bulk') freshThen(function () { startFlow(newPartyFlow('shop', {}, true)); });
          else if (g === 'road' || g === 'toto' || g === 'bus') startFlow(dailyFlow(g));
          else if (g === 'expense') startExpense();
          else if (g === 'handover') startHandover();
          else navigate(g);
        };
      });
      renderNotifBanner();   // show cached counts immediately
      checkNotifications();  // then refresh from server
    });
  }

  let listFilter = 'all', listQuery = '';
  let findParties = [], findQuery = '';
  function renderList() {
    // reads the central snapshot (+ own rows) locally — instant, all-collector
    viewData().then(function (data) {
      drawList(data, Aggregate.computeTotals(data).paidByParty);
    });
  }
  function drawList(data, paidBy) {
      let rows = data.parties.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
      if (listFilter === 'due') {
        rows = rows.filter(function (p) { return (Number(p.pledged) || 0) - (paidBy[p.id] || 0) > 0; });
      } else if (listFilter !== 'all') {
        rows = rows.filter(function (p) { return p.type === listFilter; });
      }
      if (listQuery) {
        const q = listQuery.toLowerCase();
        rows = rows.filter(function (p) {
          return (p.name || '').toLowerCase().includes(q) || (p.owner || '').toLowerCase().includes(q);
        });
      }
      const tabs = [['all', t('all')], ['shop', t('type_shop')], ['person', t('type_person')],
                    ['member', t('type_member')], ['due', t('dues_only')]];
      $view().innerHTML =
        '<button id="find-party" class="ghost big block">🔍 ' + esc(t('find_party_btn')) + '</button>' +
        '<input id="search" class="search" placeholder="' + esc(t('search')) + '" value="' + esc(listQuery) + '">' +
        '<div class="chips tabs">' + tabs.map(function (tb) {
          return '<button class="chip' + (listFilter === tb[0] ? ' on' : '') + '" data-f="' + tb[0] + '">' + esc(tb[1]) + '</button>';
        }).join('') + '</div>' +
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
        }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>');
      document.getElementById('find-party').onclick = function () { findQuery = ''; navigate('findparty'); };
      document.getElementById('search').oninput = function (e) { listQuery = e.target.value; renderList(); };
      document.querySelectorAll('[data-f]').forEach(function (c) {
        c.onclick = function () { listFilter = c.dataset.f; renderList(); };
      });
      document.querySelectorAll('.row[data-id]').forEach(function (r) {
        r.onclick = function () { navigate('party', { id: r.dataset.id }); };
      });
  }
  // Find ANY party (created by any collector) and add a payment against its
  // balance — so a collector who receives a later installment can record it
  // even though they didn't create the party.
  function renderFindParty() {
    $view().innerHTML = backBar('list') + '<div class="flow-title">' + esc(t('find_party_title')) + '</div>' +
      '<div class="hint" style="margin-bottom:8px">' + esc(t('find_party_hint')) + '</div>' +
      '<input id="fp-search" class="search" placeholder="' + esc(t('search')) + '" value="' + esc(findQuery) + '">' +
      '<div id="fp-results"><div class="empty">' + esc(t('loading')) + '</div></div>';
    document.getElementById('fp-search').oninput = function (e) { findQuery = e.target.value; renderFPResults(); };
    refreshFindParty();
  }
  // Reloads the party data + results only, WITHOUT rebuilding the shell — so a
  // background pull can refresh the list in place without stealing input focus
  // or flashing the "loading" placeholder (which looked like blinking).
  function refreshFindParty() {
    return viewData().then(function (data) {              // local central snapshot — instant
      const paidBy = Aggregate.computeTotals(data).paidByParty;
      findParties = data.parties.map(function (p) {
        return { id: p.id, name: p.name, type: p.type, side: p.side, owner: p.owner,
                 collector: p.collector, pledged: Number(p.pledged) || 0, paid: paidBy[p.id] || 0 };
      });
      renderFPResults();
    });
  }
  function renderFPResults() {
    const el = document.getElementById('fp-results'); if (!el) return;
    const q = (findQuery || '').toLowerCase();
    const rows = findParties.filter(function (p) {
      return !q || (p.name || '').toLowerCase().includes(q) || (p.owner || '').toLowerCase().includes(q);
    }).sort(function (a, b) { return ((b.pledged - b.paid) || 0) - ((a.pledged - a.paid) || 0); });
    el.innerHTML = rows.length ? rows.map(function (p) {
      const due = (p.pledged || 0) - (p.paid || 0);
      return '<div class="row" data-fp="' + esc(p.id) + '"><div><b>' + esc(p.name) + '</b><div class="row-sub">' +
        esc(t('type_' + p.type)) + (p.side ? ' • ' + esc(Lists.labelOf('area', p.side)) : '') +
        (p.collector ? ' • ' + esc(p.collector) : '') + '</div></div>' +
        '<div class="row-right">' + fmtMoney(p.paid) + '/' + fmtMoney(p.pledged) +
        (due > 0 ? '<span class="due-chip">' + esc(t('due')) + ' ' + fmtMoney(due) + '</span>'
                 : '<span class="ok-chip">✅</span>') + '</div></div>';
    }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>';
    el.querySelectorAll('[data-fp]').forEach(function (r) {
      r.onclick = function () {
        const p = findParties.find(function (x) { return x.id === r.dataset.fp; });
        if (p) startFlow(paymentFlow(p));
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
    document.getElementById('pay-btn').onclick = function () { startFlow(paymentFlow(p)); };
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
  // admin-configured receipt design (falls back to sensible defaults)
  function receiptConfig() {
    const c = centralConfig || {};
    return {
      layout: c.receipt_layout || 'classic',
      committee: c.committee_name || t('app_title'),
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
        g.fillText('ॐ  শ্রীশ্রীসিদ্ধিদাতা গণেশায় নমঃ', W / 2, 66);
        drawLogo(W / 2 - 30, 78, 60);
        g.fillStyle = accent; g.font = 'bold 34px sans-serif';
        g.fillText(cfg.committee, W / 2, 176);
        g.fillStyle = muted; g.font = '18px sans-serif';
        g.fillText('গণেশ পূজা ' + year + '  ·  প্রাপ্তি রসিদ', W / 2, 204);
        // divider
        g.strokeStyle = '#e6ddcf'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(60, 224); g.lineTo(W - 60, 224); g.stroke();
        g.textAlign = 'left';
        // ---- serial (red, right) ----
        g.textAlign = 'right'; g.fillStyle = '#c0201a'; g.font = 'bold 20px sans-serif';
        g.fillText('নং  ' + (rc.receiptNo || '—'), W - 60, 258);
        g.textAlign = 'left';
        // ---- body: prose acknowledgement ----
        let y = 292; const lx = 62, maxW = W - 124;
        g.fillStyle = ink; g.font = '22px sans-serif';
        y = wrap(rc.donorLine + '  এর নিকট হইতে শ্রীশ্রীগণেশ পূজার চাঁদা বাবদ —', lx, y, maxW, 34);
        y += 12;
        g.fillStyle = accent; g.font = 'bold 30px sans-serif';
        g.fillText('৳ ' + Number(rc.amount).toLocaleString('en-IN') + '/-', lx, y);
        g.fillStyle = ink; g.font = 'italic 21px sans-serif';
        g.fillText('(' + banglaNumWords(rc.amount) + ' টাকা মাত্র)', lx + 150, y); y += 40;
        g.fillStyle = ink; g.font = '22px sans-serif';
        g.fillText('সাদরে গৃহীত হইল।' + (rc.cashUpi ? '   ' + rc.cashUpi : ''), lx, y); y += 44;
        // totals strip (party payments only — a bus/one-off has no pledge)
        if (rc.showTotals) {
          g.fillStyle = muted; g.font = '18px sans-serif';
          g.fillText('প্রতিশ্রুত ' + fmtMoney(rc.pledged) + '    ·    মোট জমা ' + fmtMoney(rc.paidTotal) + '    ·    বাকি ' + fmtMoney(rc.due), lx, y);
        }
        // ---- date + signature ----
        const sy = H - 92;
        g.fillStyle = ink; g.font = '18px sans-serif';
        g.fillText('তারিখ: ' + fmtDate(rc.date), lx, sy);
        g.strokeStyle = '#bdb3a5'; g.lineWidth = 1; g.beginPath(); g.moveTo(W - 280, sy - 4); g.lineTo(W - 62, sy - 4); g.stroke();
        g.textAlign = 'right'; g.fillStyle = muted; g.font = '16px sans-serif';
        g.fillText('আদায়কারী — ' + (rc.collector || ''), W - 62, sy + 20);
        g.textAlign = 'left';
        // ---- footer ----
        g.textAlign = 'center'; g.fillStyle = accent; g.font = 'italic 20px serif';
        g.fillText(cfg.footer, W / 2, H - 44);
        g.textAlign = 'left';
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
      date: pay.date || pay.createdAt, amount: pay.amount, cashUpi: cashUpiNote(pay),
      paidTotal: paidTotal, pledged: p.pledged, due: due, collector: pay.collector || '',
      receiptNo: pay.receiptNo || '' };
  }
  // Receipt for a daily bus collection (name + number, one-off → no totals).
  function rcFromDailyBus(d) {
    return { donorLine: (d.busName || t('type_bus')) + (d.busNumber ? ' (নং ' + d.busNumber + ')' : ''),
      showTotals: false, date: d.date || d.createdAt, amount: d.amount, cashUpi: cashUpiNote(d),
      collector: d.collector || '', receiptNo: d.receiptNo || '' };
  }
  // 📷 image receipt → Web Share (WhatsApp etc.); download fallback offline.
  function shareReceiptImage(rc) {
    buildReceiptCanvas(rc).then(canvasToBlob).then(function (blob) {
      const file = new File([blob], 'receipt.png', { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        navigator.share({ files: [file], title: t('receipt_title'), text: rc.donorName }).catch(function () {});
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
    const cfg = receiptConfig();
    const lines = [cfg.committee + ' — ' + t('receipt_title'),
      rc.donorLine,
      t('receipt_amount') + ': ৳' + Number(rc.amount).toLocaleString('en-IN') + '/- (' + banglaNumWords(rc.amount) + ' টাকা মাত্র)',
      (rc.showTotals ? t('paid') + ': ' + fmtMoney(rc.paidTotal) + '/' + fmtMoney(rc.pledged) + '  ' + t('due') + ': ' + fmtMoney(rc.due) : ''),
      (rc.receiptNo ? t('receipt_no') + ' ' + rc.receiptNo : ''),
      cfg.footer].filter(Boolean).join('\n');
    const digits = String(phone || '').replace(/\D/g, '');
    const num = digits ? (digits.length === 10 ? '+91' + digits : '+' + digits.replace(/^0/, '')) : '';
    // `?body=` works on Android; iOS is lenient with it too
    window.open('sms:' + num + '?body=' + encodeURIComponent(lines), '_blank');
  }
  // Receipt screen for a party payment ({partyId, payId}) OR a daily bus entry
  // ({store:'daily', id}). Ensures the server serial (syncs first if needed).
  function renderReceiptShare(params) {
    const isBus = params.store === 'daily';
    const backView = isBus ? 'entries' : 'party', backParams = isBus ? undefined : { id: params.partyId };
    $view().innerHTML = backBar(backView, backParams) + '<div class="empty">' + esc(t('loading')) + '</div>';
    viewData().then(function (data) {
      let rc, phone = '', store, id;
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
      }
      const paint = function () {
        $view().innerHTML = backBar(backView, backParams) + '<div class="flow-title">' + esc(t('receipt_title')) + '</div>' +
          '<img id="rcp-img" alt="" style="width:100%;max-width:420px;display:block;margin:0 auto 12px;border:1px solid #eee;border-radius:10px">' +
          (rc.receiptNo ? '' : '<div class="hint" style="text-align:center">' + esc(t('receipt_no_pending')) + '</div>') +
          '<button id="rcp-wa" class="primary big block">📷 ' + esc(t('receipt_send_img')) + '</button>' +
          '<button id="rcp-sms" class="ghost big block">💬 ' + esc(t('receipt_send_sms')) + '</button>';
        buildReceiptCanvas(rc).then(function (cv) { const im = document.getElementById('rcp-img'); if (im) im.src = cv.toDataURL('image/png'); });
        document.getElementById('rcp-wa').onclick = function () { shareReceiptImage(rc); };
        document.getElementById('rcp-sms').onclick = function () { shareReceiptText(rc, phone); };
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
    if (u.cashier === 1) return (entry.collectorRole || 'collector') === 'collector';
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
          : isFlag ? ' • <span class="void-tag">⚠️ ' + esc(t('flag_pending')) + '</span>' : '';
        const busReceipt = (!isVoid && it.store === 'daily' && r.type === 'bus')
          ? '<button class="chip" data-drcp="' + esc(r.id) + '">🧾</button>' : '';
        const action = busReceipt + ((isVoid || isFlag) ? '' :
          (canVoid(r) ? '<button class="chip void-btn" data-vd="' + it.store + '|' + esc(r.id) + '">' + esc(t('void_btn')) + '</button>'
                      : '<button class="chip void-btn" data-fl="' + it.store + '|' + esc(r.id) + '">' + esc(t('flag_btn')) + '</button>'));
        return '<div class="row' + (isVoid ? ' voided' : '') + '" style="cursor:default"><div style="flex:1 1 60%"><b>' +
          esc(entrySummary(it.store, r)) + '</b><div class="row-sub">' + esc(fmtDate(r.date || r.createdAt)) + who + tag + '</div></div>' +
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
      document.querySelectorAll('[data-drcp]').forEach(function (b) {
        b.onclick = function () { navigate('receipt', { store: 'daily', id: b.dataset.drcp }); };
      });
    });
  }
  // Cashier/admin: review collectors' correction flags → approve (void) / reject.
  function renderReviewCorrections() {
    if (!Auth.isCashier()) { $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('not_cashier')) + '</div>'; return; }
    $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('loading')) + '</div>';
    Auth.call('pendingCorrections', { token: Auth.token(), year: Settings.get('year') }).then(function (resp) {
      const list = resp.corrections || [];
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
          '</div><div class="row-right"><span class="' + (r.inHand > 0 ? 'red' : 'green') + '"><b>' +
          fmtMoney(r.inHand) + '</b></span><div class="row-sub">' + esc(t('inhand_col')) + '</div></div></div>';
      }).join('') + '</div>';
  }
  function mySummaryHTML(d, deviceOnly) {
    const hasDaily = d.dailyByType && (d.dailyByType.road || d.dailyByType.toto || d.dailyByType.bus);
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
      (hasDaily ? '<div class="stat3">' +
        '<div><span>' + esc(t('type_road')) + '</span><b>' + fmtMoney(d.dailyByType.road) + '</b></div>' +
        '<div><span>' + esc(t('type_toto')) + '</span><b>' + fmtMoney(d.dailyByType.toto) + '</b></div>' +
        '<div><span>' + esc(t('type_bus')) + '</span><b>' + fmtMoney(d.dailyByType.bus) + '</b></div></div>' : '') +
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
        return '<div class="row" style="cursor:default"><div><b>' + esc(r.collector) + '</b></div><b>' +
          fmtMoney(r.total) + '</b></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  function reportExpensesHTML(d) {
    const rows = d.rows || [], bySubject = d.bySubject || [];
    return '<div class="card"><div class="card-title">' + esc(t('report_expenses')) +
      ' — ' + esc(t('total_expense')) + ': ' + fmtMoney(d.total) + '</div>' +
      (bySubject.length ? '<div class="row-sub" style="margin-bottom:6px">' + esc(t('by_subject')) + '</div>' +
        bySubject.map(function (s) {
          return '<div class="row" style="cursor:default"><div><b>' + esc(s.subject) + '</b>' +
            '<div class="row-sub">' + s.count + ' ' + esc(t('entries')) + '</div></div><b>' + fmtMoney(s.total) + '</b></div>';
        }).join('') : '') + '</div>' +
      '<div class="card"><div class="card-title">' + esc(t('entries')) + '</div>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="row" style="cursor:default"><div><b>' + esc(r.subject || '—') + '</b>' +
          (r.desc ? ' <span class="row-sub">— ' + esc(r.desc) + '</span>' : '') +
          '<div class="row-sub">' + esc(fmtDate(r.date)) + (r.spentBy ? ' • ' + esc(r.spentBy) : '') +
          (r.source === 'collection' ? ' • ' + esc(t('coll_expense')) : '') + '</div></div>' +
          '<b>' + fmtMoney(r.amount) + '</b></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  function reportDailyHTML(d) {
    const rows = d.rows || [], bt = d.byType || { road: 0, toto: 0, bus: 0 };
    return '<div class="card"><div class="card-title">' + esc(t('report_daily')) + '</div>' +
      '<div class="stat3"><div><span>' + esc(t('type_road')) + '</span><b>' + fmtMoney(bt.road) + '</b></div>' +
      '<div><span>' + esc(t('type_toto')) + '</span><b>' + fmtMoney(bt.toto) + '</b></div>' +
      '<div><span>' + esc(t('type_bus')) + '</span><b>' + fmtMoney(bt.bus) + '</b></div></div>' +
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
          (withBtn ? '<div style="flex-basis:100%;margin-top:8px"><button class="primary" data-hid="' +
            esc(h.id) + '">' + esc(t('confirm_receive')) + '</button></div>' : '') + '</div>';
      }
      $view().innerHTML = backBar('home') + '<div class="flow-title">' + esc(t('confirm_handover')) + '</div>' +
        '<div class="section">' + esc(t('pending_handovers')) + ' (' + pending.length + ')</div>' +
        (pending.length ? pending.map(function (h) { return card(h, true); }).join('')
                        : '<div class="empty">' + esc(t('none_here')) + '</div>') +
        '<div class="section">' + esc(t('confirmed_handovers')) + '</div>' +
        (done.length ? done.map(function (h) { return card(h, false); }).join('')
                     : '<div class="empty">' + esc(t('none_here')) + '</div>');
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
    $view().innerHTML = '<div id="my-summary"><div class="empty">' + esc(t('loading')) + '</div></div>' +
      '<div class="section">' + esc(t('central_reports')) + '</div>' +
      '<div id="report-picker"></div>' +
      '<div id="report-body"></div>';
    loadMySummary();
    showReportButtons(myReports());   // permission list is local — no round-trip
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
      try { body.innerHTML = reportHTML(id, Aggregate.computeReport(id, data)); }
      catch (e) { body.innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>'; }
    });
  }

  function renderSettings() {
    const user = Auth.current() || { name: '?', username: '?' };
    // scriptUrl is a backend override for testing — admins only, so a
    // collector can't accidentally edit it and break their own sync.
    const fields = [['year', 'year', 'number']];
    if (Auth.isAdmin()) fields.push(['scriptUrl', 'script_url', 'text']);
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
      '<button id="import-btn" class="ghost big block">' + esc(t('import_backup')) + '</button>' +
      '<input type="file" id="import-file" accept=".json" hidden>' +
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
    document.getElementById('import-btn').onclick = function () { fileEl.click(); };
    fileEl.onchange = function () {
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
        if (!window.confirm(t('import_confirm') + '\n\n' + counts.join(', '))) return;
        Promise.all(Object.keys(clean).map(function (s) { return DB.bulkPut(s, clean[s]); }))
          .then(function () { toast(t('saved')); updateBadge(); render(); })
          .catch(function () { toast(t('fetch_fail')); });
      }).catch(function () { toast(t('import_bad')); fileEl.value = ''; });
    };
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
      '<h2>' + esc(t('welcome_title')) + '</h2>' + langChips() +
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
      'password:reset': { bn: '🔑 পাসওয়ার্ড রিসেট', en: '🔑 Password reset' },
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
      committee_name: centralConfig.committee_name || '',
      receipt_footer: centralConfig.receipt_footer || '',
      receipt_color: centralConfig.receipt_color || '#c0392b',
      committee_logo: centralConfig.committee_logo || '',
    };
    const layouts = [['classic', t('rl_classic')], ['festive', t('rl_festive')], ['minimal', t('rl_minimal')]];
    const colors = ['#c0392b', '#7b1113', '#1e7d3a', '#2a4d9b', '#8a5a00'];
    const sampleRC = { donorName: 'কমল স্টোর্স', donorSub: t('type_shop'), date: todayISO(),
      amount: 500, cashUpi: '', paidTotal: 500, pledged: 1000, due: 500,
      collector: Settings.get('collectorName') || 'Ram', receiptNo: (Settings.get('year') || '2026') + '-0001' };
    function drawPreview() {
      buildReceiptCanvas(sampleRC, {
        layout: form.receipt_layout, committee: form.committee_name || t('app_title'),
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
        '<div class="field"><label>' + esc(t('rc_committee')) + '</label><input id="rc-name" value="' + esc(form.committee_name) + '" placeholder="' + esc(t('app_title')) + '"></div>' +
        '<div class="field"><label>' + esc(t('rc_footer')) + '</label><input id="rc-footer" value="' + esc(form.receipt_footer) + '" placeholder="' + esc(t('receipt_thanks')) + '"></div>' +
        '<div class="field"><label>' + esc(t('rc_color')) + '</label><div class="chips">' +
          colors.map(function (c) { return '<button class="chip' + (form.receipt_color === c ? ' on' : '') + '" data-rcol="' + c + '" style="background:' + c + ';color:#fff">●</button>'; }).join('') + '</div></div>' +
        '<div class="field"><label>' + esc(t('rc_logo')) + '</label>' +
          '<input type="file" id="rc-logo" accept="image/png,image/jpeg">' +
          (form.committee_logo ? ' <button class="chip" id="rc-logo-rm">' + esc(t('rc_logo_remove')) + '</button>' : '') +
          '<div class="hint">' + esc(t('rc_logo_hint')) + '</div></div>' +
        '</div>' +
        '<button id="rc-save" class="primary big block">' + esc(t('save')) + '</button>';
      drawPreview();
      document.querySelectorAll('[data-rl]').forEach(function (b) { b.onclick = function () { form.receipt_layout = b.dataset.rl; paint(); }; });
      document.querySelectorAll('[data-rcol]').forEach(function (b) { b.onclick = function () { form.receipt_color = b.dataset.rcol; paint(); }; });
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
                  (u.role === 'admin' ? '' : '<button class="chip" data-act="block" data-id="' + u.id + '">' + esc(t('block')) + '</button>');
        } else {
          btns = '<button class="chip" data-act="unblock" data-id="' + u.id + '">' + esc(t('unblock')) + '</button>';
        }
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 100%"><b>' + esc(u.name) + '</b>' +
          (u.role === 'admin' ? ' 👑' : '') + (u.cashier ? ' 💰' : '') +
          '<div class="row-sub">@' + esc(u.username) + (u.phone ? ' • 📞 ' + esc(u.phone) : '') +
          ' • ' + esc(u.years || '—') + '</div></div>' +
          '<div class="chips" style="margin:8px 0 0">' + btns + '</div>' + reportChips(u) + areaChips(u) + '</div>';
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
        return '<div class="row-sub" style="flex-basis:100%;margin-top:10px">' + esc(t('assign_areas')) + '</div>' +
          '<div class="chips" style="margin:4px 0 0">' + chips + '</div>';
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
        return '<div class="row-sub" style="flex-basis:100%;margin-top:10px">' + esc(t('report_perms')) +
          ' ' + esc(u.cashier ? t('inhand_auto_cashier') : '') + '</div>' +
          '<div class="chips" style="margin:4px 0 0">' + chips + '</div>';
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
      $view().innerHTML = backBar('settings') + '<div class="flow-title">' + esc(t('admin_panel')) + '</div>' +
        '<button id="adm-refresh" class="ghost block">' + esc(t('refresh')) + '</button>' +
        '<button id="audit-btn" class="ghost block">' + esc(t('audit_btn')) + '</button>' +
        '<button id="receipt-btn" class="ghost block">' + esc(t('receipt_design_btn')) + '</button>' +
        '<button id="rollover-btn" class="ghost block">' + esc(t('rollover_btn')) + '</button>' +
        subjectsCard +
        listMgmtCard('area', 'manage_areas', areas) +
        listMgmtCard('location', 'manage_locations', locations) +
        section('pending_users', groups.pending) +
        section('approved_users', groups.approved) +
        section('blocked_users', groups.blocked);
      document.getElementById('adm-refresh').onclick = renderAdmin;
      document.getElementById('audit-btn').onclick = function () { navigate('audit'); };
      document.getElementById('receipt-btn').onclick = function () { navigate('receiptcfg'); };
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
    document.getElementById('app-title').textContent = '🙏 ' + t('app_title');
    document.querySelectorAll('#bottomnav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.nav === current.view);
      b.querySelector('span').textContent = t(b.dataset.nav === 'list' ? 'khata' : b.dataset.nav);
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
