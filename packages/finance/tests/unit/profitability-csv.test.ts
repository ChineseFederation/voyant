import { describe, expect, it } from "vitest"

import {
  buildDepartureProfitabilityCsv,
  buildProductProfitabilityCsv,
  type DepartureProfitabilityReport,
  type ProductProfitabilityReport,
} from "../../src/service-profitability.js"

/**
 * The accountant-facing exports carry a trailing block for supplier cost that
 * never reached a departure. The two kinds stay on separate lines — cost
 * allocated to nothing on purpose is a decision, an under-allocated remainder
 * is a backlog — and the block is omitted entirely when there is nothing to
 * report, so a fully allocated ledger exports exactly as it did before.
 */

const departureRow: DepartureProfitabilityReport["rows"][number] = {
  departureId: "slot_1",
  departureLabel: "Spring departure",
  productId: "prod_1",
  productName: "Tuscany 7D",
  departureDate: "2026-04-10",
  currency: "EUR",
  revenueCents: 500000,
  actualCostCents: 300000,
  plannedCostCents: 320000,
  committedCostCents: 310000,
  profitCents: 200000,
  marginPercent: 40,
  varianceCents: 20000,
  breakEvenRevenueCents: null,
  loadFactorPercent: null,
}

const productRow: ProductProfitabilityReport["rows"][number] = {
  productId: "prod_1",
  productName: "Tuscany 7D",
  currency: "EUR",
  departureCount: 3,
  revenueCents: 1500000,
  actualCostCents: 900000,
  plannedCostCents: 960000,
  committedCostCents: 930000,
  profitCents: 600000,
  marginPercent: 40,
  varianceCents: 60000,
  breakEvenRevenueCents: null,
  loadFactorPercent: null,
}

describe("profitability CSV exports", () => {
  it("reports the unallocated remainder separately from deliberate unattributed cost", () => {
    const csv = buildDepartureProfitabilityCsv({
      rows: [departureRow],
      costByServiceType: [],
      unattributed: [{ currency: "EUR", amountCents: 5000 }],
      unallocated: [
        { currency: "EUR", amountCents: 40000 },
        { currency: "RON", amountCents: 37500 },
      ],
    })
    const lines = csv.replace(/^﻿/, "").trimEnd().split("\r\n")

    expect(lines.slice(-5)).toEqual([
      "",
      "unaccounted_cost,currency,amount",
      "explicitly_unattributed,EUR,50.00",
      "unallocated_remainder,EUR,400.00",
      "unallocated_remainder,RON,375.00",
    ])
  })

  it("omits the block entirely when every invoice is fully allocated", () => {
    const fullyAllocated = buildDepartureProfitabilityCsv({
      rows: [departureRow],
      costByServiceType: [],
      unattributed: [],
      unallocated: [],
    })
    expect(fullyAllocated.trimEnd().split("\r\n")).toHaveLength(2) // header + the one row
    expect(fullyAllocated).not.toContain("unaccounted_cost")
  })

  it("carries the same block on the product export", () => {
    const csv = buildProductProfitabilityCsv({
      rows: [productRow],
      costByServiceType: [],
      unattributed: [],
      unallocated: [{ currency: "EUR", amountCents: 40000 }],
    })
    expect(csv).toContain("unaccounted_cost,currency,amount")
    expect(csv).toContain("unallocated_remainder,EUR,400.00")
    expect(csv).not.toContain("explicitly_unattributed")
  })
})
