import { typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import { check, index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core"

import { bookings } from "./schema-core.js"

export const bookingOriginSources = [
  "manual",
  "direct_b2c",
  "accepted_proposal_version",
  "catalog_price_availability",
  "catalog_snapshot",
  "provider_source_order",
  "legacy_transaction",
] as const

export type BookingOriginSource = (typeof bookingOriginSources)[number]

export interface BookingOriginLegacyTransactionIds extends Record<string, unknown> {
  offerId?: string | null
  orderId?: string | null
}

export const bookingOrigins = pgTable(
  "booking_origins",
  {
    bookingId: typeIdRef("booking_id")
      .primaryKey()
      .references(() => bookings.id, { onDelete: "cascade" }),
    originSource: text("origin_source").$type<BookingOriginSource>().notNull().default("manual"),
    proposalVersionId: text("proposal_version_id"),
    tripSnapshotId: text("trip_snapshot_id"),
    reservationPlanId: text("reservation_plan_id"),
    catalogPriceResponseId: text("catalog_price_response_id"),
    catalogSnapshotId: text("catalog_snapshot_id"),
    providerSourceKind: text("provider_source_kind"),
    providerSourceProvider: text("provider_source_provider"),
    providerSourceConnectionId: text("provider_source_connection_id"),
    providerSourceRef: text("provider_source_ref"),
    providerOrderRef: text("provider_order_ref"),
    legacyTransactionOfferId: text("legacy_transaction_offer_id"),
    legacyTransactionOrderId: text("legacy_transaction_order_id"),
    legacyTransactionIds: jsonb(
      "legacy_transaction_ids",
    ).$type<BookingOriginLegacyTransactionIds | null>(),
    metadata: jsonb("metadata").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    check(
      "ck_booking_origins_source",
      sql`${table.originSource} IN ('manual', 'direct_b2c', 'accepted_proposal_version', 'catalog_price_availability', 'catalog_snapshot', 'provider_source_order', 'legacy_transaction')`,
    ),
    index("idx_booking_origins_proposal_version").on(table.proposalVersionId),
    index("idx_booking_origins_trip_snapshot").on(table.tripSnapshotId),
    index("idx_booking_origins_reservation_plan").on(table.reservationPlanId),
    index("idx_booking_origins_catalog_price_response").on(table.catalogPriceResponseId),
    index("idx_booking_origins_catalog_snapshot").on(table.catalogSnapshotId),
    index("idx_booking_origins_provider_order").on(table.providerOrderRef),
    index("idx_booking_origins_legacy_offer").on(table.legacyTransactionOfferId),
    index("idx_booking_origins_legacy_order").on(table.legacyTransactionOrderId),
  ],
)

export type BookingOrigin = typeof bookingOrigins.$inferSelect
export type NewBookingOrigin = typeof bookingOrigins.$inferInsert
