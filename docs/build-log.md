# Build log (append-only, oldest first)

## 2026-07-23 — Project bootstrap

- Requirements gathered from Hrishi (chat): shops/persons/members with
  pledged amounts + installments; road/toto/bus daily collections
  (bus = name + number); collector expenses; 10 collector phones; one
  central final report; Bengali+English; data must live in Google Drive;
  yearly reuse.
- Architecture decided: offline-first PWA + Apps Script/Google Sheet
  (see PROJECT_CONTEXT.md for causes). Voice entry Option B
  (guided + confirm) approved by Hrishi.
- Repo scaffolded: discipline docs, pre-commit docs hook, directories.

## 2026-07-23 — v1 PWA core (offline entry + reports)

- Built the full offline PWA: app shell (index.html, sw.js, manifest,
  SVG icon), IndexedDB layer (`js/db.js`), bn/en i18n (`js/i18n.js`),
  Bengali/English amount-word parser (`js/numparse.js`), shared
  aggregation (`js/aggregate.js`), Web Speech wrapper (`js/voice.js`),
  sync client (`js/sync.js`), and the guided chat-style entry engine +
  all views (`js/app.js`).
- Flows: new shop/person/member (pledge + first installment), bulk shop
  (sticky side), add payment, road/toto/bus daily (bus name+number),
  general + collection expenses. Summary-confirm before every save;
  editable per-field from summary.
- Tests: `node tests/run.js` → 49 passed, 0 failed (parser incl.
  পাঁচশো/সাড়ে তিনশো/দেড় হাজার; aggregation incl. dues + by-collector).
- Live-verified in browser (mobile viewport): onboarding → shop entry
  with "পাঁচশো"→₹500 word parse → save → খাতা list (₹200/₹500, বাকি
  ₹300) → installment "তিনশো" → ₹500/₹500 ✅ → report totals correct;
  unsynced badge counts 3.

## 2026-07-23 — Google Sheets backend + user guides

- `apps-script/Code.gs`: doPost push with LockService + upsert-by-uuid
  (safe retries, no duplicates from 10 concurrent phones), doGet dump
  (year-filtered, client aggregates with the same aggregate.js), setup()
  sheet creator, dailyBackup() → Drive folder JSON snapshots. Secret in
  Script Properties, never in the repo.
- Guides: `docs/user-guide/setup-google.md` (owner, one-time deploy),
  `docs/user-guide/collector-guide.md` (Bengali, for the 10 collectors).
- Not yet live-tested against a real deployment — needs Hrishi's Google
  account (tracked in pending.md).

## 2026-07-23 — v2 Phase 1: login, roles, admin approval

- Server (`apps-script/Code.gs` rewritten): Users sheet (salted SHA-256
  password hash + rotating login token), actions register/login/
  changePassword/push/dump + admin listUsers/setStatus/approveYear/
  setCashier/resetPassword; makeAdmin() editor bootstrap; shared SECRET
  removed — every data call now needs an approved user's token; yearly
  access via `years` list on the user.
- Client: `js/auth.js` (session in localStorage — one online login,
  then offline works), `js/config.js` (baked SCRIPT_URL), login/
  register/forgot/change-password views, forced password change after
  admin reset, 👑 admin panel (approve/block/cashier flag/reset pw/
  year access), logout guarded against unsynced entries. Secret field
  dropped from Settings. sw.js → chanda-v2.0.0.
- Verified live against a node mock of the exact protocol
  (scratchpad/mock-backend.js): register → pending login rejected →
  admin approve in UI → login ok; pre-login sync rejected (bad-token),
  post-login autosync pushed 3 queued entries; wrong password, year
  2027 gate, stale-token admin call all rejected; password change +
  re-login ok. 49 unit tests still passing.

## 2026-07-23 — Live on GitHub Pages

