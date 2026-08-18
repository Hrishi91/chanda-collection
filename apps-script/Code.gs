/**
 * Chanda Khata — central backend (Google Apps Script, bound to a Sheet).
 *
 * Deploy: Extensions → Apps Script in the target Google Sheet, paste this
 * file, run setup() once, then Deploy → Web app (execute as Me, access:
 * Anyone). The FIRST person to register from the app auto-becomes the
 * admin — no extra step. Full steps: docs/user-guide/setup-google.md
 *
 * Protocol: every call is a POST with text/plain JSON (no CORS
 * preflight). All data actions need a login token; admin actions need
 * an admin token. Rows are upserted by uuid `id`, so re-sending after a
 * failed sync can never duplicate.
 */

var SHEETS = {
  // NOTE: new columns are appended at the END so setup()'s migration (which
  // appends missing headers) keeps push's position-based writes aligned with
  // existing sheets. Do not insert columns mid-array.
  parties:  ['id', 'year', 'type', 'name', 'owner', 'side', 'phone', 'pledged', 'collector', 'createdAt', 'receivedAt', 'collectorId', 'location', 'collectorRole',
             // committee-member registry (v4.7.0). Only ever set when type='member';
             // APPENDED LAST per the header rule, and push's ensureCols_ materialises
             // them, so no separate setup() run is needed.
             //   position  a Lists id (kind='position') — সভাপতি / সম্পাদক / …
             //   email     record-keeping only; this app sends no mail
             //   appUser   username of this member's app account, INFORMATIONAL ONLY.
             //             Money still belongs to whoever COLLECTED it — linking a
             //             member to a user must never move a rupee, or the in-hand
             //             model (docs/money-model.md) stops holding.
             'position', 'email', 'appUser',
             // A61 (audit 2.3): 1 = a human looked at "paid more than pledged"
             // and said it is fine — donors do give more than they promised.
             // Without somewhere to record that, the line could never be
             // cleared and sat on the 🩺 desk all season. Appended LAST.
             'pledgeOk',
             // A80: 1 = a human looked at "two donors, same phone number" and
             // said they are genuinely different — one owner's second shop is a
             // real thing. Without somewhere to record that, the line could
             // never be cleared and would sit on the 🩺 desk all season, which
             // is how a desk stops being read. Appended LAST, like every other.
             'dupOk'],
  payments: ['id', 'year', 'partyId', 'partyName', 'amount', 'cashAmount', 'upiAmount', 'date', 'note', 'collector', 'createdAt', 'receivedAt', 'collectorId', 'collectorRole', 'receiptNo',
             // 1 = the collector was warned this looked like a same-day repeat
             // and confirmed it is a genuine second instalment. Travels to the
             // Sheet so the ADMIN's reconcile banner stops asking too — the
             // banner is read on a different device from the answer. LAST, per
             // the append-only header rule.
             'dupOk'],
  daily:    ['id', 'year', 'type', 'busName', 'busNumber', 'amount', 'cashAmount', 'upiAmount', 'date', 'note', 'collector', 'createdAt', 'receivedAt', 'collectorId', 'collectorRole', 'receiptNo',
             // A61 (audit 2.2): same meaning as payments.dupOk — somebody was
             // shown the possible repeat and said it is genuinely separate. It
             // needs a real column or the answer dies at the push and the desk
             // asks again for ever, which is the A60 failure exactly. LAST, per
             // the append-only header rule.
             'dupOk'],
  expenses: ['id', 'year', 'subject', 'desc', 'amount', 'spentBy', 'source', 'collectionType', 'date', 'collector', 'createdAt', 'receivedAt', 'collectorId', 'collectorRole',
             // how it was paid + which pot it came out of, so the cash/UPI and
             // per-category books stay exact on the SPEND side too (appended)
             'cashAmount', 'upiAmount', 'srcCat'],
  handovers: ['id', 'year', 'from', 'to', 'amount', 'cashAmount', 'upiAmount', 'date', 'note',
              'status', 'confirmedBy', 'confirmedAt', 'collector', 'createdAt', 'receivedAt', 'fromId', 'toId', 'collectorId', 'collectorRole',
              // JSON {cat:{cash,upi}} of which source categories the money
              // came from — keeps both sides' per-category in-hand exact
              'breakdown',
              // why the receiver said "পাইনি". APPENDED LAST on purpose: setup()
              // migrates headers by adding missing names at the end, and every
              // write here is position-based, so inserting mid-list would shift
              // every column after it in existing sheets.
              'rejectReason'],
  // audit-preserving corrections: a void points at another record's id
  voids: ['id', 'year', 'targetStore', 'targetId', 'reason', 'collector', 'createdAt', 'receivedAt', 'collectorId'],
  // a collector's "this is wrong" flag → a cashier/admin approves(void)/rejects
  // Committee chat. Adding it to SHEETS is the whole implementation on the
  // server side: push, pull, the delta cursor and the void filter all work on
  // any store listed here, so messages ride the pull the app already makes
  // every 60s and cost NOT ONE extra request. `mentions` is a CSV of usernames
  // or group words (all/cashiers/admin) — the client decides what to notify on.
  messages: ['id', 'year', 'text', 'mentions', 'collector', 'createdAt', 'receivedAt', 'collectorId', 'collectorRole'],
  corrections: ['id', 'year', 'targetStore', 'targetId', 'targetSummary', 'reason', 'status',
                'resolvedBy', 'resolvedAt', 'collector', 'collectorId', 'createdAt', 'receivedAt'],
};
var SHEET_TITLES = { parties: 'Parties', payments: 'Payments', daily: 'DailyCollections',
                     expenses: 'Expenses', handovers: 'Handovers', voids: 'Voids', corrections: 'Corrections',
                     messages: 'Messages' };

var USER_COLS = ['id', 'username', 'name', 'phone', 'passwordHash', 'salt', 'role',
                 'cashier', 'reports', 'status', 'years', 'token', 'mustChange', 'createdAt', 'updatedAt',
                 'areas', // append-only: comma-separated area ids this collector is responsible for
                 'entries', // permission keys granted to this PERSON (see PERM_KEYS) — extras only
                 'position', // the committee post they hold; its permission set is added on top
                 'appVersion', // last version this person's phone reported (A34)
                 // A78: the committee's ACCESS decision, which is not the same
                 // thing as `status`. '' = ordinary member; 'exiting' = the
                 // committee has taken this person off the work but they still
                 // owe money, so the login stays open until they hand it in.
                 // `status='blocked'` remains the SECURITY door (lost phone,
                 // stolen session) and is unchanged — the two are deliberately
                 // separate columns because they answer different questions and
                 // are decided by different people.
                 'access',
                 // A78: what they were holding on the day each door closed, as
                 // JSON {exit:{…}, block:{…}}. ONE column and not one per figure
                 // — every future figure would otherwise be a schema change. It
                 // is stored, not recomputed from a date: a void or a correction
                 // rewrites history backwards, so replaying to the exit date
                 // would not reproduce what the committee actually saw. A record
                 // that moves is not a record.
                 'exitSnap'];
var AUDIT_COLS = ['id', 'ts', 'actor', 'actorId', 'action', 'detail'];

// Per-report access: admin sees all; cashier gets 'inhand' by default;
// anyone else sees only what the admin grants (Users.reports, comma list).
// A68: which flag may be stamped on which store, and nothing else.
// A80: parties now carry TWO answers — "paid more than pledged is fine" and
// "same phone, different shop is fine" — so this maps a store to the LIST of
// fields it accepts. Still a fixed table and never a caller-supplied column
// name: this action must not become a way to set an arbitrary cell.
var ANOMALY_FLAGS = { payments: ['dupOk'], daily: ['dupOk'], parties: ['pledgeOk', 'dupOk'] };
var REPORT_IDS = ['overview', 'dues', 'inhand', 'collectors', 'areas', 'expenses', 'daily'];

// ---------- a user's permissions come from TWO places ----------
// The POST they hold (Lists kind='position') and the extras granted to them
// personally. The Users sheet stores ONLY the extras; the post's set is looked
// up live, so editing a post updates everyone holding it at once.
//
// These are read-only views. They must NEVER be written back into u.row —
// saveUser_ persists row.entries/reports/cashier, and folding a post's keys
// into somebody's personal extras would quietly make them permanent, surviving
// the day they leave the post. Every enforcement point calls these instead.
var posPermMemo_ = {}; // one execution, one read of the Lists sheet per post
function positionPerms_(positionId) {
  var id = String(positionId || '');
  if (!id) return { entries: [], reports: [], cashier: 0 };
  if (posPermMemo_[id]) return posPermMemo_[id];
  var out = { entries: [], reports: [], cashier: 0 };
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    if (sh && sh.getLastRow() > 1) {
      var pc = ensureCol_(sh, 'perms');
      var rows = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(2, pc)).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) !== id || String(rows[i][1]) !== 'position') continue;
        String(rows[i][pc - 1] || '').split(',').filter(String).forEach(function (k) {
          if (k === 'cashier') out.cashier = 1;
          else if (PERM_KEYS.indexOf(k) >= 0) out.entries.push(k);
          else if (REPORT_IDS.indexOf(k) >= 0) out.reports.push(k);
        });
        break;
      }
    }
  } catch (e) { /* a post we cannot read grants nothing — never more */ }
  posPermMemo_[id] = out;
  return out;
}
function union_(a, b) {
  var seen = {}, out = [];
  a.concat(b).forEach(function (k) { if (k && !seen[k]) { seen[k] = 1; out.push(k); } });
  return out;
}
// A115: the RANK of a post, memoised like positionPerms_ — one execution, one
// read of the sheet. 0 means "no rank set", and a level-0 person hands out
// nothing, so an un-ranked book behaves exactly like today's: admin appoints.
var posLevelMemo_ = {};
function positionLevel_(positionId) {
  var id = String(positionId || '');
  if (!id) return 0;
  if (posLevelMemo_[id] !== undefined) return posLevelMemo_[id];
  var out = 0;
  try {
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    if (sh && sh.getLastRow() > 1) {
      var lv = ensureCol_(sh, 'level');
      var rows = sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(2, lv)).getValues();
      for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][0]) !== id || String(rows[i][1]) !== 'position') continue;
        out = Number(rows[i][lv - 1]) || 0;
        break;
      }
    }
  } catch (e) { /* a rank we cannot read is no rank — never more */ }
  posLevelMemo_[id] = out;
  return out;
}

// A115: may THIS person hand THAT person THIS post? Returns '' for yes, or a
// reason code — the caller writes the refusal to the Audit log, because in a
// permission system the attempt that FAILS is the one worth keeping.
//
// Both doors to a committee post — the admin panel and the member register —
// come through here, so the answer cannot depend on which screen asked.
function canAssignPosition_(actor, target, wantPos) {
  var want = String(wantPos || '');
  var have = String((target && target.position) || '');
  if (want === have) return '';                  // nothing is being handed out
  if (String(actor.role) === 'admin') return ''; // admin can do all

  // 🚨 A110's emergency stop. Making somebody কোষাধ্যক্ষ hands them the one
  // money-moving key a post can carry, so a freeze that stopped money entries
  // but not this would be a stop with a door left open in it.
  if (String(readConfig_().freeze_at || '')) return 'freeze';

  // Nobody promotes themselves. Tested on identity, never on the screen the
  // request arrived from.
  if (String(target.username) === String(actor.username)) return 'self';

  // blocked means blocked: no post rides in, and none is taken away either.
  if (String(target.status) !== 'approved') return 'target-not-approved';

  // 💰 stays admin-only, and the test is the post's LIVE permission set rather
  // than its id — an admin may tick `cashier` onto any post at any time, and a
  // hard-coded 'treasurer' would quietly stop meaning what it says.
  //
  // BOTH ends, and the second one was missing until a real screen showed it: a
  // সম্পাদক (30) outranks the কোষাধ্যক্ষ (20), so the level rules happily let
  // them take the treasurer's post away — and with it the one money key a post
  // can carry. "Only an admin hands out 💰" is worth nothing if anybody senior
  // enough can take it back. Written for giving, unguarded for taking, exactly
  // like the level check two lines below.
  if (want && positionPerms_(want).cashier === 1) return 'cashier-admin-only';
  if (have && positionPerms_(have).cashier === 1) return 'cashier-admin-only';

  var mine = positionLevel_(actor.position);
  if (!mine) return 'no-level';

  // TWO checks, and they are deliberately separate rather than one combined
  // test. The first is about the post being GIVEN; the second about the person
  // being CHANGED. Only the second can stop a কোষাধ্যক্ষ stripping the
  // সভাপতি — because REMOVING a post sends want='', whose level is 0, and 0
  // sails through the first check every single time. This is the exact spot
  // where a "lower cannot touch higher" rule gets written for one half of the
  // pair and quietly missed for the other.
  if (want && positionLevel_(want) >= mine) return 'level-want';
  if (have && positionLevel_(have) >= mine) return 'level-target';
  return '';
}

// A115: one member row, read by id, with the sheet's REAL header — the same
// rule push learned in A81. Returns the handle saveMember/removeMember need to
// write it back without blanking a column they never sent.
// A116e (pre-go-live review #6): the voided rows. removeMember writes a `voids`
// row — the mechanism that travels — so the sheet row it removed is still
// physically there. Any register lookup that forgets this resurrects the dead:
// re-adding a removed member answered `account-taken` for ever, and editing a
// removed row reported success into a row every screen hides.
function voidedTargets_() {
  var out = {};
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.voids);
  if (sh && sh.getLastRow() >= 2) {
    var head = sheetHeader_(sh), it = head.indexOf('targetId');
    sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues().forEach(function (v) {
      out[String(v[it])] = 1;
    });
  }
  return out;
}
function findPartyRow_(id) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.parties);
  if (!sh || sh.getLastRow() < 2 || !String(id || '')) return null;
  if (voidedTargets_()[String(id)]) return null; // removed is removed — see above
  var head = sheetHeader_(sh);
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (String(vals[i][head.indexOf('id')]) !== String(id)) continue;
    var row = {};
    head.forEach(function (h, j) { row[h] = vals[i][j]; });
    return { rowIndex: i + 2, row: row, head: head, sh: sh };
  }
  return null;
}
// One account, one member row — counted over LIVE rows of the SAME year.
// Without the void filter, re-adding a removed member answered `account-taken`
// for ever; without the year filter, next season's rollover would lock the
// whole register (every account already "taken" by last year's row).
function memberRowByUser_(username, year) {
  var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.parties);
  if (!sh || sh.getLastRow() < 2 || !String(username || '')) return null;
  var head = sheetHeader_(sh);
  var iId = head.indexOf('id'), iTy = head.indexOf('type'), iAu = head.indexOf('appUser'),
      iYr = head.indexOf('year');
  if (iAu < 0) return null;
  var dead = voidedTargets_();
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, head.length).getValues();
  for (var i = 0; i < vals.length; i++) {
    if (dead[String(vals[i][iId])]) continue;
    if (year && iYr >= 0 && Number(vals[i][iYr]) !== Number(year)) continue;
    if (String(vals[i][iTy]) === 'member' &&
        String(vals[i][iAu]).toLowerCase() === String(username).toLowerCase()) {
      return { id: String(vals[i][iId]), rowIndex: i + 2 };
    }
  }
  return null;
}
// What the audit log says a member row IS. Kept in one place so `member:edit`
// can print before → after in the same shape, which is the only form of an
// edit log anybody can actually read.
function memberDesc_(row) {
  return [String(row.name || '?'), '@' + String(row.appUser || '—'),
          String(row.phone || '—'), String(row.email || '—')].join(' · ');
}

// A115: the committee roster — who holds which post — rebuilt on every pull.
// It is a PROJECTION of the Users sheet, never a stored second copy, and that
// is the entire point: a second copy is exactly what let the member register
// and the admin panel disagree about who was কোষাধ্যক্ষ.
//
// It rides on pull rather than behind its own admin-only call because the two
// screens that show a member's post — the register and 🤝 সদস্যের চাঁদা — are
// used OFFLINE, by collectors who are not admins. Without it those screens
// would show names with no post the moment the signal dropped, which reads to
// the person holding the phone as lost data.
//
// Deliberately narrow. No phone, no grants, no money: a picker needs a name to
// show and a username to store, and a post to display. Nothing here is wider
// than listCashiers, which every logged-in user has always been able to ask.
function committeeRoster_() {
  var sh = usersSheet_(), out = [];
  if (sh && sh.getLastRow() > 1) {
    sh.getDataRange().getValues().slice(1).forEach(function (v) {
      var row = {};
      USER_COLS.forEach(function (c, j) { row[c] = v[j]; });
      // blocked and pending rows are INCLUDED, with their status: the picker
      // filters them out, but a member row linked to an account that was
      // blocked last week must still show a name rather than go blank.
      out.push({ username: String(row.username), name: String(row.name),
                 role: String(row.role), status: String(row.status),
                 position: String(row.position || ''), cashier: effPerms_(row).cashier });
    });
  }
  return out;
}

function effPerms_(row) {
  var p = positionPerms_(row && row.position);
  return {
    entries: union_(String((row && row.entries) || '').split(',').filter(String), p.entries),
    reports: union_(String((row && row.reports) || '').split(',').filter(String), p.reports),
    cashier: (Number(row && row.cashier) === 1 || p.cashier === 1) ? 1 : 0,
  };
}
// One place decides "is this person a cashier", because the answer now has two
// sources and eight callers. Admin is always one.
function isCashier_(row) {
  return !!row && (row.role === 'admin' || effPerms_(row).cashier === 1);
}
// A78: the committee has stood this person down, but they still hold cash. The
// login stays open ON PURPOSE — a person who cannot log in cannot hand money
// back, and the money is the reason we are here. What they may still do is
// enumerated at the push gate, not inferred from empty permission lists:
// setAccess empties those lists too, but payments, handovers, voids, chat and
// correction flags all fall through permForRow_ with a null key, which
// entryAllowed_ grants to everyone. Emptying the lists alone would have stopped
// nothing that matters.
function isExiting_(row) {
  return !!row && String(row.access || '') === 'exiting';
}
function allowedReports_(u) {
  if (u.row.role === 'admin') return REPORT_IDS.slice();
  var granted = effPerms_(u.row).reports;
  if (isCashier_(u.row) && granted.indexOf('inhand') < 0) granted = granted.concat(['inhand']);
  return granted.filter(function (r) { return REPORT_IDS.indexOf(r) >= 0; });
}

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (key) {
    var sh = ss.getSheetByName(SHEET_TITLES[key]) || ss.insertSheet(SHEET_TITLES[key]);
    var want = SHEETS[key];
    if (sh.getLastRow() === 0) { sh.appendRow(want); sh.setFrozenRows(1); return; }
    // migrate: append any new columns to the header (existing data untouched)
    var have = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    var missing = want.filter(function (c) { return have.indexOf(c) < 0; });
    if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
    // A81: and say so when the sheet carries a column this file no longer
    // lists. ensureCols_ only ever APPENDS, so a name dropped from SHEETS lives
    // on in the sheet for ever — invisible, because reads go by header and look
    // right. That ghost is what put the pledgeOk answer into memberType for a
    // year. Every write is header-driven now and handles it, but drift that
    // nobody can see is drift nobody fixes, so it goes in the audit log where
    // the admin will meet it.
    var ghosts = have.filter(function (c) { return c && want.indexOf(c) < 0; });
    if (ghosts.length) logAudit_(null, 'schema:ghost', SHEET_TITLES[key] + ' → [' + ghosts.join(', ') + ']');
  });
  var us = ss.getSheetByName('Users') || ss.insertSheet('Users');
  if (us.getLastRow() === 0) { us.appendRow(USER_COLS); us.setFrozenRows(1); }
  else { // migrate: append any new user columns (e.g. areas) to the header
    var uHave = us.getRange(1, 1, 1, us.getLastColumn()).getValues()[0].map(String);
    var uMiss = USER_COLS.filter(function (c) { return uHave.indexOf(c) < 0; });
    if (uMiss.length) us.getRange(1, uHave.length + 1, 1, uMiss.length).setValues([uMiss]);
  }
  var es = ss.getSheetByName('ExpenseSubjects') || ss.insertSheet('ExpenseSubjects');
  if (es.getLastRow() === 0) { es.appendRow(['id', 'name', 'createdAt']); es.setFrozenRows(1); }
  var au = ss.getSheetByName('Audit') || ss.insertSheet('Audit');
  if (au.getLastRow() === 0) { au.appendRow(AUDIT_COLS); au.setFrozenRows(1); }
  var cf = ss.getSheetByName('Config') || ss.insertSheet('Config');
  if (cf.getLastRow() === 0) { cf.appendRow(['key', 'value']); cf.setFrozenRows(1); }
  // master lists (areas, person locations) — bilingual, admin-editable
  var ls = ss.getSheetByName('Lists') || ss.insertSheet('Lists');
  if (ls.getLastRow() === 0) { ls.appendRow(['id', 'kind', 'nameBn', 'nameEn', 'order', 'createdAt']); ls.setFrozenRows(1); }
  // A101: posts AND areas, from the one seed that listItems also uses. The four
  // areas used to be written out again right here — a second copy of the same
  // list, which is how two lists that must agree stop agreeing.
  ensureListCols_(ls);
  // automatic daily backup — no longer a manual editor step to remember
  var trig = ensureBackupTrigger_();
  Logger.log('setup complete · daily backup trigger: ' + trig);
  return 'setup ok · backup trigger ' + trig;
}

