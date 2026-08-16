/**
 * Flight admin HTTP routes, owned by the flights module.
 *
 * agent-quality: file-size exception -- the flight admin surface (search,
 * ancillaries, seatmap, price, book, orders, reference) is one cohesive route
 * family; splitting it would scatter a single connector-backed contract.
 *
 *   POST   /search                   — adapter.searchFlights
 *   POST   /ancillaries              — adapter.getAncillaries
 *   POST   /seatmap                  — adapter.getSeatMap
 *   POST   /price                    — adapter.priceOffer
 *   POST   /book                     — adapter.bookFlight (+ optional payment session on hold)
 *   GET    /orders                   — adapter.listOrders (+ optional payment status)
 *   GET    /orders/:orderId          — adapter.getOrder (+ optional payment status)
 *   POST   /orders/:orderId/ticket   — adapter.ticketOrder (capability-gated)
 *   POST   /orders/:orderId/cancel   — adapter.cancelOrder
 *   GET    /reference/airports?q=&limit=
 *   GET    /reference/airlines
 *   GET    /reference/aircraft
 *
 * The deployment supplies the connector (`resolveAdapter`) and, optionally, a
 * payment integration for order payment sessions (`payment`). The routes mount at
 * `/v1/admin/flights` via `createFlightsApiModule(...)`.
 */

import { OpenAPIHono } from "@hono/zod-openapi"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { createOrderPaymentSessions } from "@voyant-travel/finance/order-payment-sessions"
import type { ApiModule } from "@voyant-travel/hono"
import { ilike, or } from "drizzle-orm"
import type { Context } from "hono"

import type {
  FlightCancelReason,
  FlightConnectorAdapter,
  FlightPriceRequest,
} from "./contract/adapter.js"
import type {
  AncillaryRequest,
  FlightBookRequest,
  FlightOrder,
  FlightOrderStatus,
  FlightSearchRequest,
  PaymentIntent,
  SeatMapRequest,
} from "./contract/types.js"
import { createFlightOrderPaymentIntegration } from "./payment-integration.js"
import {
  referenceAircraft,
  referenceAirlines,
  referenceAirports,
} from "./reference/local-postgres.js"
import { flightsRuntimePort } from "./runtime-port.js"

/** A resolved payment session for a flight order. */
export interface FlightOrderPaymentSummary {
  sessionId: string
  status: string
}

/**
 * Deployment-supplied payment integration for flight orders. The flights
 * module stays payment-provider agnostic; the deployment wires its finance /
 * payment provider here.
 */
export interface FlightPaymentIntegration {
  /** Ensure (idempotently) a payment session exists for an order. */
  ensureOrderSession(
    c: Context,
    order: FlightOrder,
    contact?: { email?: string; phone?: string },
    options?: { paymentMethod?: "bank_transfer" | "credit_card"; startCardPayment?: boolean },
  ): Promise<FlightOrderPaymentSummary | null>
  /** Bulk-resolve the most relevant payment session per order id (no N+1). */
  fetchOrderSessions(
    c: Context,
    orderIds: string[],
  ): Promise<Map<string, FlightOrderPaymentSummary>>
}

export interface FlightsRouteOptions {
  /**
   * Resolve the flight connector adapter for a request. The deployment picks
   * the demo connector or a real GDS (Sabre / Amadeus / Duffel).
   */
  resolveAdapter(c: Context): FlightConnectorAdapter
  /** Optional payment-link integration for hold orders. */
  payment?: FlightPaymentIntegration
}

export type FlightsApiModuleOptions = FlightsRouteOptions

export const FLIGHTS_OPENAPI_API_ID = "@voyant-travel/flights#api"

