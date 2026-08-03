-- Booking v1 starts at commercial commitment. Classify every beta Booking
-- lifecycle row before contracting the enums so genuine commitments survive,
-- abandoned attempts restore capacity, and ambiguous external effects stop the
-- transaction instead of being guessed into a state.
CREATE TEMP TABLE "booking_v1_legacy_booking_classification" (
  "booking_id" text PRIMARY KEY,
  "legacy_status" text NOT NULL,
  "classification" text NOT NULL,
  "target_status" text,
  "reason" text NOT NULL,
  CONSTRAINT "booking_v1_legacy_booking_classification_kind"
    CHECK ("classification" IN ('abandoned_attempt', 'genuine_commitment')),
  CONSTRAINT "booking_v1_legacy_booking_classification_target"
    CHECK (
      ("classification" = 'abandoned_attempt' AND "target_status" IS NULL)
      OR
      ("classification" = 'genuine_commitment' AND "target_status" IN ('confirmed', 'cancelled'))
    )
);
--> statement-breakpoint

INSERT INTO "booking_v1_legacy_booking_classification" (
  "booking_id",
  "legacy_status",
  "classification",
  "target_status",
  "reason"
)
SELECT
  booking."id",
  booking."status"::text,
  CASE
    WHEN booking."status" = 'awaiting_payment'
      OR booking."accepted_at" IS NOT NULL
      OR booking."confirmed_at" IS NOT NULL
      OR booking."paid_at" IS NOT NULL
      OR booking."awaiting_payment_at" IS NOT NULL
      THEN 'genuine_commitment'
    ELSE 'abandoned_attempt'
  END,
  CASE
    WHEN booking."status" = 'expired'
      AND (
        booking."accepted_at" IS NOT NULL
        OR booking."confirmed_at" IS NOT NULL
        OR booking."paid_at" IS NOT NULL
        OR booking."awaiting_payment_at" IS NOT NULL
      )
      THEN 'cancelled'
    WHEN booking."status" = 'awaiting_payment'
      OR booking."accepted_at" IS NOT NULL
      OR booking."confirmed_at" IS NOT NULL
      OR booking."paid_at" IS NOT NULL
      OR booking."awaiting_payment_at" IS NOT NULL
      THEN 'confirmed'
    ELSE NULL
  END,
  CASE
    WHEN booking."status" = 'awaiting_payment' THEN 'accepted_commercial_commitment'
    WHEN booking."accepted_at" IS NOT NULL THEN 'first_acceptance_recorded'
    WHEN booking."confirmed_at" IS NOT NULL THEN 'confirmation_recorded'
    WHEN booking."paid_at" IS NOT NULL THEN 'legacy_payment_recorded'
    WHEN booking."awaiting_payment_at" IS NOT NULL THEN 'legacy_payment_commitment_recorded'
    ELSE 'no_commitment_evidence'
  END
FROM "bookings" booking
WHERE booking."status" IN ('draft', 'on_hold', 'awaiting_payment', 'expired');
--> statement-breakpoint

-- Booking-owned durable effects are direct evidence that the row is not a
-- disposable attempt. Expired rows remain preserved as cancelled history.
UPDATE "booking_v1_legacy_booking_classification" classification
SET "classification" = 'genuine_commitment',
    "target_status" = CASE
      WHEN classification."legacy_status" = 'expired' THEN 'cancelled'
      ELSE 'confirmed'
    END,
    "reason" = 'booking_owned_commitment_evidence'
WHERE EXISTS (
  SELECT 1
  FROM "bookings" booking
  WHERE booking."id" = classification."booking_id"
    AND (
      EXISTS (
        SELECT 1 FROM "booking_fulfillments" fulfillment
        WHERE fulfillment."booking_id" = booking."id"
      )
      OR EXISTS (
        SELECT 1 FROM "booking_redemption_events" redemption
        WHERE redemption."booking_id" = booking."id"
      )
      OR EXISTS (
        SELECT 1 FROM "booking_amendments" amendment
        WHERE amendment."booking_id" = booking."id"
      )
      OR EXISTS (
        SELECT 1 FROM "booking_group_members" membership
        WHERE membership."booking_id" = booking."id"
      )
      OR EXISTS (
        SELECT 1 FROM "booking_groups" booking_group
        WHERE booking_group."primary_booking_id" = booking."id"
      )
      OR EXISTS (
        SELECT 1 FROM "booking_supplier_statuses" supplier
        WHERE supplier."booking_id" = booking."id"
          AND supplier."status" = 'confirmed'
      )
    )
);
--> statement-breakpoint

