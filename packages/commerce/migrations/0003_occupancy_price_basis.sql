DO $$ BEGIN
  CREATE TYPE "public"."occupancy_price_basis" AS ENUM('supplement', 'all_in');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "option_price_rules"
  ADD COLUMN IF NOT EXISTS "occupancy_price_basis" "occupancy_price_basis";
