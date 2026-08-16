import { describe, expect, it } from "vitest"

import { createGuestBookingGuard } from "../../src/guest-booking-guard.js"

describe("createGuestBookingGuard", () => {
  it("reads guest booking access from headers and cookies", () => {
    const guard = createGuestBookingGuard()

    expect(
      guard.getAccessToken({
        headers: { "x-voyant-guest-booking-access": "header-token" },
      }),
    ).toBe("header-token")

    expect(
      guard.getAccessToken({
        headers: { Cookie: "other=1; voyant_guest_booking=cookie-token" },
      }),
    ).toBe("cookie-token")
  })

  it("builds guest lookup requests and overview urls", () => {
    const guard = createGuestBookingGuard()

    expect(guard.createLookupRequest({ bookingCode: "BK-123", email: "ana@example.com" })).toEqual({
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bookingCode: "BK-123", email: "ana@example.com" }),
    })
    expect(guard.overviewUrl("BK-123")).toBe("/v1/public/bookings/overview?bookingCode=BK-123")
  })
})
