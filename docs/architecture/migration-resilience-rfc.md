# Migration & Schema Resilience RFC (one manifest drives runtime + migrations)

> Note (2026-06): `templates/dmc`, `apps/dev`, and the shadcn registry (`apps/registry` + `packages/ui/registry`) have since been deleted per the packaged-admin RFC (§5); path references to them below are historical.

Status: RFC / proposal — tracked in voyant#1608
Audience: anyone who adds a module, extension, or link and then has to make
migrations reflect it; anyone who has shipped a migration that was silently
missing a table.

Related: [`schema-discipline.md`](./schema-discipline.md),
[`data-model-schema-authoring.md`](./data-model-schema-authoring.md),
[`index-and-constraint-policy.md`](./index-and-constraint-policy.md),
[`link-metadata-and-relationship-policy.md`](./link-metadata-and-relationship-policy.md),
[`module-provider-plugin-taxonomy.md`](./module-provider-plugin-taxonomy.md),
[`cross-module-indexing-and-projection-policy.md`](./cross-module-indexing-and-projection-policy.md).

---

## 0. TL;DR

We have been burned repeatedly by the same class of bug: a module or extension is
wired into the running app, but its tables never make it into a migration —
because **runtime registration and migration registration are two unrelated,
hand-maintained lists**, and **link tables live entirely outside the migration
history**. `db generate` then emits a migration that is silently incomplete, and
we find out in staging or prod.

The fix is **not** a new ORM and **not** a rewrite. We already built almost all
the machinery for the per-module ownership model we want — `voyant.config.ts`
lists the modules, `package.json#voyant.requiresSchemas` declares the dependency
graph, and the CLI's `resolveSchemas()` already walks that graph and emits an
ordered schema-entry list. **The templates just don't consume it.** Their
`drizzle.config.ts` files hand-curate divergent schema arrays instead.

**Recommendation:**

1. **Make the manifest (`voyant.config.ts`) the single source of truth** for what
   is composed — modules *and* extensions — and have both `createApp` and the
   migration tooling read from it.
2. **Generate a committed schema manifest** (`drizzle.schemas.generated.ts`) from
   that config via `resolveSchemas()`, so `drizzle.config.ts` stops hand-listing
   paths and a composed unit is *automatically* in migrations.
3. **Fold link tables into the migration history** so they get snapshots, drift
   detection, and rollback — instead of out-of-band `sync-links` raw DDL.
4. **Add a `voyant db doctor` guardrail** (run in CI) that fails loudly when the
   manifest, the discoverable schemas, and the latest migration snapshot disagree
   — turning "we shipped missing a table" into an un-mergeable error.
5. **Make migration ordering deterministic** (kill duplicate sequence numbers /
   mtime ordering).

①–③ are the structural fix; ④ is the guardrail that makes it *resilient* rather
than merely *less manual*; ⑤ removes a latent ordering footgun.

> **Caution — the manifests are not complete enough to drive migrations yet.**
> A naive "replace the schema array with `resolveSchemas(config)` output" PR would
> **drop real tables today** (§3.1). This RFC therefore opens with a **Phase 0
> inventory/normalization pass** and never replaces an array until generated
> output matches the existing hand list. Schema composition comes first; deriving
> *runtime* composition from the manifest is a harder, later step (§6).

---

## 1. The problem: four independent failure surfaces

### 1.1 The two-place registration trap (the main burn)

Neither `Module`/`Extension` (`packages/core/src/module.ts`) nor
`ApiModule`/`ApiExtension` (`packages/hono/src/module.ts`) has a `schema` field.
`VoyantAppConfig` in `createApp` (`packages/hono/src/app.ts`) has no `schema`
field either. So adding an extension means editing **two unrelated places**:

- **Runtime / routes:** `templates/dmc/src/api/app.ts` →
  `createApp({ extensions: [...] })`.
- **Migrations:** `templates/dmc/drizzle.config.ts` → the hand-curated
  `schema: [...]` array.

Nothing connects these lists, so nothing can warn you when they disagree. Forget
the second and `db generate` emits a migration *missing the extension's tables*.
That is precisely the recurring failure.