/** Run once from the editor after the first registration, e.g. makeAdmin('hrishi') */
function makeAdmin(username) {
  var u = findUser_('username', String(username).toLowerCase());
  if (!u) throw new Error('user not found: ' + username);
  u.row.role = 'admin';
  u.row.status = 'approved';
  u.row.years = addYear_(u.row.years, new Date().getFullYear());
  saveUser_(u);
  Logger.log('OK: ' + username + ' is now admin');
}

// ---------- helpers ----------
// A34: every response carries the server's version. Stamped in the ONE place
// every reply passes through, so no handler can forget — including the error
// replies, because a device that is behind and also getting errors still needs
// to learn the first fact.
function json_(obj) {
  var out = obj || {};
  if (out.codeVersion === undefined) out.codeVersion = CODE_VERSION;
  if (out.schema === undefined) out.schema = CODE_SCHEMA;
  return ContentService.createTextOutput(JSON.stringify(out))
    .setMimeType(ContentService.MimeType.JSON);
}
// Password hashing. Current scheme 's2$' key-stretches SHA-256 to slow down
// brute-force if the sheet ever leaks. Legacy hashes (no prefix, single-pass)
// still verify and are upgraded transparently on the next successful login.
var HASH_ITER = 200; // key-stretch rounds; kept modest so GAS login stays snappy
function sha256_(s) {
  return Utilities.base64Encode(Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8));
}
function hash_(salt, password) {
  var d = salt + password;
  for (var i = 0; i < HASH_ITER; i++) d = sha256_(d + salt);
  return 's2$' + d;
}
function verifyPassword_(stored, salt, password) {
  stored = String(stored || '');
  if (stored.indexOf('s2$') === 0) return hash_(salt, password) === stored;
  return sha256_(salt + password) === stored; // legacy single-pass
}
function usersSheet_() { return SpreadsheetApp.getActive().getSheetByName('Users'); }
function findUser_(col, val) {
  var sh = usersSheet_();
  if (sh.getLastRow() < 2) return null;
  var values = sh.getDataRange().getValues();
  var ci = USER_COLS.indexOf(col);
  for (var i = 1; i < values.length; i++) {
    if (String(values[i][ci]) === String(val)) {
      var row = {};
      USER_COLS.forEach(function (c, j) { row[c] = values[i][j]; });
      return { rowIndex: i + 1, row: row };
    }
  }
  return null;
}
function saveUser_(u) {
  u.row.updatedAt = new Date().toISOString();
  usersSheet_().getRange(u.rowIndex, 1, 1, USER_COLS.length)
    .setValues([safeRow_(USER_COLS, u.row)]);
}
function addYear_(years, y) {
  var list = String(years || '').split(',').filter(Boolean);
  if (list.indexOf(String(y)) < 0) list.push(String(y));
  return list.join(',');
}
function hasYear_(years, y) {
  return String(years || '').split(',').indexOf(String(y)) >= 0;
}
// The app receives the EFFECTIVE permissions under the names it has always used
// — entries / reports / cashier — so canEntry() and every screen behind it are
// untouched by the move to post-based granting. The personal extras ride along
// separately as own*, because that is what the admin screen edits: showing a
// merged set in an editable chip would let you switch off a key the post keeps
// handing back, which is the kind of control that teaches people not to trust
// controls.
function publicUser_(row) {
  var eff = effPerms_(row);
  return { id: row.id, username: row.username, name: row.name, phone: row.phone,
           role: row.role, cashier: eff.cashier,
           reports: eff.reports.join(','), status: row.status,
           years: String(row.years || ''), mustChange: Number(row.mustChange) || 0,
           areas: String(row.areas || ''), entries: eff.entries.join(','), createdAt: row.createdAt,
           position: String(row.position || ''), appVersion: String(row.appVersion || ''),
           ownCashier: Number(row.cashier) || 0,
           // A78: the badge every user list draws. `exitSnap` is deliberately
           // NOT here — it is a fat JSON blob and listUsers sends one of these
           // per person; the snapshot is fetched for one user at a time.
           access: String(row.access || ''),
           ownReports: String(row.reports || ''), ownEntries: String(row.entries || '') };
}
// A78: what this person is holding, right now, in the shape the exit record
// keeps. Money side comes from personalSummary_ — the same function the
// collector's own screen uses, so the committee and the collector can never be
// shown two different numbers. Donor side is the balance of the donors THEY
// brought in, because that is what "his own pending" means and it is what
// somebody else will have to go and collect.
function accountPicture_(d, ident) {
  var s = personalSummary_(d, ident);
  var act = activeData_(d);
  var paid = {}, mine = {};
  act.payments.forEach(function (p) {
    var k = String(p.partyId);
    paid[k] = (paid[k] || 0) + num_(p.amount);
    // …and how much of it THIS person took. Recorded per donor so "who
    // collected the rest after they left" can later be answered by subtracting
    // two saved figures instead of comparing timestamps. Two rows written in
    // the same second are indistinguishable by clock, and the exit stamp lands
    // in the middle of a working day.
    if (ck_(p) === String(ident)) mine[k] = (mine[k] || 0) + num_(p.amount);
  });
  var dues = act.parties.filter(function (p) { return ck_(p) === String(ident); })
    .map(function (p) {
      var pd = paid[String(p.id)] || 0;
      return { id: String(p.id), name: String(p.name || ''), type: String(p.type || ''),
               phone: String(p.phone || ''), pledged: num_(p.pledged), paid: pd,
               paidMine: mine[String(p.id)] || 0, due: num_(p.pledged) - pd };
    })
    // EPS, same half-paisa as computeReport_ 'dues' — "দেড়" parses to 1.5, so
    // fractions are real here and a fully-paid donor must not linger in a list
    // somebody is being sent out to collect.
    .filter(function (r) { return r.due > 0.005; })
    .sort(function (a, b) { return b.due - a.due; });
  return { collected: s.collected, received: s.received, handedOver: s.handedOver,
           pending: s.pending, expenseTotal: s.expenseTotal, inHand: s.inHand,
           dueTotal: sumBy_(dues, function (r) { return r.due; }), dueCount: dues.length, dues: dues };
}
// The saved record, tolerant of a blank cell and of anything unparseable — a
// corrupted blob must never stop an admin from blocking somebody.
// A78: one place decides whether a post may be handed to this person. It was
// inline in setUserPosition; restoring an exiting member needs exactly the same
// cap check, and a second copy of a rule is a second chance to get it wrong.
// `required` is true only on the restore path — an ordinary admin may clear
// somebody's post, but bringing a member back without one would leave them
// looking identical to a member who was just stood down.
function applyPosition_(u, want, required) {
  want = String(want || '');
  if (!want && required) throw new Error('position-required');
  if (want) {
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    if (!sh) throw new Error('not-found');
    ensureListCols_(sh);
    var mx = ensureCol_(sh, 'maxCount');
    var rows = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, Math.max(2, mx)).getValues() : [];
    var found = null;
    rows.forEach(function (r) { if (String(r[0]) === want && String(r[1]) === 'position') found = r; });
    if (!found) throw new Error('no-such-position');
    // The cap, enforced where it cannot be argued with. The dropdown greys a
    // full post out, but a stale screen or a cap tightened since it was drawn
    // would sail past that — this is the check at the moment of writing.
    var cap = Number(found[mx - 1]) || 0;
    if (cap > 0) {
      var us = usersSheet_(), held = [];
      if (us.getLastRow() > 1) {
        var pcol = ensureCol_(us, 'position'), ucol = USER_COLS.indexOf('username') + 1;
        us.getRange(2, 1, us.getLastRow() - 1, Math.max(pcol, ucol)).getValues().forEach(function (r, i) {
          if (String(r[pcol - 1]) === want && (i + 2) !== u.rowIndex) held.push(String(r[ucol - 1]));
        });
      }
      if (held.length >= cap) throw new Error('position-full:' + held.join(','));
    }
  }
  u.row.position = want;
}
// A78c: an exit picture taken during practice is practice data. It survives
// 🧹 and 🚀 because it lives in Users, which those deliberately spare — and it
// would then sit in front of the committee showing training money against
// donors the wipe deleted ("দোকান ১, ₹3,000 বাকি") with today's column reading
// ₹0 beside it. Same reasoning as the receiptSeq_ counters, which are cleared
// for exactly this reason despite living in Config.
//
// `access` is deliberately NOT cleared here. That is a decision about a PERSON,
// the same kind of thing as role, cashier and post — all of which survive on
// purpose. A wipe must not quietly reverse something the committee decided; the
// 🚀 screen names anyone still standing down instead, so it is a choice rather
// than an accident.
// A109: at go-live, take the grants off every BLOCKED account.
//
// Hrishi's rule, and it is the right boundary: a blocked person's entry rights,
// reports, cashier flag, areas and committee post are training-era grants to
// somebody the committee has already shut out. goLive empties the eight
// transactional sheets but deliberately keeps Users — otherwise twelve accounts
// would have to be set up again on the morning of the puja — so those grants
// ride into the live season untouched, and one tap on 🔓 restores cashier
// rights with no confirmation anywhere.
//
// It also frees a post nobody could otherwise reclaim. applyPosition_ counts
// the cap over EVERY row holding that position, blocked included, so a blocked
// কোষাধ্যক্ষ owns the only treasurer slot for ever — measured: setUserPosition
// answered `position-full:manik` before this, and after go-live it still did.
//
// Only at the cutover, and only for `blocked`. Ordinary block/unblock during
// the season is untouched: the grants stay, because an accidental block must
// not cost somebody's whole setup, and goLive writes a full Drive snapshot
// before any of this runs.
//
// admin rows are skipped, like clearUserGrants — locking the last admin out of
// their own book is not a thing this should be able to do.
function clearBlockedGrants_() {
  var sh = usersSheet_();
  if (!sh || sh.getLastRow() < 2) return 0;
  var n = sh.getLastRow() - 1, wide = sh.getLastColumn();
  var head = sh.getRange(1, 1, 1, wide).getValues()[0].map(String);
  var iStatus = head.indexOf('status'), iRole = head.indexOf('role');
  if (iStatus < 0) return 0;
  var cols = ['entries', 'reports', 'areas', 'position'].map(function (c) { return head.indexOf(c); });
  var iCash = head.indexOf('cashier');
  var vals = sh.getRange(2, 1, n, wide).getValues();
  var touched = 0;
  vals.forEach(function (r, i) {
    if (String(r[iStatus]) !== 'blocked') return;
    if (iRole >= 0 && String(r[iRole]) === 'admin') return;
    var had = false;
    cols.forEach(function (c) {
      if (c >= 0 && String(r[c] || '')) { sh.getRange(i + 2, c + 1).setValue(''); had = true; }
    });
    if (iCash >= 0 && Number(r[iCash]) === 1) { sh.getRange(i + 2, iCash + 1).setValue(0); had = true; }
    if (had) touched++;
  });
  return touched;
}
function clearExitSnaps_() {
  var sh = usersSheet_();
  if (!sh || sh.getLastRow() < 2) return 0;
  var col = ensureCol_(sh, 'exitSnap');
  var n = sh.getLastRow() - 1;
  var vals = sh.getRange(2, col, n, 1).getValues();
  var cleared = 0, out = vals.map(function (r) {
    if (String(r[0] || '')) cleared++;
    return [''];
  });
  if (cleared) sh.getRange(2, col, n, 1).setValues(out);
  return cleared;
}
function readSnap_(row) {
  try {
    var o = JSON.parse(String(row.exitSnap || '') || '{}');
    return (o && typeof o === 'object') ? o : {};
  } catch (e) { return {}; }
}
function takeSnap_(row, key, year, extra) {
  var pic = accountPicture_(readAll_(Number(year) || new Date().getFullYear()), String(row.username));
  pic.at = new Date().toISOString();
  pic.year = Number(year) || new Date().getFullYear();
  if (extra) Object.keys(extra).forEach(function (k) { pic[k] = extra[k]; });
  var snap = readSnap_(row);
  snap[key] = pic;
  row.exitSnap = JSON.stringify(snap);
  return pic;
}
// Append-only activity log for accountability (who did what, when). Logging
// must never break the real action, so it is fully wrapped in try/catch.
// `actor` is a user row (name + username).
function logAudit_(actor, action, detail) {
  try {
    var ss = SpreadsheetApp.getActive();
    var sh = ss.getSheetByName('Audit');
    if (!sh) { sh = ss.insertSheet('Audit'); sh.appendRow(AUDIT_COLS); sh.setFrozenRows(1); }
    sh.appendRow([Utilities.getUuid(), new Date().toISOString(),
      safeCell_((actor && actor.name) || ''), safeCell_((actor && actor.username) || ''),
      action, safeCell_(String(detail == null ? '' : detail))]);
  } catch (e) { /* audit is best-effort — never fail the caller */ }
}

// Key/value Config sheet (receipt design + counters). Small, admin-editable.
function configSheet_() {
  var ss = SpreadsheetApp.getActive();
  var sh = ss.getSheetByName('Config') || ss.insertSheet('Config');
  if (sh.getLastRow() === 0) { sh.appendRow(['key', 'value']); sh.setFrozenRows(1); }
  return sh;
}
// config minus internal counters — safe to hand to any user / ride the pull
function publicConfig_() {
  var all = readConfig_(), out = {};
  Object.keys(all).forEach(function (k) { if (k.indexOf('receiptSeq_') !== 0) out[k] = all[k]; });
  return out;
}
function readConfig_() {
  var sh = configSheet_(), out = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (r[0] !== '' && r[0] != null) out[String(r[0])] = String(r[1] == null ? '' : r[1]);
    });
  }
  return out;
}
function setConfig_(key, value) {
  var sh = configSheet_(), rowIdx = 0;
  if (sh.getLastRow() > 1) {
    var keys = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < keys.length; i++) { if (String(keys[i][0]) === String(key)) { rowIdx = i + 2; break; } }
  }
  if (rowIdx) sh.getRange(rowIdx, 2).setValue(value);
  else sh.appendRow([key, value]);
}
// Next receipt serial for a year, e.g. "2026-0001". Callers already hold the
// script lock (push), so the read-increment-write is atomic → never duplicates.
// The single source of "has anything changed?". Every write bumps it; a delta
// pull compares against it and, if nothing is newer, answers with an empty
// delta WITHOUT reading a single sheet. Idle polls are the overwhelming
// majority of all traffic — ten phones, once a minute, all day.
// Deliberately NOT best-effort. If this fails the stamp stays behind the rows
// just written, every device's `since` then reads as "already up to date", and
// the fast path skips real rows — silently, forever. A thrown error instead
// fails the push, the client retries, and rows upsert by id, so a retry is
// harmless. Loud beats lossy.
function touchData_() { setConfig_('data_ts', String(Date.now())); }
function dataTs_() { return Number(readConfig_().data_ts) || 0; }

// A66 (audit 2.20): nextReceiptNo_ lived here — one serial per call, one
// Config read/write each. reserveReceiptNos_ replaced it (a whole batch in one
// read/write, inside the push lock) and nothing has called this since. A dead
// minting function next to a live one is an invitation to call the wrong one.
function formatReceiptNo_(year, n, digits) {
  var d = Math.min(9, Math.max(4, Number(digits) || 6)); // admin-set width
  var s = '' + n; while (s.length < d) s = '0' + s;      // starts at 000…001
  return '' + year + s; // e.g. 2026000001 — year prefix, no separator
}
// Hand out several serials in one go. The per-row version read the WHOLE Config
// sheet and wrote it back for every single receipt: a 20-row offline catch-up
// meant 20 full reads and 20 writes inside the lock. This reads once, counts in
// memory, writes once — still atomic, because push holds the script lock.
function reserveReceiptNos_(year, howMany) {
  if (howMany <= 0) return [];
  var cfg = readConfig_(), key = 'receiptSeq_' + year;
  var start = (Number(cfg[key]) || 0) + 1;
  var out = [];
  for (var i = 0; i < howMany; i++) out.push(formatReceiptNo_(year, start + i, cfg.receipt_digits));
  setConfig_(key, start + howMany - 1);
  return out;
}

// Notification counts + detail items for a user, computed from an already-read
// year dataset (so `pull` can include it without a second sheet read).
function notifData_(u, d) {
  d = activeData_(d); // a voided (e.g. undo-voided) handover must not keep notifying the cashier
  var out = { handovers: 0, approvals: 0, corrections: 0, rejections: 0 };
  var items = { handovers: [], approvals: [], corrections: [], rejections: [] };
  // A refusal only reaches the SENDER, and it is the one notification that is
  // not a task queue: their in-hand figure does not move on a rejection (the
  // money never came off), only their handover ceiling grows back — so without
  // being told, money would quietly become spendable again with no explanation.
  // Everyone gets this, cashier or not.
  (d.handovers || []).forEach(function (h) {
    if (String(h.status) !== 'rejected') return;
    if (String(h.fromId || h.from) !== String(u.row.username) && h.from !== u.row.name) return;
    items.rejections.push({ id: h.id, to: h.to, amount: Number(h.amount) || 0,
                            date: h.date, reason: h.rejectReason || '' });
  });
  out.rejections = items.rejections.length;
  var isCashier = isCashier_(u.row);
  if (isCashier) {
    (d.handovers || []).forEach(function (h) {
      if (isRecipient_(h, u) && h.status !== 'confirmed' && h.status !== 'rejected') {
        // breakdown rides along so the receiver's notification shows the same
        // per-category / cash-UPI detail the giver picked
        items.handovers.push({ id: h.id, from: h.from, amount: Number(h.amount) || 0,
                               date: h.date, breakdown: h.breakdown || '' });
      }
    });
    out.handovers = items.handovers.length;
    // correction flags only reach whoever actually mans the desk
    if (canReview_(u)) {
      (d.corrections || []).forEach(function (c) {
        if (c.status === 'pending') {
          items.corrections.push({ id: c.id, targetStore: c.targetStore, targetId: c.targetId, reason: c.reason, by: c.collector, date: c.createdAt });
        }
      });
      out.corrections = items.corrections.length;
    }
  }
  if (u.row.role === 'admin') {
    var us = usersSheet_();
    if (us.getLastRow() > 1) {
      us.getDataRange().getValues().slice(1).forEach(function (v) {
        var row = {}; USER_COLS.forEach(function (c, j) { row[c] = v[j]; });
        if (String(row.status) === 'pending') items.approvals.push({ userId: row.id, name: row.name, username: row.username });
      });
    }
    out.approvals = items.approvals.length;
  }
  return { notifications: out, items: items };
}

// Permission keys an admin can grant per user, CSV in the Users `entries`
// column. Mirrors js/aggregate.js ENTRY_KINDS/PERM_KEYS — one key per thing a
// person actually collects, so a grant and what it unlocks are the same word.
// Bus sits with the new-entry types (it names a donor and issues a receipt).
// NOT permissions, because everyone needs them: চাঁদা নেওয়া (a later instalment
// from a donor anyone may have created), জমা দেওয়া, আমার entry / সংশোধন, বাকি.
var ENTRY_KINDS = ['shop', 'person', 'member', 'bus', 'road', 'toto'];
// 'review' is the cashier's correction desk; 'otherdonor' is reaching donors
// somebody ELSE wrote down, to take a later instalment. Neither is an entry
// kind, but both ride the same field so granting stays one screen.
// 'memberadmin' keeps the committee-member register (add a member, set the
// post, link the app account) — separate from 'member', which only allows
// COLLECTING from members.
var PERM_KEYS = ENTRY_KINDS.concat(['review', 'otherdonor', 'memberadmin']);

// ---------- what a committee POST may carry ----------
// A position (সভাপতি / সম্পাদক / কোষাধ্যক্ষ / সদস্য) holds a permission set, so
// granting is one dropdown per person instead of ~16 checkboxes each. Three
// rules, and the first is the one that matters:
//
//   'admin' is NOT here and can never be. Admin is not a committee post, it is
//   power over the whole system — if সম্পাদক carried it, making somebody
//   secretary would silently hand them everything. Hrishi's own words: that
//   grant "will be done by decision of board", one person at a time.
//
//   'cashier' IS here, because কোষাধ্যক্ষ literally means it. It is the one
//   money-moving key a post can carry (confirm handovers, general expenses), so
//   every change to it is written to the Audit log.
//
//   The three key spaces must stay DISJOINT — a position stores one flat list
//   and resolution decides the bucket by membership, so a key appearing in two
//   of them would land in the wrong one silently. tests/run.js asserts it.
var POSITION_PERM_KEYS = PERM_KEYS.concat(REPORT_IDS).concat(['cashier']);
// The committee's four posts, seeded server-side so they EXIST as rows the
// admin can edit. js/lists.js seeds the same four ids for offline display; if
// the sheet had none, those client-side rows would show in the UI and every
// edit would answer 'not-found'.
var POSITION_SEED = [['president', 'সভাপতি', 'President', 1],
                     ['secretary', 'সম্পাদক', 'Secretary', 1],
                     ['treasurer', 'কোষাধ্যক্ষ', 'Treasurer', 1],
                     ['member', 'সদস্য', 'Member', 0]];
