// agent-quality: file-size exception -- owner: charters; existing route module stays co-located until a dedicated split preserves behavior and tests.
//
// Migrated to `@hono/zod-openapi` for the OpenAPI admin backfill (voyant#2114 —
// charters batch). The plain `.get/.post(...)` handlers became
// `createRoute(...).openapi(...)` definitions grouped into per-resource child
// `OpenAPIHono` sub-chains (products / voyages / bookings / yachts), composed
// onto the exported parent via `.route("/", child)` so the `.openapi()`
// operations propagate up to the admin registry while keeping type-inference
// cost bounded (one flat `.openapi().openapi()...` chain has O(n²) cost).
//
// Request schemas reuse the package's existing validation insert/update/list
// schemas the handlers already parse; response row schemas are authored here
// from the Drizzle `$inferSelect` shapes (§17 dates/timestamps → strings).
// Key-gated mutation legs (`/{key}` PUT/DELETE/bulk + quote/booking POSTs and
// the MYBA leg) run their unified-key / contracts-service guard BEFORE touching
// the body, so they declare no OpenAPI request body and parse in-handler — this
// preserves the verbatim guard order (external rows → 409, missing adapter →
// 501, missing contracts service → 501) ahead of body validation. Large local
// aggregates and provider-defined adapter payloads stay opaque pass-throughs
// (`z.unknown()`) per bounded effort. Business logic is unchanged.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook, parseJsonBody } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import type { CharterAdapter, SourceRef } from "./adapters/index.js"
import { listCharterAdapters, resolveCharterAdapter } from "./adapters/registry.js"
import { type ParsedKey, parseUnifiedKey } from "./lib/key.js"
import {
  perSuiteQuoteResponseSchema,
  voyageItemSchema,
  wholeYachtQuoteResponseSchema,
} from "./routes-public.js"
import { chartersService } from "./service.js"
import { type CharterContractsService, mybaService } from "./service-myba.js"
import { composePerSuiteQuote, composeWholeYachtQuote, pricingService } from "./service-pricing.js"
import {
  insertProductSchema,
  insertVoyageSchema,
  productListQuerySchema,
  updateProductSchema,
  updateVoyageSchema,
  voyageListQuerySchema,
} from "./validation-core.js"
import { replaceVoyageScheduleSchema } from "./validation-itinerary.js"
import { replaceVoyageSuitesSchema } from "./validation-pricing.js"
import {
  charterBookingModeSchema,
  charterSourceSchema,
  charterStatusSchema,
  currencyCodeSchema,
  suiteAvailabilitySchema,
  suiteCategorySchema,
  yachtClassSchema,
} from "./validation-shared.js"
import { insertYachtSchema, updateYachtSchema, yachtListQuerySchema } from "./validation-yachts.js"

// ---------- Hono env ----------

type Env = {
  Variables: {
    db: PostgresJsDatabase
    userId?: string
    /**
     * Optional injection of `@voyant-travel/legal`'s contractsService — set by
     * the template at app boot so MYBA generation routes can run without
     * charters taking a hard dep on legal. When unset, the
     * `/bookings/:bookingId/myba` endpoint returns 501.
     */
    chartersContractsService?: CharterContractsService
  }
}

// ---------- shared helpers ----------

const adapterNotRegistered = (provider: string) => ({
  error: "adapter_not_registered",
  detail: `No CharterAdapter registered for source provider '${provider}'. Register one at app startup via registerCharterAdapter().`,
})

const externalReadOnly = {
  error: "external_charter_read_only",
  detail:
    "External charter rows can't be edited locally. Edit at the upstream system or use a local TypeID for new content.",
}

const invalidKey = (raw: string) => ({ error: "invalid_key", detail: `Unrecognized key: ${raw}` })

function resolveExternal(parsed: Extract<ParsedKey, { kind: "external" }>): {
  adapter: CharterAdapter
  sourceRef: SourceRef
} | null {
  const adapter = resolveCharterAdapter(parsed.provider)
  if (!adapter) return null
  return { adapter, sourceRef: { externalId: parsed.ref } }
}

function makeExternalKey(adapter: CharterAdapter, ref: SourceRef): string {
  return `${adapter.name}:${ref.externalId}`
}

