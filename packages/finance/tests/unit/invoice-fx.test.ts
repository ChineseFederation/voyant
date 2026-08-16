import { createContainer } from "@voyant-travel/core"
import { describe, expect, it, vi } from "vitest"

import {
  createInvoiceFxRoutes,
  createVoyantDataFxExchangeRateResolver,
  resolveInvoiceFxContext,
} from "../../src/invoice-fx.js"
import { fakeRateStore } from "./support/rate-store.js"

describe("invoice FX", () => {
  it("resolves invoice FX context from operator settings", async () => {
    const context = await resolveInvoiceFxContext(
      fakeRateStore(),
      { currency: "eur", issueDate: "2026-05-22" },
      {
        invoiceFxSettings: {
          baseCurrency: "ron",
          fxCommissionBps: 200,
          fxCommissionInvoiceMention: "2% comision curs risc valutar",
        },
        resolveInvoiceExchangeRate: async () => 4.97,
      },
    )

    expect(context).toEqual({
      baseCurrency: "RON",
      fxRate: 4.97,
      // A source that reports no timestamp of its own still gets one: the rate
      // is the invoice's own day's rate, and saying so is the point.
      fxRateQuotedAt: "2026-05-22",
      fxCommissionBps: 200,
      effectiveRate: 5.0694,
      fxCommissionInvoiceMention: "2% comision curs risc valutar",
    })
  })

  it("omits FX context when exchange-rate resolution fails", async () => {
    const error = new Error("FX provider timeout")
    const onInvoiceFxResolutionError = vi.fn()
    const context = await resolveInvoiceFxContext(
      fakeRateStore(),
      { currency: "eur", issueDate: "2026-05-22" },
      {
        invoiceFxSettings: {
          baseCurrency: "ron",
          fxCommissionBps: 200,
        },
        resolveInvoiceExchangeRate: async () => {
          throw error
        },
        onInvoiceFxResolutionError,
      },
    )

    expect(context).toBeNull()
    expect(onInvoiceFxResolutionError).toHaveBeenCalledWith(error, {
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: "2026-05-22",
    })
  })

  it("preserves exchange-rate provenance in invoice FX context", async () => {
    const context = await resolveInvoiceFxContext(
      fakeRateStore(),
      { currency: "eur", issueDate: "2026-05-22" },
      {
        invoiceFxSettings: {
          baseCurrency: "ron",
          fxCommissionBps: 200,
        },
        resolveInvoiceExchangeRate: async () => ({
          rate: 4.97,
          source: "bnr",
          quotedAt: "Fri, 22 May 2026 00:00:01 +0000",
          validUntil: "Sat, 23 May 2026 00:00:01 +0000",
        }),
      },
    )

    expect(context).toEqual({
      baseCurrency: "RON",
      fxRate: 4.97,
      fxRateSource: "bnr",
      fxRateQuotedAt: "Fri, 22 May 2026 00:00:01 +0000",
      fxRateValidUntil: "Sat, 23 May 2026 00:00:01 +0000",
      fxCommissionBps: 200,
      effectiveRate: 5.0694,
    })
  })

  it("uses the Voyant Data FX pair route for exchange-rate resolution", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => {
      return new Response(
        JSON.stringify({
          conversion_rate: 4.97,
          source: "bnr",
          time_last_update_utc: "Fri, 22 May 2026 00:00:01 +0000",
          time_next_update_utc: "Sat, 23 May 2026 00:00:01 +0000",
        }),
        {
          headers: { "content-type": "application/json" },
          status: 200,
        },
      )
    })
    const apiKey = `data_${"key"}`
    const resolve = createVoyantDataFxExchangeRateResolver({
      apiKey,
      baseUrl: "https://data.test",
      fetch,
    })

    await expect(resolve({ baseCurrency: "EUR", quoteCurrency: "RON" })).resolves.toEqual({
      rate: 4.97,
      source: "bnr",
      quotedAt: "Fri, 22 May 2026 00:00:01 +0000",
      validUntil: "Sat, 23 May 2026 00:00:01 +0000",
    })

    const [url, init] = fetch.mock.calls[0]!
    expect(String(url)).toBe("https://data.test/data/fx/v1/fx/pair/EUR/RON")
    expect(new Headers(init?.headers).get("authorization")).toBe(`Bearer ${apiKey}`)
    expect(new Headers(init?.headers).get("x-voyant-sdk")).toBe("voyant-finance")
  })

  it("exposes configured exchange-rate resolution through the admin route", async () => {
    const resolveInvoiceExchangeRate = vi.fn(async () => ({
      rate: 4.97,
      source: "bnr",
      quotedAt: "Fri, 22 May 2026 00:00:01 +0000",
      validUntil: "Sat, 23 May 2026 00:00:01 +0000",
    }))
    const app = createInvoiceFxRoutes({ resolveInvoiceExchangeRate })

    const response = await app.request(
      "/invoice-fx-rate?baseCurrency=eur&quoteCurrency=ron&date=2026-05-22",
    )
    const body = (await response.json()) as {
      data: {
        baseCurrency: string
        quoteCurrency: string
        date: string
        rate: number
        source: string
        quotedAt: string
        validUntil: string
      }
    }

    expect(response.status).toBe(200)
    expect(resolveInvoiceExchangeRate).toHaveBeenCalledWith({
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: "2026-05-22",
    })
    expect(body.data).toEqual({
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: "2026-05-22",
      rate: 4.97,
      source: "bnr",
      quotedAt: "Fri, 22 May 2026 00:00:01 +0000",
      validUntil: "Sat, 23 May 2026 00:00:01 +0000",
      fxCommissionBps: 0,
      effectiveRate: 4.97,
    })
  })

  it("falls back to route options when the container has no finance runtime", async () => {
    const resolveInvoiceExchangeRate = vi.fn(async () => 4.97)
    const app = createInvoiceFxRoutes({ resolveInvoiceExchangeRate })
    app.use("*", async (c, next) => {
      c.set("container", createContainer())
      await next()
    })

    const response = await app.request("/invoice-fx-rate?baseCurrency=eur&quoteCurrency=ron")
    const body = (await response.json()) as {
      data: { baseCurrency: string; quoteCurrency: string; rate: number }
    }

    expect(response.status).toBe(200)
    expect(resolveInvoiceExchangeRate).toHaveBeenCalledWith({
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: undefined,
    })
    expect(body.data).toEqual({
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      rate: 4.97,
      fxCommissionBps: 0,
      effectiveRate: 4.97,
    })
  })

  it("applies configured fxCommissionBps to the route response", async () => {
    const resolveInvoiceExchangeRate = vi.fn(async () => 4.97)
    const app = createInvoiceFxRoutes({
      resolveInvoiceExchangeRate,
      invoiceFxSettings: {
        baseCurrency: "ron",
        fxCommissionBps: 200,
        fxCommissionInvoiceMention: "2% comision curs risc valutar",
      },
    })

    const response = await app.request(
      "/invoice-fx-rate?baseCurrency=eur&quoteCurrency=ron&date=2026-05-22",
    )
    const body = (await response.json()) as {
      data: {
        baseCurrency: string
        quoteCurrency: string
        date: string
        rate: number
        fxCommissionBps: number
        effectiveRate: number
        fxCommissionInvoiceMention?: string
      }
    }

    expect(response.status).toBe(200)
    expect(body.data).toEqual({
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: "2026-05-22",
      rate: 4.97,
      fxCommissionBps: 200,
      effectiveRate: 5.0694,
      fxCommissionInvoiceMention: "2% comision curs risc valutar",
    })
  })
})
