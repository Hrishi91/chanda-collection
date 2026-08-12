// A99: a local stand-in for the deployed Apps Script, so the admin screens can
// be LOOKED AT without Hrishi's live sheet. Serves the app's static files and
// answers its POSTs by running the REAL apps-script/Code.gs through the same
// shim the suite uses (tests/gas-shim.js). Nothing here touches the live book.
//
//   node scripts/admin-harness.js 9060      -> http://localhost:9060
//   log in as  hrishi / secret0
//
// Use a FRESH PORT every time you change a file. The service worker caches the
// app shell aggressively and will happily serve you the code you just edited
// away - that has cost this project a false 'verified' more than once.
//
// Seeded to look like the puja will: 12 collectors, committee posts, four
// areas, two cashiers, one stood down, one blocked, one waiting for approval,
// and money in several hands. That last part is the point - the bug this was
// written to find (A99) was invisible on an empty book.
'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const ROOT = require('path').join(__dirname, '..');
const { loadBackend } = require(ROOT + '/tests/gas-shim.js');

const b = loadBackend();
b.api.setup();

const NAMES = [
  ['hrishi', 'হৃষিকেশ মাহাতো', '9876543210'],
  ['kali', 'কালী দাস', '9876543211'],
  ['bimal', 'বিমল চন্দ্র সরকার', '9876543212'],
  ['ratan', 'রতন কুমার মণ্ডল', '9876543213'],
  ['subrata', 'সুব্রত ঘোষ', '9876543214'],
  ['tapan', 'তপন সাহা', '9876543215'],
  ['nimai', 'নিমাই বর্মন', '9876543216'],
  ['gopal', 'গোপাল চন্দ্র রায়', '9876543217'],
  ['sanjay', 'সঞ্জয় প্রামাণিক', '9876543218'],
  ['dipak', 'দীপক কুমার দাস', '9876543219'],
  ['manik', 'মানিক সরকার', '9876543220'],
  ['amal', 'অমল কৃষ্ণ বসাক', '9876543221'],
];
NAMES.forEach(function (u, i) {
  b.post('register', { username: u[0], name: u[1], password: 'secret' + i, phone: u[2] });
});
const admin = b.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
const rowOf = function (u) { return b.rows('Users').filter(function (x) { return x.username === u; })[0]; };

// everyone but the last two gets approved for the year; those two stay pending,
// which is what the admin screen is for
NAMES.slice(1, 10).forEach(function (u) {
  const r = rowOf(u[0]);
  b.call('setStatus', { token: admin, userId: r.id, status: 'approved' });
  b.call('approveYear', { token: admin, userId: r.id, year: 2026 });
  b.call('setEntries', { token: admin, userId: r.id, entries: ['shop', 'person', 'road', 'toto'] });
  b.call('setAreas', { token: admin, userId: r.id, areas: ['main_malda', 'harirampur'] });
});
// two cashiers, one blocked account, one stood down
b.call('setCashier', { token: admin, userId: rowOf('bimal').id, cashier: 1 });
b.call('setCashier', { token: admin, userId: rowOf('kali').id, cashier: 1 });
b.call('setStatus', { token: admin, userId: rowOf('manik').id, status: 'approved' });
b.call('approveYear', { token: admin, userId: rowOf('manik').id, year: 2026 });
b.call('setStatus', { token: admin, userId: rowOf('manik').id, status: 'blocked' });
try { b.call('setAccess', { token: admin, userId: rowOf('dipak').id, access: 'exiting' }); } catch (e) {}
// committee posts, so the position row on each card has something to say
try {
  b.call('setPosition', { token: admin, userId: rowOf('kali').id, position: 'treasurer' });
  b.call('setPosition', { token: admin, userId: rowOf('ratan').id, position: 'secretary' });
} catch (e) {}

