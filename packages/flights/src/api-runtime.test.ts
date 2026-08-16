import { handleApiError } from "@voyant-travel/hono"
import { Hono } from "hono"
import { describe, expect, it, vi } from "vitest"
import {
  createFlightAdminRoutes,
  createFlightsApiModule,
  type FlightPaymentIntegration,
} from "./api-runtime.js"
import type { FlightConnectorAdapter } from "./contract/adapter.js"

function stubAdapter(over: Partial<FlightConnectorAdapter> = {}): FlightConnectorAdapter {
  return {
    capabilities: { provider: "stub", declared: [] },
    searchFlights: vi.fn(async () => ({ offers: [] })),
    priceOffer: vi.fn(async () => ({ offer: {} as never, valid: true })),
    bookFlight: vi.fn(async () => ({ order: { orderId: "ord_1", passengers: [] } as never })),
    getOrder: vi.fn(async () => ({ order: { orderId: "ord_1", passengers: [] } as never })),
    cancelOrder: vi.fn(async () => ({ order: { orderId: "ord_1" } as never })),
    ...over,
  }
}

function mount(adapter: FlightConnectorAdapter, payment?: FlightPaymentIntegration) {
  return (
    new Hono()
      .route(
        "/v1/admin/flights",
        createFlightAdminRoutes({ resolveAdapter: () => adapter, payment }),
      )
      // Routes that validate through `parseJsonBody` signal by throwing, and the
      // host app is what turns that into a status. Without this the harness
      // would report 500 for what production answers 400.
      .onError((err, c) => handleApiError(err, c, { appName: "flights-test" }))
  )
}

