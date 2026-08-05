// agent-quality: file-size exception -- owner: inventory; existing service module stays co-located until a dedicated split preserves behavior and tests.
/**
 * Catalog-plane integration for the products service.
 *
 * Adds catalog-aware service methods alongside the existing `productsService`
 * surface in `service.ts`. Routes opt in: the original `getProductById` /
 * `listProducts` continue to return raw DB rows; the methods here return
 * resolved CatalogEntry views with overlays + visibility filtering applied.
 *
 * Existing service code is untouched. Migration is per-route, gradual.
 *
 * Naming note: this file is `service-catalog-plane.ts` (not `service-catalog.ts`)
 * because the existing `service-catalog.ts` handles the products module's own
 * catalog management (categories, tags, types). The "catalog plane" is the
 * cross-vertical projection / overlay / snapshot infrastructure from
 * `@voyant-travel/catalog`.
 *
 * See `docs/architecture/catalog-architecture.md` §9.1 for the integration
 * pattern this file establishes (replicated for cruises, accommodations, etc.
 * in their own service-catalog-plane.ts files).
 */

import {
  buildIndexerDocument,
  buildSnapshotInputFromView,
  type CaptureSnapshotInput,
  createFieldPolicyRegistry,
  type DocumentBuilder,
  type DocumentBuilderContext,
  type DocumentEmitter,
  type FieldPolicy,
  type FieldPolicyRegistry,
  fetchOverlaysForEntities,
  type IndexerDocument,
  type IndexerSlice,
  type PricingBasis,
  type Provenance,
  type ResolvedView,
  type ResolverScope,
  resolveEntityView,
  resolveEntityViewWithOverlays,
  type Visibility,
} from "@voyant-travel/catalog"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { facilities, properties } from "@voyant-travel/operations"
import { asc, eq, sql } from "drizzle-orm"

import { productCatalogPolicy } from "./catalog-policy.js"
import { resolveProductClassification } from "./classification.js"
import { type Product, products } from "./schema-core.js"
import { productDays, productItineraries, productMedia } from "./schema-itinerary.js"
import { productLocations, productTranslations } from "./schema-settings.js"
import type { productBookingModeEnum } from "./schema-shared.js"
import { productTypes } from "./schema-taxonomy.js"

type ProductBookingMode = (typeof productBookingModeEnum.enumValues)[number]

export type ProductDocumentListabilityPredicate = (input: {
  db: AnyDrizzleDb
  product: Product
  slice: IndexerSlice
}) => boolean | Promise<boolean>

/**
 * Lazy-initialized registry. Built once per process; the field-policy file
 * is static so this is safe to memoize.
 */
let _registry: FieldPolicyRegistry | undefined
function getProductsRegistry(): FieldPolicyRegistry {
  if (!_registry) {
    _registry = createFieldPolicyRegistry(productCatalogPolicy)
  }
  return _registry
}

/**
 * Maps a product row to a field-keyed projection consumable by the catalog
 * resolver. Field paths match the policy registry declarations in
 * `catalog-policy.ts`.
 *
 * Provenance fields (`source.kind`, `source.ref`, `seller.operator_id`) are
 * synthesized: today's products module models operator-owned inventory
 * exclusively, so `source.kind = "owned"` and `source.ref = undefined`.
 * When sourced products land (e.g. via Voyant Connect), this helper picks
 * up the provenance from a parallel provenance row instead.
 */
