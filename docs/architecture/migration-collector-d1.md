# ADR: D.1 — framework-owned aggregate migration bundle + multi-source collector

- **Status:** Superseded by D.2. The starter runner described below is historical;
  current projects execute the admitted graph plan through `voyant migrate`.
- **Date:** 2026-06-17
- **Amends:** `migration-resilience-rfc.md` (voyant#1608) "Migration generation & ordering" — *light amendment*, the single combined history is preserved; only **ownership** moves deployment → framework.
- **Implements:** `consolidated-deployments-rfc.md` Workstream **D.1**.
- **Validated by:** `spikes/d1-migration-collector/run.mjs` (7/7 on Postgres 16).
- **Does NOT supersede #1608.** D.2 (package-owned migrations) would; it is out of scope here and gated behind its own ADR.

## Context

Workstreams A–C + the operator-settings extraction made the *code* upgrade seamless: a standard deployment bumps `@voyant-travel/framework`, runs `voyant doctor`, and merges no framework-owned files. But the **database** still has an upgrade tax: today the **deployment owns and regenerates** the combined migration folder (`apps/operator/migrations/` + its `meta/_journal.json`) from the aggregate schema (`drizzle.schemas.generated.ts`). When a bumped module changes its schema, the fork must **regenerate migrations** — that regeneration *is* the merge-shaped upgrade tax this whole effort exists to remove.

Drizzle gives no cross-package migration discovery, so this is Voyant-specific work the reference framework gets free from its ORM.

## Decision

Move migration-history **ownership** from the fork to the framework, while keeping the **single, aggregate-generated history** #1608 defines.

1. **Framework ships the standard-profile bundle.** A package (`@voyant-travel/framework-migrations`) ships the aggregate migration bundle generated from the standard profile's `drizzle.schemas.generated.ts` — *exactly as the fork generates it today, only the owner changes*. (Bundle generation is a later slice; this ADR + the collector land first.)
2. **A multi-source collector applies sources in order.** A deployment applies the **framework bundle first**, then its **own** `migrations` (link tables, starter-local schema, custom). Order across sources is `(release-epoch → source priority → in-source sequence)`; for D.1's two sources, **framework-before-deployment** is the load-bearing invariant (deployment link tables FK into framework tables).
3. **One ledger, version-independent.** Applied migrations are recorded in a single `_voyant_migrations(source, tag, content_hash, applied_at)` ledger keyed by **`(source, tag)`** — never by version. A framework upgrade that re-ships historical migration files resolves to the **same** keys, so an upgrade never re-runs old migrations. `introducedInVersion` (if ever needed) is metadata only.
4. **Content-hash immutability.** A shipped migration is immutable once applied: if a `(source, tag)` already in the ledger arrives with a different `content_hash`, the collector **hard-errors** rather than silently diverging.
5. **Ordering is per-run, not a global invariant.** Within one run the order is framework-first. On a later upgrade, a *new* framework migration applies *after* deployment migrations that ran in an earlier run — correct and safe because DDL is forward-only and the ledger tracks only what's applied. (Surfaced by the spike; stated here so nobody assumes deployment migrations are globally last.)
6. **Aggregate replay as the oracle.** Keep `drizzle.schemas.generated.ts`. An aggregate-replay test applies **all** collected migrations onto a fresh DB and asserts equality with the aggregate-schema snapshot — catching cross-source drift per-source generation can't. (Later slice.)

## Transition (do not strand existing forks)

During the completed cutover, the legacy single-folder runner and the new collector
coexisted temporarily:

- **Baseline/import.** An existing deployment marks the framework migrations "through version X" as already represented in the new `_voyant_migrations` ledger (so the collector does not try to re-apply history the DB already has via the legacy ledger).
- **`voyant doctor` proves parity *before* switching runners** — replay/aggregate-schema parity must pass before a deployment flips from the legacy runner to the collector.
- Both paths stay green so no fork is stranded mid-cutover.

## Scope boundary (D.1 vs D.2)

D.1 is clean for the **standard profile** (a deployment mounting exactly the standard module set). A deployment that **adds/removes modules** diverges from the fixed aggregate bundle — it pins to the standard profile or moves to **D.2** (package-owned migrations + a topological collector), which *supersedes* the single-history model and needs its own ADR. D.1 deliberately does not solve arbitrary module subsets.

## Implementation slices

1. **Foundation (this ADR + the collector). ✓ landed.** `@voyant-travel/framework-migrations` exports the productionized multi-source collector — `planMigrations`, `applyMigrations` (the `(source, tag, content_hash)` ledger, per-migration transactions, statement-breakpoint splitting, content-hash immutability), `importBaseline`, + `loadMigrationFolder`. Integration tests reproduce the spike's scenarios + baseline against Postgres.
2. **Bundle generation. ✓ landed.** Generate the standard-profile aggregate bundle into the package from `drizzle.schemas.generated.ts`; a `verify:` gate keeps it in sync.
3. **Replay-parity oracle. ✓ landed.** `bundle + links` fresh-applied == `drizzle-kit push` of the live aggregate schema (the canonical current schema — see the Cutover section for why this replaced the legacy-replay target).
4. **Cutover. ✓ landed.** The retired project runner drove the collector
   (framework bundle → deployment links) with auto-detected FRESH / BASELINE /
   INCREMENTAL modes; baseline was gated by a schema-parity guard.

The risky core (multi-source apply, idempotency, ordering, immutability, baseline) is **validated** against the operator docker Postgres.

## Cutover (slice 4) — RESOLVED

**Status: done.** `migrate.ts` is cut over to the collector; the oracle is green against a real canonical schema. The path below records *why* the obvious comparison (replay the legacy folder) is invalid, and what replaced it.

### Why the legacy folder is not a valid canonical source (measured 2026-06-17)

The slice-3 oracle proved `bundle + links` **applies cleanly to a blank DB**, but the original plan — compare it against a fresh *replay of the legacy folder* — is unsound. Measured against the operator's docker Postgres (a real 60-migration deployment) and a table-level diff of the bundle vs. the legacy folder:

1. **The legacy folder is INCOMPLETE.** 16 tables in the live schema have **no CREATE migration at all** — the entire `operations/ground` module (`ground_dispatches`, `ground_drivers`, `ground_vehicles`, `ground_transfer_preferences`, …) and proposal versioning (`proposal_versions`, `proposal_version_lines`, `proposal_participants`, `proposal_products`). On real deployments these exist only because of `drizzle-kit push`. A dangling `ALTER TABLE "ground_transfer_preferences" …` in `20260613120000_places_loose_ids` then fails on any migration-only run — which is exactly **why every dev DB is stuck at migration 60**.
2. **The legacy folder is STALE.** ~40 CREATEs are for retired tables: `orders`/`offers`/`opportunities`/`order_*`/`offer_*`/`transaction_*` (dropped by `0068`), and `crm_*_products` link tables (superseded by `relationships_*`). The bundle correctly omits them.
3. **It is also NON-FRESH-REPLAYABLE.** `0068_retire_transactions_runtime` does `DROP TABLE "orders"` without `CASCADE` while `payment_sessions`/`payment_authorizations` still FK in — it only ever succeeded because real DBs applied it out of journal order. The earlier "`accommodations_sourced_content` drift" finding was a **false positive** (it *is* migrated by `0023` via `CREATE TABLE IF NOT EXISTS`); the real, much larger drift is (1).

A folder that is simultaneously missing 16 live tables and carrying ~40 dead ones cannot be the schema the bundle is checked against.

### The canonical schema, and the green oracle

`drizzle-kit push` of the **same aggregate schema the bundle is generated from** IS the canonical current schema — it is *exactly* how production materialised the un-migrated drift tables (1). So the oracle (`scripts/verify-migration-replay-parity.mjs`) now:

1. provisions a throwaway DB, seeds `pg_trgm`/`unaccent`, and `drizzle-kit push`es the live aggregate schema → **ground truth**;
2. applies `bundle + links` to a second throwaway DB;
3. asserts the two `public`-schema fingerprints are identical.

Measured equal on 2026-06-17: **339 tables / 4371 columns / 1295 enum labels / 1816 indexes / 3089 constraints, zero diffs.** `bundle + links` reconstitutes the live schema exactly, so it is a faithful squashed baseline.

### The runner: three auto-detected modes + a baseline guard

The now-retired D.1 project runner drove the collector
(`@voyant-travel/framework-migrations`), sources `[framework bundle (priority 0),
deployment links (priority 1)]`, ledger `drizzle._voyant_migrations`:

- **FRESH** (no ledgers) → execute bundle + links.
- **BASELINE** (legacy `drizzle.__drizzle_migrations` present, no collector ledger) → `importBaseline()` records the bundle + links in the ledger **without re-executing** — because the schema is already materialised. **Gated by a schema-parity check**: every table the bundle/links expect must already exist; otherwise the runner *refuses* (a stuck-at-60 DB reports the missing tables and aborts rather than recording a false baseline).
- **INCREMENTAL** (collector ledger present) → apply only new migrations.

The legacy `apps/operator/migrations/` folder is **retired** as a runtime source (kept only as history); it is neither applied nor used as an oracle target. An existing *current* deployment baselines cleanly; a *stuck* deployment must converge its schema (via `db push` for the never-migrated drift tables) before it can baseline — the guard enforces this.

All validated against the operator docker Postgres: FRESH (executes → 339 tables, 2 ledger rows), INCREMENTAL (no-op), BASELINE success (imports without re-creating), BASELINE guard (refuses a 60-migration DB, lists missing tables, leaves no ledger).
