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

## 4. Become admin — just register first

1. Open the app (the live link), tap **নতুন? নাম লেখাও (register)**,
   register with your own name/username (e.g. `hrishi`).
2. **The very first person to register is automatically the admin** and
   is approved on the spot — no editor step. Log in and you'll see the
   👑 Admin প্যানেল in Settings.
3. Everyone who registers after you shows up there for your approval
   (and you decide who is a cashier, who sees which report, etc).

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
