// agent-quality: file-size exception -- owner: finance; existing coverage file stays co-located until a dedicated split preserves behavior and tests.
import { PgDialect } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import {
  bookingItemTaxLines,
  bookingPaymentSchedules,
  invoiceExternalRefs,
  invoiceLineItems,
  invoiceNumberSeries,
  invoices,
} from "../../src/schema.js"
import {
  financeService,
  type InvoiceFromBookingData,
  type InvoiceFromBookingValidationError,
  type InvoiceLineItemsPersistenceError,
  type InvoiceNumberAllocationError,
  type InvoiceNumberConflictError,
} from "../../src/service.js"

const bookingData: InvoiceFromBookingData = {
  booking: {
    id: "book_123",
    bookingNumber: "BK-123",
    personId: null,
    organizationId: null,
    sellCurrency: "RON",
    baseCurrency: null,
    fxRateSetId: null,
    sellAmountCents: 12000,
    baseSellAmountCents: null,
  },
  items: [],
}

function series(overrides: Record<string, unknown> = {}) {
  return {
    id: "ins_123",
    code: "default",
    name: "Default",
    prefix: "INV",
    separator: "-",
    padLength: 4,
    currentSequence: 9,
    resetStrategy: "never",
    resetAt: null,
    scope: "invoice",
    isDefault: true,
    externalProvider: null,
    externalConfigKey: null,
    active: true,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
    ...overrides,
  }
}

function makeDb(options: {
  explicitSeries?: Record<string, unknown> | null
  defaultSeries?: Record<string, unknown> | null
  executeRowsObject?: boolean
  invoiceInsertError?: unknown
  invoiceLineItemsReturning?: Array<Record<string, unknown>>
  bookingItemTaxRows?: Array<Record<string, unknown>>
}) {
  const insertedInvoices: Array<Record<string, unknown>> = []
  const insertedInvoiceExternalRefs: Array<Record<string, unknown>> = []
  const insertedInvoiceLineItems: Array<Record<string, unknown>> = []
  const dialect = new PgDialect()
  const execute = vi.fn(async (query: Parameters<PgDialect["sqlToQuery"]>[0]) => {
    const { sql } = dialect.sqlToQuery(query)
    if (sql.includes("pg_advisory_xact_lock")) return []
    if (sql.includes("FROM bookings")) return [{ status: "confirmed" }]

    const row = options.explicitSeries ?? options.defaultSeries
    const rows = row
      ? [
          {
            id: row.id,
            prefix: row.prefix,
            separator: row.separator,
            pad_length: row.padLength,
            current_sequence: row.currentSequence,
            reset_strategy: row.resetStrategy,
            reset_at: row.resetAt,
            active: row.active,
          },
        ]
      : []
    return options.executeRowsObject ? { rows } : rows
  })

  const tx = {
    execute,
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => []),
      })),
    })),
    insert: vi.fn((table) => ({
      values: vi.fn((values) => {
        if (table === invoices) {
          if (options.invoiceInsertError) {
            throw options.invoiceInsertError
          }
          insertedInvoices.push(values)
          return {
            returning: vi.fn(async () => [
              {
                id: "inv_123",
                createdAt: new Date("2026-01-01T00:00:00.000Z"),
                updatedAt: new Date("2026-01-01T00:00:00.000Z"),
                ...values,
              },
            ]),
          }
        }
        if (table === invoiceLineItems) {
          insertedInvoiceLineItems.push(...values)
          return {
            returning: vi.fn(async () => options.invoiceLineItemsReturning ?? values),
          }
        }
        if (table === invoiceExternalRefs) {
          insertedInvoiceExternalRefs.push(...values)
          return Promise.resolve(values)
        }
        return { returning: vi.fn(async () => []) }
      }),
    })),
  }

  const db = {
    transaction: vi.fn(async (callback) => callback(tx)),
    select: vi.fn((selection?: unknown) => ({
      from: vi.fn((table) => {
        if (table !== invoiceNumberSeries) {
          const rows = table === bookingItemTaxLines ? (options.bookingItemTaxRows ?? []) : []
          if (selection) {
            return {
              where: vi.fn(() => ({
                orderBy: vi.fn(() => ({
                  limit: vi.fn(async () => rows),
                })),
              })),
            }
          }
          if (table === bookingItemTaxLines) {
            return {
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => rows),
              })),
            }
          }
          if (table === bookingPaymentSchedules) {
            return {
              where: vi.fn(() => ({
                orderBy: vi.fn(async () => rows),
              })),
            }
          }
          return { where: vi.fn(async () => rows) }
        }
        return {
          where: vi.fn(() => ({
            limit: vi.fn(async () =>
              options.explicitSeries === undefined
                ? []
                : options.explicitSeries
                  ? [options.explicitSeries]
                  : [],
            ),
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () =>
                options.defaultSeries === undefined
                  ? []
                  : options.defaultSeries
                    ? [options.defaultSeries]
                    : [],
              ),
            })),
          })),
        }
      }),
    })),
  }

  Object.assign(tx, {
    select: db.select,
    transaction: vi.fn(async (callback: (writer: typeof tx) => Promise<unknown>) => callback(tx)),
  })

  return {
    db: db as never,
    tx,
    insertedInvoices,
    insertedInvoiceExternalRefs,
    insertedInvoiceLineItems,
  }
}

