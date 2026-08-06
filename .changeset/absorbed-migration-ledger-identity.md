---
"@voyant-travel/framework-migrations": patch
"@voyant-travel/graph-contracts": minor
"@voyant-travel/framework": patch
"@voyant-travel/operations": patch
---

The retired ledger sources a package absorbed are declared in `package.json`, so
the source-free managed image can see them.

A module consolidation moves another package's migration tags under a new ledger
source name. The ledger is keyed `(source, tag)`, so a database that already
applied them looks for `availability/0000_availability_baseline` while the plan
offers `operations/0000_availability_baseline` — nothing matches, and the moved
baseline re-runs against the tables the retired package built.

`MigrationSource.legacyNames` is the mapping, and the previous release made it
authorable as `legacySources` on the graph migration facet. That declaration is
invisible to the managed image, which is **source-free**: it resolves a module by
package NAME, reads its committed `migrations/` folder, and never resolves a
graph. So every deployment carrying the retired history was blocked, and only
those — a fresh database has nothing to adopt, which is why CI did not see it.

The declaration therefore moves to package metadata, `voyant.legacyMigrationSources`,
next to `requiresSchemas` and for the same reason:

- `loadModuleBundleSource` reads it, so the managed runtime adopts the identities
  without a graph;
- `buildMigrationPlan` resolves it from the same package record, so the
  graph-driven plan reads one declaration rather than a second one that can drift;
- `VoyantGraphMigrationFacet.legacySources` is removed — a facet field that only
  half the callers can read is worse than none.

`verify:migration-cutline` now fails when a source the cutline manifest records
as absorbed is not claimed by the absorbing package, and when a claimed source
still ships its own migrations folder.

Unchanged: this is for a pure ownership move, where the tags carry over
byte-identical and their content hashes still match. Changed SQL is still
rejected.

Fixes voyant#4330.
