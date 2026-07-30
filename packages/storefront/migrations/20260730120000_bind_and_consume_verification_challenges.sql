ALTER TABLE "storefront_verification_challenges"
ADD COLUMN "subject_ref" text;
--> statement-breakpoint
ALTER TABLE "storefront_verification_challenges"
ADD COLUMN "consumed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "storefront_verification_challenges"
ADD COLUMN "consumed_ref" text;
--> statement-breakpoint
CREATE INDEX "idx_storefront_verification_subject" ON "storefront_verification_challenges" ("purpose","subject_ref");
