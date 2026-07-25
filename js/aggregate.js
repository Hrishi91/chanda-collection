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

  // Entry rows carry `collectorRole` in ONE vocabulary — 'admin' | 'cashier' |
  // 'collector' — because the separation-of-duties rules (who may void an
  // entry, who may resolve a correction flag) test for exactly those words.
  // The Users sheet speaks a different vocabulary (`role` is 'admin' or
  // 'user', with a separate `cashier` flag), so it must be translated on the
  // way in; roleOf does that. rowRole translates on the way OUT, which also
  // heals rows written before this was fixed (they say 'user').
  function roleOf(role, cashier) {
    return String(role) === 'admin' ? 'admin' : (Number(cashier) === 1 ? 'cashier' : 'collector');
  }
  function rowRole(stored) {
    const s = String(stored || '');
    return (s === 'admin' || s === 'cashier') ? s : 'collector';
  }
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
    const orig = data;          // myAvailable does its own activeData()
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
               inHand: (collected[k] || 0) + (received[k] || 0) - (handed[k] || 0) - (spent[k] || 0),
               // same source-category × cash/UPI split each person sees in
               // their own summary — so the central report and every personal
               // report read the identical numbers
               byCat: myAvailable(orig, k).byCat };
    }).sort(function (a, b) { return b.inHand - a.inHand; });
  }

  // One person's own summary (always-visible "My summary" report). `ident` is
  // the caller's identity — username (preferred) or, for legacy rows, name.
  //
  // IDENTITY RULE (shared by personalSummary and myAvailable): a row belongs to
  // `ident` only when its OWN group key — collectorId, else collector name,
  // exactly as inHandRows keys its rows — equals `ident`. There is deliberately
  // no "…or the collector name matches" fallback: a row with a blank
  // collectorId groups under the display name, and that name-keyed identity
  // would then swallow every row belonging to the real username, so byCat came
  // out larger than the inHand it sits next to in the same report.
  function personalSummary(data, ident) {
    data = activeData(data);
    const mine = function (r) { return ck(r) === String(ident); };
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
    const isTo = function (h) { return String(h.toId || h.to || '?') === String(ident); };
    const isFrom = function (h) { return String(h.fromId || h.from || '?') === String(ident); };
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
             inHand: collected + received - handedOver - expenseTotal,
             // what is STILL in this person's hand, split by source category
             // and money type — same function the handover screen uses, so the
             // report and the handover chips can never disagree
             byCat: myAvailable(data, ident).byCat };
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
  // 'payment' is the LEGACY bucket: rows whose donor can't be resolved (and
  // old handover breakdowns written before payments were split by donor type).
  const AVAIL_CATS = ['shop', 'person', 'member', 'payment', 'bus', 'road', 'toto', 'received'];
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
    const mine = function (r) { return ck(r) === String(ident); };
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
    // chanda is split by DONOR TYPE (দোকান/ব্যক্তি/সদস্য) exactly the way
    // daily is split by road/toto/bus — same granularity on both sides.
    // A payment whose donor isn't in this dataset falls back to 'payment'.
    const partyType = {};
    (data.parties || []).forEach(function (p) { if (p && p.id) partyType[p.id] = p.type; });
    (data.payments || []).filter(mine).forEach(function (r) {
      const ty = partyType[r.partyId];
      add(['shop', 'person', 'member'].indexOf(ty) >= 0 ? ty : 'payment', splitOf(r));
    });
    (data.daily || []).filter(mine).forEach(function (r) {
      add(['road', 'toto', 'bus'].indexOf(r.type) >= 0 ? r.type : 'road', splitOf(r));
    });
    const isTo = function (h) { return String(h.toId || h.to || '?') === String(ident); };
    const isFrom = function (h) { return String(h.fromId || h.from || '?') === String(ident); };
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
      // Spending is split by money type just like collecting: a bill paid by
      // UPI must come off UPI, not cash. Legacy rows (no split fields) keep
      // the old all-cash assumption so existing books don't shift.
      const s = splitOf(e);
      // `srcCat` says which pot it came out of (asked at entry time); a
      // collection expense implies its own round; otherwise fall back to the
      // fixed-order drain.
      const target = (e.srcCat && AVAIL_CATS.indexOf(e.srcCat) >= 0) ? e.srcCat
        : ((e.source === 'collection' && AVAIL_CATS.indexOf(e.collectionType) >= 0) ? e.collectionType : null);
      if (target && cats[target]) {
        cats[target].cash -= s.cash; cats[target].upi -= s.upi;
      } else {
        drain(cats, s.cash, 'cash'); drain(cats, s.upi, 'upi');
      }
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

  // ---- permissions -------------------------------------------------------
  // What an admin can grant per user, stored as a CSV in the Users sheet's
  // `entries` column. EMPTY MEANS ALL, so a freshly approved collector is never
  // accidentally locked out of everything.
  //
  // One key per thing a person actually collects — the same six categories the
  // home screen, the handover sheet and the ledger tabs use, so a permission and
  // what it unlocks are always the same word. Bus sits with the new-entry types
  // (it names a donor and issues a receipt); road/toto are the street rounds.
  //
  // Deliberately NOT permissions, because everyone needs them to do the job:
  //   চাঁদা নেওয়া (a later instalment from a donor anyone may have created),
  //   জমা দেওয়া (handover), আমার entry / সংশোধন, বাকি (the dues list).
  // `review` is not an entry kind — it gates the cashier's correction desk —
  // but it rides the same field so granting stays one screen for the admin.
  const ENTRY_KINDS = ['shop', 'person', 'member', 'bus', 'road', 'toto'];
  const PERM_KEYS = ENTRY_KINDS.concat(['review']);
  // Which permission key a row needs, from the row itself. Stores with no key
  // are common to everyone.
  function permForRow(store, row) {
    if (store === 'parties') return ENTRY_KINDS.indexOf(String(row && row.type)) >= 0 ? String(row.type) : null;
    if (store === 'daily') return ENTRY_KINDS.indexOf(String(row && row.type)) >= 0 ? String(row.type) : null;
    // a collection expense is spent out of a round the person is running, so it
    // rides that round's permission; general puja expenses are cashier-only and
    // gated separately.
    if (store === 'expenses' && String(row && row.source) === 'collection') {
      return ENTRY_KINDS.indexOf(String(row.collectionType)) >= 0 ? String(row.collectionType) : null;
    }
    return null;
  }
  function permAllowed(user, key) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    if (!key) return true; // common to everyone
    const set = String(user.entries || '').split(',').filter(Boolean);
    return !set.length || set.indexOf(key) >= 0; // empty = all
  }
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
      const tot = {}, nameBy = {}, cashBy = {}, upiBy = {};
      money.forEach(function (r) {
        const k = ck(r); if (r.collector) nameBy[k] = r.collector;
        tot[k] = (tot[k] || 0) + (Number(r.amount) || 0);
        const sp = splitOf(r);
        cashBy[k] = (cashBy[k] || 0) + sp.cash; upiBy[k] = (upiBy[k] || 0) + sp.upi;
      });
      const rows = Object.keys(tot).map(function (k) {
        return { collector: nameBy[k] || k, total: tot[k], cash: cashBy[k] || 0, upi: upiBy[k] || 0 };
      }).sort(function (a, b) { return b.total - a.total; });
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
        const sp = splitOf(e);
        return { date: e.date, subject: e.subject || '—', desc: e.desc,
                 amount: Number(e.amount) || 0, cash: sp.cash, upi: sp.upi,
                 srcCat: e.srcCat || (e.source === 'collection' ? e.collectionType : '') || '',
                 spentBy: e.spentBy, source: e.source };
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      const subAgg = {};
      rows.forEach(function (r) {
        const s = r.subject || '—';
        if (!subAgg[s]) subAgg[s] = { subject: s, total: 0, count: 0, cash: 0, upi: 0 };
        subAgg[s].total += r.amount; subAgg[s].count += 1;
        subAgg[s].cash += r.cash; subAgg[s].upi += r.upi;
      });
      const bySubject = Object.keys(subAgg).map(function (k) { return subAgg[k]; })
        .sort(function (a, b) { return b.total - a.total; });
      return { rows: rows, bySubject: bySubject, total: sum(rows, function (r) { return r.amount; }),
               totalCash: sum(rows, function (r) { return r.cash; }),
               totalUpi: sum(rows, function (r) { return r.upi; }) };
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
                allowedReports: allowedReports, REPORT_IDS: REPORT_IDS,
                roleOf: roleOf, rowRole: rowRole,
                ENTRY_KINDS: ENTRY_KINDS, PERM_KEYS: PERM_KEYS,
                permForRow: permForRow, permAllowed: permAllowed };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Aggregate = api;
})();
