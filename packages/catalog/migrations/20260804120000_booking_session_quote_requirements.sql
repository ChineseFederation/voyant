-- A Quote now carries the Booking Requirements its price was computed against,
-- so a host renders and a Commit validates against one derivation rather than
-- two. Existing rows have no descriptor to backfill and no honest one to
-- invent. A Quote carries a 10-minute TTL and is not a commitment, so expire
-- the in-flight ones instead: the buyer re-quotes and gets a real descriptor.
UPDATE booking_session_quotes SET state = 'expired' WHERE state = 'active';
--> statement-breakpoint
ALTER TABLE booking_session_quotes ADD COLUMN requirements jsonb NOT NULL DEFAULT '{}'::jsonb;
--> statement-breakpoint
-- The default exists only to backfill the expired rows above. New Quotes must
-- supply a real descriptor, so drop it once the column is populated.
ALTER TABLE booking_session_quotes ALTER COLUMN requirements DROP DEFAULT;
