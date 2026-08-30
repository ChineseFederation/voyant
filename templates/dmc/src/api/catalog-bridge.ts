/**
 * Catalog bridge — wires module CRUD + lifecycle events into the catalog
 * plane so Typesense stays in sync without manual reindex runs and so
 * booking commits freeze a snapshot of every line item's resolved view.
 *
 * Subscriptions:
 *   - `product.created`  → reindex the product across DEFAULT_SLICES
 *   - `product.updated`  → reindex the product
 *   - `product.deleted`  → delete from every configured slice
 *   - `booking.confirmed` → capture a snapshot graph of the booking's
 *                            product line items via `captureSnapshotGraph`
 *
 * If Typesense isn't configured (no `TYPESENSE_HOST`), the indexer
 * handlers no-op silently. Snapshot capture only requires DB access, so
 * it runs even when search infra isn't set up.
 */

import { bookingItems } from "@voyantjs/bookings/schema"
import {
  type CaptureSnapshotInput,
  captureSnapshotGraph,
  createIndexerService,
} from "@voyantjs/catalog"
import type { AnyDrizzleDb } from "@voyantjs/db"
import type { HonoBundle } from "@voyantjs/hono/plugin"
import {
  buildProductSnapshotInput,
  createProductDocumentBuilder,
} from "@voyantjs/products/service-catalog-plane"
import { and, eq, isNotNull } from "drizzle-orm"

import {
  buildEmbeddingProvider,
  buildTypesenseIndexer,
  DEFAULT_SLICES,
  getFieldPolicyRegistries,
  withEmbedding,
} from "./lib/catalog-runtime"
import { withDbFromEnv } from "./lib/db"

interface ProductEventPayload {
  id: string
}

interface BookingConfirmedEventPayload {
  bookingId: string
  bookingNumber: string
  actorId: string | null
}

export const catalogBridgeBundle: HonoBundle = {
  name: "catalog-bridge",
  bootstrap: ({ bindings, eventBus }) => {
    const env = bindings as CloudflareBindings & {
      TENANT_ID?: string
      TYPESENSE_HOST?: string
      TYPESENSE_ADMIN_API_KEY?: string
      TYPESENSE_API_KEY?: string
      VOYANT_CLOUD_API_KEY?: string
    }
    const sellerOperatorId = env.TENANT_ID ?? "default"

    // DMC 同时支持本机 PostgreSQL 与 Neon，索引上下文必须沿用统一数据库联合类型。
    function buildIndexerContext(db: AnyDrizzleDb) {
      const embeddings = buildEmbeddingProvider(env)
      const indexer = buildTypesenseIndexer(env, embeddings)
      if (!indexer) return null
      const slices = [...DEFAULT_SLICES]
      const service = createIndexerService({
        adapter: indexer,
        slices,
        registries: getFieldPolicyRegistries(),
      })
      const builder = withEmbedding(
        createProductDocumentBuilder(db, { sellerOperatorId }),
        embeddings,
      )
      return { service, builder }
    }

    eventBus.subscribe<ProductEventPayload>("product.created", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        const ctx = buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.ensureCollections()
        await ctx.service.reindexEntity("products", data.id, ctx.builder)
      })
    })

    eventBus.subscribe<ProductEventPayload>("product.updated", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        const ctx = buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.reindexEntity("products", data.id, ctx.builder)
      })
    })

    eventBus.subscribe<ProductEventPayload>("product.deleted", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        const ctx = buildIndexerContext(db)
        if (!ctx) return
        await ctx.service.deleteEntity("products", data.id)
      })
    })

    eventBus.subscribe<BookingConfirmedEventPayload>("booking.confirmed", async ({ data }) => {
      await withDbFromEnv(env, async (db) => {
        // Catalog snapshots use the staff resolver scope — they're an audit
        // record, not a customer-facing rendering. Booking-time prices /
        // descriptions stay readable to ops even after audience-scoped
        // overlays change.
        const scope = {
          locale: "en-GB",
          audience: "staff" as const,
          market: "default",
          actor: "staff" as const,
        }

        const items = await db
          .select({ productId: bookingItems.productId })
          .from(bookingItems)
          .where(and(eq(bookingItems.bookingId, data.bookingId), isNotNull(bookingItems.productId)))

        const productIds = Array.from(
          new Set(items.map((i) => i.productId).filter((id): id is string => Boolean(id))),
        )
        if (productIds.length === 0) return

        const inputs: Array<Omit<CaptureSnapshotInput, "bookingId">> = []
        for (const productId of productIds) {
          const input = await buildProductSnapshotInput(db, productId, {
            sellerOperatorId,
            scope,
          })
          if (input) inputs.push(input)
        }

        if (inputs.length > 0) {
          await captureSnapshotGraph(db, data.bookingId, inputs)
        }
      })
    })
  },
}
