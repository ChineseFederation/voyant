import { createToolRegistry, type ToolContext } from "@voyant-travel/tools"
import { describe, expect, it } from "vitest"

import { type ChartersToolServices, chartersTools } from "../../src/tools.js"

function context(
  services?: ChartersToolServices,
): ToolContext & { charters?: ChartersToolServices } {
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
    charters: services,
  }
}

describe("charter tools", () => {
  it("registers the provider-neutral non-destructive surface", () => {
    const registry = createToolRegistry()
    expect(() => registry.registerAll(chartersTools)).not.toThrow()
    const manifest = registry.list()

    expect(manifest).toHaveLength(12)
    expect(new Set(manifest.map(({ capabilityId }) => capabilityId)).size).toBe(12)
    expect(manifest.every(({ owner }) => owner === "@voyant-travel/charters")).toBe(true)
    expect(manifest.some(({ name }) => name.includes("archive") || name.includes("delete"))).toBe(
      false,
    )
  })

  it("guards created targets separately from reversible lifecycle writes", () => {
    for (const tool of chartersTools.filter(
      ({ requiredScopes }) => requiredScopes[0] === "charters:write" && requiredScopes.length === 1,
    )) {
      expect(tool.riskPolicy.reversible).toBe(
        !["create_charter_product", "create_charter_yacht"].includes(tool.name),
      )
      expect(tool.audience?.allowed).toEqual(["staff"])
    }
  })

  it("dispatches quotes through the selected module runtime", async () => {
    const calls: Array<{ operation: string; input: unknown }> = []
    const registry = createToolRegistry()
    registry.registerAll(chartersTools)
    const result = await registry.dispatch(
      "quote_charter_whole_yacht",
      { key: "chvoy_1", currency: "EUR" },
      context({
        async execute(operation, input) {
          calls.push({ operation, input })
          return {
            mode: "whole_yacht",
            voyageId: "chvoy_1",
            currency: "EUR",
            charterFee: "10000.00",
            apaPercent: "30.00",
            apaAmount: "3000.00",
            total: "13000.00",
          }
        },
      }),
    )

    expect(result).toMatchObject({ mode: "whole_yacht", total: "13000.00" })
    expect(calls).toEqual([
      {
        operation: "quoteWholeYacht",
        input: { key: "chvoy_1", currency: "EUR" },
      },
    ])
  })

  it("fails closed when no charter runtime is contributed", async () => {
    const registry = createToolRegistry()
    registry.registerAll(chartersTools)
    await expect(
      registry.dispatch("browse_charters", {}, context(undefined)),
    ).rejects.toMatchObject({ code: "MISSING_SERVICE" })
  })
})
