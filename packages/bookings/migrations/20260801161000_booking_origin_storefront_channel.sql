ALTER TABLE "booking_origins"
ADD COLUMN "storefront_id" text;
--> statement-breakpoint
ALTER TABLE "booking_origins"
ADD COLUMN "channel_id" text;
--> statement-breakpoint
CREATE INDEX "idx_booking_origins_storefront" ON "booking_origins" USING btree ("storefront_id");
--> statement-breakpoint
CREATE INDEX "idx_booking_origins_channel" ON "booking_origins" USING btree ("channel_id");
