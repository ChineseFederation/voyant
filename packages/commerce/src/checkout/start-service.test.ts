import { bookingsService } from "@voyant-travel/bookings"
import * as financeModule from "@voyant-travel/finance"
import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { CheckoutAcceptedPaymentPolicy, CheckoutStartOptions } from "./options.js"
import { createCatalogCheckoutRoutes } from "./routes.js"
import { CatalogCheckoutStartError, startCatalogCheckout } from "./start-service.js"

function stubOptions(overrides: Partial<CheckoutStartOptions> = {}): CheckoutStartOptions {
  return {
    checkoutInquiry: {
      resolvePipeline: vi.fn().mockResolvedValue(null),
      createInquiry: vi.fn().mockResolvedValue(null),
    },
    resolveBookingTaxSettings: vi.fn().mockResolvedValue({
      taxPriceMode: "inclusive",
      taxPolicyProfileId: null,
      invoicingMode: "proforma-first",
    }),
    getOwnedProductName: vi.fn().mockResolvedValue(null),
    resolveBankTransferInstructions: vi
      .fn()
      .mockResolvedValue({ beneficiary: "Acme", iban: "RO00", bankName: "Bank" }),
    ...overrides,
  }
}

/** Stub db whose first `select().from().where().limit()` returns `bookingRows`. */
function stubDb(bookingRows: unknown[]) {
  return {
    select: () => ({
      from: () => ({
        where: () => ({ limit: async () => bookingRows }),
      }),
    }),
  } as never
}

function queuedDb(selectRows: unknown[][]) {
  const calls = {
    inserts: 0,
    updates: 0,
  }
  const nextRows = () => selectRows.shift() ?? []
  type QueuedSelectChain = {
    from: () => QueuedSelectChain
    where: () => QueuedSelectChain
    orderBy: () => QueuedSelectChain
    limit: () => Promise<unknown[]>
  }
  const selectChain: QueuedSelectChain = {
    from: () => selectChain,
    where: () => selectChain,
    orderBy: () => selectChain,
    limit: async () => nextRows(),
  }
  return {
    calls,
    db: {
      select: () => selectChain,
      insert: () => {
        calls.inserts += 1
        return {
          values: () => ({
            onConflictDoNothing: () => ({ returning: async () => [] }),
            returning: async () => [],
          }),
        }
      },
      update: () => {
        calls.updates += 1
        return {
          set: () => ({
            where: async () => undefined,
          }),
        }
      },
    } as never,
  }
}

