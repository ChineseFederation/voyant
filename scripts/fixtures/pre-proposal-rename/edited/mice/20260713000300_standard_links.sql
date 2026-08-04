CREATE TABLE IF NOT EXISTS "quotes_quote_mice_program" (
	"id" text PRIMARY KEY NOT NULL,
	"quotes_quote_id" text NOT NULL,
	"mice_program_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationships_organization_mice_program" (
	"id" text PRIMARY KEY NOT NULL,
	"relationships_organization_id" text NOT NULL,
	"mice_program_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "operations_functionSpace_mice_session" (
	"id" text PRIMARY KEY NOT NULL,
	"operations_functionSpace_id" text NOT NULL,
	"mice_session_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "mice_program_operations_spaceBlock" (
	"id" text PRIMARY KEY NOT NULL,
	"mice_program_id" text NOT NULL,
	"operations_spaceBlock_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "accommodations_roomBlock_mice_roomingAssignment" (
	"id" text PRIMARY KEY NOT NULL,
	"accommodations_roomBlock_id" text NOT NULL,
	"mice_roomingAssignment_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bookings_booking_mice_delegate" (
	"id" text PRIMARY KEY NOT NULL,
	"bookings_booking_id" text NOT NULL,
	"mice_delegate_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "relationships_person_mice_delegate" (
	"id" text PRIMARY KEY NOT NULL,
	"relationships_person_id" text NOT NULL,
	"mice_delegate_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "suppliers_supplier_mice_bid" (
	"id" text PRIMARY KEY NOT NULL,
	"suppliers_supplier_id" text NOT NULL,
	"mice_bid_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_quote_mice_program_pair_idx" ON "quotes_quote_mice_program" USING btree ("quotes_quote_id","mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_quote_mice_program_l_uniq" ON "quotes_quote_mice_program" USING btree ("quotes_quote_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "quotes_quote_mice_program_r_uniq" ON "quotes_quote_mice_program" USING btree ("mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_organization_mice_program_pair_idx" ON "relationships_organization_mice_program" USING btree ("relationships_organization_id","mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_organization_mice_program_l_idx" ON "relationships_organization_mice_program" USING btree ("relationships_organization_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_organization_mice_program_r_uniq" ON "relationships_organization_mice_program" USING btree ("mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operations_functionSpace_mice_session_pair_idx" ON "operations_functionSpace_mice_session" USING btree ("operations_functionSpace_id","mice_session_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "operations_functionSpace_mice_session_l_idx" ON "operations_functionSpace_mice_session" USING btree ("operations_functionSpace_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "operations_functionSpace_mice_session_r_uniq" ON "operations_functionSpace_mice_session" USING btree ("mice_session_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mice_program_operations_spaceBlock_pair_idx" ON "mice_program_operations_spaceBlock" USING btree ("mice_program_id","operations_spaceBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "mice_program_operations_spaceBlock_l_idx" ON "mice_program_operations_spaceBlock" USING btree ("mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "mice_program_operations_spaceBlock_r_uniq" ON "mice_program_operations_spaceBlock" USING btree ("operations_spaceBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accommodations_roomBlock_mice_roomingAssignment_pair_idx" ON "accommodations_roomBlock_mice_roomingAssignment" USING btree ("accommodations_roomBlock_id","mice_roomingAssignment_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "accommodations_roomBlock_mice_roomingAssignment_l_idx" ON "accommodations_roomBlock_mice_roomingAssignment" USING btree ("accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "accommodations_roomBlock_mice_roomingAssignment_r_uniq" ON "accommodations_roomBlock_mice_roomingAssignment" USING btree ("mice_roomingAssignment_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_booking_mice_delegate_pair_idx" ON "bookings_booking_mice_delegate" USING btree ("bookings_booking_id","mice_delegate_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_booking_mice_delegate_l_uniq" ON "bookings_booking_mice_delegate" USING btree ("bookings_booking_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "bookings_booking_mice_delegate_r_uniq" ON "bookings_booking_mice_delegate" USING btree ("mice_delegate_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_person_mice_delegate_pair_idx" ON "relationships_person_mice_delegate" USING btree ("relationships_person_id","mice_delegate_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "relationships_person_mice_delegate_l_idx" ON "relationships_person_mice_delegate" USING btree ("relationships_person_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "relationships_person_mice_delegate_r_uniq" ON "relationships_person_mice_delegate" USING btree ("mice_delegate_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_supplier_mice_bid_pair_idx" ON "suppliers_supplier_mice_bid" USING btree ("suppliers_supplier_id","mice_bid_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "suppliers_supplier_mice_bid_l_idx" ON "suppliers_supplier_mice_bid" USING btree ("suppliers_supplier_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "suppliers_supplier_mice_bid_r_uniq" ON "suppliers_supplier_mice_bid" USING btree ("mice_bid_id") WHERE "deleted_at" IS NULL;
