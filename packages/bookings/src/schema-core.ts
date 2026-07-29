import type { NamespacedCustomFieldValues } from "@voyant-travel/core/custom-fields"
import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
} from "drizzle-orm/pg-core"

import {
  bookingParticipantTypeEnum,
  bookingPiiAccessActionEnum,
  bookingPiiAccessOutcomeEnum,
  bookingSourceTypeEnum,
  bookingStatusEnum,
  bookingTravelerCategoryEnum,
} from "./schema-shared.js"

export interface BookingPriceOverride {
  isManual: true
  originalAmountCents: number | null
  overriddenAmountCents: number
  currency: string
  reason: string
  overriddenBy: string
  overriddenAt: string
}

export const bookings = pgTable(
  "bookings",
  {
    id: typeId("bookings"),
    bookingNumber: text("booking_number").notNull().unique(),
    status: bookingStatusEnum("status").notNull().default("draft"),
    personId: text("person_id"),
    organizationId: text("organization_id"),
    sourceType: bookingSourceTypeEnum("source_type").notNull().default("manual"),
    externalBookingRef: text("external_booking_ref"),
    communicationLanguage: text("communication_language"),
    contactFirstName: text("contact_first_name"),
    contactLastName: text("contact_last_name"),
    contactPartyType: text("contact_party_type"),
    contactTaxId: text("contact_tax_id"),
    contactEmail: text("contact_email"),
    contactPhone: text("contact_phone"),
    contactPreferredLanguage: text("contact_preferred_language"),
    contactCountry: text("contact_country"),
    contactRegion: text("contact_region"),
    contactCity: text("contact_city"),
    contactAddressLine1: text("contact_address_line1"),
    contactAddressLine2: text("contact_address_line2"),
    contactPostalCode: text("contact_postal_code"),
    sellCurrency: text("sell_currency").notNull(),
    baseCurrency: text("base_currency"),
    fxRateSetId: text("fx_rate_set_id"),
    sellAmountCents: integer("sell_amount_cents"),
    baseSellAmountCents: integer("base_sell_amount_cents"),
    costAmountCents: integer("cost_amount_cents"),
    baseCostAmountCents: integer("base_cost_amount_cents"),
    marginPercent: integer("margin_percent"),
    startDate: date("start_date"),
    endDate: date("end_date"),
    pax: integer("pax"),
    internalNotes: text("internal_notes"),
    /**
     * Booking-level customer payment policy override. When set, this
     * booking's payment schedule uses these terms instead of the
     * cascade default. Wins over listing / category / supplier /
     * operator default. Shape mirrors `PaymentPolicy` from
     * `@voyant-travel/finance`.
     *
     * `null` means "use the resolved cascade policy" — most bookings
     * never set this; it's reserved for ops adjustments where a
     * specific deal warrants different terms (goodwill, channel-
     * specific deal, etc.).
     */
    customerPaymentPolicy: jsonb("customer_payment_policy"),
    priceOverride: jsonb("price_override").$type<BookingPriceOverride | null>(),
    /**
     * Deployment-declared custom fields (see `@voyant-travel/core/custom-fields`).
     * Validated at the write boundary against the deployment's custom-field
     * registry; `{}` when none are declared. Keys are the registered field keys.
     */
    customFields: jsonb("custom_fields").$type<NamespacedCustomFieldValues>().notNull().default({}),
    holdExpiresAt: timestamp("hold_expires_at", { withTimezone: true }),
    /**
     * Immutable, server-controlled timestamp for the booking's first accepted
     * state. Unlike `confirmedAt`, this is never cleared by later lifecycle
     * transitions and is therefore safe for plan-usage accounting.
     */
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
    expiredAt: timestamp("expired_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    awaitingPaymentAt: timestamp("awaiting_payment_at", { withTimezone: true }),
    paidAt: timestamp("paid_at", { withTimezone: true }),
    redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_bookings_status").on(table.status),
    index("idx_bookings_status_created").on(table.status, table.createdAt),
    index("idx_bookings_person").on(table.personId),
    index("idx_bookings_organization").on(table.organizationId),
    index("idx_bookings_source_type").on(table.sourceType),
    index("idx_bookings_number").on(table.bookingNumber),
    index("idx_bookings_accepted_at").on(table.acceptedAt),
    // base_currency covers the base_*_amount_cents columns. If any base
    // amount is set, base_currency must be set so downstream FX/reporting
    // code can interpret it. Both null is fine (FX deferred until quote
    // becomes a confirmed booking).
    check(
      "ck_bookings_base_currency_amounts",
      // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`(${table.baseSellAmountCents} IS NULL AND ${table.baseCostAmountCents} IS NULL) OR ${table.baseCurrency} IS NOT NULL`,
    ),
  ],
)

export const bookingTravelers = pgTable(
  "booking_travelers",
  {
    id: typeId("booking_travelers"),
    bookingId: typeIdRef("booking_id")
      .notNull()
      .references(() => bookings.id, { onDelete: "cascade" }),
    personId: text("person_id"),
    participantType: bookingParticipantTypeEnum("participant_type").notNull().default("traveler"),
    travelerCategory: bookingTravelerCategoryEnum("traveler_category"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name").notNull(),
    email: text("email"),
    phone: text("phone"),
    preferredLanguage: text("preferred_language"),
    specialRequests: text("special_requests"),
    isPrimary: boolean("is_primary").notNull().default(false),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_travelers_booking").on(table.bookingId),
    index("idx_booking_travelers_booking_primary_created").on(
      table.bookingId,
      table.isPrimary,
      table.createdAt,
    ),
    index("idx_booking_travelers_booking_type_created").on(
      table.bookingId,
      table.participantType,
      table.createdAt,
    ),
    index("idx_booking_travelers_type").on(table.participantType),
    index("idx_booking_travelers_person").on(table.personId),
  ],
)

export const bookingPiiAccessLog = pgTable(
  "booking_pii_access_log",
  {
    id: typeId("booking_pii_access_log"),
    bookingId: text("booking_id"),
    travelerId: text("traveler_id"),
    actorId: text("actor_id"),
    actorType: text("actor_type"),
    callerType: text("caller_type"),
    action: bookingPiiAccessActionEnum("action").notNull(),
    outcome: bookingPiiAccessOutcomeEnum("outcome").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_pii_access_log_booking").on(table.bookingId),
    index("idx_booking_pii_access_log_traveler").on(table.travelerId),
    index("idx_booking_pii_access_log_actor").on(table.actorId),
    index("idx_booking_pii_access_log_created_at").on(table.createdAt),
  ],
)

export type Booking = typeof bookings.$inferSelect
export type NewBooking = typeof bookings.$inferInsert
export type BookingTraveler = typeof bookingTravelers.$inferSelect
export type NewBookingTraveler = typeof bookingTravelers.$inferInsert
export type BookingPiiAccessLog = typeof bookingPiiAccessLog.$inferSelect
export type NewBookingPiiAccessLog = typeof bookingPiiAccessLog.$inferInsert
