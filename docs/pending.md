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
- [x] ~~Real-phone smoke test: install, mic permission, bn voice entry,
      receipt → WhatsApp~~ (2026-07-27, Hrishi on a real handset — all four
      green). This was the last item nobody but Hrishi could verify: mic
      permission, bn-IN recognition and the WhatsApp share sheet are all
      OS-level and cannot be exercised from a desktop browser.
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

## Money-display work (Hrishi, 2026-07-26) — ALL FOUR DONE, awaiting setup() + redeploy

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
- [x] ~~**Only the recipient may confirm a handover** (A17, HIGH)~~
      (2026-07-26, v4.4.2). One shared `isRecipient_` now backs both
      `pendingHandovers` and `confirmHandover`; re-confirm throws
      `already-confirmed`; an admin confirming for someone else is logged as
      `handover:confirm-on-behalf`. **Rides the pending redeploy.**
- [x] ~~**Phase খ — the reject path**~~ (2026-07-26, v4.5.0). `rejectHandover`
      writes a third status (not a void — both sides need the record of the claim
      AND the refusal); `rejectReason` appended LAST in `SHEETS.handovers`; a
      reason is mandatory on both sides; the six inline copies of "not confirmed
      means pending" replaced by `hoConfirmed`/`hoRejected`/`hoPending`; the
      sender gets a notice with the reason and a local-only "বুঝেছি" dismiss
      (their hero does not move on a rejection — only the ceiling grows back, so
      silence would be confusing). **NEEDS `setup()` + a redeploy.**
- [x] ~~**Handover caps**~~ (2026-07-26, v4.4.1, client-only, verified live on
      port 8791). `Aggregate.handoverable()` now gives the per-pot free figures,
      the per-money-type ceiling, and the two reasons separately so the screen can
      colour them (gold = pending on its way out, red = a pot that owes). Both
      clamps were needed: an overspent pot vanishes from the chips yet still
      lowers the cash held, so Σ chips overshot by exactly the debt.

- [x] ~~`ensureCol_()` not in the running code~~ — resolved by the second
      2026-07-26 deployment, which carries it, so `rejectReason` heals its own
      header whether or not `setup()` was ever run.
- [x] ~~One more redeploy to activate the `doGet` version marker~~
      (2026-07-27). **Nothing is now waiting on a redeploy.** Any deployment can
      be verified in one tokenless call:
      `curl -sL "$EXEC"` → `{"ok":true,"service":"chanda-khata","version":"chanda-v4.5.6"}`
      — compare against `CODE_VERSION` in apps-script/Code.gs.

- [x] ~~**R1** — settled handovers AND resolved corrections now survive a
      restore re-push (`SETTLED_ON_UPSERT` + `preserve()` on both write-sites)~~
      (2026-07-26; **DEPLOYED 2026-07-27**, verified by version marker).
- [x] ~~**R2** — uncapped typed-amount fallback removed; zero ceiling now shows
      an empty-state that names the in-transit money~~ (2026-07-26, client-only).

- [ ] **Redeploy for A22** — Code.gs gained the `dupOk` payments column and
      `ensureCols_` (push heals its own headers). Until then the duplicate
      warning works fully on-device, but a collector's "yes, separate instalment"
      answer does not reach the ADMIN's reconcile banner, so the admin keeps
      seeing that pair flagged. Everything else about A22 is client-side and
      already live.

- [ ] **কমিটির পদ** — four seeded (সভাপতি / সম্পাদক / কোষাধ্যক্ষ / সদস্য, bn+en).
      Edit or extend from Admin → 🧾 → 🎖️ কমিটির পদ at any time, **no deploy**;
      renaming never disturbs members already recorded, since the row stores the
      list id, not the label.

- [ ] **Clear the `scriptUrl` field in Settings on Hrishi's phone.** He pasted
      the new `/exec` there on 2026-07-27; `config.js` now carries the same URL,
      so the field is redundant — and because it OVERRIDES config.js, leaving it
      means his device is the one left on a stale backend after the next
      redeploy. That is the hardest version of this fault to spot.

## Before go-live, still open

- [x] ~~**DECISION — what language is a receipt?**~~ **Settled 2026-08-12
      (Hrishi, option (a)) and shipped as A98:** the receipt is the donor's
      document, so it is Bengali whatever the collector set the app to. `tBn()`
      does that; the collector's own screens still follow the app language. See
      build-log "A98".
- [x] ~~**DECISION — money in the user LIST?**~~ **Yes (Hrishi, 2026-08-12),
      shipped as A100.** In-hand on every row, gated on the year so the two
      other `listUsers` callers stay cheap. See build-log "v4.29.0 — A100".
- [ ] **⚠️ ONE REDEPLOY, v4.33.0 — supersedes every pending one below.** The
      A109 (v4.30.0) and A114 (v4.32.0) redeploys were never done; **A115
      (v4.33.0) contains both**, so deploy this once and all three land. New in
      `Code.gs`: `saveMember` / `removeMember` (the committee register is a
      server action now), `canAssignPosition_`, the `level` column on `Lists`,
      and `committee` on every `pull` response.
      Order, unchanged and non-negotiable on this account: paste
      `apps-script/Code.gs` → **New deployment** (never "New version" — it has
      never repointed here) → ask the new `/exec` what version it runs BEFORE
      trusting it → rebake `js/config.js` → push.
      **After deploying, before anything else:** open 🎖️ কমিটির পদ ও অনুমতি and
      type a **level** into each post. Until you do, every post says
      "⚠️ স্তর বসানো নেই" and only an admin can appoint anybody — safe, and
      deliberately visible, but it is not the finished state.
