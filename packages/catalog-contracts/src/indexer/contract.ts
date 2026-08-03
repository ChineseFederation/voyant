/**
 * Engine-agnostic contract for the catalog plane's search index.
 *
 * Storefront documents are scoped per `(vertical, locale, audience, market,
 * channel)`. Admin documents denormalize text fields across audiences for
 * keyword matching while admin embeddings remain audience-scoped.
 */

import type { FieldPolicyRegistry, Visibility } from "../contract.js"

/**
 * Verticals that exist as catalog-plane field policies purely so their parent
 * can freeze a provenance/booking snapshot — never as independently sellable
 * inventory.
 *
 * An Extra is lifecycle-dependent on the Product Booking that carries it: it is
 * authored on the Product Plan / Product Option, selected during Booking, and
 * fulfilled on the Departure. It is therefore never indexed, never browsable,
 * and never returned as a standalone search result. An addition that must be
 * independently confirmed, cancelled, taxed, fulfilled, or supported is a
 * Product / Component Booking under a Trip Envelope, not an Extra.
 *
 * Keyed by vertical, valued by the vertical that owns and sells it.
 */
export const PRODUCT_OWNED_VERTICALS: Readonly<Record<string, string>> = Object.freeze({
  extras: "products",
})

/** True when the vertical is owned by a parent vertical and never sold on its own. */
export function isProductOwnedVertical(vertical: string): boolean {
  return Object.hasOwn(PRODUCT_OWNED_VERTICALS, vertical)
}

/** The vertical that owns and sells a product-owned vertical, if any. */
export function owningVerticalFor(vertical: string): string | undefined {
  return PRODUCT_OWNED_VERTICALS[vertical]
}

/** Identifies a single variant slice of an indexer collection. */
export interface IndexerSlice {
  vertical: string
  locale: string
  audience: Visibility | "staff-admin"
  market: string
  /**
   * Sales surface / distribution channel id. Omitted only for legacy/default
   * slices.
   */
  channel?: string
}

/** One document in the search index. */
export interface IndexerDocument {
  /** Document id, typically the entity id. */
  id: string
  /**
   * Values keyed by engine-neutral index field name. Index field names preserve
   * policy paths except for a terminal list marker (`tags[]` becomes `tags`).
   */
  fields: Record<string, unknown>
  /** Optional embeddings keyed by their index field name. */
  embeddings?: Record<string, number[]>
  /** Embedding model identifier used to prevent mixed-model comparisons. */
  embedding_model_id?: string
}

/** Convert a field-policy path to its engine-neutral index field name. */
export function indexFieldNameForPolicyPath(path: string): string {
  return path.endsWith("[]") ? path.slice(0, -2) : path
}

/** Search query mode. */
export type SearchMode = "keyword" | "semantic" | "hybrid"

/** Portable storefront sort options. */
export type SearchSortOption = "relevance" | "price-asc" | "price-desc" | "departure-asc" | "newest"

export type SearchSortDirection = "asc" | "desc"

export interface SearchSortSemantics {
  /** Ordered policy paths. The first field present and visible in the slice wins. */
  fieldCandidates: readonly string[]
  direction: SearchSortDirection
}

/**
 * Canonical engine-neutral meaning of every portable sort option. Relevance is
 * provider-native and therefore has no field candidates; all other options
 * resolve deterministically against the vertical's field-policy registry.
 */
export const SEARCH_SORT_SEMANTICS = {
  relevance: { fieldCandidates: [], direction: "desc" },
  "price-asc": {
    fieldCandidates: ["priceFromAmountCents", "sellAmountCents"],
    direction: "asc",
  },
  "price-desc": {
    fieldCandidates: ["priceFromAmountCents", "sellAmountCents"],
    direction: "desc",
  },
  "departure-asc": {
    fieldCandidates: ["nextDepartureDate", "nextDepartureAt", "startDateEpochDays", "startDate"],
    direction: "asc",
  },
  newest: {
    fieldCandidates: ["publishedAt", "createdAt"],
    direction: "desc",
  },
} as const satisfies Record<SearchSortOption, SearchSortSemantics>

export interface ResolvedSearchSort {
  field: string
  direction: SearchSortDirection
}

/** Resolve a portable sort to the first policy-backed field visible in a slice. */
export function resolveSearchSort(
  sort: SearchSortOption | undefined,
  registry: FieldPolicyRegistry,
  slice?: IndexerSlice,
): ResolvedSearchSort | undefined {
  if (!sort || sort === "relevance") return undefined
  const semantics = SEARCH_SORT_SEMANTICS[sort]
  const field = semantics.fieldCandidates.find((candidate) => {
    const policy = registry.resolve(candidate)
    if (!policy || policy.query === "blob-only") return false
    return !slice || slice.audience === "staff-admin" || policy.visibility.includes(slice.audience)
  })
  return field ? { field, direction: semantics.direction } : undefined
}

/** Pagination shape. Cursors are opaque to callers. */
export interface SearchPagination {
  cursor?: string
  limit?: number
}

/**
 * Portable filter expression translated by each engine adapter. The reserved
 * `id` field addresses {@link IndexerDocument.id}; other fields address
 * {@link IndexerDocument.fields}.
 */
export type SearchFilter =
  | { kind: "eq"; field: string; value: string | number | boolean }
  | { kind: "in"; field: string; values: ReadonlyArray<string | number> }
  | { kind: "range"; field: string; gte?: number; lte?: number }
  | { kind: "and"; clauses: SearchFilter[] }
  | { kind: "or"; clauses: SearchFilter[] }

/** Portable maximum used for omitted and oversized facet bucket limits. */
export const MAX_FACET_BUCKETS = 250

