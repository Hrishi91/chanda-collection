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
  parties:  ['id', 'year', 'type', 'name', 'owner', 'side', 'phone', 'pledged', 'collector', 'createdAt', 'receivedAt', 'collectorId'],
  payments: ['id', 'year', 'partyId', 'partyName', 'amount', 'cashAmount', 'upiAmount', 'date', 'note', 'collector', 'createdAt', 'receivedAt', 'collectorId'],
  daily:    ['id', 'year', 'type', 'busName', 'busNumber', 'amount', 'cashAmount', 'upiAmount', 'date', 'note', 'collector', 'createdAt', 'receivedAt', 'collectorId'],
  expenses: ['id', 'year', 'subject', 'desc', 'amount', 'spentBy', 'source', 'collectionType', 'date', 'collector', 'createdAt', 'receivedAt', 'collectorId'],
  handovers: ['id', 'year', 'from', 'to', 'amount', 'cashAmount', 'upiAmount', 'date', 'note',
              'status', 'confirmedBy', 'confirmedAt', 'collector', 'createdAt', 'receivedAt', 'fromId', 'toId', 'collectorId'],
  // audit-preserving corrections: a void points at another record's id
  voids: ['id', 'year', 'targetStore', 'targetId', 'reason', 'collector', 'createdAt', 'receivedAt'],
};
var SHEET_TITLES = { parties: 'Parties', payments: 'Payments', daily: 'DailyCollections',
                     expenses: 'Expenses', handovers: 'Handovers', voids: 'Voids' };

var USER_COLS = ['id', 'username', 'name', 'phone', 'passwordHash', 'salt', 'role',
                 'cashier', 'reports', 'status', 'years', 'token', 'mustChange', 'createdAt', 'updatedAt'];

// Per-report access: admin sees all; cashier gets 'inhand' by default;
// anyone else sees only what the admin grants (Users.reports, comma list).
var REPORT_IDS = ['overview', 'dues', 'inhand', 'collectors', 'expenses', 'daily'];
function allowedReports_(u) {
  if (u.row.role === 'admin') return REPORT_IDS.slice();
  var granted = String(u.row.reports || '').split(',').filter(Boolean);
  if (Number(u.row.cashier) === 1 && granted.indexOf('inhand') < 0) granted.push('inhand');
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
  });
  var us = ss.getSheetByName('Users') || ss.insertSheet('Users');
  if (us.getLastRow() === 0) { us.appendRow(USER_COLS); us.setFrozenRows(1); }
  var es = ss.getSheetByName('ExpenseSubjects') || ss.insertSheet('ExpenseSubjects');
  if (es.getLastRow() === 0) { es.appendRow(['id', 'name', 'createdAt']); es.setFrozenRows(1); }
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
function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
function hash_(salt, password) {
  var d = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + password,
                                  Utilities.Charset.UTF_8);
  return Utilities.base64Encode(d);
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
    .setValues([USER_COLS.map(function (c) { return u.row[c] !== undefined ? u.row[c] : ''; })]);
}
function addYear_(years, y) {
  var list = String(years || '').split(',').filter(Boolean);
  if (list.indexOf(String(y)) < 0) list.push(String(y));
  return list.join(',');
}
function hasYear_(years, y) {
  return String(years || '').split(',').indexOf(String(y)) >= 0;
}
function publicUser_(row) {
  return { id: row.id, username: row.username, name: row.name, phone: row.phone,
           role: row.role, cashier: Number(row.cashier) || 0,
           reports: String(row.reports || ''), status: row.status,
           years: String(row.years || ''), mustChange: Number(row.mustChange) || 0,
           createdAt: row.createdAt };
}
/** Token → approved user (throws otherwise). */
function requireUser_(token) {
  if (!token) throw new Error('no-token');
  var u = findUser_('token', token);
  if (!u) throw new Error('bad-token');
  if (u.row.status !== 'approved') throw new Error(u.row.status === 'blocked' ? 'blocked' : 'pending');
  return u;
}
function requireAdmin_(token) {
  var u = requireUser_(token);
  if (u.row.role !== 'admin') throw new Error('not-admin');
  return u;
}

// ---------- entry point ----------
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    var fn = ACTIONS[body.action];
    if (!fn) throw new Error('unknown action');
    return json_(fn(body));
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}
function doGet() { return json_({ ok: true, service: 'chanda-khata' }); }

