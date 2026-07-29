import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi"
import { openApiValidationHook } from "@voyant-travel/hono"
import { listResponseSchema } from "@voyant-travel/types"
import type { KVStore } from "@voyant-travel/utils/cache"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import {
  buildProductReadModelDoc,
  productDocKey,
  productDocVariant,
  readThroughProductDoc,
  readThroughSlugMapping,
} from "./read-model.js"
import { publicProductsService } from "./service-public.js"
import {
  publicCatalogCategoryListQuerySchema,
  publicCatalogDestinationListQuerySchema,
  publicCatalogItinerarySchema,
  publicCatalogProductListQuerySchema,
  publicCatalogProductLookupBySlugQuerySchema,
  publicCatalogTagListQuerySchema,
} from "./validation-public.js"
import { booleanQueryParam } from "./validation-shared.js"

type Env = {
  Bindings: {
    /** Optional KV namespace backing the product-detail read model. */
    CACHE?: KVStore
  }
  Variables: {
    db: PostgresJsDatabase
    userId?: string
  }
}

/** The KV binding is optional — deployments without it serve live. */
function readModelKv(c: Context<Env>): KVStore | undefined {
  return c.env?.CACHE
}

/**
 * Parse the `?include=itinerary` opt-in (comma-separated, forward-compatible)
 * into the read-model query flag that folds the default itinerary into the
 * document (issue voyant#2910).
 */
function readModelQuery(query: { languageTag?: string | null; include?: string | null }) {
  const includeItinerary = (query.include ?? "")
    .split(",")
    .map((token) => token.trim())
    .includes("itinerary")
  // Only carry the flag when opted in, so the default document query keeps its
  // existing `{ languageTag }` shape (and variant key) unchanged.
  return {
    languageTag: query.languageTag ?? undefined,
    ...(includeItinerary ? { includeItinerary: true } : {}),
  }
}

/**
 * Shared edge/CDN policy for the public catalog reads. These endpoints are
 * not personalized (they never read the authenticated identity), so a
 * fifteen-minute shared TTL keeps catalog browsing off application computes
 * long enough for serverless databases to suspend between real changes.
 * Availability, bookings, customer sessions, and payments use separate routes
 * and are deliberately outside this policy.
 * Applied per-handler on successful responses only — a framework-level
 * cache middleware lives in `@voyant-travel/hono` and supersedes this later.
 */
const PUBLIC_CACHE_CONTROL = "public, s-maxage=900, stale-while-revalidate=3600"

function setPublicCacheHeaders(c: Context) {
  c.header("Cache-Control", PUBLIC_CACHE_CONTROL)
}

/**
 * Pagination guard for public list endpoints: clamps out-of-range or
 * malformed `limit` values to `[1, maxLimit]` instead of rejecting the
 * request, so no public list can run unbounded (#1686).
 */
function clampedLimitParam(defaultLimit: number, maxLimit: number) {
  return (
    z.coerce
      .number()
      .int()
      .default(defaultLimit)
      .catch(defaultLimit)
      .transform((value) => Math.min(Math.max(value, 1), maxLimit))
      // `.catch()`/`.transform()` (clamping) can't be introspected by
      // zod-to-openapi, so pin the documented param type explicitly (voyant#2114).
      .openapi({ type: "integer", example: defaultLimit })
  )
}

const PRODUCT_LIST_DEFAULT_LIMIT = 20
const PUBLIC_LIST_MAX_LIMIT = 100

const trimmedProductListQuerySchema = publicCatalogProductListQuerySchema.extend({
  limit: clampedLimitParam(PRODUCT_LIST_DEFAULT_LIMIT, PUBLIC_LIST_MAX_LIMIT),
  /**
   * The list payload excludes heavy richtext content (`inclusionsHtml`,
   * `exclusionsHtml`, `termsHtml`, full-length `description`) by default.
   * `?includeContent=true` opts back into the full content shape.
   */
  includeContent: booleanQueryParam.optional(),
})

const clampedCategoryListQuerySchema = publicCatalogCategoryListQuerySchema.extend({
  limit: clampedLimitParam(PUBLIC_LIST_MAX_LIMIT, PUBLIC_LIST_MAX_LIMIT),
})

const clampedTagListQuerySchema = publicCatalogTagListQuerySchema.extend({
  limit: clampedLimitParam(PUBLIC_LIST_MAX_LIMIT, PUBLIC_LIST_MAX_LIMIT),
})

const clampedDestinationListQuerySchema = publicCatalogDestinationListQuerySchema.extend({
  limit: clampedLimitParam(PUBLIC_LIST_MAX_LIMIT, PUBLIC_LIST_MAX_LIMIT),
})

/** Wire shape of a public catalog tag (voyant#2114). */
export const publicCatalogTagSchema = z.object({
  id: z.string(),
  name: z.string(),
})

