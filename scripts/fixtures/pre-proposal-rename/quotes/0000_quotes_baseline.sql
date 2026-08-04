DO $$ BEGIN
 CREATE TYPE "public"."entity_type" AS ENUM('organization', 'person', 'quote', 'activity');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."participant_role" AS ENUM('traveler', 'booker', 'decision_maker', 'finance', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."quote_status" AS ENUM('open', 'won', 'lost', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."quote_version_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'superseded', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "booking_crm_details" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"quote_id" text,
	"quote_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" DEFAULT 'quote' NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_media" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"media_type" text NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"storage_key" text,
	"mime_type" text,
	"file_size" integer,
	"alt_text" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" "participant_role" DEFAULT 'other' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_products" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"product_id" text,
	"supplier_service_id" text,
	"name_snapshot" text NOT NULL,
	"description" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_amount_cents" integer,
	"cost_amount_cents" integer,
	"currency" text,
	"discount_amount_cents" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_version_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_version_id" text NOT NULL,
	"product_id" text,
	"supplier_service_id" text,
	"description" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" integer DEFAULT 0 NOT NULL,
	"currency" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quote_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"quote_id" text NOT NULL,
	"label" text,
	"status" "quote_version_status" DEFAULT 'draft' NOT NULL,
	"supersedes_id" text,
	"trip_snapshot_id" text,
	"valid_until" date,
	"currency" text NOT NULL,
	"subtotal_amount_cents" integer DEFAULT 0 NOT NULL,
	"tax_amount_cents" integer DEFAULT 0 NOT NULL,
	"total_amount_cents" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"sent_at" timestamp with time zone,
	"viewed_at" timestamp with time zone,
	"decided_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"person_id" text,
	"organization_id" text,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"owner_id" text,
	"status" "quote_status" DEFAULT 'open' NOT NULL,
	"accepted_version_id" text,
	"value_amount_cents" integer,
	"value_currency" text,
	"pax_count" integer,
	"expected_close_date" date,
	"source" text,
	"source_ref" text,
	"lost_reason" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"description" text,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"stage_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "stages" (
	"id" text PRIMARY KEY NOT NULL,
	"pipeline_id" text NOT NULL,
	"name" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"probability" integer,
	"is_closed" boolean DEFAULT false NOT NULL,
	"is_won" boolean DEFAULT false NOT NULL,
	"is_lost" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "quote_media" ADD CONSTRAINT "quote_media_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_participants" ADD CONSTRAINT "quote_participants_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_products" ADD CONSTRAINT "quote_products_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_version_lines" ADD CONSTRAINT "quote_version_lines_quote_version_id_quote_versions_id_fk" FOREIGN KEY ("quote_version_id") REFERENCES "public"."quote_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_quote_id_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quotes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_versions" ADD CONSTRAINT "quote_versions_supersedes_id_quote_versions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."quote_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quotes" ADD CONSTRAINT "quotes_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_bcd_quote" ON "booking_crm_details" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_bcd_quote_version" ON "booking_crm_details" USING btree ("quote_version_id");--> statement-breakpoint
CREATE INDEX "idx_pipelines_entity" ON "pipelines" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_pipelines_sort" ON "pipelines" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pipelines_entity_sort" ON "pipelines" USING btree ("entity_type","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pipelines_entity_name" ON "pipelines" USING btree ("entity_type","name");--> statement-breakpoint
CREATE INDEX "idx_quote_media_quote" ON "quote_media" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_quote_media_quote_sort" ON "quote_media" USING btree ("quote_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_quote_participants_quote" ON "quote_participants" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_quote_participants_quote_primary" ON "quote_participants" USING btree ("quote_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_quote_participants_person" ON "quote_participants" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_quote_participants_unique" ON "quote_participants" USING btree ("quote_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_quote_products_quote" ON "quote_products" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_quote_products_quote_created" ON "quote_products" USING btree ("quote_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_quote_products_product" ON "quote_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_quote_products_supplier_service" ON "quote_products" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_quote_version_lines_version" ON "quote_version_lines" USING btree ("quote_version_id");--> statement-breakpoint
CREATE INDEX "idx_quote_version_lines_version_created" ON "quote_version_lines" USING btree ("quote_version_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_quote_version_lines_product" ON "quote_version_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_quote_version_lines_supplier_service" ON "quote_version_lines" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_quote_versions_quote" ON "quote_versions" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "idx_quote_versions_status" ON "quote_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quote_versions_supersedes" ON "quote_versions" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "idx_quote_versions_trip_snapshot" ON "quote_versions" USING btree ("trip_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_quote_versions_quote_updated" ON "quote_versions" USING btree ("quote_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_quote_versions_status_updated" ON "quote_versions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_person" ON "quotes" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_org" ON "quotes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_pipeline" ON "quotes" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_stage" ON "quotes" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_owner" ON "quotes" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_status" ON "quotes" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_quotes_accepted_version" ON "quotes" USING btree ("accepted_version_id");--> statement-breakpoint
CREATE INDEX "idx_quotes_person_updated" ON "quotes" USING btree ("person_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_org_updated" ON "quotes" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_pipeline_updated" ON "quotes" USING btree ("pipeline_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_stage_updated" ON "quotes" USING btree ("stage_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_owner_updated" ON "quotes" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_quotes_status_updated" ON "quotes" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_stages_pipeline" ON "stages" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_stages_sort" ON "stages" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_stages_pipeline_sort" ON "stages" USING btree ("pipeline_id","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_stages_pipeline_name" ON "stages" USING btree ("pipeline_id","name");