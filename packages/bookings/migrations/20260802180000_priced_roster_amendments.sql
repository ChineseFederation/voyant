ALTER TABLE "booking_amendments"
RENAME COLUMN "requested_patch" TO "requested_change";
--> statement-breakpoint
UPDATE "booking_amendments"
SET "requested_change" = jsonb_build_object(
  'type', 'traveler_correction',
  'travelerId', "traveler_id",
  'patch', "requested_change"
);
--> statement-breakpoint
ALTER TABLE "booking_amendments"
ADD COLUMN "subtotal_delta_cents" integer DEFAULT 0 NOT NULL,
ADD COLUMN "fee_delta_cents" integer DEFAULT 0 NOT NULL,
ADD COLUMN "tax_delta_cents" integer DEFAULT 0 NOT NULL,
ADD COLUMN "collection_amount_cents" integer DEFAULT 0 NOT NULL,
ADD COLUMN "refund_amount_cents" integer DEFAULT 0 NOT NULL,
ADD COLUMN "tax_lines" jsonb DEFAULT '[]'::jsonb NOT NULL,
ADD COLUMN "financial_consequences" jsonb DEFAULT '{"collection":"not_required","refund":"not_required","invoice":"not_required","creditNote":"not_required","paymentSchedule":"not_required"}'::jsonb NOT NULL,
ADD COLUMN "quoted_at" timestamp with time zone DEFAULT now() NOT NULL,
ADD COLUMN "quote_expires_at" timestamp with time zone,
ADD COLUMN "supplier_operation_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
ADD COLUMN "operation_plan" jsonb DEFAULT '[]'::jsonb NOT NULL,
ADD COLUMN "failure_code" text,
ADD COLUMN "apply_started_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "booking_amendments"
SET "effects" = "effects" || '{"allocation":"not_required"}'::jsonb;
--> statement-breakpoint
ALTER TABLE "booking_amendments"
DROP CONSTRAINT "ck_booking_amendments_kind",
DROP CONSTRAINT "ck_booking_amendments_status",
DROP CONSTRAINT "ck_booking_amendments_lifecycle",
DROP CONSTRAINT "ck_booking_amendments_zero_delta";
--> statement-breakpoint
ALTER TABLE "booking_amendments"
ADD CONSTRAINT "ck_booking_amendments_kind"
  CHECK ("kind" IN ('traveler_correction', 'traveler_add', 'traveler_drop')),
ADD CONSTRAINT "ck_booking_amendments_status"
  CHECK ("status" IN ('proposed', 'accepted', 'applying', 'applied', 'rejected', 'failed', 'in_doubt', 'manual_review')),
ADD CONSTRAINT "ck_booking_amendments_lifecycle" CHECK (
  (
    "status" = 'proposed'
    AND "accepted_at" IS NULL
    AND "accepted_by" IS NULL
    AND "accepted_actor" IS NULL
    AND "accept_idempotency_key" IS NULL
    AND "applied_at" IS NULL
    AND "applied_actor" IS NULL
    AND "apply_idempotency_key" IS NULL
  ) OR (
    "status" = 'accepted'
    AND "acceptance_required" = true
    AND "accepted_at" IS NOT NULL
    AND "accepted_actor" IS NOT NULL
    AND "accept_idempotency_key" IS NOT NULL
    AND "applied_at" IS NULL
    AND "applied_by" IS NULL
    AND "applied_actor" IS NULL
    AND "apply_idempotency_key" IS NULL
  ) OR (
    "status" = 'applied'
    AND "applied_at" IS NOT NULL
    AND "applied_actor" IS NOT NULL
    AND "apply_idempotency_key" IS NOT NULL
    AND (
      ("acceptance_required" = false AND "accepted_at" IS NULL AND "accept_idempotency_key" IS NULL)
      OR
      ("acceptance_required" = true AND "accepted_at" IS NOT NULL AND "accept_idempotency_key" IS NOT NULL)
    )
  ) OR "status" IN ('applying', 'in_doubt', 'manual_review', 'rejected', 'failed')
),
ADD CONSTRAINT "ck_booking_amendments_money" CHECK (
  "price_delta_cents" = "subtotal_delta_cents" + "fee_delta_cents" + "tax_delta_cents"
  AND "collection_amount_cents" >= 0
  AND "refund_amount_cents" >= 0
  AND NOT ("collection_amount_cents" > 0 AND "refund_amount_cents" > 0)
);
