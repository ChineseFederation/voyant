import { type OpenAPIHono, z } from "@hono/zod-openapi"
import { listResponseSchema } from "@voyant-travel/types"

import { parseUnifiedKey } from "./lib/key.js"
import {
  passengerCompositionMatches,
  passengerCountFromComposition,
  quotePayloadSchema,
  sourceRefFromPayload,
  sourceRefMatches,
} from "./routes-booking-payloads.js"
import type { CruiseRoutesEnv as Env } from "./routes-env.js"
import { adapterNotRegistered, invalidKey, resolveExternal } from "./routes-keying.js"
import { createCruisesAdminRoute as createRoute } from "./routes-openapi.js"
import {
  cruisePriceRowSchema,
  cruiseSailingDayRowSchema,
  cruiseSailingRowSchema,
  dataEnvelope,
  errorResponseSchema,
} from "./routes-openapi-schemas.js"
import { cruisesService } from "./service.js"
import { pricingService } from "./service-pricing.js"
import {
  insertSailingSchema,
  sailingListQuerySchema,
  updateSailingSchema,
} from "./validation-core.js"
import { replaceSailingDaysSchema } from "./validation-itinerary.js"
import {
  insertPriceComponentSchema,
  insertPriceSchema,
  priceListQuerySchema,
  updatePriceSchema,
} from "./validation-pricing.js"

const keyParamSchema = z.object({ key: z.string() })
const arrayEnvelope = <T extends z.ZodTypeAny>(item: T) => z.object({ data: z.array(item) })
const jsonContent = <T extends z.ZodTypeAny>(description: string, schema: T) => ({
  description,
  content: { "application/json": { schema } },
})

/**
 * Per-sailing detail dispatches to a local DB aggregate (with optional pricing /
 * itinerary includes) or to the adapter's `fetchSailing` enrichment; the two
 * payload shapes differ, so `data` is documented as an opaque pass-through
 * (bounded effort per voyant#2114).
 */
const sailingDetailDataSchema = z.object({ data: z.unknown() })

/**
 * Pricing-for-sailing envelope. Local reads return the canonical
 * `{ data, total, limit, offset }` window; external reads return `{ data }`
 * (the adapter's price list), so pagination fields are optional and the items
 * are heterogeneous (local price rows vs adapter price shapes).
 */
const pricingForSailingSchema = z.object({
  data: z.array(z.unknown()),
  total: z.number().int().optional(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
})

/** Itinerary days for a sailing: effective merged local days, or adapter days. */
const itineraryForSailingSchema = z.object({ data: z.array(z.unknown()) })

/** Composed quote payload (assembled across pricing/booking services). */
const quoteResultSchema = z.object({ data: z.unknown() })

/** Booking result payload (composed across bookings/identity services). */

const replaceSailingPricingBodySchema = z.object({
  prices: z.array(
    insertPriceSchema.extend({
      components: z.array(insertPriceComponentSchema.omit({ priceId: true })).optional(),
    }),
  ),
})

// --- sailings -------------------------------------------------------------

const listSailingsRoute = createRoute({
  method: "get",
  path: "/sailings",
  request: { query: sailingListQuerySchema },
  responses: {
    200: jsonContent(
      "Paginated list of cruise sailings",
      listResponseSchema(cruiseSailingRowSchema),
    ),
  },
})

const getSailingRoute = createRoute({
  method: "get",
  path: "/sailings/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: jsonContent(
      "A sailing by unified key (local aggregate or external adapter shape)",
      sailingDetailDataSchema,
    ),
    400: jsonContent("Key is not a valid local id or external key", errorResponseSchema),
    404: jsonContent("Sailing not found", errorResponseSchema),
    501: jsonContent("Referenced adapter is not registered", errorResponseSchema),
  },
})

const createSailingRoute = createRoute({
  method: "post",
  path: "/sailings",
  request: {
    body: { required: true, content: { "application/json": { schema: insertSailingSchema } } },
  },
  responses: {
    201: jsonContent("The created (or upserted) sailing", dataEnvelope(cruiseSailingRowSchema)),
    400: jsonContent("invalid_request: request body failed validation", errorResponseSchema),
  },
})

const updateSailingRoute = createRoute({
  method: "put",
  path: "/sailings/{key}",
  request: {
    params: keyParamSchema,
    body: { required: true, content: { "application/json": { schema: updateSailingSchema } } },
  },
  responses: {
    200: jsonContent("The updated sailing", dataEnvelope(cruiseSailingRowSchema)),
    400: jsonContent("Key is not a valid local id", errorResponseSchema),
    404: jsonContent("Sailing not found", errorResponseSchema),
    409: jsonContent("External sailing is read-only", errorResponseSchema),
  },
})

const getSailingItineraryRoute = createRoute({
  method: "get",
  path: "/sailings/{key}/itinerary",
  request: { params: keyParamSchema },
  responses: {
    200: jsonContent(
      "Effective itinerary days for the sailing (local merged days or adapter days)",
      itineraryForSailingSchema,
    ),
    400: jsonContent("Key is not a valid local id or external key", errorResponseSchema),
    501: jsonContent("Referenced adapter is not registered", errorResponseSchema),
  },
})