- [ ] **A115 — make a SECOND admin before go-live.** Nobody may add or edit
      their own committee record, admin included, and `register` is
      self-service so an admin cannot create an account for anyone. With one
      admin, Hrishi's own row can never be entered or corrected. This is not a
      code item; it is five minutes in the admin panel.
- [ ] **A115 — clear the account-less member rows.** An app account is required
      on a member row now. Rows written before this cannot be saved again until
      one is picked; 🩺 অসঙ্গতি lists each by name. A committee member with no
      smartphone cannot be recorded at all — Hrishi's decision, made with the
      consequence in front of him.
- [x] ~~**⚠️ REDEPLOY — this one needs Apps Script, not just Pages.**~~ Done 2026-08-13 (v4.29.0). A96/A98/A99
      were client-only; **A100 and A101 change `Code.gs`** (`listUsers` now returns
      money when asked). All three versions moved to `chanda-v4.29.0` together,
      so until Code.gs is redeployed the app will show the red 🛠️ bar saying
      the server is behind. Order: paste `apps-script/Code.gs` → **New
      deployment** (never "New version" — it has never repointed on this
      account) → rebake `js/config.js` with the new `/exec` URL → push. (Pages only — Code.gs is unchanged, no
      Apps Script deploy needed). `sw.js` now precaches `js/config.js`, so a
      phone that installs the app and reloads offline before its second online
      load still knows the backend URL. Until this ships, that phone shows
      "এই ফোন এখনো কেন্দ্রীয় খাতার সঙ্গে জোড়া হয়নি" — false, self-healing on the
      next online load, but a phone call on puja evening. **Worth doing before
      handing out the link**, since every collector's first day IS a first
      install. See build-log "A96".
- [ ] **Reports permission** — a DECISION, not a fix. Most collectors have an
      empty `reports` list and can open no central report at all, only their own
      summary. Intended, or grant some before the puja?
- [ ] **Clear the test data** — the v4 pass left ~35 rows tagged `V430912` in the
      training sheet (batch shops, a chain shop, a bus, handovers, chat). One
      🧹 প্র্যাকটিসের ডেটা মুছে ফেলো clears them; Go Live would too.
- [ ] **Rotate the three session tokens** pasted in chat today. Fastest way:
      Admin → 👥 → each of those users → 🔓 **সেশন ছাড়ো**, then they log in
      again. (Re-logging in on the phone works too — a login overwrites the
      token either way.) Sessions do not expire on their own; this button and
      🚫 Block are the whole story, and Hrishi has confirmed that is enough
      (see PROJECT_CONTEXT "Known limitations").

### Added by the A144–A156 week (2026-09-05) — all pre-go-live, all survive 🚀

The confidential kinds and the অনুষ্ঠান tab all default to OFF or ungranted, so
none of them work until the admin acts. Every item here is set BEFORE 🚀 and
survives it.

- [ ] **Grant the new keys, by name.** `sponsor` / `gupt` to whoever takes them;
      **`sponsorview` + `guptview` to the কোষাধ্যক্ষ — without both, that money
      cannot be handed over at all**; `progteam` (the master — no 🎭 tab without
      it) plus `progdonor` / `progmoney` / `ticket` to the programme team.
      The two *view* keys cannot ride a committee post, deliberately: seeing
      every sponsor is a confidence given to a person, and hanging it on a post
      would move it silently the day somebody is made কোষাধ্যক্ষ.
- [ ] **⚙️ → 🎭 অনুষ্ঠানের ভাঁড়ার → চালু করো.** Off by default; with it off the
      tab does not exist for anybody, `progteam` or not.
- [ ] **Add the programme's expense subjects** (শিল্পী · সাউন্ড · অতিথি · মঞ্চ),
      choosing 🎭 অনুষ্ঠান as you add each. Existing subjects have no fund, which
      means BOTH — nothing to migrate.
- [ ] **The 16 `demo-` rows** in the live training book (A138): **🚀 removes them
      with everything else**, so no separate cleanup is needed if go-live is
      next. Only if the trial continues: void them from ✏️ আমার লেখা entry, in
      this order — handover (`demo-h1`) first, then payments/daily/expenses,
      **parties (`demo-p1…p4`) LAST**. A party voided before its payments leaves
      them orphaned and the 🩺 desk says so until the rest are cleared.
- [ ] **Record each দায় BEFORE the booking is made.** Written afterwards, the
      gap it exists to show is already invisible.

## Next decision — Go Live

Training mode is still ON (default since it shipped). Every entry made so
far is a training/test entry and will be **wiped** the moment `🚀 Go Live`
runs (admin panel → data+audit fold). Hrishi to decide **when** to trigger
it — needs: collectors briefed/installed, master lists (areas/expense
subjects) finalised, receipt design set, and the leftover test-data cleanup
below done first (goLive wipes it anyway, but cleaner to not rely on that).

**→ `docs/residual-risks.md`** — what is built-but-never-run, out of scope
by design, and the operational steps only Hrishi can do (incl. ⚠️ confirming
the `dailyBackup` trigger actually exists).

> **Correction, 2026-08-13.** The line here used to say there is *"no restore
> path — Sheets version history is the realistic recovery route"*. That has been
> false since A52/A73: `restoreBackup` exists in `Code.gs`, `listBackups` feeds
> it, and 🗂️ ফিরিয়ে আনো is wired in the admin panel. Leaving a stale claim next
> to the most destructive button in the app is exactly the sentence somebody
> reads on the day it matters.

### 🚀 Go Live — what it actually does (run against the real Code.gs, 2026-08-13)

Not read: executed through `tests/gas-shim.js`, diffing the whole book before
and after.