export function productRowToProjection(
  row: typeof products.$inferSelect,
  context: { sellerOperatorId: string },
): ReadonlyMap<string, unknown> {
  const projection = new Map<string, unknown>([
    // Provenance — synthesized for owned products.
    ["source.kind", "owned"],
    ["seller.operator_id", context.sellerOperatorId],

    // Identity
    ["id", row.id],
    ["createdAt", row.createdAt],
    ["updatedAt", row.updatedAt],

    // Merchandisable
    ["name", row.name],
    ["description", row.description],
    ["inclusionsHtml", row.inclusionsHtml],
    ["exclusionsHtml", row.exclusionsHtml],
    ["termsHtml", row.termsHtml],
    ["tags[]", row.tags],

    // Structural
    ["status", row.status],
    ["bookingMode", row.bookingMode],
    ["supplyModel", deriveProductSupplyModel(row.bookingMode)],
    ["capacityMode", row.capacityMode],
    ["productTypeId", row.productTypeId],
    ["subtypeCode", row.productSubtypeCode],
    ["durationMinutes", row.durationMinutes],
    ["facilityId", row.facilityId],
    ["supplierId", row.supplierId],
    ["pax", row.pax],
    ["startDate", row.startDate],
    ["endDate", row.endDate],
    ["startDateEpochDays", dateToEpochDays(row.startDate)],
    ["endDateEpochDays", dateToEpochDays(row.endDate)],
    ["timezone", row.timezone],
    ["reservationTimeoutMinutes", row.reservationTimeoutMinutes],
    ["termsShowOnContract", row.termsShowOnContract],

    // Pricing (configured defaults — quote-time prices come from pricing module)
    ["sellAmountCents", row.sellAmountCents],
    ["sellCurrency", row.sellCurrency],

    // Internal / staff-only
    ["costAmountCents", row.costAmountCents],
    ["marginPercent", row.marginPercent],
  ])
  return projection
}

/**
 * Derives the `supplyModel` classifier (`dynamic` vs `scheduled`) from
 * `bookingMode`. This is the single source of truth — `supplyModel` is not a
 * stored column. The decision to keep it derived rather than promote it to a
 * first-class authored field, plus the revisit trigger and touch points if it
 * is ever promoted, is recorded in
 * `docs/adr/0010-supply-model-derived-from-booking-mode.md`.
 */
export function deriveProductSupplyModel(bookingMode: ProductBookingMode): "dynamic" | "scheduled" {
  switch (bookingMode) {
    case "open":
    case "stay":
      return "dynamic"
    case "date":
    case "date_time":
    case "transfer":
    case "itinerary":
    case "other":
      return "scheduled"
  }
}

/**
 * Returns the Provenance tuple for a product row. Owned products synthesize
 * a `source.kind: "owned"` provenance with `static` freshness; sourced
 * products (Voyant Connect / GDS / direct API) carry their actual source
 * connection identity. Phase 1 ships only the owned form.
 */
export function productProvenance(
  _row: typeof products.$inferSelect,
  _context: { sellerOperatorId: string },
): Provenance {
  return {
    source_kind: "owned",
    source_freshness: "static",
  }
}

/** Service-context the catalog-aware methods need. Templates wire this in. */
export interface ProductCatalogContext {
  /** The deployment's operator/tenant identifier — synthesized into provenance. */
  sellerOperatorId: string
  /** Variant scope for the request. */
  scope: ResolverScope
}

/**
 * Catalog-aware product fetch. Returns the resolved view (source projection
 * + active overlays + visibility filtering) instead of the raw DB row.
 *
 * The original `productsService.getProductById` continues to return raw
 * rows — routes that haven't migrated to the catalog plane keep working.
 *
 * Returns `null` if no product with `id` exists.
 */
export async function getResolvedProductById(
  db: AnyDrizzleDb,
  id: string,
  context: ProductCatalogContext,
): Promise<ResolvedView | null> {
  const rows = await db.select().from(products).where(eq(products.id, id)).limit(1)
  const row = rows[0]
  if (!row) return null

  const baseProjection = productRowToProjection(row, {
    sellerOperatorId: context.sellerOperatorId,
  })
  const classificationProjection = await projectProductClassification(db, row)
  const projection = new Map([...baseProjection, ...classificationProjection])
  return resolveEntityView(db, getProductsRegistry(), "products", id, projection, context.scope)
}

