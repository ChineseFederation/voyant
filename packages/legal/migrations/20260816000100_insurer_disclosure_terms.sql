-- Pre-contractual insurance disclosures become first-class legal terms (voyant#4730).
--
-- Selling insurance carries duties that page copy does not discharge: the
-- product information document has to be shown before purchase, the customer's
-- demands and needs have to be stated, and the insurer's terms have to be the
-- version that was in force at the moment of sale. Insurers re-version their
-- wording and replace it without notice, so the URL that served it is not
-- evidence a year later — only an archived artifact plus the insurer's own
-- version identifier is.
--
-- ADD VALUE IF NOT EXISTS is a no-op on re-run, and PostgreSQL 12+ permits it
-- inside the migration transaction as long as the new label is not USED in the
-- same transaction. The CHECK below therefore compares `term_type::text`
-- against text literals: it never casts a literal to `legal_term_type`, so it
-- does not read a label this transaction has not committed yet.
ALTER TYPE "public"."legal_term_type" ADD VALUE IF NOT EXISTS 'insurer_product_information' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."legal_term_type" ADD VALUE IF NOT EXISTS 'insurer_terms' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."legal_term_type" ADD VALUE IF NOT EXISTS 'demands_and_needs' BEFORE 'other';--> statement-breakpoint

-- The insurer's own identifier for the wording in force at sale time, and the
-- artifact archived from it. `archived_checksum` is `sha256:<hex>` over the
-- exact bytes at `archived_storage_key`, so a later read can prove it is still
-- the wording that was accepted.
ALTER TABLE "public"."legal_terms" ADD COLUMN IF NOT EXISTS "source_version_id" text;--> statement-breakpoint
ALTER TABLE "public"."legal_terms" ADD COLUMN IF NOT EXISTS "archived_storage_key" text;--> statement-breakpoint
ALTER TABLE "public"."legal_terms" ADD COLUMN IF NOT EXISTS "archived_checksum" text;--> statement-breakpoint

-- A disclosure row of one of the three new kinds that carries no archived
-- artifact looks configured and is not: at dispute time it resolves to whatever
-- the insurer serves that day. Refuse it in the database, not only in the
-- application, because the application is not the only writer.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'ck_legal_terms_insurer_disclosure_archive'
       AND conrelid = 'public.legal_terms'::regclass
  ) THEN
    ALTER TABLE "public"."legal_terms"
      ADD CONSTRAINT "ck_legal_terms_insurer_disclosure_archive" CHECK (
        "term_type"::text NOT IN (
          'insurer_product_information',
          'insurer_terms',
          'demands_and_needs'
        )
        OR (
          "source_version_id" IS NOT NULL
          AND length(btrim("source_version_id")) > 0
          AND "archived_storage_key" IS NOT NULL
          AND length(btrim("archived_storage_key")) > 0
        )
      );
  END IF;
END $$;--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "idx_legal_terms_source_version"
  ON "public"."legal_terms" ("term_type", "source_version_id");