**Wiped — eight transactional sheets, header kept:** Parties · Payments ·
DailyCollections · Expenses · Handovers · Voids · Messages · Corrections.
Chat history goes with them.

**Survives:** Users (accounts, roles, permissions, areas, posts) · Lists (areas,
locations, committee posts) · ExpenseSubjects · Config (puja name, receipt
design, colour, logo) · Audit — which is append-only and *gains* the
`went-live` line.

**Reset:** every `receiptSeq_*` counter, so numbering restarts — measured
`2026000002` before → `2026000001` after. `receipt_digits` is **locked in** at
this moment. `live_mode=on` and a fresh `data_epoch` are stamped.

**Guards, each one tried:**

| চেষ্টা | উত্তর |
|---|---|
| confirm ছাড়া | `confirm-required` |
| `confirm: 'live'` (ছোট হাতে) | `confirm-required` |
| collector-এর token দিয়ে | `not-admin` |
| দ্বিতীয়বার goLive | `already-live` |
| পুরনো epoch নিয়ে ফোনের push | `stale-epoch` |

A Drive snapshot is written **before** the first row is deleted, and a failure
to write it aborts the whole thing (`backup-failed`) rather than proceeding.

**On every phone:** the new `data_epoch` arrives with the next pull, the device
wipes its local book and re-pulls. A92 makes it count anything still queued and
say so by number first — but a collector who is offline at that moment keeps
their queue until they come back, and it is refused with `stale-epoch` if it was
minted before the cutover. **So: everyone syncs to zero BEFORE the button.**

**⚠️ The one that will surprise you.** A 🚪 বিদায়ী member stays বিদায়ী through
go-live — verified, the flag survives — but their **exit picture is deleted**
(280 chars → 0). They walk into the live season with no post, no permissions and
a working login, and the record explaining why is gone. Check the বিদায়ী list
before pressing; the admin panel already warns about this in the training strip.

**The way back — honest status.** `restoreBackup` exists, is admin-only, needs
`confirm: 'RESTORE'`, refuses any file that is not one of our own snapshots, and
resolves every key before the first `clear()` so a throw cannot leave the book
half-and-half. It could **not** be exercised here: the shim's DriveApp cannot
list files. So the restore drill stays a real pre-flight item, and it is worth
doing BEFORE go-live rather than discovering it under pressure after.

**→ Full final-stage audit: `docs/final-audit.md` (2026-07-25).** All six
findings (A1 undo-vs-sync race HIGH, A2 rejectedIds MED, A3 dup-check MED,
A4–A6 LOW) **FIXED in v3.77.0**, each verified by reproducing its failure
live. Remaining before go-live: the checklist in final-audit.md §G — and as of
2026-07-27 that is down to **Hrishi's own operational steps** (one Code.gs
redeploy, token rotation, master data, clear test data, all-synced-then-GoLive).
The real-phone smoke test is DONE.

**→ External audit `AUDIT-2026-07-29.md` (Chanda_collection_analyser).** Read
2026-07-29, worked in the audit's own order.

- **Tier 0 — all six FIXED in v4.12.0.** Pull cursor (A50), push identity
  stamping (A51), goLive guards + backup/restore of `Users` (A52), stale-epoch
  rejection (A53), and the one that was live-broken on every device: the
  `viewData` merge letting a stale local row shadow the server's (A49).
- **Tier 1 — all FIXED in v4.12.1.** Duplicate-decline trap + honest catch-all
  (A54), rejected-row badge (A54), SW shell/extras split + navigate timeout +
  cache verification + 19% lossless icon recompression (A55), `Lists` memo +
  debounce + refresh throttle (A56), `scope-check` lookbehind (A57), and
  backups no longer carrying live login tokens (A58).
- **Tier 2 — server half FIXED in v4.12.2** (2.4 rollover `touchData_`,
  2.5 confirm/reject lock + single write, 2.6 receipt serial survives a lost
  response, 2.7 formula injection, 2.9 owner index instead of a full sheet read
  per void). Split this way on purpose: every Code.gs change costs a redeploy,
  so they ride ONE. `CODE_SCHEMA` stays 2, so no phone is locked out waiting.
- **2.1 FIXED in v4.12.3 (A60)** — donor rows can be corrected in place
  (creator-or-admin, enforced both sides) and empty ones removed; the committee
  register's 🗑️, which wrote a field nobody read, now actually removes. Twin
  MERGING stays open on purpose: it moves money between donor rows.
- **2.8 + 2.15 FIXED in v4.13.1 (A62)** — one shared `EPS = 0.005` instead of
  four opinions about equality (a float hair no longer raises `overpaid` or
  chases a paid-up donor for a reminder), and one `waNumber()` instead of three
  hand-rolled phone manglings that were each broken differently.
- **2.11 FIXED in v4.14.0 (A63)** — a half-finished entry survives the tab
  dying, and Back asks before abandoning one. Handovers and edits deliberately
  excluded (live money ceiling / void-after-save).
- **2.12 + 2.13 FIXED in v4.14.1 (A64)** — home shows the right-now in-hand
  figure (the one the cashier asks for), tappable to আমার হিসাব; toasts wrap and
  stay up long enough to read; `--sub` raised from 3.88:1 to 4.53:1.
- **2.17 + 2.18 FIXED in v4.15.0 (A65)** — `tests/gas-shim.js` + `tests/backend.js`
  execute the real request handlers (proven by three sabotages), and
  `.github/workflows/ci.yml` runs the suite, a syntax check, the version/schema
  agreement, sw-precache existence and i18n completeness on every push (each
  gate proven to block).
