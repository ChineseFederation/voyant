import { assembleAnonymousPaths } from "@voyant-travel/hono"
import { describe, expect, it } from "vitest"

import {
  createStorefrontApiModule,
  storefrontAnonymousPublicPaths,
  storefrontOptionalCustomerAuthPaths,
} from "../../src/index.js"

describe("createStorefrontApiModule", () => {
  it("declares only the guest storefront route families next to the owned public routes", () => {
    const module = createStorefrontApiModule()

    expect(module.publicPath).toBe("/")
    expect(module.anonymous).toBe(storefrontAnonymousPublicPaths)
    expect(module.anonymous).toEqual([
      "/bookings",
      "/departures",
      "/leads",
      "/newsletter",
      "/offers",
      "/settings",
    ])
    expect(assembleAnonymousPaths([module], [])).toEqual([
      "/v1/public/bookings",
      "/v1/public/departures",
      "/v1/public/leads",
      "/v1/public/newsletter",
      "/v1/public/offers",
      "/v1/public/settings",
    ])
    expect(module.optionalCustomerAuth).toBe(storefrontOptionalCustomerAuthPaths)
    expect(module.optionalCustomerAuth).toEqual([
      "/bookings",
      "/departures",
      "/leads",
      "/newsletter",
      "/offers",
      "/products",
      "/settings",
    ])

    const anonymouslyMatchedDepartureAndSettingsRoutes = new Set(
      module.publicRoutes?.routes
        .filter(
          ({ method, path }) =>
            method !== "ALL" &&
            (path === "/settings" ||
              path.startsWith("/settings/") ||
              path.startsWith("/departures/")),
        )
        .map(({ method, path }) => `${method} ${path}`),
    )

    expect([...anonymouslyMatchedDepartureAndSettingsRoutes]).toEqual([
      "GET /settings",
      "GET /departures/:departureId",
      "POST /departures/:departureId/price",
      "POST /departures/:departureId/eligibility",
    ])
  })
})
