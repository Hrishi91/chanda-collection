# Final-stage audit — 2026-07-25

Whole-project sweep before go-live: defects, calculations, security,
scale, interdependencies. Every claim below was verified by reading the
actual code (file:line) or by test/live-check — not guessed. Items marked
**FIX** are recommended before giving the link to all collectors.

## A. Confirmed defects — ALL FIXED in v3.77.0 (2026-07-25)

Each fix was verified by reproducing the failure condition live (see
build-log v3.77.0). Kept below for the record.

### A1. HIGH — FIXED — Undo can silently fail against an in-flight sync
**Where:** `js/sync.js` syncNow (mark-synced step) + `js/app.js` attemptUndo.
**Cause:** save → `autoSync()` (debounced ~1s) starts a push (1–3s round
trip) that overlaps the 5s Undo window. `attemptUndo` checks `row.synced`
(still 0, push in flight) → deletes the row. Then syncNow's success handler
`bulkPut`s its **snapshotted row objects** — recreating the deleted row
locally (marked synced) — and the server saved it anyway, so even without
the bulkPut the next pull resurrects it. The collector believes the entry
is gone; it counts in every total.
**FIXED (both layers, verified with a forced 2.5s slow push):**
1. syncNow must re-read each row by id before marking synced and skip rows
   that no longer exist (never blind-put a snapshot).
2. attemptUndo: if the row is synced OR a sync is in flight → write a
   **void record** (reason: "undo") instead of deleting — a void is the only
   correct retraction once a row may have reached the Sheet. Requires
   exposing `Sync.inFlight`.

### A2. MED — FIXED — Server-rejected rows retry forever, badge never clears
**Where:** `js/sync.js` (no `rejectedIds` handling); server returns them
from push gating (Code.gs push).
**Cause:** a row the server rejects (entry-kind permission revoked while
the collector still held unsynced rows of that kind — a realistic admin
action, not just tampering) stays `synced:0` forever: retried on every
sync, unsynced badge stuck, beforeunload nags.
**FIX:** mark rejected rows (e.g. `rejected:1`), exclude them from
`collectUnsynced`, surface once in "আমার এন্ট্রি" with a note so the
collector knows to flag/hand the entry to a cashier.

### A3. MED — FIXED — Duplicate-donor check is device-local only
**Where:** `js/app.js` newPartyFlow save → `DB.getAll('parties')`.
**Cause:** the dup warning only sees the device's own parties. Two
collectors adding the same shop from two phones both pass → duplicate
donor centrally, pledged totals inflated, dues double-counted.
(`Aggregate.reconcile` flags `duplicate_id` only for identical ids, not
identical names.)
**FIX:** check against `viewData()` (central snapshot + own rows) — one
line change, same confirm flow.

### A4. LOW — FIXED — Double-tap on the last step throws a TypeError
**Where:** `js/app.js` submitAnswer / finishFlow.
**Cause:** after the final answer, finishFlow saves async while the old
step UI stays interactive; a second tap reads `steps[idx]` = undefined →
`step.kind` throws. No double-save (the crash precedes any write) — but
it's an uncaught error on a money path.
**FIX:** `if (!step) return;` guard + a `saving` flag.

### A5. LOW — FIXED — Category chip totals don't clamp negative subtypes
**Where:** `js/app.js` handoverFlow categories map.
**Cause:** chip `amount` = raw cash+upi while the selectable cash/upi are
clamped to ≥0 — if legacy books over-drain one subtype negative, the chip
label disagrees with what selecting it gives (by the negative part).
Cosmetic; disappears post-go-live (all rows carry breakdowns).
**FIX:** clamp both the same way.

### A6. LOW — FIXED — Negative amounts render as "₹-80"
`fmtMoney` on over-drained books (title "তোমার হাতে"). Cosmetic; honest.

### A7. LOW-MED — FIXED (rides the pending redeploy) — Voided handovers still notified the cashier
**Where:** Code.gs `notifData_` + `pendingHandovers` — both iterated RAW
handovers, so a voided pending handover (now likely via undo-void, A1) kept
appearing in the cashier's confirm list and notification feed. Money math
was never wrong (aggregation excludes voids on both sides; confirming the
ghost was harmless) — but the cashier chased phantoms.
**FIXED:** both now pass the dataset through `activeData_` first (2 lines).
Ships in the same pending Code.gs redeploy as the `breakdown` column.

