CREATE TABLE "booking_action_projections" (
	"id" text PRIMARY KEY NOT NULL,
	"provider_id" text NOT NULL,
	"source_module" text NOT NULL,
	"source_type" text NOT NULL,
	"source_id" text NOT NULL,
	"source_updated_at" timestamp with time zone NOT NULL,
	"kind" text NOT NULL,
	"booking_id" text,
	"booking_session_id" text,
	"due_at" timestamp with time zone NOT NULL,
	"due_local_date" text,
	"time_zone" text NOT NULL,
	"deadline_semantics" text NOT NULL,
	"source_state" text NOT NULL,
	"satisfied_at" timestamp with time zone,
	"due_window_seconds" integer NOT NULL,
	"escalate_after_seconds" integer NOT NULL,
	"operator_next_action" text NOT NULL,
	"customer_visible" boolean DEFAULT false NOT NULL,
	"customer_next_action" text,
	"safe_metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fingerprint" text NOT NULL,
	"projected_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "booking_action_projections_id_typeid" CHECK ("booking_action_projections"."id" LIKE 'bkap_%'),
	CONSTRAINT "booking_action_projections_source_state" CHECK ("booking_action_projections"."source_state" IN ('open','satisfied','cancelled','superseded','invalid_source')),
	CONSTRAINT "booking_action_projections_deadline_semantics" CHECK ("booking_action_projections"."deadline_semantics" IN ('instant','local_date_end')),
	CONSTRAINT "booking_action_projections_escalation_policy" CHECK ("booking_action_projections"."due_window_seconds" >= 0 AND "booking_action_projections"."escalate_after_seconds" >= "booking_action_projections"."due_window_seconds")
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_action_projections_source" ON "booking_action_projections" USING btree ("provider_id","source_module","source_type","source_id");--> statement-breakpoint
CREATE INDEX "idx_booking_action_projections_work_queue" ON "booking_action_projections" USING btree ("source_state","due_at");--> statement-breakpoint
CREATE INDEX "idx_booking_action_projections_booking" ON "booking_action_projections" USING btree ("booking_id","due_at");--> statement-breakpoint
CREATE INDEX "idx_booking_action_projections_session" ON "booking_action_projections" USING btree ("booking_session_id","due_at");--> statement-breakpoint
CREATE INDEX "idx_booking_action_projections_provider_projected" ON "booking_action_projections" USING btree ("provider_id","projected_at");