Concrete evidence — the booking extensions are correctly registered in **both**
places today, but only because someone remembered each time:

| Extension | Package | Tables | Wired in `app.ts` | In `drizzle.config.ts` |
|---|---|---|---|---|
| `bookingsSupplierExtension` | bookings | `bookingSupplierStatuses`, `bookingActivityLog` | ✓ | ✓ |
| `bookingsCreateExtension` | finance | (uses finance tables) | ✓ | ✓ |
| `productsBookingExtension` | products | `bookingProductDetails`, `bookingItemProductDetails` | ✓ | ✓ |
| `proposalsBookingExtension` | proposals | `bookingProposalDetails` | ✓ | ✓ |
| `bookingOrigins` | bookings | `bookingOrigins` | ✓ | ✓ |
| `distributionBookingExtension` | distribution | `bookingDistributionDetails` | ✓ | ✓ |

Six extensions, two lists, zero enforcement that they stay in sync.

### 1.2 Hand-curated schema lists, duplicated per template, drifting

Each template maintains its own divergent `schema: [...]` array:

- `templates/dmc/drizzle.config.ts` — 24 package entries
- `starters/operator/drizzle.config.ts` — 31 package entries + 1 starter-local
  (`./src/db/schema.ts`)
- `apps/dev/drizzle.config.ts` — 21 package entries (and **no `voyant.config.ts`
  at all** — see §3.1)
- `packages/catalog/drizzle.config.ts` — 1 entry (standalone)

They drift, and institutional knowledge is encoded as comments the next person
will miss — e.g. operator's config explains a manually-added FK-target schema
(`facilities`) that isn't even a mounted module. Every new package is one more
path to remember in N places.

### 1.3 Link tables live outside the migration history

> Current unified lifecycle (2026-07): `voyant migrate` consumes the generated
> graph-selected link registry after schema migrations and transactionally
> materializes writable pivots. The manual `voyant db sync-links` behavior below
> describes the legacy baseline that motivated the change.

`defineLink` pivot tables are materialized by `voyant db sync-links`
(`cli/.../commands/db-sync-links.ts`) via raw
`CREATE TABLE IF NOT EXISTS` DDL generated by `generateLinkTableSql`
(`packages/core/src/links.ts`) and applied by `syncLinks`
(`packages/db/src/links.ts`). This is a **separate manual step** from
`drizzle-kit migrate`, with:

- **no snapshot** — link tables are absent from drizzle's `meta/*_snapshot.json`,
- **no drift detection** — change a link's cardinality and `IF NOT EXISTS`
  no-ops, silently leaving the old shape in place,
- **no rollback**, and **easy to forget** — add a link, forget `sync-links`,
  table missing in prod.

The link definitions themselves live in `templates/dmc/src/links/index.ts`
(7 links today) and are exported for tooling — but they never reach the
versioned migration history.

### 1.4 Non-deterministic migration ordering

`templates/dmc/migrations/` already contains **colliding sequence numbers**
(two `0001_*.sql` files from concurrent developers). drizzle-kit falls back to
**mtime ordering at runtime**, so two machines can apply the same set of
migrations in different orders — a latent staging/prod divergence bug.

---

## 2. Principles we are adopting

The modular-backend pattern we want is well-trodden: **a composed unit owns its
schema, and the set of composed units is the single source of truth for both what
runs and what migrates.** Concretely:

- **One manifest.** What is composed (modules + extensions) is declared in exactly
  one place, and everything else — routes, migrations, link tables, drift checks —
  is *derived* from it.
- **Declared, discoverable schema.** A package declares the schema it owns; the
  tooling discovers it transitively. You cannot mount a unit and forget its
  tables, because mounting *is* declaring.
- **One unified migration history.** Module tables, extension tables, and link
  tables all participate in the same snapshotted, ordered, rollback-able history.
- **Fail loudly, early.** Disagreement between manifest, schema, and migrations is
  a CI failure, not a prod incident.

---

## 3. Current state (what already exists vs what's missing)

