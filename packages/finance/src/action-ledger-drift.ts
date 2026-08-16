import { actionLedgerEntries } from "@voyant-travel/action-ledger/schema"
import type { AnyDrizzleDb } from "@voyant-travel/db"
import { type SQL, type SQLWrapper, sql } from "drizzle-orm"

import { invoices, paymentSessions, payments } from "./schema.js"

const DEFAULT_SAMPLE_LIMIT = 20
const MAX_SAMPLE_LIMIT = 100

const INVOICE_ISSUE_ACTION_NAME = "finance.invoice.issue_from_booking"
const PAYMENT_RECORD_ACTION_NAME = "finance.payment.record"
const PAYMENT_SESSION_ACTION_NAMES = [
  "finance.payment_session.create",
  "finance.payment_session.complete",
  "finance.payment_session.update",
  "finance.payment_session.requires_redirect",
  "finance.payment_session.fail",
  "finance.payment_session.cancel",
  "finance.payment_session.expire",
] as const

export type FinanceActionLedgerDriftCheck = "invoice" | "payment" | "payment_session"

export interface CheckFinanceActionLedgerDriftInput {
  createdAtFrom?: Date | string | null
  sampleLimit?: number | null
}

export interface FinanceActionLedgerDriftRow {
  check: FinanceActionLedgerDriftCheck
  missingCount: number
  sampleIds: string[]
}

export interface CheckFinanceActionLedgerDriftResult {
  ok: boolean
  rows: FinanceActionLedgerDriftRow[]
}

interface FinanceActionLedgerDriftQueryRow extends Record<string, unknown> {
  check: FinanceActionLedgerDriftCheck
  missing_count: number | string
  sample_ids: string[] | null
}

export function buildFinanceActionLedgerDriftQueries(
  input: CheckFinanceActionLedgerDriftInput = {},
): Record<FinanceActionLedgerDriftCheck, SQL<FinanceActionLedgerDriftQueryRow>> {
  const sampleLimit = normalizeSampleLimit(input.sampleLimit)

  return {
    invoice: sql<FinanceActionLedgerDriftQueryRow>`
      SELECT
        'invoice' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${invoices.id} AS candidate_id,
          ${invoices.createdAt} AS created_at,
          row_number() OVER (ORDER BY ${invoices.createdAt} DESC, ${invoices.id} DESC) AS sample_ordinal
        FROM ${invoices}
        WHERE ${invoices.status} <> ${"draft"}
          ${buildCreatedAtCondition(invoices.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${INVOICE_ISSUE_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"booking"}
              AND ${actionLedgerEntries.targetId} = ${invoices.bookingId}
          )
      ) missing
    `,
    payment: sql<FinanceActionLedgerDriftQueryRow>`
      SELECT
        'payment' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${payments.id} AS candidate_id,
          ${payments.createdAt} AS created_at,
          row_number() OVER (ORDER BY ${payments.createdAt} DESC, ${payments.id} DESC) AS sample_ordinal
        FROM ${payments}
        INNER JOIN ${invoices} ON ${invoices.id} = ${payments.invoiceId}
        WHERE 1 = 1
          ${buildCreatedAtCondition(payments.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} = ${PAYMENT_RECORD_ACTION_NAME}
              AND ${actionLedgerEntries.targetType} = ${"booking"}
              AND ${actionLedgerEntries.targetId} = ${invoices.bookingId}
          )
      ) missing
    `,
    payment_session: sql<FinanceActionLedgerDriftQueryRow>`
      SELECT
        'payment_session' AS check,
        count(*)::int AS missing_count,
        coalesce(
          array_agg(candidate_id ORDER BY created_at DESC, candidate_id DESC)
            FILTER (WHERE sample_ordinal <= ${sampleLimit}),
          ARRAY[]::text[]
        ) AS sample_ids
      FROM (
        SELECT
          ${paymentSessions.id} AS candidate_id,
          ${paymentSessions.createdAt} AS created_at,
          row_number() OVER (
            ORDER BY ${paymentSessions.createdAt} DESC, ${paymentSessions.id} DESC
          ) AS sample_ordinal
        FROM ${paymentSessions}
        WHERE 1 = 1
          ${buildCreatedAtCondition(paymentSessions.createdAt, input.createdAtFrom)}
          AND NOT EXISTS (
            SELECT 1
            FROM ${actionLedgerEntries}
            WHERE ${actionLedgerEntries.actionName} IN (${sql.join(
              // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
              PAYMENT_SESSION_ACTION_NAMES.map((actionName) => sql`${actionName}`),
              sql`, `,
            )})
              AND ${actionLedgerEntries.targetType} = CASE
                WHEN ${paymentSessions.bookingId} IS NOT NULL THEN ${"booking"}
                WHEN ${paymentSessions.invoiceId} IS NOT NULL THEN ${"invoice"}
                WHEN ${paymentSessions.orderId} IS NOT NULL THEN ${"order"}
                WHEN ${paymentSessions.targetId} IS NOT NULL
                  AND ${paymentSessions.targetType} <> ${"other"}
                  THEN ${paymentSessions.targetType}
                ELSE ${"payment_session"}
              END
              AND ${actionLedgerEntries.targetId} = CASE
                WHEN ${paymentSessions.bookingId} IS NOT NULL THEN ${paymentSessions.bookingId}
                WHEN ${paymentSessions.invoiceId} IS NOT NULL THEN ${paymentSessions.invoiceId}
                WHEN ${paymentSessions.orderId} IS NOT NULL THEN ${paymentSessions.orderId}
                WHEN ${paymentSessions.targetId} IS NOT NULL
                  AND ${paymentSessions.targetType} <> ${"other"}
                  THEN ${paymentSessions.targetId}
                ELSE ${paymentSessions.id}
              END
          )
      ) missing
    `,
  }
}

