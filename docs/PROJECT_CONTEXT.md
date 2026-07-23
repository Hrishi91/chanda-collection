# PROJECT_CONTEXT — Chanda Collection

*Last updated: 2026-07-23*

## What

A yearly (Ganesh Puja) chanda-collection system. ~10 collectors each
install a PWA ("agent") on their phone, make guided voice/typed entries,
work fully offline, and sync to one central Google Sheet in Hrishi's
Google account. A central report view aggregates everyone's data into
the final hisab. Data survives any phone/app deletion because the Sheet
(in Google Drive) is the source of truth, plus JSON backup export.

## Decisions (with cause)

| Decision | Cause |
|---|---|
| PWA, not native app / Telegram bot | No store friction; installs from a link; works offline (puja-crowd networks are bad); no 24×7 server to run |
| Google Sheet + Apps Script as backend | Requirement was "data in Google Drive"; zero cost; committee can open the raw Sheet; scale (hundreds of entries) is far below quotas |
| GitHub Pages hosting | Free HTTPS (needed for PWA install + mic). No domain needed |
| Voice = guided Q→A→confirm (Option B), not free-talk | Bengali STT mangles names/places; unconfirmed entries risk wrong amounts → committee disputes. No LLM cost either |
| Pledged amount for ALL party types | Hrishi: "make for all". Balance = pledged − installments |
| `year` field on every record | Puja is annual; party master list carries over, pledges/payments restart each year |
| Vanilla JS, no build step | 1 developer, static hosting, easy for future sessions to pick up |
| Own username/password auth (Users sheet, salted SHA-256 + token), NOT Google login | Hrishi needs admin approval, admin password reset, per-year access — trivial with own Users sheet, impossible with Google login. Trust level: puja committee, not a bank |
| Admin approval gates everything; first admin via makeAdmin() run in editor | No open access even with the public URL; shared-secret removed (token replaced it) |
| Cashier = admin-grantable flag, not an account type | Hrishi: admin decides who's cashier (could be himself/others, multiple ok) |
| UPI goes to members' PERSONAL numbers (no committee account) | So UPI ≠ auto-settled: it counts as in-collector's-hand until handover, same as cash; mode still recorded for reconciliation |
| Handover ledger instead of per-entry cashier approval | Entries post immediately (busy cashier must not block collection); accountability via collector "জমা দিলাম" → cashier confirms, dashboard shows per-collector cash-in-hand |
| Per-report access, enforced server-side (dump is admin-only) | Hrishi: admin sees all reports, cashier gets one default (inhand), everyone else only what admin grants per report; report data must never leak through a hidden button, so the server gates it. Reports are read-only (no write path). Everyone keeps their own-device totals |

## Architecture

```
[10× mobile PWA] --POST(JSON, text/plain)--> [Apps Script web app] --> [Google Sheet]
   IndexedDB + sync queue                       doGet(summary) <-- central report view
   JSON export/import (manual backup)           daily JSON backup -> Drive folder
```

Sheets: Parties, Payments, DailyCollections, Expenses (append/upsert by
uuid `id`; dedupe server-side). Client marks records synced only after
server confirms.

## People

- Owner: Hrishikesh (GitHub: Hrishi91). 10 collectors incl. him.
- UI languages: Bengali + English toggle.

## Shop sides (fixed enum)

main_malda (Main Road → Malda), main_balurghat (Main Road → Balurghat),
harirampur (Harirampur Road), singhadaha (Singhadaha Road)

## Known limitations (told to Hrishi)

- Offline entries not yet synced die with the app if it's cleared first
  → prominent "unsynced" badge in UI.
- Voice needs internet on most phones (server-side STT); typing always works.
