DO $$ BEGIN
 CREATE TYPE "public"."entity_type" AS ENUM('organization', 'person', 'proposal', 'activity');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."participant_role" AS ENUM('traveler', 'booker', 'decision_maker', 'finance', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."proposal_status" AS ENUM('open', 'won', 'lost', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."proposal_version_status" AS ENUM('draft', 'sent', 'accepted', 'declined', 'superseded', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "booking_proposal_details" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"proposal_id" text,
	"proposal_version_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pipelines" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" DEFAULT 'proposal' NOT NULL,
	"name" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_delivery_requests" (
	"id" text PRIMARY KEY NOT NULL,
	"command_scope" text NOT NULL,
	"command_idempotency_key" text NOT NULL,
	"request_fingerprint" text NOT NULL,
	"claim_action_id" text NOT NULL,
	"organization_id" text,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"proposal_id" text NOT NULL,
	"proposal_version_id" text NOT NULL,
	"proposal_url" text NOT NULL,
	"provider" text NOT NULL,
	"result_snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proposal_media" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
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
CREATE TABLE "proposal_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"person_id" text NOT NULL,
	"role" "participant_role" DEFAULT 'other' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "proposal_products" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
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
CREATE TABLE "proposal_version_lines" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_version_id" text NOT NULL,
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
CREATE TABLE "proposal_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"proposal_id" text NOT NULL,
	"label" text,
	"status" "proposal_version_status" DEFAULT 'draft' NOT NULL,
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
CREATE TABLE "proposals" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"person_id" text,
	"organization_id" text,
	"pipeline_id" text NOT NULL,
	"stage_id" text NOT NULL,
	"owner_id" text,
	"status" "proposal_status" DEFAULT 'open' NOT NULL,
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
ALTER TABLE "proposal_delivery_requests" ADD CONSTRAINT "proposal_delivery_requests_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_delivery_requests" ADD CONSTRAINT "proposal_delivery_requests_proposal_version_id_proposal_versions_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_media" ADD CONSTRAINT "proposal_media_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_participants" ADD CONSTRAINT "proposal_participants_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_products" ADD CONSTRAINT "proposal_products_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_version_lines" ADD CONSTRAINT "proposal_version_lines_proposal_version_id_proposal_versions_id_fk" FOREIGN KEY ("proposal_version_id") REFERENCES "public"."proposal_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposal_versions" ADD CONSTRAINT "proposal_versions_supersedes_id_proposal_versions_id_fk" FOREIGN KEY ("supersedes_id") REFERENCES "public"."proposal_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_stage_id_stages_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."stages"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stages" ADD CONSTRAINT "stages_pipeline_id_pipelines_id_fk" FOREIGN KEY ("pipeline_id") REFERENCES "public"."pipelines"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_booking_proposal_details_proposal" ON "booking_proposal_details" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_booking_proposal_details_proposal_version" ON "booking_proposal_details" USING btree ("proposal_version_id");--> statement-breakpoint
CREATE INDEX "idx_pipelines_entity" ON "pipelines" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_pipelines_sort" ON "pipelines" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pipelines_entity_sort" ON "pipelines" USING btree ("entity_type","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_pipelines_entity_name" ON "pipelines" USING btree ("entity_type","name");--> statement-breakpoint
CREATE INDEX "idx_proposal_delivery_requests_proposal" ON "proposal_delivery_requests" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_delivery_requests_version" ON "proposal_delivery_requests" USING btree ("proposal_version_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_delivery_requests_command" ON "proposal_delivery_requests" USING btree ("command_scope","command_idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_delivery_requests_claim" ON "proposal_delivery_requests" USING btree ("claim_action_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_media_proposal" ON "proposal_media" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_media_proposal_sort" ON "proposal_media" USING btree ("proposal_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_proposal_participants_proposal" ON "proposal_participants" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_participants_proposal_primary" ON "proposal_participants" USING btree ("proposal_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_participants_person" ON "proposal_participants" USING btree ("person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_proposal_participants_unique" ON "proposal_participants" USING btree ("proposal_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_proposal" ON "proposal_products" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_proposal_created" ON "proposal_products" USING btree ("proposal_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_product" ON "proposal_products" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_products_supplier_service" ON "proposal_products" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_version" ON "proposal_version_lines" USING btree ("proposal_version_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_version_created" ON "proposal_version_lines" USING btree ("proposal_version_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_product" ON "proposal_version_lines" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_version_lines_supplier_service" ON "proposal_version_lines" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_proposal" ON "proposal_versions" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_status" ON "proposal_versions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_supersedes" ON "proposal_versions" USING btree ("supersedes_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_trip_snapshot" ON "proposal_versions" USING btree ("trip_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_proposal_updated" ON "proposal_versions" USING btree ("proposal_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposal_versions_status_updated" ON "proposal_versions" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_person" ON "proposals" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_org" ON "proposals" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_pipeline" ON "proposals" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_stage" ON "proposals" USING btree ("stage_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_owner" ON "proposals" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_status" ON "proposals" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_proposals_accepted_version" ON "proposals" USING btree ("accepted_version_id");--> statement-breakpoint
CREATE INDEX "idx_proposals_person_updated" ON "proposals" USING btree ("person_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_org_updated" ON "proposals" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_pipeline_updated" ON "proposals" USING btree ("pipeline_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_stage_updated" ON "proposals" USING btree ("stage_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_owner_updated" ON "proposals" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_proposals_status_updated" ON "proposals" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_stages_pipeline" ON "stages" USING btree ("pipeline_id");--> statement-breakpoint
CREATE INDEX "idx_stages_sort" ON "stages" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_stages_pipeline_sort" ON "stages" USING btree ("pipeline_id","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_stages_pipeline_name" ON "stages" USING btree ("pipeline_id","name");--> statement-breakpoint
DO $$
DECLARE
  seeded_pipeline_id text := 'pipe_01kyy55np3ezq9kve9v2d99dbp';
BEGIN
  IF EXISTS (SELECT 1 FROM "pipelines" WHERE "entity_type" = 'proposal') THEN
    RETURN;
  END IF;

  INSERT INTO "pipelines" ("id", "entity_type", "name", "is_default", "sort_order")
  VALUES (seeded_pipeline_id, 'proposal', 'Sales', true, 0);

  INSERT INTO "stages"
    ("id", "pipeline_id", "name", "sort_order", "probability", "is_closed", "is_won", "is_lost")
  VALUES
    ('stg_01kyy55np4e8dr6dgbsj5xvba3', seeded_pipeline_id, 'New Inquiry', 0, 10, false, false, false),
    ('stg_01kyy55np4e8dr6dgcfwfbg464', seeded_pipeline_id, 'Qualified', 1, 25, false, false, false),
    ('stg_01kyy55np4e8dr6dgjp6j29d23', seeded_pipeline_id, 'Proposal Sent', 2, 50, false, false, false),
    ('stg_01kyy55np4e8dr6dgp4evy8xdx', seeded_pipeline_id, 'Negotiation', 3, 75, false, false, false),
    ('stg_01kyy55np4e8dr6dgvkpdkvn9y', seeded_pipeline_id, 'Won', 4, 100, true, true, false),
    ('stg_01kyy55np4e8dr6dgwer94cgpx', seeded_pipeline_id, 'Lost', 5, 0, true, false, true);
END $$;
