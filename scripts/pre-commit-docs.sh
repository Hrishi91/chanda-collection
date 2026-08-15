#!/bin/sh
# Two rules, both learned the hard way.
staged=$(git diff --cached --name-only)

# ── 1. code without docs ───────────────────────────────────────────────────
if echo "$staged" | grep -qE '\.(js|html|css|gs|webmanifest)$'; then
  if ! echo "$staged" | grep -qE '(^|/)docs/|CLAUDE\.md|README'; then
    echo "COMMIT BLOCKED: code changed but no doc updated." >&2
    echo "Append to docs/build-log.md (minimum) in this same commit." >&2
    exit 1
  fi
fi

# ── 2. A114: a SHELL file without a service-worker VERSION bump ────────────
# The worker serves the app shell CACHE-FIRST, and it only re-fetches those
# files when a NEW worker installs — which only happens when sw.js itself
# changes byte-for-byte. So a change to app.js/i18n.js/aggregate.js with sw.js
# untouched reaches GitHub Pages and then reaches NOBODY: every phone that
# already holds the current cache keeps serving yesterday's code, for ever, and
# 🔄 আপডেট খুঁজি cannot help because it only re-fetches sw.js and finds it
# identical.
#
# That is exactly how A111, A112 and A113 shipped, were verified live on Pages,
# and were invisible on Hrishi's phone — while he was told three times that a
# client-only change needs no redeploy.
SHELL_FILES='^(index\.html|css/style\.css|js/(i18n|numparse|aggregate|db|auth|help|voice|sync|lists|app)\.js)$'
if echo "$staged" | grep -qE "$SHELL_FILES"; then
  if ! echo "$staged" | grep -q '^sw\.js$'; then
    echo "COMMIT BLOCKED: an app-shell file changed but sw.js did not." >&2
    echo "" >&2
    echo "  The service worker serves these cache-first and only refreshes them" >&2
    echo "  when sw.js itself changes. Without a VERSION bump this lands on Pages" >&2
    echo "  and never reaches a single phone." >&2
    echo "" >&2
    echo "  Bump VERSION in sw.js (and APP_VERSION in js/auth.js to match)." >&2
    exit 1
  fi
fi
exit 0