/**
 * Catalog-aware product list. Returns resolved views per row.
 *
 * Caller fetches the rows (typically via the existing `productsService.listProducts`
 * with whatever filtering / pagination / sort the route applies) and passes
 * them in. This keeps query construction in the existing service layer and
 * adds the catalog overlay step on top.
 *
 * Overlays for the whole page are fetched in ONE query via
 * `fetchOverlaysForEntities` and applied in-memory per product — the
 * per-product output is byte-identical to calling `resolveEntityView`
 * once per row, minus the N-1 sequential round trips.
 *
 * Real high-volume list paths (storefront browse, admin search) should
 * still go through the search index instead — `IndexerService.search` is
 * already wired for that purpose. Use this method for small admin-facing
 * lists or detail-page composition where the index isn't on the read path.
 */
export async function listResolvedProducts(
  db: AnyDrizzleDb,
  rows: ReadonlyArray<typeof products.$inferSelect>,
  context: ProductCatalogContext,
): Promise<ResolvedView[]> {
  const registry = getProductsRegistry()
  const overlaysByEntity = await fetchOverlaysForEntities(
    db,
    "products",
    rows.map((row) => row.id),
  )
  const classificationProjections = await Promise.all(
    rows.map((row) => projectProductClassification(db, row)),
  )
  return rows.map((row, index) => {
    const baseProjection = productRowToProjection(row, {
      sellerOperatorId: context.sellerOperatorId,
    })
    const projection = new Map([...baseProjection, ...(classificationProjections[index] ?? [])])
    return resolveEntityViewWithOverlays(
      registry,
      projection,
      overlaysByEntity.get(row.id) ?? [],
      context.scope,
    )
  })
}

/**
 * Build a `CaptureSnapshotInput` for a product to feed into the catalog
 * plane's `captureSnapshot` / `captureSnapshotGraph` helpers at booking
 * commit time. Fetches the product, resolves its view (overlays applied,
 * visibility filter for the supplied scope), and returns the snapshot
 * input shape.
 *
 * Returns `null` if the product doesn't exist.
 *
 * Composition: a single-product booking calls this once and passes the
 * result to `captureSnapshot`. A composite booking (e.g. a tour-package
 * booking with referenced accommodations + excursions) calls this and the
 * other verticals' equivalents, collects the inputs, and passes them all
 * to `captureSnapshotGraph` in one transaction.
 */
export async function buildProductSnapshotInput(
  db: AnyDrizzleDb,
  productId: string,
  context: ProductCatalogContext & { pricingBasis?: PricingBasis },
): Promise<Omit<CaptureSnapshotInput, "bookingId"> | null> {
  const view = await getResolvedProductById(db, productId, context)
  if (!view) return null
  return buildSnapshotInputFromView(view, {
    entityModule: "products",
    entityId: productId,
    sourceKind: "owned",
    pricingBasis: context.pricingBasis,
  })
}

// ─────────────────────────────────────────────────────────────────────────────
// Indexer document emission
// ─────────────────────────────────────────────────────────────────────────────

/**
 * A projection extension contributes additional field-keyed entries to the
 * product search document. The builder runs all extensions in parallel after
 * fetching the product row, then merges their entries into the base
 * projection before emitting.
 *
 * Used by child-entity registries (destinations, taxonomy, departures, etc.)
 * to denormalize fields onto the product doc. See architecture §5.4 — the
 * search index is the canonical place for cross-entity denormalization.
 *
 * `buildIndexerDocument` silently drops entries whose paths aren't registered
 * in the field-policy registry — so an extension's contributed registry must
 * be composed into the registry passed to `createProductDocumentBuilder` for
 * its fields to actually land in the document.
 */
export interface ProductProjectionExtension {
  /** Identifier — used for diagnostics and logging only. */
  readonly name: string
  /**
   * Contribute additional projection entries for one product. The slice
   * carries locale and audience for translation lookups and audience
   * filtering.
   */
  project(
    db: AnyDrizzleDb,
    productId: string,
    slice: IndexerSlice,
  ): Promise<ReadonlyMap<string, unknown>>
}

/**
 * Compose the registry from the base product policy plus any contributing
 * extensions' policies. Templates wire this when they enable child-entity
 * registries.
 */
