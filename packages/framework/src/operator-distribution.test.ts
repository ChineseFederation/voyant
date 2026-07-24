import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"
import {
  mergeOperatorDistributionDefaults,
  STANDARD_OPERATOR_DISTRIBUTION,
  STANDARD_OPERATOR_DISTRIBUTION_POLICY,
  STANDARD_OPERATOR_PRODUCT_BOM,
  STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE,
  selectStandardOperatorDistribution,
} from "./operator-distribution.js"

describe("standard Operator distribution", () => {
  it("declares the complete package-owned Node closure in stable order", () => {
    expect(STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE).toEqual({
      schemaVersion: "voyant.product-bom-reference.v1",
      id: "@voyant-travel/operator-standard",
      version: "1",
    })
    expect(STANDARD_OPERATOR_PRODUCT_BOM).toMatchObject({
      ...STANDARD_OPERATOR_PRODUCT_BOM_REFERENCE,
      target: "node",
      modules: expect.any(Array),
      extensions: expect.any(Array),
      deployment: { target: "node" },
    })
    expect(STANDARD_OPERATOR_DISTRIBUTION).toMatchObject({
      id: "operator-standard",
      target: "node",
    })
    expect(STANDARD_OPERATOR_DISTRIBUTION.modules).toContain("@voyant-travel/bookings/extras")
    expect(STANDARD_OPERATOR_DISTRIBUTION.modules.slice(0, 5)).toEqual([
      "@voyant-travel/action-ledger",
      "@voyant-travel/event-catalog",
      "@voyant-travel/webhook-delivery",
      "@voyant-travel/mcp",
      "@voyant-travel/relationships",
    ])
    expect(STANDARD_OPERATOR_DISTRIBUTION.modules.slice(-2)).toEqual([
      "@voyant-travel/catalog-authoring",
      "@voyant-travel/reporting",
    ])
    expect(STANDARD_OPERATOR_DISTRIBUTION.extensions).toHaveLength(24)
    expect(STANDARD_OPERATOR_DISTRIBUTION.extensions).toContain(
      "@voyant-travel/distribution/extension",
    )
    expect(STANDARD_OPERATOR_DISTRIBUTION.extensions.slice(-2)).toEqual([
      "@voyant-travel/legal/standard-product-links",
      "@voyant-travel/mice/standard-product-links",
    ])
    expect(new Set(STANDARD_OPERATOR_DISTRIBUTION.modules).size).toBe(
      STANDARD_OPERATOR_DISTRIBUTION.modules.length,
    )
    expect(new Set(STANDARD_OPERATOR_DISTRIBUTION.extensions).size).toBe(24)
  })

  it("defaults authored differences without treating extensions as plugins", () => {
    expect(mergeOperatorDistributionDefaults()).toEqual({
      modules: STANDARD_OPERATOR_DISTRIBUTION.modules,
      extensions: STANDARD_OPERATOR_DISTRIBUTION.extensions,
      plugins: [],
    })
  })

  it("removes a module and every distribution extension that declares it as an owner", () => {
    const selected = selectStandardOperatorDistribution({
      exclude: ["@voyant-travel/bookings"],
    })
    const ownedExtensions = STANDARD_OPERATOR_DISTRIBUTION_POLICY.extensions
      .filter((extension) => extension.owners.includes("@voyant-travel/bookings"))
      .map((extension) => extension.resolve)

    expect(selected.modules).not.toContain("@voyant-travel/bookings")
    for (const extension of ownedExtensions) expect(selected.extensions).not.toContain(extension)
    expect(selected.extensions).toContain("@voyant-travel/catalog/offers-extension")
  })

  it("does not allow required or unknown selections to be removed", () => {
    expect(() =>
      selectStandardOperatorDistribution({ exclude: ["@voyant-travel/identity"] }),
    ).toThrow(/cannot exclude required module/)
    expect(() =>
      selectStandardOperatorDistribution({ exclude: ["@voyant-travel/event-catalog"] }),
    ).toThrow(/cannot exclude required module/)
    expect(() =>
      selectStandardOperatorDistribution({ exclude: ["@voyant-travel/not-real"] }),
    ).toThrow(/not in the standard set/)
  })

  it("appends each consumer-owned unit kind independently and deterministically", () => {
    const differences = {
      modules: [{ resolve: "./src/modules/team" }],
      extensions: [{ resolve: "./src/extensions/reporting" }],
      plugins: [{ resolve: "@voyant-travel/plugin-netopia" }],
    } as const

    const first = mergeOperatorDistributionDefaults(differences)
    const second = mergeOperatorDistributionDefaults(differences)

    expect(first).toEqual(second)
    expect(first.modules.at(-1)).toEqual(differences.modules[0])
    expect(first.extensions.at(-1)).toEqual(differences.extensions[0])
    expect(first.plugins).toEqual(differences.plugins)
    expect(first.extensions).not.toContain(differences.plugins[0])
  })

  it("accepts future distribution variants without adding runtime lineage", () => {
    const variant = {
      id: "operator-compact",
      target: "node",
      modules: ["@voyant-travel/identity"],
      extensions: [],
    } as const

    expect(mergeOperatorDistributionDefaults({}, variant)).toEqual({
      modules: variant.modules,
      extensions: [],
      plugins: [],
    })
  })

  it("has no runtime imports or starter coupling", () => {
    const source = readFileSync(new URL("operator-distribution.ts", import.meta.url), "utf8")
    expect(source).not.toMatch(/^import (?!type\b)/m)
    expect(source).not.toContain("starters/")
    expect(source).not.toContain("managed-operator")
  })
})