// A115: the columns Lists carries beyond the six it is created with. `level` is
// the committee RANK of a post — a plain number the admin types in, bigger =
// more senior, several posts may share one. It decides who may hand a post out
// (canAssignPosition_), and NOTHING else: it grants no permission by itself.
//
// Deliberately NOT seeded. Hrishi's decision, and it happens to fail the safe
// way: until a level is typed in, a post's level is 0, and a level-0 person can
// hand out nothing — so the system keeps working with the admin doing every
// appointment, which is exactly today's behaviour. The one thing that must not
// happen is it failing SILENTLY, so the position editor says so on every post
// that has no level yet (A101's lesson: an inert feature nobody can see is
// indistinguishable from a broken one).
var LIST_COLS_EXTRA = ['maxCount', 'perms', 'level'];
// A101: the four shop areas. Ids match js/lists.js SEED.area exactly — the app
// has always shown these four from the client, and a row that stores an id the
// sheet has never heard of cannot be renamed, cannot be deleted, and answers
// 'not-found' to every edit. They lived inline in setup() until now, which is
// the whole bug: setup() runs once, by hand, and a book made before that block
// existed never got them.
var AREA_SEED = [['main_malda', 'মেন রোড — মালদার দিকে', 'Main Rd — Malda side'],
                 ['main_balurghat', 'মেন রোড — বালুরঘাটের দিকে', 'Main Rd — Balurghat side'],
                 ['harirampur', 'হরিরামপুর রোড', 'Harirampur Road'],
                 ['singhadaha', 'সিংহদহ রোড', 'Singhadaha Road']];

// Which permission key a row needs, from the row itself. null = common.
function permForRow_(store, row) {
  var ty = String((row && row.type) || '');
  if (store === 'parties' || store === 'daily') return ENTRY_KINDS.indexOf(ty) >= 0 ? ty : null;
  if (store === 'expenses' && String(row && row.source) === 'collection') {
    var ct = String(row.collectionType || '');
    return ENTRY_KINDS.indexOf(ct) >= 0 ? ct : null;
  }
  return null;
}
// May this user do this? A permission is something you are GIVEN: an empty
// field grants nothing. admin = everything; a null key is common to everyone.
// Mirrors js/aggregate.js permAllowed.
function entryAllowed_(u, key) {
  if (u.row.role === 'admin') return true;
  if (!key) return true;
  return effPerms_(u.row).entries.indexOf(key) >= 0;
}

// The cashier's correction desk. Base requirement unchanged (cashier or admin);
// on top of that the admin may withhold the 'review' grant.
function canReview_(u) {
  if (u.row.role === 'admin') return true;
  return isCashier_(u.row) && entryAllowed_(u, 'review');
}

// how many approved admins exist — guards the last-admin safeguard in setRole
function countAdmins_() {
  var sh = usersSheet_(), n = 0;
  if (sh.getLastRow() > 1) {
    var ri = USER_COLS.indexOf('role'), si = USER_COLS.indexOf('status');
    sh.getDataRange().getValues().slice(1).forEach(function (v) {
      if (String(v[ri]) === 'admin' && String(v[si]) === 'approved') n++;
    });
  }
  return n;
}
/** Token → approved user (throws otherwise). */
function requireUser_(token) {
  if (!token) throw new Error('no-token');
  var u = findUser_('token', token);
  if (!u) throw new Error('bad-token');
  if (u.row.status !== 'approved') throw new Error(u.row.status === 'blocked' ? 'blocked' : 'pending');
  noteAppVersion_(u, REQ_APP_VERSION);
  return u;
}
// Record which version a phone is running, so the admin can SEE the fleet
// instead of ringing ten people. Written only when it CHANGES — this runs on
// every single request, and a write per request would be both slow and a lock
// fight. One targeted cell, not saveUser_, so nothing else on the row can be
// clobbered by a stale copy.
function noteAppVersion_(u, v) {
  try {
    var val = String(v || '');
    if (!val || String(u.row.appVersion || '') === val) return;
    var sh = usersSheet_();
    var col = ensureCol_(sh, 'appVersion');
    sh.getRange(u.rowIndex, col).setValue(val);
    u.row.appVersion = val;
  } catch (e) { /* telemetry must never break the real action */ }
}
function requireAdmin_(token) {
  var u = requireUser_(token);
  if (u.row.role !== 'admin') throw new Error('not-admin');
  return u;
}

// ---------- entry point ----------
// R1 (final-audit): fields the SERVER settles AFTER a row was first pushed.
// `push` upserts by id over the full column width, and a backup-restore rightly
// re-pushes with synced:0 (A14) — so a stale client copy still reading
// status:'pending' would otherwise flip a settled row back and blank the
// server-written fields (who confirmed, when, why refused / who resolved).
// Money history must survive a restore, so on upsert these fields are copied
// forward from the sheet whenever the stored row is already settled.
var SETTLED_ON_UPSERT = {
  handovers: {
    when: function (ex) { return String(ex.status) === 'confirmed' || String(ex.status) === 'rejected'; },
    keep: ['status', 'confirmedBy', 'confirmedAt', 'rejectReason'],
  },
  corrections: {
    when: function (ex) { var st = String(ex.status || ''); return st !== '' && st !== 'pending'; },
    keep: ['status', 'resolvedBy', 'resolvedAt'],
  },
  // A59 (audit 2.6): the serial is minted ONLY on insert. So when a push
  // succeeded but its response was lost — the ordinary case at a pandal gate —
  // the phone still holds the row unsynced with receiptNo '' and retries. The
  // retry is an upsert, the mint is skipped, and the empty payload value was
  // written straight over the serial. **The donor is holding paper নং
  // 2026-0143 and the book now says nothing.** That is the one number a donor
  // can quote back, and the only way to find their payment by hand.
  // `when` asks the EXISTING row, not the payload: only a row that already has
  // a serial defends it, so this can never invent one.
  payments: {
    when: function (ex) { return String(ex.receiptNo || '') !== ''; },
    keep: ['receiptNo'],
  },
  // bus collections get a name+number receipt too
  daily: {
    when: function (ex) { return String(ex.receiptNo || '') !== ''; },
    keep: ['receiptNo'],
  },
};

// The version the CURRENT request came from. A script-global is safe here and
// nowhere else: Apps Script runs one request per execution context, so this is
// per-request state, not shared state. It exists so requireUser_ can record the
// device version without every one of ~40 handlers having to pass it along.
var REQ_APP_VERSION = '';
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    REQ_APP_VERSION = String(body.appVersion || '');
    var fn = ACTIONS[body.action];
    if (!fn) throw new Error('unknown action');
    return json_(fn(body));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}
// doGet is the ONLY unauthenticated surface, which makes it the only place a
// deployment can be identified from the outside. Twice now a redeploy has been
// assumed rather than proven — once the file was current but the DEPLOYMENT was
// stale (the chat kill switch, A16), and today `rejectHandover` existing was all
// that could be checked, which cannot tell a v4.5.0 deployment from a v4.5.2 one.
// So the version travels here: one curl, no token, nothing written.
//   curl -sL "$EXEC"  →  {"ok":true,"service":"chanda-khata","version":"..."}
// CODE_VERSION is asserted against sw.js's VERSION in tests/run.js, so the two
// cannot drift apart by someone forgetting to bump one of them.
var CODE_VERSION = 'chanda-v4.34.21';
// A43: the RELEASE string above is for people to read. CODE_SCHEMA is the
// CONTRACT — columns, handlers, meanings — and it is the only number the app's
// version lock and warnings consult. It moves only in a commit that actually
// changes this file's behaviour, so a client-only release stops demanding a
// redeploy that would change nothing. Bump it here and in js/auth.js together.
var CODE_SCHEMA = 5;
function doGet() { return json_({ ok: true, service: 'chanda-khata', version: CODE_VERSION }); }

