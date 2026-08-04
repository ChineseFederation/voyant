import type {
  DepartureQuantities,
  SnapshotPlannedCost,
} from "@voyant-travel/products-contracts/product-version-snapshot"
import { describe, expect, it } from "vitest"

import {
  aggregateDeparturePlannedCost,
  type BlocksByVersion,
  type PlannedCostLine,
} from "../../src/service-planned-cost.js"

function block(overrides: Partial<SnapshotPlannedCost>): SnapshotPlannedCost {
  return {
    version: 1,
    basis: "per_person",
    driver: "pax",
    quantity: 1,
    rateCents: 1000,
    currency: "EUR",
    fxRates: null,
    resolvedAt: null,
    ...overrides,
  }
}

describe("aggregateDeparturePlannedCost", () => {
  it("costs each line against its version block and the departure's quantities", () => {
    const blocks: BlocksByVersion = new Map([
      [
        "pv_1",
        new Map<string, SnapshotPlannedCost>([
          ["svc_pax", block({ driver: "pax", rateCents: 5000 })],
          ["svc_room", block({ basis: "per_room", driver: "rooms", rateCents: 8000 })],
        ]),
      ],
    ])
    const quantities = new Map<string, DepartureQuantities>([["avsl_1", { pax: 3, rooms: 2 }]])
    const lines: PlannedCostLine[] = [
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_pax" },
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_room" },
    ]

    const result = aggregateDeparturePlannedCost(lines, blocks, quantities)
    const entry = result.get("avsl_1")
    // 5000×3 pax + 8000×2 rooms = 15000 + 16000 = 31000, all EUR.
    expect(entry?.byCurrency.get("EUR")).toBe(31000)
    expect(entry?.lineCount).toBe(2)
    expect(entry?.linesMissingCostBlock).toBe(0)
  })

  it("splits planned cost into a fixed term and a per-pax variable rate (break-even inputs)", () => {
    const blocks: BlocksByVersion = new Map([
      [
        "pv_1",
        new Map<string, SnapshotPlannedCost>([
          ["svc_pax", block({ driver: "pax", rateCents: 5000 })],
          ["svc_room", block({ basis: "per_room", driver: "rooms", rateCents: 8000 })],
        ]),
      ],
    ])
    const quantities = new Map<string, DepartureQuantities>([["avsl_1", { pax: 3, rooms: 2 }]])
    const lines: PlannedCostLine[] = [
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_pax" },
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_room" },
    ]
    const entry = aggregateDeparturePlannedCost(lines, blocks, quantities).get("avsl_1")
    // Room cost is fixed relative to load (8000×2 = 16000); pax cost is variable
    // at 5000 per pax. Total reconstructs: 16000 + 5000×3 = 31000.
    expect(entry?.fixedByCurrency.get("EUR")).toBe(16000)
    expect(entry?.perPaxRateByCurrency.get("EUR")).toBe(5000)
    expect(entry?.byCurrency.get("EUR")).toBe(31000)
  })

  it("records a per-pax rate even when the departure has zero booked pax", () => {
    const blocks: BlocksByVersion = new Map([
      ["pv_1", new Map([["svc_pax", block({ driver: "pax", rateCents: 4000 })]])],
    ])
    const lines: PlannedCostLine[] = [
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_pax" },
    ]
    // No quantities → pax 0 → total 0, but the marginal per-pax rate is still known.
    const entry = aggregateDeparturePlannedCost(lines, blocks, new Map()).get("avsl_1")
    expect(entry?.byCurrency.size).toBe(0)
    expect(entry?.perPaxRateByCurrency.get("EUR")).toBe(4000)
  })

  it("keeps distinct cost currencies apart — never sums across FX", () => {
    const blocks: BlocksByVersion = new Map([
      [
        "pv_1",
        new Map<string, SnapshotPlannedCost>([
          ["svc_eur", block({ driver: "fixed", currency: "EUR", rateCents: 4000 })],
          ["svc_usd", block({ driver: "fixed", currency: "USD", rateCents: 7000 })],
        ]),
      ],
    ])
    const lines: PlannedCostLine[] = [
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_eur" },
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_usd" },
    ]

    const entry = aggregateDeparturePlannedCost(lines, blocks, new Map()).get("avsl_1")
    expect(entry?.byCurrency.get("EUR")).toBe(4000)
    expect(entry?.byCurrency.get("USD")).toBe(7000)
  })

  it("counts a line whose day service has no declared block as missing, not zero-cost silently", () => {
    const blocks: BlocksByVersion = new Map([["pv_1", new Map()]])
    const lines: PlannedCostLine[] = [
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_legacy" },
    ]
    const entry = aggregateDeparturePlannedCost(lines, blocks, new Map()).get("avsl_1")
    expect(entry?.lineCount).toBe(1)
    expect(entry?.linesMissingCostBlock).toBe(1)
    expect(entry?.byCurrency.size).toBe(0)
  })

  it("resolves a driver's absent departure quantity to zero rather than a guess", () => {
    const blocks: BlocksByVersion = new Map([
      [
        "pv_1",
        new Map([["svc_night", block({ basis: "per_night", driver: "nights", rateCents: 9000 })]]),
      ],
    ])
    const lines: PlannedCostLine[] = [
      { departureId: "avsl_1", productVersionId: "pv_1", sourceDayServiceId: "svc_night" },
    ]
    // No quantities entry for avsl_1 → nights absent → 0 cents, still one line.
    const entry = aggregateDeparturePlannedCost(lines, blocks, new Map()).get("avsl_1")
    expect(entry?.lineCount).toBe(1)
    expect(entry?.linesMissingCostBlock).toBe(0)
    expect(entry?.byCurrency.size).toBe(0)
  })
})