export async function checkFinanceActionLedgerDrift(
  db: AnyDrizzleDb,
  input: CheckFinanceActionLedgerDriftInput = {},
): Promise<CheckFinanceActionLedgerDriftResult> {
  const queries = buildFinanceActionLedgerDriftQueries(input)
  const results: unknown[] = await Promise.all([
    db.execute<FinanceActionLedgerDriftQueryRow>(queries.invoice),
    db.execute<FinanceActionLedgerDriftQueryRow>(queries.payment),
    db.execute<FinanceActionLedgerDriftQueryRow>(queries.payment_session),
  ])
  const rows = results
    .flatMap((result: unknown) => extractRows(result))
    .map((row: FinanceActionLedgerDriftQueryRow) => normalizeRow(row))

  return {
    ok: rows.every((row) => row.missingCount === 0),
    rows,
  }
}

function normalizeSampleLimit(limit: number | null | undefined): number {
  if (!limit) return DEFAULT_SAMPLE_LIMIT
  return Math.min(Math.max(Math.trunc(limit), 1), MAX_SAMPLE_LIMIT)
}

function buildCreatedAtCondition(
  column: SQLWrapper,
  value: CheckFinanceActionLedgerDriftInput["createdAtFrom"],
) {
  if (!value) return sql``
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) {
    throw new Error("createdAtFrom must be a valid date")
  }
  // A `sql` interpolation hands the value to the driver as-is, and postgres-js
  // cannot bind a `Date` — the whole check threw as soon as a caller narrowed
  // it by date (voyant#4696). Bind the encoded timestamp instead.
  // agent-quality: raw-sql reviewed -- owner: finance; dynamic SQL interpolation uses Drizzle parameter binding or vetted SQL identifiers.
  return sql`AND ${column} >= ${date.toISOString()}::timestamptz`
}

function extractRows(result: unknown): FinanceActionLedgerDriftQueryRow[] {
  if (Array.isArray(result)) return result as FinanceActionLedgerDriftQueryRow[]
  const maybeRows = (result as { rows?: unknown }).rows
  return Array.isArray(maybeRows) ? (maybeRows as FinanceActionLedgerDriftQueryRow[]) : []
}

function normalizeRow(row: FinanceActionLedgerDriftQueryRow): FinanceActionLedgerDriftRow {
  return {
    check: row.check,
    missingCount: Number(row.missing_count),
    sampleIds: row.sample_ids ?? [],
  }
}

export const __test__ = {
  normalizeRow,
}
