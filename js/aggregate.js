// Pure aggregation logic shared by local dashboard, central report, tests.
(function () {
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (Number(f ? f(x) : x) || 0); }, 0); }

  // Voided (corrected) records are kept for audit in a separate `voids` store,
  // each pointing at a targetId. Aggregation drops those ids everywhere.
  function voidedIds(data) {
    const s = {};
    (data.voids || []).forEach(function (v) { if (v && v.targetId) s[v.targetId] = 1; });
    return s;
  }
  // Stable collector key: username (collectorId) when present, else the name
  // (legacy rows). So two people sharing a name never merge, and the name is
  // still available for display.
  function ck(r) { return String((r && (r.collectorId || r.collector)) || '?'); }
  function activeData(data) {
    const v = voidedIds(data);
    const keep = function (rows) { return (rows || []).filter(function (r) { return r && !v[r.id]; }); };
    return { parties: keep(data.parties), payments: keep(data.payments), daily: keep(data.daily),
             expenses: keep(data.expenses), handovers: keep(data.handovers), voids: data.voids || [],
             // pass corrections through (not voidable) — keeps this an exact
             // mirror of Code.gs activeData_ (see regression A8 in final-audit)
             corrections: data.corrections || [] };
  }

  // data: {parties:[], payments:[], daily:[], expenses:[], voids:[]}
  function computeTotals(data) {
    data = activeData(data);
    const parties = data.parties || [], payments = data.payments || [];
    const daily = data.daily || [], expenses = data.expenses || [];

    const paidByParty = {};
    payments.forEach(function (p) {
      paidByParty[p.partyId] = (paidByParty[p.partyId] || 0) + (Number(p.amount) || 0);
    });

    const byType = { shop: { pledged: 0, paid: 0, count: 0 },
                     person: { pledged: 0, paid: 0, count: 0 },
                     member: { pledged: 0, paid: 0, count: 0 } };
    parties.forEach(function (pt) {
      const b = byType[pt.type]; if (!b) return;
      b.count += 1;
      b.pledged += Number(pt.pledged) || 0;
      b.paid += paidByParty[pt.id] || 0;
    });

    const dailyByType = { road: 0, toto: 0, bus: 0 };
    daily.forEach(function (d) {
      if (d.type in dailyByType) dailyByType[d.type] += Number(d.amount) || 0;
    });

    const totalPayments = sum(payments, function (p) { return p.amount; });
    const totalDaily = sum(daily, function (d) { return d.amount; });
    const totalExpense = sum(expenses, function (e) { return e.amount; });
    const totalPledged = byType.shop.pledged + byType.person.pledged + byType.member.pledged;

    // cash/UPI split — isCashOnly is THE canonical legacy check (undefined OR
    // '' — Sheet round-trips blank cells as ''), same as personalSummary.
    let totalCash = 0, totalUpi = 0;
    payments.concat(daily).forEach(function (r) {
      if (isCashOnly(r)) {
        totalCash += Number(r.amount) || 0;
      } else {
        totalCash += Number(r.cashAmount) || 0;
        totalUpi += Number(r.upiAmount) || 0;
      }
    });

    const byCollector = {};
    payments.concat(daily).forEach(function (r) {
      const c = r.collector || '?';
      byCollector[c] = (byCollector[c] || 0) + (Number(r.amount) || 0);
    });

    return {
      byType: byType,
      dailyByType: dailyByType,
      totalCollection: totalPayments + totalDaily,
      totalExpense: totalExpense,
      inHand: totalPayments + totalDaily - totalExpense,
      totalPledged: totalPledged,
      totalDue: totalPledged - (byType.shop.paid + byType.person.paid + byType.member.paid),
      byCollector: byCollector,
      paidByParty: paidByParty,
      totalCash: totalCash,
      totalUpi: totalUpi,
    };
  }

  function isCashOnly(r) {
    // legacy rows (no split fields) are treated as pure cash
    return (r.cashAmount === undefined || r.cashAmount === '') &&
           (r.upiAmount === undefined || r.upiAmount === '');
  }

  // Per-person accountability. True cash in hand for X =
  //   collected(by X) + received(confirmed handovers TO X)
  //   − handedOver(confirmed handovers FROM X) − spent(expenses by X).
  // Pending outgoing handovers are shown separately and NOT subtracted
  // (the giver keeps credit until the cashier confirms receipt).
  function inHandRows(data) {
    data = activeData(data);
    const collected = {}, received = {}, handed = {}, pending = {}, spent = {}, nameBy = {};
    const note = function (k, nm) { if (nm) nameBy[k] = nm; };
    (data.payments || []).concat(data.daily || []).forEach(function (r) {
      const k = ck(r); note(k, r.collector);
      collected[k] = (collected[k] || 0) + (Number(r.amount) || 0);
    });
    (data.handovers || []).forEach(function (h) {
      const amt = Number(h.amount) || 0;
      const fromK = String(h.fromId || h.from || '?'), toK = String(h.toId || h.to || '?');
      note(fromK, h.from); note(toK, h.to);
      if (h.status === 'confirmed') {
        handed[fromK] = (handed[fromK] || 0) + amt;
        received[toK] = (received[toK] || 0) + amt;
      } else {
        pending[fromK] = (pending[fromK] || 0) + amt;
      }
    });
    (data.expenses || []).forEach(function (e) {
      const k = ck(e); note(k, e.collector);
      spent[k] = (spent[k] || 0) + (Number(e.amount) || 0);
    });
    const keys = {};
    [collected, received, handed, pending, spent].forEach(function (m) {
      Object.keys(m).forEach(function (k) { keys[k] = 1; });
    });
    return Object.keys(keys).map(function (k) {
      return { collector: nameBy[k] || k, collected: collected[k] || 0, received: received[k] || 0,
               handedOver: handed[k] || 0, pending: pending[k] || 0, spent: spent[k] || 0,
               inHand: (collected[k] || 0) + (received[k] || 0) - (handed[k] || 0) - (spent[k] || 0) };
    }).sort(function (a, b) { return b.inHand - a.inHand; });
  }

  // One person's own summary (always-visible "My summary" report). `ident` is
  // the caller's identity — username (preferred) or, for legacy rows, name.
  function personalSummary(data, ident) {
    data = activeData(data);
    const mine = function (r) { return ck(r) === String(ident) || r.collector === ident; };
    const myPay = (data.payments || []).filter(mine);
    const myDaily = (data.daily || []).filter(mine);
    const myExp = (data.expenses || []).filter(mine);
    const money = myPay.concat(myDaily);
    let cash = 0, upi = 0;
    money.forEach(function (r) {
      if (isCashOnly(r)) cash += Number(r.amount) || 0;
      else { cash += Number(r.cashAmount) || 0; upi += Number(r.upiAmount) || 0; }
    });
    const collected = money.reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
    const dailyByType = { road: 0, toto: 0, bus: 0 };
    myDaily.forEach(function (r) { if (r.type in dailyByType) dailyByType[r.type] += Number(r.amount) || 0; });
    let received = 0, handedOver = 0, pending = 0;
    const isTo = function (h) { return String(h.toId || h.to) === String(ident) || h.to === ident; };
    const isFrom = function (h) { return String(h.fromId || h.from) === String(ident) || h.from === ident; };
    (data.handovers || []).forEach(function (h) {
      const amt = Number(h.amount) || 0;
      if (isTo(h) && h.status === 'confirmed') received += amt;
      if (isFrom(h) && h.status === 'confirmed') handedOver += amt;
      if (isFrom(h) && h.status !== 'confirmed') pending += amt;
    });
    const expenseTotal = myExp.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
    const expenses = myExp.map(function (e) { return { date: e.date, desc: e.desc, amount: Number(e.amount) || 0 }; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return { collected: collected, cash: cash, upi: upi, dailyByType: dailyByType,
             received: received, handedOver: handedOver, pending: pending,
             expenseTotal: expenseTotal, expenses: expenses,
             inHand: collected + received - handedOver - expenseTotal };
  }

  // What a person actually has in their pocket RIGHT NOW, split by category
  // (cash vs UPI) — collected + received(confirmed handovers TO them) −
  // handed over(confirmed handovers FROM them) − expenses(cash only, same
  // assumption as isCashOnly/reconcile elsewhere). Used to show a collector
  // or cashier their real available amount at handover time, instead of
  // making them recall/type it from memory.
  // Money-source categories, in the fixed order legacy (breakdown-less)
  // subtractions drain them. 'payment' = party chanda; road/toto/bus = daily;
  // 'received' = handovers received without a category breakdown.
  const AVAIL_CATS = ['payment', 'road', 'toto', 'bus', 'received'];
  function splitOf(r) {
    return isCashOnly(r)
      ? { cash: Number(r.amount) || 0, upi: 0 }
      : { cash: Number(r.cashAmount) || 0, upi: Number(r.upiAmount) || 0 };
  }
  // Subtract `amt` from cats[..][field] in AVAIL_CATS order (deterministic
  // fallback for legacy handovers/expenses that don't say which category the
  // money came from). May leave the last touched cat negative if the books
  // themselves don't balance — mirrored nowhere else, so totals stay honest.
  function drain(cats, amt, field) {
    for (let i = 0; i < AVAIL_CATS.length && amt > 0; i++) {
      const e = cats[AVAIL_CATS[i]];
      if (!e || e[field] <= 0) continue;
      const take = Math.min(e[field], amt);
      e[field] -= take; amt -= take;
    }
    if (amt > 0) { // over-drained books: charge the first category
      const e = cats[AVAIL_CATS[0]] || (cats[AVAIL_CATS[0]] = { cash: 0, upi: 0 });
      e[field] -= amt;
    }
  }
  // What a person holds RIGHT NOW, split by source category AND by cash/UPI.
  // Category-exact where the data allows it: handovers carry a `breakdown`
  // JSON ({cat:{cash,upi}}) since v3.76.0, so both the giver's subtraction
  // and the receiver's addition stay in the right categories. Legacy rows
  // (no breakdown) fall back to drain()/the 'received' bucket.
  function myAvailable(data, ident) {
    data = activeData(data);
    const mine = function (r) { return ck(r) === String(ident) || r.collector === ident; };
    const cats = {};
    const add = function (cat, s) {
      const e = cats[cat] || (cats[cat] = { cash: 0, upi: 0 });
      e.cash += s.cash; e.upi += s.upi;
    };
    const parseBd = function (h) {
      if (!h.breakdown) return null;
      try { const b = JSON.parse(h.breakdown); return (b && typeof b === 'object') ? b : null; }
      catch (e) { return null; }
    };
    (data.payments || []).filter(mine).forEach(function (r) { add('payment', splitOf(r)); });
    (data.daily || []).filter(mine).forEach(function (r) {
      add(AVAIL_CATS.indexOf(r.type) >= 0 ? r.type : 'road', splitOf(r));
    });
    const isTo = function (h) { return String(h.toId || h.to) === String(ident) || h.to === ident; };
    const isFrom = function (h) { return String(h.fromId || h.from) === String(ident) || h.from === ident; };
    (data.handovers || []).filter(function (h) { return h.status === 'confirmed'; }).forEach(function (h) {
      const bd = parseBd(h), s = splitOf(h);
      if (isTo(h)) {
        if (bd) Object.keys(bd).forEach(function (k) {
          add(AVAIL_CATS.indexOf(k) >= 0 ? k : 'received',
              { cash: Number(bd[k].cash) || 0, upi: Number(bd[k].upi) || 0 });
        });
        else add('received', s);
      }
      if (isFrom(h)) {
        if (bd) Object.keys(bd).forEach(function (k) {
          add(AVAIL_CATS.indexOf(k) >= 0 ? k : 'received',
              { cash: -(Number(bd[k].cash) || 0), upi: -(Number(bd[k].upi) || 0) });
        });
        else { drain(cats, s.cash, 'cash'); drain(cats, s.upi, 'upi'); }
      }
    });
    (data.expenses || []).filter(mine).forEach(function (e) {
      const amt = Number(e.amount) || 0;
      // a collection expense says which round it came out of; general
      // expenses (cashier) drain the pool in the fixed order. Cash only —
      // nobody spends UPI-in-personal-account on pandal bamboo mid-round.
      if (e.source === 'collection' && AVAIL_CATS.indexOf(e.collectionType) >= 0 && cats[e.collectionType]) {
        cats[e.collectionType].cash -= amt;
      } else drain(cats, amt, 'cash');
    });
    let cash = 0, upi = 0;
    Object.keys(cats).forEach(function (k) { cash += cats[k].cash; upi += cats[k].upi; });
    return { cash: cash, upi: upi, byCat: cats };
  }

  // Parties with outstanding due, biggest due first.
  function duesList(parties, payments, voids) {
    const v = voidedIds({ voids: voids });
    const paidByParty = {};
    (payments || []).forEach(function (p) {
      if (v[p.id]) return;
      paidByParty[p.partyId] = (paidByParty[p.partyId] || 0) + (Number(p.amount) || 0);
    });
    return (parties || []).filter(function (pt) { return !v[pt.id]; }).map(function (pt) {
      const paid = paidByParty[pt.id] || 0;
      return { party: pt, paid: paid, due: (Number(pt.pledged) || 0) - paid };
    }).filter(function (x) { return x.due > 0; })
      .sort(function (a, b) { return b.due - a.due; });
  }

  // Data-integrity check: the money must always reconcile, and structural
  // anomalies (that would cause disputes) are surfaced. Handovers are internal
  // transfers, so across everyone they net out — hence the invariant:
  //   Σ (cash in hand)  ===  total collected − total expenses.
  function reconcile(data) {
    data = activeData(data);
    const parties = data.parties || [], payments = data.payments || [];
    const daily = data.daily || [], expenses = data.expenses || [];
    const money = payments.concat(daily);
    const totalCollected = sum(money, function (r) { return r.amount; });
    const totalExpenses = sum(expenses, function (e) { return e.amount; });
    const rows = inHandRows(data);
    const totalInHand = rows.reduce(function (a, r) { return a + r.inHand; }, 0);
    const expected = totalCollected - totalExpenses;
    const anomalies = [];

    if (Math.round(totalInHand) !== Math.round(expected)) {
      anomalies.push({ type: 'unbalanced', totalInHand: totalInHand, expected: expected,
                       diff: totalInHand - expected });
    }
    // payment whose party no longer exists
    const partyIds = {};
    parties.forEach(function (p) { partyIds[p.id] = 1; });
    const paidByParty = {};
    payments.forEach(function (p) {
      paidByParty[p.partyId] = (paidByParty[p.partyId] || 0) + (Number(p.amount) || 0);
      if (p.partyId && !partyIds[p.partyId]) {
        anomalies.push({ type: 'orphan_payment', id: p.id, partyId: p.partyId, amount: Number(p.amount) || 0 });
      }
    });
    // party paid more than pledged
    parties.forEach(function (p) {
      const paid = paidByParty[p.id] || 0;
      if (paid > (Number(p.pledged) || 0)) {
        anomalies.push({ type: 'overpaid', party: p.name, pledged: Number(p.pledged) || 0, paid: paid });
      }
    });
    // handed over more than held
    rows.forEach(function (r) {
      if (r.inHand < 0) anomalies.push({ type: 'negative_inhand', collector: r.collector, inHand: r.inHand });
    });
    // same id appearing twice in a store (would double-count)
    ['parties', 'payments', 'daily', 'expenses', 'handovers'].forEach(function (store) {
      const seen = {};
      (data[store] || []).forEach(function (r) {
        if (r && r.id != null) {
          if (seen[r.id]) anomalies.push({ type: 'duplicate_id', store: store, id: r.id });
          seen[r.id] = 1;
        }
      });
    });

    return { totalCollected: totalCollected, totalExpenses: totalExpenses,
             totalInHand: totalInHand, expected: expected,
             balanced: !anomalies.some(function (a) { return a.type === 'unbalanced'; }),
             anomalies: anomalies };
  }

  // Central report payloads — client mirror of Code.gs computeReport_ so every
  // report renders from the local pull snapshot (one aggregation path, no extra
  // round-trip, works offline). Shapes MUST match the server versions because
  // reportHTML() renders them unchanged.
  const REPORT_IDS = ['overview', 'dues', 'inhand', 'collectors', 'areas', 'expenses', 'daily'];
  function computeReport(id, data) {
    const d = activeData(data);
    const money = (d.payments || []).concat(d.daily || []);
    if (id === 'overview') {
      const byType = { shop: { count: 0, pledged: 0, paid: 0 },
                       person: { count: 0, pledged: 0, paid: 0 },
                       member: { count: 0, pledged: 0, paid: 0 } };
      const paidBy = {};
      (d.payments || []).forEach(function (p) { paidBy[p.partyId] = (paidBy[p.partyId] || 0) + (Number(p.amount) || 0); });
      (d.parties || []).forEach(function (p) {
        const b = byType[p.type]; if (!b) return;
        b.count++; b.pledged += Number(p.pledged) || 0; b.paid += paidBy[p.id] || 0;
      });
      const dailyByType = { road: 0, toto: 0, bus: 0 };
      (d.daily || []).forEach(function (r) { if (r.type in dailyByType) dailyByType[r.type] += Number(r.amount) || 0; });
      let cash = 0, upi = 0;
      money.forEach(function (r) { // same canonical isCashOnly as computeTotals
        if (isCashOnly(r)) cash += Number(r.amount) || 0;
        else { cash += Number(r.cashAmount) || 0; upi += Number(r.upiAmount) || 0; }
      });
      const totalPledged = byType.shop.pledged + byType.person.pledged + byType.member.pledged;
      const totalPaid = byType.shop.paid + byType.person.paid + byType.member.paid;
      const totalColl = sum(money, function (r) { return r.amount; });
      const totalExp = sum(d.expenses, function (r) { return r.amount; });
      return { totalCollection: totalColl, totalExpense: totalExp, inHand: totalColl - totalExp,
               totalPledged: totalPledged, totalDue: totalPledged - totalPaid,
               totalCash: cash, totalUpi: upi, byType: byType, dailyByType: dailyByType };
    }
    if (id === 'dues') {
      const paid = {};
      (d.payments || []).forEach(function (p) { paid[p.partyId] = (paid[p.partyId] || 0) + (Number(p.amount) || 0); });
      const rows = (d.parties || []).map(function (p) {
        const pd = paid[p.id] || 0;
        return { name: p.name, type: p.type, side: p.side, owner: p.owner,
                 pledged: Number(p.pledged) || 0, paid: pd, due: (Number(p.pledged) || 0) - pd };
      }).filter(function (r) { return r.due > 0; })
        .sort(function (a, b) { return b.due - a.due; });
      return { rows: rows, totalDue: sum(rows, function (r) { return r.due; }) };
    }
    if (id === 'inhand') return { rows: inHandRows(d) };
    if (id === 'collectors') {
      const tot = {}, nameBy = {};
      money.forEach(function (r) { const k = ck(r); if (r.collector) nameBy[k] = r.collector; tot[k] = (tot[k] || 0) + (Number(r.amount) || 0); });
      const rows = Object.keys(tot).map(function (k) { return { collector: nameBy[k] || k, total: tot[k] }; })
        .sort(function (a, b) { return b.total - a.total; });
      return { rows: rows };
    }
    if (id === 'areas') {
      const paid = {};
      (d.payments || []).forEach(function (p) { paid[p.partyId] = (paid[p.partyId] || 0) + (Number(p.amount) || 0); });
      const agg = {};
      (d.parties || []).forEach(function (p) {
        const k = p.side || '—'; // shops carry an area; person/member fall in "no area"
        if (!agg[k]) agg[k] = { area: k, count: 0, pledged: 0, paid: 0 };
        agg[k].count++; agg[k].pledged += Number(p.pledged) || 0; agg[k].paid += paid[p.id] || 0;
      });
      const rows = Object.keys(agg).map(function (k) { const a = agg[k]; a.due = a.pledged - a.paid; return a; })
        .sort(function (a, b) { return b.paid - a.paid; }); // leaderboard: most collected on top
      return { rows: rows, totalPaid: sum(rows, function (r) { return r.paid; }) };
    }
    if (id === 'expenses') {
      const rows = (d.expenses || []).map(function (e) {
        return { date: e.date, subject: e.subject || '—', desc: e.desc,
                 amount: Number(e.amount) || 0, spentBy: e.spentBy, source: e.source };
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      const subAgg = {};
      rows.forEach(function (r) {
        const s = r.subject || '—';
        if (!subAgg[s]) subAgg[s] = { subject: s, total: 0, count: 0 };
        subAgg[s].total += r.amount; subAgg[s].count += 1;
      });
      const bySubject = Object.keys(subAgg).map(function (k) { return subAgg[k]; })
        .sort(function (a, b) { return b.total - a.total; });
      return { rows: rows, bySubject: bySubject, total: sum(rows, function (r) { return r.amount; }) };
    }
    if (id === 'daily') {
      const agg = {};
      (d.daily || []).forEach(function (r) { const k = r.date + '|' + r.type; agg[k] = (agg[k] || 0) + (Number(r.amount) || 0); });
      const rows = Object.keys(agg).map(function (k) {
        const p = k.split('|');
        return { date: p[0], type: p[1], amount: agg[k] };
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      const byType = { road: 0, toto: 0, bus: 0 };
      (d.daily || []).forEach(function (r) { if (r.type in byType) byType[r.type] += Number(r.amount) || 0; });
      return { rows: rows, byType: byType };
    }
    throw new Error('unknown report');
  }
  // Which central reports this user may see — mirror of allowedReports_.
  function allowedReports(user) {
    if (!user) return [];
    if (user.role === 'admin') return REPORT_IDS.slice();
    const granted = String(user.reports || '').split(',').filter(Boolean);
    if (Number(user.cashier) === 1 && granted.indexOf('inhand') < 0) granted.push('inhand');
    return granted.filter(function (r) { return REPORT_IDS.indexOf(r) >= 0; });
  }

  const api = { computeTotals: computeTotals, duesList: duesList,
                inHandRows: inHandRows, personalSummary: personalSummary,
                myAvailable: myAvailable, reconcile: reconcile, computeReport: computeReport,
                allowedReports: allowedReports, REPORT_IDS: REPORT_IDS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Aggregate = api;
})();
