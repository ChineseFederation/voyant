-- Rename the trip tables named after the retired storefront entity (voyant#4624).
--
-- Pure renames: no column, index or constraint changes beyond the names
-- themselves, and no data movement. `ALTER TABLE ... RENAME` preserves the rows,
-- the primary key, the unique constraint on `capability_digest` and every
-- foreign key, so live capabilities keep resolving across the upgrade.
--
-- The index renames have to travel WITH the table renames, not in a later
-- migration: a deployment that applied only half of this would carry indexes
-- whose names no longer match what the Drizzle declaration asks for, and the
-- next `drizzle-kit generate` would try to drop and recreate them.

ALTER TABLE IF EXISTS "trip_storefront_access" RENAME TO "trip_public_access";
ALTER INDEX IF EXISTS "idx_trip_storefront_access_scope" RENAME TO "idx_trip_public_access_scope";
ALTER INDEX IF EXISTS "idx_trip_storefront_access_owner" RENAME TO "idx_trip_public_access_owner";
ALTER INDEX IF EXISTS "idx_trip_storefront_access_expiry" RENAME TO "idx_trip_public_access_expiry";

ALTER TABLE IF EXISTS "trip_storefront_booking_operations"
  RENAME TO "trip_public_booking_operations";
ALTER INDEX IF EXISTS "idx_trip_storefront_booking_operations_envelope"
  RENAME TO "idx_trip_public_booking_operations_envelope";

-- Postgres does NOT rename constraint-backed indexes when the table is renamed,
-- so the primary keys and the unique constraint keep the old table's name until
-- they are renamed explicitly. Drizzle derives those names from the table
-- (`<table>_pkey`, `<table>_<column>_unique`), so leaving them would make a
-- fresh replay and an upgraded database disagree — which is exactly what
-- verify:migration-replay-parity compares.
ALTER INDEX IF EXISTS "trip_storefront_access_pkey" RENAME TO "trip_public_access_pkey";
ALTER INDEX IF EXISTS "trip_storefront_access_capability_digest_unique"
  RENAME TO "trip_public_access_capability_digest_unique";
ALTER INDEX IF EXISTS "trip_storefront_booking_operations_pkey"
  RENAME TO "trip_public_booking_operations_pkey";