| Capability | Status | Where |
|---|---|---|
| Manifest of composed modules | ✅ exists | `starters/*/voyant.config.ts` (`modules: [...]`) |
| Manifest of composed **extensions** | ❌ missing | extensions are runtime-only in `app.ts` |
| Per-package schema declaration | ⚠️ partial | `package.json#voyant.schema` / `requiresSchemas` (used by CLI only) |
| Transitive schema resolution | ✅ exists | `cli/.../lib/resolve-schemas.ts` → `resolveSchemas()` |
| CLI prints resolved schemas | ✅ exists | `voyant db schemas` (`cli/.../commands/db-schemas.ts`) |
| `drizzle.config.ts` consumes resolution | ❌ no | hand-curated arrays (§1.2) |
| Links in migration history | ❌ no | out-of-band `sync-links` (§1.3) |
| Drift / completeness guardrail | ❌ no | — |
| Deterministic migration ordering | ❌ no | duplicate `NNNN_` + mtime (§1.4) |

The headline: **the discovery engine is built and unused.** Most of this RFC is
wiring what exists together and closing the three gaps (extensions in the
manifest, links in history, the guardrail).

### 3.1 The manifests are not complete enough to drive migrations *yet*

The discovery engine being unused does **not** mean it is ready to be switched on.
A naive "replace the schema array with `resolveSchemas(config)` output" PR would
**drop real tables today**, because the manifests are currently a *subset* of what
the templates actually migrate. Comparing each template's `voyant.config.ts`
`modules` (plus the `requiresSchemas` closure) against its `drizzle.config.ts`
schema list:

- **DMC** resolver output would **miss**: `action-ledger`, `accommodations`,
  `legal`, `catalog`, `storefront`.
- **Operator** would miss even more: `action-ledger`, `catalog-authoring`,
  `legal`, `promotions`, `cruises`, `charters`, `accommodations`,
  `trips`, `flights`, `catalog`,
  `storefront` verification schema (plus its starter-local `./src/db/schema.ts`).
- **apps/dev** has a `drizzle.config.ts` but **no `voyant.config.ts`** — there is
  no manifest to resolve from, so it needs a manifest-creation step before it can
  consume generated output.

Two further normalization gaps block resolution even where a module *is* listed:

- **Missing `package.json#voyant` metadata.** `catalog`,
  `trips`, and `flights` export schema subpaths but declare no `voyant`
  field, so `resolveSchemas()` cannot find their schema or dependencies.
  (`crm`/`products`/`bookings` do declare it.)
- **Non-standard schema entrypoints.** Operator lists `flights` as
  `src/reference/local-postgres.ts`, **not** `src/schema.ts` — so even adding a
  `voyant` field needs the correct subpath, not the `./schema` default.

This is the reason for **Phase 0** (§6): complete the manifests and the
`package.json#voyant` declarations, and make generated output *match the existing
hand lists exactly*, **before** any array is replaced. The completeness check is
itself the first job of `db doctor` (§4.5), shipped as a report before it becomes
a CI gate.

---

## 4. Design

### 4.1 The project definition is the single source of truth

This RFC originally introduced a core-owned `VoyantConfig` manifest. ADR-0012
supersedes that application authoring surface: package and application
extensions are now first-class selections in the project definition returned by
`@voyant-travel/framework` `defineConfig`.

```ts
import { defineConfig } from "@voyant-travel/framework"

export default defineConfig({
  modules: [{ resolve: "@acme/voyant-loyalty" }],
  plugins: [{ resolve: "@acme/voyant-payments" }],
})
```

Both consumers read from it:

- **Runtime:** `createApp` derives its `extensions: [...]` from the manifest (or a
  thin generated `app.extensions.generated.ts`), instead of a hand-maintained
  literal in `templates/dmc/src/api/app.ts`.
- **Migrations:** the schema resolver (§4.2) includes extension-owned tables
  because each extension package declares its schema (§4.3).

After this, **adding an extension is one edit to the manifest** and it wires
routes *and* migrations together. The two-place trap (§1.1) is closed by
construction.

### 4.2 Generated, committed schema manifest for drizzle

