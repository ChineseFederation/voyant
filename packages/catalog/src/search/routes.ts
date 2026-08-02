// agent-quality: file-size exception -- search routes keep schemas, public guard, and admin preview behavior together for OpenAPI generation.
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import type {
  IndexerAdapter,
  IndexerSlice,
  SearchFilter,
  SearchMode,
  SearchRequest,
  SearchResults,
  SearchSortOption,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import { openApiValidationHook } from "@voyant-travel/hono"
import type { ApiModule } from "@voyant-travel/hono/module"
import type { Context, Hono as HonoApp } from "hono"

const searchModeSchema = z.enum(["keyword", "semantic", "hybrid"])
const searchSortSchema = z.enum(["relevance", "price-asc", "price-desc", "departure-asc", "newest"])
const searchProjectionSchema = z.enum(["raw", "storefront-card"])
// Registered as a named component (`.openapi(...)`) so zod-to-openapi emits a
// `$ref` for the recursive `and`/`or` clauses instead of inlining and blowing
// the stack on the self-reference.
const searchFilterSchema: z.ZodType<SearchFilter> = z
  .lazy(() =>
    z.union([
      z.object({
        kind: z.literal("eq"),
        field: z.string().min(1),
        value: z.union([z.string(), z.number(), z.boolean()]),
      }),
      z.object({
        kind: z.literal("in"),
        field: z.string().min(1),
        values: z.array(z.union([z.string(), z.number()])),
      }),
      z.object({
        kind: z.literal("range"),
        field: z.string().min(1),
        gte: z.number().optional(),
        lte: z.number().optional(),
      }),
      z.object({
        kind: z.literal("and"),
        clauses: z.array(searchFilterSchema),
      }),
      z.object({
        kind: z.literal("or"),
        clauses: z.array(searchFilterSchema),
      }),
    ]),
  )
  .openapi("CatalogSearchFilter")

const catalogSearchBodySchema = z.object({
  vertical: z.string().min(1).optional(),
  query: z.string().optional(),
  mode: searchModeSchema.optional(),
  sort: searchSortSchema.optional(),
  projection: searchProjectionSchema.optional(),
  filters: z.array(searchFilterSchema).optional(),
  facets: z
    .array(z.object({ field: z.string().min(1), limit: z.number().int().positive().optional() }))
    .optional(),
  pagination: z
    .object({
      limit: z.number().int().positive().optional(),
      cursor: z.string().optional(),
    })
    .optional(),
  alpha: z.number().optional(),
  distance_threshold: z.number().optional(),
  query_embedding: z.array(z.number()).optional(),
  market: z.string().min(1).optional(),
  locale: z.string().min(1).optional(),
  channel: z.string().min(1).optional(),
})

export type CatalogSearchBody = z.infer<typeof catalogSearchBodySchema>
export type CatalogSearchProjection = z.infer<typeof searchProjectionSchema>
export type CatalogSearchSort = SearchSortOption

// ─────────────────────────────────────────────────────────────────
// OpenAPI route + response schemas (voyant#2114 / voyant#2208).
//
// The request schema reuses `catalogSearchBodySchema` (what the handler already
// parses). Response schemas are authored here from the handler's literal return
// shape — `hits` mirror the `IndexerDocument` contract, `cards` the
// `StorefrontCatalogCard` projection (present only when
// `projection: "storefront-card"`), `facets` the engine bucket map.
//
// Mounted on both admin + public surfaces, so `/search` appears under
// `/v1/admin/catalog/*` AND `/v1/public/catalog/*` (dual-surface).
// ─────────────────────────────────────────────────────────────────

const errorResponseSchema = z.object({ error: z.string() })

const searchHitSchema = z.object({
  id: z.string(),
  score: z.number(),
  document: z.object({
    id: z.string(),
    fields: z.record(z.string(), z.unknown()),
    embeddings: z.record(z.string(), z.array(z.number())).optional(),
    embedding_model_id: z.string().optional(),
  }),
})

const searchFacetBucketSchema = z.object({
  value: z.union([z.string(), z.number()]),
  count: z.number(),
})

const storefrontCardTaxonSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
})

