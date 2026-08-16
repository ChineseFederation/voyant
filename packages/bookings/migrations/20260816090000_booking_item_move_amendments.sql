-- An `item_move` Amendment carries a Booking Item to a different departure.
-- Like `item_add` it concerns a service rather than a person, so it has no
-- traveler of its own.
ALTER TABLE "booking_amendments"
DROP CONSTRAINT "ck_booking_amendments_kind";
--> statement-breakpoint
ALTER TABLE "booking_amendments"
ADD CONSTRAINT "ck_booking_amendments_kind"
CHECK ("kind" IN ('traveler_correction', 'traveler_add', 'traveler_drop', 'item_add', 'item_move'));
--> statement-breakpoint
ALTER TABLE "booking_amendments"
DROP CONSTRAINT "ck_booking_amendments_traveler_required";
--> statement-breakpoint
ALTER TABLE "booking_amendments"
ADD CONSTRAINT "ck_booking_amendments_traveler_required"
CHECK ("kind" IN ('item_add', 'item_move') OR "traveler_id" IS NOT NULL);
