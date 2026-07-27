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

## v3.47.0 — Docs catch-up: roadmap, context and the in-app guide

Honest gap: through the whole 2026-07-24 sprint only `build-log.md` was kept
current commit-by-commit. The roadmap, project context and user-facing guides
were still describing the 2026-07-23 state. Fixed here in one pass.

- `docs/pending.md` — new "P0.8 — v3 sprint" section marking the sync
  architecture (pull-down, delta, one aggregation path) and roadmap A/B/C/D1/D3
  done; P1 receipt + leaderboard + dues follow-up marked done; P2 year rollover
  marked built-but-not-yet-run; D6 (report export, photo attach) added as the
  remaining work; housekeeping items added (token rotation, run `setup()`,
  archive orphaned deployments).
- `docs/PROJECT_CONTEXT.md` — decisions table gains the pull-down snapshot,
  delta pull, single aggregation path, whole-year-on-device tradeoff, area
  assignment, admin-grant safeguards, audit log and the "structural enums stay
  hardcoded" rule; architecture section rewritten with the read/write paths and
  the full sheet list; new section explaining the two-dimensional
  (partyId × collectorId) model that makes cross-collector collection work.
- `js/help.js` — two new bilingual sections (🧾 receipts & dues reminders,
  🔔 actionable notifications); roles, reports and admin sections updated for
  area report, admin grant safeguards, area duties, activity log, rollover and
  the void/correction permission rule. 12 sections, all bn+en.
- `docs/user-guide/app-guide.md` + `collector-guide.md` — kept in sync with the
  in-app guide.
- Verified live: guide renders all new sections in Bengali AND English with no
  language leakage. 105 tests pass.

## Roadmap correction — daily/expense void status

`pending.md` claimed daily/expense void was "later". Verified in code:
`renderMyEntries` already covers payments/daily/expenses/handovers with
void-or-flag per the permission rule. The real remaining gap is narrower and
now tracked: there is no way to browse *someone else's* daily/expense entries,
so a cashier who spots another collector's wrong road/toto entry must ask that
collector to flag it. Party detail already covers payments for all collectors.

## v3.48.0 — Field-validation audit + fixes

Audited every input surface (entry flows, amount parser, auth). Findings:

**Solid already** — `NumParse.parseAmount` rejects negatives, junk, Infinity,
scientific notation, non-Bengali/Arabic digits, and accepts 0, decimals,
Bengali digits and words ("পাঁচশ"). Register validation is strong (name
required, username regex, password ≥6, confirm match, live hint). Payment /
handover / daily saves already guard `total > 0`.

**Bugs found + fixed:**
1. **Blank text fields sailed through.** `required` was checked on exactly one
   step (the "Other" expense comment); every other text field — including a
   party's **name** — accepted empty, saving an unsearchable blank row that
   also lands as an empty line in the Sheet. Now every text step is mandatory
   unless explicitly `optional`; blank submit shows "এটা খালি রাখা যাবে না".
2. **Owner made optional** (`newPartyFlow`) — a shop owner's name isn't always
   known, so it must not become mandatory under the new rule.
3. **Expense saves had no zero-guard** while payment/handover/daily did. Added
   `amount > 0` to both `expenseFlow` and `collectionExpenseFlow`.
4. **Fat-finger guard on amounts** — a stuck key turns ৫০০ into ৫০০০০০০ and
   silently skews every total. Amounts over ₹1,00,000 now ask
   "₹… — এত টাকা কি ঠিক?" before accepting.

Verified live in a cache-busted harness: blank name blocked with the toast,
real name advances, owner skippable, big amount prompts and can be declined.
105 tests pass.

## v3.49.0 — Indian mobile-number validation

- Phone was a free-text optional field — any junk was accepted, then the
  receipt/remind features prepend +91 to it. Added a step-level `validate` +
  `clean` hook to `submitAnswer` (runs only when a value was entered, so an
  optional field can still be skipped).
- `phoneErrIN` / `cleanPhoneIN`: strip spaces/dashes/brackets and an optional
  +91 / 91 / 0 prefix; require a 10-digit national number starting 6–9. Valid
  numbers are stored normalised to 10 digits, so the Sheet holds one format and
  the WhatsApp +91 prefix always resolves correctly.
- Applied to the party phone step and the register form (register also stores
  the cleaned number).
- Verified live: "12345" rejected with a toast; "+91 98765 43210" accepted and
  saved as "9876543210"; empty still skippable. node edge-case sweep covers
  +91/91/0/space/dash accepts and 5-prefix / wrong-length / Bengali-digit
  rejects. 105 tests pass.

## v3.50.0 — Browse & void everyone's daily/expense entries

Closed the last real gap: party detail already exposes every collector's
payments, but daily/expense entries were only reachable through each owner's
own "my entries" screen — so a cashier who spotted someone else's wrong
road/toto/bus or expense had to ask that person to flag it.

- The "my entries" screen gained a **Mine / Everyone's-daily-expense** toggle.
  "Everyone's" reads the central snapshot (viewData), lists all collectors'
  daily + expense entries newest-first, shows 🧑 who made each, and offers the
  same void-or-flag control per the separation-of-duties rule. Payments are
  deliberately excluded (the donor page covers them, and all payments together
  would be a wall).
- Reuses the existing void/flag flow untouched. `entriesScope` module state
  persists across the re-render after a void/flag.
- Verified live in a cache-busted harness as a cashier: sees Ram's & Yamini's
  entries with ✖️ Void and their own with ⚠️ Flag; voiding Ram's road entry
  wrote a void (daily/d1, by cashi) and the row flipped to "• voided" while the
  Everyone's scope held. In-app guide + app-guide updated. 105 tests pass.

## v3.51.0 — Real app icon (glowing OM + Ganesha)

- Replaced the placeholder "চাঁ" SVG with the committee's chosen icon: a glowing
  golden OM whose right side forms Ganesha's head/trunk, on a deep-indigo
  mandala field. High contrast (gold on dark) → legible at home-screen size.
- Source PNG (1024²) kept at icons/icon-src.png. Per Hrishi's instruction — no
  colour fill — the dark glow corners are the icon's own; the emblem was
  centre-cropped (sips, ~760/1024) to trim excess glow margin, then exported to
  icons/icon-192.png and icons/icon-512.png.
- manifest.webmanifest icons → the two PNGs (any + maskable). index.html
  rel=icon → 192, apple-touch-icon → 512. sw.js ASSETS updated + VERSION bump.
- Verified live: manifest valid, all four icon entries load at their declared
  sizes, link tags resolve.
- Note: already-installed phones keep the old icon until reinstall; new installs
  get this one.

## v3.52.0 — Show the icon inside the app (header + login)

Hrishi couldn't "see" the new icon because it only lived on the browser tab
and the home-screen install — nothing in the app body rendered it (the header
used a 🙏 emoji). Made the branding visible:

- Header: a small 26px rounded icon before the "চাঁদা খাতা" title (index.html).
- Login/welcome screen: the icon at 104px replaces the 🙏 big-emoji.
- Notification icon and the removed old icon.svg → icon-192.png; deleted the
  stale placeholder icon.svg.
- Verified live (cache-busted harness): both header and login logos load and
  render at their sizes.

## Receipt feature — Phase 1 (server): serials + config backend

Approach decided with Hrishi: ready layouts + branded fields (no raw HTML),
two share buttons (WhatsApp image / SMS text), year+sequence receipt numbers.
This phase is the server groundwork (needs one redeploy; not usable until the
client phases land).

- `payments` gains a `receiptNo` column (appended at END, migration-safe).
- `Config` key/value sheet (created in setup()) holds the receipt design
  (committee_name, receipt_footer, receipt_color, committee_logo, receipt_layout)
  and the per-year serial counter (receiptSeq_<year>).
- `nextReceiptNo_(year)` — read-increment-write under the lock push already
  holds, so serials never collide. Format "2026-0001" (widens past 9999).
