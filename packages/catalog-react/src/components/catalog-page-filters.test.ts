import { describe, expect, it } from "vitest"

import { catalogUiEn } from "../i18n/en.js"
import { makeProductFilters } from "./catalog-page-config.js"
import { resolveScheduledScopeLocks } from "./scheduled-catalog-page.js"

const filters = makeProductFilters((id) => String(id), catalogUiEn.catalogPage, "en-GB")
const fieldNames = filters.map((field) => field.field)

describe("product filter rail fields", () => {
  it("does not offer booking mode, which is a derived integration mechanic", () => {
    // `bookingMode` is derived from the supply model (ADR-0010) rather than
    // authored, and browsing by it asks the operator to think in the
    // platform's terms instead of their catalogue's.
    expect(fieldNames).not.toContain("bookingMode")
  })

  it("still offers subtype, which is how a Boat Tour is found inside Tours", () => {
    expect(fieldNames).toContain("subtypeCode")
  })

  it("offers family, for the surfaces that do not already pin one", () => {
    // The all-products surface locks nothing, so family is a real choice there;
    // a family view hides it via `hiddenFilterFields` instead of dropping it
    // from the declaration.
    expect(fieldNames).toContain("familyCode")
  })
})

describe("a family surface hides the facet it pins", () => {
  it("hides exactly the locked facets and nothing else", () => {
    const { lockedFacets } = resolveScheduledScopeLocks("tours")
    const hidden = new Set(Object.keys(lockedFacets))
    const shown = filters.filter((field) => !hidden.has(field.field)).map((f) => f.field)

    expect(hidden).toEqual(new Set(["familyCode"]))
    expect(shown).not.toContain("familyCode")
    // Everything else survives — hiding the lock must not thin out the rail.
    expect(shown).toHaveLength(fieldNames.length - 1)
    expect(shown).toContain("subtypeCode")
    expect(shown).toContain("status")
  })
})
