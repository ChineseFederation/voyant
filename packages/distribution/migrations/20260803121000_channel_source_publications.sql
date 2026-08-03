CREATE TABLE IF NOT EXISTS "channel_source_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"source_kind" text NOT NULL,
	"source_connection_id" text,
	"decision" "channel_publication_decision" NOT NULL,
	"reason" text,
	"created_by" text,
	"updated_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
	ALTER TABLE "channel_source_publications"
		ADD CONSTRAINT "channel_source_publications_channel_id_channels_id_fk"
		FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id")
		ON DELETE cascade ON UPDATE no action;
EXCEPTION WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
-- Two partial uniques rather than one composite: PostgreSQL treats NULLs as
-- distinct, so a plain unique would let the connectionless rule for a kind be
-- inserted repeatedly.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channel_source_publications_connected"
	ON "channel_source_publications" ("channel_id", "source_kind", "source_connection_id")
	WHERE "source_connection_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channel_source_publications_connectionless"
	ON "channel_source_publications" ("channel_id", "source_kind")
	WHERE "source_connection_id" IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel_source_publications_channel"
	ON "channel_source_publications" USING btree ("channel_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel_source_publications_source"
	ON "channel_source_publications" USING btree ("source_kind", "source_connection_id", "updated_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel_source_publications_decision"
	ON "channel_source_publications" USING btree ("decision", "updated_at");
--> statement-breakpoint
ALTER TABLE "channel_publication_reindex_intents"
	ADD COLUMN IF NOT EXISTS "source_kind" text;
--> statement-breakpoint
ALTER TABLE "channel_publication_reindex_intents"
	ADD COLUMN IF NOT EXISTS "source_connection_id" text;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_channel_pub_reindex_source"
	ON "channel_publication_reindex_intents" USING btree ("source_kind", "source_connection_id", "requested_at");
--> statement-breakpoint
-- One index, not the four the product/supplier subjects need: both the channel
-- scope and the connection id are nullable, and COALESCE makes "absent" a real
-- key value so repeat enqueues for a global or connectionless source collapse.
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channel_pub_reindex_source_pending"
	ON "channel_publication_reindex_intents" (coalesce("channel_id", ''), "kind", "source_kind", coalesce("source_connection_id", ''))
	WHERE "status" = 'pending' AND "kind" = 'source';
--> statement-breakpoint
ALTER TABLE "channel_publication_reindex_intents"
	DROP CONSTRAINT IF EXISTS "ck_channel_pub_reindex_subject";
--> statement-breakpoint
ALTER TABLE "channel_publication_reindex_intents"
	ADD CONSTRAINT "ck_channel_pub_reindex_subject"
	CHECK (
		("kind" = 'product' AND "product_id" IS NOT NULL AND "supplier_id" IS NULL AND "source_kind" IS NULL)
		OR
		("kind" = 'supplier' AND "supplier_id" IS NOT NULL AND "product_id" IS NULL AND "source_kind" IS NULL)
		OR
		("kind" = 'source' AND "source_kind" IS NOT NULL AND "product_id" IS NULL AND "supplier_id" IS NULL)
		OR
		("kind" = 'catalog' AND "channel_id" IS NULL AND "product_id" IS NULL AND "supplier_id" IS NULL AND "source_kind" IS NULL)
	);
