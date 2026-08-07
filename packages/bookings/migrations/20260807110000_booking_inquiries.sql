CREATE TABLE "booking_inquiries" (
  "id" text PRIMARY KEY NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "storefront_id" text NOT NULL,
  "channel_id" text NOT NULL,
  "product_id" text NOT NULL,
  "departure_id" text,
  "contact_first_name" text,
  "contact_last_name" text,
  "contact_email" text,
  "contact_phone" text,
  "locale" text NOT NULL,
  "message" text NOT NULL,
  "status" text DEFAULT 'open' NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "ck_booking_inquiries_status" CHECK ("status" IN ('open', 'closed'))
);--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_inquiries_channel_idempotency" ON "booking_inquiries" USING btree ("storefront_id", "channel_id", "idempotency_key");--> statement-breakpoint
CREATE INDEX "idx_booking_inquiries_status_created" ON "booking_inquiries" USING btree ("status", "created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_inquiries_product" ON "booking_inquiries" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_booking_inquiries_departure" ON "booking_inquiries" USING btree ("departure_id");
