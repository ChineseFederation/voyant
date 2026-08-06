CREATE TYPE "public"."refund_settlement_method" AS ENUM('processor_reversal', 'bank_transfer', 'cash', 'cheque', 'travel_credit', 'voucher', 'counterparty_offset', 'other');--> statement-breakpoint
CREATE TYPE "public"."refund_settlement_status" AS ENUM('pending', 'settled', 'failed');--> statement-breakpoint
CREATE TABLE "refund_settlements" (
	"id" text PRIMARY KEY NOT NULL,
	"credit_note_id" text,
	"payment_id" text,
	"invoice_id" text,
	"payment_session_id" text,
	"booking_id" text,
	"method" "refund_settlement_method" NOT NULL,
	"status" "refund_settlement_status" DEFAULT 'pending' NOT NULL,
	"amount_cents" integer NOT NULL,
	"currency" text NOT NULL,
	"instrument_amount_cents" integer,
	"instrument_currency" text,
	"travel_credit_id" text,
	"counterparty_organization_id" text,
	"counterparty_person_id" text,
	"external_reference" text,
	"provider" text,
	"provider_connection_id" text,
	"processor_reference" text,
	"authorized_by_user_id" text,
	"approval_id" text,
	"requested_action_id" text,
	"idempotency_key" text,
	"initiated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"failure_reason" text,
	"notes" text,
	"provider_payload" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_refund_settlements_reverses_something" CHECK ("refund_settlements"."credit_note_id" IS NOT NULL OR "refund_settlements"."payment_id" IS NOT NULL),
	CONSTRAINT "ck_refund_settlements_instrument_currency" CHECK (("refund_settlements"."instrument_amount_cents" IS NULL) = ("refund_settlements"."instrument_currency" IS NULL)),
	CONSTRAINT "ck_refund_settlements_amount_positive" CHECK ("refund_settlements"."amount_cents" > 0)
);
--> statement-breakpoint
ALTER TABLE "refund_settlements" ADD CONSTRAINT "refund_settlements_credit_note_id_credit_notes_id_fk" FOREIGN KEY ("credit_note_id") REFERENCES "public"."credit_notes"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_settlements" ADD CONSTRAINT "refund_settlements_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_settlements" ADD CONSTRAINT "refund_settlements_invoice_id_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."invoices"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_settlements" ADD CONSTRAINT "refund_settlements_payment_session_id_payment_sessions_id_fk" FOREIGN KEY ("payment_session_id") REFERENCES "public"."payment_sessions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "refund_settlements" ADD CONSTRAINT "refund_settlements_travel_credit_id_travel_credits_id_fk" FOREIGN KEY ("travel_credit_id") REFERENCES "public"."travel_credits"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_credit_note" ON "refund_settlements" USING btree ("credit_note_id");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_payment" ON "refund_settlements" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_payment_status" ON "refund_settlements" USING btree ("payment_id","status");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_invoice" ON "refund_settlements" USING btree ("invoice_id");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_session" ON "refund_settlements" USING btree ("payment_session_id");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_booking" ON "refund_settlements" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_booking_status" ON "refund_settlements" USING btree ("booking_id","status");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_status" ON "refund_settlements" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_status_initiated" ON "refund_settlements" USING btree ("status","initiated_at");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_method" ON "refund_settlements" USING btree ("method");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_travel_credit" ON "refund_settlements" USING btree ("travel_credit_id");--> statement-breakpoint
CREATE INDEX "idx_refund_settlements_counterparty_organization" ON "refund_settlements" USING btree ("counterparty_organization_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_refund_settlements_idempotency" ON "refund_settlements" USING btree ("payment_id","idempotency_key");