## Second pass — 2026-07-25 (all aspects re-check, clean)

On Hrishi's "check once again": walked every layer not line-verified in the
first pass. Results:
- **All 39 server actions** enumerated with their first gate line: every
  data action starts with `requireUser_`/`requireAdmin_`; only
  register/login/logout are public, by design. Role sub-gates (cashier-only,
  admin-only) verified individually.
- **SW precache** covers every js file except config.js (deliberate:
  network-first so a baked URL change always reaches devices).
- **index.html script order** safe — cross-file reads (`t()`, `Settings`)
  happen at runtime, not load time.
- **Report mirror parity**: same 7 branch ids client & server.
- **Forgot-password flow** is an instruction screen (admin resets) — no
  unauthenticated reset path exists.
- **XSS second sweep**: zero unescaped interpolations of user-entered
  strings (names/notes/desc/from) in any innerHTML template.
- **Code.gs parses clean** (node --check via .js copy); 125 tests green.
- One new finding (A7, above) — fixed immediately, server-side only.

## B. Design tradeoffs (deliberate — re-confirm before go-live)

1. **Every device holds the whole year's data** (pull snapshot). Report
   permissions shape the UI, they are not secrecy — `dump` is admin-only
   but `pull` returns everything to any approved user. Accepted
   2026-07-24 (committee-transparent khata).
2. **UPI goes to personal numbers** → counts as in-hand until handover.
3. **Pending handovers stay in the giver's hand** until cashier confirms
   (myAvailable and inHandRows agree on this).
