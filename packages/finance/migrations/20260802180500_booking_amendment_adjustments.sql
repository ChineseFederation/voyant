CREATE TABLE "finance_amendment_adjustments" (
  "id" text PRIMARY KEY NOT NULL,
  "amendment_id" text NOT NULL,
  "booking_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "currency" text NOT NULL,
  "subtotal_delta_cents" integer NOT NULL,
  "fee_delta_cents" integer NOT NULL,
  "tax_delta_cents" integer NOT NULL,
  "total_delta_cents" integer NOT NULL,
  "collection_amount_cents" integer DEFAULT 0 NOT NULL,
  "refund_amount_cents" integer DEFAULT 0 NOT NULL,
  "status" text NOT NULL,
  "consequences" jsonb NOT NULL,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_finance_amendment_adjustments_status"
    CHECK ("status" IN ('no_action', 'collection_required', 'refund_required')),
  CONSTRAINT "ck_finance_amendment_adjustments_money" CHECK (
    "total_delta_cents" = "subtotal_delta_cents" + "fee_delta_cents" + "tax_delta_cents"
    AND "collection_amount_cents" >= 0
    AND "refund_amount_cents" >= 0
    AND NOT ("collection_amount_cents" > 0 AND "refund_amount_cents" > 0)
  )
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_finance_amendment_adjustments_amendment"
ON "finance_amendment_adjustments" USING btree ("amendment_id");
--> statement-breakpoint
CREATE INDEX "idx_finance_amendment_adjustments_booking_created"
ON "finance_amendment_adjustments" USING btree ("booking_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_finance_amendment_adjustments_status"
ON "finance_amendment_adjustments" USING btree ("status");
