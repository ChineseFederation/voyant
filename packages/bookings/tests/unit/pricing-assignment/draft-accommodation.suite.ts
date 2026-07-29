import { describe, expect, it } from "vitest"

import { type PricingAssignmentUnit, resolveBookingDraft } from "../../../src/pricing-assignment.js"
import { NOW, traveler, unit } from "./fixtures.js"

describe("resolveBookingDraft — accommodation (Moldova DBL shape)", () => {
  // Pro Travel's "Circuit Moldova / DBL" — room unit + adult person
  // unit. Stepper picks 1 DBL; line item should stay "1 DBL room".
  const moldovaDblUnits: PricingAssignmentUnit[] = [
    unit({
      optionId: "opto_mol_dbl",
      optionUnitId: "u_dbl_room",
      unitCode: "dbl_room",
      unitType: "room",
    }),
    unit({
      optionId: "opto_mol_dbl",
      optionUnitId: "u_adult_mol",
      unitCode: "adult",
      unitType: "person",
      minAge: 18,
    }),
  ]

  it("keeps accommodation quantities as room quantities instead of traveler counts", () => {
    const result = resolveBookingDraft({
      now: NOW,
      quantities: { u_dbl_room: 1 },
      travelers: [
        traveler({ role: "lead", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
        traveler({ role: "adult", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
      ],
      units: moldovaDblUnits,
    })

    expect(result.quantities).toEqual({ u_dbl_room: 1 })
    expect(result.travelers[0]?.pricingUnitId).toBe("u_adult_mol")
    expect(result.travelers[0]?.inventoryUnitId).toBe("u_dbl_room")
    expect(result.travelerIndexesByUnitId).toEqual({ u_dbl_room: [0, 1] })
  })

  it("normalizes legacy adult-keyed accommodation quantities onto the inventory unit", () => {
    const result = resolveBookingDraft({
      now: NOW,
      quantities: { u_adult_mol: 1 },
      travelers: [
        traveler({ role: "lead", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
        traveler({ role: "adult", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
      ],
      units: moldovaDblUnits,
    })

    expect(result.quantities).toEqual({ u_dbl_room: 1 })
    expect(result.travelerIndexesByUnitId).toEqual({ u_dbl_room: [0, 1] })
  })

  it("preserves valid manual inventory assignments on resolver re-run", () => {
    const result = resolveBookingDraft({
      now: NOW,
      quantities: { u_dbl_room: 1 },
      travelers: [
        traveler({ role: "lead", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
        traveler({ role: "adult", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
      ],
      units: moldovaDblUnits,
    })

    expect(result.travelers[0]?.inventoryUnitId).toBe("u_dbl_room")
    expect(result.travelers[0]?.inventoryUnitSource).toBe("manual")
    expect(result.travelers[1]?.inventoryUnitId).toBe("u_dbl_room")
    expect(result.travelers[1]?.inventoryUnitSource).toBe("manual")
    expect(result.travelerIndexesByUnitId).toEqual({ u_dbl_room: [0, 1] })
  })

  it("fills selected room capacity across room types", () => {
    const roomUnits: PricingAssignmentUnit[] = [
      unit({
        optionId: "opto_rooms",
        optionUnitId: "u_double",
        unitName: "Double",
        unitType: "room",
        occupancyMax: 2,
      }),
      unit({
        optionId: "opto_rooms",
        optionUnitId: "u_single",
        unitName: "Single",
        unitType: "room",
        occupancyMax: 1,
      }),
    ]
    const result = resolveBookingDraft({
      now: NOW,
      quantities: { u_double: 1, u_single: 1 },
      travelers: [
        traveler({ role: "lead" }),
        traveler({ role: "adult" }),
        traveler({ role: "adult" }),
      ],
      units: roomUnits,
    })

    expect(result.quantities).toEqual({ u_double: 1, u_single: 1 })
    expect(result.travelers.map((entry) => entry.inventoryUnitId)).toEqual([
      "u_double",
      "u_double",
      "u_single",
    ])
    expect(result.travelerIndexesByUnitId).toEqual({ u_double: [0, 1], u_single: [2] })
  })

  it("respects manual room choices before assigning remaining travelers", () => {
    const roomUnits: PricingAssignmentUnit[] = [
      unit({
        optionId: "opto_rooms",
        optionUnitId: "u_double",
        unitType: "room",
        occupancyMax: 2,
      }),
      unit({
        optionId: "opto_rooms",
        optionUnitId: "u_single",
        unitType: "room",
        occupancyMax: 1,
      }),
    ]
    const result = resolveBookingDraft({
      now: NOW,
      quantities: { u_double: 1, u_single: 1 },
      travelers: [
        traveler({
          role: "lead",
          inventoryUnitId: "u_single",
          inventoryUnitSource: "manual",
        }),
        traveler({ role: "adult" }),
        traveler({ role: "adult" }),
      ],
      units: roomUnits,
    })

    expect(result.travelers.map((entry) => entry.inventoryUnitId)).toEqual([
      "u_single",
      "u_double",
      "u_double",
    ])
  })

  it("reassigns stale manual assignments when the option changes", () => {
    // Operator switched the room from DBL to TWN. The stale inventory
    // id is no longer in unitById, so the resolver re-derives both
    // placement and pricing for the selected option.
    const twnUnits: PricingAssignmentUnit[] = [
      unit({
        optionId: "opto_mol_twn",
        optionUnitId: "u_twn_room",
        unitCode: "twn_room",
        unitType: "room",
      }),
      unit({
        optionId: "opto_mol_twn",
        optionUnitId: "u_adult_twn",
        unitCode: "adult",
        unitType: "person",
        minAge: 18,
      }),
    ]
    const result = resolveBookingDraft({
      now: NOW,
      quantities: { u_twn_room: 1 },
      travelers: [
        traveler({ role: "lead", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
        traveler({ role: "adult", inventoryUnitId: "u_dbl_room", inventoryUnitSource: "manual" }),
      ],
      units: twnUnits,
    })

    expect(result.travelers[0]?.pricingUnitId).toBe("u_adult_twn")
    expect(result.travelers[1]?.pricingUnitId).toBe("u_adult_twn")
    expect(result.travelers[0]?.inventoryUnitId).toBe("u_twn_room")
    expect(result.travelers[1]?.inventoryUnitId).toBe("u_twn_room")
  })
})
