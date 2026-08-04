DO $$ BEGIN
 CREATE TYPE "public"."booking_extra_status" AS ENUM('draft', 'selected', 'confirmed', 'cancelled', 'fulfilled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."extra_collection_mode" AS ENUM('booking_total', 'cash_on_trip', 'external', 'included', 'none');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."extra_collection_status" AS ENUM('not_required', 'pending', 'collected', 'waived', 'refunded');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."extra_participant_selection_status" AS ENUM('selected', 'cancelled', 'fulfilled', 'no_show');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."extra_pricing_mode" AS ENUM('included', 'per_person', 'per_booking', 'quantity_based', 'on_request', 'free');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."extra_selection_type" AS ENUM('optional', 'required', 'default_selected', 'unavailable');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_answer_target" AS ENUM('booking', 'traveler', 'extra');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_question_field_type" AS ENUM('text', 'textarea', 'number', 'email', 'phone', 'date', 'datetime', 'boolean', 'single_select', 'multi_select', 'file', 'country', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_question_target" AS ENUM('booking', 'traveler', 'lead_traveler', 'booker', 'extra', 'service');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_question_trigger_mode" AS ENUM('required', 'optional', 'hidden');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contact_requirement_field" AS ENUM('first_name', 'last_name', 'email', 'phone', 'date_of_birth', 'nationality', 'passport_number', 'passport_expiry', 'dietary_requirements', 'accessibility_needs', 'special_requests', 'address', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."contact_requirement_scope" AS ENUM('booking', 'lead_traveler', 'traveler', 'booker');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_group_kind" AS ENUM('shared_room', 'cruise_party', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_group_member_role" AS ENUM('primary', 'shared');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_activity_type" AS ENUM('booking_created', 'booking_reserved', 'booking_converted', 'booking_confirmed', 'booking_started', 'booking_completed', 'hold_extended', 'hold_expired', 'status_change', 'status_overridden', 'item_update', 'allocation_released', 'fulfillment_issued', 'fulfillment_updated', 'redemption_recorded', 'supplier_update', 'traveler_update', 'note_added', 'system_action');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_allocation_status" AS ENUM('held', 'confirmed', 'released', 'expired', 'cancelled', 'fulfilled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_allocation_type" AS ENUM('unit', 'pickup', 'resource');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_document_type" AS ENUM('visa', 'insurance', 'health', 'passport_copy', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_fulfillment_delivery_channel" AS ENUM('download', 'email', 'api', 'wallet', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_fulfillment_status" AS ENUM('pending', 'issued', 'reissued', 'revoked', 'failed');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_fulfillment_type" AS ENUM('voucher', 'ticket', 'pdf', 'qr_code', 'barcode', 'mobile', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_item_participant_role" AS ENUM('traveler', 'occupant', 'beneficiary', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_item_status" AS ENUM('draft', 'on_hold', 'confirmed', 'cancelled', 'expired', 'fulfilled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_item_type" AS ENUM('unit', 'extra', 'service', 'fee', 'tax', 'discount', 'adjustment', 'accommodation', 'transport', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_participant_type" AS ENUM('traveler', 'occupant', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_pii_access_action" AS ENUM('read', 'update', 'delete');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_pii_access_outcome" AS ENUM('allowed', 'denied');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_redemption_method" AS ENUM('manual', 'scan', 'api', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_source_type" AS ENUM('direct', 'manual', 'affiliate', 'ota', 'reseller', 'api_partner', 'internal');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_staff_assignment_role" AS ENUM('service_assignee', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_status" AS ENUM('draft', 'on_hold', 'awaiting_payment', 'confirmed', 'in_progress', 'completed', 'expired', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."booking_traveler_category" AS ENUM('adult', 'child', 'infant', 'senior', 'other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."supplier_confirmation_status" AS ENUM('pending', 'confirmed', 'rejected', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "booking_extras" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"product_extra_id" text,
	"option_extra_config_id" text,
	"name" text NOT NULL,
	"description" text,
	"status" "booking_extra_status" DEFAULT 'draft' NOT NULL,
	"pricing_mode" "extra_pricing_mode" DEFAULT 'per_booking' NOT NULL,
	"priced_per_person" boolean DEFAULT false NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sell_currency" text NOT NULL,
	"unit_sell_amount_cents" integer,
	"total_sell_amount_cents" integer,
	"cost_currency" text,
	"unit_cost_amount_cents" integer,
	"total_cost_amount_cents" integer,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "extra_participant_selections" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"traveler_id" text NOT NULL,
	"product_extra_id" text NOT NULL,
	"option_extra_config_id" text,
	"status" "extra_participant_selection_status" DEFAULT 'selected' NOT NULL,
	"collection_mode" "extra_collection_mode" DEFAULT 'booking_total' NOT NULL,
	"collection_status" "extra_collection_status" DEFAULT 'not_required' NOT NULL,
	"collection_currency" text,
	"collection_amount_cents" integer,
	"collected_at" timestamp with time zone,
	"collected_by" text,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_answers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"booking_traveler_id" text,
	"booking_extra_id" text,
	"target" "booking_answer_target" DEFAULT 'booking' NOT NULL,
	"value_text" text,
	"value_number" integer,
	"value_boolean" boolean,
	"value_json" jsonb,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_extra_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"product_extra_id" text,
	"option_extra_config_id" text,
	"trigger_mode" "booking_question_trigger_mode" DEFAULT 'required' NOT NULL,
	"min_quantity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_option_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"option_id" text NOT NULL,
	"trigger_mode" "booking_question_trigger_mode" DEFAULT 'required' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_options" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"value" text NOT NULL,
	"label" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_question_unit_triggers" (
	"id" text PRIMARY KEY NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"unit_id" text NOT NULL,
	"trigger_mode" "booking_question_trigger_mode" DEFAULT 'required' NOT NULL,
	"min_quantity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "option_booking_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"option_id" text NOT NULL,
	"product_booking_question_id" text NOT NULL,
	"is_required_override" boolean,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_booking_questions" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"code" text,
	"label" text NOT NULL,
	"description" text,
	"target" "booking_question_target" DEFAULT 'booking' NOT NULL,
	"field_type" "booking_question_field_type" DEFAULT 'text' NOT NULL,
	"placeholder" text,
	"help_text" text,
	"is_required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_contact_requirements" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"field_key" "contact_requirement_field" NOT NULL,
	"scope" "contact_requirement_scope" DEFAULT 'traveler' NOT NULL,
	"is_required" boolean DEFAULT false NOT NULL,
	"per_traveler" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_traveler_travel_details" (
	"traveler_id" text PRIMARY KEY NOT NULL,
	"identity_encrypted" jsonb,
	"dietary_encrypted" jsonb,
	"accessibility_encrypted" jsonb,
	"document_person_document_id" text,
	"is_lead_traveler" boolean DEFAULT false NOT NULL,
	"sharing_group_id" text,
	"room_type_id" text,
	"bed_preference" text,
	"allocations" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_pii_access_log" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text,
	"traveler_id" text,
	"actor_id" text,
	"actor_type" text,
	"caller_type" text,
	"action" "booking_pii_access_action" NOT NULL,
	"outcome" "booking_pii_access_outcome" NOT NULL,
	"reason" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_travelers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"person_id" text,
	"participant_type" "booking_participant_type" DEFAULT 'traveler' NOT NULL,
	"traveler_category" "booking_traveler_category",
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"preferred_language" text,
	"special_requests" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bookings" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_number" text NOT NULL,
	"status" "booking_status" DEFAULT 'draft' NOT NULL,
	"person_id" text,
	"organization_id" text,
	"source_type" "booking_source_type" DEFAULT 'manual' NOT NULL,
	"external_booking_ref" text,
	"communication_language" text,
	"contact_first_name" text,
	"contact_last_name" text,
	"contact_party_type" text,
	"contact_tax_id" text,
	"contact_email" text,
	"contact_phone" text,
	"contact_preferred_language" text,
	"contact_country" text,
	"contact_region" text,
	"contact_city" text,
	"contact_address_line1" text,
	"contact_address_line2" text,
	"contact_postal_code" text,
	"sell_currency" text NOT NULL,
	"base_currency" text,
	"fx_rate_set_id" text,
	"sell_amount_cents" integer,
	"base_sell_amount_cents" integer,
	"cost_amount_cents" integer,
	"base_cost_amount_cents" integer,
	"margin_percent" integer,
	"start_date" date,
	"end_date" date,
	"pax" integer,
	"internal_notes" text,
	"customer_payment_policy" jsonb,
	"price_override" jsonb,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"expired_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"awaiting_payment_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"redeemed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bookings_booking_number_unique" UNIQUE("booking_number"),
	CONSTRAINT "ck_bookings_base_currency_amounts" CHECK (("bookings"."base_sell_amount_cents" IS NULL AND "bookings"."base_cost_amount_cents" IS NULL) OR "bookings"."base_currency" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "booking_group_members" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"booking_id" text NOT NULL,
	"role" "booking_group_member_role" DEFAULT 'shared' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" "booking_group_kind" DEFAULT 'shared_room' NOT NULL,
	"label" text NOT NULL,
	"primary_booking_id" text,
	"product_id" text,
	"option_unit_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_allocations" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text NOT NULL,
	"product_id" text,
	"option_id" text,
	"option_unit_id" text,
	"pricing_category_id" text,
	"availability_slot_id" text,
	"quantity" integer DEFAULT 1 NOT NULL,
	"allocation_type" "booking_allocation_type" DEFAULT 'unit' NOT NULL,
	"status" "booking_allocation_status" DEFAULT 'held' NOT NULL,
	"hold_expires_at" timestamp with time zone,
	"confirmed_at" timestamp with time zone,
	"released_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_fulfillments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"traveler_id" text,
	"fulfillment_type" "booking_fulfillment_type" NOT NULL,
	"delivery_channel" "booking_fulfillment_delivery_channel" NOT NULL,
	"status" "booking_fulfillment_status" DEFAULT 'pending' NOT NULL,
	"artifact_url" text,
	"payload" jsonb,
	"issued_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_item_travelers" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_item_id" text NOT NULL,
	"traveler_id" text NOT NULL,
	"role" "booking_item_participant_role" DEFAULT 'traveler' NOT NULL,
	"is_primary" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_items" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"item_type" "booking_item_type" DEFAULT 'unit' NOT NULL,
	"status" "booking_item_status" DEFAULT 'draft' NOT NULL,
	"service_date" date,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"quantity" integer DEFAULT 1 NOT NULL,
	"sell_currency" text NOT NULL,
	"unit_sell_amount_cents" integer,
	"total_sell_amount_cents" integer,
	"cost_currency" text,
	"unit_cost_amount_cents" integer,
	"total_cost_amount_cents" integer,
	"notes" text,
	"product_id" text,
	"option_id" text,
	"option_unit_id" text,
	"pricing_category_id" text,
	"availability_slot_id" text,
	"product_name_snapshot" text,
	"option_name_snapshot" text,
	"unit_name_snapshot" text,
	"departure_label_snapshot" text,
	"source_snapshot_id" text,
	"source_offer_id" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_booking_items_cost_currency_amounts" CHECK (("booking_items"."unit_cost_amount_cents" IS NULL AND "booking_items"."total_cost_amount_cents" IS NULL) OR "booking_items"."cost_currency" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "booking_redemption_events" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"traveler_id" text,
	"redeemed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"redeemed_by" text,
	"location" text,
	"method" "booking_redemption_method" DEFAULT 'manual' NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_activity_log" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"actor_id" text,
	"activity_type" "booking_activity_type" NOT NULL,
	"description" text NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_documents" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"traveler_id" text,
	"type" "booking_document_type" NOT NULL,
	"file_name" text NOT NULL,
	"file_url" text NOT NULL,
	"expires_at" timestamp with time zone,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_notes" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"author_id" text NOT NULL,
	"content" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_session_states" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"state_key" text DEFAULT 'wizard' NOT NULL,
	"current_step" text,
	"completed_steps" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_supplier_statuses" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"supplier_service_id" text,
	"supplier_id" text,
	"service_name" text NOT NULL,
	"status" "supplier_confirmation_status" DEFAULT 'pending' NOT NULL,
	"supplier_reference" text,
	"cost_currency" text NOT NULL,
	"cost_amount_cents" integer NOT NULL,
	"supplier_invoice_line_id" text,
	"notes" text,
	"confirmed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "booking_origins" (
	"booking_id" text PRIMARY KEY NOT NULL,
	"origin_source" text DEFAULT 'manual' NOT NULL,
	"quote_version_id" text,
	"trip_snapshot_id" text,
	"reservation_plan_id" text,
	"catalog_price_response_id" text,
	"catalog_snapshot_id" text,
	"provider_source_kind" text,
	"provider_source_provider" text,
	"provider_source_connection_id" text,
	"provider_source_ref" text,
	"provider_order_ref" text,
	"legacy_transaction_offer_id" text,
	"legacy_transaction_order_id" text,
	"legacy_transaction_ids" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ck_booking_origins_source" CHECK ("booking_origins"."origin_source" IN ('manual', 'direct_b2c', 'accepted_quote_version', 'catalog_price_availability', 'catalog_snapshot', 'provider_source_order', 'legacy_transaction'))
);
--> statement-breakpoint
CREATE TABLE "booking_staff_assignments" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_id" text NOT NULL,
	"booking_item_id" text,
	"person_id" text,
	"role" "booking_staff_assignment_role" DEFAULT 'service_assignee' NOT NULL,
	"first_name" text NOT NULL,
	"last_name" text NOT NULL,
	"email" text,
	"phone" text,
	"preferred_language" text,
	"is_primary" boolean DEFAULT false NOT NULL,
	"notes" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "booking_answers" ADD CONSTRAINT "booking_answers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_extra_triggers" ADD CONSTRAINT "booking_question_extra_triggers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_option_triggers" ADD CONSTRAINT "booking_question_option_triggers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_options" ADD CONSTRAINT "booking_question_options_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_question_unit_triggers" ADD CONSTRAINT "booking_question_unit_triggers_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "option_booking_questions" ADD CONSTRAINT "option_booking_questions_product_booking_question_id_product_booking_questions_id_fk" FOREIGN KEY ("product_booking_question_id") REFERENCES "public"."product_booking_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_traveler_travel_details" ADD CONSTRAINT "booking_traveler_travel_details_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_travelers" ADD CONSTRAINT "booking_travelers_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_group_members" ADD CONSTRAINT "booking_group_members_group_id_booking_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."booking_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_group_members" ADD CONSTRAINT "booking_group_members_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_allocations" ADD CONSTRAINT "booking_allocations_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_fulfillments" ADD CONSTRAINT "booking_fulfillments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_fulfillments" ADD CONSTRAINT "booking_fulfillments_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_fulfillments" ADD CONSTRAINT "booking_fulfillments_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item_travelers" ADD CONSTRAINT "booking_item_travelers_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_item_travelers" ADD CONSTRAINT "booking_item_travelers_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_items" ADD CONSTRAINT "booking_items_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_redemption_events" ADD CONSTRAINT "booking_redemption_events_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_redemption_events" ADD CONSTRAINT "booking_redemption_events_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_redemption_events" ADD CONSTRAINT "booking_redemption_events_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_activity_log" ADD CONSTRAINT "booking_activity_log_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_documents" ADD CONSTRAINT "booking_documents_traveler_id_booking_travelers_id_fk" FOREIGN KEY ("traveler_id") REFERENCES "public"."booking_travelers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_notes" ADD CONSTRAINT "booking_notes_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_session_states" ADD CONSTRAINT "booking_session_states_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_supplier_statuses" ADD CONSTRAINT "booking_supplier_statuses_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_origins" ADD CONSTRAINT "booking_origins_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff_assignments" ADD CONSTRAINT "booking_staff_assignments_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_staff_assignments" ADD CONSTRAINT "booking_staff_assignments_booking_item_id_booking_items_id_fk" FOREIGN KEY ("booking_item_id") REFERENCES "public"."booking_items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_booking_extras_updated" ON "booking_extras" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_booking_updated" ON "booking_extras" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_product_extra_updated" ON "booking_extras" USING btree ("product_extra_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_option_extra_config_updated" ON "booking_extras" USING btree ("option_extra_config_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_extras_status_updated" ON "booking_extras" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_booking_updated" ON "extra_participant_selections" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_traveler_updated" ON "extra_participant_selections" USING btree ("traveler_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_extra_updated" ON "extra_participant_selections" USING btree ("product_extra_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_status_updated" ON "extra_participant_selections" USING btree ("status","updated_at");--> statement-breakpoint
CREATE INDEX "idx_extra_participant_selections_collection_updated" ON "extra_participant_selections" USING btree ("collection_status","updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_extra_participant_selection" ON "extra_participant_selections" USING btree ("booking_id","traveler_id","product_extra_id");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_booking_updated" ON "booking_answers" USING btree ("booking_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_question_updated" ON "booking_answers" USING btree ("product_booking_question_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_traveler_updated" ON "booking_answers" USING btree ("booking_traveler_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_booking_extra_updated" ON "booking_answers" USING btree ("booking_extra_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_answers_target_updated" ON "booking_answers" USING btree ("target","updated_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_created" ON "booking_question_extra_triggers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_question_created" ON "booking_question_extra_triggers" USING btree ("product_booking_question_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_product_extra_created" ON "booking_question_extra_triggers" USING btree ("product_extra_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_option_extra_config_created" ON "booking_question_extra_triggers" USING btree ("option_extra_config_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_extra_triggers_active_created" ON "booking_question_extra_triggers" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_created" ON "booking_question_option_triggers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_question_created" ON "booking_question_option_triggers" USING btree ("product_booking_question_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_option_created" ON "booking_question_option_triggers" USING btree ("option_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_option_triggers_active_created" ON "booking_question_option_triggers" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_question_option_triggers_question_option" ON "booking_question_option_triggers" USING btree ("product_booking_question_id","option_id");--> statement-breakpoint
CREATE INDEX "idx_booking_question_options_sort" ON "booking_question_options" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_booking_question_options_question_sort" ON "booking_question_options" USING btree ("product_booking_question_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_booking_question_options_active_sort" ON "booking_question_options" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_question_options_question_value" ON "booking_question_options" USING btree ("product_booking_question_id","value");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_created" ON "booking_question_unit_triggers" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_question_created" ON "booking_question_unit_triggers" USING btree ("product_booking_question_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_unit_created" ON "booking_question_unit_triggers" USING btree ("unit_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_question_unit_triggers_active_created" ON "booking_question_unit_triggers" USING btree ("active","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_question_unit_triggers_question_unit" ON "booking_question_unit_triggers" USING btree ("product_booking_question_id","unit_id");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_sort" ON "option_booking_questions" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_option_sort" ON "option_booking_questions" USING btree ("option_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_question_sort" ON "option_booking_questions" USING btree ("product_booking_question_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_option_booking_questions_active_sort" ON "option_booking_questions" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_option_booking_questions_option_question" ON "option_booking_questions" USING btree ("option_id","product_booking_question_id");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_sort" ON "product_booking_questions" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_product_sort" ON "product_booking_questions" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_target_sort" ON "product_booking_questions" USING btree ("target","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_field_type_sort" ON "product_booking_questions" USING btree ("field_type","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_booking_questions_active_sort" ON "product_booking_questions" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_booking_questions_product_code" ON "product_booking_questions" USING btree ("product_id","code");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_sort" ON "product_contact_requirements" USING btree ("sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_product_sort" ON "product_contact_requirements" USING btree ("product_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_option_sort" ON "product_contact_requirements" USING btree ("option_id","sort_order");--> statement-breakpoint
CREATE INDEX "idx_product_contact_requirements_active_sort" ON "product_contact_requirements" USING btree ("active","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_product_contact_requirements_scope_field" ON "product_contact_requirements" USING btree ("product_id","option_id","scope","field_key");--> statement-breakpoint
CREATE INDEX "idx_bptd_lead_traveler" ON "booking_traveler_travel_details" USING btree ("is_lead_traveler");--> statement-breakpoint
CREATE INDEX "idx_bptd_sharing_group" ON "booking_traveler_travel_details" USING btree ("sharing_group_id");--> statement-breakpoint
CREATE INDEX "idx_bptd_room_type" ON "booking_traveler_travel_details" USING btree ("room_type_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_booking" ON "booking_pii_access_log" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_traveler" ON "booking_pii_access_log" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_actor" ON "booking_pii_access_log" USING btree ("actor_id");--> statement-breakpoint
CREATE INDEX "idx_booking_pii_access_log_created_at" ON "booking_pii_access_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_booking" ON "booking_travelers" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_booking_primary_created" ON "booking_travelers" USING btree ("booking_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_booking_type_created" ON "booking_travelers" USING btree ("booking_id","participant_type","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_type" ON "booking_travelers" USING btree ("participant_type");--> statement-breakpoint
CREATE INDEX "idx_booking_travelers_person" ON "booking_travelers" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_status" ON "bookings" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_bookings_status_created" ON "bookings" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "idx_bookings_person" ON "bookings" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_organization" ON "bookings" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_bookings_source_type" ON "bookings" USING btree ("source_type");--> statement-breakpoint
CREATE INDEX "idx_bookings_number" ON "bookings" USING btree ("booking_number");--> statement-breakpoint
CREATE UNIQUE INDEX "booking_group_members_booking_unique" ON "booking_group_members" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_group_members_group_created" ON "booking_group_members" USING btree ("group_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_groups_kind_created" ON "booking_groups" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_groups_product_created" ON "booking_groups" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_groups_option_unit_created" ON "booking_groups" USING btree ("option_unit_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_booking" ON "booking_allocations" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_booking_created" ON "booking_allocations" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_item" ON "booking_allocations" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_slot" ON "booking_allocations" USING btree ("availability_slot_id");--> statement-breakpoint
CREATE INDEX "idx_booking_allocations_status" ON "booking_allocations" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_booking" ON "booking_fulfillments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_booking_created" ON "booking_fulfillments" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_item" ON "booking_fulfillments" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_traveler" ON "booking_fulfillments" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_fulfillments_status" ON "booking_fulfillments" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_item_travelers_item" ON "booking_item_travelers" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_item_travelers_item_primary_created" ON "booking_item_travelers" USING btree ("booking_item_id","is_primary","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_item_travelers_traveler" ON "booking_item_travelers" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_items_booking" ON "booking_items" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_items_booking_created" ON "booking_items" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_items_status" ON "booking_items" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_booking" ON "booking_redemption_events" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_booking_redeemed_created" ON "booking_redemption_events" USING btree ("booking_id","redeemed_at","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_item" ON "booking_redemption_events" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_traveler" ON "booking_redemption_events" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_redemption_events_redeemed_at" ON "booking_redemption_events" USING btree ("redeemed_at");--> statement-breakpoint
CREATE INDEX "idx_booking_activity_log_booking" ON "booking_activity_log" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_activity_log_booking_created" ON "booking_activity_log" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_documents_booking" ON "booking_documents" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_documents_booking_created" ON "booking_documents" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_documents_traveler" ON "booking_documents" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_booking_notes_booking" ON "booking_notes" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_notes_booking_created" ON "booking_notes" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_session_states_booking" ON "booking_session_states" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_session_states_key" ON "booking_session_states" USING btree ("state_key");--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_booking_session_states_booking_key" ON "booking_session_states" USING btree ("booking_id","state_key");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_booking" ON "booking_supplier_statuses" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_booking_created" ON "booking_supplier_statuses" USING btree ("booking_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_service" ON "booking_supplier_statuses" USING btree ("supplier_service_id");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_supplier" ON "booking_supplier_statuses" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "idx_booking_supplier_statuses_invoice_line" ON "booking_supplier_statuses" USING btree ("supplier_invoice_line_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_quote_version" ON "booking_origins" USING btree ("quote_version_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_trip_snapshot" ON "booking_origins" USING btree ("trip_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_reservation_plan" ON "booking_origins" USING btree ("reservation_plan_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_catalog_price_response" ON "booking_origins" USING btree ("catalog_price_response_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_catalog_snapshot" ON "booking_origins" USING btree ("catalog_snapshot_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_provider_order" ON "booking_origins" USING btree ("provider_order_ref");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_legacy_offer" ON "booking_origins" USING btree ("legacy_transaction_offer_id");--> statement-breakpoint
CREATE INDEX "idx_booking_origins_legacy_order" ON "booking_origins" USING btree ("legacy_transaction_order_id");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_booking" ON "booking_staff_assignments" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_booking_role_created" ON "booking_staff_assignments" USING btree ("booking_id","role","created_at");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_item" ON "booking_staff_assignments" USING btree ("booking_item_id");--> statement-breakpoint
CREATE INDEX "idx_booking_staff_assignments_person" ON "booking_staff_assignments" USING btree ("person_id");