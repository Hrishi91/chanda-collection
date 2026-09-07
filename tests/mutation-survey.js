// A248 — stop GUESSING what is uncovered and MEASURE it. Not part of the suite:
// run it by hand when you want to know what the tests actually hold.
//
//   node tests/mutation-survey.js js/aggregate.js 40
//   node tests/mutation-survey.js js/app.js all out.jsonl
//
// A272: `all` means every candidate, not a spread sample — a sample tells you a
// RATE, and a rate is not a list of what is unheld. The optional third argument
// writes one JSON line per mutation including the NAME of the first assertion
// that caught it, which is the only way to tell a test that ran the code from a
// regex that pinned its spelling.
//
// It edits the target file in place and restores it after every run, so do not
// run it with uncommitted work in that file. Three times this
// session I decided a module was untested by grepping the test files for its
// names, and twice I was wrong (sync.js had A93; i18n had A97). Grepping tests
// measures how a test is SPELLED. Mutating the code measures what the tests
// actually hold.
//
// Mechanical operators only — boundary flips and one logic flip — because those
// are the shapes that stay valid JS and are exactly how money goes wrong by one
// rupee, one row, or one person.
const fs = require('fs'), cp = require('child_process');
const ROOT = require('path').join(__dirname, '..');

const TARGET = process.argv[2] || 'js/aggregate.js';
const ALL = String(process.argv[3] || '') === 'all';
const LIMIT = ALL ? Infinity : Number(process.argv[3] || 60);
// absolute or repo-relative, so the log can live outside the tree it is
// measuring — writing it INSIDE the repo would put it under the next mutation.
const JSONL = process.argv[4]
  ? (process.argv[4].charAt(0) === '/' ? process.argv[4] : ROOT + '/' + process.argv[4])
  : '';
// A274: an optional 5th argument narrows the run to lines whose TEXT matches.
// A full pass over a 9,000-line file is 48 minutes; "survey just the money
// decisions" is eight, and after a fix you want the eight, not the forty-eight.
const ONLY = process.argv[5] ? new RegExp(process.argv[5]) : null;
const path = ROOT + '/' + TARGET;
const orig = fs.readFileSync(path, 'utf8');
const lines = orig.split('\n');

const OPS = [[' >= ', ' > '], [' <= ', ' < '], [' > ', ' >= '], [' < ', ' <= '], [' && ', ' || ']];

// candidates: (lineIndex, column, from, to), skipping comments and strings
const cands = [];
lines.forEach(function (ln, i) {
  const t = ln.trim();
  if (t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')) return;
  const code = ln.split('//')[0];
  OPS.forEach(function (op) {
    let idx = -1;
    while ((idx = code.indexOf(op[0], idx + 1)) >= 0) {
      // crude but effective: an odd number of quotes before it means we are inside one
      const before = code.slice(0, idx);
      const q = (before.match(/'/g) || []).length + (before.match(/"/g) || []).length;
      if (q % 2 === 1) continue;
      cands.push({ line: i, col: idx, from: op[0], to: op[1] });
    }
  });
});

// spread the sample across the file rather than taking the first N
const picked = ONLY ? cands.filter(function (c) { return ONLY.test(lines[c.line]); }) : cands;
const step = ALL ? 1 : Math.max(1, Math.floor(picked.length / LIMIT));
const sample = ALL ? picked
  : picked.filter(function (_, i) { return i % step === 0; }).slice(0, LIMIT);

console.log(TARGET + ': ' + cands.length + ' mutable spots' +
  (ONLY ? ', ' + picked.length + ' match /' + ONLY.source + '/' : '') +
  ', testing ' + sample.length + '\n');

const survivors = [];
sample.forEach(function (c, n) {
  const l = lines.slice();
  l[c.line] = l[c.line].slice(0, c.col) + c.to + l[c.line].slice(c.col + c.from.length);
  fs.writeFileSync(path, l.join('\n'));
  let out = '';
  try {
    out = String(cp.execFileSync(process.execPath, [ROOT + '/tests/run.js'], { cwd: ROOT, stdio: 'pipe' }));
  } catch (e) {
    out = String(e.stdout || '') + String(e.stderr || '');
  }
  fs.writeFileSync(path, orig);
  const m = out.match(/(\d+) passed, (\d+) failed/);
  const caught = m ? Number(m[2]) > 0 : false;
  const ran = !!m;
  // which assertion noticed — 'FAIL <name> → got …'. A name is the difference
  // between "a test exercised this line" and "a regex pinned how it is spelled".
  const first = (out.match(/^FAIL ([^\n]*)/m) || [])[1] || '';
  const by = first.split(' → ')[0].trim();
  // Three outcomes, not two. A mutation that makes the suite THROW is "caught"
  // only in the sense that something ran the line and it blew up — no assertion
  // held its behaviour, and everything after the throw never ran. Recording that
  // as an ordinary catch would flatter the coverage number badly.
  const aborted = caught && (/SUITE ABORTED/.test(out) || !by);
  const tag = !ran ? '💥 no summary'
    : (caught ? (aborted ? '💥 threw' : '✅ caught') : '🚨 SURVIVED');
  if (JSONL) {
    fs.appendFileSync(JSONL, JSON.stringify({
      line: c.line + 1, from: c.from, to: c.to, ran: ran, caught: caught,
      aborted: aborted, by: by, text: lines[c.line].trim().slice(0, 200),
    }) + '\n');
  }
  if (!ran || !caught) survivors.push({ c: c, ran: ran, text: lines[c.line].trim().slice(0, 110) });
  process.stdout.write('  ' + String(n + 1).padStart(3) + '/' + sample.length + ' L' +
    String(c.line + 1).padEnd(5) + ' ' + JSON.stringify(c.from) + '→' + JSON.stringify(c.to) +
    '  ' + tag + '\n');
});

console.log('\n=== ' + survivors.length + ' of ' + sample.length + ' survived ===\n');
survivors.forEach(function (s) {
  console.log('  L' + (s.c.line + 1) + (s.ran ? '' : ' (suite could not finish — that is its own finding)'));
  console.log('     ' + s.text);
  console.log('     ' + JSON.stringify(s.c.from) + ' → ' + JSON.stringify(s.c.to) + '\n');
});
