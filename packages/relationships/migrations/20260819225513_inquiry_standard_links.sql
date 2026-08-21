CREATE TABLE IF NOT EXISTS "relationships_inquiry_inventory_product" (
  "id" text PRIMARY KEY NOT NULL,
  "relationships_inquiry_id" text NOT NULL,
  "inventory_product_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_inquiry_inventory_product_pair_idx" ON "relationships_inquiry_inventory_product" ("relationships_inquiry_id", "inventory_product_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_inquiry_inventory_product_l_idx" ON "relationships_inquiry_inventory_product" ("relationships_inquiry_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_inquiry_inventory_product_r_idx" ON "relationships_inquiry_inventory_product" ("inventory_product_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationships_inquiry_availability_departure" (
  "id" text PRIMARY KEY NOT NULL,
  "relationships_inquiry_id" text NOT NULL,
  "availability_departure_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_inquiry_availability_departure_pair_idx" ON "relationships_inquiry_availability_departure" ("relationships_inquiry_id", "availability_departure_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_inquiry_availability_departure_l_idx" ON "relationships_inquiry_availability_departure" ("relationships_inquiry_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_inquiry_availability_departure_r_idx" ON "relationships_inquiry_availability_departure" ("availability_departure_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationships_inquiry_media_asset" (
  "id" text PRIMARY KEY NOT NULL,
  "relationships_inquiry_id" text NOT NULL,
  "media_asset_id" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_inquiry_media_asset_pair_idx" ON "relationships_inquiry_media_asset" ("relationships_inquiry_id", "media_asset_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_inquiry_media_asset_l_idx" ON "relationships_inquiry_media_asset" ("relationships_inquiry_id") WHERE "deleted_at" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_inquiry_media_asset_r_idx" ON "relationships_inquiry_media_asset" ("media_asset_id") WHERE "deleted_at" IS NULL;
