DO $$ BEGIN
 CREATE TYPE "public"."departure_service_operation_status" AS ENUM('planned', 'requested', 'confirmed', 'ready', 'completed', 'cancelled', 'exception');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "departure_service_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"product_version_id" text,
	"source_day_id" text NOT NULL,
	"source_day_service_id" text NOT NULL,
	"day_number" integer NOT NULL,
	"date_local" date NOT NULL,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"sequence" integer DEFAULT 0 NOT NULL,
	"facility_id" text,
	"supplier_id" text,
	"supplier_service_id" text,
	"service_type" text,
	"name" text NOT NULL,
	"inclusion_role" text DEFAULT 'included' NOT NULL,
	"traveler_scope" text DEFAULT 'all' NOT NULL,
	"status" "departure_service_operation_status" DEFAULT 'planned' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_departure_service_operations_inclusion_role" CHECK ("departure_service_operations"."inclusion_role" IN ('included', 'optional')),
	CONSTRAINT "ck_departure_service_operations_traveler_scope" CHECK ("departure_service_operations"."traveler_scope" IN ('all', 'adults', 'children'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_departure_service_operations_slot_source" ON "departure_service_operations" USING btree ("slot_id","source_day_service_id");--> statement-breakpoint
CREATE INDEX "idx_departure_service_operations_slot_day_seq" ON "departure_service_operations" USING btree ("slot_id","day_number","sequence");--> statement-breakpoint
CREATE INDEX "idx_departure_service_operations_version" ON "departure_service_operations" USING btree ("product_version_id");--> statement-breakpoint
CREATE INDEX "idx_departure_service_operations_status" ON "departure_service_operations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_departure_service_operations_supplier" ON "departure_service_operations" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_departure_service_operations_facility" ON "departure_service_operations" USING btree ("facility_id");