import { createToolRegistry } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { priceCatalogTypeEnum } from "./pricing/schema-shared.js"
import {
  archivePromotionTool,
  commerceTools,
  createCancellationPolicyTool,
  listPriceCatalogsTool,
  resolveSellabilityTool,
} from "./tools.js"

describe("commerce tools", () => {
  it("publishes complete guarded sellability, pricing-policy, and promotion surfaces", () => {
    expect(commerceTools).toHaveLength(14)
    expect(new Set(commerceTools.map((tool) => tool.capabilityId)).size).toBe(14)
    expect(() => createToolRegistry().registerAll(commerceTools)).not.toThrow()
  })

  /**
   * `list_price_catalogs` hand-wrote its own catalogType enum, which overlapped
   * the real `price_catalog_type` pgEnum in only two of seven values. The tool
   * therefore threw on its OWN output for any contract/net/gross/promo/other
   * catalog — a read tool broken for most of the rows it exists to return, and
   * invisible until a live agent hit a database that had one.
   *
   * Asserted against the pgEnum rather than a literal list: a hard-coded
   * expectation here would be a second copy to drift, which is the original bug.
   */
  it("accepts every price_catalog_type the database can store", () => {
    for (const catalogType of priceCatalogTypeEnum.enumValues) {
      const result = listPriceCatalogsTool.outputSchema.safeParse({
        data: [
          {
            id: "pcat_1",
            code: "STD",
            name: "Standard",
            currencyCode: "EUR",
            catalogType,
            isDefault: false,
            active: true,
            notes: null,
            metadata: null,
            createdAt: "2026-08-05T10:00:00.000Z",
            updatedAt: "2026-08-05T10:00:00.000Z",
          },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      })
      expect(result.success, `catalogType "${catalogType}" must parse`).toBe(true)
    }
  })

  it("publishes a structural sellability contract", () => {
    expect(
      resolveSellabilityTool.outputSchema.safeParse({ data: [], meta: { total: 0 } }).success,
    ).toBe(true)
    expect(resolveSellabilityTool.outputSchema.safeParse({ data: [] }).success).toBe(false)
  })

  it("keeps writes staff-scoped and reports only concrete reversal support", () => {
    for (const tool of [createCancellationPolicyTool, archivePromotionTool]) {
      expect(tool.audience).toEqual({ source: "grant", allowed: ["staff"] })
      expect(tool.riskPolicy).toMatchObject({
        destructive: false,
        sideEffects: ["data-write"],
      })
    }
    expect(createCancellationPolicyTool.riskPolicy.reversible).toBe(false)
    expect(archivePromotionTool.riskPolicy.reversible).toBe(true)
  })
})