const FLIGHT_OPENAPI_OPERATIONS = [
  ["post", "/search", "Search flights"],
  ["post", "/ancillaries", "Get flight ancillaries"],
  ["post", "/seatmap", "Get a flight seat map"],
  ["post", "/price", "Price a flight offer"],
  ["post", "/book", "Book a flight offer"],
  ["get", "/orders", "List flight orders"],
  ["get", "/orders/{orderId}", "Get a flight order"],
  ["post", "/orders/{orderId}/ticket", "Ticket a flight order"],
  ["post", "/orders/{orderId}/cancel", "Cancel a flight order"],
  ["get", "/reference/airports", "List reference airports"],
  ["get", "/reference/airlines", "List reference airlines"],
  ["get", "/reference/aircraft", "List reference aircraft"],
] as const

function buildContext(c: Context): { connectionId: string; correlationId?: string } {
  return {
    connectionId: "demo",
    correlationId: c.req.header("x-request-id") ?? undefined,
  }
}

// `c.var.db` is set by the createApp DB middleware; the global ContextVariableMap
// doesn't declare it, so cast at the call site to keep type-safety local.
function getDb(c: Context): AnyDrizzleDb {
  return (c.var as { db: AnyDrizzleDb }).db
}

function attachPaymentSession<T extends FlightOrder>(
  order: T,
  summary: FlightOrderPaymentSummary | null,
): T {
  if (!summary) return order
  return {
    ...order,
    providerData: {
      ...(order.providerData ?? {}),
      paymentSessionId: summary.sessionId,
      paymentStatus: summary.status,
    },
  }
}

function adapterErrorDetails(err: unknown): { message: string; status: 404 | 500 | 503 } {
  const message = err instanceof Error ? err.message : String(err)
  return { message, status: statusForAdapterErrorMessage(message) }
}

function statusForAdapterErrorMessage(message: string): 404 | 500 | 503 {
  if (/(?:not found|_not_found\b)/i.test(message)) return 404
  if (
    /(?:Flight connector is not configured|network connection lost|fetch failed|ECONNREFUSED|ENOTFOUND)/i.test(
      message,
    )
  ) {
    return 503
  }
  return 500
}

function paymentSessionOptionsForIntent(
  intent: PaymentIntent | undefined,
): { paymentMethod?: "bank_transfer" | "credit_card"; startCardPayment?: boolean } | null {
  if (!intent || intent.type === "hold") return { startCardPayment: true }
  if (intent.type === "bank_transfer") {
    return { paymentMethod: "bank_transfer", startCardPayment: false }
  }
  return null
}

function adapterBookingRequestForIntent(body: FlightBookRequest): FlightBookRequest {
  if (body.paymentIntent?.type !== "bank_transfer") return body
  return {
    ...body,
    paymentIntent: { type: "hold" },
  }
}

