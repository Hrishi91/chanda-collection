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
    .replace(/`(?:\\.|[^`\\])*`/g, '``')
    // A247: regex literals too. Their flags and escapes — /…/g, \d, \s, \n —
    // are bare single letters to any identifier scan, and every one of the
    // twelve phantoms the derived check below first reported came from one.
    .replace(/(^|(?:return|typeof|case|in|of|do|else)\s+|[=(,:[!&|?{};+\n]\s*)\/(?![*\/])(?:\\.|\[(?:\\.|[^\]\\])*\]|[^\/\\\n])+\/[gimsuy]*/g, '$1RegExp');
}

// every name any file exposes at its own top level, plus browser globals
const globals = new Set(['if','for','while','switch','catch','return','typeof','new','do','else','function','this',
  'Promise','Object','Array','String','Number','Boolean','Math','JSON','Date','Error','Set','Map','RegExp',
  'parseInt','parseFloat','isNaN','isFinite','encodeURIComponent','decodeURIComponent','setTimeout','queueMicrotask',
  'clearTimeout','setInterval','clearInterval','fetch','alert','confirm','prompt','console','document',
  'window','localStorage','indexedDB','navigator','history','location','requestAnimationFrame','URL',
  'Blob','File','FileReader','Notification','crypto','performance','CustomEvent','Event','caches',
  'btoa','atob','Image','Uint8Array','Intl','self','sessionStorage','MessageChannel']);
FILES.forEach(f => {
  const s = strip(fs.readFileSync(DIR + f, 'utf8'));
  let m;
  // A105: `let a = '', b = 0;` at module level declares BOTH — capturing only
  // the first is the same bug the in-function scan below already had fixed, and
  // it left admDraft/admPosDraft/listQuery looking undeclared.
  const decl = /^\s{0,2}(?:function\s+([A-Za-z_$][A-Za-z0-9_$]*)|(?:const|let|var)\s+([^;\n]+))/gm;
  while ((m = decl.exec(s))) {
    if (m[1]) { globals.add(m[1]); continue; }
    m[2].split(',').forEach(function (part) {
      const n = part.trim().split(/[\s=({[]/)[0];
      if (/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(n)) globals.add(n);
    });
  }
  // A105: the modules announce themselves by assigning to window —
  // `window.Lists = (function () {…` at the start of a line, and
  // `else window.Aggregate = api;` in the middle of one for the two that also
  // support module.exports. Neither shape is a declaration, so the scan above
  // cannot see them, and every one is read as `Lists.` / `Aggregate.` from a
  // dozen functions — the read check below would have reported the whole app.
  const win = /window\.([A-Za-z_$][A-Za-z0-9_$]*)\s*=/g;
  while ((m = win.exec(s))) globals.add(m[1]);
});

const src = strip(fs.readFileSync(DIR + 'app.js', 'utf8'));
const topFn = /^  function ([A-Za-z0-9_$]+)\s*\(([^)]*)\)/gm;
const fns = [];
let m;
while ((m = topFn.exec(src))) fns.push({ name: m[1], params: m[2], at: m.index });
fns.forEach((f, i) => { f.body = src.slice(f.at, i + 1 < fns.length ? fns[i + 1].at : src.length); });

// Every name that is local to SOME top-level function and to no module scope.
// This is the RENDER_LOCALS list, discovered instead of typed out — see the
// note at the bare-read check below.
function seenOf(f) {
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

  return seen;
}

// Names three characters or longer. This is the filter actually holding the
// noise down — with regex literals stripped and no length rule the scan still
// raises three phantoms (`c` in esc, `e2` in finishFlow, `n` in wireCashSheet),
// all callback parameters in shapes the param regexes above do not reach. A
// one- or two-letter local is a loop or callback variable that no regex can
// tell from a stray fragment, and a check that cries wolf is a check people
// switch off. Every historical subject — from, params, type, sector — is four
// letters or more, so nothing real is given up.
const RENDER_LOCALS = [];
{
  const acc = new Set();
  fns.forEach(f => { seenOf(f).forEach(n => { if (!globals.has(n) && n.length >= 3) acc.add(n); }); });
  acc.forEach(n => RENDER_LOCALS.push(n));
}

const problems = [];
fns.forEach(f => {
  const seen = seenOf(f);

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

  // A105: the same class one step sideways — READING a name from a scope that
  // does not have it. `drawParty` is a top-level function, not a closure inside
  // renderParty, and a fix that reached for `params.from` in there threw
  // ReferenceError on every 👁 দেখো while 1,614 assertions stayed green: the
  // call check above only ever looked at `name(`, never at `name.`.
  //
  // Property reads only (`name.`), because a bare identifier appears in far too
  // many innocent shapes to tell apart with a regex — and a check that cries
  // wolf is a check people switch off.
  const reads = /(?<![A-Za-z0-9_$.])([A-Za-z_$][A-Za-z0-9_$]*)\s*\./g;
  let r;
  while ((r = reads.exec(f.body))) {
    if (!seen.has(r[1])) problems.push(f.name + '() reads ' + r[1] + '.… — declared in no reachable scope');
  }

  // A115e: and the third variant — a BARE read. `savePartyForm` read `from`,
  // which is a const inside renderPartyForm, a SIBLING at module level. Every
  // donor correction threw `ReferenceError: from is not defined` after the row
  // had already been written, so the collector saw "✅ সেভ হয়ে গেল" followed by
  // "⚠️ সার্ভার বলছে: from is not defined" and reported the save as broken. It
  // had saved. Four weeks after A105 fixed the same mistake ten functions away.
  //
  // A151: `type` was the third — A149's "a টিকিট is always programme money"
  // clause copied into expenseFlow, which has no `type`, so every general খরচ
  // threw at save, and it SHIPPED in v4.40.0. A158: `sector` was the FOURTH,
  // written into savePartyAndFirstPayment by A153, throwing on every new donor
  // for three deployments.
  //
  // A247: four strikes, and the list was HAND-MAINTAINED — each name added
  // after its own ReferenceError had already reached twelve phones. A guard
  // that has to be told its subjects only ever guards the last bug. So the list
  // is derived now: every name local to some top-level function of app.js and
  // to no module scope, which is 536 names rather than four, and it needed no
  // loosening of the check to get there. The old comment's fear — that a
  // general bare-identifier scan cries wolf — turned out to be one fixable
  // fact: `strip()` was not removing regex literals, so /…/g flags and \d \s \n
  // escapes read as bare identifiers. With those stripped and one- and
  // two-letter names left out, the derived list reports NOTHING on a clean
  // tree, and catches a fifth name the hand list would have missed.
  RENDER_LOCALS.forEach(function (nm) {
    if (seen.has(nm)) return; // this function declares or receives it — fine
    const bare = new RegExp('(?<![A-Za-z0-9_$.\'"])' + nm + '(?![A-Za-z0-9_$:\'"])', 'g');
    // strip strings and comments first, or a Bengali sentence or a CSS class
    // containing the word would raise a phantom
    const code = f.body.replace(/\/\/[^\n]*/g, '').replace(/'(\\.|[^'\\])*'/g, "''")
                       .replace(/"(\\.|[^"\\])*"/g, '""');
    if (bare.test(code)) {
      problems.push(f.name + '() reads bare `' + nm + '` — declared in no reachable scope (pass it as an argument)');
    }
  });
});

const unique = [...new Set(problems)];
if (unique.length) { console.error('SCOPE PROBLEMS:\n  ' + unique.join('\n  ')); process.exit(1); }
console.log('scope check: every call in js/app.js resolves ('
  + RENDER_LOCALS.length + ' function-locals watched for bare reads)');
