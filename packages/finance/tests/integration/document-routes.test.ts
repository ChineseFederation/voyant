import { bookings } from "@voyant-travel/bookings/schema"
import { createEventBus } from "@voyant-travel/core"
import { eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { Hono } from "hono"
import { beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createFinanceAdminDocumentRoutes } from "../../src/routes-documents.js"
import {
  invoiceLineItems,
  invoiceRenditions,
  invoices,
  invoiceTemplates,
} from "../../src/schema.js"
import { financeService } from "../../src/service.js"

const DB_AVAILABLE = !!process.env.TEST_DATABASE_URL

const json = (body: Record<string, unknown>) => ({
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
})

describe.skipIf(!DB_AVAILABLE)("Finance document routes", () => {
  let app: Hono
  let db: PostgresJsDatabase
  let generatedKeys: string[]
  let documentEvents: Array<Record<string, unknown>>
  let renderedEvents: Array<Record<string, unknown>>
  let failNextGeneration: boolean

  beforeAll(async () => {
    const { createTestDb, cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    db = createTestDb()
    await cleanupTestDb(db)

    app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db" as never, db)
      await next()
    })
    const eventBus = createEventBus()
    documentEvents = []
    renderedEvents = []
    eventBus.subscribe("invoice.document.generated", (event) => {
      documentEvents.push(event as Record<string, unknown>)
    })
    eventBus.subscribe("invoice.rendered", (event) => {
      renderedEvents.push(event as Record<string, unknown>)
    })
    app.route(
      "/",
      createFinanceAdminDocumentRoutes({
        eventBus,
        resolveDocumentDownloadUrl: (_bindings, storageKey) =>
          `https://signed.example.com/${storageKey}`,
        invoiceDocumentGenerator: async ({ invoice }) => {
          if (failNextGeneration) {
            throw new Error("generation failed")
          }
          const storageKey = `invoices/${invoice.id}/rendition-${generatedKeys.length + 1}.pdf`
          generatedKeys.push(storageKey)
          return {
            format: "pdf",
            storageKey,
            contentType: "application/pdf",
            fileSize: 2048,
            checksum: `sha-${generatedKeys.length}`,
            metadata: {
              source: "finance-test",
              url: `https://cdn.example.com/${storageKey}`,
            },
          }
        },
      }),
    )
  })

  beforeEach(async () => {
    const { cleanupTestDb } = await import("@voyant-travel/db/test-utils")
    await cleanupTestDb(db)
    generatedKeys = []
    documentEvents = []
    renderedEvents = []
    failNextGeneration = false
  })

  /**
   * `invoices.booking_id` is `notNull()`, so an invoice fixture needs a booking
   * to hang off. These three cases care only about the rendition, not the
   * booking, hence one throwaway per invoice.
   */
  async function seedBookingForInvoice() {
    const [booking] = await db
      .insert(bookings)
      .values({
        status: "confirmed",
        bookingNumber: `BKG-${Math.floor(Math.random() * 1_000_000_000)}`,
        sellCurrency: "EUR",
        sellAmountCents: 5000,
        startDate: "2026-06-01",
      })
      .returning()
    return booking!
  }

  it("generates and then regenerates a ready invoice rendition", async () => {
    const [booking] = await db
      .insert(bookings)
      .values({
        status: "confirmed",
        bookingNumber: "BKG-1001",
        sellCurrency: "EUR",
        sellAmountCents: 100000,
        startDate: "2026-06-01",
      })
      .returning()

    const [template] = await db
      .insert(invoiceTemplates)
      .values({
        name: "Default invoice",
        slug: "default-invoice",
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
        invoiceNumber: "INV-1001",
        bookingId: booking.id,
        templateId: template.id,
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
      invoiceId: invoice.id,
      description: "Package",
      quantity: 1,
      unitPriceCents: 100000,
      totalCents: 100000,
      sortOrder: 0,
    })

    const firstRes = await app.request(`/invoices/${invoice.id}/generate-document`, {
      method: "POST",
      ...json({}),
    })

    expect(firstRes.status).toBe(201)
    const firstBody = await firstRes.json()
    expect(firstBody.data.renderedBody).toContain("INV-1001")
    expect(firstBody.data.rendition.status).toBe("ready")
    expect(firstBody.data.rendition.storageKey).toContain("rendition-1.pdf")
    expect(firstBody.data.download).toEqual({
      url: `https://signed.example.com/${firstBody.data.rendition.storageKey}`,
      expiresAt: null,
      filename: "rendition-1.pdf",
    })

    const secondRes = await app.request(`/invoices/${invoice.id}/regenerate-document`, {
      method: "POST",
      ...json({}),
    })

    expect(secondRes.status).toBe(200)
    const secondBody = await secondRes.json()
    expect(secondBody.data.rendition.storageKey).toContain("rendition-2.pdf")
    expect(secondBody.data.download).toEqual({
      url: `https://signed.example.com/${secondBody.data.rendition.storageKey}`,
      expiresAt: null,
      filename: "rendition-2.pdf",
    })

    const renditions = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.invoiceId, invoice.id))

    expect(renditions).toHaveLength(2)
    expect(renditions.filter((entry) => entry.status === "ready")).toHaveLength(1)
    expect(renditions.filter((entry) => entry.status === "stale")).toHaveLength(1)
    expect(renderedEvents).toEqual([
      expect.objectContaining({
        name: "invoice.rendered",
        // `objectContaining`: the envelope's metadata gained `eventId`, and
        // pinning it exactly asserted the envelope's shape rather than the
        // event this test is about.
        metadata: expect.objectContaining({
          category: "internal",
          source: "service",
        }),
        data: expect.objectContaining({
          invoiceId: invoice.id,
          invoiceType: "invoice",
          format: "pdf",
          storageKey: expect.stringContaining("rendition-1.pdf"),
          contentType: "application/pdf",
          byteSize: 2048,
          contentHash: "sha-1",
        }),
      }),
      expect.objectContaining({
        name: "invoice.rendered",
        // `objectContaining`: the envelope's metadata gained `eventId`, and
        // pinning it exactly asserted the envelope's shape rather than the
        // event this test is about.
        metadata: expect.objectContaining({
          category: "internal",
          source: "service",
        }),
        data: expect.objectContaining({
          invoiceId: invoice.id,
          invoiceType: "invoice",
          format: "pdf",
          storageKey: expect.stringContaining("rendition-2.pdf"),
          contentType: "application/pdf",
          byteSize: 2048,
          contentHash: "sha-2",
        }),
      }),
    ])
    expect(documentEvents).toEqual([
      expect.objectContaining({
        name: "invoice.document.generated",
        // `objectContaining`: the envelope's metadata gained `eventId`, and
        // pinning it exactly asserted the envelope's shape rather than the
        // event this test is about.
        metadata: expect.objectContaining({
          category: "internal",
          source: "service",
        }),
        data: expect.objectContaining({
          invoiceId: invoice.id,
          invoiceType: "invoice",
          format: "pdf",
          regenerated: false,
        }),
      }),
      expect.objectContaining({
        name: "invoice.document.generated",
        // `objectContaining`: the envelope's metadata gained `eventId`, and
        // pinning it exactly asserted the envelope's shape rather than the
        // event this test is about.
        metadata: expect.objectContaining({
          category: "internal",
          source: "service",
        }),
        data: expect.objectContaining({
          invoiceId: invoice.id,
          invoiceType: "invoice",
          format: "pdf",
          regenerated: true,
        }),
      }),
    ])

    const readyRendition = renditions.find((entry) => entry.status === "ready")
    expect(readyRendition).toBeDefined()

    const downloadRes = await app.request(`/invoice-renditions/${readyRendition?.id}/download`)
    expect(downloadRes.status).toBe(302)
    expect(downloadRes.headers.get("location")).toBe(
      `https://signed.example.com/${readyRendition?.storageKey}`,
    )
  })

  it("binds a ready rendition artifact and emits invoice.rendered", async () => {
    const seededBooking = await seedBookingForInvoice()
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "INV-BIND-1",
        bookingId: seededBooking.id,
        invoiceType: "invoice",
        status: "issued",
        currency: "EUR",
        issueDate: "2026-05-01",
        dueDate: "2026-05-05",
        subtotalCents: 5000,
        taxCents: 0,
        totalCents: 5000,
        paidCents: 0,
        balanceDueCents: 5000,
      })
      .returning()

    const eventBus = createEventBus()
    const events: Array<Record<string, unknown>> = []
    eventBus.subscribe("invoice.rendered", (event) => {
      events.push(event as Record<string, unknown>)
    })

    const result = await financeService.bindInvoiceRendition(
      db,
      invoice.id,
      {
        format: "pdf",
        storageKey: `invoices/${invoice.id}/rendition.pdf`,
        contentType: "application/pdf",
        fileSize: 1234,
        checksum: "sha256:abc",
        language: "ro",
        metadata: { source: "unit-test" },
      },
      { eventBus },
    )

    expect(result.status).toBe("bound")
    if (result.status !== "bound") return
    expect(result.rendition).toEqual(
      expect.objectContaining({
        invoiceId: invoice.id,
        status: "ready",
        storageKey: `invoices/${invoice.id}/rendition.pdf`,
        fileSize: 1234,
        checksum: "sha256:abc",
        language: "ro",
        metadata: {
          source: "unit-test",
          contentType: "application/pdf",
        },
      }),
    )
    expect(events).toEqual([
      expect.objectContaining({
        name: "invoice.rendered",
        // `objectContaining`: the envelope's metadata gained `eventId`, and
        // pinning it exactly asserted the envelope's shape rather than the
        // event this test is about.
        metadata: expect.objectContaining({
          category: "internal",
          source: "service",
        }),
        data: {
          invoiceId: invoice.id,
          invoiceStatus: "issued",
          invoiceType: "invoice",
          renditionId: result.rendition.id,
          format: "pdf",
          storageKey: `invoices/${invoice.id}/rendition.pdf`,
          contentType: "application/pdf",
          byteSize: 1234,
          contentHash: "sha256:abc",
        },
      }),
    ])
  })

  it("does not emit rendition completion events when generation fails", async () => {
    const seededBooking = await seedBookingForInvoice()
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "INV-FAIL-1",
        bookingId: seededBooking.id,
        invoiceType: "invoice",
        status: "issued",
        currency: "EUR",
        issueDate: "2026-05-01",
        dueDate: "2026-05-05",
        subtotalCents: 5000,
        taxCents: 0,
        totalCents: 5000,
        paidCents: 0,
        balanceDueCents: 5000,
      })
      .returning()

    failNextGeneration = true
    const res = await app.request(`/invoices/${invoice.id}/generate-document`, {
      method: "POST",
      ...json({}),
    })

    expect(res.status).toBe(502)
    expect(documentEvents).toEqual([])
    expect(renderedEvents).toEqual([])

    const renditions = await db
      .select()
      .from(invoiceRenditions)
      .where(eq(invoiceRenditions.invoiceId, invoice.id))
    expect(renditions).toEqual([])
  })

  it("preserves ready URL-only rendition artifacts", async () => {
    const seededBooking = await seedBookingForInvoice()
    const [invoice] = await db
      .insert(invoices)
      .values({
        invoiceNumber: "INV-URL-1",
        bookingId: seededBooking.id,
        invoiceType: "invoice",
        status: "issued",
        currency: "EUR",
        issueDate: "2026-05-01",
        dueDate: "2026-05-05",
        subtotalCents: 5000,
        taxCents: 0,
        totalCents: 5000,
        paidCents: 0,
        balanceDueCents: 5000,
      })
      .returning()

    const eventBus = createEventBus()
    const events: Array<Record<string, unknown>> = []
    eventBus.subscribe("invoice.rendered", (event) => {
      events.push(event as Record<string, unknown>)
    })

    const result = await financeService.bindInvoiceRendition(
      db,
      invoice.id,
      {
        format: "pdf",
        storageKey: null,
        contentType: "application/pdf",
        fileSize: 1234,
        checksum: "sha256:url-only",
        metadata: {
          url: "https://files.example.com/invoices/url-only.pdf",
        },
      },
      { eventBus },
    )

    expect(result.status).toBe("bound")
    if (result.status !== "bound") return
    expect(result.rendition.storageKey).toBeNull()
    expect(result.rendition.status).toBe("ready")
    expect(result.rendition.metadata).toEqual({
      url: "https://files.example.com/invoices/url-only.pdf",
      contentType: "application/pdf",
    })
    expect(events).toEqual([
      expect.objectContaining({
        name: "invoice.rendered",
        data: expect.objectContaining({
          invoiceId: invoice.id,
          renditionId: result.rendition.id,
          storageKey: null,
          contentType: "application/pdf",
          byteSize: 1234,
          contentHash: "sha256:url-only",
        }),
      }),
    ])
  })
})
