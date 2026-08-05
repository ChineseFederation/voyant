CREATE TYPE "public"."payment_dispute_status" AS ENUM('opened', 'under_review', 'won', 'lost', 'withdrawn');--> statement-breakpoint
CREATE TABLE "payment_disputes" (
	"id" text PRIMARY KEY NOT NULL,
	"payment_session_id" text NOT NULL,
	"booking_id" text,
	"invoice_id" text,
	"payment_id" text,
	"status" "payment_dispute_status" DEFAULT 'opened' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"respond_by" timestamp with time zone,
	"processor_reference" text,
	"provider" text,
	"provider_connection_id" text,
	"reason_code" text,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"evidence_submitted_at" timestamp with time zone,
	"notes" text,
	"provider_payload" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_payment_session_id_payment_sessions_id_fk" FOREIGN KEY ("payment_session_id") REFERENCES "public"."payment_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_disputes" ADD CONSTRAINT "payment_disputes_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_payment_disputes_session" ON "payment_disputes" USING btree ("payment_session_id");--> statement-breakpoint
CREATE INDEX "idx_payment_disputes_booking" ON "payment_disputes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_payment_disputes_booking_status" ON "payment_disputes" USING btree ("booking_id","status");--> statement-breakpoint
CREATE INDEX "idx_payment_disputes_status" ON "payment_disputes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_payment_disputes_status_opened" ON "payment_disputes" USING btree ("status","opened_at");--> statement-breakpoint
CREATE INDEX "idx_payment_disputes_invoice" ON "payment_disputes" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_payment_disputes_respond_by" ON "payment_disputes" USING btree ("respond_by");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_payment_disputes_processor_reference" ON "payment_disputes" USING btree ("payment_session_id","processor_reference");
