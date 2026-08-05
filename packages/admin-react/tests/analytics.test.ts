import { describe, expect, it } from "vitest"

import { adminErrorCode, adminResourceType, adminSearchResultCount } from "../src/analytics.js"

const operation = (id: string) => ({ id }) as Parameters<typeof adminResourceType>[0]

describe("adminResourceType", () => {
  it("drops the verb so a resource is one dimension across its whole verb set", () => {
    expect(adminResourceType(operation("bookings.cancel"))).toBe("bookings")
    expect(adminResourceType(operation("bookings.list"))).toBe("bookings")
    expect(adminResourceType(operation("finance.invoices.issue"))).toBe("finance.invoices")
  })

  it("keeps an id that has no verb segment", () => {
    expect(adminResourceType(operation("capabilities"))).toBe("capabilities")
  })
})

describe("adminErrorCode", () => {
  it("prefers the server code, then the status", () => {
    expect(adminErrorCode({ code: "booking_not_cancellable", status: 409 })).toBe(
      "booking_not_cancellable",
    )
    expect(adminErrorCode({ status: 403 })).toBe("http_403")
  })

  it("never returns the message, which is copy and not a code", () => {
    const error = new TypeError("Failed to fetch https://ops.example.com/v1/admin/bookings/bkg_1")
    expect(adminErrorCode(error)).toBe("TypeError")
    expect(adminErrorCode("boom")).toBe("unknown")
    expect(adminErrorCode(null)).toBe("unknown")
  })
})

describe("adminSearchResultCount", () => {
  it("counts a paginated search from its total", () => {
    expect(adminSearchResultCount({ search: "smith" }, { data: [1, 2], total: 57 })).toBe(57)
  })

  it("falls back to the returned page length, then to a bare array", () => {
    expect(adminSearchResultCount({ q: "smith" }, { data: [1, 2] })).toBe(2)
    expect(adminSearchResultCount({ query: "smith" }, [1, 2, 3])).toBe(3)
  })

  it("reports zero results, which is the product-gap signal", () => {
    expect(adminSearchResultCount({ search: "kayaking in kraków" }, { data: [], total: 0 })).toBe(0)
  })

  it("is not a search without a term, so a plain list is not counted", () => {
    expect(adminSearchResultCount({ limit: 50 }, { data: [1], total: 1 })).toBeNull()
    expect(adminSearchResultCount({ search: "   " }, { data: [1], total: 1 })).toBeNull()
    expect(adminSearchResultCount(undefined, { data: [1], total: 1 })).toBeNull()
  })
})