describe("flights hono module", () => {
  it("createFlightsApiModule exposes adminRoutes on module 'flights'", () => {
    const mod = createFlightsApiModule({ resolveAdapter: () => stubAdapter() })
    expect(mod.module.name).toBe("flights")
    expect(mod.adminRoutes).toBeDefined()
  })

  it("POST /search delegates to the resolved adapter", async () => {
    const adapter = stubAdapter()
    const app = mount(adapter)
    const res = await app.request("/v1/admin/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slices: [{}], passengers: { adults: 1 } }),
    })
    expect(res.status).toBe(200)
    expect(adapter.searchFlights).toHaveBeenCalledTimes(1)
  })

  it("POST /search returns 503 when the connector is unavailable", async () => {
    const message = "Flight connector is not configured."
    const adapter = stubAdapter({
      searchFlights: vi.fn(async () => {
        throw new Error(message)
      }),
    })
    const app = mount(adapter)

    const res = await app.request("/v1/admin/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slices: [{}], passengers: { adults: 1 } }),
    })

    expect(res.status).toBe(503)
    await expect(res.json()).resolves.toEqual({ error: message })
  })

  it("POST /search validates required fields", async () => {
    const app = mount(stubAdapter())
    const res = await app.request("/v1/admin/flights/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ passengers: { adults: 1 } }),
    })
    expect(res.status).toBe(400)
  })

  describe("POST /fare-calendar", () => {
    const window = {
      origin: "LHR",
      destination: "JFK",
      from: "2026-08-01",
      to: "2026-08-31",
      passengers: { adults: 1 },
    }

    function callCalendar(app: Hono, body: unknown) {
      return app.request("/v1/admin/flights/fare-calendar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
    }

    it("delegates the quoted window to the resolved adapter", async () => {
      const searchFareCalendar = vi.fn(async () => ({ days: [] }))
      const app = mount(stubAdapter({ searchFareCalendar }))

      const res = await callCalendar(app, window)

      expect(res.status).toBe(200)
      expect(searchFareCalendar).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ origin: "LHR", from: "2026-08-01", to: "2026-08-31" }),
      )
    })

    // A connector without cached lowest-fare data is the common case; the
    // picker reads 501 as "no decoration" rather than as an error.
    it("answers 501 when the connector does not declare the capability", async () => {
      const app = mount(stubAdapter())

      const res = await callCalendar(app, window)

      expect(res.status).toBe(501)
      expect(await res.json()).toEqual({
        error: "Connector does not declare flight/fare-calendar capability",
      })
    })

    it("rejects an inverted window", async () => {
      const searchFareCalendar = vi.fn(async () => ({ days: [] }))
      const app = mount(stubAdapter({ searchFareCalendar }))

      const res = await callCalendar(app, { ...window, from: "2026-08-31", to: "2026-08-01" })

      expect(res.status).toBe(400)
      expect(searchFareCalendar).not.toHaveBeenCalled()
    })

    // The cap is what stops one request becoming a year of supplier lookups.
    it("rejects a window wider than the cap before reaching the connector", async () => {
      const searchFareCalendar = vi.fn(async () => ({ days: [] }))
      const app = mount(stubAdapter({ searchFareCalendar }))

      const res = await callCalendar(app, { ...window, from: "2026-01-01", to: "2026-12-31" })

      expect(res.status).toBe(400)
      expect(searchFareCalendar).not.toHaveBeenCalled()
    })

    it("rejects a malformed date rather than passing it through", async () => {
      const searchFareCalendar = vi.fn(async () => ({ days: [] }))
      const app = mount(stubAdapter({ searchFareCalendar }))

      const res = await callCalendar(app, { ...window, from: "August 2026" })

      expect(res.status).toBe(400)
      expect(searchFareCalendar).not.toHaveBeenCalled()
    })

    // `new Date("2026-02-31")` rolls forward to March 3rd, so a shape-only
    // check would quote a month the caller never asked for.
    it("rejects a date-shaped string that is not a real day", async () => {
      const searchFareCalendar = vi.fn(async () => ({ days: [] }))
      const app = mount(stubAdapter({ searchFareCalendar }))

      for (const from of ["2026-02-31", "2026-13-01", "2026-04-31", "2026-00-10"]) {
        const res = await callCalendar(app, { ...window, from })
        expect(res.status, `expected 400 for ${from}`).toBe(400)
      }
      expect(searchFareCalendar).not.toHaveBeenCalled()
    })

    it("accepts a leap day in a leap year and refuses it otherwise", async () => {
      const searchFareCalendar = vi.fn(async () => ({ days: [] }))
      const app = mount(stubAdapter({ searchFareCalendar }))

      const leap = await callCalendar(app, { ...window, from: "2028-02-29", to: "2028-03-05" })
      expect(leap.status).toBe(200)

      const notLeap = await callCalendar(app, { ...window, from: "2027-02-29", to: "2027-03-05" })
      expect(notLeap.status).toBe(400)
    })
  })

  it("returns 501 when the connector lacks an optional capability", async () => {
    const app = mount(stubAdapter())
    const res = await app.request("/v1/admin/flights/ancillaries", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: "off_1" }),
    })
    expect(res.status).toBe(501)
  })

  it("creates and attaches a bank-transfer payment session during booking", async () => {
    const adapter = stubAdapter()
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => ({ sessionId: "ps_bank", status: "pending" })),
      fetchOrderSessions: vi.fn(async () => new Map()),
    }
    const app = mount(adapter, payment)

    const res = await app.request("/v1/admin/flights/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: "off_1",
        passengers: [{ passengerId: "p1" }],
        contact: { email: "payer@example.com" },
        paymentIntent: { type: "bank_transfer" },
      }),
    })

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      order: {
        providerData: {
          paymentSessionId: "ps_bank",
          paymentStatus: "pending",
        },
      },
    })
    expect(payment.ensureOrderSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: "ord_1" }),
      { email: "payer@example.com" },
      { paymentMethod: "bank_transfer", startCardPayment: false },
    )
    expect(adapter.bookFlight).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentIntent: { type: "hold" } }),
    )
  })

  it("preserves hold payment-session creation during booking", async () => {
    const adapter = stubAdapter()
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => ({ sessionId: "ps_hold", status: "pending" })),
      fetchOrderSessions: vi.fn(async () => new Map()),
    }
    const app = mount(adapter, payment)

    const res = await app.request("/v1/admin/flights/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: "off_1",
        passengers: [{ passengerId: "p1" }],
        paymentIntent: { type: "hold" },
      }),
    })

    expect(res.status).toBe(200)
    expect(payment.ensureOrderSession).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ orderId: "ord_1" }),
      undefined,
      { startCardPayment: true },
    )
  })

  it("does not create a payment session for card booking intent", async () => {
    const adapter = stubAdapter()
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => ({ sessionId: "ps_card", status: "pending" })),
      fetchOrderSessions: vi.fn(async () => new Map()),
    }
    const app = mount(adapter, payment)

    const res = await app.request("/v1/admin/flights/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: "off_1",
        passengers: [{ passengerId: "p1" }],
        paymentIntent: { type: "card", token: "tok_1" },
      }),
    })

    expect(res.status).toBe(200)
    expect(payment.ensureOrderSession).not.toHaveBeenCalled()
    expect(adapter.bookFlight).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ paymentIntent: { type: "card", token: "tok_1" } }),
    )
  })

  it("does not create a delayed payment session when reading a card-ticketed order", async () => {
    const adapter = stubAdapter({
      bookFlight: vi.fn(async () => ({
        order: {
          orderId: "ord_card",
          status: "ticketed",
          passengers: [{ passengerId: "p1" }],
        } as never,
      })),
      getOrder: vi.fn(async () => ({
        order: {
          orderId: "ord_card",
          status: "ticketed",
          passengers: [{ passengerId: "p1" }],
        } as never,
      })),
    })
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => ({ sessionId: "ps_card", status: "pending" })),
      fetchOrderSessions: vi.fn(async () => new Map()),
    }
    const app = mount(adapter, payment)

    const bookRes = await app.request("/v1/admin/flights/book", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        offerId: "off_1",
        passengers: [{ passengerId: "p1" }],
        paymentIntent: { type: "card", token: "tok_1" },
      }),
    })
    const readRes = await app.request("/v1/admin/flights/orders/ord_card")

    expect(bookRes.status).toBe(200)
    expect(readRes.status).toBe(200)
    await expect(readRes.json()).resolves.toMatchObject({
      order: {
        orderId: "ord_card",
        status: "ticketed",
      },
    })
    expect(payment.ensureOrderSession).not.toHaveBeenCalled()
    expect(payment.fetchOrderSessions).toHaveBeenCalledWith(expect.anything(), ["ord_card"])
  })

  it("GET /orders/:orderId attaches an existing payment session without ensuring one", async () => {
    const adapter = stubAdapter({
      getOrder: vi.fn(async () => ({
        order: {
          orderId: "ord_1",
          passengers: [],
          providerData: { source: "stub" },
        } as never,
      })),
    })
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => {
        throw new Error("GET must not create or start payment sessions")
      }),
      fetchOrderSessions: vi.fn(
        async () => new Map([["ord_1", { sessionId: "ps_existing", status: "pending" }]]),
      ),
    }
    const app = mount(adapter, payment)

    const res = await app.request("/v1/admin/flights/orders/ord_1")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      order: {
        providerData: {
          source: "stub",
          paymentSessionId: "ps_existing",
          paymentStatus: "pending",
        },
      },
    })
    expect(payment.fetchOrderSessions).toHaveBeenCalledWith(expect.anything(), ["ord_1"])
    expect(payment.ensureOrderSession).not.toHaveBeenCalled()
  })

  it("does not create payment sessions when listing orders", async () => {
    const adapter = stubAdapter({
      listOrders: vi.fn(async () => ({
        orders: [{ orderId: "ord_card", status: "ticketed", passengers: [] } as never],
        pagination: { total: 1, hasMore: false },
      })),
    })
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => ({ sessionId: "ps_unexpected", status: "pending" })),
      fetchOrderSessions: vi.fn(async () => new Map()),
    }
    const app = mount(adapter, payment)

    const res = await app.request("/v1/admin/flights/orders")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      orders: [{ orderId: "ord_card", status: "ticketed" }],
    })
    expect(payment.fetchOrderSessions).toHaveBeenCalledWith(expect.anything(), ["ord_card"])
    expect(payment.ensureOrderSession).not.toHaveBeenCalled()
  })

  it("GET /orders attaches existing payment sessions without ensuring any", async () => {
    const adapter = stubAdapter({
      listOrders: vi.fn(async () => ({
        orders: [
          { orderId: "ord_1", passengers: [] },
          { orderId: "ord_2", passengers: [] },
        ] as never,
        pagination: { total: 2, hasMore: false },
      })),
    })
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => {
        throw new Error("GET must not create or start payment sessions")
      }),
      fetchOrderSessions: vi.fn(
        async () =>
          new Map([
            ["ord_1", { sessionId: "ps_1", status: "pending" }],
            ["ord_2", { sessionId: "ps_2", status: "paid" }],
          ]),
      ),
    }
    const app = mount(adapter, payment)

    const res = await app.request("/v1/admin/flights/orders")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      orders: [
        { providerData: { paymentSessionId: "ps_1", paymentStatus: "pending" } },
        { providerData: { paymentSessionId: "ps_2", paymentStatus: "paid" } },
      ],
    })
    expect(payment.fetchOrderSessions).toHaveBeenCalledWith(expect.anything(), ["ord_1", "ord_2"])
    expect(payment.ensureOrderSession).not.toHaveBeenCalled()
  })

  it("attaches an existing payment session when reading an order", async () => {
    const adapter = stubAdapter({
      getOrder: vi.fn(async () => ({
        order: { orderId: "ord_hold", status: "confirmed", passengers: [] } as never,
      })),
    })
    const payment: FlightPaymentIntegration = {
      ensureOrderSession: vi.fn(async () => ({ sessionId: "ps_unexpected", status: "pending" })),
      fetchOrderSessions: vi.fn(
        async () => new Map([["ord_hold", { sessionId: "ps_existing", status: "paid" }]]),
      ),
    }
    const app = mount(adapter, payment)

    const res = await app.request("/v1/admin/flights/orders/ord_hold")

    expect(res.status).toBe(200)
    await expect(res.json()).resolves.toMatchObject({
      order: {
        providerData: {
          paymentSessionId: "ps_existing",
          paymentStatus: "paid",
        },
      },
    })
    expect(payment.ensureOrderSession).not.toHaveBeenCalled()
  })

  it("returns 404 when reading a missing order", async () => {
    const adapter = stubAdapter({
      getOrder: vi.fn(async () => {
        throw new Error("order_not_found")
      }),
    })
    const app = mount(adapter)

    const res = await app.request("/v1/admin/flights/orders/no_such_order")

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "order_not_found" })
  })

  it("returns 404 when cancelling a missing order", async () => {
    const adapter = stubAdapter({
      cancelOrder: vi.fn(async () => {
        throw new Error("order_not_found")
      }),
    })
    const app = mount(adapter)

    const res = await app.request("/v1/admin/flights/orders/no_such_order/cancel", {
      method: "POST",
    })

    expect(res.status).toBe(404)
    await expect(res.json()).resolves.toEqual({ error: "order_not_found" })
  })
})
