import { afterEach, describe, expect, it, vi } from "vitest"

import {
  bootstrapCheckoutCollection,
  initiateCheckoutCollection,
  resolveDocumentType,
  resolvePaymentSessionTarget,
} from "../../src/checkout-service.js"
import {
  bookingPaymentSchedules,
  invoiceLineItems,
  invoiceNumberSeries,
  invoices,
} from "../../src/schema.js"
import { financeService } from "../../src/service.js"

afterEach(() => {
  vi.restoreAllMocks()
})

describe("finance checkout service", () => {
  it("uses invoice collection for bank transfer", () => {
    expect(resolvePaymentSessionTarget("bank_transfer", "initial", undefined, {})).toBe("invoice")
    expect(resolvePaymentSessionTarget("bank_transfer", "reminder", "schedule", {})).toBe("invoice")
  })

  it("uses stage-aware defaults for card collection", () => {
    expect(resolvePaymentSessionTarget("card", "initial", undefined, {})).toBe("schedule")
    expect(
      resolvePaymentSessionTarget("card", "reminder", undefined, {
        defaultReminderCardCollectionTarget: "invoice",
      }),
    ).toBe("invoice")
  })

  it("honors explicit target overrides", () => {
    expect(resolvePaymentSessionTarget("card", "initial", "invoice", {})).toBe("invoice")
    expect(resolvePaymentSessionTarget("card", "reminder", "schedule", {})).toBe("schedule")
  })

  it("defaults card invoice collection to invoice documents", () => {
    expect(resolveDocumentType("card", "invoice", {})).toBe("invoice")
    expect(resolveDocumentType("card", "schedule", {})).toBeNull()
  })

  it("allows card invoice collection to create a proforma anchor", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({ insertedInvoices })
    const paymentSession = {
      id: "ps_123",
      invoiceId: "inv_collection",
      targetType: "invoice",
    }

    vi.spyOn(financeService, "createPaymentSessionFromInvoice").mockResolvedValue(
      paymentSession as never,
    )

    const result = await initiateCheckoutCollection(
      db as never,
      "booking_123",
      {
        method: "card",
        stage: "manual",
        amountCents: 12_000,
        paymentSessionTarget: "invoice",
      },
      { defaultCardCollectionDocumentType: "proforma" },
    )

    expect(result?.plan.documentType).toBe("proforma")
    expect(result?.invoice?.invoiceType).toBe("proforma")
    expect(result?.paymentSession).toBe(paymentSession)
    expect(insertedInvoices).toHaveLength(1)
    expect(insertedInvoices[0]?.invoiceType).toBe("proforma")
    expect(financeService.createPaymentSessionFromInvoice).toHaveBeenCalledWith(
      db,
      "inv_collection",
      { notes: null },
    )
  })

  it("uses only the deployment-selected payment adapter", async () => {
    const db = createCheckoutDb({ insertedInvoices: [] })
    const paymentSession = {
      id: "ps_selected",
      invoiceId: null,
      targetType: "booking_payment_schedule",
    }
    const selectedPaymentStarter = vi.fn(async () => ({
      provider: "connected-adapter",
      paymentSessionId: paymentSession.id,
      redirectUrl: "https://payments.example/checkout",
      externalReference: null,
      providerSessionId: "processor_session_123",
      providerPaymentId: null,
      response: null,
    }))
    const legacyPaymentStarter = vi.fn()

    vi.spyOn(financeService, "createPaymentSessionFromBookingSchedule").mockResolvedValue(
      paymentSession as never,
    )
    vi.spyOn(financeService, "getPaymentSessionById").mockResolvedValue(paymentSession as never)

    const result = await initiateCheckoutCollection(
      db as never,
      "booking_123",
      {
        method: "card",
        stage: "initial",
        startProvider: {
          payload: {
            billing: {
              email: "traveler@example.com",
              firstName: "Ana",
              lastName: "Ionescu",
            },
          },
        },
      },
      {},
      {
        selectedPaymentStarter,
        paymentStarters: { netopia: legacyPaymentStarter },
      },
    )

    expect(selectedPaymentStarter).toHaveBeenCalledOnce()
    expect(legacyPaymentStarter).not.toHaveBeenCalled()
    expect(result?.providerStart).toMatchObject({
      provider: "connected-adapter",
      redirectUrl: "https://payments.example/checkout",
    })
  })

  it("rejects provider-neutral card start before creating invoice or session when no selected starter exists", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({ insertedInvoices })
    const legacyPaymentStarter = vi.fn()
    const createPaymentSessionFromInvoice = vi.spyOn(
      financeService,
      "createPaymentSessionFromInvoice",
    )

    await expect(
      initiateCheckoutCollection(
        db as never,
        "booking_123",
        {
          method: "card",
          stage: "manual",
          amountCents: 12_000,
          paymentSessionTarget: "invoice",
          startProvider: {
            payload: {
              billing: {
                email: "traveler@example.com",
                firstName: "Ana",
              },
            },
          },
        },
        {},
        {
          paymentStarters: { netopia: legacyPaymentStarter },
        },
      ),
    ).rejects.toThrow("No payment adapter is selected for card collection")

    expect(insertedInvoices).toHaveLength(0)
    expect(createPaymentSessionFromInvoice).not.toHaveBeenCalled()
    expect(legacyPaymentStarter).not.toHaveBeenCalled()
  })

  it("rejects an unavailable card adapter before any checkout database read", async () => {
    const select = vi.fn(() => {
      throw new Error("checkout database must not be touched")
    })

    await expect(
      initiateCheckoutCollection({ select } as never, "booking_123", {
        method: "card",
        stage: "initial",
        startProvider: {
          payload: {
            billing: {
              email: "traveler@example.com",
              firstName: "Ana",
            },
          },
        },
      }),
    ).rejects.toThrow("No payment adapter is selected for card collection")

    expect(select).not.toHaveBeenCalled()
  })

  it("does not use keyed starters without a selected adapter", async () => {
    const db = createCheckoutDb({ insertedInvoices: [] })
    const paymentSession = {
      id: "ps_legacy",
      invoiceId: null,
      targetType: "booking_payment_schedule",
    }
    const legacyPaymentStarter = vi.fn(async () => ({
      provider: "netopia",
      paymentSessionId: paymentSession.id,
      redirectUrl: "https://payments.example/checkout",
      externalReference: null,
      providerSessionId: "processor_session_123",
      providerPaymentId: null,
      response: null,
    }))

    vi.spyOn(financeService, "createPaymentSessionFromBookingSchedule").mockResolvedValue(
      paymentSession as never,
    )
    vi.spyOn(financeService, "getPaymentSessionById").mockResolvedValue(paymentSession as never)

    await expect(
      initiateCheckoutCollection(
        db as never,
        "booking_123",
        {
          method: "card",
          stage: "initial",
          startProvider: {
            payload: {
              billing: {
                email: "traveler@example.com",
                firstName: "Ana",
              },
            },
          },
        },
        {},
        {
          paymentStarters: { netopia: legacyPaymentStarter },
        },
      ),
    ).rejects.toThrow("No payment adapter is selected for card collection")

    expect(legacyPaymentStarter).not.toHaveBeenCalled()
  })

  it("keeps base paid cents null when creating a collection invoice without base currency", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      booking: {
        baseCurrency: null,
        baseSellAmountCents: null,
      },
    })

    await initiateCheckoutCollection(db as never, "booking_123", {
      method: "bank_transfer",
      stage: "manual",
      amountCents: 12_000,
    })

    expect(insertedInvoices).toHaveLength(1)
    expect(insertedInvoices[0]).toMatchObject({
      baseCurrency: null,
      baseSubtotalCents: null,
      baseTotalCents: null,
      basePaidCents: null,
      baseBalanceDueCents: null,
    })
  })

  it("rejects mismatched booking and session ids during bootstrap", async () => {
    await expect(
      bootstrapCheckoutCollection(
        {} as never,
        {
          bookingId: "book_123",
          sessionId: "book_456",
          method: "card",
          stage: "manual",
        },
        {},
      ),
    ).rejects.toThrow("bookingId and sessionId must refer to the same booking session")
  })
})

