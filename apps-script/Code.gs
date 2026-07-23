/**
 * Chanda Khata — central backend (Google Apps Script, bound to a Sheet).
 *
 * Deploy: Extensions → Apps Script in the target Google Sheet, paste this
 * file, run setup() once, set SECRET in Script Properties, then
 * Deploy → New deployment → Web app (execute as Me, access: Anyone).
 * Full steps: docs/user-guide/setup-google.md
 *
 * Client posts JSON as text/plain (no CORS preflight). Rows are upserted
 * by uuid `id`, so re-sending after a failed sync can never duplicate.
 */

var SHEETS = {
  parties:  ['id', 'year', 'type', 'name', 'owner', 'side', 'phone', 'pledged', 'collector', 'createdAt', 'receivedAt'],
  payments: ['id', 'year', 'partyId', 'partyName', 'amount', 'date', 'note', 'collector', 'createdAt', 'receivedAt'],
  daily:    ['id', 'year', 'type', 'busName', 'busNumber', 'amount', 'date', 'note', 'collector', 'createdAt', 'receivedAt'],
  expenses: ['id', 'year', 'desc', 'amount', 'spentBy', 'source', 'collectionType', 'date', 'collector', 'createdAt', 'receivedAt'],
};
var SHEET_TITLES = { parties: 'Parties', payments: 'Payments', daily: 'DailyCollections', expenses: 'Expenses' };

function setup() {
  var ss = SpreadsheetApp.getActive();
  Object.keys(SHEETS).forEach(function (key) {
    var title = SHEET_TITLES[key];
    var sh = ss.getSheetByName(title) || ss.insertSheet(title);
    if (sh.getLastRow() === 0) {
      sh.appendRow(SHEETS[key]);
      sh.setFrozenRows(1);
    }
  });
}

function checkSecret_(given) {
  var secret = PropertiesService.getScriptProperties().getProperty('SECRET');
  if (!secret) throw new Error('SECRET not set in Script Properties');
  if (given !== secret) throw new Error('bad secret');
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);
    checkSecret_(body.secret);
    if (body.action !== 'push') throw new Error('unknown action');

    var lock = LockService.getScriptLock();
    lock.waitLock(20000); // 10 collectors may sync at once
    try {
      var ss = SpreadsheetApp.getActive();
      var savedIds = [];
      var byStore = {};
      (body.records || []).forEach(function (r) {
        if (!SHEETS[r.store] || !r.row || !r.row.id) return;
        (byStore[r.store] = byStore[r.store] || []).push(r.row);
      });
      Object.keys(byStore).forEach(function (store) {
        var sh = ss.getSheetByName(SHEET_TITLES[store]);
        var cols = SHEETS[store];
        var ids = sh.getLastRow() > 1
          ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues().map(function (v) { return String(v[0]); })
          : [];
        var idRow = {};
        ids.forEach(function (id, i) { idRow[id] = i + 2; });
        byStore[store].forEach(function (row) {
          row.receivedAt = new Date().toISOString();
          var values = cols.map(function (c) { return row[c] !== undefined ? row[c] : ''; });
          if (idRow[row.id]) sh.getRange(idRow[row.id], 1, 1, cols.length).setValues([values]);
          else sh.appendRow(values);
          savedIds.push(row.id);
        });
      });
      return json_({ ok: true, savedIds: savedIds });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet(e) {
  try {
    var p = (e && e.parameter) || {};
    checkSecret_(p.secret);
    if (p.action !== 'dump') throw new Error('unknown action');
    var year = p.year ? Number(p.year) : null;
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
    return json_({ ok: true, data: data });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  }
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
  var folders = DriveApp.getFoldersByName('ChandaKhata-Backups');
  var folder = folders.hasNext() ? folders.next() : DriveApp.createFolder('ChandaKhata-Backups');
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  folder.createFile('chanda-backup-' + stamp + '.json', JSON.stringify(data), 'application/json');
}
