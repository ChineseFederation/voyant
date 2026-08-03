// agent-quality: file-size exception -- owner: catalog-demo-api; existing route module stays co-located until a dedicated split preserves behavior and tests.
/**
 * REST surface for the catalog demo service. Mirrors the methods on
 * `SourceAdapter` (`@voyant-travel/catalog/adapter/contract`) for standalone
 * contract and integration testing.
 *
 *   POST   /discover                   discover (paginated CatalogProjections)
 *   POST   /live-resolve               liveResolve (current price + availability)
 *   POST   /reserve                    reserve (creates a demo order)
 *   POST   /cancel                     cancel (flips order status)
 *   GET    /inventory                  list current inventory rows
 *   POST   /inventory/seed             seed default inventory (idempotent)
 *   GET    /orders/:id                 read a single order — debug surface
 *   GET    /health                     liveness probe
 *
 * The `*` endpoints emit JSON bodies that match the `SourceAdapter`
 * contract's return shapes. Errors come back as `{ "error": message }`
 * with appropriate HTTP statuses.
 */

import { Buffer } from "node:buffer"
import type {
  CatalogProjection,
  DiscoveryPage,
  GetContentRequest,
  GetContentResult,
  LiveResolveRequest,
  LiveResolveResult,
  PushAvailabilityRequest,
  PushAvailabilityResult,
  PushBookingRequest,
  PushBookingResult,
  PushContentRequest,
  PushContentResult,
  ReserveRequest,
  ReserveResult,
} from "@voyant-travel/catalog"
import { Hono } from "hono"

import type { CatalogDemoDb } from "./db.js"
import type { CatalogDemoInventoryRow } from "./schema.js"
import { buildDefaultDemoInventory, seedInventory } from "./seed.js"
import * as store from "./store.js"

interface DiscoverBody {
  cursor?: string
  limit?: number
  entityModules?: string[]
}

interface CancelBody {
  upstream_ref: string
  reason?: string
}

/**
 * In-memory log of pushes received from Voyant. Reset on process
 * restart and via `POST /pushed/clear`. Sufficient for the demo —
 * real channels persist + reconcile.
 */
const pushedBookings: Array<PushBookingRequest & { upstreamRef: string; receivedAt: string }> = []
const pushedAvailability: Array<PushAvailabilityRequest & { receivedAt: string }> = []
const pushedContent: Array<PushContentRequest & { receivedAt: string }> = []

const SOURCE_KIND = "demo"
/**
 * Synthetic supplier identifier the demo upstream stamps on every
 * projection. Doesn't resolve in the operator's own `suppliers` table,
 * so the catalog UI's `formatSupplier` lookup falls through to the raw
 * value — which is the intentional outcome: a fresh deployment sees
 * "Demo Tours" verbatim and operators wiring a real adapter would map
 * the upstream id to a local supplier row.
 */
const DEMO_SUPPLIER_ID = "Demo Tours"

export function buildDemoCatalogProjection(row: CatalogDemoInventoryRow): CatalogProjection {
  const entityId = demoEntityIdForRow(row)
  return {
    entity_module: row.entityModule,
    entity_id: entityId,
    provenance: {
      source_kind: SOURCE_KIND,
      source_freshness: "sync",
      source_ref: row.id,
    },
    fields: buildDemoProjectionFields(row, entityId),
  }
}

function buildDemoProjectionFields(
  row: CatalogDemoInventoryRow,
  entityId: string,
): Record<string, unknown> {
  const metadata = row.metadata ?? {}
  const departures = upcomingOpenDepartures(metadata)
  const nextDeparture = departures[0] ?? null
  const departureDates = uniqueStrings(departures.map((departure) => datePart(departure.starts_at)))
  const departureMonths = uniqueStrings(departureDates.map((date) => date.slice(0, 7)))
  const countryCodes = countryCodesFromMetadata(metadata)
  const priceFromAmountCents = priceFrom(row, departures)
  const mediaUrl = stringOr(metadata.heroImageUrl, null)
  const remainingValues = departures.map((departure) => departure.remaining)
  const availableUnitsTotal =
    remainingValues.length > 0 &&
    remainingValues.every((remaining) => typeof remaining === "number")
      ? remainingValues.reduce((sum, remaining) => sum + (remaining ?? 0), 0)
      : null

  const baseFields: Record<string, unknown> = {
    "source.kind": SOURCE_KIND,
    "source.ref": row.id,
    id: entityId,
    name: row.name,
    description: row.description,
    status: isInventorySellable(row.available, row.metadata) ? "active" : "inactive",
    activated: isInventorySellable(row.available, row.metadata),
    visibility: "public",
    // Demo upstream models its rows as operated by a single brand. A real
    // adapter (TUI direct, Voyant Connect peer) emits the upstream's
    // own supplier identifier; the operator maps it to a local
    // suppliers row at integration time.
    supplierId: DEMO_SUPPLIER_ID,
    sellAmountCents: row.priceCents,
    sellCurrency: row.currency,
    supplyModel: supplyModelFromMetadata(metadata, departures),
    durationDays: numberOr(metadata.durationDays, null),
    countryCodes,
    departureCity: stringOr(metadata.departureCity, null),
    priceFromAmountCents,
    priceFromCurrency: priceFromAmountCents == null ? null : row.currency,
    hasPricing: priceFromAmountCents != null,
    primaryMediaUrl: mediaUrl,
    thumbnailUrl: mediaUrl,
    coverMediaUrl: mediaUrl,
    nextDepartureAt: nextDeparture?.starts_at ?? null,
    nextDepartureDate: nextDeparture ? datePart(nextDeparture.starts_at) : null,
    nextDepartureEndsAt: nextDeparture?.ends_at ?? null,
    nextDepartureEndDate: nextDeparture?.ends_at ? datePart(nextDeparture.ends_at) : null,
    // The demo upstream publishes departures as UTC instants and derives its
    // calendar dates from them, so UTC is the frame its bare dates are in.
    // Stating it keeps the demo document readable the same way a real one is
    // (#4116) rather than leaving consumers to assume.
    departureTimezone: "UTC",
    hasUpcomingDeparture: departures.length > 0,
    upcomingDepartureCount: departures.length,
    availableDeparturesCount: departures.length,
    departureDates,
    departureMonths,
    availableUnitsTotal,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }

  if (row.entityModule === "cruises") {
    return {
      ...baseFields,
      cruiseLine: stringOr(metadata.cruiseLine, DEMO_SUPPLIER_ID),
      shipName: stringOr(metadata.shipName, null),
      durationNights: durationNightsFromMetadata(metadata),
      embarkationPort: stringOr(metadata.embarkationPort, stringOr(metadata.departureCity, null)),
      disembarkationPort: stringOr(metadata.disembarkationPort, null),
    }
  }

  if (row.entityModule === "accommodations") {
    return {
      ...baseFields,
      hotelName: row.name,
      brand: stringOr(metadata.brand, DEMO_SUPPLIER_ID),
      starRating: numberOr(metadata.starRating, null),
      city: stringOr(metadata.city, stringOr(metadata.departureCity, null)),
      country: stringOr(metadata.country, null),
      roomTypeName: stringOr(metadata.roomTypeName, "Standard room"),
    }
  }

  return baseFields
}

