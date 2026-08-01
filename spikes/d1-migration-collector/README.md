# Spike: D.1 framework-owned migration bundle + multi-source collector

**RFC:** `docs/architecture/consolidated-deployments-rfc.md` → Workstream **D.1**.
**Status:** PASS (7/7) against Postgres 16 (docker test DB). Throwaway harness.

## The question

The whole "deployments aren't forks; upgrade by bump + migrate" thesis rests on one
unproven assumption: a deployment can apply a **framework-shipped** migration bundle
(not regenerated in the fork), then layer its **own** migrations after, cleanly. This
spike retires that risk before any of the heavy work (`createOperatorApp`, packaging)
is committed.

## What it proves (run `TEST_DATABASE_URL=<throwaway-postgres-url> node spikes/d1-migration-collector/run.mjs`)

A multi-source collector with **one ledger** keyed by `(source, tag, content_hash)` —
deliberately **version-independent** (a re-shipped historical migration resolves to the
same key, so an upgrade never re-runs old migrations):

| Scenario | Result |
| --- | --- |
| 1. Fresh apply — framework bundle, then deployment | applies in `framework → deployment` order; both tables exist |
| 2. Idempotent re-run | applies nothing |
| 3. Framework upgrade ships a new migration | applies **only** the new one |
| 4. An already-applied shipped migration is edited | **hard error** (content-hash immutability) |
| 5. Ordering is load-bearing | deployment FK into a framework table resolves *only* because framework applied first |

These are exactly the properties D.1 needs, and they hold on plain Postgres with a plain
SQL runner — no ORM magic required. The mechanism is sound.

## What it deliberately does NOT prove (the remaining D.1 work — plumbing, not uncertainty)

1. **Packaging.** drizzle-kit generating the standard-profile aggregate bundle and shipping
   it inside `@voyant-travel/framework` (or a `@voyant-travel/framework-migrations`). The
   spike hand-writes the SQL; production generates it from the aggregate schema
   (`drizzle.schemas.generated.ts`) exactly as the fork does today — only the *owner* changes.
2. **Journal-format migration.** The spike uses its own `_voyant_migrations` ledger. The real
   runner (`apps/operator/scripts/migrate.ts`) reads drizzle's `migrations/meta/_journal.json`.
   D.1 extends that single-folder journal to a multi-source ledger; this spike shows the target
   shape, not the migration from the current one.
3. **Aggregate replay oracle.** Production should keep `drizzle.schemas.generated.ts` and assert
   that replaying all collected migrations onto a fresh DB equals the aggregate-schema snapshot
   (catches cross-source drift). Not modeled here.
4. **Profile divergence.** The bundle is generated from a *fixed* standard-profile aggregate. A
   deployment that adds/removes modules diverges from it — that's the D.1 limitation that gates
   D.2 (package-owned migrations). Out of scope for the spike.

## Ordering caveat surfaced by the spike (worth deciding in the D ADR)

Within a single run, order is `framework-first, then deployment`. But on **upgrade**, a *new*
framework migration (scenario 3) applies **after** a deployment migration that was applied in an
earlier run — the ledger only tracks what's already applied, and DDL is forward-only, so this is
correct and safe. The "deployment migrations anchored last" rule holds *per run*, not as a global
invariant across the whole history. The ADR should state this explicitly so nobody assumes
deployment migrations are always last in absolute order.

## Verdict

The risky core of D.1 is **validated**. The remainder is well-understood plumbing (generate the
bundle into a package, migrate the journal format, add the replay oracle). D.1 is a safe
investment; `createOperatorApp` (Phase 2) can proceed once the team confirms the BOM (Workstream A)
and the migration ADR direction.
