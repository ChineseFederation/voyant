import { describe, expect, it } from "vitest"

import { insuranceUiEn } from "./i18n/en.js"
import { insuranceUiRo } from "./i18n/ro.js"

function leafPaths(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix]
  return Object.entries(value).flatMap(([key, child]) =>
    leafPaths(child, prefix ? `${prefix}.${key}` : key),
  )
}

function leafValues(value: unknown): string[] {
  if (typeof value === "string") return [value]
  if (typeof value !== "object" || value === null) return []
  return Object.values(value).flatMap(leafValues)
}

describe("insurance-react message catalogue", () => {
  it("has en and ro parity", () => {
    expect(leafPaths(insuranceUiRo).sort()).toEqual(leafPaths(insuranceUiEn).sort())
  })

  it("keeps ro ASCII, without diacritics", () => {
    // The existing convention across every package catalogue. A stray diacritic
    // is invisible in review and turns up as mojibake wherever the pipeline
    // loses an encoding.
    for (const value of leafValues(insuranceUiRo)) {
      // biome-ignore lint/suspicious/noControlCharactersInRegex: the range is the point
      expect(value, `non-ASCII in "${value}"`).toMatch(/^[\x00-\x7F]*$/)
    }
  })

  it("keeps every ICU placeholder identical between locales", () => {
    const placeholders = (value: string) => (value.match(/\{[a-zA-Z0-9_]+\}/g) ?? []).sort()
    const en = leafValues(insuranceUiEn)
    const ro = leafValues(insuranceUiRo)
    expect(ro).toHaveLength(en.length)
    for (const [index, value] of en.entries()) {
      expect(placeholders(ro[index] ?? "")).toEqual(placeholders(value))
    }
  })
})