- **2.14 + 2.16 + 2.20 FIXED in v4.16.0 (A66)** — `myReports()` deleted (its
  `=== 1` lost a cashier their in-hand report when the flag arrived as a
  string), five dead declarations removed, the duplicated category map merged,
  and iOS given a real 48 KB opaque touch icon, standalone mode, and the only
  install route it has. `adminAction` was NOT dead — the audit list predates
  A48 restoring it — and is now pinned so the next cleanup cannot cut it again.
- **2.10 FIXED in v4.16.1 (A67)** — an offline receipt now says *"নং — নম্বর নেট
  এলে বসবে"* inside the image the donor keeps, and in the SMS text too. Serial
  pre-allocation deliberately not done: server change, redeploy, and gaps in a
  sequence people read as a sequence.
- **Tier 2 — OPEN: 2.19 only** (`js/app.js` at 5,798 lines). Staying open on
  the audit's own advice — §5: *"Do not touch the flow engine before the puja."*
  Extract order when the season is over: `fmt.js` → `reports-html.js` →
  `receipt.js` → `admin.js`. **Not doing before the puja:** merging twin donors (moves money between
  rows — audit §5 says do not touch the money engine now).
**→ Second audit: `AUDIT-2-UX-PERF-2026-07-29.md`** (UX + performance, verified
against HEAD `16f390e`). Spot-checked every headline claim; all accurate.

- **U1 FIXED in v4.17.0 (A68)** — the 🩺 desk's ✓ buttons read this device's
  IndexedDB, so on other collectors' rows they did nothing at all. New
  `setAnomalyFlag` server action. The audit's own suggested fix was tested first
  and **would have moved the money into the cashier's name**.
- **P3 FIXED in v4.17.1 (A69)** — 25 s AbortController deadline (sized against
  a measured 2.81 s wired round trip), an in-flight guard on `pullCentral`
  (which also closes the epoch-reset window where a pre-clear response wrote
  training rows back), and a poll-counted backoff reset by `online`/focus/manual
  refresh. Only the 60 s background tick is skippable.
- **P1 + U4 + U5 + U6 + U7 FIXED in v4.18.0 (A70)** — the idle poll stops
  rewriting 2.9 MiB (and a full disk now says so), a refused microphone is told
  apart from an unsupported phone, the Undo target went 27→45 px with the bubble
  unchanged, and every collector-facing string stopped naming things they cannot
  do. A test sweeps for machine vocabulary from here on.
- **OPEN, remaining** (none urgent):  **P2** the 45 KB logo on every
  poll (server, needs a redeploy + a careful client merge) · **P6** reconcile
  gating · **P4** list cap · **P5** boot skeleton · **U2** collector on the
  receipt · **U3** registration message · **U8** drop the note step.
- **Declined for now**: **U9** (merge mode+amount) touches the flow engine —
  same reason as 2.19. **U11** (auto-focus the খাতা search) would put a keyboard
  over the list on Android. **তুমি vs আপনি** is Hrishi's call, not a finding.

**→ §7 documentation drift — OPEN**. Note the count moved again: A61 added
  `possible_duplicate_daily`, so `money-model.md:163` now says eight where the
  code raises **ten**.

✅ **v4.12.1 redeploy DONE** (2026-07-29) — verified live: `codeVersion
chanda-v4.12.1`, `schema 2`, config rebaked.

✅ **Redeploys done and verified**: v4.12.1 → v4.13.1 → v4.17.0 → v4.18.2, each
confirmed live by `codeVersion` + `schema` from the deployment itself.

🔴 **One redeploy outstanding — v4.19.0, and it is urgent.** A73/V1 means
`restoreBackup` currently refuses every backup this code produces, so **`goLive`
has no undo until it lands**. A73/V2 (the 0.6 blanking on the admin path, plus
the receipt-serial gap) rides the same deploy. `CODE_SCHEMA` stays **4** —
nothing locks, so no phone is affected either way.

✅ `safeCell_` verified on the real Sheet 2026-07-29: a donor named `=টেস্ট`
reads back as exactly `=টেস্ট`.

## THE TRIAL WEEK (Hrishi, 2026-08-16: "not live tomorrow — full trial will start, for one week")

Timeline corrected: ~2026-08-17 → ~2026-08-24 is a full trial in TRAINING mode
on all twelve phones; 🚀 Go Live comes AFTER it and wipes the trial entries.

What this buys, and the plan for the week:

- **Before the trial starts (Hrishi, in the app):** type the four post levels,
  make the second admin, link accounts on the ⚠️ member rows — so the trial
  exercises the REAL permission setup, not a placeholder one.
- **Days 1–2: observe, touch nothing.** Collect "কেমন যেন লাগছে" reports —
  every one so far has been a real bug.