const storefrontCardOfferSchema = z.object({
  id: z.string().nullable(),
  name: z.string().nullable(),
  discountKind: z.string().nullable(),
  discountPercent: z.number().nullable(),
  discountAmountCents: z.number().nullable(),
  minPax: z.number().nullable().optional(),
})

const storefrontCatalogCardSchema = z.object({
  id: z.string(),
  name: z.string().nullable(),
  slug: z.string().nullable(),
  primaryCategory: storefrontCardTaxonSchema.nullable(),
  media: z.object({
    thumbnailUrl: z.string().nullable(),
    coverMediaUrl: z.string().nullable(),
  }),
  priceFrom: z
    .object({
      amountCents: z.number(),
      currency: z.string().nullable(),
      originalAmountCents: z.number().nullable(),
    })
    .nullable(),
  offerBadges: z.array(storefrontCardOfferSchema),
  departures: z.object({
    upcomingCount: z.number().nullable(),
    nextDepartureAt: z.string().nullable(),
    nextDepartureDate: z.string().nullable(),
    months: z.array(z.string()),
    dates: z.array(z.string()),
  }),
  destinations: z.object({
    regions: z.array(z.string()),
    countries: z.array(z.string()),
    cities: z.array(z.string()),
    ids: z.array(z.string()),
    slugs: z.array(z.string()),
  }),
  coordinates: z
    .object({
      latitude: z.number(),
      longitude: z.number(),
    })
    .nullable(),
})

const searchResponseSchema = z.object({
  vertical: z.string(),
  mode: searchModeSchema,
  total: z.number(),
  totalRelation: z.enum(["eq", "gte"]).optional(),
  next_cursor: z.string().optional(),
  hits: z.array(searchHitSchema),
  cards: z.array(storefrontCatalogCardSchema).optional(),
  facets: z.record(z.string(), z.array(searchFacetBucketSchema)),
})