export function createRoutes(db: CatalogDemoDb): Hono {
  const app = new Hono()

  app.get("/health", (c) => c.json({ ok: true, service: "catalog-demo-api" }))

  // ── Discover ──────────────────────────────────────────────────────────
  app.post("/discover", async (c) => {
    let body: DiscoverBody
    try {
      body = await c.req.json<DiscoverBody>()
    } catch {
      body = {}
    }
    const result = await store.listInventory(db, {
      cursor: body.cursor,
      limit: body.limit,
      entityModules: body.entityModules,
    })
    const projections: CatalogProjection[] = result.rows.map(buildDemoCatalogProjection)
    const page: DiscoveryPage = {
      projections,
      next_cursor: result.nextCursor,
    }
    return c.json(page)
  })

  // ── Live resolve ──────────────────────────────────────────────────────
  app.post("/live-resolve", async (c) => {
    let body: LiveResolveRequest
    try {
      body = await c.req.json<LiveResolveRequest>()
    } catch {
      return c.json({ error: "invalid json body" }, 400)
    }
    if (!Array.isArray(body?.ids)) {
      return c.json({ error: "ids array is required" }, 400)
    }

    const sourceRefsByEntityId = new Map(
      body.ids.map((entityId) => [entityId, demoSourceRefFromEntityId(entityId)]),
    )
    const inventory = await store.getInventoryByIds(db, [...new Set(sourceRefsByEntityId.values())])
    const requestedDepartureId = readDepartureId(body.parameters)
    const billablePax = readBillablePax(body.parameters)
    const values: Record<string, Record<string, unknown>> = {}
    const failed: LiveResolveResult["failed"] = {}
    for (const id of body.ids) {
      const sourceRef = sourceRefsByEntityId.get(id) ?? id
      const row = inventory.get(sourceRef)
      if (!row) {
        failed[id] = "not_found"
        continue
      }
      let departure: ReturnType<typeof findDeparture> = null
      if (requestedDepartureId) {
        departure = findDeparture(row.metadata, requestedDepartureId)
        if (!departure) {
          // Slot wasn't found in the upstream's current schedule — probably
          // expired or rotated out. Keep it distinct from a missing product
          // so callers can ask the customer to re-pick a departure.
          failed[id] = "departure_not_found"
          continue
        }
        if (isClosedDeparture(departure)) {
          failed[id] = "departure_unavailable"
          continue
        }
        if (typeof departure.remaining === "number" && departure.remaining < billablePax) {
          failed[id] = "departure_unavailable"
          continue
        }
      } else if (!isInventorySellable(row.available, row.metadata)) {
        failed[id] = "unavailable"
        continue
      }
      const perPaxPrice = departure?.lowest_price_cents ?? row.priceCents
      const slotCurrency = departure?.currency ?? row.currency
      // Demo products are guided tours — priced per billable pax
      // (adults + children, infants free). Per-stay verticals would
      // not multiply here; that's a real adapter concern, not a demo
      // contract.
      const totalPrice = perPaxPrice * billablePax
      values[id] = {
        available: true,
        priceCents: totalPrice,
        unitPriceCents: perPaxPrice,
        billablePax,
        currency: slotCurrency,
        name: row.name,
        metadata: row.metadata ?? null,
        ...(departure
          ? {
              departure: {
                id: departure.id,
                starts_at: departure.starts_at,
                ends_at: departure.ends_at ?? null,
                priceCents: totalPrice,
                unitPriceCents: perPaxPrice,
                currency: slotCurrency,
              },
            }
          : {}),
      }
    }
    const result: LiveResolveResult =
      Object.keys(failed).length > 0 ? { values, failed } : { values }
    return c.json(result)
  })

  // ── Get content ───────────────────────────────────────────────────────
  // Rich detail endpoint mirrored on the SourceAdapter contract's
  // `getContent` method (sourced-content §3.1). The demo-api stores
  // rich content (highlights, days, options, media, policies) on
  // `inventory.metadata`; this route projects that into a
  // products/v1 ProductContent payload. Real upstream adapters return
  // their own getContent shapes here.
  app.post("/get-content", async (c) => {
    let body: GetContentRequest
    try {
      body = await c.req.json<GetContentRequest>()
    } catch {
      return c.json({ error: "invalid json body" }, 400)
    }
    if (!body?.entity_id) {
      return c.json({ error: "entity_id is required" }, 400)
    }
    const sourceRef = demoSourceRefFromEntityId(body.entity_id)
    const inventory = await store.getInventoryByIds(db, [sourceRef])
    const row = inventory.get(sourceRef)
    if (!row) {
      return c.json({ error: "not_found" }, 404)
    }
    return c.json(buildDemoGetContentResult(row, body))
  })

  // ── Reserve ───────────────────────────────────────────────────────────
  app.post("/reserve", async (c) => {
    let body: ReserveRequest
    try {
      body = await c.req.json<ReserveRequest>()
    } catch {
      return c.json({ error: "invalid json body" }, 400)
    }
    if (!body?.entity_id) {
      return c.json({ error: "entity_id is required" }, 400)
    }

    const sourceRef = demoSourceRefFromEntityId(body.entity_id)
    const inventory = await store.getInventoryByIds(db, [sourceRef])
    const row = inventory.get(sourceRef)
    if (!row) {
      const result: ReserveResult = {
        upstream_ref: "",
        status: "failed",
        upstream_payload: { reason: "inventory_unavailable", entityId: body.entity_id },
      }
      return c.json(result)
    }

    const requestedDepartureId = readDepartureId(body.parameters)
    let departure: ReturnType<typeof findDeparture> = null
    const billablePax = readBillablePax(body.parameters)
    if (requestedDepartureId) {
      departure = findDeparture(row.metadata, requestedDepartureId)
      if (!departure) {
        const result: ReserveResult = {
          upstream_ref: "",
          status: "failed",
          upstream_payload: { reason: "departure_not_found", departureId: requestedDepartureId },
        }
        return c.json(result)
      }
      if (isClosedDeparture(departure)) {
        const result: ReserveResult = {
          upstream_ref: "",
          status: "failed",
          upstream_payload: { reason: "departure_unavailable", departureId: requestedDepartureId },
        }
        return c.json(result)
      }
      if (typeof departure.remaining === "number" && departure.remaining < billablePax) {
        const result: ReserveResult = {
          upstream_ref: "",
          status: "failed",
          upstream_payload: {
            reason: "departure_unavailable",
            departureId: requestedDepartureId,
            remaining: departure.remaining,
            needed: billablePax,
          },
        }
        return c.json(result)
      }
    } else if (!isInventorySellable(row.available, row.metadata)) {
      const result: ReserveResult = {
        upstream_ref: "",
        status: "failed",
        upstream_payload: { reason: "inventory_unavailable", entityId: body.entity_id },
      }
      return c.json(result)
    }

    const intentType = readIntentType(body.payment_intent)
    const orderStatus = intentType === "hold" ? "held" : "confirmed"
    const slotPrice = departure?.lowest_price_cents ?? row.priceCents
    const slotCurrency = departure?.currency ?? row.currency

    const order = await store.createOrder(db, {
      inventoryId: row.id,
      entityId: body.entity_id,
      entityModule: row.entityModule,
      status: orderStatus,
      pricedCents: slotPrice,
      currency: slotCurrency,
      party: body.party ?? null,
      paymentIntent: body.payment_intent ?? null,
      parameters: body.parameters ?? null,
    })
    if (requestedDepartureId) {
      await store.adjustDepartureRemaining(db, row.id, requestedDepartureId, -billablePax)
    } else {
      await store.decrementAvailability(db, row.id)
    }

    const result: ReserveResult = {
      upstream_ref: order.id,
      status: orderStatus === "held" ? "held" : "confirmed",
      upstream_payload: {
        orderId: order.id,
        inventoryId: row.id,
        pricedCents: slotPrice,
        currency: slotCurrency,
        ...(departure
          ? {
              departure: {
                id: departure.id,
                starts_at: departure.starts_at,
                ends_at: departure.ends_at ?? null,
              },
            }
          : {}),
      },
    }
    return c.json(result)
  })

  // ── Cancel ────────────────────────────────────────────────────────────
  app.post("/cancel", async (c) => {
    let body: CancelBody
    try {
      body = await c.req.json<CancelBody>()
    } catch {
      return c.json({ error: "invalid json body" }, 400)
    }
    if (!body?.upstream_ref) {
      return c.json({ error: "upstream_ref is required" }, 400)
    }

    const order = await store.getOrder(db, body.upstream_ref)
    if (!order) {
      return c.json({ status: "refused" })
    }
    if (order.status === "cancelled") {
      return c.json({
        status: "cancelled",
        refund_amount: order.pricedCents,
        refund_currency: order.currency,
      })
    }

    const cancelled = await store.markOrderCancelled(db, order.id, body.reason ?? null)
    if (cancelled?.inventoryId) {
      const departureId = readDepartureId(cancelled.parameters ?? undefined)
      if (departureId) {
        await store.adjustDepartureRemaining(
          db,
          cancelled.inventoryId,
          departureId,
          readBillablePax(cancelled.parameters ?? undefined),
        )
      } else {
        await store.incrementAvailability(db, cancelled.inventoryId)
      }
    }
    return c.json({
      status: "cancelled",
      refund_amount: order.pricedCents,
      refund_currency: order.currency,
    })
  })

  // ── Channel push (outbound from Voyant → demo upstream) ────────────────
  // The demo records each push in-memory so tests/demos can inspect what
  // was sent. Real channels persist + reconcile; the demo keeps just
  // enough state to be testable.

  app.post("/push-booking", async (c) => {
    const request = (await c.req.json()) as PushBookingRequest
    const upstreamRef = `demo-up-${request.idempotencyKey}`
    pushedBookings.push({ ...request, upstreamRef, receivedAt: new Date().toISOString() })
    const result: PushBookingResult = {
      upstreamRef,
      externalReference: `DEMO-${pushedBookings.length}`,
      externalStatus: "confirmed",
      upstreamPayload: { recordedAt: new Date().toISOString() },
    }
    return c.json(result)
  })

  app.post("/push-availability", async (c) => {
    const request = (await c.req.json()) as PushAvailabilityRequest
    pushedAvailability.push({ ...request, receivedAt: new Date().toISOString() })
    const result: PushAvailabilityResult = {
      externalStatus: "ok",
      upstreamPayload: { recordedAt: new Date().toISOString() },
    }
    return c.json(result)
  })

  app.post("/push-content", async (c) => {
    const request = (await c.req.json()) as PushContentRequest
    pushedContent.push({ ...request, receivedAt: new Date().toISOString() })
    const result: PushContentResult = {
      externalStatus: "ok",
      acknowledgedHash: request.contentHash,
    }
    return c.json(result)
  })

  // Debug surfaces — tests/demos read these to assert push history.
  app.get("/pushed-bookings", (c) => c.json({ rows: pushedBookings }))
  app.get("/pushed-availability", (c) => c.json({ rows: pushedAvailability }))
  app.get("/pushed-content", (c) => c.json({ rows: pushedContent }))
  app.post("/pushed/clear", (c) => {
    pushedBookings.length = 0
    pushedAvailability.length = 0
    pushedContent.length = 0
    return c.json({ ok: true })
  })

  // ── Admin / debug surfaces ────────────────────────────────────────────
  app.get("/inventory", async (c) => {
    const url = new URL(c.req.url)
    const cursor = url.searchParams.get("cursor") ?? undefined
    const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10)
    const result = await store.listInventory(db, {
      cursor,
      limit: Number.isFinite(limit) ? limit : 50,
    })
    return c.json({
      rows: result.rows,
      hasMore: result.hasMore,
      ...(result.nextCursor ? { cursor: result.nextCursor } : {}),
    })
  })

  app.post("/inventory/seed", async (c) => {
    const rows = await seedInventory(db, buildDefaultDemoInventory())
    return c.json({ count: rows.length, rows })
  })

  app.get("/orders/:id", async (c) => {
    const order = await store.getOrder(db, c.req.param("id"))
    if (!order) return c.json({ error: "order not found" }, 404)
    return c.json(order)
  })

  return app
}

