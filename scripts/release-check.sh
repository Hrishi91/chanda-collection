#!/bin/sh
# One command that answers the three questions a nightly release actually has,
# so none of them rests on somebody remembering:
#
#   1. Is this a CLIENT night or a SERVER night?  (they cost very different things)
#   2. Have the gates passed?                     (tests, scope check, versions, docs)
#   3. What is still open, and what could nobody check?
#
# Read-only: runs the suite and reads git. Changes nothing, deploys nothing.
# Exit 0 = ready to push. Exit 1 = something to fix first.
#
#   sh scripts/release-check.sh
cd "$(dirname "$0")/.." || exit 1

BAD=0
say()  { printf '%s\n' "$1"; }
ok()   { printf '  ok   %s\n' "$1"; }
bad()  { printf '  BAD  %s\n' "$1"; BAD=1; }
note() { printf '       %s\n' "$1"; }

say ''
say '── versions ──────────────────────────────────────────────────────────────'
APPV=$(grep -o "APP_VERSION = 'chanda-v[0-9.]*'" js/auth.js | grep -o 'chanda-v[0-9.]*')
SWV=$(grep -o "VERSION = 'chanda-v[0-9.]*'" sw.js | grep -o 'chanda-v[0-9.]*')
GSV=$(grep -o "CODE_VERSION = 'chanda-v[0-9.]*'" apps-script/Code.gs | grep -o 'chanda-v[0-9.]*')
SCHEMA=$(grep -o 'APP_SCHEMA = [0-9]*' js/auth.js | grep -o '[0-9]*')
if [ -n "$APPV" ] && [ "$APPV" = "$SWV" ] && [ "$APPV" = "$GSV" ]; then
  ok "all three at $APPV, schema $SCHEMA"
else
  bad "version triple disagrees — auth.js=$APPV sw.js=$SWV Code.gs=$GSV"
  note 'bump all three together, or a phone takes the code and not the contract'
fi

say ''
say '── which kind of night ───────────────────────────────────────────────────'
# The last real deployment is the last config.js rebake: that commit is the one
# that pointed the phones at a new /exec. Everything after it is undeployed.
LASTDEP=$(git log --grep='^rebake config.js' -1 --format=%H 2>/dev/null)
if [ -z "$LASTDEP" ]; then
  note 'no rebake commit found — treating the whole history as undeployed'
  LASTDEP=$(git rev-list --max-parents=0 HEAD | tail -1)
fi
DEPWHEN=$(git log -1 --format='%ad' --date=short "$LASTDEP")
note "last server deployment: $(git log -1 --format=%h "$LASTDEP") ($DEPWHEN)"

# A250: Code.gs changing is not the same as the SERVER changing. The version
# triple is test-pinned, so every client-only release drags CODE_VERSION along
# with it — and calling that a server night would send Hrishi to the Apps Script
# editor, for a string. Count only the lines that are not the version stamp.
gs_real_changes() {
  { git diff "$LASTDEP" HEAD -- apps-script/Code.gs; git diff HEAD -- apps-script/Code.gs; } 2>/dev/null \
    | grep -E '^[-+]' | grep -vE '^(\+\+\+|---)' \
    | grep -vE "^[-+]var CODE_VERSION = 'chanda-v[0-9.]*';" \
    | wc -l | tr -d ' '
}
GSLINES=$(gs_real_changes)
SERVER_NIGHT=0
[ "$GSLINES" -gt 0 ] && SERVER_NIGHT=1

SHELL_RE='^(index\.html|css/style\.css|js/(i18n|numparse|aggregate|db|auth|help|voice|sync|lists|config|app)\.js|sw\.js|manifest\.webmanifest)$'
CLIENT_CHANGED=$( { git diff --name-only "$LASTDEP" HEAD; git diff --name-only HEAD; } 2>/dev/null \
  | sort -u | grep -E "$SHELL_RE" | tr '\n' ' ')

if [ "$SERVER_NIGHT" = 1 ]; then
  say '  SERVER night — Code.gs has changed since that deployment.'
  note 'Green tests are NOT enough here: every server test runs on tests/gas-shim.js,'
  note 'not on Apps Script. Quota, locks and Utilities only exist on the real thing.'
  note ''
  note 'Order, in the morning, with you awake:'
  note '  1. ⚙️ → backup (on demand) — this is the only kind of night that can lose data'
  note '  2. paste apps-script/Code.gs into the script editor'
  note '  3. Deploy → NEW DEPLOYMENT.  Never "New version" — it has never'
  note '     repointed the URL on this account.'
  note '  4. hand over the new /exec URL, so it can be probed three times and baked in'
