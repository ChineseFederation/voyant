ALTER TABLE "booking_items"
ADD COLUMN IF NOT EXISTS "cancellation_terms_snapshot" jsonb;
