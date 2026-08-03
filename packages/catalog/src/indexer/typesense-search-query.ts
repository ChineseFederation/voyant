import {
  type IndexerSlice,
  indexFieldNameForPolicyPath,
  resolveFacetBucketLimit,
  resolveSearchSort,
  type SearchFilter,
  type SearchRequest,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import type { FieldPolicyRegistry } from "../contract.js"

export interface TypesenseSearchQuery {
  q: string
  query_by: string
  filter_by?: string
  facet_by?: string
  max_facet_values?: number
  sort_by?: string
  per_page?: number
  page?: number
  vector_query?: string
  prefix?: boolean
  exclude_fields?: string
  drop_tokens_threshold?: number
}

/**
 * Translates the catalog plane's `SearchRequest` into a Typesense query.
 * Converts the filter expression tree, the audience-scoped query, and the
 * pagination shape.
 */
export function buildSearchQuery(
  request: SearchRequest,
  registry: FieldPolicyRegistry,
  slice?: IndexerSlice,
): TypesenseSearchQuery {
  const perPage = Math.min(Math.max(Math.floor(request.pagination?.limit ?? 20), 1), 250)
  // Cursor doubles as the 1-indexed page number for Typesense's `page`
  // parameter. Callers wanting a different cursor strategy (e.g. opaque
  // cursor for streaming results) write a different adapter.
  const page = parsePageCursor(request.pagination?.cursor) ?? 1

  const query: TypesenseSearchQuery = {
    q: request.mode === "semantic" || request.query.length === 0 ? "*" : request.query,
    query_by: buildDefaultTypesenseQueryBy(registry, slice),
    per_page: perPage,
    page,
    // Strip the vector field from response payloads. At e.g. 3072-dim that's
    // roughly 12 KB per hit of float-array noise the caller never reads.
    exclude_fields: "text_embedding,embedding_model_id",
  }

  const filters: string[] = []
  if (request.filters && request.filters.length > 0) {
    filters.push(serializeFilters(request.filters))
  }

  if (request.facets && request.facets.length > 0) {
    query.facet_by = request.facets.map((f) => normalizeTypesenseField(f.field)).join(",")
    // Typesense applies one shared cap to every requested facet. Fetch enough
    // for the largest portable request, then apply each facet's limit while
    // mapping the response.
    query.max_facet_values = Math.max(
      ...request.facets.map(({ limit }) => resolveFacetBucketLimit(limit)),
    )
  }

  const resolvedSort = resolveSearchSort(request.sort, registry, slice)
  if (resolvedSort) {
    query.sort_by = `${resolvedSort.field}:${resolvedSort.direction}`
  }

  // Hybrid / semantic mode: attach the vector query if an embedding was
  // provided. The actual embedding generation for the query string lives in
  // the search/semantic helper (Phase 2); this adapter just relays it.
  if ((request.mode === "hybrid" || request.mode === "semantic") && request.query_embedding) {
    // Ground the ANN search against a candidate pool larger than `per_page`
    // so caller-side pagination has actual results to walk through. Typesense
    // resolves `max(k, per_page)` per the docs, so we lift the floor.
    const k = Math.max(perPage * 10, 100)
    const vectorOpts: string[] = [`k:${k}`]
    if (request.alpha != null) vectorOpts.push(`alpha:${request.alpha}`)
    if (request.distance_threshold != null) {
      vectorOpts.push(`distance_threshold:${request.distance_threshold}`)
    }
    query.vector_query = `text_embedding:([${request.query_embedding.join(",")}], ${vectorOpts.join(", ")})`
    if (request.query_embedding_model_id) {
      filters.push(`embedding_model_id:=${quoteString(request.query_embedding_model_id)}`)
    }
  }

  if (filters.length > 0) {
    query.filter_by = filters.filter(Boolean).join(" && ")
  }

  // For multi-token hybrid queries, the docs warn that the default
  // `drop_tokens_threshold` (10) leads to redundant internal keyword
  // re-runs. Disable token drop entirely for short catalog queries.
  if (request.mode === "hybrid" && request.query.length > 0) {
    query.drop_tokens_threshold = 0
  }

  return query
}

/**
 * Returns the policy-owned default text fields for Typesense keyword search.
 * Hosted Typesense-compatible proxies can use this as their server-side
 * fallback when callers omit `query_by`, avoiding client-side schema scraping.
 */
export function buildDefaultTypesenseSearchFields(
  registry: FieldPolicyRegistry,
  slice?: IndexerSlice,
): string[] {
  return registry.policies
    .filter((policy) => isDefaultSearchablePolicy(policy, slice))
    .map((policy) => normalizeTypesenseField(policy.path))
}

export function buildDefaultTypesenseQueryBy(
  registry: FieldPolicyRegistry,
  slice?: IndexerSlice,
): string {
  const fields = buildDefaultTypesenseSearchFields(registry, slice)
  return fields.length > 0 ? fields.join(",") : "title"
}

export function typesenseTypeForField(
  name: string,
  isList: boolean,
): "string" | "string[]" | "int32" | "int64" | "float" | "bool" | "object" | "float[]" {
  if (isList) return "string[]"
  if (BOOLEAN_FIELD_NAMES.has(name) || /^(has|is)[A-Z]/.test(name)) return "bool"
  if (FLOAT_FIELD_NAMES.has(name) || /(Latitude|Longitude)$/.test(name)) return "float"
  if (
    INTEGER_FIELD_NAMES.has(name) ||
    INTEGER_FIELD_SUFFIXES.some((suffix) => name.endsWith(suffix))
  ) {
    return "int64"
  }
  return "string"
}

export function isTypesenseSortableStringField(field: string): boolean {
  return SORTABLE_STRING_FIELD_NAMES.has(field)
}

function parsePageCursor(cursor: string | undefined): number | undefined {
  if (!cursor) return undefined
  const n = Number(cursor)
  return Number.isFinite(n) && n >= 1 ? Math.floor(n) : undefined
}

function serializeFilters(filters: SearchFilter[]): string {
  return filters.map(serializeFilter).filter(Boolean).join(" && ")
}

function serializeFilter(filter: SearchFilter): string {
  switch (filter.kind) {
    case "eq":
      return `${normalizeTypesenseField(filter.field)}:=${typeof filter.value === "string" ? quoteString(filter.value) : filter.value}`
    case "in":
      return `${normalizeTypesenseField(filter.field)}:[${filter.values.map((v) => (typeof v === "string" ? quoteString(v) : v)).join(",")}]`
    case "range": {
      const parts: string[] = []
      const field = normalizeTypesenseField(filter.field)
      if (filter.gte != null) parts.push(`${field}:>=${filter.gte}`)
      if (filter.lte != null) parts.push(`${field}:<=${filter.lte}`)
      return parts.join(" && ")
    }
    case "and":
      return filter.clauses.map(serializeFilter).join(" && ")
    case "or":
      return `(${filter.clauses.map(serializeFilter).join(" || ")})`
  }
}

function quoteString(value: string): string {
  return JSON.stringify(value)
}

function normalizeTypesenseField(field: string): string {
  return indexFieldNameForPolicyPath(field)
}

function isDefaultSearchablePolicy(
  policy: FieldPolicyRegistry["policies"][number],
  slice: IndexerSlice | undefined,
): boolean {
  if (policy.query !== "indexed-column") return false
  if (policy.class !== "merchandisable" && policy.class !== "structural") return false
  if (!isVisibleInSlice(policy.visibility, slice)) return false

  const field = normalizeTypesenseField(policy.path)
  return isTextSearchableField(field) && !isNonSearchTextField(field)
}

function isVisibleInSlice(
  visibility: FieldPolicyRegistry["policies"][number]["visibility"],
  slice: IndexerSlice | undefined,
): boolean {
  if (!slice || slice.audience === "staff-admin") return true
  return visibility.includes(slice.audience)
}

function isTextSearchableField(name: string): boolean {
  const type = typesenseTypeForField(name, false)
  return type === "string" || type === "string[]"
}

function isNonSearchTextField(name: string): boolean {
  return SORTABLE_STRING_FIELD_NAMES.has(name) || NON_SEARCH_TEXT_FIELD_RE.test(name)
}

const BOOLEAN_FIELD_NAMES = new Set(["activated"])

const FLOAT_FIELD_NAMES = new Set(["latitude", "longitude"])

const INTEGER_FIELD_NAMES = new Set(["pax"])

const INTEGER_FIELD_SUFFIXES = [
  "AmountCents",
  "Percent",
  "Count",
  "Days",
  "EpochDays",
  "EpochMs",
  "Minutes",
  "Total",
]

const SORTABLE_STRING_FIELD_NAMES = new Set([
  "createdAt",
  "endDate",
  "nextDepartureAt",
  "nextDepartureDate",
  "nextDepartureEndsAt",
  "nextDepartureEndDate",
  "publishedAt",
  "startDate",
])

// Machine-readable identifiers and markup that would otherwise be swept into
// the default `query_by` set because they happen to be typed `string`. A
// timezone is a frame declaration ("Europe/Bucharest"), not prose — keyword
// searches for "Europe" must not match every product in that zone.
const NON_SEARCH_TEXT_FIELD_RE = /(?:^|\.)(?:.*Url|.*Uri|.*Href|.*Html|.*Markdown|.*Timezone)$/i
