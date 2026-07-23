/**
 * Chanda Khata — central backend (Google Apps Script, bound to a Sheet).
 *
 * Deploy: Extensions → Apps Script in the target Google Sheet, paste this
 * file, run setup() once, then Deploy → Web app (execute as Me, access:
 * Anyone). After the FIRST user registers from the app, run
 * makeAdmin('their-username') once to bootstrap the admin.
 * Full steps: docs/user-guide/setup-google.md
 *
 * Protocol: every call is a POST with text/plain JSON (no CORS
 * preflight). All data actions need a login token; admin actions need
 * an admin token. Rows are upserted by uuid `id`, so re-sending after a
 * failed sync can never duplicate.
 */

var SHEETS = {
  parties:  ['id', 'year', 'type', 'name', 'owner', 'side', 'phone', 'pledged', 'collector', 'createdAt', 'receivedAt'],
  payments: ['id', 'year', 'partyId', 'partyName', 'amount', 'cashAmount', 'upiAmount', 'date', 'note', 'collector', 'createdAt', 'receivedAt'],
  daily:    ['id', 'year', 'type', 'busName', 'busNumber', 'amount', 'cashAmount', 'upiAmount', 'date', 'note', 'collector', 'createdAt', 'receivedAt'],
  expenses: ['id', 'year', 'desc', 'amount', 'spentBy', 'source', 'collectionType', 'date', 'collector', 'createdAt', 'receivedAt'],
  handovers: ['id', 'year', 'from', 'to', 'amount', 'cashAmount', 'upiAmount', 'date', 'note',
              'status', 'confirmedBy', 'confirmedAt', 'collector', 'createdAt', 'receivedAt'],
};
var SHEET_TITLES = { parties: 'Parties', payments: 'Payments', daily: 'DailyCollections',
                     expenses: 'Expenses', handovers: 'Handovers' };

var USER_COLS = ['id', 'username', 'name', 'phone', 'passwordHash', 'salt', 'role',
                 'cashier', 'status', 'years', 'token', 'mustChange', 'createdAt', 'updatedAt'];

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (key) {
    var sh = ss.getSheetByName(SHEET_TITLES[key]) || ss.insertSheet(SHEET_TITLES[key]);
    if (sh.getLastRow() === 0) { sh.appendRow(SHEETS[key]); sh.setFrozenRows(1); }
  });
  var us = ss.getSheetByName('Users') || ss.insertSheet('Users');
  if (us.getLastRow() === 0) { us.appendRow(USER_COLS); us.setFrozenRows(1); }
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
           role: row.role, cashier: Number(row.cashier) || 0, status: row.status,
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
      var salt = Utilities.getUuid();
      usersSheet_().appendRow(USER_COLS.map(function (c) {
        var row = {
          id: Utilities.getUuid(), username: username, name: name,
          phone: String(b.phone || ''), passwordHash: hash_(salt, password), salt: salt,
          role: 'user', cashier: 0, status: 'pending', years: '', token: '',
          mustChange: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        return row[c];
      }));
    } finally { lock.releaseLock(); }
    return { ok: true };
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
          var values = cols.map(function (c) { return row[c] !== undefined ? row[c] : ''; });
          if (idRow[row.id]) sh.getRange(idRow[row.id], 1, 1, cols.length).setValues([values]);
          else sh.appendRow(values);
          savedIds.push(row.id);
        });
      });
      return { ok: true, savedIds: savedIds };
    } finally { lock.releaseLock(); }
  },

  dump: function (b) {
    requireUser_(b.token);
    var year = b.year ? Number(b.year) : null;
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
    return { ok: true, data: data };
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
          names.push(row.name);
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
