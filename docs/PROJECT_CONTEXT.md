# PROJECT_CONTEXT — Chanda Collection

*Last updated: 2026-07-25 (post final audit, v3.77.0)*

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
| **Training/Live mode split, with a one-way Go Live** (2026-07-24) | Real collection can't wait for every feature to be pre-verified against production data — so the app launches in a permanent-until-flipped **training mode** (SAMPLE-watermarked receipts, amber banner everywhere) that behaves identically to live but is understood as disposable. `🚀 Go Live` (admin, 3-step confirm) backs up to Drive, wipes every transactional sheet, resets serial counters, and bumps a `data_epoch` so every device force-clears its local cache on the next pull — a clean cutover with a safety net, not a data migration |
| **One account = one active device** (2026-07-24) | The server already held a single token per user; the gap was client-side (offline-first meant a kicked device kept working on its stale session). A second-device login now bounces the first to the login screen within ≤60s — prevents two people quietly sharing a login. Admin can release a stuck session as the escape hatch |
| **Role-based entry permissions (`Users.entries`)** | "Make it simple, don't overwhelm" — Hrishi wanted a collector to see only the entry tiles they're meant to use, not a wall of options. Empty = all (nobody is accidentally locked out); admin sets it per user, enforced client-side (UI) AND server-side (push gating, 2026-07-25) so a locked-out entry kind can't be pushed even by a tampered client |
| **Receipts: ready layouts, not raw HTML; serials never reused, never re-numbered on Go Live within a year** | Hrishi's spec: two share paths (WhatsApp image / SMS text), branded but simple. Serial is a per-year atomic counter (`nextReceiptNo_`, under the same push lock) so 10 concurrent phones can never collide or duplicate a number |
| **Instant save + Undo, no confirm screen; Undo-of-a-synced-row = void** | Speed: the chat transcript already shows every answer, so a review screen was one tap of pure friction. The 5s Undo deletes only rows that never left the device; anything synced (or mid-push) gets an audit-preserving void (reason 'undo') instead — a local delete of a server-known row would silently resurrect on the next pull |
| **The receipt IS the entry's finish line** | A payment/new-donor/bus save lands directly on the receipt screen (donor expects it on the spot), with context-aware continue buttons (➕ same-type again with sticky area — this replaced bulk mode — or 🔍 back to the same search for payments) |
| **Handover by SOURCE category, cash/UPI as subtypes, exact `breakdown` on the row** | Collectors hand over "the bus money", not an abstract number: chips show each category's real amount, no typing. The breakdown JSON keeps BOTH sides' per-category books exact forever — the receiving cashier sees the money under the original categories (cashier→cashier stays category-aware) |
| **Report PDF via `window.print()`, no PDF library** | Zero dependencies, works fully offline, and "Save as PDF" is a native option in every phone's print dialog — cheaper and more reliable than shipping a PDF-generation library for an occasional committee handout |

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

Sheets: Parties, Payments, DailyCollections, Expenses, Handovers (now
carrying a `breakdown` JSON of source categories), Voids, Corrections, plus
Users, ExpenseSubjects, Lists (bilingual master data), Config (receipt
design + serial counters + live_mode/data_epoch) and Audit (append-only
activity log). `setup()` migrates schemas by appending any
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
- **Grants decide what you may ENTER, not what you may SEE** (Hrishi,
  2026-07-26, commit `7a84c76` "Looking is not doing"). He asked twice for the
  entry buttons to be hidden from somebody granted nothing; I went further and
  blocked 📒 খাতা and 📗 জমা-খাতা from being READ, and he corrected it —
  **"let them see"**. The ledger is the committee's own book and a collector is
  on the committee. So: nothing granted → home is one card with the admin's
  name and number; 📒 খাতা, 📊 রিপোর্ট, 📗 জমা-খাতা and 💬 বার্তা stay readable.
  Pinned by 17 tile tests. **This decision was never written down at the time,
  and on 2026-07-28 that cost an hour and I nearly reversed it a second time.**
  Do not change it without Hrishi saying so in as many words.
- **Two exceptions to that rule, added 2026-07-28** because the assumption under
  it broke. Its stated reason was "somebody who collects nothing has no money to
  hand over" — true while grants could only be ADDED. 🧹 clearUserGrants now
  removes them, possibly from somebody already holding cash, and the version
  lock can freeze somebody mid-round. In both cases **🤝 জমা দিলাম and 📗 জমা-খাতা
  stay** whenever there is money in hand. Not 'payments' — taking a further
  instalment is collecting. Stranded cash cannot be undone; a permission rule is
  not worth that.
- **A phone behind the server may not make new entries** (Hrishi, 2026-07-28).
  Asked for at A34, argued down to an alert, and asked for again — his call.
  `canEntry` refuses every permission key while `Auth.versionCmp() === -1`, which
  covers every entry tile and every entry route in one line. Admins included: a
  stale admin client is no safer than anyone's. Handing money over is exempt.
  Known cost, accepted: a phone we already know is behind stays blocked offline.
- **Sessions never expire, and that is decided, not forgotten** (2026-07-28).
  One token per user, held in a single cell of the Users sheet; a login anywhere
  else overwrites it, so one account = one device. Nothing else ends a session.
  A time limit was considered and rejected: it would expire exactly when someone
  is at a shop with no signal, which is the worst possible moment in an
  offline-first app. The answer to a lost or stolen phone is 🔓 **সেশন ছাড়ো**
  (`releaseSession`) or 🚫 **Block** — Hrishi's call, and he considers it
  sufficient. Two follow-ups were offered and declined: a "release every
  session" button, and queueing an offline logout so it reaches the server.
  Consequence to keep in mind: a logout made while offline clears the phone but
  leaves the sheet's token valid until the next login overwrites it.

## Current state (2026-07-25)

The app is fully built and deployed, but **`live_mode` is still off** — every
entry made so far, on any device, is training data and will be wiped the
moment Hrishi runs `🚀 Go Live` (admin panel). See `docs/pending.md` →
"Next decision — Go Live" and **`docs/final-audit.md`** (two full audit
passes, 2026-07-25 — all findings fixed) for the pre-flight checklist.
