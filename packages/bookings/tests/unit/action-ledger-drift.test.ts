import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { __test__, buildBookingActionLedgerDriftQueries } from "../../src/action-ledger-drift.js"

describe("booking action ledger drift checks", () => {
  it("builds drift queries for operator-owned Booking transitions", () => {
    const queries = buildBookingActionLedgerDriftQueries({
      createdAtFrom: "2026-05-17T00:00:00.000Z",
      sampleLimit: 5,
    })
    const dialect = new PgDialect()
    const cancelled = dialect.sqlToQuery(queries.booking_cancelled)
    const completed = dialect.sqlToQuery(queries.booking_completed)

    expect(cancelled.sql).toContain('"bookings"')
    expect(cancelled.sql).toContain('"action_ledger_entries"')
    expect(cancelled.sql).toContain('"bookings"."cancelled_at" IS NOT NULL')
    expect(cancelled.params).toEqual(
      expect.arrayContaining(["booking_cancelled", "booking.status.cancel", "booking"]),
    )

    expect(completed.sql).toContain('"bookings"."completed_at" IS NOT NULL')
    expect(completed.params).toEqual(
      expect.arrayContaining(["booking_completed", "booking.status.complete", "booking"]),
    )
  })

  it("builds drift queries for booking items, travelers, and travel details", () => {
    const queries = buildBookingActionLedgerDriftQueries({ sampleLimit: 2 })
    const dialect = new PgDialect()
    const item = dialect.sqlToQuery(queries.booking_item)
    const traveler = dialect.sqlToQuery(queries.booking_traveler)
    const travelDetails = dialect.sqlToQuery(queries.booking_traveler_travel_details)

    expect(item.sql).toContain('"booking_items"')
    expect(item.params).toEqual(expect.arrayContaining(["booking.item.create", "booking_item"]))

    expect(traveler.sql).toContain('"booking_travelers"')
    expect(traveler.params).toEqual(
      expect.arrayContaining([
        "booking.traveler.create",
        "booking.traveler_with_travel_details.create",
        "booking_traveler",
      ]),
    )

    expect(travelDetails.sql).toContain('"booking_traveler_travel_details"')
    expect(travelDetails.sql).toContain('"booking_traveler_travel_details"."traveler_id"')
    expect(travelDetails.params).toEqual(
      expect.arrayContaining([
        "booking.traveler_with_travel_details.create",
        "booking.traveler_travel_details.update",
        "booking_traveler",
      ]),
    )
  })

  it("clamps the sample limit and normalizes rows", () => {
    const query = new PgDialect().sqlToQuery(
      buildBookingActionLedgerDriftQueries({ sampleLimit: 999 }).booking_cancelled,
    )

    expect(query.params).toContain(100)
    expect(
      __test__.normalizeRow({
        check: "booking_traveler",
        missing_count: "2",
        sample_ids: ["bptr_2", "bptr_1"],
      }),
    ).toEqual({
      check: "booking_traveler",
      missingCount: 2,
      sampleIds: ["bptr_2", "bptr_1"],
    })
  })

  // voyant#4696: a `Date` interpolated into a `sql` fragment reaches the driver
  // unencoded and postgres-js throws while binding it, so the check crashed for
  // every caller that narrowed by date. Building the query proves nothing on
  // its own — what the parameter *is* decides whether the query can be sent.
  it("binds createdAtFrom as an encoded timestamp rather than a Date", () => {
    const dialect = new PgDialect()
    for (const value of [new Date("2026-05-17T00:00:00.000Z"), "2026-05-17T00:00:00.000Z"]) {
      const query = dialect.sqlToQuery(
        buildBookingActionLedgerDriftQueries({ createdAtFrom: value }).booking_cancelled,
      )
      expect(query.params).toContain("2026-05-17T00:00:00.000Z")
      expect(query.params.some((param) => param instanceof Date)).toBe(false)
    }
  })

  it("rejects invalid createdAtFrom values while building queries", () => {
    expect(() => buildBookingActionLedgerDriftQueries({ createdAtFrom: "not-a-date" })).toThrow(
      "createdAtFrom must be a valid date",
    )
  })
})
