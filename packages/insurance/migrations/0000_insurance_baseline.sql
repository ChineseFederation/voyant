DO $$ BEGIN
 CREATE TYPE "public"."insurance_application_status" AS ENUM('open', 'submitted', 'accepted', 'declined', 'expired', 'withdrawn');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."insurance_policy_issue_state" AS ENUM('pending', 'issued', 'issue_failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "insurance_applications" (
	"id" text PRIMARY KEY NOT NULL,
	"booking_session_id" text,
	"booking_id" text,
	"source_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"provider_application_ref" text,
	"quote_ref" text NOT NULL,
	"title" text NOT NULL,
	"plan_name" text,
	"plan_label" text,
	"status" insurance_application_status DEFAULT 'open' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"premium_amount_minor" integer NOT NULL,
	"premium_currency" text NOT NULL,
	"eligibility_status" text DEFAULT 'eligible' NOT NULL,
	"eligibility_reasons" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"selected_optional_cover_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"accepted_disclosures" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"contracting_party_encrypted" jsonb,
	"answers_encrypted" jsonb,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_insured_persons" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"policy_id" text,
	"ref" text NOT NULL,
	"display_initial" text,
	"booking_traveler_id" text,
	"identity_encrypted" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "insurance_policies" (
	"id" text PRIMARY KEY NOT NULL,
	"application_id" text NOT NULL,
	"booking_id" text,
	"provider_id" text NOT NULL,
	"policy_number" text,
	"issue_state" insurance_policy_issue_state DEFAULT 'pending' NOT NULL,
	"issued_at" timestamp with time zone,
	"effective_from" date NOT NULL,
	"effective_to" date NOT NULL,
	"premium_amount_minor" integer NOT NULL,
	"premium_currency" text NOT NULL,
	"sum_insured_amount_minor" integer,
	"sum_insured_currency" text,
	"covers" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"documents" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"failure_code" text,
	"failure_message" text,
	"failure_retryable" boolean,
	"failure_occurred_at" timestamp with time zone,
	"issue_attempts" integer DEFAULT 0 NOT NULL,
	"cancelled_at" timestamp with time zone,
	"cancellation_reason" text,
	"refund_amount_minor" integer,
	"refund_currency" text,
	"provider_reference" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "insurance_insured_persons" ADD CONSTRAINT "insurance_insured_persons_application_id_insurance_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."insurance_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_insured_persons" ADD CONSTRAINT "insurance_insured_persons_policy_id_insurance_policies_id_fk" FOREIGN KEY ("policy_id") REFERENCES "public"."insurance_policies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "insurance_policies" ADD CONSTRAINT "insurance_policies_application_id_insurance_applications_id_fk" FOREIGN KEY ("application_id") REFERENCES "public"."insurance_applications"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_insurance_applications_booking" ON "insurance_applications" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_insurance_applications_session" ON "insurance_applications" USING btree ("booking_session_id");--> statement-breakpoint
CREATE INDEX "idx_insurance_applications_status" ON "insurance_applications" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_insurance_applications_provider" ON "insurance_applications" USING btree ("provider_id");--> statement-breakpoint
CREATE INDEX "idx_insurance_applications_expires" ON "insurance_applications" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_insurance_insured_persons_application_ref" ON "insurance_insured_persons" USING btree ("application_id","ref");--> statement-breakpoint
CREATE INDEX "idx_insurance_insured_persons_policy" ON "insurance_insured_persons" USING btree ("policy_id");--> statement-breakpoint
CREATE INDEX "idx_insurance_insured_persons_booking_traveler" ON "insurance_insured_persons" USING btree ("booking_traveler_id");--> statement-breakpoint
CREATE INDEX "idx_insurance_policies_application" ON "insurance_policies" USING btree ("application_id");--> statement-breakpoint
CREATE INDEX "idx_insurance_policies_booking" ON "insurance_policies" USING btree ("booking_id");--> statement-breakpoint
CREATE INDEX "idx_insurance_policies_issue_state" ON "insurance_policies" USING btree ("issue_state");--> statement-breakpoint
CREATE INDEX "idx_insurance_policies_provider" ON "insurance_policies" USING btree ("provider_id");