const replaceSailingDaysRoute = createRoute({
  method: "put",
  path: "/sailings/{key}/days/bulk",
  request: {
    params: keyParamSchema,
    body: {
      required: true,
      content: {
        "application/json": { schema: replaceSailingDaysSchema.omit({ sailingId: true }) },
      },
    },
  },
  responses: {
    200: jsonContent(
      "The replaced sailing-day overrides",
      arrayEnvelope(cruiseSailingDayRowSchema),
    ),
    400: jsonContent("Key is not a valid local id", errorResponseSchema),
    409: jsonContent("External sailing is read-only", errorResponseSchema),
  },
})

const getSailingPricingRoute = createRoute({
  method: "get",
  path: "/sailings/{key}/pricing",
  request: { params: keyParamSchema },
  responses: {
    200: jsonContent(
      "Pricing for the sailing (local price rows or external adapter prices)",
      pricingForSailingSchema,
    ),
    400: jsonContent("Key is not a valid local id or external key", errorResponseSchema),
    501: jsonContent("Referenced adapter is not registered", errorResponseSchema),
  },
})

const replaceSailingPricingRoute = createRoute({
  method: "put",
  path: "/sailings/{key}/pricing/bulk",
  request: {
    params: keyParamSchema,
    body: {
      required: true,
      content: { "application/json": { schema: replaceSailingPricingBodySchema } },
    },
  },
  responses: {
    200: jsonContent("The replaced sailing prices", arrayEnvelope(cruisePriceRowSchema)),
    400: jsonContent("Key is not a valid local id", errorResponseSchema),
    409: jsonContent("External sailing is read-only", errorResponseSchema),
  },
})

const quoteSailingRoute = createRoute({
  method: "post",
  path: "/sailings/{key}/quote",
  request: {
    params: keyParamSchema,
    body: { required: true, content: { "application/json": { schema: quotePayloadSchema } } },
  },
  responses: {
    200: jsonContent("The composed cruise quote", quoteResultSchema),
    400: jsonContent(
      "Invalid key, or guestCount/passengerComposition missing",
      errorResponseSchema,
    ),
    404: jsonContent(
      "No matching price for the requested cabin/occupancy/fare",
      errorResponseSchema,
    ),
    501: jsonContent("Referenced adapter is not registered", errorResponseSchema),
  },
})

// --- prices ---------------------------------------------------------------

const listPricesRoute = createRoute({
  method: "get",
  path: "/prices",
  request: { query: priceListQuerySchema },
  responses: {
    200: jsonContent("Paginated list of cruise prices", listResponseSchema(cruisePriceRowSchema)),
  },
})

const createPriceRoute = createRoute({
  method: "post",
  path: "/prices",
  request: {
    body: { required: true, content: { "application/json": { schema: insertPriceSchema } } },
  },
  responses: {
    201: jsonContent("The created price", dataEnvelope(cruisePriceRowSchema)),
    400: jsonContent("invalid_request: request body failed validation", errorResponseSchema),
  },
})

const updatePriceRoute = createRoute({
  method: "put",
  path: "/prices/{priceId}",
  request: {
    params: z.object({ priceId: z.string() }),
    body: { required: true, content: { "application/json": { schema: updatePriceSchema } } },
  },
  responses: {
    200: jsonContent("The updated price", dataEnvelope(cruisePriceRowSchema)),
    400: jsonContent("invalid_request: request body failed validation", errorResponseSchema),
    404: jsonContent("Price not found", errorResponseSchema),
  },
})