const listTagsRoute = createRoute({
  method: "get",
  path: "/tags",
  request: { query: clampedTagListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of public catalog tags",
      content: { "application/json": { schema: listResponseSchema(publicCatalogTagSchema) } },
    },
  },
})

/** Wire shape of a public catalog category (voyant#2114). */
export const publicCatalogCategorySchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  name: z.string(),
  slug: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
})

const listCategoriesRoute = createRoute({
  method: "get",
  path: "/categories",
  request: { query: clampedCategoryListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of public catalog categories",
      content: { "application/json": { schema: listResponseSchema(publicCatalogCategorySchema) } },
    },
  },
})

/** Wire shape of a public catalog destination — the translated DTO (voyant#2114). */
export const publicCatalogDestinationSchema = z.object({
  id: z.string(),
  parentId: z.string().nullable(),
  slug: z.string(),
  canonicalPlaceId: z.string().nullable(),
  name: z.string(),
  description: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  destinationType: z.string(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  sortOrder: z.number().int(),
})

const listDestinationsRoute = createRoute({
  method: "get",
  path: "/destinations",
  request: { query: clampedDestinationListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of public catalog destinations",
      content: {
        "application/json": { schema: listResponseSchema(publicCatalogDestinationSchema) },
      },
    },
  },
})

/** A hydrated public catalog media item (cover, gallery, or brochure). */
const publicCatalogMediaSchema = z.object({
  id: z.string(),
  mediaType: z.string(),
  name: z.string(),
  url: z.string(),
  mimeType: z.string().nullable(),
  width: z.number().int().nullable(),
  height: z.number().int().nullable(),
  altText: z.string().nullable(),
  sortOrder: z.number().int(),
  isCover: z.boolean(),
  isOpenGraph: z.boolean(),
  isBrochure: z.boolean(),
  isBrochureCurrent: z.boolean(),
  brochureVersion: z.number().int().nullable(),
})

const publicCatalogProductTypeSchema = z.object({
  id: z.string(),
  code: z.string(),
  name: z.string(),
  description: z.string().nullable(),
})

const publicCatalogLocationSchema = z.object({
  id: z.string(),
  locationType: z.string(),
  title: z.string(),
  address: z.string().nullable(),
  city: z.string().nullable(),
  countryCode: z.string().nullable(),
  latitude: z.number().nullable(),
  longitude: z.number().nullable(),
  sortOrder: z.number().int(),
})

const publicCatalogFeatureSchema = z.object({
  id: z.string(),
  featureType: z.string(),
  title: z.string(),
  description: z.string().nullable(),
  sortOrder: z.number().int(),
})

const publicCatalogFaqSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  sortOrder: z.number().int(),
})

/**
 * Wire shape of a hydrated public catalog product (voyant#2114). One schema
 * covers both the list (summary) and detail responses: the heavy `media`,
 * `brochure`, `features`, and `faqs` are detail-only (`includeContent`), so
 * they're optional; the richtext fields are nulled in the summary.
 */
export const publicCatalogProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  inclusionsHtml: z.string().nullable(),
  exclusionsHtml: z.string().nullable(),
  termsHtml: z.string().nullable(),
  contentLanguageTag: z.string().nullable(),
  slug: z.string().nullable(),
  shortDescription: z.string().nullable(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  bookingMode: z.string(),
  capacityMode: z.string(),
  visibility: z.string(),
  sellCurrency: z.string(),
  sellAmountCents: z.number().int().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  pax: z.number().int().nullable(),
  contractTemplateId: z.string().nullable(),
  productType: publicCatalogProductTypeSchema.nullable(),
  categories: z.array(publicCatalogCategorySchema),
  tags: z.array(publicCatalogTagSchema),
  destinations: z.array(publicCatalogDestinationSchema),
  locations: z.array(publicCatalogLocationSchema),
  capabilities: z.array(z.string()),
  coverMedia: publicCatalogMediaSchema.nullable(),
  isFeatured: z.boolean(),
  // Detail-only (`includeContent`):
  media: z.array(publicCatalogMediaSchema).optional(),
  brochure: publicCatalogMediaSchema.nullable().optional(),
  openGraphImage: publicCatalogMediaSchema.nullable().optional(),
  features: z.array(publicCatalogFeatureSchema).optional(),
  faqs: z.array(publicCatalogFaqSchema).optional(),
  // Present only when requested via `?include=itinerary` (voyant#2910).
  itinerary: publicCatalogItinerarySchema.nullable().optional(),
})

const errorResponseSchema = z.object({ error: z.string() })

const listProductsRoute = createRoute({
  method: "get",
  path: "/",
  request: { query: trimmedProductListQuerySchema },
  responses: {
    200: {
      description: "Paginated list of public catalog products",
      content: { "application/json": { schema: listResponseSchema(publicCatalogProductSchema) } },
    },
  },
})