- Repo published: github.com/Hrishi91/chanda-collection (public,
  Hrishi created it + enabled Pages from main//root himself).
- Live install link verified in browser (login screen renders):
  https://hrishi91.github.io/chanda-collection/
- Remaining to go fully live: Hrishi's Apps Script deploy → bake URL
  into js/config.js → real e2e sync test → collectors install.

## 2026-07-23 — v2 Phase 2: cash/UPI split + handover ledger

- Every money entry (installments incl. first payment, road/toto/bus)
  now asks mode: নগদ / UPI / দুটোই — "both" captures cash+UPI amounts
  separately (cashAmount/upiAmount cols added server-side; legacy rows
  count as cash). Zero-total saves rejected.
- Handover ledger: new `handovers` store/sheet (IndexedDB v2).
  Collector: 🤝 জমা দিলাম → picks cashier (server `cashiers` list,
  free-text offline) → cash/UPI amounts. Cashier: ✅ জমা নেওয়া confirm
  view (server-truth via dump) → `confirmHandover` (cashier/admin only,
  server-side status flip — no client row-ownership conflicts).
- Central report: মোট নগদ/মোট UPI tiles + "কার হাতে কত টাকা" table
  (collected − confirmed handovers = in hand; pending shown separately,
  still counted as in-hand until confirmed).
- Verified live against updated mock: both-mode payment
  (100 cash + 150 UPI), handover "দুশো"→200 cash → cashier confirm →
  pending(1)→confirmed, in-hand table shows 250−200=50, cash/UPI totals
  100/150 correct. Tests 58 passed, 0 failed.

## 2026-07-23 — v2 Phase 2.6: per-report access control

- Six named reports, each computed server-side (readable payloads,
  client renders read-only): overview, dues, inhand, collectors,
  expenses, daily.
- Access model: admin sees all; a cashier gets `inhand` by default;
  everyone else sees only what the admin grants (new Users.reports
  comma list). Enforced server-side — `dump` is now admin-only, data
  reaches non-admins ONLY through the per-report `report` action which
  checks allowedReports_. New actions: reportList, report,
  pendingHandovers (cashier confirm no longer needs the admin-only
  dump), setReports (admin toggle).
- Admin panel: per-user report-permission chips (cashier's inhand shown
  on+disabled = auto). Report tab: own-device totals always shown, then
  a picker of only the reports the user may see (server reportList is
  authority; myReports() offline fallback). Removed dead inHandTable +
  Sync.fetchCentral.
- Verified live (curl + browser, mock): admin=6 reports, cashier=
  [inhand], granted user=[dues] only — overview & raw dump both denied;
  dues report data correct (Ram Stores due 300); admin toggling
  overview for that user persisted server-side and unlocked it
  (totalCollection 500 = 200 cash + 300 upi). 58 unit tests pass.

## 2026-07-23 — v2 Phase 2.7: personal "My summary" + true in-hand

- Everyone now sees a self-scoped **My summary** at the top of the
  report tab (no permission): I collected (cash/UPI), handed over,
  handed to me, in hand, my road/toto/bus, and my expense list. Server
  action `myReport` (self only); offline falls back to device-local
  Aggregate.personalSummary.
- In-hand made correct: cash in hand = collected + received(confirmed
  handovers TO me) − handedOver(confirmed FROM me) − my expenses.
  Upgraded both the central 'inhand' report and the personal summary
  via shared aggregate.js (inHandRows/personalSummary), mirrored in
  Code.gs + mock. Pending outgoing handovers shown separately, not
  subtracted (giver keeps credit until cashier confirms).
- Puja-expense entry (🧾 খরচ home tile) restricted to cashier/admin —
  they hold the money (Hrishi: "খরচ can be done by the cashier"). A
  collector's own spend-while-collecting still available via the
  post-daily "কালেকশন খরচ" flow.
- Tests: 71 passed, 0 failed (added inHandRows with received/spent +
  personalSummary incl. cash/UPI split). Verified live (curl+browser):
  cashier Kartik with collected 300 + received 500 − expense 100 →
  in hand 700, cash 300, expense list shown; central section for the
  cashier shows only "কার হাতে কত". sw → chanda-v2.3.0.

## 2026-07-23 — v3 Phase 3: admin expense subjects + part-payments

- Admin manages an expense-subject list (new ExpenseSubjects sheet;
  actions listSubjects[any user]/addSubject[admin, dup-checked]/
  removeSubject[admin]). Admin-panel card to add (input) / remove
  (chip ✕).
- Expenses now carry a `subject`. Puja-expense entry (cashier/admin)
  picks a subject; "➕ অন্য কিছু" (Other) forces a mandatory comment
  (flow engine gained step.required). Multiple cashiers part-paying the
  same subject just add rows with that subject.
- Expenses report groups **by subject** (subject → total, count) plus
  the full entry list (subject — comment • date • who). Admin sees all
  expenses + all reports (unchanged). Collector's own spend-while-
  collecting stays a separate free-text "কালেকশন খরচ" (source
  'collection', no subject).
- Verified live (curl + browser): admin added Pandal/Light (dup +
  non-admin add rejected); two people part-paid Pandal (→3500, 2
  entries); Other-with-comment entry created through the UI with the
  empty-comment submit correctly blocked; expenses report grouped
  Pandal 3500 / Other 240, total 3740. 71 tests pass. sw → chanda-v3.0.0.

## 2026-07-23 — Bootstrap simplified: first registrant = admin

- register() now makes the very first user an approved admin for the
  current year (returns {first:true}); the client routes the first user
  straight to login with a "you're the admin" toast. Removes the
  awkward makeAdmin editor step from setup-google.md.
- Context for Hrishi's question "how do I log in": NO real backend is
  deployed yet — all testing used a local mock in the sandbox
  (localhost:8790), unreachable from his devices. The live GitHub Pages
  app has CONFIG.SCRIPT_URL='' so login can't work there until he
  deploys the Apps Script and we bake the /exec URL into js/config.js.
- Verified server + browser: 1st register→admin/approved, 2nd→pending;
  browser register→login→role admin. 71 tests pass.
- Cleanup: dropped the stale makeAdmin note from Code.gs header comment.

## 2026-07-23 — Live backend wired

- Hrishi deployed the Apps Script web app; baked its /exec URL into
  js/config.js and bumped sw → chanda-v3.1.0 so the live PWA fetches
  the new config (SW is cache-first for assets).
- Verified the real backend from a browser fetch: doGet → {ok, service}
  and a POST login-probe round-trips as JSON (text/plain POST, no
  preflight, redirect handled). Next: Hrishi runs setup() (creates the
  7 tabs) then registers as the first user → auto-admin.

## 2026-07-23 — Clearer auth validation (Hrishi feedback)

- Registration errors were only fleeting toasts and the username rule
  wasn't shown, so users got stuck. Now: username rule as a hint under
  the field with LIVE colour feedback (green ✓ valid / red rule on bad
  input), a "min 4 chars" hint under password, and a persistent red
  inline error box (auth-err) for all login/register failures.
  Client-side checks fire before the round-trip (name required, bad
  username, short password, mismatch); login errors moved from toast to
  the inline box. sw → chanda-v3.2.0.
- Verified in browser: "Hrishi Babu" → red rule; "hrishi" → green ✓;
  mismatched passwords → persistent inline error box.

## 2026-07-23 — Fix: stale cached config → "Sync URL not set"

- Symptom (Hrishi, 2nd device): register failed with "Sync URL not set
  (Settings)" even though js/config.js has the live URL and Pages serves
  it. Live-diagnosed: backend up, config correct, Users sheet exists,
  register works via fetch. CAUSE: config.js was cache-first in the SW,
  so a device that cached the app BEFORE the URL was baked in kept
  serving the old empty SCRIPT_URL until it happened to re-fetch sw.js.
  This is why the very first register never reached the sheet either.
- Fix 1 — sw.js: config.js is now **network-first** (refresh cache on
  success, cache fallback offline). The file carrying the backend URL can
  never be served stale while online, so no collector gets stuck on an
  empty URL.
- Fix 2 — app.js: on `controllerchange` (an UPDATED SW taking control via
  skipWaiting+clients.claim) the page **auto-reloads once**, so future
  deploys apply without asking users to close/clear the app. Guarded by
  `hadController` so the first-ever install doesn't self-reload.
- sw → chanda-v3.3.0. 71 unit tests still pass; sw.js + app.js
  node --check clean.
- Note: a device ALREADY stuck on the old SW must re-fetch sw.js once
  (reopen online / clear site data / reinstall) to receive v3.3.0; after
  that the two fixes keep it current automatically.

## 2026-07-23 — REAL root cause: window.CONFIG was undefined

- After the network-first fix, Hrishi cleared cache + reloaded and STILL
  got "Sync URL not set" on the register button — proving it was never
  the cache. CAUSE: config.js declared `const CONFIG`, but a top-level
  `const` is NOT a property of `window`; auth.js and sync.js read the URL
  as `window.CONFIG && CONFIG.SCRIPT_URL`, so `window.CONFIG` was always
  undefined → apiUrl() always '' → EVERY UI login/register failed with
  "Sync URL not set". The earlier manual fetch probes used bare `CONFIG`,
  so they worked and masked the bug — no UI login had ever actually
  succeeded (matches: no admin ever existed in the sheet).
- Fix: config.js now assigns `window.CONFIG = {…}` (was `const CONFIG`),
  so both `window.CONFIG` reads resolve. One line, fixes auth + sync.
- sw → chanda-v3.4.0. 71 tests pass. The network-first + auto-reload
  fixes from v3.3.0 stay (still correct); this is the actual unblocker.