// ---------- payload schemas (parsed in-handler on key-gated legs) ----------

const generateMybaPayload = z.object({
  templateIdOverride: z.string().optional().nullable(),
  language: z.string().optional(),
  extraVariables: z.record(z.string(), z.unknown()).optional(),
  title: z.string().optional(),
})

const perSuiteQuotePayload = z.object({
  /** For local voyages, a `chst_…` TypeID. For external voyages, the upstream suite externalId. */
  suiteId: z.string(),
  currency: currencyCodeSchema,
})

const wholeYachtQuotePayload = z.object({
  currency: currencyCodeSchema,
})

// ---------- response schemas ----------

// Error payloads carry `error` plus optional `detail`/spread context, so the
// wire schema is open beyond the discriminant.
const errorResponseSchema = z.object({ error: z.string() }).catchall(z.unknown())

const dataEnvelope = <T extends z.ZodTypeAny>(schema: T) => z.object({ data: schema })

const keyParamSchema = z.object({ key: z.string() })

const errorResponse = (description: string) => ({
  description,
  content: { "application/json": { schema: errorResponseSchema } },
})

/**
 * Wire shape of a `charter_products` row (§17 dates/timestamps → strings).
 * `numeric` columns serialize as strings; jsonb columns without `.notNull()`
 * are nullable per Drizzle `$inferSelect`.
 */
