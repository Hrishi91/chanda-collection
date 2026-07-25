# চাঁদা খাতা — Chanda Collection

Offline-first bilingual (বাংলা/English) PWA for Ganesh Puja chanda
collection by ~10 collectors, with a Google Sheet (via Apps Script) as the
single source of truth.

**Live app:** https://hrishi91.github.io/chanda-collection/

## Repo map

- `docs/PROJECT_CONTEXT.md` — what this is, every decision with its cause
- `docs/pending.md` — the living roadmap
- `docs/build-log.md` — append-only chronology of every change
- `docs/final-audit.md` — the pre-go-live audit (two passes, all fixed)
- `docs/user-guide/` — owner setup + collector guide (Bengali)
- `apps-script/Code.gs` — the deployable backend (paste into Apps Script)
- `js/` — vanilla-JS PWA, no build step
- `tests/run.js` — pure-logic tests (`node tests/run.js`)

## Working discipline

One subject per commit, docs updated in the same commit (enforced by
`scripts/pre-commit-docs.sh`). Verify claims live before reporting done.
