/**
 * Booking lines for money the operator collects rather than prices, and the
 * operator-visible record of what happened to them.
 *
 * These live in bookings because `booking_items` and `booking_activity_log`
 * are bookings' tables: the module that quoted the third party (commerce, and
 * whatever binds an offer source behind it) asks for the line rather than
 * writing one. The rule the caller cannot be trusted to remember is enforced
 * here instead — a line created through this path is always
 * `pricing_treatment = 'pass_through'`, with cost equal to sell, so there is
 * no margin for a markup rule to find and no basis for a commission.
 */

import { and, eq } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { bookingItems } from "./schema-items.js"
import { bookingActivityLog } from "./schema-operations.js"

export interface AddBookingPassThroughItemInput {
  bookingId: string
  /** Rendered on the booking and the invoice. */
  title: string
  /** The exact amount the third party set, in minor units. */
  priceMinor: number
  currency: string
  /**
   * Namespaced tax treatment for this line, e.g. `"insurance/exempt"`. When
   * set it overrides the operator's tax policy for this line only; leaving it
   * null means the line simply has no tax row.
   */
  taxTreatmentCode?: string | null
  /** The originating offer or application reference, when there is one. */
  sourceOfferId?: string | null
  serviceDate?: string | null
  metadata?: Record<string, unknown>
}

export interface AddedBookingPassThroughItem {
  bookingItemId: string
}

/**
 * Add a pass-through line to a booking.
 *
 * Cost is set equal to sell deliberately. It is not a placeholder for an
 * unknown net rate: the operator's net rate *is* the collected amount, and
 * recording anything else would invent a margin on money it never earned.
 */
export async function addBookingPassThroughItem(
  db: PostgresJsDatabase,
  input: AddBookingPassThroughItemInput,
): Promise<AddedBookingPassThroughItem | null> {
  const [row] = await db
    .insert(bookingItems)
    .values({
      bookingId: input.bookingId,
      title: input.title,
      itemType: "service",
      status: "confirmed",
      quantity: 1,
      sellCurrency: input.currency,
      unitSellAmountCents: input.priceMinor,
      totalSellAmountCents: input.priceMinor,
      costCurrency: input.currency,
      unitCostAmountCents: input.priceMinor,
      totalCostAmountCents: input.priceMinor,
      pricingTreatment: "pass_through",
      taxTreatmentCode: input.taxTreatmentCode ?? null,
      sourceOfferId: input.sourceOfferId ?? null,
      serviceDate: input.serviceDate ?? null,
      metadata: input.metadata,
    })
    .returning({ id: bookingItems.id })
  return row ? { bookingItemId: row.id } : null
}

export interface BookingPassThroughItem {
  bookingItemId: string
  title: string
  /** What the booking charged for the line, in minor units. */
  priceMinor: number
  currency: string
  sourceOfferId: string | null
  metadata: Record<string, unknown> | null
}

/**
 * The pass-through lines on a booking, for whoever collected the money.
 *
 * Exists so a module that sold something it did not price can find its own
 * lines back — at charge time to avoid writing a second one, and after payment
 * to reconcile against what the third party settled — without reading
 * `booking_items` itself.
 */
export async function listBookingPassThroughItems(
  db: PostgresJsDatabase,
  bookingId: string,
): Promise<BookingPassThroughItem[]> {
  const rows = await db
    .select({
      id: bookingItems.id,
      title: bookingItems.title,
      totalSellAmountCents: bookingItems.totalSellAmountCents,
      sellCurrency: bookingItems.sellCurrency,
      sourceOfferId: bookingItems.sourceOfferId,
      metadata: bookingItems.metadata,
    })
    .from(bookingItems)
    .where(
      and(eq(bookingItems.bookingId, bookingId), eq(bookingItems.pricingTreatment, "pass_through")),
    )

  return rows.map((row) => ({
    bookingItemId: row.id,
    title: row.title,
    priceMinor: row.totalSellAmountCents ?? 0,
    currency: row.sellCurrency ?? "",
    sourceOfferId: row.sourceOfferId ?? null,
    metadata: (row.metadata as Record<string, unknown> | null) ?? null,
  }))
}

export interface RecordBookingSystemActivityInput {
  bookingId: string
  /**
   * Discriminator for what happened, e.g. `"ancillary.premium.drift"`. Carried
   * in `metadata` rather than as an activity-type enum member: the enum
   * describes what happened to the *booking*, and every module adding its own
   * word to it would make that vocabulary useless.
   */
  event: string
  description: string
  /** Whoever caused it, when a person did. Absent means the system acted alone. */
  actorId?: string | null
  metadata?: Record<string, unknown>
}

/** Append an operator-visible record of an automated outcome. */
export async function recordBookingSystemActivity(
  db: PostgresJsDatabase,
  input: RecordBookingSystemActivityInput,
): Promise<void> {
  await db.insert(bookingActivityLog).values({
    bookingId: input.bookingId,
    actorId: input.actorId ?? null,
    activityType: "system_action",
    description: input.description,
    metadata: { event: input.event, ...input.metadata },
  })
}
