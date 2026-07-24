import { createContainer, createEventBus } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import type { NotificationService } from "../../src/service.js"
import {
  createBookingCancelledReminderSubscriberRuntime,
  createBookingConfirmedReminderSubscriberRuntime,
  createBookingExpiredReminderSubscriberRuntime,
  createPaymentCompletedReminderSubscriberRuntime,
  NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY,
  type NotificationsSubscriberRuntime,
  notificationsReminderSubscriberRuntimeDescriptors,
} from "../../src/subscriber-runtime.js"

const db = {
  update: vi.fn(() => ({
    set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
  })),
} as unknown as PostgresJsDatabase
const dispatcher = {} as NotificationService
const attachmentResolver = vi.fn()

function createHarness(runtimeOptions: Partial<NotificationsSubscriberRuntime> = {}) {
  const bindings = { deployment: "test" }
  const container = createContainer()
  const eventBus = createEventBus()
  container.register(NOTIFICATIONS_SUBSCRIBER_RUNTIME_KEY, {
    resolveDb: vi.fn(() => db),
    dispatcher,
    documentAttachmentResolver: attachmentResolver,
    ...runtimeOptions,
  } satisfies NotificationsSubscriberRuntime)
  return { bindings, container, eventBus }
}

describe("Notifications subscriber runtime descriptors", () => {
  it("publishes stable reminder descriptor ids and event types", () => {
    expect(
      notificationsReminderSubscriberRuntimeDescriptors.map(({ id, eventType }) => ({
        id,
        eventType,
      })),
    ).toEqual([
      {
        id: "@voyant-travel/notifications#subscriber.reminder-booking-confirmed",
        eventType: "booking.confirmed",
      },
      {
        id: "@voyant-travel/notifications#subscriber.reminder-payment-completed",
        eventType: "payment.completed",
      },
      {
        id: "@voyant-travel/notifications#subscriber.reminder-booking-cancelled",
        eventType: "booking.cancelled",
      },
      {
        id: "@voyant-travel/notifications#subscriber.reminder-booking-expired",
        eventType: "booking.expired",
      },
    ])
  })

  it("dispatches booking-confirmed rules with the runtime attachment resolver", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const harness = createHarness()
    createBookingConfirmedReminderSubscriberRuntime({ dispatchReminderRules }).register(harness)

    const payload = { bookingId: "book_1", bookingNumber: "BK-1", actorId: null }
    await harness.eventBus.emit("booking.confirmed", payload)

    expect(dispatchReminderRules).toHaveBeenCalledWith(
      db,
      dispatcher,
      { targetType: "booking_confirmed", bookingId: "book_1", eventData: payload },
      { documentAttachmentResolver: attachmentResolver },
    )
  })

  it("dispatches payment rules only when the booking is paid in full", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const isPaidInFull = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const harness = createHarness()
    createPaymentCompletedReminderSubscriberRuntime({
      dispatchReminderRules,
      isPaidInFull,
    }).register(harness)

    const payload = {
      paymentSessionId: "pay_1",
      bookingId: "book_1",
      amountCents: 1000,
      currency: "EUR",
      provider: "test",
    }
    await harness.eventBus.emit("payment.completed", payload)
    await harness.eventBus.emit("payment.completed", payload)

    expect(isPaidInFull).toHaveBeenCalledTimes(2)
    expect(dispatchReminderRules).toHaveBeenCalledTimes(1)
    expect(dispatchReminderRules).toHaveBeenCalledWith(
      db,
      dispatcher,
      expect.objectContaining({
        targetType: "payment_complete",
        bookingId: "book_1",
        paymentSessionId: "pay_1",
      }),
      { documentAttachmentResolver: attachmentResolver },
    )
  })

  it("dispatches cancellation rules only for a booking leaving on_hold", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const harness = createHarness()
    createBookingCancelledReminderSubscriberRuntime({ dispatchReminderRules }).register(harness)

    await harness.eventBus.emit("booking.cancelled", {
      bookingId: "book_1",
      bookingNumber: "BK-1",
      previousStatus: "confirmed",
      actorId: null,
    })
    await harness.eventBus.emit("booking.cancelled", {
      bookingId: "book_2",
      bookingNumber: "BK-2",
      previousStatus: "on_hold",
      actorId: null,
    })

    expect(dispatchReminderRules).toHaveBeenCalledTimes(1)
    expect(dispatchReminderRules).toHaveBeenCalledWith(
      db,
      dispatcher,
      expect.objectContaining({
        targetType: "booking_cancelled_non_payment",
        bookingId: "book_2",
      }),
      { documentAttachmentResolver: attachmentResolver },
    )
  })

  it("maps booking expiry to non-payment cancellation rules", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const harness = createHarness()
    createBookingExpiredReminderSubscriberRuntime({ dispatchReminderRules }).register(harness)

    await harness.eventBus.emit("booking.expired", {
      bookingId: "book_1",
      bookingNumber: "BK-1",
      cause: "sweep",
      actorId: null,
    })

    expect(dispatchReminderRules).toHaveBeenCalledWith(
      db,
      dispatcher,
      expect.objectContaining({
        targetType: "booking_cancelled_non_payment",
        bookingId: "book_1",
      }),
      { documentAttachmentResolver: attachmentResolver },
    )
  })

  it("catches and logs runtime failures without rejecting the event", async () => {
    const logger = { error: vi.fn() }
    const harness = createHarness()
    createBookingConfirmedReminderSubscriberRuntime({
      dispatchReminderRules: vi.fn().mockRejectedValue(new Error("boom")),
      logger,
    }).register(harness)

    await expect(
      harness.eventBus.emit("booking.confirmed", {
        bookingId: "book_1",
        bookingNumber: "BK-1",
        actorId: null,
      }),
    ).resolves.toBeUndefined()
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringMatching(/booking_confirmed reminder rules failed.*book_1.*boom/),
    )
  })
})
