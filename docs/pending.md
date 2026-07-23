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

## P1 — nice-to-have before puja

- [ ] Receipt image/PDF per payment (share via WhatsApp)
- [x] ~~Edit/void entries with audit trail~~ (2026-07-23, payments; daily/
      expense void later — needs a per-entry browse screen)
- [ ] Per-collector leaderboard on central report
- [ ] PNG icons (maskable) alongside SVG

## P2 — next year

- [ ] Year rollover flow (carry party master, fresh pledges)
- [ ] Import last year's pledges as suggestions

## Housekeeping

- [ ] ⚠️ Hrishi's GitHub fine-grained PAT was shared in chat
      (2026-07-23) and is still active on this Mac (gh keyring) —
      revoke/regenerate it once his mobile is working again.

## Open questions

- Apps Script URL + secret distribution to 10 phones (QR code?)
