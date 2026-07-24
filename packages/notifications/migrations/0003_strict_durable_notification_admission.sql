ALTER TABLE "notification_send_operations"
  ADD COLUMN IF NOT EXISTS "terminal_event" jsonb;

-- Preserve every pre-upgrade idempotency claim as a terminal fail-closed
-- operation before retiring the old ledger. A reused legacy key therefore
-- conflicts instead of creating a second provider send.
DO $$ BEGIN
IF to_regclass('notification_delivery_requests') IS NOT NULL THEN
INSERT INTO "notification_send_operations" (
  "id",
  "command_scope",
  "idempotency_key",
  "request_fingerprint",
  "claim_action_id",
  "organization_id",
  "target_type",
  "target_id",
  "delivery_id",
  "provider",
  "provider_idempotency_key",
  "request_payload",
  "result_snapshot",
  "status",
  "attempts",
  "max_attempts",
  "next_attempt_at",
  "last_error",
  "completed_at",
  "created_at",
  "updated_at"
)
SELECT
  'legacy_notification_send_' || md5(request."idempotency_key"),
  'notifications.enqueue.v1',
  request."idempotency_key",
  request."request_fingerprint",
  'legacy-notification-enqueue:' || md5(request."idempotency_key"),
  delivery."organization_id",
  delivery."target_type",
  COALESCE(delivery."target_id", delivery."id"),
  delivery."id",
  COALESCE(delivery."provider", 'legacy-unavailable'),
  'legacy:' || md5(request."idempotency_key"),
  jsonb_build_object('legacyTombstone', true),
  to_jsonb(delivery),
  CASE
    WHEN delivery."status" = 'sent' THEN 'sent'::"notification_send_operation_status"
    ELSE 'dead_letter'::"notification_send_operation_status"
  END,
  1,
  1,
  request."created_at",
  CASE
    WHEN delivery."status" = 'sent' THEN NULL
    ELSE 'Pre-upgrade terminal idempotency tombstone'
  END,
  COALESCE(delivery."sent_at", delivery."failed_at", delivery."updated_at", request."created_at"),
  request."created_at",
  COALESCE(delivery."updated_at", request."created_at")
FROM "notification_delivery_requests" request
INNER JOIN "notification_deliveries" delivery ON delivery."id" = request."delivery_id"
ON CONFLICT DO NOTHING;

DROP TABLE "notification_delivery_requests";
END IF;
END $$;
