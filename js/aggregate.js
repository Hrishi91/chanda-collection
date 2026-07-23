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
             expenses: keep(data.expenses), handovers: keep(data.handovers), voids: data.voids || [] };
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

    // cash/UPI split (legacy rows without split fields count as cash)
    let totalCash = 0, totalUpi = 0;
    payments.concat(daily).forEach(function (r) {
      if (r.cashAmount === undefined && r.upiAmount === undefined) {
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

  const api = { computeTotals: computeTotals, duesList: duesList,
                inHandRows: inHandRows, personalSummary: personalSummary,
                reconcile: reconcile };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Aggregate = api;
})();
