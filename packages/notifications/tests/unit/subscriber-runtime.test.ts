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
    const isNotificationsSuppressed = vi.fn().mockResolvedValue(false)
    const harness = createHarness()
    createBookingConfirmedReminderSubscriberRuntime({
      dispatchReminderRules,
      isNotificationsSuppressed,
    }).register(harness)

    const payload = { bookingId: "book_1", bookingNumber: "BK-1", actorId: null }
    await harness.eventBus.emit("booking.confirmed", payload)

    expect(dispatchReminderRules).toHaveBeenCalledWith(
      db,
      dispatcher,
      { targetType: "booking_confirmed", bookingId: "book_1", eventData: payload },
      { documentAttachmentResolver: attachmentResolver },
    )
    expect(isNotificationsSuppressed).toHaveBeenCalledWith(db, "book_1")
  })

  it("does not dispatch a suppressed booking confirmation", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const harness = createHarness()
    createBookingConfirmedReminderSubscriberRuntime({ dispatchReminderRules }).register(harness)

    await harness.eventBus.emit("booking.confirmed", {
      bookingId: "book_silent",
      bookingNumber: "BK-SILENT",
      actorId: null,
      suppressNotifications: true,
    })

    expect(dispatchReminderRules).not.toHaveBeenCalled()
  })

  it("does not dispatch confirmation for a persistently suppressed booking", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const isNotificationsSuppressed = vi.fn().mockResolvedValue(true)
    const harness = createHarness()
    createBookingConfirmedReminderSubscriberRuntime({
      dispatchReminderRules,
      isNotificationsSuppressed,
    }).register(harness)

    await harness.eventBus.emit("booking.confirmed", {
      bookingId: "book_silent",
      bookingNumber: "BK-SILENT",
      actorId: null,
    })

    expect(isNotificationsSuppressed).toHaveBeenCalledWith(db, "book_silent")
    expect(dispatchReminderRules).not.toHaveBeenCalled()
  })

  it("dispatches payment rules only when the booking is paid in full", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const isPaidInFull = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
    const isNotificationsSuppressed = vi.fn().mockResolvedValue(false)
    const harness = createHarness()
    createPaymentCompletedReminderSubscriberRuntime({
      dispatchReminderRules,
      isPaidInFull,
      isNotificationsSuppressed,
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

  it("does not dispatch payment rules for a persistently suppressed booking", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const isPaidInFull = vi.fn().mockResolvedValue(true)
    const isNotificationsSuppressed = vi.fn().mockResolvedValue(true)
    const harness = createHarness()
    createPaymentCompletedReminderSubscriberRuntime({
      dispatchReminderRules,
      isPaidInFull,
      isNotificationsSuppressed,
    }).register(harness)

    await harness.eventBus.emit("payment.completed", {
      paymentSessionId: "pay_silent",
      bookingId: "book_silent",
      amountCents: 1000,
      currency: "EUR",
      provider: "test",
    })

    expect(isNotificationsSuppressed).toHaveBeenCalledWith(db, "book_silent")
    expect(isPaidInFull).not.toHaveBeenCalled()
    expect(dispatchReminderRules).not.toHaveBeenCalled()
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

  it("clears queued reminders but does not dispatch a suppressed cancellation", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const harness = createHarness()
    createBookingCancelledReminderSubscriberRuntime({ dispatchReminderRules }).register(harness)

    await harness.eventBus.emit("booking.cancelled", {
      bookingId: "book_silent",
      bookingNumber: "BK-SILENT",
      previousStatus: "on_hold",
      actorId: null,
      suppressNotifications: true,
    })

    expect(dispatchReminderRules).not.toHaveBeenCalled()
    expect(db.update).toHaveBeenCalled()
  })

  it("maps booking expiry to non-payment cancellation rules", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const isNotificationsSuppressed = vi.fn().mockResolvedValue(false)
    const harness = createHarness()
    createBookingExpiredReminderSubscriberRuntime({
      dispatchReminderRules,
      isNotificationsSuppressed,
    }).register(harness)

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
    expect(isNotificationsSuppressed).toHaveBeenCalledWith(db, "book_1")
  })

  it("clears queued reminders but does not dispatch an expired reminder for a persistently suppressed booking", async () => {
    const dispatchReminderRules = vi.fn().mockResolvedValue(undefined)
    const isNotificationsSuppressed = vi.fn().mockResolvedValue(true)
    const harness = createHarness()
    createBookingExpiredReminderSubscriberRuntime({
      dispatchReminderRules,
      isNotificationsSuppressed,
    }).register(harness)

    await harness.eventBus.emit("booking.expired", {
      bookingId: "book_silent",
      bookingNumber: "BK-SILENT",
      cause: "sweep",
      actorId: null,
    })

    expect(db.update).toHaveBeenCalled()
    expect(isNotificationsSuppressed).toHaveBeenCalledWith(db, "book_silent")
    expect(dispatchReminderRules).not.toHaveBeenCalled()
  })

  it("catches and logs runtime failures without rejecting the event", async () => {
    const logger = { error: vi.fn() }
    const harness = createHarness()
    createBookingConfirmedReminderSubscriberRuntime({
      dispatchReminderRules: vi.fn().mockRejectedValue(new Error("boom")),
      isNotificationsSuppressed: vi.fn().mockResolvedValue(false),
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
