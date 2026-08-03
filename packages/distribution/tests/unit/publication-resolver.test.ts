import { describe, expect, it } from "vitest"

import {
  resolveEffectivePublication,
  resolveEffectiveSourcePublication,
} from "../../src/publication-resolver.js"

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

describe("resolveEffectiveSourcePublication", () => {
  const subject = { channelId: "channel_1", sourceKind: "voyant-connect" }

  it("denies missing channels", () => {
    expect(resolveEffectiveSourcePublication({ ...subject, channelStatus: null })).toMatchObject({
      published: false,
      reason: "channel_missing",
      source: "channel",
    })
  })

  it("denies inactive channels before authored rules", () => {
    expect(
      resolveEffectiveSourcePublication({
        ...subject,
        sourceConnectionId: "conn_tui",
        channelStatus: "inactive",
        connectionRule: { id: "rule_1", decision: "include" },
        kindRule: { id: "rule_2", decision: "include" },
      }),
    ).toMatchObject({ published: false, reason: "channel_inactive", source: "channel" })
  })

  it("default-denies a connection with no rule — connecting is not publishing", () => {
    expect(
      resolveEffectiveSourcePublication({
        ...subject,
        sourceConnectionId: "conn_tui",
        channelStatus: "active",
      }),
    ).toMatchObject({
      published: false,
      decision: null,
      reason: "default_deny",
      source: "default",
    })
  })

  it("lets the connection rule override the kind rule", () => {
    expect(
      resolveEffectiveSourcePublication({
        ...subject,
        sourceConnectionId: "conn_tui",
        channelStatus: "active",
        connectionRule: { id: "rule_conn", decision: "include" },
        kindRule: { id: "rule_kind", decision: "exclude" },
      }),
    ).toMatchObject({
      published: true,
      decision: "include",
      reason: "connection_decision",
      source: "connection",
      ruleId: "rule_conn",
    })
  })

  it("falls back to the kind rule when the connection has none", () => {
    expect(
      resolveEffectiveSourcePublication({
        ...subject,
        sourceConnectionId: "conn_tui",
        channelStatus: "active",
        kindRule: { id: "rule_kind", decision: "exclude" },
      }),
    ).toMatchObject({
      published: false,
      decision: "exclude",
      reason: "source_kind_decision",
      source: "source_kind",
      ruleId: "rule_kind",
    })
  })

  it("resolves a connectionless source against the kind rule alone", () => {
    expect(
      resolveEffectiveSourcePublication({
        ...subject,
        sourceConnectionId: null,
        channelStatus: "active",
        kindRule: { id: "rule_kind", decision: "include" },
      }),
    ).toMatchObject({
      published: true,
      sourceConnectionId: null,
      reason: "source_kind_decision",
    })
  })
})
