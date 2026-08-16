-- Rebind booking-session origin from the storefront to the channel (voyant#4624).
--
-- `booking_sessions_storefront_origin` said: either the session has no public
-- origin at all (a staff session), or it has one AND has not been purged —
-- purging scrubs the origin. Dropping `storefront_id` leaves the same rule
-- expressed on the column that survives:
--
--   (sf IS NULL AND ch IS NULL) OR (purged IS NULL AND sf NOT NULL AND ch NOT NULL)
--     reduces to
--   ch IS NULL OR purged IS NULL
--
-- The constraint keeps its name: it is the same rule about the same thing, and
-- renaming it would make this migration look like it dropped a guard.

ALTER TABLE "booking_sessions" DROP CONSTRAINT IF EXISTS "booking_sessions_storefront_origin";

ALTER TABLE "booking_sessions" DROP COLUMN IF EXISTS "storefront_id";

ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_storefront_origin"
  CHECK ("channel_id" IS NULL OR "purged_at" IS NULL);
