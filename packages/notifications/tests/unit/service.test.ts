import { describe, expect, it } from "vitest"

import { createNotificationService, renderNotificationTemplate } from "../../src/service.js"
import { resolveNotificationPaymentUrl } from "../../src/service-deliveries.js"
import { buildNotificationPortalContext } from "../../src/service-portal-context.js"
import { resolveReminderRecipient } from "../../src/service-shared.js"
import type { NotificationProvider } from "../../src/types.js"

function fakeProvider(name: string, channels: string[]): NotificationProvider {
  return {
    name,
    channels,
    durableDelivery: {
      protocol: "notification-provider-idempotency-v1",
      async send() {
        return { provider: name }
      },
    },
  }
}

describe("createNotificationService", () => {
  it("indexes providers without exposing request-scoped send methods", () => {
    const email = fakeProvider("resend", ["email"])
    const sms = fakeProvider("twilio", ["sms"])
    const service = createNotificationService([email, sms])

    expect(service).not.toHaveProperty("send")
    expect(service).not.toHaveProperty("sendWith")
    expect(service.getProvider("email")).toBe(email)
    expect(service.getProvider("sms")).toBe(sms)
  })

  it("later providers override earlier ones on channel conflict", () => {
    const first = fakeProvider("first", ["email"])
    const second = fakeProvider("second", ["email"])
    const service = createNotificationService([first, second])

    expect(service.getProvider("email")).toBe(second)
  })

  it("getProvider returns the provider for a channel", () => {
    const email = fakeProvider("resend", ["email"])
    const multi = fakeProvider("multi", ["sms", "push"])
    const service = createNotificationService([email, multi])
    expect(service.getProvider("email")).toBe(email)
    expect(service.getProvider("sms")).toBe(multi)
    expect(service.getProvider("push")).toBe(multi)
    expect(service.getProvider("slack")).toBeUndefined()
  })

  it("getProviderByName returns a named provider", () => {
    const resend = fakeProvider("resend", ["email"])
    const local = fakeProvider("local", ["email"])
    const service = createNotificationService([resend, local])
    expect(service.getProviderByName("resend")).toBe(resend)
    expect(service.getProviderByName("local")).toBe(local)
    expect(service.getProviderByName("missing")).toBeUndefined()
  })
})

