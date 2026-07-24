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
- Proven live via the app's own code path: with the deployed config.js
  loaded, window.CONFIG is set and Auth.login('__nope__') returns
  'bad-login' (reaches backend), not 'not-configured'.

## 2026-07-23 — Harden: config.js no-store, drop from precache (v3.5.0)

- Follow-up gap found while verifying: SW "network-first" for config.js
  used plain fetch(e.request), which still reads the browser HTTP disk
  cache (GitHub Pages sends max-age=600) — so a returning device could get
  a stale config for up to 10 min. New collectors (no cache) were fine.
- Hardened sw.js: config.js fetched with { cache: 'no-store' } (bypass
  HTTP cache, always hit origin online; cache copy kept only as offline
  fallback), and config.js removed from the precache ASSETS list so a
  stale copy is never baked in at install time.
- sw → chanda-v3.5.0. 71 tests pass; sw.js node --check clean.

## 2026-07-23 — Full audit: language toggle was completely broken (v3.6.0)

- Deep-read every module (js/*.js, Code.gs, index.html) after the
  window.CONFIG bug, hunting for the same class of error. Found the
  English/Bengali toggle never worked:
  1. i18n.js `t()` read the language as `window.Settings && Settings.get('lang')`,
     but Settings was a top-level `const` → `window.Settings` undefined →
     the guard always fell back to 'bn'. So `t()` returned Bengali no
     matter what the user picked. Fix: db.js assigns `window.Settings = {…}`
     (same class of bug as window.CONFIG).
  2. On the login/register/forgot screens the language chips called only
     the partial re-render (renderLogin/renderRegister), so even once (1)
     was fixed the header title + bottom-nav labels stayed in the old
     language. Fix: langChips() now calls the full render().
- Verified live in the browser (local static serve): with lang=en the UI
  renders fully in English; clicking বাংলা flips the card, the header
  (🙏 চাঁদা খাতা) and the nav (হোম/খাতা/রিপোর্ট/সেটিংস) together.
- Audit result otherwise clean: client↔server field/action contract
  matches (SHEETS cols vs DB.newRow vs report renderers), auth/roles/
  report-gating consistent, no other `window.X &&` guard bugs remain
  (grep-verified: only CONFIG + Settings were affected, both fixed).
- sw → chanda-v3.6.0. 71 tests pass; db.js + app.js node --check clean.

## 2026-07-23 — END-TO-END sync verified against the REAL backend

- Long-standing gap (Hrishi: "have you checked data saves to the Sheet?"):
  every prior test used IndexedDB + a mock, never a real token → real Sheet.
  Cause it was never verified: the window.CONFIG bug meant no UI login had
  ever succeeded, so no valid token, so `push` never ran → Sheet was empty.
- Hrishi logged in as admin (hrishi91) and shared his session token; drove
  the real backend from the browser (token auth, not password) and proved:
  - **push → Sheet**: a party + payment landed in Parties/Payments; server
    stamped collector = hrishikesh mahato from the token; cash/UPI split
    (400/200) persisted. Read straight back via `dump`.
  - **upsert-by-uuid**: re-push of the same party id (pledged 1000→1200)
    kept the row count at 1 and updated in place — 10-phone retry-safe.
  - **server report `overview`**: collection 600 / pledged 1200 / due 600 /
    cash 400 / upi 200 — server math correct.
  - **handover confirm cycle**: push pending handover → `confirmHandover`
    flipped status to 'confirmed', confirmedBy stamped.
  - **expense subject CRUD**: add → list → remove all worked.
  - **myReport**: collected 600 + received 500 = inHand 1100. Correct.
- Users sheet now holds only hrishi91 (admin); the zz_probe_del junk row was
  removed by Hrishi. Test data left in the Sheet (SYNC TEST দোকান party +
  its payment, and the Ramu→hrishikesh handover) is Hrishi's to clear.
  Token was shared in chat once — re-login rotates/invalidates it.

## 2026-07-23 — Polish: hide scriptUrl from collectors, defensive sync (v3.7.0)

- Settings: the scriptUrl backend-override field is now shown to admins
  only — a collector can no longer accidentally edit it and break their
  own sync. (Verified in browser: admin fields [year, scriptUrl];
  collector fields [year].)
- sync.js: `resp.savedIds.length` → `(resp.savedIds || []).length` so a
  malformed server response can't throw during a sync.
- sw → chanda-v3.7.0. 71 tests pass; app.js + sync.js node --check clean.

## 2026-07-23 — UX: back button on drill-in screens (v3.8.0)

- Hrishi: "there is no back options". The drill-in screens (party detail,
  admin panel, cashier confirm) are not bottom-nav tabs, so once you were
  in them the only way out was guessing a nav tab — and on the admin/
  cashier loading + error states there was no way back at all.
- Added a reusable `backBar(toView)` (← পেছনে / ← Back) shown at the top of:
  party detail → খাতা (list), admin panel → settings, cashier confirm →
  home. Included in those screens' loading AND error states too, so a
  failed network load never strands the user. New CSS `.back-bar`.
- Verified in browser: party back → list; admin back → settings even when
  listUsers errors (fake token). 71 tests pass; app.js node --check clean.
- sw → chanda-v3.8.0.

## 2026-07-23 — In-app guide + salil approved (v3.9.0)

- Hrishi: "make a document to understand the app and add it [to the] app."
  Added a bilingual in-app guide: new `js/help.js` (window.HELP — 10
  sections: what it is, login/register, roles, home tiles, entry flow,
  cash/UPI/dues, handover, ledger/reports, admin panel, sync/backup/lang),
  a `renderHelp()` screen (backBar → settings), and a Settings button
  "📖 App guide / Help". Content respects the bn/en toggle. Also mirrored
  to docs/user-guide/app-guide.md.
- The guide explicitly covers what confused Hrishi: the admin panel needs
  "🔄 Refresh" after a new registration, and one-account-one-phone (login
  elsewhere logs the old device out).
- Operational: diagnosed "can't see approval" — user `salil` (সলিল কুমার
  সাহা) had registered and was pending on the server; the panel just
  needed refresh (and Hrishi's phone token had rotated). Approved salil
  for 2026 via the admin API with Hrishi's token.
- Verified in browser: Settings → guide → 10 sections render, back works,
  en/bn toggle switches the content. sw → chanda-v3.9.0. 71 tests pass;
  help.js + app.js node --check clean.

## 2026-07-23 — Fix-list #1: reconciliation self-check (data-integrity)

- New role (data-integrity auditor). Added `Aggregate.reconcile(data)`:
  asserts the money invariant **Σ (cash in hand) = total collected −
  total expenses** (handovers net out internally), and flags structural
  anomalies that cause disputes: orphan_payment (party gone), overpaid
  (paid > pledged), negative_inhand (handed over more than held),
  duplicate_id (double-count). Returns {totals, balanced, anomalies}.
- Pure logic, shared module — not yet wired to UI (a future admin
  "reconciliation dashboard" step will surface it on central data). Its
  immediate value: a safety net to verify later fixes (edit/void, etc.)
  never break the money math.
- Tests: 82 passed, 0 failed (11 new — clean books balance + each anomaly
  caught). sw → chanda-v3.10.0.
- Working the fix-list one item at a time; next up: #2 timezone (IST) date.

## 2026-07-23 — Fix-list #2: IST date (timezone bug)

- `todayISO()` used `new Date().toISOString()` = UTC, so an entry made
  between midnight and 5:30am IST got stamped with the previous day
  (wrong daily-report bucket + date). Now computes the IST (UTC+5:30)
  calendar date, independent of device timezone. India-only app, so the
  offset is fixed.
- Verified (node, deterministic): IST 2am Jul-24 → was Jul-23, now Jul-24;
  9pm and 11:59pm cases unchanged. 82 tests pass. sw → chanda-v3.11.0.
- createdAt stays a full UTC timestamp (absolute instant, standard).
- Next: #3 edit/void entries with audit trail.

## 2026-07-23 — Fix-list #3: void (correct) a payment, audit-preserving

- Wrong entries could never be corrected (append-only). Design: keep the
  original for audit; add a new **`voids`** store/sheet whose rows point at
  a targetId (migration-safe — a new sheet, like handovers was; existing
  columns untouched). Aggregation drops voided ids everywhere.
- Client: IndexedDB v3 (+voids store); `Aggregate` gained `activeData()` and
  filters voids in computeTotals/inHandRows/personalSummary/reconcile/
  duesList. Party detail now shows a `✖️ বাতিল` button per payment →
  reason screen → writes a void record (syncs like any entry); voided rows
  render struck-through with the reason and stop counting toward paid/due.
- Server (Code.gs): SHEETS.voids + SHEET_TITLES.voids; `activeData_()`
  mirrors the client and is applied in computeReport_ + personalSummary_.
- Verified live in browser: party paid 300+999(wrong) → void the 999 with
  a reason → paid 300 / due 700, wrong row struck-through, and the #1
  reconcile check confirms balanced + zero anomalies (the earlier
  "overpaid" anomaly cleared). Tests: 90 passed, 0 failed (8 new void
  cases). sw → chanda-v3.12.0.
- ⚠️ NEEDS Hrishi to redeploy Code.gs + run setup() (creates the Voids
  sheet) — until then voids work on-device but don't sync centrally
  (push skips unknown stores). Path handed off in chat.
- Scope: payments only for now; voiding daily/expense needs a per-entry
  browse screen (later). Next: #4 name→id collector identity.

## 2026-07-23 — Fix-list #4: collector identity by username, not name

- Aggregation keyed collectors by the display NAME, so two people sharing a
  name merged, and handover 'to' (free-text) was typo-fragile. Now every
  record carries `collectorId` (username) beside `collector` (name), and
  handovers carry `fromId`/`toId`. All aggregation keys by
  `collectorId || collector` (stable) and shows the name — `ck()` in
  aggregate.js, `ck_()` in Code.gs. Fully backward-compatible: legacy rows
  (name only) fall back to name-keying.
- Client: auth.js stores collectorUsername on login; db.js newRow stamps
  collectorId; inHandRows/personalSummary/renderHome scope by id; handover
  flow picks a cashier by username (label = name), stores to/toId, and
  normalises both old ([name]) and new ([{username,name}]) `cashiers`
  shapes so it works before AND after the server redeploy.
- Server (Code.gs): SHEETS gained collectorId (+ handovers fromId/toId),
  APPENDED at the end so setup()'s new schema-migration (auto-adds missing
  header columns) keeps push's position-based writes aligned. push stamps
  collectorId; cashiers returns {username,name}; pendingHandovers +
  personalSummary_ + inHandRows_ + collectors report all key by id.
- Verified: 99 tests pass (9 new — two same-name collectors stay separate,
  handover matched by toId, personalSummary scoped by username, legacy
  fallback). Browser: session→collectorUsername, newRow→collectorId,
  handover fromId/toId, My-summary scoped to salil (other username sees 0),
  in-hand keyed by id but shows the Bengali name, reconcile balanced.
  sw → chanda-v3.13.0.
- ⚠️ Redeploy now covers #3+#4: paste new Code.gs, run setup() (auto-adds
  the new columns + Voids sheet — no manual sheet deletion), redeploy.
  Next: #5 server-side logout / token invalidation.

## 2026-07-23 — In-app notifications + fix a v3.13.0 home crash

- ⚠️ First fixed a regression I shipped in v3.13.0: renderHome still had
  `esc(me)` after #4 renamed `me`→`meId`, so `me` was undefined →
  ReferenceError → the home screen broke. Now uses the display name.
- Notifications (Telegram deferred; real Web Push needs infra the Apps
  Script backend can't provide, so this is in-app + optional OS
  notification):
  - Server: light `notifications` action → {handovers: pending confirms
    addressed to me (cashier/admin), approvals: pending users (admin)}.
  - Client: a home banner lists actionable items (tap → cashier / admin),
    polled every 60s while visible + on window focus + on home render;
    when a count rises, a toast + (if permission granted) an OS
    Notification fire. Settings gains a "🔔 Enable alerts" button that
    requests Notification permission.
- Verified live (browser, mocked endpoint): home renders (crash gone);
  banner shows "2 জমা confirm করো" + "1 approve-এর অপেক্ষায়", each
  navigating to the right screen. 99 tests pass. sw → chanda-v3.14.0.
- Server-side `notifications` action needs the same batched Code.gs
  redeploy (#3+#4+this).

## 2026-07-23 — Fix-list #5: server-side logout (token invalidation)

- Logout only cleared localStorage; the token stayed valid in the sheet
  until the next login, so a leaked/old token kept working after "logout".
  New Code.gs `logout` action clears the caller's token server-side;
  Auth.logout() calls it best-effort (non-blocking, .catch) before wiping
  the local session — so logout still works offline / if the call fails.
- Verified live (browser, mocked): logout fires the server call with the
  token AND clears the local session (loggedIn → false) even on failure.
  99 tests pass. sw → chanda-v3.15.0. Needs the batched Code.gs redeploy.
- Next: #6 password policy (min length + hash iterations).

## 2026-07-23 — Fix-list #6: stronger password policy

- Min length 4 → 6 (client register check + server register/changePassword;
  i18n hints updated). resetPassword's 6-digit temp already qualifies.
- Password hashing key-stretched: new scheme `s2$` iterates SHA-256
  HASH_ITER (200) times so a leaked sheet is far slower to brute-force.
  Backward-compatible via `verifyPassword_` — legacy single-pass hashes
  still verify and are transparently upgraded to `s2$` on the next
  successful login (no user is locked out). Iteration kept modest (200)
  so GAS login latency stays low; tune HASH_ITER if needed.
- Verified: hash scheme ported to node — legacy + new both verify, wrong
  passwords rejected, upgrade path correct. Browser: register rejects a
  5-char password with "min 6". 99 tests pass. sw → chanda-v3.16.0.
  Needs the batched Code.gs redeploy.
- Next: #7 pull-to-refresh + focus-refresh + admin auto-refresh.

## 2026-07-23 — Fix-list #7: no manual refresh (focus + pull + auto)

- Returning to the app (visibilitychange→visible / window focus) or a
  pull-to-refresh (drag down >80px from the top) now re-renders the
  current data view — home/list/report/admin/cashier/party — so fresh
  data appears without a manual refresh. Skipped mid-entry (flowState).
- The 60s notification poll also auto-refreshes the current view when a
  count changes (e.g. the admin panel updates within a minute of a new
  registration, no "🔄 Refresh" tap needed), except on home (its banner
  updates in place).
- Client-only — no Code.gs change. Verified live: added a party straight
  to the DB while on the (stale) ledger, dispatched focus → the list
  auto-refreshed and showed it. 99 tests pass. sw → chanda-v3.17.0.
- Next: #8 import backup guard (confirm + validate).

## 2026-07-23 — Fix-list #8: import backup guard

- Import blindly parsed + bulk-put whatever JSON was chosen. Now it
  validates the file has a `data` object, keeps only known stores and rows
  that carry an id, and shows a confirm() with the counts
  ("2 parties, 1 payments") before merging — so a wrong file or another
  device's junk can't silently overwrite. Bad/empty files are rejected
  with a clear message; the file input resets so the same file can be
  retried.
- Client-only. Verified live: bad JSON → rejected (no confirm, no import);
  valid backup → confirm shown, imported; id-less rows → "nothing to
  import". 99 tests pass. sw → chanda-v3.18.0.
- Next: #9 data-loss guard (persistent storage + unsynced-clear warning).

## 2026-07-23 — Fix-list #9: data-loss guard

- Three protections for a money app whose unsynced entries live only
  on-device until they reach the sheet:
  1. `navigator.storage.persist()` on startup — asks the browser not to
     evict our IndexedDB under storage pressure.
  2. `beforeunload` warning when unsynced entries exist (unsyncedN mirrored
     synchronously from updateBadge) — the browser's "leave site?" prompt
     stops an accidental close/reload from stranding data.
  3. Duplicate-party warning: adding a party whose name already exists asks
     for confirmation first (a mis-tapped double entry inflates totals).
     The save-button catch no longer shows the misleading "amount zero"
     toast on a user cancel.
- Client-only. Verified live: persist API present; a duplicate "Dup Shop"
  is blocked on cancel (count stays 1) and added on confirm (count 2).
  99 tests pass. sw → chanda-v3.19.0.
- Next: #10 speed (debounce autoSync + report cache + optimistic UI).

## 2026-07-23 — Fix-list #10: speed (debounce sync + report cache)

- autoSync() debounced ~1s so a burst of entries (bulk-shop) coalesces
  into one push instead of a round-trip per save; retries the tail if a
  sync was mid-flight (fixes entries saved during an in-flight sync being
  stranded until the next trigger). Also syncs pending on app-return.
- Report + My-summary results cached client-side (per id/year); reopening
  a report shows the last figures instantly and refreshes in the
  background — masks the 1–3s Apps Script latency.
- Client-only. Verified live: reopening the overview report shows the
  cached ₹1,234 immediately (before the mocked server delay). 99 tests
  pass. sw → chanda-v3.20.0.
- ✅ Fix-list #1–#10 complete (+ notifications). Pending: the batched
  Code.gs redeploy (#3 voids, #4 identity, #5 logout, #6 password,
  notifications) + Hrishi clearing test data.

## 2026-07-24 — Master data step 1: admin-editable areas + locations (bilingual)

- Shop areas were a hardcoded enum; person/member had no area. Both are now
  admin-editable, bilingual (bn+en). New generic `Lists` sheet
  {id,kind,nameBn,nameEn,order} with kind area|location; Code.gs actions
  listItems (any user) + addItem/editItem/removeItem (admin). setup()
  creates Lists and seeds the 4 default areas with ids = the old enum
  values (backward-compatible with existing shop.side data).
- Client: new js/lists.js — fetches + caches lists in localStorage (SEED
  fallback offline), Lists.get(kind) / Lists.labelOf(kind,id) resolves the
  current-language label. Shop-side step + a new optional person/member
  location step read from Lists; list/party display resolve via
  Lists.labelOf. Admin panel gained bilingual add/edit(rename via prompt)/
  remove cards for areas and locations. parties sheet +location column
  (appended; setup migrates). Lists.refresh() on login + admin edits.
- Verified live (mocked backend): custom area "নতুন বাজার/New Market"
  shows in the shop-side chips and admin card with ✏️/🗑️; person flow
  shows a location step; bilingual labels resolve bn/en. 99 tests pass.
  sw → chanda-v3.21.0. Adds to the batched Code.gs redeploy.
- Next: expense-subject edit + the correction system (void all types +
  the cashier/admin permission rule + flag/request).

## 2026-07-24 — Master data step 1b: expense-subject edit (rename)

- Expense subjects had add/remove only; admin can now rename one too
  (Code.gs editSubject action; admin card shows each subject as a row with
  ✏️ Edit (prompt) + 🗑️ delete, matching the areas/locations cards).
  Completes admin-editable master data. sw → chanda-v3.22.0. 99 tests pass.
  Adds to the batched redeploy.

## 2026-07-24 — Correction system step 2a: void permission rule (separation of duties)

- Hrishi's rule: a regular collector's entry can be voided by a cashier or
  admin (not the collector); a cashier's or admin's own entry only by an
  admin; nobody voids their own (admin excepted). Anti-fraud by design.
- Enforcing it needs each entry to carry its creator's role (a cashier has
  no listUsers). auth.js stores collectorRole on login; db.js newRow stamps
  it; SHEETS gained a collectorRole column on parties/payments/daily/
  expenses/handovers (appended; setup migrates). New `canVoid(entry)` gates
  the void button.
- Verified live: on a party with 3 payments (by a collector, self-cashier,
  another cashier) — cashier sees 1 void button (the collector's only),
  admin sees 3, a regular collector sees 0. 99 tests pass.
  sw → chanda-v3.23.0. Adds to the batched redeploy.
- Still to do in step 2: void for daily/expense (needs an entry-browse
  screen), handover cancel(pending)/dispute + admin void, and the
  flag/request workflow for collectors.

## 2026-07-24 — Backend redeployed (new deployment URL)

- The old /exec deployment stubbornly kept serving pre-session code even
  after "Manage deployments → New version" attempts; verified via probes
  (listItems/notifications → "unknown action", no Voids/Lists in dump)
  even with cache-busting. The Sheet, though, had the Voids + Lists tabs
  with the 4 seeded areas — so the code WAS pasted/saved and setup() ran;
  only that deployment wouldn't repoint.
- Fix: Hrishi created a fresh Web-app deployment; its new URL runs the
  current code (listItems returns the 4 bilingual areas; token still valid
  since both deployments bind the same Sheet). Baked the new URL into
  js/config.js and pushed. sw → chanda-v3.24.0.
- Next: live-verify all server-side changes against the new deployment.

## 2026-07-24 — All server-side changes verified live (new deployment)

- Against the new /exec: master-list add/edit/remove (net-zero, area count
  back to 4), notifications, register min-6 reject, push persisting
  collectorId/collectorRole/location columns (schema auto-migration works),
  a void excluding a payment from the collectors report, and server logout
  killing the token (which also rotated the token shared in chat). All ✅.

## 2026-07-24 — Correction step 2b: "My entries" + void-all-types + flag

- New "✏️ My entries" screen (home tile) lists the device's own payments/
  daily/expenses/handovers. Each entry: ✖️ Void if canVoid (admin own /
  cashier-admin on a collector's — via the permission rule), else ⚠️ Flag
  (a collector can't self-void). renderVoidReason generalised to any store
  (void now works for daily/expense/handover, not just payments); new
  renderFlag writes a `corrections` record {targetStore,targetId,summary,
  reason,status:pending}. IndexedDB v4 (+corrections); Code.gs SHEETS
  +corrections (+collectorId appended to voids). entrySummary() one-liner.
- Verified live (browser): a collector sees 3 flag buttons (no void),
  flagging the road daily creates a pending correction with the summary +
  reason and marks the row "flagged — pending"; an admin sees a void button
  on their own daily and voiding it writes a void record. 99 tests pass.
  sw → chanda-v3.25.0.
- ⚠️ Needs another Code.gs redeploy (+Corrections sheet, run setup) for
  flags/voids to sync centrally — batching with 2c (the cashier/admin
  review screen: approve→void / reject, + notification count). Until then
  corrections work on-device.

## 2026-07-24 — Correction step 2c: cashier/admin review of flags (loop closed)

- Code.gs: pendingCorrections (cashier/admin → pending flags) and
  resolveCorrection {id, decision} → approve creates the void + marks the
  flag approved, reject marks it rejected; permission enforced server-side
  (a cashier may resolve only a regular collector's flag via
  targetCollectorRole_, admin any). notifications now also returns a
  pending-corrections count for cashier/admin.
- Client: renderReviewCorrections screen (home "🛠️ Review fixes" tile +
  a notification-banner item) lists each flag (summary • who • reason) with
  ✅ Void it / 🚫 Reject. Fixed a real bug: the resolve payload used an
  `action` key that collided with Auth.call's API-action field — renamed to
  `decision`.
- Verified live (browser, mocked): cashier sees "1 সংশোধন দেখো" banner +
  review tile; the flag shows with approve/reject; approve calls
  resolveCorrection{decision:'approve'} and the list refreshes empty.
  99 tests pass. sw → chanda-v3.26.0.
- Correction system COMPLETE: void-all-types + permission rule + flag
  (collector) → review (cashier/admin) approve/reject. ⚠️ Needs one Code.gs
  redeploy (+Corrections sheet via setup) for central sync of flags/voids.

## 2026-07-24 — Master lists refresh more often (near-instant to all users)

- Lists.refresh() previously ran only on login + the admin's own edits, so
  a logged-in collector kept a stale areas/locations dropdown until
  re-login. Now it also refreshes on app-return (onAppFocus) and every 60s
  (with the notification poll). So an admin's add/edit/remove reaches every
  device on their next return-to-app or within ~60s (and entry forms read
  the freshly-refreshed cache). True push-instant isn't feasible on the
  Apps Script backend. sw → chanda-v3.27.0. 99 tests pass. Client-only.

## 2026-07-24 — Backend redeployed again (corrections) → new URL

- The corrections Code.gs wouldn't repoint the existing deployment ("New
  version" keeps failing for this project); a fresh Web-app deployment
  carries the new code (pendingCorrections/resolveCorrection → "no-token",
  recognised). Baked the new /exec URL into js/config.js and pushed.
  sw → chanda-v3.28.0. (Recurring: for this account "New deployment" works,
  "New version on existing" doesn't.)

## 2026-07-24 — Areas fresh at entry time (new-entry form refreshes lists first)

- Hrishi: an admin-added area wasn't visible to other users instantly.
  Lists.refresh() was verified working (it fetched the new area), but it
  only ran on login/focus/60s — so a collector could open a shop form
  with an up-to-60s-stale dropdown. Now tapping 🏪/🙍/🤝/bulk refreshes the
  lists first (Promise.race with a 1.5s cap so a slow network never blocks
  the form), then opens the flow — so a just-added area shows the moment
  someone starts a new entry.
- Verified live (mocked): cache had 1 area; tapping shop refreshed and the
  area step showed the newly-added "বাস স্ট্যান্ড". List/report labels still
  refresh on focus/60s. Truly push-instant (no user action) needs a push
  backend Apps Script can't provide. sw → chanda-v3.29.0. 99 tests pass.
  Client-only.

## 2026-07-24 — Phone Back button works + summary edit hint

- Hrishi: "all back not working" + "no edit option, directly save/cancel".
  The in-app back buttons worked, but the app never pushed browser history,
  so the PHONE/gesture Back button left the app instead of stepping back —
  that's the real "back not working". Integrated the History API:
  navigate() and startFlow() pushState; a popstate listener steps back to
  the previous view (and cancels an in-progress entry to home). Verified
  live: party→(back)→list→(back)→home; Back mid-flow cancels to home.
- Edit: the guided-entry summary already lets you tap any field row (✏️) to
  fix it — verified working. Added an "✏️ Tap any line to edit it" hint so
  it's discoverable. Editing a *saved* ledger entry stays void-and-re-enter
  by design (audit trail).
- sw → chanda-v3.30.0. 99 tests pass. Client-only.

## 2026-07-24 — Fix: in-flow Back landed on a hidden step (toto/road)

- Hrishi: in the toto flow, Back showed "bus name". goBack()'s skip loop
  used `while (i > 0 ...)`, so it stopped AT step 0 even when step 0 was a
  hidden step (bus name/number are showIf bus). Toto/road hide those, so
  Back from the pay-mode step landed on the hidden bus-name step and
  rendered its question. Fixed: skip hidden steps with `i >= 0`, and if no
  visible earlier step remains, leave the flow (→ home).
- Verified live: toto Back → home (bus-name gone); bus Back still steps
  busNumber → busName. sw → chanda-v3.31.0. 99 tests pass. Client-only.

## 2026-07-24 — Any collector can pay any party (cross-collector installments)

- Hrishi: donor A entered by one collector pays a later installment to a
  DIFFERENT collector — who couldn't find A's party (the ledger is
  device-local, sync is push-only). New Code.gs `parties` action (any
  approved user) returns all parties + paid for the year. Client: a
  "🔍 Anyone's donor — take a payment" button on the ledger opens a search
  (renderFindParty) over the central party list; tapping one opens the
  normal payment flow. The payment keys by that partyId (so it clears the
  right balance) but stamps the CURRENT collector (so the cash counts in
  their hand) — the data model already supported this; only discovery was
  missing.
- Verified live (mocked): collector Ram searches, finds Salil's "কমল স্টোর্স"
  (due 600), pays 600 → payment saved with partyId=A's, collector=Ram.
  sw → chanda-v3.32.0. 99 tests pass. ⚠️ Needs a Code.gs redeploy (+`parties`
  action) — Code-gs-copy.txt refreshed.

## 2026-07-24 — Tests: cross-collector installment split (confirmation)

- Confirmed (Hrishi's scenario) the model already splits correctly when
  two collectors pay one party: Salil 400 + Ram 600 → party paid 1000/due
  0, Salil in-hand 400, Ram in-hand 600; and full case (Salil enters only,
  Ram collects 1000) → Ram 1000, Salil 0. Each hands over their own
  portion. Added as regression tests. 105 passed, 0 failed. No code change.

## 2026-07-24 — Party statement: correct totals + per-collector breakdown

- Hrishi wanted one clean entry per party showing who collected (max ~3),
  "data not mixed". Kept the append-only payments model (concurrency-safe,
  audit) and solved it as a VIEW. Also fixed a real bug: party detail
  summed only the DEVICE's own payments, so a multi-collector party showed
  the wrong paid/due on each device.
- New Code.gs `partyPayments` action (any user) → a party's all-collector
  payments (id/amount/collector/collectorId/collectorRole/date) + info.
  renderParty now draws the device-local view first (offline), then fetches
  central and redraws with the true total paid/due, a "🧑 Who collected"
  breakdown (per collector), and the full all-collector history (with
  void buttons where permitted). drawParty() extracted.
- Verified live (mocked): Salil's device shows কমল স্টোর্স paid 1000/due 0
  (not just his 400), breakdown Ram 600 + Salil 400, full history.
  105 tests pass. sw → chanda-v3.33.0. ⚠️ Needs the batched Code.gs redeploy
  (+`parties` +`partyPayments`) — Code-gs-copy.txt refreshed.

## 2026-07-24 — Ledger paid/due also uses central (all-collector) totals

- Audit after the party-statement work: the ledger (renderList) still summed
  only the DEVICE's own payments (Aggregate.computeTotals local), so a
  multi-collector party showed wrong paid/due there too. Split renderList
  into an orchestrator + drawList(data, paidBy): draws local first, then
  fetches the `parties` action and redraws with central paid; search/filter
  reuse the cached central map (renderList(true)) to avoid refetching.
- Confirmed the two questions are cleanly separated everywhere now:
  party balance (all-collector) — ledger, party detail, find-party, dues/
  overview reports — all central; collector attribution (who collected/
  holds) — my-summary, in-hand, collectors report, home "my today",
  party "who collected" — all by collector. No mixing.
- Verified live (mocked): Salil's ledger shows কমল স্টোর্স 1000/1000 (not his
  400). 105 tests pass. sw → chanda-v3.34.0. Uses the `parties` action from
  the pending redeploy.

## v3.35.0 — Pull-down sync (one snapshot, instant local render)

- **Backend**: replaced per-screen `parties`/`partyPayments` actions with a
  single `pull` action returning the whole year dataset (`readAll_`).
- **Client**: `pullCentral()` caches the snapshot in `localStorage.ck_central`;
  `viewData()` merges central rows with the device's own unsynced rows (own row
  wins by id). `renderList`/`renderFindParty`/`renderParty` now render instantly
  from the local snapshot — no per-screen network round-trip.
- Snapshot refreshes on login, window focus, after every push, and every 60s.
- **Why**: each `Auth.call` was a ~1–3s network round-trip; indexes cut server
  compute but not the round-trip. Fewer calls (one pull) is the real win, and
  screens paint immediately from cache while offline.
- Verified live-mock: Ram's party appears on Salil's device via the snapshot,
  balance 1000/1000, per-collector breakdown ₹600 (Ram) + ₹400 (Salil), party
  detail opens with zero network fetch. 105 unit tests pass.
- **Redeploy needed**: `pull` replaces `parties`/`partyPayments` — Hrishi must
  redeploy Code.gs (New deployment → new URL → rebake config.js).

## config.js — rebaked SCRIPT_URL for the pull-down deployment (AKfycbwY…)

- New Apps Script deployment carries the `pull` action; probed live from a
  browser origin → `{"ok":false,"error":"bad-token"}` (action reached
  requireUser_, so `pull` is deployed — not "unknown action").

## v3.36.0 — Fix find-party "blinking" during background pull

- `pullCentral()` was calling full `render()` for the findparty view on every
  60s tick / focus / post-push. `renderFindParty()` rebuilds the whole shell:
  it recreates the `#fp-search` input (stealing focus) and resets `#fp-results`
  to the "loading" placeholder before the async fill → a visible blink while
  the user was searching.
- Split `renderFindParty()` into shell-build + `refreshFindParty()` (data +
  results only, no shell rebuild). Background pull now refreshes findparty in
  place — the `#fp-results` swap never touches the search box.
- Same-class guard for other screens (list/party/report fully rebuild their DOM
  incl. the search box): background pull skips the re-render while an INPUT/
  TEXTAREA is focused, so typing in the khata search isn't interrupted either.
- Verified live: focus + typed value retained through a background pull, no
  loading flash, filter still correct. 105 tests pass.

## v3.37.0 — Reports render from the pull snapshot (one aggregation path)

- Reports were the last screens still doing per-view server calls
  (`reportList` / `report` / `myReport`). Now they compute client-side from
  the local pull snapshot (`viewData()`), same as khata/party/find.
- `Aggregate.js`: added `computeReport(id, data)` + `allowedReports(user)` —
  exact mirrors of Code.gs `computeReport_` / `allowedReports_`. Report payload
  shapes are identical, so `reportHTML()` renders them unchanged.
- `app.js`: `renderReport` shows the permission-gated picker locally (no
  round-trip); `loadMySummary` uses `Aggregate.personalSummary`; `loadReport`
  uses `Aggregate.computeReport`. Dropped the now-dead `reportCache` /
  `mySummaryCache`.
- Verified live against the backend: overview/dues/inhand/collectors/expenses
  are byte-identical server vs client; `daily` matched on every value and
  differed only in date *format* (Sheet stores day-cells as Dates → pull
  serialises them as UTC ISO).
- Added `fmtDate()` and applied it to every date display (daily/expenses
  reports, party history, my-entries, handovers) so a Sheet-round-tripped ISO
  ("2026-07-23T18:30Z") renders as its IST day ("2026-07-24") instead of a raw
  timestamp. Fixes a display regression the snapshot path would otherwise show.
- Code.gs unchanged (server report actions kept as-is) → no redeploy needed.
  105 tests pass.

## v3.38.0 — List scroll: top on navigate, preserve on background refresh

- `navigate()` now `window.scrollTo(0, 0)` — a user navigation (tab switch,
  opening a party, drill-in) starts at the top of the new screen instead of
  keeping the previous screen's scroll offset.
- Background pull re-renders (`pullCentral` / focus / 60s) go through `render()`
  directly, NOT `navigate()`, so they keep the current scroll position — the
  list no longer jumps to the top under the user while a refresh lands.
- Back (popstate) relies on the browser's native scroll restoration, returning
  the user to where they were on the previous screen.
- Verified live: scrolled list preserved through a background pull (1200→1200),
  navigate-to-party landed at top (0), Back restored to prior position (1200).

## v3.39.0 — Incremental pull (delta sync): 60s polls carry only changed rows

- The `pull` action now supports a `since` cursor. No `since` → full snapshot
  (first login / cache miss). With `since` → only rows whose receivedAt is newer
  than the cursor. Idle polls return an empty delta, so 60s polling stays cheap
  regardless of total row count (the peak-season concern).
- `cursor` is epoch-ms of the newest receivedAt (`toEpoch_`/`maxReceivedAt_`),
  robust whether the Sheet stored receivedAt as an ISO string or a Date cell.
- In-place status changes now bump receivedAt so the delta carries them:
  `confirmHandover` (affects in-hand) and `resolveCorrection`. push already
  stamps receivedAt on every insert/update; the approve-void is a new row.
- Client (`app.js`): `centralCursor` + `centralYear` persisted alongside
  `ck_central`; `mergeDelta()` upserts changed rows by id (no hard deletes, so
  merge-only is correct). Switching year forces a full pull (never merge one
  year's delta into another). Idle empty delta → no re-render (also kills the
  needless 60s findparty refresh). Logout clears the snapshot + cursor.
- Verified live-mock (full → delta-merge → idle → year-change → back) and the
  server epoch helpers in Node. 105 tests pass.
- **Requires Code.gs redeploy** (pull `since` + receivedAt bumps are new).

## v3.40.0 — Role gap: in-app admin grant + collector↔area assignment

Roadmap step 1 of the remaining work ("go one by one").

- **Admin grant/revoke in-app** (was editor-only `makeAdmin`). New `setRole`
  action, admin-only, with safeguards: you can't demote yourself, and the last
  remaining admin can't be demoted (`countAdmins_`) — the committee can never
  lock itself out. Admin panel: a 👑 make/remove-admin chip per approved user;
  the `err_cant_demote_self` / `err_last_admin` messages surface as toasts.
- **Collector↔area assignment**. New `areas` column on Users (append-only;
  setup() now migrates the Users header too), `setAreas` action, and
  `publicUser_` returns `areas`. Admin panel shows an "📍 এলাকার দায়িত্ব" chip
  row per collector (from the area master list); toggling calls setAreas. This
  is the base for area-based reports / leaderboard (later steps).
- `confirmHandover`/`resolveCorrection` receivedAt bumps and the delta pull are
  unchanged here; all of it ships in the same pending Code.gs redeploy.
- Verified live-mock: chips render from u.areas, self shows remove-admin + no
  area chips, setAreas/setRole send the right payloads, last-admin toast maps.
  105 tests pass. **Requires the pending Code.gs redeploy.**

## v3.41.0 — Area-wise report / leaderboard (📍 এলাকা-ভিত্তিক)

Roadmap step 2 (client-only, no redeploy needed to work).

- New `areas` report: groups parties by `side` (the shop area, from the master
  list), showing per-area count / pledged / paid / due, ranked by collected
  (leaderboard 🥇🥈🥉). person/member parties (no side) fall under "এলাকা ছাড়া".
- Computed client-side in `Aggregate.computeReport('areas')` from the pull
  snapshot; `reportAreasHTML` renders it; area labels via `Lists.labelOf`.
  Added to REPORT_IDS (so it appears in the picker + admin report permissions).
- Mirrored `computeReport_('areas')` + REPORT_IDS in Code.gs to keep the two
  aggregation definitions identical (rides the pending redeploy; client already
  works without it since reports compute locally).
- Verified live: 4 parties across 2 areas + no-area → totals ₹3,000, ranked
  হরিরামপুর ₹1,500/₹2,000 · মালদা ₹1,300/₹2,000 (2 parties) · এলাকা ছাড়া
  ₹200/₹500, all figures correct. 105 tests pass.

## v3.42.0 — Audit / activity log (📜 কার্যকলাপ)

Roadmap step 3 — accountability for a money app: who did what, when.

- Append-only `Audit` sheet (`id, ts, actor, actorId, action, detail`), seeded
  in setup(). `logAudit_(actorRow, action, detail)` — fully try/catch-wrapped so
  logging can never break the real action.
- Instrumented every privileged/money action: void (on new push of a void row),
  correction approve/reject, handover confirm, admin grant/revoke, cashier
  on/off, status approve/block, report perms, area assignment, password reset,
  and master-list add/edit/remove (areas/locations/subjects).
- `auditLog` action (admin-only) returns the newest ~150 entries.
- Client: admin panel → "📜 কার্যকলাপ" opens `renderAuditLog`; `auditLabel()`
  maps action codes to bilingual labels; `fmtDateTime()` shows IST day+time.
  Non-admins are bounced to home.
- Verified live-mock: log renders newest-first with mapped labels, actor and
  correct IST timestamps (09:30Z→15:00); collector blocked from the view.
  105 tests pass. Ships in the same pending Code.gs redeploy.

## v3.43.0 — Rich notification feed (detail + inline actions)

Roadmap step 4 — the banner was count-only; now it's an actionable feed.

- `notifications` action now returns `items` alongside the counts:
  approvals [{userId,name,username}], handovers [{id,from,amount,date}],
  corrections [{id,targetStore,targetId,reason,by,date}] — same data it already
  read, just surfaced.
- Banner (`renderNotifBanner`) renders one card per pending item with who/
  amount/date and inline buttons:
    · approval → ✅ Approve · 🚫 Decline · 👁 View(→admin)
    · handover → ✅ Received (confirmHandover) · 👁 View(→cashier)
    · correction → 👁 Review(→review screen, where the void-permission UI lives)
  Actions call the server then refresh the feed + current view. Falls back to
  the old count chips if a server returns no `items` (older backend).
- Verified live-mock: all three item types render with correct buttons;
  clicking Approve fires setStatus{approved} and the row drops from the feed on
  refresh. 105 tests pass. Ships in the pending Code.gs redeploy.

## v3.44.0 — Dues follow-up: WhatsApp reminder (📞 মনে করাও)

Roadmap D5 (client-only, no redeploy).

- Party detail shows a "📞 মনে করাও (WhatsApp)" button only when the party has
  a phone AND an outstanding due. It opens wa.me with a pre-filled bilingual
  reminder (name + due amount); the collector still taps send themselves — never
  auto-sent. 10-digit numbers default to +91.
- Verified live: due+phone party shows the button and builds
  wa.me/919998887776?text=… with the name and ₹600 due; a fully-paid party and
  a phone-less party show no button. 105 tests pass.

## v3.45.0 — Donation receipt (🧾 → WhatsApp / download)

Roadmap D2 (client-only, no redeploy).

- Each non-voided payment row in party detail gets a 🧾 button. It draws a
  receipt onto a canvas (committee header, donor, date, this payment, running
  paid/pledged/due, collector, thank-you) and shares the PNG via the Web Share
  API (WhatsApp etc. on mobile) or downloads it as a fallback. Fully on-device.
- Verified live: PNG generated (~49KB image/png); visual check confirms the
  Bengali receipt renders correctly with all fields (₹400 this payment,
  ₹400/₹1,000 paid, ₹600 due, collector Ram). 105 tests pass.

## v3.46.0 — Year rollover (🔄 carry donors to a new year)

Roadmap D4.

- `rolloverYear` action (admin-only): copies the party master from `fromYear`
  into `toYear` with fresh ids, zeroed history (no payments carried), pledges
  kept as the new year's starting ask. Refuses if the target year already has
  parties (never double-runs); audit-logged.
- Admin panel: "🔄 নতুন বছরে দাতা আনো" button → confirm (from→to = current
  year+1) → rolloverYear → shows the count added.
- Verified live-mock: button present, click sends rolloverYear{2026→2027},
  done alert "2027 সালে 42 জন দাতা যোগ হলো". err_year_has_data mapped.
  105 tests pass. Ships in the pending Code.gs redeploy.

## config.js — rebaked SCRIPT_URL for the full-feature deployment (AKfycbwm…)

- New Apps Script deployment carries every server change from this session.
  Probed live from a browser origin: `pull`, `auditLog`, `setRole` and
  `rolloverYear` all return `{"ok":false,"error":"bad-token"}` (they reached
  requireUser_/requireAdmin_), confirming the new code is deployed.
- One-time step for the owner: run `setup()` once in the Apps Script editor so
  the Users sheet gains the `areas` header and the Audit sheet is created with
  its header row. (logAudit_ self-creates Audit if missing, but setup() gives
  it the proper header.)
