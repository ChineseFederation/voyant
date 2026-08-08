CREATE TABLE "trip_storefront_access" (
	"envelope_id" text PRIMARY KEY NOT NULL,
	"capability_digest" text NOT NULL,
	"storefront_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"market_id" text NOT NULL,
	"locale" text NOT NULL,
	"currency" text NOT NULL,
	"owner_user_id" text,
	"owner_buyer_account_id" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_storefront_access_capability_digest_unique" UNIQUE("capability_digest")
);
--> statement-breakpoint
ALTER TABLE "trip_storefront_access" ADD CONSTRAINT "trip_storefront_access_envelope_id_trip_envelopes_id_fk" FOREIGN KEY ("envelope_id") REFERENCES "public"."trip_envelopes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_trip_storefront_access_scope" ON "trip_storefront_access" USING btree ("storefront_id","channel_id");--> statement-breakpoint
CREATE INDEX "idx_trip_storefront_access_owner" ON "trip_storefront_access" USING btree ("owner_user_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_trip_storefront_access_expiry" ON "trip_storefront_access" USING btree ("expires_at");
