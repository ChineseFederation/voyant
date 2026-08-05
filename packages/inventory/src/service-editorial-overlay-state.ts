/**
 * Admin read model for product editorial overlays.
 *
 * Sourced products only — an owned product has no provider baseline to compare
 * against and authors its copy directly, so this read throws
 * `OwnedProductNotOverlayableError` rather than returning an empty comparison.
 *
 * Returns provider source content, active overlays, and effective content for
 * one locale scope, plus a per-field state map covering **every eligible
 * target** — not just the ones that already carry an overlay. The operator
 * content editor needs the eligible surface to offer "add a translation the
 * provider never supplied", so enumeration happens here rather than in the UI.
 *
 * Field states follow RFC #3666: `exact`, `language-fallback`,
 * `source-fallback`, `overlaid`, `overlay-only`, `missing`, `invalid`, and
 * `orphaned`. `drifted` is a separate flag so a drifted overlay keeps its
 * authoring state.
 */

import type { SourceAdapterRegistry } from "@voyant-travel/catalog/booking-engine"
import {
  OVERLAY_DEFAULT_SCOPE,
  OVERLAY_ROOT_NODE_KEY,
  OVERLAY_ROOT_NODE_KIND,
  type SelectCatalogOverlay,
} from "@voyant-travel/catalog/overlay/schema"
import { fetchOverlayRowsForEntity } from "@voyant-travel/catalog/services/overlay"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { eq } from "drizzle-orm"
import {
  mergeOverlaysIntoProductContent,
  normalizeProductContentOverlay,
  type ProductContent,
} from "./content-shape.js"
import {
  DAY_FIELD_KINDS,
  fieldKindFor,
  normalizeTarget,
  type ProductEditorialFieldKind,
  type ProductEditorialNodeKind,
  ROOT_FIELD_KINDS,
  readProductTargetValue,
  targetKey,
  toProductEditorialNodeKind,
} from "./editorial-overlay-fields.js"
import { productsSourcedContentTable } from "./schema-sourced-content.js"
import { getProductContent, type ProductContentScope } from "./service-content.js"

export type ProductEditorialFieldState =
  | "exact"
  | "language-fallback"
  | "source-fallback"
  | "overlaid"
  | "overlay-only"
  | "missing"
  | "invalid"
  | "orphaned"

export interface ProductEditorialFieldView {
  state: ProductEditorialFieldState
  kind: ProductEditorialFieldKind
  nodeKind: ProductEditorialNodeKind
  nodeKey: string
  fieldPath: string
  sourceValue: unknown
  overlayValue: unknown
  effectiveValue: unknown
  drifted: boolean
  invalidReason: string | null
  version: number | null
  id: string | null
  updatedAt: string | null
  origin: SelectCatalogOverlay["origin"] | null
  editorialNote: string | null
}

export interface ProductEditorialNodeView {
  nodeKind: ProductEditorialNodeKind
  nodeKey: string
  dayNumber: number | null
  label: string | null
}

export interface ProductEditorialOverlayServiceOptions {
  registry: SourceAdapterRegistry
}

/**
 * Thrown when an editorial-overlay operation names an owned product.
 *
 * Overlays restate content the operator does not control. An owned product's
 * copy is authored in `product_translations` and friends, so it has no
 * provider baseline to overlay and no need for one — the operator edits the
 * real row instead. Routes map this to 404: the overlay collection does not
 * exist for that subject.
 */
export class OwnedProductNotOverlayableError extends Error {
  readonly productId: string

  constructor(productId: string) {
    super(
      `Product ${productId} is owned; editorial overlays apply to provider-sourced products only`,
    )
    this.name = "OwnedProductNotOverlayableError"
    this.productId = productId
  }
}

