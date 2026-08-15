-- An `item_add` Amendment adds a service to a booking, so it has no
-- traveler of its own. `traveler_id` stops being mandatory and the kind
-- constraint widens to admit the new kind.
ALTER TABLE "booking_amendments"
ALTER COLUMN "traveler_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "booking_amendments"
DROP CONSTRAINT "ck_booking_amendments_kind";
--> statement-breakpoint
ALTER TABLE "booking_amendments"
ADD CONSTRAINT "ck_booking_amendments_kind"
CHECK ("kind" IN ('traveler_correction', 'traveler_add', 'traveler_drop', 'item_add'));
--> statement-breakpoint
-- Every kind except `item_add` still names the traveler it concerns.
ALTER TABLE "booking_amendments"
ADD CONSTRAINT "ck_booking_amendments_traveler_required"
CHECK ("kind" = 'item_add' OR "traveler_id" IS NOT NULL);
