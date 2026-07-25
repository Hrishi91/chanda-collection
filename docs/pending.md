# Pending / Roadmap

*Rewritten when plans change. Done items struck through with date.*

## P0 — v1 must-haves (before giving link to collectors)

- [x] ~~PWA shell: manifest, service worker, offline app-shell caching~~ (2026-07-23)
- [x] ~~IndexedDB data layer + sync queue~~ (2026-07-23)
- [x] ~~i18n bn/en toggle~~ (2026-07-23)
- [x] ~~Guided chat-style entry flows~~ (2026-07-23)
- [x] ~~Voice input + amount word parser (49 tests)~~ (2026-07-23)
- [x] ~~Bulk shop mode~~ (2026-07-23, needs live re-check on phone)
- [x] ~~Parties list + search + dues; party detail + installment~~ (2026-07-23)
- [x] ~~Local dashboard + unsynced badge~~ (2026-07-23)
- [x] ~~Apps Script backend (Code.gs)~~ (2026-07-23, code written)
- [x] ~~Sync client + settings~~ (2026-07-23)
- [x] ~~Central report view~~ (2026-07-23)
- [x] ~~JSON export/import backup~~ (2026-07-23)
- [x] ~~Setup + collector guides~~ (2026-07-23)
- [x] ~~GitHub repo + Pages deploy~~ (2026-07-23, live at
      hrishi91.github.io/chanda-collection)
- [x] ~~END-TO-END sync test against real Apps Script deployment~~
      (2026-07-23: push→Sheet, upsert dedup, server reports, handover
      confirm, subject CRUD, myReport all verified with a real admin token)
- [ ] Real-phone smoke test: install, mic permission, bn voice entry
- [ ] Clean up test data left in the Sheet (SYNC TEST দোকান + its payment,
      Ramu→hrishikesh handover) — Hrishi to delete

## P0.5 — v2: users, roles, money handling (Hrishi, 2026-07-23)

