import { describe, expect, it } from "vitest"

import {
  bookingStatusSchema,
  bookingTravelerBedPreferenceSchema,
  previewTravelerRosterChangeSchema,
  travelerAllocationMapSchema,
} from "./index.js"

describe("@voyant-travel/bookings-contracts", () => {
  it("validates booking status enum values", () => {
    expect(bookingStatusSchema.safeParse("confirmed").success).toBe(true)
    expect(bookingStatusSchema.safeParse("not_a_status").success).toBe(false)
  })

  it("validates the relocated traveler primitives", () => {
    expect(bookingTravelerBedPreferenceSchema.safeParse("twin").success).toBe(true)
    expect(bookingTravelerBedPreferenceSchema.safeParse("waterbed").success).toBe(false)
    expect(travelerAllocationMapSchema.safeParse({ trav_1: "room_a" }).success).toBe(true)
    expect(travelerAllocationMapSchema.safeParse({ trav_1: 42 }).success).toBe(false)
  })

  it("validates explicit add and drop roster changes", () => {
    expect(
      previewTravelerRosterChangeSchema.parse({
        expectedBookingRevision: 4,
        reason: "Add a traveler",
        change: {
          type: "traveler_add",
          bookingItemIds: ["bitm_1", "bitm_2"],
          traveler: { firstName: "Ada", lastName: "Lovelace" },
        },
      }),
    ).toMatchObject({ change: { type: "traveler_add", traveler: { participantType: "traveler" } } })

    expect(
      previewTravelerRosterChangeSchema.safeParse({
        expectedBookingRevision: 4,
        reason: "Drop a traveler",
        change: {
          type: "traveler_drop",
          bookingItemIds: ["bitm_1", "bitm_1"],
          travelerId: "btr_1",
        },
      }).success,
    ).toBe(false)
  })
})
