// agent-quality: file-size exception -- owner: catalog; existing booking-engine route surface stays co-located to preserve mount order and OpenAPI output until a dedicated route split preserves behavior and tests.
/**
 * Catalog booking-engine route module — the full admin + public booking
 * surface, owned by `@voyant-travel/catalog`.
 *
 * A deployment composes this and supplies two structural options:
 *   - `booking` — the `CatalogBookingRoutesOptions` (db / registries /
 *     hold-ttl / promotions / tax hooks) it already builds today, and
 *   - `resolveRegistry(c)` — pulls the process-local `SourceAdapterRegistry`
 *     off the request context (cancel needs it to dispatch to adapters).
 *
 * The module mounts the shared lifecycle from `./routes.js` on **two**
 * surfaces and adds the admin-only order-management endpoints:
 *
 *   POST   /v1/{admin,public}/catalog/quote          → quoteEntity
 *   PUT    /v1/{admin,public}/catalog/drafts/:id      → upsert booking draft
 *   GET    /v1/{admin,public}/catalog/drafts/:id      → read booking draft
 *   DELETE /v1/{admin,public}/catalog/drafts/:id      → delete booking draft
 *   POST   /v1/{admin,public}/catalog/holds/place     → place hold
 *   POST   /v1/{admin,public}/catalog/holds/release   → release hold
 *   GET    /v1/admin/catalog/orders                   → listOrders
 *   GET    /v1/admin/catalog/orders/:id               → getOrderById
 *   POST   /v1/admin/catalog/orders/:id/cancel        → cancelEntity
 *   GET    /v1/{admin,public}/catalog/slots           → availability slots
 *   GET    /v1/admin/bookings/:id/catalog-snapshot    → frozen catalog snapshot
 *
 * Auth posture comes from the deployment's `createApp` middleware chain —
 * `/v1/admin/...` requires staff, `/v1/public/...` accepts the configured
 * public actors. Per booking-journey-architecture §10 Phase B.
 *
 * The slots + catalog-snapshot handlers read across module boundaries
 * (`@voyant-travel/inventory` / `@voyant-travel/operations`), both of which
 * already depend on `@voyant-travel/catalog`. Statically importing them here
 * would create an import cycle, so the cross-package reads are supplied by the
 * deployment as INJECTED option functions — the package never imports those
 * modules, it only calls the readers the deployment hands it.
 */

import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { openApiValidationHook, stampOpenApiRegistryApiId } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context, Hono } from "hono"

import { bookingCatalogSnapshotTable, catalogSourcedEntriesTable } from "../schema.js"
import { readSourcedEntry } from "../services/sourced-entry-service.js"
import { cancelEntity } from "./cancel.js"
import {
  BookingEngineError,
  NO_ADAPTER_REGISTERED,
  NO_HANDLER_REGISTERED,
  ORDER_ALREADY_CANCELLED,
  ORDER_NOT_FOUND,
  QUOTE_EXPIRED,
  QUOTE_NOT_FOUND,
} from "./errors.js"
import { getOrderById, listOrders } from "./orders.js"
import type { SourceAdapterRegistry } from "./registry.js"
import { type CatalogBookingRoutesOptions, createCatalogBookingRoutes } from "./routes.js"
import { type BookingSessionRoutesOptions, createBookingSessionRoutes } from "./sessions-routes.js"

/**
 * A single resolved departure/slot as projected by `getProductContent`.
 * Structural mirror of `@voyant-travel/inventory`'s `ProductDeparture` so the
 * package needn't import inventory — only the fields the slots handler maps.
 */
export interface CatalogResolvedDeparture {
  id: string
  starts_at: string
  ends_at?: string | null
  status?: string | null
  capacity?: number | null
  remaining?: number | null
}

/**
 * Structural result of the injected `getProductContent` reader. Mirrors
 * `@voyant-travel/inventory/service-content`'s `ResolvedProductContent`, but
 * narrowed to the only field the slots handler reads (`content.departures`).
 */
export interface CatalogResolvedProductContent {
  content: { departures?: ReadonlyArray<CatalogResolvedDeparture> }
}

/** Selected storefront/public scope for slot resolution. */
export interface CatalogAvailabilitySlotsScope {
  market?: string
  locale?: string
  currency?: string
}

