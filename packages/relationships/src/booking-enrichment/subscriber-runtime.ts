import {
  type BookingsCrmSnapshotRuntime,
  bookingsCrmSnapshotRuntimePort,
} from "@voyant-travel/bookings/runtime-port"
import type { SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { relationshipsBookingEnrichmentDatabaseRuntimePort } from "../runtime-port.js"
import { enrichCrmFromBooking } from "./service.js"

export const RELATIONSHIPS_BOOKING_ENRICHMENT_SUBSCRIBER_ID =
  "@voyant-travel/relationships#subscriber.crm-enrichment-booking-confirmed"

export interface BookingCrmEnrichmentSubscriberRuntimeOptions<TBindings = unknown> {
  /** Resolve the deployment database and retain ownership of its lifecycle. */
  withDb<T>(bindings: TBindings, operation: (db: AnyDrizzleDb) => Promise<T>): Promise<T>
  snapshots: BookingsCrmSnapshotRuntime
  enrich?: typeof enrichCrmFromBooking
  logger?: Pick<Console, "warn">
}

interface BookingConfirmedPayload {
  bookingId: string
}

/**
 * Fold a confirmed booking into the customer's CRM record.
 *
 * A subscriber rather than a step inside the commit: enrichment is derived
 * bookkeeping, and a CRM write that failed must never be able to roll back a
 * booking the customer has already paid for. Failures are logged and dropped
 * for the same reason.
 */
export function createBookingCrmEnrichmentSubscriberRuntime<TBindings = unknown>(
  options: BookingCrmEnrichmentSubscriberRuntimeOptions<TBindings>,
): SubscriberRuntimeDescriptor {
  const enrich = options.enrich ?? enrichCrmFromBooking
  const logger = options.logger ?? console

  return {
    id: RELATIONSHIPS_BOOKING_ENRICHMENT_SUBSCRIBER_ID,
    eventType: "booking.confirmed",
    register: ({ bindings, eventBus }) => {
      const runtimeBindings = bindings as TBindings
      eventBus.subscribe<BookingConfirmedPayload>("booking.confirmed", async ({ data }) => {
        await options.withDb(runtimeBindings, async (db) => {
          try {
            const database = db as PostgresJsDatabase
            const snapshot = await options.snapshots.loadBookingCrmSnapshot(
              database,
              data.bookingId,
            )
            if (!snapshot) return
            await enrich(database, snapshot)
          } catch (error) {
            logger.warn("[relationships] booking CRM enrichment failed", {
              bookingId: data.bookingId,
              error: error instanceof Error ? error.message : String(error),
            })
          }
        })
      })
    },
  }
}

/** Selected-graph factory binding the enrichment subscriber to its two ports. */
export const createBookingCrmEnrichmentSubscriberGraphRuntime = defineGraphRuntimeFactory(
  async ({ getPort, hasPort }) => {
    // A deployment can select CRM without Bookings. Then nothing emits
    // `booking.confirmed` and there is no snapshot reader, so the subscriber
    // registers as an inert descriptor rather than failing the boot.
    if (!hasPort(bookingsCrmSnapshotRuntimePort)) {
      return {
        id: RELATIONSHIPS_BOOKING_ENRICHMENT_SUBSCRIBER_ID,
        eventType: "booking.confirmed",
        register: () => {},
      } satisfies SubscriberRuntimeDescriptor
    }
    const [database, snapshots] = await Promise.all([
      getPort(relationshipsBookingEnrichmentDatabaseRuntimePort),
      getPort(bookingsCrmSnapshotRuntimePort),
    ])
    return createBookingCrmEnrichmentSubscriberRuntime({ ...database, snapshots })
  },
)
