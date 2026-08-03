import { describe, expect, it } from "vitest"

import { dispatchBookingStatusChange } from "../../src/status-dispatch.js"

const BOOKING_ID = "book_01HZA0000000000000000000"

describe("dispatchBookingStatusChange", () => {
  it("uses named endpoints for canonical transitions", () => {
    expect(dispatchBookingStatusChange(BOOKING_ID, "confirmed", "in_progress")).toEqual({
      path: `/v1/admin/bookings/${BOOKING_ID}/start`,
      body: {},
    })
    expect(dispatchBookingStatusChange(BOOKING_ID, "in_progress", "completed")).toEqual({
      path: `/v1/admin/bookings/${BOOKING_ID}/complete`,
      body: {},
    })
    expect(
      dispatchBookingStatusChange(BOOKING_ID, "confirmed", "cancelled", "customer request"),
    ).toEqual({
      path: `/v1/admin/bookings/${BOOKING_ID}/cancel`,
      body: { note: "customer request" },
    })
  })

  it("uses the audited correction route for a non-adjacent status change", () => {
    expect(
      dispatchBookingStatusChange(BOOKING_ID, "cancelled", "confirmed", "data correction", {
        suppressLifecycleEvents: true,
        suppressNotifications: true,
      }),
    ).toEqual({
      path: `/v1/admin/bookings/${BOOKING_ID}/override-status`,
      body: {
        status: "confirmed",
        reason: "data correction",
        note: "data correction",
        suppressLifecycleEvents: true,
        suppressNotifications: true,
      },
    })
  })

  it("generates a non-empty audit reason for correction", () => {
    expect(dispatchBookingStatusChange(BOOKING_ID, "completed", "confirmed")).toEqual({
      path: `/v1/admin/bookings/${BOOKING_ID}/override-status`,
      body: {
        status: "confirmed",
        reason: "Status override from completed to confirmed",
      },
    })
  })

  it("persists notification suppression for cancellation", () => {
    expect(
      dispatchBookingStatusChange(BOOKING_ID, "in_progress", "cancelled", null, {
        suppressNotifications: true,
      }),
    ).toEqual({
      path: `/v1/admin/bookings/${BOOKING_ID}/cancel`,
      body: { suppressNotifications: true },
    })
  })
})
