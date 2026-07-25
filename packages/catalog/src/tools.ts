/**
 * Catalog agent tools on the framework tool contract.
 *
 * Thin wrappers over deployment-injected catalog search/read services. The
 * catalog package owns the tool contract and audience checks; operator wiring
 * supplies the indexer and resolved-entity runtime.
 */

import type {
  IndexerSlice,
  SearchFilter,
  SearchRequest,
  SearchResults,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import {
  defineTool,
  READ_ONLY_RISK,
  requireService,
  type ToolContext,
  ToolError,
  type Visibility,
} from "@voyant-travel/tools"
import { z } from "zod"

import {
  getCatalogOrderDefinition,
  listCatalogOrdersDefinition,
  quoteCatalogEntityDefinition,
} from "./booking-tools.js"

const visibilitySchema = z.enum(["staff", "customer", "partner", "supplier"])
const searchModeSchema = z.enum(["keyword", "semantic", "hybrid"])
const searchSortSchema = z.enum(["relevance", "price-asc", "price-desc", "departure-asc", "newest"])

const indexerDocumentSchema = z.object({
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
  embeddings: z.record(z.string(), z.array(z.number())).optional(),
  embedding_model_id: z.string().optional(),
})

const searchResultsSchema = z.object({
  hits: z.array(
    z.object({
      id: z.string(),
      score: z.number(),
      document: indexerDocumentSchema,
    }),
  ),
  totalRelation: z.enum(["eq", "gte"]).optional(),
  total: z.number().int().nonnegative(),
  next_cursor: z.string().optional(),
  facets: z
    .record(
      z.string(),
      z.array(
        z.object({
          value: z.union([z.string(), z.number()]),
          count: z.number().int().nonnegative(),
        }),
      ),
    )
    .optional(),
})

const catalogEntrySchema = z.object({
  vertical: z.string(),
  id: z.string(),
  fields: z.record(z.string(), z.unknown()),
  provenance: z
    .record(
      z.string(),
      z
        .object({
          locale: z.string(),
          audience: z.string(),
          market: z.string(),
        })
        .nullable(),
    )
    .optional(),
})

const searchFilterSchema: z.ZodType<SearchFilter> = z.lazy(() =>
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
    z.object({ kind: z.literal("and"), clauses: z.array(searchFilterSchema) }),
    z.object({ kind: z.literal("or"), clauses: z.array(searchFilterSchema) }),
  ]),
)

const catalogSearchArgs = z.object({
  vertical: z.string().min(1),
  query: z.string().optional(),
  mode: searchModeSchema.default("keyword"),
  sort: searchSortSchema.optional(),
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
  locale: z.string().min(1).optional(),
  market: z.string().min(1).optional(),
  audience: visibilitySchema.optional(),
  alpha: z.number().min(0).max(1).optional(),
  distance_threshold: z.number().optional(),
  query_embedding: z.array(z.number()).optional(),
})

const getCatalogEntryArgs = z.object({
  vertical: z.string().min(1),
  id: z.string().min(1),
  locale: z.string().min(1).optional(),
  market: z.string().min(1).optional(),
  audience: visibilitySchema.optional(),
})

export type CatalogSearchArgs = z.infer<typeof catalogSearchArgs>
export type GetCatalogEntryArgs = z.infer<typeof getCatalogEntryArgs>

export interface CatalogSearchServiceInput {
  slice: IndexerSlice
  request: SearchRequest
}

export interface CatalogEntryResult {
  vertical: string
  id: string
  fields: Record<string, unknown>
  provenance?: Record<string, { locale: string; audience: string; market: string } | null>
}

export interface CatalogEntryServiceInput {
  vertical: string
  id: string
  scope: {
    locale: string
    audience: Visibility
    market: string
    actor: Visibility
  }
}

/** The catalog read surface a deployment binds into the tool context. */
export interface CatalogToolServices {
  search(input: CatalogSearchServiceInput): Promise<SearchResults>
  getEntry(input: CatalogEntryServiceInput): Promise<CatalogEntryResult | null>
}

