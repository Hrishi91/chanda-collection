# 🚀 Go Live — runbook

Written 2026-09-08, from the CODE, not from memory. Every claim below was read
out of `apps-script/Code.gs` or `js/app.js` on that day; the line references are
so the next person can re-check rather than trust this file.

---

## 1. What 🚀 actually does

`goLive` (`Code.gs`), in order:

1. **Requires an admin token AND `confirm: 'LIVE'`.** A52 found the client asked
   the admin to type LIVE and then threw the string away — *a confirmation that
   never leaves the phone is not a confirmation.* It is sent now.
2. **Refuses if already live** — and checks that **twice**: once at the top and
   again **inside the lock** (A116f). The reason is exact: the mandatory backup
   between the two checks is slow enough for an admin to press the button again,
   and the second request would wipe the **first live payments** — rows the
   phones have already marked synced and will therefore never re-push.
3. **Takes a Drive backup, and aborts if it cannot.** `backup-failed: …`. Losing
   training data is survivable; losing it with no snapshot is not.
4. Under a 30-second script lock:
   - **empties eight transactional sheets** (headers kept): Parties · Payments ·
     DailyCollections · Expenses · Handovers · Voids · **Messages** · Corrections
   - deletes every `receiptSeq_*`, so numbering restarts at 1
   - **locks `receipt_digits`** (4–9, default 6) at this moment
   - clears exit snapshots; **strips blocked accounts' grants** (A109)
   - sets `live_mode=on`, a fresh `data_epoch`, and `touchData_()`
   - writes a `went-live` audit line **naming the backup file**

**Survives:** Users (accounts, roles, permissions, areas, posts) · Lists (areas,
locations, posts) · ExpenseSubjects · Config (puja name, receipt design) · Audit.

> **Everything to do with WHO CAN DO WHAT survives 🚀. Set it before, not after.**

---

## 2. It is reversible — and the code says how

The word "one-way" in the source comments is about the wipe, not about recovery.
`restoreBackup` requires `confirm: 'RESTORE'`, accepts only files carrying the
backup prefix (never the live spreadsheet sharing the folder), **takes a safety
backup of the current state first**, and validates every sheet key **before the
first clear** — because a throw halfway once left the book half old and half new.

`BACKUP_EXTRA_SHEETS = ['ExpenseSubjects', 'Lists', 'Config', 'Audit']`, and
**`Config` carries `live_mode`**. So restoring the snapshot 🚀 itself made puts
the book back into training mode. The filename is in the `went-live` audit line.

**That is the undo. It exists. Restoring bumps `data_epoch` again**, so every
phone wipes its local cache a second time — see §3.

---

## 3. The one real danger: unsynced rows

`pullCentral` (`js/app.js`) compares the server's `data_epoch` with
`ck_epoch`. A new epoch means the server discarded the training book, so the
phone **clears its entire local database**.

Before clearing, it saves every row that is **unsynced and not rejected** into
`ck_wiped_entries` — the read-only 🪦 list in ⚙️ — capped at 200 and appended
across wipes (A132: an alert with only a COUNT is a memory test).

So, precisely:

> **An entry that has not reached the server when that phone first pulls after
> 🚀 is deleted from the phone. The information survives in ⚙️ → 🪦, but it must
> be typed in again by hand.**

### And there is a race

`autoSync()` pushes and *then* pulls. But the 60-second background poll and the
window-focus handler call `pullCentral` **directly**. Which fires first is not
determined:

| fires first | what happens |
|---|---|
| **pull** | unsynced rows are wiped to 🪦 — re-enter by hand |
| **push** | unsynced TRAINING rows land in the **live** book as live entries |

Neither is acceptable. Hence the rule below.

### The admin cannot see who is at risk

The server never sees a phone's queue. `listUsers` reports each phone's
**app version** ("ফোনের version পিছিয়ে") and nothing about pending entries.
**Only the collector's own badge shows ⏳.** Go-live therefore needs each
collector to confirm, not an admin to check.

### 🛑 Freeze does not solve this

A freeze holds rows in `heldIds` — *"neither saved nor refused, so they stay
queued"* — and a held row is an **unsynced** row. But rows created **before**
`freeze_at` still push through (`!createdAt || createdAt >= freezeAt`), which is
deliberate: a collector who wrote their morning round offline must not lose it.

So freeze is a good way to stop NEW writes while you switch. It is **not** a
substitute for everyone syncing to empty first — anything typed after the freeze
sits held on a phone and 🚀 will destroy it.

---

## 4. The sequence

### Before — all of this survives 🚀

1. **A second admin.** Nobody may write their own committee record, admin
   included, and `register` is self-service. With one admin, that person's own
   row can never be entered or corrected.
2. **The four posts: a 🪜 level AND their permissions.** Without a level, only an
   admin can appoint anybody. Without permissions, a member who is stood down and
   brought back returns **unable to work** (A194) — a post is what a returning
   member is given.
3. **Grant the keys by name.** `sponsor` / `gupt` to whoever takes them;
   **`sponsorview` + `guptview` to the কোষাধ্যক্ষ — without BOTH, that money
   cannot be handed over at all**; `progteam` (no 🎭 tab without it) plus
   `progdonor` / `progmoney` / `ticket` to the programme team. The two *view*
   keys deliberately cannot ride a post.
4. **Decide the reports.** Most collectors have an empty `reports` and can open
   no central report — intended, or grant some?
5. **🎭 fund on** (⚙️) and its **expense subjects** added, if the programme runs.
6. **Areas, expense subjects, receipt design final** — `receipt_digits` locks at 🚀.
7. **Everyone on the current version.** ⚙️ shows it; the admin panel counts the
   phones that are behind.
8. **Announce a stop time.** Everyone: stop entering · open the app **online** ·
   wait until ⏳ is gone · say so. Optionally 🛑 freeze afterwards to catch
   stragglers, understanding §3.
9. **⚙️ → backup on demand.** 🚀 makes its own, but this one is yours and costs
   nothing.

### The moment

10. 👑 → 🚀, type **LIVE**. **Do not press it twice** — the second press is
    guarded now, but the guard exists because of what a second press did.
11. **Write down the backup filename** from the `went-live` audit line. That is
    the undo.

### After

12. **Everyone online, then ⚙️ → 🔄.** The new epoch wipes each phone's cache and
    re-pulls the empty live book. They must be online for this.
13. **Each collector checks ⚙️ → 🪦 is EMPTY.** Anything in it is an entry that
    did not make it and has to be typed again.
14. **Make the first real entry yourself** and check the receipt number is
    `…000001` with the digit count you chose.
15. **If you turned the freeze on, turn it off** — and confirm somebody can save.

---

## 5. Things that go, and are meant to

- **Chat history.** Messages is one of the eight sheets.
- **Pending handovers**, from both sides — a parcel in flight simply is not there
  afterwards.
- **Blocked accounts' grants** are stripped: a shut-out account enters live with
  nothing.
- Every receipt number issued during training.

## 6. Still unverified by anything here

- The **`dailyBackup` time trigger** actually existing in the Apps Script project
  (`docs/residual-risks.md`). 🚀 takes its own backup regardless, so this is
  about the days after, not the night itself.
- The **real Apps Script runtime**: every server test in this repo runs on
  `tests/gas-shim.js`. Quota, locks and Drive behave differently on the real
  thing, and the mandatory backup is the step most likely to meet a Drive quota.
