import { describe, expect, it } from "vitest"

import { formatReportValue, toNumber } from "./format.js"

describe("formatReportValue", () => {
  it("renders a placeholder for null/undefined", () => {
    expect(formatReportValue(null, "number")).toBe("—")
    expect(formatReportValue(undefined, "string")).toBe("—")
  })

  it("formats numbers and integers with the locale grouping", () => {
    expect(formatReportValue(1234.5, "number", { locale: "en-US" })).toBe("1,234.5")
    expect(formatReportValue("2500", "integer", { locale: "en-US" })).toBe("2,500")
  })

  it("formats currency without rescaling the value", () => {
    expect(formatReportValue(1200, "currency", { locale: "en-US", currency: "USD" })).toBe(
      "$1,200.00",
    )
  })

  it("formats explicitly declared minor-unit currencies", () => {
    expect(
      formatReportValue(12_345, "currency", {
        currency: "EUR",
        locale: "en-IE",
        minorUnit: true,
      }),
    ).toContain("123.45")
  })

  it("never invents a currency symbol when none was declared", () => {
    // 351533 minor units is a balance of 3,515.33 — rendering "$351,533.00" is
    // wrong twice over, and the symbol is what makes it believable.
    expect(formatReportValue(351_533, "currency", { locale: "en-US" })).toBe("351,533")
    expect(formatReportValue(351_533, "currency", { locale: "en-US", minorUnit: true })).toBe(
      "3,515.33",
    )
  })

  it("formats booleans, dates, and json", () => {
    expect(formatReportValue(true, "boolean")).toBe("Yes")
    expect(formatReportValue(false, "boolean")).toBe("No")
    expect(
      formatReportValue("2026-07-18T00:00:00.000Z", "date", { locale: "en-US", timeZone: "UTC" }),
    ).toContain("2026")
    expect(formatReportValue({ a: 1 }, "json")).toBe('{"a":1}')
  })

  it("falls back to the raw string for unparseable typed values", () => {
    expect(formatReportValue("not-a-number", "number")).toBe("not-a-number")
    expect(formatReportValue("not-a-date", "date")).toBe("not-a-date")
  })
})

describe("toNumber", () => {
  it("coerces finite numbers and numeric strings, rejecting others", () => {
    expect(toNumber(42)).toBe(42)
    expect(toNumber("3.14")).toBe(3.14)
    expect(toNumber("")).toBeUndefined()
    expect(toNumber("abc")).toBeUndefined()
    expect(toNumber(Number.POSITIVE_INFINITY)).toBeUndefined()
    expect(toNumber(null)).toBeUndefined()
  })
})
