// Pure-logic tests: node tests/run.js
const { parseAmount } = require('../js/numparse.js');
const { computeTotals, duesList, handoverSummary } = require('../js/aggregate.js');

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
  handovers: [
    { from: 'X', to: 'Cash Babu', amount: 600, status: 'confirmed' },
    { from: 'X', to: 'Cash Babu', amount: 200, status: 'pending' },
  ],
};
const hs = handoverSummary(hoData);
const hx = hs.find(function (r) { return r.collector === 'X'; });
const hy = hs.find(function (r) { return r.collector === 'Y'; });
eq(hx.collected, 1000, 'handover: X collected');
eq(hx.handedOver, 600, 'handover: X confirmed handover only');
eq(hx.pending, 200, 'handover: X pending shown separately');
eq(hx.inHand, 400, 'handover: X in hand ignores pending');
eq(hy.inHand, 400, 'handover: Y never handed over');
eq(hs[0].collector, hs[0].inHand >= hs[1].inHand ? hs[0].collector : hs[1].collector, 'handover: sorted by in-hand desc');

const dues = duesList(parties, payments);
eq(dues.length, 2, 'dues count (p2 600, p3 300; p1 cleared)');
eq(dues[0].party.id, 'p2', 'biggest due first');
eq(dues[0].due, 600, 'p2 due');
eq(dues[1].due, 300, 'p3 due');

console.log(pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
