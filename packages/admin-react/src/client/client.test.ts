import { AdminApiError, AdminApprovalRequiredError } from "@voyant-travel/admin-contracts"
import { describe, expect, it } from "vitest"
import type { FetchLike } from "./http.js"
import { createAdminClient } from "./index.js"

interface Recorded {
  url: string
  method: string
  headers: Record<string, string>
  body?: string
}

function mockFetch(responder: (req: Recorded) => { status: number; body: unknown }) {
  const calls: Recorded[] = []
  const fetchImpl: FetchLike = async (url, init) => {
    const req: Recorded = { url, method: init.method, headers: init.headers, body: init.body }
    calls.push(req)
    const { status, body } = responder(req)
    return { ok: status >= 200 && status < 300, status, json: async () => body }
  }
  return { fetchImpl, calls }
}

const booking = {
  id: "book_123",
  bookingNumber: "B-123",
  status: "confirmed",
  contactEmail: "a@b.com",
  sellCurrency: "EUR",
  sellAmountCents: 10000,
  createdAt: "2026-06-01T00:00:00Z",
  updatedAt: "2026-06-01T00:00:00Z",
}

describe("createAdminClient", () => {
  it("confirms a booking: POST, auth + idempotency headers, JSON body, data-unwrapped result", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({ status: 200, body: { data: booking } }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app/",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
      idempotencyKey: (op) => `idem-${op}`,
    })

    const result = await client.bookings.confirm({ id: "book_123" }, { note: "ok" })

    expect(result.bookingNumber).toBe("B-123") // { data } unwrapped + output-parsed
    const [req] = calls
    expect(req?.method).toBe("POST")
    expect(req?.url).toBe("https://acme.voyant.app/v1/admin/bookings/book_123/confirm")
    expect(req?.headers.authorization).toBe("Bearer voy_test")
    expect(req?.headers["content-type"]).toBe("application/json")
    expect(req?.headers["idempotency-key"]).toBe("idem-bookings.confirm")
    expect(JSON.parse(req?.body ?? "{}")).toEqual({ note: "ok" })
  })

  it("lists bookings: GET with query string, raw paginated envelope", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({
      status: 200,
      body: { data: [booking], total: 1, limit: 20, offset: 0 },
    }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "bearer", token: "jwt123" },
      fetch: fetchImpl,
    })

    const page = await client.bookings.list({ status: "on_hold", limit: 20, offset: 0 })

    expect(page.total).toBe(1)
    expect(page.data[0]?.id).toBe("book_123")
    const [req] = calls
    expect(req?.method).toBe("GET")
    expect(req?.url).toContain("/v1/admin/bookings?")
    expect(req?.url).toContain("status=on_hold")
    expect(req?.url).toContain("limit=20")
    expect(req?.headers.authorization).toBe("Bearer jwt123")
    expect(req?.body).toBeUndefined()
  })

  it("throws a typed AdminApiError on non-2xx", async () => {
    const { fetchImpl } = mockFetch(() => ({
      status: 404,
      body: { error: "Booking not found", code: "not_found", requestId: "req_1" },
    }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
    })

    await expect(client.bookings.get({ id: "missing" })).rejects.toMatchObject({
      name: "AdminApiError",
      status: 404,
    })
    try {
      await client.bookings.get({ id: "missing" })
    } catch (err) {
      expect(err).toBeInstanceOf(AdminApiError)
      expect((err as AdminApiError).code).toBe("not_found")
      expect((err as AdminApiError).requestId).toBe("req_1")
    }
  })

  it("records a payment against an invoice", async () => {
    const payment = {
      id: "pay_1",
      invoiceId: "inv_9",
      amountCents: 50000,
      currency: "EUR",
      paymentMethod: "bank_transfer",
      status: "completed",
      paymentDate: "2026-06-01",
      createdAt: "2026-06-01T00:00:00Z",
    }
    const { fetchImpl, calls } = mockFetch(() => ({ status: 201, body: { data: payment } }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
    })

    const result = await client.finance.payments.record(
      { id: "inv_9" },
      {
        amountCents: 50000,
        currency: "EUR",
        paymentMethod: "bank_transfer",
        paymentDate: "2026-06-01",
      },
    )

    expect(result.id).toBe("pay_1")
    expect(calls[0]?.url).toBe("https://acme.voyant.app/v1/admin/finance/invoices/inv_9/payments")
  })

  it("surfaces a 202 approval-required response as AdminApprovalRequiredError", async () => {
    const { fetchImpl } = mockFetch(() => ({
      status: 202,
      body: {
        data: {
          approvalRequired: true,
          requestedAction: {
            id: "act_1",
            status: "pending_approval",
            actionName: "booking.status.confirm",
          },
          approval: { id: "appr_1", status: "pending", requestedActionId: "act_1" },
          replayed: false,
        },
      },
    }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
    })

    await expect(client.bookings.confirm({ id: "book_123" }, {})).rejects.toBeInstanceOf(
      AdminApprovalRequiredError,
    )
    try {
      await client.bookings.confirm({ id: "book_123" }, {})
    } catch (err) {
      expect(err).toBeInstanceOf(AdminApprovalRequiredError)
      expect((err as AdminApprovalRequiredError).approvalId).toBe("appr_1")
    }
  })

  it("creates a CRM person: POST with idempotency, data-unwrapped result", async () => {
    const person = {
      id: "pers_1",
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
      createdAt: "2026-06-01T00:00:00Z",
      updatedAt: "2026-06-01T00:00:00Z",
    }
    const { fetchImpl, calls } = mockFetch(() => ({ status: 201, body: { data: person } }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
      idempotencyKey: (op) => `idem-${op}`,
    })

    const result = await client.crm.people.create({
      firstName: "Ada",
      lastName: "Lovelace",
      email: "ada@example.com",
    })

    expect(result.id).toBe("pers_1")
    expect(calls[0]?.method).toBe("POST")
    expect(calls[0]?.url).toBe("https://acme.voyant.app/v1/admin/crm/people")
    expect(calls[0]?.headers["idempotency-key"]).toBe("idem-crm.people.create")
  })

  it("reveals a person document (PII-gated GET)", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({
      status: 200,
      body: { data: { documentNumber: "X1234567" } },
    }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
    })

    const result = await client.crm.people.revealDocument({ id: "pdoc_1" })

    expect(result.documentNumber).toBe("X1234567")
    expect(calls[0]?.method).toBe("GET")
    expect(calls[0]?.url).toBe(
      "https://acme.voyant.app/v1/admin/crm/person-documents/pdoc_1/reveal",
    )
  })

  it("voids a contract and lists products", async () => {
    const { fetchImpl, calls } = mockFetch((req) =>
      req.method === "POST"
        ? { status: 200, body: { data: { id: "cont_1", status: "void" } } }
        : {
            status: 200,
            body: { data: [{ id: "prod_1", name: "Tour" }], total: 1, limit: 50, offset: 0 },
          },
    )
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
    })

    const voided = await client.legal.contracts.void({ id: "cont_1" })
    expect(voided.status).toBe("void")
    expect(calls[0]?.url).toBe("https://acme.voyant.app/v1/admin/legal/contracts/cont_1/void")

    const page = await client.products.list({ search: "tour" })
    expect(page.data[0]?.id).toBe("prod_1")
    expect(calls[1]?.url).toContain("/v1/admin/products?")
  })

  it("creates a product (input derived from @voyant-travel/products-contracts)", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({
      status: 201,
      body: { data: { id: "prod_9", name: "City Tour", status: "draft" } },
    }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
    })

    const result = await client.products.create({ name: "City Tour", sellCurrency: "EUR" })

    expect(result.id).toBe("prod_9")
    expect(calls[0]?.method).toBe("POST")
    expect(calls[0]?.url).toBe("https://acme.voyant.app/v1/admin/products")
    // Defaults from the route schema are applied before send (e.g. status=draft).
    expect(JSON.parse(calls[0]?.body ?? "{}")).toMatchObject({ name: "City Tour", status: "draft" })
  })

  it("discovers deployment capabilities", async () => {
    const { fetchImpl, calls } = mockFetch(() => ({
      status: 200,
      body: {
        contractVersion: "0.1.0",
        modules: ["bookings", "finance"],
        operations: [
          {
            id: "bookings.confirm",
            method: "POST",
            pathTemplate: "/v1/admin/bookings/:id/confirm",
            classification: "requires_confirmation",
            scopes: ["bookings:write"],
          },
        ],
      },
    }))
    const client = createAdminClient({
      baseUrl: "https://acme.voyant.app",
      auth: { type: "apiKey", apiKey: "voy_test" },
      fetch: fetchImpl,
    })

    const caps = await client.capabilities()
    expect(caps.modules).toContain("finance")
    expect(caps.operations[0]?.id).toBe("bookings.confirm")
    expect(calls[0]?.url).toBe("https://acme.voyant.app/v1/admin/_meta/capabilities")
  })
})