describe("startCatalogCheckout", () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it("places a hold for an existing booking", async () => {
    const booking = { id: "bk_1", status: "on_hold", holdExpiresAt: null }
    const result = await startCatalogCheckout(
      {
        db: stubDb([booking]),
        env: {},
        options: stubOptions(),
      },
      { bookingId: "bk_1", paymentIntent: "hold" },
    )
    expect(result).toEqual({ kind: "hold_placed", bookingId: "bk_1" })
  })

  it("creates an inquiry through the injected Proposals runtime", async () => {
    vi.spyOn(bookingsService, "cancelBooking").mockResolvedValue({} as never)
    const checkoutInquiry = {
      resolvePipeline: vi.fn().mockResolvedValue({ pipelineId: "pipeline_1", stageId: "stage_1" }),
      createInquiry: vi.fn().mockResolvedValue({ id: "prps_1" }),
    }
    const emit = vi.fn().mockResolvedValue(undefined)
    const db = stubDb([
      {
        id: "bk_inquiry",
        bookingNumber: "BK-2001",
        status: "on_hold",
        holdExpiresAt: null,
        personId: "person_1",
        organizationId: null,
        sellAmountCents: 12500,
        sellCurrency: "EUR",
      },
    ])

    await expect(
      startCatalogCheckout(
        {
          db,
          env: {},
          eventBus: { emit } as never,
          options: stubOptions({ checkoutInquiry }),
        },
        { bookingId: "bk_inquiry", paymentIntent: "inquiry" },
      ),
    ).resolves.toEqual({
      kind: "inquiry_received",
      bookingId: "bk_inquiry",
      inquiryId: "prps_1",
    })
    expect(checkoutInquiry.resolvePipeline).toHaveBeenCalledWith(db, {
      pipelineId: null,
      stageId: null,
    })
    expect(checkoutInquiry.createInquiry).toHaveBeenCalledWith(
      db,
      expect.objectContaining({
        pipelineId: "pipeline_1",
        stageId: "stage_1",
        source: "storefront-inquiry",
        sourceRef: "bk_inquiry",
      }),
    )
    expect(emit).toHaveBeenCalledWith("inquiry.created", {
      proposalId: "prps_1",
      bookingId: "bk_inquiry",
      bookingNumber: "BK-2001",
      pipelineId: "pipeline_1",
      stageId: "stage_1",
    })
  })

  it("keeps the inquiry fallback when Proposals has no configured pipeline", async () => {
    vi.spyOn(bookingsService, "cancelBooking").mockResolvedValue({} as never)
    const checkoutInquiry = {
      resolvePipeline: vi.fn().mockRejectedValue(new Error("proposals unavailable")),
      createInquiry: vi.fn(),
    }

    const result = await startCatalogCheckout(
      {
        db: stubDb([
          {
            id: "bk_fallback",
            bookingNumber: "BK-2002",
            status: "on_hold",
            holdExpiresAt: null,
          },
        ]),
        env: {},
        options: stubOptions({ checkoutInquiry }),
      },
      { bookingId: "bk_fallback", paymentIntent: "inquiry" },
    )

    expect(result).toMatchObject({
      kind: "inquiry_received",
      inquiryId: "inq-bk_fallback",
      note: expect.stringContaining("No proposal pipeline configured"),
    })
    expect(checkoutInquiry.createInquiry).not.toHaveBeenCalled()
  })

  it("throws booking_not_found when the booking does not exist", async () => {
    const db = stubDb([])
    const err = await startCatalogCheckout(
      { db, env: {}, options: stubOptions() },
      { bookingId: "missing", paymentIntent: "hold" },
    ).catch((e: unknown) => e)
    expect(err).toBeInstanceOf(CatalogCheckoutStartError)
    expect(err).toMatchObject({ code: "booking_not_found", status: 404 })
  })

  it("rejects bank-transfer checkout when the booking does not exist", async () => {
    const { db, calls } = queuedDb([[], [{ id: "snap_1" }], []])

    const err = await startCatalogCheckout(
      { db, env: {}, options: stubOptions() },
      { bookingId: "book_checkout_1", paymentIntent: "bank_transfer" },
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(CatalogCheckoutStartError)
    expect(err).toMatchObject({
      code: "booking_not_found",
      status: 404,
    })
    expect(calls.inserts).toBe(0)
    expect(calls.updates).toBe(0)
  })

  it("does not mark an existing booking awaiting payment when no proforma series is active", async () => {
    const booking = { id: "bk_1", status: "on_hold", holdExpiresAt: null }
    const { db, calls } = queuedDb([[booking], []])

    const err = await startCatalogCheckout(
      { db, env: {}, options: stubOptions() },
      { bookingId: "bk_1", paymentIntent: "bank_transfer" },
    ).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(CatalogCheckoutStartError)
    expect(err).toMatchObject({
      code: "bank_transfer_proforma_number_series_missing",
      status: 422,
    })
    expect(calls.updates).toBe(0)
  })

  it("records bank-transfer checkout activity with accepted payment terms before confirmation", async () => {
    vi.spyOn(financeModule.financeService, "resolveDefaultInvoiceNumberSeries").mockResolvedValue({
      id: "series_proforma",
    } as never)
    vi.spyOn(financeModule.financeService, "createPaymentSession").mockResolvedValue({
      id: "ps_bank_transfer",
    } as never)
    vi.spyOn(financeModule, "issueProformaFromBooking").mockResolvedValue({
      id: "inv_proforma",
      invoiceNumber: "PF-1001",
    } as never)

    const booking = {
      id: "bk_bank",
      bookingNumber: "BK-1001",
      status: "on_hold",
      holdExpiresAt: null,
      personId: null,
      organizationId: null,
      sellAmountCents: 100000,
      sellCurrency: "EUR",
      baseCurrency: null,
      baseSellAmountCents: null,
      startDate: "2026-09-01",
    }
    const inserts: Array<{ table: unknown; values: Record<string, unknown> }> = []
    const updates: Record<string, unknown>[] = []
    const selectRows = [[booking], []]
    const nextRows = () => selectRows.shift() ?? []
    type AwaitableRows = Promise<unknown[]> & { limit: () => Promise<unknown[]> }
    type SelectChain = {
      from: () => SelectChain
      where: () => AwaitableRows
    }
    const selectChain: SelectChain = {
      from: () => selectChain,
      where: () => {
        const rows = nextRows()
        const result = Promise.resolve(rows) as AwaitableRows
        result.limit = async () => rows
        return result
      },
    }
    const db = {
      select: () => selectChain,
      insert: (table: unknown) => ({
        values: (values: Record<string, unknown>) => {
          inserts.push({ table, values })
          return {
            onConflictDoNothing: () => ({ returning: async () => [] }),
            returning: async () => [],
          }
        },
      }),
      update: () => ({
        set: (values: Record<string, unknown>) => {
          updates.push(values)
          return { where: async () => undefined }
        },
      }),
    } as never
    const acceptedPaymentPolicy = {
      source: "operator_default",
      policy: {
        deposit: { kind: "percent", percent: 30 },
        minDaysBeforeDepartureForDeposit: 0,
        balanceDueDaysBeforeDeparture: 21,
        balanceDueMinDaysFromNow: 7,
      },
    } satisfies CheckoutAcceptedPaymentPolicy

    const result = await startCatalogCheckout(
      {
        db,
        env: {},
        options: stubOptions({
          resolveAcceptedPaymentPolicy: vi.fn(async () => acceptedPaymentPolicy),
        }),
        requestMeta: {
          clientIp: "203.0.113.10",
          userAgent: "Test Browser",
        },
      },
      {
        bookingId: "bk_bank",
        paymentIntent: "bank_transfer",
        payerEmail: "ada@example.com",
        contractAcceptance: {
          templateId: "tmpl_1",
          templateSlug: "terms",
          acceptedTerms: true,
          acceptedMarketing: false,
          acceptedAt: "2026-07-03T12:00:00.000Z",
          renderedHtml: "<p>Accepted terms</p>",
        },
      },
    )

    expect(result).toMatchObject({
      kind: "bank_transfer_instructions",
      bookingId: "bk_bank",
      proformaId: "inv_proforma",
      proformaNumber: "PF-1001",
      paymentSessionId: "ps_bank_transfer",
    })
    expect(updates).toHaveLength(1)
    const activityRows = inserts.map((insert) => insert.values)
    expect(activityRows).toHaveLength(3)
    expect(activityRows.map((row) => row.description)).toEqual([
      "Storefront bank-transfer checkout started",
      "Draft storefront terms accepted before payment",
      "Proforma/payment instructions issued; awaiting bank transfer",
    ])
    expect(activityRows.every((row) => row.activityType === "system_action")).toBe(true)
    expect(activityRows[1]?.metadata).toMatchObject({
      kind: "storefront_draft_terms_accepted",
      officialContractNumber: null,
      acceptance: {
        templateId: "tmpl_1",
        templateSlug: "terms",
        acceptedAt: "2026-07-03T12:00:00.000Z",
      },
      paymentTerms: {
        kind: "accepted_payment_terms",
        policySource: "operator_default",
        totalCents: 100000,
        currency: "EUR",
        entries: [
          { scheduleType: "deposit", amountCents: 30000, currency: "EUR" },
          { scheduleType: "balance", amountCents: 70000, currency: "EUR" },
        ],
      },
    })
    expect(activityRows[2]?.metadata).toMatchObject({
      kind: "storefront_bank_transfer_awaiting_payment",
      proformaId: "inv_proforma",
      proformaNumber: "PF-1001",
      paymentSessionId: "ps_bank_transfer",
      reference: "BOOK-BK-1001",
    })
  }, 10000)

  describe("invoicing mode", () => {
    function bankTransferDb(booking: Record<string, unknown>) {
      const selectRows = [[booking], []]
      const nextRows = () => selectRows.shift() ?? []
      type AwaitableRows = Promise<unknown[]> & { limit: () => Promise<unknown[]> }
      type SelectChain = { from: () => SelectChain; where: () => AwaitableRows }
      const selectChain: SelectChain = {
        from: () => selectChain,
        where: () => {
          const rows = nextRows()
          const result = Promise.resolve(rows) as AwaitableRows
          result.limit = async () => rows
          return result
        },
      }
      return {
        select: () => selectChain,
        insert: () => ({
          values: () => ({
            onConflictDoNothing: () => ({ returning: async () => [] }),
            returning: async () => [],
          }),
        }),
        update: () => ({ set: () => ({ where: async () => undefined }) }),
      } as never
    }

    const booking = {
      id: "bk_bank",
      bookingNumber: "BK-1001",
      status: "on_hold",
      holdExpiresAt: null,
      personId: null,
      organizationId: null,
      sellAmountCents: 100000,
      sellCurrency: "EUR",
      baseCurrency: null,
      baseSellAmountCents: null,
      startDate: "2026-09-01",
    }

    beforeEach(() => {
      vi.spyOn(financeModule.financeService, "createPaymentSession").mockResolvedValue({
        id: "ps_bank_transfer",
      } as never)
    })

    it("issues a proforma in proforma-first mode (default)", async () => {
      const seriesSpy = vi
        .spyOn(financeModule.financeService, "resolveDefaultInvoiceNumberSeries")
        .mockResolvedValue({ id: "series_proforma" } as never)
      const proformaSpy = vi
        .spyOn(financeModule, "issueProformaFromBooking")
        .mockResolvedValue({ id: "inv_proforma", invoiceNumber: "PF-1001" } as never)
      const invoiceSpy = vi.spyOn(financeModule, "issueInvoiceFromBooking")

      await startCatalogCheckout(
        { db: bankTransferDb(booking), env: {}, options: stubOptions() },
        { bookingId: "bk_bank", paymentIntent: "bank_transfer" },
      )

      expect(seriesSpy).toHaveBeenCalledWith(expect.anything(), "proforma")
      expect(proformaSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingId: "bk_bank", invoiceType: "proforma" }),
        expect.any(Object),
        expect.any(Object),
      )
      expect(invoiceSpy).not.toHaveBeenCalled()
    })

    it("issues the fiscal invoice directly in direct mode", async () => {
      const seriesSpy = vi
        .spyOn(financeModule.financeService, "resolveDefaultInvoiceNumberSeries")
        .mockResolvedValue({ id: "series_invoice" } as never)
      const invoiceSpy = vi
        .spyOn(financeModule, "issueInvoiceFromBooking")
        .mockResolvedValue({ id: "inv_fiscal", invoiceNumber: "INV-2001" } as never)
      const proformaSpy = vi.spyOn(financeModule, "issueProformaFromBooking")

      const options = stubOptions({
        resolveBookingTaxSettings: vi.fn().mockResolvedValue({
          taxPriceMode: "inclusive",
          taxPolicyProfileId: null,
          invoicingMode: "direct",
        }),
      })

      const result = await startCatalogCheckout(
        { db: bankTransferDb(booking), env: {}, options },
        { bookingId: "bk_bank", paymentIntent: "bank_transfer" },
      )

      // Direct mode checks the `invoice` series, not the `proforma` one.
      expect(seriesSpy).toHaveBeenCalledWith(expect.anything(), "invoice")
      expect(invoiceSpy).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ bookingId: "bk_bank", invoiceType: "invoice" }),
        expect.any(Object),
        expect.any(Object),
      )
      expect(proformaSpy).not.toHaveBeenCalled()
      expect(result).toMatchObject({
        kind: "bank_transfer_instructions",
        proformaId: "inv_fiscal",
        proformaNumber: "INV-2001",
      })
    })

    it("rejects direct-mode bank transfer when no invoice series is active", async () => {
      vi.spyOn(financeModule.financeService, "resolveDefaultInvoiceNumberSeries").mockResolvedValue(
        null as never,
      )
      const options = stubOptions({
        resolveBookingTaxSettings: vi.fn().mockResolvedValue({
          taxPriceMode: "inclusive",
          taxPolicyProfileId: null,
          invoicingMode: "direct",
        }),
      })

      const err = await startCatalogCheckout(
        { db: bankTransferDb(booking), env: {}, options },
        { bookingId: "bk_bank", paymentIntent: "bank_transfer" },
      ).catch((e: unknown) => e)

      expect(err).toBeInstanceOf(CatalogCheckoutStartError)
      expect(err).toMatchObject({
        code: "bank_transfer_invoice_number_series_missing",
        status: 422,
      })
    })
  })
})

describe("createCatalogCheckoutRoutes", () => {
  it("returns 400 on an invalid checkout body", async () => {
    // Invalid body fails schema validation before the handler reads `db`,
    // so no db wiring is needed for the 400 path. The `@hono/zod-openapi`
    // validation hook throws a `RequestValidationError`; the framework's
    // `handleApiError` (wired via `onError` as `createApp` does) normalizes it to
    // the shared `{ error, code: "invalid_request", ... }` 400 contract.
    const app = new Hono()
      .onError(handleApiError)
      .route("/v1/public/catalog", createCatalogCheckoutRoutes(stubOptions()))

    const res = await app.request("/v1/public/catalog/checkout/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ bookingId: "", paymentIntent: "nope" }),
    })
    expect(res.status).toBe(400)
  })
})
