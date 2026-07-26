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

## P0.10 — UX speed pass: instant save + Undo (2026-07-25, DONE, needs a client-only redeploy)

Hrishi: the collection process shouldn't feel slow/suffocating. See
build-log v3.72.0 for the full detail; live-verified in a local harness
(no real login token available this session — Hrishi should still spot-check
on his phone after the redeploy).

- [x] ~~Removed the separate confirm/summary screen — the last answer in any
      entry flow now saves instantly, with a 5s "ফিরিয়ে নাও / Undo" toast as
      the safety net instead~~
- [x] ~~Undo respects the void-permission rule: unsynced rows delete cleanly,
      already-synced rows are left alone with a pointer to "আমার এন্ট্রি"~~
- [x] ~~Zero-amount / declined-duplicate failures rewind to the field that
      needs fixing instead of losing the whole entry~~
- [x] ~~Phone validation: dropped the 6–9 leading-digit rule, any 10-digit
      number now accepted~~ (2026-07-25, v3.72.1)
- [x] ~~Receipt is the entry's finish line: saving a payment (existing party
      or a new shop/person/member's first payment) or a bus daily jumps
      straight to the receipt screen — no more hunting through party detail
      for the 🧾 button. Road/toto unchanged (no donor identity to receipt)~~
      (2026-07-25, v3.73.0)
- [x] ~~Bulk shop mode retired — every 🏪/🙍/🤝 entry now offers a fast
      "➕ আরেকটা" continue after saving (side sticky for shops), so the
      separate bulk tile was redundant. The continue button is
      context-aware: a payment reached via search/list goes back to that
      search instead of offering "new entry" (no natural "next" to create
      there); expense/collection-expense/handover also gained the same
      continue-or-done pattern~~ (2026-07-25, v3.74.0)
- [x] ~~Bus collection tile moved from "আজকের রোড/টোটো" into the "নতুন এন্ট্রি"
      section — it's the only daily-collection type with a donor identity/
      receipt, same family as শপ/person/member~~ (2026-07-25, v3.74.1)
- [x] ~~Handover shows the collector's/cashier's real cash+UPI in hand
      (`Aggregate.myAvailable`, unit-tested), as tap-to-select category
      chips (💵 নগদ ₹X / 📱 UPI ₹Y) with a live total — no mode question,
      no typing, no misremembering what you actually have. "✏️ অন্য
      পরিমাণ" escapes to manual typing for a partial/unusual handover.
      This is narrower than the generic amount-presets idea declined below
      — specific to handover, using the *actual computed* available
      amount, not arbitrary preset chips. (First cut in v3.75.0 kept the
      old mode-question step with a small quick-chip bolted on; Hrishi said
      that was still confusing, redesigned into one category-select screen
      in v3.75.1)~~ (2026-07-25)
- [x] ~~"Cashier can't send amount to himself" — real bug, found: the
      `cashiers` server list correctly includes every cashier/admin (so
      OTHERS can pick them), but nothing filtered the CALLER out of their
      own list, so a cashier/admin saw their own name as a selectable
      handover target. Filtered client-side in `startHandover()`; falls
      back to free-text if that leaves zero other cashiers. No server
      change needed (not a security gate — a self-handover would net to
      zero anyway)~~ (2026-07-25, v3.75.2)
