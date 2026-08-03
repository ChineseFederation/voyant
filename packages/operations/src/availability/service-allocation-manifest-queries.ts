import { sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

import { activeBookingStatusesForSlotSql } from "./booking-statuses.js"
import { executeRows, sqlTextArray } from "./service-allocation-sql.js"

export interface BookingRow {
  id: string
  booking_number: string
  status: string
  created_at: string | Date | null
  contact_first_name: string | null
  contact_last_name: string | null
  contact_email: string | null
  contact_phone: string | null
  sell_currency: string | null
  pax: number | null
  sell_amount_cents: number | null
  invoice_total_cents: number | null
  invoice_paid_cents: number | null
  schedules_paid_cents: number | null
}

export type AllocationPaymentStatus = "paid" | "partial" | "unpaid"

/**
 * Roll up a booking's payment state into a single paid / partial / unpaid
 * status for the allocation chip's color coding. Signals checked in order:
 *
 *   1. Free booking (`sell_amount_cents <= 0`) -> `paid` (nothing owed).
 *   2. Sum of `booking_payment_schedules.amount_cents WHERE status='paid'`
 *      covers `sell_amount_cents` -> `paid` (deposit-milestone flows that
 *      never run a final invoice).
 *   3. That schedule sum is positive -> `partial`.
 *   4. No invoices issued (`invoice_total_cents = 0`) -> `unpaid`.
 *   5. `invoice_paid_cents <= 0` -> `unpaid`.
 *   6. `invoice_paid_cents >= invoice_total_cents` -> `paid`.
 *   7. Otherwise -> `partial`.
 *
 * The schedule check was added because the invoice-only rule mis-colored
 * booked-and-settled trips as red whenever the operator billed via
 * schedules without issuing an invoice (issue #1079). That rule also
 * consulted `bookings.paid_at` as an operator override; the v1 commitment
 * lifecycle (#4100) dropped the column outright -- it was folded into
 * `accepted_at`/`confirmed_at`, not into a settlement signal -- so
 * settlement is now read from schedules and invoices only.
 */
export function derivePaymentStatus(row: BookingRow): AllocationPaymentStatus {
  const sellAmount = row.sell_amount_cents ?? 0
  if (sellAmount <= 0) return "paid"

  const schedulesPaid = row.schedules_paid_cents ?? 0
  if (schedulesPaid >= sellAmount) return "paid"

  const invoiceTotal = row.invoice_total_cents ?? 0
  const invoicePaid = row.invoice_paid_cents ?? 0
  if (invoicePaid >= invoiceTotal && invoiceTotal > 0) return "paid"

  if (schedulesPaid > 0 || invoicePaid > 0) return "partial"
  return "unpaid"
}

/**
 * Settled-amount counterpart to `derivePaymentStatus`. Returns the best
 * available signal of how much has actually been collected for the
 * booking -- the larger of schedule and invoice settlement. Capped at
 * `sell_amount_cents` so partial-overpay scenarios don't distort slot
 * totals.
 */
export function derivePaidAmountCents(row: BookingRow): number {
  const sellAmount = row.sell_amount_cents ?? 0
  if (sellAmount <= 0) return 0
  const schedulesPaid = row.schedules_paid_cents ?? 0
  const invoicePaid = row.invoice_paid_cents ?? 0
  return Math.min(Math.max(schedulesPaid, invoicePaid), sellAmount)
}

interface TravelerRow {
  id: string
  booking_id: string
  first_name: string
  last_name: string
  email: string | null
  phone: string | null
  is_primary: boolean
  participant_type: string
  traveler_category: string | null
  is_lead_traveler: boolean | null
  sharing_group_id: string | null
  room_type_id: string | null
  bed_preference: string | null
  allocations: unknown
  has_accessibility_needs: boolean
  has_dietary_requirements: boolean
}

interface BookingUnitRow {
  booking_id: string
  option_id: string | null
  option_unit_id: string | null
  option_unit_code: string | null
}

export async function loadSlotBookingRows(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<BookingRow[]> {
  // `invoices` and `booking_payment_schedules` are LEFT JOIN aggregations that
  // may reference tables missing in catalog-less / finance-less deploys.
  // We try four query shapes in order of decreasing data, falling through on
  // any "undefined_table" (Postgres 42P01). The ordering matters: if invoices
  // exists but schedules doesn't, we still want to preserve invoice data
  // (and vice versa) -- so we try the invoices-only and schedules-only paths
  // separately rather than collapsing both joins together.
  try {
    return await loadSlotBookingRowsBothJoins(db, slotId)
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error
  }

  // Drop the schedules join (preserves invoice rollups when schedules is missing).
  try {
    return await loadSlotBookingRowsInvoicesOnly(db, slotId)
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error
  }

  // Drop the invoices join (preserves schedule rollups when invoices is missing).
  try {
    return await loadSlotBookingRowsSchedulesOnly(db, slotId)
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error
  }

  // Final fallback: both tables missing -- bare bookings query.
  return loadSlotBookingRowsBare(db, slotId)
}

async function loadSlotBookingRowsBothJoins(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<BookingRow[]> {
  return executeRows<BookingRow>(
    db,
    sql`
    SELECT DISTINCT
      b.id,
      b.booking_number,
      b.status,
      b.created_at,
      b.contact_first_name,
      b.contact_last_name,
      b.contact_email,
      b.contact_phone,
      b.sell_currency,
      b.pax,
      b.sell_amount_cents,
      COALESCE(inv.total_cents, 0) AS invoice_total_cents,
      COALESCE(inv.paid_cents, 0) AS invoice_paid_cents,
      COALESCE(sch.paid_cents, 0) AS schedules_paid_cents
    FROM bookings b
    JOIN booking_allocations ba ON ba.booking_id = b.id
    LEFT JOIN (
      SELECT
        booking_id,
        SUM(total_cents) AS total_cents,
        SUM(paid_cents) AS paid_cents
      FROM invoices
      WHERE status <> 'void'
      GROUP BY booking_id
    ) inv ON inv.booking_id = b.id
    LEFT JOIN (
      SELECT
        booking_id,
        SUM(amount_cents) AS paid_cents
      FROM booking_payment_schedules
      WHERE status = 'paid'
      GROUP BY booking_id
    ) sch ON sch.booking_id = b.id
    WHERE ba.availability_slot_id = ${slotId}
      AND b.status IN (${activeBookingStatusesForSlotSql()})
      AND ba.status IN ('held', 'confirmed', 'fulfilled')
    ORDER BY b.created_at, b.booking_number
  `,
  )
}

async function loadSlotBookingRowsInvoicesOnly(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<BookingRow[]> {
  return executeRows<BookingRow>(
    db,
    sql`
    SELECT DISTINCT
      b.id,
      b.booking_number,
      b.status,
      b.created_at,
      b.contact_first_name,
      b.contact_last_name,
      b.contact_email,
      b.contact_phone,
      b.sell_currency,
      b.pax,
      b.sell_amount_cents,
      COALESCE(inv.total_cents, 0) AS invoice_total_cents,
      COALESCE(inv.paid_cents, 0) AS invoice_paid_cents,
      0 AS schedules_paid_cents
    FROM bookings b
    JOIN booking_allocations ba ON ba.booking_id = b.id
    LEFT JOIN (
      SELECT
        booking_id,
        SUM(total_cents) AS total_cents,
        SUM(paid_cents) AS paid_cents
      FROM invoices
      WHERE status <> 'void'
      GROUP BY booking_id
    ) inv ON inv.booking_id = b.id
    WHERE ba.availability_slot_id = ${slotId}
      AND b.status IN (${activeBookingStatusesForSlotSql()})
      AND ba.status IN ('held', 'confirmed', 'fulfilled')
    ORDER BY b.created_at, b.booking_number
  `,
  )
}

async function loadSlotBookingRowsSchedulesOnly(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<BookingRow[]> {
  return executeRows<BookingRow>(
    db,
    sql`
    SELECT DISTINCT
      b.id,
      b.booking_number,
      b.status,
      b.created_at,
      b.contact_first_name,
      b.contact_last_name,
      b.contact_email,
      b.contact_phone,
      b.sell_currency,
      b.pax,
      b.sell_amount_cents,
      0 AS invoice_total_cents,
      0 AS invoice_paid_cents,
      COALESCE(sch.paid_cents, 0) AS schedules_paid_cents
    FROM bookings b
    JOIN booking_allocations ba ON ba.booking_id = b.id
    LEFT JOIN (
      SELECT
        booking_id,
        SUM(amount_cents) AS paid_cents
      FROM booking_payment_schedules
      WHERE status = 'paid'
      GROUP BY booking_id
    ) sch ON sch.booking_id = b.id
    WHERE ba.availability_slot_id = ${slotId}
      AND b.status IN (${activeBookingStatusesForSlotSql()})
      AND ba.status IN ('held', 'confirmed', 'fulfilled')
    ORDER BY b.created_at, b.booking_number
  `,
  )
}

async function loadSlotBookingRowsBare(
  db: PostgresJsDatabase,
  slotId: string,
): Promise<BookingRow[]> {
  const rows = await executeRows<
    Omit<BookingRow, "invoice_total_cents" | "invoice_paid_cents" | "schedules_paid_cents">
  >(
    db,
    sql`
    SELECT DISTINCT
      b.id,
      b.booking_number,
      b.status,
      b.created_at,
      b.contact_first_name,
      b.contact_last_name,
      b.contact_email,
      b.contact_phone,
      b.sell_currency,
      b.pax,
      b.sell_amount_cents
    FROM bookings b
    JOIN booking_allocations ba ON ba.booking_id = b.id
    WHERE ba.availability_slot_id = ${slotId}
      AND b.status IN (${activeBookingStatusesForSlotSql()})
      AND ba.status IN ('held', 'confirmed', 'fulfilled')
    ORDER BY b.created_at, b.booking_number
  `,
  )
  return rows.map((row) => ({
    ...row,
    invoice_total_cents: 0,
    invoice_paid_cents: 0,
    schedules_paid_cents: 0,
  }))
}

function isUndefinedTableError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: string }).code === "42P01"
  )
}

export async function loadSlotTravelerRows(
  db: PostgresJsDatabase,
  bookingIds: string[],
): Promise<TravelerRow[]> {
  return executeRows<TravelerRow>(
    db,
    sql`
    SELECT
      bt.id,
      bt.booking_id,
      bt.first_name,
      bt.last_name,
      bt.email,
      bt.phone,
      bt.is_primary,
      bt.participant_type,
      bt.traveler_category,
      COALESCE(btd.is_lead_traveler, false) AS is_lead_traveler,
      btd.sharing_group_id,
      btd.room_type_id,
      btd.bed_preference,
      COALESCE(btd.allocations, '{}'::jsonb) AS allocations,
      (btd.accessibility_encrypted IS NOT NULL) AS has_accessibility_needs,
      (btd.dietary_encrypted IS NOT NULL) AS has_dietary_requirements
    FROM booking_travelers bt
    LEFT JOIN booking_traveler_travel_details btd ON btd.traveler_id = bt.id
    WHERE bt.booking_id = ANY(${sqlTextArray(bookingIds)})
    ORDER BY bt.booking_id, bt.is_primary DESC, bt.created_at
  `,
  )
}

export async function loadSlotBookingUnitRows(
  db: PostgresJsDatabase,
  slotId: string,
  bookingIds: string[],
): Promise<BookingUnitRow[]> {
  try {
    return await executeRows<BookingUnitRow>(
      db,
      sql`
      SELECT DISTINCT ON (ba.booking_id)
        ba.booking_id,
        ba.option_id,
        ba.option_unit_id,
        ou.code AS option_unit_code
      FROM booking_allocations ba
      LEFT JOIN option_units ou ON ou.id = ba.option_unit_id
      WHERE ba.booking_id = ANY(${sqlTextArray(bookingIds)})
        AND ba.availability_slot_id = ${slotId}
        AND ba.status IN ('held', 'confirmed', 'fulfilled')
      ORDER BY
        ba.booking_id,
        (ba.option_unit_id IS NULL),
        CASE ba.status
          WHEN 'fulfilled' THEN 0
          WHEN 'confirmed' THEN 1
          WHEN 'held' THEN 2
          ELSE 3
        END,
        ba.updated_at DESC,
        ba.created_at DESC
    `,
    )
  } catch (error) {
    if (!isUndefinedTableError(error)) throw error
  }

  return executeRows<BookingUnitRow>(
    db,
    sql`
    SELECT DISTINCT ON (ba.booking_id)
      ba.booking_id,
      ba.option_id,
      ba.option_unit_id,
      NULL::text AS option_unit_code
    FROM booking_allocations ba
    WHERE ba.booking_id = ANY(${sqlTextArray(bookingIds)})
      AND ba.availability_slot_id = ${slotId}
      AND ba.status IN ('held', 'confirmed', 'fulfilled')
    ORDER BY
      ba.booking_id,
      (ba.option_unit_id IS NULL),
      CASE ba.status
        WHEN 'fulfilled' THEN 0
        WHEN 'confirmed' THEN 1
        WHEN 'held' THEN 2
        ELSE 3
      END,
      ba.updated_at DESC,
      ba.created_at DESC
  `,
  )
}

export function normalizeAllocationMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}

  const out: Record<string, string> = {}
  for (const [key, raw] of Object.entries(value)) {
    if (typeof raw === "string") out[key] = raw
  }
  return out
}

export function serializeSlot(slot: {
  id: string
  productId: string | null
  startsAt: Date
  endsAt: Date | null
}) {
  return {
    id: slot.id,
    productId: slot.productId ?? null,
    startsAt: slot.startsAt ? slot.startsAt.toISOString() : null,
    endsAt: slot.endsAt ? slot.endsAt.toISOString() : null,
  }
}
