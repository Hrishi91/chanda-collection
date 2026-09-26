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

## 10. Open decisions (needed before Phase 2)

1. **Model** — Kit / SaaS / **Hybrid** (recommended).
2. **Audience breadth** — puja-only, or generic "collection" (schools/clubs too)?
3. **Pricing shape** — per-season license / one-time+support / freemium.

Two feature designs already agreed and parked here until this phase (see
`docs/pending.md`): **bank account + balance** (multiple accounts, multiple QRs,
admin-decided `upi_mode`) and the **publishable year-end statement** (the same
canvas machinery as the receipt). Both ride the entitlement layer.