- [x] ~~Handover v3: category = money's SOURCE (চাঁদা/রোড/টোটো/বাস/
      received), cash-UPI as subtypes. Pick categories (each chip shows
      the real amount; empty categories hidden = access-shaped) → pick
      নগদ/UPI/দুটোই (chips carry the selected categories' amounts) → save.
      Handover rows now record a `breakdown` JSON so BOTH sides' per-
      category books stay exact — the receiving cashier sees the money
      under the original categories too (cashier→cashier shows চাঁদা/বাস…
      chips, not one lump)~~ (2026-07-25, v3.76.0)
- [x] ~~v3.76.0 Code.gs redeploy (handovers `breakdown` column) + setup()~~
  (done 2026-07-25/26 — `breakdown` confirmed live in the two-user pass)
- Declined by Hrishi (asked first, not guessed): generic amount quick-tap
  presets for entry flows (payment/daily/new-party), and softening the
  persistent training banner — both left as-is.
- [x] ~~Static-files redeploy~~ (Pages has shipped every version since;
  sw currently v3.99.0)

## v3.82.0 — one identity rule (2026-07-26, DONE)

- [x] Central in-hand report: a person's category breakdown could sum to
      more than the `inHand` printed on the same line, whenever the same
      person existed under both a `collectorId`-keyed and a name-keyed
      identity. Fixed in `js/aggregate.js` + `Code.gs` (A10 in
      `docs/final-audit.md`), regression test `dual-identity`.
- [x] First live exercise of the v3.81.1 bus grouping through the whole
      chain (collect → per-category handover → cashier confirm →
      `srcCat` expense), on two real sessions. All 16 checks green.
- [x] `setup()` confirmed run: Expenses now carries `cashAmount`,
      `upiAmount`, `srcCat`; Handovers carries `breakdown`.
- [x] ~~Code.gs redeploy for `personalSummary_` (A10 mirror)~~ (done
      2026-07-26, AKfycbwpwZ0D… — verified in the three-role pass:
      server `myReport` === client `personalSummary` for all three roles)

## v3.83.0 — one role vocabulary (2026-07-26, DONE)

- [x] Full three-role live pass (admin · cashier · collector), 72 checks.
      71 green; the failure was a cashier being unable to resolve a plain
      collector's correction flag, plus the same bug hiding Undo from the
      cashier in the UI. Fixed as A11 in `docs/final-audit.md`.
- [x] ~~Code.gs redeploy for the A11 server half~~ (done 2026-07-26,
      AKfycbwpwZ0D… — re-run pass: cashier resolveCorrection ok:true)

### Open questions for Hrishi (raised 2026-07-26, not decided)
- `yamini05`'s reports list is EMPTY — she can open no report at all. Set
  each collector's reports before go-live, or confirm this is intended.
- ~~A general puja expense by someone holding no money drives a category
  negative~~ — Hrishi (2026-07-26): "expense could be in minus, later by
  exchanging amount we will balance it". No over-spend guard. The related
  INSTABILITY (an unsourced bill migrating between categories) was a separate
  defect and is fixed in v3.86.0.

## ✅ v3.93.0–v4.0.0 — DEPLOYED & VERIFIED 2026-07-26 (AKfycbxWYLvg…)

`setup()` confirmed run (the `Messages` sheet is in the pull). Full three-role
pass: **44 of 45 green**. Everything that had never touched a real Sheet is now
proven there:

- **S1 idle fast path** — an idle poll returns `idle:true` with no rows, and a
  row written after that cursor is STILL delivered on the next pull. No loss.
- **S2/S3 batching** — 30 rows in one push, 15 serials, all unique and
  consecutive (1–15), every payment on the Sheet carrying its number.
- Money chain across three roles with categories intact; cashier snapshot lands
  as a parcel not a phantom category; chat send/receive and mention scoping;
  every role gate; A9 forgery blocked; the new void gate; books balanced with
  `byCat === inHand` on every line.
- `clearTraining` proven live — Hrishi ran it himself at 03:09 with a backup.

## ⚠️ ONE SMALL REDEPLOY LEFT — A16 (chat kill switch)

The single red light from that pass. `setConfig` ignored the `{key,value}` shape
the chat switch sent, and `chat_off` was not whitelisted, so the button said
"chat stopped" and nothing stopped. Fixed on both sides; the server half needs a
deploy.

1. Apps Script: paste `apps-script/Code.gs` → **New deployment**.
2. **No `setup()` needed** — no new sheets or columns.
3. Hand over the `/exec` URL for rebaking, then the switch gets tested live
   (flip on → a message must be refused → flip off → it must go through).

## Money-display work (Hrishi, 2026-07-26) — phase ক DONE, phase খ open

Decision recorded, because every figure depends on it: **an unconfirmed handover
still counts as the SENDER's money.** The receiver is credited only on confirm,
so deducting the sender too would leave that money in nobody's book and shrink
the central total. Two different questions follow from it, and they legitimately
give different numbers:

| question | figure | source |
|---|---|---|
| how much do I answer for? | includes pending | `myAvailable` → the summary hero |
| how much can I hand over now? | excludes pending | must be `hero − pendingOut` |

- [x] ~~**Phase ক — আমার হিসাব as three levels** + colour legend + the three
      handover slots (⏳ / ✅ / ❌ dormant)~~ (2026-07-26, v4.4.0, client-only,
      verified live on port 8767; see build-log)
- [ ] **Phase খ — the reject path.** `confirmHandover` only ever writes
      `'confirmed'`; there is no way for a cashier to say "পাইনি", so the ❌ slot
      can never fill. Needs: a `rejectHandover` action, a `rejectReason` column
      appended at the END of `SHEETS.handovers`, the sender notified (their hero
      does NOT move on a rejection — only the cap grows back, so silence would be
      confusing), and **four readers fixed** that still treat "not confirmed" as
      "pending" and would therefore deduct a rejected parcel for ever:
      `personalSummary` ([aggregate.js:207](../js/aggregate.js)),
      `cashierView` (:452), `handoverReport` (:495), `bump()` (:198) — plus the
      `Code.gs` mirrors. **Needs a Sheet migration and a redeploy.**
- [x] ~~**Handover caps**~~ (2026-07-26, v4.4.1, client-only, verified live on
      port 8791). `Aggregate.handoverable()` now gives the per-pot free figures,
      the per-money-type ceiling, and the two reasons separately so the screen can
      colour them (gold = pending on its way out, red = a pot that owes). Both
      clamps were needed: an overspent pot vanishes from the chips yet still
      lowers the cash held, so Σ chips overshot by exactly the debt.

## Before go-live, still open

- [ ] **Reports permission** — a DECISION, not a fix. Most collectors have an
      empty `reports` list and can open no central report at all, only their own
      summary. Intended, or grant some before the puja?
- [ ] **Clear the test data** — the v4 pass left ~35 rows tagged `V430912` in the
      training sheet (batch shops, a chain shop, a bus, handovers, chat). One
      🧹 প্র্যাকটিসের ডেটা মুছে ফেলো clears them; Go Live would too.
- [ ] **Rotate the three session tokens** pasted in chat today — re-login on
      each phone.

## Next decision — Go Live

Training mode is still ON (default since it shipped). Every entry made so
far is a training/test entry and will be **wiped** the moment `🚀 Go Live`
runs (admin panel → data+audit fold). Hrishi to decide **when** to trigger
it — needs: collectors briefed/installed, master lists (areas/expense
subjects) finalised, receipt design set, and the leftover test-data cleanup
below done first (goLive wipes it anyway, but cleaner to not rely on that).

**→ `docs/residual-risks.md`** — what is built-but-never-run, out of scope
by design, and the operational steps only Hrishi can do (incl. ⚠️ confirming
the `dailyBackup` trigger actually exists, and that there is **no restore
path** — Sheets version history is the realistic recovery route).

**→ Full final-stage audit: `docs/final-audit.md` (2026-07-25).** All six
findings (A1 undo-vs-sync race HIGH, A2 rejectedIds MED, A3 dup-check MED,
A4–A6 LOW) **FIXED in v3.77.0**, each verified by reproducing its failure
live. Remaining before go-live: the checklist in final-audit.md §G
(Code.gs redeploy for `breakdown`, setup(), token rotation, master data,
all-synced-then-GoLive, real-phone smoke test).

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
- [x] ~~Attach a bill / shop photo to an entry~~ — D6, dropped (2026-07-25,
      Hrishi: not needed)
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