export const charterProductSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  lineSupplierId: z.string().nullable(),
  defaultYachtId: z.string().nullable(),
  description: z.string().nullable(),
  shortDescription: z.string().nullable(),
  heroImageUrl: z.string().nullable(),
  mapImageUrl: z.string().nullable(),
  regions: z.array(z.string()).nullable(),
  themes: z.array(z.string()).nullable(),
  status: charterStatusSchema,
  defaultBookingModes: z.array(charterBookingModeSchema).nullable(),
  defaultMybaTemplateId: z.string().nullable(),
  defaultApaPercent: z.string().nullable(),
  lowestPriceCachedAmount: z.string().nullable(),
  lowestPriceCachedCurrency: z.string().nullable(),
  earliestVoyageCached: z.string().nullable(),
  latestVoyageCached: z.string().nullable(),
  externalRefs: z.record(z.string(), z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Wire shape of a `charter_yachts` row. */
export const charterYachtSchema = z.object({
  id: z.string(),
  lineSupplierId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  yachtClass: yachtClassSchema,
  capacityGuests: z.number().int().nullable(),
  capacityCrew: z.number().int().nullable(),
  lengthMeters: z.string().nullable(),
  yearBuilt: z.number().int().nullable(),
  yearRefurbished: z.number().int().nullable(),
  imo: z.string().nullable(),
  description: z.string().nullable(),
  gallery: z.array(z.string()).nullable(),
  amenities: z.record(z.string(), z.unknown()).nullable(),
  crewBios: z
    .array(
      z.object({
        role: z.string(),
        name: z.string(),
        bio: z.string().optional(),
        photoUrl: z.string().optional(),
      }),
    )
    .nullable(),
  defaultCharterAreas: z.array(z.string()).nullable(),
  externalRefs: z.record(z.string(), z.string()).nullable(),
  isActive: z.boolean(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Wire shape of a `charter_suites` row (bulk-replace return). */
export const charterSuiteSchema = z.object({
  id: z.string(),
  voyageId: z.string(),
  suiteCode: z.string(),
  suiteName: z.string(),
  suiteCategory: suiteCategorySchema.nullable(),
  description: z.string().nullable(),
  squareFeet: z.string().nullable(),
  images: z.array(z.string()).nullable(),
  floorplanImages: z.array(z.string()).nullable(),
  maxGuests: z.number().int().nullable(),
  pricesByCurrency: z.record(z.string(), z.string()),
  portFeesByCurrency: z.record(z.string(), z.string()),
  availability: suiteAvailabilitySchema,
  unitsAvailable: z.number().int().nullable(),
  appointmentOnly: z.boolean(),
  notes: z.string().nullable(),
  extra: z.record(z.string(), z.unknown()).nullable(),
  externalRefs: z.record(z.string(), z.string()).nullable(),
  lastSyncedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/** Wire shape of a `charter_schedule_days` row (bulk-replace return). */
export const charterScheduleDaySchema = z.object({
  id: z.string(),
  voyageId: z.string(),
  dayNumber: z.number().int(),
  portFacilityId: z.string().nullable(),
  portName: z.string().nullable(),
  scheduleDate: z.string().nullable(),
  arrivalTime: z.string().nullable(),
  departureTime: z.string().nullable(),
  isSeaDay: z.boolean(),
  description: z.string().nullable(),
  activities: z.array(z.string()).nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

/**
 * A single row of the admin unified charter-browse list. `source` discriminates
 * a local product from an external adapter entry; `product`/`sourceRef` are
 * large aggregates documented as opaque pass-throughs (bounded effort).
 */
const adminBrowseItemSchema = z.object({
  source: charterSourceSchema,
  sourceProvider: z.string().nullable(),
  sourceRef: z.unknown().nullable(),
  key: z.string(),
  product: z.unknown(),
})

/**
 * The admin browse envelope. Hand-built (not `listResponse`) because it fans
 * local rows in with every adapter's entries and carries per-adapter diagnostics
 * (`localTotal`, `adapterCount`, `adapterErrors`) alongside the standard
 * `{ data, total, limit, offset }` shape.
 */
export const adminBrowseResponseSchema = z.object({
  data: z.array(adminBrowseItemSchema),
  total: z.number().int(),
  localTotal: z.number().int(),
  adapterCount: z.number().int(),
  adapterErrors: z.array(z.object({ adapter: z.string(), error: z.string() })),
  limit: z.number().int(),
  offset: z.number().int(),
})

/**
 * The product-voyages envelope. The external branch returns `{ data, total }`
 * of wrapped adapter voyages; the local branch returns the `listResponse`
 * `{ data, total, limit, offset }`. Both share `data`/`total`; `limit`/`offset`
 * are optional. Items stay opaque (local rows vs provider shapes).
 */
const productVoyagesResponseSchema = z.object({
  data: z.array(z.unknown()),
  total: z.number().int(),
  limit: z.number().int().optional(),
  offset: z.number().int().optional(),
})

/** Local lookups return `{ data: <aggregate> }`; external lookups return a
 * provider-defined enriched shape. Both opaque (bounded effort). */
const opaqueDataResponseSchema = dataEnvelope(z.unknown())

/** The MYBA generate result envelope. */
const mybaResponseSchema = z.object({
  data: z.object({
    contractId: z.string(),
    charterDetails: z.unknown(),
  }),
})

// ---------- products sub-chain ----------

const listProductsRoute = createRoute({
  method: "get",
  path: "/products",
  request: { query: productListQuerySchema },
  responses: {
    200: {
      description:
        "Admin unified charter browse: local products fanned in with every registered adapter's entries + per-adapter diagnostics",
      content: { "application/json": { schema: adminBrowseResponseSchema } },
    },
  },
})

const createProductRoute = createRoute({
  method: "post",
  path: "/products",
  request: {
    body: { required: true, content: { "application/json": { schema: insertProductSchema } } },
  },
  responses: {
    201: {
      description: "The created charter product",
      content: { "application/json": { schema: dataEnvelope(charterProductSchema) } },
    },
    400: errorResponse("invalid_request: request body failed validation"),
  },
})

const recomputeProductAggregatesRoute = createRoute({
  method: "post",
  path: "/products/{key}/aggregates/recompute",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "The product with recomputed cached aggregates",
      content: { "application/json": { schema: dataEnvelope(charterProductSchema) } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Product not found"),
    409: errorResponse("External charter rows can't be edited locally"),
  },
})

const listProductVoyagesRoute = createRoute({
  method: "get",
  path: "/products/{key}/voyages",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "Voyages for a product (local rows or wrapped adapter voyages)",
      content: { "application/json": { schema: productVoyagesResponseSchema } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    501: errorResponse("Referenced adapter is not registered"),
  },
})

const getProductRoute = createRoute({
  method: "get",
  path: "/products/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "A charter product by unified key (local aggregate or external adapter shape)",
      content: { "application/json": { schema: opaqueDataResponseSchema } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Product not found"),
    501: errorResponse("Referenced adapter is not registered"),
  },
})

const updateProductRoute = createRoute({
  method: "put",
  path: "/products/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "The updated charter product",
      content: { "application/json": { schema: dataEnvelope(charterProductSchema) } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Product not found"),
    409: errorResponse("External charter rows can't be edited locally"),
  },
})

const deleteProductRoute = createRoute({
  method: "delete",
  path: "/products/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "The archived charter product",
      content: { "application/json": { schema: dataEnvelope(charterProductSchema) } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Product not found"),
    409: errorResponse("External charter rows can't be edited locally"),
  },
})

const productsAdminRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listProductsRoute, async (c) => {
    const query = c.req.valid("query")
    const local = await chartersService.listProducts(c.get("db"), query)
    const localItems = local.data.map((p) => ({
      source: "local" as const,
      sourceProvider: null,
      sourceRef: null,
      key: p.id,
      product: p,
    }))
    // Fan out to every registered adapter in parallel via Promise.allSettled —
    // one slow or failing adapter doesn't block the rest.
    const adapters = listCharterAdapters()
    const settled = await Promise.allSettled(
      adapters.map((adapter) =>
        adapter
          .listEntries({ limit: query.limit })
          .then((result) => ({ adapter, result }) as const),
      ),
    )
    const adapterItems: Array<{
      source: "external"
      sourceProvider: string
      sourceRef: SourceRef
      key: string
      product: unknown
    }> = []
    const adapterErrors: Array<{ adapter: string; error: string }> = []
    for (let i = 0; i < settled.length; i++) {
      const outcome = settled[i]
      const adapter = adapters[i]
      if (!outcome || !adapter) continue
      if (outcome.status === "rejected") {
        adapterErrors.push({
          adapter: adapter.name,
          error: outcome.reason instanceof Error ? outcome.reason.message : String(outcome.reason),
        })
        continue
      }
      for (const entry of outcome.value.result.entries) {
        adapterItems.push({
          source: "external",
          sourceProvider: adapter.name,
          sourceRef: entry.sourceRef,
          key: makeExternalKey(adapter, entry.sourceRef),
          product: entry,
        })
      }
    }
    return c.json(
      {
        data: [...localItems, ...adapterItems],
        total: local.total + adapterItems.length,
        localTotal: local.total,
        adapterCount: adapters.length,
        adapterErrors,
        limit: local.limit,
        offset: local.offset,
      },
      200,
    )
  })
  .openapi(createProductRoute, async (c) => {
    const data = c.req.valid("json")
    const row = await chartersService.createProduct(c.get("db"), data)
    return c.json({ data: row }, 201)
  })
  .openapi(recomputeProductAggregatesRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") return c.json(externalReadOnly, 409)
    const row = await chartersService.recomputeProductAggregates(c.get("db"), parsed.id)
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(listProductVoyagesRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const voyages = await ext.adapter.listVoyagesForProduct(ext.sourceRef)
      return c.json(
        {
          data: voyages.map((v) => ({
            source: "external" as const,
            sourceProvider: ext.adapter.name,
            key: makeExternalKey(ext.adapter, v.sourceRef),
            voyage: v,
          })),
          total: voyages.length,
        },
        200,
      )
    }
    const result = await chartersService.listVoyages(c.get("db"), {
      productId: parsed.id,
      limit: 100,
      offset: 0,
    })
    return c.json(result, 200)
  })
  .openapi(getProductRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const product = await ext.adapter.fetchProduct(ext.sourceRef)
      if (!product) return c.json({ error: "not_found" }, 404)
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
        sourceRef: product.sourceRef,
        product,
      }
      if (includes.has("voyages")) {
        enriched.voyages = await ext.adapter.listVoyagesForProduct(ext.sourceRef)
      }
      if (includes.has("yacht") && product.defaultYachtRef) {
        enriched.yacht = await ext.adapter.fetchYacht(product.defaultYachtRef)
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
    const row = await chartersService.getProductById(c.get("db"), parsed.id, {
      withVoyages: includes.has("voyages"),
      withYacht: includes.has("yacht"),
    })
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(updateProductRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") return c.json(externalReadOnly, 409)
    const data = await parseJsonBody(c, updateProductSchema)
    const row = await chartersService.updateProduct(c.get("db"), parsed.id, data)
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(deleteProductRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") return c.json(externalReadOnly, 409)
    const row = await chartersService.archiveProduct(c.get("db"), parsed.id)
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })

// ---------- voyages sub-chain ----------

const listVoyagesRoute = createRoute({
  method: "get",
  path: "/voyages",
  request: { query: voyageListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of local charter voyages",
      content: { "application/json": { schema: listResponseSchema(voyageItemSchema) } },
    },
  },
})

const createVoyageRoute = createRoute({
  method: "post",
  path: "/voyages",
  request: {
    body: { required: true, content: { "application/json": { schema: insertVoyageSchema } } },
  },
  responses: {
    201: {
      description: "The upserted charter voyage",
      content: { "application/json": { schema: dataEnvelope(voyageItemSchema) } },
    },
    400: errorResponse("invalid_request: request body failed validation"),
  },
})

const replaceVoyageSuitesRoute = createRoute({
  method: "put",
  path: "/voyages/{key}/suites/bulk",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "The replaced suite rows for the voyage",
      content: { "application/json": { schema: dataEnvelope(z.array(charterSuiteSchema)) } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    409: errorResponse("External charter rows can't be edited locally"),
  },
})

const replaceVoyageScheduleRoute = createRoute({
  method: "put",
  path: "/voyages/{key}/schedule/bulk",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "The replaced schedule-day rows for the voyage",
      content: { "application/json": { schema: dataEnvelope(z.array(charterScheduleDaySchema)) } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    409: errorResponse("External charter rows can't be edited locally"),
  },
})

const quotePerSuiteRoute = createRoute({
  method: "post",
  path: "/voyages/{key}/quote/per-suite",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "A composed per-suite quote for the requested suite/currency",
      content: { "application/json": { schema: perSuiteQuoteResponseSchema } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("No matching suite for the requested key"),
    501: errorResponse("Referenced adapter is not registered"),
  },
})

const quoteWholeYachtRoute = createRoute({
  method: "post",
  path: "/voyages/{key}/quote/whole-yacht",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "A composed whole-yacht quote for the requested currency",
      content: { "application/json": { schema: wholeYachtQuoteResponseSchema } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Voyage not found"),
    501: errorResponse("Referenced adapter is not registered"),
  },
})

const getVoyageRoute = createRoute({
  method: "get",
  path: "/voyages/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "A voyage by unified key (local aggregate or external adapter shape)",
      content: { "application/json": { schema: opaqueDataResponseSchema } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Voyage not found"),
    501: errorResponse("Referenced adapter is not registered"),
  },
})

const updateVoyageRoute = createRoute({
  method: "put",
  path: "/voyages/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "The updated charter voyage",
      content: { "application/json": { schema: dataEnvelope(voyageItemSchema) } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Voyage not found"),
    409: errorResponse("External charter rows can't be edited locally"),
  },
})

const voyagesAdminRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listVoyagesRoute, async (c) => {
    const query = c.req.valid("query")
    const result = await chartersService.listVoyages(c.get("db"), query)
    return c.json(result, 200)
  })
  .openapi(createVoyageRoute, async (c) => {
    const data = c.req.valid("json")
    const row = await chartersService.upsertVoyage(c.get("db"), data)
    return c.json({ data: row }, 201)
  })
  .openapi(replaceVoyageSuitesRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") return c.json(externalReadOnly, 409)
    const payload = await parseJsonBody(c, replaceVoyageSuitesSchema.omit({ voyageId: true }))
    const rows = await chartersService.replaceVoyageSuites(c.get("db"), {
      voyageId: parsed.id,
      suites: payload.suites,
    })
    return c.json({ data: rows }, 200)
  })
  .openapi(replaceVoyageScheduleRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") return c.json(externalReadOnly, 409)
    const payload = await parseJsonBody(c, replaceVoyageScheduleSchema.omit({ voyageId: true }))
    const rows = await chartersService.replaceVoyageSchedule(c.get("db"), {
      voyageId: parsed.id,
      days: payload.days,
    })
    return c.json({ data: rows }, 200)
  })
  .openapi(quotePerSuiteRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    const payload = await parseJsonBody(c, perSuiteQuotePayload)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const suites = await ext.adapter.fetchVoyageSuites(ext.sourceRef)
      const matching = suites.find((s) => s.sourceRef.externalId === payload.suiteId)
      if (!matching) return c.json({ error: "no_matching_suite" }, 404)
      const quote = composePerSuiteQuote({
        voyageId: ext.sourceRef.externalId,
        suite: {
          id: matching.sourceRef.externalId,
          suiteName: matching.suiteName,
          pricesByCurrency: matching.pricesByCurrency ?? {},
          portFeesByCurrency: matching.portFeesByCurrency ?? {},
        },
        currency: payload.currency,
      })
      return c.json({ data: quote }, 200)
    }
    const quote = await pricingService.quotePerSuite(c.get("db"), {
      suiteId: payload.suiteId,
      currency: payload.currency,
    })
    return c.json({ data: quote }, 200)
  })
  .openapi(quoteWholeYachtRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    const payload = await parseJsonBody(c, wholeYachtQuotePayload)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const voyage = await ext.adapter.fetchVoyage(ext.sourceRef)
      if (!voyage) return c.json({ error: "not_found" }, 404)
      const product = await ext.adapter.fetchProduct(voyage.productRef)
      const quote = composeWholeYachtQuote({
        voyage: {
          id: voyage.sourceRef.externalId,
          wholeYachtPricesByCurrency: voyage.wholeYachtPricesByCurrency ?? {},
          apaPercentOverride: voyage.apaPercentOverride ?? null,
        },
        productDefaultApaPercent: product?.defaultApaPercent ?? null,
        currency: payload.currency,
      })
      return c.json({ data: quote }, 200)
    }
    const quote = await pricingService.quoteWholeYacht(c.get("db"), {
      voyageId: parsed.id,
      currency: payload.currency,
    })
    return c.json({ data: quote }, 200)
  })
  .openapi(getVoyageRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const voyage = await ext.adapter.fetchVoyage(ext.sourceRef)
      if (!voyage) return c.json({ error: "not_found" }, 404)
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
        sourceRef: voyage.sourceRef,
        voyage,
      }
      if (includes.has("suites")) {
        enriched.suites = await ext.adapter.fetchVoyageSuites(ext.sourceRef)
      }
      if (includes.has("schedule")) {
        enriched.schedule = await ext.adapter.fetchVoyageSchedule(ext.sourceRef)
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
    const row = await chartersService.getVoyageById(c.get("db"), parsed.id, {
      withSuites: includes.has("suites"),
      withSchedule: includes.has("schedule"),
    })
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(updateVoyageRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") return c.json(externalReadOnly, 409)
    const data = await parseJsonBody(c, updateVoyageSchema)
    const row = await chartersService.updateVoyage(c.get("db"), parsed.id, data)
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })

