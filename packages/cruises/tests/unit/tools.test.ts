import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { type CruisesToolServices, cruisesTools } from "../../src/tools.js"

function context(services?: CruisesToolServices): ToolContext & { cruises?: CruisesToolServices } {
  return {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: {
      locale: "en-GB",
      audience: "staff",
      market: "default",
      actor: "staff",
    },
    cruises: services,
  }
}

describe("cruise tools", () => {
  it("registers the provider-neutral non-destructive surface", () => {
    const registry = createToolRegistry()
    expect(() => registry.registerAll(cruisesTools)).not.toThrow()
    const manifest = registry.list()

    expect(manifest).toHaveLength(11)
    expect(new Set(manifest.map(({ capabilityId }) => capabilityId)).size).toBe(11)
    expect(manifest.every(({ owner }) => owner === "@voyant-travel/cruises")).toBe(true)
    expect(manifest.some(({ name }) => name.includes("archive") || name.includes("delete"))).toBe(
      false,
    )
  })

  it("guards created targets as irreversible writes", () => {
    for (const tool of cruisesTools.filter(
      ({ requiredScopes }) => requiredScopes[0] === "cruises:write" && requiredScopes.length === 1,
    )) {
      expect(tool.riskPolicy.reversible).toBe(
        tool.name !== "create_cruise" && tool.name !== "create_cruise_ship",
      )
      expect(tool.audience?.allowed).toEqual(["staff"])
    }
  })

  it("dispatches quotes through the selected module runtime", async () => {
    const calls: Array<{ operation: string; input: unknown }> = []
    const registry = createToolRegistry()
    registry.registerAll(cruisesTools)
    const result = await registry.dispatch(
      "quote_cruise_sailing",
      {
        key: "crsail_1",
        cabinCategoryId: "crcat_1",
        occupancy: 2,
        guestCount: 2,
      },
      context({
        async execute(operation, input) {
          calls.push({ operation, input })
          return {
            fareCode: null,
            fareCodeName: null,
            fareVariant: "cruise_only",
            currency: "EUR",
            occupancy: 2,
            guestCount: 2,
            basePerPerson: "1000.00",
            originalPricePerPerson: null,
            singlePricePerPerson: null,
            earlyBookingDeadline: null,
            earlyBookingBonusDescription: null,
            components: [],
            totalPerPerson: "1000.00",
            totalForCabin: "2000.00",
            bookingTerms: null,
          }
        },
      }),
    )

    expect(result).toMatchObject({ currency: "EUR", totalForCabin: "2000.00" })
    expect(calls[0]).toMatchObject({ operation: "quoteSailing" })
  })

  it("fails closed when no cruise runtime is contributed", async () => {
    const registry = createToolRegistry()
    registry.registerAll(cruisesTools)
    await expect(registry.dispatch("search_cruises", {}, context(undefined))).rejects.toMatchObject(
      { code: "MISSING_SERVICE" },
    )
  })
})