export function buildDemoGetContentResult(
  row: CatalogDemoInventoryRow,
  request: GetContentRequest,
): GetContentResult {
  const content = buildDemoContent(row)
  return {
    entity_module: row.entityModule,
    entity_id: request.entity_id,
    source_ref: row.id,
    returned_locale: request.locale,
    content: content.payload,
    content_schema_version: content.schemaVersion,
    source_updated_at: row.updatedAt,
  }
}

function buildDemoContent(row: CatalogDemoInventoryRow): {
  payload: unknown
  schemaVersion: string
} {
  if (row.entityModule === "cruises") {
    return { payload: buildCruiseContent(row), schemaVersion: "cruises/v1" }
  }
  if (row.entityModule === "accommodations") {
    return { payload: buildAccommodationContent(row), schemaVersion: "accommodations/v1" }
  }
  return { payload: buildProductContent(row), schemaVersion: "products/v1" }
}

function buildProductContent(row: CatalogDemoInventoryRow): Record<string, unknown> {
  const meta = row.metadata ?? {}
  const heroImageUrl = stringOr(meta.heroImageUrl, null)
  const highlights = stringArrayOr(meta.highlights, [])
  const tags = stringArrayOr(meta.tags, [])
  const days = mapArray(meta.days, (d) => ({
    day_number: numberOr((d as Record<string, unknown>).dayNumber, 1) ?? 1,
    title: stringOr((d as Record<string, unknown>).title, null),
    description: stringOr((d as Record<string, unknown>).description, null),
    location: stringOr((d as Record<string, unknown>).location, null),
    services: [],
  }))
  const options = mapArray(meta.options, (o) => ({
    id: stringOr((o as Record<string, unknown>).id, "opt") ?? "opt",
    name: stringOr((o as Record<string, unknown>).name, "Option") ?? "Option",
    description: stringOr((o as Record<string, unknown>).description, null),
    units: [],
    inclusions: [],
  }))
  const media = buildDemoMedia(meta, heroImageUrl)
  const departures = buildProductDepartures(row)

  return {
    product: {
      id: row.id,
      name: row.name,
      status: isInventorySellable(row.available, row.metadata) ? "active" : "inactive",
      description: row.description ?? null,
      highlights,
      hero_image_url: heroImageUrl,
      duration_days: numberOr(meta.durationDays, null),
      sell_currency: row.currency,
      supplier: DEMO_SUPPLIER_ID,
      country: stringOr(meta.country, null),
      departure_city: stringOr(meta.departureCity, null),
      tags,
    },
    options,
    days,
    media,
    policies: buildPolicies(meta, ["cancellation", "payment", "supplier_notes"]),
    departures,
  }
}

