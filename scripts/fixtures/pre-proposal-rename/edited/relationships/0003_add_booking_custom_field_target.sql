DO $$ BEGIN
 CREATE TYPE "public"."custom_field_target" AS ENUM('organization', 'person', 'quote', 'activity', 'booking');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ALTER COLUMN "entity_type" SET DATA TYPE "public"."custom_field_target" USING "entity_type"::text::"public"."custom_field_target";--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD COLUMN "is_exportable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "custom_field_definitions" ADD COLUMN "is_invoiceable" boolean DEFAULT false NOT NULL;