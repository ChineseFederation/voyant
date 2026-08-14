import { describe, expect, it } from "vitest"

import {
  buildBookingCheckoutUrl,
  buildConfiguredPaymentLinkUrl,
  buildPaymentLinkUrl,
  resolveEffectivePaymentLinkUrlTemplate,
} from "../../src/payment-link.js"

describe("buildPaymentLinkUrl", () => {
  it("builds a customer-facing payment URL from a configured base", () => {
    expect(
      buildPaymentLinkUrl("pmss_123", {
        baseUrl: "https://travel.example.com/",
      }),
    ).toBe("https://travel.example.com/pay/pmss_123")
  })

  it("preserves base URL path prefixes", () => {
    expect(buildPaymentLinkUrl("pmss_123", { baseUrl: "https://example.com/ro" })).toBe(
      "https://example.com/ro/pay/pmss_123",
    )
  })

  it("does not duplicate an exact trailing pay path", () => {
    expect(buildPaymentLinkUrl("pmss_123", { baseUrl: "https://example.com/pay/" })).toBe(
      "https://example.com/pay/pmss_123",
    )
    expect(buildPaymentLinkUrl("pmss_123", { baseUrl: "https://example.com/repay" })).toBe(
      "https://example.com/repay/pay/pmss_123",
    )
  })

  it("keeps search and fragment suffixes after the payment session path", () => {
    expect(
      buildPaymentLinkUrl("pmss_123", {
        baseUrl: "https://example.com/pay?lang=ro",
      }),
    ).toBe("https://example.com/pay/pmss_123?lang=ro")
    expect(
      buildPaymentLinkUrl("pmss_123", {
        baseUrl: "https://example.com/ro#checkout",
      }),
    ).toBe("https://example.com/ro/pay/pmss_123#checkout")
    expect(
      buildPaymentLinkUrl("pmss_123", {
        baseUrl: "https://example.com/ro?lang=ro#checkout",
      }),
    ).toBe("https://example.com/ro/pay/pmss_123?lang=ro#checkout")
  })

  it("preserves trailing slashes inside search and fragment data", () => {
    expect(
      buildPaymentLinkUrl("pmss_123", {
        baseUrl: "https://example.com/pay?next=/",
      }),
    ).toBe("https://example.com/pay/pmss_123?next=/")
    expect(
      buildPaymentLinkUrl("pmss_123", {
        baseUrl: "https://example.com/ro#return/",
      }),
    ).toBe("https://example.com/ro/pay/pmss_123#return/")
  })

  it("supports relative bases with suffixes", () => {
    expect(buildPaymentLinkUrl("pmss 123", { baseUrl: "/ro?lang=ro#checkout" })).toBe(
      "/ro/pay/pmss%20123?lang=ro#checkout",
    )
  })

  it("falls back to a root-relative URL outside the browser", () => {
    expect(buildPaymentLinkUrl("pmss 123")).toBe("/pay/pmss%20123")
  })

  it("uses a configured invoice pay URL template when supplied", () => {
    expect(
      buildPaymentLinkUrl("pmss 123", {
        invoicePayUrlTemplate: "https://pay.example.com/session/{sessionId}",
      }),
    ).toBe("https://pay.example.com/session/pmss%20123")
  })
})

describe("buildConfiguredPaymentLinkUrl", () => {
  it("fails closed instead of inventing a link from the browser origin", () => {
    expect(buildConfiguredPaymentLinkUrl("pmss_123", {})).toBeNull()
    expect(
      buildConfiguredPaymentLinkUrl("pmss_123", {
        paymentLinkUrlTemplate: "https://pay.example/{paymentId}",
      }),
    ).toBeNull()
    expect(
      buildConfiguredPaymentLinkUrl("pmss_123", {
        paymentLinkUrlTemplate: "https://pay.example/{sessionId}?payment={paymentId}",
      }),
    ).toBeNull()
  })

  it("keeps the legacy base compatible when a newer server reports no template", () => {
    expect(
      buildConfiguredPaymentLinkUrl("pmss_123", {
        paymentLinkUrlTemplate: null,
        publicCheckoutBaseUrl: "https://booking.example.com",
      }),
    ).toBe("https://booking.example.com/pay/pmss_123")
  })

  it("uses the canonical configured template", () => {
    expect(
      buildConfiguredPaymentLinkUrl("pmss_123", {
        paymentLinkUrlTemplate: "https://booking.example.com/pay?session={sessionId}",
      }),
    ).toBe("https://booking.example.com/pay?session=pmss_123")
  })

  it("keeps an older server's base-url response compatible", () => {
    expect(
      buildConfiguredPaymentLinkUrl("pmss_123", {
        publicCheckoutBaseUrl: "https://booking.example.com",
      }),
    ).toBe("https://booking.example.com/pay/pmss_123")
  })
})

describe("resolveEffectivePaymentLinkUrlTemplate", () => {
  it("prefers the organization's stored template over the managed default", () => {
    expect(
      resolveEffectivePaymentLinkUrlTemplate(
        "https://brand.example/pay/{sessionId}",
        "https://book.example/pay?session={sessionId}",
      ),
    ).toBe("https://brand.example/pay/{sessionId}")
  })

  it("fails closed for an invalid configured override", () => {
    expect(() =>
      resolveEffectivePaymentLinkUrlTemplate(
        "https://brand.example/pay/{paymentId}",
        "https://book.example/pay?session={sessionId}",
      ),
    ).toThrow("Configured payment link URL template is invalid")
  })
})

describe("buildBookingCheckoutUrl", () => {
  it("builds a booking checkout URL from a configured booking code template", () => {
    expect(
      buildBookingCheckoutUrl({
        bookingCode: "BK 123",
        settings: {
          bookingCheckoutUrlTemplate: "https://travel.example.com/booking/pay/{bookingCode}",
        },
      }),
    ).toBe("https://travel.example.com/booking/pay/BK%20123")
  })

  it("supports booking id templates", () => {
    expect(
      buildBookingCheckoutUrl({
        bookingId: "book_123",
        settings: {
          bookingCheckoutUrlTemplate: "https://travel.example.com/checkout/{bookingId}",
        },
      }),
    ).toBe("https://travel.example.com/checkout/book_123")
  })

  it("returns null when no template is configured or required data is missing", () => {
    expect(buildBookingCheckoutUrl({ bookingCode: "BK-123", settings: null })).toBeNull()
    expect(
      buildBookingCheckoutUrl({
        settings: {
          bookingCheckoutUrlTemplate: "https://travel.example.com/booking/pay/{bookingCode}",
        },
      }),
    ).toBeNull()
  })
})
