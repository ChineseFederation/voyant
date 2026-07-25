import type { NamespacedCustomFieldValues } from "@voyant-travel/core/custom-fields"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import {
  entityTypeEnum,
  participantRoleEnum,
  quoteStatusEnum,
  quoteVersionStatusEnum,
} from "./schema-shared.js"

export const pipelines = pgTable(
  "pipelines",
  {
    id: typeId("pipelines"),
    entityType: entityTypeEnum("entity_type").notNull().default("quote"),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_pipelines_entity").on(table.entityType),
    index("idx_pipelines_sort").on(table.sortOrder, table.createdAt),
    index("idx_pipelines_entity_sort").on(table.entityType, table.sortOrder, table.createdAt),
    uniqueIndex("uidx_pipelines_entity_name").on(table.entityType, table.name),
  ],
)

export const stages = pgTable(
  "stages",
  {
    id: typeId("stages"),
    pipelineId: typeIdRef("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    sortOrder: integer("sort_order").notNull().default(0),
    probability: integer("probability"),
    isClosed: boolean("is_closed").notNull().default(false),
    isWon: boolean("is_won").notNull().default(false),
    isLost: boolean("is_lost").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_stages_pipeline").on(table.pipelineId),
    index("idx_stages_sort").on(table.sortOrder, table.createdAt),
    index("idx_stages_pipeline_sort").on(table.pipelineId, table.sortOrder, table.createdAt),
    uniqueIndex("uidx_stages_pipeline_name").on(table.pipelineId, table.name),
  ],
)

export const quotes = pgTable(
  "quotes",
  {
    id: typeId("quotes"),
    title: text("title").notNull(),
    personId: typeIdRef("person_id"),
    organizationId: typeIdRef("organization_id"),
    pipelineId: typeIdRef("pipeline_id")
      .notNull()
      .references(() => pipelines.id, { onDelete: "restrict" }),
    stageId: typeIdRef("stage_id")
      .notNull()
      .references(() => stages.id, { onDelete: "restrict" }),
    ownerId: text("owner_id"),
    status: quoteStatusEnum("status").notNull().default("open"),
    acceptedVersionId: typeIdRef("accepted_version_id"),
    valueAmountCents: integer("value_amount_cents"),
    valueCurrency: text("value_currency"),
    /** Headcount (PAX). Known even when individual travelers aren't named yet. */
    paxCount: integer("pax_count"),
    expectedCloseDate: date("expected_close_date"),
    source: text("source"),
    sourceRef: text("source_ref"),
    lostReason: text("lost_reason"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** Unified custom fields — see the custom-fields unification ADR. */
    customFields: jsonb("custom_fields").$type<NamespacedCustomFieldValues>().notNull().default({}),
    /** Free-text proposal description shown to the client; snapshotted into version notes. */
    description: text("description"),
    /** Audit: the acting user (staff id) who created / last changed the quote. */
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_quotes_person").on(table.personId),
    index("idx_quotes_org").on(table.organizationId),
    index("idx_quotes_pipeline").on(table.pipelineId),
    index("idx_quotes_stage").on(table.stageId),
    index("idx_quotes_owner").on(table.ownerId),
    index("idx_quotes_status").on(table.status),
    index("idx_quotes_accepted_version").on(table.acceptedVersionId),
    index("idx_quotes_person_updated").on(table.personId, table.updatedAt),
    index("idx_quotes_org_updated").on(table.organizationId, table.updatedAt),
    index("idx_quotes_pipeline_updated").on(table.pipelineId, table.updatedAt),
    index("idx_quotes_stage_updated").on(table.stageId, table.updatedAt),
    index("idx_quotes_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_quotes_status_updated").on(table.status, table.updatedAt),
  ],
)

export const quoteParticipants = pgTable(
  "quote_participants",
  {
    id: typeId("quote_participants"),
    quoteId: typeIdRef("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    personId: typeIdRef("person_id").notNull(),
    role: participantRoleEnum("role").notNull().default("other"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_quote_participants_quote").on(table.quoteId),
    index("idx_quote_participants_quote_primary").on(
      table.quoteId,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_quote_participants_person").on(table.personId),
    uniqueIndex("uidx_quote_participants_unique").on(table.quoteId, table.personId),
  ],
)

export const quoteProducts = pgTable(
  "quote_products",
  {
    id: typeId("quote_products"),
    quoteId: typeIdRef("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    supplierServiceId: text("supplier_service_id"),
    nameSnapshot: text("name_snapshot").notNull(),
    description: text("description"),
    quantity: integer("quantity").notNull().default(1),
    unitPriceAmountCents: integer("unit_price_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    currency: text("currency"),
    discountAmountCents: integer("discount_amount_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_quote_products_quote").on(table.quoteId),
    index("idx_quote_products_quote_created").on(table.quoteId, table.createdAt),
    index("idx_quote_products_product").on(table.productId),
    index("idx_quote_products_supplier_service").on(table.supplierServiceId),
  ],
)

export const quoteVersions = pgTable(
  "quote_versions",
  {
    id: typeId("quote_versions"),
    quoteId: typeIdRef("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    label: text("label"),
    status: quoteVersionStatusEnum("status").notNull().default("draft"),
    supersedesId: typeIdRef("supersedes_id").references((): AnyPgColumn => quoteVersions.id, {
      onDelete: "set null",
    }),
    tripSnapshotId: text("trip_snapshot_id"),
    validUntil: date("valid_until"),
    currency: text("currency").notNull(),
    subtotalAmountCents: integer("subtotal_amount_cents").notNull().default(0),
    taxAmountCents: integer("tax_amount_cents").notNull().default(0),
    totalAmountCents: integer("total_amount_cents").notNull().default(0),
    notes: text("notes"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_quote_versions_quote").on(table.quoteId),
    index("idx_quote_versions_status").on(table.status),
    index("idx_quote_versions_supersedes").on(table.supersedesId),
    index("idx_quote_versions_trip_snapshot").on(table.tripSnapshotId),
    index("idx_quote_versions_quote_updated").on(table.quoteId, table.updatedAt),
    index("idx_quote_versions_status_updated").on(table.status, table.updatedAt),
  ],
)

export const quoteVersionLines = pgTable(
  "quote_version_lines",
  {
    id: typeId("quote_version_lines"),
    quoteVersionId: typeIdRef("quote_version_id")
      .notNull()
      .references(() => quoteVersions.id, { onDelete: "cascade" }),
    productId: text("product_id"),
    supplierServiceId: text("supplier_service_id"),
    description: text("description").notNull(),
    quantity: integer("quantity").notNull().default(1),
    unitPriceAmountCents: integer("unit_price_amount_cents").notNull().default(0),
    totalAmountCents: integer("total_amount_cents").notNull().default(0),
    currency: text("currency").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_quote_version_lines_version").on(table.quoteVersionId),
    index("idx_quote_version_lines_version_created").on(table.quoteVersionId, table.createdAt),
    index("idx_quote_version_lines_product").on(table.productId),
    index("idx_quote_version_lines_supplier_service").on(table.supplierServiceId),
  ],
)

/** Durable prepare record for the exactly-idempotent snapshot-and-deliver workflow. */
export const quoteProposalDeliveryRequests = pgTable(
  "quote_proposal_delivery_requests",
  {
    id: text("id").primaryKey(),
    commandScope: text("command_scope").notNull(),
    commandIdempotencyKey: text("command_idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    claimActionId: text("claim_action_id").notNull(),
    organizationId: text("organization_id"),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    quoteId: typeIdRef("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    quoteVersionId: typeIdRef("quote_version_id")
      .notNull()
      .references(() => quoteVersions.id, { onDelete: "cascade" }),
    proposalUrl: text("proposal_url").notNull(),
    provider: text("provider").notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_quote_proposal_delivery_requests_quote").on(table.quoteId, table.createdAt),
    uniqueIndex("uidx_quote_proposal_delivery_requests_version").on(table.quoteVersionId),
    uniqueIndex("uidx_quote_proposal_delivery_requests_command").on(
      table.commandScope,
      table.commandIdempotencyKey,
    ),
    uniqueIndex("uidx_quote_proposal_delivery_requests_claim").on(table.claimActionId),
  ],
)

/**
 * Quote-level media (images / videos / documents) shown on the client
 * proposal. Attached to the quote so it carries across proposal versions.
 */
export const quoteMedia = pgTable(
  "quote_media",
  {
    id: typeId("quote_media"),
    quoteId: typeIdRef("quote_id")
      .notNull()
      .references(() => quotes.id, { onDelete: "cascade" }),
    mediaType: text("media_type").notNull(),
    name: text("name").notNull(),
    url: text("url").notNull(),
    storageKey: text("storage_key"),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    altText: text("alt_text"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_quote_media_quote").on(table.quoteId),
    index("idx_quote_media_quote_sort").on(table.quoteId, table.sortOrder),
  ],
)

export type QuoteMedia = typeof quoteMedia.$inferSelect
export type NewQuoteMedia = typeof quoteMedia.$inferInsert

export type Pipeline = typeof pipelines.$inferSelect
export type NewPipeline = typeof pipelines.$inferInsert
export type Stage = typeof stages.$inferSelect
export type NewStage = typeof stages.$inferInsert
export type Quote = typeof quotes.$inferSelect
export type NewQuote = typeof quotes.$inferInsert
export type QuoteParticipant = typeof quoteParticipants.$inferSelect
export type NewQuoteParticipant = typeof quoteParticipants.$inferInsert
export type QuoteProduct = typeof quoteProducts.$inferSelect
export type NewQuoteProduct = typeof quoteProducts.$inferInsert
export type QuoteVersion = typeof quoteVersions.$inferSelect
export type NewQuoteVersion = typeof quoteVersions.$inferInsert
export type QuoteVersionLine = typeof quoteVersionLines.$inferSelect
export type NewQuoteVersionLine = typeof quoteVersionLines.$inferInsert
