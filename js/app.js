// UI: view router + guided chat-style entry engine + dashboards.
(function () {
  const $view = function () { return document.getElementById('view'); };
  const SIDES = ['main_malda', 'main_balurghat', 'harirampur', 'singhadaha'];
  let flowState = null;

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
  function todayISO() { return new Date().toISOString().slice(0, 10); }

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
    const toStep = cashierOpts && cashierOpts.length
      ? { key: 'to', qKey: 'q_handover_to', kind: 'choice',
          options: cashierOpts.map(function (n) { return { v: n, label: n }; }) }
      : { key: 'to', qKey: 'q_handover_to', kind: 'text' };
    return {
      title: t('handover_title'),
      steps: [toStep].concat(moneySteps(false), [
        { key: 'note', qKey: 'q_note', kind: 'text', optional: true },
      ]),
      save: function (a) {
        const m = moneyOf(a);
        if (m.total <= 0) return Promise.reject(new Error('zero'));
        return DB.put('handovers', DB.newRow({
          from: Settings.get('collectorName'), to: a.to,
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
            { label: t('coll_expense'), action: function () { startFlow(expenseFlow('collection', type)); } },
            { label: t('done_for_now'), action: function () { navigate('home'); } },
          ] };
        });
      },
    };
  }
  function expenseFlow(source, collectionType) {
    return {
      title: source === 'collection' ? t('coll_expense') : t('expense'),
      steps: [
        { key: 'desc', qKey: 'q_desc', kind: 'text' },
        { key: 'amount', qKey: 'q_amount', kind: 'amount' },
        { key: 'spentBy', qKey: 'q_spent_by', kind: 'text', optional: true },
      ],
      save: function (a) {
        return DB.put('expenses', DB.newRow({
          desc: a.desc, amount: a.amount, spentBy: a.spentBy || Settings.get('collectorName'),
          source: source, collectionType: collectionType || '', date: todayISO(),
        })).then(function () { return null; });
      },
    };
  }

  // ---------- views ----------
  function renderHome() {
    DB.allData().then(function (data) {
      const today = todayISO();
      const me = Settings.get('collectorName');
      const myToday = data.payments.concat(data.daily).filter(function (r) {
        return r.collector === me && (r.date === today || (r.createdAt || '').slice(0, 10) === today);
      }).reduce(function (a, r) { return a + Number(r.amount || 0); }, 0);
      $view().innerHTML =
        '<div class="hero"><div>🙏 ' + esc(t('welcome_title')) + ' ' + Settings.get('year') + '</div>' +
        '<div class="hero-sub">' + esc(me) + ' • ' + esc(t('my_today')) + ': <b>' + fmtMoney(myToday) + '</b></div></div>' +
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
          '<button class="tile" data-go="expense">🧾 ' + esc(t('expense')) + '</button>' +
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
          else if (g === 'expense') startFlow(expenseFlow('general'));
          else if (g === 'handover') startHandover();
          else navigate(g);
        };
      });
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
      const pays = data.payments.filter(function (x) { return x.partyId === p.id; })
        .sort(function (a, b) { return (b.createdAt || '').localeCompare(a.createdAt || ''); });
      const paid = pays.reduce(function (a, x) { return a + Number(x.amount || 0); }, 0);
      const due = (Number(p.pledged) || 0) - paid;
      $view().innerHTML =
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
          return '<div class="row"><div>' + esc(x.date || (x.createdAt || '').slice(0, 10)) +
            '<div class="row-sub">' + esc(x.collector || '') + (x.note ? ' • ' + esc(x.note) : '') + '</div></div>' +
            '<b>' + fmtMoney(x.amount) + '</b></div>';
        }).join('') : '<div class="empty">' + esc(t('no_entries')) + '</div>');
      document.getElementById('pay-btn').onclick = function () { startFlow(paymentFlow(p)); };
    });
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

  function inHandTable(data) {
    const rows = Aggregate.handoverSummary(data);
    if (!rows.length) return '';
    return '<div class="card"><div class="card-title">' + esc(t('in_hand_by_collector')) + '</div>' +
      '<div class="row" style="cursor:default"><div class="row-sub">' + esc(t('by_collector')) + '</div>' +
      '<div class="row-sub">' + esc(t('collected_col')) + ' − ' + esc(t('handed_col')) + ' = ' + esc(t('inhand_col')) + '</div></div>' +
      rows.map(function (r) {
        return '<div class="row" style="cursor:default"><div><b>' + esc(r.collector) + '</b>' +
          (r.pending ? '<div class="row-sub">⏳ ' + esc(t('pending_handovers')) + ': ' + fmtMoney(r.pending) + '</div>' : '') +
          '</div><div class="row-right">' + fmtMoney(r.collected) + ' − ' + fmtMoney(r.handedOver) +
          ' = <span class="' + (r.inHand > 0 ? 'red' : 'green') + '"><b>' + fmtMoney(r.inHand) + '</b></span></div></div>';
      }).join('') + '</div>';
  }

  function renderCashier() {
    if (!Auth.isCashier()) { $view().innerHTML = '<div class="empty">' + esc(t('not_cashier')) + '</div>'; return; }
    $view().innerHTML = '<div class="empty">' + esc(t('loading')) + '</div>';
    Sync.fetchCentral().then(function (data) {
      const me = Settings.get('collectorName');
      const mine = (data.handovers || []).filter(function (h) { return h.to === me; });
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
      $view().innerHTML = '<div class="flow-title">' + esc(t('confirm_handover')) + '</div>' +
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
      $view().innerHTML = '<div class="empty">' + esc(t('needs_net')) + '</div>';
    });
  }

  function renderReport() {
    DB.allData().then(function (data) {
      const tt = Aggregate.computeTotals(data);
      $view().innerHTML = totalsHTML(tt, t('local_report')) +
        '<button id="central-btn" class="primary big block">☁️ ' + esc(t('central_report')) + '</button>' +
        '<div id="central"></div>';
      document.getElementById('central-btn').onclick = function () {
        const c = document.getElementById('central');
        c.innerHTML = '<div class="empty">' + esc(t('loading')) + '</div>';
        Sync.fetchCentral().then(function (cd) {
          const ct = Aggregate.computeTotals(cd);
          c.innerHTML = totalsHTML(ct, t('central_report')) + inHandTable(cd);
        }).catch(function () {
          c.innerHTML = '<div class="empty">' + esc(Sync.configured() ? t('fetch_fail') : t('sync_not_configured')) + '</div>';
        });
      };
    });
  }

  function renderSettings() {
    const user = Auth.current() || { name: '?', username: '?' };
    const fields = [
      ['year', 'year', 'number'],
      ['scriptUrl', 'script_url', 'text'],
    ];
    $view().innerHTML = '<div class="card"><div class="card-title">👤 ' + esc(user.name) +
      (user.role === 'admin' ? ' 👑' : '') + (Auth.isCashier() ? ' 💰' : '') + '</div>' +
      '<div class="row-sub">' + esc(t('logged_in_as')) + ': @' + esc(user.username) + '</div></div>' +
      (Auth.isAdmin() ? '<button id="adm-btn" class="primary big block">' + esc(t('admin_panel')) + '</button>' : '') +
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
        const d = JSON.parse(txt).data;
        return Promise.all(DB.STORES.map(function (s) { return d[s] ? DB.bulkPut(s, d[s]) : 0; }));
      }).then(function () { toast(t('saved')); updateBadge(); })
        .catch(function () { toast(t('fetch_fail')); });
    };
  }

  // ---------- auth views ----------
  let authView = 'login'; // login | register | forgot | regdone
  function errMsg(e) {
    const code = String(e && e.message || e).replace(/-/g, '_');
    const key = 'err_' + (code === 'year_not_approved' ? 'year' : code);
    return I18N[key] ? t(key) : t('err_network');
  }
  function langChips(rerender) {
    setTimeout(function () {
      document.querySelectorAll('[data-l]').forEach(function (b) {
        b.onclick = function () { Settings.set('lang', b.dataset.l); rerender(); };
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
      '<h2>' + esc(t('welcome_title')) + '</h2>' + langChips(renderLogin) +
      '<div class="field"><label>' + esc(t('username')) + '</label>' +
      '<input id="lg-user" autocapitalize="none" autocomplete="username"></div>' +
      '<div class="field"><label>' + esc(t('password')) + '</label>' +
      '<input id="lg-pw" type="password" autocomplete="current-password"></div>' +
      '<button id="lg-btn" class="primary big block">' + esc(t('login_btn')) + '</button>' +
      '<button id="lg-reg" class="ghost block">' + esc(t('no_account_register')) + '</button>' +
      '<button id="lg-forgot" class="ghost block">' + esc(t('forgot_link')) + '</button>' +
      (navigator.onLine ? '' : '<div class="hint">' + esc(t('login_needs_net')) + '</div>') +
      '</div>';
    document.getElementById('lg-reg').onclick = function () { authView = 'register'; renderAuth(); };
    document.getElementById('lg-forgot').onclick = function () { authView = 'forgot'; renderAuth(); };
    document.getElementById('lg-btn').onclick = function () {
      const btn = this; btn.disabled = true;
      Auth.login(document.getElementById('lg-user').value.trim(),
                 document.getElementById('lg-pw').value)
        .then(function () { navigate('home'); autoSync(); })
        .catch(function (e) { btn.disabled = false; toast(errMsg(e)); });
    };
  }
  function renderRegister() {
    $view().innerHTML = '<div class="card center onboard"><h2>' + esc(t('register_title')) + '</h2>' +
      langChips(renderRegister) +
      '<div class="field"><label>' + esc(t('full_name')) + '</label><input id="rg-name"></div>' +
      '<div class="field"><label>' + esc(t('username')) + '</label>' +
      '<input id="rg-user" autocapitalize="none"></div>' +
      '<div class="field"><label>' + esc(t('q_phone')) + '</label><input id="rg-phone" inputmode="tel"></div>' +
      '<div class="field"><label>' + esc(t('password')) + '</label><input id="rg-pw" type="password"></div>' +
      '<div class="field"><label>' + esc(t('confirm_password')) + '</label><input id="rg-pw2" type="password"></div>' +
      '<button id="rg-btn" class="primary big block">' + esc(t('register_btn')) + '</button>' +
      '<button id="rg-back" class="ghost block">' + esc(t('back_to_login')) + '</button></div>';
    document.getElementById('rg-back').onclick = function () { authView = 'login'; renderAuth(); };
    document.getElementById('rg-btn').onclick = function () {
      const pw = document.getElementById('rg-pw').value;
      if (pw !== document.getElementById('rg-pw2').value) { toast(t('pw_mismatch')); return; }
      const btn = this; btn.disabled = true;
      Auth.register({
        name: document.getElementById('rg-name').value.trim(),
        username: document.getElementById('rg-user').value.trim(),
        phone: document.getElementById('rg-phone').value.trim(),
        password: pw,
      }).then(function () { authView = 'regdone'; renderAuth(); })
        .catch(function (e) { btn.disabled = false; toast(errMsg(e)); });
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
    $view().innerHTML = '<div class="empty">' + esc(t('loading')) + '</div>';
    Auth.call('listUsers', { token: Auth.token() }).then(function (resp) {
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
          '<div class="chips" style="margin:8px 0 0">' + btns + '</div></div>';
      }
      function section(key, list) {
        return '<div class="section">' + esc(t(key)) + ' (' + list.length + ')</div>' +
          (list.length ? list.map(userCard).join('') : '<div class="empty">' + esc(t('none_here')) + '</div>');
      }
      $view().innerHTML = '<div class="flow-title">' + esc(t('admin_panel')) + '</div>' +
        '<button id="adm-refresh" class="ghost block">' + esc(t('refresh')) + '</button>' +
        section('pending_users', groups.pending) +
        section('approved_users', groups.approved) +
        section('blocked_users', groups.blocked);
      document.getElementById('adm-refresh').onclick = renderAdmin;
      document.querySelectorAll('[data-act]').forEach(function (b) {
        const id = b.dataset.id;
        b.onclick = function () {
          if (b.dataset.act === 'approve') adminAction('setStatus', { userId: id, status: 'approved', year: Settings.get('year') });
          else if (b.dataset.act === 'year') adminAction('approveYear', { userId: id, year: Settings.get('year') });
          else if (b.dataset.act === 'cashier') adminAction('setCashier', { userId: id, cashier: Number(b.dataset.v) });
          else if (b.dataset.act === 'block') adminAction('setStatus', { userId: id, status: 'blocked' });
          else if (b.dataset.act === 'unblock') adminAction('setStatus', { userId: id, status: 'approved', year: Settings.get('year') });
          else if (b.dataset.act === 'reset') adminAction('resetPassword', { userId: id }, function (resp) {
            alert(t('temp_pw_is') + ':\n\n' + resp.tempPassword);
          });
        };
      });
    }).catch(function (e) { $view().innerHTML = '<div class="empty">' + esc(errMsg(e)) + '</div>'; });
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
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
  });
})();