- `push` stamps a serial on each NEW payment insert (once, idempotent) and now
  returns `receipts: {paymentId → serial}` so the client can adopt it locally
  (otherwise viewData's local-wins merge would hide the server value).
- `getConfig` (any approved user — needed to render receipts) / `setConfig`
  (admin, whitelisted keys) actions; counters are never exposed. `pull` now
  carries `config` so the design reaches every device with the snapshot.
- Code.gs syntax-checked; serial format unit-checked. Server-only — live
  verification after the redeploy. 105 client tests still pass.

## Receipt feature — Phase 2 (client): admin design screen + renderer

- `buildReceiptCanvas(rc, cfgOverride)` — config-driven receipt renderer with 3
  layouts (classic band / festive double-border / minimal rule), accent colour,
  optional logo, receipt number, and a shared field block. Async (logo load) →
  Promise<canvas>. `shareReceipt` now goes through it. Config comes from
  `centralConfig` (cached from pull; persisted to localStorage.ck_config).
- Admin panel → "🧾 রসিদ ডিজাইন" (`renderReceiptConfig`): layout chips, committee
  name, footer message, 5 accent-colour chips, logo upload, and a **live
  preview** that redraws on every change. Save → `setConfig`.
- `fitLogo()` validation: PNG/JPG only, ≤3MB, auto-downscaled to ≤128px and
  re-encoded (PNG→JPEG fallback) until the dataURL fits a Sheets cell
  (<45000 chars). Bad type/size/read → clear toast.
- Verified live (cache-busted harness): screen opens, 3 layouts + 5 colours,
  name/footer/layout/colour edits update the preview instantly, bad-type logo
  rejected + valid PNG accepted, save sends the right config. Classic AND
  festive layouts screenshot-checked (Bengali renders correctly). 105 tests pass.
- Still needs the redeploy for setConfig/getConfig to persist server-side.

## Receipt feature — Phase 3+4 (client): serial adoption + share screen

Completes the receipt feature (client side; the whole feature goes live after
the redeploy).

- **Serial adoption (Phase 3):** `Sync.syncNow` now reads `resp.receipts`
  {paymentId → serial} from push and writes each serial onto the local payment
  row (so viewData's local-wins merge shows the server number, not a blank).
- **Receipt screen (Phase 4):** the 🧾 button opens `renderReceiptShare`
  (partyId+payId) — a preview of the designed receipt plus two buttons:
  📷 WhatsApp/image (Web Share API with the PNG; download fallback) and
  💬 SMS/message (a short text receipt via `sms:…?body=`, phone defaulted to
  +91). If the payment has no serial yet, the screen syncs + pulls to fetch one,
  shows a "number appears once synced" note meanwhile, then repaints.
- Verified live (cache-busted harness): 🧾 → receipt preview + 2 buttons; a
  synced payment shows serial 2026-0007 (no pending note); WhatsApp fires
  navigator.share with receipt.png; SMS opens sms:+919998887776?body=… with the
  committee name, donor, ₹500, paid/due, receipt no. and footer; an UNSYNCED
  payment opened the screen, synced, and adopted serial 2026-0042 into the DB.
  Help/guide updated. 105 tests pass.

## Receipt redesign — authentic Bengali puja rasid + type-aware detailing

Feedback: the tabular receipt looked like a data readout, not a puja রসিদ.
Rebuilt it as a proper acknowledgement receipt.

- `buildReceiptCanvas` redesigned: invocation "ॐ শ্রীশ্রীসিদ্ধিদাতা গণেশায় নমঃ",
  committee name, "গণেশ পূজা <year> · প্রাপ্তি রসিদ", red serial, a prose
  acknowledgement ("… এর নিকট হইতে শ্রীশ্রীগণেশ পূজার চাঁদা বাবদ — ৳X/- (words
  টাকা মাত্র) সাদরে গৃহীত হইল।"), a totals strip, date + collector signature
  line, footer, and a festive double border with corner diamonds (minimal keeps
  a thin frame). Warm-paper background.
- `banglaNumWords()` — integer rupees → Bengali words (Indian grouping, to
  crores), unit-checked (500→পাঁচ শো, 151251→এক লক্ষ একান্ন হাজার দুই শো একান্ন).
- Type-aware donor line (Hrishi's spec): person/member → "শ্রী/শ্রীমতী <name>";
  shop → "শ্রী/শ্রীমতী <owner>, <shop name>"; bus → "<bus name> (নং <number>)"
  with no honorific and no totals (one-off).
- **Bus daily receipts:** daily bus entries now get a 🧾 in "my entries" →
  the same receipt screen. `daily` sheet gains a `receiptNo` column and push
  stamps a serial on new bus inserts (shared counter); sync adopts it for daily
  too; the receipt screen + SMS text handle the daily source generically.
- Verified live (harness): shop/person/bus receipts each render with the right
  subject line, words, serial, and totals-or-not. 105 tests pass. Server bits
  ride the pending redeploy.

## Receipt polish — spaces in the invocation + drop the currency glyph

Two bits of Hrishi feedback:
- "শ্রী শ্রী" now spaced — invocation "ॐ শ্রী শ্রী সিদ্ধিদাতা গণেশায় নমঃ" and the
  prose "শ্রী শ্রী গণেশ পূজার".
- The ₹/৳ currency icon looked bad on canvas → dropped it. Amounts render as
  Bengali-digit figures with "/-" (rcpMoney → toBengaliDigits + Indian
  grouping): the main amount "১,৫০০/-", the totals "প্রতিশ্রুত ২,০০০ · মোট জমা
  ১,৫০০ · বাকি ৫০০ টাকা", and the SMS text likewise. The words line
  ("… টাকা মাত্র") already carries the currency in Bengali.
- Verified live: shop + bus receipts render with spaced invocation and
  clean Bengali-digit amounts, no currency glyph. 105 tests pass.

## Receipt — ₹ back on the figures (Bengali digits)

Hrishi: ₹ is fine to use (it was the ৳ taka glyph that looked bad). `rcpMoney`
now prefixes ₹ to the Bengali-digit figure — "₹১,৫০০/-", totals "প্রতিশ্রুত
₹২,০০০ · মোট জমা ₹১,৫০০ · বাকি ₹৫০০"; dropped the now-redundant "টাকা" suffix.
Verified live. 105 tests pass.

## Receipt — puja name on top, committee as signatory, date+time, no collector

Hrishi's detailing:
- Top big name is now the **puja name** (`puja_name`, admin-maintained), not the
  committee. Subline "প্রাপ্তি রসিদ · বর্ষ <year>" (Bengali digits).
- Removed "আদায়কারী — <collector>". The bottom-right is now a signatory block:
  "ধন্যবাদান্তে," (t('receipt_thanking'), en "Thanking you,") + the **committee
  name** in accent.
- Date line now shows **date + time** (fmtDateTime, Bengali digits) from the
  entry's createdAt.
- Config gains `puja_name` (setConfig whitelist + admin form field); receiptConfig
  returns both puja (top) and committee (signatory); old configs fall back
  puja←committee. Removed collector from rc.
- Verified live: festive receipt shows puja on top, "ধন্যবাদান্তে, <committee>"
  bottom-right, "তারিখ ও সময়: ২০২৬-০৭-২৪ ১৪:৪২", no আদায়কারী. 105 tests pass.

## Training/Live mode + serial format 2026000001

Hrishi: serials must never duplicate (already true — server-side atomic counter
at push, assigned per entry save regardless of receipt); reformat, and add a
training mode with a clean go-live.

- **Serial format** → year + 6-digit, no separator, starting 000001:
  "2026000001" (was "2026-0001"). `nextReceiptNo_` updated.
- **Training mode** (default until admin goes live, `config.live_mode`):
  receipts get a diagonal "নমুনা · SAMPLE" watermark; a "প্রশিক্ষণ মোড" banner
  shows on home and the admin panel. `isLive()` reads centralConfig.
- **Go live** (`goLive`, admin, one-way, destructive): backs up to Drive
  (dailyBackup), clears every transactional sheet (parties/payments/daily/
  expenses/handovers/voids/corrections — keeps users, config, master lists),
  resets the serial counters, sets live_mode='on' + a new `data_epoch`, and
  audit-logs. The admin panel button is gated by 3 steps: confirm → type "LIVE"
  → final confirm.
- **Epoch wipe:** `pull` carries `data_epoch`; when a device sees a new epoch it
  runs `DB.clearAll()` and re-pulls fresh, so training entries never linger via
  viewData's local-wins merge on any device. New `DB.clearAll()`.
- Verified live (harness): training receipt shows the SAMPLE watermark + serial
  2026000007; home + admin show the training banner; go-live (3-step) called
  goLive, bumped the epoch, wiped the local DB (1→0 rows), flipped live_mode on,
  and landed on home. 105 tests pass. Server bits ride the redeploy.

## Serial digit-width — admin-configurable, confirmed at go-live

Hrishi: how many digits the serial has (the "000000" width) should be admin-set,
and asked before going live.

- Config `receipt_digits` (default 6, clamped 4–9). `nextReceiptNo_` pads to it:
  digits=4 → "20260001", digits=6 → "2026000001".
- Receipt-design screen: a digit-width chip row (৪/৫/৬/৭); the live preview's
  sample serial reflects the choice. setConfig whitelist includes receipt_digits.
- Go-live flow now asks the width: confirm → type LIVE → **digits prompt** →
  final confirm that shows the resulting sample (e.g. "2026000001"). `goLive`
  takes `digits`, clamps it, and stores it before resetting the counter.
- Verified live: digit chips render + select and drive the preview serial; a
  go-live with the prompt returning "5" sent goLive{digits:5} and config landed
  receipt_digits:"5", live_mode:"on". 105 tests pass. Rides the redeploy.

## config.js — rebaked SCRIPT_URL for the receipt/training deployment (AKfycbzZ…)

New Apps Script deployment carries the receipt + training/live batch. Probed
live: getConfig ok (Config sheet present), pull carries config + cursor,
goLive deployed (bad-token → reached requireAdmin_, did not run). Baked the URL.

## Training banner — persistent strip on every screen

Hrishi wanted the training indicator visible everywhere, clearly. Replaced the
home-only card with a persistent amber strip (`#training-bar`) that lives
outside `#view` (in index.html, under the header), so no re-render can drop it.
`updateTrainingBar()` shows a bold full-width "🟡 প্রশিক্ষণ মোড — …" bar on every
screen while in training, and hides it once live; called from render() and after
each pull (so it disappears the moment the admin goes live). Removed the
redundant home card. Verified live: bar shows on home/khata/report/settings and
auto-hides when live_mode flips on. 105 tests pass.

## Puja name stands in for the app title everywhere it shows

Hrishi: wherever "চাঁদা খাতা" appears it should be the admin-set puja name.
Added `pujaName()` = centralConfig.puja_name || t('app_title'), and used it for
the header title, the login/welcome heading, the home hero, and the OS
notification title. `updateTrainingBar()` refreshes the header title too, so it
follows the puja name the moment config arrives (login, pull). Falls back to
"চাঁদা খাতা" until an admin sets the puja name. The static PWA name (manifest /
<title>) stays as the app's install identity. Verified live: header and login
both render "🙏 সিংহদহ সর্বজনীন গণেশ পূজা" from config. 105 tests pass.

## Enforce one account = one active device

The server already keeps a single token per user (login overwrites it), so a
new-device login invalidates the old device's token. The gap was on the client:
being offline-first, the old device kept running on its cached session and just
failed to sync silently — so two people could use one account.

- `Auth.call`: when an authenticated call (payload has a token) comes back with
  `bad-token` or `blocked`, it now clears the local session
  (ck_token/ck_user) and dispatches a `ck-auth-invalid` event.
- `app.js`: a listener bounces the device to the login screen with a toast
  ("অন্য একটি ফোনে এই account-এ login হয়েছে — আবার login করো"); guarded so a
  burst of failing calls only kicks once. Unsynced local entries are kept and
  sync once the rightful user logs back in.
- So the moment someone logs in on a second phone, the first is kicked on its
  next server call (≤60s via the poll, or immediately on focus/sync).
- Verified live (harness): with the token invalidated, a focus-triggered pull
  cleared the session and landed on the login screen with the message. 105
  tests pass. No server change — the single-token backend already exists.

## Admin can release a stuck user session

Safety valve for the one-device rule: `releaseSession` action (admin) clears a
user's token (`u.row.token = ''`), so a stuck device is kicked (bad-token → the
login bounce) and the user can log in fresh. Audit-logged as session:release.
Admin panel: a "🔓 সেশন ছাড়ো" chip per approved user, behind a confirm.
Verified live-mock: button present, sends releaseSession{userId}, success toast.
Needs a redeploy (new server action). 105 tests pass.

## Role-based screens — per-user entry permissions + a cleaner home (step 1)

First step of the "make it simple, don't overwhelm" pass. Each user now sees
only the entry tiles they're allowed, so a collector isn't faced with a wall of
options.

- Server: `entries` column on Users (append-only) + `setEntries` action (admin,
  whitelisted to party/payment/daily/handover); publicUser_ returns it; audited.
- Client: `canEntry(kind)` — admin = all; a normal collector with an empty
  `entries` = all (nobody is accidentally locked out); otherwise only the listed
  kinds. Home tiles are grouped and each group/section is hidden when the user
  can't use it; the party-detail pay button is gated too. Expense stays
  cashier-only; "my entries" stays for everyone.
- Admin panel: an "✏️ কী কী ঢোকাতে পারবে" chip row per approved user (দাতা /
  চাঁদা / রোড-টোটো-বাস / জমা), toggling `setEntries`. Empty is materialised to
  all-4 before toggling so turning one off is unambiguous.
- Verified live: a `daily`-only collector sees only road/toto/bus + my-entries;
  an empty collector sees everything; toggling the party chip sends
  setEntries[payment,daily,handover]. 105 tests pass. Needs the redeploy for the
  entries column + setEntries.

## Search upgrade — multi-field, multi-word, normalised (step 2)

Khata and find-party search were name+owner substring only. Now:
- `normText()` — NFC + lowercase + collapsed spaces, so Bengali (composed/
  decomposed) and English both match cleanly.
- `matchParty(p, q)` — every query WORD must appear across name, owner, phone,
  area label and location label; so "কমল মালদা", "9998", or an area name all
  narrow the list. No new UI clutter (the same search box does more).
- Used in both drawList (khata) and renderFPResults (find-party); find-party's
  row objects now carry phone + location too.
- Verified live: search by phone, by area, by two-word owner, by name+area all
  filter correctly; node sanity covers the AND/normalise cases. Client-only.
  105 tests pass.

## Report PDF — print-to-PDF (step 3)

Reports can now be handed to the committee as PDFs, with zero libraries and
fully offline:
- Every central report gets a "📄 PDF বানাও / প্রিন্ট" button. It fills a
  hidden `#print-area` with a headed copy of the report (puja name, report
  title + year, generated date-time in Bengali digits, and a "প্রশিক্ষণ মোড"
  tag while training) and calls `window.print()` — on a phone the user picks
  "Save as PDF".
- `@media print` CSS shows only #print-area, restyled for paper: black on
  white, bordered cards/stat boxes, dotted row separators. On screen the area
  stays display:none.
- Verified live: button renders, click fills the print area with puja name /
  report title / generated stamp / training tag / figures, window.print fires,
  and the area is hidden on screen. In-app guide updated (bn+en). Client-only.
  105 tests pass.

## Admin panel — grouped into collapsible sections (step 4, UX pass done)

The panel had become a wall of buttons + cards. Reorganised into three native
<details> folds (no JS, works everywhere):
- 👥 ইউজার ও permission — pending/approved/blocked user cards; opens by default
  and shows a pending-count badge on the summary.
- 🧾 রসিদ ও তালিকা — receipt design + expense subjects + area/location masters.
- 🗂️ ডেটা ও হিসাব রক্ষা — activity log + year rollover.
The training card + Go-Live stays on top, Refresh below it. `.adm-fold` CSS
(rounded card, rotating ▸ marker). All existing handlers untouched — buttons
just moved inside the folds.
Verified live: three folds render (users open with badge "1", others closed),
receipt/audit/rollover buttons live inside their folds and stay wired, approve
chip works. Client-only. 105 tests pass.

## Audit fixes — payment-permission bypass + stale permissions

Post-sprint self-audit found two real issues; both fixed and verified.

1. **Payment bypass (bug):** a payment-restricted user could still take money
   via khata → 🔍 find-party → tap donor (only the home tile and the party
   pay-button were gated). Now the find-party button is hidden without the
   payment permission, the findparty route bounces to the khata (so history/
   Back can't reach it), and the result-tap is guarded too.
2. **Stale permissions (gap):** ck_user was written only at login, so an
   admin's permission/role change didn't reach the device until re-login.
   `pull` now returns `me` (fresh publicUser_); pullCentral adopts it when it
   differs — updates ck_user + collectorName/Role settings and re-renders — so
   changes land within one pull (≤60s). Rides the pending redeploy.

Verified live (harness): payment-less user has no find-party button, direct
route bounces, and after a mock permission grant one pull updated the user,
the home payment tile appeared (party still hidden) and find-party returned.
105 tests pass.

## Calculation audit — one cash-split bug fixed, formulas documented

Full interdependency sweep of the money maths (a 2-collector scenario with a
cross-collector party, a void, pending+confirmed handovers, a collection
expense, a UPI split, a legacy cash-only row and a bus daily): 21/22 checks
passed on the first run — party balance, per-person in-hand, pending handover
handling, void exclusion, personal summary, dues/inhand reports and the
reconcile invariant are all consistent with each other.

**The one failure was real:** three different "legacy cash-only" checks existed.
`computeTotals` only treated `undefined` split-fields as cash-only, so a row
whose blank cells round-tripped through the Sheet as `''` contributed 0 to
মোট নগদ — while `isCashOnly` (personalSummary, receipts) and the overview report
counted it. The same data could show different "total cash" on different
screens. Fixed: `computeTotals` and Code.gs `computeReport_('overview')` now
use the one canonical check (isCashOnly / cashOnly_). 3 regression tests added
(blank + undefined rows count as cash; overview === computeTotals) → 108 pass.

Noted, not bugs: `computeTotals.byCollector` is name-keyed but unused by any
screen (tests only); pre-login legacy handover rows key by name until go-live
clears them.

**Help updated:** new "💰 হিসাব কীভাবে হয় (সূত্র)" section (bn+en) in the in-app
guide + app-guide.md — donor due across collectors, the in-hand formula, void
exclusion, and the reconcile invariant, in plain words.

## Backlog trio: reconcile banner + notifications-in-pull + server-side push gating

The three audit recommendations, built together so the pending redeploy carries
everything at once.

1. **Reconcile warning (client):** the report screen (admin/cashier) now runs
   `Aggregate.reconcile` on the snapshot and shows a red "⚠️ হিসাব মিলছে না!"
   card when Σ in-hand ≠ collected − expenses, plus an anomaly count (overpaid
   pledge / negative in-hand / orphan / duplicate). Silent when clean. Verified
   live: a broken snapshot (never-collected handover → negative in-hand) shows
   the banner; clean data shows nothing.
2. **Notifications ride `pull`:** new `notifData_(u, d)` computes the feed from
   the already-read year dataset; `pull` returns it as `notif` (no second sheet
   read) and the standalone `notifications` action now reuses the helper (kept
   for old clients). Client: `applyNotifications()` extracted; pullCentral
   applies `resp.notif` and sets `notifViaPull`, which switches off the separate
   60s notifications poll, the focus poll, and the home-screen poll — halving
   per-device server calls. Feed action buttons refresh via pullCentral when
   notif rides the pull. Verified live: banner filled from the pull payload and
   no further `notifications` calls occurred after the first pull.
3. **Server-side push gating:** push now mirrors the client's entry permissions
   — party/payment/daily/handover checked via `entryAllowed_` (admin all,
   empty entries = all), general expenses cashier/admin-only, and collection
   expenses (source='collection') gated on the 'daily' kind since collectors
   legitimately record them mid-round. Blocked rows are skipped and returned as
   `rejectedIds` (the UI never produces them; only tampering does). Live proof
   lands with the redeploy.
108 tests pass. SW v3.71.0.

## config.js — rebaked SCRIPT_URL for the audit-trio deployment (AKfycbzZJp…)

- Hrishi redeployed Code.gs (reconcile-adjacent server helpers, notif-in-pull,
  push gating) and pasted the new `/exec` URL. Rebaked `js/config.js`.
- Verified reachable: local static serve picked up the new `window.CONFIG.
  SCRIPT_URL`, and a login attempt through the real UI round-tripped to the
  new deployment and returned "ভুল username বা পাসওয়ার্ড" (real backend
  response, not a network/config error) — confirms the deployment is live and
  serving the new code path. Full live proof of the three audit-trio features
  (reconcile banner, notif-in-pull, push gating) still needs Hrishi's own
  login/token since no admin credentials are available in this session.

## Live verification (read-only) with Hrishi's session token

- Hrishi shared a session token for a one-time, read-only check. Called
  `pull` directly against the new deployment (no writes): response carried
  `notif: {notifications:{...}, items:{...}}` matching `notifData_` exactly,
  and running `Aggregate.reconcile` on the real returned dataset gave
  `balanced: true` (collected ₹6,900 − expenses ₹100 = in-hand ₹6,800). Three
  anomalies surfaced, all pre-known leftover test data (SYNC TEST দোকান,
  Ramu/salil test handovers) — not new bugs; the banner catching them is a
  correctness confirmation, not a red flag. Push-gating verified by code
  review (deterministic, no live push needed): `entryAllowed_` wired into
  `push` at both the payment/daily/handover branch and the expense branch,
  blocked rows collected into `rejectedIds`.
- Token was single-use for this check; Hrishi to rotate via re-login per
  usual practice.

## Docs catch-up #2: pending.md + PROJECT_CONTEXT.md (2026-07-25)

Same gap as the 2026-07-24 catch-up (v3.47.0): the pre-commit hook only
requires build-log.md, so pending.md and PROJECT_CONTEXT.md drifted ~12
commits behind (everything from the field-validation audit through today's
redeploy — receipts, training/live mode, one-device enforcement, role-based
entries, search, report PDF, admin panel restructure, the two audit fixes,
and the reconcile/notif/push-gating trio). Caught by Hrishi asking directly
whether the docs were current — they weren't.

- `docs/pending.md`: new "P0.9" section covering all of the above (marked
  done + live-verified); P1's "Report export" and "PNG icons" items marked
  done (superseded); new prominent **"Next decision — Go Live"** section —
  training mode is still on, everything entered so far is disposable test
  data, Go Live is one admin action away and hasn't been triggered;
  housekeeping updated (today's token, today's redeploy's `setup()`, orphaned
  deployments, and the test-data cleanup connected to the reconcile banner
  now surfacing it).
- `docs/PROJECT_CONTEXT.md`: decisions table gains training/live mode +
  one-way Go Live, one-account-one-device, role-based entry permissions,
  the receipt design principles, and the print()-based PDF choice; new
  "Current state" section stating plainly that `live_mode` is off.
- No code changes.

## Roadmap: dropped bill/shop-photo attach (D6)

Hrishi: not needed. Struck off `docs/pending.md` P1. No code existed for it
(was never started), so no code change — docs only.

## v3.72.0 — UX speed pass: instant save + Undo (no confirm screen)

Hrishi: the collection process shouldn't feel slow or "suffocating". Audited
the guided-entry engine's real step/tap counts (not a guess): a simple cash
payment was mode→amount→note→**confirm screen**→Save = 4 taps across 4 full
screen redraws; a new shop was ~7 steps + the same confirm screen. Asked
Hrishi 3 concrete tradeoff questions before touching code (AskUserQuestion):
keep the confirm screen or replace it with instant-save+Undo (→ instant+undo,
recommended); add quick-tap amount-preset chips (→ no, keep typing); soften
the persistent training banner (→ no, leave it). Implemented only what was
asked for.

- **Removed the separate confirm/summary screen.** Answering a flow's last
  step now calls `finishFlow()` directly — saves immediately (every answer is
  already visible above in the chat transcript, so there's nothing new to
  review) and shows a `toastUndo()` with a 5-second **"ফিরিয়ে নাও / Undo"**
  button instead of `toast('saved')`. Cuts one full screen + one tap from
  every single entry (payment/daily/handover/expense/new-party) — the biggest
  lever available given hundreds of entries expected during the actual puja.
- **Undo is correctness-aware, not a blind delete.** Each flow's `save()` now
  resolves `{undo:[{store,id}], after}` (was `null`/`{buttons}`) — a list of
  the row(s) it just created (new-party creates both a party AND a first
  payment; both are undoable together). `attemptUndo()` checks each row's
  `synced` flag before deleting: unsynced (still local-only, the common case
  within a 5s tap) → clean `DB.del`, no trace anywhere; already-synced →
  left alone with an `undo_partial` toast pointing to "আমার এন্ট্রি" (void),
  because a collector silently retracting a row that already reached the
  Sheet would run straight into the existing void-permission rule (a
  collector can't void their own entry) — undo respects that boundary instead
  of bypassing it. New `DB.del(store,id)` primitive in db.js.
- **Failure recovery without losing progress.** A zero-total save (typed "0")
  rewinds to the money-amount step (`rewindToAmount()`); a declined
  duplicate-party confirm rewinds to the name step (`rewindToKey('name')`) —
  both keep every other already-answered field intact instead of restarting
  the flow.
- **Cleanup**: the now-dead summary-screen CSS (`.summary .sum-row`),
  `editIdx` tap-to-edit machinery, and the `confirm_title`/`edit_hint` i18n
  keys were removed rather than left stubbed. Added a small `bubble-in` CSS
  transition on each new question so rapid-fire tapping feels responsive
  instead of an instant jarring redraw (no tradeoff, pure polish).
- **Docs**: in-app guide, app-guide.md and collector-guide.md updated to
  describe instant-save + Undo instead of the old tap-✏️-to-edit summary.
- sw → chanda-v3.72.0 (bumped; this touches app.js/db.js/i18n.js/css, all
  precached). 108 tests pass (no logic under test changed — this is UI/flow
  wiring). **Live-verified** in a local harness (fake session + unreachable
  SCRIPT_URL, since no real login token was available this session): a full
  road-collection entry (cash → ₹50 → skip note) landed on the "add another"
  screen instantly with the Undo toast visible, no confirm screen; the
  heaviest flow (bulk new-shop: name→owner→area→phone→pledge→mode→amount)
  saved both the party (pledged ₹1,000) and its first payment (₹300 cash) in
  one instant save; the undo delete-path was verified functionally correct
  against real IndexedDB rows (unsynced row removed, synced rows untouched).
  Caught and fixed a real testing pitfall along the way: the service worker's
  cache-first `app.js` was serving a stale pre-edit copy even after
  unregistering + clearing CacheStorage, because `addAll()`'s install-time
  fetch reused the browser's own HTTP disk cache from an earlier test in the
  same tab — worked around by testing on a fresh port (new origin, empty HTTP
  cache); real devices are unaffected since the VERSION bump forces a normal
  SW update path on next visit.
- ⚠️ Needs a normal redeploy of the **static files only** (no Code.gs/backend
  change this time — GitHub Pages push is enough, same as any client-only
  release).

## v3.72.1 — Phone validation: drop the 6–9 leading-digit rule

Hrishi: the "must start 6–9" restriction on the phone field should go —
found already sitting as an uncommitted local edit in the working tree
(`phoneErrIN` in app.js + the `err_phone_in` message in i18n.js), so his
change, just not yet shipped. Checked for other copies of the rule
(apps-script/Code.gs has no server-side mirror; only this one client check
existed) — nothing else to update. Now just requires a 10-digit number
after stripping spaces/dashes/+91/91/0, no leading-digit constraint.
Verified live: registering with phone `3456789012` (leading 3, previously
rejected) now passes client validation and reaches the network call, no
`err_phone_in` toast. 108 tests pass; app.js/i18n.js node --check clean.
sw → chanda-v3.72.1.

## v3.73.0 — Receipt is the entry's finish line, not a separate errand

Hrishi: "after completion of all entry we not sending the receipt, why?".
Real answer: receipt-sharing was never wired into the entry flow — it always
lived one level down, as a 🧾 button on a specific payment row in party
detail (or the everyone's-daily list for bus). True since the receipt
feature was built; just more noticeable now that entry itself is instant
(no confirm screen to "pause" on). Confirmed the intent + exact scope with
Hrishi via two rounds of AskUserQuestion (his first answer was ambiguous
between two readings — asked a direct 2-option follow-up rather than guess):
auto-open the receipt screen immediately on save (not an extra button on an
after-screen), for **all** receipt-worthy entries — new shop/person/member
with a first payment, an installment on an existing party, and bus daily.

- `finishFlow()` gained a second `after` shape: `{navigateTo, params}` calls
  `navigate()` straight to that screen; the existing `{buttons}` shape (used
  by road/toto's add-another/expense screen, and bulk-shop with no payment
  yet) is unchanged.
- `paymentFlow.save` (existing-party installment) always returns
  `after:{navigateTo:'receipt', params:{partyId,payId}}` — a payment's whole
  point is something to hand the donor, so this is unconditional. Dropped
  the now-dead `returnTo:'list'`.
- `newPartyFlow.save`: when a first payment was taken → same receipt
  redirect (party.id + the new payment's id). When "⏳ পরে দেবে" (no payment
  yet) → unchanged, still the bulk-mode "➕ আরেকটা দোকান" shortcut, since
  there's nothing to receipt.
- `dailyFlow.save`: only `type === 'bus'` redirects to a receipt (bus is the
  only daily kind with a donor identity — name + number). Road/toto keep
  their existing add-another/collection-expense/done screen untouched, as
  Hrishi specified — no receipt concept for an anonymous street collection.
- Verified live in the local harness: bus (শ্যামলী, WB73-1234, ₹200 cash),
  new-shop-with-payment (₹500 pledged/paid, ₹0 due), and an existing-party
  top-up installment (₹100, correct running total) all landed straight on
  the receipt screen with the right donor line, amount, and totals; road
  collection confirmed unchanged (still the add-another screen). No console
  errors. 108 tests pass (no shared-logic change — this is flow wiring).
- sw → chanda-v3.73.0. Client-only, static-files redeploy (no Code.gs
  change).

## v3.74.0 — Bulk mode retired: every entry loops fast, receipt-aware

Hrishi's follow-up: after sharing a receipt the app can't navigate away on
its own (the share sheet is a native overlay, the underlying page never
changes), so the collector was stuck tapping "← পেছনে" back through party
detail before starting the next entry. He proposed the fix and, crucially,
spotted the one place a generic "➕ new entry" button would be wrong: a
payment reached via search (find-party or khata list) isn't "create the next
one" the way a fresh shop/person/member/bus is — there's no natural "next"
to create, the right move is back to the same search results. Confirmed the
exact scope over two more rounds of questions (his first answer parsed two
ways; asked a direct 2-option follow-up rather than guess) before touching
code — landed on: retire bulk mode entirely (redundant once every entry
loops), and extend the same "➕ আরেকটা / Skip" pattern to expense/collection
expense/handover too, which he confirmed are needed.

- **Bulk shop mode removed.** Home lost the "🏪🏪 পরপর দোকান (bulk)" tile;
  `newPartyFlow(type, presets)` dropped its `bulk` flag — a plain 🏪/🙍/🤝
  tile now behaves exactly like bulk used to (sticky area for shops),
  whether or not a first payment was taken.
- **`paymentFlow(party, origin)`** — `origin` is `'list'` or `'findparty'`,
  set by the two call sites (party detail's 💰 button, find-party's direct
  pay-from-search). Threaded through to the receipt screen's params.
- **`renderReceiptShare` grew three context-aware continue buttons**,
  replacing the old dead-end (back-only) screen:
  - bus → "➕ আরেকটা বাস" (unambiguous, no search involved).
  - a payment with `params.origin` set → "🔍 তালিকায় ফিরি" straight back to
    that search (`listQuery`/`findQuery` are already-persisted module state,
    so the same filter/results reappear) — deliberately **no** "new entry"
    button here.
  - a brand-new party's first payment (no origin) → "➕ আরেকটা [same type]",
    side sticky for shops — this is what replaces bulk mode.
  - every branch also gets "শেষ, হোমে ফিরি" (reused the existing
    `done_for_now` label rather than inventing new wording).
- **Expense, collection expense, and handover** — all three used to
  `navigate('home')` straight after saving with no continue option. Now
  each returns `after:{buttons:[➕ আরেকটা …, শেষ]}`, matching the pattern the
  daily flow already had for road/toto.
- Dead code removed: `one_more_shop` and `bulk_shop` i18n keys (superseded
  by the generic `one_more` + type-label pattern).
- In-app guide, app-guide.md and collector-guide.md updated — also caught
  and fixed a miss from the previous commit (27b673d): app-guide.md's
  receipts section still described the old tap-🧾-on-party-detail flow, not
  the auto-open behaviour that shipped there.
- Verified live in the local harness: bulk tile gone from home; a new shop
  with payment → receipt → "➕ আরেকটা দোকান" → next flow opens with
  হরিরামপুর রোড pre-filled (sticky area confirmed); a payment taken via
  🔍 find-party → receipt → "🔍 তালিকায় ফিরি" → back on find-party with the
  paid party's new total visible (₹350/₹300); a bus entry → receipt →
  "➕ আরেকটা বাস" → fresh bus flow opens; an expense entry → "➕ আরেকটা খরচ" +
  "শেষ, হোমে ফিরি". No console errors throughout. 108 tests pass (no
  shared-logic change). sw → chanda-v3.74.0. Client-only, static-files
  redeploy.

## v3.74.1 — Bus moved into the "নতুন এন্ট্রি" section

Hrishi: bus collection belongs with the new-entry tiles, not with road/toto.
Makes sense given v3.74.0 — bus produces a receipt just like a new
shop/person/member does, while road/toto don't (no donor identity), so bus
was already behaving like a "new entry" and the home layout hadn't caught
up. Moved the 🚌 tile from the daily-collection grid into the new-entry
grid; still gated on the `daily` permission independently of `party` (a
collector could have one without the other). "আজকের রোড/টোটো/বাস" section
title trimmed to "আজকের রোড/টোটো" since bus no longer lives there. No
routing change — `data-go="bus"` still opens `dailyFlow('bus')` regardless
of which section it's drawn in. Verified live: bus tile renders under নতুন
এন্ট্রি next to দোকান/ব্যক্তি/সদস্য, opens the bus flow correctly, no console
errors. 108 tests pass. sw → chanda-v3.74.1. Client-only.

## v3.75.0 — Handover shows real available amount, one-tap "use all"

Hrishi: collectors only ever have what they've actually collected, so at
handover time (and for a cashier handing money further up) the app should
show the category-wise available amount and let them select it instead of
typing. His first framing ("category wise amount") was ambiguous — a follow-
up question round got the real intent: not currency-denomination chips or
donation tiers, but the collector's/cashier's actual current cash and UPI
in hand, computed from their own records, so they don't have to recall or
calculate it. Kept typing available too (not asked to remove it, and a
partial handover — keeping some cash back — is a legitimate real case).

- **New `Aggregate.myAvailable(data, ident)`** (aggregate.js, unit-tested):
  net cash/UPI a person currently holds = collected (payments+daily, cash/
  UPI split) + received via **confirmed** handovers − handed over via
  **confirmed** handovers − expenses (cash only, same assumption `isCashOnly`/
  `reconcile` use elsewhere). Pending handovers don't reduce it — matches the
  existing in-hand rule (the giver keeps credit until the cashier confirms).
  Works identically for a plain collector or a cashier who's also received
  from others — same formula, just keyed by whoever `ident` is.
- **`handoverFlow(cashierOpts, available)`** — title now shows
  "তোমার হাতে: 💵₹X · 📱₹Y" whenever there's anything to show. The cashAmount/
  upiAmount steps (a new `moneyStepsQuick`, specific to this flow — the
  shared `moneySteps()` used by payment/daily/new-party is untouched, since
  "available amount" only makes sense when handing over *existing* money,
  not collecting fresh money) carry a `quick` value.
- **`renderEntry()`**: an `amount` step with `.quick` set now renders a
  "সবটাই — ₹X" / "Use all — ₹X" chip above the input — reuses the existing
  generic `.chip` → `submitAnswer(dataset.v)` wiring (just gave the button a
  `data-v`), so no new event-handling path was needed. Typing still works
  alongside it.
- **`startHandover()`** now also pulls `viewData()` and computes `available`
  via `Aggregate.myAvailable` (in parallel with the existing cashiers-list
  fetch) before opening the flow.
- Verified live: after a ₹500 cash + ₹200 UPI road entry, opening handover
  showed "তোমার হাতে: 💵₹500 · 📱₹200" in the title; the cash step showed
  "সবটাই — ₹500" (tapped → ₹500 recorded exactly), the UPI step showed
  "সবটাই — ₹200" (same); saved handover row confirmed cash:500/upi:200.
  Reopening handover right after (still pending, not yet cashier-confirmed)
  correctly still showed the full ₹500/₹200 available — pending handovers
  don't reduce it, matching the existing rule. No console errors.
- In-app guide, app-guide.md, collector-guide.md updated. 115 tests pass (7
  new for `myAvailable`, incl. the confirmed-vs-pending and cross-person
  received/handed cases). sw → chanda-v3.75.0. Client-only, static-files
  redeploy.

## v3.75.1 — Handover redesigned: pick category chips, don't type mode+amount

Hrishi, after seeing v3.75.0 live: "don't make confused" — the small "সবটাই"
quick-chip bolted onto the existing mode→cash→UPI sequence still made the
collector answer an abstract "কীভাবে দিল?" question with no amounts on it
before the useful chips appeared. His actual ask: one screen, categories
shown WITH their amounts, tap to select, total computed live — not a
patched-on shortcut inside the old flow.

- **New `category` step kind** in the flow engine (`renderEntry`), scoped to
  this one use — a set of toggle chips (💵 নগদ ₹X / 📱 UPI ₹Y), a live
  "মোট: ₹Z" total, and a "পরের প্রশ্ন" that's disabled until something's
  selected. New `submitCategorySelection()` writes `cashAmount`/`upiAmount`
  directly into `flowState.answers` from the selected chips (bypassing the
  old payMode/cashAmount/upiAmount steps entirely via `showIf`) and advances
  like a normal answer. A "✏️ অন্য পরিমাণ" chip on the same screen calls
  `submitCategoryCustom()`, which un-hides those old manual steps for a
  partial/unusual handover — nothing lost, just one tap further away instead
  of the default path.
- `handoverFlow` now builds this category step only when there's something
  to show (`avail.cash > 0 || avail.upi > 0`); a collector with nothing
  collected yet gets the old manual sequence directly, no empty/useless
  category screen.
- `answerDisplay()` gained a `category` case so the chat-history bubble shows
  the actual total (or "✏️ অন্য পরিমাণ") instead of the raw internal
  'selected'/'custom' marker.
- **Open question, not yet investigated**: Hrishi separately reported "cashier
  can't send amount to himself" (a cashier handing over to themselves).
  Read both the server (`cashiers`, `pendingHandovers`, `confirmHandover` in
  Code.gs) and client (`startHandover`, cashier-list wiring) — found no
  code path that excludes the caller from their own cashier list or blocks
  a self-addressed handover/confirm. Can't reproduce locally (the dev
  harness has no real multi-cashier server data). Asked Hrishi for the exact
  symptom (missing from the list? an error on save/confirm? something else)
  before guessing at a fix.
- Verified live: category screen shows "💵 নগদ ₹600" / "📱 UPI ₹300" (real
  collected amounts), tapping both updates the total live (₹0 → ₹900), Next
  disabled until a selection exists, confirmed save wrote cash:600/upi:300
  correctly and skipped the old manual steps; "✏️ অন্য পরিমাণ" escape
  verified separately — falls back to mode→amount typing, saved a ₹100
  cash-only handover correctly. No console errors. 115 tests pass (no
  shared-logic change — this is flow/UI wiring). In-app guide, app-guide.md,
  collector-guide.md updated to match the shipped screen (not the v3.75.0
  description, which no longer matches). sw → chanda-v3.75.1. Client-only.

## v3.75.2 — Fix: cashier/admin saw their own name in the handover "to" list

Root cause of "cashier can't send amount to himself" (the report was the
symptom, not a request — this was a real bug, confirmed): Code.gs's
`cashiers` action legitimately returns every approved cashier/admin,
including the caller — correct, since any OTHER user needs to see them as a
valid recipient. Nothing was filtering the caller OUT of their own list, so
a cashier/admin saw their own name as a selectable handover target, which
is meaningless (you can't hand money to yourself).

- `startHandover()`: the `cashiers` response is now filtered client-side
  (`others()`) to drop any entry whose `username` matches the current
  user's own identity, before building the "to" step. A cashier who happens
  to be the only cashier/admin falls back to the existing free-text "to"
  field (same as when the server call fails or returns nothing) — no dead
  end.
- No server change — this is a display-list filter, not a security gate
  (a self-addressed handover, if one were ever created, would net to zero
  in `Aggregate.myAvailable` once confirmed: cash out then straight back in
  as received). Client-only fix.
- Verified live: mocked the `cashiers` response (3 users incl. the caller
  "tester") — the "to" step correctly listed only the other two, own name
  gone. No console errors. 115 tests pass (no shared-logic change).
  sw → chanda-v3.75.2. Client-only, static-files redeploy.

## v3.76.0 — Handover by SOURCE category: চাঁদা/রোড/টোটো/বাস, cash-UPI as subtypes

Hrishi's refinement of the handover screen: "category" should mean the
money's SOURCE (chanda, road, toto, bus…), not cash/UPI — those are subtypes
of every category. Flow he specified: pick categories → pick cash/UPI/both →
the amount shows; access-wise (a category the user can't even enter is
noise); "the calculation and all should be done perfectly".

The "perfectly" part forced a data-model addition: once someone hands over
PART of their money, per-category remaining is mathematically undefined
unless the handover itself records which categories it came from. So:

- **Handover rows now carry a `breakdown`** — JSON `{cat:{cash,upi}}` of the
  selected source categories. Both sides stay exact forever after: the giver's
  per-category balance drops in exactly those categories, and the RECEIVER's
  hand shows the money under the same categories (so a cashier handing over
  to another cashier sees চাঁদা/রোড/বাস chips too, not one opaque "received"
  lump — Hrishi's "he got the amount from the other collectors and all").
  `SHEETS.handovers` gained the column (appended at END, migration-safe).
- **`Aggregate.myAvailable` rewritten** to return `{cash, upi, byCat}`:
  payments → `payment`; daily by its type; confirmed received handovers →
  merged per their breakdown (legacy breakdown-less ones → a `received`
  bucket); confirmed outgoing → subtracted per breakdown, or for legacy rows
  drained deterministically in fixed category order; collection expenses hit
  their own `collectionType` category's cash, general expenses drain in
  order. Totals unchanged (all 10 pre-existing myAvailable tests still pass
  untouched).
- **Flow**: the category step now lists source categories (label + real
  amount; empty categories don't appear — which is also the access story,
  since you can only hold money in kinds you can enter). Then a mode step
  whose chips are computed from the SELECTED categories (`optionsFn` — new
  generic flow-engine support for answer-dependent choice options): "💵 নগদ
  ₹450 / 📱 UPI ₹200 / 💵+📱 দুটোই ₹650", only modes with money offered. Save
  derives cashAmount/upiAmount from selection+mode and writes the breakdown.
  "✏️ অন্য পরিমাণ" still escapes to manual typed entry (no breakdown → the
  receiver gets it as 'received', still correct in total).
- Verified live (seeded IndexedDB: chanda 300c+200u, bus 150c, road 80c):
  title ₹530/₹200 ✓; category chips চাঁদা ₹500 · রোড ₹80 · বাস ₹150 (no toto
  — no money) ✓; selected চাঁদা+বাস → মোট ₹650 ✓; mode chips নগদ ₹450 / UPI
  ₹200 / দুটোই ₹650 ✓; saved row amount 650, cash 450, upi 200, breakdown
  `{"payment":{"cash":300,"upi":200},"bus":{"cash":150,"upi":0}}` ✓; after
  confirming that handover, giver has only road ₹80 left and the cashier's
  byCat shows payment 300/200 + bus 150/0 — both sides exact ✓. No console
  errors. 125 tests pass (10 new byCat cases: breakdown add/subtract, legacy
  drain order, collection-expense category hit, legacy receive bucket).
- ⚠️ **Code.gs redeploy needed** (handovers `breakdown` column). Until then
  the server ignores the extra field — handovers still sync fine, the
  receiver just sees them as 'received' instead of per-category. Run setup()
  after deploying to append the header column.

## Final-stage audit: docs/final-audit.md

Hrishi: "we are in last stage — find all the loopholes, defects,
calculations, interdependency". Full sweep, every claim verified against
the actual code (sync.js read line-by-line, popstate/flow-engine guards
traced, escaping spot-checked, quota math computed) — written up in
docs/final-audit.md. Headline findings, all NEW (not previously known):

- **A1 HIGH**: Undo vs in-flight sync race — syncNow's mark-synced
  bulkPuts snapshotted rows, resurrecting a row Undo just deleted (and the
  server saved it anyway). Undo silently fails on a money row.
- **A2 MED**: `rejectedIds` from server push gating are ignored by
  sync.js — a permission-revoked collector's unsynced rows retry forever,
  badge stuck.
- **A3 MED**: duplicate-donor check reads only the device's own parties —
  two collectors can double-register the same shop centrally.
- A4/A5/A6 LOW: last-step double-tap TypeError; unclamped negative
  category chip totals; "₹-80" rendering.

Plus: 6 deliberate tradeoffs restated for sign-off, calculation
cross-check matrix (what's proven and how), security posture, Apps Script
quota math for peak day (~8.4k req/day, well inside limits), the
interdependency map (one Code.gs redeploy pending: handovers.breakdown),
and the ordered go-live checklist. Docs-only commit; fixes await Hrishi's
green light.

## v3.77.0 — Audit fixes A1–A6, each verified by forcing the failure live

All six findings from docs/final-audit.md, fixed on Hrishi's green light and
each one verified by REPRODUCING its failure condition in the harness (not
just re-reading the code):

- **A1 (undo-vs-sync race)**: sync.js mark-synced now re-reads every row by
  id before writing (never resurrects a deleted row from its stale snapshot),
  and `attemptUndo` writes a **void (reason 'undo')** instead of deleting
  whenever the row is synced or `Sync.busy()` — the only correct retraction
  once a row may have reached the Sheet. Verified with a patched 2.5s-slow
  push: undo tapped mid-flight (`busyAtTap:true`) → row kept + marked synced
  + void written + excluded from myAvailable. New `Sync.busy()` accessor;
  toast key `undo_voided` (replaces the removed `undo_partial`).
- **A2 (rejected rows retried forever)**: sync.js marks `rejected:1` on
  rejectedIds, collectUnsynced and DB.unsyncedCount exclude them, and "আমার
  এন্ট্রি" tags them "🚫 server নেয়নি". Verified with a patched all-reject
  push: flag set, badge 0, second sync sent 0. (Rejected rows still count in
  the collector's own local totals — the cash IS physically in their hand;
  central reports never see them, the tag says to involve a cashier.)
- **A3 (device-local dup check)**: newPartyFlow now checks viewData()
  (central snapshot + own). Verified: a name existing ONLY in the seeded
  central snapshot triggered the confirm.
- **A4 (last-step double-tap TypeError)**: guards in submitAnswer AND — the
  actual throw sites the first verification run exposed — the skip-button
  handler and the async voice callback, plus a `savingFlow` reentry flag.
  First fix attempt looked done but the harness still threw (stale SW cache
  had served old app.js; cleared + re-ran); 4× rapid-tap now: zero errors,
  exactly one save.
- **A5**: category chip totals clamp the same as their selectable subtypes.
- **A6**: fmtMoney(-80) → "−₹80".

125 tests pass. sw → chanda-v3.77.0. Client-only; docs/final-audit.md items
marked fixed. No server change (the pending v3.76.0 Code.gs redeploy is
still the only one outstanding).

## Second-pass audit (all aspects) + A7 fix

Hrishi: "check once again with all aspects". Walked the layers the first
pass hadn't line-verified: all 39 server action gates (clean), SW precache
completeness (clean; config.js network-first by design), index.html script
order (safe — runtime reads), report-mirror branch parity (7/7), the
forgot-password path (instruction-only, no unauthenticated reset), an XSS
second sweep (zero unescaped user-string interpolations), Code.gs syntax
(clean via .js copy). One NEW finding: **A7 — voided (e.g. undo-voided)
handovers still appeared in the cashier's confirm list + notifications**,
because `notifData_` and `pendingHandovers` read raw rows; both now pass
through `activeData_` first. Money math was never affected. Server-only —
rides the already-pending Code.gs redeploy (breakdown column), so no extra
deployment step for Hrishi. 125 tests pass; no client change, no SW bump.

## Docs housekeeping: setup-google fix (critical), README, context catch-up

- **setup-google.md's redeploy section said the OPPOSITE of reality** for
  this account ("New version, URL stays same, don't create New deployment")
  — exactly the trap that cost several redeploy cycles on 2026-07-24/25.
  Rewritten with the verified procedure: paste → New deployment → new URL →
  config.js rebake → setup() → archive old deployments occasionally. Caught
  just in time — the breakdown-column redeploy is still pending.
- README.md added (repo had none): live link + repo map + discipline.
- PROJECT_CONTEXT.md: decisions table gains instant-save/undo-as-void,
  receipt-as-finish-line, and source-category handover with breakdown;
  sheet list mentions Config + handovers.breakdown; current-state points to
  final-audit.md. Stale-term sweep across all guides came back clean.

## config.js — rebaked SCRIPT_URL for the breakdown deployment (AKfycby9…)

Hrishi created the New deployment carrying the v3.76.0+A7 Code.gs
(handovers `breakdown` column; voided handovers filtered out of
notifData_/pendingHandovers). Probed live: `login` → "bad-login", `pull` →
"bad-token" — both reached their gates, deployment executes. config.js is
network-first + excluded from the SW precache, so no VERSION bump needed —
devices pick the new URL up on next open. Remaining server step: Hrishi
runs `setup()` once (appends the `breakdown` header to Handovers).

## Full functional verification against the LIVE breakdown deployment

Hrishi shared a fresh session token (hrishi91/admin); ran the complete
matrix against AKfycby9… — read-only first, then disposable training-mode
writes (all "AUDIT TEST"-labelled, all voided afterwards; Go Live wipes
them regardless). No admin operations performed, per the standing boundary.

| Check | Result |
|---|---|
| `pull` full: me/notif/config ride along, live_mode=training | ✓ |
| Handovers rows carry the `breakdown` key → setup() ran | ✓ |
| Reconcile on real data | ✓ balanced 8200−200=8000 (only the 4 pre-known test-data anomalies) |
| `myAvailable(hrishi91)` byCat matches what his phone showed (💵6800/📱10500) | ✓ |
| push: road entry + handover with breakdown JSON | ✓ savedIds, no rejections |
| breakdown round-trips byte-identical through the Sheet | ✓ `{"road":{"cash":2,"upi":0}}` |
| **A7 live**: pendingHandovers lists the pending audit handover, then hides it the moment its void lands | ✓ |
| Receipt serial on new payment | ✓ `2026000010` (year+6-digit atomic counter) |
| Cleanup voids (handover, road, payment, party) accepted | ✓ |
| Post-cleanup reconcile identical to pre-test; notif zero; availability unchanged | ✓ |
| Delta cursor present for incremental pulls | ✓ |

Token is Hrishi's to rotate (re-login) now that verification is done.
The audit-* rows stay in the Sheet as voided history until Go Live wipes
everything — nothing to hand-clean.

## Two-user live verification — A8 + A9 found and fixed

With a second session token (yamini05, plain collector) the cross-user
paths were exercised against the live deployment for the first time. Full
matrix in docs/final-audit.md; headline:

- **A8 (MED, regression of my own A7 fix)**: `activeData_` never returned a
  `corrections` key, so once A7 routed `notifData_` through it, pending
  correction flags vanished from the cashier/admin notification feed.
  Fixed in Code.gs and mirrored in aggregate.js. Only a two-user
  flag→review test could have caught this.
- **A9 (MED-HIGH, security)**: `push` took `collector`/`collectorId` from
  the payload when present (`row.x || user.x`), so a tampered client could
  attribute an entry — and its cash-in-hand liability — to another
  collector, and forge `collectorRole` (which drives void permissions).
  Now stamped from the token unconditionally. Surfaced because the audit
  harness sent `collectorId:"x"` and the server kept it.

Everything else green: B's admin/cashier action gates, push gating for a
cashier-only expense, B→A handover with breakdown reaching A's feed,
A confirming it, A approving B's flag, the category relay (₹3 handed as
`road` landed in A's road bucket, not "received"), cross-collector payment
attribution, non-colliding receipt serials, delta pull. All AUDIT TEST rows
voided; hrishi91's in-hand returned to its exact pre-test value.

⚠️ A8+A9 are server-side → **one more Code.gs redeploy** (New deployment →
send the URL → rebake). Until then: correction flags don't notify (the
review screen still works), and the identity-spoof needs a tampered client.
125 tests pass; client mirror change is already live-safe.

## config.js — rebaked for the A8+A9 deployment (AKfycbw6…), both fixes proven live

Hrishi deployed the Code.gs carrying A8 (corrections key restored in
`activeData_`) and A9 (identity stamped from the token) and shared a fresh
admin token; Yamini's session stayed active, so the two-user paths could be
re-run against the new deployment immediately.

- **A9 proven live:** Yamini's client pushed a row deliberately forging
  `collectorId:"hrishi91"`, `collectorRole:"admin"`, `collector:"Hrishikesh"`.
  Stored row came back `Yamini mahato` / `yamini05` / `user` — the spoof is
  overwritten from the token, so cash-in-hand liability can no longer be
  pinned on another collector and the void-permission role can't be forged.
- **A8 proven live:** Yamini flagged that row; the admin's `pull` feed now
  reports `corrections: 1` with the item ("AUDIT TEST A8", by Yamini mahato)
  — before the fix this was silently 0.
- Loop closed + self-cleaning: the admin approved the flag → `resolveCorrection`
  created the void → the audit row is excluded everywhere. Reconcile balanced
  (10200 / 10000); Yamini's availability unaffected (1000/1050).
- Noted for Hrishi: his feed shows `approvals: 1` — someone is registered and
  waiting for approval in the admin panel (his call, not mine to action).

Old tokens from the earlier passes are dead (each login rotates); the two
current ones are Hrishi's to rotate by re-login when he's done.

## docs/residual-risks.md — the honest remainder

Hrishi: "any other concept got missed from your side?" — rather than claim
completeness, wrote down what genuinely isn't covered, verified by reading
the code:

- **Disaster recovery is half-built** (the biggest one): `dailyBackup()`
  writes full JSON snapshots to Drive, but only if a time-driven trigger
  was installed by hand — unverified, Hrishi must confirm. And there is
  **no restore path** anywhere in Code.gs; the client's import only
  restores that phone's own export. Realistic recovery is Google Sheets'
  own version history — worth knowing before it's needed.
- **Never-run flows**: goLive (one-way, wipes everything, its backup is
  best-effort), rolloverYear, password-reset end-to-end, bn-IN voice on
  hardware, PWA install/offline on a real phone.
- **Concurrency/quota edges**: `waitLock(20000)` can throw under a
  simultaneous 10-phone sync — data-safe (whole batch inside the lock,
  rows requeue) but visible as a sync failure at the worst moment; quota
  exhaustion would look like a generic network error.
- **Deliberately out of scope**, restated so nobody "fixes" them by
  surprise: no entry editing (void + re-enter by design), report
  permissions are UI shaping not secrecy, token in localStorage, UPI to
  personal numbers, Telegram deferred.
- The operational checklist Hrishi still owns is at the end of that file.

## v3.78.0 — Disaster recovery closed: auto trigger, mandatory Go-Live backup, real restore

The one genuinely dangerous gap from docs/residual-risks.md §1, fixed in
code rather than left as an operational to-do:

- **`setup()` installs the backup trigger itself** (`ensureBackupTrigger_`,
  idempotent) — automatic daily backups no longer depend on Hrishi
  remembering a manual editor step, which was unverified and might never
  have existed.
- **`dailyBackup()` hardened**: returns its filename, timestamps to the
  minute (a manual backup right before Go Live can't overwrite the daily
  one), and now also captures ExpenseSubjects / Lists / Config / Audit —
  previously only the transactional sheets + Users were saved, so a restore
  would have lost the master data and receipt design.
- **`goLive` no longer wipes on a failed backup.** It was `try{...}catch{}`
  best-effort before a one-way irreversible wipe; now a backup failure
  aborts with `backup-failed` (mapped to a clear Bengali message) and the
  data is untouched. The audit entry records which snapshot protects it.
- **A restore path exists at last**: `backupNow`, `listBackups`,
  `restoreBackup` (admin-only). Restore is guarded by admin token + explicit
  fileId + a typed "RESTORE", takes a safety backup of the CURRENT state
  first (so the restore itself is reversible), rebuilds each sheet from the
  snapshot, and bumps `data_epoch` so every device drops its cache and
  re-pulls.
- Admin panel 🗂️ fold gained 💾 এখনই backup নাও · ♻️ Backup থেকে ফেরাও.

Verified in the harness: all four buttons render in Bengali; restore's three
gates each block correctly (wrong typed word → no call, declined confirm →
no call), the happy path sends `{fileId, confirm:'RESTORE'}` and clears the
local cache afterwards; backupNow reports the filename. No console errors.
125 tests pass. sw → chanda-v3.78.0.

⚠️ Server-side → needs one more Code.gs redeploy (New deployment → URL →
rebake) and **run `setup()` after it** — that's what installs the trigger.

## config.js — rebaked for the recovery deployment (AKfycbzY…)

New deployment carries v3.78.0 Code.gs. Probed live with the admin token:
`pull` ok, and **`listBackups` is recognised** — a brand-new action, so this
confirms the recovery code is deployed.

**Finding: `listBackups` returned an EMPTY list** — no backup file has ever
existed in `ChandaKhata-Backups`. That settles the open question from
residual-risks §1: the manual daily-backup trigger was never installed, so
until today the project had **zero backups**. `setup()` now installs it
automatically; Hrishi runs setup() once on this deployment and the 2am
trigger starts.

Not run by me (operational boundary): `backupNow` writes to Hrishi's Drive
— he taps 💾 এখনই backup নাও himself; I verify the result via `listBackups`.

## v3.78.1 — Backups live beside the spreadsheet (ganesh_pooja_daulatpur)

Hrishi: the folder should be `ganesh_pooja_daulatpur` — where the main
spreadsheet already lives — not a separate `ChandaKhata-Backups`.

- `backupFolder_()` now resolves the **spreadsheet's own parent folder**
  (`DriveApp.getFileById(ss.getId()).getParents()`), so snapshots always sit
  beside the file they protect and a folder rename can never orphan them.
  The name `ganesh_pooja_daulatpur` is only the fallback if the sheet has no
  parent.
- Because that folder also holds the live spreadsheet (and anything else
  Hrishi keeps there), snapshots are now identified by the `chanda-backup-`
  prefix: `listBackups` filters on it, and `restoreBackup` **refuses**
  (`not-a-backup`) any file without it — you can never accidentally
  "restore" the live sheet over itself.
- Docs + the success message updated (no hardcoded folder name in the UI
  string any more); setup-google.md's backup section rewritten — the manual
  trigger step is gone, replaced by the setup()-installs-it note plus the
  ⚠️ that the first setup() run after a new deployment must be granted
  Drive/trigger permissions or backups silently never happen.

125 tests pass. sw → chanda-v3.78.1. ⚠️ Server-side → one more Code.gs
redeploy (New deployment → URL → rebake) and run `setup()` after it.

## config.js — rebaked for the ganesh_pooja_daulatpur backup deployment (AKfycbys…)

Probed: `doGet` → `{ok, service}`; `listBackups` → **bad-token** (not
"unknown action"), which proves the v3.78.1 recovery code is deployed —
the action exists and reached its auth gate. Hrishi's previous admin token
is dead (he re-logged in), so the backup-folder verification needs a fresh
token from him after he runs setup() + taps 💾.

## v3.79.0 — Handover: categories grouped under their super-type, cash/UPI/total everywhere

Hrishi's refinement: the categories should sit under a **super-type** (daily
collection vs new-entry collections), each showing cash and UPI separately
plus the total — "otherwise he needs to go to the other pages again and
again". Same numbers must then flow into the reports for every user.

- **Category step redesigned** from flat chips into grouped cards:
  📥 নতুন এন্ট্রি/চাঁদা · 🛣️ দৈনিক কালেকশন (road/toto/bus) · 🤝 অন্যের
  জমা. Every row shows `💵cash · 📱UPI · total`, every group shows its own
  subtotal, and the "বেছেছ" line under them adds the SELECTION up live in
  the same three figures. Empty categories/groups never render, which keeps
  it permission-shaped (you can't hold bus money without bus access).
- **Reports carry the same table**: `personalSummary` now returns `byCat`
  (delegating to `myAvailable`, so the report and the handover chips read
  the *same function* and can never drift), rendered as
  "কোন খাতে কত আছে / What I hold, by source" in My summary — visible to
  every user, no permission needed, so "how much bus money do I still hold?"
  is answerable from the report too.
- Sender/receiver, category and money-type all continue to be stored on the
  handover row itself (`breakdown` JSON from v3.76.0), so both sides' books
  stay exact — this change is the presentation layer over that data.
- CSS: `.cat-group / .cat-row / .cat-selected` (selected row inverts to
  saffron, splits stay legible on both states).

Verified live in the harness with mixed data (chanda 300c+200u, road 80c,
toto 60c+60u, bus 150c): groups and subtotals render correctly
(দৈনিক = 💵290 · 📱60 = ₹350); selecting চাঁদা + টোটো shows
`💵₹360 · 📱₹260 ₹620`; the mode chips then read নগদ ₹360 / UPI ₹260 /
দুটোই ₹620; the saved row is amount 620, cash 360, upi 260 with breakdown
`{"payment":{"cash":300,"upi":200},"toto":{"cash":60,"upi":60}}`; the report
section lists all four categories with their cash/UPI/total. No console
errors. 128 tests pass (3 new: byCat report/handover parity, byCat sums to
in-hand, collection-expense drains its own category). In-app guide +
both user guides updated. sw → chanda-v3.79.0. Client-only — no redeploy.

## v3.79.1 — "নতুন এন্ট্রি" split by donor type, matching দৈনিক কালেকশন

Hrishi: দৈনিক কালেকশন is fine, but নতুন এন্ট্রি should be broken down the
same way — one lumped "🧾 চাঁদা" row was shallower than road/toto/bus.

- `myAvailable` now attributes each payment to its donor's **type**
  (shop / person / member) by joining `partyId → parties.type`, so chanda
  splits exactly like daily does. `AVAIL_CATS` gained the three types;
  `payment` survives as the LEGACY bucket for rows whose donor isn't in the
  dataset and for handover breakdowns written before this change — old data
  keeps working and still shows up (labelled "চাঁদা (পুরোনো)").
- Label maps updated in both places that render categories (handover chips
  and the report table), and the entry group now collects
  shop/person/member/payment.
- Verified live with one donor of each type + road + bus: the group renders
  দোকান ₹500 · ব্যক্তি ₹300 · সদস্য ₹200 with subtotal 💵₹600 · 📱₹400 =
  ₹1,000 beside দৈনিক 💵₹230 = ₹230; selecting ব্যক্তি + বাস gives
  💵₹250 · 📱₹200 = ₹450, mode chips match, and the saved row carries
  `{"person":{"cash":100,"upi":200},"bus":{"cash":150,"upi":0}}` — the
  donor type reaches the stored breakdown, so the receiving cashier sees it
  under the same category. Report lists all five categories. No console
  errors.
- 133 tests pass (5 new: per-type split, unknown-donor → legacy bucket,
  unused type absent, totals unchanged by the split).

sw → chanda-v3.79.1. Client-only — no redeploy.

## v3.80.0 — Hand-over sheet: per-category cash AND UPI, partial amounts native

Hrishi: "the submitter can select cash or upi for each category — there could
be a chance the collector is not having the amount at the moment", then
"every entry cash and upi selection". The old two-step flow (pick categories →
pick cash/UPI/both) baked in two wrong assumptions: that a whole category
always moves, and that the cash-vs-UPI choice is the same for every category.

**One screen replaces three steps.** New `sheet` step kind: each source
category is a row with its OWN 💵 cash and 📱 UPI box, prefilled with what is
actually in hand, `[সব]`/`[কিছুই না]` shortcuts, and a live
`💵 · 📱 · total`. Hand over everything → change nothing, tap Next. Give less
→ edit that one box. A box is clamped to the available figure (typing more is
capped, so books can never go negative) and parses Bengali digits; a category
with no money of that type shows "—" instead of an input.

**This removed the last approximation in the money model.** The old
"✏️ অন্য পরিমাণ" escape wrote no breakdown, so partial handovers landed in the
receiver's opaque `received` bucket and drained the giver's categories in a
fixed order — documented as acceptable, but it was guesswork. The sheet *is*
the breakdown, so every handover now carries an exact per-category,
per-money-type split. Dead code removed with it: the `category` step kind, its
wiring, `submitCategorySelection`, `submitCategoryCustom`, the unused `quick`
amount-chip branch, and five now-orphaned i18n keys.

**Receiver-side visibility (Hrishi's other point):** `breakdownLines()` renders
a handover's stored split, now shown on the cashier's confirm card and in the
handover notification — the approver sees exactly what the giver picked
instead of a bare total. `notifData_` sends `breakdown` along (server change).

**Reports in sync:** `inHandRows` gained `byCat` by delegating to
`myAvailable`, so the central "কার হাতে কত" report shows each person's
category × cash/UPI — the identical numbers as their own "কোন খাতে কত আছে"
and as the handover sheet. One function feeds all three; they cannot drift.

Verified live end to end: sheet renders per-row boxes (shop 300/200,
person 100/200, bus 150/—, total ₹950); partial edit → ₹550; over-limit 9999
clamps to the available 100; Bengali "৫০" parses; "কিছুই না" disables Next;
saving shop-100-cash + bus-150 stores breakdown
`{"shop":{"cash":100,"upi":0},"bus":{"cash":150,"upi":0}}` with the chat echo
"₹250 (দোকান ₹100, বাস কালেকশন ₹150)"; after confirm the giver drops to
shop 💵200·📱200 with bus emptied while the receiver gains shop 💵100 + bus
💵150 — same categories, reconcile balanced; the cashier's confirm card shows
that breakdown; the central report lists both people's category splits.
No console errors. 141 tests pass (8 new, covering partial handovers,
cashier→cashier→admin chains, and central-report/personal parity).

sw → chanda-v3.80.0. ⚠️ One server-side line (`notifData_` sending
`breakdown`) → needs a Code.gs redeploy for the *notification* to show the
split; everything else, including the cashier's confirm card, works today.

**Known divergence (deliberate):** Code.gs's legacy `inHandRows_` has no
`byCat`. Every current client computes reports locally from the pull
snapshot, so this has no live effect; the server report action only serves
old clients. Porting `myAvailable` to Code.gs is deferred rather than
pretended — noted here so it isn't mistaken for parity.

## v3.80.1 — Hand-over: selection, not typing (correcting v3.80.0)

Hrishi: "I didn't tell you to make text boxes — the amount will be selected
only… the presentation you made previously was ok, just there should be
selection for UPI and the cash… different amount is not needed because
calculation already done."

I over-built v3.80.0. His earlier point ("the collector may not have the
amount at the moment") needed **finer selection**, not free typing — the
ledger already knows every figure, so typing one can only introduce error.
Corrected:

- The number inputs are gone. Each category row now offers its **💵 cash and
  📱 UPI as two separate tap-to-select chips** carrying the real figures, all
  selected by default. Tap one off to exclude it; the total recomputes from
  the selection. `[সব]` / `[কিছুই না]` kept.
- This keeps everything v3.80.0 actually gained — per-category **and**
  per-money-type control, exact breakdowns, no `received` fallback — while
  removing the typing, the 0..max clamping, and the "✏️ different amount"
  idea entirely. Simpler code and a shorter path for the collector.
- Only the sheet's render + wiring changed; `submitSheet`, the save,
  breakdown storage, receiver-side display and the reports are untouched
  (they consume `{cat:{cash,upi}}` either way), so the 141 tests still pass
  unchanged.

Verified live: rows show `💵₹300 · 📱₹200` style chips with no input element
on the page (`.sh-row input` count = 0); starting total ₹950; tapping off
shop-UPI → ₹750; tapping off both person chips → ₹450; "কিছুই না" zeroes and
disables Next; "সব" restores ₹950; a final selection of shop-cash + bus-cash
saved amount 450 / cash 450 / upi 0 with breakdown
`{"shop":{"cash":300,"upi":0},"bus":{"cash":150,"upi":0}}` and the chat echo
"₹450 (দোকান ₹300, বাস কালেকশন ₹150)". No console errors.

sw → chanda-v3.80.1. Client-only. (The one pending server line from v3.80.0 —
`notifData_` sending `breakdown` — still awaits the next Code.gs redeploy.)

## v3.81.0 — The spend side made exact too (E1–E5 from the deep analysis)

Hrishi asked whether the calculations, DB changes, cashier-level changes and
interdependencies were really all done — "I am making this for getting the
perfect report in future development". The audit found the transfer side was
exact but the SPEND side was not:

- **E1 (the real defect): expenses had no cash/UPI split.** The schema carried
  only `amount`, and `myAvailable` assumed every expense was cash. A cashier
  paying a ₹3,000 vendor bill **by UPI** produced `cash −2,800 / upi 5,000`
  instead of `cash 200 / upi 2,000` — reconcile still balanced (totals were
  fine), so nothing screamed; only the split silently lied, and the
  per-category books went negative with it.
- **E2: no record of which pot an expense came from** — general expenses
  drained categories in a fixed order. The same guesswork the handover sheet
  had just eliminated.

Fixed together: `expenses` gains `cashAmount`, `upiAmount`, `srcCat`
(appended at END, migration-safe). The expense flow now asks **নগদ/UPI/দুটোই**
like every other money entry, then — only when more than one pot holds money —
**"কোন খাতের টাকা থেকে খরচ হলো?"** with each pot's real figure; a single pot
is assigned without asking, and a collection expense is charged to its own
round automatically. `myAvailable` subtracts by money type and hits the named
pot. Legacy rows (no split fields) keep the old all-cash treatment via
`isCashOnly`, so existing books don't shift.

Also (E3–E5): the **expenses report** now shows 💵/📱 on the header, per
subject and per row, plus which pot each came from; the **collectors report**
shows each person's cash/UPI split; **"my entries"** shows a handover's
category breakdown; and the **audit log** records cash/UPI + breakdown on
`handover:confirm`.

Verified live: an expense paid by UPI left cash at ₹200 and took UPI 5,000 →
2,000; with two pots funded the flow asked which one and listed
"দোকান ₹2,200 / বাস কালেকশন ₹900"; charging ₹100 to bus moved it 900 → 800;
the expenses report reads "মোট খরচ ₹3,100 · 💵₹100 · 📱₹3,000" with the same
split per subject. No console errors. 146 tests pass (5 new: UPI bill off UPI,
named pot, legacy all-cash fallback, collection expense to its own round).

sw → chanda-v3.81.0. ⚠️ **Code.gs redeploy + `setup()`** needed for the three
new expense columns (and it carries the two earlier pending server lines:
`notifData_` breakdown, audit-log detail). Until then expenses still sync —
the new fields are simply dropped by the old schema, and the client falls
back to the legacy all-cash reading for those rows.

## v3.81.1 — Fix: bus was grouped as "daily" in the sheet/reports, but as a
## new entry on the home screen

Hrishi caught a real inconsistency I introduced and never followed through:
v3.74.1 moved the 🚌 bus tile into the home screen's **নতুন এন্ট্রি** section
(bus names a donor and issues a receipt, unlike the anonymous road/toto
rounds), but the handover sheet and the report tables still grouped `bus`
under **দৈনিক কালেকশন**. Same money, two different parent categories
depending on which screen you looked at — exactly the kind of drift that
makes a "final report" untrustworthy.

Aligned everywhere, one source of truth per grouping:
- handover sheet groups: `entry` = shop/person/member/payment/**bus**,
  `daily` = road/toto
- `CAT_LABEL_KEYS` (drives every report table's order) reordered to
  shop · person · member · payment · **bus** · road · toto · received
- `CAT_LABELS` in the handover flow matched
- `AVAIL_CATS` (legacy drain order) matched, so the fallback order can't
  disagree with what the UI shows
- labels sharpened: `grp_entry` → "📥 নতুন এন্ট্রি (চাঁদা / বাস)",
  `grp_daily` → "🛣️ রোড / টোটো কালেকশন" (matching the home section's
  "আজকের রোড/টোটো")

Verified live side by side: home shows নতুন এন্ট্রি → দোকান | ব্যক্তি | সদস্য
| বাস কালেকশন and আজকের রোড/টোটো → রোড | টোটো; the handover sheet shows
📥 নতুন এন্ট্রি (চাঁদা / বাস) → দোকান | বাস কালেকশন and 🛣️ রোড / টোটো →
রোড | টোটো; the report lists দোকান → বাস → রোড → টোটো. No console errors.
146 tests pass. sw → chanda-v3.81.1. Client-only.

## Rebake config.js for the expense-columns deployment

New `/exec` baked in after Hrishi redeployed Code.gs (New deployment — the
only thing that repoints on this account, see `docs/user-guide/setup-google.md`).
This deployment carries the expense cash/UPI split (`cashAmount`, `upiAmount`,
`srcCat`), the handover `breakdown` in `notifData_`, and the cash/upi detail in
the `handover:confirm` audit row.

Verified the new build is actually serving: `listBackups` reaches its token
gate (`bad-token`) while a nonsense action returns `unknown action` — so the
newer actions exist in the deployed copy, not just in the repo.

Still owner-side: run `setup()` once in the Apps Script editor. Header
migration is append-only (`setup()` lines 62–65), so until it runs the three
new Expenses columns have no header and the split stays device-local.

## v3.82.0 — one identity rule everywhere: byCat can no longer exceed inHand

Found while running the two-user live cycle (Hrishi + Yamini tokens) against the
training sheet: in the central "কার হাতে কত টাকা" report one line disagreed with
itself — `inHand 1100` next to a byCat that summed to `19500`.

CAUSE. `inHandRows` keys every person by `collectorId || collector || '?'`, so a
row whose `collectorId` is blank forms a SECOND identity under the display name.
`myAvailable`/`personalSummary`, though, matched with an extra fallback:

    ck(r) === String(ident) || r.collector === ident        // and h.to === ident

When `ident` was that name-keyed identity, the fallback pulled in every row whose
collector *name* matched — including all the rows belonging to the real username
(`hrishi91`, and the `ram`/`salil` rows carrying the same display name). The
byCat therefore re-counted rows the inHand beside it had assigned elsewhere.

FIX. The same identity rule in all six places (three in `personalSummary`, three
in `myAvailable`), mirrored into `Code.gs`'s `personalSummary_`: a row belongs to
`ident` only when its own group key equals `ident`.

    mine   = r => ck(r) === String(ident)
    isTo   = h => String(h.toId   || h.to   || '?') === String(ident)
    isFrom = h => String(h.fromId || h.from || '?') === String(ident)

Legacy rows are unaffected — with no `toId`/`collectorId` the name IS the group
key, so it still matches.

REACH. Post-Go-Live the sheet starts empty and `push` stamps `collectorId` from
the token unconditionally (A9), so a blank id can now only come from entries made
on a device before login and not yet synced. Narrow, but it showed two disagreeing
money figures side by side in the same report, so it is closed before go-live.

VERIFIED
- new regression test `dual-identity` (one person, id-keyed + name-keyed rows):
  fails 4 assertions on the old code, passes on the new. `154 passed, 0 failed`.
- live dataset re-pulled: 6 in-hand rows, `byCat-sum === inHand` on every one,
  `reconcile.balanced = true`.

Also verified in the same session (unchanged code, first live exercise of the
v3.81.1 bus grouping): Yamini collected shop 600/400 + bus 200/500 + road 300/0,
handed over shop CASH 600 + bus UPI 500, Hrishi confirmed. The per-category
breakdown survived push → pendingHandovers → notifications → confirm; the
receiver's shop/bus pots grew by exactly those amounts with nothing falling into
the legacy `received` lump; the sender kept precisely the other half. A ₹150 cash
expense with `srcCat:'bus'` came off the bus pot and left road untouched, and the
Sheet stored `cashAmount/upiAmount/srcCat` — confirming `setup()`'s column
migration ran on the current deployment.

## Rebake config.js for the A10 server-mirror deployment

New `/exec` after Hrishi redeployed Code.gs carrying the `personalSummary_`
identity fix (A10). No new columns in this one, so no `setup()` run was needed.

## v3.83.0 — one role vocabulary: the cashier gets their job back

Found by the full three-role live pass (admin hrishi91 · cashier jadav90 ·
collector yamini05): 71 of 72 checks green, and the one failure was

    cashier resolveCorrection → {"ok":false,"error":"not-allowed"}

A cashier could NEVER approve a plain collector's correction flag. Only the
admin could — so the cashier role was half-mute.

CAUSE — a regression from my own A9 fix. Entry rows carry `collectorRole` in the
separation-of-duties vocabulary `'admin' | 'cashier' | 'collector'`; the client
had always translated into it (`js/auth.js`, `js/app.js`). A9 moved the stamping
server-side and wrote the raw Users-sheet word instead:

    row.collectorRole = user.row.role || 'collector';   // a collector is 'user'

The Users sheet says `role: 'admin' | 'user'` with a SEPARATE `cashier` flag, so
every collector's row got `'user'` — a word no rule tests for:

    Code.gs resolveCorrection:  targetCollectorRole_(…) !== 'collector' → blocked
    js/app.js canVoid:          (entry.collectorRole || 'collector') === 'collector' → false

The second one is the same bug on the client: a cashier saw NO Undo/void on any
collector's entry. It never surfaced in a live API test because it is pure UI.

FIX — one translation, in one place, used on both write and read:

    roleOf(role, cashier)  → 'admin' | 'cashier' | 'collector'   (way IN)
    rowRole(stored)        → anything not admin/cashier is a collector (way OUT)

Added to `js/aggregate.js` (the shared, tested module) and mirrored as
`roleOf_`/`rowRole_` in `Code.gs`. `push` now stamps `roleOf_(role, cashier)`;
`targetCollectorRole_` and `canVoid` read through the normaliser, which also
heals the rows already written as `'user'`. A9's guarantee is untouched — the
value still comes from the token alone, it is just spelled correctly now.

Call sites unified: `js/auth.js:42` and `js/app.js:211` both had the translation
inline; both now call `Aggregate.roleOf`.

VERIFIED
- 16 new tests (roleOf, rowRole, and the cashier-may-act rule they feed,
  including the legacy `'user'` row): 170 passed, 0 failed.
- browser on a fresh port: `Aggregate.roleOf/rowRole` present and correct, app
  renders, no console errors.
- ⚠️ the server half needs a Code.gs redeploy before the cashier can actually
  resolve a flag; re-run the three-role pass afterwards.

### What the same pass proved green (72 checks, unchanged code)
- role gates: 10 collector-denied, 5 cashier-denied, 2 cashier-allowed,
  4 admin-allowed — every one correct
- A9 holds: a forged `collectorId: 'hrishi91'` from the collector's session
  stored as `yamini05`
- push gating: a collector's GENERAL puja expense rejected, a cashier's accepted,
  a collector's COLLECTION expense accepted
- three-hop chain collector → cashier → admin: shop CASH 1200 + bus UPI 500
  arrived in the admin's shop/bus pots after TWO hops, nothing in the legacy
  `received` lump, each sender left holding exactly the remainder
- a handover addressed to the cashier does NOT show in the admin's queue
- receipt serials unique (2026000021/22), delta pull returns 0 after a full pull
- `srcCat` expense hit the toto pot and left bus untouched; cash/upi/srcCat
  persisted in the Sheet
- A10 mirror: server `myReport` inHand === client `personalSummary` for all
  three roles; byCat sums to inHand on all 7 in-hand rows; reconcile balanced

### Noted for Hrishi, not code bugs
- `yamini05` has an EMPTY reports list — she can open no report at all beyond
  her own summary. Deliberate or not, it is a go-live setting.
- A general puja expense by someone holding nothing drives a category negative
  through the fixed-order `drain()` (seen as `shop: -99` for the cashier in the
  test). The books still reconcile; whether to block over-spend the way the
  handover sheet does is an open question.

## v3.84.0 — one permission key per thing you actually collect

Hrishi: "all the new entry and the daily collection, all will be different
permissions / handover, entry correction will be, taka joma baki will be common".

Before, an admin granted four coarse kinds — `party` (all three donor types at
once), `payment`, `daily` (road+toto+**bus** together) and `handover`. Two things
were wrong with that. Giving someone bus forced road and toto on them, because
bus is a `daily`-store row; and handover — which everyone needs, since a
collector must be able to give their money to a cashier — was something an admin
could switch off.

NOW: six keys, one per category, the same six words the home tiles, the handover
sheet and `byCat` already use.

    ENTRY_KINDS = ['shop', 'person', 'member', 'bus', 'road', 'toto']

A grant and the button it turns on are now literally the same label — the admin
chips render `t('new_shop')`, `t('daily_bus')` … instead of separate `ec_*`
strings that could drift.

Common to everyone, no permission at all:
- **চাঁদা নেওয়া** — a later instalment. The donor may have been written down by
  anyone; whoever is nearest when the money is offered must be able to record it.
- **জমা দেওয়া** (handover) — you cannot hold a collector's money hostage.
- **আমার entry / সংশোধন**, and the **বাকি** list.

`review` (the cashier's correction desk) became its own grant. It rides the same
`entries` field so granting stays one screen; the base requirement is unchanged
(cashier or admin) and, as everywhere here, an empty field means all — so today's
cashiers keep the desk until an admin narrows them.

The year field in Settings is now admin-only. One collector nudging it puts their
whole day in the wrong book, invisibly, and nothing would flag it.

KEY FROM THE ROW, NOT THE STORE. Bus and road live in the same `daily` sheet, so
a store→kind table cannot tell them apart. `permForRow(store, row)` reads the
row's own type; a collection expense hands back the key of the round it was spent
on; stores with no key are common.

MIGRATION: none needed. `listUsers` on the live sheet shows every user with
`entries=''` (= all), so nobody loses anything. Doing this after grants existed
would have needed a translation table.

VERIFIED
- 50 new tests, and a new `serverMirror()` block that loads the REAL `Code.gs`
  and asserts its `ENTRY_KINDS`/`PERM_KEYS`/`permForRow_`/`entryAllowed_`/
  `canReview_` agree with `js/aggregate.js` on every key × user combination.
  A comment claiming "mirrors the client" is now a test. **245 passed, 0 failed.**
- browser: `Aggregate.permForRow/permAllowed` return the right keys for bus,
  road, shop, payment, handover and a collection expense; a bus-only user is
  allowed bus, denied road/shop/review, and still allowed the common actions.
  No console errors.
- NOT yet verified end-to-end: the home tiles and admin chips for a real
  narrowed user, and the server push gate. Both need the Code.gs redeploy and a
  user with an actual grant — see below.

STILL OPEN (next commits in this batch): ledger bus tab + bus out of the daily
report; the handover report; edit-after-flag; admin-only backup import.

## v3.85.0 — bus moves into the ledger, out of the daily report

Hrishi: "in khata tab add bus collection and remove from the other report".

The last place bus was still filed as a street round. A bus collection names a
donor and issues a receipt, exactly like a shop — that is why the home screen and
the handover sheet already group it with the new entries. The 📒 ledger now has a
🚌 **বাস** tab listing every bus collection (name, number, date, collector,
receipt serial, with a total on top); tapping a row opens that receipt. The
`daily` report is now road and toto only, on both the client and the server, and
its label says so instead of "রোড/টোটো/বাস".

The money did not move — bus still counts in every total, still sits in its own
`byCat` pot, and still reconciles. Only the grouping changed, so the same money
is no longer shown under two different headings.

LEDGER TABS NOW FOLLOW PERMISSIONS. Hrishi: "what collection permissions the user
will have they can see in khata also the same". The type chips (দোকান · ব্যক্তি ·
সদস্য · বাস) render only for granted categories. **সব** and **বাকি** always show,
because taking a later instalment is common to everyone — you must be able to look
any donor up and see what is still owed. If the current filter is one the user may
not see (permissions changed under them), it falls back to সব rather than showing
an empty screen.

DROPPED a redundant strip from "আমার হিসাব": it showed road/toto/bus totals right
above `byCatHTML`, which already lists every category with its cash/UPI split AND
groups bus with the new entries. The strip repeated the same money under the older,
now-wrong grouping.

VERIFIED
- 6 new tests including the money-is-not-lost pair (bus still in `computeTotals`,
  still in its own `byCat` pot), plus a new mirror assertion that `Code.gs`
  `computeReport_('daily')` excludes bus exactly like the client. **251 passed, 0 failed.**
- browser: `computeReport('daily')` returns `{road:300, toto:200}` with no bus row
  and no bus bucket, while `computeTotals` on the same data still reports 1400.
  No console errors.
- NOT verified end-to-end: the ledger tab itself needs a logged-in session, so it
  gets checked on the live deployment with the three tokens after the redeploy.

## v3.85.1 — categories on the other-people's-donor screens, বাকি becomes a toggle

Hrishi: "onno karo data baki … screen also should have categories as sob, dokan,
bakti and all remaining needy categories".

"দাতা খুঁজি" — the screen for taking a later instalment from a donor anyone may
have written down — had only a search box. It now carries the same category chips
as the ledger.

And **বাকি stopped being a category**. It was a fifth chip beside দোকান/ব্যক্তি/
সদস্য, so choosing it threw the category filter away and brought every type back
mixed together — there was no way to ask "which SHOPS still owe". It is now a
separate toggle, so দোকান + শুধু বাকি, ব্যক্তি + শুধু বাকি … all work, on both
screens.

One shared `typeChips()` renders them on both, so the two screens cannot drift.
Chips mirror what the person may collect; **সব** always shows, because taking an
instalment is common to everyone and any donor must be findable. Bus appears only
in the ledger — you take instalments from donors, and a bus pays once, with a
receipt.

VERIFIED: 251 passed, 0 failed; app loads with no console errors. The screens
themselves need a logged-in session, so they are on the post-redeploy list with
the ledger bus tab.

STILL OPEN in this batch: the handover report, edit-after-flag, admin-only backup
import — and one question back to Hrishi about what "categories" means on জমা নাও.

## v3.85.2 — "অন্য কারো দাতা" now really means other people's

Hrishi: "there should not be users data, onno means others data".

The screen is literally called *অন্য কারো দাতা — বাকি জমা নাও*, but it listed
every donor in the book, one's own included. So it was the 📒 ledger's list a
second time, with the donors you actually opened it for buried among your own.
It now filters out rows whose collector is you.

(That label is also what Hrishi meant by "onno karo data baki joma nao screen" in
the previous message — one screen, not three. My question about adding category
chips to the cashier's জমা নাও screen was a misreading and is withdrawn.)

The hint and the empty state now say where one's own donors are, so the split
between the two screens is stated rather than left to be discovered:
  "এখানে শুধু অন্য collector-দের তোলা দাতা — নিজেরগুলো 📒 খাতায়।"

Note for Hrishi, not changed: the 📒 ledger still shows EVERYONE's donors. With
this screen now scoped to others, the natural pair would be ledger = mine,
this = theirs. Left alone because he did not ask for it — worth a decision.

VERIFIED: 251 passed, 0 failed; app loads clean. The screen itself needs a
logged-in session — on the post-redeploy list.

## Rebake config.js for the permissions + bus-grouping deployment

New `/exec` after Hrishi redeployed Code.gs carrying v3.83.0–v3.85.2's server
halves: the `roleOf_`/`rowRole_` role vocabulary (A11), the six-key permission
model with `permForRow_`/`canReview_`, and the daily report excluding bus.
No new columns in this batch, so no `setup()` run was needed.

## v3.86.0 — an expense stops wandering between categories

Caught by the three-role pass on the fresh deployment: one check wanted the
cashier's shop pot at 1200 and got 1002. The 198 was two ₹99 general puja bills
the same script had pushed earlier — and they had moved.

    holding 1000 toto, one 198 bill      → { toto: 802 }
    …then 1200 of SHOP cash arrives      → { toto: 1000, shop: 1002 }

The bill jumped from টোটো to দোকান. Nothing about the bill changed; unrelated
money arrived.

CAUSE. An expense with no `srcCat` fell through to the fixed-order `drain()`,
which subtracts from whichever pots hold money AT THE MOMENT OF CALCULATION, in
`AVAIL_CATS` order. Shop precedes toto, so the moment shop had money the bill
was charged there instead. The total in hand was right both times (reconcile
balanced throughout) — but the per-category split was not reproducible, and this
is the split every future report is built on.

WHY THE FIELD WAS BLANK. The expense flow did ask which pot, but only
`showIf: potOptions.length > 1`. Hold nothing, or hold exactly one category, and
the question never appeared — so `srcCat` stayed empty and the row fell into the
drain. Exactly what happened to the cashier, who held nothing when he paid.

FIXED, three parts:
- **The question is always asked**, and **`অন্যান্য (নির্দিষ্ট নয়)` is always on
  the list**, so a new row can never be written without a source.
- A NAMED pot is charged **even when empty**. Going negative there is honest —
  "this pot owes" — and Hrishi's rule is that negatives get squared up later by
  exchanging cash. Quietly borrowing from another category would hide it.
- `other` is a real category, last in `AVAIL_CATS`, and it is where the
  over-drain remainder now lands instead of "whatever is first" (which was shop).

`drain()` survives for one reason only: rows written before `srcCat` existed. A
test pins that old behaviour so the change cannot rewrite history.

Nothing to mirror in `Code.gs` — it has no `byCat`/`drain` logic at all; every
client computes its own.

VERIFIED
- 9 new tests: the bill parks in `other` and stays there when a shop handover
  arrives, toto is never touched, the arriving money is not eaten, a named-but-
  empty pot goes negative instead of borrowing, the total in hand is unchanged
  by any of it, and pre-`srcCat` rows keep the old drain. **260 passed, 0 failed.**
- browser, same scenario: `{toto:1000, other:-198}` before, `{toto:1000,
  shop:1200, other:-198}` after, total 2002. No console errors.

## v3.87.0 — other people's money gets its own portion on the handover sheet

Hrishi: "in hand over we have not shown the handed over amount from other users,
it also can be handed over to other users" → then, choosing the shape: category-
wise, in a separate portion, **with the giver's name**.

Money handed to a cashier used to be merged straight into the category totals.
Jadav collecting ₹500 of shop cash and being handed ₹1200 of shop cash by Yamini
read as one line, **দোকান ৳১৭০০** — no way to see whose it was. The sheet now has
a third portion:

    🤝 অন্যের কাছ থেকে পাওয়া
      🧑 Yamini mahato            💵১২০০ · 📱৫০০ · ১৭০০
         দোকান          💵 ১২০০      —
         বাস কালেকশন     —          📱 ৫০০
      🧑 Biplab                    💵৩০০ · 📱০ · ৩০০
         রোড কালেকশন    💵 ৩০০       —

THE APPROXIMATION I WAS BRACED FOR NEVER ARRIVES. Asking "how much of Jadav's
remaining shop cash is still Yamini's" is unanswerable after a second hop — the
outgoing row records category and money type, not whose parcel it came from. I
had planned a first-in-first-out convention to guess it. Hrishi's choice of a
per-giver screen removes the guess entirely: **the giver taps a named line, so
the selection IS the provenance.** Each chip carries `data-src` (a username, or
`__own`), and the outgoing breakdown records it:

    {"shop": {"cash":1200, "upi":0, "src": {"yamini": {"cash":1200,"upi":0}}}}

DB: **no new column, no `setup()`.** `breakdown` is already one JSON cell, and
`src` nests inside each category, so `Object.keys(bd)` still yields category
names and `.cash`/`.upi` still read the same. Old rows have no `src` and are read
as one's own money — which is what they were, since nothing else could be passed
on before parcels were tracked. `Code.gs` is untouched: breakdown is an opaque
string to it, and it computes no `byCat` at all.

`myAvailable` now also returns `byGiver` (parcels still held, by giver, category-
wise) and `byCatOwn` (category totals minus every parcel). `byCat` is unchanged,
so reconcile and every existing report read exactly what they always did.

Edge case handled: a cashier holding ONLY other people's parcels and none of
their own still gets the sheet — the old gate was `categories.length`, which
would have dropped them to manual typed entry with nothing selectable.

VERIFIED
- 15 new tests, including the one that matters — own + every parcel adds back up
  to `byCat` exactly, so nothing is counted twice — plus: passing Yamini's money
  leaves own money alone, passing own money leaves her parcel untouched, and a
  pre-`src` row reads as own money. **275 passed, 0 failed.**
- browser, the same three-way scenario: own `{shop:500}`, Yamini `1700` split
  `shop 1200 / bus 500 upi`, Biplab `300 road`. No console errors.
- NOT verified end-to-end: the sheet itself needs a logged-in session — on the
  post-redeploy list with the ledger tabs.

STILL OPEN: "কাকে কত জমা দিয়েছি, নাম ধরে + category-wise" in আমার হিসাব (next),
then the handover report, edit-after-flag, admin-only backup import.

## v3.88.0 — "কাকে কত জমা দিয়েছি" in আমার হিসাব

Hrishi, asked what to add to the personal summary: "কাকে কত জমা দিয়েছি, নাম ধরে"
— and category-wise.

আমার হিসাব had a single **জমা দিয়েছি** number. Whether that ₹2,100 went to one
person or three, and out of which categories, was not recoverable from the
screen. It now lists each receiver by name with cash / UPI / total, and under
each the categories that went to them:

    🤝 কাকে কত জমা দিয়েছি
      🧑 Jadav mahato          💵১২০০ · 📱৫০০      ১৭০০
         ⏳ অপেক্ষায় ২৫০
         দোকান — 💵১২০০ · 📱০
         বাস কালেকশন — 💵০ · 📱৫০০
      🧑 hrishikesh mahato     💵৪০০ · 📱০         ৪০০
         রোড কালেকশন — 💵৪০০ · 📱০

Nothing is derived: an outgoing handover already names its receiver and carries
the breakdown, so this is that record read back the way a person would ask for
it. No schema change, no server change.

Money still awaiting the receiver's confirmation is shown on its own line and is
NOT counted as handed over — it is still the giver's until confirmed, which is
the same rule `inHandRows` and `myAvailable` have always used.

VERIFIED
- 12 new tests, the load-bearing two being that the per-receiver rows add up
  to the summary's own `handedOver` and `pending` figures — so the detail can
  never drift from the total printed above it. Also: a pending row is kept out
  of the categories, and a pre-breakdown row still counts, filed under `other`
  rather than having a category invented for it. **287 passed, 0 failed.**
- browser, three handovers to two people: `handedOver 2100`, `pending 250`, and
  the two rows split 1700 / 400 with their categories. No console errors.

STILL OPEN: the handover report, edit-after-flag, admin-only backup import.

## v3.88.1 — the handover sheet can no longer offer money that is gone

Hrishi's doubt, and he was right: "otherwise cash will be in other hand and the
application will say different one user is having the amount."

Two things were asked. The first turned out to be fine — money bouncing between
cashiers was tested through four hops with the money returning to where it
started (Yamini → Jadav → Hrishi → Salil → Jadav): nothing doubled, nobody went
into debt, reconcile balanced. Note that after the round trip Jadav's parcel
reads **"from Salil"**, not "from Yamini" — which is right, since who last handed
it to you is who you would ask about it.

The second was a real defect:

    Jadav collected 500 · Yamini handed him 1200 · he spent 1500

    books  : own −1000 (a debt) + Yamini 1200 = 200   ✅
    pocket : 200                                       ✅
    screen : "hand over Yamini's 1200"                 ❌

His rule stands and the code already follows it — an expense always comes out of
what YOU collected, never out of somebody else's parcel, and a category goes
negative only when you spent more than you collected. That is exactly the
"exceptional case" he described, and the books handle it correctly.

But the notes physically left the pocket, so a parcel must not keep claiming
them. `myAvailable` now writes any negative own balance off against the parcels
(largest first) and floors own at zero — **for display only**. `byCat` keeps the
negative, so reconcile, `inHandRows` and every report read exactly what they read
before. A parcel emptied this way disappears instead of lingering at zero.

    spend    in hand   byCat    own   parcel   offered
        0       1700    1700    500     1200      1700  ✅
      500       1200    1200      0     1200      1200  ✅
     1500        200     200      0      200       200  ✅  (was offering 1200)
     1700          0       0      0        0         0  ✅

NO DB CHANGE, no `setup()`, no new question in the expense flow — Hrishi
explicitly ruled those out. The ledger behaves exactly as before; only the screen
stopped lying.

VERIFIED
- 19 new tests: for each of the four spend levels, what the sheet offers equals
  what is actually in hand; plus `byCat` is unchanged by the write-off, the books
  still reconcile, and a fully spent parcel is not offered at all.
  **306 passed, 0 failed.**
- browser, same four cases: `matches: true` on every one. No console errors.

## v3.89.0 — a cashier types an amount; a collector picks categories

Hrishi, after several rounds of me getting it wrong: "here the user will not be
able to select the category wise amounts as collector can select … there will be
extra fields with total amount, spends, available amount … going to transfer
amount, amount entry by user."

TWO SCREENS, because the two jobs are genuinely different.

A **collector** knows which round each note came from, so they pick categories
and the handover carries an exact per-category breakdown. **Unchanged.**

A **cashier/admin** holds money pooled from many people. Asking them to
attribute it category by category is guesswork dressed as precision — and slow.
They now get their position laid out read-only, then type one cash figure and
one UPI figure:

    📥 নতুন এন্ট্রি (চাঁদা / বাস)      💵১০০০ · 📱২০০    ₹১,২০০
    🛣️ রোড / টোটো কালেকশন           💵৪০০  · 📱১০০    ₹৫০০
    🤝 অন্যের কাছ থেকে পাওয়া
       🧑 Yamini mahato             💵১২০০ · 📱৫০০   ₹১,৭০০
       🧑 Biplab                    💵৩০০  · 📱০      ₹৩০০
       মোট এসেছে                    💵২৯০০ · 📱৮০০   ₹৩,৭০০
       খরচ                          💵৫০০  · 📱০      ₹৫০০
       আগে পাঠিয়েছি                 💵২০০  · 📱০      ₹২০০
       হাতে আছে                     💵২২০০ · 📱৮০০   ₹৩,০০০

THE CAP IS ON THE TOTAL ONLY. Cash and UPI are not checked separately: a cashier
may settle a UPI balance in notes or the other way round, so ₹2,500 cash out of
₹2,200 cash held is fine as long as the total fits. Over the total, the figure
turns red and Next is dead.

TWO INVENTED RULES DELETED. v3.88.1 wrote overspend off "the largest parcel
first"; v3.87.0 recorded which parcel a handover came out of. Hrishi challenged
the first with the right question — "how are you deciding the deduction from
where?" — and the answer was that I had decided, not him. Both are gone. 🤝 now
means simply **"who has handed me money, and how much"**, which is a fact the
handover rows already state; what is actually left is the `হাতে আছে` line.

CONSEQUENCE, on purpose: the category trail ends at the cashier hop. What
reaches the next person is recorded as "handed over by Jadav", with a snapshot
of where Jadav stood at that moment — `{"__snap": {totalIn, spent, sent,
available}}`. Categories survive where they are real: the collector→cashier hop,
and everyone's own summary.

`আগে পাঠিয়েছি` counts PENDING handovers as well as confirmed ones. Everywhere
else pending stays with the giver — the receiver has not acknowledged it, so the
giver still answers for it — but for "what can I hand over right now" that money
is already out of the pocket, and counting it as available would let the same
notes be promised to two people.

NO DB CHANGE, no `setup()`, no `Code.gs` change. `breakdown` is one JSON cell;
keys beginning `__` are reserved metadata and `parseBd` now filters them, so a
snapshot can never be misread as a category.

VERIFIED
- 16 tests on `cashierView`, the load-bearing one being that its `হাতে আছে`
  equals `myAvailable` exactly — otherwise a cashier could promise money the
  reports say is elsewhere. Plus: a pending handover is already out of the
  pocket, and a `__snap` row reaches the receiver as a named parcel with the
  full amount and no phantom category. **287 passed, 0 failed.**
- rendered the real screen in the browser at mobile width with the real
  stylesheet and real `cashierView` figures, and showed Hrishi the picture
  before committing: ₹2,000+₹1,500 → red, warning, Next disabled;
  ₹2,500+₹500 → ₹3,000, Next live (cash over the cash held, total within).

## v3.90.0 — 📗 জমা-খাতা: what came in and what went out, in one place

Hrishi: "under handover we should see the below report … how much amount you got
from others, how much amount you sent … both will be available sent and received"
— and separately, "in handover list received will be different part and send will
be different part for cashier and the admin".

A new personal screen, `handoverReport(data, ident)`:

    📥 পেয়েছি              💵১৫০০ · 📱৫০০   ₹২,০০০
    📤 পাঠিয়েছি             💵৬০০  · 📱৩০০    ₹৯০০
    ⏳ পাঠিয়েছি (confirm বাকি) 💵৪০০ · 📱০     ₹৪০০
    [ সব | 📥 পেয়েছি | 📤 পাঠিয়েছি ]
    📤 সলিল             23 Jul  ⏳            ₹৪০০
    📤 hrishikesh mahato 22 Jul ✅            ₹৯০০   ← tap: পাঠানোর সময়ের অবস্থা
    📥 Yamini mahato    20 Jul  ✅          ₹১,৭০০   ← tap: দোকান ৳১২০০ · বাস ৳৫০০

Tapping a row opens whatever detail its sender recorded — a collector's rows have
the categories they picked, a cashier's have the snapshot of where they stood.
Rows older than either feature simply show the amount, with nothing invented to
fill the gap.

Personal, so no report permission gates it, and it reads the local snapshot, so
it works with no signal — unlike the cashier's confirm screen, which needs the
network for the pending queue.

জমা নাও now has BOTH parts for cashiers and admins: 📥 pending, 📥 confirmed, and
📤 what they have sent (last 15), with a link into the full book. The sent side
comes from the local snapshot, so it is there even when the pending fetch is the
only thing that needed the network.

Extracted `wireNav()` while doing it: the `data-go` tile routing was inline in
`renderHome`, so any other screen offering a tile would have had to duplicate it.

VERIFIED
- 16 new tests. The ones that matter: the book's totals equal
  `personalSummary`'s `handedOver` / `received` / `pending` — three numbers a
  user can see side by side, so they must never drift. Also: other people's
  handovers stay out of my book, a `__snap` row yields no phantom category, a
  breakdown-less row yields none either, and a voided handover leaves the book
  like it leaves everything else. **303 passed, 0 failed.**
- browser: totals and row shapes as expected, no console errors.

## v3.91.0 — fix your own flagged entry yourself

Hrishi: "in amar entry and songsodhon after flagging, the made entry user can
edit the entry also if needs" — and, when asked who: "the entry made user only
can edit".

A flagged entry of your own now carries **✏️ ঠিক করি**. It reopens the same flow
with today's values already in the boxes, so a one-field fix is one tap on Next
for everything else.

APPEND-ONLY IS INTACT. An edit does not rewrite the row: `finishFlow` writes a
**void** for the old one (`reason: 'edit — <the flag reason>'`) and then saves a
new row. It reads as an edit; the book keeps both. Three reasons:

1. "What did it say before, and who changed it" always has an answer.
2. A receipt serial is not silently reused under different figures.
3. Sync. The row is already on the server and pulled onto every phone. A void
   plus a new row is two appends, so the existing delta pull carries it
   everywhere on its own. An in-place field edit would need every device to
   re-read and overwrite its local copy, and `syncNow` marks rows synced BY ID —
   an edited row would re-enter the queue and race that pass. That race is
   bug A1, already fixed once; there is no reason to reopen the class.

(Hrishi caught a wrong justification here: an earlier draft claimed two phones
could otherwise merge halves of two different edits. They cannot — only the
author may edit, so there is no second editor. The real concurrent case is the
AUTHOR editing while a cashier voids the same row: append-only gives two voids
on one target, which is harmless because voided ids are a set. A field-level
update would leave an altered row next to a void, with no way to tell which won.)

WHO AND WHAT. Only the person who made the entry, only after they have flagged
it (they have declared it wrong, and nobody knows better than they do what it
should say), and only `payments` / `daily` / `expenses`. Handovers are excluded
on purpose: they have two sides and are settled by confirming, not editing.

The cashier's review desk now hides flags whose target has already been voided —
otherwise a settled flag would invite a second void on a row that is already gone.

Two small things done along the way:
- `startFlow` gained an `editing` mode. A normal flow SKIPS steps whose answer is
  already known (presets are context); an edit is the opposite — every answer is
  known, and the point is to walk through them. Text boxes open prefilled and the
  current chip shows as selected.
- `fix_btn`, not `edit_btn`: `edit_btn` already existed for the admin lists, and
  in a JS object literal the later key silently wins — my label would have
  overwritten theirs. Added a check over the whole table afterwards: 373 keys,
  no duplicates.

VERIFIED: 303 passed, 0 failed; app loads clean. The button itself needs a
logged-in session with a flagged entry, so it joins the post-redeploy list.

KNOWN, not changed here: the server does not gate the `voids` store at all —
`permForRow_` returns null for it, so any authenticated client may push a void.
The UI has always gated this (`canVoid`), and this change makes collectors write
voids legitimately for the first time. Worth a server-side rule, but that is a
Code.gs change and a redeploy, so it is listed rather than slipped in.

## v3.91.1 — a correction keeps the original receipt number

Hrishi asked which is better, and then answered the question that decides it:
"no paper, this only" — the app's receipt is the only one there is.

So a corrected entry carries the ORIGINAL serial. The donor already has
2026000021 on their phone; re-sharing under the same number replaces that
message, while a fresh number would leave them holding two receipts for one
donation and wondering which is real. At the counter, "read me your receipt
number" stays a single lookup.

It also keeps the serial meaningful — it counts receipts issued, not rows ever
written, so fixing one typo three times does not burn three numbers.

The implementation is a carry, not an override: the server mints only when the
field is empty (`if (isNew && !row.receiptNo …)`), so passing the old serial
through is exactly what stops a second one being drawn.

Checked before deciding: `receiptNo` is never a lookup key or a uniqueness
constraint anywhere — it is displayed, printed on the receipt image, and
adopted by `sync.js` after a push. Two rows end up carrying the number, one of
them voided; among ACTIVE rows, the only rows anything reads, it stays unique,
and the void beside it is the explanation.

Would have been the other way with a paper receipt book: a spoiled leaf is
cancelled and the next number issued, and the app would have to match the paper.

VERIFIED: 7 new tests — the corrected figure is counted once and only once in
`computeTotals`, `paidByParty`, `myAvailable` and `personalSummary`, and the
party's due follows the corrected amount (1000 pledged − 700 = 300), not the
sum of both rows. **310 passed, 0 failed.**

## v3.92.0 — the receipt now goes out with words, on both channels

Hrishi: "at time of this receipt send we should add some message to it" — and
then, checking: "are you doing this for message and whatsapp both".

FOUND WHILE LOOKING. The image share was passing a field that does not exist:

    navigator.share({ files: [file], title: …, text: rc.donorName })

`rc` has `donorLine`, never `donorName` — so every receipt shared as an image
went out with an `undefined` caption. The SMS path (`shareReceiptText`) built a
proper message; the image path had none.

Now ONE function, `receiptMessage(rc)`, feeds both, so the WhatsApp caption and
the SMS body cannot say different things:

    🙏 দৌলতপুর আমরা ক'জন
    চাঁদা পেয়েছি — ধন্যবাদ 🙏

    রাম স্টোর্স (মেন রোড — মালদার দিকে)
    টাকা: ₹৭০০/- (সাতশো টাকা মাত্র)
    জমা: ৭০০/১০০০   বাকি: ৩০০
    রসিদ নং ২০২৬০০০০২১ · ২৬ জুলাই ২০২৬
    <committee footer from config>

HONEST LIMIT, stated rather than promised away: `navigator.share({files, text})`
keeps the text as a caption on Android WhatsApp but iOS frequently drops it when
a file is attached. That is the target app's behaviour. Nothing is lost when it
happens — every word above is also drawn inside the receipt image.

WHICH IS WHY THE CORRECTION STAMP GOES IN THE IMAGE. v3.91.1 made a corrected
entry keep its original serial, which means the donor receives a SECOND message
carrying the SAME number. Without a word of explanation they would reasonably
think they had been counted twice. So `♻️ সংশোধিত` is drawn on the receipt under
the serial, not only put in the caption — a caption is exactly the part an app
may throw away, and this is the one line that must survive.

The flag is derived, not stored: on opening a receipt, if a VOIDED row carries
the same serial, this one replaces it.

VERIFIED: 310 passed, 0 failed; app loads clean; 376 i18n keys, no duplicates.
The share sheet itself is a device behaviour — it needs a real phone, so it goes
on the go-live smoke test with the mic and the install prompt.

## v3.93.0 — restoring a backup files it under the right person; voids get a rule

Two things, both server-side, so they ride one redeploy.

### Import is admin-only, and it asks whose book it is

Hrishi: "backup file ferot ano only admin, he will select the user inside".

The Settings screen's **Import backup** button was visible to everyone. It
rewrites the device's whole book from a JSON file — in a collector's hands that
is a way to quietly ruin your own figures, and no collector has a reason to use
it. Admin only now.

The harder half: a backup file usually comes off a collector's dead or wiped
phone, and every row in it is theirs. Importing it as the admin would have
stamped the lot with the admin's name and inflated their in-hand by a whole
collector's takings. So between choosing the file and writing anything, the
admin now picks the owner from the approved-user list, and every row is stamped
with that person. ("Keep as written" is still offered, and is the only option
when offline, since the user list needs the network.)

That required an exception on the server, stated plainly because it touches A9:
`push` takes identity from the token and only from the token — EXCEPT that an
**admin** may name another user in `collectorId`, in which case the row is filed
under them. Only an admin, only when the named user exists, the role word is
re-derived from the Users sheet rather than trusted, and every batch writes a
`restore:attribute` line to the audit log. An admin can already reassign
anything by editing the Sheet directly; this makes the supported path do it
visibly instead of forcing them into the raw sheet.

### `voids` finally has a server-side rule

Flagged in the v3.91.0 note as known-and-not-fixed: `permForRow_` returned null
for `voids`, so any authenticated client could void any row. The UI has always
gated it (`canVoid`), but v3.91.0 made collectors write voids legitimately for
the first time, and a rule the server does not enforce is not a rule.

`voidAllowed_` now mirrors `canVoid`, plus the two paths that void one's OWN
row — Undo straight after saving, and correcting a flagged entry:

    admin    → anything
    cashier  → a plain collector's entry, and their own
    anyone   → their own entry
    unknown target → refused, not waved through

VERIFIED
- 10 new tests over the decision table, including the ones that matter most:
  a collector may void their own row but never anybody else's, and a cashier may
  not void another cashier's. **320 passed, 0 failed.**
- app loads clean, no console errors.
- NOT verifiable until the redeploy: the server gate itself and the admin
  attribution. Both go into the three-role pass right after.

## v3.94.0 — clear the practice data; reaching other people's donors is a grant

Two more before the redeploy, so they ride the same one.

### 🧹 Clear practice data (admin, training only)

Rehearsals leave the book full of junk, and until now the only way out was Go
Live — which is one-way. `clearTraining` does the same clearing as `goLive` (every
transactional sheet, and the `receiptSeq_` counters so numbering restarts) but
does NOT set `live_mode`, so the next rehearsal starts clean and you can do it
again tomorrow.

Essentials survive because they were never in `SHEETS`: **Users, Config, Lists
(areas/locations), ExpenseSubjects and Audit** are separate, so approvals,
permissions, area duties, expense subjects and receipt settings all stay.

Three guards:
- **Refused once live** (`already-live`). After go-live this button would read
  "delete the whole year's takings", and no amount of confirming makes that
  something a phone screen should offer.
- **Mandatory backup first**, same reasoning as goLive — losing practice data is
  survivable, losing it with no copy is not.
- Typed `CLEAR`, plus `confirm: 'CLEAR'` checked server-side as well.

`data_epoch` is bumped, and the admin's own device runs `DB.clearAll()` before
re-pulling — otherwise that phone would keep showing rows the sheet no longer has.

### 'otherdonor' — reaching a donor somebody else wrote down

Hrishi: "যেকোনো দাতা খুঁজে জমা নাও — this screen also should be with permission".

This narrows an earlier decision of his, deliberately. Taking a later instalment
from **your own** donor stays common to everyone; what now needs a grant is the
screen that shows one collector **the whole committee's donor list**. That is not
every collector's business, and it is the difference between "record the money in
front of you" and "browse everyone's book".

Eighth permission key, same field, same empty-means-all rule. The ROUTE is
guarded as well as the button — Back and history can reach a screen whose button
is hidden.

VERIFIED
- 5 new tests: the key exists on both sides, a narrowly-granted user is denied it,
  an empty grant still means all, an admin is never narrowed, and — the one that
  keeps the earlier decision intact — `permForRow('payments', …)` is still `null`,
  so recording a payment remains common. **329 passed, 0 failed.**
- browser: `PERM_KEYS` now has 8 entries and a bus-only user is denied
  `otherdonor`. No console errors.
- NOT verifiable until the redeploy: `clearTraining` itself. It is destructive by
  design, so it gets tested on the training sheet right after, before go-live.

## v3.95.0 — the admin panel becomes readable, and a permission means granted

### One user open at a time

Hrishi: "redesign the admin panel, it's not user friendly … check if there is
any unnecessary fields".

Counted before touching anything: an approved user's card carried **23 chips and
4 explanatory lines**, and every user was expanded at once. For this committee —
12 users — that is **~280 chips on one screen**. Not a list anybody can read.

Now the list shows a name and one summary line ("বাস কালেকশন, টোটো কালেকশন · ২
রিপোর্ট · ১ এলাকা"), so it can be read without opening anyone, and tapping a
name expands that user IN PLACE. One open at a time — Hrishi chose the accordion
over a separate screen so setting one person's permissions and moving to the
next needs no going back.

Chips still work one by one. `[সব দাও] / [সব নাও]` are shortcuts on top, because
granting seven reports to eleven people was 77 taps.

Phone and year moved inside the open card; the repeated explanation lines now
print once, in the user actually being edited, instead of twelve times.
`অন্য কারো দাতা — বাকি জমা নাও` — a whole sentence as a chip label, mine from
yesterday — is now `🔍 অন্য কারো দাতা`.

### A permission is something you are GIVEN

Hrishi: "permission means all opened it is not correct."

He is right, and `reports` has always agreed with him: an empty `reports` field
grants no reports. `entries` was the odd one out — empty meant ALL, so approving
somebody silently handed them the entire app. Both now read the same way:

    permAllowed(user, key) → String(user.entries).split(',').indexOf(key) >= 0

The four common actions are unaffected (they pass a null key): handing money
over, taking a payment from a donor you wrote down yourself, my entries / fix,
and the dues list. A collector granted nothing can still do those.

**CONSEQUENCE, and it is not small.** `listUsers` on the live sheet right now:
**11 approved users have `entries=''`**. Under the old rule that meant "may do
everything"; under the new one it means "may do nothing". After the redeploy
Hrishi must grant each of them, which is one `[সব দাও]` tap per person.

So the screen says it rather than leaving it to be discovered: the summary line
reads **⚠️ কিছুই দেওয়া হয়নি**, and inside the card a red line spells it out —
"this user cannot make any entry".

### And a bug the redesign flushed out

Toggling one chip on a user with an empty field used to first "materialise all",
using the RETIRED key names (`party/payment/daily/handover`). The server filters
unknown keys, so switching one thing OFF left that user with only that one thing
ON — the exact opposite of the instruction. Empty now means empty, so the whole
materialise step is gone and a toggle is a plain add/remove.

VERIFIED
- 333 passed, 0 failed. The mirror test caught the knock-on itself: a cashier
  with nothing granted no longer gets the correction desk, which is right under
  the new rule and had to be re-stated.
- browser on a FRESH port (the service worker served stale JS on the old one and
  briefly showed the old answers — the pitfall is in memory for exactly this):
  a user with nothing granted is denied shop, review and otherdonor, still
  allowed the common actions; a bus-only user is allowed bus and denied road; an
  admin is never narrowed; `allowedReports` still returns `[]`.

## v3.96.0 — nothing granted means an empty home with a phone number, and a committee chat

### A home that explains itself

With `entries` empty now granting nothing, a collector's home would have been a
hero bar and blank space. Hrishi: hide the money buttons too — "same applied for
all, cashier or collector". Right: somebody who collects nothing has no money to
hand over and no book to read. So a user with no grants sees one card —
**⚠️ তোমাকে এখনও কিছু দেওয়া হয়নি** — the admin's name, and 📞 / 💬 buttons.

The out-of-app channel is the point. Somebody locked out of the app cannot be
helped by something inside it, so `tel:` and `wa.me` links are what that card
carries.

Flagged to Hrishi and he confirmed the rule anyway: a cashier granted nothing
also loses জমা নেওয়া, so collectors' handovers would sit unconfirmed. The fix is
to grant the cashier anything at all — even just the correction desk — and the
card tells them who to ring.

### 💬 Committee chat

One window, everyone in it, `@` to call a person or a group.

THE DESIGN IS DECIDED BY ONE NUMBER. The app already pulls every 60 seconds. Put
messages in `SHEETS` and they ride that pull — push, delta cursor and the void
filter all come free, and chat costs **not one extra request**. A separate 10s
poll would be ~10,800 calls/day against an Apps Script consumer quota of 90
minutes of runtime, which it would exhaust by mid-afternoon. So this is
"messages within a minute", not instant, and Hrishi accepted that trade.

- `@` opens a picker: **@all · @cashiers · @admin** plus every approved user, so
  a name is never spelled from memory — a typo'd mention notifies nobody.
- The `mentions` column is derived from the text at send time, so what you typed
  and who gets notified cannot disagree.
- Group membership is resolved at READ time, not stored: promote somebody to
  cashier and every past `@cashiers` message becomes theirs.
- Unread count on the 💬 tab, red when you were mentioned; opening the screen is
  the read receipt.
- No permission gates it — Hrishi: "for it no need any permission". It is also
  the one thing a user with nothing granted can still use.

Bottom nav is now five tabs. Measured at 320px: 64px each, no label clipped.

`DB` version bumped 4 → 5; without it `onupgradeneeded` never runs and the new
object store is never created on a phone that already has the database.

VERIFIED
- 13 new tests on the mention rules, including the ones with teeth: an admin
  counts as a cashier for `@cashiers` (as everywhere else in this app), your own
  messages are never unread, the seen marker clears the count, and a voided
  message leaves the feed like every other store. **346 passed, 0 failed.**
- browser on a FRESH port: five tabs render, 64px each at 320px width with no
  clipping, `DB.STORES` carries `messages`, no console errors.
- NOT verifiable until redeploy: the `Messages` sheet itself. **This one needs
  `setup()`**, unlike the last few.

## v3.96.1 — a mention actually reaches the phone, and the rule holds on every screen

Two gaps in what v3.96.0 shipped, both against things Hrishi had already said.

### "the message will be as notification to the user"

v3.96.0 gave mentions an unread badge on the 💬 tab and stopped there — an OS
notification was in the spec and was not built. It is now, and it hangs off the
pull rather than a timer of its own, because that is the only place messages
arrive:

    pull (every 60s) → viewData() → checkMentionNotify()

Two things it has to get right, and both are easy to get wrong:
- **Never buzz twice for the same message.** The last announced id is kept, so a
  second pull or a re-render cannot repeat it.
- **Never buzz on startup for something already read.** The first run after a
  reload only primes the marker; it does not notify. Otherwise opening the app
  would replay a mention read on another device an hour ago.

### The no-grant rule applies everywhere, not just home

v3.96.0 emptied the home screen but left 📒 খাতা reachable from the nav — so a
collector granted nothing could still browse the committee's entire donor book.
That is exactly the thing Hrishi asked to hide.

`hasAnyGrant()` is now one function used by every screen, so the ledger and the
reports cannot disagree with home about whether somebody is set up:

    home       → the card, nothing else
    📒 খাতা     → the card
    📗 জমা-খাতা → the card (reachable by Back even with its tile hidden)
    📊 রিপোর্ট  → own summary stays (it is their own money), card above the
                  central-reports section explaining why it is bare
    💬 বার্তা    → always open — the one thing they can use, and how they ask

VERIFIED: 346 passed, 0 failed; browser on a fresh port — mention counts correct
per user (a cashier is mentioned by `@cashiers`, a collector is not), `messages`
store present, no console errors.

## v3.96.2 — looking is not doing

Hrishi, on the table in the previous note: "let them see."

I had overreached. He asked twice to hide the *entry buttons* on the home screen
for somebody granted nothing; I went further in v3.96.1 and blocked 📒 খাতা and
📗 জমা-খাতা from being READ at all. That is a different thing, and it was not
asked for.

The ledger is the committee's own book and a collector is on the committee.
Grants decide what a person may ENTER, not what they may look at:

    home       → entry tiles hidden, card with the admin's phone (unchanged —
                 this is what Hrishi actually asked for, twice)
    📒 খাতা     → readable again
    📗 জমা-খাতা → readable again
    📊 রিপোর্ট  → unchanged; own summary plus whatever reports are granted
    💬 বার্তা    → unchanged, always open

The card now says where they can still go, so it reads as information rather
than a wall: "ততক্ষণ 📒 খাতা, 📊 রিপোর্ট আর 💬 বার্তা দেখতে পারো।"

What stays gated is unchanged and still right: 🔍 অন্য কারো দাতা needs its own
grant (route as well as button), and every entry flow needs its category.

VERIFIED: 346 passed, 0 failed; app loads clean on a fresh port.

## v3.97.0 — chat must not slow the collection down

Hrishi: "if all users using the messenger, and they are in collection, so will
it affect performance?"

Measured before answering, and yes — twice, both of them my own doing.

### 1. Chat was riding the money aggregation

`activeData()` filters voided rows and runs on EVERY aggregation —
`inHandRows` calls it once per collector, so ten collectors meant ten passes.
Adding `messages` to it meant a season of chat was being filtered on every
money calculation, for rows that change no figure anywhere:

    messages     inHandRows (node)
           0          0.7 ms
       2,000          2.9 ms
       5,000          7.8 ms      ← 11× slower

`messages` is out of `activeData` now, and `messageFeed` filters its own voids
— which is the only place that ever needed them:

    5,000 messages  →  inHandRows 0.5 ms  ·  messageFeed 2.8 ms

Browser, same test: `inHandRows` 0.72 ms at 5,000 messages; the feed 2.40 ms.

The test that pins this was **vacuous when I first wrote it** — a tangle that
returned false whatever the code did. Replaced with one that reads the real
contract, and proved it bites by putting `messages` back: it fails.

### 2. Every message rebuilt whatever screen you were on

Worse, and invisible in a benchmark. `mergeDelta` sets `changed = true` for any
store with incoming rows, and `messages` is now a store — so a chat message
triggered a full re-render of the ledger or the home screen.

Ten people talking during a collection round would have rebuilt the ledger every
60 seconds: **scroll position lost, and the search box wiped under somebody's
finger mid-typing.** (Entry flows were already safe — `flowState` guards those.)

`mergeDelta` now reports WHICH stores changed. A delta carrying nothing but chat
updates the unread badge, re-renders the chat screen if that is where you are,
and leaves every other screen untouched.

### What still costs something, honestly

Messages travel in the same pull payload, so a full pull (first login of the
day) grows by roughly 200 bytes per message — a 2,000-message season is ~400 KB
on top of the snapshot. That is real but well inside the localStorage budget,
and delta pulls only carry what is new. No fix needed; worth knowing.

VERIFIED: 348 passed, 0 failed; browser on a fresh port, numbers above, no
console errors.

## v3.98.0 — the chat tells the admin what it costs, and can be switched off

Hrishi: "if cost getting cross fast I should get notification to stop the
messenger… I will stop the messenger."

### Measuring the right thing

Chat sends NO extra requests — it rides the 60s pull — so the Apps Script
runtime quota is not what is at risk. What grows is the **pull payload and the
localStorage snapshot every phone keeps**. `chatLoad()` reports count, bytes and
`perDay`.

`perDay` matters as much as the total, and that is the half that answers what he
actually asked. A book reaching 2,000 over a season is fine; one reaching it in
three days is not. So 900 messages in a single day is `high` even though the
total is small:

    200 over 10 days   →  41 KB,  21/24h  →  ok
    1600 over 10 days  → 325 KB, 161/24h  →  watch
    3200 over 10 days  → 650 KB, 321/24h  →  high
    900 in ONE day     → 183 KB, 900/24h  →  high   ← the rate alone

Thresholds and why: localStorage is ~5 MB and the snapshot also holds
parties/payments/daily, so ~600 KB of chat is where a full pull on a cheap phone
starts being felt. Watch at half that.

### Telling him, once

The admin — nobody else — gets an OS notification **when the level changes**,
not every minute. A warning that repeats is a warning nobody reads. The home
banner carries the numbers and the ⏹️ button right there, so noticing and acting
are the same gesture.

### The switch

`Config.chat_off = 'on'` hides the 💬 tab for everyone, blocks the route and
refuses new messages. **Enforced on the server too** — a phone with the screen
still cached would otherwise keep writing after the admin turned it off.

Nothing is deleted, and it can be switched back on. The admin panel's 🗂️ data
section always shows the current cost next to the toggle, so turning it back on
is an informed choice rather than a guess.

VERIFIED
- 7 new tests on the levels, including the rate-alone case and that a long
  message costs more bytes than a short one. **355 passed, 0 failed.**
- browser on a fresh port: all four levels as above, no console errors.
- NOT verifiable until the redeploy: the server-side refusal. It rides the same
  pending deploy as the `Messages` sheet.

## v3.99.0 — "one permission and the default screens come back" is now a test

Hrishi: "if the user getting one permission, the default screens will be
available."

It already behaved that way — but only because of how the markup happened to be
written, and nothing asserted it. A promise about what a collector can reach is
worth more than that, so the DECISION moved out of the HTML into
`Aggregate.homeTiles(user)`, which is pure and pinned by tests. `renderHome` now
only decides how each tile is drawn.

    nothing granted    → CARD ONLY
    bus only           → entry[bus]  daily[]      common[3]  role[]
    road only          → entry[]     daily[road]  common[3]  role[]
    bus + cashier      → entry[bus]  daily[expense] common[3] role[cashier]
    cashier, nothing   → CARD ONLY
    admin              → entry[shop,person,member,bus] daily[road,toto,expense]
                         common[3] role[cashier,review]

The `common[3]` column is the answer to his question: **which** grant somebody
has makes no difference to the three screens everybody gets — taking a later
instalment, handing money over, and their own handover book. One grant is
enough; the second row and the third differ only in their own tile.

Two things the table also settles, both previously only readable in code:
- A cashier granted nothing is still CARD ONLY — Hrishi's rule, applied without
  an exception for the role.
- The correction desk needs its own grant ON TOP of being a cashier
  (`bus,review` gets it; `bus` does not).

Section headings were already conditional (`partyTiles ? heading : ''`), so no
empty heading was ever left behind — checked rather than assumed.

The dead `tile()` helper and an unused `cashier` local went with the change.

VERIFIED: 17 new tests, **372 passed, 0 failed**; browser on a fresh port shows
the same six rows, no console errors.

## v3.99.1 — full-app audit sweep: A12–A15

Hrishi: "use your all roles … scan the app in all aspects, find the bugs,
improvements, loopholes and all." Wore five hats — attacker, accountant, field
collector, sync engineer, admin — and verified every suspicion in code before
touching anything. Four were real. Also probed the chat renderer with a hostile
message in the browser: `<img onerror>` stays inert text, only the mention's
`<b>` renders — `esc()` covers `&<>"'`, no XSS.

### A12 (HIGH, accountant's hat) — an edit could vanish an entry

`finishFlow` wrote the void for the ORIGINAL row BEFORE `def.save` ran. A
rejected save (zero amount) or the user backing out at any later step left the
original voided with no replacement — the entry, and its money, gone from every
book. And after a SUCCESSFUL edit, the Undo toast knew only the new row: tapping
it deleted the replacement while the void on the original stood — same outcome.

Fixed both ends: the void is now written only after the replacement saves, and
an edit shows a plain "saved" toast with no Undo — unwinding half of a
two-row operation is worse than offering none, and the correction path for a
wrong correction is editing again.

### A13 (field collector's hat) — the no-permission card had no phone number

The card's whole point is the admin's name and 📞/💬 buttons — and they could
never appear. `adminContactHTML` filters the cashiers list for `role==='admin'`,
but the server's `cashiers` action returned only `{username, name}`. No role
ever matched; the fallback Settings were never written by anything.

Server now returns `role`, and `phone` for admins only (Hrishi's explicit call —
and only the admin's number is exposed, nobody else's). The card fetches the
list when this device has never had it, and remembers the admin in Settings so
the card still works offline. Rides the pending redeploy.

### A14 (sync engineer's hat) — a restored book could silently never reach the Sheet

Import's "keep as written" branch preserved `synced:1` from the exported file.
After a wipe-and-restore those rows are NOT on the server, and a row marked
synced never pushes — the book looked complete on the phone and stayed missing
from the Sheet forever. `synced:0` in both branches now; re-pushing an existing
id is a harmless upsert.

### A15 (attacker's + admin's hats) — chat hardening, three small ones

- **500-char cap** on messages, at the input (`maxlength`) and at send (guards
  paste). A Sheet cell takes 50,000 — one pasted essay would ride every phone's
  pull forever.
- **A refused message says so.** A message rejected server-side (chat switched
  off mid-flight) sat in the sender's feed dressed as sent — nobody else ever
  saw it. Now marked ❌ "পাঠানো যায়নি".
- **No buzz for the screen you are reading.** A mention arriving while the chat
  screen is open and visible marks itself notified instead of firing the OS
  notification.

VERIFIED: 372 passed, 0 failed; XSS probe inert in the browser; no console
errors. A13's server half joins the pending redeploy checklist.

(v3.99.1 packaging note: the js/app.js halves of A12/A14/A15 travelled together
in the A12 commit — one file, three fixes, the staging could not split them.
This commit carries the remaining i18n label, the ❌ style and the sw bump.)

## v3.99.2 — the architect's, UI designer's and PWA hats

Hrishi: "i have not seen the role of architect, ui designer/developer and all."
Fair — those passes had not been run. Run now, findings both ways.

### Verified FINE (checked, not assumed)
- **Safe area**: `viewport-fit=cover`, `env(safe-area-inset-*)` on the header and
  the bottom nav — the 5-tab bar clears the iPhone home indicator.
- **iOS input zoom**: every input ≥16px, so focusing a field does not zoom.
- **Tap targets**: chips ≈40px tall.
- **Offline shell**: `sw.js` ASSETS covers every served file; `config.js` is
  excluded deliberately (network-first, documented at the top of that file).
- **Chat compose vs the fixed nav**: suspected the sticky compose row would sit
  under the nav when Android's keyboard shrinks the viewport. Probed at 812px
  and at 400px: `msg-list`'s 58vh cap shrinks with the viewport, so the column
  always fits above the nav. Suspicion wrong; layout is self-limiting.

### Fixed
- **The stale "exact mirror" comment** — the precise trap that caused A8. Client
  `activeData` says it mirrors `activeData_`, but since v3.97.0 they differ
  deliberately (`messages` on the server side only). Anyone tidying that drift
  without context would re-slow the money paths or re-break notifications.
  Both sides now name the one difference and warn against "restoring" it.
- **Stale @ picker** — `msgUserCache` lived for the whole session, so a cashier
  appointed an hour ago was not mentionable without a reload. The picker now
  paints the cache instantly and refreshes it in the background.
- **`"lang": "bn"`** in the manifest.

### Judged and accepted, with reasons (the architect's actual job)
- **`js/app.js` is 3,624 lines.** A monolith — and splitting it now would be
  motion, not progress: no build step means more script tags and more cache
  entries, the pure logic already lives apart in `aggregate.js` (855 lines,
  355 tests), and a structural refactor days before go-live is risk with no
  user-visible gain. Revisit after the season if the app keeps growing.
- **Light theme only.** Deliberate: one festive palette, outdoor daytime use.
- **Emoji-only buttons lack aria-labels.** Ten known users on known phones; not
  worth churn now, noted for any future public release.

VERIFIED: 372 passed, 0 failed; manifest still valid JSON; no console errors.

## v4.0.0 — the Google Sheet expert's and DB expert's pass

Hrishi: "google sheet expert and db expert is missing … find more." He was right
that these were the important hats left, because this is where the money lives
and where the whole system's cost is decided. Three findings, all real, all
measured against the REAL `Code.gs` driven by a fake Sheet that counts cells.

### S1 (the big one) — every poll read the entire book, even when nothing changed

`pull` called `readAll_` unconditionally: `getDataRange().getValues()` on all
eight sheets, then filtered by year in JavaScript. A delta poll that returned
zero rows still read every row ever written that season. Ten phones × once a
minute × all day, growing every day — and since v3.96.0, chat rows inflated
that read too.

Fixed with a `data_ts` stamp in Config, bumped by every action that changes
rows. A delta pull whose cursor is already at or past the stamp answers with an
empty delta having read **one small Config range** and nothing else.

    400 payments in the book
      full pull   6,057 cells
      idle pull      38 cells      ← 159× less

TWO TRAPS, both real, both avoided deliberately:
- **One clock.** The cursor handed back is `max(maxReceivedAt, data_ts)`. Left
  as `maxReceivedAt` alone, the client's `since` would always sit just behind
  the stamp and the fast path would never once fire.
- **The stamp is NOT best-effort.** If bumping it failed silently, the stamp
  would sit behind rows that exist, every device would read as "already up to
  date", and real rows would be skipped forever. It throws instead: the push
  fails, the client retries, rows upsert by id, no harm. Loud beats lossy.

Proven against the real code, not reasoned: after a write, a pull with the OLD
cursor still delivers the new row (`late row delivered=true`), and the poll
after that is fast again.

### S2 — a batch of rows meant a Sheet write per row

`push` called `appendRow` once per row: each one a separate round trip inside
the script lock. A collector coming back online after a morning offline pushes
their whole queue at once.

Now every new row for a store is collected and written with ONE `setValues`.

### S3 — every receipt serial read and rewrote the whole Config sheet

`nextReceiptNo_` did `readConfig_()` + `setConfig_()` per serial, inside the row
loop. Twenty payments meant twenty full Config reads and twenty writes.
`reserveReceiptNos_` takes them all in one read/write, counting in memory —
still atomic, because `push` holds the script lock throughout.

    push of 20 rows into one store, Sheet operations
      before   1 index read + 20×(Config read + write) + 20 appendRow  = 61
      after    1 index read +  1×(Config read + write) +  1 setValues  =  4

Verified on 400 rows: 400 saved, **400 unique consecutive serials**
2026000001–2026000400, one `setValues`, `data_ts` stamped.

### Client compatibility
The idle response carries `data:{}` and `notif:null`. `mergeDelta` already
ignores empty stores and `if (resp.notif)` already guards the feed, so no client
change was needed — checked rather than assumed. `me` and `config` still ride
every idle response, so a permission change still reaches a phone within one
poll.

VERIFIED: 372 passed, 0 failed; the push/pull harness above runs the real
`Code.gs`. Nothing here can be exercised against the live Sheet until the
redeploy — this is now the largest item on that checklist.

## docs — the audit register was missing seven findings

Hrishi: "what about the previous findings?"

Fair question, and checking it found a real gap in the paperwork rather than the
code. `docs/final-audit.md` is meant to be THE register — it carried A1–A11, but
A12–A15 and S1–S3 existed only in this build log, buried among feature notes.
Anyone opening the audit doc to ask "what did we find, what is still open?" would
have got an answer that was seven findings out of date.

All seven are now written up there in the same shape as the rest, and the doc
opens with a standing ledger: which findings were proven live against the Sheet,
which are fixed but awaiting the pending redeploy, what was deliberately NOT
changed and why (so nobody "fixes" the documented `activeData` divergence by
reflex and re-slows the money paths), and the one thing still needing a decision
from Hrishi rather than a fix — most collectors have an empty reports list and
can open no central report at all.

Nothing in the code changed. 372 passed, 0 failed.

## Rebake config.js for the v4.0.0 deployment

New `/exec` after Hrishi redeployed. Confirmed the new code is actually serving
before rebaking: `clearTraining` reaches its token gate (`no-token`) while a
nonsense action still returns `unknown action` — so the v3.93.0–v4.0.0 server
half is live, not just in the repo.

Still to confirm with a token: whether `setup()` ran (the `Messages` sheet), and
the whole three-role pass — the Sheet-performance work (S1–S3) has never been
exercised against a real Sheet.


## v4.0.1 — the v4.0.0 live pass: 44/45, and the one red light was real

Ran the full three-role pass against the fresh deployment with Hrishi's admin,
cashier and collector tokens. `live_mode` was empty (still training) and the
audit log showed he had already run `training:clear` himself at 03:09 with a
backup — so `clearTraining` is proven live too, by its owner.

### The three that had never touched a real Sheet — all green

**S1, idle fast path.** Full pull, then an idle poll returned `idle:true` with no
rows while still carrying `me` and `config`. Then the test that actually
matters: write a row, pull again with the OLD cursor — **the row was delivered**.
No loss. The poll after that was fast again.

**S2/S3, batching.** 30 rows in one push: all saved, **15 serials, all unique and
consecutive (1–15)**, every payment on the Sheet carrying its number. The
batched reservation does not collide or burn gaps.

Also green: the whole money chain across three roles with categories intact, a
cashier snapshot arriving as a plain parcel rather than a phantom category, chat
send/receive with `@yamini05` recognised as a mention for her and not for the
cashier, every role gate, A9 forgery still blocked, A11's role word correct, the
new void gate allowing a collector their own row and refusing somebody else's,
and the books balanced with `byCat === inHand` on every line.

### A16 — the chat kill switch never worked

The one failure, and it was real. Details in `docs/final-audit.md`; short version:
`setConfig` reads `b.config`, both chat-switch call sites sent `{key,value}`, and
`chat_off` was not whitelisted anyway. The action returns `ok:true` regardless,
so the button said "chat stopped" and nothing stopped.

**Two code reviews had passed this.** The client looked right, the server looked
right, and nothing connects them until a real call is made. That is the argument
for running the pass rather than reading the diff.

Fixed on both sides, and hardened past the immediate bug: an unlisted key now
throws instead of quietly succeeding, and the response says which keys it
applied. Tests parse the allow object itself — proven to bite — and assert that
`live_mode`, `data_ts` and the serial counters can never be written through it.

378 passed, 0 failed. A16's server half needs one more redeploy.

## v4.0.1 deployed — A16 verified live, 45/45

Rebaked for the A16 deployment. Fingerprinted it first — `setConfig` with an
unlisted key now answers `unknown-config-key` where the old build answered
`{ok:true}`. That fingerprint is the reliable check, not a file timestamp:
Hrishi rightly suspected something was stale, and the file was fine — it was the
DEPLOYMENT that was still old, which no file date can tell you.

The kill switch, end to end on the live sheet:

    1. flip off (the exact call the button makes)  → {"ok":true,"applied":["chat_off"]}
    2. stored?                                     → chat_off='on'
    3. collector sends a message                   → rejected (saved 0, rejected 1)
    4. flip back on                                → {"ok":true,"applied":["chat_off"]}
    5. same collector sends again                  → delivered (saved 1)

`applied:["chat_off"]` in the response is the part that would have caught this
in the first place — the old action returned a bare `ok:true` whether it wrote
anything or not.

## v4.1.0 — P1: every button tap was reading the whole database three times

Hrishi, using the app: "buttons are responding too slow."

Measured before touching anything. One tap did this:

    navigate() → render()
      renderX()       → viewData()        → DB.allData()  — 8 object stores
                                           + merge with centralData — 8 stores
      updateBadge()   → DB.unsyncedCount() → DB.allData()  — 8 stores AGAIN
                      → viewData()        → DB.allData()  — 8 stores AGAIN
                                           + merge AGAIN

Three full IndexedDB traversals and two full merges, per tap, with nothing
changing between them. `viewData()` alone is called from 21 places. It got worse
with the chat: `updateBadge` gained a `viewData()` of its own for the unread dot,
so the badge that says "you have messages" was costing a whole database read
every time any screen painted.

Two caches, each invalidated by exactly one counter:

- **`DB.allData()`** serves the same promise until a write bumps `version`.
  Correctness rests entirely on bumping in EVERY write path, so `put`, `del`,
  `bulkPut` and `clearAll` all call `touch()` and nothing writes without it. The
  promise is cached, not just the result, so several callers in one paint share
  one traversal instead of racing three.
- **`viewData()`** memoises the merge on `DB.dataVersion() + centralVersion`.
  Every assignment to `centralData` now routes through `setCentral()`, and the
  in-place merge in `mergeDelta` bumps too — a missed bump would leave a stale
  screen after a pull, which is worse than the slowness it fixes.

Measured in the browser on a seeded 2,000-row season:

    cold viewData        8.0 ms
    warm viewData        0.0 ms
    warm again           0.0 ms
    3 calls (one tap)    0.1 ms      ← was three cold reads

STALENESS IS THE REAL RISK of this change, so it was tested directly rather than
assumed: a `put` is visible immediately, a `del` is visible immediately,
`unsyncedCount` sees a fresh unsynced row, and the version bumps on write. All
four green, plus no console errors, and the seeded rows cleared afterwards.

378 passed, 0 failed. Client-only — no redeploy needed.

## v4.1.1 — the 1.5-second dead wait on the three most-used buttons

Hrishi: "its lagging, previously it was not."

v4.1.0 fixed a real cost (three database reads per tap) but it was not what he
was feeling — the fix was live and the lag remained. So: measure, do not guess
again. Every aggregation on a seeded 2,000-row season came back under 3 ms:

    computeTotals 0.97 · messageFeed 2.52 · myAvailable 0.36
    personalSummary 0.42 · inHandRows 1.69 · reconcile 1.50

Nothing there explains a visible lag. The clue was a number noted and walked
past during the live pass: **a full pull took 3,625 ms and an idle one 5,228 ms**
— an Apps Script round trip is seconds, not milliseconds. So the slow buttons
had to be the ones that touch the network. And one did, invisibly:

    const freshThen = function (fn) {
      Promise.race([Lists.refresh(), new Promise(r => setTimeout(r, 1500))]).then(fn);
    };

দোকান / ব্যক্তি / সদস্য — the three most-used buttons in the app — raced a list
refresh against a 1.5-second timeout and waited for whichever won. The refresh is
a 3–5 second round trip, so **the timeout always won, and every tap sat dead for
exactly 1.5 seconds** before anything appeared.

The wait bought nothing. The area and location steps it was protecting are
several taps further in, and the flow engine already evaluates `optionsFn` when
a step is REACHED. Switching those two steps from `options:` (built once, when
the flow is created) to `optionsFn:` (read at render time) means the form opens
instantly and still shows an area the admin added moments ago — the refresh runs
behind the form and lands long before anyone reaches that question.

Introduced in `afe290a` "Refresh master lists when opening a new-entry form",
which is why he remembered the app being quicker before.

VERIFIED: the timeout race is gone from the served file, both steps use
`optionsFn`, 378 passed, 0 failed, no console errors. Client-only.

## v4.1.2 — the buttons were not slow, they were DEAD

    app.js:1350 Uncaught ReferenceError: freshThen is not defined

That console line from Hrishi ended three rounds of my guessing. দোকান / ব্যক্তি /
সদস্য — the three most-used buttons in the app — threw on every tap and did
nothing at all. Tap, nothing, tap again, nothing: that is what "the buttons are
responding too slow" actually was, and I read it as latency and went hunting for
milliseconds twice.

CAUSE, and it is mine. `freshThen` was defined inside `renderHome`'s callback.
In v3.90.0 I lifted the `data-go` click handler out of `renderHome` into a
module-level `wireNav()` so other screens could offer tiles — and left the helper
behind. The file still parses; `node --check` is happy; every test passed. It
only fails when a finger lands on the button.

`freshThen` now lives next to `wireNav`, its only caller.

### The lesson, made permanent

Two "performance" commits (v4.1.0, v4.1.1) were spent on this. Both fixed real
things — three DB reads per tap, and a 1.5-second dead wait — but neither was
the complaint, and I only found the truth when Hrishi pasted the error. A
ReferenceError inside a click handler is invisible to everything the project
had: it parses, it lints, it tests, it deploys.

So `tests/scope-check.js` now runs as part of `node tests/run.js`. It reads
`js/app.js`, resolves every called identifier against module scope, the caller's
own declarations and parameters, and the globals the other files export.

Getting it to zero false positives took three passes, and the failures are worth
recording because each would have made it useless:
- matching inside comments and strings — `have()`, `noise()`, `void()` from
  English prose (~150 hits);
- ignoring cross-file globals — every `t()` and `fmtMoney()` call flagged;
- `const a = 1, b = 2` — only the first name counted, which wrongly accused
  `renderEntry` and `renderReceiptShare`.

Proven to bite: removing `freshThen` again makes it report
`wireNav() calls freshThen() — declared in no reachable scope` and exit 1.

379 passed, 0 failed. Client-only.

## v4.2.0 — the expense flow still asked a question the model had abandoned

Hrishi: "in spent, why is this available — which pot did this come out of? we
have changed the concept, did you forget."

He is right, and it was a leftover. `srcCat` was introduced in v3.86.0 to stop
an unsourced expense wandering between categories, and at the time asking the
spender was the honest answer. Then v3.89.0 settled the cashier handover on the
opposite principle: **money pooled from many people has no honest category, so
asking for one is guesswork dressed as precision.** That reasoning applies just
as much to spending the pool as to passing it on — and the question stayed.

Worse, it only ever appeared for cashiers and admins, since a general puja
expense is cashier-gated. So the one group whose money is definitely pooled was
the only group being asked to categorise it.

The question is gone. A general puja expense is filed under **`other`** — a
stable named pot that may go negative, which is exactly the rule Hrishi set:
expenses come out of what you collected, and a minus is the exceptional case.

    collected toto 1000, general expense 300
      byCat  { toto: 1000, other: −300 }      in hand 700

A COLLECTION expense is untouched and still names its round, because that one is
knowable rather than guessed — whoever is running the road round knows the money
came from it, and `collectionExpenseFlow` sets `srcCat` itself without asking:

    collected toto 1000, collection expense 300 on toto
      byCat  { toto: 700 }                    in hand 700

Both in hand 700. The split differs; the money does not.

Removed with it: `srcCatOptions()` (no callers left), the `q_src_cat` label, and
the `srcCat` preset the edit path carried. `startExpense` no longer computes
`myAvailable` before opening the form — there was nothing left to compute.

VERIFIED: 7 new tests, including two that assert the question and its option
builder are actually absent from `js/app.js` rather than merely unused.
**386 passed, 0 failed**; browser confirms both cases; no console errors.
Client-only.

## v4.3.0 — the keyboard follows the question

Hrishi: "input time type wise keyboard change — number time number, other time
combined keyboard."

The entry flow uses ONE `<input>` for every step, and it carried a single fixed
hint. Worse than fixed: amounts were explicitly `inputmode="text"`, so the step a
collector types most — a rupee amount, fifty times a day — opened the LETTER
keyboard and made them hunt for digits.

    amount steps (5)   inputmode="text"  →  numeric, placeholder ৫০০
    phone step         (nothing)         →  tel, placeholder 9xxxxxxxxx
    text steps (12)    (nothing)         →  unchanged: the combined keyboard

`text` on amounts was deliberate once — the app parses Bengali number words, so
the box had to accept "পাঁচশো". But words arrive by VOICE; the mic sits right
beside the box, and `mic_hint` is printed under it. Nobody was typing them.
Parsing is untouched — verified after the change that ৫০০, পাঁচশো, পাঁচ হাজার,
1500, দেড় হাজার and সাড়ে তিনশো all still resolve — and anyone who does want to
type a word can still switch keyboards.

Bus number stays on the combined keyboard on purpose: "WB-11" is letters and
digits together.

Also added `enterkeyhint` while touching every input, so the phone's Enter key
says what it does: **next** through a flow, **send** in the chat, **search** in
the two search boxes.

Untouched because they were already right: the cashier's cash/UPI boxes
(numeric), register's phone (tel), every password (type=password), the file
pickers, and the admin year field (type=number).

VERIFIED on the served file: amount→numeric, phone→tel, others unchanged, the
old `inputmode="text"` gone; number-word parsing still green; no console errors.
386 passed, 0 failed. Client-only.

## 2026-07-26 — v4.4.0: আমার হিসাব as progressive disclosure

Hrishi: *"my summery will confuse the user"* → *"the summery should be simple
that in hand how much he is having in his hand … if he expand at first he will
see the group wise calculations and he want to go deeper then sub groups"* →
*"you need to think about cashier level, then it will be automatically simple
for collector"* → *"we are showing the total amounts of this group means till
now"* → *"the color details also should be available there"*.

The old summary was two `stat3` grids: six figures on one row-pair, and the last
two were **wrong together**. `personalSummary().cash/.upi` is the split of what
was *collected*; it sat directly under "in hand". With the season's real data
that read "হাতে ১,৮০০ · নগদ ২,৪০০" — two numbers that cannot both be true.

### Three levels, and one rule that makes them safe

    level 0   এখন আমার হিসাবে আছে ₹2,000   💵1,200 · 📱800
    level 1   📥 নতুন এন্ট্রি 1,700 · 🛣️ রোড/টোটো 300  → মোট 2,000
    level 2   দোকান 800 · ব্যক্তি 500 · বাস 400 | টোটো 400 · রোড −100

The rule: **every figure below the hero is a slice OF the hero.** Not a
subtraction chain (তুলেছি − খরচ − জমা), which was the first attempt and which
mixes two clocks — the groups would be season-to-date while the hero is
right-now. On a cashier that gap becomes absurd: Jadav's `byGiver` gross is
₹4,200 while he holds ₹1,600. Now nothing on the screen can be larger than the
number on top, and `mySummary()` asserts Σgroups === hero (test bites: proved by
dropping `road` from the group and watching it fail 2100 ≠ 2000).

Designing for the **cashier first** was Hrishi's call and it paid: the group set
is the cashier's set (📥 / 🛣️ / 🤝 received), so a collector's screen is the same
code with the third group empty. Grouping matches the handover sheet exactly —
no new vocabulary to learn between the two screens.

### Pending handovers count as still yours — Hrishi's decision, and it is right

I recommended the opposite (deduct pending, so the figure matches a night-time
cash count). Hrishi: *"pending জমা 'এখনও আমার হাতে' ধরা হবে"*. He is right and my
version had a hole: `myAvailable` credits the receiver only on *confirmed*, so
deducting the sender too would leave the money in **nobody's** book — proved
live, a ₹300 pending parcel made Σ inHand read 700 instead of 1000.

So the three slots are kept apart, and `rejected` is bucketed **by name**, never
as "not confirmed":

    ⏳ pending    inside the hero, leaving  — states what the hero becomes
    ✅ confirmed  outside the hero, closed  — grey, collapsed, proof only
    ❌ rejected   never left the hero       — blue, "nothing came off"

Rows are per **handover**, not merged per person: a cashier can approve one
parcel and reject another from the same person, and the merged row would then
match neither. Test proves a rejection is never filed as pending (mis-bucketing
it reads 950 instead of 700).

No writer sets `rejected` yet — that is phase (খ). This reader is ready for it;
four other sites still read "not confirmed" as pending and must be fixed there.

### Colour: one colour, one meaning

`legend_title` is a collapsed row under the summary, always a tap away.

    🟩 সবুজ  হিসাবে আছে        🟨 হলুদ  আছে, কিন্তু বেরিয়ে যাবে
    🟦 নীল   তোমার কাজ বাকি     ⬛ ধূসর  শেষ ও বন্ধ, শুধু প্রমাণ
    🟥 লাল   ঘাটতি / ঋণ

Red is **only** for a shortfall. Money coming back is not red — it is a job to
do, so it is blue. Giving red two meanings is exactly the confusion being
removed. Colour is never the sole carrier: every line also has an icon and
words, and the legend says so.

`i18n.js` stayed plain text — markup in the dictionary would break the 315
`esc(t(...))` call sites. `tMoney()` splices `fmtMoney()` output into `{n}` and
bolds it; the words still go through `esc()`.

Wording: "হাতে আছে" → **"হিসাবে আছে"**. Under Hrishi's rule a pending parcel has
left the pocket but not the book, so "in hand" would contradict the cash count.

### Removed

`byCatHTML()` and `handedToHTML()` — the pot table became level 2, and "কাকে কত
জমা দিয়েছি" became the three slots. Orphan keys `my_by_cat`, `my_handed_to`,
`my_inhand` deleted.

VERIFIED in the real app (fresh port 8767, real IndexedDB, sync URL pointed at a
dead local path so nothing touched the live backend): hero ₹2,000 = 💵1,200 +
📱800, groups 1,700 + 300 = 2,000, ⏳700 → "দাঁড়াবে ₹1,300", ❌250 → "₹2,000
অপরিবর্তিত", ✅1,700 grey and out of the total, road −₹100 red with its note, all
five legend rows, four slot colours checked by computed style, no console errors.
404 passed, 0 failed. Client-only — **no Code.gs change, no redeploy.**

Still open (phase খ, own commit): the reject path itself, and the handover cap —
collector chips are capped from `myAvailable`, which does not deduct pending, so
₹1,400 is selectable while ₹1,300 is held (₹700 pending + ₹100 road debt the
chips skip entirely).

## 2026-07-26 — v4.4.1: the handover ceiling (two clamps, two reasons)

Follow-up to v4.4.0, same session. Hrishi: *"do it all one by one"*.

Under his rule an unconfirmed handover still counts as the sender's money —
right for the books, wrong for the offer. The collector's sheet capped its chips
from `myAvailable().byCat`, so already-sent notes were offered again: **the same
money could be handed over twice.**

Fixing it surfaced a SECOND, independent leak. Both had to be plugged, and each
needs its own clamp, because one cannot see the other:

    1. per pot    subtract that pot's own pending parcels (from the stored
                  breakdown, so the deduction lands in the right pot)
    2. per type   an overspent pot is clamped to 0 and so VANISHES from the
                  chips, yet its debt still lowers the cash in the pocket —
                  Σ positive pots therefore overshoots by exactly the debt

Worked example, verified live end to end: ₹2,000 in the account, ₹700 pending
(person 300, toto 400), road overspent by ₹100.

    byCat free   শপ 📱800 · ব্যক্তি 💵200 · বাস 💵400 · রোড — · টোটো —
    Σ chips      💵600 + 📱800 = 1,400     ← what the sheet used to offer
    real cap     💵500 + 📱800 = 1,300     ← cash 2800 − 400 spent
                                              − 1200 confirmed − 700 pending
    gap          100 = the road debt        ← invisible to clamp 1

New `Aggregate.handoverable()` returns the per-pot free figures, the per-type
ceiling, and the two reasons SEPARATELY (`pendingOut`, `debt`) so the screen can
name them in the summary's own colours: gold for money on its way out, red for a
pot that owes. A cap with no reason reads as a broken app.

`#sh-total` now shows the ceiling breach and says how much to take off ("💵 নগদে
সর্বোচ্চ ₹500 — আরও ₹100 কমাও"), and "next" stays disabled until it fits. The
chips still open all-selected, so a collector with a debt lands on the message
immediately — deliberate: the alternative was auto-deselecting pots for them,
which silently decides which round to keep back.

`myAvailable` is untouched. The two functions now answer two different questions
on purpose, and both are honest:

    hero (myAvailable)        includes pending — what I answer for
    ceiling (handoverable)    excludes pending — what I can physically pass on

VERIFIED live on a fresh port (8791 — port 8767 served a stale app.js from the
v4.4.0 app-shell cache and showed the OLD ₹1,200 title; the fresh-port rule
earned its keep again). Title now reads 💵₹500 · 📱₹800; both reason strips
render; ব্যক্তি shows ₹200 not ₹500; selecting everything gives 💵600 → red
message + next disabled; dropping one chip → 💵400, message gone, next enabled;
saving wrote a pending row of ₹1,200 with the exact breakdown, after which the
ceiling fell 1,300 → **100** while the hero stayed at **2,000** — the whole rule
demonstrated in one loop. No console errors. 419 passed, 0 failed.

Client-only — no Code.gs change, no redeploy.

## 2026-07-26 — v4.4.2: only the recipient may confirm a handover (A17)

Second of the three follow-ups. Found while reading `confirmHandover` for the
reject path — not by review of the diff, by reading the function that was about
to be extended.

The gate was *"are you A cashier"*, never *"are you THE recipient"*:

    if (Number(u.row.cashier) !== 1 && u.row.role !== 'admin') throw 'not-cashier';
    ... match by b.id alone ... setValue('confirmed'); confirmedBy = caller

So cashier A could confirm a parcel collector Y sent to cashier B. B's in-hand
rises for money B never touched, Y's falls, and the audit records A as the
receiver. Confirming is the ONE action that moves money between two people's
books, which makes this the worst place in the file for a missing check.

It stayed invisible because `pendingHandovers` **does** filter to the recipient —
the UI never offers another cashier's parcel. Only a direct call reaches it, with
an id any admin can see and anyone who has glanced at another phone.

**Fix:** one `isRecipient_(h, u)` now backs BOTH `pendingHandovers` (what you may
see) and `confirmHandover` (what you may confirm), so they cannot drift — a
server that accepts a confirmation it never offered is the same class of bug in a
different costume. Identity rule is the file's existing one: prefer the stable
username in `toId`, fall back to the typed display name for rows written offline.

Two more while in there:

- **re-confirm** now throws `already-confirmed`. It used to restamp
  `confirmedBy`/`confirmedAt`, quietly overwriting who actually acknowledged the
  money.
- **admin on someone else's behalf** stays possible (a cashier's phone dies
  mid-puja and the books must move) but is logged under its own verb,
  `handover:confirm-on-behalf`, naming the intended recipient. Same effect, not
  the same act — and an audit line that reads like a normal confirm would hide
  exactly the case worth reviewing later. If Hrishi wants it blocked outright,
  it is one condition.

`err_not_recipient` and `err_already_confirmed` got real messages: `errMsg()`
turns any unknown code into "network problem", so without them a permission
refusal would have told the cashier their internet was broken.

VERIFIED: `isRecipient_` is loaded from the REAL Code.gs by tests/run.js (the
harness that already does this for `permForRow_`/`entryAllowed_`) and exercised
four ways — username match, another cashier refused, offline row with no `toId`
falling back to the name, and that fallback letting nobody else in. The action
body is asserted to call it and to throw both codes. Both proven to bite: with
the guard deleted, "refuses a non-recipient" fails; with `isRecipient_` forced to
`return true`, the another-cashier and name-fallback cases fail. 430 passed, 0
failed.

**NEEDS A REDEPLOY** — Code.gs changed. Client side is only the two error
messages, hence the sw bump.

## 2026-07-26 — v4.5.0: "পাইনি" — the reject path (phase খ)

Third and last of the three. The ❌ slot shipped in v4.4.0 could never fill,
because `confirmHandover` only ever wrote `'confirmed'` — a cashier had no way to
say the money had not arrived. So the only honest answer available was the wrong
one: confirm money you do not have, or leave the collector's parcel in limbo.

### A rejection is not a void

The parcel really was claimed. Both people need the record of the claim AND of
the refusal, so `rejectHandover` writes a third status rather than voiding the
row. What changes is only which bucket it falls in:

    ⏳ pending    inside the hero, out of the ceiling   (in transit)
    ✅ confirmed  out of the hero, out of the ceiling   (settled)
    ❌ rejected   inside the hero, INSIDE the ceiling   (it came back)

Proven live on real data, three seeds of the same row:

| status | hero | ceiling | ps.pending | in "কাকে কত জমা দিয়েছি" | book |
|---|---|---|---|---|---|
| pending | 1000 | 600 | 400 | yes | pendingOut 400 |
| rejected | 1000 | **1000** | 0 | no | rejectedOut 400 |
| confirmed | 600 | 600 | 0 | yes | — |

The middle row is the whole feature: the money comes back into the ceiling, into
**its own pot** (road 600 → 1000), while the hero never moves. Which is exactly
why the sender has to be told — see the notice below.

### The six inline copies of "not confirmed means pending"

Six sites each wrote `status !== 'confirmed'` by hand. Every one of them would
have gone on deducting a refused parcel for ever: money the cashier had rejected,
stranded outside the handover ceiling and inside nobody's pocket.

    js/aggregate.js   personalSummary · cashierView · handoverReport
    apps-script       notifData_ (the cashier's nag) · personalSummary_
    js/app.js         renderCashier's pending filter

Replaced with named predicates — `hoConfirmed` / `hoRejected` / `hoPending` —
so the three-way rule lives in one place and cannot be re-written inline. A test
now breaks each site individually; all five breaks were verified to fail.

### A reason is required

`reject-required` on the server, and the client aborts before calling if the
prompt comes back blank. "পাইনি" with no explanation is an accusation the sender
cannot act on; *"খামে ৪০০ ছিল না, ৩০০ ছিল"* tells them whether to re-send or to
talk. The reason travels with the row into the sender's ❌ slot, the notice, and
📗 জমা-খাতা. `rejectReason` is appended **last** in `SHEETS.handovers` — setup()
migrates headers by appending and every write is position-based, so a name
inserted mid-list would shift every column after it in existing sheets.

Same recipient gate as confirming (A17), because refusing money moves both books
too; `already-confirmed` / `already-rejected` make both answers final.

### Telling the sender, without nagging for ever

A rejection is the one notification with no server-side "done" state — the row
stays `rejected`. And it is the one where **nothing visibly changes** for the
sender: their hero does not move, only their ceiling grows back. Silence would
mean money quietly becoming spendable again with no explanation.

So: a notice with the reason, a "🤝 জমা দিলাম" button to re-send, and **বুঝেছি**
which dismisses it *locally* (`Settings.rejSeen`, capped at 200 ids). Local on
purpose — it is a read receipt, not data. The money record itself lives in the ❌
slot and the handover book, so dismissing loses nothing.

### Two wordings fixed while in there

`hoStatusLabel()` replaced three inline status strings. The pending one had been
borrowing `flag_pending` — "flag করা — অপেক্ষায়", which is *correction-flag*
wording and says nothing true about a handover in transit. And the rejected label
is deliberately direction-neutral ("“পাইনি” বলা হয়েছে"): the same row is read by
the sender ("mine came back") and the receiver ("I said I hadn't got it"), so it
states the fact rather than either point of view.

Also removed: the unreachable duplicate `[data-hid]` wiring that sat after a
`return` in renderCashier — dead since it was written, and now replaced by one
shared `wireHandoverAnswers()` at module level.

VERIFIED live on a fresh port (8841, with the backend stubbed so nothing touched
the live Sheet): both answers render side by side and are really wired
(`typeof onclick === 'function'`, not just a data attribute); ❌ পাইনি sends
`rejectHandover` with the right id and reason; **Cancel sends nothing and leaves
the button usable**; a blank reason sends nothing and toasts "কারণ লেখা দরকার";
the refused parcel leaves the cashier's queue into its own ❌ section with the
reason; জমা-খাতা shows "❌ পাইনি বলেছি ₹400" in the head and the reason on the
row; the sender's notice renders with reason + re-send button, and বুঝেছি clears
it and it does **not** come back on the next poll. No console errors.
472 passed, 0 failed.

**NEEDS: `setup()` in the Apps Script editor (for the new `rejectReason`
column) AND a redeploy.**

## 2026-07-26 — v4.5.1: rebake for the new deployment, and one silent-loss guard

Hrishi deployed the phase-খ backend and sent a new `/exec` URL; `config.js`
rebaked (this account has never repointed an existing deployment, so every
backend change mints a new URL).

**Fingerprinted the running code before trusting it** — the lesson from the
stale-deployment trap. `rejectHandover` with no token, against both URLs:

    new deployment → {"ok":false,"error":"no-token"}      ← the action EXISTS
    old deployment → {"ok":false,"error":"unknown action"} ← it does not

`no-token` means the call reached `requireUser_`, i.e. the action is present.
A file date, or Hrishi saying he deployed, proves nothing; this does. (Also
confirmed `definitelyNotAnAction` → `unknown action`, so the probe can tell the
two apart rather than always answering the same way.)

*(curl needs the two-step form here: Apps Script answers a POST with a 302 and
curl downgrades the follow-up to GET, which returns Google's HTML wrapper. Post
to `/exec`, read `redirect_url`, then GET that.)*

### The guard: a write that heals its own header

`readAll_` maps every row by the **actual header row**, not by the `SHEETS`
constant. So if `setup()` had not been run since `rejectReason` was added, the
reason would be written into an unlabelled column and then **never read back** —
the status would flip to `rejected`, the money would return to the ceiling, and
the explanation would vanish with no error anywhere. Exactly the A16 failure
shape: an action that answers `ok` while quietly doing less than it says.

New `ensureCol_(sh, name)` appends the column to the header if missing and returns
its index; `rejectHandover` writes through it. `setup()` still does the bulk
migration — but anything writing a brand-new column no longer depends on a human
having remembered. Pinned by a test that the action calls it.

474 passed, 0 failed.

## 2026-07-26 — v4.5.2: A18, the two sites I had miscounted

Hrishi: *"you were telling some other dependable tasks, that will effect with
this change!"* — asking what else the reject path touches.

The honest way to answer was to stop trusting my own count and grep **every** read
of a handover status across `aggregate.js`, `app.js` and `Code.gs`. I had said six
sites. There were **eight**. Both extras were the same bug in a mirrored pair:

    inHandRows (js/aggregate.js)          if (confirmed) {...} else { pending += }
    computeReport_('inhand') (Code.gs)    same

A bare `else` means "anything not confirmed is in transit" — true until v4.5.0 gave
a handover a third outcome. So a parcel the cashier had **refused** would sit in the
central "কার হাতে কত" report's *confirm বাকি* column for the rest of the season.

`inHand` itself was never wrong (pending is not subtracted), so nothing was
double-counted — but the report Hrishi reads to chase collectors would have been
chasing money that had already come back to them.

Checked at the same time and found clean, so they are not silently at risk:
`reconcile()` balances in all three states (no false "হিসাব মিলছে না" banner —
verified, not assumed), `myAvailable` already filtered `=== 'confirmed'`, and the
cashier's stored `__snap` is a point-in-time record that new snapshots simply get
right.

Fixed with the named predicates (`else if (hoPending(h))`) rather than another
inline comparison, so the three-way choice is visible at every site. Test drives
`inHandRows` through all three outcomes asserting the in-hand column, the pending
column and reconcile; both fixes proven to bite by restoring the bare `else`.

**Lesson:** a bare `else` on a field that has two states today is a landmine for
the day it has three. Recorded in final-audit.md as A18.

Docs caught up in the same commit: the audit status ledger still read "awaiting the
pending redeploy" for A13/A16/S1–S3 — that redeploy happened today, so that column
is now empty, with A17 and A18 added. One caveat carried forward and flagged as an
open question: `ensureCol_()` was written AFTER Hrishi deployed, so it is not in the
running code — either `setup()` was run (same effect) or the next redeploy picks it
up.

484 passed, 0 failed. **Needs a redeploy** (Code.gs mirror).

## 2026-07-26 — v4.5.3: make a deployment identifiable from outside

Hrishi redeployed with the A18 mirror + `ensureCol_` and sent a new `/exec`;
`config.js` rebaked (fourth URL today — this account mints a new one per deploy).

Fingerprinted first, as always. The first probe came back as Google's "Page not
found" HTML for both `doGet` and `rejectHandover` — a freshly-minted deployment
warming up, not a broken one. A clean retry: `doGet` → `{"ok":true,...}`,
`rejectHandover` → `no-token` (the action exists), a bogus action →
`unknown action` (so the probe really does discriminate). Worth writing down: a
brand-new `/exec` can answer HTML for a few seconds; retry before concluding
anything.

### The gap that probe cannot close

`rejectHandover` existing only proves the deployment is **v4.5.0 or later**. It
cannot tell a v4.5.0 deployment from a v4.5.2 one — and v4.5.2 was where A18 and
`ensureCol_` landed. Everything that would distinguish them sits behind a login
token, so there was no way to prove the deployed code was current.

That is the same shape as A16, where the file was current and the DEPLOYMENT was
stale, and it has now cost two rounds of "probably fine, can't prove it".

`doGet` is the only unauthenticated surface, so the version now travels there:

    curl -sL "$EXEC"  →  {"ok":true,"service":"chanda-khata","version":"chanda-v4.5.3"}

One curl, no token, nothing written. `CODE_VERSION` is asserted against `sw.js`'s
`VERSION` in tests/run.js, so the two cannot drift by someone bumping one and
forgetting the other — proven to bite by bumping sw.js alone.

**This deployment still cannot be version-checked** (the marker is not in it).
From the next redeploy onward it can, exactly.

486 passed, 0 failed. Needs one more redeploy to activate the marker — no rush,
nothing else waits on it.

## 2026-07-26 — v4.5.4: post-v4.5.3 all-roles audit — one fix (A19), five registered

Hrishi: *"with your every roles check and analyse the application"* — the day's
seven commits re-audited, every role, machine-checked (see final-audit.md,
"Post-v4.5.3 all-roles pass" for the full evidence list).

Fixed here — **A19**: a dismissed rejection notice toasted "🔔 1 ফেরত এসেছে" on
every app start for the rest of the season. The server resends every rejected
row on every poll (a rejection has no "done" state); the banner filtered
dismissed ids, the count did not, and a fresh start begins at prev=0 so
total>prev fired every time. Now dismissed ids are dropped at APPLY time and
বুঝেছি re-applies, so the count falls with the banner. Verified live in three
steps: fresh rejection → exactly one toast; dismiss → banner empty; reload with
the server still resending → no toast, no banner. Source assertion proven to
bite. Client-only; sw + CODE_VERSION bumped in lockstep (the version test
enforces it), no redeploy required for this.

Registered for Hrishi's call, unfixed: R1 (push upsert can regress a settled
handover after a backup restore — recommend a server-side status guard), R2
(zero-holdings typed handover is the one uncapped door — recommend empty-state),
R3–R6 notes. 488 passed, 0 failed.

## 2026-07-26 — R1: settled money history survives a backup restore

`push` upserts by id over the full column width. A backup-restore rightly
re-pushes with `synced:0` (A14) — so a stale client copy still reading
`status:'pending'` would overwrite a handover the server had since settled:
confirmed flips back to pending (money leaves the receiver's book again),
rejected flips back too, and confirmedBy/confirmedAt/rejectReason go blank.
Corrections had the identical hole: `resolveCorrection` writes
status/resolvedBy/resolvedAt server-side, and a restored 'pending' copy would
resurrect a resolved flag into the cashier's queue.

Fix: a module-level `SETTLED_ON_UPSERT` table (which stores carry server-settled
fields, when a stored row counts as settled, which fields to keep) and a
`preserve()` step on BOTH upsert write-sites — including the admin-restore
reassign branch, the exact path of the finding. A pending row stays fully
writable (retries must be able to update it); only settled rows carry forward.
One extra sheet read per upsert, and upserts only happen on retry/restore,
never in the normal append-only flow.

Tests load the REAL table from Code.gs and drive the predicates; a source
assertion counts both guarded write-sites and fails when one is unguarded
(proven). 496 passed, 0 failed. **Rides the next redeploy** — no client change.

## 2026-07-26 — v4.5.5 / R2: the last uncapped handover door closed

The typed cash/UPI fallback inside handoverFlow only ever triggered when every
pot was ≤0 — i.e. the collector held nothing — and it was the one path with no
ceiling: any figure typed there was fiction the books would then owe (v4.4.1
capped the chips, not this). Removed. `startHandover` now gates on the ceiling
before opening the flow, so a collector always lands on the capped sheet.

The empty-state names the reason when there is one: with money in transit the
toast reads "₹500 আগেই পাঠানো, অনুমোদনের অপেক্ষায় — নতুন করে জমা দেওয়ার কিছু
নেই", because a collector who worked all morning would read a bare "no money"
as a bug, not a state.

Verified live on a fresh port, both directions: ceiling 0 + ₹500 pending → the
pending-aware toast and NO flow; add ₹300 fresh → the flow opens at 💵₹300
(800 collected − 500 pending, the ceiling doing its job). No console errors.
Source assertions pin both the gate and the fallback's absence. 501 passed, 0
failed. sw + CODE_VERSION → v4.5.5 in lockstep.

## 2026-07-26 — v4.5.6: the calculation-interdependency audit (A20, A21, money-model.md)

Hrishi: *"analyse all the calculations and inter dependency calculations."*

Method, not vibes: (1) the call graph of every function in aggregate.js,
extracted mechanically; (2) a 37-invariant cross-check on one rich scenario —
3 people, a handover chain, all three statuses, a void, legacy rows, a
cross-collector payment, an overspent pot; (3) a server-mirror diff of all six
reports + personalSummary_ against the REAL Code.gs; (4) adversarial probes
with amount ≠ split. Full map now lives in **docs/money-model.md** — the
layers, the two clocks (right-now vs season-to-date), the five decisions every
figure rests on, the deliberate divergences, and the invariant list.

34 of 37 held. Three of the failures were my own hand arithmetic (the code was
right — the self-consistency checks are the real proof). Two were real:

**A20 (MED):** the ceiling leaked across money types. Send 💵500 pending, then
spend 💵100: cash held 450 < cash promised 500, and Math.max(0,·) discarded the
−50, so the UPI ceiling offered 300 while hero − pending = 250 — total promised
could exceed the whole account, books −50 after confirmations. cashierView was
right; handoverable wasn't; the two paths disagreed by exactly the deficit.
Fixed: a deficit in one type now comes off the other type's ceiling. Both
`ceiling === hero − pending` and `cashierView === handoverable` restored.

**A21 (LOW):** reconcile was blind to the one corruption that splits the two
clocks — amount ≠ cash+upi (or a breakdown that doesn't sum to its amount).
Now flagged as split_mismatch / breakdown_mismatch through the existing banner;
legacy rows and __snap metadata exempt.

The sweep is not a one-off: the rich scenario + the layer-crossing equalities +
subset-agreement with the server mirrors are now permanent tests ("graph:" and
"mirror:" blocks). The mirror rule is subset-agreement on purpose: the client
may enrich report rows for display (byCat, cash/upi columns — documented
divergence #2), but a SHARED number drifting fails the suite.

525 passed, 0 failed. Client-only; sw + CODE_VERSION → v4.5.6 in lockstep.

## 2026-07-27 — v4.5.6 deployed: the fingerprint pays off on its first use

Hrishi deployed and sent a new `/exec`. For the first time the check was a
single tokenless call rather than an inference:

    curl -sL "$EXEC"
    → {"ok":true,"service":"chanda-khata","version":"chanda-v4.5.6"}

deployed === `CODE_VERSION` in Code.gs === `VERSION` in sw.js — all three
`chanda-v4.5.6`. That equality is the proof R1's guard is live: it shipped in
the same file, and the version test forbids the pair drifting. No probe, no
"the action exists so it is probably recent", no waiting to find out during a
restore. Two rounds of exactly that yesterday are what bought this line.

Also answered along the way, for the record: **no redeploy was needed for any
of A19/A20/A21/R2** — those were client-only and had already reached every
phone through Pages. The only things that had been waiting on a deployment were
R1 (restore guard) and the marker itself, and the honest advice was "no rush
unless you are about to restore a backup". Worth keeping that distinction sharp
in future: "is this client or server?" decides whether Hrishi has to do
anything at all.

config.js rebaked (fifth URL of the cycle — this account mints one per deploy).
Backend and client are now on the same version, and **nothing is pending a
redeploy.** 525 passed, 0 failed.

## 2026-07-27 — v4.6.0: duplicate entries (A22) — the one layer with no id to work with

Hrishi: *"how you handling the duplicate entries"*. Walking the layers one by
one is what found the hole, and the answer is now in docs/money-model.md as a
five-row table.

Four layers were already solid, all id-based: a uuid is minted at CREATION (not
at send), so the server upserts by id and a row sent ten times lands once; the
sync queue filters `synced`/`rejected` and `inFlight` blocks a second push; a
re-pushed payment gets no second receipt serial; `savingFlow` eats double-taps
(A4); the duplicate-donor check reads `viewData()` so another phone's donor
counts (A3); `duplicate_id` catches identical ids.

**The gap: the same instalment entered twice.** Slow phone, collector unsure it
saved, one more tap → two rows with DIFFERENT uuids, both well-formed. Every
defence above is id-based, so all of them wave it through. The donor's dues fall
by money nobody paid; the collector's in-hand rises by money they never took.

And `reconcile` could not see it: Σ in-hand === collected − expenses still
BALANCES, because both rows genuinely were collected. Only a total passing
`pledged` tripped `overpaid` — verified: ₹2000 twice against a ₹5000 pledge gave
zero anomalies and balanced true. Part-payments are the normal case, so the
common shape was exactly the invisible one.

Fixed with ONE shared rule, `samePaymentsOn(data, partyId, amount, date,
exceptId)`, used by both surfaces so they can never disagree: a confirm at entry
time (naming the existing receipt number) and a `possible_duplicate_payment`
anomaly for pairs already in the book. A warning, never a block — a donor really
can pay ₹500 twice in a day. The correction path is exempt: it re-enters the
same party/amount/day by design and voids the original in the same commit.

The human's answer is RECORDED (`dupOk`), or the admin's banner would keep
asking about a pair the collector already settled — the A19 trap again. It is a
real Sheet column, appended last, because the banner is read on a different
device from the one that answered.

**Caught in live verification, not by review:** the first cut checked `dupOk` on
the row being flagged. IndexedDB returns rows by key, not insertion order, so
the answer sat on one twin while the other got flagged — half the time. Now
grouped first; a group is settled if ANY member carries the answer. Pinned
order-independently and proven to bite.

Same class, fixed while there: `push` now calls `ensureCols_` before writing any
store. It writes position-based over the full `cols` width, so a column the
header does not name is written and never read back — this nearly bit twice
(`rejectReason`, then `dupOk`). The write path heals its own header now.

VERIFIED live on a fresh port, driving the real UI: first instalment saves
silently; the second raises the warning with its receipt number; Cancel saves
nothing and OK saves a genuine second instalment; afterwards the reconcile
banner is silent. No console errors. 548 passed, 0 failed.

**Needs a redeploy** (Code.gs: the `dupOk` column + `ensureCols_`).

## 2026-07-27 — v4.6.1: A23 — the anomaly desk, and a warning that names names

Hrishi: *"if duplicate, how admin will identify and will confirm it"* — and then
the design: *"in popup it will give the duplicate id with basic data, amount,
collector name etc, after that also if user want to proceed then ok; in
duplicate screen admin will check on this."*

The honest answer to his question was: **they cannot.** `reconcile` has always
detected eight kinds of trouble and rendered a COUNT — "আরও 2টা অসঙ্গতি … entry
দেখো". No list, no donor, no amount, no id, no button; the card was not even
tappable. And finding a duplicate payment meant already knowing which donor,
since ✏️ আমার entry's "সবার" tab covers only daily and expenses — payments live
on the donor's page. So yesterday's A22 anomaly was adding +1 to an opaque
counter.

That is worse than not detecting: a banner that says "something is wrong
somewhere" and cannot say what teaches people to ignore it, and then the day a
real ₹5,000 gap appears nobody looks.

**Two halves, one shared row-describer.**

`dupLine()` renders a payment the way a human identifies it — receipt no ·
amount · collector · timestamp · short id — and feeds BOTH surfaces, so the
popup and the desk can never describe the same row differently.

*The popup* now lists what is already there instead of asserting that something
is. Who took the earlier one is what decides the answer while the collector is
still standing in front of the donor: "যমুনা · 3 minutes ago" is my own
double-tap; "বাপি · this morning" is a genuine second instalment.

*The desk* (🩺 অসঙ্গতি পরীক্ষা, cashier/admin only) gives every anomaly a human
sentence and the rows involved. A duplicate shows both payments and the two
honest answers: ✓ আলাদা কিস্তি stamps the SAME `dupOk` field the collector's
answer uses and re-queues the row (`synced = 0`) so every device stops asking;
✖️ বাড়তিটা বাতিল goes through the existing audited `renderVoidReason`, not a new
delete path. The other seven types get a sentence and a 👁 link where one exists
— deliberately no button, because those are data surgery and a wrong "fix" moves
real money.

VERIFIED live on a fresh port with two different anomaly types seeded: banner
tappable → desk lists both with full identity (both receipts, both timestamps,
both short ids); ✓ stamps dupOk with synced=0 and the duplicate leaves the list;
fixing the last anomaly makes the banner disappear entirely. No console errors.

Pinned: every one of the eight types is asserted to have a title AND a message,
so a desk that prints a raw type name fails the suite — the rule is now
"detection without a sentence is not detection" (recorded in money-model.md).

579 passed, 0 failed. Client-only; sw + CODE_VERSION → v4.6.1 in lockstep.

## 2026-07-27 — v4.6.2: A24 — the donor phone, asked twice and never forced

Hrishi: *"ফোন বাধ্যতামূলক? dont make it but ask two times before passing the
field."*

Mandatory was the tempting version and it is the wrong one. A blocking step in
the field buys **fake numbers** — 9999999999 gets typed the moment it stands
between a busy collector and the next shop — and a fake number is strictly worse
than a blank one: it collides with every other fake number and poisons the very
duplicate detection it was supposed to strengthen. Legitimate blanks are common
here too (a ₹50 street donor, an elderly donor who does not recall it).

So: a general `confirmSkipKey` on any flow step. Skip on the phone asks once
more and says what the number buys — a WhatsApp dues reminder later, and
catching the same donor added twice. Cancel returns to the field, OK moves on.
One extra tap for the honest "no number" case; it rescues the careless case,
which is the common one. Only the phone carries it: Skip on owner/location still
passes silently, so the friction stays where it earns its keep.

**And the substance of Hrishi's idea landed in the same commit:** a phone match
is now a stronger duplicate signal than a name match. Name-only is weak — "মা
তারা স্টোর" can honestly be three shops — so a phone hit wins and gets its own
wording ("the same donor twice, or the same owner's second shop?"). Both
warnings now NAME the existing donor (name, owner, phone, pledged, collector)
instead of asserting a match exists, matching what the payment popup already
does.

`esc0()` exists because `window.confirm` renders PLAIN TEXT — running it through
`esc()` would print literal `&amp;` at a collector. Named, so nobody "fixes" it
later and nobody pastes it into innerHTML.

VERIFIED live: Skip on owner passes silently; Skip on phone asks, Cancel keeps
you on the field, OK advances; a new shop with a completely different NAME but
the same phone was caught, naming "সাহা স্টোর (রতন সাহা) · 📞 9876543210 · কথা
₹3,000 · যমুনা". No console errors. Pinned — including that the step stays
`optional: true`, so a future tidy-up that makes it blocking fails the suite.

590 passed, 0 failed. Client-only; sw + CODE_VERSION → v4.6.2 in lockstep.

## 2026-07-27 — perf check: does today's guarding slow the collector down?

Hrishi: *"will it slow the process"*. Measured, not reassured — the "buttons are
too slow" episode earlier in this project was a real ReferenceError, and the
lesson there was that guessing about performance wastes days.

Season-full book (1,200 donors · 3,500 payments · 900 daily · 400 handovers ·
2,000 chat messages), timed in the BROWSER on that data, not in node:

    samePaymentsOn  (the new duplicate check)      0.7 ms   ← runs on every save
    handoverable    (the ceiling)                  4.2 ms
    mySummary       (আমার হিসাব)                    9.5 ms
    reconcile       (the banner)                  ~51 ms   ← cashier/admin, on open

And the thing that actually matters — the real UI, last tap to receipt on
screen: **≤ 50 ms**, of which `DB.put` is 1.2 ms.

What today added, isolated by running the old and new `reconcile` side by side
on identical data: **14.41 → 15.43 ms, +1.0 ms (7%)** for the A21/A22 scans. The
duplicate check adds **0.7 ms** to a save. Both are far below the 16 ms frame
that would make a tap feel late.

Two traps avoided while measuring:
- The first `samePaymentsOn` call clocked 7.9 ms and the warm one 0.7 ms — JIT
  warm-up, not cost. Benchmarking the first call would have "found" a problem
  that does not exist.
- An early end-to-end reading said 1,007 ms. That was the 20 ms polling loop in
  the measurement harness; instrumenting `DB.put` directly showed the save
  finishing inside 50 ms. **Measure the thing, not your own wait().**

Considered and rejected: making `samePaymentsOn` filter only `payments` instead
of going through `activeData` (0.2 ms vs 0.7 ms). A 0.5 ms saving is not worth a
second void-filtering path that could drift from the one every other reader
uses — that divergence is exactly the shape of A18.

No change committed from this pass; it is a measurement, recorded so the next
person does not re-derive it.

## 2026-07-27 — real-phone smoke test PASSED (Hrishi)

Install · mic permission · Bengali (bn-IN) voice entry · receipt → WhatsApp —
**all four green on a real handset.**

Worth marking clearly: this is the one item in the whole go-live checklist that
no amount of work here could close. Everything else all season has been verified
by driving the app in a desktop browser — but mic permission, bn-IN speech
recognition and the WhatsApp share sheet are OS-level, and a desktop browser
cannot stand in for any of them. Voice entry in particular is the feature a
collector uses fifty times a day; it had 49 parser tests and zero real-device
confirmations until now.

With this, the remaining go-live list is entirely Hrishi's own operational
steps: one Code.gs redeploy (the A22 `dupOk` column + `ensureCols_`), rotating
the session tokens shared in chat, finalising master data, clearing the training
data, and then all-devices-synced → 🚀 Go Live.

## 2026-07-27 — v4.7.0: committee-member registry (A25) + the red dot (A26)

Hrishi's spec: a member list (name, position, email, mobile, app-user)
maintained by the admin; collection = pick a member, enter an amount, many
times, comment mandatory. Plus: a red dot on any button with work pending.

### The decision that mattered: member was ALREADY a donor

`member` has been a party type all along — a money pot in `AVAIL_CATS`, a
permission in `ENTRY_KINDS`, a row in `computeTotals.byType`, a category in
handover breakdowns; part-payments and dues already worked. Building a `members`
store would have created a **second money path** with its own receipts, dues,
pots and reconcile — the exact divergence docs/money-model.md was written to
prevent. Hrishi said it plainly: *"already member entry is there if you see,
that will be modified."*

So only FIELDS are new — `position`, `email`, `appUser`, appended last on
`parties` (and `ensureCols_`, added yesterday, materialises them without a
`setup()` run). Positions are an admin-editable `Lists` kind like areas and
locations, seeded সভাপতি / সম্পাদক / কোষাধ্যক্ষ / সদস্য so the flow works
immediately while the real titles stay Hrishi's to set.

`appUser` is **informational only**, and the admin card says so in words: money
belongs to whoever COLLECTED it, never to whoever the payment is "about".
"Credit it to the member" is precisely the reflex that would break every
in-hand figure.

The member note step carries no `optional`, so the flow renders **no Skip button
at all** rather than validating after the fact. A member pays many times a season
— monthly, a function, a special donation — and the amount alone will not say
which months later.

Caught while building: the correction path constructs a payment flow from
`{id, name}` with no `type`, so an edited member payment would have silently
dropped back to an optional comment. It now looks the donor up first.

### The dot, and the rule it had to obey

Every source was already computed — no new counting, no new polling. The rule
comes from today's own two failures (A19's ghost toast, A23's blind counter):
**a marker that cannot be cleared teaches people to ignore markers.** So each dot
maps to a screen containing the action that clears it, and each goes out on its
own.

Verifying rather than assuming found two real bugs:

1. The dot lit `anomalies` — a tile that **did not exist on home**. The desk was
   reachable only by tapping the reconcile banner on 📊 রিপোর্ট. Now a home tile
   for cashier/admin, which also means a cashier who never opens reports finally
   discovers it.
2. The ✏️ and 💰 tiles are hand-rolled (wide, custom label) and bypassed
   `drawTile`, so they silently missed the marker. One `dotMark()` helper now
   serves every tile however it is built.

And the dot has to go OUT: recomputed on every home paint, repainting only when
the map actually changed — that change-check is what stops
render→refresh→render looping for ever.

VERIFIED live throughout: পদ chips in Bengali; a bad email rejected, a good one
saved; the member row storing position + email + pledged; the payment step with
NO Skip, refusing to advance while blank, saving "মাসিক চাঁদা — অগাস্ট";
linking @yamini05 to রতন সাহা and **the money staying at ₹600, untouched**; the
dot appearing, the duplicate being settled on the desk, and the dot gone on
return to home. No console errors. 611 passed, 0 failed.

Two of my own test harnesses were wrong before the code was (a user stub missing
`years`, an assertion counting `dotMark(` uses) — recorded because a red test is
not automatically a red product.

**Needs the redeploy** (Code.gs: the three parties columns + `LIST_KINDS`).

## 2026-07-27 — v4.7.1: A27 — everyone is a member by default; types are the committee's own

Hrishi, tightening yesterday's registry: *"position gulo ekhon eguloi"* → *"by
default are members only, let the input have as member by default — and make
another list to have member types where the admin will add the data (english and
bengali)."*

Two separate things, and they behave differently on purpose.

**পদ (position) — one entry, সদস্য, never asked.** The four seeded titles are
down to one. With a single option the flow now SKIPS the question entirely and
`savePartyAndFirstPayment` fills the value in: a chip with one choice is a tap
that answers nothing, but leaving the field blank would mean today's members
carry no position at all and adding real titles later would open a silent gap in
the register. Add a second position in the admin panel and the question appears
by itself — no deploy.

**🏷️ সদস্যের ধরন (memberType) — a NEW list, and it ships EMPTY.** Only the
committee knows whether it runs আজীবন / বার্ষিক / সাধারণ, and inventing a list
here would just be one more thing for Hrishi to correct. So the question does not
exist until he adds the first entry, and then it appears on its own. Same
bilingual admin-editable `Lists` mechanism as areas, locations and positions —
one `LIST_KINDS` array gates the server, so the panel and the gate cannot
disagree about what is editable.

`memberType` is appended last on `parties`, after `appUser`; `ensureCols_` picks
it up, so still no `setup()` run.

VERIFIED live in both states on one fresh port. Empty list: the member flow asked
নাম → Email → ফোন → pledge — **no position question, no type question** — and the
saved row still read `position: 'member'`. Then, with two types added the way the
admin panel adds them: the very next member was asked "সদস্যের ধরন?" with chips
আজীবন সদস্য / বার্ষিক সদস্য, and saved `memberType: 'life'`, label resolving to
আজীবন সদস্য. No console errors.

621 passed, 0 failed; three new guards each proven to bite (asking with one
position, asking with an empty type list, and a seeded type list). Two of my own
test expectations had hard-coded the old `LIST_KINDS` and column tail and broke
first — the code was right before the tests were.

**Rides the same pending redeploy** (Code.gs: `memberType` in `LIST_KINDS` + the
column).

## 2026-07-27 — rebake for the v4.7.1 deployment, and what the /exec URL is worth hiding

Hrishi deployed the pending backend, put the new `/exec` in **Settings on his own
device**, and asked whether that was fine — so the latest link stays out of the
public repo.

### Is the URL a secret? Measured, not assumed

Against the new deployment, no token:

    dump / pull / push / listUsers   →  {"ok":false,"error":"no-token"}

Only `login` (needs a real password) and `register` run unauthenticated, and
`register` creates a `status:'pending'` account that can do **nothing** until an
admin approves it — an unwanted name in the admin list, not a breach. (The
first-registrant-becomes-admin path is long closed: that only fires on an empty
Users sheet.) There is no shared "secret" gate on the server despite the old
Settings field of that name; the **token** is the gate, and it holds.

And the URL cannot be secret anyway in a client-side app: it sits in
localStorage on ten phones and in every sync request. Hiding it buys nothing and
costs onboarding.

### The real problem was not security

`Settings.scriptUrl` is **per device**, and it wins over `config.js`. Measured:

    Hrishi's phone (Settings)        →  chanda-v4.7.1
    every other phone (config.js)    →  chanda-v4.5.6

Same Sheet, so no data split — but nine collectors would be running old SERVER
code: no `rejectHandover` (the ❌ পাইনি button simply fails), no `dupOk` column,
no member-registry columns, and none of the A17/A18 server fixes. A fleet split
across two backends produces symptoms that are very hard to trace back to their
cause.

So `config.js` is rebaked, which is what moves everyone together.

**Hrishi should now clear the Settings field on his own device** — it overrides
config.js, so left in place his phone would be the one stranded on an old
backend after the *next* redeploy, which is the hardest version of this fault to
notice.

### The version marker paid for itself

`doGet` returning `CODE_VERSION` (added v4.5.3, after two rounds of "probably
deployed, cannot prove it") answered both halves of this in one tokenless curl
each. First real use, and "is the running code current?" became evidence instead
of assumption.

621 passed, 0 failed. No sw bump — `config.js` is served network-first and
deliberately never precached, so the rebake reaches devices without one.

## 2026-07-27 — v4.7.2: A28 — the deploy that never reached the phone

Hrishi: *"not able to see any member related changes in app"*, then *"i logged in
admin only but not able to see, and in member entry also no change"*.

Everything WAS live — checked and re-checked on the server. The gap was the one
hop this project had never verified: **server → handset**.

`cache.addAll(ASSETS)` fetches through the browser's HTTP cache, and GitHub
Pages sends `cache-control: max-age=600` on every file (measured, not assumed).
So a phone that had opened the app in the previous ten minutes could fill the
**brand-new** cache with the **old** JavaScript. The version bump is then spent
on stale content, nothing retries until the next deploy, and the device reports
the new version while running yesterday's code. Worse, it can repeat on every
future deploy.

Install now fetches each asset with `new Request(u, { cache: 'reload' })` and
`cache.put`s it — bypassing the HTTP cache outright. A failed asset throws, so a
half-built cache never activates; `addAll` gave that for free by accident, and
this makes it deliberate.

**The reason it was undiagnosable at all:** the app never showed its own
version. Settings had a hard-coded `v2` that has not changed in this project's
entire life, so "which build is my phone on?" had no answer from the phone.
Settings now prints the real cache name the JS is served from
(`chanda-v4.7.2 • hostname`) and offers **🔄 আপডেট খুঁজি**, which calls
`registration.update()` — a stuck device now fixes itself without the user
needing to know what an app-shell cache is. Also written into the in-app guide,
bn + en, under "something was added but you cannot see it?".

VERIFIED by imitating the broken phone rather than trusting the theory: a stale
`js/app.js` was planted in the previous cache name, then the new worker was
allowed to install. It fetched the real 258 KB file (member-type code present),
Settings reported `chanda-v4.7.2`, and the update button answered "✅ এটাই সর্বশেষ
version". Both halves pinned; proven to bite by restoring `addAll`.

**The lesson, and it is the uncomfortable one:** every verification in this
project stopped at "the file is correct on the server". Nothing checked whether
a device could actually receive it. For that whole class of fault, a user saying
"I can't see it" was the only detector we had. Now the phone can answer for
itself.

631 passed, 0 failed. Client-only — no redeploy needed.

## 2026-07-27 — v4.7.3: the member registry, corrected to what was actually asked

Hrishi: *"you did wrong on member changes."* He was right, and the correction is
worth recording as much as the code.

**What he asked for**, restated back to him and confirmed: register a committee
member with **name, phone, email, position, app-user** — and separately, take
their contributions with **amount + comment, both mandatory, many times over**.

**What I had built instead:** a 🏷️ membership-type list nobody asked for; the
position question hidden because I had reduced the list to a single entry; and
`pledged` still being asked, because I extended the donor flow without asking
whether a pledge means anything for a member.

Corrected:

- **🏷️ সদস্যের ধরন removed entirely** — list kind, column, step, admin card,
  strings, tests. It was invented, not requested.
- **Four committee posts restored** (সভাপতি / সম্পাদক / কোষাধ্যক্ষ / সদস্য, bn+en)
  and the position is now **always asked** from the list.
- **No pledge, no money at registration.** This screen registers the person;
  contributions come later through 💰 টাকা জমা, which is where the amount and
  the comment are both required and where a member can have as many entries as
  the season needs.
- **Adding a member stays permission-gated** on the existing `member` grant, so
  Hrishi can hand it to whoever he likes — verified with a non-admin holding
  nothing but that one permission.

### The consequence I had to chase down

A member now has `pledged: 0`, and `reconcile`'s overpaid rule was
`paid > pledged` — so **every single member contribution would have raised an
anomaly**, and the 🩺 desk would have filled with noise until nobody read it
(exactly the A19/A23 failure). A pledge of zero now means "no pledge was ever
agreed" and is skipped; a real pledge that IS exceeded still reports. Members
also correctly never appear in the dues list, since `due = pledged − paid` is
never positive.

### And a bug of my own making, plus the gate that will catch the next one

A careless regex edit left a stray `}` in js/app.js. The file could not parse,
so **the entire app rendered blank** — and the suite stayed green, because every
test reads app.js as *text*. Even the scope checker never runs on a file that
does not compile.

`tests/run.js` now parses all thirteen shipped files (js/*, sw.js, Code.gs)
before anything else. Proven to bite by re-inserting a brace. This should have
existed from the first day: it is the cheapest possible check and it guards the
loudest possible failure.

VERIFIED live end to end with a NON-admin holding only the `member` permission:
tiles limited to member/list/handover/hbook/entries; the flow asked নাম → পদ →
Email → ফোন and stopped — no pledge, no money, no type; the saved row carried
position `secretary`, email, phone, `pledged: 0`; the payment flow refused a
blank comment (no Skip button at all), and two contributions were recorded
against the same member (₹300 "মাসিক চাঁদা — শ্রাবণ", ₹500 "প্রতিমা তহবিল");
reconcile stayed clean with zero anomalies and the in-hand read ₹800. No console
errors. 653 passed, 0 failed.

**Rides the pending redeploy** — Code.gs lost `memberType` from `LIST_KINDS` and
from the parties columns.

## 2026-07-27 — v4.8.0: 🤝 সদস্য is a COLLECTION screen; the register is its own

Hrishi: *"where i told to register the members… now what the member entry screen
you have created, that was as previous to collect the amount — there the
collections will be done from member… we will select the member there from
member list and will make entry of cash or upi, thats it."*

I had turned the 🤝 সদস্য tile into a registration form. He never asked for that.
It was, and is again, the screen for **taking a member's contribution**.

**Two screens, two grants:**

| | screen | grant |
|---|---|---|
| collect from a member | 🤝 সদস্যের চাঁদা — pick from the register, cash/UPI + mandatory comment, as many times as the season needs | `member` (existing) |
| keep the register | 🎖️ কমিটির সদস্য — add a member (name · post · email · phone) and link their app account | `memberadmin` (NEW) |

Separate on purpose, and it is Hrishi's own line: *"what will have seperate
permission."* One person keeps the register; many people collect. The register
grant carries nothing else with it — verified with a user holding only
`memberadmin`, and again with one holding only `member`, who gets the collection
tile and cannot even see the register.

`newPartyFlow` is shops and persons again — the member fields I had bolted onto
it are gone, and so is the admin-panel card I had added, now that the register
has a screen of its own.

Linking an app account is still **informational only**, and the register screen
now says so in words: money belongs to whoever COLLECTED it, never to whoever
the payment is about.

### Two of my own breakages, both caught by the gate added an hour earlier

Deleting the old admin card with a regex left a stray `}` in js/app.js; deleting
orphan strings left half of a two-line i18n entry behind. Both made the file
unparseable — and the **parse gate added in v4.7.3 failed the suite immediately
in each case**, instead of the app silently rendering blank. That gate has now
paid for itself twice on the same day it was written.

VERIFIED live end to end: 🤝 opens the picker (not a form) and says "কোনো সদস্য
নথিভুক্ত নেই" when empty; 🎖️ registers রতন সাহা as সম্পাদক with email and phone
and `pledged: 0`; back on 🤝 the member appears with post and phone, and his
running total moves ₹0 → ₹300 between the two collections; ₹300 cash and ₹500
UPI both recorded against him with mandatory comments (no Skip button); in-hand
₹800 and reconcile clean. Dropping `memberadmin` removes the register tile while
collection still works. No console errors. 674 passed, 0 failed.

**Rides the pending redeploy** — Code.gs `PERM_KEYS` gained `memberadmin`.
