-- Carry `booking_origins` across the quotes → proposals rename (voyant#4143).
--
-- The baseline was edited in place when `quotes` became `proposals` (#4004), so
-- a deployment provisioned before that release still has
-- `booking_origins.quote_version_id`, the `idx_booking_origins_quote_version`
-- index, and a `ck_booking_origins_source` that admits `accepted_quote_version`
-- rather than `accepted_proposal_version`. The booking-origin service reads and
-- writes the proposal-named forms.
--
-- Every step is guarded so this is a no-op on a database provisioned after the
-- rename and on a re-run.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'booking_origins'
       AND column_name = 'quote_version_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public'
       AND table_name = 'booking_origins'
       AND column_name = 'proposal_version_id'
  ) THEN
    ALTER TABLE "booking_origins" RENAME COLUMN "quote_version_id" TO "proposal_version_id";
  END IF;

  IF to_regclass('public.idx_booking_origins_quote_version') IS NOT NULL
     AND to_regclass('public.idx_booking_origins_proposal_version') IS NULL THEN
    ALTER INDEX "public"."idx_booking_origins_quote_version"
      RENAME TO "idx_booking_origins_proposal_version";
  END IF;
END $$;--> statement-breakpoint
-- `origin_source` is plain text fenced by a CHECK, so the stored value has to be
-- rewritten. Drop the constraint first: the legacy definition rejects the new
-- value, and the current definition rejects the legacy one.
ALTER TABLE "booking_origins" DROP CONSTRAINT IF EXISTS "ck_booking_origins_source";--> statement-breakpoint
UPDATE "booking_origins"
   SET "origin_source" = 'accepted_proposal_version',
       "updated_at" = now()
 WHERE "origin_source" = 'accepted_quote_version';--> statement-breakpoint
ALTER TABLE "booking_origins" ADD CONSTRAINT "ck_booking_origins_source" CHECK ("booking_origins"."origin_source" IN ('manual', 'direct_b2c', 'accepted_proposal_version', 'catalog_price_availability', 'catalog_snapshot', 'provider_source_order', 'legacy_transaction'));