-- Finance and Legal are optional deployment modules. When installed, their
-- durable records make the Booking a genuine commitment and are preserved.
DO $$
BEGIN
  IF to_regclass('public.invoices') IS NOT NULL THEN
    EXECUTE $query$
      UPDATE "booking_v1_legacy_booking_classification" classification
      SET "classification" = 'genuine_commitment',
          "target_status" = CASE
            WHEN classification."legacy_status" = 'expired' THEN 'cancelled'
            ELSE 'confirmed'
          END,
          "reason" = 'invoice_record'
      WHERE EXISTS (
        SELECT 1 FROM "invoices" invoice
        WHERE invoice."booking_id" = classification."booking_id"
      )
    $query$;
  END IF;

  IF to_regclass('public.payment_sessions') IS NOT NULL THEN
    EXECUTE $query$
      UPDATE "booking_v1_legacy_booking_classification" classification
      SET "classification" = 'genuine_commitment',
          "target_status" = CASE
            WHEN classification."legacy_status" = 'expired' THEN 'cancelled'
            ELSE 'confirmed'
          END,
          "reason" = 'settled_payment_session'
      WHERE EXISTS (
        SELECT 1 FROM "payment_sessions" payment_session
        WHERE payment_session."booking_id" = classification."booking_id"
          AND payment_session."status" IN ('authorized', 'paid')
      )
    $query$;
  END IF;

  IF to_regclass('public.booking_guarantees') IS NOT NULL THEN
    EXECUTE $query$
      UPDATE "booking_v1_legacy_booking_classification" classification
      SET "classification" = 'genuine_commitment',
          "target_status" = CASE
            WHEN classification."legacy_status" = 'expired' THEN 'cancelled'
            ELSE 'confirmed'
          END,
          "reason" = 'active_financial_guarantee'
      WHERE EXISTS (
        SELECT 1 FROM "booking_guarantees" guarantee
        WHERE guarantee."booking_id" = classification."booking_id"
          AND (
            guarantee."status" = 'active'
            OR guarantee."guaranteed_at" IS NOT NULL
            OR guarantee."payment_authorization_id" IS NOT NULL
            OR guarantee."reference_number" IS NOT NULL
          )
      )
    $query$;
  END IF;

  IF to_regclass('public.contracts') IS NOT NULL THEN
    EXECUTE $query$
      UPDATE "booking_v1_legacy_booking_classification" classification
      SET "classification" = 'genuine_commitment',
          "target_status" = CASE
            WHEN classification."legacy_status" = 'expired' THEN 'cancelled'
            ELSE 'confirmed'
          END,
          "reason" = 'legal_contract_record'
      WHERE EXISTS (
        SELECT 1 FROM "contracts" contract
        WHERE contract."booking_id" = classification."booking_id"
      )
    $query$;
  END IF;

  IF to_regclass('public.policy_acceptances') IS NOT NULL THEN
    EXECUTE $query$
      UPDATE "booking_v1_legacy_booking_classification" classification
      SET "classification" = 'genuine_commitment',
          "target_status" = CASE
            WHEN classification."legacy_status" = 'expired' THEN 'cancelled'
            ELSE 'confirmed'
          END,
          "reason" = 'legal_acceptance_record'
      WHERE EXISTS (
        SELECT 1 FROM "policy_acceptances" acceptance
        WHERE acceptance."booking_id" = classification."booking_id"
      )
    $query$;
  END IF;
END $$;
--> statement-breakpoint

-- Supplier effects without conclusive success are operationally ambiguous.
-- Stop before any mutation so Operations can reconcile them explicitly.
DO $$
DECLARE
  ambiguous_booking_id text;
