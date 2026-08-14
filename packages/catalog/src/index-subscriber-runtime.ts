import type { BootstrapContext, SubscriberRuntimeDescriptor } from "@voyant-travel/core"
import { defineGraphRuntimeFactory } from "@voyant-travel/core/project"
import { z } from "zod"

import { catalogIndexSubscriberDeclarations } from "./index-subscriber-declarations.js"
import {
  CATALOG_PROJECTION_RUNTIME_CONTAINER_KEY,
  type CatalogProjectionRuntime,
  type CatalogProjectionTarget,
  catalogProjectionRuntimePort,
  parseCatalogProjectionTarget,
} from "./projection-runtime.js"

const PRODUCTS_ENTITY_MODULE = "products"

const entityIdPayloadSchema = z.object({ id: z.string().min(1) }).passthrough()
const productIdPayloadSchema = z.object({ productId: z.string().optional() }).passthrough()
const overlayChangedPayloadSchema = z
  .object({
    entity_module: z.string().min(1),
    entity_id: z.string().min(1),
    node_kind: z.string().min(1).optional(),
    node_key: z.string().min(1).optional(),
    field_path: z.string().min(1),
    locale: z.string().min(1),
    audience: z.string().min(1),
    market: z.string().min(1),
    occurred_at: z.string().min(1),
  })
  .passthrough()
const promotionPayloadSchema = z
  .object({
    affected: z.discriminatedUnion("kind", [
      z.object({ kind: z.literal("all") }).passthrough(),
      z
        .object({
          kind: z.literal("products"),
          productIds: z.array(z.string().min(1)),
        })
        .passthrough(),
    ]),
  })
  .passthrough()

export interface CatalogIndexSubscriberRuntimeDescriptor {
  readonly id: string
  readonly eventType: string
  readonly register: (context: BootstrapContext) => void | Promise<void>
}

export interface CatalogIndexSubscriberDescriptorOptions {
  id: string
  eventType: string
  selectTargets(payload: unknown): readonly CatalogProjectionTarget[]
}

function resolveRuntime(context: BootstrapContext): CatalogProjectionRuntime {
  return context.container.resolve<CatalogProjectionRuntime>(
    CATALOG_PROJECTION_RUNTIME_CONTAINER_KEY,
  )
}

/**
 * Reindexing a product touches every locale, audience and market slice it is
 * published to, so it is legitimately slower than the bus default of 15s — and
 * a budget the work cannot meet is not a bound, it is a scheduled failure. On
 * one tenant this dead-lettered 29 product events in six days while the
 * indexing itself was very likely completing, because the bus stopped waiting,
 * the outbox retried into the identical wall, and each retry re-ran work the
 * previous attempt had left running (voyant#4639).
 *
 * Bounded above by the outbox's `visibilityTimeoutMs` (120s by default), which
 * has to exceed the slowest subscriber or a second drain reclaims the row while
 * the first is still delivering it — trading a self-inflicted timeout for a
 * self-inflicted duplicate. 60s keeps clear of that ceiling and is four times
 * the budget these events were being failed at.
 */
const CATALOG_REINDEX_TIMEOUT_MS = 60_000

export function createCatalogReindexSubscriberDescriptor(
  options: CatalogIndexSubscriberDescriptorOptions,
): CatalogIndexSubscriberRuntimeDescriptor {
  return {
    id: options.id,
    eventType: options.eventType,
    register(context) {
      context.eventBus.subscribe(
        options.eventType,
        async ({ data }) => {
          const targets = options.selectTargets(data)
          if (targets.length === 0) return
          const runtime = resolveRuntime(context)
          for (const target of targets) {
            await runtime.reindexEntity(target)
          }
        },
        { inline: false, timeoutMs: CATALOG_REINDEX_TIMEOUT_MS },
      )
    },
  }
}

export function createCatalogDeleteSubscriberDescriptor(
  options: CatalogIndexSubscriberDescriptorOptions,
): CatalogIndexSubscriberRuntimeDescriptor {
  return {
    id: options.id,
    eventType: options.eventType,
    register(context) {
      context.eventBus.subscribe(
        options.eventType,
        async ({ data }) => {
          const targets = options.selectTargets(data)
          if (targets.length === 0) return
          const runtime = resolveRuntime(context)
          for (const target of targets) {
            await runtime.deleteEntity(target)
          }
        },
        { inline: false, timeoutMs: CATALOG_REINDEX_TIMEOUT_MS },
      )
    },
  }
}

function productTarget(entityId: string): CatalogProjectionTarget {
  return parseCatalogProjectionTarget({ entityModule: PRODUCTS_ENTITY_MODULE, entityId })
}

function selectEntityId(payload: unknown): readonly CatalogProjectionTarget[] {
  return [productTarget(entityIdPayloadSchema.parse(payload).id)]
}

function selectOptionalProductId(payload: unknown): readonly CatalogProjectionTarget[] {
  const { productId } = productIdPayloadSchema.parse(payload)
  return productId ? [productTarget(productId)] : []
}

