import type { AccommodationContent } from "@voyant-travel/accommodations/content-shape"
import { describe, expect, it } from "vitest"

import {
  getAccommodationRatePlansForRoom,
  resolveInitialAccommodationSelection,
} from "./accommodation-detail-page.js"

describe("storefront accommodation detail selection", () => {
  it("preserves a room-level route id instead of defaulting to another room", () => {
    const content = accommodationContent({
      rooms: [
        { id: "hrmt_family", name: "Family Garden Twin" },
        { id: "hrmt_accessible", name: "Accessible Garden Double" },
      ],
      ratePlans: [
        {
          id: "rate_accessible",
          name: "Accessible BAR",
          applies_to_room_type_ids: ["hrmt_accessible"],
        },
      ],
    })

    expect(resolveInitialAccommodationSelection(content, "hrmt_accessible")).toEqual({
      roomId: "hrmt_accessible",
      ratePlanId: "rate_accessible",
    })
  })

  it("does not switch a room-level route to a different room when no compatible rate exists", () => {
    const content = accommodationContent({
      rooms: [
        { id: "hrmt_family", name: "Family Garden Twin" },
        { id: "hrmt_accessible", name: "Accessible Garden Double" },
      ],
      ratePlans: [
        { id: "rate_family", name: "Family BAR", applies_to_room_type_ids: ["hrmt_family"] },
      ],
    })

    expect(resolveInitialAccommodationSelection(content, "hrmt_accessible")).toEqual({
      roomId: "hrmt_accessible",
      ratePlanId: undefined,
    })
  })

  it("starts property-level routes on the first room with a compatible rate plan", () => {
    const content = accommodationContent({
      rooms: [
        { id: "hrmt_unpriced", name: "Unpriced Room" },
        { id: "hrmt_double", name: "Atelier Double" },
      ],
      ratePlans: [
        { id: "rate_double", name: "Double BAR", applies_to_room_type_ids: ["hrmt_double"] },
      ],
    })

    expect(resolveInitialAccommodationSelection(content, "cdmi_demo_hotel")).toEqual({
      roomId: "hrmt_double",
      ratePlanId: "rate_double",
    })
  })

  it("treats rate plans without room mappings as compatible with every room", () => {
    const content = accommodationContent({
      rooms: [
        { id: "hrmt_family", name: "Family Garden Twin" },
        { id: "hrmt_accessible", name: "Accessible Garden Double" },
      ],
      ratePlans: [{ id: "rate_all", name: "Best Available Rate" }],
    })

    expect(
      getAccommodationRatePlansForRoom(content, "hrmt_accessible").map((plan) => plan.id),
    ).toEqual(["rate_all"])
  })
})

function accommodationContent({
  rooms,
  ratePlans,
}: {
  rooms: Array<Pick<AccommodationContent["room_types"][number], "id" | "name">>
  ratePlans: Array<
    Pick<AccommodationContent["rate_plans"][number], "id" | "name"> &
      Partial<
        Pick<
          AccommodationContent["rate_plans"][number],
          "applies_to_room_type_ids" | "charge_frequency" | "inclusions"
        >
      >
  >
}): AccommodationContent {
  return {
    hotel: { id: "hotel_1", name: "Maison Montmartre Paris" },
    room_types: rooms.map((room) => ({
      ...room,
      amenities: [],
      beds: [],
      images: [],
    })),
    rate_plans: ratePlans.map((plan) => ({
      ...plan,
      applies_to_room_type_ids: plan.applies_to_room_type_ids ?? [],
      charge_frequency: plan.charge_frequency ?? "per_night",
      inclusions: plan.inclusions ?? [],
    })),
    meal_plans: [],
    amenities: [],
    policies: [],
  }
}
