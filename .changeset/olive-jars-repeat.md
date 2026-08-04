---
"@voyant-travel/framework-migrations": patch
---

Require the rename adoption increment before accepting a quotes → proposals
migration without executing it.

`SUPERSEDED_LEDGER_IDENTITIES` and `EQUIVALENT_MIGRATION_HASHES` both record a
migration as applied without running its SQL, and both are sound only because
the owning module ships a post-cutline increment that renames the legacy objects
into the new shape. Those two halves live in different packages, so a deployment
that assembles its own dependency graph can hold the framework side without the
module side — and then the baselines are recorded, nothing is renamed, and the
database keeps its `quote_*` objects while the application queries `proposal_*`.

The collector now checks that the required increment is in the plan and raises
`MigrationRenameCompanionMissingError` naming the skewed package when it is not.
Only the upgrade direction is gated; a rolled-back image verifying older SQL
against a newer ledger is unaffected.
