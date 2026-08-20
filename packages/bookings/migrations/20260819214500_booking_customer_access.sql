CREATE TABLE IF NOT EXISTS "booking_customer_access_grants" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "buyer_account_id" text NOT NULL,
  "buyer_account_kind" text NOT NULL,
  "role" text NOT NULL,
  "source" text NOT NULL,
  "proof_ref" text,
  "granted_by_principal_id" text,
  "granted_by_membership_id" text,
  "granted_by_membership_role" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  "revoked_at" timestamp with time zone,
  "revoked_by_principal_id" text,
  "revocation_reason" text,
  CONSTRAINT "booking_customer_access_grants_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade,
  CONSTRAINT "ck_booking_customer_access_grants_account_kind"
    CHECK (("buyer_account_kind" = 'personal' AND "buyer_account_id" LIKE 'personal:%') OR ("buyer_account_kind" = 'business' AND "buyer_account_id" LIKE 'business:%')),
  CONSTRAINT "ck_booking_customer_access_grants_role" CHECK ("role" = 'owner'),
  CONSTRAINT "ck_booking_customer_access_grants_source"
    CHECK ("source" IN ('authenticated_commit', 'verified_booking_claim', 'staff_grant', 'legacy_session_backfill')),
  CONSTRAINT "ck_booking_customer_access_grants_revocation"
    CHECK (("revoked_at" IS NULL AND "revoked_by_principal_id" IS NULL AND "revocation_reason" IS NULL) OR ("revoked_at" IS NOT NULL AND "revoked_by_principal_id" IS NOT NULL AND "revocation_reason" IS NOT NULL)),
  CONSTRAINT "ck_booking_customer_access_grants_membership_audit"
    CHECK (("granted_by_membership_id" IS NULL AND "granted_by_membership_role" IS NULL) OR ("granted_by_membership_id" IS NOT NULL AND "granted_by_membership_role" IS NOT NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_booking_customer_access_grant_subject_role"
  ON "booking_customer_access_grants" USING btree ("booking_id", "buyer_account_id", "role");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_booking_customer_access_grants_active_account_booking"
  ON "booking_customer_access_grants" USING btree ("buyer_account_id", "booking_id") WHERE "revoked_at" IS NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_booking_customer_access_grants_booking"
  ON "booking_customer_access_grants" USING btree ("booking_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "booking_customer_access_commands" (
  "id" text PRIMARY KEY NOT NULL,
  "command_scope" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "action" text NOT NULL,
  "booking_id" text NOT NULL,
  "grant_id" text,
  "result_status" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "completed_at" timestamp with time zone,
  CONSTRAINT "booking_customer_access_commands_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade,
  CONSTRAINT "ck_booking_customer_access_commands_action" CHECK ("action" IN ('grant', 'revoke'))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_booking_customer_access_command_idempotency"
  ON "booking_customer_access_commands" USING btree ("command_scope", "idempotency_key");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_booking_customer_access_commands_booking"
  ON "booking_customer_access_commands" USING btree ("booking_id");--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "customer_booking_access_claims" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "buyer_account_id" text NOT NULL,
  "buyer_account_kind" text NOT NULL,
  "challenge_id" text NOT NULL,
  "grant_id" text,
  "status" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "confirmation_idempotency_key" text,
  "confirmation_request_fingerprint" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "granted_at" timestamp with time zone,
  CONSTRAINT "customer_booking_access_claims_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade,
  CONSTRAINT "ck_customer_booking_access_claim_account_kind"
    CHECK (("buyer_account_kind" = 'personal' AND "buyer_account_id" LIKE 'personal:%') OR ("buyer_account_kind" = 'business' AND "buyer_account_id" LIKE 'business:%')),
  CONSTRAINT "ck_customer_booking_access_claim_status"
    CHECK ("status" IN ('pending', 'granted', 'expired', 'failed')),
  CONSTRAINT "ck_customer_booking_access_claim_granted_at"
    CHECK (("status" = 'granted' AND "granted_at" IS NOT NULL AND "grant_id" IS NOT NULL AND "confirmation_idempotency_key" IS NOT NULL AND "confirmation_request_fingerprint" IS NOT NULL) OR ("status" <> 'granted' AND "granted_at" IS NULL AND "grant_id" IS NULL AND "confirmation_idempotency_key" IS NULL AND "confirmation_request_fingerprint" IS NULL))
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_booking_access_claim_account_idempotency"
  ON "customer_booking_access_claims" USING btree ("buyer_account_id", "idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "uq_customer_booking_access_claim_challenge"
  ON "customer_booking_access_claims" USING btree ("challenge_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customer_booking_access_claim_booking_account"
  ON "customer_booking_access_claims" USING btree ("booking_id", "buyer_account_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_customer_booking_access_claim_status_expires"
  ON "customer_booking_access_claims" USING btree ("status", "expires_at");--> statement-breakpoint

-- Claim start resolves a Booking by reference case-insensitively, and the
-- unique btree on "booking_number" cannot answer upper("booking_number").
-- Without this, every claim attempt on a public, repeatedly-callable endpoint
-- is a sequential scan of "bookings".
CREATE INDEX IF NOT EXISTS "idx_bookings_number_upper"
  ON "bookings" USING btree (upper("booking_number"));
