-- Rebind booking scope from the storefront to the channel (voyant#4624).
--
-- `storefront_id` sat next to `channel_id` in both tables and was the narrower
-- half of the same boundary. The storefront entity is being deleted, and the
-- channel — which every public surface now resolves to, implicitly Direct
-- (voyant#4633) — carries the scope on its own.

-- The idempotency key was unique per (storefront, channel, key). Dropping the
-- storefront narrows it to (channel, key), which is STRICTER, so any deployment
-- that genuinely ran two storefronts on one channel can hold rows the narrowed
-- index would reject. Collapse those first, keeping the oldest inquiry for each
-- (channel, key): it is the one whose id any caller already holds, and the
-- later rows are exactly the duplicates the idempotency key existed to prevent.
DELETE FROM "booking_inquiries" a
USING "booking_inquiries" b
WHERE a."channel_id" = b."channel_id"
  AND a."idempotency_key" = b."idempotency_key"
  AND (a."created_at", a."id") > (b."created_at", b."id");

DROP INDEX IF EXISTS "uq_booking_inquiries_channel_idempotency";

ALTER TABLE "booking_inquiries" DROP COLUMN IF EXISTS "storefront_id";

CREATE UNIQUE INDEX IF NOT EXISTS "uq_booking_inquiries_channel_idempotency"
  ON "booking_inquiries" ("channel_id", "idempotency_key");

ALTER TABLE "booking_origins" DROP COLUMN IF EXISTS "storefront_id";
