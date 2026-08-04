DO $$ BEGIN
 CREATE TYPE "public"."day_service_planned_cost_basis" AS ENUM('flat', 'per_person', 'per_room', 'per_night', 'per_vehicle', 'per_service_unit');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."day_service_quantity_driver" AS ENUM('fixed', 'pax', 'rooms', 'nights', 'vehicles', 'service_units');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "planned_cost_basis" "day_service_planned_cost_basis" DEFAULT 'per_service_unit' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "quantity_driver" "day_service_quantity_driver" DEFAULT 'service_units' NOT NULL;
