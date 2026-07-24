import { randomUUID } from "node:crypto"
import { readFile } from "node:fs/promises"

import { createDbClient } from "@voyant-travel/db"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import {
  createNotificationService,
  NotificationIdempotencyConflictError,
} from "../../src/service.js"
import { enqueueNotification } from "../../src/service-durable-send.js"

const DB_AVAILABLE = Boolean(process.env.TEST_DATABASE_URL)

type UnsafeClient = {
  unsafe<T = unknown>(query: string): Promise<T>
  end(options?: { timeout?: number | null }): Promise<unknown>
}

describe.skipIf(!DB_AVAILABLE)("notification idempotency migration upgrade", () => {
  it("tombstones legacy claims before dropping the old ledger", async () => {
    const schemaName = `notification_upgrade_${randomUUID().replaceAll("-", "")}`
    const db = createDbClient(process.env.TEST_DATABASE_URL as string, {
      adapter: "node",
      nodeMaxConnections: 1,
      timeouts: { statementMs: false, queryMs: false, connectMs: false },
    }) as PostgresJsDatabase & { $client: UnsafeClient }
    const client = db.$client

    try {
      await client.unsafe(`CREATE SCHEMA "${schemaName}"`)
      await client.unsafe(`SET search_path TO "${schemaName}", public`)
      await client.unsafe(`
        CREATE TYPE notification_send_operation_status AS ENUM (
          'pending', 'processing', 'retry', 'sent', 'dead_letter'
        );
        CREATE TABLE notification_deliveries (
          id text PRIMARY KEY NOT NULL,
          organization_id text,
          target_type text NOT NULL,
          target_id text,
          provider text,
          status text NOT NULL,
          sent_at timestamp with time zone,
          failed_at timestamp with time zone,
          created_at timestamp with time zone DEFAULT now() NOT NULL,
          updated_at timestamp with time zone DEFAULT now() NOT NULL
        );
        CREATE TABLE notification_delivery_requests (
          idempotency_key text PRIMARY KEY NOT NULL,
          request_fingerprint text NOT NULL,
          delivery_id text NOT NULL REFERENCES notification_deliveries(id),
          created_at timestamp with time zone DEFAULT now() NOT NULL
        );
        CREATE TABLE notification_send_operations (
          id text PRIMARY KEY NOT NULL,
          command_scope text NOT NULL,
          idempotency_key text NOT NULL,
          request_fingerprint text NOT NULL,
          claim_action_id text NOT NULL UNIQUE,
          organization_id text,
          target_type text NOT NULL,
          target_id text NOT NULL,
          delivery_id text NOT NULL,
          provider text NOT NULL,
          provider_idempotency_key text NOT NULL,
          request_payload jsonb NOT NULL,
          result_snapshot jsonb NOT NULL,
          status notification_send_operation_status NOT NULL DEFAULT 'pending',
          attempts integer NOT NULL DEFAULT 0,
          max_attempts integer NOT NULL DEFAULT 8,
          next_attempt_at timestamp with time zone NOT NULL DEFAULT now(),
          lease_expires_at timestamp with time zone,
          last_error text,
          completed_at timestamp with time zone,
          created_at timestamp with time zone NOT NULL DEFAULT now(),
          updated_at timestamp with time zone NOT NULL DEFAULT now(),
          UNIQUE (command_scope, idempotency_key),
          UNIQUE (provider, provider_idempotency_key)
        );
        INSERT INTO notification_deliveries (
          id, target_type, target_id, provider, status
        ) VALUES (
          'legacy_delivery_1', 'booking', 'booking_legacy_1', 'local', 'sent'
        );
        INSERT INTO notification_delivery_requests (
          idempotency_key, request_fingerprint, delivery_id
        ) VALUES (
          'legacy-booking-send-1', 'sha256:legacy-fingerprint', 'legacy_delivery_1'
        );
      `)

      const upgradeMigration = await readFile(
        new URL("../../migrations/0003_strict_durable_notification_admission.sql", import.meta.url),
        "utf8",
      )
      await client.unsafe(upgradeMigration)

      const tombstones = await client.unsafe<
        Array<{ idempotency_key: string; status: string; legacy: boolean }>
      >(`
        SELECT
          idempotency_key,
          status,
          request_payload->>'legacyTombstone' = 'true' AS legacy
        FROM notification_send_operations
      `)
      expect(tombstones).toEqual([
        {
          idempotency_key: "legacy-booking-send-1",
          status: "sent",
          legacy: true,
        },
      ])
      const oldLedger = await client.unsafe<Array<{ relation: string | null }>>(
        "SELECT to_regclass('notification_delivery_requests')::text AS relation",
      )
      expect(oldLedger[0]?.relation).toBeNull()

      const sink = vi.fn()
      const registry = createNotificationService([
        {
          name: "migration-test-durable",
          channels: ["email"],
          defaultFromAddress: "notifications@example.test",
          durableDelivery: {
            protocol: "notification-provider-idempotency-v1",
            send: sink,
          },
        },
      ])
      await expect(
        enqueueNotification({
          db,
          registry,
          input: {
            idempotencyKey: "legacy-booking-send-1",
            channel: "email",
            to: "traveler@example.test",
            subject: "This must not resend",
            text: "This must not resend",
            targetType: "booking",
            targetId: "booking_legacy_1",
          },
        }),
      ).rejects.toBeInstanceOf(NotificationIdempotencyConflictError)
      expect(sink).not.toHaveBeenCalled()

      await expect(client.unsafe(upgradeMigration)).resolves.toBeDefined()
    } finally {
      await client.unsafe(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`)
      await client.end({ timeout: 0 })
    }
  }, 20_000)
})
