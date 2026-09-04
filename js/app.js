// UI: view router + guided chat-style entry engine + dashboards.
(function () {
  const $view = function () { return document.getElementById('view'); };
  // The version of the JS actually executing — NOT the cache name, which a new
  // worker updates while this tab keeps running the code it loaded minutes ago
  // (A31). Defined once, in js/auth.js: that is the single door every server
  // call passes through and it loads first, so there is no load-order question
  // about who owns the constant.
  const APP_VERSION = Auth.APP_VERSION;
  const REPORT_IDS = ['overview', 'dues', 'inhand', 'collectors', 'areas', 'expenses', 'daily'];
  let flowState = null;
  // set when the user taps 🔄 আপডেট খুঁজি — a reload they asked for is never
  // capped, only the ones that happen behind their back (A31)
  let userReload = false;

  // offline fallback; the server's reportList is the authority when online
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // A64 (audit 2.13): 2.2 s regardless of length. That is fine for "সেভ হলো"
  // and far too short for a sentence explaining why a save failed — the one a
  // collector most needs to finish reading. Bengali conjuncts are slower to
  // read than Latin at the same character count, and this is read outdoors
  // with a donor waiting, so the allowance is generous: ~45 ms a character on
  // top of the base, capped at 8 s so a toast can never become a wall.
  function toastMs(msg) {
    return Math.min(8000, 2200 + String(msg || '').length * 45);
  }
  function toast(msg) {
    const el = document.createElement('div');
    el.className = 'toast'; el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(function () { el.classList.add('show'); }, 10);
    setTimeout(function () { el.classList.remove('show'); setTimeout(function () { el.remove(); }, 300); }, toastMs(msg));
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
  // A138: the rule now lives in aggregate.js as dayOf — display and every
  // date COMPARISON must agree about which day a row belongs to, and they did
  // not: this function always knew about the Sheet's round-trip while the
  // comparison sites still tested the raw string.
  function fmtDate(v) { return Aggregate.dayOf(v); }
  // Indian mobile: strip spaces/dashes/brackets and an optional +91 / 91 / 0
  // prefix, leaving the 10-digit national number.
  // A80: the rule itself now lives in aggregate.js, so the 🩺 desk and this
  // form cannot disagree about which two donors are the same person. The name
  // stays because ten call sites use it.
  function cleanPhoneIN(s) { return Aggregate.normPhone(s); }
  // A62 (audit 2.15): the digits WhatsApp and SMS can actually dial.
  //
  // Three hand-rolled copies of this existed and ALL THREE were wrong for a
  // number written the way people write it down — 09876543210:
  //   dues reminder  → wa.me/09876543210   (no leading-0 strip at all: dead)
  //   admin contact  → wa.me/9876543210    (0 stripped, country code lost)
  //   SMS receipt    → +9876543210         (same, with a + in front of it)
  // Each broke differently, which is why nobody spotted a pattern — and the
  // dues reminder is the one a collector taps most, standing in front of a
  // donor who owes money.
  //
  // cleanPhoneIN already knew all of this (it strips spaces, dashes, a leading
  // +91 and a leading 0). Built on it, so there is now one thing to be right.
  // Empty for anything that is not a valid 10-digit Indian mobile: a link that
  // cannot work must not be offered, which is the whole lesson of this audit.
  function waNumber(s) {
    const n = cleanPhoneIN(s);
    return /^\d{10}$/.test(n) ? '91' + n : '';
  }
  // null if a valid 10-digit Indian mobile, else an error key.
  // Deliberately loose: an address the app never sends to only has to LOOK
  // like one. A strict RFC pattern here would reject real addresses and buy
  // nothing, since nothing downstream consumes it.
  function emailErr(v) {
    const s = String(v || '').trim();
    return (!s || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) ? null : 'err_email';
  }
  function phoneErrIN(s) {
    return /^\d{10}$/.test(cleanPhoneIN(s)) ? null : 'err_phone_in';
  }
  // IST day + time "YYYY-MM-DD HH:MM" for the audit log (when matters there)
  // A47: "৩ মিনিট আগে" reads as recency; a timestamp reads as a fact you have
  // to do arithmetic on. Anything past a day falls back to the date, because
  // "৯ দিন আগে" is worse than the date itself.
  function agoText(v) {
    const then = new Date(v).getTime();
    if (!then) return '';
    const mins = Math.floor((Date.now() - then) / 60000);
    if (mins < 1) return t('ago_now');
    if (mins < 60) return t('ago_min').replace('{n}', mins);
    if (mins < 1440) return t('ago_hr').replace('{n}', Math.floor(mins / 60));
    return fmtDate(v);
  }
  function fmtDateTime(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const s = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString();
    return s.slice(0, 10) + ' ' + s.slice(11, 16);
  }
  // A83: the date as a person reads it, for the ONE document that leaves the
  // app. `2026-08-12 01:56` is a machine's date; a donor holding a paper-shaped
  // receipt reads "১২ অগস্ট ২০২৬". The time stays — it is what settles "I paid
  // you that morning" — but it goes second, small, after the day.
  //
  // Screens keep fmtDateTime: sortable and dense is right for a list you scan,
  // and wrong for a receipt somebody keeps.
  const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
                     'জুলাই', 'অগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
  function fmtDateLong(v) {
    if (!v) return '';
    const d = new Date(v);
    if (isNaN(d.getTime())) return String(v);
    const s = new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString();
    const day = Number(s.slice(8, 10)), mon = Number(s.slice(5, 7)) - 1, yr = s.slice(0, 4);
    // Bengali always, and NOT because the app is Bengali-first — because the
    // receipt is. Every other word on it is hardcoded Bengali ('সাদরে গৃহীত হইল',
    // 'প্রতিশ্রুত'), so following the language toggle here produced
    // "12 Aug 2026, ০৭:২৬" — half of one language and half of the other on the
    // one page a stranger reads. Written first that way, caught by running it.
    return toBengaliDigits(String(day)) + ' ' + BN_MONTHS[mon] + ' ' + toBengaliDigits(yr) +
           ', ' + toBengaliDigits(s.slice(11, 16));
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
    // A54 (audit 1.4): a REFUSED row is not "synced". The badge used to skip
    // them entirely and go green — "সব sync হয়ে গেছে ✅" — while a donor walked
    // away holding a numbered receipt for money that is in nobody's book, and
    // reconcile could not contradict it because the row is not there. Refusal
    // gets its own red state, ahead of the pending count: nothing to retry, but
    // very much something to do.
    Promise.all([DB.unsyncedCount(), DB.rejectedCount()]).then(function (r) {
      const n = r[0], bad = r[1];
      unsyncedN = n;
      const b = document.getElementById('sync-badge');
      if (!b) return;
      if (bad) {
        b.textContent = '🚫 ' + bad;
        b.className = 'badge rejected';
        b.title = t('rejected_n').replace('{n}', bad);
        return;
      }
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
        if (r.ok && r.sent) { toast('☁️ Sync: ' + r.sent); pullCentral({ force: true }); } // refresh the snapshot after a push
        updateBadge();
        if (r.reason === 'busy') autoSync(); // a sync was in flight — retry the tail
      });
    }, 1000);
  }

  // ---------- pull-down: one central snapshot, render every screen local ----------
  let centralData = null, centralCursor = '', centralYear = '';
  // Bumped wherever centralData is replaced or merged — viewData memoises on
  // it. Every assignment below goes through setCentral()/mergeDelta() so this
  // can never drift; a missed bump would show a stale screen after a pull.
  let centralVersion = 0;
  function setCentral(v) { centralData = v; centralVersion++; }
  let centralConfig = {}; // receipt-design config (committee name/logo/footer/colour/layout)
  try { centralConfig = JSON.parse(localStorage.getItem('ck_config') || '{}') || {}; } catch (e) { centralConfig = {}; }
  try { setCentral(JSON.parse(localStorage.getItem('ck_central') || 'null')); } catch (e) { setCentral(null); }
  try { centralCursor = localStorage.getItem('ck_central_cursor') || ''; } catch (e) { centralCursor = ''; }
  try { centralYear = localStorage.getItem('ck_central_year') || ''; } catch (e) { centralYear = ''; }
  // A115: the committee roster (username → name, post, status), refreshed on
  // every pull. A member's post is NOT stored on the member row any more — it
  // lives on their app account, and this is how the register and 🤝 সদস্যের
  // চাঁদা read it, online or off. Cached so a phone with no signal still shows
  // who is কোষাধ্যক্ষ instead of a blank where the post used to be.
  let committee = [];
  try { committee = JSON.parse(localStorage.getItem('ck_committee') || '[]') || []; } catch (e) { committee = []; }
  function memberUser(username) {
    const u = String(username || '').toLowerCase();
    if (!u) return null;
    return committee.filter(function (x) { return String(x.username).toLowerCase() === u; })[0] || null;
  }
  // The post a committee member holds, read from their account. One place.
  function memberPost(m) {
    const u = memberUser(m && m.appUser);
    return u ? String(u.position || '') : '';
  }
  // A115: what reconcile needs to know that it cannot work out from the ledger.
  // ONE builder for all three callers (🏠 dot, the cashier banner, 🩺) — three
  // copies of this object is how two of them end up right and one wrong, which
  // is the shape of half the bugs in this file's history.
  //
  // The holders come from the roster because a post lives on the app account
  // now. An empty roster hands back nothing, and reconcile then SKIPS the post
  // check rather than reporting everyone as un-posted — a detector that cannot
  // see its subject must say nothing, not guess.
  function reconcileRules() {
    const holders = {};
    committee.forEach(function (x) {
      if (!x.position) return;
      (holders[x.position] || (holders[x.position] = [])).push(x.name || x.username);
    });
    // A155: does this phone hold the WHOLE book? A reader who has been given a
    // partial one must not be shown "somebody is short" — see reconcile.
    return { positionMax: Lists.maxMap(), positionHolders: holders, partialBook: partialBook() };
  }
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
    if (changed) centralVersion++; // in-place merge still invalidates the memo
    return { changed: changed, chatOnly: changed && chatOnly };
  }
  // A69 (audit #2 P3): pullCentral had no in-flight guard, unlike Sync.syncNow
  // which has always had one. FOUR things call it — the 60 s timer, window
  // focus, the notification poll, and autoSync after a push.
  //
  // The field case: the link degrades to 70 s latency but navigator.onLine
  // still says true (it reports link state, not reachability). Every 60 s a new
  // pull starts on top of the last one that has not returned. Ten minutes in
  // there are ten open requests, each holding the radio awake, all racing to
  // write centralData, and nothing backs off for the rest of the evening.
  //
  // The backoff is counted in POLLS, not milliseconds, so it cannot outlive the
  // situation: it is reset the moment the phone reports 'online', on focus, and
  // on a manual pull-to-refresh — all three are a human or the OS saying
  // "conditions changed", which is better evidence than a timer.
  let pullBusy = false, pullSkip = 0, pullFails = 0;
  // A117: a forced pull that arrives while another pull is in flight. The old
  // line was `if (pullBusy) return` — one line above a comment insisting "a
  // forced pull ALWAYS runs". On the live server a poll takes 1-3s, so the
  // window was open on every tap: the desk stamped an answer, removed the
  // card, sent a forced pull for the fresh snapshot — and that pull was
  // silently dropped while the IN-FLIGHT poll came back with pre-stamp data
  // and re-drew the card the cashier had just answered. Hrishi, from the live
  // trial: "after approving the anomaly entries the entry is remained in
  // screen". The flag queues exactly one follow-up, run when the current pull
  // finishes.
  let pullQueued = false;
  let storageWarned = false; // A73/V12: the quota warning is worth saying once, not every minute
  function resetPullBackoff() { pullSkip = 0; pullFails = 0; }
  // A144: which confidential kinds this person may READ, as one comparable
  // string. `role` is part of it because admin sees everything — being made, or
  // unmade, admin changes the visible book exactly the way a view grant does,
  // and a comparison that watched only `entries` would miss it.
  function viewGrantsOf(u) {
    const ent = String((u && u.entries) || '').split(',');
    return String((u && u.role) || '') + '|' +
      Aggregate.VIEW_PERM_KEYS.filter(function (k) { return ent.indexOf(k) >= 0; }).join(',');
  }
  function pullCentral(opts) {
    if (!navigator.onLine || !Sync.configured() || !Auth.loggedIn()) return Promise.resolve();
    const forced = !!(opts && opts.force);
    if (pullBusy) { if (forced) pullQueued = true; return Promise.resolve(); }
    // a forced pull (focus, manual refresh, post-push) always runs; only the
    // background timer is allowed to be skipped
    if (!forced && pullSkip > 0) { pullSkip--; return Promise.resolve(); }
    pullBusy = true;
    const year = String(Settings.get('year'));
    // switching year invalidates the snapshot — force a full pull, never merge
    // one year's delta into another year's cache.
    if (centralYear !== year) { setCentral(null); centralCursor = ''; centralYear = year; }
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
        setCentral(null); centralCursor = ''; centralYear = '';
        try {
          localStorage.removeItem('ck_central'); localStorage.removeItem('ck_central_cursor');
          localStorage.removeItem('ck_central_year'); // A132: meaningless without ck_central, but leave no orphan
        } catch (e) {}
        // A131 (trial, the morning after 🧹: "the users are showing with cash
        // data"): the admin panel's cache is MODULE state, not DB state — this
        // wipe cleared every row everywhere else while 👑 kept painting the
        // old users with their old হাতে-₹ from admCache. Same class for the
        // settled-answer sets: every id they remember died with the old book.
        admCache = null; admSection = ''; admUserId = '';
        [stampedAnswers, resolvedFlags, answeredNotifs].forEach(function (m) {
          Object.keys(m).forEach(function (k) { delete m[k]; });
        });
        // A69: the flag is cleared BEFORE the recursive call, or the clean
        // re-pull is swallowed by the guard this very call set — and the device
        // would sit on an empty book until the next tick.
        //
        // This branch is also where the in-flight guard earns its keep as a
        // CORRECTNESS fix, not a performance one: before it, a second pull
        // already in flight held a PRE-clear response, resolved after the wipe,
        // and wrote pre-epoch training rows straight back into the live book —
        // the exact thing the epoch bump exists to prevent.
        // A92: say what is being thrown away. The wipe itself is right — after
        // 🚀 or a restore the server has a different book and this device's
        // pre-epoch rows do not belong in it — but it took queued entries with
        // it and said NOTHING. Logout has guarded exactly this since A74
        // ("১টা এন্ট্রি এখনো পাঠানো হয়নি"); this path never learned the same
        // manners, and it is the more dangerous of the two, because a mid-season
        // restore also bumps the epoch and the collector is not even present.
        //
        // It cannot refuse — refusing would leave the phone reading a book the
        // server has discarded, which is worse. So it counts first and tells the
        // person afterwards, by name and number, instead of leaving them to
        // notice a missing ₹800 next week.
        return DB.allData().then(function (all) {
          // A132: the alert used to give only a COUNT — "re-enter them if you
          // remember" is a memory test, and after a mid-season restore the
          // collector was not even present for the reset. Save the DETAILS
          // before the wipe: ⚙️ grows a read-only 🪦 list to re-enter from.
          // Same rows sync would have pushed (unsynced, not rejected);
          // appended across wipes, capped so storage can never choke.
          const lostRows = [];
          DB.STORES.forEach(function (s) {
            (all[s] || []).forEach(function (r) {
              if (!r.synced && !r.rejected) lostRows.push({ store: s, row: r });
            });
          });
          if (lostRows.length) {
            let prev = [];
            try { prev = JSON.parse(localStorage.getItem('ck_wiped_entries') || '[]') || []; } catch (e) { prev = []; }
            try {
              localStorage.setItem('ck_wiped_entries',
                JSON.stringify(prev.concat(lostRows).slice(-200)));
            } catch (e) { /* storage full — the wipe itself must still run */ }
          }
          return DB.clearAll().then(function () {
            if (lostRows.length > 0) {
              // alert, not toast: 2.2s is not long enough to read something you
              // may have to report to the cashier
              try { window.alert(t('epoch_wiped_unsynced').replace('{n}', toBengaliDigits(String(lostRows.length)))); } catch (e) {}
            }
            pullBusy = false;
            return pullCentral({ force: true }); // clean full pull
          });
        });
      }
      resetPullBackoff(); // it got through: forget any earlier failures
      // A77: when the phone last actually heard from the server. Nothing
      // recorded this, so nothing could say how old a report was.
      try { localStorage.setItem('ck_last_pull', String(Date.now())); } catch (e) {}
      let changed, chatOnly = false;
      if (resp.mode === 'delta' && centralData) {
        const m = mergeDelta(resp.data || {});
        changed = m.changed; chatOnly = m.chatOnly;
      } else {
        setCentral(resp.data || null); // full snapshot (first pull / cache miss)
        changed = true;
      }
      // A148: has the programme fund ever been used? Kept as module state so a
      // cleared `program_on` can never hide money that exists.
      const anyProg = function (rows) {
        return (rows || []).some(function (r) { return r && String(r.sector || '') === 'program'; });
      };
      if (centralData && (anyProg(centralData.parties) || anyProg(centralData.daily) ||
                          anyProg(centralData.expenses))) programSeen = true;
      if (resp.cursor != null) centralCursor = String(resp.cursor);
      centralYear = year;
      if (resp.config) {
        // A153: whether the 🎭 tab exists depends on THIS value, and the nav is
        // painted by render(). Without noticing the change, a phone that opened
        // before the admin switched the programme on kept a five-tab nav until
        // the person happened to navigate — the tab was there, just never drawn.
        // Same shape as the curtain button in A144: state decided at one moment,
        // painted at another, and nothing connecting the two.
        const wasProg = String((centralConfig || {}).program_on || '');
        centralConfig = resp.config;
        try { localStorage.setItem('ck_config', JSON.stringify(centralConfig)); } catch (e) {}
        updateTrainingBar();
        if (String(centralConfig.program_on || '') !== wasProg) changed = true;
      }
      // A115: rides both full and delta pulls, so a post change reaches every
      // phone within one poll rather than at the next full snapshot
      if (resp.committee) {
        committee = resp.committee;
        try { localStorage.setItem('ck_committee', JSON.stringify(committee)); } catch (e) {}
      }
      // notifications ride the pull now — apply them and stop the separate
      // 60s notifications poll (halves the server calls per device)
      if (resp.notif) { notifViaPull = true; applyNotifications(resp.notif.notifications, resp.notif.items); }
      // adopt the fresh user: admin's permission/role changes land within a
      // pull (≤60s) instead of waiting for a re-login
      if (resp.me && Auth.loggedIn()) {
        const before = Auth.current() || {};
        const prev = JSON.stringify(before);
        if (prev !== JSON.stringify(resp.me)) {
          // A144: has a *view* grant changed? Read it BEFORE adopting the new
          // user, or the comparison is against itself.
          const regrant = viewGrantsOf(before) !== viewGrantsOf(resp.me);
          try { localStorage.setItem('ck_user', JSON.stringify(resp.me)); } catch (e) {}
          Settings.set('collectorName', resp.me.name);
          Settings.set('collectorRole', Aggregate.roleOf(resp.me.role, resp.me.cashier));
          changed = true; // re-render below so hidden/shown tiles update
          // A144: this snapshot is now the wrong shape and no delta can fix it.
          //
          // GRANTED — the rows this person may now see were withheld when they
          // were written, so their receivedAt is older than our cursor and a
          // `since` pull skips them for ever. A granted permission would simply
          // look broken.
          // REVOKED — they must LEAVE, and a delta has no way to say "delete".
          // Without this, confidential rows stay cached on a phone whose access
          // the committee just took away.
          //
          // So: drop the cursor and take ONE clean full pull, the same shape the
          // epoch branch above uses. Returning here skips persisting a snapshot
          // that is about to be replaced.
          if (regrant) {
            setCentral(null); centralCursor = ''; centralYear = '';
            try {
              localStorage.removeItem('ck_central');
              localStorage.removeItem('ck_central_cursor');
              localStorage.removeItem('ck_central_year');
            } catch (e) {}
            pullBusy = false;
            return pullCentral({ force: true });
          }
        }
      }
      // A70 (audit #2 P1): this sat ABOVE the `changed` guard, so an idle poll
      // that returned zero rows still re-serialised and re-wrote the entire
      // book. Measured on a modelled mid-season book (5,020 rows, real Bengali
      // names): 1.52M characters = 2.9 MiB of a ~5 MiB origin quota, and
      // JSON.stringify alone is 4.0 ms here — call it ~48 ms on a Unisoc T606.
      // The bigger cost is localStorage.setItem itself: synchronous,
      // LevelDB-backed, on eMMC. Every 60 s, on every focus, and after every
      // push — a collector mid-tap in that window loses the tap.
      //
      // The cursor still has to move on an idle poll, or the next delta asks
      // for everything since the last CHANGE instead of since the last check.
      if (changed) {
        try {
          localStorage.setItem('ck_central', JSON.stringify(centralData));
          localStorage.setItem('ck_central_cursor', centralCursor);
          localStorage.setItem('ck_central_year', centralYear);
        } catch (e) {
          // …and it used to fail SILENTLY. Past the quota the snapshot never
          // persists again: every cold start replays an ever-growing delta from
          // a frozen cursor, gets slower every day, and nobody is told why.
          //
          // A73 (audit #5 V12): ONCE per app run. Past quota this fires on every
          // changed pull — the 60 s tick, every focus, after every push — and
          // `toast()` appends into a single fixed slot at z-index 99. The
          // storage_full string runs 6.9 s against the Undo window's 5 s, so a
          // repeating toast would paint over the one escape hatch a collector
          // has after an instant save, and swallow the tap. Saying it once is
          // the whole value; saying it every minute costs an entry.
          if (!storageWarned) { storageWarned = true; toast(t('storage_full')); }
        }
      } else {
        try {
          localStorage.setItem('ck_central_cursor', centralCursor);
          localStorage.setItem('ck_central_year', centralYear);
        } catch (e) { /* a cursor is 13 bytes; if THIS fails the toast above already fired */ }
      }
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
    }).catch(function () {
      // A69: a failed pull earns a growing skip. Doubling, capped at 8 polls
      // (~8 minutes) — long enough to stop hammering a dead tower, short enough
      // that a link coming back on its own is picked up the same evening. The
      // snapshot is kept: offline shows the last good book, which is the whole
      // point of holding one.
      pullFails = Math.min(pullFails + 1, 4);
      pullSkip = Math.pow(2, pullFails - 1); // 1, 2, 4, 8 polls
    }).then(function () {
      // ALWAYS — success, failure, or an abort. A flag that a single stuck
      // request can leave set for ever would silently stop every future pull on
      // that phone, and nothing would say so. `.then` after `.catch` runs on
      // both paths; a `.finally` would too, but this file targets phones whose
      // browser may predate it.
      pullBusy = false;
      // A117: honour the forced pull that arrived mid-flight — once, now that
      // the line is free. Without this the answer a screen just wrote sits on
      // the server for up to a full poll interval while the screen shows the
      // pre-answer world.
      if (pullQueued) { pullQueued = false; return pullCentral({ force: true }); }
    });
  }
  // central snapshot overlaid with this device's own rows (so a just-saved
  // entry shows before it syncs back). Falls back to local-only if no pull yet.
  // The merge is pure: same local rows + same central snapshot = same result.
  // It was being rebuilt two or three times per button tap, each time walking
  // every row of every store. Memoised on the pair of versions that can change
  // it — the DB's write counter, and a counter bumped wherever centralData is
  // replaced or merged. Miss either and the screen goes stale, so both are
  // bumped in one place each.
  let viewMemo = null, viewMemoKey = '';
  function viewData() {
    const year = Number(Settings.get('year')) || new Date().getFullYear();
    const key = DB.dataVersion() + ':' + centralVersion + ':' + year;
    if (viewMemo && viewMemoKey === key) return viewMemo;
    const p = DB.allData().then(function (localAll) {
      // A75 (audit #3 F1): ONE choke point for the year, here, where local and
      // central meet — rather than threading a parameter through nine
      // aggregate call sites, where the tenth would eventually be missed.
      //
      // On 1 January every phone's year flips (it comes from the system clock;
      // the year field is admin-only, so a collector's is never set). pullCentral
      // then discards the snapshot and pulls an EMPTY 2027 book — while IndexedDB
      // still holds every 2026 row. No 2026 id matches any 2027 id, so A49's
      // guard never fires, and the collector is shown last season's money as
      // cash still in their hand. Reproduced before fixing: ₹5,000 in hand and a
      // handover still "awaiting confirmation", eleven months after it settled.
      //
      // Filtered, not deleted. A wipe at the year boundary would also destroy
      // anything that had not synced, and the year boundary is exactly when
      // nobody is watching. A row from another book simply stops counting in
      // this one, and is still there if the year is set back.
      const local = {};
      DB.STORES.forEach(function (st) {
        local[st] = (localAll[st] || []).filter(function (r) {
          // no year at all = written before the field existed; treat it as this
          // book's rather than silently dropping somebody's money
          return !r || r.year === undefined || r.year === null || r.year === '' || Number(r.year) === year;
        });
      });
      if (!centralData) return local;
      const merged = {};
      DB.STORES.forEach(function (s) {
        const byId = {};
        (centralData[s] || []).forEach(function (r) { if (r && r.id != null) byId[r.id] = r; });
        // A49: local wins ONLY while the server has not seen the row.
        //
        // It used to win unconditionally, and `synced` was never consulted —
        // PROJECT_CONTEXT says "this device's own UNSYNCED rows", which is what
        // this now implements. sync.js sets synced=1 but never touches `status`,
        // so a handover pushed as 'pending' stayed 'pending' in IndexedDB for
        // ever. The cashier confirms it, the delta arrives correct, and this
        // line then shadowed the confirmed row with the sender's stale copy —
        // on আমার হিসাব, the one screen whose job is to say whether he still
        // owes that cash. His hero stayed high and the parcel sat in ⏳ all
        // season, while the admin's phone, where it is not a local row, read it
        // right. Same shadow hid rejections and cleared correction flags.
        //
        // Not pruned: if the central snapshot is ever incomplete, the device's
        // own copy is the only copy, and deleting it to tidy up would be a worse
        // failure than the one being fixed.
        (local[s] || []).forEach(function (r) {
          if (!r || r.id == null) return;
          if (r.synced && byId[r.id]) return; // the server owns what this device already shipped
          byId[r.id] = r;
        });
        merged[s] = Object.keys(byId).map(function (k) { return byId[k]; });
      });
      return merged;
    });
    viewMemo = p; viewMemoKey = key;
    return p;
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
    if (notifCounts.rejections > 0) parts.push(notifCounts.rejections + ' ' + t('notif_rejections'));
    return parts.join(' • ');
  }
  // Locally dismissed rejection notices. A rejection has no "done" state on the
  // server — the row stays 'rejected' — so without this the banner would nag for
  // the rest of the season. Kept per device on purpose: it is a read receipt, not
  // data, and the money record itself lives in the summary and the handover book.
  function rejSeenIds() {
    try { return JSON.parse(Settings.get('rejSeen') || '[]') || []; } catch (e) { return []; }
  }
  function rejSeen(id) { return rejSeenIds().indexOf(String(id)) >= 0; }
  function rejMarkSeen(id) {
    const ids = rejSeenIds();
    if (ids.indexOf(String(id)) < 0) ids.push(String(id));
    Settings.set('rejSeen', JSON.stringify(ids.slice(-200))); // cap: it only grows
  }
  // A127 (trial: "after clicking the button, no response for some time"): a
  // server-bound tap answers INSTANTLY on the button itself — ⏳ + label, not
  // just the near-invisible disabled fade — and after 2.5 s it says the slow
  // part out loud, so a pandal network reads as "server is slow", never as
  // "the app ignored me". Returns the undo for the failure path; on success
  // the DOM usually moves on, and the isConnected guard keeps a late timer
  // from scribbling on a removed node.
  function busyBtn(b) {
    if (!b || !b.isConnected) return function () {};
    const was = b.innerHTML;
    b.disabled = true;
    b.innerHTML = '⏳ ' + esc(t('working'));
    const timer = setTimeout(function () {
      if (b.isConnected && b.disabled) b.innerHTML = '⏳ ' + esc(t('working_slow'));
    }, 2500);
    return function () {
      clearTimeout(timer);
      if (!b.isConnected) return;
      b.disabled = false; b.innerHTML = was;
    };
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
    const haveDetail = (it.approvals && it.approvals.length) || (it.handovers && it.handovers.length) ||
      (it.corrections && it.corrections.length) || (it.rejections && it.rejections.length);
    let html = '';
    (it.approvals || []).filter(function (a) { return !answeredNotifs['user|' + a.userId]; }).forEach(function (a) {
      html += notifRow('🙋 <b>' + esc(a.name) + '</b> (@' + esc(a.username) + ') — ' + esc(t('notif_wants_approve')),
        '<button class="chip on" data-na="approve-user" data-id="' + esc(a.userId) + '">' + esc(t('approve')) + '</button>' +
        '<button class="chip" data-na="decline-user" data-id="' + esc(a.userId) + '">🚫 ' + esc(t('notif_decline')) + '</button>' +
        '<button class="chip" data-nav="admin">👁 ' + esc(t('view')) + '</button>');
    });
    (it.handovers || []).filter(function (h) { return !answeredNotifs['ho|' + h.id]; }).forEach(function (h) {
      html += notifRow('💰 <b>' + esc(h.from) + '</b> — ' + fmtMoney(h.amount) + ' <span class="row-sub">' + esc(fmtDate(h.date)) + '</span>' + breakdownLines(h),
        '<button class="chip on" data-na="confirm-handover" data-id="' + esc(h.id) + '">✅ ' + esc(t('confirm_received')) + '</button>' +
        '<button class="chip" data-nav="cashier">👁 ' + esc(t('view')) + '</button>');
    });
    (it.corrections || []).forEach(function (c) {
      html += notifRow('⚠️ ' + esc(c.reason || (c.targetStore + '/' + c.targetId)) +
          (c.by ? ' <span class="row-sub">— ' + esc(c.by) + '</span>' : ''),
        '<button class="chip" data-nav="review">👁 ' + esc(t('review_btn')) + '</button>');
    });
    // A refusal only ever reaches the SENDER, and unlike the others it is not a
    // task the server can mark done — the row stays 'rejected' for good. So the
    // dismissal is local to this device; the permanent record lives in আমার
    // হিসাব's ❌ slot and in 📗 জমা-খাতা, so dismissing loses nothing.
    (it.rejections || []).filter(function (x) { return !rejSeen(x.id); }).forEach(function (x) {
      html += notifRow('❌ <b>' + esc(x.to || '?') + '</b> — ' + fmtMoney(x.amount) + ' ' +
          esc(t('notif_rejected')) + ' <span class="row-sub">' + esc(fmtDate(x.date)) + '</span>' +
          (x.reason ? '<div class="row-sub">“' + esc(x.reason) + '”</div>' : '') +
          '<div class="row-sub">' + esc(t('notif_rejected_sub')) + '</div>',
        '<button class="chip on" data-go="handover">🤝 ' + esc(t('handover_title')) + '</button>' +
        '<button class="chip" data-rejseen="' + esc(x.id) + '">' + esc(t('got_it')) + '</button>');
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
      const undoOff = busyBtn(offBtn);
      Auth.call('setConfig', { token: Auth.token(), config: { chat_off: 'on' } })
        .then(function () { centralConfig.chat_off = 'on'; toast(t('chat_stopped')); render(); })
        .catch(function (e) { undoOff(); toast(errMsg(e)); });
    };
    el.querySelectorAll('[data-nav]').forEach(function (b) {
      b.onclick = function () { navigate(b.dataset.nav); };
    });
    el.querySelectorAll('[data-rejseen]').forEach(function (b) {
      b.onclick = function () {
        rejMarkSeen(b.dataset.rejseen);
        // re-apply, not just re-render: the apply-time filter drops the id from
        // the COUNT too, so the toast/banner totals fall the moment it is
        // dismissed instead of on the next poll
        applyNotifications(notifCounts, notifItems);
      };
    });
    wireNav(); // the rejection notice offers "🤝 জমা দিলাম", which is a data-go
    el.querySelectorAll('[data-na]').forEach(function (b) {
      b.onclick = function () {
        const undo = busyBtn(b);
        const act = b.dataset.na, id = b.dataset.id, tok = Auth.token();
        const call = act === 'approve-user' ? Auth.call('setStatus', { token: tok, userId: id, status: 'approved', year: Settings.get('year') })
          : act === 'decline-user' ? Auth.call('setStatus', { token: tok, userId: id, status: 'blocked' })
          : Auth.call('confirmHandover', { token: tok, id: id });
        call.then(function () {
          // A126: only after the server said ok — then no stale feed can bring
          // this card back. The row settles in place; the queued forced pull
          // (A117) brings the fresh feed, and applyNotifications re-renders
          // everything else when it lands.
          answeredNotifs[(act === 'confirm-handover' ? 'ho|' : 'user|') + id] = 1;
          toast(t('saved'));
          const row = b.closest('.notif-item');
          if (row) row.remove();
          if (notifViaPull) pullCentral({ force: true }); else checkNotifications();
        }).catch(function (e) { undo(); toast(errMsg(e)); });
      };
    });
  }
  // Apply a notification payload (from `pull` or the standalone action):
  // update the banner, toast on new items, refresh the current data view.
  function applyNotifications(n, items) {
    n = n || { handovers: 0, approvals: 0, corrections: 0, rejections: 0 };
    items = items || { handovers: [], approvals: [], corrections: [], rejections: [] };
    // Rejections are the one feed item with no server-side "done": the row stays
    // 'rejected' all season, so the server resends every one on every poll. The
    // banner already hides locally-dismissed ids — but the COUNT must drop too,
    // here at apply time, or every app start toasts "🔔 1 ফেরত এসেছে" for a
    // notice the user dismissed weeks ago (prev starts at 0, so total>prev).
    items.rejections = (items.rejections || []).filter(function (x) { return !rejSeen(x.id); });
    n.rejections = items.rejections.length;
    // A126: answers this device already gave — same rule as rejections' local
    // seen-list, so counts, dots and the "🔔 new" toast all fall at once and a
    // pre-answer poll cannot re-announce a settled card.
    items.approvals = (items.approvals || []).filter(function (a) { return !answeredNotifs['user|' + a.userId]; });
    n.approvals = items.approvals.length;
    items.handovers = (items.handovers || []).filter(function (h) { return !answeredNotifs['ho|' + h.id]; });
    n.handovers = items.handovers.length;
    const total = (n.handovers || 0) + (n.approvals || 0) + (n.corrections || 0) + (n.rejections || 0);
    const prev = (notifCounts.handovers || 0) + (notifCounts.approvals || 0) + (notifCounts.corrections || 0) +
      (notifCounts.rejections || 0);
    const changed = total !== prev;
    notifCounts = n;
    notifItems = items;
    renderNotifBanner();
    // a dot's source just changed — repaint home if that is where we are
    syncDots(); // a dot's source just changed
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
  const REFRESHABLE = ['home', 'list', 'report', 'admin', 'cashier', 'party', 'entries', 'review', 'hbook', 'messages', 'anomalies', 'memberpay', 'memberadmin'];
  function onAppFocus() {
    if (!notifViaPull) checkNotifications(); // old backend only — pull carries it otherwise
    autoSync(); // push anything still pending when the user returns
    Lists.refresh(); // pick up admin edits to areas/locations
    // A69: coming back to the app is the user saying "try now" — clear any
    // backoff and force past the in-flight skip
    resetPullBackoff();
    pullCentral({ force: true }); // refresh the central snapshot (incl. notifications + me)
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
    pullCentral({ force: true }); // pull the central snapshot on login
  }
  // A129: one refresh, two doors — the invisible pull-down gesture and the
  // visible 🔄 in the header. Both run THIS, so they can never drift apart.
  // Mid-flow it is a no-op: the pull itself is safe, but a 🔄 toast while
  // someone is answering entry questions reads as "something happened to my
  // entry", and onAppFocus already refuses to repaint over a flow anyway.
  function manualRefresh() {
    if (!Auth.loggedIn() || flowState) return;
    toast('🔄');
    // The admin panel reads its own server lists (users + subjects + posts)
    // into admCache; a forced pull refreshes the central snapshot but never
    // that cache, so here — and only here — the refetch must be explicit.
    if (current.view === 'admin') {
      Lists.refresh(); pullCentral({ force: true }); renderAdmin(true); return;
    }
    onAppFocus();
  }
  // Minimal pull-to-refresh: pull down > ~80px from the very top → refresh.
  function wirePullToRefresh() {
    let startY = 0, pulling = false;
    document.addEventListener('touchstart', function (e) {
      pulling = (window.scrollY <= 0 && e.touches.length === 1);
      if (pulling) startY = e.touches[0].clientY;
    }, { passive: true });
    document.addEventListener('touchend', function (e) {
      if (pulling && (e.changedTouches[0].clientY - startY) > 80) manualRefresh();
      pulling = false;
    }, { passive: true });
  }

  // ---------- A63 (audit 2.11): the half-finished entry ----------------------
  //
  // `flowState` lived only in memory. Two ways a collector lost work, and both
  // happen at a pandal gate rather than at a desk:
  //   · a phone call, a swipe-away, an OS memory kill, a service-worker reload
  //     — the tab dies mid-flow and everything typed is simply gone
  //   · hardware/gesture Back — popstate set `flowState = null` with no
  //     question at all, and Android's edge-swipe Back is easy to trigger by
  //     accident while holding a phone in one hand and cash in the other
  // Nothing was ever said. The donor is standing there, and you start again.
  //
  // What is NOT persisted, on purpose:
  //   · handovers — the ceiling is computed from live money. Restoring an
  //     answer sheet built against yesterday's in-hand would let somebody hand
  //     over money they no longer hold.
  //   · edits — finishFlow voids the original AFTER the replacement saves.
  //     Resuming an edit from a stale snapshot could void a row against a
  //     replacement built from figures that have since moved.
  // Both are silent by omission elsewhere; here the reason is written down.
  const DRAFT_KEY = 'ck_draft';
  const DRAFT_MAX_AGE = 12 * 60 * 60 * 1000; // one collecting day, not more
  function draftSave() {
    if (!flowState || !flowState.def.resume) return;
    // presets are context, not typed work — a draft holding only presets would
    // offer to "resume" an entry nobody has started
    const typed = Object.keys(flowState.answers).filter(function (k) {
      return k.indexOf('__') !== 0 && !(flowState.def.presets || {}).hasOwnProperty(k);
    });
    if (!typed.length) { draftClear(); return; }
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({
        r: flowState.def.resume, a: flowState.answers, i: flowState.idx, t: Date.now(),
      }));
    } catch (e) { /* storage full — the flow itself must not break */ }
  }
  function draftClear() { try { localStorage.removeItem(DRAFT_KEY); } catch (e) {} }
  // Has the collector actually typed anything, or is this still the flow's own
  // context? Asking "are you sure" about an entry nobody has started is how a
  // confirm becomes something people dismiss without reading.
  function flowHasTypedAnswers() {
    if (!flowState) return false;
    const pre = flowState.def.presets || {};
    return Object.keys(flowState.answers).some(function (k) {
      return k.indexOf('__') !== 0 && !pre.hasOwnProperty(k);
    });
  }
  function draftRead() {
    try {
      const d = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null');
      if (!d || !d.r || !d.t) return null;
      // A draft older than a collecting day is not a rescue, it is a trap: the
      // donor has gone, and re-saving it would file today's money under an old
      // context. Drop it rather than offer it.
      if (Date.now() - Number(d.t) > DRAFT_MAX_AGE) { draftClear(); return null; }
      return d;
    } catch (e) { return null; }
  }
  // Rebuild the flow the descriptor names. Anything unrecognised (an old draft
  // from a release that has since changed its flows) is dropped, never guessed.
  function draftResume(d) {
    const r = d.r || {};
    const start = function (def) {
      if (!def) { draftClear(); navigate('home'); return; }
      def.presets = Object.assign({}, def.presets || {}, d.a || {});
      startFlow(def);
      flowState.answers = Object.assign({}, d.a || {});
      flowState.idx = Math.min(Number(d.i) || 0, def.steps.length - 1);
      renderEntry();
    };
    if (r.fn === 'newParty') return start(newPartyFlow(r.type, r.presets || {}));
    if (r.fn === 'daily') return start(dailyFlow(r.type));
    if (r.fn === 'collExpense') return start(collectionExpenseFlow(r.collectionType));
    if (r.fn === 'expense') { draftClear(); return startExpense({ presets: d.a || {} }); }
    if (r.fn === 'payment') {
      return viewData().then(function (data) {
        const p = liveParties(data).filter(function (x) { return x.id === r.partyId; })[0];
        // the donor was corrected away or removed while this sat in storage
        if (!p) { draftClear(); toast(t('draft_gone')); navigate('home'); return; }
        start(paymentFlow(p, r.origin || 'list'));
      });
    }
    draftClear(); navigate('home');
  }
  // Offered, never automatic — waking up inside a half-finished form you do not
  // remember starting is its own kind of alarming.
  //
  // A CARD, not window.confirm. A native modal fired on every cold start is
  // exactly the thing people learn to dismiss without reading, and a
  // reflex-dismissed rescue offer destroys the work it exists to save. It also
  // blocks the first paint, so the collector answers it before seeing where
  // they are. This says what the entry was and when, and both answers are one
  // tap — the same shape as renderAfter.
  function renderDraftOffer(d) {
    const what = d.r && d.r.label ? d.r.label : t('draft_entry');
    const typed = Object.keys(d.a || {}).filter(function (k) { return k.indexOf('__') !== 0; });
    $view().innerHTML =
      '<div class="card center onboard"><div class="big-emoji">📝</div>' +
      '<h2>' + esc(t('draft_title')) + '</h2>' +
      '<div class="hint">' + esc(t('draft_what').replace('{what}', what)
        .replace('{ago}', agoText(new Date(d.t).toISOString()))) + '</div>' +
      // show what is actually being offered back, so "carry on" is a decision
      // about known work rather than a guess about a vanished screen
      (typed.length ? '<div class="bd-line" style="display:block;margin-top:8px">' +
        esc(typed.map(function (k) { return answerText(k, d.a[k]); }).filter(Boolean).join(' · ')) + '</div>' : '') +
      '<button id="draft-go" class="primary big block">' + esc(t('draft_continue')) + '</button>' +
      '<button id="draft-drop" class="ghost block">🗑️ ' + esc(t('draft_drop')) + '</button></div>';
    admEl('draft-go').onclick = function () { draftResume(d); };
    admEl('draft-drop').onclick = function () { draftClear(); toast(t('draft_discarded')); navigate('home'); };
  }
  // Best-effort label for a stored answer: the flow definition is gone by now,
  // so this is the raw value, not the step's own formatting.
  function answerText(key, val) {
    if (val === null || val === undefined || val === '') return '';
    if (typeof val === 'object') return '';
    return String(val);
  }
  // Reachable from anywhere that wants to surface the draft on demand; boot
  // uses the router instead (see DOMContentLoaded).
  function offerDraft() {
    const d = draftRead();
    if (!d || flowState) return false;
    navigate('draft');
    return true;
  }
  // ---------- flow engine ----------
  // step: {key, qKey, kind:text|amount|choice, options:[{v,labelKey}], optional, showIf(answers)}
  function startFlow(def) {
    // A116i (pre-go-live review): canEntry's comment claimed "there is no
    // screen left where a button appears that the server will hold" — and there
    // were five: 💰 টাকা জমা on the donor screen (payments carry no permission
    // key, so canEntry(null) stayed true while frozen), the draft-resume card,
    // ✏️ my-entries edit, and the void/flag pair. Every flow is a money flow,
    // so ONE gate here closes payments, edits and resumes at once. Without it
    // the collector completed a payment during the emergency stop, handed the
    // donor a receipt printed "নং —" (the serial is minted server-side), and
    // the row sat held in the queue until unfreeze — a receipt for money the
    // book refused to take.
    if (frozen()) { toast(t('freeze_bar')); return; }
    flowState = { def: def, answers: Object.assign({}, def.presets || {}), idx: 0 };
    // A normal flow skips any step whose answer is already known (presets are
    // context, not input). An EDIT is the opposite: every answer is known, and
    // the point is to walk through them and change what is wrong.
    if (def.editing) {
      // A119 (trial drill): an edit walks every ANSWERED step on purpose — but
      // it still must not land on a step showIf HIDES. dailyFlow's first two
      // steps are busName/busNumber, visible only for buses, and busName is
      // required — so ✏️ on a road/toto round opened on "বাসের নাম কী?", where
      // "পরের প্রশ্ন" refused an empty required answer, for ever. Trapped
      // exactly like A54's loop, on a feature that shipped in this state:
      // goBack and skipHidden both knew to skip invisible steps; the edit's
      // ENTRY point was the one door that did not.
      while (flowState.idx < def.steps.length && !visible(def.steps[flowState.idx])) flowState.idx++;
      renderEntry(); try { history.pushState({ v: 'entry' }, ''); } catch (e) {} return;
    }
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
    // A45: leaving an optional field BLANK is a skip, whichever button you
    // press. The double-ask sat on the Skip button only, so "পরের প্রশ্ন" with
    // an empty box walked straight past it — two doors, one guard, the same
    // shape as A31's update button and A34's reload cap. It belongs here,
    // where every door arrives.
    if (step.confirmSkipKey && (raw === null || !String(raw == null ? '' : raw).trim())
        && !window.confirm(t(step.confirmSkipKey))) return;
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
    // A63: written after EVERY accepted answer, not on a timer and not on
    // unload — `pagehide`/`beforeunload` do not fire reliably when Android
    // kills a backgrounded tab, which is the case this exists for.
    draftSave();
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
    // Correcting an entry is append-only: the old row is VOIDED and a new one
    // written, so "what did it say before" always has an answer and the serial
    // is not silently reused.
    //
    // ORDER MATTERS. The void is written AFTER the replacement saves. Written
    // before, a rejected save (zero amount) or a user backing out left the
    // original voided with nothing in its place — the entry, and its money,
    // simply vanished from the books.
    def.save(flowState.answers).then(function (result) {
      if (!def.editing) return result;
      return DB.put('voids', DB.newRow({ targetStore: def.editing.store, targetId: def.editing.id,
                                         reason: 'edit — ' + (def.editing.reason || '') }))
        .then(function () { return result; });
    }).then(function (result) {
      savingFlow = false;
      const r = result || {};
      flowState = null;
      draftClear(); // saved for real — the draft has done its job
      updateBadge(); autoSync();
      if (r.after && r.after.navigateTo) navigate(r.after.navigateTo, r.after.params);
      else if (r.after) renderAfter(r.after);
      else navigate(def.returnTo || 'home');
      // No Undo after an EDIT. Undo only knows the new row, so it would delete
      // the replacement while the void on the original stands — both gone. An
      // edit is already the correction path; correcting a correction is done
      // by editing again, not by unwinding half of it.
      if (r.undo && r.undo.length && !def.editing) toastUndo(t('saved'), function () { attemptUndo(r.undo); });
      else toast(t('saved'));
    }).catch(function (e) {
      savingFlow = false;
      const msg = String(e && e.message);
      if (msg === 'zero') { toast(t('amount_zero')); rewindToAmount() || goBack(); }
      // A144: alert, not toast — this one asks the collector to redo the sheet,
      // and 2.2 s is not long enough to read an instruction you must act on.
      else if (msg === 'mix-confidential') {
        try { window.alert(t('err_mix_confidential')); } catch (e2) {}
        goBack();
      }
      else if (msg === 'recipient-blind') {
        try { window.alert(t('err_recipient_blind')); } catch (e2) {}
        goBack();
      }
      else if (msg === 'cancelled') {
        // A54 (audit 1.2): saying "no, that IS a duplicate" must END the entry.
        // rewindToKey('name') works in newPartyFlow, which has a name step —
        // paymentFlow does not, so it returned false and goBack() dropped the
        // collector on "কোনো নোট?" with no message. Tapping Skip re-ran the save,
        // re-asked the same question, for ever; the only way out was hardware
        // Back, which also discards the entry. With a donor waiting, the second
        // answer is OK — recording the duplicate they had just correctly
        // refused. The whole A22 defence inverted under exactly the pressure it
        // was built for.
        // A115d: ALWAYS end. A54 wrote the rule — "saying no, that IS a
        // duplicate must END the entry" — and then guarded it for one of the
        // two flows: paymentFlow has no name step, so rewindToKey returned
        // false and it ended; newPartyFlow HAS one, so shop and person quietly
        // took the other branch for five months.
        //
        // What that cost, reported from the field: rewindToKey deletes only the
        // key it rewinds to, and skipHidden() skips every step that already has
        // an answer. So the collector was dropped back on "নাম?" with the phone,
        // the pledge and the money still filled in — typed a new name, and the
        // flow jumped straight past all of it to save. The SAME duplicate alert
        // fired at once, on data they had not entered, because it matched the
        // old PHONE. Cancel again and it loops; the only ways out were hardware
        // Back (which discards the entry) or pressing OK — recording the very
        // duplicate they had just correctly refused. That is A54's own inversion
        // arriving through the door A54 left open.
        //
        // Worse than the loop: pressing OK saved the NEW name against the OLD
        // phone, pledge and amount — one donor's money filed under another's
        // name, silently.
        //
        // Ending also matches what the collector was actually asked. The dialog
        // says, in so many words, `"Cancel" = একই দাতা, যোগ করব না` — so Cancel
        // must not leave a half-built entry alive behind it.
        flowState = null;
        draftClear(); // deliberately refused — it must not come back as a resume
        toast(t('dup_cancelled'));
        navigate(def.returnTo || 'home');
      }
      // A54 (audit 1.3): an IndexedDB write failure, a full phone, a Lists
      // throw — all of them used to say "মোট টাকা ০ হতে পারে না" and drop the
      // collector back on the amount, where retyping ₹500 produced the same
      // sentence. That is the lie A35 was written to stop, one screen away.
      // Say what happened, and do NOT rewind: rewinding invites infinite retry.
      else { toast(t('save_failed') + ': ' + errMsg(e)); }
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
  // A115d: rewindToKey is gone. Its only caller was the duplicate-cancel path,
  // and it was actively dangerous there: it deleted ONLY the key it rewound to,
  // while skipHidden() skips every step that already has an answer — so the
  // collector was returned to "নাম?" with the phone and the money still set,
  // and the next answer flew straight to save. rewindToAmount stays: it is
  // reached when an amount is zero, and re-asking only the amount is exactly
  // right there.
  function goBack() {
    Voice.stop();
    // step back to the previous VISIBLE step; skip hidden ones (e.g. bus
    // name/number in a toto/road flow). If none remain, leave the flow.
    let i = flowState.idx - 1;
    while (i >= 0 && !visible(flowState.def.steps[i])) i--;
    if (i < 0) {
      // A124 (trial: dues → donor → 💰 → back landed on HOME): leaving a flow
      // backwards returns to where it was OPENED, when the flow says where
      // that is. The donor's page carries its own `from`, so the whole trail
      // (dues filter → donor → flow → back → donor → back → list) stays whole.
      // A124b (the sweep Hrishi asked for): every flow that knows where it was
      // opened must be honoured on the way out BACKWARDS too. `returnTo` has
      // always steered the after-SAVE exit (finishFlow); ignoring it here sent
      // every ✏️ edit — payments, daily, expenses — back to HOME when the
      // collector changed their mind, instead of to the entries list they were
      // working down. Same rule, both directions.
      const exit = flowState.def.exitTo, ret = flowState.def.returnTo;
      flowState = null; draftClear();
      if (exit) navigate(exit.view, exit.params);
      else navigate(ret || 'home');
      return;
    }
    delete flowState.answers[flowState.def.steps[i].key];
    flowState.idx = i;
    draftSave();
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
      const chips = (s.optionsFn ? s.optionsFn(flowState.answers) : s.options) || [];
      // A146: an optionsFn can now legitimately return NOTHING — a parcel of
      // স্পনসর money when nobody has been granted `sponsorview` yet. A bare empty
      // chip row is a dead end with no explanation, in front of somebody holding
      // cash. Say what happened and who fixes it; the step's own `emptyKey`
      // supplies the sentence, so this stays one rule for every future step.
      if (!chips.length && s.emptyKey) {
        html += '<div class="empty">' + esc(t(s.emptyKey)) + '</div>';
      } else {
        html += '<div class="chips">' + chips.map(function (o) {
          return '<button class="chip" data-v="' + esc(o.v) + '">' +
                 esc(o.labelKey ? t(o.labelKey) : o.label) + '</button>';
        }).join('') + '</div>';
      }
    } else if (s.kind === 'sheet') {
      // ONE screen for a handover: every source category gets its OWN cash and
      // UPI box, prefilled with what's actually in hand. Hand over everything →
      // change nothing, just Next. Hand over part → edit that one box. A box is
      // capped at the available figure so the books can never go negative, and
      // a category with no money of that type shows "—" instead of an input.
      // A146: built from Aggregate.SUMMARY_GROUPS, not from a local literal.
      //
      // This WAS a fourth hand-written copy of the same grouping, and a category
      // named in none of its three rows was silently dropped from the sheet —
      // so after স্পনসর got its own band, a ₹30,000 sponsor pot vanished from
      // this screen while "মোট এসেছে" still counted it. A breakdown that adds up
      // to less than the total printed beside it, with nothing to say why.
      // Found by driving the cashier's handover sheet.
      //
      // SUMMARY_GROUPS is the right source: it is the same banding আমার হিসাব
      // uses, and tests already assert its bands sum to the hero exactly — so a
      // future kind cannot be added to one screen and forgotten on this one.
      // (bus sits with the new-entry types, exactly as on the home screen; a
      // collector is never a handover RECIPIENT, so 'other' is usually empty for
      // them and simply does not render.)
      const groups = Aggregate.SUMMARY_GROUPS.map(function (g) {
        return { key: g.key, labelKey: SUM_GROUP_KEYS[g.key] || 'cat_other',
                 cats: s.categories.filter(function (c) { return g.cats.indexOf(c.key) >= 0; }) };
      }).filter(function (g) { return g.cats.length; });
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
      // Why the ceiling can be lower than "what I hold" — said up front, in the
      // same two colours the summary uses: gold for money on its way out, red
      // for a pot that owes. Without this the cap looks like a bug.
      const cap = s.cap || {};
      const notices =
        (cap.pendingOut && cap.pendingOut.total
          ? '<div class="strip">' + tMoney('sheet_cap_pending', cap.pendingOut.total) +
            '<span class="sub">' + esc(t('sheet_cap_pending_sub')) + '</span></div>' : '') +
        (cap.debt && cap.debt.total
          ? '<div class="strip bad">' + tMoney('sheet_cap_debt', cap.debt.total) +
            '<span class="sub">' + esc(t('sheet_cap_debt_sub')) + '</span></div>' : '');
      html += notices +
        '<div class="sh-actions"><button class="chip" id="sh-all">' + esc(t('sheet_all')) +
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
      // A104: a group's subtotal, but only when there is something to sub-total.
      //
      // With one category the subtotal repeated that single row's figures under
      // a BLANK name, so a collector handing in ₹100 from one shop saw the same
      // ₹100 twice, unlabelled, and read it as two entries — or as ₹200. And
      // even with several rows the line had no name at all, which is the one
      // thing a total must have.
      const subRow = function (o) {
        return '<div class="sh-row ro sub"><span class="cat-name">' + esc(t('total')) + '</span>' +
          money(o) + '</div>';
      };
      const group = function (labelKey, cats) {
        if (!cats.length) return '';
        const sub = cats.reduce(function (a, c) { return { cash: a.cash + c.cash, upi: a.upi + c.upi }; }, { cash: 0, upi: 0 });
        return '<div class="cat-group"><div class="cat-group-head">' + esc(t(labelKey)) + '</div>' +
          cats.map(function (c) {
            return '<div class="sh-row ro"><span class="cat-name">' + esc(t(c.labelKey)) + '</span>' + money(c) + '</div>';
          }).join('') +
          (cats.length > 1 ? subRow(sub) : '') + '</div>';
      };
      const inGrp = function (keys) { return s.cats.filter(function (c) { return keys.indexOf(c.key) >= 0; }); };
      // A146: the cashier's read-only position, banded from the same source, so
      // a new kind cannot appear on one of these two screens and not the other.
      // 'other' is drawn separately below, by GIVER rather than by category.
      html += Aggregate.SUMMARY_GROUPS.filter(function (g) { return g.key !== 'other'; })
        .map(function (g) { return group(SUM_GROUP_KEYS[g.key] || 'cat_other', inGrp(g.cats)); }).join('') +
        (v.byGiver.length ? '<div class="cat-group"><div class="cat-group-head">' + esc(t('grp_received')) + '</div>' +
          v.byGiver.map(function (g) {
            return '<div class="sh-row ro"><span class="cat-name">🧑 ' + esc(g.name) + '</span>' + money(g) + '</div>';
          }).join('') +
          // A104: same rule for the people who handed money in — one giver
          // needs no total under them
          (v.byGiver.length > 1 ? subRow(v.received) : '') + '</div>' : '') +
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
      // The keyboard follows the question. One input serves every step, so it
      // used to open the letter keyboard even for a rupee amount — and an
      // amount is the thing a collector types most, fifty times a day.
      //
      // `numeric`, not `text`, on amounts. Words like "পাঁচশো" still parse and
      // are still the point of the mic button beside the box; they were never
      // really typed. Anyone who wants to type one can still switch keyboards.
      const kb = s.kind === 'amount' ? 'inputmode="numeric" enterkeyhint="next" placeholder="500"'
        : s.key === 'phone' ? 'inputmode="tel" enterkeyhint="next" placeholder="9xxxxxxxxx"'
        : 'enterkeyhint="next"';
      html += '<div class="input-row">' +
        '<input id="flow-input" ' + kb + ' value="' + esc(prev) + '" autocomplete="off">' +
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
          // A70 (audit #2 U5): every SpeechRecognition error other than
          // 'network' used to say "এই ফোনে voice চলছে না — টাইপ করো". That
          // includes not-allowed / service-not-allowed, i.e. the permission
          // prompt was dismissed — which is exactly what a first-time
          // smartphone user does with a dialog they do not understand.
          //
          // So guided voice, one of this app's best ideas, was being switched
          // off PERMANENTLY for the people who need it most, by a message
          // telling them their phone cannot do it. It can; they just have to
          // tap Allow, and nothing said so.
          const denied = (err === 'not-allowed' || err === 'service-not-allowed');
          hint.textContent = (err === 'network') ? t('need_net_voice')
                           : denied ? t('mic_denied') : t('no_mic');
          // red, not the 13px grey hint colour — this one has an action in it
          hint.className = denied ? 'hint err-hint' : 'hint';
        });
      };
    }
    const skipB = document.getElementById('skip-btn');
    if (skipB) skipB.onclick = function () {
      // same double-tap guard as submitAnswer: past the last step there IS
      // no current step — reading .kind here used to throw
      const st = flowState && flowState.def.steps[flowState.idx];
      if (!st) return;
      // The `confirmSkipKey` ask lives in submitAnswer now, so this button and
      // "পরের প্রশ্ন" cannot answer the question differently. Hrishi's call on
      // the donor phone — "don't make it mandatory, but ask two times before
      // passing the field". Mandatory would only buy fake numbers (9999999999
      // gets typed the moment a step blocks a busy collector), and a fake number
      // is worse than a blank one: it collides with every other fake number and
      // poisons duplicate detection.
      submitAnswer(st.kind === 'amount' ? null : '');
    };
    const backB = document.getElementById('back-btn');
    if (backB) backB.onclick = goBack;
    if (s.kind === 'cashsheet') wireCashSheet(s);
    if (s.kind === 'sheet') {
      const picks = Array.prototype.slice.call(document.querySelectorAll('.sh-pick'));
      const totalEl = document.getElementById('sh-total');
      const nextB = document.getElementById('sh-next');
      // The per-pot chips are NOT sufficient on their own: an overspent pot is
      // clamped to 0 and disappears from the chips, but its debt still reduces
      // the cash actually in hand, so Σ chips can exceed what exists. Clamp the
      // TOTAL per money type too, and say which one is over rather than just
      // greying out "next" — a dead button with no reason is what makes people
      // think the app is broken.
      const cap = s.cap || {};
      const capCash = typeof cap.cash === 'number' ? cap.cash : Infinity;
      const capUpi = typeof cap.upi === 'number' ? cap.upi : Infinity;
      const refresh = function () {
        let cash = 0, upi = 0;
        picks.forEach(function (b) {
          if (!b.classList.contains('on')) return;
          const v = Number(b.dataset.amt) || 0;
          if (b.dataset.kind === 'cash') cash += v; else upi += v;
        });
        const overCash = cash > capCash, overUpi = upi > capUpi;
        totalEl.innerHTML = esc(t('sheet_total')) + ': ' +
          '<span class="cat-split">💵' + fmtMoney(cash) + ' · 📱' + fmtMoney(upi) + '</span>' +
          '<b class="cat-tot">' + fmtMoney(cash + upi) + '</b>' +
          (overCash ? '<div class="sh-over">' + tMoney('sheet_over_cash', capCash, cash - capCash) + '</div>' : '') +
          (overUpi ? '<div class="sh-over">' + tMoney('sheet_over_upi', capUpi, upi - capUpi) + '</div>' : '');
        nextB.disabled = (cash + upi) <= 0 || overCash || overUpi;
      };
      // A146: mixing is made IMPOSSIBLE here, not punished at the end.
      //
      // A confidential pot must travel alone (see confidentialMix). Everything
      // on this sheet starts selected, so the ordinary "hand over the lot" tap
      // built exactly the parcel the save then refused — the collector chose
      // pots, chose a cashier, wrote a note, and only then was told. Driving it
      // is how that showed: the dead end had simply moved to the last step.
      //
      // So the two families are mutually exclusive on the sheet itself. Picking
      // স্পনসর drops the ordinary pots; picking an ordinary pot drops স্পনসর.
      // The save-time message stays as a backstop nobody should ever reach.
      const isConf = function (b) { return Aggregate.isRestrictedType(b.dataset.cat); };
      const exclusive = function (b) {
        if (!b.classList.contains('on')) return;
        const wantConf = isConf(b);
        picks.forEach(function (o) {
          if (o === b) return;
          // two confidential pots are mixing too, so same-family is not enough —
          // only the SAME pot may stay lit beside a confidential one
          const keep = wantConf ? (isConf(o) && o.dataset.cat === b.dataset.cat) : !isConf(o);
          if (!keep) o.classList.remove('on');
        });
      };
      picks.forEach(function (b) {
        b.onclick = function () { b.classList.toggle('on'); exclusive(b); refresh(); };
      });
      document.getElementById('sh-all').onclick = function () {
        // "সব" means all the OPEN money — a confidential pot is never part of
        // "everything", because everything is exactly what it may not travel with
        picks.forEach(function (b) { b.classList.toggle('on', !isConf(b)); });
        if (!picks.some(function (b) { return b.classList.contains('on'); })) {
          picks.forEach(function (b) { b.classList.add('on'); exclusive(b); });
        }
        refresh();
      };
      document.getElementById('sh-none').onclick = function () {
        picks.forEach(function (b) { b.classList.remove('on'); }); refresh();
      };
      // …and the sheet OPENS in a valid state. Every chip is rendered lit, so a
      // collector holding both kinds would otherwise land on a mixed parcel
      // before touching anything. Somebody holding ONLY confidential money keeps
      // theirs lit — there is nothing for it to be mixed with.
      if (picks.some(isConf) && picks.some(function (b) { return !isConf(b); })) {
        picks.forEach(function (b) { if (isConf(b)) b.classList.remove('on'); });
      } else if (picks.some(isConf)) {
        const first = picks.filter(isConf)[0];
        picks.forEach(function (b) { b.classList.add('on'); });
        exclusive(first);
      }
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
  // Committee positions (সভাপতি / সম্পাদক / …) — the same admin-editable master
  // list mechanism as areas and locations, so Hrishi adds his committee's real
  // titles himself instead of living with names hard-coded here.
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
      // A148: the ভাঁড়ার lives on the DONOR, so their pledge and every instalment
      // against it stay in one fund — asked per instalment, one mistap would split
      // a single promise across two accounts.
      sector: sector || 'puja',
      location: a.location || '', phone: a.phone || '', pledged: a.pledged || 0,
      // members only; blank for every other donor type. When the list holds a
      // single position the flow never asked, so fill it in here — otherwise
      // today's members would carry no position at all, and adding real titles
      // later would leave a silent gap in the register.
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
  // A153: `sector` comes from the TAB the flow was started in, never from a
  // question. It rides in the factory signature exactly the way `type` does, so
  // it also survives a resumed draft — a mode flag read at save time would not.
  function newPartyFlow(type, presets, sector) {
    return {
      title: t('new_entry') + ' — ' + t('type_' + type),
      presets: presets || {},
      // A63: what it takes to rebuild this flow from storage. Set in the
      // factory, not at the fourteen call sites, so none can be forgotten.
      resume: { fn: 'newParty', type: type, presets: presets || {}, sector: sector || 'puja', label: t('type_' + type) },
      steps: [
        { key: 'name', qKey: type === 'shop' ? 'q_shop_name' : type === 'sponsor' ? 'q_sponsor_name'
                             : type === 'gupt' ? 'q_gupt_name' : 'q_person_name', kind: 'text' },
        { key: 'owner', qKey: 'q_owner_name', kind: 'text', optional: true,
          showIf: function () { return type === 'shop'; } },
        // optionsFn, not options: read when the user REACHES this step, so a
        // background list refresh that finishes meanwhile is already included.
        { key: 'side', qKey: 'q_side', kind: 'choice', optionsFn: sideOptions, showIf: function () { return type === 'shop'; } },
        // A144: স্পনসর is excluded. A sponsor has no locality in this book —
        // nobody walked a street for it — and every extra field on a
        // confidential row is one more place its figures can surface.
        { key: 'location', qKey: 'q_location', kind: 'choice', optionsFn: locationOptions, optional: true,
        // A145: গুপ্ত দান is excluded too, and for a sharper reason than the
        // sponsor's. A locality narrows a secret donor down for anyone who later
        // gains the view grant — it is the field most likely to identify
        // somebody who asked not to be named. The name is already the whole
        // secret; do not hand out a second one.
          showIf: function () { return type !== 'shop' && type !== 'sponsor' && type !== 'gupt' && Lists.get('location').length > 0; } },
        // --- committee-member registry fields (v4.7.0), members only ---
        // Asked here rather than on a separate admin screen because the person
        // filling this in is the one talking to the member; a second screen
        // would mean the details are entered later, from memory, or never.
        // still optional — but skipping it asks once more (see confirmSkipKey
        // in renderEntry). The number is what makes 📞 dues reminders possible
        // AND what turns a weak name match into a near-certain duplicate call.
        { key: 'phone', qKey: 'q_phone', kind: 'text', optional: true,
          confirmSkipKey: 'skip_phone_confirm',
          validate: phoneErrIN, clean: cleanPhoneIN },
        // A148: which ভাঁড়ার. Asked LAST of the identity questions and defaulted
        // to পুজো, so the ordinary entry — which is almost every entry — is one
        // extra tap on a chip that is already the right answer. Skipped entirely
        // while the committee has no programme running, so nobody is asked a
        // question with one possible answer.
        // newPartyFlow is shops and persons only now — a committee member is
        // registered on its own screen (renderMemberForm), with no pledge and
        // no money, because their contributions arrive many times a season.
        //
        // A145: গুপ্ত দান is asked NO pledge, by Hrishi's rule — "no expected
        // amount, only amount entry". Nobody negotiates with somebody who does
        // not want to be named. That single omission also keeps them out of the
        // dues list for free: pledged 0 makes due = −paid, and duesList's
        // `due > EPS` filter drops it. Structurally this is the committee
        // MEMBER's shape — a name, no promise, money arriving many times.
        { key: 'pledged', qKey: 'q_pledged', kind: 'amount',
          showIf: function () { return type !== 'gupt'; } },
      ].concat(moneySteps(true)),
      save: function (a) {
        // dup check against the CENTRAL snapshot + own rows (viewData), not
        // just this device — two collectors adding the same shop from two
        // phones used to both sail through and double the donor centrally.
        return viewData().then(function (data) {
          // Two signals, deliberately different strengths — Hrishi's point that
          // a phone number identifies a donor far better than a name does.
          //   name only  → weak. "মা তারা স্টোর" can honestly be three shops.
          //   phone match→ strong. Same number = same household/owner, so this
          //                is either the same donor twice, or one owner's second
          //                shop — and either way the collector should be told
          //                WHICH existing donor, not just "a name matched".
          // Still a confirm, never a block: both cases have legitimate versions.
          const nm = String(a.name || '').trim().toLowerCase();
          const ph = cleanPhoneIN(a.phone || '');
          const alive = liveParties(data);
          const byName = alive.filter(function (p) { return String(p.name || '').trim().toLowerCase() === nm; });
          const byPhone = ph ? alive.filter(function (p) { return cleanPhoneIN(p.phone || '') === ph; }) : [];
          const hit = byPhone[0] || byName[0];
          if (hit) {
            const line = esc0(hit.name) + (hit.owner ? ' (' + hit.owner + ')' : '') +
              (hit.phone ? ' · 📞 ' + hit.phone : '') +
              ' · ' + t('pledged') + ' ' + fmtMoney(hit.pledged || 0) +
              (hit.collector ? ' · ' + hit.collector : '');
            const msg = (byPhone.length ? t('dup_party_phone') : t('dup_party_warn')).replace('{row}', line);
            if (!window.confirm(msg)) throw new Error('cancelled');
          }
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
  // One payment, identified the way a human identifies it: the receipt number
  // they can compare against the donor's phone, who took it, when, and a short
  // id so the same row can be found on the admin's duplicate screen. Used by
  // BOTH the entry-time warning and that screen, so the two never describe the
  // same row differently.
  // window.confirm shows PLAIN TEXT, so nothing here is escaped — esc() would
  // print literal &amp; to a user. Kept as its own named helper so nobody
  // later 'fixes' it by adding esc(), and nobody pastes this into innerHTML.
  function esc0(v) { return String(v == null ? '' : v); }
  function dupLine(p) {
    const when = p.createdAt ? fmtDateTime(p.createdAt) : fmtDate(p.date);
    return '• ' + (p.receiptNo ? t('receipt_no') + ' ' + p.receiptNo + ' · ' : '') +
      fmtMoney(p.amount) + ' · ' + (p.collector || p.collectorId || '?') + ' · ' + when +
      '  [' + String(p.id).slice(0, 8) + ']';
  }
  // `editing` is set by the correction path (renderEditEntry), which reuses
  // this flow to write the replacement row — see the A22 note in save().
  function paymentFlow(party, origin, editing) {
    // A committee member's contribution MUST say what it is for (Hrishi's rule).
    // A member pays many times a season — monthly subscription, a function, a
    // special donation — and unlike a shop's chanda the amount alone does not
    // say which. Left optional it would be skipped every time and the register
    // would be a column of bare numbers nobody can explain months later.
    const isMember = String(party.type || '') === 'member';
    return {
      title: t('add_payment') + ' — ' + party.name,
      // A63: NOT when editing. finishFlow voids the original after the
      // replacement saves, so resuming an edit from a stale snapshot could
      // void a row against figures that have since moved.
      resume: editing ? null : { fn: 'payment', partyId: party.id, origin: origin, label: party.name },
      // A124: backing out of the first question returns to THIS donor's page,
      // with the origin carried so the page's own ← keeps working too.
      exitTo: { view: 'party', params: { id: party.id, from: origin === 'list' ? '' : origin } },
      steps: moneySteps(false).concat([
        isMember
          ? { key: 'note', qKey: 'q_note_member', kind: 'text' }   // no `optional` → mandatory
          : { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ]),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        // A22: same donor + same amount + same day already on the books? Ask.
        // A slow phone makes a collector re-tap, and nothing else catches it:
        // the two rows have different uuids, so upsert/duplicate_id/the queue
        // all wave them through, and reconcile still BALANCES (both really were
        // collected). Result: the donor's dues fall and the collector's in-hand
        // rises by money they never took.
        //
        // A warning, never a block — a donor genuinely can pay ₹500 twice in a
        // day. Checked against viewData() (central + own rows), like the
        // duplicate-donor check, so a payment another device already took
        // counts too. The EDIT path is exempt: correcting a flagged entry
        // deliberately re-enters the same party/amount/day, and the old row is
        // voided by the same commit.
        const dupCheck = editing
          ? Promise.resolve(true)
          : viewData().then(function (data) {
              const hits = Aggregate.samePaymentsOn(data, party.id, m.total, todayISO());
              if (!hits.length) return true;
              // Show WHAT is already there, not just that something is. Who took
              // it decides the answer on the spot: "যমুনা · ৩ মিনিট আগে" and it
              // was my own double-tap; "বাপি · সকালে" and this is a real second
              // instalment somebody else collected.
              return window.confirm(t('dup_pay_warn')
                .replace('{n}', fmtMoney(m.total))
                .replace('{who}', party.name || '')
                .replace('{list}', hits.map(dupLine).join('\n'))) && 'confirmed-duplicate';
            });
        // A human answered the question, so record the answer: without it the
        // reconcile banner would keep flagging a pair the collector has already
        // confirmed is two genuine instalments, all season. A banner that cries
        // wolf stops being read — the same trap as the dismissed-rejection toast.
        let dupOk = 0;
        return dupCheck.then(function (go) {
        if (!go) throw new Error('cancelled');
        if (go === 'confirmed-duplicate') dupOk = 1;
        const row = DB.newRow({
          partyId: party.id, partyName: party.name, amount: m.total,
          cashAmount: m.cash, upiAmount: m.upi,
          date: todayISO(), note: a.note || '',
          dupOk: dupOk, // 1 = the collector confirmed this really is a second instalment
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
    // A146: "কাকে?" is asked LAST now, and that ORDER is the feature.
    //
    // It used to come first, which meant the app could not yet know what was
    // being handed over — so a confidential pot sent to somebody without the
    // matching view grant was only caught at save, after the person had chosen a
    // name, chosen pots and typed amounts, with cash in their hand. A rule
    // enforced at the last possible moment is a dead end wearing a rule's
    // clothes.
    //
    // Asked last, the answer is DERIVED instead: the pots are already known, so
    // the list can simply be the people who may receive THIS parcel. Nobody is
    // asked "does this need a permission" — the parcel says so.
    //
    // optionsFn, not options: read when the user REACHES the step, so it sees
    // the sheet they just filled in (the same reason the party flow reads its
    // area list that way).
    const toStep = opts.length
      ? { key: 'to', qKey: 'q_handover_to', kind: 'choice',
          emptyKey: 'ho_nobody_may_take',
          optionsFn: function (a) {
            return recipientsFor(opts, a).map(function (c) { return { v: c.username, label: c.name }; });
          } }
      : { key: 'to', qKey: 'q_handover_to', kind: 'text' };
    // Source categories the collector/cashier actually holds money in —
    // চাঁদা / রোড / টোটো / বাস / অন্যের-জমা. Only categories with money
    // appear (which also makes the list permission-shaped: you can't hold
    // bus money without bus access). Flow: pick categories → pick নগদ/UPI/
    // দুটোই (each chip shows the selected categories' real amount) → save.
    // "✏️ অন্য পরিমাণ" escapes to manual typed entry for partial handovers.
    // A66 (audit 2.20): this was a character-for-character copy of
    // CAT_LABEL_KEYS, 1,959 lines away. Two maps of the same thing means the
    // day somebody adds a category, one screen labels it and the other prints
    // `cat_other`. Module-level `const`, read at call time, so the order is
    // fine.
    const CAT_LABELS = CAT_LABEL_KEYS;
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
    // No typed-amount fallback any more (R2). It only ever triggered when every
    // pot was ≤0 — i.e. the collector held nothing — and it was the ONE door
    // with no ceiling: any figure typed there was fiction the books would then
    // owe. startHandover() now shows an empty-state instead of opening the flow,
    // so by the time we are here a collector always has at least one chip.
    // `cap` carries the per-money-type ceiling. The pot chips alone cannot
    // enforce it: an overspent pot is clamped to 0 and so vanishes from the
    // chips, while its debt still reduces the cash really in hand — so Σ
    // chips can exceed what exists. See Aggregate.handoverable().
    const moneySteps_ = cashierMode
      ? [{ key: 'cashsheet', qKey: 'q_handover_amount', kind: 'cashsheet', view: cashView, cats: catsOf(cashView.collectedByCat) }]
      : [{ key: 'sheet', qKey: 'q_handover_sheet', kind: 'sheet', categories: categories,
           cap: { cash: avail.cash, upi: avail.upi,
                  pendingOut: avail.pendingOut || { total: 0 },
                  debt: avail.debt || { cash: 0, upi: 0, total: 0 } } }];
    return {
      title: t('handover_title') + (avail.cash || avail.upi
        ? ' — ' + t('you_have') + ': 💵' + fmtMoney(avail.cash) + ' · 📱' + fmtMoney(avail.upi) : ''),
      // A146: money first, THEN the name. See toStep for why the order is the fix.
      steps: moneySteps_.concat([toStep], [
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
        // A144: a confidential pot travels ALONE. visibleData withholds such a
        // handover whole, and it can only do that if the row is wholly
        // confidential — trimming one category out of a mixed breakdown would
        // leave a checksum that no longer sums to `amount`, and reconcile would
        // accuse the recipient of a broken row they cannot see. The server
        // refuses a mixed row too; this is the half that explains why.
        const mix = confidentialMix(breakdown);
        if (mix.mixed) return Promise.reject(new Error('mix-confidential'));
        // A144: and it may only go to somebody who can SEE it. The recipient is
        // asked BEFORE the sheet in this flow, so the check lands here rather
        // than by shortening the picker — the server refuses it either way, and a
        // row the server refuses is a row dropped from the queue in silence. Far
        // better to say so now, while the collector is still holding the cash.
        if (mix.cats.length && !recipientSees(a.to, mix.cats)) {
          return Promise.reject(new Error('recipient-blind'));
        }
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
      // handoverable(), NOT myAvailable(): pending parcels are still counted as
      // this person's money in the books, but the notes have already left the
      // pocket, so offering them again would promise the same money twice.
      return { avail: Aggregate.handoverable(data, ident),
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
    // R2: with nothing in the account there is nothing honest to hand over —
    // say so instead of opening a flow whose only remaining path was the
    // uncapped typed-amount fallback. If money is merely stuck in transit
    // (sent, awaiting approval), say THAT, because "no money" would read as a
    // bug to someone who collected all morning.
    const begin = function (opts, a) {
      if ((a.avail.total || 0) <= 0) {
        const pend = (a.avail.pendingOut || {}).total || 0;
        toast(pend > 0 ? t('ho_nothing_pending').replace('{n}', fmtMoney(pend)) : t('ho_nothing'));
        return;
      }
      startFlow(handoverFlow(opts, a.avail, a.view));
    };
    // A118 (live trial: "handover screen is a bit slow"): opening the flow
    // used to BLOCK on a 'cashiers' round trip — 1–3 s on the live server —
    // while the phone already HELD the answer: the committee roster rides
    // every pull (A115) and carries the same test the server's list applies
    // (approved + admin-or-cashier, both via effPerms_), and the flow needs
    // only username + name from it. So the roster opens the flow at once; the
    // round trip remains only for a phone that has never pulled. The roster is
    // at most one poll (60 s) stale, which is also true of any list fetched
    // when the screen opened.
    const rosterCashiers = committee.filter(function (u) {
      return u.status === 'approved' && (u.role === 'admin' || Number(u.cashier) === 1);
    // A146: `sees` travels with the name — it is what the recipient step filters
    // on, and dropping it here would silently make every cashier look eligible
    // for confidential money.
    }).map(function (u) { return { username: u.username, name: u.name, sees: String(u.sees || '') }; });
    if (rosterCashiers.length) {
      availP.then(function (a) { begin(others(rosterCashiers), a); });
    } else if (navigator.onLine && Sync.configured()) {
      Auth.call('cashiers', { token: Auth.token() })
        .then(function (resp) { return availP.then(function (a) { begin(others(resp.cashiers), a); }); })
        .catch(function () { availP.then(function (a) { begin(null, a); }); });
    } else {
      availP.then(function (a) { begin(null, a); });
    }
  }
  function dailyFlow(type, sector) {
    return {
      resume: { fn: 'daily', type: type, sector: sector || 'puja', label: t('type_' + type) },
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
          sector: type === 'ticket' ? 'program' : (sector || 'puja'), // A148/A149/A153

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
  // Puja expense (cashier/admin): pick an admin-defined subject; multiple
  // cashiers may part-pay the same subject. "Other" forces a comment.
  //
  // NO "which pot did this come out of?" question. It used to ask, and that
  // contradicted the decision made for the handover screen (v3.89.0): a
  // cashier holds money pooled from many people, so naming a category for it
  // is guesswork dressed as precision. The same reasoning applies to spending
  // it. A general puja expense is filed under `other` — a stable named pot
  // that can go negative, which is exactly Hrishi's rule that expenses come
  // out of what you collected and a minus is the exceptional case.
  //
  // A COLLECTION expense is different and still carries its category: whoever
  // is running a road round knows the money came from that round, so
  // collectionExpenseFlow sets srcCat itself without asking anybody.
  function expenseFlow(subjects, duties, sector) {
    // A153: the ভাঁড়ার is no longer ASKED at all — it comes from the tab this
    // flow was started in, so the subject list is narrowed by a fact rather than
    // by an answer. A152 got here by reordering the questions; the tab removed
    // the question instead, which is better: one fewer thing to get wrong, on
    // every expense, for ever.
    //
    // A subject with no ভাঁড়ার belongs to BOTH, so every subject that exists
    // today stays available to every expense — nothing to migrate.
    const forSector = function (sec) {
      const list = (subjects || []).filter(function (x) {
        const xs = String(x.sector || '');
        return !xs || xs === (sec || 'puja');
      });
      return list.map(function (x) { return { v: x.name, label: x.name }; })
        .concat([{ v: OTHER_SUBJECT, labelKey: 'subject_other' }]);
    };
    // A152 (fixing A151): paying an instalment against a দায়. The list was
    // already being passed in and the flow ignored it — so no expense ever
    // carried a commitmentId, every promise stayed at "paid ₹0", and the দায়
    // could never come down. The pins were built from hand-written rows that
    // already had the id, so they never noticed the flow could not produce one.
    const openDuties = (duties || []).filter(function (d) { return d.owed > 0; });
    return {
      title: t('expense'),
      resume: { fn: 'expense', label: t('expense') },
      steps: [
        { key: 'subject', qKey: 'q_subject', kind: 'choice',
          options: forSector(sector) },
        { key: 'commitmentId', qKey: 'q_duty_against', kind: 'choice',
          optionsFn: function (a) {
            return openDuties.filter(function (d) { return d.sector === (sector || 'puja'); })
              .map(function (d) { return { v: d.id, label: d.payee + ' — ' + fmtMoney(d.owed) }; })
              .concat([{ v: '', labelKey: 'duty_against_none' }]);
          },
          showIf: function (a) {
            return openDuties.some(function (d) { return d.sector === (sector || 'puja'); });
          } },
      ].concat(moneySteps(false), [
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
          commitmentId: a.commitmentId || '', // A152: an instalment against a দায়
          // A148: which ভাঁড়ার paid for it. (A149's ticket clause belongs to the
          // DAILY flow, which has a `type`; a copy of it landed here, where
          // `type` is not in scope — so every general খরচ threw ReferenceError
          // at save. Shipped in v4.40.0, found while writing A151.)
          sector: a.sector || 'puja',
          amount: m.total, cashAmount: m.cash, upiAmount: m.upi,
          srcCat: 'other', // pooled money has no honest category — see above
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
  // A153: is the 🎭 tab open to this person? Two conditions, and both matter —
  // the committee must actually be running a programme, and this person must be
  // on it. Either missing and the tab does not exist for them at all.
  function programTabOn() {
    return programOn() && (Auth.isAdmin() || canEntry('progteam') ||
      Aggregate.permAllowed(Auth.current(), 'progteam'));
  }
  // Which section of the 🎭 tab is open. Module state, so moving between
  // sections and coming back lands where you left.
  let progSection = 'entry';
  let progDueOnly = false, progQuery = '';
  // A153: the programme's money powers — spending it, promising it, moving it
  // between funds. Its own grant, separate from the puja cashier's, so running
  // the programme's purse does not hand somebody the committee's.
  function canProgMoney() {
    return !frozen() && Auth.schemaCmp() !== -1 &&
      (Auth.isAdmin() || Aggregate.permAllowed(Auth.current(), 'progmoney'));
  }
  const EPS_UI = 0.005;
  // A151: record a দায় — money promised, not yet paid. Cashier/admin only.
  //
  // It writes an `expenses` row with source 'commitment', which activeData
  // splits off before any total sees it: promising money is not spending it.
  // The advance and every later instalment are ORDINARY expense rows carrying
  // `commitmentId`, so they count as real spending exactly as they should, and
  // only the unpaid remainder shows as দায়.
  function dutyFlow(sector) {
    return {
      title: t('duty_add'),
      steps: [
        { key: 'payee', qKey: 'q_duty_payee', kind: 'text' },
        { key: 'committed', qKey: 'q_duty_amount', kind: 'amount' },
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ],
      save: function (a) {
        const c = Number(a.committed) || 0;
        if (c <= 0) return Promise.reject(new Error('zero'));
        const row = DB.newRow({
          source: 'commitment', payee: String(a.payee || '').trim(),
          committed: c, sector: sector || 'puja',
          // a commitment moves no money, so it carries none — the advance is a
          // separate, ordinary expense row
          amount: 0, cashAmount: 0, upiAmount: 0,
          subject: '', desc: a.note || '', srcCat: '', collectionType: '',
          spentBy: Settings.get('collectorName'), date: todayISO(),
        });
        return DB.put('expenses', row).then(function () {
          return { undo: [{ store: 'expenses', id: row.id }], after: { buttons: [
            { label: t('done_for_now'), action: function () { navigate('report'); } },
          ] } };
        });
      },
    };
  }
  // A150: move money between the two ভাঁড়ার — the puja fund covering an
  // অনুষ্ঠান shortfall. Cashier/admin only, and the server checks the same.
  //
  // It is written as an `expenses` row with source 'transfer', which needs no
  // new store and so no schema bump — but Aggregate.activeData splits those rows
  // off before any total sees them, so it never counts as a spend. The money has
  // not left the committee; it has only changed pocket on paper.
  function transferFlow() {
    return {
      title: t('transfer_title'),
      steps: [
        { key: 'to', qKey: 'q_transfer_to', kind: 'choice',
          options: [{ v: 'program', labelKey: 'sector_program' }, { v: 'puja', labelKey: 'sector_puja' }] },
        { key: 'amount', qKey: 'q_transfer_amount', kind: 'amount' },
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ],
      save: function (a) {
        const amt = Number(a.amount) || 0;
        if (amt <= 0) return Promise.reject(new Error('zero'));
        const to = a.to === 'program' ? 'program' : 'puja';
        const row = DB.newRow({
          source: 'transfer', sector: to === 'program' ? 'puja' : 'program', transferTo: to,
          subject: '', desc: a.note || '', date: todayISO(),
          amount: amt, cashAmount: 0, upiAmount: 0,
          srcCat: '', collectionType: '', spentBy: Settings.get('collectorName'),
        });
        return DB.put('expenses', row).then(function () {
          return { undo: [{ store: 'expenses', id: row.id }], after: { buttons: [
            { label: t('done_for_now'), action: function () { navigate('report'); } },
          ] } };
        });
      },
    };
  }
  function startExpense(edit, sector) {
    // no myAvailable() here any more — the flow stopped asking which pot the
    // money came from, so there is nothing to compute before opening it
    //
    // A152: the open দায় list is AWAITED, not fired off alongside. The first
    // version kicked viewData() off and built the step list on the next line —
    // so `duties` was always empty, the "কোন দায়ের টাকা?" step never appeared,
    // and a promise could still never be paid down. Comment claimed it was read
    // first; the code did not. Found by driving it, one release after the same
    // feature shipped with the list ignored entirely.
    let duties = [];
    const go = function (subjects) {
      const def = expenseFlow(subjects, duties, sector || 'puja');
      if (edit) {
        def.presets = edit.presets; def.editing = edit.editing;
        def.title = t('edit_title') + ' — ' + def.title; def.returnTo = 'entries';
      }
      startFlow(def);
    };
    // A118b: the subject list is CACHED, so the flow opens at once instead of
    // standing 1–3 s on a listSubjects round trip (live-server latency). The
    // background refresh updates the cache for the NEXT open — one open stale
    // at most, on a list the admin edits a few times a season. A phone that
    // has never had the list still takes the round trip once.
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem('ck_subjects') || 'null'); } catch (e) {}
    const refresh = function (after) {
      if (!(navigator.onLine && Sync.configured() && Auth.loggedIn())) { if (after) after(null); return; }
      Auth.call('listSubjects', { token: Auth.token() })
        .then(function (r) {
          const subs = r.subjects || [];
          try { localStorage.setItem('ck_subjects', JSON.stringify(subs)); } catch (e) {}
          if (after) after(subs);
        }).catch(function () { if (after) after(null); });
    };
    // viewData() is local (IndexedDB + the cached snapshot), so this resolves in
    // a tick — it does not put the round-trip back that A118b removed.
    const withDuties = function (fn) {
      return viewData().then(function (d) { duties = Aggregate.commitmentRows(d); })
        .catch(function () {}).then(fn);
    };
    if (cached && cached.length) { withDuties(function () { go(cached); }); refresh(null); }
    else refresh(function (subs) { withDuties(function () { go(subs); }); });
  }
  // Collector's own spend while collecting — free text, no subject.
  function collectionExpenseFlow(collectionType) {
    return {
      resume: { fn: 'collExpense', collectionType: collectionType, label: t('coll_expense') },
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
  // Which home tiles have unfinished work. Reads only what the app already
  // knows: the notification counts the poll keeps fresh, and the local snapshot.
  // Module level so a handler can never reach for it out of scope (the freshThen
  // lesson), and pure — it returns a map, it does not touch the DOM.
  let dotState = {};
  function pendingDots() { return dotState; }
  function refreshDots() {
    const u = Auth.current(); if (!u) { dotState = {}; return Promise.resolve(); }
    const d = {};
    if (notifCounts.handovers > 0) d.cashier = 1;
    if (notifCounts.corrections > 0) d.review = 1;
    if (notifCounts.rejections > 0) d.handover = 1;   // mine came back — resend or talk
    return viewData().then(function (data) {
      const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
      // my own flagged rows: only the author can correct them, so this dot is
      // addressed to exactly the person looking at it
      const mineFlagged = (data.corrections || []).filter(function (c) {
        return c.status !== 'rejected' && String(c.collectorId || c.collector || '') === String(ident);
      });
      if (mineFlagged.length) d.entries = 1;
      if (Auth.isCashier()) {
        const r = Aggregate.reconcile(data, reconcileRules());
      // A117: drop what this device already answered — see stampedAnswers
      r.anomalies = r.anomalies.filter(function (a) { return !anomalyAnswered(a); });
        if (!r.balanced || r.anomalies.length) d.anomalies = 1;
      }
        dotState = d;
      return d;
    }).catch(function () { dotState = d; return d; });
  }
  // Refresh the dot map, and repaint home only if what is ON SCREEN is now wrong.
  //
  // The first cut compared against a snapshot taken BEFORE the async work, and
  // called itself from renderHome. Two overlapping calls then both saw a stale
  // "before", both repainted, and each repaint started another pair — a render
  // storm that makes the screen flash and swallows taps. Two guards, and the
  // shape matters more than either:
  //   dotsDrawn   what the CURRENT screen was painted with — the only honest
  //               thing to compare a fresh result against
  //   dotsBusy    one refresh at a time; overlapping ones cannot each conclude
  //               "it changed" from the same stale starting point
  // renderHome no longer calls this at all, so the renderer can never re-enter
  // itself. Dots refresh when their SOURCE changes (the notification payload)
  // and when you arrive at home — never as a side effect of drawing.
  let dotsDrawn = '', dotsBusy = false;
  function syncDots() {
    if (dotsBusy) return;
    dotsBusy = true;
    refreshDots().then(function () {
      dotsBusy = false;
      if (JSON.stringify(dotState) !== dotsDrawn && !flowState && current.view === 'home') renderHome();
    }).catch(function () { dotsBusy = false; });
  }
  function renderHome() {
    // A104: viewData(), not DB.allData(). The comment under `inHandNow` says
    // home "cannot disagree with the report" because both call myAvailable —
    // but they were not called on the same book. The report reads the merged
    // view (central snapshot + this device's unsynced rows); home read this
    // device's IndexedDB alone.
    //
    // On a phone that has always been used normally those are the same rows, so
    // nothing showed. They come apart the moment IndexedDB is empty while the
    // central book is not — a replacement phone, a reinstalled PWA, or the
    // epoch wipe, which A92 performs on 🚀 Go Live AND on a restore. Measured
    // on one device at one moment: home said ₹0 and রিপোর্ট said ₹3,800, under
    // the same words, "এখন আমার হিসাবে আছে".
    //
    // 34 screens already read viewData(); the three other DB.allData() callers
    // want local-only on purpose (viewData itself, "এই মোবাইলের হিসাব", and the
    // backup export). Home was the one that did not mean to.
    viewData().then(function (data) {
      const today = todayISO();
      const meId = Settings.get('collectorUsername') || Settings.get('collectorName');
      const myToday = data.payments.concat(data.daily).filter(function (r) {
        return (r.collectorId || r.collector) === meId &&
          (Aggregate.dayOf(r.date) === today || Aggregate.dayOf(r.createdAt) === today);
      }).reduce(function (a, r) { return a + Number(r.amount || 0); }, 0);
      // Aggregate.homeTiles decides WHAT appears (pure, and pinned by tests);
      // this only decides how each one is drawn. Keeping the decision out of
      // the markup is why "one permission brings the default screens back" can
      // be asserted rather than eyeballed.
      // A36: two things the plan cannot know by itself — whether this person is
      // holding cash right now (so 🤝 জমা দিলাম must survive a cleared grant),
      // and whether this phone is behind the server (no new entries until it
      // updates, per Hrishi).
      const avail = Aggregate.myAvailable(data, meId);
      const plan = Aggregate.homeTiles(Auth.current(), {
        holding: (avail.cash + avail.upi) > 0,
        staleVersion: Auth.schemaCmp() === -1,
        frozen: frozen(), // A110: admin paused entries for everyone
      });
      const ICON = { shop: ['🏪', 'new_shop'], person: ['🙍', 'new_person'], member: ['🤝', 'new_member'],
                     sponsor: ['🎪', 'new_sponsor'], gupt: ['🤫', 'new_gupt'],
                     bus: ['🚌', 'daily_bus'], road: ['🛣️', 'daily_road'], toto: ['🛺', 'daily_toto'],
                     ticket: ['🎟️', 'daily_ticket'],
                     expense: ['🧾', 'expense'], cashier: ['💰', 'confirm_handover'],
                     review: ['🛠️', 'review_title'], handover: ['', 'handover'], hbook: ['📗', 'hb_title'],
                     anomalies: ['🩺', 'anom_title'],
                     memberadmin: ['🎖️', 'member_admin_title'] };
      // 🔴 A dot means "there is something HERE you can finish". Every source
      // below is already computed elsewhere — no new counting, no new polling.
      //
      // The rule, learned the hard way twice today (A19's ghost toast, A23's
      // blind counter): a marker that cannot be cleared teaches people to stop
      // looking. So `pendingDots` only ever lights a tile whose screen has the
      // action that clears it, and each one goes out on its own:
      //   cashier    parcels waiting for পেয়েছি / পাইনি
      //   review     correction flags waiting for a decision
      //   anomalies  reconcile findings (admin/cashier), incl. duplicates
      //   handover   MY parcels that came back refused — I must resend or talk
      //   entries    my own flagged rows, which only I can correct
      const dots = pendingDots();
      dotsDrawn = JSON.stringify(dots); // what this paint is showing
      // one marker helper for EVERY tile, however it is built — the ✏️ and 💰
      // tiles are hand-rolled (wide, custom label) and silently missed the dot
      // when only drawTile knew about it.
      const dotMark = function (k) {
        return dots[k] ? '<i class="tile-dot" title="' + esc(t('pending_here')) + '"></i>' : '';
      };
      const drawTile = function (k) {
        const d = ICON[k] || ['', k];
        return '<button class="tile" data-go="' + k + '">' +
          (d[0] ? d[0] + ' ' : '') + esc(t(d[1])) + dotMark(k) + '</button>';
      };
      const partyTiles = plan.entry.map(drawTile).join('');
      const dailyTiles = plan.daily.map(drawTile).join('');
      // চাঁদা নেওয়া is common: a later instalment may reach whoever is nearest,
      // no matter who first wrote the donor down.
      const paymentTile = plan.common.indexOf('payments') >= 0
        ? '<div class="grid one"><button class="tile wide" data-go="list">💰 ' + esc(t('add_payment')) + ' / ' + esc(t('dues_only')) + '</button></div>' : '';
      const cashTiles =
        plan.common.filter(function (k) { return k !== 'payments'; }).map(drawTile).join('') +
        plan.role.map(drawTile).join('');
      // NOTHING GRANTED → nothing to show but how to get unstuck. Hrishi's rule,
      // and it holds for cashiers too: somebody who collects nothing has no
      // money to hand over and no book to read. Chat stays open — that is the
      // one thing everybody has — but the real fix is a phone call, so the
      // admin's number is right here.
      if (!plan.setUp || plan.exiting) {
        const paintCard = function () {
          $view().innerHTML =
            '<div id="notif-banner"></div>' +
            '<div class="hero"><div>🙏 ' + esc(pujaName()) + ' ' + Settings.get('year') + '</div>' +
            '<div class="hero-sub">' + esc(Settings.get('collectorName')) + '</div></div>' +
            (plan.blocked ? staleVersionCard() : plan.frozen ? frozenCard() : plan.exiting ? exitingCard() : noGrantCard()) +
            // …and if there is money in hand, the way to hand it in comes with
            // it. 💰 চাঁদা নেওয়া has its own wide tile above — ICON has no
            // 'payments' entry, so drawTile would render the bare key, which is
            // what a stood-down member first saw.
            paymentTile +
            (cashTiles ? '<div class="grid" style="margin-top:10px">' + cashTiles + '</div>' : '');
          renderNotifBanner();
          wireNav();
          const vf = document.getElementById('ver-fix-card');
          if (vf) vf.onclick = function () { runUpdate(vf); };
        };
        paintCard();
        // the card's whole point is the admin's name and number, and those come
        // from the cashiers list — fetch it if this device has never had it
        if (!msgUserCache && navigator.onLine && Sync.configured() && Auth.loggedIn()) {
          Auth.call('cashiers', { token: Auth.token() })
            .then(function (r) { msgUserCache = r.cashiers || []; if (current.view === 'home') paintCard(); })
            .catch(function () {});
        }
        return;
      }
      // A64 (audit 2.12): home showed only আজ আমার তোলা — a SEASON clock that
      // never goes down. The number a collector is actually asked for, by the
      // cashier and by their own conscience, is "how much of it is still on
      // you", and that was one tab away behind 📊 রিপোর্ট.
      //
      // myAvailable is the same figure inHandRows and the central report use
      // (money-model: personalSummary.inHand === myAvailable.total), so home
      // cannot disagree with the report — which is the only reason it is safe
      // to put a money figure on a screen this often re-rendered.
      //
      // Tappable, because a bare number invites "made of what?" — and আমার
      // হিসাব is exactly the screen that answers it. Not a button when it is
      // zero: nothing to explain, and a tap that leads to an empty breakdown
      // is how people learn the figure is decorative.
      const inHandNow = (avail.cash + avail.upi);
      const holdLine = inHandNow > 0
        ? '<button class="hero-hold" data-go="report">' + esc(t('sum_hero')) + ': <b>' + fmtMoney(inHandNow) + '</b> ›</button>'
        : '<div class="hero-sub">' + esc(t('sum_hero')) + ': <b>' + fmtMoney(0) + '</b></div>';
      $view().innerHTML =
        '<div id="notif-banner"></div>' +
        '<div class="hero"><div>🙏 ' + esc(pujaName()) + ' ' + Settings.get('year') + '</div>' +
        '<div class="hero-sub">' + esc(Settings.get('collectorName')) + ' • ' + esc(t('my_today')) + ': <b>' + fmtMoney(myToday) + '</b></div>' +
        holdLine + '</div>' +
        targetBar(data) +
        (partyTiles ? '<div class="section">' + esc(t('new_entry')) + '</div><div class="grid">' + partyTiles + '</div>' : '') +
        (dailyTiles ? '<div class="section">' + esc(t('today_daily')) + '</div><div class="grid">' + dailyTiles + '</div>' : '') +
        paymentTile +
        (cashTiles ? '<div class="grid" style="margin-top:10px">' + cashTiles + '</div>' : '') +
        '<div class="grid one" style="margin-top:10px"><button class="tile wide" data-go="entries">✏️ ' +
          esc(t('my_entries_title')) + dotMark('entries') + '</button></div>';
      wireNav();
      renderNotifBanner();   // show cached counts immediately
      if (!notifViaPull) checkNotifications();  // old backend only; pull refreshes otherwise
    });
  }

  // Has this person been set up at all? One answer, used by every screen, so
  // the ledger and the reports cannot disagree with the home screen about
  // whether somebody is ready to work.
  // A36: being behind the server and being granted nothing are different walls
  // with different fixes. Saying "ask the admin" to somebody who only needs to
  // tap update would send them down a road that cannot help them.
  function staleVersionCard() {
    return '<div class="card" style="border:1.5px solid #c0392b;background:#fdecea">' +
      '<b>🔴 ' + esc(t('ver_blocked_title')) + '</b>' +
      '<div class="row-sub" style="margin-top:4px">' +
        esc(t('ver_blocked_body').replace('{mine}', Auth.APP_VERSION).replace('{srv}', Auth.serverVersion())) +
      '</div>' +
      '<button id="ver-fix-card" class="primary big block" style="margin-top:8px">' +
        esc(t('ver_fix_btn')) + '</button></div>';
  }
  // A79: "কত হল, আর কত বাকি" — the one question a committee asks every evening,
  // and the app could not answer it without opening a report.
  //
  // Gated on the `overview` report, deliberately. The season total is behind
  // that grant today, and putting a bar on every home screen would hand it to
  // everyone through a side door — a permission model with one unguarded
  // window is not a permission model. Widening it is a policy decision and a
  // one-word change; making it silently is not mine to make.
  //
  // No target set → nothing is drawn. A committee that has not agreed a number
  // must not be shown one, and a bar against a made-up denominator is worse
  // than no bar.
  function targetBar(data) {
    const target = Number((centralConfig || {}).target_amount) || 0;
    if (!target || Aggregate.allowedReports(Auth.current()).indexOf('overview') < 0) return '';
    const got = Aggregate.computeTotals(data).totalCollection;
    const pct = Math.max(0, Math.min(100, Math.round(got / target * 100)));
    const left = target - got;
    return '<div class="card" style="padding:12px 14px">' +
      '<div class="row" style="cursor:default;padding:0"><div style="flex:1"><b>🎯 ' + esc(t('target_title')) + '</b></div>' +
        '<div class="row-sub">' + esc(toBengaliDigits(String(pct))) + '%</div></div>' +
      '<div style="height:10px;border-radius:5px;background:#eee;overflow:hidden;margin:8px 0 6px">' +
        '<div style="height:100%;width:' + pct + '%;background:' + (pct >= 100 ? '#2e7d32' : '#d9a441') + '"></div></div>' +
      '<div class="row-sub">' + fmtMoney(got) + ' / ' + fmtMoney(target) +
        (left > 0 ? ' · ' + esc(t('target_left')).replace('{amt}', fmtMoney(left))
                  : ' · ' + esc(t('target_done'))) + '</div></div>';
  }
  // A78: what a stood-down member sees instead of "ask the admin for
  // permissions". They must not be sent to argue about a decision the committee
  // already took — and they must be told the one thing that is still theirs to
  // do, which is hand in what they are holding.
  function frozenCard() {
    return '<div class="card" style="border:1.5px solid #c0392b;background:#fdecea">' +
      '<b>' + esc(t('freeze_bar')) + '</b>' +
      '<div class="row-sub" style="margin-top:4px">' + esc(t('freeze_bar_sub')) + '</div>' +
      adminContactHTML() + '</div>';
  }
  function exitingCard() {
    return '<div class="card" style="border:1.5px solid #d9a441;background:#fff8e8">' +
      '<b>🚪 ' + esc(t('home_exiting_title')) + '</b>' +
      '<div class="row-sub" style="margin-top:4px">' + esc(t('home_exiting_body')) + '</div>' +
      adminContactHTML() + '</div>';
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
    const fromList = (msgUserCache || []).filter(function (u) { return u.role === 'admin'; })[0];
    if (fromList) { // remember for offline — the card must work with no signal too
      Settings.set('adminName', fromList.name || '');
      Settings.set('adminPhone', fromList.phone || '');
    }
    const a = fromList || { name: Settings.get('adminName') || '', phone: Settings.get('adminPhone') || '' };
    if (!a.name && !a.phone) return '';
    const wa = waNumber(a.phone);
    const digits = cleanPhoneIN(a.phone);
    return '<div class="row-sub" style="margin-top:10px"><b>' + esc(a.name || '') + '</b>' +
      (a.phone ? ' · 📞 ' + esc(a.phone) : '') + '</div>' +
      (digits ? '<div class="chips" style="margin-top:6px">' +
        '<a class="chip" href="tel:' + esc(digits) + '">' + esc(t('home_call_admin')) + '</a>' +
        // no WhatsApp chip when the number cannot make one — a dead link that
        // opens an empty chat is worse than no button
        (wa ? '<a class="chip" href="https://wa.me/' + esc(wa) + '" target="_blank" rel="noopener">' + esc(t('home_wa_admin')) + '</a>' : '') +
        '</div>' : '');
  }

  // Every data-go button behaves the same wherever it appears, so a screen that
  // wants to offer a tile does not have to re-implement the routing.
  // Open the form NOW; refresh the master lists behind it.
  //
  // Lives HERE, next to its only caller. It used to sit inside renderHome's
  // callback, and when the data-go handler was lifted out into wireNav() the
  // definition stayed behind — so every দোকান/ব্যক্তি/সদস্য tap threw
  // "freshThen is not defined" and did nothing at all. Tapping a dead button
  // twice is what "the buttons are slow" actually was.
  //
  // It also no longer waits: the old form raced Lists.refresh() against a 1.5s
  // timeout, and since an Apps Script round trip is 3–5s the timeout always
  // won — a second and a half of nothing before the form appeared. The wait
  // bought nothing, because the area and location steps read their options
  // through optionsFn when the user REACHES them, several taps later.
  function freshThen(fn) { Lists.refresh().catch(function () {}); fn(); }
  function wireNav() {
    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.onclick = function () {
        const g = b.dataset.go;
        // 🤝 সদস্য is a COLLECTION screen, not a registration form: pick a
        // committee member from the register and record what they gave.
        // Registering the member is a different job with a different
        // permission (memberadmin) — see renderMemberAdmin.
        if (g === 'member') freshThen(function () { navigate('memberpay'); });
        else if (g === 'shop' || g === 'person' || g === 'sponsor' || g === 'gupt') freshThen(function () { startFlow(newPartyFlow(g)); });
        else if (g === 'road' || g === 'toto' || g === 'bus' || g === 'ticket') startFlow(dailyFlow(g));
        else if (g === 'expense') startExpense();
        else if (g === 'handover') startHandover();
        else navigate(g);
      };
    });
  }

  let listFilter = 'all', listQuery = '';
  let findParties = [], findQuery = '';
  // A153: the অনুষ্ঠান tab — everything about the programme in one place, and
  // nothing about it anywhere else.
  //
  // The point of the tab is what it REMOVES. Every entry started here is
  // programme money because of WHERE IT WAS STARTED, so no flow asks "কোন
  // ভাঁড়ার?" any more — a question twelve collectors had to answer on every
  // entry, and could answer wrongly, about a distinction that was never theirs
  // to think about. Standing somewhere IS an answer.
  function renderProgram() {
    const sec = progSection;
    const chip = function (k, label) {
      return '<button class="chip' + (sec === k ? ' on' : '') + '" data-prog="' + k + '">' +
        esc(label) + '</button>';
    };
    const head = '<div class="zone-hd">🎭 ' + esc(t('nav_program')) +
        '<span class="who">' + esc(t('program_tab_sub')) + '</span></div>' +
      '<div class="chips">' + chip('entry', t('prog_sec_entry')) +
        chip('list', t('prog_sec_list')) + chip('report', t('prog_sec_report')) + '</div>';
    $view().innerHTML = '<div class="zone all">' + head + '<div id="prog-body">' +
      '<div class="empty">' + esc(t('loading')) + '</div></div></div>';
    document.querySelectorAll('[data-prog]').forEach(function (b) {
      b.onclick = function () { progSection = b.dataset.prog; renderProgram(); };
    });
    viewData().then(function (all) {
      const d = Aggregate.ofSector(all, 'program');
      const box = document.getElementById('prog-body');
      if (!box) return; // moved on while this resolved
      if (sec === 'entry') { box.innerHTML = progEntryHTML(); wireProgEntry(); }
      else if (sec === 'list') { box.innerHTML = progListHTML(d); wireProgList(); }
      else {
        // A156: the same 📄 PDF button every other report has. This is the one
        // account a committee prints for the meeting; leaving it off made the
        // programme's book the only one that could not be put on paper.
        box.innerHTML = reportProgramHTML(Aggregate.computeReport('program', all)) +
          '<button id="prog-pdf" class="ghost big block">📄 ' + esc(t('report_pdf_btn')) + '</button>';
        wireProgReport();
        const pb = document.getElementById('prog-pdf');
        if (pb) pb.onclick = function () { printReport('program'); };
      }
    }).catch(function () {
      const box = document.getElementById('prog-body');
      if (box) box.innerHTML = '<div class="empty">' + esc(t('needs_net')) + '</div>';
    });
  }
  // The tiles, permission-shaped exactly like the home screen's.
  function progEntryHTML() {
    const tile = function (go, icon, key) {
      return '<button class="tile" data-pgo="' + go + '">' + icon + ' ' + esc(t(key)) + '</button>';
    };
    let h = '';
    if (canEntry('ticket')) h += tile('ticket', '🎟️', 'daily_ticket');
    if (canEntry('progdonor')) h += tile('person', '🙍', 'prog_donor') + tile('sponsor', '🎪', 'new_sponsor');
    if (canProgMoney()) h += tile('expense', '🧾', 'expense') + tile('duty', '🤝', 'duty_add') +
      tile('transfer', '🔁', 'transfer_title');
    // `grid` is the home screen's own two-column tile layout — reused rather
    // than invented, so the tab feels like the app and not a bolted-on room
    return h ? '<div class="grid">' + h + '</div>'
      : '<div class="empty">' + esc(t('prog_no_grants')) + '</div>';
  }
  function wireProgEntry() {
    document.querySelectorAll('[data-pgo]').forEach(function (b) {
      b.onclick = function () {
        const g = b.dataset.pgo;
        // every one of these carries 'program' as its FUND — from the tab, never
        // from a question
        if (g === 'ticket') startFlow(dailyFlow('ticket', 'program'));
        else if (g === 'person' || g === 'sponsor') freshThen(function () { startFlow(newPartyFlow(g, {}, 'program')); });
        else if (g === 'expense') startExpense(null, 'program');
        else if (g === 'duty') startFlow(dutyFlow('program'));
        else if (g === 'transfer') startFlow(transferFlow());
      };
    });
  }
  // the programme's own খাতা — its donors, its dues, nothing from the puja book
  function progListHTML(d) {
    const paid = {};
    (d.payments || []).forEach(function (p) { paid[p.partyId] = (paid[p.partyId] || 0) + (Number(p.amount) || 0); });
    const all = (d.parties || []).slice().sort(function (a, b) {
      return (paid[b.id] || 0) - (paid[a.id] || 0);
    });
    if (!all.length) return '<div class="empty">' + esc(t('prog_no_donors')) + '</div>';
    // A156: the three things the puja's খাতা has had all season and this one did
    // not — a total, a way to see only who still owes, and a search once the
    // list is long enough to need one. A ledger with no total is a ledger you
    // cannot check.
    const totalPaid = all.reduce(function (a, p) { return a + (paid[p.id] || 0); }, 0);
    const totalDue = all.reduce(function (a, p) {
      return a + Math.max(0, (Number(p.pledged) || 0) - (paid[p.id] || 0));
    }, 0);
    let shown = all;
    if (progDueOnly) shown = shown.filter(function (p) { return (Number(p.pledged) || 0) - (paid[p.id] || 0) > EPS_UI; });
    if (progQuery) shown = shown.filter(function (p) { return matchWords(p.name || '', progQuery); });
    const head =
      '<div class="row" style="cursor:default"><div><b>' + esc(t('total')) + '</b>' +
        '<div class="row-sub">' + all.length + ' ' + esc(t('prog_donor')) + '</div></div>' +
        '<div class="row-right"><b>' + fmtMoney(totalPaid) + '</b>' +
        (totalDue > EPS_UI ? '<div class="row-sub red">' + esc(t('due')) + ' ' + fmtMoney(totalDue) + '</div>' : '') +
        '</div></div>' +
      (all.length >= 8 ? '<input id="prog-search" class="search" enterkeyhint="search" placeholder="' +
        esc(t('search_party_ph')) + '" value="' + esc(progQuery) + '">' : '') +
      '<div class="chips">' + dueChip(progDueOnly) + '</div>';
    if (!shown.length) return head + '<div class="empty">' + esc(t('search_none')) + '</div>';
    return head + shown.map(function (p) {
      const pd = paid[p.id] || 0, due = (Number(p.pledged) || 0) - pd;
      return '<div class="row" data-pid="' + esc(p.id) + '"><div><b>' + esc(p.name) + '</b>' +
        '<div class="row-sub">' + esc(t('type_' + p.type)) + '</div></div>' +
        '<div class="row-right">' + fmtMoney(pd) +
        (Number(p.pledged) ? '/' + fmtMoney(p.pledged) : '') +
        (due > EPS_UI ? '<div class="row-sub red">' + esc(t('due')) + ' ' + fmtMoney(due) + '</div>'
                      : '<div class="row-sub green">✅</div>') + '</div></div>';
    }).join('') + '<div class="hint" style="margin-top:10px">' + esc(t('prog_list_hint')) + '</div>';
  }
  function wireProgList() {
    document.querySelectorAll('[data-pid]').forEach(function (r) {
      r.onclick = function () { navigate('party', { id: r.dataset.pid, from: 'program' }); };
    });
    // scoped to the tab's own body, and matching what dueChip actually renders
    // (`data-duetoggle`) — the first pass looked for `data-due` and would have
    // shipped a toggle that does nothing, which is this project's oldest bug
    const due = document.querySelector('#prog-body [data-duetoggle]');
    if (due) due.onclick = function () { progDueOnly = !progDueOnly; renderProgram(); };
    const sb = document.getElementById('prog-search');
    if (sb) {
      sb.oninput = function () { progQuery = sb.value; renderProgram(); };
      // keep the caret where the finger left it — a re-render on every keystroke
      // otherwise sends it to the start, which is the search box that fights back
      setTimeout(function () {
        const el = document.getElementById('prog-search');
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }, 0);
    }
  }
  function wireProgReport() {
    const tb = document.getElementById('transfer-btn');
    if (tb) tb.onclick = function () { startFlow(transferFlow()); };
    const db2 = document.getElementById('duty-btn');
    if (db2) db2.onclick = function () { startFlow(dutyFlow('program')); };
  }
  function renderList() {
    // LOOKING is not DOING. Somebody who has been granted nothing can still
    // read the ledger — it is the committee's own book and they are on the
    // committee. What their grants control is what they can ENTER, which is
    // the home screen's tiles and the chips below.
    // reads the central snapshot (+ own rows) locally — instant, all-collector
    viewData().then(function (all) {
      // A154: the 📒 tab is the PUJA's book. The programme's donors live in the
      // 🎭 tab's own খাতা, and showing them here too would be the same donor in
      // two lists with two different meanings — the thing the tab exists to end.
      const data = Aggregate.ofSector(all, 'puja');
      drawList(data, Aggregate.computeTotals(data).paidByParty);
    });
  }
  // Bus collections belong in the ledger, not in the daily-rounds report: a bus
  // is a named donor with a receipt, exactly like a shop. Rows come from the
  // `daily` store (type 'bus'), so they need their own renderer.
  function busRow(r) {
    return '<div class="row" data-busid="' + esc(r.id) + '"><div><b>' + esc(r.busName || t('daily_bus')) + '</b>' +
      '<div class="row-sub">' + esc(r.busNumber || '') + (r.busNumber ? ' • ' : '') + esc(fmtDate(r.date || r.createdAt)) +
      (r.collector ? ' • ' + esc(r.collector) : '') + (r.receiptNo ? ' • 🧾 ' + esc(r.receiptNo) : '') + '</div></div>' +
      '<div class="row-right">' + fmtMoney(r.amount) + '</div></div>';
  }
  // A130: matchWords here too — bus rows were the one box still on a raw
  // substring, so "৭৩০১ মালদা" found nothing while every other screen taught
  // people that word order and extra words are free.
  function matchBus(r, query) { return matchWords([r.busName, r.busNumber, r.collector].join(' '), query); }
  function drawBusList(data) {
    const v = {}; (data.voids || []).forEach(function (x) { if (x.targetId) v[x.targetId] = 1; });
    let rows = (data.daily || []).filter(function (r) { return r.type === 'bus' && !v[r.id]; });
    if (listQuery) rows = rows.filter(function (r) { return matchBus(r, listQuery); });
    rows.sort(function (a, b) { return String(b.date || b.createdAt || '').localeCompare(String(a.date || a.createdAt || '')); });
    const total = rows.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
    return (rows.length ? '<div class="row" style="cursor:default"><div><b>' + esc(t('total')) +
        '</b><div class="row-sub">' + rows.length + ' ' + esc(t('daily_bus')) + '</div></div><b>' + fmtMoney(total) + '</b></div>' : '') +
      (rows.length ? rows.map(busRow).join('')
        : '<div class="empty">' + esc(t(listQuery ? 'search_none' : 'no_entries')) + '</div>');
  }
  // Category chips shared by the ledger and "দাতা খুঁজি" (someone else's donor),
  // so both screens read the same way. They mirror what this person may collect;
  // "সব" always shows, because a later instalment is common to everyone and you
  // must be able to look ANY donor up. `withBus` is off on find-party — you take
  // instalments from donors, and a bus pays once with a receipt.
  function typeChips(current, withBus) {
    const kinds = [['shop', t('type_shop')], ['person', t('type_person')], ['member', t('type_member')],
                   ['sponsor', t('type_sponsor')], ['gupt', t('type_gupt')]]
      .concat(withBus ? [['bus', t('daily_bus')]] : []);
    // A144: canSeeKind, not canEntry — a cashier holding only 'sponsorview'
    // writes no sponsors but is already being sent those rows, and a ledger with
    // no chip for them is a book you can hold but not open.
    const tabs = [['all', t('all')]].concat(kinds.filter(function (k) { return canSeeKind(k[0]); }));
    const valid = tabs.some(function (tb) { return tb[0] === current; }) ? current : 'all';
    // A87: buttons only. The row they sit in is built by filterBar(), because
    // the type filter and the "শুধু বাকি" toggle used to be two stacked .chips
    // blocks — three wrapped lines and 154px on a 320px phone, which is 59% of
    // the screen gone before the first donor appears.
    return { valid: valid, buttons: tabs.map(function (tb) {
      return '<button class="chip' + (valid === tb[0] ? ' on' : '') + '" data-f="' + tb[0] + '">' + esc(tb[1]) + '</button>';
    }).join('') };
  }
  // "শুধু বাকি" is a TOGGLE, not one more category — otherwise picking বাকি
  // threw away the category filter and every type came back mixed together.
  // Now দোকান + শুধু বাকি, ব্যক্তি + শুধু বাকি … all work.
  function dueChip(on) {
    return '<button class="chip' + (on ? ' on' : '') +
      '" data-duetoggle="1">' + (on ? '🔴 ' : '') + esc(t('dues_only')) + '</button>';
  }
  // A87: one line that scrolls sideways, instead of three that wrap. The tap
  // targets stay the size they were — it is the ROW that changes, not the
  // buttons — and on a small phone this hands ~100px back to the list, which is
  // the difference between two donors visible and four.
  function filterBar(buttons) {
    return '<div class="tabs-wrap"><div class="chips tabs">' + buttons + '</div>' +
      '<div class="tabs-more">›</div></div>';
  }
  // A130: the row has scrolled sideways since A87, but its only cue was an
  // 18px fade — trial verdict: "the tabs are going out of the screen", read as
  // broken, not scrollable. A visible › says "more this way", and goes away
  // when there is nothing left to the right (or nothing overflows at all).
  function wireTabsCue() {
    document.querySelectorAll('.tabs-wrap').forEach(function (w) {
      const row = w.querySelector('.chips.tabs'), cue = w.querySelector('.tabs-more');
      if (!row || !cue) return;
      const upd = function () {
        cue.style.opacity = (row.scrollWidth - row.clientWidth - row.scrollLeft) > 24 ? '' : '0';
      };
      row.addEventListener('scroll', upd, { passive: true });
      upd();
    });
  }
  let listDueOnly = false, findFilter = 'all', findDueOnly = false, listArea = '';
  function drawList(data, paidBy) {
      const chips = typeChips(listFilter, true);
      listFilter = chips.valid;
      const busRows = listFilter === 'bus';
      // A130 ("my screen, my data at first"): the ledger's order is (1) donors
      // this collector dealt with TODAY, (2) latest activity anywhere first,
      // (3) name. One pass over payments builds both maps per PAINT — putting
      // this inside buildBody would redo it on every keystroke.
      const meId = Settings.get('collectorUsername') || Settings.get('collectorName');
      const today = todayISO();
      const lastAct = {}, mineToday = {};
      liveParties(data).forEach(function (p) {
        lastAct[p.id] = Aggregate.dayOf(p.createdAt);
        if (lastAct[p.id] === today && (p.collectorId || p.collector) === meId) mineToday[p.id] = 1;
      });
      (data.payments || []).forEach(function (r) {
        if (!r.partyId) return;
        const d = Aggregate.dayOf(r.date) || Aggregate.dayOf(r.createdAt);
        if (d > (lastAct[r.partyId] || '')) lastAct[r.partyId] = d;
        if (d === today && (r.collectorId || r.collector) === meId) mineToday[r.partyId] = 1;
      });
      // A42: the search box lives OUTSIDE the part that gets redrawn.
      //
      // It used to call renderList() on every keystroke, which replaced the
      // whole screen — input included — so the caret vanished and on a phone the
      // keyboard closed after the first letter. Hiding rows in place (what the
      // admin filter does) is not right here: the bus tab shows a TOTAL over the
      // filtered rows, and a hidden row would still be counted. So the header
      // stays put and only #list-body is rebuilt: totals stay honest, and the
      // input is never touched.
      const buildBody = function () {
        let rows = liveParties(data).sort(function (a, b) {
          return (mineToday[b.id] || 0) - (mineToday[a.id] || 0) ||
                 String(lastAct[b.id] || '').localeCompare(String(lastAct[a.id] || '')) ||
                 (a.name || '').localeCompare(b.name || '');
        });
        if (listFilter !== 'all' && !busRows) rows = rows.filter(function (p) { return p.type === listFilter; });
        if (listArea && !busRows) rows = rows.filter(function (p) { return p.side === listArea; });
        if (listDueOnly) rows = rows.filter(function (p) { return (Number(p.pledged) || 0) - (paidBy[p.id] || 0) > 0; });
        if (listQuery) rows = rows.filter(function (p) { return matchParty(p, listQuery); });
        if (busRows) return drawBusList(data);
        // A130: a bus number typed on সবাই used to find NOTHING unless you
        // already knew the 🚌 tab existed — the hits ride below the donors.
        let busExtra = '';
        if (listQuery) {
          const v = {}; (data.voids || []).forEach(function (x) { if (x.targetId) v[x.targetId] = 1; });
          const hits = (data.daily || []).filter(function (r) {
            return r.type === 'bus' && !v[r.id] && matchBus(r, listQuery);
          });
          if (hits.length) busExtra = '<div class="section">' + esc(t('bus_hits')) + '</div>' + hits.map(busRow).join('');
        }
        if (!rows.length) {
          return busExtra ||
            '<div class="empty">' + esc(t(listQuery ? 'search_none' : 'no_entries')) + '</div>';
        }
        return rows.map(function (p) {
          const paid = paidBy[p.id] || 0, due = (Number(p.pledged) || 0) - paid;
          return '<div class="row" data-id="' + p.id + '">' +
            '<div><b>' + esc(p.name) + '</b><div class="row-sub">' +
            esc(t('type_' + p.type)) + (p.side ? ' • ' + esc(Lists.labelOf('area', p.side)) : '') +
            (p.location ? ' • ' + esc(Lists.labelOf('location', p.location)) : '') +
            (p.owner ? ' • ' + esc(p.owner) : '') + '</div></div>' +
            '<div class="row-right">' + fmtMoney(paid) + '/' + fmtMoney(p.pledged) +
            (due > 0 ? '<span class="due-chip">' + esc(t('due')) + ' ' + fmtMoney(due) + '</span>'
                     : '<span class="ok-chip">✅</span>') + '</div></div>';
        }).join('') + busExtra;
      };
      // A130: the box says WHAT it searches — "খোঁজো…" alone kept the phone/
      // owner/area powers a secret the whole trial.
      const areaSel = busRows ? '' :
        '<select id="area-f" class="chip">' +
          '<option value="">' + esc(t('all_areas')) + '</option>' +
          Lists.get('area').map(function (a) {
            return '<option value="' + esc(a.id) + '"' + (listArea === a.id ? ' selected' : '') + '>📍 ' +
              esc(Lists.labelOf('area', a.id)) + '</option>';
          }).join('') + '</select>';
      $view().innerHTML =
        (canEntry('otherdonor') ? '<button id="find-party" class="ghost big block">🔍 ' + esc(t('find_party_btn')) + '</button>' : '') +
        '<input id="search" class="search" enterkeyhint="search" placeholder="' +
          esc(t(busRows ? 'search_bus_ph' : 'search_party_ph')) + '" value="' + esc(listQuery) + '">' +
        filterBar(chips.buttons + (busRows ? '' : dueChip(listDueOnly)) + areaSel) +
        '<div id="list-body">' + buildBody() + '</div>';
      wireTabsCue();
      const af = document.getElementById('area-f');
      if (af) af.onchange = function () { listArea = af.value; renderList(); };
      const wireRows = function () {
        document.querySelectorAll('.row[data-id]').forEach(function (r) {
          r.onclick = function () { navigate('party', { id: r.dataset.id }); };
        });
        // a bus row opens its receipt — the same one the collector shared at entry
        document.querySelectorAll('.row[data-busid]').forEach(function (r) {
          r.onclick = function () { navigate('receipt', { store: 'daily', id: r.dataset.busid, back: 'list' }); };
        });
      };
      wireRows();
      const fpBtn = document.getElementById('find-party');
      if (fpBtn) fpBtn.onclick = function () { findQuery = ''; navigate('findparty'); };
      // A56: rebuild after the typing PAUSES, not on every letter. The body is
      // rebuilt from every party and each row asks Lists for two labels, so on a
      // cheap phone with a real book that was ~90 ms of work per keystroke —
      // enough to make the keyboard feel stuck. 120 ms is below noticing and
      // collapses a burst of typing into one rebuild.
      let searchTimer = null;
      document.getElementById('search').oninput = function (e) {
        listQuery = e.target.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () {
          const body = document.getElementById('list-body');
          if (!body) return;
          body.innerHTML = buildBody();
          wireRows();
        }, 120);
      };
      document.querySelectorAll('[data-f]').forEach(function (c) {
        c.onclick = function () { listFilter = c.dataset.f; renderList(); };
      });
      const dueBtn = document.querySelector('[data-duetoggle]');
      if (dueBtn) dueBtn.onclick = function () { listDueOnly = !listDueOnly; renderList(); };
  }
  // Find ANY party (created by any collector) and add a payment against its
  // balance — so a collector who receives a later installment can record it
  // even though they didn't create the party.
  // 🤝 সদস্য চাঁদা — the collection screen. Pick a registered committee member,
  // then the ordinary payment flow takes the money (cash/UPI) and the mandatory
  // comment. Nothing is created here: a member who is not on the register yet is
  // registered by whoever holds `memberadmin`, on their own screen.
  let memberQuery = '';
  function renderMemberPay() {
    if (!canEntry('member')) { navigate('home'); return; }
    $view().innerHTML = backBar('home') + '<div class="flow-title">🤝 ' + esc(t('member_pay_title')) + '</div>' +
      '<div class="hint" style="margin-bottom:8px">' + esc(t('member_pay_hint')) + guideDoor('register') + '</div>' +
      '<input id="mp-search" class="search" enterkeyhint="search" placeholder="' + esc(t('search_member_ph')) + '" value="' + esc(memberQuery) + '">' +
      '<div id="mp-results"><div class="empty">' + esc(t('loading')) + '</div></div>';
    const box = document.getElementById('mp-search');
    box.oninput = function (e) { memberQuery = e.target.value; wireGuideDoors();
    paintMembers(); };
    paintMembers();
  }
  function paintMembers() {
    const el = document.getElementById('mp-results'); if (!el) return;
    viewData().then(function (data) {
      const paidBy = Aggregate.computeTotals(data).paidByParty;
      const q = normText(memberQuery);
      const list = liveParties(data).filter(function (p) { return p.type === 'member'; })
        .filter(function (p) {
          // A103: the same rule as everywhere else — "শঙ্কর কোষাধ্যক্ষ" used to
          // find nobody, with both words on the row
          // A115: the post comes from the account, not the row.
          const pos = memberPost(p);
          return matchWords([p.name, p.phone,
            pos ? Lists.labelOf('position', pos) : ''].join(' '), q);
        })
        .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'bn'); });
      if (!el.isConnected) return;
      el.innerHTML = list.length ? list.map(function (m) {
        const bits = [];
        const pos = memberPost(m);
        if (pos) bits.push('🎖️ ' + Lists.labelOf('position', pos));
        if (m.phone) bits.push('📞 ' + m.phone);
        // A134: the SAME money language as the ledger row — this is the screen
        // where you ask for money, and it used to show one bare number that
        // never said whether it was paid, pledged or due. A member with no
        // pledge shows just the paid figure, not a fake /₹0.
        const paid = paidBy[m.id] || 0, pledged = Number(m.pledged) || 0, due = pledged - paid;
        return '<div class="row" data-mpay="' + esc(m.id) + '"><div><b>' + esc(m.name) + '</b>' +
          '<div class="row-sub">' + esc(bits.join(' · ')) + '</div></div>' +
          '<div class="row-right">' + fmtMoney(paid) + (pledged ? '/' + fmtMoney(pledged) : '') +
          (pledged ? (due > 0 ? '<span class="due-chip">' + esc(t('due')) + ' ' + fmtMoney(due) + '</span>'
                             : '<span class="ok-chip">✅</span>') : '') + '</div></div>';
      }).join('') : '<div class="empty">' + esc(t('member_none')) + '</div>';
      el.querySelectorAll('[data-mpay]').forEach(function (row) {
        row.onclick = function () {
          const m = list.filter(function (x) { return x.id === row.dataset.mpay; })[0];
          if (m) startFlow(paymentFlow(m, 'memberpay'));
        };
      });
    });
  }
  // 🎖️ কমিটির সদস্য register — its own screen and its own grant. Adding a
  // member, setting the post and linking the app account all live here, so the
  // collection screen stays a collection screen.
  //
  // A115: the account picker used to come from `listUsers`, which is admin-only
  // — and with an account now REQUIRED that would quietly have made this whole
  // screen admin-only, for a grant an admin is meant to be able to hand to
  // somebody who is not one. It reads the committee roster instead, which rides
  // on every pull and is therefore also there with no signal at all.
  function renderMemberAdmin() {
    if (!canEntry('memberadmin')) { navigate('home'); return; }
    // A115: reading the register offline is fine and useful — knowing who is on
    // the committee is exactly what somebody at the pandal wants. WRITING is
    // what needs the server, so the ➕ says so instead of opening a form whose
    // save can only fail.
    const off = !navigator.onLine || !Sync.configured();
    $view().innerHTML = backBar('home') + '<div class="flow-title">🎖️ ' + esc(t('member_admin_title')) + '</div>' +
      '<div class="hint" style="margin-bottom:8px">' + esc(t('member_admin_hint')) + guideDoor('register') + '</div>' +
      '<button id="ma-add" class="tile wide" style="margin-bottom:10px"' + (off ? ' disabled' : '') + '>➕ ' +
        esc(t('member_add')) + '</button>' +
      (off ? '<div class="perm-warn" style="display:block;margin-bottom:10px">' +
             esc(t('member_needs_online')) + '</div>' : '') +
      '<div id="ma-list"><div class="empty">' + esc(t('loading')) + '</div></div>';
    if (!off) document.getElementById('ma-add').onclick = function () { navigate('memberform', { id: '' }); };
    wireGuideDoors();
    paintMemberAdmin();
  }
  function paintMemberAdmin() {
    const el = document.getElementById('ma-list'); if (!el) return;
    viewData().then(function (data) {
      if (!el.isConnected) return;
      const list = liveParties(data).filter(function (p) { return p.type === 'member'; })
        .sort(function (a, b) { return String(a.name || '').localeCompare(String(b.name || ''), 'bn'); });
      // A115b: the total, on THIS screen, because the two audiences are not the
      // same people. 🩺 অসঙ্গতি is gated on `cashier`, and fixing one of these
      // needs `memberadmin` — an admin may hand out one without the other, and
      // then the person who can repair it never sees the count. Each row already
      // carries its own ⚠️; this is the number, so nobody has to scroll a
      // hundred names to learn there are three.
      const noAcct = list.filter(function (m) { return !String(m.appUser || ''); }).length;
      el.innerHTML = '<div class="section">' + esc(t('member_admin_count').replace('{n}', list.length)) + '</div>' +
        (noAcct ? '<div class="perm-warn" style="display:block;margin-bottom:10px">⚠️ ' +
                  esc(t('member_no_account_n').replace('{n}', noAcct)) + '</div>' : '') +
        (list.length ? list.map(function (m) {
          const bits = [];
          const pos = memberPost(m);
          if (pos) bits.push('🎖️ ' + Lists.labelOf('position', pos));
          if (m.phone) bits.push('📞 ' + m.phone);
          if (m.email) bits.push('✉️ ' + m.email);
          // A115: an account is required now. A row without one is a row from
          // before this rule, and it cannot be saved again until it gets one —
          // so it is flagged HERE, where the person who can fix it is looking,
          // rather than left to fail at the moment somebody tries to edit it.
          bits.push(m.appUser ? '👤 @' + m.appUser : '⚠️ ' + t('member_no_user'));
          return '<div class="row" style="cursor:default;flex-wrap:wrap"><div style="flex:1 1 60%"><b>' +
            esc(m.name) + '</b><div class="row-sub">' + esc(bits.join(' · ')) + '</div></div>' +
            '<div class="chips" style="margin:0">' +
              '<button class="chip" data-ma-edit="' + esc(m.id) + '">✏️ ' + esc(t('edit_btn')) + '</button>' +
            '</div></div>';
        }).join('') : '<div class="empty">' + esc(t('member_none_admin')) + '</div>');
      el.querySelectorAll('[data-ma-edit]').forEach(function (b) {
        b.onclick = function () { navigate('memberform', { id: b.dataset.maEdit }); };
      });
    });
  }
  // One form for BOTH registering and editing a committee member. It replaced a
  // guided flow plus a window.prompt that asked you to TYPE a number from a list
  // of users — Hrishi's own words: use a dropdown, and show me who I picked.
  //
  // Editing had no path at all before this: a post typed in wrong, or a member
  // who becomes সম্পাদক next year, was permanent. That mattered more once
  // reconcile started flagging over-full posts, because the 🩺 dot it lights had
  // nothing that could clear it — and a marker that cannot be cleared teaches
  // people to ignore markers.
  function renderMemberForm(params) {
    if (!canEntry('memberadmin')) { navigate('home'); return; }
    const id = (params && params.id) || '';
    // A115: this screen is ONLINE-ONLY now, and the reason is not squeamishness
    // about offline. Everything it writes is a permission question — who may
    // appoint whom — and a question a phone is allowed to answer for itself is
    // not a rule, it is a suggestion. The server refuses it either way; this is
    // the app saying so before somebody fills in a form that cannot be saved.
    //
    // 🤝 সদস্যের চাঁদা is untouched and still works with no signal at all:
    // taking money from a member already on the register writes a `payments`
    // row against a party that exists, and needs none of this.
    if (!navigator.onLine || !Sync.configured()) {
      $view().innerHTML = backBar('memberadmin') +
        '<div class="flow-title">🎖️ ' + esc(t('member_admin_title')) + '</div>' +
        '<div class="perm-warn" style="display:block">' + esc(t('member_needs_online')) + '</div>';
      wireNav();
      return;
    }
    $view().innerHTML = backBar('memberadmin') + '<div class="empty">' + esc(t('loading')) + '</div>';
    let members = [], form = null, memberLivePays = 0;
    viewData().then(function (data) {
      members = liveParties(data).filter(function (p) { return p.type === 'member'; });
      const v = Aggregate.voidedIds(data);
      memberLivePays = !id ? 0 : (data.payments || []).filter(function (x) { return x.partyId === id && !v[x.id]; }).length;
      const m = members.filter(function (p) { return p.id === id; })[0];
      if (id && !m) { navigate('memberadmin'); return; }
      // Nobody keeps their own committee record — checked here so the form is
      // never even drawn, and again on the server, where it is a rule.
      const me = Auth.current() || {};
      if (m && String(m.appUser || '').toLowerCase() === String(me.username || '').toLowerCase()) {
        $view().innerHTML = backBar('memberadmin') +
          '<div class="perm-warn" style="display:block">' + esc(t('member_self_note')) + '</div>';
        wireNav();
        return;
      }
      // A115: the post is READ from the account, never from the row.
      form = { name: (m && m.name) || '', position: memberPost(m),
               email: (m && m.email) || '', phone: (m && m.phone) || '', appUser: (m && m.appUser) || '',
               // A47: the version of the row this form was drawn from. Sent back
               // on save so a row somebody else changed meanwhile is refused
               // rather than silently overwritten.
               expect: (m && m.receivedAt) || '' };
      paint();
    });
    function paint() {
      if (!form) return;
      const me = Auth.current() || {};
      const iAmAdmin = Auth.isAdmin();
      // My own rank. 0 = no rank, and a level-0 person hands out nothing —
      // exactly what the server answers, said here first so the dropdown does
      // not offer what the save is going to refuse.
      const myLevel = iAmAdmin ? Infinity : Lists.levelOf(String(me.position || ''));
      // Only approved accounts can be picked. blocked means blocked — but a row
      // already pointing at an account that was blocked LATER keeps showing it,
      // or the screen would silently forget who this member is.
      const users = committee.filter(function (u) {
        return u.status === 'approved' || u.username === form.appUser;
      }).sort(function (a, b) { return String(a.name).localeCompare(String(b.name), 'bn'); });
      const picked = users.filter(function (u) { return u.username === form.appUser; })[0];
      // How many hold each post, counted the way the SERVER counts it: every
      // account except the one being edited. The old client version skipped
      // admins and the server never did, so an admin holding কোষাধ্যক্ষ made the
      // screen say "0/1, free" while the save answered `position-full`.
      const held = {};
      committee.forEach(function (x) {
        if (!x.position) return;
        if (form.appUser && String(x.username).toLowerCase() === String(form.appUser).toLowerCase()) return;
        held[x.position] = (held[x.position] || 0) + 1;
      });
      // Why a post cannot be given, in the same order the server decides it —
      // '' means it can. Said on the option itself, because a dropdown that
      // silently omits a post teaches people the post does not exist.
      const posBlock = function (pid) {
        if (iAmAdmin) return '';
        if (freezeOn()) return t('pos_no_freeze');
        const cur = picked ? String(picked.position || '') : '';
        // BOTH ends of every pair. Giving 💰 and taking it away are the same
        // power; so are promoting past your level and demoting somebody above it.
        if (pid && Lists.permsOf(pid).indexOf('cashier') >= 0) return t('pos_no_cashier');
        if (cur && Lists.permsOf(cur).indexOf('cashier') >= 0) return t('pos_no_cashier_off');
        if (!myLevel) return t('pos_no_level');
        if (pid && Lists.levelOf(pid) >= myLevel) return t('pos_no_higher');
        if (cur && Lists.levelOf(cur) >= myLevel) return t('pos_no_target');
        return '';
      };
      const posts = Lists.get('position');
      $view().innerHTML = backBar('memberadmin') +
        '<div class="flow-title">' + (id ? '✏️ ' + esc(t('member_edit')) : '➕ ' + esc(t('member_add'))) + '</div>' +
        '<div class="card">' +
          // The app account first: picking it fills the rest in, which is the
          // whole point of having the list.
          // The app account first: picking it fills the rest in, which is the
          // whole point of having the list at all.
          '<div class="field"><label>👤 ' + esc(t('member_app_user')) + '</label>' +
          (users.length
            ? '<select id="mf-user"><option value="">— ' + esc(t('member_pick_user')) + ' —</option>' +
                users.map(function (u) {
                  return '<option value="' + esc(u.username) + '"' + (u.username === form.appUser ? ' selected' : '') + '>' +
                    esc(u.name + ' (@' + u.username + ')') + '</option>';
                }).join('') + '</select>' +
              (picked ? '<div class="bd-line" style="display:block;margin-top:6px">' +
                esc('@' + picked.username +
                    ' \u00b7 ' + (picked.role === 'admin' ? t('role_admin') : t('role_collector')) +
                    (picked.cashier ? ' \u00b7 \ud83d\udcb0 ' + t('cashier') : '') +
                    (picked.position ? ' \u00b7 \ud83c\udf96\ufe0f ' + Lists.labelOf('position', picked.position) : '')) +
                '</div>' : '') +
              // A115: the account is REQUIRED now, and the note says why \u2014 it is
              // what keeps one person's post in ONE place instead of two that
              // drift. The old note ("linking changes no money") is still true
              // and still says so.
              '<div class="perm-note">' + esc(t('member_account_note')) + '</div>'
            : '<div class="empty">' + esc(t('member_users_na')) + '</div>') + '</div>' +
          '<div class="field"><label>' + esc(t('member_f_name')) + '</label>' +
          '<input id="mf-name" value="' + esc(form.name) + '" autocomplete="off"></div>' +
          '<div class="field"><label>🎖️ ' + esc(t('member_f_post')) + '</label>' +
          '<select id="mf-pos"><option value="">— ' + esc(t('member_no_post')) + ' —</option>' +
            posts.map(function (p) {
              const cap = Lists.maxOf(p.id), n = held[p.id] || 0, full = cap > 0 && n >= cap;
              // A115: two DIFFERENT reasons a post can be closed to you — it is
              // full, or it is not yours to hand out. Kept apart because "পূর্ণ"
              // and "আপনার স্তরের উপরে" are different problems with different
              // answers, and one word for both teaches people to stop reading.
              const why = posBlock(p.id);
              const off = (full || why) && p.id !== form.position;
              // The PERMISSION reason wins over "পূর্ণ", and that order matters:
              // a cap frees up, a level does not. Saying "পূর্ণ" to somebody who
              // could never give that post anyway sends them to ask the admin to
              // empty a slot, and then refuses them a second time for a reason
              // they were never told — one answer that only buys another question.
              return '<option value="' + esc(p.id) + '"' + (p.id === form.position ? ' selected' : '') +
                (off ? ' disabled' : '') + '>' +
                esc(Lists.labelOf('position', p.id) + (cap > 0 ? ' (' + n + '/' + cap + ')' : '') +
                    (off ? ' — ' + (why || t('pos_is_full')) : '')) + '</option>';
            }).join('') + '</select>' +
            // The post belongs to the ACCOUNT now. Said on the screen, because
            // somebody who came here to fix a phone number needs to know why the
            // post followed the person rather than the row.
            '<div class="perm-note">' + esc(t('member_post_note')) + '</div>' +
            (posBlock('') ? '<div class="perm-warn" style="display:block;margin-top:6px">' +
                            esc(posBlock('')) + '</div>' : '') +
          '</div>' +
          '<div class="field"><label>✉️ ' + esc(t('member_f_email')) + '</label>' +
          '<input id="mf-email" value="' + esc(form.email) + '" autocomplete="off" inputmode="email"></div>' +
          '<div class="field"><label>📞 ' + esc(t('member_f_phone')) + '</label>' +
          '<input id="mf-phone" value="' + esc(form.phone) + '" autocomplete="off" inputmode="tel"></div>' +
          '<div id="mf-err" class="perm-warn" style="display:none"></div>' +
        '</div>' +
        '<button id="mf-save" class="primary big block">' + esc(t('save')) + '</button>' +
        (id ? '<button id="mf-del" class="ghost block">🗑️ ' + esc(t('member_remove')) + '</button>' : '');
      wireNav();
      const uSel = document.getElementById('mf-user');
      if (uSel) uSel.onchange = function () {
        form.name = document.getElementById('mf-name').value;
        form.email = document.getElementById('mf-email').value;
        form.phone = document.getElementById('mf-phone').value;
        form.position = document.getElementById('mf-pos').value;
        form.appUser = uSel.value;
        // Fill only what is still BLANK. Overwriting a name somebody typed
        // because they later picked an account is how a form loses work.
        const u = memberUser(form.appUser);
        if (u) {
          if (!form.name.trim()) form.name = u.name || '';
          // A133: the roster now carries the account's contact — same
          // blank-only rule, so a typed number is never overwritten
          if (!form.phone.trim()) form.phone = u.phone || '';
          if (!form.email.trim()) form.email = u.email || '';
          // A115: and the post comes with them. Picking an account that already
          // holds সম্পাদক must SHOW সম্পাদক — the post is theirs, not this
          // row's, and a form that quietly showed "পদ নেই" would be offering to
          // strip it on the next save.
          form.position = String(u.position || '');
        }
        paint();
      };
      document.getElementById('mf-save').onclick = function () { saveMemberForm(id, members, form.expect); };
      const del = document.getElementById('mf-del');
      if (del) del.onclick = function () {
        // A60: the same guard the donor form uses. Removing a member who has
        // already paid does not lose the money — the payments are untouched —
        // but it strips the donor row those payments point at, and the book
        // then raises `payment_orphan` ("… donor row is missing — was the donor
        // voided?") for every one of them, for the rest of the season. The old
        // confirm promised "money already collected stays exactly as it is",
        // which was true about the rupees and misleading about the book.
        if (memberLivePays > 0) { alert(t('party_remove_has_pay').replace('{n}', String(memberLivePays))); return; }
        // A115: a member still holding a post cannot go — the post would be
        // left with nobody the register knows about. Said here, before the
        // confirm, so the answer is "take the post off first" rather than a
        // refusal after they have already agreed to delete somebody.
        if (form.position) {
          alert(t('member_holds_post').replace('{post}', Lists.labelOf('position', form.position)));
          return;
        }
        if (!window.confirm(t('member_remove_confirm').replace('{who}', form.name))) return;
        // A60: this used to set `row.voided = 1`. Nothing on either side reads
        // that field and `parties` has no such column server-side, so the push
        // dropped it — the member stayed in the register, on this device and
        // every other, while the screen said "সেভ হলো" and navigated away. A
        // remove button that removes nothing is the same failure as A19, A23,
        // A31, A35 and A45, and it is the fifth time the repair is "use the
        // mechanism that already works". `voids` is that mechanism: activeData
        // and activeData_ both drop rows by targetId, so one record removes the
        // member from the arithmetic, the reports and the lists at once.
        // A115: over the wire, like every other write on this screen. The server
        // still records it as a `voids` row — the mechanism A60 settled on —
        // so the removal travels to every other phone on its next poll.
        const undoDel = busyBtn(del);
        Auth.call('removeMember', { token: Auth.token(), id: id })
          .then(function () { toast(t('party_removed')); return pullCentral({ force: true }); })
          .then(function () { navigate('memberadmin'); })
          .catch(function (e) { undoDel(); alert(errMsg(e)); });
      };
    }
  }
  function saveMemberForm(id, members, memberExpect) {
    const err = document.getElementById('mf-err');
    const show = function (msg) { err.textContent = msg; err.style.display = ''; };
    const name = document.getElementById('mf-name').value.trim();
    const position = document.getElementById('mf-pos').value;
    const email = document.getElementById('mf-email').value.trim();
    const phone = cleanPhoneIN(document.getElementById('mf-phone').value);
    const uSel = document.getElementById('mf-user');
    const appUser = uSel ? uSel.value : '';
    if (!name) { show(t('member_need_name')); return; }
    if (email && emailErr(email)) { show(emailErr(email)); return; }
    if (phone && phoneErrIN(phone)) { show(phoneErrIN(phone)); return; }
    // A46: the same second ask as the entry flows, word for word — the SAME
    // i18n key, not a copy, so the two can never drift apart. A committee
    // member without a number is the case that costs later: no WhatsApp
    // reminder, and nothing to match on when the same person is written down
    // twice. Email gets no ask on purpose: it buys neither of those, and a
    // question with nothing behind it is what teaches people to tap through
    // questions.
    if (!phone && !window.confirm(t('skip_phone_confirm'))) {
      const box = document.getElementById('mf-phone');
      if (box) box.focus();
      return;
    }
    // A115: the account is required, and it is asked for BEFORE the post — the
    // post has nowhere to live without one.
    if (!appUser) { show(t('member_need_account')); return; }
    const acct = memberUser(appUser);
    // The cap again, on SAVE, counted the way the server counts it: over the
    // ACCOUNTS, every one of them except the person being edited. The dropdown
    // disables a full post, but a stale screen or a cap tightened after this
    // page was drawn would sail past that.
    if (position) {
      const others = committee.filter(function (x) {
        return String(x.username).toLowerCase() !== String(appUser).toLowerCase() &&
               String(x.position || '') === position;
      });
      const cap = Lists.maxOf(position);
      if (cap > 0 && others.length >= cap) {
        show(t('pos_full').replace('{who}', Lists.labelOf('position', position))
          .replace('{n}', others.length).replace('{names}', others.map(function (x) { return x.name; }).join(', ')));
        return;
      }
    }
    const dup = members.filter(function (p) {
      return p.id !== id && ((phone && cleanPhoneIN(p.phone || '') === phone) ||
                             String(p.name || '').trim().toLowerCase() === name.toLowerCase());
    })[0];
    if (dup && !window.confirm(t('dup_party_warn').replace('{row}',
        esc0(dup.name) + (dup.phone ? ' · 📞 ' + dup.phone : '')))) return;
    // A115: changing the post changes what that ACCOUNT may do in the app, and
    // this screen is called "কমিটির সদস্য", not "অনুমতি". So it is never silent
    // — it says whose permissions move, from what to what, and asks. The server
    // writes an audit line either way; this is so the person doing it knows.
    const had = acct ? String(acct.position || '') : '';
    if (position !== had) {
      const label = function (p) { return p ? Lists.labelOf('position', p) : t('member_no_post'); };
      if (!window.confirm(t('member_post_confirm')
            .replace('{who}', '@' + appUser)
            .replace('{from}', label(had))
            .replace('{to}', label(position)))) return;
    }
    const btn = document.getElementById('mf-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + t('saving'); }
    // Over the wire, not into the queue. Every rule this screen enforces is a
    // permission rule, and a permission rule a phone can settle for itself is
    // not a rule — see saveMember in Code.gs.
    Auth.call('saveMember', { token: Auth.token(), id: id, name: name, position: position,
                              email: email, phone: phone, appUser: appUser,
                              expect: memberExpect, year: Number(Settings.get('year')) })
      .then(function () { toast(t('saved')); return pullCentral({ force: true }); })
      .then(function () { navigate('memberadmin'); })
      .catch(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = t('save'); }
        show(errMsg(e));
      });
  }
  // A60 (audit 2.1): correcting a shop/person donor row.
  //
  // A FORM, not a chat flow, and edited IN PLACE — both deliberate.
  //
  // The flows are for capture: one question at a time, hands busy, a donor
  // waiting. Correcting is the opposite situation — you already know which
  // field is wrong and you want to change that one thing and leave. Walking
  // seven questions to fix a spelling is how a correction feature goes unused.
  //
  // In place, and NOT the void-and-replace pattern every money row uses,
  // because payments point at this row by `partyId`. Voiding a donor and
  // writing a new one would orphan every rupee already collected against it.
  // The audit trail for a donor is a different thing from the audit trail for
  // money, and conflating them would cost the money one.
  function renderPartyForm(params) {
    params = params || {};
    const id = params.id || '';
    // A105: ← goes back to the donor, and the donor is told which door BOTH of
    // them came in by — otherwise editing a pledge from 🩺 walks you out to
    // 📒 খাতা two screens later.
    const from = params.from || '';
    $view().innerHTML = backBar('party', { id: id, from: from }) + '<div class="empty">' + esc(t('loading')) + '</div>';
    let form = null, orig = null, livePays = 0;
    viewData().then(function (data) {
      const p = liveParties(data).filter(function (x) { return x.id === id; })[0];
      if (!p || !canEditParty(p)) { navigate(p ? 'party' : 'list', { id: id, from: from }); return; }
      const v = Aggregate.voidedIds(data);
      livePays = (data.payments || []).filter(function (x) { return x.partyId === id && !v[x.id]; }).length;
      orig = p;
      form = { name: p.name || '', owner: p.owner || '', side: p.side || '',
               location: p.location || '', phone: p.phone || '', pledged: p.pledged || 0 };
      paint();
    });
    function paint() {
      if (!form) return;
      const isShop = orig.type === 'shop';
      const opts = function (kind, cur) {
        return Lists.get(kind).map(function (o) {
          return '<option value="' + esc(o.id) + '"' + (o.id === cur ? ' selected' : '') + '>' +
            esc(Lists.labelOf(kind, o.id)) + '</option>';
        }).join('');
      };
      // A105: `from` here too — this is the back bar that SURVIVES. The one
      // above it is drawn with the loading placeholder and replaced the moment
      // the donor loads, so a door threaded only there is thrown away a
      // heartbeat later, which is exactly how the first fix passed one path and
      // failed the other.
      $view().innerHTML = backBar('party', { id: id, from: from }) +
        '<div class="flow-title">✏️ ' + esc(t('party_edit_title')) + '</div>' +
        '<div class="card">' +
          '<div class="field"><label>' + esc(t(isShop ? 'party_f_shop' : 'party_f_person')) + '</label>' +
          '<input id="pf-name" value="' + esc(form.name) + '" autocomplete="off"></div>' +
          (isShop ? '<div class="field"><label>' + esc(t('party_f_owner')) + '</label>' +
            '<input id="pf-owner" value="' + esc(form.owner) + '" autocomplete="off"></div>' +
            '<div class="field"><label>' + esc(t('party_f_side')) + '</label>' +
            '<select id="pf-side">' + opts('area', form.side) + '</select></div>'
           : (Lists.get('location').length
              ? '<div class="field"><label>' + esc(t('party_f_location')) + '</label>' +
                '<select id="pf-loc"><option value="">—</option>' + opts('location', form.location) + '</select></div>'
              : '')) +
          '<div class="field"><label>📞 ' + esc(t('party_f_phone')) + '</label>' +
          '<input id="pf-phone" value="' + esc(form.phone) + '" autocomplete="off" inputmode="tel"></div>' +
          '<div class="field"><label>' + esc(t('party_f_pledged')) + '</label>' +
          '<input id="pf-pledged" value="' + esc(String(Number(form.pledged) || 0)) + '" autocomplete="off" inputmode="numeric"></div>' +
          '<div id="pf-err" class="perm-warn" style="display:none"></div>' +
        '</div>' +
        '<button id="pf-save" class="primary big block">' + esc(t('save')) + '</button>' +
        // Removal is offered only when there is nothing to lose. With payments
        // against it the button is still shown — but it explains why, instead
        // of disappearing and leaving somebody hunting for it.
        '<button id="pf-del" class="ghost block">' + esc(t('party_remove')) + '</button>';
      wireNav();
      admEl('pf-save').onclick = function () { savePartyForm(id, orig, livePays, from); };
      admEl('pf-del').onclick = function () {
        if (livePays > 0) { alert(t('party_remove_has_pay').replace('{n}', String(livePays))); return; }
        if (!window.confirm(t('party_remove_confirm').replace('{who}', form.name))) return;
        // A `voids` row, NOT a flag on the party. activeData/activeData_ already
        // drop every store's rows by targetId on both sides, so this one record
        // removes the donor from the arithmetic, the reports and the lists at
        // once — and leaves the row itself in the Sheet, which is what an audit
        // trail is. (The member 🗑️ used to set a `voided` field that no code
        // read and no server column stored: see the A60 note in the build log.)
        DB.put('voids', DB.newRow({ targetStore: 'parties', targetId: id, reason: 'removed' }))
          .then(function () { toast(t('party_removed')); updateBadge(); autoSync(); navigate('list'); })
          .catch(function (e) { toast(errMsg(e)); });
      };
    }
  }
  // A115e: `from` is a PARAMETER. It used to be read straight out of
  // renderPartyForm, which is a sibling at module level, not a parent — so every
  // save threw `ReferenceError: from is not defined` AFTER the row was already
  // written. The collector saw "✅ সেভ হয়ে গেল" and then
  // "⚠️ সার্ভার বলছে: from is not defined", which reads as a server fault and is
  // not one, and the form never left the screen. Hrishi read it as "no forms
  // available" and reported the save as broken; it had in fact saved.
  //
  // Exactly A105's `drawParty`, in the same file, four weeks later. That one was
  // caught by tests/scope-check.js — which looks for out-of-scope CALLS
  // (`name(`) and PROPERTY reads (`name.`) and deliberately skips bare
  // identifiers. `from` is a bare identifier.
  function savePartyForm(id, orig, livePays, from) {
    const err = document.getElementById('pf-err');
    const show = function (m) { err.textContent = m; err.style.display = ''; };
    const val = function (elId) { const e = document.getElementById(elId); return e ? e.value : ''; };
    const name = String(val('pf-name')).trim();
    const phone = cleanPhoneIN(val('pf-phone'));
    const pledged = Number(NumParse.parseAmount(val('pf-pledged'))) || 0;
    if (!name) { show(t('party_need_name')); return; }
    if (phone && phoneErrIN(phone)) { show(phoneErrIN(phone)); return; }
    viewData().then(function (data) {
      const v = Aggregate.voidedIds(data);
      const paid = (data.payments || []).filter(function (x) { return x.partyId === id && !v[x.id]; })
        .reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
      // The whole reason a wrong pledge matters: it is what `overpaid` is
      // measured against, and `overpaid` cannot be dismissed (audit 2.3), so a
      // pledge typed below what is already collected parks a permanent red line
      // on the 🩺 desk. Say that here, where it can still be undone in one tap,
      // rather than letting it be discovered on the anomaly screen in October.
      if (pledged > 0 && paid > pledged &&
          !window.confirm(t('party_pledge_low').replace('{paid}', fmtMoney(paid)).replace('{pledged}', fmtMoney(pledged)))) return;
      return DB.get('parties', id).then(function (row) {
        // A115e, A68's lesson again: this is THIS DEVICE's IndexedDB. A donor
        // written by somebody else lives only in the central snapshot, so `row`
        // was undefined and the screen navigated away having saved nothing and
        // said nothing — and the 🩺 desk's ✏️ সংশোধন button is offered to an
        // ADMIN for exactly those rows. The commonest use of that button was a
        // silent no-op.
        //
        // Falling back to the snapshot copy is safe here and is checked on the
        // server: push refuses a `parties` edit from anyone but the creator or
        // an admin, and the admin path carries the ORIGINAL collector forward
        // rather than re-stamping it, so correcting Ratan's donor cannot move
        // Ratan's money onto the admin's head. canEditParty offers the button
        // on the same rule.
        if (!row) row = (liveParties(data).filter(function (p) { return p.id === id; })[0] || null);
        if (!row) { navigate('list'); return; }
        row = JSON.parse(JSON.stringify(row)); // never mutate the cached snapshot in place
        // A47's rule, applied to donors: two people may hold this screen at once
        // and the second save silently wins. Compare against the central copy
        // this device already has and name whose change would be lost. It sees
        // only what has SYNCED — an honest limit, said as a hint, not a promise.
        const clash = orig && (String(orig.name || '') !== String(row.name || '') ||
                               String(orig.phone || '') !== String(row.phone || '') ||
                               Number(orig.pledged || 0) !== Number(row.pledged || 0));
        if (clash && !window.confirm(t('party_clash').replace('{name}', row.name || '?'))) {
          navigate('party', { id: id, from: from }); return;
        }
        row.name = name;
        row.phone = phone;
        row.pledged = pledged;
        if (row.type === 'shop') { row.owner = String(val('pf-owner')).trim(); row.side = val('pf-side') || row.side; }
        else if (document.getElementById('pf-loc')) row.location = val('pf-loc');
        row.synced = 0;
        return DB.put('parties', row).then(function () {
          toast(t('saved')); updateBadge(); autoSync(); navigate('party', { id: id, from: from });
        });
      });
    }).catch(function (e) { toast(errMsg(e)); });
  }
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
      '<input id="fp-search" class="search" enterkeyhint="search" placeholder="' + esc(t('search_party_ph')) + '" value="' + esc(findQuery) + '">' +
      filterBar(chips.buttons + dueChip(findDueOnly)) +
      '<div id="fp-results"><div class="empty">' + esc(t('loading')) + '</div></div>';
    wireTabsCue();
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
      findParties = liveParties(data).filter(function (p) {
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

  // A105: `params.from` — the door this screen was entered by.
  //
  // ← পেছনে is wired to a FIXED parent per screen, which is right for a screen
  // with one way in. 🩺-র anomaly desk gives a party two ways in, and the fixed
  // parent won: 👁 দেখো landed on the donor, ← went to 📒 খাতা, and the desk you
  // were working through was gone. On a desk whose whole job is "work down this
  // list", losing your place is the failure — you cannot tell which ones you
  // have already looked at.
  //
  // Threaded rather than guessed: history.back() would also work here and would
  // be wrong the first time somebody deep-links or lands mid-flow, and the app
  // already carries `origin` through the payment flow for the same reason.
  function renderParty(params) {
    params = params || {};
    viewData().then(function (data) {                    // central snapshot (+ own), instant
      const p = liveParties(data).filter(function (x) { return x.id === params.id; })[0];
      if (!p) { navigate('list'); return; }
      const voidedOf = {};
      // A47: who cancelled it and when, not only why. "Has somebody already
      // dealt with this?" is the question you actually have in front of a row,
      // and the answer was sitting unused in the void row all along — every row
      // carries its creator and time. No new column, no new call.
      (data.voids || []).forEach(function (v) {
        if (v.targetStore !== 'payments') return;
        const prev = voidedOf[v.targetId];
        // keep the FIRST cancellation: a second one changes nothing (the maths
        // keys on targetId, so it is counted once either way) and the first is
        // the one that actually happened.
        if (prev && prev.at && String(prev.at) <= String(v.createdAt || '')) return;
        voidedOf[v.targetId] = { reason: v.reason || '', by: v.collector || '', at: v.createdAt || '' };
      });
      const pays = (data.payments || []).filter(function (x) { return x.partyId === p.id; });
      drawParty(p, pays, true, voidedOf, params.from);
    });
  }
  // Renders a party card + a per-collector breakdown + the payment history.
  // `pays` is device-local (central=false) or all-collector (central=true).
  // A105: `from` is the door renderParty was entered by, and it has to be an
  // ARGUMENT — drawParty is a top-level function, not a closure inside
  // renderParty. The first version of this fix read `params` in here and threw
  // ReferenceError on every 👁 দেখো, with the whole suite green.
  // A106: what an expense is CALLED, in one place. Three renderers each had
  // their own version of this rule and a fourth had none, which is how 🧾 আমার
  // খরচ ended up printing a bare date and an amount.
  //
  // The subject, or the comment if there is no subject, or the word খরচ. And
  // 'Other' is a stored MARKER, not a name — expenseFlow writes it for the
  // "➕ অন্য কিছু" choice, so it has to be translated on the way out or a
  // Bengali screen reads "Other".
  // A142: for "➕ অন্য কিছু" the COMMENT is the name. It is mandatory at entry
  // (expenseFlow marks that step required) precisely so this line can say what
  // the money went on — and then this function threw it away and printed the
  // marker instead. Every screen entrySummary touches said "🧾 খরচ · ➕ অন্য
  // কিছু — ₹800": an amount, a shrug, and a question nobody could answer a
  // week later. ✏️ আমার লেখা entry, the 🩺 desk, the pot detail, 🪦, the void
  // list — all of them, all season.
  function expenseTitle(e) {
    const raw = String((e && e.subject) || '');
    const desc = String((e && e.desc) || '').trim();
    if (raw === 'Other' || raw === OTHER_SUBJECT) return desc || t('subject_other');
    return raw || desc || t('expense');
  }
  // The comment as a SECOND line — empty when the title is already the comment,
  // so no row ever prints the same words twice.
  function expenseNote(e) {
    const d = String((e && e.desc) || '').trim();
    return d && expenseTitle(e) !== d ? d : '';
  }
  function drawParty(p, pays, central, voidedOf, from) {
    voidedOf = voidedOf || {};
    from = from || '';
    const live = pays.filter(function (x) { return voidedOf[x.id] === undefined; });
    const paid = live.reduce(function (a, x) { return a + (Number(x.amount) || 0); }, 0);
    const due = (Number(p.pledged) || 0) - paid;
    const byC = {}, nameByC = {};
    live.forEach(function (x) { const k = x.collectorId || x.collector || '?'; byC[k] = (byC[k] || 0) + (Number(x.amount) || 0); nameByC[k] = x.collector || k; });
    const keys = Object.keys(byC).sort(function (a, b) { return byC[b] - byC[a]; });
    const sorted = pays.slice().sort(function (a, b) { return String(b.createdAt || '').localeCompare(String(a.createdAt || '')); });
    $view().innerHTML = backBar(from || 'list') +
      '<div class="card"><div class="card-title">' + esc(p.name) + '</div>' +
      '<div class="row-sub">' + esc(t('type_' + p.type)) +
      (p.side ? ' • ' + esc(Lists.labelOf('area', p.side)) : '') +
      (p.location ? ' • ' + esc(Lists.labelOf('location', p.location)) : '') +
      (p.owner ? ' • ' + esc(p.owner) : '') +
      (p.phone ? ' • 📞 ' + esc(p.phone) : '') + '</div>' +
      // A145: a donor who promised NOTHING gets no কথা/বাকি pair. গুপ্ত দান is
      // asked no pledge by design, and committee members never were either — so
      // this card read "কথা ₹0 · বাকি −₹2,000" over somebody who owes nobody
      // anything. A minus in the বাকি column means "chase this person" on every
      // other screen in the app; here it was an artefact of subtracting from
      // zero. Found by driving the গুপ্ত card, and it fixes members too.
      (Number(p.pledged) || 0 ? '<div class="stat3">' +
        '<div><span>' + esc(t('pledged')) + '</span><b>' + fmtMoney(p.pledged) + '</b></div>' +
        '<div><span>' + esc(t('paid')) + '</span><b>' + fmtMoney(paid) + '</b></div>' +
        '<div class="' + (due > 0 ? 'red' : 'green') + '"><span>' + esc(t('due')) + '</span><b>' +
          fmtMoney(due) + '</b></div>' +
      '</div>'
      : '<div class="stat3"><div><span>' + esc(t('paid')) + '</span><b>' + fmtMoney(paid) + '</b></div></div>') +
      '<button id="pay-btn" class="primary big block">💰 ' + esc(t('add_payment')) + '</button>' +
      (due > 0 && p.phone ? '<button id="remind-btn" class="ghost big block">📞 ' + esc(t('remind_btn')) + '</button>' : '') +
      // A60 (audit 2.1): shown only to the person who wrote this row down, or
      // an admin — see canEditParty for why that is the opposite rule to canVoid.
      (central && canEditParty(p) ? '<button id="edit-party-btn" class="ghost block">' + esc(t('party_edit')) + '</button>' : '') +
      '</div>' +
      (keys.length ? '<div class="section">' + esc(t('who_collected')) + '</div><div class="card">' +
        keys.map(function (k) {
          return '<div class="row" style="cursor:default"><div>' + esc(nameByC[k]) + '</div><b>' + fmtMoney(byC[k]) + '</b></div>';
        }).join('') + '</div>' : '') +
      '<div class="section">' + esc(t('payments_history')) +
        (central ? '' : ' <span class="row-sub">(' + esc(t('local_report')) + ')</span>') + '</div>' +
      (sorted.length ? sorted.map(function (x) {
        const vd = voidedOf[x.id];
        const isVoid = vd !== undefined;
        const who = isVoid && (vd.by || vd.at)
          ? ' — ' + esc([vd.by, vd.at ? agoText(vd.at) : ''].filter(Boolean).join(', ')) : '';
        const reason = isVoid && vd.reason && vd.reason !== 'undo' ? ': ' + esc(vd.reason) : '';
        return '<div class="row' + (isVoid ? ' voided' : '') + '"><div>' + esc(fmtDate(x.date || x.createdAt)) +
          '<div class="row-sub">' + esc(x.collector || '') + (x.note ? ' • ' + esc(x.note) : '') +
          (isVoid ? ' • <span class="void-tag">' + esc(t('voided_label')) + who + reason + '</span>' : '') + '</div></div>' +
          '<b>' + fmtMoney(x.amount) + '</b>' +
          (isVoid ? '' : '<button class="chip" data-receipt="' + esc(x.id) + '">🧾</button>') +
          (isVoid || !canVoid(x) ? '' : '<button class="chip void-btn" data-void="' + esc(x.id) + '">' + esc(t('void_btn')) + '</button>') + '</div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>');
    const payBtn = document.getElementById('pay-btn');
    if (payBtn) payBtn.onclick = function () { startFlow(paymentFlow(p, 'list')); };
    const editParty = document.getElementById('edit-party-btn');
    if (editParty) editParty.onclick = function () { navigate('partyform', { id: p.id, from: from }); };
    const remindBtn = document.getElementById('remind-btn');
    if (remindBtn) remindBtn.onclick = function () {
      // opens WhatsApp with a pre-filled reminder — the collector still taps
      // send themselves (never auto-sent).
      const num = waNumber(p.phone);
      if (!num) { toast(t('no_phone')); return; }
      const msg = t('remind_msg').replace('{name}', p.name).replace('{due}', fmtMoney(due));
      window.open('https://wa.me/' + num + '?text=' + encodeURIComponent(msg), '_blank');
    };
    document.querySelectorAll('[data-void]').forEach(function (b) {
      b.onclick = function () { renderVoidReason('payments', b.dataset.void, function () { navigate('party', { id: p.id, from: from }); }); };
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
  // A103: ONE search rule, for all six boxes. Every word of the query has to
  // appear somewhere in the haystack — order does not matter, and neither does
  // whether the words are next to each other.
  //
  // Four of the six used to do a single indexOf of the whole query instead, so
  // a collector who had learnt "type any two words" in 📒 খাতা — the screen they
  // live in — typed "শঙ্কর কোষাধ্যক্ষ" on the member screen and got NOTHING,
  // with both those words on the row in front of them. An empty result does not
  // read as "not phrased that way", it reads as "this person is not here", and
  // on puja night that is a member turned away or entered twice.
  //
  // Widening only: any query that matched a contiguous substring has all its
  // words present too, so nothing that worked before can stop working.
  function matchWords(hay, query) {
    const q = normText(query); if (!q) return true;
    const h = normText(hay);
    return q.split(' ').every(function (w) { return h.indexOf(w) >= 0; });
  }
  // A party matches on its name, owner, phone, area and location — so
  // "কমল মালদা" or "9998 malda" work.
  function matchParty(p, query) {
    return matchWords([p.name, p.owner, p.phone,
      p.side ? Lists.labelOf('area', p.side) : '',
      p.location ? Lists.labelOf('location', p.location) : ''].join(' '), query);
  }
  // Which things this user may collect (admin sets it per user; empty = all, so
  // nobody is accidentally locked out). Keys are the six collection categories
  // plus 'review' — see Aggregate.PERM_KEYS for the whole story. Passing a
  // falsy key means "common to everyone" and is always allowed.
  // A36: a phone we KNOW is behind the server may not make new entries. This is
  // the single predicate every entry tile and every entry route already asks,
  // so one line covers all of them — no screen can be forgotten.
  // Handing over money already in hand does NOT come through here (it carries
  // no permission key), and that is deliberate: see Aggregate.homeTiles.
  // A122: the one-tap guide door every screen's hint can end with. It carries
  // BOTH the section (so the reader lands on the right card, not the top of a
  // long page) and the source screen (so ← comes back HERE — Hrishi's rule:
  // the back button goes to its source).
  function guideDoor(sec) {
    return ' <button class="chip mini js-guide" data-sec="' + esc(sec) + '">📖 ' +
      esc(t('entries_guide_btn')) + '</button>';
  }
  function wireGuideDoors() {
    document.querySelectorAll('.js-guide').forEach(function (b) {
      b.onclick = function () { navigate('help', { sec: b.dataset.sec, from: current.view }); };
    });
  }
  function canEntry(key) {
    if (key && Auth.schemaCmp() === -1) return false;
    // A110: the freeze rides the same choke point as the stale-version lock —
    // every entry tile and every entry route already asks this one question, so
    // there is no screen left where a button appears that the server will hold.
    if (key && frozen()) return false;
    return Aggregate.permAllowed(Auth.current(), key);
  }
  // A144: may this person SEE rows of this kind at all? Different question from
  // canEntry, and only for the confidential kinds: a cashier holding
  // 'sponsorview' writes no sponsors but must be able to read and filter them,
  // while canEntry alone would give them a ledger with no way to reach the rows
  // the server is already sending. Reading is also not stopped by a freeze or a
  // stale version — those hold WRITES, and hiding a book nobody may write to
  // would be a second, unrelated punishment.
  // A144: does this breakdown carry confidential money, and does it mix it with
  // open money? Mirrors Code.gs confidentialMix_ — the server refuses the mixed
  // row; this side refuses it earlier and says so in Bengali.
  function confidentialMix(bd) {
    if (!bd || typeof bd !== 'object') return { cats: [], mixed: false };
    const cats = [], open = [];
    Object.keys(bd).forEach(function (k) {
      if (k.slice(0, 2) === '__') return; // reserved metadata, not a category
      const v = bd[k] || {};
      if (!((Number(v.cash) || 0) + (Number(v.upi) || 0))) return;
      (Aggregate.isRestrictedType(k) ? cats : open).push(k);
    });
    // A145: `cats.length > 1` is mixing too, and it only became visible once a
    // SECOND confidential kind existed. A parcel of স্পনসর + গুপ্ত sent to a
    // cashier who holds only `sponsorview` is withheld WHOLE — visible_ drops a
    // handover if ANY of its pots is closed to the reader — so the sponsor half
    // they were entitled to see disappears as well, and the sender then reads as
    // negative in-hand on that cashier's screen. One confidential pot per
    // parcel, and nothing else in it.
    return { cats: cats, mixed: cats.length > 1 || (cats.length > 0 && open.length > 0) };
  }
  // A144: is this reader's book missing rows the committee's book has? True when
  // any confidential kind is closed to them — the server withheld those rows, so
  // every committee total they see is honestly smaller than the admin's. It is
  // deliberately NOT true for the curtain: that hides names, not money.
  function partialBook() {
    const me = Auth.current();
    if (me && me.role === 'admin') return false;
    return Aggregate.RESTRICTED_TYPES.some(function (ty) {
      return !Aggregate.permAllowed(me, Aggregate.viewPermFor(ty));
    });
  }
  // A144: the 👁️ curtain — for the moment somebody is reading over your shoulder.
  //
  // MODULE state, never persisted, and that is the design. A curtain that
  // survived a restart would be found days later by a collector hunting for
  // money that was never missing; reopening the app is the one moment we can be
  // sure the shoulder has gone. It is also NOT a permission: it hides names and
  // rows from the person's own screen and leaves every amount standing, because
  // that cash is still theirs to hand over.
  let curtainOn = false;
  function curtainAvailable() {
    return Aggregate.RESTRICTED_TYPES.some(function (ty) { return canSeeKind(ty); });
  }
  function paintCurtain() {
    const b = document.getElementById('hdr-curtain');
    if (!b) return;
    const on = curtainAvailable();
    b.hidden = !on;
    if (!on) { curtainOn = false; return; }
    b.textContent = curtainOn ? '🙈' : '👁️';
    b.title = t(curtainOn ? 'curtain_on_hint' : 'curtain_off_hint');
    b.setAttribute('aria-label', t(curtainOn ? 'curtain_on' : 'curtain_off'));
    b.setAttribute('aria-pressed', curtainOn ? 'true' : 'false');
  }
  // A146: which of the offered cashiers may receive THIS parcel.
  //
  // The base rule is untouched and lives where it always did — the list handed
  // in is already "approved, and admin or কোষাধ্যক্ষ". This only narrows it, and
  // only when the parcel carries a confidential pot: the money physically moves,
  // so a recipient who cannot see that pot would receive cash that never appears
  // in their book while the sender's in-hand drops — `negative_inhand`, accusing
  // an honest person of a shortfall.
  //
  // An ordinary parcel narrows nothing, so twelve people's everyday handover is
  // exactly the screen it was yesterday.
  function recipientsFor(opts, answers) {
    const cats = confidentialMix(sheetBreakdown(answers)).cats;
    if (!cats.length) return opts;
    return (opts || []).filter(function (c) {
      const sees = String((c && c.sees) || '').split(',');
      return cats.every(function (ty) { return sees.indexOf(ty) >= 0; });
    });
  }
  // The breakdown a half-finished sheet answer implies. handoverFlow builds the
  // real one at save; this is the same shape, read early, so the recipient step
  // can ask its question of the parcel rather than of the person.
  function sheetBreakdown(a) {
    if (!a || !a.sheet || typeof a.sheet !== 'object') return null;
    const bd = {};
    Object.keys(a.sheet).forEach(function (k) { bd[k] = a.sheet[k]; });
    return bd;
  }
  // A144: may this recipient read every confidential pot in this parcel? Answered
  // from the committee roster's `sees` — the one derived field the server sends
  // for exactly this question. An unknown recipient (a name typed free while
  // offline) answers NO: confidential money is not handed to a guess.
  function recipientSees(toId, cats) {
    if (!cats || !cats.length) return true;
    let row = null;
    (committee || []).forEach(function (c) { if (c && String(c.username) === String(toId)) row = c; });
    if (!row) return false;
    const sees = String(row.sees || '').split(',');
    return cats.every(function (ty) { return sees.indexOf(ty) >= 0; });
  }
  function canSeeKind(key) {
    if (!Aggregate.isRestrictedType(key)) return canEntry(key);
    const me = Auth.current();
    return Aggregate.permAllowed(me, key) || Aggregate.permAllowed(me, Aggregate.viewPermFor(key));
  }
  // The cashier's correction desk is now its own grant. Base requirement is
  // unchanged (cashier or admin); on top of that the admin may withhold it.
  function canReview() { return Auth.isCashier() && canEntry('review'); }
  // Persistent training strip under the header — shows on EVERY screen until the
  // admin goes live (it lives outside #view, so a re-render can't drop it). Also
  // keeps the header title in sync with the puja name.
  // A77: say when the phone is offline, and how stale what it shows is.
  //
  // Everything reads from the local snapshot, which is what makes the app
  // usable at a pandal gate — and it means a collector looking at 💰 কার হাতে
  // কত sees whatever was true at the last sync. That number gets acted on. The
  // app never said so; there was no offline indicator anywhere in the UI.
  //
  // Its own strip rather than a fourth state of the training bar, because a
  // collector can be offline AND in training at once and one slot would have to
  // pick. Grey, not red: offline is the normal condition here, not a fault.
  function updateNetBar() {
    const el = document.getElementById('net-bar');
    if (!el) return;
    if (navigator.onLine || !Auth.loggedIn()) { el.style.display = 'none'; el.textContent = ''; return; }
    let at = 0;
    try { at = Number(localStorage.getItem('ck_last_pull')) || 0; } catch (e) {}
    el.style.display = 'block';
    el.textContent = at
      ? t('net_off_since').replace('{ago}', agoText(new Date(at).toISOString()))
      : t('net_off_never');
  }
  function updateTrainingBar() {
    const at = document.getElementById('app-title');
    if (at && Auth.loggedIn()) at.textContent = '🙏 ' + pujaName();
    const el = document.getElementById('training-bar'); if (!el) return;
    if (!Auth.loggedIn()) { el.style.display = 'none'; el.innerHTML = ''; return; }
    // A34: being BEHIND the server outranks the training notice. Old code
    // writing into a book the server has moved on from is the one thing worth
    // interrupting somebody for.
    //
    // Three deliberate limits, and each one exists so this bar cannot become
    // the next bug:
    //   · only when this device is BEHIND. A device AHEAD of the server is the
    //     normal deploy window — Pages and Apps Script never publish in the same
    //     second — and shouting then would paint every phone red on every
    //     release. Hrishi is told instead, because for him it means "you have
    //     not redeployed Code.gs yet".
    //   · null (never talked to the server, or an unparseable version) says
    //     nothing at all. An alarm nobody can act on is worse than silence.
    //   · it CANNOT be dismissed, and the fix is a button inside it. "Go to
    //     Settings and scroll down" is a three-step errand, and errands get put
    //     off — which is exactly how a warning becomes wallpaper.
    // A110: the freeze outranks the training notice, and sits just under the
    // version lock. Ordered by what stops you working RIGHT NOW: a phone that
    // is behind cannot write at all, a freeze means nobody can, and training is
    // a standing condition. Same slot as the training strip, so it appears on
    // every screen and no re-render can drop it.
    // A110: the admin is exempt from the BLOCK, not from the news. Same strip,
    // different sentence — theirs says how to lift it, because the person who
    // can undo it is the only one for whom that is useful.
    if (freezeOn()) {
      const mine = Auth.isAdmin();
      el.style.cssText = 'display:block;background:#c0392b;color:#fff;text-align:center;' +
        'font-weight:bold;font-size:14px;padding:8px 12px;border-bottom:2px solid #7d2418;line-height:1.35';
      el.innerHTML = esc(t(mine ? 'freeze_bar_admin' : 'freeze_bar')) +
        '<div style="font-weight:400;font-size:12.5px;opacity:.92;margin-top:2px">' +
        esc(t(mine ? 'freeze_bar_admin_sub' : 'freeze_bar_sub')) + '</div>';
      return;
    }
    const cmp = Auth.schemaCmp();
    if (cmp === -1) {
      el.style.cssText = 'display:block;background:#c0392b;color:#fff;text-align:center;' +
        'font-weight:bold;font-size:14px;padding:8px 12px;border-bottom:2px solid #7d2418;line-height:1.4';
      el.innerHTML = '🔴 ' + esc(t('ver_behind').replace('{mine}', Auth.APP_VERSION).replace('{srv}', Auth.serverVersion())) +
        ' <button id="ver-fix" class="chip" style="background:#fff;color:#c0392b;border:0;font-weight:700;margin-left:6px">' +
        esc(t('ver_fix_btn')) + '</button>';
      const b = document.getElementById('ver-fix');
      if (b) b.onclick = function () { runUpdate(b); };
      return;
    }
    // The server is behind THIS app: only the admin can act on that, and only
    // by redeploying Code.gs. Nobody else needs to see it.
    if (cmp === 1 && Auth.isAdmin()) {
      el.style.cssText = 'display:block;background:#f6b93b;color:#5a3a00;text-align:center;' +
        'font-weight:bold;font-size:13px;padding:7px 12px;border-bottom:2px solid #d9891a;line-height:1.35';
      el.innerHTML = '🛠️ ' + esc(t('ver_server_behind').replace('{srv}', Auth.serverVersion()).replace('{mine}', Auth.APP_VERSION));
      return;
    }
    if (isLive()) { el.style.display = 'none'; el.innerHTML = ''; return; }
    el.style.cssText = 'display:block;background:#f6b93b;color:#5a3a00;text-align:center;' +
      'font-weight:bold;font-size:14px;padding:7px 12px;border-bottom:2px solid #d9891a;line-height:1.35';
    el.innerHTML = '🟡 ' + esc(t('training_mode')) + ' — ' + esc(t('training_hint'));
  }
  // admin-configured receipt design (falls back to sensible defaults)
  function receiptConfig() {
    const c = centralConfig || {};
    return {
      layout: c.receipt_layout || 'classic',
      // A98: tBn, not t — these two are PRINTED on the donor's receipt, and a
      // receipt is Bengali whatever the collector set the app to
      puja: c.puja_name || c.committee_name || tBn('app_title'), // top, big
      committee: c.committee_name || '',                         // bottom, signatory
      footer: c.receipt_footer || tBn('receipt_thanks'),
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
        // A67 (audit 2.10): the serial is minted by the SERVER, so an entry
        // taken out of signal has none yet and this printed a bare "নং —".
        // A dash is not an explanation. The donor walks away holding a receipt
        // with no number and no reason for it, and if they ever ring up to ask
        // about their payment, that number is the only thing either side can
        // quote.
        //
        // The explanation goes INSIDE the image for the same reason the
        // corrected stamp does, six lines below: the caption is the part an app
        // may throw away, and the picture is what the donor keeps.
        g.textAlign = 'right'; g.fillStyle = '#c0201a'; g.font = 'bold 20px sans-serif';
        // ONE line, not two: y=278 is where the donor sentence begins, and a
        // second line there printed straight through it. Verified by rendering
        // the canvas, which is the only way this kind of thing shows up.
        g.fillText(rc.receiptNo ? 'নং  ' + rc.receiptNo
                                : 'নং  —  ' + tBn('rcp_no_pending_stamp'), W - 60, 258);
        // A correction re-uses the ORIGINAL serial, so the donor gets a second
        // message carrying the same number. Without this stamp they would
        // reasonably think they had been counted twice — and it goes in the
        // IMAGE, because a caption is the part an app may throw away.
        if (rc.corrected) {
          g.textAlign = 'right'; g.fillStyle = '#c0201a'; g.font = 'bold 15px sans-serif';
          g.fillText(tBn('rcp_corrected_stamp'), W - 60, 280);
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
        g.fillText('তারিখ: ' + fmtDateLong(rc.datetime || rc.date), lx, sy);
        // A83: WHO took the money. The donor's copy is their only evidence, and
        // without this it cannot answer the one question a dispute asks — twelve
        // people are collecting. The app has known all along; the receipt just
        // never said.
        if (rc.collector) {
          g.fillStyle = muted; g.font = '17px sans-serif';
          g.fillText('সংগ্রাহক: ' + rc.collector, lx, sy + 24);
        }
        g.textAlign = 'right';
        g.fillStyle = muted; g.font = '17px sans-serif';
        g.fillText(tBn('receipt_thanking'), W - 62, sy);
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
  // A98: this note is printed on the receipt image and nowhere else, so it is
  // tBn — and rcpMoney, not fmtMoney: the receipt writes ₹৫০০ in Bengali digits
  // everywhere else, and the split was arriving as "(নগদ ₹300 + UPI ₹200)".
  const cashUpiNote = function (r) {
    return (Number(r.upiAmount) > 0 && Number(r.cashAmount) > 0)
      ? '(' + tBn('cash') + ' ' + rcpMoney(r.cashAmount) + ' + UPI ' + rcpMoney(r.upiAmount) + ')' : '';
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
      collector: pay.collector || pay.collectorId || '',
      paidTotal: paidTotal, pledged: p.pledged, due: due, receiptNo: pay.receiptNo || '' };
  }
  // Receipt for a daily bus collection (name + number, one-off → no totals).
  function rcFromDailyBus(d) {
    return { donorLine: (d.busName || tBn('type_bus')) + (d.busNumber ? ' (নং ' + d.busNumber + ')' : ''),
      showTotals: false, date: d.date || d.createdAt, datetime: d.createdAt || d.date,
      amount: d.amount, cashUpi: cashUpiNote(d), collector: d.collector || d.collectorId || '',
      receiptNo: d.receiptNo || '' };
  }
  // The words that go WITH a receipt, wherever it is sent. One function, so the
  // WhatsApp caption and the SMS body can never say different things.
  function receiptMessage(rc) {
    const cfg = receiptConfig();
    return [
      '🙏 ' + cfg.committee,
      tBn('rcp_msg_thanks'),
      rc.corrected ? tBn('rcp_msg_corrected') : '',
      '',
      rc.donorLine,
      tBn('receipt_amount') + ': ' + rcpMoney(rc.amount) + '/- (' + banglaNumWords(rc.amount) + ' টাকা মাত্র)',
      (rc.showTotals ? tBn('paid') + ': ' + rcpMoney(rc.paidTotal) + '/' + rcpMoney(rc.pledged) +
        '   ' + tBn('due') + ': ' + rcpMoney(rc.due) : ''),
      // A67: over SMS there IS no image, so the sentence has to be here too —
      // otherwise the one receipt that cannot show a number is also the one
      // that never says why.
      (rc.receiptNo ? tBn('receipt_no') + ' ' + rc.receiptNo : tBn('rcp_no_pending_stamp')) +
        (rc.date ? ' · ' + fmtDate(rc.date) : ''),
      // A83: over SMS there is no image, so the collector's name has to be in
      // the words too — the receipt that cannot show a picture is exactly the
      // one a donor will be holding when they ask who took the cash.
      (rc.collector ? 'সংগ্রাহক: ' + rc.collector : ''),
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
    const wa = waNumber(phone);
    // left blank rather than wrong when the number is unusable: the messaging
    // app then opens with an empty recipient the collector can fill in, which
    // is recoverable. A wrong number is not.
    const num = wa ? '+' + wa : '';
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
        const p = liveParties(data).filter(function (x) { return x.id === params.partyId; })[0];
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
        // A135b (Hrishi's call): the receipt IS the picture — one form of a
        // money document, not two. So the image keeps the WhatsApp button to
        // itself. What stays from A135 is the one line that ANSWERS the
        // question this screen kept raising ("why must I pick the name
        // again?"): no phone lets a web page pre-address a picture, so the
        // share sheet must ask. Said once, on the screen, instead of being
        // rediscovered every season.
        $view().innerHTML = backBar(backView, backParams) + '<div class="flow-title">' + esc(t('receipt_title')) + '</div>' +
          '<img id="rcp-img" alt="" style="width:100%;max-width:420px;display:block;margin:0 auto 12px;border:1px solid #eee;border-radius:10px">' +
          (rc.receiptNo ? '' : '<div class="hint" style="text-align:center">' + esc(t('receipt_no_pending')) + '</div>') +
          '<button id="rcp-wa" class="primary big block">📷 ' + esc(t('receipt_send_img')) + '</button>' +
          '<div class="hint" style="margin:-4px 4px 10px">' + esc(t('receipt_img_hint')) + '</div>' +
          '<button id="rcp-sms" class="ghost big block">💬 ' + esc(t('receipt_send_sms')) + '</button>' + contHtml;
        buildReceiptCanvas(rc).then(function (cv) { const im = document.getElementById('rcp-img'); if (im) im.src = cv.toDataURL('image/png'); });
        document.getElementById('rcp-wa').onclick = function () { shareReceiptImage(rc); };
        document.getElementById('rcp-sms').onclick = function () { shareReceiptText(rc, phone); };
        contWire();
      };
      paint();
      // if no serial yet, sync + pull to obtain one, then redraw
      if (!rc.receiptNo && navigator.onLine && Sync.configured()) {
        Sync.syncNow().then(function () { resetPullBackoff(); return pullCentral({ force: true }); }).then(function () {
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
  // A60 (audit 2.1): who may correct a DONOR row.
  //
  // Deliberately the opposite rule to canVoid. A money row is append-only and
  // you may never cancel your own — that is separation of duties, and it is
  // why a collector cannot quietly unmake a payment they took. A donor row is
  // not money; it is an identity that payments point AT. A mistyped pledge is
  // wrong all season and raises a permanent `overpaid` anomaly nobody can
  // clear; a misspelt name is unsearchable, so the next collector writes the
  // shop down a second time and the book has twins. The person who typed it is
  // the one standing in front of the shop, so the person who typed it should be
  // able to fix it.
  //
  // Creator or admin, and no wider. A cashier is excluded on purpose: the push
  // re-stamps identity from the token and only the admin branch preserves the
  // original collector, so a cashier's edit would silently re-attribute the
  // donor to the cashier.
  // A60 (audit 2.1): ONE answer to "which donors are still in the book".
  // Aggregation already drops voided rows through Aggregate.activeData, but the
  // SCREENS read data.parties raw — so before this, a removed donor vanished
  // from every total and stayed visible in every list. A row you can see, tap
  // and add a payment to, but which no report counts, is worse than either
  // showing it or hiding it consistently.
  function liveParties(data) {
    const v = Aggregate.voidedIds(data);
    let rows = (data.parties || []).filter(function (p) { return p && !v[p.id]; });
    // A78: a stood-down member sees only the donors they brought in, because
    // those are the only ones the server will let them collect from. Done at
    // the ONE choke point all eleven listing sites read, not per screen: the
    // alternative is a book full of shops that reject the payment after it is
    // typed, which is the failure this project keeps having to relearn — a
    // control that looks available and then does nothing.
    const me = Auth.current();
    if (me && String(me.access || '') === 'exiting') {
      const myId = Settings.get('collectorUsername') || me.username;
      rows = rows.filter(function (p) { return p.collectorId === myId; });
    }
    return rows;
  }
  // A78d: ONE predicate for "the committee has stood this person down", because
  // the server's allow-list refuses five stores and the UI was offering three
  // of them anyway. Found by walking the live app as one of them rather than by
  // reading the code — every one of those buttons opened a form, took the
  // typing, and had the row thrown away on arrival. That failure has its own
  // name in this project by now, and the only defence that has ever worked is
  // one predicate every screen asks, instead of a rule each screen remembers.
  function amExiting() {
    const u = Auth.current();
    return !!u && String(u.access || '') === 'exiting';
  }
  function canEditParty(p) {
    const u = Auth.current();
    if (!u || !p) return false;
    if (u.role === 'admin') return true;
    if (amExiting()) return false; // push refuses `parties` for them
    const myId = Settings.get('collectorUsername') || u.username;
    return !!p.collectorId && p.collectorId === myId;
  }
  function canVoid(entry) {
    const u = Auth.current();
    if (!u) return false;
    // A116i: voiding moves money out of the book — frozen means frozen. The
    // admin exemption rides inside frozen() itself, same as everywhere else.
    if (frozen()) return false;
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
  // A123 (trial: "we are not able to understand the entry type"): every
  // summary now LEADS with what kind of money this is. "শিকল দাতা — ₹200" and
  // "প্যান্ডেল — ₹50" looked identical on the mixed lists — one is a donor's
  // payment, the other an expense, and only the reader's memory could tell.
  // One helper feeds ✏️ rows, the 🛠️ desk (via the stored targetSummary) and
  // the flag screen, so the word travels everywhere at once.
  function entrySummary(store, r) {
    const amt = fmtMoney(r.amount);
    if (store === 'payments') return '💰 ' + t('es_payment') + ' · ' + (r.partyName || '?') + ' — ' + amt;
    if (store === 'daily') {
      const em = { road: '🛣️', toto: '🛺', bus: '🚌' }[r.type] || '';
      return (em ? em + ' ' : '') + t('type_' + r.type) +
        (r.type === 'bus' && r.busName ? ' ' + r.busName : '') + ' — ' + amt;
    }
    if (store === 'expenses') return '🧾 ' + t('es_expense') + ' · ' + expenseTitle(r) + ' — ' + amt;
    if (store === 'handovers') return '🤝 ' + t('handover') + ' → ' + (r.to || '?') + ' — ' + amt;
    return amt;
  }
  // A140: one pot, opened. The equation comes first and DERIVES the figure the
  // caller tapped — same discipline as A136's season line — then the rows that
  // make up each term, in the app's usual kind-first shape.
  function renderPotDetail(params) {
    const cat = (params || {}).cat || '';
    const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
    $view().innerHTML = backBar('report') + '<div class="empty">' + esc(t('loading')) + '</div>';
    viewData().then(function (data) {
      const p = Aggregate.potDetail(data, ident, cat);
      const name = t(CAT_LABEL_KEYS[cat] || 'cat_other');
      const rowsOf = function (b, negative) {
        return b.rows.map(function (x) {
          const head = x.store === 'handovers'
            ? '🤝 ' + (String(x.r.fromId || x.r.from) === String(ident)
                ? t('my_handed') + ' → ' + (x.r.to || '?')
                : t('my_received') + ' ← ' + (x.r.from || '?'))
            : entrySummary(x.store, x.r);
          return '<div class="row" style="cursor:default"><div><b>' + esc(head) + '</b>' +
            '<div class="row-sub">' + esc(fmtDate(x.r.date || x.r.createdAt)) + '</div></div>' +
            '<div class="row-right">' + (negative ? '−' : '') + fmtMoney(x.amount) + '</div></div>';
        }).join('');
      };
      const block = function (titleKey, b, negative) {
        if (!b.rows.length) return '';
        return '<div class="card"><div class="card-title">' + esc(t(titleKey)) + ' — ' +
          (negative ? '−' : '') + fmtMoney(b.total) + '</div>' + rowsOf(b, negative) + '</div>';
      };
      const term = function (label, amt) {
        return '<span class="term">' + esc(label) + ' <b>' + fmtMoney(amt) + '</b></span>';
      };
      $view().innerHTML = backBar('report') +
        '<div class="flow-title">' + esc(name) + ' — ' + esc(t('pot_title')) + '</div>' +
        '<div class="hint" style="margin:0 4px 8px">' + esc(t('pot_hint')) + '</div>' +
        '<div class="tillnow"><div class="eqrow">' +
          term(t('my_collected'), p.collected.total) +
          (p.receivedIn.total ? '<span class="op">+</span>' + term(t('my_received'), p.receivedIn.total) : '') +
          (p.expenses.total ? '<span class="op">−</span>' + term(t('expense'), p.expenses.total) : '') +
          (p.handedOut.total ? '<span class="op">−</span>' + term(t('my_handed'), p.handedOut.total) : '') +
          // legacy rows the old drain rule spread across pots: named, not hidden
          (p.unattributed ? '<span class="op">' + (p.unattributed < 0 ? '−' : '+') + '</span>' +
            term(t('pot_other'), Math.abs(p.unattributed)) : '') +
          '<span class="op">=</span><span class="term res">' + esc(t('eq_inhand')) + ' <b>' +
            fmtMoney(p.total.total) + '</b> ✓</span>' +
        '</div><span class="sub">💵 ' + esc(t('cash')) + ' ' + fmtMoney(p.total.cash) +
          ' · 📱 ' + esc(t('upi')) + ' ' + fmtMoney(p.total.upi) + '</span></div>' +
        block('my_collected', p.collected, false) +
        block('my_received', p.receivedIn, false) +
        block('expense', p.expenses, true) +
        block('my_handed', p.handedOut, true) +
        (p.collected.rows.length || p.receivedIn.rows.length || p.expenses.rows.length || p.handedOut.rows.length
          ? '' : '<div class="empty">' + esc(t('no_entries')) + '</div>') +
        '<button class="ghost big block" data-go="entries">✏️ ' + esc(t('my_entries_title')) + ' ›</button>';
      wireNav();
    });
  }
  // A132: what the epoch wipe could not keep. Read-only by design — these rows
  // belong to a book the server has discarded; the ONLY correct action is to
  // re-enter them through the normal doors, which stamps them with the new
  // book's epoch and a real receipt serial.
  function graveyardRead() {
    try { return JSON.parse(localStorage.getItem('ck_wiped_entries') || '[]') || []; } catch (e) { return []; }
  }
  function renderGraveyard() {
    const list = graveyardRead();
    $view().innerHTML = backBar('settings') +
      '<div class="flow-title">🪦 ' + esc(t('graveyard_title')) + '</div>' +
      '<div class="hint" style="margin-bottom:8px">' + esc(t('graveyard_hint')) + '</div>' +
      (list.length ? list.map(function (x) {
        const r = x.row || {};
        const head = x.store === 'parties'
          ? '👥 ' + (r.name || '?') + (Number(r.pledged) ? ' · ' + fmtMoney(r.pledged) : '')
          : entrySummary(x.store, r);
        return '<div class="row" style="cursor:default"><div><b>' + esc(head) + '</b>' +
          '<div class="row-sub">' + esc(fmtDate(r.date || r.createdAt)) +
          (r.note ? ' • ' + esc(r.note) : '') + '</div></div>' +
          (Number(r.amount) ? '<div class="row-right">' + fmtMoney(r.amount) + '</div>' : '') +
          '</div>';
      }).join('') : '<div class="empty">' + esc(t('graveyard_empty')) + '</div>') +
      (list.length ? '<button id="grave-clear" class="ghost big block">' + esc(t('graveyard_clear')) + '</button>' : '');
    const gc = document.getElementById('grave-clear');
    if (gc) gc.onclick = function () {
      if (!window.confirm(t('graveyard_clear_confirm'))) return;
      try { localStorage.removeItem('ck_wiped_entries'); } catch (e) {}
      toast('✅ ' + t('saved'));
      navigate('settings');
    };
  }
  // A133: name/phone/email — display identity only; money is keyed by
  // username, which this screen deliberately cannot touch. Two doors, one
  // form: no params = my own card (anyone), params.username = that user's
  // card (admin only — the server re-checks).
  function renderProfileForm(params) {
    const target = (params || {}).username || '';
    let src = Auth.current() || {};
    if (target) {
      src = (admCache && (admCache[0].users || []).filter(function (u) { return u.username === target; })[0]) ||
            memberUser(target) || { username: target };
    }
    // "আমার তথ্য" on someone ELSE's card would read as the admin editing
    // their own — the target's form is titled by the fields instead
    $view().innerHTML = backBar(target ? 'admin' : 'settings') +
      '<div class="flow-title">✏️ ' + esc(target ? t('profile_btn') + ' — @' + target : t('profile_title')) + '</div>' +
      '<div class="hint" style="margin-bottom:8px">' + esc(t('profile_hint')) + '</div>' +
      '<div class="card">' +
      '<div class="field"><label>' + esc(t('full_name')) + '</label>' +
      '<input id="pf-name" value="' + esc(src.name || '') + '" autocomplete="off"></div>' +
      '<div class="field"><label>📞 ' + esc(t('member_f_phone')) + '</label>' +
      '<input id="pf-phone" value="' + esc(src.phone || '') + '" inputmode="tel" autocomplete="off"></div>' +
      '<div class="field"><label>✉️ ' + esc(t('member_f_email')) + '</label>' +
      '<input id="pf-email" value="' + esc(src.email || '') + '" inputmode="email" autocapitalize="none" autocomplete="off"></div>' +
      '<div id="pf-err" class="perm-warn" style="display:none"></div></div>' +
      '<button id="pf-save" class="primary big block">' + esc(t('save')) + '</button>';
    const err = function (msg) {
      const el = document.getElementById('pf-err');
      el.textContent = msg; el.style.display = msg ? 'block' : 'none';
    };
    document.getElementById('pf-save').onclick = function () {
      err('');
      const name = document.getElementById('pf-name').value.trim();
      const phone = document.getElementById('pf-phone').value.trim();
      const email = document.getElementById('pf-email').value.trim();
      if (!name) { err(t('fill_all')); return; }
      if (phone && phoneErrIN(phone)) { err(t('err_phone_in')); return; }
      if (email && !/^\S+@\S+\.\S+$/.test(email)) { err(t('err_email')); return; }
      const btn = this, undo = busyBtn(btn);
      Auth.call('updateProfile', { token: Auth.token(), username: target,
        name: name, phone: phone ? cleanPhoneIN(phone) : '', email: email })
        .then(function (r) {
          if (!target) {
            // my own card: the stored session and the meId-name every screen
            // reads must follow, or the header greets the OLD name until the
            // next login
            try { localStorage.setItem('ck_user', JSON.stringify(r.user)); } catch (e) {}
            Settings.set('collectorName', r.user.name || name);
          } else if (admCache) {
            admPut(r.user);
          }
          toast('✅ ' + t('saved'));
          navigate(target ? 'admin' : 'settings');
        })
        .catch(function (e) { undo(); err(errMsg(e)); });
    };
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
      const btn = this;
      btn.disabled = true;
      // A47: somebody may have cancelled this while you were typing the reason.
      // The MATHS was never at risk — Aggregate.voidedIds keys on targetId, so a
      // second cancellation subtracts nothing twice — but two rows in the book
      // for one act is a lie about what happened, and it makes the audit read
      // as if two people acted when one did. Checked here, at the moment of
      // writing, against the central snapshot this device already holds: no
      // lock to get stuck, and no extra call.
      viewData().then(function (data) {
        const done = (data.voids || []).filter(function (v) {
          return v.targetStore === targetStore && v.targetId === targetId;
        })[0];
        if (done) {
          alert(t('void_already').replace('{who}', done.collector || '?')
            .replace('{when}', done.createdAt ? agoText(done.createdAt) : ''));
          backFn();
          return;
        }
        return DB.put('voids', DB.newRow({ targetStore: targetStore, targetId: targetId, reason: reason }))
          .then(function () { toast(t('voided_done')); updateBadge(); autoSync(); backFn(); });
      }).catch(function (e) { btn.disabled = false; toast(errMsg(e)); });
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
      // The donor TYPE decides whether the comment is mandatory (members) — and
      // a payment row does not carry it, so look the donor up first. Async like
      // startExpense's subject load; without this an edited member payment would
      // silently drop back to an optional comment.
      viewData().then(function (data) {
        const ep = (data.parties || []).filter(function (x) { return x.id === row.partyId; })[0] || {};
        const d = paymentFlow({ id: row.partyId, name: row.partyName || ep.name || '', type: ep.type || '' }, 'entries', true);
        d.presets = Object.assign({ __receipt: row.receiptNo || '' }, money);
        d.editing = { store: store, id: row.id, reason: reason };
        d.title = t('edit_title') + ' — ' + d.title;
        d.returnTo = 'entries';
        startFlow(d);
      });
      return;
    } else if (store === 'daily') {
      def = dailyFlow(row.type);
      def.presets = Object.assign({ busName: row.busName || '', busNumber: row.busNumber || '',
                                    __receipt: row.receiptNo || '' }, money);
    } else if (store === 'expenses') {
      // the expense flow needs its subject list; reuse the same loader the
      // normal entry path uses so an offline edit still works
      startExpense({ presets: Object.assign({ subject: row.subject || '', comment: row.desc || '' }, money),
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
        // A78d: …and not while standing down. `daily` and `expenses` are refused
        // outright for them, and a corrected `payments` row still has to pass
        // the own-donor test — so the ✏️ that appears on an old round is a form
        // that cannot be saved.
        const canEdit = isFlag && !isVoid && mineNow && !amExiting() &&
          ['payments', 'daily', 'expenses'].indexOf(it.store) >= 0;
        const editBtn = canEdit
          ? '<button class="chip void-btn" data-ed="' + it.store + '|' + esc(r.id) + '">✏️ ' + esc(t('fix_btn')) + '</button>'
          : '';
        // A78e: the ⚠️ flag comes BACK for a stood-down member — it is not an
        // entry, it is telling the cashier "the ₹500 I took is written down as
        // ₹5,000". They still cannot void or edit; they can only report, and
        // somebody else decides. ✏️ above stays shut, because that IS an edit.
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
      $view().innerHTML = backBar('home') + '<div class="flow-title">✏️ ' + esc(t('my_entries_title')) + '</div>' + tabs +
        '<div class="hint" style="margin-bottom:10px">' + esc(t(all ? 'entries_all_hint' : 'my_entries_hint')) +
        // A121b/A122: the one-line hint cannot hold the whole process — the
        // door lands on the guide's fix-section and ← returns here.
        guideDoor('fix') + '</div>' + rowsHTML;
      document.querySelectorAll('[data-escope]').forEach(function (b) {
        b.onclick = function () { entriesScope = b.dataset.escope; renderMyEntries(); };
      });
      wireGuideDoors();
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
    // A111: canReview() is TWO conditions and this said only one of them, so a
    // cashier who simply lacks the 🛠️ grant was told they are not a cashier —
    // false, and it sends them to argue about the wrong thing. A110 added a
    // third way in: the freeze also closes canEntry('review'), and answering
    // that with "no permission" would be the same lie in a new costume.
    if (!canReview()) {
      const why = !Auth.isCashier() ? 'not_cashier' : frozen() ? 'freeze_bar' : 'no_review_grant';
      $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t(why)) + '</div>';
      return;
    }
    $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('loading')) + '</div>';
    // A118b: this desk waited on a pendingCorrections round trip while the
    // corrections store rides every pull — the server's list is nothing but
    // `corrections.filter(status === 'pending')` over the same rows. Painting
    // from the snapshot opens the desk at once; both answer buttons still go
    // through resolveCorrection, which re-reads the row's status under its
    // lock and refuses one already settled ('already-resolved', tested).
    viewData().then(function (data) {
      // A flag whose target the author has already corrected is settled — the
      // old row is voided and a new one stands in its place. Showing it here
      // would invite a second void on a row that is already gone.
      const done = {}; (data.voids || []).forEach(function (v) { if (v.targetId) done[v.targetId] = 1; });
      const list = (data.corrections || []).filter(function (c) {
        return String(c.status || 'pending') === 'pending' && !done[c.targetId] && !resolvedFlags[c.id];
      });
      const html = list.length ? list.map(function (c) {
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 100%"><b>' +
          esc(c.targetSummary || c.targetStore) + '</b><div class="row-sub">' + esc(c.collector || '') +
          ' • ' + esc(c.reason) + '</div></div><div class="chips" style="margin-top:8px">' +
          '<button class="chip" data-corr-ok="' + esc(c.id) + '">' + esc(t('corr_approve')) + '</button>' +
          '<button class="chip" data-corr-no="' + esc(c.id) + '">' + esc(t('corr_reject')) + '</button></div></div>';
      }).join('') : '<div class="empty">' + esc(t('review_none')) + '</div>';
      $view().innerHTML = backBar('home') + '<div class="flow-title">🛠️ ' + esc(t('review_title')) + '</div>' +
        // A121: this desk had no hint at all — empty, it said only "কেউ নেই",
        // which explains neither what the desk is nor what would appear here.
        // Its sibling (my-entries) always had one; the N−1th sentence.
        '<div class="hint" style="margin-bottom:10px">' + esc(t('review_hint')) + guideDoor('fix') + '</div>' + html;
      const resolve = function (id, decision, okMsg) {
        return function () {
          const btn = this, undo = busyBtn(btn);
          Auth.call('resolveCorrection', { token: Auth.token(), id: id, decision: decision })
            .then(function () {
              // A120: only after the server said ok — then an answered flag can
              // never be re-drawn from a snapshot that predates the answer. The
              // row settles in place (A44's rule: the desk is worked DOWN, a
              // rebuild throws the cashier back to the top), and the forced
              // pull catches the snapshot up — A117 queues it if a poll is
              // already in flight, which is exactly how the 🩺 desk does it.
              resolvedFlags[id] = 1;
              toast(okMsg);
              const row = btn.closest('.row');
              if (row) row.remove();
              if (!$view().querySelectorAll('.row').length) renderReviewCorrections();
              pullCentral({ force: true }).catch(function () {});
            })
            .catch(function (e) { undo(); toast(errMsg(e)); });
        };
      };
      wireGuideDoors();
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
      // A151: the line the in-hand figure has always been missing. NOT subtracted
      // — the committee really does hold that cash — but named, so nobody plans
      // against money an artist is already waiting for.
      ((tt.spokenFor && tt.spokenFor.total) ?
        '<div class="strip act">' + esc(t('spoken_for')) + ': ' + fmtMoney(tt.spokenFor.total) +
          ' · ' + esc(t('really_free')) + ': <b>' + fmtMoney(tt.inHand - tt.spokenFor.total) + '</b>' +
          '<span class="sub">' + esc(t('spoken_for_note')) + '</span></div>' : '') +
      '<div class="stat3"><div><span>' + esc(t('total_pledged')) + '</span><b>' + fmtMoney(tt.totalPledged) + '</b></div>' +
      '<div class="red"><span>' + esc(t('total_due')) + '</span><b>' + fmtMoney(tt.totalDue) + '</b></div><div></div></div>' +
      '<div class="stat3"><div><span>' + esc(t('total_cash')) + '</span><b>' + fmtMoney(tt.totalCash) + '</b></div>' +
      '<div><span>' + esc(t('total_upi')) + '</span><b>' + fmtMoney(tt.totalUpi) + '</b></div><div></div></div>' +
      // A147: every key the computation produced, not a hand-written list of
      // three. computeReport's byType learned about স্পনসর and গুপ্ত দান; this
      // renderer did not, so the admin's overview printed মোট আদায় ₹74,100 over
      // rows that added to ₹36,500 — and a মোট বাকি of ₹67,700 with no row to
      // explain it. Fifth copy of the same list in this codebase; the fix is
      // always the same one: read what the data says instead of retyping it.
      Object.keys(tt.byType || {}).filter(function (k) { return tt.byType[k].count; }).map(typeRow).join('') +
      // A154: a kind with nothing in it is not news. The puja's book will never
      // hold a টিকিট, so printing "টিকিট ₹0" on its overview is a row that only
      // teaches people to skim past rows.
      Object.keys(tt.dailyByType || {}).filter(function (k) { return tt.dailyByType[k]; })
        .map(dailyRow).join('') +
      dutyBlockHTML(tt.commitments, (tt.spokenFor || {}).total) +
      (Auth.isCashier() && !frozen() ? '<button id="duty-btn" class="ghost big block">' +
        esc(t('duty_add')) + '</button>' : '') +
      // A154: THE one place the committee's combined figure lives.
      //
      // Everything above it is the puja's own book now — the programme has its
      // own tab. But somebody at the meeting will ask "সব মিলিয়ে কমিটির হাতে
      // কত?", and there has to be exactly one screen that answers it. One place,
      // not a second column on every screen: that was the mistake A148 made and
      // this replaces.
      //
      // Only drawn once the programme is actually in use — a committee without
      // one sees the screen it always saw.
      (tt.bySector && tt.bySector.program &&
       (tt.bySector.program.collected || tt.bySector.program.expense)
        ? '<div class="secttl">' + esc(t('both_books')) + '</div>' +
          ['puja', 'program'].map(function (k) {
            const b = tt.bySector[k];
            return '<div class="row"><div>' + esc(t('sector_' + k)) + '</div>' +
              '<div class="row-right">' + fmtMoney(b.collected) + ' − ' + fmtMoney(b.expense) +
              ' = <b>' + fmtMoney(b.balance) + '</b></div></div>';
          }).join('') +
          (function () {
            const p = tt.bySector.puja, g = tt.bySector.program;
            return '<div class="row"><div><b>' + esc(t('both_books_total')) + '</b></div>' +
              '<div class="row-right"><b>' + fmtMoney(p.balance + g.balance) + '</b></div></div>';
          })() +
          '<div class="hint" style="margin-top:6px">' + esc(t('both_books_note')) + '</div>'
        : '') + '</div>';
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
      // A137: the colour, said in words on the card that uses it — the cashier
      // reads this screen without the collector's legend in front of them
      '<div class="row-sub" style="margin:-4px 4px 8px">' + esc(t('inhand_colour_note')) + '</div>' +
      rows.map(function (r) {
        const parts = [esc(t('collected_col')) + ' ' + fmtMoney(r.collected)];
        if (r.received) parts.push(esc(t('received_col')) + ' ' + fmtMoney(r.received));
        if (r.handedOver) parts.push(esc(t('handed_col')) + ' ' + fmtMoney(r.handedOver));
        if (r.spent) parts.push(esc(t('spent_col')) + ' ' + fmtMoney(r.spent));
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 60%"><b>' + esc(r.collector) + '</b>' +
          '<div class="row-sub">' + parts.join(' • ') + '</div>' +
          (r.pending ? '<div class="row-sub">⏳ ' + esc(t('my_pending')) + ': ' + fmtMoney(r.pending) + '</div>' : '') +
          byCatInline(r.byCat) +
          // A137: one colour, one meaning — the rule the legend states and this
          // report broke. Money still with a collector is GOLD ("counted now,
          // will leave"), not red: red is the app's word for a shortfall, and
          // painting every healthy collector red taught the cashier to read red
          // as ordinary. Settled is green. And a NEGATIVE in-hand — someone who
          // overspent — used to come out green with everything else at zero,
          // which is the one row that genuinely needs red.
          '</div><div class="row-right"><span class="' +
          (r.inHand > 0 ? 'gold' : r.inHand < 0 ? 'red' : 'green') + '"><b>' +
          fmtMoney(r.inHand) + '</b></span><div class="row-sub">' + esc(t('inhand_col')) + '</div></div></div>';
      }).join('') + '</div>';
  }
  // order = how every report lists the pots; bus grouped with the new-entry
  // types to match the home screen and the handover sheet
  const OWN_SRC = Aggregate.OWN_SRC;
  const CAT_LABEL_KEYS = { shop: 'new_shop', person: 'new_person', member: 'new_member',
                           sponsor: 'new_sponsor', gupt: 'new_gupt',
                           payment: 'cat_payment', bus: 'daily_bus',
                           road: 'daily_road', toto: 'daily_toto', ticket: 'daily_ticket', received: 'cat_received',
                           other: 'cat_other' };
  // byCatHTML() and handedToHTML() lived here until v4.4.0. Both are now inside
  // mySummaryHTML's drill-down: the pot table became level 2 of each group, and
  // "কাকে কত জমা দিয়েছি" became the three handover slots — per handover rather
  // than merged per person, because one parcel can be approved while another
  // from the same person is rejected.
  // Dictionary text with money figures spliced in. The WORDS go through esc();
  // the figures come from fmtMoney (digits, ₹, −, commas only), so this stays
  // injection-free while keeping markup out of i18n.js. Never pass user data.
  function tMoney(key) {
    const nums = Array.prototype.slice.call(arguments, 1);
    const parts = esc(t(key)).split('{n}');
    let out = parts[0];
    for (let i = 1; i < parts.length; i++) out += '<b>' + fmtMoney(nums[i - 1] || 0) + '</b>' + parts[i];
    return out;
  }
  const SUM_GROUP_KEYS = { entry: 'grp_entry', daily: 'grp_daily', other: 'grp_received',
                           sponsor: 'grp_sponsor', gupt: 'grp_gupt', ticket: 'grp_ticket' };
  // A144: which summary bands the 👁️ curtain covers.
  const CURTAIN_GROUPS = { sponsor: 1, gupt: 1 };
  function grpHTML(open, name, amt, kids, cls) {
    return '<div class="grp' + (open ? ' open' : '') + (cls ? ' ' + cls : '') + '">' +
      '<button class="head" data-grp="1"><span class="car">▶</span><span class="nm">' + name + '</span>' +
      '<span class="amt">' + amt + '</span></button><div class="kids">' + kids + '</div></div>';
  }
  // level 2 of a group: the pots inside it. A pot can be negative when its
  // expenses outran it — Hrishi's rule is that this stays visible and gets
  // squared up later by exchanging cash, so it is never hidden or borrowed from.
  function potKidsHTML(pots) {
    return pots.map(function (p) {
      const neg = p.total < 0;
      // A140: the pot opens. It is a BUTTON, not a div, because a figure you
      // cannot open is a figure people learn to distrust — and this is the
      // level where "where did my ₹3,400 come from" is actually asked.
      return '<button class="kid open-pot' + (neg ? ' neg' : '') + '" data-pot="' + esc(p.key) + '"><span class="k">' +
        esc(t(CAT_LABEL_KEYS[p.key] || 'cat_other')) +
        (neg ? '<span class="note">' + esc(t('sum_pot_debt')) + '</span>' : '') +
        '</span><span class="v">' + fmtMoney(p.total) + ' ›</span></button>';
    }).join('');
  }
  // level 2 of a handover slot: one row per HANDOVER, not per person. A cashier
  // can approve one parcel and reject another, so merging them by name would
  // leave a row that matches neither outcome.
  function slotRowsHTML(rows, noteKey) {
    return rows.map(function (h) {
      const split = ' · 💵' + fmtMoney(Number(h.cashAmount) || 0) + ' · 📱' + fmtMoney(Number(h.upiAmount) || 0);
      // A refused parcel carries the receiver's REASON — that is the whole point
      // of the slot, and it is the only thing the sender can act on. Falling back
      // to the pending wording ("hasn't confirmed yet") would be a plain lie.
      // A136 (G6): the template below already writes the ' · ' separator — a
      // leading one here printed "2026-08-31 · · “reason”" on every ❌ row
      const tail = noteKey === 'slot_rejected_row'
        ? (h.rejectReason ? '“' + esc(h.rejectReason) + '”' : esc(t('slot_rejected_norsn')))
        : esc(t(noteKey)) + (noteKey === 'slot_got_row' ? split : '');
      return '<div class="kid"><span class="k">' + esc(h.to || h.toId || h.from || '?') +
        '<span class="note">' + esc(fmtDate(h.date)) + ' · ' + tail + '</span></span>' +
        '<span class="v">' + fmtMoney(Number(h.amount) || 0) + '</span></div>';
    }).join('');
  }
  function legendHTML() {
    const rows = [['green', 'legend_green', 'legend_green_v'], ['gold', 'legend_gold', 'legend_gold_v'],
                  ['blue', 'legend_blue', 'legend_blue_v'], ['grey', 'legend_grey', 'legend_grey_v'],
                  ['red', 'legend_red', 'legend_red_v']];
    return '<div class="calc lg" style="margin-top:10px">' +
      grpHTML(false, esc(t('legend_title')), '',
        rows.map(function (r) {
          return '<div class="kid lgrow"><span class="k"><i class="sw sw-' + r[0] + '"></i>' +
            esc(t(r[1])) + '<span class="note">' + esc(t(r[2])) + '</span></span></div>';
        }).join('') + '<div class="expl">' + esc(t('legend_note')) + '</div>') + '</div>';
  }
  // A136: one term of the season equation. A term with money behind it is a
  // BUTTON to its proof rows (data-go view, or an id the caller wires); a zero
  // term is plain text — a button that does nothing teaches people to stop
  // pressing buttons.
  function eqTerm(label, amount, go, id) {
    const inner = esc(label) + ' <b>' + fmtMoney(amount) + '</b>';
    if (!amount) return '<span class="term">' + inner + '</span>';
    if (id) return '<button class="term" id="' + id + '">' + inner + '</button>';
    return '<button class="term" data-go="' + go + '">' + inner + '</button>';
  }
  // A141: whether "হিসাব দেখি" is open, kept across renders — the report is
  // re-rendered on every pull, every notification and every return from a pot,
  // and each of those used to fold it shut under the reader.
  let sumOpen = false;
  // m = Aggregate.mySummary(). Three levels: the hero alone, then the group
  // totals, then each group's pots. Everything below the hero is a slice OF the
  // hero, so no figure on this screen can contradict the one at the top.
  function mySummaryHTML(m, deviceOnly) {
    const hero = m.hero.total, pend = m.out.pending, rej = m.out.rejected, ok = m.out.confirmed;
    const pin = m.incoming.pending;
    return '<div class="sum-hero">' +
        '<div class="lbl">' + esc(t('sum_hero')) + '</div>' +
        '<div class="big' + (hero < 0 ? ' neg' : '') + '">' + fmtMoney(hero) + '</div>' +
        '<div class="split">💵 ' + esc(t('cash')) + ' <b>' + fmtMoney(m.hero.cash) + '</b> · 📱 ' +
          esc(t('upi')) + ' <b>' + fmtMoney(m.hero.upi) + '</b></div>' +
        // A136: the day's own line — collectors think in days, the hero is
        // all-time, and "আজ কত তুললাম" had no answer on the money screen
        (m.today ? '<div class="split">📅 ' + esc(t('today_short')) + ' — ' + esc(t('my_collected')) +
          ' <b>' + fmtMoney(m.today.collected) + '</b>' +
          (m.today.expense ? ' · ' + esc(t('expense')) + ' <b>' + fmtMoney(m.today.expense) + '</b>' : '') +
          '</div>' : '') +
        (deviceOnly ? '<div class="sub" style="font-size:12px;color:var(--sub);margin-top:6px">' +
          esc(t('my_device_note')) + '</div>' : '') +
        '<button class="sum-more" id="sum-toggle">' + esc(t(sumOpen ? 'sum_close' : 'sum_open')) + '</button>' +
        // money that is NOT in the hero but needs an action from this person
        (pin.total ? '<div class="strip act">' + tMoney('strip_pend_in', pin.total) +
          '<span class="sub">' + esc(t('strip_pend_in_sub')) + '</span>' +
          '<button class="cta" data-go="cashier">' + esc(t('strip_pend_in_cta')) + '</button></div>' : '') +
        // money that IS in the hero but is on its way out
        (pend.total ? '<div class="strip">' + tMoney('strip_pend_out', pend.total) +
          '<span class="sub">' + tMoney('strip_pend_out_sub', m.afterApprove) + '</span></div>' : '') +
        // money that came back: the hero never moved, which is exactly what
        // confuses people, so say it in so many words
        (rej.total ? '<div class="strip act">' + tMoney('strip_rejected', rej.total) +
          '<span class="sub">' + tMoney('strip_rejected_sub', hero) + '</span></div>' : '') +
      '</div>' +
      '<div id="sum-body"' + (sumOpen ? '' : ' hidden') + '>' +
        '<div class="secttl">' + esc(t('sum_where')) + '</div><div class="calc">' +
          m.groups.map(function (g) {
            const name = esc(t(SUM_GROUP_KEYS[g.key] || 'cat_other'));
            // A144: the curtain covers the ROWS, never the amount. The band's
            // total and the hero above it stay exactly as they were, because
            // this money is still in this person's hand and still has to be
            // handed over — a curtain that changed the arithmetic would have
            // them quote a wrong total out loud and hand over short.
            if (curtainOn && CURTAIN_GROUPS[g.key]) {
              return grpHTML(false, name + ' <span class="row-sub">🙈</span>',
                fmtMoney(g.total), '<div class="expl">' + esc(t('curtain_covered')) + '</div>', 'nobox');
            }
            return grpHTML(true, name, fmtMoney(g.total), potKidsHTML(g.pots));
          }).join('') +
          '<div class="final"><span class="k">' + esc(t('sum_total')) + '</span>' +
            '<span class="v">' + fmtMoney(hero) + '</span></div>' +
        '</div>' +
        (pend.total || rej.total || ok.total ?
          '<div class="secttl">' + esc(t('sum_handover')) + '</div><div class="calc">' +
            (pend.total ? grpHTML(true, esc(t('slot_pending')), fmtMoney(pend.total),
              slotRowsHTML(pend.rows, 'slot_await_row') +
              '<div class="expl">' + tMoney('slot_pending_note', m.afterApprove) + '</div>', 'pendbox') : '') +
            (rej.total ? grpHTML(true, esc(t('slot_rejected')), fmtMoney(rej.total),
              slotRowsHTML(rej.rows, 'slot_rejected_row') +
              '<div class="expl">' + esc(t('slot_rejected_note')) + '</div>', 'nobox') : '') +
            (ok.total ? grpHTML(false, esc(t('slot_confirmed')), fmtMoney(ok.total),
              slotRowsHTML(ok.rows, 'slot_got_row') +
              '<div class="expl">' + tMoney('slot_confirmed_note', hero) + '</div>', 'okbox') : '') +
          '</div>' : '') +
        legendHTML() +
        // A136 (G1+G8): the season line IS the account now. It used to list the
        // same four figures and then say "don't try to reconcile them" — while
        // collected + received − expenses − handed EQUALS the hero by
        // construction (asserted in tests). The one sentence that teaches a
        // collector to TRUST the screen is the equation itself, so it is
        // written out and ends by deriving the number at the top. Every term
        // with rows behind it is a DOOR to those rows (the 🩺 lesson: a figure
        // you cannot open is a figure you learn to ignore); a zero term is
        // plain text, because a button that does nothing teaches the opposite.
        '<div class="tillnow">' + esc(t('till_now')) +
          '<div class="eqrow">' +
          eqTerm(t('my_collected'), m.tillNow.collected, 'entries', '') +
          (m.tillNow.received ? '<span class="op">+</span>' + eqTerm(t('my_received'), m.tillNow.received, 'hbook', '') : '') +
          '<span class="op">−</span>' + eqTerm(t('expense'), m.tillNow.expenseTotal, '', 'eq-exp') +
          '<span class="op">−</span>' + eqTerm(t('my_handed'), m.tillNow.handedOver, 'hbook', '') +
          '<span class="op">=</span><span class="term res">' + esc(t('eq_inhand')) + ' <b>' + fmtMoney(hero) + '</b> ' +
            ((m.tillNow.collected + (m.tillNow.received || 0) - m.tillNow.expenseTotal - m.tillNow.handedOver) === hero ? '✓' : '⚠️') +
          '</span></div>' +
          '<span class="sub">' + esc(t('till_now_sub')) + '</span></div>' +
        (m.expenses.length ?
          '<div class="card" id="my-exp-card" style="margin-top:12px"><div class="card-title">' + esc(t('my_expenses')) +
          ' — ' + fmtMoney(m.tillNow.expenseTotal) + '</div>' +
          // A106: an expense is named by its SUBJECT — the comment is optional
          // for every subject except "অন্য কিছু", so this row printed an empty
          // bold name and a date whenever somebody skipped it. "12/08/2026 ·
          // ₹300" is not an account of anything, and the subject was sitting in
          // the row the whole time.
          //
          // The same rule already existed in three other places: ✏️ আমার entry
          // (`r.subject || r.desc || t('expense')`), the central expenses list,
          // and the CSV export. Stated four times, guarded three.
          m.expenses.map(function (e) {
            return '<div class="row" style="cursor:default"><div><b>' +
              esc(expenseTitle(e)) + '</b>' +
              (expenseNote(e) ? ' <span class="row-sub">— ' + esc(expenseNote(e)) + '</span>' : '') +
              '<div class="row-sub">' + esc(fmtDate(e.date)) + '</div></div><b>' +
              fmtMoney(e.amount) + '</b></div>';
          }).join('') + '</div>' : '') +
      '</div>';
  }
  // Accordion wiring. Kept at module level next to the renderer: a handler that
  // reaches for a function declared inside another function throws only when a
  // user taps it, which is how three buttons once went dead unnoticed.
  function wireSummary(root) {
    const body = root.querySelector('#sum-body'), tog = root.querySelector('#sum-toggle');
    if (tog && body) tog.onclick = function () {
      body.hidden = !body.hidden;
      // A141: remembered, because A140 gave the working somewhere to GO. You
      // open it, tap a pot, read it, come back — and it had folded itself shut
      // again, so the road back to the next pot was four taps instead of one.
      // Same rule as the back button: return the person to where they were.
      sumOpen = !body.hidden;
      tog.textContent = t(body.hidden ? 'sum_open' : 'sum_close');
    };
    root.querySelectorAll('[data-grp]').forEach(function (h) {
      h.onclick = function () { h.parentNode.classList.toggle('open'); };
    });
    root.querySelectorAll('[data-pot]').forEach(function (b) {
      b.onclick = function () { navigate('pot', { cat: b.dataset.pot }); };
    });
    // A136: the খরচ term's rows live on THIS screen (the 🧾 card inside the
    // working) — open the working and land there, rather than a navigation
    if (tog && body) {
      const ex = root.querySelector('#eq-exp');
      if (ex) ex.onclick = function () {
        body.hidden = false;
        sumOpen = true;
        tog.textContent = t('sum_close');
        const card = root.querySelector('#my-exp-card');
        if (card) queueMicrotask(function () { card.scrollIntoView({ block: 'start', behavior: 'smooth' }); });
      };
    }
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
          // A142: the by-subject group printed the stored MARKER — a Bengali
          // screen listing a line called "Other". Grouping still keys on the
          // marker (correct); only the label is translated.
          return '<div class="row" style="cursor:default"><div><b>' +
            esc(expenseTitle({ subject: s.subject })) + '</b>' +
            '<div class="row-sub">' + s.count + ' ' + esc(t('entries')) +
            ' • 💵' + fmtMoney(s.cash || 0) + ' · 📱' + fmtMoney(s.upi || 0) + '</div></div><b>' + fmtMoney(s.total) + '</b></div>';
        }).join('') : '') + '</div>' +
      '<div class="card"><div class="card-title">' + esc(t('entries')) + '</div>' +
      (rows.length ? rows.map(function (r) {
        return '<div class="row" style="cursor:default"><div><b>' + esc(expenseTitle(r)) + '</b>' +
          (expenseNote(r) ? ' <span class="row-sub">— ' + esc(expenseNote(r)) + '</span>' : '') +
          '<div class="row-sub">' + esc(fmtDate(r.date)) + (r.spentBy ? ' • ' + esc(r.spentBy) : '') +
          (r.source === 'collection' ? ' • ' + esc(t('coll_expense')) : '') +
          ' • 💵' + fmtMoney(r.cash) + ' · 📱' + fmtMoney(r.upi) +
          (r.srcCat && CAT_LABEL_KEYS[r.srcCat] ? ' • ' + esc(t(CAT_LABEL_KEYS[r.srcCat])) : '') + '</div></div>' +
          '<b>' + fmtMoney(r.amount) + '</b></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  // A148: the অনুষ্ঠান ভাঁড়ার's own account. Income by where it came from,
  // spending by subject, and the balance those two make — with the shortfall
  // named plainly rather than flagged, because a programme running on the puja
  // fund is ordinary committee life, not an anomaly.
  function reportProgramHTML(d) {
    const line = function (labelKey, amount, cls) {
      return '<div class="row' + (cls ? ' ' + cls : '') + '"><div>' + esc(t(labelKey)) +
        '</div><b>' + fmtMoney(amount) + '</b></div>';
    };
    const rows = function (list, labeller) {
      return list.map(function (r) {
        return '<div class="row"><div>' + esc(labeller(r.key)) + '</div><b>' +
          fmtMoney(r.amount) + '</b></div>';
      }).join('');
    };
    if (!d.income.length && !d.spend.length) {
      return '<div class="card"><div class="card-title">🎭 ' + esc(t('program_fund')) + '</div>' +
        '<div class="empty">' + esc(t('prog_none')) + '</div></div>';
    }
    return '<div class="card"><div class="card-title">🎭 ' + esc(t('program_fund')) + '</div>' +
      '<div class="stat3">' +
        '<div><span>' + esc(t('prog_income')) + '</span><b>' + fmtMoney(d.collected) + '</b></div>' +
        '<div><span>' + esc(t('prog_spend')) + '</span><b>' + fmtMoney(d.expense) + '</b></div>' +
        '<div class="' + (d.balance < 0 ? 'red' : 'green') + '"><span>' + esc(t('prog_balance')) +
          '</span><b>' + fmtMoney(d.balance) + '</b></div>' +
      '</div>' +
      (d.transferIn ? '<div class="row"><div>' + esc(t('prog_transfer_in')) + '</div><b>' +
        fmtMoney(d.transferIn) + '</b></div>' : '') +
      (d.fromPuja ? '<div class="strip act">' + esc(t('prog_from_puja')) + ': ' +
        fmtMoney(d.fromPuja) + '<span class="sub">' + esc(t('prog_from_puja_note')) + '</span></div>' : '') +
      (Auth.isCashier() && !frozen() ? '<button id="transfer-btn" class="ghost big block">🔁 ' +
        esc(t('transfer_title')) + '</button>' : '') +
      (d.income.length ? '<div class="secttl">' + esc(t('prog_income')) + '</div>' +
        rows(d.income, function (k) { return t(CAT_LABEL_KEYS[k] || 'cat_other'); }) : '') +
      (d.spend.length ? '<div class="secttl">' + esc(t('prog_spend')) + '</div>' +
        rows(d.spend, function (k) { return k === '—' ? t('cat_other') : k; }) : '') +
      // A151: what is promised and not yet paid. It sits BELOW the spending,
      // because it is not spending — it is the thing the balance above does not
      // know about, and the planning number nobody had before.
      dutyBlockHTML(d.commitments, d.spokenFor) +
      '</div>';
  }
  // A151: the দায় list — every promise with what is paid and what is still owed.
  // Shown wherever a fund's balance is shown, because a balance that ignores
  // what is already promised is the most confident wrong number in the book.
  function dutyBlockHTML(list, owedTotal) {
    const open = (list || []).filter(function (c) { return !c.settled; });
    const done = (list || []).filter(function (c) { return c.settled; });
    const row = function (c) {
      return '<div class="row"><div><b>' + esc(c.payee || '—') + '</b>' +
        '<div class="row-sub">' + esc(t('duty_paid_of').replace('{p}', fmtMoney(c.paid))
          .replace('{c}', fmtMoney(c.committed))) +
        (c.note ? ' \u2022 ' + esc(c.note) : '') + '</div></div>' +
        '<div class="row-right">' + (c.settled
          ? '<span class="green">' + esc(t('duty_settled')) + '</span>'
          : '<b class="red">' + fmtMoney(c.owed) + '</b>') + '</div></div>';
    };
    if (!open.length && !done.length) return '';
    return '<div class="secttl">' + esc(t('duty_title')) +
      (owedTotal ? ' — ' + esc(t('duty_owed')) + ' ' + fmtMoney(owedTotal) : '') + '</div>' +
      open.map(row).join('') + done.map(row).join('');
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
  // A77: the PRINTED report, which is a different document from the screen one.
  //
  // The screen is a phone held one-handed — compact on purpose. The printed
  // sheet is read at a table, kept in a file, and shown to people who were not
  // there. It should carry everything the app knows, not everything that fits
  // on 375 px.
  //
  // Built from the SNAPSHOT, not by changing computeReport: that function is
  // mirrored byte-for-byte in Code.gs and verified against it, so widening it
  // would mean a server change and a redeploy for a formatting improvement.
  // Everything extra here — phone numbers, last payment date, who collected —
  // is looked up from `data`, which the client already holds.
  function printTable(head, rows) {
    if (!rows.length) return '<div class="empty">' + esc(t('no_entries')) + '</div>';
    return '<table class="p-table"><thead><tr>' +
      head.map(function (h) { return '<th>' + esc(h) + '</th>'; }).join('') +
      '</tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr>' + r.map(function (c, i) {
          return '<td' + (i ? ' class="p-num"' : '') + '>' + (c === '' || c == null ? '—' : esc(String(c))) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
  }
  function printReportHTML(id, d, data) {
    const money = function (n) { return fmtMoney(n); };
    if (id === 'dues') {
      // per donor: everything a person chasing a due actually needs in front of
      // them — the number to ring, when they last gave, and who to ask
      const v = Aggregate.voidedIds(data);
      const last = {}, who = {};
      (data.payments || []).forEach(function (p) {
        if (v[p.id] || !p.partyId) return;
        const day = Aggregate.dayOf(p.date) || Aggregate.dayOf(p.createdAt);
        if (!last[p.partyId] || day > last[p.partyId]) { last[p.partyId] = day; who[p.partyId] = p.collector || ''; }
      });
      const byName = {}; liveParties(data).forEach(function (p) { byName[p.name] = p; });
      return '<h3>' + esc(t('report_dues')) + ' — ' + esc(t('total_due')) + ': ' + money(d.totalDue) + '</h3>' +
        printTable([t('party_f_person'), t('type_shop'), t('party_f_side'), t('party_f_owner'),
                    t('party_f_phone'), t('pledged'), t('paid'), t('due'), t('last_paid_col'), t('collector_col')],
          (d.rows || []).map(function (r) {
            const p = byName[r.name] || {};
            return [r.name, t('type_' + r.type), r.side ? Lists.labelOf('area', r.side) : '', r.owner || '',
                    p.phone || '', money(r.pledged), money(r.paid), money(r.due),
                    last[p.id] ? fmtDate(last[p.id]) : '', who[p.id] || ''];
          }));
    }
    if (id === 'inhand') {
      // byCat is already computed and never printed — it is the answer to
      // "which pot is that money from", which is the first question at a count
      const cats = Object.keys(CAT_LABEL_KEYS);
      const used = cats.filter(function (k) {
        return (d.rows || []).some(function (r) { const c = (r.byCat || {})[k]; return c && (c.cash || c.upi); });
      });
      return '<h3>' + esc(t('report_inhand')) + '</h3>' +
        printTable([t('collector_col'), t('collected_col'), t('received_col'), t('handed_col'),
                    t('my_pending'), t('spent_col'), t('inhand_col')].concat(used.map(function (k) { return t(CAT_LABEL_KEYS[k]); })),
          (d.rows || []).map(function (r) {
            return [r.collector, money(r.collected), money(r.received), money(r.handedOver),
                    money(r.pending), money(r.spent), money(r.inHand)]
              .concat(used.map(function (k) {
                const c = (r.byCat || {})[k]; return c ? money((c.cash || 0) + (c.upi || 0)) : '';
              }));
          }));
    }
    if (id === 'expenses') {
      return '<h3>' + esc(t('report_expenses')) + ' — ' + money(d.total) +
        ' (💵 ' + money(d.totalCash) + ' · 📱 ' + money(d.totalUpi) + ')</h3>' +
        printTable([t('date_col'), t('subject_col'), t('comment_col'), t('spent_by_col'), t('amount_col'), '💵', '📱'],
          (d.rows || []).map(function (r) {
            return [fmtDate(r.date), r.subject || '', r.desc || '', r.spentBy || '',
                    money(r.amount), money(r.cash), money(r.upi)];
          })) +
        '<h3>' + esc(t('by_subject_col')) + '</h3>' +
        printTable([t('subject_col'), t('count_col'), t('amount_col'), '💵', '📱'],
          (d.bySubject || []).map(function (r) {
            return [r.subject, r.count, money(r.total), money(r.cash), money(r.upi)];
          }));
    }
    if (id === 'collectors') {
      // how many donors each person actually called on — the row said totals
      // only, which cannot separate "one big donor" from "forty small ones"
      const v = Aggregate.voidedIds(data);
      const donors = {};
      (data.payments || []).forEach(function (p) {
        if (v[p.id]) return;
        const k = p.collector || p.collectorId || '?';
        (donors[k] = donors[k] || {})[p.partyId || p.id] = 1;
      });
      return '<h3>' + esc(t('report_collectors')) + '</h3>' +
        printTable([t('collector_col'), t('donor_count_col'), t('amount_col'), '💵', '📱'],
          (d.rows || []).map(function (r) {
            return [r.collector, Object.keys(donors[r.collector] || {}).length,
                    money(r.total), money(r.cash), money(r.upi)];
          }));
    }
    if (id === 'areas') {
      return '<h3>' + esc(t('report_areas')) + ' — ' + esc(t('paid')) + ': ' + money(d.totalPaid) + '</h3>' +
        printTable([t('party_f_side'), t('count_col'), t('pledged'), t('paid'), t('due')],
          (d.rows || []).map(function (r) {
            return [Lists.labelOf('area', r.area), r.count, money(r.pledged), money(r.paid), money(r.due)];
          }));
    }
    if (id === 'daily') {
      return '<h3>' + esc(t('report_daily')) + '</h3>' +
        printTable([t('date_col'), t('type_col'), t('amount_col')],
          (d.rows || []).map(function (r) { return [fmtDate(r.date), t('type_' + r.type), money(r.amount)]; }));
    }
    return reportHTML(id, d); // overview is already a full statement
  }
  function reportHTML(id, d) {
    if (id === 'overview') return totalsHTML(d, t('report_overview'));
    if (id === 'dues') return reportDuesHTML(d);
    if (id === 'inhand') return reportInhandHTML(d);
    if (id === 'collectors') return reportCollectorsHTML(d);
    if (id === 'areas') return reportAreasHTML(d);
    if (id === 'expenses') return reportExpensesHTML(d);
    if (id === 'daily') return reportDailyHTML(d);
    if (id === 'program') return reportProgramHTML(d);
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
  // One label for a handover's outcome, used by every screen that shows one, so
  // "⏳" can never mean two different things in two places.
  // Direction-neutral on purpose: the same row is read by the sender ("mine came
  // back") and the receiver ("I said I hadn't got it"), so the wording states the
  // FACT — that "not received" was recorded — rather than either point of view.
  // `flag_pending` used to be borrowed here; it is the correction-flag wording
  // ("flag করা"), which says nothing true about a handover in transit.
  function hoStatusLabel(status) {
    return status === 'confirmed' ? ' • ✅ ' + esc(t('ho_confirmed'))
      : status === 'rejected' ? ' • ❌ ' + esc(t('ho_rejected'))
      : ' • ⏳ ' + esc(t('ho_pending'));
  }
  // Wire ✅ পেয়েছি / ❌ পাইনি. Module level, next to the renderers that use it:
  // a handler reaching for a function declared inside another function throws
  // only when a user taps, which is how three buttons once went dead unnoticed.
  // A rejection REQUIRES a reason — "পাইনি" with no explanation is an accusation
  // the sender cannot act on, so an empty prompt aborts instead of sending.
  function wireHandoverAnswers(root, after) {
    root.querySelectorAll('[data-hid]').forEach(function (b) {
      b.onclick = function () {
        const undo = busyBtn(b);
        Auth.call('confirmHandover', { token: Auth.token(), id: b.dataset.hid })
          .then(function () { toast(t('saved')); after(); })
          .catch(function (e) { undo(); toast(errMsg(e)); });
      };
    });
    root.querySelectorAll('[data-hrej]').forEach(function (b) {
      b.onclick = function () {
        const reason = window.prompt(t('reject_reason_q'), '');
        if (reason === null) return;                       // cancelled
        if (!String(reason).trim()) { toast(t('err_reason_required')); return; }
        const undo = busyBtn(b);
        Auth.call('rejectHandover', { token: Auth.token(), id: b.dataset.hrej, reason: String(reason).trim() })
          .then(function () { toast(t('rejected_done')); after(); })
          .catch(function (e) { undo(); toast(errMsg(e)); });
      };
    });
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
        (r.rejectedIn.total ? '<div class="sh-row ro"><span class="cat-name">❌ ' + esc(t('hb_rejected_in')) + '</span>' + money(r.rejectedIn) + '</div>' : '') +
        '<div class="sh-row ro"><span class="cat-name">📤 ' + esc(t('hb_sent')) + '</span>' + money(r.sent) + '</div>' +
        (r.pendingOut.total ? '<div class="sh-row ro"><span class="cat-name">⏳ ' + esc(t('hb_pending_out')) + '</span>' + money(r.pendingOut) + '</div>' : '') +
        (r.rejectedOut.total ? '<div class="sh-row ro"><span class="cat-name">❌ ' + esc(t('hb_rejected_out')) + '</span>' + money(r.rejectedOut) + '</div>' : '') +
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
          '<div class="row-sub">' + esc(fmtDate(x.date)) + hoStatusLabel(x.status) +
          (x.note ? ' • ' + esc(x.note) : '') + '</div>' +
          (x.rejectReason ? '<div class="row-sub">“' + esc(x.rejectReason) + '”</div>' : '') + '</div>' + money(x) +
          (detail ? '<div class="hb-detail" hidden>' + detail + '</div>' : '') + '</div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>';
      $view().innerHTML = backBar('home') + '<div class="flow-title">' + esc(t('hb_title')) + '</div>' +
        '<div class="hint" style="margin-bottom:10px">' + esc(t('hbook_hint')) + guideDoor('confirm') + '</div>' +
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
      wireGuideDoors();
    });
  }
  function renderCashier() {
    if (!Auth.isCashier()) { $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('not_cashier')) + '</div>'; return; }
    $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('loading')) + '</div>';
    // A118b (trial: "handover screen is a bit slow" — this desk had the same
    // wait): the pending list used to come from a pendingHandovers round trip,
    // 1–3 s on the live server, while the SAME rows ride every pull into
    // viewData. The server's list is exactly activeData().filter(isRecipient_),
    // and both halves exist client-side — so the desk paints from the snapshot
    // at once. Freshness is the pull's (≤60 s), same as any list fetched when
    // the screen opened; and both answer buttons go through the server anyway,
    // which re-checks the parcel's real status under its lock (double-confirm
    // and confirm-after-reject are refused there, tested).
    const meName = (Auth.current() || {}).name || '';
    const meUser = Settings.get('collectorUsername') || (Auth.current() || {}).username || '';
    viewData().then(function (data) {
      const act = Aggregate.activeData(data);
      const mine = (act.handovers || []).filter(function (h) {
        return String(h.toId || h.to) === String(meUser) || String(h.to) === String(meName);
      });
      // three outcomes, three lists — a refused parcel must leave the queue, or
      // the cashier is asked about it for ever
      const pending = mine.filter(function (h) { return h.status !== 'confirmed' && h.status !== 'rejected'; });
      const done = mine.filter(function (h) { return h.status === 'confirmed'; })
        .sort(function (a, b) { return String(b.confirmedAt).localeCompare(String(a.confirmedAt)); }).slice(0, 15);
      const refused = mine.filter(function (h) { return h.status === 'rejected'; })
        .sort(function (a, b) { return String(b.confirmedAt).localeCompare(String(a.confirmedAt)); }).slice(0, 15);
      function card(h, withBtn) {
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div><b>' + esc(h.from) + '</b>' +
          '<div class="row-sub">' + esc(fmtDate(h.date)) + (h.note ? ' • ' + esc(h.note) : '') +
          ' • ' + esc(t('cash')) + ' ' + fmtMoney(h.cashAmount) + ' + UPI ' + fmtMoney(h.upiAmount) +
          (h.rejectReason ? '</div><div class="row-sub">❌ “' + esc(h.rejectReason) + '”' : '') + '</div></div>' +
          '<b>' + fmtMoney(h.amount) + '</b>' +
          '<div style="flex-basis:100%">' + breakdownLines(h) + '</div>' +
          // Both answers sit side by side, deliberately: leaving only "পেয়েছি"
          // is what forced a cashier to confirm money they had not received.
          (withBtn ? '<div class="chips" style="flex-basis:100%;margin-top:8px">' +
            '<button class="chip on" data-hid="' + esc(h.id) + '">' + esc(t('confirm_receive')) + '</button>' +
            '<button class="chip" data-hrej="' + esc(h.id) + '">❌ ' + esc(t('reject_receive')) + '</button>' +
            '</div>' : '') + '</div>';
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
          '<div class="hint" style="margin-bottom:10px">' + esc(t('cashier_hint')) + guideDoor('confirm') + '</div>' +
          '<div class="section">📥 ' + esc(t('pending_handovers')) + ' (' + pending.length + ')</div>' +
          (pending.length ? pending.map(function (h) { return card(h, true); }).join('')
                          : '<div class="empty">' + esc(t('none_here')) + '</div>') +
          '<div class="section">📥 ' + esc(t('confirmed_handovers')) + '</div>' +
          (done.length ? done.map(function (h) { return card(h, false); }).join('')
                       : '<div class="empty">' + esc(t('none_here')) + '</div>') +
          (refused.length ? '<div class="section">❌ ' + esc(t('refused_handovers')) + '</div>' +
            refused.map(function (h) { return card(h, false); }).join('') : '') +
          '<div class="section">📤 ' + esc(t('hb_sent')) + '</div>' +
          (outRows.length ? outRows.map(function (x) {
            return '<div class="row" style="cursor:default;flex-wrap:wrap"><div style="flex:1 1 55%"><b>' +
              esc(x.who) + '</b><div class="row-sub">' + esc(fmtDate(x.date)) +
              hoStatusLabel(x.status) + '</div></div>' +
              '<span class="cat-split">💵' + fmtMoney(x.cash) + ' · 📱' + fmtMoney(x.upi) + '</span>' +
              '<b class="cat-tot">' + fmtMoney(x.total) + '</b></div>';
          }).join('') : '<div class="empty">' + esc(t('none_here')) + '</div>') +
          '<div class="grid one" style="margin-top:10px"><button class="tile wide" data-go="hbook">📗 ' +
            esc(t('hb_title')) + '</button></div>';
        wireNav();
        wireGuideDoors();
        wireHandoverAnswers(document, renderCashier);
      });
    }).catch(function () {
      $view().innerHTML = backBar('home') + '<div class="empty">' + esc(t('fetch_fail')) + '</div>';
    });
  }

  function renderReport() {
    // Everything renders from the local pull snapshot (viewData) via Aggregate —
    // one aggregation path, instant, offline-capable, no per-report round-trip.
    // A person's own summary is their own money, so it stays whatever else is
    // withheld; the central-reports picker already says so when it is empty.
    // A136 (G9): the split was always there — own money on top, everyone's
    // below — but the top floor had NO title at all and the bottom one was
    // named in machine language ("কেন্দ্রীয়"). Two plain headers make the
    // আমার/সবার boundary visible without hiding either behind a tab.
    // A139 (Hrishi, twice: "I can't see any segregation"): A136's two .section
    // labels were 13px grey uppercase — correct words, no boundary. Beside a
    // ₹7,450 hero and a wall of cards nobody reads a thin grey line as "you are
    // now in a different account". So each floor gets a full-width BAND and its
    // own tinted zone: yours warm (the app's own saffron), everyone's cool. Not
    // tabs — a tab hides the committee's figures from the half of the committee
    // that never finds tabs.
    const me = Auth.current() || {};
    $view().innerHTML = '<div id="reconcile-warn"></div>' +
      '<div class="zone mine">' +
        '<div class="zone-hd">🙋 ' + esc(t('sec_mine')) +
          '<span class="who">' + esc(me.name || Settings.get('collectorName') || '') + '</span></div>' +
        '<div class="hint" style="margin:0 2px 8px">' + esc(t('report_hint')) + ' ' + guideDoor('ledger') + '</div>' +
        '<div id="my-summary"><div class="empty">' + esc(t('loading')) + '</div></div>' +
      '</div>' +
      '<div class="zone all">' +
        '<div class="zone-hd">' + esc(t('central_reports')) +
          '<span class="who">' + esc(t('sec_all_sub')) + '</span></div>' +
        // A144: the one cost of confidential entries, said in words on the very
        // screen where it matters. This reader's book is genuinely smaller than
        // the admin's, and the danger is not the gap — it is somebody standing
        // up in a meeting and quoting this figure as the committee's total. No
        // amount, no count, no kind is named: the sentence reveals nothing and
        // exists only so nobody is misled by a number that is honestly partial.
        (partialBook() ? '<div class="hint" style="margin:0 2px 8px">' + esc(t('report_partial')) + '</div>' : '') +
        '<div id="report-picker"></div>' +
        '<div id="report-body"></div>' +
      '</div>';
    wireGuideDoors();
    loadMySummary();
    // A66 (audit 2.14): was a local myReports() — a hand copy of
    // Aggregate.allowedReports with `u.cashier === 1` where the tested one has
    // `Number(u.cashier) === 1`. Not a style point: a Sheets round-trip can
    // hand `cashier` back as the STRING "1", and then the strict compare is
    // false and the cashier silently loses their in-hand report — the one
    // report their job depends on. Run both ways, the copy returns [] where
    // the real one returns ["inhand"].
    showReportButtons(Aggregate.allowedReports(Auth.current()));   // local — no round-trip
    checkReconcile();
  }
  // Surface the money invariant to admins/cashiers: Σ everyone's in-hand must
  // equal total collected − total expenses. A mismatch means a broken entry —
  // better a loud banner now than a dispute at the end of the puja.
  function checkReconcile() {
    if (!Auth.isCashier()) return; // admins are cashiers here too
    viewData().then(function (data) {
      const el = document.getElementById('reconcile-warn'); if (!el) return;
      const r = Aggregate.reconcile(data, reconcileRules());
      // A117: drop what this device already answered — see stampedAnswers
      r.anomalies = r.anomalies.filter(function (a) { return !anomalyAnswered(a); });
      const others = r.anomalies.filter(function (a) { return a.type !== 'unbalanced'; });
      if (r.balanced && !others.length) { el.innerHTML = ''; return; }
      let msg = '';
      if (!r.balanced) {
        msg += esc(t('reconcile_off').replace('{diff}', rcpMoney(Math.abs(r.totalInHand - r.expected)))) + '<br>';
      }
      if (others.length) msg += esc(t('reconcile_anoms').replace('{n}', others.length));
      // Tappable: a banner that names a count and cannot say WHICH row teaches
      // people to ignore it, and then the day a real ₹5,000 gap appears nobody
      // looks. Every anomaly reconcile can raise now has a screen behind it.
      // A115f (pre-go-live sweep): the heading used to be unconditional, so a
      // book whose money reconciled to the rupee still shouted "হিসাব মিলছে
      // না!" over a member row with no account. A false sentence about MONEY,
      // on the report screen, on day one — and the fastest way to teach twelve
      // collectors that the red banner lies. The heading now says what is
      // actually true; the body lines were always conditional.
      el.innerHTML = '<button class="card" data-go="anomalies" style="border:1.5px solid #c0392b;' +
        'background:#fdecea;width:100%;text-align:left;font-family:inherit;cursor:pointer">' +
        '<b>⚠️ ' + esc(t(r.balanced ? 'reconcile_title_anoms' : 'reconcile_title')) +
        '</b><div class="row-sub" style="margin-top:4px">' + msg +
        '<br>' + esc(t('anom_open')) + ' ›</div></button>';
      wireNav();
    });
  }

  // ---------- the anomaly desk (admin / cashier) ----------
  // reconcile has always detected seven kinds of trouble and shown a COUNT.
  // Detection nobody can act on is worse than none: it looks like a guard.
  // Each row here says what a human would say, names the rows involved, and
  // carries an action where one honestly exists.
  // A61: dupOk and pledgeOk are NEW columns. If the deployed Code.gs predates
  // them the answer is written locally, pushed, and silently dropped — the card
  // vanishes, the next pull brings the anomaly straight back, and the button has
  // lied. schemaCmp() === 1 means exactly "this app needs a contract the server
  // has not got yet", so the honest move is to withhold the button and say why.
  // Only the ADMIN sees the yellow "redeploy" bar, so the cashier working this
  // desk would otherwise have no way to know.
  function serverCanStoreAnswers() { return Auth.schemaCmp() !== 1; }
  // A66 (audit 2.20): ANOM_ACTIONABLE lived here — set, and read nowhere. A
  // second list of "which anomalies are answerable" that nothing consulted can
  // only drift away from the branches below that actually decide, and a test
  // was pinning its contents, which made it worse than useless: it looked like
  // coverage of a rule no code obeyed. The three branches in renderAnomalies
  // ARE the rule; there is no second copy left to disagree with them.
  // A112: over this much in one person's hands, 🩺 says so and the admin list
  // turns the figure red. Hrishi's number. Hardcoded rather than admin-settable
  // on purpose for now: a Config key would need a Code.gs redeploy, and this
  // had to land before the trial. Change it here.
  const HIGH_INHAND = 10000;
  // A117: answers THIS device has already written to the server, kept for the
  // session. The desk re-renders on every pull, and a pull that was already in
  // flight when the cashier tapped the answer comes back carrying the
  // PRE-answer world — without this, that re-render resurrected the very card
  // they had just settled, until the next poll carried the stamp. A stamp is
  // permanent server-side, so suppressing the card locally can never hide a
  // live problem; the entry is only added after the server said ok.
  const stampedAnswers = {};
  // A120: the review desk's twin of stampedAnswers. resolveCorrection's success
  // used to re-render the desk — which, after A118b, paints from the local
  // snapshot, still PRE-answer — so the flag the cashier had just approved came
  // straight back (the server state was correct throughout; only the picture
  // lagged). Recorded only after the server says ok; consulted by the desk's
  // list filter so no stale re-render can resurrect an answered flag.
  const resolvedFlags = {};
  // A126: the notification banner's twin. Its ✅/🚫 buttons used to succeed on
  // the server and then re-render from the STALE notifItems still in memory —
  // the approval card came back, buttons re-enabled, until the forced pull
  // landed (1–3 s live); an in-flight poll could re-apply the pre-answer feed
  // even later. Same trio as the two desks: record after server-ok, settle the
  // row in place, filter on every apply/render.
  const answeredNotifs = {};
  function anomalyAnswered(a) {
    const k = a.type === 'overpaid' ? 'parties|' + a.partyId + '|pledgeOk'
      : a.type === 'possible_duplicate_payment' ? 'payments|' + a.id + '|dupOk'
      : a.type === 'possible_duplicate_daily' ? 'daily|' + a.id + '|dupOk'
      : a.type === 'possible_duplicate_party' ? 'parties|' + a.id + '|dupOk'
      : '';
    return !!(k && stampedAnswers[k]);
  }
  function renderAnomalies() {
    if (!Auth.isCashier()) { $view().innerHTML = backBar('report') + '<div class="empty">' + esc(t('not_cashier')) + '</div>'; return; }
    $view().innerHTML = backBar('report') + '<div class="empty">' + esc(t('loading')) + '</div>';
    viewData().then(function (data) {
      // Lists.maxMap() carries the post caps in — reconcile is pure logic and
      // cannot reach the master lists itself.
      const r = Aggregate.reconcile(data, reconcileRules());
      // A117: drop what this device already answered — see stampedAnswers
      r.anomalies = r.anomalies.filter(function (a) { return !anomalyAnswered(a); });
      const byId = {}; (data.payments || []).forEach(function (p) { byId[p.id] = p; });
      const dailyById = {}; (data.daily || []).forEach(function (r) { dailyById[r.id] = r; });
      const partyById = {}; liveParties(data).forEach(function (p) { partyById[p.id] = p; });
      const canStamp = serverCanStoreAnswers();
      const stampNote = canStamp ? '' : '<div class="perm-note">' + esc(t('anom_needs_deploy')) + '</div>';
      const rows = r.anomalies.map(function (a) {
        if (a.type === 'possible_duplicate_payment') {
          const dup = byId[a.id], first = byId[a.firstId];
          const nm = (partyById[a.partyId] || {}).name || a.partyId;
          return '<div class="card"><div class="card-title">🔁 ' + esc(t('anom_dup')) + '</div>' +
            '<div class="row-sub">' + esc(nm) + ' · ' + fmtMoney(a.amount) + ' · ' + esc(fmtDate(a.date)) + '</div>' +
            '<div class="bd-line" style="display:block;margin-top:6px">' +
              (first ? esc(dupLine(first)) + '<br>' : '') + (dup ? esc(dupLine(dup)) : '') + '</div>' +
            '<div class="chips" style="margin-top:8px">' +
              // A73 (audit #5 V11): this button was left UNGATED when A68 moved
              // all three onto setAnomalyFlag — new at CODE_SCHEMA 4. So in the
              // redeploy window A68's own commit warns about, the two cards
              // beside this one politely explained themselves while THIS one —
              // the card A68's headline bug was actually about — showed the ✓,
              // took the tap, and answered with a bare server error.
              // A rule stated for three cases and guarded for two, one commit
              // after A71 was a rule stated two ways and guarded one.
              (canStamp ? '<button class="chip on" data-dupok="' + esc(a.id) + '">✓ ' + esc(t('anom_dup_ok')) + '</button>' : '') +
              (dup && canVoid(dup) ? '<button class="chip void-btn" data-dupvoid="' + esc(a.id) + '">✖️ ' + esc(t('anom_dup_void')) + '</button>' : '') +
              '<button class="chip" data-goparty="' + esc(a.partyId) + '">👁 ' + esc(t('view')) + '</button>' +
            '</div>' + stampNote + '</div>';
        }
        // A61 (audit 2.2): a double-entered road/toto/bus round. Same shape as
        // the payment card, same answer, stamped on the same field name.
        if (a.type === 'possible_duplicate_daily') {
          const dup = dailyById[a.id], first = dailyById[a.firstId];
          const who = a.dailyType === 'bus'
            ? [a.busName, a.busNumber].filter(Boolean).join(' ') || t('type_bus')
            : t('type_' + a.dailyType);
          const line = function (r) {
            return r ? '• ' + (r.receiptNo ? t('receipt_no') + ' ' + r.receiptNo + ' · ' : '') +
              fmtMoney(r.amount) + ' · ' + (r.collector || r.collectorId || '?') + ' · ' +
              (r.createdAt ? fmtDateTime(r.createdAt) : fmtDate(r.date)) + '  [' + String(r.id).slice(0, 8) + ']' : '';
          };
          return '<div class="card"><div class="card-title">🔁 ' + esc(t('anom_dup_daily')) + '</div>' +
            '<div class="row-sub">' + esc(who) + ' · ' + fmtMoney(a.amount) + ' · ' + esc(fmtDate(a.date)) + '</div>' +
            '<div class="bd-line" style="display:block;margin-top:6px">' +
              (first ? esc(line(first)) + '<br>' : '') + (dup ? esc(line(dup)) : '') + '</div>' +
            '<div class="chips" style="margin-top:8px">' +
              (canStamp ? '<button class="chip on" data-ddupok="' + esc(a.id) + '">' + esc(t('anom_dup_daily_ok')) + '</button>' : '') +
              (dup && canVoid(dup) ? '<button class="chip void-btn" data-ddupvoid="' + esc(a.id) + '">✖️ ' + esc(t('anom_dup_void')) + '</button>' : '') +
            '</div>' + stampNote + '</div>';
        }
        // A80: the same donor written down twice, caught by phone number after
        // the fact — the entry form's warning is blind when two collectors are
        // offline on the same street, which is exactly when this happens.
        //
        // Both rows are named with who wrote them and what is pledged, because
        // the answer is never "delete one" in the abstract: somebody has to
        // decide which is real, and that needs the collector's name to ask.
        if (a.type === 'possible_duplicate_party') {
          const dup = partyById[a.id], first = partyById[a.firstId];
          const line = function (p) {
            return p ? '• ' + (p.name || '?') + (p.owner ? ' (' + p.owner + ')' : '') +
              ' · ' + t('pledged') + ' ' + fmtMoney(p.pledged || 0) +
              ' · ' + (p.collector || p.collectorId || '?') : '';
          };
          return '<div class="card"><div class="card-title">👥 ' + esc(t('anom_dup_party')) + '</div>' +
            '<div class="row-sub">📞 ' + esc(a.phone) + '</div>' +
            '<div class="bd-line" style="display:block;margin-top:6px">' +
              (first ? esc(line(first)) + '<br>' : '') + (dup ? esc(line(dup)) : '') + '</div>' +
            '<div class="chips" style="margin-top:8px">' +
              (canStamp ? '<button class="chip on" data-pdupok="' + esc(a.id) + '">' + esc(t('anom_dup_party_ok')) + '</button>' : '') +
              '<button class="chip" data-goparty="' + esc(a.id) + '">👁 ' + esc(t('view')) + '</button>' +
              (first ? '<button class="chip" data-goparty="' + esc(a.firstId) + '">👁 ' + esc(t('view')) + ' ①</button>' : '') +
            '</div><div class="row-sub" style="margin-top:6px">' + esc(t('anom_dup_party_hint')) + '</div>' +
            stampNote + '</div>';
        }
        // A61 (audit 2.3): "paid more than pledged" now carries BOTH honest
        // answers — the one that fixes the cause (the pledge was typed wrong,
        // and since A60 there is a screen for that) and the one that says
        // nothing is wrong at all, which is the commoner case: donors give more
        // than they promised.
        if (a.type === 'overpaid') {
          return '<div class="card"><div class="card-title">⚠️ ' + esc(t('anom_overpaid_t')) + '</div>' +
            '<div class="row-sub">' + esc(t('anom_overpaid').replace('{who}', a.party || '?')
              .replace('{n}', fmtMoney(a.paid || 0)).replace('{p}', fmtMoney(a.pledged || 0))) + '</div>' +
            '<div class="chips" style="margin-top:8px">' +
              (canStamp ? '<button class="chip on" data-pledgeok="' + esc(a.partyId) + '">' + esc(t('anom_overpaid_ok')) + '</button>' : '') +
              (canEditParty(partyById[a.partyId]) ? '<button class="chip" data-pledgefix="' + esc(a.partyId) + '">' + esc(t('anom_overpaid_fix')) + '</button>' : '') +
              '<button class="chip" data-goparty="' + esc(a.partyId) + '">👁 ' + esc(t('view')) + '</button>' +
            '</div>' + stampNote + '</div>';
        }
        // everything else: say it plainly and point at the row. No button —
        // these are data surgery, and a wrong "fix" here moves real money.
        const line = a.type === 'unbalanced'
            ? t('anom_unbalanced').replace('{diff}', fmtMoney(Math.abs(a.diff)))
          : a.type === 'overpaid' ? t('anom_overpaid').replace('{who}', a.party || '?').replace('{n}', fmtMoney(a.paid || 0)).replace('{p}', fmtMoney(a.pledged || 0))
          : a.type === 'orphan_payment' ? t('anom_orphan').replace('{n}', fmtMoney(a.amount))
          : a.type === 'negative_inhand' ? t('anom_negative').replace('{who}', a.collector || a.id || '?').replace('{n}', fmtMoney(a.inHand || 0))
          : a.type === 'duplicate_id' ? t('anom_dupid').replace('{store}', a.store || '')
          : a.type === 'split_mismatch' ? t('anom_split').replace('{store}', a.store || '').replace('{n}', fmtMoney(a.amount || 0)).replace('{s}', fmtMoney(a.split || 0))
          : a.type === 'breakdown_mismatch' ? t('anom_breakdown').replace('{n}', fmtMoney(a.amount || 0)).replace('{s}', fmtMoney(a.breakdownSum || 0))
          : a.type === 'position_over_max' ? t('anom_position_over_max').replace('{pos}', Lists.labelOf('position', a.position)).replace('{n}', a.count).replace('{max}', a.max).replace('{names}', (a.who || []).join(', '))
          : a.type === 'member_no_account' ? t('anom_member_no_account').replace('{who}', a.party || '?')
          : a.type === 'party_no_area' ? t('anom_party_no_area').replace('{who}', a.party || '?')
          : a.type;
        return '<div class="card"><div class="card-title">⚠️ ' + esc(t('anom_' + a.type + '_t') || a.type) + '</div>' +
          '<div class="row-sub">' + esc(line) + '</div>' +
          (a.id ? '<div class="bd-line">[' + esc(String(a.id).slice(0, 8)) + ']</div>' : '') +
          (a.partyId ? '<div class="chips" style="margin-top:8px"><button class="chip" data-goparty="' +
            esc(a.partyId) + '">👁 ' + esc(t('view')) + '</button></div>' : '') + '</div>';
      });
      // A112: two things the arithmetic cannot complain about, so they sit
      // above the anomalies rather than inside them — reconcile is for "the
      // book disagrees with itself", and neither of these does.
      const payById = {}; (data.payments || []).forEach(function (p) { payById[p.id] = p; });
      const dailyById2 = {}; (data.daily || []).forEach(function (d) { dailyById2[d.id] = d; });
      const voids = (data.voids || []).slice()
        .sort(function (a, c) { return String(c.createdAt || '').localeCompare(String(a.createdAt || '')); });
      const voidAmt = function (v) {
        const t = v.targetStore === 'daily' ? dailyById2[v.targetId] : payById[v.targetId];
        return Number((t || {}).amount) || 0;
      };
      const voidTotal = voids.reduce(function (a, v) { return a + voidAmt(v); }, 0);
      const voidCard = !voids.length ? '' :
        '<div class="card"><div class="card-title">' + esc(t('anom_voids_t')) + '</div>' +
        '<div class="row-sub">' + esc(t('anom_voids_sub').replace('{n}', toBengaliDigits(String(voids.length)))
          .replace('{amt}', fmtMoney(voidTotal))) + '</div>' +
        voids.slice(0, 15).map(function (v) {
          // A123: say WHAT was voided, not only how much — "₹300" alone could
          // be a donor's payment or a road round, and the reader should not
          // need to remember. entrySummary already knows the words.
          const tgt = v.targetStore === 'daily' ? dailyById2[v.targetId] : payById[v.targetId];
          const head = tgt ? entrySummary(v.targetStore, tgt) : fmtMoney(voidAmt(v));
          return '<div class="row" style="cursor:default"><div><b>' + esc(head) + '</b>' +
            (v.reason ? ' <span class="row-sub">— ' + esc(v.reason) + '</span>' : '') +
            '<div class="row-sub">' + esc(v.collector || v.collectorId || '?') + ' · ' +
            esc(v.createdAt ? fmtDateTime(v.createdAt) : '') + '</div></div></div>';
        }).join('') +
        (voids.length > 15 ? '<div class="row-sub" style="padding:6px 12px">…' +
          esc(toBengaliDigits(String(voids.length - 15))) + '</div>' : '') + '</div>';
      // who is carrying too much right now
      const holders = {};
      liveParties(data).forEach(function (p) { holders[p.collectorId || p.collector] = 1; });
      (data.payments || []).forEach(function (p) { holders[p.collectorId || p.collector] = 1; });
      (data.daily || []).forEach(function (d) { holders[d.collectorId || d.collector] = 1; });
      const heavy = Object.keys(holders).filter(Boolean).map(function (id) {
        return { id: id, inHand: Aggregate.personalSummary(data, id).inHand };
      }).filter(function (h) { return h.inHand > HIGH_INHAND; })
        .sort(function (a, c) { return c.inHand - a.inHand; });
      const heavyCard = !heavy.length ? '' :
        '<div class="card"><div class="card-title">' + esc(t('anom_highinhand_t')) + '</div>' +
        '<div class="row-sub">' + esc(t('anom_highinhand_sub').replace('{amt}', fmtMoney(HIGH_INHAND))) + '</div>' +
        heavy.map(function (h) {
          return '<div class="row" style="cursor:default"><div><b>' + esc(h.id) + '</b></div>' +
            '<div class="row-right" style="color:var(--red)">' + esc(fmtMoney(h.inHand)) + '</div></div>';
        }).join('') + '</div>';
      $view().innerHTML = backBar('report') + '<div class="flow-title">🩺 ' + esc(t('anom_title')) + '</div>' +
        '<div class="hint" style="margin-bottom:10px">' + esc(t('anom_hint')) + guideDoor('anom') + '</div>' +
        heavyCard + voidCard +
        (rows.length ? rows.join('') : (heavyCard || voidCard ? '' : '<div class="empty">' + esc(t('anom_none')) + '</div>'));
      wireNav();
      wireGuideDoors();
      document.querySelectorAll('[data-goparty]').forEach(function (b) {
        b.onclick = function () { navigate('party', { id: b.dataset.goparty, from: 'anomalies' }); };
      });
      document.querySelectorAll('[data-dupvoid]').forEach(function (b) {
        b.onclick = function () { renderVoidReason('payments', b.dataset.dupvoid, function () { navigate('anomalies'); }); };
      });
      // A61: the same settle-in-place behaviour for the two new answers. A44's
      // rule — take the card out where it stands rather than rebuilding the
      // desk, because this screen's whole purpose is working DOWN a list, and
      // being thrown back to the top after every answer is what makes people
      // stop working through it.
      const settleCard = function (b) {
        const card = b.closest('.card');
        if (card) card.remove();
        if (!$view().querySelectorAll('.card').length) {
          const box = document.createElement('div');
          box.className = 'empty';
          box.textContent = t('anom_none');
          $view().appendChild(box);
        }
      };
      // A68 (audit #2 U1): answered through the SERVER, not the local queue.
      //
      // This was DB.get(store, id) — this device's IndexedDB. The 🩺 desk is
      // cashier/admin-only, so the rows on it are overwhelmingly other people's
      // and simply were not there: `if (!row) return`, no write, no message,
      // and the duplicate came back tomorrow. That was the normal case for this
      // screen, not the edge case.
      //
      // And the obvious repair — take the row from viewData() and push it —
      // is WORSE, which is why it was tried against the backend shim first:
      // push re-stamps collector/collectorId from the token and only the admin
      // branch carries the original forward, so a cashier answering Ratan's
      // duplicate would have moved Ratan's ₹500 into their own in-hand. A
      // silent no-op is bad; silently moving money is unforgivable.
      //
      // setAnomalyFlag writes one cell, from a fixed store→field table, and
      // touches nothing else. It also lands in the audit log, which the local
      // queue never would have.
      const stampOk = function (b, store, id, field) {
        if (!navigator.onLine || !Sync.configured()) { toast(t('anom_needs_net')); return Promise.resolve(); }
        const undo = busyBtn(b);
        return Auth.call('setAnomalyFlag', { token: Auth.token(), store: store, id: id, field: field })
          .then(function () {
            // A117: only after the server said ok — a failed stamp must keep
            // its card, or the desk hides a problem nobody answered.
            stampedAnswers[store + '|' + id + '|' + field] = 1;
            toast(t('saved'));
            settleCard(b);
            // pull so this device's own snapshot stops raising it too; the card
            // is already gone, so this is repair, not the user's feedback
            pullCentral({ force: true }).catch(function () {});
          })
          .catch(function (e) { undo(); toast(errMsg(e)); });
      };
      document.querySelectorAll('[data-dupok]').forEach(function (b) {
        b.onclick = function () { stampOk(b, 'payments', b.dataset.dupok, 'dupOk'); };
      });
      document.querySelectorAll('[data-ddupok]').forEach(function (b) {
        b.onclick = function () { stampOk(b, 'daily', b.dataset.ddupok, 'dupOk'); };
      });
      // A80: same stamp, same field name, on the donor row this time.
      document.querySelectorAll('[data-pdupok]').forEach(function (b) {
        b.onclick = function () { stampOk(b, 'parties', b.dataset.pdupok, 'dupOk'); };
      });
      document.querySelectorAll('[data-ddupvoid]').forEach(function (b) {
        b.onclick = function () { renderVoidReason('daily', b.dataset.ddupvoid, function () { navigate('anomalies'); }); };
      });
      document.querySelectorAll('[data-pledgeok]').forEach(function (b) {
        b.onclick = function () {
          const p = partyById[b.dataset.pledgeok] || {};
          const paid = (r.anomalies.filter(function (a) { return a.type === 'overpaid' && a.partyId === b.dataset.pledgeok; })[0] || {});
          if (!window.confirm(t('anom_overpaid_ok_confirm').replace('{who}', p.name || '?')
                .replace('{p}', fmtMoney(paid.pledged || 0)).replace('{n}', fmtMoney(paid.paid || 0)))) return;
          stampOk(b, 'parties', b.dataset.pledgeok, 'pledgeOk');
        };
      });
      document.querySelectorAll('[data-pledgefix]').forEach(function (b) {
        b.onclick = function () { navigate('partyform', { id: b.dataset.pledgefix, from: 'anomalies' }); };
      });
    }).catch(function () {
      $view().innerHTML = backBar('report') + '<div class="empty">' + esc(t('fetch_fail')) + '</div>';
    });
  }
  function loadMySummary() {
    const ident = Settings.get('collectorUsername') || Settings.get('collectorName');
    viewData().then(function (data) {
      const el = document.getElementById('my-summary');
      if (!el) return; // view changed while computing
      el.innerHTML = mySummaryHTML(Aggregate.mySummary(data, ident, todayISO()), false);
      wireSummary(el);
      wireNav(); // the pending-in strip's CTA and the equation terms are data-go buttons
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
  // A154: which slice of the book a report is about.
  //
  // Now that the অনুষ্ঠান has its own tab, the puja's screens must show the
  // puja's rows — otherwise the same টিকিট and the same শিল্পী bill appear in
  // both places and the separation is decoration.
  //
  // TWO reports are deliberately left WHOLE, and this is the line worth
  // remembering: **a note in somebody's pocket has no ভাঁড়ার.** "কার হাতে কত"
  // and "কে কত তুলল" are about people, not books, and splitting them would
  // invent a fact that does not exist — nobody can say which ₹500 of the ₹3,000
  // in Ramesh's pocket is programme money, because it is not true of the notes.
  const WHOLE_BOOK_REPORTS = ['inhand', 'collectors'];
  function bookFor(id, data) {
    if (WHOLE_BOOK_REPORTS.indexOf(id) >= 0) return data;
    if (id === 'program') return data; // computeReport('program') filters itself
    return Aggregate.ofSector(data, 'puja');
  }
  function loadReport(id) {
    viewData().then(function (data) {
      const body = document.getElementById('report-body');
      if (!body) return; // view changed while computing
      try {
        const rep = Aggregate.computeReport(id, bookFor(id, data));
        // A154: the puja's overview shows the puja's numbers — and carries the
        // ONE place the committee's combined figure lives, computed from the
        // WHOLE book. Hrishi's call: separate everywhere, added up in one place,
        // never a second column smeared across every screen.
        if (id === 'overview') rep.bySector = Aggregate.sectorSplit(data);
        body.innerHTML = reportHTML(id, rep) +
          '<button id="report-pdf" class="ghost big block">📄 ' + esc(t('report_pdf_btn')) + '</button>';
        document.getElementById('report-pdf').onclick = function () { printReport(id); };
        // A150: the transfer button only exists on the programme report, and
        // only for a cashier — wired here, where the report body is painted, so
        // a drawn-but-dead button (this project has shipped two) is impossible.
        const tb = document.getElementById('transfer-btn');
        if (tb) tb.onclick = function () { startFlow(transferFlow()); };
        const db2 = document.getElementById('duty-btn');
        if (db2) db2.onclick = function () { startFlow(dutyFlow()); };
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
        printReportHTML(id, Aggregate.computeReport(id, bookFor(id, data)), data);
      window.print();
    });
  }

  // ONE update path. It is reached from ⚙️ Settings and from the red version
  // bar, and two copies of a sequence this delicate would drift — A31 was three
  // stacked mistakes inside exactly this code. `btn` is whatever the user
  // actually pressed; it may be null when nothing needs disabling.
  function runUpdate(btn) {
    btn = btn || { disabled: false };
    if (!navigator.serviceWorker) { toast(t('upd_none')); return; }
    btn.disabled = true;
    // A31: the user TAPPED this. The automatic-reload cap exists to stop a
    // worker reloading the page with nobody's consent — a tap IS consent, and
    // a reload loop cannot tap a button. Exempting the manual path is the
    // whole point of having a manual path: the cap's own comment promised
    // "anything further needs the user's own 🔄", and until now that promise
    // was false, because the tap went through the same capped handler.
    userReload = true;
    try { sessionStorage.removeItem('ck_swReload'); } catch (e) {}
    navigator.serviceWorker.getRegistration().then(function (r) {
      if (!r) { btn.disabled = false; toast(t('upd_none')); return; }
      return r.update().then(function () {
        const w = r.installing || r.waiting;
        if (!w) {
          // NOTHING to download — and this is the trap the whole bug lived in.
          // The worker can ALREADY be holding a newer version (it installed and
          // claimed the page while the automatic reload was capped or missed),
          // so update() correctly finds nothing new, and the old code said
          // "✅ you are on the latest" while the tab kept running yesterday's
          // JS. Forever: every tap re-ran the same check and gave the same
          // false all-clear. When the held version is not the running version
          // the fix was never a download, it is a reload.
          return swVersion().then(function (have) {
            if (have && have.indexOf(' / ') < 0 && have !== APP_VERSION) { location.reload(); return; }
            btn.disabled = false; toast(t('upd_latest')); showVersion();
          });
        }
        toast(t('upd_found'));
        // Drive the reload from here rather than trusting controllerchange:
        // this is the one path the user can see, so it must not depend on an
        // event that another guard might swallow.
        if (w.state === 'activated') { location.reload(); return; }
        w.addEventListener('statechange', function () {
          if (w.state === 'activated') location.reload();
          // An install that dies (one asset failed — install is all-or-nothing
          // by design) used to be completely silent: the toast had already
          // said "downloading", and nothing ever contradicted it. Say so.
          else if (w.state === 'redundant') { btn.disabled = false; toast(t('upd_fail')); showVersion(); }
        });
      });
    }).catch(function () { btn.disabled = false; toast(t('upd_none')); });
  }

  // A31: what the SERVICE WORKER has ready, which is not the same question as
  // what this page is running. Ask the controlling worker directly — it is the
  // one actually answering this page's fetches. Fall back to the cache names,
  // and when several exist say so rather than picking one arbitrarily: during
  // an install two coexist, and `keys()[0]` was returning the OLDER of them.
  function swVersion() {
    return new Promise(function (resolve) {
      const sw = navigator.serviceWorker && navigator.serviceWorker.controller;
      if (!sw || typeof MessageChannel === 'undefined') { resolve(null); return; }
      const ch = new MessageChannel();
      const timer = setTimeout(function () { resolve(null); }, 1500);
      ch.port1.onmessage = function (ev) { clearTimeout(timer); resolve(ev.data || null); };
      try { sw.postMessage({ q: 'version' }, [ch.port2]); } catch (e) { clearTimeout(timer); resolve(null); }
    }).then(function (v) {
      if (v || !window.caches) return v;
      return caches.keys().then(function (ks) {
        const mine = ks.filter(function (k) { return k.indexOf('chanda-v') === 0; });
        return mine.length ? mine.join(' / ') : null;
      }).catch(function () { return null; });
    });
  }
  // Print the version that is RUNNING, and — separately — shout if the worker
  // is holding a different one. That gap is exactly the state "I pressed update
  // and nothing changed" lives in, and it used to be invisible.
  function showVersion() {
    const el = document.getElementById('app-ver');
    if (!el) return;
    // A128: show the SERVER's version next to the phone's even when they match.
    // The top bars only exist on mismatch, so "are we in sync?" had no
    // yes-answer anywhere — only the absence of a warning, which reads the same
    // as "not checked". Empty serverVersion means we have never heard from the
    // server: say nothing rather than raise a mark nobody can act on.
    const srv = Auth.serverVersion();
    const base = esc(APP_VERSION + ' • ' + location.hostname) +
      (srv ? '<br>' + esc(t('ver_srv_line').replace('{srv}', srv) +
        (srv === APP_VERSION ? ' ✅' : ' ⚠️')) : '');
    el.innerHTML = base;
    swVersion().then(function (have) {
      if (!have || have === APP_VERSION) return;
      const el2 = document.getElementById('app-ver');
      if (!el2) return;
      el2.innerHTML = base +
        '<br><b class="warn">' + esc(t('upd_stale').replace('{v}', have)) + '</b>';
    });
  }
  // A66 (audit 2.16): iOS Safari has no beforeinstallprompt and no install
  // button anywhere — the only way onto the home screen is Share → "Add to Home
  // Screen", which nobody finds by accident. An iPhone collector who never does
  // it never gets the service worker, so the app they were told works offline
  // simply does not, and they find that out at a roadside with no signal.
  //
  // Shown only where it is true and useful: iOS, in Safari, not already
  // installed. A hint that appears on a phone it does not apply to is the kind
  // of noise people learn to scroll past.
  function iosInstallHint() {
    const ua = navigator.userAgent || '';
    const isIOS = /iPad|iPhone|iPod/.test(ua) ||
                  (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS lies
    if (!isIOS) return '';
    const standalone = window.navigator.standalone === true ||
                       (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches);
    if (standalone) return '';
    return '<div class="card"><div class="card-title">📲 ' + esc(t('ios_install_title')) + '</div>' +
      '<div class="row-sub" style="margin-top:4px">' + esc(t('ios_install_how')) + '</div>' +
      '<div class="perm-note">' + esc(t('ios_install_why')) + '</div></div>';
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
      '<div class="row-sub">' + esc(t('logged_in_as')) + ': @' + esc(user.username) + '</div>' +
      '<button id="profile-btn" class="chip" style="margin-top:8px">✏️ ' + esc(t('profile_btn')) + '</button></div>' +
      iosInstallHint() +
      (Auth.isAdmin() ? '<button id="adm-btn" class="primary big block">' + esc(t('admin_panel')) + '</button>' : '') +
      '<button id="help-btn" class="ghost big block">' + esc(t('help_btn')) + '</button>' +
      (('Notification' in window) ? '<button id="notif-btn" class="ghost big block">' + esc(t('notif_enable')) + '</button>' : '') +
      '<div class="card">' +
      '<div class="field"><label>' + esc(t('language')) + '</label>' +
      '<div class="chips"><button class="chip' + (Settings.get('lang') === 'bn' ? ' on' : '') + '" data-l="bn">বাংলা</button>' +
      '<button class="chip' + (Settings.get('lang') === 'en' ? ' on' : '') + '" data-l="en">English</button></div></div>' +
      fields.map(function (f) {
        return '<div class="field"><label>' + esc(t(f[1])) + '</label>' +
          '<input type="' + f[2] + '" data-k="' + f[0] + '" value="' + esc(Settings.get(f[0])) + '">' +
          // A37: this field OVERRIDES config.js, and silently. A phone with an
          // old URL pasted here keeps talking to a dead backend through every
          // redeploy, and nothing on screen says so — you cannot see which of
          // the two is winning. Emptying it is the fix, and emptying a long URL
          // on a phone by hand is exactly the kind of chore nobody finishes.
          (f[0] === 'scriptUrl'
            ? '<div class="row-sub" style="margin-top:6px">' +
                esc(Settings.get('scriptUrl') ? t('surl_own') : t('surl_default')) + '</div>' +
              (Settings.get('scriptUrl')
                ? '<button id="surl-clear" class="chip" style="margin-top:6px">↺ ' +
                    esc(t('surl_clear')) + '</button>' : '')
            : '') + '</div>';
      }).join('') + '</div>' +
      '<button id="sync-btn" class="primary big block">☁️ ' + esc(t('sync_now')) + '</button>' +
      '<button id="export-btn" class="ghost big block">' + esc(t('export_backup')) + '</button>' +
      // Importing a JSON file rewrites this device's book. In anyone's hands but
      // the admin's that is a way to quietly ruin your own figures, and there is
      // no reason a collector would ever need it.
      (Auth.isAdmin() ? '<button id="import-btn" class="ghost big block">' + esc(t('import_backup')) + '</button>' +
        '<input type="file" id="import-file" accept=".json" hidden>' : '') +
      // A132: only exists while there is something to show — a permanent
      // graveyard door on every phone would be noise about a disaster that
      // almost never happens
      (graveyardRead().length ? '<button id="grave-btn" class="ghost big block">🪦 ' +
        esc(t('graveyard_btn').replace('{n}', toBengaliDigits(String(graveyardRead().length)))) + '</button>' : '') +
      '<button id="chpw-btn" class="ghost big block">🔑 ' + esc(t('change_pw_title')) + '</button>' +
      '<button id="logout-btn" class="ghost big block">🚪 ' + esc(t('logout')) + '</button>' +
      // A28: which version is THIS PHONE actually running? There was no way to
      // tell, so "I deployed but I see no change" could not be diagnosed from
      // the device. The cache name is the honest answer — it is the cache the
      // JS is really being served from, not what the server happens to have.
      '<div class="empty" id="app-ver">…</div>' +
      '<button id="upd-btn" class="ghost block">🔄 ' + esc(t('check_update')) + '</button>';
    showVersion();
    const sc = document.getElementById('surl-clear');
    if (sc) sc.onclick = function () {
      Settings.set('scriptUrl', '');
      toast(t('surl_cleared'));
      renderSettings();
    };
    const updB = document.getElementById('upd-btn');
    if (updB) updB.onclick = function () { runUpdate(updB); };
    const admB = document.getElementById('adm-btn');
    if (admB) admB.onclick = function () { admSection = ''; admUserId = ''; admDraft = null; navigate('admin'); };
    document.getElementById('help-btn').onclick = function () { navigate('help'); };
    const graveB = document.getElementById('grave-btn');
    if (graveB) graveB.onclick = function () { navigate('graveyard'); };
    const profB = document.getElementById('profile-btn');
    if (profB) profB.onclick = function () { navigate('profile'); };
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
        setCentral(null); centralCursor = ''; centralYear = '';
        ['ck_central', 'ck_central_cursor', 'ck_central_year'].forEach(function (k) { try { localStorage.removeItem(k); } catch (e) {} });
        // A74 (audit #4 D1): and this device's OWN rows, which stayed behind.
        //
        // Measured on a seeded season: 260 donor phone numbers were reachable
        // on the handset before logging out and 60 after — the snapshot went,
        // IndexedDB did not. Those 60 are the donors this collector personally
        // called on: name, owner, phone, what they gave.
        //
        // The case this is really about is not theft. It is a ₹7,000 Android
        // handed to a roadside repair shop, unlocked, for two days — nobody
        // thinks of that as a data event, and nobody logs out first either,
        // which is why the written rule in the collector guide matters more
        // than this code does.
        //
        // Safe because it is INSIDE the unsynced guard above: the app already
        // refuses to log out while anything is queued, so this can never
        // destroy money that has not reached the server. That ordering is the
        // whole reason this is a three-line change and not a dangerous one.
        DB.clearAll().catch(function () {}).then(function () {
          // A131: the panel cache outlives the DB wipe — without this, the
          // NEXT login on this phone opens 👑 on the previous admin's numbers
          admCache = null; admSection = ''; admUserId = '';
          Auth.logout(); authView = 'login'; navigate('home');
        });
        return;
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
              // synced:0 in BOTH branches. The file carries synced:1 from the
              // phone it was exported on — after a wipe/restore those rows are
              // no longer on the server, and a row marked synced never pushes,
              // so "keep as written" used to restore a book that silently
              // never reached the Sheet. Re-pushing an existing id is a
              // harmless upsert.
              const base = owner
                ? { collector: owner.name, collectorId: owner.username }
                : {};
              return Object.assign({}, r, base, { synced: 0 });
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
    // reading the chat right now — the message is on screen, a buzz on top is
    // just noise (and marks itself read a moment later anyway)
    if (current.view === 'messages' && !document.hidden) { msgNotified = last.id; return; }
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
  // A148: is the committee running a cultural programme this season? Config
  // `program_on`, admin-set, OFF by default — and that default is the point.
  //
  // A committee with no programme must never be asked "কোন ভাঁড়ার?", because a
  // question with one possible answer is a tap taken from every entry, twelve
  // phones wide, for nothing. Once it is on, the question appears with পুজো
  // already selected, so the ordinary entry is still one tap.
  //
  // It also stays TRUE while programme rows exist even if the flag is later
  // cleared — otherwise turning it off would hide the fund's own money from its
  // own report, which is how figures go missing.
  function programOn() {
    if (String((centralConfig || {}).program_on || '') === 'on') return true;
    return programSeen;
  }
  let programSeen = false;
  // A110: the emergency freeze. Admin exempt — they are the one fixing whatever
  // caused it. Reading is untouched; this only ever answers "may I write money".
  function frozen() {
    return !!String((centralConfig || {}).freeze_at || '') && !Auth.isAdmin();
  }

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
          '<div class="msg-text">' + highlightMentions(r.text || '') + '</div>' +
          // the server refused it (chat switched off mid-flight) — nobody else
          // ever saw this, and pretending otherwise is how rumours start
          (r.rejected ? '<div class="msg-fail">❌ ' + esc(t('msg_rejected')) + '</div>' : '') +
          '</div>';
      }).join('') : '<div class="empty">' + esc(t('msg_empty')) + '</div>';
      $view().innerHTML = '<div class="flow-title">' + esc(t('msg_title')) + '</div>' +
        '<div class="hint" style="margin-bottom:8px">' + esc(t('msg_hint')) + '</div>' +
        '<div id="msg-list" class="msg-list">' + body + '</div>' +
        '<div id="msg-picker" class="chips" hidden></div>' +
        // A78d: a stood-down member READS the chat — that is how they learn what
        // the committee still wants from them — but the server refuses their
        // messages, so the composer would have taken a sentence and dropped it.
        (amExiting()
          ? '<div class="perm-note">🚪 ' + esc(t('msg_exiting')) + '</div>'
          : '<div class="input-row msg-compose">' +
            '<input id="msg-input" maxlength="500" enterkeyhint="send" placeholder="' + esc(t('msg_ph')) + '" autocomplete="off" value="' + esc(msgDraft) + '">' +
            '<button id="msg-at" class="ghost">@</button>' +
            '<button id="msg-send" class="primary">' + esc(t('msg_send')) + '</button>' +
          '</div>');
      const list = document.getElementById('msg-list');
      if (list) list.scrollTop = list.scrollHeight;
      // reading the screen IS the read receipt
      if (rows.length) msgMarkSeen(String(rows[rows.length - 1].createdAt || ''));
      updateBadge();
      const input = document.getElementById('msg-input');
      if (input) {
        input.oninput = function () { msgDraft = input.value; };
        document.getElementById('msg-at').onclick = function () { toggleMentionPicker(input); };
        document.getElementById('msg-send').onclick = function () { sendMessage(input); };
        input.onkeydown = function (e) { if (e.key === 'Enter') sendMessage(input); };
      }
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
    // paint the cache at once so the picker feels instant, then refresh it in
    // the background — a cashier appointed an hour ago must be mentionable
    // without anyone reloading the app
    if (msgUserCache) paint(msgUserCache);
    Auth.call('cashiers', { token: Auth.token() })
      .then(function (r) { msgUserCache = r.cashiers || []; if (!box.hidden) paint(msgUserCache); })
      .catch(function () { if (!msgUserCache) paint([]); }); // offline → groups only
  }
  let msgUserCache = null;
  function sendMessage(input) {
    // 500 chars: the maxlength attribute guards the keyboard, this guards paste
    // and any path around the input. A Sheet cell takes 50,000, but one pasted
    // essay would ride every phone's pull forever.
    const txt = String(input.value || '').trim().slice(0, 500);
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
  function renderHelp(params) {
    params = params || {};
    const lang = Settings.get('lang');
    const secs = (window.HELP || []).map(function (s) {
      return '<div class="card"' + (s.id ? ' data-sec="' + esc(s.id) + '"' : '') +
        '><div class="card-title">' + esc(s.icon + ' ' + s.title[lang]) + '</div>' +
        s.body[lang].map(function (p) { return '<div class="help-p">' + p + '</div>'; }).join('') + '</div>';
    }).join('');
    // A122: ← returns to the SOURCE screen — every 📖 door passes where it was
    // opened from. Settings stays the default for the guide's own home there.
    $view().innerHTML = backBar(params.from || 'settings') +
      '<div class="flow-title">' + esc(t('help_title')) + '</div>' + secs;
    // …and a door that names a section lands ON that section, not at the top
    // of a long page the reader then has to search by hand.
    if (params.sec) {
      const target = $view().querySelector('[data-sec="' + params.sec + '"]');
      // queued: navigate() ends with scrollTo(0,0) AFTER render, so a
      // synchronous scroll here was silently undone — the reader landed at the
      // top of a long page and had to hunt. The microtask runs after navigate
      // finishes, so this scroll is the one that sticks.
      if (target) {
        target.style.borderColor = '#c0392b';
        queueMicrotask(function () { target.scrollIntoView(); });
      }
    }
  }

  // ---------- auth views ----------
  let authView = 'login'; // login | register | forgot | regdone
  // A35: an error we have no translation for used to be shown as
  // "Internet/সার্ভার সমস্যা". That is a LIE with a cost: the server refusing
  // for a nameable reason and the phone having no signal are different problems
  // with different fixes, and collapsing them meant a real bug report
  // ("permission in positions was not working, giving internet error") carried
  // none of the information needed to find it. Same shape as A31 — the one
  // indicator saying the reassuring wrong thing.
  //
  // Only a genuine transport failure says "Internet" now; anything the server
  // actually said is repeated verbatim, because a word nobody translated still
  // beats a sentence that is wrong.
  function errMsg(e) {
    const raw = String(e && e.message || e);
    const code = raw.replace(/-/g, '_');
    const key = 'err_' + (code === 'year_not_approved' ? 'year' : code);
    if (I18N[key]) return t(key);
    // A115: some refusals carry WHICH rule stopped you — `position-denied:
    // level-want`, `member-holds-post:treasurer`. Try the whole thing first, so
    // each reason can have its own sentence, then fall back to the family. Both
    // halves matter: without the second, a new reason added server-side would
    // show the collector a raw English error code.
    if (code.indexOf(':') >= 0) {
      const whole = 'err_' + code.replace(/:/g, '_');
      if (I18N[whole]) return t(whole);
      const family = 'err_' + code.split(':')[0];
      if (I18N[family]) return t(family).replace('{what}', raw.split(':')[1] || '');
    }
    if (code === 'network' || code === 'Failed_to_fetch') return t('err_network');
    return t('err_server') + ': ' + raw;
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
      const btn = this, undo = busyBtn(btn);
      Auth.login(user, pw)
        .then(function () { navigate('home'); autoSync(); })
        .catch(function (e) { undo(); authError(errMsg(e)); });
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
      '<div class="field"><label>✉️ ' + esc(t('member_f_email')) + '</label><input id="rg-email" inputmode="email" autocapitalize="none"></div>' +
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
      const email = document.getElementById('rg-email').value.trim();
      if (email && !/^\S+@\S+\.\S+$/.test(email)) { authError(t('err_email')); return; }
      const btn = this, undo = busyBtn(btn);
      Auth.register({ name: name, username: username,
        phone: phone ? cleanPhoneIN(phone) : '', email: email, password: pw,
      }).then(function (resp) {
        if (resp && resp.first) { authView = 'login'; toast(t('reg_admin_msg')); }
        else authView = 'regdone';
        renderAuth();
      }).catch(function (e) { undo(); authError(errMsg(e)); });
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
      const btn = this, undo = busyBtn(btn);
      Auth.changePassword(oldEl ? oldEl.value : '', nw)
        .then(function () { toast(t('saved')); navigate('home'); })
        .catch(function (e) { undo(); toast(errMsg(e)); });
    };
  }

  // ---------- admin panel ----------
  // A38: was `renderAdmin()` — a full rebuild plus three re-reads after EVERY
  // action, which emptied #view, collapsed the page and dropped the scroll to 0.
  // When the server hands back the fresh user (it does, in eight handlers) the
  // cache is patched and only the current screen repaints; otherwise the lists
  // really did change, so a genuine reload is right.
  function adminAction(action, payload, after, btn) {
    // A127: the admin's own taps (block, reset, role, cashier…) had NO visible
    // response at all — not even a disable — for the full 1–3 s round trip.
    const undo = busyBtn(btn);
    Auth.call(action, Object.assign({ token: Auth.token() }, payload))
      .then(function (resp) {
        undo();
        after && after(resp);
        if (resp && resp.user && admCache) { admPut(resp.user); paintAdmin(admCache); }
        else renderAdmin(true);
      })
      // A35: an admin failure has to be READABLE. A toast is gone in 2.2s —
      // long enough to notice, nowhere near long enough to read, remember and
      // report. The person using this screen is the person who reports bugs, so
      // the message names the action too: one line is then a whole bug report.
      .catch(function (e) { undo(); alert('⚠️ ' + action + '\n\n' + errMsg(e)); });
  }
  // A78 ── the committee's access door ─────────────────────────────────────
  // Standing a member down takes their post AND both permission lists in one
  // server call, because effPerms_ unions the post's set with their personal
  // extras: leave either behind and everything comes straight back while the
  // screen says it worked. That is why there is no chip for this and no
  // three-step recipe for the admin to remember.
  function exitUser(u) {
    if (!u) return;
    if (!window.confirm(t('access_exit_confirm').replace('{n}', u.name))) return;
    Auth.call('setAccess', { token: Auth.token(), userId: u.id, access: 'exiting', year: Settings.get('year') })
      .then(function (resp) {
        toast('🚪 ' + t('access_exit_done'));
        if (resp && resp.user && admCache) { admPut(resp.user); paintAdmin(admCache); }
        else renderAdmin(true);
      })
      .catch(function (e) {
        // A78b: "there are parcels on their way to this person" is not an error
        // to shrug at — it is a job with a number on it, and the person who can
        // do that job fastest is the one about to be stood down, while they are
        // still a cashier. So it is spelled out rather than shown as a code.
        const m = String(e && e.message || '');
        if (m.indexOf('has-pending:') !== 0) { alert('⚠️ setAccess\n\n' + errMsg(e)); return; }
        const p = m.split(':');
        alert('⚠️ ' + t('access_has_pending')
          .replace('{n}', toBengaliDigits(String(p[1])))
          .replace('{amt}', fmtMoney(Number(p[2]))));
      });
  }
  // Coming back needs a post, and the post is the whole content of the screen.
  // Without one they would be "active" with nothing granted — indistinguishable
  // from having just been stood down, which is the confusion this feature
  // exists to end.
  function restoreUser(u, positions) {
    if (!u) return;
    const list = (positions || []).filter(function (p) { return p && p.id; });
    if (!list.length) { alert(t('access_no_posts')); return; }
    const lines = list.map(function (p, i) { return (i + 1) + '. ' + (p.nameBn || p.nameEn || p.id); });
    const ans = window.prompt(t('access_restore_pick').replace('{n}', u.name) + '\n\n' + lines.join('\n'), '');
    if (ans === null) return;
    const pick = list[Number(String(ans).trim()) - 1];
    if (!pick) { alert(t('access_bad_pick')); return; }
    adminAction('setAccess', { userId: u.id, access: '', position: pick.id, year: Settings.get('year') },
      function () { toast('✅ ' + t('access_restore_done')); });
  }
  // The security door. It refuses while the person still holds cash and names
  // the figure — a person who cannot log in cannot hand money back, so the
  // refusal is the feature. `override` is the committee writing the amount off,
  // and it goes into the record and the audit log with the number on it; it is
  // never quietly zeroed, or the book stops adding up.
  function blockUser(id) {
    if (!window.confirm(t('block_confirm'))) return;
    Auth.call('setStatus', { token: Auth.token(), userId: id, status: 'blocked', year: Settings.get('year') })
      .then(function (resp) {
        if (resp && resp.user && admCache) { admPut(resp.user); paintAdmin(admCache); }
        else renderAdmin(true);
      })
      .catch(function (e) {
        const m = String(e && e.message || '');
        if (m.indexOf('holds-money:') !== 0) { alert('⚠️ setStatus\n\n' + errMsg(e)); return; }
        const amt = m.slice('holds-money:'.length);
        // A97: a one-shot String.replace fills only the FIRST {amt}. The English
        // sentence names the sum twice — "holding ₹1,200 … record {amt} as
        // unrecovered" — so an English admin was asked to sign off on a literal
        // placeholder. Split/join fills every one, in any language.
        if (!window.confirm(t('block_holds_money').split('{amt}').join(fmtMoney(Number(amt))))) return;
        adminAction('setStatus', { userId: id, status: 'blocked', year: Settings.get('year'), override: 1 },
          function () { toast('🚫 ' + t('access_written_off').replace('{amt}', fmtMoney(Number(amt)))); });
      });
  }
  // A110: is the freeze on? Asked WITHOUT the admin exemption that frozen()
  // applies — the button has to show the state of the switch, not whether it
  // happens to bind the person looking at it.
  function freezeOn() { return !!String((centralConfig || {}).freeze_at || ''); }
  // Turning it on takes two questions, the second carrying the headcount,
  // because "everyone stops now" should be felt before it is done. Turning it
  // off takes one: the safe direction never earns ceremony.
  function toggleFreeze(users) {
    const on = freezeOn();
    if (on) {
      if (!window.confirm(t('freeze_off_confirm'))) return;
      adminAction('setFreeze', { on: '0' }, function () {
        toast(t('freeze_off_done')); renderAdmin(true);
      });
      return;
    }
    if (!window.confirm(t('freeze_c1'))) return;
    const n = (users || []).filter(function (u) {
      return String(u.status) === 'approved' && String(u.role) !== 'admin';
    }).length;
    if (!window.confirm(t('freeze_c2').replace('{n}', toBengaliDigits(String(n))))) return;
    adminAction('setFreeze', { on: '1', confirm: 'FREEZE' }, function () {
      toast(t('freeze_on_done')); renderAdmin(true);
    });
  }
  function showSnapshot(u) { if (u) navigate('usersnap', { userId: u.id, name: u.name }); }
  // Saved beside live, because after the exit these two stop moving together
  // and either one alone lies: the saved figures are what the committee decided
  // on, the live ones are what is still outstanding today.
  function renderUserSnapshot(p) {
    p = p || {};
    $view().innerHTML = backBar('admin') +
      '<div class="flow-title">' + esc(t('access_picture')) + ' — ' + esc(p.name || '') + '</div>' +
      '<div id="snap-body"><div class="empty">' + esc(t('loading')) + '</div></div>';
    Auth.call('userSnapshot', { token: Auth.token(), userId: p.userId, year: Settings.get('year') })
      .then(function (r) {
        const body = document.getElementById('snap-body'); if (!body) return;
        const live = r.live || {}, saved = r.saved || {};
        const money = function (v) { return esc(fmtMoney(Number(v) || 0)); };
        const pane = function (key, titleKey) {
          const s = saved[key];
          if (!s) return '';
          const line = function (lab, a, b) {
            return '<div class="row" style="cursor:default"><div style="flex:1">' + esc(t(lab)) + '</div>' +
              '<div style="width:38%;text-align:right">' + money(a) + '</div>' +
              '<div style="width:38%;text-align:right"><b>' + money(b) + '</b></div></div>';
          };
          return '<div class="section">' + esc(t(titleKey)) + ' · ' + esc(fmtDateTime(s.at)) + '</div>' +
            '<div class="card">' +
            '<div class="row" style="cursor:default"><div style="flex:1"></div>' +
              '<div style="width:38%;text-align:right" class="row-sub">' + esc(t('access_then')) + '</div>' +
              '<div style="width:38%;text-align:right" class="row-sub">' + esc(t('access_now')) + '</div></div>' +
            line('access_collected', s.collected, live.collected) +
            line('access_handed', s.handedOver, live.handedOver) +
            line('access_inhand', s.inHand, live.inHand) +
            '<div class="row" style="cursor:default"><div style="flex:1">' + esc(t('access_their_due')) + '</div>' +
              '<div style="width:38%;text-align:right">' + money(s.dueTotal) + ' <span class="row-sub">(' +
                esc(toBengaliDigits(String(s.dueCount))) + ')</span></div>' +
              '<div style="width:38%;text-align:right"><b>' + money(live.dueTotal) + '</b> <span class="row-sub">(' +
                esc(toBengaliDigits(String(live.dueCount))) + ')</span></div></div>' +
            // The line without which the table reads like a bug: their own dues
            // can fall while their collection stands still, because somebody
            // else went and collected them — which is what was intended.
            (key === 'exit' && r.since
              ? '<div class="row-sub" style="padding:0 12px 10px">' +
                  esc(t('access_since').replace('{o}', fmtMoney(r.since.byOthers)).replace('{h}', fmtMoney(r.since.byHim))) +
                '</div>' : '') +
            (s.writtenOff ? '<div class="perm-note">⚠️ ' +
              esc(t('access_written_off').replace('{amt}', fmtMoney(s.writtenOff))) + '</div>' : '') +
            '</div>';
        };
        // A99: what somebody who is STILL WORKING is holding.
        //
        // The panes above are a then/now comparison, and `saved` only exists
        // once a person has been stood down or blocked — so for everybody else
        // this screen used to print "no picture saved yet" and a dues list, and
        // dropped `live` on the floor. The server had already computed and sent
        // collected / received / handed / in-hand; nothing showed them. One
        // column, because with no exit there is no "then" to compare against.
        const liveRow = function (labKey, v, strong) {
          return '<div class="row" style="cursor:default"><div style="flex:1">' + esc(t(labKey)) + '</div>' +
            '<div style="text-align:right">' + (strong ? '<b>' + money(v) + '</b>' : money(v)) + '</div></div>';
        };
        const livePane = function () {
          const n = function (k) { return Number(live[k]) || 0; };
          return '<div class="section">' + esc(t('access_today')) + '</div><div class="card">' +
            liveRow('access_collected', n('collected')) +
            // only a cashier is ever handed money by somebody else
            (n('received') ? liveRow('received_col', n('received')) : '') +
            (n('expenseTotal') ? liveRow('total_expense', n('expenseTotal')) : '') +
            liveRow('access_handed', n('handedOver')) +
            liveRow('access_inhand', n('inHand'), true) +
            // …and the money already sent but unanswered is INSIDE that figure,
            // so it hangs off it. On its own row it read like a second pile,
            // and an admin chasing ₹3,800 would go looking for cash that is
            // sitting in a cashier's unconfirmed inbox.
            (n('pending') ? '<div class="row-sub" style="padding:0 12px 10px">' +
              esc(t('access_pending_out').replace('{amt}', fmtMoney(n('pending')))) + '</div>' : '') +
            '<div class="row" style="cursor:default"><div style="flex:1">' + esc(t('access_their_due')) + '</div>' +
              '<div style="text-align:right">' + money(n('dueTotal')) + ' <span class="row-sub">(' +
                esc(toBengaliDigits(String(n('dueCount')))) + ')</span></div></div>' +
            '</div>';
        };
        const dues = (live.dues || []);
        body.innerHTML = pane('exit', 'access_at_exit') + pane('block', 'access_at_block') +
          (!saved.exit && !saved.block ? livePane() : '') +
          '<div class="section">' + esc(t('access_open_dues')) + '</div>' +
          (dues.length ? '<div class="card">' + dues.map(function (d) {
            return '<div class="row" style="cursor:default"><div style="flex:1"><b>' + esc(d.name) + '</b>' +
              (d.phone ? '<div class="row-sub">📞 ' + esc(d.phone) + '</div>' : '') + '</div>' +
              '<div style="text-align:right"><b>' + money(d.due) + '</b>' +
              '<div class="row-sub">' + esc(t('access_of')).replace('{p}', fmtMoney(d.pledged)) + '</div></div></div>';
          }).join('') + '</div>' : '<div class="empty">' + esc(t('access_no_dues')) + '</div>');
      })
      .catch(function (e) {
        const body = document.getElementById('snap-body');
        if (body) body.innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>';
      });
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
    // A88: the sample carries a collector, because A83 put that line on every
    // real receipt and a preview that omits it is a preview of a different
    // document. The admin is choosing a layout by looking at this; it has to be
    // the thing they will actually hand out.
    const sampleRC = { donorLine: 'শ্রী/শ্রীমতী রমেশ সাহা, কমল স্টোর্স', showTotals: true,
      date: todayISO(), datetime: new Date().toISOString(),
      collector: Settings.get('collectorName') || 'কালী দাস',
      amount: 500, cashUpi: '', paidTotal: 500, pledged: 1000, due: 500, receiptNo: '' };
    function drawPreview() {
      const d = Math.min(9, Math.max(4, Number(form.receipt_digits) || 6));
      sampleRC.receiptNo = String(Settings.get('year') || '2026') + String(1).padStart(d, '0');
      buildReceiptCanvas(sampleRC, {
        // A98: the same fallbacks receiptConfig() uses, so the preview is the
        // document that will actually be handed out — not a different one
        layout: form.receipt_layout, puja: form.puja_name || tBn('app_title'), committee: form.committee_name,
        footer: form.receipt_footer || tBn('receipt_thanks'), color: form.receipt_color, logo: form.committee_logo,
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
        '<div class="field"><label>' + esc(t('rc_puja')) + '</label><input id="rc-puja" value="' + esc(form.puja_name) + '" placeholder="' + esc(tBn('app_title')) + '"></div>' +
        '<div class="field"><label>' + esc(t('rc_committee')) + '</label><input id="rc-name" value="' + esc(form.committee_name) + '"></div>' +
        '<div class="field"><label>' + esc(t('rc_footer')) + '</label><input id="rc-footer" value="' + esc(form.receipt_footer) + '" placeholder="' + esc(tBn('receipt_thanks')) + '"></div>' +
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
        const btn = this, undo = busyBtn(btn);
        Auth.call('setConfig', { token: Auth.token(), config: form }).then(function () {
          centralConfig = Object.assign({}, centralConfig, form);
          try { localStorage.setItem('ck_config', JSON.stringify(centralConfig)); } catch (e) {}
          toast(t('saved')); navigate('admin');
        }).catch(function (e) { undo(); toast(errMsg(e)); });
      };
    }
    paint();
  }
  // A38: the panel was ONE page holding five jobs. Eleven users expanding inline
  // made it 3,100px and 331 buttons, and every action rebuilt the whole thing —
  // which emptied #view, collapsed the page and dropped the scroll to 0.
  // Hrishi: "i have to scroll a lot", "the page is moving here there everywhere".
  //
  // It is now list → screen, the idiom this app already uses everywhere else
  // (📒 খাতা → a donor, 🎖️ নথি → a member). On the one-person screen the chips
  // edit a DRAFT and one 💾 saves the lot: before this, granting eleven people
  // was ~88 taps × 4 server calls ≈ 350 calls.
  let admCache = null, admSection = '', admUserId = '', admDraft = null;
  let admMoneyFailed = false; // A108: did the A107 fallback fire on this load?
  let admPosId = '', admPosDraft = null;
  function admDirty() {
    if (!admDraft || !admCache) return 0;
    const u = (admCache[0].users || []).filter(function (x) { return x.id === admUserId; })[0];
    if (!u) return 0;
    const same = function (a, b) { return a.slice().sort().join() === b.slice().sort().join(); };
    let n = 0;
    if (admDraft.position !== String(u.position || '')) n++;
    if (!same(admDraft.entries, String(u.ownEntries || '').split(',').filter(Boolean))) n++;
    if (!same(admDraft.reports, String(u.ownReports || '').split(',').filter(Boolean))) n++;
    if (!same(admDraft.areas, String(u.areas || '').split(',').filter(Boolean))) n++;
    return n;
  }
  function admPosItem() {
    if (!admCache) return null;
    return ((admCache[2] || {}).items || []).filter(function (x) { return x.id === admPosId; })[0] || null;
  }
  function admPosDirty() {
    const it = admPosItem();
    if (!it || !admPosDraft) return 0;
    let n = 0;
    if (admPosDraft.max !== (Number(it.maxCount) || 0)) n++;
    if (admPosDraft.level !== (Number(it.level) || 0)) n++;
    if (admPosDraft.perms.slice().sort().join() !==
        String(it.perms || '').split(',').filter(Boolean).sort().join()) n++;
    return n;
  }
  // Same shape as a person: chips edit a draft, one 💾 writes it, and the reply
  // is folded into the cached item so nothing is re-read.
  function admPosSave() {
    const it = admPosItem();
    if (!it || !admPosDraft) return;
    const btn = document.getElementById('adm-pos-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + t('saving'); }
    Auth.call('setPositionRules', { token: Auth.token(), id: it.id,
                                    maxCount: admPosDraft.max, level: admPosDraft.level,
                                    perms: admPosDraft.perms })
      .then(function () {
        it.maxCount = admPosDraft.max;
        it.level = admPosDraft.level;
        it.perms = admPosDraft.perms.join(',');
        admPosDraft = null;
        Lists.refresh(true);        // just edited — the entry screens need it NOW
        toast('✅ ' + t('saved'));
        paintAdmin(admCache);
      }).catch(function (e) {
        if (btn) { btn.disabled = false; btn.textContent = '💾 ' + t('save'); }
        alert('⚠️ setPositionRules\n\n' + errMsg(e));
      });
  }
  // A89: when there is something unsaved, the save button leaves the flow and
  // sticks above the bottom nav. A user's permission screen is 2.8 screens on a
  // 320px phone — thirty chips — and 💾 sat at ~1,200px, so a tick made at the
  // top was saved a long scroll later, or forgotten.
  //
  // It only sticks while DIRTY. A bar that is always there costs everyone a
  // strip of screen for a button most visits never press, and this screen is
  // read far more often than it is edited.
  //
  // One helper for both save buttons: the user screen and the post screen have
  // the same shape, and a rule applied to one of a pair is this project's
  // oldest bug.
  function admStick(btn, hint, n) {
    if (!btn) return;
    btn.disabled = !n;
    btn.style.opacity = n ? '' : '.5';
    btn.classList.toggle('adm-stick', !!n);
    if (hint) {
      hint.textContent = n ? t('adm_dirty_n').replace('{n}', n) : t('adm_saved_all');
      hint.classList.toggle('adm-stick-hint', !!n);
    }
  }
  function admLeaveOk() {
    const n = admDirty() + admPosDirty();
    return !n || window.confirm(t('adm_unsaved').replace('{n}', n));
  }
  // Sends only what CHANGED — usually one call, never four — and folds the
  // server's own reply back into the cache. Eight handlers already return the
  // fresh user; re-reading the whole book after every tap was the waste that
  // emptied the page.
  function admSave(u) {
    if (!u || !admDraft) return;
    const same = function (a, b) { return a.slice().sort().join() === b.slice().sort().join(); };
    const jobs = [];
    if (admDraft.position !== String(u.position || ''))
      jobs.push(['setUserPosition', { userId: u.id, position: admDraft.position }]);
    if (!same(admDraft.entries, String(u.ownEntries || '').split(',').filter(Boolean)))
      jobs.push(['setEntries', { userId: u.id, entries: admDraft.entries }]);
    if (!same(admDraft.reports, String(u.ownReports || '').split(',').filter(Boolean)))
      jobs.push(['setReports', { userId: u.id, reports: admDraft.reports }]);
    if (!same(admDraft.areas, String(u.areas || '').split(',').filter(Boolean)))
      jobs.push(['setAreas', { userId: u.id, areas: admDraft.areas }]);
    if (!jobs.length) { toast(t('adm_saved_all')); return; }
    const btn = document.getElementById('adm-save');
    if (btn) { btn.disabled = true; btn.textContent = '⏳ ' + t('saving'); }
    // One after another: they all write the same sheet row, and Apps Script
    // would serialise them on the script lock anyway.
    jobs.reduce(function (chain, j) {
      return chain.then(function () {
        return Auth.call(j[0], Object.assign({ token: Auth.token() }, j[1]))
          .then(function (r) { if (r && r.user) admPut(r.user); });
      });
    }, Promise.resolve()).then(function () {
      admDraft = null; toast('✅ ' + t('saved')); paintAdmin(admCache);
    }).catch(function (e) {
      if (btn) { btn.disabled = false; btn.textContent = '💾 ' + t('save'); }
      alert('⚠️ ' + t('save') + '\n\n' + errMsg(e));
    });
  }
  // A40: 🧾 রসিদ ও তালিকা is add / rename / delete — each one a COMPLETE action,
  // so a 💾 would be wrong there: you would add a row and then have to save it,
  // which is one more step, not one fewer. What was wrong is the same thing as
  // everywhere else — the full reload afterwards. Rename and delete are patched
  // straight into the cache (we know the id and the new text); only ADD needs
  // the server's generated id, and then only ONE list is re-read, not all three.
  function admRepaint() {
    const y = window.scrollY;
    paintAdmin(admCache);
    window.scrollTo(0, y);
  }
  function admListAction(action, payload, patch) {
    Auth.call(action, Object.assign({ token: Auth.token() }, payload)).then(function () {
      if (patch) { patch(); Lists.refresh(true); admRepaint(); return; }
      // add: fetch back just the list that grew
      const isSubject = action.indexOf('Subject') > 0;
      Auth.call(isSubject ? 'listSubjects' : 'listItems', { token: Auth.token() })
        .then(function (r) {
          if (isSubject) admCache[1] = { subjects: r.subjects || [] };
          else admCache[2] = { items: r.items || [] };
          Lists.refresh(true); admRepaint();
        }).catch(function () { renderAdmin(true); });
    }).catch(function (e) { alert('⚠️ ' + action + '\n\n' + errMsg(e)); });
  }
  function admItems() { return (admCache[2] || {}).items || []; }
  function admSubjects() { return (admCache[1] || {}).subjects || []; }
  function admPut(fresh) {
    if (!admCache || !fresh) return;
    const list = admCache[0].users || [];
    for (let i = 0; i < list.length; i++) if (list[i].id === fresh.id) { list[i] = fresh; return; }
  }
  function admGo(section, userId) {
    if (!admLeaveOk()) return;
    admSection = section || ''; admUserId = userId || ''; admDraft = null;
    admPosId = ''; admPosDraft = null;
    window.scrollTo(0, 0);
    renderAdmin();
  }
  // These controls used to share one page, so they always existed. Each lives on
  // its own screen now, and wiring one that is not on THIS screen throws — which
  // is how the whole panel came back as a single error line. Guard, don't assume.
  function admEl(id) { return document.getElementById(id) || {}; }
  // A41: a long list wants SEARCH, not an inner scroll box. Nested scrolling on
  // a phone is a fight — you drag the page instead of the list, the inner
  // scrollbar is invisible so you cannot tell how much is left, and it breaks
  // the browser's own momentum and address-bar behaviour. And it does not
  // answer the actual question, which is "where is this one row".
  //
  // Filtering hides rows in place. It does NOT repaint, deliberately: repainting
  // on every keystroke destroys the input and takes the focus with it, so the
  // second letter goes nowhere. (📒 খাতা's search has exactly that fault; it is
  // written down in docs/pending.md rather than fixed in the same breath.)
  const ADM_FILTER_MIN = 8;   // below this a box is just clutter
  function admFilterBox(id, n) {
    return n < ADM_FILTER_MIN ? '' :
      '<input id="' + id + '" class="search" enterkeyhint="search" autocomplete="off" placeholder="' +
      esc(t('adm_filter_ph').replace('{n}', n)) + '">';
  }
  function admWireFilter(id, rowSel) {
    const box = document.getElementById(id);
    if (!box) return;
    box.oninput = function () {
      const q = normText(box.value);
      let shown = 0;
      document.querySelectorAll(rowSel).forEach(function (r) {
        // A103: matchWords, not indexOf — the same rule 📒 খাতা uses, so
        // "সুব্রত ঘোষ" and "ঘোষ সুব্রত" both find him
        const hit = matchWords(r.dataset.q || r.textContent, q);
        r.style.display = hit ? '' : 'none';
        if (hit) shown++;
      });
      const none = document.getElementById(id + '-none');
      if (none) none.style.display = shown ? 'none' : '';
    };
  }
  function renderAdmin(force) {
    if (admCache && !force) { paintAdmin(admCache); return; }
    admMoneyFailed = false; // a fresh fetch decides this again
    // A129b: a forced refresh with a cache in hand REPAINTS the cache and
    // fetches behind it — the "আনা হচ্ছে…" card is only for a panel we have
    // nothing to show for, or the screen blinks blank on every header 🔄.
    if (admCache) paintAdmin(admCache);
    else $view().innerHTML = backBar('settings') + '<div class="empty">' + esc(t('loading')) + '</div>';
    Promise.all([
      // A100: the year is what asks the server for each person's money. The
      // other two listUsers callers deliberately do not send it — they show no
      // money and must not pay for the read.
      //
      // A107: …and if that heavier call fails, ask again WITHOUT it. Sending the
      // year makes the server read the whole year's book and summarise every
      // user; the plain call reads one sheet. Of the three requests behind this
      // screen, listUsers is the only one with no fallback — listSubjects and
      // listItems each degrade to an empty list — so anything that upsets the
      // money computation took the entire admin panel down to "আবার চেষ্টা করো"
      // and left Hrishi with no way to approve a user or fix a list.
      //
      // The figures are a convenience; the panel is not. Losing the column is a
      // fair price for a screen that opens.
      //
      // bad-token and blocked are re-thrown, never retried: those mean the
      // session is gone, Auth.call has already cleared it, and a second attempt
      // would only fail the same way while hiding the reason.
      Auth.call('listUsers', { token: Auth.token(), year: Settings.get('year') })
        .catch(function (e) {
          const m = String((e && e.message) || '');
          if (m === 'bad-token' || m === 'blocked' || m === 'pending') throw e;
          // A108: say so. A silent fallback means "the panel opened" and "the
          // panel opened WITHOUT the money" look identical — and which of the
          // two happened is exactly the fact that says whether the failure
          // behind A107 is still there.
          admMoneyFailed = true;
          return Auth.call('listUsers', { token: Auth.token() });
        }),
      Auth.call('listSubjects', { token: Auth.token() }).catch(function () { return { subjects: [] }; }),
      Auth.call('listItems', { token: Auth.token() }).catch(function () { return { items: [] }; }),
    ]).then(function (res) { admCache = res; paintAdmin(res); })
      .catch(function (e) {
        // A129b: a failed REFRESH must not eat a panel we already have. With
        // the header 🔄 on every screen an offline tap here is now easy, and
        // this catch used to replace the whole panel with an error card while
        // admCache still held everything it had just been showing. Repaint the
        // cache and say why it is not fresher. bad-token/blocked still fall
        // through to the error card: that session is gone, and painting a
        // panel that can only fail on every next tap would lie about it.
        const m = String((e && e.message) || '');
        if (admCache && m !== 'bad-token' && m !== 'blocked' && m !== 'pending') {
          paintAdmin(admCache); toast(errMsg(e)); return;
        }
        $view().innerHTML = backBar('settings') + '<div class="empty">' + esc(errMsg(e)) + '</div>';
      });
  }
  function paintAdmin(res) {
    {
      const resp = res[0], subjects = res[1].subjects || [], items = res[2].items || [];
      const areas = items.filter(function (i) { return i.kind === 'area'; });
      const locations = items.filter(function (i) { return i.kind === 'location'; });
      const positions = items.filter(function (i) { return i.kind === 'position'; });
      const year = String(Settings.get('year'));
      // A78: four groups, not three. 'exiting' is an APPROVED person the
      // committee has stood down — their login still works so they can hand in
      // what they hold. Left inside `approved` they would read as an ordinary
      // member with no permissions, which is exactly what a newly-approved
      // person also looks like: the two states must not share a shelf.
      const groups = { pending: [], approved: [], exiting: [], blocked: [] };
      resp.users.forEach(function (u) {
        if (u.status === 'approved' && u.access === 'exiting') groups.exiting.push(u);
        else (groups[u.status] || groups.blocked).push(u);
      });
      function userButtons(u) {
        const hasYear = u.years.split(',').indexOf(year) >= 0;
        let btns = '';
        if (u.status === 'pending') {
          btns = '<button class="chip" data-act="approve" data-id="' + u.id + '">' + esc(t('approve')) + '</button>';
        } else if (u.status === 'approved') {
          if (!hasYear) btns += '<button class="chip" data-act="year" data-id="' + u.id + '">' + esc(t('give_year_access')) + '</button>';
          // A78: 💰 and 👑 are hidden while somebody is standing down. Both hand
          // back more than the access-block took — the cashier flag reaches
          // confirmHandover, which is not a push and never sees the block — so
          // the server refuses them; a chip the server refuses is worse than no
          // chip. Bringing the person back is the way, and it is right below.
          if (u.access !== 'exiting') {
            btns += '<button class="chip" data-act="cashier" data-id="' + u.id + '" data-v="' + (u.cashier ? 0 : 1) + '">' +
                    esc(u.cashier ? t('remove_cashier') : t('make_cashier')) + '</button>' +
                    '<button class="chip" data-act="role" data-id="' + u.id + '" data-v="' + (u.role === 'admin' ? 'user' : 'admin') + '">' +
                    esc(u.role === 'admin' ? t('remove_admin') : t('make_admin')) + '</button>';
          }
          btns += '<button class="chip" data-act="editinfo" data-id="' + u.id + '" data-u="' + esc(u.username) + '">✏️ ' + esc(t('profile_btn')) + '</button>' +
                  '<button class="chip" data-act="reset" data-id="' + u.id + '">' + esc(t('reset_pw')) + '</button>' +
                  '<button class="chip" data-act="release" data-id="' + u.id + '">' + esc(t('release_session')) + '</button>' +
                  (u.role === 'admin' ? '' : '<button class="chip" data-act="block" data-id="' + u.id + '">' + esc(t('block')) + '</button>');
        } else {
          btns = '<button class="chip" data-act="unblock" data-id="' + u.id + '">' + esc(t('unblock')) + '</button>';
        }
        // A78: the committee's door, kept apart from the security one above.
        // Standing somebody down is offered only for an ordinary approved
        // member — an admin bypasses every gate, so the server refuses it and
        // the button would be a lie. Coming back needs a post, so it is a
        // screen, not a chip.
        if (u.status === 'approved' && u.role !== 'admin') {
          btns += u.access === 'exiting'
            ? '<button class="chip" data-act="restore" data-id="' + u.id + '">' + esc(t('access_restore')) + '</button>'
            : '<button class="chip" data-act="exit" data-id="' + u.id + '">' + esc(t('access_exit')) + '</button>';
        }
        // A99: the account picture, for anyone who could be holding something.
        //
        // It used to be offered only to the stood-down and the blocked, on the
        // reasoning that they are the ones with a saved snapshot. But the
        // server never needed one: userSnapshot computes `live` from today's
        // book for ANY user and only ADDS the saved figures when they exist.
        // So the nine people actually walking around with the committee's cash
        // were the nine the admin could not ask about — no collected, no
        // in-hand, no dues, anywhere in this panel. The data was there and the
        // door was locked.
        //
        // Not offered to `pending`: no year approval means no entries, so the
        // picture would be four zeroes and a button that teaches nothing.
        if (u.status === 'approved' || u.status === 'blocked')
          btns += '<button class="chip" data-act="snap" data-id="' + u.id + '">' + esc(t('access_picture')) + '</button>';
        return btns;
      }
      // One line that says what this person actually has, so the list can be
      // read without opening anybody.
      function userSummary(u) {
        if (u.status !== 'approved') return '@' + u.username;
        // A78: said in words, not left to be inferred from an empty chip row —
        // "nothing granted yet" and "everything taken away" are the same
        // emptiness and mean opposite things.
        if (u.access === 'exiting') return t('access_exiting_sum');
        if (u.role === 'admin') return t('sum_admin_all');
        const ent = String(u.entries || '').split(',').filter(Boolean);
        // A100: `type_` and not CAT_LABEL_KEYS. This is a one-line SUMMARY on a
        // 375px row, and CAT_LABEL_KEYS spells the daily ones out in full —
        // "রোড কালেকশন, টোটো কালেকশন" wrapped eight of twelve rows onto a
        // second line, 86px instead of 63px each. The same categories already
        // have short names the app uses everywhere else: রোড · টোটো · বাস. The
        // permission CHIPS keep the long form, where there is room and the
        // wording has to be unambiguous.
        const entTxt = !ent.length ? '⚠️ ' + t('sum_none')
          : ent.filter(function (k) { return Aggregate.ENTRY_KINDS.indexOf(k) >= 0; })
               .map(function (k) { return t('type_' + k); }).join(', ') || '⚠️ ' + t('sum_none');
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
      // Which committee post this person holds. One dropdown replaces ~16
      // checkboxes: the post carries the set, so everybody in it moves together
      // when the post's permissions change.
      function postSelect(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        const held = {};
        (resp.users || []).forEach(function (x) {
          // A115: `x.role === 'admin'` used to be in this test, and the server
          // never had it. applyPosition_ counts EVERY row holding the post, so
          // an admin sitting in কোষাধ্যক্ষ made this dropdown say "0/1, free"
          // and the save answer `position-full:hrishi` — a screen and a server
          // disagreeing about the same number. The server is right: a slot
          // taken is taken, whoever is in it.
          if (x.id === u.id || !x.position) return;
          held[x.position] = (held[x.position] || 0) + 1;
        });
        return '<div class="perm-grp"><div class="perm-head">🎖️ ' + esc(t('user_post')) + '</div>' +
          '<div class="field" style="margin:6px 0 0"><select data-pos-user="' + esc(u.id) + '">' +
          '<option value="">— ' + esc(t('member_no_post')) + ' —</option>' +
          positions.map(function (p) {
            const cap = Number(p.maxCount) || 0, n = held[p.id] || 0, full = cap > 0 && n >= cap;
            return '<option value="' + esc(p.id) + '"' + (p.id === admDraft.position ? ' selected' : '') +
              (full && p.id !== u.position ? ' disabled' : '') + '>' +
              esc(Lists.labelOf('position', p.id) + (cap > 0 ? ' (' + n + '/' + cap + ')' : '') +
                  (full && p.id !== u.position ? ' — ' + t('pos_is_full') : '')) + '</option>';
          }).join('') + '</select></div>' +
          (positions.length ? '' : '<div class="perm-note">' + esc(t('pos_none_server')) + '</div>') +
          '</div>';
      }
      // Permissions now arrive from two places, so the chips must say WHICH.
      // A chip the post grants is shown on and locked: letting it be switched
      // off would do nothing — the post hands it straight back — and a control
      // that visibly ignores you is worse than no control.
      function entriesChips(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        const own = admDraft.entries;
        const post = Lists.permsOf(admDraft.position || '');
        const eff = String(u.entries || '').split(',').filter(Boolean);
        const kinds = [['shop', t('new_shop')], ['person', t('new_person')], ['member', t('new_member')],
                       ['bus', t('daily_bus')], ['road', t('daily_road')], ['toto', t('daily_toto')],
                       ['review', t('review_title')], ['otherdonor', t('perm_otherdonor')],
                       ['memberadmin', t('perm_memberadmin')]];
        let nPost = 0;
        const chips = kinds.map(function (k) {
          const fromPost = post.indexOf(k[0]) >= 0;
          if (fromPost) nPost++;
          const on = fromPost || own.indexOf(k[0]) >= 0;
          return '<button class="chip' + (on ? ' on' : '') + (fromPost ? ' from-post' : '') + '" data-ent-user="' + u.id +
            '" data-ent-id="' + k[0] + '"' + (fromPost ? ' disabled title="' + esc(t('from_post')) + '"' : '') + '>' +
            (fromPost ? '🎖️ ' : '') + esc(k[1]) + '</button>';
        }).join('');
        // A72: the tooltip was the ONLY explanation, and a phone never shows a
        // title tooltip — the same mistake as the sync badge (audit #2 U4).
        //
        // The consequence found in the field: Hrishi pressed 🧹, every personal
        // grant really was cleared on the server, and this screen still showed
        // ticked chips — because they now come from the POST. Correct, and
        // indistinguishable from "the clear did not work". A screen headed "give
        // this person permissions" that shows permissions it did not give has to
        // say so in words, on the screen, not on hover.
        const note = nPost
          ? t('perm_from_post_n').replace('{n}', String(nPost))
              .replace('{post}', Lists.labelOf('position', admDraft.position || '')) + '  ' + t('perms_common')
          : t('perms_common');
        return permGroup(u, 'entry_perms', 'ent', chips, note, false, !eff.length);
      }
      // which master areas a collector is responsible for (drives area reports)
      function areaChips(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        const mine = admDraft.areas;
        const chips = areas.length ? areas.map(function (a) {
          const on = mine.indexOf(a.id) >= 0;
          return '<button class="chip' + (on ? ' on' : '') + '" data-area-user="' + u.id + '" data-area-id="' + esc(a.id) + '">' +
            esc(Settings.get('lang') === 'en' ? (a.nameEn || a.nameBn) : (a.nameBn || a.nameEn)) + '</button>';
        }).join('') : '<span class="row-sub">' + esc(t('no_areas_yet')) + '</span>';
        return permGroup(u, 'assign_areas', 'area', chips, '', false);
      }
      function reportChips(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        const own = admDraft.reports;
        const post = Lists.permsOf(admDraft.position || '');
        let nPost = 0;
        const chips = REPORT_IDS.map(function (rid) {
          const autoCashier = (rid === 'inhand' && u.cashier);
          const fromPost = post.indexOf(rid) >= 0;
          if (fromPost) nPost++;
          const on = autoCashier || fromPost || own.indexOf(rid) >= 0;
          const lock = autoCashier || fromPost;
          return '<button class="chip' + (on ? ' on' : '') + (lock ? ' from-post' : '') + '" data-rep-user="' + u.id +
            '" data-rep-id="' + rid + '"' + (lock ? ' disabled title="' + esc(fromPost ? t('from_post') : 'auto') + '"' : '') + '>' +
            (fromPost ? '🎖️ ' : '') + esc(t('report_' + rid)) + '</button>';
        }).join('');
        // A72: same as entriesChips — the reason a chip is ticked has to be on
        // the screen. Two reasons here, not one, and they are different: the
        // post grants it, or the cashier flag drags 'inhand' along.
        const bits = [];
        if (nPost) bits.push(t('perm_from_post_n').replace('{n}', String(nPost))
                              .replace('{post}', Lists.labelOf('position', admDraft.position || '')));
        if (u.cashier) bits.push(t('inhand_auto_cashier'));
        return permGroup(u, 'report_perms', 'rep', chips, bits.join('  '), false);
      }
      // The answer to "why can he do that?", in one line, in the order a person
      // would ask it: what the post gives, what was added on top, what he ends
      // up with. Without this the two sources are invisible and unarguable.
      function effLine(u) {
        if (u.status !== 'approved' || u.role === 'admin') return '';
        // previews the DRAFT, so "✅ শেষমেশ" answers what SAVE would produce
        const post = Lists.permsOf(admDraft.position || '');
        const own = admDraft.entries.concat(admDraft.reports)
          .concat(Number(u.ownCashier) === 1 ? ['cashier'] : []);
        const name = function (k) {
          return k === 'cashier' ? t('cashier')
            : REPORT_IDS.indexOf(k) >= 0 ? t('report_' + k)
            : t(CAT_LABEL_KEYS[k] || ('perm_' + k)) || k;
        };
        const line = function (icon, key, list) {
          return '<div class="bd-line" style="display:block">' + icon + ' ' + esc(t(key)) + ': ' +
            esc(list.length ? list.map(name).join(' · ') : t('sum_none')) + '</div>';
        };
        const uniq = {}, eff = [];
        post.concat(own).forEach(function (k) { if (k && !uniq[k]) { uniq[k] = 1; eff.push(k); } });
        return '<div class="perm-grp">' + line('🎖️', 'eff_from_post', post) +
          line('➕', 'eff_extra', own.filter(function (k) { return post.indexOf(k) < 0; })) +
          line('✅', 'eff_final', eff) + '</div>';
      }
      function section(key, list) {
        return '<div class="section">' + esc(t(key)) + ' (' + list.length + ')</div>' +
          (list.length ? list.map(userCard).join('') : '<div class="empty">' + esc(t('none_here')) + '</div>');
      }
      const subjectsCard = '<div class="card"><div class="card-title">' + esc(t('manage_subjects')) + '</div>' +
        '<div class="input-row"><input id="subj-input" placeholder="' + esc(t('add_subject_ph')) + '" autocomplete="off">' +
        '<button id="subj-add" class="primary">' + esc(t('add_btn')) + '</button></div>' +
        // A152: which ভাঁড়ার the new subject belongs to. Only offered once the
        // programme is running — otherwise it is a choice with one answer.
        // "দুটোতেই" is the default and what every existing subject already is.
        (programOn() ? '<div class="chips" id="subj-sector">' +
          [['', 'sector_both'], ['puja', 'sector_puja'], ['program', 'sector_program']].map(function (o, i) {
            return '<button class="chip' + (i === 0 ? ' on' : '') + '" data-subj-sec="' + o[0] + '">' +
              esc(t(o[1])) + '</button>';
          }).join('') + '</div>' : '') +
        // A101: the same search every other list on this screen has had since
        // A41, and the only one that was missing it — on the list most likely
        // to grow, because a season adds an expense subject every time somebody
        // spends on something new. Appears at 8 items, like the others.
        admFilterBox('adm-f-subject', subjects.length) +
        (subjects.length ? subjects.map(function (s) {
          return '<div class="row li-row-subject" data-q="' + esc(s.name) +
            '" style="cursor:default"><div><b>' + esc(s.name) + '</b>' +
            (s.sector ? '<div class="row-sub">' + esc(t('sector_' + s.sector)) + '</div>' : '') +
            '</div><div class="chips" style="margin:0">' +
            '<button class="chip" data-subj-edit="' + esc(s.id) + '">' + esc(t('edit_btn')) + '</button>' +
            '<button class="chip" data-subj-del="' + esc(s.id) + '">' + esc(t('del_btn')) + '</button></div></div>';
        }).join('') : '<div class="empty">' + esc(t('no_subjects')) + '</div>') + '</div>';
      // bilingual master-list manager (areas, person locations)
      function listMgmtCard(kind, titleKey, list) {
        return '<div class="card"><div class="card-title">' + esc(t(titleKey)) + '</div>' +
          '<div class="input-row"><input id="li-bn-' + kind + '" placeholder="' + esc(t('name_bn')) + '" autocomplete="off">' +
          '<input id="li-en-' + kind + '" placeholder="' + esc(t('name_en')) + '" autocomplete="off">' +
          '<button class="primary" data-li-add="' + kind + '">' + esc(t('add_btn')) + '</button></div>' +
          admFilterBox('adm-f-' + kind, list.length) +
          (list.length ? list.map(function (it) {
            return '<div class="row li-row-' + kind + '" data-q="' + esc(it.nameBn + ' ' + it.nameEn) +
              '" style="cursor:default"><div><b>' + esc(it.nameBn) + '</b>' +
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
      // ── five screens, one at a time ─────────────────────────────────────
      // A78c: the wipe spares Users on purpose, so a 🚪 বিদায়ী set during
      // practice walks straight into the live season — no post, no permissions,
      // login open. Nobody would remember why, and that collector's first sign
      // of it is being unable to work. Clearing it automatically would be worse:
      // it is a decision about a person, like role or post, and a wipe must not
      // reverse those. So it is NAMED here, where the decision to go live is
      // being made, and left to the admin.
      const stillOut = resp.users.filter(function (u) { return u.access === 'exiting'; });
      const trainCard = isLive() ? '' :
        '<div class="card" style="border:1.5px solid #d9a441;background:#fff8e8">' +
          '<b>🟡 ' + esc(t('training_mode')) + '</b><div class="row-sub">' + esc(t('training_admin_hint')) + '</div>' +
          (stillOut.length ? '<div class="perm-note" style="margin-top:8px">🚪 ' +
            esc(t('golive_still_exiting')
              .replace('{n}', toBengaliDigits(String(stillOut.length)))
              .replace('{names}', stillOut.map(function (u) { return u.name; }).join(', '))) +
            '</div>' : '') +
          '<button id="golive-btn" class="primary big block" style="margin-top:8px">🚀 ' + esc(t('golive_btn')) + '</button>' +
          '<button id="clear-tr-btn" class="ghost block" style="margin-top:6px">🧹 ' + esc(t('clear_training_btn')) + '</button>' +
          '<div class="row-sub" style="margin-top:6px">' + esc(t('clear_training_hint')) + '</div></div>';
      const menuRow = function (sec, icon, titleKey, sub, badge) {
        return '<button class="row" data-adm-go="' + sec + '" style="width:100%;text-align:left">' +
          '<div style="flex:1"><b>' + icon + ' ' + esc(t(titleKey)) + '</b>' +
          (badge ? ' <span class="badge warn">' + badge + '</span>' : '') +
          '<div class="row-sub">' + esc(sub) + '</div></div><span class="adm-caret">›</span></button>';
      };
      const staleN = resp.users.filter(function (u) {
        return u.status === 'approved' && u.appVersion && u.appVersion !== Auth.APP_VERSION;
      }).length;
      const head = function (titleKey, back) {
        return backBar(back || 'settings') + '<div class="flow-title">' + esc(t(titleKey)) + '</div>';
      };
      const verLine = function (u) {
        return u.appVersion
          ? (u.appVersion === Auth.APP_VERSION ? '✅ ' : '⚠️ ') + u.appVersion +
            (u.appVersion === Auth.APP_VERSION ? '' : ' — ' + t('ver_stale_short'))
          : '❔ ' + t('ver_unknown');
      };
      // A99: the same fact, one line shorter, for the LIST. verLine spends a
      // whole row-sub on it, and measured on this screen 11 of 12 rows read
      // "❔ version জানা নেই" — which is what every row says until its owner has
      // opened the app, so on the morning the links go out it is 12 identical
      // lines pushing the real data down. Up-to-date says nothing at all,
      // because that is the state you are not looking for; the two states you
      // ARE looking for keep a mark.
      const verMark = function (u) {
        if (!u.appVersion) return ' <span class="ver-mark" title="' + esc(t('ver_unknown')) + '">❔</span>';
        if (u.appVersion === Auth.APP_VERSION) return '';
        return ' <span class="ver-mark warn">⚠️ ' + esc(t('ver_stale_short')) + '</span>';
      };

      if (!admSection) {
        // A129: the panel's own 🔄 button is gone — sitting directly under the
        // training card it read as a STEP of go-live ("refresh after live"),
        // and its whole job is now done by the header 🔄 on every screen.
        $view().innerHTML = head('admin_panel') + trainCard +
          menuRow('users', '👥', 'adm_users',
            t('adm_sub_users').replace('{n}', groups.approved.length)
              .replace('{p}', groups.pending.length).replace('{s}', staleN),
            groups.pending.length || '') +
          (admMoneyFailed ? '<div class="perm-note">' + esc(t('adm_money_off')) + '</div>' : '') +
          menuRow('positions', '🎖️', 'list_position',
            t('adm_sub_positions').replace('{n}', positions.length), '') +
          menuRow('lists', '🧾', 'adm_lists', t('adm_sub_lists'), '') +
          menuRow('data', '🗂️', 'adm_data', t('adm_sub_data'), '');
      } else if (admSection === 'users' && !admUserId) {
        const row = function (u) {
          return '<button class="row" data-adm-user="' + esc(u.id) + '" data-q="' +
            esc([u.name, u.username, u.phone].filter(Boolean).join(' ')) + '" style="width:100%;text-align:left">' +
            '<div style="flex:1"><b>' + esc(u.name) + '</b>' +
            (u.role === 'admin' ? ' 👑' : '') + (u.cashier ? ' 💰' : '') +
            (u.access === 'exiting' ? ' 🚪' : '') + verMark(u) +
            '<div class="row-sub">' + esc(userSummary(u)) + '</div>' +
            '</div>' +
            // A100: the figure an admin is actually chasing. Not shown for
            // `pending` — no year approval means no entries, so "₹0 হাতে"
            // there would be a fact about nothing.
            //
            // The ⏳ is one character doing the job A99 needed a whole sub-line
            // for on the detail screen: some of this sum has been sent and no
            // cashier has answered for it, and it is still counted here. A list
            // that hides that sends somebody looking for cash in the wrong
            // pocket.
            (u.money && u.status !== 'pending'
              ? '<div class="row-right"' + (Number(u.money.inHand) > HIGH_INHAND
                    ? ' style="color:var(--red)"' : '') + '>' + esc(fmtMoney(u.money.inHand)) +
                  (Number(u.money.pending) ? ' <span class="row-sub">⏳</span>' : '') +
                  '<div class="row-sub">' + esc(t('access_inhand')) + '</div></div>'
              : '') +
            '<span class="adm-caret">›</span></button>';
        };
        const grp = function (key, list) {
          return '<div class="section">' + esc(t(key)) + ' (' + list.length + ')</div>' +
            (list.length ? list.map(row).join('') : '<div class="empty">' + esc(t('none_here')) + '</div>');
        };
        $view().innerHTML = head('adm_users', 'admin') +
          admFilterBox('adm-fu', resp.users.length) +
          '<div id="adm-fu-none" class="empty" style="display:none">' + esc(t('adm_filter_none')) + '</div>' +
          grp('pending_users', groups.pending) +
          grp('approved_users', groups.approved) +
          grp('exiting_users', groups.exiting) +
          grp('blocked_users', groups.blocked);
      } else if (admSection === 'users') {
        const u = resp.users.filter(function (x) { return x.id === admUserId; })[0];
        if (!u) { admSection = 'users'; admUserId = ''; paintAdmin(res); return; }
        // Seeded from the EXTRAS — never the merged view, or a chip the post
        // grants would be written into this person's own grants and outlive
        // their time in the post.
        if (!admDraft) admDraft = {
          position: String(u.position || ''),
          entries: String(u.ownEntries || '').split(',').filter(Boolean),
          reports: String(u.ownReports || '').split(',').filter(Boolean),
          areas: String(u.areas || '').split(',').filter(Boolean),
        };
        $view().innerHTML = backBar('admin') +
          '<div class="card"><div class="card-title">' + esc(u.name) +
            (u.role === 'admin' ? ' 👑' : '') + (u.cashier ? ' 💰' : '') + '</div>' +
            '<div class="row-sub">@' + esc(u.username) + (u.phone ? ' • 📞 ' + esc(u.phone) : '') +
            ' • ' + esc(u.years || '—') + '</div>' +
            '<div class="row-sub">' + esc(verLine(u)) + '</div></div>' +
          // A78: a stood-down member gets the explanation instead of the chips.
          // Leaving the chips would invite the admin to tick one, save it, and
          // watch the server refuse every entry anyway — the permission is
          // real, the access-block sits above it.
          (u.access === 'exiting'
            ? '<div class="perm-note">🚪 ' + esc(t('access_exit_note')) + '</div>'
            : u.status === 'approved'
            ? postSelect(u) + entriesChips(u) + reportChips(u) + areaChips(u) + effLine(u) +
              '<button id="adm-save" class="primary big block">💾 ' + esc(t('save')) + '</button>' +
              '<div id="adm-dirty" class="hint" style="text-align:center"></div>'
            : '') +
          '<div class="section">' + esc(t('adm_other_actions')) + '</div>' +
          '<div class="chips">' + userButtons(u) + '</div>';
      } else if (admSection === 'positions' && !admPosId) {
        $view().innerHTML = head('list_position', 'admin') +
          '<div class="hint" style="margin-bottom:8px">' + esc(t('pos_admin_hint')) + '</div>' +
          '<div class="input-row"><input id="li-bn-position" placeholder="' + esc(t('name_bn')) + '" autocomplete="off">' +
          '<input id="li-en-position" placeholder="' + esc(t('name_en')) + '" autocomplete="off">' +
          '<button class="primary" data-li-add="position">' + esc(t('add_btn')) + '</button></div>' +
          (positions.length ? positions.map(function (it) {
            const set = String(it.perms || '').split(',').filter(Boolean);
            const cap = Number(it.maxCount) || 0;
            return '<button class="row" data-adm-pos="' + esc(it.id) + '" data-q="' +
              esc(it.nameBn + ' ' + it.nameEn) + '" style="width:100%;text-align:left">' +
              '<div style="flex:1"><b>' + esc(it.nameBn) + '</b>' +
              '<div class="row-sub">' + esc(it.nameEn) + ' · ' +
                esc(cap > 0 ? t('pos_max_n').replace('{n}', cap) : t('pos_max_any')) + ' · ' +
                esc(set.length ? t('pos_perm_n').replace('{n}', set.length) : t('pos_perm_none')) +
              '</div>' +
              // A115: said HERE, on the list, not only inside the post — a
              // feature that quietly does nothing is indistinguishable from a
              // broken one, and levels are deliberately not seeded (A101).
              (Number(it.level) || 0
                ? '<div class="row-sub">🪜 ' + esc(t('pos_level_n').replace('{n}', Number(it.level))) + '</div>'
                : '<div class="row-sub" style="color:#c0392b">⚠️ ' + esc(t('pos_level_none_short')) + '</div>') +
              '</div><span class="adm-caret">›</span></button>';
          }).join('') : '<div class="empty">' + esc(t('pos_none_server')) + '</div>');
      } else if (admSection === 'positions') {
        const it = positions.filter(function (x) { return x.id === admPosId; })[0];
        if (!it) { admPosId = ''; paintAdmin(res); return; }
        if (!admPosDraft) admPosDraft = {
          max: Number(it.maxCount) || 0,
          level: Number(it.level) || 0,
          perms: String(it.perms || '').split(',').filter(Boolean),
        };
        const groups = [
          ['entry_perms', [['shop', t('new_shop')], ['person', t('new_person')], ['member', t('new_member')],
                           ['bus', t('daily_bus')], ['road', t('daily_road')], ['toto', t('daily_toto')],
                           ['review', t('review_title')], ['otherdonor', t('perm_otherdonor')],
                           ['memberadmin', t('perm_memberadmin')]]],
          ['report_perms', Aggregate.REPORT_IDS.map(function (r) { return [r, t('report_' + r)]; })],
          // Money power, kept visible but marked: a wrong tick here lets somebody
          // confirm money they never received.
          ['perm_money', [['cashier', '⚠️ ' + t('cashier')]]],
        ];
        $view().innerHTML = backBar('admin') +
          '<div class="card"><div class="card-title">🎖️ ' + esc(it.nameBn) + '</div>' +
            '<div class="row-sub">' + esc(it.nameEn) + '</div>' +
            '<div class="chips" style="margin-top:8px">' +
              '<button class="chip" data-li-edit="' + esc(it.id) + '">' + esc(t('edit_btn')) + '</button>' +
              '<button class="chip" data-li-del="' + esc(it.id) + '">' + esc(t('del_btn')) + '</button>' +
            '</div></div>' +
          '<div class="field"><label>🔢 ' + esc(t('pos_max_label')) + '</label>' +
            '<input id="pos-max" type="number" min="0" inputmode="numeric" value="' + admPosDraft.max + '">' +
            '<div class="row-sub" style="margin-top:4px">' + esc(t('pos_max_zero')) + '</div></div>' +
          // A115: the rank. Bigger = more senior; several posts may share a
          // number and nothing here objects — joint secretaries are peers. What
          // it costs them is that peers cannot appoint each other, which is the
          // rule stated plainly under the box rather than discovered later.
          '<div class="field"><label>🪜 ' + esc(t('pos_level_label')) + '</label>' +
            '<input id="pos-level" type="number" min="0" inputmode="numeric" value="' + admPosDraft.level + '">' +
            '<div class="row-sub" style="margin-top:4px">' + esc(t('pos_level_hint')) + '</div>' +
            (admPosDraft.level ? '' :
              '<div class="perm-warn" style="display:block;margin-top:6px">' + esc(t('pos_level_none')) + '</div>') +
            (admPosDraft.perms.indexOf('cashier') >= 0 ?
              '<div class="perm-note">' + esc(t('pos_level_cashier')) + '</div>' : '') +
          '</div>' +
          groups.map(function (g) {
            return '<div class="perm-grp"><div class="perm-head">' + esc(t(g[0])) + '</div>' +
              '<div class="chips" style="margin:4px 0 0">' + g[1].map(function (k) {
                return '<button class="chip' + (admPosDraft.perms.indexOf(k[0]) >= 0 ? ' on' : '') +
                  '" data-pp-key="' + esc(k[0]) + '">' + esc(k[1]) + '</button>';
              }).join('') + '</div></div>';
          }).join('') +
          '<div class="perm-note">' + esc(t('pos_no_admin')) + '</div>' +
          '<button id="adm-pos-save" class="primary big block">💾 ' + esc(t('save')) + '</button>' +
          '<div id="adm-pos-dirty" class="hint" style="text-align:center"></div>';
      } else if (admSection === 'lists') {
        $view().innerHTML = head('adm_lists', 'admin') +
          '<button id="receipt-btn" class="ghost big block">' + esc(t('receipt_design_btn')) + '</button>' +
          subjectsCard +
          listMgmtCard('area', 'manage_areas', areas) +
          listMgmtCard('location', 'manage_locations', locations);
      } else {
        $view().innerHTML = head('adm_data', 'admin') +
          '<div class="row" style="cursor:default;flex-wrap:wrap"><div style="flex:1 1 60%"><b>💬 ' +
            esc(t('nav_messages')) + '</b><div class="row-sub" id="chat-load-line">—</div></div>' +
            '<button class="chip" id="chat-toggle">' +
              esc(chatOn() ? t('chat_stop_btn') : t('chat_restart_btn')) + '</button></div>' +
          // A148: the অনুষ্ঠান ভাঁড়ার. OFF by default, and that default matters —
          // while it is off nobody is asked "কোন ভাঁড়ার?" on any entry, which
          // would be a tap taken from twelve phones for a question with one
          // possible answer.
          '<div class="row" style="cursor:default;flex-wrap:wrap"><div style="flex:1 1 60%"><b>🎭 ' +
            esc(t('program_fund')) + '</b><div class="row-sub">' + esc(t('program_fund_sub')) + '</div></div>' +
            '<button class="chip" id="program-toggle">' +
              esc(programOn() ? t('program_on_btn') : t('program_off_btn')) + '</button></div>' +
          // A79: set once at the start of the season, read every evening.
          '<button id="target-btn" class="ghost big block">🎯 ' + esc(t('target_btn')) + ' — ' +
            esc(Number(centralConfig.target_amount) ? fmtMoney(Number(centralConfig.target_amount)) : t('target_none')) +
          '</button>' +
          // A110: the emergency stop. Above the audit log because in the moment
          // you need it you are not scrolling — and NOT down in the ⚠️ danger
          // block with 🧹, because unlike those this one is meant to be used and
          // undone, not feared.
          '<button id="freeze-btn" class="ghost big block"' +
            (freezeOn() ? ' style="background:#c0392b;color:#fff;border-color:#7d2418"' : '') + '>' +
            esc(freezeOn() ? t('freeze_btn_off') : t('freeze_btn_on')) + '</button>' +
          '<button id="audit-btn" class="ghost big block">' + esc(t('audit_btn')) + '</button>' +
          '<button id="backup-btn" class="ghost big block">' + esc(t('backup_now_btn')) + '</button>' +
          '<button id="restore-btn" class="ghost big block">' + esc(t('restore_btn')) + '</button>' +
          '<button id="rollover-btn" class="ghost big block">' + esc(t('rollover_btn')) + '</button>' +
          // A38: one-way and destructive, so it belongs down here with restore
          // and rollover — not at the top of the users screen, one tap from the
          // daily approve job, which is where I put it this morning.
          '<div class="section">⚠️ ' + esc(t('adm_danger')) + '</div>' +
          '<button id="clear-grants" class="ghost block">🧹 ' + esc(t('clear_grants_btn')) + '</button>' +
          '<div class="hint">' + esc(t('clear_grants_hint')) + '</div>';
      }
      // All five screens live under one view id, so ← cannot work it out by
      // itself: tell it which screen is the parent, and let admGo run the
      // unsaved-changes check on the way out.
      // ── draft edits: instant, local, no network, only this screen repaints
      const toggle = function (list, k) {
        const i = list.indexOf(k); if (i >= 0) list.splice(i, 1); else list.push(k); };
      const redraw = function () { paintAdmin(res); };
      wireNav();
      // AFTER wireNav — it wires #back-bar generically and would overwrite this.
      // All five screens share one view id, so ← cannot work its parent out by
      // itself; admGo also runs the unsaved-changes check on the way out.
      const backTo = !admSection ? null
        : (admSection === 'users' && admUserId) ? 'users'
        : (admSection === 'positions' && admPosId) ? 'positions' : '';
      if (backTo !== null) {
        // backBar() defers its own wiring with setTimeout(...,0), queued while
        // the HTML string was being built — so a plain assignment here is
        // overwritten a tick later. Queue ours behind it: timers of equal delay
        // fire in the order they were set, and ours is set second.
        setTimeout(function () {
          const bb = document.getElementById('back-bar');
          if (bb) bb.onclick = function () { admGo(backTo); };
        }, 0);
      }
      document.querySelectorAll('[data-adm-go]').forEach(function (b) {
        b.onclick = function () { admGo(b.dataset.admGo); };
      });
      document.querySelectorAll('[data-adm-user]').forEach(function (b) {
        b.onclick = function () { admGo('users', b.dataset.admUser); };
      });
      admWireFilter('adm-fu', '[data-adm-user]');
      ['area', 'location', 'position', 'subject'].forEach(function (k) {
        admWireFilter('adm-f-' + k, '.li-row-' + k);
      });
      document.querySelectorAll('[data-adm-pos]').forEach(function (b) {
        b.onclick = function () {
          if (!admLeaveOk()) return;
          admPosId = b.dataset.admPos; admPosDraft = null;
          window.scrollTo(0, 0); paintAdmin(res);
        };
      });
      // the post's own chips, max box and save — all draft, no network per tap
      document.querySelectorAll('[data-pp-key]').forEach(function (b) {
        b.onclick = function () { toggle(admPosDraft.perms, b.dataset.ppKey); redraw(); };
      });
      const pmax = document.getElementById('pos-max');
      if (pmax) pmax.oninput = function () {
        admPosDraft.max = Math.max(0, Math.floor(Number(pmax.value) || 0));
        admStick(document.getElementById('adm-pos-save'),
                 document.getElementById('adm-pos-dirty'), admPosDirty());
      };
      const plevel = document.getElementById('pos-level');
      if (plevel) plevel.oninput = function () {
        admPosDraft.level = Math.max(0, Math.floor(Number(plevel.value) || 0));
        admStick(document.getElementById('adm-pos-save'),
                 document.getElementById('adm-pos-dirty'), admPosDirty());
      };
      const psave = document.getElementById('adm-pos-save');
      if (psave) {
        admStick(psave, document.getElementById('adm-pos-dirty'), admPosDirty());
        psave.onclick = admPosSave;
      }
      const saveBtn = document.getElementById('adm-save');
      if (saveBtn) {
        admStick(saveBtn, document.getElementById('adm-dirty'), admDirty());
        saveBtn.onclick = function () {
          admSave(resp.users.filter(function (x) { return x.id === admUserId; })[0]);
        };
      }
      const clearBtn = document.getElementById('clear-tr-btn');
      if (clearBtn) clearBtn.onclick = function () {
        if (isLive()) { toast(t('already_live')); return; }
        if (!window.confirm(t('clear_training_confirm1'))) return;
        const typed = window.prompt(t('clear_training_confirm2'));
        if (String(typed || '').trim().toUpperCase() !== 'CLEAR') { toast(t('golive_cancelled')); return; }
        const undoClear = busyBtn(clearBtn);
        Auth.call('clearTraining', { token: Auth.token(), confirm: 'CLEAR' })
          .then(function (r) {
            toast(t('clear_training_done') + (r && r.backup ? ' · ' + r.backup : ''));
            // A132b: do NOT DB.clearAll() here. The server bumped data_epoch,
            // so the forced pull's epoch branch wipes this device — and that
            // branch is the ONLY place that saves the 🪦 list and raises the
            // A92 alert first. Wiping by hand here destroyed the admin's own
            // unsynced entries with no list and no alert, on the one phone
            // guaranteed to be present for the reset. (🚀 goLive has always
            // taken this exact path.)
            return pullCentral({ force: true });
          })
          .then(function () { updateBadge(); navigate('home'); })
          .catch(function (e) { undoClear(); toast(errMsg(e)); });
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
        const btn = this, undo = busyBtn(btn);
        // A52: the admin already typed LIVE a few lines up; it used to be thrown
        // away, so the server had no confirmation at all. Send it.
        Auth.call('goLive', { token: Auth.token(), digits: digits, confirm: 'LIVE' }).then(function () {
          toast(t('golive_done'));
          pullCentral({ force: true }).then(function () { navigate('home'); }); // epoch bump wipes local training data
        }).catch(function (e) { undo(); toast(errMsg(e)); });
      };
      const progTog = document.getElementById('program-toggle');
      if (progTog) progTog.onclick = function () {
        const turningOn = String((centralConfig || {}).program_on || '') !== 'on';
        // Turning it OFF never hides money: programOn() stays true while
        // programme rows exist, so the fund's own report keeps working.
        const undoProg = busyBtn(progTog);
        Auth.call('setConfig', { token: Auth.token(), config: { program_on: turningOn ? 'on' : '' } })
          .then(function () {
            centralConfig.program_on = turningOn ? 'on' : '';
            toast(t('saved')); renderAdmin();
          })
          .catch(function (e) { undoProg(); toast(errMsg(e)); });
      };
      const chatTog = document.getElementById('chat-toggle');
      if (chatTog) chatTog.onclick = function () {
        const turningOff = chatOn();
        if (turningOff && !window.confirm(t('chat_stop_confirm'))) return;
        const undoTog = busyBtn(chatTog);
        Auth.call('setConfig', { token: Auth.token(), config: { chat_off: turningOff ? 'on' : '' } })
          .then(function () {
            centralConfig.chat_off = turningOff ? 'on' : '';
            toast(t(turningOff ? 'chat_stopped' : 'saved')); renderAdmin();
          })
          .catch(function (e) { undoTog(); toast(errMsg(e)); });
      };
      viewData().then(function (d2) {
        const l = Aggregate.chatLoad(d2), el = document.getElementById('chat-load-line');
        if (el) el.textContent = l.count + ' ' + t('chat_msgs') + ' · ' + Math.round(l.bytes / 1024) +
          ' KB · ' + t('chat_per_day') + ' ' + l.perDay +
          (l.level === 'ok' ? '' : (l.level === 'high' ? '  🔴' : '  🟠'));
      }).catch(function () {});
      // A79: parsed with the app's own number reader, so "দুই লাখ" and "200000"
      // both land — the same parser every amount field uses. An empty answer
      // clears the target rather than setting zero, and the bar disappears.
      admEl('target-btn').onclick = function () {
        const cur = Number(centralConfig.target_amount) || 0;
        const raw = window.prompt(t('target_prompt'), cur ? String(cur) : '');
        if (raw === null) return;
        const txt = String(raw).trim();
        // parseAmount returns NaN for anything it cannot read, so `> 0` is the
        // whole test — it rejects NaN, 0 and negatives in one comparison.
        const n = txt ? NumParse.parseAmount(txt) : 0;
        if (txt && !(n > 0)) { toast(t('target_bad')); return; }
        adminAction('setConfig', { key: 'target_amount', value: n ? String(n) : '' }, function () {
          centralConfig = Object.assign({}, centralConfig, { target_amount: n ? String(n) : '' });
          try { localStorage.setItem('ck_config', JSON.stringify(centralConfig)); } catch (e) {}
          toast(n ? '🎯 ' + fmtMoney(n) : t('target_cleared'));
        });
      };
      admEl('freeze-btn').onclick = function () { toggleFreeze(resp.users || []); };
      admEl('audit-btn').onclick = function () { navigate('audit'); };
      admEl('receipt-btn').onclick = function () { navigate('receiptcfg'); };
      // on-demand snapshot — the cheap insurance before anything one-way
      admEl('backup-btn').onclick = function () {
        const b = this, undo = busyBtn(b);
        Auth.call('backupNow', { token: Auth.token() })
          .then(function (r) { undo(); alert(t('backup_done').replace('{f}', r.file)); })
          .catch(function (e) { undo(); toast(errMsg(e)); });
      };
      // restore: pick a snapshot, then type RESTORE — the server takes a
      // safety backup of the CURRENT state first, so this is itself undoable
      admEl('restore-btn').onclick = function () {
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
              // A132b: no manual DB.clearAll — the reload's first pull sees the
              // bumped data_epoch and wipes THROUGH the epoch branch, which
              // saves the 🪦 list and raises the A92 alert first. The manual
              // wipe destroyed this admin's own unsynced entries silently.
              location.reload(); // re-pull the restored data
            }).catch(function (e) { toast(errMsg(e)); });
        }).catch(function (e) { toast(errMsg(e)); });
      };
      // A76 (audit #3 F2, extended by Hrishi): the button used to take `from`
      // straight from the admin's year setting and offer `from + 1`, with no
      // idea whether either year contained anything. Two ways that goes wrong,
      // and the second is the one Hrishi raised:
      //
      //   · In August 2027 the admin's year is already 2027, so it offered
      //     2027 → 2028 — while the donors nobody has carried across are still
      //     sitting in 2026. The required dance (set the year BACK, press, set
      //     it forward) was written down nowhere.
      //   · A brand-new committee with no data at all was offered a rollover
      //     too. It copies nothing and reports "০ জন দাতা যোগ হলো", which reads
      //     like something happened.
      //
      // The client cannot see other years — `viewData` is filtered to the
      // current one (A75) and the snapshot only ever holds one book. So rather
      // than guess, the button is driven by what it CAN see: the year being
      // read. If that year has no donors there is nothing to carry from, and it
      // says so instead of performing a no-op. If it has donors, `from` is that
      // year by construction, and the 2027 → 2028 trap cannot be reached — an
      // admin sitting on an empty 2027 is told 2027 is empty, which points at
      // the right move instead of quietly doing the wrong one.
      admEl('rollover-btn').onclick = function () {
        const from = Number(Settings.get('year')), to = from + 1;
        viewData().then(function (data) {
          const donors = liveParties(data).length;
          if (!donors) { alert(t('rollover_empty').replace('{from}', from)); return; }
          if (!window.confirm(t('rollover_confirm').replace('{from}', from)
                .replace('{to}', to).replace('{n}', donors))) return;
          Auth.call('rolloverYear', { token: Auth.token(), fromYear: from, toYear: to })
            .then(function (r) { alert(t('rollover_done').replace('{n}', r.count).replace('{to}', to)); })
            .catch(function (e) { toast(errMsg(e)); });
        }).catch(function (e) { toast(errMsg(e)); });
      };
      // A152: the fund chips are a one-of-three picker, like every other chip row
      document.querySelectorAll('[data-subj-sec]').forEach(function (b) {
        b.onclick = function () {
          document.querySelectorAll('[data-subj-sec]').forEach(function (o) { o.classList.remove('on'); });
          b.classList.add('on');
        };
      });
      admEl('subj-add').onclick = function () {
        const name = admEl('subj-input').value.trim();
        if (!name) return;
        const secBtn = document.querySelector('[data-subj-sec].on');
        admListAction('addSubject', { name: name, sector: secBtn ? secBtn.dataset.subjSec : '' });
      };
      admEl('subj-input').onkeydown = function (e) {
        if (e.key === 'Enter') admEl('subj-add').click();
      };
      document.querySelectorAll('[data-subj-del]').forEach(function (b) {
        b.onclick = function () {
          const id = b.dataset.subjDel;
          admListAction('removeSubject', { id: id }, function () {
            admCache[1] = { subjects: admSubjects().filter(function (x) { return x.id !== id; }) };
          });
        };
      });
      document.querySelectorAll('[data-subj-edit]').forEach(function (b) {
        b.onclick = function () {
          const s = subjects.find(function (x) { return x.id === b.dataset.subjEdit; }) || {};
          const nm = window.prompt(t('edit_item_title'), s.name || ''); if (nm === null) return;
          if (!nm.trim()) return;
          const id = b.dataset.subjEdit, nn = nm.trim();
          admListAction('editSubject', { id: id, name: nn }, function () {
            admSubjects().forEach(function (x) { if (x.id === id) x.name = nn; });
          });
        };
      });
      document.querySelectorAll('[data-li-add]').forEach(function (b) {
        b.onclick = function () {
          const kind = b.dataset.liAdd;
          const bn = document.getElementById('li-bn-' + kind).value.trim();
          const en = document.getElementById('li-en-' + kind).value.trim();
          if (!bn && !en) return;
          admListAction('addItem', { kind: kind, nameBn: bn, nameEn: en });
        };
      });
      document.querySelectorAll('[data-li-del]').forEach(function (b) {
        b.onclick = function () {
          const id = b.dataset.liDel;
          admListAction('removeItem', { id: id }, function () {
            admCache[2] = { items: admItems().filter(function (x) { return x.id !== id; }) };
            if (admPosId === id) { admPosId = ''; admPosDraft = null; }
          });
        };
      });
      document.querySelectorAll('[data-li-edit]').forEach(function (b) {
        b.onclick = function () {
          const it = items.find(function (x) { return x.id === b.dataset.liEdit; }) || {};
          const bn = window.prompt(t('name_bn'), it.nameBn || ''); if (bn === null) return;
          const en = window.prompt(t('name_en'), it.nameEn || ''); if (en === null) return;
          const id = b.dataset.liEdit, nb = bn.trim(), ne = en.trim();
          admListAction('editItem', { id: id, nameBn: nb, nameEn: ne }, function () {
            admItems().forEach(function (x) { if (x.id === id) { x.nameBn = nb || ne; x.nameEn = ne || nb; } });
          });
        };
      });
      // A48: RESTORED. This block was carried off by a blind index-to-index cut
      // in v4.9.9 while removing the dead positionCard — it sat between the two
      // markers. Approve · year · cashier · admin · reset · release · block ·
      // unblock all rendered and none of them did anything for two releases,
      // including 🔓 release session and 🚫 Block, which PROJECT_CONTEXT names
      // as the ONLY answer to a lost or stolen phone (sessions never expire by
      // design). Found by an external audit, not by me: I verified these buttons
      // on v4.9.7 and never re-verified them after restructuring the panel.
      document.querySelectorAll('[data-act]').forEach(function (b) {
        const id = b.dataset.id;
        b.onclick = function () {
          if (b.dataset.act === 'approve') adminAction('setStatus', { userId: id, status: 'approved', year: Settings.get('year') }, null, b);
          else if (b.dataset.act === 'year') adminAction('approveYear', { userId: id, year: Settings.get('year') }, null, b);
          else if (b.dataset.act === 'cashier') adminAction('setCashier', { userId: id, cashier: Number(b.dataset.v) }, null, b);
          else if (b.dataset.act === 'role') adminAction('setRole', { userId: id, role: b.dataset.v }, null, b);
          // A78: the security door now refuses while the person still holds
          // cash, and says how much. That refusal is not an error to shrug at —
          // it is the decision the committee has to make, so it is put to the
          // admin in the amount's own words, and the answer is recorded.
          else if (b.dataset.act === 'editinfo') navigate('profile', { username: b.dataset.u });
          else if (b.dataset.act === 'block') blockUser(id);
          else if (b.dataset.act === 'unblock') adminAction('setStatus', { userId: id, status: 'approved', year: Settings.get('year') }, null, b);
          else if (b.dataset.act === 'exit') exitUser(resp.users.filter(function (x) { return x.id === id; })[0]);
          else if (b.dataset.act === 'restore') restoreUser(resp.users.filter(function (x) { return x.id === id; })[0], positions);
          else if (b.dataset.act === 'snap') showSnapshot(resp.users.filter(function (x) { return x.id === id; })[0]);
          else if (b.dataset.act === 'reset') adminAction('resetPassword', { userId: id }, function (r) {
            alert(t('temp_pw_is') + ':\n\n' + r.tempPassword);
          }, b);
          else if (b.dataset.act === 'release') {
            if (window.confirm(t('release_confirm'))) adminAction('releaseSession', { userId: id }, function () { toast(t('release_done')); }, b);
          }
        };
      });
      // [সব দাও] / [সব নাও] — the chips still work one by one; this only saves
      // tapping seven reports for eleven people.
      document.querySelectorAll('[data-bulk]').forEach(function (b) {
        b.onclick = function () {
          const uid = b.dataset.bulkUser, on = b.dataset.bulkOn === '1';
          const u = resp.users.find(function (x) { return x.id === uid; });
          if (!u) return;
          if (b.dataset.bulk === 'ent') admDraft.entries = on ? Aggregate.PERM_KEYS.slice() : [];
          else if (b.dataset.bulk === 'rep') admDraft.reports = on ? REPORT_IDS.slice() : [];
          else admDraft.areas = on ? areas.map(function (a) { return a.id; }) : [];
          redraw();
        };
      });
      document.querySelectorAll('[data-rep-user]').forEach(function (b) {
        b.onclick = function () {
          if (b.disabled) return;
          const uid = b.dataset.repUser, rid = b.dataset.repId;
          const u = resp.users.find(function (x) { return x.id === uid; });
          // the EXTRAS, never the merged view — otherwise a toggle would try to
          // remove something the post keeps handing back
          toggle(admDraft.reports, rid); redraw();
        };
      });
      document.querySelectorAll('[data-area-user]').forEach(function (b) {
        b.onclick = function () {
          const uid = b.dataset.areaUser, aid = b.dataset.areaId;
          const u = resp.users.find(function (x) { return x.id === uid; });
          toggle(admDraft.areas, aid); redraw();
        };
      });
      // Wipe the PERSONAL extras so access comes from the post alone. This is
      // destructive and one-way, so it shows the consequence BEFORE it runs, by
      // name: anyone whose post grants nothing would be left unable to make a
      // single entry, and finding that out afterwards means ten collectors
      // locked out on a collection day.
      const cg = document.getElementById('clear-grants');
      if (cg) cg.onclick = function () {
        const victims = (resp.users || []).filter(function (u) {
          return u.status === 'approved' && u.role !== 'admin' &&
            (String(u.ownEntries || '') || String(u.ownReports || '') || Number(u.ownCashier) === 1);
        });
        if (!victims.length) { toast(t('clear_grants_none')); return; }
        const stranded = victims.filter(function (u) {
          return !Lists.permsOf(u.position || '').filter(function (k) {
            return Aggregate.PERM_KEYS.indexOf(k) >= 0;
          }).length;
        });
        let msg = t('clear_grants_confirm').replace('{n}', victims.length)
          .replace('{who}', victims.map(function (u) { return u.name; }).join(', '));
        if (stranded.length) {
          msg += '\n\n⚠️ ' + t('clear_grants_stranded')
            .replace('{n}', stranded.length)
            .replace('{who}', stranded.map(function (u) { return u.name; }).join(', '));
        }
        if (!window.confirm(msg)) return;
        if (String(window.prompt(t('clear_grants_type')) || '').trim().toUpperCase() !== 'CLEAR') {
          toast(t('golive_cancelled')); return;
        }
        Auth.call('clearUserGrants', { token: Auth.token(), confirm: 'CLEAR' })
          .then(function (r) {
            alert(t('clear_grants_done').replace('{n}', (r.cleared || []).length)
              .replace('{who}', (r.cleared || []).join(', ') || '—'));
            renderAdmin();
          }).catch(function (e) { toast(errMsg(e)); });
      };
      document.querySelectorAll('[data-pos-user]').forEach(function (sel) {
        sel.onchange = function () { admDraft.position = sel.value; redraw(); };
      });
      document.querySelectorAll('[data-ent-user]').forEach(function (b) {
        b.onclick = function () {
          const uid = b.dataset.entUser, kind = b.dataset.entId;
          const u = resp.users.find(function (x) { return x.id === uid; });
          // An empty field grants nothing, so a chip means exactly what it
          // shows and toggling is a plain add/remove — no "materialise all"
          // step, which is where the retired key names used to leak back in.
          toggle(admDraft.entries, kind); redraw();
        };
      });
    }
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
    // A108: the tab title was baked into index.html, so it stayed Bengali in an
    // English app and never picked up the committee's own puja name either.
    // pujaName() falls back to app_title when the committee has not set one,
    // and "চাঁদা খাতা — চাঁদা খাতা" is not a title
    try {
      const pn = pujaName();
      document.title = pn === t('app_title') ? pn : pn + ' — ' + t('app_title');
    } catch (e) {}
    updateTrainingBar(); // version bar / training strip + header title, every screen
    // A144: the curtain button belongs to the header, but whether it is offered
    // depends on WHO is logged in — and at DOMContentLoaded nobody is yet.
    // Painting it only there left it hidden for the whole session; found by
    // driving the screen, not by reading the code. Repaint on every render, the
    // same rhythm the title and the training bar already use.
    paintCurtain();
    document.querySelectorAll('#bottomnav button').forEach(function (b) {
      b.classList.toggle('on', b.dataset.nav === current.view);
      const k = b.dataset.nav;
      if (k === 'messages') b.hidden = !chatOn();
      // A153: the 🎭 tab appears only when there IS a programme and this person
      // is on it. A tab that leads to an empty book is a tab that teaches people
      // to ignore the row.
      if (k === 'program') b.hidden = !programTabOn();
      b.querySelector('span').textContent = t(k === 'list' ? 'khata'
        : k === 'messages' ? 'nav_messages' : k === 'program' ? 'nav_program' : k);
    });
    // A91: a logged-out phone showed all five tabs and the sync badge, and not
    // one of them did anything — tapping any of them left the login screen
    // exactly where it was. Five dead controls at the first moment somebody
    // meets the app, which is the failure this project keeps naming and had
    // never once looked for on THIS screen, because every check started by
    // injecting a session.
    const navBar = document.getElementById('bottomnav');
    const syncBadge = document.getElementById('sync-badge');
    if (navBar) navBar.hidden = !Auth.loggedIn();
    if (syncBadge) syncBadge.hidden = !Auth.loggedIn();
    if (!Auth.loggedIn()) { renderAuth(); updateBadge(); return; }
    startNotifPolling();
    const user = Auth.current();
    if (user && user.mustChange) { renderChangePw(true); updateBadge(); return; }
    if (flowState) { renderEntry(); return; }
    if (current.view === 'home') { renderHome(); syncDots(); }
    else if (current.view === 'list') renderList();
    else if (current.view === 'party') renderParty(current.params);
    else if (current.view === 'report') renderReport();
    else if (current.view === 'settings') renderSettings();
    else if (current.view === 'admin') { Auth.isAdmin() ? renderAdmin() : renderHome(); }
    else if (current.view === 'cashier') renderCashier();
    else if (current.view === 'hbook') renderHandoverBook();
    else if (current.view === 'messages') { chatOn() ? renderMessages() : renderHome(); }
    else if (current.view === 'entries') renderMyEntries();
    else if (current.view === 'anomalies') renderAnomalies();
    else if (current.view === 'memberpay') renderMemberPay();
    else if (current.view === 'memberadmin') renderMemberAdmin();
    else if (current.view === 'memberform') renderMemberForm(current.params);
    else if (current.view === 'partyform') renderPartyForm(current.params);
    else if (current.view === 'program') { programTabOn() ? renderProgram() : renderHome(); }
    // A63: a background refresh must not paint over the resume offer — the
    // draft is still in storage, so re-render the offer rather than the home
    // screen the collector never chose.
    else if (current.view === 'draft') { const dd = draftRead(); dd ? renderDraftOffer(dd) : renderHome(); }
    else if (current.view === 'findparty') renderFindParty();
    else if (current.view === 'review') renderReviewCorrections();
    else if (current.view === 'audit') { Auth.isAdmin() ? renderAuditLog() : renderHome(); }
    else if (current.view === 'usersnap') { Auth.isAdmin() ? renderUserSnapshot(current.params) : renderHome(); }
    else if (current.view === 'receiptcfg') { Auth.isAdmin() ? renderReceiptConfig() : renderHome(); }
    else if (current.view === 'receipt') renderReceiptShare(current.params);
    else if (current.view === 'help') renderHelp(current.params);
    else if (current.view === 'graveyard') renderGraveyard();
    else if (current.view === 'profile') renderProfileForm(current.params);
    else if (current.view === 'pot') renderPotDetail(current.params);
    else renderHome();
    updateBadge();
  }

  // A69: 'online', focus and a manual refresh are a human or the OS saying
  // "conditions changed" — better evidence than any timer, so each resets the
  // backoff instead of waiting it out.
  window.addEventListener('online', function () { resetPullBackoff(); updateNetBar(); autoSync(); });
  window.addEventListener('offline', updateNetBar);
  // phone/browser Back button → step back in the app (in a flow, cancel it)
  window.addEventListener('popstate', function (e) {
    // A63 (audit 2.11): this used to throw away a half-finished entry with no
    // question at all. On Android the edge-swipe Back is easy to trigger by
    // accident while holding a phone in one hand and cash in the other, and
    // there is a donor waiting — so ask once, the same shape as the A45 skip
    // guard. popstate cannot be cancelled, so staying means pushing the entry
    // state back on.
    if (flowState && flowHasTypedAnswers() && !window.confirm(t('flow_leave_confirm'))) {
      try { history.pushState({ v: 'entry' }, ''); } catch (er) {}
      renderEntry();
      return;
    }
    Voice.stop();
    // leaving on purpose: the draft is kept, so a mis-tap on OK is still
    // recoverable from the resume offer rather than final
    draftSave();
    flowState = null;
    const s = e.state, v = (s && s.v) || 'home';
    current = { view: v === 'entry' ? 'home' : v, params: (s && s.p) || {} };
    render();
    // no scrollTo here: the browser's native scroll restoration returns Back to
    // where the user was on the previous screen, which is what we want.
  });
  // Session invalidated (another device logged in with this account, or blocked):
  // Auth.call already cleared the local session — bounce to login with a note.
  let authKicked = false;
  // A54: say it out loud, once, at the moment it happens — and light the dot on
  // ✏️ আমার entry, where the row and its red tag actually are.
  window.addEventListener('ck-rejected', function () {
    DB.rejectedCount().then(function (n) {
      if (!n) return;
      toast(t('rejected_n').replace('{n}', n));
      dotState.entries = 1;
      if (!flowState && current.view === 'home') renderHome();
    });
  });
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
    const hdrRefresh = document.getElementById('hdr-refresh');
    if (hdrRefresh) {
      hdrRefresh.onclick = manualRefresh;
      // no room for a subtitle in the header — the explanation travels as the
      // accessible name / tooltip instead, and the guide covers the rest
      hdrRefresh.title = t('refresh_hint');
      hdrRefresh.setAttribute('aria-label', t('refresh'));
    }
    const hdrCurtain = document.getElementById('hdr-curtain');
    if (hdrCurtain) {
      hdrCurtain.onclick = function () { curtainOn = !curtainOn; paintCurtain(); render(); };
    }
    paintCurtain();
    document.getElementById('sync-badge').onclick = function () {
      Sync.syncNow().then(function (r) {
        toast(r.ok ? t('all_synced') : (r.reason === 'not-configured' ? t('sync_not_configured') : t('sync_fail')));
        updateBadge();
      });
    };
    // A63: decided BEFORE the first paint, not after it. Painting the offer on
    // top of render() looked right and was not: renderHome draws from
    // viewData(), which resolves a tick later and painted the home screen back
    // over the card. Found by driving it, not by reading it. One paint path —
    // set the view and let render() route, like every other screen.
    // Only when logged in: the login screen is not the place to be asked about
    // a half-finished donation entry.
    if (Auth.loggedIn() && draftRead()) current = { view: 'draft', params: {} };
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
        // `swReloaded` only guards THIS page load — it is born false again after
        // the reload it just caused. If a worker were ever to take control on
        // every load (a failing install that retries, a version that keeps
        // changing under us), the app would reload for ever and no entry could
        // be finished. sessionStorage survives the reload, so at most ONE
        // automatic reload happens per tab session; anything further needs the
        // user's own 🔄 আপডেট খুঁজি. A missed reload costs one stale screen; a
        // reload loop costs the whole app.
        // A31: the cap is for AUTOMATIC reloads only. When the user tapped 🔄
        // the reload is the thing they asked for, and refusing it turned the
        // documented escape hatch into a dead button. (The manual path also
        // reloads itself now; this stays as the belt to that braces.)
        if (!userReload) {
          let done = false;
          try { done = sessionStorage.getItem('ck_swReload') === '1'; } catch (e) {}
          if (done) return;
          try { sessionStorage.setItem('ck_swReload', '1'); } catch (e) {}
        }
        location.reload();
      });
      // A55: nobody ever asked whether the shell actually cached. Registration
      // resolving means the worker script downloaded, not that install
      // succeeded — so a collector could believe the app worked offline when it
      // had never cached a byte. Ask, once, and say so if the answer is no.
      navigator.serviceWorker.register('sw.js').then(function () {
        setTimeout(function () {
          if (!window.caches) return;
          caches.has(Auth.APP_VERSION).then(function (ok) {
            if (!ok) toast(t('offline_not_ready'));
          }).catch(function () {});
        }, 8000);
      }).catch(function () { toast(t('offline_not_ready')); });
    }
    // The bar has to appear the moment the server's version lands, not on the
    // next navigation — the whole point is that nobody has to go looking for it.
    window.addEventListener('ck-version', updateTrainingBar);
  });
})();
