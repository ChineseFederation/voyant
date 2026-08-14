import { Hono } from "hono"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createNotificationsRoutes } from "../../src/routes.js"
import { notificationsService } from "../../src/service.js"

/**
 * The notification-owned sends must resolve the same effective payment-link
 * template the checkout path resolves. A managed deployment that configures
 * only `PUBLIC_PAYMENT_LINK_URL_TEMPLATE` has no `PUBLIC_CHECKOUT_BASE_URL`, so
 * without this the invoice/payment-session emails would carry the processor
 * redirect URL or no payment URL at all.
 */
function mountDispatchRoutes(
  resolvePaymentLinkUrlTemplate: (
    db: unknown,
    bindings: Record<string, unknown>,
  ) => Promise<string | null>,
) {
  const db = { marker: "db" }
  const routes = createNotificationsRoutes({
    resolvePaymentLinkUrlTemplate: resolvePaymentLinkUrlTemplate as never,
  })
  const app = new Hono()
  app.use("*", async (c, next) => {
    c.set("db", db)
    await next()
  })
  app.route("/", routes as never)
  return { app, db }
}

const body = JSON.stringify({
  idempotencyKey: "domain-notification-1",
  templateSlug: "payment-reminder",
})
const headers = { "content-type": "application/json" }

afterEach(() => {
  vi.restoreAllMocks()
})

describe("notification-owned domain sends", () => {
  it("passes the resolved payment-link template to a payment-session send", async () => {
    const send = vi
      .spyOn(notificationsService, "sendPaymentSessionNotification")
      .mockResolvedValue({ id: "ndel_1" } as never)
    const { app, db } = mountDispatchRoutes(
      async () => "https://brand.example.test/pay/{sessionId}",
    )

    const response = await app.request("/payment-sessions/pmss_123/send", {
      method: "POST",
      headers,
      body,
    })

    expect(response.status).toBe(201)
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[0]).toBe(db)
    expect(send.mock.calls[0]?.[4]).toMatchObject({
      paymentLinkUrlTemplate: "https://brand.example.test/pay/{sessionId}",
    })
  })

  it("passes the resolved payment-link template to an invoice send", async () => {
    const send = vi
      .spyOn(notificationsService, "sendInvoiceNotification")
      .mockResolvedValue({ id: "ndel_2" } as never)
    const { app } = mountDispatchRoutes(async () => "https://brand.example.test/pay/{sessionId}")

    const response = await app.request("/invoices/inv_123/send", {
      method: "POST",
      headers,
      body,
    })

    expect(response.status).toBe(201)
    expect(send).toHaveBeenCalledOnce()
    expect(send.mock.calls[0]?.[4]).toMatchObject({
      paymentLinkUrlTemplate: "https://brand.example.test/pay/{sessionId}",
    })
  })

  it("sends a null template when the deployment configures none", async () => {
    const send = vi
      .spyOn(notificationsService, "sendPaymentSessionNotification")
      .mockResolvedValue({ id: "ndel_3" } as never)
    const { app } = mountDispatchRoutes(async () => null)

    await app.request("/payment-sessions/pmss_123/send", { method: "POST", headers, body })

    expect(send.mock.calls[0]?.[4]).toMatchObject({ paymentLinkUrlTemplate: null })
  })
})
