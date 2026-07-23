// Pure aggregation logic shared by local dashboard, central report, tests.
(function () {
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (Number(f ? f(x) : x) || 0); }, 0); }

  // data: {parties:[], payments:[], daily:[], expenses:[]}
  function computeTotals(data) {
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
    const collected = {}, received = {}, handed = {}, pending = {}, spent = {};
    (data.payments || []).concat(data.daily || []).forEach(function (r) {
      const c = r.collector || '?';
      collected[c] = (collected[c] || 0) + (Number(r.amount) || 0);
    });
    (data.handovers || []).forEach(function (h) {
      const amt = Number(h.amount) || 0;
      if (h.status === 'confirmed') {
        handed[h.from] = (handed[h.from] || 0) + amt;
        received[h.to] = (received[h.to] || 0) + amt;
      } else {
        pending[h.from] = (pending[h.from] || 0) + amt;
      }
    });
    (data.expenses || []).forEach(function (e) {
      const c = e.collector || '?';
      spent[c] = (spent[c] || 0) + (Number(e.amount) || 0);
    });
    const names = {};
    [collected, received, handed, pending, spent].forEach(function (m) {
      Object.keys(m).forEach(function (k) { names[k] = 1; });
    });
    return Object.keys(names).map(function (c) {
      return { collector: c, collected: collected[c] || 0, received: received[c] || 0,
               handedOver: handed[c] || 0, pending: pending[c] || 0, spent: spent[c] || 0,
               inHand: (collected[c] || 0) + (received[c] || 0) - (handed[c] || 0) - (spent[c] || 0) };
    }).sort(function (a, b) { return b.inHand - a.inHand; });
  }

  // One person's own summary (always-visible "My summary" report).
  function personalSummary(data, name) {
    const myPay = (data.payments || []).filter(function (p) { return p.collector === name; });
    const myDaily = (data.daily || []).filter(function (x) { return x.collector === name; });
    const myExp = (data.expenses || []).filter(function (e) { return e.collector === name; });
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
    (data.handovers || []).forEach(function (h) {
      const amt = Number(h.amount) || 0;
      if (h.to === name && h.status === 'confirmed') received += amt;
      if (h.from === name && h.status === 'confirmed') handedOver += amt;
      if (h.from === name && h.status !== 'confirmed') pending += amt;
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
  function duesList(parties, payments) {
    const paidByParty = {};
    (payments || []).forEach(function (p) {
      paidByParty[p.partyId] = (paidByParty[p.partyId] || 0) + (Number(p.amount) || 0);
    });
    return (parties || []).map(function (pt) {
      const paid = paidByParty[pt.id] || 0;
      return { party: pt, paid: paid, due: (Number(pt.pledged) || 0) - paid };
    }).filter(function (x) { return x.due > 0; })
      .sort(function (a, b) { return b.due - a.due; });
  }

  const api = { computeTotals: computeTotals, duesList: duesList,
                inHandRows: inHandRows, personalSummary: personalSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Aggregate = api;
})();