// ---------- bookings sub-chain ----------

const generateMybaRoute = createRoute({
  method: "post",
  path: "/bookings/{bookingId}/myba",
  request: { params: z.object({ bookingId: z.string() }) },
  responses: {
    200: {
      description: "The generated MYBA contract id + charter detail snapshot",
      content: { "application/json": { schema: mybaResponseSchema } },
    },
    404: errorResponse("Booking or MYBA template not found"),
    409: errorResponse("Booking is not in whole-yacht mode"),
    412: errorResponse("No MYBA template resolved for the booking"),
    500: errorResponse("Contract creation failed"),
    501: errorResponse("Contracts service is not wired into Hono context"),
  },
})

const bookingsAdminRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook }).openapi(
  generateMybaRoute,
  async (c) => {
    const contractsService = c.get("chartersContractsService")
    if (!contractsService) {
      return c.json(
        {
          error: "contracts_service_unavailable",
          detail:
            "MYBA generation requires the legal/contracts service to be wired into Hono context as `chartersContractsService` at app boot.",
        },
        501,
      )
    }
    const payload = await parseJsonBody(c, generateMybaPayload)
    const result = await mybaService.generateContract(c.get("db"), contractsService, {
      bookingId: c.req.valid("param").bookingId,
      templateIdOverride: payload.templateIdOverride ?? null,
      language: payload.language,
      extraVariables: payload.extraVariables,
      title: payload.title,
    })
    if (result.status === "not_found") return c.json({ error: result.status }, 404)
    if (result.status === "wrong_mode") return c.json({ error: result.status, ...result }, 409)
    if (result.status === "no_template") return c.json({ error: result.status }, 412)
    if (result.status === "template_not_found")
      return c.json({ error: result.status, ...result }, 404)
    if (result.status === "contract_create_failed") return c.json({ error: result.status }, 500)
    return c.json(
      {
        data: { contractId: result.contractId, charterDetails: result.detail },
      },
      200,
    )
  },
)

