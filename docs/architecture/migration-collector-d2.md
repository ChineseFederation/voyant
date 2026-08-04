# ADR: D.2 — package-owned migrations + topological collector

- **Status:** **Done.** The dual-path collector (`applyD2Migrations` — renamed `applyMigrations` in `framework-migrations@0.6.0`, which also dropped the legacy execute-only `applyMigrations`/`importBaseline`), per-package migration folders, the cutline manifest, the portable deployment runner (`discoverMigrationSources` + `runDeploymentMigrations`, `framework-migrations@0.5.x`), and the live operator runner all shipped. **Both existing deployments (eturia + protravel) cut over to D.2 on 2026-06-20** (ledger-only import-baseline, validated on isolated Neon branches first). The cutline is now **frozen** and the bundle is decommissioned from the apply path + the staleness gate (slice 3c, below).
- **Date:** 2026-06-20
- **Shipped:**
  - `applyD2Migrations` dual-path collector + cutline (`@voyant-travel/framework-migrations`) — PR #2014 (3b-1).
  - Per-package migration folders for all 24 schema-owning sources, the `cutline.generated.json` manifest, and the `verify-package-baseline.mjs --union` gate with **reverse-coverage** (every bundle table must be owned by some source — caught `flights` + `catalog-authoring` as un-onboarded owners) — PR #2016.
  - The Operator runner was rewritten to discover package sources, topo-order by
    `requiresSchemas`, and apply via the dual-path collector — PR #2018 (3b-2).
    That project wrapper is now retired; `voyant migrate` executes the generated
    graph migration plan.