`drizzle.config.ts` is plain JS, but it cannot easily depend on the CLI repo at
config-eval time. So the chosen mechanism (decision below) is a **committed
generated file**:

- `voyant db generate` (and a standalone `voyant db schemas --emit`) runs
  `resolveSchemas(config)` and writes
  `templates/<t>/drizzle.schemas.generated.ts`:

  ```ts
  // AUTO-GENERATED from voyant.config.ts — do not edit by hand.
  // Run `voyant db generate` to refresh.
  export const schema = [
    "../../packages/db/src/schema/index.ts",
    "../../packages/relationships/src/schema.ts",
    "../../packages/proposals/src/schema.ts",
    // ...dependency-ordered, derived from the manifest...
  ]
  ```

- `drizzle.config.ts` shrinks to:

  ```ts
  import { schema } from "./drizzle.schemas.generated.js"
  export default defineConfig({ schema, out: "./migrations", dialect: "postgresql", /* ... */ })
  ```

Why a committed generated file rather than evaluating `resolveSchemas` inside the
config: it is **diffable in PRs** (you can see exactly which schemas a change
adds/removes), it **works offline / in CI** without resolving the CLI as a config
dependency, and the `doctor` check (§4.5) can assert it is **up to date** (regenerate
→ `git diff` must be empty). All four templates stop hand-maintaining arrays and
stop drifting (§1.2).

### 4.3 Schema is declared on the package it belongs to

Every package that owns tables sets `package.json#voyant.schema` (default
`./schema`) and `requiresSchemas` for FK-target dependencies — the fields
`resolveSchemas()` already reads. Extensions that own tables (e.g.
`@voyant-travel/inventory/booking-extension`) declare their schema subpath the same way,
so resolution picks them up automatically once they're in the manifest (§4.1).
This makes "mounted but schema-less" unrepresentable.

### 4.4 Fold link tables into the migration history

Stop treating links as an out-of-band concern — but **do not** do it by appending
raw `CREATE TABLE IF NOT EXISTS` to the migration and hoping Drizzle snapshots it.
That raw DDL is exactly the problem today (`generateLinkTableSql`,
`packages/core/src/links.ts:187`): it is invisible to the differ and silently
no-ops on change. Re-emitting it into a migration file would *not* give us drift
detection.

Instead, **generate real Drizzle table definitions from the link definitions** and
feed those into the schema manifest, so **Drizzle owns the diff and the snapshot**:

- A small generator turns each `LinkDefinition` (`starters/*/src/links/index.ts`)
  into a Drizzle `pgTable` (id, `<left>_id`, `<right>_id`, timestamps, the
  cardinality-derived indexes) — the same shape `generateLinkTableSql` produces,
  but as a Drizzle schema object rather than a SQL string.
- That generated schema is added to the resolved schema manifest (§4.2), so
  `drizzle-kit generate` diffs link tables like any other table. Changing a link's
  cardinality now produces a **real, reviewable migration**; the silent
  `IF NOT EXISTS` no-op (§1.3) is gone.
- **Transition:** `voyant db sync-links` is retained as an escape hatch, and
  `voyant db migrate` runs it as an automatic post-step so links can't be
  forgotten *before* folding lands — but once links are in the Drizzle snapshot,
  the post-step becomes a no-op and can be retired.

### 4.5 The guardrail: `voyant db doctor` (run in CI)

A non-invasive command that cross-checks manifest ↔ schema ↔ migrations and
**fails the build** on any disagreement:

1. Every module/extension in the manifest resolves to a discoverable schema entry.
2. `drizzle.schemas.generated.ts` is up to date (regenerate → empty `git diff`).
3. `drizzle-kit check` reports **no pending diff** between the schema and the
   latest snapshot (i.e. no un-generated tables — catches the §1.1 burn).
4. Every link definition has a corresponding committed table in the snapshot.
5. No duplicate migration sequence numbers (§4.6).

