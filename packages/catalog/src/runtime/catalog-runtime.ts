/**
 * Shared catalog-plane runtime helpers.
 *
 * Centralizes catalog indexer construction and the default slice set so both
 * request handlers and background subscribers stay aligned.
 */

import {
  createFieldPolicyRegistry,
  type FieldPolicy,
  type FieldPolicyRegistry,
} from "@voyant-travel/catalog/contract"
import type { EmbeddingProvider } from "@voyant-travel/catalog/embeddings/contract"
import { resolveOverlay } from "@voyant-travel/catalog/overlay/resolver"
import {
  CATALOG_PRESENTATION_SUBJECT_MODULES,
  getCatalogPresentationSubjectDefinition,
} from "@voyant-travel/catalog/presentation-subjects"
import { CATALOG_PROVENANCE_FIELD_POLICY } from "@voyant-travel/catalog/provenance"
import {
  buildCatalogEmbeddingProvider,
  buildCatalogSlices,
  DEFAULT_CATALOG_SLICES,
  DEFAULT_CATALOG_VERTICALS,
  withCatalogEmbedding,
  withoutCatalogScopeChannel,
} from "@voyant-travel/catalog/runtime-support"
import {
  buildIndexerDocument,
  type DocumentBuilder,
  type DocumentBuilderContext,
  type EffectiveReferencedSubjectProjection,
} from "@voyant-travel/catalog/services/indexer"
import { fetchOverlaysForEntity } from "@voyant-travel/catalog/services/overlay"
import { readSourcedEntry } from "@voyant-travel/catalog/services/sourced-entry"
import type {
  IndexerAdapter,
  IndexerDocument,
  IndexerProvider,
  IndexerSlice,
} from "@voyant-travel/catalog-contracts/indexer/contract"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import {
  isOwnedProductPublicApiListable,
  isSourcedEntryPublicApiListable,
} from "./catalog-listability.js"
import { catalogRuntimeExtensions } from "./host.js"

export const CATALOG_VERTICALS = DEFAULT_CATALOG_VERTICALS

/**
 * The slice set the operator starter indexes by default — staff (admin
 * search) + customer (storefront browse) on en-GB and the `default` market.
 * Kept in one place so the bulk-reindex CLI, the live-reindex bridge, and
 * the MCP routes never drift on which collections exist.
 */
export const DEFAULT_SLICES = DEFAULT_CATALOG_SLICES

export async function loadCatalogSlices(db: AnyDrizzleDb): Promise<IndexerSlice[]> {
  const { commerce, distribution } = catalogRuntimeExtensions()
  const [{ markets, locales }, channelIds] = await Promise.all([
    commerce.loadSliceInputs(db),
    distribution.loadActiveChannelIds(db),
  ])

  return buildCatalogSlices({
    markets,
    locales,
    channelIds: [...channelIds],
  })
}

export type CatalogRuntimeEnv = {
  VOYANT_API_KEY?: string
  VOYANT_CLOUD_API_KEY?: string
  VOYANT_CLOUD_API_URL?: string
}

export const buildEmbeddingProvider = buildCatalogEmbeddingProvider
export { withoutCatalogScopeChannel }

export function buildIndexer(
  provider: IndexerProvider | undefined,
  embeddings?: EmbeddingProvider,
): IndexerAdapter | undefined {
  return provider?.create({
    vectorDimensions: embeddings?.capabilities.dimensions,
    registries: getFieldPolicyRegistries(),
  })
}

