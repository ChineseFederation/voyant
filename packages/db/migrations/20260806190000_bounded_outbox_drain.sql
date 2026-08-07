DROP INDEX IF EXISTS "event_outbox_due_idx";
CREATE INDEX "event_outbox_due_idx" ON "event_outbox" USING btree ("next_attempt_at", "id") WHERE "status" = 'pending';
CREATE INDEX "event_outbox_pending_created_idx" ON "event_outbox" USING btree ("created_at") WHERE "status" = 'pending';
CREATE INDEX "event_outbox_failed_created_idx" ON "event_outbox" USING btree ("created_at") WHERE "status" = 'failed';
CREATE INDEX "event_outbox_delivered_idx" ON "event_outbox" USING btree ("delivered_at", "id") WHERE "status" = 'delivered';
CREATE INDEX "event_outbox_pending_intent_idx" ON "event_outbox" USING btree (("payload" ->> 'intentId')) WHERE "status" = 'pending';
DROP INDEX IF EXISTS "write_intents_pending_idx";
CREATE INDEX "write_intents_pending_idx" ON "write_intents" USING btree ("created_at", "id") WHERE "status" = 'pending';
