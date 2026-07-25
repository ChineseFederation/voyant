import { describe, expect, it } from "vitest"

import { findAlreadyPaidInstallmentMissingPaymentDate } from "../../src/components/booking-create-form-utils.js"
import {
  getBookableDepartureSlots,
  getOverCapacityInventoryAssignments,
  getSelectedSharedRoomUnitId,
  getTravelerAssignableStepperUnits,
  itemLinesToRows,
  productMatchesPickerSearch,
  validateBillingPersonContact,
} from "../../src/components/booking-create-utils.js"
import { clearSharedRoomValue } from "../../src/components/shared-room-section.js"

describe("booking create helpers", () => {
  it("requires a payment date when an installment is marked already paid", () => {
    expect(
      findAlreadyPaidInstallmentMissingPaymentDate({
        mode: "full",
        installments: [
          {
            id: "inst_1",
            amountCents: null,
            dueDate: "2026-06-15",
            alreadyPaid: true,
            paymentDate: null,
            paymentMethod: "bank_transfer",
            paymentReference: "",
          },
        ],
      }),
    ).toBe(0)

    expect(
      findAlreadyPaidInstallmentMissingPaymentDate({
        mode: "full",
        installments: [
          {
            id: "inst_1",
            amountCents: null,
            dueDate: "2026-06-15",
            alreadyPaid: true,
            paymentDate: "2026-06-10",
            paymentMethod: "bank_transfer",
            paymentReference: "",
          },
        ],
      }),
    ).toBeNull()
  })

  it("matches product picker search case-insensitively", () => {
    expect(
      productMatchesPickerSearch(
        {
          name: "City Break Istanbul cu autocarul",
          description: null,
          sellCurrency: "EUR",
        },
        "istanbul",
      ),
    ).toBe(true)
  })

  it("matches product picker search without diacritics", () => {
    expect(
      productMatchesPickerSearch(
        {
          name: "Weekend in Râșnov",
          description: null,
          sellCurrency: "EUR",
        },
        "rasnov",
      ),
    ).toBe(true)
  })

  it("keeps future open departures for the selected product option", () => {
    const result = getBookableDepartureSlots(
      [
        {
          id: "past-open",
          optionId: null,
          startsAt: "2026-04-18T08:00:00.000Z",
          status: "open",
        },
        {
          id: "global-open",
          optionId: null,
          startsAt: "2026-06-18T08:00:00.000Z",
          status: "open",
        },
        {
          id: "selected-option-open",
          optionId: "option_moldova",
          startsAt: "2026-10-22T08:00:00.000Z",
          status: "open",
        },
        {
          id: "other-option-open",
          optionId: "option_other",
          startsAt: "2026-11-01T08:00:00.000Z",
          status: "open",
        },
        {
          id: "closed",
          optionId: "option_moldova",
          startsAt: "2026-12-01T08:00:00.000Z",
          status: "closed",
        },
      ],
      {
        nowIso: "2026-05-16T00:00:00.000Z",
        optionId: "option_moldova",
      },
    )

    expect(result.map((slot) => slot.id)).toEqual(["global-open", "selected-option-open"])
  })

  it("clears shared-room draft state", () => {
    expect(clearSharedRoomValue()).toEqual({
      enabled: false,
      mode: "create",
      groupId: "",
      groupLabel: "",
    })
  })

  it("carries manual confirmed totals into unpriced item lines", () => {
    const result = itemLinesToRows(
      {
        optu_double: 2,
        optu_single: 1,
      },
      [
        { optionId: null, optionUnitId: "optu_double", unitName: "Double room" },
        { optionId: null, optionUnitId: "optu_single", unitName: "Single room" },
      ],
      {
        confirmedAmountCents: 10_001,
        lines: [],
      },
    )

    expect(result).toEqual([
      {
        optionId: null,
        optionUnitId: "optu_double",
        quantity: 2,
        title: "Double room",
        unitSellAmountCents: 3333,
        totalSellAmountCents: 6667,
      },
      {
        optionId: null,
        optionUnitId: "optu_single",
        quantity: 1,
        title: "Single room",
        unitSellAmountCents: 3334,
        totalSellAmountCents: 3334,
      },
    ])
  })

  it("preserves option ids on selected room unit lines", () => {
    const result = itemLinesToRows(
      {
        optu_double: 2,
        optu_single: 1,
      },
      [
        { optionId: "opto_dbl", optionUnitId: "optu_double", unitName: "DBL" },
        { optionId: "opto_sgl", optionUnitId: "optu_single", unitName: "SGL" },
      ],
      {
        confirmedAmountCents: 459_700,
        lines: [
          {
            unitId: "optu_double",
            label: "DBL",
            unitAmountCents: 139_900,
            totalAmountCents: 279_800,
          },
          {
            unitId: "optu_single",
            label: "SGL",
            unitAmountCents: 179_900,
            totalAmountCents: 179_900,
          },
        ],
      },
    )

    expect(result.map((line) => [line.optionId, line.optionUnitId, line.quantity])).toEqual([
      ["opto_dbl", "optu_double", 2],
      ["opto_sgl", "optu_single", 1],
    ])
  })

  it("uses stable traveler keys on selected unit lines when supplied", () => {
    const result = itemLinesToRows(
      { optu_double: 1 },
      [{ optionId: "opto_dbl", optionUnitId: "optu_double", unitName: "DBL" }],
      null,
      { optu_double: ["trav:second", "trav:first"] },
    )

    expect(result[0]).toMatchObject({
      clientLineKey: "unit:optu_double",
      travelerKeys: ["trav:second", "trav:first"],
    })
  })

  it("splits selected room lines by traveler pricing category", () => {
    const result = itemLinesToRows(
      { optu_double: 1 },
      [{ optionId: "opto_standard", optionUnitId: "optu_double", unitName: "Double" }],
      {
        confirmedAmountCents: 120000,
        lines: [
          {
            unitId: "optu_double",
            pricingCategoryId: "pcat_adult",
            label: "Double · Adult",
            quantity: 2,
            unitAmountCents: 48000,
            totalAmountCents: 96000,
          },
          {
            unitId: "optu_double",
            pricingCategoryId: "pcat_child_under6",
            label: "Double · Child under 6",
            quantity: 1,
            unitAmountCents: 24000,
            totalAmountCents: 24000,
          },
        ],
      },
      { optu_double: ["trav:adult1", "trav:adult2", "trav:child"] },
      {
        optu_double: {
          pcat_adult: ["trav:adult1", "trav:adult2"],
          pcat_child_under6: ["trav:child"],
        },
      },
    )

    expect(result).toEqual([
      {
        clientLineKey: "unit:optu_double:category:pcat_adult",
        optionId: "opto_standard",
        optionUnitId: "optu_double",
        pricingCategoryId: "pcat_adult",
        quantity: 2,
        title: "Double · Adult",
        unitSellAmountCents: 48000,
        totalSellAmountCents: 96000,
        travelerKeys: ["trav:adult1", "trav:adult2"],
      },
      {
        clientLineKey: "unit:optu_double:category:pcat_child_under6",
        optionId: "opto_standard",
        optionUnitId: "optu_double",
        pricingCategoryId: "pcat_child_under6",
        quantity: 1,
        title: "Double · Child under 6",
        unitSellAmountCents: 24000,
        totalSellAmountCents: 24000,
        travelerKeys: ["trav:child"],
      },
    ])
  })

  it("uses the selected unit for new shared-room groups", () => {
    expect(
      getSelectedSharedRoomUnitId({
        product_option: 0,
        optu_double: 1,
        optu_single: 0,
      }),
    ).toBe("optu_double")
  })

  it("accepts phone-only billing person contact", () => {
    expect(validateBillingPersonContact({ email: null, phone: " +40 700 000 000 " })).toBe("valid")
  })

  it("requires either email or phone for billing person contact", () => {
    expect(validateBillingPersonContact({ email: " ", phone: " " })).toBe("missing-contact")
  })

  it("rejects malformed billing person emails when provided", () => {
    expect(validateBillingPersonContact({ email: "traveler@example.com", phone: "+40 700" })).toBe(
      "invalid-email",
    )
  })

  it("keeps person units assignable for pure-person day-tour options", () => {
    const result = getTravelerAssignableStepperUnits([
      {
        optionId: "opto_day_tour",
        optionUnitId: "optu_adult",
        unitType: "person",
      },
      {
        optionId: "opto_day_tour",
        optionUnitId: "optu_child",
        unitType: "person",
      },
    ])

    expect(result.map((unit) => unit.optionUnitId)).toEqual(["optu_adult", "optu_child"])
  })

  it("keeps room units but hides person units when an option has room units", () => {
    const result = getTravelerAssignableStepperUnits([
      {
        optionId: "opto_hotel",
        optionUnitId: "optu_double",
        unitType: "room",
      },
      {
        optionId: "opto_hotel",
        optionUnitId: "optu_child",
        unitType: "person",
      },
      {
        optionId: "opto_excursion",
        optionUnitId: "optu_excursion_child",
        unitType: "person",
      },
    ])

    expect(result.map((unit) => unit.optionUnitId)).toEqual(["optu_double", "optu_excursion_child"])
  })

  it("detects travelers assigned beyond selected room capacity", () => {
    const result = getOverCapacityInventoryAssignments(
      [
        {
          optionUnitId: "optu_double",
          unitName: "Double",
          unitType: "room",
          occupancyMax: 2,
        },
      ],
      { optu_double: 1 },
      [
        { inventoryUnitId: "optu_double" },
        { inventoryUnitId: "optu_double" },
        { inventoryUnitId: "optu_double" },
      ],
    )

    expect(result).toEqual([
      {
        optionUnitId: "optu_double",
        unitName: "Double",
        assignedTravelers: 3,
        capacity: 2,
      },
    ])
  })
})
