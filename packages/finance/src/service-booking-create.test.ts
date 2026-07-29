import { describe, expect, it } from "vitest"

import { resolvePersistedFlatUnitPriceForBookingCreate } from "./service-booking-create.js"

describe("persisted flat unit booking create pricing", () => {
  it("preserves free persisted pricing as a zero total without falling back", () => {
    expect(
      resolvePersistedFlatUnitPriceForBookingCreate({
        matchedRule: true,
        pricingMode: "free",
        unitAmount: null,
        chargeQuantity: 2,
      }),
    ).toEqual({ status: "priced", unitAmountCents: 0, totalAmountCents: 0 })
  })

  it("keeps on-request persisted pricing unpriced instead of silently charging legacy totals", () => {
    expect(
      resolvePersistedFlatUnitPriceForBookingCreate({
        matchedRule: true,
        pricingMode: "on_request",
        unitAmount: null,
        chargeQuantity: 2,
      }),
    ).toEqual({ status: "invalid" })
  })

  it("rejects missing numeric persisted amounts for matched priced rules", () => {
    expect(
      resolvePersistedFlatUnitPriceForBookingCreate({
        matchedRule: true,
        pricingMode: "per_booking",
        unitAmount: null,
        chargeQuantity: 1,
      }),
    ).toEqual({ status: "invalid" })
  })

  it("leaves unresolved unit lookup unpriced so the legacy fallback remains limited to absent rules", () => {
    expect(
      resolvePersistedFlatUnitPriceForBookingCreate({
        matchedRule: false,
        pricingMode: null,
        unitAmount: null,
        chargeQuantity: 1,
      }),
    ).toEqual({ status: "unpriced" })
  })
})
