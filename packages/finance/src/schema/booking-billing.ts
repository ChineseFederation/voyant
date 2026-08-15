import { typeId, typeIdRef } from "@voyant-travel/db/lib/typeid-column"
import { sql } from "drizzle-orm"
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core"

import {
  commissionModelEnum,
  commissionRecipientTypeEnum,
  commissionStatusEnum,
  guaranteeStatusEnum,
  guaranteeTypeEnum,
  paymentScheduleStatusEnum,
  paymentScheduleTypeEnum,
  taxScopeEnum,
} from "./enums.js"
import { paymentInstruments } from "./payment-instruments.js"
import { paymentAuthorizations } from "./payment-processing.js"

// ---------- booking_payment_schedules ----------

export const bookingPaymentSchedules = pgTable(
  "booking_payment_schedules",
  {
    id: typeId("booking_payment_schedules"),
    bookingId: text("booking_id").notNull(),
    bookingItemId: text("booking_item_id"),
    /**
     * Set when this obligation was raised by a Booking Amendment rather
     * than by the original payment plan. Plain id, not an FK — amendments
     * are owned by `@voyant-travel/bookings`. Unique where present, so
     * replaying `recordBookingAmendment` cannot bill the customer twice.
     */
    amendmentId: text("amendment_id"),
    scheduleType: paymentScheduleTypeEnum("schedule_type").notNull().default("balance"),
    status: paymentScheduleStatusEnum("status").notNull().default("pending"),
    dueDate: date("due_date").notNull(),
    /** IANA zone whose local calendar date `dueDate` belongs to. */
    dueTimeZone: text("due_time_zone").notNull().default("UTC"),
    currency: text("currency").notNull(),
    amountCents: integer("amount_cents").notNull(),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_payment_schedules_booking").on(table.bookingId),
    index("idx_booking_payment_schedules_booking_due_created").on(
      table.bookingId,
      table.dueDate,
      table.createdAt,
    ),
    index("idx_booking_payment_schedules_item").on(table.bookingItemId),
    uniqueIndex("uq_booking_payment_schedules_amendment")
      .on(table.amendmentId)
      .where(sql`${table.amendmentId} IS NOT NULL`),
    index("idx_booking_payment_schedules_status").on(table.status),
    index("idx_booking_payment_schedules_due_date").on(table.dueDate),
  ],
)

export type BookingPaymentSchedule = typeof bookingPaymentSchedules.$inferSelect
export type NewBookingPaymentSchedule = typeof bookingPaymentSchedules.$inferInsert

// ---------- booking_guarantees ----------

export const bookingGuarantees = pgTable(
  "booking_guarantees",
  {
    id: typeId("booking_guarantees"),
    bookingId: text("booking_id").notNull(),
    bookingPaymentScheduleId: typeIdRef("booking_payment_schedule_id").references(
      () => bookingPaymentSchedules.id,
      { onDelete: "set null" },
    ),
    bookingItemId: text("booking_item_id"),
    guaranteeType: guaranteeTypeEnum("guarantee_type").notNull(),
    status: guaranteeStatusEnum("status").notNull().default("pending"),
    paymentInstrumentId: typeIdRef("payment_instrument_id").references(
      () => paymentInstruments.id,
      {
        onDelete: "set null",
      },
    ),
    paymentAuthorizationId: typeIdRef("payment_authorization_id").references(
      () => paymentAuthorizations.id,
      { onDelete: "set null" },
    ),
    currency: text("currency"),
    amountCents: integer("amount_cents"),
    provider: text("provider"),
    referenceNumber: text("reference_number"),
    guaranteedAt: timestamp("guaranteed_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    releasedAt: timestamp("released_at", { withTimezone: true }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_guarantees_booking").on(table.bookingId),
    index("idx_booking_guarantees_booking_created").on(table.bookingId, table.createdAt),
    index("idx_booking_guarantees_schedule").on(table.bookingPaymentScheduleId),
    index("idx_booking_guarantees_item").on(table.bookingItemId),
    index("idx_booking_guarantees_instrument").on(table.paymentInstrumentId),
    index("idx_booking_guarantees_authorization").on(table.paymentAuthorizationId),
    index("idx_booking_guarantees_status").on(table.status),
    check(
      "ck_booking_guarantees_currency_amount",
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`(${table.currency} IS NULL) = (${table.amountCents} IS NULL)`,
    ),
  ],
)

export type BookingGuarantee = typeof bookingGuarantees.$inferSelect
export type NewBookingGuarantee = typeof bookingGuarantees.$inferInsert

// ---------- booking_item_tax_lines ----------

export const bookingItemTaxLines = pgTable(
  "booking_item_tax_lines",
  {
    id: typeId("booking_item_tax_lines"),
    bookingItemId: text("booking_item_id").notNull(),
    code: text("code"),
    name: text("name").notNull(),
    jurisdiction: text("jurisdiction"),
    scope: taxScopeEnum("scope").notNull().default("excluded"),
    currency: text("currency").notNull(),
    amountCents: integer("amount_cents").notNull(),
    rateBasisPoints: integer("rate_basis_points"),
    includedInPrice: boolean("included_in_price").notNull().default(false),
    remittanceParty: text("remittance_party"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_item_tax_lines_item").on(table.bookingItemId),
    index("idx_booking_item_tax_lines_item_sort_created").on(
      table.bookingItemId,
      table.sortOrder,
      table.createdAt,
    ),
    index("idx_booking_item_tax_lines_scope").on(table.scope),
  ],
)

export type BookingItemTaxLine = typeof bookingItemTaxLines.$inferSelect
export type NewBookingItemTaxLine = typeof bookingItemTaxLines.$inferInsert

// ---------- booking_item_commissions ----------

export const bookingItemCommissions = pgTable(
  "booking_item_commissions",
  {
    id: typeId("booking_item_commissions"),
    bookingItemId: text("booking_item_id").notNull(),
    channelId: text("channel_id"),
    recipientType: commissionRecipientTypeEnum("recipient_type").notNull(),
    commissionModel: commissionModelEnum("commission_model").notNull().default("percentage"),
    currency: text("currency"),
    amountCents: integer("amount_cents"),
    rateBasisPoints: integer("rate_basis_points"),
    status: commissionStatusEnum("status").notNull().default("pending"),
    payableAt: date("payable_at"),
    paidAt: date("paid_at"),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("idx_booking_item_commissions_item").on(table.bookingItemId),
    index("idx_booking_item_commissions_item_created").on(table.bookingItemId, table.createdAt),
    index("idx_booking_item_commissions_channel").on(table.channelId),
    index("idx_booking_item_commissions_status").on(table.status),
    check(
      "ck_booking_item_commissions_currency_amount",
      // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
      sql`(${table.currency} IS NULL) = (${table.amountCents} IS NULL)`,
    ),
  ],
)

export type BookingItemCommission = typeof bookingItemCommissions.$inferSelect
export type NewBookingItemCommission = typeof bookingItemCommissions.$inferInsert
