// A248 — stop GUESSING what is uncovered and MEASURE it. Not part of the suite:
// run it by hand when you want to know what the tests actually hold.
//
//   node tests/mutation-survey.js js/aggregate.js 40
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
const LIMIT = Number(process.argv[3] || 60);
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
const step = Math.max(1, Math.floor(cands.length / LIMIT));
const sample = cands.filter(function (_, i) { return i % step === 0; }).slice(0, LIMIT);

console.log(TARGET + ': ' + cands.length + ' mutable spots, testing ' + sample.length + '\n');

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
  const tag = !ran ? '💥 no summary' : (caught ? '✅ caught' : '🚨 SURVIVED');
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
