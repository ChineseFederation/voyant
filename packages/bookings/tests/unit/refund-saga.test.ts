import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"
import {
  buildRefundBookingSaga,
  type RefundBookingDeps,
  type RefundBookingInput,
} from "../../src/sagas/refund-booking.js"
import { bookings as bookingsTable } from "../../src/schema.js"

/**
 * Lightweight in-memory fakes for the bits of `db` the saga touches.
 * Exhaustive DB-level behaviour is covered by the integration test;
 * this suite isolates the saga's orchestration semantics.
 */

interface FakeBooking {
  id: string
  bookingNumber: string
  status: "draft" | "on_hold" | "confirmed" | "in_progress" | "completed" | "expired" | "cancelled"
  sellAmountCents: number | null
}

function fakeDb(seedBooking: FakeBooking) {
  const dialect = new PgDialect()
  const state = {
    booking: { ...seedBooking },
    activityLog: [] as Array<Record<string, unknown>>,
    allocations: [] as Array<{
      id: string
      bookingId: string
      status: string
      quantity: number
      availabilitySlotId: string | null
    }>,
    executedSql: [] as string[],
  }

  // Drizzle's query builder is thenable + chainable. The fake returns
  // an object that both `.then()`s into the booking row array AND exposes
  // `.limit()` for the rare callers that chain it. Saga callers vary
  // (validate-state uses `.limit(1)`; release-inventory awaits .where()).
  const select = (selection?: unknown) => {
    void selection
    return {
      from(table: unknown) {
        // We disambiguate which "table" by the sql tag's _ field — but
        // since the test fakes all flow through the booking-shape branch,
        // we simply check whether the selection projects bookings columns.
        const isBookings = !!(!table || (table as { _?: { name?: string } })._?.name === undefined)
        const builder = {
          where(_cond: unknown) {
            const result: Array<unknown> = isBookings ? [state.booking] : state.allocations
            const promise = Promise.resolve(result)
            return Object.assign(promise, {
              limit: (_n: number) => Promise.resolve(result.slice(0, _n)),
            })
          },
        }
        return builder
      },
    }
  }

  const update = (table: unknown) => ({
    set: (patch: Record<string, unknown>) => ({
      where: async () => {
        // Only mutate `state.booking` when the update targets the
        // imported `bookings` table reference (compared by identity).
        // Updates to booking_items / booking_allocations / availability_slots
        // are no-ops in the fake — those side effects are exercised in the
        // integration tests, not here.
        if (table === bookingsTable) {
          Object.assign(state.booking, patch)
        }
      },
    }),
  })

  const insert = () => ({
    values: (row: Record<string, unknown>) => {
      state.activityLog.push(row)
      return Promise.resolve()
    },
  })

  const execute = async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const statement = dialect.sqlToQuery(query).sql
    state.executedSql.push(statement)
    return statement.includes('FROM "bookings"') ? [{ status: state.booking.status }] : []
  }

  // biome-ignore lint/suspicious/noExplicitAny: structural fake for tests -- owner: bookings; existing suppression is intentional pending typed cleanup.
  const transaction = async (fn: (tx: any) => Promise<unknown>) =>
    fn({ select, update, insert, execute })

  return {
    state,
    db: {
      select,
      update,
      insert,
      transaction,
      // biome-ignore lint/suspicious/noExplicitAny: tests cast as any -- owner: bookings; existing suppression is intentional pending typed cleanup.
    } as any,
  }
}

function makeDeps(
  overrides: Partial<RefundBookingDeps> & {
    booking: FakeBooking
  },
): {
  deps: RefundBookingDeps
  calls: Record<string, number>
  state: ReturnType<typeof fakeDb>["state"]
} {
  const fake = fakeDb(overrides.booking)
  const calls: Record<string, number> = {
    createCreditNote: 0,
    voidCreditNote: 0,
    reverseSupplierOffer: 0,
    notifyCustomer: 0,
    emit: 0,
  }
  const eventBus = {
    emit: vi.fn(async () => {
      calls.emit++
    }),
    subscribe: vi.fn(),
  }
  const baseDeps: RefundBookingDeps = {
    db: fake.db,
    eventBus,
    createCreditNote: async ({ amountCents }) => {
      calls.createCreditNote++
      return { creditNoteId: `cn_${calls.createCreditNote}_${amountCents}` }
    },
    voidCreditNote: async () => {
      calls.voidCreditNote++
    },
    reverseSupplierOffer: async () => {
      calls.reverseSupplierOffer++
    },
    notifyCustomer: async () => {
      calls.notifyCustomer++
    },
    ...overrides,
  }
  return { deps: baseDeps, calls, state: fake.state }
}

