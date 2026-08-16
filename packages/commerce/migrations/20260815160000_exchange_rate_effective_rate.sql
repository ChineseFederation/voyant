-- Record what a foreign-currency document was actually converted at, next to
-- what the source published (voyant#4703). The operator's currency-risk margin
-- is folded into `effective_rate_decimal`; `rate_decimal` keeps its published
-- meaning, so the arithmetic on an invoice can be shown in full.
--
-- ADD VALUE IF NOT EXISTS is a no-op on re-run, and PostgreSQL 12+ permits it
-- inside a transaction as long as the new label is not used in that same
-- transaction — which it is not here.
ALTER TYPE "public"."fx_rate_source" ADD VALUE IF NOT EXISTS 'bnr' BEFORE 'custom';--> statement-breakpoint
ALTER TABLE "exchange_rates"
  ADD COLUMN IF NOT EXISTS "effective_rate_decimal" numeric(18, 8);--> statement-breakpoint
ALTER TABLE "exchange_rates"
  ADD COLUMN IF NOT EXISTS "commission_bps" integer;--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "exchange_rates"
    ADD CONSTRAINT "ck_exchange_rates_effective_rate_commission"
    CHECK (("effective_rate_decimal" IS NULL) = ("commission_bps" IS NULL));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
