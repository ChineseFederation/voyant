import { describe, expect, it } from "vitest"

import type { AccommodationContent } from "../../src/content-shape.js"
import { accommodationContentSchema } from "../../src/content-shape.js"
import {
  buildAccommodationRequirements,
  DEFAULT_ACCOMMODATION_PAX_BANDS,
} from "../../src/requirements.js"

const minimalContent: AccommodationContent = accommodationContentSchema.parse({
  hotel: { id: "hrmt_abc", name: "Sample Hotel" },
})

const richContent: AccommodationContent = accommodationContentSchema.parse({
  hotel: { id: "hrmt_abc", name: "Sample Hotel" },
  room_types: [
    { id: "hrmt_std", name: "Standard Double", max_occupancy: 2 },
    { id: "hrmt_dlx", name: "Deluxe Suite", max_occupancy: 4 },
  ],
})

describe("buildAccommodationRequirements", () => {
  it("emits date-range + occupancy sub-steps under Configure", () => {
    const shape = buildAccommodationRequirements(minimalContent)
    const kinds = (shape.configureSubSteps ?? []).map((s) => s.kind)
    expect(kinds).toEqual(["date-range", "occupancy"])
  })

  it("uses default pax bands (adult + child) and computes total", () => {
    const shape = buildAccommodationRequirements(minimalContent)
    expect(shape.paxBands).toEqual(DEFAULT_ACCOMMODATION_PAX_BANDS)
    expect(shape.paxBandsAllowedTotal).toEqual({ min: 1, max: 10 })
  })

  it("hides Accommodation step when room_types is empty", () => {
    const shape = buildAccommodationRequirements(minimalContent)
    expect(shape.showsAccommodation).toBe(false)
    expect(shape.accommodation).toBeUndefined()
  })

  it("shows Accommodation + projects room_types into roomOptions when content has rooms", () => {
    const shape = buildAccommodationRequirements(richContent)
    expect(shape.showsAccommodation).toBe(true)
    expect(shape.accommodation?.roomOptions).toHaveLength(2)
    expect(shape.accommodation?.roomOptions?.[0]?.id).toBe("hrmt_std")
    expect(shape.accommodation?.roomOptions?.[0]?.capacity).toBe(2)
    expect(shape.accommodation?.subSteps).toHaveLength(1)
    expect(shape.accommodation?.subSteps?.[0]?.kind).toBe("rooms")
  })

  it("respects min/max nights overrides", () => {
    const shape = buildAccommodationRequirements(minimalContent, { minNights: 3, maxNights: 14 })
    const dateRangeStep = shape.configureSubSteps?.find((s) => s.kind === "date-range")
    expect(dateRangeStep && dateRangeStep.kind === "date-range").toBe(true)
    if (dateRangeStep && dateRangeStep.kind === "date-range") {
      expect(dateRangeStep.minNights).toBe(3)
      expect(dateRangeStep.maxNights).toBe(14)
    }
  })

  it("respects sharedRoomAllowed = false", () => {
    const shape = buildAccommodationRequirements(richContent, { sharedRoomAllowed: false })
    expect(shape.accommodation?.sharedRoomAllowed).toBe(false)
    expect(
      shape.accommodation?.subSteps?.[0]?.kind === "rooms" &&
        shape.accommodation.subSteps[0].sharedRoomAllowed === false,
    ).toBe(true)
  })
})