var ACTIONS = {

  register: function (b) {
    var username = String(b.username || '').trim().toLowerCase();
    var name = String(b.name || '').trim();
    var password = String(b.password || '');
    if (!/^[a-z0-9._-]{3,20}$/.test(username)) throw new Error('bad-username');
    if (!name || password.length < 6) throw new Error('bad-input');
    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      if (findUser_('username', username)) throw new Error('username-taken');
      // The very first registrant becomes the admin, auto-approved for this
      // year — no separate makeAdmin step needed.
      var first = usersSheet_().getLastRow() < 2;
      var salt = Utilities.getUuid();
      usersSheet_().appendRow(USER_COLS.map(function (c) {
        var row = {
          id: Utilities.getUuid(), username: username, name: name,
          phone: String(b.phone || ''), passwordHash: hash_(salt, password), salt: salt,
          role: first ? 'admin' : 'user', cashier: 0, reports: '',
          status: first ? 'approved' : 'pending',
          years: first ? String(new Date().getFullYear()) : '', token: '',
          mustChange: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        return safeCell_(row[c]);
      }));
    } finally { lock.releaseLock(); }
    return { ok: true, first: first };
  },

  login: function (b) {
    var u = findUser_('username', String(b.username || '').trim().toLowerCase());
    if (!u || !verifyPassword_(u.row.passwordHash, u.row.salt, String(b.password || ''))) {
      throw new Error('bad-login');
    }
    if (u.row.status === 'pending') throw new Error('pending');
    if (u.row.status === 'blocked') throw new Error('blocked');
    var year = b.year ? Number(b.year) : new Date().getFullYear();
    if (!hasYear_(u.row.years, year)) throw new Error('year-not-approved');
    // transparently upgrade a legacy hash to the current scheme
    if (String(u.row.passwordHash).indexOf('s2$') !== 0) {
      u.row.passwordHash = hash_(u.row.salt, String(b.password || ''));
    }
    u.row.token = Utilities.getUuid();
    saveUser_(u);
    return { ok: true, token: u.row.token, user: publicUser_(u.row) };
  },

  // invalidate the caller's token server-side (logout)
  logout: function (b) {
    var u = findUser_('token', b.token);
    if (u) { u.row.token = ''; saveUser_(u); }
    return { ok: true };
  },

  changePassword: function (b) {
    var u = requireUser_(b.token);
    var mustChange = Number(u.row.mustChange) === 1;
    if (!mustChange && !verifyPassword_(u.row.passwordHash, u.row.salt, String(b.oldPassword || ''))) {
      throw new Error('bad-login');
    }
    if (String(b.newPassword || '').length < 6) throw new Error('bad-input');
    u.row.salt = Utilities.getUuid();
    u.row.passwordHash = hash_(u.row.salt, String(b.newPassword));
    u.row.mustChange = 0;
    saveUser_(u);
    return { ok: true };
  },

  push: function (b) {
    // A53 (audit 0.5): refuse a batch minted before a system reset.
    //
    // goLive and restoreBackup bump data_epoch and the client honours it — but
    // nothing ordered the pull before the push, and push never checked. A phone
    // that was OFFLINE across the cutover regains signal, fires autoSync on the
    // 'online' event with no pull on that path at all, and its pre-wipe training
    // queue lands in the live book — collecting FRESH live serials from counters
    // that were just reset to 000001, so they collide with genuine receipts and
    // are indistinguishable from real money.
    //
    // residual-risks.md told Hrishi those rows would be "lost". They were not
    // lost, they were injected, which is worse: lost data you notice.
    //
    // Client-side ordering is worth having too, but it cannot be the defence —
    // the offline phone is by definition not participating in it. A client that
    // sends no epoch at all (an older build) is let through: silence must not
    // block a collector, and those builds pre-date the reset anyway.
    if (b.epoch !== undefined && b.epoch !== null && String(b.epoch) !== '') {
      var liveEpoch = String(readConfig_().data_epoch || '');
      if (liveEpoch && String(b.epoch) !== liveEpoch) throw new Error('stale-epoch');
    }
    var user = requireUser_(b.token);
    var lock = LockService.getScriptLock();
    lock.waitLock(20000); // 10 collectors may sync at once
    try {
      var ss = SpreadsheetApp.getActive();
      var savedIds = [];
      var rejectedIds = []; // permission-blocked rows (UI never sends these; tampering does)
      var heldIds = [];     // A110: frozen — neither saved nor refused, so they stay queued
      var reassigned = {};  // username → rows an admin filed under someone else
      var receipts = {}; // paymentId → assigned serial, so the client can adopt it
      // server-side mirror of the client's gating — the UI hides what a user may
      // not insert, but the server must not trust the client. The key comes from
      // the ROW (its type), not the store, because bus and road live in the same
      // store yet are separate permissions.
      var isCashier = isCashier_(user.row);
      var chatOff = String(readConfig_().chat_off || '') === 'on';
      // A110: frozen rows are HELD, not refused. A row in neither savedIds nor
      // rejectedIds is left untouched by sync.js — still queued, retried on the
      // next push — so lifting the freeze lets the backlog through by itself.
      // Refusing them would have been wrong twice: A54 takes a refused row out
      // of the queue for good, and this block is temporary by definition.
      //
      // The admin is exempt: they are the person expected to be fixing whatever
      // caused the freeze, and a locked-out fixer helps nobody.
      var freezeAt = String(readConfig_().freeze_at || '');
      var frozen = !!freezeAt && String(user.row.role) !== 'admin';
      var byStore = {};
      // A59: every row in this batch is known to the owner index BEFORE the
      // gate runs, so a void can find a target that is arriving alongside it.
      (b.records || []).forEach(function (r) {
        if (r && SHEETS[r.store] && r.row && r.row.id) noteIncomingOwner_(r.store, r.row.id, user);
      });
      var exiting = isExiting_(user.row);
      (b.records || []).forEach(function (r) {
        // A116h (pre-go-live review): a malformed record — unknown store, no
        // row, no id — used to `return` here and land in NONE of
        // savedIds/rejectedIds/heldIds. The client only removes a row from its
        // queue when one of those lists names it, so such a row was re-pushed
        // on every sync for ever. It takes a client bug to produce one; it must
        // not take a server change to drain one.
        if (!r || !r.row) return; // nothing to name — nothing is stuck either
        if (!SHEETS[r.store] || !r.row.id) { if (r.row.id) rejectedIds.push(r.row.id); return; }
        // A110: money is frozen; talking is not. Whatever stopped the
        // collection has to be explainable to twelve people, and 💬 বার্তা is
        // the only way to reach them all at once.
        //
        // `>=` against the stamp, so a row written in the same second as the
        // freeze is held rather than let through — when the two cannot be
        // ordered, the safe reading wins.
        if (frozen && r.store !== 'messages' && String(r.row.createdAt || '') >= freezeAt) {
          heldIds.push(r.row.id); return;
        }
        // A78: the access-block, and it is an ALLOW-LIST on purpose. Taking the
        // post and both permission lists away — which setAccess does — stops
        // donors, daily rounds and expenses, because those carry a permission
        // key. It stops NOTHING else: payments, handovers, voids, chat and
        // correction flags all reach entryAllowed_ with a null key, which is
        // granted to everybody. So the two things the committee actually
        // decided they may still do are named here, and everything absent is
        // refused rather than left to fall through.
        //
        // Two of those exclusions are the point rather than tidiness:
        //   · voids — a person on their way out must not be able to erase a
        //     payment they already took. The row would leave the book, their
        //     in-hand would drop by the same amount, the arithmetic would still
        //     balance, and nobody would be owed anything. The cash would simply
        //     be gone.
        //   · payments against SOMEBODY ELSE's donor — "his own pending, not
        //     others'". Nothing else in this file keys a payment to an owner,
        //     so without this line that half of the rule is only a sentence.
        if (exiting) {
          if (r.store === 'handovers') { /* handing in what they hold: the whole point */ }
          else if (r.store === 'payments') {
            var pOwn = ownerIndex_('parties')[String(r.row.partyId)];
            if (!pOwn || String(pOwn.collectorId) !== String(user.row.username)) { rejectedIds.push(r.row.id); return; }
          } else if (r.store === 'corrections') {
            // A78e (Hrishi's call): a flag is not an entry, it is a sentence to
            // the cashier — "the ₹500 I took is written down as ₹5,000". Refuse
            // it and the mistake stays in the book, which is the opposite of
            // what standing somebody down is meant to protect. They cannot fix
            // it themselves (voids and edits are still refused); they can only
            // report it, and a cashier decides.
            //
            // Their OWN rows only, like every other rule in this feature — a
            // departing member has no business filing complaints about other
            // people's work, and the correction desk is somebody's afternoon.
            var tOwn = targetOwner_(String(r.row.targetStore || ''), r.row.targetId);
            if (!tOwn || String(tOwn.collectorId) !== String(user.row.username)) { rejectedIds.push(r.row.id); return; }
          } else { rejectedIds.push(r.row.id); return; }
        }
        // A78b: and nobody may send money TO somebody who has been stood down or
        // blocked. The recipient picker already omits them — it lists cashiers,
        // and standing somebody down clears that flag — but a screen drawn
        // before the decision, or a parcel sitting in an offline queue from
        // yesterday, would sail straight past a UI-only rule and rebuild the
        // stranded-parcel trap the guard above exists to prevent.
        //
        // Only refused when the recipient is KNOWN to be shut: a free-text name
        // that matches no account is left alone, because "we cannot tell" must
        // never become "no".
        if (r.store === 'handovers') {
          var to = accessIndex_()[String(r.row.toId || r.row.to || '')];
          if (to && (to.access === 'exiting' || to.status === 'blocked')) { rejectedIds.push(r.row.id); return; }
        }
        // general puja expenses are cashier/admin only; a COLLECTION expense is
        // spent out of a round the person is running, so permForRow_ hands back
        // that round's key instead.
        if (r.store === 'expenses' && String(r.row.source) !== 'collection' && !isCashier) {
          rejectedIds.push(r.row.id); return;
        }
        if (r.store === 'voids' && !voidAllowed_(user, r.row)) { rejectedIds.push(r.row.id); return; }
        // A60 (audit 2.1): correcting a DONOR row is now offered in the UI
        // (canEditParty), so the rule has to exist here too or it is decoration.
        // Only the creator or an admin may change an EXISTING party. A new one
        // is unaffected, and so is every other store.
        //
        // A cashier is excluded deliberately, and not for tidiness: the write
        // loop below re-stamps collector/collectorId from the token, and only
        // the admin branch carries the original attribution forward. A cashier
        // editing a shop would silently move that donor into their own name.
        // A116a (pre-go-live review #1): A60 gave `parties` this rule — only
        // the creator or an admin may rewrite an EXISTING row — and left the
        // four MONEY stores without it, which is the same hole one store over.
        // Without this, any valid token could re-push somebody else's payment
        // id with a different amount: the row is rewritten in place, restamped
        // to the pusher, the receipt serial survives pointing at a changed
        // amount, and reconcile stays balanced because the money only moved
        // between pockets. A tampered client is exactly the threat A9/A51/A60
        // were built against. Ordinary retries pass (same collector); admin
        // restore passes (admin); cashiers settle through confirmHandover,
        // which was never push.
        if (['payments', 'daily', 'expenses', 'handovers'].indexOf(r.store) >= 0) {
          var mOwn = ownerIndex_(r.store)[String(r.row.id)];
          if (mOwn && user.row.role !== 'admin' && mOwn.collectorId &&
              mOwn.collectorId !== user.row.username) { rejectedIds.push(r.row.id); return; }
        }
        if (r.store === 'parties') {
          var own = ownerIndex_('parties')[String(r.row.id)];
          if (own && user.row.role !== 'admin' && own.collectorId &&
              own.collectorId !== user.row.username) { rejectedIds.push(r.row.id); return; }
          // A115: a committee POST can no longer arrive this way. saveMember is
          // the only door, because only there can the level rules, the cap and
          // the self-check run at the moment of writing.
          //
          // Rows with NO post are still accepted, deliberately: a phone that
          // queued a member offline before this version shipped would otherwise
          // have its work dropped without a word, and silently discarding
          // somebody's entry is the failure this project keeps finding. So the
          // old queue drains, and only the part that grants power is refused.
          // A116g (pre-go-live review #10): STRIP the post, keep the person.
          // This used to reject the whole row, while its own comment promised
          // "only the part that grants power is refused" — so an old offline
          // queue lost the member's name and phone along with the post. The
          // code now does what the comment always said.
          if (String(r.row.type) === 'member') r.row.position = '';
        }
        // the chat kill switch is enforced HERE, not only in the UI — otherwise
        // a phone with the screen still cached could keep writing after the
        // admin turned it off
        if (r.store === 'messages' && chatOff) { rejectedIds.push(r.row.id); return; }
        if (!entryAllowed_(user, permForRow_(r.store, r.row))) { rejectedIds.push(r.row.id); return; }
        (byStore[r.store] = byStore[r.store] || []).push(r.row);
      });
      Object.keys(byStore).forEach(function (store) {
        var sh = ss.getSheetByName(SHEET_TITLES[store]);
        var cols = SHEETS[store];
        ensureCols_(sh, cols); // never write into an unnamed column — see above
        var idRow = {};
        if (sh.getLastRow() > 1) {
          sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (v, i) {
            idRow[String(v[0])] = i + 2;
          });
        }
        // R1: if this store carries server-settled fields and the incoming row
        // updates an EXISTING one, carry the settled values forward. One extra
        // read per upsert — upserts only happen on retry/restore, never in the
        // normal append-only flow, so the cost is where the danger is.
        var settle = SETTLED_ON_UPSERT[store];
        // A59 (audit 2.6): remember what was carried forward, because saving the
        // serial on the SHEET is only half the repair. The phone that lost the
        // first response has no serial either, and `receipts` is only filled at
        // mint time — so its receipt would read "নং —" for ever while the book
        // knew the number all along. Handing back what we preserved closes that.
        var carried = {};
        // A81: `head` is the sheet's real header; every read and write below is
        // aimed by NAME through it. cols.length / cols.indexOf were correct only
        // while the two agreed, and they stopped agreeing in v4.7.3.
        var head = sheetHeader_(sh);
        var rowAt = function (rowId) {
          return idRow[rowId] ? sh.getRange(idRow[rowId], 1, 1, head.length).getValues()[0] : null;
        };
        var preserve = function (rowId, values) {
          if (!settle || !idRow[rowId]) return values;
          var have = rowAt(rowId);
          var ex = {}; head.forEach(function (h, ci) { ex[h] = have[ci]; });
          if (!settle.when(ex)) return values;
          settle.keep.forEach(function (c) {
            var at = head.indexOf(c);
            if (at < 0) return;
            values[at] = ex[c];
            (carried[rowId] = carried[rowId] || {})[c] = ex[c];
          });
          return values;
        };
        // Two Sheet writes per store instead of one per row. appendRow costs a
        // round trip each; a 20-row offline catch-up used to be 20 of them
        // inside the lock. Collect the new rows, write them in one setValues.
        var pending = [];
        // reserve every serial this batch needs in a single Config read/write
        var needSerial = byStore[store].filter(function (r) {
          return !idRow[r.id] && !r.receiptNo &&
                 (store === 'payments' || (store === 'daily' && r.type === 'bus'));
        });
        var serials = reserveReceiptNos_(Number((needSerial[0] || {}).year) || new Date().getFullYear(),
                                         needSerial.length);
        var serialAt = 0;
        byStore[store].forEach(function (row) {
          row.receivedAt = new Date().toISOString();
          // Identity is stamped from the TOKEN, unconditionally — never taken
          // from the payload. The old `row.x || user.x` form let a tampered
          // client attribute its entry (and therefore the cash-in-hand
          // liability) to another collector. The real client always sends its
          // own identity, so normal use is unchanged. (Handover from/to are
          // separate fields and stay as sent — a handover is BY definition
          // about two other parties, and confirmHandover is the gate there.)
          // Identity comes from the token (A9) — with ONE exception: an admin
          // restoring a collector's backup must be able to file those rows
          // under the collector they belong to, or the money lands on the
          // admin's head and every in-hand figure is wrong. Only an admin, only
          // when the row names someone, and it is written to the audit log.
          // A73 (audit #5 V2): this used to sit 30 lines BELOW the admin
          // reassign branch's early `return`, so every server-decided field was
          // blanked on the collector path and left verbatim on the admin one.
          // Measured before the fix: an admin-reassigned handover kept
          // status:'confirmed' and confirmedBy:'FORGED'. The acceptance said "on
          // EVERY code path that inserts" and it was true of one of two.
          //
          // Lifting it also closes two things that were never regressions, just
          // consequences of the same early return: a reassigned payment now gets
          // the serial reserveReceiptNos_ had already burned for it (the counter
          // was gapping, on a system whose contract is that serials are never
          // reused), and a reassigned void is audited like any other.
          var isNew = !idRow[row.id];
          // A51 (audit 0.6): fields only the SERVER may decide, blanked on
          // INSERT whatever the client sent.
          //
          // `handovers` falls through every branch of the push gate —
          // permForRow_ returns null for it and entryAllowed_(u, null) is true —
          // by design, because handing your own money over needs no grant. But
          // that also meant a hand-written row with status:'confirmed' was
          // written verbatim, and aggregation keys on the PAYLOAD: the sender's
          // in-hand drops, the named recipient's rises by money they never saw.
          // No notification (already-confirmed rows are skipped) and no audit
          // line. Worst of all, `reconcile`'s Σ inHand === collected − expenses
          // still balances — the money only moved between pockets — so the 🩺
          // desk cannot see it either.
          //
          // The settle path (confirmHandover/rejectHandover) writes these on an
          // EXISTING row, so blanking on insert costs it nothing; SETTLED_ON_UPSERT
          // then protects them from any later re-push.
          if (isNew) {
            if (store === 'handovers') {
              row.from = user.row.name; row.fromId = user.row.username; // never from the payload
              row.status = 'pending';
              row.confirmedBy = ''; row.confirmedAt = ''; row.rejectReason = '';
            }
            if (store === 'corrections') { row.status = 'pending'; row.resolvedBy = ''; row.resolvedAt = ''; }
            // receiptNo is deliberately NOT blanked, though an audit suggested
            // it. A correction re-sends the ORIGINAL serial on purpose
            // (js/app.js `__receipt`) — the donor is already holding that piece
            // of paper, and minting a new number would leave two different
            // serials for one receipt. Breaking a working, deliberate feature to
            // close a speculative hole is the worse trade. The serial is a label,
            // not a permission: nothing keys money on it.
          }
          // one receipt serial, assigned once at first insert — every payment,
          // and daily BUS collections (they get a name+number receipt too).
          if (isNew && !row.receiptNo && (store === 'payments' || (store === 'daily' && row.type === 'bus'))) {
            row.receiptNo = serials[serialAt++];
            receipts[row.id] = row.receiptNo;
          }
          var claimed = String(row.collectorId || '');
          var reassign = user.row.role === 'admin' && claimed && claimed !== user.row.username
            ? findUser_('username', claimed) : null;
          if (reassign) {
            row.collector = reassign.row.name;
            row.collectorId = reassign.row.username;
            row.collectorRole = roleOf_(reassign.row.role, reassign.row.cashier);
            // A116b (pre-go-live review #2): the from/fromId stamped a few
            // lines above took the ADMIN's identity, and this branch fixed only
            // the collector fields — so an admin restoring a collector's backup
            // filed every restored handover as sent BY THE ADMIN. The
            // collector's handedOver dropped to zero and the admin's book
            // showed outgoing money they never touched; personalSummary_ keys
            // on fromId, so both people's in-hand was wrong. Same half-of-a-
            // pair as A73 found in this exact branch.
            if (isNew && store === 'handovers') {
              row.from = reassign.row.name;
              row.fromId = reassign.row.username;
            }
            reassigned[claimed] = (reassigned[claimed] || 0) + 1;
            var values0 = rowForSheet_(head, row, rowAt(row.id));
            if (idRow[row.id]) sh.getRange(idRow[row.id], 1, 1, head.length).setValues([preserve(row.id, values0)]);
            else pending.push(values0);
            savedIds.push(row.id);
            return;
          }
          row.collector = user.row.name;
          row.collectorId = user.row.username; // stable identity
          // roleOf_, NOT the raw Users-sheet role: entry rows speak
          // 'admin'|'cashier'|'collector', while the Users sheet says
          // 'admin'|'user' plus a separate cashier flag. Storing the raw word
          // wrote 'user' on every collector's row, which no separation-of-
          // duties check ever matched — a cashier could neither void such a
          // row nor resolve its correction flag. (Identity still comes from
          // the token only; A9 is untouched.)
          row.collectorRole = roleOf_(user.row.role, user.row.cashier);
          var values = rowForSheet_(head, row, rowAt(row.id));
          if (!isNew) {
            sh.getRange(idRow[row.id], 1, 1, head.length).setValues([preserve(row.id, values)]);
            // tell the retrying phone the serial its lost response carried
            if (carried[row.id] && carried[row.id].receiptNo) receipts[row.id] = carried[row.id].receiptNo;
          }
          else {
            pending.push(values);
            if (store === 'voids') logAudit_(user.row, 'void', row.targetStore + '/' + row.targetId + (row.reason ? ' — ' + row.reason : ''));
          }
          savedIds.push(row.id);
        });
        // one write for every new row in this store
        if (pending.length) {
          sh.getRange(sh.getLastRow() + 1, 1, pending.length, head.length).setValues(pending);
        }
      });
      // an admin filing rows under someone else is unusual enough to record
      Object.keys(reassigned).forEach(function (u2) {
        logAudit_(user.row, 'restore:attribute', reassigned[u2] + ' rows → @' + u2);
      });
      if (savedIds.length) touchData_(); // AFTER the rows, so the stamp is never behind them
      return { ok: true, savedIds: savedIds, receipts: receipts, rejectedIds: rejectedIds,
               heldIds: heldIds, frozen: !!freezeAt,
               reassigned: reassigned };
    } finally { lock.releaseLock(); }
  },

  // raw dump is admin-only now; everyone else goes through per-report access
  dump: function (b) {
    requireAdmin_(b.token);
    return { ok: true, data: readAll_(b.year ? Number(b.year) : null) };
  },

  reportList: function (b) {
    var u = requireUser_(b.token);
    return { ok: true, reports: allowedReports_(u) };
  },

  report: function (b) {
    var u = requireUser_(b.token);
    if (allowedReports_(u).indexOf(b.id) < 0) throw new Error('no-report-access');
    var d = readAll_(b.year ? Number(b.year) : new Date().getFullYear());
    return { ok: true, id: b.id, data: computeReport_(b.id, d) };
  },

  // every logged-in user's own summary — no permission needed (self-scoped)
  myReport: function (b) {
    var u = requireUser_(b.token);
    var d = readAll_(b.year ? Number(b.year) : new Date().getFullYear());
    return { ok: true, data: personalSummary_(d, u.row.username) };
  },

  // cashier's working list: handovers addressed to them (both statuses)
  pendingHandovers: function (b) {
    var u = requireUser_(b.token);
    if (!isCashier_(u.row)) throw new Error('not-cashier');
    var d = activeData_(readAll_(b.year ? Number(b.year) : new Date().getFullYear())); // hide voided (e.g. undone) handovers
    return { ok: true, handovers: d.handovers.filter(function (h) { return isRecipient_(h, u); }) };
  },

  // actionable notification feed: counts + the detail items (who/amount/date).
  // Kept for older clients — new clients get the same payload inside `pull`.
  notifications: function (b) {
    var u = requireUser_(b.token);
    var d = readAll_(b.year ? Number(b.year) : new Date().getFullYear());
    return Object.assign({ ok: true }, notifData_(u, d));
  },

  // pending correction flags a cashier/admin can review
  pendingCorrections: function (b) {
    var u = requireUser_(b.token);
    if (!canReview_(u)) throw new Error('not-cashier');
    var d = readAll_(b.year ? Number(b.year) : new Date().getFullYear());
    return { ok: true, corrections: (d.corrections || []).filter(function (c) { return c.status === 'pending'; }) };
  },
  // approve a flag (→ creates the void) or reject it; enforces the void rule
  resolveCorrection: function (b) {
    var u = requireUser_(b.token);
    if (!canReview_(u)) throw new Error('not-cashier');
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var ss = SpreadsheetApp.getActive();
      var csh = ss.getSheetByName(SHEET_TITLES.corrections), cols = SHEETS.corrections;
      if (!csh || csh.getLastRow() < 2) throw new Error('not-found');
      var values = csh.getDataRange().getValues();
      // A81: read through the SHEET's header, not through `cols`. The write
      // below was fixed first and the read was left — which is this project's
      // oldest bug wearing a new hat: a rule applied to one half of a pair.
      var chead = values[0].map(String);
      for (var i = 1; i < values.length; i++) {
        if (String(values[i][chead.indexOf('id')]) === String(b.id)) {
          var corr = {}; chead.forEach(function (c, j) { corr[c] = values[i][j]; });
          if (corr.status !== 'pending') throw new Error('already-resolved');
          // a cashier may only resolve a regular collector's entry; admin any
          if (u.row.role !== 'admin' && targetCollectorRole_(corr.targetStore, corr.targetId) !== 'collector') {
            throw new Error('not-allowed');
          }
          // A81: by name, for the same reason as setAnomalyFlag — this sheet has
          // no ghost column today, and that is not a thing to rely on.
          csh.getRange(i + 1, ensureCol_(csh, 'status')).setValue(b.decision === 'approve' ? 'approved' : 'rejected');
          csh.getRange(i + 1, ensureCol_(csh, 'resolvedBy')).setValue(u.row.name);
          csh.getRange(i + 1, ensureCol_(csh, 'resolvedAt')).setValue(new Date().toISOString());
          csh.getRange(i + 1, ensureCol_(csh, 'receivedAt')).setValue(new Date().toISOString()); // carry in delta pull
          if (b.decision === 'approve') {
            // A116c (pre-go-live review #3): voidAllowed_ refuses voiding a
            // donor who has payments — "by anybody, admin included" — because
            // the void orphans every payment pointing at that row and the 🩺
            // desk raises payment_orphan for each of them for the rest of the
            // season. This desk wrote the void DIRECTLY and skipped that rule:
            // one approve tap re-opened the exact hole A60 closed on the push
            // door. Same check, at this door too.
            if (String(corr.targetStore) === 'parties' && partyHasMoney_(corr.targetId)) {
              throw new Error('party-has-money');
            }
            var vsh = ss.getSheetByName(SHEET_TITLES.voids), vcols = SHEETS.voids;
            var v = { id: Utilities.getUuid(), year: corr.year, targetStore: corr.targetStore, targetId: corr.targetId,
                      reason: corr.reason, collector: u.row.name, collectorId: u.row.username,
                      createdAt: new Date().toISOString(), receivedAt: new Date().toISOString() };
            // A81: appendRow writes from column 1 by position, so it needs the
            // sheet's header for the same reason everything else does.
            ensureCols_(vsh, vcols);
            vsh.appendRow(rowForSheet_(sheetHeader_(vsh), v, null));
          }
          logAudit_(u.row, b.decision === 'approve' ? 'correction:approve' : 'correction:reject',
            corr.targetStore + '/' + corr.targetId + (corr.reason ? ' — ' + corr.reason : ''));
          touchData_(); // a resolved flag (and its void row) must reach every device
          return { ok: true };
        }
      }
      throw new Error('not-found');
    } finally { lock.releaseLock(); }
  },

  // pull-down sync: the client renders every screen from a local snapshot, no
  // per-screen round-trips. Any approved user (committee-transparent).
  //   - no `since`  → full snapshot (first login / cache miss).
  //   - with `since` → only rows whose receivedAt is newer than the client's
  //     cursor (a delta). Idle polls return an empty delta (~nothing), so 60s
  //     polling stays cheap even at peak-season row counts.
  // `cursor` is epoch-ms of the newest receivedAt so it compares correctly
  // whether the Sheet stored receivedAt as an ISO string or a Date cell.
  pull: function (b) {
    var u = requireUser_(b.token);
    // FAST PATH. A delta pull whose cursor is already at or past the last write
    // needs no sheet read at all — and that is what almost every poll is. Note
    // `me` and `config` still ride along, so a permission change still reaches
    // a device within one poll; only the (unchanged) row data is skipped.
    if (b.since != null && b.since !== '') {
      // ONE config read serves both the stamp and the config payload — reading
      // it twice on the hot path is exactly the kind of waste this fast path
      // exists to remove.
      var cfg = readConfig_();
      var ts = Number(cfg.data_ts) || 0;
      if (ts && Number(b.since) >= ts) {
        var pub = {};
        Object.keys(cfg).forEach(function (k) { if (k.indexOf('receiptSeq_') !== 0) pub[k] = cfg[k]; });
        // A115: the roster rides the IDLE path too, and it has to.
        //
        // Measured on a real screen, not caught by any test: an admin changes
        // somebody's post, nothing in the eight transactional sheets moves, so
        // `data_ts` never advances and every phone stays on this fast path for
        // ever. The post change would reach nobody until a full pull — on a
        // screen whose entire purpose is that one person's post has one value.
        //
        // The alternative was to make every action that touches a Users row
        // remember to bump `data_ts` — setUserPosition, setStatus, setCashier,
        // setEntries — which is a rule stated in four places and guarded in
        // three by next month. Twelve short rows off a sheet already read by
        // requireUser_ is the cheaper promise to keep. The fast path still
        // skips what it was built to skip: the thousands of ledger rows.
        return { ok: true, mode: 'delta', data: {}, cursor: String(b.since),
                 config: pub, me: publicUser_(u.row), notif: null, idle: true,
                 committee: committeeRoster_() };
      }
    }
    // A50 (audit 0.3): read the watermark BEFORE the rows.
    //
    // The old order sampled the rows first and the stamp second, and pull takes
    // no lock — correct for a read, but it means a push can commit between the
    // two. Then: A stamps receivedAt = T_r and setValues; A bumps data_ts = T_s;
    // this reader, still walking the sheets, misses A's rows but returns the
    // NEW stamp as the cursor. Every one of those rows is now < the client's
    // `since` and is never delivered again — not tomorrow, not all season, only
    // a full pull recovers. confirmHandover/rejectHandover bump receivedAt in
    // place so the status change rides the delta, so the loss is a parcel that
    // reads pending on one phone and confirmed on the other, about the same cash.
    //
    // Reading the stamp first inverts the risk: data_ts is written after the
    // rows INSIDE the push lock, so everything committed at t0 has
    // receivedAt <= stamp. Rows that land while readAll_ is still walking may be
    // returned twice — once now, once on the next delta — and that is free,
    // because mergeDelta upserts by id. Re-delivery is cheap; loss is not.
    var stamp = dataTs_();
    var all = readAll_(b.year ? Number(b.year) : new Date().getFullYear());
    var cursor = stamp || maxReceivedAt_(all);
    var me = publicUser_(u.row); // fresh user → permission changes reach devices without re-login
    var notif = notifData_(u, all); // ride the notification feed in the same call (halves polling)
    if (b.since != null && b.since !== '') {
      var since = Number(b.since) || 0;
      var delta = {};
      Object.keys(all).forEach(function (store) {
        // >= not >: receivedAt is written just before data_ts, so a row can
        // share the stamp's millisecond. Strict > drops exactly that row for
        // ever; >= re-sends a handful of boundary rows the client upserts by id.
        delta[store] = (all[store] || []).filter(function (r) { return toEpoch_(r.receivedAt) >= since; });
      });
      // A115: the roster rides BOTH modes. It is a dozen short rows, and a
      // delta that left it out would let a post change go unseen on every phone
      // until the next full pull — which is the shape of bug this whole change
      // exists to remove.
      return { ok: true, mode: 'delta', data: delta, cursor: cursor, config: publicConfig_(),
               me: me, notif: notif, committee: committeeRoster_() };
    }
    return { ok: true, mode: 'full', data: all, cursor: cursor, config: publicConfig_(),
             me: me, notif: notif, committee: committeeRoster_() };
  },

  // receipt-design config — any approved user reads it (needed to render a
  // receipt); only admin writes. Counter keys (receiptSeq_*) are never returned.
  getConfig: function (b) {
    requireUser_(b.token);
    return { ok: true, config: publicConfig_() };
  },
  setConfig: function (b) {
    var me = requireAdmin_(b.token);
    // Whitelisted keys only — a config write must never be able to reach
    // live_mode, data_epoch, data_ts or a receiptSeq_ counter.
    var allow = { receipt_layout: 1, puja_name: 1, committee_name: 1, receipt_footer: 1,
                  receipt_color: 1, committee_logo: 1, receipt_digits: 1,
                  chat_off: 1, // the chat kill switch — was missing, so the button did nothing
                  // A79: this season's target, in rupees. '' or 0 = no target,
                  // and the bar simply does not appear — a committee that has
                  // not agreed a number must not be shown one.
                  target_amount: 1 };
    // accept BOTH shapes: the receipt screen sends a whole {config:{…}} form,
    // the chat switch sends one {key,value}. Taking only the first made the
    // switch a no-op that still answered ok — the worst kind of failure.
    var patch = b.config || {};
    if (b.key) { patch = {}; patch[String(b.key)] = b.value == null ? '' : b.value; }
    if (!Object.keys(patch).length) throw new Error('nothing-to-set');
    var applied = Object.keys(patch).filter(function (k) { return allow[k]; });
    if (!applied.length) throw new Error('unknown-config-key');
    applied.forEach(function (k) { setConfig_(k, String(patch[k] == null ? '' : patch[k])); });
    logAudit_(me.row, 'config', applied.join(','));
    return { ok: true, applied: applied };
  },

  // Go live: discard all training entries, keep the essentials (users, config,
  // master lists), reset the serial counters, stamp live_mode + a new data
  // epoch so every device wipes its local training cache on the next pull.
  // Destructive + one-way → the client gates it behind a typed confirmation.
  // Wipe the practice data and carry on practising. Same clearing as goLive —
  // every transactional sheet, and the serial counters so numbering restarts —
  // but it does NOT set live_mode, so it can be run again tomorrow.
  //
  // REFUSED once live. After go-live this button would be "delete the whole
  // year's takings", and no amount of confirming makes that a thing a phone
  // screen should offer.
  clearTraining: function (b) {
    var me = requireAdmin_(b.token);
    if (String(readConfig_().live_mode || '') === 'on') throw new Error('already-live');
    if (String(b.confirm) !== 'CLEAR') throw new Error('confirm-required');
    // mandatory snapshot, same reasoning as goLive: losing practice data is
    // survivable, losing it with no copy is not
    var backupFile;
    try { backupFile = dailyBackup(); }
    catch (e) { throw new Error('backup-failed: ' + (e && e.message || e)); }
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      // A116f (pre-go-live review #7): the live_mode check at the top ran
      // BEFORE the mandatory Drive backup, which is the slow step — slow enough
      // that an admin re-fires the button, or fires goLive while this backup
      // runs. A check that ran before the backup proves nothing afterwards, so
      // it is re-read where it cannot be raced: inside the lock.
      if (String(readConfig_().live_mode || '') === 'on') throw new Error('already-live');
      var ss = SpreadsheetApp.getActive();
      // ESSENTIALS ARE UNTOUCHED: Users, Config, Lists (areas/locations),
      // ExpenseSubjects and Audit are not in SHEETS — only the transactional
      // stores are, so approvals, permissions and master data all survive.
      Object.keys(SHEETS).forEach(function (store) {
        var sh = ss.getSheetByName(SHEET_TITLES[store]);
        if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
      });
      var csh = configSheet_();
      if (csh.getLastRow() > 1) {
        var vals = csh.getRange(2, 1, csh.getLastRow() - 1, 1).getValues();
        for (var i = vals.length - 1; i >= 0; i--) {
          if (String(vals[i][0]).indexOf('receiptSeq_') === 0) csh.deleteRow(i + 2);
        }
      }
      // every device clears its local copy on the next pull, or phones would
      // keep showing practice rows the sheet no longer has
      var snaps = clearExitSnaps_(); // A78c: practice money, in a sheet the wipe spares
      setConfig_('data_epoch', String(Date.now()));
      touchData_(); // the sheets are now empty — no device may fast-path past that
      logAudit_(me.row, 'training:clear', 'practice data cleared; exit pictures=' + snaps + '; backup=' + backupFile);
      return { ok: true, backup: backupFile };
    } finally { lock.releaseLock(); }
  },

  goLive: function (b) {
    var me = requireAdmin_(b.token);
    // A52 (audit 0.1): the two guards clearTraining — the STRICTLY LESS
    // destructive action — has had all along, and this one did not.
    //
    // Without the live_mode check goLive stays callable AFTER go-live, at which
    // point it is a "delete the whole season's takings" button: one POST with a
    // valid admin token empties eight transactional sheets, resets the receipt
    // counters and force-wipes every phone via the data_epoch bump. The comment
    // below used to say "the client gates it behind a typed confirmation" — the
    // admin does type LIVE (js/app.js), and the string was simply thrown away
    // instead of being sent. A confirmation that never leaves the phone is not
    // a confirmation.
    if (String(readConfig_().live_mode || '') === 'on') throw new Error('already-live');
    if (String(b.confirm) !== 'LIVE') throw new Error('confirm-required');
    var digits = Math.min(9, Math.max(4, Number(b.digits) || 6)); // locked in at go-live
    // The safety snapshot is MANDATORY, not best-effort: goLive is one-way and
    // wipes every transactional sheet. If the backup can't be written (Drive
    // permission, quota…) we must NOT proceed — losing training data is
    // survivable, losing it with no snapshot and no undo is not.
    var backupFile;
    try { backupFile = dailyBackup(); }
    catch (e) { throw new Error('backup-failed: ' + (e && e.message || e)); }
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    try {
      // A116f (pre-go-live review #7): re-read INSIDE the lock. The check at
      // the top ran before the mandatory Drive backup — the slow step, slow
      // enough for an admin to re-fire the button. Request 1 wipes and sets
      // live_mode; request 2, which passed minutes ago, then takes the lock
      // and wipes AGAIN, destroying the first live payments — which the phones
      // have already marked synced and will never re-push.
      if (String(readConfig_().live_mode || '') === 'on') throw new Error('already-live');
      var ss = SpreadsheetApp.getActive();
      Object.keys(SHEETS).forEach(function (store) { // clear every transactional sheet (keep header)
        var sh = ss.getSheetByName(SHEET_TITLES[store]);
        if (sh && sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
      });
      var csh = configSheet_(); // drop the serial counters so live starts at 000001
      if (csh.getLastRow() > 1) {
        var vals = csh.getRange(2, 1, csh.getLastRow() - 1, 1).getValues();
        for (var i = vals.length - 1; i >= 0; i--) {
          if (String(vals[i][0]).indexOf('receiptSeq_') === 0) csh.deleteRow(i + 2);
        }
      }
      var snaps = clearExitSnaps_(); // A78c: same reasoning as the serial counters above
      var stripped = clearBlockedGrants_(); // A109: a shut-out account enters live with nothing
      setConfig_('receipt_digits', digits);
      setConfig_('live_mode', 'on');
      setConfig_('data_epoch', String(Date.now()));
      touchData_(); // the sheets are now empty — no device may fast-path past that
      logAudit_(me.row, 'went-live', 'training data cleared; exit pictures=' + snaps +
        '; blocked accounts stripped=' + stripped +
        '; digits=' + digits + '; backup=' + backupFile);
      return { ok: true, backup: backupFile };
    } finally { lock.releaseLock(); }
  },

  // A110: the emergency freeze. Hrishi: "temporary blocking — no users will do
  // money entry related things … after revoking the temporary block everything
  // will be as same as it was."
  //
  // ONE config key, not twelve blocked rows. Mass-blocking would have to
  // remember who was approved, who pending, who বিদায়ী, and put each back —
  // and a restore that depends on remembering is a restore that fails on the
  // night it is needed. Nothing per-user is written here, so "as it was" is not
  // a promise to keep; it is the absence of any change to undo.
  //
  // The value is the MOMENT, not a flag. A collector who was offline when it
  // was thrown keeps everything they had already written — those rows are money
  // that physically exists and refusing them would leave cash with no record —
  // and only what they type AFTER it waits. That comparison needs a timestamp.
  setFreeze: function (b) {
    var me = requireAdmin_(b.token);
    var on = String(b.on) === '1';
    // turning it ON is the dangerous direction, so that is the one that must be
    // typed. Lifting it needs no ceremony — the safe direction never should.
    if (on && String(b.confirm) !== 'FREEZE') throw new Error('confirm-required');
    var at = on ? new Date().toISOString() : '';
    setConfig_('freeze_at', at);
    touchData_(); // every phone learns on its next poll, not its next entry
    logAudit_(me.row, on ? 'freeze:on' : 'freeze:off', at || '-');
    return { ok: true, freezeAt: at };
  },

  // ---------- backup / restore (admin) ----------
  // On-demand snapshot — the cheap insurance to take right before Go Live.
  backupNow: function (b) {
    var me = requireAdmin_(b.token);
    var name = dailyBackup();
    logAudit_(me.row, 'backup', name);
    return { ok: true, file: name, trigger: ensureBackupTrigger_() };
  },
  // What snapshots exist, newest first.
  listBackups: function (b) {
    requireAdmin_(b.token);
    var it = backupFolder_().getFiles(), out = [];
    while (it.hasNext()) {
      var f = it.next();
      // the folder also holds the live spreadsheet (and whatever else Hrishi
      // keeps there) — only our own snapshots may ever be offered for restore
      if (f.getName().indexOf(BACKUP_PREFIX) !== 0) continue;
      out.push({ id: f.getId(), name: f.getName(), size: f.getSize(),
                 created: f.getDateCreated().toISOString() });
    }
    out.sort(function (a, c) { return String(c.created).localeCompare(String(a.created)); });
    return { ok: true, backups: out.slice(0, 30) };
  },
  // Restore a snapshot back into the sheets. DESTRUCTIVE: replaces the whole
  // contents of every sheet present in the backup. Guarded three ways —
  // admin token, an explicit file id, and a typed confirm string — and it
  // takes a fresh backup of the CURRENT state first, so a restore is itself
  // undoable. This is the recovery path that was missing entirely.
  restoreBackup: function (b) {
    var me = requireAdmin_(b.token);
    if (String(b.confirm) !== 'RESTORE') throw new Error('confirm-required');
    var file = DriveApp.getFileById(String(b.fileId)); // throws if not found
    // only our own snapshots — never the live spreadsheet that shares the folder
    if (file.getName().indexOf(BACKUP_PREFIX) !== 0) throw new Error('not-a-backup');
    var data = JSON.parse(file.getBlob().getDataAsString());
    var safety = dailyBackup(); // current state first — restore is reversible
    var ss = SpreadsheetApp.getActive();
    var lock = LockService.getScriptLock(); lock.waitLock(30000);
    var restored = [];
    try {
      // A52: resolve and check EVERY key before the first clear(). A throw
      // halfway used to leave the book half old and half new, with data_epoch
      // never bumped, so no phone was ever told. Validate first, then destroy.
      var titles = {};
      // A73 (audit #5 V1): ExpenseSubjects was missing, and dailyBackup has
      // ALWAYS written it — so the pre-validation I added in A52 refused every
      // backup this code produces. goLive's only undo went from
      // working-but-wrong to not working at all, and my A52 test stayed green
      // throughout because it matched the TEXT of the guard ("every key is
      // resolved before the first clear") and never once ran a restore.
      //
      // The list is now derived from what dailyBackup actually writes, not
      // typed out beside it — two hand-maintained lists of the same thing is
      // how this happened.
      var known = {};
      BACKUP_EXTRA_SHEETS.forEach(function (n) { known[n] = 1; });
      known.Users = 1;
      // backups written before this fix carry the lowercase key — they are the
      // ones most likely to be needed, so they must still restore
      var legacy = { users: 'Users' };
      Object.keys(data).forEach(function (key) {
        if (key === 'Audit' || key === 'audit') return; // append-only means append-only
        var t = SHEET_TITLES[key] || legacy[key] || key;
        if (!SHEET_TITLES[key] && !known[t]) throw new Error('unknown-sheet: ' + key);
        titles[key] = t;
      });
      Object.keys(data).forEach(function (key) {
        if (!titles[key]) return;
        var title = titles[key];
        var rows = data[key];
        if (!rows || !rows.length) return;
        var sh = ss.getSheetByName(title) || ss.insertSheet(title);
        sh.clear();
        sh.getRange(1, 1, rows.length, rows[0].length).setValues(rows);
        sh.setFrozenRows(1);
        restored.push(title + ':' + (rows.length - 1));
      });
      // every device must drop its cached snapshot and re-pull the restored data
      setConfig_('data_epoch', String(Date.now()));
      touchData_();
      logAudit_(me.row, 'restore', file.getName() + ' → [' + restored.join(', ') + '] (safety: ' + safety + ')');
      return { ok: true, restored: restored, safetyBackup: safety };
    } finally { lock.releaseLock(); }
  },

  // A68 (audit #2 U1): stamp a "this is fine" answer on a row THIS DEVICE DOES
  // NOT OWN.
  //
  // The 🩺 desk is cashier/admin-only, so the rows on it are overwhelmingly
  // other collectors'. The client used to answer them through the local queue —
  // DB.get, set the flag, push — and that is wrong twice over:
  //   · DB is this device's IndexedDB, so the row simply was not there and the
  //     tap did nothing at all, silently (the bug this fixes)
  //   · and if it HAD been there, push re-stamps collector/collectorId from the
  //     token and only the admin branch carries the original forward. A cashier
  //     answering Ratan's duplicate would have moved Ratan's ₹500 into their own
  //     in-hand. Proven against the shim before writing this — the "obvious"
  //     client-side fix was a money bug.
  //
  // So: a narrow action that writes ONE cell and nothing else. Identity, amount
  // and every other column are untouched by construction.
  setAnomalyFlag: function (b) {
    var u = requireUser_(b.token);
    // isCashier_, NOT canReview_. The 🩺 screen and its home tile are gated on
    // isCashier alone (js/aggregate.js homeTiles, js/app.js renderAnomalies);
    // canReview_ additionally demands the 'review' grant, which belongs to the
    // correction desk. Using it here would hand a cashier a screenful of
    // buttons that every one of them answers with 'not-cashier' — the exact
    // failure this whole change is about. The guard has to agree with the door
    // the user came through.
    if (!isCashier_(u.row)) throw new Error('not-cashier');
    var store = String(b.store || ''), field = String(b.field || '');
    // a fixed table, not a caller-supplied column name: this action must never
    // become a way to set an arbitrary cell on an arbitrary row
    if (!ANOMALY_FLAGS[store] || ANOMALY_FLAGS[store].indexOf(field) < 0) throw new Error('bad-input');
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES[store]);
    var cols = SHEETS[store];
    if (!sh || sh.getLastRow() < 2) throw new Error('not-found');
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      ensureCols_(sh, cols);
      var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
      for (var i = 0; i < ids.length; i++) {
        if (String(ids[i][0]) !== String(b.id)) continue;
        var r = i + 2;
        // A81: ensureCol_ resolves by NAME against the live header. cols.indexOf
        // was one cell out on any sheet carrying a column this file no longer
        // lists, which is how the pledgeOk answer went into memberType.
        sh.getRange(r, ensureCol_(sh, field)).setValue(1);
        // bump receivedAt or the delta pull never carries the answer and every
        // other phone keeps raising it — the A59 lesson, one release on
        sh.getRange(r, ensureCol_(sh, 'receivedAt')).setValue(new Date().toISOString());
        touchData_();
        logAudit_(u.row, 'anomaly:' + field, store + '/' + b.id);
        return { ok: true };
      }
      throw new Error('not-found');
    } finally { lock.releaseLock(); }
  },

  // admin-only activity log, newest first (accountability view)
  auditLog: function (b) {
    requireAdmin_(b.token);
    var sh = SpreadsheetApp.getActive().getSheetByName('Audit');
    var out = [];
    if (sh && sh.getLastRow() > 1) {
      var vals = sh.getDataRange().getValues(), h = vals[0], lim = Number(b.limit) || 150;
      for (var i = vals.length - 1; i >= 1 && out.length < lim; i--) {
        var o = {}; h.forEach(function (c, j) { o[c] = vals[i][j]; }); out.push(o);
      }
    }
    return { ok: true, log: out };
  },

  // approved cashiers (any logged-in user may ask — needed for handover)
  cashiers: function (b) {
    requireUser_(b.token);
    var sh = usersSheet_();
    var names = [];
    if (sh.getLastRow() > 1) {
      sh.getDataRange().getValues().slice(1).forEach(function (v) {
        var row = {};
        USER_COLS.forEach(function (c, j) { row[c] = v[j]; });
        if (row.status === 'approved' && isCashier_(row)) {
          // role: the no-permission card needs to find the admin in this list.
          // phone: Hrishi's call — the admin's number is exactly what a locked-
          // out collector needs, and only admins' numbers are exposed.
          names.push({ username: row.username, name: row.name, role: row.role,
                       phone: row.role === 'admin' ? String(row.phone || '') : '' });
        }
      });
    }
    return { ok: true, cashiers: names };
  },

  // cashier (or admin) confirms receiving a handover addressed to them
  confirmHandover: function (b) {
    var u = requireUser_(b.token);
    if (!isCashier_(u.row)) throw new Error('not-cashier');
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.handovers);
    var cols = SHEETS.handovers;
    if (sh.getLastRow() < 2) throw new Error('not-found');
    // A59 (audit 2.5): this whole block was an unlocked read-check-write, and
    // the write was four separate setValue calls. Two failures, both about
    // money already handed over:
    //   • confirm and reject racing — each reads status 'pending', each passes
    //     its own guard, and the four writes interleave into a row that says
    //     confirmed WITH a rejectReason. Nothing downstream can read that.
    //   • a timeout between write 1 and write 4 — status flipped, receivedAt
    //     still old, so the delta pull never carries it and NO phone ever
    //     learns. The money is settled on the sheet and outstanding everywhere
    //     else, and the collector's ceiling stays wrong until someone notices.
    // The lock closes the race; writing the row in ONE setValues closes the
    // torn-write window, because now there is no window.
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
    ensureCols_(sh, cols); // write-by-position needs the header to match cols
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(b.id)) {
        var r = i + 2;
        var hv = sh.getRange(r, 1, 1, cols.length).getValues()[0];
        var rowObj = {};
        cols.forEach(function (c, ci) { rowObj[c] = hv[ci]; });
        // Being A cashier is not enough — confirming moves money in TWO people's
        // books, so it must be the person the money was actually sent to.
        // Without this, cashier A could confirm a parcel addressed to cashier B:
        // B's in-hand would rise for money they never touched, the collector's
        // would fall, and the audit would name A as the receiver. The UI never
        // offers it (pendingHandovers filters by the same rule) — this closes the
        // direct-call path.
        var mine = isRecipient_(rowObj, u);
        if (!mine && u.row.role !== 'admin') throw new Error('not-recipient');
        // Already settled: re-confirming would restamp confirmedBy/confirmedAt
        // and hide who really acknowledged it.
        //
        // A71: BOTH settled states, not just 'confirmed'. rejectHandover has
        // guarded both since it was written; this one guarded only one, and the
        // asymmetry is a money bug, found by driving the live server rather than
        // by reading either file:
        //   reject → confirm was ALLOWED, and left status='confirmed' sitting
        //   next to the rejectReason that says it never arrived.
        // That is the exact torn row A59's lock and single-write were meant to
        // make impossible — a lock cannot help when the code deliberately lets
        // the second write through. Worse in money terms: the sender has already
        // been told "টাকা তোমার হিসাবেই আছে — কখনও বাদ যায়নি", and then it
        // silently moves anyway, with the notice still saying it did not.
        //
        // My own A59 test asserted confirm-then-reject and never tried the
        // reverse, so it passed throughout.
        if (String(rowObj.status) === 'confirmed') throw new Error('already-confirmed');
        if (String(rowObj.status) === 'rejected') throw new Error('already-rejected');
        var nowIso = new Date().toISOString();
        rowObj.status = 'confirmed';
        rowObj.confirmedBy = u.row.name;
        rowObj.confirmedAt = nowIso;
        // bump receivedAt so the delta pull carries this in-place status change
        rowObj.receivedAt = nowIso;
        sh.getRange(r, 1, 1, cols.length).setValues([safeRow_(cols, rowObj)]);
        touchData_(); // confirming moves money between two people's books
        var bdCol = cols.indexOf('breakdown');
        // An admin acknowledging on someone else's behalf is a deliberate escape
        // hatch (a cashier's phone dies mid-puja) but it is NOT the same act, so
        // it gets its own audit verb naming the intended recipient.
        logAudit_(u.row, mine ? 'handover:confirm' : 'handover:confirm-on-behalf',
          '₹' + hv[cols.indexOf('amount')] + ' from ' + hv[cols.indexOf('from')] +
          (mine ? '' : ' → ' + (rowObj.to || rowObj.toId)) +
          ' (cash ' + hv[cols.indexOf('cashAmount')] + ' / upi ' + hv[cols.indexOf('upiAmount')] + ')' +
          (bdCol >= 0 && hv[bdCol] ? ' ' + hv[bdCol] : ''));
        return { ok: true };
      }
    }
    throw new Error('not-found');
    } finally { lock.releaseLock(); }
  },

  // "পাইনি" — the other half of confirmHandover, and the reason the ❌ slot in
  // আমার হিসাব could never fill before this.
  //
  // A rejection is NOT a void: the parcel really was claimed, and both people
  // need the record of the claim and of the refusal. It simply stops being in
  // transit, so the sender's handover ceiling grows back by that amount while
  // their in-hand figure never moved (it never came off — see mySummary).
  //
  // A reason is REQUIRED. "পাইনি" with no explanation is an accusation the
  // sender cannot act on; with one ("খামে ২৫০ ছিল না, ২০০ ছিল") it is
  // information, and they know whether to re-send or to talk.
  rejectHandover: function (b) {
    var u = requireUser_(b.token);
    if (!isCashier_(u.row)) throw new Error('not-cashier');
    var reason = String(b.reason || '').trim().slice(0, 200);
    if (!reason) throw new Error('reason-required');
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.handovers);
    var cols = SHEETS.handovers;
    if (sh.getLastRow() < 2) throw new Error('not-found');
    // A59 (audit 2.5): same lock and same single-write as confirmHandover — the
    // race that matters is precisely confirm-vs-reject on one row.
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
    // Heal the header BEFORE reading the row, so rejectReason has a real column
    // to land in. Written into an unlabelled column it would be invisible to
    // readAll_, which maps by the header — the status would flip and the
    // explanation would silently disappear.
    ensureCols_(sh, cols);
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) !== String(b.id)) continue;
      var r = i + 2;
      var hv = sh.getRange(r, 1, 1, cols.length).getValues()[0];
      var rowObj = {};
      cols.forEach(function (c, ci) { rowObj[c] = hv[ci]; });
      // same gate as confirming, and for the same reason: refusing money moves
      // both books too, so only the person it was sent to may do it.
      var mine = isRecipient_(rowObj, u);
      if (!mine && u.row.role !== 'admin') throw new Error('not-recipient');
      if (String(rowObj.status) === 'confirmed') throw new Error('already-confirmed');
      if (String(rowObj.status) === 'rejected') throw new Error('already-rejected');
      var nowIso = new Date().toISOString();
      rowObj.status = 'rejected';
      // confirmedBy/At double as "who answered, and when" — the status says what
      // the answer was, so a rejection needs no extra pair of columns.
      rowObj.confirmedBy = u.row.name;
      rowObj.confirmedAt = nowIso;
      rowObj.rejectReason = reason;
      // bump receivedAt so the delta pull carries this in-place status change
      rowObj.receivedAt = nowIso;
      sh.getRange(r, 1, 1, cols.length).setValues([safeRow_(cols, rowObj)]);
      touchData_(); // the sender's handover ceiling changes the moment this lands
      logAudit_(u.row, mine ? 'handover:reject' : 'handover:reject-on-behalf',
        '₹' + hv[cols.indexOf('amount')] + ' from ' + hv[cols.indexOf('from')] +
        (mine ? '' : ' → ' + (rowObj.to || rowObj.toId)) + ' — ' + reason);
      return { ok: true };
    }
    throw new Error('not-found');
    } finally { lock.releaseLock(); }
  },

  // ---------- expense subjects ----------
  listSubjects: function (b) {
    requireUser_(b.token); // cashier needs the list to record an expense
    var sh = SpreadsheetApp.getActive().getSheetByName('ExpenseSubjects');
    var out = [];
    if (sh && sh.getLastRow() > 1) {
      sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
        out.push({ id: String(r[0]), name: String(r[1]) });
      });
    }
    return { ok: true, subjects: out };
  },
  addSubject: function (b) {
    var me = requireAdmin_(b.token);
    var name = String(b.name || '').trim();
    if (!name) throw new Error('bad-input');
    var sh = SpreadsheetApp.getActive().getSheetByName('ExpenseSubjects');
    if (sh.getLastRow() > 1) {
      var exists = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().some(function (r) {
        return String(r[0]).toLowerCase() === name.toLowerCase();
      });
      if (exists) throw new Error('subject-exists');
    }
    sh.appendRow([Utilities.getUuid(), safeCell_(name), new Date().toISOString()]);
    logAudit_(me.row, 'subject:add', name);
    return { ok: true };
  },
  editSubject: function (b) {
    var me = requireAdmin_(b.token);
    var name = String(b.name || '').trim();
    if (!name) throw new Error('bad-input');
    var sh = SpreadsheetApp.getActive().getSheetByName('ExpenseSubjects');
    if (sh.getLastRow() < 2) throw new Error('not-found');
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(b.id)) { sh.getRange(i + 2, 2).setValue(name); logAudit_(me.row, 'subject:edit', name); return { ok: true }; }
    }
    throw new Error('not-found');
  },
  removeSubject: function (b) {
    var me = requireAdmin_(b.token);
    var sh = SpreadsheetApp.getActive().getSheetByName('ExpenseSubjects');
    if (sh.getLastRow() < 2) return { ok: true };
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(b.id)) { sh.deleteRow(i + 2); logAudit_(me.row, 'subject:remove', b.id); break; }
    }
    return { ok: true };
  },

  // ---------- master lists (areas, person locations, committee posts) ----------
  listItems: function (b) {
    requireUser_(b.token);
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    var out = [];
    if (sh) {
      // Heal + seed here, not only in setup(): a book created before posts
      // existed would otherwise show the client's four seeded positions while
      // the sheet held none, and every edit would answer 'not-found'.
      ensureListCols_(sh); // cheap no-op once healed; locks only when it writes
    }
    if (sh && sh.getLastRow() > 1) {
      var mx = ensureCol_(sh, 'maxCount'), pc = ensureCol_(sh, 'perms'), lv = ensureCol_(sh, 'level');
      var wide = Math.max(5, mx, pc, lv);
      sh.getRange(2, 1, sh.getLastRow() - 1, wide).getValues().forEach(function (r) {
        if (!b.kind || String(r[1]) === b.kind) {
          out.push({ id: String(r[0]), kind: String(r[1]), nameBn: String(r[2]), nameEn: String(r[3]),
                     order: Number(r[4]) || 0,
                     // 0 / blank = as many as you like. Only a positive number caps.
                     maxCount: Number(r[mx - 1]) || 0, perms: String(r[pc - 1] || ''),
                     // A115: 0 / blank = "no rank set", which hands out nothing.
                     level: Number(r[lv - 1]) || 0 });
        }
      });
      out.sort(function (a, c) { return a.order - c.order; });
    }
    return { ok: true, items: out };
  },
  // A committee post's cap and permission set. Admin only, and the key list is
  // filtered SERVER-side — the UI hiding 'admin' is a courtesy, this is the
  // boundary. Every change is audited because a post can carry 'cashier'.
  setPositionRules: function (b) {
    var me = requireAdmin_(b.token);
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    if (!sh || sh.getLastRow() < 2) throw new Error('not-found');
    ensureListCols_(sh);
    var mx = ensureCol_(sh, 'maxCount'), pc = ensureCol_(sh, 'perms'), lv = ensureCol_(sh, 'level');
    var rows = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
    for (var i = 0; i < rows.length; i++) {
      if (String(rows[i][0]) !== String(b.id)) continue;
      if (String(rows[i][1]) !== 'position') throw new Error('not-a-position');
      if (b.maxCount !== undefined) sh.getRange(i + 2, mx).setValue(Math.max(0, Number(b.maxCount) || 0));
      // A115: the rank. Several posts may share one — the committee has two
      // joint secretaries and they are peers — so nothing here checks for
      // uniqueness. What it DOES mean is that neither of them can appoint the
      // other: canAssignPosition_ demands STRICTLY lower, both ways.
      if (b.level !== undefined) {
        sh.getRange(i + 2, lv).setValue(Math.max(0, Number(b.level) || 0));
        logAudit_(me.row, 'position:level', b.id + ' → ' + (Number(b.level) || 0));
      }
      if (b.perms !== undefined) {
        var keep = (b.perms || []).filter(function (k) { return POSITION_PERM_KEYS.indexOf(k) >= 0; });
        sh.getRange(i + 2, pc).setValue(keep.join(','));
        logAudit_(me.row, 'position:perms', b.id + ' → [' + keep.join(',') + ']');
      }
      if (b.maxCount !== undefined) logAudit_(me.row, 'position:max', b.id + ' → ' + (Number(b.maxCount) || 0));
      return { ok: true };
    }
    throw new Error('not-found');
  },
  addItem: function (b) {
    var me = requireAdmin_(b.token);
    var kind = String(b.kind || '').trim(), bn = String(b.nameBn || '').trim(), en = String(b.nameEn || '').trim();
    if (LIST_KINDS.indexOf(kind) < 0 || (!bn && !en)) throw new Error('bad-input');
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    sh.appendRow([Utilities.getUuid(), kind, safeCell_(bn || en), safeCell_(en || bn), sh.getLastRow(), new Date().toISOString()]);
    logAudit_(me.row, kind + ':add', bn || en);
    return { ok: true };
  },
  editItem: function (b) {
    var me = requireAdmin_(b.token);
    var bn = String(b.nameBn || '').trim(), en = String(b.nameEn || '').trim();
    if (!bn && !en) throw new Error('bad-input');
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    if (sh.getLastRow() < 2) throw new Error('not-found');
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(b.id)) {
        sh.getRange(i + 2, 3).setValue(bn || en);
        sh.getRange(i + 2, 4).setValue(en || bn);
        logAudit_(me.row, 'item:edit', bn || en);
        return { ok: true };
      }
    }
    throw new Error('not-found');
  },
  removeItem: function (b) {
    var me = requireAdmin_(b.token);
    var sh = SpreadsheetApp.getActive().getSheetByName('Lists');
    if (sh.getLastRow() < 2) return { ok: true };
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(b.id)) { sh.deleteRow(i + 2); logAudit_(me.row, 'item:remove', b.id); break; }
    }
    return { ok: true };
  },

  // ---------- admin ----------
  listUsers: function (b) {
    requireAdmin_(b.token);
    var sh = usersSheet_();
    var users = [];
    if (sh.getLastRow() > 1) {
      sh.getDataRange().getValues().slice(1).forEach(function (v) {
        var row = {};
        USER_COLS.forEach(function (c, j) { row[c] = v[j]; });
        users.push(publicUser_(row));
      });
    }
    // A100: what each person is holding, so the list answers "who has the
    // committee's money" without opening twelve people one at a time.
    //
    // Only when the client asks with a year. Three screens call listUsers and
    // just one of them shows money; the other two must not pay for a full
    // readAll_ they will throw away. An older build sends no year and gets
    // exactly the response it always got.
    //
    // personalSummary_, not accountPicture_: the picture also builds a
    // per-donor dues list, and doing that twelve times to print one number per
    // row is work nobody asked for.
    if (b.year) {
      var d = readAll_(Number(b.year));
      users.forEach(function (u) {
        var s = personalSummary_(d, String(u.username));
        u.money = { collected: s.collected, inHand: s.inHand, pending: s.pending };
      });
    }
    return { ok: true, users: users };
  },

  setStatus: function (b) { // approve (adds year) / block / unblock
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    if (['approved', 'blocked', 'pending'].indexOf(b.status) < 0) throw new Error('bad-input');
    var note = '';
    if (b.status === 'blocked') {
      // A78: setRole has refused self-demotion since the beginning; this door
      // had no such guard, and blocking clears the token — so the sole admin
      // could shut himself out with one tap and the only way back in was
      // editing the Users sheet by hand. Same rule, same words.
      if (String(u.row.id) === String(me.row.id)) throw new Error('cant-block-self');
      if (String(u.row.role) === 'admin' && countAdmins_() <= 1) throw new Error('last-admin');
      // A78: the security door is also the LAST door — it takes the login away,
      // and a person who cannot log in cannot hand money back. So it refuses
      // while they are still holding some, and says how much rather than just
      // "no": the admin needs the figure to decide whether to chase it or write
      // it off. `override` is that decision, and it is written into the record
      // with the amount — never silently zeroed, or the book stops adding up.
      var pic = accountPicture_(readAll_(Number(b.year) || new Date().getFullYear()), String(u.row.username));
      var held = pic.inHand;
      if (held > 0.005 && !b.override) throw new Error('holds-money:' + held);
      takeSnap_(u.row, 'block', b.year, held > 0.005 ? { writtenOff: held } : null);
      if (held > 0.005) note = ' · ₹' + held + ' অনাদায়ী (override)';
      u.row.token = '';
    }
    u.row.status = b.status;
    if (b.status === 'approved') u.row.years = addYear_(u.row.years, b.year || new Date().getFullYear());
    saveUser_(u);
    logAudit_(me.row, 'status:' + b.status, '@' + u.row.username + note);
    return { ok: true, user: publicUser_(u.row) };
  },
  // A78: the committee's access decision. One call, because it has to move the
  // post AND both permission lists together — leave any one of them behind and
  // effPerms_ (post ∪ personal extras) hands everything straight back, while
  // the screen reports success. Making the admin remember three separate steps
  // was never an option.
  setAccess: function (b) {
    var me = requireAdmin_(b.token);
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { ensureCols_(usersSheet_(), USER_COLS); } finally { lock.releaseLock(); }
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    var want = String(b.access || '');
    if (['', 'exiting'].indexOf(want) < 0) throw new Error('bad-input');
    if (want === 'exiting') {
      if (String(u.row.id) === String(me.row.id)) throw new Error('cant-exit-self');
      // An admin bypasses every gate in this file, so standing one down would
      // change precisely nothing while looking like it had. Demote first — and
      // setRole already refuses to demote the last one.
      if (String(u.row.role) === 'admin') throw new Error('demote-first');
      // A78b (Hrishi: "if cashier blocked then he cant receive the amount from
      // the collector or other cashier"). confirmHandover asks for TWO things —
      // cashier AND recipient — so standing a cashier down strands every parcel
      // already on its way to them: they can no longer confirm, and no other
      // cashier may, because no other cashier is the recipient. Only the admin
      // can settle them, and nothing tells him he has to.
      //
      // So refuse first, and say how many and how much. While they are still a
      // cashier they can clear their own inbox in a minute — which is the order
      // this whole feature wants anyway: inbox empty → stand down → hand in what
      // they hold → final block.
      //
      // Deliberately NOT auto-rejecting those parcels back to their senders:
      // 'pending' means a collector has said "I gave it to you", and the cash
      // may physically be in the cashier's hands already. Only a human knows.
      // A machine writing "did not receive" would be entering a false figure.
      var inbox = pendingToUser_(u.row.username, b.year);
      if (inbox.count) throw new Error('has-pending:' + inbox.count + ':' + inbox.total);
      var pic = takeSnap_(u.row, 'exit', b.year);
      u.row.position = ''; u.row.entries = ''; u.row.reports = ''; u.row.cashier = 0;
      u.row.access = 'exiting';
      saveUser_(u);
      logAudit_(me.row, 'access:exit', '@' + u.row.username + ' · হাতে ₹' + pic.inHand +
        ' · বাকি ₹' + pic.dueTotal + ' (' + pic.dueCount + ' জন)');
    } else {
      // Coming back needs a post, because a post is what a returning member is
      // being given — and without one they would be "active" with nothing
      // granted, which looks identical to standing them down again.
      applyPosition_(u, String(b.position || ''), true);
      u.row.access = '';
      // The years are deliberately untouched: setStatus('approved') adds the
      // ADMIN's current year, and doing that here would quietly hand a
      // returning member access to a season nobody discussed.
      saveUser_(u);
      logAudit_(me.row, 'access:restore', '@' + u.row.username + ' → ' + String(b.position || ''));
    }
    return { ok: true, user: publicUser_(u.row) };
  },
  // A78: the two saved pictures beside today's, for one person. Separate from
  // listUsers because the blob is fat and this is opened one user at a time.
  userSnapshot: function (b) {
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    var year = Number(b.year) || new Date().getFullYear();
    var d = readAll_(year);
    var live = accountPicture_(d, String(u.row.username));
    var snap = readSnap_(u.row);
    // The line that stops the table reading like a bug. Between the exit and
    // today his own dues can fall without his collection rising by the same
    // amount — because somebody ELSE went and collected them, which is exactly
    // what the committee intended. Two figures that do not move together need
    // the reason written next to them, or every reader recomputes it wrong.
    //
    // Computed by SUBTRACTING the saved per-donor figures from today's, never
    // by asking which payments are newer than the exit stamp. The exit lands in
    // the middle of a working day, and two rows written in the same second
    // cannot be ordered by their timestamps at all — a comparison there would
    // be right most days and quietly wrong on the day it mattered.
    var since = null;
    if (snap.exit && snap.exit.dues) {
      var nowPaid = {}, nowMine = {};
      activeData_(d).payments.forEach(function (p) {
        var k = String(p.partyId);
        nowPaid[k] = (nowPaid[k] || 0) + num_(p.amount);
        if (ck_(p) === String(u.row.username)) nowMine[k] = (nowMine[k] || 0) + num_(p.amount);
      });
      var byHim = 0, byOthers = 0;
      snap.exit.dues.forEach(function (r) {
        var k = String(r.id);
        // A donor voided since the exit takes their payments with them, which
        // would read as money flowing backwards. Nothing was collected there,
        // so it contributes nothing — skipping is the honest answer, and the
        // erased row is the void report's business, not this line's.
        if (nowPaid[k] === undefined) return;
        var gotMine = (nowMine[k] || 0) - num_(r.paidMine);
        var gotAll = nowPaid[k] - num_(r.paid);
        if (gotMine > 0) byHim += gotMine;
        if (gotAll - gotMine > 0) byOthers += gotAll - gotMine;
      });
      since = { byHim: byHim, byOthers: byOthers };
    }
    logAudit_(me.row, 'access:view', '@' + u.row.username);
    return { ok: true, user: publicUser_(u.row), saved: snap, live: live, since: since };
  },

  approveYear: function (b) {
    requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.years = addYear_(u.row.years, b.year || new Date().getFullYear());
    saveUser_(u);
    return { ok: true, user: publicUser_(u.row) };
  },

  // carry the party master (donor list + pledges) into a new year, fresh ids
  // and zero payments. Refuses if the target year already has parties, so it
  // can't double-run. Admin-only.
  rolloverYear: function (b) {
    var me = requireAdmin_(b.token);
    var from = Number(b.fromYear), to = Number(b.toYear);
    if (!from || !to || from === to) throw new Error('bad-input');
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.parties), cols = SHEETS.parties;
      if (sh.getLastRow() < 2) return { ok: true, count: 0 };
      var vals = sh.getDataRange().getValues(), yi = cols.indexOf('year');
      for (var i = 1; i < vals.length; i++) {
        if (Number(vals[i][yi]) === to) throw new Error('year-has-data'); // never duplicate
      }
      var now = new Date().toISOString(), out = [];
      for (var j = 1; j < vals.length; j++) {
        if (Number(vals[j][yi]) !== from) continue;
        var o = {}; cols.forEach(function (c, k) { o[c] = vals[j][k]; });
        o.id = Utilities.getUuid(); o.year = to; o.createdAt = now; o.receivedAt = now;
        out.push(safeRow_(cols, o));
      }
      // A59 (audit 2.4): the ONLY writer to a ledger sheet that never stamped
      // data_ts. Swept every handler to be sure — the other twenty write Users,
      // Config or Lists, which delta-pull does not carry, so they are right to
      // skip it. This one writes parties, and without the stamp `pull` takes
      // the fast path and answers idle:true. Next January: 800 donors copied
      // into the new year, every phone says "কিছু নতুন নেই", and the year-has-data
      // guard then correctly refuses to run it again — so the admin is left with
      // rows that exist, are invisible, and cannot be re-created. AFTER the
      // write, so the stamp is never ahead of the data it announces.
      if (out.length) {
        sh.getRange(sh.getLastRow() + 1, 1, out.length, cols.length).setValues(out);
        touchData_();
      }
      logAudit_(me.row, 'rollover', from + '→' + to + ' (' + out.length + ')');
      return { ok: true, count: out.length };
    } finally { lock.releaseLock(); }
  },

  // Clear a user's token so a stuck device is kicked and they can log in fresh.
  // (Login already overwrites the token, but this is the explicit safety valve.)
  releaseSession: function (b) {
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.token = '';
    saveUser_(u);
    logAudit_(me.row, 'session:release', '@' + u.row.username);
    return { ok: true };
  },

  setCashier: function (b) {
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    // A78: not while they are standing down. The access-block empties the
    // permission lists, and every gate in push honours it — but confirmHandover
    // is not a push, it asks isCashier_ directly. So handing the cashier flag
    // back to a stood-down member let them confirm money again, undoing the
    // committee's decision from a screen that said nothing about it. Bring them
    // back first; that is a decision somebody has to make on purpose.
    if (isExiting_(u.row) && b.cashier) throw new Error('is-exiting');
    u.row.cashier = b.cashier ? 1 : 0;
    saveUser_(u);
    logAudit_(me.row, b.cashier ? 'cashier:on' : 'cashier:off', '@' + u.row.username);
    return { ok: true, user: publicUser_(u.row) };
  },

  setReports: function (b) { // grant/revoke per-report access
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.reports = (b.reports || []).filter(function (r) {
      return REPORT_IDS.indexOf(r) >= 0;
    }).join(',');
    saveUser_(u);
    logAudit_(me.row, 'reports', '@' + u.row.username + ' → [' + u.row.reports + ']');
    return { ok: true, user: publicUser_(u.row) };
  },

  // grant/revoke admin. Safeguards: an admin can't demote themselves, and the
  // last remaining admin can't be demoted — so the committee never locks itself
  // out of the admin panel.
  setRole: function (b) {
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    if (['admin', 'user'].indexOf(b.role) < 0) throw new Error('bad-input');
    // A78: an admin bypasses every gate in this file, so promoting a
    // stood-down member would hand back more than they ever had — silently,
    // from a button that says only "make admin". Bring them back first.
    if (isExiting_(u.row) && b.role === 'admin') throw new Error('is-exiting');
    if (b.role !== 'admin' && String(u.row.role) === 'admin') {
      if (String(u.row.id) === String(me.row.id)) throw new Error('cant-demote-self');
      if (countAdmins_() <= 1) throw new Error('last-admin');
    }
    u.row.role = b.role;
    saveUser_(u);
    logAudit_(me.row, b.role === 'admin' ? 'admin:grant' : 'admin:revoke', '@' + u.row.username);
    return { ok: true, user: publicUser_(u.row) };
  },

  // which entry kinds this user may insert (party/payment/daily/handover);
  // empty = all (a normal collector). Admin restricts by listing a subset.
  setEntries: function (b) {
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.entries = (b.entries || []).filter(function (e) { return PERM_KEYS.indexOf(e) >= 0; }).join(',');
    saveUser_(u);
    logAudit_(me.row, 'entries', '@' + u.row.username + ' → [' + u.row.entries + ']');
    return { ok: true, user: publicUser_(u.row) };
  },

  // Put a user in a committee post. The post carries the permission set, so this
  // one dropdown replaces ~16 checkboxes per person.
  setUserPosition: function (b) {
    var me = requireAdmin_(b.token);
    // Users gained a `position` column in v4.9.3. Heal it here — an admin action
    // is rare and already serialised, unlike the login path every collector hits.
    // Until it exists findUser_ simply reads undefined, which grants nothing.
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try { ensureCols_(usersSheet_(), USER_COLS); } finally { lock.releaseLock(); }
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    var want = String(b.position || '');
    // A115: the admin panel and the member register are two doors to this one
    // field, so both come through canAssignPosition_. For an admin it answers
    // '' at the first line — this is here so the rule cannot become true of one
    // door and false of the other, which is how the two screens drifted apart
    // in the first place.
    var no = canAssignPosition_(me.row, u.row, want);
    if (no) {
      logAudit_(me.row, 'denied:position', '@' + u.row.username + ' → ' + (want || '(none)') + ' · ' + no);
      throw new Error('position-denied:' + no);
    }
    var had = String(u.row.position || '');
    applyPosition_(u, want, false);
    saveUser_(u);
    logAudit_(me.row, 'position', '@' + u.row.username + ' : ' + (had || '(none)') + ' → ' + (want || '(none)'));
    return { ok: true, user: publicUser_(u.row) };
  },
  // A115: the committee-member register, taken off the offline sync queue and
  // put on the wire. It belongs here rather than in push because everything
  // this screen writes is a PERMISSION question — who may appoint whom — and a
  // question a phone is allowed to answer for itself is not a rule, it is a
  // suggestion. Every guard below exists because the same act can be reached
  // two ways: through the post field, or through the account field.
  //
  // The cost is Hrishi's, made with his eyes open: no network, no new committee
  // member. Collecting FROM a member is untouched and still works offline — a
  // member payment is a `payments` row against a party that already exists, and
  // not one rupee passes through here.
  saveMember: function (b) {
    var me = requireUser_(b.token);
    if (!entryAllowed_(me, 'memberadmin')) throw new Error('forbidden');
    var name = String(b.name || '').trim();
    var username = String(b.appUser || '').trim().toLowerCase();
    if (!name) throw new Error('bad-input');
    // The account is MANDATORY now, and this is the line that makes the whole
    // design work: with every member row tied to an account, the post has one
    // home (the Users sheet) instead of two that drift. Before this, the
    // register said কালী was কোষাধ্যক্ষ while Users said রতন, and no screen
    // could see both.
    if (!username) throw new Error('member-needs-account');
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var u = findUser_('username', username);
      if (!u) throw new Error('no-such-user');
      if (String(u.row.status) !== 'approved') throw new Error('user-not-approved');
      var existing = b.id ? findPartyRow_(b.id) : null;
      if (b.id && !existing) throw new Error('not-found');
      if (existing && String(existing.row.type) !== 'member') throw new Error('not-a-member');
      // A47, kept and made real. A member row is the one thing in this book
      // edited IN PLACE, so two people with 🎖️ could overwrite each other and
      // neither would ever know. The old check compared against whatever this
      // device had last SYNCED and then asked "carry on?" — which is the best a
      // client can do, and it is a warning, not a rule.
      //
      // On the wire it can be a rule: the form sends the stamp of the row it
      // loaded, and a row that has moved since is refused. `receivedAt` is
      // written on every save, so it is the version number this already had.
      if (existing && b.expect !== undefined &&
          String(b.expect || '') !== String(existing.row.receivedAt || '')) {
        throw new Error('member-stale');
      }
      // Nobody keeps their own committee record — and the guard is on the ROW,
      // not on the post field. Somebody who can edit their own line can point
      // it at an account, and pointing it at a row that already carries সম্পাদক
      // is a promotion that never touches the post field at all. Both ends are
      // checked: the account being set, and the account the row already had.
      if (String(username) === String(me.row.username) ||
          (existing && String(existing.row.appUser || '') === String(me.row.username))) {
        throw new Error('member-self');
      }
      // one account, one member row — otherwise two rows would each claim to
      // author one person's post
      var clash = memberRowByUser_(username, Number(b.year) || new Date().getFullYear());
      if (clash && (!existing || String(clash.id) !== String(existing.row.id))) throw new Error('account-taken');

      // The post lives on the USER; this row only displays it. So the write
      // goes through applyPosition_ (the cap, at the moment of writing) and
      // only after canAssignPosition_ has said who may do it at all.
      var want = String(b.position || ''), had = String(u.row.position || '');
      if (want !== had) {
        var no = canAssignPosition_(me.row, u.row, want);
        if (no) {
          logAudit_(me.row, 'denied:position', '@' + u.row.username + ' → ' +
                    (want || '(none)') + ' · ' + no);
          throw new Error('position-denied:' + no);
        }
        applyPosition_(u, want, false);
        saveUser_(u);
        logAudit_(me.row, 'position', '@' + u.row.username + ' : ' +
                  (had || '(none)') + ' → ' + (want || '(none)'));
      }

      var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.parties);
      ensureCols_(sh, SHEETS.parties);
      var head = sheetHeader_(sh);
      var row = existing ? existing.row : {};
      var was = existing ? memberDesc_(row) : '';
      var now = new Date().toISOString();
      if (!existing) {
        row.id = Utilities.getUuid();
        row.year = Number(b.year) || new Date().getFullYear();
        row.createdAt = now;
        row.collector = me.row.name;
        row.collectorId = me.row.username;
        row.collectorRole = me.row.role;
        row.pledged = 0;
        row.owner = ''; row.side = ''; row.location = '';
      }
      row.type = 'member';
      row.name = name;
      row.phone = String(b.phone || '');
      row.email = String(b.email || '');
      row.appUser = username;
      // A115: never written again. The post is the user's. Old rows keep
      // whatever value they were left with; nothing reads it any more.
      row.position = '';
      row.receivedAt = now;
      var vals = head.map(function (h) { return safeCell_(row[h] === undefined ? '' : row[h]); });
      if (existing) sh.getRange(existing.rowIndex, 1, 1, head.length).setValues([vals]);
      else sh.appendRow(vals);
      touchData_(); // this wrote a row outside push — every phone learns on its next poll
      logAudit_(me.row, existing ? 'member:edit' : 'member:add',
                existing ? (was + '  →  ' + memberDesc_(row)) : memberDesc_(row));
      return { ok: true, id: String(row.id), user: publicUser_(u.row) };
    } finally { lock.releaseLock(); }
  },
  removeMember: function (b) {
    var me = requireUser_(b.token);
    if (!entryAllowed_(me, 'memberadmin')) throw new Error('forbidden');
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var existing = findPartyRow_(String(b.id || ''));
      if (!existing || String(existing.row.type) !== 'member') throw new Error('not-found');
      if (String(existing.row.appUser || '') === String(me.row.username)) throw new Error('member-self');
      // A60's rule, server-side: a member with payments against them cannot be
      // removed. The rupees survive, but the donor row those payments point at
      // would not, and reconcile would raise `payment_orphan` for every one of
      // them for the rest of the season.
      if (partyHasMoney_(existing.row.id)) throw new Error('member-has-money');
      // A115: removing the record must never be a silent permission change, and
      // it must never leave a post held by somebody the register has forgotten.
      // So it refuses while a post is held, and says which one — the post comes
      // off first, through the checks, and then the row can go.
      var u = findUser_('username', String(existing.row.appUser || ''));
      if (u && String(u.row.position || '')) throw new Error('member-holds-post:' + u.row.position);
      // A60's mechanism, kept: a `voids` row, NOT a deleted sheet row. Deleting
      // the row here would remove it from this book and reach no other phone
      // ever — a delta pull carries rows that changed, and a row that no longer
      // exists changes nothing. `voids` is append-only, so it travels like
      // everything else, and activeData/activeData_ drop the member from the
      // arithmetic, the reports and the lists at once.
      var vsh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.voids);
      ensureCols_(vsh, SHEETS.voids);
      var now = new Date().toISOString();
      var vrow = { id: Utilities.getUuid(), year: existing.row.year, targetStore: 'parties',
                   targetId: existing.row.id, reason: 'removed', collector: me.row.name,
                   createdAt: now, receivedAt: now, collectorId: me.row.username };
      var vhead = sheetHeader_(vsh);
      vsh.appendRow(vhead.map(function (h) { return safeCell_(vrow[h] === undefined ? '' : vrow[h]); }));
      touchData_(); // every other phone learns on its next poll
      logAudit_(me.row, 'member:remove', memberDesc_(existing.row));
      return { ok: true };
    } finally { lock.releaseLock(); }
  },

  // Wipe the PERSONAL permission extras so everyone's access comes from their
  // post alone. Admins are skipped — their power is a board decision, not a
  // grant this screen hands out. Destructive and one-way, so it is its own call
  // with its own confirmation, and it names in the audit log exactly who lost
  // what rather than logging a count.
  clearUserGrants: function (b) {
    var me = requireAdmin_(b.token);
    if (String(b.confirm) !== 'CLEAR') throw new Error('confirm-required');
    var us = usersSheet_();
    if (us.getLastRow() < 2) return { ok: true, cleared: [] };
    var lock = LockService.getScriptLock(); lock.waitLock(20000);
    try {
      var cleared = [];
      var vals = us.getRange(2, 1, us.getLastRow() - 1, us.getLastColumn()).getValues();
      var head = us.getRange(1, 1, 1, us.getLastColumn()).getValues()[0].map(String);
      var iRole = head.indexOf('role'), iName = head.indexOf('username');
      var iEnt = head.indexOf('entries'), iRep = head.indexOf('reports'), iCash = head.indexOf('cashier');
      vals.forEach(function (r, i) {
        if (String(r[iRole]) === 'admin') return;
        var had = [String(r[iEnt] || ''), String(r[iRep] || ''), Number(r[iCash]) === 1 ? 'cashier' : ''].filter(String);
        if (!had.length) return;
        if (iEnt >= 0) us.getRange(i + 2, iEnt + 1).setValue('');
        if (iRep >= 0) us.getRange(i + 2, iRep + 1).setValue('');
        if (iCash >= 0) us.getRange(i + 2, iCash + 1).setValue(0);
        cleared.push(String(r[iName]));
        logAudit_(me.row, 'grants:clear', '@' + r[iName] + ' lost [' + had.join(' | ') + ']');
      });
      touchData_();
      return { ok: true, cleared: cleared };
    } finally { lock.releaseLock(); }
  },

  // assign the areas (from the Lists master) a collector is responsible for
  setAreas: function (b) {
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.areas = (b.areas || []).map(String).filter(Boolean).join(',');
    saveUser_(u);
    logAudit_(me.row, 'areas', '@' + u.row.username + ' → [' + u.row.areas + ']');
    return { ok: true, user: publicUser_(u.row) };
  },

  resetPassword: function (b) {
    var me = requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    var temp = ('' + Math.floor(100000 + Math.random() * 900000)); // 6-digit temp
    u.row.salt = Utilities.getUuid();
    u.row.passwordHash = hash_(u.row.salt, temp);
    u.row.mustChange = 1;
    u.row.token = '';
    saveUser_(u);
    logAudit_(me.row, 'password:reset', '@' + u.row.username);
    return { ok: true, tempPassword: temp }; // admin passes it on verbally
  },
};

