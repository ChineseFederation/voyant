ALTER TABLE "event_outbox" ADD COLUMN IF NOT EXISTS "attempt_errors" jsonb;
