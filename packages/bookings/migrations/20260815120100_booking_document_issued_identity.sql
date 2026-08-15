-- A Booking Document of kind contract/invoice/proforma/credit_note records
-- paperwork that was issued elsewhere, so it carries the ISSUER's identity for
-- the document rather than one Voyant allocated (voyant#4657).
ALTER TABLE "booking_documents" ADD COLUMN IF NOT EXISTS "issued_by" text;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD COLUMN IF NOT EXISTS "issued_series" text;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD COLUMN IF NOT EXISTS "issued_number" text;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD COLUMN IF NOT EXISTS "issued_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "booking_documents" DROP CONSTRAINT IF EXISTS "ck_booking_documents_issued_identity";--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "ck_booking_documents_issued_identity" CHECK ("booking_documents"."type" NOT IN ('contract', 'invoice', 'proforma', 'credit_note') OR ("booking_documents"."issued_number" IS NOT NULL AND "booking_documents"."issued_at" IS NOT NULL));--> statement-breakpoint
DROP INDEX IF EXISTS "uq_booking_documents_issued_identity";--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_booking_documents_issued_identity" ON "booking_documents" USING btree ("booking_id","type",coalesce("issued_by", ''),coalesce("issued_series", ''),"issued_number",coalesce("issued_at", '-infinity'::timestamptz)) WHERE "booking_documents"."issued_number" IS NOT NULL;
