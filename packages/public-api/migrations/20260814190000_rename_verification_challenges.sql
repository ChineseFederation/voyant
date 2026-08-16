-- Rename the verification-challenge table off the retired storefront entity
-- (voyant#4624).
--
-- The challenges are the DEPLOYMENT's customer verification (email/SMS), not a
-- storefront's — the same reasoning that moved customer accounts to the
-- deployment. `customer_verification_challenges` sits beside
-- `customer_account_settings` and `customer_account_credentials`.
--
-- Pure rename: rows, primary key and every index survive. The index renames
-- travel WITH the table rename, because a deployment carrying half of this
-- would have indexes whose names no longer match the Drizzle declaration, and
-- the next generate would try to drop and recreate them.
--
-- Row ids keep their `svch_` prefix; newly minted ones get `cvch_`. The id is
-- opaque and rewriting it would invalidate every challenge in flight.

ALTER TABLE IF EXISTS "storefront_verification_challenges"
  RENAME TO "customer_verification_challenges";

ALTER INDEX IF EXISTS "idx_storefront_verification_channel"
  RENAME TO "idx_customer_verification_channel";
ALTER INDEX IF EXISTS "idx_storefront_verification_destination"
  RENAME TO "idx_customer_verification_destination";
ALTER INDEX IF EXISTS "idx_storefront_verification_purpose"
  RENAME TO "idx_customer_verification_purpose";
ALTER INDEX IF EXISTS "idx_storefront_verification_status"
  RENAME TO "idx_customer_verification_status";
ALTER INDEX IF EXISTS "idx_storefront_verification_lookup"
  RENAME TO "idx_customer_verification_lookup";
ALTER INDEX IF EXISTS "idx_storefront_verification_subject"
  RENAME TO "idx_customer_verification_subject";

-- Postgres leaves constraint-backed indexes on the OLD table name; Drizzle
-- derives the primary key's name from the table, so it has to be renamed too or
-- a fresh replay and an upgraded database disagree.
ALTER INDEX IF EXISTS "storefront_verification_challenges_pkey"
  RENAME TO "customer_verification_challenges_pkey";
