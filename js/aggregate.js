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

  // Per-collector accountability: collected − confirmed handovers = in hand.
  // Pending handovers stay "in hand" until the cashier confirms receipt.
  function handoverSummary(data) {
    const collected = {};
    (data.payments || []).concat(data.daily || []).forEach(function (r) {
      const c = r.collector || '?';
      collected[c] = (collected[c] || 0) + (Number(r.amount) || 0);
    });
    const handed = {}, pending = {};
    (data.handovers || []).forEach(function (h) {
      const c = h.from || h.collector || '?';
      if (h.status === 'confirmed') handed[c] = (handed[c] || 0) + (Number(h.amount) || 0);
      else pending[c] = (pending[c] || 0) + (Number(h.amount) || 0);
    });
    const names = {};
    [collected, handed, pending].forEach(function (m) {
      Object.keys(m).forEach(function (k) { names[k] = 1; });
    });
    return Object.keys(names).map(function (c) {
      const col = collected[c] || 0, h = handed[c] || 0;
      return { collector: c, collected: col, handedOver: h,
               pending: pending[c] || 0, inHand: col - h };
    }).sort(function (a, b) { return b.inHand - a.inHand; });
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

  const api = { computeTotals: computeTotals, duesList: duesList, handoverSummary: handoverSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Aggregate = api;
})();
