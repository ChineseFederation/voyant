-- Rebind trip access scope from the storefront to the channel (voyant#4624).
--
-- `storefront_id` was the narrower half of the boundary a capability and an
-- opaque shopping reference are checked against; the other half is
-- `channel_id`, which every public surface now resolves to on its own.
--
-- Live capabilities and references keep working: the digests are unchanged and
-- the surviving half of each check still matches. Nothing is re-issued.

DROP INDEX IF EXISTS "idx_trip_storefront_access_scope";
ALTER TABLE "trip_storefront_access" DROP COLUMN IF EXISTS "storefront_id";
CREATE INDEX IF NOT EXISTS "idx_trip_storefront_access_scope"
  ON "trip_storefront_access" ("channel_id");

DROP INDEX IF EXISTS "idx_trip_shopping_references_scope";
ALTER TABLE "trip_shopping_references" DROP COLUMN IF EXISTS "storefront_id";
CREATE INDEX IF NOT EXISTS "idx_trip_shopping_references_scope"
  ON "trip_shopping_references" ("channel_id", "market_id");
