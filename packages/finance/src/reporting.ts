import type {
  ReportDatasetContribution,
  ReportDatasetExecutionInput,
  ReportDatasetField,
  ReportParameters,
  ReportQuery,
  ReportResult,
  ReportScalar,
} from "@voyant-travel/reporting-contracts"
import { ReportDatasetQueryError } from "@voyant-travel/reporting-contracts"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import { type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  FINANCE_RECEIVABLES_DATASET_ID,
  financeReceivablesDatasetDefinition,
} from "./reporting-definitions.js"
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

interface CompiledSelection {
  id: string
  field?: ReportDatasetField
  expression: SQL
  column: ReportResult["columns"][number]
}

/**
 * Compile the public single-dataset AST to parameter-bound SQL over the
 * Finance-owned semantic receivables relation. Only the small set implemented
 * here is accepted; query text can never address tables or columns directly.
 */
export function compileFinanceReceivablesQuery(input: ReportDatasetExecutionInput): {
  statement: SQL
  columns: ReportResult["columns"]
  rowLimit: number
} {
  const { query, parameters } = input
  // Page-level "show in base currency": read money from recording-time base
  // snapshots so every amount is already in one currency (the operator base).
  const baseMode = parameters[REPORT_CURRENCY_PARAM] === BASE_CURRENCY_MODE
  if (!Number.isInteger(input.maximumRows) || input.maximumRows < 1) {
    throw new FinanceReportingQueryError("maximumRows must be a positive integer.")
  }
  if (query.dataset.id !== FINANCE_RECEIVABLES_DATASET_ID) {
    throw new FinanceReportingQueryError(`Unsupported dataset ${JSON.stringify(query.dataset.id)}.`)
  }
  if (query.dataset.version !== undefined && query.dataset.version !== 1) {
    throw new FinanceReportingQueryError(
      `Unsupported receivables dataset version ${query.dataset.version}.`,
    )
  }

  const definitions = new Map(
    financeReceivablesDatasetDefinition.fields.map((field) => [field.id, field]),
  )
  const groups = new Map<string, ReportQuery["groupBy"][number]>()
  for (const group of query.groupBy) {
    const field = requireField(definitions, group.field)
    if (field.role !== "dimension") {
      throw new FinanceReportingQueryError(
        `Cannot group by measure ${JSON.stringify(group.field)}.`,
      )
    }
    if (groups.has(group.field)) {
      throw new FinanceReportingQueryError(`Duplicate group ${JSON.stringify(group.field)}.`)
    }
    if (group.timeGrain && field.valueType !== "date" && field.valueType !== "datetime") {
      throw new FinanceReportingQueryError(
        `Time grain is not valid for ${JSON.stringify(group.field)}.`,
      )
    }
    groups.set(group.field, group)
  }

  // The output column that carries each row's ISO currency code, when the query
  // selects one. Money measures are denominated by it; without it in the result
  // there is no currency to render with.
  const currencySelection = query.select.find(
    (selection) => selection.kind === "field" && selection.field === "currency",
  )
  const currencyField =
    currencySelection?.kind === "field" ? (currencySelection.as ?? "currency") : undefined

  const aggregateQuery = query.select.some((selection) => selection.kind === "aggregate")
  const selections = query.select.map((selection): CompiledSelection => {
    if (selection.kind === "field") {
      const field = requireField(definitions, selection.field)
      if (aggregateQuery && !groups.has(field.id)) {
        throw new FinanceReportingQueryError(
          `Selected field ${JSON.stringify(field.id)} must appear in groupBy.`,
        )
      }
      const id = selection.as ?? field.id
      return {
        id,
        field,
        expression: groupExpression(field.id, groups.get(field.id)?.timeGrain),
        column: {
          id,
          label: outputLabel(selection.as, field),
          valueType: field.valueType,
          ...moneyPresentation(field.valueType, currencyField),
        },
      }
    }

    if (
      selection.operation !== "count" &&
      selection.operation !== "countDistinct" &&
      selection.operation !== "sum"
    ) {
      throw new FinanceReportingQueryError(
        `Finance receivables does not support ${selection.operation}.`,
      )
    }
    const field = selection.field ? requireField(definitions, selection.field) : undefined
    if (selection.operation === "sum" && field?.role !== "measure") {
      throw new FinanceReportingQueryError("sum() requires a Finance measure.")
    }
    if (selection.operation === "countDistinct" && !field) {
      throw new FinanceReportingQueryError("countDistinct() requires a field.")
    }
    if (field && !field.aggregations.includes(selection.operation)) {
      throw new FinanceReportingQueryError(
        `${selection.operation} is not declared for ${JSON.stringify(field.id)}.`,
      )
    }
    const expression =
      selection.operation === "count"
        ? field
          ? sql`count(${fieldExpression(field.id)})::bigint`
          : sql`count(*)::bigint`
        : selection.operation === "countDistinct"
          ? sql`count(DISTINCT ${fieldExpression(field?.id ?? "")})::bigint`
          : sql`coalesce(sum(${fieldExpression(field?.id ?? "")}), 0)::bigint`
    const valueType =
      selection.operation === "count" || selection.operation === "countDistinct"
        ? "integer"
        : (field?.valueType ?? "number")
    return {
      id: selection.as,
      field,
      expression,
      column: {
        id: selection.as,
        label: field ? outputLabel(selection.as, field) : "Count",
        valueType,
        ...moneyPresentation(valueType, currencyField),
      },
    }
  })

  const aliases = new Set<string>()
  for (const selection of selections) {
    if (aliases.has(selection.id)) {
      throw new FinanceReportingQueryError(
        `Duplicate selection alias ${JSON.stringify(selection.id)}.`,
      )
    }
    aliases.add(selection.id)
  }

  const moneySelections = query.select.filter(
    (selection) => selection.field !== undefined && MONEY_FIELDS.has(selection.field),
  )
  const currencyIsExplicit = aggregateQuery
    ? groups.has("currency")
    : query.select.some((selection) => selection.kind === "field" && selection.field === "currency")
  if (
    !baseMode &&
    moneySelections.length > 0 &&
    !currencyIsExplicit &&
    !hasSingleCurrencyFilter(query, parameters)
  ) {
    throw new FinanceReportingQueryError(
      "Currency measures must include or group by currency, or be filtered to exactly one currency.",
    )
  }

  const filters = query.filters.map((filter) => compileFilter(filter, definitions, parameters))
  const selectSql = sql.join(
    selections.map(({ expression, id }) => sql`${expression} AS ${sql.identifier(id)}`),
    sql`, `,
  )
  const groupSql = [...groups.values()].map((group) =>
    groupExpression(group.field, group.timeGrain),
  )
  const orderSql = query.orderBy.map((order) => {
    if (!aliases.has(order.by)) {
      throw new FinanceReportingQueryError(
        `Ordering must reference a selected output; ${JSON.stringify(order.by)} is unavailable.`,
      )
    }
    return sql`${sql.identifier(order.by)} ${
      order.direction === "descending" ? sql`DESC` : sql`ASC`
    }`
  })
  const rowLimit = Math.min(query.limit ?? input.maximumRows, input.maximumRows)

  return {
    statement: sql`
      WITH receivable AS (${baseMode ? baseReceivables : semanticReceivables})
      SELECT ${selectSql}
      FROM receivable
      ${filters.length ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``}
      ${groupSql.length ? sql`GROUP BY ${sql.join(groupSql, sql`, `)}` : sql``}
      ${orderSql.length ? sql`ORDER BY ${sql.join(orderSql, sql`, `)}` : sql``}
      LIMIT ${rowLimit + 1}
    `,
    columns: selections.map(({ column }) => column),
    rowLimit,
  }
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

/**
 * The header a selection should carry. The query language requires an alias on
 * every aggregate, so an alias that merely restates the field id is the DSL's
 * mandatory output name and the dataset's own label still reads better; an alias
 * that says something else is the author naming the column, and replacing it
 * with a canned field label loses what they asked for.
 */
function outputLabel(alias: string | undefined, field: ReportDatasetField): string {
  return alias && alias !== field.id ? alias : field.label
}

/**
 * Every money field in this dataset is a `*Cents` measure in the document
 * currency — there is no major-unit alternative to select — so a currency column
 * is always minor-unit, and is denominated by the currency dimension whenever
 * the query selects it.
 */
function moneyPresentation(
  valueType: ReportDatasetField["valueType"],
  currencyField: string | undefined,
): { minorUnit?: true; currencyField?: string } {
  if (valueType !== "currency") return {}
  return { minorUnit: true, ...(currencyField ? { currencyField } : {}) }
}

function requireField(
  fields: ReadonlyMap<string, ReportDatasetField>,
  id: string,
): ReportDatasetField {
  const field = fields.get(id)
  if (!field || !fieldSql[id]) {
    throw new FinanceReportingQueryError(`Unknown Finance field ${JSON.stringify(id)}.`)
  }
  return field
}

function fieldExpression(id: string): SQL {
  const expression = fieldSql[id]
  if (!expression)
    throw new FinanceReportingQueryError(`Unknown Finance field ${JSON.stringify(id)}.`)
  return expression
}

function groupExpression(id: string, grain?: ReportQuery["groupBy"][number]["timeGrain"]): SQL {
  const expression = fieldExpression(id)
  if (!grain) return expression
  switch (grain) {
    case "day":
      return sql`date_trunc('day', ${expression}::timestamp)::date`
    case "week":
      return sql`date_trunc('week', ${expression}::timestamp)::date`
    case "month":
      return sql`date_trunc('month', ${expression}::timestamp)::date`
    case "quarter":
      return sql`date_trunc('quarter', ${expression}::timestamp)::date`
    case "year":
      return sql`date_trunc('year', ${expression}::timestamp)::date`
  }
}

function compileFilter(
  filter: ReportQuery["filters"][number],
  fields: ReadonlyMap<string, ReportDatasetField>,
  parameters: ReportParameters,
): SQL {
  const field = requireField(fields, filter.field)
  if (field.role !== "dimension") {
    throw new FinanceReportingQueryError(`Filtering measures is not supported.`)
  }
  const expression = fieldExpression(field.id)
  if (filter.operator === "isNull") return sql`${expression} IS NULL`
  if (filter.operator === "isNotNull") return sql`${expression} IS NOT NULL`
  const value = requireFilterValue(filter, parameters)
  switch (filter.operator) {
    case "equal":
      return value === null ? sql`${expression} IS NULL` : sql`${expression} = ${scalar(value)}`
    case "notEqual":
      return value === null
        ? sql`${expression} IS NOT NULL`
        : sql`${expression} <> ${scalar(value)}`
    case "greaterThan":
      return sql`${expression} > ${scalar(value)}`
    case "greaterThanOrEqual":
      return sql`${expression} >= ${scalar(value)}`
    case "lessThan":
      return sql`${expression} < ${scalar(value)}`
    case "lessThanOrEqual":
      return sql`${expression} <= ${scalar(value)}`
    case "contains": {
      if (typeof value !== "string" || field.valueType !== "string") {
        throw new FinanceReportingQueryError("contains requires a string dimension and value.")
      }
      return sql`${expression} ILIKE ${`%${value}%`}`
    }
    case "in":
    case "notIn": {
      if (!Array.isArray(value) || value.length === 0) {
        throw new FinanceReportingQueryError(`${filter.operator} requires a non-empty array.`)
      }
      const values = sql.join(
        value.map((entry) => sql`${scalar(entry)}`),
        sql`, `,
      )
      return filter.operator === "in"
        ? sql`${expression} IN (${values})`
        : sql`${expression} NOT IN (${values})`
    }
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) {
        throw new FinanceReportingQueryError("between requires exactly two values.")
      }
      return sql`${expression} BETWEEN ${scalar(value[0])} AND ${scalar(value[1])}`
    }
    default:
      throw new FinanceReportingQueryError(`Unsupported filter operator ${filter.operator}.`)
  }
}

function requireFilterValue(
  filter: ReportQuery["filters"][number],
  parameters: ReportParameters,
): ReportScalar | readonly ReportScalar[] {
  if (!filter.value) throw new FinanceReportingQueryError(`${filter.operator} requires a value.`)
  if (filter.value.kind === "literal") return filter.value.value
  if (!(filter.value.name in parameters)) {
    throw new FinanceReportingQueryError(
      `Missing query parameter ${JSON.stringify(filter.value.name)}.`,
    )
  }
  const value = parameters[filter.value.name]
  if (value === undefined) {
    throw new FinanceReportingQueryError(
      `Missing query parameter ${JSON.stringify(filter.value.name)}.`,
    )
  }
  return value
}

function scalar(value: ReportScalar | readonly ReportScalar[]): ReportScalar {
  if (Array.isArray(value)) throw new FinanceReportingQueryError("Expected a scalar value.")
  return value as ReportScalar
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
