import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it } from "vitest"

import { lockBookingStatusConsequenceState } from "../../src/mcp-runtime.js"

describe("booking status consequence lock order", () => {
  it("locks Finance rows before the booking row during approved cancellation", async () => {
    const dialect = new PgDialect()
    const statements: string[] = []
    const db = {
      execute: async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
        const statement = dialect.sqlToQuery(query).sql
        statements.push(statement)
        if (statement.includes("to_regclass")) {
          return [
            {
              invoicesTable: "invoices",
              paymentSchedulesTable: "booking_payment_schedules",
            },
          ]
        }
        return []
      },
    }

    await lockBookingStatusConsequenceState(db as never, "booking_123", "cancel")

    expect(statements[0]).toContain("pg_advisory_xact_lock")
    expect(statements[1]).toContain("to_regclass")
    expect(statements[2]).toContain("FROM invoices")
    expect(statements[2]).toContain("FOR UPDATE")
    expect(statements[3]).toContain("FROM booking_payment_schedules")
    expect(statements[3]).toContain("FOR UPDATE")
    expect(statements[4]).toContain("FROM bookings")
    expect(statements[4]).toContain("FOR UPDATE")
    expect(statements[5]).toContain("FROM booking_allocations")
    expect(statements[5]).toContain("FOR UPDATE")
  })
})
