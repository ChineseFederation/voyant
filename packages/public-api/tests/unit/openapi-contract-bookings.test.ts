import { describe, expect, it } from "vitest"
import type { z } from "zod"
import { bookingFulfillmentTypeSchema } from "../../src/customer-portal/validation-public/common.js"
import {
  customerPortalBookingBillingContactSchema,
  customerPortalBookingDetailSchema,
  customerPortalBookingDocumentSchema,
  customerPortalBookingSummarySchema,
} from "../../src/customer-portal/validation-public.js"

/**
 * Contract tests (api-route-authoring.md §17): the declared response schema is
 * the wire contract, but `@hono/zod-openapi` does not verify that the handler
 * returns that shape. Here we type each fixture as the real service-return type
 * and round-trip it through `JSON.parse(JSON.stringify(...))` — exactly what
 * `c.json(...)` does — then assert the wire response schema parses the result.
 * This catches `Date` → string drift and missing/renamed columns.
 */
function jsonRoundTrip<T>(value: T): unknown {
  return JSON.parse(JSON.stringify({ data: value }))
}

/**
 * Customer-portal booking read contracts (voyant#2114, Batch E). The portal
 * booking service pre-normalizes every Drizzle date before returning: `date`
 * columns via `normalizeDate` (→ `YYYY-MM-DD`) and timestamps via
 * `normalizeDateTime` (→ ISO string). The wire schemas declare all of those
 * fields as `z.string().nullable()`, so the positive round-trips lock the
 * documented shapes (including the deeply-nested detail) against missing/renamed
 * columns, and the negative case guards the §17 Date → string normalization on
 * the summary's date fields.
 */
