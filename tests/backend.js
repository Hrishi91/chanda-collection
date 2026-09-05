// A65 (audit 2.17): the backend's 47 request actions, EXECUTED.
//
// Until now every server assertion in this suite was a regex over Code.gs.
// That can say "this text is present"; it can never say "this request does the
// right thing". A9 — identity taken from the payload instead of the token —
// could be reintroduced tomorrow with the matched string still in place and
// the whole suite would stay green. Everything below sends a real request
// through the real handler and reads the real sheet afterwards.
//
// Each case names the failure it is standing guard over, not the code it
// touches, so a rewrite that keeps the behaviour keeps the test.
'use strict';
const { loadBackend } = require('./gas-shim.js');

const SHEET_TITLE = { parties: 'Parties', payments: 'Payments', daily: 'DailyCollections',
                      expenses: 'Expenses', handovers: 'Handovers', voids: 'Voids',
                      corrections: 'Corrections', messages: 'Messages' };

module.exports = function runBackendTests(eq) {
  // A fresh book with an admin, a cashier and two collectors — the smallest
  // cast that can express every rule this file is about.
  function book() {
    const b = loadBackend();
    b.api.setup();
    b.post('register', { username: 'hrishi', name: 'হৃষিকেশ', password: 'secret1', phone: '9876543210' });
    ['ratan', 'bimal', 'kali'].forEach(function (u, i) {
      b.post('register', { username: u, name: u.toUpperCase(), password: 'secret' + i, phone: '98765432' + (20 + i) });
    });
    const admin = b.call('login', { username: 'hrishi', password: 'secret1', year: 2026 }).token;
    ['ratan', 'bimal', 'kali'].forEach(function (u) {
      const row = b.rows('Users').filter(function (x) { return x.username === u; })[0];
      b.call('setStatus', { token: admin, userId: row.id, status: 'approved' });
      b.call('approveYear', { token: admin, userId: row.id, year: 2026 });
      b.call('setEntries', { token: admin, userId: row.id, entries: ['shop', 'person', 'member', 'road', 'toto', 'bus'] });
    });
    const bimalRow = b.rows('Users').filter(function (x) { return x.username === 'bimal'; })[0];
    b.call('setCashier', { token: admin, userId: bimalRow.id, cashier: 1 });
    const tok = { admin: admin };
    ['ratan', 'bimal', 'kali'].forEach(function (u, i) {
      tok[u] = b.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    return { b: b, tok: tok };
  }
  const rec = (store, row) => ({ store: store, row: row });

  // ---- A9: identity comes from the TOKEN, never the payload ----------------
  // The single most expensive bug this project has had: a phone could file its
  // collection under somebody else's name, and every in-hand figure downstream
  // was then wrong about who owed what.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 1000,
                       collector: 'হৃষিকেশ', collectorId: 'hrishi', collectorRole: 'admin' }),
    ] });
    const p = b.rows('Parties')[0];
    eq(p.collectorId, 'ratan', 'backend A9: a row claiming another user is filed under the TOKEN holder');
    eq(p.collector, 'RATAN', 'backend A9: …display name too');
    eq(p.collectorRole, 'collector', 'backend A9: …and the role, in the entry vocabulary, not the Users word');
  }

  // ---- 0.6 / A51: a forged handover cannot arrive already confirmed --------
  // handovers fall through every branch of the push gate by design (handing
  // your own money over needs no grant), so this was the one store where a
  // hand-written row was written verbatim: the sender's in-hand drops and the
  // named recipient's rises for money they never saw, with no notification,
  // no audit line, and reconcile still balancing.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('handovers', { id: 'h1', year: 2026, from: 'KALI', fromId: 'kali', to: 'BIMAL', toId: 'bimal',
                         amount: 5000, cashAmount: 5000, upiAmount: 0, status: 'confirmed',
                         confirmedBy: 'BIMAL', confirmedAt: '2026-07-01T00:00:00Z' }),
    ] });
    const h = b.rows('Handovers')[0];
    eq(h.status, 'pending', 'backend 0.6: a handover pushed as confirmed is stamped back to pending');
    eq(h.confirmedBy, '', 'backend 0.6: …and the forged acknowledgement is cleared');
    eq(h.fromId, 'ratan', 'backend 0.6: …and it is from whoever holds the token, not whoever the payload named');
  }

  // ---- A73 (audit #5 V2): 0.6 on the ADMIN path too ----------------------
  // The blanking sat 30 lines BELOW the admin-reassign branch's early `return`,
  // so it ran on the collector path and not on the one directly above it. The
  // acceptance said "on EVERY code path that inserts"; it was true of one of
  // two, and only the true one had a test.
  {
    const { b, tok } = book();
    const res = b.call('push', { token: tok.admin, epoch: '', records: [
      rec('handovers', { id: 'h1', year: 2026, to: 'X', toId: 'x', amount: 5000,
                         cashAmount: 5000, upiAmount: 0, status: 'confirmed',
                         confirmedBy: 'FORGED', confirmedAt: '2026-07-01T00:00:00Z',
                         collectorId: 'ratan' }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 500, cashAmount: 500,
                        upiAmount: 0, date: '2026-08-01', collectorId: 'ratan' }),
    ] });
    const h = b.rows('Handovers')[0], p = b.rows('Payments')[0];
    eq(h.status, 'pending', 'A73/V2: an admin-reassigned handover is blanked back to pending too');
    eq(h.confirmedBy, '', 'A73/V2: …and the forged acknowledgement is cleared on this path as well');
    eq(h.collectorId, 'ratan', 'A73/V2: …while the reassignment itself still works, which is the point of the branch');
    // and the two consequences that fell out of the same early return
    eq(!!p.receiptNo, true,
       'A73/V2: a reassigned payment gets the serial reserveReceiptNos_ had already burned for it');
    eq(res.receipts.p1, p.receiptNo, 'A73/V2: …and it is handed back, so the counter cannot gap silently');
  }

  // ---- 0.5 / A53: a stale epoch is refused --------------------------------
  // goLive and restoreBackup bump the epoch. A phone that slept through it
  // would otherwise replay training money into the live book.
  {
    const { b, tok } = book();
    // set the way the app really sets it: goLive bumps data_epoch, which is
    // exactly the moment a sleeping phone's queue becomes stale
    b.api.setConfig_('data_epoch', '12345');
    let threw = '';
    try {
      b.call('push', { token: tok.ratan, epoch: '999', records: [
        rec('daily', { id: 'd1', year: 2026, type: 'road', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-08-01' }),
      ] });
    } catch (e) { threw = String(e.message || e); }
    eq(threw, 'stale-epoch', 'backend 0.5: a push carrying an old epoch is refused…');
    eq(b.rows('DailyCollections').length, 0, 'backend 0.5: …and nothing is written');
    const ok = b.call('push', { token: tok.ratan, epoch: '12345', records: [
      rec('daily', { id: 'd1', year: 2026, type: 'road', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-08-01' }),
    ] });
    eq(ok.savedIds.length, 1, 'backend 0.5: …while the current epoch goes through');
  }

  // ---- 0.3 / A50: the delta cursor never advances past unreturned rows -----
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('daily', { id: 'd1', year: 2026, type: 'road', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-08-01' }),
    ] });
    const full = b.call('pull', { token: tok.ratan, year: 2026 });
    eq((full.data.daily || []).length, 1, 'backend 0.3: a full pull returns the row');
    const delta = b.call('pull', { token: tok.ratan, year: 2026, since: full.cursor });
    eq((delta.data.daily || []).length, 0, 'backend 0.3: …and the delta from its own cursor returns nothing new');
    b.env._setNow(b.env._now() + 60000);
    b.call('push', { token: tok.bimal, epoch: '', records: [
      rec('daily', { id: 'd2', year: 2026, type: 'toto', amount: 200, cashAmount: 200, upiAmount: 0, date: '2026-08-01' }),
    ] });
    const delta2 = b.call('pull', { token: tok.ratan, year: 2026, since: full.cursor });
    const got = (delta2.data.daily || []).map(function (r) { return r.id; });
    // The danger this finding was about is a row being MISSED, never a row
    // arriving twice — the client upserts by id, so a re-send costs nothing.
    // The cursor is deliberately inclusive (`>=`): receivedAt is written just
    // before data_ts, so a row can share the stamp's millisecond and a strict
    // `>` would drop exactly that row for ever. So assert what matters —
    // nothing new is lost — rather than pinning an exact list, which would
    // have turned a correct inclusive cursor into a failing test.
    eq(got.indexOf('d2') >= 0, true, 'backend 0.3: …and a row written after that cursor IS returned');
    eq(got.length <= 2, true, 'backend 0.3: …with at most the boundary row re-sent, not the whole year');
  }

  // ---- 2.6 / A59: a lost response must not blank a serial the donor holds --
  {
    const { b, tok } = book();
    const pay = { id: 'p1', year: 2026, partyId: 's1', partyName: 'মা তারা', amount: 500,
                  cashAmount: 500, upiAmount: 0, date: '2026-08-01' };
    const first = b.call('push', { token: tok.ratan, epoch: '', records: [rec('payments', pay)] });
    const serial = first.receipts.p1;
    eq(!!serial, true, 'backend 2.6: the first push mints a serial');
    // the response is lost: the phone still holds the row with receiptNo '' and retries
    const retry = b.call('push', { token: tok.ratan, epoch: '', records: [rec('payments', Object.assign({}, pay, { receiptNo: '' }))] });
    eq(b.rows('Payments')[0].receiptNo, serial,
       'backend 2.6: the retry does NOT write an empty string over the donor’s serial');
    eq(retry.receipts.p1, serial,
       'backend 2.6: …and the serial is handed back, so the phone stops printing "নং —"');
  }

  // ---- 2.7 / A59: a donor called "=..." must not become a formula ---------
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: '=IMPORTRANGE("x","y")', pledged: 100 }),
      rec('parties', { id: 's2', year: 2026, type: 'shop', name: '-৫০০ বাকি', pledged: 100 }),
    ] });
    const names = b.rows('Parties').map(function (p) { return p.name; });
    eq(names[0], '\'=IMPORTRANGE("x","y")', 'backend 2.7: a formula-looking name is written as text');
    eq(names[1], '-৫০০ বাকি', 'backend 2.7: …and an ordinary leading "-" is left alone (not a formula in Sheets)');
  }

  // ---- 2.5 / A59: confirm and reject cannot both win ----------------------
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('handovers', { id: 'h1', year: 2026, to: 'BIMAL', toId: 'bimal', amount: 500,
                         cashAmount: 500, upiAmount: 0, date: '2026-08-01' }),
    ] });
    b.call('confirmHandover', { token: tok.bimal, id: 'h1' });
    let threw = '';
    try { b.call('rejectHandover', { token: tok.bimal, id: 'h1', reason: 'পাইনি' }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'already-confirmed', 'backend 2.5: a settled parcel cannot be settled again the other way');
    // A71: and the REVERSE, which is the direction that was open. This test
    // asserted only confirm→reject, so reject→confirm passed for two releases
    // and was found by driving the live server, not by reading the file.
    threw = '';
    try { b.call('confirmHandover', { token: tok.bimal, id: 'h1' }); } catch (e) { threw = String(e.message || e); }
    eq(threw, 'already-confirmed', 'backend 2.5: …and confirming an already-confirmed one is refused too');
    const h = b.rows('Handovers')[0];
    eq(h.status, 'confirmed', 'backend 2.5: …the row stays confirmed…');
    eq(h.rejectReason, '', 'backend 2.5: …and never carries both answers at once');
    eq(String(h.receivedAt).slice(0, 4), '2026', 'backend 2.5: …with receivedAt bumped, so the delta pull carries it');
  }
  {
    // A71: reject → confirm. This left status='confirmed' sitting next to the
    // rejectReason that says it never arrived — the exact torn row A59's lock
    // was meant to make impossible. A lock cannot help when the code lets the
    // second write through on purpose. And the sender has already been told
    // "টাকা তোমার হিসাবেই আছে"; then it moves anyway, notice unchanged.
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('handovers', { id: 'h1', year: 2026, to: 'BIMAL', toId: 'bimal', amount: 500,
                         cashAmount: 500, upiAmount: 0, date: '2026-08-01' }),
    ] });
    b.call('rejectHandover', { token: tok.bimal, id: 'h1', reason: 'পাইনি' });
    let threw = '';
    try { b.call('confirmHandover', { token: tok.bimal, id: 'h1' }); } catch (e) { threw = String(e.message || e); }
    eq(threw, 'already-rejected', 'backend A71: a REFUSED parcel cannot then be confirmed');
    const h = b.rows('Handovers')[0];
    eq(h.status, 'rejected', 'backend A71: …it stays refused…');
    eq(h.rejectReason, 'পাইনি', 'backend A71: …with the reason the sender was given');
    // the pair, stated as one rule: neither settled state may be overwritten
    eq(['confirmed', 'rejected'].indexOf(String(h.status)) >= 0, true,
       'backend A71: …and a settled parcel is settled, whichever way it went');
  }
  {
    // and the recipient rule holds: being A cashier is not enough
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('handovers', { id: 'h1', year: 2026, to: 'KALI', toId: 'kali', amount: 500,
                         cashAmount: 500, upiAmount: 0, date: '2026-08-01' }),
    ] });
    let threw = '';
    try { b.call('confirmHandover', { token: tok.bimal, id: 'h1' }); } catch (e) { threw = String(e.message || e); }
    eq(threw, 'not-recipient', 'backend 2.5: a cashier cannot confirm a parcel addressed to somebody else');
  }

  // ---- 2.1 / A60: who may change a donor row, and what may be removed -----
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 1000 }),
    ] });
    const r = b.call('push', { token: tok.kali, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'HIJACKED', pledged: 9999 }),
    ] });
    eq(r.rejectedIds, ['s1'], 'backend 2.1: another collector cannot edit a donor row they did not write');
    eq(b.rows('Parties')[0].name, 'মা তারা', 'backend 2.1: …and the row is untouched');
    const own = b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা স্টোর্স', pledged: 6000 }),
    ] });
    eq(own.savedIds, ['s1'], 'backend 2.1: …while its creator can');
    eq(b.rows('Parties')[0].pledged, 6000, 'backend 2.1: …in place, keeping the same id');
    const adm = b.call('push', { token: tok.admin, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'admin fixed', pledged: 7000,
                       collectorId: 'ratan' }),
    ] });
    eq(adm.savedIds, ['s1'], 'backend 2.1: …and so can an admin');
    eq(b.rows('Parties')[0].collectorId, 'ratan',
       'backend 2.1: …without stealing the attribution, because the admin branch carries it forward');
  }
  {
    // a donor with money against it is removable by NOBODY, admin included
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 1000 }),
      rec('parties', { id: 's2', year: 2026, type: 'shop', name: 'খালি দোকান', pledged: 1000 }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 500, cashAmount: 500, upiAmount: 0, date: '2026-08-01' }),
    ] });
    const bad = b.call('push', { token: tok.admin, epoch: '', records: [
      rec('voids', { id: 'v1', year: 2026, targetStore: 'parties', targetId: 's1', reason: 'removed' }),
    ] });
    eq(bad.rejectedIds, ['v1'], 'backend 2.1: a donor with a payment against it cannot be removed, even by the admin');
    const good = b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('voids', { id: 'v2', year: 2026, targetStore: 'parties', targetId: 's2', reason: 'removed' }),
    ] });
    eq(good.savedIds, ['v2'], 'backend 2.1: …while an empty one its creator wrote down can be');
  }
  {
    // and a void whose target arrives in the SAME batch is not rejected —
    // reachable whenever an undo during a failed push retries alongside it
    const { b, tok } = book();
    const r = b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('daily', { id: 'd1', year: 2026, type: 'road', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-08-01' }),
      rec('voids', { id: 'v1', year: 2026, targetStore: 'daily', targetId: 'd1', reason: 'undo' }),
    ] });
    eq(r.rejectedIds, [], 'backend 2.9: a void travelling in the same batch as its target is accepted');
    eq(r.savedIds.length, 2, 'backend 2.9: …and both rows land');
  }

  // ---- 2.2 / 2.3 / A61: the dismissal stamps survive a round trip ---------
  // The whole point of adding the columns. If they did not persist, the desk
  // would ask the same question for ever — the A60 dead-field failure.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('daily', { id: 'd1', year: 2026, type: 'bus', busName: 'শিবম', busNumber: 'WB651234',
                     amount: 500, cashAmount: 500, upiAmount: 0, date: '2026-08-01', dupOk: 1 }),
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 100, pledgeOk: 1 }),
    ] });
    eq(Number(b.rows('DailyCollections')[0].dupOk), 1, 'backend 2.2: daily.dupOk is stored…');
    eq(Number(b.rows('Parties')[0].pledgeOk), 1, 'backend 2.3: …and parties.pledgeOk is stored');
    const pulled = b.call('pull', { token: tok.ratan, year: 2026 });
    eq(Number(pulled.data.daily[0].dupOk), 1, 'backend 2.2: …and comes back on the next pull');
    eq(Number(pulled.data.parties[0].pledgeOk), 1, 'backend 2.3: …so every device stops asking');
  }

  // ---- 0.2 / A52 + 1.1 / A58: the backup is a real undo, and not a login ---
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 1000 }),
    ] });
    const name = b.api.dailyBackup();
    const dump = JSON.parse(b.env._files[name].getBlob().getDataAsString());
    eq(Array.isArray(dump.Users) && dump.Users.length > 1, true,
       'backend 0.2: the backup carries the Users sheet under the key restore looks for');
    const tokCol = dump.Users[0].indexOf('token');
    eq(dump.Users.slice(1).every(function (r) { return r[tokCol] === ''; }), true,
       'backend 1.1: …with every session token blanked — a leaked backup was a password-free login for everyone');
    eq(dump.Users.slice(1).some(function (r) { return String(r[dump.Users[0].indexOf('passwordHash')]).length > 0; }), true,
       'backend 1.1: …while the salted hashes stay, so a restore is still a restore');
  }

  // ---- A73 (audit #5 V1): the backup must actually RESTORE ---------------
  // A52 added a pre-validation whitelist to restoreBackup and left
  // ExpenseSubjects out of it — which dailyBackup has always written. So
  // goLive's only undo went from working-but-wrong to refusing every backup in
  // existence, and the A52 test stayed green the whole time because it matched
  // the TEXT of the guard and never ran a restore.
  //
  // This one round-trips: back up a real book, wipe it, restore, and check the
  // rows came back. It is the assertion whose absence let the regression ship.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 1000 }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 500, cashAmount: 500, upiAmount: 0, date: '2026-08-01' }),
    ] });
    const name = b.api.dailyBackup();
    const dump = JSON.parse(b.env._files[name].getBlob().getDataAsString());
    // every key the backup writes must be one restore will accept — the two
    // lists disagreed, and nothing noticed
    const r = b.call('restoreBackup', { token: tok.admin, fileId: name, confirm: 'RESTORE' });
    eq(r.ok, true, 'A73: a backup this code produced can be restored by this code');
    eq(b.rows('Parties').length, 1, 'A73: …the donors come back…');
    eq(b.rows('Payments').length, 1, 'A73: …the money comes back…');
    eq(b.rows('Users').length >= 1, true, 'A73: …and so do the accounts, which is the whole point of 0.2');
    eq(Object.keys(dump).indexOf('ExpenseSubjects') >= 0, true,
       'A73: …including ExpenseSubjects, the key that was written and then refused');
    // the two lists are now one
    const gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
    eq(/var BACKUP_EXTRA_SHEETS = \['ExpenseSubjects', 'Lists', 'Config', 'Audit'\];/.test(gs), true,
       'A73: …because dailyBackup and restoreBackup read ONE list now');
    eq((gs.match(/BACKUP_EXTRA_SHEETS/g) || []).length >= 3, true, 'A73: …and both of them use it');
    // A58's stated consequence, now observed rather than asserted: the backup
    // carries blanked tokens, so restoring one logs EVERYBODY out. The admin
    // has to sign in again — which is the correct price for a disaster action,
    // and worth pinning so nobody "fixes" it by putting the tokens back.
    let kicked = '';
    try { b.call('auditLog', { token: tok.admin }); } catch (e) { kicked = String(e.message || e); }
    eq(kicked, 'bad-token', 'A73: restoring a backup logs everybody out, tokens included');
    const admin2 = b.call('login', { username: 'hrishi', password: 'secret1', year: 2026 }).token;

    // a genuinely unknown key must still be refused — the guard was right to
    // exist, it was the list that was wrong
    b.env._files['chanda-backup-bogus.json'] = {
      getName: function () { return 'chanda-backup-bogus.json'; },
      getBlob: function () { return { getDataAsString: function () { return JSON.stringify({ Spaceship: [['a']] }); } }; },
    };
    let threw = '';
    try { b.call('restoreBackup', { token: admin2, fileId: 'chanda-backup-bogus.json', confirm: 'RESTORE' }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'unknown-sheet: Spaceship', 'A73: an unknown sheet is still refused BEFORE anything is cleared');
    eq(b.rows('Parties').length, 1, 'A73: …and the book is untouched when it refuses');
  }

  // ---- 0.1 / A52: goLive cannot fire twice or by accident -----------------
  {
    const { b, tok } = book();
    let threw = '';
    try { b.call('goLive', { token: tok.admin }); } catch (e) { threw = String(e.message || e); }
    eq(threw, 'confirm-required', 'backend 0.1: goLive refuses without the typed confirmation');
    b.call('goLive', { token: tok.admin, confirm: 'LIVE' });
    threw = '';
    try { b.call('goLive', { token: tok.admin, confirm: 'LIVE' }); } catch (e) { threw = String(e.message || e); }
    eq(threw, 'already-live', 'backend 0.1: …and cannot wipe a live book a second time');
  }

  // ---- permission gates, exercised rather than read -----------------------
  {
    const { b, tok } = book();
    const admRow = b.rows('Users').filter(function (u) { return u.username === 'kali'; })[0];
    b.call('setEntries', { token: tok.admin, userId: admRow.id, entries: ['person'] });
    const kali = b.call('login', { username: 'kali', password: 'secret2', year: 2026 }).token;
    const r = b.call('push', { token: kali, epoch: '', records: [
      rec('parties', { id: 'x1', year: 2026, type: 'shop', name: 'দোকান', pledged: 100 }),
      rec('parties', { id: 'x2', year: 2026, type: 'person', name: 'ব্যক্তি', pledged: 100 }),
    ] });
    eq(r.rejectedIds, ['x1'], 'backend perms: a grant for ব্যক্তি does not admit a দোকান row');
    eq(r.savedIds, ['x2'], 'backend perms: …and does admit a ব্যক্তি one');
  }
  {
    // a plain collector may not file a puja expense; a cashier may
    const { b, tok } = book();
    const r1 = b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('expenses', { id: 'e1', year: 2026, subject: 'ফুল', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-08-01' }),
    ] });
    eq(r1.rejectedIds, ['e1'], 'backend perms: a collector cannot file a general puja expense');
    const r2 = b.call('push', { token: tok.bimal, epoch: '', records: [
      rec('expenses', { id: 'e2', year: 2026, subject: 'ফুল', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-08-01' }),
    ] });
    eq(r2.savedIds, ['e2'], 'backend perms: …and a cashier can');
  }
  {
    // bad token and blocked account, through doPost so the envelope is covered
    const { b, tok } = book();
    eq(b.post('pull', { token: 'nope', year: 2026 }).error, 'bad-token', 'backend auth: an unknown token is refused');
    eq(b.post('pull', { year: 2026 }).error, 'no-token', 'backend auth: …and a missing one is named separately');
    // Blocking CLEARS the token, so the very next request is bad-token rather
    // than 'blocked'. That is the stronger behaviour and the one to guard: the
    // device is kicked at once instead of being politely told why while still
    // holding a working session.
    const row = b.rows('Users').filter(function (u) { return u.username === 'ratan'; })[0];
    b.call('setStatus', { token: tok.admin, userId: row.id, status: 'blocked' });
    eq(b.rows('Users').filter(function (u) { return u.username === 'ratan'; })[0].token, '',
       'backend auth: blocking an account clears its session on the spot');
    eq(b.post('pull', { token: tok.ratan, year: 2026 }).error, 'bad-token',
       'backend auth: …so the blocked phone cannot make one more request');
    // a never-approved account is told the truth, which is a different word
    b.post('register', { username: 'notyet', name: 'NOTYET', password: 'secret9', phone: '9876543299' });
    let pendErr = '';
    try { b.call('login', { username: 'notyet', password: 'secret9', year: 2026 }); }
    catch (e) { pendErr = String(e.message || e); }
    eq(pendErr, 'pending', 'backend auth: an unapproved account is told it is pending, not blocked');
  }
  {
    // releaseSession is the lost-phone remedy: the token stops working at once
    const { b, tok } = book();
    const row = b.rows('Users').filter(function (u) { return u.username === 'ratan'; })[0];
    eq(b.post('pull', { token: tok.ratan, year: 2026 }).ok, true, 'backend session: the token works…');
    b.call('releaseSession', { token: tok.admin, userId: row.id });
    eq(b.post('pull', { token: tok.ratan, year: 2026 }).error, 'bad-token',
       'backend session: …and stops the moment the admin releases it');
  }


  // ---- A68 (audit #2 U1): answering an anomaly on somebody else's row -----
  // The client used to do this through the local queue. That failed silently
  // (the row is not in this device's IndexedDB) — and the obvious repair,
  // pushing the central row back, was WORSE. Both are proven here.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', partyName: 'মা তারা', amount: 500,
                        cashAmount: 500, upiAmount: 0, date: '2026-08-01' }),
    ] });
    // what the audit suggested: take the central row, stamp it, push it back.
    // A116a closed this door on the server too — until the pre-go-live review
    // this test PROVED the theft happened (collectorId became bimal), which was
    // the argument for setAnomalyFlag. The desk still must not push (a rejected
    // row is a silent no-op, A68's original failure), but the server no longer
    // lets the attribution move even if a tampered client tries.
    const central = b.call('pull', { token: tok.bimal, year: 2026 }).data.payments[0];
    central.dupOk = 1;
    const theft = b.call('push', { token: tok.bimal, epoch: '', records: [rec('payments', central)] });
    eq((theft.rejectedIds || []).indexOf('p1') >= 0, true,
       'backend A116: pushing somebody else\'s money row back is REFUSED outright');
    eq(b.rows('Payments')[0].collectorId, 'ratan',
       'backend A116: …and the attribution (the in-hand liability) never moves');
  }
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', partyName: 'মা তারা', amount: 500,
                        cashAmount: 500, upiAmount: 0, date: '2026-08-01' }),
      rec('daily', { id: 'd1', year: 2026, type: 'bus', busName: 'শিবম', busNumber: 'WB651234',
                     amount: 300, cashAmount: 300, upiAmount: 0, date: '2026-08-01' }),
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 100 }),
    ] });
    const before = b.rows('Payments')[0];
    const ts = b.api.readConfig_().data_ts;
    b.env._setNow(b.env._now() + 60000);
    eq(b.call('setAnomalyFlag', { token: tok.bimal, store: 'payments', id: 'p1', field: 'dupOk' }).ok, true,
       'backend U1: the cashier can answer a duplicate on a row they did not write…');
    const after = b.rows('Payments')[0];
    eq(Number(after.dupOk), 1, 'backend U1: …the flag lands…');
    eq(after.collectorId, before.collectorId,
       'backend U1: …and the money stays with whoever collected it — one cell, nothing else');
    eq(after.amount, before.amount, 'backend U1: …amount untouched');
    eq(after.receivedAt !== before.receivedAt, true,
       'backend U1: …receivedAt bumped, or the delta pull never carries the answer');
    eq(b.api.readConfig_().data_ts !== ts, true, 'backend U1: …and data_ts moves, so no phone fast-paths past it');
    // all three stores
    eq(b.call('setAnomalyFlag', { token: tok.bimal, store: 'daily', id: 'd1', field: 'dupOk' }).ok, true,
       'backend U1: daily too');
    eq(b.call('setAnomalyFlag', { token: tok.admin, store: 'parties', id: 's1', field: 'pledgeOk' }).ok, true,
       'backend U1: …and parties');
    // the table is fixed: this must never become "set any cell on any row"
    let threw = '';
    try { b.call('setAnomalyFlag', { token: tok.admin, store: 'payments', id: 'p1', field: 'amount' }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'bad-input', 'backend U1: an arbitrary column name is refused');
    threw = '';
    try { b.call('setAnomalyFlag', { token: tok.admin, store: 'users', id: 'p1', field: 'role' }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'bad-input', 'backend U1: …and so is an arbitrary store');
    // and a plain collector cannot answer the desk at all
    threw = '';
    try { b.call('setAnomalyFlag', { token: tok.ratan, store: 'payments', id: 'p1', field: 'dupOk' }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'not-cashier', 'backend U1: the desk stays cashier/admin only');
    // …and the gate is isCashier_, matching the screen. canReview_ would also
    // demand the 'review' grant, which belongs to the CORRECTION desk — a
    // cashier without it would see every button on 🩺 and have every one fail.
    const noReview = b.rows('Users').filter(function (u) { return u.username === 'bimal'; })[0];
    b.call('setEntries', { token: tok.admin, userId: noReview.id, entries: ['shop'] });
    const t2 = b.call('login', { username: 'bimal', password: 'secret1', year: 2026 }).token;
    eq(b.call('setAnomalyFlag', { token: t2, store: 'daily', id: 'd1', field: 'dupOk' }).ok, true,
       'backend U1: a cashier WITHOUT the review grant can still answer the anomaly desk they can see');
  }

  // ---- 2.4 / A59: rolloverYear announces itself ---------------------------
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'মা তারা', pledged: 1000 }),
    ] });
    const before = b.api.readConfig_().data_ts;
    b.env._setNow(b.env._now() + 60000);
    const out = b.call('rolloverYear', { token: tok.admin, fromYear: 2026, toYear: 2027 });
    eq(out.count, 1, 'backend 2.4: the donor is copied into the new year');
    eq(b.api.readConfig_().data_ts !== before, true,
       'backend 2.4: …and data_ts moves, or every phone answers idle:true and the rows stay invisible for ever');
  }

  // ---- A78: the committee's access door -----------------------------------
  //
  // The whole feature exists because taking permissions away does NOT stop
  // somebody. Every case below is a thing that was possible before it.
  {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    // A post that grants something, held by the person we stand down — this is
    // the trap: setEntries([]) empties the PERSONAL list, effPerms_ unions it
    // with the POST's, and the post hands everything straight back.
    b.call('listItems', { token: tok.admin, kind: 'position' });
    const post = b.rows('Lists').filter(function (r) { return r.kind === 'position'; })[0];
    b.call('setPositionRules', { token: tok.admin, id: post.id, perms: ['shop', 'road'], maxCount: 20 });
    b.call('setUserPosition', { token: tok.admin, userId: uid('ratan'), position: post.id });
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'দোকান ১', pledged: 8000 }),
      rec('parties', { id: 's2', year: 2026, type: 'shop', name: 'দোকান ২', pledged: 6000 }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 5000, cashAmount: 5000, upiAmount: 0, date: '2026-09-01' }),
      rec('payments', { id: 'p2', year: 2026, partyId: 's2', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-01' }),
    ] });
    b.call('push', { token: tok.kali, epoch: '', records: [
      rec('parties', { id: 'k1', year: 2026, type: 'shop', name: 'কালীর দোকান', pledged: 5000 }),
    ] });
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('handovers', { id: 'h1', year: 2026, from: 'RATAN', fromId: 'ratan', to: 'BIMAL', toId: 'bimal',
                         amount: 3000, cashAmount: 3000, upiAmount: 0, date: '2026-09-02', breakdown: '{}', status: 'pending' }),
    ] });
    b.call('confirmHandover', { token: tok.bimal, id: 'h1' });

    const out = b.call('setAccess', { token: tok.admin, userId: uid('ratan'), access: 'exiting', year: 2026 });
    eq(out.user.position === '' && out.user.entries === '' && out.user.reports === '' && out.user.cashier === 0, true,
       'backend A78: standing down takes the POST and both permission lists in ONE call — leave the post and effPerms_ hands it all back');
    eq(out.user.access, 'exiting', 'backend A78: …and the state is RECORDED, so it cannot be confused with "nothing granted yet"');

    // What they may still do — an allow-list, asserted item by item, because
    // every one of these falls through permForRow_ with a null key and would
    // otherwise be granted to everybody.
    // A174: "did it LAND", not "was it rejected". A174 turned the money stores
    // from refused to HELD — the row still does not enter the book, which is
    // all A78 ever meant, but `rejectedIds.length === 0` measured the proxy
    // rather than the fact and started reading a held row as permission. The
    // sheet is the fact.
    const can = function (store, row) {
      b.api.resetRequestState();
      b.call('push', { token: tok.ratan, epoch: '', records: [rec(store, row)] });
      return b.rows(SHEET_TITLE[store]).some(function (r) { return String(r.id) === String(row.id); });
    };
    eq(can('parties', { id: 'x1', year: 2026, type: 'shop', name: 'নতুন', pledged: 100 }), false,
       'backend A78: a stood-down member cannot open a new donor');
    eq(can('daily', { id: 'x2', year: 2026, type: 'road', amount: 200, cashAmount: 200, upiAmount: 0, date: '2026-09-03' }), false,
       'backend A78: …nor run a daily round');
    eq(can('voids', { id: 'x5', year: 2026, targetStore: 'payments', targetId: 'p1', reason: 'zz' }), false,
       'backend A78: …nor VOID a payment they took — the row would leave the book, their in-hand would fall by the same amount, and the cash would simply be gone');
    eq(can('messages', { id: 'x6', year: 2026, text: 'hi' }), false, 'backend A78: …nor post in the committee chat');
    // A78e: but they CAN report a mistake in their own row. Refusing this left
    // the error in the book — the opposite of what standing somebody down is
    // for. They still cannot void or edit it; a cashier decides.
    eq(can('corrections', { id: 'x7', year: 2026, targetStore: 'payments', targetId: 'p1', reason: 'ভুল অঙ্ক' }), true,
       'backend A78e: they CAN flag a mistake in a payment they took — a flag is a report, not an entry');
    eq(can('corrections', { id: 'x7b', year: 2026, targetStore: 'parties', targetId: 'k1', reason: 'zz' }), false,
       'backend A78e: …but not about somebody else’s row — the correction desk is a real person’s afternoon');
    eq(can('payments', { id: 'x4', year: 2026, partyId: 'k1', amount: 1000, cashAmount: 1000, upiAmount: 0, date: '2026-09-03' }), false,
       'backend A78: …nor collect against SOMEBODY ELSE’s donor — nothing else in the file keys a payment to an owner');
    eq(can('payments', { id: 'x3', year: 2026, partyId: 's1', amount: 1000, cashAmount: 1000, upiAmount: 0, date: '2026-09-03' }), true,
       'backend A78: they CAN collect the balance of a donor they brought in');
    eq(can('handovers', { id: 'x8', year: 2026, from: 'RATAN', fromId: 'ratan', to: 'BIMAL', toId: 'bimal',
                          amount: 5000, cashAmount: 5000, upiAmount: 0, date: '2026-09-03', breakdown: '{}', status: 'pending' }), true,
       'backend A78: …and they CAN hand in what they hold — a person who cannot log in cannot give the money back');
  }
  // The guards, each standing over a way somebody got stranded.
  {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    eq(refuses(function () { b.call('setAccess', { token: tok.admin, userId: uid('hrishi'), access: 'exiting', year: 2026 }); }),
       'cant-exit-self', 'backend A78: the admin cannot stand HIMSELF down');
    eq(refuses(function () { b.call('setStatus', { token: tok.admin, userId: uid('hrishi'), status: 'blocked', year: 2026 }); }),
       'cant-block-self', 'backend A78: …nor block himself — setRole has refused self-demotion since the beginning, this door had no such guard and blocking clears the token, so one tap locked everyone out with no way back but editing the sheet by hand');
    b.call('setRole', { token: tok.admin, userId: uid('kali'), role: 'admin' });
    eq(refuses(function () { b.call('setAccess', { token: tok.admin, userId: uid('kali'), access: 'exiting', year: 2026 }); }),
       'demote-first', 'backend A78: an admin cannot be stood down — they bypass every gate, so it would change nothing while looking like it had');
    eq(refuses(function () { b.call('setAccess', { token: tok.admin, userId: uid('ratan'), access: '', year: 2026 }); }),
       'position-required', 'backend A78: bringing somebody back needs a post, or they look identical to somebody just stood down');
  }
  // Holding money is the reason the last door stays shut.
  {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'দোকান', pledged: 8000 }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 5000, cashAmount: 5000, upiAmount: 0, date: '2026-09-01' }),
    ] });
    let msg = '';
    try { b.call('setStatus', { token: tok.admin, userId: uid('ratan'), status: 'blocked', year: 2026 }); }
    catch (e) { msg = e.message; }
    eq(msg, 'holds-money:5000',
       'backend A78: blocking is refused while they hold cash, and says HOW MUCH — the admin needs the figure to decide whether to chase it or write it off');
    const forced = b.call('setStatus', { token: tok.admin, userId: uid('ratan'), status: 'blocked', year: 2026, override: 1 });
    eq(forced.user.status, 'blocked', 'backend A78: …the committee can still close it');
    const snap = b.call('userSnapshot', { token: tok.admin, userId: uid('ratan'), year: 2026 });
    eq(snap.saved.block.writtenOff, 5000,
       'backend A78: …and the amount is written into the record, never silently zeroed, or the book stops adding up');
  }
  // The way back in that nobody would have thought to close. Every gate in
  // push honours the access-block — but confirmHandover is not a push, it asks
  // isCashier_ directly, and an admin bypasses the lot. So the two chips that
  // sat beside the block on the same screen could quietly undo it.
  {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    b.call('setAccess', { token: tok.admin, userId: uid('ratan'), access: 'exiting', year: 2026 });
    eq(refuses(function () { b.call('setCashier', { token: tok.admin, userId: uid('ratan'), cashier: 1 }); }),
       'is-exiting', 'backend A78: a stood-down member cannot be handed the cashier flag — it reaches confirmHandover, which never sees the block');
    eq(refuses(function () { b.call('setRole', { token: tok.admin, userId: uid('ratan'), role: 'admin' }); }),
       'is-exiting', 'backend A78: …nor promoted to admin, which bypasses every gate in the file');
    // …and the way back is the way back: bring them in, then decide.
    b.call('listItems', { token: tok.admin, kind: 'position' });
    const post = b.rows('Lists').filter(function (r) { return r.kind === 'position'; })[0];
    b.call('setAccess', { token: tok.admin, userId: uid('ratan'), access: '', position: post.id, year: 2026 });
    eq(b.call('setCashier', { token: tok.admin, userId: uid('ratan'), cashier: 1 }).user.cashier, 1,
       'backend A78: …once brought back, the ordinary buttons work again');
  }
  // A78b — Hrishi: "if cashier blocked then he cant receive the amount from the
  // collector or other cashier". confirmHandover wants cashier AND recipient,
  // so standing a cashier down strands every parcel already on its way: they
  // lose the flag, and no other cashier is the recipient. Only an admin could
  // settle them, and nothing told him to.
  {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'দোকান', pledged: 9000 }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 6000, cashAmount: 6000, upiAmount: 0, date: '2026-09-01' }),
    ] });
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('handovers', { id: 'h1', year: 2026, from: 'RATAN', fromId: 'ratan', to: 'BIMAL', toId: 'bimal',
                         amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-03', breakdown: '{}', status: 'pending' }),
      rec('handovers', { id: 'h2', year: 2026, from: 'RATAN', fromId: 'ratan', to: 'BIMAL', toId: 'bimal',
                         amount: 1500, cashAmount: 1500, upiAmount: 0, date: '2026-09-03', breakdown: '{}', status: 'pending' }),
    ] });
    let msg = '';
    try { b.call('setAccess', { token: tok.admin, userId: uid('bimal'), access: 'exiting', year: 2026 }); }
    catch (e) { msg = e.message; }
    eq(msg, 'has-pending:2:3500',
       'backend A78b: a cashier with unanswered parcels cannot be stood down — and the refusal carries the COUNT and the TOTAL, because the job is theirs to finish while they are still a cashier');
    // …and they can finish it themselves, in a minute, which is the whole point.
    b.call('confirmHandover', { token: tok.bimal, id: 'h1' });
    b.call('rejectHandover', { token: tok.bimal, id: 'h2', reason: 'গোনায় মেলেনি' });
    eq(b.call('setAccess', { token: tok.admin, userId: uid('bimal'), access: 'exiting', year: 2026 }).user.access, 'exiting',
       'backend A78b: …with the inbox empty it goes through');
    // Nothing may be sent to them afterwards. The picker already omits them, but
    // a screen drawn before the decision — or an offline queue from yesterday —
    // would rebuild the same trap through a UI-only rule.
    const send = function (to, toId, id) {
      b.api.resetRequestState();
      return b.call('push', { token: tok.ratan, epoch: '', records: [
        rec('handovers', { id: id, year: 2026, from: 'RATAN', fromId: 'ratan', to: to, toId: toId,
                           amount: 1000, cashAmount: 1000, upiAmount: 0, date: '2026-09-06', breakdown: '{}', status: 'pending' }),
      ] }).rejectedIds.length > 0;
    };
    eq(send('BIMAL', 'bimal', 'h9'), true, 'backend A78b: a stale screen or an offline queue cannot send money to somebody stood down');
    b.call('setCashier', { token: tok.admin, userId: uid('kali'), cashier: 1 });
    eq(send('KALI', 'kali', 'h10'), false, 'backend A78b: …a working cashier is untouched');
    eq(send('কেউ একজন', '', 'h11'), false,
       'backend A78b: …and a name matching no account is left alone — "we cannot tell" must never become "no"');
    b.call('setStatus', { token: tok.admin, userId: uid('kali'), status: 'blocked', year: 2026 });
    eq(send('KALI', 'kali', 'h12'), true, 'backend A78b: …the security door closes the same route');
  }
  // The saved picture, and the line that stops it reading like a bug.
  {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'দোকান ১', pledged: 8000 }),
      rec('parties', { id: 's2', year: 2026, type: 'shop', name: 'দোকান ২', pledged: 6000 }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 5000, cashAmount: 5000, upiAmount: 0, date: '2026-09-01' }),
      rec('payments', { id: 'p2', year: 2026, partyId: 's2', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-01' }),
    ] });
    b.call('setAccess', { token: tok.admin, userId: uid('ratan'), access: 'exiting', year: 2026 });
    const s0 = b.call('userSnapshot', { token: tok.admin, userId: uid('ratan'), year: 2026 });
    eq(s0.saved.exit.inHand === 7000 && s0.saved.exit.dueTotal === 7000 && s0.saved.exit.dueCount === 2, true,
       'backend A78: the exit picture records what they held AND what their donors still owe');
    eq(s0.saved.exit.dues.map(function (d) { return d.name; }).join(','), 'দোকান ২,দোকান ১',
       'backend A78: …donor by donor, biggest first — "₹7000 outstanding" is not something anybody can go and collect on');
    // Somebody else collects part of it; the stood-down member collects the rest.
    b.api.resetRequestState();
    b.call('push', { token: tok.kali, epoch: '', records: [
      rec('payments', { id: 'p3', year: 2026, partyId: 's2', amount: 4000, cashAmount: 4000, upiAmount: 0, date: '2026-09-05' }),
    ] });
    b.api.resetRequestState();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('payments', { id: 'p4', year: 2026, partyId: 's1', amount: 1000, cashAmount: 1000, upiAmount: 0, date: '2026-09-05' }),
    ] });
    const s1 = b.call('userSnapshot', { token: tok.admin, userId: uid('ratan'), year: 2026 });
    eq(s1.saved.exit.dueTotal, 7000, 'backend A78: the saved figures do NOT move — a record that changes is not a record');
    eq(s1.live.dueTotal, 2000, 'backend A78: …while today’s figures do');
    eq(s1.since.byOthers === 4000 && s1.since.byHim === 1000, true,
       'backend A78: …and the split says WHO collected the difference, computed by subtracting the saved per-donor figures — never by comparing timestamps, which cannot order two rows written in the same second');
  }

  // ---- A78c: what a wipe keeps, and what it must not ----------------------
  //
  // 🧹 and 🚀 spare Users, Config, Lists, ExpenseSubjects and Audit on purpose —
  // approvals and permissions must survive practice. A78 then put two new
  // things in Users, and they are not the same kind of thing:
  //   · exitSnap is practice MONEY, and would face the committee showing
  //     training figures against donors the wipe had just deleted
  //   · access is a decision about a PERSON, like role or post, and a wipe that
  //     silently reverses a committee decision is worse than one that keeps it
  // Until now neither handler had ever been EXECUTED by a test — the shim had
  // no deleteRows, so the most destructive pair in the file was read-only-
  // verified. That is the A52 failure exactly.
  ['goLive', 'clearTraining'].forEach(function (action) {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'প্র্যাকটিস দোকান', pledged: 8000 }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 5000, cashAmount: 5000, upiAmount: 0, date: '2026-09-01' }),
    ] });
    b.call('setEntries', { token: tok.admin, userId: uid('kali'), entries: ['shop', 'road'] });
    b.call('setAccess', { token: tok.admin, userId: uid('ratan'), access: 'exiting', year: 2026 });
    eq(String(b.rows('Users').filter(function (u) { return u.username === 'ratan'; })[0].exitSnap || '') !== '', true,
       'backend A78c/' + action + ': the exit picture is there before the wipe');
    b.call(action, { token: tok.admin, confirm: action === 'goLive' ? 'LIVE' : 'CLEAR', digits: 6 });
    const after = b.rows('Users').filter(function (u) { return u.username === 'ratan'; })[0];
    eq(b.rows('Parties').length === 0 && b.rows('Payments').length === 0, true,
       'backend A78c/' + action + ': …the practice rows are gone');
    eq(String(after.exitSnap || ''), '',
       'backend A78c/' + action + ': …and so is the exit picture, which would otherwise show training money against donors that no longer exist');
    eq(String(after.access), 'exiting',
       'backend A78c/' + action + ': …but the committee’s decision SURVIVES — a wipe must not quietly reverse it, any more than it clears role or post');
    eq(String(b.rows('Users').filter(function (u) { return u.username === 'kali'; })[0].entries), 'shop,road',
       'backend A78c/' + action + ': …and permissions survive, which is why the wipe spares Users in the first place');
  });

  // ---- 🧹 clearUserGrants: one-way, destructive, never once EXECUTED ------
  //
  // Every assertion about this button was a regex over Code.gs until now, and
  // it is about to be pressed for real on the eve of go-live. Same gap A78c
  // found in goLive/clearTraining, and the same reason: reading is not a test.
  {
    const { b, tok } = book();
    const uid = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0].id; };
    const row = function (n) { return b.rows('Users').filter(function (x) { return x.username === n; })[0]; };
    b.call('listItems', { token: tok.admin, kind: 'position' });
    const post = b.rows('Lists').filter(function (r) { return r.kind === 'position'; })[0];
    b.call('setPositionRules', { token: tok.admin, id: post.id, perms: ['shop', 'road', 'inhand'], maxCount: 20 });
    b.call('setUserPosition', { token: tok.admin, userId: uid('ratan'), position: post.id });
    b.call('setReports', { token: tok.admin, userId: uid('ratan'), reports: ['dues'] });

    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    eq(refuses(function () { b.call('clearUserGrants', { token: tok.admin }); }), 'confirm-required',
       'backend 🧹: a one-way action needs the typed confirmation to REACH the server — A52 shipped a confirmation the client threw away');
    eq(refuses(function () { b.call('clearUserGrants', { token: tok.kali, confirm: 'CLEAR' }); }), 'not-admin',
       'backend 🧹: …and only an admin may run it');

    const ts = b.api.readConfig_().data_ts;
    const out = b.call('clearUserGrants', { token: tok.admin, confirm: 'CLEAR' });
    eq(out.cleared.slice().sort().join(','), 'bimal,kali,ratan',
       'backend 🧹: it reports exactly who lost something — the admin screen shows this list back, so a wrong one is a wrong record of what happened');
    // bimal, not kali — bimal is the one this book makes a cashier. Written
    // against kali first, where the flag was 0 before AND after, so the
    // assertion held no matter what the handler did: an assertion that cannot
    // fail is not an assertion. Found by removing the setValue and watching the
    // suite stay green.
    eq(Number(row('bimal').cashier || 0), 0,
       'backend 🧹: the cashier flag is cleared — the one grant that lets somebody confirm money they never received');
    eq(String(row('ratan').entries) + '|' + String(row('ratan').reports), '|',
       'backend 🧹: …and personal entries and reports with it');
    eq(String(row('hrishi').role), 'admin',
       'backend 🧹: an admin is skipped — the one account that must still be able to undo this');
    eq(b.api.readConfig_().data_ts !== ts, true,
       'backend 🧹: …and data_ts moves, or every phone answers idle:true and keeps its old permissions until something else happens to change');

    // The trap, pinned in BOTH directions so it can never move silently. The
    // button says "personal permissions" and the hint says access will come
    // from the post alone — that is honest, and this is what it means: a post
    // with perms keeps granting them to everybody holding it. Reducing a post's
    // own permissions is a separate job, and it must be done FIRST.
    b.api.resetRequestState();
    eq(b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 'z1', year: 2026, type: 'shop', name: 'x', pledged: 100 }),
    ] }).rejectedIds.length, 0,
       'backend 🧹: somebody holding a post that grants shop CAN still add donors afterwards — 🧹 does not touch posts, by design');
    b.api.resetRequestState();
    eq(b.call('push', { token: tok.kali, epoch: '', records: [
      rec('parties', { id: 'z2', year: 2026, type: 'shop', name: 'y', pledged: 100 }),
    ] }).rejectedIds.length, 1,
       'backend 🧹: …while somebody with no post is left with nothing, which is the whole point of the stranded warning on the admin screen');
  }

  // ---- A81: a column the sheet has and this file does not ----------------
  //
  // Found on the LIVE sheet, not here: v4.7.3 dropped `memberType` from
  // SHEETS.parties, ensureCols_ only ever APPENDS, so the column stayed — and
  // every write aimed by `cols.indexOf` landed one cell to the left of where it
  // meant to. Stamping pledgeOk wrote into memberType; stamping dupOk wrote
  // into pledgeOk; dupOk was never written at all. Reads are header-driven and
  // were always right, which is precisely why nobody saw it: the answer went
  // in, came back as nothing, and the 🩺 line could never be cleared. A61's
  // "paid more than pledged is fine" button had therefore never once worked in
  // production.
  //
  // The shim builds its sheets from SHEETS, so it can never drift on its own.
  // This test makes it drift on purpose. Every assertion below fails against
  // the old by-position code.
  {
    const { b, tok } = book();
    const sh = b.env.SpreadsheetApp.getActive().getSheetByName('Parties');
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
    const at = head.indexOf('pledgeOk');
    sh.getRange(1, head.length + 1).setValue('pledgeOk'); // pledgeOk moves to the end…
    sh.getRange(1, at + 1).setValue('memberType');        // …and a ghost takes its place
    // …and `phone` goes last, carrying REAL data. Written with an empty column
    // last, a truncating insert (cols.length instead of head.length) dropped
    // only a blank and every assertion stayed green — the mutation proved the
    // test blind before it proved the code right.
    const at2 = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('phone');
    sh.getRange(1, sh.getLastColumn() + 1).setValue('phone');
    sh.getRange(1, at2 + 1).setValue('ghost2');
    b.api.resetRequestState();

    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 'g1', year: 2026, type: 'shop', name: 'ভূত', phone: '9000000001', pledged: 100 }),
    ] });
    const row = function () { return b.rows('Parties').filter(function (r) { return r.id === 'g1'; })[0]; };
    eq(row().name, 'ভূত',
       'backend A81: a row still writes to the right columns when the sheet carries one this file does not list');
    eq(Number(row().pledged), 100, 'backend A81: …including the money');
    eq(String(row().phone), '9000000001',
       'backend A81: …and the LAST column of the sheet, which a write sized by `cols` silently truncates');

    const cashId = b.rows('Users').filter(function (u) { return u.username === 'bimal'; })[0].id;
    b.call('setCashier', { token: tok.admin, userId: cashId, cashier: 1 });
    b.api.resetRequestState();
    b.call('setAnomalyFlag', { token: tok.bimal, store: 'parties', id: 'g1', field: 'pledgeOk' });
    eq(Number(row().pledgeOk), 1,
       'backend A81: the pledgeOk answer lands in pledgeOk — this is the one that had been going into the ghost');
    eq(String(row().memberType || ''), '',
       'backend A81: …and NOT in the column next door');
    b.api.resetRequestState();
    b.call('setAnomalyFlag', { token: tok.bimal, store: 'parties', id: 'g1', field: 'dupOk' });
    eq(Number(row().dupOk), 1, 'backend A81: dupOk lands in dupOk');
    eq(Number(row().pledgeOk), 1, 'backend A81: …without disturbing the answer already there');

    // an UPDATE must not blank the ghost either — a wipe would be a second bug
    // fixing the first
    sh.getRange(2, sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].indexOf('memberType') + 1)
      .setValue('legacy-value');
    b.api.resetRequestState();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 'g1', year: 2026, type: 'shop', name: 'ভূত ২', phone: '9000000001', pledged: 150 }),
    ] });
    eq(row().name, 'ভূত ২', 'backend A81: an update still lands correctly…');
    eq(String(row().memberType), 'legacy-value',
       'backend A81: …and leaves an unknown column alone rather than wiping it');
  }

  // The same fix on the correction desk, which had never been executed at all.
  // No ghost exists on that sheet today; that is not a thing to rely on, and a
  // rule guarded in one place and not the other is this project's oldest bug.
  {
    const { b, tok } = book();
    const csh = b.env.SpreadsheetApp.getActive().getSheetByName('Corrections');
    const chead = csh.getRange(1, 1, 1, csh.getLastColumn()).getValues()[0];
    const si = chead.indexOf('status');
    csh.getRange(1, chead.length + 1).setValue('status');
    csh.getRange(1, si + 1).setValue('ghostCol');
    b.api.resetRequestState();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 'c1', year: 2026, type: 'shop', name: 'দোকান', pledged: 500 }),
      rec('payments', { id: 'cp1', year: 2026, partyId: 'c1', amount: 500, cashAmount: 500, upiAmount: 0, date: '2026-09-01' }),
    ] });
    b.api.resetRequestState();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('corrections', { id: 'cf1', year: 2026, targetStore: 'payments', targetId: 'cp1',
                           targetSummary: 'দোকান — ₹500', reason: 'অঙ্ক ভুল', status: 'pending' }),
    ] });
    const cashId = b.rows('Users').filter(function (u) { return u.username === 'bimal'; })[0].id;
    b.call('setCashier', { token: tok.admin, userId: cashId, cashier: 1 });
    // canReview_, not isCashier_ — the desk needs the `review` grant on top
    b.call('setEntries', { token: tok.admin, userId: cashId, entries: ['shop', 'review'] });
    b.api.resetRequestState();
    b.call('resolveCorrection', { token: tok.bimal, id: 'cf1', decision: 'reject' });
    const row = b.rows('Corrections').filter(function (r) { return r.id === 'cf1'; })[0];
    eq(String(row.status), 'rejected',
       'backend A81: a resolved flag lands in `status`, not in the column beside it');
    eq(String(row.ghostCol || ''), '', 'backend A81: …and the unknown column is untouched');
    eq(String(row.resolvedBy || '').length > 0, true, 'backend A81: …with who decided it recorded');
  }

  // Drift that nobody can see is drift nobody fixes. setup() now names it.
  {
    const { b } = book();
    const sh = b.env.SpreadsheetApp.getActive().getSheetByName('Parties');
    sh.getRange(1, sh.getLastColumn() + 1).setValue('memberType');
    b.api.setup();
    const said = b.rows('Audit').filter(function (r) { return String(r.action) === 'schema:ghost'; });
    eq(said.length, 1, 'backend A81: setup() reports a column the sheet has and this file does not');
    eq(String(said[0].detail).indexOf('memberType') >= 0, true,
       'backend A81: …and names it, so the admin meets the cause rather than the symptom');
    const clean = book();
    clean.b.api.setup();
    eq(clean.b.rows('Audit').filter(function (r) { return String(r.action) === 'schema:ghost'; }).length, 0,
       'backend A81: …and says nothing when the sheets agree — a warning that always fires is not a warning');
  }

  // ---- A80: parties now carry TWO answers -------------------------------
  // ANOMALY_FLAGS went from store→field to store→[fields] so a donor row can
  // hold both "paid more than pledged is fine" and "same phone, different shop
  // is fine". Widening that table is exactly the moment it stops being a table
  // and becomes "any column the caller names".
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'দোকান', pledged: 1000, phone: '9876543210' }),
    ] });
    const cashId = b.rows('Users').filter(function (u) { return u.username === 'bimal'; })[0].id;
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    eq(b.call('setAnomalyFlag', { token: tok.bimal, store: 'parties', id: 's1', field: 'dupOk' }).ok, true,
       'backend A80: a cashier can answer "same phone, different shop"');
    eq(Number(b.rows('Parties').filter(function (r) { return r.id === 's1'; })[0].dupOk), 1,
       'backend A80: …and it lands in the dupOk column, so the line clears for everybody');
    eq(b.call('setAnomalyFlag', { token: tok.bimal, store: 'parties', id: 's1', field: 'pledgeOk' }).ok, true,
       'backend A80: …while pledgeOk still works — a party can need both answers');
    eq(refuses(function () { b.call('setAnomalyFlag', { token: tok.bimal, store: 'parties', id: 's1', field: 'pledged' }); }),
       'bad-input', 'backend A80: …and the table still refuses any other column — this must never become "set an arbitrary cell"');
    eq(refuses(function () { b.call('setAnomalyFlag', { token: tok.bimal, store: 'parties', id: 's1', field: 'token' }); }),
       'bad-input', 'backend A80: …including one that exists on another sheet');
    eq(refuses(function () { b.call('setAnomalyFlag', { token: tok.ratan, store: 'parties', id: 's1', field: 'dupOk' }); }),
       'not-cashier', 'backend A80: …and a plain collector cannot answer it at all');
    eq(cashId.length > 0, true, 'backend A80: (fixture sanity)');
  }

  // ---- A86: report grants shape the screen, they do not hide anything ----
  //
  // `docs/residual-risks.md` has always said so, and I briefly wrote the
  // opposite in the A79 note — that gating the target bar closed a leak. It
  // does not. A future reader acting on that sentence would have believed the
  // reports are confidential and, say, put a donor's phone behind a report
  // grant. This test states the truth so the belief cannot form again.
  {
    const { b, tok } = book();
    const uid = b.rows('Users').filter(function (u) { return u.username === 'kali'; })[0].id;
    b.call('setReports', { token: tok.admin, userId: uid, reports: [] });
    b.api.resetRequestState();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 's1', year: 2026, type: 'shop', name: 'দোকান', pledged: 9000, phone: '9000011111' }),
      rec('payments', { id: 'p1', year: 2026, partyId: 's1', amount: 5000, cashAmount: 5000, upiAmount: 0, date: '2026-09-01' }),
    ] });
    b.api.resetRequestState();
    let denied = '';
    try { b.call('report', { token: tok.kali, id: 'overview', year: 2026 }); } catch (e) { denied = e.message; }
    eq(denied, 'no-report-access', 'backend A86: a user with no grant cannot open the overview REPORT');
    const d = b.call('pull', { token: tok.kali, year: 2026 }).data;
    eq(d.payments.length, 1,
       'backend A86: …but pull still hands them every payment — the grant shapes the screen, it does not hide the data');
    eq(String(d.parties[0].phone), '9000011111',
       'backend A86: …donor phone numbers included. Anything that must be SECRET cannot be solved with a report grant');
  }

  // ---- A79: the season target -------------------------------------------
  // A config key, so it needs the same two things every other one does: only an
  // admin may set it, and the whitelist must still refuse the keys that would
  // be catastrophic. setConfig reaching live_mode or data_epoch is the failure
  // the whitelist exists for, and adding a key is exactly when it gets widened
  // by accident.
  {
    const { b, tok } = book();
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    eq(b.call('setConfig', { token: tok.admin, key: 'target_amount', value: '200000' }).applied.join(','),
       'target_amount', 'backend A79: an admin can set the season target');
    eq(b.call('getConfig', { token: tok.ratan }).config.target_amount, '200000',
       'backend A79: …and every approved user can READ it — the bar is drawn on their own device');
    eq(refuses(function () { b.call('setConfig', { token: tok.ratan, key: 'target_amount', value: '999' }); }),
       'not-admin', 'backend A79: …but only an admin sets it');
    eq(refuses(function () { b.call('setConfig', { token: tok.admin, key: 'live_mode', value: 'on' }); }),
       'unknown-config-key', 'backend A79: …and the whitelist still refuses live_mode, which adding a key is the moment to break');
    b.call('setConfig', { token: tok.admin, key: 'target_amount', value: '' });
    eq(b.call('getConfig', { token: tok.ratan }).config.target_amount, '',
       'backend A79: clearing it stores empty, so the bar disappears rather than showing a target of zero');
  }

  // ---- A101: the master lists, EXECUTED rather than grepped ---------------
  // Hrishi opened the admin panel and দোকানের এলাকা was empty, while every
  // donor row and every receipt was using those same four areas. The regex
  // checks in run.js pin the shape; these pin the behaviour, because the shape
  // was right for posts and wrong for areas for months.
  {
    const { b, tok } = book();
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    const kinds = function () {
      const it = b.call('listItems', { token: tok.admin }).items;
      const n = {};
      ['area', 'location', 'position'].forEach(function (k) {
        n[k] = it.filter(function (i) { return i.kind === k; }).length;
      });
      return n;
    };
    eq(kinds().area, 4, 'backend A101: a fresh book has the four shop areas IN THE SHEET, not only in the client');
    eq(kinds().position, 4, 'backend A101: …and the four committee posts');

    // Hrishi's book: made before areas were seeded, so the rows are missing and
    // the marker was never written. It must heal on the next read — setup() is
    // run by hand and nobody was going to run it again.
    const grid = b.env._sheets.Lists._grid;
    for (let i = grid.length - 1; i >= 1; i--) if (String(grid[i][1]) === 'area') grid.splice(i, 1);
    const cfg = b.env._sheets.Config._grid;
    for (let i = cfg.length - 1; i >= 1; i--) if (String(cfg[i][0]) === 'lists_seeded') cfg.splice(i, 1);
    eq(kinds().area, 4, 'backend A101: an old book heals its areas on the next listItems, with no setup() run');
    eq(kinds().position, 4, 'backend A101: …without duplicating the posts it already had');

    // …and a delete STAYS deleted. This was the other half: the seeder used to
    // re-add any id it could not see, so removeItem answered ok, logged an
    // audit line, and the next refresh put the row back.
    b.call('removeItem', { token: tok.admin, id: 'president' });
    b.call('removeItem', { token: tok.admin, id: 'singhadaha' });
    eq(kinds().position, 3, 'backend A101: deleting a post deletes it…');
    eq(kinds().area, 3, 'backend A101: …deleting an area deletes it…');
    eq(kinds().position + kinds().area, 6,
       'backend A101: …and neither comes back on the next read, however many reads follow');
    eq(b.call('listItems', { token: tok.admin }).items.filter(function (i) {
      return i.id === 'president' || i.id === 'singhadaha';
    }).length, 0, 'backend A101: …by id, not by count');

    // the marker is not reachable through the admin config door
    eq(refuses(function () { b.call('setConfig', { token: tok.admin, key: 'lists_seeded', value: '' }); }),
       'unknown-config-key', 'backend A101: an admin cannot clear the seed marker and resurrect everything');
  }

  // ---- A109: go-live strips a blocked account, and nothing else ----------
  // Hrishi's rule. goLive keeps Users on purpose — twelve accounts cannot be
  // rebuilt on the morning of the puja — so a shut-out person's training-era
  // grants used to ride into the live season, where one tap on 🔓 handed the
  // cashier flag back with no confirmation anywhere.
  {
    const { b, tok } = book();
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    const row = function (u) { return b.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    b.call('setUserPosition', { token: tok.admin, userId: row('kali').id, position: 'treasurer' });
    b.call('setAreas', { token: tok.admin, userId: row('kali').id, areas: ['main_malda'] });
    b.call('setReports', { token: tok.admin, userId: row('kali').id, reports: ['dues'] });
    b.call('setCashier', { token: tok.admin, userId: row('kali').id, cashier: 1 });
    b.call('setStatus', { token: tok.admin, userId: row('kali').id, status: 'blocked', override: 1 });

    // the cap counts every holder regardless of status, so a blocked office
    // holder owns the post until something takes it off them
    eq(refuses(function () {
      b.call('setUserPosition', { token: tok.admin, userId: row('bimal').id, position: 'treasurer' });
    }), 'position-full:kali', 'backend A109: a blocked কোষাধ্যক্ষ owns the only treasurer slot…');

    const before = row('bimal');
    b.call('goLive', { token: tok.admin, confirm: 'LIVE', digits: 6 });
    const k = row('kali'), bm = row('bimal');

    eq([k.entries, k.reports, k.areas, k.position].map(String).join('|'), '|||',
       'backend A109: go-live takes entry rights, reports, areas and the post off a blocked account');
    eq(Number(k.cashier), 0, 'backend A109: …and the cashier flag with them');
    eq(String(k.status), 'blocked', 'backend A109: …while the account itself stays blocked');
    eq(refuses(function () { b.call('login', { username: 'kali', password: 'secret2', year: 2026 }); }),
       'blocked', 'backend A109: …and still cannot log in');

    // …and NOTHING else moves. This is the half that matters: an approved
    // collector must wake up on go-live morning exactly as they were.
    eq([bm.entries, bm.reports, bm.areas, bm.position, bm.cashier].map(String).join('|'),
       [before.entries, before.reports, before.areas, before.position, before.cashier].map(String).join('|'),
       'backend A109: an approved collector is untouched by it');

    eq(refuses(function () {
      b.call('setUserPosition', { token: tok.admin, userId: row('bimal').id, position: 'treasurer' });
    }), '', 'backend A109: …and the post the blocked account was holding is free again');
    const line = b.rows('Audit').filter(function (a) { return a.action === 'went-live'; })[0] || {};
    eq(/blocked accounts stripped=1/.test(String(line.detail || '')), true,
       'backend A109: the audit line says how many were stripped');
  }

  // A109: …and a blocked ADMIN is left alone, like clearUserGrants leaves one.
  // Written because removing that skip did NOT turn the suite red — the first
  // block above has no blocked admin in it, so the branch never ran. An
  // untested branch is an unguarded one.
  {
    const { b, tok } = book();
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    const row = function (u) { return b.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    b.call('setRole', { token: tok.admin, userId: row('ratan').id, role: 'admin' });
    b.call('setUserPosition', { token: tok.admin, userId: row('ratan').id, position: 'secretary' });
    eq(String(row('ratan').role), 'admin', 'backend A109: (a second admin exists to block)');
    b.call('setStatus', { token: tok.admin, userId: row('ratan').id, status: 'blocked', override: 1 });
    b.call('goLive', { token: tok.admin, confirm: 'LIVE', digits: 6 });
    eq(String(row('ratan').position), 'secretary',
       'backend A109: a blocked admin keeps their row — the strip skips admins, as clearUserGrants does');
    eq(refuses(function () { return null; }), '', 'backend A109: (sanity)');
  }

  // ---- A110: the emergency freeze, run rather than read --------------------
  // Hrishi: "temporary blocking — no money entry … after revoking, everything
  // as it was." One config key, nothing written per user, so there is no
  // restore to get wrong.
  {
    const { b, tok } = book();
    const refuses = function (f) { try { f(); return ''; } catch (e) { return e.message; } };
    const P = function (id, at) {
      return { store: 'payments', row: { id: id, partyId: 'p1', amount: 100, mode: 'cash',
                                         year: 2026, date: '2026-07-29', createdAt: at } };
    };
    b.call('push', { token: tok.ratan, year: 2026, records: [{ store: 'parties', row: {
      id: 'p1', type: 'shop', name: 'কমল', side: 'main_malda', pledged: 2000,
      year: 2026, date: '2026-07-29', createdAt: '2026-07-29T04:00:00.000Z' } }] });

    eq(refuses(function () { b.call('setFreeze', { token: tok.admin, on: '1' }); }),
       'confirm-required', 'backend A110: pausing everyone has to be typed');
    eq(refuses(function () { b.call('setFreeze', { token: tok.ratan, on: '1', confirm: 'FREEZE' }); }),
       'not-admin', 'backend A110: …and only an admin may');

    const f = b.call('setFreeze', { token: tok.admin, on: '1', confirm: 'FREEZE' });
    eq(!!f.freezeAt, true, 'backend A110: the switch records the MOMENT, not a flag');

    const r = b.call('push', { token: tok.ratan, year: 2026, records: [
      P('written-before', '2026-07-29T05:00:00.000Z'),
      P('typed-after', '2026-07-29T07:00:00.000Z'),
      { store: 'messages', row: { id: 'm1', text: 'সবাই থামো', year: 2026,
                                  date: '2026-07-29', createdAt: '2026-07-29T07:00:00.000Z' } } ] });
    // the offline backlog is money that physically exists; refusing it would
    // leave cash with no record anywhere
    eq((r.savedIds || []).indexOf('written-before') >= 0, true,
       'backend A110: anything written BEFORE the freeze still goes in');
    eq((r.savedIds || []).indexOf('m1') >= 0, true,
       'backend A110: …and chat stays open, because the stop has to be explainable');
    eq((r.heldIds || []).join(','), 'typed-after',
       'backend A110: …while what was typed after waits');
    // held, NOT rejected: A54 takes a refused row out of the queue for good,
    // and this block is temporary by definition
    eq((r.rejectedIds || []).length, 0,
       'backend A110: …and is not refused, so the phone keeps it queued');

    // the admin can still work — they are the one fixing whatever caused it
    eq((b.call('push', { token: tok.admin, year: 2026,
                         records: [P('admin-row', '2026-07-29T08:00:00.000Z')] }).savedIds || []).length, 1,
       'backend A110: the admin is exempt — a locked-out fixer helps nobody');

    // lifting it needs no ceremony, and the backlog goes in by itself
    b.call('setFreeze', { token: tok.admin, on: '0' });
    eq((b.call('push', { token: tok.ratan, year: 2026,
                         records: [P('typed-after', '2026-07-29T07:00:00.000Z')] }).savedIds || []).join(','),
       'typed-after', 'backend A110: lifting it lets the waiting rows through, untouched');
    eq(String(b.api.readConfig_().freeze_at || ''), '',
       'backend A110: …and the key is cleared, so nothing is left to remember');

    const acts = b.rows('Audit').filter(function (a) { return String(a.action).indexOf('freeze') === 0; })
      .map(function (a) { return a.action; }).join(',');
    eq(acts, 'freeze:on,freeze:off', 'backend A110: both directions are in the audit log');
  }

  // ---- A116: the pre-go-live review's eight guards -------------------------
  // A116b: an admin restoring a collector's backup must not become the SENDER
  // of the restored handovers — personalSummary_ keys on fromId, so both
  // people's in-hand would be wrong.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.admin, epoch: '', records: [
      rec('handovers', { id: 'h-re', year: 2026, collectorId: 'ratan', from: 'RATAN', fromId: 'ratan',
                         to: 'BIMAL', toId: 'bimal', amount: 700, cashAmount: 700, upiAmount: 0, date: '2026-08-02' }),
    ] });
    const h = b.rows('Handovers')[0];
    eq(h.fromId, 'ratan', 'backend A116: an admin-restored handover keeps the COLLECTOR as sender');
    eq(h.status, 'pending', 'backend A116: …and arrives pending, never pre-confirmed');
  }
  // A116c: the correction desk cannot void a donor who has payments — the same
  // rule voidAllowed_ enforces on the push door, at this door too.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 'cd1', year: 2026, type: 'shop', name: 'দোকান', pledged: 1000 }),
      rec('payments', { id: 'cp1', year: 2026, partyId: 'cd1', amount: 300, cashAmount: 300, upiAmount: 0, date: '2026-08-02' }),
      rec('corrections', { id: 'cc1', year: 2026, targetStore: 'parties', targetId: 'cd1', reason: 'ভুল' }),
    ] });
    let threw = '';
    try { b.call('resolveCorrection', { token: tok.admin, id: 'cc1', decision: 'approve' }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'party-has-money',
       'backend A116: approving a correction cannot orphan a money-bearing donor');
    eq(b.rows('Voids').length, 0, 'backend A116: …and no void was written');
  }
  // A116d: a VOIDED pending handover must not block standing somebody down.
  {
    const { b, tok } = book();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('handovers', { id: 'hv1', year: 2026, to: 'BIMAL', toId: 'bimal', amount: 500,
                         cashAmount: 500, upiAmount: 0, date: '2026-08-02' }),
      rec('voids', { id: 'vv1', year: 2026, targetStore: 'handovers', targetId: 'hv1', reason: 'ভুল করে' }),
    ] });
    const bid = b.rows('Users').filter(function (x) { return x.username === 'bimal'; })[0].id;
    const r = b.call('setAccess', { token: tok.admin, userId: bid, access: 'exiting' });
    eq(r.ok, true,
       'backend A116: a handover the sender Undid does not hold a stand-down hostage');
  }
  // A116e: removing a member and re-adding the same account must work — the
  // void travels but the sheet row stays, and the lookups must know that.
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', year: 2026 });
    const row = b.rows('Parties')[0].id;
    b.call('removeMember', { token: tok.ratan, id: row });
    const again = b.call('saveMember', { token: tok.ratan, name: 'কালী আবার', appUser: 'kali', year: 2026 });
    eq(again.ok, true, 'backend A116: a removed member can be re-added — removed is removed');
    let threw = '';
    try { b.call('saveMember', { token: tok.ratan, id: row, name: 'ভূত', appUser: 'kali', year: 2026 }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw === 'not-found' || threw === 'account-taken', true,
       'backend A116: …and editing the VOIDED row cannot report success into a row every screen hides');
  }
  // …and the findPartyRow_ half in ISOLATION: no re-add this time, so the only
  // guard between "removed" and "edited back into existence" is the void check
  // inside findPartyRow_ itself. The first version of this test re-added the
  // member first, so memberRowByUser_'s clash answered account-taken and the
  // findPartyRow_ guard could be deleted without anything going red.
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', year: 2026 });
    const row = b.rows('Parties')[0].id;
    b.call('removeMember', { token: tok.ratan, id: row });
    let threw = '';
    try { b.call('saveMember', { token: tok.ratan, id: row, name: 'ভূত', appUser: 'kali', year: 2026 }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'not-found',
       'backend A116: a voided member row is NOT FOUND — editing it cannot resurrect it');
  }
  // A116h: a record naming a store this server never heard of is REJECTED, not
  // left in limbo — a row in none of the three lists is re-pushed for ever.
  {
    const { b, tok } = book();
    const r = b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('nonsense', { id: 'zz1', year: 2026, amount: 100 }),
    ] });
    eq((r.rejectedIds || []).indexOf('zz1') >= 0, true,
       'backend A116: an unknown store lands in rejectedIds so the queue can drain');
  }

  // ---- the version/schema handshake every client depends on ---------------
  {
    const { b, tok } = book();
    const r = b.post('pull', { token: tok.ratan, year: 2026, appVersion: 'chanda-v1.0.0', appSchema: 1 });
    eq(r.codeVersion, b.api.CODE_VERSION, 'backend version: every response carries the deployed version…');
    eq(r.schema, b.api.CODE_SCHEMA, 'backend version: …and the contract number the lock reads');
    const row = b.rows('Users').filter(function (u) { return u.username === 'ratan'; })[0];
    eq(row.appVersion, 'chanda-v1.0.0', 'backend version: …and the phone’s version is recorded for the fleet list');
  }

  // ---- A115: the committee register and who may hand out a post -----------
  // The bug this stands guard over, measured before the fix: an admin removed
  // কালী's post in the admin panel and the member register still called him
  // কোষাধ্যক্ষ, so রতন could be made কোষাধ্যক্ষ too and the book had two of a
  // post capped at one. The post now lives in ONE place — the Users sheet — and
  // every door to it comes through canAssignPosition_.
  //
  // Levels are NOT seeded; Hrishi types them in. Each book here sets them the
  // way he will, before anything reads them.
  function committee() {
    const { b, tok } = book();
    [['president', 40], ['secretary', 30], ['treasurer', 20], ['member', 10]].forEach(function (p) {
      b.call('setPositionRules', { token: tok.admin, id: p[0], level: p[1] });
    });
    // কোষাধ্যক্ষ carries the money key, like the committee word means
    b.call('setPositionRules', { token: tok.admin, id: 'treasurer', perms: ['cashier'] });
    const id = function (u) { return b.rows('Users').filter(function (x) { return x.username === u; })[0].id; };
    // রতন keeps the register and is সম্পাদক; কালী is an ordinary সদস্য
    b.call('setEntries', { token: tok.admin, userId: id('ratan'),
                           entries: ['shop', 'person', 'member', 'road', 'toto', 'bus', 'memberadmin'] });
    b.call('setUserPosition', { token: tok.admin, userId: id('ratan'), position: 'secretary' });
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: 'member' });
    return { b: b, tok: tok, id: id };
  }
  const denied = function (b, tok, body) {
    try { b.call('saveMember', Object.assign({ token: tok }, body)); return ''; }
    catch (e) { return String(e.message || e); }
  };

  // the account is mandatory — this is what collapses the two copies into one
  {
    const { b, tok } = committee();
    eq(denied(b, tok.ratan, { name: 'নতুন লোক' }), 'member-needs-account',
       'backend A115: a committee member with no app account is refused');
    eq(b.rows('Parties').length, 0, 'backend A115: …and nothing was written');
  }

  // nobody keeps their own committee record — through EITHER field
  {
    const { b, tok } = committee();
    eq(denied(b, tok.ratan, { name: 'RATAN', appUser: 'ratan' }), 'member-self',
       'backend A115: you cannot write your own member row');
    // and the row you already own cannot be re-pointed at somebody else either
    b.call('saveMember', { token: tok.admin, name: 'RATAN', appUser: 'ratan', year: 2026 });
    const mine = b.rows('Parties')[0].id;
    eq(denied(b, tok.ratan, { id: mine, name: 'RATAN', appUser: 'kali' }), 'member-self',
       'backend A115: …nor edit the row that points at you');
  }

  // one account, one row — two rows could each claim to author one post
  {
    const { b, tok } = committee();
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', year: 2026 });
    eq(denied(b, tok.ratan, { name: 'কালী আবার', appUser: 'kali' }), 'account-taken',
       'backend A115: one account cannot hold two member rows');
  }

  // the post goes to the USER, and Parties.position is never written again
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', position: 'member', year: 2026 });
    const u = b.rows('Users').filter(function (x) { return x.username === 'kali'; })[0];
    eq(u.position, 'member', 'backend A115: the post set in the register lands on the USER');
    eq(String(b.rows('Parties')[0].position || ''), '',
       'backend A115: …and the member row keeps no second copy of it');
  }

  // a post change must not disturb what the person was granted personally
  {
    const { b, tok, id } = committee();
    b.call('setEntries', { token: tok.admin, userId: id('kali'), entries: ['shop', 'otherdonor'] });
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', position: 'member', year: 2026 });
    const u = b.rows('Users').filter(function (x) { return x.username === 'kali'; })[0];
    eq(String(u.entries).indexOf('otherdonor') >= 0, true,
       'backend A115: personal permissions survive a post change untouched');
  }

  // ---- the level rules ----------------------------------------------------
  // সম্পাদক (30) may appoint a সদস্য (10) …
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', position: 'member', year: 2026 });
    eq(b.rows('Users').filter(function (x) { return x.username === 'kali'; })[0].position, 'member',
       'backend A115: a সম্পাদক may appoint below their own level');
  }
  // … but never to their own level, and never above it
  {
    const { b, tok } = committee();
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: 'secretary', year: 2026 }),
       'position-denied:level-want',
       'backend A115: nobody appoints to their OWN level');
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: 'president', year: 2026 }),
       'position-denied:level-want',
       'backend A115: …nor above it');
  }
  // THE separate check: removing a post sends want='', whose level is 0, so the
  // wanted-post test passes every time. Only a test on the TARGET's current
  // post can stop a junior stripping a senior.
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: 'president' });
    b.call('setPositionRules', { token: tok.admin, id: 'president', maxCount: 0 });
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: '', year: 2026 }),
       'position-denied:level-target',
       'backend A115: a junior cannot STRIP a senior — the target’s post is its own check');
    eq(b.rows('Users').filter(function (x) { return x.username === 'kali'; })[0].position, 'president',
       'backend A115: …and the senior kept the post');
  }
  // an un-ranked person hands out nothing — the un-seeded book keeps working,
  // with the admin doing every appointment, exactly as it does today
  {
    const { b, tok, id } = committee();
    b.call('setPositionRules', { token: tok.admin, id: 'secretary', level: 0 });
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: 'member', year: 2026 }),
       'position-denied:no-level',
       'backend A115: no level means no appointments — it fails the safe way');
  }
  // 💰 stays admin-only, tested on the post's LIVE perms, not on its id
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: 'treasurer', year: 2026 }),
       'position-denied:cashier-admin-only',
       'backend A115: a post carrying 💰 can only be given by an admin');
  }
  // …and taking 💰 away is the same power as giving it. Found on a real screen,
  // not by a test: রতন is সম্পাদক (30) and কালী is কোষাধ্যক্ষ (20), so every
  // level rule said "go ahead" while the post being removed carried the one
  // money key a post can hold. A rule written for giving and unguarded for
  // taking is not a rule.
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: 'treasurer' });
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: '', year: 2026 }),
       'position-denied:cashier-admin-only',
       'backend A115: a senior cannot STRIP a 💰 post either — only an admin');
    eq(b.rows('Users').filter(function (x) { return x.username === 'kali'; })[0].position, 'treasurer',
       'backend A115: …and the treasurer kept it');
  }
  // blocked means blocked
  {
    const { b, tok, id } = committee();
    b.call('setStatus', { token: tok.admin, userId: id('kali'), status: 'blocked' });
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: 'member', year: 2026 }),
       'user-not-approved', 'backend A115: a blocked account takes no member row at all');
  }
  // 🚨 the emergency stop closes this door too — handing out a post during a
  // freeze would be a stop with a door left open in it
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    b.call('setFreeze', { token: tok.admin, on: '1', confirm: 'FREEZE' });
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: 'member', year: 2026 }),
       'position-denied:freeze', 'backend A115: a freeze stops appointments as well as money');
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: 'member' });
    eq(b.rows('Users').filter(function (x) { return x.username === 'kali'; })[0].position, 'member',
       'backend A115: …but the admin can still act during one');
  }
  // the grant itself
  {
    const { b, tok } = committee();
    eq(denied(b, tok.bimal, { name: 'কালী', appUser: 'kali', year: 2026 }), 'forbidden',
       'backend A115: without memberadmin the register is closed, cashier or not');
  }

  // ---- canAssignPosition_, tested directly --------------------------------
  // saveMember refuses a self-edit and a blocked account BEFORE this function
  // is reached, so these two branches are unreachable through any request —
  // and a guard no test can exercise is a guard that will rot without anyone
  // noticing. They stay because this function is the shared rule behind two
  // doors, and the next door added must not be able to skip them.
  {
    const { b, tok, id } = committee();
    // কালী starts postless, or `want === have` would answer '' first and both
    // assertions below would pass without ever reaching the rule they name.
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    b.api.resetRequestState();
    const row = function (u) { return b.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    const ratan = row('ratan');
    eq(b.api.canAssignPosition_(ratan, ratan, 'member'), 'self',
       'backend A115: canAssignPosition_ refuses a self-appointment on identity alone');
    eq(b.api.canAssignPosition_(ratan, row('kali'), 'member'), '',
       'backend A115: …and allows that very appointment for somebody else');
    b.call('setStatus', { token: tok.admin, userId: id('kali'), status: 'blocked' });
    b.api.resetRequestState();
    eq(b.api.canAssignPosition_(ratan, row('kali'), 'member'), 'target-not-approved',
       'backend A115: …and refuses to post a blocked account');
  }
  // several posts may share a level — joint secretaries are peers, and peers
  // cannot appoint each other
  {
    const { b, tok } = committee();
    b.call('addItem', { token: tok.admin, kind: 'position', nameBn: 'সহ-সম্পাদক', nameEn: 'Joint Secretary' });
    const joint = b.rows('Lists').filter(function (r) { return r.nameEn === 'Joint Secretary'; })[0];
    b.call('setPositionRules', { token: tok.admin, id: joint.id, level: 30 });
    eq(b.call('listItems', { token: tok.admin, kind: 'position' }).items
        .filter(function (i) { return i.level === 30; }).length, 2,
       'backend A115: two posts may hold the same level — nothing demands uniqueness');
    eq(denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: joint.id, year: 2026 }),
       'position-denied:level-want',
       'backend A115: …and neither peer can appoint the other');
  }

  // ---- a slot taken is taken, whoever is sitting in it ---------------------
  // The client used to skip admins when counting a post's holders and the
  // server never did, so an admin holding কোষাধ্যক্ষ made the dropdown read
  // "0/1, free" while the save answered `position-full`. Pinned server-side
  // because that is the side that decides.
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('hrishi'), position: 'president' });
    let threw = '';
    try { b.call('setUserPosition', { token: tok.admin, userId: id('bimal'), position: 'president' }); }
    catch (e) { threw = String(e.message || e); }
    eq(threw, 'position-full:hrishi',
       'backend A115: an ADMIN holding a post occupies its slot like anybody else');
  }

  // ---- the roster must reach a phone that is only polling ------------------
  // The one this suite did not catch and a real screen did: changing a post
  // writes to Users and to nothing else, so `data_ts` never moves and every
  // device sits on pull's idle fast path. If the roster does not ride THAT
  // response, a post change reaches nobody until the next full pull — on the
  // very feature whose promise is that a post has one value everywhere.
  {
    const { b, tok, id } = committee();
    // one real write first, so `data_ts` exists — the fast path needs a
    // watermark to compare against and skips itself on a book that has none
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 'w1', year: 2026, type: 'shop', name: 'দোকান', pledged: 100 })] });
    const first = b.call('pull', { token: tok.ratan, year: 2026 });
    const idle = b.call('pull', { token: tok.ratan, year: 2026, since: String(first.cursor) });
    eq(idle.idle, true, 'backend A115: a poll with nothing new takes the fast path…');
    eq(Object.keys(idle.data || {}).length, 0, 'backend A115: …and reads no ledger rows…');
    eq((idle.committee || []).length > 0, true, 'backend A115: …but still carries the committee roster');
    b.call('setUserPosition', { token: tok.admin, userId: id('bimal'), position: 'president' });
    const after = b.call('pull', { token: tok.ratan, year: 2026, since: String(first.cursor) });
    eq((after.committee || []).filter(function (x) { return x.username === 'bimal'; })[0].position, 'president',
       'backend A115: …so a post changed on the admin panel reaches a polling phone');
  }

  // ---- a post can no longer arrive through the sync queue ------------------
  {
    const { b, tok } = committee();
    b.call('push', { token: tok.ratan, epoch: '', records: [
      rec('parties', { id: 'm-post', year: 2026, type: 'member', name: 'ফাঁকি', position: 'president' }),
      rec('parties', { id: 'm-plain', year: 2026, type: 'member', name: 'পুরোনো queue' }),
    ] });
    // A116g: the post is STRIPPED and the person kept — this used to reject the
    // whole row, losing the member's name and phone from an old offline queue
    // while the comment promised "only the part that grants power is refused".
    const saved = {};
    b.rows('Parties').forEach(function (p) { saved[String(p.id)] = p; });
    eq(!!saved['m-post'], true,
       'backend A116: a pushed member row carrying a post keeps the PERSON…');
    eq(String(saved['m-post'].position || ''), '',
       'backend A116: …and loses only the post, which has exactly one door (saveMember)');
    eq(!!saved['m-plain'], true,
       'backend A115: …and a post-less row still drains, so an old offline queue is not silently dropped');
  }

  // ---- removing a member --------------------------------------------------
  {
    const { b, tok, id } = committee();
    b.call('setUserPosition', { token: tok.admin, userId: id('kali'), position: '' });
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', position: 'member', year: 2026 });
    const row = b.rows('Parties')[0].id;
    let threw = '';
    try { b.call('removeMember', { token: tok.ratan, id: row }); } catch (e) { threw = String(e.message || e); }
    eq(threw, 'member-holds-post:member',
       'backend A115: a member holding a post cannot be deleted — the post would be orphaned');
    b.call('saveMember', { token: tok.ratan, id: row, name: 'কালী', appUser: 'kali', position: '', year: 2026 });
    b.call('removeMember', { token: tok.ratan, id: row });
    // A60's mechanism: a `voids` row, not a deleted sheet row. A deleted row
    // reaches no other phone — a delta pull carries what CHANGED, and a row
    // that no longer exists changes nothing.
    const v = b.rows('Voids').filter(function (x) { return String(x.targetId) === String(row); })[0];
    eq(!!v && v.targetStore === 'parties', true,
       'backend A115: …and once the post is off it is voided, so the removal travels');
  }

  // ---- the refusals are written down --------------------------------------
  // In a permission system the attempt that FAILS is the one worth keeping: a
  // successful-action log can never show you somebody trying the door.
  {
    const { b, tok } = committee();
    denied(b, tok.ratan, { name: 'কালী', appUser: 'kali', position: 'president', year: 2026 });
    const line = b.rows('Audit').filter(function (a) { return a.action === 'denied:position'; })[0];
    eq(!!line, true, 'backend A115: a refused appointment is audited');
    eq(String(line.detail).indexOf('level-want') >= 0 && String(line.detail).indexOf('@kali') >= 0, true,
       'backend A115: …with who, whom, and which rule stopped it');
  }
  // and so is a member edit, in a shape a human can read
  {
    const { b, tok } = committee();
    b.call('saveMember', { token: tok.ratan, name: 'কালী', appUser: 'kali', phone: '9000000001', year: 2026 });
    const row = b.rows('Parties')[0].id;
    b.call('saveMember', { token: tok.ratan, id: row, name: 'কালীপদ', appUser: 'kali', phone: '9000000002', year: 2026 });
    const acts = b.rows('Audit').filter(function (a) { return String(a.action).indexOf('member:') === 0; })
      .map(function (a) { return a.action; }).join(',');
    eq(acts, 'member:add,member:edit', 'backend A115: adding and editing a member are both audited');
    const edit = b.rows('Audit').filter(function (a) { return a.action === 'member:edit'; })[0];
    eq(/কালী .*→.*কালীপদ/.test(String(edit.detail)), true,
       'backend A115: …and the edit line says what it was before, not only after');
  }

  // --- A162: the 🎭 keys are enforced HERE, not only drawn on the client -----
  // Measured from every role before the fix: a person holding progdonor and
  // progmoney could save ONE of the programme's five kinds — টিকিট, the only
  // one whose key happens to be an ENTRY_KIND. The other four walked their
  // whole flow and vanished at push, because Code.gs answered every 🎭 entry
  // with the puja book's rules (isCashier for money, the plain 'person' key
  // for a donor) and PROGRAM_KEYS appeared nowhere but its own declaration.
  // A drawn tile that silently discards the entry is worse than no tile.
  {
    function progBook() {
      const b = loadBackend();
      b.api.setup();
      b.post('register', { username: 'hrishi', name: 'হৃষিকেশ', password: 'secret1', phone: '9876543210' });
      ['subrata', 'tapan', 'kali'].forEach(function (u, i) {
        b.post('register', { username: u, name: u, password: 'secret' + i, phone: '98765400' + (20 + i) });
      });
      const admin = b.call('login', { username: 'hrishi', password: 'secret1', year: 2026 }).token;
      const rowOf = function (u) { return b.rows('Users').filter(function (x) { return x.username === u; })[0]; };
      ['subrata', 'tapan', 'kali'].forEach(function (u) {
        b.call('setStatus', { token: admin, userId: rowOf(u).id, status: 'approved' });
        b.call('approveYear', { token: admin, userId: rowOf(u).id, year: 2026 });
      });
      b.call('setEntries', { token: admin, userId: rowOf('subrata').id,
                             entries: ['progteam', 'progdonor', 'progmoney', 'ticket'] });
      b.call('setEntries', { token: admin, userId: rowOf('tapan').id, entries: ['shop', 'person'] });
      b.call('setEntries', { token: admin, userId: rowOf('kali').id, entries: ['shop', 'person'] });
      b.call('setCashier', { token: admin, userId: rowOf('kali').id, cashier: 1 });
      const tok = { admin: admin };
      ['subrata', 'tapan', 'kali'].forEach(function (u, i) {
        tok[u] = b.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
      });
      return { b: b, tok: tok };
    }
    let seq = 0;
    const saves = function (bk, who, store, row) {
      const r = bk.b.call('push', { token: bk.tok[who],
        records: [rec(store, Object.assign({ id: 'a162-' + (++seq), year: 2026 }, row))] });
      return (r.savedIds || []).length > 0;
    };
    const PROG_EXPENSE = { subject: 'শিল্পী', amount: 500, cashAmount: 500, upiAmount: 0, date: '2026-09-05', sector: 'program' };
    const PUJA_EXPENSE = { subject: 'আলো', amount: 500, cashAmount: 500, upiAmount: 0, date: '2026-09-05', sector: 'puja' };
    const PROG_DUTY = { source: 'commitment', payee: 'রূপা', committed: 5000, amount: 0, date: '2026-09-05', sector: 'program' };
    const OUT = { source: 'transfer', transferTo: 'puja', sector: 'program', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-09-05' };
    const IN = { source: 'transfer', transferTo: 'program', sector: 'puja', amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-09-05' };
    const PROG_DONOR = { type: 'person', name: 'D', pledged: 100, sector: 'program' };
    const PUJA_DONOR = { type: 'person', name: 'E', pledged: 100, sector: 'puja' };
    const PROG_SPONSOR = { type: 'sponsor', name: 'S', pledged: 100, sector: 'program' };

    let k = progBook();
    eq(saves(k, 'subrata', 'expenses', PROG_EXPENSE), true,
       'backend A162: progmoney spends the PROGRAMME fund without being a cashier');
    eq(saves(k, 'subrata', 'expenses', PROG_DUTY), true,
       'backend A162: …and records a দায় against it');
    eq(saves(k, 'subrata', 'expenses', OUT), true,
       'backend A162: …and moves money OUT of the programme');
    eq(saves(k, 'subrata', 'parties', PROG_DONOR), true,
       'backend A162: progdonor writes a donor into the programme book');

    // the other half of every pair — the grant must not reach the puja's purse
    k = progBook();
    eq(saves(k, 'subrata', 'expenses', PUJA_EXPENSE), false,
       'backend A162: …but progmoney does NOT spend the puja fund');
    eq(saves(k, 'subrata', 'expenses', IN), false,
       'backend A162: …and does NOT pull committee money INTO the programme');
    eq(saves(k, 'subrata', 'parties', PUJA_DONOR), false,
       'backend A162: …and progdonor does not write into the puja book');
    eq(saves(k, 'subrata', 'parties', PROG_SPONSOR), false,
       'backend A162: …and a সponsor still needs the sponsor key, 🎭 tab or not');

    // and the programme's book is shut to a collector holding the commonest key
    k = progBook();
    eq(saves(k, 'tapan', 'parties', PROG_DONOR), false,
       'backend A162: a plain "person" grant cannot file into the programme book');
    eq(saves(k, 'tapan', 'expenses', PROG_EXPENSE), false,
       'backend A162: …nor spend its money');
    eq(saves(k, 'tapan', 'parties', PUJA_DONOR), true,
       'backend A162: …while the puja book still works for them');

    // the treasurer keeps every power they had
    k = progBook();
    eq(saves(k, 'kali', 'expenses', PUJA_EXPENSE), true, 'backend A162: the cashier still spends the puja fund');
    eq(saves(k, 'kali', 'expenses', PROG_EXPENSE), true, 'backend A162: …and the programme fund');
    eq(saves(k, 'kali', 'expenses', IN), true, 'backend A162: …and may seed the programme, which only they may');
    eq(saves(k, 'kali', 'parties', PROG_DONOR), false,
       'backend A162: …but being cashier is not being on the programme team');

    // A150/A151's own rules, moved from a regex over Code.gs to a real request.
    // The regexes matched the literal `!isCashier` and broke the moment that
    // clause grew a second way to be true; what they were guarding is here.
    k = progBook();
    eq(saves(k, 'tapan', 'expenses', OUT), false,
       'backend A150: a collector cannot move money between funds at all');
    eq(saves(k, 'kali', 'expenses', { source: 'transfer', transferTo: 'nowhere', sector: 'puja',
        amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-09-05' }), false,
       'backend A150: …and a transfer to a fund that does not exist is refused');
    eq(saves(k, 'kali', 'expenses', { source: 'transfer', transferTo: 'puja', sector: 'puja',
        amount: 100, cashAmount: 100, upiAmount: 0, date: '2026-09-05' }), false,
       'backend A150: …as is one that goes nowhere');
    eq(saves(k, 'tapan', 'expenses', PROG_DUTY), false,
       'backend A151: a collector cannot record a promise');
    eq(saves(k, 'kali', 'expenses', { source: 'commitment', payee: '', committed: 5000,
        amount: 0, date: '2026-09-05', sector: 'puja' }), false,
       'backend A151: …nor a cashier one that names nobody');
    eq(saves(k, 'kali', 'expenses', { source: 'commitment', payee: 'রূপা', committed: 0,
        amount: 0, date: '2026-09-05', sector: 'puja' }), false,
       'backend A151: …nor one for nothing');
  }

  // --- A163: every action in the table, attempted by a plain collector ------
  // The mirror rule this project keeps relearning: a power is guarded only if
  // BOTH halves are, and the unguarded half is where the exploit lives. Rather
  // than a hand-written list — the duplication bug that produced A146-A149 and
  // A160 — the cases are DERIVED from ACTIONS in Code.gs, so an action added
  // tomorrow without a guard fails here without anyone remembering to add it.
  {
    const gs = require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
    const table = gs.slice(gs.indexOf('var ACTIONS = {'));
    const actions = (table.match(/^  [a-zA-Z_]+: function/gm) || [])
      .map(function (m) { return m.trim().split(':')[0]; });
    eq(actions.length > 40, true, 'backend A163: the action table was found (' + actions.length + ')');

    // Actions a logged-in collector is SUPPOSED to reach. Everything else must
    // refuse them. Listing the open ones is safe in a way that listing the
    // guarded ones is not: forgetting an entry here makes the test stricter,
    // never blinder.
    const OPEN = ['register', 'login', 'logout', 'changePassword', 'push', 'pull',
                  'getConfig', 'reportList', 'report', 'myReport', 'notifications',
                  'pendingHandovers', 'pendingCorrections', 'cashiers', 'listSubjects',
                  'listItems', 'updateProfile', 'listBackups'];
    const b2 = loadBackend();
    b2.api.setup();
    b2.post('register', { username: 'hrishi', name: 'হৃষিকেশ', password: 'secret1', phone: '9876543210' });
    b2.post('register', { username: 'ratan', name: 'রতন', password: 'secret2', phone: '9876543299' });
    const admin2 = b2.call('login', { username: 'hrishi', password: 'secret1', year: 2026 }).token;
    const rat = b2.rows('Users').filter(function (x) { return x.username === 'ratan'; })[0];
    b2.call('setStatus', { token: admin2, userId: rat.id, status: 'approved' });
    b2.call('approveYear', { token: admin2, userId: rat.id, year: 2026 });
    const plain = b2.call('login', { username: 'ratan', password: 'secret2', year: 2026 }).token;

    const leaked = [];
    actions.forEach(function (a) {
      if (OPEN.indexOf(a) >= 0) return;
      let allowed = false;
      try {
        // every plausible shape at once — the guard must fire before any of it
        // is looked at, so a wrong parameter cannot be mistaken for a refusal
        const r = b2.call(a, { token: plain, userId: rat.id, year: 2027, role: 'admin',
          cashier: 1, entries: ['guptview'], reports: ['summary'], areas: [], position: '',
          status: 'approved', access: '', frozen: 1, confirm: 'LIVE', receiptDigits: 6,
          config: { program_on: 'on' }, name: 'x', nameBn: 'x', nameEn: 'x', kind: 'area',
          id: rat.id, perms: 'cashier', store: 'payments', field: 'anomalyOk', decision: 'accept',
          reason: 'x', appUser: 'ratan', phone: '9000000001' });
        allowed = !(r && r.error);
      } catch (e) { allowed = false; }
      if (allowed) leaked.push(a);
    });
    eq(leaked.join(',') || '(none)', '(none)',
       'backend A163: no action outside the open list answers a plain collector');
  }

  // --- A163: one book, read from six roles ---------------------------------
  // The check Hrishi asked for by hand, kept. Every earlier confidentiality
  // test asserted one rule at a time on rows built for it; this builds ONE
  // book — an open donor, a sponsor, a গুপ্ত দান, a programme fund, a
  // confidential handover — and asks each role what it can see. Two of the
  // failures it first reported were the fixture's own fault (a handover with
  // no breakdown, a party whose push was refused), which is the point: a
  // fixture the screens could not have produced proves nothing.
  {
    const bk = loadBackend();
    bk.api.setup();
    const who = ['hrishi', 'kali', 'bimal', 'ratan', 'subrata'];
    who.forEach(function (u, i) {
      bk.post('register', { username: u, name: u, password: 'secret' + i, phone: '98700000' + i });
    });
    const a = bk.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const row = function (u) { return bk.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    who.slice(1).forEach(function (u) {
      bk.call('setStatus', { token: a, userId: row(u).id, status: 'approved' });
      bk.call('approveYear', { token: a, userId: row(u).id, year: 2026 });
    });
    bk.call('setEntries', { token: a, userId: row('kali').id,
      entries: ['shop', 'person', 'sponsor', 'gupt', 'sponsorview', 'guptview'] });
    bk.call('setEntries', { token: a, userId: row('bimal').id, entries: ['shop', 'person', 'sponsor', 'gupt'] });
    bk.call('setEntries', { token: a, userId: row('ratan').id, entries: ['shop', 'person'] });
    bk.call('setEntries', { token: a, userId: row('subrata').id, entries: ['shop', 'progteam', 'progdonor', 'progmoney', 'ticket'] });
    bk.call('setCashier', { token: a, userId: row('kali').id, cashier: 1 });
    const tk = { hrishi: a };
    who.slice(1).forEach(function (u, i) {
      tk[u] = bk.call('login', { username: u, password: 'secret' + (i + 1), year: 2026 }).token;
    });
    const put = function (u, store, r) { bk.call('push', { token: tk[u], records: [rec(store, r)] }); };
    put('ratan', 'parties', { id: 'r-p1', year: 2026, type: 'shop', name: 'দোকান', pledged: 5000, sector: 'puja' });
    put('ratan', 'payments', { id: 'r-y1', year: 2026, partyId: 'r-p1', partyName: 'দোকান', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' });
    put('kali', 'parties', { id: 'r-p2', year: 2026, type: 'sponsor', name: 'Bose', pledged: 50000, sector: 'puja' });
    put('kali', 'payments', { id: 'r-y2', year: 2026, partyId: 'r-p2', partyName: 'Bose', amount: 20000, cashAmount: 20000, upiAmount: 0, date: '2026-09-05' });
    put('bimal', 'parties', { id: 'r-p3', year: 2026, type: 'gupt', name: 'শুভাকাঙ্ক্ষী', pledged: 0, sector: 'puja' });
    put('bimal', 'payments', { id: 'r-y3', year: 2026, partyId: 'r-p3', partyName: 'শুভাকাঙ্ক্ষী', amount: 8000, cashAmount: 8000, upiAmount: 0, date: '2026-09-05' });
    put('bimal', 'handovers', { id: 'r-h1', year: 2026, amount: 8000, cashAmount: 8000, upiAmount: 0,
      toId: 'kali', toName: 'kali', date: '2026-09-05', status: 'confirmed',
      breakdown: JSON.stringify({ gupt: { cash: 8000, upi: 0 } }) });

    const sees = function (u) {
      const d = (bk.call('pull', { token: tk[u], since: 0 }) || {}).data || {};
      const k = {};
      (d.parties || []).forEach(function (p) { k[p.type] = (k[p.type] || 0) + 1; });
      return { kinds: k, parties: d.parties || [], payments: d.payments || [], handovers: d.handovers || [] };
    };
    const S = {}; who.forEach(function (u) { S[u] = sees(u); });

    eq(!!(S.hrishi.kinds.sponsor && S.hrishi.kinds.gupt), true, 'backend A163: admin sees both confidential kinds');
    eq(!!(S.kali.kinds.sponsor && S.kali.kinds.gupt), true, 'backend A163: both view grants see both');
    eq(!S.ratan.kinds.sponsor && !S.ratan.kinds.gupt, true, 'backend A163: no view grant sees neither');
    eq(!!S.bimal.kinds.gupt, true, 'backend A163: the writer sees their OWN গুপ্ত দান without guptview');
    eq(!S.bimal.kinds.sponsor, true, 'backend A163: …and still not somebody else\'s sponsor');
    eq(S.kali.handovers.length, 1, 'backend A163: guptview sees the handover of that money');
    eq(S.ratan.handovers.length, 0, 'backend A163: …and nobody else does');

    // whole parcels — the invariant the whole design rests on
    who.forEach(function (u) {
      const ids = {}; S[u].parties.forEach(function (p) { ids[p.id] = 1; });
      const orphan = S[u].payments.filter(function (p) { return p.partyId && !ids[p.partyId]; });
      eq(orphan.length, 0, 'backend A163: ' + u + ' holds no payment whose donor they cannot see');
    });

    // --- A164: the reports obey the same rule as the ledger ------------------
    // `report` computed over readAll_ — the WHOLE book — while `pull` went
    // through visible_. `dues` returns donor rows by NAME, so anybody holding
    // 📋 বাকির তালিকা could read every sponsor and every গুপ্ত দান donor with
    // an outstanding pledge, sponsorview or not. No screen walked through it
    // (the phone computes reports locally from its own filtered snapshot),
    // which is exactly why it lasted: a hole the app never uses is a hole only
    // a direct call finds.
    const rl = require('../js/aggregate.js').REPORT_IDS.slice();
    ['kali', 'ratan', 'bimal'].forEach(function (u) {
      bk.call('setReports', { token: a, userId: row(u).id, reports: rl });
    });
    put('kali', 'parties', { id: 'r-p4', year: 2026, type: 'sponsor', name: 'ZZSPONSORZZ',
                             pledged: 100000, sector: 'puja' });
    put('kali', 'payments', { id: 'r-y4', year: 2026, partyId: 'r-p4', partyName: 'ZZSPONSORZZ',
                              amount: 1000, cashAmount: 1000, upiAmount: 0, date: '2026-09-05' });
    const duesFor = function (u) {
      const r = bk.call('report', { token: tk[u], id: 'dues', year: 2026 });
      return JSON.stringify((r && r.data) || {});
    };
    eq(duesFor('kali').indexOf('ZZSPONSORZZ') >= 0, true,
       'backend A164: sponsorview reads the sponsor in the dues report');
    eq(duesFor('ratan').indexOf('ZZSPONSORZZ') >= 0, false,
       'backend A164: …and a collector without it does not, even calling the API directly');
    eq(duesFor('bimal').indexOf('ZZSPONSORZZ') >= 0, false,
       'backend A164: …nor one who may TAKE sponsors but not see everyone\'s');
    eq(/var d = visible_\(readAll_\(/.test(
         require('fs').readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8')), true,
       'backend A164: …because report goes through visible_, like pull');
  }

  // --- A165: the freeze, for the actions that skip push --------------------
  // push has held rows since A110. The three actions that move money WITHOUT
  // push were never gated — a suspicion already written down in pending.md,
  // and true: confirmHandover and rejectHandover each move money in two
  // people's books, resolveCorrection settles a disputed amount, and all three
  // ran against a frozen year, so a closed final statement could still change.
  {
    function frozenBook() {
      const bb = loadBackend();
      bb.api.setup();
      ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
        bb.post('register', { username: u, name: u, password: 'secret' + i, phone: '98600000' + i });
      });
      let t0 = bb.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
      const rw = function (u) { return bb.rows('Users').filter(function (x) { return x.username === u; })[0]; };
      ['kali', 'ratan'].forEach(function (u) {
        bb.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
        bb.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
        bb.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'review'] });
      });
      bb.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
      // NOTE: logging in again mints a new token and kills the old one — the
      // harness says so in its own header, and it cost a debugging detour here.
      const tt = {};
      ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
        tt[u] = bb.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
      });
      const put = function (u, store, row) { bb.call('push', { token: tt[u], records: [rec(store, row)] }); };
      put('ratan', 'parties', { id: 'f-p1', year: 2026, type: 'shop', name: 'X', pledged: 5000, sector: 'puja' });
      put('ratan', 'payments', { id: 'f-y1', year: 2026, partyId: 'f-p1', partyName: 'X', amount: 5000, cashAmount: 5000, upiAmount: 0, date: '2026-09-05' });
      put('ratan', 'handovers', { id: 'f-h1', year: 2026, amount: 5000, cashAmount: 5000, upiAmount: 0, toId: 'kali', toName: 'kali', date: '2026-09-05', status: 'pending' });
      put('ratan', 'handovers', { id: 'f-h2', year: 2026, amount: 1000, cashAmount: 1000, upiAmount: 0, toId: 'kali', toName: 'kali', date: '2026-09-05', status: 'pending' });
      put('ratan', 'corrections', { id: 'f-c1', year: 2026, targetStore: 'payments', targetId: 'f-y1', note: 'ভুল', date: '2026-09-05' });
      bb.call('setFreeze', { token: tt.hrishi, on: '1', confirm: 'FREEZE', year: 2026 });
      return { bb: bb, tt: tt };
    }
    // state, not the error — an action can throw for a dozen reasons and only
    // the sheet says whether the money actually moved
    const stateOf = function (bb, store, id, field) {
      const r = bb.rows(store).filter(function (x) { return String(x.id) === id; })[0];
      return r ? String(r[field] || '—') : '(gone)';
    };
    const attempt = function (bb, fn) { try { fn(); } catch (e) { /* the state check decides */ } };

    let f = frozenBook();
    attempt(f.bb, function () { f.bb.call('confirmHandover', { token: f.tt.kali, id: 'f-h1', year: 2026 }); });
    eq(stateOf(f.bb, 'Handovers', 'f-h1', 'status'), 'pending',
       'backend A165: a frozen year does not let a cashier confirm a handover');
    attempt(f.bb, function () { f.bb.call('rejectHandover', { token: f.tt.kali, id: 'f-h2', reason: 'x', year: 2026 }); });
    eq(stateOf(f.bb, 'Handovers', 'f-h2', 'status'), 'pending',
       'backend A165: …nor reject one');
    attempt(f.bb, function () { f.bb.call('resolveCorrection', { token: f.tt.kali, id: 'f-c1', decision: 'accept', year: 2026 }); });
    eq(stateOf(f.bb, 'Corrections', 'f-c1', 'status'), 'pending',
       'backend A165: …nor settle a disputed amount');

    // the other half — a lock with no key is not a fix
    f = frozenBook();
    attempt(f.bb, function () { f.bb.call('confirmHandover', { token: f.tt.hrishi, id: 'f-h1', year: 2026 }); });
    eq(stateOf(f.bb, 'Handovers', 'f-h1', 'status'), 'confirmed',
       'backend A165: …but the admin still can, as in push — a locked-out fixer helps nobody');

    f = frozenBook();
    f.bb.call('setFreeze', { token: f.tt.hrishi, on: '0', year: 2026 });
    attempt(f.bb, function () { f.bb.call('confirmHandover', { token: f.tt.kali, id: 'f-h1', year: 2026 }); });
    eq(stateOf(f.bb, 'Handovers', 'f-h1', 'status'), 'confirmed',
       'backend A165: …and lifting the freeze gives the cashier the action back');

    // nothing was destroyed by refusing: the parcel is still there to confirm
    eq(stateOf(f.bb, 'Handovers', 'f-h2', 'status'), 'pending',
       'backend A165: a refused action leaves the row pending, not lost');
  }

  // --- A166: every pushed row lands in exactly ONE list ---------------------
  // A row in none is re-pushed for ever; a row in two is a contradiction the
  // client resolves by guessing. The rule has been written down since the
  // sync protocol was designed, and every new `return` inside push's record
  // loop is a chance to break it — A162 added four of those returns, which is
  // why this is a test and not a one-off script.
  {
    function qBook(opts) {
      const bq = loadBackend();
      bq.api.setup();
      const cast = ['hrishi', 'kali', 'ratan', 'subrata', 'dipak'];
      cast.forEach(function (u, i) {
        bq.post('register', { username: u, name: u, password: 'secret' + i, phone: '98400000' + i });
      });
      let t0 = bq.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
      const rw = function (u) { return bq.rows('Users').filter(function (x) { return x.username === u; })[0]; };
      cast.slice(1).forEach(function (u) {
        bq.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
        bq.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
        bq.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'road'] });
      });
      bq.call('setEntries', { token: t0, userId: rw('subrata').id,
        entries: ['progteam', 'progdonor', 'progmoney', 'ticket'] });
      bq.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
      if (opts.exiting) bq.call('setAccess', { token: t0, userId: rw('dipak').id, access: 'exiting' });
      const tq = {};
      cast.forEach(function (u, i) { tq[u] = bq.call('login', { username: u, password: 'secret' + i, year: 2026 }).token; });
      if (opts.frozen) bq.call('setFreeze', { token: tq.hrishi, on: '1', confirm: 'FREEZE', year: 2026 });
      return { bq: bq, tq: tq };
    }
    let qn = 0;
    const QID = function () { return 'a166-' + (++qn); };
    const SHAPES = [
      ['ok shop',            'ratan',   'parties',     function () { return { type: 'shop', name: 'X', pledged: 100, sector: 'puja' }; }],
      ['ungranted kind',     'ratan',   'parties',     function () { return { type: 'gupt', name: 'G', pledged: 0, sector: 'puja' }; }],
      ['programme donor',    'ratan',   'parties',     function () { return { type: 'person', name: 'P', pledged: 100, sector: 'program' }; }],
      ['programme expense',  'ratan',   'expenses',    function () { return { subject: 'শিল্পী', amount: 10, cashAmount: 10, upiAmount: 0, date: '2026-09-05', sector: 'program', srcCat: 'other' }; }],
      ['transfer',           'subrata', 'expenses',    function () { return { source: 'transfer', transferTo: 'program', sector: 'puja', amount: 10, cashAmount: 10, upiAmount: 0, date: '2026-09-05' }; }],
      ['empty commitment',   'subrata', 'expenses',    function () { return { source: 'commitment', payee: '', committed: 0, amount: 0, date: '2026-09-05', sector: 'program' }; }],
      ['expense, no cashier','ratan',   'expenses',    function () { return { subject: 'আলো', amount: 10, cashAmount: 10, upiAmount: 0, date: '2026-09-05', srcCat: 'other' }; }],
      ['payment, no donor',  'ratan',   'payments',    function () { return { partyId: 'nope', partyName: '?', amount: 10, cashAmount: 10, upiAmount: 0, date: '2026-09-05' }; }],
      ['handover, no one',   'ratan',   'handovers',   function () { return { amount: 10, cashAmount: 10, upiAmount: 0, toId: '', toName: '', date: '2026-09-05', status: 'pending' }; }],
      ['handover, shut',     'ratan',   'handovers',   function () { return { amount: 10, cashAmount: 10, upiAmount: 0, toId: 'dipak', toName: 'dipak', date: '2026-09-05', status: 'pending' }; }],
      ['unknown store',      'ratan',   'nosuchstore', function () { return { amount: 10 }; }],
      ['void, not theirs',   'ratan',   'voids',       function () { return { targetStore: 'payments', targetId: 'nope', reason: 'x', date: '2026-09-05' }; }],
      ['correction flag',    'ratan',   'corrections', function () { return { targetStore: 'payments', targetId: 'nope', note: 'ভুল', date: '2026-09-05' }; }],
      ['message',            'ratan',   'messages',    function () { return { text: 'হ্যালো', date: '2026-09-05', createdAt: new Date().toISOString() }; }],
      ['daily road',         'ratan',   'daily',       function () { return { type: 'road', amount: 50, cashAmount: 50, upiAmount: 0, date: '2026-09-05', sector: 'puja' }; }],
      ['ticket, ungranted',  'ratan',   'daily',       function () { return { type: 'ticket', amount: 50, cashAmount: 50, upiAmount: 0, date: '2026-09-05', sector: 'program' }; }],
    ];
    [{ label: 'normal', o: {} }, { label: 'frozen', o: { frozen: true } },
     { label: 'with a stood-down user', o: { exiting: true } }].forEach(function (mode) {
      const k = qBook(mode.o);
      const strays = [];
      SHAPES.forEach(function (sh) {
        const row = Object.assign({ id: QID(), year: 2026 }, sh[3]());
        if (mode.o.frozen) row.createdAt = new Date(Date.now() + 9e8).toISOString();
        let r;
        try { r = k.bq.call('push', { token: k.tq[sh[1]], records: [rec(sh[2], row)] }); }
        catch (e) { strays.push(sh[0] + ' (threw)'); return; }
        const c = ((r.savedIds || []).indexOf(row.id) >= 0 ? 1 : 0) +
                  ((r.rejectedIds || []).indexOf(row.id) >= 0 ? 1 : 0) +
                  ((r.heldIds || []).indexOf(row.id) >= 0 ? 1 : 0);
        if (c !== 1) strays.push(sh[0] + ' (' + c + ' lists)');
      });
      eq(strays.join(', ') || '(none)', '(none)',
         'backend A166: [' + mode.label + '] every pushed row lands in exactly one list');
    });
  }

  // --- A167: void and correction, from every chair -------------------------
  // Both take money OUT of the book, so a hole here is money, not a screen.
  // The find: voidAllowed_ said `return true` for one's OWN row under the
  // comment "undo / self-correction", while js/app.js canVoid has said the
  // opposite ("never one's own") all along. The server is the authority and
  // the server was the permissive one, so the screen's rule was decoration —
  // a collector reaching the API directly could erase a payment they had
  // taken, the book would still balance (the row leaves, their in-hand falls
  // by the same amount), and the cash would simply be gone. This file already
  // spells that danger out word for word, for a collector on their way out.
  {
    function vBook() {
      const bv = loadBackend();
      bv.api.setup();
      const cast = ['hrishi', 'kali', 'ratan', 'tapan'];
      cast.forEach(function (u, i) {
        bv.post('register', { username: u, name: u, password: 'secret' + i, phone: '98200000' + i });
      });
      let t0 = bv.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
      const rw = function (u) { return bv.rows('Users').filter(function (x) { return x.username === u; })[0]; };
      cast.slice(1).forEach(function (u) {
        bv.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
        bv.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
        bv.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'road', 'review'] });
      });
      bv.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
      const tv = {};
      cast.forEach(function (u, i) { tv[u] = bv.call('login', { username: u, password: 'secret' + i, year: 2026 }).token; });
      const put = function (u, store, row) {
        const r = bv.call('push', { token: tv[u], records: [rec(store, row)] });
        return (r.savedIds || []).length > 0;
      };
      put('ratan', 'parties',  { id: 'v-p1', year: 2026, type: 'shop', name: 'A', pledged: 5000, sector: 'puja' });
      put('ratan', 'payments', { id: 'v-y1', year: 2026, partyId: 'v-p1', partyName: 'A', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' });
      put('ratan', 'daily',    { id: 'v-d1', year: 2026, type: 'road', amount: 900, cashAmount: 900, upiAmount: 0, date: '2026-09-05', sector: 'puja' });
      put('ratan', 'parties',  { id: 'v-p5', year: 2026, type: 'shop', name: 'empty', pledged: 400, sector: 'puja' });
      put('tapan', 'parties',  { id: 'v-p2', year: 2026, type: 'shop', name: 'B', pledged: 3000, sector: 'puja' });
      put('tapan', 'payments', { id: 'v-y2', year: 2026, partyId: 'v-p2', partyName: 'B', amount: 1500, cashAmount: 1500, upiAmount: 0, date: '2026-09-05' });
      put('hrishi','parties',  { id: 'v-p3', year: 2026, type: 'shop', name: 'C', pledged: 1000, sector: 'puja' });
      put('hrishi','payments', { id: 'v-y3', year: 2026, partyId: 'v-p3', partyName: 'C', amount: 700, cashAmount: 700, upiAmount: 0, date: '2026-09-05' });
      put('kali',  'parties',  { id: 'v-p4', year: 2026, type: 'shop', name: 'D', pledged: 800, sector: 'puja' });
      return { put: put };
    }
    let vn = 0;
    const canVoid = function (who, store, id) {
      return vBook().put(who, 'voids', { id: 'a167-' + (++vn), year: 2026,
        targetStore: store, targetId: id, reason: 'test', date: '2026-09-05' });
    };
    // A collector CAN void their own row, and that is the UNDO path — the
    // 5-second toast writes a void with reason 'undo' on a row that may
    // already be on its way to the Sheet, where a local delete would
    // resurrect on the next pull. js/app.js canVoid says "never one's own"
    // about a DIFFERENT door: the ✖️ বাতিল button on old rows, where the
    // right path is a correction flag. Two doors, two rules, both correct —
    // asserted here so the next person who spots the "contradiction" reads
    // this instead of removing the feature, which is what I did.
    eq(canVoid('ratan', 'payments', 'v-y1'), true,
       'backend A167: a collector may void their OWN payment — this is Undo');
    eq(canVoid('ratan', 'daily', 'v-d1'), true, 'backend A167: …and their own daily row');
    eq(canVoid('kali', 'parties', 'v-p4'), true,
       'backend A167: …the cashier likewise, on the row they just wrote');
    eq(canVoid('tapan', 'payments', 'v-y1'), false,
       'backend A167: one collector cannot void another\'s work');
    eq(canVoid('kali', 'payments', 'v-y1'), true,
       'backend A167: the cashier may void a collector\'s payment — that is the desk\'s job');
    eq(canVoid('kali', 'payments', 'v-y3'), false,
       'backend A167: …but not an admin\'s row');
    eq(canVoid('hrishi', 'payments', 'v-y2'), true, 'backend A167: the admin may void anyone\'s');
    eq(canVoid('hrishi', 'parties', 'v-p1'), false,
       'backend A167: nobody may void a donor that has money on it — its payments would be orphaned');
    eq(canVoid('kali', 'parties', 'v-p5'), true,
       'backend A167: …while a donor with nothing on it can go');

    // Two shapes that look dangerous and are not — recorded so they are not
    // "fixed" into something worse later.
    const A = require('../js/aggregate.js');
    const base = { parties: [{ id: 'p1', year: 2026, type: 'shop', name: 'X', pledged: 5000 }],
      payments: [{ id: 'y1', year: 2026, partyId: 'p1', partyName: 'X', amount: 2000,
                   cashAmount: 2000, upiAmount: 0, date: '2026-09-05', collectorId: 'ratan' }],
      daily: [], expenses: [], handovers: [], corrections: [] };
    const live = function (voids) {
      return A.activeData(Object.assign({}, base, { voids: voids }))
        .payments.reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    };
    eq(live([]), 2000, 'backend A167: unvoided money counts');
    eq(live([{ id: 'v1', targetStore: 'payments', targetId: 'y1' }]), 0, 'backend A167: a void removes it');
    eq(live([{ id: 'v1', targetStore: 'payments', targetId: 'y1' },
             { id: 'v2', targetStore: 'payments', targetId: 'y1' }]), 0,
       'backend A167: a SECOND void of the same row does not subtract twice — voidedIds is a set');
    eq(live([{ id: 'v1', targetStore: 'payments', targetId: 'y1' },
             { id: 'v2', targetStore: 'voids', targetId: 'v1' }]), 0,
       'backend A167: and voiding the void does NOT bring the money back — no undo-the-undo door');
  }

  // --- A168: the 🩺 desk, on a book built by the server ---------------------
  // Two questions, and the first matters more: on a book where nothing is
  // wrong, does it say NOTHING? A red banner that overclaims teaches people to
  // ignore red, and then it is worth nothing on the night it is right.
  //
  // The book is PUSHED through the real handler and pulled back, never written
  // by hand. Three separate times this session a hand-built fixture accused the
  // app of a bug it did not have — the last being a handover with no `fromId`,
  // which the server stamps from the token on every push, and whose absence
  // made a phantom collector hold minus ₹2,900.
  {
    function anomBook() {
      const ba = loadBackend();
      ba.api.setup();
      const cast = ['hrishi', 'kali', 'ratan', 'subrata'];
      cast.forEach(function (u, i) {
        ba.post('register', { username: u, name: u, password: 'secret' + i, phone: '98100000' + i });
      });
      let t0 = ba.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
      const rw = function (u) { return ba.rows('Users').filter(function (x) { return x.username === u; })[0]; };
      cast.slice(1).forEach(function (u) {
        ba.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
        ba.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
        ba.call('setEntries', { token: t0, userId: rw(u).id,
          entries: ['shop', 'person', 'road', 'toto', 'sponsor', 'gupt'] });
      });
      ba.call('setEntries', { token: t0, userId: rw('subrata').id,
        entries: ['progteam', 'progdonor', 'progmoney', 'ticket'] });
      ba.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
      ba.call('addItem', { token: t0, kind: 'area', nameBn: 'মেন রোড', nameEn: 'Main Rd', id: 'main_malda' });
      const tka = {};
      cast.forEach(function (u, i) { tka[u] = ba.call('login', { username: u, password: 'secret' + i, year: 2026 }).token; });
      const put = function (u, store, row) { ba.call('push', { token: tka[u], records: [rec(store, row)] }); };
      put('ratan', 'parties',  { id: 'p1', year: 2026, type: 'shop', name: 'আদর্শ', pledged: 5000, side: 'main_malda' });
      put('ratan', 'payments', { id: 'y1', year: 2026, partyId: 'p1', partyName: 'আদর্শ', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' });
      put('ratan', 'parties',  { id: 'p2', year: 2026, type: 'person', name: 'রঞ্জিত', pledged: 3000, side: 'main_malda' });
      put('ratan', 'payments', { id: 'y2', year: 2026, partyId: 'p2', partyName: 'রঞ্জিত', amount: 1000, cashAmount: 600, upiAmount: 400, date: '2026-09-05' });
      put('kali',  'parties',  { id: 'p3', year: 2026, type: 'sponsor', name: 'Bose', pledged: 50000, side: 'main_malda' });
      put('kali',  'payments', { id: 'y3', year: 2026, partyId: 'p3', partyName: 'Bose', amount: 20000, cashAmount: 20000, upiAmount: 0, date: '2026-09-05' });
      put('kali',  'parties',  { id: 'p4', year: 2026, type: 'gupt', name: 'শুভাকাঙ্ক্ষী', pledged: 0, side: 'main_malda' });
      put('kali',  'payments', { id: 'y4', year: 2026, partyId: 'p4', partyName: 'শুভাকাঙ্ক্ষী', amount: 8000, cashAmount: 8000, upiAmount: 0, date: '2026-09-05' });
      put('ratan', 'daily',    { id: 'd1', year: 2026, type: 'road', amount: 900, cashAmount: 900, upiAmount: 0, date: '2026-09-05', sector: 'puja' });
      put('ratan', 'daily',    { id: 'd2', year: 2026, type: 'toto', amount: 400, cashAmount: 400, upiAmount: 0, date: '2026-09-04', sector: 'puja' });
      put('subrata','daily',   { id: 'd3', year: 2026, type: 'ticket', amount: 1500, cashAmount: 1500, upiAmount: 0, date: '2026-09-05', sector: 'program' });
      put('kali',  'expenses', { id: 'e1', year: 2026, subject: 'আলো', amount: 1200, cashAmount: 1200, upiAmount: 0, date: '2026-09-05', srcCat: 'other' });
      put('ratan', 'handovers',{ id: 'h1', year: 2026, amount: 2900, cashAmount: 2900, upiAmount: 0,
        date: '2026-09-05', toId: 'kali', status: 'pending',
        breakdown: JSON.stringify({ shop: { cash: 2000, upi: 0 }, road: { cash: 900, upi: 0 } }) });
      ba.call('confirmHandover', { token: tka.kali, id: 'h1', year: 2026 });
      put('ratan', 'parties',  { id: 'p6', year: 2026, type: 'shop', name: 'ভুল', pledged: 900, side: 'main_malda' });
      put('kali',  'voids',    { id: 'v1', year: 2026, targetStore: 'parties', targetId: 'p6', reason: 'ভুল', date: '2026-09-05' });
      return (ba.call('pull', { token: tka.hrishi, since: 0 }) || {}).data || {};
    }
    const A2 = require('../js/aggregate.js');
    const seen = function (bk, rules) {
      return ((A2.reconcile(bk, rules || {}) || {}).anomalies || [])
        .map(function (a) { return a.type; }).sort();
    };
    const cloneBook = function (o) { return JSON.parse(JSON.stringify(o)); };

    const good = anomBook();
    eq(seen(good).join(',') || '(silent)', '(silent)',
       'backend A168: a book with nothing wrong raises NOTHING — no red that cries wolf');

    // one fault at a time, each named
    const plant = function (fn) { const b2 = cloneBook(good); fn(b2); return seen(b2); };
    eq(plant(function (b2) { b2.payments[0].partyId = 'gone'; }).indexOf('orphan_payment') >= 0, true,
       'backend A168: a payment whose donor is missing is named');
    eq(plant(function (b2) { b2.payments.push(cloneBook(b2.payments[0])); }).indexOf('duplicate_id') >= 0, true,
       'backend A168: the same id twice is named');
    eq(plant(function (b2) { b2.payments[0].amount = 999999; }).indexOf('overpaid') >= 0, true,
       'backend A168: paying more than pledged is named');
    eq(plant(function (b2) { b2.payments[1].cashAmount = 1; }).indexOf('split_mismatch') >= 0, true,
       'backend A168: cash + UPI not adding to the total is named');
    eq(plant(function (b2) { b2.handovers[0].amount = 5000; }).indexOf('breakdown_mismatch') >= 0, true,
       'backend A168: a handover whose parts do not add up is named');
    eq(plant(function (b2) { b2.parties[0].side = ''; }).indexOf('party_no_area') >= 0, true,
       'backend A168: a shop with no এলাকা is named');
    eq(plant(function (b2) { const c = cloneBook(b2.payments[0]); c.id = 'y1b'; b2.payments.push(c); })
         .indexOf('possible_duplicate_payment') >= 0, true,
       'backend A168: the same amount to the same donor twice is named');

    // the partial reader: whole parcels are withheld, so BOTH sides of the
    // invariant shrink together and the equation still closes (A144's design)
    const partial = cloneBook(good);
    partial.parties = partial.parties.filter(function (p) { return p.type !== 'gupt'; });
    partial.payments = partial.payments.filter(function (p) { return p.partyId !== 'p4'; });
    eq(seen(partial, { partialBook: true }).join(',') || '(silent)', '(silent)',
       'backend A168: a reader without guptview accuses nobody');
    eq(seen(partial).join(',') || '(silent)', '(silent)',
       'backend A168: …and the arithmetic closes even without the partialBook flag, because the parcel left whole');
  }

  // --- A170: the delta pull, and what a GRANT does to it -------------------
  // Redelivery is free (mergeDelta upserts by id); loss is not. The part that
  // matters most operationally: rows written BEFORE a view grant are older
  // than the phone's cursor, so no delta can ever carry them — the client has
  // to notice its own grants changed and take one full pull. That promise is
  // written in Code.gs as a comment about another file, which is exactly the
  // kind of promise that goes stale, so it is asserted here.
  {
    const bd = loadBackend();
    bd.api.setup();
    const cast = ['hrishi', 'kali', 'ratan'];
    cast.forEach(function (u, i) {
      bd.post('register', { username: u, name: u, password: 'secret' + i, phone: '98900000' + i });
    });
    let t0 = bd.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bd.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    cast.slice(1).forEach(function (u) {
      bd.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bd.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      bd.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'gupt'] });
    });
    const td = {};
    cast.forEach(function (u, i) { td[u] = bd.call('login', { username: u, password: 'secret' + i, year: 2026 }).token; });
    const put = function (u, store, row) { bd.call('push', { token: td[u], records: [rec(store, row)] }); };
    const pull = function (u, since) {
      return bd.call('pull', Object.assign({ token: td[u], year: 2026 },
        since === undefined ? {} : { since: since }));
    };
    const idsIn = function (r) {
      return Object.keys((r && r.data) || {}).reduce(function (a, k) {
        return a.concat((r.data[k] || []).map(function (x) { return x.id; }));
      }, []);
    };

    put('ratan', 'parties', { id: 'dq1', year: 2026, type: 'shop', name: 'এক', pledged: 100, sector: 'puja' });
    const first = pull('ratan');
    const cur = first.cursor;
    // the shim's clock is fixed; without advancing it every row shares the
    // cursor's millisecond and the fast path answers "you are up to date".
    // That is a harness artefact — but it is also the app's one real edge, and
    // it is recorded in pending.md rather than papered over here.
    bd.env._setNow(bd.env._now() + 60000);
    put('ratan', 'parties', { id: 'dq2', year: 2026, type: 'shop', name: 'দুই', pledged: 200, sector: 'puja' });
    put('ratan', 'payments', { id: 'dw2', year: 2026, partyId: 'dq2', partyName: 'দুই', amount: 50, cashAmount: 50, upiAmount: 0, date: '2026-09-05' });

    const d1 = pull('ratan', cur);
    eq(idsIn(d1).indexOf('dq2') >= 0 && idsIn(d1).indexOf('dw2') >= 0, true,
       'backend A170: a delta carries every row written after the cursor');
    eq(idsIn(d1).indexOf('dq1') >= 0, true,
       'backend A170: …and re-sends the boundary row, because >= loses nothing and costs an upsert');
    eq(idsIn(pull('ratan', cur)).length, idsIn(d1).length,
       'backend A170: asking twice with the same cursor gives the same rows — redelivery is safe');

    // the grant path, the one on the go-live checklist
    put('ratan', 'parties', { id: 'dg1', year: 2026, type: 'gupt', name: 'শুভাকাঙ্ক্ষী', pledged: 0, sector: 'puja' });
    put('ratan', 'payments', { id: 'dgy1', year: 2026, partyId: 'dg1', partyName: 'শুভাকাঙ্ক্ষী', amount: 9000, cashAmount: 9000, upiAmount: 0, date: '2026-09-05' });
    const sees = function (r) { return (((r || {}).data || {}).parties || []).some(function (p) { return p.id === 'dg1'; }); };
    const kFull = pull('kali');
    eq(sees(kFull), false, 'backend A170: before the grant, the cashier does not see the গুপ্ত দান');

    bd.call('setEntries', { token: td.hrishi, userId: rw('kali').id,
      entries: ['shop', 'person', 'gupt', 'guptview'] });
    const kDelta = pull('kali', kFull.cursor);
    eq(String((kDelta.me || {}).entries || '').indexOf('guptview') >= 0, true,
       'backend A170: the grant reaches the phone on the very next poll, in `me`');
    eq(sees(kDelta), false,
       'backend A170: …but the delta cannot carry the old rows — they predate the cursor');
    eq(sees(pull('kali')), true,
       'backend A170: …which is why the client drops its cursor and takes ONE full pull (js/app.js regrant)');

    bd.call('setEntries', { token: td.hrishi, userId: rw('kali').id, entries: ['shop', 'person'] });
    eq(sees(pull('kali')), false,
       'backend A170: revoking takes the rows away again — a delta can never say "delete"');
  }

  // --- A172: receipt numbers ------------------------------------------------
  // The donor keeps this slip. If two donors hold the same number, or a number
  // changes after it was shown, nobody in the committee finds out until an
  // argument — there is no screen that would notice.
  {
    const br = loadBackend();
    br.api.setup();
    ['hrishi', 'ratan', 'kali'].forEach(function (u, i) {
      br.post('register', { username: u, name: u, password: 'secret' + i, phone: '96000000' + i });
    });
    let t0 = br.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return br.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['ratan', 'kali'].forEach(function (u) {
      br.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      br.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      br.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'road', 'bus'] });
    });
    const tr = {};
    ['hrishi', 'ratan', 'kali'].forEach(function (u, i) {
      tr[u] = br.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    const shove = function (u, recs) { return br.call('push', { token: tr[u], records: recs }); };
    const pay = function (id, amt) {
      return rec('payments', { id: id, year: 2026, partyId: 'rp1', partyName: 'দোকান',
        amount: amt, cashAmount: amt, upiAmount: 0, date: '2026-09-05' });
    };
    shove('ratan', [rec('parties', { id: 'rp1', year: 2026, type: 'shop', name: 'দোকান', pledged: 99999, sector: 'puja' })]);
    const nos = function () {
      return br.rows('Payments').map(function (p) { return String(p.receiptNo || ''); }).filter(Boolean);
    };

    // two collectors, three batches
    shove('ratan', [pay('a1', 100), pay('a2', 200), pay('a3', 300)]);
    shove('kali',  [pay('b1', 400), pay('b2', 500)]);
    shove('ratan', [pay('c1', 600)]);
    const all = nos();
    eq(all.length, 6, 'backend A172: every payment got a receipt number');
    eq(new Set(all).size, 6, 'backend A172: …and no two donors hold the same one');
    const asNum = all.map(Number).sort(function (x, y) { return x - y; });
    eq(asNum[5] - asNum[0], 5, 'backend A172: …allocated as one unbroken run across collectors and batches');

    // the retry a flaky network causes must not move a number already shown
    const was = br.rows('Payments').filter(function (p) { return p.id === 'a1'; })[0].receiptNo;
    shove('ratan', [pay('a1', 100)]);
    const now = br.rows('Payments').filter(function (p) { return p.id === 'a1'; })[0].receiptNo;
    eq(String(was), String(now), 'backend A172: a re-push keeps the number the donor was already shown');
    eq(nos().length, 6, 'backend A172: …and burns no new one, so the sequence does not jump');

    // a void leaves a gap, exactly like a paper receipt book
    shove('kali', [rec('voids', { id: 'vd1', year: 2026, targetStore: 'payments', targetId: 'a2', reason: 'ভুল', date: '2026-09-05' })]);
    shove('ratan', [pay('d1', 700)]);
    const later = nos().map(Number).sort(function (x, y) { return x - y; });
    eq(later[later.length - 1], asNum[5] + 1,
       'backend A172: the next receipt takes the next number — a voided one is never reissued');

    // daily rows share the same sequence and must not collide with payments
    shove('ratan', [rec('daily', { id: 'bs1', year: 2026, type: 'bus', busName: 'সোনালী', busNumber: 'WB-01',
      amount: 800, cashAmount: 800, upiAmount: 0, date: '2026-09-05', sector: 'puja' })]);
    const busNo = String(br.rows('DailyCollections').filter(function (d) { return d.id === 'bs1'; })[0].receiptNo || '');
    eq(busNo.length > 0, true, 'backend A172: a bus collection gets a receipt number too');
    eq(nos().indexOf(busNo), -1, 'backend A172: …drawn from the same run, so it can never repeat a payment\'s');
  }

  // --- A173: 🚀 goLive, and the undo it promises ----------------------------
  // The most consequential button in the app, about to be pressed for real.
  // The checklist handed to Hrishi claims what survives and what goes; this
  // measures that claim against the handler, and then checks the safety net
  // actually catches — a mandatory backup nobody has ever restored from is a
  // promise, not a net.
  {
    function liveBook() {
      const bg = loadBackend();
      bg.api.setup();
      ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
        bg.post('register', { username: u, name: u, password: 'secret' + i, phone: '93000000' + i });
      });
      let t0 = bg.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
      const rw = function (u) { return bg.rows('Users').filter(function (x) { return x.username === u; })[0]; };
      ['kali', 'ratan'].forEach(function (u) {
        bg.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
        bg.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
        bg.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'gupt', 'guptview'] });
        bg.call('setAreas', { token: t0, userId: rw(u).id, areas: ['main_malda'] });
      });
      bg.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
      bg.call('addItem', { token: t0, kind: 'area', nameBn: 'মেন রোড', nameEn: 'Main Rd' });
      bg.call('addSubject', { token: t0, name: 'প্যান্ডেল' });
      bg.call('setConfig', { token: t0, config: { program_on: 'on', target_amount: '250000' } });
      const tg = {};
      ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
        tg[u] = bg.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
      });
      const put = function (u, store, row) { bg.call('push', { token: tg[u], records: [rec(store, row)] }); };
      put('ratan', 'parties',  { id: 'bp1', year: 2026, type: 'shop', name: 'আদর্শ', pledged: 5000, side: 'main_malda', sector: 'puja' });
      put('ratan', 'payments', { id: 'by1', year: 2026, partyId: 'bp1', partyName: 'আদর্শ', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' });
      put('kali',  'parties',  { id: 'bp2', year: 2026, type: 'gupt', name: 'গোপন', pledged: 0, sector: 'puja' });
      put('kali',  'payments', { id: 'by2', year: 2026, partyId: 'bp2', partyName: 'গোপন', amount: 9000, cashAmount: 9000, upiAmount: 0, date: '2026-09-05' });
      return { bg: bg, tg: tg, rw: rw };
    }
    const money = function (bg) {
      return bg.rows('Payments').reduce(function (a, p) { return a + (Number(p.amount) || 0); }, 0);
    };
    const cfgVal = function (bg, k) {
      const r = bg.rows('Config').filter(function (x) { return x.key === k; })[0];
      return r ? String(r.value) : '';
    };

    // what survives, measured — this is the checklist's claim
    let L = liveBook();
    const usersBefore = L.bg.rows('Users').length, listsBefore = L.bg.rows('Lists').length;
    const permsBefore = String(L.rw('kali').entries || '');
    L.bg.call('goLive', { token: L.tg.hrishi, confirm: 'LIVE', digits: 6 });
    eq(L.bg.rows('Parties').length + L.bg.rows('Payments').length, 0, 'backend A173: 🚀 wipes every entry');
    eq(L.bg.rows('Users').length, usersBefore, 'backend A173: …and keeps the accounts');
    eq(String(L.rw('kali').entries || ''), permsBefore, 'backend A173: …and their permissions, untouched');
    eq(L.bg.rows('Lists').length, listsBefore, 'backend A173: …and the areas and posts');
    eq(L.bg.rows('ExpenseSubjects').length > 0, true, 'backend A173: …and the expense subjects');
    eq(cfgVal(L.bg, 'program_on'), 'on', 'backend A173: …and the 🎭 fund switch');
    eq(cfgVal(L.bg, 'target_amount'), '250000', 'backend A173: …and the 🎯 target');
    eq(cfgVal(L.bg, 'receipt_digits'), '6', 'backend A173: …while the receipt width is locked in');

    // one-way, and typed
    let thrown = '';
    try { L.bg.call('goLive', { token: L.tg.hrishi, confirm: 'LIVE', digits: 6 }); } catch (e) { thrown = String(e.message || e); }
    eq(thrown, 'already-live', 'backend A173: a second 🚀 is refused — it would erase the season\'s real takings');
    L = liveBook();
    thrown = '';
    try { L.bg.call('goLive', { token: L.tg.hrishi, digits: 6 }); } catch (e) { thrown = String(e.message || e); }
    eq(thrown, 'confirm-required', 'backend A173: …and the typed word must actually reach the server');

    // THE safety net: if the backup cannot be written, nothing may be destroyed
    L = liveBook();
    L.bg.env.DriveApp.createFolder = function () { throw new Error('Drive quota exceeded'); };
    L.bg.env.DriveApp.getFoldersByName = function () { throw new Error('Drive quota exceeded'); };
    thrown = '';
    try { L.bg.call('goLive', { token: L.tg.hrishi, confirm: 'LIVE', digits: 6 }); } catch (e) { thrown = String(e.message || e); }
    eq(/^backup-failed/.test(thrown), true, 'backend A173: a failed backup stops 🚀 dead');
    eq(cfgVal(L.bg, 'live_mode'), '', 'backend A173: …live_mode is never set');
    eq(money(L.bg), 11000, 'backend A173: …and NOT ONE ROW is deleted without a snapshot behind it');

    // and the net actually catches: backup → wipe → restore
    L = liveBook();
    const before = money(L.bg);
    const bk = L.bg.call('backupNow', { token: L.tg.hrishi });
    L.bg.call('goLive', { token: L.tg.hrishi, confirm: 'LIVE', digits: 6 });
    eq(money(L.bg), 0, 'backend A173: after 🚀 the money is gone');
    L.bg.call('restoreBackup', { token: L.tg.hrishi, fileId: bk.file, confirm: 'RESTORE' });
    eq(money(L.bg), before, 'backend A173: …and restore brings back the exact figure, ₹' + before);
    eq(L.bg.rows('Payments').length, 2, 'backend A173: …every row, including the গুপ্ত দান');
    eq(String(L.rw('kali').passwordHash || '').length > 0, true,
       'backend A173: …with password hashes intact, so people can still log in (A52\'s bug, still fixed)');
  }

  // --- A174: the collector stood down while they were out of signal ---------
  // pending.md item 1, measured. The round happens, the committee decides
  // while the phone is offline, the phone comes back and pushes. Rejecting
  // split the parcel — the payment against their own donor SAVED, the donor
  // row and the road money REFUSED — and js/sync.js drops a rejected row from
  // the queue for good. The book was left with a permanent orphan_payment
  // pointing at a donor that existed nowhere, and ₹800 of collected cash with
  // no record on either side.
  {
    function exitBook(withOldDonor) {
      const be = loadBackend();
      be.api.setup();
      ['hrishi', 'dipak', 'kali'].forEach(function (u, i) {
        be.post('register', { username: u, name: u, password: 'secret' + i, phone: '92000000' + i });
      });
      let t0 = be.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
      const rw = function (u) { return be.rows('Users').filter(function (x) { return x.username === u; })[0]; };
      ['dipak', 'kali'].forEach(function (u) {
        be.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
        be.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
        be.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'road'] });
      });
      const te = {};
      ['hrishi', 'dipak', 'kali'].forEach(function (u, i) {
        te[u] = be.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
      });
      if (withOldDonor) {
        be.call('push', { token: te.dipak, records: [rec('parties', { id: 'old-p', year: 2026,
          type: 'shop', name: 'পুরনো', pledged: 9000, side: 'main_malda', sector: 'puja' })] });
      }
      const morning = new Date(be.env._now()).toISOString();
      be.env._setNow(be.env._now() + 3600000);              // the round is over
      be.call('setAccess', { token: te.hrishi, userId: rw('dipak').id, access: 'exiting' });
      be.env._setNow(be.env._now() + 3600000);              // the phone finds signal
      const recs = [
        rec('parties',  { id: 'ex-p1', year: 2026, type: 'shop', name: 'সকালের', pledged: 2000, side: 'main_malda', sector: 'puja', createdAt: morning }),
        rec('payments', { id: 'ex-y1', year: 2026, partyId: 'ex-p1', partyName: 'সকালের', amount: 1500, cashAmount: 1500, upiAmount: 0, date: '2026-09-05', createdAt: morning }),
        rec('daily',    { id: 'ex-d1', year: 2026, type: 'road', amount: 800, cashAmount: 800, upiAmount: 0, date: '2026-09-05', sector: 'puja', createdAt: morning }),
      ];
      if (withOldDonor) {
        recs.push(rec('payments', { id: 'ex-y2', year: 2026, partyId: 'old-p', partyName: 'পুরনো',
          amount: 700, cashAmount: 700, upiAmount: 0, date: '2026-09-05', createdAt: morning }));
      }
      return { be: be, te: te, res: be.call('push', { token: te.dipak, records: recs }) };
    }
    const A3 = require('../js/aggregate.js');

    let E = exitBook(false);
    const held = (E.res.heldIds || []).slice().sort();
    eq(held.join(','), 'ex-d1,ex-p1,ex-y1',
       'backend A174: the whole morning is HELD, not destroyed — a rejected row leaves the phone for good');
    eq((E.res.rejectedIds || []).length, 0, 'backend A174: …nothing refused, so nothing is lost');
    let d = (E.be.call('pull', { token: E.te.hrishi, since: 0 }) || {}).data || {};
    const orphans = function (dd) {
      const ids = {}; (dd.parties || []).forEach(function (p) { ids[p.id] = 1; });
      return (dd.payments || []).filter(function (p) { return p.partyId && !ids[p.partyId]; }).length;
    };
    eq(orphans(d), 0, 'backend A174: …and the parcel is never split, so no orphan is manufactured');
    eq(((A3.reconcile(d, {}) || {}).anomalies || []).length, 0,
       'backend A174: …leaving the 🩺 desk with nothing to accuse anybody of');

    // the rule the gate exists to keep: they may still record against a donor
    // that is ALREADY in the book, and still hand in what they hold
    E = exitBook(true);
    eq((E.res.savedIds || []).join(','), 'ex-y2',
       'backend A174: a payment against a donor already in the book still lands');
    d = (E.be.call('pull', { token: E.te.hrishi, since: 0 }) || {}).data || {};
    eq(orphans(d), 0, 'backend A174: …and still no orphan');
    const h = E.be.call('push', { token: E.te.dipak, records: [rec('handovers', { id: 'ex-h1', year: 2026,
      amount: 700, cashAmount: 700, upiAmount: 0, toId: 'kali', date: '2026-09-05', status: 'pending' })] });
    eq((h.savedIds || []).join(','), 'ex-h1', 'backend A174: …and handing in what they hold is still open');
    const v = E.be.call('push', { token: E.te.dipak, records: [rec('voids', { id: 'ex-v1', year: 2026,
      targetStore: 'payments', targetId: 'ex-y2', reason: 'x', date: '2026-09-05' })] });
    eq((v.rejectedIds || []).join(','), 'ex-v1',
       'backend A174: …while erasing what they took stays REFUSED, never held — a held void is a landmine');
  }

  // --- A175: a season is a wall, not just a door ----------------------------
  // hasYear_ was checked in exactly one place: login. After that the token
  // carried no year and every handler took `b.year` from the caller. Measured:
  // somebody deliberately not carried into 2027 is refused at login for 2027 —
  // so the boundary is stated out loud — and could then pull 2027 with their
  // 2026 token and read the whole season, ₹31,000 and every donor name, and
  // push into it. No screen sends a year but its own, so this is the
  // direct-call path again, the same shape as A164's dues leak.
  //
  // Also covered here: the committee register's own rules and one-device
  // sessions, both checked at the same time and both already correct.
  {
    const by = loadBackend();
    by.api.setup();
    ['hrishi', 'ratan', 'notin27'].forEach(function (u, i) {
      by.post('register', { username: u, name: u, password: 'secret' + i, phone: '91000000' + i });
    });
    let t0 = by.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return by.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['ratan', 'notin27'].forEach(function (u) {
      by.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      by.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      // memberadmin, or saveMember answers 'forbidden' before the rules this
      // block is about ever run — the permission gate comes first, correctly
      by.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'member', 'memberadmin'] });
      by.call('setReports', { token: t0, userId: rw(u).id, reports: ['overview', 'dues'] });
    });
    by.call('approveYear', { token: t0, userId: rw('ratan').id, year: 2027 }); // only ratan is carried over
    const ty = {};
    ['hrishi', 'ratan', 'notin27'].forEach(function (u, i) {
      ty[u] = by.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    by.call('push', { token: ty.hrishi, records: [
      rec('parties',  { id: 'p27', year: 2027, type: 'shop', name: '২০২৭', pledged: 50000, sector: 'puja' }),
      rec('payments', { id: 'y27', year: 2027, partyId: 'p27', partyName: '২০২৭', amount: 31000, cashAmount: 31000, upiAmount: 0, date: '2027-09-05' })] });

    const err = function (fn) { try { const r = fn(); return (r && r.error) || ''; } catch (e) { return String(e.message || e); } };
    eq(err(function () { return by.call('login', { username: 'notin27', password: 'secret2', year: 2027 }); }),
       'year-not-approved', 'backend A175: login states the boundary');
    eq(err(function () { return by.call('pull', { token: ty.notin27, year: 2027, since: 0 }); }),
       'year-not-approved', 'backend A175: …and a pull with last season\'s token no longer walks around it');
    eq(err(function () { return by.call('report', { token: ty.notin27, id: 'dues', year: 2027 }); }),
       'year-not-approved', 'backend A175: …nor a report');
    const w = by.call('push', { token: ty.notin27, records: [rec('payments', { id: 'bad27', year: 2027,
      partyId: 'p27', partyName: '২০২৭', amount: 9, cashAmount: 9, upiAmount: 0, date: '2027-09-05' })] });
    eq((w.savedIds || []).length, 0, 'backend A175: …nor a write into that season');
    eq((w.heldIds || []).join(','), 'bad27',
       'backend A175: …and the write is HELD, never refused — a refused row leaves the phone for good (A174)');

    // and none of it may cost anybody their own year, or the admin their reach
    eq(err(function () { return by.call('pull', { token: ty.notin27, year: 2026, since: 0 }); }), '',
       'backend A175: their OWN season still opens');
    eq((by.call('push', { token: ty.notin27, records: [rec('parties', { id: 'ok26', year: 2026,
        type: 'shop', name: 'নিজের বছর', pledged: 100, sector: 'puja' })] }).savedIds || []).join(','), 'ok26',
       'backend A175: …and still takes entries');
    eq(err(function () { return by.call('pull', { token: ty.ratan, year: 2027, since: 0 }); }), '',
       'backend A175: somebody carried into the new season reaches it');
    eq(err(function () { return by.call('pull', { token: ty.hrishi, year: 2027, since: 0 }); }), '',
       'backend A175: and the admin reaches every season — rolloverYear, backup and restore all cross them');

    // the committee register, checked at the same time
    const mErr = function (who, name, appUser) {
      return err(function () { return by.call('saveMember', { token: ty[who], name: name,
        appUser: appUser, phone: '9000000001', year: 2026 }); });
    };
    eq(mErr('hrishi', 'নাম-ratan', 'ratan'), '', 'backend A175: an admin writes somebody else\'s member row');
    eq(mErr('ratan', 'নাম-ratan', 'ratan'), 'member-self',
       'backend A175: …and nobody writes their own, admin included');
    eq(mErr('notin27', 'দ্বিতীয়বার', 'ratan'), 'account-taken',
       'backend A175: …one account cannot be linked to two member rows');
    eq(mErr('hrishi', 'ফোনহীন', ''), 'member-needs-account',
       'backend A175: …and a member row needs an account (A115, Hrishi\'s call)');

    // one account, one device
    const before = ty.ratan;
    const after = by.call('login', { username: 'ratan', password: 'secret1', year: 2026 }).token;
    eq(before === after, false, 'backend A175: a new login mints a new token');
    eq(err(function () { return by.call('pull', { token: before, year: 2026, since: 0 }); }) !== '', true,
       'backend A175: …and the old phone is logged out — one account, one device');
    by.call('releaseSession', { token: ty.hrishi, userId: rw('notin27').id });
    eq(err(function () { return by.call('pull', { token: ty.notin27, year: 2026, since: 0 }); }) !== '', true,
       'backend A175: …and 🔓 সেশন ছাড়ো puts a phone out too');
  }

  // --- A188: the reports' arithmetic, against a book small enough to add up --
  // Everything before this proved WHO may open a report. This asks whether the
  // number on it is the number a person with a calculator would get — because
  // that is the number somebody reads out at a committee meeting.
  //
  // The book is deliberately tiny and includes ONE VOIDED payment, which is
  // the real test: ₹2,000 (₹1,500 cash + ₹500 UPI) must vanish from every
  // total, including the cash/UPI split and the per-donor paid figure.
  {
    const bm = loadBackend();
    bm.api.setup();
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      bm.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '90000000' + i });
    });
    let t0 = bm.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bm.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'ratan'].forEach(function (u) {
      bm.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bm.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      bm.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'person', 'road', 'toto', 'bus'] });
    });
    bm.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
    bm.call('addSubject', { token: t0, name: 'আলো' });
    const tm = {};
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      tm[u] = bm.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    const put = function (u, store, row) { bm.call('push', { token: tm[u], records: [rec(store, row)] }); };
    put('ratan', 'parties',  { id: 's1', year: 2026, type: 'shop', name: 'দোকান ১', pledged: 5000, side: 'main_malda', sector: 'puja' });
    put('ratan', 'parties',  { id: 's2', year: 2026, type: 'shop', name: 'দোকান ২', pledged: 3000, side: 'main_malda', sector: 'puja' });
    put('ratan', 'payments', { id: 'y1', year: 2026, partyId: 's1', partyName: 'দোকান ১', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' });
    put('ratan', 'payments', { id: 'y2', year: 2026, partyId: 's1', partyName: 'দোকান ১', amount: 2000, cashAmount: 1500, upiAmount: 500, date: '2026-09-05' });
    put('kali',  'payments', { id: 'y3', year: 2026, partyId: 's2', partyName: 'দোকান ২', amount: 1000, cashAmount: 1000, upiAmount: 0, date: '2026-09-05' });
    put('ratan', 'daily',    { id: 'd1', year: 2026, type: 'road', amount: 900, cashAmount: 900, upiAmount: 0, date: '2026-09-05', sector: 'puja' });
    put('ratan', 'daily',    { id: 'd2', year: 2026, type: 'toto', amount: 400, cashAmount: 400, upiAmount: 0, date: '2026-09-05', sector: 'puja' });
    put('kali',  'expenses', { id: 'e1', year: 2026, subject: 'আলো', amount: 1200, cashAmount: 1200, upiAmount: 0, date: '2026-09-05', srcCat: 'other' });
    put('kali',  'voids',    { id: 'v1', year: 2026, targetStore: 'payments', targetId: 'y2', reason: 'ভুল', date: '2026-09-05' });

    const rep = function (id) { const r = bm.call('report', { token: tm.hrishi, id: id, year: 2026 }); return (r && r.data) || {}; };
    const ov = rep('overview');
    eq(ov.totalCollection, 4300, 'backend A188: total collected excludes the voided ₹2,000 (2000+1000+900+400)');
    eq(ov.totalPledged, 8000, 'backend A188: pledged is 5000+3000');
    eq(ov.totalDue, 5000, 'backend A188: due is (5000−2000)+(3000−1000)');
    eq(ov.totalExpense, 1200, 'backend A188: expenses');
    eq(ov.inHand, 3100, 'backend A188: in hand is 4300−1200');
    eq(ov.totalCash, 4300, 'backend A188: the voided row takes its ₹1,500 cash with it');
    eq(ov.totalUpi, 0, 'backend A188: …and its ₹500 UPI, which was the only UPI in the book');
    eq(ov.byType.shop.paid, 3000, 'backend A188: per-kind paid also drops the voided instalment');
    eq(ov.dailyByType.road + ov.dailyByType.toto, 1300, 'backend A188: the daily split adds up');

    const rows = (rep('inhand').rows || []);
    const held = function (u) { const r = rows.filter(function (x) { return String(x.collector).indexOf(u) >= 0; })[0]; return r ? r.inHand : null; };
    eq(held('ratan'), 3300, 'backend A188: ratan holds 2000+900+400 — not the voided 2000');
    eq(held('kali'), -200, 'backend A188: kali holds 1000−1200, and the book says minus rather than hiding it');
    eq(rows.reduce(function (a, r) { return a + (Number(r.inHand) || 0); }, 0), 3100,
       'backend A188: …and the two of them add back to the committee figure');
  }

  // --- A189: a committee post grants, and un-grants ------------------------
  // The whole permission model rests on "অনুমতি পদ থেকেই আসে", and Hrishi's
  // go-live step 2 is to set levels and permissions on the four posts. The
  // mechanism itself had never been driven — only the admin gate around it.
  {
    const bp = loadBackend();
    bp.api.setup();
    ['hrishi', 'kali', 'ratan', 'tapan'].forEach(function (u, i) {
      bp.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '89000000' + i });
    });
    let t0 = bp.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bp.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'ratan', 'tapan'].forEach(function (u) {
      bp.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bp.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
    });
    const tp = {};
    ['hrishi', 'kali', 'ratan', 'tapan'].forEach(function (u, i) {
      tp[u] = bp.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    t0 = tp.hrishi;
    const post = ((bp.call('listItems', { token: t0, kind: 'position' }) || {}).items || [])
      .filter(function (p) { return /কোষাধ্যক্ষ/.test(p.nameBn); })[0];
    eq(!!post, true, 'backend A189: the কোষাধ্যক্ষ post exists to hang permissions on');
    bp.call('setPositionRules', { token: t0, id: post.id,
      perms: ['cashier', 'shop', 'person', 'review'], maxCount: 1, level: 3 });

    const view = function (u) {
      const x = ((bp.call('listUsers', { token: t0 }) || {}).users || [])
        .filter(function (y) { return y.username === u; })[0] || {};
      return { own: String(x.ownEntries || ''), eff: String(x.entries || ''), cashier: Number(x.cashier) || 0 };
    };
    const shove = function (u, store, row) {
      return ((bp.call('push', { token: tp[u], records: [rec(store, row)] }) || {}).savedIds || []).length > 0;
    };

    eq(view('tapan').own, '', 'backend A189: he starts with nothing of his own');
    bp.call('setUserPosition', { token: t0, userId: rw('tapan').id, position: post.id });
    const withPost = view('tapan');
    eq(withPost.eff.indexOf('shop') >= 0 && withPost.eff.indexOf('review') >= 0, true,
       'backend A189: the post\'s permissions become effective');
    eq(withPost.own, '',
       'backend A189: …and are DERIVED, never copied into his own column — that is why they leave with the post');
    eq(withPost.cashier, 1, 'backend A189: …the cashier flag rides the post too');
    eq(shove('tapan', 'parties', { id: 'pp1', year: 2026, type: 'shop', name: 'পদের দোকান', pledged: 100, sector: 'puja' }), true,
       'backend A189: and they WORK — a donor written on a permission he was never personally given');
    eq(shove('tapan', 'expenses', { id: 'pe1', year: 2026, subject: 'আলো', amount: 50, cashAmount: 50, upiAmount: 0, date: '2026-09-05', srcCat: 'other' }), true,
       'backend A189: …an expense too, on the post\'s cashier flag');

    // the other half — the one this project has historically forgotten
    bp.call('setUserPosition', { token: t0, userId: rw('tapan').id, position: '' });
    const without = view('tapan');
    eq(without.eff.indexOf('shop') < 0, true, 'backend A189: taking the post back takes the permissions');
    eq(without.cashier, 0, 'backend A189: …and the cashier flag');
    eq(shove('tapan', 'parties', { id: 'pp2', year: 2026, type: 'shop', name: 'পরের', pledged: 100, sector: 'puja' }), false,
       'backend A189: …and the very next entry is refused');

    // a capped post holds one person
    bp.call('setUserPosition', { token: t0, userId: rw('kali').id, position: post.id });
    let e2 = '';
    try { const r = bp.call('setUserPosition', { token: t0, userId: rw('ratan').id, position: post.id });
          e2 = (r && r.error) || ''; } catch (err) { e2 = String(err.message || err); }
    eq(/position-full/.test(e2), true, 'backend A189: a post capped at 1 refuses a second holder');
    eq(/kali/.test(e2), true, 'backend A189: …and names who already holds it, which is the useful half');
  }

  // --- A190: the handover book's arithmetic, and who gets told -------------
  // A181 checked that confirming moves the two in-hand figures. This checks
  // the three columns behind them — collected / handedOver / pending — and
  // what a REJECTED parcel does to each, which is the case that can quietly
  // leave money in two places at once.
  {
    const bh = loadBackend();
    bh.api.setup();
    ['hrishi', 'kali', 'ratan', 'amal'].forEach(function (u, i) {
      bh.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '87000000' + i });
    });
    let t0 = bh.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bh.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'ratan'].forEach(function (u) {           // amal stays PENDING on purpose
      bh.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bh.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      bh.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'road'] });
    });
    bh.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
    const th = {};
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      th[u] = bh.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    const put = function (u, store, row) { bh.call('push', { token: th[u], records: [rec(store, row)] }); };
    put('ratan', 'parties',  { id: 'h1', year: 2026, type: 'shop', name: 'দোকান', pledged: 9000, sector: 'puja' });
    put('ratan', 'payments', { id: 'hy1', year: 2026, partyId: 'h1', partyName: 'দোকান', amount: 3000, cashAmount: 3000, upiAmount: 0, date: '2026-09-05' });
    put('ratan', 'handovers', { id: 'hh1', year: 2026, amount: 1000, cashAmount: 1000, upiAmount: 0, toId: 'kali', date: '2026-09-05', status: 'pending' });
    put('ratan', 'handovers', { id: 'hh2', year: 2026, amount: 500, cashAmount: 500, upiAmount: 0, toId: 'kali', date: '2026-09-05', status: 'pending' });

    const notifOf = function (u) {
      return (((bh.call('pull', { token: th[u], year: 2026, since: 0 }) || {}).notif || {}).notifications) || {};
    };
    eq(notifOf('kali').handovers, 1 + 1, 'backend A190: the RECIPIENT is told about parcels waiting');
    eq(notifOf('ratan').handovers, 0, 'backend A190: …and the sender is not told about their own');
    eq(notifOf('hrishi').approvals, 1, 'backend A190: the admin is told about the account waiting to be approved');

    bh.call('confirmHandover', { token: th.kali, id: 'hh1', year: 2026 });
    bh.call('rejectHandover', { token: th.kali, id: 'hh2', reason: 'পাইনি', year: 2026 });
    eq(notifOf('kali').handovers, 0, 'backend A190: answering both clears the recipient\'s cards');
    eq(notifOf('ratan').rejections, 1,
       'backend A190: …and the REFUSAL travels back to the sender, whose money just became spendable again');

    const A4 = require('../js/aggregate.js');
    const d = (bh.call('pull', { token: th.ratan, year: 2026, since: 0 }) || {}).data || {};
    const me = (A4.inHandRows(d) || []).filter(function (r) { return /ratan/.test(String(r.collector)); })[0] || {};
    eq(me.collected, 3000, 'backend A190: collected is what he took');
    eq(me.handedOver, 1000, 'backend A190: handedOver counts ONLY the confirmed parcel');
    eq(me.pending, 0, 'backend A190: a rejected parcel is not "awaiting confirm" — it is over');
    eq(me.inHand, 2000,
       'backend A190: so he holds 3000−1000: the refused ₹500 is back in his pocket, counted once');
  }

  // --- A191: money follows the collector, not the donor's owner ------------
  // 🔍 অন্য কারো দাতা says on screen "টাকা তোমার হাতে গণ্য হবে". If that were
  // wrong, two collectors' books would disagree about the same evening and
  // neither would be obviously at fault.
  {
    const bo = loadBackend();
    bo.api.setup();
    ['hrishi', 'kali', 'ratan', 'tapan'].forEach(function (u, i) {
      bo.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '86000000' + i });
    });
    let t0 = bo.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bo.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'ratan', 'tapan'].forEach(function (u) {
      bo.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bo.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      bo.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'road', 'review', 'otherdonor'] });
    });
    bo.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
    const to = {};
    ['hrishi', 'kali', 'ratan', 'tapan'].forEach(function (u, i) {
      to[u] = bo.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    const put = function (u, store, row) {
      return ((bo.call('push', { token: to[u], records: [rec(store, row)] }) || {}).savedIds || []).length > 0;
    };
    const A5 = require('../js/aggregate.js');
    const holds = function (u) {
      const d = (bo.call('pull', { token: to[u], year: 2026, since: 0 }) || {}).data || {};
      const r = (A5.inHandRows(d) || []).filter(function (x) { return String(x.collector).indexOf(u) >= 0; })[0];
      return r ? r.inHand : 0;
    };
    put('ratan', 'parties',  { id: 'o1', year: 2026, type: 'shop', name: 'রতনের দোকান', pledged: 5000, sector: 'puja' });
    put('ratan', 'payments', { id: 'oy1', year: 2026, partyId: 'o1', partyName: 'রতনের দোকান', amount: 1000, cashAmount: 1000, upiAmount: 0, date: '2026-09-05' });
    eq(put('tapan', 'payments', { id: 'oy2', year: 2026, partyId: 'o1', partyName: 'রতনের দোকান', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' }), true,
       'backend A191: otherdonor lets somebody take money against a donor that is not theirs');
    eq(holds('tapan'), 2000, 'backend A191: …and it lands in the hand of whoever TOOK it');
    eq(holds('ratan'), 1000, 'backend A191: …not in the hand of whoever owns the donor');
    const dd = (bo.call('pull', { token: to.hrishi, year: 2026, since: 0 }) || {}).data || {};
    eq((dd.payments || []).filter(function (p) { return p.partyId === 'o1'; })
       .reduce(function (a, p) { return a + Number(p.amount); }, 0), 3000,
       'backend A191: while the DONOR is credited the whole ₹3,000 — who carried it is not their problem');

    // the correction desk's other verdict: 🚫 ঠিক আছে leaves the row alone
    put('ratan', 'corrections', { id: 'c9', year: 2026, targetStore: 'payments', targetId: 'oy1', note: 'ভুল মনে হচ্ছে', date: '2026-09-05' });
    bo.call('setEntries', { token: to.hrishi, userId: rw('kali').id, entries: ['shop', 'review'] });
    bo.call('resolveCorrection', { token: to.kali, id: 'c9', decision: 'reject', year: 2026 });
    const d3 = (bo.call('pull', { token: to.hrishi, year: 2026, since: 0 }) || {}).data || {};
    eq(String(((d3.corrections || []).filter(function (x) { return x.id === 'c9'; })[0] || {}).status) !== 'pending', true,
       'backend A191: 🚫 settles the complaint');
    eq(A5.activeData(d3).payments.filter(function (p) { return p.id === 'oy1'; }).length, 1,
       'backend A191: …and leaves the money exactly where it was');
    eq((d3.voids || []).length, 0, 'backend A191: …writing no void at all');
  }

  // --- A192: buses and committee members ------------------------------------
  // Two kinds with rules of their own that nothing else shares.
  {
    const bb2 = loadBackend();
    bb2.api.setup();
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      bb2.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '85000000' + i });
    });
    let t0 = bb2.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bb2.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'ratan'].forEach(function (u) {
      bb2.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bb2.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      bb2.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'bus', 'member', 'memberadmin', 'road'] });
    });
    const tb = {};
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      tb[u] = bb2.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    t0 = tb.hrishi;
    const put = function (u, store, row) {
      return ((bb2.call('push', { token: tb[u], records: [rec(store, row)] }) || {}).savedIds || []).length > 0;
    };
    const book = function () { return (bb2.call('pull', { token: t0, year: 2026, since: 0 }) || {}).data || {}; };
    const A6 = require('../js/aggregate.js');

    const BUS = { year: 2026, type: 'bus', busName: 'সোনালী পরিবহন', busNumber: 'WB-59-1234',
                  amount: 2500, cashAmount: 2500, upiAmount: 0, date: '2026-09-05', sector: 'puja' };
    eq(put('ratan', 'daily', Object.assign({ id: 'b1' }, BUS)), true, 'backend A192: a bus collection saves');
    const bus = (book().daily || []).filter(function (d) { return d.id === 'b1'; })[0] || {};
    eq(bus.busName + '|' + bus.busNumber, 'সোনালী পরিবহন|WB-59-1234',
       'backend A192: …keeping the two fields only a bus has');
    eq(String(bus.receiptNo || '').length > 0, true,
       'backend A192: …and a receipt number, because a bus is handed one too');
    eq(put('ratan', 'daily', Object.assign({ id: 'b2' }, BUS)), true,
       'backend A192: the SERVER does not refuse the same bus twice — a bus can be collected from twice in a day');
    eq(((A6.reconcile(book(), {}) || {}).anomalies || []).map(function (a) { return a.type; })
       .indexOf('possible_duplicate_daily') >= 0, true,
       'backend A192: …the 🩺 desk asks about it instead, which is the right place for a maybe');
    const rt = (A6.inHandRows(book()) || []).filter(function (x) { return /ratan/.test(String(x.collector)); })[0] || {};
    eq(rt.inHand, 5000, 'backend A192: and the bus money is in the collector\'s hand like any other');

    // a committee member: no pledge, so no dues — the rule that keeps the
    // বাকির তালিকা about donors who promised something
    bb2.call('saveMember', { token: t0, name: 'নাম-kali', appUser: 'kali', phone: '9000000001', year: 2026 });
    const mem = (book().parties || []).filter(function (p) { return p.type === 'member'; })[0] || {};
    eq(mem.appUser, 'kali', 'backend A192: a member row carries the linked account');
    eq(Number(mem.pledged || 0), 0, 'backend A192: …and no pledge — a member gives what they give');
    eq(put('ratan', 'payments', { id: 'mp1', year: 2026, partyId: mem.id, partyName: mem.name,
        amount: 700, cashAmount: 700, upiAmount: 0, date: '2026-09-05', note: 'মাসিক' }), true,
       'backend A192: …their contribution is taken like any other payment');
    const dues = (bb2.call('report', { token: t0, id: 'dues', year: 2026 }) || {}).data || {};
    eq((dues.rows || []).some(function (r) { return String(r.type) === 'member'; }), false,
       'backend A192: …but a member never appears in বাকির তালিকা — nothing was promised, so nothing is owed');
  }

  // --- A193: editing a donor, the audit line, and the message cap ----------
  {
    const be2 = loadBackend();
    be2.api.setup();
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      be2.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '84000000' + i });
    });
    let t0 = be2.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return be2.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'ratan'].forEach(function (u) {
      be2.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      be2.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      be2.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'road'] });
    });
    const te = {};
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      te[u] = be2.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    t0 = te.hrishi;
    const put = function (u, store, row) {
      return ((be2.call('push', { token: te[u], records: [rec(store, row)] }) || {}).savedIds || []).length > 0;
    };
    const book = function () { return (be2.call('pull', { token: t0, year: 2026, since: 0 }) || {}).data || {}; };
    const due = function () { return ((be2.call('report', { token: t0, id: 'dues', year: 2026 }) || {}).data || {}).totalDue; };

    // a permission change is auditable, with WHO and WHAT
    const n0 = be2.rows('Audit').length;
    be2.call('setEntries', { token: t0, userId: rw('ratan').id, entries: ['shop', 'road', 'gupt'] });
    const line = be2.rows('Audit').slice(n0)[0] || {};
    eq(String(line.action), 'entries', 'backend A193: a permission change writes an audit line');
    eq(/gupt/.test(String(line.detail)), true, 'backend A193: …naming what was granted');
    eq(String(line.actor).length > 0, true, 'backend A193: …and who granted it');

    // editing a donor in place
    put('ratan', 'parties',  { id: 'ed1', year: 2026, type: 'shop', name: 'পুরনো নাম', pledged: 5000, side: 'main_malda', sector: 'puja' });
    put('ratan', 'payments', { id: 'ey1', year: 2026, partyId: 'ed1', partyName: 'পুরনো নাম', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' });
    const before = due();
    eq(put('ratan', 'parties', { id: 'ed1', year: 2026, type: 'shop', name: 'নতুন নাম', pledged: 3000, side: 'main_malda', sector: 'puja' }), true,
       'backend A193: a collector may correct their own donor');
    const rows = (book().parties || []).filter(function (p) { return p.id === 'ed1'; });
    eq(rows.length, 1, 'backend A193: …in place — an edit is not a second donor');
    eq(rows[0].name + '|' + rows[0].pledged, 'নতুন নাম|3000', 'backend A193: …with both fields changed');
    eq(due(), before - 2000, 'backend A193: …and the dues report follows the new pledge on its own');
    eq((book().payments || []).filter(function (p) { return p.partyId === 'ed1'; }).length, 1,
       'backend A193: …while the payment history is untouched');
    eq(put('kali', 'parties', { id: 'ed1', year: 2026, type: 'shop', name: 'কালীর বদল', pledged: 9999, side: 'main_malda', sector: 'puja' }), false,
       'backend A193: …and another collector cannot rewrite it');

    // the message cap, on the side that decides
    put('ratan', 'messages', { id: 'ms1', year: 2026, text: 'ক'.repeat(600), date: '2026-09-05', createdAt: new Date().toISOString() });
    const msg = (book().messages || []).filter(function (m) { return m.id === 'ms1'; })[0] || {};
    eq(String(msg.text || '').length, 500,
       'backend A193: a 600-character message is stored at 500 — messages ride every pull to every phone');
  }

  // --- A194: standing somebody down, and bringing them back ----------------
  // A174 covered the money queued during an exit. This is the round trip:
  // what an exit takes away, and whether a restore gives it back.
  {
    const bx = loadBackend();
    bx.api.setup();
    ['hrishi', 'ratan'].forEach(function (u, i) {
      bx.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '8200000' + i });
    });
    let t0 = bx.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bx.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    bx.call('setStatus', { token: t0, userId: rw('ratan').id, status: 'approved' });
    bx.call('approveYear', { token: t0, userId: rw('ratan').id, year: 2026 });
    bx.call('setEntries', { token: t0, userId: rw('ratan').id, entries: ['shop'] });
    const tx = { hrishi: bx.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token };
    tx.ratan = bx.call('login', { username: 'ratan', password: 'secret1', year: 2026 }).token;
    t0 = tx.hrishi;
    let n = 0;
    const canWrite = function () {
      return ((bx.call('push', { token: tx.ratan, records: [rec('parties', { id: 'z' + (++n),
        year: 2026, type: 'shop', name: 'দোকান', pledged: 100, sector: 'puja' })] }) || {}).savedIds || []).length > 0;
    };
    const post = ((bx.call('listItems', { token: t0, kind: 'position' }) || {}).items || [])
      .filter(function (p) { return /সদস্য/.test(p.nameBn); })[0];

    eq(canWrite(), true, 'backend A194: he works before anything happens');
    bx.call('setAccess', { token: t0, userId: rw('ratan').id, access: 'exiting' });
    eq(String(rw('ratan').entries || ''), '',
       'backend A194: standing him down clears his grants outright — not just his access flag');

    let e = '';
    try { const r = bx.call('setAccess', { token: t0, userId: rw('ratan').id, access: '' });
          e = (r && r.error) || ''; } catch (err) { e = String(err.message || err); }
    eq(e, 'position-required',
       'backend A194: bringing him back REQUIRES naming a post in the same call — a post is what he is given back');

    // restoring onto a post that grants nothing leaves him active and powerless
    bx.call('setAccess', { token: t0, userId: rw('ratan').id, access: '', position: post.id });
    eq(String(rw('ratan').access || ''), '', 'backend A194: he is active again');
    eq(canWrite(), false,
       'backend A194: …but an UNCONFIGURED post gives nothing back — exactly the state the guard exists to prevent');
    bx.call('setPositionRules', { token: t0, id: post.id, perms: ['shop'], maxCount: 0, level: 1 });
    eq(canWrite(), true,
       'backend A194: …and the moment the post carries a permission, he can work again');
  }

  // --- A196: blocking somebody who is holding money ------------------------
  // Blocking takes the LOGIN away, and a person who cannot log in cannot hand
  // money back. So the door refuses while they still hold some — and names the
  // figure, because the admin needs it to decide chase-or-write-off.
  {
    const bk2 = loadBackend();
    bk2.api.setup();
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      bk2.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '81000000' + i });
    });
    let t0 = bk2.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bk2.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'ratan'].forEach(function (u) {
      bk2.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bk2.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      bk2.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'road'] });
    });
    bk2.call('setCashier', { token: t0, userId: rw('kali').id, cashier: 1 });
    const tk2 = {};
    ['hrishi', 'kali', 'ratan'].forEach(function (u, i) {
      tk2[u] = bk2.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    t0 = tk2.hrishi;
    const oops = function (fn) { try { const r = fn(); return (r && r.error) || ''; } catch (e) { return String(e.message || e); } };
    const put = function (u, store, row) { return bk2.call('push', { token: tk2[u], records: [rec(store, row)] }); };
    put('ratan', 'parties',  { id: 'r1', year: 2026, type: 'shop', name: 'দোকান', pledged: 5000, sector: 'puja' });
    put('ratan', 'payments', { id: 'ry1', year: 2026, partyId: 'r1', partyName: 'দোকান', amount: 2000, cashAmount: 2000, upiAmount: 0, date: '2026-09-05' });

    // a refusal needs a reason, so the sender has something to answer
    put('ratan', 'handovers', { id: 'rh1', year: 2026, amount: 2000, cashAmount: 2000, upiAmount: 0, toId: 'kali', date: '2026-09-05', status: 'pending' });
    oops(function () { return bk2.call('rejectHandover', { token: tk2.kali, id: 'rh1', year: 2026 }); });
    eq(String((bk2.rows('Handovers').filter(function (h) { return h.id === 'rh1'; })[0] || {}).status), 'pending',
       'backend A196: a handover cannot be refused without a reason — an accusation the sender cannot answer is not allowed');
    bk2.call('rejectHandover', { token: tk2.kali, id: 'rh1', reason: 'গুনে কম পেলাম', year: 2026 });
    const ho = bk2.rows('Handovers').filter(function (h) { return h.id === 'rh1'; })[0] || {};
    eq(String(ho.status), 'rejected', 'backend A196: …with one, it is refused');
    eq(/গুনে কম/.test(String(ho.rejectReason || ho.reason || '')), true,
       'backend A196: …and the reason is kept on the row, not just shown once');

    // and the door that is also the last door
    const blocked = oops(function () { return bk2.call('setStatus', { token: t0, userId: rw('ratan').id, status: 'blocked' }); });
    eq(/^holds-money:2000/.test(blocked), true,
       'backend A196: blocking is REFUSED while they hold money, and the figure is in the error');
    eq(String(rw('ratan').status), 'approved',
       'backend A196: …so they are still able to log in and hand it back, which is the point');
    const n0 = bk2.rows('Audit').length;
    bk2.call('setStatus', { token: t0, userId: rw('ratan').id, status: 'blocked', override: 1 });
    eq(/অনাদায়ী|override/.test(bk2.rows('Audit').slice(n0).map(function (r) { return String(r.detail); }).join(' ')), true,
       'backend A196: …and overriding writes the write-off into the record rather than zeroing it silently');
    eq(oops(function () { return put('ratan', 'parties', { id: 'r2', year: 2026, type: 'shop', name: 'x', pledged: 100, sector: 'puja' }); }), 'bad-token',
       'backend A196: a blocked phone is logged out on the spot — not merely refused');
    eq((bk2.call('pull', { token: t0, year: 2026, since: 0 }).data.payments || [])
       .some(function (p) { return p.id === 'ry1'; }), true,
       'backend A196: …while the money they already collected stays in the book');
  }

  // --- A197: confirm vs reject on one row, and a cashier-to-cashier parcel --
  // Code.gs names this race itself: "the race that matters is precisely
  // confirm-vs-reject on one row". If the second verdict landed, the money
  // would move twice off one parcel.
  {
    const bc = loadBackend();
    bc.api.setup();
    ['hrishi', 'kali', 'bimal', 'ratan'].forEach(function (u, i) {
      bc.post('register', { username: u, name: 'নাম-' + u, password: 'secret' + i, phone: '80000000' + i });
    });
    let t0 = bc.call('login', { username: 'hrishi', password: 'secret0', year: 2026 }).token;
    const rw = function (u) { return bc.rows('Users').filter(function (x) { return x.username === u; })[0]; };
    ['kali', 'bimal', 'ratan'].forEach(function (u) {
      bc.call('setStatus', { token: t0, userId: rw(u).id, status: 'approved' });
      bc.call('approveYear', { token: t0, userId: rw(u).id, year: 2026 });
      bc.call('setEntries', { token: t0, userId: rw(u).id, entries: ['shop', 'road'] });
    });
    ['kali', 'bimal'].forEach(function (u) { bc.call('setCashier', { token: t0, userId: rw(u).id, cashier: 1 }); });
    const tc = {};
    ['hrishi', 'kali', 'bimal', 'ratan'].forEach(function (u, i) {
      tc[u] = bc.call('login', { username: u, password: 'secret' + i, year: 2026 }).token;
    });
    t0 = tc.hrishi;
    const A7 = require('../js/aggregate.js');
    const put = function (u, store, row) { bc.call('push', { token: tc[u], records: [rec(store, row)] }); };
    const oops = function (fn) { try { const r = fn(); return (r && r.error) || ''; } catch (e) { return String(e.message || e); } };
    const hand = function (u) {
      const d = (bc.call('pull', { token: t0, year: 2026, since: 0 }) || {}).data || {};
      const r = (A7.inHandRows(d) || []).filter(function (x) { return String(x.collector).indexOf(u) >= 0; })[0];
      return r ? r.inHand : 0;
    };
    put('ratan', 'parties',  { id: 'c1', year: 2026, type: 'shop', name: 'দোকান', pledged: 9000, sector: 'puja' });
    put('ratan', 'payments', { id: 'cy1', year: 2026, partyId: 'c1', partyName: 'দোকান', amount: 3000, cashAmount: 3000, upiAmount: 0, date: '2026-09-05' });
    put('ratan', 'handovers', { id: 'ch1', year: 2026, amount: 3000, cashAmount: 3000, upiAmount: 0, toId: 'kali', date: '2026-09-05', status: 'pending' });
    bc.call('confirmHandover', { token: tc.kali, id: 'ch1', year: 2026 });
    const after = { r: hand('ratan'), k: hand('kali') };
    eq(oops(function () { return bc.call('rejectHandover', { token: tc.kali, id: 'ch1', reason: 'ভুল', year: 2026 }); }),
       'already-confirmed', 'backend A197: a confirmed parcel cannot then be refused');
    eq(hand('ratan') === after.r && hand('kali') === after.k, true,
       'backend A197: …so the money does not move a second time off one parcel');

    put('ratan', 'handovers', { id: 'ch2', year: 2026, amount: 500, cashAmount: 500, upiAmount: 0, toId: 'kali', date: '2026-09-05', status: 'pending' });
    bc.call('rejectHandover', { token: tc.kali, id: 'ch2', reason: 'পাইনি', year: 2026 });
    oops(function () { return bc.call('confirmHandover', { token: tc.kali, id: 'ch2', year: 2026 }); });
    eq(String((bc.rows('Handovers').filter(function (h) { return h.id === 'ch2'; })[0] || {}).status), 'rejected',
       'backend A197: …and a refused one cannot then be confirmed');

    // cashier to cashier is the same machinery, and only the addressee may act
    const k0 = hand('kali'), b0 = hand('bimal');
    put('kali', 'handovers', { id: 'ch3', year: 2026, amount: 1000, cashAmount: 1000, upiAmount: 0, toId: 'bimal', date: '2026-09-05', status: 'pending' });
    bc.call('confirmHandover', { token: tc.bimal, id: 'ch3', year: 2026 });
    eq(hand('kali'), k0 - 1000, 'backend A197: a cashier can hand on to another cashier');
    eq(hand('bimal'), b0 + 1000, 'backend A197: …and it lands the same way');
    put('kali', 'handovers', { id: 'ch4', year: 2026, amount: 200, cashAmount: 200, upiAmount: 0, toId: 'bimal', date: '2026-09-05', status: 'pending' });
    eq(oops(function () { return bc.call('confirmHandover', { token: tc.kali, id: 'ch4', year: 2026 }); }) !== '', true,
       'backend A197: …while a cashier who is not the addressee cannot confirm it for them');

    // the 🩺 desk's pledge verdict, written to the server row
    put('ratan', 'payments', { id: 'cy2', year: 2026, partyId: 'c1', partyName: 'দোকান', amount: 20000, cashAmount: 20000, upiAmount: 0, date: '2026-09-05' });
    const kinds = function () {
      const d = (bc.call('pull', { token: t0, year: 2026, since: 0 }) || {}).data || {};
      return ((A7.reconcile(d, {}) || {}).anomalies || []).map(function (a) { return a.type; });
    };
    eq(kinds().indexOf('overpaid') >= 0, true, 'backend A197: paying past the pledge raises a question');
    bc.call('setAnomalyFlag', { token: tc.kali, store: 'parties', field: 'pledgeOk', id: 'c1', year: 2026, value: 1 });
    eq(kinds().indexOf('overpaid') < 0, true,
       'backend A197: …and "ঠিক আছে, বেশিই দিয়েছেন" settles it on the SERVER row, for every phone');
  }
};