export function createProductsRegistry(
  ...extensionPolicies: ReadonlyArray<ReadonlyArray<FieldPolicy>>
): FieldPolicyRegistry {
  if (extensionPolicies.length === 0) return getProductsRegistry()
  const composed: FieldPolicy[] = [...productCatalogPolicy]
  for (const policies of extensionPolicies) {
    composed.push(...policies)
  }
  return createFieldPolicyRegistry(composed)
}

/**
 * Construct a sync `DocumentEmitter` for products. The emitter takes a
 * pre-fetched product row + a slice and returns the indexer document
 * (filtered by visibility, with blob-only fields skipped).
 *
 * Bulk-reindex pipelines that already have rows in hand call this directly.
 * Live reindex paths use `createProductDocumentBuilder` below, which fetches
 * the row before emitting.
 *
 * Pass a custom `registry` when the deployment composes additional
 * child-entity policies; otherwise the default products registry is used.
 */
export function createProductDocumentEmitter(context: {
  sellerOperatorId: string
  registry?: FieldPolicyRegistry
}): DocumentEmitter<typeof products.$inferSelect> {
  const registry = context.registry ?? getProductsRegistry()
  return {
    vertical: "products",
    emit(source, slice) {
      const projection = productRowToProjection(source, {
        sellerOperatorId: context.sellerOperatorId,
      })
      return buildIndexerDocument(registry, projection, slice, source.id)
    },
  }
}

function isPublicAudienceSlice(slice: IndexerSlice): boolean {
  return (
    slice.audience === "customer" || slice.audience === "partner" || slice.audience === "supplier"
  )
}

async function shouldEmitForSlice(
  db: AnyDrizzleDb,
  row: Product,
  slice: IndexerSlice,
  isPublicAudienceListable?: ProductDocumentListabilityPredicate,
): Promise<boolean> {
  // The catalog is a "bookable now" surface — draft and archived
  // products don't belong there, regardless of audience. Operators
  // browsing /catalog get the same active-only set the storefront sees,
  // just with staff-visible attribute columns.
  if (row.status !== "active") return false
  if (isPublicAudienceSlice(slice)) {
    if (isPublicAudienceListable) {
      return isPublicAudienceListable({ db, product: row, slice })
    }
  }
  return true
}

/**
 * Async `DocumentBuilder` for products — fetches the row by id, then emits.
 * Plug this into `IndexerService.reindexEntity` for live reindex events.
 *
 * Returns `null` if the product no longer exists (e.g. it was deleted
 * between the reindex enqueue and the worker picking it up). Callers can
 * treat `null` as a delete signal.
 *
 * `extensions` denormalize child-entity fields onto the product doc. They
 * run in parallel after the base row is fetched. An extension that throws
 * fails the whole build — failures here would otherwise produce silently
 * incomplete documents.
 *
 * Pass a custom `registry` (composed via `createProductsRegistry`) when
 * extensions contribute fields beyond the base products policy.
 */
export function createProductDocumentBuilder(
  db: AnyDrizzleDb,
  context: {
    sellerOperatorId: string
    extensions?: ReadonlyArray<ProductProjectionExtension>
    registry?: FieldPolicyRegistry
    isPublicAudienceListable?: ProductDocumentListabilityPredicate
  },
): DocumentBuilder {
  const registry = context.registry ?? getProductsRegistry()
  const extensions = context.extensions ?? []
  return async (
    entityId: string,
    slice: IndexerSlice,
    buildContext?: DocumentBuilderContext,
  ): Promise<IndexerDocument | null> => {
    const rows = await db.select().from(products).where(eq(products.id, entityId)).limit(1)
    const row = rows[0]
    if (!row) return null
    if (!(await shouldEmitForSlice(db, row, slice, context.isPublicAudienceListable))) return null

    const baseProjection = productRowToProjection(row, {
      sellerOperatorId: context.sellerOperatorId,
    })
    const extensionProjections = await Promise.all(
      extensions.map((ext) => ext.project(db, entityId, slice)),
    )
    const merged = new Map<string, unknown>(baseProjection)
    for (const projection of extensionProjections) {
      for (const [path, value] of projection) {
        merged.set(path, value)
      }
    }
    const propertyProjection = await resolveProductAccommodationPropertyReference(
      db,
      row,
      buildContext,
    )
    if (propertyProjection) {
      copyReferencedPropertyValue(propertyProjection, "name", merged, "property.name")
      copyReferencedPropertyValue(propertyProjection, "description", merged, "property.description")
      copyReferencedPropertyValue(
        propertyProjection,
        "hero_image_url",
        merged,
        "property.heroImageUrl",
      )
      copyReferencedPropertyValue(propertyProjection, "gallery", merged, "property.gallery")
    }
    return buildIndexerDocument(registry, merged, slice, entityId)
  }
}

