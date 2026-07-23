// UI: view router + guided chat-style entry engine + dashboards.
(function () {
  const $view = function () { return document.getElementById('view'); };
  const SIDES = ['main_malda', 'main_balurghat', 'harirampur', 'singhadaha'];
  const REPORT_IDS = ['overview', 'dues', 'inhand', 'collectors', 'expenses', 'daily'];
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
  function updateBadge() {
    DB.unsyncedCount().then(function (n) {
      const b = document.getElementById('sync-badge');
      if (!b) return;
      b.textContent = n ? '⏳ ' + n : '✅';
      b.className = 'badge ' + (n ? 'warn' : 'ok');
      b.title = n ? n + t('unsynced_n') : t('all_synced');
    });
  }
  function autoSync() {
    if (!Sync.configured()) return;
    Sync.syncNow().then(function (r) { if (r.ok && r.sent) toast('☁️ Sync: ' + r.sent); updateBadge(); });
  }

  // ---------- in-app notifications ----------
  // Actionable counts (handovers to confirm, users to approve) polled while
  // the app is open; shown as a home banner + OS notification when new.
  let notifCounts = { handovers: 0, approvals: 0 };
  let notifTimer = null, notifWired = false;
  function osNotify(body) {
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification('🙏 ' + t('app_title'), { body: body, icon: 'icons/icon.svg', tag: 'chanda-notif' });
      }
    } catch (e) { /* ignore */ }
  }
  function notifText() {
    const parts = [];
    if (notifCounts.handovers > 0) parts.push(notifCounts.handovers + ' ' + t('notif_handovers'));
    if (notifCounts.approvals > 0) parts.push(notifCounts.approvals + ' ' + t('notif_approvals'));
    return parts.join(' • ');
  }
  function renderNotifBanner() {
    const el = document.getElementById('notif-banner');
    if (!el) return;
    let html = '';
    if (notifCounts.handovers > 0) {
      html += '<button class="notif-item" data-notif="cashier">🔔 ' + notifCounts.handovers + ' ' + esc(t('notif_handovers')) + ' ›</button>';
    }
    if (notifCounts.approvals > 0) {
      html += '<button class="notif-item" data-notif="admin">🔔 ' + notifCounts.approvals + ' ' + esc(t('notif_approvals')) + ' ›</button>';
    }
    el.innerHTML = html;
    el.querySelectorAll('[data-notif]').forEach(function (b) {
      b.onclick = function () { navigate(b.dataset.notif); };
    });
  }
  function checkNotifications() {
    if (!Auth.loggedIn() || !navigator.onLine || !Sync.configured()) return;
    Auth.call('notifications', { token: Auth.token(), year: Settings.get('year') })
      .then(function (resp) {
        const n = resp.notifications || { handovers: 0, approvals: 0 };
        const total = (n.handovers || 0) + (n.approvals || 0);
        const prev = (notifCounts.handovers || 0) + (notifCounts.approvals || 0);
        const changed = total !== prev;
        notifCounts = n;
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
  const REFRESHABLE = ['home', 'list', 'report', 'admin', 'cashier', 'party'];
  function onAppFocus() {
    checkNotifications();
    if (Auth.loggedIn() && !flowState && REFRESHABLE.indexOf(current.view) >= 0) render();
  }
  function startNotifPolling() {
    if (!notifWired) {
      notifWired = true;
      document.addEventListener('visibilitychange', function () { if (!document.hidden) onAppFocus(); });
      window.addEventListener('focus', onAppFocus);
      wirePullToRefresh();
    }
    if (!notifTimer) notifTimer = setInterval(function () { if (!document.hidden) checkNotifications(); }, 60000);
    checkNotifications();
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
      }
    } else if (step.required && !String(raw || '').trim()) {
      toast(t('comment_required')); return; // mandatory text (e.g. "Other" comment)
    }
    flowState.answers[step.key] = val;
    Voice.stop();
    if (flowState.editIdx >= 0) { flowState.editIdx = -1; flowState.idx = flowState.def.steps.length; }
    else { flowState.idx++; skipHidden(); }
    renderEntry();
  }
  function goBack() {
    Voice.stop();
    if (flowState.idx === 0) { flowState = null; navigate('home'); return; }
    let i = flowState.idx - 1;
    while (i > 0 && !visible(flowState.def.steps[i])) i--;
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
      html += '</div><div class="card summary"><div class="card-title">' + esc(t('confirm_title')) + '</div>';
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
      }).catch(function () { saveB.disabled = false; toast(t('amount_zero')); });
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
    return SIDES.map(function (s) { return { v: s, labelKey: 'side_' + s }; });
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
      phone: a.phone || '', pledged: a.pledged || 0,
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
        { key: 'owner', qKey: 'q_owner_name', kind: 'text', showIf: function () { return type === 'shop'; } },
        { key: 'side', qKey: 'q_side', kind: 'choice', options: sideOptions(), showIf: function () { return type === 'shop'; } },
        { key: 'phone', qKey: 'q_phone', kind: 'text', optional: true },
        { key: 'pledged', qKey: 'q_pledged', kind: 'amount' },
      ].concat(moneySteps(true)),
      save: function (a) {
        return savePartyAndFirstPayment(type, a).then(function (party) {
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
            ? '<button class="tile" data-go="cashier">' + esc(t('confirm_handover')) + '</button>' : '') +
        '</div>';
      document.querySelectorAll('[data-go]').forEach(function (b) {
        b.onclick = function () {
          const g = b.dataset.go;
          if (g === 'shop' || g === 'person' || g === 'member') startFlow(newPartyFlow(g));
          else if (g === 'bulk') startFlow(newPartyFlow('shop', {}, true));
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
  function renderList() {
    DB.allData().then(function (data) {
      const paidBy = Aggregate.computeTotals(data).paidByParty;
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
        '<input id="search" class="search" placeholder="' + esc(t('search')) + '" value="' + esc(listQuery) + '">' +
        '<div class="chips tabs">' + tabs.map(function (tb) {
          return '<button class="chip' + (listFilter === tb[0] ? ' on' : '') + '" data-f="' + tb[0] + '">' + esc(tb[1]) + '</button>';
        }).join('') + '</div>' +
        (rows.length ? rows.map(function (p) {
          const paid = paidBy[p.id] || 0, due = (Number(p.pledged) || 0) - paid;
          return '<div class="row" data-id="' + p.id + '">' +
            '<div><b>' + esc(p.name) + '</b><div class="row-sub">' +
            esc(t('type_' + p.type)) + (p.side ? ' • ' + esc(t('side_' + p.side)) : '') +
            (p.owner ? ' • ' + esc(p.owner) : '') + '</div></div>' +
            '<div class="row-right">' + fmtMoney(paid) + '/' + fmtMoney(p.pledged) +
            (due > 0 ? '<span class="due-chip">' + esc(t('due')) + ' ' + fmtMoney(due) + '</span>'
                     : '<span class="ok-chip">✅</span>') + '</div></div>';
        }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>');
      document.getElementById('search').oninput = function (e) { listQuery = e.target.value; renderList(); };
      document.querySelectorAll('[data-f]').forEach(function (c) {
        c.onclick = function () { listFilter = c.dataset.f; renderList(); };
      });
      document.querySelectorAll('.row[data-id]').forEach(function (r) {
        r.onclick = function () { navigate('party', { id: r.dataset.id }); };
      });
    });
  }

  function renderParty(params) {
    Promise.all([DB.get('parties', params.id), DB.allData()]).then(function (res) {
      const p = res[0], data = res[1];
      if (!p) { navigate('list'); return; }
      const voidedOf = {};
      (data.voids || []).forEach(function (v) { if (v.targetStore === 'payments') voidedOf[v.targetId] = v.reason || '✓'; });
      const pays = data.payments.filter(function (x) { return x.partyId === p.id; })
        .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      const paid = pays.reduce(function (a, x) { return a + (voidedOf[x.id] !== undefined ? 0 : Number(x.amount || 0)); }, 0);
      const due = (Number(p.pledged) || 0) - paid;
      $view().innerHTML = backBar('list') +
        '<div class="card"><div class="card-title">' + esc(p.name) + '</div>' +
        '<div class="row-sub">' + esc(t('type_' + p.type)) +
        (p.side ? ' • ' + esc(t('side_' + p.side)) : '') + (p.owner ? ' • ' + esc(p.owner) : '') +
        (p.phone ? ' • 📞 ' + esc(p.phone) : '') + '</div>' +
        '<div class="stat3">' +
        '<div><span>' + esc(t('pledged')) + '</span><b>' + fmtMoney(p.pledged) + '</b></div>' +
        '<div><span>' + esc(t('paid')) + '</span><b>' + fmtMoney(paid) + '</b></div>' +
        '<div class="' + (due > 0 ? 'red' : 'green') + '"><span>' + esc(t('due')) + '</span><b>' + fmtMoney(due) + '</b></div>' +
        '</div>' +
        '<button id="pay-btn" class="primary big block">💰 ' + esc(t('add_payment')) + '</button></div>' +
        '<div class="section">' + esc(t('payments_history')) + '</div>' +
        (pays.length ? pays.map(function (x) {
          const isVoid = voidedOf[x.id] !== undefined;
          const reason = isVoid && voidedOf[x.id] !== '✓' ? ': ' + esc(voidedOf[x.id]) : '';
          return '<div class="row' + (isVoid ? ' voided' : '') + '"><div>' + esc(x.date || (x.createdAt || '').slice(0, 10)) +
            '<div class="row-sub">' + esc(x.collector || '') + (x.note ? ' • ' + esc(x.note) : '') +
            (isVoid ? ' • <span class="void-tag">' + esc(t('voided_label')) + reason + '</span>' : '') + '</div></div>' +
            '<b>' + fmtMoney(x.amount) + '</b>' +
            (isVoid ? '' : '<button class="chip void-btn" data-void="' + esc(x.id) + '">' + esc(t('void_btn')) + '</button>') + '</div>';
        }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>');
      document.getElementById('pay-btn').onclick = function () { startFlow(paymentFlow(p)); };
      document.querySelectorAll('[data-void]').forEach(function (b) {
        b.onclick = function () { renderVoidReason(b.dataset.void, p); };
      });
    });
  }

  // Void a payment (audit-preserving correction): records a reason into the
  // `voids` store; aggregation then drops that payment id everywhere.
  function renderVoidReason(targetId, party) {
    $view().innerHTML = backBar('party', { id: party.id }) +
      '<div class="card center onboard"><div class="big-emoji">✖️</div>' +
      '<h2>' + esc(t('void_title')) + '</h2>' +
      '<div class="hint">' + esc(t('void_hint')) + '</div>' +
      '<div class="field"><label>' + esc(t('q_void_reason')) + '</label><input id="void-reason" autocomplete="off"></div>' +
      '<button id="void-ok" class="primary big block">' + esc(t('void_confirm')) + '</button>' +
      '<button id="void-cancel" class="ghost block">' + esc(t('cancel')) + '</button></div>';
    const back = function () { navigate('party', { id: party.id }); };
    document.getElementById('void-cancel').onclick = back;
    document.getElementById('void-ok').onclick = function () {
      const reason = document.getElementById('void-reason').value.trim();
      if (!reason) { toast(t('void_need_reason')); return; }
      this.disabled = true;
      DB.put('voids', DB.newRow({ targetStore: 'payments', targetId: targetId, reason: reason }))
        .then(function () { toast(t('voided_done')); updateBadge(); autoSync(); back(); });
    };
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
          esc(t('type_' + r.type)) + (r.side ? ' • ' + esc(t('side_' + r.side)) : '') +
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
            esc(e.date) + '</div></div><b>' + fmtMoney(e.amount) + '</b></div>';
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
          '<div class="row-sub">' + esc(r.date) + (r.spentBy ? ' • ' + esc(r.spentBy) : '') +
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
        return '<div class="row" style="cursor:default"><div>' + esc(r.date) + ' • ' +
          esc(t('type_' + r.type)) + '</div><b>' + fmtMoney(r.amount) + '</b></div>';
      }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>') + '</div>';
  }
  function reportHTML(id, d) {
    if (id === 'overview') return totalsHTML(d, t('report_overview'));
    if (id === 'dues') return reportDuesHTML(d);
    if (id === 'inhand') return reportInhandHTML(d);
    if (id === 'collectors') return reportCollectorsHTML(d);
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
          '<div class="row-sub">' + esc(h.date) + (h.note ? ' • ' + esc(h.note) : '') +
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
    // personal "my summary" (server-truth online; device-local fallback) —
    // everyone always sees their own, no permission needed
    $view().innerHTML = '<div id="my-summary"><div class="empty">' + esc(t('loading')) + '</div></div>' +
      '<div class="section">' + esc(t('central_reports')) + '</div>' +
      '<div id="report-picker"><div class="empty">' + esc(t('loading')) + '</div></div>' +
      '<div id="report-body"></div>';
    loadMySummary();
    const fallback = function () { showReportButtons(myReports()); };
    if (navigator.onLine && Sync.configured() && Auth.loggedIn()) {
      Auth.call('reportList', { token: Auth.token() })
        .then(function (resp) { showReportButtons(resp.reports || []); })
        .catch(fallback);
    } else fallback();
  }
  function loadMySummary() {
    const el = document.getElementById('my-summary');
    const deviceFallback = function () {
      DB.allData().then(function (data) {
        el.innerHTML = mySummaryHTML(Aggregate.personalSummary(data, Settings.get('collectorUsername') || Settings.get('collectorName')), true);
      });
    };
    if (navigator.onLine && Sync.configured() && Auth.loggedIn()) {
      Auth.call('myReport', { token: Auth.token(), year: Settings.get('year') })
        .then(function (resp) { el.innerHTML = mySummaryHTML(resp.data, false); })
        .catch(deviceFallback);
    } else deviceFallback();
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
    const body = document.getElementById('report-body');
    body.innerHTML = '<div class="empty">' + esc(t('loading')) + '</div>';
    Auth.call('report', { token: Auth.token(), id: id, year: Settings.get('year') })
      .then(function (resp) { body.innerHTML = reportHTML(id, resp.data); })
      .catch(function (e) { body.innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>'; });
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
    $view().innerHTML = '<div class="card center onboard"><div class="big-emoji">🙏</div>' +
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
      const btn = this; btn.disabled = true;
      Auth.register({ name: name, username: username,
        phone: document.getElementById('rg-phone').value.trim(), password: pw,
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
  function renderAdmin() {
    $view().innerHTML = backBar('settings') + '<div class="empty">' + esc(t('loading')) + '</div>';
    Promise.all([
      Auth.call('listUsers', { token: Auth.token() }),
      Auth.call('listSubjects', { token: Auth.token() }).catch(function () { return { subjects: [] }; }),
    ]).then(function (res) {
      const resp = res[0], subjects = res[1].subjects || [];
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
                  '<button class="chip" data-act="reset" data-id="' + u.id + '">' + esc(t('reset_pw')) + '</button>' +
                  (u.role === 'admin' ? '' : '<button class="chip" data-act="block" data-id="' + u.id + '">' + esc(t('block')) + '</button>');
        } else {
          btns = '<button class="chip" data-act="unblock" data-id="' + u.id + '">' + esc(t('unblock')) + '</button>';
        }
        return '<div class="row" style="flex-wrap:wrap;cursor:default"><div style="flex:1 1 100%"><b>' + esc(u.name) + '</b>' +
          (u.role === 'admin' ? ' 👑' : '') + (u.cashier ? ' 💰' : '') +
          '<div class="row-sub">@' + esc(u.username) + (u.phone ? ' • 📞 ' + esc(u.phone) : '') +
          ' • ' + esc(u.years || '—') + '</div></div>' +
          '<div class="chips" style="margin:8px 0 0">' + btns + '</div>' + reportChips(u) + '</div>';
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
        (subjects.length ? '<div class="chips" style="margin-top:10px">' + subjects.map(function (s) {
          return '<button class="chip" data-subj-del="' + esc(s.id) + '">' + esc(s.name) + ' ✕</button>';
        }).join('') + '</div>' : '<div class="empty">' + esc(t('no_subjects')) + '</div>') + '</div>';
      $view().innerHTML = backBar('settings') + '<div class="flow-title">' + esc(t('admin_panel')) + '</div>' +
        '<button id="adm-refresh" class="ghost block">' + esc(t('refresh')) + '</button>' +
        subjectsCard +
        section('pending_users', groups.pending) +
        section('approved_users', groups.approved) +
        section('blocked_users', groups.blocked);
      document.getElementById('adm-refresh').onclick = renderAdmin;
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
      document.querySelectorAll('[data-act]').forEach(function (b) {
        const id = b.dataset.id;
        b.onclick = function () {
          if (b.dataset.act === 'approve') adminAction('setStatus', { userId: id, status: 'approved', year: Settings.get('year') });
          else if (b.dataset.act === 'year') adminAction('approveYear', { userId: id, year: Settings.get('year') });
          else if (b.dataset.act === 'cashier') adminAction('setCashier', { userId: id, cashier: Number(b.dataset.v) });
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
    }).catch(function (e) { $view().innerHTML = backBar('settings') + '<div class="empty">' + esc(errMsg(e)) + '</div>'; });
  }

  // ---------- router ----------
  let current = { view: 'home', params: {} };
  function navigate(view, params) {
    current = { view: view, params: params || {} };
    flowState = view === 'entry' ? flowState : null;
    render();
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
    else if (current.view === 'help') renderHelp();
    else renderHome();
    updateBadge();
  }

  window.addEventListener('online', autoSync);
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
