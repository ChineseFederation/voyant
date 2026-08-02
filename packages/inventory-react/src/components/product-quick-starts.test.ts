import { describe, expect, it } from "vitest"

import { PRODUCT_QUICK_STARTS } from "./product-quick-starts.js"

describe("product quick starts", () => {
  it("models Boat Tour as an editable generic Tour preset", () => {
    const boatTour = PRODUCT_QUICK_STARTS.find((preset) => preset.id === "boatTour")

    expect(boatTour).toEqual({
      id: "boatTour",
      familyCode: "tour",
      defaults: {
        bookingMode: "date_time",
        capacityMode: "limited",
        productSubtypeCode: "boat-tour",
        durationMinutes: 60,
      },
    })
    expect(boatTour?.familyCode).not.toBe("activity")
  })

  it("keeps format presets separate from booking mechanics", () => {
    const familyCodes = Object.fromEntries(
      PRODUCT_QUICK_STARTS.map((preset) => [preset.id, preset.familyCode]),
    )
    expect(familyCodes).toMatchObject({
      dayTour: "tour",
      multiDayTour: "tour",
      timedActivity: "activity",
      attractionAdmission: "attraction",
      transfer: "transportation",
    })
  })
})
