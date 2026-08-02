import type {
  BookingAmendmentFinancialConsequences,
  BookingRevisionSnapshot,
  TravelerCorrectionPatch,
  TravelerRosterChange,
} from "@voyant-travel/bookings-contracts"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { bookings } from "./schema-core.js"

export type BookingAmendmentStatus =
  | "proposed"
  | "accepted"
  | "applying"
  | "applied"
  | "rejected"
  | "failed"
  | "in_doubt"
  | "manual_review"
export type BookingAmendmentActor = "customer" | "staff" | "partner" | "system"
export type BookingRevisionRole = "before" | "proposed_after"
export type BookingAmendmentKind = "traveler_correction" | "traveler_add" | "traveler_drop"

export type BookingAmendmentRequestedChange =
  | { type: "traveler_correction"; travelerId: string; patch: TravelerCorrectionPatch }
  | (TravelerRosterChange & { travelerId: string })

export interface BookingAmendmentPolicyDecision {
  code: string
  version: string
  decision: "allowed" | "acceptance_required"
  reason: string
}

export interface BookingAmendmentEffects {
  finance: "not_required" | "collection_required" | "refund_required" | "recorded"
  legal: "not_required" | "review_required"
  documents: "not_required" | "reissue_required"
  fulfillment: "not_required" | "reissue_required"
  supplier:
    | "not_required"
    | "modify_required"
    | "pending"
    | "secured"
    | "refused"
    | "in_doubt"
    | "manual_review"
  allocation: "not_required" | "increase_required" | "release_required" | "applied"
}

export interface BookingAmendmentTaxLine {
  bookingItemId: string
  code: string | null
  name: string
  amountCents: number
  rateBasisPoints: number | null
  includedInPrice: boolean
}

export interface BookingAmendmentRosterItemPlan {
  bookingItemId: string
  quantityDelta: 1 | -1
  unitSellAmountCents: number
  allocationId: string
  allocationQuantityBefore: number
  availabilitySlotId: string | null
  supplierOperation: {
    entityModule: string
    entityId: string
    sourceKind: string
    sourceConnectionId: string
    sourceRef: string
    upstreamRef: string
    desiredState: {
      parameters?: Record<string, unknown>
      party: { passengers: Record<string, unknown>[] }
    }
    requestFingerprint: string
  } | null
}

