# The money model — every calculation and what feeds what

*Written 2026-07-26 from a machine-extracted call graph and a 37-invariant
cross-check (now permanent in `tests/run.js`, the "graph:" and "mirror:"
blocks). If you change any function here, the invariant block is what tells you
which other answers you just changed.*

## The layers

```
raw rows (IndexedDB / Sheet)
   │
   ├─ voidedIds → activeData          void filter — EVERY money reader goes through it
   │                                  (messages deliberately excluded — see note 1)
   │
   ├─ leaf vocabulary
   │    splitOf / isCashOnly          money type   (legacy row = pure cash)
   │    hoConfirmed/hoRejected/hoPending  handover outcome (three, never two)
   │    ck                            identity     (username first, name fallback)
   │
   ├─ myAvailable        ◄── THE pot engine: what X holds NOW, by category × type
   │     ├─ personalSummary.byCat     (must be identical — tested)
   │     ├─ mySummary.hero/groups     (আমার হিসাব levels 0–2)
   │     ├─ inHandRows.byCat          (central report's per-person pots)
   │     └─ handoverable              hero − pending, per pot AND per type
   │
   ├─ handoverSlots      ◄── the three-outcome partition of handover rows
   │     ├─ mySummary slots (⏳/✅/❌)
   │     └─ handoverable's pending set-aside
   │
   ├─ personalSummary    amount-clock: collected/received/handedOver/pending/inHand
   ├─ cashierView        the cashier screen's independent path (must equal handoverable)
   ├─ handoverReport     the 📗 book: six buckets (in/out × pending/confirmed/rejected)
   │
   ├─ inHandRows         central "কার হাতে কত" (one row per person)
   │     └─ reconcile    Σ inHand === collected − expenses, plus anomaly scan
   │
   └─ computeReport      overview/dues/inhand/collectors/expenses/daily
         (inhand delegates to inHandRows — same engine, not a re-derivation)
```

## The two clocks

Almost every past confusion came from mixing these:

| clock | question | functions |
|---|---|---|
| **right now** | what does X hold / owe this minute? | myAvailable, mySummary.hero, handoverable, cashierView, inHandRows.inHand |
| **season to date** | how much has flowed through X? | personalSummary.collected/received/handedOver, handoverReport buckets, computeTotals |

They legitimately disagree (a cashier can have ₹50,000 through their hands and
₹2,000 in them). No screen may print numbers from both clocks side by side
without labelling them — আমার হিসাব keeps season figures in the dashed
footer for exactly this reason.

## The decisions every figure rests on

1. **A pending handover is still the SENDER's money.** The receiver is credited
   only on confirm; deducting the sender early would leave the money in
   nobody's book and shrink the central total (proved live: ₹300 pending made
   Σ inHand read 700 instead of 1000).
2. **A rejected handover never left the sender.** Third status, never folded
   into "not confirmed" (A18): otherwise it is deducted from the ceiling for
   ever while sitting in nobody's pocket.
3. **The ceiling ≠ the hero.** hero answers "what do I answer for" (includes
   pending); handoverable answers "what can I physically pass on" (excludes it,
   per pot and per money type, with cross-type deficits charged — A20).