export async function readProductEditorialOverlayState(
  db: AnyDrizzleDb,
  productId: string,
  scope: ProductContentScope,
  options: ProductEditorialOverlayServiceOptions,
) {
  const source = await getProductContent(db, productId, scope, {
    registry: options.registry,
    applyOverlays: false,
  })
  if (!source) return null
  if (source.source === "owned") throw new OwnedProductNotOverlayableError(productId)

  const effective = await getProductContent(db, productId, scope, {
    registry: options.registry,
    applyOverlays: true,
  })
  if (!effective) return null

  const overlays = await fetchOverlayRowsForEntity(db, "products", productId)
  const active = overlays.filter((overlay) => overlayMatchesReadScope(overlay, scope))
  const invalidReasons = collectInvalidOverlayReasons(source.content, active)
  const sourceUpdatedAt = await readSourceUpdatedAt(
    db,
    productId,
    effective.resolution.served_locale,
  )

  const nodes = listEligibleNodes(source.content)
  const fields: Record<string, ProductEditorialFieldView> = {}
  const overlayByTarget = new Map<string, SelectCatalogOverlay>()
  for (const overlay of active) {
    const nodeKind = toProductEditorialNodeKind(overlay.node_kind)
    if (!nodeKind) continue
    const normalized = normalizeTarget({ ...overlay, node_kind: nodeKind })
    overlayByTarget.set(
      targetKey(normalized.node_kind, normalized.node_key, normalized.field_path),
      overlay,
    )
  }

  for (const node of nodes) {
    const paths = node.nodeKind === OVERLAY_ROOT_NODE_KIND ? ROOT_FIELD_KINDS : DAY_FIELD_KINDS
    for (const fieldPath of paths.keys()) {
      const key = targetKey(node.nodeKind, node.nodeKey, fieldPath)
      const overlay = overlayByTarget.get(key) ?? null
      overlayByTarget.delete(key)
      fields[key] = buildFieldView({
        node,
        fieldPath,
        overlay,
        source: source.content,
        effective: effective.content,
        matchKind: source.resolution.match_kind,
        invalidReasons,
        sourceUpdatedAt,
      })
    }
  }

  // Anything still unmatched targets a node the provider no longer supplies.
  for (const [key, overlay] of overlayByTarget) {
    const nodeKind = toProductEditorialNodeKind(overlay.node_kind) ?? OVERLAY_ROOT_NODE_KIND
    const normalized = normalizeTarget({ ...overlay, node_kind: nodeKind })
    fields[key] = {
      state: "orphaned",
      kind: fieldKindFor(nodeKind, normalized.field_path) ?? "text",
      nodeKind,
      nodeKey: normalized.node_key,
      fieldPath: normalized.field_path,
      sourceValue: undefined,
      overlayValue: overlay.value,
      effectiveValue: undefined,
      drifted: false,
      invalidReason: invalidReasons.get(key) ?? null,
      version: overlay.version ?? null,
      id: overlay.id ?? null,
      updatedAt: toIso(overlay.updated_at),
      origin: overlay.origin ?? null,
      editorialNote: overlay.editorial_note ?? null,
    }
  }

  return {
    subject: { module: "products", id: productId },
    contentSource: source.source,
    locale: {
      requestedLocale: scope.preferredLocales[0] ?? "en-GB",
      sourceLocale: source.resolution.served_locale,
      servedLocale: effective.resolution.served_locale,
      matchKind: effectiveLocaleMatchKind(source, active),
    },
    source: source.content,
    effective: effective.content,
    nodes,
    fields,
    overlays: active,
    sourceUpdatedAt: toIso(sourceUpdatedAt),
    availableSourceLocales: await listAvailableSourceLocales(
      db,
      productId,
      source.resolution.served_locale,
    ),
    availableOverlayLocales: unique(overlays.map((overlay) => overlay.locale)),
  }
}

function buildFieldView(input: {
  node: ProductEditorialNodeView
  fieldPath: string
  overlay: SelectCatalogOverlay | null
  source: ProductContent
  effective: ProductContent
  matchKind: string
  invalidReasons: Map<string, string>
  sourceUpdatedAt: Date | null
}): ProductEditorialFieldView {
  const { node, fieldPath, overlay, source, effective } = input
  const address = { node_kind: node.nodeKind, node_key: node.nodeKey, field_path: fieldPath }
  const sourceValue = readProductTargetValue(source, address)
  const effectiveValue = readProductTargetValue(effective, address)
  const key = targetKey(node.nodeKind, node.nodeKey, fieldPath)
  const invalidReason = input.invalidReasons.get(key) ?? null

  return {
    state: resolveFieldState({
      overlay,
      sourceValue,
      effectiveValue,
      matchKind: input.matchKind,
      invalid: invalidReason != null,
    }),
    kind: fieldKindFor(node.nodeKind, fieldPath) ?? "text",
    nodeKind: node.nodeKind,
    nodeKey: node.nodeKey,
    fieldPath,
    sourceValue,
    overlayValue: overlay ? overlay.value : undefined,
    effectiveValue,
    drifted: isDrifted(overlay, input.sourceUpdatedAt),
    invalidReason,
    version: overlay?.version ?? null,
    id: overlay?.id ?? null,
    updatedAt: toIso(overlay?.updated_at ?? null),
    origin: overlay?.origin ?? null,
    editorialNote: overlay?.editorial_note ?? null,
  }
}

function resolveFieldState(input: {
  overlay: SelectCatalogOverlay | null
  sourceValue: unknown
  effectiveValue: unknown
  matchKind: string
  invalid: boolean
}): ProductEditorialFieldState {
  if (input.overlay) {
    if (input.invalid) return "invalid"
    return isEmptyValue(input.sourceValue) ? "overlay-only" : "overlaid"
  }
  if (isEmptyValue(input.effectiveValue)) return "missing"
  return sourceMatchState(input.matchKind)
}

function sourceMatchState(matchKind: string): ProductEditorialFieldState {
  if (matchKind === "exact") return "exact"
  if (matchKind === "language_match") return "language-fallback"
  return "source-fallback"
}

