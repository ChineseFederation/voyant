import type {
  BookingPaymentScheduleRecord,
  InvoiceRecord,
  PublicFinanceBookingPaymentRecord,
} from "@voyant-travel/finance-react"
import type { ReactNode } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { beforeEach, describe, expect, it, vi } from "vitest"

const financeState = vi.hoisted(() => ({
  invoices: [] as InvoiceRecord[],
  payments: [] as PublicFinanceBookingPaymentRecord[],
  schedules: [] as BookingPaymentScheduleRecord[],
}))

vi.mock("@voyant-travel/finance-react", () => ({
  useAdminBookingPayments: () => ({
    data: { data: { payments: financeState.payments } },
    isLoading: false,
  }),
  useBookingPaymentSchedules: () => ({
    data: { data: financeState.schedules },
    isLoading: false,
  }),
  useInvoices: () => ({
    data: { data: financeState.invoices },
    isLoading: false,
  }),
}))

vi.mock("@voyant-travel/ui/components", () => ({
  Badge: ({ children }: { children?: ReactNode }) => <span>{children}</span>,
  cn: (...classes: Array<string | false | null | undefined>) => classes.filter(Boolean).join(" "),
}))

import { BookingPaymentReconciliationBanner } from "../../src/components/booking-payment-reconciliation-banner.js"

beforeEach(() => {
  financeState.invoices = []
  financeState.payments = []
  financeState.schedules = []
})

function invoice(data: Partial<InvoiceRecord> = {}): InvoiceRecord {
  return {
    id: "inv_123",
    bookingId: "book_123",
    invoiceNumber: "INV-1",
    invoiceType: "invoice",
    status: "issued",
    currency: "EUR",
    subtotalCents: 16500,
    taxCents: 0,
    totalCents: 16500,
    paidCents: 0,
    balanceDueCents: 16500,
    issueDate: "2026-05-23",
    dueDate: "2026-05-30",
    notes: null,
    personId: null,
    organizationId: null,
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    ...data,
  }
}

function payment(
  data: Partial<PublicFinanceBookingPaymentRecord> = {},
): PublicFinanceBookingPaymentRecord {
  return {
    id: "pay_123",
    source: "payment",
    invoiceId: "inv_123",
    invoiceNumber: "INV-1",
    invoiceType: "invoice",
    status: "completed",
    paymentMethod: "bank_transfer",
    amountCents: 16500,
    currency: "EUR",
    baseCurrency: null,
    baseAmountCents: null,
    paymentDate: "2026-05-23",
    referenceNumber: null,
    notes: null,
    ...data,
  }
}

function schedule(data: Partial<BookingPaymentScheduleRecord> = {}): BookingPaymentScheduleRecord {
  return {
    id: "bps_123",
    bookingId: "book_123",
    bookingItemId: null,
    amendmentId: null,
    scheduleType: "deposit",
    status: "paid",
    dueDate: "2026-05-30",
    currency: "EUR",
    amountCents: 16500,
    notes: null,
    createdAt: "2026-05-23T00:00:00.000Z",
    updatedAt: "2026-05-23T00:00:00.000Z",
    ...data,
  }
}

describe("BookingPaymentReconciliationBanner", () => {
  it("flags paid schedule rows that have no matching invoice/payment total", () => {
    financeState.invoices = [invoice()]
    financeState.payments = []
    financeState.schedules = [schedule()]

    const html = renderToStaticMarkup(<BookingPaymentReconciliationBanner bookingId="book_123" />)

    expect(html).toContain("Needs review")
    expect(html).toContain(
      "match across invoices, payments, and the schedule. Check them before taking more payment.",
    )
    expect(html).toContain("€165.00")
  })

  it("marks the booking reconciled when invoice, payment, and schedule paid totals match", () => {
    financeState.invoices = [invoice({ paidCents: 16500, balanceDueCents: 0 })]
    financeState.payments = [payment()]
    financeState.schedules = [schedule()]

    const html = renderToStaticMarkup(<BookingPaymentReconciliationBanner bookingId="book_123" />)

    expect(html).toContain("Reconciled")
    expect(html).toContain("Paid amounts match across invoices, payments, and the schedule.")
    expect(html).not.toContain("Needs review")
  })
})
