import { describe, expect, it } from "vitest"

import {
  catalogMoneySchema,
  presentationFxProvenanceSchema,
  presentationMoneySchema,
} from "./presentation-money.js"

describe("presentation money contract", () => {
  it("keeps provider-native and shopper-presentation money together", () => {
    expect(
      presentationMoneySchema.parse({
        native: { amount: "100.00", currency: "EUR" },
        presentation: { amount: "497.50", currency: "RON" },
        fx: {
          rate: "4.975",
          provider: "bnr",
          quotedAt: "2026-08-08T08:00:00.000Z",
          validUntil: "2026-08-09T08:00:00.000Z",
        },
      }),
    ).toMatchObject({ native: { currency: "EUR" }, presentation: { currency: "RON" } })
  })

  it("rejects ambiguous currency and non-positive FX provenance", () => {
    expect(catalogMoneySchema.safeParse({ amount: "10", currency: "eur" }).success).toBe(false)
    expect(
      presentationFxProvenanceSchema.safeParse({
        rate: "0",
        provider: "voyant-data-fx",
        quotedAt: "2026-08-08T08:00:00.000Z",
      }).success,
    ).toBe(false)
  })

  it("requires FX provenance whenever presentation currency differs", () => {
    expect(() =>
      presentationMoneySchema.parse({
        native: { amount: "10.00", currency: "EUR" },
        presentation: { amount: "49.75", currency: "RON" },
      }),
    ).toThrow(/FX provenance/)
  })
})
