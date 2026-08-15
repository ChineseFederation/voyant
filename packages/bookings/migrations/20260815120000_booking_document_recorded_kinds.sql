-- Kept in its own committed migration so PostgreSQL can commit the enum values
-- before the next migration uses them in the issued-identity check constraint.
--
-- ADD VALUE IF NOT EXISTS is a no-op on re-run, and PostgreSQL 12+ permits it
-- inside the migration transaction as long as the new label is not USED in the
-- same transaction. Nothing here writes a row or a constraint with it.
ALTER TYPE "public"."booking_document_type" ADD VALUE IF NOT EXISTS 'contract' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."booking_document_type" ADD VALUE IF NOT EXISTS 'invoice' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."booking_document_type" ADD VALUE IF NOT EXISTS 'proforma' BEFORE 'other';--> statement-breakpoint
ALTER TYPE "public"."booking_document_type" ADD VALUE IF NOT EXISTS 'credit_note' BEFORE 'other';
