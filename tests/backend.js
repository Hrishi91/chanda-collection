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
    // what the audit suggested: take the central row, stamp it, push it back
    const central = b.call('pull', { token: tok.bimal, year: 2026 }).data.payments[0];
    central.dupOk = 1;
    b.call('push', { token: tok.bimal, epoch: '', records: [rec('payments', central)] });
    eq(b.rows('Payments')[0].collectorId, 'bimal',
       'backend U1: pushing a central row back DOES steal the attribution — which is why the desk must not do it');
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

  // ---- the version/schema handshake every client depends on ---------------
  {
    const { b, tok } = book();
    const r = b.post('pull', { token: tok.ratan, year: 2026, appVersion: 'chanda-v1.0.0', appSchema: 1 });
    eq(r.codeVersion, b.api.CODE_VERSION, 'backend version: every response carries the deployed version…');
    eq(r.schema, b.api.CODE_SCHEMA, 'backend version: …and the contract number the lock reads');
    const row = b.rows('Users').filter(function (u) { return u.username === 'ratan'; })[0];
    eq(row.appVersion, 'chanda-v1.0.0', 'backend version: …and the phone’s version is recorded for the fleet list');
  }
};