/** Build the flight admin routes (relative paths; mount at `/v1/admin/flights`). */
export function createFlightAdminRoutes(options: FlightsRouteOptions): OpenAPIHono {
  const { resolveAdapter, payment } = options
  const hono = new OpenAPIHono()

  // ── Search ──────────────────────────────────────────────────────────────
  hono.post("/search", async (c) => {
    let body: FlightSearchRequest
    try {
      body = await c.req.json<FlightSearchRequest>()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }
    if (!body.slices?.length) return c.json({ error: "slices is required" }, 400)
    if (!body.passengers?.adults || body.passengers.adults < 1) {
      return c.json({ error: "passengers.adults must be at least 1" }, 400)
    }
    try {
      const response = await resolveAdapter(c).searchFlights(buildContext(c), body)
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Ancillaries ─────────────────────────────────────────────────────────
  hono.post("/ancillaries", async (c) => {
    let body: AncillaryRequest
    try {
      body = await c.req.json<AncillaryRequest>()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }
    if (!body.offerId) return c.json({ error: "offerId is required" }, 400)
    const adapter = resolveAdapter(c)
    if (!adapter.getAncillaries) {
      return c.json({ error: "Connector does not declare flight/ancillaries capability" }, 501)
    }
    try {
      const response = await adapter.getAncillaries(buildContext(c), body)
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Seat map ────────────────────────────────────────────────────────────
  hono.post("/seatmap", async (c) => {
    let body: SeatMapRequest
    try {
      body = await c.req.json<SeatMapRequest>()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }
    if (!body.offerId) return c.json({ error: "offerId is required" }, 400)
    if (!body.segmentId) return c.json({ error: "segmentId is required" }, 400)
    const adapter = resolveAdapter(c)
    if (!adapter.getSeatMap) {
      return c.json({ error: "Connector does not declare flight/seatmap capability" }, 501)
    }
    try {
      const response = await adapter.getSeatMap(buildContext(c), body)
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Re-price ────────────────────────────────────────────────────────────
  hono.post("/price", async (c) => {
    let body: FlightPriceRequest
    try {
      body = await c.req.json<FlightPriceRequest>()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }
    if (!body.offerId) return c.json({ error: "offerId is required" }, 400)
    try {
      const response = await resolveAdapter(c).priceOffer(buildContext(c), body)
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Book ────────────────────────────────────────────────────────────────
  hono.post("/book", async (c) => {
    let body: FlightBookRequest
    try {
      body = await c.req.json<FlightBookRequest>()
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400)
    }
    if (!body.offerId) return c.json({ error: "offerId is required" }, 400)
    if (!body.passengers?.length) return c.json({ error: "passengers is required" }, 400)
    try {
      const response = await resolveAdapter(c).bookFlight(
        buildContext(c),
        adapterBookingRequestForIntent(body),
      )
      // Hold is the default intent. Bank transfer also needs a finance session
      // so the order can expose the reference/instructions through checkout.
      const paymentSessionOptions = paymentSessionOptionsForIntent(body.paymentIntent)
      if (paymentSessionOptions && response.order && payment) {
        const summary = await payment.ensureOrderSession(
          c,
          response.order,
          body.contact,
          paymentSessionOptions,
        )
        response.order = attachPaymentSession(response.order, summary)
      }
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── List orders ─────────────────────────────────────────────────────────
  hono.get("/orders", async (c) => {
    const adapter = resolveAdapter(c)
    if (!adapter.listOrders) {
      return c.json({ error: "Adapter does not support listing orders" }, 501)
    }
    const url = new URL(c.req.url)
    const limitParam = url.searchParams.get("limit")
    const cursor = url.searchParams.get("cursor") ?? undefined
    const search = url.searchParams.get("q") ?? url.searchParams.get("search") ?? undefined
    const statusParam = url.searchParams.getAll("status")
    const status = statusParam.length > 0 ? (statusParam as FlightOrderStatus[]) : undefined
    const limit = limitParam
      ? Math.max(1, Math.min(100, Number.parseInt(limitParam, 10)))
      : undefined
    const paymentStatusParam = url.searchParams.getAll("paymentStatus")
    const paymentStatusFilter = paymentStatusParam.length > 0 ? new Set(paymentStatusParam) : null
    try {
      const response = await adapter.listOrders(buildContext(c), {
        ...(limit !== undefined ? { limit } : {}),
        ...(cursor !== undefined ? { cursor } : {}),
        ...(search !== undefined ? { search } : {}),
        ...(status !== undefined ? { status } : {}),
      })

      if (payment) {
        const sessionByOrderId = await payment.fetchOrderSessions(
          c,
          response.orders.map((o) => o.orderId),
        )
        response.orders = response.orders.map((order) =>
          attachPaymentSession(order, sessionByOrderId.get(order.orderId) ?? null),
        )
      }

      if (paymentStatusFilter) {
        response.orders = response.orders.filter((o) =>
          paymentStatusFilter.has((o.providerData?.paymentStatus as string | undefined) ?? "none"),
        )
      }
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Get order ───────────────────────────────────────────────────────────
  hono.get("/orders/:orderId", async (c) => {
    const orderId = c.req.param("orderId")
    if (!orderId) return c.json({ error: "orderId is required" }, 400)
    try {
      const response = await resolveAdapter(c).getOrder(buildContext(c), orderId)
      if (response.order && payment) {
        const sessionByOrderId = await payment.fetchOrderSessions(c, [response.order.orderId])
        const summary = sessionByOrderId.get(response.order.orderId) ?? null
        response.order = attachPaymentSession(response.order, summary)
      }
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Issue tickets ─────────────────────────────────────────────────────────
  // Promote a held order to ticketed. Capability-gated: connectors that don't
  // support holds omit `ticketOrder` and this returns 501.
  hono.post("/orders/:orderId/ticket", async (c) => {
    const orderId = c.req.param("orderId")
    if (!orderId) return c.json({ error: "orderId is required" }, 400)
    const adapter = resolveAdapter(c)
    if (!adapter.ticketOrder) {
      return c.json({ error: "Adapter does not support ticketing" }, 501)
    }
    try {
      const response = await adapter.ticketOrder(buildContext(c), orderId)
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Cancel order ────────────────────────────────────────────────────────
  hono.post("/orders/:orderId/cancel", async (c) => {
    const orderId = c.req.param("orderId")
    if (!orderId) return c.json({ error: "orderId is required" }, 400)
    let body: { reason?: FlightCancelReason } = {}
    try {
      body = await c.req.json<{ reason?: FlightCancelReason }>()
    } catch {
      // Body is optional for cancel.
    }
    try {
      const response = await resolveAdapter(c).cancelOrder(buildContext(c), orderId, body.reason)
      return c.json(response)
    } catch (err) {
      const { message, status } = adapterErrorDetails(err)
      return c.json({ error: message }, status)
    }
  })

  // ── Reference: airports (with substring search) ───────────────────────────
  hono.get("/reference/airports", async (c) => {
    const db = getDb(c)
    const q = c.req.query("q")?.trim()
    const limit = Math.min(Number(c.req.query("limit") ?? 50), 200)
    let rows: Array<typeof referenceAirports.$inferSelect>
    if (q) {
      const pattern = `%${q}%`
      rows = await db
        .select()
        .from(referenceAirports)
        .where(
          or(
            ilike(referenceAirports.iataCode, pattern),
            ilike(referenceAirports.city, pattern),
            ilike(referenceAirports.name, pattern),
          ),
        )
        .limit(limit)
    } else {
      rows = await db.select().from(referenceAirports).limit(limit)
    }
    return c.json({ data: rows })
  })

  // ── Reference: airlines (full list) ───────────────────────────────────────
  hono.get("/reference/airlines", async (c) => {
    const rows = await getDb(c).select().from(referenceAirlines)
    return c.json({ data: rows })
  })

  // ── Reference: aircraft (full list) ────────────────────────────────────────
  hono.get("/reference/aircraft", async (c) => {
    const rows = await getDb(c).select().from(referenceAircraft)
    return c.json({ data: rows })
  })

  for (const [method, path, summary] of FLIGHT_OPENAPI_OPERATIONS) {
    hono.openAPIRegistry.registerPath({
      method,
      path,
      summary,
      responses: { 200: { description: "Successful response." } },
      "x-voyant-api-id": FLIGHTS_OPENAPI_API_ID,
    })
  }

  return hono
}

/**
 * The flights route module — mounts the admin routes at `/v1/admin/flights`.
 * A deployment composes this and supplies the connector + payment options.
 */
export function createFlightsApiModule(options: FlightsApiModuleOptions): ApiModule {
  return {
    module: { name: "flights" },
    adminRoutes: createFlightAdminRoutes(options),
  }
}

/** Package-owned adapter from graph runtime ports to the Flights route factory. */
export const createFlightsVoyantRuntime = defineGraphRuntimeFactory(async ({ getPort }) => {
  const runtime = await getPort(flightsRuntimePort)
  return createFlightsApiModule({
    resolveAdapter: runtime.resolveAdapter,
    payment: createFlightOrderPaymentIntegration({
      orderPaymentSessions: createOrderPaymentSessions({ targetType: "flight_order" }),
      startCardPayment: runtime.startCardPayment,
    }),
  })
})

export type {
  AdmittedFlightShoppingSource,
  FlightPublicApiShoppingContext,
  FlightsRuntime,
} from "./runtime-port.js"
export { flightsRuntimePort } from "./runtime-port.js"