function buildCruiseContent(row: CatalogDemoInventoryRow): Record<string, unknown> {
  const meta = row.metadata ?? {}
  const heroImageUrl = stringOr(meta.heroImageUrl, null)
  const itineraryStops = buildCruiseItineraryStops(meta)
  const durationNights = durationNightsFromMetadata(meta)

  return {
    cruise: {
      id: demoEntityIdForRow(row),
      name: row.name,
      status: isInventorySellable(row.available, row.metadata) ? "active" : "inactive",
      description: row.description ?? null,
      cruise_type: stringOr(meta.cruiseType, null),
      hero_image_url: heroImageUrl,
      highlights: stringArrayOr(meta.highlights, []),
      cruise_line: stringOr(meta.cruiseLine, DEMO_SUPPLIER_ID),
      duration_nights: durationNights,
      embarkation_port: stringOr(meta.embarkationPort, stringOr(meta.departureCity, null)),
      disembarkation_port: stringOr(meta.disembarkationPort, null),
    },
    ship: buildCruiseShip(meta, heroImageUrl),
    sailings: buildCruiseSailings(row, meta, durationNights, itineraryStops),
    cabin_categories: buildCruiseCabinCategories(meta, heroImageUrl),
    itinerary_stops: itineraryStops,
    policies: buildPolicies(meta, ["cancellation", "payment", "supplier_notes", "requirements"]),
  }
}