/**
 * Provider refreshed the underlying content after the overlay was authored.
 * The overlay still wins; admin discloses the newer source baseline for review.
 */
function isDrifted(overlay: SelectCatalogOverlay | null, sourceUpdatedAt: Date | null): boolean {
  if (!overlay || !sourceUpdatedAt) return false
  const authored = overlay.updated_at ?? overlay.created_at
  if (!authored) return false
  return sourceUpdatedAt.getTime() > new Date(authored).getTime()
}

/**
 * Merge each active overlay on its own so one bad legacy row is attributed
 * precisely instead of poisoning the whole read.
 */
function collectInvalidOverlayReasons(
  source: ProductContent,
  overlays: ReadonlyArray<SelectCatalogOverlay>,
): Map<string, string> {
  const reasons = new Map<string, string>()
  for (const overlay of overlays) {
    const nodeKind = toProductEditorialNodeKind(overlay.node_kind)
    if (!nodeKind) continue
    const normalized = normalizeTarget({ ...overlay, node_kind: nodeKind })
    const key = targetKey(normalized.node_kind, normalized.node_key, normalized.field_path)
    mergeOverlaysIntoProductContent(
      source,
      [
        normalizeProductContentOverlay({
          field_path: normalized.field_path,
          node_kind: normalized.node_kind,
          node_key: normalized.node_key,
          value: overlay.value,
        }),
      ],
      {
        onOverlayError(event) {
          reasons.set(key, event.reason)
        },
      },
    )
  }
  return reasons
}

function listEligibleNodes(content: ProductContent): ProductEditorialNodeView[] {
  const nodes: ProductEditorialNodeView[] = [
    {
      nodeKind: OVERLAY_ROOT_NODE_KIND,
      nodeKey: OVERLAY_ROOT_NODE_KEY,
      dayNumber: null,
      label: null,
    },
  ]
  for (const day of content.days) {
    // Positional days cannot carry a durable overlay target — skip rather than
    // pretend an index-addressed edit is safe.
    if (!day.id) continue
    nodes.push({
      nodeKind: "itinerary-day",
      nodeKey: day.id,
      dayNumber: day.day_number,
      label: day.title ?? null,
    })
  }
  return nodes
}

async function readSourceUpdatedAt(
  db: AnyDrizzleDb,
  productId: string,
  servedLocale: string,
): Promise<Date | null> {
  const rows = await selectSourcedContentRows(db, productId)
  const match =
    rows.find((row) => row.locale === servedLocale) ??
    rows.find((row) => row.returned_locale === servedLocale)
  return match?.source_updated_at ?? null
}

async function listAvailableSourceLocales(
  db: AnyDrizzleDb,
  productId: string,
  servedLocale: string,
): Promise<string[]> {
  const rows = await selectSourcedContentRows(db, productId)
  const locales = rows.flatMap((row) => [row.locale, row.returned_locale].filter(Boolean))
  return locales.length > 0 ? unique(locales) : unique([servedLocale])
}

async function selectSourcedContentRows(db: AnyDrizzleDb, productId: string) {
  const rows = await db
    .select()
    .from(productsSourcedContentTable)
    .where(eq(productsSourcedContentTable.entity_id, productId))
  return rows as Array<{
    locale: string
    returned_locale: string
    source_updated_at: Date | null
  }>
}

function overlayMatchesReadScope(
  overlay: { locale: string; audience: string; market: string },
  scope: ProductContentScope,
): boolean {
  const requestedLocale = scope.preferredLocales[0] ?? "en-GB"
  const requestedAudience = scope.audience
  return (
    (overlay.locale === requestedLocale || overlay.locale === OVERLAY_DEFAULT_SCOPE) &&
    (overlay.audience === requestedAudience || overlay.audience === OVERLAY_DEFAULT_SCOPE) &&
    (overlay.market === (scope.market ?? OVERLAY_DEFAULT_SCOPE) ||
      overlay.market === OVERLAY_DEFAULT_SCOPE)
  )
}

function effectiveLocaleMatchKind(
  source: NonNullable<Awaited<ReturnType<typeof getProductContent>>>,
  overlays: ReadonlyArray<{ locale: string }>,
): string {
  const requested = source.resolution.candidate.locale
  const hasRequestedOverlay = overlays.some((overlay) => overlay.locale === requested)
  if (hasRequestedOverlay && source.resolution.match_kind !== "exact") return "mixed"
  if (hasRequestedOverlay) return "overlay-only"
  if (source.resolution.match_kind === "exact") return "exact"
  if (source.resolution.match_kind === "language_match") return "language-fallback"
  return "source-fallback"
}

function isEmptyValue(value: unknown): boolean {
  if (value === undefined || value === null) return true
  if (typeof value === "string") return value.trim() === ""
  if (Array.isArray(value)) return value.length === 0
  return false
}

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString()
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort()
}
