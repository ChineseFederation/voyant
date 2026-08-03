import { describe, expect, it } from "vitest"

import {
  buildPaidBookingCancellationSettlementNote,
  recordPaidBookingCancellationSettlement,
} from "../../src/booking-lifecycle.js"

describe("recordPaidBookingCancellationSettlement", () => {
  it("creates finance notes for paid invoices and returns settlement metadata", async () => {
    const db = createFakeDb([
      {
        id: "inv_1",
        invoiceNumber: "INV-1",
        currency: "GBP",
        paidCents: 12000,
        status: "paid",
      },
      {
        id: "inv_2",
        invoiceNumber: "INV-2",
        currency: "GBP",
        paidCents: 3000,
        status: "partially_paid",
      },
    ])

    const settlement = await recordPaidBookingCancellationSettlement(db as never, {
      bookingId: "book_1",
      bookingNumber: "BK-1",
      previousStatus: "confirmed",
      reason: "Client requested",
      actorId: "user_1",
    })

    expect(settlement).toMatchObject({
      status: "action_required",
      kind: "paid_booking_cancellation",
      invoiceIds: ["inv_1", "inv_2"],
      invoiceNumbers: ["INV-1", "INV-2"],
      paidByCurrency: { GBP: 15000 },
    })
    expect(db.insertedNotes).toHaveLength(2)
    expect(db.insertedNotes[0]).toMatchObject({ invoiceId: "inv_1", authorId: "user_1" })
    expect(db.insertedNotes[0]?.content).toContain("Booking BK-1 was cancelled from confirmed.")
    expect(db.insertedNotes[0]?.content).toContain("Cancellation reason: Client requested")
    expect(db.insertedNotes[0]?.content).toContain("Invoice paid amount: 12000 GBP cents.")
  })

  it("does not create notes when the booking has no paid invoices", async () => {
    const db = createFakeDb([])
    const settlement = await recordPaidBookingCancellationSettlement(db as never, {
      bookingId: "book_1",
      bookingNumber: "BK-1",
      previousStatus: "confirmed",
      reason: null,
      actorId: "user_1",
    })
    expect(settlement).toBeNull()
    expect(db.insertedNotes).toEqual([])
  })

  it("builds notes with and without cancellation reasons", () => {
    expect(
      buildPaidBookingCancellationSettlementNote({
        bookingId: "book_1",
        bookingNumber: "BK-1",
        previousStatus: "confirmed",
        reason: "Card capture failed",
        actorId: "user_1",
      }),
    ).toContain("Booking BK-1 was cancelled from confirmed.")
    expect(
      buildPaidBookingCancellationSettlementNote({
        bookingId: "book_1",
        bookingNumber: "BK-1",
        previousStatus: "confirmed",
        reason: null,
        actorId: "user_1",
      }),
    ).not.toContain("Cancellation reason")
  })
})

interface FakePaidInvoice {
  id: string
  invoiceNumber: string
  currency: string
  paidCents: number
  status: string
}

function createFakeDb(paidInvoices: FakePaidInvoice[]) {
  const insertedNotes: Array<Record<string, unknown>> = []
  return {
    insertedNotes,
    select: () => ({ from: () => ({ where: async () => paidInvoices }) }),
    insert: () => ({
      values(row: Record<string, unknown>) {
        insertedNotes.push(row)
        return { returning: async () => [{ id: `fnote_${insertedNotes.length}` }] }
      },
    }),
  }
}
