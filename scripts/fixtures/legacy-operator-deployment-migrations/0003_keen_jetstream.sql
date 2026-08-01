CREATE TABLE "mice_program_accommodations_roomBlock" (
	"id" text PRIMARY KEY NOT NULL,
	"mice_program_id" text NOT NULL,
	"accommodations_roomBlock_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "operations_property_accommodations_roomBlock" (
	"id" text PRIMARY KEY NOT NULL,
	"operations_property_id" text NOT NULL,
	"accommodations_roomBlock_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "proposals_proposal_mice_program" (
	"id" text PRIMARY KEY NOT NULL,
	"proposals_proposal_id" text NOT NULL,
	"mice_program_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "relationships_organization_mice_program" (
	"id" text PRIMARY KEY NOT NULL,
	"relationships_organization_id" text NOT NULL,
	"mice_program_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "suppliers_supplier_accommodations_roomBlock" (
	"id" text PRIMARY KEY NOT NULL,
	"suppliers_supplier_id" text NOT NULL,
	"accommodations_roomBlock_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE UNIQUE INDEX "mice_program_accommodations_roomBlock_pair_idx" ON "mice_program_accommodations_roomBlock" USING btree ("mice_program_id","accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "mice_program_accommodations_roomBlock_l_idx" ON "mice_program_accommodations_roomBlock" USING btree ("mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "mice_program_accommodations_roomBlock_r_uniq" ON "mice_program_accommodations_roomBlock" USING btree ("accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_property_accommodations_roomBlock_pair_idx" ON "operations_property_accommodations_roomBlock" USING btree ("operations_property_id","accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "operations_property_accommodations_roomBlock_l_idx" ON "operations_property_accommodations_roomBlock" USING btree ("operations_property_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "operations_property_accommodations_roomBlock_r_uniq" ON "operations_property_accommodations_roomBlock" USING btree ("accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_proposal_mice_program_pair_idx" ON "proposals_proposal_mice_program" USING btree ("proposals_proposal_id","mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_proposal_mice_program_l_uniq" ON "proposals_proposal_mice_program" USING btree ("proposals_proposal_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "proposals_proposal_mice_program_r_uniq" ON "proposals_proposal_mice_program" USING btree ("mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_organization_mice_program_pair_idx" ON "relationships_organization_mice_program" USING btree ("relationships_organization_id","mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "relationships_organization_mice_program_l_idx" ON "relationships_organization_mice_program" USING btree ("relationships_organization_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "relationships_organization_mice_program_r_uniq" ON "relationships_organization_mice_program" USING btree ("mice_program_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_supplier_accommodations_roomBlock_pair_idx" ON "suppliers_supplier_accommodations_roomBlock" USING btree ("suppliers_supplier_id","accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE INDEX "suppliers_supplier_accommodations_roomBlock_l_idx" ON "suppliers_supplier_accommodations_roomBlock" USING btree ("suppliers_supplier_id") WHERE "deleted_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "suppliers_supplier_accommodations_roomBlock_r_uniq" ON "suppliers_supplier_accommodations_roomBlock" USING btree ("accommodations_roomBlock_id") WHERE "deleted_at" IS NULL;