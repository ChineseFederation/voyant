import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import {
  assertMonthlyBookingLimitAvailable,
  BookingMonthlyLimitConfigurationError,
  BookingMonthlyLimitReachedError,
  resolveMonthlyBookingLimit,
} from "../../src/booking-plan-limit.js"

describe("monthly booking plan limit", () => {
  it("keeps bookings unlimited when the binding is unset", () => {
    expect(resolveMonthlyBookingLimit({})).toBeNull()
    expect(resolveMonthlyBookingLimit({ VOYANT_BOOKINGS_MONTHLY_LIMIT: "" })).toBeNull()
  })

  it("accepts only a positive integer binding", () => {
    expect(resolveMonthlyBookingLimit({ VOYANT_BOOKINGS_MONTHLY_LIMIT: "100" })).toBe(100)
    expect(resolveMonthlyBookingLimit({ VOYANT_BOOKINGS_MONTHLY_LIMIT: 25 })).toBe(25)

    for (const value of ["0", "-1", "1.5", "not-a-number", true]) {
      expect(() => resolveMonthlyBookingLimit({ VOYANT_BOOKINGS_MONTHLY_LIMIT: value })).toThrow(
        BookingMonthlyLimitConfigurationError,
      )
    }
  })

  it("does not touch the database for an unlimited tenant", async () => {
    const execute = vi.fn()
    await assertMonthlyBookingLimitAvailable({ execute } as never, null)
    expect(execute).not.toHaveBeenCalled()
  })

  it("serializes quota consumers before reading current-month acceptances", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          current: 99,
          period_start: "2026-07-01 00:00:00+00",
          period_end: "2026-08-01 00:00:00+00",
        },
      ])

    await expect(
      assertMonthlyBookingLimitAvailable({ execute } as never, 100, {
        excludeBookingId: "book_replay",
      }),
    ).resolves.toBeUndefined()

    const dialect = new PgDialect()
    const lock = dialect.sqlToQuery(execute.mock.calls[0]?.[0])
    const usage = dialect.sqlToQuery(execute.mock.calls[1]?.[0])
    expect(lock.sql).toContain("pg_advisory_xact_lock")
    expect(usage.sql).toContain(
      "accepted_at >= date_trunc('month', CURRENT_TIMESTAMP AT TIME ZONE 'UTC')",
    )
    expect(usage.sql).toContain("id <>")
    expect(usage.params).toContain("book_replay")
  })

  it("returns an actionable typed error once the allowance is exhausted", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          current: 100,
          period_start: "2026-07-01 00:00:00+00",
          period_end: "2026-08-01 00:00:00+00",
        },
      ])

    const error = await assertMonthlyBookingLimitAvailable({ execute } as never, 100).catch(
      (error: unknown) => error,
    )
    expect(error).toBeInstanceOf(BookingMonthlyLimitReachedError)
    expect(error).toMatchObject({
      code: "monthly_booking_limit_reached",
      details: {
        limit: 100,
        current: 100,
        periodStart: "2026-07-01 00:00:00+00",
        periodEnd: "2026-08-01 00:00:00+00",
      },
    })
    expect((error as Error).message).toContain("Upgrade the plan")
  })
})
