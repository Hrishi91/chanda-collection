# Pending / Roadmap

*Rewritten when plans change. Done items struck through with date.*

## P0 — v1 must-haves (before giving link to collectors)

- [ ] PWA shell: manifest, service worker, offline app-shell caching
- [ ] IndexedDB data layer + sync queue (parties/payments/daily/expenses)
- [ ] i18n bn/en toggle
- [ ] Guided chat-style entry flows (new party, payment, daily, expense)
- [ ] Voice input (Web Speech API bn-IN/en-IN) + Bengali/English amount
      word parser (tested)
- [ ] Bulk shop mode (sticky side, loop entry)
- [ ] Parties list + search + dues; party detail + add installment
- [ ] Local dashboard (device totals) + unsynced badge
- [ ] Apps Script backend (Code.gs): upsert by id, summary doGet,
      daily Drive JSON backup function
- [ ] Sync client + settings (collector name, script URL, secret)
- [ ] Central report view (fetch summary from Apps Script)
- [ ] JSON export/import backup
- [ ] Setup guide for Hrishi (deploy Apps Script) + collector user guide
- [ ] GitHub repo + Pages deploy (**needs Hrishi's ok — public repo**)

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