4. **Named pots never borrow silently.** An overspent pot goes negative and
   says so (Hrishi's rule: squared up later by exchanging cash). Only legacy
   rows with no srcCat use the deterministic `drain` order.
5. **Void is the only delete.** Append-only everywhere; corrections resolve
   into voids; `activeData` is the single gate.

## Invariants (all enforced in tests/run.js)

- Σ inHandRows.inHand === total collected − total expenses (reconcile),
  through chains, voids, rejections.
- personalSummary.inHand === myAvailable.total === mySummary.hero — the
  amount-clock and the split-clock meet at the top.
- personalSummary.byCat === myAvailable.byCat (two code paths, one table).
- Σ pots === hero — the drill-down always explains its own headline.
- handoverReport.sent === personalSummary.handedOver; pendingOut === pending;
  handoverSlots === the book's three buckets.
- handoverable.total === hero − pendingOut === cashierView.availableTotal
  (A20: even when one money type is over-committed).
- central row per person === that person's own hero (two independent engines).
- chain pending sits with each sender exactly once.
- computeReport('inhand') IS inHandRows.
- Code.gs mirrors agree on every SHARED field of all six reports and
  personalSummary_ (subset rule — see note 2).
- sw.js VERSION === Code.gs CODE_VERSION (deployments are identifiable).

## Deliberate divergences (do not "fix" these by reflex)

1. **`activeData` omits `messages`** while Code.gs `activeData_` keeps them —
   client-side money aggregation runs per collector and a season of chat made
   it 11× slower. messageFeed filters its own voids. (Tested; documented at
   the function.)
2. **Server report rows are leaner than client rows.** The client enriches
   (byCat on inhand, cash/upi columns on collectors/expenses) for display; the
   server surface is legacy/fallback and does not carry them. The mirror test
   therefore checks *subset agreement*: every field the server does report must
   match the client exactly. A shared number drifting fails the suite;
   enrichment does not.
3. **The category trail ends at the cashier hop.** Pooled money has no honest
   category, so a cashier's outgoing handover stores a `__snap` of their
   position instead of a per-category breakdown. `__`-prefixed keys are
   metadata everywhere — never categories, never in anomaly sums.

## Duplicate handling — five layers, each for a different accident

| accident | defence |
|---|---|
| the same row sent twice (retry, offline catch-up) | uuid at creation + server upserts by id; `collectUnsynced` filters `synced`/`rejected`; `inFlight` blocks a second push; a re-pushed payment gets **no second receipt serial** (`!idRow[id] && !receiptNo`) |
| double-tap on the final step | `savingFlow` swallows taps during the async save (A4) |
| two collectors adding the same donor | checked against `viewData()` — central + own, not just this device (A3). **Phone match beats name match** (A24): a name is weak ("মা তারা স্টোর" can be three shops), a number means the same household or owner. Both warnings name the existing donor. A confirm, never a block |
| identical ids in the data | `reconcile` → `duplicate_id` |
| **the same instalment entered twice** | `samePaymentsOn` — party + amount + day. A confirm at entry, a `possible_duplicate_payment` anomaly for pairs already in the book, and `dupOk` recording the human's answer so the banner asks once (A22) |

The fifth was the gap: every other layer is id-based, and a re-entry has a
different uuid. It is also invisible to reconcile's invariant, because both rows
really were collected.

**Why the phone is not mandatory** (asked and decided 2026-07-27): a blocking
field buys fake numbers, and a fake number is worse than a blank one — it
collides with every other fake number and poisons duplicate detection. Instead
the Skip asks a second time (`confirmSkipKey`), and wherever a number IS present
it is treated as the strongest identity signal available.

## Committee members are DONORS (A25) — but two screens, two grants (A29)

`member` (entry grant) = **collect** from a registered member: pick the name,
cash/UPI, mandatory comment, any number of times.
`memberadmin` (own grant) = **keep the register**: who is a member, their post,
their app account. One person keeps it; many people collect.



A member is still a `parties` row with `type='member'` — not a separate ledger. The
obvious build was a `members` store with its own entries; that would have meant a
**second money path**, with its own receipts, dues, pots and reconcile, and this
whole document exists because two paths eventually disagree. So the registry adds
only FIELDS (`position`, `email`, `appUser`, appended last on `parties`), while
the money keeps flowing through the same engine as every other donor.

`appUser` links a member to their app account and is **informational only**.
Money belongs to whoever COLLECTED it, never to whoever it is "about" — linking
সদস্য X to user @x must not move a rupee, or the in-hand model stops holding.
The admin screen says so in words, because the temptation to "credit the member"
is exactly the reflex that would break it.

A member's payment REQUIRES a comment (no `optional`, so the flow shows no Skip).
A member pays many times a season — monthly, a function, a special donation — and
unlike a shop's chanda the amount alone does not say which.

**Members carry no pledge.** Registration records the person; money arrives later
through the ordinary payment flow. So `pledged` is 0, which means: no member ever
appears in the dues list (`due = pledged − paid` is never positive), and the
`overpaid` anomaly SKIPS parties with a zero pledge — without that guard every
member contribution would raise an anomaly and drown the 🩺 desk.

## When something IS wrong: the anomaly desk (A23)

`reconcile` raises eight anomaly types. The ⚠️ banner on 📊 রিপোর্ট is a button
onto **🩺 অসঙ্গতি পরীক্ষা** (cashier/admin), where each one is a sentence plus the
rows involved. Only duplicates carry actions — ✓ আলাদা কিস্তি (stamp `dupOk`) or
✖️ বাড়তিটা বাতিল (the normal audited void). The rest are deliberately
read-only: they are data surgery, and a wrong "fix" moves real money.

Rule for anyone adding a ninth type: **detection without a sentence is not
detection.** A count nobody can act on trains people to ignore the banner, and
then the real gap goes unread too. The test suite enforces it — every type must
have a title and a message.

## Data-integrity assumptions (now watched, A21)

The flows always write `amount === cashAmount + upiAmount`, and a collector's
handover breakdown always sums to its amount. A hand-edited Sheet cell or a
buggy import can break both, which silently splits the two clocks. `reconcile`
now flags `split_mismatch` (any money store) and `breakdown_mismatch`
(handovers, `__` keys exempt) so the banner catches it instead of two screens
quietly disagreeing.
