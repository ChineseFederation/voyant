# @voyant-travel/framework-migrations

## 0.10.8

### Patch Changes

- abff5e0: Allow a deployment to verify and adopt selected materialized table DDL while executing the remainder of the migration atomically under its original content hash.

## 0.10.7

### Patch Changes

- 43cc48b: Accept both shipped hashes of the formatting-equivalent action-ledger baseline migration.

## 0.10.6

### Patch Changes

- 42593c6: Tighten materialized migration adoption with fail-closed table identity, index state, and string-literal comparisons.

## 0.10.5

### Patch Changes

- ced3987: Add opt-in exact-footprint adoption for explicitly identified materialized migrations.

## 0.10.4

### Patch Changes

- 96db030: Execute a newly added migration source from the beginning when an existing
  deployment has no ledger lineage or schema footprint for that source. Partial
  or previously recorded sources remain protected by the import-baseline parity
  gate.

## 0.10.3

### Patch Changes

- e042457: The import-baseline parity gate now checks only cutline entries the run is about to record: once an entry is in the ledger, applied post-cutline migrations may legitimately have reshaped or dropped its objects, and re-asserting the cutline-era schema on every run wedged partially-adopted databases forever.

## 0.10.2

### Patch Changes

- 9bf0b26: Make `db/0001_db_baseline`'s `user_profiles.permissions` column replay-safe (`ADD COLUMN IF NOT EXISTS`) and register the rewritten content hash as equivalent: the frozen framework bundle also materialises the column, so adopted managed databases replay the migration against an existing column and fail with 42701.

## 0.10.1

### Patch Changes

- 70a39fc: Register the rewritten `framework/0004_framework_baseline` (guarded `custom_field_values` drop → plain `DROP TABLE IF EXISTS`) as hash-equivalent to the original, so databases that applied the 0.9.x bundle don't fail the immutability gate on upgrade.

## 0.10.0

### Minor Changes

- 52352c4: Remove project-local TypeScript custom-field declarations, discovery globs,
  executable validation callbacks, and code/database merge helpers. The generic
  custom-fields package now owns canonical value routes and dispatches operations
  to selected entity-owning packages through typed runtime contributions, with no
  Relationships compatibility adapter.

## 0.9.0

### Minor Changes

- 46e7edf: Add the validated resolved-graph export bundle and deterministic self-host
  projection contract, including provider remaps, provisioning diagnostics,
  standard Node starter metadata, and a shared migration-journal lineage.

## 0.8.1

### Patch Changes

- 8d62a7c: Republish every affected TypeScript package without broken declaration maps so the corrected artifact
  policy reaches npm instead of applying only to future incidental package releases.

## 0.8.0

### Minor Changes

- 490d132: Remove the final snapshot-era managed-profile aliases from the admin and migration package surfaces. Admin hosts now consume `AdminAuthRuntime`, `getAdminApiUrl`, and `adminFetcher`; deployment migration collection is exposed as `collectDeploymentMigrationSources`.

### Patch Changes

- cda53b6: Preserve legacy migration and route behavior in the unified Node host, align generated admin assets with their graph artifacts, restore auth email and media compatibility, and publish the selected-graph OpenAPI entry.
- 490d132: Provide validated subscription mutations, durable projected webhook enqueue, restart-safe payload storage, and one claim-driven signed, retrying, audited delivery worker.

## 0.7.2

### Patch Changes

- 682d7d0: Publish `voyant.package.v1` compatibility metadata from graph substrate packages
  and allow package metadata records to distinguish framework and library packages
  from selectable modules and plugins.

## 0.7.1

### Patch Changes