// Make sure a column NAME exists in a sheet's header, appending it if not, and
// return its 1-based index. `readAll_` maps rows by the ACTUAL header row, so a
// value written into an unlabelled column is written and then never read — it
// vanishes with no error anywhere. setup() normally adds new columns, but it is a
// step a human has to remember; anything that writes a brand-new column heals its
// own header instead of trusting that.
// Ensure EVERY column a store writes exists in its header. `push` writes rows
// position-based over the full `cols` width, so a column the header does not
// name is written and then never read back by readAll_ (which maps by the real
// header). That has now nearly bitten twice — rejectReason, then dupOk — so the
// write path heals itself instead of depending on setup() having been re-run
// after each new field.
// Admin-editable master lists. 'position' joined area/location in v4.7.0 for the
// committee-member registry. ONE place to add a kind, so the server's gate and
// the admin screen can never disagree about what is editable.
var LIST_KINDS = ['area', 'location', 'position'];
function ensureCols_(sh, cols) {
  var last = sh.getLastColumn();
  var have = last ? sh.getRange(1, 1, 1, last).getValues()[0].map(String) : [];
  var missing = cols.filter(function (c) { return have.indexOf(c) < 0; });
  if (missing.length) sh.getRange(1, have.length + 1, 1, missing.length).setValues([missing]);
}
// Lists gained two columns in v4.9.0. Appended at the END like every other
// schema change here, so a sheet written by an older deploy keeps working and
// heals itself the first time anybody reads the lists.
//
// The healing is a WRITE living inside a READ endpoint that every collector
// calls on every app open and every focus. Two things follow, and I got both
// wrong on the first pass:
//   · check first, cheaply, and return without touching the lock when nothing
//     is missing — otherwise ten phones queue behind a 20s script lock to
//     discover there was nothing to do;
//   · when something IS missing, take the lock and check AGAIN inside it. Ten
//     phones can reach that line in the same second, and each would otherwise
//     append its own copy of the four posts. Duplicate posts in a dropdown are
//     nasty to undo.
function ensureListCols_(sh) {
  var last = sh.getLastColumn();
  var have = last ? sh.getRange(1, 1, 1, last).getValues()[0].map(String) : [];
  var needCols = LIST_COLS_EXTRA.filter(function (c) { return have.indexOf(c) < 0; }).length > 0;
  var seen = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      if (String(r[1]) === 'position') seen[String(r[0])] = true;
    });
  }
  // A101: seeding is now a ONE-TIME event recorded in Config, not "put back
  // whatever is missing". The old rule ran on every listItems and re-added any
  // POSITION_SEED id it could not see — so removeItem deleted the row, answered
  // ok, wrote an audit line, and the next screen refresh brought the post
  // straight back. Deleting সভাপতি was a button that reported success and did
  // nothing, which is the failure this project keeps finding.
  var needSeed = !String(readConfig_().lists_seeded || '');
  if (!needCols && !needSeed) return; // the normal case: read-only, no lock
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    ensureCols_(sh, LIST_COLS_EXTRA);
    seedLists_(sh); // re-reads the sheet itself, so the second check is real
  } finally { lock.releaseLock(); }
}
// A101: the built-in lists, put in ONCE. Areas were seeded only inside setup(),
// which runs by hand — so a book made before that block existed showed the four
// client-side areas everywhere in the app while the sheet held none, and the
// one screen for managing them sat empty saying "এখনো কিছু যোগ করোনি" about
// four areas that were in daily use. Positions already healed here; areas never
// did. The same sentence, guarded in one of the two places it was true for.
//
// A whole KIND is seeded only when it is entirely absent. Three posts means
// somebody deleted the fourth, and putting it back would be the delete button
// lying again — this time in the other direction.
function seedLists_(sh) {
  if (String(readConfig_().lists_seeded || '')) return false;
  var kinds = {};
  if (sh.getLastRow() > 1) {
    sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues().forEach(function (r) {
      kinds[String(r[1])] = true;
    });
  }
  var mx = ensureCol_(sh, 'maxCount');
  var wide = Math.max(6, mx);
  var add = function (id, kind, bn, en, i, maxCount) {
    var row = [];
    for (var c = 0; c < wide; c++) row.push('');
    row[0] = id; row[1] = kind; row[2] = bn; row[3] = en; row[4] = i;
    row[5] = new Date().toISOString();
    if (mx) row[mx - 1] = maxCount;
    sh.appendRow(row);
  };
  // perms stay EMPTY on purpose — a post grants nothing until an admin ticks
  // the boxes. Seeding power nobody asked for is how "why can he do that?"
  // becomes unanswerable.
  if (!kinds.position) POSITION_SEED.forEach(function (p, i) { add(p[0], 'position', p[1], p[2], i, p[3]); });
  if (!kinds.area) AREA_SEED.forEach(function (a, i) { add(a[0], 'area', a[1], a[2], i, ''); });
  setConfig_('lists_seeded', '1');
  return true;
}
// A59 (audit 2.7): setValues/appendRow PARSE a leading '=' as a formula. So a
// donor named "=সুমন" — or, far likelier, a note somebody typed starting with
// "-" — stops being text and becomes a calculation. The realistic damage is not
// an attack, it is a book that quietly stops adding up: one #REF! or #NAME? in
// a name column and every report that reads it shows an error instead of a
// figure, and nobody can tell which donor it was. The unfriendly version is
// real too — =IMPORTRANGE / =HYPERLINK execute with the SHEET OWNER's
// authority, which is Hrishi's Google account, not the collector's.
//
// A leading apostrophe is Sheets' own "this is text" marker: it is a display
// flag, not part of the value, so getValues() hands back the original string
// and readAll_ → the phones see exactly what was typed. Nothing round-trips
// differently, which is why this is safe to apply to every write.
// `=` ONLY, deliberately narrower than the usual +-@ CSV-injection list. In
// Google Sheets those three are not formula starts: "-500" is the number -500,
// "+500" is 500, "@" is nothing. They matter when a CSV is opened in Excel, and
// this app has no CSV export — reports are HTML. Quoting them would put a
// visible apostrophe on ordinary notes like "-৫০০ বাকি" and buy nothing.
// Guard the real hole, not the checklist.
var RISKY_CELL = /^=/;
function safeCell_(v) {
  return (typeof v === 'string' && RISKY_CELL.test(v)) ? "'" + v : v;
}
// map a row object onto `cols` AND neutralise it, in one place — the two were
// separate at six call sites, which is exactly how one gets missed
function safeRow_(cols, row) {
  return cols.map(function (c) { return safeCell_(row[c] !== undefined && row[c] !== null ? row[c] : ''); });
}
// A81: the sheet's OWN header, which is the only thing a write may be aimed at.
//
// `cols` is what this file believes the columns are; the sheet is what they
// actually are, and the two drift. v4.7.3 dropped `memberType` from
// SHEETS.parties, ensureCols_ only ever APPENDS, so the live sheet kept the
// column — and every position-based write after it landed one cell to the
// left. Stamping pledgeOk wrote into memberType; stamping dupOk wrote into
// pledgeOk; dupOk was never written at all. Reads are header-driven and were
// always right, which is exactly why nobody saw it: the answer went in, came
// back as nothing, and the 🩺 line could never be cleared.
//
// Unknown columns (a ghost like memberType) are preserved on update and left
// empty on insert — a wipe would be a second bug fixing the first.
function sheetHeader_(sh) {
  var last = sh.getLastColumn();
  return last ? sh.getRange(1, 1, 1, last).getValues()[0].map(String) : [];
}
function rowForSheet_(head, row, existing) {
  return head.map(function (h, i) {
    if (row[h] !== undefined && row[h] !== null) return safeCell_(row[h]);
    return existing ? existing[i] : '';
  });
}
function ensureCol_(sh, name) {
  var last = sh.getLastColumn();
  var have = last ? sh.getRange(1, 1, 1, last).getValues()[0].map(String) : [];
  var at = have.indexOf(name);
  if (at >= 0) return at + 1;
  sh.getRange(1, have.length + 1).setValue(name);
  return have.length + 1;
}
function readAll_(year) {
  var ss = SpreadsheetApp.getActive();
  var data = {};
  Object.keys(SHEETS).forEach(function (store) {
    var sh = ss.getSheetByName(SHEET_TITLES[store]);
    var rows = [];
    if (sh && sh.getLastRow() > 1) {
      var values = sh.getDataRange().getValues();
      var header = values[0];
      for (var i = 1; i < values.length; i++) {
        var obj = {};
        header.forEach(function (h, j) { obj[h] = values[i][j]; });
        if (!year || Number(obj.year) === year) rows.push(obj);
      }
    }
    data[store] = rows;
  });
  return data;
}