BEGIN
  SELECT classification."booking_id"
  INTO ambiguous_booking_id
  FROM "booking_v1_legacy_booking_classification" classification
  JOIN "bookings" booking ON booking."id" = classification."booking_id"
  WHERE classification."classification" = 'abandoned_attempt'
    AND booking."external_booking_ref" IS NOT NULL
  ORDER BY classification."booking_id"
  LIMIT 1;

  IF ambiguous_booking_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Booking v1 status cutover found an uncommitted Booking with an external reference: %s.',
        ambiguous_booking_id
      ),
      HINT = 'Reconcile the supplier commitment and record acceptance or cancellation before rerunning.';
  END IF;

  SELECT classification."booking_id"
  INTO ambiguous_booking_id
  FROM "booking_v1_legacy_booking_classification" classification
  JOIN "booking_supplier_statuses" supplier
    ON supplier."booking_id" = classification."booking_id"
  WHERE classification."classification" = 'abandoned_attempt'
    AND (
      supplier."supplier_reference" IS NOT NULL
      OR supplier."status" = 'pending'
    )
  ORDER BY classification."booking_id"
  LIMIT 1;

  IF ambiguous_booking_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Booking v1 status cutover found an ambiguous supplier effect for Booking %s.',
        ambiguous_booking_id
      ),
      HINT = 'Reconcile or explicitly release the supplier effect before rerunning.';
  END IF;

  IF to_regclass('public.supplier_operations') IS NOT NULL THEN
    EXECUTE $query$
      SELECT classification."booking_id"
      FROM "booking_v1_legacy_booking_classification" classification
      JOIN "supplier_operations" operation
        ON operation."booking_id" = classification."booking_id"
      WHERE classification."classification" = 'abandoned_attempt'
        AND operation."state" IN ('queued', 'submitted', 'pending', 'in_doubt', 'manual_review')
      ORDER BY classification."booking_id"
      LIMIT 1
    $query$ INTO ambiguous_booking_id;
  END IF;

  IF ambiguous_booking_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Booking v1 status cutover found an unresolved Supplier Operation for Booking %s.',
        ambiguous_booking_id
      ),
      HINT = 'Reconcile the Supplier Operation before rerunning; the migration will not infer its external outcome.';
  END IF;

  IF to_regclass('public.payment_sessions') IS NOT NULL THEN
    EXECUTE $query$
      SELECT classification."booking_id"
      FROM "booking_v1_legacy_booking_classification" classification
      JOIN "payment_sessions" payment_session
        ON payment_session."booking_id" = classification."booking_id"
      WHERE classification."classification" = 'abandoned_attempt'
        AND (
          payment_session."status" IN ('requires_redirect', 'processing')
          OR payment_session."provider_session_id" IS NOT NULL
          OR payment_session."provider_payment_id" IS NOT NULL
          OR payment_session."payment_authorization_id" IS NOT NULL
          OR payment_session."payment_capture_id" IS NOT NULL
          OR payment_session."payment_id" IS NOT NULL
        )
      ORDER BY classification."booking_id"
      LIMIT 1
    $query$ INTO ambiguous_booking_id;
  END IF;

  IF ambiguous_booking_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Booking v1 status cutover found an unresolved external payment effect for Booking %s.',
        ambiguous_booking_id
      ),
      HINT = 'Reconcile the payment session before rerunning; the migration will not discard provider state.';
  END IF;
END $$;
--> statement-breakpoint

-- Preserve genuine commitments and record the deterministic classifier result
-- in the Booking audit stream before contracting the enum.
INSERT INTO "booking_activity_log" (
  "id",
  "booking_id",
  "actor_id",
  "activity_type",
  "description",
  "metadata",
  "created_at"
)
SELECT
  'bact_' || substr(md5('booking-v1-status-cutover:' || classification."booking_id"), 1, 26),
  classification."booking_id",
  NULL,
  'system_action',
  'Booking v1 beta lifecycle classification',
  jsonb_build_object(
    'classification', classification."classification",
    'legacyStatus', classification."legacy_status",
    'targetStatus', classification."target_status",
    'reason', classification."reason"
  ),
  now()
FROM "booking_v1_legacy_booking_classification" classification
WHERE classification."classification" = 'genuine_commitment'
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint

UPDATE "bookings" booking
SET "status" = classification."target_status"::booking_status,
    "accepted_at" = coalesce(
      booking."accepted_at",
      booking."confirmed_at",
      booking."awaiting_payment_at",
      booking."paid_at",
      booking."updated_at",
      booking."created_at"
    ),
    "confirmed_at" = CASE
      WHEN classification."target_status" = 'confirmed'
        THEN coalesce(
          booking."confirmed_at",
          booking."awaiting_payment_at",
          booking."paid_at",
          booking."updated_at",
          booking."created_at"
        )
      ELSE booking."confirmed_at"
    END,
    "cancelled_at" = CASE
      WHEN classification."target_status" = 'cancelled'
        THEN coalesce(booking."cancelled_at", booking."expired_at", booking."updated_at", now())
      ELSE booking."cancelled_at"
    END,
    "updated_at" = now()