export const bookingAmendments = pgTable(
  "booking_amendments",
  {
    id: typeId("booking_amendments"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    travelerId: text("traveler_id").notNull(),
    kind: text("kind").$type<BookingAmendmentKind>().notNull().default("traveler_correction"),
    status: text("status").$type<BookingAmendmentStatus>().notNull().default("proposed"),
    baseBookingRevision: integer("base_booking_revision").notNull(),
    resultBookingRevision: integer("result_booking_revision").notNull(),
    requestedChange: jsonb("requested_change").$type<BookingAmendmentRequestedChange>().notNull(),
    acceptanceRequired: boolean("acceptance_required").notNull().default(false),
    policyDecisions: jsonb("policy_decisions")
      .$type<BookingAmendmentPolicyDecision[]>()
      .notNull()
      .default([]),
    subtotalDeltaCents: integer("subtotal_delta_cents").notNull().default(0),
    feeDeltaCents: integer("fee_delta_cents").notNull().default(0),
    taxDeltaCents: integer("tax_delta_cents").notNull().default(0),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    priceCurrency: text("price_currency").notNull(),
    collectionAmountCents: integer("collection_amount_cents").notNull().default(0),
    refundAmountCents: integer("refund_amount_cents").notNull().default(0),
    taxLines: jsonb("tax_lines").$type<BookingAmendmentTaxLine[]>().notNull().default([]),
    financialConsequences: jsonb("financial_consequences")
      .$type<BookingAmendmentFinancialConsequences>()
      .notNull(),
    effects: jsonb("effects").$type<BookingAmendmentEffects>().notNull(),
    quotedAt: timestamp("quoted_at", { withTimezone: true }).notNull().defaultNow(),
    quoteExpiresAt: timestamp("quote_expires_at", { withTimezone: true }),
    supplierOperationIds: jsonb("supplier_operation_ids").$type<string[]>().notNull().default([]),
    operationPlan: jsonb("operation_plan")
      .$type<BookingAmendmentRosterItemPlan[]>()
      .notNull()
      .default([]),
    failureCode: text("failure_code"),
    previewIdempotencyKey: text("preview_idempotency_key").notNull(),
    acceptIdempotencyKey: text("accept_idempotency_key"),
    applyIdempotencyKey: text("apply_idempotency_key"),
    requestedBy: text("requested_by"),
    requestedActor: text("requested_actor").$type<BookingAmendmentActor>().notNull(),
    reason: text("reason").notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by"),
    acceptedActor: text("accepted_actor").$type<BookingAmendmentActor>(),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedBy: text("applied_by"),
    appliedActor: text("applied_actor").$type<BookingAmendmentActor>(),
    applyStartedAt: timestamp("apply_started_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_booking_amendments_preview_idempotency").on(
      table.bookingId,
      table.previewIdempotencyKey,
    ),
    index("idx_booking_amendments_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_amendments_traveler").on(table.travelerId),
    index("idx_booking_amendments_status").on(table.status),
    check(
      "ck_booking_amendments_kind",
      // agent-quality: raw-sql reviewed -- owner: bookings; static enum membership constraint over Drizzle identifiers.
      sql`${table.kind} IN ('traveler_correction', 'traveler_add', 'traveler_drop')`,
    ),
    check(
      "ck_booking_amendments_status",
      // agent-quality: raw-sql reviewed -- owner: bookings; static lifecycle membership constraint over a Drizzle identifier.
      sql`${table.status} IN ('proposed', 'accepted', 'applying', 'applied', 'rejected', 'failed', 'in_doubt', 'manual_review')`,
    ),
    check(
      "ck_booking_amendments_actor",
      // agent-quality: raw-sql reviewed -- owner: bookings; static actor membership constraint over a Drizzle identifier.
      sql`${table.requestedActor} IN ('customer', 'staff', 'partner', 'system')`,
    ),
    check(
      "ck_booking_amendments_accepted_actor",
      // agent-quality: raw-sql reviewed -- owner: bookings; static nullable actor constraint over a Drizzle identifier.
      sql`${table.acceptedActor} IS NULL OR ${table.acceptedActor} IN ('customer', 'staff', 'partner', 'system')`,
    ),
    check(
      "ck_booking_amendments_applied_actor",
      // agent-quality: raw-sql reviewed -- owner: bookings; static nullable actor constraint over a Drizzle identifier.
      sql`${table.appliedActor} IS NULL OR ${table.appliedActor} IN ('customer', 'staff', 'partner', 'system')`,
    ),
    check(
      "ck_booking_amendments_lifecycle",
      // agent-quality: raw-sql reviewed -- owner: bookings; lifecycle nullability invariant uses only Drizzle column identifiers and SQL literals.
      sql`(
        ${table.status} = 'proposed'
        AND ${table.acceptedAt} IS NULL
        AND ${table.acceptedBy} IS NULL
        AND ${table.acceptedActor} IS NULL
        AND ${table.acceptIdempotencyKey} IS NULL
        AND ${table.appliedAt} IS NULL
        AND ${table.appliedActor} IS NULL
        AND ${table.applyIdempotencyKey} IS NULL
      ) OR (
        ${table.status} = 'accepted'
        AND ${table.acceptanceRequired} = true
        AND ${table.acceptedAt} IS NOT NULL
        AND ${table.acceptedActor} IS NOT NULL
        AND ${table.acceptIdempotencyKey} IS NOT NULL
        AND ${table.appliedAt} IS NULL
        AND ${table.appliedBy} IS NULL
        AND ${table.appliedActor} IS NULL
        AND ${table.applyIdempotencyKey} IS NULL
      ) OR (
        ${table.status} = 'applied'
        AND ${table.appliedAt} IS NOT NULL
        AND ${table.appliedActor} IS NOT NULL
        AND ${table.applyIdempotencyKey} IS NOT NULL
        AND (
          (
            ${table.acceptanceRequired} = false
            AND ${table.acceptedAt} IS NULL
            AND ${table.acceptedBy} IS NULL
            AND ${table.acceptedActor} IS NULL
            AND ${table.acceptIdempotencyKey} IS NULL
          )
          OR (
            ${table.acceptanceRequired} = true
            AND ${table.acceptedAt} IS NOT NULL
            AND ${table.acceptedActor} IS NOT NULL
            AND ${table.acceptIdempotencyKey} IS NOT NULL
          )
        )
      ) OR ${table.status} IN ('applying', 'in_doubt', 'manual_review', 'rejected', 'failed')`,
    ),
    check(
      "ck_booking_amendments_revision_step",
      // agent-quality: raw-sql reviewed -- owner: bookings; exact revision-step invariant over Drizzle identifiers.
      sql`${table.baseBookingRevision} > 0 AND ${table.resultBookingRevision} = ${table.baseBookingRevision} + 1`,
    ),
    check(
      "ck_booking_amendments_money",
      // agent-quality: raw-sql reviewed -- owner: bookings; monetary balance invariant over Drizzle identifiers and integer literals.
      sql`${table.priceDeltaCents} = ${table.subtotalDeltaCents} + ${table.feeDeltaCents} + ${table.taxDeltaCents}
          AND ${table.collectionAmountCents} >= 0
          AND ${table.refundAmountCents} >= 0
          AND NOT (${table.collectionAmountCents} > 0 AND ${table.refundAmountCents} > 0)`,
    ),
  ],
)

export const bookingRevisions = pgTable(
  "booking_revisions",
  {
    id: typeId("booking_revisions"),
    amendmentId: typeIdRef("amendment_id")
      .notNull()
      .references(() => bookingAmendments.id, { onDelete: "cascade" }),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    bookingRevision: integer("booking_revision").notNull(),
    role: text("role").$type<BookingRevisionRole>().notNull(),
    snapshot: jsonb("snapshot").$type<BookingRevisionSnapshot>().notNull(),
    changedFields: jsonb("changed_fields").$type<string[]>().notNull().default([]),
    authorizedBy: text("authorized_by"),
    reason: text("reason").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("uq_booking_revisions_amendment_role").on(table.amendmentId, table.role),
    index("idx_booking_revisions_booking_revision").on(table.bookingId, table.bookingRevision),
    // agent-quality: raw-sql reviewed -- owner: bookings; positive revision constraint over a Drizzle identifier.
    check("ck_booking_revisions_revision_positive", sql`${table.bookingRevision} > 0`),
    // agent-quality: raw-sql reviewed -- owner: bookings; static revision-role membership constraint over a Drizzle identifier.
    check("ck_booking_revisions_role", sql`${table.role} IN ('before', 'proposed_after')`),
  ],
)

export type BookingAmendmentRow = typeof bookingAmendments.$inferSelect
export type NewBookingAmendmentRow = typeof bookingAmendments.$inferInsert
export type BookingRevisionRow = typeof bookingRevisions.$inferSelect
export type NewBookingRevisionRow = typeof bookingRevisions.$inferInsert
