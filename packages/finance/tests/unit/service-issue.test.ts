// agent-quality: file-size exception -- owner: finance; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { createEventBus, type EventEnvelope } from "@voyant-travel/core"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeEach, describe, expect, it, vi } from "vitest"

import { resolveBookingSellTaxRate } from "../../src/booking-tax.js"
import { financeService } from "../../src/service.js"
import { type InvoiceIssuedEvent, issueInvoiceFromBooking } from "../../src/service-issue.js"
import { isInvoiceablePaymentScheduleStatus } from "../../src/service-shared.js"

vi.mock("../../src/booking-tax.js", () => ({
  resolveBookingSellTaxRate: vi.fn(),
}))

vi.mock("../../src/service.js", () => ({
  financeService: {
    createInvoiceFromBooking: vi.fn(),
  },
  touchLinkedBookingUpdatedAt: vi.fn(),
}))

describe("invoiceable payment schedule statuses", () => {
  it.each(["pending", "due", "paid"])("includes current %s schedules", (status) => {
    expect(isInvoiceablePaymentScheduleStatus(status)).toBe(true)
  })

  it.each(["waived", "cancelled", "expired"])("excludes obsolete %s schedules", (status) => {
    expect(isInvoiceablePaymentScheduleStatus(status)).toBe(false)
  })
})

