CREATE TABLE "trip_shopping_references" (
	"reference_digest" text PRIMARY KEY NOT NULL,
	"purpose" text NOT NULL,
	"storefront_id" text NOT NULL,
	"channel_id" text NOT NULL,
	"owner_user_id" text,
	"owner_buyer_account_id" text,
	"market_id" text NOT NULL,
	"locale" text NOT NULL,
	"currency" text NOT NULL,
	"replay" text NOT NULL,
	"payload" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"consumed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "trip_shopping_references_purpose_check" CHECK ("purpose" IN ('catalog-item', 'flight-offer', 'stay-offer', 'package-offer')),
	CONSTRAINT "trip_shopping_references_replay_check" CHECK ("replay" IN ('multi-use', 'single-use')),
	CONSTRAINT "trip_shopping_references_currency_check" CHECK ("currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
CREATE INDEX "idx_trip_shopping_references_expiry" ON "trip_shopping_references" USING btree ("expires_at");
--> statement-breakpoint
CREATE INDEX "idx_trip_shopping_references_scope" ON "trip_shopping_references" USING btree ("storefront_id", "channel_id", "market_id");
--> statement-breakpoint
CREATE INDEX "idx_trip_shopping_references_owner" ON "trip_shopping_references" USING btree ("owner_user_id", "owner_buyer_account_id", "expires_at");
