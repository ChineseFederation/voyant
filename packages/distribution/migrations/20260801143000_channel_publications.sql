DO $$ BEGIN
 CREATE TYPE "public"."channel_publication_decision" AS ENUM('include', 'exclude');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."channel_publication_reindex_intent_kind" AS ENUM('product', 'supplier');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."channel_publication_reindex_intent_status" AS ENUM('pending', 'processing', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "channel_product_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"product_id" text NOT NULL,
	"decision" "channel_publication_decision" NOT NULL,
	"reason" text,
	"created_by" text,
	"updated_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_publication_reindex_intents" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"kind" "channel_publication_reindex_intent_kind" NOT NULL,
	"product_id" text,
	"supplier_id" text,
	"cursor" text,
	"status" "channel_publication_reindex_intent_status" DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"requested_by" text,
	"last_error" text,
	"metadata" jsonb,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processing_started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "channel_supplier_publications" (
	"id" text PRIMARY KEY NOT NULL,
	"channel_id" text NOT NULL,
	"supplier_id" text NOT NULL,
	"decision" "channel_publication_decision" NOT NULL,
	"reason" text,
	"created_by" text,
	"updated_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "channel_product_publications" ADD CONSTRAINT "channel_product_publications_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_publication_reindex_intents" ADD CONSTRAINT "channel_publication_reindex_intents_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "channel_supplier_publications" ADD CONSTRAINT "channel_supplier_publications_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_channel_product_publications_subject" ON "channel_product_publications" USING btree ("channel_id","product_id");--> statement-breakpoint
CREATE INDEX "idx_channel_product_publications_channel" ON "channel_product_publications" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_product_publications_product" ON "channel_product_publications" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_product_publications_decision" ON "channel_product_publications" USING btree ("decision","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_pub_reindex_pending" ON "channel_publication_reindex_intents" USING btree ("status","requested_at");--> statement-breakpoint
CREATE INDEX "idx_channel_pub_reindex_channel" ON "channel_publication_reindex_intents" USING btree ("channel_id","requested_at");--> statement-breakpoint
CREATE INDEX "idx_channel_pub_reindex_product" ON "channel_publication_reindex_intents" USING btree ("product_id","requested_at");--> statement-breakpoint
CREATE INDEX "idx_channel_pub_reindex_supplier" ON "channel_publication_reindex_intents" USING btree ("supplier_id","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_channel_pub_reindex_product_pending" ON "channel_publication_reindex_intents" USING btree ("channel_id","kind","product_id") WHERE "channel_publication_reindex_intents"."status" = 'pending' AND "channel_publication_reindex_intents"."product_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_channel_pub_reindex_supplier_pending" ON "channel_publication_reindex_intents" USING btree ("channel_id","kind","supplier_id") WHERE "channel_publication_reindex_intents"."status" = 'pending' AND "channel_publication_reindex_intents"."supplier_id" IS NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uniq_channel_supplier_publications_subject" ON "channel_supplier_publications" USING btree ("channel_id","supplier_id");--> statement-breakpoint
CREATE INDEX "idx_channel_supplier_publications_channel" ON "channel_supplier_publications" USING btree ("channel_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_supplier_publications_supplier" ON "channel_supplier_publications" USING btree ("supplier_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_channel_supplier_publications_decision" ON "channel_supplier_publications" USING btree ("decision","updated_at");