- c5d4b20: Harden the managed custom-module migration path (voyant#3069 follow-ups).

  - `loadModuleBundleSource` now resolves ESM-only ("import"-only `exports`)
    packages. `require.resolve` applies the CommonJS `require` condition and throws
    `ERR_PACKAGE_PATH_NOT_EXPORTED` for import-only packages (the repo's publish
    shape), which silently skipped a schema-owning package's committed
    `migrations/`. It now falls back to a `node_modules` package-root walk that
    ignores export conditions when `require.resolve` rejects.
  - `customSource` is now validated: `validateVoyantProject` rejects a non-object
    `customSource` or a non-string-array `customSource.modules`/`.extensions`, and
    `getVoyantProjectMigrationMetadata` defensively coerces the value before
    deriving migration sources — so a malformed snapshot (e.g. a string instead of
    an array) no longer yields one "package" per character.

## 0.7.0

### Minor Changes

- b9f3608: Give source-free managed images a migration path for custom schema-owning
  modules (voyant#3069, Option 1 — modules ship pre-built migrations).

  A managed image runs migrations with no drizzle-kit generation, so a custom
  "bring-your-own" module that owns schema previously had no way to create its
  tables. It now does, following the same per-package `migrations/` convention
  standard packages already use.

  `@voyant-travel/framework-migrations`:

  - `loadModuleBundleSource(packageName, { priority, resolveFrom })` — resolve a
    module package's committed `migrations/` folder by name into a
    `MigrationSource`, or `null` when it ships none (schema-less modules/plugins
    are skipped). Ledger source name is the unscoped package name, stable across
    source and managed modes.
  - `collectManagedMigrationSources({ modulePackages, resolveFrom })` — the
    managed migration path: `[framework, ...customModules]` deps-first, ready for
    `runDeploymentMigrations`.

  `@voyant-travel/framework`:

  - `getVoyantProjectMigrationMetadata(project)` now returns
    `moduleSources: { packageName, priority }[]` derived from the snapshot's
    `customSource.modules`, so the platform migrate booter enumerates the custom
    schema-owning packages to apply after the framework bundle. Adds the
    `VoyantProfileModuleMigrationSource` type.

## 0.6.3

### Patch Changes

- 01346a6: Add the missing `cloud_auth_user_links.scopes` column to the shipped framework
  migration bundle so managed Cloud admin auth can persist Cloud-granted member
  scopes during sign-in and revalidation. The matching db-package migration now
  uses `ADD COLUMN IF NOT EXISTS`, with a narrow collector hash compatibility
  exception for deployments that already recorded the original equivalent
  migration. The package-baseline oracle also keeps its bundle comparison pinned
  to the frozen D.2 cutover bundle so post-cutline framework increments do not
  make fresh-package union checks compare against schema they intentionally
  exclude.

## 0.6.2

### Patch Changes

- 6c1d9bc: Run a compatibility preflight before the inventory product-days uniqueness migration so existing duplicate itinerary day numbers are deterministically renumbered before the unique index is created.

## 0.6.1

### Patch Changes

- 40036f5: Fix migration source discovery for schema manifests that contain `file://` URLs, so published starters resolve package-owned `migrations/` folders from installed `@voyant-travel` packages.

## 0.6.0

### Minor Changes

- c70e7b8: Clean up D.1/D.2 transition scaffolding from the migration collector's public API now that there's a single model.

  - **`applyD2Migrations` → `applyMigrations`** (the one collector apply path). `cutline`/`existing` are now optional fields on `ApplyMigrationsOptions` — with neither, it simply executes every pending migration; with both, it import-baselines the cutline on an existing DB. Returns `{ executed, baselined }`.
  - **Removed** the now-redundant legacy `applyMigrations` (simple) + `importBaseline` + `ApplyD2MigrationsOptions` — the unified `applyMigrations` subsumes them.
  - Internal: `scripts/d2/` → `scripts/migrations/`; `verify:d2-*` → `verify:migration-*`; comments/test identifiers dropped the `D.1`/`D.2` labels.

  BREAKING: consumers of `applyD2Migrations`/`importBaseline` should call `applyMigrations`. The deployment-facing API (`runDeploymentMigrations`, `discoverMigrationSources`, `loadCutline`, `loadMigrationFolder`) is unchanged.

## 0.5.1

### Patch Changes

- 9cff1d9: D.2 parity-check correctness fixes (found validating real legacy→D.2 deployment transitions on Neon production-copy branches):

  - **`expectedSchema` now honors `ALTER TABLE … DROP COLUMN`** — a column added by an earlier migration and dropped by a later one (e.g. a deployment experiment later reverted) is no longer expected at baseline. Without this the import-baseline parity check demanded 31 columns that a deployment had deliberately dropped.
  - **`expectedSchema` now honors `ALTER TABLE … RENAME COLUMN`** — a renamed column is expected under its NEW name, not the original the baseline declared (e.g. a deployment that renames a package column).
  - The parity-failure error no longer recommends `drizzle-kit push` (unsafe in production); it explains that a behind database must reach the cutline via its normal migration path, or be dropped + FRESH-migrated if disposable, and clarifies that import-baseline only records the cutline — it never alters schema.

## 0.5.0

### Minor Changes

- 7b377bc: Export a portable D.2 deployment runner so any deployment (not just the monorepo operator) can adopt package-owned migrations.

  - `discoverMigrationSources(schemaPaths, { baseDir, deploymentMigrationsDir })` — resolves each package's shipped `migrations/` folder from the generated schema list, topologically ordered by `voyant.requiresSchemas`. Layout-agnostic: handles both the monorepo `…/packages/<dir>/…` paths and installed `…/node_modules/@voyant-travel/<name>/…` (incl. pnpm `.pnpm/…`) paths, so npm-consuming deployments resolve the same sources the operator does.
  - `runDeploymentMigrations(client, sources, cutline)` + `detectExisting` / `assertSchemaAtBaseline` / `expectedSchema` — the FRESH-vs-EXISTING dual-path engine (import-baseline the cutline on a pre-D.2 DB, gated by a schema-parity check), extracted from the operator so deployments share one tested implementation instead of copying it.

  The operator's `scripts/migrate.ts` now imports these from the package; its local copies were removed.

## 0.4.0

### Minor Changes

- 3acd772: Add the D.2 dual-path collector engine. `applyD2Migrations(client, sources, { cutline, existing })` applies per-package + deployment sources, import-baselining cutline-covered migrations on an existing database (record-without-execute) while executing fresh databases and post-cutline increments — the retired framework bundle's `framework/*` rows are left as inert history. `loadCutline()` reads the shipped `cutline.generated.json`. The operator migrate runner is rewired to use these in a follow-up.

### Patch Changes

- 435a5d1: Extract the availability domain into a new foundational `@voyant-travel/availability` package, and complete D.2 per-package migration onboarding for the last schema-owning packages.

  - **@voyant-travel/availability (new):** owns the `availability_*` schema (slots, rules, start times, holds, pickups, capacity) — previously buried in operations. Ships its own D.2 migration.
  - **operations:** its availability **services and routes stay**, now importing the schema from `@voyant-travel/availability` (the barrel re-exports it for runtime consumers); operations' migration no longer owns the availability tables. Fixes the module direction — bookings/operations/accommodations consume availability, rather than reaching into operations for an inventory primitive.
  - **bookings:** drops the hard cross-package FK from `booking_allocations.availability_slot_id` to `availability_slots` (it referenced a stale local duplicate); the column is now a plain indexed id per module decoupling. The refund workflow keeps a runtime-only reference to the availability table.
  - **framework-migrations:** bundle migration drops the removed FK constraint.

  All package sources verified column-for-column against the bundle and apply together cleanly on a fresh D.2 database (union).

## 0.3.1

### Patch Changes

- 84b9d4b: legal: remove cross-package foreign-key constraints from `contracts` and `contract_signatures` (`person_id → relationships.people`, `organization_id → relationships.organizations`, `supplier_id → distribution.suppliers`). These horizontal cross-module associations now follow the module-decoupling pattern — plain id columns + `defineLink` at the deployment (person/organization/supplier ↔ contract) + service-layer validation — instead of hard cross-package FKs. The `person_id`/`organization_id`/`supplier_id` columns and their indexes are unchanged; only the FK constraints are dropped. `createContract`/`updateContract` now validate that referenced person/organization/supplier ids exist (400 on a stale/mistyped id), preserving the integrity the FK used to enforce.

  framework-migrations: bundle migration drops the four legal cross-package FK constraints so the shipped bundle matches the decoupled schema. (The deployment migrate runner's baseline-import guard now also verifies dropped constraints are actually gone before importing — so existing deployments can't silently baseline this constraint drop without applying it.)

## 0.3.0

### Minor Changes

- a74471e: Add the new `quotes` columns + `quote_media` table to the standard migration bundle: `quotes.pax_count`, `quotes.created_by` / `quotes.updated_by`, `quotes.description`, and the `quote_media` table (quote images/attachments shown on the proposal).

## 0.2.0

### Minor Changes

- 76b18b5: Add `importBaseline(client, sources, options?)` — records a planned set of migrations in the `_voyant_migrations` ledger **without executing their SQL**, for cutting an existing deployment (whose schema is already materialised) onto the collector. Idempotent (`ON CONFLICT DO NOTHING`); the caller must verify schema parity first. The shared ledger DDL is factored into one `ensureLedger` helper used by both `applyMigrations` and `importBaseline`.

  This is the collector primitive behind the D.1 runner cutover (slice 4): `migrate.ts` now auto-detects FRESH (execute) / BASELINE (import) / INCREMENTAL (apply-new), with baseline gated by a parity guard. See `docs/architecture/migration-collector-d1.md`.

- 3fbff52: Ship the D.1 standard-profile aggregate migration bundle (Workstream D.1, slice 2). `@voyant-travel/framework-migrations` now includes the generated `migrations/` bundle (`0000_framework_baseline`) — the standard-profile aggregate schema (the operator reference profile's package-owned schemas, minus the deployment-local cross-module link tables) — and exports `loadFrameworkBundleSource()` / `frameworkBundleDir()` to load it as the `framework` collector source (priority 0).

  The bundle is incremental: `0000` is frozen; a standard-schema change appends `0001…` (never rewrites `0000`, which would trip the collector's content-hash immutability guard). `scripts/generate-framework-migration-bundle.mjs` generates it (from the operator reference config) and gates drift via `verify:framework-migration-bundle` (added to `verify:architecture`) — a clean re-generate must be a no-op. This slice ships + verifies the bundle; it is not yet wired into a live runner (slice 4).

- 8a8737f: New package `@voyant-travel/framework-migrations` — the D.1 multi-source migration collector (Workstream D, foundation slice). Productionizes the validated `spikes/d1-migration-collector` approach:

  - `planMigrations` / `applyMigrations` — apply migrations across ordered sources (framework bundle first, then the deployment's own) via one **version-independent** ledger keyed by `(source, tag, content_hash)`. Idempotent re-runs, framework-first ordering, per-migration transactions, drizzle `--> statement-breakpoint` splitting, and **content-hash immutability** (`MigrationImmutabilityError` if a shipped migration changed after it was applied).
  - `loadMigrationFolder` — read a drizzle `migrations/` folder (`meta/_journal.json` + `*.sql`) into ordered statements.

  Transport-agnostic (takes an injected pg-compatible client; no `pg` dependency in the library). Integration tests reproduce the spike's 5 scenarios against Postgres (skipped when `TEST_DATABASE_URL` is unset). This slice does **not** change any live migration runner — see `docs/architecture/migration-collector-d1.md` for the ADR and the remaining slices (bundle generation, replay oracle, runner cutover).

### Patch Changes

- 04681f3: Adopt custom fields on `booking` — the first entity consumer of the `@voyant-travel/core/custom-fields` registry.

  - A `custom_fields jsonb default '{}'` column on `bookings` (framework bundle migration `0001`).
  - Booking create/update routes validate the `customFields` payload at the boundary against the deployment's injected registry (`validateBookingCustomFields`): unknown keys, missing required, and wrong types are rejected 400; only registry-approved values are persisted. Writes that carry `customFields` when the deployment declares none are rejected.
  - The registry is injected through `BookingRouteRuntimeOptions.customFields` → `createBookingsHonoModule` → a new optional `FrameworkProviders.customFields` provider, which a deployment supplies (the operator wires its discovered `operatorCustomFields`).

  Read paths return `custom_fields` as part of the booking row. Oracle-verified (`bundle + links == live schema`). Per-entity adoption continues with `person`/`product`; export/invoice/search consumption of `customFieldsVisibleIn` is a follow-up. See `docs/architecture/custom-fields.md`.

- 9c3fe53: Custom-fields unification (phase 2 — person/organization adopt the `custom_fields` column). Both `people` and `organizations` gain a `custom_fields jsonb default '{}'` column (framework bundle migration `0002`), and their create/update routes validate `customFields` at the write boundary against the resolved registry (code ∪ runtime `custom_field_definitions`):

  - `relationships`: `RelationshipsRouteRuntime(+Options).customFields` resolver; a `validateRelationshipsCustomFields(c, entity, data)` helper on the accounts route (its `Env` now exposes `container`); person/org writes persist the cleaned value.
  - `relationships-contracts`: `customFields` added to the person/organization core schemas.
  - `framework`: the relationships factory moves Tier 1 → 2 to receive `capabilities.customFields`.

  Values now live on the entity row for `booking`, `person`, and `organization`. Still ahead: repoint the EAV value API to the column + backfill `custom_field_values` → jsonb, then retire the side table. Oracle-verified (bundle + links == live schema).

- d29dd47: Custom-fields unification (phase 3a — `custom_fields` column on quote + activity). `activities` (relationships) and `quotes` gain a `custom_fields jsonb default '{}'` column (framework bundle migration `0003`), completing entity coverage for all four EAV entity types (person, organization, quote, activity) ahead of repointing the value API to the column. Additive — no behavior change yet. Oracle-verified.
- ce2a568: Custom-fields unification (phase 4a — retire `custom_field_values`). The EAV value side table is removed; values live solely on each entity's `custom_fields` jsonb column.

  - The table + its types/relations are dropped from the schema; the person/org merge flow now merges `custom_fields` (keeper wins) instead of value rows.
  - A **guarded** retirement migration (framework bundle `0004`) drops the table but **RAISES if it still has rows**, so a deployment that hasn't run the backfill fails the migration loudly instead of losing data. The backfill script gains `--clear` to copy values into the columns and then empty the table.

  **Upgrade order:** `tsx scripts/backfill-custom-fields.ts --clear` (copies + empties), then `voyant db migrate` (the guarded drop). Verified: guard refuses with rows, drops when empty; oracle balances.

- d9e5f8e: Correct the D.1 framework bundle so it applies cleanly to a blank database: include the `cruise_air_arrangement` enum (via the cruises barrel fix) and inject the `pg_trgm` + `unaccent` extension preamble that the standard schema's trigram/unaccent indexes need (drizzle-kit only auto-generates `postgis`). The bundle's `0000_framework_baseline` now applies end-to-end against Postgres.
- 1132d2a: Stop shipping drizzle-kit `meta/*_snapshot.json` files in the published package. The bundle loader (`loadFrameworkBundleSource` → `loadMigrationFolder`) only reads `meta/_journal.json` + the `*.sql` files at runtime; the per-migration snapshots are build-time drift-detection artifacts used only inside the repo. Narrowing `files` to `dist`, `migrations/*.sql`, and `migrations/meta/_journal.json` cuts the published package from ~9.8 MB unpacked (469 kB tarball) to ~0.53 MB (60 kB) with no runtime change.
