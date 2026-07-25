/**
 * `booking_drafts` — server-side draft state for the unified booking
 * journey. Survives refresh, tab loss, and short walk-aways.
 * `consumed_booking_id` records the booking created later through the
 * admitted Finance command; abandoned drafts never produce a booking.
 *
 * Per `docs/architecture/booking-journey-architecture.md` §5.7 +
 * §12.10 (settled on the sibling-table option B — ships alongside
 * `booking_session_states` rather than extending it).
 *
 * Lifecycle:
 *   1. Wizard PUTs the draft on every step transition.
 *   2. Quote requests resolve draft → engine → catalog_quotes.
 *   3. After authorized booking creation, the caller stamps
 *      `consumed_booking_id` here.
 *   4. Abandoned drafts (`expires_at` passed) are reaped by a daily
 *      job, releasing any associated soft holds first.
 */

import { typeId } from "@voyant-travel/db/lib/typeid-column"
import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

export const bookingDraftsTable = pgTable(
  "booking_drafts",
  {
    id: typeId("booking_drafts"),

    /** Pointer to the catalog row this draft is for. */
    entity_module: text("entity_module").notNull(),
    entity_id: text("entity_id").notNull(),
    source_kind: text("source_kind").notNull(),
    source_connection_id: text("source_connection_id"),
    source_ref: text("source_ref"),

    /** Full BookingDraft minus pricing — opaque jsonb for forward
     *  compat. Validated at the route layer against `bookingDraftV1`. */
    draft_payload: jsonb("draft_payload").$type<Record<string, unknown>>().notNull(),

    /** Wizard's current step — diagnostic, not load-bearing. */
    current_step: text("current_step"),

    /** Most-recent quote id snapshotted off this draft. */
    current_quote_id: text("current_quote_id"),

    /** Adapter-driven; null when no hold is active. */
    hold_expires_at: timestamp("hold_expires_at", { withTimezone: true }),

    /** Set on successful commit — the journey is consumed. */
    consumed_booking_id: text("consumed_booking_id"),
    consumed_at: timestamp("consumed_at", { withTimezone: true }),

    /** Author — staff user id for operator-side, anonymous session
     *  token (or null) for storefront. */
    created_by: text("created_by"),

    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),

    /** Session-abandonment TTL — default 24h, set by the route layer. */
    expires_at: timestamp("expires_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    index("idx_booking_drafts_entity").on(table.entity_module, table.entity_id),
    index("idx_booking_drafts_expires").on(table.expires_at),
    index("idx_booking_drafts_created_by").on(table.created_by),
    index("idx_booking_drafts_consumed").on(table.consumed_booking_id),
  ],
)

export type SelectBookingDraft = typeof bookingDraftsTable.$inferSelect
export type InsertBookingDraft = typeof bookingDraftsTable.$inferInsert