// ---------- yachts sub-chain ----------

const listYachtsRoute = createRoute({
  method: "get",
  path: "/yachts",
  request: { query: yachtListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of local charter yachts",
      content: { "application/json": { schema: listResponseSchema(charterYachtSchema) } },
    },
  },
})

const createYachtRoute = createRoute({
  method: "post",
  path: "/yachts",
  request: {
    body: { required: true, content: { "application/json": { schema: insertYachtSchema } } },
  },
  responses: {
    201: {
      description: "The created charter yacht",
      content: { "application/json": { schema: dataEnvelope(charterYachtSchema) } },
    },
    400: errorResponse("invalid_request: request body failed validation"),
  },
})

const getYachtRoute = createRoute({
  method: "get",
  path: "/yachts/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "A yacht by unified key (local row or external adapter shape)",
      content: { "application/json": { schema: opaqueDataResponseSchema } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Yacht not found"),
    501: errorResponse("Referenced adapter is not registered"),
  },
})

const updateYachtRoute = createRoute({
  method: "put",
  path: "/yachts/{key}",
  request: { params: keyParamSchema },
  responses: {
    200: {
      description: "The updated charter yacht",
      content: { "application/json": { schema: dataEnvelope(charterYachtSchema) } },
    },
    400: errorResponse("Key is not a valid local id or external key"),
    404: errorResponse("Yacht not found"),
    409: errorResponse("External charter rows can't be edited locally"),
  },
})

const yachtsAdminRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listYachtsRoute, async (c) => {
    const query = c.req.valid("query")
    const result = await chartersService.listYachts(c.get("db"), query)
    return c.json(result, 200)
  })
  .openapi(createYachtRoute, async (c) => {
    const data = c.req.valid("json")
    const row = await chartersService.createYacht(c.get("db"), data)
    return c.json({ data: row }, 201)
  })
  .openapi(getYachtRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") {
      const ext = resolveExternal(parsed)
      if (!ext) return c.json(adapterNotRegistered(parsed.provider), 501)
      const yacht = await ext.adapter.fetchYacht(ext.sourceRef)
      if (!yacht) return c.json({ error: "not_found" }, 404)
      return c.json(
        {
          data: {
            source: "external",
            sourceProvider: ext.adapter.name,
            sourceRef: yacht.sourceRef,
            yacht,
          },
        },
        200,
      )
    }
    const row = await chartersService.getYachtById(c.get("db"), parsed.id)
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })
  .openapi(updateYachtRoute, async (c) => {
    const parsed = parseUnifiedKey(c.req.valid("param").key)
    if (parsed.kind === "invalid") return c.json(invalidKey(parsed.raw), 400)
    if (parsed.kind === "external") return c.json(externalReadOnly, 409)
    const data = await parseJsonBody(c, updateYachtSchema)
    const row = await chartersService.updateYacht(c.get("db"), parsed.id, data)
    if (!row) return c.json({ error: "not_found" }, 404)
    return c.json({ data: row }, 200)
  })

// ---------- composed admin parent ----------

/**
 * Charter admin routes. Mounted by the deployment under `/v1/admin/charters`.
 * Per-resource child `OpenAPIHono` sub-chains are composed via `.route("/", …)`
 * so the `.openapi()` operations propagate up to the admin registry. Within each
 * sub-chain, static + sub-resource paths are declared before the dynamic
 * `/{key}` legs so the registry's path-merge matches runtime.
 */
export const chartersAdminRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .route("/", productsAdminRoutes)
  .route("/", voyagesAdminRoutes)
  .route("/", bookingsAdminRoutes)
  .route("/", yachtsAdminRoutes)

export type ChartersAdminRoutes = typeof chartersAdminRoutes