4. **Undo after sharing a receipt**: a donor could hold a receipt image
   for an entry undone seconds later. Process rule for collectors (share
   the receipt, then don't undo — void via review instead), not code.
5. **goLive wipes every transactional sheet + every device's cache.** Any
   UNSYNCED rows on any phone at that moment are lost — see checklist G5.
6. **Legacy (pre-breakdown) handovers** drain categories in a fixed
   documented order — a deterministic approximation that vanishes at
   go-live (wipe) since all new rows carry exact breakdowns.

## C. Calculation cross-checks (all verified)

| Invariant | How verified |
|---|---|
| Σ in-hand = collected − expenses (`reconcile`) | 125 unit tests + live run on real Sheet data (balanced; 3 known test-data anomalies correctly flagged) |
| overview === computeTotals (one `isCashOnly`) | regression tests (v3.71 audit) |
| Server↔client report mirror | byte-identical check v3.37; server reports untouched since; **rule: any Code.gs aggregation edit must be mirrored in aggregate.js** |
| myAvailable totals ≡ per-person inHand | same inputs by construction; 20 tests incl. byCat, breakdown add/subtract both sides, legacy drain order, collection-expense category hit |
| Cross-collector split (donor total vs holder) | dedicated regression tests (Salil 400 + Ram 600 scenarios) |
| Void excludes everywhere incl. breakdowns | activeData() filters before every computation |

## D. Security posture

Server-enforced: token on every action; role checks; per-entry push
gating; void permission matrix; single token per user (2nd device kicks
1st); key-stretched passwords (`s2$`, transparent upgrade); server-side
logout; last-admin safeguard; collector identity stamped **from the
token**, never trusted from the client. Audit sheet append-only.

Client: `esc()` discipline spot-checked across notif banner, cards, chips
(consistent). Token in localStorage — acceptable at committee trust level;
no CSP (static Pages) — accepted. No secrets in repo.

Open (Housekeeping): rotate chat-shared tokens (re-login), revoke the
2026-07-23 GitHub PAT.

## E. Scale / quota math (peak puja day)

10 devices × delta-pull/60s × ~14h ≈ 8.4k requests/day + push bursts
(debounced) — comfortably inside Apps Script consumer quotas;
simultaneous ≤10 ≪ 30 limit; LockService serializes writes. Delta pulls
return ~0 rows when idle. Full-pull storm only after a redeploy URL
change (once per device). GitHub Pages runtime is static+SW — build
delays (observed 2026-07-25, GitHub-side) affect deploys, never runtime.

## F. Interdependency map

- **Code.gs redeploy PENDING**: handovers `breakdown` column (v3.76.0).
  Until deployed: handovers sync fine, receiver sees 'received' instead of
  per-category. After paste → **New deployment** (this account never
  repoints old URLs) → rebake config.js → run setup().
- config.js ↔ each /exec URL; SW fetches config network-first.
- Reports = f(pull snapshot, aggregate.js) — single aggregation path;
  Code.gs mirrors kept only for old clients.
- Fix A1 touches sync.js+app.js; A2 sync.js+app.js; A3 app.js only —
  all client-only (no server change, no redeploy beyond the one pending).

## G. Go-live checklist (in order)

1. ~~Land fixes A1–A6~~ DONE (v3.77.0); static redeploy live.
2. Code.gs → New deployment → send me the URL → config.js rebake →
   run setup() once.
3. Re-login everywhere (rotates chat-shared tokens); revoke the old PAT.
4. Finalize master data: areas, locations, expense subjects, receipt
   design + serial digit width, puja name.
5. **Every device shows "সব sync হয়ে গেছে ✅"** — then admin 🚀 Go Live
   (types LIVE). Unsynced rows at this moment would be lost.
6. Post-live verify: two devices wiped by the epoch, first entry gets
   serial 2026000001, reconcile banner silent, receipt has no SAMPLE
   watermark.
7. Real-phone smoke test: install, mic permission, bn-IN voice entry,
   receipt → WhatsApp.
8. Distribute the link + collector guide; approve registrations from the
   admin panel; assign areas + entry permissions per collector.

## Two-user live pass — 2026-07-25 (A=hrishi91/admin, B=yamini05/collector)

Hrishi supplied a second session token so the cross-user paths could be
exercised for real. Everything below ran against the live deployment;
all writes were "AUDIT TEST"-labelled and voided afterwards (books verified
back to baseline). Two NEW defects found — both fixed.

### A8. MED — FIXED — A7's fix silently killed correction notifications
**Where:** Code.gs `activeData_` (+ its client mirror `aggregate.js activeData`).
**Cause:** `activeData_` never returned a `corrections` key. Harmless while
only aggregation used it — but A7 routed `notifData_` through it, so
`d.corrections` became undefined there and **pending correction flags stopped
appearing in the cashier/admin notification feed**. Proven live: B flagged an
entry, A's feed showed `corrections: 0` while the flag existed and
`resolveCorrection` worked. A regression introduced by my own A7 fix and
caught only because the two-user pass exercised the flag→review path.
**FIXED:** both `activeData_` and the client mirror now pass `corrections`
through (they aren't voidable).

### A9. MED-HIGH (security) — FIXED — Client could attribute entries to another collector
**Where:** Code.gs `push` — `row.collector = row.collector || user.row.name;`
`row.collectorId = row.collectorId || user.row.username;`
**Cause:** identity was taken from the PAYLOAD when present, and only fell
back to the token. So a tampered client could stamp someone else's
`collectorId` on an entry — moving the cash-in-hand liability onto an
innocent collector — and could also forge `collectorRole`, which drives the
void-permission rule. Found because my harness sent `collectorId:"x"` and
the server preserved it verbatim (the real client always sends its own
identity, so normal use never exposed it).
**FIXED:** `collector`, `collectorId` and `collectorRole` are now stamped
from the token unconditionally. Handover `from`/`to` stay as sent — those
are legitimately about other people, and `confirmHandover` is the gate.

### Verified green in the two-user pass
| Path | Result |
|---|---|
| B's role/permission edges: auditLog, listUsers, dump → `not-admin`; pendingHandovers → `not-cashier` | ✓ |
| B pushes a general expense (cashier-only) → server push-gate | ✓ rejected, `rejectedIds` returned |
| B's road/handover/correction pushes (allowed kinds) | ✓ saved |
| B→A handover with `breakdown` appears in A's notif feed + pending list | ✓ (from "Yamini mahato", ₹3) |
| A confirms the handover | ✓ |
| A approves B's correction flag → void created | ✓ |
| Category relay: ₹3 handed as `road` lands in A's **road** bucket, not "received" | ✓ 1500 → 1503 |
| Cross-collector payment: A pays into B-created party → party total right, cash attributed to the payer | ✓ |
| Receipt serials keep incrementing without collision across users | ✓ 2026000010, 2026000013 |
| B's delta pull (`since=cursor`) returns only the new rows, not the year | ✓ 6 rows |
| Voided handover disappears from the pending list (A7) | ✓ |
| Books after voiding every AUDIT row: hrishi91 in-hand identical to baseline | ✓ (total drift explained: two real ₹1000 payments Yamini entered from her phone meanwhile) |
