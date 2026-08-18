DO $$ BEGIN
 CREATE TYPE "public"."inquiry_conversion_kind" AS ENUM('proposal', 'booking_session', 'booking');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."inquiry_conversion_mode" AS ENUM('created', 'attached_existing');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "inquiry_conversions" (
	"id" text PRIMARY KEY NOT NULL,
	"inquiry_id" text NOT NULL,
	"kind" "inquiry_conversion_kind" NOT NULL,
	"target_id" text NOT NULL,
	"target_snapshot" jsonb NOT NULL,
	"idempotency_key" text NOT NULL,
	"mode" "inquiry_conversion_mode" NOT NULL,
	"actor_id" text NOT NULL,
	"inquiry_status" "inquiry_status" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiry_conversions" ADD CONSTRAINT "inquiry_conversions_inquiry_id_inquiries_id_fk" FOREIGN KEY ("inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inquiry_conversions_operation" ON "inquiry_conversions" USING btree ("inquiry_id","kind","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_inquiry_conversions_target" ON "inquiry_conversions" USING btree ("kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_inquiry_conversions_inquiry_created" ON "inquiry_conversions" USING btree ("inquiry_id","created_at");
