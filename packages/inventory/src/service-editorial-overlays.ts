import type { Visibility } from "@voyant-travel/catalog/contract"
import {
  OVERLAY_DEFAULT_SCOPE,
  OVERLAY_ROOT_NODE_KEY,
  OVERLAY_ROOT_NODE_KIND,
  type OverlayOrigin,
  type SelectCatalogOverlay,
  type SelectCatalogOverlayHistory,
} from "@voyant-travel/catalog/overlay/schema"
import {
  clearOverlayByTarget,
  fetchOverlaysForEntity,
  listOverlayHistoryForTarget,
  OverlayVersionConflictError,
  writeOverlay,
} from "@voyant-travel/catalog/services/overlay"
// Deep subpath, not the `@voyant-travel/catalog` barrel: this module is reached
// from the admin route graph, and the barrel drags the whole catalog plane in
// with it.
import { readSourcedEntry } from "@voyant-travel/catalog/services/sourced-entry"
import type { AnyDrizzleDb } from "@voyant-travel/db"

import {
  mergeOverlaysIntoProductContent,
  normalizeProductContentOverlay,
  type ProductContent,
  validateProductContent,
} from "./content-shape.js"
import {
  DAY_FIELDS,
  normalizeFieldPath,
  normalizeNonEmpty,
  normalizeTarget,
  type ProductEditorialOverlayTarget,
  ROOT_FIELDS,
} from "./editorial-overlay-fields.js"
import { getProductContent, type ProductContentScope } from "./service-content.js"
import {
  OwnedProductNotOverlayableError,
  type ProductEditorialOverlayServiceOptions,
} from "./service-editorial-overlay-state.js"

export type {
  ProductEditorialFieldKind,
  ProductEditorialNodeKind,
  ProductEditorialOverlayTarget,
} from "./editorial-overlay-fields.js"
export type { ProductEditorialOverlayServiceOptions } from "./service-editorial-overlay-state.js"

export interface ProductEditorialOverlayScope {
  locale: string
  audience: Visibility | typeof OVERLAY_DEFAULT_SCOPE
  market: string
}

export interface ProductEditorialOverlayWriteInput extends ProductEditorialOverlayTarget {
  scope: ProductEditorialOverlayScope
  value: unknown
  expected_version?: number | null
  origin: OverlayOrigin
  editorial_note?: string
}

export interface ProductEditorialOverlayClearInput extends ProductEditorialOverlayTarget {
  scope: ProductEditorialOverlayScope
  expected_version?: number | null
}

export async function writeProductEditorialOverlay(
  db: AnyDrizzleDb,
  productId: string,
  input: ProductEditorialOverlayWriteInput,
  options: ProductEditorialOverlayServiceOptions,
): Promise<SelectCatalogOverlay> {
  const overlayScope = normalizeOverlayScope(input.scope)
  const scope: ProductContentScope = {
    preferredLocales: [overlayScope.locale],
    audience: normalizeAudience(overlayScope.audience),
    market: overlayScope.market,
    acceptMachineTranslated: false,
  }
  const source = await getProductContent(db, productId, scope, {
    registry: options.registry,
    applyOverlays: false,
  })
  if (!source) throw new Error(`Product ${productId} not found`)
  if (source.source === "owned") throw new OwnedProductNotOverlayableError(productId)

  const target = normalizeTarget(input)
  validateTarget(source.content, target)

  const existing = await fetchOverlaysForEntity(db, "products", productId)
  const candidateOverlays = [
    ...selectProductEditorialOverlaysForScope(existing, scope)
      .filter((overlay) => !sameContentTarget(overlay, target))
      .map((overlay) =>
        normalizeProductContentOverlay({
          field_path: overlay.field_path,
          node_kind: overlay.node_kind,
          node_key: overlay.node_key,
          value: overlay.value,
        }),
      ),
    normalizeProductContentOverlay({
      field_path: target.field_path,
      node_kind: target.node_kind,
      node_key: target.node_key,
      value: input.value,
    }),
  ]
  const merged = mergeOverlaysIntoProductContent(source.content, candidateOverlays)
  const validation = validateProductContent(merged)
  if (!validation.valid) {
    throw new Error(`Product editorial overlay failed validation: ${validation.reason}`)
  }

  return writeOverlay(db, {
    entity_module: "products",
    entity_id: productId,
    node_kind: target.node_kind,
    node_key: target.node_key,
    field_path: target.field_path,
    locale: overlayScope.locale,
    audience: overlayScope.audience,
    market: overlayScope.market,
    value: input.value,
    origin: input.origin,
    expected_version: input.expected_version,
    editorial_note: input.editorial_note,
  })
}

export async function clearProductEditorialOverlay(
  db: AnyDrizzleDb,
  productId: string,
  input: ProductEditorialOverlayClearInput,
): Promise<SelectCatalogOverlay | null> {
  await requireSourcedProduct(db, productId)
  const overlayScope = normalizeOverlayScope(input.scope)
  const target = normalizeTarget(input)
  return clearOverlayByTarget(db, {
    entity_module: "products",
    entity_id: productId,
    node_kind: target.node_kind,
    node_key: target.node_key,
    field_path: target.field_path,
    locale: overlayScope.locale,
    audience: overlayScope.audience,
    market: overlayScope.market,
    expected_version: input.expected_version,
  })
}

