ALTER TABLE "supplier_operations"
ADD COLUMN "subject_type" text;
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ADD COLUMN "subject_id" text;
--> statement-breakpoint
UPDATE "supplier_operations"
SET "subject_type" = 'booking_session', "subject_id" = "session_id";
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ALTER COLUMN "subject_type" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ALTER COLUMN "subject_id" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_operations"
RENAME COLUMN "commit_idempotency_key" TO "idempotency_key";
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ALTER COLUMN "session_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ALTER COLUMN "quote_id" DROP NOT NULL;
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ADD COLUMN "booking_item_id" text;
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ADD COLUMN "amendment_id" text;
--> statement-breakpoint
ALTER TABLE "supplier_operations"
DROP CONSTRAINT "supplier_operations_kind";
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ADD CONSTRAINT "supplier_operations_kind"
CHECK ("operation_kind" IN ('reserve','modify','cancel'));
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ADD CONSTRAINT "supplier_operations_subject_type"
CHECK ("subject_type" IN ('booking_session','booking_amendment'));
--> statement-breakpoint
ALTER TABLE "supplier_operations"
ADD CONSTRAINT "supplier_operations_subject_shape" CHECK (
  (
    "subject_type" = 'booking_session'
    AND "session_id" IS NOT NULL
    AND "quote_id" IS NOT NULL
    AND "amendment_id" IS NULL
  ) OR (
    "subject_type" = 'booking_amendment'
    AND "session_id" IS NULL
    AND "quote_id" IS NULL
    AND "booking_id" IS NOT NULL
    AND "booking_item_id" IS NOT NULL
    AND "amendment_id" IS NOT NULL
  )
);
--> statement-breakpoint
DROP INDEX "uidx_supplier_operations_session_commit";
--> statement-breakpoint
DROP INDEX "uidx_supplier_operations_session_reserve_guard";
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_supplier_operations_subject_command"
ON "supplier_operations" USING btree
("subject_type","subject_id","scope_key","idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_supplier_operations_subject_active_guard"
ON "supplier_operations" USING btree
("subject_type","subject_id","scope_key","operation_kind")
WHERE "state" IN ('queued','submitted','pending','succeeded','in_doubt','manual_review')
OR ("state" = 'manually_resolved' AND "upstream_status" = 'succeeded');
--> statement-breakpoint
CREATE INDEX "idx_supplier_operations_amendment_created"
ON "supplier_operations" USING btree ("amendment_id","created_at");
