import type { EventEnvelope } from "@voyant-travel/core"
import { createContainer, createEventBus } from "@voyant-travel/core"
import { describe, expect, it, vi } from "vitest"
import {
  BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY,
  createBookingScheduleSubscriberRuntime,
  FINANCE_BOOKING_SCHEDULE_SUBSCRIBER_ID,
} from "../../src/booking-schedule/subscriber-runtime.js"
import type { BookingScheduleRoutesOptions } from "../../src/payment-schedule/routes.js"

const routesOptions = {} as BookingScheduleRoutesOptions

describe("finance booking-schedule subscriber runtime", () => {
  it("registers the package-owned descriptor and preserves schedule processing order", async () => {
    const calls: string[] = []
    const db = {} as never
    const bindings = { DATABASE_URL: "postgres://finance" }
    const resolveRoutesOptions = vi.fn(async () => routesOptions)
    const generateSchedule = vi.fn(async () => {
      calls.push("generate")
    })
    const settleCoveredSchedules = vi.fn(async () => {
      calls.push("settle")
      return []
    })
    const withDb = vi.fn(async (_bindings, operation) => {
      calls.push("db")
      return operation(db)
    })
    const eventBus = createEventBus()
    const container = createContainer()
    container.register(BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY, {
      resolveRoutesOptions,
      withDb,
    })
    let handler: ((event: EventEnvelope) => Promise<void> | void) | undefined
    vi.spyOn(eventBus, "subscribe").mockImplementation((_eventType, registeredHandler) => {
      handler = registeredHandler as typeof handler
      return { unsubscribe: vi.fn() }
    })
    const descriptor = createBookingScheduleSubscriberRuntime({
      generateSchedule,
      settleCoveredSchedules,
    })

    await descriptor.register({ bindings, container, eventBus })

    expect({ id: descriptor.id, eventType: descriptor.eventType }).toEqual({
      id: FINANCE_BOOKING_SCHEDULE_SUBSCRIBER_ID,
      eventType: "booking.confirmed",
    })

    await handler?.({
      name: "booking.confirmed",
      data: { bookingId: "booking_1", bookingNumber: "BK-1", actorId: null },
      emittedAt: new Date().toISOString(),
      metadata: undefined,
    })

    expect(resolveRoutesOptions).toHaveBeenCalledWith(bindings)
    expect(withDb).toHaveBeenCalledWith(bindings, expect.any(Function))
    expect(generateSchedule).toHaveBeenCalledWith(db, "booking_1", routesOptions)
    expect(settleCoveredSchedules).toHaveBeenCalledWith(db, "booking_1")
    expect(calls).toEqual(["db", "generate", "settle"])
  })

  /**
   * The failure has to reach the caller. This subscriber runs off the durable
   * outbox, so resolving successfully after a failure tells the drain the event
   * was handled and the row is marked delivered — a Booking whose schedule
   * generation failed once then never gets another attempt, and the only trace
   * is a log line (voyant#4743). Rethrowing is what makes the retry and the
   * dead-letter real.
   */
  it("logs processing failures and rethrows so delivery retries", async () => {
    const error = new Error("database unavailable")
    const logger = { error: vi.fn() }
    const eventBus = createEventBus()
    const container = createContainer()
    container.register(BOOKING_SCHEDULE_SUBSCRIBER_RUNTIME_KEY, {
      resolveRoutesOptions: () => routesOptions,
      withDb: async () => {
        throw error
      },
    })
    let handler: ((event: EventEnvelope) => Promise<void> | void) | undefined
    vi.spyOn(eventBus, "subscribe").mockImplementation((_eventType, registeredHandler) => {
      handler = registeredHandler as typeof handler
      return { unsubscribe: vi.fn() }
    })
    const descriptor = createBookingScheduleSubscriberRuntime({
      logger,
    })
    await descriptor.register({ bindings: {}, container, eventBus })

    await expect(
      handler?.({
        name: "booking.confirmed",
        data: { bookingId: "booking_2", bookingNumber: "BK-2", actorId: null },
        emittedAt: new Date().toISOString(),
        metadata: undefined,
      }),
    ).rejects.toBe(error)
    expect(logger.error).toHaveBeenCalledWith("[booking-schedule] failed to generate schedule", {
      bookingId: "booking_2",
      error: "database unavailable",
    })
  })
})