FROM "booking_v1_legacy_booking_classification" classification
WHERE booking."id" = classification."booking_id"
  AND classification."classification" = 'genuine_commitment';
--> statement-breakpoint

-- Capture capacity owned only by disposable beta attempts. Fulfilled
-- allocations are excluded because the Booking-owned evidence classifier above
-- already preserves their parent Booking.
CREATE TEMP TABLE "booking_v1_legacy_allocations_to_release" (
  "allocation_id" text PRIMARY KEY,
  "slot_id" text NOT NULL,
  "quantity" integer NOT NULL
);
--> statement-breakpoint

INSERT INTO "booking_v1_legacy_allocations_to_release" (
  "allocation_id",
  "slot_id",
  "quantity"
)
SELECT allocation."id", allocation."availability_slot_id", allocation."quantity"
FROM "booking_allocations" allocation
JOIN "booking_v1_legacy_booking_classification" classification
  ON classification."booking_id" = allocation."booking_id"
WHERE classification."classification" = 'abandoned_attempt'
  AND allocation."availability_slot_id" IS NOT NULL
  AND allocation."status" IN ('held', 'confirmed');
--> statement-breakpoint

DO $$
DECLARE
  missing_slot_id text;
  over_capacity_slot_id text;
BEGIN
  IF EXISTS (SELECT 1 FROM "booking_v1_legacy_allocations_to_release")
    AND to_regclass('public.availability_slots') IS NULL THEN
    RAISE EXCEPTION
      'Booking v1 status cutover found capacity allocations without availability_slots.';
  END IF;

  IF to_regclass('public.availability_slots') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $query$
    SELECT released."slot_id"
    FROM (
      SELECT "slot_id", sum("quantity")::integer AS "quantity"
      FROM "booking_v1_legacy_allocations_to_release"
      GROUP BY "slot_id"
    ) released
    LEFT JOIN "availability_slots" slot ON slot."id" = released."slot_id"
    WHERE slot."id" IS NULL
    ORDER BY released."slot_id"
    LIMIT 1
  $query$ INTO missing_slot_id;

  IF missing_slot_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Booking v1 status cutover cannot restore missing availability slot %s.',
        missing_slot_id
      ),
      HINT = 'Restore or explicitly reconcile the slot before rerunning.';
  END IF;

  EXECUTE $query$
    SELECT slot."id"
    FROM (
      SELECT "slot_id", sum("quantity")::integer AS "quantity"
      FROM "booking_v1_legacy_allocations_to_release"
      GROUP BY "slot_id"
    ) released
    JOIN "availability_slots" slot ON slot."id" = released."slot_id"
    WHERE slot."unlimited" = false
      AND slot."status" <> 'cancelled'
      AND slot."initial_pax" IS NOT NULL
      AND coalesce(slot."remaining_pax", 0) + released."quantity" > slot."initial_pax"
    ORDER BY slot."id"
    LIMIT 1
  $query$ INTO over_capacity_slot_id;

  IF over_capacity_slot_id IS NOT NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = format(
        'Booking v1 status cutover would over-restore availability slot %s.',
        over_capacity_slot_id
      ),
      HINT = 'Reconcile the slot and its beta allocations before rerunning.';
  END IF;
END $$;
--> statement-breakpoint

DO $$
BEGIN
  IF to_regclass('public.availability_slots') IS NULL THEN
    RETURN;
  END IF;

  EXECUTE $query$
    UPDATE "availability_slots" slot
    SET "remaining_pax" = coalesce(slot."remaining_pax", 0) + released."quantity",
        "status" = CASE
          WHEN slot."status" = 'sold_out' THEN 'open'
          ELSE slot."status"
        END,
        "updated_at" = now()
    FROM (
      SELECT "slot_id", sum("quantity")::integer AS "quantity"
      FROM "booking_v1_legacy_allocations_to_release"
      GROUP BY "slot_id"
    ) released
    WHERE slot."id" = released."slot_id"
      AND slot."unlimited" = false
      AND slot."status" <> 'cancelled'
  $query$;
END $$;
--> statement-breakpoint

