DO $$ BEGIN
 CREATE TYPE "public"."storefront_verification_channel" AS ENUM('email', 'sms');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."storefront_verification_status" AS ENUM('pending', 'verified', 'expired', 'failed', 'cancelled');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
CREATE TABLE "storefront_verification_challenges" (
	"id" text PRIMARY KEY NOT NULL,
	"channel" "storefront_verification_channel" NOT NULL,
	"destination" text NOT NULL,
	"purpose" text DEFAULT 'contact_confirmation' NOT NULL,
	"code_hash" text NOT NULL,
	"status" "storefront_verification_status" DEFAULT 'pending' NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"max_attempts" integer DEFAULT 5 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"verified_at" timestamp with time zone,
	"failed_at" timestamp with time zone,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_channel" ON "storefront_verification_challenges" USING btree ("channel");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_destination" ON "storefront_verification_challenges" USING btree ("destination");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_purpose" ON "storefront_verification_challenges" USING btree ("purpose");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_status" ON "storefront_verification_challenges" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_lookup" ON "storefront_verification_challenges" USING btree ("channel","destination","purpose","updated_at","created_at");