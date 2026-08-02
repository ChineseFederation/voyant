import { describe, expect, it } from "vitest"

import { resolveBookingSessionStaffAuthorities } from "./sessions-staff-authority.js"

describe("Booking Session staff authority", () => {
  it("preserves established booking and finance authority for staff Commit", () => {
    expect(
      resolveBookingSessionStaffAuthorities(
        ["bookings:write", "finance:write"],
        "catalog:booking-session-write",
      ),
    ).toEqual({
      staffAuthority: {
        admitted: true,
        reason: "scopes:bookings:write+finance:write",
      },
      staffBookingAuthority: {
        admitted: true,
        reason: "scopes:bookings:write+finance:write",
      },
    })
  })

  it("does not let the Catalog Session scope admit Finance-owned staff details", () => {
    expect(
      resolveBookingSessionStaffAuthorities(
        ["catalog:booking-session-write"],
        "catalog:booking-session-write",
      ),
    ).toEqual({
      staffAuthority: {
        admitted: true,
        reason: "scope:catalog:booking-session-write",
      },
    })
  })

  it("requires the dedicated Catalog scope for reads and retention", () => {
    expect(
      resolveBookingSessionStaffAuthorities(
        ["bookings:write", "finance:write"],
        "catalog:booking-session-read",
      ),
    ).toEqual({})
    expect(
      resolveBookingSessionStaffAuthorities(["catalog:*"], "catalog:booking-session-read"),
    ).toMatchObject({ staffAuthority: { admitted: true } })
  })
})
