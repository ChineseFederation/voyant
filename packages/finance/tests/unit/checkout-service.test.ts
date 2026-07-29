import { PgDialect } from "drizzle-orm/pg-core"
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
  paymentSessions,
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
    const insertedInvoices: Array<Record<string, unknown>> = []
    const linkedSessions: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      linkedSessions,
      linkSessionId: "ps_selected",
    })
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
    vi.spyOn(financeService, "getPaymentSessionById").mockResolvedValue({
      ...paymentSession,
      invoiceId: "inv_collection",
    } as never)

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
    expect(insertedInvoices).toHaveLength(1)
    expect(insertedInvoices[0]?.invoiceType).toBe("proforma")
    expect(linkedSessions).toEqual([{ id: "ps_selected", invoiceId: "inv_collection" }])
    expect(result?.providerStart).toMatchObject({
      provider: "connected-adapter",
      redirectUrl: "https://payments.example/checkout",
    })
  })

  it("links a proforma invoice onto schedule-targeted card payment sessions", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const linkedSessions: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      linkedSessions,
      linkSessionId: "ps_schedule",
    })
    const paymentSession = {
      id: "ps_schedule",
      invoiceId: null,
      targetType: "booking_payment_schedule",
      bookingPaymentScheduleId: "schedule_123",
    }

    vi.spyOn(financeService, "createPaymentSessionFromBookingSchedule").mockResolvedValue(
      paymentSession as never,
    )

    const result = await initiateCheckoutCollection(db as never, "booking_123", {
      method: "card",
      stage: "initial",
      amountCents: 5_000,
    })

    expect(insertedInvoices).toHaveLength(1)
    expect(insertedInvoices[0]).toMatchObject({
      invoiceType: "proforma",
      currency: "EUR",
      totalCents: 5_000,
    })
    expect(linkedSessions).toEqual([{ id: "ps_schedule", invoiceId: "inv_collection" }])
    expect(result?.invoice?.id).toBe("inv_collection")
    expect(result?.paymentSession).toMatchObject({
      id: "ps_schedule",
      invoiceId: "inv_collection",
    })
    expect(financeService.createPaymentSessionFromBookingSchedule).toHaveBeenCalledWith(
      db,
      "schedule_123",
      { notes: null },
    )
  })

  it("stamps schedule-card proformas with the schedule currency", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const linkedSessions: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      linkedSessions,
      linkSessionId: "ps_schedule",
      schedule: { currency: "USD", amountCents: 5_000 },
    })
    const paymentSession = {
      id: "ps_schedule",
      invoiceId: null,
      targetType: "booking_payment_schedule",
      bookingPaymentScheduleId: "schedule_123",
      currency: "USD",
      amountCents: 5_000,
    }

    vi.spyOn(financeService, "createPaymentSessionFromBookingSchedule").mockResolvedValue(
      paymentSession as never,
    )

    await initiateCheckoutCollection(db as never, "booking_123", {
      method: "card",
      stage: "initial",
      amountCents: 5_000,
    })

    expect(insertedInvoices).toHaveLength(1)
    expect(insertedInvoices[0]).toMatchObject({
      invoiceType: "proforma",
      currency: "USD",
      totalCents: 5_000,
      baseCurrency: null,
      baseSubtotalCents: null,
      baseTotalCents: null,
      basePaidCents: null,
      baseBalanceDueCents: null,
    })
    expect(linkedSessions).toEqual([{ id: "ps_schedule", invoiceId: "inv_collection" }])
  })

  it("reuses an existing linked invoice on idempotent schedule session retries", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const linkedSessions: Array<Record<string, unknown>> = []
    const existingInvoice = {
      id: "inv_existing",
      invoiceType: "proforma",
      status: "issued",
      currency: "EUR",
      totalCents: 5_000,
      balanceDueCents: 5_000,
    }
    const db = createCheckoutDb({
      insertedInvoices,
      linkedSessions,
      linkSessionId: "ps_schedule",
      existingInvoices: [existingInvoice],
    })
    const paymentSession = {
      id: "ps_schedule",
      invoiceId: "inv_existing",
      targetType: "booking_payment_schedule",
      bookingPaymentScheduleId: "schedule_123",
    }

    vi.spyOn(financeService, "createPaymentSessionFromBookingSchedule").mockResolvedValue(
      paymentSession as never,
    )

    const result = await initiateCheckoutCollection(db as never, "booking_123", {
      method: "card",
      stage: "initial",
      amountCents: 5_000,
      paymentSession: { idempotencyKey: "checkout-retry-1" },
    })

    expect(insertedInvoices).toHaveLength(0)
    expect(linkedSessions).toHaveLength(0)
    expect(result?.invoice).toMatchObject({ id: "inv_existing" })
    expect(result?.paymentSession).toMatchObject({
      id: "ps_schedule",
      invoiceId: "inv_existing",
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
    const insertedInvoices: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({ insertedInvoices })
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
    expect(insertedInvoices).toHaveLength(0)
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

  it("rolls back document number allocation when the fenced invoice insert fails", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      series: { currentSequence: 7 },
      invoiceInsertError: new Error("invoice insert failed"),
    })

    await expect(
      initiateCheckoutCollection(db as never, "booking_123", {
        method: "bank_transfer",
        stage: "manual",
        amountCents: 12_000,
      }),
    ).rejects.toThrow("invoice insert failed")

    expect(db.getSeriesSequence()).toBe(7)
    expect(
      db.executedSql.findIndex((statement) => statement.includes("pg_advisory_xact_lock")),
    ).toBe(0)
    expect(
      db.executedSql.findIndex(
        (statement) =>
          statement.includes("FOR UPDATE") && !statement.includes("invoice_number_series"),
      ),
    ).toBe(1)
    expect(
      db.executedSql.findIndex((statement) => statement.includes("FROM invoice_number_series")),
    ).toBe(2)
  })

  it("rejects a cancelled booking before allocating a document number", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      bookingStatus: "cancelled",
      series: { currentSequence: 7 },
    })

    await expect(
      initiateCheckoutCollection(db as never, "booking_123", {
        method: "bank_transfer",
        stage: "manual",
        amountCents: 12_000,
      }),
    ).rejects.toThrow("no longer accepts new financial consequences")

    expect(db.getSeriesSequence()).toBe(7)
    expect(
      db.executedSql.some((statement) => statement.includes("FROM invoice_number_series")),
    ).toBe(false)
    expect(insertedInvoices).toHaveLength(0)
  })

  it("rejects a cancelled schedule checkout before creating its payment session", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      bookingStatus: "cancelled",
    })
    const createScheduleSession = vi.spyOn(
      financeService,
      "createPaymentSessionFromBookingSchedule",
    )

    await expect(
      initiateCheckoutCollection(db as never, "booking_123", {
        method: "card",
        stage: "initial",
        amountCents: 5_000,
      }),
    ).rejects.toThrow("no longer accepts new financial consequences")

    expect(createScheduleSession).not.toHaveBeenCalled()
    expect(insertedInvoices).toHaveLength(0)
  })

  it("rolls back a newly created schedule session when fenced invoice creation fails", async () => {
    const insertedInvoices: Array<Record<string, unknown>> = []
    const insertedPaymentSessions: Array<Record<string, unknown>> = []
    const db = createCheckoutDb({
      insertedInvoices,
      insertedPaymentSessions,
      series: { currentSequence: 7 },
      invoiceInsertError: new Error("invoice insert failed"),
    })

    await expect(
      initiateCheckoutCollection(db as never, "booking_123", {
        method: "card",
        stage: "initial",
        amountCents: 5_000,
      }),
    ).rejects.toThrow("invoice insert failed")

    expect(insertedPaymentSessions).toHaveLength(0)
    expect(insertedInvoices).toHaveLength(0)
    expect(db.getSeriesSequence()).toBe(7)
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
  linkedSessions = [],
  linkSessionId = "ps_schedule",
  existingInvoices = [],
  schedule: scheduleOverrides = {},
  booking: bookingOverrides = {},
  bookingStatus = "confirmed",
  series: seriesOverrides = null,
  invoiceInsertError,
  insertedPaymentSessions = [],
}: {
  insertedInvoices: Array<Record<string, unknown>>
  linkedSessions?: Array<Record<string, unknown>>
  linkSessionId?: string
  existingInvoices?: Array<Record<string, unknown>>
  schedule?: Partial<Record<string, unknown>>
  booking?: Partial<Record<string, unknown>>
  bookingStatus?: "confirmed" | "cancelled"
  series?: Partial<Record<string, unknown>> | null
  invoiceInsertError?: Error
  insertedPaymentSessions?: Array<Record<string, unknown>>
}) {
  const dialect = new PgDialect()
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

  const schedule = {
    id: "schedule_123",
    bookingId: "booking_123",
    bookingItemId: null,
    scheduleType: "deposit",
    status: "pending",
    amountCents: 5_000,
    currency: "EUR",
    dueDate: "2026-06-30",
    notes: null,
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    ...scheduleOverrides,
  }

  const series = seriesOverrides
    ? {
        id: "series_123",
        prefix: "INV",
        separator: "-",
        padLength: 5,
        currentSequence: 0,
        resetStrategy: "never",
        resetAt: null,
        active: true,
        scope: "invoice",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
        ...seriesOverrides,
      }
    : null
  let seriesSequence = Number(series?.currentSequence ?? 0)
  const executedSql: string[] = []

  const rowsFor = (table: unknown) => {
    if (table === invoiceNumberSeries)
      return series ? [{ ...series, currentSequence: seriesSequence }] : []
    if (table === bookingPaymentSchedules) return [schedule]
    if (table === invoices) return existingInvoices
    return []
  }

  const db = {
    execute: vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
      const statement = dialect.sqlToQuery(query).sql
      executedSql.push(statement)
      if (statement.includes("FROM invoice_number_series")) {
        if (!series) return []
        return [
          {
            id: series.id,
            prefix: series.prefix,
            separator: series.separator,
            pad_length: series.padLength,
            current_sequence: seriesSequence,
            reset_strategy: series.resetStrategy,
            reset_at: series.resetAt,
            active: series.active,
          },
        ]
      }
      if (statement.includes("FOR UPDATE") && !statement.includes("invoice_number_series")) {
        return [{ status: bookingStatus }]
      }
      return []
    }),
    transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) => {
      const sequenceBeforeTransaction = seriesSequence
      const invoiceCountBeforeTransaction = insertedInvoices.length
      const sessionCountBeforeTransaction = insertedPaymentSessions.length
      const linkCountBeforeTransaction = linkedSessions.length
      try {
        return await callback(db)
      } catch (error) {
        seriesSequence = sequenceBeforeTransaction
        insertedInvoices.length = invoiceCountBeforeTransaction
        insertedPaymentSessions.length = sessionCountBeforeTransaction
        linkedSessions.length = linkCountBeforeTransaction
        throw error
      }
    }),
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
          if (selectedTable === invoiceNumberSeries) {
            return Promise.resolve(rowsFor(selectedTable).slice(0, 1))
          }
          if (selectedTable === invoices) {
            return Promise.resolve(existingInvoices.slice(0, 1))
          }
          if (selectedTable === bookingPaymentSchedules) {
            return Promise.resolve([schedule])
          }
          return Promise.resolve([booking])
        },
      }
      return query
    },
    insert(table: unknown) {
      return {
        values(values: Record<string, unknown>) {
          if (table === invoices) {
            if (invoiceInsertError) throw invoiceInsertError
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
          if (table === paymentSessions) {
            insertedPaymentSessions.push(values)
            return {
              returning() {
                return Promise.resolve([
                  {
                    id: "ps_atomic_schedule",
                    invoiceId: null,
                    ...values,
                  },
                ])
              },
            }
          }
          return Promise.resolve(undefined)
        },
      }
    },
    update(table: unknown) {
      return {
        set(values: Record<string, unknown>) {
          return {
            where() {
              if (table === invoiceNumberSeries && values.currentSequence !== undefined) {
                seriesSequence = Number(values.currentSequence)
              }
              return {
                returning() {
                  if (table !== paymentSessions) {
                    return Promise.resolve([])
                  }
                  const row = {
                    id: linkSessionId,
                    invoiceId: values.invoiceId,
                    targetType: "booking_payment_schedule",
                  }
                  linkedSessions.push({ id: row.id, invoiceId: row.invoiceId })
                  return Promise.resolve([row])
                },
              }
            },
          }
        },
      }
    },
  }

  return Object.assign(db, {
    executedSql,
    getSeriesSequence: () => seriesSequence,
  })
}
