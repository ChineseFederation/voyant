DO $$ BEGIN
 CREATE TYPE "public"."day_service_inclusion_role" AS ENUM('included', 'optional');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."day_service_traveler_scope" AS ENUM('all', 'adults', 'children');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "supplier_id" text;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "facility_id" text;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "start_time_local" text;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "end_time_local" text;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "duration_minutes" integer;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "inclusion_role" "day_service_inclusion_role" DEFAULT 'included' NOT NULL;--> statement-breakpoint
ALTER TABLE "product_day_services" ADD COLUMN "traveler_scope" "day_service_traveler_scope" DEFAULT 'all' NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_product_day_services_supplier" ON "product_day_services" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_product_day_services_facility" ON "product_day_services" USING btree ("facility_id");