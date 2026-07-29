import { describe, expect, it } from "vitest"

import { dispatchBookingStatusChange } from "../../src/status-dispatch.js"

const BOOKING_ID = "book_01HZA0000000000000000000"

describe("dispatchBookingStatusChange — named verbs", () => {
  it("on_hold → confirmed routes to /confirm", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "on_hold", "confirmed")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/confirm`)
    expect(target.body).toEqual({})
  })

  it("on_hold → expired routes to /expire", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "on_hold", "expired")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/expire`)
    expect(target.body).toEqual({})
  })

  it("confirmed → in_progress routes to /start", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "confirmed", "in_progress")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/start`)
    expect(target.body).toEqual({})
  })

  it("in_progress → completed routes to /complete", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "in_progress", "completed")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/complete`)
    expect(target.body).toEqual({})
  })

  it.each([
    "draft",
    "on_hold",
    "confirmed",
    "in_progress",
  ] as const)("%s → cancelled routes to /cancel", (current) => {
    const target = dispatchBookingStatusChange(BOOKING_ID, current, "cancelled")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/cancel`)
    expect(target.body).toEqual({})
  })
})

describe("dispatchBookingStatusChange — note shaping", () => {
  it("includes note in body when provided", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "on_hold", "confirmed", "ok by ops")
    expect(target.body).toEqual({ note: "ok by ops" })
  })

  it("omits note when null", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "on_hold", "confirmed", null)
    expect(target.body).toEqual({})
  })

  it("omits note when empty string (falsy)", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "on_hold", "confirmed", "")
    expect(target.body).toEqual({})
  })
})

describe("dispatchBookingStatusChange — override fallback", () => {
  it("non-adjacent jump (cancelled → confirmed) falls through to /override-status", () => {
    const target = dispatchBookingStatusChange(
      BOOKING_ID,
      "cancelled",
      "confirmed",
      "data correction per ops",
    )
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/override-status`)
    expect(target.body).toEqual({
      status: "confirmed",
      reason: "data correction per ops",
      note: "data correction per ops",
    })
  })

  it("override uses a default audit reason when no note is provided", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "completed", "draft")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/override-status`)
    expect(target.body).toEqual({
      status: "draft",
      reason: "Status override from completed to draft",
    })
  })

  it("override uses a default audit reason when note is blank", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "cancelled", "confirmed", "   ")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/override-status`)
    expect(target.body).toEqual({
      status: "confirmed",
      reason: "Status override from cancelled to confirmed",
      note: "   ",
    })
  })

  it("expired → confirmed falls through to /override-status (no named verb)", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "expired", "confirmed", "ops override")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/override-status`)
    expect(target.body).toEqual({
      status: "confirmed",
      reason: "ops override",
      note: "ops override",
    })
  })

  it("draft → confirmed (no named verb for this arrow) routes to override", () => {
    const target = dispatchBookingStatusChange(BOOKING_ID, "draft", "confirmed", "manual confirm")
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/override-status`)
    expect(target.body).toEqual({
      status: "confirmed",
      reason: "manual confirm",
      note: "manual confirm",
    })
  })

  it("can suppress lifecycle events on confirmed override fallbacks", () => {
    const target = dispatchBookingStatusChange(
      BOOKING_ID,
      "draft",
      "confirmed",
      "data correction",
      { suppressLifecycleEvents: true },
    )
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/override-status`)
    expect(target.body).toEqual({
      status: "confirmed",
      reason: "data correction",
      note: "data correction",
      suppressLifecycleEvents: true,
    })
  })

  it("sends durable notification suppression to confirmed override fallbacks", () => {
    const target = dispatchBookingStatusChange(
      BOOKING_ID,
      "draft",
      "confirmed",
      "silent correction",
      { suppressNotifications: true },
    )
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/override-status`)
    expect(target.body).toEqual({
      status: "confirmed",
      reason: "silent correction",
      note: "silent correction",
      suppressNotifications: true,
    })
  })

  it("does not send lifecycle suppression to named confirm route", () => {
    const target = dispatchBookingStatusChange(
      BOOKING_ID,
      "on_hold",
      "confirmed",
      "normal confirm",
      { suppressLifecycleEvents: true },
    )
    expect(target.path).toBe(`/v1/admin/bookings/${BOOKING_ID}/confirm`)
    expect(target.body).toEqual({ note: "normal confirm" })
  })
})