else
  say '  CLIENT night — nothing in Code.gs behaves differently since that deployment.'
  note 'Nothing to do in the Apps Script editor. No new URL, no rebake, no backup'
  note 'needed: nothing on the server changes.'
  if ! git diff --quiet "$LASTDEP" HEAD -- apps-script/Code.gs 2>/dev/null; then
    note ''
    note 'Code.gs does differ, but only in CODE_VERSION — the triple is test-pinned,'
    note 'so a client release always carries it. The admin screen will fly its amber'
    note '"server behind" strip until you next deploy for a real reason. Cosmetic,'
    note 'and only you can see it.'
  fi
fi
if [ -n "$CLIENT_CHANGED" ]; then
  note ''
  note "app-shell files changed: $CLIENT_CHANGED"
  note 'so the phones need ⚙️ → 🔄 before they see any of it'
else
  note ''
  note 'no app-shell file changed — the phones already have this code'
fi

say ''
say '── gates ─────────────────────────────────────────────────────────────────'
OUT=$(node tests/run.js 2>&1)
LINE=$(printf '%s' "$OUT" | grep -E '[0-9]+ passed, [0-9]+ failed' | tail -1)
if [ -z "$LINE" ]; then
  bad 'the suite printed no summary at all — it did not finish'
elif printf '%s' "$LINE" | grep -q 'SUITE ABORTED'; then
  bad "$LINE"
  note 'something threw; every assertion after it never ran'
elif printf '%s' "$LINE" | grep -q ', 0 failed'; then
  ok "$LINE"
else
  bad "$LINE"
  printf '%s\n' "$OUT" | grep '^FAIL' | head -5 | sed 's/^/       /'
fi

SC=$(node tests/scope-check.js 2>&1)
WATCH=$(printf '%s' "$SC" | grep -o '([0-9]* function-locals' | grep -o '[0-9]*')
if printf '%s' "$SC" | grep -q 'every call in js/app.js resolves'; then
  if [ -n "$WATCH" ] && [ "$WATCH" -gt 100 ]; then
    ok "scope check clean, watching $WATCH function-locals"
  else
    bad "scope check says clean but is watching only ${WATCH:-0} names"
    note 'a derived list that collapsed to nothing reports a clean tree just as loudly'
  fi
else
  bad 'scope check found problems'
  printf '%s\n' "$SC" | head -6 | sed 's/^/       /'
fi

DIRTY=$(git status --porcelain)
if [ -z "$DIRTY" ]; then
  ok 'working tree clean — everything is committed'
else
  bad 'uncommitted changes'
  printf '%s\n' "$DIRTY" | head -8 | sed 's/^/       /'
  note 'the pre-commit hook enforces docs-with-code and the sw.js bump; let it run'
fi

if [ -z "$DIRTY" ]; then
  if git show --name-only --format= HEAD | grep -qE '(^|/)docs/'; then
    ok "HEAD updates docs: $(git log -1 --format=%s | cut -c1-64)"
  else
    bad 'HEAD changed nothing under docs/'
    note 'one subject per commit, with its documentation in the same commit'
  fi
fi

say ''
say '── still open in docs/pending.md ─────────────────────────────────────────'
OPEN=$(grep -c '^- \[ \]' docs/pending.md 2>/dev/null || echo 0)
note "$OPEN open items — the ones needing a person, not code:"
grep -n '^- \[ \] \*\*' docs/pending.md | head -12 | \
  sed 's/^\([0-9]*\):- \[ \] \*\*/       pending.md:\1  /; s/\*\*.*//'
note ''
note 'A249: this list only stays true if a finished item is struck off in the same'
note 'commit that finishes it. The build log grows by itself; this file does not.'

say ''
say '── what nothing here can check ───────────────────────────────────────────'
note '1. the service-worker update cycle — verify on a FRESH PORT; unregistering'
note '   and clearing the cache is not enough, and it has lied before'
note '2. the real Apps Script runtime — every server test runs on tests/gas-shim.js'
note '3. iOS / Safari — untested entirely'
note '4. real latency — this machine answers in 2ms, a village 3G takes 15-20s'

say ''
if [ "$BAD" = 0 ]; then
  say 'READY. Push tonight; release in the morning — pushing is not releasing,'
  say 'because the worker is cache-first and a phone only takes it at ⚙️ → 🔄.'
  say 'Walk the app on your own phone first, then tell the others to refresh.'
else
  say 'NOT READY — fix the BAD lines above first.'
fi
say ''
exit $BAD