const searchRoute = createRoute({
  method: "post",
  path: "/search",
  request: {
    body: {
      required: true,
      content: { "application/json": { schema: catalogSearchBodySchema } },
    },
  },
  responses: {
    200: {
      description: "Search results for the requested vertical slice",
      content: { "application/json": { schema: searchResponseSchema } },
    },
    400: {
      description: "invalid_request — body failed validation, or `vertical` is missing",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    403: {
      description: "Public storefront channel context is missing or inactive",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    500: {
      description: "Search execution failed",
      content: { "application/json": { schema: errorResponseSchema } },
    },
    503: {
      description: "Search indexer is not configured for this deployment",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

export interface StorefrontCatalogCard {
  id: string
  name: string | null
  slug: string | null
  primaryCategory: StorefrontCatalogCardTaxon | null
  media: {
    thumbnailUrl: string | null
    coverMediaUrl: string | null
  }
  priceFrom: {
    amountCents: number
    currency: string | null
    originalAmountCents: number | null
  } | null
  offerBadges: StorefrontCatalogCardOffer[]
  departures: {
    upcomingCount: number | null
    nextDepartureAt: string | null
    nextDepartureDate: string | null
    months: string[]
    dates: string[]
  }
  destinations: {
    regions: string[]
    countries: string[]
    cities: string[]
    ids: string[]
    slugs: string[]
  }
  coordinates: {
    latitude: number
    longitude: number
  } | null
}

export interface StorefrontCatalogCardTaxon {
  id: string | null
  name: string | null
  slug: string | null
}

export interface StorefrontCatalogCardOffer {
  id: string | null
  name: string | null
  discountKind: string | null
  discountPercent: number | null
  discountAmountCents: number | null
  minPax?: number | null
}

export interface CatalogSearchRuntime {
  indexer?: IndexerAdapter
  /**
   * Template-owned embedding provider. Kept intentionally unknown so
   * deployments can decide whether semantic search is enabled.
   */
  embeddings?: unknown
  defaultScope: {
    locale: string
    audience: IndexerSlice["audience"]
    market: string
    channel?: string
  }
}

export interface CatalogSearchExecuteInput {
  c: Context
  adapter: IndexerAdapter
  embeddings?: unknown
  slice: IndexerSlice
  request: SearchRequest
}

export interface CatalogSearchFallbackInput extends CatalogSearchExecuteInput {
  error: unknown
}

export interface CatalogSearchRoutesOptions {
  resolveRuntime(c: Context): CatalogSearchRuntime
  /**
   * Optional semantic/hybrid executor. Templates that use
   * `@voyant-travel/catalog/search/semantic` should pass `executeSemanticSearch` here.
   * Without this hook, the route delegates directly to `adapter.search`.
   */
  executeSearch?(input: CatalogSearchExecuteInput): Promise<SearchResults>
  /**
   * Retry semantic/hybrid requests as keyword when embedding generation or
   * vector search fails. Defaults to true to preserve the operator starter's
   * "best available search mode" behavior.
   */
  fallbackToKeywordOnSearchError?: boolean | ((input: CatalogSearchFallbackInput) => boolean)
  /** Public route audience. Defaults to the customer projection. */
  publicAudience?: IndexerSlice["audience"]
  /** Admin route audience. Defaults to the runtime default scope audience. */
  adminAudience?: IndexerSlice["audience"]
  indexerUnavailableMessage?: string
}

export type CatalogSearchSurface = "admin" | "public"

export interface CatalogSearchRoutesWithSurfaceOptions extends CatalogSearchRoutesOptions {
  surface: CatalogSearchSurface
}

export function createCatalogSearchRoutes(
  options: CatalogSearchRoutesWithSurfaceOptions,
): OpenAPIHono {
  // `handleSearch` branches across the declared statuses (200/400/500/503) and
  // returns a plain `Response`; `.openapi()` infers a typed-response union the
  // bare `Response` doesn't structurally satisfy, so bridge it. Runtime payloads
  // honor the declared schemas (asserted by the contract tests).
  return new OpenAPIHono({ defaultHook: openApiValidationHook }).openapi(
    searchRoute,
    // biome-ignore lint/suspicious/noExplicitAny: intentional — bridges bare Response to the inferred typed-response union (voyant#2114)
    async (c): Promise<any> => handleSearch(c, options, c.req.valid("json")),
  )
}

export function createCatalogSearchApiModule(options: CatalogSearchRoutesOptions): ApiModule {
  return {
    module: { name: "catalog" },
    adminRoutes: createCatalogSearchRoutes({ ...options, surface: "admin" }),
    publicRoutes: createCatalogSearchRoutes({ ...options, surface: "public" }),
    optionalCustomerAuth: true,
  }
}

export function mountCatalogSearchRoutes(hono: HonoApp, options: CatalogSearchRoutesOptions): void {
  hono.route("/v1/admin/catalog", createCatalogSearchRoutes({ ...options, surface: "admin" }))
  hono.route("/v1/public/catalog", createCatalogSearchRoutes({ ...options, surface: "public" }))
}

async function handleSearch(
  c: Context,
  options: CatalogSearchRoutesWithSurfaceOptions,
  body: CatalogSearchBody,
): Promise<Response> {
  if (!body.vertical) return c.json({ error: "vertical is required" }, 400)

  const runtime = options.resolveRuntime(c)
  const indexer = runtime.indexer
  if (!indexer) {
    return c.json(
      {
        error:
          options.indexerUnavailableMessage ??
          "Search indexer is not configured for this deployment.",
      },
      503,
    )
  }

  const requestedMode = body.mode ?? "hybrid"
  const mode =
    shouldUseEmbeddingMode(requestedMode) && !runtime.embeddings && !body.query_embedding
      ? "keyword"
      : requestedMode
  const channel = resolveChannel(c, options, runtime, body)
  if (options.surface === "public" && !channel) {
    return c.json({ error: "Public storefront channel context is required." }, 403)
  }
  const slice: IndexerSlice = {
    vertical: body.vertical,
    locale: body.locale ?? runtime.defaultScope.locale,
    audience: resolveAudience(options, runtime),
    market: body.market ?? runtime.defaultScope.market,
    channel,
  }
  const request = buildSearchRequest(body, mode)

  try {
    const { results, responseMode } = await executeWithKeywordFallback(c, options, {
      adapter: indexer,
      embeddings: runtime.embeddings,
      slice,
      request,
    })
    return c.json({
      vertical: body.vertical,
      mode: responseMode,
      total: results.total,
      totalRelation: results.totalRelation,
      next_cursor: results.next_cursor,
      hits: results.hits,
      cards:
        body.projection === "storefront-card"
          ? results.hits.map((hit) => projectStorefrontCatalogCard(hit.document))
          : undefined,
      facets: results.facets ?? {},
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return c.json({ error: message }, 500)
  }
}

function resolveAudience(
  options: CatalogSearchRoutesWithSurfaceOptions,
  runtime: CatalogSearchRuntime,
): IndexerSlice["audience"] {
  if (options.surface === "public") return options.publicAudience ?? "customer"
  return options.adminAudience ?? runtime.defaultScope.audience
}

function resolveChannel(
  c: Context,
  options: CatalogSearchRoutesWithSurfaceOptions,
  runtime: CatalogSearchRuntime,
  body: CatalogSearchBody,
): string | undefined {
  if (options.surface === "public") {
    const storefrontChannel = c.get("storefrontChannel" as never) as
      | { channelId?: string | null; channelStatus?: string | null }
      | undefined
    if (storefrontChannel?.channelStatus !== "active") return undefined
    return storefrontChannel.channelId ?? undefined
  }
  if (body.channel) return body.channel
  return runtime.defaultScope.channel
}

function buildSearchRequest(body: CatalogSearchBody, mode: SearchMode): SearchRequest {
  return {
    query: body.query ?? "",
    mode,
    sort: body.sort,
    filters: body.filters,
    facets: body.facets,
    pagination: body.pagination,
    alpha: body.alpha,
    distance_threshold: body.distance_threshold,
    query_embedding: body.query_embedding,
  }
}

async function executeWithKeywordFallback(
  c: Context,
  options: CatalogSearchRoutesWithSurfaceOptions,
  input: Omit<CatalogSearchExecuteInput, "c">,
): Promise<{ results: SearchResults; responseMode: SearchMode }> {
  const executeSearch = options.executeSearch ?? defaultExecuteSearch
  const executeInput = { c, ...input }
  try {
    return {
      results: await executeSearch(executeInput),
      responseMode: input.request.mode,
    }
  } catch (error) {
    if (!shouldRetryAsKeyword(options, executeInput, error)) throw error

    const keywordRequest: SearchRequest = {
      ...input.request,
      mode: "keyword",
      query_embedding: undefined,
    }
    return {
      results: await executeSearch({ ...executeInput, request: keywordRequest }),
      responseMode: "keyword",
    }
  }
}

function shouldRetryAsKeyword(
  options: CatalogSearchRoutesWithSurfaceOptions,
  input: CatalogSearchExecuteInput,
  error: unknown,
): boolean {
  if (!shouldUseEmbeddingMode(input.request.mode)) return false
  const fallback = options.fallbackToKeywordOnSearchError ?? true
  if (typeof fallback === "function") return fallback({ ...input, error })
  return fallback
}

function shouldUseEmbeddingMode(mode: SearchMode): boolean {
  return mode === "semantic" || mode === "hybrid"
}

async function defaultExecuteSearch(input: CatalogSearchExecuteInput): Promise<SearchResults> {
  return input.adapter.search(input.slice, input.request)
}

function projectStorefrontCatalogCard(
  document: SearchResults["hits"][number]["document"],
): StorefrontCatalogCard {
  const fields = document.fields
  const priceAmount = numberField(fields, "priceFromAmountCents", "sellAmountCents")
  const latitude = numberField(fields, "latitude")
  const longitude = numberField(fields, "longitude")

  return {
    id: document.id,
    name: stringField(fields, "name", "title"),
    slug: stringField(fields, "slug"),
    primaryCategory: taxonFromFields(fields),
    media: {
      thumbnailUrl: stringField(fields, "thumbnailUrl", "primaryMediaUrl", "coverMediaUrl"),
      coverMediaUrl: stringField(fields, "coverMediaUrl", "primaryMediaUrl", "thumbnailUrl"),
    },
    priceFrom:
      priceAmount == null
        ? null
        : {
            amountCents: priceAmount,
            currency: stringField(fields, "priceFromCurrency", "sellCurrency"),
            originalAmountCents: numberField(fields, "originalPriceFromAmountCents"),
          },
    offerBadges: offerBadgesFromFields(fields),
    departures: {
      upcomingCount: numberField(
        fields,
        "upcomingDepartureCount",
        "availableDeparturesCount",
        "availableUnitsTotal",
      ),
      nextDepartureAt: stringField(fields, "nextDepartureAt"),
      nextDepartureDate: stringField(fields, "nextDepartureDate"),
      months: stringArrayField(fields, "departureMonths"),
      dates: stringArrayField(fields, "departureDates"),
    },
    destinations: {
      regions: stringArrayField(fields, "regions"),
      countries: stringArrayField(fields, "countries"),
      cities: stringArrayField(fields, "cities"),
      ids: stringArrayField(fields, "destinationIds"),
      slugs: stringArrayField(fields, "destinationSlugs"),
    },
    coordinates:
      latitude == null || longitude == null
        ? null
        : {
            latitude,
            longitude,
          },
  }
}

function taxonFromFields(fields: Record<string, unknown>): StorefrontCatalogCardTaxon | null {
  const id = stringField(fields, "primaryCategoryId", "categoryIds")
  const name = stringField(fields, "primaryCategoryName", "categories", "categoryNames")
  const slug = stringField(fields, "primaryCategorySlug", "categorySlugs")
  if (!id && !name && !slug) return null
  return { id, name, slug }
}

function offerBadgesFromFields(fields: Record<string, unknown>): StorefrontCatalogCardOffer[] {
  const badges: StorefrontCatalogCardOffer[] = []
  if (booleanField(fields, "hasOffer")) {
    badges.push({
      id: stringField(fields, "bestOfferId"),
      name: stringField(fields, "bestOfferName"),
      discountKind: stringField(fields, "bestOfferDiscountKind"),
      discountPercent: numberField(fields, "bestOfferDiscountPercent"),
      discountAmountCents: numberField(fields, "bestOfferDiscountAmountCents"),
    })
  }
  if (booleanField(fields, "hasConditionalOffer")) {
    badges.push({
      id: stringField(fields, "conditionalOfferId"),
      name: stringField(fields, "conditionalOfferName"),
      discountKind: stringField(fields, "conditionalOfferDiscountKind"),
      discountPercent: numberField(fields, "conditionalOfferDiscountPercent"),
      discountAmountCents: numberField(fields, "conditionalOfferDiscountAmountCents"),
      minPax: numberField(fields, "conditionalOfferMinPax"),
    })
  }
  return badges
}

function stringField(fields: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = fieldValue(fields, key)
    if (typeof value === "string" && value.length > 0) return value
    if (Array.isArray(value)) {
      const first = value.find((item) => typeof item === "string" && item.length > 0)
      if (typeof first === "string") return first
    }
  }
  return null
}

function stringArrayField(fields: Record<string, unknown>, key: string): string[] {
  const value = fieldValue(fields, key)
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === "string" && item.length > 0)
}

function numberField(fields: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = fieldValue(fields, key)
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string" && value.trim().length > 0) {
      const parsed = Number(value)
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function booleanField(fields: Record<string, unknown>, key: string): boolean {
  const value = fieldValue(fields, key)
  return value === true || value === "true"
}

function fieldValue(fields: Record<string, unknown>, key: string): unknown {
  if (key in fields) return fields[key]
  const collectionKey = `${key}[]`
  if (collectionKey in fields) return fields[collectionKey]
  return undefined
}