// receivedAt → epoch ms, tolerant of both ISO strings and Date cells (Sheets
// may auto-type a full timestamp). Empty/unparseable → 0 (treated as oldest).
function toEpoch_(v) {
  if (!v) return 0;
  var t = (v instanceof Date) ? v.getTime() : new Date(v).getTime();
  return isNaN(t) ? 0 : t;
}
// Newest receivedAt across every store, as epoch ms — the delta-pull cursor.
function maxReceivedAt_(data) {
  var mx = 0;
  Object.keys(data).forEach(function (store) {
    (data[store] || []).forEach(function (r) { var t = toEpoch_(r && r.receivedAt); if (t > mx) mx = t; });
  });
  return mx;
}

// Drop voided (corrected) records everywhere reports are computed, mirroring
// js/aggregate.js. Void rows stay in the sheet (dump) for audit.
function activeData_(d) {
  var voided = {};
  (d.voids || []).forEach(function (v) { if (v && v.targetId) voided[String(v.targetId)] = 1; });
  var keep = function (rows) { return (rows || []).filter(function (r) { return r && !voided[String(r.id)]; }); };
  return { parties: keep(d.parties), payments: keep(d.payments), daily: keep(d.daily),
           expenses: keep(d.expenses), handovers: keep(d.handovers), voids: d.voids || [],
           // messages kept HERE but deliberately NOT in the client's activeData —
           // see js/aggregate.js activeData (v3.97.0 perf). Nothing on this
           // side reads them yet; harmless because no per-collector loop runs
           // activeData_ the way inHandRows does on the client.
           messages: keep(d.messages),
           // corrections pass through untouched (they aren't voidable) — the
           // A7 change routed notifData_ through here, and dropping this key
           // silently killed correction-flag notifications (regression A8)
           corrections: d.corrections || [] };
}
// Stable collector key: username (collectorId) when present, else name (legacy).
function ck_(r) { return String((r && (r.collectorId || r.collector)) || '?'); }
// role stamped on the target entry (for the void permission rule)
// Entry rows carry `collectorRole` in ONE vocabulary — 'admin'|'cashier'|
// 'collector' — because the separation-of-duties rules test for exactly those
// words. The Users sheet speaks another ('admin'|'user' + a cashier flag), so
// roleOf_ translates on the way in. Mirrors js/aggregate.js roleOf/rowRole.
function roleOf_(role, cashier) {
  return String(role) === 'admin' ? 'admin' : (Number(cashier) === 1 ? 'cashier' : 'collector');
}
function rowRole_(stored) {
  var s = String(stored || '');
  return (s === 'admin' || s === 'cashier') ? s : 'collector';
}
// Who owns the row a void points at? Returns null when it cannot be found —
// callers treat that as "not mine", which is the safe answer.
// Is this handover addressed to `u`? The identity rule is the same one the rest
// of the file uses: prefer the stable username in `toId`, fall back to the typed
// display name for rows written offline with no id to resolve.
// ONE definition, used by both pendingHandovers (what you may see) and
// confirmHandover (what you may confirm) — they must never drift, or the server
// would accept a confirmation for a parcel it never showed you.
function isRecipient_(h, u) {
  return String(h.toId || h.to) === String(u.row.username) || String(h.to) === String(u.row.name);
}
// A59 (audit 2.9): this used to read the ENTIRE target sheet, per void row,
// INSIDE the push lock — and then scan it linearly. At 5,000 payments that is
// about a second each; ten queued voids after an offline evening held the lock
// ten extra seconds, and every other phone pushing at that moment timed out.
// The failure compounds: those phones retry, arrive together, and queue behind
// the same lock.
//
// One read per store per request, indexed by id. A script-global is safe here
// for the same reason REQ_APP_VERSION is: Apps Script runs one request per
// execution context, so this is per-request state, not shared state.
// A78b: username → the two facts that decide whether money may be sent to this
// person. Same per-request-global reasoning as OWNER_CACHE above; one read for
// a check that otherwise runs once per handover row in a batch.
var ACCESS_CACHE = null;
function accessIndex_() {
  if (ACCESS_CACHE) return ACCESS_CACHE;
  var idx = {}, sh = usersSheet_();
  if (sh && sh.getLastRow() >= 2) {
    var values = sh.getDataRange().getValues(), head = values[0].map(String);
    var iU = head.indexOf('username'), iA = head.indexOf('access'), iS = head.indexOf('status');
    for (var i = 1; i < values.length; i++) {
      if (iU < 0) break;
      idx[String(values[i][iU])] = { access: String(iA >= 0 ? values[i][iA] : ''),
                                     status: String(iS >= 0 ? values[i][iS] : '') };
    }
  }
  ACCESS_CACHE = idx;
  return idx;
}
// Parcels somebody has been SENT and has not answered yet. 'pending' is
// everything that is neither confirmed nor rejected — the same reading
// personalSummary_ uses, because a rejected parcel came back and is not
// waiting on anybody.
function pendingToUser_(username, year) {
  var d = readAll_(Number(year) || new Date().getFullYear());
  // A116d (pre-go-live review #4): voids were not filtered here, and this is
  // the gate setAccess consults before standing somebody down. A handover the
  // sender Undid (a void, synced like everything else) stayed "pending" in this
  // count for ever: invisible on every screen — they all go through
  // activeData_ — impossible to confirm or reject, and blocking the stand-down
  // with `has-pending` for a parcel that no longer exists. notifData_ and
  // accountPicture_ both filter voids; this was the N−1th place.
  var voided = {};
  (d.voids || []).forEach(function (v) { voided[String(v.targetId)] = 1; });
  var mine = (d.handovers || []).filter(function (h) {
    return !voided[String(h.id)] &&
           String(h.toId || h.to || '') === String(username) &&
           String(h.status) !== 'confirmed' && String(h.status) !== 'rejected';
  });
  return { count: mine.length, total: sumBy_(mine, function (h) { return h.amount; }) };
}
var OWNER_CACHE = null;
function ownerIndex_(store) {
  OWNER_CACHE = OWNER_CACHE || {};
  if (OWNER_CACHE[store]) return OWNER_CACHE[store];
  var idx = {};
  var sh = SHEET_TITLES[store] ? SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES[store]) : null;
  if (sh && sh.getLastRow() >= 2) {
    var values = sh.getDataRange().getValues(), header = values[0];
    var idCol = header.indexOf('id'), whoCol = header.indexOf('collectorId'), roleCol = header.indexOf('collectorRole');
    for (var i = 1; i < values.length; i++) {
      idx[String(values[i][idCol])] = {
        collectorId: String(whoCol >= 0 ? values[i][whoCol] : ''),
        role: rowRole_(roleCol >= 0 ? values[i][roleCol] : ''),
      };
    }
  }
  OWNER_CACHE[store] = idx;
  return idx;
}
// A59: rows arriving in THIS push count as owned too. The push gate runs
// entirely before any write, so a void whose target is in the same batch used
// to find nothing and be rejected — and that batch is reachable: undo while a
// push is in flight makes a void (correctly, a local delete would resurrect on
// the next pull), and if that push then fails, payment and void travel together
// on the retry. The collector's undo silently did not happen.
// Identity comes from the TOKEN, never the payload, so this grants nothing the
// "void your own row" rule did not already grant. Sheet rows win: an existing
// row is never re-attributed by an incoming one.
function noteIncomingOwner_(store, id, u) {
  if (!SHEET_TITLES[store] || !id) return;
  var idx = ownerIndex_(store);
  if (!idx[String(id)]) {
    idx[String(id)] = { collectorId: String(u.row.username || ''), role: roleOf_(u.row.role, u.row.cashier) };
  }
}
function targetOwner_(store, id) {
  return ownerIndex_(store)[String(id)] || null;
}
// May this user void that row? Mirrors js/app.js canVoid, plus the two paths
// that void one's OWN row: Undo right after saving, and correcting a flagged
// entry. Until now `voids` was the one store the server did not gate at all.
//   admin    → anything
//   cashier  → a plain collector's entry, never their own
//   anyone   → their own entry
// A60 (audit 2.1): removing a DONOR is not the same act as voiding a payment,
// and "may this person do it" is not the only question — "is this row removable
// at all" comes first. A donor with money against it must not be removable by
// anybody, admin included: the payments are not touched, so no rupee is lost,
// but they end up pointing at a row that no longer exists and the book raises
// `payment_orphan` for every one of them for the rest of the season. The client
// says so before offering the button; this is the same rule where it is
// actually enforced. One indexed read, cached per request, and only when a void
// actually targets a party — which is rare.
var PARTY_PAY_CACHE = null;
function partyHasMoney_(partyId) {
  if (!PARTY_PAY_CACHE) {
    PARTY_PAY_CACHE = {};
    var ss = SpreadsheetApp.getActive();
    var voided = {};
    var vsh = ss.getSheetByName(SHEET_TITLES.voids);
    if (vsh && vsh.getLastRow() >= 2) {
      var vv = vsh.getDataRange().getValues(), vt = vv[0].indexOf('targetId');
      for (var k = 1; k < vv.length; k++) voided[String(vv[k][vt])] = 1;
    }
    var psh = ss.getSheetByName(SHEET_TITLES.payments);
    if (psh && psh.getLastRow() >= 2) {
      var pv = psh.getDataRange().getValues(), h = pv[0];
      var pi = h.indexOf('partyId'), ii = h.indexOf('id');
      for (var j = 1; j < pv.length; j++) {
        if (voided[String(pv[j][ii])]) continue;
        var key = String(pv[j][pi]);
        PARTY_PAY_CACHE[key] = (PARTY_PAY_CACHE[key] || 0) + 1;
      }
    }
  }
  return (PARTY_PAY_CACHE[String(partyId)] || 0) > 0;
}
function voidAllowed_(u, row) {
  if (String(row.targetStore || '') === 'parties' && partyHasMoney_(row.targetId)) return false;
  if (u.row.role === 'admin') return true;
  var owner = targetOwner_(String(row.targetStore || ''), row.targetId);
  if (!owner) return false;
  if (owner.collectorId && owner.collectorId === u.row.username) return true; // undo / self-correction
  return isCashier_(u.row) && owner.role === 'collector';
}
// A59: same one-read index. rowRole_ is applied on the way IN now, so rows
// written before that fix (they say 'user') are still read as the plain
// collectors they are.
function targetCollectorRole_(store, id) {
  var o = ownerIndex_(store)[String(id)];
  return o ? o.role : 'collector';
}
function num_(x) { return Number(x) || 0; }
function sumBy_(rows, f) {
  var t = 0;
  rows.forEach(function (r) { t += num_(f(r)); });
  return t;
}
function cashOnly_(r) {
  return (r.cashAmount === '' || r.cashAmount === undefined) &&
         (r.upiAmount === '' || r.upiAmount === undefined);
}