Requirements given in chat; awaiting final go + UPI answer
(committee UPI vs collectors' own UPI).

- [x] ~~Phase 1 — auth: register/login, admin approval per year,
      admin password reset, roles admin/cashier/collector~~
      (2026-07-23, verified against protocol mock; real Apps Script
      e2e still pending Hrishi's deploy)
- [x] ~~Phase 2 — cash/UPI/both split, handover ledger with cashier
      confirm, per-collector in-hand dashboard~~ (2026-07-23; UPI goes
      to personal numbers so it counts as in-hand until handover —
      Hrishi's "within us only" decision)
- [x] ~~Phase 2.6 — per-report access control~~ (2026-07-23): 6 named
      reports (overview/dues/inhand/collectors/expenses/daily), each
      computed server-side; admin=all, cashier=inhand default, others=
      admin-granted per report (Users.reports). Enforced server-side
      (dump now admin-only). Admin-panel per-user report chips. Everyone
      keeps own-device report. 3+ cashiers supported (flag, no limit).
      Verified curl+browser against mock.
- [x] ~~Phase 2.7 — personal "My summary" for everyone (self-scoped,
      no permission): collected/handed/received/in-hand/cash-UPI/daily/
      my-expenses. True in-hand = collected + received − handedOver −
      expenses (central inhand upgraded too). Expense entry restricted
      to cashier/admin.~~ (2026-07-23, verified curl+browser)
- [x] ~~Phase 3 — admin-managed expense subjects; cashier/admin picks a
      subject on expense entry; multiple cashiers part-pay a subject;
      "Other" forces a comment; report groups by subject; admin sees
      all.~~ (2026-07-23, verified curl+browser). Hrishi can add the
      real subject names anytime from the admin panel.
- Decision (recommended, pending ok): NO per-entry cashier approval —
  entries post immediately; accountability comes from the handover
  ledger instead, so collection never blocks on a busy cashier.

## P0.7 — polish/hardening sprint (2026-07-23, DONE, needs one redeploy)

Fix-list #1–#10 + in-app notifications + in-app guide, all live (sw
v3.20.0). See build-log for details. Pending: batched Code.gs redeploy
(voids, collectorId identity, logout, password, notifications) + run
setup() (auto-migrates columns) + clear the leftover test data.

- [x] ~~#1 reconciliation self-check~~  [x] ~~#2 IST date~~
- [x] ~~#3 void payment (audit)~~  [x] ~~#4 collector identity by username~~
- [x] ~~#5 server-side logout~~  [x] ~~#6 password policy (min6 + stretched)~~
- [x] ~~#7 auto/pull refresh~~  [x] ~~#8 import guard~~
- [x] ~~#9 data-loss guard~~  [x] ~~#10 speed (debounce + report cache)~~
- [x] ~~in-app notifications (banner + OS) — Telegram deferred~~
- [ ] Telegram alerts (Hrishi's bot) — deferred, discuss later

## P0.8 — v3 sprint: sync architecture + roadmap A–D (2026-07-24, DONE, DEPLOYED)

Backend redeployed 2026-07-24 (AKfycbwm…), config.js rebaked, live-verified
with a real admin token. See build-log v3.34.0–v3.46.0 for details.

**Sync architecture (the "too slow" fix)**
- [x] ~~Pull-down sync: one `pull` returns the year dataset; client caches it
      in localStorage and renders every screen from the local snapshot merged
      with its own unsynced rows~~ (2026-07-24). Replaced the per-screen
      `parties`/`partyPayments` round-trips.
- [x] ~~Incremental delta pull (`since` + `cursor`): idle 60s polls return 0
      rows instead of the whole year~~ (2026-07-24, verified live:
      full=14 rows, delta=0 rows).
- [x] ~~Reports render from the snapshot too — ONE aggregation path
      (Aggregate.computeReport mirrors Code.gs), no per-report fetch~~
      (2026-07-24; 5 of 6 reports byte-identical server vs client).
- [x] ~~`fmtDate`/`fmtDateTime`: Sheet round-trips day cells as UTC ISO, now
      always displayed as the IST day~~ (2026-07-24).

**Roadmap A–D (the "hardcoded data / roles / notifications" list)**
- [x] ~~A. Admin-editable master data (areas + person locations, bilingual;
      expense-subject edit)~~ (2026-07-24)
- [x] ~~B. Role gap: in-app admin grant/revoke with safeguards (can't demote
      self, can't remove the last admin) + collector↔area assignment~~
      (2026-07-24, safeguards verified live)
- [x] ~~C. Rich notification feed: who/amount/date + inline approve · decline ·
      confirm · view (was count-only)~~ (2026-07-24)
- [x] ~~D1. Area-wise report / leaderboard (🥇🥈🥉 by collected)~~ (2026-07-24)
- [x] ~~D3. Audit / activity log: append-only Audit sheet, every privileged and
      money action logged, admin "📜 কার্যকলাপ" view~~ (2026-07-24)

**UX**
- [x] ~~Find-party "blinking" fix (background pull no longer rebuilds the
      screen under the user)~~ (2026-07-24)
- [x] ~~Scroll: top on navigate, position preserved on background refresh~~
      (2026-07-24)

## P0.9 — receipts, training/live mode, permissions & polish (2026-07-24/25, DONE, DEPLOYED & VERIFIED 2026-07-25)

Everything below shipped after the P0.8 docs catch-up (v3.47.0). Unlike the
earlier sprints, this whole batch has been **redeployed AND live-verified**
(2026-07-25 config.js → AKfycbzZJp…; real `pull` call confirmed notif-in-pull
and a balanced reconcile on real data). See build-log v3.48.0 onward for the
full detail behind each line.

- [x] ~~Field-validation audit: mandatory text fields, expense zero-guard,
      fat-finger amount confirm (>₹1,00,000)~~
- [x] ~~Indian mobile-number validation (phone step + register)~~
- [x] ~~Real app icon (glowing OM + Ganesha), visible in-app (header/login)~~
- [x] ~~**Donation receipt feature, complete**: server serials
      (`payments.receiptNo`, atomic per-year counter) + `Config` sheet;
      admin receipt-design screen (3 layouts, 5 colours, logo, live preview);
      share screen (📷 WhatsApp image / 💬 SMS text); authentic Bengali রসিদ
      wording (invocation, prose acknowledgement, amount-in-words,
      type-aware donor line for shop/person/bus); ₹ + Bengali digits~~
- [x] ~~**Training/Live mode**: training is the default state (SAMPLE
      watermark + persistent amber banner everywhere); admin `🚀 Go Live`
      (3-step confirm incl. typing "LIVE" + serial digit-width pick) backs up
      to Drive, wipes every transactional sheet, resets serial counters,
      bumps a `data_epoch` that force-clears every device's local cache~~ —
      **⚠️ built but NOT yet triggered — see "Next decision" below**
- [x] ~~Enforce one account = one active device (2nd-device login kicks the
      1st within ≤60s) + admin "🔓 release a stuck session"~~
- [x] ~~Role-based screens: admin sets which entry kinds
      (party/payment/daily/handover) each user may use; home hides the rest~~
- [x] ~~Search upgrade: multi-field (name/owner/phone/area/location),
      multi-word AND, Bengali-normalised~~
- [x] ~~Report PDF: "📄 PDF বানাও / প্রিন্ট" via window.print() on every
      central report~~ — supersedes the old "Report export" P1 item below
- [x] ~~Admin panel restructured into 3 collapsible sections (users /
      receipts+lists / data+audit)~~
- [x] ~~Audit fixes: find-party payment-permission bypass closed; stale
      `ck_user` now refreshes from every `pull` (permission/role changes
      reach a device within ≤60s, no re-login needed)~~
- [x] ~~Calculation audit: swept the full money-math interdependency graph
      (21/22 checks passed cold); fixed the one real bug — three different
      "legacy cash-only" checks disagreed on blank-vs-undefined split fields,
      unified to one canonical `isCashOnly` check~~
- [x] ~~Reconcile banner (red warning if Σ in-hand ≠ collected − expenses) +
      notifications ride the `pull` response (kills 3 separate polling
      loops) + server-side push permission gating (mirrors client
      entryAllowed_, rejects tampered pushes)~~

## Next decision — Go Live

Training mode is still ON (default since it shipped). Every entry made so
far is a training/test entry and will be **wiped** the moment `🚀 Go Live`
runs (admin panel → data+audit fold). Hrishi to decide **when** to trigger
it — needs: collectors briefed/installed, master lists (areas/expense
subjects) finalised, receipt design set, and the leftover test-data cleanup
below done first (goLive wipes it anyway, but cleaner to not rely on that).

## P1 — nice-to-have before puja

- [x] ~~Receipt image per payment~~ — superseded by the full receipt feature
      in P0.9 above
- [x] ~~Edit/void entries with audit trail~~ (2026-07-23 payments via party
      detail; daily/expense/handover covered too via "my entries")
- [x] ~~Browse **other people's** daily/expense entries to void or flag
      them~~ (2026-07-24, folded into P0.9 above)
- [x] ~~Per-collector leaderboard on central report~~ (2026-07-23 as the
      `collectors` report; area leaderboard added 2026-07-24)
- [x] ~~Dues follow-up: WhatsApp reminder from party detail (name + due
      pre-filled; collector taps send)~~ (2026-07-24, D5)
- [x] ~~Report export (PDF) for the committee~~ (2026-07-25, P0.9 above) —
      Excel export not built, low priority now that PDF exists
- [ ] Attach a bill / shop photo to an entry — D6, not started
- [x] ~~PNG icons (maskable) alongside SVG~~ (2026-07-24, real-app-icon work
      — the SVG placeholder was removed entirely)

## P2 — next year

- [x] ~~Year rollover flow: `rolloverYear` carries the party master into the
      new year (fresh ids, no payments, pledges kept as the starting ask),
      refuses if the target year already has data~~ (2026-07-24, built +
      wired; **not yet run** — run it when 2027 setup starts)
- [x] ~~Import last year's pledges as suggestions~~ — covered by rollover
      carrying pledges forward as the default ask

## Housekeeping

- [ ] ⚠️ Hrishi's GitHub fine-grained PAT was shared in chat
      (2026-07-23) and is still active on this Mac (gh keyring) —
      revoke/regenerate it once his mobile is working again.
- [ ] Rotate the admin session tokens pasted into chat during the
      2026-07-23/24/25 verification sessions — just re-login in the app.
      (2026-07-25: one more token was shared for a read-only `pull` check
      against the new deployment — no writes made, still needs rotation.)
- [ ] Confirm `setup()` has been run in the Apps Script editor for the
      2026-07-25 deployment (adds/migrates any new sheet headers —
      Config sheet, receiptNo columns, entries/areas columns on Users).
      Most of it self-migrates on first use, so this is hygiene, not urgent.
- [ ] Archive the orphaned Apps Script deployments (every redeploy has
      minted a new URL on this account — now several generations deep).
- [ ] Clean up leftover test/training data in the Sheet — now visibly
      flagged by the reconcile banner (SYNC TEST দোকান + payment, an old
      Ramu→hrishikesh handover). Will also be wiped automatically by
      `🚀 Go Live` (see "Next decision" above), so this is optional if
      going live soon.

## Open questions

- Apps Script URL + secret distribution to 10 phones (QR code?)
