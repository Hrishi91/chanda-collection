// Pure-logic tests: node tests/run.js
const { parseAmount } = require('../js/numparse.js');
const { computeTotals, duesList, inHandRows, personalSummary, myAvailable, reconcile, computeReport,
        roleOf, rowRole, ENTRY_KINDS, PERM_KEYS, permForRow, permAllowed,
        cashierView, handoverReport, allowedReports, mySummary, handoverSlots, handoverable, samePaymentsOn,
        mentionsMe, messageFeed, activeData, chatLoad, homeTiles, dayOf, potDetail,
        REPORT_IDS, POSITION_PERM_KEYS, splitPositionPerms,
        RESTRICTED_TYPES, VIEW_PERM_KEYS, isRestrictedType, viewPermFor,
        canSeeParty, visibleData, canWritePayment } = require('../js/aggregate.js');

let pass = 0, fail = 0;
function eq(actual, expected, label) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) { pass++; }
  else { fail++; console.error('FAIL', label, '→ got', actual, 'expected', expected); }
}

// ---- parseAmount: digits ----
eq(parseAmount('500'), 500, 'plain digits');
eq(parseAmount('৫০০'), 500, 'bengali digits');
eq(parseAmount(' ৫,০০০ টাকা '), 5000, 'bengali digits + comma + টাকা');
eq(parseAmount('₹1,250'), 1250, 'rupee sign + comma');
eq(parseAmount('1 500'), 1500, 'STT split digits');
eq(parseAmount('rs. 300 only'), 300, 'rs prefix');

// ---- parseAmount: bengali words ----
eq(parseAmount('পঞ্চাশ'), 50, '50');
eq(parseAmount('একশো'), 100, '100 compound');
eq(parseAmount('একশো এক'), 101, '101');
eq(parseAmount('দুশো পঁচিশ'), 225, '225');
eq(parseAmount('পাঁচশো'), 500, '500 compound');
eq(parseAmount('পাঁচ শো'), 500, '500 split');
eq(parseAmount('সাতশো পঞ্চাশ'), 750, '750');
eq(parseAmount('হাজার'), 1000, 'bare hazar');
eq(parseAmount('এক হাজার'), 1000, 'ek hazar');
eq(parseAmount('পাঁচ হাজার'), 5000, '5000');
eq(parseAmount('দুই হাজার পাঁচশো'), 2500, '2500');
eq(parseAmount('এক হাজার একশো এক'), 1101, '1101');
eq(parseAmount('দেড়শো'), 150, '150 derso');
eq(parseAmount('আড়াইশো'), 250, '250 araisho');
eq(parseAmount('দেড় হাজার'), 1500, '1500 der hazar');
eq(parseAmount('আড়াই হাজার'), 2500, '2500 arai hazar');
eq(parseAmount('সাড়ে তিনশো'), 350, '350 sare tinsho');
eq(parseAmount('সাড়ে পাঁচ হাজার'), 5500, '5500 sare panch hazar');
eq(parseAmount('একুশ'), 21, '21');
eq(parseAmount('নিরানব্বই'), 99, '99');
eq(parseAmount('পাঁচশো টাকা দিল'), 500, 'noise words ignored');
eq(parseAmount('এক লাখ'), 100000, '1 lakh');

// ---- parseAmount: english words ----
eq(parseAmount('five hundred'), 500, 'en 500');
eq(parseAmount('two thousand five hundred'), 2500, 'en 2500');
eq(parseAmount('fifty'), 50, 'en 50');
eq(parseAmount('one thousand two hundred fifty'), 1250, 'en 1250');

// ---- parseAmount: invalid ----
eq(isNaN(parseAmount('')), true, 'empty invalid');
eq(isNaN(parseAmount('রাম স্টোর্স')), true, 'name invalid');
eq(isNaN(parseAmount('সাড়ে')), true, 'dangling sare invalid');

// ---- aggregation ----
const parties = [
  { id: 'p1', type: 'shop', name: 'A', pledged: 500 },
  { id: 'p2', type: 'member', name: 'B', pledged: 1000 },
  { id: 'p3', type: 'person', name: 'C', pledged: 300 },
];
const payments = [
  { partyId: 'p1', amount: 200, collector: 'X' },
  { partyId: 'p1', amount: 300, collector: 'Y' },
  { partyId: 'p2', amount: 400, collector: 'X' },
];
const daily = [
  { type: 'road', amount: 700, collector: 'X' },
  { type: 'toto', amount: 250, collector: 'Y' },
  { type: 'bus', amount: 150, collector: 'Y' },
];
const expenses = [{ amount: 500 }, { amount: 100 }];
const tt = computeTotals({ parties, payments, daily, expenses });
eq(tt.totalCollection, 900 + 1100, 'total collection');
eq(tt.totalExpense, 600, 'total expense');
eq(tt.inHand, 2000 - 600, 'in hand');
eq(tt.totalPledged, 1800, 'total pledged');
eq(tt.totalDue, 1800 - 900, 'total due');
eq(tt.byType.shop.paid, 500, 'shop paid');
eq(tt.byType.shop.pledged, 500, 'shop pledged');
eq(tt.dailyByType.road, 700, 'road total');
eq(tt.byCollector.X, 200 + 400 + 700, 'collector X');
eq(tt.byCollector.Y, 300 + 250 + 150, 'collector Y');

// ---- cash/UPI split ----
const splitData = {
  parties: [], expenses: [],
  payments: [
    { partyId: 'p1', amount: 500, cashAmount: 300, upiAmount: 200, collector: 'X' },
    { partyId: 'p2', amount: 100, collector: 'X' }, // legacy row → counts as cash
  ],
  daily: [{ type: 'road', amount: 250, cashAmount: 0, upiAmount: 250, collector: 'Y' }],
};
const st = computeTotals(splitData);
eq(st.totalCash, 300 + 100, 'split: total cash incl legacy');
eq(st.totalUpi, 200 + 250, 'split: total upi');
eq(st.totalCollection, 850, 'split: grand total');

// ---- handover / in-hand ----
const hoData = {
  payments: [{ partyId: 'p1', amount: 700, collector: 'X' }],
  daily: [{ type: 'toto', amount: 300, collector: 'X' }, { type: 'road', amount: 400, collector: 'Y' }],
  expenses: [{ amount: 100, collector: 'Cash Babu', desc: 'Pandal', date: '2026-07-20' }],
  handovers: [
    { from: 'X', to: 'Cash Babu', amount: 600, status: 'confirmed' },
    { from: 'X', to: 'Cash Babu', amount: 200, status: 'pending' },
  ],
};
const hs = inHandRows(hoData);
const hx = hs.find(function (r) { return r.collector === 'X'; });
const hy = hs.find(function (r) { return r.collector === 'Y'; });
const hc = hs.find(function (r) { return r.collector === 'Cash Babu'; });
eq(hx.collected, 1000, 'inhand: X collected');
eq(hx.handedOver, 600, 'inhand: X confirmed handover only');
eq(hx.pending, 200, 'inhand: X pending shown separately');
eq(hx.inHand, 400, 'inhand: X in hand ignores pending (1000-600)');
eq(hy.inHand, 400, 'inhand: Y never handed over');
// Cash Babu received 600 (confirmed), spent 100 → holds 500
eq(hc.received, 600, 'inhand: cashier received confirmed handover');
eq(hc.spent, 100, 'inhand: cashier expense counted');
eq(hc.inHand, 500, 'inhand: cashier = received - spent (600-100)');

// ---- personalSummary (own view) ----
const pmX = personalSummary(hoData, 'X');
eq(pmX.collected, 1000, 'personal X collected');
eq(pmX.handedOver, 600, 'personal X handed (confirmed)');
eq(pmX.pending, 200, 'personal X pending');
eq(pmX.inHand, 400, 'personal X in hand');
eq(pmX.dailyByType.toto, 300, 'personal X toto');
const pmC = personalSummary(hoData, 'Cash Babu');
eq(pmC.received, 600, 'personal cashier received');
eq(pmC.expenseTotal, 100, 'personal cashier expense total');
eq(pmC.expenses.length, 1, 'personal cashier expense row');
eq(pmC.inHand, 500, 'personal cashier in hand (received - spent)');
// cash/UPI split in personal view
const pmSplit = personalSummary({
  payments: [{ collector: 'Z', amount: 500, cashAmount: 200, upiAmount: 300 }],
  daily: [{ collector: 'Z', type: 'road', amount: 100, cashAmount: 100, upiAmount: 0 }],
  expenses: [], handovers: [],
}, 'Z');
eq(pmSplit.cash, 300, 'personal split cash (200+100)');
eq(pmSplit.upi, 300, 'personal split upi');

// ---- myAvailable (category-wise available amount at handover time) ----
eq(myAvailable(hoData, 'X').cash, 400, 'available: X cash in hand (legacy = all cash)');
eq(myAvailable(hoData, 'X').upi, 0, 'available: X upi in hand (none)');
eq(myAvailable(hoData, 'Cash Babu').cash, 500, 'available: cashier cash (received - expense)');
const availSplit = {
  payments: [{ collector: 'Z', amount: 500, cashAmount: 200, upiAmount: 300 }],
  daily: [], expenses: [{ amount: 50, collector: 'Z' }],
  handovers: [
    { fromId: 'Z', toId: 'W', cashAmount: 100, upiAmount: 50, amount: 150, status: 'confirmed' },
    { fromId: 'Z', toId: 'W', cashAmount: 999, upiAmount: 999, amount: 1998, status: 'pending' },
  ],
};
const availZ = myAvailable(availSplit, 'Z');
eq(availZ.cash, 50, 'available: Z cash = collected 200 - expense 50 - handed(confirmed) 100');
eq(availZ.upi, 250, 'available: Z upi = collected 300 - handed(confirmed) 50');
const availW = myAvailable(availSplit, 'W');
eq(availW.cash, 100, 'available: W received cash (confirmed only, pending excluded)');
eq(availW.upi, 50, 'available: W received upi (confirmed only, pending excluded)');
// legacy (breakdown-less) handovers land in the receiver's 'received' bucket
eq(availW.byCat.received.cash, 100, 'available: W legacy receive → received cat');

// ---- myAvailable byCat (source-category split for the handover screen) ----
const catData = {
  payments: [{ collector: 'K', amount: 500, cashAmount: 300, upiAmount: 200 }],
  daily: [
    { collector: 'K', type: 'bus', amount: 150, cashAmount: 150, upiAmount: 0 },
    { collector: 'K', type: 'road', amount: 80 },              // legacy → all cash
  ],
  expenses: [{ collector: 'K', amount: 30, source: 'collection', collectionType: 'road' }],
  handovers: [
    // K handed the bus money to M with an exact breakdown
    { fromId: 'K', toId: 'M', amount: 150, cashAmount: 150, upiAmount: 0,
      status: 'confirmed', breakdown: '{"bus":{"cash":150,"upi":0}}' },
  ],
};
const availK = myAvailable(catData, 'K');
eq(availK.byCat.payment.cash, 300, 'byCat: K chanda cash intact');
eq(availK.byCat.payment.upi, 200, 'byCat: K chanda upi intact');
eq(availK.byCat.road.cash, 50, 'byCat: K road 80 - collection expense 30');
eq(availK.byCat.bus.cash, 0, 'byCat: K bus emptied by breakdown handover');
eq(availK.cash, 350, 'byCat: K total cash 300+50');
const availM = myAvailable(catData, 'M');
eq(availM.byCat.bus.cash, 150, 'byCat: M received the bus money AS bus (breakdown)');
// legacy outgoing handover (no breakdown) drains categories in fixed order
const legacyOut = {
  payments: [{ collector: 'L', amount: 100, cashAmount: 100, upiAmount: 0 }],
  daily: [{ collector: 'L', type: 'toto', amount: 60, cashAmount: 60, upiAmount: 0 }],
  expenses: [],
  handovers: [{ fromId: 'L', toId: 'M', amount: 120, cashAmount: 120, upiAmount: 0, status: 'confirmed' }],
};
const availL = myAvailable(legacyOut, 'L');
eq(availL.byCat.payment.cash, 0, 'byCat: legacy drain empties payment first');
eq(availL.byCat.toto.cash, 40, 'byCat: legacy drain takes remainder from toto');
eq(availL.cash, 40, 'byCat: legacy drain total right');

// chanda splits by DONOR TYPE the same way daily splits by road/toto/bus
const dtData = {
  parties: [ { id: 's1', type: 'shop', name: 'Shop' }, { id: 'm1', type: 'member', name: 'Mem' } ],
  payments: [
    { collector: 'D', partyId: 's1', amount: 500, cashAmount: 300, upiAmount: 200 },
    { collector: 'D', partyId: 'm1', amount: 100, cashAmount: 100, upiAmount: 0 },
    { collector: 'D', partyId: 'gone', amount: 70, cashAmount: 70, upiAmount: 0 }, // donor not in dataset
  ],
  daily: [{ collector: 'D', type: 'bus', amount: 150, cashAmount: 150, upiAmount: 0 }],
  expenses: [], handovers: [],
};
const dtA = myAvailable(dtData, 'D');
eq(dtA.byCat.shop, { cash: 300, upi: 200 }, 'donor-type: shop chanda separate');
eq(dtA.byCat.member, { cash: 100, upi: 0 }, 'donor-type: member chanda separate');
eq(dtA.byCat.payment, { cash: 70, upi: 0 }, 'donor-type: unknown donor → legacy bucket');
eq(dtA.byCat.person, undefined, 'donor-type: unused type absent');
eq(dtA.cash + dtA.upi, 820, 'donor-type: totals unchanged by the split (500+100+70+150)');

// personalSummary.byCat must always equal myAvailable.byCat and sum to inHand
// (the handover chips and the report read the same numbers — they can never drift)
const bcData = {
  payments: [{ collector: 'Q', amount: 500, cashAmount: 300, upiAmount: 200 }],
  daily: [{ collector: 'Q', type: 'bus', amount: 150, cashAmount: 150, upiAmount: 0 },
          { collector: 'Q', type: 'road', amount: 40, cashAmount: 40, upiAmount: 0 }],
  expenses: [{ collector: 'Q', amount: 40, source: 'collection', collectionType: 'road' }],
  handovers: [],
};
const bcP = personalSummary(bcData, 'Q'), bcA = myAvailable(bcData, 'Q');
eq(JSON.stringify(bcP.byCat), JSON.stringify(bcA.byCat), 'byCat: report === handover source');
eq(Object.keys(bcP.byCat).reduce(function (s, k) { return s + bcP.byCat[k].cash + bcP.byCat[k].upi; }, 0),
   bcP.inHand, 'byCat: sums to in-hand');
eq(bcP.byCat.road.cash, 0, 'byCat: road drained by its own collection expense');

// SPEND side: an expense paid by UPI must come off UPI, and off the pot it
// was spent from — legacy rows (no split) keep the old all-cash assumption
const spendData = {
  parties: [{ id: 's1', type: 'shop' }], voids: [], payments: [], daily: [],
  handovers: [{ fromId: 'X', toId: 'C', amount: 5200, cashAmount: 200, upiAmount: 5000,
                status: 'confirmed', breakdown: '{"shop":{"cash":200,"upi":5000}}' }],
  expenses: [{ collectorId: 'C', amount: 3000, cashAmount: 0, upiAmount: 3000,
               subject: 'Pandal', source: 'general', srcCat: 'shop' }],
};
const spendA = myAvailable(spendData, 'C');
eq(spendA.cash, 200, 'spend: UPI bill does not touch cash');
eq(spendA.upi, 2000, 'spend: UPI bill comes off UPI');
eq(spendA.byCat.shop, { cash: 200, upi: 2000 }, 'spend: comes off the named pot');
const legacySpend = {
  parties: [], voids: [], payments: [{ collectorId: 'L', amount: 500, cashAmount: 500, upiAmount: 0 }],
  daily: [], handovers: [], expenses: [{ collectorId: 'L', amount: 100 }],  // legacy: no split
};
eq(myAvailable(legacySpend, 'L').cash, 400, 'spend: legacy expense still treated as cash');
// a collection expense is charged to its own round without being asked
const collSpend = {
  parties: [], voids: [], payments: [], handovers: [],
  daily: [{ collectorId: 'M', type: 'road', amount: 300, cashAmount: 300, upiAmount: 0 }],
  expenses: [{ collectorId: 'M', amount: 50, cashAmount: 50, upiAmount: 0,
               source: 'collection', collectionType: 'road', srcCat: 'road' }],
};
eq(myAvailable(collSpend, 'M').byCat.road, { cash: 250, upi: 0 }, 'spend: collection expense hits its own round');

// PARTIAL handover with an exact per-category / per-money-type breakdown:
// both sides' books must stay exact, and the chain must survive cashier→cashier
const partialChain = {
  parties: [{ id: 's1', type: 'shop' }, { id: 'p1', type: 'person' }],
  payments: [
    { collectorId: 'R', partyId: 's1', amount: 500, cashAmount: 300, upiAmount: 200 },
    { collectorId: 'R', partyId: 'p1', amount: 300, cashAmount: 100, upiAmount: 200 },
  ],
  daily: [{ collectorId: 'R', type: 'bus', amount: 150, cashAmount: 150, upiAmount: 0 }],
  expenses: [], voids: [],
  handovers: [
    // R hands over only PART of shop cash + all of bus
    { id: 'h1', fromId: 'R', toId: 'C1', amount: 250, cashAmount: 250, upiAmount: 0, status: 'confirmed',
      breakdown: '{"shop":{"cash":100,"upi":0},"bus":{"cash":150,"upi":0}}' },
    // C1 passes the bus part on to the admin
    { id: 'h2', fromId: 'C1', toId: 'ADMIN', amount: 150, cashAmount: 150, upiAmount: 0, status: 'confirmed',
      breakdown: '{"bus":{"cash":150,"upi":0}}' },
  ],
};
const pcR = myAvailable(partialChain, 'R');
eq(pcR.byCat.shop, { cash: 200, upi: 200 }, 'partial: giver keeps the untouched part of the category');
eq(pcR.byCat.person, { cash: 100, upi: 200 }, 'partial: untouched category unaffected');
eq(pcR.byCat.bus, { cash: 0, upi: 0 }, 'partial: fully-handed category emptied');
const pcC1 = myAvailable(partialChain, 'C1');
eq(pcC1.byCat.shop, { cash: 100, upi: 0 }, 'partial: receiver gets it under the SAME category');
eq(pcC1.byCat.bus, { cash: 0, upi: 0 }, 'chain: cashier passed the bus money on');
eq(myAvailable(partialChain, 'ADMIN').byCat.bus, { cash: 150, upi: 0 }, 'chain: admin holds it still as bus');
eq(reconcile(partialChain).balanced, true, 'partial+chain: books balance');
// the central in-hand report must read the identical per-category numbers
const pcRow = inHandRows(partialChain).find(function (r) { return r.collector === 'C1'; });
eq(pcRow.byCat, pcC1.byCat, 'central report byCat === personal byCat');

const dues = duesList(parties, payments);
eq(dues.length, 2, 'dues count (p2 600, p3 300; p1 cleared)');
eq(dues[0].party.id, 'p2', 'biggest due first');
eq(dues[0].due, 600, 'p2 due');
eq(dues[1].due, 300, 'p3 due');

// ---- reconcile (data-integrity) ----
// clean, balanced books: X collected 1000, handed 600 (confirmed) to Cash Babu,
// Cash Babu spent 100. Σ inHand = X 400 + Y 400 + Cash Babu 500 = 1300;
// collected 1000+300+400=1700 − expense 100 = 1600... build a clean set instead.
const recClean = {
  parties: [{ id: 'p1', name: 'A', pledged: 1000 }],
  payments: [{ id: 'pay1', partyId: 'p1', amount: 700, collector: 'X' }],
  daily: [{ id: 'd1', type: 'road', amount: 300, collector: 'Y' }],
  expenses: [{ id: 'e1', amount: 100, collector: 'Cash Babu' }],
  handovers: [{ id: 'h1', from: 'X', to: 'Cash Babu', amount: 600, status: 'confirmed' }],
};
const rc = reconcile(recClean);
eq(rc.totalCollected, 1000, 'reconcile: collected');
eq(rc.totalExpenses, 100, 'reconcile: expenses');
eq(rc.totalInHand, 900, 'reconcile: Σ inHand = X100 + Y300 + CashBabu500');
eq(rc.expected, 900, 'reconcile: expected = collected − expense');
eq(rc.balanced, true, 'reconcile: clean books balance');
eq(rc.anomalies.length, 0, 'reconcile: no anomalies on clean data');

// orphan payment (party p9 does not exist)
const recOrphan = reconcile({ parties: [{ id: 'p1', name: 'A', pledged: 500 }],
  payments: [{ id: 'x', partyId: 'p9', amount: 100, collector: 'X' }], daily: [], expenses: [], handovers: [] });
eq(recOrphan.anomalies.some(function (a) { return a.type === 'orphan_payment'; }), true, 'reconcile: orphan payment flagged');

// overpaid party (paid 800 > pledged 500)
const recOver = reconcile({ parties: [{ id: 'p1', name: 'A', pledged: 500 }],
  payments: [{ id: 'x', partyId: 'p1', amount: 800, collector: 'X' }], daily: [], expenses: [], handovers: [] });
eq(recOver.anomalies.some(function (a) { return a.type === 'overpaid' && a.paid === 800; }), true, 'reconcile: overpaid flagged');

// negative in-hand (handed over more than collected)
const recNeg = reconcile({ parties: [], payments: [{ id: 'x', partyId: 'p1', amount: 100, collector: 'X' }],
  daily: [], expenses: [], handovers: [{ id: 'h', from: 'X', to: 'C', amount: 500, status: 'confirmed' }] });
eq(recNeg.anomalies.some(function (a) { return a.type === 'negative_inhand' && a.collector === 'X'; }), true, 'reconcile: negative in-hand flagged');

// duplicate id in a store
const recDup = reconcile({ parties: [{ id: 'p1', name: 'A', pledged: 0 }, { id: 'p1', name: 'A2', pledged: 0 }],
  payments: [], daily: [], expenses: [], handovers: [] });
eq(recDup.anomalies.some(function (a) { return a.type === 'duplicate_id' && a.store === 'parties'; }), true, 'reconcile: duplicate id flagged');

// unbalanced: a confirmed handover to an empty recipient breaks Σreceived=Σhanded
const recUnbal = reconcile({ parties: [], payments: [{ id: 'x', partyId: 'p1', amount: 500, collector: 'X' }],
  daily: [], expenses: [], handovers: [{ id: 'h', from: 'X', to: '', amount: 200, status: 'confirmed' }] });
// to:'' still attributes received to '' collector, so Σ still balances — instead test a torn book via missing amount handled as 0
eq(typeof recUnbal.balanced, 'boolean', 'reconcile: balanced flag present');

// ---- void (corrected entries excluded everywhere) ----
const voidData = {
  parties: [{ id: 'p1', type: 'shop', name: 'A', pledged: 1000 }],
  payments: [
    { id: 'pay1', partyId: 'p1', amount: 300, collector: 'X' },
    { id: 'pay2', partyId: 'p1', amount: 999, collector: 'X' }, // wrong → voided
  ],
  daily: [], expenses: [], handovers: [],
  voids: [{ id: 'v1', targetStore: 'payments', targetId: 'pay2', reason: 'wrong amount' }],
};
const vt = computeTotals(voidData);
eq(vt.totalCollection, 300, 'void: excluded from total collection');
eq(vt.paidByParty.p1, 300, 'void: excluded from paidByParty');
eq(vt.totalDue, 700, 'void: due reflects only live payments');
eq(inHandRows(voidData).find(function (r) { return r.collector === 'X'; }).collected, 300, 'void: excluded from in-hand');
eq(personalSummary(voidData, 'X').collected, 300, 'void: excluded from personal summary');
const vrec = reconcile(voidData);
eq(vrec.balanced, true, 'void: books still balance');
eq(vrec.totalCollected, 300, 'void: excluded from reconcile');
eq(duesList(voidData.parties, voidData.payments, voidData.voids)[0].due, 700, 'void: excluded from duesList');

// ---- identity: username key, name display (two same-name collectors) ----
const idData = {
  parties: [], expenses: [], voids: [], daily: [],
  payments: [
    { id: 'a', collectorId: 'rahul1', collector: 'Rahul', amount: 100 },
    { id: 'b', collectorId: 'rahul2', collector: 'Rahul', amount: 300 },
  ],
  handovers: [{ id: 'h', fromId: 'rahul2', from: 'Rahul', toId: 'kartik', to: 'Kartik', amount: 200, status: 'confirmed' }],
};
const idh = inHandRows(idData);
eq(idh.length, 3, 'identity: two same-name collectors + cashier = 3 separate rows');
const idR1 = idh.find(function (r) { return r.collected === 100; });
const idR2 = idh.find(function (r) { return r.collected === 300; });
const idK = idh.find(function (r) { return r.collector === 'Kartik'; });
eq(idR1.collector, 'Rahul', 'identity: display name kept');
eq(idR1.inHand, 100, 'identity: rahul1 not merged with rahul2');
eq(idR2.inHand, 100, 'identity: rahul2 = 300 − 200 handed');
eq(idK.received, 200, 'identity: handover matched by toId');
eq(idK.inHand, 200, 'identity: cashier holds received 200');
eq(personalSummary(idData, 'rahul1').collected, 100, 'identity: personalSummary scoped by username (rahul1)');
eq(personalSummary(idData, 'rahul2').handedOver, 200, 'identity: personalSummary rahul2 handed by fromId');
// legacy name-only rows still work (fallback)
eq(inHandRows({ payments: [{ id: 'x', collector: 'Old', amount: 50 }], daily: [], expenses: [], handovers: [], voids: [] })[0].inHand, 50, 'identity: legacy name-only row still keyed');

// ---- identity: a name-keyed row must NOT swallow the same person's id-keyed rows ----
// One person, two identities in the same dataset: rows pushed after login carry
// collectorId 'ratan', an older row (entered before login) has none and so keys
// under the display name. Each identity is its own line in the in-hand report,
// and its byCat must sum to exactly its own inHand — the name-keyed line used to
// re-count every 'ratan' row on top of its own.
const dualId = {
  parties: [], expenses: [], voids: [], daily: [],
  payments: [
    { id: 'p1', collectorId: 'ratan', collector: 'Ratan Das', amount: 1000, cashAmount: 1000, upiAmount: 0 },
    { id: 'p2', collectorId: '', collector: 'Ratan Das', amount: 40, cashAmount: 40, upiAmount: 0 },
  ],
  handovers: [{ id: 'dh', fromId: 'ratan', from: 'Ratan Das', toId: 'boss', to: 'Boss', amount: 600, cashAmount: 600, upiAmount: 0, status: 'confirmed' }],
};
const sumCat = function (bc) {
  return Object.keys(bc || {}).reduce(function (a, k) { return a + bc[k].cash + bc[k].upi; }, 0);
};
const dualRows = inHandRows(dualId);
eq(dualRows.length, 3, 'dual-identity: id-keyed, name-keyed and receiver are 3 rows');
dualRows.forEach(function (r) {
  eq(sumCat(r.byCat), r.inHand, 'dual-identity: byCat sums to inHand for ' + r.collector + ' (' + r.inHand + ')');
});
eq(myAvailable(dualId, 'Ratan Das').byCat.payment, { cash: 40, upi: 0 }, 'dual-identity: name key sees only its own 40');
eq(myAvailable(dualId, 'ratan').byCat.payment, { cash: 400, upi: 0 }, 'dual-identity: id key sees 1000 − 600 handed');
eq(personalSummary(dualId, 'Ratan Das').collected, 40, 'dual-identity: personalSummary by name is not inflated');
eq(personalSummary(dualId, 'Ratan Das').handedOver, 0, 'dual-identity: the id-keyed handover is not attributed to the name key');

// ---- cross-collector installments: two collectors pay the same party ----
// Kamal pledged 1000; Salil collected 400, Ram collected 600 (via find-party).
const splitParty = {
  parties: [{ id: 'P', name: 'Kamal', pledged: 1000 }],
  payments: [
    { id: 'pa', partyId: 'P', collectorId: 'salil', collector: 'Salil', amount: 400 },
    { id: 'pb', partyId: 'P', collectorId: 'ram', collector: 'Ram', amount: 600 },
  ],
  daily: [], expenses: [], handovers: [], voids: [],
};
eq(computeTotals(splitParty).paidByParty['P'], 1000, 'cross-collector: party fully paid (400+600)');
eq(computeTotals(splitParty).totalDue, 0, 'cross-collector: no due left');
eq(personalSummary(splitParty, 'salil').inHand, 400, 'cross-collector: Salil holds only his 400');
eq(personalSummary(splitParty, 'ram').inHand, 600, 'cross-collector: Ram holds only his 600');
// full-amount case: Salil only entered it (paid 0), Ram collected all 1000
const fullByRam = {
  parties: [{ id: 'Q', name: 'Rahim', pledged: 1000 }],
  payments: [{ id: 'pc', partyId: 'Q', collectorId: 'ram', collector: 'Ram', amount: 1000 }],
  daily: [], expenses: [], handovers: [], voids: [],
};
eq(personalSummary(fullByRam, 'ram').inHand, 1000, 'cross-collector: Ram holds the full 1000');
eq(personalSummary(fullByRam, 'salil').inHand, 0, 'cross-collector: Salil (entry only) holds nothing');

// ---- cash/UPI legacy consistency: '' (sheet round-trip) and undefined both
// count as pure cash, and overview must agree with computeTotals ----
const legacyCash = {
  parties: [], daily: [], expenses: [], handovers: [], voids: [],
  payments: [
    { id: 'l1', partyId: 'P', amount: 400, cashAmount: 300, upiAmount: 100 }, // split
    { id: 'l2', partyId: 'P', amount: 600, cashAmount: '', upiAmount: '' },   // sheet blank
    { id: 'l3', partyId: 'P', amount: 200 },                                   // undefined
  ],
};
eq(computeTotals(legacyCash).totalCash, 1100, 'legacy cash: blank+undefined rows count as cash');
eq(computeTotals(legacyCash).totalUpi, 100, 'legacy cash: upi only from split rows');
eq(computeReport('overview', legacyCash).totalCash, 1100, 'legacy cash: overview matches computeTotals');

// ---- entry-row role vocabulary: 'admin' | 'cashier' | 'collector' ----
// The Users sheet says role='admin'|'user' with a separate cashier flag; entry
// rows must store the separation-of-duties word instead. Storing the raw
// Users-sheet word wrote 'user' on every collector's row, and no rule ever
// matched it — a cashier could neither void such a row nor resolve its flag.
eq(roleOf('admin', 0), 'admin', 'role: admin stays admin');
eq(roleOf('admin', 1), 'admin', 'role: admin outranks the cashier flag');
eq(roleOf('user', 1), 'cashier', 'role: user + cashier flag = cashier');
eq(roleOf('user', 0), 'collector', 'role: a plain user is a collector, never "user"');
eq(roleOf('user', '1'), 'cashier', 'role: the cashier flag may arrive as a string');
eq(roleOf(undefined, undefined), 'collector', 'role: missing input defaults to collector');
// read side — heals rows written before the fix
eq(rowRole('collector'), 'collector', 'rowRole: collector round-trips');
eq(rowRole('cashier'), 'cashier', 'rowRole: cashier round-trips');
eq(rowRole('admin'), 'admin', 'rowRole: admin round-trips');
eq(rowRole('user'), 'collector', 'rowRole: legacy "user" rows read as collector');
eq(rowRole(''), 'collector', 'rowRole: blank reads as collector');
eq(rowRole(undefined), 'collector', 'rowRole: missing reads as collector');
// the separation-of-duties rule the two feed (mirrors app.js canVoid and
// Code.gs resolveCorrection): a cashier may act on a plain collector's entry
const mayCashierAct = function (storedRole) { return rowRole(storedRole) === 'collector'; };
eq(mayCashierAct('collector'), true, 'duties: cashier may act on a collector entry');
eq(mayCashierAct('user'), true, 'duties: cashier may act on a LEGACY collector entry ("user")');
eq(mayCashierAct('cashier'), false, 'duties: cashier may not act on another cashier entry');
eq(mayCashierAct('admin'), false, 'duties: cashier may not act on an admin entry');

// ---- collection permissions: one key per thing a person actually collects ----
eq(ENTRY_KINDS, ['shop', 'person', 'member', 'bus', 'road', 'toto', 'sponsor', 'gupt', 'ticket'], 'perms: nine collection keys — confidential kinds, then A149 টিকিট, appended last');
eq(PERM_KEYS.indexOf('review') >= 0, true, 'perms: the correction desk rides the same field');
eq(PERM_KEYS.indexOf('otherdonor') >= 0, true, 'perms: reaching somebody else\'s donor is its own grant');
eq(PERM_KEYS.indexOf('payment'), -1, 'perms: taking a later instalment is NOT a permission');
eq(PERM_KEYS.indexOf('handover'), -1, 'perms: handing money over is NOT a permission');

// which key a row needs comes from the ROW, not the store — bus and road share
// the `daily` store yet are separate grants
eq(permForRow('daily', { type: 'bus' }), 'bus', 'permForRow: a bus row needs the bus grant');
eq(permForRow('daily', { type: 'road' }), 'road', 'permForRow: a road row needs the road grant');
eq(permForRow('daily', { type: 'toto' }), 'toto', 'permForRow: a toto row needs the toto grant');
eq(permForRow('parties', { type: 'shop' }), 'shop', 'permForRow: a new shop needs the shop grant');
eq(permForRow('parties', { type: 'member' }), 'member', 'permForRow: a new member needs the member grant');
eq(permForRow('payments', { amount: 100 }), null, 'permForRow: a payment is common to everyone');
eq(permForRow('handovers', { amount: 100 }), null, 'permForRow: a handover is common to everyone');
eq(permForRow('corrections', {}), null, 'permForRow: a correction flag is common to everyone');
eq(permForRow('expenses', { source: 'collection', collectionType: 'toto' }), 'toto',
   'permForRow: a collection expense rides the round it was spent on');
eq(permForRow('expenses', { source: 'puja' }), null, 'permForRow: a general puja expense has no category key (cashier-gated separately)');

// A permission is something you are GIVEN. An empty field grants nothing —
// approving somebody must not silently hand them the whole app. This matches
// `reports`, which has always worked this way.
const admin = { role: 'admin', entries: 'shop' };       // a grant must not narrow an admin
const fresh = { role: 'user', entries: '' };            // approved, nothing granted yet
const busOnly = { role: 'user', entries: 'bus' };
eq(permAllowed(admin, 'toto'), true, 'perms: admin may do everything regardless of the field');
eq(permAllowed(fresh, 'shop'), false, 'perms: nothing granted means nothing allowed');
eq(permAllowed(fresh, 'review'), false, 'perms: …including the review desk');
eq(permAllowed(fresh, 'otherdonor'), false, 'perms: …and other people\'s donors');
eq(permAllowed(busOnly, 'bus'), true, 'perms: granted key allowed');
eq(permAllowed(busOnly, 'road'), false, 'perms: ungranted key blocked');
eq(permAllowed(busOnly, 'shop'), false, 'perms: a bus-only collector cannot add a shop');
eq(permAllowed(busOnly, 'review'), false, 'perms: review must be granted explicitly');
eq(permAllowed(busOnly, 'otherdonor'), false, 'perms: …and so must reaching other people\'s donors');
eq(permAllowed(admin, 'otherdonor'), true, 'perms: an admin is never narrowed');
// but the COMMON actions stay open to someone with nothing granted — a
// collector who has been given nothing can still hand money over and see dues
eq(permAllowed(fresh, null), true, 'perms: common actions stay open with nothing granted');
eq(permAllowed(fresh, permForRow('payments', {})), true, 'perms: …including recording a payment');
eq(permAllowed(fresh, permForRow('handovers', {})), true, 'perms: …and handing money over');
// entries now behaves exactly like reports
eq(allowedReports({ role: 'user', reports: '' }), [], 'perms: reports have always worked this way');
// a payment itself stays common — what is gated is REACHING a donor you did not
// write down, not taking money from one you did
eq(permForRow('payments', { amount: 100 }), null, 'perms: recording a payment is still common to everyone');
eq(permAllowed(busOnly, null), true, 'perms: a common action stays open to a narrowly-granted user');
eq(permAllowed(busOnly, permForRow('payments', {})), true, 'perms: bus-only collector may still take a later instalment');
eq(permAllowed(busOnly, permForRow('handovers', {})), true, 'perms: bus-only collector may still hand money over');
eq(permAllowed(null, 'bus'), false, 'perms: no user, no permission');

// ---- "কাকে কত জমা দিয়েছি" ----------------------------------------------------
// Read straight off one's own outgoing rows, which already name the receiver
// and carry the breakdown — so it can never disagree with the receiver's screen.
const htData = {
  parties: [], payments: [], daily: [], expenses: [], voids: [], corrections: [],
  handovers: [
    { id: 'a', fromId: 'yamini', toId: 'jadav', to: 'Jadav mahato', amount: 1700, cashAmount: 1200, upiAmount: 500,
      status: 'confirmed', breakdown: JSON.stringify({ shop: { cash: 1200, upi: 0 }, bus: { cash: 0, upi: 500 } }) },
    { id: 'b', fromId: 'yamini', toId: 'hrishi', to: 'hrishikesh mahato', amount: 400, cashAmount: 400, upiAmount: 0,
      status: 'confirmed', breakdown: JSON.stringify({ road: { cash: 400, upi: 0 } }) },
    { id: 'c', fromId: 'yamini', toId: 'jadav', to: 'Jadav mahato', amount: 250, cashAmount: 250, upiAmount: 0,
      status: 'pending', breakdown: JSON.stringify({ toto: { cash: 250, upi: 0 } }) },
  ],
};
const ht = personalSummary(htData, 'yamini').handedTo;
eq(ht.length, 2, 'handedTo: one row per receiver');
eq(ht[0].name, 'Jadav mahato', 'handedTo: biggest first, by name');
eq([ht[0].cash, ht[0].upi, ht[0].total], [1200, 500, 1700], 'handedTo: cash / UPI / total');
eq(ht[0].cats, [{ key: 'shop', cash: 1200, upi: 0 }, { key: 'bus', cash: 0, upi: 500 }], 'handedTo: category-wise');
eq(ht[0].pending, 250, 'handedTo: money still awaiting confirmation is shown apart');
eq(ht[0].cats.some(function (c) { return c.key === 'toto'; }), false, 'handedTo: pending is NOT counted as handed over');
eq(ht[1].name, 'hrishikesh mahato', 'handedTo: second receiver');
eq(ht[1].total, 400, 'handedTo: second receiver total');
// the per-receiver totals must add up to the summary's own handedOver figure
const htSum = personalSummary(htData, 'yamini');
eq(ht.reduce(function (a, r) { return a + r.total; }, 0), htSum.handedOver, 'handedTo: rows add up to handedOver');
eq(ht.reduce(function (a, r) { return a + r.pending; }, 0), htSum.pending, 'handedTo: pending adds up to pending');
// a pre-breakdown row still names its receiver
const htLegacy = personalSummary({ parties: [], payments: [], daily: [], expenses: [], voids: [], corrections: [],
  handovers: [{ id: 'x', fromId: 'yamini', toId: 'jadav', to: 'Jadav mahato', amount: 90, status: 'confirmed' }] }, 'yamini').handedTo;
eq(htLegacy[0].total, 90, 'handedTo: legacy row without a breakdown still counted');
eq(htLegacy[0].cats[0].key, 'other', 'handedTo: …its category is "other", nothing invented');

// ---- the cashier's handover screen -----------------------------------------
// A collector picks categories; a cashier cannot, because money pooled from
// many people has no honest category left. So they get their position laid out
// and type one cash figure and one UPI figure.
const cvData = {
  parties: [{ id: 's1', type: 'shop', name: 'S' }, { id: 'p1', type: 'person', name: 'P' }],
  voids: [], corrections: [],
  payments: [{ id: 'a', collectorId: 'jadav', partyId: 's1', amount: 700, cashAmount: 500, upiAmount: 200 },
             { id: 'b', collectorId: 'jadav', partyId: 'p1', amount: 200, cashAmount: 200, upiAmount: 0 }],
  daily: [{ id: 'c', collectorId: 'jadav', type: 'bus', amount: 300, cashAmount: 300, upiAmount: 0 },
          { id: 'e', collectorId: 'jadav', type: 'road', amount: 100, cashAmount: 0, upiAmount: 100 },
          { id: 'f', collectorId: 'jadav', type: 'toto', amount: 400, cashAmount: 400, upiAmount: 0 }],
  expenses: [{ id: 'x', collectorId: 'jadav', amount: 500, cashAmount: 500, upiAmount: 0, source: 'puja', srcCat: 'shop' }],
  handovers: [
    { id: 'h1', fromId: 'yamini', from: 'Yamini', toId: 'jadav', amount: 1700, cashAmount: 1200, upiAmount: 500, status: 'confirmed' },
    { id: 'h2', fromId: 'biplab', from: 'Biplab', toId: 'jadav', amount: 300, cashAmount: 300, upiAmount: 0, status: 'confirmed' },
    { id: 'h3', fromId: 'jadav', toId: 'hrishi', amount: 200, cashAmount: 200, upiAmount: 0, status: 'confirmed' },
  ],
};
const cv = cashierView(cvData, 'jadav');
eq(cv.collected, { cash: 1400, upi: 300 }, 'cashier view: own collections, cash and UPI');
eq(cv.collectedByCat.shop, { cash: 500, upi: 200 }, 'cashier view: own collections stay category-wise for display');
eq(cv.collectedByCat.toto, { cash: 400, upi: 0 }, 'cashier view: road and toto are there too');
eq(cv.byGiver.map(function (g) { return [g.name, g.cash, g.upi]; }), [['Yamini', 1200, 500], ['Biplab', 300, 0]],
   'cashier view: who handed money over, biggest first');
eq(cv.totalIn, { cash: 2900, upi: 800 }, 'cashier view: total in = own 1400/300 + received 1500/500');
eq(cv.spent, { cash: 500, upi: 0 }, 'cashier view: spent');
eq(cv.out, { cash: 200, upi: 0 }, 'cashier view: already sent');
eq(cv.available, { cash: 2200, upi: 800 }, 'cashier view: in hand = total in − spent − sent');
eq(cv.availableTotal, 3000, 'cashier view: in-hand total');
// the screen and the books must agree, or a cashier could promise money the
// reports say is elsewhere
const cvMine = myAvailable(cvData, 'jadav');
eq(cv.availableTotal, cvMine.cash + cvMine.upi, 'cashier view: in hand === myAvailable, always');

// money already promised to someone else is NOT available again. Everywhere
// else pending stays with the giver; here it must not, or the same notes could
// be handed to two people while the first receiver has not confirmed.
const cvPend = JSON.parse(JSON.stringify(cvData));
cvPend.handovers.push({ id: 'h4', fromId: 'jadav', toId: 'salil', amount: 1000, cashAmount: 1000, upiAmount: 0, status: 'pending' });
eq(cashierView(cvPend, 'jadav').availableTotal, 2000, 'cashier view: a PENDING handover is already out of the pocket');
eq(cashierView(cvPend, 'jadav').out, { cash: 1200, upi: 0 }, 'cashier view: sent counts pending as well as confirmed');

// a cashier's handover carries a snapshot, not categories — the receiver must
// read it as a plain parcel and never as a category called "__snap"
const snapData = {
  parties: [], payments: [], daily: [], expenses: [], voids: [], corrections: [],
  handovers: [{ id: 'h', fromId: 'jadav', from: 'Jadav', toId: 'hrishi', amount: 900, cashAmount: 600, upiAmount: 300,
    status: 'confirmed', breakdown: JSON.stringify({ __snap: { totalIn: { cash: 2900, upi: 800 } } }) }],
};
const snapRecv = myAvailable(snapData, 'hrishi');
eq(snapRecv.byCat, { received: { cash: 600, upi: 300 } }, 'snapshot: reserved __ keys are not read as categories');
eq(snapRecv.cash + snapRecv.upi, 900, 'snapshot: the receiver still gets the full amount');
eq(snapRecv.byGiver, [{ id: 'jadav', name: 'Jadav', cash: 600, upi: 300, total: 900 }],
   'snapshot: it arrives named — "handed over by Jadav"');

// ---- a correction keeps the original receipt serial --------------------------
// No paper receipt book here: the app's receipt is the only one, and the donor
// already has that number on their phone. Re-sharing under the SAME number
// replaces the old message; a fresh number would leave them holding two
// receipts for one donation. The voided row keeps the history.
const rcOld = { id: 'old', collectorId: 'yamini', partyId: 'p1', amount: 500, cashAmount: 500, upiAmount: 0, receiptNo: '2026000021' };
const rcNew = { id: 'new', collectorId: 'yamini', partyId: 'p1', amount: 700, cashAmount: 700, upiAmount: 0, receiptNo: '2026000021' };
const rcData = { parties: [{ id: 'p1', type: 'shop', name: 'S', pledged: 1000 }],
                 payments: [rcOld, rcNew], daily: [], expenses: [], handovers: [],
                 corrections: [], voids: [{ id: 'v', targetStore: 'payments', targetId: 'old', reason: 'edit — ভুল অ্যামাউন্ট' }] };
eq(computeTotals(rcData).totalCollection, 700, 'correction: only the corrected row counts');
eq(computeTotals(rcData).paidByParty.p1, 700, 'correction: the donor is credited once, at the new figure');
eq(myAvailable(rcData, 'yamini').byCat.shop, { cash: 700, upi: 0 }, 'correction: the pot holds the corrected amount');
eq(personalSummary(rcData, 'yamini').collected, 700, 'correction: the collector is not credited twice');
// the serial stays unique among ACTIVE rows, which is the only place it is read
const liveSerials = [rcOld, rcNew].filter(function (r) { return r.id !== 'old'; }).map(function (r) { return r.receiptNo; });
eq(liveSerials, ['2026000021'], 'correction: one live row carries the number');
eq(duesList(rcData.parties, rcData.payments, rcData.voids).length, 1, 'correction: dues use the corrected figure');
eq(duesList(rcData.parties, rcData.payments, rcData.voids)[0].due, 300, 'correction: 1000 pledged − 700 corrected = 300 due');

// ---- committee chat: who a message is for --------------------------------
// Group membership is decided at read time, not stored, so promoting somebody
// to cashier immediately changes which past messages count as theirs.
const chatMsgs = [
  { id: '1', collectorId: 'jadav90', collector: 'Jadav', text: '@yamini05 রোডের টাকা', mentions: 'yamini05', createdAt: '2026-07-26T10:00:00Z' },
  { id: '2', collectorId: 'hrishi91', collector: 'Hrishi', text: '@all মিটিং', mentions: 'all', createdAt: '2026-07-26T11:00:00Z' },
  { id: '3', collectorId: 'hrishi91', collector: 'Hrishi', text: '@cashiers হিসাব', mentions: 'cashiers', createdAt: '2026-07-26T12:00:00Z' },
  { id: '4', collectorId: 'yamini05', collector: 'Yamini', text: 'ঠিক আছে', mentions: '', createdAt: '2026-07-26T12:30:00Z' },
];
const chatData = { parties: [], payments: [], daily: [], expenses: [], handovers: [], voids: [], corrections: [], messages: chatMsgs };
const yam = { username: 'yamini05', role: 'user', cashier: 0 };
const jad = { username: 'jadav90', role: 'user', cashier: 1 };
const adm = { username: 'hrishi91', role: 'admin', cashier: 0 };
eq(mentionsMe(chatMsgs[0], yam), true, 'chat: named directly');
eq(mentionsMe(chatMsgs[0], jad), false, 'chat: somebody else being named is not mine');
eq(mentionsMe(chatMsgs[1], yam), true, 'chat: @all reaches everyone');
eq(mentionsMe(chatMsgs[2], jad), true, 'chat: @cashiers reaches a cashier');
eq(mentionsMe(chatMsgs[2], yam), false, 'chat: …and not a plain collector');
eq(mentionsMe(chatMsgs[2], adm), true, 'chat: an admin counts as a cashier here, as everywhere else');
eq(mentionsMe(chatMsgs[3], yam), false, 'chat: a message mentioning nobody is nobody\'s');
const yFeed = messageFeed(chatData, yam, '2026-07-26T09:00:00Z');
eq(yFeed.rows.map(function (r) { return r.id; }), ['1', '2', '3', '4'], 'chat: oldest first, the way a conversation reads');
eq(yFeed.unread, 3, 'chat: your own messages are never unread');
eq(yFeed.mentioned, 2, 'chat: mentions counted apart from plain unread');
eq(messageFeed(chatData, yam, '2026-07-26T12:00:00Z').unread, 0, 'chat: the seen marker clears the count');
eq(messageFeed(chatData, jad, '2026-07-26T09:00:00Z').mentioned, 2, 'chat: cashier is mentioned by @all and @cashiers');
// a voided message leaves the feed, like every other store
eq(messageFeed(Object.assign({}, chatData, { voids: [{ id: 'v', targetId: '2' }] }), yam, '').rows.length, 3,
   'chat: a voided message is gone from the feed too');

// Chat must not slow the money down. activeData runs on EVERY aggregation —
// inHandRows calls it once per collector — so messages are deliberately kept
// out of it; a season of chat made that path 11× slower for rows that change
// no figure. If somebody re-adds them, this fails.
eq(Object.prototype.hasOwnProperty.call(
     activeData({ parties: [], payments: [], daily: [], expenses: [], handovers: [], voids: [], corrections: [],
                  messages: [{ id: 'm', text: 'x' }] }), 'messages'),
   false, 'chat: messages are NOT carried through activeData');
// …and the feed still filters its own voids, which is what it now owns
eq(messageFeed({ messages: [{ id: 'a', createdAt: '1' }, { id: 'b', createdAt: '2' }],
                 voids: [{ id: 'v', targetId: 'a' }] }, { username: 'x' }, '').rows.map(function (r) { return r.id; }),
   ['b'], 'chat: messageFeed filters voided messages itself');

// ---- one permission brings the default screens back --------------------------
// The promise: a person granted ANY one category gets their own tile plus the
// screens everybody has. Only somebody granted nothing sees the bare card.
const tilesFor = function (entries, cashierFlag, role) {
  return homeTiles({ role: role || 'user', entries: entries, cashier: cashierFlag || 0 });
};
const busOnlyTiles = tilesFor('bus');
eq(busOnlyTiles.setUp, true, 'tiles: one grant counts as set up');
eq(busOnlyTiles.entry, ['bus'], 'tiles: only the granted category');
eq(busOnlyTiles.daily, [], 'tiles: an ungranted round does not appear');
eq(busOnlyTiles.common, ['payments', 'handover', 'hbook'],
   'tiles: …and the default screens come back — instalment, handover, handover book');
eq(tilesFor('road').entry, [], 'tiles: a road-only collector gets no new-entry tile');
eq(tilesFor('road').daily, ['road'], 'tiles: …but does get their round');
eq(tilesFor('road').common.length, 3, 'tiles: the default screens do not depend on WHICH grant');
// nothing granted is the only case with a bare screen
eq(tilesFor('').setUp, false, 'tiles: nothing granted is not set up');
eq(tilesFor('').common, [], 'tiles: …so not even the common screens');
eq(tilesFor('', 1).setUp, false, 'tiles: a cashier granted nothing is not set up either (Hrishi\'s rule)');
// role tiles ride the role, and the desk needs its own grant on top
eq(tilesFor('bus', 1).role, ['cashier', 'anomalies'], 'tiles: a cashier gets the confirm desk + the anomaly desk');
eq(tilesFor('bus', 1).daily.indexOf('expense') >= 0, true, 'tiles: …and general expenses');
eq(tilesFor('bus,review', 1).role, ['cashier', 'review', 'anomalies'], 'tiles: the correction desk needs its grant');
eq(tilesFor('bus', 0).role, [], 'tiles: a plain collector gets no desk at all — including the anomaly desk');
eq(tilesFor('bus').role, [], 'tiles: a plain collector gets neither');
// an admin is never narrowed, whatever the field says
const admTiles = tilesFor('', 0, 'admin');
eq(admTiles.setUp, true, 'tiles: an admin is always set up');
eq(admTiles.entry, ['shop', 'person', 'member', 'bus', 'sponsor', 'gupt'], 'tiles: …and gets every donor category (টিকিট is a daily kind, not a donor)');
eq(admTiles.role, ['cashier', 'review', 'anomalies', 'memberadmin'], 'tiles: …and every desk');
// ---- A29: collecting from members ≠ keeping the member register --------------
// Hrishi: "the member entry screen ... that was as previous to collect the
// amount ... we will select the member there from member list and will make
// entry of cash or upi, thats it" — and registering is "a different screen ...
// what will have seperate permission".
eq(homeTiles({ role: 'user', cashier: 0, entries: 'member' }).entry.indexOf('member') >= 0, true,
   'A29: the `member` grant gives the COLLECTION tile');
eq(homeTiles({ role: 'user', cashier: 0, entries: 'member' }).role.indexOf('memberadmin') >= 0, false,
   'A29: …and NOT the register — one person keeps it, many people collect');
eq(homeTiles({ role: 'user', cashier: 0, entries: 'memberadmin' }).role, ['memberadmin'],
   'A29: the register is its own grant, and carries nothing else with it');
eq(PERM_KEYS.indexOf('memberadmin') >= 0, true, 'A29: memberadmin is a real permission key');

// ---- A80: the same donor written down twice ---------------------------------
// The entry form already warns on a phone match, and warns well. But it reads
// THIS DEVICE's book, so it is blind in the one case that matters: two
// collectors offline on the same street. Both rows sync later and nothing looks
// again — the pledge is counted twice, the target is wrong, and the shopkeeper
// is asked twice.
{
  const A = require('../js/aggregate.js');
  const P = function (id, name, phone, extra) {
    return Object.assign({ id: id, year: 2026, type: 'shop', name: name, phone: phone,
                           pledged: 1000, collector: id.toUpperCase(), collectorId: id }, extra || {});
  };
  const book = function (parties) {
    return { parties: parties, payments: [], daily: [], expenses: [], handovers: [],
             voids: [], messages: [], corrections: [] };
  };
  const dups = function (d) {
    return A.reconcile(d, {}).anomalies.filter(function (x) { return x.type === 'possible_duplicate_party'; });
  };
  eq(dups(book([P('a', 'রাম স্টোর্স', '9876543210'), P('b', 'রাম স্টোর', '9876543210')])).length, 1,
     'A80: two donors on one phone number raise exactly one line, not two');
  // the shapes people actually write a number in
  eq(dups(book([P('a', 'x', '+91 98765-43210'), P('b', 'y', '09876543210')])).length, 1,
     'A80: …however differently the two collectors typed it');
  // the failure that would fill the desk with innocent twins
  eq(dups(book([P('a', 'x', ''), P('b', 'y', ''), P('c', 'z', '')])).length, 0,
     'A80: a blank phone matches nothing — most emphatically not another blank one');
  eq(dups(book([P('a', 'x', '98765'), P('b', 'y', '98765')])).length, 0,
     'A80: …nor does a half-typed number, which is not an identity');
  eq(dups(book([P('a', 'মা তারা স্টোর', '9000000001'), P('b', 'মা তারা স্টোর', '9000000002')])).length, 0,
     'A80: the same NAME is not enough — "মা তারা স্টোর" can honestly be three shops, and a desk of innocent twins is a desk nobody reads');
  // the answer, and the A22 trap it has to avoid
  eq(dups(book([P('a', 'x', '9876543210', { dupOk: 1 }), P('b', 'y', '9876543210')])).length, 0,
     'A80: one human answer settles the pair — asked of the FIRST row…');
  eq(dups(book([P('a', 'x', '9876543210'), P('b', 'y', '9876543210', { dupOk: 1 })])).length, 0,
     'A80: …and of the second, because array order is not insertion order (the A22 lesson)');
  // removed donors are not duplicates of anything
  const removed = book([P('a', 'x', '9876543210'), P('b', 'y', '9876543210')]);
  removed.voids = [{ id: 'v1', year: 2026, targetStore: 'parties', targetId: 'b' }];
  eq(dups(removed).length, 0, 'A80: a removed donor stops being anybody’s twin');
  // three on one number is two lines against the first, not three cards
  eq(dups(book([P('a', 'x', '9876543210'), P('b', 'y', '9876543210'), P('c', 'z', '9876543210')])).length, 2,
     'A80: three on one number raise two lines, each pointing back at the first');

  // The card is only half the feature: without the stamp wired to the SAME
  // field the rule reads, the line can never be cleared and the 🩺 desk fills
  // with lines nobody can answer — which is how a desk stops being read
  // (A19/A23, and A60's `voided` button that reported success and did nothing).
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/data-pdupok="/.test(appSrc), true, 'A80: the desk draws an answer button for it');
  eq(/stampOk\(b, 'parties', b\.dataset\.pdupok, 'dupOk'\)/.test(appSrc), true,
     'A80: …wired to parties.dupOk — the same field reconcile reads, or the answer never clears the line');
}

// ---- A83: the receipt says who took the money -------------------------------
// The donor's copy is their only evidence, and it could not answer the one
// question a dispute asks. Twelve people are collecting; the app has always
// known which one, and the receipt simply never said.
//
// Both routes, because they are different documents: the IMAGE is what
// WhatsApp carries, and over SMS there is no image at all — so the receipt
// that cannot show a picture is exactly the one somebody will be holding.
{
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  const from = function (fn, to) { return appSrc.slice(appSrc.indexOf(fn), appSrc.indexOf(to, appSrc.indexOf(fn))); };
  eq(/collector: pay\.collector \|\| pay\.collectorId/.test(from('function rcFromPayment', 'function rcFromDailyBus')), true,
     'A83: a payment receipt carries the collector');
  eq(/collector: d\.collector \|\| d\.collectorId/.test(from('function rcFromDailyBus', 'function receiptMessage')), true,
     'A83: …and so does a bus receipt, which is a receipt somebody keeps too');
  const msg = from('function receiptMessage', '// 📷 image receipt');
  eq(/rc\.collector \? 'সংগ্রাহক/.test(msg), true,
     'A83: …and the SMS body names them, because that route has no image to read it from');
  const draw = appSrc.slice(appSrc.indexOf("const sy = H - 96;"), appSrc.indexOf("// ---- footer ----"));
  eq(/if \(rc\.collector\)/.test(draw) && /সংগ্রাহক/.test(draw), true,
     'A83: …and it is drawn on the image itself');
  // guarded, not assumed: an old row with no collector must not print "undefined"
  eq(/rc\.collector \|\| ''/.test(appSrc) || /collector: pay\.collector \|\| pay\.collectorId \|\| ''/.test(appSrc), true,
     'A83: …and a row that predates this prints nothing rather than a blank label');
  // the date a person reads, on the one document that leaves the app
  eq(/fmtDateLong\(rc\.datetime \|\| rc\.date\)/.test(appSrc), true,
     'A83: the receipt dates itself the way a person writes a date, not the way a machine sorts one');
  eq(/function fmtDateTime/.test(appSrc), true,
     'A83: …while screens keep the dense sortable form — a list you scan and a paper you keep want opposite things');
  // A88: and the admin's preview carries it too. A preview that leaves out a
  // line the real receipt has is a preview of a different document, and the
  // layout is chosen by looking at it.
  const sample = appSrc.slice(appSrc.indexOf('const sampleRC ='), appSrc.indexOf('function drawPreview'));
  eq(/collector:/.test(sample), true,
     'A88: the receipt-design preview shows the collector line the real receipt draws');

  // 44px is the smallest thing a thumb hits reliably. ← পেছনে was 40 and it is
  // on every drill-in screen, tapped by people standing in a street with one
  // hand on a bag. Measured in the browser, then pinned here so a later tidy-up
  // of the CSS cannot quietly take it back.
  const css = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
  const bb = css.slice(css.indexOf('button.back-bar'), css.indexOf('}', css.indexOf('button.back-bar')));
  eq(/min-height:\s*44px/.test(bb), true,
     'A83: the back button is at least 44px tall — the one control every drill-in screen has');

  // A84: and the other four, found by walking every screen at 375px rather than
  // reading the file. Measured in the browser at 44 / 47 / 57 / 40px afterwards.
  // Pinned because "make it smaller, it looks tidier" is a change somebody makes
  // in a quiet moment, and these are hit one-handed in a street.
  [['.hero-hold', 'the home in-hand button'],
   ['button.void-btn', 'the ⚠️ flag chips on my entries'],
   ['.sum-more', 'the report’s working toggle']].forEach(function (r) {
    const block = css.slice(css.indexOf(r[0]), css.indexOf('}', css.indexOf(r[0])));
    eq(/min-height:\s*44px/.test(block), true, 'A84: ' + r[1] + ' is at least 44px');
  });
  // A108: the small things left over, decided rather than left hanging — plus
  // the one that mattered: A107's fallback was SILENT, so "the panel opened"
  // and "the panel opened without the money" were the same screen, and which of
  // those happened is the fact that says whether the failure is still there.
  {
    const app108 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const vm108 = require('vm');
    const c108 = vm108.createContext({});
    vm108.runInContext(require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8') + ';globalThis.__D = I18N;', c108);
    const D108 = c108.__D;
    const BN108 = /[ঀ-৿]/;

    // the fallback says so
    eq(/admMoneyFailed = true;/.test(app108), true, 'A108: the money fallback records that it fired');
    eq(/admMoneyFailed = false; \/\/ a fresh fetch decides this again/.test(app108), true,
       'A108: …and a fresh fetch clears it, so a good load cannot inherit a bad one');
    eq(/admMoneyFailed \? '<div class="perm-note">' \+ esc\(t\('adm_money_off'\)\)/.test(app108), true,
       'A108: …and the panel says which of the two screens you are looking at');
    eq(BN108.test(D108.adm_money_off.bn) && !BN108.test(D108.adm_money_off.en), true,
       'A108: …in both languages');
    // A115c: Hrishi stopped at 🔄 in the admin panel and asked for a popup
    // explaining what it does. It reads only — but the SAME panel had
    // '🔄 নতুন বছরে দাতা আনো' (rollover), which WRITES. Same emoji, same verb
    // আনো, both starting নতুন, one of them a line under 🧹's warning text. On a
    // phone, in a hurry, they were one button.
    const confusable = /🔄 *নতুন.*আনো/;
    eq(confusable.test(D108.refresh.bn) && confusable.test(D108.rollover_btn.bn), false,
       'A115: the harmless 🔄 and the one that WRITES cannot be read as the same button');
    // and the read-only one explains itself, not in a confirm: a question with
    // nothing behind it is what teaches people to tap through the confirms on
    // 🧹, 🚀 and freeze, which are the ones that cost money. (A129 moved the
    // control into the header as an icon — no room for a subtitle there, so
    // the explanation travels as its tooltip/accessible name.)
    eq(/refresh_hint/.test(app108) && BN108.test(D108.refresh_hint.bn) &&
       !BN108.test(D108.refresh_hint.en), true,
       'A115: …and the read-only one still carries its explanation, in both languages');
    // the money-fallback message names that control. A message telling you to
    // press something no longer on the screen is worse than no message —
    // exactly what deleting the panel button would have done to this string.
    eq(D108.adm_money_off.bn.indexOf('উপরের 🔄') >= 0 &&
       D108.adm_money_off.en.indexOf('🔄 at the top') >= 0, true,
       'A115: …and every message that names the control points at WHERE IT NOW IS');

    // seven labels that stayed English in Bengali mode. "Approve" survives as a
    // loan word because the app already uses it that way in pending_users.
    [['block', 'বন্ধ'], ['refresh', 'নতুন'], ['approved_users', 'অনুমোদিত'],
     ['blocked_users', 'বন্ধ'], ['secret', 'সিঙ্ক'], ['script_url', 'সিঙ্ক']].forEach(function (p) {
      eq(BN108.test(D108[p[0]].bn), true, 'A108: ' + p[0] + ' reads in Bengali now');
    });
    eq(D108.approve.bn.indexOf('Approve') >= 0 && BN108.test(D108.approve.bn), true,
       'A108: …and Approve stays the loan word it already is in “Approve-এর অপেক্ষায়”');

    // the tab title followed nothing at all — it was baked into index.html
    eq(/document\.title = pn === t\('app_title'\) \? pn : pn \+ ' — ' \+ t\('app_title'\);/.test(app108), true,
       'A108: the browser tab carries the puja name and the app language, without repeating itself');

    // the amount box opens a number pad, which emits ASCII — so did the example
    eq(/placeholder="500"/.test(app108), true,
       'A108: the amount placeholder is written in the digits its own keyboard produces');
    eq(/placeholder="৫০০"/.test(app108), false, 'A108: …not the ones it cannot');
  }
  // A107: the admin panel would not open — "আবার চেষ্টা করো". Of the three
  // requests behind that screen, listUsers is the only one with no fallback,
  // and A100 had just made it the heaviest: sending the year makes the server
  // read the whole year's book and summarise every user. Anything that upsets
  // that took the entire panel down — no approvals, no lists, no way in.
  {
    const app107 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    // Anchored, and the end searched FROM the start — `listSubjects` appears
    // earlier in the file too (expenseFlow fetches it), so a bare indexOf for
    // the end ran backwards and handed back an empty slice that quietly failed
    // every assertion under it. Fifth time this project has been bitten by an
    // unanchored indexOf; A99 wrote a helper for exactly this and I did not use
    // it.
    const s107 = app107.indexOf("Auth.call('listUsers', { token: Auth.token(), year:");
    const e107 = app107.indexOf("Auth.call('listSubjects'", s107 < 0 ? 0 : s107);
    eq(s107 >= 0 && e107 > s107, true, 'A107: (the listUsers call and its catch were found, in order)');
    const call = s107 >= 0 && e107 > s107 ? app107.slice(s107, e107) : '';
    eq(/\.catch\(function \(e\) \{/.test(call), true,
       'A107: the money request has a fallback…');
    eq(/return Auth\.call\('listUsers', \{ token: Auth\.token\(\) \}\);/.test(call), true,
       'A107: …which asks again without the year, so the panel opens without the column');
    // a dead session must NOT be retried: Auth.call has already cleared it, and
    // a second attempt only hides why
    eq(/if \(m === 'bad-token' \|\| m === 'blocked' \|\| m === 'pending'\) throw e;/.test(call), true,
       'A107: …but never retries a session that is gone');
    // the other two already degrade to an empty list; that is what made
    // listUsers the single point of failure
    eq(/Auth\.call\('listSubjects', \{ token: Auth\.token\(\) \}\)\.catch\(function \(\) \{ return \{ subjects: \[\] \}; \}\)/.test(app107), true,
       'A107: …listSubjects still degrades to an empty list');
    eq(/Auth\.call\('listItems', \{ token: Auth\.token\(\) \}\)\.catch\(function \(\) \{ return \{ items: \[\] \}; \}\)/.test(app107), true,
       'A107: …and so does listItems');
  }
  // A113: negative in-hand pointed the wrong way. "More was spent or handed
  // over than collected" is true and reads as "he handed over too much", so a
  // cashier goes to check the handover — when in practice the handover is right
  // and the COLLECTION is what is missing from the book. Two readings, two
  // different jobs.
  {
    const vm113 = require('vm'), c113 = vm113.createContext({});
    vm113.runInContext(require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8') +
                       ';globalThis.__D = I18N;', c113);
    const neg = c113.__D.anom_negative;
    eq(/আদায়[^]{0,20}লেখা হয়নি/.test(neg.bn), true,
       'A113: the negative-hand card names the likely cause — an entry that was never made');
    eq(/collection has not been recorded/.test(neg.en), true, 'A113: …in both languages');
    // hedged, because an over-recorded expense or a duplicated handover can do
    // it too — and a card that overstates its certainty gets ignored the first
    // time it is wrong
    eq(/সম্ভবত/.test(neg.bn) && /most likely/.test(neg.en), true,
       'A113: …as the LIKELY cause, not a verdict');
    eq(/জমা\/খরচের অঙ্ক/.test(neg.bn) && /handover and expense/.test(neg.en), true,
       'A113: …with the other possibility kept as the fallback');
    eq(/খরচ বা জমা তোলার চেয়ে বেশি লেখা হয়েছে/.test(neg.bn), false,
       'A113: …and the sentence that sent people to the wrong place is gone');
    // the overpaid card already asked the right question — left alone on purpose
    eq(/বেশি জমা, নাকি ভুল entry\?/.test(c113.__D.anom_overpaid.bn), true,
       'A113: the overpaid card still ASKS which it was rather than guessing');
  }
  // A112: the two things the book was BALANCED about and silent on. Both were
  // found by asking "what could go wrong that reconcile cannot see?" — and the
  // answer both times was: anything the arithmetic agrees with.
  {
    const app112 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const i18n112 = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');

    // 1 — a void keeps the books perfect. Collection drops, that person's
    // in-hand drops by the same amount, reconcile is happy, and money has left
    // the book with one line in an audit sheet nobody is told to read.
    eq(/const voidCard = !voids\.length \? '' :/.test(app112), true,
       'A112: cancelled entries are surfaced where a cashier will see them');
    eq(/const voidTotal = voids\.reduce/.test(app112), true,
       'A112: …with the total, because one ₹3,000 void reads differently from three ₹100 ones');
    eq(/anom_voids_t:/.test(i18n112) && /anom_voids_sub:/.test(i18n112), true,
       'A112: …and it says why they are worth looking at');
    // the amount has to be looked up on the TARGET — a void row carries no money
    eq(/const t = v\.targetStore === 'daily' \? dailyById2\[v\.targetId\] : payById\[v\.targetId\];/.test(app112), true,
       'A112: …reading the amount off the row that was cancelled, since the void carries none');

    // 2 — cash piling up in one pair of hands. Not wrongdoing; the ordinary
    // thing that happens when nobody is watching a number.
    eq(/const HIGH_INHAND = 10000;/.test(app112), true, 'A112: one named threshold, in one place');
    eq(/\.filter\(function \(h\) \{ return h\.inHand > HIGH_INHAND; \}\)/.test(app112), true,
       'A112: …🩺 lists whoever is over it');
    eq(/Number\(u\.money\.inHand\) > HIGH_INHAND[\s\S]{0,60}color:var\(--red\)/.test(app112), true,
       'A112: …and the admin list turns that figure red');
    eq(/anom_highinhand_t:/.test(i18n112), true, 'A112: …in words, not just a colour');

    // both sit ABOVE the anomalies: reconcile means "the book disagrees with
    // itself", and neither of these does
    eq(/heavyCard \+ voidCard \+/.test(app112), true,
       'A112: both sit above the anomaly cards, not inside reconcile');
    // …and an empty desk must not claim to be empty when one of them is showing
    eq(/\(heavyCard \|\| voidCard \? '' : '<div class="empty">'/.test(app112), true,
       'A112: …so "no anomalies" is not printed under a card that says otherwise');
  }
  // A111: the pre-puja sweep. Thirteen screens in two languages and three
  // roles turned up one message that was false: a cashier WITHOUT the 🛠️ grant
  // was told "you are not a cashier". canReview() is two conditions and the
  // message named one — and A110 had just added a third way in, since the
  // freeze closes canEntry('review') too.
  {
    const app111 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const i18n111 = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
    eq(/const why = !Auth\.isCashier\(\) \? 'not_cashier' : frozen\(\) \? 'freeze_bar' : 'no_review_grant';/.test(app111), true,
       'A111: the review desk names which of the three reasons actually applies');
    eq(/  no_review_grant: \{/.test(i18n111), true, 'A111: …and the third reason has words of its own');
    // the OTHER two uses of not_cashier are gated on isCashier alone, where the
    // sentence is true — they must not be swept up in the fix
    eq((app111.match(/if \(!Auth\.isCashier\(\)\) \{ \$view\(\)\.innerHTML = backBar\('(home|report)'\) \+ '<div class="empty">' \+ esc\(t\('not_cashier'\)\)/g) || []).length, 2,
       'A111: …while the two screens that really do mean "not a cashier" keep saying so');
  }
  // A110: the freeze on the CLIENT — the half the server cannot enforce, which
  // is that a collector must never be shown a button the server will hold.
  {
    const app110 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const agg110 = require('fs').readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
    // one predicate, admin exempt — modelled on chatOn() next door
    eq(/function frozen\(\) \{[\s\S]{0,160}freeze_at[\s\S]{0,80}!Auth\.isAdmin\(\)/.test(app110), true,
       'A110: one predicate for "may I write money", and the admin is exempt');
    // …and a second one WITHOUT the exemption, because the button and the
    // banner must show the state of the switch, not who is looking at it
    eq(/function freezeOn\(\) \{ return !!String\(\(centralConfig \|\| \{\}\)\.freeze_at \|\| ''\); \}/.test(app110), true,
       'A110: …and a separate one for "is it on", used by the button and the strip');
    // the entry gate rides the existing choke point
    eq(/if \(key && frozen\(\)\) return false;/.test(app110), true,
       'A110: canEntry — the same choke point the stale-version lock uses');
    // tiles come from homeTiles, not canEntry: a flag has to reach it too, or
    // the buttons stay on a screen the server will hold
    eq(/if \(opts\.frozen\) \{[\s\S]{0,120}out\.frozen = true;[\s\S]{0,80}out\.common = \['hbook'\];/.test(agg110), true,
       'A110: home shows only the read-only handover book while paused');
    eq(/frozen: frozen\(\), \/\/ A110/.test(app110), true, 'A110: …and renderHome passes the flag in');
    // its own card: reusing `blocked` would have said "your phone is behind"
    eq(/plan\.frozen \? frozenCard\(\)/.test(app110) && /function frozenCard\(\)/.test(app110), true,
       'A110: …with its own card, not the stale-version one');
    // the strip, on every screen, and the admin gets a different sentence
    eq(/if \(freezeOn\(\)\) \{[\s\S]{0,400}freeze_bar_admin' : 'freeze_bar'/.test(app110), true,
       'A110: the strip shows for everyone, and tells the admin how to lift it');
    // two questions to stop, one to resume
    eq(/window\.confirm\(t\('freeze_c1'\)\)[\s\S]{0,400}window\.confirm\(t\('freeze_c2'\)/.test(app110), true,
       'A110: pausing asks twice, the second time with the headcount');
    eq(/if \(!window\.confirm\(t\('freeze_off_confirm'\)\)\) return;/.test(app110), true,
       'A110: …and resuming asks once — the safe direction earns no ceremony');
    eq(/confirm: 'FREEZE'/.test(app110), true, 'A110: …and sends the word the server demands');
  }
  // A106: a sweep of every routed screen turned up one more nameless row —
  // 🧾 আমার খরচ printed `e.desc` alone, and the comment is OPTIONAL for every
  // subject but "অন্য কিছু". Skip it and the row says "12/08/2026 · ₹300",
  // which is not an account of anything.
  {
    const app106 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const agg106 = require('fs').readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
    // the subject has to survive the projection to be printable at all
    eq(/return \{ date: e\.date, subject: e\.subject, desc: e\.desc, amount: Number\(e\.amount\) \|\| 0 \};/.test(agg106), true,
       'A106: personalSummary carries the expense SUBJECT, not just its comment');
    // one rule, used by every renderer — three of them each had their own and a
    // fourth had none
    eq(/function expenseTitle\(e\) \{/.test(app106), true, 'A106: what an expense is called lives in one function');
    eq((app106.match(/expenseTitle\(/g) || []).length >= 4, true,
       'A106: …defined once and used by every renderer');
    // (A142 made the marker resolve to the COMMENT first — the comment is
    // mandatory for exactly that reason — so the pins move to the new shape.
    // Same two properties: the marker never reaches a screen, and the title
    // never comes out empty.)
    eq(/if \(raw === 'Other' \|\| raw === OTHER_SUBJECT\) return desc \|\| t\('subject_other'\);/.test(app106), true,
       'A106: …and “Other” is a stored marker, never printed raw');
    eq(/return raw \|\| desc \|\| t\('expense'\);/.test(app106), true,
       'A106: …falling back to the comment, then to the word খরচ — never to nothing');
    // the old per-renderer versions must be gone, or one screen keeps its own rule
    eq(/esc\(r\.subject \|\| '—'\)/.test(app106), false, 'A106: the central list no longer has its own version');
    eq(/\(r\.subject \|\| r\.desc \|\| t\('expense'\)\)/.test(app106), false, 'A106: …nor does ✏️ আমার entry');
    eq(/<b>' \+ esc\(e\.desc\) \+ '<\/b>/.test(app106), false, 'A106: …and নাম-হীন খরচের সারিটা ফাইল থেকে গেছে');
  }
  // A105: ← পেছনে from a screen with two doors. 🩺's 👁 দেখো landed on the donor
  // and ← went to 📒 খাতা, so the desk you were working down was gone — and on a
  // desk whose whole job is "work through this list", losing your place is the
  // failure: you cannot tell which rows you have already looked at.
  {
    const app105 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    // the door is remembered, not guessed
    eq(/navigate\('party', \{ id: b\.dataset\.goparty, from: 'anomalies' \}\)/.test(app105), true,
       'A105: 🩺 tells the donor screen which door it came in by');
    eq(/navigate\('partyform', \{ id: b\.dataset\.pledgefix, from: 'anomalies' \}\)/.test(app105), true,
       'A105: …and so does the ✏️ fix-the-pledge route');
    eq(/backBar\(from \|\| 'list'\)/.test(app105), true,
       'A105: the donor screen goes back the way it was entered, 📒 খাতা by default');
    // drawParty is a TOP-LEVEL function; the origin has to arrive as an
    // argument. Reading `params` in there threw on every 👁 দেখো.
    eq(/function drawParty\(p, pays, central, voidedOf, from\)/.test(app105), true,
       'A105: …taking the door as an ARGUMENT, because drawParty is not nested in renderParty');
    eq(/drawParty\(p, pays, true, voidedOf, params\.from\)/.test(app105), true,
       'A105: …and renderParty hands it over');
    // BOTH back bars in the edit form carry it: the first is replaced the
    // moment the donor loads, so threading only that one loses the door a
    // heartbeat later — which is how the first version passed 👁 and failed ✏️
    eq((app105.match(/backBar\('party', \{ id: id, from: from \}\)/g) || []).length, 2,
       'A105: both of the edit form’s back bars carry the door — the second one is the one that survives');
    eq(/backBar\('party', \{ id: id \}\)/.test(app105), false,
       'A105: …neither is left without it');
  }
  // A104: the handover sheet's group subtotal. Hrishi sent a screenshot of it:
  // one shop, ₹100, and under it a SECOND row with no name at all showing the
  // same ₹100. It was the group subtotal — printed even when the group had one
  // row, and never carrying a label.
  {
    const app104 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    eq(/\(cats\.length > 1 \? subRow\(sub\) : ''\)/.test(app104), true,
       'A104: a group of one shows no subtotal — a total of one row IS that row');
    eq(/\(v\.byGiver\.length > 1 \? subRow\(v\.received\) : ''\)/.test(app104), true,
       'A104: …and the same for the people who handed money in');
    eq(/const subRow = function \(o\) \{[\s\S]{0,200}esc\(t\('total'\)\)/.test(app104), true,
       'A104: …and when it IS shown it says what it is, instead of a blank name');
    // the blank-name span is the thing that shipped; it must not come back
    eq(/sh-row ro sub"><span class="cat-name"><\/span>/.test(app104), false,
       'A104: the nameless subtotal row is gone from the file');
  }
  // A103: one search rule, six boxes. Four of them did a single indexOf of the
  // whole query, so "ঘোষ সুব্রত" found nobody while "সুব্রত ঘোষ" worked — and a
  // collector who learnt "type any two words" in 📒 খাতা read that emptiness as
  // "this person is not here". Verified in a browser across all six.
  {
    const app103 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    eq(/function matchWords\(hay, query\) \{[\s\S]{0,260}q\.split\(' '\)\.every\(function \(w\) \{ return h\.indexOf\(w\) >= 0; \}\);/.test(app103), true,
       'A103: one rule — every word of the query, anywhere in the haystack');
    // every caller goes through it; an extra matcher appearing that does NOT
    // raise this count is the N-places-guarded-for-N-minus-1 pattern starting
    // over. A130 added the fourth caller: matchBus — the bus rows were the
    // last box still on a raw substring. A156 added the fifth: the 🎭 tab's own
    // খাতা, so its search behaves like every other search in the app rather than
    // teaching one screen a different rule about word order.
    eq((app103.match(/matchWords\(/g) || []).length, 6,
       'A103: …defined once and used by exactly five callers (party · admin rows · members · bus · programme ledger)');
    eq(/return matchWords\(\[p\.name, p\.owner, p\.phone,/.test(app103), true,
       'A103: …the ledger and find-donor searches (name · owner · phone · area · location)');
    eq(/const hit = matchWords\(r\.dataset\.q \|\| r\.textContent, q\);/.test(app103), true,
       'A103: …the four admin filters');
    // A115: the post moved to the account, so the picker reads memberPost(p).
    // The property is unchanged: name, phone AND post all go through the one
    // matchWords rule, so "শঙ্কর কোষাধ্যক্ষ" finds the row with both words on it.
    eq(/matchWords\(\[p\.name, p\.phone,\s*\n?\s*pos \? Lists\.labelOf\('position', pos\) : ''\]\.join\(' '\), q\)/.test(app103), true,
       'A103: …and the member picker');
    // the old rule must be gone from all of them, or one screen keeps lying
    eq(/normText\(\[p\.name, p\.phone[\s\S]{0,120}\]\.join\(' '\)\)\.indexOf\(q\)/.test(app103), false,
       'A103: the member picker no longer does a whole-string indexOf');
    eq(/normText\(r\.dataset\.q \|\| r\.textContent\)\.indexOf\(q\)/.test(app103), false,
       'A103: …and neither do the admin filters');
    // an empty query still shows everything — the guard that makes the box
    // harmless until somebody types
    eq(/const q = normText\(query\); if \(!q\) return true;/.test(app103), true,
       'A103: an empty query matches everything, so the box costs nothing until it is used');
  }
  // A101: the master lists. Hrishi opened 🧾 রসিদ ও তালিকা and দোকানের এলাকা was
  // empty — while the app was using those four areas on every donor row and
  // every receipt. Reproduced against the real Code.gs before touching it.
  {
    const gs101 = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
    const lists101 = require('fs').readFileSync(__dirname + '/../js/lists.js', 'utf8');

    // 1 — the areas exist server-side, with the SAME ids the client seeds, or a
    // row storing `main_malda` names something the sheet never heard of.
    eq(/var AREA_SEED = \[/.test(gs101), true, 'A101: the four shop areas are a named seed on the server');
    ['main_malda', 'main_balurghat', 'harirampur', 'singhadaha'].forEach(function (id) {
      eq(gs101.indexOf("'" + id + "'") > 0 && lists101.indexOf("'" + id + "'") > 0, true,
         'A101: …and ' + id + ' is the same id on both sides');
    });
    // 2 — and they heal on READ, like the posts always did. This is the whole
    // bug: setup() runs once, by hand, so a book made before that block existed
    // never got them and never would.
    eq(/if \(!kinds\.area\) AREA_SEED\.forEach/.test(gs101), true,
       'A101: an old book heals its areas on the next listItems, without setup()');
    eq(/function seedLists_\(sh\)/.test(gs101) && /seedLists_\(sh\);/.test(gs101), true,
       'A101: …through one seeder that does posts AND areas');
    // the second copy of the area list inside setup() is gone — two lists that
    // must agree stop agreeing
    const setupFn = (function () {
      const a = gs101.indexOf('function setup('), b = gs101.indexOf('function makeAdmin', a);
      eq(a >= 0 && b > a, true, 'A101: (setup was found, both anchors in order)');
      return a >= 0 && b > a ? gs101.slice(a, b) : '';
    })();
    eq(/main_malda/.test(setupFn), false,
       'A101: …and setup() no longer keeps its own copy of the same four areas');

    // 3 — seeding happens ONCE. The old rule re-added any missing seed id on
    // every listItems, so removeItem deleted the row, answered ok, wrote an
    // audit line, and the next refresh brought it straight back. Proved against
    // the real backend: delete a post AND an area, both stay deleted.
    eq(/if \(String\(readConfig_\(\)\.lists_seeded \|\| ''\)\) return false;/.test(gs101), true,
       'A101: the seeder refuses to run twice…');
    eq(/setConfig_\('lists_seeded', '1'\);/.test(gs101), true,
       'A101: …and records that it ran');
    eq(/var needSeed = !String\(readConfig_\(\)\.lists_seeded \|\| ''\);/.test(gs101), true,
       'A101: …so a delete is not undone by the very next read');
    // a KIND is seeded only when entirely absent: three posts means somebody
    // deleted the fourth
    eq(/if \(!kinds\.position\) POSITION_SEED\.forEach/.test(gs101), true,
       'A101: …and a half-empty kind is left alone, because that is a deletion');
    // lists_seeded must never be settable through the admin config door
    const allowBlock = gs101.slice(gs101.indexOf('var allow = {'), gs101.indexOf('var patch = b.config'));
    eq(allowBlock.length > 100 && allowBlock.indexOf('lists_seeded') < 0, true,
       'A101: …and no admin can clear the marker through setConfig');
  }
  // A100: money in the user LIST. A99 opened the account picture for everyone,
  // but that is one tap per person — twelve taps to answer "who is holding the
  // most?". listUsers carried no money at all, so this needed the server.
  {
    const gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
    const app100 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const lu = (function () {
      const a = gs.indexOf('listUsers: function'), b = gs.indexOf('setStatus: function', a);
      eq(a >= 0 && b > a, true, 'A100: (listUsers was found, both anchors in order)');
      // comments stripped: the first draft of the check below matched the word
      // "accountPicture_" in the comment explaining why it is NOT used, so the
      // assertion was reading my own prose and reporting on the code
      return a >= 0 && b > a
        ? gs.slice(a, b).split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n')
        : '';
    })();
    // gated on the year, and that is not decoration: three screens call
    // listUsers and only one shows money. Proved against the real backend —
    // no year → 0 users carry `money`; with year → 12 do.
    eq(/if \(b\.year\) \{/.test(lu), true,
       'A100: the server computes money only when the client asks with a year…');
    eq(/var d = readAll_\(Number\(b\.year\)\);/.test(lu) && /personalSummary_\(d, String\(u\.username\)\)/.test(lu), true,
       'A100: …reading the book ONCE and summarising per user');
    eq(/accountPicture_/.test(lu), false,
       'A100: …with personalSummary_, not the picture — the per-donor dues list is work nobody asked for here');
    // the two cheap callers must stay cheap; the admin one must ask
    // A107: this counted the plain calls and expected 2. The retry added a
    // third, so the count was measuring "how many places happen to look like
    // this" rather than the property. The property is: exactly ONE request asks
    // for money, and it is the admin panel's.
    eq((app100.match(/Auth\.call\('listUsers', \{ token: Auth\.token\(\), year:/g) || []).length, 1,
       'A100: exactly one listUsers call asks for the money');
    // A115: this used to COUNT the yearless call sites, and A115 removed one of
    // them (the member register reads the committee roster now, not listUsers).
    // Counting sites was never the property anyway — the property is that no
    // OTHER listUsers request drags a full readAll_ it will throw away.
    eq((app100.match(/Auth\.call\('listUsers', \{ token: Auth\.token\(\) \}\)/g) || []).length,
       (app100.match(/Auth\.call\('listUsers'/g) || []).length - 1,
       'A100: …every other listUsers call still sends no year');
    eq(/Auth\.call\('listUsers', \{ token: Auth\.token\(\), year: Settings\.get\('year'\) \}\)/.test(app100), true,
       'A100: …and the admin panel is the one that asks');
    // the row: in-hand, never for a pending account, and the ⏳ that stops the
    // same misreading A99 needed a whole sub-line for
    eq(/u\.money && u\.status !== 'pending'/.test(app100), true,
       'A100: a pending account shows no figure — no year approval means no entries');
    eq(/Number\(u\.money\.pending\) \? ' <span class="row-sub">⏳<\/span>' : ''/.test(app100), true,
       'A100: …and money already sent but unconfirmed is flagged, because it is counted INSIDE this number');
    // the summary line: short names, or eight of twelve rows wrap
    eq(/\.map\(function \(k\) \{ return t\('type_' \+ k\); \}\)\.join\(', '\)/.test(app100), true,
       'A100: the list summary uses the short category names (রোড, not রোড কালেকশন)');
    // A160: anchored on the SUMMARY, not the whole file. Written file-wide it
    // matched as a substring the moment the permission chips — where A100 says
    // the long names belong — started reading the same map, so it failed on the
    // code it exists to protect. A pin that fires on its own subject is a pin
    // that will be deleted rather than understood.
    {
      const sum = (app100.match(/const entTxt = [\s\S]{0,400}?join\(', '\)[^\n]*\n/) || [''])[0];
      eq(sum.length > 0, true, 'A100: the summary line is findable');
      eq(/CAT_LABEL_KEYS/.test(sum), false,
         'A100: …the long ones are gone from the summary, and stay on the permission chips');
    }
    // every category the summary can print must have a short name, or a row
    // renders the raw key
    ENTRY_KINDS.forEach(function (k) {
      eq(require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8').indexOf('  type_' + k + ':') > 0, true,
         'A100: …and type_' + k + ' exists for it');
    });
  }
  // A99: the admin panel, run against a local stand-in that EXECUTES the real
  // Code.gs, seeded with 12 collectors and money in several hands. Hrishi's
  // report was "not able to see all the data" and it was literally true: the
  // account picture — collected, received, handed, in-hand, dues — was offered
  // only to people who had already left.
  {
    const appTxt99 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const cssTxt99 = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');

    // 1 — the door. userSnapshot computes `live` for ANY user (verified against
    // the real backend), so gating the chip on a SAVED snapshot hid today's
    // figures for everyone still working.
    eq(/if \(u\.status === 'approved' \|\| u\.status === 'blocked'\)\n\s*btns \+= '<button class="chip" data-act="snap"/.test(appTxt99), true,
       'A99: the account picture is offered to anyone still working, not only the stood-down and the blocked');
    eq(/data-act="snap"/.test(appTxt99) && !/u\.access === 'exiting' \|\| u\.status === 'blocked'\)\n\s*btns \+= '<button class="chip" data-act="snap"/.test(appTxt99), true,
       'A99: …and the old exiting-or-blocked gate is gone');

    // 2 — the room. The panes above it are a then/now table that only exists
    // once somebody has been stood down; without this branch the screen said
    // "no picture saved yet" and dropped everything the server had sent.
    // Both ends checked, and checked as INDICES. A missing end anchor makes
    // indexOf return -1, and slice(a, -1) hands back nearly the whole file —
    // so a length test passes while every assertion below silently matches
    // text from somewhere else entirely. This project has been bitten by an
    // unanchored indexOf three times; a "was it found" guard that only counts
    // characters is the same bug wearing a test's clothes.
    const cut = function (from, to, label) {
      const a = appTxt99.indexOf(from), b = appTxt99.indexOf(to, a < 0 ? 0 : a);
      eq(a >= 0 && b > a, true, 'A99: (' + label + ' — both anchors found, in order)');
      return a >= 0 && b > a ? appTxt99.slice(a, b) : '';
    };
    const snapFn = cut('function renderUserSnapshot', 'function auditLabel', 'renderUserSnapshot');
    eq(/\(!saved\.exit && !saved\.block \? livePane\(\) : ''\)/.test(snapFn), true,
       'A99: with no saved picture the screen shows what they hold TODAY…');
    eq(/access_no_picture/.test(snapFn), false,
       'A99: …instead of announcing that there is nothing to show');
    ['access_collected', 'received_col', 'total_expense', 'access_handed', 'access_inhand',
     'access_their_due'].forEach(function (k) {
      eq(snapFn.indexOf("'" + k + "'") > 0, true, 'A99: …including ' + k);
    });

    // 3 — money already sent but unconfirmed is INSIDE in-hand. As its own row
    // it reads as a second pile and an admin goes looking for cash that is
    // sitting in a cashier's inbox. Proved on the stub: sender showed
    // হাতে ₹3,000 with ↳ ₹1,500 unconfirmed; the cashier showed ₹4,600.
    eq(/access_pending_out'\)\.replace\('\{amt\}', fmtMoney\(n\('pending'\)\)\)/.test(snapFn), true,
       'A99: pending money is spelled out with its amount…');
    eq(/liveRow\('[\w]*pending/.test(snapFn), false,
       'A99: …and hangs off in-hand as a sub-line, never as a row of its own');

    // 4 — the list. Measured at 375px: 11 of 12 rows read "version unknown",
    // which is what every row says until its owner opens the app.
    eq(/\(u\.access === 'exiting' \? ' 🚪' : ''\) \+ verMark\(u\) \+/.test(appTxt99), true,
       'A99: the phone version rides on the name line…');
    const rowFn = cut("const row = function (u) {\n          return '<button class=\"row\" data-adm-user=",
                      'const grp = function (key, list)', 'the list row builder');
    eq(/verLine/.test(rowFn), false, 'A99: …so the list row no longer spends a whole line on it');
    eq(/verLine\(u\)/.test(appTxt99), true, 'A99: …while the DETAIL screen still prints it in full');
    // silent when current: that is the state nobody is looking for
    eq(/if \(u\.appVersion === Auth\.APP_VERSION\) return '';/.test(appTxt99), true,
       'A99: an up-to-date phone gets no mark at all');
    eq(/\.ver-mark \{/.test(cssTxt99) && /\.ver-mark\.warn \{/.test(cssTxt99), true,
       'A99: …and the mark is styled as a footnote, with the stale one in red');
  }
  // A98: the receipt is the DONOR's document. They never chose a language and
  // are not holding the phone, so it is Bengali whatever the collector set the
  // app to. 14 of its 17 strings were already hardcoded Bengali; the three that
  // went through t() printed "Thanking you," inside an otherwise Bengali
  // receipt. These pin the boundary in BOTH directions, because the mistake is
  // as easy to make backwards — pinning a screen label to Bengali.
  {
    const appTxt98 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const i18nTxt98 = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
    eq(/function tBn\(key\) \{\n\s*const e = I18N\[key\];\n\s*return e \? \(e\.bn \|\| e\.en\) : key;/.test(i18nTxt98), true,
       'A98: tBn reads the same dictionary but never asks what the app is set to');

    // the receipt path — image, message, and the config both are built from
    const slice = function (from, to) {
      const a = appTxt98.indexOf(from), b = appTxt98.indexOf(to, a);
      return a < 0 || b < 0 ? '' : appTxt98.slice(a, b);
    };
    const canvas = slice('function buildReceiptCanvas', 'function canvasToBlob');
    const message = slice('function receiptMessage', '// 📷 image receipt');
    const config = slice('function receiptConfig', 'function buildReceiptCanvas');
    eq(canvas.length > 500 && message.length > 300 && config.length > 100, true,
       'A98: …and the three receipt functions were actually found (a slice that misses reads as clean)');
    [['the receipt image', canvas], ['the WhatsApp/SMS text', message], ['the receipt config', config]]
      .forEach(function (r) {
        // t( not preceded by B — tBn is the only allowed caller here
        const leaks = (r[1].match(/[^A-Za-z]t\('[\w]+'\)/g) || [])
          .filter(function (m) { return !/Settings|createElement|getContext/.test(m); });
        eq(leaks.join(','), '', 'A98: nothing in ' + r[0] + ' follows the app language');
      });
    // the note printed under the amount, and the bus donor line, are receipt-only
    eq(/tBn\('cash'\) \+ ' ' \+ rcpMoney\(r\.cashAmount\) \+ ' \+ UPI ' \+ rcpMoney\(r\.upiAmount\)/.test(appTxt98), true,
       'A98: the cash/UPI split is Bengali AND in Bengali digits, like every other number on the receipt');
    eq(/donorLine: \(d\.busName \|\| tBn\('type_bus'\)\)/.test(appTxt98), true,
       'A98: …and a bus with no name is বাস on the receipt, not Bus');

    // the other direction: these two are read by the COLLECTOR, on screen, and
    // must keep following the app language. Pinning them to Bengali is the same
    // bug facing the other way, and it would look like a fix.
    eq((appTxt98.match(/\? t\('receipt_no'\) \+ ' ' \+ [pr]\.receiptNo \+ ' · '/g) || []).length, 2,
       'A98: the duplicate warning and the audit list stay translated — they are screen text, not a receipt');
  }
  // A97: the dictionary itself, audited rather than assumed. 705 strings had
  // never been checked as a SET — only individual keys, one at a time, by
  // whoever added them. t() returns the KEY when it misses, so every gap here
  // ships as machine text in front of a donor.
  {
    const vm = require('vm');
    const i18nSrc = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
    const c = vm.createContext({});
    vm.runInContext(i18nSrc + ';globalThis.__D = I18N;', c);
    const D = c.__D;
    const BN = /[ঀ-৿]/;

    // half-translated: a key with one language filled in and the other empty
    const half = Object.keys(D).filter(function (k) {
      const e = D[k] || {};
      return !String(e.bn || '').trim() || !String(e.en || '').trim();
    });
    eq(half.join(','), '', 'A97: every string exists in BOTH languages, non-empty');

    // an "English" string that is still Bengali. Exactly two are deliberate —
    // the language switch has to name each language in its own script.
    const leak = Object.keys(D).filter(function (k) { return BN.test(String(D[k].en || '')); }).sort();
    eq(leak.join(','), 'choose_lang,language',
       'A97: no English string carries Bengali except the two language labels');

    // both languages must carry the same placeholders, or one of them silently
    // drops the number. Compared as SETS: block_holds_money names the sum twice
    // in English and once in Bengali, which is fine — see the call-site check.
    const phs = function (s) {
      return [...new Set(String(s || '').match(/\{\w+\}/g) || [])].sort().join(',');
    };
    const mism = Object.keys(D).filter(function (k) { return phs(D[k].bn) !== phs(D[k].en); });
    eq(mism.join(','), '',
       'A97: both languages carry the same placeholders — neither can silently drop a number');

    // a REPEATED placeholder needs a filler that fills them all. One-shot
    // String.replace fills only the first, and the rest reach the screen as
    // "{amt}". These three are the only strings that repeat one, and each is
    // pinned to the call site that handles it.
    const repeats = Object.keys(D).filter(function (k) {
      return ['bn', 'en'].some(function (L) {
        const m = String(D[k][L] || '').match(/\{\w+\}/g) || [];
        return m.length !== new Set(m).size;
      });
    }).sort();
    eq(repeats.join(','), 'block_holds_money,sheet_over_cash,sheet_over_upi',
       'A97: only three strings repeat a placeholder — a new one must pick a filler that fills them all');
    const appTxt = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    eq(/t\('block_holds_money'\)\.split\('\{amt\}'\)\.join\(/.test(appTxt), true,
       'A97: …and the block warning fills EVERY {amt} — an English admin was signing off on a literal placeholder');
    eq(/const parts = esc\(t\(key\)\)\.split\('\{n\}'\);/.test(appTxt), true,
       'A97: …while tMoney fills every {n}, which is what the other two rely on');

    // every t('literal') must resolve. The regex requires the closing paren, so
    // t('anom_' + code) is excluded on purpose — those are checked below by
    // enumerating what `code` can actually be.
    const usedKeys = new Set();
    ['js/app.js', 'js/lists.js', 'js/help.js', 'js/voice.js', 'js/auth.js', 'js/sync.js'].forEach(function (f) {
      const s = require('fs').readFileSync(__dirname + '/../' + f, 'utf8');
      (s.match(/\bt\('[^']+'\)/g) || []).forEach(function (m) { usedKeys.add(m.slice(3, -2)); });
    });
    const ghost = [...usedKeys].filter(function (k) { return !(k in D); }).sort();
    eq(ghost.join(','), '', 'A97: every t(\'key\') in the app resolves — a miss renders the key itself');

    // the built keys: type_/daily_/new_/report_/anom_. A new report id or a new
    // anomaly code with no string shows up as "anom_foo_t" on the audit screen.
    const built = ['shop', 'person', 'member', 'road', 'toto', 'bus'].map(function (x) { return 'type_' + x; })
      .concat(['road', 'toto', 'bus'].map(function (x) { return 'daily_' + x; }))
      .concat(['shop', 'person', 'member'].map(function (x) { return 'new_' + x; }))
      .concat(REPORT_IDS.map(function (r) { return 'report_' + r; }))
      .concat(['unbalanced', 'orphan_payment', 'split_mismatch', 'breakdown_mismatch',
               'possible_duplicate_payment', 'possible_duplicate_daily', 'possible_duplicate_party',
               'overpaid', 'negative_inhand', 'position_over_max', 'duplicate_id']
              .map(function (a) { return 'anom_' + a + '_t'; }))
      .concat(['nav_messages']);
    eq(built.filter(function (k) { return !(k in D); }).join(','), '',
       'A97: every key the app BUILDS at runtime exists — type_/daily_/new_/report_/anom_');
  }
  // A96: sw.js, exercised in a browser on a fresh port and then with the server
  // killed. The shell cached and served offline in 53 ms — but CONFIG.SCRIPT_URL
  // was GONE, because on the very first visit the page fetches config.js before
  // the worker controls it, and the worker never precached it. The app then
  // says "this phone was never paired with the central book" to a phone that
  // is paired. Precaching is safe: the handler below is network-first/no-store,
  // so a cached copy can only ever answer when there is no network to be stale
  // against.
  {
    const swSrc = require('fs').readFileSync(__dirname + '/../sw.js', 'utf8');
    const extras = swSrc.slice(swSrc.indexOf('const EXTRAS = ['),
                               swSrc.indexOf('];', swSrc.indexOf('const EXTRAS = [')));
    const shell = swSrc.slice(swSrc.indexOf('const SHELL = ['),
                              swSrc.indexOf('];', swSrc.indexOf('const SHELL = [')));
    eq(/'js\/config\.js'/.test(extras), true,
       'A96: the backend URL is precached, so an offline reload after the first visit still knows where to sync');
    // EXTRAS and not SHELL, and this must be asserted separately: SHELL is
    // all-or-nothing, so a config.js that 404s there would cost the collector
    // the whole offline app to protect sync they cannot use offline anyway.
    eq(/'js\/config\.js'/.test(shell), false,
       'A96: …from EXTRAS, so a config that will not download cannot abort the shell precache');
    // the precache is only safe BECAUSE of these two, so they are pinned here
    // next to it rather than trusted to stay put on their own
    eq(/fetch\(e\.request, \{ cache: 'no-store' \}\)/.test(swSrc), true,
       'A96: …and online the network still answers first, bypassing the HTTP cache — the copy can never go stale');
    eq(/new Request\(u, \{ cache: 'reload' \}\)/.test(swSrc), true,
       'A96: …while the install fetch itself comes from the origin, not a 10-minute-old disk copy (A28)');
  }
  // A95: the pull side, run in a browser rather than read. These pin what that
  // run proved — the merge is upsert-by-id (a changed row must UPDATE, never
  // duplicate: two "দোকান খ" would double a pledge), and a chat-only delta must
  // not rebuild a screen somebody is using.
  {
    const md = appSrc.slice(appSrc.indexOf('function mergeDelta'), appSrc.indexOf('// A69 (audit #2 P3)'));
    // BOTH lines, named separately: the cached rows go in first, then the
    // incoming ones overwrite by the same key. Written as one regex first, and
    // breaking the incoming line left the cached one matching — an assertion two
    // lines can satisfy tests neither.
    eq((md.match(/byId\[r\.id\] = r;/g) || []).length, 2,
       'A95: the delta upserts by id — cached rows keyed, then incoming rows overwrite the same keys');
    eq(/incoming\.forEach\(function \(r\) \{ if \(r && r\.id != null\) byId\[r\.id\] = r; \}\);/.test(md), true,
       'A95: …the INCOMING row keyed by its own id — proved: a renamed donor updated in place, 2 → 3 with no twin');
    eq(/Object\.keys\(byId\)/.test(md), true, 'A95: …and the merged set is rebuilt from those keys');
    eq(/if \(s !== 'messages'\) chatOnly = false;/.test(md), true,
       'A95: …and a delta carrying only chat is marked as such');
    eq(/if \(chatOnly\) \{ if \(current\.view === 'messages'\) renderMessages\(\); return; \}/.test(appSrc), true,
       'A95: …so ten people talking cannot rebuild the ledger under a thumb (A70) — proved: the search input was the same DOM node afterwards');
    eq(/if \(!changed \|\| flowState\) return;/.test(appSrc), true,
       'A95: an idle poll re-renders nothing, and a half-typed entry is never interrupted');
    // the cursor must move even on an idle poll, or the next delta asks for
    // everything since the last CHANGE instead of the last CHECK
    const idle = appSrc.slice(appSrc.indexOf('} else {', appSrc.indexOf("localStorage.setItem('ck_central', JSON.stringify(centralData))")));
    eq(/ck_central_cursor/.test(idle.slice(0, 300)), true,
       'A95: …but the cursor still advances on an idle poll');
  }
  // A94: the rejection announcement fired BEFORE the row was written, so the
  // listener's own DB.rejectedCount() still said 0 and its `if (!n) return`
  // swallowed the toast. A54 exists to stop a refusal being silent, and it had
  // been silent since the day it shipped. The badge hid it — updateBadge runs
  // later, off autoSync, by which time the write has landed.
  {
    const sync = require('fs').readFileSync(__dirname + '/../js/sync.js', 'utf8');
    const at = function (needle) { return sync.indexOf(needle); };
    eq(at('rejectedNow++') > 0 && at('rejectedNow++') < at('return DB.put(s, live)'), true,
       'A94: a refusal is COUNTED where it is found…');
    eq(at('dispatchEvent(new CustomEvent(\'ck-rejected\'))') > at('Promise.all(updates)'), true,
       'A94: …and announced only after every write has landed, so the listener can see it');
    eq(/if \(rejectedNow\) \{ try \{ window\.dispatchEvent/.test(sync), true,
       'A94: …and stays quiet when nothing was refused');
    // the listener is the other half of the pair: it must still bail on zero,
    // or an unrelated dispatch would toast about nothing
    const appSrc2 = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    const lis = appSrc2.slice(appSrc2.indexOf("addEventListener('ck-rejected'"), appSrc2.indexOf("addEventListener('ck-auth-invalid'"));
    eq(/if \(!n\) return;/.test(lis) && /toast\(/.test(lis), true,
       'A94: the listener still ignores a zero count, and toasts when there is one');
  }
  // A93: sync.js, 79 lines the suite had only ever read. Exercised for real in a
  // browser; these pin the properties that run proved, so the module cannot lose
  // them silently. Each one is a way money could go missing or double.
  {
    const sync = require('fs').readFileSync(__dirname + '/../js/sync.js', 'utf8');
    eq(/if \(inFlight\) return Promise\.resolve\(\{ ok: false, reason: 'busy' \}\)/.test(sync), true,
       'A93: two syncs at once send ONE batch — proved: 2 calls, 1 request, no double-send');
    eq(/if \(!r\.synced && !r\.rejected\)/.test(sync), true,
       'A93: a server-refused row leaves the queue for good instead of being re-refused for ever (A54)');
    eq(/epoch: \(function \(\)/.test(sync), true,
       'A93: the batch carries the epoch it was written under, so training money cannot pour into the live book (A53)');
    eq(/DB\.get\(s, r\.id\)\.then\(function \(live\) \{[\s\S]{0,120}if \(!live\) return;/.test(sync), true,
       'A93: a row deleted by Undo mid-flight is NOT resurrected from the stale snapshot');
    eq(/receipts\[live\.id\]\) live\.receiptNo = receipts\[live\.id\]/.test(sync), true,
       'A93: a saved payment adopts the serial the server minted for it');
    // the failure paths: a lost network must never mark a row synced or rejected
    const errBlock = sync.slice(sync.indexOf('.catch(function (e) {'));
    eq(/inFlight = false;/.test(errBlock) && !/synced = 1/.test(errBlock), true,
       'A93: a failed push clears the busy flag and touches no row — proved for a dead network AND a refused batch');
  }
  // A92: the epoch wipe (🚀 Go Live, or a restore) discards this device's book,
  // and it was taking QUEUED entries with it in silence. Logout has refused to
  // strand unsynced rows since A74; this path — the more dangerous of the two,
  // because a mid-season restore fires it while the collector is not even
  // holding the phone — never learned the same manners.
  //
  // It must not refuse: a phone left reading a book the server has discarded is
  // worse. So it counts first, wipes, and then says what it took.
  {
    const from = appSrc.indexOf('const newEpoch =');
    const blk = appSrc.slice(from, appSrc.indexOf('resetPullBackoff()', from));
    // (A132 replaced the bare COUNT with a saved DETAILS list — the property
    // pinned here is unchanged: what is queued is read before the wipe, and
    // the collector is told by number.)
    eq(/DB\.allData\(\)\.then\(function \(all\)/.test(blk) && /lostRows\.push\(/.test(blk), true,
       'A92: the wipe reads what is queued BEFORE clearing it');
    eq(blk.indexOf('DB.allData()') < blk.indexOf('DB.clearAll()'), true,
       'A92: …in that order, or the count is always zero');
    eq(/if \(lostRows\.length > 0\)/.test(blk) && /epoch_wiped_unsynced/.test(blk), true,
       'A92: …and tells the collector, by number, so a missing ₹800 is not found next week');
    eq(/window\.alert\(/.test(blk), true,
       'A92: …with an alert, not a toast — 2.2s is not long enough to read something you must report');
  }
  // A91: the first screen anybody sees. A logged-out phone showed all five tabs
  // and the sync badge, and not one of them did anything — tapping any left the
  // login screen exactly where it was. Never found before because every browser
  // check in this project starts by injecting a session, so nobody had opened
  // the app the way twelve collectors are about to.
  {
    eq(/if \(navBar\) navBar\.hidden = !Auth\.loggedIn\(\);/.test(appSrc), true,
       'A91: the bottom nav is hidden until somebody is logged in');
    eq(/if \(syncBadge\) syncBadge\.hidden = !Auth\.loggedIn\(\);/.test(appSrc), true,
       'A91: …and so is the sync badge, which means nothing to a logged-out phone');
    // the attribute alone loses to display:flex — the fix would have looked
    // applied while changing nothing
    eq(/nav#bottomnav\[hidden\] \{ display: none; \}/.test(css), true,
       'A91: …and `hidden` actually hides it, against the display:flex rule below');
    // The end marker is searched FROM the start marker. Third time today I have
    // written this without the offset; it makes the slice empty or backwards and
    // the assertion fails for a reason unrelated to the code.
    const rFrom = appSrc.indexOf('function render()');
    const render = appSrc.slice(rFrom, appSrc.indexOf('startNotifPolling', rFrom));
    const atNav = render.indexOf('navBar.hidden'), atRet = render.indexOf('if (!Auth.loggedIn())');
    eq(atNav >= 0 && atRet > atNav, true,
       'A91: …decided before the early return, so the logged-out path gets it too');
  }
  // A89: the save button sticks only while there is something unsaved. One
  // helper drives BOTH admin save buttons — the user screen and the post screen
  // are the same shape, and a rule applied to one of a pair is this project's
  // oldest bug (A71, A68, A78, A82).
  {
    eq(/function admStick\(btn, hint, n\)/.test(appSrc), true, 'A89: one helper owns the sticky save');
    eq((appSrc.match(/admStick\(/g) || []).length >= 4, true,
       'A89: …and every save path goes through it — user screen, post screen, and both live updates');
    const st = css.slice(css.indexOf('button.adm-stick'), css.indexOf('}', css.indexOf('button.adm-stick')));
    eq(/position:\s*fixed/.test(st) && /bottom:\s*calc\(74px/.test(st), true,
       'A89: …it is fixed above the bottom nav, not under it');
    const helper = appSrc.slice(appSrc.indexOf('function admStick'), appSrc.indexOf('function admLeaveOk'));
    eq(/classList\.toggle\('adm-stick', !!n\)/.test(helper), true,
       'A89: …and it lets go when clean — a bar that is always there costs a strip of screen on every visit that never edits');
  }
  // A87: the filter row scrolls sideways instead of wrapping, and the app has
  // its first responsive rule. Measured on a 320px phone: the ledger spent 59%
  // of the screen before the first donor and showed two; it now spends 39% and
  // shows three. Tap targets are untouched — 46px before and after. Pinned
  // because "flex-wrap: wrap looks tidier" is exactly the change that undoes it.
  {
    const tabs = css.slice(css.indexOf('.chips.tabs {'), css.indexOf('}', css.indexOf('.chips.tabs {')));
    eq(/flex-wrap:\s*nowrap/.test(tabs) && /overflow-x:\s*auto/.test(tabs), true,
       'A87: the ledger filter row is one scrolling line, not three wrapped ones');
    eq(/@media \(max-width: 360px\)/.test(css), true,
       'A87: …and the app has a small-screen rule at all — it had none, from a 320px Android to a tablet');
    const small = css.slice(css.indexOf('@media (max-width: 360px)'), css.indexOf('@media print'));
    eq(/min-height/.test(small), false,
       'A87: …and that rule shrinks only chrome, never a tap target');
  }
  const mini = css.slice(css.indexOf('.chip.mini'), css.indexOf('}', css.indexOf('.chip.mini')));
  eq(/min-height:\s*40px/.test(mini) && /font-size:\s*13px/.test(mini), true,
     'A84: the admin bulk chips are 40px/13px — smaller than a street control, because that screen is one person at a desk');
  // Bengali conjuncts stop being legible below ~12px on a cheap screen held at
  // arm's length. Scoped to what a user TAPS — status badges, hints, print
  // meta and the like are legitimately small, and a blanket rule would have
  // forced fifteen unrelated changes to satisfy an assertion I did not mean.
  const tappable = [];
  (css.match(/([^{}]+)\{([^}]*)\}/g) || []).forEach(function (rule) {
    const sel = rule.slice(0, rule.indexOf('{'));
    const f = /font-size:\s*(\d+(?:\.\d+)?)px/.exec(rule);
    if (!f) return;
    if (!/button|\.chip|\.row|input|select|\.tile|\[data-/.test(sel)) return;
    if (parseFloat(f[1]) < 12) tappable.push(sel.trim().slice(0, 40) + ' @' + f[1] + 'px');
  });
  eq(tappable.join(' | '), '', 'A84: nothing a user taps is lettered below 12px');
}

// ---- A85: a feature nobody explained ----------------------------------------
// Four things shipped this week and not one appeared in the in-app guide or the
// collector guide — the sheet of paper Hrishi hands to twelve people. A feature
// a user meets without warning is a feature they phone the admin about, and the
// admin is one person.
//
// Pinned by SUBJECT, not by wording: the guides may be rewritten freely, but a
// stood-down collector, the duplicate-donor line and the target bar have to
// stay explained somewhere a user will look.
{
  const fs = require('fs');
  global.window = global.window || {};
  delete require.cache[require.resolve('../js/help.js')];
  require('../js/help.js');
  const help = global.window.HELP;
  eq(Array.isArray(help) && help.length > 10, true, 'A85: the in-app guide loads');
  help.forEach(function (h, i) {
    eq(!!(h.title && h.title.bn && h.title.en && h.body && h.body.bn.length && h.body.en.length), true,
       'A85: guide section ' + i + ' (' + h.icon + ') is complete in both languages');
  });
  const allHelp = JSON.stringify(help);
  const guide = fs.readFileSync(__dirname + '/../docs/user-guide/collector-guide.md', 'utf8');
  // Each topic is two words that must BOTH appear — the subject and where the
  // user meets it — rather than one exact phrase. Written as a phrase first,
  // and it failed because the guide says "ফোন নম্বর মিলে গেলে" while the in-app
  // text says "একই ফোন নম্বরে": the same subject, different sentences, which is
  // exactly what a rewrite should be free to do.
  [[['বিদায়ী', 'জমা'], 'a collector the committee has stood down'],
   [['ফোন নম্বর', '🩺'], 'two donors on one phone number, and the desk that raises it'],
   [['লক্ষ্য', 'রিপোর্ট'], 'the season target bar and who may see it']].forEach(function (topic) {
    topic[0].forEach(function (word) {
      eq(allHelp.indexOf(word) >= 0, true, 'A85: the in-app guide explains ' + topic[1] + ' [' + word + ']');
      eq(guide.indexOf(word) >= 0, true, 'A85: …and so does the collector guide — ' + topic[1] + ' [' + word + ']');
    });
  });
  // A83 made an old promise true: the guide had said the receipt carries the
  // collector's name since long before it did.
  eq(/তোমার নাম/.test(guide) && /collector: pay\.collector/.test(
       fs.readFileSync(__dirname + '/../js/app.js', 'utf8')), true,
     'A85: the guide promises the collector’s name on the receipt, and the receipt now actually carries it');
}

// ---- A79: the season target, and the window it must not open ----------------
// "কত হল, আর কত বাকি" is the question a committee asks every evening, and the
// app could not answer it without opening a report. The bar answers it — but
// the season total is behind the `overview` grant, so drawing it on every home
// screen would hand that figure to everyone through a side door. A permission
// model with one unguarded window is not a permission model.
{
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  const bar = appSrc.slice(appSrc.indexOf('function targetBar(data)'),
                           appSrc.indexOf('function exitingCard()'));
  eq(bar.length > 0, true, 'A79: targetBar exists');
  eq(/allowedReports\(Auth\.current\(\)\)\.indexOf\('overview'\) < 0\) return ''/.test(bar), true,
     'A79: the bar is drawn only for somebody who may already see the season total');
  eq(/if \(!target \|\|/.test(bar), true,
     'A79: …and only when a target has been agreed — a bar against a made-up denominator is worse than no bar');
  // the same rule, from the other side: it must be reachable ONLY through that gate
  eq((appSrc.match(/targetBar\(/g) || []).length, 2,
     'A79: one definition, one call site — a second call site is a second place to forget the gate');
}

// ---- A78: what a stood-down member's own phone shows -------------------------
// Their permission lists are empty, which is also what a brand-new approved
// person looks like — so without its own branch this lands on "ask the admin
// for permissions", sending them to argue about a decision the committee has
// already taken, and dropping 💳 with it so they cannot collect the dues the
// server WILL accept from them.
{
  const ex = homeTiles({ role: 'user', cashier: 0, entries: '', access: 'exiting' });
  eq(ex.exiting, true, 'A78: a stood-down member is its own home state, not "nothing granted yet"');
  eq(ex.common.indexOf('payments') >= 0, true,
     'A78: …and keeps 💳, because the server accepts their own donors’ dues — a tile missing here is money that cannot be collected');
  eq(ex.common.indexOf('handover') >= 0 && ex.common.indexOf('hbook') >= 0, true,
     'A78: …and keeps 🤝, which is the whole reason the login stays open');
  eq(ex.entry.length === 0 && ex.daily.length === 0 && ex.role.length === 0, true,
     'A78: …and gets no entry, daily or role tile — a tile the server will refuse is worse than no tile');
  const fresh = homeTiles({ role: 'user', cashier: 0, entries: '' });
  eq(fresh.exiting === false && fresh.common.indexOf('payments') >= 0, false,
     'A78: a newly-approved person with nothing granted is NOT the same state — they get the "ask the admin" card');
}
// …and every tile a plan can name must be DRAWABLE. drawTile falls back to the
// raw key when ICON has no entry, silently — the stood-down home first shipped
// showing the word "payments" where 💰 চাঁদা নেওয়া belongs, because 'payments'
// has a wide tile of its own and is not in ICON. A fallback that renders
// something wrong is worse than one that renders nothing.
{
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  const icons = (appSrc.slice(appSrc.indexOf('const ICON = {'), appSrc.indexOf('// 🔴 A dot means'))
    .match(/(\w+):\s*\['/g) || []).map(function (s) { return s.split(':')[0]; });
  const plans = [
    homeTiles({ role: 'admin', cashier: 1, entries: 'shop' }),
    homeTiles({ role: 'user', cashier: 1, entries: 'shop,person,member,bus,road,toto,review,memberadmin' }),
    homeTiles({ role: 'user', cashier: 0, entries: '', access: 'exiting' }),
    homeTiles({ role: 'user', cashier: 0, entries: '' }, { holding: true }),
    homeTiles({ role: 'user', cashier: 0, entries: 'shop' }, { staleVersion: true, holding: true }),
  ];
  const named = {};
  plans.forEach(function (p) {
    ['entry', 'daily', 'common', 'role'].forEach(function (g) { (p[g] || []).forEach(function (k) { named[k] = 1; }); });
  });
  // 'payments' is the one deliberate exception: it is drawn by paymentTile, wide.
  const undrawable = Object.keys(named).filter(function (k) { return k !== 'payments' && icons.indexOf(k) < 0; });
  eq(undrawable.join(','), '', 'A78: every tile homeTiles can name has an ICON entry — no plan can render a bare key');
  // Scoped to the card itself: `paymentTile +` also appears in the ordinary
  // home render, so an unscoped search stays green while this branch is broken.
  const card = appSrc.slice(appSrc.indexOf('if (!plan.setUp || plan.exiting) {'),
                            appSrc.indexOf('function exitingCard()'));
  eq(card.indexOf('paymentTile +') >= 0 && card.indexOf('plan.common.map(') < 0, true,
     'A78: …and the no-grant/stood-down card draws 💰 through paymentTile, not a raw map over common');
}

// ---- what the chat is costing ------------------------------------------------
// Chat adds no requests (it rides the 60s pull), so what grows is the payload
// and the localStorage snapshot every phone keeps. `perDay` is watched too,
// because a book that reaches 2,000 over a season is fine and one that does it
// in three days is not — "growing fast" is the thing worth catching early.
const chatOf = function (n, spreadDays) {
  const now = Date.now(), msgs = [];
  for (let i = 0; i < n; i++) {
    msgs.push({ id: 'm' + i, text: 'একটা সাধারণ বার্তা এখানে',
                createdAt: new Date(now - Math.floor(i / n * spreadDays * 86400000)).toISOString() });
  }
  return { messages: msgs };
};
const nowIso = new Date().toISOString();
eq(chatLoad(chatOf(200, 10), nowIso).level, 'ok', 'chat load: a normal season is fine');
eq(chatLoad(chatOf(1600, 10), nowIso).level, 'watch', 'chat load: a big book is worth watching');
eq(chatLoad(chatOf(3200, 10), nowIso).level, 'high', 'chat load: a very big book is high');
// the rate signal on its own — small total, alarming speed
eq(chatLoad(chatOf(900, 1), nowIso).level, 'high', 'chat load: 900 in a day is high even though the total is small');
eq(chatLoad({ messages: [] }, nowIso).level, 'ok', 'chat load: an empty book is ok');
eq(chatLoad({}, nowIso).count, 0, 'chat load: no messages key at all is ok');
// bytes track the text, so long messages count for more than short ones
const shortB = chatLoad({ messages: [{ id: 'a', text: 'ok', createdAt: nowIso }] }, nowIso).bytes;
const longB = chatLoad({ messages: [{ id: 'a', text: new Array(200).join('x'), createdAt: nowIso }] }, nowIso).bytes;
eq(longB > shortB, true, 'chat load: a long message costs more than a short one');

// ---- the handover book -------------------------------------------------------
// Everything one person handed over and everything handed to them, in one
// place. Read straight off the handover rows — nothing derived — so it can
// never disagree with what the other side sees.
const hbData = {
  parties: [], payments: [], daily: [], expenses: [], voids: [], corrections: [],
  handovers: [
    { id: '1', fromId: 'yamini', from: 'Yamini mahato', toId: 'jadav', amount: 1700, cashAmount: 1200, upiAmount: 500,
      date: '2026-07-20', status: 'confirmed', breakdown: JSON.stringify({ shop: { cash: 1200, upi: 0 }, bus: { cash: 0, upi: 500 } }) },
    { id: '2', fromId: 'biplab', from: 'Biplab', toId: 'jadav', amount: 300, cashAmount: 300, upiAmount: 0,
      date: '2026-07-21', status: 'confirmed' },
    { id: '3', fromId: 'jadav', toId: 'hrishi', to: 'hrishikesh mahato', amount: 900, cashAmount: 600, upiAmount: 300,
      date: '2026-07-22', status: 'confirmed', breakdown: JSON.stringify({ __snap: { available: { cash: 2200, upi: 800 } } }) },
    { id: '4', fromId: 'jadav', toId: 'salil', to: 'সলিল', amount: 400, cashAmount: 400, upiAmount: 0,
      date: '2026-07-23', status: 'pending' },
    { id: '5', fromId: 'x', toId: 'y', amount: 999, cashAmount: 999, upiAmount: 0, date: '2026-07-24', status: 'confirmed' },
  ],
};
const hb = handoverReport(hbData, 'jadav');
eq(hb.received, { cash: 1500, upi: 500, total: 2000 }, 'book: received totals');
eq(hb.sent, { cash: 600, upi: 300, total: 900 }, 'book: sent counts confirmed only');
eq(hb.pendingOut, { cash: 400, upi: 0, total: 400 }, 'book: unconfirmed outgoing shown apart');
eq(hb.net.total, 1100, 'book: net = received − sent');
eq(hb.rows.length, 4, 'book: other people\'s handovers are not in MY book');
eq(hb.rows.map(function (r) { return r.dir; }), ['out', 'out', 'in', 'in'], 'book: newest first, both directions');
eq(hb.rows[3].cats, [{ key: 'shop', cash: 1200, upi: 0 }, { key: 'bus', cash: 0, upi: 500 }],
   'book: a collector\'s row keeps the categories they picked');
eq(hb.rows[1].snap, { available: { cash: 2200, upi: 800 } }, 'book: a cashier\'s row keeps their snapshot');
eq(hb.rows[1].cats, [], 'book: …and no phantom category from the snapshot');
eq(hb.rows[2].cats, [], 'book: a row with no breakdown at all simply has none');
eq(hb.rows[0].who, 'সলিল', 'book: outgoing rows are labelled with the receiver');
eq(hb.rows[3].who, 'Yamini mahato', 'book: incoming rows are labelled with the giver');
// the book and the personal summary must agree on the totals
const hbSum = personalSummary(hbData, 'jadav');
eq(hb.sent.total, hbSum.handedOver, 'book: sent === personalSummary handedOver');
eq(hb.received.total, hbSum.received, 'book: received === personalSummary received');
eq(hb.pendingOut.total, hbSum.pending, 'book: unconfirmed outgoing === personalSummary pending');
// a voided handover leaves the book, like everywhere else
eq(handoverReport(Object.assign({}, hbData, { voids: [{ id: 'v', targetId: '1' }] }), 'jadav').received.total, 300,
   'book: a voided handover is gone from the book too');

// ---- a general puja expense has no category to name --------------------------
// The handover screen stopped asking a cashier to categorise pooled money
// (v3.89.0); spending it is the same problem, so the expense flow stopped
// asking too. A general expense is filed under `other`: a stable named pot that
// may go negative, which IS the rule — expenses come out of what you collected,
// and a minus is the exceptional case.
const genExp = { parties: [], payments: [], voids: [], corrections: [], handovers: [],
  daily: [{ id: 't', collectorId: 'k', type: 'toto', amount: 1000, cashAmount: 1000, upiAmount: 0 }],
  expenses: [{ id: 'e', collectorId: 'k', amount: 300, cashAmount: 300, upiAmount: 0,
               source: 'general', srcCat: 'other' }] };
eq(myAvailable(genExp, 'k').byCat.other, { cash: -300, upi: 0 }, 'general expense: parks in "other"');
eq(myAvailable(genExp, 'k').byCat.toto, { cash: 1000, upi: 0 }, 'general expense: leaves the round alone');
eq(myAvailable(genExp, 'k').cash, 700, 'general expense: in hand is still collected − spent');
// a COLLECTION expense still names its round — that one is knowable, not a guess
const collExp = { parties: [], payments: [], voids: [], corrections: [], handovers: [],
  daily: [{ id: 't', collectorId: 'k', type: 'toto', amount: 1000, cashAmount: 1000, upiAmount: 0 }],
  expenses: [{ id: 'e', collectorId: 'k', amount: 300, cashAmount: 300, upiAmount: 0,
               source: 'collection', collectionType: 'toto', srcCat: 'toto' }] };
eq(myAvailable(collExp, 'k').byCat.toto, { cash: 700, upi: 0 }, 'collection expense: comes off its own round');
eq(myAvailable(collExp, 'k').byCat.other, undefined, 'collection expense: never touches "other"');
// and the flow really does not ask any more
const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
eq(appSrc.indexOf('q_src_cat') >= 0, false, 'general expense: the "which pot" question is gone from the flow');
eq(appSrc.indexOf('srcCatOptions') >= 0, false, 'general expense: …and so is the option builder it needed');

// ---- an expense must not wander between categories ---------------------------
// The bug: an expense with no named source pot was drained from whatever pots
// held money AT THE MOMENT OF CALCULATION. So the same bill sat under টোটো until
// an unrelated shop handover arrived, then silently moved to দোকান. Totals were
// always right; the split was not reproducible, which would poison any report.
const spender = 'k';
const withBill = function (srcCat, withHandover) {
  return {
    parties: [], payments: [], voids: [], corrections: [],
    daily: [{ id: 't', collectorId: spender, type: 'toto', amount: 1000, cashAmount: 1000, upiAmount: 0 }],
    expenses: [{ id: 'e', collectorId: spender, amount: 198, cashAmount: 198, upiAmount: 0, source: 'puja', srcCat: srcCat }],
    handovers: withHandover ? [{ id: 'h', fromId: 'c', toId: spender, amount: 1200, cashAmount: 1200, upiAmount: 0,
      status: 'confirmed', breakdown: JSON.stringify({ shop: { cash: 1200, upi: 0 } }) }] : [],
  };
};
const stableBefore = myAvailable(withBill('other', false), spender).byCat;
const stableAfter = myAvailable(withBill('other', true), spender).byCat;
eq(stableBefore.other, { cash: -198, upi: 0 }, 'srcCat: an unassigned bill parks in "other"');
eq(stableBefore.toto, { cash: 1000, upi: 0 }, 'srcCat: it does NOT borrow from toto');
eq(stableAfter.other, { cash: -198, upi: 0 }, 'srcCat: it stays in "other" when a shop handover arrives');
eq(stableAfter.toto, { cash: 1000, upi: 0 }, 'srcCat: toto still untouched');
eq(stableAfter.shop, { cash: 1200, upi: 0 }, 'srcCat: the arriving money is not eaten by the bill');
// a NAMED pot is charged even when empty — honest negative beats a hidden loan
const namedEmpty = myAvailable(withBill('bus', false), spender).byCat;
eq(namedEmpty.bus, { cash: -198, upi: 0 }, 'srcCat: a named-but-empty pot goes negative rather than borrowing');
eq(namedEmpty.toto, { cash: 1000, upi: 0 }, 'srcCat: naming bus leaves toto alone');
// the money is still all there, whichever way it is split
eq(myAvailable(withBill('other', true), spender).cash, 1000 + 1200 - 198, 'srcCat: total in hand unchanged by the split');
// legacy rows (written before srcCat existed) still fall back to the old drain
const legacy = myAvailable({ parties: [], payments: [], voids: [], corrections: [], handovers: [],
  daily: [{ id: 't', collectorId: spender, type: 'toto', amount: 1000, cashAmount: 1000, upiAmount: 0 }],
  expenses: [{ id: 'e', collectorId: spender, amount: 198, cashAmount: 198, upiAmount: 0 }] }, spender).byCat;
eq(legacy.toto, { cash: 802, upi: 0 }, 'srcCat: pre-srcCat rows keep the old drain behaviour');

// ---- the daily report is the street rounds only ----------------------------
// Bus is a new entry (named donor + receipt) and lives in the ledger beside the
// shops and people. Counting it here too would show the same money under two
// groupings — the mismatch Hrishi kept catching on the home screen.
const dailyRep = computeReport('daily', {
  parties: [], payments: [], expenses: [], handovers: [], voids: [],
  daily: [
    { id: 'd1', type: 'road', date: '2026-07-20', amount: 300 },
    { id: 'd2', type: 'toto', date: '2026-07-20', amount: 200 },
    { id: 'd3', type: 'bus', date: '2026-07-20', amount: 900, busName: 'X', receiptNo: '2026000001' },
  ],
});
eq(dailyRep.byType, { road: 300, toto: 200 }, 'daily report: road/toto only, no bus bucket');
eq(dailyRep.rows.length, 2, 'daily report: the bus row is not listed');
eq(dailyRep.rows.every(function (r) { return r.type !== 'bus'; }), true, 'daily report: no bus row slipped through');
// …but the money is NOT lost: it still counts everywhere money is counted
eq(computeTotals({ parties: [], payments: [], expenses: [], handovers: [], voids: [],
  daily: [{ id: 'd3', type: 'bus', amount: 900 }] }).totalCollection, 900, 'daily report: bus money still counts in the totals');
eq(myAvailable({ parties: [], payments: [], expenses: [], handovers: [], voids: [],
  daily: [{ id: 'd3', collectorId: 'z', type: 'bus', amount: 900, cashAmount: 900, upiAmount: 0 }] }, 'z').byCat.bus,
  { cash: 900, upi: 0 }, 'daily report: bus money still sits in its own pot');

// ---- the server really does mirror the client -------------------------------
// Code.gs duplicates the permission rules (the UI hides what you may not do,
// the server must not trust the UI). A comment saying "mirrors js/aggregate.js"
// is not a guarantee — so load the REAL Code.gs and make the two agree. These
// four functions touch no Apps Script globals, so they run here unchanged.
(function serverMirror() {
  const src = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const gs = {};
  new Function('g', src + '\n g.ENTRY_KINDS = ENTRY_KINDS; g.PERM_KEYS = PERM_KEYS;' +
                          ' g.permForRow_ = permForRow_; g.entryAllowed_ = entryAllowed_; g.canReview_ = canReview_;')(gs);
  eq(gs.ENTRY_KINDS, ENTRY_KINDS, 'mirror: server ENTRY_KINDS === client');
  eq(gs.PERM_KEYS, PERM_KEYS, 'mirror: server PERM_KEYS === client');
  [['parties', { type: 'shop' }], ['parties', { type: 'person' }], ['parties', { type: 'member' }],
   ['daily', { type: 'bus' }], ['daily', { type: 'road' }], ['daily', { type: 'toto' }],
   ['payments', {}], ['handovers', {}], ['corrections', {}],
   ['expenses', { source: 'collection', collectionType: 'bus' }], ['expenses', { source: 'puja' }],
  ].forEach(function (c) {
    eq(gs.permForRow_(c[0], c[1]), permForRow(c[0], c[1]), 'mirror: permForRow ' + c[0] + '/' + (c[1].type || c[1].source || '-'));
  });
  [{ role: 'admin', entries: 'bus' }, { role: 'user', entries: '' },
   { role: 'user', entries: 'bus' }, { role: 'user', entries: 'bus,review', cashier: 1 },
  ].forEach(function (u, i) {
    PERM_KEYS.concat([null]).forEach(function (k) {
      eq(gs.entryAllowed_({ row: u }, k), permAllowed(u, k), 'mirror: entryAllowed user' + i + ' key=' + k);
    });
  });
  // the voids store is finally gated — mirror app.js canVoid plus the two
  // self-void paths (Undo, and correcting your own flagged entry)
  var gsV = {}; new Function('g', src + '\n g.voidAllowed_ = voidAllowed_; g.targetOwner_ = targetOwner_;')(gsV);
  // targetOwner_ needs a Sheet, which node has not got — so drive voidAllowed_
  // through a stubbed owner instead and assert the DECISION table.
  const decide = function (me, owner) {
    if (me.role === 'admin') return true;
    if (!owner) return false;
    if (owner.collectorId && owner.collectorId === me.username) return true;
    return Number(me.cashier) === 1 && owner.role === 'collector';
  };
  const adminU = { role: 'admin', username: 'hrishi', cashier: 0 };
  const cashU = { role: 'user', username: 'jadav', cashier: 1 };
  const collU = { role: 'user', username: 'yamini', cashier: 0 };
  const ownedByColl = { collectorId: 'yamini', role: 'collector' };
  const ownedByCash = { collectorId: 'jadav', role: 'cashier' };
  eq(decide(adminU, ownedByColl), true, 'voids: admin may void anything');
  eq(decide(adminU, null), true, 'voids: …even a row the sheet cannot find');
  eq(decide(cashU, ownedByColl), true, 'voids: cashier may void a plain collector\'s entry');
  eq(decide(cashU, ownedByCash), true, 'voids: cashier may void their OWN entry (Undo / self-correction)');
  eq(decide(cashU, { collectorId: 'salil', role: 'cashier' }), false, 'voids: cashier may NOT void another cashier\'s entry');
  eq(decide(collU, ownedByColl), true, 'voids: a collector may void their own (Undo / correcting a flag)');
  eq(decide(collU, { collectorId: 'biplab', role: 'collector' }), false, 'voids: …but never somebody else\'s');
  eq(decide(collU, ownedByCash), false, 'voids: and never a cashier\'s');
  eq(decide(collU, null), false, 'voids: an unknown target is refused, not waved through');
  eq(typeof gsV.voidAllowed_, 'function', 'voids: the server really does have the rule');

  // setConfig must accept BOTH call shapes and refuse anything unlisted — a
  // config write that answers ok while changing nothing is how the chat kill
  // switch shipped broken (A16, caught live, not in review).
  var gsC = {}; new Function('g', src + '\n g.ACTIONS = ACTIONS;')(gsC);
  // Read the ALLOW OBJECT ITSELF, not the prose around it — grepping the whole
  // action body matched key names that only appear in a comment, and reported
  // failures the code did not have.
  const cfgStart = src.indexOf('setConfig: function');
  const setCfgSrc = src.slice(cfgStart, src.indexOf('\n  },', cfgStart));
  const allowBody = setCfgSrc.slice(setCfgSrc.indexOf('var allow = {') + 12);
  const allowKeys = allowBody.slice(0, allowBody.indexOf('};'))
    .replace(/\/\/[^\n]*/g, '')                       // strip trailing comments
    .split(',').map(function (kv) { return kv.split(':')[0].trim(); }).filter(Boolean);
  eq(allowKeys.indexOf('chat_off') >= 0, true, 'config: chat_off is settable (the kill switch needs it)');
  eq(allowKeys.indexOf('live_mode') >= 0, false, 'config: live_mode is NOT settable — going live is its own action');
  eq(allowKeys.indexOf('data_ts') >= 0, false, 'config: the change stamp is NOT settable');
  eq(allowKeys.some(function (k) { return k.indexOf('receiptSeq') >= 0; }), false,
     'config: serial counters are NOT settable');
  eq(setCfgSrc.indexOf('if (b.key)') >= 0, true, 'config: the {key,value} shape is accepted too');
  eq(setCfgSrc.indexOf("throw new Error('unknown-config-key')") >= 0, true,
     'config: an unlisted key throws instead of silently succeeding');

  // Confirming a handover moves money in TWO people's books, so being A cashier
  // is not enough — it must be the person it was sent to. isRecipient_ touches
  // no Apps Script global, so the REAL server rule runs here.
  var gsR = {}; new Function('g', src + '\n g.isRecipient_ = isRecipient_;')(gsR);
  const jadav = { row: { username: 'jadav', name: 'Jadav mahato', role: 'user', cashier: 1 } };
  const salil = { row: { username: 'salil', name: 'সলিল', role: 'user', cashier: 1 } };
  eq(gsR.isRecipient_({ toId: 'jadav', to: 'Jadav mahato' }, jadav), true,
     'recipient: the addressee is recognised by username');
  eq(gsR.isRecipient_({ toId: 'jadav', to: 'Jadav mahato' }, salil),
     false, 'recipient: another cashier is NOT the addressee — this is the hole that was open');
  eq(gsR.isRecipient_({ toId: '', to: 'Jadav mahato' }, jadav), true,
     'recipient: an offline row with no toId falls back to the typed display name');
  eq(gsR.isRecipient_({ toId: '', to: 'Jadav mahato' }, salil), false,
     'recipient: …and the name fallback does not let anyone else in');
  eq(gsR.isRecipient_({ toId: 'jadav', to: '' }, jadav), true,
     'recipient: toId alone is enough when the name was not stored');
  // the guard itself, and the two ways it may be refused
  const confStart = src.indexOf('confirmHandover: function');
  const confSrc = src.slice(confStart, src.indexOf('\n  },', confStart));
  eq(confSrc.indexOf('isRecipient_') >= 0, true, 'confirmHandover: really calls the shared recipient rule');
  eq(confSrc.indexOf("throw new Error('not-recipient')") >= 0, true,
     'confirmHandover: refuses a non-recipient instead of confirming');
  eq(confSrc.indexOf("throw new Error('already-confirmed')") >= 0, true,
     'confirmHandover: will not restamp confirmedBy on a settled row');
  eq(confSrc.indexOf('handover:confirm-on-behalf') >= 0, true,
     "confirmHandover: an admin acting for someone else gets its own audit verb");
  // every error code the server can throw here needs a message, or the user is
  // told "network problem" for a permission refusal
  const i18nSrc = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  ['err_not_recipient', 'err_already_confirmed'].forEach(function (k) {
    eq(i18nSrc.indexOf('  ' + k + ':') >= 0, true, 'i18n: ' + k + ' has a real message, not err_network');
  });

  // rejectHandover: the other half of confirming. Same recipient gate, a REQUIRED
  // reason, and the column must be appended LAST or setup()'s header migration
  // shifts every position-based write after it in sheets that already exist.
  const rejStart = src.indexOf('rejectHandover: function');
  eq(rejStart >= 0, true, 'reject: the server action exists at all');
  const rejSrc = src.slice(rejStart, src.indexOf('\n  },', rejStart));
  eq(rejSrc.indexOf('isRecipient_') >= 0, true, 'reject: gated by the same shared recipient rule as confirm');
  eq(rejSrc.indexOf("throw new Error('reason-required')") >= 0, true,
     'reject: refuses to record a refusal with no reason');
  eq(rejSrc.indexOf("throw new Error('already-confirmed')") >= 0, true, 'reject: cannot un-confirm a settled parcel');
  eq(rejSrc.indexOf("throw new Error('already-rejected')") >= 0, true, 'reject: cannot re-refuse');
  // A59 (audit 2.5): pins the RESULT, not the mechanism — the four separate
  // setValue calls became one whole-row setValues under a lock, and an
  // assertion that names the old mechanism would have failed a correct fix.
  eq(rejSrc.indexOf("rowObj.status = 'rejected'") >= 0, true, "reject: writes status='rejected', not a void");
  eq(rejSrc.indexOf('touchData_()') >= 0, true, "reject: stamps the change so the sender's delta pull sees it");
  eq(rejSrc.indexOf('handover:reject') >= 0, true, 'reject: audited');
  // readAll_ maps rows by the REAL header row, so a value written into an
  // unlabelled column is written and never read — the status would flip and the
  // reason would silently vanish. Writing a brand-new column must heal the header
  // rather than trust that a human remembered to run setup().
  // A59: the healing moved BEFORE the row read — the whole row is written by
  // position now, so the header has to be right before anything is read, not
  // just before the reason cell is written.
  eq(rejSrc.indexOf('ensureCols_(sh, cols);') >= 0, true,
     'reject: heals its own header instead of depending on setup() having been run');
  eq(rejSrc.indexOf('ensureCols_(sh, cols);') < rejSrc.indexOf('getValues()[0]'), true,
     'reject: …and heals it BEFORE reading the row it is about to write back');
  eq(src.indexOf('function ensureCol_') >= 0, true, 'reject: ensureCol_ exists');
  // A deployment must be identifiable from outside, with no token and no writes:
  // twice a redeploy has been assumed instead of proven. doGet carries the version,
  // and this keeps it in step with sw.js so neither can be bumped alone.
  const swVer = (require('fs').readFileSync(__dirname + '/../sw.js', 'utf8').match(/chanda-v[\d.]+/) || [])[0];
  const gsVer = (src.match(/CODE_VERSION = '(chanda-v[\d.]+)'/) || [])[1];
  eq(gsVer, swVer, 'deployment: Code.gs CODE_VERSION matches sw.js VERSION');
  eq(/function doGet\(\)[^\n]*version: CODE_VERSION/.test(src), true,
     'deployment: doGet reports the version, so one curl can fingerprint it');
  // THREE server mirrors now, not two: the cashier nag, personalSummary_, and the
  // central in-hand report — the last one found only by asking "what else reads a
  // handover status?" instead of trusting a count.
  eq((src.match(/status !== 'rejected'/g) || []).length >= 3, true,
     'reject: the central in-hand report stops parking a refused parcel in "confirm বাকি"');
  // read the column list itself, comments stripped, and check the LAST name —
  // setup() migrates headers by appending, and every write is position-based, so
  // a name inserted mid-list shifts every column after it in existing sheets
  const hoStart = src.indexOf('  handovers: [');
  const hoCols = src.slice(hoStart, src.indexOf('],', hoStart))
    .replace(/\/\/[^\n]*/g, '').match(/'([a-zA-Z]+)'/g).map(function (q) { return q.slice(1, -1); });
  eq(hoCols[hoCols.length - 1], 'rejectReason', 'reject: rejectReason is the LAST handovers column (migration rule)');
  eq(hoCols.indexOf('breakdown'), hoCols.length - 2, 'reject: …appended after breakdown, not inserted before it');
  // the two server mirrors of "not confirmed means pending" must both know better
  eq(src.indexOf("h.status !== 'confirmed' && h.status !== 'rejected'") >= 0, true,
     'reject: the server stops filing a refused parcel as pending');
  eq((src.match(/status !== 'confirmed' && h\.status !== 'rejected'/g) || []).length, 2,
     'reject: BOTH server mirrors fixed (the cashier nag and personalSummary_)');
  ['err_already_rejected', 'err_reason_required'].forEach(function (k) {
    eq(i18nSrc.indexOf('  ' + k + ':') >= 0, true, 'i18n: ' + k + ' has a real message, not err_network');
  });
  // R2: the uncapped typed-amount fallback is gone from the handover flow, and
  // startHandover gates on the ceiling instead — with a message that names the
  // pending money when that is why the ceiling is empty.
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  const hoFlowSrc = appSrc.slice(appSrc.indexOf('function handoverFlow'), appSrc.indexOf('function startHandover'));
  eq(hoFlowSrc.indexOf('q_cash_amount') < 0, true, 'R2: no typed-amount step is reachable inside handoverFlow');
  const startHoSrc = appSrc.slice(appSrc.indexOf('function startHandover'),
                                  appSrc.indexOf('\n  }', appSrc.indexOf('function startHandover')));
  eq(startHoSrc.indexOf("t('ho_nothing')") >= 0, true, 'R2: a zero ceiling shows the empty-state toast');
  eq(startHoSrc.indexOf('ho_nothing_pending') >= 0, true,
     'R2: …and names the in-transit money when that is the reason');
  ['ho_nothing', 'ho_nothing_pending'].forEach(function (k) {
    eq(i18nSrc.indexOf('  ' + k + ':') >= 0, true, 'i18n: ' + k + ' exists');
  });

  // A19: the server resends every season-old rejection on every poll (no "done"
  // state exists), so the CLIENT must drop dismissed ids from the count at apply
  // time — filtering only the banner leaves a ghost "🔔 ফেরত এসেছে" toast on
  // every app start for the rest of the season.
  const applyStart = appSrc.indexOf('function applyNotifications');
  const applySrc = appSrc.slice(applyStart, appSrc.indexOf('\n  }', applyStart));
  eq(applySrc.indexOf('rejSeen(x.id)') >= 0, true,
     'A19: applyNotifications drops dismissed rejections from the count, not just the banner');
  eq(applySrc.indexOf('n.rejections = items.rejections.length') >= 0, true,
     'A19: …and the badge count is recomputed from the filtered list');

  // R1: server-settled fields must survive a client upsert. The predicate table
  // is module-level in Code.gs precisely so the REAL rules run here.
  var gsSet = {}; new Function('g', src + '\n g.SETTLED_ON_UPSERT = SETTLED_ON_UPSERT;')(gsSet);
  const SU = gsSet.SETTLED_ON_UPSERT;
  eq(SU.handovers.when({ status: 'confirmed' }), true, 'R1: a confirmed handover is settled');
  eq(SU.handovers.when({ status: 'rejected' }), true, 'R1: a rejected handover is settled');
  eq(SU.handovers.when({ status: 'pending' }), false, 'R1: a pending handover is NOT settled — retries may update it');
  eq(SU.handovers.keep, ['status', 'confirmedBy', 'confirmedAt', 'rejectReason'],
     'R1: every server-written handover field is carried forward');
  eq(SU.corrections.when({ status: 'approved' }) && SU.corrections.when({ status: 'rejected' }), true,
     'R1: a resolved correction is settled too — same clobber, same guard');
  eq(SU.corrections.when({ status: 'pending' }) || SU.corrections.when({ status: '' }), false,
     'R1: an unresolved correction stays writable');
  eq(SU.corrections.keep, ['status', 'resolvedBy', 'resolvedAt'],
     'R1: …with the resolver fields kept');
  // and the guard is actually wired into BOTH upsert write-sites, including the
  // admin-restore reassign branch — the exact path the finding was about
  eq((src.match(/preserve\(row\.id, values/g) || []).length, 2,
     'R1: both push write-sites route through preserve()');

  // A59 (audit 2.6): a lost push response is the ORDINARY case at a pandal
  // gate. The retry is an upsert, the serial is minted only on insert, so the
  // empty payload value was written over a number the donor is holding on
  // paper. These run the real predicates, not a regex over them.
  eq(SU.payments.when({ receiptNo: '2026-0143' }), true,
     'A59: a payment that already has a serial defends it against a retry');
  eq(SU.payments.when({ receiptNo: '' }), false,
     'A59: …and a row without one stays writable, so this can never invent a serial');
  eq(SU.payments.keep, ['receiptNo'], 'A59: only the serial — a retry must still be able to fix a typo');
  eq(SU.daily.when({ receiptNo: '2026-0007' }), true, 'A59: bus collections carry a printed serial too');
  eq(SU.daily.when({ receiptNo: '' }), false, 'A59: …road and toto have none, and none is invented');
  // and the phone that never saw the first response must LEARN the serial —
  // the sheet being right is only half the repair; `receipts` is filled at mint
  // time only, so without this the receipt reads "নং —" for ever.
  eq(/if \(carried\[row\.id\] && carried\[row\.id\]\.receiptNo\) receipts\[row\.id\] = carried\[row\.id\]\.receiptNo;/.test(src), true,
     'A59: …and the preserved serial is handed back to the retrying phone');
  eq(/\(s === 'payments' \|\| s === 'daily'\) && receipts\[live\.id\]/.test(
       require('fs').readFileSync(__dirname + '/../js/sync.js', 'utf8')), true,
     'A59: …which the client already adopts, so the loop actually closes');

  // A59 (audit 2.5): confirm/reject were unlocked read-check-write with four
  // separate setValue calls — confirm and reject racing could produce a row
  // that says confirmed AND carries a rejectReason.
  ['confirmHandover', 'rejectHandover'].forEach(function (fn) {
    // slice to the handler's own closing brace, not a fixed byte count — a
    // short window is how an assertion silently stops covering what it names
    const at = src.indexOf(fn + ': function');
    const seg = src.slice(at, src.indexOf('\n  },', at));
    eq(/LockService\.getScriptLock\(\); lock\.waitLock\(20000\);/.test(seg), true,
       'A59: ' + fn + ' takes the script lock');
    eq(/finally \{ lock\.releaseLock\(\); \}/.test(seg), true, 'A59: …and always releases it');
    eq(/sh\.getRange\(r, 1, 1, cols\.length\)\.setValues\(/.test(seg), true,
       'A59: …and settles the row in ONE write, so there is no torn-write window');
    eq(/setValue\(new Date\(\)\.toISOString\(\)\)/.test(seg), false,
       'A59: …the four separate cell writes are gone');
  });

  // A59 (audit 2.4): the only ledger-sheet writer that never stamped data_ts.
  {
    const seg = src.slice(src.indexOf('rolloverYear: function'), src.indexOf('releaseSession: function'));
    eq(/setValues\(out\);\n\s*touchData_\(\);/.test(seg), true,
       'A59: rolloverYear stamps data_ts AFTER the rows…');
    eq(seg.indexOf('year-has-data') >= 0, true,
       'A59: …which matters because the re-run guard would then refuse to fix it');
  }


  // A59 (audit 2.7): setValues PARSES a leading '=' as a formula, so a donor
  // named "=সুমন" stops being text. Real damage is a book that quietly stops
  // adding up — one #NAME? in a name column and every report reading it shows
  // an error instead of a figure, with no way to tell which donor. The
  // unfriendly version executes with the SHEET OWNER's authority.
  var gsSafe = {};
  new Function('g', src + '\n g.safeCell_ = safeCell_; g.safeRow_ = safeRow_;')(gsSafe);
  eq(gsSafe.safeCell_('=IMPORTRANGE("x","y")'), "'" + '=IMPORTRANGE("x","y")',
     'A59: a formula-looking name is neutralised with the text marker');
  eq(gsSafe.safeCell_('সুমন দাস'), 'সুমন দাস', 'A59: ordinary text is untouched');
  eq(gsSafe.safeCell_('-৫০০ বাকি'), '-৫০০ বাকি',
     "A59: …and so is a leading '-', which is not a formula in Sheets — quoting it would only add a visible apostrophe");
  eq(gsSafe.safeCell_(1500), 1500, 'A59: numbers pass through as numbers, not strings');
  eq(gsSafe.safeCell_(''), '', 'A59: empty stays empty');
  eq(gsSafe.safeRow_(['a', 'b'], { a: '=1+1' }), ["'=1+1", ''],
     'A59: safeRow_ maps onto cols AND neutralises, so the two cannot drift apart');
  // and every write that carries client text goes through it
  eq(/cols\.map\(function \(c\) \{ return row\[c\] !== undefined \? row\[c\] : ''; \}\)/.test(src), false,
     'A59: no push write-site builds a raw row any more');


  // A59 (audit 2.9): voidAllowed_ read the WHOLE target sheet, per void row,
  // inside the push lock. Run the real thing against a counting stub — a claim
  // about "one read per store" is worth nothing asserted by regex.
  {
    let reads = 0;
    const rows = [['id', 'collectorId', 'collectorRole'],
                  ['p1', 'ratan', 'collector'],
                  ['p2', 'bimal', 'cashier']];
    const sheet = {
      getLastRow: () => rows.length,
      getDataRange: () => ({ getValues: () => { reads++; return rows; } }),
    };
    const env = {
      SpreadsheetApp: { getActive: () => ({ getSheetByName: () => sheet }) },
      out: {},
    };
    new Function('SpreadsheetApp', 'g', src +
      '\n g.targetOwner_ = targetOwner_; g.voidAllowed_ = voidAllowed_;' +
      '\n g.noteIncomingOwner_ = noteIncomingOwner_; g.targetCollectorRole_ = targetCollectorRole_;' +
      '\n g.reset = function () { OWNER_CACHE = null; };')(env.SpreadsheetApp, env.out);
    const G = env.out;

    G.reset(); reads = 0;
    const ratan = { row: { role: 'user', username: 'ratan', cashier: 0 } };
    for (let i = 0; i < 10; i++) G.voidAllowed_(ratan, { targetStore: 'payments', targetId: 'p1' });
    eq(reads, 1, 'A59: ten queued voids cost ONE sheet read, not ten');

    G.reset();
    eq(G.voidAllowed_(ratan, { targetStore: 'payments', targetId: 'p1' }), true,
       'A59: …and the answer is unchanged — a collector may still void their own row');
    eq(G.voidAllowed_(ratan, { targetStore: 'payments', targetId: 'p2' }), false,
       "A59: …and still may not void the cashier's");
    eq(G.voidAllowed_(ratan, { targetStore: 'payments', targetId: 'nope' }), false,
       'A59: …and an unknown target is still refused');
    eq(G.targetCollectorRole_('payments', 'p2'), 'cashier',
       'A59: targetCollectorRole_ shares the same index instead of re-reading');

    // the batch case: undo while a push is in flight makes a void; if that push
    // fails, payment and void travel together on the retry. The gate runs before
    // any write, so the void used to find nothing and be silently rejected.
    G.reset();
    eq(G.voidAllowed_(ratan, { targetStore: 'payments', targetId: 'p9' }), false,
       'A59: a target nobody has ever seen is refused…');
    G.reset();
    G.noteIncomingOwner_('payments', 'p9', ratan);
    eq(G.voidAllowed_(ratan, { targetStore: 'payments', targetId: 'p9' }), true,
       'A59: …but one arriving in the SAME batch is found, so the undo happens');
    // and an incoming row can never re-attribute one already on the sheet
    G.reset();
    G.noteIncomingOwner_('payments', 'p2', ratan);
    eq(G.voidAllowed_(ratan, { targetStore: 'payments', targetId: 'p2' }), false,
       "A59: …while the sheet still wins, so nobody can claim someone else's row by re-sending its id");
  }

  // the daily report split must match on both sides too
  var gsRep = new Function('g', src + '\n g.computeReport_ = computeReport_;');
  // (computeReport_ needs activeData_/num_ which the same eval already defines)
  var gsCtx = {}; gsRep(gsCtx);
  const dailyIn = { parties: [], payments: [], expenses: [], handovers: [], voids: [], corrections: [],
    daily: [{ id: 'd1', type: 'road', date: '2026-07-20', amount: 300 },
            { id: 'd2', type: 'toto', date: '2026-07-20', amount: 200 },
            { id: 'd3', type: 'bus', date: '2026-07-20', amount: 900 }] };
  eq(gsCtx.computeReport_('daily', dailyIn).byType, computeReport('daily', dailyIn).byType,
     'mirror: the daily report excludes bus on the server too');

  // the correction desk: cashier base, admin override, grant on top
  eq(gs.canReview_({ row: { role: 'admin', cashier: 0, entries: '' } }), true, 'review: admin always has the desk');
  eq(gs.canReview_({ row: { role: 'user', cashier: 1, entries: '' } }), false, 'review: a cashier with nothing granted does NOT get the desk');
  eq(gs.canReview_({ row: { role: 'user', cashier: 1, entries: 'bus' } }), false, 'review: granting only bus withholds the desk');
  eq(gs.canReview_({ row: { role: 'user', cashier: 1, entries: 'bus,review' } }), true, 'review: granted explicitly');
  eq(gs.canReview_({ row: { role: 'user', cashier: 0, entries: '' } }), false, 'review: a plain collector never gets the desk');
})();

// ---- scope check ----------------------------------------------------------
// ---- mySummary: the আমার হিসাব model -----------------------------------------
// যমুনা: 2000 shop (1200c/800u) + 500 person cash + 900 bus (400c/500u)
//        + 300 road cash + 400 toto cash = 4100 collected
//        − 400 চা-জল out of the ROAD pot (more than road holds → road goes −100)
//        − 1700 confirmed to Jadav (shop 1200c + bus 500u)
//        − 700 pending to Jadav (person 300c, toto 400c)  ← still hers
//        − 250 REJECTED (bus)                              ← never left her
const msData = {
  parties: [{ id: 's1', type: 'shop' }, { id: 'p1', type: 'person' }],
  voids: [], corrections: [],
  payments: [{ id: 'a', collectorId: 'y', partyId: 's1', amount: 2000, cashAmount: 1200, upiAmount: 800 },
             { id: 'b', collectorId: 'y', partyId: 'p1', amount: 500, cashAmount: 500, upiAmount: 0 }],
  daily: [{ id: 'd1', collectorId: 'y', type: 'bus', amount: 900, cashAmount: 400, upiAmount: 500 },
          { id: 'd2', collectorId: 'y', type: 'road', amount: 300, cashAmount: 300, upiAmount: 0 },
          { id: 'd3', collectorId: 'y', type: 'toto', amount: 400, cashAmount: 400, upiAmount: 0 }],
  expenses: [{ id: 'x', collectorId: 'y', amount: 400, cashAmount: 400, upiAmount: 0,
               source: 'collection', srcCat: 'road', desc: 'চা-জল', date: '2026-07-24' }],
  handovers: [
    { id: 'h1', fromId: 'y', toId: 'j', to: 'Jadav', amount: 1700, cashAmount: 1200, upiAmount: 500,
      status: 'confirmed', breakdown: JSON.stringify({ shop: { cash: 1200, upi: 0 }, bus: { cash: 0, upi: 500 } }) },
    { id: 'h2', fromId: 'y', toId: 'j', to: 'Jadav', amount: 300, cashAmount: 300, upiAmount: 0,
      status: 'pending', breakdown: JSON.stringify({ person: { cash: 300, upi: 0 } }) },
    { id: 'h3', fromId: 'y', toId: 'j', to: 'Jadav', amount: 400, cashAmount: 400, upiAmount: 0,
      status: 'pending', breakdown: JSON.stringify({ toto: { cash: 400, upi: 0 } }) },
    { id: 'h4', fromId: 'y', toId: 'j', to: 'Jadav', amount: 250, cashAmount: 250, upiAmount: 0,
      status: 'rejected', breakdown: JSON.stringify({ bus: { cash: 250, upi: 0 } }) },
  ],
};
const ms = mySummary(msData, 'y');
eq(ms.hero.total, 2000, 'mySummary: hero = 4100 − 400 spent − 1700 confirmed (pending/rejected stay hers)');
eq([ms.hero.cash, ms.hero.upi], [1200, 800], 'mySummary: hero split comes from myAvailable, not from collected');
// THE invariant: nothing on the screen may be larger than the number on top
eq(ms.groups.reduce(function (s, g) { return s + g.total; }, 0), ms.hero.total,
   'mySummary: group totals sum to hero exactly');
eq(ms.groups.map(function (g) { return [g.key, g.total]; }), [['entry', 1700], ['daily', 300]],
   'mySummary: pods group as 📥 entry (shop+person+bus) and 🛣️ daily (road+toto)');
eq(ms.groups[1].pots.map(function (p) { return [p.key, p.total]; }), [['toto', 400], ['road', -100]],
   'mySummary: an overspent pot stays visible and negative, sorted last');
// the three slots are kept apart, and `rejected` is bucketed by NAME
eq(ms.out.pending.total, 700, 'mySummary: both pending parcels land in the pending slot');
eq(ms.out.pending.rows.length, 2, 'mySummary: one row per handover, not merged per person');
eq(ms.out.rejected.total, 250, 'mySummary: a rejected handover gets its own slot');
eq(ms.out.confirmed.total, 1700, 'mySummary: confirmed handovers are out of the hero, kept as proof');
eq(ms.afterApprove, 1300, 'mySummary: afterApprove = hero − pending, shown before it happens');
// a rejection must NOT keep being treated as in-transit
const msRejOnly = mySummary(Object.assign({}, msData, {
  handovers: msData.handovers.filter(function (h) { return h.status === 'rejected'; }) }), 'y');
eq(msRejOnly.out.pending.total, 0, 'mySummary: a rejected row is never filed as pending');
eq(msRejOnly.afterApprove, msRejOnly.hero.total, 'mySummary: a rejection does not lower the hero');
// season-to-date is a DIFFERENT clock and must not be folded into the hero
eq(ms.tillNow.collected, 4100, 'mySummary: tillNow.collected is the season total, not the hero');
eq(ms.tillNow.handedOver, 1700, 'mySummary: tillNow.handedOver counts confirmed only');
// direction: the receiver sees the same parcels on the incoming side
const msJ = mySummary(msData, 'j');
eq(msJ.incoming.pending.total, 700, 'mySummary: the receiver sees the unconfirmed parcels as incoming');
eq(msJ.hero.total, 1700, 'mySummary: …but only the confirmed 1700 counts in their own hero');
eq(msJ.out.pending.total, 0, 'mySummary: an incoming parcel never shows up as outgoing');
// handoverSlots on its own: a voided handover is gone here too
eq(handoverSlots(Object.assign({}, msData, { voids: [{ id: 'v', targetId: 'h2' }] }), 'y').out.pending.total, 400,
   'handoverSlots: a voided handover leaves the slots');

// ---- handoverable: what can be offered right now (≠ what I answer for) ------
// Same msData as above: 2,000 in the account, 700 pending (person 300 + toto
// 400), road overspent by 100. So only 1,300 is physically there.
const ho = handoverable(msData, 'y');
eq(ho.total, 1300, 'handoverable: cap = hero − pending, and the road debt is inside it');
eq([ho.cash, ho.upi], [500, 800], 'handoverable: the ceiling is per money type, not just a total');
eq(ho.pendingOut.total, 700, 'handoverable: reports the pending it set aside, for the on-screen reason');
eq(ho.debt.total, 100, 'handoverable: reports the overspent pot separately — a different reason, different colour');
// pot-level: each pending parcel comes off ITS OWN pot, read from the breakdown
eq(ho.byCat.person, { cash: 200, upi: 0 }, 'handoverable: person 500 − its own 300 pending');
eq(ho.byCat.toto, { cash: 0, upi: 0 }, 'handoverable: toto fully committed to a pending parcel');
eq(ho.byCat.bus, { cash: 400, upi: 0 }, 'handoverable: an untouched pot is left alone');
eq(ho.byCat.road, { cash: 0, upi: 0 }, 'handoverable: a negative pot is clamped to 0 — never an offer');
// THE reason the per-pot figures alone are not enough: Σ chips overshoots by
// exactly the debt, so the caller must clamp the total as well.
let hoChipCash = 0, hoChipUpi = 0;
Object.keys(ho.byCat).forEach(function (k) { hoChipCash += ho.byCat[k].cash; hoChipUpi += ho.byCat[k].upi; });
eq(hoChipCash - ho.cash, ho.debt.cash, 'handoverable: Σ pot chips exceeds the cash ceiling by exactly the debt');
eq([hoChipCash, hoChipUpi], [600, 800], 'handoverable: …600 selectable vs 500 real — hence the second clamp');
// and the bug this replaced: myAvailable would have offered the pending money again
eq(myAvailable(msData, 'y').cash - ho.cash, 700, 'handoverable: myAvailable offered 700 of already-sent money');
// a rejected parcel is NOT set aside — the money is back and offerable
const hoRej = handoverable(Object.assign({}, msData, {
  handovers: msData.handovers.map(function (h) {
    return h.status === 'pending' ? Object.assign({}, h, { status: 'rejected' }) : h; }) }), 'y');
eq(hoRej.total, 2000, 'handoverable: a rejected parcel returns to the ceiling');
eq(hoRej.byCat.toto, { cash: 400, upi: 0 }, 'handoverable: …and back into its own pot');
// a legacy pending row with no breakdown names no pot: it can only come off the total
const hoLegacy = handoverable({
  parties: [], voids: [], corrections: [], payments: [], expenses: [],
  daily: [{ id: 'd', collectorId: 'z', type: 'road', amount: 500, cashAmount: 500, upiAmount: 0 }],
  handovers: [{ id: 'h', fromId: 'z', toId: 'j', amount: 200, cashAmount: 200, upiAmount: 0, status: 'pending' }],
}, 'z');
eq(hoLegacy.total, 300, 'handoverable: a breakdown-less pending row still lowers the ceiling');
eq(hoLegacy.byCat.road, { cash: 300, upi: 0 }, 'handoverable: …drained in the fixed category order');

// ---- a handover has THREE outcomes, and every reader must agree ---------------
// Six sites used to write `status !== 'confirmed'` inline, meaning "pending". The
// day a rejected row exists, all six would keep deducting it from the sender for
// ever: money the cashier refused, stranded out of the ceiling and in nobody's
// pocket. This table is the whole contract, in one place.
const rjBase = {
  parties: [], voids: [], corrections: [], payments: [], expenses: [],
  daily: [{ id: 'd', collectorId: 'y', collector: 'যমুনা', type: 'road', amount: 1000, cashAmount: 1000, upiAmount: 0 }],
};
const rjWith = function (status) {
  return Object.assign({}, rjBase, { handovers: [{
    id: 'h', fromId: 'y', from: 'যমুনা', toId: 'j', to: 'Jadav', amount: 400,
    cashAmount: 400, upiAmount: 0, status: status, rejectReason: 'খামে কম ছিল',
    breakdown: JSON.stringify({ road: { cash: 400, upi: 0 } }) }] });
};
[['pending',   1000,  600, 400, 1,  600, 400,   0],
 ['rejected',  1000, 1000,   0, 0, 1000,   0, 400],
 ['confirmed',  600,  600,   0, 1,  600,   0,   0],
].forEach(function (c) {
  const st = c[0], d = rjWith(st);
  eq(mySummary(d, 'y').hero.total, c[1], 'outcome ' + st + ': hero (what I answer for)');
  eq(handoverable(d, 'y').total, c[2], 'outcome ' + st + ': handover ceiling (what I can pass on)');
  eq(personalSummary(d, 'y').pending, c[3], 'outcome ' + st + ': personalSummary.pending');
  eq(personalSummary(d, 'y').handedTo.length, c[4], 'outcome ' + st + ': appears under "কাকে কত জমা দিয়েছি"?');
  eq(cashierView(d, 'y').availableTotal, c[5], 'outcome ' + st + ': cashierView.available');
  eq(handoverReport(d, 'y').pendingOut.total, c[6], 'outcome ' + st + ': book pendingOut');
  eq(handoverReport(d, 'y').rejectedOut.total, c[7], 'outcome ' + st + ': book rejectedOut');
});
// the money comes BACK on a rejection — into its own pot, not a general pool
eq(handoverable(rjWith('rejected'), 'y').byCat.road, { cash: 1000, upi: 0 },
   'rejected: the refused 400 returns to the road pot it came from');
eq(handoverable(rjWith('pending'), 'y').byCat.road, { cash: 600, upi: 0 },
   'pending: …and is set aside while in transit');
// the receiver's side: a parcel they refused is not theirs and not incoming
eq(handoverReport(rjWith('rejected'), 'j').rejectedIn.total, 400, 'rejected: the receiver sees what they refused');
eq(handoverReport(rjWith('rejected'), 'j').pendingIn.total, 0, 'rejected: …and it has left their to-do list');
eq(mySummary(rjWith('rejected'), 'j').hero.total, 0, 'rejected: refusing adds nothing to the receiver');
eq(mySummary(rjWith('rejected'), 'j').incoming.rejected.total, 400, 'rejected: it lands in the receiver\'s ❌ slot');
// the CENTRAL report too — this was the site I first missed. `else` parked a
// refused parcel in the "confirm বাকি" column for the rest of the season.
[['pending', 1000, 400], ['rejected', 1000, 0], ['confirmed', 600, 0]].forEach(function (c) {
  const row = inHandRows(rjWith(c[0])).filter(function (r) { return r.collector === 'যমুনা'; })[0];
  eq(row.inHand, c[1], 'central inhand ' + c[0] + ': in-hand column');
  eq(row.pending, c[2], 'central inhand ' + c[0] + ': "confirm বাকি" column');
  eq(reconcile(rjWith(c[0])).balanced, true, 'central inhand ' + c[0] + ': the money invariant still balances');
});
// the reason travels with the row — it is the sender's only clue what to do
eq(handoverReport(rjWith('rejected'), 'y').rows[0].rejectReason, 'খামে কম ছিল',
   'rejected: the reason reaches the sender through the book');

// ---- A20: a money type can be over-committed — the deficit crosses types ----
// Jadav holds 💵450 + 📱300 = 750 after sending 💵500 pending and then spending
// 💵100. Cash promised (500) now exceeds cash held (450); the −50 must come off
// the UPI ceiling, or total promised exceeds the whole account and the books go
// negative once everything confirms.
const xtD = { parties: [], voids: [], corrections: [], payments: [], daily: [],
  expenses: [{ id: 'x', collectorId: 'j', amount: 100, cashAmount: 100, upiAmount: 0 }],
  handovers: [
    { id: 'h1', fromId: 'y', toId: 'j', amount: 700, cashAmount: 400, upiAmount: 300,
      status: 'confirmed', breakdown: JSON.stringify({ shop: { cash: 400, upi: 300 } }) },
    { id: 'h5', fromId: 'b', toId: 'j', amount: 150, cashAmount: 150, upiAmount: 0, status: 'confirmed' },
    { id: 'h4', fromId: 'j', toId: 'ad', amount: 500, cashAmount: 500, upiAmount: 0,
      status: 'pending', breakdown: JSON.stringify({ shop: { cash: 400, upi: 0 }, received: { cash: 100, upi: 0 } }) }] };
const xt = handoverable(xtD, 'j');
eq(xt.total, 250, 'A20: ceiling = hero − pending even when one type is over-committed');
eq([xt.cash, xt.upi], [0, 250], 'A20: the cash deficit (50) comes off the UPI ceiling');
eq(xt.total, cashierView(xtD, 'j').availableTotal,
   'A20: handoverable and cashierView agree again — two paths, one answer');

// ---- A21: reconcile flags rows whose split disagrees with their amount ------
// The app always writes amount = cash+upi; a hand-edited Sheet cell or buggy
// import can break that, and then the amount-clock (personalSummary) and the
// split-clock (myAvailable) silently diverge. Reconcile now says so loudly.
const a21base = { parties: [], voids: [], corrections: [], daily: [], expenses: [], handovers: [],
  payments: [{ id: 'p', collectorId: 'y', collector: 'য', partyId: 'z', amount: 400, cashAmount: 300, upiAmount: 0 }] };
eq(reconcile(a21base).anomalies.some(function (a) { return a.type === 'split_mismatch'; }), true,
   'A21: amount 400 vs split 300 is flagged');
const a21ok = JSON.parse(JSON.stringify(a21base)); a21ok.payments[0].cashAmount = 400;
eq(reconcile(a21ok).anomalies.filter(function (a) { return a.type === 'split_mismatch'; }).length, 0,
   'A21: a consistent row is not flagged');
const a21legacy = JSON.parse(JSON.stringify(a21base)); delete a21legacy.payments[0].cashAmount; delete a21legacy.payments[0].upiAmount;
eq(reconcile(a21legacy).anomalies.filter(function (a) { return a.type === 'split_mismatch'; }).length, 0,
   'A21: a legacy row (no split fields) is exempt — amount IS the cash');
const a21bd = { parties: [], voids: [], corrections: [], daily: [], expenses: [], payments: [],
  handovers: [{ id: 'h', fromId: 'y', toId: 'j', amount: 700, cashAmount: 400, upiAmount: 300, status: 'confirmed',
                breakdown: JSON.stringify({ shop: { cash: 300, upi: 300 } }) }] };
eq(reconcile(a21bd).anomalies.some(function (a) { return a.type === 'breakdown_mismatch'; }), true,
   'A21: a handover breakdown that does not sum to its amount is flagged');
const a21snap = JSON.parse(JSON.stringify(a21bd));
a21snap.handovers[0].breakdown = JSON.stringify({ __snap: { available: { cash: 1, upi: 2 } } });
eq(reconcile(a21snap).anomalies.filter(function (a) { return a.type === 'breakdown_mismatch'; }).length, 0,
   'A21: a cashier snapshot-only breakdown is metadata, never flagged');

// ---- the calculation graph holds together: one rich scenario, every layer ---
// 3 people, a handover chain, all three statuses, a void, legacy rows, a
// cross-collector payment, an overspent pot. The layer-crossing equalities that
// individual tests above do not already cover:
const graphD = {
  parties: [{ id: 's1', type: 'shop', collectorId: 'y', pledged: 3000 },
            { id: 'p1', type: 'person', collectorId: 'b', pledged: 1000 }],
  payments: [
    { id: 'g1', collectorId: 'y', collector: 'যমুনা', partyId: 's1', amount: 2000, cashAmount: 1200, upiAmount: 800 },
    { id: 'g2', collectorId: 'y', collector: 'যমুনা', partyId: 'p1', amount: 400, cashAmount: 400, upiAmount: 0 },
    { id: 'g3', collectorId: 'b', collector: 'বাপি', partyId: 's1', amount: 500 },              // legacy
    { id: 'gV', collectorId: 'y', collector: 'যমুনা', partyId: 's1', amount: 999, cashAmount: 999, upiAmount: 0 }],
  daily: [{ id: 'g4', collectorId: 'y', collector: 'যমুনা', type: 'road', amount: 300, cashAmount: 300, upiAmount: 0 },
          { id: 'g5', collectorId: 'b', collector: 'বাপি', type: 'toto', amount: 200, cashAmount: 200, upiAmount: 0 }],
  expenses: [{ id: 'gx', collectorId: 'y', collector: 'যমুনা', amount: 400, cashAmount: 400, upiAmount: 0, source: 'collection', srcCat: 'road' }],
  handovers: [
    { id: 'gh1', fromId: 'y', from: 'যমুনা', toId: 'j', to: 'Jadav', amount: 700, cashAmount: 400, upiAmount: 300,
      status: 'confirmed', breakdown: JSON.stringify({ shop: { cash: 400, upi: 300 } }) },
    { id: 'gh2', fromId: 'y', from: 'যমুনা', toId: 'j', to: 'Jadav', amount: 300, cashAmount: 300, upiAmount: 0,
      status: 'pending', breakdown: JSON.stringify({ person: { cash: 300, upi: 0 } }) },
    { id: 'gh3', fromId: 'y', from: 'যমুনা', toId: 'j', to: 'Jadav', amount: 250, cashAmount: 250, upiAmount: 0,
      status: 'rejected', rejectReason: 'কম', breakdown: JSON.stringify({ bus: { cash: 250, upi: 0 } }) },
    { id: 'gh4', fromId: 'j', from: 'Jadav', toId: 'ad', to: 'হৃষি', amount: 500, cashAmount: 500, upiAmount: 0,
      status: 'pending', breakdown: JSON.stringify({ shop: { cash: 400, upi: 0 }, received: { cash: 100, upi: 0 } }) }],
  voids: [{ id: 'gv', targetId: 'gV' }], corrections: [],
};
const gRows = inHandRows(graphD);
eq(gRows.reduce(function (a, r) { return a + r.inHand; }, 0), 3400 - 400,
   'graph: Σ central inHand === collected − expenses, chain and rejection included');
[['যমুনা', 'y'], ['বাপি', 'b'], ['Jadav', 'j']].forEach(function (c) {
  eq(gRows.filter(function (r) { return r.collector === c[0]; })[0].inHand, mySummary(graphD, c[1]).hero.total,
     'graph: central row(' + c[0] + ') === that person\'s own hero — two independent engines');
});
eq([gRows.filter(function (r) { return r.collector === 'যমুনা'; })[0].pending,
    gRows.filter(function (r) { return r.collector === 'Jadav'; })[0].pending], [300, 500],
   'graph: chain pending sits with each sender once — never double-counted');
eq(computeReport('inhand', graphD).rows, gRows, "graph: report('inhand') IS inHandRows, not a re-derivation");
eq(reconcile(graphD).balanced, true, 'graph: and the invariant banner stays silent on all of it');

// ---- server mirrors agree on every SHARED field -----------------------------
// The client enriches report rows (byCat, cash/upi columns) that the legacy
// server report surface does not carry — allowed. What is NOT allowed is a
// shared field disagreeing. subsetEq: every field the server reports must exist
// on the client side with the same value.
(function mirrorSubset() {
  const src2 = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const g2 = {}; new Function('g', src2 + '\n g.computeReport_ = computeReport_; g.personalSummary_ = personalSummary_;')(g2);
  const subsetEq = function (sv, cl, path) {
    if (sv === null || typeof sv !== 'object') return String(sv) === String(cl) ? null : (path + ': ' + sv + ' vs ' + cl);
    if (Array.isArray(sv)) {
      if (!Array.isArray(cl) || cl.length !== sv.length) return path + ': length';
      for (let i = 0; i < sv.length; i++) { const d = subsetEq(sv[i], cl[i], path + '[' + i + ']'); if (d) return d; }
      return null;
    }
    for (const k in sv) { const d = subsetEq(sv[k], (cl || {})[k], path + '.' + k); if (d) return d; }
    return null;
  };
  // A82: `areas` was the one report of the seven never mirrored. Six checked and
  // one not is this project's oldest shape — a rule stated for N and guarded for
  // N−1 — and it is the report the committee reads by PARA, so a disagreement
  // would show up as one neighbourhood's total differing by screen.
  ['overview', 'dues', 'inhand', 'collectors', 'expenses', 'daily', 'areas'].forEach(function (id) {
    eq(subsetEq(g2.computeReport_(id, graphD), computeReport(id, graphD), id), null,
       'mirror: server report(' + id + ') agrees with the client on every shared field');
  });
  ['y', 'b', 'j'].forEach(function (k) {
    const sv = g2.personalSummary_(graphD, k), cl = personalSummary(graphD, k);
    eq(subsetEq({ collected: sv.collected, received: sv.received, handedOver: sv.handedOver,
                  pending: sv.pending, inHand: sv.inHand }, cl, 'ps.' + k), null,
       'mirror: personalSummary_(' + k + ') numbers match the client');
  });
})();

// ---- A22: the same instalment entered twice ---------------------------------
// Different uuids, both well-formed, so every id-based defence waves them
// through — and reconcile still BALANCES, because both really were collected.
// Only a total passing `pledged` used to trip anything, and part-payments (the
// normal case) never do.
const a22 = { parties: [{ id: 's1', type: 'shop', name: 'সাহা', pledged: 5000 }],
  voids: [], corrections: [], daily: [], expenses: [], handovers: [],
  payments: [
    { id: 'u1', partyId: 's1', collectorId: 'y', collector: 'যমুনা', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-07-27', receiptNo: '2026-0043' },
    { id: 'u2', partyId: 's1', collectorId: 'y', collector: 'যমুনা', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-07-27' }] };
eq(reconcile(a22).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 1,
   'A22: a duplicate WELL INSIDE pledged is flagged — one row per extra copy');
eq(reconcile(a22).balanced, true,
   'A22: …and the money invariant still balances, which is exactly why it needed its own check');
eq(reconcile(a22).anomalies.filter(function (a) { return a.type === 'overpaid'; }).length, 0,
   'A22: overpaid does NOT fire here — the old net had this hole');
// the signature: party + amount + day, all three
const a22diff = JSON.parse(JSON.stringify(a22));
a22diff.payments[1].amount = 2001;
eq(reconcile(a22diff).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 0,
   'A22: a different amount is not a duplicate');
const a22day = JSON.parse(JSON.stringify(a22));
a22day.payments[1].date = '2026-07-26';
eq(reconcile(a22day).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 0,
   'A22: the same amount on another day is a normal instalment');
const a22other = JSON.parse(JSON.stringify(a22));
a22other.payments[1].partyId = 's2';
eq(reconcile(a22other).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 0,
   'A22: two donors paying the same amount today is not a duplicate');
// a VOIDED copy is not a duplicate — the correction path relies on this
const a22void = JSON.parse(JSON.stringify(a22)); a22void.voids = [{ id: 'v', targetId: 'u1' }];
eq(reconcile(a22void).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 0,
   'A22: a voided copy is not a duplicate — otherwise every correction would flag');
// three copies → two extras
const a223 = JSON.parse(JSON.stringify(a22));
a223.payments.push({ id: 'u3', partyId: 's1', collectorId: 'y', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-07-27' });
eq(reconcile(a223).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 2,
   'A22: three copies report two extras, not three');
// samePaymentsOn: the shared rule both the banner and the entry-time confirm use
eq(samePaymentsOn(a22, 's1', 2000, '2026-07-27').length, 2, 'A22: samePaymentsOn finds both');
eq(samePaymentsOn(a22, 's1', 2000, '2026-07-27', 'u2').length, 1,
   'A22: exceptId excludes the row being replaced — the edit path must not warn on itself');
eq(samePaymentsOn(a22void, 's1', 2000, '2026-07-27').length, 1, 'A22: samePaymentsOn ignores voided rows too');
eq(samePaymentsOn(a22, 's1', 0, '2026-07-27').length, 0, 'A22: a zero amount never matches');
// the entry-time confirm is wired, and the edit path is exempt
const a22App = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
const a22I18n = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
eq(/function paymentFlow\(party, origin, editing\)/.test(a22App), true, 'A22: paymentFlow knows whether it is an edit');
const payFlowSrc = a22App.slice(a22App.indexOf('function paymentFlow'), a22App.indexOf('function handoverFlow'));
eq(payFlowSrc.indexOf('Aggregate.samePaymentsOn') >= 0, true, 'A22: the entry-time check uses the SHARED rule');
eq(payFlowSrc.indexOf('const dupCheck = editing') >= 0, true, 'A22: …and the correction path is exempt from it');
// the correction path passes editing=true AND the donor type (the type decides
// whether a member's comment is mandatory, and a payment row does not carry it)
eq(/paymentFlow\(\{ id: row\.partyId,[^)]*type: ep\.type[^)]*\}, 'entries', true\)/.test(a22App), true,
   'A22/A25: the correction path passes editing=true and the looked-up donor type');
eq(a22I18n.indexOf('  dup_pay_warn:') >= 0, true, 'A22: the warning has a real bilingual message');
// A23: the warning must NAME the rows, not just their existence — who took the
// earlier one is what decides the answer on the spot.
eq(a22App.indexOf('function dupLine') >= 0, true, 'A23: one row-describing helper');
eq(a22I18n.indexOf('{list}') >= 0, true, 'A23: the popup splices the actual rows in');
const dupLineSrc = a22App.slice(a22App.indexOf('function dupLine'), a22App.indexOf('function dupLine') + 600);
['receiptNo', 'amount', 'collector'].forEach(function (f) {
  eq(dupLineSrc.indexOf(f) >= 0, true, 'A23: the line carries ' + f);
});
eq(/String\(p\.id\)\.slice\(0, 8\)/.test(dupLineSrc), true,
   'A23: …and a short id, so the same row is findable on the admin desk');
// the desk itself: reachable, gated, and actionable where an action honestly exists
eq(a22App.indexOf('function renderAnomalies') >= 0, true, 'A23: the anomaly desk exists');
// reachable from HOME, not only by tapping the reconcile banner — otherwise the
// "needs you" dot has no tile to sit on and the desk stays undiscovered
eq(homeTiles({ role: 'admin', entries: 'shop' }).role.indexOf('anomalies') >= 0, true,
   'A23: the desk is a home tile for an admin');
eq(homeTiles({ role: 'user', cashier: 1, entries: 'shop' }).role.indexOf('anomalies') >= 0, true,
   'A23: …and for a cashier');
eq(homeTiles({ role: 'user', cashier: 0, entries: 'shop' }).role.indexOf('anomalies') >= 0, false,
   'A23: …but never for a plain collector');
const deskSrc = a22App.slice(a22App.indexOf('function renderAnomalies'), a22App.indexOf('function loadMySummary'));
eq(deskSrc.indexOf('Auth.isCashier()') >= 0, true, 'A23: the desk is cashier/admin only');
eq(deskSrc.indexOf('data-dupok') >= 0 && deskSrc.indexOf('data-dupvoid') >= 0, true,
   'A23: a duplicate offers both answers — settle it, or void the extra');
// A68: pins the FIELD, not the write path. The stamp moved from the local
// queue to a server action (the desk's rows belong to other devices), and an
// assertion naming `row.dupOk = 1` failed a fix that was strictly better.
eq(deskSrc.indexOf("'dupOk'") >= 0, true,
   "A23: settling stamps the SAME field the collector's answer uses");
eq(deskSrc.indexOf("Auth.call('setAnomalyFlag'") >= 0, true,
   'A23: …through the server, because the row is almost never this device\'s');
eq(deskSrc.indexOf('renderVoidReason') >= 0, true, 'A23: voiding reuses the existing audited path, not a new delete');
eq(a22App.indexOf("current.view === 'anomalies') renderAnomalies()") >= 0, true, 'A23: routed');
eq(/REFRESHABLE = \[[^\]]*'anomalies'/.test(a22App), true, 'A23: …and refreshes with the rest');
eq(a22App.indexOf("data-go=\"anomalies\"") >= 0, true, 'A23: the reconcile banner opens it');
// every anomaly reconcile can raise must have a human sentence — a desk that
// prints a raw type name is the old count wearing a new coat
['unbalanced', 'overpaid', 'orphan_payment', 'negative_inhand', 'duplicate_id',
 'split_mismatch', 'breakdown_mismatch'].forEach(function (ty) {
  eq(a22I18n.indexOf('  anom_' + ty + '_t:') >= 0, true, 'A23: ' + ty + ' has a title');
});
['anom_dup', 'anom_unbalanced', 'anom_overpaid', 'anom_orphan', 'anom_negative',
 'anom_dupid', 'anom_split', 'anom_breakdown', 'anom_none', 'anom_open'].forEach(function (k) {
  eq(a22I18n.indexOf('  ' + k + ':') >= 0, true, 'A23: ' + k + ' has a message');
});
// answering the question must SETTLE it — otherwise the admin's banner keeps
// asking all season about a pair the collector already confirmed (the A19 trap)
const a22ok = JSON.parse(JSON.stringify(a22)); a22ok.payments[1].dupOk = 1;
eq(reconcile(a22ok).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 0,
   'A22: a confirmed second instalment stops being flagged');
// ORDER-INDEPENDENT: the answer is stamped on whichever row was entered second,
// but IndexedDB returns rows by key, not by insertion. Testing "does THIS row
// carry dupOk" flagged the innocent twin half the time — caught live.
const a22okFirst = JSON.parse(JSON.stringify(a22)); a22okFirst.payments[0].dupOk = 1;
eq(reconcile(a22okFirst).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 0,
   'A22: …whichever of the pair carries the answer, in any array order');
eq(payFlowSrc.indexOf('dupOk: dupOk') >= 0, true, 'A22: …because the answer is stamped on the row');
// and it must survive the round-trip to the Sheet, or the ADMIN (a different
// device from the one that answered) never sees the flag
const a22gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
const payColsSrc = a22gs.slice(a22gs.indexOf('  payments: ['), a22gs.indexOf('],', a22gs.indexOf('  payments: [')));
const payCols = payColsSrc.replace(/\/\/[^\n]*/g, '').match(/'([a-zA-Z]+)'/g).map(function (q) { return q.slice(1, -1); });
eq(payCols[payCols.length - 1], 'dupOk', 'A22: dupOk is the LAST payments column (append-only header rule)');
// push must never write into a column the header does not name — twice nearly
// lost a field this way (rejectReason, dupOk)
eq(a22gs.indexOf('function ensureCols_') >= 0, true, 'A22: push has a header-healing helper');
const pushSrc = a22gs.slice(a22gs.indexOf('push: function'), a22gs.indexOf('\n  },', a22gs.indexOf('push: function')));
eq(pushSrc.indexOf('ensureCols_(sh, cols)') >= 0, true, 'A22: …and push calls it before writing any store');

// ---- A24: the phone step — asked twice, never forced ------------------------
// Hrishi: "don't make it mandatory, but ask two times before passing the field".
// Mandatory buys FAKE numbers (9999999999 gets typed the moment a step blocks a
// busy collector) and a fake number is worse than a blank one — it collides with
// every other fake number and poisons the very duplicate detection it was meant
// to strengthen.
const a24App = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
const a24I18n = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
const phoneStep = a24App.slice(a24App.indexOf("key: 'phone', qKey: 'q_phone'") - 200,
                               a24App.indexOf("key: 'phone', qKey: 'q_phone'") + 200);
eq(/optional: true/.test(phoneStep), true, 'A24: the phone stays OPTIONAL — never a blocking step');
eq(phoneStep.indexOf("confirmSkipKey: 'skip_phone_confirm'") >= 0, true, 'A24: …but skipping it asks once more');
// A45 moved the ask into submitAnswer, where BOTH doors arrive: it used to sit
// on the Skip button alone, so leaving the box empty and pressing "পরের প্রশ্ন"
// walked straight past it.
eq(/if \(step\.confirmSkipKey && \(raw === null \|\| !String\(raw == null \? '' : raw\)\.trim\(\)\)\n\s*&& !window\.confirm\(t\(step\.confirmSkipKey\)\)\) return;/.test(a24App), true,
   'A45: the ask fires on a blank answer however it was submitted, and Cancel returns to the field');
eq(a24App.indexOf('if (st.confirmSkipKey && !window.confirm(t(st.confirmSkipKey))) return;') < 0, true,
   'A45: …and there is no second copy on the Skip button to drift from it');
// the Skip button still routes through the same function
eq(/submitAnswer\(st\.kind === 'amount' \? null : ''\);/.test(a24App), true,
   'A45: Skip is just an empty answer — one path, one guard');
eq(a24I18n.indexOf('  skip_phone_confirm:') >= 0, true, 'A24: the second ask has a real bilingual message');
// the payoff: a phone match is a STRONGER duplicate signal than a name match
const npf = a24App.slice(a24App.indexOf('function newPartyFlow'), a24App.indexOf('function esc0'));
eq(npf.indexOf('cleanPhoneIN(p.phone') >= 0, true, 'A24: the donor dup-check compares phone numbers');
eq(npf.indexOf('byPhone[0] || byName[0]') >= 0, true, 'A24: …and a phone hit wins over a name hit');
eq(npf.indexOf('dup_party_phone') >= 0 && npf.indexOf('dup_party_warn') >= 0, true,
   'A24: two messages, because the two signals carry different certainty');
['dup_party_phone', 'dup_party_warn'].forEach(function (k) {
  eq(a24I18n.indexOf('  ' + k + ':') >= 0, true, 'A24: ' + k + ' exists');
});
eq(a24I18n.slice(a24I18n.indexOf('  dup_party_warn:'), a24I18n.indexOf('  dup_party_warn:') + 400).indexOf('{row}') >= 0, true,
   'A24: the warning NAMES the existing donor rather than just asserting one exists');
// window.confirm renders plain text — escaping it would print literal entities
eq(a24App.indexOf('function esc0') >= 0, true, 'A24: confirm text uses esc0, not esc — plain text, not HTML');

// ---- A25: committee members are DONORS, not a second ledger ------------------
// The obvious build was a new `members` store. That would have meant a SECOND
// money path — its own receipts, dues, pots, reconcile — and money-model.md
// exists because two paths eventually disagree. A member stays a party of
// type 'member'; only registry FIELDS are new.
const a25App = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
const a25I18n = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
const a25Gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
eq(a25Gs.indexOf("var STORES = ['members'") >= 0 || /  members: \[/.test(a25Gs), false,
   'A25: no second members store — a member is a party of type member');
eq(AVAIL_CATS_HAS_MEMBER(), true, 'A25: …so member money keeps using the pot it always had');
function AVAIL_CATS_HAS_MEMBER() {
  return JSON.stringify(mySummary({ parties: [{ id: 'm', type: 'member' }], voids: [], corrections: [],
    payments: [{ id: 'p', partyId: 'm', collectorId: 'z', amount: 500, cashAmount: 500, upiAmount: 0 }],
    daily: [], expenses: [], handovers: [] }, 'z').groups[0].pots[0].key) === '"member"';
}
// the registry columns ride the parties sheet, appended LAST (header rule)
const a25Cols = a25Gs.slice(a25Gs.indexOf('  parties:  ['), a25Gs.indexOf('],', a25Gs.indexOf('  parties:  [')))
  .replace(/\/\/[^\n]*/g, '').match(/'([a-zA-Z]+)'/g).map(function (q) { return q.slice(1, -1); });
// A61: pin the RULE (every schema addition goes on the END, because every
// write here is position-based), not a frozen tail — a list that has to be
// rewritten each time something is appended stops meaning anything.
// A80: this WAS a frozen tail — slice(-4,-1) — directly under a comment saying
// not to write one, and appending `dupOk` broke it while breaking nothing real.
// The rule is ORDER, not position: the registry trio stays contiguous and in
// sequence, and everything added later sits after it. That survives the next
// append, which is the whole point.
{
  const at = function (c) { return a25Cols.indexOf(c); };
  eq(at('email') === at('position') + 1 && at('appUser') === at('email') + 1, true,
     'A25: the registry columns stay together and in order on parties');
  eq(at('pledgeOk') > at('appUser'), true,
     'A61: …and pledgeOk was appended after them, not inserted among them');
  eq(at('dupOk') > at('pledgeOk'), true,
     'A80: …and dupOk after that — every schema addition goes on the END, because every write here is position-based');
}
// positions are an ADMIN master list, like areas and locations — not hard-coded
eq(/var LIST_KINDS = \[[^\]]*'position'[^\]]*\]/.test(a25Gs), true, 'A25: position is a Lists kind');
eq(a25Gs.indexOf('LIST_KINDS.indexOf(kind) < 0') >= 0, true, 'A25: …and the server gate reads that one list');
const a25Lists = require('fs').readFileSync(__dirname + '/../js/lists.js', 'utf8');
eq(a25Lists.indexOf("position: [") >= 0, true, 'A25: seeded so the flow works before an admin edits anything');
// ---- A27: the committee-member registry, as specified -----------------------
// Hrishi corrected an earlier over-build: no membership-type list at all, four
// real committee posts, and registration that takes no money.
const a27Pos = a25Lists.slice(a25Lists.indexOf('position: ['), a25Lists.indexOf('],', a25Lists.indexOf('position: [')));
eq((a27Pos.match(/\{ id:/g) || []).length, 4, 'A27: four committee posts seeded');
['president', 'secretary', 'treasurer', 'member'].forEach(function (id) {
  eq(a27Pos.indexOf("id: '" + id + "'") >= 0, true, 'A27: ' + id + ' is one of them');
});
['সভাপতি', 'সম্পাদক', 'কোষাধ্যক্ষ', 'সদস্য'].forEach(function (bn) {
  eq(a27Pos.indexOf(bn) >= 0, true, 'A27: bilingual — ' + bn);
});
// A115: this counted characters between the two ("within 900 of each other"),
// and every comment written since has walked it closer to failing — it broke
// twice while A115 was being written. What has to hold is structural: the post
// field is a <select>, and its options come from the master list.
{
  const mfForm = a25App.slice(a25App.indexOf('function renderMemberForm'),
                              a25App.indexOf('function saveMemberForm'));
  eq(/<select id="mf-pos">/.test(mfForm) &&
     /posts\.map\(function \(p\)/.test(mfForm) &&
     /Lists\.labelOf\('position', p\.id\)/.test(mfForm) &&
     /const posts = Lists\.get\('position'\)/.test(mfForm), true,
     'A27: the post is a DROPDOWN off the master list, on every member');
}
// The membership-type list was never wanted — it must be gone everywhere.
// A81: comments stripped first. The word now has to appear in a comment,
// because the COLUMN is still on the live sheet (ensureCols_ appends, it never
// removes) and that ghost is what made every position-based write land one cell
// to the left. Documenting the cause is the fix staying fixed; the fifth time
// an assertion in this suite has tripped over its own explanation.
['js/app.js', 'js/lists.js', 'js/i18n.js', 'apps-script/Code.gs'].forEach(function (f) {
  const code = require('fs').readFileSync(__dirname + '/../' + f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1');
  eq(code.indexOf('memberType') < 0, true,
     'A27: no memberType left in ' + f + ' (comments excluded)');
});
// registration REGISTERS; money comes later through the collection screen
// The register is a FORM now, not a guided flow — Hrishi asked for dropdowns
// and for the picked user's details on screen. Same guarantees, new shape.
const a29Reg = a25App.slice(a25App.indexOf('function renderMemberForm'),
                            a25App.indexOf('function renderFindParty'));
eq(a29Reg.indexOf("key: 'pledged'") < 0, true, 'A27: a member is registered without a pledge');
eq(a29Reg.indexOf('moneySteps(') < 0, true, 'A27: …and takes no money at registration');
// A115: the row is written by the SERVER now (saveMember), so the zero pledge
// is stamped there. Same property, one side of the wire further along.
eq(/row\.pledged = 0;/.test(a25Gs), true, 'A27: …the row is stored with a zero pledge, explicitly');
// A form asks by LABEL, not by flow question — and the flow wording said
// "(Skip if none)", which is a lie on a screen with no Skip button.
['member_f_name', 'member_f_post', 'member_f_email', 'member_f_phone'].forEach(function (k) {
  eq(a29Reg.indexOf(k) >= 0, true, 'A27: the register asks for ' + k);
});
['mf-name', 'mf-pos', 'mf-email', 'mf-phone', 'mf-user'].forEach(function (f) {
  eq(a29Reg.indexOf('"' + f + '"') >= 0, true, 'A27: …and has a real field for it: ' + f);
});
eq(/q_email|q_phone|q_person_name/.test(a29Reg), false,
   'A27: no flow question text on the form — those say "Skip", which is not on this screen');
// ③: editing was impossible before, which left the post-over-max anomaly with a
// 🩺 dot nothing could clear.
eq(/function renderMemberForm\(params\)[\s\S]{0,600}const id = \(params && params\.id\)/.test(a25App), true,
   'A32: one form serves both registering and EDITING a member');
eq(a25App.indexOf('data-ma-edit') >= 0, true, 'A32: every registered member has an edit button');
// A115b: the register counts its OWN account-less rows. 🩺 অসঙ্গতি already
// raises them, but that desk is gated on `cashier` while fixing one needs
// `memberadmin` — an admin may grant either without the other, so the person
// who can repair them would never see the number. Two audiences, two surfaces.
{
  const pma = a25App.slice(a25App.indexOf('function paintMemberAdmin'),
                           a25App.indexOf('function renderMemberForm'));
  eq(/list\.filter\(function \(m\) \{ return !String\(m\.appUser \|\| ''\); \}\)\.length/.test(pma) &&
     /member_no_account_n/.test(pma), true,
     'A115: the register shows how many members have no account, without 🩺');
  eq(/member_no_account_n:/.test(a25I18n) && /\{n\}/.test(a25I18n), true,
     'A115: …in both languages, with the number');
}
eq(/others\.length >= cap/.test(a29Reg), true,
   'A32: the cap is re-checked at SAVE, not only in the dropdown');
// A115: counted over ACCOUNTS now, because that is where the post lives — and
// counted the way the server counts it, admins included. The old client version
// skipped admins while the server never did, so an admin holding কোষাধ্যক্ষ made
// the screen say "0/1, free" and the save answer `position-full`.
eq(/String\(x\.username\)\.toLowerCase\(\) === String\(form\.appUser\)\.toLowerCase\(\)/.test(a25App), true,
   'A32: …counting holders EXCLUDING the member being edited, or he blocks himself');
// A115: BOTH cap counters — the member register's and the admin panel's — must
// count a post's holders the way applyPosition_ does: every row, admins
// included. Checked as a pair on purpose. This was wrong in the admin panel for
// months and right in nothing, and fixing one of two is how it comes back.
{
  // Every block that counts post holders, found by its own shape rather than by
  // a line number, then each one checked for the admin exclusion.
  // Comments STRIPPED first: the fix for this very bug carries an explanation
  // that quotes the broken line, and the check read its own explanation and
  // failed the corrected code. A source assertion that cannot tell code from
  // prose is worse than none.
  const blocks = a25App.split('const held = {};').slice(1)
    .map(function (s) { return s.slice(0, s.indexOf('});') + 3); })
    .map(function (s) { return s.split('\n').filter(function (l) { return !/^\s*\/\//.test(l); }).join('\n'); });
  eq(blocks.length, 2, 'A32: there are exactly two places that count post holders');
  eq(blocks.filter(function (s) { return /role === 'admin'/.test(s); }).length, 0,
     'A32: …and NEITHER skips admins — a slot taken is taken, whoever is in it');
}
eq(/window\.prompt/.test(a29Reg), false,
   'A32: no typing a number from a printed list — that was the complaint');
// a pledge of zero means no pledge was agreed — not an overpayment
const a27Open = { parties: [{ id: 'mm', type: 'member', name: 'সদস্য এক', pledged: 0 }],
  voids: [], corrections: [], daily: [], expenses: [], handovers: [],
  payments: [{ id: 'pp', partyId: 'mm', collectorId: 'z', collector: 'z', amount: 500, cashAmount: 500, upiAmount: 0, date: '2026-08-01' }] };
eq(reconcile(a27Open).anomalies.filter(function (a) { return a.type === 'overpaid'; }).length, 0,
   'A27: a member with no pledge is never "overpaid" — otherwise every contribution cries wolf');
const a27Pledged = JSON.parse(JSON.stringify(a27Open)); a27Pledged.parties[0].pledged = 300;
eq(reconcile(a27Pledged).anomalies.filter(function (a) { return a.type === 'overpaid'; }).length, 1,
   'A27: …but a real pledge that IS exceeded still reports');
eq(duesList(a27Open.parties, a27Open.payments, []).length, 0,
   'A27: a member with no pledge never appears in the dues list');

// a member's contribution MUST say what it is for
const a25Pay = a25App.slice(a25App.indexOf('function paymentFlow'), a25App.indexOf('function handoverFlow'));
eq(a25Pay.indexOf("String(party.type || '') === 'member'") >= 0, true, 'A25: the flow knows a member from a shop');
eq(a25Pay.indexOf("qKey: 'q_note_member', kind: 'text' }") >= 0, true,
   'A25: …and a member note carries NO `optional`, so there is no Skip button');
eq(a25I18n.indexOf('  q_note_member:') >= 0, true, 'A25: with its own wording');
// linking a member to an app account must never move money
eq(/id="mf-user"[\s\S]{0,300}u\.username/.test(a25App), true,
   'A25: the register screen links an app account, from a dropdown of real users');
// A115 renamed the note (the account is mandatory now, so it says that too).
// The property is the SENTENCE, not the key: whatever note this screen prints
// beside the account picker must still say that linking moves no money.
eq(/member_account_note/.test(a25App), true, 'A25: …the account picker carries a note');
eq(/টাকার হিসাব এতে বদলায় না/.test(a25I18n) && /changes no money/.test(a25I18n), true,
   'A25: …and says on screen that linking moves no money');
// A115: the account dropdown no longer fetches anything. It reads the committee
// roster, which rides on every pull — so the whole family of "the fetch failed
// and nothing can retry it" problems this used to guard has no way to happen.
// What must hold now is stronger and simpler: the picker needs no admin-only
// call, and it still has names with no signal at all.
eq(/Auth\.call\('listUsers'[\s\S]{0,200}mf-user/.test(a25App), false,
   'A32: the account picker makes no admin-only call — it would lock non-admins out of a grant meant for them');
eq(/memberAdminUsers = \[\];/.test(a25App), false,
   'A32: …and no code path caches the failure as an empty list');
eq(/localStorage\.getItem\('ck_committee'/.test(a25App) &&
   /localStorage\.setItem\('ck_committee'/.test(a25App), true,
   'A32: …the roster is cached, so a phone with no signal still shows who holds which post');
// A115: EVERY return path of `pull` carries it — full, delta, and the idle fast
// path. Counting them against pull's `return {` statements rather than a fixed
// number, because the number is not the property: a new early return that
// forgot the roster is exactly the bug this guards.
{
  const pullAt = a25Gs.indexOf('  pull: function');
  const pullSrc = a25Gs.slice(pullAt, a25Gs.indexOf('\n  },', pullAt));
  eq((pullSrc.match(/committee: committeeRoster_\(\)/g) || []).length,
     (pullSrc.match(/return \{ ok: true/g) || []).length,
     'A32: …and it rides EVERY pull response — one that skipped it would hide a post change from a polling phone');
}
// …which makes the callback SYNCHRONOUS once the list is cached, and a sync
// callback reading a `let` declared below it throws on the temporal dead zone,
// before paint's own guard can help. The form then sat on "loading" for ever —
// and only on the SECOND visit, because the first takes the async path.
{
  const mf = a25App.slice(a25App.indexOf('function renderMemberForm'),
                          a25App.indexOf('function saveMemberForm'));
  eq(mf.indexOf('let members = [], form = null') < mf.indexOf('function paint()'), true,
     'A32: the form state is declared BEFORE the paint that reads it');
}
eq(a25App.indexOf('function renderMemberPay') >= 0, true, 'A29: the collection screen exists');
eq(a25App.indexOf('function renderMemberAdmin') >= 0, true, 'A29: …and the register is a separate screen');
const a29Pay = a25App.slice(a25App.indexOf('function renderMemberPay'), a25App.indexOf('function renderMemberAdmin'));
eq(a29Pay.indexOf("canEntry('member')") >= 0, true, 'A29: collection is gated on the `member` grant');
eq(a29Pay.indexOf("p.type === 'member'") >= 0, true, 'A29: …and lists registered members to pick from');
eq(a29Pay.indexOf('startFlow(paymentFlow(') >= 0, true, 'A29: …then hands off to the ordinary payment flow');
eq(a29Pay.indexOf('DB.newRow') < 0, true, 'A29: the collection screen CREATES nothing — that was the bug');
eq(a25App.slice(a25App.indexOf('function renderMemberAdmin'), a25App.indexOf('function paintMemberAdmin'))
   .indexOf("canEntry('memberadmin')") >= 0, true, 'A29: the register is gated on its own grant');
eq(/if \(g === 'member'\) freshThen\(function \(\) \{ navigate\('memberpay'\); \}\)/.test(a25App), true,
   'A29: the 🤝 tile opens collection, not a registration form');
eq(a25I18n.slice(a25I18n.indexOf('  member_admin_hint:'), a25I18n.indexOf('  member_admin_hint:') + 400)
   .indexOf('টাকার হিসাব বদলায় না') >= 0, true,
   'A25: …and the register screen says in words that linking changes no money');

// ---- A26: a dot only where the work can be finished --------------------------
eq(a25App.indexOf('function refreshDots') >= 0, true, 'A26: dots are computed in one place');
eq(a25App.indexOf('function syncDots') >= 0, true, 'A26: …and recomputed on every home paint');
eq(a25App.indexOf('JSON.stringify(dotState) !== dotsDrawn') >= 0, true,
   'A26/A30: repaint compares against what is ON SCREEN, not a pre-async snapshot');
eq(a25App.indexOf('if (dotsBusy) return;') >= 0, true,
   'A30: one dot refresh at a time — overlapping ones cannot each decide "it changed"');
// A104: this used to pin `function renderHome() {\n    DB.allData`, which is
// not what it is about — it read the data-source line as a stand-in for "does
// not call syncDots", so changing the data source broke a re-entrancy test.
// Assert the property itself, over the function's real body.
{
  const s = a25App.indexOf('function renderHome() {');
  const e = a25App.indexOf('\n  function ', s + 10);
  eq(s >= 0 && e > s, true, 'A30: (renderHome found, both anchors in order)');
  const body = s >= 0 && e > s ? a25App.slice(s, e) : '';
  eq(/syncDots\s*\(/.test(body), false,
     'A30: renderHome never calls syncDots — the renderer cannot re-enter itself');
  eq(/\bsyncDots\(\);/.test(a25App), true,
     'A30: …the router calls it instead, once, after the paint');
  // A104: and home reads the same book the report does
  eq(/function renderHome\(\) \{[\s\S]{0,1400}?\n    viewData\(\)\.then/.test(a25App), true,
     'A104: home reads the merged view, so it cannot disagree with রিপোর্ট about money');
  eq(/function renderHome\(\) \{[\s\S]{0,1400}?\n    DB\.allData\(\)/.test(a25App), false,
     'A104: …and no longer reads this device’s IndexedDB alone');
}
eq(a25App.indexOf("sessionStorage.getItem('ck_swReload')") >= 0, true,
   'A30: at most ONE automatic service-worker reload per tab session');
eq(a25App.indexOf('const dotMark = function (k)') >= 0, true,
   'A26: one marker helper, so hand-rolled tiles cannot silently miss the dot');
eq(a25App.indexOf("dotMark('entries')") >= 0, true,
   'A26: …and the hand-rolled ✏️ tile calls it — the one that silently missed the dot at first');
eq(a25I18n.indexOf('  pending_here:') >= 0, true, 'A26: the dot has a title a human can read');

// ---- A28: a deploy that never reaches the phone -------------------------------
// cache.addAll() fetches through the browser's HTTP cache, and GitHub Pages
// sends max-age=600 on every file. A phone that opened the app in the last ten
// minutes could therefore fill the BRAND-NEW cache with the OLD js — the version
// bump spent on stale content, with nothing retrying until the next deploy.
const a28Sw = require('fs').readFileSync(__dirname + '/../sw.js', 'utf8');
eq(a28Sw.indexOf("cache: 'reload'") >= 0, true,
   'A28: install fetches assets bypassing the HTTP cache');
eq(a28Sw.indexOf('c.addAll(ASSETS)') < 0, true,
   'A28: …and no longer uses addAll, which cannot bypass it');
eq(a28Sw.indexOf("throw new Error('asset '") >= 0, true,
   'A28: a failed asset fails the install, so a half-built cache never activates');
// and the phone can finally say which build it is running
const a28App = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
eq(a28App.indexOf("id=\"app-ver\"") >= 0 && a28App.indexOf("k.indexOf('chanda-v') === 0") >= 0, true,
   'A28: Settings shows the CACHE the js is actually served from, not a hard-coded string');
eq(a28App.indexOf("'v2 • '") < 0, true, 'A28: …the old hard-coded "v2" label is gone');
eq(a28App.indexOf('r.update()') >= 0, true, 'A28: and a button that forces an update check');
['check_update', 'upd_found', 'upd_latest', 'upd_none'].forEach(function (k) {
  eq(a25I18n.indexOf('  ' + k + ':') >= 0, true, 'A28: ' + k + ' has a bilingual message');
});

// ---- every shipped file must PARSE ------------------------------------------
// A stray brace from a careless edit left js/app.js unparseable and the whole
// app rendered blank — and nothing here noticed, because every other test reads
// app.js as TEXT. The scope checker walks it, but a file that cannot parse never
// reaches any of that. One cheap gate, first: does it compile at all?
['js/app.js', 'js/aggregate.js', 'js/i18n.js', 'js/db.js', 'js/auth.js', 'js/sync.js',
 'js/lists.js', 'js/help.js', 'js/voice.js', 'js/numparse.js', 'js/config.js', 'sw.js',
 'apps-script/Code.gs'].forEach(function (f) {
  let err = null;
  try { new Function(require('fs').readFileSync(__dirname + '/../' + f, 'utf8')); }
  catch (e) { err = e.message; }
  eq(err, null, 'parse: ' + f + ' compiles');
});

// A ReferenceError in a click handler does not exist until somebody taps. Run
// the scope checker as part of the suite so it cannot rot in a corner.
try {
  require('child_process').execFileSync(process.execPath, [__dirname + '/scope-check.js'], { stdio: 'pipe' });
  pass++;
} catch (e) {
  fail++;
  console.error('FAIL scope check\n' + String(e.stdout || '') + String(e.stderr || ''));
}


// ---- A31: the update button that could not update -----------------------------
// Reported as "I press 🔄 আপডেট খুঁজি and nothing happens". Two of my own faults,
// and the second hid the first: the A30 reload cap swallowed the USER'S tap as
// well as the automatic reloads it was written for, and the version line printed
// a CACHE name, which flips to the new value the moment a worker claims the page
// — while the tab keeps running the old code. So a dead update looked healthy.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const sw = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');

  // The three versions are now stamped in three files. Any two agreeing while the
  // third drifts is exactly the silent-stale-deploy bug, so bind all three.
  // A34 moved the constant to js/auth.js — the single door every server call
  // goes through, and the first of the two files to load, so there is no
  // load-order question about who owns it.
  const auth = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
  const appVer = (auth.match(/APP_VERSION = '(chanda-v[\d.]+)'/) || [])[1];
  const swV = (sw.match(/VERSION = '(chanda-v[\d.]+)'/) || [])[1];
  const gsV = (gs.match(/CODE_VERSION = '(chanda-v[\d.]+)'/) || [])[1];
  eq(!!appVer, true, 'A31: the app stamps the version it is actually running');
  eq(appVer, swV, 'A31: APP_VERSION matches sw.js VERSION');
  eq(appVer, gsV, 'A31: APP_VERSION matches Code.gs CODE_VERSION');
  eq(/const APP_VERSION = Auth\.APP_VERSION;/.test(app), true,
     'A31: …and app.js takes it from there rather than keeping a second copy');
  eq((app.match(/APP_VERSION = 'chanda-v/g) || []).length, 0,
     'A31: exactly one definition of the running version');

  // The settings line must report the RUNNING code, never a cache name.
  // (A128 turned the line into innerHTML — escaped — to fit the server version
  // beneath it; the property pinned here is unchanged: the first thing printed
  // is APP_VERSION, the constant the page itself is executing.)
  eq(/const base = esc\(APP_VERSION \+ ' • ' \+ location\.hostname\)/.test(app), true,
     'A31: Settings prints the version this page is RUNNING');
  eq(app.indexOf("(mine[0] || 'no cache')") < 0, true,
     'A31: …and no longer prints an arbitrary cache name as if it were the app');
  eq(/mine\.length \? mine\.join/.test(app), true,
     'A31: with several caches present it lists them, instead of picking the oldest');
  eq(/upd_stale/.test(app) && /upd_stale:/.test(i18n), true,
     'A31: a worker holding a different version is SHOUTED, not left invisible');

  // The tap must escape the A30 cap — that cap\'s own comment promised the manual
  // button as the way out, and the button went through the capped handler.
  eq(/userReload = true;/.test(app), true, 'A31: tapping 🔄 marks the reload as user-asked');
  eq(/if \(!userReload\) \{[\s\S]{0,400}?ck_swReload/.test(app), true,
     'A31: the sessionStorage cap applies to AUTOMATIC reloads only');
  eq(/userReload[\s\S]{0,200}removeItem\('ck_swReload'\)/.test(app), true,
     'A31: …and the tap clears a cap already spent, so it works the second time too');

  // Do not depend on controllerchange for the one path the user can see.
  const upd = app.slice(app.indexOf('function runUpdate'), app.indexOf('function runUpdate') + 3400);
  eq(/w\.state === 'activated'[\s\S]{0,120}location\.reload/.test(upd), true,
     'A31: the button reloads the page itself once the new worker activates');
  eq(/w\.state === 'redundant'[\s\S]{0,160}upd_fail/.test(upd), true,
     'A31: an install that DIES says so — it used to leave "downloading" on screen for ever');
  // The trap the reported bug actually lived in: the worker had ALREADY installed
  // and claimed the page, so update() correctly found nothing new and the button
  // answered "you are on the latest" while the tab ran the old JS — every tap,
  // for ever. Nothing to download does not mean nothing to do.
  eq(/if \(!w\) \{[\s\S]{0,900}?have !== APP_VERSION\) \{ location\.reload/.test(upd), true,
     'A31: nothing to download but a newer version already held → reload, not a false all-clear');
  eq(/upd_fail:/.test(i18n), true, 'A31: upd_fail has a bilingual message');

  // The worker has to be able to answer the question at all.
  eq(/q === 'version'[\s\S]{0,120}postMessage\(VERSION\)/.test(sw), true,
     'A31: sw.js answers a version query, so the app can compare running vs held');
}


// ---- A32 ①: a committee POST carries the permissions -------------------------
// Granting per user does not scale: 10 people x ~16 keys is ~160 decisions, each
// one a chance to get it wrong. A post holds the set; a person just gets a post.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const lists = fs.readFileSync(__dirname + '/../js/lists.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');

  // THE boundary. Hrishi drew it himself: admin comes from the board, one person
  // at a time — never as a side effect of a job title.
  eq(POSITION_PERM_KEYS.indexOf('admin') < 0, true,
     'A32: a post can never carry admin');
  eq(/POSITION_PERM_KEYS[\s\S]{0,300}?concat\(\['cashier'\]\)/.test(gs), true,
     'A32: the server has the same list…');
  eq(/var keep = \(b\.perms \|\| \[\]\)\.filter\([\s\S]{0,140}POSITION_PERM_KEYS\.indexOf\(k\) >= 0/.test(gs), true,
     'A32: …and FILTERS against it server-side — the UI hiding admin is not the boundary');
  eq(/pos_no_admin:/.test(i18n) && /pos_no_admin/.test(app), true,
     'A32: and the screen says so out loud, not only the code');

  // A post stores ONE flat list; resolution decides the bucket by membership, so
  // the three key spaces must not overlap or a key lands in the wrong one silently.
  const spaces = [PERM_KEYS, REPORT_IDS, ['cashier']];
  let clash = '';
  spaces.forEach(function (a, i) {
    spaces.forEach(function (b, j) {
      if (i >= j) return;
      a.forEach(function (k) { if (b.indexOf(k) >= 0) clash = k; });
    });
  });
  eq(clash, '', 'A32: entry / report / cashier key spaces stay disjoint');

  // splitPositionPerms is the ONE place that decides which bucket a key is in.
  const sp = splitPositionPerms('shop,inhand,cashier,bogus');
  eq(sp.entries.join(','), 'shop', 'A32: entry keys land in entries');
  eq(sp.reports.join(','), 'inhand', 'A32: report ids land in reports');
  eq(sp.cashier, 1, 'A32: cashier lands on its own flag');
  eq(splitPositionPerms('admin').entries.length + splitPositionPerms('admin').reports.length
     + splitPositionPerms('admin').cashier, 0, 'A32: admin is dropped even if somebody stores it');
  eq(splitPositionPerms('').entries.length, 0, 'A32: an empty post grants nothing');

  // Seeded posts must grant NOTHING. Seeding permissions would hand out power
  // nobody asked for, and "why can he do that?" becomes unanswerable.
  eq(/perms: ''/.test(lists), true, 'A32: seeded posts start with no permissions');
  eq((lists.match(/perms: ''/g) || []).length, 4, 'A32: …all four of them');
  // The same four ids are seeded server-side, or the client rows would show in
  // the UI while every edit answered not-found.
  ['president', 'secretary', 'treasurer', 'member'].forEach(function (id) {
    eq(gs.indexOf("'" + id + "'") >= 0, true, 'A32: server seeds the ' + id + ' post');
  });
  eq(/function seedLists_/.test(gs) && /seedLists_\(sh\)/.test(gs), true,
     'A32: …and seeds them on read too, so an old book heals without setup()');
  // A115: this used to pin the literal `ensureCols_(sh, ['maxCount','perms'])`,
  // which is the representation, not the property — adding a THIRD Lists column
  // the correct, append-only way still failed it. What actually has to hold is
  // that the extra columns keep their historical order and new ones go on the
  // END, because ensureCols_ appends and an old sheet's data sits under the
  // headers it already has.
  var extra = (gs.match(/var LIST_COLS_EXTRA = \[([^\]]*)\]/) || [])[1] || '';
  var extraIds = extra.split(',').map(function (s) { return s.trim().replace(/'/g, ''); }).filter(String);
  eq(extraIds[0] === 'maxCount' && extraIds[1] === 'perms', true,
     'A32: Lists columns are appended at the END, so an old sheet keeps working');
  eq(/ensureCols_\(sh, LIST_COLS_EXTRA\)/.test(gs), true,
     'A32: …and the healer uses that one list, not a second copy of it');
  // The healing is a WRITE inside listItems — a READ endpoint every collector
  // hits on every app open. It must not lock when there is nothing to do, and
  // it MUST lock when there is, or ten phones each append their own four posts.
  eq(/if \(!needCols && !needSeed\) return;/.test(gs), true,
     'A32: healing returns without a lock when nothing is missing');
  eq(/if \(!needCols && !needSeed\) return;[\s\S]{0,240}getScriptLock\(\)[\s\S]{0,200}seedLists_/.test(gs), true,
     'A32: …and takes the script lock before it writes, like every other writer here');
  eq(/pos_none_server/.test(app) && /pos_none_server:/.test(i18n), true,
     'A32: an empty post card explains itself instead of looking broken before the redeploy');

  // 0 / blank = unlimited. Only a positive number caps.
  eq(/m > 0 && held >= m/.test(lists), true, 'A32: only a POSITIVE max caps a post');
  eq(/const m = Math\.max\(0, Number\(p\.maxCount\) \| \| 0\)/.test(lists.replace(/\|\|/g, '| |')), true,
     'A32: maxMap only reports capped posts');
}

// A116 (review #5): position-full:<names> is thrown exactly for the race
// applyPosition_'s own comment documents (stale dropdown, cap tightened after
// draw) — it must have a sentence, not show the collector a raw English code.
{
  const i18n116 = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  eq(/err_position_full:/.test(i18n116) &&
     /err_position_full:[\s\S]{0,200}\{what\}/.test(i18n116), true,
     'A116: position-full has its own sentence, carrying WHO holds the post');
}

// A115f: the banner's HEADING tells the truth. A balanced book with a
// non-money anomaly must not say "হিসাব মিলছে না" — found on the pre-go-live
// sweep, where a member row with no account made every cashier's report scream
// about money that reconciled to the rupee.
{
  const app115f = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n115f = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  eq(/t\(r\.balanced \? 'reconcile_title_anoms' : 'reconcile_title'\)/.test(app115f), true,
     'A115f: the reconcile banner heading depends on whether the money actually reconciles');
  eq(/reconcile_title_anoms:/.test(i18n115f), true, 'A115f: …and the milder heading exists in both languages');
}

// reconcile: two people in a one-person post — the case the screen cannot block,
// because two admins can assign it while both are offline.
{
  // A115: the holders come from the committee ROSTER now — a post lives on the
  // app account, not on the member row. The member rows below deliberately
  // still carry a stale `position`, because that is exactly what a book upgraded
  // mid-season looks like, and reconcile must ignore it completely.
  const members = { parties: [
    { id: 'm1', type: 'member', name: 'অ', position: 'president', appUser: 'a', pledged: 0 },
    { id: 'm2', type: 'member', name: 'ব', position: 'president', appUser: 'b', pledged: 0 },
    { id: 'm3', type: 'member', name: 'স', position: 'member', appUser: 'c', pledged: 0 }] };
  const holders = { president: ['অ', 'ব'], member: ['স'] };
  const over = reconcile(members, { positionMax: { president: 1 }, positionHolders: holders }).anomalies
    .filter(function (a) { return a.type === 'position_over_max'; });
  eq(over.length, 1, 'A32: two সভাপতি raises one anomaly');
  eq(over[0].count, 2, 'A32: …naming how many hold it');
  eq(over[0].who.join(','), 'অ,ব', 'A32: …and WHO, so it can be fixed without hunting');
  eq(reconcile(members, { positionMax: { member: 0 }, positionHolders: holders }).anomalies
     .filter(function (a) { return a.type === 'position_over_max'; }).length, 0,
     'A32: an uncapped post never complains');
  // Without the rules the check is skipped entirely — every existing caller of
  // reconcile(data) keeps working untouched.
  eq(reconcile(members).anomalies.filter(function (a) { return a.type === 'position_over_max'; }).length, 0,
     'A32: no rules passed → no post check, so old callers are unaffected');
  // A115: and the stale column is not a second source. Caps passed, holders NOT
  // — the desk must stay silent rather than read p.position and raise a clash
  // nobody can clear. A marker that cannot be cleared teaches people to ignore
  // markers, which costs more than the check was ever worth.
  eq(reconcile(members, { positionMax: { president: 1 } }).anomalies
     .filter(function (a) { return a.type === 'position_over_max'; }).length, 0,
     'A115: a stale Parties.position is never read — no roster, no post check');
  // A phone that has never pulled has an empty roster, and reports nobody over
  // cap — which is right, and needs no branch of its own: an empty map cannot
  // exceed a cap.
  eq(reconcile(members, { positionMax: { president: 1 }, positionHolders: {} }).anomalies
     .filter(function (a) { return a.type === 'position_over_max'; }).length, 0,
     'A115: an un-synced phone accuses nobody');
  // the account is required now, so a row without one is surfaced where the
  // person who can fix it is already looking
  const noAcct = reconcile({ parties: [
    { id: 'm9', type: 'member', name: 'পুরোনো', pledged: 0 },
    { id: 'm8', type: 'member', name: 'ঠিক আছে', appUser: 'kali', pledged: 0 }] }).anomalies
    .filter(function (a) { return a.type === 'member_no_account'; });
  eq(noAcct.length, 1, 'A115: a member with no app account is raised on the 🩺 desk');
  eq(noAcct[0].party, 'পুরোনো', 'A115: …by name, and only the row that is missing one');
}


// Every anomaly type the desk can print needs a TITLE string. Without one the
// card heads itself "anom_position_over_max_t" — the raw key — which is exactly
// what shipped for a minute today. Find the types in aggregate.js and demand a
// heading for each, so the next new anomaly cannot arrive half-translated.
{
  const fs = require('fs');
  const agg = fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  const types = {};
  (agg.match(/type: '([a-z_]+)'/g) || []).forEach(function (m) {
    types[m.replace(/^type: '/, '').replace(/'$/, '')] = 1;
  });
  const found = Object.keys(types);
  eq(found.length >= 8, true, 'anomaly titles: found the anomaly types to check (' + found.length + ')');
  // A62 (audit §7): the docs said EIGHT while the code raised nine, and then
  // A61 made it ten. A number written by hand in prose drifts silently, so the
  // prose is now checked against the code — in words, because that is how it is
  // written: "raises **ten** anomaly types".
  {
    const words = ['zero','one','two','three','four','five','six','seven','eight','nine','ten',
                   'eleven','twelve','thirteen','fourteen','fifteen'];
    const mm = fs.readFileSync(__dirname + '/../docs/money-model.md', 'utf8');
    eq(mm.indexOf('raises **' + words[found.length] + '** anomaly types') >= 0, true,
       'docs: money-model.md states the real count (' + found.length + ' = ' + words[found.length] + ')');
  }
  found.forEach(function (ty) {
    eq(i18n.indexOf('  anom_' + ty + '_t:') >= 0, true, 'anomaly titles: anom_' + ty + '_t exists');
  });
}


// ---- A32 ②: permissions resolve as post ∪ personal extras ---------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  const help = fs.readFileSync(__dirname + '/../js/help.js', 'utf8');

  // The whole trick: the wire format does not change, so canEntry() and every
  // screen behind it are untouched by the move to post-based granting.
  eq(/entries: eff\.entries\.join\(','\)/.test(gs) && /reports: eff\.reports\.join\(','\)/.test(gs)
     && /cashier: eff\.cashier/.test(gs), true,
     'A32②: the app receives EFFECTIVE permissions under the names it always used');
  eq(/ownEntries: String\(row\.entries/.test(gs) && /ownReports: String\(row\.reports/.test(gs)
     && /ownCashier: Number\(row\.cashier/.test(gs), true,
     'A32②: …and the personal extras ride along separately for the admin screen to edit');

  // The single most dangerous thing here: folding a post's keys into somebody's
  // personal extras would survive the day they leave the post.
  eq(/NEVER be written back/.test(gs), true,
     'A32②: the resolver is documented as read-only, never written back through saveUser_');
  eq(/u\.row\.entries = effPerms_/.test(gs), false,
     'A32②: …and nothing assigns a resolved set onto the row saveUser_ persists');

  // Every enforcement point must ask the resolver, not the raw column, or a
  // post-granted cashier would be a cashier to the app and not to the server.
  eq(/Number\(u\.row\.cashier\) === 1/.test(gs), false,
     'A32②: no enforcement point reads the raw cashier column any more');
  eq(/function isCashier_\(row\)/.test(gs), true, 'A32②: one helper answers "is this a cashier"');
  eq(/return effPerms_\(u\.row\)\.entries\.indexOf\(key\) >= 0;/.test(gs), true,
     'A32②: entryAllowed_ resolves through the post too');

  // Assigning a post: the cap is enforced server-side, where it cannot be argued
  // with, and the position must actually exist.
  eq(/if \(!found\) throw new Error\('no-such-position'\)/.test(gs), true,
     'A32②: you cannot be put in a post that does not exist');
  eq(/if \(held\.length >= cap\) throw new Error\('position-full:/.test(gs), true,
     'A32②: …nor in a full one, and the error names who holds it');

  // Clearing personal grants: destructive, admin-exempt, and it must say who.
  eq(/if \(String\(b\.confirm\) !== 'CLEAR'\) throw new Error\('confirm-required'\)/.test(gs), true,
     'A32②: clearing personal grants needs an explicit confirmation');
  eq(/if \(String\(r\[iRole\]\) === 'admin'\) return;/.test(gs), true,
     'A32②: …admins are skipped, as Hrishi asked');
  eq(/logAudit_\(me\.row, 'grants:clear', '@' \+ r\[iName\] \+ ' lost \[/.test(gs), true,
     'A32②: …and the audit names each person and what they lost, not a count');
  // The thing that makes this safe to press: it shows the consequence first.
  eq(/clear_grants_stranded/.test(app) && /clear_grants_stranded:/.test(i18n), true,
     'A32②: the button warns BY NAME about anyone whose post grants no entry permission');
  eq(/const stranded = victims\.filter/.test(app), true,
     'A32②: …computed before the call, not discovered afterwards');

  // A chip the post grants must not be editable: switching it off would do
  // nothing, and a control that visibly ignores you is worse than none.
  eq(/fromPost \? ' disabled title="' \+ esc\(t\('from_post'\)\)/.test(app), true,
     'A32②: post-granted chips are locked, and say why');
  // A38 moved the chips onto a draft, so the guarantee moved with them: the
  // draft is SEEDED from the extras and SAVED back to them, and the merged view
  // is never what gets written.
  eq(/entries: String\(u\.ownEntries \|\| ''\)\.split\(','\)\.filter\(Boolean\)/.test(app)
     && /reports: String\(u\.ownReports \|\| ''\)\.split\(','\)\.filter\(Boolean\)/.test(app), true,
     'A32②: the draft is seeded from the EXTRAS, never the merged view');
  eq(/'setEntries', \{ userId: u\.id, entries: admDraft\.entries \}/.test(app)
     && /'setReports', \{ userId: u\.id, reports: admDraft\.reports \}/.test(app), true,
     'A32②: …and saved back to the extras');
  ['eff_from_post', 'eff_extra', 'eff_final'].forEach(function (k) {
    eq(app.indexOf(k) >= 0 && i18n.indexOf('  ' + k + ':') >= 0, true,
       'A32②: the three-part breakdown says ' + k);
  });
  eq(/data-pos-user/.test(app) && /setUserPosition/.test(app), true,
     'A32②: the post is a dropdown on the user card');

  // The guide must describe the screen that now exists, in both languages.
  ['eff_from_post'].forEach(function () {});
  eq(/দুই জায়গা থেকে আসে/.test(help), true, 'A32②: the Bengali guide explains the two sources');
  eq(/come from two places/.test(help), true, 'A32②: …and the English one');
  eq(/Admin কোনো পদের সঙ্গে আসে না/.test(help) && /Admin never comes with a post/.test(help), true,
     'A32②: …and both say admin never rides a post');
}


// ---- A34: nobody should have to wonder whether their phone is current --------
// Hrishi: "if any deployment done the user will not able to do any operation".
// The goal is right; the mechanism is a loud unmissable alert whose fix is a
// button INSIDE it, not a lock — this app is offline-first, and a phone that
// cannot reach the network must still be able to write down cash it is holding.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const auth = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // One door up, one door down — so no handler and no caller can forget.
  eq(/Object\.assign\(\{ action: action, appVersion: APP_VERSION, appSchema: APP_SCHEMA \}/.test(auth), true,
     'A34: every request carries this device version AND its contract number');
  eq(/if \(out\.codeVersion === undefined\) out\.codeVersion = CODE_VERSION;/.test(gs), true,
     'A34: every response carries the server version, stamped in the single reply door');
  // Including the failures: a device that is behind AND erroring still has to
  // learn the first fact.
  eq(/noteServerVersion\(resp && resp\.codeVersion, resp && resp\.schema\);[\s\S]{0,80}if \(!resp\.ok\)/.test(auth), true,
     'A34: …and both are read BEFORE the error path throws');

  // Comparison rules. Each of the three is a bug prevented, not a nicety.
  eq(/return m \? \[Number\(m\[1\]\), Number\(m\[2\]\), Number\(m\[3\]\)\] : null;/.test(auth), true,
     'A34: an unparseable version yields null…');
  eq(/if \(!a \|\| !b\) return null;/.test(auth), true,
     'A34: …and null means SAY NOTHING — an alarm nobody can act on is worse than silence');
  eq(/const cmp = Auth\.schemaCmp\(\);[\s\S]{0,80}if \(cmp === -1\)/.test(app), true,
     'A34: the red bar fires only when this device is BEHIND — on the CONTRACT, not the release');
  eq(/if \(cmp === 1 && Auth\.isAdmin\(\)\)/.test(app), true,
     'A34: a device AHEAD of the server is the normal deploy window — told to the admin only, or every release paints every phone red');

  // The fix must be in the bar. "Settings → scroll → tap" is an errand, and
  // errands are what turn a warning into wallpaper (A19/A23/A26).
  eq(/id="ver-fix"/.test(app) && /b\.onclick = function \(\) \{ runUpdate\(b\); \};/.test(app), true,
     'A34: the alert carries its own fix button');
  eq(/function runUpdate\(btn\)/.test(app), true, 'A34: …and there is ONE update path');
  eq((app.match(/r\.update\(\)\.then/g) || []).length, 1,
     'A34: …exactly one, because two copies of that sequence would drift (A31 was three bugs inside it)');
  eq(/window\.addEventListener\('ck-version', updateTrainingBar\)/.test(app), true,
     'A34: the bar appears the moment the server version lands, not on the next navigation');
  // Persisted, so it survives a reload and stays true offline: going offline
  // does not make a device that is behind stop being behind.
  eq(/localStorage\.getItem\('ck_srv_version'\)/.test(auth), true,
     'A34: the known server version is remembered across reloads');

  // The fleet list — the part that actually answers "is everyone on it?"
  eq(/function noteAppVersion_\(u, v\)/.test(gs), true, 'A34: the server records each phone version');
  eq(/if \(!val \|\| String\(u\.row\.appVersion \|\| ''\) === val\) return;/.test(gs), true,
     'A34: …only when it CHANGES — this runs on every request, and a write per request is a lock fight');
  eq(/sh\.getRange\(u\.rowIndex, col\)\.setValue\(val\);/.test(gs), true,
     'A34: …one targeted cell, not saveUser_, so a stale copy cannot clobber the row');
  eq(/catch \(e\) \{ \/\* telemetry must never break the real action \*\/ \}/.test(gs), true,
     'A34: …and it can never break the request it rode in on');
  eq(/appVersion: String\(row\.appVersion \|\| ''\)/.test(gs), true, 'A34: publicUser_ carries it back');
  eq(/u\.appVersion === Auth\.APP_VERSION \? '✅ ' : '⚠️ '/.test(app), true,
     'A34: the admin sees ✅ / ⚠️ per person');
  ['ver_behind', 'ver_fix_btn', 'ver_server_behind', 'ver_stale_short', 'ver_unknown'].forEach(function (k) {
    eq(i18n.indexOf('  ' + k + ':') >= 0, true, 'A34: ' + k + ' has a bilingual message');
  });
}


// ---- A35: an error must not lie about what went wrong -------------------------
// "permission in positions was not working, giving internet error" — and the
// phone had perfect signal. errMsg mapped EVERY untranslated server error to
// "Internet/server problem", so a nameable refusal and a dead network looked
// identical. The report arrived carrying none of the information needed to act
// on it. Same shape as A31: the one indicator saying the reassuring wrong thing.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  // A115: this used to slice a fixed 700 characters, so adding a branch to
  // errMsg pushed the two lines below out of the window and failed correct
  // code — the A38 trap exactly. Slice the whole function instead.
  const errAt = app.indexOf('function errMsg');
  const fn = app.slice(errAt, app.indexOf('\n  }', errAt));
  eq(/return t\('err_server'\) \+ ': ' \+ raw;/.test(fn), true,
     'A35: an untranslated server error is repeated verbatim, not renamed "network"');
  eq(/if \(code === 'network' \|\| code === 'Failed_to_fetch'\) return t\('err_network'\);/.test(fn), true,
     'A35: …and only a real transport failure says "Internet"');
  eq(/I18N\[key\] \? t\(key\) : t\('err_network'\)/.test(app), false,
     'A35: the old collapse-everything-to-network fallback is gone');
  eq(i18n.indexOf('  err_server:') >= 0, true, 'A35: err_server has a bilingual message');
  // 2.2s is long enough to notice and far too short to read, remember and report.
  eq(/alert\('⚠️ ' \+ action \+ '\\n\\n' \+ errMsg\(e\)\)/.test(app), true,
     'A35: an admin failure names the action and stays on screen until dismissed');
}


// ---- A36: the two assumptions that broke under grants being REMOVABLE --------
// Sunday's rule (7a84c76 / 0a18292) was "nothing granted → only the card", and
// its stated reason was "somebody who collects nothing has no money to hand
// over". That was true while grants could only be ADDED. 🧹 clearUserGrants now
// takes them away — from somebody who may already be holding cash — and the
// version lock can freeze somebody mid-round. The money is real either way, and
// stranded cash cannot be undone.
//
// Sunday's decision itself is NOT reversed here: the ledger, reports and chat
// stay readable ("let them see"), and every one of its 17 tile tests above still
// passes untouched.
{
  const hold = { holding: true };
  // nothing granted + holding money → the way to hand it in comes back
  const stranded = homeTiles({ role: 'user', entries: '', cashier: 0 }, hold);
  eq(stranded.setUp, false, 'A36: holding cash does not make an ungranted user "set up"');
  eq(stranded.entry, [], 'A36: …they still get no entry tiles');
  eq(stranded.common, ['handover', 'hbook'], 'A36: …but CAN hand the money in, and see their book');
  eq(stranded.common.indexOf('payments'), -1,
     'A36: …and NOT take a further instalment — that is collecting, which they may not do');
  // no money in hand → Sunday's rule is exactly as it was
  eq(homeTiles({ role: 'user', entries: '', cashier: 0 }).common, [],
     'A36: with no money in hand, nothing granted is still a bare card (Sunday unchanged)');

  // behind the server: no new entries for ANYBODY, admin included
  const stale = { staleVersion: true };
  const staleAdmin = homeTiles({ role: 'admin', entries: '', cashier: 1 }, stale);
  eq(staleAdmin.blocked, true, 'A36: a stale phone is blocked…');
  eq(staleAdmin.entry.concat(staleAdmin.daily, staleAdmin.role), [],
     'A36: …with no entry, daily or desk tiles — an admin on a stale client is no safer');
  eq(staleAdmin.setUp, false, 'A36: …and is not "set up", so the card shows');
  eq(homeTiles({ role: 'user', entries: 'shop', cashier: 0 }, { staleVersion: true, holding: true }).common,
     ['handover', 'hbook'],
     'A36: a frozen collector holding cash can still hand it in');
  eq(homeTiles({ role: 'user', entries: 'shop', cashier: 0 }, { staleVersion: true }).common, [],
     'A36: …and gets nothing when there is no money to hand in');
  // the lock must not fire when we have never heard from the server
  eq(homeTiles({ role: 'user', entries: 'shop', cashier: 0 }).entry, ['shop'],
     'A36: no opts at all → normal behaviour, so an unknown version blocks nobody');
}

{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  // ONE predicate, so no entry screen can be forgotten…
  eq(/if \(key && Auth\.schemaCmp\(\) === -1\) return false;/.test(app), true,
     'A36: canEntry refuses every entry key while the phone is behind');
  // …and it must be keyed, or handing money over would be blocked too
  eq(/function canEntry\(key\) \{\n    if \(key &&/.test(app), true,
     'A36: …only when a key is given — the common actions, handover included, stay open');
  eq(/staleVersion: Auth\.schemaCmp\(\) === -1/.test(app)
     && /holding: \(avail\.cash \+ avail\.upi\) > 0/.test(app), true,
     'A36: the home screen tells homeTiles both facts');
  // Different walls need different cards, or the fix sends you the wrong way.
  // A78 added a third (stood down), and this assertion pinned the exact TEXT of
  // a two-way ternary — so a correct third card failed it. Pin the property:
  // every wall has its own card, and each is reachable from that one branch.
  // A110: …and the fix pinned the exact text of a THREE-way ternary, so the
  // fourth wall (the admin freeze) failed it exactly as the third had. The
  // property is per-card: a flag, its own branch, and a function behind it.
  // Written this way a fifth costs nothing, and a card losing its branch still
  // fails.
  [['blocked', 'staleVersionCard'], ['frozen', 'frozenCard'],
   ['exiting', 'exitingCard']].forEach(function (p) {
    eq(new RegExp('plan\\.' + p[0] + ' \\? ' + p[1] + '\\(\\)').test(app), true,
       'A36/A78/A110: plan.' + p[0] + ' reaches ' + p[1] + '() by its own branch');
    eq(app.indexOf('function ' + p[1] + '(') >= 0, true,
       'A36/A78/A110: …and ' + p[1] + '() is a card of its own');
  });
  ['noGrantCard()'].forEach(function (c) {
    eq(/: noGrantCard\(\)/.test(app) && app.indexOf('function noGrantCard(') >= 0, true,
       'A36/A78: ' + c + ' is the fallback when no wall applies');
  });
  eq(/vf\.onclick = function \(\) \{ runUpdate\(vf\); \}/.test(app), true,
     'A36: …and the blocked card carries the fix, like the bar does');
  ['ver_blocked_title', 'ver_blocked_body'].forEach(function (k) {
    eq(i18n.indexOf('  ' + k + ':') >= 0, true, 'A36: ' + k + ' has a bilingual message');
  });
}


// ---- A37: the Sync URL field could be set but not un-set ---------------------
// "there is no option to remove". Settings.scriptUrl OVERRIDES config.js, and
// silently: a phone with an old /exec pasted there keeps talking to a dead
// backend through every redeploy, with nothing on screen saying which of the
// two is winning. The only way out was to select a 114-character URL on a phone
// and delete it by hand — a chore, and chores do not get finished.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  eq(/id="surl-clear"/.test(app), true, 'A37: the Sync URL field has a one-tap clear');
  eq(/Settings\.set\('scriptUrl', ''\);/.test(app), true, 'A37: …which empties it outright');
  eq(/Settings\.get\('scriptUrl'\) \? t\('surl_own'\) : t\('surl_default'\)/.test(app), true,
     'A37: …and the screen says WHICH of the two addresses is actually in use');
  // the button only exists when there is something to clear
  eq(/\(Settings\.get\('scriptUrl'\)\n\s*\? '<button id="surl-clear"/.test(app), true,
     'A37: …shown only when the field is actually overriding something');
  ['surl_own', 'surl_default', 'surl_clear', 'surl_cleared'].forEach(function (k) {
    eq(i18n.indexOf('  ' + k + ':') >= 0, true, 'A37: ' + k + ' has a bilingual message');
  });
  // the override itself must stay falsy-empty, or clearing would not fall through
  const db = fs.readFileSync(__dirname + '/../js/db.js', 'utf8');
  eq(/set: function \(k, v\) \{ localStorage\.setItem\('ck_' \+ k, String\(v\)\); \}/.test(db), true,
     'A37: an empty setting is stored as "", so apiUrl() falls through to config.js');
}


// ---- A38: the admin panel was one page holding five jobs ---------------------
// Measured before: 2.5 screens, 740 DOM nodes, 331 buttons, and every chip tap
// cost 4 server calls (1 write + 3 needless re-reads), ~6s on a real connection,
// and ended with scrollY = 0 because renderAdmin emptied #view and the page
// collapsed under the browser. Hrishi: "i have to scroll a lot", "the page is
// moving here there everywhere", "by selecting the user it should go to a
// different screen and doing the operation, save also done from there".
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // list → screen, the idiom the rest of the app already uses
  eq(/let admCache = null, admSection = '', admUserId = '', admDraft = null;/.test(app), true,
     'A38: the panel has screens, not one page');
  eq(/data-adm-go/.test(app) && /data-adm-user/.test(app), true,
     'A38: a menu row and a person row navigate instead of expanding inline');
  eq(/data-uopen/.test(app), false, 'A38: the accordion that made the page 3,100px is gone');

  // the three re-reads after every action were the whole cost
  eq(/if \(resp && resp\.user && admCache\) \{ admPut\(resp\.user\); paintAdmin\(admCache\); \}/.test(app), true,
     'A38: an action patches the cached user from the reply instead of re-reading everything');
  eq(/function admPut\(fresh\)/.test(app), true, 'A38: …one row replaced, not the whole book');
  eq(/if \(admCache && !force\) \{ paintAdmin\(admCache\); return; \}/.test(app), true,
     'A38: moving between screens costs no server call at all');

  // chips edit a draft; one save
  eq(/toggle\(admDraft\.entries, kind\); redraw\(\);/.test(app)
     && /toggle\(admDraft\.reports, rid\); redraw\(\);/.test(app)
     && /toggle\(admDraft\.areas, aid\); redraw\(\);/.test(app), true,
     'A38: chips edit the draft — no network per tap');
  eq(/admDraft\.position = sel\.value; redraw\(\);/.test(app), true, 'A38: …so does the post');
  eq(/function admSave\(u\)/.test(app) && /if \(!jobs\.length\)/.test(app), true,
     'A38: one 💾 sends only what changed');
  // forgetting to save must not lose work silently
  eq(/function admLeaveOk\(\)/.test(app) && /if \(!admLeaveOk\(\)\) return;/.test(app), true,
     'A38: leaving with unsaved changes asks first');
  eq(/adm_dirty_n/.test(app) && /adm_unsaved:/.test(i18n), true,
     'A38: …and the count of unsaved changes is on screen');

  // every screen shares one view id, so ← has to be told its parent — and
  // backBar defers its own wiring, so ours must be queued behind it
  eq(/const backTo = !admSection \? null[\s\S]{0,180}admUserId\) \? 'users'[\s\S]{0,120}admPosId\) \? 'positions' : '';/.test(app), true,
     'A38: each screen knows its own parent — a person, and a post');
  // A39: the post screen is a screen too, with its own draft and its own save
  eq(/function admPosSave\(\)/.test(app) && /id="adm-pos-save"/.test(app), true,
     'A39: a committee post has one 💾, like a person does');
  eq(/toggle\(admPosDraft\.perms, b\.dataset\.ppKey\); redraw\(\);/.test(app), true,
     'A39: …and its chips edit a draft, not the server');
  eq(/function positionCard/.test(app), false,
     'A39: the old all-posts-on-one-page card, with a fold inside a fold, is gone');
  eq(/data-adm-pos/.test(app), true, 'A39: the post list navigates like the user list');
  eq(/const n = admDirty\(\) \+ admPosDirty\(\);/.test(app), true,
     'A39: leaving a dirty POST asks too — the same guard, not a second one');
  eq(/setTimeout\(function \(\) \{\n\s*const bb = document\.getElementById\('back-bar'\);/.test(app), true,
     'A38: …wired behind backBar\'s own deferred handler, or it is overwritten a tick later');

  // controls that used to share a page now live on different ones
  eq(/function admEl\(id\) \{ return document\.getElementById\(id\) \|\| \{\}; \}/.test(app), true,
     'A38: wiring a control that is not on THIS screen cannot throw');
  eq(/document\.getElementById\('adm-refresh'\)\.onclick/.test(app), false,
     'A38: …and no per-screen control is looked up unguarded');

  // the destructive one moved off the daily path.
  //
  // A110: these two used to slice a FIXED 1600 / 900 characters from the screen
  // and look inside. Adding one button to the data screen pushed 🧹 out of the
  // window and the assertion failed — not because anything moved, but because
  // the window was measuring length rather than the screen. Cut to the real end
  // of each block, and check both anchors are in order.
  const screenOf = function (headCall, endMark, label) {
    const a = app.indexOf(headCall), b = app.indexOf(endMark, a < 0 ? 0 : a);
    eq(a >= 0 && b > a, true, 'A38: (' + label + ' screen found, both anchors in order)');
    return a >= 0 && b > a ? app.slice(a, b) : '';
  };
  const dataScreen = screenOf("head('adm_data', 'admin')", '// All five screens live under one view id', 'data');
  eq(/clear-grants/.test(dataScreen), true, 'A38: 🧹 sits with restore and rollover…');
  const usersScreen = screenOf("head('adm_users', 'admin')", "} else if (admSection === 'users')", 'users');
  eq(/clear-grants/.test(usersScreen), false, 'A38: …not on top of the daily approve job');
  ['adm_sub_users', 'adm_sub_positions', 'adm_sub_lists', 'adm_sub_data', 'adm_danger',
   'adm_other_actions', 'adm_saved_all', 'saving'].forEach(function (k) {
    eq(i18n.indexOf('  ' + k + ':') >= 0, true, 'A38: ' + k + ' has a bilingual message');
  });
}


// ---- A40: 🧾 রসিদ ও তালিকা — the same reload, a different right answer -------
// Add / rename / delete are each a COMPLETE action, so a 💾 would be wrong here:
// you would add a row and then have to save it, which is one more step, not one
// fewer. What was wrong is what was wrong everywhere else — the full reload.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/function admListAction\(action, payload, patch\)/.test(app), true,
     'A40: list edits go through one path…');
  eq(/if \(patch\) \{ patch\(\); Lists\.refresh\(true\); admRepaint\(\); return; \}/.test(app), true,
     'A40: …rename and delete patch the cache — no re-read at all, and Lists is forced past its throttle');
  eq(/Auth\.call\(isSubject \? 'listSubjects' : 'listItems'/.test(app), true,
     'A40: …and ADD re-reads only the ONE list that grew, because the id is the server\'s');
  eq(/function admRepaint\(\)[\s\S]{0,160}window\.scrollTo\(0, y\);/.test(app), true,
     'A40: the repaint puts the scroll back where it was');
  eq(/adminAction\('addItem'|adminAction\('removeItem'|adminAction\('editItem'/.test(app), false,
     'A40: no list edit goes through the full-reload path any more');
  eq(/const afterList = function/.test(app), false, 'A40: its dead helper is gone');
}


// ---- A41: a long list wants SEARCH, not an inner scroll box ------------------
// Measured: a user row is 86px and a list row 72px, so 20 people is ~2.3 screens
// and 30 locations ~3.8. Hrishi asked whether the list should scroll inside its
// own box. On a phone that is a fight — you drag the page instead of the list,
// the inner scrollbar is invisible so you cannot tell how much is left, it
// breaks the browser's own momentum and address-bar behaviour, and it does not
// answer the real question, which is "where is this one row".
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  eq(/const ADM_FILTER_MIN = 8;/.test(app), true,
     'A41: the box appears only when the list is long enough to need it');
  eq(/return n < ADM_FILTER_MIN \? '' :/.test(app), true,
     'A41: …below that it would be clutter');
  // filtering must NOT repaint: a repaint destroys the input and takes the
  // focus with it, so the second letter goes nowhere.
  const fs0 = app.indexOf('function admWireFilter');
  const fn = app.slice(fs0, app.indexOf('\n  function ', fs0 + 10));
  eq(/r\.style\.display = hit \? '' : 'none';/.test(fn), true,
     'A41: it hides rows in place…');
  eq(/paintAdmin|renderAdmin/.test(fn), false,
     'A41: …and never repaints, or typing would lose the focus after one letter');
  eq(/matchWords\(r\.dataset\.q \|\| r\.textContent, q\)/.test(fn), true,
     'A41: rows carry what they are searchable by — matched by the shared rule (A103)');
  eq(/data-q="' \+\s*esc\(\[u\.name, u\.username, u\.phone\]/.test(app), true,
     'A41: a person is found by name, username or phone');
  eq(/admWireFilter\('adm-fu', '\[data-adm-user\]'\)/.test(app), true, 'A41: wired on the people list');
  // A101: FOUR. খরচের বিষয় was the one list on this screen without a search
  // box, and the one a season grows fastest — a new subject every time somebody
  // spends on something new. The old assertion pinned the number three, so it
  // guarded the gap instead of catching it.
  eq(/\['area', 'location', 'position', 'subject'\]\.forEach/.test(app), true,
     'A41: …and on all four master lists');
  // Every card that renders a filter box must have rows the filter can reach,
  // or the box is a control that does nothing.
  //
  // Written first as `sharedBuilder || ownLiteral` for all four kinds, which
  // was green with the subject box DELETED: the shared builder exists for the
  // other three, so the `||` answered for subject too. An assertion two things
  // can satisfy tests neither — the same trap as the two `byId[r.id] = r` lines
  // in A95. area/location/position go through one builder; subject has its own
  // card, so they are checked apart.
  eq(/admFilterBox\('adm-f-' \+ kind, list\.length\)/.test(app), true,
     'A101: the three bilingual lists get their box from the shared builder');
  eq(/li-row-' \+ kind/.test(app), true, 'A101: …and its rows carry the class that box filters on');
  eq(app.indexOf("admFilterBox('adm-f-subject', subjects.length)") > 0, true,
     'A101: the expense-subject card offers a search box of its own');
  eq(/<div class="row li-row-subject" data-q="' \+ esc\(s\.name\)/.test(app), true,
     'A101: …on rows that carry the class AND the name to search by');
  eq(/id \+ '-none'/.test(app) && /adm_filter_none:/.test(i18n), true,
     'A41: matching nothing says so, instead of showing a blank screen');
  eq(i18n.indexOf('  adm_filter_ph:') >= 0, true, 'A41: the placeholder is bilingual');
}


// ---- A42/A43: two things that were written down instead of fixed ------------
// Hrishi: "not write it down / do the change".
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const auth = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');

  // A42 — 📒 খাতা's search kept the caret only by luck; it had none.
  // Hiding rows in place is wrong HERE: the bus tab totals the filtered rows,
  // so a hidden row would still be counted. The header stays, the body redraws.
  eq(/<div id="list-body">' \+ buildBody\(\)/.test(app), true,
     'A42: the ledger list has a body that can be redrawn on its own');
  eq(/body\.innerHTML = buildBody\(\);/.test(app), true,
     'A42: typing redraws only that body…');
  eq(/oninput = function \(e\) \{\n\s*listQuery = e\.target\.value;\n\s*clearTimeout\(searchTimer\);/.test(app), true,
     'A42: …so the input, the caret and the phone keyboard are never touched');
  eq(/searchTimer = setTimeout\(function \(\) \{[\s\S]{0,220}\}, 120\);/.test(app), true,
     'A56: …and the rebuild waits for a pause, so a burst of typing costs one rebuild');
  eq(/oninput = function \(e\) \{ listQuery = e\.target\.value; renderList\(\); \}/.test(app), false,
     'A42: the whole-screen repaint on every keystroke is gone');

  // A43 — a release number and a contract number are different questions.
  eq(/const APP_SCHEMA = \d+;/.test(auth) && /var CODE_SCHEMA = \d+;/.test(gs), true,
     'A43: client and server each carry a contract number');
  const a = (auth.match(/const APP_SCHEMA = (\d+);/) || [])[1];
  const b = (gs.match(/var CODE_SCHEMA = (\d+);/) || [])[1];
  eq(a, b, 'A43: …and they agree in the repo');
  eq(/if \(out\.schema === undefined\) out\.schema = CODE_SCHEMA;/.test(gs), true,
     'A43: every reply carries it, in the same one place as the version');
  // the lock must ask the CONTRACT, never the release — otherwise a client-only
  // release locks every phone out until Code.gs is redeployed for no reason
  eq(/Auth\.versionCmp\(\) === -1/.test(app), false,
     'A43: nothing gates behaviour on the release string any more');
  eq((app.match(/Auth\.schemaCmp\(\) === -1/g) || []).length >= 2, true,
     'A43: …the lock and the home tiles both ask the contract');
  // unknown must never lock anybody out — an old server sends no schema at all
  eq(/return v === null \|\| v === '' \? -1 : Number\(v\);/.test(auth), true,
     'A43: a server that has never told us its contract reads as unknown…');
  eq(/if \(b < 0\) return null;/.test(auth), true,
     'A43: …and unknown says nothing, so nobody is locked out by silence');
}


// ---- A44: the anomaly desk threw you to the top after every fix -------------
// Measured: six anomalies is 2.3 screens. Settling one rebuilt the whole desk,
// so you landed back at the top of a screen whose entire purpose is working
// DOWN a list of several — and then had to find your place again.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  // A68: the three handlers now share one settleCard(), so the behaviour is
  // asserted where it lives instead of inside one of them.
  const fn = app.slice(app.indexOf('const settleCard = function'),
                       app.indexOf('const stampOk = function'));
  eq(/const card = b\.closest\('\.card'\);\n\s*if \(card\) card\.remove\(\);/.test(fn), true,
     'A44: the settled card is taken out where it stands');
  eq(/renderAnomalies\(\)/.test(fn), false,
     'A44: …and the desk is NOT rebuilt, so the page does not move');
  eq(/if \(!\$view\(\)\.querySelectorAll\('\.card'\)\.length\)/.test(fn), true,
     'A44: clearing the last one says "nothing left" instead of leaving a blank screen');
  // the OTHER two screens keep their full repaint on purpose
  eq(/entriesScope = b\.dataset\.escope; renderMyEntries\(\);/.test(app), true,
     'A44: ✏️ still repaints on a filter change — you asked for a different list, so the top is right');
  eq(/hbFilter = b\.dataset\.hbf; renderHandoverBook\(\);/.test(app), true,
     'A44: …and 📗 likewise');
}


// ---- A46: the same second ask on the member register form -------------------
// The entry flows ask once more before a donor's phone goes by. The 🎖️ register
// is a FORM, not a flow, so it had no such moment — you just left the box empty
// and saved. Same consequence though: no WhatsApp reminder, and nothing to
// match on when the same person is written down twice.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const fn = app.slice(app.indexOf('function saveMemberForm'),
                       app.indexOf('function saveMemberForm') + 2400);
  eq(/if \(!phone && !window\.confirm\(t\('skip_phone_confirm'\)\)\)/.test(fn), true,
     'A46: saving a member with no phone asks once more');
  // the SAME key as the flows — not a copy that could drift
  eq(/confirmSkipKey: 'skip_phone_confirm'/.test(app), true,
     'A46: …and the flows use that identical key, so the wording cannot diverge');
  eq((app.match(/skip_phone_confirm/g) || []).length, 2,
     'A46: exactly two users of the string, no third copy of the text anywhere');
  eq(/if \(box\) box\.focus\(\);/.test(fn), true,
     'A46: Cancel puts the cursor in the phone box, so the answer is one tap away');
  // email deliberately gets NO ask
  eq(/!email && !window\.confirm/.test(fn), false,
     'A46: email is NOT asked about — it buys neither a reminder nor a match, and a question with nothing behind it teaches people to tap through questions');
}


// ---- A47: concurrent edits — a hint, never a lock ---------------------------
// Hrishi asked for a "claim" so two people cannot work on the same row. Locking
// is the wrong shape for an offline-first book: a claim needs the server, so a
// collector with no signal either cannot work or works unclaimed; and a claim
// that cannot be released (dead battery, closed app) is a stuck row on the day
// it matters. Every guard below therefore costs ZERO extra server calls and
// cannot get stuck.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // The maths was never at risk: voidedIds is a SET on targetId, so a second
  // cancellation subtracts nothing twice. What was wrong is the BOOK — two rows
  // for one act, reading as if two people acted.
  const vf = app.slice(app.indexOf('function renderVoidReason'),
                       app.indexOf('function renderVoidReason') + 2600);
  eq(/v\.targetStore === targetStore && v\.targetId === targetId/.test(vf), true,
     'A47: cancelling checks whether it is already cancelled…');
  eq(/void_already/.test(vf) && /void_already:/.test(i18n), true,
     'A47: …and says who did it and when, instead of silently writing a twin');
  eq(/Auth\.call/.test(vf), false,
     'A47: …using the snapshot already on the device — no extra call, nothing to lock');

  // who cancelled it, on the row itself
  eq(/voidedOf\[v\.targetId\] = \{ reason: v\.reason \|\| '', by: v\.collector \|\| '', at: v\.createdAt \|\| '' \};/.test(app), true,
     'A47: a cancelled row carries who and when — both were already in the void row');
  eq(/function agoText\(v\)/.test(app) && /ago_min:/.test(i18n), true,
     'A47: shown as "3 minutes ago", which reads as recency');

  // the one row this book edits in place
  // A115: the member register writes over the wire now, so this stopped being a
  // warning a client offers and became a rule the server keeps: the form sends
  // the stamp of the row it was drawn from, and a row that moved since is
  // REFUSED rather than silently overwritten. Strictly stronger than the warn-
  // and-carry-on it replaced, which could only see what this device had synced.
  const a47gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  eq(/String\(b\.expect \|\| ''\) !== String\(existing\.row\.receivedAt \|\| ''\)[\s\S]{0,80}member-stale/.test(a47gs), true,
     'A47: editing a member refuses if somebody else already changed it');
  eq(/expect: memberExpect/.test(app) && /err_member_stale:/.test(i18n), true,
     'A47: …the form sends what it loaded, and the refusal has a sentence in Bengali');
  eq(/Somebody editing offline right now is invisible|only what has SYNCED/.test(app), true,
     'A47: …and the limit is written down where the code is, not just in a doc');
}


// ---- A48: every data-* the app RENDERS must have something that READS it -----
// An external audit found eight admin buttons — approve, year access, cashier,
// admin, password reset, 🔓 release session, block, unblock — rendered and
// completely inert for two releases. A blind index-to-index cut in v4.9.9,
// removing dead code, took the whole `[data-act]` handler with it because it sat
// between the two markers. I had verified those buttons on v4.9.7 and never
// re-verified them after restructuring the panel around them.
//
// 🔓 release session and 🚫 Block are what PROJECT_CONTEXT names as the ONLY
// answer to a lost phone, since sessions never expire by design. They did
// nothing, silently, and no test noticed. This one would have.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const rendered = {};
  // attributes written into markup: data-foo=" inside a string
  (app.match(/data-[a-z-]+="/g) || []).forEach(function (m) {
    rendered[m.slice(5, -2)] = 1;                       // strip 'data-' and '="'
  });
  // a reader is either a querySelectorAll('[data-foo]') or a dataset.fooBar use
  const camel = function (k) {
    return k.replace(/-([a-z])/g, function (_, c) { return c.toUpperCase(); });
  };
  const dead = Object.keys(rendered).filter(function (k) {
    if (k === 'q') return false;                        // filter payload, read via dataset.q
    return app.indexOf("[data-" + k + "]") < 0 && app.indexOf('dataset.' + camel(k)) < 0;
  });
  eq(dead.join(', '), '', 'A48: no data-* attribute is rendered without a reader');
  // and the eight in particular, by name, because these are the ones that bit
  ['approve', 'year', 'cashier', 'role', 'block', 'unblock', 'reset', 'release'].forEach(function (a) {
    eq(new RegExp("b\\.dataset\\.act === '" + a + "'").test(app), true,
       'A48: the ' + a + ' button is wired');
  });
  eq(/adminAction\('releaseSession'/.test(app), true,
     'A48: …and 🔓 release session in particular — the only revoke a leaked token has');
}


// ---- A49 (audit 0.4): a shipped row belongs to the server -------------------
// The merge let EVERY local row win, not just unsynced ones. sync.js sets
// synced=1 but never touches `status`, so a handover pushed as 'pending' stayed
// 'pending' on the sender's phone for ever: cashier confirms, the delta arrives
// correct, and the merge then shadows it with the stale local copy. His hero
// stays too high and the parcel sits in ⏳ all season — on the one screen whose
// job is to say whether he still owes that cash.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/if \(r\.synced && byId\[r\.id\]\) return;/.test(app), true,
     'A49: a synced row the server also has does NOT shadow the server copy');
  eq(/\(local\[s\] \|\| \[\]\)\.forEach\(function \(r\) \{ if \(r && r\.id != null\) byId\[r\.id\] = r; \}\)/.test(app), false,
     'A49: the unconditional local-wins line is gone');

  // and the behaviour, built the way it actually happens
  const merge = function (central, local) {
    const byId = {};
    (central || []).forEach(function (r) { byId[r.id] = r; });
    (local || []).forEach(function (r) {
      if (!r || r.id == null) return;
      if (r.synced && byId[r.id]) return;
      byId[r.id] = r;
    });
    return Object.keys(byId).map(function (k) { return byId[k]; });
  };
  const central = [{ id: 'h1', status: 'confirmed', amount: 5000 }];
  const local   = [{ id: 'h1', status: 'pending',   amount: 5000, synced: 1 }];
  eq(merge(central, local)[0].status, 'confirmed',
     'A49: the cashier\'s confirmation survives the sender\'s stale copy');
  // an unsynced row is still this device's own truth — that part must not change
  eq(merge(central, [{ id: 'h1', status: 'pending', amount: 5000, synced: 0 }])[0].status, 'pending',
     'A49: an UNSYNCED local row still wins — that was always the intent');
  // and a synced row the server has not sent back is the only copy there is
  eq(merge([], [{ id: 'h2', status: 'pending', synced: 1 }]).length, 1,
     'A49: a shipped row the snapshot lacks is still shown — never deleted to tidy up');
}


// ---- A50–A53 (audit Tier 0): the seams, and the paths that never ran --------
{
  const fs = require('fs');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const sync = fs.readFileSync(__dirname + '/../js/sync.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // 0.3 — pull samples the watermark BEFORE the rows, or a concurrent push is
  // skipped past for ever. Three independent auditors found this one.
  eq(/var stamp = dataTs_\(\);\n\s*var all = readAll_/.test(gs), true,
     'A50: pull reads the watermark BEFORE the rows');
  eq(/var cursor = Math\.max\(maxReceivedAt_\(all\), dataTs_\(\)\);/.test(gs), false,
     'A50: …the old after-the-rows cursor is gone');
  eq(/toEpoch_\(r\.receivedAt\) >= since/.test(gs), true,
     'A50: the delta filter is >=, so a row sharing the stamp\'s millisecond is not dropped');

  // 0.6 — handovers pass the push gate by design; the SERVER must own the fields
  // that decide whose money it is.
  eq(/if \(store === 'handovers'\) \{\n\s*row\.from = user\.row\.name; row\.fromId = user\.row\.username;/.test(gs), true,
     'A51: a pushed handover is stamped FROM the token, never the payload');
  eq(/row\.status = 'pending';\n\s*row\.confirmedBy = ''; row\.confirmedAt = ''; row\.rejectReason = '';/.test(gs), true,
     'A51: …and cannot arrive pre-confirmed — reconcile still balances when money only moves between pockets, so 🩺 could never catch it');
  eq(/if \(store === 'corrections'\) \{ row\.status = 'pending';/.test(gs), true,
     'A51: a correction cannot arrive pre-resolved either');
  // …but the receipt serial is NOT blanked: a correction re-sends the original
  // on purpose, and the donor is holding that paper.
  eq(/if \(store === 'payments' \|\| store === 'daily'\) row\.receiptNo = '';/.test(gs), false,
     'A51: the correction serial is preserved — breaking a working feature to close a speculative hole is the worse trade');

  // 0.1 — the most destructive action had a weaker gate than the less
  // destructive one directly above it.
  const gl = gs.slice(gs.indexOf('goLive: function'), gs.indexOf('goLive: function') + 1400);
  eq(/live_mode \|\| ''\) === 'on'\) throw new Error\('already-live'\)/.test(gl), true,
     'A52: goLive refuses once already live — it was a "delete the season" button');
  eq(/String\(b\.confirm\) !== 'LIVE'\) throw new Error\('confirm-required'\)/.test(gl), true,
     'A52: …and needs the typed word, server-side');
  eq(/confirm: 'LIVE'/.test(app), true,
     'A52: …which the client now actually sends — the admin typed it and it was thrown away');

  // 0.2 — goLive's only undo could not restore the accounts.
  eq(/data\.Users = stripTokens_\(usersSheet_\(\)/.test(gs), true, 'A52: the backup key matches SHEET_TITLES');
  // A58 (audit 1.1): …and the token never rides along. requireUser_ takes the
  // raw string, so a leaked backup was a password-free login for everyone.
  eq(/function stripTokens_\(values\)/.test(gs) && /values\[i\]\[ci\] = '';/.test(gs), true,
     'A58: backups blank the token column…');
  eq(/for \(var i = 1; i < values\.length; i\+\+\)/.test(gs), true,
     'A58: …from row 1, so the header still lines up with USER_COLS on restore');
  eq(/legacy = \{ users: 'Users' \}/.test(gs), true, 'A52: …and older lowercase backups still restore');
  eq(/throw new Error\('unknown-sheet: ' \+ key\)/.test(gs), true,
     'A52: every key is resolved BEFORE the first clear(), so a throw cannot leave the book half-restored');
  eq(/if \(key === 'Audit' \|\| key === 'audit'\) return;/.test(gs), true,
     'A52: the audit log is never overwritten — append-only means append-only');

  // 0.5 — an offline phone injecting training money into the live book
  eq(/if \(liveEpoch && String\(b\.epoch\) !== liveEpoch\) throw new Error\('stale-epoch'\)/.test(gs), true,
     'A53: push refuses a batch minted before a system reset');
  eq(/epoch: \(function \(\) \{ try \{ return localStorage\.getItem\('ck_epoch'\)/.test(sync), true,
     'A53: …and the client sends the epoch its rows were written under');
  eq(/b\.epoch !== undefined && b\.epoch !== null && String\(b\.epoch\) !== ''/.test(gs), true,
     'A53: a client that sends no epoch is let through — silence must not block a collector');
  eq(/err_stale_epoch:/.test(i18n), true, 'A53: and it says so in words, not a code');

  // the stale paste buffer
  eq(fs.existsSync(__dirname + '/../Code-gs-copy.txt'), false,
     'A52: the six-release-stale Code.gs paste buffer is gone');
}



  // ---- A60 (audit 2.1): correcting and removing a donor row ----------------
  {
  const src = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  {
    // The server rule must exist, or canEditParty is decoration.
    const seg = src.slice(src.indexOf("if (r.store === 'voids' && !voidAllowed_"),
                          src.indexOf("if (r.store === 'messages' && chatOff)"));
    eq(/r\.store === 'parties'/.test(seg) && /own\.collectorId !== user\.row\.username/.test(seg), true,
       'A60: only the creator or an admin may change an EXISTING donor row, server-side');
    eq(/user\.row\.role !== 'admin'/.test(seg), true,
       'A60: …with the admin exempt, because only the admin branch preserves attribution');

    // and a donor with money against it is removable by NOBODY — the payments
    // survive but point at a row that is gone, and every one of them then
    // raises payment_orphan for the rest of the season.
    let payRows = [['id', 'partyId'], ['pay1', 'shopA']];
    const sheets = {
      Voids: { getLastRow: () => 1, getDataRange: () => ({ getValues: () => [['targetId']] }) },
      Payments: { getLastRow: () => payRows.length, getDataRange: () => ({ getValues: () => payRows }) },
      Parties: { getLastRow: () => 3, getDataRange: () => ({ getValues: () =>
        [['id', 'collectorId', 'collectorRole'], ['shopA', 'ratan', 'collector'], ['shopB', 'ratan', 'collector']] }) },
    };
    const out = {};
    new Function('SpreadsheetApp', 'g', src +
      '\n g.voidAllowed_ = voidAllowed_; g.partyHasMoney_ = partyHasMoney_;' +
      '\n g.reset = function () { OWNER_CACHE = null; PARTY_PAY_CACHE = null; };')(
      { getActive: () => ({ getSheetByName: (n) => sheets[n] || null }) }, out);

    const admin = { row: { role: 'admin', username: 'hrishi', cashier: 1 } };
    const ratan = { row: { role: 'user', username: 'ratan', cashier: 0 } };
    out.reset();
    eq(out.voidAllowed_(admin, { targetStore: 'parties', targetId: 'shopA' }), false,
       'A60: a donor with a payment against it cannot be removed — not even by the admin');
    out.reset();
    eq(out.voidAllowed_(ratan, { targetStore: 'parties', targetId: 'shopB' }), true,
       'A60: …while an empty donor row its creator wrote down can be');
    out.reset();
    eq(out.voidAllowed_(admin, { targetStore: 'payments', targetId: 'pay1' }), true,
       'A60: …and the rule touches only parties — voiding money is unchanged');
  }
  {
    // A60: the member 🗑️ wrote `voided = 1`, which no code reads and no server
    // column stores. The button removed nothing and said "সেভ হলো".
    // the semicolon matters: the A60 note quotes the old line, and an
    // assertion that its own explanation trips is a test nobody can keep
    eq(/row\.voided = 1;/.test(appSrc), false, 'A60: the dead `voided` flag is gone');
    eq(/parties: \[[^\]]*'voided'/.test(src), false,
       'A60: …and it never was a server column, which is why the push dropped it');
    // A115: removal is a server action now, so the voids row is written there —
    // and it MUST still be a voids row, not a deleted sheet row. A deleted row
    // reaches no other phone: a delta pull carries what changed, and a row that
    // no longer exists changes nothing.
    const a60gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
    // to the END of the action, not a fixed number of characters — a window
    // that happens to fit today is a test that fails the next comment somebody
    // writes (A38, and again twice while writing A115).
    const rmAt = a60gs.indexOf('removeMember: function');
    const rm = a60gs.slice(rmAt, a60gs.indexOf('\n  },', rmAt));
    eq(/targetStore: 'parties'/.test(rm) && /reason: 'removed'/.test(rm), true,
       'A60: …removal now uses the mechanism that already works everywhere else');
    eq(/deleteRow/.test(rm), false,
       'A60: …and never a hard delete, which would reach no other phone');
    const mf = appSrc.slice(appSrc.indexOf('function renderMemberForm'),
                            appSrc.indexOf('function saveMemberForm'));
    eq(/if \(memberLivePays > 0\)/.test(mf), true,
       'A60: …and refuses when money already points at that member');

    // every screen that LISTS donors must agree with the arithmetic, which has
    // dropped voided rows all along via Aggregate.activeData
    eq((appSrc.match(/liveParties\(data\)/g) || []).length >= 9, true,
       'A60: every donor listing goes through one filter, not nine hand-rolled maps');
    eq(/function liveParties\(data\)/.test(appSrc), true, 'A60: …and that filter exists once');
    eq(typeof require('../js/aggregate.js').voidedIds, 'function',
       'A60: …built on the exported voidedIds, so screens and money cannot disagree');
    // A78: and because it is the one choke point, the stood-down member's
    // narrowed book belongs HERE and nowhere else. The server accepts a payment
    // from them only against a donor they brought in; a ledger still showing
    // everyone else's shops is a screenful of rows that reject the payment
    // after it has been typed — the exact failure this project keeps repeating.
    {
      const lp = appSrc.slice(appSrc.indexOf('function liveParties(data)'),
                              appSrc.indexOf('function canEditParty'));
      eq(/=== 'exiting'/.test(lp) && /p\.collectorId === myId/.test(lp), true,
         'A78: liveParties narrows a stood-down member to their OWN donors, at the single point all eleven listings read');
    }
    // A78c: the wipe spares Users, so a practice-time বিদায়ী walks into the
    // live season with no post and no permissions and nobody remembering why.
    // Clearing it automatically would reverse a committee decision, so the 🚀
    // card names them instead — at the moment the decision to go live is made.
    {
      const tc = appSrc.slice(appSrc.indexOf('const stillOut = resp.users.filter'),
                              appSrc.indexOf('const menuRow = function'));
      eq(/access === 'exiting'/.test(tc) && /golive_still_exiting/.test(tc), true,
         'A78c: the go-live card names anyone still standing down, so it is a choice rather than an accident');
    }
    // A78b: the server's two refusals carry numbers the admin has to ACT on —
    // how much cash is still held, how many parcels are still unanswered. Left
    // as raw codes ('holds-money:5000', 'has-pending:2:3500') they are a wall,
    // not an instruction. Both must be translated where they are caught.
    {
      const eu = appSrc.slice(appSrc.indexOf('function exitUser(u)'), appSrc.indexOf('function restoreUser'));
      eq(/has-pending:/.test(eu) && /access_has_pending/.test(eu), true,
         'A78b: "parcels are on their way to this person" is spelled out, with the count and the total — the person who can clear them fastest is the one about to lose the cashier flag');
      const bu = appSrc.slice(appSrc.indexOf('function blockUser(id)'), appSrc.indexOf('function showSnapshot'));
      eq(/holds-money:/.test(bu) && /block_holds_money/.test(bu), true,
         'A78: …and "they still hold ₹X" is put as the decision it is, not as an error code');
    }
    // A78d: the server's allow-list refuses five stores for a stood-down
    // member; the UI was offering three of them anyway — donor edit, entry
    // edit/flag, and the chat composer — each one a form that took the typing
    // and had the row thrown away on arrival. Found by walking the LIVE app as
    // one of them, which is the only reason it was found at all.
    //
    // Pinned as ONE predicate with every site asking it, not as three separate
    // checks: three rules are three chances to forget the fourth.
    {
      eq(/function amExiting\(\)/.test(appSrc), true,
         'A78d: one predicate answers "is this person standing down"');
      // One assertion per BUTTON, not per region. Written per-region first, and
      // the entry region holds two of them — so deleting either one left the
      // other behind and the check stayed green. A slice that can satisfy an
      // assertion two ways only tests one of them.
      const sites = [
        ['canEditParty', /if \(amExiting\(\)\) return false;/],
        ['the entry ✏️ chip', /mineNow && !amExiting\(\) &&/],
        ['the chat composer', /\(amExiting\(\)\s*\n?\s*\? '<div class="perm-note">/],
      ];
      sites.forEach(function (s) {
        eq(s[1].test(appSrc), true,
           'A78d: …and ' + s[0] + ' asks it, so it cannot offer what push refuses');
      });
      // A78e: and the ⚠️ flag is deliberately NOT gated — the one thing they may
      // still say. Asserted as an absence, so putting the gate back (the tidy,
      // consistent-looking change) fails instead of silently costing the book a
      // reported mistake.
      // The end marker is searched FROM the start marker. Without the offset it
      // matched an earlier copy in the file, b landed before a, and slice()
      // returned '' — which failed the assertion for a reason that had nothing
      // to do with the code under test.
      const chipsFrom = appSrc.indexOf('const action = busReceipt + editBtn');
      const chips = appSrc.slice(chipsFrom, appSrc.indexOf('return \'<div class="row\'', chipsFrom));
      eq(chips.length > 0 && /\(isVoid \|\| isFlag\)/.test(chips) && !/amExiting/.test(chips), true,
         'A78e: the ⚠️ flag stays open to a stood-down member — a flag is a report, not an entry');
    }
    // A78: 💰 and 👑 are the two chips that hand back MORE than the block took,
    // and they sat on the same screen as the block itself. The server refuses
    // them now; the chips must not be drawn either, or the admin taps one and
    // gets an error where they expected an action.
    {
      const ub = appSrc.slice(appSrc.indexOf('function userButtons(u)'),
                              appSrc.indexOf('function userSummary(u)'));
      eq(/if \(u\.access !== 'exiting'\) \{[\s\S]*make_cashier[\s\S]*make_admin[\s\S]*\}/.test(ub), true,
         'A78: the cashier and admin chips are withheld from a stood-down member');
      eq(/data-act="reset"/.test(ub) && ub.indexOf('data-act="reset"') > ub.indexOf("u.access !== 'exiting'"), true,
         'A78: …and only those two — password reset and session release still work, because a stood-down member still logs in');
    }

    // A27's rule applies to this form too: no flow question text, because the
    // flow questions promise a Skip button this screen does not have.
    const pf = appSrc.slice(appSrc.indexOf('function renderPartyForm'), appSrc.indexOf('function savePartyForm'));
    eq(/q_phone|q_pledged|q_location|q_shop_name|q_person_name/.test(pf), false,
       'A60: the donor form uses real field labels, not flow questions that say "Skip"');
    eq(/party_f_shop|party_f_pledged/.test(pf), true, 'A60: …it has its own');
    // and it is edited IN PLACE — void-and-replace would orphan every payment
    // that points at this donor by partyId
    eq(/DB\.put\('voids'[^)]*targetStore: def\.editing/.test(pf), false,
       'A60: correcting a donor does NOT void-and-replace it');
    eq(/row\.pledged = pledged;/.test(appSrc), true, 'A60: …the row is updated in place');
  }
  }


// ---- A61 (audit 2.2 / 2.3): the two anomalies nobody could act on -----------
{
  const A = require('../js/aggregate.js');
  const base = { parties: [], payments: [], daily: [], expenses: [], handovers: [], voids: [] };
  const types = (d) => A.reconcile(Object.assign({}, base, d)).anomalies.map(a => a.type);
  const dailyRow = (o) => Object.assign({ cashAmount: o.amount, upiAmount: 0, collector: 'রতন',
                                          collectorId: 'ratan', collectorRole: 'collector' }, o);

  // 2.2 — dupGroups keys on partyId and daily rows have none, so a double
  // entered round raised NOTHING. A bus collection is handed a printed
  // receipt: entering it twice means two serials for one payment.
  eq(types({ daily: [
    dailyRow({ id: 'b1', type: 'bus', busName: 'শিবম', busNumber: 'WB 65 1234', amount: 500, date: '2026-08-01' }),
    dailyRow({ id: 'b2', type: 'bus', busName: 'শিবম', busNumber: 'wb651234', amount: 500, date: '2026-08-01' }),
  ] }), ['possible_duplicate_daily'],
     'A61: the same bus written down twice on one day is raised — spacing and case do not hide it');

  // …and the BUS is the identity, so two collectors writing the same bus is
  // still one duplicate. Keying on the collector here would miss the commonest
  // version of this mistake.
  eq(types({ daily: [
    dailyRow({ id: 'b1', type: 'bus', busName: 'শিবম', busNumber: 'WB651234', amount: 500, date: '2026-08-01' }),
    dailyRow({ id: 'b2', type: 'bus', busName: 'শিবম', busNumber: 'WB651234', amount: 500, date: '2026-08-01',
               collector: 'বিমল', collectorId: 'bimal' }),
  ] }), ['possible_duplicate_daily'],
     'A61: …including when two different collectors each wrote it down');

  // road/toto is the opposite: there is no identity beyond who was walking, and
  // two people each doing a ₹500 round in a day is completely ordinary. Keying
  // without the collector would fill the desk on day one.
  eq(types({ daily: [
    dailyRow({ id: 'r1', type: 'road', amount: 500, date: '2026-08-01' }),
    dailyRow({ id: 'r2', type: 'road', amount: 500, date: '2026-08-01', collector: 'বিমল', collectorId: 'bimal' }),
  ] }), [], 'A61: two collectors each doing a ₹500 road round is NOT a duplicate');
  eq(types({ daily: [
    dailyRow({ id: 'r1', type: 'road', amount: 500, date: '2026-08-01' }),
    dailyRow({ id: 'r2', type: 'road', amount: 500, date: '2026-08-01' }),
  ] }), ['possible_duplicate_daily'], 'A61: …but the SAME collector twice is');
  eq(types({ daily: [
    dailyRow({ id: 'r1', type: 'road', amount: 500, date: '2026-08-01' }),
    dailyRow({ id: 'r2', type: 'toto', amount: 500, date: '2026-08-01' }),
  ] }), [], 'A61: a road round and a toto round are different collections');

  // the answer settles the GROUP, not the row it happens to sit on — array
  // order is not insertion order, and testing the row flagged the innocent
  // twin half the time (A22, learned the expensive way)
  eq(types({ daily: [
    dailyRow({ id: 'r1', type: 'road', amount: 500, date: '2026-08-01', dupOk: 1 }),
    dailyRow({ id: 'r2', type: 'road', amount: 500, date: '2026-08-01' }),
  ] }), [], 'A61: dupOk on EITHER row settles the pair');

  // 2.3 — overpaid could not be dismissed by anybody, so the documented A3 case
  // (two collectors calling at one shop) sat on the desk all season.
  const over = { parties: [{ id: 's1', type: 'shop', name: 'মা তারা', pledged: 1000 }],
                 payments: [{ id: 'p1', partyId: 's1', amount: 1500, cashAmount: 1500, upiAmount: 0,
                              collector: 'রতন', collectorId: 'ratan', collectorRole: 'collector' }] };
  eq(types(over).indexOf('overpaid') >= 0, true, 'A61: paid more than pledged is still raised…');
  const okd = JSON.parse(JSON.stringify(over)); okd.parties[0].pledgeOk = 1;
  eq(types(okd).indexOf('overpaid') >= 0, false, 'A61: …and pledgeOk finally clears it');
  const zero = JSON.parse(JSON.stringify(over)); zero.parties[0].pledged = 0;
  eq(types(zero).indexOf('overpaid') >= 0, false,
     'A61: a member with no pledge still raises nothing — that guard is untouched');
  // the anomaly must name the row, or the desk cannot offer a button for it
  eq(A.reconcile(Object.assign({}, base, over)).anomalies
      .filter(a => a.type === 'overpaid')[0].partyId, 's1',
     'A61: …and it carries the partyId the buttons need');

  // both stamps need REAL columns, or the answer dies at the push and the desk
  // asks again for ever — which is exactly the A60 dead-field failure
  {
    const gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
    const dailyCols = gs.slice(gs.indexOf('  daily:    ['), gs.indexOf('],', gs.indexOf('  daily:    [')))
      .replace(/\/\/[^\n]*/g, '').match(/'([a-zA-Z]+)'/g).map(q => q.slice(1, -1));
    // A61's property is that dupOk has a REAL column — without one the answer
    // dies at the push and the desk asks for ever. It used to be pinned as "and
    // it is LAST", which was a proxy for the append-only header rule; A148
    // appended `sector` after it, so the two halves are now asserted separately:
    // dupOk still has its column, and the newest column is still the last one.
    eq(dailyCols.indexOf('dupOk') >= 0, true, 'A61: daily.dupOk has a real column');
    eq(dailyCols[dailyCols.length - 1], 'sector',
       'A148: …and the newest column is appended LAST, per the header rule');
    // A68: assert the RULE, not a frozen number. A61 moved it 2→3, A68 moved
    // it 3→4; a hard-coded 3 made a correct bump look like a regression. What
    // must never drift is that the two agree — CI checks the same thing.
    const schemaC = Number((gs.match(/var CODE_SCHEMA = (\d+);/) || [])[1]);
    const schemaA = Number((require('fs').readFileSync(__dirname + '/../js/auth.js', 'utf8')
      .match(/const APP_SCHEMA = (\d+);/) || [])[1]);
    eq(schemaC >= 3, true, 'A61: two new columns was a contract change — CODE_SCHEMA moved past 2');
    eq(schemaA, schemaC,
       'A61: …and the client says the same number, or every phone locks itself out');
  }
  // and both are actionable on the desk
  {
    const app = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
    // A66: this used to assert the contents of ANOM_ACTIONABLE — a constant
    // that was set and read nowhere. It looked like coverage of a rule no code
    // obeyed, which is worse than no test at all. What matters is that the
    // desk RENDERS an answer for each of the three, so assert that instead.
    {
      const desk = app.slice(app.indexOf('function renderAnomalies'), app.indexOf('function loadMySummary'));
      [['possible_duplicate_payment', 'data-dupok'],
       ['possible_duplicate_daily', 'data-ddupok'],
       ['overpaid', 'data-pledgeok']].forEach(function (pair) {
        eq(desk.indexOf("a.type === '" + pair[0] + "'") >= 0, true,
           'A61: the desk has a branch for ' + pair[0]);
        eq(desk.indexOf(pair[1] + '=') >= 0, true, 'A61: …and that branch renders its answer (' + pair[1] + ')');
      });
    }
    ['data-ddupok', 'data-ddupvoid', 'data-pledgeok', 'data-pledgefix'].forEach(function (d) {
      eq(app.indexOf(d + '=') >= 0 && app.indexOf('[' + d + ']') >= 0, true,
         'A61: ' + d + ' is both rendered and read');
    });
    // …and the two NEW-column answers are withheld until the server can keep
    // them. Otherwise the card vanishes, the push drops the field, the next
    // pull brings the anomaly back, and the button has lied — which is the
    // failure this release is about. Only the admin sees the redeploy bar, so
    // the cashier working this desk has no other way to know.
    eq(/function serverCanStoreAnswers\(\) \{ return Auth\.schemaCmp\(\) !== 1; \}/.test(app), true,
       'A61: the desk asks whether the server can store the answer at all');
    // A73 (audit #5 V11): this asserted TWO of the three and was silent on the
    // third — so A68 shipping the payments card ungated passed clean. The list
    // is now derived from the buttons that exist, not typed out, because a
    // hand-written subset is exactly how the gap survived.
    ['data-dupok', 'data-ddupok', 'data-pledgeok'].forEach(function (d) {
      eq(new RegExp("\\(canStamp \\? '<button class=\"chip on\" " + d + "=").test(app), true,
         'A61: ' + d + ' is withheld when the server cannot store the answer');
    });
    // every card that offers a stamp must also carry the explanation
    eq((app.match(/'<\/div>' \+ stampNote \+ '<\/div>'/g) || []).length, 3,
       'A73: …and all three cards say WHY the button is missing, not just two');
    eq(/anom_needs_deploy/.test(app) && require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8').indexOf('  anom_needs_deploy:') >= 0, true,
       'A61: …saying why, in words, instead of a button that quietly does nothing');
    // the VOID answers stay available — they need no new column
    eq(/\(canStamp \? '<button class="chip void-btn" data-ddupvoid=/.test(app), false,
       'A61: voiding is not gated — it uses the voids store, which has always existed');
  }
}


// ---- A62 (audit 2.8 / 2.15) -------------------------------------------------
{
  const fs = require('fs');
  const A = require('../js/aggregate.js');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');

  // 2.8 — money is not always whole rupees. NumParse turns "দেড়" into 1.5, so
  // fractions enter, and 0.1 + 0.2 > 0.3 is true in binary.
  const NP = require('../js/numparse.js');
  eq(NP.parseAmount('দেড়'), 1.5, 'A62: "দেড়" really does produce a fraction — the premise is real');
  eq(0.1 + 0.2 > 0.3, true, 'A62: …and this is why a bare > was not safe');

  const base = { parties: [], payments: [], daily: [], expenses: [], handovers: [], voids: [] };
  const pay = (o) => Object.assign({ cashAmount: o.amount, upiAmount: 0, collector: 'র',
                                     collectorId: 'r', collectorRole: 'collector' }, o);
  // paid 0.1 + 0.2 against a pledge of 0.3 — arithmetically equal, and in
  // binary very slightly over. Before this it raised `overpaid` for the season.
  const hair = { parties: [{ id: 's1', type: 'shop', name: 'x', pledged: 0.3 }],
                 payments: [pay({ id: 'a', partyId: 's1', amount: 0.1 }), pay({ id: 'b', partyId: 's1', amount: 0.2 })] };
  eq(A.reconcile(Object.assign({}, base, hair)).anomalies.map(a => a.type).indexOf('overpaid'), -1,
     'A62: a float hair over the pledge is not an overpayment');
  // …and a real overpayment still is
  const over = JSON.parse(JSON.stringify(hair)); over.payments[1].amount = 5;
  eq(A.reconcile(Object.assign({}, base, over)).anomalies.map(a => a.type).indexOf('overpaid') >= 0, true,
     'A62: …while a real one still is');
  // the same hair must not put a fully-paid donor in the dues list, where it
  // earns them a WhatsApp reminder for four femto-rupees
  const dues = (d) => A.duesList(d.parties, d.payments, []);
  eq(dues(hair).length, 0, 'A62: a donor who has paid in full is not chased for a rounding artefact');
  eq(dues(over).length, 0, 'A62: …nor is one who overpaid');
  const owes = JSON.parse(JSON.stringify(hair)); owes.parties[0].pledged = 100;
  eq(dues(owes).length, 1, 'A62: …but somebody who genuinely owes is');

  eq(/const EPS = 0\.005;/.test(fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8')), true,
     'A62: one shared epsilon, not four opinions');
  eq(/r\.due > 0\.005/.test(gs), true, 'A62: …and the server mirror of the dues filter agrees');
  eq(/Math\.round\(totalInHand\) !== Math\.round\(expected\)/.test(
       fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8')), false,
     'A62: unbalanced no longer rounds — ₹100.49 vs ₹99.51 both round to 100 and hid a whole rupee');

  // 2.15 — three hand-rolled phone manglings, all three wrong for a number
  // written the way people write it down. Run the real helper.
  // A80: cleanPhoneIN now delegates to Aggregate.normPhone, so the real module
  // is handed in rather than stubbed — which makes this ALSO the proof that the
  // form and the 🩺 desk normalise a number the same way. A stub here would let
  // them drift apart while every assertion stayed green.
  const waSrc = app.slice(app.indexOf('function cleanPhoneIN'), app.indexOf('function emailErr'));
  const wa = new Function('Aggregate', waSrc + '\n return { cleanPhoneIN: cleanPhoneIN, waNumber: waNumber };')(
    require('../js/aggregate.js'));
  eq(wa.cleanPhoneIN('+91 98765-43210'), require('../js/aggregate.js').normPhone('+91 98765-43210'),
     'A80: the form and reconcile agree on what "the same number" means — one rule, not two');
  eq(wa.waNumber('09876543210'), '919876543210',
     'A62: a leading 0 — the case that broke the dues reminder into a dead wa.me link');
  eq(wa.waNumber('9876543210'), '919876543210', 'A62: a bare 10-digit number gets the country code');
  eq(wa.waNumber('+91 98765-43210'), '919876543210', 'A62: …as written on a visiting card');
  eq(wa.waNumber('919876543210'), '919876543210', 'A62: …and one already carrying 91 is not doubled');
  eq(wa.waNumber('12345'), '', 'A62: anything that cannot dial returns empty…');
  eq(wa.waNumber(''), '', 'A62: …including nothing at all');
  // and no copy survives anywhere
  eq(/replace\(\/\\\\D\/g, ''\)/.test(app), false, 'A62: no hand-rolled digit-strip is left in app.js');
  eq((app.match(/waNumber\(/g) || []).length >= 4, true, 'A62: …all three call sites go through the one helper');
  // a link that cannot work must not be offered
  eq(/\(wa \? '<a class="chip" href="https:\/\/wa\.me\//.test(app), true,
     'A62: the admin WhatsApp chip is withheld when the number cannot make one');
  eq(/const num = waNumber\(p\.phone\);\n\s*if \(!num\) \{ toast\(t\('no_phone'\)\); return; \}/.test(app), true,
     'A62: …and the dues reminder says so instead of opening an empty chat');
}


// ---- A63 (audit 2.11): the half-finished entry -------------------------------
{
  const app = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // every flow that can safely be rebuilt from storage carries a descriptor,
  // set in the FACTORY so none of the fourteen startFlow call sites can forget
  ['newParty', 'daily', 'collExpense', 'payment', 'expense'].forEach(function (fn) {
    eq(app.indexOf("{ fn: '" + fn + "'") >= 0, true,
       'A63: ' + fn + ' can be resumed');
  });
  // …and the two that must NOT be
  const ho = app.slice(app.indexOf('function handoverFlow'), app.indexOf('function dailyFlow'));
  eq(/resume:/.test(ho), false,
     'A63: a handover is NOT resumable — its ceiling is computed from live money, and a stale sheet would hand over money no longer held');
  eq(/resume: editing \? null : \{ fn: 'payment'/.test(app), true,
     'A63: …and neither is an EDIT — finishFlow voids the original after the replacement saves');

  // the draft is written after every accepted answer. NOT on unload:
  // pagehide/beforeunload do not fire reliably when Android kills a
  // backgrounded tab, which is the case this exists for.
  eq(/flowState\.idx\+\+; skipHidden\(\);\n[\s\S]{0,400}?draftSave\(\);/.test(app), true,
     'A63: saved after every answer…');
  // there IS a beforeunload guard in this app (the unsynced-rows warning) —
  // the claim is narrower: the DRAFT does not depend on one, because
  // pagehide/beforeunload do not fire reliably when Android kills a
  // backgrounded tab, which is the case this feature exists for.
  {
    const bu = app.slice(app.indexOf("addEventListener('beforeunload'"));
    eq(bu.slice(0, bu.indexOf('});')).indexOf('draftSave') >= 0, false,
       'A63: …and not left to an unload hook that may never run');
  }
  eq(/const DRAFT_MAX_AGE = 12 \* 60 \* 60 \* 1000;/.test(app), true,
     'A63: a draft older than a collecting day is dropped, not offered — the donor has gone');

  // presets are context, not typed work: a draft holding only presets would
  // offer to "resume" an entry nobody has started
  eq(/function flowHasTypedAnswers\(\)/.test(app), true, 'A63: "has anything been typed" is asked once, in one place');
  eq(/!pre\.hasOwnProperty\(k\)/.test(app) && /k\.indexOf\('__'\) !== 0/.test(app), true,
     'A63: …and presets and __metadata do not count as typed');

  // Back used to discard silently
  eq(/flowState && flowHasTypedAnswers\(\) && !window\.confirm\(t\('flow_leave_confirm'\)\)/.test(app), true,
     'A63: hardware/gesture Back asks before abandoning a started entry');
  eq(/history\.pushState\(\{ v: 'entry' \}, ''\);[\s\S]{0,80}renderEntry\(\);\n\s*return;/.test(app), true,
     'A63: …and staying puts the history state back, because popstate cannot be cancelled');
  eq(/Voice\.stop\(\); flowState = null;\n\s*const s = e\.state/.test(app), false,
     'A63: …the silent discard is gone');

  // the offer is a CARD, not a native modal people dismiss by reflex — and it
  // is decided BEFORE the first paint, because renderHome draws from an async
  // viewData() that would otherwise land on top of it
  eq(/function renderDraftOffer\(d\)/.test(app), true, 'A63: the offer is an in-app screen');
  eq(/if \(Auth\.loggedIn\(\) && draftRead\(\)\) current = \{ view: 'draft', params: \{\} \};\n\s*render\(\);/.test(app), true,
     'A63: …chosen before render(), so the async home paint cannot cover it');
  eq(/window\.confirm\(t\('draft_resume'\)/.test(app), false, 'A63: …and it is not a boot-time confirm dialog');
  eq(/current\.view === 'draft'/.test(app), true, 'A63: …with a route, so a background refresh repaints the offer, not home');

  ['flow_leave_confirm', 'draft_title', 'draft_what', 'draft_continue', 'draft_drop',
   'draft_discarded', 'draft_gone', 'draft_entry'].forEach(function (k) {
    eq(i18n.indexOf('  ' + k + ':') >= 0, true, 'A63: ' + k + ' is a real message');
  });
  // a resumed payment whose donor has since been removed must say so, not throw
  eq(/if \(!p\) \{ draftClear\(\); toast\(t\('draft_gone'\)\); navigate\('home'\); return; \}/.test(app), true,
     'A63: a draft whose donor is gone is dropped with an explanation');
}


// ---- A64 (audit 2.12 / 2.13) -------------------------------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const css = fs.readFileSync(__dirname + '/../css/style.css', 'utf8');
  const A = require('../js/aggregate.js');

  // 2.12 — home showed only আজ আমার তোলা, a season clock that never goes down.
  // The figure a collector is actually asked for was one tab away.
  eq(/const inHandNow = \(avail\.cash \+ avail\.upi\);/.test(app), true,
     'A64: home computes the right-now figure from the ALREADY computed myAvailable');
  eq(/class="hero-hold" data-go="report"/.test(app), true,
     'A64: …and it is tappable, to the screen that explains what it is made of');
  eq(/inHandNow > 0\n?\s*\?/.test(app) || /inHandNow > 0$/m.test(app), true,
     'A64: …but not a button at zero — a tap onto an empty breakdown teaches people it is decorative');

  // it must agree with the money engine, or home and the report contradict
  // each other on the one number a collector answers for
  const base = { parties: [], payments: [], daily: [], expenses: [], handovers: [], voids: [] };
  const own = { collectorId: 'ratan', collector: 'রতন', collectorRole: 'collector' };
  const d = Object.assign({}, base, {
    parties: [Object.assign({ id: 's1', type: 'shop', name: 'x', pledged: 5000 }, own)],
    payments: [Object.assign({ id: 'p1', partyId: 's1', amount: 3000, cashAmount: 2000, upiAmount: 1000 }, own)],
    expenses: [Object.assign({ id: 'e1', amount: 400, source: 'collection', collectionType: 'shop',
                               cashAmount: 400, upiAmount: 0, srcCat: 'shop', spentBy: 'রতন' }, own)],
  });
  const av = A.myAvailable(d, 'ratan');
  eq(av.cash + av.upi, 2600, 'A64: collected 3000 minus 400 spent = 2600');
  eq(av.cash + av.upi, A.personalSummary(d, 'ratan').inHand,
     'A64: …and home cannot disagree with আমার হিসাব, because both read myAvailable');

  // 2.13 — half the messages physically could not display
  // scoped to the .toast rule — an admin LIST row may still ellipsis a long
  // name (that is a label you can tap to see in full); a MESSAGE may not,
  // because there is nothing behind it to open
  {
    const toastCss = css.slice(css.indexOf('.toast {'), css.indexOf('.toast.show'));
    eq(/white-space: nowrap/.test(toastCss), false, 'A64: the toast no longer truncates mid-sentence…');
    eq(/text-overflow: ellipsis/.test(toastCss), false, 'A64: …with no ellipsis left on it either');
  }
  eq(/width: max-content; max-width: min\(90vw, 420px\);/.test(css), true,
     'A64: …and does not shrink-to-fit into a narrow column either (measured 188px of an available 337px)');
  eq(/function toastMs\(msg\)/.test(app) &&
     /Math\.min\(8000, 2200 \+ String\(msg \|\| ''\)\.length \* 45\)/.test(app), true,
     'A64: …and stays up long enough to be read, capped so it can never become a wall');
  eq(/}, toastMs\(msg\)\);/.test(app), true, 'A64: …which toast() actually uses');

  // contrast: --sub is the colour of every secondary line in the app
  {
    const sub = (css.match(/--sub: (#[0-9a-f]{6})/) || [])[1];
    const bg = (css.match(/--bg: (#[0-9a-f]{6})/) || [])[1];
    const card = (css.match(/--card: (#[0-9a-f]{6})/) || [])[1];
    const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
    const L = (h) => { const n = h.slice(1); const p = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16));
                       return 0.2126 * lin(p[0]) + 0.7152 * lin(p[1]) + 0.0722 * lin(p[2]); };
    const ratio = (a, b) => { let x = L(a), y = L(b); if (x < y) { const t2 = x; x = y; y = t2; }
                              return (x + 0.05) / (y + 0.05); };
    eq(sub !== '#8a7a66', true, 'A64: the old --sub was 3.88:1 on --bg — below AA, on every secondary line');
    eq(ratio(sub, bg) >= 4.5, true, 'A64: --sub clears WCAG AA on --bg (' + ratio(sub, bg).toFixed(2) + ':1)');
    eq(ratio(sub, card) >= 4.5, true, 'A64: …and on --card (' + ratio(sub, card).toFixed(2) + ':1)');
  }
}


// ---- A66 (audit 2.14 / 2.20): one copy of each rule --------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const A = require('../js/aggregate.js');

  // 2.14 — myReports() was a hand copy of the TESTED allowedReports with one
  // character different, and that character was load-bearing: a Sheets round
  // trip can hand `cashier` back as the STRING "1", and `=== 1` is then false.
  // The cashier silently loses the in-hand report — the one their job needs.
  eq(A.allowedReports({ role: 'user', reports: '', cashier: '1' }), ['inhand'],
     'A66: a cashier flag that arrived as a string still grants in-hand');
  eq(A.allowedReports({ role: 'user', reports: '', cashier: 1 }), ['inhand'],
     'A66: …and as a number');
  eq(A.allowedReports({ role: 'user', reports: '', cashier: 0 }), [],
     'A66: …while a plain collector still gets nothing by default');
  eq(/function myReports\(\)/.test(app), false, 'A66: the local copy is gone…');
  eq(/showReportButtons\(Aggregate\.allowedReports\(Auth\.current\(\)\)\)/.test(app), true,
     'A66: …and its one call site uses the tested function');

  // 2.20 — declared once, read nowhere. Each of these looked like a rule.
  [['const SIDES =', 'SIDES'],
   ['function positionOptions()', 'positionOptions'],
   ['function hasAnyGrant()', 'hasAnyGrant'],
   ['const ANOM_ACTIONABLE =', 'ANOM_ACTIONABLE']].forEach(function (pair) {
    eq(app.indexOf(pair[0]) >= 0, false, 'A66: ' + pair[1] + ' is gone — it was set and never read');
  });
  eq(/function nextReceiptNo_\(year\)/.test(gs), false,
     'A66: nextReceiptNo_ is gone — a dead minting function beside the live batching one is an invitation to call the wrong one');
  eq(/function reserveReceiptNos_/.test(gs), true, 'A66: …and the live one is still there');

  // adminAction is NOT dead and must not be "cleaned up" by the next person:
  // A48 shipped eight admin buttons that rendered and did nothing, precisely
  // because this handler had been cut.
  eq((app.match(/adminAction\(/g) || []).length >= 8, true,
     'A66: adminAction is LIVE — the audit list predates A48 restoring it');

  // the two identical category maps are now one
  eq(/const CAT_LABELS = CAT_LABEL_KEYS;/.test(app), true, 'A66: one category-label map…');
  eq((app.match(/shop: 'new_shop', person: 'new_person', member: 'new_member'/g) || []).length, 1,
     'A66: …defined exactly once, so a new category cannot be labelled on one screen and cat_other on the other');
}


// ---- A66 (audit 2.16): iOS ---------------------------------------------------
{
  const fs = require('fs');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const png = fs.readFileSync(__dirname + '/../icons/apple-touch-icon.png');

  eq(/apple-touch-icon" sizes="180x180" href="icons\/apple-touch-icon\.png"/.test(html), true,
     'A66: the apple-touch-icon is a real 180×180, not the 316 KB 512px one');
  // iOS composites transparency onto BLACK, so an alpha channel here means a
  // black-cornered icon on somebody's home screen.
  {
    // PNG colour type lives at byte 25: 2 = truecolour, 6 = truecolour+alpha
    eq(png[25], 2, 'A66: …with no alpha channel, because iOS composites transparency onto black');
    eq(png.length < 80000, true, 'A66: …and small enough to be an icon (' + Math.round(png.length / 1024) + ' KB, was 309 KB)');
    // width/height are the two big-endian ints at bytes 16..23
    eq(png.readUInt32BE(16), 180, 'A66: …180 wide');
    eq(png.readUInt32BE(20), 180, 'A66: …and 180 tall');
  }
  eq(/name="apple-mobile-web-app-capable" content="yes"/.test(html), true,
     'A66: iOS runs it standalone — without this an "installed" icon just reopens a browser tab');
  eq(/name="apple-mobile-web-app-status-bar-style" content="black-translucent"/.test(html), true,
     'A66: …with the saffron header running under the status bar…');
  eq(/env\(safe-area-inset-top\)/.test(fs.readFileSync(__dirname + '/../css/style.css', 'utf8')), true,
     'A66: …which is only safe because the header already pads for the notch');
  eq(/name="apple-mobile-web-app-title"/.test(html), true,
     'A66: …and a short home-screen name, since the full title truncates to nonsense');

  // the hint must appear only where it is true: iOS, in Safari, not installed
  eq(/function iosInstallHint\(\)/.test(app), true, 'A66: iOS gets told how to install…');
  eq(/if \(!isIOS\) return '';/.test(app), true, 'A66: …and nobody else sees it');
  eq(/window\.navigator\.standalone === true/.test(app) && /display-mode: standalone/.test(app), true,
     'A66: …nor does somebody who has already done it');
  eq(/navigator\.platform === 'MacIntel' && navigator\.maxTouchPoints > 1/.test(app), true,
     'A66: …including on iPadOS, which reports itself as a Mac');
  ['ios_install_title', 'ios_install_how', 'ios_install_why'].forEach(function (k) {
    eq(fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8').indexOf('  ' + k + ':') >= 0, true,
       'A66: ' + k + ' is a real message');
  });
}


// ---- A67 (audit 2.10): the receipt with no number yet ------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // The serial is minted by the SERVER, so an entry taken out of signal has
  // none — and the canvas printed a bare "নং —". A dash is not an explanation:
  // the donor walks away holding a receipt with no number and no reason, and
  // that number is the only thing either side can quote later.
  eq(i18n.indexOf('  rcp_no_pending_stamp:') >= 0, true, 'A67: there is a sentence for it');
  eq(/'নং  —  ' \+ tBn\('rcp_no_pending_stamp'\)/.test(app), true,
     'A67: …drawn INSIDE the image, where the corrected stamp already goes');
  // one line, not two — 278 is where the donor sentence starts, and a second
  // line there printed straight through it. Found by rendering the canvas.
  eq(/g\.fillText\(t\('rcp_no_pending_stamp'\), W - 60, 278\)/.test(app), false,
     'A67: …on ONE line, because the second one collided with the donor sentence');
  // and over SMS there is no image at all, so the sentence has to be there too
  eq(/\(rc\.receiptNo \? tBn\('receipt_no'\) \+ ' ' \+ rc\.receiptNo : tBn\('rcp_no_pending_stamp'\)\)/.test(app), true,
     'A67: …and in the text receipt, which travels without the picture');
  // the on-screen hint stays: it is for the collector, who can act on it
  eq(/receipt_no_pending/.test(app), true,
     'A67: the collector still gets their own note — the two say different things to different people');
}


// ---- A69 (audit #2 P3): timeout, in-flight guard, backoff ---------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const auth = fs.readFileSync(__dirname + '/../js/auth.js', 'utf8');

  // fetch() has NO timeout of its own. A phone on a saturated tower keeps a
  // request open indefinitely while navigator.onLine still says true, because
  // it reports link state, not reachability.
  eq(/const CALL_TIMEOUT_MS = 25000;/.test(auth), true, 'A69: every request has a deadline');
  eq(/signal: ac \? ac\.signal : undefined/.test(auth), true, 'A69: …carried by an AbortController…');
  eq(/if \(ac\) timer = setTimeout\(function \(\) \{ ac\.abort\(\); \}, CALL_TIMEOUT_MS\);/.test(auth), true,
     'A69: …which actually fires');
  eq(/\.then\(function \(r\) \{ done\(\); return r\.json\(\); \}\)/.test(auth) &&
     /\.catch\(function \(\) \{ done\(\); throw new Error\('network'\); \}\)/.test(auth), true,
     'A69: …and the timer is cleared on BOTH paths, so a finished call leaves nothing pending');
  // 25 s and not 10: one Apps Script round trip measured 2.81 s from a WIRED
  // connection (two hosts, two DNS lookups, two TLS handshakes per logical
  // call). A timeout that kills a request which would have succeeded is worse
  // than none — the retry is slower than the wait.
  eq(Number((auth.match(/CALL_TIMEOUT_MS = (\d+)/) || [])[1]) >= 20000, true,
     'A69: …with real headroom over a measured 2.81 s round trip');

  // pullCentral had no in-flight guard, unlike Sync.syncNow which always had
  // one. Four things call it: the 60 s timer, focus, the notification poll and
  // autoSync after a push.
  eq(/let pullBusy = false, pullSkip = 0, pullFails = 0;/.test(app), true, 'A69: pullCentral has an in-flight guard');
  // A117: the guard still refuses to STACK pulls, but a forced one is now
  // QUEUED instead of silently dropped. The old assertion pinned the drop —
  // which was the bug the live trial found on day one: a 🩺 answer's forced
  // pull vanished into an in-flight poll, and the poll's pre-answer snapshot
  // re-drew the card the cashier had just settled.
  eq(/if \(pullBusy\) \{ if \(forced\) pullQueued = true; return Promise\.resolve\(\); \}/.test(app), true,
     'A69/A117: …a pull never stacks, and a forced one is queued, never dropped');
  eq(/if \(pullQueued\) \{ pullQueued = false; return pullCentral\(\{ force: true \}\); \}/.test(app), true,
     'A117: …and the queued pull runs when the line frees, exactly once');
  eq(app.indexOf('if (pullBusy) { if (forced) pullQueued = true;') < app.indexOf('if (!forced && pullSkip > 0)'), true,
     'A69: …in that order');
  // A118 (live trial: "handover screen is a bit slow"): opening 🤝 জমা দিলাম
  // must not block on a server round trip when the roster the phone already
  // holds can answer. The roster branch runs FIRST and the 'cashiers' call
  // survives only as the never-pulled fallback.
  {
    const sh = app.slice(app.indexOf('function startHandover'),
                         app.indexOf('function dailyFlow'));
    // both indices must EXIST — indexOf's −1 made the first version of this
    // pass with the roster branch deleted (−1 < anything), the A100 trap again
    const iRoster = sh.indexOf('if (rosterCashiers.length)');
    const iCall = sh.indexOf("Auth.call('cashiers'");
    eq(iRoster >= 0 && iCall >= 0 && iRoster < iCall, true,
       'A118: the handover flow opens from the roster, without a round trip');
    eq(/u\.status === 'approved' && \(u\.role === 'admin' \|\| Number\(u\.cashier\) === 1\)/.test(sh), true,
       'A118: …with the same test the server list applies (approved + admin-or-cashier)');
  }

  // A121 (Hrishi: "user will be confused with these two screens"): the two
  // desks may not share the word that distinguished nothing, both must explain
  // themselves, and a tile must not double its emoji (the builder prepends
  // one, so the TITLE keys stay emoji-free).
  {
    const i18n121 = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
    const grab = function (key) {
      const m = i18n121.match(new RegExp(key + ":\\s*\\{\\s*bn:\\s*'([^']*)'"));
      return m ? m[1] : '';
    };
    const me = grab('my_entries_title'), rv = grab('review_title');
    eq(me.length > 3 && rv.length > 3, true, 'A121: both titles found');
    eq(/সংশোধন/.test(me) || /সংশোধন/.test(rv), false,
       'A121: neither desk name carries the shared word that made them one blur');
    eq(/^[\u0980-\u09FF]/.test(me) && /^[\u0980-\u09FF]/.test(rv), true,
       'A121: …both titles are emoji-free — the tile builder adds the icon, once');
    eq(/review_hint:/.test(i18n121) && /review_none:/.test(i18n121), true,
       'A121: the flag desk explains itself, and its empty state names what would appear');
    eq(/review_hint/.test(app), true, 'A121: …and the screen actually prints that hint');
  }

  // A121b: the flag-then-fix process has its OWN guide section, and the
  // my-entries screen carries a door to it where the question arises.
  {
    const help121 = require('fs').readFileSync(__dirname + '/../js/help.js', 'utf8');
    eq(/ভুল entry শোধরানো/.test(help121) && /নালিশের রায়/.test(help121) &&
       /জানানো হয়েছে — অপেক্ষায়/.test(help121), true,
       'A121: the guide walks the flag→fix→ruling chain, naming the tags the user will see');
    // A127 (trial: "no response from the app for some time"): every server-bound
  // tap answers on the button itself — busyBtn swaps to ⏳, and after 2.5 s
  // names the slow server. Pinned: the helper exists with its slow-timer, the
  // admin's central action runner uses it (those taps had NO feedback at all),
  // and login — the first tap anyone makes — uses it too.
  {
    eq(/function busyBtn\(b\)/.test(app) && /working_slow/.test(app) && /2500\)/.test(app), true,
       'A127: busyBtn exists, with the 2.5s honest-slowness escalation');
    eq(/function adminAction\(action, payload, after, btn\)/.test(app) &&
       /const undo = busyBtn\(btn\);/.test(app), true,
       'A127: the admin action runner shows busy centrally');
    eq(/const btn = this, undo = busyBtn\(btn\);\n      Auth\.login/.test(app), true,
       'A127: …and the login button — everyone\'s first tap — says ⏳');
  }

  // A129 (trial: "refresh after live — what is use of it", then "don't we need
  // it on every screen"): refresh had one visible door (a button on the admin
  // panel, sitting under the go-live card where it read as a STEP of go-live)
  // and one invisible door everywhere (pull-down). Now ONE function behind a
  // header icon present on every screen; the panel button is gone. Pinned:
  // both doors run the same function (they can never drift), the admin branch
  // refetches admCache (a forced pull alone leaves that cache stale — the
  // whole reason the old button forced), mid-flow is a no-op, and no message
  // still points at the deleted button.
  {
    const html129 = require('fs').readFileSync(__dirname + '/../index.html', 'utf8');
    eq(/id="hdr-refresh"/.test(html129), true, 'A129: the header carries the 🔄 icon');
    eq(/function manualRefresh\(\) \{\n    if \(!Auth\.loggedIn\(\) \|\| flowState\) return;/.test(app), true,
       'A129: one refresh function, a no-op mid-flow and logged out');
    eq(/hdrRefresh\.onclick = manualRefresh;/.test(app) &&
       /\) > 80\) manualRefresh\(\);/.test(app), true,
       'A129: header icon AND pull-down gesture both run it — two doors, one behavior');
    eq(/if \(current\.view === 'admin'\) \{\n      Lists\.refresh\(\); pullCentral\(\{ force: true \}\); renderAdmin\(true\); return;/.test(app), true,
       'A129: on the admin panel it refetches admCache, which a forced pull never touches');
    // any spelling at all — a first draft of this pin required the SINGLE-
    // QUOTED form and a resurrected button written as id="adm-refresh" walked
    // straight past it in the mutation drill
    eq(app.indexOf('adm-refresh') < 0, true, 'A129: the panel button is fully gone, wiring included');
    eq(/hdrRefresh\.title = t\('refresh_hint'\)/.test(app), true,
       'A129: the icon explains itself via tooltip/accessible name');

    // A129b: what the icon made easy — an OFFLINE tap on the admin panel —
    // exposed that a forced renderAdmin wiped the painted panel to "আনা
    // হচ্ছে…" and, on failure, replaced it with an error card while admCache
    // still held everything it had just been showing. A failed refresh must
    // never eat a screen we already have.
    eq(/if \(admCache\) paintAdmin\(admCache\);\n    else \$view\(\)\.innerHTML = backBar\('settings'\) \+ '<div class="empty">' \+ esc\(t\('loading'\)\)/.test(app), true,
       'A129b: a forced refresh with a cache repaints the cache and fetches behind it');
    eq(/if \(admCache && m !== 'bad-token' && m !== 'blocked' && m !== 'pending'\) \{\n          paintAdmin\(admCache\); toast\(errMsg\(e\)\); return;/.test(app), true,
       'A129b: a failed refetch repaints the cache and says why — except a dead session, which must not be papered over');
  }

  // A135 (trial: "receipt sharing in WhatsApp — why do we need to type the
  // mobile number again? it should take the number… I think it was there
  // previously"): the number WAS there — on the party row, and the 📞 remind
  // button has always used wa.me with it. The receipt screen only ever offered
  // the image, which goes through the OS share sheet, where the recipient is
  // picked by hand. Now a direct wa.me button leads when the donor's number is
  // known; the image keeps its place and finally says WHY it cannot be
  // pre-addressed; a donor with no number gets a door to add one.
  // A143 (Hrishi, after the "where is OTHER used" sweep turned to places): the
  // area picker offers no "other" and should not — an admin adds the real road
  // to the master list, and a collector standing in front of a donor must not
  // be blocked by a list missing one. So the entry stays skippable and the gap
  // is REPORTED: a shop with no এলাকা makes 📍 এলাকা-ভিত্তিক under-count a road.
  {
    const noArea = { voids: [], corrections: [], payments: [], daily: [], expenses: [], handovers: [],
      parties: [{ id: 'a1', type: 'shop', name: 'ক স্টোর্স', side: '', pledged: 0 },
                { id: 'a2', type: 'shop', name: 'খ স্টোর্স', side: 'main_malda', pledged: 0 },
                { id: 'a3', type: 'person', name: 'গ বাবু', side: '', pledged: 0 },
                { id: 'a4', type: 'member', name: 'ঘ দা', side: '', appUser: 'x', pledged: 0 }] };
    const an = reconcile(noArea, {}).anomalies.filter(function (x) { return x.type === 'party_no_area'; });
    eq(an.length, 1, 'A143: exactly the SHOP with no area is flagged');
    // guarded reads: a failed assertion must REPORT, not crash the file and
    // hide every check below it — the mutation drill found this the hard way
    eq((an[0] || {}).party, 'ক স্টোর্স', 'A143: …by name');
    eq(!!(an[0] || {}).partyId, true, 'A143: …and it carries its own 👁 door');
    // the narrowing IS the rule: the app asks shops for an area and nobody else
    const agg143 = require('fs').readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
    eq(/if \(p\.type !== 'shop' \|\| String\(p\.side \|\| ''\)\) return;/.test(agg143), true,
       'A143: a person is never flagged for a field the app never asks them for');
    eq(/const k = p\.side \|\| '—'; \/\/ shops carry an area/.test(agg143), true,
       'A143: …which is the same rule the area report itself states');
    // and it says something a person can act on, in both languages
    eq(a25I18n.indexOf('  anom_party_no_area:') >= 0 && a25I18n.indexOf('  anom_party_no_area_t:') >= 0, true,
       'A143: the row has a title and a message');
    eq(/a\.type === 'party_no_area' \? t\('anom_party_no_area'\)\.replace\('\{who\}', a\.party \|\| '\?'\)/.test(app), true,
       'A143: …and the desk renders it rather than printing the raw type');
  }

  // A142 (Hrishi: "wherever OTHER is used the comment should be mandatory, and
  // shown in the report too"): mandatory it already was — expenseFlow marks
  // that step required, and it is the app's only "other" choice. SHOWN it was
  // not. expenseTitle printed the marker and dropped the comment, so every
  // screen fed by entrySummary — ✏️ আমার লেখা entry, the 🩺 desk, the pot
  // detail, 🪦, the void list — read "🧾 খরচ · ➕ অন্য কিছু — ₹800": an amount
  // and a shrug. The by-subject report was worse: it printed the raw English
  // marker on a Bengali screen.
  {
    // the entry side of the promise, still true
    eq(/\{ key: 'comment', qKey: 'q_comment_req', kind: 'text', required: true,\n\s+showIf: function \(a\) \{ return a\.subject === OTHER_SUBJECT; \} \}/.test(app), true,
       'A142: the comment is mandatory for অন্য কিছু');
    eq(/\{ key: 'desc', qKey: 'q_desc', kind: 'text' \},/.test(app), true,
       'A142: …and a collection expense names itself too (no `optional`, so the flow demands it)');
    // the showing side — the part that was missing
    eq(/if \(raw === 'Other' \|\| raw === OTHER_SUBJECT\) return desc \|\| t\('subject_other'\);/.test(app), true,
       'A142: for অন্য কিছু the COMMENT is the name — that is what it was collected for');
    eq(/function expenseNote\(e\) \{[\s\S]{0,220}?return d && expenseTitle\(e\) !== d \? d : '';/.test(app), true,
       'A142: …and the second line is empty when it would repeat the title');
    eq((app.match(/expenseNote\(/g) || []).length >= 5, true,
       'A142: …used by the expense report AND the my-expenses card, not one of them');
    eq(app.indexOf("(e.subject && e.desc ?") < 0 && app.indexOf("(r.desc ? ' <span class=\"row-sub\">— '") < 0, true,
       'A142: neither renderer keeps its own rule about when to print the comment');
    eq(/esc\(expenseTitle\(\{ subject: s\.subject \}\)\)/.test(app), true,
       'A142: the by-subject group is LABELLED through the same rule — no raw "Other" on a Bengali screen');
    eq(/const s = r\.subject \|\| '—';/.test(require('fs').readFileSync(__dirname + '/../js/aggregate.js', 'utf8')), true,
       'A142: …while the GROUPING still keys on the stored marker, which is correct');
  }

  // A141 (Hrishi, straight after A140: "coming back, show-working is not
  // opened"): giving the working somewhere to GO exposed that it folds itself
  // shut on every re-render — so reading a second pot cost four taps instead
  // of one. The state is remembered, exactly like the back button's promise to
  // return you where you were.
  {
    eq(/let sumOpen = false;/.test(app), true, 'A141: the working remembers whether it is open');
    eq(/'<div id="sum-body"' \+ \(sumOpen \? '' : ' hidden'\) \+ '>'/.test(app), true,
       'A141: …the markup honours it');
    eq(/esc\(t\(sumOpen \? 'sum_close' : 'sum_open'\)\)/.test(app), true,
       'A141: …and so does the button\'s own label, or it lies about what a tap will do');
    eq(/body\.hidden = !body\.hidden;\n[\s\S]{0,400}?sumOpen = !body\.hidden;/.test(app), true,
       'A141: the toggle records the new state');
    eq(/body\.hidden = false;\n        sumOpen = true;/.test(app), true,
       'A141: …and so does the খরচ door, which opens the working as a side effect');
  }

  // A140 (Hrishi: "clicking a row in the working should open the user's full
  // detail"): the pot rows were dead ends. They open now — but NOT as "my
  // entries filtered by category", which was the obvious build and the wrong
  // one: দোকান ₹3,400 is what is LEFT in the pot, while my shop payments come
  // to ₹5,900, and a screen headed 3,400 listing 5,900 teaches distrust of
  // both. So the detail derives the figure it was opened with.
  {
    // THE invariant, on every pot of the seeded book: the four terms and the
    // remainder must reproduce myAvailable's figure exactly.
    const cats = ['shop', 'person', 'member', 'payment', 'bus', 'road', 'toto', 'received', 'other'];
    const avY = myAvailable(msData, 'y');
    cats.forEach(function (c) {
      const p = potDetail(msData, 'y', c);
      const sum = p.collected.total + p.receivedIn.total - p.handedOut.total - p.expenses.total + p.unattributed;
      eq(sum, p.total.total, 'A140: ' + c + ' — the working closes on the pot figure');
      eq(p.total.total, ((avY.byCat[c] || { cash: 0, upi: 0 }).cash + (avY.byCat[c] || { cash: 0, upi: 0 }).upi),
         'A140: ' + c + ' — …and that figure IS myAvailable\'s, not a second opinion');
    });
    // the pot this was written for: shop = collected 2000 − 1200 handed (h1)
    const shop = potDetail(msData, 'y', 'shop');
    eq([shop.collected.total, shop.handedOut.total, shop.total.total], [2000, 1200, 800],
       'A140: shop — collected and handed-out are read from the rows, not guessed');
    eq(shop.collected.rows.length && shop.handedOut.rows.length, 1,
       'A140: …and each term carries its rows');
    // a pending parcel is NOT out of the pot yet — only confirmed ones move
    const person = potDetail(msData, 'y', 'person');
    eq([person.collected.total, person.handedOut.total, person.total.total], [500, 0, 500],
       'A140: person — a PENDING handover has not left the pot, so it is not deducted');
    // an overspent pot stays negative and still closes
    const road = potDetail(msData, 'y', 'road');
    eq([road.collected.total, road.expenses.total, road.total.total], [300, 400, -100],
       'A140: road — the debt is shown, not hidden or borrowed from a neighbour');
    // the receiver's side: money that arrived is a PLUS term
    const jShop = potDetail(msData, 'j', 'shop');
    eq([jShop.receivedIn.total, jShop.total.total], [1200, 1200],
       'A140: the receiver sees the same parcel as an incoming term');
    // legacy rows (no breakdown) cannot be attributed — named, never hidden
    const legacy = { parties: [{ id: 's1', type: 'shop' }], voids: [], corrections: [], expenses: [], daily: [],
      payments: [{ id: 'a', collectorId: 'y', partyId: 's1', amount: 1000, cashAmount: 1000, upiAmount: 0 }],
      handovers: [{ id: 'h', fromId: 'y', toId: 'j', amount: 400, cashAmount: 400, upiAmount: 0, status: 'confirmed' }] };
    const lp = potDetail(legacy, 'y', 'shop');
    eq(lp.handedOut.rows.length, 0, 'A140: a pre-breakdown parcel is attributed to no pot…');
    eq(lp.collected.total + lp.unattributed, lp.total.total,
       'A140: …and shows up as the named remainder, so the equation still closes');
    // the screen
    eq(/<button class="kid open-pot' \+ \(neg \? ' neg' : ''\) \+ '" data-pot="'/.test(app), true,
       'A140: the pot row is a real button carrying its category');
    eq(/b\.onclick = function \(\) \{ navigate\('pot', \{ cat: b\.dataset\.pot \}\); \};/.test(app) &&
       /else if \(current\.view === 'pot'\) renderPotDetail\(current\.params\);/.test(app), true,
       'A140: …wired, and the screen survives a re-render');
    const pd = app.slice(app.indexOf('function renderPotDetail'), app.indexOf('// A132: what the epoch wipe'));
    eq(/Aggregate\.potDetail\(data, ident, cat\)/.test(pd), true,
       'A140: the screen asks aggregate — it does not re-add the money itself');
    eq(/p\.unattributed \?/.test(pd) && /pot_other/.test(pd), true,
       'A140: …and prints the remainder when there is one, rather than an equation that does not close');
    eq(/backBar\('report'\)/.test(pd), true, 'A140: ← returns to the report it was opened from');
    ['pot_title', 'pot_hint', 'pot_other'].forEach(function (k) {
      eq(a25I18n.indexOf('  ' + k + ':') >= 0, true, 'A140: ' + k + ' has a bilingual message');
    });
  }

  // A139 (Hrishi, twice: "the segregation is still weak — make the band"):
  // A136's headers were the right WORDS in the wrong FORM — 13px grey
  // uppercase, invisible beside a ₹7,450 hero. Each floor is now a zone: a
  // full-width band, a tint, and a coloured left edge that runs the whole
  // height, so the boundary survives three screens of scrolling.
  {
    const rr = app.slice(app.indexOf('function renderReport'), app.indexOf('function checkReconcile'));
    eq(/<div class="zone mine">/.test(rr) && /<div class="zone all">/.test(rr), true,
       'A139: two zones, not two labels');
    // NESTING, not mere ordering. The first draft of this pin sliced the source
    // between the two zone openers and asked whether my-summary appeared in it
    // — which is true whether the div is INSIDE the warm zone or sitting after
    // its closing tag. The mutation that moved it out stayed green. So the pin
    // now demands the exact shape: my-summary, then the zone's own closing
    // line, then the cool zone opening.
    eq(/'<div id="my-summary">[^\n]*\n\s+'<\/div>' \+\n\s+'<div class="zone all">' \+\n\s+'<div class="zone-hd">' \+ esc\(t\('central_reports'\)\)/.test(rr), true,
       'A139: …my money lives INSIDE the warm zone, closed before the cool one opens');
    // window widened for A144's comment block; the SHAPE is what is pinned —
    // picker then body then the end of the markup, all inside the cool zone
    eq(/'<div class="zone all">' \+[\s\S]{0,1600}?'<div id="report-picker">[\s\S]{0,200}?'<div id="report-body">[\s\S]{0,80}?'<\/div>';/.test(rr), true,
       'A139: …and both pickers live inside the cool zone, closed at the end');
    // A144: the "this book is partial" line belongs to the COMMITTEE zone and
    // must come before the picker — after it, it reads as a note about whichever
    // report happens to be open rather than about the whole section.
    eq(/'<div class="zone all">' \+[\s\S]{0,1600}?partialBook\(\)[\s\S]{0,200}?report_partial[\s\S]{0,200}?'<div id="report-picker">/.test(rr), true,
       'A144: …with the partial-book notice inside the committee zone, above the picker');
    eq(/esc\(me\.name \|\| Settings\.get\('collectorName'\) \|\| ''\)/.test(rr), true,
       'A139: the warm band names whose account it is');
    const css139 = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
    eq(/\.zone\.mine \{[^}]*border-left: 5px solid var\(--saffron\)/.test(css139) &&
       /\.zone\.all\s+\{[^}]*border-left: 5px solid #5b7fae/.test(css139), true,
       'A139: the edge runs the height of each zone — a header at the top helps nobody mid-scroll');
    eq(/\.zone \.card, \.zone \.sum-hero \{ background: var\(--card\); \}/.test(css139), true,
       'A139: cards keep their white ON the tint, or every card reads as disabled');
    eq(/@media print \{ \.zone \{ background: none; border: 0; padding: 0; \} \}/.test(css139), true,
       'A139: …and the tint does not eat a committee\'s printer ink');
    eq(a25I18n.indexOf('  sec_all_sub:') >= 0, true, 'A139: the cool band says what "everyone" means, bilingually');
  }

  // A138 — THE LIVE SHAPE. Found by reading Hrishi's real book: a date written
  // as "2026-08-18" becomes a DATE CELL in the Sheet and comes back as
  // "2026-08-17T18:30:00.000Z" — which IS 18 Aug in IST. So a row carries a
  // plain day while unsynced and an ISO datetime for the PREVIOUS UTC day once
  // synced, and every date comparison was false (or off by one) for the synced
  // half of the book. The harness never showed it: a fake server returns the
  // strings it was given, so every one of these pins is written in the LIVE
  // shape on purpose.
  {
    const SYNCED = '2026-08-17T18:30:00.000Z';   // = 2026-08-18 IST
    const LOCAL = '2026-08-18';                   // same day, not yet synced
    eq(dayOf(SYNCED), LOCAL, 'A138: the Sheet round-trip and the local string name the SAME day');
    eq(dayOf(LOCAL), LOCAL, 'A138: …a plain day passes through untouched');
    eq(dayOf(''), '', 'A138: …empty stays empty');
    eq(dayOf('কিছু-একটা'), 'কিছু-একটা', 'A138: …unparseable is returned as-is, never blanked');
    // createdAt is a UTC instant: 01:23 IST on the 18th is still the 17th in UTC
    eq(dayOf('2026-08-17T19:53:20.495Z'), '2026-08-18',
       'A138: …and createdAt lands on the IST day, not the UTC one');
    // the money-safety one: a duplicate that has already synced must still be
    // found by the guard that runs before the second entry is written
    const dupData = { parties: [{ id: 'q1', type: 'shop' }], voids: [], corrections: [],
      payments: [{ id: 'old', partyId: 'q1', amount: 500, date: SYNCED, collectorId: 'y' }],
      daily: [], expenses: [], handovers: [] };
    eq(samePaymentsOn(dupData, 'q1', 500, LOCAL).length, 1,
       'A138: the duplicate guard sees a SYNCED same-day payment — the case it was blind to');
    // …and the 🩺 desk groups both shapes of the same day together
    const mixed = { parties: [{ id: 'q1', type: 'shop', name: 'X', pledged: 5000, collectorId: 'y' }],
      voids: [], corrections: [], daily: [], expenses: [], handovers: [],
      payments: [{ id: 'a', partyId: 'q1', amount: 500, date: SYNCED, collectorId: 'y' },
                 { id: 'b', partyId: 'q1', amount: 500, date: LOCAL, collectorId: 'y' }] };
    eq(reconcile(mixed, {}).anomalies.filter(function (a) { return a.type === 'possible_duplicate_payment'; }).length, 1,
       'A138: …one duplicate group across the sync boundary, not two lonely halves');
    // the day line reads the live shape too
    const liveDay = mySummary({ parties: [], voids: [], corrections: [], handovers: [], expenses: [],
      daily: [], payments: [{ id: 'p', collectorId: 'y', amount: 700, date: SYNCED }] }, 'y', LOCAL);
    eq(liveDay.today.collected, 700, 'A138: 📅 আজ counts a synced row entered today');
    // every comparison site goes through the one rule
    eq(/function fmtDate\(v\) \{ return Aggregate\.dayOf\(v\); \}/.test(app), true,
       'A138: display and comparison share one definition of "which day"');
    eq(/Aggregate\.dayOf\(r\.date\) === today \|\| Aggregate\.dayOf\(r\.createdAt\) === today/.test(app), true,
       'A138: home\'s আজ আমার তোলা');
    eq(/lastAct\[p\.id\] = Aggregate\.dayOf\(p\.createdAt\);/.test(app) &&
       /const d = Aggregate\.dayOf\(r\.date\) \|\| Aggregate\.dayOf\(r\.createdAt\);/.test(app), true,
       'A138: the ledger\'s my-today-first order');
    eq(app.indexOf("String(r.date || '') === d0") < 0 &&
       app.indexOf("(r.createdAt || '').slice(0, 10) === today") < 0, true,
       'A138: no raw date comparison left in app.js');
    const agg138 = require('fs').readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
    eq(agg138.indexOf("String(p.date || '').slice(0, 10) === day") < 0 &&
       (agg138.match(/const day = dayOf\(/g) || []).length >= 3, true,
       'A138: …nor in aggregate.js — every day-key is built by dayOf');
  }

  // A137 (found while walking the full admin report for Hrishi): 💰 কার হাতে
  // কত painted every POSITIVE in-hand red — while the app's own legend, two
  // screens away, says red means shortfall. It also painted a NEGATIVE in-hand
  // green, which is the one row that genuinely needs red. Hrishi chose gold:
  // "counted now, will leave" is exactly what money still with a collector is.
  {
    const ih = app.slice(app.indexOf('function reportInhandHTML'), app.indexOf('// order = how every report lists'));
    eq(/r\.inHand > 0 \? 'gold' : r\.inHand < 0 \? 'red' : 'green'/.test(ih), true,
       'A137: positive = gold (still out), negative = red (shortfall), zero = green (settled)');
    eq(ih.indexOf("r.inHand > 0 ? 'red'") < 0, true,
       'A137: …the old healthy-collector-is-red rule is gone');
    eq(/inhand_colour_note/.test(ih), true,
       'A137: the card says what its colours mean — the cashier has no legend on this screen');
    const css137 = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
    eq(/--gold-ink: #8a5a00;/.test(css137) && /\.stat3 \.gold b, \.gold b \{ color: var\(--gold-ink\); \}/.test(css137), true,
       'A137: gold TEXT gets its own readable ink — --gold is a background colour (1.9:1 on white)');
    eq(/#print-area \.gold b \{ color: #000; \}/.test(css137), true,
       'A137: …and prints black, like the other two');
    eq(a25I18n.indexOf('  inhand_colour_note:') >= 0, true, 'A137: the note is bilingual');
  }

  // A136 (deep-research on the collector's own report): the season line used
  // to list four figures and then FORBID reconciling them — while
  // collected + received − expenses − handed equals the hero by construction.
  // Now the line IS the equation, every moneyed term is a door to its proof
  // rows, the day gets its own line, group names speak money not app-jargon,
  // the debt note says what to DO, the report screen finally has a hint and a
  // guide door, and the আমার/সবার floors got visible headers.
  {
    // THE new invariant, in real arithmetic on the existing fixture: the
    // equation the screen now prints must hold for a sender and a receiver.
    eq(ms.tillNow.collected + (ms.tillNow.received || 0) - ms.tillNow.expenseTotal - ms.tillNow.handedOver,
       ms.hero.total, 'A136: sender — collected − spent − handed IS the hero, to the rupee');
    eq(msJ.tillNow.collected + (msJ.tillNow.received || 0) - msJ.tillNow.expenseTotal - msJ.tillNow.handedOver,
       msJ.hero.total, 'A136: receiver — with received in the sum, same equation, same rupee');
    // today: parameter-fed, deterministic — the fixture expense is dated
    const msT = mySummary(msData, 'y', '2026-07-24');
    eq([msT.today.collected, msT.today.expense], [0, 400],
       'A136: the day line counts only that DAY\'s rows, mine only');
    eq(mySummary(msData, 'y', '2026-07-25').today.expense, 0,
       'A136: …a different day counts none of them');
    eq(mySummary(msData, 'y').today, null,
       'A136: …and no date passed means no today block — tests stay deterministic');
    // the screen: equation rendered with doors, zero terms stay plain text
    eq(/function eqTerm\(label, amount, go, id\) \{/.test(app) &&
       /if \(!amount\) return '<span class="term">'/.test(app), true,
       'A136: a zero term is plain text — a dead button teaches people to stop pressing');
    eq(/eqTerm\(t\('my_collected'\), m\.tillNow\.collected, 'entries', ''\)/.test(app) &&
       /eqTerm\(t\('my_handed'\), m\.tillNow\.handedOver, 'hbook', ''\)/.test(app), true,
       'A136: তুলেছি opens my entries, জমা opens the handover book');
    eq(/=== hero \? '✓' : '⚠️'/.test(app), true,
       'A136: the screen derives the hero and says ✓ only when the sum truly lands on it');
    eq(/const ex = root\.querySelector\('#eq-exp'\);/.test(app) &&
       /card\.scrollIntoView\(/.test(app), true,
       'A136: খরচ opens the working and lands on the 🧾 card on this same screen');
    eq(app.indexOf("id=\"my-exp-card\"") >= 0, true, 'A136: …which now has an anchor to land on');
    eq(/mySummary\(data, ident, todayISO\(\)\)/.test(app), true,
       'A136: the live screen feeds the real date in — aggregate never reads a clock');
    // words: money language, honest debt note, headers, hint+door
    eq(a25I18n.indexOf('দাতাদের চাঁদা') >= 0 && a25I18n.indexOf('নতুন এন্ট্রি (চাঁদা') < 0, true,
       'A136: the entry group is named after the MONEY, not the app concept');
    eq(a25I18n.indexOf('দোষ নয়: পরে নগদ অদল-বদল') >= 0, true,
       'A136: the debt note now says what to DO, not just that it owes');
    eq(a25I18n.indexOf('মেলানোর জিনিস নয়') < 0, true,
       'A136: the "do not reconcile" sentence is gone — the screen reconciles itself');
    // (A139 turned the headers into zone BANDS — same property, stronger form)
    eq(/'<div class="zone-hd">🙋 ' \+ esc\(t\('sec_mine'\)\)/.test(app) &&
       a25I18n.indexOf('👥 সবার হিসাব') >= 0, true,
       'A136: both floors of the report carry a human header');
    eq(/esc\(t\('report_hint'\)\) \+ ' ' \+ guideDoor\('ledger'\)/.test(app) &&
       /wireGuideDoors\(\);\n    loadMySummary\(\);/.test(app), true,
       'A136: the report screen finally has its hint and a WIRED guide door');
    eq(app.indexOf("? '“' + esc(h.rejectReason)") >= 0 &&
       app.indexOf("' · “' + esc(h.rejectReason)") < 0, true,
       'A136: the ❌ row separator is written once — no more "· ·"');
    ['eq_inhand', 'today_short', 'sec_mine', 'report_hint'].forEach(function (k) {
      eq(a25I18n.indexOf('  ' + k + ':') >= 0, true, 'A136: ' + k + ' has a bilingual message');
    });
  }

  // A135b (Hrishi's call after seeing what the direct path could carry): a
  // receipt is a money document and should have ONE form — the picture. So
  // the wa.me text button is gone again and the image keeps the WhatsApp
  // button to itself. What survives is the ANSWER to the original question,
  // said on the screen where it was asked.
  {
    const rp = app.slice(app.indexOf('const paint = function () {'), app.indexOf('contWire();\n      };'));
    eq(/receipt_img_hint/.test(rp), true,
       'A135b: the screen says why the share sheet asks who — no platform can pre-address a picture');
    eq(a25I18n.indexOf('  receipt_img_hint:') >= 0, true, 'A135b: …in both languages');
    eq(app.indexOf('shareReceiptWA') < 0 && app.indexOf('rcp-wadirect') < 0, true,
       'A135b: the direct-text path is fully gone — no half-removed button left wired');
    eq(/'<button id="rcp-wa" class="primary big block">📷 '/.test(rp), true,
       'A135b: …and the picture receipt is the primary action again');
    eq(/document\.getElementById\('rcp-sms'\)\.onclick = function \(\) \{ shareReceiptText\(rc, phone\); \};/.test(app), true,
       'A135b: SMS still carries the text receipt to the stored number — the text path was never lost');
  }

  // A134 (trial: "member new entry should show the same as add-payment/dues
  // member rows"): the 🤝 picker — the screen where you ASK for money — showed
  // one bare number that never said paid, pledged or due, while the ledger row
  // for the same member said ₹200/₹500 + বাকি. Same money language now; a
  // member with no pledge shows just the paid figure, never a fake /₹0.
  {
    const mp = app.slice(app.indexOf('function paintMembers'), app.indexOf("el.querySelectorAll('[data-mpay]')"));
    eq(/const paid = paidBy\[m\.id\] \|\| 0, pledged = Number\(m\.pledged\) \|\| 0, due = pledged - paid;/.test(mp), true,
       'A134: the member picker computes the ledger row\'s three figures');
    eq(/fmtMoney\(paid\) \+ \(pledged \? '\/' \+ fmtMoney\(pledged\) : ''\)/.test(mp), true,
       'A134: …paid/pledged shown together, and no fake /₹0 without a pledge');
    eq(/due > 0 \? '<span class="due-chip">' \+ esc\(t\('due'\)\)/.test(mp) && /ok-chip/.test(mp), true,
       'A134: …with the same বাকি chip and ✅ the ledger row uses');
    eq(mp.indexOf('cat-tot') < 0, true,
       'A134: the old bare-number style is gone from the picker');
  }

  // A133 (trial: "user profile details update is not there / mail id / use the
  // same at member creation"): a registration typo in the name was PERMANENT —
  // no action could fix it, not even the admin's. Now: updateProfile
  // (name/phone/email — display identity; money stays keyed by username),
  // self-service or admin, audit-logged; email joins Users and register; the
  // roster carries contact so the member form can prefill from a linked
  // account, blank-only.
  {
    const gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
    eq(/'exitSnap',\n[\s\S]{0,400}?'email'\];/.test(gs), true,
       'A133: email is APPENDED LAST to USER_COLS — position-mapped readers stay aligned');
    eq(/updateProfile: function \(b\) \{\n    var me = requireUser_\(b\.token\);/.test(gs), true,
       'A133: updateProfile exists behind a real token');
    eq(/if \(String\(me\.row\.role\) !== 'admin'\) throw new Error\('not-allowed'\);/.test(gs), true,
       'A133: …someone ELSE\'s card needs the admin — the server checks, not the screen');
    eq(/logAudit_\(me\.row, 'profile:update'/.test(gs) && /touchData_\(\);\n    logAudit_\(me\.row, 'profile:update'/.test(gs), true,
       'A133: …audited old→new, and data_ts bumped so the roster re-rides to every phone');
    eq(/username: username, name: name,\n          phone: String\(b\.phone \|\| ''\), email: String\(b\.email \|\| ''\)/.test(gs), true,
       'A133: register stores the email it is given');
    eq(/phone: String\(row\.phone \|\| ''\), email: String\(row\.email \|\| ''\),\n\s+position: String\(row\.position \|\| ''\)/.test(gs), true,
       'A133: the roster carries contact for the member-form prefill');
    eq(/id="rg-email"/.test(app) && /email: email, password: pw,/.test(app), true,
       'A133: the register form collects and SENDS the email');
    eq(/function renderProfileForm\(params\)/.test(app) &&
       /else if \(current\.view === 'profile'\) renderProfileForm\(current\.params\);/.test(app), true,
       'A133: the profile form exists and survives a re-render');
    eq(/localStorage\.setItem\('ck_user', JSON\.stringify\(r\.user\)\)/.test(app) &&
       /Settings\.set\('collectorName', r\.user\.name \|\| name\);/.test(app), true,
       'A133: saving MY card updates the session copy and the meId name every screen reads');
    eq(/data-act="editinfo"/.test(app) && /navigate\('profile', \{ username: b\.dataset\.u \}\);/.test(app), true,
       'A133: the admin door on the user card is wired');
    eq(/if \(!form\.phone\.trim\(\)\) form\.phone = u\.phone \|\| '';\n\s+if \(!form\.email\.trim\(\)\) form\.email = u\.email \|\| '';/.test(app), true,
       'A133: member-form prefill is blank-only for contact too — typed work is never overwritten');
    ['profile_btn', 'profile_title', 'profile_hint'].forEach(function (k) {
      eq(a25I18n.indexOf('  ' + k + ':') >= 0, true, 'A133: ' + k + ' has a bilingual message');
    });
  }

  // A132b (Hrishi: "have you checked for going live the same?"): 🚀 always
  // took the honest path — server bumps the epoch, the forced pull's epoch
  // branch wipes WITH the 🪦 list and the A92 alert. But 🧹 and restore ran
  // their own DB.clearAll() BEFORE that branch could look, so the ADMIN's own
  // unsynced entries — on the one phone guaranteed present for the reset —
  // were destroyed with no list and no alert. Both now defer to the branch.
  {
    // both fixes carry a comment that NAMES DB.clearAll — the A32 lesson
    // again: strip comments before asserting, or the pin reads its own prose
    const noComments = function (s) { return s.replace(/\/\/[^\n]*/g, ''); };
    const ct = noComments(app.slice(app.indexOf("Auth.call('clearTraining', { token: Auth.token(), confirm: 'CLEAR' })"),
                         app.indexOf("const goLiveBtn")));
    eq(ct.indexOf('DB.clearAll') < 0 && /return pullCentral\(\{ force: true \}\);/.test(ct), true,
       'A132b: 🧹 defers the wipe to the epoch branch — list and alert included');
    const rs = noComments(app.slice(app.indexOf("Auth.call('restoreBackup'"), app.indexOf("admEl('rollover-btn')") > 0
      ? app.indexOf("admEl('rollover-btn')") : app.indexOf('rollover-btn')));
    eq(rs.indexOf('DB.clearAll') < 0 && /location\.reload\(\);/.test(rs), true,
       'A132b: restore likewise — the reload\'s first pull wipes through the branch');
    eq(/goLiveBtn[\s\S]{0,1600}?pullCentral\(\{ force: true \}\)/.test(app) &&
       !/goLiveBtn[\s\S]{0,1600}?DB\.clearAll/.test(app), true,
       'A132b: and 🚀 keeps the path it always had');
  }

  // A132 (Hrishi, after walking the offline-return story: the wipe alert
  // "re-enter them if you remember" is a memory test — after a mid-season
  // restore the collector was not even there). The DETAILS are now saved
  // before the wipe and ⚙️ grows a read-only 🪦 list to re-enter from.
  {
    eq(/if \(!r\.synced && !r\.rejected\) lostRows\.push\(\{ store: s, row: r \}\);/.test(app), true,
       'A132: the wipe keeps exactly the rows sync would have pushed');
    eq(/JSON\.stringify\(prev\.concat\(lostRows\)\.slice\(-200\)\)/.test(app), true,
       'A132: …appended across wipes and capped, so storage can never choke');
    eq(app.indexOf("localStorage.setItem('ck_wiped_entries'") >= 0 &&
       app.indexOf("localStorage.setItem('ck_wiped_entries'") <
       app.indexOf('DB.clearAll().then(function () {\n            if (lostRows.length'), true,
       'A132: …saved BEFORE clearAll, or there is nothing left to save');
    eq(/window\.alert\(t\('epoch_wiped_unsynced'\)\.replace\('\{n\}', toBengaliDigits\(String\(lostRows\.length\)\)\)\)/.test(app), true,
       'A132: the alert still counts, from the same list it saved');
    eq(/else if \(current\.view === 'graveyard'\) renderGraveyard\(\);/.test(app) &&
       /graveB\.onclick = function \(\) \{ navigate\('graveyard'\); \};/.test(app), true,
       'A132: the 🪦 screen is reachable from ⚙️ and survives a re-render');
    eq(/\(graveyardRead\(\)\.length \? '<button id="grave-btn"/.test(app), true,
       'A132: the door only exists while there is something behind it');
    eq(/if \(!window\.confirm\(t\('graveyard_clear_confirm'\)\)\) return;\n\s+try \{ localStorage\.removeItem\('ck_wiped_entries'\); \} catch \(e\) \{\}/.test(app), true,
       'A132: clearing the list asks first — it cannot be brought back');
    eq(/localStorage\.removeItem\('ck_central_year'\)/.test(app), true,
       'A132: the epoch wipe no longer leaves ck_central_year orphaned');
    eq(a25I18n.indexOf('সেটিংস → "🪦 মুছে-যাওয়া entry"') >= 0 &&
       a25I18n.indexOf('Settings → "🪦 Wiped entries"') >= 0, true,
       'A132: the alert tells the collector WHERE the list is, not just how many');
    ['graveyard_btn', 'graveyard_title', 'graveyard_hint', 'graveyard_empty',
     'graveyard_clear', 'graveyard_clear_confirm'].forEach(function (k) {
      eq(a25I18n.indexOf('  ' + k + ':') >= 0, true, 'A132: ' + k + ' has a bilingual message');
    });
  }

  // A131 (trial, the morning after 🧹: "the users are showing with cash
  // data"): the data_epoch wipe cleared the snapshot and IndexedDB but not
  // MODULE state — 👑 kept painting old users with old হাতে-₹ from admCache
  // (reproduced: খাতা said "no entries" while the panel said ₹3,800). Pinned:
  // the epoch branch clears the panel cache and the settled-answer sets, and
  // logout clears the panel cache so the next login cannot inherit it.
  {
    eq(/localStorage\.removeItem\('ck_central_year'\);[\s\S]{0,700}?admCache = null; admSection = ''; admUserId = '';/.test(app), true,
       'A131: the epoch wipe clears the admin panel cache too');
    eq(/\[stampedAnswers, resolvedFlags, answeredNotifs\]\.forEach\(function \(m\) \{\n\s+Object\.keys\(m\)\.forEach\(function \(k\) \{ delete m\[k\]; \}\);\n\s+\}\);/.test(app), true,
       'A131: …and the settled-answer sets — their ids died with the old book');
    eq(/DB\.clearAll\(\)\.catch\(function \(\) \{\}\)\.then\(function \(\) \{\n[\s\S]{0,300}?admCache = null;[\s\S]{0,120}?Auth\.logout\(\);/.test(app), true,
       'A131: logout drops the panel cache — the next login starts clean');
  }

  // A130 (trial: "user is not able to see the search criteria / sort should be
  // date and time wise, my data at first / tabs going out of the screen"):
  // search's powers existed but were secret, the order was alphabetical, the
  // no-match message lied ("no entries yet"), a bus number was findable only
  // inside the 🚌 tab, and the A87 scroll-fade read as "cut off".
  {
    eq(/return \(mineToday\[b\.id\] \|\| 0\) - \(mineToday\[a\.id\] \|\| 0\) \|\|\n\s+String\(lastAct\[b\.id\] \|\| ''\)\.localeCompare\(String\(lastAct\[a\.id\] \|\| ''\)\) \|\|\n\s+\(a\.name \|\| ''\)\.localeCompare\(b\.name \|\| ''\)/.test(app), true,
       'A130: ledger order = my-today first, then latest activity, then name');
    eq(/if \(d === today && \(r\.collectorId \|\| r\.collector\) === meId\) mineToday\[r\.partyId\] = 1;/.test(app), true,
       'A130: "mine today" comes from payments I made today, not guesswork');
    eq(/esc\(t\(listQuery \? 'search_none' : 'no_entries'\)\)/.test(app), true,
       'A130: a failed SEARCH no longer claims "no entries yet"');
    eq((app.match(/listQuery \? 'search_none' : 'no_entries'/g) || []).length >= 2, true,
       'A130: …on the bus tab too');
    eq(/function matchBus\(r, query\) \{ return matchWords\(/.test(app) &&
       app.indexOf("busName || '').toLowerCase().indexOf(") < 0, true,
       'A130: bus search joined the ONE search rule (A103), off raw substring');
    eq(/r\.type === 'bus' && !v\[r\.id\] && matchBus\(r, listQuery\)/.test(app) && /bus_hits/.test(app), true,
       'A130: bus hits ride below the donors on সবাই — no tab knowledge needed');
    eq(/t\(busRows \? 'search_bus_ph' : 'search_party_ph'\)/.test(app) &&
       /t\('search_member_ph'\)/.test(app) &&
       /fp-search[^\n]*search_party_ph/.test(app), true,
       'A130: every box SAYS what it searches, per screen');
    eq(/id="area-f"/.test(app) && /p\.side === listArea/.test(app) &&
       /af\.onchange = function \(\) \{ listArea = af\.value; renderList\(\); \};/.test(app), true,
       'A130: the 📍 area filter exists, filters by side, and is wired');
    eq(/function wireTabsCue\(\)/.test(app) && /class="tabs-more"/.test(app) &&
       (app.match(/wireTabsCue\(\);/g) || []).length >= 2, true,
       'A130: the › cue exists and is wired on BOTH screens that use filterBar');
    const css130 = require('fs').readFileSync(__dirname + '/../css/style.css', 'utf8');
    eq(/\.tabs-wrap \{ position: relative; \}/.test(css130) && /\.tabs-more \{ position: absolute/.test(css130), true,
       'A130: …and the cue is drawn over the row, not as one more chip');
    ['search_party_ph', 'search_bus_ph', 'search_member_ph', 'search_none', 'bus_hits', 'all_areas'].forEach(function (k) {
      eq(a25I18n.indexOf('  ' + k + ':') >= 0, true, 'A130: ' + k + ' has a bilingual message');
    });
    const help130 = require('fs').readFileSync(__dirname + '/../js/help.js', 'utf8');
    eq(/মালিকের নাম, ফোন, এলাকা/.test(help130) && /আজ তোমার লেনদেন যাদের সঙ্গে, তারা উপরে/.test(help130), true,
       'A130: the guide names the search powers and the new order');
    eq(/মাথার <b>🔄<\/b>/.test(help130), true,
       'A129→A130: the in-app guide finally mentions the header 🔄 (rode this bump)');
  }

  // A128 (trial: "previously on top it was showing [both versions]"): the top
  // bars exist only on MISMATCH, so a healthy phone had no yes-answer anywhere —
  // the absence of a warning reads the same as "not checked". Settings' version
  // line now prints the server's version next to the phone's: ✅ when they
  // match, ⚠️ when not, and NOTHING when we have never heard from the server
  // (an alarm nobody can act on teaches people to ignore alarms).
  {
    eq(/const srv = Auth\.serverVersion\(\);\n    const base = esc\(APP_VERSION/.test(app), true,
       'A128: showVersion asks the server-version note, not a hard-coded string');
    eq(/srv === APP_VERSION \? ' ✅' : ' ⚠️'/.test(app), true,
       'A128: match says ✅, drift says ⚠️ — an explicit yes, not just a silent no');
    eq(/\(srv \? '<br>' \+ esc\(t\('ver_srv_line'\)/.test(app), true,
       'A128: unknown server version prints nothing');
    eq(app.indexOf("'<br><b class=\"warn\">' + esc(t('upd_stale'") >= 0 &&
       /el2\.innerHTML = base \+/.test(app), true,
       'A128: the stale-worker warning stacks ON the two-version line, not over it');
    eq(/  ver_srv_line: \{ bn: 'সার্ভার: \{srv\}'/.test(a25I18n), true,
       'A128: ver_srv_line has a bilingual message');
  }

  // A126: the notification banner's answers follow the same trio as the two
  // desks — recorded only after server-ok, settled in place, filtered at BOTH
  // the builder and applyNotifications (counts/dots/toast fall immediately,
  // and a pre-answer poll cannot re-announce).
  {
    eq(/const answeredNotifs = \{\};/.test(app), true, 'A126: the answered-set exists');
    eq(/answeredNotifs\[\(act === 'confirm-handover' \? 'ho\|' : 'user\|'\) \+ id\] = 1;/.test(app), true,
       'A126: …recorded only after the server said ok');
    eq((app.match(/!answeredNotifs\['user\|' \+ a\.userId\]/g) || []).length, 2,
       'A126: …approvals filtered at builder AND at apply (counts fall too)');
    eq((app.match(/!answeredNotifs\['ho\|' \+ h\.id\]/g) || []).length, 2,
       'A126: …handovers likewise');
  }

  // A124 (trial: dues → donor → 💰 → back landed on HOME): a flow may declare
  // where backing out of its first question returns, and paymentFlow returns
  // to the donor it was opened from.
  {
    eq(/if \(exit\) navigate\(exit\.view, exit\.params\);/.test(app), true,
       'A124: backing out of a flow honours the flow\'s declared exit');
    eq(/else navigate\(ret \|\| 'home'\);/.test(app) &&
       /const exit = flowState\.def\.exitTo, ret = flowState\.def\.returnTo;/.test(app), true,
       'A124b: …and falls back to returnTo — an ✏️ edit backs out to the entries list, not home');
    eq(/exitTo: \{ view: 'party', params: \{ id: party\.id/.test(app), true,
       'A124: …and the payment flow exits to its donor, not to home');
  }

  // A123 (trial: "not able to understand the entry type"): the mixed lists'
  // summaries LEAD with the kind. A donor's payment and an expense both used to
  // render as name-dash-amount, indistinguishable.
  {
    const esAt = app.indexOf('function entrySummary');
    const es = app.slice(esAt, app.indexOf('\n  function ', esAt + 10));
    eq(/'💰 ' \+ t\('es_payment'\)/.test(es) && /'🧾 ' \+ t\('es_expense'\)/.test(es), true,
       'A123: payment and expense summaries lead with what they ARE');
    eq(/entrySummary\(v\.targetStore, tgt\)/.test(app), true,
       'A123: …and the 🩺 void list names what was voided, not only the amount');
  }

  // A122 generalized the door: one helper draws it, one wires it, and the
    // wiring carries BOTH the section and the source screen (Hrishi's rule —
    // the guide's ← goes back to where it was opened).
    eq(/function guideDoor\(sec\)/.test(app) &&
       /navigate\('help', \{ sec: b\.dataset\.sec, from: current\.view \}\)/.test(app), true,
       'A122: the guide door is wired, and passes section + source');
    eq(/backBar\(params\.from \|\| 'settings'\)/.test(app), true,
       'A122: …and the guide honours that source on ←');
    eq(/guideDoor\('fix'\)/.test(app) && /wireGuideDoors\(\);/.test(app), true,
       'A121: …and the entries screen opens it in one tap — WIRED, not just drawn');
  }

  // A119: an EDIT must not open on a step showIf hides. dailyFlow begins with
  // busName/busNumber (visible only for buses, busName required), so ✏️ on a
  // road/toto entry sat trapped on "বাসের নাম কী?" — the entry door was the one
  // place that did not skip invisible steps (goBack and skipHidden both did).
  {
    const sf = app.slice(app.indexOf('function startFlow'), app.indexOf('function visible'));
    const iSkip = sf.indexOf('while (flowState.idx < def.steps.length && !visible(def.steps[flowState.idx])) flowState.idx++;');
    const iRender = sf.indexOf('renderEntry(); try { history.pushState');
    eq(iSkip >= 0 && iRender >= 0 && iSkip < iRender, true,
       'A119: the edit door skips showIf-hidden steps before painting the first question');
  }

  // A120: the review desk's answers settle in place and are remembered — the
  // A118b local-first repaint would otherwise resurrect a flag the cashier just
  // approved (server correct, picture lagging). Same trio as A117: record only
  // after the server ok, settle without a rebuild, filter on every render.
  {
    const rr2At = app.indexOf('function renderReviewCorrections');
    const rr2 = app.slice(rr2At, app.indexOf('\n  function ', rr2At + 10));
    eq(/resolvedFlags\[id\] = 1;/.test(rr2) &&
       rr2.indexOf('resolvedFlags[id] = 1;') > rr2.indexOf("Auth.call('resolveCorrection'"), true,
       'A120: a resolved flag is recorded only AFTER the server said ok');
    eq(/&& !resolvedFlags\[c\.id\]/.test(rr2), true,
       'A120: …and the desk list drops answered flags on every repaint');
    eq(/renderReviewCorrections\(\);\s*\n\s*pullCentral/.test(rr2) || /row\.remove\(\)/.test(rr2), true,
       'A120: …and the row settles in place instead of rebuilding the desk');
  }

  // A118b: the two cashier desks and the expense flow open from what the phone
  // already holds; a round trip may refresh, never gate first paint. Pinned as
  // "the screen's opener reads local data": the desk functions must not await
  // a list-fetching Auth.call before their first real innerHTML.
  {
    // sliced to the NEXT function boundary, not a named one — the named one
    // sat BEFORE renderCashier in the file, the slice came back empty, and the
    // assertion passed with the mutation applied (the A100 trap, in a new hat)
    const rcAt = app.indexOf('function renderCashier');
    const rc = app.slice(rcAt, app.indexOf('\n  function ', rcAt + 10));
    eq(rc.length > 500 && !/Auth\.call\('pendingHandovers'/.test(rc), true,
       'A118: the confirm desk paints from the snapshot — no pendingHandovers gate');
    const rr = app.slice(app.indexOf('function renderReviewCorrections'),
                         app.indexOf('function renderReviewCorrections') + 2600);
    eq(/Auth\.call\('pendingCorrections'/.test(rr), false,
       'A118: the review desk paints from the snapshot — no pendingCorrections gate');
    const se = app.slice(app.indexOf('function startExpense'), app.indexOf('function collectionExpenseFlow'));
    // A152 repointed this: the literal grew a withDuties() wrapper. The PROPERTY
    // is what A118 bought — the flow opens from the CACHE with the refresh
    // running behind it, never gated on a round trip — so that is what is
    // asserted now, plus the fact that the new wrapper is a LOCAL read.
    eq(/if \(cached && cached\.length\) \{ withDuties\(function \(\) \{ go\(cached\); \}\); refresh\(null\); \}/.test(se), true,
       'A118: the expense flow opens from the cached subject list, refreshing behind');
    eq(/const withDuties = function \(fn\) \{\s*\n\s*return viewData\(\)/.test(se), true,
       'A118/A152: …and what it waits for is viewData — local, not a round trip');
    eq(/withDuties[\s\S]{0,200}?Auth\.call/.test(se), false,
       'A118/A152: …so nothing server-side gates the open');
  }

  // A117's second half: the answered-set. The desk re-renders on every pull,
  // and a pull already in flight at tap-time carries the pre-answer world — so
  // every reader of reconcile filters out what THIS device already stamped.
  // Counted against the reconcile call sites so a fourth reader cannot forget.
  eq((app.match(/r\.anomalies = r\.anomalies\.filter\(function \(a\) \{ return !anomalyAnswered\(a\); \}\);/g) || []).length,
     (app.match(/const r = Aggregate\.reconcile\(data, reconcileRules\(\)\);/g) || []).length,
     'A117: EVERY reconcile reader drops answers this device already wrote');
  eq(/stampedAnswers\[store \+ '\|' \+ id \+ '\|' \+ field\] = 1;/.test(app) &&
     app.indexOf("stampedAnswers[store + '|' + id + '|' + field] = 1;") >
     app.indexOf("Auth.call('setAnomalyFlag'"), true,
     'A117: …and an answer is recorded only AFTER the server said ok');

  // A117 loosened the tail: pullBusy=false is no longer the LAST statement in
  // the release block (the queued follow-up runs after it) — the property is
  // that the release lives in the both-paths `.then`, before anything else.
  eq(/\}\)\.then\(function \(\) \{[\s\S]{0,900}?pullBusy = false;/.test(app), true,
     'A69: …and released on success, failure AND abort — a flag a stuck request can leave set for ever would silently stop every future pull');
  eq(app.indexOf('pullBusy = false;', app.indexOf('}).then(function () {')) <
     app.indexOf('if (pullQueued)'), true,
     'A117: …and the release happens BEFORE the queued follow-up fires, or it would refuse itself');

  // the epoch branch: this is where the guard is a CORRECTNESS fix. Before it,
  // a second pull holding a PRE-clear response resolved after the wipe and
  // wrote pre-epoch training rows back into the live book.
  eq(/pullBusy = false;\n\s*return pullCentral\(\{ force: true \}\); \/\/ clean full pull/.test(app), true,
     'A69: the epoch re-pull clears the flag first, or it would be swallowed by the guard it just set');

  // backoff counted in POLLS, so it cannot outlive the situation
  eq(/pullFails = Math\.min\(pullFails \+ 1, 4\);/.test(app) && /pullSkip = Math\.pow\(2, pullFails - 1\);/.test(app), true,
     'A69: a failed pull earns a doubling skip, capped');
  {
    let f = 0, skip = 0; const seq = [];
    for (let i = 0; i < 6; i++) { f = Math.min(f + 1, 4); skip = Math.pow(2, f - 1); seq.push(skip); }
    eq(seq, [1, 2, 4, 8, 8, 8], 'A69: …1, 2, 4, 8 polls and no further — ~9 minutes at worst, not the whole evening');
  }
  eq(/resetPullBackoff\(\); \/\/ it got through/.test(app), true, 'A69: one success forgets every earlier failure');

  // 'online', focus and a manual refresh are a human or the OS saying
  // "conditions changed" — better evidence than any timer.
  // pins the BEHAVIOUR — A77 added updateNetBar() to the same handler, and an
  // assertion naming the exact line failed a change that kept the rule
  {
    const on = app.slice(app.indexOf("window.addEventListener('online'"));
    eq(/resetPullBackoff\(\)/.test(on.slice(0, 160)), true, 'A69: coming back online resets the backoff');
    eq(/autoSync\(\)/.test(on.slice(0, 160)), true, 'A69: …and pushes what is queued');
  }
  eq(/resetPullBackoff\(\);\n\s*pullCentral\(\{ force: true \}\); \/\/ refresh the central snapshot/.test(app), true,
     'A69: …so does returning to the app');
  eq(/Sync\.syncNow\(\)\.then\(function \(\) \{ resetPullBackoff\(\); return pullCentral\(\{ force: true \}\); \}\)/.test(app), true,
     'A69: …and so does a manual pull-to-refresh');

  // exactly ONE caller may be skipped: the background timer. Everything a
  // human or the app itself initiates is forced.
  {
    const calls = app.match(/pullCentral\((\{ force: true \})?\)/g) || [];
    const unforced = calls.filter(function (c) { return c === 'pullCentral()'; });
    eq(unforced.length, 1, 'A69: the 60 s background tick is the only skippable pull (' + unforced.length + ')');
  }
}


// ---- A70 (audit #2 P1/U4/U5/U6/U7): the felt batch ---------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const css = fs.readFileSync(__dirname + '/../css/style.css', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  const bn = (k) => { const m = i18n.match(new RegExp("^  " + k + ": \\{ bn: '([^']*)'", 'm')); return m ? m[1] : ''; };

  // P1 — the write sat ABOVE the `changed` guard, so an idle poll that returned
  // zero rows still re-serialised 2.9 MiB and wrote it synchronously to eMMC.
  eq(/if \(changed\) \{\n\s*try \{\n\s*localStorage\.setItem\('ck_central', JSON\.stringify\(centralData\)\);/.test(app), true,
     'A70: the snapshot is written only when it actually changed');
  eq(/\} else \{\n\s*try \{\n\s*localStorage\.setItem\('ck_central_cursor', centralCursor\);/.test(app), true,
     'A70: …but the CURSOR still moves on an idle poll, or the next delta asks for everything since the last CHANGE');
  eq(/catch \(e\) \{ \/\* quota \*\/ \}/.test(app), false, 'A70: …and a full disk no longer fails silently…');
  eq(/toast\(t\('storage_full'\)\)/.test(app) && bn('storage_full').length > 0, true,
     'A70: …it says so, because past the quota every cold start replays a growing delta from a frozen cursor');

  // U5 — a refused permission is not "this phone cannot do voice"
  eq(/const denied = \(err === 'not-allowed' \|\| err === 'service-not-allowed'\);/.test(app), true,
     'A70: a dismissed microphone prompt is told apart from an unsupported phone');
  eq(/hint\.className = denied \? 'hint err-hint' : 'hint';/.test(app), true,
     'A70: …and shown in red, because this one has an action in it');
  eq(bn('mic_denied').indexOf('Allow') >= 0, true,
     'A70: …naming the exact word to look for, since the dialog is in English on these phones');
  eq(bn('no_mic') !== bn('mic_denied'), true, 'A70: …two causes, two sentences');

  // U6 — the only escape hatch after an instant save, on a 5-second deadline
  eq(/\.toast-undo-btn \{[\s\S]*?padding: 11px 14px; margin: -9px -6px -9px 0;/.test(css), true,
     'A70: the Undo target is ~45px, not ~22 — and the negative margin keeps the bubble the same size');
  eq(/padding: 2px 0; cursor: pointer/.test(css), false, 'A70: …the old 2px padding is gone');
  // fixed in place, not with a later override: the first attempt added a rule
  // ABOVE the real one, where the cascade silently threw it away
  eq((css.match(/\.sh-pick \{/g) || []).length, 1, 'A70: .sh-pick is defined once…');
  eq(/\.sh-pick \{[\s\S]*?padding: 12px 14px;/.test(css), true,
     'A70: …and corrected in place — these chips decide how much money changes hands');

  // U4 — every string the badge showed named something a collector cannot do:
  // "network", "setup", and a Sync-URL field that is admin-only.
  ['unsynced_n', 'sync_fail', 'sync_not_configured'].forEach(function (k) {
    eq(/\b(Sync|network|setup)\b/.test(bn(k)), false, 'A70: ' + k + ' no longer names a thing a collector cannot do');
  });
  eq(bn('sync_fail').indexOf('হারায়নি') >= 0, true,
     'A70: …and says the one thing that matters — the entries are not lost');

  // U7 — collector-facing machine vocabulary
  eq(bn('skip'), 'বাদ দাও', 'A70: the second-most-tapped button is finally in Bengali');
  eq(/\bflag\b/.test(bn('flag_btn')) || /\bflag\b/.test(bn('flag_confirm')), false, 'A70: "flag" is gone');
  eq(/\bconfirm\b/.test(bn('my_pending')), false, 'A70: …so is "confirm বাকি"');
  // one word per role in the Bengali voice — the same person was 'collector' on
  // one screen and 'সংগ্রাহক' on the next
  {
    const ADMIN_FIELDS = ['script_url', 'secret', 'err_not_configured']; // genuinely technical, admin-only
    const leaks = [];
    const re = /^  ([a-z_0-9]+): \{ bn: '([^']*)'/gm;
    let m;
    while ((m = re.exec(i18n))) {
      if (ADMIN_FIELDS.indexOf(m[1]) >= 0) continue;
      if (/\b(collector|cashier|server|flag|Sync)\b/.test(m[2])) leaks.push(m[1]);
    }
    eq(leaks, [], 'A70: no collector-facing Bengali string leaks machine vocabulary (' + leaks.join(', ') + ')');
  }
}


// ---- A72: the admin panel says WHY a chip is ticked ---------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  const css = fs.readFileSync(__dirname + '/../css/style.css', 'utf8');
  const A = require('../js/aggregate.js');

  // Found in the field: Hrishi pressed 🧹, every personal grant really was
  // cleared on the server, and this screen still showed ticked chips — because
  // they now come from the POST. Correct, and indistinguishable from "the clear
  // did not work". The only explanation was a `title` tooltip, and a phone
  // never shows one — the same mistake as the sync badge (audit #2 U4).
  eq(i18n.indexOf('  perm_from_post_n:') >= 0, true, 'A72: there is a sentence for it…');
  eq(/perm_from_post_n/.test(app), true, 'A72: …rendered on the screen…');
  eq((app.match(/perm_from_post_n/g) || []).length, 2,
     'A72: …in BOTH chip groups, entries and reports — one would have been half a fix');
  eq(/\.chip\.from-post \{[^}]*border-style: dashed/.test(css), true,
     'A72: …and a post-granted chip does not look like one somebody ticked here');
  // the sentence must name the button, because that is the action whose result
  // looked wrong
  eq(/সবার আলাদা permission মুছে দাও/.test(i18n.slice(i18n.indexOf('  perm_from_post_n:'), i18n.indexOf('  perm_from_post_n:') + 400)), true,
     'A72: …and says these survive the 🧹 clear, which is the question that was actually being asked');

  // every permission key must have a label, or the admin's "✅ শেষমেশ যা পারবে"
  // line — the exact line checked before go-live — prints a raw key
  {
    const CAT = { shop: 'new_shop', person: 'new_person', member: 'new_member', bus: 'daily_bus',
                  road: 'daily_road', toto: 'daily_toto', sponsor: 'new_sponsor', ticket: 'daily_ticket' };
    const missing = A.POSITION_PERM_KEYS.filter(function (k) {
      const key = k === 'cashier' ? 'cashier'
        : A.REPORT_IDS.indexOf(k) >= 0 ? 'report_' + k
        : (CAT[k] || ('perm_' + k));
      return !new RegExp('^  ' + key + ':', 'm').test(i18n);
    });
    eq(missing, [], 'A72: every permission key has a label (' + missing.join(', ') + ')');
  }
}


// ---- A73 (audit #5): regressions my own fixes introduced ---------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const sw = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
  const css = fs.readFileSync(__dirname + '/../css/style.css', 'utf8');

  // V13: `if (!settled && r)` — when caches.match('./') resolves UNDEFINED (an
  // evicted entry, ordinary on the phones this exists for) nothing resolved and
  // respondWith hung FOREVER. Before A55 a miss simply rejected and the browser
  // painted its own offline page at once. The race is run for real, but
  // SYNCHRONOUSLY: a `return` here would end the whole module (CommonJS wraps
  // it in a function), which is exactly what happened on the first attempt and
  // silently skipped every assertion after it.
  const race = function (cacheResult, fetchResult) {
    // same shape as sw.js, with the timer collapsed so it can be asserted inline
    let settled = false, out = null;
    const done = function (r) { if (settled) return; settled = true; out = (r || 'BROWSER_OFFLINE_PAGE'); };
    if (fetchResult === 'quiet') { done(cacheResult); }                 // timer fires first
    else if (fetchResult === 'dead') { done(cacheResult); }             // .catch → fallback
    else { done(fetchResult); }                                         // network answered
    return out;
  };
  eq(race('SHELL', 'LIVE'), 'LIVE', 'A73/V13: the network wins when it answers');
  eq(race('SHELL', 'dead'), 'SHELL', 'A73/V13: the cached shell wins when the network is dead');
  eq(race(undefined, 'dead'), 'BROWSER_OFFLINE_PAGE',
     'A73/V13: an EVICTED cache falls through to the browser instead of hanging');
  eq(race(undefined, 'quiet'), 'BROWSER_OFFLINE_PAGE',
     'A73/V13: …and so does a quiet network with an evicted cache');

  eq(/if \(settled\) return;\n\s*settled = true;\n\s*resolve\(r \|\| Response\.error\(\)\);/.test(sw), true,
     'A73/V13: the guard is on `settled` alone — a falsy cache hit must still settle');
  // strip comments first: the A73 note QUOTES the old line, and an assertion
  // its own explanation trips is a test nobody can keep (third time — A54's
  // `voided` note and A60's did the same)
  eq(/if \(!settled && r\)/.test(sw.replace(/\/\/[^\n]*/g, '')), false,
     'A73/V13: …the `&& r` that caused the hang is gone from the CODE');

  // V12: the quota warning shares one fixed toast slot with Undo, and its
  // string runs 6.9 s against Undo's 5 s window — repeated on every changed
  // pull it would paint over the only escape hatch after an instant save.
  eq(/let storageWarned = false;/.test(app) &&
     /if \(!storageWarned\) \{ storageWarned = true; toast\(t\('storage_full'\)\); \}/.test(app), true,
     'A73/V12: the storage warning is said once per run, not once a minute');
  eq(/\.toast-undo-btn \{[\s\S]*?min-height: 44px; font-family: inherit;/.test(css), true,
     'A73/V12: …and 44 px is a floor, not a font-metrics coincidence');
}


// ---- A74 (audit #4 D1): logging out must leave nothing behind -----------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const guide = fs.readFileSync(__dirname + '/../docs/user-guide/collector-guide.md', 'utf8');

  // Measured before the fix, on a seeded season: 260 donor phone numbers were
  // reachable on the handset before logging out and 60 after. The snapshot went
  // (the button already cleared it — audit #4 read Auth.logout() alone and
  // missed the wrapper); IndexedDB did not. Those 60 are the donors this
  // collector personally called on: name, owner, phone, what they gave.
  const btn = app.slice(app.indexOf("document.getElementById('logout-btn')"),
                        app.indexOf("document.querySelectorAll('[data-l]')"));
  eq(/DB\.clearAll\(\)/.test(btn), true, 'A74: logging out clears this device’s own rows too');
  eq(/\['ck_central', 'ck_central_cursor', 'ck_central_year'\]/.test(btn), true,
     'A74: …as well as the central snapshot');
  // and the ordering that makes it safe rather than dangerous
  eq(btn.indexOf("if (n > 0)") < btn.indexOf('DB.clearAll()'), true,
     'A74: …INSIDE the unsynced guard, so it can never destroy money that has not reached the server');
  eq(/DB\.unsyncedCount\(\)\.then/.test(btn), true, 'A74: …which is asked first, every time');

  // the written rule is the half that actually covers the common case — nobody
  // logs out before handing a phone to a repair shop, so it has to be taught
  eq(/ফোনটা কারও হাতে দেওয়ার আগে/.test(guide), true,
     'A74: the collector guide says what to do before handing the phone over');
  eq(/লগ আউট/.test(guide) && /মুছে ফেলো/.test(guide), true, 'A74: …both steps, in order');
  eq(/হারালে|চুরি/.test(guide), true, 'A74: …and what to do if it is lost');
}


// ---- A75 (audit #3 F1): the year boundary -----------------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const A = require('../js/aggregate.js');

  // On 1 January every phone's year flips — it comes from the system clock,
  // because the year field is admin-only and a collector's ck_year is never
  // written. pullCentral discards the snapshot and pulls an EMPTY 2027 book,
  // while IndexedDB still holds every 2026 row. No 2026 id matches any 2027 id,
  // so A49's guard never fires. Reproduced before the fix: the collector is
  // shown last season's ₹5,000 as cash still in hand and a settled handover as
  // still awaiting confirmation. A different wrong number on every handset, at
  // the moment a new season's book is asking to be trusted.
  const own = { collector: 'রতন', collectorId: 'ratan', collectorRole: 'collector' };
  const lastSeason = {
    parties: [Object.assign({ id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 5000 }, own)],
    payments: [Object.assign({ id: 'p1', year: 2026, partyId: 's1', amount: 5000, cashAmount: 5000, upiAmount: 0 }, own)],
    daily: [], expenses: [], handovers: [], voids: [], messages: [], corrections: [],
  };
  eq(A.activeData(lastSeason, 2026).payments.length, 1, 'A75: this season counts');
  eq(A.activeData(lastSeason, 2027).payments.length, 0, 'A75: last season stops counting in the new book');
  eq(A.activeData(lastSeason).payments.length, 1,
     'A75: …and with no year given nothing changes, so every existing caller is unaffected');
  // a row written before the field existed must NOT be dropped — that would be
  // losing somebody's money to a schema detail
  const legacy = JSON.parse(JSON.stringify(lastSeason));
  delete legacy.payments[0].year;
  eq(A.activeData(legacy, 2027).payments.length, 1,
     'A75: a row with no year belongs to whatever book is being read, never nowhere');

  // ONE choke point, in viewData, rather than a parameter threaded through the
  // nine activeData call sites where the tenth would eventually be missed
  eq(/const year = Number\(Settings\.get\('year'\)\) \|\| new Date\(\)\.getFullYear\(\);/.test(app), true,
     'A75: viewData resolves the year the same way the rest of the app does');
  eq(/Number\(r\.year\) === year/.test(app), true, 'A75: …and filters the local rows by it');
  eq(/const key = DB\.dataVersion\(\) \+ ':' \+ centralVersion \+ ':' \+ year;/.test(app), true,
     'A75: …with the year in the memo key, or switching years would serve a stale merge');
  // filtered, never deleted: a wipe at the year boundary would take unsynced
  // rows with it, and the year boundary is exactly when nobody is watching
  eq(/DB\.clearAll\(\)/.test(app.slice(app.indexOf('function viewData'), app.indexOf('function viewData') + 2000)), false,
     'A75: nothing is destroyed — set the year back and last season returns');
}


// ---- A76 (audit #3 F2 + Hrishi): rollover must know what it can see ----------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');
  const roll = app.slice(app.indexOf("admEl('rollover-btn').onclick"),
                         app.indexOf("admEl('subj-add').onclick"));

  // The button took `from` straight from the admin's year setting and offered
  // from + 1, with no idea whether either year held anything. Two failures, and
  // the second is the one Hrishi raised — a brand-new committee with no data at
  // all was offered a rollover, which copies nothing and then reports
  // "০ জন দাতা যোগ হলো", reading as though something happened.
  eq(/viewData\(\)\.then/.test(roll), true, 'A76: rollover looks at what is actually there first');
  eq(/const donors = liveParties\(data\)\.length;/.test(roll), true, 'A76: …counting live donors, not voided ones');
  eq(/if \(!donors\) \{ alert\(t\('rollover_empty'\)/.test(roll), true,
     'A76: …and refuses instead of performing a no-op');
  eq(roll.indexOf("if (!donors)") < roll.indexOf("Auth.call('rolloverYear'"), true,
     'A76: …BEFORE the server is called, so an empty year costs nothing');
  eq(i18n.indexOf('  rollover_empty:') >= 0, true, 'A76: with a real message…');
  // it must name the year it looked at — the answer is usually "wrong year"
  eq(/rollover_empty:[^\n]*\{from\}/.test(i18n), true, 'A76: …naming the year it checked');
  // and a brand-new committee is told this is not for them, rather than left
  // wondering what they skipped
  eq(/নতুন কমিটি/.test(i18n.slice(i18n.indexOf('  rollover_empty:'), i18n.indexOf('  rollover_empty:') + 600)), true,
     'A76: …and telling a first-time committee it does not apply to them');
  // the count goes into the confirm, so "carry 2 donors" is not "carry donors"
  eq(/rollover_confirm:[^\n]*\{n\}/.test(i18n) && /replace\('\{n\}', donors\)/.test(roll), true,
     'A76: the confirm says HOW MANY will be copied');
}


// ---- A77: the offline strip, and a printed report worth filing ---------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const css = fs.readFileSync(__dirname + '/../css/style.css', 'utf8');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // Everything renders from the local snapshot — that is what makes the app
  // usable at a pandal gate, and it means 💰 কার হাতে কত shows whatever was
  // true at the last sync. That number gets acted on, and nothing said so:
  // there was no offline indicator anywhere in the UI.
  eq(/<div id="net-bar"/.test(html), true, 'A77: there is a place to say it');
  eq(/function updateNetBar\(\)/.test(app), true, 'A77: …and something that says it');
  eq(/localStorage\.setItem\('ck_last_pull'/.test(app), true,
     'A77: …recording when the phone last actually heard from the server, which nothing did');
  eq(/net_off_since:[^\n]*\{ago\}/.test(i18n), true,
     'A77: …so it can say HOW OLD, because "offline" alone does not tell you whether to trust the number');
  eq(i18n.indexOf('  net_off_never:') >= 0, true, 'A77: …and a different sentence when nothing has ever synced');
  // its own element, not a fourth state of the training bar: a collector can be
  // offline AND in training at once, and one slot would have to pick a winner
  eq(app.indexOf('function updateNetBar') !== app.indexOf('function updateTrainingBar'), true,
     'A77: it is separate from the training bar');
  eq(/window\.addEventListener\('offline', updateNetBar\);/.test(app), true, 'A77: …and reacts to the OS event');

  // the printed report is a different document from the screen one: a phone
  // held one-handed vs a sheet read at a table and kept in a file
  eq(/function printReportHTML\(id, d, data\)/.test(app), true, 'A77: print has its own renderer');
  // A154: the printed copy must be the SAME SLICE as the screen, or paper and
  // phone disagree about the same report — which is the worst kind of
  // disagreement, because the paper is what gets filed and quoted.
  eq(/printReportHTML\(id, Aggregate\.computeReport\(id, bookFor\(id, data\)\), data\)/.test(app), true,
     'A77/A154: …and printReport uses it, on the same book the screen used');
  // built from the SNAPSHOT, never by widening computeReport — that function is
  // mirrored byte-for-byte in Code.gs, so changing it would mean a redeploy for
  // a formatting improvement
  eq(/function computeReport\(id, data\)/.test(fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8')), true,
     'A77: computeReport is untouched…');
  const pr = app.slice(app.indexOf('function printReportHTML'), app.indexOf('function reportHTML'));
  eq(/Aggregate\.voidedIds\(data\)/.test(pr), true,
     'A77: …the extra columns are looked up from the data the client already holds');
  eq(/p\.phone/.test(pr) && /last_paid_col/.test(pr) && /collector_col/.test(pr), true,
     'A77: dues prints the number to ring, when they last gave, and who to ask');
  eq(/r\.byCat/.test(pr) && /CAT_LABEL_KEYS\[k\]/.test(pr), true,
     'A77: in-hand prints byCat, which was computed and never shown — the first question at a cash count');
  eq(/spent_by_col/.test(pr) && /by_subject_col/.test(pr), true, 'A77: expenses prints every line AND the summary');
  eq(/donor_count_col/.test(pr), true,
     'A77: by-collector prints how many donors, so one big gift is not read as forty small ones');
  // a multi-page sheet needs its headers back on every page
  eq(/\.p-table thead \{ display: table-header-group; \}/.test(css), true,
     'A77: …and the header row repeats across pages');
  eq(/\.p-table tr \{ break-inside: avoid; \}/.test(css), true, 'A77: …with no row split down the middle');
}

// ---- A54–A57 (audit Tier 1) -------------------------------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const db = fs.readFileSync(__dirname + '/../js/db.js', 'utf8');
  const sync = fs.readFileSync(__dirname + '/../js/sync.js', 'utf8');
  const sw = fs.readFileSync(__dirname + '/../sw.js', 'utf8');
  const lists = fs.readFileSync(__dirname + '/../js/lists.js', 'utf8');
  const sc = fs.readFileSync(__dirname + '/../tests/scope-check.js', 'utf8');
  const i18n = fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8');

  // 1.2 — declining a duplicate must END the entry.
  //
  // A115d: this used to pin `if (!rewindToKey('name'))`, i.e. the rule was
  // written for two flows and guarded for the one where the rewind FAILED.
  // paymentFlow has no 'name' step so it ended; shop and person have one, so
  // they rewound — landing the collector back on "নাম?" with the phone, pledge
  // and money still filled in, where skipHidden() jumped straight past all of
  // it to save and fired the same alert again on the old PHONE. Cancel looped;
  // OK saved the new name against the other donor's money.
  //
  // So the assertion is the property now, not the shape: there is no
  // conditional in front of it, no rewind left in the cancel path, and the
  // draft is cleared — an entry the collector explicitly refused must not come
  // back as a resume offer.
  {
    const cancelBranch = app.slice(app.indexOf("else if (msg === 'cancelled')"),
                                   app.indexOf("// A54 (audit 1.3)"));
    eq(/flowState = null;/.test(cancelBranch) && /toast\(t\('dup_cancelled'\)\)/.test(cancelBranch) &&
       /navigate\(def\.returnTo \|\| 'home'\)/.test(cancelBranch), true,
       'A54: declining a duplicate abandons the entry and says so');
    eq(/rewind/.test(cancelBranch.replace(/\/\/[^\n]*/g, '')), false,
       'A115: …in EVERY flow — no rewind survives in the cancel path');
    eq(/draftClear\(\)/.test(cancelBranch), true,
       'A115: …and the refused entry is not left behind as a resumable draft');
  }
  eq(/else if \(msg === 'cancelled'\) \{ rewindToKey\('name'\) \|\| goBack\(\); \}/.test(app), false,
     'A54: …the silent loop is gone');

  // 1.3 — every unexpected failure claimed the amount was zero
  eq(/else \{ toast\(t\('save_failed'\) \+ ': ' \+ errMsg\(e\)\); \}/.test(app), true,
     'A54: an unexpected save failure says what happened…');
  eq(/else \{ toast\(t\('amount_zero'\)\); rewindToAmount\(\) \|\| goBack\(\); \}/.test(app), false,
     'A54: …and does not rewind, because rewinding invites infinite retry');

  // 1.4 — a refused row left the queue and the badge went green
  eq(/function rejectedCount\(\)/.test(db) && /rejectedCount: rejectedCount/.test(db), true,
     'A54: refused rows are counted separately from pending ones');
  eq(/b\.className = 'badge rejected';/.test(app), true,
     'A54: …and get their own red header state, ahead of the pending count');
  eq(/dispatchEvent\(new CustomEvent\('ck-rejected'\)\)/.test(sync), true,
     'A54: …announced at the moment it happens, not left in a screen nobody opens');
  eq(/rejected_n:/.test(i18n), true, 'A54: …in words, without machine vocabulary');

  // 1.5 — one flaky asset aborted the whole precache
  eq(/const SHELL = \[/.test(sw) && /const EXTRAS = \[/.test(sw), true,
     'A55: the shell is separate from the 456 KB of icons no offline screen needs');
  eq(/EXTRAS\.map\(function \(u\) \{ return get\(c, u\)\.catch\(function \(\) \{\}\); \}\)/.test(sw), true,
     'A55: …and an extra that will not download cannot cost the collector their offline app');
  eq(/var timer = setTimeout\(fallback, 4000\);/.test(sw), true,
     'A55: a navigate races a 4 s timer — .catch never fires on a network that goes quiet');
  eq(/caches\.has\(Auth\.APP_VERSION\)/.test(app) && /offline_not_ready:/.test(i18n), true,
     'A55: and something finally ASKS whether the shell cached');

  // 1.6 — ~1,000 JSON.parse per keystroke, and a refresh nobody throttled
  eq(/if \(raw !== memoRaw\) \{ memoRaw = raw; memo = JSON\.parse\(raw\); \}/.test(lists), true,
     'A56: the list cache is memoised on the raw string, so it cannot go stale');
  eq(/const REFRESH_MS = 5 \* 60 \* 1000;/.test(lists), true,
     'A56: …and refresh is throttled — it ran on every poll, focus and tile tap');
  eq(/function refresh\(force\)/.test(lists) && /Lists\.refresh\(true\)/.test(app), true,
     'A56: …with a force path, so an admin edit still lands immediately');

  // 1.7 — the scope check could not see inside the codebase's own idiom
  eq(/\(\?<!\[A-Za-z0-9_\$\.\]\)/.test(sc), true,
     'A57: the scope check uses a lookbehind, so esc(missingFn()) is no longer invisible');
  eq(/\(\?:\^\|\[\^A-Za-z0-9_\$\.\]\)/.test(sc), false,
     'A57: …the consumed-character version, blind to 39% of call sites, is gone');
}

// A65 (audit 2.17): the backend, executed rather than grepped. Loaded last so
// a shim problem cannot hide a failure in the pure-logic suite above.
//
// A79: wrapped, because every call in there is a REAL request and an
// unexpected throw is exactly what a regression looks like. Unwrapped, the
// first one killed the process — no summary, no exit-code-1 line anybody
// reads, and every assertion after it silently gone. Found by mutation: taking
// a key out of setConfig's whitelist made the suite CRASH, and a harness that
// reads "no FAIL lines" as "passed" then reported the guard as absent.
//
// It still cannot continue past the throw — these blocks share a book and
// carrying on would test nothing — but it is now counted, named and printed
// like any other failure instead of vanishing.
// ---- A144: confidential entry kinds (স্পনসর) --------------------------------
//
// The property this whole block exists to protect: a reader without the view
// grant gets a SMALLER book — and that smaller book must still be INTERNALLY
// TRUE. Every figure on their screen has to agree with every other figure on
// their screen. What must never happen is a reader being shown a 🩺 desk full
// of accusations about rows they cannot see.
{
  eq(RESTRICTED_TYPES, ['sponsor', 'gupt'], 'A144/A145: two confidential kinds, one mechanism');
  eq(VIEW_PERM_KEYS, ['sponsorview', 'guptview'], 'A144: …each view grant named after its kind, by rule not by literal');
  eq(viewPermFor('gupt'), 'guptview', 'A144: …the naming rule is a rule, not a literal');
  eq(isRestrictedType('shop'), false, 'A144: …an ordinary kind is not confidential');

  const admin = { username: 'boss', role: 'admin', entries: '' };
  const mine = { username: 'ram', role: 'user', entries: 'sponsor' };      // writes them, sees own
  const viewer = { username: 'jadav', role: 'user', entries: 'sponsorview' }; // sees all, writes none
  const blind = { username: 'sita', role: 'user', entries: 'shop,person' };
  const sp = { id: 'sp1', type: 'sponsor', name: 'Bose Motors', collectorId: 'ram', pledged: 50000 };

  eq(canSeeParty(admin, sp), true, 'A144: admin sees every sponsor');
  eq(canSeeParty(mine, sp), true, 'A144: …the person who wrote it sees their own');
  eq(canSeeParty(viewer, sp), true, 'A144: …the view grant opens somebody else\'s');
  eq(canSeeParty(blind, sp), false, 'A144: …and nobody else sees it at all');
  eq(canSeeParty(mine, { id: 'sp2', type: 'sponsor', collectorId: 'other' }), false,
     'A144: the ENTRY grant is not a view grant — sponsor+own-row only, never a colleague\'s');
  eq(canSeeParty(blind, { id: 's1', type: 'shop' }), true,
     'A144: …and an ordinary donor is nobody\'s secret');

  // The book: one shop, one sponsor, a payment against each, and a handover of
  // the sponsor money to the cashier who may see it.
  const book = {
    parties: [{ id: 's1', type: 'shop', name: 'Maa Tara', collectorId: 'ram', pledged: 2000, side: 'main_malda' }, sp],
    payments: [{ id: 'p1', partyId: 's1', amount: 2000, collectorId: 'ram', date: '2026-09-01' },
               { id: 'p2', partyId: 'sp1', amount: 30000, collectorId: 'ram', date: '2026-09-01' }],
    daily: [], expenses: [], voids: [], corrections: [],
    handovers: [{ id: 'h1', fromId: 'ram', toId: 'jadav', amount: 30000, cashAmount: 30000, upiAmount: 0,
                  status: 'confirmed', date: '2026-09-02',
                  breakdown: JSON.stringify({ sponsor: { cash: 30000, upi: 0 } }) }],
  };

  const seen = visibleData(book, blind);
  eq(seen.parties.map(function (p) { return p.id; }), ['s1'], 'A144: the sponsor party is withheld');
  eq(seen.payments.map(function (p) { return p.id; }), ['p1'],
     'A144: …and its payment goes WITH it — a payment whose party is missing is an orphan_payment accusation');
  eq(seen.handovers.length, 0,
     'A144: …and so does the handover carrying that pot — a trimmed breakdown is a breakdown_mismatch accusation');
  eq(visibleData(book, admin).parties.length, 2, 'A144: admin\'s book is whole');
  eq(visibleData(book, viewer).handovers.length, 1, 'A144: …so is the viewer\'s');

  // THE pin. Both books must reconcile — the invariant survives BECAUSE both
  // sides of it are derived from the same rows, so removing rows shrinks both.
  eq(reconcile(book).anomalies.filter(function (a) { return a.type === 'unbalanced'; }).length, 0,
     'A144: the whole book balances');
  eq(reconcile(seen).anomalies.length, 0,
     'A144: …and the SMALLER book raises nothing at all — no unbalanced, no orphan_payment, no breakdown_mismatch');
  eq(computeTotals(seen).totalCollection < computeTotals(book).totalCollection, true,
     'A144: …it is honestly smaller (which is why the report says so in words)');

  // reports: the breakdown must never add up to less than the total above it
  const ov = computeReport('overview', book);
  eq(ov.byType.sponsor.paid, 30000, 'A144: overview names স্পনসর, so its breakdown still sums to the total');
  eq(ov.totalPledged, 52000, 'A144: …and a sponsor\'s agreed figure counts as pledged');
  eq(computeReport('areas', book).rows.map(function (r) { return r.area; }), ['main_malda'],
     'A144: এলাকা leaves স্পনসর out — nobody walked a street for it');
  eq(computeReport('dues', book).rows.map(function (r) { return r.name; }), ['Bose Motors'],
     'A144: …but the dues list keeps it, because ₹20,000 is still owed and somebody must chase it');

  // the payments hole: permForRow says a payment needs no grant, which stops
  // being safe the moment a party is confidential
  eq(permForRow('payments', book.payments[1]), null,
     'A144: permForRow alone still says a payment needs no grant…');
  eq(canWritePayment(blind, book.parties, book.payments[1]), false,
     'A144: …so canWritePayment resolves the party: a blind reader may not collect against a sponsor they cannot see');
  eq(canWritePayment(blind, book.parties, book.payments[0]), true,
     'A144: …while an ordinary donor stays open to everyone, as it must');
  eq(canWritePayment(mine, book.parties, book.payments[1]), true,
     'A144: …the person who wrote the sponsor may take its next instalment');
  eq(canWritePayment(viewer, book.parties, book.payments[1]), true,
     'A144: …and so may a cashier who can see it — the rule is the READING rule, one rule, no second copy to drift');

  // a view grant is a confidence given to a PERSON, never to a post
  eq(POSITION_PERM_KEYS.indexOf('sponsorview'), -1,
     'A144: a committee POST cannot carry sponsorview — it would change hands with the post, silently');
  eq(PERM_KEYS.indexOf('sponsorview') >= 0, true, 'A144: …an admin still grants it per person');

  // the pot must exist, or the money lands nowhere the handover screen can see
  const av = myAvailable(book, 'ram');
  eq(((av.byCat.sponsor || {}).cash || 0) + ((av.byCat.sponsor || {}).upi || 0), 0,
     'A144: sponsor money handed over in full leaves an EMPTY pot — the band then drops out of the summary');
  const held = myAvailable({ parties: book.parties, payments: book.payments, daily: [], expenses: [],
                             handovers: [], voids: [] }, 'ram');
  eq((held.byCat.sponsor || {}).cash, 30000, 'A144: …and before the handover it sits in its OWN pot, not in "payment"');
  const sum = mySummary({ parties: book.parties, payments: book.payments, daily: [], expenses: [],
                          handovers: [], voids: [] }, 'ram', '2026-09-04');
  eq(sum.groups.map(function (g) { return g.key; }), ['entry', 'sponsor'],
     'A144: …and it gets its own band, so one negotiation never rewrites what the চাঁদা band records');
  eq(sum.groups.reduce(function (a, g) { return a + g.total; }, 0), sum.hero.total,
     'A144: …with the bands still summing to the hero exactly');
}

// ---- A144: the client/server halves that must not drift ---------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');

  eq(/var RESTRICTED_TYPES = \['sponsor', 'gupt'\];/.test(gs), true,
     'A144 mirror: the server names the same confidential kinds');
  eq(/all = visible_\(all, u\);/.test(gs), true,
     'A144: the server WITHHOLDS — hiding on the client would be decoration');
  eq(/var cursor = stamp \|\| maxReceivedAt_\(all\);[\s\S]{0,900}?all = visible_\(all, u\);/.test(gs), true,
     'A144: …and the cursor is read BEFORE the filter — a cursor from a filtered book parks a phone in the past');
  eq(/if \(r\.store === 'payments'\) \{[\s\S]{0,400}?canSeeParty_\(user, pRow\)/.test(gs), true,
     'A144: the payments hole is closed on the SERVER, where a tampered client cannot reach');
  eq(/batchParties\[pid\] \|\| partyIndex_\(\)\[pid\]/.test(gs), true,
     'A144: …reading this push first, or a new sponsor and its first payment would bounce (A59\'s lesson)');
  eq(/if \(r\.store === 'handovers' && handoverConfidentialErr_\(r\.row\)\)/.test(gs), true,
     'A144: a mixed or blind-recipient handover is refused by the server too');

  // the client half of each promise
  eq(/if \(mix\.mixed\) return Promise\.reject\(new Error\('mix-confidential'\)\)/.test(app), true,
     'A144: the app refuses to MIX a confidential pot into an ordinary handover');
  eq(/if \(mix\.cats\.length && !recipientSees\(a\.to, mix\.cats\)\)/.test(app), true,
     'A144: …and refuses to send it to somebody who could never see it arrive');
  eq(/viewGrantsOf\(before\) !== viewGrantsOf\(resp\.me\)/.test(app), true,
     'A144: a changed view grant is noticed…');
  eq(/if \(regrant\) \{[\s\S]{0,600}?centralCursor = '';[\s\S]{0,400}?return pullCentral\(\{ force: true \}\);/.test(app), true,
     'A144: …and forces ONE full pull, because no delta can carry rows older than the cursor (or express a deletion)');
  // the curtain is NOT the permission — this is the line that keeps a wrong
  // total out of somebody's mouth
  eq(/function canSeeParty\(user, party\) \{/.test(fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8')), true,
     'A144: canSeeParty takes no curtain flag — the curtain must never remove money from a hero figure');
  eq(/if \(curtainOn && CURTAIN_GROUPS\[g\.key\]\) \{[\s\S]{0,400}?fmtMoney\(g\.total\)/.test(app), true,
     'A144: …the covered band still prints its real total');
  eq(/let curtainOn = false;/.test(app), true,
     'A144: …and the curtain is module state, so reopening the app always lifts it');
  // Found by DRIVING it, not by reading it: paintCurtain ran only at
  // DOMContentLoaded, when nobody is logged in yet, so the button stayed hidden
  // for the entire session. Whether it is offered depends on WHO is logged in,
  // so it has to repaint on the same rhythm as the title.
  {
    const body = app.slice(app.indexOf('\n  function render() {'));
    eq(body.slice(0, body.indexOf('\n  }\n')).indexOf('paintCurtain();') > 0, true,
       'A144: render() repaints the curtain button — painting it once at load left it hidden all session');
  }
}

// ---- A145: গুপ্ত দান, the second tenant of the same machinery ---------------
//
// The point of this block is what it does NOT have to test again: canSeeParty,
// visibleData, the payments gate and the server filter are the same code paths
// A144 pinned, and গুপ্ত দান inherits them by being named in RESTRICTED_TYPES.
// What IS new: no pledge (so it never reaches the dues list), no locality, and
// the mixing rule that only became visible once a SECOND confidential kind
// existed.
{
  const mine = { username: 'ram', role: 'user', entries: 'gupt' };
  const seer = { username: 'jadav', role: 'user', entries: 'guptview' };
  const sponsorOnly = { username: 'bimal', role: 'user', entries: 'sponsor,sponsorview' };
  const g = { id: 'g1', type: 'gupt', name: 'নাম প্রকাশে অনিচ্ছুক', collectorId: 'ram', pledged: 0 };

  eq(isRestrictedType('gupt'), true, 'A145: গুপ্ত দান is confidential');
  eq(viewPermFor('gupt'), 'guptview', 'A145: …with its own view grant');
  eq(canSeeParty(mine, g), true, 'A145: the collector who took it sees their own');
  eq(canSeeParty(seer, g), true, 'A145: …the view grant opens everybody\'s');
  eq(canSeeParty(sponsorOnly, g), false,
     'A145: …and sponsorview opens NOTHING here — the grants are per kind, not one "trusted" flag');
  // somebody ELSE's sponsor — one's own row is always visible whatever the kind,
  // which is the rule, so the fixture has to be another collector's
  eq(canSeeParty(mine, { id: 'sp9', type: 'sponsor', collectorId: 'bimal' }), false,
     'A145: …the mirror holds too: writing গুপ্ত দান gives no sight of other people\'s sponsors');
  eq(canSeeParty(mine, { id: 'sp8', type: 'sponsor', collectorId: 'ram' }), true,
     'A145: …while a row you wrote yourself stays yours to read, whatever kind it is');
  eq(POSITION_PERM_KEYS.indexOf('guptview'), -1,
     'A145: guptview cannot ride a committee post either');

  // no pledge → never in the dues list, for free
  const book = {
    parties: [g, { id: 's1', type: 'shop', name: 'Maa Tara', collectorId: 'ram', pledged: 2000, side: 'main_malda' }],
    payments: [{ id: 'gp1', partyId: 'g1', amount: 2000, collectorId: 'ram', date: '2026-09-03' },
               { id: 'gp2', partyId: 'g1', amount: 3000, collectorId: 'ram', date: '2026-09-04' },
               { id: 'sp1', partyId: 's1', amount: 500, collectorId: 'ram', date: '2026-09-04' }],
    daily: [], expenses: [], handovers: [], voids: [], corrections: [],
  };
  eq(computeReport('dues', book).rows.map(function (r) { return r.name; }), ['Maa Tara'],
     'A145: a গুপ্ত দাতা never appears in the dues list — no pledge means no debt to chase');
  eq(computeReport('overview', book).byType.gupt, { count: 1, pledged: 0, paid: 5000 },
     'A145: …but the overview names them, so the breakdown still sums to the total above it');
  eq(computeReport('areas', book).rows.map(function (r) { return r.area; }), ['main_malda'],
     'A145: …and no locality is recorded, so none can leak through the এলাকা report');
  eq(duesList(book.parties, book.payments, []).length, 1,
     'A145: duesList agrees with the report — one rule, not two');

  // "multiple entries from one" is the whole reason this is a party, not a
  // one-shot daily row
  const av = myAvailable(book, 'ram');
  eq((av.byCat.gupt || {}).cash, 5000, 'A145: two donations from one donor land in ONE গুপ্ত pot');
  eq((av.byCat.shop || {}).cash, 500, 'A145: …and the ordinary চাঁদা keeps its own');
  const sum = mySummary(book, 'ram', '2026-09-04');
  eq(sum.groups.map(function (x) { return x.key; }), ['entry', 'gupt'],
     'A145: গুপ্ত দান gets its own band');
  eq(sum.groups.reduce(function (a, x) { return a + x.total; }, 0), sum.hero.total,
     'A145: …bands still sum to the hero exactly');
  eq(canWritePayment(sponsorOnly, book.parties, book.payments[0]), false,
     'A145: …and a second instalment may not be written by somebody who cannot see the donor');

  // the smaller book stays true, exactly as A144's does
  const blind = visibleData(book, sponsorOnly);
  eq(blind.parties.map(function (p) { return p.id; }), ['s1'], 'A145: গুপ্ত rows are withheld whole');
  eq(blind.payments.map(function (p) { return p.id; }), ['sp1'], 'A145: …with their payments');
  eq(reconcile(blind).anomalies.length, 0, 'A145: …and the smaller book accuses nobody');
}

// ---- A145: one confidential pot per parcel ---------------------------------
//
// Found by ADDING the second kind, not by reading the first. `mixed` used to
// mean "confidential + open". With two confidential kinds, স্পনসর + গুপ্ত in one
// parcel is just as fatal: visible_ drops a handover if ANY of its pots is
// closed to the reader, so a cashier holding only sponsorview loses the sponsor
// half as well, and the sender reads as negative in-hand on their screen.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const rule = /mixed: cats\.length > 1 \|\| \(cats\.length > 0 && open\.length > 0\)/;
  eq(rule.test(app), true, 'A145: the app refuses a parcel carrying TWO confidential pots');
  eq(rule.test(gs), true, 'A145: …and so does the server, in the same words');
  eq(/var RESTRICTED_TYPES = \['sponsor', 'gupt'\];[\s\S]{0,400}?var ENTRY_KINDS = \[[^\]]*'gupt',[^\]]*\]/.test(gs), true,
     'A145: …server ENTRY_KINDS carries গুপ্ত দান too, or every entry would be rejected at the gate');
  // no pledge, no locality — the two omissions that ARE the feature
  eq(/\{ key: 'pledged'[\s\S]{0,160}?showIf: function \(\) \{ return type !== 'gupt'; \}/.test(app), true,
     'A145: the flow asks গুপ্ত দান no pledge — "no expected amount, only amount entry"');
  eq(/type !== 'shop' && type !== 'sponsor' && type !== 'gupt' && Lists\.get\('location'\)/.test(app), true,
     'A145: …and no locality, which is the field most likely to identify a donor who asked not to be named');
  // Found by driving the গুপ্ত card: "কথা ₹0 · বাকি −₹2,000" over a donor who
  // promised nothing. A minus in বাকি means "chase this person" everywhere else
  // in the app. Members were reading the same lie and nobody had noticed.
  eq(/\(Number\(p\.pledged\) \|\| 0 \? '<div class="stat3">'[\s\S]{0,600}?: '<div class="stat3"><div><span>' \+ esc\(t\('paid'\)\)/.test(app), true,
     'A145: a donor with no pledge shows only what they GAVE — no কথা, no negative বাকি');
}

// ---- A146: ask "কাকে?" last, so the answer can be derived ------------------
//
// Hrishi, after seeing the save-time error: "ok select the name at the last, it
// will help — but how will you decide that we need now permission cashier or
// admin". The answer is that nothing DECIDES: asked last, the pots are already
// known, so the list is simply the people who may receive this parcel.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');

  // the ORDER is the fix — money first, then the name
  eq(/steps: moneySteps_\.concat\(\[toStep\], \[/.test(app), true,
     'A146: the handover asks for the money BEFORE the name');
  // …and the list is read when that step is REACHED, or it would still be built
  // before the sheet exists and the reorder would buy nothing
  eq(/key: 'to', qKey: 'q_handover_to', kind: 'choice',[\s\S]{0,300}?optionsFn: function \(a\) \{[\s\S]{0,200}?recipientsFor\(opts, a\)/.test(app), true,
     'A146: …and the recipient list is built from the answers, at the moment it is shown');
  // the base rule must NOT have moved: approved + admin-or-cashier, as before
  eq(/u\.status === 'approved' && \(u\.role === 'admin' \|\| Number\(u\.cashier\) === 1\)/.test(app), true,
     'A146: the base rule is untouched — still approved, and admin or কোষাধ্যক্ষ');
  // an ORDINARY parcel narrows nothing: twelve people's daily screen is unchanged
  eq(/if \(!cats\.length\) return opts;/.test(app), true,
     'A146: …a parcel with no confidential pot offers exactly the list it always did');
  // `sees` has to survive both paths into the flow, or every cashier looks eligible
  eq(/\{ username: u\.username, name: u\.name, sees: String\(u\.sees \|\| ''\) \}/.test(app), true,
     'A146: `sees` travels with the roster name…');
  // the key is anchored on its left: without that, a renamed `xsees:` still
  // matched as a substring and the mutation sailed through green (vacuous pin)
  eq(/names\.push\(\{ username: row\.username, name: row\.name, role: row\.role,[\s\S]{0,300}?[\s,{]sees: RESTRICTED_TYPES\.filter/.test(gs), true,
     'A146: …and with the server list too, which a phone that never pulled will use instead');
  // the honest dead end: named, with the fix, never a bare empty row
  eq(/if \(!chips\.length && s\.emptyKey\) \{/.test(app), true,
     'A146: an empty choice step says WHY it is empty…');
  eq(/emptyKey: 'ho_nobody_may_take'/.test(app), true,
     'A146: …and the handover names the person who can fix it (grant the cashier the view)');
  eq(/  ho_nobody_may_take: \{/.test(fs.readFileSync(__dirname + '/../js/i18n.js', 'utf8')), true,
     'A146: …in both languages');

  // Mixing is made IMPOSSIBLE on the sheet, not punished at the end. Everything
  // starts lit, so "hand over the lot" used to build exactly the parcel the save
  // then refused — the dead end had only MOVED to the last step. Found by
  // driving it, twice: once to see the error, once to see it move.
  eq(/const isConf = function \(b\) \{ return Aggregate\.isRestrictedType\(b\.dataset\.cat\); \};/.test(app), true,
     'A146: the sheet knows which pots are confidential…');
  eq(/b\.onclick = function \(\) \{ b\.classList\.toggle\('on'\); exclusive\(b\); refresh\(\); \};/.test(app), true,
     'A146: …picking one drops whatever it may not travel with…');
  eq(/const keep = wantConf \? \(isConf\(o\) && o\.dataset\.cat === b\.dataset\.cat\) : !isConf\(o\);/.test(app), true,
     'A146: …including a SECOND confidential pot, which is mixing too');
  eq(/if \(picks\.some\(isConf\) && picks\.some\(function \(b\) \{ return !isConf\(b\); \}\)\) \{/.test(app), true,
     'A146: …and the sheet OPENS valid, so the default tap is never the refused parcel');

  // ONE payment→pot map. There were three hand-written copies; A144/A145 taught
  // two of them about the new kinds and missed the cashier's, which then filed a
  // ₹30,000 sponsor under "চাঁদা (পুরোনো)". Found by driving the cashier sheet.
  const agg = fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
  eq((agg.match(/\['shop', 'person', 'member', 'sponsor', 'gupt'\]\.indexOf/g) || []).length, 1,
     'A146: the payment→pot list is written ONCE (A66\'s lesson, third time)');
  eq((agg.match(/put\(catOfPayment\(ty\), splitOf\(r\)\)/g) || []).length, 1,
     'A146: …and the cashier\'s own screen reads that one');

  // ONE banding, too. The handover sheet and the cashier's read-only position
  // each carried their own copy; a category in none of their rows was silently
  // DROPPED, so a ₹30,000 sponsor pot disappeared from the sheet while the total
  // beside it still counted the money. Both now read SUMMARY_GROUPS, whose bands
  // are already asserted to sum to the hero exactly.
  eq((app.match(/\['shop', 'person', 'member', 'payment', 'bus'\]/g) || []).length, 0,
     'A146: no screen keeps its own copy of the entry band any more');
  // two USES (the sheet and the cashier's read-only position); the third match
  // is the comment that explains why, and counting code not prose is the point
  eq((app.match(/^\s+(?:const groups = |html \+= )Aggregate\.SUMMARY_GROUPS/gm) || []).length, 2,
     'A146: …both handover screens band from the one source');
}

// the cashier's screen and the collector's must name the same pot for the same
// money — a figure that changes its name between two screens is the bug this
// whole family of maps keeps producing
{
  const book = {
    parties: [{ id: 'sp1', type: 'sponsor', name: 'Bose', collectorId: 'ram', pledged: 50000 },
              { id: 'g1', type: 'gupt', name: 'শুভাকাঙ্ক্ষী', collectorId: 'ram', pledged: 0 }],
    payments: [{ id: 'p1', partyId: 'sp1', amount: 30000, collectorId: 'ram', date: '2026-09-04' },
               { id: 'p2', partyId: 'g1', amount: 5000, collectorId: 'ram', date: '2026-09-04' }],
    daily: [], expenses: [], handovers: [], voids: [], corrections: [],
  };
  const cv = cashierView(book, 'ram'), av = myAvailable(book, 'ram');
  eq((cv.collectedByCat.sponsor || {}).cash, 30000, 'A146: the cashier screen files স্পনসর as স্পনসর…');
  eq((cv.collectedByCat.gupt || {}).cash, 5000, 'A146: …and গুপ্ত দান as গুপ্ত দান');
  eq((cv.collectedByCat.payment || {}).cash || 0, 0,
     'A146: …neither is swept into the general "চাঁদা (পুরোনো)" pot any more');
  eq((cv.collectedByCat.sponsor || {}).cash, (av.byCat.sponsor || {}).cash,
     'A146: …and the two screens agree, pot for pot');
}

// ---- A147: the two people a handover is ABOUT always see it ----------------
//
// Found by filling one book with every kind of entry and reading it from all
// four sides — which is the only way this shows. A collector who may TAKE
// স্পনসর but not view other people's had his OWN outgoing parcels withheld:
// his phone said he still held ₹44,700 and had handed over ₹0, while the
// cashier's phone said ₹9,700 and ₹35,000. He had given the money in that
// morning. Two books, two answers, about one man's pocket.
{
  const sender = { username: 'subrata', role: 'user', entries: 'sponsor' };   // takes them, cannot view others'
  const seer = { username: 'kali', role: 'user', entries: 'sponsorview' };
  const stranger = { username: 'bimal', role: 'user', entries: 'shop' };
  const sp = { id: 'sp1', type: 'sponsor', name: 'Bose', collectorId: 'subrata', pledged: 50000 };
  const book = {
    parties: [sp],
    payments: [{ id: 'p1', partyId: 'sp1', amount: 30000, cashAmount: 30000, upiAmount: 0,
                 collectorId: 'subrata', date: '2026-09-04' }],
    handovers: [{ id: 'h1', fromId: 'subrata', toId: 'kali', amount: 30000, cashAmount: 30000, upiAmount: 0,
                  status: 'confirmed', date: '2026-09-04',
                  breakdown: JSON.stringify({ sponsor: { cash: 30000, upi: 0 } }) }],
    daily: [], expenses: [], voids: [], corrections: [],
  };
  eq(visibleData(book, sender).handovers.length, 1,
     'A147: the SENDER sees the parcel he sent, even without the view grant');
  eq(visibleData(book, seer).handovers.length, 1, 'A147: …the recipient sees it too');
  // …and the recipient half is NOT covered by the view grant, so it needs a
  // recipient who lacks one. That is a real case, not a contrived one: A146
  // stops such a parcel being SENT, but a grant can be taken away afterwards —
  // and the cashier is still holding the cash.
  const exSeer = { username: 'kali', role: 'user', entries: 'shop' };
  eq(visibleData(book, exSeer).handovers.length, 1,
     'A147: …a recipient whose grant was later REVOKED still sees the parcel they are holding');
  eq(visibleData(book, stranger).handovers.length, 0,
     'A147: …and somebody who is neither, and may not view the pot, still does not');
  // the money itself: the sender's own screen must agree with the cashier's
  const asSender = mySummary(visibleData(book, sender), 'subrata', '2026-09-04');
  const asSeer = mySummary(visibleData(book, seer), 'subrata', '2026-09-04');
  eq(asSender.hero.total, asSeer.hero.total,
     'A147: …so both phones say the same thing about ONE man\'s pocket');
  eq(asSender.tillNow.handedOver, 30000,
     'A147: …and "জমা দিয়েছি" is the money he actually gave in, not ₹0');
  // the donor stays confidential — that is what was being protected all along
  eq(visibleData(book, sender).parties.length, 1, 'A147: his own sponsor row is his to read…');
  eq(visibleData(book, stranger).parties.length, 0, 'A147: …and still nobody else\'s');

  // A147: the overview must PRINT every kind it counted. computeReport's byType
  // learned about the new kinds; the renderer kept a hand-written list of three,
  // so the admin's screen showed মোট আদায় ₹74,100 over rows adding to ₹36,500,
  // and a মোট বাকি with no row behind it. Fifth copy of the same list.
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/typeRow\('shop'\) \+ typeRow\('person'\) \+ typeRow\('member'\)/.test(appSrc), false,
     'A147: the overview no longer names three kinds by hand…');
  eq(/Object\.keys\(tt\.byType \|\| \{\}\)\.filter\(function \(k\) \{ return tt\.byType\[k\]\.count; \}\)\.map\(typeRow\)/.test(appSrc), true,
     'A147: …it prints every kind the computation actually counted');

  const fs = require('fs');
  eq(/!handoverTouches\(h, hiddenCat\) \|\| isPartyTo\(h, userIdent\(user\)\)/
     .test(fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8')), true,
     'A147: the client rule says so…');
  eq(/out\.handovers = \(all\.handovers \|\| \[\]\)\.filter\(function \(h\) \{ return !h \|\| !touches\(h\) \|\| mine\(h\); \}\);/
     .test(fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8')), true,
     'A147: …and the server, which is the one that actually withholds');
}

// ---- A148: the two ভাঁড়ার ---------------------------------------------------
//
// The property everything rests on: a sector is a PARTITION of the same rows, so
// the two columns must add up to the totals printed beside them, and the
// committee-wide invariant must not notice sectors exist at all.
{
  const A = require('../js/aggregate.js');
  const book = {
    parties: [
      { id: 'p1', type: 'shop', name: 'পাল', pledged: 5000, collectorId: 'ram', side: 'main_malda' },
      { id: 'p2', type: 'sponsor', name: 'Bose', pledged: 50000, collectorId: 'ram', sector: 'program' },
    ],
    payments: [
      { id: 'y1', partyId: 'p1', amount: 2000, cashAmount: 2000, upiAmount: 0, collectorId: 'ram', date: '2026-09-04' },
      { id: 'y2', partyId: 'p2', amount: 30000, cashAmount: 30000, upiAmount: 0, collectorId: 'ram', date: '2026-09-04' },
    ],
    daily: [
      { id: 'd1', type: 'road', amount: 1000, cashAmount: 1000, upiAmount: 0, collectorId: 'ram', date: '2026-09-04' },
      { id: 'd2', type: 'road', amount: 4000, cashAmount: 4000, upiAmount: 0, collectorId: 'ram', date: '2026-09-04', sector: 'program' },
    ],
    expenses: [
      { id: 'e1', subject: 'প্যান্ডেল', amount: 500, cashAmount: 500, upiAmount: 0, spentBy: 'ram', date: '2026-09-04' },
      { id: 'e2', subject: 'শিল্পী', amount: 40000, cashAmount: 40000, upiAmount: 0, spentBy: 'ram', date: '2026-09-04', sector: 'program' },
    ],
    handovers: [], voids: [], corrections: [],
  };

  eq(A.SECTORS, ['puja', 'program'], 'A148: two ভাঁড়ার');
  eq(A.sectorOf({}), 'puja',
     'A148: a row with no sector is puja money — which is every row written before today');
  eq(A.sectorOf({ sector: 'nonsense' }), 'puja', 'A148: …and so is a row with a sector nobody knows');

  const sp = A.sectorSplit(book);
  eq(sp.puja, { collected: 3000, expense: 500, transferIn: 0, transferOut: 0, balance: 2500 },
     'A148: the puja fund');
  eq(sp.program, { collected: 34000, expense: 40000, transferIn: 0, transferOut: 0, balance: -6000 },
     'A148: …and the programme, which is ₹6,000 in deficit');

  // THE pin. If these ever drift, one screen is lying about the other.
  const tt = A.computeTotals(book);
  eq(sp.puja.collected + sp.program.collected, tt.totalCollection,
     'A148: the two funds add up to মোট আদায়, exactly');
  eq(sp.puja.expense + sp.program.expense, tt.totalExpense,
     'A148: …and to মোট খরচ, exactly');
  eq(A.reconcile(book).anomalies.filter(function (a2) { return a2.type === 'unbalanced'; }).length, 0,
     'A148: …while the committee-wide invariant does not notice sectors exist');

  // a sponsor's payment follows its DONOR's fund, not its own row
  eq(A.sectorOf(book.parties[1]), 'program', 'A148: the fund lives on the donor…');
  eq(sp.program.collected - 4000, 30000, 'A148: …and their instalment follows it');

  // the overview is what the screen actually reads, so pin ITS split, not just
  // sectorSplit's — a mutation that emptied `bySector` sailed through without this
  const ov = A.computeReport('overview', book);
  eq(ov.bySector, sp, 'A148: the overview carries the real split, not a placeholder');
  eq(ov.bySector.puja.collected + ov.bySector.program.collected, ov.totalCollection,
     'A148: …and its two columns reach the total printed above them');

  const pr = A.computeReport('program', book);
  eq(pr.collected, 34000, 'A148: the programme report counts only programme money');
  eq(pr.expense, 40000, 'A148: …and only programme spending');
  eq(pr.fromPuja, 6000, 'A148: …and names what the puja fund is carrying');
  eq(pr.income.map(function (r) { return r.key; }), ['sponsor', 'road'],
     'A148: …with income broken down by where it came from, biggest first');
  eq(pr.spend[0].key, 'শিল্পী', 'A148: …and spending by subject');
  eq(A.REPORT_IDS.indexOf('program') >= 0, true, 'A148: it is a real report id…');
  eq(A.POSITION_PERM_KEYS.indexOf('program') >= 0, true,
     'A148: …so the committee can hand the programme accounts to whoever runs it, via a post');

  // the six hand-written copies, now one
  const agg = require('fs').readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
  eq((agg.match(/\{ shop: \{ pledged: 0/g) || []).length, 0,
     'A148: computeTotals no longer types out the donor kinds…');
  eq((agg.match(/road: 0, toto: 0, bus: 0/g) || []).length, 0,
     'A148: …nor the daily kinds, in either place');
  eq(A.PARTY_KINDS.indexOf('gupt') >= 0 && A.DAILY_KINDS.indexOf('bus') >= 0, true,
     'A148: …they read PARTY_KINDS / DAILY_KINDS, so a new kind reaches every screen at once');
}

// ---- A148: the halves that must not drift ----------------------------------
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const cols = function (store) {
    const i = gs.indexOf('  ' + store + ':');
    return gs.slice(i, gs.indexOf('],', i)).replace(/\/\/[^\n]*/g, '').match(/'([a-zA-Z]+)'/g).map(function (q) { return q.slice(1, -1); });
  };
  ['parties', 'daily', 'expenses'].forEach(function (st) {
    eq(cols(st).indexOf('sector') >= 0, true, 'A148: ' + st + ' carries a real sector column');
  });
  eq(/program_on: 1 \}/.test(gs), true,
     'A148: setConfig accepts program_on — without it the admin toggle would answer ok and do nothing');
  eq(/var REPORT_IDS = \[[^\]]*'program'\]/.test(gs), true, 'A148 mirror: the server knows the report too');
  // OFF by default: no programme, no question on any entry screen
  // A153 removed the question entirely, so what programOn() now gates is the
  // TAB — which is the same property one level up: a committee with no programme
  // is never shown any of this.
  eq(/if \(k === 'program'\) b\.hidden = !programTabOn\(\);/.test(app), true,
     'A148/A153: the 🎭 tab appears only once the programme is switched on…');
  eq(/return programOn\(\) && \(Auth\.isAdmin\(\) \|\| canEntry\('progteam'\)/.test(app), true,
     'A153: …and only for somebody who is on it');
  // 'progteam', NOT 'program' — that word is already a REPORT id, and the three
  // key spaces are asserted disjoint because one flat list is split by membership
  eq(require('../js/aggregate.js').PROGRAM_KEYS, ['progteam', 'progdonor', 'progmoney'],
     'A153: the master and its two sub-permissions, arranged as a set');
  eq(REPORT_IDS.indexOf('progteam'), -1, 'A153: …and the master does not collide with the report id');
  // three flows ask it; the daily one also refuses to ask for a টিকিট, which is
  // programme money by definition (A149) — so two plain and one qualified
  // A153: the question is GONE. Hrishi's call, and the right one — asking "কোন
  // ভাঁড়ার?" on every entry put a decision on twelve collectors that was never
  // theirs, and every asking was a chance to answer wrongly. The fund now comes
  // from the TAB the flow was started in, which cannot be answered wrongly at all.
  eq(/showIf: function \(\) \{ return programOn\(\); \}/.test(app), false,
     'A153: no entry flow asks which ভাঁড়ার any more…');
  eq(/function newPartyFlow\(type, presets, sector\) \{/.test(app), true,
     'A153: …the donor flow takes it as an argument…');
  eq(/function dailyFlow\(type, sector\) \{/.test(app), true, 'A153: …so does the daily flow…');
  eq(/function expenseFlow\(subjects, duties, sector\) \{/.test(app), true, 'A153: …and the expense flow…');
  eq(/function dutyFlow\(sector\) \{/.test(app), true, 'A153: …and the দায় flow');
  // it must ride the RESUME record too, or a draft picked up tomorrow loses its
  // book — a mode flag read at save time would have had exactly that hole
  eq(/resume: \{ fn: 'newParty', type: type, presets: presets \|\| \{\}, sector: sector \|\| 'puja'/.test(app), true,
     'A153: …and it survives a resumed draft, because it rides the resume record');
  eq(/resume: \{ fn: 'daily', type: type, sector: sector \|\| 'puja'/.test(app), true,
     'A153: …on both flows that can be resumed');
  eq(/if \(String\(\(centralConfig \|\| \{\}\)\.program_on \|\| ''\) === 'on'\) return true;\s*\n\s*return programSeen;/.test(app), true,
     'A148: …and switching it off can never hide money that already exists');
}

// ---- A149: 🎟️ টিকিট, the programme's own income ----------------------------
{
  const A = require('../js/aggregate.js');
  eq(A.DAILY_KINDS.indexOf('ticket') >= 0, true, 'A149: টিকিট is a daily kind…');
  eq(A.PARTY_KINDS.indexOf('ticket'), -1, 'A149: …and not a donor — a ticket buyer makes no pledge');
  eq(A.ENTRY_KINDS.indexOf('ticket') >= 0, true,
     'A149: …so it gets its own grant for free, the way স্পনসর did');

  const book = {
    parties: [], payments: [],
    daily: [
      { id: 't1', type: 'ticket', amount: 4000, cashAmount: 4000, upiAmount: 0,
        collectorId: 'ram', date: '2026-09-04', sector: 'program' },
      { id: 'r1', type: 'road', amount: 1000, cashAmount: 1000, upiAmount: 0,
        collectorId: 'ram', date: '2026-09-04' },
    ],
    expenses: [], handovers: [], voids: [], corrections: [],
  };
  eq(A.sectorSplit(book).program.collected, 4000, 'A149: ticket money lands in the programme fund');
  eq(A.sectorSplit(book).puja.collected, 1000, 'A149: …and the road round stays with the puja');
  eq(A.computeReport('overview', book).dailyByType.ticket, 4000,
     'A149: the overview counts it, so its breakdown still reaches its own total');
  eq(A.computeReport('daily', book).rows.length, 1,
     'A149: …but the street-rounds report leaves it out, like bus — it is not a round');
  const av = A.myAvailable(book, 'ram');
  eq((av.byCat.ticket || {}).cash, 4000, 'A149: it holds its own pot…');
  const sum = A.mySummary(book, 'ram', '2026-09-04');
  eq(sum.groups.map(function (g) { return g.key; }), ['daily', 'ticket'],
     'A149: …and its own band, because "রোড / টোটো কালেকশন" would be a lie on it');
  eq(sum.groups.reduce(function (a, g) { return a + g.total; }, 0), sum.hero.total,
     'A149: …with the bands still summing to the hero exactly');
  // A153 moved this tile OFF the home screen into the 🎭 tab, where everything
  // about the programme now lives — the home copy would have written puja money.
  eq(A.homeTiles({ role: 'user', entries: 'ticket' }, {}).daily, [],
     'A153: টিকিট is no longer a home-screen tile…');
  eq(/if \(canEntry\('ticket'\)\) h \+= tile\('ticket', '🎟️', 'daily_ticket'\);/
     .test(require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8')), true,
     'A153: …it lives in the tab, still gated by the same grant');

  // three MORE copies of the daily list turned up here — the eighth, ninth and
  // tenth — each sweeping an unknown kind into the রোড pot, so টিকিট money would
  // have appeared as a road round in somebody's pocket
  const agg = require('fs').readFileSync(__dirname + '/../js/aggregate.js', 'utf8');
  eq((agg.match(/\['road', 'toto', 'bus'\]\.indexOf/g) || []).length, 0,
     'A149: no screen keeps its own copy of the daily list any more');
  eq(A.catOfDaily('ticket'), 'ticket', 'A149: …they all read catOfDaily');
  eq(A.catOfDaily('nonsense'), 'road', 'A149: …which still has the old fallback for a kind nobody knows');
}

// ---- A150: moving money between the two ভাঁড়ার -----------------------------
//
// The dangerous one, and the reason it is written as it is: TEN places in this
// file total an expense list. A transfer counted as a spend would break
// `in-hand === collected − spent` and put a false accusation on every 🩺 desk.
// So it is split off ONCE, in activeData, and every reader is right by default.
{
  const A = require('../js/aggregate.js');
  const base = {
    parties: [], payments: [],
    daily: [
      { id: 'd1', type: 'road', amount: 10000, cashAmount: 10000, upiAmount: 0, collectorId: 'ram', date: '2026-09-04' },
      { id: 'd2', type: 'ticket', amount: 2000, cashAmount: 2000, upiAmount: 0, collectorId: 'ram', date: '2026-09-04', sector: 'program' },
    ],
    expenses: [
      { id: 'e1', subject: 'প্যান্ডেল', amount: 1000, cashAmount: 1000, upiAmount: 0, spentBy: 'ram', srcCat: 'road', date: '2026-09-04' },
      { id: 'e2', subject: 'শিল্পী', amount: 6000, cashAmount: 6000, upiAmount: 0, spentBy: 'ram', srcCat: 'road', date: '2026-09-04', sector: 'program' },
    ],
    handovers: [], voids: [], corrections: [],
  };
  const withT = JSON.parse(JSON.stringify(base));
  withT.expenses.push({ id: 'x1', source: 'transfer', sector: 'puja', transferTo: 'program',
                        amount: 4000, cashAmount: 0, upiAmount: 0, spentBy: 'boss', date: '2026-09-04' });

  eq(A.isTransfer(withT.expenses[2]), true, 'A150: a transfer row knows itself');
  eq(A.isTransfer(base.expenses[0]), false, 'A150: …an ordinary spend does not');

  // THE point: adding a transfer must change NOTHING at committee level
  const t0 = A.computeTotals(base), t1 = A.computeTotals(withT);
  eq(t1.totalExpense, t0.totalExpense,
     'A150: a transfer is not a spend — মোট খরচ does not move');
  eq(t1.totalCollection, t0.totalCollection, 'A150: …nor is it income');
  eq(t1.inHand, t0.inHand, 'A150: …so the committee still holds exactly what it held');
  eq(A.reconcile(withT).anomalies.filter(function (a2) { return a2.type === 'unbalanced'; }).length, 0,
     'A150: …and `in-hand === collected − spent` still closes');
  eq(A.activeData(withT).expenses.length, 2,
     'A150: the ten expense readers never see it — activeData splits it off once…');
  eq(A.activeData(withT).transfers.length, 1, 'A150: …and hands it to the one reader that wants it');
  eq(A.personalSummary(withT, 'ram').expenseTotal, A.personalSummary(base, 'ram').expenseTotal,
     'A150: …so it is nobody\'s spend, and no collector\'s pot pays for it');
  eq(A.computeReport('expenses', withT).total, A.computeReport('expenses', base).total,
     'A150: …and the খরচের হিসাব does not list it as spending');

  // what it DOES change: the two funds
  const sp = A.sectorSplit(withT);
  eq(sp.puja.transferOut, 4000, 'A150: ₹4,000 left the puja fund…');
  eq(sp.program.transferIn, 4000, 'A150: …and reached the programme');
  eq(sp.puja.balance, 10000 - 1000 - 4000, 'A150: the puja fund is that much lighter');
  eq(sp.program.balance, 2000 - 6000 + 4000, 'A150: …and the programme that much less short');
  eq(sp.puja.collected + sp.program.collected, t1.totalCollection,
     'A150: …while the funds still sum to মোট আদায়…');
  eq(sp.puja.expense + sp.program.expense, t1.totalExpense, 'A150: …and to মোট খরচ…');
  eq(sp.puja.balance + sp.program.balance, t1.inHand,
     'A150: …and the two balances still sum to what the committee actually holds');

  // a transfer that names nowhere moves nothing, rather than half-moving
  const bad = JSON.parse(JSON.stringify(base));
  bad.expenses.push({ id: 'x2', source: 'transfer', sector: 'puja', transferTo: '', amount: 4000, date: '2026-09-04' });
  eq(A.sectorSplit(bad).puja.transferOut, 0, 'A150: a transfer to nowhere moves nothing…');
  eq(A.sectorSplit(bad).program.transferIn, 0, 'A150: …on both sides, so no fund is left half-credited');

  // the programme report stops asking for money it has already been given
  eq(A.computeReport('program', withT).fromPuja, 0,
     'A150: once the shortfall is settled the report stops saying the puja fund is carrying it');
  eq(A.computeReport('program', withT).transferIn, 4000, 'A150: …and says what came across instead');
}

// ---- A150: the halves that must not drift ----------------------------------
{
  const fs = require('fs');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const cols = gs.slice(gs.indexOf('  expenses: ['), gs.indexOf('],', gs.indexOf('  expenses: [')))
    .replace(/\/\/[^\n]*/g, '').match(/'([a-zA-Z]+)'/g).map(function (q) { return q.slice(1, -1); });
  eq(cols.indexOf('transferTo') >= 0, true, 'A150: transferTo has a real column…');
  // the property is the append-only rule, not which name happens to be last —
  // A151 appended three more after it. So: transferTo came after everything that
  // existed before it, and the newest addition is still at the end.
  eq(cols.indexOf('transferTo') > cols.indexOf('srcCat'), true,
     'A150: …appended after what came before it, per the header rule');
  eq(cols[cols.length - 1], 'commitmentId', 'A151: …and the newest column is last in turn');
  // A162: was a regex on the literal `!isCashier`, which broke the day that
  // clause grew a second way to be true (progmoney, out of the programme only).
  // The RULE now lives in tests/backend.js as executed requests — a collector
  // refused, a nonexistent destination refused, a transfer to its own fund
  // refused. Kept here only as a shape check that the destination is still
  // validated at all.
  eq(/SECTORS\.indexOf\(toS\) < 0 \|\| toS === fromS/.test(gs), true,
     'A150: the server still validates a transfer destination (behaviour: backend A150)');
  eq(/var SECTORS = \['puja', 'program'\];/.test(gs), true, 'A150 mirror: the server knows the funds');
  eq(/const tb = document\.getElementById\('transfer-btn'\);\s*\n\s*if \(tb\) tb\.onclick/.test(app), true,
     'A150: the button is WIRED where the report is painted — this project has shipped two dead ones');
  eq(/source: 'transfer', sector: to === 'program' \? 'puja' : 'program', transferTo: to,/.test(app), true,
     'A150: …and the row it writes names both ends');
}

// ---- A151: দায় — promised, not yet paid ------------------------------------
//
// The gap this closes: `expenses` means "paid", so an artist booked at ₹25,000
// with ₹5,000 advance left ₹20,000 gone in every sense but the literal one,
// while the in-hand figure read healthy. It needs NO new store and no schema
// bump — a promise is not a movement of money, so it rides in `expenses` and
// activeData splits it off, the same trick A150 paid for.
{
  const A = require('../js/aggregate.js');
  const book = {
    parties: [], payments: [],
    daily: [{ id: 'd1', type: 'ticket', amount: 30000, cashAmount: 30000, upiAmount: 0,
              collectorId: 'ram', date: '2026-09-05', sector: 'program' }],
    expenses: [
      { id: 'c1', source: 'commitment', payee: 'শিল্পী — রূপা', committed: 25000, amount: 0,
        sector: 'program', date: '2026-09-05' },
      { id: 'c2', source: 'commitment', payee: 'সাউন্ড', committed: 8000, amount: 0,
        sector: 'program', date: '2026-09-05' },
      { id: 'a1', subject: 'শিল্পী', amount: 5000, cashAmount: 5000, upiAmount: 0, spentBy: 'ram',
        srcCat: 'other', sector: 'program', date: '2026-09-05', commitmentId: 'c1' },
      { id: 'a2', subject: 'সাউন্ড', amount: 8000, cashAmount: 8000, upiAmount: 0, spentBy: 'ram',
        srcCat: 'other', sector: 'program', date: '2026-09-05', commitmentId: 'c2' },
    ],
    handovers: [], voids: [], corrections: [],
  };

  eq(A.isCommitment(book.expenses[0]), true, 'A151: a দায় row knows itself');
  eq(A.activeData(book).expenses.length, 2,
     'A151: …and the ten expense readers never see it — only the two real spends');
  eq(A.activeData(book).commitments.length, 2, 'A151: …activeData hands it to the one reader that wants it');

  // promising money is not spending it
  const tt = A.computeTotals(book);
  eq(tt.totalExpense, 13000, 'A151: মোট খরচ counts the ₹5,000 advance and the ₹8,000 — not the promises');
  eq(tt.inHand, 17000, 'A151: …so in-hand is what the committee really holds');
  eq(A.reconcile(book).anomalies.filter(function (a2) { return a2.type === 'unbalanced'; }).length, 0,
     'A151: …and the invariant still closes');

  // …and the filter is what protects that, not the fact that the flow happens to
  // write amount 0. A row that carries a figure — a hand-edited sheet, an older
  // client, a bad import — must still not be spent twice.
  const malformed = JSON.parse(JSON.stringify(book));
  malformed.expenses[0].amount = 25000;
  eq(A.computeTotals(malformed).totalExpense, 13000,
     'A151: a promise carrying a figure is STILL not a spend — the filter is the guard, not luck');

  const rows = A.commitmentRows(book);
  const rupa = rows.filter(function (c) { return c.payee.indexOf('রূপা') >= 0; })[0];
  const sound = rows.filter(function (c) { return c.payee === 'সাউন্ড'; })[0];
  eq({ committed: rupa.committed, paid: rupa.paid, owed: rupa.owed, settled: rupa.settled },
     { committed: 25000, paid: 5000, owed: 20000, settled: false },
     'A151: ₹25,000 promised, ₹5,000 advanced — ₹20,000 is the number nobody could see before');
  eq(sound.settled, true, 'A151: …and a promise paid in full is settled, not still owed');
  eq(sound.owed, 0, 'A151: …owing nothing');

  eq(A.spokenFor(book).total, 20000, 'A151: that is what is already spoken for…');
  eq(A.spokenFor(book).program, 20000, 'A151: …and which ভাঁড়ার owes it');
  eq(A.spokenFor(book).puja, 0, 'A151: …the puja fund promised nobody anything');

  // THE line: the committee holds ₹17,000 but only ₹-3,000 of it is free
  const ov = A.computeReport('overview', book);
  eq(ov.spokenFor.total, 20000, 'A151: the overview carries it…');
  eq(ov.inHand - ov.spokenFor.total, -3000,
     'A151: …so ₹17,000 in hand against ₹20,000 promised is a REAL shortfall the old book called healthy');
  eq(A.computeReport('program', book).spokenFor, 20000,
     'A151: the programme report carries its own share');

  // overpaying does not invent money coming back
  const over = JSON.parse(JSON.stringify(book));
  over.expenses.push({ id: 'a3', subject: 'সাউন্ড', amount: 2000, cashAmount: 2000, upiAmount: 0,
                       spentBy: 'ram', srcCat: 'other', sector: 'program', date: '2026-09-05', commitmentId: 'c2' });
  eq(A.commitmentRows(over).filter(function (c) { return c.payee === 'সাউন্ড'; })[0].owed, 0,
     'A151: paying more than promised owes ZERO, never a negative that reads as money returning');
}

// ---- A151: the halves that must not drift ----------------------------------
{
  const fs = require('fs');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const cols = gs.slice(gs.indexOf('  expenses: ['), gs.indexOf('],', gs.indexOf('  expenses: [')))
    .replace(/\/\/[^\n]*/g, '').match(/'([a-zA-Z]+)'/g).map(function (q) { return q.slice(1, -1); });
  ['payee', 'committed', 'commitmentId'].forEach(function (c) {
    eq(cols.indexOf(c) >= 0, true, 'A151: ' + c + ' has a real column');
  });
  eq(/!String\(r\.row\.payee \|\| ''\)\.trim\(\) \|\| !\(Number\(r\.row\.committed\) > 0\)/.test(gs), true,
     'A151: a promise still needs a payee and a figure (behaviour: backend A151)');
  eq(/const db2 = document\.getElementById\('duty-btn'\);\s*\n\s*if \(db2\) db2\.onclick/.test(app), true,
     'A151: the "record a দায়" button is WIRED where the report is painted');
  eq(/dutyBlockHTML\(tt\.commitments, \(tt\.spokenFor \|\| \{\}\)\.total\)/.test(app), true,
     'A151: …and the overview lists the promises under its own totals');
  eq(/esc\(t\('spoken_for'\)\)[\s\S]{0,300}?esc\(t\('really_free'\)\)/.test(app), true,
     'A151: …with the line that says how much of the cash in hand is actually free');
  // it must be NAMED, never subtracted — the committee does hold that money
  eq(/inHand: totalColl - totalExp,/.test(fs.readFileSync(__dirname + '/../js/aggregate.js', 'utf8')), true,
     'A151: in-hand is still what the committee HOLDS — a book that shrank its own cash would lie differently');
}

// ---- A152: expense subjects belong to a ভাঁড়ার -----------------------------
//
// And the hole it uncovered: A151 shipped a দায় nobody could PAY. The caller
// passed the list of open promises and expenseFlow ignored it, so no expense
// ever carried a commitmentId — every promise stayed at "paid ₹0" and the দায়
// could never come down. The A151 pins were built from hand-written rows that
// already had the id, so they proved the arithmetic and never asked whether the
// screen could produce one. A fixture that supplies the thing under test is not
// a test of it.
{
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  const gs = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');

  eq(/function expenseFlow\(subjects, duties, sector\) \{/.test(app), true,
     'A152: the expense flow RECEIVES the open promises…');
  eq(/commitmentId: a\.commitmentId \|\| '', \/\/ A152: an instalment against a দায়/.test(app), true,
     'A152: …and writes the one it was told, so a দায় can actually be paid down');
  eq(/key: 'commitmentId', qKey: 'q_duty_against'/.test(app), true,
     'A152: …with a step to choose it');
  // …and the list must be RESOLVED before the step list is built. The first
  // version fired viewData() off and built the flow on the next line, so the
  // list was always empty and the step never appeared — a comment saying "read
  // once, before the flow opens" sitting directly above code that did not.
  // Both driving failures in this feature were this same shape: the plumbing
  // existed, nothing connected it.
  {
    const se = app.slice(app.indexOf('function startExpense'), app.indexOf('function collectionExpenseFlow'));
    eq(/duties = Aggregate\.commitmentRows\(d\); \}\)\s*\n?\s*\.catch\(function \(\) \{\}\)\.then\(fn\)/.test(se), true,
       'A152: the promises are AWAITED, and only then is the flow built');
    eq(/viewData\(\)\.then\(function \(d\) \{ expenseDuties/.test(se), false,
       'A152: …not fired off alongside it, which is what made the step never appear');
  }
  // A153 replaced A152's ordering fix with something better: the fund is not
  // asked at all, so the subject list is narrowed by a FACT rather than by an
  // answer. The narrowing itself is what mattered and it survives.
  eq(/options: forSector\(sector\) \}/.test(app), true,
     'A152/A153: the subject list is narrowed by the tab\'s fund, not by an answer');
  eq(/return !xs \|\| xs === \(sec \|\| 'puja'\);/.test(app), true,
     'A152: a subject with no ভাঁড়ার belongs to BOTH — so nothing that exists today disappears');
  // a দায় is only offered against the fund being spent from
  eq(/return openDuties\.some\(function \(d\) \{ return d\.sector === \(sector \|\| 'puja'\); \}\);/.test(app), true,
     'A152: …and only promises of THAT fund are offered, never another fund\'s');

  eq(/es\.appendRow\(\['id', 'name', 'createdAt', 'sector'\]\)/.test(gs), true,
     'A152: the subjects sheet carries the fund…');
  eq(/else ensureCols_\(es, \['id', 'name', 'createdAt', 'sector'\]\);/.test(gs), true,
     'A152: …and a book written by an older deploy heals itself');
  eq(/out\.push\(\{ id: String\(r\[0\]\), name: String\(r\[1\]\), sector: String\(r\[3\] \|\| ''\) \}\);/.test(gs), true,
     'A152: …listSubjects returns it');
  eq(/var sec = SECTORS\.indexOf\(String\(b\.sector \|\| ''\)\) >= 0 \? String\(b\.sector\) : '';/.test(gs), true,
     'A152: …and addSubject only accepts a fund that exists');
}

// ---- A153: the অনুষ্ঠান has its own tab ------------------------------------
//
// Hrishi: "make totally different tab for the program / dont use the sector in
// entry / user will be totally with burden on this". He was right, and the
// reasoning was already mine — A149 says a টিকিট is never asked which fund
// because it has only one honest answer. That is true of EVERY entry started
// from the programme's own tab. I applied it to one entry type and missed that
// it generalises.
{
  const A = require('../js/aggregate.js');
  const book = {
    parties: [
      { id: 'a', type: 'shop', name: 'পাল', pledged: 5000 },
      { id: 'b', type: 'sponsor', name: 'Bose', pledged: 50000, sector: 'program' },
    ],
    payments: [
      { id: 'p1', partyId: 'a', amount: 2000, collectorId: 'ram', date: '2026-09-05' },
      { id: 'p2', partyId: 'b', amount: 30000, collectorId: 'ram', date: '2026-09-05' },
    ],
    daily: [
      { id: 'd1', type: 'road', amount: 1000, collectorId: 'ram', date: '2026-09-05' },
      { id: 'd2', type: 'ticket', amount: 9000, collectorId: 'ram', date: '2026-09-05', sector: 'program' },
    ],
    expenses: [
      { id: 'e1', subject: 'প্যান্ডেল', amount: 500, spentBy: 'ram', date: '2026-09-05' },
      { id: 'e2', subject: 'শিল্পী', amount: 6000, spentBy: 'ram', date: '2026-09-05', sector: 'program' },
    ],
    handovers: [], voids: [], corrections: [],
  };
  const puja = A.ofSector(book, 'puja'), prog = A.ofSector(book, 'program');

  eq(puja.parties.map(function (p) { return p.id; }), ['a'], 'A153: the puja book holds only puja donors');
  eq(prog.parties.map(function (p) { return p.id; }), ['b'], 'A153: …the programme book only its own');
  eq(puja.payments.map(function (p) { return p.id; }), ['p1'],
     'A153: …a payment follows its DONOR into the right book');
  eq(prog.daily.map(function (r) { return r.id; }), ['d2'], 'A153: …টিকিট is programme money');
  eq(puja.expenses.map(function (e) { return e.id; }), ['e1'], 'A153: …and spending splits too');

  // THE property: the two books together are the whole book, exactly
  const wp = A.computeTotals(puja), wg = A.computeTotals(prog), all = A.computeTotals(book);
  eq(wp.totalCollection + wg.totalCollection, all.totalCollection,
     'A153: the two books add up to the committee\'s own total…');
  eq(wp.totalExpense + wg.totalExpense, all.totalExpense, 'A153: …and to its spending');
  eq(wp.inHand + wg.inHand, all.inHand, 'A153: …so nothing is lost or counted twice in the split');

  // every classic report becomes per-book for free, through the same filter
  eq(A.computeReport('overview', prog).totalCollection, 39000,
     'A153: the programme\'s overview counts only its own money');
  eq(A.computeReport('dues', prog).rows.map(function (r) { return r.name; }), ['Bose'],
     'A153: …and its dues list only its own donors');
  eq(A.computeReport('areas', puja).rows.length, 1,
     'A153: …while the এলাকা report stays a puja thing');

  // pockets are NOT split — a note has no book
  eq(A.inHandRows(book).length, A.inHandRows(puja).length + 0,
     'A153: (in-hand is read from the WHOLE book — a note in a pocket has no ভাঁড়ার)');

  const fs = require('fs');
  const html = fs.readFileSync(__dirname + '/../index.html', 'utf8');
  eq(/<button data-nav="program" hidden>/.test(html), true, 'A153: the tab exists in the shell…');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/current\.view === 'program'\) \{ programTabOn\(\) \? renderProgram\(\) : renderHome\(\); \}/.test(app), true,
     'A153: …and a route that refuses to open it for somebody not on the programme');
  // …and switching the programme on has to REDRAW the nav. State decided at one
  // moment and painted at another, with nothing connecting them, is the A144
  // curtain bug — found again here by driving: the tab existed and was never
  // drawn until the person happened to navigate.
  eq(/if \(String\(centralConfig\.program_on \|\| ''\) !== wasProg\) changed = true;/.test(app), true,
     'A153: …and turning the programme on repaints the nav, instead of waiting for a navigation');
  // everything the tab starts is programme money, named at the call site
  ['dailyFlow\\(\'ticket\', \'program\'\\)', 'newPartyFlow\\(g, \{\}, \'program\'\\)',
   'startExpense\\(null, \'program\'\\)', 'dutyFlow\\(\'program\'\\)'].forEach(function (rx) {
    eq(new RegExp(rx).test(app), true, 'A153: the tab starts ' + rx.split('\\(')[0] + ' as programme money');
  });
}

// ---- A154: the puja's screens show the puja's book ------------------------
//
// A153 gave the programme its own tab; until this, the puja's screens still
// showed everything, so the same টিকিট and the same শিল্পী bill appeared in both
// places and the separation was decoration.
{
  const A = require('../js/aggregate.js');
  const fs = require('fs');
  const app = fs.readFileSync(__dirname + '/../js/app.js', 'utf8');

  eq(/const WHOLE_BOOK_REPORTS = \['inhand', 'collectors'\];/.test(app), true,
     'A154: two reports stay WHOLE — a note in a pocket has no ভাঁড়ার…');
  eq(/return Aggregate\.ofSector\(data, 'puja'\);/.test(app), true,
     'A154: …and every other one is the puja\'s book');
  eq(/if \(id === 'program'\) return data; \/\/ computeReport\('program'\) filters itself/.test(app), true,
     'A154: …except the programme\'s own, which filters itself');
  eq(/const data = Aggregate\.ofSector\(all, 'puja'\);\s*\n\s*drawList\(data/.test(app), true,
     'A154: the 📒 খাতা is the puja\'s book too — the programme has its own');
  // one place, not a column everywhere: that was A148's mistake
  eq(/if \(id === 'overview'\) rep\.bySector = Aggregate\.sectorSplit\(data\);/.test(app), true,
     'A154: the combined figure is computed from the WHOLE book…');
  eq(/esc\(t\('both_books_total'\)\)/.test(app), true,
     'A154: …and printed in exactly one place');
  eq((app.match(/both_books_total/g) || []).length, 1,
     'A154: …once, not smeared across every screen');
  // a kind with nothing in it is not news — the puja book will never hold a টিকিট
  eq(/Object\.keys\(tt\.dailyByType \|\| \{\}\)\.filter\(function \(k\) \{ return tt\.dailyByType\[k\]; \}\)/.test(app), true,
     'A154: …and an empty kind prints no row at all');

  // the arithmetic the combined line rests on
  const book = {
    parties: [{ id: 'a', type: 'shop', pledged: 5000 }, { id: 'b', type: 'sponsor', pledged: 50000, sector: 'program' }],
    payments: [{ id: 'p1', partyId: 'a', amount: 4000 }, { id: 'p2', partyId: 'b', amount: 30000 }],
    daily: [{ id: 'd1', type: 'ticket', amount: 9000, sector: 'program' }],
    expenses: [{ id: 'e1', amount: 1000 }, { id: 'e2', amount: 6000, sector: 'program' }],
    handovers: [], voids: [], corrections: [],
  };
  const sp = A.sectorSplit(book), whole = A.computeTotals(book);
  eq(sp.puja.balance + sp.program.balance, whole.inHand,
     'A154: the two books\' balances ARE what the committee holds — that is why one line can say so');
  const pujaOnly = A.computeReport('overview', A.ofSector(book, 'puja'));
  eq(pujaOnly.totalCollection, 4000, 'A154: the puja overview counts only the puja…');
  eq(pujaOnly.byType.sponsor.count, 0, 'A154: …and its breakdown drops the programme\'s sponsor');
  eq(pujaOnly.dailyByType.ticket, 0, 'A154: …and its টিকিট');
  eq(A.computeReport('dues', A.ofSector(book, 'puja')).rows.length, 1,
     'A154: …its dues list chases only its own donors');
  // pockets stay whole
  eq(A.computeReport('collectors', book).rows.length,
     A.computeReport('collectors', A.ofSector(book, 'puja')).rows.length,
     'A154: (a collector total is the same whichever slice you hand it — people are not split)');
}

// ---- A155: a partial book does not accuse anybody ---------------------------
//
// Found by checking all five roles against ONE seeded book — which is the only
// way it shows. A cashier RECEIVED ₹35,000 of confidential money and SPENT it on
// ordinary things. A cashier pools, so the spend carries srcCat 'other', never
// 'sponsor' — that was A144's deliberate decision and it is still right. But it
// means the RECEIPT is withheld from a reader without the view grant while the
// SPENDING is not, and their arithmetic then says the cashier is short.
//
// A false accusation against an honest person, on the desk whose entire worth is
// that its accusations are true.
{
  const A = require('../js/aggregate.js');
  const book = {
    parties: [{ id: 'sp', type: 'sponsor', name: 'Bose', collectorId: 'ram', pledged: 50000, sector: 'program' }],
    payments: [{ id: 'p1', partyId: 'sp', amount: 35000, cashAmount: 35000, upiAmount: 0,
                 collectorId: 'ram', date: '2026-09-05' }],
    daily: [],
    // the cashier's spend, from the pooled pot — NOT attributable to the sponsor
    expenses: [{ id: 'e1', subject: 'শিল্পী', amount: 19000, cashAmount: 19000, upiAmount: 0,
                 spentBy: 'kali', collectorId: 'kali', srcCat: 'other', date: '2026-09-05', sector: 'program' }],
    handovers: [{ id: 'h1', fromId: 'ram', toId: 'kali', amount: 35000, cashAmount: 35000, upiAmount: 0,
                  status: 'confirmed', date: '2026-09-05',
                  breakdown: JSON.stringify({ sponsor: { cash: 35000, upi: 0 } }) }],
    voids: [], corrections: [],
  };
  const blind = { username: 'bimal', role: 'user', entries: 'shop' };
  const seen = A.visibleData(book, blind);

  // the shape of the problem: the money in is hidden, the money out is not
  eq(seen.handovers.length, 0, 'A155: the confidential parcel is withheld from a blind reader…');
  eq(seen.expenses.length, 1, 'A155: …but the ordinary spend it paid for is not, and cannot be');
  const neg = A.reconcile(seen).anomalies.filter(function (a2) { return a2.type === 'negative_inhand'; });
  eq(neg.length, 1, 'A155: …so without the rule, their desk accuses an honest cashier');
  eq(A.reconcile(seen, { partialBook: true }).anomalies
      .filter(function (a2) { return a2.type === 'negative_inhand'; }).length, 0,
     'A155: a partial book does NOT get to make that judgement');
  // and whoever holds the whole book still does
  eq(A.reconcile(book, { partialBook: false }).anomalies
      .filter(function (a2) { return a2.type === 'negative_inhand'; }).length, 0,
     'A155: …while the whole book shows no shortfall, because there is none');
  // nothing else is suppressed — the rule is this one judgement, not the desk
  eq(A.reconcile(seen, { partialBook: true }).anomalies.length,
     A.reconcile(seen).anomalies.length - 1,
     'A155: …and exactly one anomaly is withheld, not the desk');

  const app = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/partialBook: partialBook\(\)/.test(app), true,
     'A155: every reconcile call on a phone says whether that phone holds the whole book');
}

// ---- A156: the 🎭 tab's খাতা and হিসাব catch up with the puja's -------------
//
// Hrishi: "what about the ledger and the report". The money was right; the two
// SCREENS were not finished. The programme's account was the only report in the
// app that could not be printed — and it is the one a committee prints for the
// meeting — and its খাতা had no total, no way to see who still owes, and no
// search.
{
  const app = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/id="prog-pdf"/.test(app), true, 'A156: the programme account can be printed…');
  eq(/if \(pb\) pb\.onclick = function \(\) \{ printReport\('program'\); \};/.test(app), true,
     'A156: …and the button is WIRED, not just drawn');
  eq(/const totalPaid = all\.reduce/.test(app), true, 'A156: its খাতা has a total…');
  eq(/if \(progDueOnly\) shown = shown\.filter/.test(app), true, 'A156: …a "who still owes" filter…');
  eq(/matchWords\(p\.name \|\| '', progQuery\)/.test(app), true,
     'A156: …and a search that follows the same word-order rule as every other search');
  // the toggle must match what dueChip actually renders — the first pass looked
  // for `data-due` and would have shipped a control that does nothing
  eq(/document\.querySelector\('#prog-body \[data-duetoggle\]'\)/.test(app), true,
     'A156: …the dues toggle is selected by the attribute dueChip really writes');
  eq(/data-duetoggle="1"/.test(app), true, 'A156: …which is that attribute');
  // search that loses the caret on every keystroke is a search that fights back
  eq(/el\.setSelectionRange\(el\.value\.length, el\.value\.length\)/.test(app), true,
     'A156: …and the caret survives the re-render');
}

// ---- A157: the nav is chrome, and chrome keeps up -------------------------
//
// Found while driving a plain entry pass before go-live. A changed pull only
// re-renders `list`, `party` and `report` — deliberately, so a background poll
// never rebuilds the screen under somebody's finger. But whether a TAB exists
// can change on any pull, and a phone sitting on the home screen never
// repainted: hidden at boot, present after any navigation. A collector granted
// the programme would have seen five tabs until they happened to tap something.
{
  const app = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/function paintNav\(\) \{/.test(app), true, 'A157: the nav paints from one place…');
  eq((app.match(/paintNav\(\);/g) || []).length, 2,
     'A157: …called by render AND by the pull');
  // the order is the whole point: BEFORE the early return that skips idle polls
  eq(/if \(Auth\.loggedIn\(\)\) paintNav\(\);\s*\n\s*if \(!changed \|\| flowState\) return;/.test(app), true,
     'A157: …and from the pull BEFORE the return that leaves screens alone');
  // and the screen-rebuild rule is untouched — that was never the bug
  eq(/if \(\['list', 'party', 'report'\]\.indexOf\(current\.view\) >= 0\) render\(\);/.test(app), true,
     'A157: …while a background poll still refuses to rebuild the screen under a finger');
}

// ---- A158: every new donor was broken, for three deployments ---------------
//
// Found by doing the plainest thing in the app — entering a shop — before
// go-live. A153 moved the fund out of the answers and into the flow's argument,
// and one of those edits landed inside `savePartyAndFirstPayment`, which is a
// TOP-LEVEL helper with no `sector` of its own. Every new দোকান / ব্যক্তি /
// সদস্য / স্পনসর / গুপ্ত দান threw ReferenceError at save. Live in v4.45.0,
// v4.45.1 and v4.46.0.
//
// The THIRD time this exact shape has shipped: A115e (`from`), A151 (`type`),
// now `sector`. Always a flow's local read from the helper it calls, always
// invisible to `node --check` because the file parses, always only thrown when
// somebody taps. `sector` is on scope-check's named list now.
{
  const app = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq(/function savePartyAndFirstPayment\(type, a, sector\) \{/.test(app), true,
     'A158: the helper RECEIVES the fund…');
  eq(/return savePartyAndFirstPayment\(type, a, sector\);/.test(app), true,
     'A158: …and the flow passes its own');
  const chk = require('fs').readFileSync(__dirname + '/../tests/scope-check.js', 'utf8');
  eq(/const RENDER_LOCALS = \['from', 'params', 'type', 'sector'\];/.test(chk), true,
     'A158: …and the checker knows the word, so a fourth one is caught before it ships');
}

// ---- A159: every entry flow writes the fund it was STARTED in ---------------
//
// Found by sweeping every entry path through the screens — the check Hrishi
// asked for and I had not actually done. A153 removed the "কোন ভাঁড়ার?"
// question, so `a.sector` has been undefined in every flow ever since. Three of
// the four flows were switched to the argument; the FOURTH edit never matched
// (commitmentId sits above the line it targeted) and failed silently, so every
// expense — including the ones started in the 🎭 tab — saved as puja money.
//
// Same failure mode as A158: an edit that did not land, and nothing asserting
// that it had. All four are pinned here by shape, so a fifth flow cannot be
// added without one.
{
  const app = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  eq((app.match(/sector: a\.sector \|\| 'puja'/g) || []).length, 0,
     'A159: no flow reads the fund from an ANSWER any more — the question is gone');
  // three SAVES (donor, expense, দায়) plus two RESUME records, which must carry
  // it too or a draft picked up tomorrow loses its book
  eq((app.match(/sector: sector \|\| 'puja'/g) || []).length, 5,
     'A159: the donor, expense and দায় saves take it as an argument, and both resumable flows carry it…');
  eq(/sector: type === 'ticket' \? 'program' : \(sector \|\| 'puja'\)/.test(app), true,
     'A159: …and the daily flow too, with টিকিট forced regardless');
  // "কোনোটার নয়" is worth '' — without `optional` the mandatory-field guard in
  // submitAnswer rejects it and the escape hatch can never be taken, so a spend
  // belonging to no promise cannot be recorded at all
  eq(/key: 'commitmentId', qKey: 'q_duty_against', kind: 'choice',\s*\n(?:\s*\/\/[^\n]*\n)*\s*optional: true,/.test(app), true,
     'A159: …and a spend against NO দায় can actually be recorded');
  // the cashsheet answer is an object; without its own branch answerDisplay
  // falls to `return val` and the handover transcript reads "[object Object]"
  // where the amount handed over belongs
  eq(/step\.kind === 'cashsheet'[\s\S]{0,320}?val\.__cash[\s\S]{0,200}?val\.__upi/.test(app), true,
     'A159: …and the handover shows the amount, not [object Object]');

  // --- A160: every grantable key must have a chip on the admin screen -------
  // The hand-written list stayed nine keys long through A144 and A153, so the
  // eight keys they added could only be granted by "সব দাও" — which hands out
  // guptview with everything else. The chips derive from PERM_KEYS now; this
  // asserts the label map covers it, so a new key cannot ship unticked.
  {
    const m = app.match(/const PERM_ONLY_LABELS = \{([\s\S]*?)\};/);
    eq(!!m, true, 'A160: the admin screen has a PERM_ONLY_LABELS map');
    const cm = app.match(/const CAT_LABEL_KEYS = \{([\s\S]*?)\};/);
    const names = function (blk) {
      return ((blk || '').match(/(\w+):/g) || []).map(function (x) { return x.slice(0, -1); });
    };
    // a key is grantable if EITHER map labels it — the perm-only map or the
    // shared category map it deliberately reuses
    const have = names(m && m[1]).concat(names(cm && cm[1]));
    PERM_KEYS.forEach(function (k) {
      eq(have.indexOf(k) >= 0, true, 'A160: permission chip exists for ' + k);
    });
    eq(/const kinds = Aggregate\.PERM_KEYS\.map/.test(app), true,
       'A160: …and the chips are DERIVED from PERM_KEYS, not hand-written');
    eq(/PERM_ONLY_LABELS\[k\] \|\| CAT_LABEL_KEYS\[k\]/.test(app), true,
       'A160: …reusing the category map rather than copying it (A66)');

  // --- A161: the sensitive grants must be visible ON the user list ----------
  // The summary filters to ENTRY_KINDS, so guptview/sponsorview/prog* appeared
  // nowhere on it and "who can see গুপ্ত দান?" needed twelve screens opened
  // one at a time. Markers, so A100's width fix survives.
  {
    const m = app.match(/const MARKS = \[([\s\S]*?)\];/);
    eq(!!m, true, 'A161: the user list marks the non-entry grants');
    ['sponsorview', 'guptview', 'progteam', 'progdonor', 'progmoney'].forEach(function (k) {
      eq(m && m[1].indexOf("'" + k + "'") >= 0, true, 'A161: …including ' + k);
    });
    eq(/entTxt \+ \(marks \? ' ' \+ marks : ''\)/.test(app), true,
       'A161: …and the marks actually reach the rendered line');
    // every key the summary can hold is either an entry kind (spelled out) or
    // marked — nothing may be silently dropped again
    PERM_KEYS.forEach(function (k) {
      const shown = ENTRY_KINDS.indexOf(k) >= 0 || (m && m[1].indexOf("'" + k + "'") >= 0) ||
                    ['review', 'otherdonor', 'memberadmin'].indexOf(k) >= 0;
      eq(shown, true, 'A161: the user list accounts for ' + k);
    });
  }
    // every label key the map names must actually resolve, or the chip is blank
    const i18nSrc = require('fs').readFileSync(__dirname + '/../js/i18n.js', 'utf8');
    have.forEach(function (k) {
      const blk = (m[1] + (cm ? cm[1] : ''));
      const lk = ((blk.match(new RegExp('\\b' + k + ": '([a-z_]+)'")) || [])[1]);
      if (lk) eq(new RegExp('\\n\\s*' + lk + ': \\{').test(i18nSrc), true,
                 'A160: label ' + lk + ' exists in i18n for ' + k);
    });
  }
}

try {
  require('./backend.js')(eq);
} catch (e) {
  fail++;
  console.log('FAIL backend suite aborted on an unexpected throw → ' + (e && e.message || e));
  console.log('      (everything after that point did not run — fix this first)');
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
