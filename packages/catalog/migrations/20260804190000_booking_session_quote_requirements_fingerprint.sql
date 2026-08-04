-- A Quote now carries a fingerprint of the Booking Requirements its price was
-- computed against, so a Commit can re-derive the descriptor and compare — the
-- same guarantee `price_fingerprint` already gives the price. Existing rows
-- were quoted before any descriptor was fingerprinted and there is no honest
-- value to backfill. A Quote carries a 10-minute TTL and is not a commitment,
-- so expire the in-flight ones instead: the buyer re-quotes and gets a real
-- fingerprint.
UPDATE booking_session_quotes SET state = 'expired' WHERE state = 'active';
--> statement-breakpoint
ALTER TABLE booking_session_quotes ADD COLUMN requirements_fingerprint text NOT NULL DEFAULT '';
--> statement-breakpoint
-- The default exists only to backfill the expired rows above. A new Quote must
-- supply a real fingerprint, so drop it once the column is populated.
ALTER TABLE booking_session_quotes ALTER COLUMN requirements_fingerprint DROP DEFAULT;