async function resolveProductAccommodationPropertyReference(
  db: AnyDrizzleDb,
  product: Product,
  context: DocumentBuilderContext | undefined,
): Promise<ReadonlyMap<string, unknown> | null> {
  if (!product.facilityId || !context) return null

  const [ownedProperty] = await db
    .select({
      id: properties.id,
      brandName: properties.brandName,
      groupName: properties.groupName,
      facilityName: facilities.name,
      facilityDescription: facilities.description,
    })
    .from(properties)
    .innerJoin(facilities, eq(facilities.id, properties.facilityId))
    .where(eq(properties.facilityId, product.facilityId))
    .limit(1)

  const propertyId = ownedProperty?.id ?? product.facilityId
  const sourceValues = ownedProperty
    ? new Map<string, unknown>([
        ["id", propertyId],
        ["source.kind", "owned"],
        ["name", ownedProperty.facilityName ?? ownedProperty.brandName ?? ownedProperty.groupName],
        ["description", ownedProperty.facilityDescription ?? null],
        ["hero_image_url", null],
        ["gallery", []],
      ])
    : undefined
  const subject = await context.resolveReferencedSubject({
    entityModule: "accommodation-properties",
    entityId: propertyId,
    ...(sourceValues ? { sourceValues } : {}),
  })
  return subject?.values ?? null
}

function copyReferencedPropertyValue(
  source: ReadonlyMap<string, unknown>,
  sourcePath: string,
  target: Map<string, unknown>,
  targetPath: string,
): void {
  if (source.has(sourcePath)) target.set(targetPath, source.get(sourcePath))
}

/**
 * Product-owned storefront-card projection. This extension keeps the
 * customer catalog slice directly renderable by denormalizing localized
 * routing, card media, duration, and map coordinates into the search doc.
 */
