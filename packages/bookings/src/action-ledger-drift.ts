import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { type SQL, type SQLWrapper, sql } from "drizzle-orm"
import { bookingTravelerTravelDetails } from "./schema/travel-details.js"
import { bookings, bookingTravelers } from "./schema-core.js"
import { bookingItems } from "./schema-items.js"

const DEFAULT_SAMPLE_LIMIT = 20
const MAX_SAMPLE_LIMIT = 100

const BOOKING_CANCEL_ACTION_NAME = "booking.status.cancel"
const BOOKING_COMPLETE_ACTION_NAME = "booking.status.complete"
const BOOKING_TRAVELER_CREATE_ACTION_NAMES = [
  "booking.traveler.create",
  "booking.traveler_with_travel_details.create",
] as const
const BOOKING_TRAVELER_TRAVEL_DETAILS_ACTION_NAMES = [
  "booking.traveler_with_travel_details.create",
  "booking.traveler_travel_details.update",
] as const
const BOOKING_ITEM_CREATE_ACTION_NAME = "booking.item.create"

export type BookingActionLedgerDriftCheck =
  | "booking_cancelled"
  | "booking_completed"
  | "booking_item"
  | "booking_traveler"
  | "booking_traveler_travel_details"

export interface CheckBookingActionLedgerDriftInput {
  createdAtFrom?: Date | string | null
  sampleLimit?: number | null
}

export interface BookingActionLedgerDriftRow {
  check: BookingActionLedgerDriftCheck
  missingCount: number
  sampleIds: string[]
}

export interface CheckBookingActionLedgerDriftResult {
  ok: boolean
  rows: BookingActionLedgerDriftRow[]
}

interface BookingActionLedgerDriftQueryRow extends Record<string, unknown> {
  check: BookingActionLedgerDriftCheck
  missing_count: number | string
  sample_ids: string[] | null
}

export function buildBookingActionLedgerDriftQueries(
  input: CheckBookingActionLedgerDriftInput = {},
): Record<BookingActionLedgerDriftCheck, SQL<BookingActionLedgerDriftQueryRow>> {
  const sampleLimit = normalizeSampleLimit(input.sampleLimit)

  return {
    booking_cancelled: buildBookingStatusDriftQuery({
      check: "booking_cancelled",
      actionName: BOOKING_CANCEL_ACTION_NAME,
      timestampColumn: bookings.cancelledAt,
      input,
      sampleLimit,
    }),
    booking_completed: buildBookingStatusDriftQuery({
      check: "booking_completed",
      actionName: BOOKING_COMPLETE_ACTION_NAME,
      timestampColumn: bookings.completedAt,
      input,
      sampleLimit,
    }),
    booking_item: sql<BookingActionLedgerDriftQueryRow>`
      SELECT
        'booking_item' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${bookingItems.id} AS candidate_id,
          ${bookingItems.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${bookingItems.createdAt} DESC, ${bookingItems.id} DESC
          ) AS sample_ordinal
        FROM ${bookingItems}
        WHERE 1 = 1
          ${buildCreatedAtCondition(bookingItems.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${BOOKING_ITEM_CREATE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"booking_item"}
              AND ${actionLedgerEntries.targetId} = ${bookingItems.id}
          )
      ) missing
    `,
    booking_traveler: sql<BookingActionLedgerDriftQueryRow>`
      SELECT
        'booking_traveler' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${bookingTravelers.id} AS candidate_id,
          ${bookingTravelers.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${bookingTravelers.createdAt} DESC, ${bookingTravelers.id} DESC
          ) AS sample_ordinal
        FROM ${bookingTravelers}
        WHERE 1 = 1
          ${buildCreatedAtCondition(bookingTravelers.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} IN (${sql.join(
              // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
              BOOKING_TRAVELER_CREATE_ACTION_NAMES.map((actionName) => sql`${actionName}`),
              sql`, `,
            )})
              AND ${actionLedgerEntries.targetType} = ${"booking_traveler"}
              AND ${actionLedgerEntries.targetId} = ${bookingTravelers.id}
          )
      ) missing
    `,
    booking_traveler_travel_details: sql<BookingActionLedgerDriftQueryRow>`
      SELECT
        'booking_traveler_travel_details' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${bookingTravelerTravelDetails.travelerId} AS candidate_id,
          ${bookingTravelerTravelDetails.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${bookingTravelerTravelDetails.createdAt} DESC,
              ${bookingTravelerTravelDetails.travelerId} DESC
          ) AS sample_ordinal
        FROM ${bookingTravelerTravelDetails}
        WHERE 1 = 1
          ${buildCreatedAtCondition(bookingTravelerTravelDetails.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} IN (${sql.join(
              // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
              BOOKING_TRAVELER_TRAVEL_DETAILS_ACTION_NAMES.map((actionName) => sql`${actionName}`),
              sql`, `,
            )})
              AND ${actionLedgerEntries.targetType} = ${"booking_traveler"}
              AND ${actionLedgerEntries.targetId} = ${bookingTravelerTravelDetails.travelerId}
          )
      ) missing
    `,
  }
}

