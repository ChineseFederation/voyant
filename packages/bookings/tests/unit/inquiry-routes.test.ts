import { OpenAPIHono } from "@hono/zod-openapi"
import { describe, expect, it, vi } from "vitest"

import { createBookingInquiryPublicRoutes } from "../../src/routes-inquiries.js"

const inquiry = {
  id: "bkin_01kzexample00000000000000",
  idempotencyKey: "ask-1",
  requestFingerprint: "fingerprint",
  channelId: "channel_1",
  productId: "prod_1",
  departureId: "departure_1",
  contactFirstName: "Ana",
  contactLastName: "Popescu",
  contactEmail: "ana@example.com",
  contactPhone: null,
  locale: "ro",
  message: "Mai sunt locuri?",
  status: "open" as const,
  createdAt: new Date("2026-08-07T10:00:00.000Z"),
  updatedAt: new Date("2026-08-07T10:00:00.000Z"),
}

function appWith(submit: ReturnType<typeof vi.fn>) {
  const routes = createBookingInquiryPublicRoutes({
    submit,
    getById: vi.fn(),
    list: vi.fn(),
  } as never)
  const app = new OpenAPIHono()
  app.use("*", async (c, next) => {
    c.set("db" as never, {})
    c.set("publicChannel" as never, {
      channelId: "channel_1",
      channelStatus: "active",
    })
    await next()
  })
  app.route("/", routes)
  return app
}

const requestBody = {
  productId: "prod_1",
  departureId: "departure_1",
  contact: { firstName: "Ana", lastName: "Popescu", email: "ana@example.com" },
  locale: "ro",
  message: "Mai sunt locuri?",
}

describe("booking inquiry public route", () => {
  it("returns an authoritative receipt scoped to the active channel", async () => {
    const submit = vi.fn().mockResolvedValue({ status: "created", inquiry })
    const response = await appWith(submit).request("/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Idempotency-Key": "ask-1" },
      body: JSON.stringify(requestBody),
    })

    expect(response.status).toBe(201)
    await expect(response.json()).resolves.toMatchObject({
      data: { id: inquiry.id, channelId: "channel_1" },
    })
    expect(submit).toHaveBeenCalledWith(
      {},
      expect.objectContaining({
        idempotencyKey: "ask-1",
        channelId: "channel_1",
        productId: "prod_1",
      }),
      { eventBus: undefined },
    )
  })

  it("requires an idempotency identity before accepting the inquiry", async () => {
    const submit = vi.fn()
    const response = await appWith(submit).request("/inquiries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    })

    expect(response.status).toBe(400)
    expect(submit).not.toHaveBeenCalled()
  })
})
