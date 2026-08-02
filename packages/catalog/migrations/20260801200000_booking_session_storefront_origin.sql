ALTER TABLE "booking_sessions" ADD COLUMN "storefront_id" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "channel_id" text;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_storefront_origin"
CHECK (
  ("storefront_id" IS NULL AND "channel_id" IS NULL)
  OR ("purged_at" IS NULL AND "storefront_id" IS NOT NULL AND "channel_id" IS NOT NULL)
);
