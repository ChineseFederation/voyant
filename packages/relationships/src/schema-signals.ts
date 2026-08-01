/**
 * Customer signals — lighter than `proposals` (no deal value or
 * stages), heavier than `segments` (lifecycle + assignment). Records
 * "person X expressed interest in product/departure Y from source Z,
 * status pending". The most common use cases:
 *
 *   - Notify-availability ("ping me when this departure opens up")
 *   - Wishlist / saved trips
 *   - Inquiry captured by an operator (phone call, web form)
 *   - Request-offer pre-pipeline that may or may not become a booking
 *   - Abandoned-cart recovery
 *
 * Cross-module IDs (`productId`, `optionUnitId`, `resolvedBookingId`)
 * are intentionally plain `text()` columns rather than FK references
 * — voyant's project-wide rule is that cross-module FKs go through
 * link tables or stay loose. The signal is owned by CRM; products
 * and bookings reference its id, not the other way around.
 */

import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { index, jsonb, pgEnum, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { people } from "./schema-accounts.js"

export const customerSignalKindEnum = pgEnum("customer_signal_kind", [
  "wishlist",
  "notify",
  "inquiry",
  "request_offer",
  "referral",
])

export const customerSignalSourceEnum = pgEnum("customer_signal_source", [
  "form",
  "phone",
  "admin",
  "abandoned_cart",
  "website",
  "booking",
])

export const customerSignalStatusEnum = pgEnum("customer_signal_status", [
  "new",
  "contacted",
  "qualified",
  "converted",
  "lost",
  "expired",
])

export const customerSignals = pgTable(
  "customer_signals",
  {
    id: typeId("customer_signals"),
    personId: typeIdRef("person_id")
      .notNull()
      .references(() => people.id, { onDelete: "cascade" }),
    /** Optional reference into `@voyant-travel/inventory`. Plain text — no FK. */
    productId: text("product_id"),
    /** Optional reference into a product's `option_units` row (the "departure"-equivalent). Plain text — no FK. */
    optionUnitId: text("option_unit_id"),
    kind: customerSignalKindEnum("kind").notNull(),
    source: customerSignalSourceEnum("source").notNull(),
    status: customerSignalStatusEnum("status").notNull().default("new"),
    /**
     * Free-form priority. The validation layer constrains input to
     * `low | normal | high | urgent`; storing as text keeps room for
     * deployment-specific values without a DB migration.
     */
    priority: text("priority").notNull().default("normal"),
    notes: text("notes"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    /** User id (Better Auth user) of the staff member assigned to follow up. */
    assignedToUserId: text("assigned_to_user_id"),
    followUpAt: timestamp("follow_up_at", { withTimezone: true }),
    /** Set when the signal was converted into a real booking. Plain text — cross-module FK. */
    resolvedBookingId: text("resolved_booking_id"),
    /** Free-form provenance id (form-submission id, abandoned-cart key, ...). */
    sourceSubmissionId: text("source_submission_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_customer_signals_person_status_created").on(
      table.personId,
      table.status,
      table.createdAt,
    ),
    index("idx_customer_signals_assignee_status").on(table.assignedToUserId, table.status),
    index("idx_customer_signals_kind").on(table.kind),
    index("idx_customer_signals_resolved_booking").on(table.resolvedBookingId),
  ],
)

export type CustomerSignal = typeof customerSignals.$inferSelect
export type NewCustomerSignal = typeof customerSignals.$inferInsert