/** Locale/market scope passed to the injected `getProductContent` reader. */
export interface CatalogProductContentScope {
  preferredLocales: ReadonlyArray<string>
  audience: "staff" | "customer" | "partner" | "supplier"
  market?: string
  currency?: string
}

/** Adapter/runtime context passed to the injected `getProductContent` reader. */
export interface CatalogProductContentReadContext {
  registry: SourceAdapterRegistry
  forceFresh?: boolean
}

/**
 * Owned-product summary returned by the injected `getOwnedProductById` reader.
 * Structural mirror of the inventory `productsService.getProductById` result,
 * narrowed to the two fields the snapshot fallback reads.
 */
export interface CatalogOwnedProductSummary {
  name: string | null
  description: string | null
}

/**
 * Deployment-supplied options for the catalog booking-engine route module.
 * Structural only — no deployment imports, no platform bindings. The three
 * cross-package readers (`getProductContent`, `listAvailabilitySlots`,
 * `getOwnedProductById`) are INJECTED so the package can host the slots +
 * snapshot handlers without statically importing `@voyant-travel/inventory`
 * or `@voyant-travel/operations` (both of which depend on catalog).
 */
export interface CatalogBookingRouteModuleOptions {
  /**
   * The booking-engine lifecycle options (db, source/owned registries,
   * hold-ttl, promotions, tax transforms). The deployment already builds
   * these for `createCatalogBookingRoutes`.
   */
  booking: CatalogBookingRoutesOptions
  bookingSessions?: Omit<BookingSessionRoutesOptions, "actorKind">
  /**
   * Resolve the process-local source-adapter registry for a request. Used by
   * the order-cancel handler to dispatch to the registered adapter.
   */
  resolveRegistry(c: Context): SourceAdapterRegistry
  /**
   * Read the resolved product content for a sourced product (slots path).
   * Modelled on `@voyant-travel/inventory/service-content`'s
   * `getProductContent`; structural so catalog doesn't import inventory.
   */
  getProductContent(
    db: AnyDrizzleDb,
    productId: string,
    scope: CatalogProductContentScope,
    ctx: CatalogProductContentReadContext,
  ): Promise<CatalogResolvedProductContent | null>
  /**
   * Read the owned `availability_slots` rows for a product (owned slots path).
   * The deployment owns the drizzle query against
   * `@voyant-travel/operations`; this returns the already-mapped rows.
   */
  listAvailabilitySlots(
    db: AnyDrizzleDb,
    productId: string,
    todayIso: string,
    scope: CatalogAvailabilitySlotsScope,
  ): Promise<SlotRow[]>
  /**
   * Read an owned product by id for the snapshot fallback. Structural mirror
   * of inventory `productsService.getProductById`; returns `{ name,
   * description } | null`.
   */
  getOwnedProductById(
    db: AnyDrizzleDb,
    productId: string,
  ): Promise<CatalogOwnedProductSummary | null>
}

/**
 * The slot row shape returned by both the sourced and owned slots paths.
 * Date-bearing fields accept `Date | string` because the owned path forwards
 * raw drizzle timestamp columns (serialized to ISO strings by `c.json`),
 * while the sourced path projects ISO strings directly.
 */
export interface SlotRow {
  id: string
  dateLocal: string
  startsAt: string | Date
  endsAt: string | Date | null
  timezone: string
  status: string
  unlimited: boolean
  remainingPax: number | null
  initialPax: number | null
  nights: number | null
  days: number | null
}

interface CancelBody {
  bookingId?: string
  entityModule?: string
  entityId?: string
  reason?: string
}

function getDb(options: CatalogBookingRouteModuleOptions, c: Context): AnyDrizzleDb {
  return options.booking.resolveDb(c)
}

// ─────────────────────────────────────────────────────────────────
// OpenAPI route + response schemas (voyant#2114 / voyant#2208)
//
// The order rows + cancel result are projections of the engine's internal
// `catalog_orders`/cancel shapes, so the documented 200 bodies are open records.
// Request bodies/queries stay validated IN-HANDLER (the handlers own their
// custom 400 shapes and the typed engine error → status mapping), so the
// declared request parts are permissive: opaque JSON bodies and all-optional
// query strings the handlers re-parse from the URL.
// ─────────────────────────────────────────────────────────────────