function selectPromotionProducts(payload: unknown): readonly CatalogProjectionTarget[] {
  const { affected } = promotionPayloadSchema.parse(payload)
  return affected.kind === "products" ? affected.productIds.map(productTarget) : []
}

function selectOverlayChangedEntity(payload: unknown): readonly CatalogProjectionTarget[] {
  const event = overlayChangedPayloadSchema.parse(payload)
  return [
    parseCatalogProjectionTarget({
      entityModule: event.entity_module,
      entityId: event.entity_id,
      locale: event.locale,
      audience: event.audience,
      market: event.market,
    }),
  ]
}

const declarationsByEvent = new Map(
  catalogIndexSubscriberDeclarations.map((declaration) => [declaration.eventType, declaration]),
)

type CatalogIndexEventType = (typeof catalogIndexSubscriberDeclarations)[number]["eventType"]

function declaration(eventType: CatalogIndexEventType) {
  const value = declarationsByEvent.get(eventType)
  if (!value) throw new Error(`Catalog index subscriber declaration is missing "${eventType}".`)
  return value
}

function reindexDescriptor(
  eventType: CatalogIndexEventType,
  selectTargets: CatalogIndexSubscriberDescriptorOptions["selectTargets"],
) {
  return createCatalogReindexSubscriberDescriptor({
    ...declaration(eventType),
    selectTargets,
  })
}

export const catalogProductCreatedIndexSubscriber = reindexDescriptor(
  "product.created",
  selectEntityId,
)
export const catalogProductUpdatedIndexSubscriber = reindexDescriptor(
  "product.updated",
  selectEntityId,
)
export const catalogProductDeletedIndexSubscriber = createCatalogDeleteSubscriberDescriptor({
  ...declaration("product.deleted"),
  selectTargets: selectEntityId,
})
export const catalogProductContentChangedIndexSubscriber = reindexDescriptor(
  "product.content.changed",
  selectEntityId,
)
export const catalogAvailabilityChangedIndexSubscriber = reindexDescriptor(
  "availability.slot.changed",
  selectOptionalProductId,
)
export const catalogPricingChangedIndexSubscriber = reindexDescriptor(
  "pricing.rule.changed",
  selectOptionalProductId,
)
export const catalogPublicationChangedIndexSubscriber = reindexDescriptor(
  "product.publication.changed",
  selectOptionalProductId,
)
export const catalogPromotionChangedIndexSubscriber = reindexDescriptor(
  "promotion.changed",
  selectPromotionProducts,
)
export const catalogEntityOverlayChangedIndexSubscriber = {
  ...declaration("catalog.entity.overlay.changed"),
  register(context) {
    context.eventBus.subscribe(
      "catalog.entity.overlay.changed",
      async ({ data }) => {
        const event = overlayChangedPayloadSchema.parse(data)
        const runtime = resolveRuntime(context)
        if (runtime.reindexReferencedSubject) {
          await runtime.reindexReferencedSubject(event)
          return
        }
        for (const target of selectOverlayChangedEntity(event)) {
          await runtime.reindexEntity(target)
        }
      },
      { inline: false },
    )
  },
} satisfies CatalogIndexSubscriberRuntimeDescriptor

export const catalogIndexSubscriberRuntimeDescriptors = [
  catalogProductCreatedIndexSubscriber,
  catalogProductUpdatedIndexSubscriber,
  catalogProductDeletedIndexSubscriber,
  catalogProductContentChangedIndexSubscriber,
  catalogAvailabilityChangedIndexSubscriber,
  catalogPricingChangedIndexSubscriber,
  catalogPublicationChangedIndexSubscriber,
  catalogPromotionChangedIndexSubscriber,
  catalogEntityOverlayChangedIndexSubscriber,
] as const

function createCatalogIndexSubscriberGraphRuntime(descriptor: SubscriberRuntimeDescriptor) {
  return defineGraphRuntimeFactory(async ({ getPort }) => {
    const provider = await getPort(catalogProjectionRuntimePort)
    return {
      ...descriptor,
      register: async (context: BootstrapContext) => {
        context.container.register(
          CATALOG_PROJECTION_RUNTIME_CONTAINER_KEY,
          await provider.createRuntime(context.bindings),
        )
        await descriptor.register(context)
      },
    }
  })
}

export const createCatalogProductCreatedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogProductCreatedIndexSubscriber)
export const createCatalogProductUpdatedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogProductUpdatedIndexSubscriber)
export const createCatalogProductDeletedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogProductDeletedIndexSubscriber)
export const createCatalogProductContentChangedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogProductContentChangedIndexSubscriber)
export const createCatalogAvailabilityChangedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogAvailabilityChangedIndexSubscriber)
export const createCatalogPricingChangedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogPricingChangedIndexSubscriber)
export const createCatalogPublicationChangedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogPublicationChangedIndexSubscriber)
export const createCatalogPromotionChangedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogPromotionChangedIndexSubscriber)
export const createCatalogEntityOverlayChangedIndexSubscriberGraphRuntime =
  createCatalogIndexSubscriberGraphRuntime(catalogEntityOverlayChangedIndexSubscriber)
