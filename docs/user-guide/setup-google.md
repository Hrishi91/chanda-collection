# Google Sheet + Apps Script setup (owner only — Hrishi)

One-time, ~10 minutes. After this, all 10 phones sync into one Sheet.

## 1. Create the Sheet

1. Go to sheets.google.com → blank spreadsheet.
2. Name it **Chanda Khata 2026** (any name works).

## 2. Add the script

1. In the Sheet: **Extensions → Apps Script**.
2. Delete the placeholder code, paste the entire contents of
   `apps-script/Code.gs` from this repo. Save (💾).
3. In the editor's function dropdown pick **setup** → **Run**.
   Approve the permission prompts (it's your own script + your own
   Sheet). Five tabs appear: Users, Parties, Payments,
   DailyCollections, Expenses.

## 3. Deploy as web app

1. **Deploy → New deployment → type: Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
   ("Anyone" only means the URL responds; every real action needs a
   login token, and only users YOU approve can log in.)
3. Copy the **Web app URL** (ends in `/exec`) and send it to Claude —
   it gets baked into the app (`js/config.js`) so collectors never
   type it.

## 4. Bootstrap yourself as admin

1. Open the app, tap **নতুন? নাম লেখাও (register)**, register with
   your own username (e.g. `hrishi`).
2. Back in the Apps Script editor: open `Code.gs`, in the function
   dropdown pick **makeAdmin** — but first, at the bottom of the file,
   nothing to edit: instead run it from the editor console via
   **Run → makeAdmin** won't pass arguments, so use this once in the
   editor: add a temporary line `function boot(){ makeAdmin('hrishi'); }`,
   run **boot**, then delete the line.
3. Log in from the app — you'll see 👑 Admin প্যানেল in Settings.
   Everyone else who registers appears there for your approval.

## 5. Daily automatic backup to Drive

1. Apps Script editor → ⏰ **Triggers** (left sidebar) → Add trigger.
2. Function: `dailyBackup` · Event source: Time-driven · Day timer ·
   2am–3am. Backups (data + users) land in Drive folder
   `ChandaKhata-Backups`.

## Redeploying after script changes

Edit code → **Deploy → Manage deployments → ✏️ → Version: New** →
Deploy. The URL stays the same (do NOT create a second "New
deployment", that mints a different URL).

## Every year

Users stay registered. In 👑 Admin প্যানেল each approved user shows a
**"এ বছরের access দাও"** button until you grant the new year — nobody
enters without your yearly ok.
