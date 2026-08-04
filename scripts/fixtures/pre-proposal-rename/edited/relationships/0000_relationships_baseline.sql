DO $$ BEGIN
 CREATE TYPE "public"."person_document_type" AS ENUM('passport', 'id_card', 'driver_license', 'visa', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."person_relationship_kind" AS ENUM('spouse', 'partner', 'parent', 'child', 'sibling', 'guardian', 'ward', 'emergency_contact', 'friend', 'travel_companion', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."activity_link_role" AS ENUM('primary', 'related');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."activity_status" AS ENUM('planned', 'done', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."activity_type" AS ENUM('call', 'email', 'meeting', 'task', 'follow_up', 'note');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."communication_channel" AS ENUM('email', 'phone', 'whatsapp', 'sms', 'meeting', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."communication_direction" AS ENUM('inbound', 'outbound');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."custom_field_type" AS ENUM('varchar', 'text', 'double', 'monetary', 'date', 'boolean', 'enum', 'set', 'json', 'address', 'phone');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."entity_type" AS ENUM('organization', 'person', 'quote', 'activity');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."record_status" AS ENUM('active', 'inactive', 'archived');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."relation_type" AS ENUM('client', 'partner', 'supplier', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."customer_signal_kind" AS ENUM('wishlist', 'notify', 'inquiry', 'request_offer', 'referral');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."customer_signal_source" AS ENUM('form', 'phone', 'admin', 'abandoned_cart', 'website', 'booking');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."customer_signal_status" AS ENUM('new', 'contacted', 'qualified', 'converted', 'lost', 'expired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "communication_log" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"organization_id" text,
	"channel" "communication_channel" NOT NULL,
	"direction" "communication_direction" NOT NULL,
	"subject" text,
	"content" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organization_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "organizations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"legal_name" text,
	"website" text,
	"tax_id" text,
	"industry" text,
	"relation" "relation_type",
	"owner_id" text,
	"default_currency" text,
	"preferred_language" text,
	"payment_terms" integer,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"source" text,
	"source_ref" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "people" (
	"id" text PRIMARY KEY NOT NULL,
	"organization_id" text,
	"first_name" text NOT NULL,
	"middle_name" text,
	"last_name" text NOT NULL,
	"gender" text,
	"job_title" text,
	"relation" "relation_type",
	"preferred_language" text,
	"preferred_currency" text,
	"owner_id" text,
	"status" "record_status" DEFAULT 'active' NOT NULL,
	"source" text,
	"source_ref" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"date_of_birth" date,
	"notes" text,
	"accessibility_encrypted" jsonb,
	"dietary_encrypted" jsonb,
	"loyalty_encrypted" jsonb,
	"insurance_encrypted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "person_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"type" "person_document_type" NOT NULL,
	"number_encrypted" jsonb,
	"issuing_authority" text,
	"issuing_country" text,
	"issue_date" date,
	"expiry_date" date,
	"attachment_id" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_payment_methods" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"brand" text NOT NULL,
	"last4" text,
	"holder_name" text,
	"exp_month" integer,
	"exp_year" integer,
	"processor_token" text NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "person_relationships" (
	"id" text PRIMARY KEY NOT NULL,
	"from_person_id" text NOT NULL,
	"to_person_id" text NOT NULL,
	"kind" "person_relationship_kind" NOT NULL,
	"inverse_kind" "person_relationship_kind",
	"start_date" date,
	"end_date" date,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "person_relationships_no_self" CHECK ("person_relationships"."from_person_id" <> "person_relationships"."to_person_id")
);
--> statement-breakpoint
CREATE TABLE "segment_members" (
	"id" text PRIMARY KEY NOT NULL,
	"segment_id" text NOT NULL,
	"person_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "segments" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"conditions" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activities" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"type" "activity_type" NOT NULL,
	"owner_id" text,
	"status" "activity_status" DEFAULT 'planned' NOT NULL,
	"due_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"location" text,
	"description" text,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_links" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"entity_id" text NOT NULL,
	"role" "activity_link_role" DEFAULT 'related' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "activity_participants" (
	"id" text PRIMARY KEY NOT NULL,
	"activity_id" text NOT NULL,
	"person_id" text NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_field_definitions" (
	"id" text PRIMARY KEY NOT NULL,
	"entity_type" "entity_type" NOT NULL,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" "custom_field_type" NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"is_searchable" boolean DEFAULT false NOT NULL,
	"options" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "customer_signals" (
	"id" text PRIMARY KEY NOT NULL,
	"person_id" text NOT NULL,
	"product_id" text,
	"option_unit_id" text,
	"kind" "customer_signal_kind" NOT NULL,
	"source" "customer_signal_source" NOT NULL,
	"status" "customer_signal_status" DEFAULT 'new' NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"notes" text,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"assigned_to_user_id" text,
	"follow_up_at" timestamp with time zone,
	"resolved_booking_id" text,
	"source_submission_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "communication_log" ADD CONSTRAINT "communication_log_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "organization_notes" ADD CONSTRAINT "organization_notes_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "people" ADD CONSTRAINT "people_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_notes" ADD CONSTRAINT "person_notes_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD CONSTRAINT "person_payment_methods_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_from_person_id_people_id_fk" FOREIGN KEY ("from_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "person_relationships" ADD CONSTRAINT "person_relationships_to_person_id_people_id_fk" FOREIGN KEY ("to_person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_segment_id_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "public"."segments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "segment_members" ADD CONSTRAINT "segment_members_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_links" ADD CONSTRAINT "activity_links_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_activity_id_activities_id_fk" FOREIGN KEY ("activity_id") REFERENCES "public"."activities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_participants" ADD CONSTRAINT "activity_participants_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "customer_signals" ADD CONSTRAINT "customer_signals_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_communication_log_person" ON "communication_log" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_communication_log_person_created" ON "communication_log" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_communication_log_person_channel_created" ON "communication_log" USING btree ("person_id","channel","created_at");--> statement-breakpoint
CREATE INDEX "idx_communication_log_person_direction_created" ON "communication_log" USING btree ("person_id","direction","created_at");--> statement-breakpoint
CREATE INDEX "idx_communication_log_org" ON "communication_log" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_communication_log_channel" ON "communication_log" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_organization_notes_org" ON "organization_notes" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_organization_notes_org_created" ON "organization_notes" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_name" ON "organizations" USING btree ("name");--> statement-breakpoint
CREATE INDEX "idx_organizations_owner" ON "organizations" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_status" ON "organizations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_organizations_tax_id" ON "organizations" USING btree ("tax_id");--> statement-breakpoint
CREATE INDEX "idx_organizations_owner_updated" ON "organizations" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_relation_updated" ON "organizations" USING btree ("relation","updated_at");--> statement-breakpoint
CREATE INDEX "idx_organizations_status_updated" ON "organizations" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_org" ON "people" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_people_owner" ON "people" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_people_status" ON "people" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_people_name" ON "people" USING btree ("first_name","last_name");--> statement-breakpoint
CREATE INDEX "idx_people_org_updated" ON "people" USING btree ("organization_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_owner_updated" ON "people" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_relation_updated" ON "people" USING btree ("relation","updated_at");--> statement-breakpoint
CREATE INDEX "idx_people_status_updated" ON "people" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_person_documents_person" ON "person_documents" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_person_documents_person_type" ON "person_documents" USING btree ("person_id","type");--> statement-breakpoint
CREATE INDEX "idx_person_documents_expiry" ON "person_documents" USING btree ("expiry_date");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_person_documents_primary_per_type" ON "person_documents" USING btree ("person_id","type") WHERE "person_documents"."is_primary" = true;--> statement-breakpoint
CREATE INDEX "idx_person_notes_person" ON "person_notes" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_person_notes_person_created" ON "person_notes" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_person_payment_methods_person" ON "person_payment_methods" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_person_payment_methods_person_default" ON "person_payment_methods" USING btree ("person_id","is_default");--> statement-breakpoint
CREATE INDEX "idx_person_relationships_from" ON "person_relationships" USING btree ("from_person_id");--> statement-breakpoint
CREATE INDEX "idx_person_relationships_to" ON "person_relationships" USING btree ("to_person_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_person_relationships_pair_kind" ON "person_relationships" USING btree ("from_person_id","to_person_id","kind");--> statement-breakpoint
CREATE INDEX "idx_segment_members_segment" ON "segment_members" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "idx_segment_members_person" ON "segment_members" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_segments_created" ON "segments" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_activities_owner" ON "activities" USING btree ("owner_id");--> statement-breakpoint
CREATE INDEX "idx_activities_status" ON "activities" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_activities_type" ON "activities" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_activities_owner_updated" ON "activities" USING btree ("owner_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activities_status_updated" ON "activities" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activities_type_updated" ON "activities" USING btree ("type","updated_at");--> statement-breakpoint
CREATE INDEX "idx_activity_links_activity" ON "activity_links" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_links_activity_role" ON "activity_links" USING btree ("activity_id","role","created_at");--> statement-breakpoint
CREATE INDEX "idx_activity_links_entity" ON "activity_links" USING btree ("entity_type","entity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_participants_activity" ON "activity_participants" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "idx_activity_participants_activity_primary" ON "activity_participants" USING btree ("activity_id","is_primary","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_activity_participants_unique" ON "activity_participants" USING btree ("activity_id","person_id");--> statement-breakpoint
CREATE INDEX "idx_custom_field_definitions_entity" ON "custom_field_definitions" USING btree ("entity_type");--> statement-breakpoint
CREATE INDEX "idx_custom_field_definitions_entity_label" ON "custom_field_definitions" USING btree ("entity_type","label");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_custom_field_definitions_key" ON "custom_field_definitions" USING btree ("entity_type","key");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_person_status_created" ON "customer_signals" USING btree ("person_id","status","created_at");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_assignee_status" ON "customer_signals" USING btree ("assigned_to_user_id","status");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_kind" ON "customer_signals" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_customer_signals_resolved_booking" ON "customer_signals" USING btree ("resolved_booking_id");