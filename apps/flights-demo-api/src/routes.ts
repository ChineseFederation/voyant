/**
 * REST surface for the demo flight service. Mirrors the methods on
 * `FlightConnectorAdapter` so local project customizations can use it as an
 * integration source. Each endpoint maps 1:1 to an adapter call.
 *
 *   POST   /search                       searchFlights
 *   POST   /fare-calendar                searchFareCalendar
 *   GET    /served-markets                listServedMarkets
 *   POST   /price                        priceOffer
 *   POST   /book                         bookFlight
 *   GET    /orders                       listOrders
 *   GET    /orders/:orderId              getOrder
 *   POST   /orders/:orderId/ticket       ticketOrder
 *   POST   /orders/:orderId/cancel       cancelOrder
 *   POST   /ancillaries                  getAncillaries
 *   POST   /seatmap                      getSeatMap
 *   POST   /seat-selection               selectSeats
 */

import type {
  AncillaryRequest,
  FareCalendarRequest,
  FlightBookRequest,
  FlightOrder,
  FlightOrderStatus,
  FlightSearchRequest,
  SeatMapRequest,
  SeatSelectionRequest,
} from "@voyant-travel/flights/contract/types"
import { Hono } from "hono"

import type { DemoFlightsDb } from "./db.js"
import * as store from "./store.js"
import {
  applySearchFilters,
  findSegmentInOffer,
  parsePageCursor,
  synthesizeAncillaryCatalog,
  synthesizeFareCalendar,
  synthesizeOffers,
  synthesizeOrder,
  synthesizeSeatMap,
  ticketHeldOrder,
} from "./synthesis.js"
import { demoServedMarkets } from "./synthesis-common.js"

interface PriceRequest {
  offerId: string
  offer?: import("@voyant-travel/flights/contract/types").FlightOffer
}

const DEFAULT_PAGE_SIZE = 20