var ACTIONS = {

  register: function (b) {
    var username = String(b.username || '').trim().toLowerCase();
    var name = String(b.name || '').trim();
    var password = String(b.password || '');
    if (!/^[a-z0-9._-]{3,20}$/.test(username)) throw new Error('bad-username');
    if (!name || password.length < 4) throw new Error('bad-input');
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
        return row[c];
      }));
    } finally { lock.releaseLock(); }
    return { ok: true, first: first };
  },

  login: function (b) {
    var u = findUser_('username', String(b.username || '').trim().toLowerCase());
    if (!u || hash_(u.row.salt, String(b.password || '')) !== u.row.passwordHash) {
      throw new Error('bad-login');
    }
    if (u.row.status === 'pending') throw new Error('pending');
    if (u.row.status === 'blocked') throw new Error('blocked');
    var year = b.year ? Number(b.year) : new Date().getFullYear();
    if (!hasYear_(u.row.years, year)) throw new Error('year-not-approved');
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
    if (!mustChange && hash_(u.row.salt, String(b.oldPassword || '')) !== u.row.passwordHash) {
      throw new Error('bad-login');
    }
    if (String(b.newPassword || '').length < 4) throw new Error('bad-input');
    u.row.salt = Utilities.getUuid();
    u.row.passwordHash = hash_(u.row.salt, String(b.newPassword));
    u.row.mustChange = 0;
    saveUser_(u);
    return { ok: true };
  },

  push: function (b) {
    var user = requireUser_(b.token);
    var lock = LockService.getScriptLock();
    lock.waitLock(20000); // 10 collectors may sync at once
    try {
      var ss = SpreadsheetApp.getActive();
      var savedIds = [];
      var byStore = {};
      (b.records || []).forEach(function (r) {
        if (!SHEETS[r.store] || !r.row || !r.row.id) return;
        (byStore[r.store] = byStore[r.store] || []).push(r.row);
      });
      Object.keys(byStore).forEach(function (store) {
        var sh = ss.getSheetByName(SHEET_TITLES[store]);
        var cols = SHEETS[store];
        var idRow = {};
        if (sh.getLastRow() > 1) {
          sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().forEach(function (v, i) {
            idRow[String(v[0])] = i + 2;
          });
        }
        byStore[store].forEach(function (row) {
          row.receivedAt = new Date().toISOString();
          row.collector = row.collector || user.row.name;
          row.collectorId = row.collectorId || user.row.username; // stable identity
          var values = cols.map(function (c) { return row[c] !== undefined ? row[c] : ''; });
          if (idRow[row.id]) sh.getRange(idRow[row.id], 1, 1, cols.length).setValues([values]);
          else sh.appendRow(values);
          savedIds.push(row.id);
        });
      });
      return { ok: true, savedIds: savedIds };
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
    if (Number(u.row.cashier) !== 1 && u.row.role !== 'admin') throw new Error('not-cashier');
    var d = readAll_(b.year ? Number(b.year) : new Date().getFullYear());
    return { ok: true, handovers: d.handovers.filter(function (h) {
      return String(h.toId || h.to) === String(u.row.username) || h.to === u.row.name;
    }) };
  },

  // lightweight actionable counts for the in-app notification banner
  notifications: function (b) {
    var u = requireUser_(b.token);
    var out = { handovers: 0, approvals: 0 };
    var isCashier = Number(u.row.cashier) === 1 || u.row.role === 'admin';
    if (isCashier) {
      var year = b.year ? Number(b.year) : new Date().getFullYear();
      var d = activeData_(readAll_(year));
      out.handovers = d.handovers.filter(function (h) {
        return (String(h.toId || h.to) === String(u.row.username) || h.to === u.row.name) && h.status !== 'confirmed';
      }).length;
    }
    if (u.row.role === 'admin') {
      var us = usersSheet_();
      if (us.getLastRow() > 1) {
        us.getDataRange().getValues().slice(1).forEach(function (v) {
          if (String(v[USER_COLS.indexOf('status')]) === 'pending') out.approvals++;
        });
      }
    }
    return { ok: true, notifications: out };
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
        if (row.status === 'approved' && (Number(row.cashier) === 1 || row.role === 'admin')) {
          names.push({ username: row.username, name: row.name });
        }
      });
    }
    return { ok: true, cashiers: names };
  },

  // cashier (or admin) confirms receiving a handover addressed to them
  confirmHandover: function (b) {
    var u = requireUser_(b.token);
    if (Number(u.row.cashier) !== 1 && u.row.role !== 'admin') throw new Error('not-cashier');
    var sh = SpreadsheetApp.getActive().getSheetByName(SHEET_TITLES.handovers);
    var cols = SHEETS.handovers;
    if (sh.getLastRow() < 2) throw new Error('not-found');
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(b.id)) {
        var r = i + 2;
        sh.getRange(r, cols.indexOf('status') + 1).setValue('confirmed');
        sh.getRange(r, cols.indexOf('confirmedBy') + 1).setValue(u.row.name);
        sh.getRange(r, cols.indexOf('confirmedAt') + 1).setValue(new Date().toISOString());
        return { ok: true };
      }
    }
    throw new Error('not-found');
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
    requireAdmin_(b.token);
    var name = String(b.name || '').trim();
    if (!name) throw new Error('bad-input');
    var sh = SpreadsheetApp.getActive().getSheetByName('ExpenseSubjects');
    if (sh.getLastRow() > 1) {
      var exists = sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().some(function (r) {
        return String(r[0]).toLowerCase() === name.toLowerCase();
      });
      if (exists) throw new Error('subject-exists');
    }
    sh.appendRow([Utilities.getUuid(), name, new Date().toISOString()]);
    return { ok: true };
  },
  removeSubject: function (b) {
    requireAdmin_(b.token);
    var sh = SpreadsheetApp.getActive().getSheetByName('ExpenseSubjects');
    if (sh.getLastRow() < 2) return { ok: true };
    var ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (String(ids[i][0]) === String(b.id)) { sh.deleteRow(i + 2); break; }
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
    return { ok: true, users: users };
  },

  setStatus: function (b) { // approve (adds year) / block / unblock
    requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    if (['approved', 'blocked', 'pending'].indexOf(b.status) < 0) throw new Error('bad-input');
    u.row.status = b.status;
    if (b.status === 'approved') u.row.years = addYear_(u.row.years, b.year || new Date().getFullYear());
    if (b.status === 'blocked') u.row.token = '';
    saveUser_(u);
    return { ok: true, user: publicUser_(u.row) };
  },

  approveYear: function (b) {
    requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.years = addYear_(u.row.years, b.year || new Date().getFullYear());
    saveUser_(u);
    return { ok: true, user: publicUser_(u.row) };
  },

  setCashier: function (b) {
    requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.cashier = b.cashier ? 1 : 0;
    saveUser_(u);
    return { ok: true, user: publicUser_(u.row) };
  },

  setReports: function (b) { // grant/revoke per-report access
    requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    u.row.reports = (b.reports || []).filter(function (r) {
      return REPORT_IDS.indexOf(r) >= 0;
    }).join(',');
    saveUser_(u);
    return { ok: true, user: publicUser_(u.row) };
  },

  resetPassword: function (b) {
    requireAdmin_(b.token);
    var u = findUser_('id', b.userId);
    if (!u) throw new Error('user not found');
    var temp = ('' + Math.floor(100000 + Math.random() * 900000)); // 6-digit temp
    u.row.salt = Utilities.getUuid();
    u.row.passwordHash = hash_(u.row.salt, temp);
    u.row.mustChange = 1;
    u.row.token = '';
    saveUser_(u);
    return { ok: true, tempPassword: temp }; // admin passes it on verbally
  },
};

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

