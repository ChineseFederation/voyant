---
"@voyant-travel/graph-contracts": patch
---

A migration facet may declare `legacySources`, the retired ledger source names it
absorbed.

The migration ledger is keyed `(source, tag)`, where `source` is the unscoped
package name. When one package absorbs another's migration history — a module
consolidation — the tags move to a new source name, so a database that already
applied them no longer finds them and re-runs their SQL against objects that
exist. `legacySources` names the retired sources, and the ledger lookup checks
all of them.

Additive and optional: `VoyantGraphMigrationFacet` extends
`VoyantGraphFacetEntity`, and a manifest that does not declare it behaves exactly
as before. The underlying alias already existed in
`@voyant-travel/framework-migrations` (`MigrationSource.legacyNames`); this makes
it authorable from a package manifest rather than only derivable.

This is for a pure ownership move, where the tags carry over byte-identical and
their content hashes still match. Changed SQL is still rejected — absorbing a
history is not a way past the immutability gate. A migration that supersedes
several retired tags with one new baseline is a different problem; see
`SUPERSEDED_LEDGER_IDENTITIES`.
