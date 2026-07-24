import {
  issueCheckoutCapability,
  issueGuestBookingAccess,
} from "@voyant-travel/bookings/checkout-capability"
import { createContainer } from "@voyant-travel/core"
import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { beforeEach, describe, expect, it, vi } from "vitest"

const serviceMocks = vi.hoisted(() => ({
  bootstrapCheckoutCollection: vi.fn(),
  initiateCheckoutCollection: vi.fn(),
  previewCheckoutCollection: vi.fn(),
}))

vi.mock("../../src/checkout-service.js", () => ({
  bootstrapCheckoutCollection: serviceMocks.bootstrapCheckoutCollection,
  initiateCheckoutCollection: serviceMocks.initiateCheckoutCollection,
  previewCheckoutCollection: serviceMocks.previewCheckoutCollection,
}))

import {
  CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY,
  CHECKOUT_ROUTE_RUNTIME_NOT_CONFIGURED_MESSAGE,
  createFinanceCheckoutAdminRoutes,
  createFinanceCheckoutRoutes,
} from "../../src/checkout-routes.js"

const TEST_CAPABILITY_ENV = {
  VOYANT_CHECKOUT_CAPABILITY_SECRET: "checkout-capability-test-secret-32chars",
}

async function capabilityHeaders(bookingId = "book_123") {
  const capability = await issueCheckoutCapability(bookingId, TEST_CAPABILITY_ENV)
  return { "X-Voyant-Checkout-Capability": capability.token }
}

async function guestAccessHeaders(bookingId = "book_123") {
  const capability = await issueGuestBookingAccess(bookingId, TEST_CAPABILITY_ENV)
  return { "X-Voyant-Guest-Booking-Access": capability.token }
}