- **Mid-week: one fix batch, one redeploy.** Trial data is disposable, so this
  is the cheapest week the project will ever have for changes. Candidates, in
  order: the freeze-gates decision (#2 below), fmtMoney memoization, and — now
  affordable because a redeploy no longer risks live money — possibly the
  SW-cache-key decoupling and the UI pass (px→rem, dark mode), which would then
  get a real-phones week of testing for free. (The js/help.js header-🔄 line
  rode the A130/v4.34.18 bump as planned — done.)
- **Last 2 days: stable.** No deploys; the committee practices on what will go
  live.
- **After the trial:** 🧹/🚀 (wipes entries, keeps Users/permissions/posts) →
  enter committee members → real go-live.

## The three new entry kinds (Hrishi, 2026-09-04) — two DONE, one OPEN

Hrishi asked for three: sponsors, গুপ্ত দান, and "if any program like cultural
program spents, guests, artists and all". Discussed first, then split by cost.

- [x] ~~**স্পনসর** — A144, v4.35.0~~ (2026-09-04). Built as MACHINERY
      (`RESTRICTED_TYPES`), not as a sponsor feature, so the next confidential
      kind costs almost nothing.
- [x] ~~**গুপ্ত দান** — A145, v4.36.0~~ (2026-09-04). Second tenant of that
      machinery; needed no new mechanism, which was the point.
- [ ] **অনুষ্ঠান (cultural programme) — NOT STARTED.** Split in the discussion
      into two halves of very different cost:

  **(ক) The spending — needs NO code, and Hrishi can do it today.** Programme
  costs (sound, stage, guests' food, transport, artists' fees already paid) are
  ordinary puja expenses. Added as admin-defined expense subjects sharing one
  prefix — "🎭 অনুষ্ঠান · শিল্পী", "🎭 অনুষ্ঠান · সাউন্ড", "🎭 অনুষ্ঠান · অতিথি"
  — they sort together in the by-subject report and give a programme total for
  free. **This is a hand-list item, not a build item.**

  **(খ) দায় — money PROMISED but not yet paid. This the app genuinely cannot
  express, and it is the real gap.** An artist booked at ₹25,000 with ₹5,000
  advance leaves the committee ₹20,000 short, but `expenses` means "already
  paid", so the in-hand figure reads healthy while that money is spoken for.
  Easiest place in the whole book to be wrong about, right when the programme
  is being planned.

  Shape, worked out but NOT built: the mirror image of a party — a donor
  *promised to give and pays in instalments*; a vendor *is promised and is paid
  in instalments*. It CANNOT reuse `parties`: the advance would be counted as
  collection in every total. So it needs its own store, and that means
  **APP_SCHEMA 5 → 6**, which BLOCKS entries on any phone that has not updated.

  **Timing is the whole decision.** Deliberately deferred out of the trial week
  for that reason. It should land when (i) the twelve phones are known to be on
  one version, and (ii) the programme is being planned but its bookings have not
  yet started — before the first artist is booked, or the gap it exists to show
  is already invisible.

  Open question for Hrishi, unanswered: **when is the অনুষ্ঠান, and have any
  bookings/advances happened yet?** That answer decides whether দায় is worth
  building this season at all, or whether it belongs with next year's work.

## AFTER THE PUJA — the PRODUCT question (Hrishi, 2026-08-17)

Hrishi: *"I was thinking it as a product sale."* Recorded as the standing
direction for the post-puja season — the DB/domain question folds into this
(it was never about speed; the measured system is fast).

What already carries over as-is: the offline-first engine, the money model and
its invariant, 1,800+ tests, bilingual UI + in-app guide, the permission/post
system, the anomaly desk. What is single-committee by construction and must be
generalized for a product: one baked SCRIPT_URL (config.js), one Sheet, the
first-registrant-is-admin bootstrap, year handling, Hrishi-specific wording.

Two build paths to weigh AFTER the season, with the trial as market research:
1. **Kit model** (low cost, keeps the Sheet promise): each committee gets its
   own Sheet + Apps Script via a setup wizard; we sell setup + support. Nearly
   zero rewrite; scales poorly but proves demand.
2. **SaaS model** (real product): multi-tenant DB + domain + billing; the
   client stays, Code.gs's 47 actions become a real API. Big rewrite, real ops.

Honest unknowns to answer before building either: will committees PAY, who
supports 12×N phones in October, seasonality (income one month a year?). The
twelve trial users are the first customer interviews — collect what confused
them and what they'd pay for. No revenue promises; decision after the puja.

## AFTER THE PUJA — the A116 review's deferred findings (2026-08-16)

From the two adversarial reviews the night before go-live. Each was verified
against the code; none is day-one-critical, and each touches the money path
deeply enough that rushing it hours before the trial was the worse risk. In
rough order of value:

1. **The exiting gate rejects pre-decision offline rows** instead of holding
   them the way the freeze gate does (no timestamp on the check). An exiting
   collector's morning round, queued offline before the committee decided,
   lands in rejectedIds — collected cash with no central record. Fix shape:
   hold (heldIds) rows whose createdAt predates the access change.
2. ~~**Freeze does not gate confirmHandover / rejectHandover /
   resolveCorrection / setAnomalyFlag**~~ — **shipped as A165 (v4.53.0), but
   the DECISION half is still Hrishi's and one line reverses it.**
   Measured before fixing: with the year frozen, all three money actions still
   changed state (`pending → confirmed`, `pending → rejected`, `pending →
   rejected`), so a committee that closed its year could watch the figures move
   afterwards. The three are now **refused** for everyone but the admin;
   `setAnomalyFlag` is deliberately left open, because it marks a row as checked
   and moves no money.
   The note above said this "may be WANTED — getting cash into the cashier's
   hands during an incident is arguably the point", and that argument is not
   dead. What settled it for now: `push` already HOLDS a new handover during a
   freeze, so a collector cannot send money while frozen either — leaving the
   confirm open let the second half of a transaction complete while the first
   half was blocked. Refusing loses nothing: the parcel stays `pending` and the
   action returns the moment the freeze lifts.
   **DECIDED (Hrishi, 2026-09-05): keep the gate.** The reversal is still one
   line — drop `requireUnfrozen_(u)` from `confirmHandover` — and both halves
   stay pinned in `tests/backend.js`, so a future change of mind fails loudly
   rather than quietly. Item closed.
2b. **The idle fast path cannot see inside one millisecond (A170).** `pull`'s
   fast path answers "you are up to date" when `since >= data_ts`, and that
   comparison is load-bearing — the steady state IS `since == data_ts`, so
   making it strict would send every idle poll down the full read and destroy
   the fast path outright. The consequence: a row committed in the *same
   millisecond* as a phone's cursor is invisible to that phone until the next
   write anywhere in the book, at which point `>=` in the delta re-delivers it.
   Self-healing, and with twelve phones a next write is seconds away — but it
   is not *provably* impossible, e.g. the last write of the season.
   A real fix is a monotonic counter instead of a wall-clock stamp for
   `data_ts`, which is a schema-shaped change and NOT a trial-week one.
   Measured, not theorised: the fixed-clock harness reproduces it exactly,
   which is how it was found.
3. **confirmHandover/rejectHandover still read/write by `cols` position** —
   the A81 ghost-column class, aligned today, latent. Move to sheetHeader_.
4. **Last-admin guards race**: two admins demoting each other concurrently can
   leave zero admins. Wants the same lock the rest of Users writes hold.
5. **rolloverYear carries more than the note said (measured, A171).** Run
   against the real handler with four donor kinds, here is what crosses into
   the new year:
   - `pledged` — **the biggest one, and it was not in this note before.**
     Last season's ₹5,000 and ₹50,000 come across as live promises, so the new
     year's 📋 বাকির তালিকা opens showing money nobody has agreed to. Every
     donor is instantly in arrears.
   - `pledgeOk` — last season's consent, carried as if asked again.
   - a member row's linked `appUser` — the register starts pre-occupied.
   - **সponsor and গুপ্ত দান rows copy too.** A গুপ্ত দান is a one-time
     anonymous gift by its nature; carrying the name into a second year keeps
     a confidential record alive longer than anybody agreed to.
   Payments correctly do NOT carry, and the handler's `year-has-data` guard
   and `touchData_` stamp are both right.
   **Interim fix shipped (A171):** the confirm dialog now names what carries
   instead of only what does not. The old wording said "কোনো জমা কপি হবে না",
   which reassured about the one thing that stays behind — a confirm that
   reassures about the wrong thing is worse than none.
   **Still open, and it is Hrishi's call, at closure not now:** should a new
   season start with last year's pledges, with them blanked, or with the donor
   list only? Blanking `pledgeOk` is clearly right; blanking `pledged` is a
   committee decision about how the season is opened.
6. **canEditParty vs push on blank-collectorId rows** (hand-typed sheet rows):
   server accepts any collector, UI offers admin only. Harmless until somebody
   hand-types a row; align the two.
7. **Freeze hold trusts client createdAt** — blank/backdated stamps slide past.
   **A167 found a second symptom of the same root, so fix them together.**
   `voidAllowed_` permits a collector to void their OWN row, and it must:
   that is the Undo path (js/app.js `attemptUndo` writes a void with
   `reason: 'undo'` on a row that may already be in flight, where a local
   delete would resurrect on the next pull). But the server cannot tell an
   undo three seconds later from a self-erasure tomorrow, because the void
   carries no timestamp it can trust — the same weakness as the freeze hold.
   The danger, in this file's own words from the `exiting` gate: the row
   leaves the book, the collector's in-hand falls by the same amount, the
   arithmetic still balances, and the cash is simply gone.
   What limits it today: the void row is kept and shown (✖️ tag with who and
   why on the party screen), the 🩺 desk sees the shape, and a cashier reviews.
   Proper fix: a server-stamped `createdAt` on every row, then a short window
   for self-voids — which also closes item 7. **Do not "fix" it by refusing
   self-voids**; that removes Undo, and A59 / A60 / backend 2.9 will say so.
   Inherent to offline design; note kept so nobody mistakes it for a guarantee.
8. **Mixed-year push batches mint serials from the first row's year** — only
   matters in the New-Year straddle window.
9. **personalSummary_'s expense projection still omits `subject`** (client
   sends it) — matters the day anything consumes myReport.