function expectOnlyBookingFinanceFence(execute: ReturnType<typeof vi.fn>) {
  const dialect = new PgDialect()
  const statements = execute.mock.calls.map(([query]) => dialect.sqlToQuery(query).sql)

  expect(statements).toHaveLength(2)
  expect(statements[0]).toContain("pg_advisory_xact_lock")
  expect(statements[1]).toContain("FROM bookings")
  expect(statements[1]).toContain("FOR UPDATE")
}

describe("financeService.createInvoiceFromBooking number allocation", () => {
  it("uses a caller-supplied invoice number without allocating a series", async () => {
    const { db, tx, insertedInvoices } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      bookingData,
    )

    expectOnlyBookingFinanceFence(tx.execute)
    expect(insertedInvoices[0]).toMatchObject({
      invoiceNumber: "MANUAL-1",
      seriesId: null,
      sequence: null,
      status: "draft",
    })
  })

  it("allocates from an explicit local series when invoiceNumber is omitted", async () => {
    const { db, insertedInvoices } = makeDb({ explicitSeries: series() })

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        seriesId: "ins_123",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      bookingData,
    )

    expect(insertedInvoices[0]).toMatchObject({
      invoiceNumber: "INV-0010",
      seriesId: "ins_123",
      sequence: 10,
      status: "draft",
    })
  })

  it("allocates from the default active series when no seriesId is supplied", async () => {
    const { db, insertedInvoices } = makeDb({ defaultSeries: series({ id: "ins_default" }) })

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      bookingData,
    )

    expect(insertedInvoices[0]).toMatchObject({
      invoiceNumber: "INV-0010",
      seriesId: "ins_default",
      sequence: 10,
    })
  })

  it("allocates when raw Postgres execution returns a rows object", async () => {
    const { db, insertedInvoices } = makeDb({
      explicitSeries: series(),
      executeRowsObject: true,
    })

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        seriesId: "ins_123",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      bookingData,
    )

    expect(insertedInvoices[0]).toMatchObject({
      invoiceNumber: "INV-0010",
      seriesId: "ins_123",
      sequence: 10,
      status: "draft",
    })
  })

  it("returns a structured error when no active series exists for omitted numbers", async () => {
    const { db } = makeDb({ defaultSeries: null })

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
        },
        bookingData,
      ),
    ).rejects.toMatchObject({
      code: "no_active_series_for_scope",
      scope: "invoice",
    } satisfies Partial<InvoiceNumberAllocationError>)
  })

  it("uses a pending placeholder for external-provider series", async () => {
    const { db, tx, insertedInvoices } = makeDb({
      explicitSeries: series({ externalProvider: "smartbill" }),
    })

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        seriesId: "ins_123",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      bookingData,
    )

    expectOnlyBookingFinanceFence(tx.execute)
    expect(insertedInvoices[0]?.invoiceNumber).toMatch(/^PENDING-INVOICE-/)
    expect(insertedInvoices[0]).toMatchObject({
      seriesId: "ins_123",
      sequence: null,
      status: "pending_external_allocation",
    })
  })

  it("normalizes duplicate invoice numbers into a typed conflict", async () => {
    const { db } = makeDb({
      invoiceInsertError: {
        code: "23505",
        constraint: "invoices_invoice_number_unique",
      },
    })

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "MANUAL-1",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
        },
        bookingData,
      ),
    ).rejects.toMatchObject({
      name: "InvoiceNumberConflictError",
      code: "invoice_number_conflict",
      invoiceNumber: "MANUAL-1",
    } satisfies Partial<InvoiceNumberConflictError>)
  })

  it("normalizes message-only serverless duplicate invoice number errors into a typed conflict", async () => {
    const { db } = makeDb({
      invoiceInsertError: new Error(
        'NeonDbError: duplicate key value violates unique index "invoices_invoice_number_type_active_idx" (SQLSTATE 23505)',
      ),
    })

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "MANUAL-1",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
        },
        bookingData,
      ),
    ).rejects.toMatchObject({
      name: "InvoiceNumberConflictError",
      code: "invoice_number_conflict",
      invoiceNumber: "MANUAL-1",
    } satisfies Partial<InvoiceNumberConflictError>)
  })

  it("does not normalize unrelated unique violations into invoice number conflicts", async () => {
    const { db } = makeDb({
      invoiceInsertError: {
        code: "23505",
        constraint: "invoice_external_refs_provider_external_id_unique",
      },
    })

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "MANUAL-1",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
        },
        bookingData,
      ),
    ).rejects.toMatchObject({
      code: "23505",
      constraint: "invoice_external_refs_provider_external_id_unique",
    })
  })

  it("uses override line items and computes cross-currency base totals", async () => {
    const { db, insertedInvoices, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
        currency: "RON",
        baseCurrency: "EUR",
        lineItems: [
          {
            description: "SmartBill fiscal line",
            quantity: 1,
            unitAmountCents: 50_000,
            taxRateBps: 1_900,
          },
        ],
      },
      {
        booking: {
          ...bookingData.booking,
          sellCurrency: "EUR",
        },
        items: [
          {
            id: "bkit_123",
            title: "Catalog line that should be replaced",
            quantity: 1,
            unitSellAmountCents: 12_000,
            totalSellAmountCents: 12_000,
          },
        ],
      },
      {
        resolveInvoiceExchangeRate: vi.fn(async () => ({ rate: 0.2, fxRateSetId: "fxrs_123" })),
      },
    )

    expect(insertedInvoices[0]).toMatchObject({
      currency: "RON",
      baseCurrency: "EUR",
      fxRateSetId: "fxrs_123",
      subtotalCents: 50_000,
      taxCents: 9_500,
      totalCents: 59_500,
      baseTotalCents: 11_900,
      balanceDueCents: 59_500,
      baseBalanceDueCents: 11_900,
    })
    expect(insertedInvoiceLineItems).toEqual([
      expect.objectContaining({
        bookingItemId: null,
        description: "SmartBill fiscal line",
        quantity: 1,
        unitPriceCents: 50_000,
        totalCents: 50_000,
        taxRate: 19,
        sortOrder: 0,
      }),
    ])
  })

  it("uses product and service date for full-booking item fallback descriptions", async () => {
    const { db, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      {
        ...bookingData,
        items: [
          {
            id: "bkit_123",
            title: "Adult",
            productNameSnapshot:
              "Excursie de 1 Zi in Bulgaria: Cascadele Krushuna, Pestera Devetashka si Fortareata Lovech",
            serviceDate: "2026-08-22",
            quantity: 1,
            unitSellAmountCents: 50_000,
            totalSellAmountCents: 50_000,
          },
        ],
      },
    )

    expect(insertedInvoiceLineItems).toEqual([
      expect.objectContaining({
        bookingItemId: "bkit_123",
        bookingPaymentScheduleId: null,
        description:
          "Excursie de 1 Zi in Bulgaria: Cascadele Krushuna, Pestera Devetashka si Fortareata Lovech | 2026-08-22",
        quantity: 1,
        unitPriceCents: 50_000,
        totalCents: 50_000,
        sortOrder: 0,
      }),
    ])
  })

  it("persists payment schedule context on schedule-derived line items", async () => {
    const { db, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      {
        booking: {
          ...bookingData.booking,
          bookingNumber: "BK-2605-5046",
          sellAmountCents: 64_000,
          startDate: "2026-06-13",
          endDate: "2026-06-13",
        },
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: "bkit_123",
          scheduleType: "deposit",
          dueDate: "2026-06-01",
          currency: "RON",
          amountCents: 32_000,
        },
        items: [
          {
            id: "bkit_123",
            title: "Excursie Bulgaria",
            quantity: 2,
            unitSellAmountCents: 32_000,
            totalSellAmountCents: 64_000,
          },
        ],
      },
    )

    expect(insertedInvoiceLineItems).toEqual([
      expect.objectContaining({
        bookingItemId: "bkit_123",
        bookingPaymentScheduleId: "bps_123",
        description: "Deposit 50% Excursie Bulgaria | 2026-06-13",
        quantity: 1,
        unitPriceCents: 32_000,
        totalCents: 32_000,
        taxRate: null,
        sortOrder: 0,
      }),
    ])
  })

  it("counts excluded booking tax exactly once in a payment-schedule invoice", async () => {
    const { db, insertedInvoices, insertedInvoiceLineItems } = makeDb({
      bookingItemTaxRows: [
        {
          bookingItemId: "bkit_123",
          scope: "excluded",
          includedInPrice: false,
          amountCents: 10_000,
        },
      ],
    })

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      {
        booking: {
          ...bookingData.booking,
          sellAmountCents: 60_000,
        },
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: "bkit_123",
          scheduleType: "balance",
          dueDate: "2026-06-23",
          currency: "RON",
          amountCents: 60_000,
        },
        items: [
          {
            id: "bkit_123",
            title: "Taxable booking",
            quantity: 1,
            unitSellAmountCents: 50_000,
            totalSellAmountCents: 50_000,
          },
        ],
      },
    )

    expect(insertedInvoiceLineItems).toEqual([
      expect.objectContaining({ unitPriceCents: 60_000, totalCents: 60_000 }),
    ])
    expect(insertedInvoices[0]).toMatchObject({
      subtotalCents: 50_000,
      taxCents: 10_000,
      totalCents: 60_000,
    })
  })

  it("uses only the linked item's taxes and schedule cohort for an item schedule", async () => {
    const { db, insertedInvoices } = makeDb({
      bookingItemTaxRows: [
        {
          bookingItemId: "bkit_selected",
          scope: "included",
          includedInPrice: true,
          amountCents: 100,
        },
        {
          bookingItemId: "bkit_sibling",
          scope: "included",
          includedInPrice: true,
          amountCents: 900,
        },
      ],
    })
    const selectedSchedule = {
      id: "bps_selected",
      bookingId: "book_123",
      bookingItemId: "bkit_selected",
      scheduleType: "deposit" as const,
      dueDate: "2026-06-01",
      currency: "RON",
      amountCents: 5_000,
    }

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-ITEM-TAX",
        issueDate: "2026-05-23",
        dueDate: "2026-06-01",
      },
      {
        booking: { ...bookingData.booking, sellAmountCents: 15_000 },
        paymentSchedule: selectedSchedule,
        paymentSchedules: [
          selectedSchedule,
          {
            id: "bps_sibling",
            bookingId: "book_123",
            bookingItemId: "bkit_sibling",
            scheduleType: "balance",
            dueDate: "2026-06-23",
            currency: "RON",
            amountCents: 10_000,
          },
        ],
        items: [
          {
            id: "bkit_selected",
            title: "Selected item",
            quantity: 1,
            unitSellAmountCents: 5_000,
            totalSellAmountCents: 5_000,
          },
          {
            id: "bkit_sibling",
            title: "Sibling item",
            quantity: 1,
            unitSellAmountCents: 10_000,
            totalSellAmountCents: 10_000,
          },
        ],
      },
    )

    expect(insertedInvoices[0]).toMatchObject({
      subtotalCents: 4_900,
      taxCents: 100,
      totalCents: 5_000,
    })
  })

  it("allocates combined included and excluded tax cents once across payment schedules", async () => {
    const { db, insertedInvoices } = makeDb({
      bookingItemTaxRows: [
        {
          bookingItemId: "bkit_123",
          scope: "included",
          includedInPrice: true,
          amountCents: 1,
        },
        {
          bookingItemId: "bkit_123",
          scope: "excluded",
          includedInPrice: false,
          amountCents: 1,
        },
      ],
    })
    const paymentSchedules = [
      {
        id: "bps_a",
        bookingId: "book_123",
        bookingItemId: "bkit_123",
        scheduleType: "deposit" as const,
        dueDate: "2026-06-01",
        currency: "RON",
        amountCents: 1,
      },
      {
        id: "bps_b",
        bookingId: "book_123",
        bookingItemId: "bkit_123",
        scheduleType: "balance" as const,
        dueDate: "2026-06-23",
        currency: "RON",
        amountCents: 1,
      },
    ]
    const data = {
      booking: { ...bookingData.booking, sellAmountCents: 2 },
      paymentSchedules,
      items: [
        {
          id: "bkit_123",
          title: "Taxable booking",
          quantity: 1,
          unitSellAmountCents: 2,
          totalSellAmountCents: 2,
        },
      ],
    }

    for (const paymentSchedule of paymentSchedules) {
      await financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: `MANUAL-${paymentSchedule.id}`,
          issueDate: "2026-05-23",
          dueDate: paymentSchedule.dueDate,
        },
        { ...data, paymentSchedule },
      )
    }

    expect(insertedInvoices.map((invoice) => invoice.taxCents)).toEqual([1, 1])
    expect(insertedInvoices.reduce((sum, invoice) => sum + Number(invoice.taxCents), 0)).toBe(2)
    for (const invoice of insertedInvoices) {
      expect(invoice.taxCents).toBeLessThanOrEqual(invoice.totalCents)
    }
  })

  it("converts booking tax before allocating it to cross-currency schedules", async () => {
    const { db, insertedInvoices } = makeDb({
      bookingItemTaxRows: [
        {
          bookingItemId: "bkit_123",
          scope: "included",
          includedInPrice: true,
          amountCents: 10,
        },
      ],
    })
    const resolveInvoiceExchangeRate = vi.fn(async () => ({ rate: 2, fxRateSetId: "fxrs_123" }))
    const paymentSchedules = [
      {
        id: "bps_a",
        bookingId: "book_123",
        bookingItemId: "bkit_123",
        scheduleType: "deposit" as const,
        dueDate: "2026-06-01",
        currency: "USD",
        amountCents: 100,
      },
      {
        id: "bps_b",
        bookingId: "book_123",
        bookingItemId: "bkit_123",
        scheduleType: "balance" as const,
        dueDate: "2026-06-23",
        currency: "USD",
        amountCents: 100,
      },
    ]

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-USD",
        issueDate: "2026-05-23",
        dueDate: "2026-06-01",
      },
      {
        booking: {
          ...bookingData.booking,
          sellCurrency: "EUR",
          fxRateSetId: "fxrs_123",
          sellAmountCents: 100,
        },
        paymentSchedule: paymentSchedules[0],
        paymentSchedules,
        items: [
          {
            id: "bkit_123",
            title: "Taxable booking",
            quantity: 1,
            unitSellAmountCents: 100,
            totalSellAmountCents: 100,
          },
        ],
      },
      { resolveInvoiceExchangeRate },
    )

    expect(resolveInvoiceExchangeRate).toHaveBeenCalledWith({
      baseCurrency: "EUR",
      quoteCurrency: "USD",
      date: "2026-05-23",
    })
    expect(insertedInvoices[0]).toMatchObject({
      currency: "USD",
      subtotalCents: 90,
      taxCents: 10,
      totalCents: 100,
    })
  })

  it("allocates booking tax once across a mixed-currency schedule cohort", async () => {
    const { db, insertedInvoices } = makeDb({
      bookingItemTaxRows: [
        {
          bookingItemId: "bkit_123",
          scope: "included",
          includedInPrice: true,
          amountCents: 10,
        },
      ],
    })
    const resolveInvoiceExchangeRate = vi.fn(async ({ baseCurrency, quoteCurrency }) => {
      if (baseCurrency === "EUR" && quoteCurrency === "USD") {
        return { rate: 2, fxRateSetId: "fxrs_123" }
      }
      if (baseCurrency === "USD" && quoteCurrency === "EUR") {
        return { rate: 0.5, fxRateSetId: "fxrs_123" }
      }
      return null
    })
    const paymentSchedules = [
      {
        id: "bps_eur",
        bookingId: "book_123",
        bookingItemId: "bkit_123",
        scheduleType: "deposit" as const,
        dueDate: "2026-06-01",
        currency: "EUR",
        amountCents: 50,
      },
      {
        id: "bps_usd",
        bookingId: "book_123",
        bookingItemId: "bkit_123",
        scheduleType: "balance" as const,
        dueDate: "2026-06-23",
        currency: "USD",
        amountCents: 100,
      },
    ]
    const data = {
      booking: {
        ...bookingData.booking,
        sellCurrency: "EUR",
        fxRateSetId: "fxrs_123",
        sellAmountCents: 100,
      },
      paymentSchedules,
      items: [
        {
          id: "bkit_123",
          title: "Mixed-currency taxable booking",
          quantity: 1,
          unitSellAmountCents: 100,
          totalSellAmountCents: 100,
        },
      ],
    }

    for (const paymentSchedule of paymentSchedules) {
      await financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: `MANUAL-${paymentSchedule.id}`,
          issueDate: "2026-05-23",
          dueDate: paymentSchedule.dueDate,
        },
        { ...data, paymentSchedule },
        { resolveInvoiceExchangeRate },
      )
    }

    expect(insertedInvoices).toEqual([
      expect.objectContaining({ currency: "EUR", taxCents: 5, totalCents: 50 }),
      expect.objectContaining({ currency: "USD", taxCents: 10, totalCents: 100 }),
    ])
  })

  it("rejects an invalid schedule currency before resolving tax FX", async () => {
    const { db } = makeDb({
      bookingItemTaxRows: [
        {
          bookingItemId: "bkit_123",
          scope: "included",
          includedInPrice: true,
          amountCents: 10,
        },
      ],
    })
    const resolveInvoiceExchangeRate = vi.fn()
    const paymentSchedule = {
      id: "bps_invalid_currency",
      bookingId: "book_123",
      bookingItemId: "bkit_123",
      scheduleType: "deposit" as const,
      dueDate: "2026-06-01",
      currency: " ",
      amountCents: 50,
    }

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "MANUAL-INVALID-CURRENCY",
          issueDate: "2026-05-23",
          dueDate: paymentSchedule.dueDate,
        },
        {
          booking: { ...bookingData.booking, sellCurrency: "EUR" },
          paymentSchedule,
          paymentSchedules: [paymentSchedule],
          items: [
            {
              id: "bkit_123",
              title: "Taxable booking",
              quantity: 1,
              unitSellAmountCents: 50,
              totalSellAmountCents: 50,
            },
          ],
        },
        { resolveInvoiceExchangeRate },
      ),
    ).rejects.toThrow("Payment schedule currency must be a valid three-letter currency code")
    expect(resolveInvoiceExchangeRate).not.toHaveBeenCalled()
  })

  it("uses booking item snapshots for schedule descriptions without an item link", async () => {
    const { db, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      {
        booking: {
          ...bookingData.booking,
          bookingNumber: "BK-2605-5046",
          sellAmountCents: 64_000,
          startDate: "2026-06-13",
          endDate: "2026-06-13",
        },
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: null,
          scheduleType: "balance",
          dueDate: "2026-06-01",
          currency: "RON",
          amountCents: 32_000,
        },
        items: [
          {
            id: "bkit_999",
            title: "Later booking item title",
            productNameSnapshot: "Zanzibar Cruise",
            quantity: 1,
            startDate: "2026-06-20",
            unitSellAmountCents: 32_000,
            totalSellAmountCents: 32_000,
          },
          {
            id: "bkit_123",
            title: "Fallback booking item title",
            productNameSnapshot: "Excursie Bulgaria",
            quantity: 2,
            startDate: "2026-06-18",
            unitSellAmountCents: 32_000,
            totalSellAmountCents: 64_000,
          },
        ],
      },
    )

    expect(insertedInvoiceLineItems).toEqual([
      expect.objectContaining({
        bookingItemId: null,
        bookingPaymentScheduleId: "bps_123",
        description: "Balance 50% Excursie Bulgaria | 2026-06-18",
        quantity: 1,
        unitPriceCents: 32_000,
        totalCents: 32_000,
      }),
    ])
  })

  it("uses service date fields for direct payment schedule line descriptions", async () => {
    const { db, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      {
        booking: {
          ...bookingData.booking,
          bookingNumber: "BK-2605-5046",
          sellAmountCents: 64_000,
        },
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: null,
          scheduleType: "balance",
          dueDate: "2026-06-01",
          currency: "RON",
          amountCents: 32_000,
        },
        items: [
          {
            id: "bkit_123",
            title: "Fallback booking item title",
            productNameSnapshot: "Excursie Bulgaria",
            serviceDate: "2026-08-22",
            startsAt: "2026-08-22T06:00:00.000Z",
            quantity: 2,
            unitSellAmountCents: 32_000,
            totalSellAmountCents: 64_000,
          },
        ],
      },
    )

    expect(insertedInvoiceLineItems[0]).toMatchObject({
      bookingItemId: null,
      bookingPaymentScheduleId: "bps_123",
      description: "Balance 50% Excursie Bulgaria | 2026-08-22",
    })
  })

  it("supports product-only schedule line descriptions from runtime options", async () => {
    const { db, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      {
        booking: {
          ...bookingData.booking,
          bookingNumber: "BK-2605-5046",
          sellAmountCents: 64_000,
          startDate: "2026-06-13",
          endDate: "2026-06-13",
        },
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: null,
          scheduleType: "balance",
          dueDate: "2026-06-01",
          currency: "RON",
          amountCents: 32_000,
        },
        items: [
          {
            id: "bkit_123",
            title: "Fallback booking item title",
            productNameSnapshot: "Excursie Bulgaria",
            quantity: 2,
            startDate: "2026-06-18",
            unitSellAmountCents: 32_000,
            totalSellAmountCents: 64_000,
          },
        ],
      },
      { paymentScheduleLineDescriptionFormat: "product_only" },
    )

    expect(insertedInvoiceLineItems[0]).toMatchObject({
      bookingItemId: null,
      bookingPaymentScheduleId: "bps_123",
      description: "Excursie Bulgaria | 2026-06-18",
    })
  })

  it("lets invoice-from-booking callers choose product-first schedule line descriptions", async () => {
    const { db, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
        paymentScheduleLineDescriptionFormat: "product_first",
      },
      {
        booking: {
          ...bookingData.booking,
          bookingNumber: "BK-2605-5046",
          sellAmountCents: 64_000,
          startDate: "2026-06-13",
          endDate: "2026-06-13",
        },
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: null,
          scheduleType: "balance",
          dueDate: "2026-06-01",
          currency: "RON",
          amountCents: 32_000,
        },
        items: [
          {
            id: "bkit_123",
            title: "Fallback booking item title",
            productNameSnapshot: "Excursie Bulgaria",
            quantity: 2,
            startDate: "2026-06-18",
            unitSellAmountCents: 32_000,
            totalSellAmountCents: 64_000,
          },
        ],
      },
      { paymentScheduleLineDescriptionFormat: "product_only" },
    )

    expect(insertedInvoiceLineItems[0]).toMatchObject({
      bookingItemId: null,
      bookingPaymentScheduleId: "bps_123",
      description: "Excursie Bulgaria - Balance 50% | 2026-06-18",
    })
  })

  it("lets callers override schedule line descriptions", async () => {
    const { db, insertedInvoiceLineItems } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
      },
      {
        ...bookingData,
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: null,
          scheduleType: "balance",
          dueDate: "2026-06-01",
          currency: "RON",
          amountCents: 12_000,
        },
      },
      {
        descriptionResolver: async ({ booking, schedule, line }) =>
          `${schedule?.scheduleType}:${booking.bookingNumber}:${line.totalCents}`,
      },
    )

    expect(insertedInvoiceLineItems[0]).toMatchObject({
      bookingItemId: null,
      bookingPaymentScheduleId: "bps_123",
      description: "balance:BK-123:12000",
    })
  })

  it("lets callers resolve schedule-derived invoice due dates", async () => {
    const { db, insertedInvoices } = makeDb({})
    const invoiceDueDateResolver = vi.fn(({ issueDate }) => issueDate)

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "MANUAL-1",
        issueDate: "2026-05-23",
        dueDate: "2026-05-01",
        invoiceType: "proforma",
      },
      {
        ...bookingData,
        paymentSchedule: {
          id: "bps_123",
          bookingId: "book_123",
          bookingItemId: null,
          scheduleType: "balance",
          dueDate: "2026-05-01",
          currency: "RON",
          amountCents: 12_000,
        },
      },
      { invoiceDueDateResolver },
    )

    expect(invoiceDueDateResolver).toHaveBeenCalledWith({
      issueDate: "2026-05-23",
      dueDate: "2026-05-01",
      invoiceType: "proforma",
      booking: bookingData.booking,
      bookingPaymentSchedule: {
        id: "bps_123",
        bookingId: "book_123",
        bookingItemId: null,
        scheduleType: "balance",
        dueDate: "2026-05-01",
        currency: "RON",
        amountCents: 12_000,
      },
    })
    expect(insertedInvoices[0]).toMatchObject({
      dueDate: "2026-05-23",
    })
  })

  it("persists external refs in the invoice transaction", async () => {
    const { db, insertedInvoiceExternalRefs } = makeDb({})

    await financeService.createInvoiceFromBooking(
      db,
      {
        bookingId: "book_123",
        invoiceNumber: "SB-42",
        issueDate: "2026-05-23",
        dueDate: "2026-06-23",
        externalRefs: [
          {
            provider: "smartbill",
            externalId: "remote_42",
            externalNumber: "42",
            externalUrl: "https://smartbill.test/invoices/42",
            status: "issued",
            metadata: { companyVatCode: "RO12345678" },
            syncedAt: "2026-05-23T10:30:00.000Z",
          },
        ],
      },
      bookingData,
    )

    expect(insertedInvoiceExternalRefs).toEqual([
      expect.objectContaining({
        invoiceId: "inv_123",
        provider: "smartbill",
        externalId: "remote_42",
        externalNumber: "42",
        externalUrl: "https://smartbill.test/invoices/42",
        status: "issued",
        metadata: { companyVatCode: "RO12345678" },
        syncedAt: new Date("2026-05-23T10:30:00.000Z"),
        syncError: null,
      }),
    ])
  })

  it("fails the transaction when override line items are not persisted", async () => {
    const { db } = makeDb({ invoiceLineItemsReturning: [] })

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "SB-42",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
          lineItems: [
            {
              description: "SmartBill fiscal line",
              quantity: 1,
              unitAmountCents: 50_000,
              taxRateBps: 1_900,
            },
          ],
          externalRefs: [
            {
              provider: "smartbill",
              externalNumber: "42",
              status: "issued",
            },
          ],
        },
        bookingData,
      ),
    ).rejects.toMatchObject({
      name: "InvoiceLineItemsPersistenceError",
      code: "invoice_line_items_not_persisted",
      invoiceId: "inv_123",
      expectedCount: 1,
      actualCount: 0,
    } satisfies Partial<InvoiceLineItemsPersistenceError>)
  })

  it("rejects cross-currency overrides without the booking sell currency as base", async () => {
    const { db } = makeDb({})

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "MANUAL-1",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
          currency: "RON",
          lineItems: [
            {
              description: "SmartBill fiscal line",
              quantity: 1,
              unitAmountCents: 50_000,
            },
          ],
        },
        {
          booking: {
            ...bookingData.booking,
            sellCurrency: "EUR",
          },
          items: [],
        },
      ),
    ).rejects.toMatchObject({
      code: "invalid_invoice_from_booking",
    } satisfies Partial<InvoiceFromBookingValidationError>)
  })

  it("rejects cross-currency overrides without replacement line items", async () => {
    const { db } = makeDb({})

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "MANUAL-1",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
          currency: "RON",
          baseCurrency: "EUR",
        },
        {
          booking: {
            ...bookingData.booking,
            sellCurrency: "EUR",
          },
          items: [
            {
              id: "bkit_123",
              title: "Catalog line that must not be relabeled",
              quantity: 1,
              unitSellAmountCents: 12_000,
              totalSellAmountCents: 12_000,
            },
          ],
        },
      ),
    ).rejects.toMatchObject({
      code: "invalid_invoice_from_booking",
      message: "Cross-currency invoice overrides require replacement line items",
    } satisfies Partial<InvoiceFromBookingValidationError>)
  })

  it("rejects override totals that do not match the supplied line items", async () => {
    const { db } = makeDb({})

    await expect(
      financeService.createInvoiceFromBooking(
        db,
        {
          bookingId: "book_123",
          invoiceNumber: "MANUAL-1",
          issueDate: "2026-05-23",
          dueDate: "2026-06-23",
          subtotalCents: 40_000,
          lineItems: [
            {
              description: "SmartBill fiscal line",
              quantity: 1,
              unitAmountCents: 50_000,
            },
          ],
        },
        bookingData,
      ),
    ).rejects.toMatchObject({
      code: "invalid_invoice_from_booking",
    } satisfies Partial<InvoiceFromBookingValidationError>)
  })
})