- **Validated by:** `spikes/d2-migration-collector/run.mjs` (18/18 on the docker test DB) — proves the fresh-vs-existing dual path, import-baseline (no re-create, verified by stable table OIDs), topo-ordering + cycle rejection, the negative control (naive execute → `duplicate_table`), and **column-level convergence** of a fresh D.2 DB and a transitioned D.1 DB. The spike also surfaced the **baseline cutline** requirement (Decision 5).
- **Supersedes (on acceptance):** the single combined history of `migration-resilience-rfc.md` (voyant#1608) and the standard-profile-only scope of `migration-collector-d1.md`. D.1 explicitly deferred this: *"D.2 (package-owned migrations) would supersede #1608; it is out of scope here and gated behind its own ADR."*
- **Implements:** `consolidated-deployments-rfc.md` Workstream **D.2**.
- **Builds on:** `migration-collector-d1.md` (the multi-source collector primitive). D.2 reuses the collector and ledger **unchanged** — `planMigrations` / `applyMigrations` / `importBaseline` in `packages/framework-migrations/src/collector.ts` are untouched. Only *how sources are produced, ordered, and reconciled with existing ledgers* changes.

## Context

D.1 moved migration-history **ownership** from the deployment fork to the framework, while keeping a **single aggregate-generated history**. It ships one monolithic `framework` bundle (`@voyant-travel/framework-migrations`, priority 0) plus the deployment's own source (link tables + custom modules, priority 1). The collector applies sources in `(priority → in-source seq)` order against a version-independent `_voyant_migrations(source, tag, content_hash)` ledger whose primary key is **`(source, tag)`**.

D.1 is clean **only for the standard profile** — a deployment mounting exactly the reference module set. The moment a deployment **adds or removes a module**, it diverges from the fixed aggregate bundle: the bundle either creates tables the deployment doesn't want, or omits tables it does. D.1's own scope boundary names the fix as D.2 — *package-owned migrations + a topological collector*.

The collector primitive is already source-agnostic: `planMigrations()` sorts N sources by `(priority, seq)`. The hard part of D.2 is therefore **not** the apply engine — it is (a) **producing** per-package sources, (b) **ordering** them correctly, and (c) **reconciling the D.1 → D.2 transition** so that a single design works for *both* existing monolithic-ledger databases *and* fresh arbitrary-subset databases. Getting (c) wrong is how this turns into duplicate-DDL failures on live databases.

## Decision (proposed)

### 1. Each schema-owning package ships its own complete `migrations/` history

One drizzle migrations folder per package — generated from that package's own schema, shipped exactly as `@voyant-travel/framework-migrations` ships its bundle today, but per-package. **The folder contains the package's full history (its baseline + every increment)**, not just new migrations — fresh arbitrary-subset databases must be able to create historical package tables *without* the old monolithic bundle, which is the whole point of supporting module removal. Each package exports a loader (mirroring `loadFrameworkBundleSource()` / `loadMigrationFolder()`).

### 2. Discovery resolves the schema **closure**, not the mounted set

A deployment's sources are not just the packages in `voyant.config.ts`. The aggregate schema list already pulls in transitive, non-mounted schema dependencies — e.g. `@voyant-travel/db` appears in `apps/operator/drizzle.schemas.generated.ts` though it is in no `modules`/`extensions`/`additionalSchemas` entry. D.2 **reuses the same closure resolver that emits `drizzle.schemas.generated.ts`** — the one driven by each package's `voyant.requiresSchemas` metadata (`packages/catalog/package.json` declares `requiresSchemas: ["@voyant-travel/db"]`; the closure is already walked in `scripts/check-retail-spine-closure.mjs`). The set of migration sources is exactly the set of packages in that resolved schema closure, plus the deployment-local source.

### 3. Topological ordering from `voyant.requiresSchemas` (DAG now, not deferred)

This is a **topological** collector, not merely an ordered one. Order package sources by a topological sort of the `voyant.requiresSchemas` DAG — the same metadata the closure resolver already consumes, which already throws on cycles. The `voyant.config.ts` module-array order is used only as a **deterministic tie-breaker** among packages with no dependency edge between them. The deployment-local source (cross-module link tables + `src/modules`/`src/extensions`) is pinned **last** — its link tables FK into every module.

(Restating D.1's invariant: ordering is **per-run**, not a global guarantee. A new package migration on a later upgrade may apply *after* deployment migrations that ran in an earlier run — safe because DDL is forward-only and the ledger records only what is applied.)

### 4. Per-package source identity comes from package metadata, never paths or versions

A source's `name` (the ledger key half) must be **stable across refactors and versions**. Derive it from the package name plus its declared `voyant.schema` entrypoint — *not* the filesystem path and *not* the package version. Schema subpaths vary by package (`@voyant-travel/storefront` → `./verification/schema`; `@voyant-travel/flights` → `./reference/local-postgres`), so the folder location is discovered via metadata, but the **ledger source name is the package identity** and is frozen once shipped. `introducedInVersion` (if ever needed) stays metadata-only, exactly as in D.1.

### 5. The D.1 → D.2 transition is **append-only** — execute on fresh, import-baseline on existing

This is the load-bearing decision; the rest is mechanics. **The monolithic `framework` bundle is decommissioned from the apply path** — it is *not* a D.2 source. The same migrate run must do the right thing for two starting states, distinguished by the **presence of `framework/*` rows in the ledger** (validated as the detection key in the spike):

- **Fresh D.2 database (no `framework/*` rows):** execute each package's baseline + increments normally (`applyMigrations`), recording `<source>/<tag>` per package. The old bundle never runs — fresh databases get their schema entirely from package sources (proven schema-equivalent to the bundle in the spike).
- **Existing D.1 database (has `framework/*` rows):** the historical schema is already materialised under the monolithic `framework` source. Run the **parity guard first** (the D.1 `assertSchemaAtBaseline` pattern — every expected table/column present, every dropped table gone), then **`importBaseline()` the bundle-covered per-package baseline rows *without executing their SQL*** (`importBaseline` already records rows `ON CONFLICT DO NOTHING`). The old `framework/*` rows are **kept as audit history and never rewritten**; package increments that postdate the bundle apply normally on top.

**The baseline cutline (surfaced by the spike).** "Bundle-covered" is not inferable — each package must **declare which of its migrations the retired bundle already materialised** (the spike models this as a per-package `baselineTags` set; production likely ships it as a manifest the bundle generator emits, naming the package/tag pairs the last monolithic bundle contained). On an existing D.1 database the collector import-baselines exactly those tags and **executes everything after the cutline**; on a fresh database the cutline is irrelevant. Without this declaration the collector cannot distinguish "already created by the bundle" from "genuinely new" and would either re-create (collision) or skip new DDL. This is a hard input to Required Slice 1.

Why this resolves the conflict the naïve umbrella model could not (each point validated by a spike scenario):

- Packages **do** ship historical baselines (Decision 1) → fresh subset databases can build historical tables. ✔ (spike S1/S6)
- Existing D.1 databases **import-baseline** those baselines instead of executing them → **no duplicate DDL**; verified by stable table OIDs (nothing re-created). ✔ (spike S2)
- Naively executing a bundle-covered baseline on an existing DB raises `duplicate_table` → import-baseline is *required*, not optional. ✔ (spike S3, negative control)
- No applied ledger row is ever re-keyed → the immutability law is never tripped. ✔

**Corollary — no incremental single-package pilot.** Because the frozen bundle creates every standard table with bare `CREATE TABLE` and `0000` is immutable, a package cannot be moved to its own source *while the bundle still owns it* (a fresh DB would double-create; carving it out of `0000` would emit a `DROP`). D.2 is therefore an **all-standard-packages-at-once** flip that decommissions the bundle in the same change. The spike — not a production single-package rollout — is the de-risking vehicle.

### Why a blind re-key is wrong (correcting the immutability claim)

It is tempting to say "the content-hash immutability guard prevents re-keying." **That is not what the guard does.** `MigrationImmutabilityError` fires only when the *same* `(source, tag)` reappears with a *different* `content_hash`. Because the ledger primary key is `(source, tag)`, renaming a source (`framework/0003_x` → `catalog/0003_x`) produces a **new key the collector has never seen**, so the migration looks **unapplied** and `applyMigrations` **re-executes its SQL** — duplicate `CREATE TABLE`/`CREATE INDEX`/`CREATE TYPE` against tables that already exist. The failure mode is duplicate-DDL, not an immutability error. This is precisely why Decision 5 *import-baselines* (records without executing) rather than re-keying.

### 6. Module removal: fresh-subset is in scope; live uninstall is its own capability

- **Fresh subset selection (in scope):** a deployment that never mounted module X simply has no X source in its closure. Nothing to drop. ✔
- **Live uninstall of an already-applied module (out of scope for v1, specified here so it isn't assumed):** dropping a module from a live database requires teardown DDL, and that DDL is **deployment-owned, not package-owned** — a package cannot know which deployments installed it, and removing FK-bearing tables can break the deployment's own link migrations. If/when live uninstall is taken on, it needs: (a) deployment-authored drop migrations in the deployment-local source (which already sorts last), (b) prior teardown of cross-module link rows/tables that FK into the departing package, and (c) a guard that refuses to drop a package whose tables are still referenced. v1 explicitly supports **additive** evolution + **fresh subset** only.

### 7. Oracle: aggregate replay across N sources, and CI must fail closed

`verify-migration-replay-parity.mjs` becomes the cross-source drift detector for N package sources. It must (not "should"):

1. **Enumerate** the resolved package sources + the deployment source and log the list (silent under-enumeration is itself a failure).
2. **Seed required extensions** (`pg_trgm`, `unaccent`) on the push DB.
3. Apply all sources onto a fresh DB and `drizzle-kit push` the aggregate schema onto another.
4. Assert **non-empty, plausible counts on both sides** (tables/columns/indexes/constraints within an expected floor) *before* trusting equality, then assert **fingerprint equality**.
5. **Fail the CI job if the DB-backed oracle cannot run at all** (no skip-as-pass). The oracle is the only thing that catches per-source drift; a green build with a skipped oracle is a false negative.

The "fail closed" requirement is a direct lesson from the 2026-06-20 postmortem below: a silently-skipped or empty-DB oracle reads identical to "everything passed."

## Required implementation slices — SHIPPED

These kept package-owned history *trustworthy* and were part of acceptance:

1. **Per-package generation + staleness gate + baseline cutline.** ✅ Each schema-owning package has a `drizzle.migrations.config.ts` + a `db:generate` (chaining `guard-create-type` + `ensure-extensions`) emitting into its `migrations/`. The cutline manifest lives in `@voyant-travel/framework-migrations/cutline.generated.json`, generated from the package folders by `scripts/d2/generate-cutline.mjs` with a semantic drift gate (`verify:d2-cutline`).
2. **Per-package replay/parity.** ✅ `scripts/d2/verify-package-baseline.mjs` proves each package's `migrations/` reconstitutes its own tables column-for-column vs the bundle (closure-aware), and `--union` proves all sources apply together *and* every bundle table is owned by some source (**reverse-coverage**).
3. **Publishing contract.** ✅ Each onboarded package's `files` includes `migrations/*.sql` + `migrations/meta/_journal.json`; the loader contract is `loadMigrationFolder` from `@voyant-travel/framework-migrations`.

## Decommission (slice 3c) — only two D.1 deployments

There is **no long tail of D.1 databases in the wild**: exactly two deployments ran the D.1 collector, and both are source-controlled by us. So the bundle + cutline + dual-path are a **short-lived transition artifact**, not permanent infrastructure — we deliberately do **not** build a freeze-forever oracle or reframe the equivalence gates around an evolving cutline.

**What happened (done 2026-06-20):**
1. ✅ Both deployments cut over: the EXISTING path import-baselined the cutline (eturia 26 / protravel 66 baselines, 0 executed), validated first on isolated Neon branches. Their ledgers now carry `<package>/<tag>` rows; `framework/*` (eturia) and legacy `__drizzle_migrations` (protravel) are inert history.
2. ✅ **The cutline is FROZEN, not deleted.** Correcting the original plan: the cutline and the EXISTING/import-baseline path are **not** removable. A transitioned deployment stays permanently "existing" (its `framework/*` / legacy rows persist), so every future run takes the EXISTING path; and a NEW package migration must fall OUTSIDE the frozen cutline so the collector EXECUTES it (adding it to the cutline would make those deployments skip its DDL forever). `scripts/d2/generate-cutline.mjs` no longer regenerates-and-compares — it asserts the frozen cutline's tags still exist and lets post-cutline increments through.
3. ✅ **Bundle decommissioned from the gates** (kept frozen on disk as the completeness oracle + transition-test seed, not deleted): the `verify:framework-migration-bundle` staleness gate is removed from `verify:architecture` (it regenerated the bundle and would force it to grow as packages evolve), and `verify-package-baseline.mjs` now scopes its bundle comparison to **cutline-covered** migrations (a post-cutline increment correctly diverges from the frozen bundle) while still applying *all* sources for the collision check.

**Package evolution now works:** adding a new package migration is a post-cutline increment — it executes on every database (fresh and transitioned), is excluded from the bundle comparison, and is never absorbed into the cutline.

## Open questions (genuine unknowns to resolve before/with implementation)

1. **Tie-breaker stability.** Config-array order is the tie-breaker among independent packages (Decision 3). Confirm it is stable enough, or whether a lexical sort on source name is preferable for reproducibility.
2. **Cutline manifest source of truth.** The baseline cutline (Decision 5) must be generated from the *actual* final monolithic bundle and frozen — settle where it lives (a file in `@voyant-travel/framework-migrations`? per-package metadata?) and how CI proves it matches what the bundle shipped, so it can never silently drift.
3. **Parity-guard granularity for partial baselines.** D.1's guard checks the whole net schema; per-package import-baseline may want a per-package parity assertion so a partially-converged DB is rejected per-source rather than wholesale.
4. **Live uninstall demand (Decision 6).** Is additive + fresh-subset sufficient for foreseeable deployments, or is live module removal a near-term requirement that should be scoped now rather than deferred?

*(Resolved by the spike: the dual-path detection key, import-baseline-without-execute, topo-ordering, and the need for a baseline cutline. ADR-original Open Question 2 — a single-package production pilot — is retired by the no-incremental-pilot corollary in Decision 5.)*

## Postmortem note (why this ADR is being written now)

Validating the D.1 single-folder collapse (2026-06-20) surfaced that the replay-parity oracle had been silently comparing against an **empty** push database: `drizzle.config.ts` loaded `.dev.vars` with `override: true`, clobbering the `DATABASE_URL` the oracle injected, so `drizzle-kit push` ran against a non-extension DB, aborted on a `gin_trgm_ops` index, and **exited 0**. Fixed by making an explicit `DATABASE_URL` win (`fix(operator): explicit DATABASE_URL must win over .dev.vars`). The lesson is encoded in Decision 7: the oracle must fail closed and assert real counts, because per-source drift detection is the only safety net D.2 has.

## Graph deployments: custom module migrations (voyant#3069)

A **source-free managed image** (`voyant-runtime:<framework-version>`,
platform#953/#954) runs migrations with **no drizzle-kit generation** and no
generated schema-path list — so `discoverMigrationSources` (which maps schema
paths → package roots) doesn't apply. The managed booter instead knows only the
module package **names** the profile snapshot declares.

Two source kinds:

- **Standard-profile modules** — already baked into the shipped **framework
  bundle** (`loadFrameworkBundleSource`, priority 0). No per-module work.
- **Custom (bring-your-own) schema-owning modules** — declared under the
  snapshot's `customSource.modules`. Each such package **ships its own committed
  drizzle `migrations/` folder** (Option 1: pre-built, predictable — no
  per-build generation), exactly as standard packages already do (`bookings`,
  `finance`, … each ship `migrations/meta/_journal.json`).

Resolution + ordering:

- `loadModuleBundleSource(packageName, { priority, resolveFrom })`
  (`@voyant-travel/framework-migrations`) resolves the package's root by name and
  loads its `migrations/` as a `MigrationSource`, or `null` when it ships none (a
  schema-less module/plugin — skipped). The ledger source name is the unscoped
  package name, stable across source and managed modes.
- `collectDeploymentMigrationSources({ modulePackages, resolveFrom })` returns
  `[framework(0), ...customModules(1..n)]` deps-first — hand straight to
  `runDeploymentMigrations`.
- `getVoyantProjectMigrationMetadata(project)` now returns
  `moduleSources: { packageName, priority }[]` derived from
  `customSource.modules`, so the platform booter enumerates the packages to load
  without a build artifact.

Plugins that own no schema (e.g. `@voyant-travel/plugin-netopia`) are unaffected —
they define no `pgTable` and ship no `migrations/`, so they resolve to `null` and
need no migration step. Unblocks Slice 4 of platform#1016.

## Explicit adoption of materialized post-cutline migrations

An existing deployment may contain DDL from a package migration even when the
collector ledger does not contain that exact `(source, tag)` row. This can occur
when a legacy deployment materialized package schema outside the collector. The
runner does not infer or broadly baseline such rows.

`runDeploymentMigrations` accepts an explicit
`materializedMigrationAdoptions` allowlist of exact source/tag identities. While
holding the deployment migration session advisory lock, it classifies every
pending allowlisted identity before a normal migration can commit:

- if every table created by the immutable SQL is absent, the migration stays on
  the normal execution path;
- if any table is present, the full footprint must match exactly: ordinary
  permanent table identity, column sets/order, PostgreSQL type, nullability,
  default, identity/generated state, named primary/unique/foreign-key
  constraints and their actions, and non-constraint index names, validity,
  readiness, uniqueness, method, keys/expressions and predicates;
- a partial or mismatched footprint aborts without a ledger write or migration
  transaction;
- an exact footprint is recorded with the current immutable SQL content hash and
  reported through both `adopted` and the existing `baselined` result/hook.

An allowlist entry may instead name an exact `tables` subset when only part of a
migration was materialized. The verifier selects the `CREATE TABLE`, owned
`ALTER TABLE` constraint, and owned `CREATE INDEX` statements for those tables
and proves that selected footprint against the PostgreSQL catalogs with the same
strict comparison used for whole-migration adoption. It then skips only those
verified statements and executes every remaining migration statement inside the
normal migration transaction. After that transaction succeeds, the collector
records the migration's original, complete immutable SQL content hash. The
migration therefore appears in both `executed` (because its remaining SQL ran)
and `adopted` (because selected DDL was already present); it is not reported as
`baselined`. An empty `tables` list, an unknown table name, a table without a
supported `CREATE TABLE` statement, or any unsupported or mismatched selected
DDL fails closed before execution or a ledger write.

Fresh databases always execute from scratch. Migrations not named in the
allowlist are never considered for materialized adoption. The verifier supports
only DDL forms it can prove from PostgreSQL catalogs and fails closed for an
unsupported allowlisted migration.

## Renaming a schema-owning module (voyant#4143)

A module rename is not a source rename. When `quotes` became `proposals` its
five `quotes/*` tags were replaced by one `proposals/0000_proposals_baseline`
declaring the same tables under new names — and the rename was additionally
applied by **editing** already-shipped migrations owned by other sources in
place. On a database provisioned before the rename that produces two distinct
failures, and both guards were doing their job:

- the edited files trip `MigrationImmutabilityError`;
- `proposals/0000_proposals_baseline` is unknown to the ledger, so it is either
  parity-gated (its tables do not exist under the new names) or executed (which
  collides with the live legacy tables).

`legacySources` does not solve this. It maps a **source name** onto the same
tag, and a rename changes the tags too.

The supported shape has three parts, and none of them may be used alone:

1. **Supersession.** `SUPERSEDED_LEDGER_IDENTITIES` in the collector declares
   that a migration replaces an exact set of retired `(source, tag)` rows. When
   **every** one is present in the ledger the migration is RECORDED without
   executing, and `withoutUngatedMigrations` keeps it out of the parity gate.
   The condition is all-or-nothing: a partially-migrated legacy source is not at
   the shape the superseding migration declares, so the run must fail loudly
   rather than record a false baseline.
2. **An adoption increment per owning source.** Each source that owns renamed
   objects ships a post-cutline migration that RENAMES them in place — tables,
   columns, constraints, indexes, enum types and enum labels — guarded on the
   legacy name being present and the new name being free, so it is a no-op on a
   database provisioned after the rename and on a re-run. Renaming preserves
   rows, foreign keys and enum-label OIDs (so column defaults follow); creating
   and copying would not. Values stored as plain TEXT (a discriminator column, a
   permissions map key) are NOT reached by an enum relabelling and need their
   own guarded `UPDATE` in the owning package.
3. **Hash equivalence for the edited files.** Only sound *because* (2) exists.
   Equivalence marks a migration applied, so on its own it would leave the
   database on the old names while the application queries the new ones.

Append-only history that is deliberately left alone: `action_ledger_entries`
records past `action_name`/`target_type` values under the vocabulary in force
when they happened, and legacy delivery-request rows carry a `legacy.*` command
scope no live command looks up. Rewriting either would falsify a record rather
than migrate state.

`scripts/verify-migration-replay-parity.mjs` proves the whole thing: its
pre-rename lane replays the package history as it shipped before the rename
(fixtures under `scripts/fixtures/pre-proposal-rename/`) plus the adoption
increments, and fails unless the result matches a fresh replay column-,
enum-, index- and constraint-for-constraint.

## References

- `docs/architecture/migration-collector-d1.md` — the collector primitive + ledger D.2 reuses; the `assertSchemaAtBaseline` parity pattern.
- `docs/architecture/consolidated-deployments-rfc.md` — Workstream D.
- `docs/architecture/migration-resilience-rfc.md` — `voyant.requiresSchemas` closure + the original ordering model D.2 supersedes.
- `docs/architecture/custom-modules.md` — the `src/modules` seam D.2 generalizes.
- `packages/framework-migrations/src/collector.ts` — `planMigrations` / `applyMigrations` / `importBaseline`; ledger PK `(source, tag)`; `MigrationImmutabilityError` (unchanged by D.2).
- `scripts/check-retail-spine-closure.mjs` — existing consumer of the `voyant.requiresSchemas` DAG.
- `spikes/d2-migration-collector/` — the throwaway harness validating the transition (fresh vs existing, import-baseline, topo order, cutline). See its README for the scenario list.