function buildAccommodationContent(row: CatalogDemoInventoryRow): Record<string, unknown> {
  const meta = row.metadata ?? {}
  const heroImageUrl = stringOr(meta.heroImageUrl, null)
  const roomTypes = buildAccommodationRoomTypes(row, meta, heroImageUrl)

  return {
    hotel: {
      id: row.id,
      name: row.name,
      description: row.description ?? null,
      star_rating: numberOr(meta.starRating, null),
      hero_image_url: heroImageUrl,
      highlights: stringArrayOr(meta.highlights, []),
      brand: stringOr(meta.brand, DEMO_SUPPLIER_ID),
      country: stringOr(meta.country, null),
      city: stringOr(meta.city, stringOr(meta.departureCity, null)),
      address: stringOr(meta.address, null),
      postal_code: stringOr(meta.postalCode, null),
      latitude: numberOr(meta.latitude, null),
      longitude: numberOr(meta.longitude, null),
      check_in_time: stringOr(meta.checkInTime, null),
      check_out_time: stringOr(meta.checkOutTime, null),
    },
    room_types: roomTypes,
    rate_plans: buildAccommodationRatePlans(meta, roomTypes),
    meal_plans: [],
    amenities: buildAccommodationAmenities(meta),
    policies: buildPolicies(meta, [
      "cancellation",
      "payment",
      "supplier_notes",
      "requirements",
      "check_in",
    ]),
  }
}

function readIntentType(intent: ReserveRequest["payment_intent"]): string | undefined {
  if (!intent || typeof intent !== "object") return undefined
  const t = (intent as Record<string, unknown>).type
  return typeof t === "string" ? t : undefined
}

// ─────────────────────────────────────────────────────────────────────────────
// Tiny field-pickers for /get-content. Demo metadata is free-form JSON;
// these guard against the operator hand-editing rows in the demo DB.
// ─────────────────────────────────────────────────────────────────────────────

function stringOr<T>(value: unknown, fallback: T): string | T {
  return typeof value === "string" && value.length > 0 ? value : fallback
}

function numberOr<T>(value: unknown, fallback: T): number | T {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function stringArrayOr(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) return fallback
  const out = value.filter((v): v is string => typeof v === "string")
  return out.length > 0 ? out : fallback
}

function mapArray<T>(value: unknown, project: (item: unknown) => T): T[] {
  if (!Array.isArray(value)) return []
  return value.map(project)
}

function buildDemoMedia(
  metadata: Record<string, unknown>,
  heroImageUrl: string | null,
): Array<Record<string, unknown>> {
  const baseMedia = heroImageUrl
    ? [{ url: heroImageUrl, type: "image" as const, caption: null, alt: null }]
    : []
  const extraMedia = mapArray(metadata.media, (m) => ({
    url: stringOr((m as Record<string, unknown>).url, "") ?? "",
    type: (stringOr((m as Record<string, unknown>).type, "image") ?? "image") as
      | "image"
      | "video"
      | "document",
    caption: stringOr((m as Record<string, unknown>).caption, null),
    alt: stringOr((m as Record<string, unknown>).alt, null),
  })).filter((m) => m.url.length > 0)
  return [...baseMedia, ...extraMedia]
}

function buildProductDepartures(row: CatalogDemoInventoryRow): Array<Record<string, unknown>> {
  return mapArray(row.metadata?.departures, (d) => {
    const dr = d as Record<string, unknown>
    const capacity = numberOr(dr.capacity, row.available)
    const remaining = Math.min(numberOr(dr.remaining, capacity), capacity)
    return {
      id: stringOr(dr.id, "") ?? "",
      starts_at: stringOr(dr.starts_at, "") ?? "",
      ends_at: stringOr(dr.ends_at, null),
      status: stringOr(dr.status, null),
      capacity,
      remaining,
      lowest_price_cents: numberOr(dr.lowest_price_cents, row.priceCents),
      currency: stringOr(dr.currency, row.currency),
      note: stringOr(dr.note, null),
    }
  }).filter((d) => typeof d.id === "string" && d.id.length > 0 && typeof d.starts_at === "string")
}

function buildPolicies(
  metadata: Record<string, unknown>,
  allowedKinds: readonly string[],
): Array<Record<string, unknown>> {
  const policies: Array<Record<string, unknown>> = []
  const sources: Array<{ kind: string; field: string }> = [
    { kind: "cancellation", field: "cancellationPolicy" },
    { kind: "payment", field: "paymentTerms" },
    { kind: "supplier_notes", field: "supplierNotes" },
    { kind: "requirements", field: "requirements" },
    { kind: "check_in", field: "checkInPolicy" },
  ]
  for (const source of sources) {
    if (!allowedKinds.includes(source.kind)) continue
    const body = stringOr(metadata[source.field], null)
    if (body) policies.push({ kind: source.kind, body })
  }
  return policies
}