describe("financeService.applyExternalInvoiceAllocation", () => {
  const pendingInvoice = {
    id: "inv_new",
    invoiceNumber: "PENDING-PROFORMA-abc",
    invoiceType: "proforma",
    bookingId: "book_123",
    personId: null,
    organizationId: null,
    status: "pending_external_allocation",
    currency: "RON",
    baseCurrency: null,
    fxRateSetId: null,
    subtotalCents: 12_000,
    baseSubtotalCents: null,
    taxCents: 0,
    baseTaxCents: null,
    totalCents: 12_000,
    baseTotalCents: null,
    paidCents: 0,
    basePaidCents: null,
    balanceDueCents: 12_000,
    baseBalanceDueCents: null,
    commissionPercent: null,
    commissionAmountCents: null,
    issueDate: "2026-05-23",
    dueDate: "2026-06-23",
    notes: null,
    voidedAt: null,
    voidReason: null,
    convertedFromInvoiceId: null,
    seriesId: null,
    sequence: null,
    templateId: null,
    taxRegimeId: null,
    language: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  }

  function makeExternalAllocationDb(options: {
    existing?: Record<string, unknown>
    updateError?: unknown
  }) {
    const updates: Array<Record<string, unknown>> = []
    const db = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => (options.existing ? [options.existing] : [])),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values) => {
          updates.push(values)
          return {
            where: vi.fn(() => ({
              returning: vi.fn(async () => {
                if (options.updateError) throw options.updateError
                return options.existing ? [{ ...options.existing, ...values }] : []
              }),
            })),
          }
        }),
      })),
    }

    return { db: db as never, updates }
  }

  it("applies an external provider invoice number to pending invoices", async () => {
    const { db, updates } = makeExternalAllocationDb({ existing: pendingInvoice })

    const result = await financeService.applyExternalInvoiceAllocation(db, "inv_new", {
      invoiceNumber: "B-0133",
    })

    expect(result.status).toBe("applied")
    expect(updates[0]).toMatchObject({
      invoiceNumber: "B-0133",
      status: "issued",
    })
  })

  it("normalizes duplicate external allocation numbers into a typed conflict", async () => {
    const { db } = makeExternalAllocationDb({
      existing: pendingInvoice,
      updateError: {
        code: "23505",
        constraint: "invoices_invoice_number_type_active_idx",
      },
    })

    await expect(
      financeService.applyExternalInvoiceAllocation(db, "inv_new", {
        invoiceNumber: "B-0133",
      }),
    ).rejects.toMatchObject({
      name: "InvoiceNumberConflictError",
      code: "invoice_number_conflict",
      invoiceNumber: "B-0133",
    } satisfies Partial<InvoiceNumberConflictError>)
  })
})