/**
 * Deployment `Variables` the engine reads off the request context — resolved by
 * the parent app's middleware chain. Permissive: the resolvers own the lookup.
 */
type Env = { Variables: { db?: AnyDrizzleDb; userId?: string } }

/** Engine `BookingEngineError` envelope (`{ error, code?, context? }`). */
const errorResponseSchema = z.object({
  error: z.string(),
  code: z.string().optional(),
  context: z.record(z.string(), z.unknown()).optional(),
})

const idParamSchema = z.object({ id: z.string() })

/** Open order-row projection (engine internal shape). */
const orderRowSchema = z.record(z.string(), z.unknown())

const ordersListResponseSchema = z.object({ rows: z.array(orderRowSchema) })

/** §17: `availability_slots` rows serialize their timestamp columns to strings. */
const slotRowSchema = z.object({
  id: z.string(),
  dateLocal: z.string(),
  startsAt: z.string(),
  endsAt: z.string().nullable(),
  timezone: z.string(),
  status: z.string(),
  unlimited: z.boolean(),
  remainingPax: z.number().nullable(),
  initialPax: z.number().nullable(),
  nights: z.number().nullable(),
  days: z.number().nullable(),
})

const slotsResponseSchema = z.object({ rows: z.array(slotRowSchema) })

const snapshotResponseSchema = z.object({ data: z.record(z.string(), z.unknown()) })

/** Opaque JSON request body — the handler validates it in-line. */
const opaqueJsonBody = {
  required: false,
  content: { "application/json": { schema: z.unknown() } },
} as const

/** All-optional list query — the handler re-parses the raw URL search params. */
const ordersListQuerySchema = z.object({
  bookingId: z.string().optional(),
  entityModule: z.string().optional(),
  sourceKinds: z.string().optional(),
  limit: z.string().optional(),
  offset: z.string().optional(),
})

/** Required-but-validated-in-handler slots query (custom 400 when absent). */
const slotsQuerySchema = z.object({
  entityModule: z.string().optional(),
  entityId: z.string().optional(),
  market: z.string().optional(),
  locale: z.string().optional(),
  currency: z.string().optional(),
})

const ordersListRoute = createRoute({
  method: "get",
  path: "/orders",
  request: { query: ordersListQuerySchema },
  responses: {
    200: {
      description: "Catalog orders matching the optional filters",
      content: { "application/json": { schema: ordersListResponseSchema } },
    },
  },
})

