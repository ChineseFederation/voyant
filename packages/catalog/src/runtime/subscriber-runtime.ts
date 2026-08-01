import type {
  CatalogBookingSnapshotExecutionContext,
  CatalogBookingSnapshotRuntime,
} from "@voyant-travel/catalog/booking-snapshot-subscriber"
import type { CatalogProjectionRuntime } from "@voyant-travel/catalog/projection-runtime"
import {
  createCatalogBookingSnapshotRuntimeAdapter,
  createCatalogProjectionRuntimeAdapter,
} from "@voyant-travel/catalog/runtime-support"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { and, eq, isNotNull } from "drizzle-orm"

import { bookingItemsRef } from "../booking-engine/bookings-ref.js"
import type { CatalogRuntimeServices } from "../runtime-contracts.js"
import { catalogRuntimeExtensions, catalogRuntimeHost } from "./host.js"

type CatalogSubscriberBindings = Record<string, unknown> & {
  TENANT_ID?: string
  VOYANT_CLOUD_API_KEY?: string
}

export function createOperatorCatalogProjectionRuntime(
  bindings: unknown,
  services: CatalogRuntimeServices,
): CatalogProjectionRuntime {
  const env = bindings as CatalogSubscriberBindings
  const sellerOperatorId = env.TENANT_ID ?? "default"
  const runtime = createCatalogProjectionRuntimeAdapter<CatalogSubscriberBindings, AnyDrizzleDb>({
    bindings: env,
    withDb: (bindings, operation) =>
      catalogRuntimeHost().database.transaction(bindings, (database) =>
        operation(database as AnyDrizzleDb),
      ),
    buildContext: async (db) => {
      const embeddings = services.buildEmbeddingProvider(env)
      const adapter = services.buildIndexer(env, embeddings)
      if (!adapter) return null
      return {
        adapter,
        slices: await services.loadSlices(db),
        registries: services.fieldPolicyRegistries(),
        builder: services.withEmbedding(
          services.createCatalogDocumentBuilder(db, { sellerOperatorId }),
          embeddings,
        ),
      }
    },
  })
  return {
    ...runtime,
    async reindexReferencedSubject(event) {
      const targets: Parameters<typeof runtime.reindexEntity>[0][] = []
      await catalogRuntimeHost().database.transaction(env, async (database) =>
        services.reindexReferencedSubjectOverlayChange(
          database as AnyDrizzleDb,
          event,
          async (target) => {
            targets.push(target)
          },
        ),
      )
      for (const target of targets) {
        await runtime.reindexEntity(target)
      }
    },
  }
}

export function createOperatorCatalogBookingSnapshotRuntime(
  bindings: unknown,
): CatalogBookingSnapshotRuntime {
  const env = bindings as CatalogSubscriberBindings

  return createCatalogBookingSnapshotRuntimeAdapter<CatalogSubscriberBindings, AnyDrizzleDb>({
    bindings: env,
    withDb: (bindings, operation) =>
      catalogRuntimeHost().database.transaction(bindings, (database) =>
        operation(database as AnyDrizzleDb),
      ),
    buildContext: async (db) => {
      const sellerOperatorId = env.TENANT_ID ?? "default"
      const context: CatalogBookingSnapshotExecutionContext = {
        db,
        sellerOperatorId,
        findBookingProductIds: async (bookingId) => {
          const items: { productId: string | null }[] = await db
            .select({ productId: bookingItemsRef.productId })
            .from(bookingItemsRef)
            .where(
              and(eq(bookingItemsRef.bookingId, bookingId), isNotNull(bookingItemsRef.productId)),
            )
          return items.map(({ productId }) => productId)
        },
        buildSnapshotInput: (productId, options) =>
          catalogRuntimeExtensions().inventory.buildSnapshotInput(db, productId, options),
      }
      return context
    },
  })
}
