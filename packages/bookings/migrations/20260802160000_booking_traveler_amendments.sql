ALTER TABLE "bookings"
ADD COLUMN "revision" integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE "bookings"
ADD CONSTRAINT "ck_bookings_revision_positive" CHECK ("revision" > 0);
--> statement-breakpoint
CREATE TABLE "booking_amendments" (
  "id" text PRIMARY KEY NOT NULL,
  "booking_id" text NOT NULL,
  "traveler_id" text NOT NULL,
  "kind" text DEFAULT 'traveler_correction' NOT NULL,
  "status" text DEFAULT 'proposed' NOT NULL,
  "base_booking_revision" integer NOT NULL,
  "result_booking_revision" integer NOT NULL,
  "requested_patch" jsonb NOT NULL,
  "acceptance_required" boolean DEFAULT false NOT NULL,
  "policy_decisions" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "price_delta_cents" integer DEFAULT 0 NOT NULL,
  "price_currency" text NOT NULL,
  "effects" jsonb NOT NULL,
  "preview_idempotency_key" text NOT NULL,
  "accept_idempotency_key" text,
  "apply_idempotency_key" text,
  "requested_by" text,
  "requested_actor" text NOT NULL,
  "reason" text NOT NULL,
  "accepted_at" timestamp with time zone,
  "accepted_by" text,
  "accepted_actor" text,
  "applied_at" timestamp with time zone,
  "applied_by" text,
  "applied_actor" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_amendments_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ck_booking_amendments_kind" CHECK ("kind" = 'traveler_correction'),
  CONSTRAINT "ck_booking_amendments_status"
    CHECK ("status" IN ('proposed', 'accepted', 'applied', 'rejected', 'failed')),
  CONSTRAINT "ck_booking_amendments_actor"
    CHECK ("requested_actor" IN ('customer', 'staff', 'partner', 'system')),
  CONSTRAINT "ck_booking_amendments_accepted_actor"
    CHECK ("accepted_actor" IS NULL OR "accepted_actor" IN ('customer', 'staff', 'partner', 'system')),
  CONSTRAINT "ck_booking_amendments_applied_actor"
    CHECK ("applied_actor" IS NULL OR "applied_actor" IN ('customer', 'staff', 'partner', 'system')),
  CONSTRAINT "ck_booking_amendments_lifecycle" CHECK (
    (
      "status" = 'proposed'
      AND "accepted_at" IS NULL
      AND "accepted_by" IS NULL
      AND "accepted_actor" IS NULL
      AND "accept_idempotency_key" IS NULL
      AND "applied_at" IS NULL
      AND "applied_actor" IS NULL
      AND "apply_idempotency_key" IS NULL
    ) OR (
      "status" = 'accepted'
      AND "acceptance_required" = true
      AND "accepted_at" IS NOT NULL
      AND "accepted_actor" IS NOT NULL
      AND "accept_idempotency_key" IS NOT NULL
      AND "applied_at" IS NULL
      AND "applied_by" IS NULL
      AND "applied_actor" IS NULL
      AND "apply_idempotency_key" IS NULL
    ) OR (
      "status" = 'applied'
      AND "applied_at" IS NOT NULL
      AND "applied_actor" IS NOT NULL
      AND "apply_idempotency_key" IS NOT NULL
      AND (
        (
          "acceptance_required" = false
          AND "accepted_at" IS NULL
          AND "accepted_by" IS NULL
          AND "accepted_actor" IS NULL
          AND "accept_idempotency_key" IS NULL
        )
        OR (
          "acceptance_required" = true
          AND "accepted_at" IS NOT NULL
          AND "accepted_actor" IS NOT NULL
          AND "accept_idempotency_key" IS NOT NULL
        )
      )
    ) OR "status" IN ('rejected', 'failed')
  ),
  CONSTRAINT "ck_booking_amendments_revision_step"
    CHECK ("base_booking_revision" > 0 AND "result_booking_revision" = "base_booking_revision" + 1),
  CONSTRAINT "ck_booking_amendments_zero_delta" CHECK ("price_delta_cents" = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_amendments_preview_idempotency"
ON "booking_amendments" USING btree ("booking_id", "preview_idempotency_key");
--> statement-breakpoint
CREATE INDEX "idx_booking_amendments_booking_created"
ON "booking_amendments" USING btree ("booking_id", "created_at");
--> statement-breakpoint
CREATE INDEX "idx_booking_amendments_traveler"
ON "booking_amendments" USING btree ("traveler_id");
--> statement-breakpoint
CREATE INDEX "idx_booking_amendments_status"
ON "booking_amendments" USING btree ("status");
--> statement-breakpoint
CREATE TABLE "booking_revisions" (
  "id" text PRIMARY KEY NOT NULL,
  "amendment_id" text NOT NULL,
  "booking_id" text NOT NULL,
  "booking_revision" integer NOT NULL,
  "role" text NOT NULL,
  "snapshot" jsonb NOT NULL,
  "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "authorized_by" text,
  "reason" text NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_revisions_amendment_id_booking_amendments_id_fk"
    FOREIGN KEY ("amendment_id") REFERENCES "public"."booking_amendments"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "booking_revisions_booking_id_bookings_id_fk"
    FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id")
    ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "ck_booking_revisions_revision_positive" CHECK ("booking_revision" > 0),
  CONSTRAINT "ck_booking_revisions_role" CHECK ("role" IN ('before', 'proposed_after'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_booking_revisions_amendment_role"
ON "booking_revisions" USING btree ("amendment_id", "role");
--> statement-breakpoint
CREATE INDEX "idx_booking_revisions_booking_revision"
ON "booking_revisions" USING btree ("booking_id", "booking_revision");
