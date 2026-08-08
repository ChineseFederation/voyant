import { describe, expect, it, vi } from "vitest"

import { normalizePresentationMoney } from "./presentation-money.js"

describe("normalizePresentationMoney", () => {
  it("quotes each native currency once and converts using currency precision", async () => {
    const quoteFx = vi.fn(async (source: string) => ({
      rate: source === "EUR" ? "4.975" : "1",
      provider: "bnr",
      quotedAt: "2026-08-08T08:00:00.000Z",
      validUntil: "2026-08-09T08:00:00.000Z",
    }))

    const result = await normalizePresentationMoney(
      [
        { amount: "10.00", currency: "EUR" },
        { amount: "2.00", currency: "EUR" },
        { amount: "7.00", currency: "RON" },
      ],
      { targetCurrency: "RON", quoteFx },
    )

    expect(quoteFx).toHaveBeenCalledTimes(1)
    expect(quoteFx).toHaveBeenCalledWith("EUR", "RON")
    expect(result.prices.map((price) => price?.presentation.amount)).toEqual([
      "49.75",
      "9.95",
      "7.00",
    ])
    expect(result.prices[0]?.native).toEqual({ amount: "10.00", currency: "EUR" })
    expect(result.prices[0]?.fx).toMatchObject({ rate: "4.975", provider: "bnr" })
    expect(result.ranking).toEqual({ status: "ranked_presentation", currency: "RON" })
  })

  it("does not claim a rank for mixed native currencies without FX", async () => {
    const result = await normalizePresentationMoney([
      { amount: "1.00", currency: "EUR" },
      { amount: "999.00", currency: "RON" },
    ])

    expect(result.ranking).toEqual({
      status: "unranked_mixed_currency",
      unavailableCurrencies: ["EUR", "RON"],
    })
    expect(result.prices.map((price) => price?.native.currency)).toEqual(["EUR", "RON"])
  })

  it("fails closed and retains successful presentation data when one quote fails", async () => {
    const result = await normalizePresentationMoney(
      [
        { amount: "10", currency: "EUR" },
        { amount: "10", currency: "USD" },
      ],
      {
        targetCurrency: "RON",
        quoteFx: async (source) => {
          if (source === "USD") throw new Error("rate unavailable")
          return {
            rate: "5",
            provider: "voyant-data-fx",
            quotedAt: "2026-08-08T08:00:00.000Z",
          }
        },
      },
    )

    expect(result.prices[0]?.presentation).toEqual({ amount: "50.00", currency: "RON" })
    expect(result.prices[1]).toBeUndefined()
    expect(result.ranking).toEqual({
      status: "unranked_fx_unavailable",
      currency: "RON",
      unavailableCurrencies: ["USD"],
    })
  })

  it("rounds half-up to the target currency's minor units without floating point math", async () => {
    const result = await normalizePresentationMoney([{ amount: "0.01", currency: "EUR" }], {
      targetCurrency: "JPY",
      quoteFx: async () => ({
        rate: "150.5",
        provider: "voyant-data-fx",
        quotedAt: "2026-08-08T08:00:00.000Z",
      }),
    })

    expect(result.prices[0]?.presentation).toEqual({ amount: "2", currency: "JPY" })
  })

  it("fails closed when the managed FX authority misses its deadline", async () => {
    const result = await normalizePresentationMoney([{ amount: "10", currency: "EUR" }], {
      targetCurrency: "RON",
      quoteTimeoutMs: 5,
      quoteFx: async () => await new Promise(() => undefined),
    })

    expect(result.prices).toEqual([undefined])
    expect(result.ranking).toEqual({
      status: "unranked_fx_unavailable",
      currency: "RON",
      unavailableCurrencies: ["EUR"],
    })
  })
})
