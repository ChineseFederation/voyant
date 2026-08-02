ALTER TABLE "booking_payment_schedules"
ADD COLUMN "due_time_zone" text DEFAULT 'UTC' NOT NULL;