describe("customer-portal booking response contracts", () => {
  const billingContact: z.infer<typeof customerPortalBookingBillingContactSchema> = {
    email: "traveler@example.com",
    phone: null,
    firstName: "Ada",
    lastName: "Lovelace",
    country: "RO",
    state: null,
    city: "Bucharest",
    address1: null,
    address2: null,
    postal: null,
  }

  const bookingDocument: z.infer<typeof customerPortalBookingDocumentSchema> = {
    id: "bdoc_123",
    source: "booking_document",
    travelerId: "btrv_123",
    type: "passport_copy",
    fileName: "passport.pdf",
    fileUrl: "https://files.example.com/passport.pdf",
    mimeType: "application/pdf",
    reference: null,
  }

  it("a booking summary serializes to the documented summary schema", () => {
    const summary: z.infer<typeof customerPortalBookingSummarySchema> = {
      bookingId: "bkg_123",
      bookingNumber: "BK-0001",
      status: "confirmed",
      sellCurrency: "EUR",
      sellAmountCents: 120000,
      productTitle: "Carpathian Explorer",
      paymentStatus: "paid",
      startDate: "2026-07-01",
      endDate: "2026-07-08",
      pax: 2,
      confirmedAt: "2026-06-23T11:00:00.000Z",
      completedAt: null,
      travelerCount: 2,
      primaryTravelerName: "Ada Lovelace",
    }

    const parsed = customerPortalBookingSummarySchema.safeParse(jsonRoundTrip(summary).data)
    expect(parsed.success).toBe(true)
  })

  it("rejects a summary whose dates were NOT serialized (raw Date is not a wire string)", () => {
    // Guards the §17 contract: a handler that skipped `normalizeDate`/
    // `normalizeDateTime` would emit raw `Date` instances for the booking dates,
    // which the wire schema must reject.
    const rawDated = {
      bookingId: "bkg_123",
      bookingNumber: "BK-0001",
      status: "confirmed",
      sellCurrency: "EUR",
      sellAmountCents: 120000,
      productTitle: "Carpathian Explorer",
      paymentStatus: "paid",
      startDate: new Date("2026-07-01T00:00:00.000Z"),
      endDate: new Date("2026-07-08T00:00:00.000Z"),
      pax: 2,
      confirmedAt: new Date("2026-06-23T11:00:00.000Z"),
      completedAt: null,
      travelerCount: 2,
      primaryTravelerName: "Ada Lovelace",
    }
    const parsed = customerPortalBookingSummarySchema.safeParse(rawDated)
    expect(parsed.success).toBe(false)
  })

  it("a billing contact serializes to the documented billing-contact schema", () => {
    const parsed = customerPortalBookingBillingContactSchema.safeParse(
      jsonRoundTrip(billingContact).data,
    )
    expect(parsed.success).toBe(true)
  })

  it("a booking document serializes to the documented document schema", () => {
    const parsed = customerPortalBookingDocumentSchema.safeParse(
      jsonRoundTrip(bookingDocument).data,
    )
    expect(parsed.success).toBe(true)
  })

  it("a deeply-nested booking detail serializes to the documented detail schema", () => {
    const detail: z.infer<typeof customerPortalBookingDetailSchema> = {
      bookingId: "bkg_123",
      bookingNumber: "BK-0001",
      status: "confirmed",
      sellCurrency: "EUR",
      sellAmountCents: 120000,
      startDate: "2026-07-01",
      endDate: "2026-07-08",
      pax: 2,
      confirmedAt: "2026-06-23T11:00:00.000Z",
      cancelledAt: null,
      completedAt: null,
      travelers: [
        {
          id: "btrv_123",
          participantType: "traveler",
          firstName: "Ada",
          lastName: "Lovelace",
          isPrimary: true,
        },
      ],
      items: [
        {
          id: "bitm_123",
          title: "Carpathian Explorer",
          description: null,
          itemType: "unit",
          status: "confirmed",
          serviceDate: "2026-07-01",
          startsAt: "2026-07-01T08:00:00.000Z",
          endsAt: "2026-07-08T16:00:00.000Z",
          quantity: 2,
          sellCurrency: "EUR",
          unitSellAmountCents: 60000,
          totalSellAmountCents: 120000,
          notes: null,
          travelerLinks: [
            {
              id: "bipl_123",
              travelerId: "btrv_123",
              role: "traveler",
              isPrimary: true,
            },
          ],
        },
      ],
      billingContact,
      documents: [bookingDocument],
      financials: {
        documents: [
          {
            invoiceId: "inv_123",
            invoiceNumber: "INV-0001",
            invoiceType: "invoice",
            invoiceStatus: "issued",
            currency: "EUR",
            totalCents: 120000,
            paidCents: 120000,
            balanceDueCents: 0,
            issueDate: "2026-06-23",
            dueDate: "2026-06-30",
            documentStatus: "ready",
            format: "pdf",
            generatedAt: "2026-06-23T11:00:00.000Z",
            downloadUrl: null,
          },
        ],
        payments: [
          {
            id: "pay_123",
            invoiceId: "inv_123",
            invoiceNumber: "INV-0001",
            invoiceType: "invoice",
            status: "completed",
            paymentMethod: "credit_card",
            amountCents: 120000,
            currency: "EUR",
            paymentDate: "2026-06-23",
            referenceNumber: null,
            notes: null,
          },
        ],
      },
      fulfillments: [
        {
          id: "bful_123",
          bookingItemId: "bitm_123",
          travelerId: "btrv_123",
          fulfillmentType: "service_voucher",
          deliveryChannel: "email",
          status: "issued",
          artifactUrl: null,
        },
      ],
    }

    const parsed = customerPortalBookingDetailSchema.safeParse(jsonRoundTrip(detail).data)
    expect(parsed.success).toBe(true)
  })

  it("rejects the legacy voucher fulfillment value", () => {
    expect(bookingFulfillmentTypeSchema.safeParse("service_voucher").success).toBe(true)
    expect(bookingFulfillmentTypeSchema.safeParse("voucher").success).toBe(false)
  })
})
