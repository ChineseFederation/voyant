import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import { programs } from "./schema.js"

/**
 * Sourcing funnel — RFP → invitations → bids → evaluation → award. CRM
 * opportunity/proposal model single-deal closure, not multi-supplier bid
 * solicitation/comparison/scoring; this is the gap. See RFC voyant#1489 §3/§5
 * (Phase 4). Award atomically accepts the winning bid, rejects the rest, and
 * moves the RFP to `awarded`; the service emits `mice.rfp.awarded` so
 * deployment-level workflows can create/link downstream contract, room-block,
 * or booking artifacts.
 */
export const rfpStatusEnum = pgEnum("mice_rfp_status", [
  "draft",
  "issued",
  "closed",
  "awarded",
  "cancelled",
])

export const rfpInvitationStatusEnum = pgEnum("mice_rfp_invitation_status", [
  "invited",
  "viewed",
  "declined",
  "responded",
])

export const bidStatusEnum = pgEnum("mice_bid_status", [
  "draft",
  "submitted",
  "under_review",
  "accepted",
  "rejected",
])

export const rfps = pgTable(
  "mice_rfps",
  {
    id: typeId("mice_rfps"),
    programId: typeIdRef("program_id")
      .notNull()
      .references(() => programs.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    requirements: jsonb("requirements").$type<Record<string, unknown>>(),
    status: rfpStatusEnum("status").notNull().default("draft"),
    issuedAt: timestamp("issued_at", { withTimezone: true }),
    dueAt: timestamp("due_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mice_rfps_program").on(table.programId),
    index("idx_mice_rfps_status").on(table.status),
  ],
)

export const rfpInvitations = pgTable(
  "mice_rfp_invitations",
  {
    id: typeId("mice_rfp_invitations"),
    rfpId: typeIdRef("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    supplierId: typeIdRef("supplier_id").notNull(), // → distribution suppliers (loose)
    status: rfpInvitationStatusEnum("status").notNull().default("invited"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mice_rfp_invitations_supplier").on(table.supplierId),
    uniqueIndex("uidx_mice_rfp_invitations_rfp_supplier").on(table.rfpId, table.supplierId),
  ],
)

export const bids = pgTable(
  "mice_bids",
  {
    id: typeId("mice_bids"),
    rfpId: typeIdRef("rfp_id")
      .notNull()
      .references(() => rfps.id, { onDelete: "cascade" }),
    supplierId: typeIdRef("supplier_id").notNull(), // → distribution suppliers (loose)
    status: bidStatusEnum("status").notNull().default("draft"),
    totalCents: integer("total_cents"),
    currency: text("currency"),
    proposalDoc: text("proposal_doc"),
    validUntil: timestamp("valid_until", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_mice_bids_rfp").on(table.rfpId),
    index("idx_mice_bids_supplier").on(table.supplierId),
    index("idx_mice_bids_status").on(table.status),
  ],
)

export const bidLines = pgTable(
  "mice_bid_lines",
  {
    id: typeId("mice_bid_lines"),
    bidId: typeIdRef("bid_id")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    requirementRef: text("requirement_ref"),
    description: text("description"),
    quantity: integer("quantity").notNull().default(1),
    unitCents: integer("unit_cents"),
    totalCents: integer("total_cents"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mice_bid_lines_bid").on(table.bidId)],
)

export const bidEvaluations = pgTable(
  "mice_bid_evaluations",
  {
    id: typeId("mice_bid_evaluations"),
    bidId: typeIdRef("bid_id")
      .notNull()
      .references(() => bids.id, { onDelete: "cascade" }),
    criterion: text("criterion").notNull(),
    weight: integer("weight"),
    score: integer("score"),
    notes: text("notes"),
    evaluatedBy: text("evaluated_by"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("idx_mice_bid_evaluations_bid").on(table.bidId)],
)

export type Rfp = typeof rfps.$inferSelect
export type NewRfp = typeof rfps.$inferInsert
export type RfpInvitation = typeof rfpInvitations.$inferSelect
export type NewRfpInvitation = typeof rfpInvitations.$inferInsert
export type Bid = typeof bids.$inferSelect
export type NewBid = typeof bids.$inferInsert
export type BidLine = typeof bidLines.$inferSelect
export type NewBidLine = typeof bidLines.$inferInsert
export type BidEvaluation = typeof bidEvaluations.$inferSelect
export type NewBidEvaluation = typeof bidEvaluations.$inferInsert
