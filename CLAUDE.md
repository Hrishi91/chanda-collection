# Chanda Collection — Ganesh Puja চাঁদা খাতা

Offline-first PWA for collecting Ganesh Puja chanda (donations) by ~10
collectors on their own mobiles, with a central Google Sheet as the
single source of truth and a combined "main" dashboard.

## Read these first (repo memory)

- `docs/PROJECT_CONTEXT.md` — what this is, decisions, architecture
- `docs/pending.md` — THE roadmap (prioritized, living)
- `docs/build-log.md` — append-only chronology

**These three are the ONLY source of truth for decisions, their causes and
their costs.** Assistant-side memory tools (claude-mem and the like) are a
search convenience — useful for "what was I working on last week" — never a
place to record a decision. Two memories that drift apart cannot be told apart
later, and in this project the *why* and the *what it cost* are the asset. If
one ever disagrees with these files, these files win.

## Working rules (from Hrishi's global discipline)

- Explain in Bengali (technical terms English); code/docs/commits in English.
- One subject per commit, docs updated IN the same commit
  (pre-commit hook: `scripts/pre-commit-docs.sh`).
- Verify claims live before reporting done; walk the ALL-SURFACES
  checklist (logic, storage, UI, **navigation**, notification, tests, docs, handoff).
- **Navigation is part of building a screen, never a second pass.** Every new
  screen or flow MUST wire its way BACK to the screen it was opened from, in the
  SAME change that adds it — not left for Hrishi to discover and redo:
  - a screen → `backBar(sourceView, params)` returning to its opener (thread a
    `from` param through any screen reachable by more than one door);
  - a flow → set BOTH `exitTo` (where ← mid-flow lands) AND `returnTo` (where it
    goes after save) to the launching screen; a flow with neither falls through
    to `home`, which is the bug. Honour both directions (back-out AND after-save).
  - Then VERIFY from the real entry point: open it the way a user does and press
    ← — it must land on the SOURCE, not home. Add a test pinning the flow's
    exitTo/returnTo so a later edit cannot silently drop it.
- Never expose secrets (Apps Script URL secret) in chat, logs, or repo.
- **Before any release, run `sh scripts/release-check.sh`** and put its answer
  in the handoff. It says whether this is a CLIENT night (nothing to do in the
  Apps Script editor) or a SERVER night (backup → paste → **New deployment**,
  never "New version" → hand over the new `/exec`), checks the five gates,
  lists what is still open in `docs/pending.md`, and names the four things no
  check can see. Read-only; it deploys nothing.
- **Pushing is not releasing.** The worker is cache-first, so a phone takes new
  code only at ⚙️ → 🔄. Push at night; Hrishi walks the app on his own phone in
  the morning and only then tells the other collectors to refresh.

## Stack & constraints

- Vanilla JS PWA, **no build step** — served as static files (GitHub Pages).
- Storage: IndexedDB on-device, append-only sync queue.
- Central store: Google Sheet via Apps Script web app (`apps-script/Code.gs`
  is the deployable source; Hrishi pastes/deploys it in his Google account).
- Bilingual UI: Bengali + English toggle (`js/i18n.js`).
- Voice entry: Web Speech API (bn-IN / en-IN), guided Q→A→confirm flow —
  never auto-commit an unconfirmed voice entry.
- Tests: `node tests/run.js` (pure-logic modules: number parsing,
  aggregation, permissions — plus a scope check over `js/app.js` that catches
  handlers calling out-of-scope helpers, which only throw when a user taps).
  Run before every commit that touches those files.

## Domain model (year-scoped, reusable across years)

- **Party** (shop/person/member): shops carry owner + side
  (main_malda / main_balurghat / harirampur / singhadaha) + pledged amount.
  Everyone pledges; pays part-by-part → balance = pledged − sum(payments).
- **Payment**: one installment against a party.
- **DailyCollection**: road / toto / bus (bus = name + number), multiple
  entries per day.
- **Expense**: puja expenses + collectors' own spend from collections.
