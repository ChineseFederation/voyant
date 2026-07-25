CREATE TABLE "flight_action_operations" (
	"id" text PRIMARY KEY NOT NULL,
	"command_scope" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"claim_action_id" text NOT NULL,
	"organization_id" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"kind" text NOT NULL,
	"backend_identity" text NOT NULL,
	"request_snapshot" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"lease_expires_at" timestamp with time zone,
	"lease_version" integer DEFAULT 0 NOT NULL,
	"last_error" text,
	"provider_operation_id" text,
	"outcome_snapshot" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_flight_action_operations_command" ON "flight_action_operations" USING btree ("command_scope","idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_flight_action_operations_target" ON "flight_action_operations" USING btree ("target_type","target_id","kind","status");--> statement-breakpoint
CREATE INDEX "idx_flight_action_operations_due" ON "flight_action_operations" USING btree ("status","next_attempt_at","lease_expires_at");