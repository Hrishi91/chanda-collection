# Residual risks & untested paths — 2026-07-25

Everything in `docs/final-audit.md` is fixed and verified. This file is the
honest remainder: things that are **built but never exercised**, or
**deliberately out of scope**, or **operational steps only Hrishi can do**.
Nothing here is a known bug — they are the places where a surprise could
still come from.

## 1. Disaster recovery is HALF built — the biggest real gap

- `dailyBackup()` writes a full JSON snapshot (all sheets + users) to Drive
  folder `ChandaKhata-Backups`. **But:**
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
| `🚀 Go Live` | One-way, wipes every transactional sheet. Its Drive backup is best-effort. Nobody has ever executed it. Highest-stakes single action in the app. |
| `rolloverYear` (2027 setup) | Only matters next year; refuses if the target year already has data. |
| `resetPassword` → forced change | Server code reviewed, never exercised end-to-end with a real user. |
| Voice entry (bn-IN) on a real phone | Never tested on hardware; needs mic permission + internet. Typing always works, so worst case is a disabled feature, not data loss. |
| PWA install + offline reopen on a real phone | The offline story rests on this. Untested on an actual collector phone. |

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

- **No edit of a saved entry** — corrections are void + re-enter, by design
  (audit trail, 10-phone sync safety, receipts already handed out).
- **Report permissions are UI shaping, not secrecy** — `pull` gives every
  approved user the whole year's data.
- **Token in localStorage**, no CSP (static Pages hosting).
- **UPI to personal numbers** counts as in-hand until handover.
- Telegram alerts: deferred long ago, still deferred.

## 5. Operational checklist Hrishi still owns

1. ⚠️ Confirm the `dailyBackup` trigger exists (§1).
2. Approve/reject the pending registration(s) sitting in the admin panel.
3. Set Yamini's (and each collector's) entries / reports / cashier / areas.
4. Rotate the session tokens shared during the audits (just re-login).
5. Revoke the GitHub PAT shared in chat on 2026-07-23.
6. Finalize master data (areas, expense subjects, receipt design, puja name,
   serial digit width) **before** Go Live — serial width locks in at go-live.
7. Every phone shows "✅ সব sync হয়ে গেছে" → then Go Live (unsynced rows
   on any phone at that moment are lost).
8. Real-phone smoke test: install, mic, bn voice entry, receipt → WhatsApp.
