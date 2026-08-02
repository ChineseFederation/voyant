import type { CatalogProjectionRuntime } from "@voyant-travel/catalog/projection-runtime"
import type { VoyantGraphRuntimeFactoryContext } from "@voyant-travel/core/project"
import { and, asc, eq, gt, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  type DistributionPublicationIntentWorkerDeps,
  distributionPublicationIntentWorkerRuntimePort,
} from "./publication-intent-runtime-port.js"
import { publicationProductsRef } from "./publication-product-ref.js"
import {
  channelProductPublications,
  channelPublicationBackfillChannels,
  channelPublicationBackfillProducts,
} from "./schema.js"

export {
  type DistributionPublicationIntentWorkerDeps,
  type DistributionPublicationIntentWorkerRuntime,
  distributionPublicationIntentWorkerRuntimePort,
} from "./publication-intent-runtime-port.js"

const DEFAULT_LEASE_MS = 2 * 60 * 1_000
const DEFAULT_MAX_INTENTS = 25
const DEFAULT_PRODUCT_BATCH_SIZE = 100
const DEFAULT_CHANNEL_BATCH_SIZE = 100
const DEFAULT_MAX_ATTEMPTS = 3
const DEFAULT_RETRY_DELAY_MS = 60_000

type ClaimedIntent = {
  id: string
  channelId: string | null
  kind: "product" | "supplier" | "catalog"
  productId: string | null
  supplierId: string | null
  cursor: string | null
  metadata: unknown
  attempts: number
  leaseOwner: string
}

export interface PublicationIntentWorkerOptions {
  leaseOwner?: string
  leaseMs?: number
  maxIntents?: number
  productBatchSize?: number
  channelBatchSize?: number
  maxAttempts?: number
  retryDelayMs?: number
}

