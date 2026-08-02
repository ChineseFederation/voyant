ALTER TABLE "channel_publication_reindex_intents"
	ALTER COLUMN "channel_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "channel_publication_reindex_intents"
	ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	ADD COLUMN "lease_owner" text,
	ADD COLUMN "lease_until" timestamp with time zone;
--> statement-breakpoint
UPDATE "channel_publication_reindex_intents"
SET "next_attempt_at" = "requested_at"
WHERE "next_attempt_at" IS NULL;
--> statement-breakpoint
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "channel_publication_reindex_intents"
		WHERE NOT (
			("kind" = 'product' AND "product_id" IS NOT NULL AND "supplier_id" IS NULL)
			OR
			("kind" = 'supplier' AND "supplier_id" IS NOT NULL AND "product_id" IS NULL)
			OR
			("kind" = 'catalog' AND "channel_id" IS NULL AND "supplier_id" IS NULL AND "product_id" IS NULL)
		)
	) THEN
		RAISE EXCEPTION 'channel_publication_reindex_intents has invalid subject rows';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "channel_publication_reindex_intents"
	ADD CONSTRAINT "ck_channel_pub_reindex_subject"
	CHECK (
		("kind" = 'product' AND "product_id" IS NOT NULL AND "supplier_id" IS NULL)
		OR
		("kind" = 'supplier' AND "supplier_id" IS NOT NULL AND "product_id" IS NULL)
		OR
		("kind" = 'catalog' AND "channel_id" IS NULL AND "supplier_id" IS NULL AND "product_id" IS NULL)
	);
--> statement-breakpoint
CREATE INDEX "idx_channel_pub_reindex_ready"
	ON "channel_publication_reindex_intents" USING btree ("status","next_attempt_at","requested_at");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channel_pub_reindex_global_product_pending"
	ON "channel_publication_reindex_intents" ("kind", "product_id")
	WHERE "status" = 'pending' AND "channel_id" IS NULL AND "product_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channel_pub_reindex_global_supplier_pending"
	ON "channel_publication_reindex_intents" ("kind", "supplier_id")
	WHERE "status" = 'pending' AND "channel_id" IS NULL AND "supplier_id" IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uniq_channel_pub_reindex_catalog_pending"
	ON "channel_publication_reindex_intents" ("kind")
	WHERE "status" = 'pending' AND "kind" = 'catalog';
