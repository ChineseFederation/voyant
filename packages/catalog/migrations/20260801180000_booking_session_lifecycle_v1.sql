ALTER TABLE "booking_sessions" ADD COLUMN "capability_scopes" jsonb DEFAULT '[]'::jsonb NOT NULL;
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD COLUMN "purged_at" timestamp with time zone;
--> statement-breakpoint
UPDATE "booking_sessions"
SET "capability_scopes" = '["read","update","quote","hold","commit","abandon","adopt","renew"]'::jsonb
WHERE "actor_kind" = 'anonymous';
--> statement-breakpoint
ALTER TABLE "booking_sessions" DROP CONSTRAINT "booking_sessions_anonymous_capability";
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_anonymous_capability"
CHECK (
  ("purged_at" IS NOT NULL
    AND "owner_principal_id" IS NULL
    AND "owner_organization_id" IS NULL
    AND "capability_hash" IS NULL
    AND jsonb_array_length("capability_scopes") = 0)
  OR
  ("purged_at" IS NULL AND (
    ("actor_kind" = 'anonymous' AND "owner_principal_id" IS NULL AND "capability_hash" IS NOT NULL AND jsonb_array_length("capability_scopes") > 0)
    OR
    ("actor_kind" <> 'anonymous' AND "capability_hash" IS NULL AND "owner_principal_id" IS NOT NULL AND jsonb_array_length("capability_scopes") = 0)
  ))
);
--> statement-breakpoint
ALTER TABLE "booking_session_operations" DROP CONSTRAINT "booking_session_operations_operation";
--> statement-breakpoint
ALTER TABLE "booking_session_operations" ADD CONSTRAINT "booking_session_operations_operation"
CHECK ("operation" IN ('update', 'quote', 'hold', 'abandon', 'adopt', 'renew'));
--> statement-breakpoint
CREATE TABLE "booking_session_audit_events" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "action" text NOT NULL,
  "actor_kind" text NOT NULL,
  "principal_id" text,
  "organization_id" text,
  "authority_reason" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "booking_session_audit_events_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "booking_session_audit_events_id_typeid" CHECK ("id" LIKE 'bsae_%'),
  CONSTRAINT "booking_session_audit_events_action" CHECK ("action" IN ('read', 'update', 'quote', 'hold', 'commit', 'adopt', 'renew', 'abandon', 'expire', 'purge'))
);
--> statement-breakpoint
CREATE INDEX "idx_booking_session_audit_events_session" ON "booking_session_audit_events" USING btree ("session_id", "created_at");
