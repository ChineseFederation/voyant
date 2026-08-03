-- Booking v1 is the sole pre-commit lifecycle. Classify every beta draft before
-- removing its table so the cutover is auditable and cannot silently discard a
-- genuine commitment or an unresolved supplier effect.
DO $$
DECLARE
  has_missing_booking boolean := false;
  has_ambiguous_conversion boolean := false;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "booking_drafts"
    WHERE "consumed_booking_id" IS NOT NULL
  ) AND to_regclass('public.bookings') IS NULL THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Booking v1 draft cutover found consumed beta drafts before the bookings table exists.',
      HINT = 'Install the Bookings schema, verify the referenced commitments, and rerun the migration.';
  END IF;

  IF to_regclass('public.bookings') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "booking_drafts" draft
        WHERE draft."consumed_booking_id" IS NOT NULL
          AND NOT EXISTS (
            SELECT 1
            FROM "bookings" booking
            WHERE booking."id" = draft."consumed_booking_id"
          )
      )
    $query$ INTO has_missing_booking;
  END IF;
  IF has_missing_booking THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Booking v1 draft cutover found a consumed beta draft whose Booking is missing.',
      HINT = 'Restore or reconcile the Booking before rerunning; the migration will not guess whether a commitment exists.';
  END IF;

  IF to_regclass('public.availability_holds') IS NOT NULL THEN
    EXECUTE $query$
      SELECT EXISTS (
        SELECT 1
        FROM "booking_drafts" draft
        JOIN "availability_holds" hold ON hold."draft_id" = draft."id"
        WHERE draft."consumed_booking_id" IS NULL
          AND (hold."converted_at" IS NOT NULL OR hold."converted_booking_id" IS NOT NULL)
      )
    $query$ INTO has_ambiguous_conversion;
  END IF;
  IF has_ambiguous_conversion THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Booking v1 draft cutover found an unconsumed beta draft with converted inventory.',
      HINT = 'Reconcile the Booking/allocation and stamp the draft as consumed, or reverse the conversion, before rerunning.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM "booking_drafts"
    WHERE "consumed_booking_id" IS NULL
      AND "source_kind" <> 'owned'
      AND "hold_expires_at" > now()
  ) THEN
    RAISE EXCEPTION USING
      MESSAGE = 'Booking v1 draft cutover found an active beta supplier hold with an ambiguous external effect.',
      HINT = 'Release or reconcile the supplier hold before rerunning; the migration will not assume an external reservation was released.';
  END IF;
END $$;
--> statement-breakpoint

-- Capture only live, unconverted owned-capacity holds. The package migration
-- runner wraps this entire file and its ledger write in one PostgreSQL
-- transaction, so capacity restoration, classification, and table removal are
-- atomic. The temporary table also makes the release set stable while slots are
-- updated before holds, matching the runtime lock order. Its lifetime is
-- explicit so statement-level migration replay cannot drop it at an implicit
-- commit between the capture and release statements.
CREATE TEMP TABLE "booking_v1_legacy_holds_to_release" (
  "id" text PRIMARY KEY,
  "slot_id" text NOT NULL,
  "pax_count" integer NOT NULL
);
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.availability_holds') IS NULL THEN
    RETURN;
  END IF;
  IF to_regclass('public.availability_slots') IS NULL THEN
    RAISE EXCEPTION 'Booking v1 draft cutover found availability_holds without availability_slots.';
  END IF;

  INSERT INTO "booking_v1_legacy_holds_to_release" ("id", "slot_id", "pax_count")
  SELECT hold."id", hold."slot_id", hold."pax_count"
  FROM "availability_holds" hold
  JOIN "booking_drafts" draft ON draft."id" = hold."draft_id"
  WHERE hold."released_at" IS NULL
    AND hold."converted_at" IS NULL;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.availability_slots') IS NULL THEN
    RETURN;
  END IF;

  UPDATE "availability_slots" slot
  SET "remaining_pax" = slot."remaining_pax" + released."pax_count",
      "updated_at" = now()
  FROM (
    SELECT "slot_id", sum("pax_count")::integer AS "pax_count"
    FROM "booking_v1_legacy_holds_to_release"
    GROUP BY "slot_id"
  ) released
  WHERE slot."id" = released."slot_id"
    AND slot."unlimited" = false;
END $$;
--> statement-breakpoint
DO $$
BEGIN
  IF to_regclass('public.availability_holds') IS NULL THEN
    RETURN;
  END IF;

  UPDATE "availability_holds" hold
  SET "released_at" = now(),
      "updated_at" = now()
  FROM "booking_v1_legacy_holds_to_release" released
  WHERE hold."id" = released."id";
END $$;
--> statement-breakpoint

DROP TABLE "booking_v1_legacy_holds_to_release";
--> statement-breakpoint