This is the highest-leverage, lowest-risk piece: it works against the *current*
setup and surfaces all existing drift immediately. It **ships first as a
report/baseline tool** (exit 0, prints findings) so we can drive the Phase 0
drift to zero without breaking CI on day one; it is **flipped to CI-failing only
once the report is clean**. After that, the "shipped missing a table" class of bug
is un-mergeable.

### 4.6 Deterministic migration ordering

Remove the mtime-ordering footgun (§1.4) by either:

- enforcing **timestamp-prefixed** migration names (e.g. `YYYYMMDDHHMM_*`) so
  ordering is total and machine-independent; or
- adding a lint (part of `doctor`) that **rejects duplicate `NNNN_` prefixes**,
  forcing renumber-on-rebase.

Lean: the duplicate-prefix lint first (cheap, immediate), timestamp prefixes as a
follow-up convention change if collisions keep happening.

---

## 5. CLI surface (changes to `voyant db`)

The `db` command (`cli/.../commands/db.ts`) today proxies `generate|migrate|
studio|push|check` to `pnpm -C <template> drizzle-kit <sub>` and adds
`sync-links` + `schemas`. Changes:

| Command | Change |
|---|---|
| `db generate` | before proxying drizzle-kit: regenerate `drizzle.schemas.generated.ts` from the manifest, and emit link DDL into the migration (§4.2, §4.4) |
| `db schemas` | add `--emit` to write the generated file (in addition to printing) |
| `db migrate` | run `sync-links` as an automatic post-step during transition (§4.4) |
| `db doctor` | **new** — the §4.5 guardrail; exit non-zero on disagreement |
| `db sync-links` | retained as escape hatch; no longer the primary link path |

---

## 6. Phased plan

Each phase is independently shippable and leaves the tree green. The ordering is
deliberately conservative: **normalize and verify before replacing anything**, and
defer runtime derivation (the hard part) to last.

### Phase 0 — inventory & normalization (no behavior change)
- Build the per-template manifest↔schema gap inventory (§3.1) and keep it current.
- Add `package.json#voyant` (`schema`, `requiresSchemas`) to **every**
  schema-owning package, including `catalog`, `trips`,
  and `flights`; fix non-standard entrypoints (e.g. flights'
  `src/reference/local-postgres.ts`).
- Complete each template's `voyant.config.ts` so `modules` covers everything its
  Drizzle list migrates (DMC: + `action-ledger`, `accommodations`, `legal`,
  `catalog`, `storefront`; operator: the longer list in §3.1).
- Create a `voyant.config.ts` for `apps/dev`.
- **Exit criterion:** `resolveSchemas(config)` output is set-equal to each
  template's current hand list. **No arrays replaced yet.**

### Phase 1 — `db doctor` as a report (no CI gate)
- Implement `voyant db doctor` against the **current** setup: manifest↔schema
  resolution gap, `drizzle-kit check` pending diff, duplicate-prefix lint,
  links-not-in-snapshot. Exit 0, print findings.
- Run it informationally and use it to drive Phase 0 drift to zero.
- *Outcome:* every existing drift is visible and tracked, with no CI breakage.

### Phase 2 — generated schema manifest (flip the gate on)
- `voyant db schemas --emit` / `db generate` writes `drizzle.schemas.generated.ts`
  from the (now-complete) manifest.
- Switch the four `drizzle.config.ts` files to import it **only after** generated
  output matches the hand lists exactly.
- `doctor` asserts the generated file is up to date; **turn the CI gate on**.
- *Outcome:* hand-curated, drifting schema lists (§1.2) eliminated; new drift
  un-mergeable.

### Phase 3 — links folded via generated Drizzle table defs
- Generate **Drizzle table definitions** from link definitions and add them to the
  schema manifest, so Drizzle owns the diff/snapshot (§4.4). Not raw SQL.
- Keep `sync-links` as escape hatch; retire the `db migrate` post-step once links
  appear in the snapshot.
- *Outcome:* §1.3 closed; link cardinality changes produce real migrations.

### Phase 4 — extensions in the project definition (schema dimension)
- Include extension-owned tables selected by framework project definitions via
  each extension's `package.json#voyant`.
