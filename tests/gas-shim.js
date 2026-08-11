// A65 (audit 2.17): a small Apps Script stand-in, so `apps-script/Code.gs` can
// be EXECUTED here instead of only grepped.
//
// Why this is worth its ~200 lines: the backend has 47 request actions and not
// one of them had ever run in the suite. Everything the tests knew about the
// server came from regexes over its source, which can only ever say "this text
// is present" — never "this request does the right thing". A9 (identity taken
// from the payload instead of the token) could be reintroduced tomorrow and
// every assertion would stay green, because the string it matched on would
// still be there. Two releases of this audit found server bugs by reading;
// reading is not a test.
//
// Deliberately NOT a Google Sheets emulator. It implements exactly the surface
// Code.gs uses — measured, not guessed: getSheetByName, insertSheet, getRange,
// getDataRange, getValues/setValues/setValue, appendRow, getLastRow,
// getLastColumn, setFrozenRows, deleteRow, clear, plus LockService, Utilities,
// Session, DriveApp, ScriptApp, Logger and ContentService. Anything Code.gs
// starts using that is missing will throw by name rather than pass quietly.
//
// One rule it enforces on purpose: a sheet is a rectangular grid of values,
// and getRange(...).setValues() writes exactly what it is given, including the
// leading apostrophe safeCell_ adds. It does NOT strip that apostrophe, because
// that is real Sheets behaviour this cannot reproduce — so nothing here can be
// mistaken for proof of it. See docs/build-log.md, v4.12.2.

'use strict';
const fs = require('fs');
const crypto = require('crypto');

function makeSheet(name, rows) {
  const grid = rows ? rows.map(r => r.slice()) : [];
  const widen = (r, n) => { while (r.length < n) r.push(''); };
  const sheet = {
    _name: name,
    _grid: grid,
    getName: () => name,
    getLastRow: () => grid.length,
    getLastColumn: () => grid.reduce((m, r) => Math.max(m, r.length), 0),
    setFrozenRows: () => sheet,
    clear: () => { grid.length = 0; return sheet; },
    appendRow: (row) => { grid.push(row.slice()); return sheet; },
    deleteRow: (i) => { grid.splice(i - 1, 1); return sheet; },
    // Missing until A78c, which is why goLive and clearTraining — the two most
    // destructive actions in the file — had never once been EXECUTED here. They
    // were read, and reading is not a test (see the note at the top).
    deleteRows: (i, n) => { grid.splice(i - 1, n); return sheet; },
    getDataRange: () => sheet.getRange(1, 1, Math.max(grid.length, 1), Math.max(sheet.getLastColumn(), 1)),
    getRange: (r, c, nr, nc) => {
      nr = nr === undefined ? 1 : nr;
      nc = nc === undefined ? 1 : nc;
      return {
        getValues: () => {
          const out = [];
          for (let i = 0; i < nr; i++) {
            const row = grid[r - 1 + i] || [];
            const line = [];
            for (let j = 0; j < nc; j++) line.push(row[c - 1 + j] === undefined ? '' : row[c - 1 + j]);
            out.push(line);
          }
          return out;
        },
        getValue: () => {
          const row = grid[r - 1] || [];
          return row[c - 1] === undefined ? '' : row[c - 1];
        },
        setValues: (vals) => {
          // A81: real Sheets REFUSES a mismatch — "The number of rows/columns
          // in the data does not match the number in the range". This shim used
          // to accept anything and quietly write it, so a write sized by the
          // wrong array (cols.length against a header that had grown) looked
          // fine here and would have thrown in production. A harness that is
          // more forgiving than the thing it stands in for hides exactly the
          // bugs it exists to catch.
          if (vals.length !== nr) {
            throw new Error('The number of rows in the data does not match the number of rows in the range. (' +
                            vals.length + ' vs ' + nr + ')');
          }
          vals.forEach((line) => {
            if (line.length !== nc) {
              throw new Error('The number of columns in the data does not match the number of columns in the range. (' +
                              line.length + ' vs ' + nc + ')');
            }
          });
          vals.forEach((line, i) => {
            const at = r - 1 + i;
            while (grid.length <= at) grid.push([]);
            widen(grid[at], c - 1);
            line.forEach((v, j) => { grid[at][c - 1 + j] = v; });
          });
          return sheet;
        },
        setValue: (v) => {
          const at = r - 1;
          while (grid.length <= at) grid.push([]);
          widen(grid[at], c - 1);
          grid[at][c - 1] = v;
          return sheet;
        },
      };
    },
  };
  return sheet;
}