function buildCruiseShip(
  metadata: Record<string, unknown>,
  heroImageUrl: string | null,
): Record<string, unknown> | null {
  const explicit = metadata.ship && typeof metadata.ship === "object" ? metadata.ship : null
  const ship = (explicit ?? metadata) as Record<string, unknown>
  const name = stringOr(ship.shipName, stringOr(ship.name, null))
  if (!name) return null
  return {
    id: stringOr(ship.id, null),
    name,
    ship_type: stringOr(ship.shipType, null),
    description: stringOr(ship.shipDescription, null),
    deck_plan_url: stringOr(ship.deckPlanUrl, null),
    deck_plans: [],
    capacity: numberOr(ship.capacity, null),
    decks: numberOr(ship.decks, null),
    year_built: numberOr(ship.yearBuilt, null),
    gallery: stringArrayOr(ship.gallery, heroImageUrl ? [heroImageUrl] : []),
  }
}

function buildCruiseSailings(
  row: CatalogDemoInventoryRow,
  metadata: Record<string, unknown>,
  durationNights: number | null,
  itineraryStops: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return mapArray<Record<string, unknown> | null>(metadata.sailings ?? metadata.departures, (d) => {
    const departure = parseDeparture(d)
    if (!departure) return null
    const startDate = datePart(departure.starts_at)
    const endDate = datePart(departure.ends_at ?? departure.starts_at)
    if (!startDate || !endDate) return null
    return {
      id: departure.id || `sailing_${startDate}`,
      source_ref: departure.id || null,
      start_date: startDate,
      end_date: endDate,
      duration_nights: durationNights,
      status: departure.status ?? "open",
      embarkation_port: stringOr(metadata.embarkationPort, stringOr(metadata.departureCity, null)),
      disembarkation_port: stringOr(metadata.disembarkationPort, null),
      itinerary_stops: itineraryStops,
      lowest_price_cents: departure.lowest_price_cents ?? row.priceCents,
      currency: departure.currency ?? row.currency,
    }
  }).filter((sailing): sailing is Record<string, unknown> => sailing != null)
}

function buildCruiseItineraryStops(
  metadata: Record<string, unknown>,
): Array<Record<string, unknown>> {
  const explicitStops = mapArray(metadata.itineraryStops, projectCruiseStop).filter(
    (stop): stop is Record<string, unknown> => stop != null,
  )
  if (explicitStops.length > 0) return explicitStops
  return mapArray(metadata.days, (day) => {
    const row = day as Record<string, unknown>
    return {
      day_number: numberOr(row.dayNumber, 1) ?? 1,
      date: stringOr(row.date, null),
      port_name: stringOr(row.location, stringOr(row.title, "At sea")),
      arrival_time: stringOr(row.arrivalTime, null),
      departure_time: stringOr(row.departureTime, null),
      description: stringOr(row.description, null),
      is_at_sea: typeof row.isAtSea === "boolean" ? row.isAtSea : false,
    }
  })
}

function projectCruiseStop(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  return {
    day_number: numberOr(row.dayNumber ?? row.day_number, 1) ?? 1,
    date: stringOr(row.date, null),
    port_name: stringOr(row.portName ?? row.port_name, "At sea"),
    arrival_time: stringOr(row.arrivalTime ?? row.arrival_time, null),
    departure_time: stringOr(row.departureTime ?? row.departure_time, null),
    description: stringOr(row.description, null),
    is_at_sea: typeof row.isAtSea === "boolean" ? row.isAtSea : row.is_at_sea === true,
  }
}

function buildCruiseCabinCategories(
  metadata: Record<string, unknown>,
  heroImageUrl: string | null,
): Array<Record<string, unknown>> {
  const categories = mapArray<Record<string, unknown> | null>(
    metadata.cabinCategories,
    (category) => {
      const row = category as Record<string, unknown>
      const id = stringOr(row.id, "") ?? ""
      const name = stringOr(row.name, "") ?? ""
      if (!id || !name) return null
      return {
        id,
        code: stringOr(row.code, null),
        name,
        description: stringOr(row.description, null),
        type: stringOr(row.type, null),
        capacity_min: numberOr(row.capacityMin, null),
        capacity_max: numberOr(row.capacityMax, null),
        images: stringArrayOr(row.images, []),
        floorplan_images: stringArrayOr(row.floorplanImages, []),
        square_feet: stringOr(row.squareFeet, null),
        grade_codes: stringArrayOr(row.gradeCodes, []),
        wheelchair_accessible: row.wheelchairAccessible === true,
        inclusions: stringArrayOr(row.inclusions, []),
        feature_codes: [],
        bed_configurations: [],
        accessibility_features: [],
        view_type: null,
      }
    },
  ).filter((category): category is Record<string, unknown> => category != null)

  if (categories.length > 0) return categories
  return [
    {
      id: "cabin_standard",
      code: "STD",
      name: stringOr(metadata.cabinCategoryName, "Standard cabin"),
      description: stringOr(metadata.cabinCategoryDescription, null),
      type: "outside",
      capacity_min: 1,
      capacity_max: 2,
      images: heroImageUrl ? [heroImageUrl] : [],
      floorplan_images: [],
      grade_codes: [],
      wheelchair_accessible: false,
      inclusions: [],
      feature_codes: [],
      bed_configurations: [],
      accessibility_features: [],
      view_type: null,
    },
  ]
}

