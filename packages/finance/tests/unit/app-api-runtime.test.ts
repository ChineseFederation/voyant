import { bookings } from "@voyant-travel/bookings/schema"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createFinanceAppApiRuntime } from "../../src/app-api-runtime.js"
import {
  invoiceExternalPaymentIdentifiers,
  invoiceExternalSyncObservations,
  invoiceLineItems,
  invoiceNumberSeries,
  invoiceRenditions,
  invoices,
  taxRegimes,
} from "../../src/schema.js"
import { financeService } from "../../src/service.js"

function postgresStub(implementation: object): PostgresJsDatabase {
  const db = Object.create(null) as PostgresJsDatabase
  Object.assign(db, implementation)
  return db
}

describe("finance App API runtime", () => {
  afterEach(() => vi.restoreAllMocks())

  it("hydrates provider-neutral accounting fields required for remote issuance", async () => {
    const rows = new Map<unknown, unknown[]>([
      [
        invoices,
        [
          {
            id: "inv_1",
            invoiceNumber: "PENDING-1",
            invoiceType: "invoice",
            bookingId: "book_1",
            status: "pending_external_allocation",
            seriesId: "series_1",
            taxRegimeId: "tax_1",
            language: "ro",
            currency: "EUR",
            baseCurrency: "RON",
            fxRateSetId: "fxset_1",
            subtotalCents: 8_000,
            baseSubtotalCents: 40_000,
            taxCents: 1_900,
            baseTaxCents: 9_500,
            totalCents: 9_900,
            baseTotalCents: 49_500,
            issueDate: "2026-07-18",
            dueDate: "2026-07-25",
            convertedFromInvoiceId: null,
          },
        ],
      ],
      [
        bookings,
        [
          {
            id: "book_1",
            bookingNumber: "B-1",
            contactFirstName: "Ana",
            contactLastName: "Popescu",
            contactEmail: "ana@example.test",
            contactPhone: "+40123456789",
            contactAddressLine1: "Strada Test 1",
            contactAddressLine2: null,
            contactCity: "Bucuresti",
            contactRegion: "B",
            contactCountry: "RO",
            contactTaxId: "RO123",
          },
        ],
      ],
      [
        invoiceNumberSeries,
        [
          {
            id: "series_1",
            code: "F",
            name: "Fiscal",
            scope: "invoice",
            externalProvider: "internal-provider-routing",
          },
        ],
      ],
      [
        taxRegimes,
        [
          {
            id: "tax_1",
            code: "margin_scheme_art311",
            name: "Regim marja",
            legalReference: "Art. 311 Cod Fiscal",
          },
        ],
      ],
      [
        invoiceLineItems,
        [
          {
            id: "line_1",
            invoiceId: "inv_1",
            bookingItemId: null,
            bookingPaymentScheduleId: null,
            description: "Servicii turistice",
            quantity: 1,
            unitPriceCents: 9_900,
            totalCents: 9_900,
            taxRate: 19,
            sortOrder: 0,
          },
        ],
      ],
    ])
    const db = postgresStub({
      select: () => ({
        from: (table: unknown) => {
          const tableRows = rows.get(table) ?? []
          const query = {
            where: () => query,
            limit: async () => tableRows,
            // Thenable AND chainable, like drizzle's own builder: the invoice
            // FX resolution reads exchange_rates with `.orderBy(...).limit(1)`.
            orderBy: () =>
              Object.assign(Promise.resolve(tableRows), { limit: async () => tableRows }),
          }
          return query
        },
      }),
    })

    const document = await createFinanceAppApiRuntime().getIssuanceDocument(db, "inv_1")

    expect(document).toMatchObject({
      language: "ro",
      billing: {
        name: "Ana Popescu",
        address: "Strada Test 1",
        vatCode: "RO123",
      },
      currency: { document: "EUR", base: "RON" },
      fx: { rateSetId: "fxset_1", rate: 5, effectiveRate: 5 },
      taxRegime: {
        code: "margin_scheme_art311",
        legalReference: "Art. 311 Cod Fiscal",
        specialRegime: true,
        marginSchemeArticle311: true,
      },
      series: { id: "series_1", code: "F" },
      allocation: { required: true, pending: true, placeholderNumber: "PENDING-1" },
      lines: [{ description: "Servicii turistice", tax: { ratePercent: 19 } }],
    })
    expect(document?.series).not.toHaveProperty("externalProvider")
    expect(document).not.toHaveProperty("skipExternalSync")
  })

  it("rejects replacing an already allocated provider-owned number", async () => {
    const runtime = createFinanceAppApiRuntime()
    const db = postgresStub({
      execute: async () => [{ invoice_number: "SB-41", status: "issued" }],
    })

    await expect(
      runtime.upsertExternalReference?.(db, "inv_1", "accounting-provider", {
        reference: {
          externalId: null,
          externalNumber: null,
          externalUrl: null,
          status: null,
          metadata: null,
          syncedAt: null,
          syncError: null,
        },
        allocation: { invoiceNumber: "SB-42" },
      }),
    ).resolves.toEqual({
      status: "allocation_conflict",
      currentNumber: "SB-41",
      currentStatus: "issued",
    })
  })

  it("repairs a paid placeholder when the owning provider reports its fiscal number", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        {
          invoice_number: "INV-BK-2608-399637",
          series_id: "series_1",
          status: "paid",
        },
      ])
      .mockResolvedValueOnce([{ external_provider: "smartbill" }])
    const db = postgresStub({
      execute,
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                id: "ref_1",
                invoiceId: "inv_1",
                provider: "smartbill",
                externalId: "0174",
                externalNumber: "0174",
                externalUrl: null,
                status: "retrying",
                metadata: { series: "B", number: "0174" },
                syncedAt: null,
                syncError: "allocation was delayed",
                createdAt: new Date(),
                updatedAt: new Date(),
              },
            ],
          }),
        }),
      }),
    })
    vi.spyOn(financeService, "applyExternalInvoiceAllocation").mockResolvedValue({
      status: "applied",
      invoice: { invoiceNumber: "B0174", status: "paid" },
    } as never)
    vi.spyOn(financeService, "registerInvoiceExternalRef").mockResolvedValue({
      id: "ref_1",
      invoiceId: "inv_1",
      provider: "smartbill",
      externalId: "0174",
      externalNumber: "0174",
      externalUrl: null,
      status: "issued",
      metadata: { series: "B", number: "0174" },
      syncedAt: null,
      syncError: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as never)

    const result = await createFinanceAppApiRuntime().upsertExternalReference(
      db,
      "inv_1",
      "smartbill",
      {
        reference: {
          externalId: "0174",
          externalNumber: "0174",
          externalUrl: null,
          status: "issued",
          metadata: { series: "B", number: "0174" },
          syncedAt: null,
          syncError: null,
        },
        allocation: { invoiceNumber: "B0174" },
      },
    )

    expect(result).toMatchObject({
      status: "ok",
      allocationOutcome: "applied",
      referenceOutcome: "updated",
    })
    expect(financeService.applyExternalInvoiceAllocation).toHaveBeenCalledWith(db, "inv_1", {
      invoiceNumber: "B0174",
      preserveProgressedStatus: true,
    })
  })

  it("rejects allocation when the caller does not own the external series", async () => {
    const execute = vi
      .fn()
      .mockResolvedValueOnce([
        {
          invoice_number: "PENDING-INVOICE-1",
          series_id: "series_1",
          status: "pending_external_allocation",
        },
      ])
      .mockResolvedValueOnce([{ external_provider: "another-provider" }])
    const runtime = createFinanceAppApiRuntime()
    const db = postgresStub({ execute })

    await expect(
      runtime.upsertExternalReference?.(db, "inv_1", "accounting-provider", {
        reference: {
          externalId: "remote_1",
          externalNumber: "SB-42",
          externalUrl: null,
          status: "issued",
          metadata: null,
          syncedAt: null,
          syncError: null,
        },
        allocation: { invoiceNumber: "SB-42" },
      }),
    ).resolves.toEqual({
      status: "allocation_conflict",
      currentNumber: "PENDING-INVOICE-1",
      currentStatus: "pending_external_allocation",
    })
    expect(execute).toHaveBeenCalledTimes(2)
  })

  it("treats the same allocation and provider reference as an idempotent replay", async () => {
    const now = new Date("2026-07-18T09:00:00.000Z")
    const existing = {
      id: "ref_1",
      invoiceId: "inv_1",
      provider: "accounting-provider",
      externalId: "remote_1",
      externalNumber: "SB-42",
      externalUrl: null,
      status: "issued",
      metadata: null,
      syncedAt: now,
      syncError: null,
      createdAt: now,
      updatedAt: now,
    }
    const runtime = createFinanceAppApiRuntime()
    const db = postgresStub({
      execute: async () => [{ invoice_number: "SB-42", status: "issued" }],
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [existing] }) }),
      }),
    })

    const result = await runtime.upsertExternalReference?.(db, "inv_1", "accounting-provider", {
      reference: {
        externalId: "remote_1",
        externalNumber: "SB-42",
        externalUrl: null,
        status: "issued",
        metadata: null,
        syncedAt: now.toISOString(),
        syncError: null,
      },
      allocation: { invoiceNumber: "SB-42" },
    })

    expect(result).toMatchObject({
      status: "ok",
      referenceOutcome: "unchanged",
      allocationOutcome: "already_applied",
    })
  })

  it("compensates storage when a PDF cannot be bound", async () => {
    const upload = vi.fn().mockResolvedValue({ key: "ignored", url: "" })
    const remove = vi.fn().mockResolvedValue(undefined)
    vi.spyOn(financeService, "bindInvoiceRendition").mockResolvedValue({ status: "not_found" })
    const db = postgresStub({
      select: () => ({
        from: (table: unknown) => {
          expect(table).toBe(invoiceRenditions)
          return { where: () => ({ limit: async () => [] }) }
        },
      }),
    })
    const runtime = createFinanceAppApiRuntime({
      storage: {
        resolve: () => ({
          name: "test:documents",
          upload,
          delete: remove,
          get: vi.fn(),
        }),
      },
    })

    const result = await runtime.attachPdfArtifact(db, {}, "inv_1", "app_1", {
      bytes: new TextEncoder().encode("%PDF-test"),
      contentType: "application/pdf",
      fileName: "invoice.pdf",
      idempotencyKey: "operation-1",
    })

    expect(result).toEqual({ status: "not_found" })
    expect(upload).toHaveBeenCalledOnce()
    expect(remove).toHaveBeenCalledOnce()
  })

  it("compensates the requested key after an ambiguous storage upload failure", async () => {
    const upload = vi.fn().mockRejectedValue(new Error("ambiguous upload"))
    const remove = vi.fn().mockResolvedValue(undefined)
    const db = postgresStub({
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    })
    const runtime = createFinanceAppApiRuntime({
      storage: {
        resolve: () => ({
          name: "test:documents",
          upload,
          delete: remove,
          get: vi.fn(),
        }),
      },
    })

    await expect(
      runtime.attachPdfArtifact(db, {}, "inv_1", "app_1", {
        bytes: new TextEncoder().encode("%PDF-test"),
        contentType: "application/pdf",
        fileName: "invoice.pdf",
        idempotencyKey: "operation-1",
      }),
    ).rejects.toThrow("ambiguous upload")

    const requestedKey = upload.mock.calls[0]?.[1]?.key
    expect(requestedKey).toMatch(/^finance\/app-artifacts\//)
    expect(remove).toHaveBeenCalledWith(requestedKey)
  })

  it("rejects an out-of-order external sync observation", async () => {
    const currentTime = new Date("2026-07-18T10:00:00.000Z")
    const current = {
      id: "ref_1",
      invoiceId: "inv_1",
      provider: "app_1",
      externalId: null,
      externalNumber: null,
      externalUrl: null,
      status: null,
      metadata: null,
      syncedAt: null,
      syncError: "Provider timed out.",
      syncState: "retryable_failure",
      syncOperationId: "operation-2",
      syncOccurredAt: currentTime,
      syncErrorCode: "provider_timeout",
      syncErrorMessage: "Provider timed out.",
      syncMetadata: null,
      createdAt: currentTime,
      updatedAt: currentTime,
    }
    const db = postgresStub({
      execute: async () => [{ id: "inv_1" }],
      select: () => ({
        from: (table: unknown) => {
          const rows = table === invoiceExternalSyncObservations ? [] : [current]
          return { where: () => ({ limit: async () => rows }) }
        },
      }),
    })

    const result = await createFinanceAppApiRuntime().updateExternalSyncState(
      db,
      "inv_1",
      "app_1",
      {
        operationId: "operation-1",
        status: "succeeded",
        occurredAt: "2026-07-18T09:00:00.000Z",
        error: null,
        metadata: null,
      },
    )

    expect(result).toMatchObject({ status: "conflict", reason: "out_of_order" })
  })

  it("recognizes an older exact sync replay after current state has advanced", async () => {
    const occurredAt = new Date("2026-07-18T09:00:00.000Z")
    const replay = {
      invoiceId: "inv_1",
      provider: "app_1",
      operationId: "operation-1",
      status: "succeeded",
      occurredAt,
      errorCode: null,
      errorMessage: null,
      metadata: { artifact: { checksum: "abc", id: "rend_1" }, outcome: "created" },
      createdAt: occurredAt,
    }
    const db = postgresStub({
      execute: async () => [{ id: "inv_1" }],
      select: () => ({
        from: (table: unknown) => {
          expect(table).toBe(invoiceExternalSyncObservations)
          return { where: () => ({ limit: async () => [replay] }) }
        },
      }),
    })

    const result = await createFinanceAppApiRuntime().updateExternalSyncState(
      db,
      "inv_1",
      "app_1",
      {
        operationId: "operation-1",
        status: "succeeded",
        occurredAt: occurredAt.toISOString(),
        error: null,
        metadata: { outcome: "created", artifact: { id: "rend_1", checksum: "abc" } },
      },
    )

    expect(result).toMatchObject({ status: "ok", outcome: "unchanged" })
  })

  it("records a conversion lifecycle only when native lineage is durable", async () => {
    const insertValues = vi.fn().mockResolvedValue(undefined)
    const db = postgresStub({
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ id: "proforma_1", invoice_type: "proforma", status: "void" }])
        .mockResolvedValueOnce([
          {
            id: "invoice_1",
            invoice_type: "invoice",
            status: "issued",
            converted_from_invoice_id: "proforma_1",
          },
        ]),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
            orderBy: () => ({ limit: async () => [] }),
          }),
        }),
      }),
      insert: () => ({ values: insertValues }),
    })

    const result = await createFinanceAppApiRuntime().updateExternalLifecycleState(
      db,
      "proforma_1",
      "app_1",
      {
        operationId: "conversion-1",
        state: "converted",
        occurredAt: "2026-07-18T10:00:00.000Z",
        lineage: {
          sourceDocumentId: "proforma_1",
          successorDocumentId: "invoice_1",
        },
      },
    )

    expect(result).toMatchObject({ status: "ok", outcome: "created" })
    expect(insertValues).toHaveBeenCalledWith(
      expect.objectContaining({
        invoiceId: "proforma_1",
        provider: "app_1",
        operationId: "conversion-1",
        state: "converted",
        successorInvoiceId: "invoice_1",
      }),
    )
  })

  it("accepts an exact lifecycle replay without appending another operation", async () => {
    const insertValues = vi.fn()
    const occurredAt = new Date("2026-07-18T10:00:00.000Z")
    const db = postgresStub({
      execute: async () => [{ id: "invoice_1", invoice_type: "invoice", status: "void" }],
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                invoiceId: "invoice_1",
                provider: "app_1",
                operationId: "void-1",
                state: "voided",
                occurredAt,
                successorInvoiceId: null,
                createdAt: occurredAt,
              },
            ],
          }),
        }),
      }),
      insert: () => ({ values: insertValues }),
    })

    const result = await createFinanceAppApiRuntime().updateExternalLifecycleState(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "void-1",
        state: "voided",
        occurredAt: occurredAt.toISOString(),
        lineage: null,
      },
    )

    expect(result).toMatchObject({ status: "ok", outcome: "unchanged" })
    expect(insertValues).not.toHaveBeenCalled()
  })

  it("records settlement evidence without creating a native payment", async () => {
    const insertedTables: unknown[] = []
    const db = postgresStub({
      execute: async () => [
        {
          id: "invoice_1",
          invoice_type: "invoice",
          status: "issued",
          currency: "EUR",
          total_cents: 1000,
        },
      ],
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
            orderBy: () => ({ limit: async () => [] }),
          }),
        }),
      }),
      insert: (table: unknown) => {
        insertedTables.push(table)
        return { values: async () => undefined }
      },
    })

    const result = await createFinanceAppApiRuntime().recordSettlementObservation(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "settlement-1",
        occurredAt: "2026-07-18T11:00:00.000Z",
        status: "paid",
        currency: "EUR",
        totals: { totalCents: 1000, paidCents: 1000, balanceDueCents: 0 },
        paymentIdentifiers: ["payment-1"],
      },
    )

    expect(result).toMatchObject({ status: "ok", outcome: "created" })
    expect(insertedTables).toHaveLength(2)
    expect(insertedTables).not.toContain(invoices)
  })

  it("does not let an external payment identifier move between documents", async () => {
    const db = postgresStub({
      execute: async () => [
        {
          id: "invoice_2",
          invoice_type: "invoice",
          status: "issued",
          currency: "EUR",
          total_cents: 1000,
        },
      ],
      select: () => ({
        from: (table: unknown) => ({
          where: () => ({
            limit: async () =>
              table === invoiceExternalPaymentIdentifiers
                ? [
                    {
                      provider: "app_1",
                      paymentIdentifier: "payment-1",
                      invoiceId: "invoice_1",
                    },
                  ]
                : [],
            orderBy: () => ({ limit: async () => [] }),
          }),
        }),
      }),
    })

    const result = await createFinanceAppApiRuntime().recordSettlementObservation(
      db,
      "invoice_2",
      "app_1",
      {
        operationId: "settlement-2",
        occurredAt: "2026-07-18T12:00:00.000Z",
        status: "paid",
        currency: "EUR",
        totals: { totalCents: 1000, paidCents: 1000, balanceDueCents: 0 },
        paymentIdentifiers: ["payment-1"],
      },
    )

    expect(result).toMatchObject({
      status: "conflict",
      reason: "payment_identifier_conflict",
      paymentIdentifier: "payment-1",
    })
  })

  it("rejects an out-of-order lifecycle operation after native validation", async () => {
    const currentTime = new Date("2026-07-18T12:00:00.000Z")
    let selectCount = 0
    const db = postgresStub({
      execute: vi
        .fn()
        .mockResolvedValueOnce([{ id: "invoice_1", invoice_type: "invoice", status: "void" }])
        .mockResolvedValueOnce([]),
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => {
              selectCount += 1
              return selectCount === 1
                ? []
                : [
                    {
                      invoiceId: "invoice_1",
                      provider: "app_1",
                      operationId: "void-2",
                      state: "voided",
                      occurredAt: currentTime,
                      successorInvoiceId: null,
                      createdAt: currentTime,
                    },
                  ]
            },
            orderBy: () => ({
              limit: async () => {
                selectCount += 1
                return [
                  {
                    invoiceId: "invoice_1",
                    provider: "app_1",
                    operationId: "void-2",
                    state: "voided",
                    occurredAt: currentTime,
                    successorInvoiceId: null,
                    createdAt: currentTime,
                  },
                ]
              },
            }),
          }),
        }),
      }),
    })

    const result = await createFinanceAppApiRuntime().updateExternalLifecycleState(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "void-1",
        state: "voided",
        occurredAt: "2026-07-18T11:00:00.000Z",
        lineage: null,
      },
    )

    expect(result).toMatchObject({ status: "conflict", reason: "out_of_order" })
  })

  it("recognizes an exact settlement replay without claiming identifiers again", async () => {
    const occurredAt = new Date("2026-07-18T11:00:00.000Z")
    const insert = vi.fn()
    const db = postgresStub({
      execute: async () => [
        {
          id: "invoice_1",
          invoice_type: "invoice",
          status: "issued",
          currency: "EUR",
          total_cents: 1000,
        },
      ],
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                invoiceId: "invoice_1",
                provider: "app_1",
                operationId: "settlement-1",
                occurredAt,
                status: "paid",
                currency: "EUR",
                totalCents: 1000,
                paidCents: 1000,
                balanceDueCents: 0,
                paymentIdentifiers: ["payment-1"],
                createdAt: occurredAt,
              },
            ],
          }),
        }),
      }),
      insert,
    })

    const result = await createFinanceAppApiRuntime().recordSettlementObservation(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "settlement-1",
        occurredAt: occurredAt.toISOString(),
        status: "paid",
        currency: "EUR",
        totals: { totalCents: 1000, paidCents: 1000, balanceDueCents: 0 },
        paymentIdentifiers: ["payment-1"],
      },
    )

    expect(result).toMatchObject({ status: "ok", outcome: "unchanged" })
    expect(insert).not.toHaveBeenCalled()
  })

  it("rejects settlement observations before a document is issued", async () => {
    const db = postgresStub({
      execute: async () => [
        {
          id: "invoice_1",
          invoice_type: "invoice",
          status: "draft",
          currency: "EUR",
          total_cents: 1000,
        },
      ],
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [] }) }),
      }),
    })

    const result = await createFinanceAppApiRuntime().recordSettlementObservation(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "settlement-draft",
        occurredAt: "2026-07-18T11:00:00.000Z",
        status: "paid",
        currency: "EUR",
        totals: { totalCents: 1000, paidCents: 1000, balanceDueCents: 0 },
        paymentIdentifiers: ["payment-1"],
      },
    )

    expect(result).toMatchObject({ status: "conflict", reason: "native_document_mismatch" })
  })

  it("rejects a reused lifecycle operation id with different content", async () => {
    const occurredAt = new Date("2026-07-18T10:00:00.000Z")
    const db = postgresStub({
      execute: async () => [{ id: "invoice_1", invoice_type: "invoice", status: "void" }],
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                invoiceId: "invoice_1",
                provider: "app_1",
                operationId: "void-1",
                state: "voided",
                occurredAt,
                successorInvoiceId: null,
                createdAt: occurredAt,
              },
            ],
          }),
        }),
      }),
    })

    const result = await createFinanceAppApiRuntime().updateExternalLifecycleState(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "void-1",
        state: "voided",
        occurredAt: "2026-07-18T10:01:00.000Z",
        lineage: null,
      },
    )

    expect(result).toMatchObject({ status: "conflict", reason: "idempotency_key_reused" })
  })

  it("rejects a reused settlement operation id with different content", async () => {
    const occurredAt = new Date("2026-07-18T11:00:00.000Z")
    const db = postgresStub({
      execute: async () => [
        {
          id: "invoice_1",
          invoice_type: "invoice",
          status: "issued",
          currency: "EUR",
          total_cents: 1000,
        },
      ],
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [
              {
                invoiceId: "invoice_1",
                provider: "app_1",
                operationId: "settlement-1",
                occurredAt,
                status: "partial",
                currency: "EUR",
                totalCents: 1000,
                paidCents: 500,
                balanceDueCents: 500,
                paymentIdentifiers: ["payment-1"],
                createdAt: occurredAt,
              },
            ],
          }),
        }),
      }),
    })

    const result = await createFinanceAppApiRuntime().recordSettlementObservation(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "settlement-1",
        occurredAt: occurredAt.toISOString(),
        status: "paid",
        currency: "EUR",
        totals: { totalCents: 1000, paidCents: 1000, balanceDueCents: 0 },
        paymentIdentifiers: ["payment-1"],
      },
    )

    expect(result).toMatchObject({ status: "conflict", reason: "idempotency_key_reused" })
  })

  it("rejects a later settlement snapshot that regresses cumulative evidence", async () => {
    const occurredAt = new Date("2026-07-18T11:00:00.000Z")
    const db = postgresStub({
      execute: async () => [
        {
          id: "invoice_1",
          invoice_type: "invoice",
          status: "partially_paid",
          currency: "EUR",
          total_cents: 1000,
        },
      ],
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
            orderBy: () => ({
              limit: async () => [
                {
                  invoiceId: "invoice_1",
                  provider: "app_1",
                  operationId: "settlement-1",
                  occurredAt,
                  status: "partial",
                  currency: "EUR",
                  totalCents: 1000,
                  paidCents: 600,
                  balanceDueCents: 400,
                  paymentIdentifiers: ["payment-1", "payment-2"],
                  createdAt: occurredAt,
                },
              ],
            }),
          }),
        }),
      }),
    })

    const result = await createFinanceAppApiRuntime().recordSettlementObservation(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "settlement-2",
        occurredAt: "2026-07-18T12:00:00.000Z",
        status: "partial",
        currency: "EUR",
        totals: { totalCents: 1000, paidCents: 500, balanceDueCents: 500 },
        paymentIdentifiers: ["payment-2"],
      },
    )

    expect(result).toMatchObject({ status: "conflict", reason: "settlement_regression" })
  })

  it("treats an accepted paid settlement observation as terminal", async () => {
    const occurredAt = new Date("2026-07-18T11:00:00.000Z")
    const db = postgresStub({
      execute: async () => [
        {
          id: "invoice_1",
          invoice_type: "invoice",
          status: "paid",
          currency: "EUR",
          total_cents: 1000,
        },
      ],
      select: () => ({
        from: () => ({
          where: () => ({
            limit: async () => [],
            orderBy: () => ({
              limit: async () => [
                {
                  invoiceId: "invoice_1",
                  provider: "app_1",
                  operationId: "settlement-1",
                  occurredAt,
                  status: "paid",
                  currency: "EUR",
                  totalCents: 1000,
                  paidCents: 1000,
                  balanceDueCents: 0,
                  paymentIdentifiers: ["payment-1"],
                  createdAt: occurredAt,
                },
              ],
            }),
          }),
        }),
      }),
    })

    const result = await createFinanceAppApiRuntime().recordSettlementObservation(
      db,
      "invoice_1",
      "app_1",
      {
        operationId: "settlement-2",
        occurredAt: "2026-07-18T12:00:00.000Z",
        status: "paid",
        currency: "EUR",
        totals: { totalCents: 1000, paidCents: 1000, balanceDueCents: 0 },
        paymentIdentifiers: ["payment-1"],
      },
    )

    expect(result).toMatchObject({ status: "conflict", reason: "terminal_transition" })
  })
})
