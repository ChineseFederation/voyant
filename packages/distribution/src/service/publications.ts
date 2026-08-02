// agent-quality: file-size exception -- publication mutation and durable intent enqueue stay transactionally colocated.
import type { EventBus } from "@voyant-travel/core"
import { RequestValidationError } from "@voyant-travel/hono"
import { and, desc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { emitProductPublicationChanged } from "../events.js"
import { publicationProductsRef } from "../publication-product-ref.js"
import { resolveEffectivePublication } from "../publication-resolver.js"
import {
  channelProductPublications,
  channelPublicationReindexIntents,
  channelSupplierPublications,
  channels,
} from "../schema.js"
import { ensureSupplierExists } from "../suppliers/service-shared.js"
import { paginate } from "./helpers.js"
import type {
  ChannelProductPublicationListQuery,
  ChannelSupplierPublicationListQuery,
  CreateChannelProductPublicationInput,
  CreateChannelSupplierPublicationInput,
  EffectivePublicationInput,
  PreviewChannelSupplierPublicationInput,
  UpdateChannelProductPublicationInput,
  UpdateChannelSupplierPublicationInput,
} from "./types.js"

async function readChannelStatus(db: PostgresJsDatabase, channelId: string) {
  const [channel] = await db
    .select({ id: channels.id, status: channels.status })
    .from(channels)
    .where(eq(channels.id, channelId))
    .limit(1)
  return channel ?? null
}

async function requireChannel(db: PostgresJsDatabase, channelId: string) {
  const channel = await readChannelStatus(db, channelId)
  if (!channel) {
    throw new RequestValidationError("Channel not found", {
      fields: { channelId: ["Channel not found"] },
    })
  }
  return channel
}

async function readProductSupplierId(db: PostgresJsDatabase, productId: string) {
  const [row] = await db
    .select({ id: publicationProductsRef.id, supplierId: publicationProductsRef.supplierId })
    .from(publicationProductsRef)
    .where(eq(publicationProductsRef.id, productId))
    .limit(1)
  return row?.supplierId ?? null
}

async function requireProduct(db: PostgresJsDatabase, productId: string) {
  const [row] = await db
    .select({ id: publicationProductsRef.id })
    .from(publicationProductsRef)
    .where(eq(publicationProductsRef.id, productId))
    .limit(1)
  if (!row) {
    throw new RequestValidationError("Product not found", {
      fields: { productId: ["Product not found"] },
    })
  }
}

async function enqueueProductPublicationReindex(
  db: PostgresJsDatabase,
  input: { channelId?: string | null; productId: string; requestedBy?: string | null },
) {
  await db
    .insert(channelPublicationReindexIntents)
    .values({
      channelId: input.channelId ?? null,
      kind: "product",
      productId: input.productId,
      requestedBy: input.requestedBy ?? null,
    })
    .onConflictDoNothing()
}

async function enqueueSupplierPublicationReindex(
  db: PostgresJsDatabase,
  input: { channelId?: string | null; supplierId: string; requestedBy?: string | null },
) {
  await db
    .insert(channelPublicationReindexIntents)
    .values({
      channelId: input.channelId ?? null,
      kind: "supplier",
      supplierId: input.supplierId,
      requestedBy: input.requestedBy ?? null,
    })
    .onConflictDoNothing()
}

async function listActiveChannelIds(db: PostgresJsDatabase) {
  const rows = await db
    .select({ id: channels.id })
    .from(channels)
    .where(eq(channels.status, "active"))
  return rows.map(({ id }) => id)
}

async function listVisibleProductIds(db: PostgresJsDatabase) {
  const rows = await db
    .select({ id: publicationProductsRef.id })
    .from(publicationProductsRef)
    .where(
      and(
        eq(publicationProductsRef.status, "active"),
        eq(publicationProductsRef.visibility, "public"),
      ),
    )
  return rows.map(({ id }) => id)
}

async function enqueueProductPublicationReindexForChannels(
  db: PostgresJsDatabase,
  input: { productId: string; channelIds: readonly string[]; requestedBy?: string | null },
) {
  for (const channelId of new Set(input.channelIds)) {
    await enqueueProductPublicationReindex(db, {
      channelId,
      productId: input.productId,
      requestedBy: input.requestedBy ?? null,
    })
  }
}

async function enqueueGlobalProductReindex(
  db: PostgresJsDatabase,
  input: { productId: string; requestedBy?: string | null },
) {
  await enqueueProductPublicationReindex(db, {
    channelId: null,
    productId: input.productId,
    requestedBy: input.requestedBy ?? null,
  })
}

async function enqueueSupplierPublicationReindexForChannels(
  db: PostgresJsDatabase,
  input: { supplierId: string; channelIds: readonly string[]; requestedBy?: string | null },
) {
  for (const channelId of new Set(input.channelIds)) {
    await enqueueSupplierPublicationReindex(db, {
      channelId,
      supplierId: input.supplierId,
      requestedBy: input.requestedBy ?? null,
    })
  }
}

async function emitPublicationChanged(
  eventBus: EventBus | undefined,
  db: PostgresJsDatabase,
  input: {
    channelId: string
    productId: string
    publicationId: string | null
    operation: "created" | "updated" | "deleted"
  },
) {
  await emitProductPublicationChanged(eventBus, db, {
    channelId: input.channelId,
    productId: input.productId,
    publicationId: input.publicationId,
    operation: input.operation,
  })
}

export const publicationServiceOperations = {
  async listProductPublications(db: PostgresJsDatabase, query: ChannelProductPublicationListQuery) {
    const conditions = []
    if (query.channelId) conditions.push(eq(channelProductPublications.channelId, query.channelId))
    if (query.productId) conditions.push(eq(channelProductPublications.productId, query.productId))
    if (query.decision) conditions.push(eq(channelProductPublications.decision, query.decision))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(channelProductPublications)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(channelProductPublications.updatedAt)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(channelProductPublications)
        .where(where),
      query.limit,
      query.offset,
    )
  },

  async getProductPublicationById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(channelProductPublications)
      .where(eq(channelProductPublications.id, id))
      .limit(1)
    return row ?? null
  },

  async getProductPublicationForSubject(
    db: PostgresJsDatabase,
    input: { channelId: string; productId: string },
  ) {
    const [row] = await db
      .select()
      .from(channelProductPublications)
      .where(
        and(
          eq(channelProductPublications.channelId, input.channelId),
          eq(channelProductPublications.productId, input.productId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async upsertProductPublication(
    db: PostgresJsDatabase,
    data: CreateChannelProductPublicationInput,
    options: { eventBus?: EventBus; actorId?: string | null } = {},
  ) {
    const actorId = data.updatedBy ?? options.actorId ?? null
    const { existing, row } = await db.transaction(async (tx) => {
      await requireChannel(tx, data.channelId)
      await requireProduct(tx, data.productId)
      const now = new Date()
      const existing = await publicationServiceOperations.getProductPublicationForSubject(tx, data)
      const [row] = await tx
        .insert(channelProductPublications)
        .values({
          ...data,
          createdBy: data.createdBy ?? actorId,
          updatedBy: actorId,
        })
        .onConflictDoUpdate({
          target: [channelProductPublications.channelId, channelProductPublications.productId],
          set: {
            decision: data.decision,
            reason: data.reason ?? null,
            updatedBy: actorId,
            metadata: data.metadata ?? null,
            updatedAt: now,
          },
        })
        .returning()
      await enqueueProductPublicationReindex(tx, {
        channelId: data.channelId,
        productId: data.productId,
        requestedBy: actorId,
      })
      return { existing, row: row! }
    })
    await emitPublicationChanged(options.eventBus, db, {
      channelId: data.channelId,
      productId: data.productId,
      publicationId: row?.id ?? null,
      operation: existing ? "updated" : "created",
    })
    return row
  },

  async updateProductPublication(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateChannelProductPublicationInput,
    options: { eventBus?: EventBus; actorId?: string | null } = {},
  ) {
    const actorId = data.updatedBy ?? options.actorId ?? null
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          channelId: channelProductPublications.channelId,
          productId: channelProductPublications.productId,
        })
        .from(channelProductPublications)
        .where(eq(channelProductPublications.id, id))
        .limit(1)
      if (!existing) return null
      const [row] = await tx
        .update(channelProductPublications)
        .set({ ...data, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(channelProductPublications.id, id))
        .returning()
      await enqueueProductPublicationReindex(tx, { ...existing, requestedBy: actorId })
      return { existing, row: row ?? null }
    })
    if (!outcome) return null
    await emitPublicationChanged(options.eventBus, db, {
      ...outcome.existing,
      publicationId: outcome.row?.id ?? null,
      operation: "updated",
    })
    return outcome.row
  },

  async deleteProductPublication(
    db: PostgresJsDatabase,
    id: string,
    options: { eventBus?: EventBus; actorId?: string | null } = {},
  ) {
    const row = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(channelProductPublications)
        .where(eq(channelProductPublications.id, id))
        .returning({
          id: channelProductPublications.id,
          channelId: channelProductPublications.channelId,
          productId: channelProductPublications.productId,
        })
      if (!row) return null
      await enqueueProductPublicationReindex(tx, {
        channelId: row.channelId,
        productId: row.productId,
        requestedBy: options.actorId ?? null,
      })
      return row
    })
    if (!row) return null
    await emitPublicationChanged(options.eventBus, db, {
      ...row,
      publicationId: row.id,
      operation: "deleted",
    })
    return { id: row.id }
  },

  async listSupplierPublications(
    db: PostgresJsDatabase,
    query: ChannelSupplierPublicationListQuery,
  ) {
    const conditions = []
    if (query.channelId) conditions.push(eq(channelSupplierPublications.channelId, query.channelId))
    if (query.supplierId)
      conditions.push(eq(channelSupplierPublications.supplierId, query.supplierId))
    if (query.decision) conditions.push(eq(channelSupplierPublications.decision, query.decision))
    const where = conditions.length ? and(...conditions) : undefined
    return paginate(
      db
        .select()
        .from(channelSupplierPublications)
        .where(where)
        .limit(query.limit)
        .offset(query.offset)
        .orderBy(desc(channelSupplierPublications.updatedAt)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(channelSupplierPublications)
        .where(where),
      query.limit,
      query.offset,
    )
  },

  async getSupplierPublicationById(db: PostgresJsDatabase, id: string) {
    const [row] = await db
      .select()
      .from(channelSupplierPublications)
      .where(eq(channelSupplierPublications.id, id))
      .limit(1)
    return row ?? null
  },

  async getSupplierPublicationForSubject(
    db: PostgresJsDatabase,
    input: { channelId: string; supplierId: string },
  ) {
    const [row] = await db
      .select()
      .from(channelSupplierPublications)
      .where(
        and(
          eq(channelSupplierPublications.channelId, input.channelId),
          eq(channelSupplierPublications.supplierId, input.supplierId),
        ),
      )
      .limit(1)
    return row ?? null
  },

  async countProductsForSupplier(db: PostgresJsDatabase, supplierId: string) {
    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(publicationProductsRef)
      .where(eq(publicationProductsRef.supplierId, supplierId))
    return row?.count ?? 0
  },

  async captureChannelDeletionReindex(db: PostgresJsDatabase, input: { channelId: string }) {
    // Capture before the channel cascade removes its publication rules and
    // intents. Global product intents survive that cascade and make removal
    // from every channel-scoped projection durable after commit.
    const result = await db.execute(sql<{ id: string }>`
      SELECT DISTINCT product.id
      FROM products product
      WHERE EXISTS (
        SELECT 1
        FROM channel_product_publications publication
        WHERE publication.channel_id = ${input.channelId}
          AND publication.product_id = product.id
      ) OR EXISTS (
        SELECT 1
        FROM channel_supplier_publications publication
        WHERE publication.channel_id = ${input.channelId}
          AND publication.supplier_id = product.supplier_id
      )
      ORDER BY product.id
    `)
    const resultRows: unknown[] = Array.isArray(result)
      ? result
      : ((result as { rows?: unknown[] }).rows ?? [])
    const productIds = resultRows.flatMap((row) => {
      if (typeof row !== "object" || row === null || !("id" in row)) return []
      return typeof row.id === "string" ? [row.id] : []
    })
    await publicationServiceOperations.enqueueCapturedProductLifecycleReindex(db, {
      productIds,
      requestedBy: "lifecycle:channel.deleted",
    })
    return productIds
  },

  async captureSupplierDeletionReindex(db: PostgresJsDatabase, input: { supplierId: string }) {
    const rows = await db
      .select({ id: publicationProductsRef.id })
      .from(publicationProductsRef)
      .where(eq(publicationProductsRef.supplierId, input.supplierId))
    const productIds = rows.map(({ id }) => id)

    // Supplier rules must not outlive their subject. Clear the legacy
    // canonical assignment mirror in the same transaction so orphaned IDs can
    // never keep a deleted supplier rule effective.
    await db
      .delete(channelSupplierPublications)
      .where(eq(channelSupplierPublications.supplierId, input.supplierId))
    await db
      .update(publicationProductsRef)
      .set({ supplierId: null })
      .where(eq(publicationProductsRef.supplierId, input.supplierId))
    await publicationServiceOperations.enqueueCapturedProductLifecycleReindex(db, {
      productIds,
      requestedBy: "lifecycle:supplier.deleted",
    })
    return productIds
  },

  async enqueueProductLifecycleReindex(
    db: PostgresJsDatabase,
    input: { productId: string; requestedBy?: string | null },
  ) {
    await enqueueGlobalProductReindex(db, {
      productId: input.productId,
      requestedBy: input.requestedBy ?? null,
    })
    return { enqueued: 1 }
  },

  async enqueueCapturedProductLifecycleReindex(
    db: PostgresJsDatabase,
    input: { productIds: readonly string[]; requestedBy?: string | null },
  ) {
    for (const productId of new Set(input.productIds)) {
      await enqueueGlobalProductReindex(db, {
        productId,
        requestedBy: input.requestedBy ?? null,
      })
    }
    return { enqueued: new Set(input.productIds).size }
  },

  async enqueueSupplierLifecycleReindex(
    db: PostgresJsDatabase,
    input: { supplierId: string; requestedBy?: string | null },
  ) {
    await enqueueSupplierPublicationReindex(db, {
      channelId: null,
      supplierId: input.supplierId,
      requestedBy: input.requestedBy ?? null,
    })
    return { enqueued: 1 }
  },

  async enqueueChannelLifecycleReindex(
    db: PostgresJsDatabase,
    input: { channelId: string; requestedBy?: string | null },
  ) {
    await requireChannel(db, input.channelId)
    const productIds = await listVisibleProductIds(db)
    await publicationServiceOperations.enqueueCapturedProductLifecycleReindex(db, {
      productIds,
      requestedBy: input.requestedBy ?? null,
    })
    return { enqueued: productIds.length }
  },

  async enqueueSupplierReassignmentReindex(
    db: PostgresJsDatabase,
    input: {
      productId: string
      previousSupplierId?: string | null
      nextSupplierId?: string | null
      requestedBy?: string | null
    },
  ) {
    const channelIds = await listActiveChannelIds(db)
    await enqueueProductPublicationReindexForChannels(db, {
      productId: input.productId,
      channelIds,
      requestedBy: input.requestedBy ?? null,
    })
    for (const supplierId of new Set([input.previousSupplierId, input.nextSupplierId])) {
      if (!supplierId) continue
      await enqueueSupplierPublicationReindexForChannels(db, {
        supplierId,
        channelIds,
        requestedBy: input.requestedBy ?? null,
      })
    }
    return { enqueued: channelIds.length }
  },

  async previewSupplierPublication(
    db: PostgresJsDatabase,
    data: PreviewChannelSupplierPublicationInput,
  ) {
    await requireChannel(db, data.channelId)
    await ensureSupplierExists(db, data.supplierId)
    const affectedProductCount = await publicationServiceOperations.countProductsForSupplier(
      db,
      data.supplierId,
    )
    return {
      input: data,
      affectedProductCount,
    }
  },

  async upsertSupplierPublication(
    db: PostgresJsDatabase,
    data: CreateChannelSupplierPublicationInput,
    options: { actorId?: string | null } = {},
  ) {
    const actorId = data.updatedBy ?? options.actorId ?? null
    const row = await db.transaction(async (tx) => {
      await requireChannel(tx, data.channelId)
      await ensureSupplierExists(tx, data.supplierId)
      const now = new Date()
      const [row] = await tx
        .insert(channelSupplierPublications)
        .values({
          ...data,
          createdBy: data.createdBy ?? actorId,
          updatedBy: actorId,
        })
        .onConflictDoUpdate({
          target: [channelSupplierPublications.channelId, channelSupplierPublications.supplierId],
          set: {
            decision: data.decision,
            reason: data.reason ?? null,
            updatedBy: actorId,
            metadata: data.metadata ?? null,
            updatedAt: now,
          },
        })
        .returning()
      await enqueueSupplierPublicationReindex(tx, {
        channelId: data.channelId,
        supplierId: data.supplierId,
        requestedBy: actorId,
      })
      return row!
    })
    const affectedProductCount = await publicationServiceOperations.countProductsForSupplier(
      db,
      data.supplierId,
    )
    return { publication: row, affectedProductCount }
  },

  async updateSupplierPublication(
    db: PostgresJsDatabase,
    id: string,
    data: UpdateChannelSupplierPublicationInput,
    options: { actorId?: string | null } = {},
  ) {
    const actorId = data.updatedBy ?? options.actorId ?? null
    const outcome = await db.transaction(async (tx) => {
      const [existing] = await tx
        .select({
          channelId: channelSupplierPublications.channelId,
          supplierId: channelSupplierPublications.supplierId,
        })
        .from(channelSupplierPublications)
        .where(eq(channelSupplierPublications.id, id))
        .limit(1)
      if (!existing) return null
      const [row] = await tx
        .update(channelSupplierPublications)
        .set({ ...data, updatedBy: actorId, updatedAt: new Date() })
        .where(eq(channelSupplierPublications.id, id))
        .returning()
      await enqueueSupplierPublicationReindex(tx, { ...existing, requestedBy: actorId })
      return { existing, row: row ?? null }
    })
    if (!outcome) return null
    const affectedProductCount = await publicationServiceOperations.countProductsForSupplier(
      db,
      outcome.existing.supplierId,
    )
    return outcome.row ? { publication: outcome.row, affectedProductCount } : null
  },

  async deleteSupplierPublication(
    db: PostgresJsDatabase,
    id: string,
    options: { actorId?: string | null } = {},
  ) {
    const row = await db.transaction(async (tx) => {
      const [row] = await tx
        .delete(channelSupplierPublications)
        .where(eq(channelSupplierPublications.id, id))
        .returning({
          id: channelSupplierPublications.id,
          channelId: channelSupplierPublications.channelId,
          supplierId: channelSupplierPublications.supplierId,
        })
      if (!row) return null
      await enqueueSupplierPublicationReindex(tx, {
        channelId: row.channelId,
        supplierId: row.supplierId,
        requestedBy: options.actorId ?? null,
      })
      return row
    })
    if (!row) return null
    return { id: row.id }
  },

  async getEffectivePublication(db: PostgresJsDatabase, input: EffectivePublicationInput) {
    const [channel, productRule] = await Promise.all([
      readChannelStatus(db, input.channelId),
      publicationServiceOperations.getProductPublicationForSubject(db, input),
    ])
    const canonicalSupplierId =
      input.canonicalSupplierId === undefined
        ? await readProductSupplierId(db, input.productId)
        : input.canonicalSupplierId
    const supplierRule = canonicalSupplierId
      ? await publicationServiceOperations.getSupplierPublicationForSubject(db, {
          channelId: input.channelId,
          supplierId: canonicalSupplierId,
        })
      : null

    return resolveEffectivePublication({
      channelId: input.channelId,
      productId: input.productId,
      canonicalSupplierId,
      channelStatus: channel?.status ?? null,
      productRule,
      supplierRule,
    })
  },

  async listPublicationReindexIntents(db: PostgresJsDatabase) {
    return db
      .select()
      .from(channelPublicationReindexIntents)
      .orderBy(desc(channelPublicationReindexIntents.requestedAt))
      .limit(200)
  },
}
