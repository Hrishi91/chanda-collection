# Residual risks & untested paths — 2026-07-25

> **UPDATE (v3.78.0):** §1 (disaster recovery) is now **closed in code** —
> `setup()` installs the daily backup trigger itself, `goLive` aborts if its
> safety backup fails, and a real **restore path** exists (admin: 💾 Back up
> now / ♻️ Restore from backup). The rest of this file still stands.

Everything in `docs/final-audit.md` is fixed and verified. This file is the
honest remainder: things that are **built but never exercised**, or
**deliberately out of scope**, or **operational steps only Hrishi can do**.
Nothing here is a known bug — they are the places where a surprise could
still come from.

## 1. Disaster recovery — WAS half built, now closed (v3.78.0)

**Fixed:** `setup()` now calls `ensureBackupTrigger_()` (idempotent), so the
daily 2am Drive backup no longer depends on remembering a manual editor
step. `dailyBackup()` returns its filename, is timestamped to the minute
(several backups a day never overwrite), and now also snapshots
ExpenseSubjects / Lists / Config / Audit — not just the transactional
sheets + Users. `goLive` treats its snapshot as **mandatory**: if the backup
throws, Go Live aborts with `backup-failed` and the data is untouched.
New admin actions: `backupNow`, `listBackups`, `restoreBackup` (guarded by
admin token + explicit fileId + typed "RESTORE", and it takes a safety
backup of the CURRENT state first, so a restore is itself reversible; it
also bumps `data_epoch` so every device re-pulls). Admin panel → 🗂️ ডেটা
ও হিসাব রক্ষা → 💾 এখনই backup নাও · ♻️ Backup থেকে ফেরাও.

**Still true:** Google Sheets' own version history remains the fastest
recovery for small accidents.

### (original text, for the record)

- `dailyBackup()` writes a full JSON snapshot (all sheets + users) to Drive
  folder (then `ChandaKhata-Backups`; now the sheet's own folder). **But:**
  - It only runs if a **time-driven trigger is installed by hand** in the
    Apps Script editor (Triggers → `dailyBackup`, daily 2–3am).
    ⚠️ **Unverified — Hrishi should confirm it exists**, otherwise there is
    no automatic backup at all.
  - `goLive` also calls it once (best-effort, wrapped in try/catch — a
    failure there is silent).
- **There is NO restore path.** Nothing in Code.gs reads a backup file back.
  Recovery from a deleted/corrupted Sheet would be manual: open the JSON,
  paste rows back into fresh sheets. The client's "⬆️ Backup ফেরত আনো" only
  restores *that phone's* own JSON export into its own IndexedDB.
- **Mitigation available today:** Google Sheets keeps its own version
  history (File → Version history) — that is the realistic first line of
  recovery, and it is better than the JSON path. Worth Hrishi knowing.

## 2. Never-run flows (built, unit-tested, zero live runs)

| Flow | Risk |
|---|---|
| `🚀 Go Live` | One-way, wipes every transactional sheet. Highest-stakes single action in the app. **Updated 2026-08-12 (A86):** the Drive backup is no longer best-effort — since A52 it throws `backup-failed` and stops rather than proceeding without a snapshot. And since A78c both it and `clearTraining` are EXECUTED by the suite, not just read: the shim had no `deleteRows`, so the two most destructive actions in the file had never once been run. Still never run **live** — that stays Hrishi's call. |
| `rolloverYear` (2027 setup) | Only matters next year; refuses if the target year already has data. |
| ~~`resetPassword` → forced change~~ | **Closed 2026-08-12 (A86).** Exercised end to end against the live server: an admin reset put the account into `mustChange`, and the app refused every other screen until a new password was set — the ledger could not even be opened. |
| Voice entry (bn-IN) on a real phone | Never tested on hardware; needs mic permission + internet. Typing always works, so worst case is a disabled feature, not data loss. |
| PWA install + offline reopen on a real phone | The offline story rests on this. **Narrowed 2026-08-12 (A96):** `sw.js` has now been run rather than read — a first-ever visit on a clean origin, then the server killed. The shell cached and served the app back in 60 ms, and the A55 4 s navigate race was never needed because a refused connection fails fast. It also found a real hole: `config.js` was not precached, so a phone that installed and reloaded offline before its second online load had no backend URL and was told it "was never paired". Fixed. What is still untested is the *hardware* — a real Android's storage eviction, Add-to-Home-Screen, and a network that goes quiet rather than refusing (the case the 4 s race exists for, and the one a desktop cannot reproduce). |

## 3. Concurrency & quota edges

- `push` holds a script lock with `waitLock(20000)`. If 10 phones sync at
  the same instant and one push is slow, a later one can exceed 20s and
  throw — the client surfaces it as a failed sync, the rows stay queued
  and retry later. **Data-safe** (no partial write: the lock covers the
  whole batch), but a collector may see a sync failure at peak moment.
- Apps Script daily quotas are far from the projected ~8.4k requests/day,
  but nothing in the app *detects* quota exhaustion — it would look like a
  generic network failure, entries queue locally until it clears.
- No server-side rate limit: an approved user could hammer `pull`. Trust
  level (committee) makes this acceptable.

## 4. Deliberately out of scope (re-confirm, don't "fix" by surprise)

- **No edit of a saved MONEY entry** — corrections are void + re-enter, by
  design (audit trail, 10-phone sync safety, receipts already handed out).
  Since A60 a DONOR row is different: it is an identity that payments point at
  by `partyId`, so it is corrected in place by its creator or an admin. Voiding
  and replacing one would orphan every rupee collected against it.
- **Report permissions are UI shaping, not secrecy** — `pull` gives every
  approved user the whole year's data, donor phone numbers included. `report`
  is gated; the data behind it is not. Re-proven 2026-08-12 (A86) and now
  pinned by a test, because I briefly wrote the opposite in the A79 note and a
  future reader could reasonably have believed reports are confidential.
  Anything that must be secret cannot be solved by a report grant.
- **Token in localStorage**, no CSP (static Pages hosting).
- **UPI to personal numbers** counts as in-hand until handover.
- Telegram alerts: deferred long ago, still deferred.

## 5. Operational checklist Hrishi still owns

1. ⚠️ Confirm the `dailyBackup` trigger exists (§1).
2. Approve/reject the pending registration(s) sitting in the admin panel.
3. Set Yamini's (and each collector's) entries / reports / cashier / areas.
4. Rotate the session tokens shared during the audits (just re-login) —
   including the admin token shared on 2026-08-11/12 for the live A78–A84 runs.
9. Delete the leftover test accounts from the Users sheet: `টেস্ট`
   (`@testuser1`), `zz_test_coll`, `zz_test_cash`. 🧹 spares Users by design, so
   they survive the wipe.
5. Revoke the GitHub PAT shared in chat on 2026-07-23.
6. Finalize master data (areas, expense subjects, receipt design, puja name,
   serial digit width) **before** Go Live — serial width locks in at go-live.
7. Every phone shows "✅ সব sync হয়ে গেছে" → then Go Live (unsynced rows
   on any phone at that moment are lost).
8. Real-phone smoke test: install, mic, bn voice entry, receipt → WhatsApp.