## AFTER THE PUJA — UI / mobile pass (raised by Hrishi, 2026-08-15)

Hrishi: *"I think we should have mobile app expert roles"*, then narrowed it
himself: *"we just need the ui approaches here, nothing else."* He was right that
there is a blind spot — this file had **six hundred lines and not one about the
UI**. Everything in it is money, permissions, sync and deploys.

Measured rather than guessed, so the pass starts from facts:

- **Touch targets are already done** and should be left alone. `min-height: 44px`
  is on every button, chip, back-bar, void-btn and input; `css/style.css:257`
  carries A73's note — *"min-height makes 44px a GUARANTEE"*. There is also a
  `@media (max-width: 360px)` block. Nothing to redo here.

- **🔴 The app does not honour the phone's text size.** 236 hard-coded `px` in a
  545-line stylesheet and not a single `rem`. Smallest is **10px**, with 26
  declarations at 11–12.5px. An Android user who turns their text size up gets
  **no change at all**, because `px` does not listen to the OS. That is exactly
  the older committee member, reading rupee figures, on their own handset.

- **🔴 No dark mode.** Not one `prefers-color-scheme` rule. The app is used after
  dark, in a pandal, on phones that are in dark mode — and it will flash white
  and then be read by someone squinting at money.

Both bite at the moment of real use: dark, crowded, older eyes. Neither is worth
doing before the puja: a stylesheet change bumps `sw.js`, which (until the item
below lands) drags a full Apps Script redeploy behind it, and re-laying-out
screens people are about to collect real money on, days before, is the wrong
trade. Do this AFTER the decoupling below, when a client-only change is cheap.

