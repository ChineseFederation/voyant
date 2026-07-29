import { describe, expect, it } from "vitest"

import { bookingLifecycleOutboxEventId } from "../../src/service-core.js"

describe("booking lifecycle outbox event ids", () => {
  it("uses distinct event ids for legitimate later transitions on the same booking", () => {
    const confirmEventId = bookingLifecycleOutboxEventId("confirmed", "booking_1", {
      actionLedgerCausationActionId: "action_confirm_1",
    })
    const cancelEventId = bookingLifecycleOutboxEventId("cancelled", "booking_1", {
      actionLedgerCausationActionId: "action_cancel_1",
    })

    expect(confirmEventId).toBe("evt_booking_confirmed_booking_1_616374696f6e5f636f6e6669726d5f31")
    expect(cancelEventId).toBe("evt_booking_cancelled_booking_1_616374696f6e5f63616e63656c5f31")
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

    expect(first).toBe(
      "evt_booking_cancelled_booking_1_626f6f6b696e67735f63616e63656c20626f6f6b696e672031",
    )
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

    expect(first).toBe(
      "evt_booking_confirmed_booking_1_636f6e6669726d65645f323032362d30372d30315431303a30303a30302e3030305a",
    )
    expect(later).toBe(
      "evt_booking_confirmed_booking_1_636f6e6669726d65645f323032362d30372d30315431303a30313a30302e3030305a",
    )
    expect(later).not.toBe(first)
  })

  it("does not collide punctuation or unicode command identities", () => {
    const slash = bookingLifecycleOutboxEventId("confirmed", "booking_1", {
      actionLedgerIdempotencyKey: "confirm/one",
    })
    const question = bookingLifecycleOutboxEventId("confirmed", "booking_1", {
      actionLedgerIdempotencyKey: "confirm?one",
    })
    const unicode = bookingLifecycleOutboxEventId("confirmed", "booking_1", {
      actionLedgerIdempotencyKey: "confirm/one ☀",
    })
    const retry = bookingLifecycleOutboxEventId("confirmed", "booking_1", {
      actionLedgerIdempotencyKey: "confirm/one",
    })

    expect(slash).not.toBe(question)
    expect(unicode).not.toBe(slash)
    expect(retry).toBe(slash)
  })

  it("rejects missing lifecycle command identity instead of falling back to booking-only ids", () => {
    expect(() => bookingLifecycleOutboxEventId("confirmed", "booking_1")).toThrow(
      /Missing booking lifecycle command identity/,
    )
  })
})