describe("refund-booking saga", () => {
  const baseInput: RefundBookingInput = {
    bookingId: "book_1",
    reason: "customer requested",
  }

  it("runs every step and transitions the booking to cancelled on the happy path", async () => {
    const { deps, calls, state } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "confirmed",
        sellAmountCents: 12000,
      },
    })

    const wf = buildRefundBookingSaga(deps)
    const result = await wf.run({ input: baseInput })

    expect(calls.createCreditNote).toBe(1)
    expect(calls.reverseSupplierOffer).toBe(1)
    expect(calls.emit).toBe(1)
    expect(calls.notifyCustomer).toBe(1)
    expect(calls.voidCreditNote).toBe(0)

    expect(state.booking.status).toBe("cancelled")
    expect(state.activityLog).toHaveLength(1)
    expect(state.executedSql[0]).toContain("pg_advisory_xact_lock")
    expect(state.executedSql[1]).toContain('FROM "bookings"')
    expect(state.executedSql[1]).toContain("FOR UPDATE")
    expect(result.results["create-credit-note"]).toEqual({
      creditNoteId: expect.stringMatching(/^cn_/),
      amountCents: 12000,
    })
  })

  it("partial refund — uses the input amount instead of the full sellAmountCents", async () => {
    const { deps, calls, state } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "confirmed",
        sellAmountCents: 12000,
      },
    })

    const wf = buildRefundBookingSaga(deps)
    await wf.run({ input: { ...baseInput, amountCents: 4000 } })

    expect(calls.createCreditNote).toBe(1)
    expect(state.booking.status).toBe("cancelled")
  })

  it("refunds an in_progress booking (mid-trip force-majeure)", async () => {
    const { deps, state } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "in_progress",
        sellAmountCents: 12000,
      },
    })
    const wf = buildRefundBookingSaga(deps)
    await wf.run({ input: baseInput })
    expect(state.booking.status).toBe("cancelled")
  })

  it("rejects refund on a draft booking and never touches downstream services", async () => {
    const { deps, calls, state } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "draft",
        sellAmountCents: 12000,
      },
    })
    const wf = buildRefundBookingSaga(deps)
    await expect(wf.run({ input: baseInput })).rejects.toThrow(/not refundable/)
    expect(calls.createCreditNote).toBe(0)
    expect(state.booking.status).toBe("draft")
  })

  it("rejects refund on a cancelled booking", async () => {
    const { deps, calls } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "cancelled",
        sellAmountCents: 12000,
      },
    })
    const wf = buildRefundBookingSaga(deps)
    await expect(wf.run({ input: baseInput })).rejects.toThrow(/not refundable/)
    expect(calls.createCreditNote).toBe(0)
  })

  it("zero-pay booking: skips credit-note creation but still cancels and emits", async () => {
    const { deps, calls, state } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "on_hold",
        sellAmountCents: 0,
      },
    })
    const wf = buildRefundBookingSaga(deps)
    const result = await wf.run({ input: baseInput })

    expect(calls.createCreditNote).toBe(0)
    expect(calls.emit).toBe(1)
    expect(state.booking.status).toBe("cancelled")
    expect(result.results["create-credit-note"]).toEqual({
      creditNoteId: null,
      amountCents: 0,
    })
  })

  it("compensates the credit note when reverse-supplier-offer fails", async () => {
    const { deps, calls, state } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "confirmed",
        sellAmountCents: 12000,
      },
      reverseSupplierOffer: async () => {
        throw new Error("supplier API down")
      },
    })
    const wf = buildRefundBookingSaga(deps)
    await expect(wf.run({ input: baseInput })).rejects.toThrow(/supplier API down/)

    // Credit note WAS created, then voided by compensation
    expect(calls.createCreditNote).toBe(1)
    expect(calls.voidCreditNote).toBe(1)
    // booking should NOT have transitioned to cancelled (transition step
    // never ran because the saga aborted earlier)
    expect(state.booking.status).toBe("confirmed")
  })

  it("notify failures do not roll back the saga", async () => {
    const { deps, calls, state } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "confirmed",
        sellAmountCents: 12000,
      },
      notifyCustomer: async () => {
        throw new Error("email service down")
      },
    })
    const wf = buildRefundBookingSaga(deps)
    // The saga catches notify failures and returns notified: false; it does NOT
    // throw, so the booking ends up cancelled.
    await wf.run({ input: baseInput })

    expect(state.booking.status).toBe("cancelled")
    expect(calls.voidCreditNote).toBe(0) // saga did NOT roll back
  })

  it("rejects partial refund > full sellAmountCents", async () => {
    const { deps, calls } = makeDeps({
      booking: {
        id: "book_1",
        bookingNumber: "BK-1",
        status: "confirmed",
        sellAmountCents: 10000,
      },
    })
    const wf = buildRefundBookingSaga(deps)
    await expect(wf.run({ input: { ...baseInput, amountCents: 99999 } })).rejects.toThrow(
      /out of range/,
    )
    expect(calls.createCreditNote).toBe(0)
  })
})
