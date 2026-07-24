# PROJECT_CONTEXT — Chanda Collection

*Last updated: 2026-07-24*

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
| **Pull-down snapshot instead of per-screen fetches** (2026-07-24) | Every screen used to fetch on open — each an ~1–3s round-trip on puja-crowd networks. Indexes would cut server compute but NOT the round-trip, so the win is *fewer calls*: one `pull` returns the year, the client caches it and paints instantly from cache, merging its own unsynced rows on top |
| **Incremental delta pull (`since` + `cursor`)** (2026-07-24) | The 60s refresh re-downloaded the whole year even when nothing changed (~780KB projected at season scale × 10–20 phones). `since` returns only rows with a newer `receivedAt`; idle polls come back empty. In-place status changes (handover confirm, correction resolve) bump `receivedAt` so they ride the delta |
| **One aggregation path — reports computed client-side** (2026-07-24) | Reports were computed on the server while ledger screens were computed on the client: two mirrored implementations that could drift, plus a round-trip per report. `Aggregate.computeReport` mirrors `computeReport_` exactly, so reports now come off the same snapshot (verified byte-identical against the server) |
| **Every collector's device holds the whole year's data** | Consequence of the snapshot, accepted knowingly: this is a combined committee khata where party balances already sum across collectors, so there is nothing one collector may see that another may not. Role gates remain on *actions* (writes), which stay server-enforced |
| **Collector↔area assignment (`Users.areas`)** | "Who is responsible for which road" — drives the area report/leaderboard and accountability. Areas come from the editable master list, not a hardcoded enum |
| **Admin grant/revoke in-app, with two safeguards** | Was editor-only (`makeAdmin`). Now any admin can promote/demote, except: you cannot demote yourself, and the last remaining admin cannot be demoted — the committee can never lock itself out |
| **Append-only Audit sheet for privileged + money actions** | A money app needs "who did what, when": voids, correction approve/reject, handover confirms, role/permission/status changes, password resets and master-list edits are all logged. `logAudit_` is try/catch-wrapped so logging can never break the real action |
| Structural enums stay hardcoded (party type, payment mode, daily type) | These drive flow and logic — party type picks a different entry flow, payment mode drives cash/UPI maths, daily type toggles the bus name/number fields. Only *labels* (areas, locations, expense subjects) are admin-editable |

## Architecture

```
[10× mobile PWA] --push(JSON, text/plain)--> [Apps Script web app] --> [Google Sheet]
   IndexedDB + sync queue     <--pull(since)--   upsert by uuid, LockService
   localStorage snapshot                         daily JSON backup -> Drive folder
   JSON export/import (manual backup)
```

**Write path** — entries land in IndexedDB immediately (offline-first) and
queue for `push`; the server upserts by uuid `id` (dedupe) and stamps
`receivedAt` + collector identity. Records are marked synced only after the
server confirms.

**Read path** — one `pull` returns the whole year; the client caches it in
`localStorage.ck_central` with a `cursor`. Later pulls send `since=cursor` and
get only rows whose `receivedAt` is newer. Every screen renders from
`viewData()` = central snapshot + this device's own unsynced rows (own row wins
by id), so a just-saved entry is visible before it syncs. Refresh happens on
login, focus, after each push, and every 60s.

Sheets: Parties, Payments, DailyCollections, Expenses, Handovers, Voids,
Corrections, plus Users, ExpenseSubjects, Lists (bilingual master data) and
Audit (append-only activity log). `setup()` migrates schemas by appending any
missing column to the header, so new columns must always be added at the END of
the column arrays.

## Two-dimensional data model (why cross-collector works)

Every payment carries both `partyId` (which donor) and `collectorId` (who
collected it). Party balance groups by `partyId` across all collectors; cash
in hand groups by `collectorId`. So when Salil collects ₹400 and Ram later
collects ₹600 from the same ₹1000 shop, the shop shows ₹1000 paid while each
collector holds only what they actually took — money is never mixed.

## People

- Owner: Hrishikesh (GitHub: Hrishi91). 10 collectors incl. him.
- UI languages: Bengali + English toggle.

## Shop areas (admin-editable master list, seeded from the old enum)

Seeded ids keep the original enum values so existing rows keep working:
main_malda (Main Road → Malda), main_balurghat (Main Road → Balurghat),
harirampur (Harirampur Road), singhadaha (Singhadaha Road). Admins add/edit/
remove areas (and person locations) from the admin panel — each item carries a
Bengali and an English label. Collectors are assigned areas via `Users.areas`.

## Known limitations (told to Hrishi)

- Offline entries not yet synced die with the app if it's cleared first
  → prominent "unsynced" badge in UI.
- Voice needs internet on most phones (server-side STT); typing always works.