export function registerCruiseSailingAndPriceRoutes(app: OpenAPIHono<Env>) {
  // --- sailings ---
  app.openapi(listSailingsRoute, async (c) => {
    const result = await cruisesService.listSailings(c.get("db"), c.req.valid("query"))
    return c.json(result, 200)
  })
  app.openapi(getSailingRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const sailing = await ext.adapter.fetchSailing(ext.sourceRef)
      if (!sailing) return c.json({ error: "not_found" }, 404)
      const includeRaw = c.req.query("include") ?? ""
      const includes = new Set(
        includeRaw
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      )
      const enriched: Record<string, unknown> = {
        source: "external",
        sourceProvider: ext.adapter.name,
        sourceRef: sailing.sourceRef,
        sailing,
      }
      if (includes.has("pricing")) {
        enriched.pricing = await ext.adapter.fetchSailingPricing(ext.sourceRef)
      }
      if (includes.has("itinerary")) {
        enriched.itinerary = await ext.adapter.fetchSailingItinerary(ext.sourceRef)
      }
      return c.json({ data: enriched }, 200)
    }
    const includeRaw = c.req.query("include") ?? ""
    const includes = new Set(
      includeRaw
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    const row = await cruisesService.getSailingById(c.get("db"), parsed.id, {
      withPricing: includes.has("pricing"),
      withItinerary: includes.has("itinerary"),
    })
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
  app.openapi(createSailingRoute, async (c) => {
    const row = await cruisesService.upsertSailing(c.get("db"), c.req.valid("json"))
    return c.json({ data: row }, 201)
  })
  app.openapi(updateSailingRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "external") return c.json({ error: "external_cruise_read_only" }, 409)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    const row = await cruisesService.updateSailing(c.get("db"), parsed.id, c.req.valid("json"))
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
  app.openapi(getSailingItineraryRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const days = await ext.adapter.fetchSailingItinerary(ext.sourceRef)
      return c.json({ data: days }, 200)
    }
    const days = await cruisesService.getEffectiveItinerary(c.get("db"), parsed.id)
    return c.json({ data: days }, 200)
  })
  app.openapi(replaceSailingDaysRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "external") return c.json({ error: "external_cruise_read_only" }, 409)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    const payload = c.req.valid("json")
    const days = await cruisesService.replaceSailingDays(c.get("db"), {
      sailingId: parsed.id,
      days: payload.days,
    })
    return c.json({ data: days }, 200)
  })
  app.openapi(getSailingPricingRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const prices = await ext.adapter.fetchSailingPricing(ext.sourceRef)
      return c.json({ data: prices }, 200)
    }
    const result = await cruisesService.listPrices(c.get("db"), {
      sailingId: parsed.id,
      limit: 100,
      offset: 0,
    })
    return c.json(result, 200)
  })
  app.openapi(replaceSailingPricingRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "external") return c.json({ error: "external_cruise_read_only" }, 409)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    const payload = c.req.valid("json")
    const data = await cruisesService.replaceSailingPricing(c.get("db"), parsed.id, payload)
    return c.json({ data }, 200)
  })
  app.openapi(quoteSailingRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    const payload = c.req.valid("json")
    const guestCount =
      payload.guestCount ?? passengerCountFromComposition(payload.passengerComposition)
    if (!guestCount) {
      return c.json(
        {
          error: "guest_count_required",
          detail: "Provide guestCount or passengerComposition for cruise quote requests.",
        },
        400,
      )
    }
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      // Fetch upstream pricing then compose locally — the cabinCategoryId in
      // the payload is interpreted as the upstream cabin category externalId.
      const prices = await ext.adapter.fetchSailingPricing(ext.sourceRef)
      const cabinCategoryRef = sourceRefFromPayload(
        payload.cabinCategoryRef,
        payload.cabinCategoryId,
      )
      const matching = prices.find(
        (p) =>
          sourceRefMatches(p.cabinCategoryRef, cabinCategoryRef) &&
          p.occupancy === payload.occupancy &&
          passengerCompositionMatches(p.passengerComposition, payload.passengerComposition) &&
          (!payload.fareCode || p.fareCode === payload.fareCode) &&
          (!payload.fareVariant || p.fareVariant === payload.fareVariant),
      )
      if (!matching) return c.json({ error: "no_matching_price" }, 404)
      const { composeQuote } = await import("./service-pricing.js")
      const quote = composeQuote({
        price: {
          pricePerPerson: matching.pricePerPerson,
          originalPricePerPerson: matching.originalPricePerPerson ?? null,
          secondGuestPricePerPerson: matching.secondGuestPricePerPerson ?? null,
          singlePricePerPerson: matching.singlePricePerPerson ?? null,
          singleSupplementPercent: matching.singleSupplementPercent ?? null,
          currency: matching.currency,
          fareCode: matching.fareCode ?? null,
          fareCodeName: matching.fareCodeName ?? null,
          fareVariant: matching.fareVariant ?? "cruise_only",
          earlyBookingDeadline: matching.earlyBookingDeadline ?? null,
          earlyBookingBonusDescription: matching.earlyBookingBonusDescription ?? null,
        },
        components: (matching.components ?? []).map((c) => ({
          kind: c.kind,
          label: c.label ?? null,
          amount: c.amount,
          currency: c.currency,
          direction: c.direction,
          perPerson: c.perPerson,
        })),
        occupancy: payload.occupancy,
        guestCount,
        bookingTerms: matching.bookingTerms ?? null,
      })
      return c.json({ data: quote }, 200)
    }
    const quote = await pricingService.assembleQuote(c.get("db"), {
      sailingId: parsed.id,
      cabinCategoryId: payload.cabinCategoryId,
      occupancy: payload.occupancy,
      guestCount,
      fareCode: payload.fareCode ?? null,
      fareVariant: payload.fareVariant ?? null,
    })
    return c.json({ data: quote }, 200)
  })
  // --- prices (read endpoints; mutations go through bulk replace on the sailing) ---
  app.openapi(listPricesRoute, async (c) => {
    const result = await cruisesService.listPrices(c.get("db"), c.req.valid("query"))
    return c.json(result, 200)
  })
  app.openapi(createPriceRoute, async (c) => {
    const row = await cruisesService.createPrice(c.get("db"), c.req.valid("json"))
    return c.json({ data: row }, 201)
  })
  app.openapi(updatePriceRoute, async (c) => {
    const row = await cruisesService.updatePrice(
      c.get("db"),
      c.req.valid("param").priceId,
      c.req.valid("json"),
    )
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
}
