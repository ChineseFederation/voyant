ALTER TABLE "supplier_operations" ADD COLUMN "scope_key" text DEFAULT 'session' NOT NULL;
--> statement-breakpoint
DROP INDEX "uidx_supplier_operations_session_commit";
--> statement-breakpoint
DROP INDEX "uidx_supplier_operations_session_reserve_guard";
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_supplier_operations_session_commit" ON "supplier_operations" USING btree ("session_id","scope_key","commit_idempotency_key");
--> statement-breakpoint
CREATE UNIQUE INDEX "uidx_supplier_operations_session_reserve_guard" ON "supplier_operations" USING btree ("session_id","scope_key","operation_kind") WHERE "state" IN ('queued','submitted','pending','succeeded','in_doubt','manual_review') OR ("state" = 'manually_resolved' AND "upstream_status" = 'succeeded');
