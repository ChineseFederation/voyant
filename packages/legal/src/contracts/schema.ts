import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { suppliers } from "@voyant-travel/distribution"
import { organizations, people } from "@voyant-travel/relationships/schema"
import { relations, sql } from "drizzle-orm"
import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import { legalTargetKindEnum } from "../targets/schema.js"

// ---------- enums ----------

export const contractScopeEnum = pgEnum("contract_scope", [
  "customer",
  "supplier",
  "partner",
  "channel",
  "other",
])

export const contractStatusValues = [
  "draft",
  "issued",
  "sent",
  "signed",
  "executed",
  "expired",
  "void",
] as const

export const contractStatusEnum = pgEnum("contract_status", contractStatusValues)

export type ContractStatus = (typeof contractStatusValues)[number]

export interface ContractStageHistoryEntry {
  stage: ContractStatus
  previousStage: ContractStatus | null
  transition: "created" | "issued" | "sent" | "signed" | "executed" | "voided"
  enteredAt: string
  actorId?: string | null
}

export const contractSignatureMethodEnum = pgEnum("contract_signature_method", [
  "manual",
  "electronic",
  "docusign",
  "other",
])

export const contractNumberResetStrategyEnum = pgEnum("contract_number_reset_strategy", [
  "never",
  "annual",
  "monthly",
])

export const contractBodyFormatEnum = pgEnum("contract_body_format", [
  "markdown",
  "html",
  "lexical_json",
])

// ---------- contract_templates ----------

export const contractTemplates = pgTable(
  "contract_templates",
  {
    id: typeId("contract_templates"),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    scope: contractScopeEnum("scope").notNull(),
    language: text("language").notNull().default("en"),
    description: text("description"),
    body: text("body").notNull(),
    variableSchema: jsonb("variable_schema"),
    currentVersionId: typeIdRef("current_version_id"),
    channelId: typeIdRef("channel_id"),
    isDefault: boolean("is_default").notNull().default(false),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contract_templates_scope").on(table.scope),
    index("idx_contract_templates_language").on(table.language),
    index("idx_contract_templates_channel").on(table.channelId),
    index("idx_contract_templates_active").on(table.active),
    index("idx_contract_templates_default_selector").on(
      table.scope,
      table.channelId,
      table.language,
      table.isDefault,
      table.active,
    ),
    index("idx_contract_templates_scope_updated").on(table.scope, table.updatedAt),
    index("idx_contract_templates_language_updated").on(table.language, table.updatedAt),
    index("idx_contract_templates_active_updated").on(table.active, table.updatedAt),
    index("idx_contract_templates_scope_active_updated").on(
      table.scope,
      table.active,
      table.updatedAt,
    ),
    uniqueIndex("uq_contract_templates_slug").on(table.slug),
    uniqueIndex("uidx_contract_templates_default_global")
      .on(table.scope, table.language)
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.isDefault} = true AND ${table.channelId} IS NULL`),
    uniqueIndex("uidx_contract_templates_default_channel")
      .on(table.scope, table.channelId, table.language)
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.isDefault} = true AND ${table.channelId} IS NOT NULL`),
  ],
)

export type ContractTemplate = typeof contractTemplates.$inferSelect
export type NewContractTemplate = typeof contractTemplates.$inferInsert

// ---------- contract_template_versions ----------

