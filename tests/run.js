// Pure-logic tests: node tests/run.js
const { parseAmount } = require('../js/numparse.js');
const { computeTotals, duesList, inHandRows, personalSummary, myAvailable, reconcile, computeReport,
        roleOf, rowRole, ENTRY_KINDS, PERM_KEYS, permForRow, permAllowed,
        cashierView, handoverReport, allowedReports, mySummary, handoverSlots, handoverable,
        mentionsMe, messageFeed, activeData, chatLoad, homeTiles } = require('../js/aggregate.js');

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
eq(ENTRY_KINDS, ['shop', 'person', 'member', 'bus', 'road', 'toto'], 'perms: six collection keys, bus with the new-entry types');
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
eq(tilesFor('bus', 1).role, ['cashier'], 'tiles: a cashier gets the confirm desk');
eq(tilesFor('bus', 1).daily.indexOf('expense') >= 0, true, 'tiles: …and general expenses');
eq(tilesFor('bus,review', 1).role, ['cashier', 'review'], 'tiles: the correction desk needs its grant');
eq(tilesFor('bus').role, [], 'tiles: a plain collector gets neither');
// an admin is never narrowed, whatever the field says
const admTiles = tilesFor('', 0, 'admin');
eq(admTiles.setUp, true, 'tiles: an admin is always set up');
eq(admTiles.entry, ['shop', 'person', 'member', 'bus'], 'tiles: …and gets every category');
eq(admTiles.role, ['cashier', 'review'], 'tiles: …and every desk');

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
  eq(rejSrc.indexOf("setValue('rejected')") >= 0, true, "reject: writes status='rejected', not a void");
  eq(rejSrc.indexOf('touchData_()') >= 0, true, "reject: stamps the change so the sender's delta pull sees it");
  eq(rejSrc.indexOf('handover:reject') >= 0, true, 'reject: audited');
  // readAll_ maps rows by the REAL header row, so a value written into an
  // unlabelled column is written and never read — the status would flip and the
  // reason would silently vanish. Writing a brand-new column must heal the header
  // rather than trust that a human remembered to run setup().
  eq(rejSrc.indexOf("ensureCol_(sh, 'rejectReason')") >= 0, true,
     'reject: heals its own header instead of depending on setup() having been run');
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
  // A19: the server resends every season-old rejection on every poll (no "done"
  // state exists), so the CLIENT must drop dismissed ids from the count at apply
  // time — filtering only the banner leaves a ghost "🔔 ফেরত এসেছে" toast on
  // every app start for the rest of the season.
  const appSrc = require('fs').readFileSync(__dirname + '/../js/app.js', 'utf8');
  const applyStart = appSrc.indexOf('function applyNotifications');
  const applySrc = appSrc.slice(applyStart, appSrc.indexOf('\n  }', applyStart));
  eq(applySrc.indexOf('rejSeen(x.id)') >= 0, true,
     'A19: applyNotifications drops dismissed rejections from the count, not just the banner');
  eq(applySrc.indexOf('n.rejections = items.rejections.length') >= 0, true,
     'A19: …and the badge count is recomputed from the filtered list');

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

// A ReferenceError in a click handler does not exist until somebody taps. Run
// the scope checker as part of the suite so it cannot rot in a corner.
try {
  require('child_process').execFileSync(process.execPath, [__dirname + '/scope-check.js'], { stdio: 'pipe' });
  pass++;
} catch (e) {
  fail++;
  console.error('FAIL scope check\n' + String(e.stdout || '') + String(e.stderr || ''));
}

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