/** Tool context with the catalog service injected. */
export type CatalogToolContext = ToolContext & { catalog?: CatalogToolServices }

function catalog(ctx: CatalogToolContext): CatalogToolServices {
  return requireService(ctx.catalog, "catalog")
}

function resolveAudience(ctx: CatalogToolContext, requested?: Visibility): Visibility {
  const audience = requested ?? ctx.audience
  if (ctx.actor === "staff" || audience === ctx.audience) return audience
  throw new ToolError(
    `Actor "${ctx.actor}" is not authorized to query audience "${audience}". Non-staff tools may only use their grant audience.`,
    "AUTHORIZATION_DENIED",
    { actor: ctx.actor, grantAudience: ctx.audience, requestedAudience: audience },
  )
}

function searchRequest(args: CatalogSearchArgs): SearchRequest {
  return {
    query: args.query ?? "",
    mode: args.mode,
    sort: args.sort,
    filters: args.filters,
    facets: args.facets,
    pagination: args.pagination,
    alpha: args.alpha,
    distance_threshold: args.distance_threshold,
    query_embedding: args.query_embedding,
  }
}

export const searchCatalogTool = defineTool<CatalogSearchArgs, SearchResults, CatalogToolContext>({
  name: "search_catalog",
  description:
    "Search a catalog vertical in one locale/audience/market slice. Returns raw index hits, total, cursor, and facets. Read-only.",
  inputSchema: catalogSearchArgs,
  outputSchema: searchResultsSchema,
  requiredScopes: ["catalog:search"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(args, ctx) {
    const audience = resolveAudience(ctx, args.audience)
    return parseJsonResult(
      searchResultsSchema,
      await catalog(ctx).search({
        slice: {
          vertical: args.vertical,
          locale: args.locale ?? ctx.resolverScope.locale,
          audience,
          market: args.market ?? ctx.resolverScope.market,
        },
        request: searchRequest(args),
      }),
    )
  },
})

export const getCatalogEntryTool = defineTool<
  GetCatalogEntryArgs,
  { entry: CatalogEntryResult | null },
  CatalogToolContext
>({
  name: "get_catalog_entry",
  description:
    "Read one resolved catalog entry by vertical and id. Returns null when not found. Read-only.",
  inputSchema: getCatalogEntryArgs,
  outputSchema: z.object({ entry: catalogEntrySchema.nullable() }),
  requiredScopes: ["catalog:read"],
  tier: "read",
  riskPolicy: READ_ONLY_RISK,
  async handler(args, ctx) {
    const audience = resolveAudience(ctx, args.audience)
    const entry = await catalog(ctx).getEntry({
      vertical: args.vertical,
      id: args.id,
      scope: {
        locale: args.locale ?? ctx.resolverScope.locale,
        audience,
        market: args.market ?? ctx.resolverScope.market,
        actor: ctx.actor,
      },
    })
    return parseJsonResult(z.object({ entry: catalogEntrySchema.nullable() }), {
      entry: entry ?? null,
    })
  },
})

/** All catalog agent tools, ready to register on a `ToolRegistry`. */
export const quoteCatalogEntityTool = defineTool(quoteCatalogEntityDefinition)
export const listCatalogOrdersTool = defineTool(listCatalogOrdersDefinition)
export const getCatalogOrderTool = defineTool(getCatalogOrderDefinition)

export const catalogBookingTools = [
  quoteCatalogEntityTool,
  listCatalogOrdersTool,
  getCatalogOrderTool,
] as const

export const catalogTools = [searchCatalogTool, getCatalogEntryTool] as const

function parseJsonResult<T extends z.ZodType>(schema: T, value: unknown): z.output<T> {
  return schema.parse(toJsonValue(value))
}

function toJsonValue(value: unknown): unknown {
  if (value instanceof Date) return value.toISOString()
  if (Array.isArray(value)) return value.map(toJsonValue)
  if (typeof value !== "object" || value === null) return value
  return Object.fromEntries(
    Object.entries(value)
      .map(([key, nested]) => [key, toJsonValue(nested)] as const)
      .filter(([, nested]) => nested !== undefined),
  )
}