/** Validate and resolve an optional portable facet bucket limit. */
export function resolveFacetBucketLimit(limit: number | undefined): number {
  if (limit === undefined) return MAX_FACET_BUCKETS
  if (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0) {
    throw new RangeError(`Facet limit must be a positive finite integer; received ${String(limit)}`)
  }
  return Math.min(limit, MAX_FACET_BUCKETS)
}

/** A single facet aggregation request. */
export interface FacetRequest {
  field: string
  /**
   * Positive finite integer bucket limit. Omitted and larger values use
   * {@link MAX_FACET_BUCKETS}; invalid explicit values must be rejected.
   */
  limit?: number
}

export interface SearchRequest {
  /** Free-text query. Empty string means match everything subject to filters. */
  query: string
  /** Optional caller-supplied query embedding. */
  query_embedding?: number[]
  /** Embedding model id for `query_embedding`. */
  query_embedding_model_id?: string
  mode: SearchMode
  sort?: SearchSortOption
  filters?: SearchFilter[]
  facets?: FacetRequest[]
  pagination?: SearchPagination
  /** Staff-only cross-audience federation. */
  search_audiences?: Visibility[]
  /** Hybrid vector-signal weight: `0` is keyword-only and `1` is vector-only. */
  alpha?: number
  /** Maximum cosine distance accepted for vector results. */
  distance_threshold?: number
}

export interface SearchHit {
  id: string
  /**
   * Provider relevance where larger values rank first within this response.
   * Scores from independently executed searches are not comparable.
   */
  score: number
  /** Indexed id and fields. Providers may omit stored embeddings from search payloads. */
  document: IndexerDocument
}

export interface SearchFacetBucket {
  value: string | number
  count: number
}

export interface SearchResults {
  hits: SearchHit[]
  /**
   * Count of matching documents represented by `total`. Omitted is equivalent
   * to `eq`; `gte` means `total` is a lower bound from a bounded search.
   */
  totalRelation?: "eq" | "gte"
  total: number
  next_cursor?: string
  facets?: Record<string, SearchFacetBucket[]>
}

/** Features declared by an index engine implementation. */
export interface IndexerCapabilities {
  /** Accepts keyword requests and applies the non-empty query text. */
  supportsKeywordSearch: boolean
  /** Blends keyword and vector ranking signals according to `alpha` for hybrid requests. */
  supportsHybridSearch: boolean
  /** Stores document embeddings and ranks semantic requests by query-vector similarity. */
  supportsVectorFields: boolean
  /** Required vector dimension, or null when vector fields are unsupported. */
  vectorDimensions: number | null
  /** Engine vector count limit per document, or null when unlimited. */
  maxVectorsPerDocument: number | null
  /** Honors `search_audiences` through one `adapter.search(...)` call. */
  supportsCrossAudienceFederation: boolean
  /** Indexes and keyword-searches cross-audience fields in `staff-admin` documents. */
  supportsAdminDenormalization: boolean
}

/** Engine-neutral inputs supplied by catalog runtime composition. */
export interface IndexerProviderOptions {
  registries: ReadonlyMap<string, FieldPolicyRegistry>
  /** Embedding dimension selected by the deployment, or null when disabled. */
  vectorDimensions?: number | null
}

/**
 * Deployment-owned factory for an index engine adapter. Provider setup may be
 * asynchronous, but request-runtime adapter construction is synchronous.
 */
export interface IndexerProvider {
  create(options: IndexerProviderOptions): IndexerAdapter
}

export interface IndexerScanOptions {
  /** Preferred provider page/batch size. Providers may enforce their own cap. */
  batchSize?: number
}

/**
 * Optional operational surface for deployment tooling. Keeping these methods
 * together prevents lifecycle and maintenance concerns from becoming required
 * search-adapter methods.
 */
export interface IndexerAdmin {
  /** List the slices currently managed by this adapter. */
  list(): Promise<IndexerSlice[]>
  /** Drop one slice. Returns false when it did not exist. */
  drop(slice: IndexerSlice): Promise<boolean>
  /** Stream every document in a slice without materializing the collection. */
  scan(slice: IndexerSlice, options?: IndexerScanOptions): AsyncIterable<IndexerDocument>
}

/**
 * One indexer implementation per deployment. Verticals push documents through
 * the adapter; storefront and admin search query through it.
 */
export interface IndexerAdapter {
  capabilities: IndexerCapabilities

  /** Optional lifecycle and maintenance operations for deployment tooling. */
  admin?: IndexerAdmin

  /** Set up or migrate the engine-side schema for one slice. */
  ensureCollection(slice: IndexerSlice, registry: FieldPolicyRegistry): Promise<void>

  /** Upsert one or more documents into a slice. */
  upsert(slice: IndexerSlice, documents: IndexerDocument[]): Promise<void>

  /** Delete documents from a slice by id. */
  delete(slice: IndexerSlice, ids: string[]): Promise<void>

  /** Search a slice with the portable request shape. */
  search(slice: IndexerSlice, request: SearchRequest): Promise<SearchResults>

  /** Bulk-index a stream of documents for cold starts and migrations. */
  bulkReindex(
    slice: IndexerSlice,
    stream: AsyncIterable<IndexerDocument>,
    options?: {
      forceReembed?: boolean
      /**
       * Stable identity for one authoritative source snapshot. Reuse it only
       * when resuming that same snapshot after an interrupted stream; provide
       * a new value when the source has changed.
       */
      rebuildRunId?: string
    },
  ): Promise<void>
}

/** Converts a vertical source row into an index document. */
export interface DocumentEmitter<TSource = unknown> {
  vertical: string
  emit(source: TSource, slice: IndexerSlice): IndexerDocument
}
