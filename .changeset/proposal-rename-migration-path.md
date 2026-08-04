---
"@voyant-travel/framework-migrations": patch
"@voyant-travel/proposals": patch
"@voyant-travel/relationships": patch
"@voyant-travel/custom-fields": patch
"@voyant-travel/bookings": patch
"@voyant-travel/legal": patch
"@voyant-travel/mice": patch
"@voyant-travel/db": patch
---

Give the quotes → proposals rename a migration path for existing deployments.

The rename was applied by editing shipped baselines in place, so every
deployment provisioned before it was blocked from upgrading:
`MigrationImmutabilityError` on the edited files, and
`proposals/0000_proposals_baseline` either failing the baseline parity gate or
colliding with the live `quote_*` tables.

The collector gains **supersession**: a migration may declare the exact retired
`(source, tag)` ledger rows it replaces, and is recorded rather than executed
when all of them are present. Each source that owns renamed objects now ships a
guarded adoption migration that RENAMES its legacy objects in place — tables,
columns, constraints, indexes, enum types and enum labels — preserving rows,
foreign keys and column defaults. Values stored as text rather than enums are
migrated too: `custom_field_definitions.entity_type`, `booking_origins`'
`accepted_quote_version`, and the `quotes` resource key in
`user_profiles.permissions` and `apikey.permissions`. Hash equivalence for the
eight edited files is declared only because those adoption migrations exist.

Every step is a no-op on a database provisioned after the rename and on a
re-run. `verify:migration-replay-parity` gains a lane that replays the
pre-rename package history and fails unless it converges on a fresh replay
exactly.
