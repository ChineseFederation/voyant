/**
 * Catalog-plane integration for the extras service.
 *
 * Extras are a **partial-adoption vertical** per architecture §3.3.1: they
 * participate in provenance + booking snapshot + catalog event taxonomy,
 * but skip the search index and overlay store. The service-plane integration
 * here reflects that — `getResolvedExtraById` returns a resolved view but
 * the resolver always sees an empty overlay set (extras have no overlay
 * rows; the catalog-policy file declares no merchandisable fields).
 *
 * The value of running through the catalog-plane resolver anyway is
 * uniformity: extras' projection and visibility filtering use the same
 * machinery as every other vertical, and snapshot capture at booking commit
 * (the most important participation surface for extras) reuses
 * `productExtraRowToProjection` to build the frozen payload.
 *
 * See `docs/architecture/catalog-architecture.md` §9.1 + §3.3.1.
 */

import {
  buildSnapshotInputFromView,
  type CaptureSnapshotInput,
  createFieldPolicyRegistry,
  type DocumentBuilder,
  type DocumentEmitter,
  type FieldPolicyRegistry,
  type IndexerDocument,
  type IndexerSlice,
  type PricingBasis,
  type Provenance,
  type ResolvedView,
  type ResolverScope,
  resolveEntityView,
} from "@voyant-travel/catalog"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { eq } from "drizzle-orm"

import { extrasCatalogPolicy } from "./catalog-policy.js"
import { productExtras } from "./schema.js"

let _registry: FieldPolicyRegistry | undefined
function getExtrasRegistry(): FieldPolicyRegistry {
  if (!_registry) {
    _registry = createFieldPolicyRegistry(extrasCatalogPolicy)
  }
  return _registry
}

/**
 * Maps a product-extra row to a field-keyed projection. Extras almost
 * always inherit their provenance from the parent product they attach to;
 * the caller passes the parent's source kind / ref through, defaulting to
 * `owned` for operator-defined extras.
 */
export function productExtraRowToProjection(
  row: typeof productExtras.$inferSelect,
  context: { sellerOperatorId: string; sourceKind?: string; sourceRef?: string },
): ReadonlyMap<string, unknown> {
  return new Map<string, unknown>([
    // Provenance
    ["source.kind", context.sourceKind ?? "owned"],
    ["source.ref", context.sourceRef],
    ["seller.operator_id", context.sellerOperatorId],

    // Identity + cross-module reference
    ["id", row.id],
    ["code", row.code],
    ["productId", row.productId],
    ["supplierId", row.supplierId],
    ["createdAt", row.createdAt],
    ["updatedAt", row.updatedAt],

    // Snapshot-relevant managed fields
    ["name", row.name],
    ["description", row.description],
    ["thumbnailUrl", pickThumbnailUrl(row.metadata)],

    // Selection / pricing structure
    ["selectionType", row.selectionType],
    ["pricingMode", row.pricingMode],
    ["pricedPerPerson", row.pricedPerPerson],
    ["collectionMode", row.collectionMode],
    ["showOnSlotManifest", row.showOnSlotManifest],
    ["minQuantity", row.minQuantity],
    ["maxQuantity", row.maxQuantity],
    ["defaultQuantity", row.defaultQuantity],
    ["active", row.active],
    ["sortOrder", row.sortOrder],
  ])
}

export function productExtraProvenance(
  _row: typeof productExtras.$inferSelect,
  context: { sellerOperatorId: string; sourceKind?: string; sourceRef?: string },
): Provenance {
  return {
    source_kind: context.sourceKind ?? "owned",
    source_freshness: context.sourceKind && context.sourceKind !== "owned" ? "sync" : "static",
    source_ref: context.sourceRef,
  }
}

export interface ProductExtraCatalogContext {
  sellerOperatorId: string
  scope: ResolverScope
  sourceKind?: string
  sourceRef?: string
}

/**
 * Catalog-aware extra fetch. The catalog-policy declares no merchandisable
 * fields for extras (per §3.3.1 partial adoption), so the resolver acts as
 * a pure visibility filter rather than an overlay-merge engine. Useful
 * primarily for snapshot capture at booking time.
 */
export async function getResolvedExtraById(
  db: AnyDrizzleDb,
  id: string,
  context: ProductExtraCatalogContext,
): Promise<ResolvedView | null> {
  const rows = await db.select().from(productExtras).where(eq(productExtras.id, id)).limit(1)
  const row = rows[0]
  if (!row) return null

  const projection = productExtraRowToProjection(row, {
    sellerOperatorId: context.sellerOperatorId,
    sourceKind: context.sourceKind,
    sourceRef: context.sourceRef,
  })
  return resolveEntityView(db, getExtrasRegistry(), "extras", id, projection, context.scope)
}

export async function listResolvedExtras(
  db: AnyDrizzleDb,
  rows: ReadonlyArray<typeof productExtras.$inferSelect>,
  context: ProductExtraCatalogContext,
): Promise<ResolvedView[]> {
  const registry = getExtrasRegistry()
  const views: ResolvedView[] = []
  for (const row of rows) {
    const projection = productExtraRowToProjection(row, {
      sellerOperatorId: context.sellerOperatorId,
      sourceKind: context.sourceKind,
      sourceRef: context.sourceRef,
    })
    const view = await resolveEntityView(db, registry, "extras", row.id, projection, context.scope)
    views.push(view)
  }
  return views
}

/**
 * Build a `CaptureSnapshotInput` for a product extra. Extras participate
 * in the snapshot graph (per §3.3.1 partial adoption) so refunds can know
 * exactly what add-on the customer purchased and what selectionType /
 * pricingMode applied at booking time.
 */
export async function buildExtraSnapshotInput(
  db: AnyDrizzleDb,
  extraId: string,
  context: ProductExtraCatalogContext & { pricingBasis?: PricingBasis },
): Promise<Omit<CaptureSnapshotInput, "bookingId"> | null> {
  const view = await getResolvedExtraById(db, extraId, context)
  if (!view) return null
  return buildSnapshotInputFromView(view, {
    entityModule: "extras",
    entityId: extraId,
    sourceKind: context.sourceKind ?? "owned",
    sourceRef: context.sourceRef,
    pricingBasis: context.pricingBasis,
  })
}

function pickThumbnailUrl(value: unknown): string | null {
  const record = asRecord(value)
  if (!record) return null
  return (
    firstString(
      record.thumbnailUrl,
      record.heroImageUrl,
      record.hero_image_url,
      record.imageUrl,
      record.image_url,
    ) ??
    firstMediaUrl(record.media) ??
    firstStringFromArray(record.images) ??
    firstStringFromArray(record.galleryUrls)
  )
}

function firstMediaUrl(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  for (const item of value) {
    const media = asRecord(item)
    if (!media) continue
    const type = typeof media.type === "string" ? media.type : null
    if (type && type !== "image") continue
    const url = firstString(media.url, media.src)
    if (url) return url
  }
  return null
}

function firstStringFromArray(value: unknown): string | null {
  if (!Array.isArray(value)) return null
  return value.find((item): item is string => typeof item === "string" && item.length > 0) ?? null
}

function firstString(...values: unknown[]): string | null {
  return (
    values.find((value): value is string => typeof value === "string" && value.length > 0) ?? null
  )
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null
}

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
}
