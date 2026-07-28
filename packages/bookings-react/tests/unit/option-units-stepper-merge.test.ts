import { describe, expect, it } from "vitest"

import {
  buildOptionUnitsStepperRows,
  mergeStepperUnits,
  type OptionUnitsStepperUnit,
  optionRowHasInvalidUnit,
  resolveOptionRemainingLabel,
  resolveSlotOptionId,
} from "../../src/components/option-units-stepper-section.js"

function makeRow(
  optionId: string | null,
  optionUnitId: string,
  remaining: number | null,
): OptionUnitsStepperUnit {
  return {
    optionId,
    optionUnitId,
    unitName: `${optionId ?? "none"}-${optionUnitId}`,
    initial: remaining,
    reserved: 0,
    remaining,
    occupancyMax: null,
  }
}

describe("resolveSlotOptionId", () => {
  it("returns the option that owns the first matched slot unit", () => {
    const map = new Map([
      ["ou_sgl", "popt_SGL"],
      ["ou_dbl", "popt_DBL"],
    ])
    const slotRows = [{ optionUnitId: "ou_sgl" }, { optionUnitId: "ou_dbl" }]

    expect(resolveSlotOptionId(slotRows, map, null)).toBe("popt_SGL")
  })

  it("falls back to the supplied fallback when no slot row maps to a known option", () => {
    const map = new Map([["ou_sgl", "popt_SGL"]])

    expect(resolveSlotOptionId([], map, "popt_DBL")).toBe("popt_DBL")
    expect(resolveSlotOptionId([{ optionUnitId: "ou_unknown" }], map, "popt_DBL")).toBe("popt_DBL")
  })

  it("returns null when neither the slot rows nor the fallback resolve", () => {
    expect(resolveSlotOptionId([], new Map(), null)).toBeNull()
  })
})

describe("mergeStepperUnits", () => {
  const sgl = makeRow("popt_SGL", "ou_sgl", 2)
  const dbl = makeRow("popt_DBL", "ou_dbl", 5)
  const twn = makeRow("popt_TWN", "ou_twn", 3)
  const tpl = makeRow("popt_TPL", "ou_tpl", 1)

  it("issue #960: keeps slot rows for the slot's option and adds the other product options", () => {
    // Slot is bound to popt_SGL — server returns slot-specific rows for SGL only.
    const slotRows = [{ ...sgl, remaining: 2 }]
    const productRows = [
      // product-level row for SGL with its max_quantity
      { ...sgl, remaining: 4 },
      dbl,
      twn,
      tpl,
    ]

    const merged = mergeStepperUnits(slotRows, productRows, "popt_SGL", true)

    expect(merged).toHaveLength(4)
    // SGL row is the slot row (real-time remaining = 2), not the product-level fallback (4).
    const sglRow = merged.find((row) => row.optionId === "popt_SGL")
    expect(sglRow?.remaining).toBe(2)
    // The other product options surface so the operator can pick DBL/TWN/TPL too.
    expect(merged.map((row) => row.optionId)).toEqual([
      "popt_SGL",
      "popt_DBL",
      "popt_TWN",
      "popt_TPL",
    ])
  })

  it("falls back to product-level rows when there is no slot yet", () => {
    const productRows = [dbl, twn]

    expect(mergeStepperUnits([], productRows, null, false)).toEqual(productRows)
  })

  it("falls back to product-level rows for product-level slots (no option_id)", () => {
    const productRows = [sgl, dbl]

    // hasSlot = true but slotOptionId resolved to null → product-level slot.
    expect(mergeStepperUnits([], productRows, null, true)).toEqual(productRows)
  })

  it("falls back to product-level rows when the slot endpoint hasn't returned units yet", () => {
    const productRows = [sgl, dbl]

    expect(mergeStepperUnits([], productRows, "popt_SGL", true)).toEqual(productRows)
  })
})

describe("buildOptionUnitsStepperRows", () => {
  it("keeps both inventory and person controls for a mixed supplier option", () => {
    const rows = buildOptionUnitsStepperRows(
      [
        { ...makeRow("family", "double-room", 3), unitName: "Double room", unitType: "room" },
        { ...makeRow("family", "adult-seat", 7), unitName: "Adult seat", unitType: "person" },
      ],
      [{ id: "family", name: "Family package" }],
    )

    expect(rows.map((row) => row.optionName)).toEqual(["Double room", "Adult seat"])
    expect(rows.map((row) => row.primary.optionUnitId)).toEqual(["double-room", "adult-seat"])
  })
})

describe("resolveOptionRemainingLabel", () => {
  it("uses the slot-capacity label for uncapped person units on finite slots", () => {
    expect(
      resolveOptionRemainingLabel({
        totalRemaining: null,
        units: [{ unitType: "person" }],
        slotHasFiniteCapacity: true,
        remaining: "left",
        unlimited: "unlimited",
        fillsSlotCapacity: "fills slot capacity",
      }),
    ).toBe("fills slot capacity")
  })

  it("keeps unlimited for uncapped room units", () => {
    expect(
      resolveOptionRemainingLabel({
        totalRemaining: null,
        units: [{ unitType: "room" }],
        slotHasFiniteCapacity: true,
        remaining: "left",
        unlimited: "unlimited",
        fillsSlotCapacity: "fills slot capacity",
      }),
    ).toBe("unlimited")
  })

  it("shows explicit remaining counts when option units are capped", () => {
    expect(
      resolveOptionRemainingLabel({
        totalRemaining: 43,
        units: [{ unitType: "person" }],
        slotHasFiniteCapacity: true,
        remaining: "left",
        unlimited: "unlimited",
        fillsSlotCapacity: "fills slot capacity",
      }),
    ).toBe("43 left")
  })
})

describe("optionRowHasInvalidUnit", () => {
  it("matches any unit in a grouped option row, not just the primary unit", () => {
    expect(
      optionRowHasInvalidUnit(
        [{ optionUnitId: "adult" }, { optionUnitId: "child" }, { optionUnitId: "infant" }],
        new Set(["child"]),
      ),
    ).toBe(true)
  })

  it("returns false when no grouped unit is affected", () => {
    expect(optionRowHasInvalidUnit([{ optionUnitId: "adult" }], new Set(["single"]))).toBe(false)
  })
})
