import type {
  ReportDatasetContribution,
  ReportDatasetExecutionInput,
  ReportParameters,
  ReportQuery,
  ReportResult,
} from "@voyant-travel/reporting-contracts"
import { ReportDatasetQueryError } from "@voyant-travel/reporting-contracts"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import { type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  FINANCE_RECEIVABLES_DATASET_ID,
  financeReceivablesDatasetDefinition,
} from "./reporting-definitions.js"
import {
  compileFinanceReportQuery,
  type FinanceReportRelationSpec,
} from "./reporting-query-compiler.js"
import { executeBoundaryRows } from "./service-boundary-sql.js"

const MONEY_FIELDS = new Set([
  "grossIssuedCents",
  "creditedCents",
  "netIssuedCents",
  "settledCents",
  "refundedCents",
  "outstandingBalanceCents",
])

const fieldSql: Readonly<Record<string, SQL>> = {
  issueDate: sql`receivable."issueDate"`,
  dueDate: sql`receivable."dueDate"`,
  status: sql`receivable.status`,
  currency: sql`receivable.currency`,
  grossIssuedCents: sql`receivable."grossIssuedCents"`,
  creditedCents: sql`receivable."creditedCents"`,
  netIssuedCents: sql`receivable."netIssuedCents"`,
  settledCents: sql`receivable."settledCents"`,
  refundedCents: sql`receivable."refundedCents"`,
  outstandingBalanceCents: sql`receivable."outstandingBalanceCents"`,
}

const semanticReceivables = sql`
  SELECT
    invoice.issue_date AS "issueDate",
    invoice.due_date AS "dueDate",
    invoice.status::text AS status,
    invoice.currency,
    invoice.total_cents::bigint AS "grossIssuedCents",
    credit_totals.credited_cents::bigint AS "creditedCents",
    greatest(invoice.total_cents::bigint - credit_totals.credited_cents, 0) AS "netIssuedCents",
    payment_totals.settled_cents::bigint AS "settledCents",
    payment_totals.refunded_cents::bigint AS "refundedCents",
    greatest(
      invoice.total_cents::bigint
        - credit_totals.credited_cents
        - payment_totals.settled_cents,
      0
    ) AS "outstandingBalanceCents"
  FROM invoices invoice
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(
      CASE
        WHEN credit.currency = invoice.currency THEN credit.amount_cents
        WHEN credit.base_currency = invoice.currency THEN coalesce(credit.base_amount_cents, 0)
        ELSE 0
      END
    ), 0)::bigint AS credited_cents
    FROM credit_notes credit
    WHERE credit.invoice_id = invoice.id
      AND credit.status IN ('issued', 'applied')
  ) credit_totals ON true
  LEFT JOIN LATERAL (
    SELECT
      coalesce(sum(CASE WHEN payment.status = 'completed' THEN
        CASE
          WHEN payment.currency = invoice.currency THEN payment.amount_cents
          WHEN payment.base_currency = invoice.currency THEN coalesce(payment.base_amount_cents, 0)
          ELSE 0
        END
      ELSE 0 END), 0)::bigint AS settled_cents,
      coalesce(sum(CASE WHEN payment.status = 'refunded' THEN
        CASE
          WHEN payment.currency = invoice.currency THEN payment.amount_cents
          WHEN payment.base_currency = invoice.currency THEN coalesce(payment.base_amount_cents, 0)
          ELSE 0
        END
      ELSE 0 END), 0)::bigint AS refunded_cents
    FROM payments payment
    WHERE payment.invoice_id = invoice.id
  ) payment_totals ON true
  WHERE invoice.invoice_type = 'invoice'
    AND invoice.status IN ('issued', 'partially_paid', 'paid', 'overdue')
`

/** Reserved report parameter that switches money measures to the operator base currency. */
const REPORT_CURRENCY_PARAM = "reportCurrency"
const BASE_CURRENCY_MODE = "base"

/**
 * Base-currency variant of {@link semanticReceivables}. Every monetary figure is
 * read from the record's persisted base-currency snapshot (`base_*_cents`), which
 * was converted at the moment the record was created using that day's FX rate set
 * — so aggregating across documents is exact and recording-time accurate. Records
 * without an FX snapshot (base currency/amount unset) are excluded rather than
 * silently counted at parity.
 */
const baseReceivables = sql`
  SELECT
    invoice.issue_date AS "issueDate",
    invoice.due_date AS "dueDate",
    invoice.status::text AS status,
    invoice.base_currency AS currency,
    invoice.base_total_cents::bigint AS "grossIssuedCents",
    credit_totals.credited_cents::bigint AS "creditedCents",
    greatest(invoice.base_total_cents::bigint - credit_totals.credited_cents, 0) AS "netIssuedCents",
    payment_totals.settled_cents::bigint AS "settledCents",
    payment_totals.refunded_cents::bigint AS "refundedCents",
    greatest(
      invoice.base_total_cents::bigint
        - credit_totals.credited_cents
        - payment_totals.settled_cents,
      0
    ) AS "outstandingBalanceCents"
  FROM invoices invoice
  LEFT JOIN LATERAL (
    SELECT coalesce(sum(credit.base_amount_cents), 0)::bigint AS credited_cents
    FROM credit_notes credit
    WHERE credit.invoice_id = invoice.id
      AND credit.status IN ('issued', 'applied')
      AND credit.base_amount_cents IS NOT NULL
  ) credit_totals ON true
  LEFT JOIN LATERAL (
    SELECT
      coalesce(
        sum(
          CASE WHEN payment.status = 'completed' THEN payment.base_amount_cents ELSE 0 END
        ),
        0
      )::bigint AS settled_cents,
      coalesce(
        sum(
          CASE WHEN payment.status = 'refunded' THEN payment.base_amount_cents ELSE 0 END
        ),
        0
      )::bigint AS refunded_cents
    FROM payments payment
    WHERE payment.invoice_id = invoice.id
      AND payment.base_amount_cents IS NOT NULL
  ) payment_totals ON true
  WHERE invoice.invoice_type = 'invoice'
    AND invoice.status IN ('issued', 'partially_paid', 'paid', 'overdue')
    AND invoice.base_currency IS NOT NULL
    AND invoice.base_total_cents IS NOT NULL
`

