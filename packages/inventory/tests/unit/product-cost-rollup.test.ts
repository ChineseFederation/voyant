import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

/**
 * Mixed-currency product cost roll-up (voyant#4162).
 *
 * `product_day_services.cost_currency` is per row, so a Turkish tour holds EUR
 * coach hire next to TRY hotel nights. The roll-up used to `sum()` those minor
 * units into one integer and derive a margin from it, producing a number that
 * belonged to no currency at all. These tests pin the replacement: total per
 * source currency, restate into the product's sell currency through finance's
 * FX machinery, and withhold the figure when a rate is missing.
 */

const { resolveFxMoneyBaseAmount } = vi.hoisted(() => ({
  resolveFxMoneyBaseAmount: vi.fn(),
}))

vi.mock("@voyant-travel/finance", () => ({ resolveFxMoneyBaseAmount }))

const { recalculateProductCost, collapseCostToCurrency } = await import(
  "../../src/service-product-cost.js"
)

/** Stand-in for the persisted `exchange_rates` lookup finance performs. */
function fxRates(rates: Record<string, number>) {
  return async (
    _db: unknown,
    input: { amountCents: number; currency: string },
    options: { targetBaseCurrency?: string | null },
  ) => {
    const rate = rates[input.currency]
    if (rate === undefined) {
      // Finance's shape for "no resolvable rate": the base amount stays unset
      // rather than being filled in at a guessed rate.
      return { ...input, baseCurrency: null, baseAmountCents: null, fxRateSetId: null }
    }
    return {
      ...input,
      baseCurrency: options.targetBaseCurrency ?? null,
      baseAmountCents: Math.round(input.amountCents * rate),
      fxRateSetId: "fxrs_test",
    }
  }
}

function fakeProductCostDb(options: {
  product: { sellCurrency: string; sellAmountCents: number | null } | null
  services: Array<{ currency: string; amountCents: number }>
}): { db: PostgresJsDatabase; updateSets: Array<Record<string, unknown>> } {
  const updateSets: Array<Record<string, unknown>> = []

  // Every builder step returns the same awaitable, so the stub answers both the
  // `.from().where().limit()` product lookup and the grouped `.innerJoin()` roll-up.
  const chain = (rows: unknown[]) => {
    const builder = Promise.resolve(rows) as Promise<unknown[]> &
      Record<string, () => Promise<unknown[]>>
    for (const step of ["from", "innerJoin", "where", "limit", "groupBy", "orderBy"]) {
      builder[step] = () => builder
    }
    return builder
  }

  const db = {
    select: (fields: Record<string, unknown>) =>
      "sellCurrency" in fields
        ? chain(options.product ? [options.product] : [])
        : // postgres-js hands int8 back as a string — mirror that so the roll-up
          // is forced to coerce rather than relying on a JS number.
          chain(
            options.services.map((service) => ({
              currency: service.currency,
              amountCents: String(service.amountCents),
            })),
          ),
    update: () => ({
      set: (values: Record<string, unknown>) => {
        updateSets.push(values)
        return { where: async () => [] }
      },
    }),
  } as never

  return { db, updateSets }
}

beforeEach(() => {
  resolveFxMoneyBaseAmount.mockReset()
})

