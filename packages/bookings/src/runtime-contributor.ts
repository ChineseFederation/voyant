import {
  type ActionLedgerBookingDriftRuntime,
  actionLedgerBookingDriftRuntimePort,
} from "@voyant-travel/action-ledger/runtime-port"
import type { VoyantRuntimeHostPrimitives } from "@voyant-travel/core"
import {
  type CustomFieldValueLifecycleRuntime,
  type CustomFieldValueOperationsRuntime,
  customFieldValueLifecycleRuntimePort,
  customFieldValueOperationsRuntimePort,
} from "@voyant-travel/core/runtime-port"
import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { checkBookingActionLedgerDrift } from "./action-ledger-drift.js"
import { loadBookingCrmSnapshot } from "./crm-snapshot.js"
import { legacyBookingInquiryReadRuntimePort } from "./inquiry/ports.js"
import { legacyBookingInquiryReadRuntime } from "./legacy-inquiry-read-runtime.js"
import { type BookingsCrmSnapshotRuntime, bookingsCrmSnapshotRuntimePort } from "./runtime-port.js"

export interface BookingsRuntimeContributorHost {
  primitives: VoyantRuntimeHostPrimitives
  getRuntimePort<T>(port: { id: string }): T | Promise<T>
}

const bookingCustomFieldValues: CustomFieldValueLifecycleRuntime = {
  supports: (entityType) => entityType === "booking",
  async renameDefinitionKey(db, definition, nextKey) {
    const database = db as PostgresJsDatabase
    await database.execute(
      sql`UPDATE bookings
          SET custom_fields = jsonb_set(
            custom_fields,
            ARRAY[${definition.namespace}]::text[],
            (COALESCE(custom_fields -> ${definition.namespace}, '{}'::jsonb) - ${definition.key})
              || jsonb_build_object(
                ${nextKey}::text,
                custom_fields #> ARRAY[${definition.namespace}, ${definition.key}]::text[]
              ),
            true
          ),
          revision = revision + 1,
          updated_at = now()
          WHERE custom_fields -> ${definition.namespace} ? ${definition.key}`,
    )
  },
  async deleteDefinitionValues(db, definition) {
    const database = db as PostgresJsDatabase
    await database.execute(
      sql`UPDATE bookings
          SET custom_fields = custom_fields #- ARRAY[${definition.namespace}, ${definition.key}]::text[],
              revision = revision + 1,
              updated_at = now()
          WHERE custom_fields -> ${definition.namespace} ? ${definition.key}`,
    )
  },
}

const bookingCustomFieldValueOperations: CustomFieldValueOperationsRuntime = {
  supports: (entityType) => entityType === "booking",
  async list(db, _owner, input) {
    const database = db as PostgresJsDatabase
    const rows = input.entityId
      ? await database.execute(
          sql`SELECT id, custom_fields FROM bookings WHERE id = ${input.entityId}`,
        )
      : await database.execute(
          sql`SELECT id, custom_fields FROM bookings WHERE custom_fields <> '{}'::jsonb ORDER BY updated_at DESC`,
        )
    return Array.from(rows, (row) => ({
      entityId: String(row.id),
      customFields: (row.custom_fields as Record<string, unknown> | null) ?? {},
    }))
  },
  async upsert(db, _owner, input) {
    const database = db as PostgresJsDatabase
    const updated = Array.from(
      await database.execute(
        sql`UPDATE bookings
            SET custom_fields = jsonb_set(
                  custom_fields,
                  ARRAY[${input.definition.namespace}]::text[],
                  COALESCE(custom_fields -> ${input.definition.namespace}, '{}'::jsonb)
                    || jsonb_build_object(
                      ${input.definition.key}::text,
                      ${JSON.stringify(input.value)}::jsonb
                    ),
                  true
                ),
                revision = revision + 1,
                updated_at = now()
            WHERE id = ${input.entityId}
            RETURNING id`,
      ),
    )
    return updated.length > 0
  },
  async delete(db, _owner, input) {
    const database = db as PostgresJsDatabase
    const deleted = Array.from(
      await database.execute(
        sql`UPDATE bookings
            SET custom_fields = custom_fields #- ARRAY[${input.definition.namespace}, ${input.definition.key}]::text[],
                revision = revision + 1,
                updated_at = now()
            WHERE id = ${input.entityId}
              AND custom_fields -> ${input.definition.namespace} ? ${input.definition.key}
            RETURNING id`,
      ),
    )
    return deleted.length > 0
  },
}

/** Bind Bookings-owned runtime behavior; domain behavior arrives through graph ports. */
export function createBookingsRuntimePortContribution(
  _host: BookingsRuntimeContributorHost,
): Readonly<Record<string, unknown>> {
  return {
    [legacyBookingInquiryReadRuntimePort.id]: legacyBookingInquiryReadRuntime,
    [actionLedgerBookingDriftRuntimePort.id]: {
      checkBookingDrift: checkBookingActionLedgerDrift,
    } satisfies ActionLedgerBookingDriftRuntime,
    [customFieldValueLifecycleRuntimePort.id]: bookingCustomFieldValues,
    [customFieldValueOperationsRuntimePort.id]: bookingCustomFieldValueOperations,
    [bookingsCrmSnapshotRuntimePort.id]: {
      loadBookingCrmSnapshot,
    } satisfies BookingsCrmSnapshotRuntime,
  }
}
