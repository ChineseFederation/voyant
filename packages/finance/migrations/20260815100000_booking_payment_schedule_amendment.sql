ALTER TABLE "booking_payment_schedules"
ADD COLUMN "amendment_id" text;
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_payment_schedules_amendment"
ON "booking_payment_schedules" USING btree ("amendment_id")
WHERE "amendment_id" IS NOT NULL;
