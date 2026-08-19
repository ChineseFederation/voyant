import type { NamespacedCustomFieldValues } from "@voyant-travel/core/custom-fields"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import type {
  InquiryTravelBriefV1,
  inquiryContactSnapshotSchema,
} from "@voyant-travel/relationships-contracts"
import { sql } from "drizzle-orm"
import {
  type AnyPgColumn,
  index,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"
import type { z } from "zod"

import { organizations, people } from "./schema-accounts.js"

export const inquiryKindEnum = pgEnum("inquiry_kind", ["product", "custom_trip", "general"])
export const inquiryStatusEnum = pgEnum("inquiry_status", [
  "new",
  "triaged",
  "in_progress",
  "waiting_on_customer",
  "qualified",
  "converted",
  "closed",
])
export const inquiryCloseOutcomeEnum = pgEnum("inquiry_close_outcome", [
  "lost",
  "not_serviceable",
  "no_response",
  "duplicate",
  "spam",
  "customer_withdrew",
  "other",
])
export const inquiryConversionKindEnum = pgEnum("inquiry_conversion_kind", [
  "proposal",
  "booking_session",
  "booking",
])
export const inquiryConversionModeEnum = pgEnum("inquiry_conversion_mode", [
  "created",
  "attached_existing",
])

type InquiryContactSnapshot = z.infer<typeof inquiryContactSnapshotSchema>

/**
 * A customer request that the agency is accountable for working. Cross-module
 * targets and conversions deliberately live outside this core table; their
 * owner slices attach them without making Inquiry depend on Product or Booking
 * schemas.
 */
export const inquiries = pgTable(
  "inquiries",
  {
    id: typeId("inquiries"),
    subject: text("subject").notNull(),
    kind: inquiryKindEnum("kind").notNull(),
    status: inquiryStatusEnum("status").notNull().default("new"),
    closeOutcome: inquiryCloseOutcomeEnum("close_outcome"),
    closeNote: text("close_note"),
    duplicateOfInquiryId: typeIdRef("duplicate_of_inquiry_id").references(
      (): AnyPgColumn => inquiries.id,
    ),
    priority: text("priority").notNull().default("normal"),
    personId: typeIdRef("person_id").references(() => people.id, { onDelete: "set null" }),
    organizationId: typeIdRef("organization_id").references(() => organizations.id, {
      onDelete: "set null",
    }),
    contactSnapshot: jsonb("contact_snapshot").$type<InquiryContactSnapshot>().notNull(),
    ownerId: text("owner_id"),
    teamId: text("team_id"),
    unassignedReason: text("unassigned_reason"),
    nextActionAt: timestamp("next_action_at", { withTimezone: true }),
    firstResponseDueAt: timestamp("first_response_due_at", { withTimezone: true }),
    firstRespondedAt: timestamp("first_responded_at", { withTimezone: true }),
    travelBrief: jsonb("travel_brief").$type<InquiryTravelBriefV1>(),
    customerMessage: text("customer_message"),
    internalSummary: text("internal_summary"),
    source: text("source").notNull(),
    sourceRef: text("source_ref"),
    sourceUrl: text("source_url"),
    locale: text("locale"),
    consentSnapshot: jsonb("consent_snapshot").$type<Record<string, unknown>>(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    customFields: jsonb("custom_fields").$type<NamespacedCustomFieldValues>().notNull().default({}),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }),
    qualifiedAt: timestamp("qualified_at", { withTimezone: true }),
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_inquiries_source_ref")
      .on(table.source, table.sourceRef)
      .where(sql`${table.sourceRef} is not null`),
    index("idx_inquiries_status_next_action").on(table.status, table.nextActionAt),
    index("idx_inquiries_owner_status").on(table.ownerId, table.status),
    index("idx_inquiries_team_status").on(table.teamId, table.status),
    index("idx_inquiries_person").on(table.personId),
    index("idx_inquiries_organization").on(table.organizationId),
    index("idx_inquiries_duplicate").on(table.duplicateOfInquiryId),
    index("idx_inquiries_created").on(table.createdAt),
  ],
)

export type Inquiry = typeof inquiries.$inferSelect
export type NewInquiry = typeof inquiries.$inferInsert

/**
 * Durable, replay-safe provenance for records adopted from retired inquiry
 * stores. The legacy row remains in place; this ledger proves exactly which
 * canonical Inquiry adopted it and retains the source snapshot used by the
 * cutover.
 */