describe("renderNotificationTemplate", () => {
  it("renders simple placeholders", () => {
    expect(
      renderNotificationTemplate("Hello {{ person.firstName }}", {
        person: { firstName: "Mihai" },
      }),
    ).toBe("Hello Mihai")
  })

  it("renders liquid conditionals and loops", () => {
    expect(
      renderNotificationTemplate(
        "{% if booking.reference %}Booking {{ booking.reference }}{% endif %} {% for document in documents %}[{{ document.name }}]{% endfor %}",
        {
          booking: { reference: "BKG-1" },
          documents: [{ name: "Invoice" }, { name: "Contract" }],
        },
      ),
    ).toBe("Booking BKG-1 [Invoice][Contract]")
  })

  it("supports liquid filters", () => {
    expect(
      renderNotificationTemplate("{{ invoice.totalAmount | currency: invoice.currency }}", {
        invoice: { totalAmount: 1200, currency: "EUR" },
      }),
    ).toContain("€")
  })

  it("returns null for empty templates", () => {
    expect(renderNotificationTemplate(null, {})).toBeNull()
  })

  it("supports explicit json stringification for complex values", () => {
    const rendered = renderNotificationTemplate("Payload: {{ data | json }}", {
      data: { bookingId: "book_1" },
    })

    expect(rendered).toContain('"bookingId":"book_1"')
    expect(rendered).toContain('"booking_id":"book_1"')
  })

  it("normalizes booking payment context for Pro Travel templates", () => {
    const rendered = renderNotificationTemplate(
      '{% if payment.method == "bank_transfer" %}Pay {{ payment.balanceDue }} {{ booking.currency }} by {{ payment.dueDate }} at {{ payment.link }}{% elsif payment.isPaidInFull %}Paid{% endif %}',
      {
        booking: { bookingNumber: "B-1", sellCurrency: "RON" },
        invoice: { balanceDueCents: 125000, paidCents: 50000, currency: "RON" },
        paymentSchedule: { dueDate: "2026-05-15", amountCents: 125000, currency: "RON" },
        paymentSession: {
          paymentMethod: "bank_transfer",
          redirectUrl: "https://pay.example.test/session",
        },
      },
    )

    expect(rendered).toBe("Pay 1250 RON by 2026-05-15 at https://pay.example.test/session")
  })

  it("prefers configured payment URLs over provider redirects in payment context", () => {
    const rendered = renderNotificationTemplate("Pay {{ payment.link }}", {
      paymentSession: {
        paymentUrl: "https://brand.example.com/pay/pmss_123",
        redirectUrl: "https://processor.example.test/session",
      },
    })

    expect(rendered).toBe("Pay https://brand.example.com/pay/pmss_123")
  })

  it("resolves absolute payment URLs for outbound notification context", () => {
    expect(
      resolveNotificationPaymentUrl("pmss_123", {
        paymentLinkBaseUrl: "https://checkout.example.test/",
        redirectUrl: "https://processor.example.test/session",
      }),
    ).toBe("https://checkout.example.test/pay/pmss_123")
    expect(
      resolveNotificationPaymentUrl("pmss_123", {
        redirectUrl: "https://processor.example.test/session",
      }),
    ).toBe("https://processor.example.test/session")
    expect(
      resolveNotificationPaymentUrl("pmss_123", {
        redirectUrl: "/provider/session",
      }),
    ).toBeNull()
  })

  it("fills confirmation payment fields from a paid session and open balance schedule", () => {
    const rendered = renderNotificationTemplate(
      "Paid {{ payment.paidAmount }} {{ payment.currency }}; balance {{ payment.balanceDue }} {{ payment.currency }} by {{ payment.dueDate }}",
      {
        booking: { bookingNumber: "B-1", sellCurrency: "EUR" },
        paymentSchedule: {
          dueDate: "2026-05-04",
          amountCents: 8900,
          currency: "EUR",
          scheduleType: "balance",
        },
        paymentSession: {
          status: "paid",
          amountCents: 1000,
          currency: "EUR",
          completedAt: "2026-05-04T10:00:00.000Z",
        },
      },
    )

    expect(rendered).toBe("Paid 10 EUR; balance 89 EUR by 2026-05-04")
  })

  it("renders payment schedule context without invoice, session, or booking data", () => {
    const rendered = renderNotificationTemplate(
      "Pay {{ payment.amount }} by {{ payment.dueDate }}",
      {
        paymentSchedule: {
          dueDate: "2026-05-04",
          amountCents: 5000,
          scheduleType: "deposit",
        },
      },
    )

    expect(rendered).toBe("Pay 50 by 2026-05-04")
  })

  it("preserves explicit payment data when no finance context is present", () => {
    expect(
      renderNotificationTemplate("{% if payment.isPaidInFull %}Paid{% endif %}", {
        payment: { isPaidInFull: true },
      }),
    ).toBe("Paid")
  })

  it("renders configured customer portal URLs in Liquid templates", () => {
    const portal = buildNotificationPortalContext(" https://portal.example.test/ ", "book 123")

    expect(portal).toEqual({
      url: "https://portal.example.test",
      bookingUrl: "https://portal.example.test/bookings/book%20123",
    })
    expect(
      renderNotificationTemplate("Portal {{ portal.url }} booking {{ portal.bookingUrl }}", {
        portal,
      }),
    ).toBe(
      "Portal https://portal.example.test booking https://portal.example.test/bookings/book%20123",
    )
  })

  it("renders empty portal values when no customer portal URL is configured", () => {
    const portal = buildNotificationPortalContext(undefined, "book_123")

    expect(portal).toEqual({ url: "", bookingUrl: "" })
    expect(
      renderNotificationTemplate(
        "{% if portal.bookingUrl %}{{ portal.bookingUrl }}{% else %}empty{% endif %}",
        { portal },
      ),
    ).toBe("empty")
  })
})

describe("resolveReminderRecipient", () => {
  it("prefers the booking contact snapshot over participant roles", () => {
    const recipient = resolveReminderRecipient(
      {
        contactFirstName: "Mihai",
        contactLastName: "Contact",
        contactEmail: "mihai@example.com",
        contactPhone: "+40123456789",
        contactPreferredLanguage: "ro",
      },
      [
        {
          email: "legacy@example.com",
          isPrimary: true,
          participantType: "booker",
          firstName: "Legacy",
          lastName: "Booker",
        },
      ],
    )

    expect(recipient).toEqual({
      email: "mihai@example.com",
      firstName: "Mihai",
      lastName: "Contact",
      participantType: "booking_contact",
      isPrimary: true,
    })
  })

  it("prefers non-staff primary travelers over staff when no contact snapshot exists", () => {
    const recipient = resolveReminderRecipient(null, [
      {
        email: "guide@example.com",
        isPrimary: true,
        participantType: "staff",
        firstName: "Guide",
        lastName: "Assigned",
      },
      {
        email: "ana@example.com",
        isPrimary: true,
        participantType: "traveler",
        firstName: "Ana",
        lastName: "Traveler",
      },
    ])

    expect(recipient).toEqual({
      email: "ana@example.com",
      isPrimary: true,
      participantType: "traveler",
      firstName: "Ana",
      lastName: "Traveler",
    })
  })
})