function buildAccommodationRoomTypes(
  row: CatalogDemoInventoryRow,
  metadata: Record<string, unknown>,
  heroImageUrl: string | null,
): Array<Record<string, unknown>> {
  const roomTypes = mapArray(metadata.roomTypes, (roomType) => {
    const room = roomType as Record<string, unknown>
    const id = stringOr(room.id, "") ?? ""
    const name = stringOr(room.name, "") ?? ""
    if (!id || !name) return null
    return projectAccommodationRoom(room, id, name)
  }).filter((roomType): roomType is Record<string, unknown> => roomType != null)

  if (roomTypes.length > 0) return roomTypes
  return [
    projectAccommodationRoom(
      {
        description: row.description,
        images: heroImageUrl ? [heroImageUrl] : [],
        maxOccupancy: row.available > 0 ? Math.min(row.available, 4) : 2,
      },
      "room_standard",
      stringOr(metadata.roomTypeName, "Standard room"),
    ),
  ]
}

function projectAccommodationRoom(
  room: Record<string, unknown>,
  id: string,
  name: string,
): Record<string, unknown> {
  return {
    id,
    code: stringOr(room.code, null),
    name,
    description: stringOr(room.description, null),
    room_class: stringOr(room.roomClass, null),
    view: stringOr(room.view, null),
    bedrooms: numberOr(room.bedrooms, null),
    beds: stringArrayOr(room.beds, []),
    size_sqm: numberOr(room.sizeSqm, null),
    max_adults: numberOr(room.maxAdults, null),
    max_children: numberOr(room.maxChildren, null),
    max_occupancy: numberOr(room.maxOccupancy, null),
    amenities: stringArrayOr(room.amenities, []),
    images: stringArrayOr(room.images, []),
  }
}

function buildAccommodationRatePlans(
  metadata: Record<string, unknown>,
  roomTypes: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  const ratePlans = mapArray<Record<string, unknown> | null>(metadata.ratePlans, (ratePlan) => {
    const plan = ratePlan as Record<string, unknown>
    const id = stringOr(plan.id, "") ?? ""
    const name = stringOr(plan.name, "") ?? ""
    if (!id || !name) return null
    return {
      id,
      code: stringOr(plan.code, null),
      name,
      description: stringOr(plan.description, null),
      charge_frequency:
        plan.chargeFrequency === "per_stay" || plan.chargeFrequency === "per_night"
          ? plan.chargeFrequency
          : "per_night",
      applies_to_room_type_ids: stringArrayOr(plan.appliesToRoomTypeIds, []),
      cancellation_policy: stringOr(
        plan.cancellationPolicy,
        stringOr(metadata.cancellationPolicy, null),
      ),
      inclusions: stringArrayOr(plan.inclusions, []),
    }
  }).filter((ratePlan): ratePlan is Record<string, unknown> => ratePlan != null)

  if (ratePlans.length > 0) return ratePlans
  return [
    {
      id: "rate_flexible",
      code: "FLEX",
      name: "Flexible rate",
      charge_frequency: "per_night",
      applies_to_room_type_ids: roomTypes
        .map((roomType) => roomType.id)
        .filter((id): id is string => typeof id === "string"),
      cancellation_policy: stringOr(metadata.cancellationPolicy, null),
      inclusions: [],
    },
  ]
}

function buildAccommodationAmenities(
  metadata: Record<string, unknown>,
): Array<Record<string, unknown>> {
  return mapArray<Record<string, unknown> | null>(metadata.amenities, (amenity) => {
    if (typeof amenity === "string") {
      return {
        id: amenity.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
        name: amenity,
      }
    }
    const row = amenity as Record<string, unknown>
    const name = stringOr(row.name, "") ?? ""
    if (!name) return null
    return {
      id: stringOr(row.id, name.toLowerCase().replace(/[^a-z0-9]+/g, "_")),
      category: stringOr(row.category, null),
      name,
      description: stringOr(row.description, null),
      is_free: typeof row.isFree === "boolean" ? row.isFree : undefined,
    }
  }).filter((amenity): amenity is Record<string, unknown> => amenity != null)
}

function uniqueStrings(values: Array<string | null>): string[] {
  return [...new Set(values.filter((value): value is string => typeof value === "string"))]
}

function datePart(value: string): string | null {
  return /^\d{4}-\d{2}-\d{2}/.test(value) ? value.slice(0, 10) : null
}

function demoEntityIdForRow(row: CatalogDemoInventoryRow): string {
  if (row.entityModule !== "cruises") return row.id
  return `crus_${encodeDemoSourceRef(row.id)}`
}

function demoSourceRefFromEntityId(entityId: string): string {
  if (!entityId.startsWith("crus_")) return entityId
  const decoded = decodeDemoSourceRef(entityId.slice("crus_".length))
  return decoded ?? entityId
}

function encodeDemoSourceRef(externalId: string): string {
  const sourceRef = JSON.stringify({ externalId })
  return `sr_${Buffer.from(sourceRef, "utf8").toString("base64url")}`
}

function decodeDemoSourceRef(value: string): string | null {
  if (!value.startsWith("sr_")) return null
  try {
    const decoded = JSON.parse(Buffer.from(value.slice("sr_".length), "base64url").toString("utf8"))
    return decoded && typeof decoded.externalId === "string" ? decoded.externalId : null
  } catch {
    return null
  }
}

function countryCodesFromMetadata(metadata: Record<string, unknown>): string[] {
  const explicit = stringArrayOr(metadata.countryCodes, [])
  if (explicit.length > 0) return explicit.map((code) => code.toUpperCase())
  const country = stringOr(metadata.country, null)
  return country ? [country.toUpperCase()] : []
}