// money in several hands: shops, payments and daily collections per collector
let seq = 0;
const push = function (tok, rows) { return b.call('push', { token: tok, records: rows, year: 2026 }); };
NAMES.slice(1, 10).forEach(function (u, i) {
  const tok = b.call('login', { username: u[0], password: 'secret' + (i + 1), year: 2026 }).token;
  const rows = [];
  for (let k = 0; k < 4; k++) {
    const pid = 'p-' + (++seq);
    rows.push({ store: 'parties', row: { id: pid, type: 'shop', name: u[1].split(' ')[0] + ' স্টোর্স ' + (k + 1),
      owner: u[1], side: 'main_malda', pledged: 2000, year: 2026, date: '2026-08-10' } });
    rows.push({ store: 'payments', row: { id: 'pay-' + (++seq), partyId: pid, amount: 500 + k * 100,
      mode: 'cash', year: 2026, date: '2026-08-10' } });
  }
  rows.push({ store: 'daily', row: { id: 'd-' + (++seq), type: 'road', amount: 1200, year: 2026, date: '2026-08-11' } });
  try { push(tok, rows); } catch (e) { console.error('seed push failed for ' + u[0] + ': ' + e.message); }
});
console.log('seeded: ' + b.rows('Users').length + ' users, ' +
            b.rows('Parties').length + ' parties, ' + b.rows('Payments').length + ' payments');


// A101 repro: make this look like a book created before the areas were seeded —
// the rows gone and the marker never written. The screen must fill itself.
(function () {
  var g = b.env._sheets.Lists._grid;
  for (var i = g.length - 1; i >= 1; i--) if (String(g[i][1]) === 'area') g.splice(i, 1);
  var c = b.env._sheets.Config._grid;
  for (var j = c.length - 1; j >= 1; j--) if (String(c[j][0]) === 'lists_seeded') c.splice(j, 1);
  // and enough expense subjects to bring the search box out (it appears at 8)
  var subs = ['প্যান্ডেল', 'আলো', 'ঢাক', 'পুরোহিত', 'ফুল', 'প্রসাদ', 'মাইক', 'বিসর্জন', 'ছাপা', 'বিদ্যুৎ'];
  var admTok = b.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
  subs.forEach(function (n) { try { b.call('addSubject', { token: admTok, name: n }); } catch (e) {} });
  console.log('A101 repro: areas removed, marker cleared, ' + subs.length + ' subjects added');
})();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
               '.json': 'application/json', '.png': 'image/png', '.webmanifest': 'application/manifest+json' };

const PORT = Number(process.argv[2]) || 9050;
http.createServer(function (req, res) {  if (req.method === 'POST') {
    let body = '';
    req.on('data', function (c) { body += c; });
    req.on('end', function () {
      let out;
      try { out = b.api.doPost({ postData: { contents: body } }).getContent(); }
      catch (e) { out = JSON.stringify({ ok: false, error: String(e && e.message || e) }); }
      res.writeHead(200, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
      res.end(out);
    });
    return;
  }
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404); res.end('not found'); return;
  }
  
// A101 repro: make this look like a book created before the areas were seeded —
// the rows gone and the marker never written. The screen must fill itself.
(function () {
  var g = b.env._sheets.Lists._grid;
  for (var i = g.length - 1; i >= 1; i--) if (String(g[i][1]) === 'area') g.splice(i, 1);
  var c = b.env._sheets.Config._grid;
  for (var j = c.length - 1; j >= 1; j--) if (String(c[j][0]) === 'lists_seeded') c.splice(j, 1);
  // and enough expense subjects to bring the search box out (it appears at 8)
  var subs = ['প্যান্ডেল', 'আলো', 'ঢাক', 'পুরোহিত', 'ফুল', 'প্রসাদ', 'মাইক', 'বিসর্জন', 'ছাপা', 'বিদ্যুৎ'];
  var admTok = b.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
  subs.forEach(function (n) { try { b.call('addSubject', { token: admTok, name: n }); } catch (e) {} });
  console.log('A101 repro: areas removed, marker cleared, ' + subs.length + ' subjects added');
})();

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
                 '.json': 'application/json', '.png': 'image/png',
                 '.webmanifest': 'application/manifest+json' };
  res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
                       'Cache-Control': 'no-store' });
  res.end(fs.readFileSync(file));
}).listen(PORT, function () { console.log('admin stub on http://localhost:' + PORT); });
