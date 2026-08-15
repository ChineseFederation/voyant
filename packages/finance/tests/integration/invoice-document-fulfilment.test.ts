import { bookings } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"

import { assertFinanceInvoiceDocumentProviderConformance } from "../../src/contracts/invoice-document-provider.js"
import {
  fulfilInvoiceRendition,
  fulfilPendingInvoiceRenditions,
} from "../../src/invoice-document-fulfilment.js"
import { createStandardInvoiceDocumentProvider } from "../../src/invoice-document-runtime.js"
import {
  invoiceLineItems,
  invoiceNumberSeries,
  invoiceRenditions,
  invoices,
  invoiceTemplates,
} from "../../src/schema.js"
import { financeService } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

/** Exact-key document store, matching what the deployment resource resolves to. */
function memoryDocumentStorage() {
  const objects = new Map<string, Uint8Array>()
  return {
    objects,
    provider: {
      name: "memory:documents",
      resolveBackendIdentity: async () => "memory-documents",
      upload: async (body: Uint8Array, options?: { key?: string }) => {
        const key = options?.key ?? "unnamed"
        objects.set(key, body)
        return { key }
      },
      get: async (key: string) => {
        const value = objects.get(key)
        return value ? (value.buffer.slice(0) as ArrayBuffer) : null
      },
      delete: async (key: string) => {
        objects.delete(key)
      },
    },
  }
}

