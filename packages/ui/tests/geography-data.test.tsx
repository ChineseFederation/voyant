import { describe, expect, it } from "vitest"

import { countries, currencies } from "../src/data/geography.generated.js"

describe("generated UI geography data", () => {
  it("preserves the canonical country projection and source ordering", () => {
    expect(countries).toHaveLength(243)
    expect(countries[0]).toEqual({ name: "Afghanistan", code: "AF" })
    expect(countries.at(-1)).toEqual({ name: "Zimbabwe", code: "ZW" })
    expect(countries).toContainEqual({ name: "Romania", code: "RO" })
  })

  it("preserves the currency fields consumed by CurrencyCombobox", () => {
    expect(Object.keys(currencies)).toHaveLength(112)
    expect(currencies.EUR).toEqual({ code: "EUR", name: "Euro", symbol: "€" })
    expect(currencies.USD).toEqual({ code: "USD", name: "US Dollar", symbol: "$" })
    expect(Object.keys(currencies).at(-1)).toBe("CVE")
  })
})
