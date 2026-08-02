-- Create Distribution-owned storage for a durable, resumable backfill. The
-- post-schema setup migration captures the optional Inventory product set and
-- active Channel set without materializing their cross-product.
CREATE TABLE "channel_publication_backfill_products" (
	"intent_id" text NOT NULL,
	"product_id" text NOT NULL,
	CONSTRAINT "channel_publication_backfill_products_intent_id_product_id_pk" PRIMARY KEY("intent_id", "product_id")
);
--> statement-breakpoint
CREATE TABLE "channel_publication_backfill_channels" (
	"intent_id" text NOT NULL,
	"channel_id" text NOT NULL,
	CONSTRAINT "channel_publication_backfill_channels_intent_id_channel_id_pk" PRIMARY KEY("intent_id", "channel_id")
);
--> statement-breakpoint
ALTER TABLE "channel_publication_backfill_products"
	ADD CONSTRAINT "channel_publication_backfill_products_intent_id_fk"
	FOREIGN KEY ("intent_id") REFERENCES "channel_publication_reindex_intents"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "channel_publication_backfill_channels"
	ADD CONSTRAINT "channel_publication_backfill_channels_intent_id_fk"
	FOREIGN KEY ("intent_id") REFERENCES "channel_publication_reindex_intents"("id") ON DELETE cascade;
--> statement-breakpoint
ALTER TABLE "channel_publication_backfill_channels"
	ADD CONSTRAINT "channel_publication_backfill_channels_channel_id_fk"
	FOREIGN KEY ("channel_id") REFERENCES "channels"("id") ON DELETE cascade;
