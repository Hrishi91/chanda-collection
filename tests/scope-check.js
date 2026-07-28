// Catches the freshThen class of bug: a module-level function calling a helper
// that exists only inside ANOTHER function's closure. `node --check` cannot see
// it — the file parses, and it throws only when a user taps the button. That is
// how it shipped, survived two performance investigations, and was finally
// found by Hrishi tapping দোকান and reading the console.
const fs = require('fs');
const DIR = __dirname + '/../js/';
const FILES = fs.readdirSync(DIR).filter(f => f.endsWith('.js'));

// comments and string literals are prose, not code — matching inside them is
// what made the first version of this check unusable
function strip(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/`(?:\\.|[^`\\])*`/g, '``');
}

// every name any file exposes at its own top level, plus browser globals
const globals = new Set(['if','for','while','switch','catch','return','typeof','new','do','else','function',
  'Promise','Object','Array','String','Number','Boolean','Math','JSON','Date','Error','Set','Map','RegExp',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','setTimeout',
  'clearTimeout','setInterval','clearInterval','fetch','alert','confirm','prompt','console','document',
  'window','localStorage','indexedDB','navigator','history','location','requestAnimationFrame','URL',
  'Blob','File','FileReader','Notification','crypto','performance','CustomEvent','Event','caches',
  'btoa','atob','Image','Uint8Array','Intl','self','sessionStorage','MessageChannel']);
FILES.forEach(f => {
  const s = strip(fs.readFileSync(DIR + f, 'utf8'));
  let m;
  const decl = /^\s{0,2}(?:function\s+|(?:const|let|var)\s+)([A-Za-z_$][A-Za-z0-9_$]*)/gm;
  while ((m = decl.exec(s))) globals.add(m[1]);
});

const src = strip(fs.readFileSync(DIR + 'app.js', 'utf8'));
const topFn = /^  function ([A-Za-z0-9_$]+)\s*\(([^)]*)\)/gm;
const fns = [];
let m;
while ((m = topFn.exec(src))) fns.push({ name: m[1], params: m[2], at: m.index });
fns.forEach((f, i) => { f.body = src.slice(f.at, i + 1 < fns.length ? fns[i + 1].at : src.length); });

const problems = [];
fns.forEach(f => {
  const seen = new Set(globals);
  f.params.split(',').forEach(p => { const n = p.trim().split(/[\s=]/)[0]; if (n) seen.add(n); });
  let d;
  // `const a = 1, b = 2` declares BOTH — taking only the first name was what
  // made this report two functions that are perfectly fine
  const decl = /(?:const|let|var)\s+([^;\n]+)|function\s+([A-Za-z_$][A-Za-z0-9_$]*)/g;
  while ((d = decl.exec(f.body))) {
    if (d[2]) { seen.add(d[2]); continue; }
    d[1].split(',').forEach(function (part) {
      const n = part.trim().split(/[\s=({[]/)[0];
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n)) seen.add(n);
    });
  }
  const params = /function\s*[A-Za-z0-9_$]*\s*\(([^)]*)\)/g;
  while ((d = params.exec(f.body))) d[1].split(',').forEach(p => { const n = p.trim().split(/[\s=]/)[0]; if (n) seen.add(n); });
  const arrows = /(?:\(([^)]*)\)|([A-Za-z_$][A-Za-z0-9_$]*))\s*=>/g;
  while ((d = arrows.exec(f.body))) (d[1] || d[2] || '').split(',').forEach(p => { const n = p.trim(); if (n) seen.add(n); });

  // A57: a LOOKBEHIND, not a consumed character.
  //
  // The old guard ate the character before the identifier, so when one match
  // ended on '(' the very next identifier was skipped — and esc(...), t(...),
  // fmtMoney(...) wrapping is the dominant idiom in this file, so the blind spot
  // sat exactly where the code is densest. `esc(missingFn(1))` reported only
  // `esc`. A rename could break two live call sites and still print
  // "904 passed + scope check clean", which is how eight admin buttons went out
  // dead (A48).
  const calls = /(?<![A-Za-z0-9_$.])([A-Za-z_$][A-Za-z0-9_$]*)\s*\(/g;
  let c;
  while ((c = calls.exec(f.body))) {
    if (!seen.has(c[1])) problems.push(f.name + '() calls ' + c[1] + '() — declared in no reachable scope');
  }
});

const unique = [...new Set(problems)];
if (unique.length) { console.error('SCOPE PROBLEMS:\n  ' + unique.join('\n  ')); process.exit(1); }
console.log('scope check: every call in js/app.js resolves');