export function createProductStorefrontCardProjectionExtension(): ProductProjectionExtension {
  return {
    name: "products:storefront-card",
    async project(db, productId, slice) {
      // Wave 1: everything keyed by productId alone runs concurrently —
      // including the departures count, which used to trail sequentially.
      const [translations, mediaRows, locationRows, itineraryRows, availableDeparturesCount] =
        await Promise.all([
          db
            .select({
              languageTag: productTranslations.languageTag,
              name: productTranslations.name,
              slug: productTranslations.slug,
              shortDescription: productTranslations.shortDescription,
              inclusionsHtml: productTranslations.inclusionsHtml,
              exclusionsHtml: productTranslations.exclusionsHtml,
              termsHtml: productTranslations.termsHtml,
            })
            .from(productTranslations)
            .where(eq(productTranslations.productId, productId))
            .orderBy(asc(productTranslations.updatedAt)),
          db
            .select({
              url: productMedia.url,
              mediaType: productMedia.mediaType,
              isCover: productMedia.isCover,
              isBrochure: productMedia.isBrochure,
              sortOrder: productMedia.sortOrder,
              createdAt: productMedia.createdAt,
            })
            .from(productMedia)
            .where(eq(productMedia.productId, productId))
            .orderBy(asc(productMedia.sortOrder), asc(productMedia.createdAt)),
          db
            .select({
              latitude: productLocations.latitude,
              longitude: productLocations.longitude,
              sortOrder: productLocations.sortOrder,
              createdAt: productLocations.createdAt,
            })
            .from(productLocations)
            .where(eq(productLocations.productId, productId))
            .orderBy(asc(productLocations.sortOrder), asc(productLocations.createdAt)),
          db
            .select({ id: productItineraries.id, isDefault: productItineraries.isDefault })
            .from(productItineraries)
            .where(eq(productItineraries.productId, productId))
            .orderBy(asc(productItineraries.sortOrder)),
          countAvailableDepartures(db, productId),
        ])

      const translation = pickTranslation(translations, slice.locale)
      const imageMediaRows = mediaRows.filter((m) => !m.isBrochure && m.mediaType === "image")
      const cover = imageMediaRows.find((m) => m.isCover)
      const primaryMedia = cover ?? imageMediaRows[0] ?? null
      const coordinateLocation =
        locationRows.find((l) => l.latitude != null && l.longitude != null) ?? null
      const defaultItinerary = itineraryRows.find((it) => it.isDefault) ?? itineraryRows[0]
      // Wave 2: the duration estimate needs `defaultItinerary`, which is only
      // known after the itinerary rows land — it cannot join wave 1.
      const durationDays = defaultItinerary
        ? await estimateItineraryDurationDays(db, defaultItinerary.id)
        : null

      const out = new Map<string, unknown>([
        ["slug", translation?.slug ?? null],
        ["shortDescription", translation?.shortDescription ?? null],
        ["primaryMediaUrl", primaryMedia?.url ?? null],
        ["thumbnailUrl", primaryMedia?.url ?? null],
        ["coverMediaUrl", primaryMedia?.url ?? null],
        ["durationDays", durationDays],
        ["availableDeparturesCount", availableDeparturesCount],
        ["latitude", coordinateLocation?.latitude ?? null],
        ["longitude", coordinateLocation?.longitude ?? null],
      ])
      if (translation?.name) {
        out.set("name", translation.name)
      }
      if (translation?.inclusionsHtml != null) {
        out.set("inclusionsHtml", translation.inclusionsHtml)
      }
      if (translation?.exclusionsHtml != null) {
        out.set("exclusionsHtml", translation.exclusionsHtml)
      }
      if (translation?.termsHtml != null) {
        out.set("termsHtml", translation.termsHtml)
      }
      return out
    },
  }
}

/**
 * Resolve the legacy itinerary-derived duration in days for a product: the max
 * day number of its default itinerary (falling back to the first). Null when the
 * product has no itinerary days. This is the fallback the duration resolver uses
 * when no explicit `durationMinutes` is authored.
 */
export async function resolveItineraryDurationDays(
  db: AnyDrizzleDb,
  productId: string,
): Promise<number | null> {
  const itineraryRows = await db
    .select({ id: productItineraries.id, isDefault: productItineraries.isDefault })
    .from(productItineraries)
    .where(eq(productItineraries.productId, productId))
    .orderBy(asc(productItineraries.sortOrder))
  const defaultItinerary = itineraryRows.find((it) => it.isDefault) ?? itineraryRows[0]
  if (!defaultItinerary) return null
  return estimateItineraryDurationDays(db, defaultItinerary.id)
}

async function projectProductClassification(
  db: AnyDrizzleDb,
  row: Pick<Product, "id" | "productTypeId" | "productSubtypeCode" | "durationMinutes">,
): Promise<Map<string, unknown>> {
  const [familyRow] = row.productTypeId
    ? await db
        .select({ code: productTypes.code, name: productTypes.name })
        .from(productTypes)
        .where(eq(productTypes.id, row.productTypeId))
        .limit(1)
    : []
  const classification = resolveProductClassification({
    family: familyRow ?? null,
    subtypeCode: row.productSubtypeCode,
    durationMinutes: row.durationMinutes,
    itineraryDurationDays: await resolveItineraryDurationDays(db, row.id),
  })
  return new Map<string, unknown>([
    ["familyCode", classification.familyCode],
    ["familyName", classification.familyName],
    ["subtypeCode", classification.subtypeCode],
    ["durationMinutes", classification.durationMinutes],
    ["durationDays", classification.durationDays],
    ["durationProvenance", classification.durationProvenance],
    ["scheduleTerm", classification.scheduleTerm],
    ["classificationReviewRequired", classification.reviewRequired],
    ["classificationReviewReasons", classification.reviewReasons],
  ])
}

