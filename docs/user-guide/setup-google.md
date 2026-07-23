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
   Sheet). The 4 tabs (Parties, Payments, DailyCollections, Expenses)
   appear with headers.

## 3. Set the secret

1. Apps Script editor → ⚙️ **Project Settings** → **Script Properties**
   → Add property.
2. Property: `SECRET` — Value: a long random string you invent
   (e.g. 20+ chars). Never share it in public; this is what stops
   strangers from writing junk into your Sheet.

## 4. Deploy as web app

1. **Deploy → New deployment → type: Web app**.
2. Execute as: **Me**. Who has access: **Anyone**.
   ("Anyone" only means the URL responds; without the SECRET nobody can
   read or write data.)
3. Copy the **Web app URL** (ends in `/exec`).

## 5. Daily automatic backup to Drive

1. Apps Script editor → ⏰ **Triggers** (left sidebar) → Add trigger.
2. Function: `dailyBackup` · Event source: Time-driven · Day timer ·
   2am–3am. Backups land in Drive folder `ChandaKhata-Backups`.

## 6. Configure the phones

On each collector's phone, in the app: **সেটিংস** →
- **Sync URL** = the `/exec` URL from step 4
- **Sync secret** = the SECRET from step 3
Then tap **এখনই Sync করো** — the badge should turn ✅.

## Redeploying after script changes

Edit code → **Deploy → Manage deployments → ✏️ → Version: New** →
Deploy. The URL stays the same (do NOT create a second "New deployment",
that mints a different URL).