- **(from the big-book drill, 2026-08-16)** `fmtMoney` builds a fresh Intl
  formatter per call via `toLocaleString('en-IN')` — ~28 ms/1,000 calls on
  desktop, likely ~0.3 s on the weakest phone across a full 396-row ledger
  paint. Memoize one `Intl.NumberFormat` in `js/i18n.js`. Two lines.

**Scope, agreed with Hrishi and written into `.claude/agents/ui-approach.md`:**
`css/style.css` only. Any markup change comes back as a recommendation instead
of an edit — `js/app.js` holds the money and permission decisions, and a UI pass
loose in there would cost more than a font size is worth.

## AFTER THE PUJA — decouple the SW cache key from the server version

A114 (2026-08-14): three client-only releases reached Pages and no phone, because
the worker's cache key never moved. The pre-commit hook now blocks that. But the
fix it forces is a full three-way version bump, which drags an Apps Script
redeploy behind every wording change.

They are two different numbers doing two different jobs: `VERSION` in `sw.js` is
a **cache key** and must move whenever a shell file moves; `CODE_VERSION` is the
**server build**. Only `APP_VERSION === sw VERSION` is load-bearing (A31 uses it
to tell "the worker is holding a different build"). Splitting `CODE_VERSION` off
would let a client fix ship on its own. Needs the test at run.js ~1396 rewritten
to express that rule instead of three-way equality.

## AFTER THE PUJA — closing the year (design note, 2026-07-29)

**Not to be built before the puja.** Closure is needed *after* the season, there
are two clear months, and touching working code now buys nothing. Written down
here so the puja rush cannot lose it. Raised by Hrishi: *"after completion of
all collection, spends everything — how are we going to give a closure for this
year"*, and *"we need to think about the possibilities of presentations and
operations"*.

### What exists today

`goLive` (start), `rolloverYear` (copy donors forward), `approveYear`, backups.
**There is no closure at all** — nothing checks the year is finished, nothing
freezes it, nothing produces a final statement.

One real gap found while looking: `push` only checks `hasYear_(user.years, year)`
and there is **no `removeYear_`** — only `addYear_`. So six months after the
puja anybody can still write a 2026 entry, and nothing objects.

### The arithmetic is already there

Verified by computing an end-of-season book with today's `js/aggregate.js` —
`computeTotals`, `inHandRows` and `reconcile` answer four of the five questions
with no new money code. What is missing is a screen that asks them together, and
a lock.

### Closure = five questions, then a lock

| | Question | Computable today? |
|---|---|---|
| 1 | Has every phone pushed everything? | ❌ the server cannot know — each phone must show ✅ |
| 2 | Any handover still awaiting পেয়েছি / পাইনি? | ✅ |
| 3 | Is the 🩺 desk clear? | ✅ `reconcile` |
| 4 | Is everyone's hand empty except the one person who should hold the balance? | ✅ `inHandRows` |
| 5 | Σ in-hand === collected − expenses? | ✅ |

A worked example on a synthetic book passed 4 and 5 and **failed 2** — one
collector's ₹20,000 still unconfirmed. That is exactly the thing nobody notices
at the end of a season, and then "where is the money" has no answer.

A 🏁 **বছর শেষ করো** screen, mirroring `🚀 Live শুরু করো`: name every failure
(*"জয়ের ₹২০,০০০ এখনো confirm হয়নি"*), refuse to close while one is red **and say
why**, then produce the statement, lock, and back up.

**The lock: `Config.closed_2026 = 1` plus one line in `push`**, not stripping the
year from every user. Stripping works but answers `year-not-approved`, which is
the wrong sentence — it blames the person, not the calendar. `year-closed` is
honest, and an admin can reopen it.

### Presentations — the part a committee actually cares about

A puja committee publishes its accounts. That is a real deliverable, not a
report screen, and the app already knows how to make one: `buildReceiptCanvas`
draws a proper Bengali document on a canvas and shares it. **The same machinery
produces the year-end statement.** Four things worth having, in this order:

1. **আয়-ব্যয়ের হিসাব** — the one that goes on the board or is read at the
   meeting. Income by source (দোকান / ব্যক্তি / সদস্য / বাস / রোড / টোটো),
   expenses by subject, closing balance, in formal সাধু-ভাষা like the receipt,
   with the committee name and year. Shareable as an image, printable as a page.
2. **দাতার তালিকা** — donors and amounts, the list that traditionally goes up in
   public. Needs a decision: full amounts, or names only?
3. **প্রতি সংগ্রাহকের হিসাব** — what each person collected, handed over, spent.
   This is accountability, and it is the document that settles arguments.
4. **খরচের বিস্তারিত** — by subject, with who spent it.

Open question: image (WhatsApp-friendly, like the receipt) or a printable HTML
page (better for a board, worse to share)? Probably both, same data.

### Operations — the order it has to happen in

1. Last expense recorded
2. **Every phone opens the app and shows ✅** — the one step no server can verify
3. Cashiers clear every pending handover (পেয়েছি / পাইনি)
4. 🩺 desk emptied — every anomaly answered
5. Collectors hand the last cash to whoever holds the balance
6. Admin opens 🏁, sees five greens, closes the year
7. Backup taken automatically at close
8. Statements generated and shared
9. **Next season**: `rolloverYear` copies the donors forward

### Answered

- **F2 rollover** — FIXED in v4.19.3 (A76), including the first-time-user case
  Hrishi raised. Still open for the closure work: what to do about **last year's
  unpaid balance**, which `rolloverYear` has no answer for (the 2027 row reads
  "pledged ₹1000, paid ₹0" and nothing records the carry-over).