-- Remove harmless Finance attempt state before deleting the abandoned Booking.
-- External or settled payment evidence was preserved or rejected above.
DO $$
BEGIN
  IF to_regclass('public.payment_sessions') IS NOT NULL THEN
    EXECUTE $query$
      DELETE FROM "payment_sessions" payment_session
      USING "booking_v1_legacy_booking_classification" classification
      WHERE payment_session."booking_id" = classification."booking_id"
        AND classification."classification" = 'abandoned_attempt'
        AND payment_session."status" IN ('pending', 'failed', 'cancelled', 'expired')
        AND payment_session."provider_session_id" IS NULL
        AND payment_session."provider_payment_id" IS NULL
        AND payment_session."payment_authorization_id" IS NULL
        AND payment_session."payment_capture_id" IS NULL
        AND payment_session."payment_id" IS NULL
    $query$;
  END IF;

  IF to_regclass('public.booking_payment_schedules') IS NOT NULL THEN
    EXECUTE $query$
      DELETE FROM "booking_payment_schedules" schedule
      USING "booking_v1_legacy_booking_classification" classification
      WHERE schedule."booking_id" = classification."booking_id"
        AND classification."classification" = 'abandoned_attempt'
    $query$;
  END IF;

  IF to_regclass('public.booking_guarantees') IS NOT NULL THEN
    EXECUTE $query$
      DELETE FROM "booking_guarantees" guarantee
      USING "booking_v1_legacy_booking_classification" classification
      WHERE guarantee."booking_id" = classification."booking_id"
        AND classification."classification" = 'abandoned_attempt'
        AND guarantee."status" IN ('pending', 'released', 'failed', 'cancelled', 'expired')
        AND guarantee."payment_authorization_id" IS NULL
        AND guarantee."reference_number" IS NULL
    $query$;
  END IF;
END $$;
--> statement-breakpoint

DELETE FROM "bookings" booking
USING "booking_v1_legacy_booking_classification" classification
WHERE booking."id" = classification."booking_id"
  AND classification."classification" = 'abandoned_attempt';
--> statement-breakpoint

DROP TABLE "booking_v1_legacy_allocations_to_release";
--> statement-breakpoint

-- The booking-backed wizard/session model has no secure v1 capability or
-- trustworthy target snapshot. The classifier above preserves commitments;
-- evidence-free attempts are deliberately deleted rather than receiving
-- fabricated resumability credentials.
DROP TABLE IF EXISTS "booking_session_states";
--> statement-breakpoint

UPDATE "booking_items" item
SET "status" = CASE
      WHEN booking."status" = 'completed' THEN 'fulfilled'::booking_item_status
      WHEN booking."status" = 'cancelled' THEN 'cancelled'::booking_item_status
      ELSE 'confirmed'::booking_item_status
    END,
    "updated_at" = now()
FROM "bookings" booking
WHERE booking."id" = item."booking_id";
--> statement-breakpoint

ALTER TABLE "bookings" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "booking_status" RENAME TO "booking_status_beta";
--> statement-breakpoint
CREATE TYPE "booking_status" AS ENUM ('confirmed', 'in_progress', 'completed', 'cancelled');
--> statement-breakpoint
ALTER TABLE "bookings"
  ALTER COLUMN "status" TYPE "booking_status"
  USING "status"::text::"booking_status";
--> statement-breakpoint
DROP TYPE "booking_status_beta";
--> statement-breakpoint

ALTER TABLE "booking_items" ALTER COLUMN "status" DROP DEFAULT;
--> statement-breakpoint
ALTER TYPE "booking_item_status" RENAME TO "booking_item_status_beta";
--> statement-breakpoint
CREATE TYPE "booking_item_status" AS ENUM ('confirmed', 'cancelled', 'fulfilled');
--> statement-breakpoint
ALTER TABLE "booking_items"
  ALTER COLUMN "status" TYPE "booking_item_status"
  USING "status"::text::"booking_item_status";
--> statement-breakpoint
DROP TYPE "booking_item_status_beta";
--> statement-breakpoint

ALTER TABLE "bookings"
  DROP COLUMN "hold_expires_at",
  DROP COLUMN "expired_at",
  DROP COLUMN "awaiting_payment_at",
  DROP COLUMN "paid_at";
--> statement-breakpoint

DROP TABLE "booking_v1_legacy_booking_classification";
