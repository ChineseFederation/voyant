import { describe, expect, it } from "vitest"

import {
  BOOKING_TRANSITIONS,
  type BookingStatus,
  BookingTransitionError,
  canTransitionBooking,
  transitionBooking,
} from "../../src/state-machine.js"

const ALL_STATUSES = Object.keys(BOOKING_TRANSITIONS) as BookingStatus[]

describe("BOOKING_TRANSITIONS", () => {
  for (const from of ALL_STATUSES) {
    for (const to of ALL_STATUSES) {
      const expected = (BOOKING_TRANSITIONS[from] as readonly BookingStatus[]).includes(to)
      it(`${from} → ${to} is ${expected ? "allowed" : "rejected"}`, () => {
        expect(canTransitionBooking(from, to)).toBe(expected)
      })
    }
  }

  it("models only committed Booking delivery and cancellation", () => {
    expect(BOOKING_TRANSITIONS).toEqual({
      confirmed: ["in_progress", "cancelled"],
      in_progress: ["completed", "cancelled"],
      completed: [],
      cancelled: [],
    })
  })
})

describe("transitionBooking", () => {
  it("starts delivery without erasing the commitment timestamp", () => {
    expect(transitionBooking("confirmed", "in_progress")).toEqual({ status: "in_progress" })
  })

  it("stamps cancellation", () => {
    const now = new Date("2026-01-01T00:00:00Z")
    expect(transitionBooking("confirmed", "cancelled", { now })).toEqual({
      status: "cancelled",
      cancelledAt: now,
    })
  })

  it("stamps completion", () => {
    const now = new Date("2026-01-01T00:00:00Z")
    expect(transitionBooking("in_progress", "completed", { now })).toEqual({
      status: "completed",
      completedAt: now,
    })
  })

  it("rejects non-adjacent and terminal transitions", () => {
    expect(() => transitionBooking("confirmed", "completed")).toThrow(BookingTransitionError)
    expect(() => transitionBooking("completed", "cancelled")).toThrow(BookingTransitionError)
  })

  it("exposes stable transition error metadata", () => {
    try {
      transitionBooking("completed", "confirmed")
      expect.unreachable("should have thrown")
    } catch (cause) {
      expect(cause).toMatchObject({
        code: "INVALID_BOOKING_TRANSITION",
        from: "completed",
        to: "confirmed",
      })
    }
  })
})
