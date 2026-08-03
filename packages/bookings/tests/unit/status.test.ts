import { describe, expect, it } from "vitest"

import {
  BOOKING_RESOURCE_AVAILABILITY_STATUSES,
  BOOKING_RESOURCE_CAPACITY_STATUSES,
  isBookingResourceAvailabilityStatus,
} from "../../src/status.js"

describe("booking resource status policy", () => {
  it("counts only live delivery states in availability", () => {
    expect(BOOKING_RESOURCE_AVAILABILITY_STATUSES).toEqual(["confirmed", "in_progress"])
  })

  it("retains completed commitments in capacity history", () => {
    expect(BOOKING_RESOURCE_CAPACITY_STATUSES).toEqual(["confirmed", "in_progress", "completed"])
  })

  it("checks canonical availability membership", () => {
    expect(isBookingResourceAvailabilityStatus("confirmed")).toBe(true)
    expect(isBookingResourceAvailabilityStatus("in_progress")).toBe(true)
    expect(isBookingResourceAvailabilityStatus("completed")).toBe(false)
    expect(isBookingResourceAvailabilityStatus("cancelled")).toBe(false)
    expect(isBookingResourceAvailabilityStatus("awaiting_payment")).toBe(false)
  })
})
