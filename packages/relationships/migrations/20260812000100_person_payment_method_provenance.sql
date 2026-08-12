-- Give `person_payment_methods` a provider binding and a provenance (voyant#4587).
--
-- The table promised "processor-issued tokens … so the booking flow can charge
-- the customer without re-entering card details" and delivered a free-text note
-- an operator typed by hand. Nothing in the payment path could write to it,
-- because there was nowhere to record which provider issued a token, what the
-- customer had authorized it for, or whether it still worked.
--
-- Existing rows are all hand-entered, so they take `source = 'manual'`, an empty
-- `authorized_reuses` and a null `provider_id`. That is the honest description
-- of what they are: on the operator's own records, chargeable by nobody.
DO $$ BEGIN
 CREATE TYPE "public"."payment_method_source" AS ENUM('manual', 'payment');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."payment_method_status" AS ENUM('usable', 'requires_new_agreement', 'expired', 'revoked');
EXCEPTION WHEN duplicate_object THEN null;
END $$;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "source" "payment_method_source" DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "provider_id" text;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "provider_customer_reference" text;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "fingerprint" text;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "authorized_reuses" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "status" "payment_method_status" DEFAULT 'usable' NOT NULL;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "agreement_reference" text;--> statement-breakpoint
ALTER TABLE "person_payment_methods" ADD COLUMN IF NOT EXISTS "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Idempotent projection: one provider token is one instrument, so a replayed
-- callback and a status poll reporting the same card converge on one row.
-- Partial because manual "tokens" are prose and collide freely — two operators
-- typing the same reminder must not be forced into a single row.
CREATE UNIQUE INDEX IF NOT EXISTS "uq_person_payment_methods_provider_token" ON "person_payment_methods" USING btree ("provider_id","processor_token") WHERE "person_payment_methods"."provider_id" is not null;
