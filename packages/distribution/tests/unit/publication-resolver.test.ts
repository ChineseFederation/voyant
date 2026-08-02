import { describe, expect, it } from "vitest"

import { resolveEffectivePublication } from "../../src/publication-resolver.js"

describe("resolveEffectivePublication", () => {
  it("denies missing channels", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        channelStatus: null,
      }),
    ).toMatchObject({
      published: false,
      decision: null,
      reason: "channel_missing",
      source: "channel",
    })
  })

  it("denies inactive channels before authored rules", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: "supplier_1",
        channelStatus: "inactive",
        productRule: { id: "product_rule_1", decision: "include" },
        supplierRule: { id: "supplier_rule_1", decision: "include" },
      }),
    ).toMatchObject({
      published: false,
      decision: null,
      reason: "channel_inactive",
      source: "channel",
      ruleId: null,
    })
  })

  it("lets product include override supplier exclude", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: "supplier_1",
        channelStatus: "active",
        productRule: { id: "product_rule_1", decision: "include" },
        supplierRule: { id: "supplier_rule_1", decision: "exclude" },
      }),
    ).toMatchObject({
      published: true,
      decision: "include",
      reason: "product_decision",
      source: "product",
      ruleId: "product_rule_1",
    })
  })

  it("lets product exclude override supplier include", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: "supplier_1",
        channelStatus: "active",
        productRule: { id: "product_rule_1", decision: "exclude" },
        supplierRule: { id: "supplier_rule_1", decision: "include" },
      }),
    ).toMatchObject({
      published: false,
      decision: "exclude",
      reason: "product_decision",
      source: "product",
      ruleId: "product_rule_1",
    })
  })

  it("uses supplier include when no product rule exists", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: "supplier_1",
        channelStatus: "active",
        supplierRule: { id: "supplier_rule_1", decision: "include" },
      }),
    ).toMatchObject({
      published: true,
      decision: "include",
      reason: "supplier_decision",
      source: "supplier",
      ruleId: "supplier_rule_1",
    })
  })

  it("uses supplier exclude when no product rule exists", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: "supplier_1",
        channelStatus: "active",
        supplierRule: { id: "supplier_rule_1", decision: "exclude" },
      }),
    ).toMatchObject({
      published: false,
      decision: "exclude",
      reason: "supplier_decision",
      source: "supplier",
      ruleId: "supplier_rule_1",
    })
  })

  it("default denies when no rule exists", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        canonicalSupplierId: "supplier_1",
        channelStatus: "active",
      }),
    ).toMatchObject({
      published: false,
      decision: null,
      reason: "default_deny",
      source: "default",
      ruleId: null,
    })
  })

  it("requires explicit product publication when product has no canonical supplier", () => {
    expect(
      resolveEffectivePublication({
        channelId: "channel_1",
        productId: "product_1",
        channelStatus: "active",
      }),
    ).toMatchObject({
      published: false,
      decision: null,
      reason: "product_missing_supplier",
      source: "default",
    })
  })
})
