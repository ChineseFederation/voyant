ALTER TABLE "bookings" ADD COLUMN "accepted_at" timestamp with time zone;--> statement-breakpoint
UPDATE "bookings"
SET "accepted_at" = COALESCE("confirmed_at", "completed_at", "updated_at", "created_at")
WHERE "accepted_at" IS NULL
  AND "status" IN ('confirmed', 'in_progress', 'completed');--> statement-breakpoint
CREATE INDEX "idx_bookings_accepted_at" ON "bookings" USING btree ("accepted_at");