describe("createFinanceCheckoutRoutes", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("passes Finance-owned runtime options to checkout initiation", async () => {
    serviceMocks.initiateCheckoutCollection.mockResolvedValue({
      plan: {
        bookingId: "book_123",
        method: "card",
        stage: "initial",
        paymentSessionTarget: "invoice",
        documentType: "invoice",
        willCreateDefaultPaymentPlan: false,
        selectedSchedule: null,
        selectedInvoice: null,
        amountCents: 12345,
        currency: "EUR",
        recommendedAction: "create_invoice_then_payment_session",
      },
      invoice: null,
      paymentSession: null,
      invoiceNotification: null,
      paymentSessionNotification: null,
      bankTransferInstructions: null,
      providerStart: null,
    })

    const notificationDispatcher = {
      sendInvoiceNotification: vi.fn(),
      sendPaymentSessionNotification: vi.fn(),
    }
    const paymentStarter = vi.fn()
    const routes = createFinanceCheckoutRoutes({
      resolveNotificationDispatcher: () => notificationDispatcher,
      resolveSelectedPaymentStarter: () => paymentStarter,
      resolvePaymentStarters: () => ({ netopia: paymentStarter }),
      resolvePublicCheckoutBaseUrl: () => "https://brand.example.com",
      resolveBankTransferDetails: () => ({
        provider: "manual",
        beneficiary: "Program Travel",
        iban: "RO49RNCB0857180852250001",
      }),
    })

    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/initiate-collection",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await capabilityHeaders()) },
        body: JSON.stringify({
          method: "card",
          startProvider: {
            payload: {
              billing: {
                email: "traveler@example.com",
                phone: "0712345678",
                firstName: "Ana",
                lastName: "Ionescu",
                city: "Bucharest",
                country: 642,
                state: "B",
                postalCode: "010101",
                details: "Main street 1",
              },
            },
          },
        }),
      },
      { APP_URL: "https://example.com", ...TEST_CAPABILITY_ENV },
    )

    expect(res.status).toBe(201)
    expect(serviceMocks.initiateCheckoutCollection).toHaveBeenCalledTimes(1)

    const runtime = serviceMocks.initiateCheckoutCollection.mock.calls[0]?.[4]
    expect(runtime).toMatchObject({
      bankTransferDetails: {
        provider: "manual",
        beneficiary: "Program Travel",
        iban: "RO49RNCB0857180852250001",
      },
      notificationDispatcher,
      publicCheckoutBaseUrl: "https://brand.example.com",
    })
    expect(runtime.paymentStarters.netopia).toBe(paymentStarter)
  })

  it("accepts a provider-neutral card start through the selected adapter", async () => {
    serviceMocks.initiateCheckoutCollection.mockResolvedValue({
      plan: { bookingId: "book_123", method: "card" },
      invoice: null,
      paymentSession: { id: "ps_123" },
      invoiceNotification: null,
      paymentSessionNotification: null,
      bankTransferInstructions: null,
      providerStart: {
        provider: "connected-adapter",
        paymentSessionId: "ps_123",
        redirectUrl: "https://payments.example/checkout",
      },
    })
    const selectedPaymentStarter = vi.fn()
    const routes = createFinanceCheckoutRoutes({
      resolveSelectedPaymentStarter: () => selectedPaymentStarter,
    })
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/initiate-collection",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await capabilityHeaders()) },
        body: JSON.stringify({
          method: "card",
          startProvider: {
            payload: {
              billing: {
                email: "traveler@example.com",
                firstName: "Ana",
                lastName: "Ionescu",
              },
            },
          },
        }),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(201)
    expect(serviceMocks.initiateCheckoutCollection).toHaveBeenCalledOnce()
    expect(serviceMocks.initiateCheckoutCollection.mock.calls[0]?.[4]).toMatchObject({
      selectedPaymentStarter,
    })
  })

  it("rejects a provider-neutral card start without a selected adapter before service invocation", async () => {
    const legacyPaymentStarter = vi.fn()
    const routes = createFinanceCheckoutRoutes({
      resolvePaymentStarters: () => ({ netopia: legacyPaymentStarter }),
    })
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/initiate-collection",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await capabilityHeaders()) },
        body: JSON.stringify({
          method: "card",
          startProvider: {
            payload: {
              billing: {
                email: "traveler@example.com",
                firstName: "Ana",
              },
            },
          },
        }),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(501)
    expect(serviceMocks.initiateCheckoutCollection).not.toHaveBeenCalled()
    expect(legacyPaymentStarter).not.toHaveBeenCalled()
  })

  it("rejects caller-selected payment providers", async () => {
    serviceMocks.initiateCheckoutCollection.mockResolvedValue({
      plan: { bookingId: "book_123", method: "card" },
      invoice: null,
      paymentSession: { id: "ps_123" },
      invoiceNotification: null,
      paymentSessionNotification: null,
      bankTransferInstructions: null,
      providerStart: {
        provider: "netopia",
        paymentSessionId: "ps_123",
        redirectUrl: "https://payments.example/checkout",
      },
    })
    const legacyPaymentStarter = vi.fn()
    const routes = createFinanceCheckoutRoutes({
      resolvePaymentStarters: () => ({ netopia: legacyPaymentStarter }),
    })
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/initiate-collection",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await capabilityHeaders()) },
        body: JSON.stringify({
          method: "card",
          startProvider: {
            provider: "netopia",
            payload: {
              billing: {
                email: "traveler@example.com",
                firstName: "Ana",
              },
            },
          },
        }),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(409)
    expect(serviceMocks.initiateCheckoutCollection).not.toHaveBeenCalled()
    expect(legacyPaymentStarter).not.toHaveBeenCalled()
  })

  it("returns setup guidance when the checkout runtime provider is not registered", async () => {
    const routes = createFinanceCheckoutAdminRoutes()
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      c.set("container", createContainer())
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/initiate-collection",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await capabilityHeaders()) },
        body: JSON.stringify({
          method: "card",
          stage: "manual",
          amountCents: 12345,
          ensureDefaultPaymentPlan: true,
          paymentSession: { provider: "netopia" },
        }),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(501)
    expect(await res.json()).toEqual({ error: CHECKOUT_ROUTE_RUNTIME_NOT_CONFIGURED_MESSAGE })
    expect(serviceMocks.initiateCheckoutCollection).not.toHaveBeenCalled()
  })

  it("returns setup guidance when the registered checkout runtime has no card starters", async () => {
    const routes = createFinanceCheckoutAdminRoutes()
    const container = createContainer()
    container.register(CHECKOUT_ROUTE_RUNTIME_CONTAINER_KEY, {
      bindings: {},
      notificationDispatcher: null,
      paymentStarters: {},
      bankTransferDetails: null,
    })
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      c.set("container", container)
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/initiate-collection",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await capabilityHeaders()) },
        body: JSON.stringify({
          method: "card",
          stage: "manual",
          amountCents: 12345,
          ensureDefaultPaymentPlan: true,
          paymentSession: { provider: "netopia" },
        }),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(501)
    expect(await res.json()).toEqual({ error: CHECKOUT_ROUTE_RUNTIME_NOT_CONFIGURED_MESSAGE })
    expect(serviceMocks.initiateCheckoutCollection).not.toHaveBeenCalled()
  })

  it("allows bank-transfer collection when no card starter is configured", async () => {
    serviceMocks.initiateCheckoutCollection.mockResolvedValue({
      plan: {
        bookingId: "book_123",
        method: "bank_transfer",
        stage: "manual",
        paymentSessionTarget: "invoice",
        documentType: "invoice",
        willCreateDefaultPaymentPlan: false,
        selectedSchedule: null,
        selectedInvoice: null,
        amountCents: 12345,
        currency: "EUR",
        recommendedAction: "create_bank_transfer_document",
      },
      invoice: null,
      paymentSession: null,
      invoiceNotification: null,
      paymentSessionNotification: null,
      bankTransferInstructions: {
        provider: "manual",
        beneficiary: "Program Travel",
        iban: "RO49RNCB0857180852250001",
        amountCents: 12345,
        currency: "EUR",
        reference: "BK-123",
        notes: null,
      },
      providerStart: null,
    })
    const routes = createFinanceCheckoutAdminRoutes()
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      c.set("container", createContainer())
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/initiate-collection",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await capabilityHeaders()) },
        body: JSON.stringify({
          method: "bank_transfer",
          stage: "manual",
          amountCents: 12345,
          ensureDefaultPaymentPlan: true,
        }),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(201)
    expect(serviceMocks.initiateCheckoutCollection).toHaveBeenCalledTimes(1)
    expect(serviceMocks.initiateCheckoutCollection.mock.calls[0]?.[4]).toMatchObject({
      paymentStarters: {},
    })
  })

  it("rejects booking collection routes without a checkout capability", async () => {
    const routes = createFinanceCheckoutRoutes()
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/collection-plan",
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(401)
    expect(serviceMocks.previewCheckoutCollection).not.toHaveBeenCalled()
  })

  it("accepts guest booking access for booking-scoped collection routes", async () => {
    serviceMocks.previewCheckoutCollection.mockResolvedValue({
      bookingId: "book_123",
      method: "card",
      stage: "initial",
      paymentSessionTarget: "invoice",
      documentType: "invoice",
      willCreateDefaultPaymentPlan: false,
      selectedSchedule: null,
      selectedInvoice: null,
      amountCents: 12345,
      currency: "EUR",
      recommendedAction: "create_invoice_then_payment_session",
    })

    const routes = createFinanceCheckoutRoutes()
    const app = new Hono()
    app.onError(handleApiError)
    app.use("*", async (c, next) => {
      c.set("db", {} as never)
      await next()
    })
    app.route("/", routes)

    const res = await app.request(
      "/bookings/book_123/collection-plan",
      {
        method: "POST",
        headers: { "content-type": "application/json", ...(await guestAccessHeaders()) },
        body: JSON.stringify({ method: "card" }),
      },
      TEST_CAPABILITY_ENV,
    )

    expect(res.status).toBe(200)
    expect(serviceMocks.previewCheckoutCollection).toHaveBeenCalledTimes(1)
  })

  it("lists booking reminder runs through the injected checkout reader", async () => {
    const db = {} as never
    const listBookingReminderRuns = vi.fn(async () => ({
      data: [
        {
          id: "run_123",
          reminderRuleId: "rule_123",
          reminderRuleSlug: "deposit-reminder",
          reminderRuleName: "Deposit reminder",
          targetType: "booking_payment_schedule" as const,
          targetId: "bps_123",
          bookingId: "book_123",
          paymentSessionId: "ps_123",
          notificationDeliveryId: "del_123",
          status: "sent" as const,
          deliveryStatus: "sent" as const,
          channel: "email" as const,
          provider: "local",
          recipient: "traveler@example.com",
          scheduledFor: "2026-06-14T08:00:00.000Z",
          processedAt: "2026-06-14T08:01:00.000Z",
          errorMessage: null,
          relativeDaysFromDueDate: null,
          createdAt: "2026-06-14T07:59:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    }))
    const routes = createFinanceCheckoutAdminRoutes({ listBookingReminderRuns })
    const app = new Hono()
    app.use("*", async (c, next) => {
      c.set("db", db)
      await next()
    })
    app.route("/", routes)

    const res = await app.request("/bookings/book_123/reminder-runs?status=sent")

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      data: [
        {
          id: "run_123",
          reminderRuleId: "rule_123",
          reminderRuleSlug: "deposit-reminder",
          reminderRuleName: "Deposit reminder",
          targetType: "booking_payment_schedule",
          targetId: "bps_123",
          bookingId: "book_123",
          paymentSessionId: "ps_123",
          notificationDeliveryId: "del_123",
          status: "sent",
          deliveryStatus: "sent",
          channel: "email",
          provider: "local",
          recipient: "traveler@example.com",
          scheduledFor: "2026-06-14T08:00:00.000Z",
          processedAt: "2026-06-14T08:01:00.000Z",
          errorMessage: null,
          relativeDaysFromDueDate: null,
          createdAt: "2026-06-14T07:59:00.000Z",
        },
      ],
      total: 1,
      limit: 20,
      offset: 0,
    })
    expect(listBookingReminderRuns).toHaveBeenCalledWith(db, "book_123", {
      limit: 20,
      offset: 0,
      status: "sent",
    })
  })
})
