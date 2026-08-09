import type { ToolContext } from "@voyant-travel/tools"
import { expect, it } from "vitest"

import { type FinanceToolServices, invoiceBookingTool } from "../src/tools.js"

it("returns a compact invoice-booking outcome with an executable detail follow-up", async () => {
  const finance: Partial<FinanceToolServices> = {
    async invoiceBooking() {
      return {
        status: "issued",
        invoiceId: "invoice_1",
        invoiceNumber: "PF-1001",
        bookingId: "booking_1",
        currency: "EUR",
        totalCents: 80_000,
        replayed: false,
        committedChanges: ["invoice_issued"],
        nextActions: [{ tool: "get_invoice", input: { id: "invoice_1" } }],
      }
    },
  }
  const context: ToolContext & { finance: FinanceToolServices } = {
    db: {},
    actor: "staff",
    audience: "staff",
    tenantId: "default",
    resolverScope: { locale: "en-GB", audience: "staff", market: "default", actor: "staff" },
    finance: finance as FinanceToolServices,
  }

  const result = await invoiceBookingTool.handler(
    { bookingId: "booking_1", issueDate: "2026-07-15", dueDate: "2026-08-15" },
    context,
  )

  expect(result).toEqual({
    status: "issued",
    invoiceId: "invoice_1",
    invoiceNumber: "PF-1001",
    bookingId: "booking_1",
    currency: "EUR",
    totalCents: 80_000,
    replayed: false,
    committedChanges: ["invoice_issued"],
    nextActions: [{ tool: "get_invoice", input: { id: "invoice_1" } }],
  })
  expect(JSON.stringify(result).length).toBeLessThan(500)
})