export function createRoutes(db: DemoFlightsDb): Hono {
  const app = new Hono()

  app.get("/health", (c) => c.json({ ok: true, service: "flights-demo-api" }))

  // ── Search ────────────────────────────────────────────────────────────
  app.post("/search", async (c) => {
    const body = await c.req.json<FlightSearchRequest>()
    const pool = synthesizeOffers(body)
    const filtered = applySearchFilters(pool, body)
    const limit = body.pagination?.limit ?? DEFAULT_PAGE_SIZE
    const page = parsePageCursor(body.pagination?.cursor)
    const start = (page - 1) * limit
    const slice = filtered.slice(start, start + limit)
    const hasMore = start + limit < filtered.length
    return c.json({
      offers: slice,
      pagination: {
        total: filtered.length,
        hasMore,
        ...(hasMore ? { cursor: String(page + 1) } : {}),
      },
    })
  })

  // ── Served markets ────────────────────────────────────────────────────
  app.get("/served-markets", (c) => c.json(demoServedMarkets()))

  // ── Fare calendar ─────────────────────────────────────────────────────
  app.post("/fare-calendar", async (c) => {
    const body = await c.req.json<FareCalendarRequest>()
    if (!body.origin || !body.destination) {
      return c.json({ error: "origin and destination are required" }, 400)
    }
    if (!body.from || !body.to) {
      return c.json({ error: "from and to are required" }, 400)
    }
    return c.json(synthesizeFareCalendar(body))
  })

  // ── Price ─────────────────────────────────────────────────────────────
  app.post("/price", async (c) => {
    const body = await c.req.json<PriceRequest>()
    if (!body.offer) {
      return c.json({ error: "offer payload is required for /price" }, 400)
    }
    return c.json({ offer: body.offer, valid: true })
  })

  // ── Book ──────────────────────────────────────────────────────────────
  app.post("/book", async (c) => {
    const body = await c.req.json<FlightBookRequest>()
    if (!body.offer) {
      return c.json({ error: "offer payload is required for /book" }, 400)
    }
    const order = synthesizeOrder(body)
    await store.insertOrder(db, order, body)
    return c.json({ order })
  })

  // ── List orders ───────────────────────────────────────────────────────
  app.get("/orders", async (c) => {
    const url = new URL(c.req.url)
    const limitParam = url.searchParams.get("limit")
    const cursor = url.searchParams.get("cursor") ?? undefined
    const search = url.searchParams.get("q") ?? url.searchParams.get("search") ?? undefined
    const statusParam = url.searchParams.getAll("status")
    const status = statusParam.length > 0 ? (statusParam as FlightOrderStatus[]) : undefined
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined
    const result = await store.listOrders(db, {
      ...(limit !== undefined ? { limit } : {}),
      ...(cursor !== undefined ? { cursor } : {}),
      ...(search !== undefined ? { search } : {}),
      ...(status !== undefined ? { status } : {}),
    })
    return c.json({
      orders: result.orders,
      pagination: {
        total: result.total,
        hasMore: result.hasMore,
        ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
      },
    })
  })

  // ── Get order ─────────────────────────────────────────────────────────
  app.get("/orders/:orderId", async (c) => {
    const order = await store.getOrder(db, c.req.param("orderId"))
    if (!order) return c.json({ error: "Order not found" }, 404)
    return c.json({ order })
  })

  // ── Issue tickets ─────────────────────────────────────────────────────
  // Promote a held (`confirmed`) order to `ticketed`. Idempotent for orders
  // that are already ticketed; refuses cancelled orders.
  app.post("/orders/:orderId/ticket", async (c) => {
    const orderId = c.req.param("orderId")
    const existing = await store.getOrder(db, orderId)
    if (!existing) return c.json({ error: "Order not found" }, 404)
    if (existing.status === "ticketed") {
      return c.json({ order: existing })
    }
    if (existing.status !== "confirmed") {
      return c.json({ error: `Cannot ticket an order with status ${existing.status}` }, 409)
    }
    const ticketed = ticketHeldOrder(existing)
    await store.updateOrder(db, orderId, ticketed)
    return c.json({ order: ticketed })
  })

  // ── Cancel order ──────────────────────────────────────────────────────
  app.post("/orders/:orderId/cancel", async (c) => {
    const orderId = c.req.param("orderId")
    const existing = await store.getOrder(db, orderId)
    if (!existing) return c.json({ error: "Order not found" }, 404)
    const cancelled: FlightOrder = {
      ...existing,
      status: "cancelled" satisfies FlightOrderStatus,
      updatedAt: new Date().toISOString(),
    }
    await store.updateOrder(db, orderId, cancelled)
    return c.json({ order: cancelled, refundedAmount: existing.totalPrice })
  })

  // ── Ancillaries ───────────────────────────────────────────────────────
  app.post("/ancillaries", async (c) => {
    const body = await c.req.json<AncillaryRequest>()
    if (!body.offer) {
      return c.json({ error: "offer payload is required for /ancillaries" }, 400)
    }
    return c.json({
      catalog: synthesizeAncillaryCatalog(body.offer),
      validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
  })

  // ── Seat map ──────────────────────────────────────────────────────────
  app.post("/seatmap", async (c) => {
    const body = await c.req.json<SeatMapRequest>()
    if (!body.offer) {
      return c.json({ error: "offer payload is required for /seatmap" }, 400)
    }
    const segment = findSegmentInOffer(body.offer, body.segmentId)
    if (!segment) {
      return c.json({ error: `Segment ${body.segmentId} not found on offer ${body.offerId}` }, 404)
    }
    return c.json({
      seatMap: synthesizeSeatMap(segment),
      validUntil: new Date(Date.now() + 30 * 60_000).toISOString(),
    })
  })

  // ── Seat selection ───────────────────────────────────────────────────
  app.post("/seat-selection", async (c) => {
    const body = await c.req.json<SeatSelectionRequest>()
    const existing = await store.getOrder(db, body.orderId)
    if (!existing) return c.json({ error: "Order not found" }, 404)

    const passengerIds = new Set(existing.passengers.map((passenger) => passenger.passengerId))
    const segmentIds = new Set(
      existing.offer.itineraries.flatMap((itinerary) =>
        itinerary.segments.map((segment) => segment.segmentId),
      ),
    )
    const invalidSelection = body.selections.find(
      (selection) =>
        !passengerIds.has(selection.passengerId) || !segmentIds.has(selection.segmentId),
    )
    if (invalidSelection) {
      return c.json(
        {
          error: `Invalid seat selection for passenger ${invalidSelection.passengerId} on segment ${invalidSelection.segmentId}`,
        },
        400,
      )
    }

    const additionalAmount = totalSelectionPrice(body.selections)
    const updated: FlightOrder = {
      ...existing,
      providerData: {
        ...(existing.providerData ?? {}),
        seatSelections: body.selections,
      },
      updatedAt: new Date().toISOString(),
    }
    await store.updateOrder(db, body.orderId, updated)
    return c.json({
      order: updated,
      selections: body.selections,
      ...(additionalAmount ? { additionalAmount } : {}),
    })
  })

  return app
}

function totalSelectionPrice(
  selections: SeatSelectionRequest["selections"],
): { amount: string; currency: string } | null {
  let currency: string | null = null
  let amount = 0
  for (const selection of selections) {
    if (!selection.price) continue
    if (currency && selection.price.currency !== currency) return null
    currency = selection.price.currency
    amount += Number.parseFloat(selection.price.amount)
  }
  return currency ? { amount: amount.toFixed(2), currency } : null
}
