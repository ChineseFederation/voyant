import { describe, expect, it } from "vitest"
import { classifyOccupancyPrice, resolveOccupancyPrice } from "./occupancy-pricing.js"

describe("occupancy pricing semantics", () => {
  it("adds an explicit occupancy supplement to each traveler's base fare", () => {
    expect(
      resolveOccupancyPrice({
        occupancyPriceBasis: "supplement",
        travelerBaseFareAmountCents: 16_500,
        travelerCount: 1,
        occupancyAmountCents: 10_000,
      }),
    ).toEqual({
      status: "priced",
      semanticsVersion: 1,
      totalAmountCents: 26_500,
    })
  })

  it("does not add the traveler base fare to an explicit all-in occupancy fare", () => {
    expect(
      resolveOccupancyPrice({
        occupancyPriceBasis: "all_in",
        travelerBaseFareAmountCents: 16_500,
        travelerCount: 1,
        occupancyAmountCents: 26_500,
      }),
    ).toEqual({
      status: "priced",
      semanticsVersion: 1,
      totalAmountCents: 26_500,
    })
  })

  it.each([
    ["single", 1, 10_000, 26_500],
    ["twin", 2, 12_000, 45_000],
    ["double", 2, 15_000, 48_000],
    ["triple", 3, 18_000, 67_500],
  ])("composes the %s occupancy supplement exactly once", (_occupancy, travelerCount, occupancyAmountCents, expectedTotalAmountCents) => {
    expect(
      resolveOccupancyPrice({
        occupancyPriceBasis: "supplement",
        travelerBaseFareAmountCents: 16_500,
        travelerCount,
        occupancyAmountCents,
      }),
    ).toMatchObject({
      status: "priced",
      totalAmountCents: expectedTotalAmountCents,
    })
  })

  it("quarantines a historical occupancy amount that does not declare its basis", () => {
    expect(
      resolveOccupancyPrice({
        occupancyPriceBasis: null,
        travelerBaseFareAmountCents: 16_500,
        travelerCount: 1,
        occupancyAmountCents: 26_500,
      }),
    ).toEqual({
      status: "ambiguous",
      semanticsVersion: 1,
      diagnostic:
        "Declare occupancyPriceBasis as 'supplement' when the occupancy amount is added to traveler base fares, or 'all_in' when it already includes them.",
    })
  })

  it("classifies historical shapes that cannot double-charge deterministically", () => {
    expect(
      classifyOccupancyPrice({
        occupancyPriceBasis: null,
        travelerBaseFareAmountCents: 16_500,
        occupancyAmountCents: 0,
      }),
    ).toEqual({
      status: "classified",
      semanticsVersion: 1,
      occupancyPriceBasis: "supplement",
      source: "inferred",
    })
    expect(
      classifyOccupancyPrice({
        occupancyPriceBasis: null,
        travelerBaseFareAmountCents: 0,
        occupancyAmountCents: 26_500,
      }),
    ).toEqual({
      status: "classified",
      semanticsVersion: 1,
      occupancyPriceBasis: "all_in",
      source: "inferred",
    })
  })
})
