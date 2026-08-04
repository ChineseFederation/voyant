DO $$ BEGIN
 CREATE TYPE "public"."contract_body_format" AS ENUM('markdown', 'html', 'lexical_json');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contract_number_reset_strategy" AS ENUM('never', 'annual', 'monthly');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contract_scope" AS ENUM('customer', 'supplier', 'partner', 'channel', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contract_signature_method" AS ENUM('manual', 'electronic', 'docusign', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contract_status" AS ENUM('draft', 'issued', 'sent', 'signed', 'executed', 'expired', 'void');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."policy_acceptance_method" AS ENUM('implicit', 'explicit_checkbox', 'signature');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."policy_assignment_scope" AS ENUM('product', 'channel', 'supplier', 'market', 'organization', 'global');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."policy_kind" AS ENUM('cancellation', 'payment', 'terms_and_conditions', 'privacy', 'refund', 'commission', 'guarantee', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."policy_refund_type" AS ENUM('cash', 'credit', 'cash_or_credit', 'none');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."policy_rule_type" AS ENUM('window', 'percentage', 'flat_amount', 'date_range', 'custom');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."policy_version_status" AS ENUM('draft', 'published', 'retired');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."legal_target_kind" AS ENUM('booking', 'quote_version', 'program', 'product', 'inventory_item', 'supplier_channel_relationship', 'provider_source_ref');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."legal_term_acceptance_status" AS ENUM('not_required', 'pending', 'accepted', 'declined');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."legal_term_type" AS ENUM('terms_and_conditions', 'cancellation', 'guarantee', 'payment', 'pricing', 'commission', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "contract_attachments" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"kind" text DEFAULT 'appendix' NOT NULL,
	"name" text NOT NULL,
	"mime_type" text,
	"file_size" integer,
	"storage_key" text,
	"checksum" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_number_series" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"prefix" text DEFAULT '' NOT NULL,
	"separator" text DEFAULT '' NOT NULL,
	"pad_length" integer DEFAULT 4 NOT NULL,
	"current_sequence" integer DEFAULT 0 NOT NULL,
	"reset_strategy" "contract_number_reset_strategy" DEFAULT 'never' NOT NULL,
	"reset_at" timestamp with time zone,
	"scope" "contract_scope" DEFAULT 'customer' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"external_provider" text,
	"external_config_key" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_signatures" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text NOT NULL,
	"signer_name" text NOT NULL,
	"signer_email" text,
	"signer_role" text,
	"person_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"method" "contract_signature_method" DEFAULT 'manual' NOT NULL,
	"provider" text,
	"external_reference" text,
	"signature_data" text,
	"ip_address" text,
	"user_agent" text,
	"signed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_template_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"template_id" text NOT NULL,
	"version" integer NOT NULL,
	"body" text NOT NULL,
	"variable_schema" jsonb,
	"changelog" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contract_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"scope" "contract_scope" NOT NULL,
	"language" text DEFAULT 'en' NOT NULL,
	"description" text,
	"body" text NOT NULL,
	"variable_schema" jsonb,
	"current_version_id" text,
	"channel_id" text,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contract_templates_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_number" text,
	"scope" "contract_scope" NOT NULL,
	"status" "contract_status" DEFAULT 'draft' NOT NULL,
	"stage_history" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"title" text NOT NULL,
	"template_version_id" text,
	"series_id" text,
	"person_id" text,
	"organization_id" text,
	"supplier_id" text,
	"channel_id" text,
	"booking_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"issued_at" timestamp with time zone,
	"sent_at" timestamp with time zone,
	"executed_at" timestamp with time zone,
	"expires_at" timestamp with time zone,
	"voided_at" timestamp with time zone,
	"language" text DEFAULT 'en' NOT NULL,
	"rendered_body_format" "contract_body_format" DEFAULT 'html' NOT NULL,
	"rendered_body" text,
	"variables" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_contract_number_unique" UNIQUE("contract_number")
);
--> statement-breakpoint
CREATE TABLE "policies" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "policy_kind" NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"language" text DEFAULT 'en' NOT NULL,
	"current_version_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "policies_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "policy_acceptances" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_version_id" text NOT NULL,
	"person_id" text,
	"booking_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"accepted_at" timestamp with time zone DEFAULT now() NOT NULL,
	"accepted_by" text,
	"method" "policy_acceptance_method" DEFAULT 'implicit' NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"scope" "policy_assignment_scope" NOT NULL,
	"product_id" text,
	"channel_id" text,
	"supplier_id" text,
	"market_id" text,
	"organization_id" text,
	"valid_from" date,
	"valid_to" date,
	"priority" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_version_id" text NOT NULL,
	"rule_type" "policy_rule_type" NOT NULL,
	"label" text,
	"days_before_departure" integer,
	"refund_percent" integer,
	"refund_type" "policy_refund_type",
	"flat_amount_cents" integer,
	"currency" text,
	"valid_from" date,
	"valid_to" date,
	"conditions" jsonb,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "policy_versions" (
	"id" text PRIMARY KEY NOT NULL,
	"policy_id" text NOT NULL,
	"version" integer NOT NULL,
	"status" "policy_version_status" DEFAULT 'draft' NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"published_at" timestamp with time zone,
	"published_by" text,
	"retired_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "legal_terms" (
	"id" text PRIMARY KEY NOT NULL,
	"contract_id" text,
	"policy_version_id" text,
	"target_kind" "legal_target_kind",
	"target_id" text,
	"target_provider" text,
	"target_source_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"term_type" "legal_term_type" DEFAULT 'terms_and_conditions' NOT NULL,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"language" text,
	"required" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"acceptance_status" "legal_term_acceptance_status" DEFAULT 'pending' NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "contract_attachments" ADD CONSTRAINT "contract_attachments_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contract_template_versions" ADD CONSTRAINT "contract_template_versions_template_id_contract_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."contract_templates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_template_version_id_contract_template_versions_id_fk" FOREIGN KEY ("template_version_id") REFERENCES "public"."contract_template_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_series_id_contract_number_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."contract_number_series"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_acceptances" ADD CONSTRAINT "policy_acceptances_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_assignments" ADD CONSTRAINT "policy_assignments_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_rules" ADD CONSTRAINT "policy_rules_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."policies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_terms" ADD CONSTRAINT "legal_terms_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "legal_terms" ADD CONSTRAINT "legal_terms_policy_version_id_policy_versions_id_fk" FOREIGN KEY ("policy_version_id") REFERENCES "public"."policy_versions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_contract" ON "contract_attachments" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_contract_created" ON "contract_attachments" USING btree ("contract_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_target" ON "contract_attachments" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_provider_source" ON "contract_attachments" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_legacy_transaction_offer" ON "contract_attachments" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_contract_attachments_legacy_transaction_order" ON "contract_attachments" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_scope" ON "contract_number_series" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_active" ON "contract_number_series" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_scope_default" ON "contract_number_series" USING btree ("scope","is_default");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_external_provider" ON "contract_number_series" USING btree ("external_provider");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_scope_updated" ON "contract_number_series" USING btree ("scope","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_active_updated" ON "contract_number_series" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_number_series_updated" ON "contract_number_series" USING btree ("updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_number_series_prefix_scope_active" ON "contract_number_series" USING btree ("prefix","scope") WHERE "contract_number_series"."active" = true;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_number_series_default_scope_active" ON "contract_number_series" USING btree ("scope") WHERE "contract_number_series"."active" = true AND "contract_number_series"."is_default" = true;--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_contract" ON "contract_signatures" USING btree ("contract_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_contract_signed" ON "contract_signatures" USING btree ("contract_id","signed_at");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_person" ON "contract_signatures" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_target" ON "contract_signatures" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_provider_source" ON "contract_signatures" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_legacy_transaction_offer" ON "contract_signatures" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_legacy_transaction_order" ON "contract_signatures" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_contract_signatures_method" ON "contract_signatures" USING btree ("method");--> statement-breakpoint
CREATE INDEX "idx_contract_template_versions_template" ON "contract_template_versions" USING btree ("template_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_template_versions_template_version" ON "contract_template_versions" USING btree ("template_id","version");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_scope" ON "contract_templates" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_language" ON "contract_templates" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_channel" ON "contract_templates" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_active" ON "contract_templates" USING btree ("active");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_default_selector" ON "contract_templates" USING btree ("scope","channel_id","language","is_default","active");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_scope_updated" ON "contract_templates" USING btree ("scope","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_language_updated" ON "contract_templates" USING btree ("language","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_active_updated" ON "contract_templates" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_contract_templates_scope_active_updated" ON "contract_templates" USING btree ("scope","active","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_contract_templates_slug" ON "contract_templates" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_templates_default_global" ON "contract_templates" USING btree ("scope","language") WHERE "contract_templates"."is_default" = true AND "contract_templates"."channel_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_contract_templates_default_channel" ON "contract_templates" USING btree ("scope","channel_id","language") WHERE "contract_templates"."is_default" = true AND "contract_templates"."channel_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "idx_contracts_scope" ON "contracts" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_contracts_status" ON "contracts" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_contracts_template_version" ON "contracts" USING btree ("template_version_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_series" ON "contracts" USING btree ("series_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_person" ON "contracts" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_organization" ON "contracts" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_supplier" ON "contracts" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_booking" ON "contracts" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_target" ON "contracts" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_provider_source" ON "contracts" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_contracts_legacy_transaction_offer" ON "contracts" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_legacy_transaction_order" ON "contracts" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_contracts_scope_created" ON "contracts" USING btree ("scope","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_status_created" ON "contracts" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_person_created" ON "contracts" USING btree ("person_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_organization_created" ON "contracts" USING btree ("organization_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_supplier_created" ON "contracts" USING btree ("supplier_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_booking_created" ON "contracts" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_target_created" ON "contracts" USING btree ("target_kind","target_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_contracts_contract_number" ON "contracts" USING btree ("contract_number");--> statement-breakpoint
CREATE INDEX "idx_policies_kind" ON "policies" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "idx_policies_language" ON "policies" USING btree ("language");--> statement-breakpoint
CREATE INDEX "idx_policies_kind_updated" ON "policies" USING btree ("kind","updated_at");--> statement-breakpoint
CREATE INDEX "idx_policies_language_updated" ON "policies" USING btree ("language","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policies_slug" ON "policies" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_version" ON "policy_acceptances" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_person" ON "policy_acceptances" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_booking" ON "policy_acceptances" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_target" ON "policy_acceptances" USING btree ("target_kind","target_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_provider_source" ON "policy_acceptances" USING btree ("target_provider","target_source_ref");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_legacy_transaction_offer" ON "policy_acceptances" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_legacy_transaction_order" ON "policy_acceptances" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_version_accepted" ON "policy_acceptances" USING btree ("policy_version_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_person_accepted" ON "policy_acceptances" USING btree ("person_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_booking_accepted" ON "policy_acceptances" USING btree ("booking_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_acceptances_target_accepted" ON "policy_acceptances" USING btree ("target_kind","target_id","accepted_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_policy" ON "policy_assignments" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_scope" ON "policy_assignments" USING btree ("scope");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_product" ON "policy_assignments" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_channel" ON "policy_assignments" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_supplier" ON "policy_assignments" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_market" ON "policy_assignments" USING btree ("market_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_organization" ON "policy_assignments" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_priority" ON "policy_assignments" USING btree ("priority");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_policy_priority_created" ON "policy_assignments" USING btree ("policy_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_scope_priority_created" ON "policy_assignments" USING btree ("scope","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_product_priority_created" ON "policy_assignments" USING btree ("product_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_channel_priority_created" ON "policy_assignments" USING btree ("channel_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_supplier_priority_created" ON "policy_assignments" USING btree ("supplier_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_market_priority_created" ON "policy_assignments" USING btree ("market_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_assignments_organization_priority_created" ON "policy_assignments" USING btree ("organization_id","priority","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_version" ON "policy_rules" USING btree ("policy_version_id");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_version_sort_created" ON "policy_rules" USING btree ("policy_version_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_type" ON "policy_rules" USING btree ("rule_type");--> statement-breakpoint
CREATE INDEX "idx_policy_rules_sort" ON "policy_rules" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_policy_versions_policy" ON "policy_versions" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "idx_policy_versions_status" ON "policy_versions" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_policy_versions_policy_version" ON "policy_versions" USING btree ("policy_id","version");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_contract_sort" ON "legal_terms" USING btree ("contract_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_policy_version_sort" ON "legal_terms" USING btree ("policy_version_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_target_sort" ON "legal_terms" USING btree ("target_kind","target_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_provider_source_sort" ON "legal_terms" USING btree ("target_provider","target_source_ref","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_legacy_transaction_offer_sort" ON "legal_terms" USING btree ("legacy_transaction_offer_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_legacy_transaction_order_sort" ON "legal_terms" USING btree ("legacy_transaction_order_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_type_sort" ON "legal_terms" USING btree ("term_type","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_legal_terms_acceptance_sort" ON "legal_terms" USING btree ("acceptance_status","sort_order","created_at");