describe("financeService.updateInvoice number writeback", () => {
  function makeUpdateInvoiceDb(updateError: unknown) {
    return {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            limit: vi.fn(async () => [{ bookingId: "book_existing" }]),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({
          where: vi.fn(() => ({
            returning: vi.fn(async () => {
              throw updateError
            }),
          })),
        })),
      })),
    } as never
  }

  it("normalizes duplicate writeback numbers into a typed conflict", async () => {
    const db = makeUpdateInvoiceDb({
      cause: {
        code: "23505",
        detail: "Key (invoice_number, invoice_type)=(B-0133, invoice) already exists.",
      },
    })

    await expect(
      financeService.updateInvoice(db, "inv_new", {
        invoiceNumber: "B-0133",
      }),
    ).rejects.toMatchObject({
      name: "InvoiceNumberConflictError",
      code: "invoice_number_conflict",
      invoiceNumber: "B-0133",
    } satisfies Partial<InvoiceNumberConflictError>)
  })
})

describe("financeService.ensureExternalInvoiceNumberSeries", () => {
  it("creates default external-provider placeholder series per scope", async () => {
    const insertedRows: Array<Record<string, unknown>> = []
    const updates: Array<Record<string, unknown>> = []
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => ({
            orderBy: vi.fn(() => ({
              limit: vi.fn(async () => []),
            })),
            limit: vi.fn(async () => []),
          })),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn((values) => ({
          where: vi.fn(async () => {
            updates.push(values)
            return []
          }),
        })),
      })),
      insert: vi.fn(() => ({
        values: vi.fn((values) => ({
          returning: vi.fn(async () => {
            const row = {
              id: `ins_${insertedRows.length + 1}`,
              createdAt: new Date("2026-01-01T00:00:00.000Z"),
              updatedAt: new Date("2026-01-01T00:00:00.000Z"),
              ...values,
            }
            insertedRows.push(row)
            return [row]
          }),
        })),
      })),
    }
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never

    const rows = await financeService.ensureExternalInvoiceNumberSeries(db, [
      {
        provider: "smartbill",
        scope: "invoice",
        code: "smartbill-invoice",
        name: "SmartBill invoices",
        externalConfigKey: "FCT",
      },
      {
        provider: "smartbill",
        scope: "proforma",
        code: "smartbill-proforma",
        name: "SmartBill proformas",
        externalConfigKey: "PRO",
      },
    ])

    expect(rows).toHaveLength(2)
    expect(insertedRows).toEqual([
      expect.objectContaining({
        code: "smartbill-invoice",
        scope: "invoice",
        name: "SmartBill invoices",
        externalProvider: "smartbill",
        externalConfigKey: "FCT",
        isDefault: true,
        active: true,
        padLength: 0,
        currentSequence: 0,
      }),
      expect.objectContaining({
        code: "smartbill-proforma",
        scope: "proforma",
        name: "SmartBill proformas",
        externalProvider: "smartbill",
        externalConfigKey: "PRO",
        isDefault: true,
        active: true,
        padLength: 0,
        currentSequence: 0,
      }),
    ])
    expect(updates).toEqual([
      expect.objectContaining({ isDefault: false }),
      expect.objectContaining({ isDefault: false }),
    ])
  })

  it("rejects code collisions from another provider or local series", async () => {
    const existingManualSeries = series({
      id: "ins_manual",
      code: "smartbill-invoice",
      scope: "invoice",
      externalProvider: null,
    })
    let selectIndex = 0
    const tx = {
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn(() => {
            selectIndex += 1
            return {
              orderBy: vi.fn(() => ({
                limit: vi.fn(async () => []),
              })),
              limit: vi.fn(async () => (selectIndex === 2 ? [existingManualSeries] : [])),
            }
          }),
        })),
      })),
      update: vi.fn(),
      insert: vi.fn(),
    }
    const db = {
      transaction: vi.fn(async (callback) => callback(tx)),
    } as never

    await expect(
      financeService.ensureExternalInvoiceNumberSeries(db, [
        {
          provider: "smartbill",
          scope: "invoice",
          code: "smartbill-invoice",
          name: "SmartBill invoices",
        },
      ]),
    ).rejects.toMatchObject({
      name: "ExternalInvoiceNumberSeriesCollisionError",
      code: "external_invoice_number_series_code_conflict",
      seriesCode: "smartbill-invoice",
      provider: "smartbill",
      scope: "invoice",
      existingProvider: null,
      existingScope: "invoice",
    })
    expect(tx.update).not.toHaveBeenCalled()
    expect(tx.insert).not.toHaveBeenCalled()
  })
})
