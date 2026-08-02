import { createFieldPolicyRegistry } from "@voyant-travel/catalog/contract"
import { describe, expect, it } from "vitest"

import { productCatalogPolicy } from "../../src/catalog-policy.js"

describe("productCatalogPolicy", () => {
  it("compiles into a valid registry without errors", () => {
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    expect(registry.policies.length).toBeGreaterThan(0)
  })

  it("declares the three provenance fields all verticals need", () => {
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    expect(registry.byPath.has("source.kind")).toBe(true)
    expect(registry.byPath.has("source.ref")).toBe(true)
    expect(registry.byPath.has("seller.operator_id")).toBe(true)
  })

  it("classifies marketing-overrideable copy as merchandisable with marketing editRole", () => {
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    const name = registry.byPath.get("name")
    expect(name?.class).toBe("merchandisable")
    expect(name?.editRole).toBe("marketing")
    expect(name?.localized).toBe(true)
    const description = registry.byPath.get("description")
    expect(description?.class).toBe("merchandisable")
    expect(description?.localized).toBe(true)
    const inclusions = registry.byPath.get("inclusionsHtml")
    expect(inclusions?.class).toBe("merchandisable")
    expect(inclusions?.localized).toBe(true)
    expect(inclusions?.query).toBe("blob-only")
    const exclusions = registry.byPath.get("exclusionsHtml")
    expect(exclusions?.class).toBe("merchandisable")
    expect(exclusions?.localized).toBe(true)
    expect(exclusions?.query).toBe("blob-only")
  })

  it("classifies search-faceted fields as structural with facet-affecting reindex", () => {
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    const status = registry.byPath.get("status")
    expect(status?.class).toBe("structural")
    expect(status?.reindex).toBe("facet-affecting")
    const startDate = registry.byPath.get("startDate")
    expect(startDate?.reindex).toBe("facet-affecting")
  })

  it("hides internal-only fields from non-staff audiences", () => {
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    const cost = registry.byPath.get("costAmountCents")
    expect(cost?.visibility).toEqual(["staff"])
    const margin = registry.byPath.get("marginPercent")
    expect(margin?.visibility).toEqual(["staff"])
  })

  it("does not register deprecated product distribution flags", () => {
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    expect(registry.byPath.has("visibility")).toBe(false)
    expect(registry.byPath.has("activated")).toBe(false)
  })

  it("declares pricing fields with on-quote-and-book snapshot mode", () => {
    const registry = createFieldPolicyRegistry(productCatalogPolicy)
    const sellAmount = registry.byPath.get("sellAmountCents")
    expect(sellAmount?.snapshot).toBe("on-quote-and-book")
    const sellCurrency = registry.byPath.get("sellCurrency")
    expect(sellCurrency?.snapshot).toBe("on-quote-and-book")
  })
})
