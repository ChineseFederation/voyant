import { describe, expect, it } from "vitest"

import { catalogUiEn } from "../i18n/en.js"
import { durationMeta } from "./catalog-page-cards.js"
import { resolveScheduledScopeLocks } from "./scheduled-catalog-page.js"

describe("product family catalog views", () => {
  it("locks family and subtype independently from duration and supply mechanics", () => {
    expect(resolveScheduledScopeLocks("tours")).toEqual({
      lockedFacets: { familyCode: ["tour"] },
      lockedRanges: {},
    })
    expect(resolveScheduledScopeLocks("boat-tours")).toEqual({
      lockedFacets: { familyCode: ["tour"], subtypeCode: ["boat-tour"] },
      lockedRanges: {},
    })
    expect(resolveScheduledScopeLocks("activities").lockedFacets).toEqual({
      familyCode: ["activity"],
    })
  })

  it("shows a sixty-minute Boat Tour as 60 min rather than one day", () => {
    expect(durationMeta({ durationMinutes: 60, durationDays: 1 }, catalogUiEn.catalogPage)).toBe(
      "60 min",
    )
  })
})