describe("recalculateProductCost", () => {
  it("leaves a single-currency product on its own currency without consulting FX", async () => {
    const { db, updateSets } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
      services: [{ currency: "EUR", amountCents: 40_000 }],
    })

    const result = await recalculateProductCost(db, "prod_1")

    expect(result).toEqual({
      currency: "EUR",
      costAmountCents: 40_000,
      marginPercent: 60,
      byCurrency: [{ currency: "EUR", amountCents: 40_000 }],
      unconvertibleCurrencies: [],
    })
    expect(resolveFxMoneyBaseAmount).not.toHaveBeenCalled()
    expect(updateSets).toEqual([
      expect.objectContaining({ costAmountCents: 40_000, marginPercent: 60 }),
    ])
  })

  it("never adds minor units across currencies — it converts into the sell currency first", async () => {
    resolveFxMoneyBaseAmount.mockImplementation(fxRates({ TRY: 0.028 }))
    const { db, updateSets } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
      services: [
        { currency: "EUR", amountCents: 30_000 },
        { currency: "TRY", amountCents: 500_000 },
      ],
    })

    const result = await recalculateProductCost(db, "prod_1")

    // The old roll-up returned 530_000: EUR cents plus TRY kuruş, a figure in no
    // currency at all, which then read as a -430% margin.
    expect(result?.costAmountCents).not.toBe(530_000)
    expect(result?.costAmountCents).toBe(44_000) // 30_000 EUR + 500_000 TRY × 0.028
    expect(result?.currency).toBe("EUR")
    expect(result?.marginPercent).toBe(56)
    expect(result?.byCurrency).toEqual([
      { currency: "EUR", amountCents: 30_000 },
      { currency: "TRY", amountCents: 500_000 },
    ])
    expect(result?.unconvertibleCurrencies).toEqual([])
    expect(updateSets).toEqual([
      expect.objectContaining({ costAmountCents: 44_000, marginPercent: 56 }),
    ])

    // The conversion target is the product's sell currency, so cost and sell are
    // in the same currency by the time a margin is taken.
    expect(resolveFxMoneyBaseAmount).toHaveBeenCalledTimes(1)
    expect(resolveFxMoneyBaseAmount.mock.calls[0]?.[2]).toMatchObject({
      targetBaseCurrency: "EUR",
    })
  })

  it("withholds the total and the margin when a source currency has no resolvable rate", async () => {
    resolveFxMoneyBaseAmount.mockImplementation(fxRates({}))
    const { db, updateSets } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
      services: [
        { currency: "EUR", amountCents: 30_000 },
        { currency: "TRY", amountCents: 500_000 },
      ],
    })

    const result = await recalculateProductCost(db, "prod_1")

    expect(result?.costAmountCents).toBeNull()
    expect(result?.marginPercent).toBeNull()
    expect(result?.unconvertibleCurrencies).toEqual(["TRY"])
    // Reported, not guessed: no fallback rate of 1, and no partial total that
    // would silently under-report cost and over-report margin.
    expect(result?.byCurrency).toEqual([
      { currency: "EUR", amountCents: 30_000 },
      { currency: "TRY", amountCents: 500_000 },
    ])
    expect(updateSets).toEqual([
      expect.objectContaining({ costAmountCents: null, marginPercent: null }),
    ])
  })

  it("does not derive a margin from a cost and a sell amount in different currencies", async () => {
    resolveFxMoneyBaseAmount.mockImplementation(fxRates({}))
    const { db } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
      services: [{ currency: "TRY", amountCents: 500_000 }],
    })

    const unconverted = await recalculateProductCost(db, "prod_1")

    // 500_000 kuruş against 100_000 euro cents would have read as a -400% margin.
    expect(unconverted?.costAmountCents).toBeNull()
    expect(unconverted?.marginPercent).toBeNull()

    resolveFxMoneyBaseAmount.mockImplementation(fxRates({ TRY: 0.028 }))
    const converted = await recalculateProductCost(
      fakeProductCostDb({
        product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
        services: [{ currency: "TRY", amountCents: 500_000 }],
      }).db,
      "prod_1",
    )

    expect(converted?.costAmountCents).toBe(14_000)
    expect(converted?.marginPercent).toBe(86)
  })

  it("treats a rate resolved into some other currency as unresolvable", async () => {
    // Finance falls back to the configured accounting base when no target is
    // usable. A RON figure is not a EUR figure, so it must not be summed in.
    resolveFxMoneyBaseAmount.mockImplementation(async (_db, input) => ({
      ...input,
      baseCurrency: "RON",
      baseAmountCents: 999,
      fxRateSetId: "fxrs_test",
    }))
    const { db } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
      services: [{ currency: "TRY", amountCents: 500_000 }],
    })

    const result = await recalculateProductCost(db, "prod_1")

    expect(result?.costAmountCents).toBeNull()
    expect(result?.unconvertibleCurrencies).toEqual(["TRY"])
  })

  it("keeps the day-service write path alive when the rate lookup itself fails", async () => {
    // The roll-up runs on every day-service save. A deployment with no
    // `exchange_rates` table must get an unconvertible currency back, not a
    // failed save.
    resolveFxMoneyBaseAmount.mockRejectedValue(
      new Error('relation "exchange_rates" does not exist'),
    )
    const { db, updateSets } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
      services: [{ currency: "TRY", amountCents: 500_000 }],
    })

    const result = await recalculateProductCost(db, "prod_1")

    expect(result?.costAmountCents).toBeNull()
    expect(result?.unconvertibleCurrencies).toEqual(["TRY"])
    expect(updateSets).toEqual([
      expect.objectContaining({ costAmountCents: null, marginPercent: null }),
    ])
  })

  it("merges differently-cased currency codes instead of reporting one as unconvertible", async () => {
    const { db } = fakeProductCostDb({
      product: { sellCurrency: "eur", sellAmountCents: 100_000 },
      services: [
        { currency: "eur", amountCents: 30_000 },
        { currency: "EUR", amountCents: 10_000 },
      ],
    })

    const result = await recalculateProductCost(db, "prod_1")

    expect(result).toMatchObject({
      currency: "EUR",
      costAmountCents: 40_000,
      byCurrency: [{ currency: "EUR", amountCents: 40_000 }],
      unconvertibleCurrencies: [],
    })
    expect(resolveFxMoneyBaseAmount).not.toHaveBeenCalled()
  })

  it("has no margin when the product carries no sell amount", async () => {
    const { db, updateSets } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: null },
      services: [{ currency: "EUR", amountCents: 40_000 }],
    })

    const result = await recalculateProductCost(db, "prod_1")

    expect(result).toMatchObject({ costAmountCents: 40_000, marginPercent: null })
    expect(updateSets).toEqual([
      expect.objectContaining({ costAmountCents: 40_000, marginPercent: null }),
    ])
  })

  it("rolls up to zero for a product with no itinerary services", async () => {
    const { db } = fakeProductCostDb({
      product: { sellCurrency: "EUR", sellAmountCents: 100_000 },
      services: [],
    })

    await expect(recalculateProductCost(db, "prod_1")).resolves.toMatchObject({
      costAmountCents: 0,
      marginPercent: 100,
      byCurrency: [],
    })
  })

  it("returns null and writes nothing when the product does not exist", async () => {
    const { db, updateSets } = fakeProductCostDb({ product: null, services: [] })

    await expect(recalculateProductCost(db, "prod_missing")).resolves.toBeNull()
    expect(updateSets).toEqual([])
  })
})

describe("collapseCostToCurrency", () => {
  it("does not need a rate for a currency that contributes nothing", async () => {
    const result = await collapseCostToCurrency(
      [
        { currency: "EUR", amountCents: 30_000 },
        { currency: "TRY", amountCents: 0 },
      ],
      "EUR",
      () => null,
    )

    expect(result).toEqual({ totalCents: 30_000, unconvertibleCurrencies: [] })
  })

  it("reports every unconvertible currency, not just the first", async () => {
    const result = await collapseCostToCurrency(
      [
        { currency: "GBP", amountCents: 1000 },
        { currency: "TRY", amountCents: 500_000 },
      ],
      "EUR",
      () => null,
    )

    expect(result).toEqual({ totalCents: null, unconvertibleCurrencies: ["GBP", "TRY"] })
  })

  it("cannot denominate anything when the product has no sell currency", async () => {
    const result = await collapseCostToCurrency(
      [{ currency: "EUR", amountCents: 30_000 }],
      "",
      () => expect.unreachable("a missing target currency must not be converted into"),
    )

    expect(result).toEqual({ totalCents: null, unconvertibleCurrencies: ["EUR"] })
  })
})
