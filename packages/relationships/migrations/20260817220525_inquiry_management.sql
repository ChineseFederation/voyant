CREATE TYPE "public"."inquiry_close_outcome" AS ENUM('lost', 'not_serviceable', 'no_response', 'duplicate', 'spam', 'customer_withdrew', 'other');--> statement-breakpoint
CREATE TYPE "public"."inquiry_kind" AS ENUM('product', 'custom_trip', 'general');--> statement-breakpoint
CREATE TYPE "public"."inquiry_status" AS ENUM('new', 'triaged', 'in_progress', 'waiting_on_customer', 'qualified', 'converted', 'closed');--> statement-breakpoint
CREATE TABLE "inquiries" (
	"id" text PRIMARY KEY NOT NULL,
	"subject" text NOT NULL,
	"kind" "inquiry_kind" NOT NULL,
	"status" "inquiry_status" DEFAULT 'new' NOT NULL,
	"close_outcome" "inquiry_close_outcome",
	"close_note" text,
	"duplicate_of_inquiry_id" text,
	"priority" text DEFAULT 'normal' NOT NULL,
	"person_id" text,
	"organization_id" text,
	"contact_snapshot" jsonb NOT NULL,
	"owner_id" text,
	"team_id" text,
	"unassigned_reason" text,
	"next_action_at" timestamp with time zone,
	"first_response_due_at" timestamp with time zone,
	"first_responded_at" timestamp with time zone,
	"travel_brief" jsonb,
	"customer_message" text,
	"internal_summary" text,
	"source" text NOT NULL,
	"source_ref" text,
	"source_url" text,
	"locale" text,
	"consent_snapshot" jsonb,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"custom_fields" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"last_activity_at" timestamp with time zone,
	"qualified_at" timestamp with time zone,
	"converted_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_person_id_people_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."people"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "public"."organizations"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiries" ADD CONSTRAINT "inquiries_duplicate_of_inquiry_id_inquiries_id_fk" FOREIGN KEY ("duplicate_of_inquiry_id") REFERENCES "public"."inquiries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_inquiries_source_ref" ON "inquiries" USING btree ("source","source_ref") WHERE "inquiries"."source_ref" is not null;--> statement-breakpoint
CREATE INDEX "idx_inquiries_status_next_action" ON "inquiries" USING btree ("status","next_action_at");--> statement-breakpoint
CREATE INDEX "idx_inquiries_owner_status" ON "inquiries" USING btree ("owner_id","status");--> statement-breakpoint
CREATE INDEX "idx_inquiries_team_status" ON "inquiries" USING btree ("team_id","status");--> statement-breakpoint
CREATE INDEX "idx_inquiries_person" ON "inquiries" USING btree ("person_id");--> statement-breakpoint
CREATE INDEX "idx_inquiries_organization" ON "inquiries" USING btree ("organization_id");--> statement-breakpoint
CREATE INDEX "idx_inquiries_duplicate" ON "inquiries" USING btree ("duplicate_of_inquiry_id");--> statement-breakpoint
CREATE INDEX "idx_inquiries_created" ON "inquiries" USING btree ("created_at");
