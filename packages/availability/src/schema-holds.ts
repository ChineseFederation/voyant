import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { index, integer, pgTable, text, timestamp } from "drizzle-orm/pg-core"
import { availabilitySlots } from "./schema-core.js"

/**
 * `availability_holds` — soft holds against an availability slot owned by a
 * canonical Booking Session Hold. Decrements `availability_slots.remainingPax`
 * while live; Booking Session maintenance releases stale holds and restores
 * capacity.
 *
 * Per booking-journey-architecture §5.7 + §6 — the doc proposes
 * `bookingAllocations` for owned holds, but allocations require a
 * `booking_id` FK and journey holds are pre-booking. A dedicated
 * table avoids the chicken-and-egg.
 */
export const availabilityHolds = pgTable(
  "availability_holds",
  {
    id: typeId("availability_holds"),
    /**
     * Canonical Booking Session Hold id. The physical column keeps its beta
     * name until the availability-owned schema migration renames it.
     */
    draftId: text("draft_id").notNull(),
    /** Token returned to callers; uniquely identifies the hold for
     *  extend/release. */
    holdToken: text("hold_token").notNull(),
    productId: text("product_id").notNull(),
    slotId: typeIdRef("slot_id")
      .notNull()
      .references(() => availabilitySlots.id, { onDelete: "cascade" }),
    paxCount: integer("pax_count").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    /**
     * Conversion is recorded on the hold without cross-package foreign keys.
     * Bookings owns both referenced rows and writes these fields atomically
     * while turning reserved capacity into a booking allocation.
     */
    convertedAt: timestamp("converted_at", { withTimezone: true }),
    convertedBookingId: text("converted_booking_id"),
    convertedAllocationId: text("converted_allocation_id"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_availability_holds_slot").on(table.slotId),
    index("idx_availability_holds_draft").on(table.draftId),
    index("idx_availability_holds_token").on(table.holdToken),
    index("idx_availability_holds_expires").on(table.expiresAt),
    index("idx_availability_holds_converted_booking").on(table.convertedBookingId),
  ],
)

export type AvailabilityHold = typeof availabilityHolds.$inferSelect
export type NewAvailabilityHold = typeof availabilityHolds.$inferInsert
