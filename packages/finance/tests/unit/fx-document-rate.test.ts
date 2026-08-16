import { describe, expect, it, vi } from "vitest"

import { resolveDocumentFxRate, resolveReportingStamp } from "../../src/fx-money.js"
import { fakeRateStore, scriptedRateStore } from "./support/rate-store.js"

/**
 * The resolution order, and what happens when the pieces are missing
 * (voyant#4703). The Postgres-backed half — that "the day's own rate" really
 * is a same-day query — lives in commerce's `fx-rate-capture` integration
 * test, because only the real rate store can prove it.
 */
describe("document FX rate resolution", () => {
  const settings = { baseCurrency: "RON", fxCommissionBps: 200 }

  it("asks the source for the document's own date, not for today", async () => {
    const resolveInvoiceExchangeRate = vi.fn(async () => ({ rate: 5.2472, source: "bnr" }))

    await resolveDocumentFxRate(
      fakeRateStore(),
      { currency: "EUR", baseCurrency: "RON", date: "2026-03-04" },
      { invoiceFxSettings: settings, resolveInvoiceExchangeRate },
    )

    expect(resolveInvoiceExchangeRate).toHaveBeenCalledWith({
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: "2026-03-04",
    })
  })

  it("captures the resolved rate and reports the rate set the document is stamped with", async () => {
    const captureFxRates = vi.fn(async () => ({
      fxRateSetId: "fxrs_captured",
      rates: [{ currency: "EUR", rate: 5.2472, effectiveRate: 5.352144, commissionBps: 200 }],
    }))

    const resolved = await resolveDocumentFxRate(
      fakeRateStore(),
      { currency: "EUR", baseCurrency: "RON", date: "2026-03-04" },
      {
        invoiceFxSettings: settings,
        resolveInvoiceExchangeRate: async () => ({ rate: 5.2472, source: "bnr" }),
        captureFxRates,
      },
    )

    expect(captureFxRates).toHaveBeenCalledWith(expect.anything(), {
      reportingCurrency: "RON",
      date: "2026-03-04",
      source: "bnr",
      commissionBps: 200,
      quotes: [{ currency: "EUR", rate: 5.2472 }],
    })
    expect(resolved).toMatchObject({
      origin: "captured",
      fxRateSetId: "fxrs_captured",
      sourceRate: 5.2472,
      effectiveRate: 5.352144,
    })
  })

  it("still converts when the rate store refuses the write", async () => {
    // Capture is durability, not correctness. A document that cannot be handed
    // a rate-set id must still carry a converted amount rather than none.
    const resolved = await resolveDocumentFxRate(
      fakeRateStore(),
      { currency: "EUR", baseCurrency: "RON", date: "2026-03-04" },
      {
        invoiceFxSettings: settings,
        resolveInvoiceExchangeRate: async () => ({ rate: 5.2472 }),
        captureFxRates: async () => {
          throw new Error("rate store unavailable")
        },
      },
    )

    expect(resolved).toMatchObject({ origin: "resolver", fxRateSetId: null })
    expect(resolved?.effectiveRate).toBeCloseTo(5.352144, 6)
  })

  it("keeps the day's own rate when capture fails, rather than an older standing one", async () => {
    // Capture is durability, not correctness, and a failed WRITE must not
    // change the amount. Falling back to the standing rate here would convert
    // this document at 9.0 because the rate store was briefly unavailable.
    const resolved = await resolveDocumentFxRate(
      scriptedRateStore([
        [], // nothing captured for the document's own day, direct
        [], // …nor inverted
        [
          {
            fxRateSetId: "fxrs_last_week",
            rateDecimal: "9.00000000",
            inverseRateDecimal: null,
            effectiveRateDecimal: null,
            commissionBps: null,
            observedAt: new Date("2026-02-25T00:00:00.000Z"),
          },
        ],
      ]),
      { currency: "EUR", baseCurrency: "RON", date: "2026-03-04" },
      {
        invoiceFxSettings: settings,
        resolveInvoiceExchangeRate: async () => ({ rate: 5.2472 }),
        captureFxRates: async () => {
          throw new Error("rate store unavailable")
        },
      },
    )

    expect(resolved).toMatchObject({ origin: "resolver", sourceRate: 5.2472 })
    expect(resolved?.effectiveRate).toBeCloseTo(5.352144, 6)
  })

  it("reads an applied rate backwards as one over itself", async () => {
    // The row records 5.352144 RON per EUR. One RON is therefore 1/5.352144
    // EUR. Inverting the SOURCE rate and re-applying the margin would imply
    // 5.1443 RON per EUR — contradicting the row it came from.
    const resolved = await resolveDocumentFxRate(
      scriptedRateStore([
        [], // no EUR→RON row for the day…
        [
          // …but the RON→EUR direction is captured.
          {
            fxRateSetId: "fxrs_captured",
            rateDecimal: "5.24720000",
            inverseRateDecimal: "0.19057800",
            effectiveRateDecimal: "5.35214400",
            commissionBps: 200,
            observedAt: new Date("2026-03-04T00:00:00.000Z"),
          },
        ],
      ]),
      { currency: "RON", baseCurrency: "EUR", date: "2026-03-04" },
      { invoiceFxSettings: { baseCurrency: "EUR", fxCommissionBps: 200 } },
    )

    expect(resolved?.effectiveRate).toBeCloseTo(1 / 5.352144, 8)
    expect(resolved?.commissionBps).toBe(200)
  })

  it("applies the operator margin to a rate that does not record one", async () => {
    // A rate entered by hand before voyant#4703 has no effective rate on it,
    // so the configured margin still gets applied on read.
    const resolved = await resolveDocumentFxRate(
      fakeRateStore([
        {
          fxRateSetId: "fxrs_legacy",
          rateDecimal: "5.24720000",
          inverseRateDecimal: null,
          effectiveRateDecimal: null,
          commissionBps: null,
          observedAt: new Date("2026-03-04T00:00:00.000Z"),
        },
      ]),
      { currency: "EUR", baseCurrency: "RON", date: "2026-03-04" },
      { invoiceFxSettings: settings },
    )

    expect(resolved).toMatchObject({ origin: "persisted", fxRateSetId: "fxrs_legacy" })
    expect(resolved?.effectiveRate).toBeCloseTo(5.352144, 6)
  })

  it("does not re-apply the margin to a rate that already records one", async () => {
    const resolved = await resolveDocumentFxRate(
      fakeRateStore([
        {
          fxRateSetId: "fxrs_captured",
          rateDecimal: "5.24720000",
          inverseRateDecimal: null,
          effectiveRateDecimal: "5.35214400",
          commissionBps: 200,
          observedAt: new Date("2026-03-04T00:00:00.000Z"),
        },
      ]),
      { currency: "EUR", baseCurrency: "RON", date: "2026-03-04" },
      // The margin has since doubled. The document keeps the one it was
      // stamped with, or every historical figure moves with the setting.
      { invoiceFxSettings: { baseCurrency: "RON", fxCommissionBps: 400 } },
    )

    expect(resolved?.effectiveRate).toBeCloseTo(5.352144, 6)
    expect(resolved?.commissionBps).toBe(200)
  })

  it("returns nothing when neither a stored rate nor a source can answer", async () => {
    // An unstamped document is honest; one stamped at a rate nobody published
    // is not.
    await expect(
      resolveDocumentFxRate(
        fakeRateStore(),
        { currency: "EUR", baseCurrency: "RON", date: "2026-03-04" },
        { invoiceFxSettings: settings },
      ),
    ).resolves.toBeNull()
  })

  it("leaves an amount unstamped when no reporting currency is configured", async () => {
    await expect(
      resolveReportingStamp(
        fakeRateStore(),
        { amountCents: 42_000, currency: "EUR", date: "2026-03-04" },
        { invoiceFxSettings: { baseCurrency: null, fxCommissionBps: 200 } },
      ),
    ).resolves.toBeNull()
  })

  it("stamps a reporting-currency amount at the rate of its own date", async () => {
    const stamp = await resolveReportingStamp(
      fakeRateStore([
        {
          fxRateSetId: "fxrs_captured",
          rateDecimal: "5.24720000",
          inverseRateDecimal: null,
          effectiveRateDecimal: "5.35214400",
          commissionBps: 200,
          observedAt: new Date("2026-03-04T00:00:00.000Z"),
        },
      ]),
      { amountCents: 42_000, currency: "EUR", date: "2026-03-04" },
      { invoiceFxSettings: settings },
    )

    expect(stamp).toEqual({
      reportingCurrency: "RON",
      reportingAmountCents: Math.round(42_000 * 5.352144),
      reportingFxRateSetId: "fxrs_captured",
    })
  })

  it("needs no rate when the amount is already in the reporting currency", async () => {
    const stamp = await resolveReportingStamp(
      fakeRateStore(),
      { amountCents: 42_000, currency: "ron", date: "2026-03-04" },
      { invoiceFxSettings: settings },
    )

    expect(stamp).toEqual({
      reportingCurrency: "RON",
      reportingAmountCents: 42_000,
      reportingFxRateSetId: null,
    })
  })
})
