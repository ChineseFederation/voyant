CREATE TABLE "trip_storefront_booking_operations" (
	"operation_digest" text PRIMARY KEY NOT NULL,
	"envelope_id" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"snapshot_id" text,
	"booking_session_id" text,
	"outcome" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_storefront_booking_operations_envelope_id_trip_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."trip_envelopes"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "trip_storefront_booking_operations_snapshot_id_trip_snapshots_id_fk" FOREIGN KEY ("snapshot_id") REFERENCES "public"."trip_snapshots"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX "idx_trip_storefront_booking_operations_envelope" ON "trip_storefront_booking_operations" USING btree ("envelope_id");
