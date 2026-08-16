-- Money the operator collects on a third party's behalf is not the operator's
-- to price. An insurance premium is set by the insurer, is frequently exempt
-- from the VAT the rest of the cart carries, and is read by the traveller next
-- to the policy document the insurer issues — so a markup, a commission or an
-- inherited tax line makes two documents disagree.
--
-- Both columns are additive and defaulted, so every existing line keeps the
-- behaviour it already had.
DO $$ BEGIN
 CREATE TYPE "public"."booking_item_pricing_treatment" AS ENUM('standard', 'pass_through');
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "booking_items"
ADD COLUMN IF NOT EXISTS "pricing_treatment" "public"."booking_item_pricing_treatment" NOT NULL DEFAULT 'standard';
--> statement-breakpoint
ALTER TABLE "booking_items"
ADD COLUMN IF NOT EXISTS "tax_treatment_code" text;
--> statement-breakpoint
-- A per-line tax treatment overrides policy resolution, so it is only allowed
-- where the operator's policy is not the authority in the first place.
ALTER TABLE "booking_items"
DROP CONSTRAINT IF EXISTS "ck_booking_items_tax_treatment_pass_through";
--> statement-breakpoint
ALTER TABLE "booking_items"
ADD CONSTRAINT "ck_booking_items_tax_treatment_pass_through"
CHECK ("pricing_treatment" = 'pass_through' OR "tax_treatment_code" IS NULL);
