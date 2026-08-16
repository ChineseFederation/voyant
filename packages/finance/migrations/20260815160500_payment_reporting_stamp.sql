-- What an advance was worth in the operator's reporting currency, on the day
-- it was collected (voyant#4703).
--
-- `payments.base_*` cannot carry this: on this table alone it means the
-- INVOICE's currency — a settlement conversion `paymentSettlementAmountSql`
-- depends on — while `base_*` on invoices, bookings and supplier_invoices all
-- mean the reporting currency. Overloading it would break cross-currency
-- settlement, so the reporting figure gets its own, correctly named columns.
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "reporting_currency" text;--> statement-breakpoint
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "reporting_amount_cents" integer;--> statement-breakpoint
ALTER TABLE "payments"
  ADD COLUMN IF NOT EXISTS "reporting_fx_rate_set_id" text;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_payments_reporting_fx_rate_set"
  ON "payments" ("reporting_fx_rate_set_id");--> statement-breakpoint
DO $$ BEGIN
  ALTER TABLE "payments"
    ADD CONSTRAINT "ck_payments_reporting_currency_amount"
    CHECK (("reporting_currency" IS NULL) = ("reporting_amount_cents" IS NULL));
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