- *Outcome:* the §1.1 trap closed on the **migration side** — an extension's
  tables can no longer be silently omitted from a migration.

### Phase 5 — runtime derivation (the hard part) + deterministic ordering
- Deriving `createApp({ modules, extensions })` from the manifest is **harder than
  schema derivation**: many API modules require **template-specific factory
  options**, so this needs a carefully designed runtime manifest/registry, not a
  literal array swap. Treat as its own design pass; until then runtime stays
  hand-wired but is *validated* against the manifest by `doctor`.
- Adopt deterministic migration ordering: duplicate-prefix lint first, timestamp
  prefixes if collisions persist; document in `schema-discipline.md`.
- *Outcome:* §1.1 fully closed (routes too); §1.4 closed.

---

## 7. Decisions made & open questions

**Decided in this RFC:**

- **Single manifest drives runtime + migrations** — `voyant.config.ts` is the
  source of truth for modules *and* extensions.
- **Schema discovery via a committed generated file**
  (`drizzle.schemas.generated.ts`), not by evaluating the resolver inside
  `drizzle.config.ts` — chosen for PR-diffability, offline/CI safety, and so
  `doctor` can assert it is current.
- **Link tables fold into the migration history** — they get snapshots, drift
  detection, and rollback; `sync-links` becomes an escape hatch.
- **`db doctor` is the resilience layer** and ships first — but **as a report
  before a CI gate** (Phase 1), flipped to failing only once Phase 0 drift is zero.
- **Phase 0 inventory/normalization is mandatory.** The manifests are an
  incomplete subset today (§3.1); no schema array is replaced until
  `resolveSchemas(config)` output is set-equal to the existing hand list. This
  avoids a PR that silently drops real tables.
- **Link folding generates Drizzle table definitions** fed into the schema
  manifest (Drizzle owns the diff/snapshot) — **not** re-emitted raw
  `CREATE TABLE IF NOT EXISTS`, which is the current problem.
- **Schema derivation first, runtime derivation later.** Deriving the *runtime*
  module/extension composition from the manifest is deferred to its own design
  pass because many API modules need template-specific factory options; until
  then runtime stays hand-wired and is *validated* against the manifest.
- **No new ORM, no rewrite** — this is wiring existing discovery (`resolveSchemas`,
  `package.json#voyant`, the manifest) together and closing three gaps.

**Still open:**

1. **Generated-file location & extension granularity** — is the extension
   manifest entry a package subpath (`@voyant-travel/inventory/booking-extension`) or a
   stable extension name resolved via a registry? Lean: subpath, mirroring how
   modules are listed.
2. **Multi-template generation** — do we generate per template
   (`templates/{dmc,operator}`, `apps/dev`, `packages/catalog`) from each one's
   own manifest, or hoist a shared base? Lean: per template; each owns its
   composition.
3. **Link folding mechanism** — emit link DDL as part of the normal drizzle
   migration file vs a dedicated drizzle-table schema generated from link
   definitions (so links flow through drizzle's own differ). Lean: investigate the
   generated-schema route first, since it gives true drift detection for free.
4. **Timestamp vs lint for ordering** — start with the duplicate-prefix lint;
   only adopt timestamp prefixes if collisions persist.
5. **Plugin-shipped schema** — distributable plugins (`ApiBundle`) currently have
   no schema/migration story; align them with the per-package declaration once
   §4.3 lands.

---

## 8. Success criteria

The migration layer is resilient when:

- **Adding a module or extension is one manifest edit** — routes and migrations
  are both derived; there is no second list to forget.
- **`drizzle.config.ts` files contain no hand-curated schema paths** — all four
  consume the generated manifest, and they cannot drift.
- **Link tables appear in the migration snapshot** — changing a link produces a
  real, reviewable migration; nothing is materialized out-of-band.
- **CI fails before merge** whenever manifest, schema, and migrations disagree —
  the "shipped missing a table" incident class is gone.
- **Migration order is identical on every machine** — no mtime dependence, no
  duplicate sequence numbers.
- **No ORM change and no big-bang rewrite** — each phase ships independently and
  leaves the tree green.
