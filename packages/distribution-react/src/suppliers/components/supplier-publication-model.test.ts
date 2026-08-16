import { describe, expect, it } from "vitest"

import {
  type ChannelSummary,
  isDecided,
  nextDecision,
  type SupplierPublicationRule,
  supplierChannelRows,
} from "./supplier-publication-model.js"

const website: ChannelSummary = { id: "chan_web", name: "Website", status: "active" }
const agents: ChannelSummary = { id: "chan_agents", name: "Agents", status: "active" }
const retired: ChannelSummary = { id: "chan_old", name: "Retired", status: "archived" }

const rule = (over: Partial<SupplierPublicationRule> = {}): SupplierPublicationRule => ({
  id: "rule_1",
  channelId: "chan_web",
  supplierId: "sup_1",
  decision: "exclude",
  ...over,
})

describe("supplier publication per channel", () => {
  it("lists every channel, including ones with no rule", () => {
    // The operator arrives asking "where does this supplier show up?", which a
    // list of only the decided channels cannot answer.
    const rows = supplierChannelRows([website, agents], [rule()], "sup_1")
    expect(rows.map((r) => r.channel.id)).toEqual(["chan_web", "chan_agents"])
  })

  it("reports an excluded supplier as excluded", () => {
    const [row] = supplierChannelRows([website], [rule({ decision: "exclude" })], "sup_1")
    expect(row?.state).toBe("excluded")
  })

  it("reports an included supplier as included", () => {
    const [row] = supplierChannelRows([website], [rule({ decision: "include" })], "sup_1")
    expect(row?.state).toBe("included")
  })

  it("distinguishes no rule from excluded", () => {
    // Default-deny is the resolver's behaviour, but a product rule can still
    // include one product from a supplier nobody has ruled on. Saying
    // "excluded" here would claim a decision that was never made.
    const [row] = supplierChannelRows([agents], [rule()], "sup_1")
    expect(row?.state).toBe("undecided")
    expect(row?.rule).toBeNull()
  })

  it("ignores another supplier's rules", () => {
    const [row] = supplierChannelRows([website], [rule({ supplierId: "sup_other" })], "sup_1")
    expect(row?.state).toBe("undecided")
  })

  it.each([
    "inactive",
    "pending",
    "archived",
  ] as const)("reports a %s channel as inactive whatever the rule says", (status) => {
    // Only `active` publishes. Modelling this as a boolean read of a field
    // that does not exist on `channelRecordSchema` left every real channel
    // undefined, so this state never fired against live data.
    const [row] = supplierChannelRows(
      [{ id: "chan_x", name: "X", status }],
      [rule({ channelId: "chan_x", decision: "include" })],
      "sup_1",
    )
    expect(row?.state).toBe("channel_inactive")
  })

  it("reports an archived channel as inactive whatever the rule says", () => {
    // The resolver answers `channel_inactive` before it looks at a rule, so
    // showing "included" here would be a state the backend never reports.
    const [row] = supplierChannelRows(
      [retired],
      [rule({ channelId: "chan_old", decision: "include" })],
      "sup_1",
    )
    expect(row?.state).toBe("channel_inactive")
  })

  it("keeps the backing rule so a decision can be cleared", () => {
    const [row] = supplierChannelRows([website], [rule()], "sup_1")
    expect(row && isDecided(row)).toBe(true)
    expect(row?.rule?.id).toBe("rule_1")
  })

  it("treats an undecided channel as not clearable", () => {
    const [row] = supplierChannelRows([agents], [], "sup_1")
    expect(row && isDecided(row)).toBe(false)
  })
})

describe("what a toggle writes", () => {
  it("excludes an included supplier", () => {
    expect(nextDecision("included")).toBe("exclude")
  })

  it("includes anything that is not currently included", () => {
    expect(nextDecision("excluded")).toBe("include")
    expect(nextDecision("undecided")).toBe("include")
  })
})