// Fixed clock and a counted uuid: a test that cannot reproduce its own run is
// not much of a test. Code.gs never reads Date.now() for logic, only for
// stamps, so pinning them here changes nothing except that failures are
// readable.
function makeEnv(opts) {
  opts = opts || {};
  const sheets = {};
  let uuidN = 0;
  let now = opts.now || Date.parse('2026-07-29T06:00:00Z');
  const files = {};

  const ss = {
    getId: () => 'test-sheet',
    getName: () => 'Chanda test',
    getSheetByName: (n) => sheets[n] || null,
    insertSheet: (n) => (sheets[n] = makeSheet(n, [])),
    getSheets: () => Object.keys(sheets).map(k => sheets[k]),
  };

  let locked = 0;
  const lock = {
    waitLock: () => { locked++; },
    releaseLock: () => { locked--; },
    tryLock: () => true,
    _depth: () => locked,
  };

  const env = {
    SpreadsheetApp: { getActive: () => ss, getActiveSpreadsheet: () => ss },
    LockService: { getScriptLock: () => lock, getDocumentLock: () => lock },
    Utilities: {
      getUuid: () => 'uuid-' + (++uuidN),
      formatDate: (d, tz, fmt) => {
        const iso = new Date(d).toISOString();
        return fmt.indexOf('HH') >= 0 ? iso.slice(0, 10) + '_' + iso.slice(11, 13) + iso.slice(14, 16)
                                      : iso.slice(0, 10);
      },
      computeDigest: (alg, s) => Array.from(crypto.createHash('sha256').update(String(s), 'utf8').digest()),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      DigestAlgorithm: { SHA_256: 'SHA_256' },
      Charset: { UTF_8: 'UTF_8' },
    },
    Session: { getScriptTimeZone: () => 'Asia/Kolkata' },
    DriveApp: {
      getFileById: (id) => files[id] || (() => { throw new Error('no-file'); })(),
      getFoldersByName: () => ({ hasNext: () => false, next: () => null }),
      createFolder: (n) => ({
        getName: () => n,
        createFile: (fn, content) => (files[fn] = {
          getName: () => fn, getId: () => fn, getBlob: () => ({ getDataAsString: () => content }),
        }),
        getFiles: () => ({ hasNext: () => false, next: () => null }),
      }),
      getRootFolder: () => null,
    },
    ScriptApp: { getProjectTriggers: () => [], newTrigger: () => ({ timeBased: () => ({ atHour: () => ({ everyDays: () => ({ create: () => {} }) }) }) }) },
    Logger: { log: () => {} },
    ContentService: {
      createTextOutput: (t) => ({ setMimeType: () => ({ getContent: () => t }) }),
      MimeType: { JSON: 'JSON' },
    },
    _sheets: sheets,
    _files: files,
    _lock: lock,
    _now: () => now,
    _setNow: (t) => { now = t; },
  };
  return env;
}

// Load Code.gs with those globals bound, and hand back the pieces a test needs.
// `Date` is replaced by a subclass with a fixed default, so receivedAt stamps
// and data_ts are deterministic — Code.gs only ever uses them as stamps.
function loadBackend(opts) {
  const env = makeEnv(opts);
  const src = fs.readFileSync(__dirname + '/../apps-script/Code.gs', 'utf8');
  const names = ['SpreadsheetApp', 'LockService', 'Utilities', 'Session', 'DriveApp',
                 'ScriptApp', 'Logger', 'ContentService', 'Date', 'g'];
  const FixedDate = class extends Date {
    constructor(...a) { if (a.length === 0) super(env._now()); else super(...a); }
    static now() { return env._now(); }
  };
  const out = {};
  const fn = new Function(...names, src +
    '\n g.ACTIONS = ACTIONS;' +
    '\n g.setup = setup;' +
    '\n g.SHEETS = SHEETS; g.SHEET_TITLES = SHEET_TITLES; g.USER_COLS = USER_COLS;' +
    '\n g.CODE_SCHEMA = CODE_SCHEMA; g.CODE_VERSION = CODE_VERSION;' +
    '\n g.doPost = doPost; g.doGet = doGet;' +
    '\n g.hash_ = hash_; g.readConfig_ = readConfig_; g.setConfig_ = setConfig_;' +
    '\n g.dailyBackup = dailyBackup;' +
    // reset the per-request caches the real runtime gets for free by starting a
    // fresh execution context each time — forgetting this is how a shim starts
    // reporting things the server would never do
    '\n g.resetRequestState = function () { OWNER_CACHE = null; PARTY_PAY_CACHE = null; ACCESS_CACHE = null; REQ_APP_VERSION = ""; };');
  fn(env.SpreadsheetApp, env.LockService, env.Utilities, env.Session, env.DriveApp,
     env.ScriptApp, env.Logger, env.ContentService, FixedDate, out);

  // one request = one execution context
  const call = (action, body) => {
    out.resetRequestState();
    const b = Object.assign({ action }, body || {});
    const f = out.ACTIONS[action];
    if (!f) throw new Error('unknown action: ' + action);
    return f(b);
  };
  // the same, but through doPost — so the outer error envelope is exercised too
  const post = (action, body) => {
    out.resetRequestState();
    const raw = JSON.stringify(Object.assign({ action }, body || {}));
    return JSON.parse(out.doPost({ postData: { contents: raw } }).getContent());
  };
  const rows = (title) => {
    const sh = env._sheets[title];
    if (!sh || sh.getLastRow() < 2) return [];
    const v = sh.getDataRange().getValues();
    const head = v[0];
    return v.slice(1).map(r => { const o = {}; head.forEach((h, i) => { o[h] = r[i]; }); return o; });
  };
  return { env, api: out, call, post, rows };
}

module.exports = { loadBackend, makeSheet, makeEnv };