/**
 * Product classification projection extension — the catalog-plane half of the
 * shared `resolveProductClassification`. Joins `product_types` for the family
 * stable code/name, resolves the duration (explicit-first, itinerary-derived
 * fallback), and denormalizes the family / subtype / duration / review fields
 * onto the search document so catalog views facet on stable codes without a
 * query-time join. Uses the SAME resolver as the list/detail read paths and the
 * legacy Catalog search document, so all three emit identical semantics.
 */
export function createProductClassificationProjectionExtension(): ProductProjectionExtension {
  return {
    name: "products:classification",
    async project(db, productId, _slice) {
      const [row] = await db
        .select({
          productTypeId: products.productTypeId,
          productSubtypeCode: products.productSubtypeCode,
          durationMinutes: products.durationMinutes,
        })
        .from(products)
        .where(eq(products.id, productId))
        .limit(1)
      if (!row) return new Map()
      return projectProductClassification(db, { id: productId, ...row })
    },
  }
}

function pickTranslation<T extends { languageTag: string }>(
  rows: ReadonlyArray<T>,
  locale: string,
): T | null {
  return (
    rows.find((row) => row.languageTag === locale) ??
    rows.find((row) => row.languageTag.toLowerCase() === locale.toLowerCase()) ??
    rows.find((row) => row.languageTag.split("-")[0] === locale.split("-")[0]) ??
    rows[0] ??
    null
  )
}

/**
 * Counts future, open availability slots for a product — surfaces in the
 * catalog index as `availableDeparturesCount` so the operator catalog
 * table can show booking-ready stock at a glance without a separate
 * round-trip. Owned-products only; sourced products carry departures via
 * the upstream feed and don't write to `availability_slots`.
 *
 * Cross-package boundary: queries `availability_slots` by raw table name
 * via `sql` so the products module doesn't take a hard dependency on the
 * `@voyant-travel/operations` schema.
 */
async function countAvailableDepartures(db: AnyDrizzleDb, productId: string): Promise<number> {
  try {
    const result = await db.execute(sql`
      SELECT COUNT(*)::int AS count
      FROM availability_slots
      WHERE product_id = ${productId}
        AND status = 'open'
        AND starts_at >= NOW()
    `)
    // postgres-js + neon-serverless both return `{ count }` on the first row;
    // shape-defensive read in case a driver wraps it differently.
    const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])
    const row = rows[0] as { count?: number | string } | undefined
    const value = row?.count
    if (typeof value === "number") return value
    if (typeof value === "string") {
      const n = Number(value)
      return Number.isFinite(n) ? n : 0
    }
    return 0
  } catch {
    // availability_slots may not exist in slim test fixtures; treat as 0
    // so reindex doesn't fail.
    return 0
  }
}

async function estimateItineraryDurationDays(
  db: AnyDrizzleDb,
  itineraryId: string,
): Promise<number | null> {
  const rows = await db
    .select({ dayNumber: productDays.dayNumber })
    .from(productDays)
    .where(eq(productDays.itineraryId, itineraryId))
    .orderBy(asc(productDays.dayNumber))

  if (rows.length === 0) return null
  const max = Math.max(...rows.map((row) => row.dayNumber))
  return Number.isFinite(max) && max > 0 ? max : null
}

function dateToEpochDays(value: string | Date | null): number | null {
  if (!value) return null
  const date = typeof value === "string" ? new Date(value) : value
  const time = date.getTime()
  if (Number.isNaN(time)) return null
  return Math.floor(time / (24 * 60 * 60 * 1000))
}

/**
 * Re-exports for routes that only import from this file.
 */
export type {
  CaptureSnapshotInput,
  DocumentBuilder,
  DocumentEmitter,
  IndexerDocument,
  IndexerSlice,
  PricingBasis,
  Provenance,
  ResolvedView,
  ResolverScope,
  Visibility,
}
