import type { NamespacedCustomFieldValues } from "@voyant-travel/core/custom-fields"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type { PaymentPolicy } from "@voyant-travel/finance/payment-policy"
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
  proposalStatusEnum,
  proposalVersionStatusEnum,
} from "./schema-shared.js"

export const pipelines = pgTable(
  "pipelines",
  {
    id: typeId("pipelines"),
    entityType: entityTypeEnum("entity_type").notNull().default("proposal"),
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

export const proposals = pgTable(
  "proposals",
  {
    id: typeId("proposals"),
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
    status: proposalStatusEnum("status").notNull().default("open"),
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
    /** Audit: the acting user (staff id) who created / last changed the proposal. */
    createdBy: text("created_by"),
    updatedBy: text("updated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    stageChangedAt: timestamp("stage_changed_at", { withTimezone: true }).notNull().defaultNow(),
    closedAt: timestamp("closed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_proposals_person").on(table.personId),
    index("idx_proposals_org").on(table.organizationId),
    index("idx_proposals_pipeline").on(table.pipelineId),
    index("idx_proposals_stage").on(table.stageId),
    index("idx_proposals_owner").on(table.ownerId),
    index("idx_proposals_status").on(table.status),
    index("idx_proposals_accepted_version").on(table.acceptedVersionId),
    index("idx_proposals_person_updated").on(table.personId, table.updatedAt),
    index("idx_proposals_org_updated").on(table.organizationId, table.updatedAt),
    index("idx_proposals_pipeline_updated").on(table.pipelineId, table.updatedAt),
    index("idx_proposals_stage_updated").on(table.stageId, table.updatedAt),
    index("idx_proposals_owner_updated").on(table.ownerId, table.updatedAt),
    index("idx_proposals_status_updated").on(table.status, table.updatedAt),
  ],
)

export const proposalParticipants = pgTable(
  "proposal_participants",
  {
    id: typeId("proposal_participants"),
    proposalId: typeIdRef("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    personId: typeIdRef("person_id").notNull(),
    role: participantRoleEnum("role").notNull().default("other"),
    isPrimary: boolean("is_primary").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_proposal_participants_proposal").on(table.proposalId),
    index("idx_proposal_participants_proposal_primary").on(
      table.proposalId,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_proposal_participants_person").on(table.personId),
    uniqueIndex("uidx_proposal_participants_unique").on(table.proposalId, table.personId),
  ],
)

export const proposalProducts = pgTable(
  "proposal_products",
  {
    id: typeId("proposal_products"),
    proposalId: typeIdRef("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
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
    index("idx_proposal_products_proposal").on(table.proposalId),
    index("idx_proposal_products_proposal_created").on(table.proposalId, table.createdAt),
    index("idx_proposal_products_product").on(table.productId),
    index("idx_proposal_products_supplier_service").on(table.supplierServiceId),
  ],
)

export const proposalVersions = pgTable(
  "proposal_versions",
  {
    id: typeId("proposal_versions"),
    proposalId: typeIdRef("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    label: text("label"),
    status: proposalVersionStatusEnum("status").notNull().default("draft"),
    supersedesId: typeIdRef("supersedes_id").references((): AnyPgColumn => proposalVersions.id, {
      onDelete: "set null",
    }),
    tripSnapshotId: text("trip_snapshot_id"),
    validUntil: date("valid_until"),
    currency: text("currency").notNull(),
    subtotalAmountCents: integer("subtotal_amount_cents").notNull().default(0),
    taxAmountCents: integer("tax_amount_cents").notNull().default(0),
    totalAmountCents: integer("total_amount_cents").notNull().default(0),
    /**
     * Payment terms negotiated for THIS offer — a deposit and when the balance
     * falls due. Null means the operator stated none on this version, and the
     * booking's schedule falls through to the catalog/operator cascade as it
     * always did. Same `PaymentPolicy` shape finance resolves everywhere else,
     * so an accepted proposal's terms need no translation to become the
     * booking's.
     */
    paymentTerms: jsonb("payment_terms").$type<PaymentPolicy>(),
    notes: text("notes"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    viewedAt: timestamp("viewed_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_proposal_versions_proposal").on(table.proposalId),
    index("idx_proposal_versions_status").on(table.status),
    index("idx_proposal_versions_supersedes").on(table.supersedesId),
    index("idx_proposal_versions_trip_snapshot").on(table.tripSnapshotId),
    index("idx_proposal_versions_proposal_updated").on(table.proposalId, table.updatedAt),
    index("idx_proposal_versions_status_updated").on(table.status, table.updatedAt),
  ],
)

export const proposalVersionLines = pgTable(
  "proposal_version_lines",
  {
    id: typeId("proposal_version_lines"),
    proposalVersionId: typeIdRef("proposal_version_id")
      .notNull()
      .references(() => proposalVersions.id, { onDelete: "cascade" }),
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
    index("idx_proposal_version_lines_version").on(table.proposalVersionId),
    index("idx_proposal_version_lines_version_created").on(
      table.proposalVersionId,
      table.createdAt,
    ),
    index("idx_proposal_version_lines_product").on(table.productId),
    index("idx_proposal_version_lines_supplier_service").on(table.supplierServiceId),
  ],
)

/** Durable prepare record for the exactly-idempotent snapshot-and-deliver workflow. */
export const proposalDeliveryRequests = pgTable(
  "proposal_delivery_requests",
  {
    id: text("id").primaryKey(),
    commandScope: text("command_scope").notNull(),
    commandIdempotencyKey: text("command_idempotency_key").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    claimActionId: text("claim_action_id").notNull(),
    organizationId: text("organization_id"),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    proposalId: typeIdRef("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
    proposalVersionId: typeIdRef("proposal_version_id")
      .notNull()
      .references(() => proposalVersions.id, { onDelete: "cascade" }),
    proposalUrl: text("proposal_url").notNull(),
    provider: text("provider").notNull(),
    resultSnapshot: jsonb("result_snapshot").$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp("completed_at", { withTimezone: true }),
  },
  (table) => [
    index("idx_proposal_delivery_requests_proposal").on(table.proposalId, table.createdAt),
    uniqueIndex("uidx_proposal_delivery_requests_version").on(table.proposalVersionId),
    uniqueIndex("uidx_proposal_delivery_requests_command").on(
      table.commandScope,
      table.commandIdempotencyKey,
    ),
    uniqueIndex("uidx_proposal_delivery_requests_claim").on(table.claimActionId),
  ],
)

/**
 * Proposal-level media (images / videos / documents) shown on the client
 * proposal. Attached to the proposal so it carries across proposal versions.
 */
export const proposalMedia = pgTable(
  "proposal_media",
  {
    id: typeId("proposal_media"),
    proposalId: typeIdRef("proposal_id")
      .notNull()
      .references(() => proposals.id, { onDelete: "cascade" }),
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
    index("idx_proposal_media_proposal").on(table.proposalId),
    index("idx_proposal_media_proposal_sort").on(table.proposalId, table.sortOrder),
  ],
)

export type ProposalMedia = typeof proposalMedia.$inferSelect
export type NewProposalMedia = typeof proposalMedia.$inferInsert

export type Pipeline = typeof pipelines.$inferSelect
export type NewPipeline = typeof pipelines.$inferInsert
export type Stage = typeof stages.$inferSelect
export type NewStage = typeof stages.$inferInsert
export type Proposal = typeof proposals.$inferSelect
export type NewProposal = typeof proposals.$inferInsert
export type ProposalParticipant = typeof proposalParticipants.$inferSelect
export type NewProposalParticipant = typeof proposalParticipants.$inferInsert
export type ProposalProduct = typeof proposalProducts.$inferSelect
export type NewProposalProduct = typeof proposalProducts.$inferInsert
export type ProposalVersion = typeof proposalVersions.$inferSelect
export type NewProposalVersion = typeof proposalVersions.$inferInsert
export type ProposalVersionLine = typeof proposalVersionLines.$inferSelect
export type NewProposalVersionLine = typeof proposalVersionLines.$inferInsert
