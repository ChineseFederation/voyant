import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { channels } from "./schema-core.js"
import {
  channelPublicationDecisionEnum,
  channelPublicationReindexIntentKindEnum,
  channelPublicationReindexIntentStatusEnum,
} from "./schema-shared.js"

export const channelProductPublications = pgTable(
  "channel_product_publications",
  {
    id: typeId("channel_product_publications"),
    channelId: typeIdRef("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    productId: typeIdRef("product_id").notNull(),
    decision: channelPublicationDecisionEnum("decision").notNull(),
    reason: text("reason"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_channel_product_publications_subject").on(table.channelId, table.productId),
    index("idx_channel_product_publications_channel").on(table.channelId, table.updatedAt),
    index("idx_channel_product_publications_product").on(table.productId, table.updatedAt),
    index("idx_channel_product_publications_decision").on(table.decision, table.updatedAt),
  ],
)

export const channelSupplierPublications = pgTable(
  "channel_supplier_publications",
  {
    id: typeId("channel_supplier_publications"),
    channelId: typeIdRef("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
    supplierId: typeIdRef("supplier_id").notNull(),
    decision: channelPublicationDecisionEnum("decision").notNull(),
    reason: text("reason"),
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uniq_channel_supplier_publications_subject").on(table.channelId, table.supplierId),
    index("idx_channel_supplier_publications_channel").on(table.channelId, table.updatedAt),
    index("idx_channel_supplier_publications_supplier").on(table.supplierId, table.updatedAt),
    index("idx_channel_supplier_publications_decision").on(table.decision, table.updatedAt),
  ],
)

export const channelPublicationReindexIntents = pgTable(
  "channel_publication_reindex_intents",
  {
    id: typeId("channel_publication_reindex_intents"),
    channelId: typeIdRef("channel_id").references(() => channels.id, { onDelete: "cascade" }),
    kind: channelPublicationReindexIntentKindEnum("kind").notNull(),
    productId: typeIdRef("product_id"),
    supplierId: typeIdRef("supplier_id"),
    cursor: text("cursor"),
    status: channelPublicationReindexIntentStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    leaseOwner: text("lease_owner"),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    requestedBy: text("requested_by"),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    requestedAt: timestamp("requested_at", { withTimezone: true }).notNull().defaultNow(),
    processingStartedAt: timestamp("processing_started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_channel_pub_reindex_pending").on(table.status, table.requestedAt),
    index("idx_channel_pub_reindex_ready").on(table.status, table.nextAttemptAt, table.requestedAt),
    index("idx_channel_pub_reindex_channel").on(table.channelId, table.requestedAt),
    index("idx_channel_pub_reindex_product").on(table.productId, table.requestedAt),
    index("idx_channel_pub_reindex_supplier").on(table.supplierId, table.requestedAt),
    uniqueIndex("uniq_channel_pub_reindex_product_pending")
      .on(table.channelId, table.kind, table.productId)
      // agent-quality: raw-sql reviewed -- owner: distribution; static partial-index predicate.
      .where(sql`${table.status} = 'pending' AND ${table.productId} IS NOT NULL`),
    uniqueIndex("uniq_channel_pub_reindex_supplier_pending")
      .on(table.channelId, table.kind, table.supplierId)
      // agent-quality: raw-sql reviewed -- owner: distribution; static partial-index predicate.
      .where(sql`${table.status} = 'pending' AND ${table.supplierId} IS NOT NULL`),
    uniqueIndex("uniq_channel_pub_reindex_global_product_pending")
      .on(table.kind, table.productId)
      .where(
        sql`${table.status} = 'pending' AND ${table.channelId} IS NULL AND ${table.productId} IS NOT NULL`,
      ),
    uniqueIndex("uniq_channel_pub_reindex_global_supplier_pending")
      .on(table.kind, table.supplierId)
      .where(
        sql`${table.status} = 'pending' AND ${table.channelId} IS NULL AND ${table.supplierId} IS NOT NULL`,
      ),
    uniqueIndex("uniq_channel_pub_reindex_catalog_pending")
      .on(table.kind)
      .where(sql`${table.status} = 'pending' AND ${table.kind} = 'catalog'`),
    check(
      "ck_channel_pub_reindex_subject",
      sql`((${table.kind} = 'product' AND ${table.productId} IS NOT NULL AND ${table.supplierId} IS NULL) OR (${table.kind} = 'supplier' AND ${table.supplierId} IS NOT NULL AND ${table.productId} IS NULL) OR (${table.kind} = 'catalog' AND ${table.channelId} IS NULL AND ${table.productId} IS NULL AND ${table.supplierId} IS NULL))`,
    ),
  ],
)

/** Immutable, linear product set captured for the one-time publication cutover. */
export const channelPublicationBackfillProducts = pgTable(
  "channel_publication_backfill_products",
  {
    intentId: typeIdRef("intent_id")
      .notNull()
      .references(() => channelPublicationReindexIntents.id, { onDelete: "cascade" }),
    productId: typeIdRef("product_id").notNull(),
  },
  (table) => [primaryKey({ columns: [table.intentId, table.productId] })],
)

/** Immutable, linear channel set captured for the one-time publication cutover. */
export const channelPublicationBackfillChannels = pgTable(
  "channel_publication_backfill_channels",
  {
    intentId: typeIdRef("intent_id")
      .notNull()
      .references(() => channelPublicationReindexIntents.id, { onDelete: "cascade" }),
    channelId: typeIdRef("channel_id")
      .notNull()
      .references(() => channels.id, { onDelete: "cascade" }),
  },
  (table) => [primaryKey({ columns: [table.intentId, table.channelId] })],
)

export type ChannelProductPublication = typeof channelProductPublications.$inferSelect
export type NewChannelProductPublication = typeof channelProductPublications.$inferInsert
export type ChannelSupplierPublication = typeof channelSupplierPublications.$inferSelect
export type NewChannelSupplierPublication = typeof channelSupplierPublications.$inferInsert
export type ChannelPublicationReindexIntent = typeof channelPublicationReindexIntents.$inferSelect
export type NewChannelPublicationReindexIntent =
  typeof channelPublicationReindexIntents.$inferInsert
