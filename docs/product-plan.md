# Product plan — চাঁদা খাতা → a sellable collection ledger

Status: **PLAN ONLY, DEFERRED to a season boundary.** No code, no scaffolding.
Written 2026-09-26 from the discussion with Hrishi. This is the single place the
post-season product thinking lives; the deferred stubs in `docs/pending.md`
(super-admin, bank/balance) point here. Nothing in this file is a commitment to
build; it is the map to start from when the collection is over.

> Discipline reminder: never started mid-collection. Separate git worktree,
> a fresh brainstorming/design pass first, live `main` untouched. The current
> committee migrates in as **tenant #1 at a season boundary**, never hot-swapped.

---

## 1. Vision

An offline-first, bilingual (Bengali/English) **collection ledger** with the
trust story "your money data stays in your own Google account." Sold first to
Ganesh Puja committees, then to any community fund drive (other pujas, schools,
clubs, apartment associations).

Three tiers (Hrishi's words, 2026-09-24):
**super-admin** (app owner, Hrishi) → **tenant admin** (a club/committee) →
**users** (collectors/cashier). The super-admin provisions tenants and sets each
tenant's ENTITLEMENT (which modules/reports/features that club may use); the
tenant admin then distributes permissions WITHIN that entitlement using the
screens that already exist.

---

## 2. The model decision — Kit vs SaaS vs Hybrid

| | Kit | SaaS | **Hybrid (recommended)** |
|---|---|---|---|
| Data location | each committee's own Sheet + Apps Script | one central DB | **each tenant's own Sheet** |
| Entitlement / billing | none (weak) | central (easy) | **a thin central registry** holding only licenses/entitlements |
| Rewrite | ~zero | huge (Code.gs 47 actions → real API) | small |
| Whose money data do we hold? | nobody's | everybody's (liability + trust hit) | **nobody's** — this is a selling point |
| Ops burden | N Apps Script deployments | year-round | middle |

**Why Hybrid.** In pure Kit the tenant admin controls their own Apps Script and
could edit its Config to unlock paid features, so entitlement cannot live only in
the tenant's Sheet. Solution: the super-admin issues a **signed license/entitlement
token** (signed with Hrishi's private key), which the app verifies OFFLINE and the
tenant cannot forge; the token's expiry is the billing hook. Money data still
stays in the tenant's own Sheet — no central store of anyone's money.

---

## 3. Two architecture insights that cut the update pain

1. **One shared client, many backends.** All tenants run the SAME client
   (one GitHub Pages app), parameterised only by config (SCRIPT_URL + template).
   So a client update is ONE deploy for everyone. Only `Code.gs` is per-tenant,
   and it already self-heals its headers (`ensureCols_`), so keeping Code.gs
   changes rare keeps the N-deploy burden low.
2. **Entitlement sits one step ABOVE today's system.** `PERM_KEYS` /
   `REPORT_IDS` / module toggles stay exactly as they are; a per-tenant super-set
   gate caps what the admin's permission screen may offer. Existing code does not
   break — the entitlement layer is additive.

---

## 4. Reuse vs new work

**Reused, already built:** offline engine + sync queue, money model and its
invariant, 4,200+ tests, bilingual UI + in-app guide, permission/post system,
anomaly desk, receipt/canvas renderer.

**Single-committee by construction, must be generalised:** the one baked
SCRIPT_URL (config.js), one Sheet, first-registrant-is-admin bootstrap,
Ganesh-Puja-specific wording, year handling.

---

## 5. Domain generalisation — a spectrum

- L0: Ganesh Puja only (today).
- L1: any Bengali puja (Durga / Kali / Saraswati) — wording/template only.
- L2: any collection (school fund, club, apartment association) — "চাঁদা" →
  "collection", puja-specific fields optional.

**Principle:** domain wording and fields become **data (a tenant template)**, not
code. Adding a vertical = a new template, not a rewrite.

**Bonus — the seasonality cure:** covering multiple festivals (Durga Oct, Kali
Nov, Saraswati Feb) plus non-puja collections (schools, clubs) spreads revenue
across the year instead of one month.

---

## 6. Business — honest unknowns, pricing, go-to-market

**Three unknowns to answer BEFORE building either path:**
1. Will committees actually PAY?
2. Who supports 12×N phones during the October crush?
3. Seasonality — can a one-season-a-year income sustain it?

**Where the answers are:** the 12 trial users + this committee are the first
customer interviews and the first case study. Puja-committee networks are tight;
word of mouth carries. Start local (Malda / Balurghat), expand.

**Pricing shapes to weigh:** per-season license (fits seasonality — recommended)
· one-time setup + annual support · freemium (reports/advanced paid) · size tiers
(by collector count).

---

## 7. Provisioning & migration

- New tenant creation: **manual at first** (copy a template Sheet + deploy Apps
  Script + issue a license token per sale); automate later via the Apps Script
  API / a setup wizard once demand is proven.
- **This committee = tenant #1**, migrated in at the 2027 season boundary. Never
  hot-swapped mid-season.

---

## 8. Recommended build order (phases)

| Phase | What | Code? |
|---|---|---|
| 0 | Post-season rest + market validation (interview the 12 users, talk to 2–3 committees) | No |
| 1 | Separate worktree; brainstorming/design pass; finalise the model | No (design) |
| 2 | Extract domain wording into a template; make the client tenant-parameterised; prove with a 2nd test tenant | Yes |
| 3 | Entitlement layer (signed token) + super-admin provisioning (manual) | Yes |
| 4 | Bank/balance + publishable statement — behind entitlement | Yes |
| 5 | Billing + scale decisions | Later |

Rule: never mid-collection; every phase at a season boundary, in a separate
worktree, live `main` untouched.

---

## 9. Risks

Will they pay · the October support load · seasonality · each tenant's Google
account ownership · what happens to the data if a committee changes hands ·
one-account-one-device at scale.

---

## 10. Open decisions — DECIDED 2026-10-13 (Hrishi, design session)

1. **Model → Hybrid.** Each tenant keeps their own Sheet (we store nobody's money
   data — the selling point and the least liability); entitlement rides a thin
   central registry via a signed license token. Kit rejected (entitlement too weak,
   editable by the tenant); SaaS rejected (huge rewrite of 47 actions into a real
   API, and we'd hold everyone's money data).
2. **Audience → template-driven, generic-CAPABLE architecture; Ganesh-Puja template
   first; narrow (Bengali pujas) go-to-market.** Domain wording and which fields are
   on are DATA (a tenant template), not code, so schools/clubs are a template away,
   never a rewrite. Build the template mechanism + one Ganesh template now; add other
   verticals as data when demand shows (YAGNI — no school-specific fields built
   speculatively). The breadth is the seasonality cure (Durga/Kali/Saraswati + non-puja
   spread revenue across the year), kept in the architecture, built on demand.
3. **Pricing → per-season license (shape); the NUMBER waits on market validation.**
   Fits seasonality and maps to the entitlement token's expiry (the billing hook is
   already in the architecture). One-time+support (no recurring) and freemium (unclear
   support/piracy) rejected as the primary shape; size-by-collector-count is a possible
   modifier on top. Critically, pricing does NOT gate the build: the token only needs an
   `exp`, so any shape works — the number is set after interviewing the 12 trial users +
   2–3 committees (§6), and no revenue is promised until then.

Two feature designs already agreed and parked here until this phase (see
`docs/pending.md`): **bank account + balance** (multiple accounts, multiple QRs,
admin-decided `upi_mode`) and the **publishable year-end statement** (the same
canvas machinery as the receipt). Both ride the entitlement layer.

---

## 11. Phase-2 technical design — tenant-parameterisation (design 2026-10-13)

Goal of Phase 2: make the ONE shared client serve many tenants, each on their own
Sheet/Apps Script, with a signed entitlement gating paid modules — WITHOUT rewriting
the money engine. Design only; built at a season boundary, in a worktree, `main`
untouched. Four pieces; each is additive and leaves the collector's path unchanged.

### A. Tenant binding — which backend is THIS phone's?

Today: one baked `SCRIPT_URL` in `js/config.js`. Insight: the per-tenant backend
pointer **already exists** — `Settings.get('scriptUrl')` overrides `CONFIG.SCRIPT_URL`
(auth.js:68), used today only as an admin test override.

- A tenant is JOINED by a link the super-admin hands the tenant admin:
  `…/chanda-collection/#join=<base64({scriptUrl, tenantId, name})>`. On first run the
  client reads the fragment, stores `scriptUrl` (and `tenantId`) in Settings, and
  drops the fragment. No per-tenant build — one GitHub Pages app for everyone.
- `js/config.js` SCRIPT_URL becomes the DEMO/empty default (or a "enter your join
  link" landing). Real tenants always run on their stored `scriptUrl`.
- One-account-one-device and the token-per-login already scope identity within a
  backend; nothing there changes.

### B. Tenant template — domain wording + fields as DATA

Today: Ganesh-Puja nouns and the party-kinds are in code (`i18n.js`, `PARTY_KINDS`).
Make the DOMAIN-specific slice a template the tenant's `Config` sheet carries (it
already ships `pujaName`, `program_on`, etc., and rides every pull):

- `Config.template` (JSON): `{ collectionNoun, entityNouns:{shop,person,member,…},
  enabledKinds:[…], enabledFields:{…}, festival }`. Seeded from a **Ganesh-Puja
  template** at provisioning.
- `i18n.t()` gains a thin DOMAIN layer: a key tagged domain-specific resolves from
  the template first, else the built-in Bengali/English string. Only ~30–40 strings
  are domain-specific (চাঁদা, পুজো, the party-kind labels); the app's 800+ UI strings
  are domain-neutral and untouched.
- `PARTY_KINDS` / which entry tiles show become `enabledKinds` from the template,
  defaulting to today's full set — so the Ganesh tenant is byte-identical behaviour.
- Adding "school fund" later = a new template row, zero code.

### C. Entitlement token — signed, verified OFFLINE

The one thing a Hybrid tenant must NOT be able to forge (they control their own
Sheet/Config). So entitlement is a token signed by the super-admin's PRIVATE key and
verified by the client with a BAKED-IN PUBLIC key — offline, no server call.

- Token = `base64url(payload) + "." + base64url(signature)`, **ECDSA P-256**
  (Web Crypto `crypto.subtle.verify`, supported on current mobile Chrome/Safari).
  Payload: `{ tenantId, ent:["reports:*","program","bank",…], iss, iat, exp, kid }`.
- Baked into the client: the super-admin PUBLIC key(s), by `kid` (so a key can be
  rotated without reissuing every tenant — the client keeps a small keyring).
- Verify on load; cache the verified entitlement. On signature-fail or expiry →
  read-only / "license expired, renew" state (NEVER data loss — the tenant's Sheet
  is theirs). `exp` checked against the device clock with a **grace window** (clocks
  drift; a few days' grace avoids locking a paying tenant over a wrong clock).
- The token lives in the `Config` sheet (super-admin pastes it at provisioning; the
  tenant admin can re-paste a renewal). It rides the pull like any config.

### D. The entitlement GATE — one layer above today's permissions

Insight (already in §3): `PERM_KEYS` / `REPORT_IDS` / module toggles are untouched.
A per-tenant SUPER-SET caps what the admin's permission screen may OFFER:

- `allowedByEntitlement(key)` = `ent` ∩ (the key's module). The admin permission
  screen filters its offered chips/reports through it; `effPerms_` on the server
  also intersects with the entitlement (defence-in-depth, same client/server mirror
  rule the app already follows). A tenant without `bank` never sees the bank module;
  a tenant without `program` never sees the 🎭 tab.
- Existing permission logic is unchanged — the gate is a cap ABOVE it, additive.

### E. Provisioning runbook (manual first, §7)

Per sale, the super-admin: (1) copies the template Sheet; (2) deploys its bound Apps
Script (New deployment → `/exec`); (3) mints a token (`sign(payload, privKey)`);
(4) hands the tenant admin the **join link** (scriptUrl+tenantId) and the **token**.
Automate later via the Apps Script API once demand is proven. This committee is
**tenant #1**, migrated at the 2027 boundary.

### What stays UNTOUCHED (the whole point)

The offline engine, sync queue, money model + invariant, 4,370 tests, the permission
system, anomaly desk, receipt canvas — none change. Tenant-parameterisation is a thin
additive shell: a stored `scriptUrl`, a `Config.template`, a verified token, and a
cap over the permission screen.

### Open technical questions (for the build, not blockers)

1. **Key custody** — where the super-admin PRIVATE key lives and how tokens are
   minted (a tiny local signing script vs a protected Apps Script). Recommendation:
   an offline local Node script Hrishi runs; the private key never leaves his machine.
2. **Clock-drift grace** — how many days of expiry grace (recommend 7).
3. **Template depth v1** — ship ONLY wording + enabledKinds first; defer field-level
   toggles until a non-puja tenant actually needs them (YAGNI).

Bank account + balance (pending.md) and the publishable year-end statement are
Phase-4 modules behind the `bank`/`statement` entitlements — their designs are
already agreed; they plug into the gate above.
