import { OpenAPIHono } from "@hono/zod-openapi"
import { handleApiError } from "@voyant-travel/hono"
import { describe, expect, it } from "vitest"

import { BOOKING_CUSTOMER_ACCESS_CAPABILITIES } from "../../../src/action-ledger-capabilities.js"
import { bookingCustomerAccessAdminRoutes } from "../../../src/routes-customer-access-admin.js"
import {
  staffGrantBookingCustomerAccessSchema,
  staffRevokeBookingCustomerAccessSchema,
} from "../../../src/validation-customer-access.js"
import { bookingsVoyantModule } from "../../../src/voyant.js"

function routeApp(scopes: string[]) {
  const app = new OpenAPIHono()
  app.use("*", async (c, next) => {
    c.set("scopes", scopes)
    c.set("userId", "usr_staff")
    c.set("actor", "staff")
    c.set("callerType", "session")
    return next()
  })
  app.route("/", bookingCustomerAccessAdminRoutes)
  app.onError(handleApiError)
  return app
}

describe("booking customer-access admin contract", () => {
  it("does not let ordinary bookings permission grant customer access", async () => {
    const response = await routeApp(["bookings:write"]).request("/bkg_1/customer-access", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "idempotency-key": "grant-1",
      },
      body: JSON.stringify({
        buyerAccountId: "personal:usr_customer",
        buyerAccountKind: "personal",
        reason: "Customer ownership verified by support",
      }),
    })

    expect(response.status).toBe(403)
  })

  it("rejects a Buyer Account id whose qualifier disagrees with its kind", () => {
    expect(
      staffGrantBookingCustomerAccessSchema.safeParse({
        buyerAccountId: "business:org_1",
        buyerAccountKind: "personal",
        reason: "Customer ownership verified by support",
      }).success,
    ).toBe(false)
  })

  it("requires a bounded reason for both staff commands", () => {
    expect(
      staffGrantBookingCustomerAccessSchema.safeParse({
        buyerAccountId: "personal:usr_customer",
        buyerAccountKind: "personal",
        reason: "",
      }).success,
    ).toBe(false)
    expect(
      staffRevokeBookingCustomerAccessSchema.safeParse({ reason: "x".repeat(501) }).success,
    ).toBe(false)
  })

  it("declares a dedicated access resource and audited action capabilities", () => {
    const resource = bookingsVoyantModule.access?.resources.find(
      ({ resource }) => resource === "booking-customer-access",
    )

    expect(resource?.actions.map(({ action }) => action)).toEqual(["read", "write"])
    expect(BOOKING_CUSTOMER_ACCESS_CAPABILITIES.list.requiredGrants).toEqual([
      { resource: "booking-customer-access", action: "read" },
    ])
    expect(BOOKING_CUSTOMER_ACCESS_CAPABILITIES.grant.ledgerPolicy).toBe("required")
    expect(BOOKING_CUSTOMER_ACCESS_CAPABILITIES.revoke.requiredGrants).toEqual([
      { resource: "booking-customer-access", action: "write" },
    ])
  })
})