let _registries: Map<string, FieldPolicyRegistry> | undefined
export function getFieldPolicyRegistries(): Map<string, FieldPolicyRegistry> {
  if (!_registries) {
    const { accommodations, charters, cruises, inventory } = catalogRuntimeExtensions()
    // Provenance is appended to every vertical rather than declared by each,
    // so `isSourced` means the same thing in every collection and no vertical
    // can ship a registry that silently drops it (#4089).
    const withProvenance = (policies: readonly FieldPolicy[]): FieldPolicyRegistry =>
      createFieldPolicyRegistry([...policies, ...CATALOG_PROVENANCE_FIELD_POLICY])
    _registries = new Map<string, FieldPolicyRegistry>([
      ["products", withProvenance(inventory.productFieldPolicy)],
      ["extras", withProvenance(inventory.extrasFieldPolicy)],
      [
        "cruises",
        cruises.createRegistry([...cruises.fieldPolicy, ...CATALOG_PROVENANCE_FIELD_POLICY]),
      ],
      [CATALOG_PRESENTATION_SUBJECT_MODULES.CRUISE_SHIPS, withProvenance(cruises.shipFieldPolicy)],
      ["charters", withProvenance(charters.fieldPolicy)],
      ["accommodations", withProvenance(accommodations.fieldPolicy)],
      [
        CATALOG_PRESENTATION_SUBJECT_MODULES.ACCOMMODATION_PROPERTIES,
        withProvenance(accommodations.propertyFieldPolicy),
      ],
    ])
  }
  return _registries
}

export function createProductsDocumentBuilder(
  db: AnyDrizzleDb,
  context: { sellerOperatorId: string },
): DocumentBuilder {
  const { commerce, distribution, inventory, operations } = catalogRuntimeExtensions()
  const registry = getFieldPolicyRegistries().get("products")
  return inventory.createDocumentBuilder({
    db,
    sellerOperatorId: context.sellerOperatorId,
    registry,
    extensions: [
      inventory.createPublicApiCardProjectionExtension(),
      inventory.createDestinationsProjectionExtension(),
      inventory.createTaxonomyProjectionExtension(),
      // After storefront-card so the resolved classification duration (explicit
      // minutes first, itinerary fallback) is authoritative for `durationDays`.
      inventory.createClassificationProjectionExtension(),
      operations.createDeparturesProjectionExtension(),
      commerce.createPricingProjectionExtension(),
      commerce.createPromotionsProjectionExtension(),
    ],
    isPublicAudienceListable: ({ db, product, slice }) =>
      isOwnedProductPublicApiListable({
        audience: slice.audience,
        channel: slice.channel,
        isEffectivelyPublished: () =>
          distribution.hasEffectiveProductPublication(db, product.id, slice.channel),
      }),
  })
}

export function createCruisesDocumentBuilder(
  db: AnyDrizzleDb,
  context: { sellerOperatorId: string },
): DocumentBuilder {
  const { cruises } = catalogRuntimeExtensions()
  const registry = getFieldPolicyRegistries().get("cruises")
  return cruises.createDocumentBuilder({
    db,
    sellerOperatorId: context.sellerOperatorId,
    registry,
    extensions: [cruises.createCabinFacetProjectionExtension()],
  })
}

export function createCatalogDocumentBuilder(
  db: AnyDrizzleDb,
  context: { sellerOperatorId: string },
): DocumentBuilder {
  const { accommodations, cruises } = catalogRuntimeExtensions()
  const products = createProductsDocumentBuilder(db, context)
  const cruiseEntries = createCruisesDocumentBuilder(db, context)
  const accommodationEntries = accommodations.createDocumentBuilder({
    db,
    sellerOperatorId: context.sellerOperatorId,
  })
  const shipSubjects = cruises.createShipDocumentBuilder(db)
  const propertySubjects = accommodations.createPropertyDocumentBuilder(db)
  const buildOwned = (
    entityId: string,
    slice: IndexerSlice,
    buildContext: DocumentBuilderContext,
  ): Promise<IndexerDocument | null> => {
    switch (slice.vertical) {
      case "products":
        return products(entityId, slice, buildContext)
      case "cruises":
        return cruiseEntries(entityId, slice, buildContext)
      case "cruise-ships":
        return shipSubjects(entityId, slice, buildContext)
      case "accommodations":
        return accommodationEntries(entityId, slice, buildContext)
      case "accommodation-properties":
        return propertySubjects(entityId, slice, buildContext)
      default:
        return Promise.resolve(null)
    }
  }
  return async (entityId, slice, context) => {
    const buildContext =
      context ??
      createReferencedSubjectDocumentBuilderContext(db, slice, getFieldPolicyRegistries())
    const owned = await buildOwned(entityId, slice, buildContext)
    if (owned) return owned
    // Every owned builder returns null both for "no such row" and for "not
    // listable in this slice". Only the first case can be a sourced entry —
    // owned entities never have a sourced-entry row — so the fallback cannot
    // resurrect a product its own gate just rejected.
    return buildSourcedEntryDocument(db, entityId, slice)
  }
}