function rowsOf<T>(result: unknown): T[] {
  return Array.isArray(result) ? (result as T[]) : ((result as { rows?: T[] })?.rows ?? [])
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

async function claimIntent(
  db: PostgresJsDatabase,
  leaseOwner: string,
  options: Required<Pick<PublicationIntentWorkerOptions, "leaseMs" | "maxAttempts">>,
) {
  // agent-quality: raw SQL required for atomic lease claim with FOR UPDATE SKIP LOCKED.
  const result = await db.execute(sql<ClaimedIntent>`
    WITH candidate AS (
      SELECT id
      FROM channel_publication_reindex_intents
      WHERE status IN ('pending', 'processing', 'failed')
        AND attempts < ${options.maxAttempts}
        AND next_attempt_at <= now()
        AND (
          status <> 'processing'
          OR lease_owner = ${leaseOwner}
          OR lease_until IS NULL
          OR lease_until < now()
        )
      ORDER BY requested_at, id
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    UPDATE channel_publication_reindex_intents intent
    SET status = 'processing',
        lease_owner = ${leaseOwner},
        lease_until = now() + (${options.leaseMs} * interval '1 millisecond'),
        processing_started_at = COALESCE(intent.processing_started_at, now()),
        updated_at = now(),
        last_error = NULL
    FROM candidate
    WHERE intent.id = candidate.id
    RETURNING
      intent.id,
      intent.channel_id AS "channelId",
      intent.kind,
      intent.product_id AS "productId",
      intent.supplier_id AS "supplierId",
      intent.cursor,
      intent.metadata,
      intent.attempts,
      intent.lease_owner AS "leaseOwner"
  `)

  return rowsOf<ClaimedIntent>(result)[0] ?? null
}

async function completeIntent(db: PostgresJsDatabase, intent: ClaimedIntent) {
  // agent-quality: raw SQL keeps lease-owner completion and snapshot cleanup atomic.
  await db.execute(sql`
    WITH completed AS (
      UPDATE channel_publication_reindex_intents
      SET status = 'completed',
          cursor = NULL,
          lease_owner = NULL,
          lease_until = NULL,
          completed_at = now(),
          updated_at = now()
      WHERE id = ${intent.id}
        AND status = 'processing'
        AND lease_owner = ${intent.leaseOwner}
      RETURNING id
    ), deleted_products AS (
      DELETE FROM channel_publication_backfill_products
      WHERE intent_id IN (SELECT id FROM completed)
    ), deleted_channels AS (
      DELETE FROM channel_publication_backfill_channels
      WHERE intent_id IN (SELECT id FROM completed)
    )
    SELECT id FROM completed
  `)
}

async function checkpointIntent(
  db: PostgresJsDatabase,
  intent: ClaimedIntent,
  cursor: string,
  leaseMs: number,
) {
  // Keep ownership while cursoring. A concurrent enqueue may legitimately create
  // a fresh pending row for the same subject; transitioning this row back to
  // pending would race that insert and violate the partial unique index.
  await db.execute(sql`
    UPDATE channel_publication_reindex_intents
    SET cursor = ${cursor},
        lease_until = now() + (${leaseMs} * interval '1 millisecond'),
        next_attempt_at = now(),
        updated_at = now()
    WHERE id = ${intent.id}
      AND status = 'processing'
      AND lease_owner = ${intent.leaseOwner}
  `)
}

async function failIntent(
  db: PostgresJsDatabase,
  intent: ClaimedIntent,
  input: { error: string; retryDelayMs: number },
) {
  // Failed rows are retryable by claimIntent until maxAttempts. Keeping the row
  // out of `pending` avoids racing a concurrently enqueued pending successor.
  await db.execute(sql`
    UPDATE channel_publication_reindex_intents
    SET status = 'failed',
        attempts = attempts + 1,
        lease_owner = NULL,
        lease_until = NULL,
        next_attempt_at = now() + (${input.retryDelayMs} * interval '1 millisecond'),
        last_error = ${input.error},
        updated_at = now()
    WHERE id = ${intent.id}
      AND status = 'processing'
      AND lease_owner = ${intent.leaseOwner}
  `)
}

async function listSupplierProductIds(
  db: PostgresJsDatabase,
  input: { supplierId: string; afterId?: string | null; limit: number },
) {
  const result = await db
    .select({ id: publicationProductsRef.id })
    .from(publicationProductsRef)
    .where(
      input.afterId
        ? and(
            eq(publicationProductsRef.supplierId, input.supplierId),
            gt(publicationProductsRef.id, input.afterId),
          )
        : eq(publicationProductsRef.supplierId, input.supplierId),
    )
    .orderBy(asc(publicationProductsRef.id))
    .limit(input.limit)

  return result.map(({ id }) => id)
}

async function listBackfillProductIdsPage(
  db: PostgresJsDatabase,
  input: { intentId: string; afterId: string | null; limit: number },
) {
  const result = await db
    .select({ id: channelPublicationBackfillProducts.productId })
    .from(channelPublicationBackfillProducts)
    .where(
      and(
        eq(channelPublicationBackfillProducts.intentId, input.intentId),
        input.afterId ? gt(channelPublicationBackfillProducts.productId, input.afterId) : undefined,
      ),
    )
    .orderBy(asc(channelPublicationBackfillProducts.productId))
    .limit(input.limit)
  return result.map(({ id }) => id)
}

async function listBackfillChannelIdsPage(
  db: PostgresJsDatabase,
  input: { intentId: string; afterId: string | null; limit: number },
) {
  const rows = await db
    .select({ id: channelPublicationBackfillChannels.channelId })
    .from(channelPublicationBackfillChannels)
    .where(
      and(
        eq(channelPublicationBackfillChannels.intentId, input.intentId),
        input.afterId ? gt(channelPublicationBackfillChannels.channelId, input.afterId) : undefined,
      ),
    )
    .orderBy(asc(channelPublicationBackfillChannels.channelId))
    .limit(input.limit)
  return rows.map(({ id }) => id)
}

async function publishPriorVisibleProduct(
  db: PostgresJsDatabase,
  input: { productId: string; channelIds: readonly string[] },
) {
  if (input.channelIds.length === 0) return
  await db
    .insert(channelProductPublications)
    .values(
      input.channelIds.map((channelId) => ({
        channelId,
        productId: input.productId,
        decision: "include" as const,
        reason:
          "Backfilled from prior active public catalog visibility during publication cutover.",
        createdBy: "system:worker:prior-visible-catalog-backfill",
        updatedBy: "system:worker:prior-visible-catalog-backfill",
        metadata: { source: "prior_active_public_catalog" },
      })),
    )
    .onConflictDoNothing()
}

type CatalogBackfillCursor = {
  afterProductId: string | null
  productId: string | null
  afterChannelId: string | null
}

function parseCatalogCursor(cursor: string | null): CatalogBackfillCursor {
  if (!cursor) return { afterProductId: null, productId: null, afterChannelId: null }
  const parsed = JSON.parse(cursor) as Partial<CatalogBackfillCursor>
  return {
    afterProductId: typeof parsed.afterProductId === "string" ? parsed.afterProductId : null,
    productId: typeof parsed.productId === "string" ? parsed.productId : null,
    afterChannelId: typeof parsed.afterChannelId === "string" ? parsed.afterChannelId : null,
  }
}

function hasLinearCatalogSnapshot(metadata: unknown) {
  if (metadata === null || typeof metadata !== "object") return false
  const snapshot = metadata as {
    snapshotVersion?: unknown
    productSnapshotCount?: unknown
    channelSnapshotCount?: unknown
  }
  return (
    snapshot.snapshotVersion === "linear-v1" &&
    Number.isInteger(snapshot.productSnapshotCount) &&
    (snapshot.productSnapshotCount as number) >= 0 &&
    Number.isInteger(snapshot.channelSnapshotCount) &&
    (snapshot.channelSnapshotCount as number) >= 0
  )
}

async function processCatalogBackfillIntent(
  db: PostgresJsDatabase,
  projection: CatalogProjectionRuntime,
  intent: ClaimedIntent,
  options: { productBatchSize: number; channelBatchSize: number; leaseMs: number },
) {
  const cursor = parseCatalogCursor(intent.cursor)
  // Never widen a legacy or malformed catalog intent into current live state.
  if (!hasLinearCatalogSnapshot(intent.metadata)) {
    await completeIntent(db, intent)
    return
  }
  const productId =
    cursor.productId ??
    (
      await listBackfillProductIdsPage(db, {
        intentId: intent.id,
        afterId: cursor.afterProductId,
        limit: 1,
      })
    )[0]
  if (!productId) {
    await completeIntent(db, intent)
    return
  }

  const channelIds = await listBackfillChannelIdsPage(db, {
    intentId: intent.id,
    afterId: cursor.productId ? cursor.afterChannelId : null,
    limit: options.channelBatchSize,
  })
  await publishPriorVisibleProduct(db, { productId, channelIds })

  const lastChannelId = channelIds[channelIds.length - 1]
  if (channelIds.length === options.channelBatchSize && lastChannelId) {
    await checkpointIntent(
      db,
      intent,
      JSON.stringify({
        afterProductId: cursor.afterProductId,
        productId,
        afterChannelId: lastChannelId,
      } satisfies CatalogBackfillCursor),
      options.leaseMs,
    )
    return
  }

  await projection.reindexEntity({ entityModule: "products", entityId: productId })
  await checkpointIntent(
    db,
    intent,
    JSON.stringify({
      afterProductId: productId,
      productId: null,
      afterChannelId: null,
    } satisfies CatalogBackfillCursor),
    options.leaseMs,
  )
}

async function processIntent(
  db: PostgresJsDatabase,
  projection: CatalogProjectionRuntime,
  intent: ClaimedIntent,
  options: Required<
    Pick<
      PublicationIntentWorkerOptions,
      "productBatchSize" | "channelBatchSize" | "retryDelayMs" | "leaseMs"
    >
  >,
) {
  try {
    if (intent.kind === "product") {
      if (!intent.productId) throw new Error("product intent is missing productId")
      await projection.reindexEntity({ entityModule: "products", entityId: intent.productId })
      await completeIntent(db, intent)
      return
    }

    if (intent.kind === "catalog") {
      await processCatalogBackfillIntent(db, projection, intent, options)
      return
    }

    const productIds = intent.supplierId
      ? await listSupplierProductIds(db, {
          supplierId: intent.supplierId,
          afterId: intent.cursor,
          limit: options.productBatchSize,
        })
      : (() => {
          throw new Error("supplier intent is missing supplierId")
        })()
    if (productIds.length === 0) {
      await completeIntent(db, intent)
      return
    }

    for (const productId of productIds) {
      await projection.reindexEntity({ entityModule: "products", entityId: productId })
    }

    const lastProductId = productIds[productIds.length - 1]
    if (productIds.length < options.productBatchSize || !lastProductId) {
      await completeIntent(db, intent)
      return
    }

    await checkpointIntent(db, intent, lastProductId, options.leaseMs)
  } catch (error) {
    await failIntent(db, intent, {
      error: errorMessage(error),
      retryDelayMs: options.retryDelayMs,
    })
    throw error
  }
}

export async function drainPublicationReindexIntents(
  deps: DistributionPublicationIntentWorkerDeps,
  options: PublicationIntentWorkerOptions = {},
) {
  const db = deps.db as PostgresJsDatabase
  const leaseOwner = options.leaseOwner ?? crypto.randomUUID()
  const settings = {
    leaseMs: options.leaseMs ?? DEFAULT_LEASE_MS,
    maxIntents: options.maxIntents ?? DEFAULT_MAX_INTENTS,
    productBatchSize: options.productBatchSize ?? DEFAULT_PRODUCT_BATCH_SIZE,
    channelBatchSize: options.channelBatchSize ?? DEFAULT_CHANNEL_BATCH_SIZE,
    maxAttempts: options.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    retryDelayMs: options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS,
  }
  let processed = 0

  while (processed < settings.maxIntents) {
    const intent = await claimIntent(db, leaseOwner, settings)
    if (!intent) break
    try {
      await processIntent(db, deps.projection, intent, settings)
      processed += 1
    } catch (error) {
      deps.report?.("[distribution-publication-intents] intent failed", {
        intentId: intent.id,
        error: errorMessage(error),
      })
      processed += 1
    }
  }

  return { processed }
}

export async function runDistributionPublicationIntentWorkerJob(
  context: VoyantGraphRuntimeFactoryContext,
): Promise<void> {
  const runtime = await context.getPort(distributionPublicationIntentWorkerRuntimePort)
  await runtime.withDeps(context.bindings, (deps) => drainPublicationReindexIntents(deps))
}
