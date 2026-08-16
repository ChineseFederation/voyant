import type { ModuleContainer, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import {
  type BookingScheduleRoutesOptions,
  generatePaymentScheduleForBooking,
} from "../payment-schedule/routes.js"
import { settleCoveredBookingPaymentSchedules } from "../service-shared.js"

export const FINANCE_BOOKING_SCHEDULE_SUBSCRIBER_ID =
  "@voyant-travel/finance#subscriber.booking-schedule-confirmed"
export const BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY = "finance.bookingScheduleSubscriberRuntime"

export interface BookingScheduleSubscriberRuntime {
  resolveRoutesOptions(
    bindings: unknown,
  ): BookingScheduleRoutesOptions | Promise<BookingScheduleRoutesOptions>
  /** Resolve the deployment database and retain ownership of its lifecycle. */
  withDb<T>(bindings: unknown, operation: (db: PostgresJsDatabase) => Promise<T>): Promise<T>
}

export interface BookingScheduleSubscriberDependencies {
  generateSchedule?: typeof generatePaymentScheduleForBooking
  settleCoveredSchedules?: typeof settleCoveredBookingPaymentSchedules
  logger?: Pick<Console, "error">
}

interface BookingConfirmedPayload {
  bookingId: string
  bookingNumber: string
  actorId: string | null
}

/** Build the package-owned descriptor resolved by selected-graph lowering. */
export function createBookingScheduleSubscriberRuntime(
  dependencies: BookingScheduleSubscriberDependencies = {},
): SubscriberRuntimeDescriptor {
  const generateSchedule = dependencies.generateSchedule ?? generatePaymentScheduleForBooking
  const settleCoveredSchedules =
    dependencies.settleCoveredSchedules ?? settleCoveredBookingPaymentSchedules
  const logger = dependencies.logger ?? console

  return {
    id: FINANCE_BOOKING_SCHEDULE_SUBSCRIBER_ID,
    eventType: "booking.confirmed",
    register: ({ bindings, container, eventBus }) => {
      eventBus.subscribe<BookingConfirmedPayload>("booking.confirmed", async ({ data }) => {
        try {
          const runtime = resolveBookingScheduleSubscriberRuntime(container)
          const routesOptions = await runtime.resolveRoutesOptions(bindings)
          await runtime.withDb(bindings, async (db) => {
            await generateSchedule(db, data.bookingId, routesOptions)
            await settleCoveredSchedules(db, data.bookingId)
          })
        } catch (error) {
          logger.error("[booking-schedule] failed to generate schedule", {
            bookingId: data.bookingId,
            error: error instanceof Error ? error.message : String(error),
          })
          // Rethrown, not swallowed (voyant#4743). Swallowing reported success
          // to the durable outbox, which marked the event delivered — so a
          // Booking whose schedule generation failed once never got another
          // attempt, and the only trace was a log line nobody reads. The
          // failure modes here are transient or environmental (the subscriber
          // runtime not registered in the invocation that drained the event, a
          // cascade resolver erroring), which is exactly what retry and
          // dead-lettering exist for.
          throw error
        }
      })
    },
  }
}

function resolveBookingScheduleSubscriberRuntime(
  container: ModuleContainer,
): BookingScheduleSubscriberRuntime {
  if (!container.has(BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY)) {
    throw new Error(
      `Booking-schedule subscriber runtime is not registered at "${BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY}".`,
    )
  }
  return container.resolve<BookingScheduleSubscriberRuntime>(
    BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY,
  )
}

export const bookingScheduleConfirmedSubscriber = createBookingScheduleSubscriberRuntime()
