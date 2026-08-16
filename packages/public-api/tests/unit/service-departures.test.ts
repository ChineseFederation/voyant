import { describe, expect, it } from "vitest"

import { buildTravelerRequestedUnits } from "../../src/service-departures.js"

type UnitInput = Parameters<typeof buildTravelerRequestedUnits>[0]["units"][number]

function unit(data: Partial<UnitInput> & Pick<UnitInput, "id" | "name">): UnitInput {
  return {
    id: data.id,
    name: data.name,
    unitType: data.unitType ?? "person",
    minAge: data.minAge ?? null,
    maxAge: data.maxAge ?? null,
    occupancyMin: data.occupancyMin ?? null,
    occupancyMax: data.occupancyMax ?? null,
    isRequired: data.isRequired ?? false,
  }
}

describe("buildTravelerRequestedUnits", () => {
  it("prices adults under required adult units instead of falling back to child units", () => {
    const requested = buildTravelerRequestedUnits({
      units: [
        unit({ id: "unit_adult", name: "Adult", minAge: 13, isRequired: true }),
        unit({ id: "unit_child_6_12", name: "Child 6-12", minAge: 6, maxAge: 12 }),
        unit({ id: "unit_child_0_5", name: "Child 0-5", minAge: 0, maxAge: 5 }),
      ],
      adults: 1,
      children: 0,
      infants: 0,
    })

    expect(requested).toEqual([{ unitId: "unit_adult", requestRef: "unit_adult", quantity: 1 }])
  })
})
