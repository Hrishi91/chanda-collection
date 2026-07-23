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

- **👑 Admin** — sees/controls everything: approve/block users, set cashiers,
  report permissions, expense subjects, password resets.
- **💰 Cashier** — confirms cash handed over by collectors; records puja
  expenses; gets the "cash in hand" report.
- **Collector** — makes entries and sees their own "My summary". Sees central
  reports only if the admin grants permission.

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

## 📒 Ledger & 📊 reports

- **Ledger (খাতা)** — list of all donors; search, filter by "Dues only", tap a
  name for details + add payment.
- **Report** — everyone's own **"My summary"** at the top (collected / handed
  over / in hand). Below are the **central reports** (overview, dues, cash in
  hand, by collector, expenses, daily); each user sees only what the admin grants.

## 👑 Admin panel (Settings → 👑)

- A newly registered user appears under **"Awaiting approval"** → tap
  **✅ Approve**. **Tap "🔄 Refresh" after someone new registers** — the panel
  does not auto-update.
- Per approved user: **💰 Make cashier**, **🔑 Reset password** (gives a
  temporary password — tell them verbally), **🚫 Block**, and **📊 report
  permissions** (tap chips to grant/revoke).
- **🧾 Expense subjects** — add Pandal, Light, etc.; cashiers pick from these
  when recording an expense.
- Forgot password → reset here → they log in with the temporary one and set
  their own.

## ☁️ Sync, 💾 backup & 🌐 language

- Top-right badge: **✅** = all synced, **⏳ number** = entries not yet uploaded
  (auto-syncs when online, or tap the badge / "Sync now").
- **⚠️ Do not delete the app before entries sync** — unsynced entries are lost.
- **💾 Backup** — export a JSON file from Settings; import it back if needed.
- **🌐 Language** — Bengali/English toggle at the top or in Settings. **🎤 Voice**
  usually needs internet; typing always works.
