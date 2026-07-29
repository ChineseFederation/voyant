import { describe, expect, it } from "vitest"

import { bookingLifecycleOutboxEventId } from "./service-core.js"

describe("booking lifecycle outbox event ids", () => {
  it("uses distinct event ids for legitimate later transitions on the same booking", () => {
    const confirmEventId = bookingLifecycleOutboxEventId("confirmed", "booking_1", {
      actionLedgerCausationActionId: "action_confirm_1",
    })
    const cancelEventId = bookingLifecycleOutboxEventId("cancelled", "booking_1", {
      actionLedgerCausationActionId: "action_cancel_1",
    })

    expect(confirmEventId).toBe("evt_booking_confirmed_booking_1_action_confirm_1")
    expect(cancelEventId).toBe("evt_booking_cancelled_booking_1_action_cancel_1")
    expect(confirmEventId).not.toBe(cancelEventId)
  })

  it("retains retry idempotency for the same lifecycle command identity", () => {
    const first = bookingLifecycleOutboxEventId("cancelled", "booking_1", {
      actionLedgerIdempotencyScope: "bookings",
      actionLedgerIdempotencyKey: "cancel booking 1",
    })
    const retry = bookingLifecycleOutboxEventId("cancelled", "booking_1", {
      actionLedgerIdempotencyScope: "bookings",
      actionLedgerIdempotencyKey: "cancel booking 1",
    })

    expect(first).toBe("evt_booking_cancelled_booking_1_bookings_cancel_booking_1")
    expect(retry).toBe(first)
  })

  it("uses persisted lifecycle timestamps when callers have no request metadata", () => {
    const first = bookingLifecycleOutboxEventId(
      "confirmed",
      "booking_1",
      {},
      "2026-07-01T10:00:00.000Z",
    )
    const later = bookingLifecycleOutboxEventId(
      "confirmed",
      "booking_1",
      {},
      "2026-07-01T10:01:00.000Z",
    )

    expect(first).toBe("evt_booking_confirmed_booking_1_confirmed_2026-07-01T10:00:00_000Z")
    expect(later).toBe("evt_booking_confirmed_booking_1_confirmed_2026-07-01T10:01:00_000Z")
    expect(later).not.toBe(first)
  })

  it("rejects missing lifecycle command identity instead of falling back to booking-only ids", () => {
    expect(() => bookingLifecycleOutboxEventId("confirmed", "booking_1")).toThrow(
      /Missing booking lifecycle command identity/,
    )
  })
})