-- Resumable means an unconsumed, unexpired draft owned by an operator member.
-- The beta row did not persist storefront origin or an anonymous capability
-- hash, so customer/anonymous rows cannot be made safely resumable. Those rows
-- become redacted canonical expiry tombstones instead of receiving fabricated
-- credentials. Staff can resume the preserved selection but must re-quote and
-- place a fresh hold.
INSERT INTO "booking_sessions" (
  "id",
  "create_idempotency_key",
  "create_request_fingerprint",
  "capability_hash",
  "capability_scopes",
  "actor_kind",
  "owner_principal_id",
  "owner_organization_id",
  "storefront_id",
  "channel_id",
  "target_kind",
  "product_id",
  "catalog_item_id",
  "target_entity_module",
  "target_entity_id",
  "state",
  "revision",
  "state_payload",
  "expires_at",
  "consumed_at",
  "purged_at",
  "created_at",
  "updated_at"
)
SELECT
  'bses_' || substr(md5('booking-v1-beta-draft:' || draft."id"), 1, 26),
  'booking-v1-beta-draft:' || md5(draft."id"),
  md5('booking-v1-beta-draft-fingerprint:' || draft."id"),
  NULL,
  '[]'::jsonb,
  CASE WHEN classification."resumable" THEN 'staff' ELSE 'anonymous' END,
  CASE WHEN classification."resumable" THEN draft."created_by" ELSE NULL END,
  NULL,
  NULL,
  NULL,
  CASE
    WHEN draft."source_kind" = 'owned' AND draft."entity_module" = 'products' THEN 'product'
    WHEN draft."source_kind" = 'owned' THEN 'owned_entity'
    ELSE 'catalog_item'
  END,
  CASE
    WHEN draft."source_kind" = 'owned' AND draft."entity_module" = 'products'
      THEN draft."entity_id"
    ELSE NULL
  END,
  CASE WHEN draft."source_kind" <> 'owned' THEN draft."entity_id" ELSE NULL END,
  CASE
    WHEN draft."source_kind" = 'owned' AND draft."entity_module" <> 'products'
      THEN draft."entity_module"
    ELSE NULL
  END,
  CASE
    WHEN draft."source_kind" = 'owned' AND draft."entity_module" <> 'products'
      THEN draft."entity_id"
    ELSE NULL
  END,
  CASE
    WHEN draft."consumed_booking_id" IS NOT NULL THEN 'consumed'
    WHEN classification."resumable" THEN 'active'
    ELSE 'expired'
  END,
  1,
  CASE WHEN classification."resumable" THEN draft."draft_payload" ELSE '{}'::jsonb END,
  draft."expires_at",
  CASE
    WHEN draft."consumed_booking_id" IS NOT NULL
      THEN coalesce(draft."consumed_at", draft."updated_at")
    ELSE NULL
  END,
  CASE WHEN classification."resumable" THEN NULL ELSE now() END,
  draft."created_at",
  CASE WHEN classification."resumable" THEN draft."updated_at" ELSE now() END
FROM "booking_drafts" draft
CROSS JOIN LATERAL (
  SELECT (
    draft."consumed_booking_id" IS NULL
    AND draft."expires_at" > now()
    AND draft."created_by" IS NOT NULL
    AND to_regclass('public.member') IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "member" member WHERE member."user_id" = draft."created_by"
    )
  ) AS "resumable"
) classification;
--> statement-breakpoint

-- One canonical audit event records the classifier result without retaining
-- discarded PII. Consumed rows retain the genuine Booking reference in audit
-- metadata; active staff rows retain only the old draft id and re-quote rule.
INSERT INTO "booking_session_audit_events" (
  "id",
  "session_id",
  "action",
  "actor_kind",
  "principal_id",
  "authority_reason",
  "metadata",
  "created_at"
)
SELECT
  'bsae_' || substr(md5('booking-v1-beta-draft-audit:' || draft."id"), 1, 26),
  'bses_' || substr(md5('booking-v1-beta-draft:' || draft."id"), 1, 26),
  CASE
    WHEN draft."consumed_booking_id" IS NOT NULL THEN 'commit'
    WHEN session."state" = 'active' THEN 'update'
    ELSE 'expire'
  END,
  CASE WHEN session."state" = 'active' THEN 'staff' ELSE 'system' END,
  CASE WHEN session."state" = 'active' THEN draft."created_by" ELSE NULL END,
  'booking_v1_beta_draft_transactional_cutover',
  jsonb_strip_nulls(jsonb_build_object(
    'classification', CASE
      WHEN draft."consumed_booking_id" IS NOT NULL THEN 'genuine_commitment'
      WHEN session."state" = 'active' THEN 'resumable_staff_attempt'
      WHEN draft."expires_at" <= now() THEN 'abandoned_attempt'
      ELSE 'unresumable_beta_attempt'
    END,
    'legacyDraftId', draft."id",
    'bookingId', draft."consumed_booking_id",
    'requiresFreshQuoteAndHold', CASE WHEN session."state" = 'active' THEN true ELSE NULL END,
    'personalDataPurged', session."purged_at" IS NOT NULL
  )),
  now()
FROM "booking_drafts" draft
JOIN "booking_sessions" session
  ON session."id" = 'bses_' || substr(md5('booking-v1-beta-draft:' || draft."id"), 1, 26);
--> statement-breakpoint

DROP TABLE "booking_drafts";
