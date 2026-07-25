CREATE TYPE "public"."trip_action_operation_kind" AS ENUM('price-trip', 'reserve-trip');--> statement-breakpoint
CREATE TYPE "public"."trip_action_operation_status" AS ENUM('pending', 'processing', 'retry', 'completed', 'dead_letter');--> statement-breakpoint
CREATE TABLE "trip_action_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"command_scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"claim_action_id" text NOT NULL,
	"organization_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"kind" "trip_action_operation_kind" NOT NULL,
	"backend_identity" text NOT NULL,
	"request_snapshot" jsonb NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"outcome_snapshot" jsonb,
	"provider_operation_id" text,
	"status" "trip_action_operation_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 8 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"lease_version" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "trip_action_operations" ADD CONSTRAINT "trip_action_operations_target_id_trip_envelopes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."trip_envelopes"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_trip_action_operations_command" ON "trip_action_operations" USING btree ("command_scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_trip_action_operations_due" ON "trip_action_operations" USING btree ("status","next_attempt_at","lease_expires_at");--> statement-breakpoint
CREATE INDEX "idx_trip_action_operations_target" ON "trip_action_operations" USING btree ("target_id","kind","status");
