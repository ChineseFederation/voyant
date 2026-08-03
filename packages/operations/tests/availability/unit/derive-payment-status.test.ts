import { describe, expect, it } from "vitest"

import {
  type BookingRow,
  derivePaymentStatus,
} from "../../../src/availability/service-allocation.js"

function bookingRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: "book_1",
    booking_number: "B-001",
    status: "confirmed",
    created_at: "2026-05-22T08:00:00.000Z",
    contact_first_name: null,
    contact_last_name: null,
    contact_email: null,
    contact_phone: null,
    sell_currency: "EUR",
    pax: 2,
    sell_amount_cents: 10_000,
    invoice_total_cents: 0,
    invoice_paid_cents: 0,
    schedules_paid_cents: 0,
    ...overrides,
  }
}

describe("derivePaymentStatus", () => {
  it("returns paid for a free booking regardless of invoice/schedule state", () => {
    expect(derivePaymentStatus(bookingRow({ sell_amount_cents: 0 }))).toBe("paid")
    expect(derivePaymentStatus(bookingRow({ sell_amount_cents: null }))).toBe("paid")
  })

  it("falls back to paid schedules when invoices are missing (issue #1079, scenario 2)", () => {
    // Operator billed via schedules and never issued an invoice; the
    // schedule sum equals the sell amount.
    const row = bookingRow({
      sell_amount_cents: 10_000,
      schedules_paid_cents: 10_000,
      invoice_total_cents: 0,
      invoice_paid_cents: 0,
    })
    expect(derivePaymentStatus(row)).toBe("paid")
  })

  it("returns partial when schedules cover some of the sell amount", () => {
    const row = bookingRow({
      sell_amount_cents: 10_000,
      schedules_paid_cents: 3_000,
      invoice_total_cents: 0,
      invoice_paid_cents: 0,
    })
    expect(derivePaymentStatus(row)).toBe("partial")
  })

  it("returns partial when an invoice is partially paid", () => {
    const row = bookingRow({
      sell_amount_cents: 10_000,
      invoice_total_cents: 10_000,
      invoice_paid_cents: 4_000,
    })
    expect(derivePaymentStatus(row)).toBe("partial")
  })

  it("returns paid when invoices cover the booking and schedules are empty", () => {
    const row = bookingRow({
      sell_amount_cents: 10_000,
      invoice_total_cents: 10_000,
      invoice_paid_cents: 10_000,
    })
    expect(derivePaymentStatus(row)).toBe("paid")
  })

  it("returns unpaid when nothing has been billed or scheduled", () => {
    const row = bookingRow({
      sell_amount_cents: 10_000,
      invoice_total_cents: 0,
      invoice_paid_cents: 0,
      schedules_paid_cents: 0,
    })
    expect(derivePaymentStatus(row)).toBe("unpaid")
  })

  it("treats schedule overpayment the same as exact coverage", () => {
    const row = bookingRow({
      sell_amount_cents: 10_000,
      schedules_paid_cents: 12_000,
    })
    expect(derivePaymentStatus(row)).toBe("paid")
  })

  // `bookings.paid_at` used to short-circuit this to "paid" as an operator
  // override. The v1 commitment lifecycle (#4100) dropped the column, so a
  // booking with no invoice and no schedule rollup now reads as unpaid.
  it("reads unpaid when no invoice or schedule settlement is recorded", () => {
    const row = bookingRow({
      invoice_total_cents: 0,
      invoice_paid_cents: 0,
      schedules_paid_cents: 0,
    })
    expect(derivePaymentStatus(row)).toBe("unpaid")
  })
})
