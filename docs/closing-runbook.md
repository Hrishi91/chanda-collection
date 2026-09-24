# 🏁 Close the year — runbook

Written 2026-09-25, from the code (A294 final/audit reports · A295 the 🏁 lock ·
A296 the per-collector detail). The sibling of `docs/go-live-runbook.md`: that one
opens the season, this one closes it. Every claim here was read out of
`js/aggregate.js` / `js/app.js` / `apps-script/Code.gs`; the references are so the
next person can re-check rather than trust this file.

Closing is **not destructive and is reversible** — unlike 🚀. It sets a flag; it
deletes nothing; an admin can reopen. That is the whole design.

---

## 1. What closing actually is

**`closeYear` (`Code.gs`)** sets `Config.closed_<year> = 1` — nothing more. It
requires an admin token and `confirm: 'CLOSE'`, and refuses if the year is already
closed (`already-closed`).

What that one flag does:

- **`push` HOLDS every write for a closed year** (`yearClosed_`), the same way it
  holds a write for an unapproved year (A175). **Held, never refused** — the row
  stays on the phone and nothing is lost; reopen and it syncs. Chat stays open.
- **Reading is never locked.** A closed year still answers every report, the final
  statement and the audit. Closure stops new money going in; it does not seal the
  book away.

**`reopenYear`** (admin, `confirm: 'REOPEN'`) clears the flag; the held backlog
then pushes through. So a mistake — or a genuine late straggler — is recoverable:
reopen, take the entry, close again.

> Closing locks WRITES for one year. It keeps every READ. It is reversible.

`APP_SCHEMA` stays 5 across this, so no phone is locked out by the version bump —
the client computes the readiness checks locally and never calls the server to
close.

---

## 2. The readiness gate — the 🏁 screen

👑 admin panel → **🏁 বছর শেষ করো** (shown only once live). It reads the SAME
`computeReport('audit')` numbers as the 🔎 audit report, so the screen and the
report can never disagree, and checks three things:

| | Check | Blocks close? |
|---|---|---|
| 1 | Every phone has synced (⏳ empty) | **No** — a reminder. The server cannot see a phone's queue, so this is a human check |
| 2 | No handover awaiting পেয়েছি / পাইনি | **Yes** |
| 3 | 🩺 no anomalies — the books balance | **Yes** |

The **Close button is dead while check 2 or 3 is red**, and the screen says which.
Check 3 is the real financial verdict: `reconcile` finds no money discrepancy — no
payment whose cash+UPI ≠ its amount, no orphan payment, no over-spent collector, no
donor paid past their pledge. ("The books balance" and "no anomalies" are the same
fact — A294 found the Σ-in-hand identity is a tautology — so they are one check, not
two.)

---

## 3. The documents closing produces

- **🧾 চূড়ান্ত হিসাব (final / closing report)** → 📄 PDF. The committee's year-end
  statement: totals and cash/UPI split, by sector, **by area**, **by collector in
  full detail** (A296 — every donation, daily round, expense and handover, per
  collector, with each one's totals), expenses by subject, daily rounds.
  - **গুপ্ত (anonymous) donor names never appear** in this report — the name is
    dropped at the source (`collectorDetail`), for everyone, always, because a
    closing report is filed and published. Amounts stay; sponsor names stay
    (public by definition, A144).
- **🔎 আর্থিক নিরীক্ষা (audit)** → 📄 PDF. The verification: per-collector
  reconciliation, the void log with reasons, the anomaly tally, and the ✅/⚠️
  verdict.

---

## 4. The sequence

1. **Everyone syncs to zero.** Each collector: open the app **online**, wait until
   **⏳ is gone**, and say so. The server cannot see who still holds unsynced rows —
   only the collector's own badge shows ⏳ — so this needs each person to confirm.
2. **Run 🔎 আর্থিক নিরীক্ষা.** It must read **✅**. If ⚠️, fix what it names first —
   an unconfirmed handover, a broken cash/UPI split, an over-spend — and re-run.
3. **Produce 🧾 চূড়ান্ত হিসাব → 📄 PDF.** This is the document for the meeting/board.
4. **👑 → 🏁 বছর শেষ করো.** With the checks green the button lights; confirm. New
   entries now stop; reading and reports stay open.
5. **⚙️ → backup**, and copy the Sheet. Two records, two places.

> Short form: **sync-to-zero → 🔎 audit ✅ → 🧾 closing PDF → 🏁 lock → 💾 backup.**

---

## 5. If something is wrong after closing

- A genuine late entry, or a mistake: **👑 → 🏁 → 🔓 আবার খোলো** (reopenYear). The
  held rows sync, take the entry, close again. Nothing was lost while it was shut.

---

## 6. Not part of closing yet (deferred, in `docs/pending.md`)

- **Bank balance.** The closing report's "where the money is" today is *in hands*
  only; there is no committee-account balance in the model. That is a schema-level
  change, built with the super-admin phase.
- **Shareable presentations.** A WhatsApp-friendly image of the income–expense
  statement (like the receipt), a public donor list. The `buildReceiptCanvas`
  machinery can produce these; not built yet.
- **A one-button close that also produces the PDFs and the backup.** Today those
  are separate taps in the sequence above; the 🏁 screen only gates and locks.

---

## 7. Still unverified by anything here

- The **real Apps Script runtime** — every server test runs on `tests/gas-shim.js`.
  `closeYear`/`reopenYear` were probed on the live `/exec` after deployment (an
  auth-failing call that changes nothing), which proves the action exists there,
  not that a real close behaves identically under quota and locks.
- **A close has never been run end to end on real data.** The first real one is the
  first proof.
