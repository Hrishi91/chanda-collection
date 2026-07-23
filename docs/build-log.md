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
