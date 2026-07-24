# App guide — how Chanda Khata works

The same guide is built into the app: **Settings → 📖 অ্যাপ গাইড / App guide**
(source: `js/help.js`). Keep this file and `js/help.js` in sync.

---

## 🙏 What this app is

A **Ganesh Puja donation (chanda) ledger**. Each collector makes entries on
their own phone. It works **offline**; when the internet returns, every entry
syncs to one central **Google Sheet**. All accounts reconcile in one place —
who collected what, who holds how much cash, what is still due.

## 🔑 Login & Register

- **First time:** "New? Register" → full name, username (lowercase English),
  phone, password.
- After registering you **cannot log in until an admin approves you** — tell
  the admin (Hrishikesh).
- Once approved, log in with username + password. After one online login the
  app also works offline.
- **One account = one active phone** — logging in on a new phone logs the old
  one out (the server keeps a single session token per user).

## 👥 Roles — who can do what

- **👑 Admin** — sees/controls everything: approve/block users, grant/remove
  admin, set cashiers, report permissions, area duties, expense subjects and
  area/location lists, password resets, activity log.
- **💰 Cashier** — confirms cash handed over by collectors; records puja
  expenses; gets the "cash in hand" report; decides on correction requests.
- **Collector** — makes entries and sees their own "My summary". Sees central
  reports only if the admin grants permission.

**Who can undo a wrong entry** — admin: any; cashier: only a regular
collector's entry (not their own, not another cashier's/admin's); collector:
cannot void at all — they *request* a correction and a cashier/admin approves
it, which creates the void.

## 🏠 Home screen

- **🏪 Shop / 🙍 Person / 🤝 Member** — add a new donor (pledged amount + any
  amount paid now).
- **🏪🏪 Bulk shops** — add many shops on the same road quickly.
- **🛣️ Road / 🛺 Toto / 🚌 Bus** — daily road collections (bus asks name +
  number).
- **💰 Add payment / dues** — a later installment against a balance.
- **🤝 Hand over** — give the cash in your hand to a cashier.
- **🧾 Expense** (cashier/admin only) and **✅ Confirm receipts** (cashier only).

## ✍️ Making an entry

Guided step by step — one question at a time; type or tap 🎤 to speak. Amounts
work as **digits or words** ("500" or "five hundred"). A **summary** appears at
the end — tap ✏️ on any line to fix it, then Save. On save the entry is stored
on the phone and syncs immediately if online.

## 💵 Cash / UPI, pledge & dues

- Every payment asks the mode — **Cash / UPI / Both**. For "Both", enter cash
  and UPI separately.
- **Pledged** = total promised. **Paid** = given so far. **Due = Pledged − Paid.**
- Donors can pay in parts; the due updates automatically.
- UPI comes to collectors' own numbers, so it counts as "in hand" like cash —
  until handed to a cashier.

## 🤝 Handover & confirmation

Tap **🤝 Hand over** → choose a cashier + cash/UPI amount. It becomes confirmed
only when the cashier opens **✅ Confirm receipts** and taps "Received". Until
confirmed, the money stays counted **in the collector's hand** (shown as
"awaiting confirm"). This keeps "cash in hand by collector" always correct.

## 💰 How the maths works

- **Donor's due** = pledged − all payments, counted **across every collector**
  (Salil takes 400 + Ram takes 600 → the donor's full 1000 is paid).
- **In-hand** = collected (payments + daily) + handovers received (confirmed)
  − handovers given (confirmed) − own expenses. Donor totals combine, but
  whose hand the money sits in never mixes.
- **Voided entries** drop out of every total (sums, dues, in-hand, reports)
  but stay visible struck-through in the ledger — the audit trail remains.
- **Reconciliation invariant:** everyone's in-hand added up = total collected
  − total expenses, always. A mismatch means a wrong entry somewhere.

## 📒 Ledger & 📊 reports

- **Ledger (খাতা)** — list of all donors; search, filter by "Dues only", tap a
  name for details + add payment.
- **Report** — everyone's own **"My summary"** at the top (collected / handed
  over / in hand). Below are the **central reports** (overview, dues, cash in
  hand, by collector, **📍 by area**, expenses, daily); each user sees only what
  the admin grants.
- **📍 By area** — how much each road collected and what is still due, ranked by
  collection (🥇🥈🥉).
- **Opens instantly** — ledger and reports render from data already stored on the
  phone and refresh in the background, so nothing blocks on the network and
  everything works offline.

## 🧾 Receipts & 📞 dues reminders

- **🧾 Receipt** — on a donor's page, tap 🧾 next to any payment to create a
  receipt image (donor, date, this payment, paid vs pledged, due, collector).
  Share it straight to WhatsApp or save it. Drawn on the phone; nothing is
  uploaded.
- **📞 Remind** — shown on donors who still owe money *and* have a phone number.
  It opens WhatsApp with the message pre-written (name + amount due); **you tap
  send yourself** — nothing is sent automatically.

## 🔔 Notifications — act right there

The top of the home screen lists what is waiting for you **with details**, not
just a count:

- **🙋 New user** (admin) — name + username, with **✅ Approve** / **🚫 Decline**
  inline.
- **💰 Handover** (cashier) — who handed over how much and when, with
  **✅ Received**.
- **⚠️ Correction request** — the reason, with **👁 Review** to approve or reject.

Refreshes every minute and whenever you return to the app.

## 👑 Admin panel (Settings → 👑)

- A newly registered user appears under **"Awaiting approval"** → tap
  **✅ Approve**. **Tap "🔄 Refresh" after someone new registers** — the panel
  does not auto-update.
- Per approved user: **💰 Make cashier**, **👑 Make/remove admin**, **🔑 Reset
  password** (gives a temporary password — tell them verbally), **🚫 Block**,
  **📊 report permissions**, and **📍 Area duties** (which roads they cover).
- **👑 Admin safeguards** — you cannot remove your own admin role, and the last
  remaining admin cannot be removed, so the committee can never be locked out.
- **🧾 Expense subjects** and **📍 Area / location lists** — add, rename or remove
  here; each item needs a Bengali and an English name, and changes reach every
  phone quickly.
- **📜 Activity log** — who did what and when: voids, correction approve/reject,
  handover confirms, admin/cashier changes, password resets, list edits.
  Append-only, for accountability.
- **🔄 Carry donors to new year** — copies last year's donor list into the new
  year (no payments carried; pledges kept as the starting ask). Refuses if that
  year already has donors, so it can never double-run.
- Forgot password → reset here → they log in with the temporary one and set
  their own.

## ☁️ Sync, 💾 backup & 🌐 language

- Top-right badge: **✅** = all synced, **⏳ number** = entries not yet uploaded
  (auto-syncs when online, or tap the badge / "Sync now").
- **⚠️ Do not delete the app before entries sync** — unsynced entries are lost.
- **💾 Backup** — export a JSON file from Settings; import it back if needed.
- **🌐 Language** — Bengali/English toggle at the top or in Settings. **🎤 Voice**
  usually needs internet; typing always works.