export const contractTemplateVersions = pgTable(
  "contract_template_versions",
  {
    id: typeId("contract_template_versions"),
    templateId: typeIdRef("template_id")
      .notNull()
      .references(() => contractTemplates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    body: text("body").notNull(),
    variableSchema: jsonb("variable_schema"),
    changelog: text("changelog"),
    createdBy: text("created_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contract_template_versions_template").on(table.templateId),
    uniqueIndex("uq_contract_template_versions_template_version").on(
      table.templateId,
      table.version,
    ),
  ],
)

export type ContractTemplateVersion = typeof contractTemplateVersions.$inferSelect
export type NewContractTemplateVersion = typeof contractTemplateVersions.$inferInsert

// ---------- contract_number_series ----------

export const contractNumberSeries = pgTable(
  "contract_number_series",
  {
    id: typeId("contract_number_series"),
    name: text("name").notNull(),
    prefix: text("prefix").notNull().default(""),
    separator: text("separator").notNull().default(""),
    padLength: integer("pad_length").notNull().default(4),
    currentSequence: integer("current_sequence").notNull().default(0),
    resetStrategy: contractNumberResetStrategyEnum("reset_strategy").notNull().default("never"),
    resetAt: timestamp("reset_at", { withTimezone: true }),
    scope: contractScopeEnum("scope").notNull().default("customer"),
    isDefault: boolean("is_default").notNull().default(false),
    externalProvider: text("external_provider"),
    externalConfigKey: text("external_config_key"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contract_number_series_scope").on(table.scope),
    index("idx_contract_number_series_active").on(table.active),
    index("idx_contract_number_series_scope_default").on(table.scope, table.isDefault),
    index("idx_contract_number_series_external_provider").on(table.externalProvider),
    index("idx_contract_number_series_scope_updated").on(table.scope, table.updatedAt),
    index("idx_contract_number_series_active_updated").on(table.active, table.updatedAt),
    index("idx_contract_number_series_updated").on(table.updatedAt),
    uniqueIndex("uidx_contract_number_series_prefix_scope_active")
      .on(table.prefix, table.scope)
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.active} = true`),
    uniqueIndex("uidx_contract_number_series_default_scope_active")
      .on(table.scope)
      // agent-quality: raw-sql reviewed -- owner: legal; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      .where(sql`${table.active} = true AND ${table.isDefault} = true`),
  ],
)

export type ContractNumberSeries = typeof contractNumberSeries.$inferSelect
export type NewContractNumberSeries = typeof contractNumberSeries.$inferInsert

// ---------- contracts ----------

export const contracts = pgTable(
  "contracts",
  {
    id: typeId("contracts"),
    contractNumber: text("contract_number").unique(),
    scope: contractScopeEnum("scope").notNull(),
    status: contractStatusEnum("status").notNull().default("draft"),
    stageHistory: jsonb("stage_history")
      .$type<ContractStageHistoryEntry[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    title: text("title").notNull(),

    templateVersionId: typeIdRef("template_version_id").references(
      () => contractTemplateVersions.id,
      { onDelete: "set null" },
    ),
    seriesId: typeIdRef("series_id").references(() => contractNumberSeries.id, {
      onDelete: "set null",
    }),

    // Cross-module associations: plain id columns + `defineLink` at the
    // deployment (person/organization/supplier link tables) + service-layer
    // validation — NOT hard cross-package FKs, per module decoupling. (Matches
    // channelId/bookingId below.)
    personId: typeIdRef("person_id"),
    organizationId: typeIdRef("organization_id"),
    supplierId: typeIdRef("supplier_id"),
    channelId: typeIdRef("channel_id"),

    bookingId: typeIdRef("booking_id"),
    targetKind: legalTargetKindEnum("target_kind"),
    targetId: typeIdRef("target_id"),
    targetProvider: text("target_provider"),
    targetSourceRef: text("target_source_ref"),
    legacyTransactionOfferId: typeIdRef("legacy_transaction_offer_id"),
    legacyTransactionOrderId: typeIdRef("legacy_transaction_order_id"),

    issuedAt: timestamp("issued_at", { withTimezone: true }),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    executedAt: timestamp("executed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    voidedAt: timestamp("voided_at", { withTimezone: true }),

    language: text("language").notNull().default("en"),
    renderedBodyFormat: contractBodyFormatEnum("rendered_body_format").notNull().default("html"),
    renderedBody: text("rendered_body"),
    variables: jsonb("variables"),
    metadata: jsonb("metadata"),

    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contracts_scope").on(table.scope),
    index("idx_contracts_status").on(table.status),
    index("idx_contracts_template_version").on(table.templateVersionId),
    index("idx_contracts_series").on(table.seriesId),
    index("idx_contracts_person").on(table.personId),
    index("idx_contracts_organization").on(table.organizationId),
    index("idx_contracts_supplier").on(table.supplierId),
    index("idx_contracts_booking").on(table.bookingId),
    index("idx_contracts_target").on(table.targetKind, table.targetId),
    index("idx_contracts_provider_source").on(table.targetProvider, table.targetSourceRef),
    index("idx_contracts_legacy_transaction_offer").on(table.legacyTransactionOfferId),
    index("idx_contracts_legacy_transaction_order").on(table.legacyTransactionOrderId),
    index("idx_contracts_scope_created").on(table.scope, table.createdAt),
    index("idx_contracts_status_created").on(table.status, table.createdAt),
    index("idx_contracts_person_created").on(table.personId, table.createdAt),
    index("idx_contracts_organization_created").on(table.organizationId, table.createdAt),
    index("idx_contracts_supplier_created").on(table.supplierId, table.createdAt),
    index("idx_contracts_booking_created").on(table.bookingId, table.createdAt),
    index("idx_contracts_target_created").on(table.targetKind, table.targetId, table.createdAt),
    index("idx_contracts_contract_number").on(table.contractNumber),
  ],
)

export type Contract = typeof contracts.$inferSelect
export type NewContract = typeof contracts.$inferInsert

// ---------- contract_lifecycle_command_results ----------

/**
 * Immutable package-owned result mailbox for handler-admitted lifecycle Tools.
 *
 * The action-ledger claim, strict contract transition, this exact result
 * snapshot, and the matching event-outbox row are committed in one database
 * transaction. Replays resolve this row by the immutable claim id; they never
 * derive a fresh result from mutable contract state.
 */
export const contractLifecycleCommandResults = pgTable(
  "contract_lifecycle_command_results",
  {
    claimActionId: text("claim_action_id").primaryKey(),
    actionName: text("action_name").notNull(),
    actionVersion: text("action_version").notNull(),
    targetType: text("target_type").notNull(),
    // Soft reference by design: immutable command/replay history must outlive
    // a later void + contract deletion.
    contractId: text("contract_id").notNull(),
    transition: text("transition").notNull(),
    idempotencyScope: text("idempotency_scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    idempotencyFingerprint: text("idempotency_fingerprint").notNull(),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    organizationId: text("organization_id"),
    commandPayload: jsonb("command_payload").$type<Record<string, unknown>>().notNull(),
    result: jsonb("result").$type<Record<string, unknown>>().notNull(),
    eventId: text("event_id").notNull().unique(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contract_lifecycle_command_results_contract").on(table.contractId, table.createdAt),
    uniqueIndex("uq_contract_lifecycle_command_results_scope_key").on(
      table.idempotencyScope,
      table.idempotencyKey,
    ),
  ],
)

export type ContractLifecycleCommandResult = typeof contractLifecycleCommandResults.$inferSelect
export type NewContractLifecycleCommandResult = typeof contractLifecycleCommandResults.$inferInsert

// ---------- contract_signatures ----------

export const contractSignatures = pgTable(
  "contract_signatures",
  {
    id: typeId("contract_signatures"),
    contractId: typeIdRef("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    signerName: text("signer_name").notNull(),
    signerEmail: text("signer_email"),
    signerRole: text("signer_role"),
    // Cross-module association: plain id column + deployment `defineLink`, not a
    // hard cross-package FK (see contracts.personId above).
    personId: typeIdRef("person_id"),
    targetKind: legalTargetKindEnum("target_kind"),
    targetId: typeIdRef("target_id"),
    targetProvider: text("target_provider"),
    targetSourceRef: text("target_source_ref"),
    legacyTransactionOfferId: typeIdRef("legacy_transaction_offer_id"),
    legacyTransactionOrderId: typeIdRef("legacy_transaction_order_id"),
    method: contractSignatureMethodEnum("method").notNull().default("manual"),
    provider: text("provider"),
    externalReference: text("external_reference"),
    signatureData: text("signature_data"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    signedAt: timestamp("signed_at", { withTimezone: true }).notNull().defaultNow(),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contract_signatures_contract").on(table.contractId),
    index("idx_contract_signatures_contract_signed").on(table.contractId, table.signedAt),
    index("idx_contract_signatures_person").on(table.personId),
    index("idx_contract_signatures_target").on(table.targetKind, table.targetId),
    index("idx_contract_signatures_provider_source").on(
      table.targetProvider,
      table.targetSourceRef,
    ),
    index("idx_contract_signatures_legacy_transaction_offer").on(table.legacyTransactionOfferId),
    index("idx_contract_signatures_legacy_transaction_order").on(table.legacyTransactionOrderId),
    index("idx_contract_signatures_method").on(table.method),
  ],
)

export type ContractSignature = typeof contractSignatures.$inferSelect
export type NewContractSignature = typeof contractSignatures.$inferInsert

// ---------- contract_attachments ----------

export const contractAttachments = pgTable(
  "contract_attachments",
  {
    id: typeId("contract_attachments"),
    contractId: typeIdRef("contract_id")
      .notNull()
      .references(() => contracts.id, { onDelete: "cascade" }),
    kind: text("kind").notNull().default("appendix"),
    name: text("name").notNull(),
    mimeType: text("mime_type"),
    fileSize: integer("file_size"),
    storageKey: text("storage_key"),
    checksum: text("checksum"),
    targetKind: legalTargetKindEnum("target_kind"),
    targetId: typeIdRef("target_id"),
    targetProvider: text("target_provider"),
    targetSourceRef: text("target_source_ref"),
    legacyTransactionOfferId: typeIdRef("legacy_transaction_offer_id"),
    legacyTransactionOrderId: typeIdRef("legacy_transaction_order_id"),
    metadata: jsonb("metadata"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_contract_attachments_contract").on(table.contractId),
    index("idx_contract_attachments_contract_created").on(table.contractId, table.createdAt),
    index("idx_contract_attachments_target").on(table.targetKind, table.targetId),
    index("idx_contract_attachments_provider_source").on(
      table.targetProvider,
      table.targetSourceRef,
    ),
    index("idx_contract_attachments_legacy_transaction_offer").on(table.legacyTransactionOfferId),
    index("idx_contract_attachments_legacy_transaction_order").on(table.legacyTransactionOrderId),
    uniqueIndex("uq_contract_attachments_canonical_document")
      .on(table.contractId)
      // agent-quality: raw-sql reviewed -- owner: legal; the partial index enforces one canonical rendition per contract.
      .where(sql`${table.kind} = 'document'`),
  ],
)

export type ContractAttachment = typeof contractAttachments.$inferSelect
export type NewContractAttachment = typeof contractAttachments.$inferInsert

// ---------- durable contract document operations ----------

/**
 * Package-owned write-ahead state for document generation. The row is the
 * immutable request/result authority; action-ledger claims point at its id.
 * Bytes are always written under `operations/<id>/...`, never under a stable
 * contract key.
 */
export const contractDocumentOperations = pgTable(
  "contract_document_operations",
  {
    id: typeId("contract_document_operations"),
    bookingId: typeIdRef("booking_id").notNull(),
    contractId: typeIdRef("contract_id").references(() => contracts.id, {
      onDelete: "restrict",
    }),
    organizationId: typeIdRef("organization_id"),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    tenantScope: text("tenant_scope").notNull(),
    claimActionId: text("claim_action_id").notNull(),
    claimActionName: text("claim_action_name").notNull(),
    claimActionVersion: text("claim_action_version").notNull(),
    claimTargetType: text("claim_target_type").notNull(),
    claimTargetId: text("claim_target_id").notNull(),
    claimIdempotencyScope: text("claim_idempotency_scope").notNull(),
    claimIdempotencyFingerprint: text("claim_idempotency_fingerprint").notNull(),
    claimCommandPayload: jsonb("claim_command_payload").$type<Record<string, unknown>>().notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    mode: text("mode").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    targetFingerprint: text("target_fingerprint").notNull(),
    providerId: text("provider_id").notNull(),
    providerVersion: text("provider_version").notNull(),
    providerProtocol: text("provider_protocol").notNull(),
    status: text("status").notNull().default("prepared"),
    checkpoint: text("checkpoint").notNull().default("prepared"),
    attemptCount: integer("attempt_count").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(8),
    fencingToken: integer("fencing_token").notNull().default(0),
    leaseOwner: text("lease_owner"),
    leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
    nextAttemptAt: timestamp("next_attempt_at", { withTimezone: true }).notNull().defaultNow(),
    operationKey: text("operation_key").notNull(),
    renderDescriptor: jsonb("render_descriptor").notNull(),
    renderedPayload: text("rendered_payload"),
    artifactMetadata: jsonb("artifact_metadata"),
    artifactName: text("artifact_name"),
    artifactContentType: text("artifact_content_type"),
    artifactChecksum: text("artifact_checksum"),
    artifactByteLength: integer("artifact_byte_length"),
    previousAttachmentId: typeIdRef("previous_attachment_id"),
    previousStorageKey: text("previous_storage_key"),
    previousProviderId: text("previous_provider_id"),
    previousProviderVersion: text("previous_provider_version"),
    previousProviderProtocol: text("previous_provider_protocol"),
    previousCanonicalFingerprint: jsonb("previous_canonical_fingerprint"),
    canonicalAttachmentId: typeIdRef("canonical_attachment_id"),
    result: jsonb("result"),
    eventId: text("event_id").notNull(),
    lastError: text("last_error"),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    cleanupCompletedAt: timestamp("cleanup_completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_contract_document_operations_request").on(
      table.tenantScope,
      table.bookingId,
      table.idempotencyKey,
    ),
    uniqueIndex("uq_contract_document_operations_event").on(table.eventId),
    uniqueIndex("uq_contract_document_operations_key").on(table.operationKey),
    uniqueIndex("uq_contract_document_operations_claim").on(table.claimActionId),
    index("idx_contract_document_operations_due").on(
      table.status,
      table.nextAttemptAt,
      table.leaseExpiresAt,
    ),
    index("idx_contract_document_operations_booking").on(table.bookingId, table.createdAt),
    index("idx_contract_document_operations_contract").on(table.contractId, table.createdAt),
  ],
)

export type ContractDocumentOperation = typeof contractDocumentOperations.$inferSelect
export type NewContractDocumentOperation = typeof contractDocumentOperations.$inferInsert

// ---------- relations ----------

export const contractTemplatesRelations = relations(contractTemplates, ({ many }) => ({
  versions: many(contractTemplateVersions),
}))

export const contractTemplateVersionsRelations = relations(
  contractTemplateVersions,
  ({ one, many }) => ({
    template: one(contractTemplates, {
      fields: [contractTemplateVersions.templateId],
      references: [contractTemplates.id],
    }),
    contracts: many(contracts),
  }),
)

export const contractNumberSeriesRelations = relations(contractNumberSeries, ({ many }) => ({
  contracts: many(contracts),
}))

export const contractsRelations = relations(contracts, ({ one, many }) => ({
  templateVersion: one(contractTemplateVersions, {
    fields: [contracts.templateVersionId],
    references: [contractTemplateVersions.id],
  }),
  series: one(contractNumberSeries, {
    fields: [contracts.seriesId],
    references: [contractNumberSeries.id],
  }),
  person: one(people, { fields: [contracts.personId], references: [people.id] }),
  organization: one(organizations, {
    fields: [contracts.organizationId],
    references: [organizations.id],
  }),
  supplier: one(suppliers, { fields: [contracts.supplierId], references: [suppliers.id] }),
  signatures: many(contractSignatures),
  attachments: many(contractAttachments),
}))

export const contractSignaturesRelations = relations(contractSignatures, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractSignatures.contractId],
    references: [contracts.id],
  }),
  person: one(people, { fields: [contractSignatures.personId], references: [people.id] }),
}))

export const contractAttachmentsRelations = relations(contractAttachments, ({ one }) => ({
  contract: one(contracts, {
    fields: [contractAttachments.contractId],
    references: [contracts.id],
  }),
}))
