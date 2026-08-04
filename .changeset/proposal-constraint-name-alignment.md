---
"@voyant-travel/framework-migrations": patch
"@voyant-travel/proposals": patch
"@voyant-travel/mice": patch
---

Carry the proposal rename onto the constraint names it left behind.

`ALTER TABLE ... RENAME` renames a table, its columns and its indexes, but never
a constraint. The adoption migrations therefore moved every object the retired
module owned except the NOT NULL constraints PostgreSQL 18 catalogues one per
NOT NULL column — a deployment repaired by them kept 69 of those on the retired
vocabulary while a freshly provisioned one had them on the current one. Two
populations with equivalent but not identical schemas is precisely the condition
the rename came out of, and the next `DROP CONSTRAINT` written against a fresh
deployment is what would break on a repaired one.

The alignment increment DERIVES each target name the way PostgreSQL does —
`makeObjectName(table, column, 'not_null')`, shaving the longer of the two until
the result fits 63 bytes — so it lands the exact name a fresh provision holds,
including the truncated ones, and follows the tables if they are renamed again.
Older PostgreSQL does not catalogue these constraints at all, so it finds
nothing there. It also repairs one foreign key the adoption migration addressed
by a name longer than an identifier can be, which meant it addressed a name the
database never held.

`verify:migration-replay-parity` now fingerprints constraints from
`pg_constraint` with their NAMES rather than from
`information_schema.table_constraints` without them, which is what surfaces this
class of drift instead of relying on someone enumerating objects by hand. It
runs on PostgreSQL 18 as well as 16, because 18 is the only version on which the
NOT NULL names exist to be compared, and it now reports which of the two it saw.
