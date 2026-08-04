import { describe, expect, it } from "vitest"

import {
  bookingSelectionV1,
  bookRequestV1,
  pricingBreakdownV1,
  quoteBatchRequestV1,
  quoteBatchResponseV1,
  quoteRequestV1,
  quoteResponseV1,
} from "./contracts.js"

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

  describe("quoteRequestV1", () => {
    it("validates a request without a draft", () => {
      const result = quoteRequestV1.safeParse({
        entityModule: "products",
        entityId: "prod_1",
        sourceKind: "owned",
        scope: { locale: "en-GB", audience: "staff", market: "default" },
      })
      expect(result.success).toBe(true)
    })

    it("requires audience to be one of the recognized actors", () => {
      const result = quoteRequestV1.safeParse({
        entityModule: "products",
        entityId: "prod_1",
        sourceKind: "owned",
        scope: { locale: "en-GB", audience: "robot", market: "default" },
      })
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

  describe("quoteResponseV1", () => {
    it("validates a minimal availability=false response", () => {
      const result = quoteResponseV1.safeParse({
        quoteId: "q1",
        quotedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        available: false,
        invalidReason: "out_of_stock",
      })
      expect(result.success).toBe(true)
    })
  })

  describe("quoteBatchRequestV1", () => {
    it("caps batch quote selections", () => {
      const selection = {
        entityModule: "accommodations",
        entityId: "room_1",
        ratePlanId: "rate_1",
      }
      expect(
        quoteBatchRequestV1.safeParse({
          criteria: { checkIn: "2026-09-01", checkOut: "2026-09-03" },
          selections: [selection],
        }).success,
      ).toBe(true)
      expect(
        quoteBatchRequestV1.safeParse({
          selections: Array.from({ length: 31 }, () => selection),
        }).success,
      ).toBe(false)
    })
  })

  describe("quoteBatchResponseV1", () => {
    it("validates per-selection quote results", () => {
      const result = quoteBatchResponseV1.safeParse({
        results: [
          {
            selection: {
              entityModule: "accommodations",
              entityId: "room_1",
              ratePlanId: "rate_1",
            },
            quoteId: "q1",
            quotedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 60_000).toISOString(),
            available: true,
            pricing: {
              currency: "USD",
              lines: [],
              taxes: [],
              subtotal: 10000,
              taxTotal: 0,
              total: 10000,
            },
          },
        ],
      })
      expect(result.success).toBe(true)
    })
  })
})
