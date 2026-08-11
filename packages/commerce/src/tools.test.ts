import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { priceCatalogTypeEnum } from "./pricing/schema-shared.js"
import {
  archivePromotionTool,
  type CommerceToolServices,
  commerceTools,
  createCancellationPolicyTool,
  listPriceCatalogsTool,
  listSellabilityPoliciesTool,
  resolveSellabilityTool,
  updateSellabilityPolicyTool,
} from "./tools.js"

describe("commerce tools", () => {
  it("publishes complete guarded sellability, pricing-policy, and promotion surfaces", () => {
    expect(commerceTools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "list_sellability_policies",
        "get_sellability_policy",
        "create_sellability_policy",
        "update_sellability_policy",
      ]),
    )
    expect(commerceTools).toHaveLength(18)
    expect(new Set(commerceTools.map((tool) => tool.capabilityId)).size).toBe(18)
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

  it("lists and deactivates sellability policies through their domain contract", async () => {
    const policy = {
      id: "spol_1",
      name: "Adults only",
      scope: "product",
      policyType: "occupancy",
      productId: "prod_1",
      optionId: null,
      marketId: null,
      channelId: null,
      priority: 10,
      active: true,
      conditions: { minimumAge: 18 },
      effects: { mode: "blocked" },
      notes: null,
      metadata: null,
      createdAt: "2026-08-11T08:00:00.000Z",
      updatedAt: "2026-08-11T08:00:00.000Z",
    }
    const services = {
      async listSellabilityPolicies(input) {
        return { data: [policy], total: 1, limit: input.limit, offset: input.offset }
      },
      async updateSellabilityPolicy(id, patch) {
        expect({ id, patch }).toEqual({ id: policy.id, patch: { active: false } })
        return { ...policy, active: false }
      },
    } satisfies Partial<CommerceToolServices>
    const ctx = {
      actor: "staff",
      audience: "staff",
      commerce: services as CommerceToolServices,
    } as ToolContext & { commerce: CommerceToolServices }

    await expect(
      listSellabilityPoliciesTool.handler({ limit: 10, offset: 0 }, ctx),
    ).resolves.toEqual({ data: [policy], total: 1, limit: 10, offset: 0 })
    await expect(
      updateSellabilityPolicyTool.handler({ id: policy.id, active: false }, ctx),
    ).resolves.toMatchObject({ id: policy.id, active: false })
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