/**
 * Build one sourced entry's document for a slice from its durable projection
 * capture, applying the same channel publication gate the discovery sync
 * applies at emission time.
 *
 * This is what makes `reindexEntity` correct for sourced entities. Without it
 * the owned builders answer null for every sourced id, and any reindex — a
 * publication rule change, a lifecycle sweep — would silently delete supplier
 * inventory from the staff slices instead of re-evaluating it.
 */
export async function buildSourcedEntryDocument(
  db: AnyDrizzleDb,
  entityId: string,
  slice: IndexerSlice,
): Promise<IndexerDocument | null> {
  const registry = getFieldPolicyRegistries().get(slice.vertical)
  if (!registry) return null
  const entry = await readSourcedEntry(db, slice.vertical, entityId)
  if (!entry || entry.status !== "active") return null

  const { distribution } = catalogRuntimeExtensions()
  const listable = await isSourcedEntryPublicApiListable({
    audience: slice.audience,
    channel: slice.channel,
    isEffectivelyPublished: () =>
      distribution.hasEffectiveSourcePublication(
        db,
        {
          sourceKind: entry.source_kind,
          sourceConnectionId: entry.source_connection_id,
        },
        slice.channel,
      ),
  })
  if (!listable) return null

  return buildIndexerDocument(
    registry,
    new Map(Object.entries(entry.projection)),
    slice,
    entityId,
    {
      sourceKind: entry.source_kind,
      sourceConnectionId: entry.source_connection_id,
    },
  )
}

/**
 * Resolve referenced-subject copy from Catalog's durable sourced projection
 * and active overlays. The context is internal to document construction: it is
 * never serialized into index documents or public event payloads.
 */
export function createReferencedSubjectDocumentBuilderContext(
  db: AnyDrizzleDb,
  slice: Pick<IndexerSlice, "locale" | "audience" | "market">,
  registries: ReadonlyMap<string, FieldPolicyRegistry> = getFieldPolicyRegistries(),
): DocumentBuilderContext {
  return {
    async resolveReferencedSubject(input): Promise<EffectiveReferencedSubjectProjection | null> {
      const definition = getCatalogPresentationSubjectDefinition(input.entityModule)
      if (definition?.kind !== "referenced") return null
      const registry = registries.get(input.entityModule)
      if (!registry) return null

      const sourced = input.sourceValues
        ? null
        : await readSourcedEntry(db, input.entityModule, input.entityId)
      if (sourced && sourced.status !== "active") return null
      const sourceValues = sourced
        ? new Map<string, unknown>([
            ...Object.entries(sourced.projection),
            ["id", sourced.entity_id],
            ["source.kind", sourced.source_kind],
            ["source.ref", sourced.source_ref],
          ])
        : input.sourceValues
      if (!sourceValues) return null

      const scope = input.scope ?? slice
      const overlays = await fetchOverlaysForEntity(db, input.entityModule, input.entityId)
      const resolved = resolveOverlay(registry, sourceValues, overlays, {
        locale: scope.locale,
        audience: scope.audience === "staff-admin" ? "staff" : scope.audience,
        market: scope.market,
        actor: scope.audience === "staff-admin" ? "staff" : scope.audience,
      })
      return {
        subject: { entityModule: input.entityModule, entityId: input.entityId },
        scope,
        values: resolved.values,
      }
    },
  }
}

export function withEmbedding(
  inner: DocumentBuilder,
  embeddings: EmbeddingProvider | undefined,
): DocumentBuilder {
  return withCatalogEmbedding(inner, embeddings)
}