function supplyModelFromMetadata(
  metadata: Record<string, unknown>,
  departures: readonly DemoDeparture[],
): "dynamic" | "scheduled" {
  const explicit = stringOr(metadata.supplyModel, null)
  if (explicit === "dynamic" || explicit === "scheduled") return explicit
  return departures.length > 0 ? "scheduled" : "dynamic"
}

function durationNightsFromMetadata(metadata: Record<string, unknown>): number | null {
  const explicit = numberOr(metadata.durationNights, null)
  if (explicit != null) return explicit
  const durationDays = numberOr(metadata.durationDays, null)
  return durationDays == null ? null : Math.max(durationDays - 1, 0)
}

function priceFrom(
  row: CatalogDemoInventoryRow,
  departures: readonly DemoDeparture[],
): number | null {
  const departurePrices = departures
    .map((departure) => departure.lowest_price_cents)
    .filter((value): value is number => typeof value === "number" && value > 0)
  if (departurePrices.length > 0) return Math.min(...departurePrices)
  return row.priceCents > 0 ? row.priceCents : null
}

function upcomingOpenDepartures(metadata: Record<string, unknown>): DemoDeparture[] {
  const now = Date.now()
  return mapArray(metadata.departures, parseDeparture)
    .filter((departure): departure is DemoDeparture => departure != null)
    .filter((departure) => {
      if (isClosedDeparture(departure)) return false
      if (!departure.starts_at) return false
      const startsAt = Date.parse(departure.starts_at)
      if (!Number.isFinite(startsAt) || startsAt < now) return false
      return departure.remaining == null || departure.remaining > 0
    })
    .sort((a, b) => Date.parse(a.starts_at) - Date.parse(b.starts_at))
}

function parseDeparture(value: unknown): DemoDeparture | null {
  if (!value || typeof value !== "object") return null
  const row = value as Record<string, unknown>
  const startsAt = stringOr(row.starts_at, "")
  if (!startsAt) return null
  return {
    id: stringOr(row.id, ""),
    starts_at: startsAt,
    ends_at: stringOr(row.ends_at, null),
    status: stringOr(row.status, null),
    lowest_price_cents: numberOr(row.lowest_price_cents, undefined),
    currency: stringOr(row.currency, undefined),
    capacity: numberOr(row.capacity, undefined),
    remaining: numberOr(row.remaining, undefined),
  }
}

function readDepartureId(parameters: Record<string, unknown> | undefined): string | null {
  const raw = parameters?.departure_id
  return typeof raw === "string" && raw.length > 0 ? raw : null
}

/**
 * Pull the billable-pax count off the draft the catalog plane forwards
 * to the adapter. Demo products price per adult + child (infants ride
 * free, in keeping with most guided-tour pricing). Defaults to 1 when
 * no draft is in flight (e.g. cache-warming probes).
 */
function readBillablePax(parameters: Record<string, unknown> | undefined): number {
  const draft = parameters?.draft as { configure?: { pax?: Record<string, unknown> } } | undefined
  const pax = draft?.configure?.pax
  if (!pax || typeof pax !== "object") return 1
  const adult = numberOr((pax as Record<string, unknown>).adult, 0) ?? 0
  const child = numberOr((pax as Record<string, unknown>).child, 0) ?? 0
  const total = adult + child
  return total > 0 ? total : 1
}

interface DemoDeparture {
  id: string
  starts_at: string
  ends_at?: string | null
  status?: string | null
  lowest_price_cents?: number
  currency?: string
  capacity?: number
  remaining?: number
}

function isInventorySellable(
  available: number,
  metadata: Record<string, unknown> | null | undefined,
): boolean {
  if (available > 0) return true
  return hasSellableDeparture(metadata)
}

function hasSellableDeparture(metadata: Record<string, unknown> | null | undefined): boolean {
  const list = metadata && Array.isArray(metadata.departures) ? metadata.departures : []
  for (const departure of list) {
    if (!departure || typeof departure !== "object") continue
    const row = departure as Record<string, unknown>
    const parsed: DemoDeparture = {
      id: typeof row.id === "string" ? row.id : "",
      starts_at: typeof row.starts_at === "string" ? row.starts_at : "",
      status: typeof row.status === "string" ? row.status : null,
      remaining: typeof row.remaining === "number" ? row.remaining : undefined,
    }
    if (!isClosedDeparture(parsed) && (parsed.remaining == null || parsed.remaining > 0)) {
      return true
    }
  }
  return false
}

function isClosedDeparture(departure: DemoDeparture): boolean {
  return (
    departure.status === "sold_out" ||
    departure.status === "closed" ||
    departure.status === "cancelled"
  )
}

function findDeparture(
  metadata: Record<string, unknown> | null | undefined,
  departureId: string,
): DemoDeparture | null {
  const list = metadata && Array.isArray(metadata.departures) ? metadata.departures : []
  for (const d of list) {
    if (d && typeof d === "object" && (d as Record<string, unknown>).id === departureId) {
      const r = d as Record<string, unknown>
      return {
        id: departureId,
        starts_at: typeof r.starts_at === "string" ? r.starts_at : "",
        ends_at: typeof r.ends_at === "string" ? r.ends_at : null,
        status: typeof r.status === "string" ? r.status : null,
        lowest_price_cents:
          typeof r.lowest_price_cents === "number" ? r.lowest_price_cents : undefined,
        currency: typeof r.currency === "string" ? r.currency : undefined,
        capacity: typeof r.capacity === "number" ? r.capacity : undefined,
        remaining: typeof r.remaining === "number" ? r.remaining : undefined,
      }
    }
  }
  return null
}
