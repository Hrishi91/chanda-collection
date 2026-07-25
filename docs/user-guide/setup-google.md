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

Nothing to set up by hand any more — **`setup()` installs the daily trigger
itself** (2am, function `dailyBackup`). Snapshots land in the **same Drive
folder as the spreadsheet** (`ganesh_pooja_daulatpur`), named
`chanda-backup-YYYY-MM-DD_HHMM.json`, and cover every sheet including Users,
master lists, Config and Audit.

You can also take one on demand: Admin panel → 🗂️ ডেটা ও হিসাব রক্ষা →
**💾 এখনই backup নাও**. Restore from any snapshot with **♻️ Backup থেকে
ফেরাও** (it takes a safety backup of the current state first, so a restore
is itself reversible).

⚠️ The first run of `setup()` after a new deployment asks for Drive and
trigger permissions — grant them, or backups silently never happen.

## Redeploying after script changes

⚠️ **On this Google account, "Manage deployments → New version" does NOT
actually repoint the URL to the new code** (verified repeatedly on
2026-07-24/25 — the old URL kept serving pre-change code every time).

So the working procedure is the opposite of the usual advice:

1. Paste the new `apps-script/Code.gs` → save.
2. **Deploy → New deployment** (Web app, execute as you, access: anyone).
3. Copy the NEW `/exec` URL and send it for baking into `js/config.js`
   (the app fetches config network-first, so devices pick it up on next
   open).
4. Run `setup()` once in the editor if the change added sheets/columns.
5. Old deployments pile up — archive them occasionally
   (Manage deployments → archive), they're harmless but clutter.

## Every year

Users stay registered. In 👑 Admin প্যানেল each approved user shows a
**"এ বছরের access দাও"** button until you grant the new year — nobody
enters without your yearly ok.