const orderGetRoute = createRoute({
  method: "get",
  path: "/orders/{id}",
  request: { params: idParamSchema },
  responses: {
    200: {
      description: "A catalog order by id",
      content: { "application/json": { schema: orderRowSchema } },
    },
    400: {
      description: "id is required",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "order not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const orderCancelRoute = createRoute({
  method: "post",
  path: "/orders/{id}/cancel",
  request: { params: idParamSchema, body: opaqueJsonBody },
  responses: {
    200: {
      description: "Cancellation dispatched to the registered source adapter",
      content: { "application/json": { schema: orderRowSchema } },
    },
    400: {
      description: "bookingId, entityModule, and entityId are required in the body",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    404: {
      description: "Quote/order referenced by the engine was not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    409: {
      description: "Order already cancelled or conflicts with current state",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    500: {
      description: "Unexpected cancellation failure",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    502: {
      description: "Upstream reservation/cancel failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    503: {
      description: "No adapter/handler registered for this vertical",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

/**
 * Admin-only order-management routes (relative paths; mount at
 * `/v1/admin/catalog`). Surfaces snapshot rows cross-vertically and routes
 * cancels back through the registered source adapter. Migrated to
 * `@hono/zod-openapi` for the admin OpenAPI backfill (voyant#2114) — the
 * handlers keep returning a plain `Response`, bridged to the inferred
 * typed-response union by `asRouteResponse`.
 */
export function createCatalogBookingOrdersRoutes(
  options: CatalogBookingRouteModuleOptions,
): OpenAPIHono<Env> {
  return new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
    .openapi(ordersListRoute, (c) => asRouteResponse(handleListOrders(c, options)))
    .openapi(orderGetRoute, (c) => asRouteResponse(handleGetOrder(c, options)))
    .openapi(orderCancelRoute, (c) => asRouteResponse(handleCancel(c, options)))
}

/**
 * Bridge a handler's plain `Promise<Response>` to the typed-response shape
 * `.openapi()` infers per route. The runtime value already honors the declared
 * schemas; this only relaxes the compile-time union.
 */
// biome-ignore lint/suspicious/noExplicitAny: intentional — bridges bare Response to the inferred typed-response union (voyant#2114)
function asRouteResponse(response: Promise<Response>): Promise<any> {
  return response
}

/**
 * Mount the full catalog booking-engine surface (both surfaces + admin
 * orders) onto an absolute-path Hono app. Mirrors the operator's previous
 * `mountCatalogBookingRoutes`, minus the cross-package snapshot/slots
 * handlers that have to stay in the deployment (cycle).
 */
/**
 * Structural mount target — just the `.route()`/`.get()` surface this function
 * uses. Decoupled from Hono's full generic signature so deployments can pass an
 * `OpenAPIHono` parent (whose default `Env` is not assignable to a bare `Hono`'s
 * via the chained-return `.fetch` variance) WITHOUT a cast — which is what makes
 * the mounted `.openapi()` sub-apps surface in the build-time OpenAPI spec
 * (voyant#2114 / voyant#2208).
 */
export interface CatalogBookingMountTarget {
  // biome-ignore lint/suspicious/noExplicitAny: intentional — accept any Env-typed sub-app/handler; the mount only composes routes (voyant#2114)
  route(path: string, app: Hono<any, any, any>): unknown
  // biome-ignore lint/suspicious/noExplicitAny: intentional — accept any Env-typed sub-app/handler; the mount only composes routes (voyant#2114)
  get(path: string, handler: (c: Context<any>) => Response | Promise<Response>): unknown
  /**
   * Register an `@hono/zod-openapi` route + handler. Accepts `any` so an
   * `OpenAPIHono` parent satisfies the target without a cast — this is what
   * surfaces the slots/catalog-snapshot legs in the build-time OpenAPI spec
   * (voyant#2114 / voyant#2208).
   */
  // biome-ignore lint/suspicious/noExplicitAny: intentional — bridges createRoute()/handler onto an OpenAPIHono parent (voyant#2114)
  openapi(route: any, handler: any): unknown
}

export const catalogBookingRoutePaths = [
  "/v1/admin/catalog/booking-sessions",
  "/v1/admin/catalog/booking-sessions/:sessionId",
  "/v1/admin/catalog/booking-sessions/:sessionId/quote",
  "/v1/admin/catalog/booking-sessions/:sessionId/hold",
  "/v1/admin/catalog/booking-sessions/:sessionId/abandon",
  "/v1/admin/catalog/booking-sessions/:sessionId/commit",
  "/v1/admin/catalog/quote",
  "/v1/admin/catalog/quotes/batch",
  "/v1/admin/catalog/drafts/:id",
  "/v1/admin/catalog/holds/place",
  "/v1/admin/catalog/holds/release",
  "/v1/admin/catalog/slots",
  "/v1/admin/catalog/orders",
  "/v1/admin/catalog/orders/:id",
  "/v1/admin/catalog/orders/:id/cancel",
  "/v1/admin/bookings/:id/catalog-snapshot",
  "/v1/public/catalog/quote",
  "/v1/public/catalog/booking-sessions",
  "/v1/public/catalog/booking-sessions/:sessionId",
  "/v1/public/catalog/booking-sessions/:sessionId/quote",
  "/v1/public/catalog/booking-sessions/:sessionId/hold",
  "/v1/public/catalog/booking-sessions/:sessionId/abandon",
  "/v1/public/catalog/booking-sessions/:sessionId/commit",
  "/v1/public/catalog/quotes/batch",
  "/v1/public/catalog/drafts/:id",
  "/v1/public/catalog/holds/place",
  "/v1/public/catalog/holds/release",
  "/v1/public/catalog/slots",
] as const

export const catalogBookingTransactionalPaths = [
  "/v1/admin/catalog/quote",
  "/v1/admin/catalog/quotes/batch",
  "/v1/admin/catalog/holds",
  "/v1/admin/catalog/orders",
  "/v1/admin/catalog/booking-sessions",
  "/v1/public/catalog/quote",
  "/v1/public/catalog/quotes/batch",
  "/v1/public/catalog/holds",
  "/v1/public/catalog/booking-sessions",
] as const

export function mountCatalogBookingRoutes(
  hono: CatalogBookingMountTarget,
  options: CatalogBookingRouteModuleOptions,
): void {
  for (const [prefix, apiId] of [
    ["/v1/admin/catalog", "@voyant-travel/catalog#booking-engine.api.admin"],
    ["/v1/public/catalog", "@voyant-travel/catalog#booking-engine.api.public"],
  ] as const) {
    hono.route(
      prefix,
      stampOpenApiRegistryApiId(createCatalogBookingRoutes(options.booking), apiId),
    )
  }

  if (options.bookingSessions) {
    hono.route(
      "/v1/admin/catalog",
      stampOpenApiRegistryApiId(
        createBookingSessionRoutes({ ...options.bookingSessions, actorKind: "staff" }),
        "@voyant-travel/catalog#booking-engine.api.admin",
      ),
    )
    hono.route(
      "/v1/public/catalog",
      stampOpenApiRegistryApiId(
        createBookingSessionRoutes({ ...options.bookingSessions, actorKind: "anonymous" }),
        "@voyant-travel/catalog#booking-engine.api.public",
      ),
    )
  }

  // Admin-only — order management (list / get / cancel).
  hono.route(
    "/v1/admin/catalog",
    stampOpenApiRegistryApiId(
      createCatalogBookingOrdersRoutes(options),
      "@voyant-travel/catalog#booking-engine.api.admin",
    ),
  )

  // List available departures / slots for a product. Drives the
  // storefront's departure-select on the product detail page —
  // customers pick from real available options, not a free-form
  // calendar (per booking-journey-architecture §10).
  for (const prefix of ["/v1/admin/catalog", "/v1/public/catalog"]) {
    const slotsRoute = createRoute({
      method: "get",
      path: `${prefix}/slots`,
      "x-voyant-api-id": prefix.startsWith("/v1/admin/")
        ? "@voyant-travel/catalog#booking-engine.api.admin"
        : "@voyant-travel/catalog#booking-engine.api.public",
      request: { query: slotsQuerySchema },
      responses: {
        200: {
          description: "Available departures / slots for a product",
          content: { "application/json": { schema: slotsResponseSchema } },
        },
        400: {
          description: "entityModule and entityId are required",
          content: { "application/json": { schema: errorResponseSchema } },
        },
      },
    })
    hono.openapi(slotsRoute, (c: Context) => asRouteResponse(handleListSlots(c, options)))
  }

  // Admin-only — read the catalog snapshot tied to a booking.
  // Backs the BookingCatalogSourceCard on the booking detail page;
  // surfaces the frozen entity reference + pricing + (optionally) the
  // captured content payload so operators can see exactly what the
  // customer was quoted at booking time.
  const catalogSnapshotRoute = createRoute({
    method: "get",
    path: "/v1/admin/bookings/{id}/catalog-snapshot",
    "x-voyant-api-id": "@voyant-travel/catalog#booking-engine.api.admin",
    request: { params: idParamSchema },
    responses: {
      200: {
        description: "Frozen catalog snapshot for a booking (+ admin-resolved labels)",
        content: { "application/json": { schema: snapshotResponseSchema } },
      },
      400: {
        description: "id is required",
        content: { "application/json": { schema: errorResponseSchema } },
      },
      404: {
        description: "snapshot_not_found — no snapshot exists for this booking",
        content: { "application/json": { schema: errorResponseSchema } },
      },
    },
  })
  hono.openapi(catalogSnapshotRoute, (c: Context) =>
    asRouteResponse(handleGetBookingSnapshot(c, options)),
  )
}

/** Package-owned descriptor for deployments that inject booking runtime dependencies. */
export function createCatalogBookingEngineApiModule(
  options: CatalogBookingRouteModuleOptions,
): ApiModule {
  return {
    module: { name: "catalog-booking" },
    publicPath: "catalog",
    anonymous: ["/booking-sessions"],
    optionalCustomerAuth: ["/booking-sessions"],
    lazyRoutes: {
      paths: catalogBookingRoutePaths,
      load: async () => {
        const hono = new OpenAPIHono()
        mountCatalogBookingRoutes(hono, options)
        return hono
      },
    },
    transactionalPaths: catalogBookingTransactionalPaths,
  }
}

// ─────────────────────────────────────────────────────────────────
// Handlers
// ─────────────────────────────────────────────────────────────────

async function handleListOrders(
  c: Context,
  options: CatalogBookingRouteModuleOptions,
): Promise<Response> {
  const db = getDb(options, c)
  const url = new URL(c.req.url)
  const bookingId = url.searchParams.get("bookingId") ?? undefined
  const entityModule = url.searchParams.get("entityModule") ?? undefined
  const sourceKindsParam = url.searchParams.get("sourceKinds")
  const sourceKinds = sourceKindsParam ? sourceKindsParam.split(",") : undefined
  const limit = Number.parseInt(url.searchParams.get("limit") ?? "50", 10)
  const offset = Number.parseInt(url.searchParams.get("offset") ?? "0", 10)

  const result = await listOrders(db, {
    bookingId,
    entityModule,
    sourceKinds,
    limit: Number.isFinite(limit) ? limit : 50,
    offset: Number.isFinite(offset) ? offset : 0,
  })
  return c.json({ rows: result.rows })
}

async function handleGetOrder(
  c: Context,
  options: CatalogBookingRouteModuleOptions,
): Promise<Response> {
  const db = getDb(options, c)
  const id = c.req.param("id")
  if (!id) return c.json({ error: "id is required" }, 400)
  const row = await getOrderById(db, id)
  if (!row) return c.json({ error: "order not found" }, 404)
  return c.json(row)
}

async function handleCancel(
  c: Context,
  options: CatalogBookingRouteModuleOptions,
): Promise<Response> {
  let body: CancelBody
  try {
    body = await c.req.json<CancelBody>()
  } catch {
    body = {}
  }

  if (!body.bookingId || !body.entityModule || !body.entityId) {
    return c.json({ error: "bookingId, entityModule, and entityId are required in the body" }, 400)
  }

  const db = getDb(options, c)
  const registry = options.resolveRegistry(c)
  const correlationId = c.req.header("x-request-id") ?? cryptoRandom()

  try {
    const result = await cancelEntity(
      db,
      { registry },
      {
        bookingId: body.bookingId,
        entityModule: body.entityModule,
        entityId: body.entityId,
        reason: body.reason,
        adapterContext: { connection_id: "engine", correlation_id: correlationId },
      },
    )
    return c.json(result)
  } catch (err) {
    return errorResponse(c, err)
  }
}

async function handleListSlots(
  c: Context,
  options: CatalogBookingRouteModuleOptions,
): Promise<Response> {
  const url = new URL(c.req.url)
  const entityModule = url.searchParams.get("entityModule")
  const entityId = url.searchParams.get("entityId")
  const scope: CatalogAvailabilitySlotsScope = {
    market: optionalQueryValue(url.searchParams.get("market")),
    locale: optionalQueryValue(url.searchParams.get("locale")),
    currency: optionalQueryValue(url.searchParams.get("currency")),
  }
  if (!entityModule || !entityId) {
    return c.json({ error: "entityModule and entityId are required" }, 400)
  }
  // Cruises + accommodations have vertical-specific scheduling
  // (sailings, rate plans) surfaced by the detail page directly off
  // their content payloads. This endpoint only serves products.
  if (entityModule !== "products") {
    return c.json({ rows: [] })
  }

  const db = getDb(options, c) as PostgresJsDatabase

  // Sourced products carry their schedule in the sourced-content
  // payload — the upstream's `getContent` is the source of truth, not
  // any owned `availability_slots` row. Owned products keep using the
  // owned table since `buildOwnedProductContent` doesn't project
  // availability_slots into scoped rows. Owned availability_slots are not
  // market-keyed today, so the injected reader owns the raw table projection.
  const sourcedEntry = await readSourcedEntry(db, "products", entityId)
  if (sourcedEntry) {
    const registry = options.resolveRegistry(c)
    const acceptHeader = c.req.header("accept-language") ?? ""
    const acceptLocales = acceptHeader
      .split(",")
      .map((s) => s.split(";")[0]?.trim())
      .filter((s): s is string => Boolean(s))
    const preferredLocales = uniqueStrings([scope.locale, ...acceptLocales])
    const resolved = await options.getProductContent(
      db,
      entityId,
      {
        preferredLocales: preferredLocales.length > 0 ? preferredLocales : ["en-GB"],
        audience: defaultAudienceForPath(c),
        market: scope.market,
        currency: scope.currency,
      },
      { registry, forceFresh: true },
    )
    const today = new Date().toISOString().slice(0, 10)
    const rows: SlotRow[] = (resolved?.content.departures ?? [])
      .filter((d) => {
        if (d.status === "sold_out" || d.status === "closed") return false
        return d.starts_at.slice(0, 10) >= today
      })
      .slice(0, 60)
      .map((d) => ({
        id: d.id,
        dateLocal: d.starts_at.slice(0, 10),
        startsAt: d.starts_at,
        endsAt: d.ends_at ?? null,
        timezone: "UTC",
        status: d.status ?? "open",
        unlimited: d.capacity == null && d.remaining == null,
        remainingPax: d.remaining ?? null,
        initialPax: d.capacity ?? null,
        nights: null,
        days: null,
      }))
    return c.json({ rows })
  }

  const today = new Date().toISOString().slice(0, 10)
  const rows = await options.listAvailabilitySlots(db, entityId, today, scope)

  return c.json({ rows })
}

function optionalQueryValue(value: string | null): string | undefined {
  const trimmed = value?.trim()
  return trimmed ? trimmed : undefined
}

function uniqueStrings(values: ReadonlyArray<string | undefined>): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of values) {
    if (!value || seen.has(value)) continue
    seen.add(value)
    result.push(value)
  }
  return result
}

function defaultAudienceForPath(c: Context): "staff" | "customer" {
  return c.req.path.startsWith("/v1/public/") ? "customer" : "staff"
}

/**
 * GET /v1/admin/bookings/:id/catalog-snapshot
 *
 * Returns the `booking_catalog_snapshot` row for this booking — the
 * frozen view of what the customer actually purchased: which entity
 * (product / cruise / accommodations), which source (owned / Bokun / Mews),
 * the quoted pricing breakdown, and the captured content payload.
 *
 * The response is **enriched server-side** with operator-friendly
 * resolved fields so the admin UI doesn't have to chase ids:
 *   - `resolved.entity.title`       — human title from the sourced
 *     projection (`name`/`title`) or the owned product's `name`.
 *   - `resolved.entity.description` — short description when present.
 *   - `resolved.entity.supplierName` — supplier label when present.
 *   - `resolved.source.label`       — friendly source name.
 *
 * Used by the booking detail page's "Catalog source" card so
 * operators see "Demo · Reykjavík Northern Lights Hunt" instead of
 * `cdmi_01kqp28138f69btmp1n15yjj7r`. Returns 404 when no snapshot
 * exists (legacy bookings).
 */
async function handleGetBookingSnapshot(
  c: Context,
  options: CatalogBookingRouteModuleOptions,
): Promise<Response> {
  const bookingId = c.req.param("id")
  if (!bookingId) return c.json({ error: "id is required" }, 400)
  const db = getDb(options, c) as PostgresJsDatabase

  const [snapshot] = await db
    .select()
    .from(bookingCatalogSnapshotTable)
    .where(eq(bookingCatalogSnapshotTable.booking_id, bookingId))
    .limit(1)

  if (!snapshot) {
    return c.json({ error: "snapshot_not_found" }, 404)
  }

  const resolved = await resolveSnapshotForAdmin(db, options, {
    entity_module: snapshot.entity_module,
    entity_id: snapshot.entity_id,
    source_kind: snapshot.source_kind,
    source_provider: snapshot.source_provider,
    frozen_payload: (snapshot.frozen_payload ?? {}) as Record<string, unknown>,
  })
  return c.json({ data: { ...snapshot, resolved } })
}

interface ResolvedSnapshotEntity {
  title: string | null
  description: string | null
  supplierName: string | null
  imageUrl: string | null
}

interface ResolvedSnapshotSource {
  label: string
  providerLabel: string | null
}

/**
 * Resolve admin-friendly labels for a booking_catalog_snapshot row.
 * Tries the sourced-entry projection first (covers demo, Bokun, etc.),
 * falls back to owned products. Returns null fields rather than
 * throwing when sources are missing — the admin UI treats nulls as
 * "fall back to id".
 */
async function resolveSnapshotForAdmin(
  db: PostgresJsDatabase,
  options: CatalogBookingRouteModuleOptions,
  snapshot: {
    entity_module: string
    entity_id: string
    source_kind: string
    source_provider: string | null
    frozen_payload: Record<string, unknown>
  },
): Promise<{ entity: ResolvedSnapshotEntity; source: ResolvedSnapshotSource }> {
  const entity: ResolvedSnapshotEntity = {
    title: null,
    description: null,
    supplierName: null,
    imageUrl: null,
  }

  // Attempt 1: sourced_entries projection. Covers demo + every
  // upstream provider that registers via the sourced-entry write path.
  try {
    const [sourced] = await db
      .select({ projection: catalogSourcedEntriesTable.projection })
      .from(catalogSourcedEntriesTable)
      .where(
        and(
          eq(catalogSourcedEntriesTable.entity_module, snapshot.entity_module),
          eq(catalogSourcedEntriesTable.entity_id, snapshot.entity_id),
        ),
      )
      .limit(1)
    if (sourced?.projection) {
      const p = sourced.projection as Record<string, unknown>
      entity.title = pickString(p.name, p.title)
      entity.description = pickString(p.description, p.summary)
      entity.supplierName = pickString(p.supplierId, p.supplier_name, p.supplierName)
      entity.imageUrl = pickString(p.heroImageUrl, p.image_url, p.imageUrl)
    }
  } catch {
    // ignore, fall through
  }

  // Attempt 2: owned products row.
  if (!entity.title && snapshot.entity_module === "products") {
    try {
      const product = await options.getOwnedProductById(db, snapshot.entity_id)
      if (product) {
        entity.title = product.name
        entity.description = product.description
      }
    } catch {
      // ignore
    }
  }

  // Attempt 3: pull from the snapshot's frozen upstream payload as
  // last resort (sourced quotes capture the upstream object inline).
  if (!entity.title) {
    const upstream = (snapshot.frozen_payload?.quote as Record<string, unknown> | undefined)
      ?.upstream_payload as Record<string, unknown> | undefined
    if (upstream) {
      entity.title = pickString(upstream.name, upstream.title)
      entity.description = pickString(upstream.description, upstream.summary)
    }
  }

  const source: ResolvedSnapshotSource = {
    label: friendlySourceLabel(snapshot.source_kind),
    providerLabel: snapshot.source_provider,
  }

  return { entity, source }
}

function pickString(...candidates: unknown[]): string | null {
  for (const c of candidates) {
    if (typeof c === "string" && c.trim().length > 0) return c
  }
  return null
}

/**
 * Map raw `source_kind` strings to the labels operators recognise.
 * "demo" → "Demo Catalog", "owned" → "Owned (this operator)", etc.
 * Anything we don't recognise comes back title-cased.
 */
function friendlySourceLabel(sourceKind: string): string {
  const map: Record<string, string> = {
    demo: "Demo Catalog",
    owned: "Owned (this operator)",
    bokun: "Bókun",
    mews: "Mews",
    fareharbor: "FareHarbor",
    rezdy: "Rezdy",
  }
  return map[sourceKind] ?? sourceKind.replace(/^./, (c) => c.toUpperCase())
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function errorResponse(c: Context, err: unknown): Response {
  if (err instanceof BookingEngineError) {
    const status = statusForCode(err.code)
    return c.json({ error: err.message, code: err.code, context: err.context }, status as never)
  }
  const message = err instanceof Error ? err.message : String(err)
  return c.json({ error: message }, 500)
}

function statusForCode(code: string): number {
  switch (code) {
    case NO_ADAPTER_REGISTERED:
    case NO_HANDLER_REGISTERED:
      return 503
    case QUOTE_NOT_FOUND:
    case ORDER_NOT_FOUND:
      return 404
    case QUOTE_EXPIRED:
    case ORDER_ALREADY_CANCELLED:
      return 409
    default:
      return 500
  }
}

function cryptoRandom(): string {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.randomUUID) {
    return globalThis.crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}
