// Pure aggregation logic shared by local dashboard, central report, tests.
(function () {
  function sum(arr, f) { return arr.reduce(function (a, x) { return a + (Number(f ? f(x) : x) || 0); }, 0); }

  // Voided (corrected) records are kept for audit in a separate `voids` store,
  // each pointing at a targetId. Aggregation drops those ids everywhere.
  // A62 (audit 2.8): money here is NOT always whole rupees. NumParse turns
  // "দেড়" into 1.5 and "আড়াই" into 2.5, so fractions genuinely enter the book,
  // and once they do, binary floating point does what it always does:
  // 0.1 + 0.2 is 0.30000000000000004. Every comparison below was written as if
  // that could not happen.
  //
  //   paid > pledged     → a false `overpaid` of 4×10⁻¹⁷, on the 🩺 desk, for
  //                        the season (until A61 it could not even be cleared)
  //   inHand < 0         → a false `negative_inhand` accusing somebody of
  //                        handing over more than they held
  //   due > 0            → a donor who has paid in full sits in the dues list
  //                        and gets a WhatsApp reminder for four femto-rupees
  //
  // Half a paisa. Below that, two amounts are the same amount.
  const EPS = 0.005;
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
  // A75 (audit #3 F1): the money engine had NO year logic at all — `.year`
  // appeared zero times in this file. That was fine while every device held one
  // book, and stops being fine at midnight on 31 December.
  //
  // The chain, verified: a collector's year comes from the system clock (the
  // year field is admin-only, so `ck_year` is never written on their phone) →
  // on 1 Jan `pullCentral` sees the year change and discards the central
  // snapshot → it full-pulls 2027, which is EMPTY until rollover runs → but
  // IndexedDB still holds every 2026 row. `viewData` merges local over central
  // and no 2026 id matches any 2027 id, so A49's guard never fires. Reproduced:
  // the collector is shown last season's ₹5,000 as cash still in their hand,
  // and last season's handover as still awaiting confirmation.
  //
  // A different wrong number on every handset, at the exact moment a new
  // season's book is asking to be trusted. This is the class A49 was written to
  // kill, re-created by the calendar.
  //
  // Filtering HERE rather than clearing IndexedDB on the year change: a wipe
  // would also destroy any row that had not synced, and the year boundary is
  // precisely when nobody is watching. A filter cannot lose anything — a row
  // from another book simply stops counting in this one.
  function ofYear(rows, year) {
    if (!year) return rows || [];
    return (rows || []).filter(function (r) {
      // a row with no year at all predates the field; treat it as belonging to
      // the book being read rather than silently dropping money
      return !r || r.year === undefined || r.year === null || r.year === '' || Number(r.year) === year;
    });
  }
  // A138: THE day of a row, whatever shape the date arrived in.
  //
  // A date written as "2026-08-18" becomes a real DATE CELL in the Sheet, and
  // Apps Script hands it back as a UTC datetime: "2026-08-17T18:30:00.000Z" —
  // which IS 18 August in IST. So the same row carries a plain day while it is
  // still local and unsynced, and an ISO datetime for the previous UTC day once
  // it has synced. Every `date === 'YYYY-MM-DD'` and every `.slice(0, 10)` in
  // this app was therefore false — or off by one — for the synced half of the
  // book, and the harness never showed it because a fake server returns exactly
  // the strings it was given.
  //
  // What that silently cost, before this existed:
  //   · the duplicate-payment guard could not see a duplicate that had already
  //     synced — the one case where two collectors are most likely to have
  //     entered the same donor twice;
  //   · the 🩺 desk's same-day duplicate groups split into two keys, one per
  //     shape, so neither reached the threshold;
  //   · "আজ আমার তোলা" and the ledger's my-today-first order read the previous
  //     UTC day, so between midnight and 5:30 am IST they answered for
  //     yesterday.
  // createdAt goes through here too: it is a UTC instant, and .slice(0, 10) on
  // it names the wrong day for anything entered after 5:30 am IST… of the next
  // day. One rule, one place.
  function dayOf(v) {
    if (v === 0 || v === null || v === undefined || v === '') return '';
    const s = String(v);
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;            // already a plain IST day
    const d = new Date(s);
    if (isNaN(d.getTime())) return s;                        // unparseable: never blank a value
    return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
  }
  function activeData(data, year) {
    const v = voidedIds(data);
    const keep = function (rows) { return ofYear(rows, year).filter(function (r) { return r && !v[r.id]; }); };
    return { parties: keep(data.parties), payments: keep(data.payments), daily: keep(data.daily),
             expenses: keep(data.expenses), handovers: keep(data.handovers), voids: data.voids || [],
             // messages deliberately NOT carried: activeData runs on every money
             // aggregation (inHandRows calls it once per collector), and a
             // season of chat made that 11× slower for rows that have nothing
             // to do with money. messageFeed filters its own voids instead.
             // corrections pass through (not voidable) — mirrors Code.gs
             // activeData_ (regression A8) EXCEPT for the deliberate messages
             // difference above. Do not "restore the mirror" without reading
             // both sides' notes — that reflex is exactly how A8 happened.
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

  // A handover has THREE outcomes, and every reader must agree on which is which.
  // Before v4.5.0 six sites each wrote `status !== 'confirmed'` inline, meaning
  // "pending" — so the day a `rejected` row could exist, all six would have gone
  // on deducting it from the sender for ever: money the cashier had refused would
  // sit in limbo, out of the handover ceiling, in nobody's pocket.
  // Named predicates, used everywhere, so that can't be re-introduced by hand.
  function hoConfirmed(h) { return h.status === 'confirmed'; }
  function hoRejected(h) { return h.status === 'rejected'; }
  // "in transit": sent, not yet answered. The sender still answers for it.
  function hoPending(h) { return !hoConfirmed(h) && !hoRejected(h); }

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
      if (hoConfirmed(h)) {
        handed[fromK] = (handed[fromK] || 0) + amt;
        received[toK] = (received[toK] || 0) + amt;
      } else if (hoPending(h)) {
        // NOT `else`: a REJECTED parcel is not awaiting anything. `else` would
        // leave it in the central "কার হাতে কত" report's "confirm বাকি" column
        // for the rest of the season, for money the cashier had refused.
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
    // Who this person handed money TO, by name and category. Nothing is derived
    // — the outgoing row already names the receiver and carries the breakdown,
    // so this is just that record read back the way a person would ask for it:
    // "কাকে কত জমা দিয়েছি".
    const toWhom = {};
    const bump = function (h, catKey, part, isPending) {
      const id = String(h.toId || h.to || '?');
      const e = toWhom[id] || (toWhom[id] = { id: id, name: h.to || id, cash: 0, upi: 0, pending: 0, cats: {} });
      if (h.to) e.name = h.to;
      if (isPending) { e.pending += part.cash + part.upi; return; } // in transit, not yet theirs
      e.cash += part.cash; e.upi += part.upi;
      const c = e.cats[catKey] || (e.cats[catKey] = { cash: 0, upi: 0 });
      c.cash += part.cash; c.upi += part.upi;
    };
    (data.handovers || []).forEach(function (h) {
      const amt = Number(h.amount) || 0;
      if (isTo(h) && hoConfirmed(h)) received += amt;
      if (!isFrom(h)) return;
      // A REJECTED parcel was handed to nobody: it belongs in neither
      // `handedOver` nor `pending`, and it must not appear under "কাকে কত জমা
      // দিয়েছি" either — the money never left. It shows up as its own ❌ slot,
      // built from handoverSlots().
      if (hoRejected(h)) return;
      const isPending = hoPending(h);
      if (isPending) pending += amt; else handedOver += amt;
      let bd = null;
      try { const b = JSON.parse(h.breakdown || 'null'); if (b && typeof b === 'object') bd = b; } catch (e) {}
      if (bd) {
        Object.keys(bd).forEach(function (k) {
          bump(h, k, { cash: Number(bd[k].cash) || 0, upi: Number(bd[k].upi) || 0 }, isPending);
        });
      } else { // pre-breakdown row: amount only, no category to attribute it to
        bump(h, 'other', splitOf(h), isPending);
      }
    });
    const handedTo = Object.keys(toWhom).map(function (id) {
      const e = toWhom[id];
      return { id: e.id, name: e.name, cash: e.cash, upi: e.upi, total: e.cash + e.upi, pending: e.pending,
               cats: Object.keys(e.cats).filter(function (k) { return e.cats[k].cash || e.cats[k].upi; })
                 .map(function (k) { return { key: k, cash: e.cats[k].cash, upi: e.cats[k].upi }; }) };
    }).filter(function (e) { return e.total > 0 || e.pending > 0; })
      .sort(function (a, b) { return (b.total + b.pending) - (a.total + a.pending); });
    const expenseTotal = myExp.reduce(function (a, e) { return a + (Number(e.amount) || 0); }, 0);
    // A106: `subject` travels with the row. It is what an expense IS — আলো,
    // প্যান্ডেল, ঢাক — and the comment beside it is optional for every subject
    // but "অন্য কিছু". Dropping it here left 🧾 আমার খরচ with nothing to print
    // but a date and an amount whenever somebody skipped the comment.
    //
    // Code.gs mirrors this function and still projects {date, desc, amount}.
    // Harmless today: the only thing that ships it is the `myReport` action,
    // which no client calls (the app computes this from its own snapshot). Worth
    // matching the next time Code.gs is redeployed for a reason of its own.
    const expenses = myExp.map(function (e) {
      return { date: e.date, subject: e.subject, desc: e.desc, amount: Number(e.amount) || 0 }; })
      .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    return { collected: collected, cash: cash, upi: upi, dailyByType: dailyByType,
             received: received, handedOver: handedOver, pending: pending, handedTo: handedTo,
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
  // 'other' is the pot of last resort and MUST stay last: money that has no
  // named source lands there and stays there. Before it existed, an unsourced
  // expense was spread over whatever pots happened to hold money at the moment
  // of calculation — so the same ₹198 bill sat under টোটো until a shop handover
  // arrived, then silently moved to দোকান. The total was always right; the
  // split was not reproducible.
  const AVAIL_CATS = ['shop', 'person', 'member', 'payment', 'bus', 'road', 'toto', 'received', 'other'];
  // The reserved source id for money a person collected themselves, as opposed
  // to a parcel handed to them by someone else. It can never collide with a
  // username: usernames are /^[a-z0-9._-]{3,20}$/ (Code.gs register).
  const OWN_SRC = '__own';
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
    if (amt > 0) { // nothing left to take from: park the rest in 'other'
      const e = cats.other || (cats.other = { cash: 0, upi: 0 });
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
    // A breakdown maps CATEGORY → {cash, upi}. Keys starting with `__` are
    // reserved metadata (a cashier's `__snap` records their position at the
    // moment of transfer) and must never be read as a category.
    const parseBd = function (h) {
      if (!h.breakdown) return null;
      try {
        const b = JSON.parse(h.breakdown);
        if (!b || typeof b !== 'object') return null;
        const out = {};
        Object.keys(b).forEach(function (k) { if (k.slice(0, 2) !== '__') out[k] = b[k]; });
        return Object.keys(out).length ? out : null;
      } catch (e) { return null; }
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
    // Where each parcel of money came from, kept alongside the category totals.
    // givers[srcId] = { name, cats: { cat: {cash, upi} } }, where OWN_SRC is the
    // money this person collected themselves. Nothing is inferred: an outgoing
    // handover records its source in `breakdown[cat].src`, because the giver
    // picked a named line on the handover sheet. Rows written before `src`
    // existed carry none, and are read as OWN_SRC — which is what they were.
    const givers = {};
    const moveSrc = function (srcId, name, cat, s) {
      const g = givers[srcId] || (givers[srcId] = { id: srcId, name: name || srcId, cats: {} });
      if (name) g.name = name;
      const e = g.cats[cat] || (g.cats[cat] = { cash: 0, upi: 0 });
      e.cash += s.cash; e.upi += s.upi;
    };
    (data.handovers || []).filter(function (h) { return h.status === 'confirmed'; }).forEach(function (h) {
      const bd = parseBd(h), s = splitOf(h);
      if (isTo(h)) {
        const from = String(h.fromId || h.from || '?');
        if (bd) Object.keys(bd).forEach(function (k) {
          const cat = AVAIL_CATS.indexOf(k) >= 0 ? k : 'received';
          const part = { cash: Number(bd[k].cash) || 0, upi: Number(bd[k].upi) || 0 };
          add(cat, part);
          moveSrc(from, h.from, cat, part);
        });
        else { add('received', s); moveSrc(from, h.from, 'received', s); }
      }
      if (isFrom(h)) {
        if (bd) Object.keys(bd).forEach(function (k) {
          const cat = AVAIL_CATS.indexOf(k) >= 0 ? k : 'received';
          add(cat, { cash: -(Number(bd[k].cash) || 0), upi: -(Number(bd[k].upi) || 0) });
          const src = bd[k].src;
          if (src && typeof src === 'object') {
            Object.keys(src).forEach(function (sid) {
              moveSrc(sid, null, cat, { cash: -(Number(src[sid].cash) || 0), upi: -(Number(src[sid].upi) || 0) });
            });
          } else { // pre-`src` row: it can only have been one's own money
            moveSrc(OWN_SRC, null, cat, { cash: -(Number(bd[k].cash) || 0), upi: -(Number(bd[k].upi) || 0) });
          }
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
      if (target) {
        // subtract from the NAMED pot even if it is empty — going negative there
        // is honest ("this pot owes"), and Hrishi's rule is that negatives get
        // squared up later by exchanging cash. Silently borrowing from another
        // category would hide it.
        const e = cats[target] || (cats[target] = { cash: 0, upi: 0 });
        e.cash -= s.cash; e.upi -= s.upi;
      } else {
        // only rows written before srcCat existed reach this
        drain(cats, s.cash, 'cash'); drain(cats, s.upi, 'upi');
      }
    });
    let cash = 0, upi = 0;
    Object.keys(cats).forEach(function (k) { cash += cats[k].cash; upi += cats[k].upi; });
    // Who has handed money to this person, and how much — GROSS, exactly as the
    // handover rows record it. Deliberately not "how much of theirs is still in
    // my pocket": once a cashier's money is pooled, saying which parcel a later
    // payment came out of would be a guess, and this ledger does not guess.
    // What is actually left is the `available` figure, computed straight from
    // the totals below.
    const byGiver = Object.keys(givers).filter(function (id) { return id !== OWN_SRC; })
      .map(function (id) {
        const g = givers[id];
        let gc = 0, gu = 0;
        Object.keys(g.cats).forEach(function (k2) { gc += g.cats[k2].cash; gu += g.cats[k2].upi; });
        return { id: g.id, name: g.name, cash: gc, upi: gu, total: gc + gu };
      }).filter(function (g) { return g.total > 0; })
      .sort(function (a, b) { return b.total - a.total; });
    return { cash: cash, upi: upi, byCat: cats, byGiver: byGiver };
  }

  // ---------------------------------------------------------------------------
  // আমার হিসাব — the model behind the personal summary screen.
  //
  // ONE rule decides every figure here: money on a handover that has not been
  // confirmed yet still belongs to the SENDER. The receiver has not
  // acknowledged it, so nobody else can be holding it, and if it were taken off
  // the sender too it would sit in no one's book at all — the central total
  // would silently shrink by that amount. So `hero` (what this person answers
  // for) counts pending-out money as still theirs, and the pending slot below
  // says so in words.
  //
  // The three handover slots are kept APART on purpose:
  //   pending    still inside `hero`, will leave it once confirmed
  //   confirmed  already gone from `hero`, kept only as proof
  //   rejected   never left `hero` — the money is back in play
  // `rejected` is bucketed by name rather than as "not confirmed", because
  // filing a rejection as pending would keep deducting it from the handover cap
  // for ever. No writer sets that status yet; this reader is ready for it.
  //
  // Invariant, asserted in tests: the group totals sum to hero.total exactly.
  // Nothing on this screen may ever be larger than the number at the top.
  const SUMMARY_GROUPS = [
    { key: 'entry', cats: ['shop', 'person', 'member', 'payment', 'bus'] },
    { key: 'daily', cats: ['road', 'toto'] },
    { key: 'other', cats: ['received', 'other'] },
  ];
  function slotOf(h) {
    return h.status === 'confirmed' ? 'confirmed' : h.status === 'rejected' ? 'rejected' : 'pending';
  }
  // {cash, upi, total, rows} for a list of handover rows, newest first.
  function parcel(rows) {
    let cash = 0, upi = 0;
    rows.forEach(function (h) { const s = splitOf(h); cash += s.cash; upi += s.upi; });
    return { cash: cash, upi: upi, total: cash + upi, rows: rows };
  }
  // Every handover this person is a party to, split by direction and slot.
  function handoverSlots(data, ident) {
    data = activeData(data);
    const me = String(ident);
    const out = { in: { pending: [], confirmed: [], rejected: [] },
                  out: { pending: [], confirmed: [], rejected: [] } };
    (data.handovers || []).forEach(function (h) {
      const to = String(h.toId || h.to || '?'), from = String(h.fromId || h.from || '?');
      // a row addressed to oneself would otherwise land in both directions
      if (from === me) out.out[slotOf(h)].push(h);
      else if (to === me) out.in[slotOf(h)].push(h);
    });
    const wrap = function (d) {
      return { pending: parcel(d.pending), confirmed: parcel(d.confirmed), rejected: parcel(d.rejected) };
    };
    return { in: wrap(out.in), out: wrap(out.out) };
  }
  function mySummary(data, ident, todayIso) {
    const av = myAvailable(data, ident);
    const ps = personalSummary(data, ident);
    const sl = handoverSlots(data, ident);
    // A136: collectors think in DAYS — the hero is all-time and tillNow is the
    // season, so "আজ কত তুললাম" had no answer on the money screen. The date
    // comes in as a parameter (never from a clock in here) so tests stay
    // deterministic; no date, no today block.
    let today = null;
    if (todayIso) {
      const d0 = String(todayIso);
      const act = activeData(data);
      const mine = function (r) { return ck(r) === String(ident); };
      const isToday = function (r) {
        return dayOf(r.date) === d0 || dayOf(r.createdAt) === d0;
      };
      const sum = function (rows) {
        return rows.filter(mine).filter(isToday)
          .reduce(function (a, r) { return a + (Number(r.amount) || 0); }, 0);
      };
      today = { collected: sum((act.payments || []).concat(act.daily || [])),
                expense: sum(act.expenses || []) };
    }
    const hero = { cash: av.cash, upi: av.upi, total: av.cash + av.upi };
    const groups = SUMMARY_GROUPS.map(function (g) {
      let cash = 0, upi = 0; const pots = [];
      g.cats.forEach(function (k) {
        const v = av.byCat[k];
        if (!v || !(v.cash || v.upi)) return;
        cash += v.cash; upi += v.upi;
        pots.push({ key: k, cash: v.cash, upi: v.upi, total: v.cash + v.upi });
      });
      pots.sort(function (a, b) { return b.total - a.total; });
      return { key: g.key, cash: cash, upi: upi, total: cash + upi, pots: pots };
    }).filter(function (g) { return g.pots.length; });
    return {
      hero: hero,
      groups: groups,
      today: today,
      // what hero becomes once every pending handover is confirmed
      afterApprove: hero.total - sl.out.pending.total,
      out: sl.out,
      incoming: sl.in,
      // season-to-date figures — a DIFFERENT clock from hero, labelled as such
      // on screen so nobody tries to reconcile the two.
      tillNow: { collected: ps.collected, received: ps.received,
                 expenseTotal: ps.expenseTotal, handedOver: ps.handedOver },
      expenses: ps.expenses || [],
    };
  }

  // ---------------------------------------------------------------------------
  // What can be handed over RIGHT NOW — a different question from "what do I
  // answer for", and it deliberately gives a smaller number.
  //
  // `myAvailable` counts an unconfirmed handover as still the sender's, which is
  // right for the books (see mySummary). But those notes are physically gone —
  // already in the cashier's pocket, waiting to be acknowledged — so offering
  // them again would let the same money be promised to two people.
  //
  // TWO independent leaks have to be plugged, and each needs its own clamp:
  //
  //  1. per pot — subtract that pot's own pending parcels, read from each
  //     handover's stored breakdown so the deduction lands in the right pot.
  //
  //  2. per money type, in total — a pot that went negative (its expenses
  //     outran it) is clamped to 0 for display, so the chips skip it entirely,
  //     yet the debt still reduces the cash actually in the pocket. Σ positive
  //     pots therefore overshoots by exactly the debt. `cash`/`upi` below come
  //     from the WHOLE-book figure minus pending, so they carry the debt; the
  //     caller must clamp the selection against them as well as per pot.
  //
  // Worked example (the case this was written for): 2,000 in the account,
  // 700 pending (person 300, toto 400), road overspent by 100.
  //   byCat free  → shop 📱800, person 💵200, bus 💵400, road —, toto —
  //   Σ chips     = 💵600 + 📱800 = 1,400   ← what the sheet used to offer
  //   cash/upi    = 💵500 + 📱800 = 1,300   ← what is really there
  // The 100 gap is the road debt. Both clamps, or the books can go negative.
  function handoverable(data, ident) {
    const av = myAvailable(data, ident);
    const pend = handoverSlots(data, ident).out.pending;
    const free = {};
    Object.keys(av.byCat).forEach(function (k) {
      free[k] = { cash: av.byCat[k].cash, upi: av.byCat[k].upi };
    });
    pend.rows.forEach(function (h) {
      let bd = null;
      try { bd = JSON.parse(h.breakdown || 'null'); } catch (e) { bd = null; }
      if (bd && typeof bd === 'object') {
        Object.keys(bd).forEach(function (k) {
          if (k.slice(0, 2) === '__') return; // reserved metadata, not a category
          const cat = AVAIL_CATS.indexOf(k) >= 0 ? k : 'received';
          if (!free[cat]) free[cat] = { cash: 0, upi: 0 };
          free[cat].cash -= Number(bd[k].cash) || 0;
          free[cat].upi -= Number(bd[k].upi) || 0;
        });
      } else {
        // legacy row with no breakdown: it names no pot, so it can only come
        // off the total. Same deterministic order the rest of the file uses.
        drain(free, splitOf(h).cash, 'cash');
        drain(free, splitOf(h).upi, 'upi');
      }
    });
    // negatives are honest in `myAvailable` but meaningless as an OFFER, so the
    // per-pot figures are clamped here; the debt survives in cash/upi below.
    const byCat = {};
    let debtCash = 0, debtUpi = 0;
    Object.keys(free).forEach(function (k) {
      const c = free[k].cash, u = free[k].upi;
      if (c < 0) debtCash -= c;
      if (u < 0) debtUpi -= u;
      byCat[k] = { cash: Math.max(0, c), upi: Math.max(0, u) };
    });
    // A20: a money type can be OVER-committed — send ₹500 cash pending, then a
    // ₹100 expense drains cash to ₹450. Math.max(0, 450−500) would throw the
    // −50 away, and the OTHER type's ceiling would quietly offer money whose
    // promise already exceeds the whole account (total promised > hero, books
    // go negative once everything confirms). The deficit in one type must come
    // off the other type's ceiling: in practice that parcel will be settled in
    // the other form, so the other form is what is spoken for.
    const defCash = Math.max(0, pend.cash - av.cash);
    const defUpi = Math.max(0, pend.upi - av.upi);
    const cash = Math.max(0, av.cash - pend.cash - defUpi);
    const upi = Math.max(0, av.upi - pend.upi - defCash);
    return { cash: cash, upi: upi, total: cash + upi, byCat: byCat,
             pendingOut: { cash: pend.cash, upi: pend.upi, total: pend.total },
             debt: { cash: debtCash, upi: debtUpi, total: debtCash + debtUpi } };
  }

  // The cashier's / admin's handover screen. They do NOT pick categories — money
  // pooled from many people has no honest category left — so this returns the
  // figures they read before typing an amount:
  //   collectedByCat  what THEY collected, category-wise (display only)
  //   byGiver         who has handed them money, gross (display only)
  //   totalIn         collected + received
  //   spent           their expenses
  //   handedOut       what they have already passed on
  //   available       totalIn − spent − handedOut  ← the cap on the amount box
  //
  // handedOut counts PENDING handovers as well as confirmed ones. Everywhere
  // else pending stays with the giver (the receiver has not acknowledged it,
  // so the giver still answers for it) — but for "what can I hand over right
  // now" that money is already out of the pocket, and counting it as available
  // would let the same notes be promised to two people.
  function cashierView(data, ident) {
    const d = activeData(data);
    const mine = function (r) { return ck(r) === String(ident); };
    const isTo = function (h) { return String(h.toId || h.to || '?') === String(ident); };
    const isFrom = function (h) { return String(h.fromId || h.from || '?') === String(ident); };
    const zero = function () { return { cash: 0, upi: 0 }; };
    const addTo = function (t, s2) { t.cash += s2.cash; t.upi += s2.upi; };

    const partyType = {};
    (d.parties || []).forEach(function (p) { if (p && p.id) partyType[p.id] = p.type; });
    const collectedByCat = {}, collected = zero();
    const put = function (cat, s2) {
      const e = collectedByCat[cat] || (collectedByCat[cat] = zero());
      addTo(e, s2); addTo(collected, s2);
    };
    (d.payments || []).filter(mine).forEach(function (r) {
      const ty = partyType[r.partyId];
      put(['shop', 'person', 'member'].indexOf(ty) >= 0 ? ty : 'payment', splitOf(r));
    });
    (d.daily || []).filter(mine).forEach(function (r) {
      put(['road', 'toto', 'bus'].indexOf(r.type) >= 0 ? r.type : 'road', splitOf(r));
    });

    const received = zero(), handedOut = zero(), pendingOut = zero(), byName = {};
    (d.handovers || []).forEach(function (h) {
      const s2 = splitOf(h);
      if (isTo(h) && hoConfirmed(h)) {
        addTo(received, s2);
        const id = String(h.fromId || h.from || '?');
        const g = byName[id] || (byName[id] = { id: id, name: h.from || id, cash: 0, upi: 0 });
        if (h.from) g.name = h.from;
        g.cash += s2.cash; g.upi += s2.upi;
      }
      // `available` is the cap on what this cashier may pass on, so pending
      // counts as already out (the notes are gone). A REJECTED parcel is the
      // opposite: it came back, so it must not be deducted at all — counting it
      // as pendingOut would shrink the cap for ever and strand the money.
      if (isFrom(h) && !hoRejected(h)) addTo(hoConfirmed(h) ? handedOut : pendingOut, s2);
    });
    const spent = zero();
    (d.expenses || []).filter(mine).forEach(function (e) { addTo(spent, splitOf(e)); });

    const totalIn = { cash: collected.cash + received.cash, upi: collected.upi + received.upi };
    const out = { cash: handedOut.cash + pendingOut.cash, upi: handedOut.upi + pendingOut.upi };
    const available = { cash: totalIn.cash - spent.cash - out.cash,
                        upi: totalIn.upi - spent.upi - out.upi };
    return {
      collectedByCat: collectedByCat, collected: collected,
      byGiver: Object.keys(byName).map(function (k) {
        const g = byName[k];
        return { id: g.id, name: g.name, cash: g.cash, upi: g.upi, total: g.cash + g.upi };
      }).filter(function (g) { return g.total > 0; })
        .sort(function (a, b) { return b.total - a.total; }),
      received: received, totalIn: totalIn, spent: spent,
      handedOut: handedOut, pendingOut: pendingOut, out: out,
      available: available, availableTotal: available.cash + available.upi,
    };
  }

  // One person's handover book: everything that came IN from other people and
  // everything that went OUT, in one place, newest first. Reads straight off
  // the handover rows — nothing here is derived, so it can never disagree with
  // what the other side sees.
  //
  // Each row carries whatever detail its sender recorded: a collector's rows
  // have `cats` (the per-category breakdown they picked), a cashier's have
  // `snap` (where they stood when they passed it on). Rows older than either
  // feature have neither, and simply show the amount.
  function handoverReport(data, ident) {
    const d = activeData(data);
    const me = String(ident);
    const zero = function () { return { cash: 0, upi: 0, total: 0 }; };
    const add = function (t, s2) { t.cash += s2.cash; t.upi += s2.upi; t.total += s2.cash + s2.upi; };
    const received = zero(), sent = zero(), pendingIn = zero(), pendingOut = zero();
    // Three outcomes, three buckets per direction. `rejected*` used to be folded
    // into `pending*`, which would have told the sender their money was still in
    // transit long after the cashier refused it.
    const rejectedIn = zero(), rejectedOut = zero();
    const rows = [];
    (d.handovers || []).forEach(function (h) {
      const to = String(h.toId || h.to || '?'), from = String(h.fromId || h.from || '?');
      const isIn = to === me, isOut = from === me;
      if (!isIn && !isOut) return;
      const s2 = splitOf(h);
      if (isIn) add(hoConfirmed(h) ? received : hoRejected(h) ? rejectedIn : pendingIn, s2);
      if (isOut) add(hoConfirmed(h) ? sent : hoRejected(h) ? rejectedOut : pendingOut, s2);
      let cats = [], snap = null;
      try {
        const b = JSON.parse(h.breakdown || 'null');
        if (b && typeof b === 'object') {
          if (b.__snap) snap = b.__snap;
          Object.keys(b).forEach(function (k) {
            if (k.slice(0, 2) === '__') return;
            const c = Number(b[k].cash) || 0, u = Number(b[k].upi) || 0;
            if (c || u) cats.push({ key: k, cash: c, upi: u });
          });
        }
      } catch (e) {}
      rows.push({
        id: h.id, dir: isIn ? 'in' : 'out',
        who: isIn ? (h.from || from) : (h.to || to),
        date: h.date || h.createdAt, status: h.status || 'pending',
        cash: s2.cash, upi: s2.upi, total: s2.cash + s2.upi,
        note: h.note || '', cats: cats, snap: snap,
        // why the receiver refused it — the sender's only clue about what to do
        rejectReason: h.rejectReason || '',
      });
    });
    rows.sort(function (a, b) {
      return String(b.date || '').localeCompare(String(a.date || ''));
    });
    return { received: received, sent: sent, pendingIn: pendingIn, pendingOut: pendingOut,
             rejectedIn: rejectedIn, rejectedOut: rejectedOut,
             // net is CONFIRMED money only: a pending or refused parcel has not
             // changed anyone's position yet, so folding it in here would make
             // the book disagree with the summary hero.
             net: { cash: received.cash - sent.cash, upi: received.upi - sent.upi,
                    total: received.total - sent.total },
             rows: rows };
  }

  // Committee chat. `mentions` is a CSV of usernames and/or group words; a
  // message is "for me" when it names me, names a group I am in, or is @all.
  // Group membership is decided here, not stored, so promoting somebody to
  // cashier immediately changes which past messages count as theirs.
  function mentionsMe(msg, me) {
    const m = String((msg && msg.mentions) || '').split(',').map(function (x) { return x.trim(); }).filter(Boolean);
    if (!m.length) return false;
    if (m.indexOf('all') >= 0) return true;
    if (m.indexOf(String(me.username)) >= 0) return true;
    if (m.indexOf('admin') >= 0 && me.role === 'admin') return true;
    if (m.indexOf('cashiers') >= 0 && (Number(me.cashier) === 1 || me.role === 'admin')) return true;
    return false;
  }
  // Newest last, the way a conversation reads. `unread` counts what arrived
  // after the marker this device last stored — messages you sent yourself are
  // never unread.
  function messageFeed(data, me, sinceIso) {
    const v = voidedIds(data);
    const rows = (data.messages || []).filter(function (r) { return r && !v[r.id]; })
      .sort(function (a, b) { return String(a.createdAt || '').localeCompare(String(b.createdAt || '')); });
    let unread = 0, mentioned = 0;
    rows.forEach(function (r) {
      const mine = String(r.collectorId || r.collector) === String(me.username);
      const isNew = !mine && String(r.createdAt || '') > String(sinceIso || '');
      r.unread = isNew;
      r.forMe = mentionsMe(r, me);
      if (isNew) { unread++; if (r.forMe) mentioned++; }
    });
    return { rows: rows, unread: unread, mentioned: mentioned };
  }

  // What the chat is costing. It adds NO extra requests (it rides the 60s pull),
  // so the thing that actually grows is the pull payload and the localStorage
  // snapshot every phone keeps. Budget: localStorage is ~5 MB and the snapshot
  // also holds parties/payments/daily, so ~600 KB of chat is the point where a
  // full pull on a cheap phone starts being felt.
  //
  // `perDay` is the last 24 hours, because "growing fast" is the thing worth
  // catching early — a book that reaches 2,000 over a season is fine; one that
  // does it in three days is not.
  const CHAT_WATCH = { count: 1500, bytes: 300 * 1024, perDay: 400 };
  const CHAT_HIGH = { count: 3000, bytes: 600 * 1024, perDay: 800 };
  function chatLoad(data, nowIso) {
    const rows = (data && data.messages) || [];
    let bytes = 0;
    rows.forEach(function (r) { bytes += (String(r.text || '').length * 2) + 160; }); // text + the row's own columns
    const cut = new Date(new Date(nowIso || new Date().toISOString()).getTime() - 86400000).toISOString();
    let perDay = 0;
    rows.forEach(function (r) { if (String(r.createdAt || '') >= cut) perDay++; });
    const over = function (lim) { return rows.length >= lim.count || bytes >= lim.bytes || perDay >= lim.perDay; };
    return { count: rows.length, bytes: bytes, perDay: perDay,
             level: over(CHAT_HIGH) ? 'high' : (over(CHAT_WATCH) ? 'watch' : 'ok') };
  }

  // What the home screen offers this person. Pure, so the answer can be tested
  // instead of read off the markup — "one permission and the default screens
  // come back" is a promise worth pinning down.
  //
  // Three kinds of tile:
  //   granted  — one per collection category, from their own grants
  //   common   — everyone who has been set up at all: taking a later
  //              instalment, handing money over, their own handover book
  //   role     — the cashier's desk and the correction desk, from role + grant
  // `opts.holding`      this person has money in hand RIGHT NOW
  // `opts.staleVersion`  this phone is behind the server and we know it
  //
  // A36: both of these break an assumption the original rule rested on. The
  // rule "nothing granted → only the card" was written with the reason
  // "somebody who collects nothing has no money to hand over" — true when
  // grants could only be ADDED. 🧹 clearUserGrants can now take them away from
  // somebody already holding cash, and the version lock can freeze somebody
  // mid-round. In both cases the money is real and already in a pocket, so the
  // way to hand it in must stay: unrecorded or stranded cash cannot be undone,
  // and no permission rule is worth that.
  //
  // Note what is NOT restored: 'payments' — taking a further instalment is
  // COLLECTING, which is exactly what they may no longer do.
  function homeTiles(user, opts) {
    opts = opts || {};
    const out = { entry: [], daily: [], common: [], role: [], setUp: false, blocked: false, exiting: false, frozen: false };
    if (!user) return out;
    const granted = function (k) { return permAllowed(user, k); };
    // Behind the server: no new entries by anybody, admin included — a stale
    // client writing into a book the server has moved on from is the thing
    // being prevented, and an admin's stale client is no safer than anyone's.
    if (opts.staleVersion) {
      out.blocked = true;
      if (opts.holding) out.common = ['handover', 'hbook'];
      return out;
    }
    // A110: the admin has paused entries for everybody. Its own flag rather
    // than reusing `blocked`, because that one draws "your phone is behind,
    // update it" — a true sentence about a different problem, and the fastest
    // way to send twelve people chasing an update that will not help.
    //
    // 🤝 জমা দেওয়াও থামে: handing cash to a cashier is money moving, and the
    // server holds those rows like any other. A tile that survives a rule the
    // server enforces is the dead-button failure this project keeps naming.
    // 📗 জমা-খাতা stays — it only reads.
    if (opts.frozen) {
      out.frozen = true;
      out.common = ['hbook'];
      return out;
    }
    // A78: the committee stood this person down. Their permission lists are
    // empty, so without this they would fall into the branch below and be shown
    // "ask the admin for permissions" — sending them to argue with the admin
    // about a decision the committee already took. What they may still do is
    // exactly two things, and both of them are here: hand in what they hold,
    // and take the balance of the donors they brought in.
    if (String(user.access || '') === 'exiting') {
      out.exiting = true;
      out.common = ['payments', 'handover', 'hbook'];
      return out;
    }
    out.setUp = user.role === 'admin' ||
      String(user.entries || '').split(',').filter(Boolean).length > 0;
    if (!out.setUp) {
      if (opts.holding) out.common = ['handover', 'hbook'];
      return out; // nothing granted → the "ask the admin" card (+ a way to hand in cash)
    }
    ['shop', 'person', 'member', 'bus'].forEach(function (k) { if (granted(k)) out.entry.push(k); });
    ['road', 'toto'].forEach(function (k) { if (granted(k)) out.daily.push(k); });
    const isCashier = Number(user.cashier) === 1 || user.role === 'admin';
    if (isCashier) out.daily.push('expense');
    // these need no grant — a collector must always be able to take an
    // instalment from a donor they wrote down, and to hand their money over
    out.common = ['payments', 'handover', 'hbook'];
    if (isCashier) out.role.push('cashier');
    if (isCashier && granted('review')) out.role.push('review');
    // 🩺 the anomaly desk. Was reachable ONLY by tapping the reconcile banner on
    // 📊 রিপোর্ট — so the "something needs you" dot had no tile to sit on, and a
    // cashier who never opened reports never learned the desk existed.
    if (isCashier) out.role.push('anomalies');
    // the committee-member register — its own grant, so it can be handed to one
    // person without also handing them the correction desk or the cash screens
    if (granted('memberadmin')) out.role.push('memberadmin');
    return out;
  }

  // A80: the digits that identify a person, whatever they typed around them.
  // Lifted out of app.js so reconcile can use the SAME rule the entry-time
  // warning uses — two different notions of "same number" would disagree about
  // which donors are duplicates, and the desk would argue with the form.
  // (A62 already paid for this lesson once, with three hand-rolled copies.)
  function normPhone(s) {
    return String(s || '').replace(/[\s\-()]/g, '').replace(/^(\+?91|0)/, '');
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
    }).filter(function (x) { return x.due > EPS; })
      .sort(function (a, b) { return b.due - a.due; });
  }

  // A22: the same instalment entered twice. A slow phone, a collector unsure the
  // save landed, one more tap — two rows with DIFFERENT uuids, both perfectly
  // well-formed, so every id-based defence (upsert, duplicate_id, the sync
  // queue) sails past. The donor's dues drop by money nobody paid and the
  // collector's in-hand rises by money they never took.
  //
  // reconcile's own invariant cannot see it: Σ in-hand === collected − expenses
  // still BALANCES, because both rows are genuinely "collected". Only a total
  // passing `pledged` trips `overpaid`, so a part-payment double stays silent —
  // and part-payments are the normal case.
  //
  // Signature: same party + same amount + same day. Deliberately NOT a block —
  // a donor really can pay ₹500 twice in one day — so both callers ask rather
  // than refuse. `exceptId` lets the edit path exclude the row being replaced.
  function samePaymentsOn(data, partyId, amount, date, exceptId) {
    const amt = Number(amount) || 0;
    const day = dayOf(date);
    if (!partyId || !amt || !day) return [];
    return (activeData(data).payments || []).filter(function (p) {
      return String(p.partyId) === String(partyId) &&
             (Number(p.amount) || 0) === amt &&
             dayOf(p.date) === day &&
             (!exceptId || String(p.id) !== String(exceptId));
    });
  }

  // Data-integrity check: the money must always reconcile, and structural
  // anomalies (that would cause disputes) are surfaced. Handovers are internal
  // transfers, so across everyone they net out — hence the invariant:
  //   Σ (cash in hand)  ===  total collected − total expenses.
  // `rules.positionMax` = { positionId: cap } for capped committee posts, from
  // Lists.maxMap(). Optional: without it the post check is simply skipped, so
  // every existing caller keeps working unchanged. The screen that assigns a
  // post already blocks going over the cap — this catches the case it cannot,
  // two admins assigning সভাপতি while both are offline.
  function reconcile(data, rules) {
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

    // A62: rounding was wrong in BOTH directions — ₹100.40 vs ₹100.60 rounds
    // to 100 vs 101 and screams about 20 paisa, while ₹100.49 vs ₹99.51 both
    // round to 100 and hides very nearly a whole rupee. An epsilon is stricter
    // where it matters and quieter where it does not.
    if (Math.abs(totalInHand - expected) > EPS) {
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
    // A21: a row whose amount disagrees with its own cash+upi split (or a
    // handover whose stored breakdown does not sum to its amount) makes the two
    // clocks diverge silently: personalSummary/inHandRows read `amount`,
    // myAvailable/the pots read the split — so "আমার হাতে" and its own ভাগ stop
    // agreeing and NOTHING said why. The app never writes such a row (flows
    // compute amount = cash+upi); a hand-edited Sheet cell or a buggy import
    // can. Reconcile's whole job is to catch broken entries loudly.
    const splitCheck = function (rows, store) {
      (rows || []).forEach(function (r) {
        if (isCashOnly(r)) return; // legacy: no split fields, amount IS the cash
        const amt = Number(r.amount) || 0;
        const sp = (Number(r.cashAmount) || 0) + (Number(r.upiAmount) || 0);
        if (Math.round(sp) !== Math.round(amt)) {
          anomalies.push({ type: 'split_mismatch', store: store, id: r.id, amount: amt, split: sp });
        }
      });
    };
    splitCheck(payments, 'payments'); splitCheck(daily, 'daily');
    splitCheck(expenses, 'expenses'); splitCheck(data.handovers, 'handovers');
    (data.handovers || []).forEach(function (h) {
      if (!h.breakdown) return;
      let bd = null; try { bd = JSON.parse(h.breakdown); } catch (e) { return; }
      if (!bd || typeof bd !== 'object') return;
      let bsum = 0, cats = 0;
      Object.keys(bd).forEach(function (k) {
        if (k.slice(0, 2) === '__') return; // reserved metadata (a cashier's snapshot)
        cats++; bsum += (Number(bd[k].cash) || 0) + (Number(bd[k].upi) || 0);
      });
      if (cats && Math.round(bsum) !== Math.round(Number(h.amount) || 0)) {
        anomalies.push({ type: 'breakdown_mismatch', id: h.id, amount: Number(h.amount) || 0, breakdownSum: bsum });
      }
    });
    // A22: pairs already in the book — one anomaly per EXTRA copy, so the banner
    // counts what a human would count ("two identical ₹500s" = one thing to look
    // at). Grouped first, then judged: the answer is stamped on whichever row was
    // entered second, but array order is not insertion order (IndexedDB returns
    // by key), so testing "does THIS row carry dupOk" flagged the innocent twin
    // half the time. A group is settled if ANY member carries the answer.
    const dupGroups = {};
    payments.forEach(function (p) {
      const day = dayOf(p.date);
      if (!p.partyId || !(Number(p.amount) || 0) || !day) return;
      const k = String(p.partyId) + '|' + (Number(p.amount) || 0) + '|' + day;
      (dupGroups[k] || (dupGroups[k] = [])).push(p);
    });
    Object.keys(dupGroups).forEach(function (k) {
      const g = dupGroups[k];
      if (g.length < 2) return;
      // the collector was ASKED at entry time and said "yes, a separate
      // instalment" — do not keep asking the admin the same question for the
      // rest of the season. A banner that cries wolf stops being read.
      if (g.some(function (p) { return Number(p.dupOk) === 1; })) return;
      g.slice(1).forEach(function (p) {
        anomalies.push({ type: 'possible_duplicate_payment', id: p.id, firstId: g[0].id,
                         partyId: p.partyId, amount: Number(p.amount) || 0, date: String(p.date).slice(0, 10) });
      });
    });
    // A61 (audit 2.2): the same guard for `daily`, which had none. dupGroups
    // above keys on partyId and daily rows have no party, so a double-entered
    // road, toto or BUS collection raised nothing at all — and a bus collection
    // is handed a printed receipt, so entering it twice means two serials in
    // two people's hands for one payment.
    //
    // Two different keys, deliberately, because "the same collection twice"
    // means two different things here:
    //   bus  → the BUS is the identity. Two collectors can each write down the
    //          same bus, so the collector must NOT be part of the key.
    //   road/toto → there is no identity beyond who was walking. Two collectors
    //          each doing a ₹500 road round on one day is completely ordinary,
    //          so the collector MUST be part of the key or the desk would fill
    //          with noise on day one — the failure this whole screen exists to
    //          avoid (A19/A23).
    const dailyGroups = {};
    (daily || []).forEach(function (r) {
      const day = dayOf(r.date);
      const amt = Number(r.amount) || 0;
      if (!amt || !day || !r.type) return;
      const k = r.type === 'bus'
        ? 'bus|' + String(r.busName || '').trim().toLowerCase() + '|' +
          String(r.busNumber || '').replace(/\s/g, '').toLowerCase() + '|' + amt + '|' + day
        : ck(r) + '|' + r.type + '|' + amt + '|' + day;
      (dailyGroups[k] || (dailyGroups[k] = [])).push(r);
    });
    Object.keys(dailyGroups).forEach(function (k) {
      const g = dailyGroups[k];
      if (g.length < 2) return;
      // settled if ANY member carries the answer — array order is not insertion
      // order, so asking "does THIS row carry it" flags the innocent twin half
      // the time (the A22 lesson, which cost a release to learn once).
      if (g.some(function (r) { return Number(r.dupOk) === 1; })) return;
      g.slice(1).forEach(function (r) {
        anomalies.push({ type: 'possible_duplicate_daily', id: r.id, firstId: g[0].id,
                         dailyType: r.type, busName: r.busName || '', busNumber: r.busNumber || '',
                         amount: Number(r.amount) || 0, date: String(r.date || '').slice(0, 10) });
      });
    });
    // A80: the SAME donor written down twice, caught by phone number.
    //
    // The entry form already warns about this, and it warns well — same phone
    // means same household, so it names the existing donor rather than saying
    // "a name matched". But that check reads THIS DEVICE's book, and the case
    // where it matters most is the one it cannot see: two collectors working
    // the same street OFFLINE. Neither has the other's row, neither is warned,
    // both sync later, and nothing looks at it again. The pledge is counted
    // twice, the target is wrong, and the shopkeeper is asked twice.
    //
    // Phone ONLY, never name. "মা তারা স্টোর" can honestly be three shops and a
    // desk full of innocent twins is a desk nobody reads (A19/A23). A blank
    // phone matches nothing — most emphatically not another blank one.
    const phoneGroups = {};
    // `parties` is already the live set — reconcile runs activeData() first, so
    // a removed donor is gone before this sees it.
    (parties || []).forEach(function (p) {
      if (!p) return;
      const ph = normPhone(p.phone);
      if (ph.length < 10) return; // a partial number is not an identity
      (phoneGroups[ph] || (phoneGroups[ph] = [])).push(p);
    });
    Object.keys(phoneGroups).forEach(function (ph) {
      const g = phoneGroups[ph];
      if (g.length < 2) return;
      // settled if ANY member carries the answer — the A22 lesson: array order
      // is not insertion order, so asking "does THIS row carry it" flags the
      // innocent twin half the time.
      if (g.some(function (p) { return Number(p.dupOk) === 1; })) return;
      g.slice(1).forEach(function (p) {
        anomalies.push({ type: 'possible_duplicate_party', id: p.id, firstId: g[0].id, phone: ph });
      });
    });
    // Party paid more than pledged. A pledge of ZERO means no pledge was ever
    // agreed — committee members are registered without one and simply give what
    // they give — so "more than pledged" is meaningless there. Without this guard
    // EVERY member contribution would raise an anomaly and the 🩺 desk would fill
    // with noise, which is how a useful banner stops being read (A19/A23).
    parties.forEach(function (p) {
      const pledged = Number(p.pledged) || 0;
      if (!pledged) return;
      // A61 (audit 2.3): somebody has looked at this and said it is fine.
      // Giving more than you promised is a normal, good thing a donor does —
      // and the documented A3 case (two collectors calling at one shop) lands
      // here too. Before this the line could not be cleared by anyone, so it
      // sat on the 🩺 desk for the whole season. money-model.md:172 already
      // says why that is worse than not detecting it: "A count nobody can act
      // on trains people to ignore the banner."
      if (Number(p.pledgeOk) === 1) return;
      const paid = paidByParty[p.id] || 0;
      if (paid - pledged > EPS) {
        anomalies.push({ type: 'overpaid', id: p.id, partyId: p.id, party: p.name, pledged: pledged, paid: paid });
      }
    });
    // handed over more than held
    rows.forEach(function (r) {
      if (r.inHand < -EPS) anomalies.push({ type: 'negative_inhand', collector: r.collector, inHand: r.inHand });
    });
    // More people in a one-person post than the post allows.
    const posMax = (rules && rules.positionMax) || null;
    // A115: the holders are handed IN now, because a committee post lives on the
    // app account, not on the member row. Reading p.position here would be worse
    // than useless: rows written before this change still carry an old value, so
    // the desk would raise a clash nobody can clear — and a marker that cannot
    // be cleared is how a desk stops being read.
    //
    // No holders passed = the check is skipped, exactly like no posMax. A
    // detector that cannot see its own subject must say nothing, not guess.
    const holders = (rules && rules.positionHolders) || null;
    // An empty roster needs no special case, and I tried to give it one: a map
    // with nothing in it can never exceed a cap, so "not synced yet" and
    // "nobody holds anything" produce the same silence. The extra branch was a
    // guard no test could tell apart from its own absence, which is the kind
    // that rots. Omitting positionHolders entirely IS observable, and that is
    // the distinction kept.
    if (posMax && holders) {
      Object.keys(posMax).forEach(function (pid) {
        // 0 means "as many as you like" EVERYWHERE else in this app; a reconcile
        // that read it as "nobody allowed" would be a trap for the next caller.
        const cap = Number(posMax[pid]) || 0;
        if (cap <= 0) return;
        const who = holders[pid] || [];
        if (who.length > cap) {
          anomalies.push({ type: 'position_over_max', position: pid, max: cap,
                           count: who.length, who: who });
        }
      });
    }
    // A115: a committee member with no app account. The account is required
    // now — it is what keeps a person's post in one place — but rows written
    // before that rule are still here, and they cannot be saved again until
    // somebody links one. Surfaced HERE rather than left to fail at the moment
    // somebody opens the row to fix a phone number.
    parties.forEach(function (p) {
      if (p.type !== 'member' || String(p.appUser || '')) return;
      anomalies.push({ type: 'member_no_account', id: p.id, partyId: p.id, party: p.name || p.id });
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
  // `entries` column. A permission is something you are GIVEN: an empty field
  // grants nothing, and a newly approved collector can do nothing until the
  // admin says what they collect. This matches `reports`, which has always
  // worked that way — `entries` was the odd one out, treating empty as "all",
  // which meant approving somebody silently handed them the whole app.
  //
  // One key per thing a person actually collects — the same six categories the
  // home screen, the handover sheet and the ledger tabs use, so a permission and
  // what it unlocks are always the same word. Bus sits with the new-entry types
  // (it names a donor and issues a receipt); road/toto are the street rounds.
  //
  // Deliberately NOT permissions, because everyone needs them to do the job:
  //   চাঁদা নেওয়া from a donor THEY wrote down, জমা দেওয়া (handover),
  //   আমার entry / সংশোধন, বাকি (the dues list).
  // Reaching somebody ELSE's donor is a separate grant ('otherdonor').
  // `review` is not an entry kind — it gates the cashier's correction desk —
  // but it rides the same field so granting stays one screen for the admin.
  const ENTRY_KINDS = ['shop', 'person', 'member', 'bus', 'road', 'toto'];
  // 'review' is the cashier's correction desk; 'otherdonor' is reaching donors
  // somebody ELSE wrote down, to take a later instalment. Neither is an entry
  // kind, but both ride the same field so granting stays one screen.
  // 'memberadmin' is the committee-member REGISTER — adding a member, setting
  // their post and linking their app account. Deliberately separate from the
  // 'member' entry grant, which only lets someone COLLECT from members: one
  // person keeps the register, many people take the money.
  const PERM_KEYS = ENTRY_KINDS.concat(['review', 'otherdonor', 'memberadmin']);
  // What a committee POST may carry, so granting is one dropdown per person
  // instead of ~16 checkboxes each. Mirrors Code.gs POSITION_PERM_KEYS.
  //
  // 'admin' is absent and must stay absent: admin is not a committee post, it is
  // power over the whole system, and if সম্পাদক carried it then making somebody
  // secretary would silently hand them everything. That grant stays one person
  // at a time, by the board's decision.
  //
  // 'cashier' IS here — কোষাধ্যক্ষ literally means it — and it is the only
  // money-moving key a post can hold, so the server audits every change.
  //
  // The three spaces are stored FLAT in one comma list and split back apart by
  // membership, so they must stay disjoint; tests/run.js asserts that, because a
  // key in two of them would land in the wrong bucket without a word.
  const POSITION_PERM_KEYS = PERM_KEYS.concat(REPORT_IDS).concat(['cashier']);
  // Split a post's flat permission list into the three fields the app actually
  // reads. One place decides which bucket a key belongs to — the UI, the server
  // resolver and the tests all come back here rather than each guessing.
  function splitPositionPerms(perms) {
    const list = (typeof perms === 'string' ? perms.split(',') : (perms || [])).filter(Boolean);
    const out = { entries: [], reports: [], cashier: 0 };
    list.forEach(function (k) {
      if (k === 'cashier') out.cashier = 1;
      else if (PERM_KEYS.indexOf(k) >= 0) out.entries.push(k);
      else if (REPORT_IDS.indexOf(k) >= 0) out.reports.push(k);
    });
    return out;
  }
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
    if (!key) return true; // common to everyone — handover, own donors, dues…
    return String(user.entries || '').split(',').indexOf(key) >= 0;
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
      }).filter(function (r) { return r.due > EPS; })
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
      // ROAD AND TOTO ONLY. Bus is a new entry, not a street round — it names a
      // donor and issues a receipt — so it lives in the ledger next to the
      // shops and people, the same place the home screen and the handover sheet
      // put it. Counting it here would show it twice under two groupings.
      const isRound = function (r) { return r.type === 'road' || r.type === 'toto'; };
      const agg = {};
      (d.daily || []).filter(isRound).forEach(function (r) { const k = r.date + '|' + r.type; agg[k] = (agg[k] || 0) + (Number(r.amount) || 0); });
      const rows = Object.keys(agg).map(function (k) {
        const p = k.split('|');
        return { date: p[0], type: p[1], amount: agg[k] };
      }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
      const byType = { road: 0, toto: 0 };
      (d.daily || []).filter(isRound).forEach(function (r) { byType[r.type] += Number(r.amount) || 0; });
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

  const api = { computeTotals: computeTotals, duesList: duesList, normPhone: normPhone,
                inHandRows: inHandRows, personalSummary: personalSummary,
                myAvailable: myAvailable, reconcile: reconcile, computeReport: computeReport,
                allowedReports: allowedReports, REPORT_IDS: REPORT_IDS,
                roleOf: roleOf, rowRole: rowRole,
                ENTRY_KINDS: ENTRY_KINDS, PERM_KEYS: PERM_KEYS,
                POSITION_PERM_KEYS: POSITION_PERM_KEYS, splitPositionPerms: splitPositionPerms,
                permForRow: permForRow, permAllowed: permAllowed, OWN_SRC: OWN_SRC,
                cashierView: cashierView, handoverReport: handoverReport,
                mySummary: mySummary, handoverSlots: handoverSlots, handoverable: handoverable,
                samePaymentsOn: samePaymentsOn, dayOf: dayOf,
                mentionsMe: mentionsMe, messageFeed: messageFeed,
                activeData: activeData, chatLoad: chatLoad, homeTiles: homeTiles,
                // A60: exported because js/app.js was rebuilding this same map
                // by hand at five separate call sites, each with slightly
                // different guards. "What has been cancelled?" must have ONE
                // answer, or a screen quietly disagrees with the arithmetic.
                voidedIds: voidedIds };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.Aggregate = api;
})();
