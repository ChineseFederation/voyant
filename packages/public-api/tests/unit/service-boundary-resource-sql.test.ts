import { BOOKING_RESOURCE_AVAILABILITY_STATUSES } from "@voyant-travel/bookings/status"
import { describe, expect, it } from "vitest"

import { getPublicApiSlotsResourceAvailability } from "../../src/service-boundary-resource-sql.js"

describe("getPublicApiSlotsResourceAvailability", () => {
  it("filters bookings with current resource availability statuses", async () => {
    let capturedQuery: unknown = null
    const db = {
      execute: async (query: unknown) => {
        capturedQuery = query
        return []
      },
    }

    const result = await getPublicApiSlotsResourceAvailability(db as never, ["slot_1"])

    expect(result).toEqual(new Map())

    const queryValues = flattenSqlQueryChunks(capturedQuery)
    for (const status of BOOKING_RESOURCE_AVAILABILITY_STATUSES) {
      expect(queryValues).toContain(status)
    }
    expect(queryValues).not.toContain("pending")
    expect(queryValues).not.toContain("checked_in")
  })
})

function flattenSqlQueryChunks(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => flattenSqlQueryChunks(entry))
  }

  if (typeof value === "object" && value !== null) {
    if ("queryChunks" in value) {
      return flattenSqlQueryChunks((value as { queryChunks: unknown }).queryChunks)
    }
    if ("value" in value) {
      return flattenSqlQueryChunks((value as { value: unknown }).value)
    }
  }

  return [value]
}
