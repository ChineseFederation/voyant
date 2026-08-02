import { describe, expect, it } from "vitest"
import {
  financeAppApiRuntimePort,
  insertBookingItemCommissionSchema,
  insertBookingItemTaxLineSchema,
  insertBookingPaymentScheduleSchema,
  insertPaymentAuthorizationSchema,
  insertPaymentCaptureSchema,
  insertPaymentSchema,
  insertTaxRegimeSchema,
  invoiceStatusSchema,
  paymentMethodSchema,
  taxClassListQuerySchema,
  travelCreditSourceTypeSchema,
  updateBookingItemCommissionSchema,
  updateBookingItemTaxLineSchema,
  updatePaymentSchema,
  updateTaxRegimeSchema,
} from "./index.js"
import { financeAppApiRuntimePort as importCheapFinanceAppApiRuntimePort } from "./runtime-port.js"

describe("finance-contracts", () => {
  it("keeps the finance App API runtime seam provider-neutral and closed", () => {
    expect(financeAppApiRuntimePort.id).toBe("finance.app-api.runtime")
    expect(financeAppApiRuntimePort).toBe(importCheapFinanceAppApiRuntimePort)
    expect(() =>
      financeAppApiRuntimePort.test({ getIssuanceDocument: async () => null } as never),
    ).toThrow(/getExternalReference/)
  })

  it("requires every lifecycle and settlement method on the Finance App API runtime", () => {
    const provider = {
      getIssuanceDocument: async () => null,
      getExternalReference: async () => null,
      upsertExternalReference: async () => null,
      attachPdfArtifact: async () => null,
      updateExternalSyncState: async () => null,
      updateExternalLifecycleState: async () => null,
      recordSettlementObservation: async () => null,
    }

    expect(() => financeAppApiRuntimePort.test(provider as never)).not.toThrow()
    expect(() =>
      financeAppApiRuntimePort.test({
        ...provider,
        updateExternalLifecycleState: undefined,
      } as never),
    ).toThrow(/updateExternalLifecycleState/)
    expect(() =>
      financeAppApiRuntimePort.test({
        ...provider,
        recordSettlementObservation: undefined,
      } as never),
    ).toThrow(/recordSettlementObservation/)
  })

  it("accepts valid enum values", () => {
    expect(invoiceStatusSchema.parse("issued")).toBe("issued")
    expect(paymentMethodSchema.parse("bank_transfer")).toBe("bank_transfer")
    expect(paymentMethodSchema.parse("travel_credit")).toBe("travel_credit")
    expect(travelCreditSourceTypeSchema.parse("goodwill")).toBe("goodwill")
    expect(travelCreditSourceTypeSchema.parse("promotion")).toBe("promotion")
  })

  it("keeps payment business dates bound to a valid explicit timezone", () => {
    const input = {
      dueDate: "2026-03-29",
      dueTimeZone: "Europe/Bucharest",
      currency: "EUR",
      amountCents: 10_000,
    }
    expect(insertBookingPaymentScheduleSchema.parse(input).dueTimeZone).toBe("Europe/Bucharest")
    expect(() =>
      insertBookingPaymentScheduleSchema.parse({ ...input, dueTimeZone: "not/a-zone" }),
    ).toThrow(/IANA timezone/)
  })

  it("rejects invalid enum values", () => {
    expect(invoiceStatusSchema.safeParse("settled").success).toBe(false)
    expect(paymentMethodSchema.safeParse("bitcoin").success).toBe(false)
    expect(paymentMethodSchema.safeParse("voucher").success).toBe(false)
    expect(travelCreditSourceTypeSchema.safeParse("promo").success).toBe(false)
  })

  it("keeps payment idempotency keys create-only", () => {
    expect(
      insertPaymentSchema.parse({
        amountCents: 1000,
        currency: "USD",
        paymentMethod: "cash",
        paymentDate: "2026-06-09",
        idempotencyKey: "pay-create-1",
      }).idempotencyKey,
    ).toBe("pay-create-1")

    expect(updatePaymentSchema.parse({ idempotencyKey: "ignored" })).toEqual({})
  })

  it("requires positive payment authorization and capture amounts", () => {
    expect(
      insertPaymentAuthorizationSchema.safeParse({
        currency: "USD",
        amountCents: 1,
      }).success,
    ).toBe(true)
    expect(
      insertPaymentAuthorizationSchema.safeParse({
        currency: "USD",
        amountCents: 0,
      }).success,
    ).toBe(false)

    expect(
      insertPaymentCaptureSchema.safeParse({
        currency: "USD",
        amountCents: 1,
      }).success,
    ).toBe(true)
    expect(
      insertPaymentCaptureSchema.safeParse({
        currency: "USD",
        amountCents: 0,
      }).success,
    ).toBe(false)
  })

  it("rejects tax regime rates outside the 0..100 percent domain", () => {
    expect(
      insertTaxRegimeSchema.safeParse({ code: "standard", name: "Bogus", ratePercent: 1000 })
        .success,
    ).toBe(false)
    expect(updateTaxRegimeSchema.safeParse({ ratePercent: 1000 }).success).toBe(false)
    expect(
      insertTaxRegimeSchema.safeParse({ code: "standard", name: "Neg", ratePercent: -1 }).success,
    ).toBe(false)
  })

  it("accepts tax regime rates within the 0..100 percent domain", () => {
    const result = insertTaxRegimeSchema.parse({
      code: "standard",
      name: "TVA Standard",
      ratePercent: 21,
    })

    expect(result.ratePercent).toBe(21)
    expect(
      insertTaxRegimeSchema.parse({ code: "zero_rated", name: "Zero", ratePercent: 0 }).ratePercent,
    ).toBe(0)
    expect(
      insertTaxRegimeSchema.parse({ code: "standard", name: "Full", ratePercent: 100 }).ratePercent,
    ).toBe(100)
  })

  it("parses false tax-class active query filters as false", () => {
    const result = taxClassListQuerySchema.parse({ active: "false" })

    expect(result.active).toBe(false)
  })

  it("rejects negative booking-item tax line amounts", () => {
    expect(
      insertBookingItemTaxLineSchema.safeParse({
        name: "VAT",
        currency: "USD",
        amountCents: -1,
      }).success,
    ).toBe(false)

    expect(updateBookingItemTaxLineSchema.safeParse({ amountCents: -1 }).success).toBe(false)
  })

  it("requires booking-item commission value basis by model", () => {
    expect(
      insertBookingItemCommissionSchema.safeParse({
        recipientType: "agency",
        commissionModel: "percentage",
      }).success,
    ).toBe(false)

    expect(
      insertBookingItemCommissionSchema.safeParse({
        recipientType: "agency",
        commissionModel: "fixed",
      }).success,
    ).toBe(false)

    expect(
      insertBookingItemCommissionSchema.safeParse({
        recipientType: "agency",
        commissionModel: "percentage",
        rateBasisPoints: 1000,
      }).success,
    ).toBe(true)

    expect(
      insertBookingItemCommissionSchema.safeParse({
        recipientType: "agency",
        commissionModel: "fixed",
        amountCents: 2500,
        currency: "USD",
      }).success,
    ).toBe(true)
  })

  it("requires settlement metadata when marking booking-item commissions paid", () => {
    expect(
      insertBookingItemCommissionSchema.safeParse({
        recipientType: "agency",
        commissionModel: "percentage",
        rateBasisPoints: 1000,
        status: "paid",
      }).success,
    ).toBe(false)

    expect(updateBookingItemCommissionSchema.safeParse({ status: "paid" }).success).toBe(false)

    expect(
      updateBookingItemCommissionSchema.safeParse({
        status: "paid",
        paidAt: "2026-06-30",
      }).success,
    ).toBe(true)
  })

  it("does not apply create defaults to booking-item commission patches", () => {
    const result = updateBookingItemCommissionSchema.parse({ notes: "internal note" })
    expect(result).toEqual({ notes: "internal note" })
  })
})
