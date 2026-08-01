import { describe, expect, it } from "vitest"

import {
  formatAddress,
  isManagedBySource,
  normalizeContactValue,
  paginate,
  toDateOrNull,
  toNullableTrimmed,
} from "../../src/service/helpers.js"
import {
  ProposalVersionConflictError,
  resolveProposalVersionSnapshotCurrency,
} from "../../src/service/proposal-versions.js"

describe("paginate", () => {
  it("resolves rows and count, computes total", async () => {
    const result = await paginate(
      Promise.resolve([{ id: "1" }, { id: "2" }]),
      Promise.resolve([{ count: 10 }]),
      50,
      0,
    )

    expect(result.data).toEqual([{ id: "1" }, { id: "2" }])
    expect(result.total).toBe(10)
    expect(result.limit).toBe(50)
    expect(result.offset).toBe(0)
  })

  it("returns total 0 when count result is empty", async () => {
    const result = await paginate(Promise.resolve([]), Promise.resolve([]), 50, 0)

    expect(result.data).toEqual([])
    expect(result.total).toBe(0)
  })

  it("passes through limit and offset", async () => {
    const result = await paginate(Promise.resolve([]), Promise.resolve([{ count: 0 }]), 25, 100)

    expect(result.limit).toBe(25)
    expect(result.offset).toBe(100)
  })
})

describe("resolveProposalVersionSnapshotCurrency", () => {
  it("uses the only explicit product currency over a missing proposal currency", () => {
    expect(resolveProposalVersionSnapshotCurrency(null, [null, "EUR"])).toBe("EUR")
  })

  it("falls back to the proposal currency when products do not carry currency", () => {
    expect(resolveProposalVersionSnapshotCurrency("GBP", [null, undefined, ""])).toBe("GBP")
  })

  it("defaults to USD when neither proposal nor products carry currency", () => {
    expect(resolveProposalVersionSnapshotCurrency(null, [])).toBe("USD")
  })

  it("rejects mixed explicit product currencies", () => {
    expect(() => resolveProposalVersionSnapshotCurrency("USD", ["EUR", "GBP"])).toThrow(
      ProposalVersionConflictError,
    )
  })
})

describe("toDateOrNull", () => {
  it("returns a Date for a valid string", () => {
    const result = toDateOrNull("2024-06-15T12:00:00Z")
    expect(result).toBeInstanceOf(Date)
    expect(result?.toISOString()).toBe("2024-06-15T12:00:00.000Z")
  })

  it("returns null for null", () => {
    expect(toDateOrNull(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(toDateOrNull(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(toDateOrNull("")).toBeNull()
  })
})

describe("normalizeContactValue", () => {
  it("lowercases and trims email", () => {
    expect(normalizeContactValue("email", "  Alice@Example.COM  ")).toBe("alice@example.com")
  })

  it("lowercases and trims website", () => {
    expect(normalizeContactValue("website", "  HTTPS://Example.COM  ")).toBe("https://example.com")
  })

  it("trims but preserves case for phone", () => {
    expect(normalizeContactValue("phone", "  +1 (555) 123-4567  ")).toBe("+1 (555) 123-4567")
  })
})

describe("isManagedBySource", () => {
  it("returns true when managedBy matches source", () => {
    expect(
      isManagedBySource({ managedBy: "relationships.person.base" }, "relationships.person.base"),
    ).toBe(true)
  })

  it("returns false when managedBy does not match", () => {
    expect(isManagedBySource({ managedBy: "other" }, "relationships.person.base")).toBe(false)
  })

  it("returns false for null metadata", () => {
    expect(isManagedBySource(null, "relationships.person.base")).toBe(false)
  })

  it("returns false for undefined metadata", () => {
    expect(isManagedBySource(undefined, "relationships.person.base")).toBe(false)
  })

  it("returns false when managedBy key is absent", () => {
    expect(isManagedBySource({}, "relationships.person.base")).toBe(false)
  })
})

describe("toNullableTrimmed", () => {
  it("trims whitespace", () => {
    expect(toNullableTrimmed("  hello  ")).toBe("hello")
  })

  it("returns null for null", () => {
    expect(toNullableTrimmed(null)).toBeNull()
  })

  it("returns null for undefined", () => {
    expect(toNullableTrimmed(undefined)).toBeNull()
  })

  it("returns null for empty string", () => {
    expect(toNullableTrimmed("")).toBeNull()
  })

  it("returns null for whitespace-only string", () => {
    expect(toNullableTrimmed("   ")).toBeNull()
  })
})

describe("formatAddress", () => {
  const emptyAddress = {
    fullText: null,
    line1: null,
    line2: null,
    city: null,
    region: null,
    postalCode: null,
    country: null,
  }

  it("returns fullText when present", () => {
    expect(formatAddress({ ...emptyAddress, fullText: "123 Main St, Springfield" })).toBe(
      "123 Main St, Springfield",
    )
  })

  it("ignores other fields when fullText is present", () => {
    expect(
      formatAddress({
        fullText: "Full address",
        line1: "Line 1",
        line2: null,
        city: "City",
        region: null,
        postalCode: null,
        country: "US",
      }),
    ).toBe("Full address")
  })

  it("joins available parts with comma separator", () => {
    expect(
      formatAddress({
        ...emptyAddress,
        line1: "123 Main St",
        city: "Springfield",
        region: "IL",
        postalCode: "62701",
        country: "US",
      }),
    ).toBe("123 Main St, Springfield, IL, 62701, US")
  })

  it("skips null parts", () => {
    expect(
      formatAddress({
        ...emptyAddress,
        city: "Paris",
        country: "FR",
      }),
    ).toBe("Paris, FR")
  })

  it("returns null when all parts are null", () => {
    expect(formatAddress(emptyAddress)).toBeNull()
  })

  it("includes line2 when present", () => {
    expect(
      formatAddress({
        ...emptyAddress,
        line1: "123 Main St",
        line2: "Suite 200",
        city: "Springfield",
      }),
    ).toBe("123 Main St, Suite 200, Springfield")
  })
})