// True cash in hand per person (used by the 'inhand' report).
function inHandRows_(d) {
  var coll = {}, received = {}, handed = {}, pending = {}, spent = {}, nameBy = {};
  var note = function (k, nm) { if (nm) nameBy[k] = nm; };
  d.payments.concat(d.daily).forEach(function (r) {
    var k = ck_(r); note(k, r.collector); coll[k] = (coll[k] || 0) + num_(r.amount);
  });
  d.handovers.forEach(function (h) {
    var amt = num_(h.amount);
    var fromK = String(h.fromId || h.from || '?'), toK = String(h.toId || h.to || '?');
    note(fromK, h.from); note(toK, h.to);
    if (h.status === 'confirmed') {
      handed[fromK] = (handed[fromK] || 0) + amt;
      received[toK] = (received[toK] || 0) + amt;
    // MIRRORS js/aggregate.js inHandRows. NOT a bare `else`: a rejected parcel is
    // not awaiting anything, and `else` would park it in the central report's
    // "confirm বাকি" column for ever, for money the cashier had refused.
    } else if (h.status !== 'rejected') pending[fromK] = (pending[fromK] || 0) + amt;
  });
  d.expenses.forEach(function (e) { var k = ck_(e); note(k, e.collector); spent[k] = (spent[k] || 0) + num_(e.amount); });
  var keys = {};
  [coll, received, handed, pending, spent].forEach(function (m) { Object.keys(m).forEach(function (k) { keys[k] = 1; }); });
  return Object.keys(keys).map(function (k) {
    return { collector: nameBy[k] || k, collected: coll[k] || 0, received: received[k] || 0,
             handedOver: handed[k] || 0, pending: pending[k] || 0, spent: spent[k] || 0,
             inHand: (coll[k] || 0) + (received[k] || 0) - (handed[k] || 0) - (spent[k] || 0) };
  }).sort(function (a, b) { return b.inHand - a.inHand; });
}

