import {
  issueCheckoutCapability,
  issueGuestBookingAccess,
} from "@voyant-travel/bookings/checkout-capability"
import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

const startCatalogCheckout = vi.hoisted(() => vi.fn())

vi.mock("../../src/checkout/start-service.js", async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  startCatalogCheckout,
}))

import { createCatalogCheckoutRoutes } from "../../src/checkout/routes.js"

const CAPABILITY_ENV = {
  VOYANT_CHECKOUT_CAPABILITY_SECRET: "checkout-capability-test-secret-32chars",
}

const BOOKING_ID = "book_123"

/**
 * A bare booking id is not authorization: without this guard, starting a
 * payment against someone else's booking is a matter of guessing an id.
 */
describe("POST /checkout/start capability", () => {
  beforeEach(() => {
    startCatalogCheckout.mockReset()
    startCatalogCheckout.mockResolvedValue({ kind: "hold_placed", bookingId: BOOKING_ID })
  })

  it("refuses a request carrying no capability", async () => {
    const response = await call()

    expect(response.status).toBe(401)
    expect(startCatalogCheckout).not.toHaveBeenCalled()
  })

  it("refuses a capability issued for another booking", async () => {
    const other = await issueCheckoutCapability("book_other", CAPABILITY_ENV)

    const response = await call({ "X-Voyant-Checkout-Capability": other.token })

    // Authentic token, wrong subject — forbidden rather than unauthenticated.
    expect(response.status).toBe(403)
    expect(startCatalogCheckout).not.toHaveBeenCalled()
  })

  it("accepts the guest-booking capability, which also grants payment:start", async () => {
    // A guest who reached checkout through the booking-overview path holds
    // only this capability; rejecting it would lock them out of paying.
    const guest = await issueGuestBookingAccess(BOOKING_ID, CAPABILITY_ENV)

    const response = await call({ "X-Voyant-Guest-Booking-Access": guest.token })

    expect(response.status).toBe(200)
    expect(startCatalogCheckout).toHaveBeenCalledTimes(1)
  })

  it("accepts the capability issued for this booking", async () => {
    const capability = await issueCheckoutCapability(BOOKING_ID, CAPABILITY_ENV)

    const response = await call({ "X-Voyant-Checkout-Capability": capability.token })

    expect(response.status).toBe(200)
    expect(startCatalogCheckout).toHaveBeenCalledTimes(1)
  })
})

async function call(headers: Record<string, string> = {}) {
  const app = new Hono()
  app.onError(handleApiError)
  app.use("*", async (c, next) => {
    c.set("db" as never, {} as never)
    await next()
  })
  app.route("/", createCatalogCheckoutRoutes({}) as never)

  return app.request(
    "/checkout/start",
    {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ bookingId: BOOKING_ID, paymentIntent: "hold" }),
    },
    CAPABILITY_ENV,
  )
}