function createCheckoutDb({
  insertedInvoices,
  booking: bookingOverrides = {},
}: {
  insertedInvoices: Array<Record<string, unknown>>
  booking?: Partial<Record<string, unknown>>
}) {
  const booking = {
    id: "booking_123",
    bookingNumber: "BK-123",
    personId: "person_123",
    organizationId: null,
    sellAmountCents: 20_000,
    baseSellAmountCents: 20_000,
    sellCurrency: "EUR",
    baseCurrency: "EUR",
    ...bookingOverrides,
  }

  const rowsFor = (table: unknown) => {
    if (table === invoiceNumberSeries) return []
    if (table === bookingPaymentSchedules) {
      return [
        {
          id: "schedule_123",
          bookingId: "booking_123",
          bookingItemId: null,
          scheduleType: "deposit",
          status: "pending",
          amountCents: 5_000,
          dueDate: "2026-06-30",
          notes: null,
          createdAt: new Date("2026-06-01T00:00:00.000Z"),
        },
      ]
    }
    if (table === invoices) return []
    return []
  }

  return {
    select() {
      let selectedTable: unknown = null
      const query = {
        from(table: unknown) {
          selectedTable = table
          return query
        },
        where() {
          return query
        },
        orderBy() {
          if (selectedTable === invoiceNumberSeries) return query
          return Promise.resolve(rowsFor(selectedTable))
        },
        limit() {
          return Promise.resolve(selectedTable === invoiceNumberSeries ? [] : [booking])
        },
      }
      return query
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          if (table === invoices) {
            insertedInvoices.push(values)
            return {
              returning() {
                return Promise.resolve([{ id: "inv_collection", ...values }])
              },
            }
          }
          if (table === invoiceLineItems) {
            return Promise.resolve(undefined)
          }
          return Promise.resolve(undefined)
        },
      }
    },
  }
}