export async function checkBookingActionLedgerDrift(
  db: AnyDrizzleDb,
  input: CheckBookingActionLedgerDriftInput = {},
): Promise<CheckBookingActionLedgerDriftResult> {
  const queries = buildBookingActionLedgerDriftQueries(input)
  const results: unknown[] = await Promise.all([
    db.execute<BookingActionLedgerDriftQueryRow>(queries.booking_cancelled),
    db.execute<BookingActionLedgerDriftQueryRow>(queries.booking_completed),
    db.execute<BookingActionLedgerDriftQueryRow>(queries.booking_item),
    db.execute<BookingActionLedgerDriftQueryRow>(queries.booking_traveler),
    db.execute<BookingActionLedgerDriftQueryRow>(queries.booking_traveler_travel_details),
  ])
  const rows = results
    .flatMap((result: unknown) => extractRows(result))
    .map((row: BookingActionLedgerDriftQueryRow) => normalizeRow(row))

  return {
    ok: rows.every((row) => row.missingCount === 0),
    rows,
  }
}

function buildBookingStatusDriftQuery(input: {
  check: BookingActionLedgerDriftCheck
  actionName: string
  timestampColumn: SQLWrapper
  input: CheckBookingActionLedgerDriftInput
  sampleLimit: number
}) {
  return sql<BookingActionLedgerDriftQueryRow>`
    SELECT
      ${input.check} AS check,
      count(*)::int AS missing_count,
      coalesce(
        array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
          FILTER (WHERE sample_ordinal <= ${input.sampleLimit}),
        ARRAY[]::text[]
      ) AS sample_ids
    FROM (
      SELECT
        ${bookings.id} AS candidate_id,
        ${input.timestampColumn} AS created_at,
        row_number() OVER (
          ORDER BY ${input.timestampColumn} DESC, ${bookings.id} DESC
        ) AS sample_ordinal
      FROM ${bookings}
      WHERE ${input.timestampColumn} IS NOT NULL
        ${buildCreatedAtCondition(input.timestampColumn, input.input.createdAtFrom)}
        AND NOT EXISTS (
          SELECT 1
          FROM ${actionLedgerEntries}
          WHERE ${actionLedgerEntries.actionName} = ${input.actionName}
            AND ${actionLedgerEntries.targetType} = ${"booking"}
            AND ${actionLedgerEntries.targetId} = ${bookings.id}
        )
    ) missing
  `
}

function normalizeSampleLimit(limit: number | null | undefined): number {
  if (!limit) return DEFAULT_SAMPLE_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SAMPLE_LIMIT)
}

function buildCreatedAtCondition(
  column: SQLWrapper,
  value: CheckBookingActionLedgerDriftInput["createdAtFrom"],
) {
  if (!value) return sql``
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error("createdAtFrom must be a valid date")
  }
  // A `sql` interpolation hands the value to the driver as-is, and postgres-js
  // cannot bind a `Date` — the whole check threw as soon as a caller narrowed
  // it by date (voyant#4696). Bind the encoded timestamp instead.
  // agent-quality: raw-sql reviewed -- owner: bookings; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  return sql`AND ${column} >= ${date.toISOString()}::timestamptz`
}

function extractRows(result: unknown): BookingActionLedgerDriftQueryRow[] {
  if (Array.isArray(result)) return result as BookingActionLedgerDriftQueryRow[]
  const maybeRows = (result as { rows?: unknown }).rows
  return Array.isArray(maybeRows) ? (maybeRows as BookingActionLedgerDriftQueryRow[]) : []
}

function normalizeRow(row: BookingActionLedgerDriftQueryRow): BookingActionLedgerDriftRow {
  return {
    check: row.check,
    missingCount: Number(row.missing_count),
    sampleIds: row.sample_ids ?? [],
  }
}

export const __test__ = {
  normalizeRow,
}
