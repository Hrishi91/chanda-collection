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
- [ ] GitHub repo + Pages deploy (**needs Hrishi's ok — public repo**)
- [ ] END-TO-END sync test against real Apps Script deployment
      (blocked on Hrishi doing setup-google.md steps)
- [ ] Real-phone smoke test: install, mic permission, bn voice entry

## P0.5 — v2: users, roles, money handling (Hrishi, 2026-07-23)

Requirements given in chat; awaiting final go + UPI answer
(committee UPI vs collectors' own UPI).

- [x] ~~Phase 1 — auth: register/login, admin approval per year,
      admin password reset, roles admin/cashier/collector~~
      (2026-07-23, verified against protocol mock; real Apps Script
      e2e still pending Hrishi's deploy)
- [ ] Phase 2 — money: payment mode cash / UPI / both (split amounts,
      reported separately); handover flow (collector "জমা দিলাম ₹X" →
      cashier confirms "জমা নিলাম"); per-collector cash-in-hand
      dashboard; UPI-to-committee counts as auto-settled
- [ ] Phase 3 — expenses: admin-managed category list, cashier picks
      category on expense entry (Hrishi will supply list later)
- Decision (recommended, pending ok): NO per-entry cashier approval —
  entries post immediately; accountability comes from the handover
  ledger instead, so collection never blocks on a busy cashier.

## P1 — nice-to-have before puja

- [ ] Receipt image/PDF per payment (share via WhatsApp)
- [ ] Edit/void entries with audit trail (currently append-only)
- [ ] Per-collector leaderboard on central report
- [ ] PNG icons (maskable) alongside SVG

## P2 — next year

- [ ] Year rollover flow (carry party master, fresh pledges)
- [ ] Import last year's pledges as suggestions

## Open questions

- Apps Script URL + secret distribution to 10 phones (QR code?)
