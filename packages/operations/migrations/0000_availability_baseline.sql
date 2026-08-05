DO $$ BEGIN
 CREATE TYPE "public"."availability_slot_status" AS ENUM('open', 'closed', 'sold_out', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."meeting_mode" AS ENUM('meeting_only', 'pickup_only', 'meet_or_pickup');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."pickup_group_kind" AS ENUM('pickup', 'dropoff', 'meeting');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."pickup_timing_mode" AS ENUM('fixed_time', 'offset_from_start');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "allocation_audit_log" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" text,
	"traveler_id" text,
	"resource_id" text,
	"before" jsonb,
	"after" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "allocation_resources" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"label" text,
	"capacity" integer NOT NULL,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"parent_id" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_closeouts" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"slot_id" text,
	"date_local" date NOT NULL,
	"reason" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_rules" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"facility_id" text,
	"timezone" text NOT NULL,
	"recurrence_rule" text NOT NULL,
	"max_capacity" integer NOT NULL,
	"max_pickup_capacity" integer,
	"min_total_pax" integer,
	"cutoff_minutes" integer,
	"early_booking_limit_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slots" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"itinerary_id" text,
	"option_id" text,
	"facility_id" text,
	"availability_rule_id" text,
	"start_time_id" text,
	"date_local" date NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"timezone" text NOT NULL,
	"status" "availability_slot_status" DEFAULT 'open' NOT NULL,
	"unlimited" boolean DEFAULT false NOT NULL,
	"initial_pax" integer,
	"remaining_pax" integer,
	"initial_pickups" integer,
	"remaining_pickups" integer,
	"remaining_resources" integer,
	"past_cutoff" boolean DEFAULT false NOT NULL,
	"too_early" boolean DEFAULT false NOT NULL,
	"nights" integer,
	"days" integer,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_start_times" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"facility_id" text,
	"label" text,
	"start_time_local" text NOT NULL,
	"duration_minutes" integer,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_option_resource_templates" (
	"id" text PRIMARY KEY NOT NULL,
	"product_option_id" text NOT NULL,
	"kind" text NOT NULL,
	"ref_type" text,
	"ref_id" text,
	"capacity" integer NOT NULL,
	"name_pattern" text NOT NULL,
	"layout" text,
	"default_count" integer,
	"flags" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sharing_group_labels" (
	"group_id" text PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_holds" (
	"id" text PRIMARY KEY NOT NULL,
	"draft_id" text NOT NULL,
	"hold_token" text NOT NULL,
	"product_id" text NOT NULL,
	"slot_id" text NOT NULL,
	"pax_count" integer NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"released_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_pickup_points" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"facility_id" text,
	"name" text NOT NULL,
	"description" text,
	"location_text" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "availability_slot_pickups" (
	"id" text PRIMARY KEY NOT NULL,
	"slot_id" text NOT NULL,
	"pickup_point_id" text NOT NULL,
	"initial_capacity" integer,
	"remaining_capacity" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_pickup_areas" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_config_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"geographic_text" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "location_pickup_times" (
	"id" text PRIMARY KEY NOT NULL,
	"pickup_location_id" text NOT NULL,
	"slot_id" text,
	"start_time_id" text,
	"timing_mode" "pickup_timing_mode" DEFAULT 'fixed_time' NOT NULL,
	"local_time" text,
	"offset_minutes" integer,
	"instructions" text,
	"initial_capacity" integer,
	"remaining_capacity" integer,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"meeting_config_id" text NOT NULL,
	"kind" "pickup_group_kind" NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pickup_locations" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"facility_id" text,
	"name" text NOT NULL,
	"description" text,
	"location_text" text,
	"lead_time_minutes" integer,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_meeting_configs" (
	"id" text PRIMARY KEY NOT NULL,
	"product_id" text NOT NULL,
	"option_id" text,
	"facility_id" text,
	"mode" "meeting_mode" DEFAULT 'meeting_only' NOT NULL,
	"allow_custom_pickup" boolean DEFAULT false NOT NULL,
	"allow_custom_dropoff" boolean DEFAULT false NOT NULL,
	"requires_pickup_selection" boolean DEFAULT false NOT NULL,
	"requires_dropoff_selection" boolean DEFAULT false NOT NULL,
	"use_pickup_allotment" boolean DEFAULT false NOT NULL,
	"meeting_instructions" text,
	"pickup_instructions" text,
	"dropoff_instructions" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "allocation_audit_log" ADD CONSTRAINT "allocation_audit_log_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "allocation_resources" ADD CONSTRAINT "allocation_resources_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_closeouts" ADD CONSTRAINT "availability_closeouts_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_availability_rule_id_availability_rules_id_fk" FOREIGN KEY ("availability_rule_id") REFERENCES "public"."availability_rules"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slots" ADD CONSTRAINT "availability_slots_start_time_id_availability_start_times_id_fk" FOREIGN KEY ("start_time_id") REFERENCES "public"."availability_start_times"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_holds" ADD CONSTRAINT "availability_holds_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slot_pickups" ADD CONSTRAINT "availability_slot_pickups_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "availability_slot_pickups" ADD CONSTRAINT "availability_slot_pickups_pickup_point_id_availability_pickup_points_id_fk" FOREIGN KEY ("pickup_point_id") REFERENCES "public"."availability_pickup_points"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_pickup_areas" ADD CONSTRAINT "custom_pickup_areas_meeting_config_id_product_meeting_configs_id_fk" FOREIGN KEY ("meeting_config_id") REFERENCES "public"."product_meeting_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pickup_times" ADD CONSTRAINT "location_pickup_times_pickup_location_id_pickup_locations_id_fk" FOREIGN KEY ("pickup_location_id") REFERENCES "public"."pickup_locations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pickup_times" ADD CONSTRAINT "location_pickup_times_slot_id_availability_slots_id_fk" FOREIGN KEY ("slot_id") REFERENCES "public"."availability_slots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "location_pickup_times" ADD CONSTRAINT "location_pickup_times_start_time_id_availability_start_times_id_fk" FOREIGN KEY ("start_time_id") REFERENCES "public"."availability_start_times"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_groups" ADD CONSTRAINT "pickup_groups_meeting_config_id_product_meeting_configs_id_fk" FOREIGN KEY ("meeting_config_id") REFERENCES "public"."product_meeting_configs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pickup_locations" ADD CONSTRAINT "pickup_locations_group_id_pickup_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."pickup_groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_allocation_audit_slot_created" ON "allocation_audit_log" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_allocation_audit_traveler" ON "allocation_audit_log" USING btree ("traveler_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_resources_slot_kind" ON "allocation_resources" USING btree ("slot_id","kind");--> statement-breakpoint
CREATE INDEX "idx_allocation_resources_parent" ON "allocation_resources" USING btree ("parent_id");--> statement-breakpoint
CREATE INDEX "idx_allocation_resources_kind_sort" ON "allocation_resources" USING btree ("kind","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_closeouts_product_created" ON "availability_closeouts" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_closeouts_slot_created" ON "availability_closeouts" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_closeouts_date_created" ON "availability_closeouts" USING btree ("date_local","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_updated" ON "availability_rules" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_product_updated" ON "availability_rules" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_option_updated" ON "availability_rules" USING btree ("option_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_facility_updated" ON "availability_rules" USING btree ("facility_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_rules_active_updated" ON "availability_rules" USING btree ("active","updated_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_product_starts_at" ON "availability_slots" USING btree ("product_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_itinerary_starts_at" ON "availability_slots" USING btree ("itinerary_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_option_starts_at" ON "availability_slots" USING btree ("option_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_facility_starts_at" ON "availability_slots" USING btree ("facility_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_rule_starts_at" ON "availability_slots" USING btree ("availability_rule_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_start_time_starts_at" ON "availability_slots" USING btree ("start_time_id","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_date_starts_at" ON "availability_slots" USING btree ("date_local","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_status_starts_at" ON "availability_slots" USING btree ("status","starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slots_starts_at" ON "availability_slots" USING btree ("starts_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_product_sort_created" ON "availability_start_times" USING btree ("product_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_option_sort_created" ON "availability_start_times" USING btree ("option_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_facility_sort_created" ON "availability_start_times" USING btree ("facility_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_start_times_active_sort_created" ON "availability_start_times" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "idx_product_option_resource_templates_option_kind" ON "product_option_resource_templates" USING btree ("product_option_id","kind",coalesce("ref_id", ''));--> statement-breakpoint
CREATE INDEX "idx_product_option_resource_templates_kind" ON "product_option_resource_templates" USING btree ("kind","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_slot" ON "availability_holds" USING btree ("slot_id");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_draft" ON "availability_holds" USING btree ("draft_id");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_token" ON "availability_holds" USING btree ("hold_token");--> statement-breakpoint
CREATE INDEX "idx_availability_holds_expires" ON "availability_holds" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_created" ON "availability_pickup_points" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_product_created" ON "availability_pickup_points" USING btree ("product_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_facility_created" ON "availability_pickup_points" USING btree ("facility_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_pickup_points_active_created" ON "availability_pickup_points" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slot_pickups_created" ON "availability_slot_pickups" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slot_pickups_slot_created" ON "availability_slot_pickups" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_availability_slot_pickups_pickup_point_created" ON "availability_slot_pickups" USING btree ("pickup_point_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_custom_pickup_areas_created" ON "custom_pickup_areas" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_custom_pickup_areas_meeting_config_created" ON "custom_pickup_areas" USING btree ("meeting_config_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_custom_pickup_areas_active_created" ON "custom_pickup_areas" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_created" ON "location_pickup_times" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_pickup_location_created" ON "location_pickup_times" USING btree ("pickup_location_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_slot_created" ON "location_pickup_times" USING btree ("slot_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_start_time_created" ON "location_pickup_times" USING btree ("start_time_id","created_at");--> statement-breakpoint
CREATE INDEX "idx_location_pickup_times_active_created" ON "location_pickup_times" USING btree ("active","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_sort_created" ON "pickup_groups" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_meeting_config_sort_created" ON "pickup_groups" USING btree ("meeting_config_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_kind_sort_created" ON "pickup_groups" USING btree ("kind","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_groups_active_sort_created" ON "pickup_groups" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_sort_created" ON "pickup_locations" USING btree ("sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_group_sort_created" ON "pickup_locations" USING btree ("group_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_facility_sort_created" ON "pickup_locations" USING btree ("facility_id","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_pickup_locations_active_sort_created" ON "pickup_locations" USING btree ("active","sort_order","created_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_updated" ON "product_meeting_configs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_product_updated" ON "product_meeting_configs" USING btree ("product_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_option_updated" ON "product_meeting_configs" USING btree ("option_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_facility_updated" ON "product_meeting_configs" USING btree ("facility_id","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_mode_updated" ON "product_meeting_configs" USING btree ("mode","updated_at");--> statement-breakpoint
CREATE INDEX "idx_product_meeting_configs_active_updated" ON "product_meeting_configs" USING btree ("active","updated_at");