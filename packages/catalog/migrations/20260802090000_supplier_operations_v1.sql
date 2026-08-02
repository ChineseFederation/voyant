CREATE TABLE "supplier_operations" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "quote_id" text NOT NULL,
  "hold_id" text,
  "commit_idempotency_key" text NOT NULL,
  "operation_kind" text NOT NULL,
  "state" text NOT NULL,
  "commitment_policy" text NOT NULL,
  "entity_module" text NOT NULL,
  "entity_id" text NOT NULL,
  "source_kind" text NOT NULL,
  "source_connection_id" text NOT NULL,
  "source_ref" text NOT NULL,
  "adapter_kind" text NOT NULL,
  "request_fingerprint" text NOT NULL,
  "adapter_idempotency_key" text NOT NULL,
  "request_payload" jsonb NOT NULL,
  "version" integer DEFAULT 0 NOT NULL,
  "attempt_count" integer DEFAULT 0 NOT NULL,
  "upstream_ref" text,
  "upstream_status" text,
  "booking_id" text,
  "last_error_class" text,
  "safe_evidence" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "submitted_at" timestamp with time zone,
  "last_checked_at" timestamp with time zone,
  "source_updated_at" timestamp with time zone,
  "next_reconcile_at" timestamp with time zone,
  "resolved_at" timestamp with time zone,
  "resolved_by" text,
  "resolution_reason" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "supplier_operations_session_id_booking_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."booking_sessions"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "supplier_operations_quote_id_booking_session_quotes_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."booking_session_quotes"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "supplier_operations_hold_id_booking_session_holds_id_fk" FOREIGN KEY ("hold_id") REFERENCES "public"."booking_session_holds"("id") ON DELETE restrict ON UPDATE no action,
  CONSTRAINT "supplier_operations_id_typeid" CHECK ("id" LIKE 'suop_%'),
  CONSTRAINT "supplier_operations_kind" CHECK ("operation_kind" = 'reserve'),
  CONSTRAINT "supplier_operations_state" CHECK ("state" IN ('queued','submitted','pending','succeeded','refused','cancelled','in_doubt','manual_review','manually_resolved')),
  CONSTRAINT "supplier_operations_policy" CHECK ("commitment_policy" IN ('supplier_first','operator_backed')),
  CONSTRAINT "supplier_operations_version" CHECK ("version" >= 0),
  CONSTRAINT "supplier_operations_attempt_count" CHECK ("attempt_count" >= 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_supplier_operations_session_commit" ON "supplier_operations" USING btree ("session_id","commit_idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_supplier_operations_session_reserve_guard" ON "supplier_operations" USING btree ("session_id","operation_kind") WHERE "state" IN ('queued','submitted','pending','succeeded','in_doubt','manual_review') OR ("state" = 'manually_resolved' AND "upstream_status" = 'succeeded');
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_supplier_operations_adapter_idem" ON "supplier_operations" USING btree ("source_connection_id","adapter_idempotency_key");
--> statement-breakpoint
CREATE INDEX "idx_supplier_operations_state_reconcile" ON "supplier_operations" USING btree ("state","next_reconcile_at");
--> statement-breakpoint
CREATE INDEX "idx_supplier_operations_session_created" ON "supplier_operations" USING btree ("session_id","created_at");
--> statement-breakpoint
CREATE INDEX "idx_supplier_operations_upstream" ON "supplier_operations" USING btree ("source_connection_id","upstream_ref");
--> statement-breakpoint
ALTER TABLE "booking_session_audit_events" DROP CONSTRAINT "booking_session_audit_events_action";
--> statement-breakpoint
ALTER TABLE "booking_session_audit_events" ADD CONSTRAINT "booking_session_audit_events_action" CHECK ("action" IN ('read', 'update', 'quote', 'hold', 'commit', 'adopt', 'renew', 'abandon', 'expire', 'purge', 'supplier_reconcile', 'supplier_manual_resolve'));
--> statement-breakpoint
ALTER TABLE "booking_sessions" DROP CONSTRAINT "booking_sessions_state";
--> statement-breakpoint
ALTER TABLE "booking_sessions" ADD CONSTRAINT "booking_sessions_state" CHECK ("state" IN ('active', 'supplier_pending', 'consumed', 'expired', 'abandoned'));
