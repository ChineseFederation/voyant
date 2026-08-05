ALTER TABLE "allocation_resources" ADD COLUMN "occupancy_min" integer;--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD COLUMN "room_type_id" text;--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD COLUMN "bed_configuration" text;--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD COLUMN "accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD COLUMN "min_age" integer;--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD COLUMN "max_age" integer;--> statement-breakpoint
ALTER TABLE "product_option_resource_templates" ADD COLUMN "occupancy_min" integer;--> statement-breakpoint
ALTER TABLE "product_option_resource_templates" ADD COLUMN "occupancy_max" integer;--> statement-breakpoint
ALTER TABLE "product_option_resource_templates" ADD COLUMN "min_age" integer;--> statement-breakpoint
ALTER TABLE "product_option_resource_templates" ADD COLUMN "max_age" integer;--> statement-breakpoint
ALTER TABLE "product_option_resource_templates" ADD COLUMN "room_type_id" text;--> statement-breakpoint
ALTER TABLE "product_option_resource_templates" ADD COLUMN "bed_configuration" text;--> statement-breakpoint
ALTER TABLE "product_option_resource_templates" ADD COLUMN "accessible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_allocation_resources_room_type" ON "allocation_resources" USING btree ("room_type_id");--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD CONSTRAINT "ck_allocation_resources_occupancy_band" CHECK ("allocation_resources"."occupancy_min" IS NULL OR "allocation_resources"."occupancy_min" <= "allocation_resources"."capacity");--> statement-breakpoint
UPDATE "allocation_resources"
SET "accessible" = true
WHERE "accessible" = false
  AND (
    "flags" ->> 'accessible' = 'true'
    OR "flags" ->> 'accessibilityNeeded' = 'true'
    OR "flags" ->> 'wheelchairAccessible' = 'true'
  );