export async function listProductEditorialOverlayHistory(
  db: AnyDrizzleDb,
  productId: string,
  target?: Partial<ProductEditorialOverlayTarget & ProductEditorialOverlayScope>,
): Promise<SelectCatalogOverlayHistory[]> {
  await requireSourcedProduct(db, productId)
  return listOverlayHistoryForTarget(db, {
    entity_module: "products",
    entity_id: productId,
    ...(target?.node_kind ? { node_kind: target.node_kind } : {}),
    ...(target?.node_key ? { node_key: target.node_key } : {}),
    ...(target?.field_path
      ? {
          field_path: normalizeFieldPath({
            node_kind: target.node_kind,
            field_path: target.field_path,
          }),
        }
      : {}),
    ...(target?.locale ? { locale: target.locale } : {}),
    ...(target?.audience ? { audience: target.audience } : {}),
    ...(target?.market ? { market: target.market } : {}),
  })
}

export {
  OwnedProductNotOverlayableError,
  type ProductEditorialFieldState,
  type ProductEditorialFieldView,
  type ProductEditorialNodeView,
  readProductEditorialOverlayState,
} from "./service-editorial-overlay-state.js"

export { OverlayVersionConflictError }

/**
 * Overlays address provider-sourced products. Ownership is the absence of a
 * sourced-entry row, so this doubles as the existence check for the clear and
 * history paths — neither reads content, and an unknown id has no overlay
 * collection either way.
 */
async function requireSourcedProduct(db: AnyDrizzleDb, productId: string): Promise<void> {
  const entry = await readSourcedEntry(db, "products", productId)
  if (!entry) throw new OwnedProductNotOverlayableError(productId)
}

function validateTarget(
  content: ProductContent,
  target: Required<ProductEditorialOverlayTarget>,
): void {
  if (target.node_kind === OVERLAY_ROOT_NODE_KIND) {
    if (target.node_key !== OVERLAY_ROOT_NODE_KEY) {
      throw new Error("Root product editorial overlays must use node_key=root")
    }
    if (!ROOT_FIELDS.has(target.field_path)) {
      throw new Error(`Field ${target.field_path} is not an overlayable product presentation field`)
    }
    return
  }
  if (target.node_kind === "itinerary-day") {
    if (!DAY_FIELDS.has(target.field_path)) {
      throw new Error(`Field ${target.field_path} is not an overlayable itinerary-day field`)
    }
    const found = content.days.some((day) => day.id === target.node_key)
    if (!found) {
      throw new Error(
        `Itinerary-day overlay target ${target.node_key} is not present with a stable day id`,
      )
    }
    return
  }
  throw new Error(`Unsupported product editorial overlay node kind ${target.node_kind}`)
}

function sameContentTarget(
  overlay: {
    node_kind?: string
    node_key?: string
    field_path: string
  },
  target: Required<ProductEditorialOverlayTarget>,
): boolean {
  return (
    (overlay.node_kind ?? OVERLAY_ROOT_NODE_KIND) === target.node_kind &&
    (overlay.node_key ?? OVERLAY_ROOT_NODE_KEY) === target.node_key &&
    normalizeFieldPath({ node_kind: target.node_kind, field_path: overlay.field_path }) ===
      target.field_path
  )
}

function selectProductEditorialOverlaysForScope(
  overlays: Awaited<ReturnType<typeof fetchOverlaysForEntity>>,
  scope: ProductContentScope,
) {
  const chosen = new Map<string, (typeof overlays)[number]>()
  for (const variant of overlayFallbackChain(scope)) {
    for (const overlay of overlays) {
      if (
        overlay.locale !== variant.locale ||
        overlay.audience !== variant.audience ||
        overlay.market !== variant.market
      ) {
        continue
      }
      const key = `${overlay.node_kind ?? OVERLAY_ROOT_NODE_KIND}:${
        overlay.node_key ?? OVERLAY_ROOT_NODE_KEY
      }:${overlay.field_path}`
      if (!chosen.has(key)) chosen.set(key, overlay)
    }
  }
  return [...chosen.values()]
}

function overlayFallbackChain(scope: ProductContentScope) {
  const locale = scope.preferredLocales[0] ?? "en-GB"
  const audience = scope.audience
  const market = scope.market ?? OVERLAY_DEFAULT_SCOPE
  const D = OVERLAY_DEFAULT_SCOPE
  return [
    { locale, audience, market },
    { locale, audience, market: D },
    { locale, audience: D, market },
    { locale, audience: D, market: D },
    { locale: D, audience, market },
    { locale: D, audience, market: D },
    { locale: D, audience: D, market },
    { locale: D, audience: D, market: D },
  ]
}

function normalizeOverlayScope(scope: ProductEditorialOverlayScope): ProductEditorialOverlayScope {
  const locale = normalizeNonEmpty(scope.locale, "locale")
  if (locale === OVERLAY_DEFAULT_SCOPE) {
    throw new Error("Localized product editorial overlays must use a real locale")
  }
  return {
    locale,
    audience: scope.audience,
    market: normalizeNonEmpty(scope.market, "market"),
  }
}

function normalizeAudience(audience: ProductEditorialOverlayScope["audience"]): Visibility {
  if (audience === OVERLAY_DEFAULT_SCOPE) return "customer"
  return audience
}