// One person's own summary (always-visible "My summary" report).
// IDENTITY RULE (mirrors js/aggregate.js): a row belongs to `ident` only when
// its own group key — collectorId, else collector name, exactly how
// inHandRows_ keys its rows — equals `ident`. No "…or the name matches"
// fallback: a blank-collectorId row groups under the display name, and that
// name-keyed identity would then swallow every row of the real username.
function personalSummary_(d, ident) {
  d = activeData_(d);
  ident = String(ident);
  var mine = function (r) { return ck_(r) === ident; };
  var myPay = d.payments.filter(mine);
  var myDaily = d.daily.filter(mine);
  var myExp = d.expenses.filter(mine);
  var money = myPay.concat(myDaily);
  var cash = 0, upi = 0;
  money.forEach(function (r) {
    if (cashOnly_(r)) cash += num_(r.amount);
    else { cash += num_(r.cashAmount); upi += num_(r.upiAmount); }
  });
  var dailyByType = { road: 0, toto: 0, bus: 0 };
  myDaily.forEach(function (r) { if (r.type in dailyByType) dailyByType[r.type] += num_(r.amount); });
  var received = 0, handedOver = 0, pending = 0;
  var isTo = function (h) { return String(h.toId || h.to || '?') === ident; };
  var isFrom = function (h) { return String(h.fromId || h.from || '?') === ident; };
  d.handovers.forEach(function (h) {
    var amt = num_(h.amount);
    if (isTo(h) && h.status === 'confirmed') received += amt;
    if (isFrom(h) && h.status === 'confirmed') handedOver += amt;
    // MIRRORS js/aggregate.js personalSummary: a rejected parcel is neither
    // handed over nor in transit — it came back. `!== 'confirmed'` alone would
    // keep reporting it as awaiting confirmation for ever.
    if (isFrom(h) && h.status !== 'confirmed' && h.status !== 'rejected') pending += amt;
  });
  var collected = sumBy_(money, function (r) { return r.amount; });
  var expenseTotal = sumBy_(myExp, function (e) { return e.amount; });
  var expenses = myExp.map(function (e) { return { date: e.date, desc: e.desc, amount: num_(e.amount) }; })
    .sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
  return { collected: collected, cash: cash, upi: upi, dailyByType: dailyByType,
           received: received, handedOver: handedOver, pending: pending,
           expenseTotal: expenseTotal, expenses: expenses,
           inHand: collected + received - handedOver - expenseTotal };
}

// Server-side report payloads — the client renders these read-only.
function computeReport_(id, d) {
  d = activeData_(d);
  var money = d.payments.concat(d.daily);
  if (id === 'overview') {
    var byType = { shop: { count: 0, pledged: 0, paid: 0 },
                   person: { count: 0, pledged: 0, paid: 0 },
                   member: { count: 0, pledged: 0, paid: 0 } };
    var paidBy = {};
    d.payments.forEach(function (p) { paidBy[p.partyId] = (paidBy[p.partyId] || 0) + num_(p.amount); });
    d.parties.forEach(function (p) {
      var b = byType[p.type]; if (!b) return;
      b.count++; b.pledged += num_(p.pledged); b.paid += paidBy[p.id] || 0;
    });
    var dailyByType = { road: 0, toto: 0, bus: 0 };
    d.daily.forEach(function (r) { if (r.type in dailyByType) dailyByType[r.type] += num_(r.amount); });
    var cash = 0, upi = 0;
    money.forEach(function (r) {
      if (cashOnly_(r)) cash += num_(r.amount); // canonical legacy check, same as personalSummary_
      else { cash += num_(r.cashAmount); upi += num_(r.upiAmount); }
    });
    var totalPledged = byType.shop.pledged + byType.person.pledged + byType.member.pledged;
    var totalPaid = byType.shop.paid + byType.person.paid + byType.member.paid;
    var totalColl = sumBy_(money, function (r) { return r.amount; });
    var totalExp = sumBy_(d.expenses, function (r) { return r.amount; });
    return { totalCollection: totalColl, totalExpense: totalExp, inHand: totalColl - totalExp,
             totalPledged: totalPledged, totalDue: totalPledged - totalPaid,
             totalCash: cash, totalUpi: upi, byType: byType, dailyByType: dailyByType };
  }
  if (id === 'dues') {
    var paid = {};
    d.payments.forEach(function (p) { paid[p.partyId] = (paid[p.partyId] || 0) + num_(p.amount); });
    var rows = d.parties.map(function (p) {
      var pd = paid[p.id] || 0;
      return { name: p.name, type: p.type, side: p.side, owner: p.owner,
               pledged: num_(p.pledged), paid: pd, due: num_(p.pledged) - pd };
    // A62 (audit 2.8): mirrors js/aggregate.js EPS. "দেড়" parses to 1.5, so
    // fractions do enter, and 0.1 + 0.2 > 0.3 is true in binary — a donor who
    // has paid in full would sit in the central dues report for ever. Half a
    // paisa; below that, two amounts are the same amount.
    }).filter(function (r) { return r.due > 0.005; })
      .sort(function (a, b) { return b.due - a.due; });
    return { rows: rows, totalDue: sumBy_(rows, function (r) { return r.due; }) };
  }
  if (id === 'inhand') return { rows: inHandRows_(d) };
  if (id === 'collectors') {
    var t = {}, nameBy = {};
    money.forEach(function (r) { var k = ck_(r); if (r.collector) nameBy[k] = r.collector; t[k] = (t[k] || 0) + num_(r.amount); });
    var rows = Object.keys(t).map(function (k) { return { collector: nameBy[k] || k, total: t[k] }; })
      .sort(function (a, b) { return b.total - a.total; });
    return { rows: rows };
  }
  if (id === 'areas') {
    var paidA = {};
    d.payments.forEach(function (p) { paidA[p.partyId] = (paidA[p.partyId] || 0) + num_(p.amount); });
    var agg = {};
    d.parties.forEach(function (p) {
      var k = p.side || '—';
      if (!agg[k]) agg[k] = { area: k, count: 0, pledged: 0, paid: 0 };
      agg[k].count++; agg[k].pledged += num_(p.pledged); agg[k].paid += paidA[p.id] || 0;
    });
    var arows = Object.keys(agg).map(function (k) { var a = agg[k]; a.due = a.pledged - a.paid; return a; })
      .sort(function (a, b) { return b.paid - a.paid; });
    return { rows: arows, totalPaid: sumBy_(arows, function (r) { return r.paid; }) };
  }
  if (id === 'expenses') {
    var rows = d.expenses.map(function (e) {
      return { date: e.date, subject: e.subject || '—', desc: e.desc,
               amount: num_(e.amount), spentBy: e.spentBy, source: e.source };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var subAgg = {};
    rows.forEach(function (r) {
      var s = r.subject || '—';
      if (!subAgg[s]) subAgg[s] = { subject: s, total: 0, count: 0 };
      subAgg[s].total += r.amount; subAgg[s].count += 1;
    });
    var bySubject = Object.keys(subAgg).map(function (k) { return subAgg[k]; })
      .sort(function (a, b) { return b.total - a.total; });
    return { rows: rows, bySubject: bySubject, total: sumBy_(rows, function (r) { return r.amount; }) };
  }
  if (id === 'daily') {
    // road/toto only — bus is a new entry (name + receipt) and belongs in the
    // ledger beside the shops and people. Mirrors js/aggregate.js.
    var isRound = function (r) { return r.type === 'road' || r.type === 'toto'; };
    var agg = {};
    d.daily.filter(isRound).forEach(function (r) {
      var k = r.date + '|' + r.type;
      agg[k] = (agg[k] || 0) + num_(r.amount);
    });
    var rows = Object.keys(agg).map(function (k) {
      var p = k.split('|');
      return { date: p[0], type: p[1], amount: agg[k] };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var byType = { road: 0, toto: 0 };
    d.daily.filter(isRound).forEach(function (r) { byType[r.type] += num_(r.amount); });
    return { rows: rows, byType: byType };
  }
  throw new Error('unknown report');
}

/**
 * Daily JSON snapshot of all sheets into the spreadsheet's own Drive folder
 * (ganesh_pooja_daulatpur) — backups sit beside the file they protect.
 * Add a time-driven trigger (daily, e.g. 2-3 AM) pointing at this function.
 */
// Backups live BESIDE the spreadsheet they protect — Hrishi keeps the sheet
// in `ganesh_pooja_daulatpur`, so that's where the snapshots go. Resolved via
// the sheet's own parent folder first, which survives a folder rename; the
// name is only the fallback if the sheet somehow has no parent (e.g. shared
// straight from a drive root).
var BACKUP_FOLDER = 'ganesh_pooja_daulatpur';
var BACKUP_PREFIX = 'chanda-backup-';
// A73: the sheets a backup carries beyond the transactional stores. ONE list,
// read by both dailyBackup and restoreBackup — they disagreed, and the
// disagreement made every backup unrestorable.
var BACKUP_EXTRA_SHEETS = ['ExpenseSubjects', 'Lists', 'Config', 'Audit'];
function backupFolder_() {
  try {
    var parents = DriveApp.getFileById(SpreadsheetApp.getActive().getId()).getParents();
    if (parents.hasNext()) return parents.next();
  } catch (e) { /* fall through to the by-name lookup */ }
  var f = DriveApp.getFoldersByName(BACKUP_FOLDER);
  return f.hasNext() ? f.next() : DriveApp.createFolder(BACKUP_FOLDER);
}
// Full snapshot (every sheet incl. Users) → Drive. Returns the file name so
// callers can log/report exactly which snapshot they took. Timestamped to the
// minute so several backups in one day (e.g. a manual one right before Go
// Live) never overwrite each other.
// A58 (audit 1.1): a session token IS the login. It is not a hash of anything —
// requireUser_ takes the raw string and hands back the account. Backups sat in
// Drive with one live token per user, so any file that ever leaked (shared
// folder, forwarded link, an old laptop) was a permanent, silent login for
// every collector and for the admin — no password needed, nothing to notice.
// Passwords are salted and iterated; tokens were plaintext. So the tokens come
// out. The column stays, so USER_COLS still lines up on restore; only the value
// goes. Consequence, and it is the right one: restoring a backup logs everybody
// out and they sign in again. A restore is a disaster action — being asked for
// your password once is the correct price.
function stripTokens_(values) {
  var ci = USER_COLS.indexOf('token');
  if (ci < 0 || !values || values.length < 2) return values;
  // header row untouched — restore reads it back by position
  for (var i = 1; i < values.length; i++) values[i][ci] = '';
  return values;
}
function dailyBackup() {
  var ss = SpreadsheetApp.getActive();
  var data = {};
  Object.keys(SHEETS).forEach(function (store) {
    var sh = ss.getSheetByName(SHEET_TITLES[store]);
    data[store] = sh ? sh.getDataRange().getValues() : [];
  });
  // A52 (audit 0.2): 'Users', matching SHEET_TITLES. Written lowercase, restore
  // resolved SHEET_TITLES['users'] || 'users' and created a NEW sheet called
  // 'users' — so every account, hash, salt, role and permission was silently NOT
  // restored, on the one action that is goLive's only undo.
  data.Users = stripTokens_(usersSheet_() ? usersSheet_().getDataRange().getValues() : []);
  BACKUP_EXTRA_SHEETS.forEach(function (n) {
    var sh = ss.getSheetByName(n);
    data[n] = sh ? sh.getDataRange().getValues() : [];
  });
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd_HHmm');
  var name = BACKUP_PREFIX + stamp + '.json';
  backupFolder_().createFile(name, JSON.stringify(data), 'application/json');
  return name;
}
// Idempotent: install the daily backup trigger if it isn't already there, so
// automatic backups don't depend on remembering a manual editor step.
function ensureBackupTrigger_() {
  var has = ScriptApp.getProjectTriggers().some(function (t) {
    return t.getHandlerFunction() === 'dailyBackup';
  });
  if (has) return 'already';
  ScriptApp.newTrigger('dailyBackup').timeBased().atHour(2).everyDays(1).create();
  return 'created';
}
