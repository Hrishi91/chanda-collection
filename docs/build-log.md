# Build log (append-only, oldest first)

## 2026-07-23 — Project bootstrap

- Requirements gathered from Hrishi (chat): shops/persons/members with
  pledged amounts + installments; road/toto/bus daily collections
  (bus = name + number); collector expenses; 10 collector phones; one
  central final report; Bengali+English; data must live in Google Drive;
  yearly reuse.
- Architecture decided: offline-first PWA + Apps Script/Google Sheet
  (see PROJECT_CONTEXT.md for causes). Voice entry Option B
  (guided + confirm) approved by Hrishi.
- Repo scaffolded: discipline docs, pre-commit docs hook, directories.

## 2026-07-23 — v1 PWA core (offline entry + reports)

- Built the full offline PWA: app shell (index.html, sw.js, manifest,
  SVG icon), IndexedDB layer (`js/db.js`), bn/en i18n (`js/i18n.js`),
  Bengali/English amount-word parser (`js/numparse.js`), shared
  aggregation (`js/aggregate.js`), Web Speech wrapper (`js/voice.js`),
  sync client (`js/sync.js`), and the guided chat-style entry engine +
  all views (`js/app.js`).
- Flows: new shop/person/member (pledge + first installment), bulk shop
  (sticky side), add payment, road/toto/bus daily (bus name+number),
  general + collection expenses. Summary-confirm before every save;
  editable per-field from summary.
- Tests: `node tests/run.js` → 49 passed, 0 failed (parser incl.
  পাঁচশো/সাড়ে তিনশো/দেড় হাজার; aggregation incl. dues + by-collector).
- Live-verified in browser (mobile viewport): onboarding → shop entry
  with "পাঁচশো"→₹500 word parse → save → খাতা list (₹200/₹500, বাকি
  ₹300) → installment "তিনশো" → ₹500/₹500 ✅ → report totals correct;
  unsynced badge counts 3.
