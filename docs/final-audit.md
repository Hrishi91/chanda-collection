# Final-stage audit — 2026-07-25

Whole-project sweep before go-live: defects, calculations, security,
scale, interdependencies. Every claim below was verified by reading the
actual code (file:line) or by test/live-check — not guessed. Items marked
**FIX** are recommended before giving the link to all collectors.

## A. Confirmed defects — ALL FIXED in v3.77.0 (2026-07-25)

Each fix was verified by reproducing the failure condition live (see
build-log v3.77.0). Kept below for the record.

### Status of every finding (A1–A18, S1–S3)

All FIXED in code. **2026-07-26: the long-pending redeploy has happened** —
Hrishi deployed and the new `/exec` was fingerprinted (`rejectHandover` → the
action exists; the old URL answers `unknown action`), so the column that used to
read "awaiting the pending redeploy" is now empty:

| Verified live against the Sheet | Awaiting a redeploy |
|---|---|
| A1–A6, A8, A9, A10 | *(none — the 2026-07-26 deployment cleared A13, A16, S1–S3)* |
| A7 (voided handover left the queue) | |
| A11 (cashier resolved a collector's flag, `ok:true`) | |
| A12, A14, A15 (client-only, tested + browser-checked) | |
| A17 (any cashier could confirm anyone's handover) | |
| A18 (a refused parcel parked in "confirm বাকি" for ever) | |

One caveat carried forward: `ensureCol_()` — the guard that stops a brand-new
column silently swallowing its value — was written AFTER that deployment, so it
is not in the running code. Either `setup()` has been run (which does the same
job) or the next redeploy picks it up. **Open question for Hrishi.**
| S1/S2/S3 **proven live 2026-07-26** — see below | A16 (chat kill switch) |

Deliberately NOT changed, with reasons, so nobody "fixes" them later by reflex:
- `js/app.js` at ~3,600 lines stays one file until after the season — no build
  step, the tested logic already lives apart in `aggregate.js`, and a structural
  refactor before go-live is risk with no user-visible gain.
- Light theme only; emoji buttons carry no aria-labels (ten known users).
- Client `activeData` omits `messages` while Code.gs `activeData_` keeps them —
  a real, documented divergence for performance. Both sides say so.
- Expenses may drive a category negative (Hrishi's decision, squared up later by
  exchanging cash).

Still needing a DECISION from Hrishi, not a fix:
- `yamini05` and most collectors have an EMPTY reports list — they can open no
  central report at all. Intended, or to be granted before go-live?

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
7. ~~Real-phone smoke test: install, mic permission, bn-IN voice entry,
   receipt → WhatsApp.~~ **DONE 2026-07-27 — all four green** (Hrishi, real
   handset). Nothing on a desktop can stand in for this: mic permission, bn-IN
   recognition and the WhatsApp share sheet are OS-level.
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

### A10. MED — FIXED — A person's byCat could exceed the inHand printed beside it
**Where:** `js/aggregate.js` `personalSummary` + `myAvailable` (6 sites),
mirrored in Code.gs `personalSummary_`.
**Cause:** `inHandRows` keys people by `collectorId || collector || '?'`, so a
row with a blank `collectorId` becomes a SECOND identity keyed on the display
name. But the per-person filters carried an extra fallback —
`ck(r) === String(ident) || r.collector === ident` (and `h.to === ident`). With
`ident` being that name-keyed identity, the fallback swallowed every row whose
collector *name* matched, i.e. all the rows the inHand had already assigned to
the real username. Found in the live training data: one report line read
`inHand 1100` next to a byCat summing to `19500`.
**FIXED:** one identity rule everywhere — a row belongs to `ident` only when its
own group key equals `ident`; no name fallback. Legacy rows still match, because
with no `collectorId`/`toId` the name IS the group key.
**Reach:** after Go Live the sheet starts empty and `push` stamps `collectorId`
from the token unconditionally (A9), so a blank id can only come from entries
made on a device before login and not yet synced — narrow, but it showed two
disagreeing money figures side by side, so it is closed pre-launch.
**Regression test:** `dual-identity` in `tests/run.js` — 4 assertions fail on the
old code, pass on the new.

### A11. MED — FIXED (server half rides the next redeploy) — Cashier could never act on a collector's entry
**Where:** Code.gs `push` (`row.collectorRole = user.row.role || 'collector'`),
Code.gs `resolveCorrection`/`targetCollectorRole_`, `js/app.js` `canVoid`.
**Cause:** a regression from A9. Entry rows carry `collectorRole` in the
separation-of-duties vocabulary `'admin'|'cashier'|'collector'`, which the
client had always translated into. A9 moved the stamping server-side and wrote
the raw Users-sheet word — and that sheet says `role: 'admin'|'user'` with a
SEPARATE `cashier` flag. Every collector's row was therefore stamped `'user'`,
which no rule tests for: `resolveCorrection` refused with `not-allowed`, and
`canVoid` returned false, hiding Undo on every collector entry from the cashier.
Caught by the three-role live pass (71/72) — the UI half was found by reading
`canVoid` once the server half was explained.
**FIXED:** one translation used on both sides — `roleOf(role, cashier)` on the
way in, `rowRole(stored)` on the way out (anything not admin/cashier is a
collector, which also heals rows already written as `'user'`). Added to
`js/aggregate.js`, mirrored as `roleOf_`/`rowRole_` in Code.gs; `js/auth.js:42`
and `js/app.js:211` now call the shared helper instead of inlining it.
A9's guarantee is unchanged — the value still comes only from the token.
**Regression tests:** 16 cases covering both helpers and the cashier-may-act
rule they feed, including a legacy `'user'` row.

### A12. HIGH — FIXED — An edit could vanish an entry entirely
**Where:** `js/app.js` `finishFlow` (the `def.editing` path), and the Undo toast.
**Cause:** the void for the ORIGINAL row was written BEFORE `def.save` ran. A
rejected save (zero amount) or the user backing out at any later step left the
original voided with no replacement — the entry and its money gone from every
book. Independently, after a SUCCESSFUL edit the Undo toast knew only the new
row: tapping it deleted the replacement while the void on the original stood.
**FIXED:** the void is written only after the replacement saves, and an edit
shows a plain "saved" toast with no Undo — unwinding half of a two-row
operation is worse than offering none. Correcting a correction is editing again.

### A13. MED — FIXED (server half rides the redeploy) — The no-permission card had no phone number
**Where:** Code.gs `cashiers`, `js/app.js` `adminContactHTML`.
**Cause:** the card's entire purpose is the admin's name and 📞/💬 buttons, and
they could never appear — `adminContactHTML` filters the list for
`role === 'admin'` but the server returned only `{username, name}`. No row ever
matched, and the Settings fallback was written by nothing.
**FIXED:** `cashiers` now returns `role`, and `phone` for admins only. The card
fetches the list when the device has never had it and remembers the admin in
Settings so it still works offline.

### A14. MED — FIXED — A restored book could silently never reach the Sheet
**Where:** `js/app.js`, the import "keep as written" branch.
**Cause:** it preserved `synced:1` from the exported file. After a
wipe-and-restore those rows are NOT on the server, and a row marked synced never
pushes — the book looked complete on the phone and stayed missing from the Sheet
forever.
**FIXED:** `synced:0` on both branches. Re-pushing an existing id is a harmless
upsert.

### A15. LOW — FIXED — Chat hardening (three)
500-character cap at the input and at send (a Sheet cell takes 50,000, but one
pasted essay would ride every phone's pull forever); a server-refused message is
marked ❌ instead of sitting in the sender's feed dressed as sent; and a mention
arriving while the chat screen is open and visible no longer fires an OS
notification. XSS was probed in the browser at the same time: a hostile
`<img onerror>` message stays inert text — `esc()` covers `&<>"'`.

### S1. HIGH (performance) — FIXED (rides the redeploy) — Every poll read the entire book
**Where:** Code.gs `pull` → `readAll_`.
**Cause:** `pull` called `readAll_` unconditionally —
`getDataRange().getValues()` on all eight sheets, filtered by year in JS. A delta
poll returning zero rows still read every row written that season. Ten phones ×
once a minute × all day, growing daily, and chat rows joined it in v3.96.0.
**FIXED:** a `data_ts` stamp in Config, bumped by every action that changes rows.
A delta whose cursor is at or past the stamp answers after reading one small
Config range: **6,057 cells → 38** on a 400-payment book (159×).
Two traps handled deliberately — the returned cursor is
`max(maxReceivedAt, data_ts)` so client and stamp share one clock (otherwise the
fast path never fires), and the stamp throws rather than failing quietly
(a stamp behind the rows would make every device skip real data forever).

### S2. MED (performance) — FIXED (rides the redeploy) — A Sheet write per row
`push` called `appendRow` once per row, each a round trip inside the script
lock. New rows for a store are now written with one `setValues`.

### S3. MED (performance) — FIXED (rides the redeploy) — Every serial rewrote the Config sheet
`nextReceiptNo_` did a full `readConfig_` + `setConfig_` per serial, inside the
row loop. `reserveReceiptNos_` takes a batch in one read/write, still atomic
under the script lock. A 20-row push drops from **61 Sheet operations to 4**;
verified on 400 rows with 400 unique consecutive serials.

### A16. MED — FIXED (rides the next redeploy) — The chat kill switch never worked
**Where:** Code.gs `setConfig`, and both client call sites.
**Cause:** two independent mistakes, either alone enough. `setConfig` reads the
patch from `b.config` — an object — but both chat-switch call sites sent
`{key, value}`, which it ignored. And `chat_off` was never added to the
whitelist, so even the correct shape would have been dropped. The action returns
`{ok:true}` regardless, so the button toasted "chat stopped", the tab stayed,
and messages kept flowing.
**Found how:** only by running it live. Code review had passed it twice — the
client looked right, the server looked right, and nothing connects them until a
real call is made. Confirmed against the deployed build afterwards: sending the
correct shape STILL leaves `chat_off` empty.
**FIXED:** `chat_off` whitelisted; `setConfig` accepts both shapes; an unlisted
key now THROWS (`unknown-config-key`) instead of quietly succeeding, and the
response reports which keys it `applied`. A silent no-op that answers ok is the
worst failure mode this codebase can have.
**Pinned:** tests parse the allow object itself — proven to bite by removing
`chat_off` and watching it fail — and assert that `live_mode`, `data_ts` and the
`receiptSeq_` counters can NEVER be written through this door.

### A17. HIGH (authorisation) — FIXED 2026-07-26 (needs a redeploy) — Any cashier could confirm anyone's handover
**Where:** Code.gs `confirmHandover` (~line 901).
**Cause:** the gate was `Number(u.row.cashier) !== 1 && u.row.role !== 'admin'`
— i.e. "are you A cashier", never "are you THE recipient". It then matched the
handover by `b.id` alone and stamped `status=confirmed`, `confirmedBy=<caller>`.
So cashier A could confirm a parcel collector Y had sent to cashier B: B's
in-hand rises for money B never touched, Y's falls, and the audit names A as the
receiver. Confirming is the one action that moves money between two people's
books, which makes this the worst-placed missing check in the file.
**Why it was invisible:** `pendingHandovers` DOES filter to the recipient, so the
UI never offers someone else's parcel. The hole was only reachable by calling the
action directly — with an id that is visible to any admin, and to anyone who has
seen another phone's screen.
**FIXED:** one shared `isRecipient_(h, u)` now backs BOTH `pendingHandovers`
(what you may see) and `confirmHandover` (what you may confirm), so the two can
never drift apart; a non-recipient gets `not-recipient`. Two extras while there:
re-confirming a settled row now throws `already-confirmed` instead of restamping
`confirmedBy` and erasing who really acknowledged it; and an admin confirming on
someone else's behalf — a deliberate escape hatch for a dead phone mid-puja — is
logged under its own verb `handover:confirm-on-behalf`, naming the intended
recipient, because it is not the same act.
**Pinned:** `isRecipient_` is loaded from the REAL Code.gs and exercised in
tests/run.js (username match, another cashier refused, offline no-`toId` name
fallback, and that the fallback lets nobody else in); the action body is asserted
to call it and to throw both codes. Proven to bite by deleting the guard and by
making `isRecipient_` return true. `err_not_recipient` / `err_already_confirmed`
have real messages, so a permission refusal no longer reads "network problem".

### A18. MED (reporting) — FIXED 2026-07-26 (needs a redeploy) — A refused handover sat in "confirm বাকি" for ever
**Where:** `inHandRows` ([js/aggregate.js](../js/aggregate.js)) and its mirror
`computeReport_('inhand')` ([apps-script/Code.gs](../apps-script/Code.gs)).
**Cause:** both wrote `if (status === 'confirmed') {...} else { pending += amt }`.
A bare `else` means "everything that is not confirmed is in transit" — true until
v4.5.0 gave a handover a third outcome. A parcel the cashier had **refused** would
therefore show in the central "কার হাতে কত" report's *confirm বাকি* column for the
rest of the season. The `inHand` figure itself stayed right (pending is never
subtracted), so nothing was double-counted — but the report Hrishi reads to chase
collectors would have been chasing money that had already come back.
**Found how:** Hrishi asked *"you were telling some other dependable tasks, that
will affect with this change"* — and the honest way to answer was to grep every
read of a handover status rather than trust the count I had given. I had said six
sites; there were **eight**. The two I missed were both in this pair, and one of
them is the central report.
**FIXED:** `else if (hoPending(h))` on the client, `else if (status !== 'rejected')`
on the server. `reconcile()` was checked at the same time and is unaffected — it
balances in all three states, so no false "হিসাব মিলছে না" banner.
**Pinned:** a three-row table drives `inHandRows` through pending / rejected /
confirmed and asserts the in-hand column, the pending column AND that reconcile
still balances; a source assertion counts the server mirrors. Both proven to bite
by restoring the bare `else`.

**Lesson recorded:** a bare `else` on a two-state field is a landmine the day a
third state arrives. The predicates `hoConfirmed` / `hoRejected` / `hoPending`
exist so this is a compile-time-visible choice rather than an implicit default.

## Post-v4.5.3 all-roles pass — 2026-07-26 (after the reject-path day)

Fresh sweep of the code as it stands after the seven commits of 2026-07-26,
every role, machine-checked rather than recalled: 488 tests + scope check green;
i18n 476 keys, no duplicates, no missing `t()` targets; sw ASSETS complete
against the files on disk (config.js excluded by design); every render of
`rejectReason`/`reason` goes through `esc()`; an 11-invariant mixed-chain money
simulation (3 people, all three statuses, a legacy no-breakdown rejected row)
agrees across `inHandRows`/`reconcile`/`mySummary`/`handoverable`/`cashierView`.
Two of its assertions failed on first run — MY hand arithmetic, not the code's;
the self-consistency checks (hero === central row, Σslots === raw, ceiling ≤
hero) are the real proof and all held.

### A19. LOW-MED (UX, season-long) — FIXED — dismissed rejection toasted on every app start
**Where:** `applyNotifications` (js/app.js).
**Cause:** a rejection is the one feed item with no server-side "done" — the row
stays `rejected` all season, so the server resends it on every poll. The banner
filtered locally-dismissed ids; the COUNT did not. Every fresh app start begins
at `prev=0`, so `total>prev` fired "🔔 1 ফেরত এসেছে" — for a notice dismissed
weeks earlier, all season.
**FIXED:** dismissed ids are dropped at apply time (count recomputed from the
filtered list), and বুঝেছি re-applies so the totals fall immediately. Verified
live: fresh rejection → one toast (right); dismiss → banner empty; reload with
the server still resending → no toast, no banner. Pinned by a source assertion
proven to bite.

### Registered, awaiting Hrishi's call (no code changed)

- **R1 MED — FIXED & DEPLOYED 2026-07-27 — push upsert could regress a settled handover on restore.** `push`
  overwrites the full `SHEETS.handovers` width by id. Admin backup-import
  deliberately sets `synced:0` (A14), so a restored sender copy still reading
  `status:'pending'` re-pushes and would flip a server-side `confirmed`/
  `rejected` back to pending and blank `rejectReason`/`confirmedBy`. Restore-only
  path, admin-only, but it silently rewrites settled money history.
  **FIXED:** module-level `SETTLED_ON_UPSERT` table + a `preserve()` step on BOTH
  upsert write-sites (including the admin-restore reassign branch — the exact
  path of the finding): a stored confirmed/rejected handover keeps
  status/confirmedBy/confirmedAt/rejectReason; a resolved correction keeps
  status/resolvedBy/resolvedAt — the same clobber existed there and got the same
  guard. One extra read per upsert, and upserts only happen on retry/restore.
  Predicates run from the REAL Code.gs in tests; proven to bite by unguarding
  one write-site.
- **R2 LOW — FIXED 2026-07-26 (client-only) — the one uncapped handover door.**
  The zero-holdings typed-amount fallback is REMOVED; `startHandover` now gates
  on the ceiling. The empty-state names the reason when money is merely in
  transit ("₹500 আগেই পাঠানো, অনুমোদনের অপেক্ষায়…") — a collector who worked all
  morning would read a bare "no money" as a bug. Verified live both ways:
  ceiling 0 + pending → toast, no flow; fresh ₹300 → flow opens at 💵₹300.
- **R3 LOW —** `isRecipient_` display-name fallback: two users sharing an exact
  display name could cross-confirm offline-written rows (username wins whenever
  present). Known identity rule; noted.
- **R4 LOW —** a crafted self-handover (from==to) is not blocked server-side;
  the UI never offers it. Noted.
- **R5 INFO —** the rejections feed resends all season (rare rows; payload
  negligible). R6 INFO — reason silently truncated at 200 chars server-side.

### A20. MED (money) — FIXED 2026-07-26 — the handover ceiling leaked across money types
**Where:** `handoverable` (js/aggregate.js), client-only.
**Cause:** a money type can be over-committed — send ₹500 cash pending, then a
₹100 expense drains cash to ₹450. `Math.max(0, 450−500)` threw the −50 away, so
the OTHER type's ceiling still offered money whose total promise exceeded the
whole account: 💵0 + 📱300 = 300 offered while hero − pending = 250. Once
everything confirmed, someone's book went −50. `cashierView` (the cashier's own
screen cap) was right at 250 — so the two paths disagreed, which is exactly the
kind of split the interdependency sweep exists to catch.
**Found how:** Hrishi asked to *"analyse all the calculations and inter
dependency calculations"* — a 37-invariant cross-check on a rich chain scenario;
34 held, this one didn't (twice: `ceiling === hero − pending` and
`cashierView === handoverable`).
**FIXED:** the deficit in one type is charged to the other type's ceiling
(`defCash`/`defUpi`) — in practice that parcel gets settled in the other form,
so the other form is what is spoken for. Both equalities restored; pinned;
proven to bite by reverting the two lines.

### A21. LOW (integrity) — FIXED 2026-07-26 — reconcile was blind to split drift
**Where:** `reconcile` (js/aggregate.js), client-only.
**Cause:** `personalSummary`/`inHandRows` read `amount`; `myAvailable`/the pots
read `cashAmount+upiAmount`. A row where the two disagree (hand-edited Sheet
cell, buggy import — the app itself never writes one) makes "আমার হাতে" and its
own drill-down silently diverge, and reconcile said nothing — despite loud
anomaly detection being its entire purpose.
**FIXED:** `split_mismatch` (all four money stores; legacy no-split rows exempt
— their amount IS the cash) and `breakdown_mismatch` (handovers; `__snap`
metadata exempt). Both surfaced through the existing ⚠️ banner path.

### A22. MED (money) — FIXED 2026-07-27 — the same instalment entered twice went unnoticed
**Where:** `paymentFlow` (js/app.js) and `reconcile` (js/aggregate.js).
**Cause:** a slow phone, a collector unsure the save landed, one more tap — two
rows with DIFFERENT uuids, both well-formed. Every existing defence is id-based
(server upsert by id, `duplicate_id`, the `synced` queue, the `inFlight` guard),
so all of them wave it through. The donor's dues fall by money nobody paid and
the collector's in-hand rises by money they never took.
**Why reconcile was blind:** its invariant Σ in-hand === collected − expenses
still BALANCES — both rows genuinely were collected. Only a total passing
`pledged` tripped `overpaid`, and part-payments (the normal case) never do.
Verified: ₹2000 twice against a ₹5000 pledge → zero anomalies, balanced true.
**Found how:** Hrishi asked *"how you handling the duplicate entries"*. The
id-based layers are solid; walking them one by one is what exposed the layer
that has no id to work with.
**FIXED:** shared rule `samePaymentsOn(data, partyId, amount, date, exceptId)` —
same donor + same amount + same day, read from `viewData()` (central + own) so
another device's payment counts. Two users: a confirm at entry time naming the
existing receipt, and a `possible_duplicate_payment` anomaly for pairs already
in the book. A WARNING, never a block — a donor really can pay ₹500 twice in a
day. The correction path is exempt (`editing`), since it re-enters the same
party/amount/day by design and voids the original in the same commit.
**And the answer is recorded:** confirming "yes, a separate instalment" stamps
`dupOk` on the row, so the admin's banner stops asking about a pair the
collector already settled — otherwise it cries wolf all season (the A19 trap).
`dupOk` is a real Sheet column so the flag reaches the admin's device, appended
last per the header rule.
**Caught during live verification:** the first cut tested `dupOk` on the row
being flagged, but IndexedDB returns rows by key, not insertion order, so the
answer sat on one twin while the other got flagged — half the time. Now grouped
first, and a group is settled if ANY member carries the answer. Pinned
order-independently; proven to bite.
**Bonus, same class:** `push` now calls `ensureCols_` before writing any store.
It writes rows position-based over the full `cols` width, so a column the header
does not name is written and never read back — this nearly bit twice
(`rejectReason`, then `dupOk`). The write path heals its own header instead of
depending on `setup()` having been re-run.

### A23. MED (usability of the safety net) — FIXED 2026-07-27 — detection nobody could act on
**Where:** `checkReconcile` (js/app.js) and the A22 warning.
**Cause:** `reconcile` has always detected EIGHT kinds of trouble — unbalanced,
overpaid, orphan_payment, negative_inhand, duplicate_id, split_mismatch,
breakdown_mismatch, possible_duplicate_payment — and rendered a **count**: "আরও
2টা অসঙ্গতি … entry দেখো". No list, no donor, no amount, no id, no button, and
the card was not even tappable. Finding a duplicate payment meant already
knowing which donor, because ✏️ আমার entry's "সবার" tab covers only daily and
expenses; payments live on the donor's page.
**Why it mattered more after A22:** a new anomaly type was adding +1 to an
opaque counter. A banner that says "something is wrong somewhere" and cannot say
what teaches people to ignore it — and then the day a real ₹5,000 gap appears,
nobody looks. Detection that cannot be acted on is worse than none: it looks
like a guard.
**Found how:** Hrishi asked *"if duplicate, how will admin identify and confirm
it"* — the honest answer was "they cannot".
**FIXED:** the banner is a button onto a 🩺 অসঙ্গতি পরীক্ষা desk (cashier/admin
only). Every anomaly gets a human sentence and the rows it involves. A duplicate
shows BOTH payments — receipt no · amount · collector · timestamp · short id —
and offers the two honest answers: **✓ আলাদা কিস্তি** (stamps the same `dupOk`
the collector's answer uses, and re-queues the row so every device stops asking)
or **✖️ বাড়তিটা বাতিল** (via the existing audited `renderVoidReason`, not a new
delete path). The other seven get a sentence and a 👁 link where one exists —
deliberately NO button, because those are data surgery and a wrong "fix" moves
real money.
**Same change to the entry-time warning:** it now lists the existing rows rather
than merely asserting one exists. Who took the earlier payment is what decides
the answer on the spot — "যমুনা · 3 minutes ago" is my own double-tap;
"বাপি · this morning" is a real second instalment somebody else collected. One
`dupLine()` feeds both surfaces, so the popup and the desk can never describe
the same row differently.
**Verified live** driving the real UI: banner tappable → desk lists both
anomalies with full identity; ✓ stamps dupOk + synced=0 and the duplicate leaves
the list; fixing the last anomaly makes the banner disappear entirely. No
console errors. Pinned: every anomaly type is asserted to have a title and a
message, so a desk that prints a raw type name fails the suite.

### A24. (improvement) 2026-07-27 — the donor phone: asked twice, never forced
**Hrishi's call:** *"dont make it mandatory, but ask two times before passing the
field."* Considered and rejected: making it mandatory. A blocking step in the
field buys FAKE numbers — 9999999999 gets typed the moment it stands between a
busy collector and the next shop — and a fake number is strictly worse than a
blank one, because it collides with every other fake number and poisons the very
duplicate detection it was meant to strengthen. Legitimate blanks are also
common here: a ₹50 street donor, an elderly donor who does not recall it.
**Built:** a general `confirmSkipKey` on any flow step. Tapping Skip on the phone
asks once more, saying what the number buys (a WhatsApp dues reminder later, and
catching the same donor added twice); Cancel returns to the field, OK moves on.
One extra tap for the honest "no number" case; it rescues the "couldn't be
bothered" case, which is the common one.
**The payoff, same commit:** a phone match is now a STRONGER duplicate signal
than a name match, which was the real substance of Hrishi's idea. Name-only is
weak — "মা তারা স্টোর" can honestly be three shops. A phone hit means the same
household or owner, so it wins over a name hit and gets its own wording ("the
same donor twice, or the same owner's second shop?"). Both warnings now NAME the
existing donor — name, owner, phone, pledged, which collector — instead of
asserting that a match exists.
**Verified live:** Skip on the owner field passes silently (only the phone
carries the second ask); Skip on the phone asks, Cancel keeps you on the field,
OK advances; and a new shop with a completely different NAME but the same phone
was caught, naming "সাহা স্টোর (রতন সাহা) · 📞 9876543210 · কথা ₹3,000 · যমুনা".
No console errors. Pinned, including that the step stays `optional: true` — a
future "tidy-up" that makes it blocking fails the suite.

### A25. (feature) 2026-07-27 — committee-member registry, built on the donor it already was
**Hrishi's spec:** a member list (name, position, email, mobile, app-user) kept
by the admin; collection = pick a member, enter an amount, many times, comment
mandatory.
**The decision that mattered:** `member` was ALREADY a party type — a money pot
in `AVAIL_CATS`, a permission in `ENTRY_KINDS`, a row in `computeTotals.byType`,
a category in handover breakdowns, and part-payments/dues already worked. A new
`members` store would have created a SECOND money path needing its own receipts,
dues, pots and reconcile — the exact divergence docs/money-model.md exists to
prevent. So: extend, don't duplicate. Only fields are new.
**Built:** `position` (an admin-editable `Lists` kind, seeded সভাপতি/সম্পাদক/
কোষাধ্যক্ষ/সদস্য, so the committee's real titles are Hrishi's to set), `email`
(loose validation — the app sends no mail, so a strict RFC pattern would reject
real addresses and buy nothing), and `appUser`. All appended LAST on `parties`;
`ensureCols_` materialises them, so no `setup()` run is needed.
**The trap named up front:** `appUser` is INFORMATIONAL ONLY. Money belongs to
whoever collected it, never to whoever the payment is "about"; the admin card
says so in words, because "credit it to the member" is the reflex that would
break every in-hand figure.
**Mandatory comment:** the member note step carries no `optional`, so the flow
renders no Skip button at all rather than validating after the fact.
**Caught while building:** the correction path builds a payment flow from
`{id, name}` only — no `type` — so an edited member payment would have silently
dropped back to an optional comment. It now looks the donor up first.
**Verified live:** পদ chips render in Bengali; a bad email is rejected and a good
one saved; the member row stores position + email + pledged; the payment step has
NO Skip and refuses to advance while blank; linking @yamini05 to রতন সাহা saved
and **left the money at ₹600, untouched**.

### A26. (feature) 2026-07-27 — a red dot only where the work can be finished
**Hrishi:** *"if anything pending in application by the user there should be red
dot in the button."*
**Rule taken from today's own failures** (A19's ghost toast, A23's blind
counter): a marker that cannot be cleared teaches people to ignore markers. So
every dot maps to a screen that contains the action which clears it —
`cashier` (parcels to answer), `review` (flags to decide), `anomalies`
(reconcile findings), `handover` (my refused parcels), `entries` (my own flagged
rows, which only I may correct). No new counting: all of it is already computed.
**Two real bugs found by verifying rather than assuming:**
1. The dot lit `anomalies`, which **had no home tile at all** — the desk was
   reachable only by tapping the reconcile banner on 📊 রিপোর্ট. Added it to
   `homeTiles` for cashier/admin, which also means a cashier who never opens
   reports now discovers the desk exists.
2. The ✏️ and 💰 tiles are hand-rolled (wide, custom label) and bypassed
   `drawTile`, so they silently missed the marker. One `dotMark()` helper now
   serves every tile however it is built.
**And the dot must go OUT:** recomputed on every home paint, repainting only when
the map actually changed — the change-check is what stops render→refresh→render
looping. Verified live end to end: dot appears, the duplicate is settled on the
desk, back to home, dot gone.

### A28. HIGH (delivery) — FIXED 2026-07-27 — a deploy could never reach a phone
**Where:** `sw.js` install handler.
**Cause:** `cache.addAll(ASSETS)` fetches **through the browser's HTTP cache**,
and GitHub Pages sends `cache-control: max-age=600` on every file (measured). So
a phone that had opened the app within the last ten minutes would fill the
BRAND-NEW cache with the OLD JavaScript. The version bump is then spent on stale
content and nothing retries until the *next* deploy — the device reports the new
version while running yesterday's code, and every subsequent deploy can repeat
it.
**Found how:** Hrishi: *"not able to see any member related changes in app… i
logged in admin only but not able to see."* Everything was live on the server and
verified there; the gap was between the server and the handset, which is the one
hop nothing in this project had ever checked.
**FIXED:** install now fetches each asset with `new Request(u, {cache:'reload'})`
and `cache.put`s the result, bypassing the HTTP cache entirely. A failed asset
now throws, so a half-built cache can never activate (`addAll` was all-or-nothing
by accident; this is all-or-nothing on purpose).
**And the thing that made it undiagnosable:** the app never showed its own
version — Settings had a hard-coded `v2` that had not changed in the project's
life. ⚙️ Settings now prints the **actual cache the JS is served from**
(`chanda-v4.7.2 • hostname`), plus a **🔄 আপডেট খুঁজি** button that calls
`registration.update()` so a stuck device fixes itself without anyone knowing
what an app-shell cache is.
**Verified live:** seeded a stale `js/app.js` into the previous cache name to
imitate the broken phone; the new worker fetched the real 258 KB file (member
code present), Settings reported `chanda-v4.7.2`, and the button answered
"✅ এটাই সর্বশেষ version".
**Lesson:** every check in this project stopped at "the file is correct on the
server". Nothing verified the last hop. A user saying "I can't see it" was the
only detector we had.

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
