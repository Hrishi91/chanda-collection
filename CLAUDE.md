# Chanda Collection — Ganesh Puja চাঁদা খাতা

Offline-first PWA for collecting Ganesh Puja chanda (donations) by ~10
collectors on their own mobiles, with a central Google Sheet as the
single source of truth and a combined "main" dashboard.

## Read these first (repo memory)

- `docs/PROJECT_CONTEXT.md` — what this is, decisions, architecture
- `docs/pending.md` — THE roadmap (prioritized, living)
- `docs/build-log.md` — append-only chronology

## Working rules (from Hrishi's global discipline)

- Explain in Bengali (technical terms English); code/docs/commits in English.
- One subject per commit, docs updated IN the same commit
  (pre-commit hook: `scripts/pre-commit-docs.sh`).
- Verify claims live before reporting done; walk the ALL-SURFACES
  checklist (logic, storage, UI, notification, tests, docs, handoff).
- Never expose secrets (Apps Script URL secret) in chat, logs, or repo.

## Stack & constraints

- Vanilla JS PWA, **no build step** — served as static files (GitHub Pages).
- Storage: IndexedDB on-device, append-only sync queue.
- Central store: Google Sheet via Apps Script web app (`apps-script/Code.gs`
  is the deployable source; Hrishi pastes/deploys it in his Google account).
- Bilingual UI: Bengali + English toggle (`js/i18n.js`).
- Voice entry: Web Speech API (bn-IN / en-IN), guided Q→A→confirm flow —
  never auto-commit an unconfirmed voice entry.
- Tests: `node tests/run.js` (pure-logic modules: number parsing,
  aggregation). Run before every commit that touches those files.

## Domain model (year-scoped, reusable across years)

- **Party** (shop/person/member): shops carry owner + side
  (main_malda / main_balurghat / harirampur / singhadaha) + pledged amount.
  Everyone pledges; pays part-by-part → balance = pledged − sum(payments).
- **Payment**: one installment against a party.
- **DailyCollection**: road / toto / bus (bus = name + number), multiple
  entries per day.
- **Expense**: puja expenses + collectors' own spend from collections.
