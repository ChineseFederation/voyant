import { describe, expect, it } from "vitest"

import { bookingSelectionV1, bookRequestV1, pricingBreakdownV1 } from "./contracts.js"

describe("V1 contracts", () => {
  describe("bookingSelectionV1", () => {
    it("accepts a minimal draft and applies defaults", () => {
      const result = bookingSelectionV1.parse({
        entity: { module: "products", id: "prod_1", sourceKind: "owned" },
      })
      expect(result.configure.pax).toEqual({})
      expect(result.billing.buyerType).toBe("B2C")
      expect(result.payment.intent).toBe("hold")
      expect(result.travelers).toEqual([])
      expect(result.addons).toEqual([])
    })

    it("preserves explicit field values", () => {
      const result = bookingSelectionV1.parse({
        entity: { module: "products", id: "prod_1", sourceKind: "owned" },
        configure: {
          pax: { adult: 2 },
          roomTypeId: "HOTEL:DZL1",
          ratePlanId: "HOTEL:DZL1:BB",
          board: "BB",
        },
        billing: {
          buyerType: "B2B",
          contact: { firstName: "Mihai", lastName: "U", email: "a@b.com" },
          address: { country: "RO" },
          company: { name: "Voyant" },
        },
      })
      expect(result.configure.pax.adult).toBe(2)
      expect(result.configure.roomTypeId).toBe("HOTEL:DZL1")
      expect(result.configure.ratePlanId).toBe("HOTEL:DZL1:BB")
      expect(result.configure.board).toBe("BB")
      expect(result.billing.buyerType).toBe("B2B")
      expect(result.billing.address.country).toBe("RO")
      expect(result.billing.company?.name).toBe("Voyant")
    })

    it("rejects malformed entity reference", () => {
      const result = bookingSelectionV1.safeParse({})
      expect(result.success).toBe(false)
    })
  })

  describe("bookRequestV1", () => {
    it("requires either quoteId or draftId", () => {
      expect(bookRequestV1.safeParse({}).success).toBe(false)
      expect(bookRequestV1.safeParse({ quoteId: "q1" }).success).toBe(true)
      expect(bookRequestV1.safeParse({ draftId: "d1" }).success).toBe(true)
    })

    it("rejects too-short idempotency keys", () => {
      const result = bookRequestV1.safeParse({ quoteId: "q1", idempotencyKey: "abc" })
      expect(result.success).toBe(false)
    })

    it("accepts idempotency keys in the 8–128 range", () => {
      expect(bookRequestV1.safeParse({ quoteId: "q1", idempotencyKey: "12345678" }).success).toBe(
        true,
      )
      expect(
        bookRequestV1.safeParse({ quoteId: "q1", idempotencyKey: "x".repeat(128) }).success,
      ).toBe(true)
      expect(
        bookRequestV1.safeParse({ quoteId: "q1", idempotencyKey: "x".repeat(129) }).success,
      ).toBe(false)
    })

    it.each([
      "bank_transfer",
      "inquiry",
    ])("rejects checkout-only %s intents from the reservation contract", (type) => {
      const result = bookRequestV1.safeParse({ quoteId: "q1", paymentIntent: { type } })

      expect(result.success).toBe(false)
    })
  })

  describe("pricingBreakdownV1", () => {
    it("validates a populated breakdown", () => {
      const result = pricingBreakdownV1.safeParse({
        currency: "EUR",
        lines: [{ kind: "base", label: "Base", quantity: 2, unitAmount: 5000, totalAmount: 10000 }],
        taxes: [{ code: "vat", label: "VAT", rate: 0.19, amount: 1900, base: 10000 }],
        subtotal: 10000,
        taxTotal: 1900,
        total: 11900,
      })
      expect(result.success).toBe(true)
    })

    it("rejects bad currency length", () => {
      const result = pricingBreakdownV1.safeParse({
        currency: "EURO",
        lines: [],
        taxes: [],
        subtotal: 0,
        taxTotal: 0,
        total: 0,
      })
      expect(result.success).toBe(false)
    })
  })
})
