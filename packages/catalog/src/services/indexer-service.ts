/**
 * IndexerService — higher-level wrapper around an `IndexerAdapter` that
 * handles the cross-slice orchestration verticals actually need:
 *
 *   - Targeted reindex of one entity across all configured slices.
 *   - Targeted reindex narrowed to a single `(locale, audience, market)`
 *     when an editorial overlay change has narrow scope.
 *   - Deletion across all slices for the same entity.
 *   - `ensureCollections` at deployment startup.
 *   - Search delegation to the underlying adapter.
 *
 * Templates configure the service with their actual slice set (which
 * `(locale, audience, market)` combinations the deployment serves) and the
 * IndexerAdapter implementation (Typesense by default).
 *
 * See `docs/architecture/catalog-architecture.md` §5.4 for the design.
 */

import type {
  IndexerAdapter,
  IndexerDocument,
  IndexerSlice,
  SearchRequest,
  SearchResults,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import type { FieldPolicy, FieldPolicyRegistry } from "../contract.js"
import type { EntityOverlayChangedPayload } from "../events/taxonomy.js"
import {
  type CatalogDocumentProvenance,
  OWNED_DOCUMENT_PROVENANCE,
  provenanceProjectionEntries,
} from "../provenance.js"

/**
 * Options for constructing an IndexerService.
 */
export interface IndexerServiceOptions {
  /** The underlying IndexerAdapter implementation. */
  adapter: IndexerAdapter
  /**
   * The `(vertical, locale, audience, market)` slices this deployment
   * materializes. Default deployments have ~2 slices per vertical per
   * locale; scale-stage deployments have more.
   */
  slices: IndexerSlice[]
  /**
   * Per-vertical field-policy registries, keyed by `entity_module`.
   * `ensureCollections` and document-emission paths consult the relevant
   * registry to know what to index and how.
   */
  registries: ReadonlyMap<string, FieldPolicyRegistry>
}

/**
 * Builder function the service calls per slice when reindexing — produces
 * the `IndexerDocument` for a particular entity in a particular slice.
 *
 * Verticals supply this via their `DocumentEmitter` (see
 * `@voyant-travel/catalog-contracts/indexer/contract`); the service is
 * engine-agnostic.
 */
export type DocumentBuilder = (
  entityId: string,
  slice: IndexerSlice,
  context?: DocumentBuilderContext,
) => Promise<IndexerDocument | null>

export type ReferencedSubjectScope = Pick<IndexerSlice, "locale" | "audience" | "market">

export interface ReferencedSubjectResolutionInput {
  entityModule: string
  entityId: string
  /** Defaults to the slice currently being built. */
  scope?: ReferencedSubjectScope
  /**
   * Canonical source values for an owned subject that has no sourced-entry
   * row. The subject-owning policy registry still governs visibility and
   * overlay resolution; callers do not merge overlays themselves.
   */
  sourceValues?: ReadonlyMap<string, unknown>
}

export interface EffectiveReferencedSubjectProjection {
  subject: CatalogReverseReference
  scope: ReferencedSubjectScope
  /** Canonical, policy-filtered source + overlay projection for this slice. */
  values: ReadonlyMap<string, unknown>
}

/**
 * Optional per-build services. Existing two-argument document builders remain
 * valid; builders that denormalize referenced subjects can resolve their
 * effective projection without importing the subject-owning vertical.
 */
export interface DocumentBuilderContext {
  resolveReferencedSubject(
    input: ReferencedSubjectResolutionInput,
  ): Promise<EffectiveReferencedSubjectProjection | null>
}

/**
 * The IndexerService surface.
 */
export interface IndexerService {
  /**
   * Ensure every configured slice has its engine-side schema set up.
   * Called at deployment startup or after a field-policy registry change.
   */
  ensureCollections(): Promise<void>

  /**
   * Reindex one entity across **all** slices configured for its vertical.
   * Used when a source projection update affects all variant combinations
   * (e.g. a managed-class field changes).
   */
  reindexEntity(
    entityModule: string,
    entityId: string,
    builder: DocumentBuilder,
    context?: DocumentBuilderContext,
  ): Promise<void>

  /**
   * Reindex one entity for **one specific slice only**. Used when an
   * editorial overlay change has narrow scope (one locale × audience ×
   * market) and rebuilding all slices would be wasteful.
   */
  reindexEntityForSlice(
    slice: IndexerSlice,
    entityId: string,
    builder: DocumentBuilder,
    context?: DocumentBuilderContext,
  ): Promise<void>

  /**
   * Delete one entity from every slice configured for its vertical. Used by
   * the source-disconnect cleanup pipeline (§5.10.3) and for hard entity
   * deletions.
   */
  deleteEntity(entityModule: string, entityId: string): Promise<void>

  /**
   * Search delegation — pass-through to the underlying adapter.
   */
  search(slice: IndexerSlice, request: SearchRequest): Promise<SearchResults>

  /**
   * Returns the slices configured for a given vertical. Useful for callers
   * orchestrating bulk operations themselves.
   */
  slicesForVertical(entityModule: string): IndexerSlice[]
}

/**
 * Create the service from its options. Pure construction — no IO until
 * methods are called.
 */
export function createIndexerService(options: IndexerServiceOptions): IndexerService {
  const { adapter, slices, registries } = options

  const slicesForVertical = (entityModule: string): IndexerSlice[] =>
    slices.filter((slice) => slice.vertical === entityModule)

  const requireRegistry = (entityModule: string): FieldPolicyRegistry => {
    const registry = registries.get(entityModule)
    if (!registry) {
      throw new Error(
        `IndexerService: no field-policy registry registered for vertical "${entityModule}"`,
      )
    }
    return registry
  }

  return {
    async ensureCollections() {
      for (const slice of slices) {
        const registry = requireRegistry(slice.vertical)
        await adapter.ensureCollection(slice, registry)
      }
    },

    async reindexEntity(entityModule, entityId, builder, context) {
      const verticalSlices = slicesForVertical(entityModule)
      for (const slice of verticalSlices) {
        const document = await builder(entityId, slice, context)
        if (!document) {
          await adapter.delete(slice, [entityId])
          continue
        }
        await adapter.upsert(slice, [document])
      }
    },

    async reindexEntityForSlice(slice, entityId, builder, context) {
      const document = await builder(entityId, slice, context)
      if (!document) {
        await adapter.delete(slice, [entityId])
        return
      }
      await adapter.upsert(slice, [document])
    },

    async deleteEntity(entityModule, entityId) {
      const verticalSlices = slicesForVertical(entityModule)
      for (const slice of verticalSlices) {
        await adapter.delete(slice, [entityId])
      }
    },

    async search(slice, request) {
      return adapter.search(slice, request)
    },

    slicesForVertical,
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Document construction
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Build an `IndexerDocument` from a field-keyed projection, filtered by:
 *   - Visibility — for storefront slices (`customer` / `partner` / `supplier`),
 *     only fields whose policy `visibility[]` includes the slice audience.
 *     For admin slices (the `staff-admin` sentinel), all fields visible to
 *     any audience are included so the admin search document carries the
 *     cross-audience denormalized text described in architecture §5.4.4.
 *   - Queryability — `blob-only` fields are skipped (stored on the entity row
 *     but not indexed). `indexed-column` and `first-class-table` fields land
 *     in the document.
 *
 * Field paths ending in `[]` (lists) are renamed to drop the suffix so the
 * indexer schema field names match (`gallery[]` → `gallery`).
 *
 * Pure logic — no IO. Sync emitters use this directly; async builders wrap
 * it with row-fetching.
 *
 * Used by every vertical's `DocumentEmitter` implementation.
 */
export function buildIndexerDocument(
  registry: FieldPolicyRegistry,
  projection: ReadonlyMap<string, unknown>,
  slice: IndexerSlice,
  entityId: string,
  provenance: CatalogDocumentProvenance = OWNED_DOCUMENT_PROVENANCE,
): IndexerDocument {
  const fields: Record<string, unknown> = {}
  // Provenance is stamped here rather than by each vertical's emitter because
  // this is the one funnel every document passes through, owned or sourced.
  // It still goes through the registry filter below, so audience visibility is
  // decided by policy like any other field.
  //
  // Stamped last so it wins: the projection is adapter-supplied data, and a
  // supplier payload carrying its own `sourceKind` must not be able to
  // overwrite the provenance we routed the entry by and claim to be owned.
  const entries = [...projection, ...provenanceProjectionEntries(provenance)]
  for (const [path, value] of entries) {
    let policy = registry.resolve(path)
    let policyPath = path
    if (!policy && Array.isArray(value)) {
      const listPath = `${path}[]`
      policy = registry.resolve(listPath)
      policyPath = listPath
    }
    if (!policy) continue
    if (!shouldIndexInDocument(policy, slice.audience)) continue
    const fieldName = policyPath.endsWith("[]") ? policyPath.slice(0, -2) : policyPath
    fields[fieldName] = value
  }
  return { id: entityId, fields }
}

function shouldIndexInDocument(policy: FieldPolicy, audience: IndexerSlice["audience"]): boolean {
  // Skip blob-only fields — they're stored on the entity row, not indexed.
  if (policy.query === "blob-only") return false

  // Admin slices carry cross-audience text (§5.4.4) — include any field
  // visible to any audience. The admin search document is queryable only
  // by staff actors so cross-audience denormalization is safe here.
  if (audience === "staff-admin") {
    return policy.visibility.length > 0
  }

  // Storefront slices: only fields visible to that specific audience.
  return policy.visibility.includes(audience as never)
}

// ─────────────────────────────────────────────────────────────────────────────
// Referenced subject fan-out
// ─────────────────────────────────────────────────────────────────────────────

export interface CatalogReverseReference {
  entityModule: string
  entityId: string
}

export interface CatalogReverseReferenceReader {
  subjectModule: string
  listReferencingEntries(
    subjectId: string,
    scope: Pick<EntityOverlayChangedPayload, "locale" | "audience" | "market">,
  ): Promise<readonly CatalogReverseReference[]>
}

export interface ReferencedSubjectReindexFanoutOptions {
  readers: readonly CatalogReverseReferenceReader[]
  reindexSubject?: (
    subject: CatalogReverseReference,
    scope: Pick<EntityOverlayChangedPayload, "locale" | "audience" | "market">,
  ) => Promise<void>
  reindexReferencingEntry: (
    reference: CatalogReverseReference,
    scope: Pick<EntityOverlayChangedPayload, "locale" | "audience" | "market">,
  ) => Promise<void>
}

export function createReferencedSubjectReindexFanout(
  options: ReferencedSubjectReindexFanoutOptions,
): (event: EntityOverlayChangedPayload) => Promise<readonly CatalogReverseReference[]> {
  const readersBySubject = new Map(options.readers.map((reader) => [reader.subjectModule, reader]))

  return async (event) => {
    const scope = { locale: event.locale, audience: event.audience, market: event.market }
    await options.reindexSubject?.(
      { entityModule: event.entity_module, entityId: event.entity_id },
      scope,
    )

    const reader = readersBySubject.get(event.entity_module)
    if (!reader) return []

    const references = await reader.listReferencingEntries(event.entity_id, scope)
    for (const reference of references) {
      await options.reindexReferencingEntry(reference, scope)
    }
    return references
  }
}