export const inquiryLegacySources = pgTable(
  "inquiry_legacy_sources",
  {
    sourceTable: text("source_table").notNull(),
    sourceId: text("source_id").notNull(),
    inquiryId: typeIdRef("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "restrict" }),
    sourceSnapshot: jsonb("source_snapshot").$type<Record<string, unknown>>().notNull(),
    reconciliationStatus: text("reconciliation_status")
      .$type<"pending" | "complete">()
      .notNull()
      .default("pending"),
    reconciliationIssues: jsonb("reconciliation_issues").$type<string[]>().notNull().default([]),
    migratedAt: timestamp("migrated_at", { withTimezone: true }).notNull().defaultNow(),
    reconciledAt: timestamp("reconciled_at", { withTimezone: true }),
  },
  (table) => [
    primaryKey({ columns: [table.sourceTable, table.sourceId] }),
    uniqueIndex("uq_inquiry_legacy_sources_inquiry").on(table.inquiryId),
    index("idx_inquiry_legacy_sources_migrated").on(table.migratedAt),
  ],
)

export type InquiryLegacySource = typeof inquiryLegacySources.$inferSelect

/** Durable contiguous high-water state for scheduled legacy-source scans. */
export const inquiryLegacyCutoverCursors = pgTable("inquiry_legacy_cutover_cursors", {
  sourceTable: text("source_table").primaryKey(),
  lastSourceId: text("last_source_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
})

export type InquiryLegacyCutoverCursor = typeof inquiryLegacyCutoverCursors.$inferSelect

export interface InquiryTargetSnapshotValue {
  title: string
  optionLabel?: string | null
  startDate?: string | null
  endDate?: string | null
  publicUrl?: string | null
  sourceChannel?: string | null
}

/** Relationships-owned immutable context for a neutral standard-link row. */
export const inquiryTargetSnapshots = pgTable(
  "inquiry_target_snapshots",
  {
    linkId: text("link_id").primaryKey(),
    inquiryId: typeIdRef("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"product" | "option_unit">().notNull(),
    targetId: text("target_id").notNull(),
    snapshot: jsonb("snapshot").$type<InquiryTargetSnapshotValue>().notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    removedAt: timestamp("removed_at", { withTimezone: true }),
    removedByActorId: text("removed_by_actor_id"),
  },
  (table) => [
    uniqueIndex("uq_inquiry_target_snapshots_target").on(
      table.inquiryId,
      table.kind,
      table.targetId,
    ),
    index("idx_inquiry_target_snapshots_inquiry").on(table.inquiryId, table.createdAt),
  ],
)

export type InquiryTargetSnapshot = typeof inquiryTargetSnapshots.$inferSelect

/** Append-only SLA edges. Overdue remains derived from Inquiry timestamps. */
export const inquirySlaEvents = pgTable(
  "inquiry_sla_events",
  {
    inquiryId: typeIdRef("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    eventType: text("event_type").notNull(),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.inquiryId, table.eventType, table.dueAt] }),
    index("idx_inquiry_sla_events_occurred").on(table.occurredAt),
  ],
)

export interface InquiryProposalTargetSnapshot {
  kind: "proposal"
  pipelineId: string
  stageId: string
}

export interface InquiryBookingSessionTargetSnapshot {
  kind: "booking_session"
  targetLinkId: string
  commandFingerprint: string
}

export interface InquiryBookingTargetSnapshot {
  kind: "booking"
  legacySourceTable: "customer_signals"
  legacySourceId: string
}

/** Durable provenance and replay boundary for every successful Inquiry handoff. */
export const inquiryConversions = pgTable(
  "inquiry_conversions",
  {
    id: typeId("inquiryConversions"),
    inquiryId: typeIdRef("inquiry_id")
      .notNull()
      .references(() => inquiries.id, { onDelete: "cascade" }),
    kind: inquiryConversionKindEnum("kind").notNull(),
    targetId: text("target_id").notNull(),
    targetSnapshot: jsonb("target_snapshot")
      .$type<
        | InquiryProposalTargetSnapshot
        | InquiryBookingSessionTargetSnapshot
        | InquiryBookingTargetSnapshot
      >()
      .notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    mode: inquiryConversionModeEnum("mode").notNull(),
    actorId: text("actor_id").notNull(),
    inquiryStatus: inquiryStatusEnum("inquiry_status").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_inquiry_conversions_operation").on(
      table.inquiryId,
      table.kind,
      table.idempotencyKey,
    ),
    index("idx_inquiry_conversions_target").on(table.kind, table.targetId),
    index("idx_inquiry_conversions_inquiry_created").on(table.inquiryId, table.createdAt),
  ],
)

export type InquiryConversion = typeof inquiryConversions.$inferSelect
export type NewInquiryConversion = typeof inquiryConversions.$inferInsert
