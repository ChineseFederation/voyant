import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import {
  BookingFinanceInsertionClosedError,
  withBookingFinanceInsertionFence,
} from "../../src/booking-finance-fence.js"

describe("booking-finance insertion fence", () => {
  it("locks the advisory fence before the booking row and then writes", async () => {
    const statements: string[] = []
    const dialect = new PgDialect()
    const tx = {
      execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const statement = dialect.sqlToQuery(query).sql
        statements.push(statement)
        return statement.includes("FROM bookings") ? [{ status: "confirmed" }] : []
      }),
    }
    const db = {
      transaction: vi.fn(async (callback: (writer: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const write = vi.fn(async () => "written")

    await expect(
      withBookingFinanceInsertionFence(db as never, "book_123", write as never),
    ).resolves.toBe("written")

    expect(statements).toHaveLength(2)
    expect(statements[0]).toContain("pg_advisory_xact_lock")
    expect(statements[1]).toContain("FROM bookings")
    expect(statements[1]).toContain("FOR UPDATE")
    expect(write).toHaveBeenCalledWith(tx)
  })

  it.each([
    "cancelled",
    "expired",
  ])("rejects a %s booking while holding the booking row lock", async (status) => {
    const dialect = new PgDialect()
    const tx = {
      execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const statement = dialect.sqlToQuery(query).sql
        return statement.includes("FROM bookings") ? [{ status }] : []
      }),
    }
    const db = {
      transaction: vi.fn(async (callback: (writer: typeof tx) => Promise<unknown>) => callback(tx)),
    }
    const write = vi.fn()

    await expect(
      withBookingFinanceInsertionFence(db as never, "book_123", write as never),
    ).rejects.toBeInstanceOf(BookingFinanceInsertionClosedError)
    expect(write).not.toHaveBeenCalled()
  })
})