// Drop voided (corrected) records everywhere reports are computed, mirroring
// js/aggregate.js. Void rows stay in the sheet (dump) for audit.
function activeData_(d) {
  var voided = {};
  (d.voids || []).forEach(function (v) { if (v && v.targetId) voided[String(v.targetId)] = 1; });
  var keep = function (rows) { return (rows || []).filter(function (r) { return r && !voided[String(r.id)]; }); };
  return { parties: keep(d.parties), payments: keep(d.payments), daily: keep(d.daily),
           expenses: keep(d.expenses), handovers: keep(d.handovers), voids: d.voids || [] };
}
// Stable collector key: username (collectorId) when present, else name (legacy).
function ck_(r) { return String((r && (r.collectorId || r.collector)) || '?'); }
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
    } else pending[fromK] = (pending[fromK] || 0) + amt;
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
function personalSummary_(d, ident) {
  d = activeData_(d);
  ident = String(ident);
  var mine = function (r) { return ck_(r) === ident || r.collector === ident; };
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
  var isTo = function (h) { return String(h.toId || h.to) === ident || h.to === ident; };
  var isFrom = function (h) { return String(h.fromId || h.from) === ident || h.from === ident; };
  d.handovers.forEach(function (h) {
    var amt = num_(h.amount);
    if (isTo(h) && h.status === 'confirmed') received += amt;
    if (isFrom(h) && h.status === 'confirmed') handedOver += amt;
    if (isFrom(h) && h.status !== 'confirmed') pending += amt;
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
      if (r.cashAmount === '' && r.upiAmount === '') cash += num_(r.amount);
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
    }).filter(function (r) { return r.due > 0; })
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
    var agg = {};
    d.daily.forEach(function (r) {
      var k = r.date + '|' + r.type;
      agg[k] = (agg[k] || 0) + num_(r.amount);
    });
    var rows = Object.keys(agg).map(function (k) {
      var p = k.split('|');
      return { date: p[0], type: p[1], amount: agg[k] };
    }).sort(function (a, b) { return String(b.date).localeCompare(String(a.date)); });
    var byType = { road: 0, toto: 0, bus: 0 };
    d.daily.forEach(function (r) { if (r.type in byType) byType[r.type] += num_(r.amount); });
    return { rows: rows, byType: byType };
  }
  throw new Error('unknown report');
}

/**
 * Daily JSON snapshot of all sheets into Drive folder "ChandaKhata-Backups".
 * Add a time-driven trigger (daily, e.g. 2-3 AM) pointing at this function.
 */
function dailyBackup() {
  var ss = SpreadsheetApp.getActive();
  var data = {};
  Object.keys(SHEETS).forEach(function (store) {
    var sh = ss.getSheetByName(SHEET_TITLES[store]);
    data[store] = sh ? sh.getDataRange().getValues() : [];
  });
  data.users = usersSheet_() ? usersSheet_().getDataRange().getValues() : [];
  var folders = DriveApp.getFoldersByName('ChandaKhata-Backups');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('ChandaKhata-Backups');
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  folder.createFile('chanda-backup-' + stamp + '.json', JSON.stringify(data), 'application/json');
}
