import { createFieldPolicyRegistry } from "@voyant-travel/catalog/contract"
import { describe, expect, it } from "vitest"

import { productCatalogPolicy } from "../../src/catalog-policy.js"
import {
  PRODUCT_DEPARTURES_FIELD_POLICY,
  productDeparturesCatalogPolicy,
} from "../../src/catalog-policy-departures.js"
import { productDestinationsCatalogPolicy } from "../../src/catalog-policy-destinations.js"
import { productTaxonomyCatalogPolicy } from "../../src/catalog-policy-taxonomy.js"

describe("productDeparturesCatalogPolicy", () => {
  it("declares the storefront-required departure paths", () => {
    const paths = PRODUCT_DEPARTURES_FIELD_POLICY.map((p) => p.path)
    expect(paths).toContain("nextDepartureAt")
    expect(paths).toContain("nextDepartureDate")
    expect(paths).toContain("nextDepartureEndsAt")
    expect(paths).toContain("nextDepartureEndDate")
    expect(paths).toContain("departureTimezone")
    expect(paths).toContain("hasUpcomingDeparture")
    expect(paths).toContain("upcomingDepartureCount")
    expect(paths).toContain("departureDates[]")
    expect(paths).toContain("departureMonths[]")
    expect(paths).toContain("availableUnitsTotal")
  })

  it("declares a timezone alongside every bare local-date field it projects", () => {
    const paths = PRODUCT_DEPARTURES_FIELD_POLICY.map((p) => p.path)
    // A document that mixes instants and bare local dates must name the zone
    // that reconciles them, or a consumer renders one of the two a day out
    // (#4116).
    const localDateFields = paths.filter(
      (path) => path.endsWith("Date") || path === "departureDates[]",
    )
    expect(localDateFields.length).toBeGreaterThan(0)
    expect(paths).toContain("departureTimezone")
  })

  it("does not declare any locale-keyed fields (departures are TZ-keyed, not locale-keyed)", () => {
    for (const policy of PRODUCT_DEPARTURES_FIELD_POLICY) {
      expect(policy.localized).toBe(false)
    }
  })

  it("makes every field visible to staff/customer/partner so storefront cards can render", () => {
    for (const policy of PRODUCT_DEPARTURES_FIELD_POLICY) {
      expect(policy.visibility).toContain("customer")
      expect(policy.visibility).toContain("partner")
      expect(policy.visibility).toContain("staff")
    }
  })

  it("composes cleanly with all other product child-entity policies", () => {
    const registry = createFieldPolicyRegistry([
      ...productCatalogPolicy,
      ...productDestinationsCatalogPolicy,
      ...productTaxonomyCatalogPolicy,
      ...productDeparturesCatalogPolicy,
    ])
    expect(registry.resolve("name")).toBeDefined()
    expect(registry.resolve("regions[]")).toBeDefined()
    expect(registry.resolve("categories[]")).toBeDefined()
    expect(registry.resolve("nextDepartureAt")).toBeDefined()
    expect(registry.resolve("departureMonths[]")).toBeDefined()
    expect(registry.resolve("availableUnitsTotal")).toBeDefined()
  })

  it("does not duplicate any path against the base or sibling child-entity policies", () => {
    expect(() =>
      createFieldPolicyRegistry([
        ...productCatalogPolicy,
        ...productDestinationsCatalogPolicy,
        ...productTaxonomyCatalogPolicy,
        ...productDeparturesCatalogPolicy,
      ]),
    ).not.toThrow()
  })
})
