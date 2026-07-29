import { describe, expect, it } from "vitest"

import {
  bookingCreateTravelerBandCounts,
  bookingCreateTravelerBandCountsForItem,
  deriveBookingCreatePax,
  resolveAssignedExtraQuantity,
  resolvePersistedFlatUnitPriceForBookingCreate,
} from "./service-booking-create.js"

describe("booking-create traveler pricing bands", () => {
  it("does not derive pax from an assigned non-pax participant key", () => {
    expect(
      deriveBookingCreatePax({
        travelers: [
          { clientTravelerKey: "trav:pax", participantType: "traveler" },
          { clientTravelerKey: "trav:contact", participantType: "other" },
        ],
        itemLines: [{ travelerKeys: ["trav:pax", "trav:contact"] }],
      }),
    ).toBe(1)
  })

  it("excludes non-pax participants globally while retaining traveler category other", () => {
    const counts = bookingCreateTravelerBandCounts(
      {
        travelers: [
          { participantType: "traveler", travelerCategory: "other" },
          { participantType: "occupant", travelerCategory: "child" },
          { participantType: "other", travelerCategory: "adult" },
        ],
      } as never,
      2,
    )

    expect(Object.fromEntries(counts)).toEqual({ other: 1, child: 1 })
  })

  it("excludes keyed non-pax participants from item-scoped pricing bands", () => {
    const result = bookingCreateTravelerBandCountsForItem(
      {
        travelers: [
          {
            clientTravelerKey: "trav:pax",
            participantType: "traveler",
            travelerCategory: "adult",
          },
          {
            clientTravelerKey: "trav:contact",
            participantType: "other",
            travelerCategory: "other",
          },
        ],
        itemLines: [
          {
            clientLineKey: "line:room",
            optionUnitId: "unit_1",
            travelerKeys: ["trav:pax", "trav:contact"],
          },
        ],
      } as never,
      { optionUnitId: "unit_1", metadata: { bookingCreateLineKey: "line:room" } },
      1,
    )

    expect(result.scopedToItem).toBe(true)
    expect(Object.fromEntries(result.counts)).toEqual({ adult: 1 })
  })
})

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

describe("persisted extra booking create quantity", () => {
  const bookingInput = (extraLines: Array<Record<string, unknown>>) =>
    ({ extraLines }) as Parameters<typeof resolveAssignedExtraQuantity>[0]

  it("preserves resolved per-person multiplicity when traveler links are item-scoped", () => {
    expect(
      resolveAssignedExtraQuantity(
        bookingInput([
          {
            clientLineKey: "extra:lunch",
            productExtraId: "lunch",
            travelerKeys: ["trav:lead", "trav:child"],
          },
        ]),
        {
          quantity: 4,
          metadata: { bookingCreateLineKey: "extra:lunch", productExtraId: "lunch" },
        },
      ),
    ).toBe(4)
  })

  it("uses assigned travelers as a lower bound for direct legacy payloads", () => {
    expect(
      resolveAssignedExtraQuantity(
        bookingInput([
          {
            productExtraId: "lunch",
            travelerKeys: ["trav:lead", "trav:child"],
          },
        ]),
        { quantity: 1, metadata: { productExtraId: "lunch" } },
      ),
    ).toBe(2)
  })

  it("preserves the resolved quantity when traveler keys are absent", () => {
    expect(
      resolveAssignedExtraQuantity(bookingInput([{ productExtraId: "lunch" }]), {
        quantity: 6,
        metadata: { productExtraId: "lunch" },
      }),
    ).toBe(6)
  })
})