describe("issueInvoiceFromBooking", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("emits invoice.issued with booking contact fields and invoice line items", async () => {
    const draftInvoice = {
      id: "inv_123",
      invoiceNumber: "INV-1",
      invoiceType: "invoice",
      bookingId: "book_123",
      totalCents: 13500,
      currency: "RON",
      convertedFromInvoiceId: null,
      issueDate: "2026-05-13",
      dueDate: "2026-05-20",
    }
    const issuedInvoice = { ...draftInvoice, status: "issued" }
    const booking = {
      bookingNumber: "BK-1",
      contactFirstName: "Ana",
      contactLastName: "Popescu",
      contactEmail: "ana@example.com",
      contactPhone: "+40720000000",
      contactTaxId: "RO12345678",
      contactAddressLine1: "Strada 1",
      contactAddressLine2: "Ap. 2",
      contactCity: "Cluj-Napoca",
      contactRegion: "Cluj",
      contactCountry: "RO",
    }
    const lineRows = [
      {
        description: "City tour",
        quantity: 2,
        unitPriceCents: 6000,
        taxRate: 19,
      },
      {
        description: "Booking fee",
        quantity: 1,
        unitPriceCents: 1500,
        taxRate: null,
      },
    ]
    vi.mocked(financeService.createInvoiceFromBooking).mockResolvedValue(
      draftInvoice as Awaited<ReturnType<typeof financeService.createInvoiceFromBooking>>,
    )

    const db = Object.assign({} as PostgresJsDatabase, {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [issuedInvoice]),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [booking]),
            orderBy: vi.fn(async () => lineRows),
          })),
        })),
      })),
    })

    const eventBus = createEventBus()
    const emitted: Array<EventEnvelope<InvoiceIssuedEvent>> = []
    eventBus.subscribe<InvoiceIssuedEvent>("invoice.issued", (event) => {
      emitted.push(event)
    })

    await issueInvoiceFromBooking(
      db,
      {
        invoiceNumber: "INV-1",
        bookingId: "book_123",
        issueDate: "2026-05-13",
        dueDate: "2026-05-20",
      },
      {
        booking: {
          id: "book_123",
          bookingNumber: "BK-1",
          personId: null,
          organizationId: null,
          sellCurrency: "RON",
          baseCurrency: null,
          fxRateSetId: null,
          sellAmountCents: 13500,
          baseSellAmountCents: null,
        },
        items: [],
      },
      { eventBus },
    )

    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.data).toMatchObject({
      invoiceId: "inv_123",
      invoiceNumber: "INV-1",
      invoiceType: "invoice",
      bookingId: "book_123",
      totalCents: 13500,
      currency: "RON",
      convertedFromInvoiceId: null,
      clientName: "Ana Popescu",
      clientEmail: "ana@example.com",
      clientPhone: "+40720000000",
      clientAddress: "Strada 1\nAp. 2",
      clientCity: "Cluj-Napoca",
      clientCounty: "Cluj",
      clientCountry: "RO",
      clientVatCode: "RO12345678",
      clientRegCom: null,
      bookingNumber: "BK-1",
      issueDate: "2026-05-13",
      dueDate: "2026-05-20",
      lineItems: [
        {
          description: "City tour",
          quantity: 2,
          unitPrice: 60,
          currency: "RON",
          taxPercentage: 19,
          isService: true,
        },
        {
          description: "Booking fee",
          quantity: 1,
          unitPrice: 15,
          currency: "RON",
          isService: true,
        },
      ],
    })
  })

  it("carries resolved tax names and regime codes on issued line items", async () => {
    const draftInvoice = {
      id: "inv_tax",
      invoiceNumber: "INV-TAX",
      invoiceType: "invoice",
      bookingId: "book_tax",
      totalCents: 12100,
      currency: "RON",
      convertedFromInvoiceId: null,
      issueDate: "2026-05-23",
      dueDate: "2026-05-30",
    }
    const issuedInvoice = { ...draftInvoice, status: "issued" }
    const booking = {
      bookingNumber: "BK-TAX",
      contactFirstName: "Ana",
      contactLastName: "Popescu",
    }
    const lineRows = [
      {
        bookingItemId: "item_tax",
        description: "Consulting",
        quantity: 1,
        unitPriceCents: 12100,
        taxRate: 21,
      },
    ]
    const taxRows = [
      {
        bookingItemId: "item_tax",
        name: "Normala",
        code: "ro-b2c/standard",
        scope: "included",
        rateBasisPoints: 2100,
      },
    ]
    vi.mocked(financeService.createInvoiceFromBooking).mockResolvedValue(
      draftInvoice as Awaited<ReturnType<typeof financeService.createInvoiceFromBooking>>,
    )

    let selectCall = 0
    const db = Object.assign({} as PostgresJsDatabase, {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [issuedInvoice]),
          })),
        })),
      })),
      select: vi.fn(() => {
        selectCall += 1
        const currentSelect = selectCall
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => ({
              limit: vi.fn(async () => (currentSelect === 1 ? [booking] : [])),
              orderBy: vi.fn(async () => {
                if (currentSelect === 2) return lineRows
                if (currentSelect === 3) return taxRows
                return []
              }),
            })),
          })),
        }
      }),
    })

    const eventBus = createEventBus()
    const emitted: Array<EventEnvelope<InvoiceIssuedEvent>> = []
    eventBus.subscribe<InvoiceIssuedEvent>("invoice.issued", (event) => {
      emitted.push(event)
    })

    await issueInvoiceFromBooking(
      db,
      {
        invoiceNumber: "INV-TAX",
        bookingId: "book_tax",
        issueDate: "2026-05-23",
        dueDate: "2026-05-30",
      },
      {
        booking: {
          id: "book_tax",
          bookingNumber: "BK-TAX",
          personId: null,
          organizationId: null,
          sellCurrency: "RON",
          baseCurrency: null,
          fxRateSetId: null,
          sellAmountCents: 12100,
          baseSellAmountCents: null,
        },
        items: [],
      },
      { eventBus },
    )

    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.data.lineItems).toEqual([
      {
        description: "Consulting",
        quantity: 1,
        unitPrice: 121,
        currency: "RON",
        taxPercentage: 21,
        taxName: "Normala",
        taxRegimeCode: "standard",
        isService: true,
      },
    ])
  })

  it("falls back to product tax metadata for zero-rate issued line items", async () => {
    const draftInvoice = {
      id: "inv_zero_tax",
      invoiceNumber: "INV-ZERO-TAX",
      invoiceType: "invoice",
      bookingId: "book_zero_tax",
      totalCents: 10000,
      currency: "RON",
      convertedFromInvoiceId: null,
      issueDate: "2026-05-23",
      dueDate: "2026-05-30",
    }
    const issuedInvoice = { ...draftInvoice, status: "issued" }
    const lineRows = [
      {
        bookingItemId: "item_zero_tax",
        description: "Margin scheme service",
        quantity: 1,
        unitPriceCents: 10000,
        taxRate: null,
      },
    ]
    vi.mocked(financeService.createInvoiceFromBooking).mockResolvedValue(
      draftInvoice as Awaited<ReturnType<typeof financeService.createInvoiceFromBooking>>,
    )
    vi.mocked(resolveBookingSellTaxRate).mockResolvedValue({
      code: "ro-b2c/exempt",
      label: "Normala",
      rate: 0,
      priceMode: "inclusive",
    })

    let selectCall = 0
    const db = Object.assign({} as PostgresJsDatabase, {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [issuedInvoice]),
          })),
        })),
      })),
      select: vi.fn(() => {
        selectCall += 1
        const currentSelect = selectCall
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => {
              if (currentSelect === 4) {
                return Promise.resolve([{ id: "item_zero_tax", productId: "prod_zero_tax" }])
              }

              return {
                limit: vi.fn(async () => (currentSelect === 1 ? [{ bookingNumber: "BK-0" }] : [])),
                orderBy: vi.fn(async () => {
                  if (currentSelect === 2) return lineRows
                  if (currentSelect === 3) return []
                  return []
                }),
              }
            }),
          })),
        }
      }),
    })

    const eventBus = createEventBus()
    const emitted: Array<EventEnvelope<InvoiceIssuedEvent>> = []
    eventBus.subscribe<InvoiceIssuedEvent>("invoice.issued", (event) => {
      emitted.push(event)
    })

    await issueInvoiceFromBooking(
      db,
      {
        invoiceNumber: "INV-ZERO-TAX",
        bookingId: "book_zero_tax",
        issueDate: "2026-05-23",
        dueDate: "2026-05-30",
      },
      {
        booking: {
          id: "book_zero_tax",
          bookingNumber: "BK-0",
          personId: null,
          organizationId: null,
          sellCurrency: "RON",
          baseCurrency: null,
          fxRateSetId: null,
          sellAmountCents: 10000,
          baseSellAmountCents: null,
        },
        items: [],
      },
      { eventBus },
    )

    expect(resolveBookingSellTaxRate).toHaveBeenCalledWith(db, { productId: "prod_zero_tax" })
    expect(emitted[0]?.data.lineItems).toEqual([
      {
        description: "Margin scheme service",
        quantity: 1,
        unitPrice: 100,
        currency: "RON",
        taxPercentage: 0,
        taxName: "Normala",
        taxRegimeCode: "exempt",
        isService: true,
      },
    ])
  })

  it("carries payment schedule metadata on issued line items", async () => {
    const draftInvoice = {
      id: "inv_schedule",
      invoiceNumber: "INV-SCHEDULE",
      invoiceType: "invoice",
      bookingId: "book_schedule",
      totalCents: 32000,
      currency: "RON",
      convertedFromInvoiceId: null,
      issueDate: "2026-05-23",
      dueDate: "2026-05-30",
    }
    const issuedInvoice = { ...draftInvoice, status: "issued" }
    const booking = {
      bookingNumber: "BK-SCHEDULE",
      sellAmountCents: 64000,
      contactFirstName: "Ana",
      contactLastName: "Popescu",
    }
    const lineRows = [
      {
        bookingItemId: null,
        bookingPaymentScheduleId: "bps_123",
        description: "Deposit 50% Excursie Bulgaria | 2026-06-13",
        quantity: 1,
        unitPriceCents: 32000,
        taxRate: null,
      },
    ]
    const scheduleRows = [
      {
        id: "bps_123",
        scheduleType: "deposit",
        amountCents: 32000,
      },
    ]
    vi.mocked(financeService.createInvoiceFromBooking).mockResolvedValue(
      draftInvoice as Awaited<ReturnType<typeof financeService.createInvoiceFromBooking>>,
    )

    let selectCall = 0
    const db = Object.assign({} as PostgresJsDatabase, {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [issuedInvoice]),
          })),
        })),
      })),
      select: vi.fn(() => {
        selectCall += 1
        const currentSelect = selectCall
        return {
          from: vi.fn(() => ({
            where: vi.fn(() => {
              if (currentSelect === 3) return Promise.resolve(scheduleRows)

              return {
                limit: vi.fn(async () => (currentSelect === 1 ? [booking] : [])),
                orderBy: vi.fn(async () => (currentSelect === 2 ? lineRows : [])),
              }
            }),
          })),
        }
      }),
    })

    const eventBus = createEventBus()
    const emitted: Array<EventEnvelope<InvoiceIssuedEvent>> = []
    eventBus.subscribe<InvoiceIssuedEvent>("invoice.issued", (event) => {
      emitted.push(event)
    })

    await issueInvoiceFromBooking(
      db,
      {
        invoiceNumber: "INV-SCHEDULE",
        bookingId: "book_schedule",
        issueDate: "2026-05-23",
        dueDate: "2026-05-30",
      },
      {
        booking: {
          id: "book_schedule",
          bookingNumber: "BK-SCHEDULE",
          personId: null,
          organizationId: null,
          sellCurrency: "RON",
          baseCurrency: null,
          fxRateSetId: null,
          sellAmountCents: 64000,
          baseSellAmountCents: null,
        },
        items: [],
      },
      { eventBus },
    )

    expect(emitted[0]?.data.lineItems).toEqual([
      {
        description: "Deposit 50% Excursie Bulgaria | 2026-06-13",
        quantity: 1,
        unitPrice: 320,
        currency: "RON",
        bookingPaymentScheduleId: "bps_123",
        scheduleType: "deposit",
        schedulePercent: 50,
        isService: true,
      },
    ])
  })

  it("enriches issued invoice events with operator FX settings", async () => {
    const draftInvoice = {
      id: "inv_fx",
      invoiceNumber: "INV-FX",
      invoiceType: "invoice",
      bookingId: "book_fx",
      totalCents: 10000,
      currency: "EUR",
      baseCurrency: null,
      convertedFromInvoiceId: null,
      issueDate: "2026-05-22",
      dueDate: "2026-05-29",
    }
    const issuedInvoice = { ...draftInvoice, status: "issued" }
    vi.mocked(financeService.createInvoiceFromBooking).mockResolvedValue(
      draftInvoice as Awaited<ReturnType<typeof financeService.createInvoiceFromBooking>>,
    )

    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [issuedInvoice]),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ bookingNumber: "BK-FX" }]),
            // Drizzle's builder is thenable AND chainable; the FX resolution
            // reads exchange_rates with `.orderBy(...).limit(1)`.
            orderBy: vi.fn(() => Object.assign(Promise.resolve([]), { limit: async () => [] })),
          })),
        })),
      })),
    } as PostgresJsDatabase

    const eventBus = createEventBus()
    const emitted: Array<EventEnvelope<InvoiceIssuedEvent>> = []
    eventBus.subscribe<InvoiceIssuedEvent>("invoice.issued", (event) => {
      emitted.push(event)
    })
    const resolveInvoiceExchangeRate = vi.fn(async () => ({
      rate: 4.97,
      source: "bnr",
      quotedAt: "Fri, 22 May 2026 00:00:01 +0000",
      validUntil: "Sat, 23 May 2026 00:00:01 +0000",
    }))

    await issueInvoiceFromBooking(
      db,
      {
        invoiceNumber: "INV-FX",
        bookingId: "book_fx",
        issueDate: "2026-05-22",
        dueDate: "2026-05-29",
      },
      {
        booking: {
          id: "book_fx",
          bookingNumber: "BK-FX",
          personId: null,
          organizationId: null,
          sellCurrency: "EUR",
          baseCurrency: null,
          fxRateSetId: null,
          sellAmountCents: 10000,
          baseSellAmountCents: null,
        },
        items: [],
      },
      {
        eventBus,
        invoiceFxSettings: {
          baseCurrency: "RON",
          fxCommissionBps: 200,
          fxCommissionInvoiceMention: "2% comision curs risc valutar",
        },
        resolveInvoiceExchangeRate,
      },
    )

    expect(resolveInvoiceExchangeRate).toHaveBeenCalledWith({
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: "2026-05-22",
    })
    expect(emitted[0]?.data).toMatchObject({
      baseCurrency: "RON",
      fxRate: 4.97,
      fxRateSource: "bnr",
      fxRateQuotedAt: "Fri, 22 May 2026 00:00:01 +0000",
      fxRateValidUntil: "Sat, 23 May 2026 00:00:01 +0000",
      fxCommissionBps: 200,
      effectiveRate: 5.0694,
      fxCommissionInvoiceMention: "2% comision curs risc valutar",
    })
  })

  it("still emits issued invoice events when FX resolution fails", async () => {
    const draftInvoice = {
      id: "inv_fx_failure",
      invoiceNumber: "INV-FX-FAIL",
      invoiceType: "invoice",
      bookingId: "book_fx_failure",
      totalCents: 10000,
      currency: "EUR",
      baseCurrency: null,
      convertedFromInvoiceId: null,
      issueDate: "2026-05-22",
      dueDate: "2026-05-29",
    }
    const issuedInvoice = { ...draftInvoice, status: "issued" }
    vi.mocked(financeService.createInvoiceFromBooking).mockResolvedValue(
      draftInvoice as Awaited<ReturnType<typeof financeService.createInvoiceFromBooking>>,
    )

    const db = {
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => [issuedInvoice]),
          })),
        })),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ bookingNumber: "BK-FX-FAIL" }]),
            orderBy: vi.fn(() => Object.assign(Promise.resolve([]), { limit: async () => [] })),
          })),
        })),
      })),
    } as PostgresJsDatabase

    const eventBus = createEventBus()
    const emitted: Array<EventEnvelope<InvoiceIssuedEvent>> = []
    eventBus.subscribe<InvoiceIssuedEvent>("invoice.issued", (event) => {
      emitted.push(event)
    })
    const error = new Error("FX provider timeout")
    const resolveInvoiceExchangeRate = vi.fn(async () => {
      throw error
    })
    const onInvoiceFxResolutionError = vi.fn()

    await expect(
      issueInvoiceFromBooking(
        db,
        {
          invoiceNumber: "INV-FX-FAIL",
          bookingId: "book_fx_failure",
          issueDate: "2026-05-22",
          dueDate: "2026-05-29",
        },
        {
          booking: {
            id: "book_fx_failure",
            bookingNumber: "BK-FX-FAIL",
            personId: null,
            organizationId: null,
            sellCurrency: "EUR",
            baseCurrency: null,
            fxRateSetId: null,
            sellAmountCents: 10000,
            baseSellAmountCents: null,
          },
          items: [],
        },
        {
          eventBus,
          invoiceFxSettings: {
            baseCurrency: "RON",
            fxCommissionBps: 200,
          },
          resolveInvoiceExchangeRate,
          onInvoiceFxResolutionError,
        },
      ),
    ).resolves.toEqual(issuedInvoice)

    expect(onInvoiceFxResolutionError).toHaveBeenCalledWith(error, {
      baseCurrency: "EUR",
      quoteCurrency: "RON",
      date: "2026-05-22",
    })
    expect(emitted).toHaveLength(1)
    expect(emitted[0]?.data).toMatchObject({
      invoiceId: "inv_fx_failure",
      invoiceNumber: "INV-FX-FAIL",
      currency: "EUR",
    })
    expect(emitted[0]?.data).not.toHaveProperty("fxRate")
    expect(emitted[0]?.data).not.toHaveProperty("effectiveRate")
  })
})
