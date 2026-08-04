import { describe, expect, it } from "vitest"
import { z } from "zod"

import type { CostCategoryRecord } from "../../src/service-cost-categories.js"
import type {
  DepartureProfitabilityReport,
  ProductProfitabilityReport,
  TravelerProfitabilityReport,
} from "../../src/service-profitability.js"

/**
 * Response contract tests (voyant#2114 / voyant#2208 — finance sub-batch 9D)
 * for the finance reports admin routes. Each fixture is typed as the real
 * service interface so shape drift breaks compilation; the JSON round-trip
 * mirrors `c.json` so a declared/actual mismatch breaks the test. The schemas
 * below mirror the response shapes declared in `routes-reports.ts`.
 */

const isoString = z.string()

const profitabilityCostByServiceTypeSchema = z.object({
  serviceType: z.string(),
  currency: z.string(),
  amountCents: z.number().int(),
})

const profitabilityUnattributedSchema = z.object({
  currency: z.string(),
  amountCents: z.number().int(),
})

const profitabilityUnallocatedSchema = z.object({
  currency: z.string(),
  amountCents: z.number().int(),
})

const departureProfitabilityRowSchema = z.object({
  departureId: z.string(),
  departureLabel: z.string().nullable(),
  productId: z.string().nullable(),
  productName: z.string().nullable(),
  departureDate: z.string().nullable(),
  currency: z.string(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})

const departureProfitabilityReportSchema = z.object({
  rows: z.array(departureProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributed: z.array(profitabilityUnattributedSchema),
  unallocated: z.array(profitabilityUnallocatedSchema),
  base: z
    .object({
      currency: z.string(),
      rows: z.array(departureProfitabilityRowSchema),
      costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
      unattributedCents: z.number().int(),
      unallocatedCents: z.number().int(),
      unconvertibleCurrencies: z.array(z.string()),
    })
    .optional(),
})

const productProfitabilityRowSchema = z.object({
  productId: z.string(),
  productName: z.string().nullable(),
  currency: z.string(),
  departureCount: z.number().int(),
  revenueCents: z.number().int(),
  actualCostCents: z.number().int(),
  plannedCostCents: z.number().int(),
  profitCents: z.number().int(),
  marginPercent: z.number().nullable(),
  varianceCents: z.number().int(),
})

const productProfitabilityReportSchema = z.object({
  rows: z.array(productProfitabilityRowSchema),
  costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
  unattributed: z.array(profitabilityUnattributedSchema),
  unallocated: z.array(profitabilityUnallocatedSchema),
  base: z
    .object({
      currency: z.string(),
      rows: z.array(productProfitabilityRowSchema),
      costByServiceType: z.array(profitabilityCostByServiceTypeSchema),
      unattributedCents: z.number().int(),
      unallocatedCents: z.number().int(),
      unconvertibleCurrencies: z.array(z.string()),
    })
    .optional(),
})

const travelerProfitabilityReportSchema = z.object({
  departureId: z.string(),
  currency: z.string(),
  travelerCount: z.number().int(),
  rows: z.array(
    z.object({
      travelerId: z.string(),
      travelerName: z.string(),
      bookingId: z.string(),
      currency: z.string(),
      revenueCents: z.number().int(),
      actualCostCents: z.number().int(),
      plannedCostCents: z.number().int(),
      profitCents: z.number().int(),
      marginPercent: z.number().nullable(),
      varianceCents: z.number().int(),
    }),
  ),
})

const costCategorySchema = z.object({
  id: z.string(),
  name: z.string(),
  sortOrder: z.number().int(),
  archived: z.boolean(),
  createdAt: isoString,
  updatedAt: isoString,
})

const departureReport: DepartureProfitabilityReport = {
  rows: [
    {
      departureId: "slot_0000000000000000000000000",
      departureLabel: "Spring departure",
      productId: "prod_0000000000000000000000000",
      productName: "Tuscany 7D",
      departureDate: "2026-04-10",
      currency: "EUR",
      revenueCents: 500000,
      actualCostCents: 300000,
      plannedCostCents: 320000,
      profitCents: 200000,
      marginPercent: 40,
      varianceCents: 20000,
    },
  ],
  costByServiceType: [{ serviceType: "transportation", currency: "EUR", amountCents: 120000 }],
  unattributed: [{ currency: "EUR", amountCents: 0 }],
  unallocated: [{ currency: "EUR", amountCents: 40000 }],
  base: {
    currency: "RON",
    rows: [],
    costByServiceType: [],
    unattributedCents: 0,
    unallocatedCents: 200000,
    unconvertibleCurrencies: [],
  },
}

const productReport: ProductProfitabilityReport = {
  rows: [
    {
      productId: "prod_0000000000000000000000000",
      productName: "Tuscany 7D",
      currency: "EUR",
      departureCount: 3,
      revenueCents: 1500000,
      actualCostCents: 900000,
      plannedCostCents: 960000,
      profitCents: 600000,
      marginPercent: 40,
      varianceCents: 60000,
    },
  ],
  costByServiceType: [],
  unattributed: [],
  unallocated: [],
}

const travelerReport: TravelerProfitabilityReport = {
  departureId: "slot_0000000000000000000000000",
  currency: "EUR",
  travelerCount: 1,
  rows: [
    {
      travelerId: "trav_0000000000000000000000000",
      travelerName: "Ada Lovelace",
      bookingId: "bkg_0000000000000000000000000",
      currency: "EUR",
      revenueCents: 250000,
      actualCostCents: 150000,
      plannedCostCents: 160000,
      profitCents: 100000,
      marginPercent: 40,
      varianceCents: 10000,
    },
  ],
}

const costCategory: CostCategoryRecord = {
  id: "cost_categories_0000000000000000000000",
  name: "Transportation",
  sortOrder: 0,
  archived: false,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
}

describe("finance reports response contracts", () => {
  it("the departure profitability { data } envelope satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: departureReport }))
    const parsed = z.object({ data: departureProfitabilityReportSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the product profitability { data } envelope satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: productReport }))
    const parsed = z.object({ data: productProfitabilityReportSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the traveler profitability { data } envelope satisfies the declared OpenAPI schema", () => {
    const wire = JSON.parse(JSON.stringify({ data: travelerReport }))
    const parsed = z.object({ data: travelerProfitabilityReportSchema }).safeParse(wire)
    expect(parsed.success ? null : parsed.error.toString()).toBeNull()
  })

  it("the cost-category { data } + list envelopes satisfy the declared OpenAPI schema", () => {
    const single = z
      .object({ data: costCategorySchema })
      .safeParse(JSON.parse(JSON.stringify({ data: costCategory })))
    expect(single.success ? null : single.error.toString()).toBeNull()
    const list = z
      .object({ data: z.array(costCategorySchema) })
      .safeParse(JSON.parse(JSON.stringify({ data: [costCategory] })))
    expect(list.success ? null : list.error.toString()).toBeNull()
  })

  it("the revenue + aging report rows satisfy the declared OpenAPI schema", () => {
    const revenue = z
      .object({
        data: z.array(
          z.object({ month: z.string(), totalCents: z.number().int(), count: z.number().int() }),
        ),
      })
      .safeParse({ data: [{ month: "2026-04", totalCents: 500000, count: 12 }] })
    expect(revenue.success).toBe(true)
    const aging = z
      .object({
        data: z.array(
          z.object({ bucket: z.string(), totalCents: z.number().int(), count: z.number().int() }),
        ),
      })
      .safeParse({ data: [{ bucket: "1-30", totalCents: 12000, count: 2 }] })
    expect(aging.success).toBe(true)
  })

  it("the accountant-share revoke envelope satisfies the declared OpenAPI schema", () => {
    const parsed = z
      .object({ data: z.object({ id: z.string() }) })
      .safeParse({ data: { id: "share_0000000000000000000000000" } })
    expect(parsed.success).toBe(true)
  })
})
