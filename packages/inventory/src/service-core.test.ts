import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { describe, expect, it, vi } from "vitest"

import { coreProductsService } from "./service-core.js"
import { productListQuerySchema } from "./validation.js"

function queryResult(rows: unknown[]) {
  const query = {
    from: () => query,
    leftJoin: () => query,
    where: () => query,
    limit: () => query,
    offset: () => query,
    orderBy: () => query,
    // biome-ignore lint/suspicious/noThenProperty: Drizzle queries are intentionally promise-like.
    then: (resolve: (value: unknown[]) => unknown, reject: (reason: unknown) => unknown) =>
      Promise.resolve(rows).then(resolve, reject),
  }
  return query
}

describe("coreProductsService.listProductSummaries", () => {
  it("selects and returns only list fields while preserving classification", async () => {
    const productRow = {
      id: "prod_1",
      name: "Danube tour",
      status: "active",
      bookingMode: "date",
      sellCurrency: "EUR",
      sellAmountCents: 12_500,
      productTypeId: "ptype_1",
      productSubtypeCode: "boat-tour",
      durationMinutes: 90,
      productTypeName: "Tour",
      familyCode: "tour",
      itineraryDurationDays: null,
      nextDeparture: new Date("2026-09-01T08:00:00.000Z"),
    }
    const select = vi.fn((selection: Record<string, unknown>) =>
      "count" in selection ? queryResult([{ count: 1 }]) : queryResult([productRow]),
    )
    const db = { select } as unknown as PostgresJsDatabase

    const result = await coreProductsService.listProductSummaries(
      db,
      productListQuerySchema.parse({ limit: 25 }),
    )

    const selectedColumns = Object.keys(select.mock.calls[0]?.[0] ?? {})
    expect(selectedColumns).toContain("name")
    expect(selectedColumns).toContain("nextDeparture")
    expect(selectedColumns).not.toContain("description")
    expect(selectedColumns).not.toContain("inclusionsHtml")
    expect(selectedColumns).not.toContain("customerPaymentPolicy")
    expect(result).toMatchObject({
      total: 1,
      limit: 25,
      offset: 0,
      data: [
        {
          id: "prod_1",
          classification: {
            familyCode: "tour",
            subtypeCode: "boat-tour",
            durationMinutes: 90,
          },
        },
      ],
    })
    expect(result.data[0]).not.toHaveProperty("familyCode")
    expect(result.data[0]).not.toHaveProperty("itineraryDurationDays")
    expect(result.data[0]).not.toHaveProperty("description")
  })
})
