import { isGraphRuntimeFactory } from "@voyant-travel/core/project"
import { describe, expect, it } from "vitest"
import {
  createBookingMaintenanceApiExtension,
  createCatalogCheckoutApiExtension,
  createCatalogCheckoutGraphExtension,
} from "./checkout/index.js"
import {
  commerceRuntimeModuleNames,
  createCommerceApiModules,
  createCommercePublicApiOfferResolvers,
} from "./index.js"
import { marketsApiModule } from "./markets/index.js"
import { pricingApiModule } from "./pricing/index.js"
import { promotionsApiModule } from "./promotions/index.js"
import { sellabilityApiModule } from "./sellability/index.js"

describe("commerce runtime", () => {
  it("publishes checkout and booking maintenance extension descriptors", () => {
    const checkout = createCatalogCheckoutApiExtension({} as never)
    const maintenance = createBookingMaintenanceApiExtension({} as never)

    expect(checkout.extension).toMatchObject({ name: "catalog-checkout", module: "catalog" })
    expect(checkout.publicRoutes).toBeDefined()
    expect(isGraphRuntimeFactory(createCatalogCheckoutGraphExtension)).toBe(true)
    expect(maintenance.extension).toEqual({ name: "booking-maintenance", module: "bookings" })
    expect(maintenance.adminRoutes).toBeDefined()
  })

  it("expands to the commercial runtime modules in stable order", () => {
    const modules = createCommerceApiModules()

    expect(modules.map((mod) => mod.module.name)).toEqual([...commerceRuntimeModuleNames])
    expect(modules).toEqual([
      pricingApiModule,
      marketsApiModule,
      sellabilityApiModule,
      promotionsApiModule,
    ])
  })

  it("exports a Commerce-named storefront offer resolver factory", () => {
    const resolvers = createCommercePublicApiOfferResolvers()

    expect(typeof resolvers.listApplicableOffers).toBe("function")
    expect(typeof resolvers.getOfferBySlug).toBe("function")
    expect(typeof resolvers.applyOffer).toBe("function")
    expect(typeof resolvers.redeemOffer).toBe("function")
  })
})
