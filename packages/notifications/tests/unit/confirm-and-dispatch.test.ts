import { describe, expect, it } from "vitest"

import {
  confirmAndDispatchBookingResultSchema,
  confirmAndDispatchBookingSchema,
  sendInvoiceNotificationSchema,
  sendPaymentSessionNotificationSchema,
} from "../../src/validation.js"

describe("confirmAndDispatchBookingSchema", () => {
  it("defaults sendNotification to true so the happy path is one-shot", () => {
    const result = confirmAndDispatchBookingSchema.parse({
      idempotencyKey: "booking-confirm-1",
      templateSlug: "booking-confirmation",
    })
    expect(result.sendNotification).toBe(true)
  })

  it("accepts preview-only mode", () => {
    const result = confirmAndDispatchBookingSchema.parse({ sendNotification: false })
    expect(result.sendNotification).toBe(false)
  })

  it("forwards the underlying send-documents fields", () => {
    const result = confirmAndDispatchBookingSchema.parse({
      idempotencyKey: "booking-confirm-2",
      templateSlug: "booking-confirmation",
      documentTypes: ["invoice", "contract"],
    })
    expect(result.templateSlug).toBe("booking-confirmation")
    expect(result.documentTypes).toEqual(["invoice", "contract"])
    expect(result).not.toHaveProperty("subject")
    expect(result).not.toHaveProperty("to")
  })
})

describe("domain notification mutation schemas", () => {
  it.each([
    sendPaymentSessionNotificationSchema,
    sendInvoiceNotificationSchema,
  ])("accepts only a template-backed durable command", (schema) => {
    const parsed = schema.parse({
      idempotencyKey: "domain-notification-1",
      templateSlug: "payment-reminder",
    })
    expect(parsed).toEqual({
      idempotencyKey: "domain-notification-1",
      templateSlug: "payment-reminder",
    })
    expect(() =>
      schema.parse({
        idempotencyKey: "domain-notification-1",
        templateSlug: "payment-reminder",
        provider: "caller-provider",
        to: "arbitrary@example.test",
        subject: "caller-controlled subject",
        html: "<p>caller-controlled content</p>",
        text: "caller-controlled content",
      }),
    ).toThrow()
  })

  it("requires a template selector", () => {
    expect(() =>
      sendPaymentSessionNotificationSchema.parse({
        idempotencyKey: "domain-notification-2",
      }),
    ).toThrow("templateId or templateSlug is required")
  })
})

describe("confirmAndDispatchBookingResultSchema", () => {
  const documents = [
    {
      key: "inv_abc::pdf",
      source: "finance" as const,
      documentType: "invoice" as const,
      bookingId: "book_abc",
      invoiceId: "inv_abc",
      renditionId: "invr_abc",
      name: "invoice.pdf",
      createdAt: "2026-04-23T10:00:00.000Z",
    },
  ]

  it("parses a dispatched result", () => {
    const result = confirmAndDispatchBookingResultSchema.parse({
      bookingId: "book_abc",
      documents,
      notification: {
        recipient: "traveler@example.com",
        deliveryId: "ntdl_abc",
        provider: "resend",
        status: "sent",
      },
      skipReason: null,
    })
    expect(result.notification?.deliveryId).toBe("ntdl_abc")
    expect(result.skipReason).toBeNull()
  })

  it("parses a preview result (no notification, preview_only reason)", () => {
    const result = confirmAndDispatchBookingResultSchema.parse({
      bookingId: "book_abc",
      documents,
      notification: null,
      skipReason: "preview_only",
    })
    expect(result.notification).toBeNull()
    expect(result.skipReason).toBe("preview_only")
  })

  it("parses skip reasons surfaced from the send pipeline", () => {
    for (const reason of ["no_documents", "no_recipient", "no_attachments", "send_failed"]) {
      const result = confirmAndDispatchBookingResultSchema.parse({
        bookingId: "book_abc",
        documents,
        notification: null,
        skipReason: reason,
      })
      expect(result.skipReason).toBe(reason)
    }
  })

  it("rejects unknown skip reasons", () => {
    expect(() =>
      confirmAndDispatchBookingResultSchema.parse({
        bookingId: "book_abc",
        documents,
        notification: null,
        skipReason: "bogus",
      }),
    ).toThrow()
  })
})
