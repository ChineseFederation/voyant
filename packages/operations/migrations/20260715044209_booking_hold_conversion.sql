ALTER TABLE "availability_holds" ADD COLUMN "converted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "availability_holds" ADD COLUMN "converted_booking_id" text;--> statement-breakpoint
ALTER TABLE "availability_holds" ADD COLUMN "converted_allocation_id" text;--> statement-breakpoint
CREATE INDEX "idx_availability_holds_converted_booking" ON "availability_holds" USING btree ("converted_booking_id");