describe.skipIf(!DB_AVAILABLE)("invoice document fulfilment", () => {
  let db: PostgresJsDatabase
  let storage: ReturnType<typeof memoryDocumentStorage>
  let renderCalls: number
  let failRenders: number

  const buildProvider = () =>
    createStandardInvoiceDocumentProvider({
      storage: storage.provider as never,
      renderer: {
        name: "test-renderer",
        resolveBackendIdentity: async () => "test-renderer",
        renderPdf: async ({ html }: { html: string }) => {
          renderCalls += 1
          if (failRenders > 0) {
            failRenders -= 1
            throw new Error("renderer unavailable")
          }
          return new TextEncoder().encode(`%PDF-1.4 ${html}`)
        },
      } as never,
    })

  let seeded = 0

  async function seedInvoice(overrides: { invoiceNumber?: string; seriesId?: string | null } = {}) {
    seeded += 1
    const suffix = `${seeded}-${Math.floor(Math.random() * 1_000_000)}`
    const [booking] = await db
      .insert(bookings)
      .values({
        bookingNumber: `BKG-${suffix}`,
        sellCurrency: "EUR",
        sellAmountCents: 100000,
        startDate: "2026-06-01",
        status: "confirmed",
      })
      .returning()

    const [template] = await db
      .insert(invoiceTemplates)
      .values({
        name: "Default invoice",
        slug: `default-invoice-${suffix}`,
        language: "ro",
        bodyFormat: "html",
        body: "<p>Factura {{invoice.invoiceNumber}}</p>",
        isDefault: true,
        active: true,
      })
      .returning()

    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: overrides.invoiceNumber ?? `INV-4668-${suffix}`,
        bookingId: booking!.id,
        templateId: template!.id,
        ...(overrides.seriesId ? { seriesId: overrides.seriesId } : {}),
        invoiceType: "invoice",
        status: "issued",
        currency: "EUR",
        issueDate: "2026-05-01",
        dueDate: "2026-05-05",
        subtotalCents: 100000,
        taxCents: 0,
        totalCents: 100000,
        paidCents: 0,
        balanceDueCents: 100000,
      })
      .returning()

    await db.insert(invoiceLineItems).values({
      invoiceId: invoice!.id,
      description: "Package",
      quantity: 1,
      unitPriceCents: 100000,
      totalCents: 100000,
      sortOrder: 0,
    })

    return invoice!
  }

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    storage = memoryDocumentStorage()
    renderCalls = 0
    failRenders = 0
  })

  it("turns the requested rendition into a real document and emits invoice.rendered", async () => {
    const invoice = await seedInvoice()
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })
    expect(requested.status).toBe("requested")
    expect(requested.rendition?.status).toBe("pending")

    const eventBus = createEventBus()
    const rendered: Array<Record<string, unknown>> = []
    eventBus.subscribe("invoice.rendered", (event) => {
      rendered.push(event as Record<string, unknown>)
    })

    const outcome = await fulfilInvoiceRendition(db, requested.rendition!.id, {
      provider: await buildProvider(),
      eventBus,
    })

    expect(outcome.status).toBe("fulfilled")
    const [row] = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.id, requested.rendition!.id))
    expect(row?.status).toBe("ready")
    expect(row?.storageKey).toBe(`invoices/${invoice.id}/renditions/${requested.rendition!.id}.pdf`)
    expect(row?.fileSize).toBeGreaterThan(0)
    expect(row?.checksum).toMatch(/^[a-f0-9]{64}$/)
    expect(row?.generatedAt).not.toBeNull()

    // The bytes are actually in the store, at the key the row points at.
    const stored = storage.objects.get(row!.storageKey!)
    expect(new TextDecoder().decode(stored!)).toContain("INV-4668")

    expect(rendered).toHaveLength(1)
    expect(rendered[0]).toMatchObject({
      data: expect.objectContaining({ invoiceId: invoice.id, renditionId: row!.id }),
    })
  })

  it("does not supersede the row it fulfils", async () => {
    const invoice = await seedInvoice()
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })

    await fulfilInvoiceRendition(db, requested.rendition!.id, { provider: await buildProvider() })

    // The orphan this replaced was a second row: the pending one stayed pending
    // forever while a separate `ready` row appeared beside it.
    const rows = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.invoiceId, invoice.id))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.status).toBe("ready")
  })

  it("is idempotent across a repeated drain", async () => {
    const invoice = await seedInvoice()
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })
    const provider = await buildProvider()

    const first = await fulfilInvoiceRendition(db, requested.rendition!.id, { provider })
    const second = await fulfilInvoiceRendition(db, requested.rendition!.id, { provider })

    expect(first.status).toBe("fulfilled")
    expect(second).toMatchObject({ status: "skipped", reason: "not_pending" })
    expect(renderCalls).toBe(1)
    expect(storage.objects.size).toBe(1)
  })

  it("records the miss instead of leaving an orphan when no renderer is available", async () => {
    const invoice = await seedInvoice()
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })

    const outcome = await fulfilInvoiceRendition(db, requested.rendition!.id, {})

    expect(outcome).toMatchObject({
      status: "failed",
      reason: "document_renderer_unavailable",
    })
    const [row] = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.id, requested.rendition!.id))
    // `failed` is terminal for `waitForInvoiceRendition`, so a caller that
    // passed `?wait=true` is released now instead of blocking its full timeout
    // on a row nothing was ever going to fulfil.
    expect(row?.status).toBe("failed")
    expect(row?.errorMessage).toMatch(/no document renderer is available/i)
  })

  it("retries a transient render failure and only fails after the attempt budget", async () => {
    const invoice = await seedInvoice()
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })
    const provider = await buildProvider()

    failRenders = 1
    const retried = await fulfilInvoiceRendition(db, requested.rendition!.id, { provider })
    expect(retried).toMatchObject({ status: "retry", attempts: 1 })
    const [afterRetry] = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.id, requested.rendition!.id))
    expect(afterRetry?.status).toBe("pending")

    const recovered = await fulfilInvoiceRendition(db, requested.rendition!.id, { provider })
    expect(recovered.status).toBe("fulfilled")

    const other = await seedInvoice()
    const exhausting = await financeService.renderInvoice(db, other.id, { format: "pdf" })
    failRenders = 10
    let last = await fulfilInvoiceRendition(db, exhausting.rendition!.id, {
      provider,
      maxAttempts: 2,
    })
    expect(last.status).toBe("retry")
    last = await fulfilInvoiceRendition(db, exhausting.rendition!.id, { provider, maxAttempts: 2 })
    expect(last).toMatchObject({ status: "failed", reason: "render_failed" })
  })

  it("leaves an app-numbered invoice alone until its number is allocated", async () => {
    const [series] = await db
      .insert(invoiceNumberSeries)
      .values({
        code: "ext-fiscal",
        name: "External fiscal series",
        scope: "invoice",
        prefix: "EXT",
        externalProvider: "smartbill",
        active: true,
      })
      .returning()

    const invoice = await seedInvoice({
      invoiceNumber: "PENDING-INVOICE-abc123",
      seriesId: series!.id,
    })
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })

    const outcome = await fulfilInvoiceRendition(db, requested.rendition!.id, {
      provider: await buildProvider(),
    })

    // Rendering here would produce a fiscally invalid PDF naming a number no
    // authority issued. The accounting app owns this document.
    expect(outcome).toMatchObject({
      status: "skipped",
      reason: "awaiting_external_allocation",
    })
    const [row] = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.id, requested.rendition!.id))
    expect(row?.status).toBe("pending")
    expect(renderCalls).toBe(0)
  })

  it("drains every requested rendition, scoped to one invoice when asked", async () => {
    const first = await seedInvoice()
    const second = await seedInvoice()
    const firstRequest = await financeService.renderInvoice(db, first.id, { format: "pdf" })
    await financeService.renderInvoice(db, second.id, { format: "pdf" })
    const provider = await buildProvider()

    const scoped = await fulfilPendingInvoiceRenditions(db, { provider, invoiceId: first.id })
    expect(scoped).toEqual([
      expect.objectContaining({ status: "fulfilled", renditionId: firstRequest.rendition!.id }),
    ])

    const rest = await fulfilPendingInvoiceRenditions(db, { provider })
    expect(rest).toHaveLength(1)
    expect(rest[0]?.status).toBe("fulfilled")
    expect(storage.objects.size).toBe(2)
  })

  it("lets only one caller render a row two paths reach at once", async () => {
    const invoice = await seedInvoice()
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })
    const provider = await buildProvider()

    // The subscriber and the recovery job can both reach a pending row. The
    // advisory lock ends with its transaction, so without a claim written into
    // the row both would render and both would write the same key — and the
    // loser's upload could land after the winner recorded its checksum.
    const [first, second] = await Promise.all([
      fulfilInvoiceRendition(db, requested.rendition!.id, { provider }),
      fulfilInvoiceRendition(db, requested.rendition!.id, { provider }),
    ])

    const outcomes = [first.status, second.status].sort()
    expect(outcomes).toEqual(["fulfilled", "skipped"])
    expect(renderCalls).toBe(1)
    expect(storage.objects.size).toBe(1)

    const [row] = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.id, requested.rendition!.id))
    expect(row?.status).toBe("ready")
    // The row describes the bytes that are actually stored.
    const stored = storage.objects.get(row!.storageKey!)
    expect(stored?.byteLength).toBe(row?.fileSize)
  })

  it("hands the row back when it declines to render it", async () => {
    const [series] = await db
      .insert(invoiceNumberSeries)
      .values({
        code: "ext-release",
        name: "External fiscal series",
        scope: "invoice",
        prefix: "EXT",
        externalProvider: "smartbill",
        active: true,
      })
      .returning()
    const invoice = await seedInvoice({
      invoiceNumber: "PENDING-INVOICE-release",
      seriesId: series!.id,
    })
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })
    const provider = await buildProvider()

    await fulfilInvoiceRendition(db, requested.rendition!.id, { provider })
    // A skip must not hold the claim for the rest of its lease, or the row
    // would sit out several job cycles after the app allocates its number.
    const second = await fulfilInvoiceRendition(db, requested.rendition!.id, { provider })
    expect(second).toMatchObject({ status: "skipped", reason: "awaiting_external_allocation" })
  })

  it("resolves custom fields the same way on every path", async () => {
    const invoice = await seedInvoice()
    const requested = await financeService.renderInvoice(db, invoice.id, { format: "pdf" })

    const seen: string[] = []
    await fulfilInvoiceRendition(db, requested.rendition!.id, {
      provider: await buildProvider(),
      resolveCustomFields: (_db, subject) => {
        seen.push(subject.id)
        return { loyaltyTier: "gold" }
      },
    })

    // `prepareInvoiceDocument` only populates `variables.customFields` when a
    // resolver is supplied, so a background path that omits it renders the same
    // template without the customer's data.
    expect(seen).toEqual([invoice.id])
  })

  it("passes the port conformance harness against the deployment provider", async () => {
    await expect(
      assertFinanceInvoiceDocumentProviderConformance({
        provider: await buildProvider(),
        namespace: "finance/invoice-documents/integration",
      }),
    ).resolves.toBeUndefined()
  })
})