const productBySlugRoute = createRoute({
  method: "get",
  path: "/slug/{slug}",
  request: {
    params: z.object({ slug: z.string() }),
    query: publicCatalogProductLookupBySlugQuerySchema,
  },
  responses: {
    200: {
      description: "A public catalog product by slug",
      content: { "application/json": { schema: z.object({ data: publicCatalogProductSchema }) } },
    },
    404: {
      description: "Catalog product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const productByIdRoute = createRoute({
  method: "get",
  path: "/{id}",
  request: {
    params: z.object({ id: z.string() }),
    query: publicCatalogProductLookupBySlugQuerySchema,
  },
  responses: {
    200: {
      description: "A public catalog product by id",
      content: { "application/json": { schema: z.object({ data: publicCatalogProductSchema }) } },
    },
    404: {
      description: "Catalog product not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

const productBrochureRoute = createRoute({
  method: "get",
  path: "/{id}/brochure",
  request: {
    params: z.object({ id: z.string() }),
    query: publicCatalogProductLookupBySlugQuerySchema,
  },
  responses: {
    200: {
      description: "A product's current brochure media",
      content: { "application/json": { schema: z.object({ data: publicCatalogMediaSchema }) } },
    },
    404: {
      description: "Catalog product brochure not found",
      content: { "application/json": { schema: errorResponseSchema } },
    },
  },
})

// `.openapi()` is declared first: `OpenAPIHono#get` returns the base `Hono`
// type (honojs/middleware#637), so it cannot precede an `.openapi()` in the
// chain; it stays ahead of the `/:id` catch-all so `/tags` still matches first.
export const publicProductRoutes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  .openapi(listTagsRoute, async (c) => {
    const result = await publicProductsService.listCatalogTags(c.get("db"), c.req.valid("query"))
    setPublicCacheHeaders(c)
    return c.json(result, 200)
  })
  .openapi(listCategoriesRoute, async (c) => {
    const result = await publicProductsService.listCatalogCategories(
      c.get("db"),
      c.req.valid("query"),
    )
    setPublicCacheHeaders(c)
    return c.json(result, 200)
  })
  .openapi(listDestinationsRoute, async (c) => {
    const result = await publicProductsService.listCatalogDestinations(
      c.get("db"),
      c.req.valid("query"),
    )
    setPublicCacheHeaders(c)
    return c.json(result, 200)
  })
  .openapi(listProductsRoute, async (c) => {
    const result = await publicProductsService.listCatalogProducts(
      c.get("db"),
      c.req.valid("query"),
    )
    setPublicCacheHeaders(c)
    return c.json(result, 200)
  })
  .openapi(productBySlugRoute, async (c) => {
    const query = c.req.valid("query")
    const kv = readModelKv(c)
    const slug = c.req.valid("param").slug
    const docQuery = readModelQuery(query)

    // Resolve slug → id through the short-lived KV mapping. The mapping only
    // depends on the locale (not itinerary inclusion), so key it by the
    // locale-only variant and let both `?include` variants share it.
    const requestedVariant = productDocVariant({ languageTag: docQuery.languageTag })
    const resolution = await readThroughSlugMapping(kv, slug, requestedVariant, async () => {
      const row = await publicProductsService.getCatalogProductBySlug(c.get("db"), slug, query)
      const productId = row ? ((row as { id?: string }).id ?? null) : null
      if (!productId) return null
      return {
        productId,
        languageTag:
          (row as { contentLanguageTag?: string | null }).contentLanguageTag ??
          query.languageTag ??
          null,
      }
    })
    if (!resolution) {
      return c.json({ error: "Catalog product not found" }, 404)
    }

    const detailQuery = {
      ...docQuery,
      languageTag: resolution.languageTag ?? docQuery.languageTag,
    }

    const { data } = await readThroughProductDoc(
      kv,
      productDocKey(resolution.productId, productDocVariant(detailQuery)),
      () => buildProductReadModelDoc(c.get("db"), resolution.productId, detailQuery),
    )
    if (!data) {
      return c.json({ error: "Catalog product not found" }, 404)
    }

    setPublicCacheHeaders(c)
    return c.json({ data }, 200)
  })
  .openapi(productByIdRoute, async (c) => {
    const docQuery = readModelQuery(c.req.valid("query"))
    const productId = c.req.valid("param").id
    const { data } = await readThroughProductDoc(
      readModelKv(c),
      productDocKey(productId, productDocVariant(docQuery)),
      () => buildProductReadModelDoc(c.get("db"), productId, docQuery),
    )

    if (!data) {
      return c.json({ error: "Catalog product not found" }, 404)
    }

    setPublicCacheHeaders(c)
    return c.json({ data }, 200)
  })
  .openapi(productBrochureRoute, async (c) => {
    const row = await publicProductsService.getCatalogProductBrochure(
      c.get("db"),
      c.req.valid("param").id,
      c.req.valid("query"),
    )

    if (!row) {
      return c.json({ error: "Catalog product brochure not found" }, 404)
    }

    setPublicCacheHeaders(c)
    return c.json({ data: row }, 200)
  })

export type PublicProductRoutes = typeof publicProductRoutes