/** A query shape outside Finance's deliberately small reporting surface. */
export class FinanceReportingQueryError extends ReportDatasetQueryError {
  constructor(message: string) {
    super(message)
    this.name = "FinanceReportingQueryError"
  }
}

/** The receivables relation, as a spec the shared compiler can execute. */
const receivablesSpec: FinanceReportRelationSpec = {
  datasetId: FINANCE_RECEIVABLES_DATASET_ID,
  version: 1,
  fields: financeReceivablesDatasetDefinition.fields,
  alias: "receivable",
  // Page-level "show in base currency": read money from recording-time base
  // snapshots so every amount is already in one currency (the operator base).
  relation: (parameters) =>
    parameters[REPORT_CURRENCY_PARAM] === BASE_CURRENCY_MODE
      ? baseReceivables
      : semanticReceivables,
  fieldSql,
  moneyFields: MONEY_FIELDS,
  currencyDimension: "currency",
  assertAnswerable: ({ query, parameters, groups, aggregateQuery, moneySelected }) => {
    if (parameters[REPORT_CURRENCY_PARAM] === BASE_CURRENCY_MODE) return
    const currencyIsExplicit = aggregateQuery
      ? groups.has("currency")
      : query.select.some(
          (selection) => selection.kind === "field" && selection.field === "currency",
        )
    if (moneySelected && !currencyIsExplicit && !hasSingleCurrencyFilter(query, parameters)) {
      throw new FinanceReportingQueryError(
        "Currency measures must include or group by currency, or be filtered to exactly one currency.",
      )
    }
  },
  error: (message) => new FinanceReportingQueryError(message),
}

/**
 * Compile the public single-dataset AST to parameter-bound SQL over the
 * Finance-owned semantic receivables relation.
 */
export function compileFinanceReceivablesQuery(input: ReportDatasetExecutionInput): {
  statement: SQL
  columns: ReportResult["columns"]
  rowLimit: number
} {
  return compileFinanceReportQuery(receivablesSpec, input)
}

export const financeReceivablesDataset: ReportDatasetContribution = {
  definition: financeReceivablesDatasetDefinition,
  async execute(context, input) {
    if (
      !hasApiKeyPermission(permissionStringsToPermissions(context.grantedScopes), "finance", "read")
    ) {
      throw new FinanceReportingQueryError("finance:read is required to query receivables.")
    }
    if (context.signal?.aborted) throw abortReason(context.signal)
    const compiled = compileFinanceReceivablesQuery(input)
    const rows = await executeBoundaryRows<Record<string, unknown>>(
      context.db as PostgresJsDatabase,
      compiled.statement,
    )
    if (context.signal?.aborted) throw abortReason(context.signal)
    const truncated = rows.length > compiled.rowLimit
    return {
      columns: compiled.columns,
      rows: rows.slice(0, compiled.rowLimit).map((row) => normalizeRow(row, compiled.columns)),
      truncated,
      warnings: [],
    }
  },
}

function hasSingleCurrencyFilter(query: ReportQuery, parameters: ReportParameters): boolean {
  return query.filters.some((filter) => {
    if (filter.field !== "currency" || !filter.value) return false
    const value =
      filter.value.kind === "literal" ? filter.value.value : parameters[filter.value.name]
    if (filter.operator === "equal") return typeof value === "string" && value.length > 0
    return (
      filter.operator === "in" &&
      Array.isArray(value) &&
      value.length === 1 &&
      typeof value[0] === "string"
    )
  })
}

function normalizeRow(
  row: Record<string, unknown>,
  columns: ReportResult["columns"],
): Record<string, unknown> {
  return Object.fromEntries(
    columns.map((column) => {
      const value = row[column.id]
      if (column.valueType === "date" && value instanceof Date) {
        return [column.id, value.toISOString().slice(0, 10)]
      }
      if (
        (column.valueType === "integer" ||
          column.valueType === "number" ||
          column.valueType === "currency") &&
        typeof value === "string"
      ) {
        const numeric = Number(value)
        if (
          !Number.isFinite(numeric) ||
          ((column.valueType === "integer" || column.valueType === "currency") &&
            !Number.isSafeInteger(numeric))
        ) {
          throw new FinanceReportingQueryError(
            `Result ${JSON.stringify(column.id)} is outside the supported numeric range.`,
          )
        }
        return [column.id, numeric]
      }
      return [column.id, value]
    }),
  )
}

function abortReason(signal: AbortSignal): unknown {
  return signal.reason ?? new Error("Finance report execution was aborted.")
}