- **Who owns the data if the committee changes?** (audit #4 Q5) — Hrishi,
  2026-07-31: the Google account is his; handover will be handled later as
  configuration. Recorded in `PROJECT_CONTEXT.md`. Closed.

- **"there is no delete option or block option of the user"** — DONE in
  v4.21.0 (A78), as a **two-door** design Hrishi specified himself:

  > "block / log in will be available till amount submit / if pending amout
  > collection is pending other user can collect / after that we can do final
  > block / this is access block decided by commitee / other one is security"

  **বিদায়ী (access block)** — the committee's door. Post, personal entries,
  reports and the cashier flag all go in ONE call; the login stays open, and
  the person may do exactly two things: hand in what they hold, and collect
  the balance of donors they brought in. **বন্ধ (security block)** — unchanged,
  the answer to a lost or stolen phone, and now refused while they still hold
  cash unless the committee writes the amount off on the record.

  Deletion is deliberately still absent, and stays absent: a collector who has
  touched money cannot be removed without the book losing a row it needs
  (`partyHasMoney_` already says the same thing about donors). Standing them
  down is the operation people actually want when they say "delete".

  What the investigation found on the way — each one is now a test:

  | | was possible | now |
  |---|---|---|
  | permissions | taking every personal permission left the POST's set intact, and 🧹 does not touch posts either | one call moves post + extras + cashier together |
  | payments | a permission-less user could still collect from **anybody's** donor | own donors only |
  | voids | they could void a payment they had taken — the row leaves the book, their in-hand falls by the same amount, reconcile stays silent, and the cash is simply gone | refused |
  | cashier / admin | either chip could be handed back on the same screen as the block, undoing it — `confirmHandover` is not a push and never sees the block | refused, both ends |
  | self-block | the sole admin could shut himself out with one tap; recovery only by hand-editing the sheet | `cant-block-self`, mirroring `cant-demote-self` |
  | stranded cash | blocking took the login away from somebody still holding money | refused with the figure; override records it as unrecovered |

  **The cashier case** (Hrishi, same day, v4.21.1 / A78b): `confirmHandover`
  wants cashier AND recipient, so standing a cashier down stranded every parcel
  already on its way to them — they lose the flag, no other cashier is the
  recipient, and only an admin could settle it, unprompted. Now refused while
  the inbox is unanswered, with the count and total named, so they clear it
  themselves while they still can. The order this feature wants:
  **inbox empty → বিদায়ী → hand in what they hold → চূড়ান্ত বন্ধ.**
  Sending money TO somebody stood down or blocked is refused at the push, so a
  stale screen or an offline queue cannot rebuild the trap.

  **Surviving the wipe** (v4.21.2 / A78c): 🧹 and 🚀 spare Users on purpose, so
  both new columns outlive a data refresh. `exitSnap` is practice money and is
  now cleared by both — it would otherwise show training figures against donors
  the wipe deleted. `access` is a decision about a person, like role or post,
  and is kept; the 🚀 card names anyone still standing down instead, so it is a
  choice rather than an accident.

  Still open, and not part of this: **🧹 clear-all-grants does not clear
  posts.** Before go-live the সদস্য post's own permissions must be reduced
  first, or 🧹 will report success and take nothing from anybody holding it.

### Three decisions that are Hrishi's, not mine

The screen cannot be built without these — "is the money where it should be"
has no meaning until the app knows where that is.

1. **Who holds the balance at the end?** কোষাধ্যক্ষ, সভাপতি, or a bank account?
   Question 4 is unanswerable without it.
2. **Does the leftover carry into next year?** If yes it must land as the first
   entry of 2027, or that year's book starts wrong.
3. **Receipt numbering in 2027** — restart at 000001, or continue?

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

## Position-based permissions (v4.9.0 →) — in progress

- [x] ① posts carry a max count and a permission set (v4.9.0)
- [x] ③ 🎖️ register: app-account dropdown that fills the details, position
      dropdown, and an EDIT path for an already-registered member (v4.9.2)
      — moved ahead of ② because the post-over-max anomaly lit a dot nothing
      could clear
- [x] ② server resolves position ∪ per-user extras; the user card carries the
      post dropdown, locked post-granted chips and the three-line breakdown
      (from post / granted on top / ends up with) (v4.9.3)
- [x] ② 🧹 clear everyone's personal grants except admin — shipped WITH the
      resolution, since doing it earlier would have locked every collector out.
      Warns by name about anyone whose post grants no entry permission. (v4.9.3)

### Do these in THIS order after the redeploy

1. Admin → 🧾 তালিকা → 🎖️ কমিটির পদ ও অনুমতি — tick what each post may do.
   Seeded posts grant NOTHING on purpose, so nothing works until this is done.
2. Admin → 👥 — give each person their post.
3. Check each card's "✅ শেষমেশ যা পারবে" line reads right.
4. ONLY THEN 🧹 clear everyone's personal permissions.

After ③ lands, the one pending Code.gs redeploy carries all of it.

## Bumping the version

Two numbers, and they answer different questions:

- **RELEASE** (`chanda-vX.Y.Z`) — in js/auth.js, sw.js and Code.gs. Bump on every
  shipped commit; all three must match (tests enforce it). It is what people
  read on screen.
- **SCHEMA** (`APP_SCHEMA` / `CODE_SCHEMA`, an integer) — bump ONLY in a commit
  that changes the server contract: a new column, a new handler, a changed
  meaning. Bump it in `js/auth.js` and `apps-script/Code.gs` **together**.

The version lock, the red bar and the admin's "redeploy pending" line all read
the SCHEMA. So a client-only release needs no redeploy and nags nobody; a server
change makes every phone update before it can write. A server that sends no
schema at all (a build from before v4.10.2) reads as unknown and locks nobody.
