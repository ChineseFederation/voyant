import type {
  BookingRevisionSnapshot,
  TravelerCorrectionPatch,
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

export type BookingAmendmentStatus = "proposed" | "accepted" | "applied" | "rejected" | "failed"
export type BookingAmendmentActor = "customer" | "staff" | "partner" | "system"
export type BookingRevisionRole = "before" | "proposed_after"

export interface BookingAmendmentPolicyDecision {
  code: string
  version: string
  decision: "allowed" | "acceptance_required"
  reason: string
}

export interface BookingAmendmentEffects {
  finance: "not_required"
  legal: "not_required"
  documents: "not_required"
  fulfillment: "not_required"
  supplier: "not_required"
}

export const bookingAmendments = pgTable(
  "booking_amendments",
  {
    id: typeId("booking_amendments"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    travelerId: text("traveler_id").notNull(),
    kind: text("kind").notNull().default("traveler_correction"),
    status: text("status").$type<BookingAmendmentStatus>().notNull().default("proposed"),
    baseBookingRevision: integer("base_booking_revision").notNull(),
    resultBookingRevision: integer("result_booking_revision").notNull(),
    requestedPatch: jsonb("requested_patch").$type<TravelerCorrectionPatch>().notNull(),
    acceptanceRequired: boolean("acceptance_required").notNull().default(false),
    policyDecisions: jsonb("policy_decisions")
      .$type<BookingAmendmentPolicyDecision[]>()
      .notNull()
      .default([]),
    priceDeltaCents: integer("price_delta_cents").notNull().default(0),
    priceCurrency: text("price_currency").notNull(),
    effects: jsonb("effects").$type<BookingAmendmentEffects>().notNull(),
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
    check("ck_booking_amendments_kind", sql`${table.kind} = 'traveler_correction'`),
    check(
      "ck_booking_amendments_status",
      sql`${table.status} IN ('proposed', 'accepted', 'applied', 'rejected', 'failed')`,
    ),
    check(
      "ck_booking_amendments_actor",
      sql`${table.requestedActor} IN ('customer', 'staff', 'partner', 'system')`,
    ),
    check(
      "ck_booking_amendments_accepted_actor",
      sql`${table.acceptedActor} IS NULL OR ${table.acceptedActor} IN ('customer', 'staff', 'partner', 'system')`,
    ),
    check(
      "ck_booking_amendments_applied_actor",
      sql`${table.appliedActor} IS NULL OR ${table.appliedActor} IN ('customer', 'staff', 'partner', 'system')`,
    ),
    check(
      "ck_booking_amendments_lifecycle",
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
      ) OR ${table.status} IN ('rejected', 'failed')`,
    ),
    check(
      "ck_booking_amendments_revision_step",
      sql`${table.baseBookingRevision} > 0 AND ${table.resultBookingRevision} = ${table.baseBookingRevision} + 1`,
    ),
    check("ck_booking_amendments_zero_delta", sql`${table.priceDeltaCents} = 0`),
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
    check("ck_booking_revisions_revision_positive", sql`${table.bookingRevision} > 0`),
    check("ck_booking_revisions_role", sql`${table.role} IN ('before', 'proposed_after')`),
  ],
)

export type BookingAmendmentRow = typeof bookingAmendments.$inferSelect
export type NewBookingAmendmentRow = typeof bookingAmendments.$inferInsert
export type BookingRevisionRow = typeof bookingRevisions.$inferSelect
export type NewBookingRevisionRow = typeof bookingRevisions.$inferInsert
