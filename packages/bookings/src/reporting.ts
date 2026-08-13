import {
  type ReportDatasetContribution,
  type ReportDatasetExecutionContext,
  type ReportDatasetExecutionInput,
  type ReportDatasetField,
  type ReportParameters,
  type ReportQuery,
  type ReportResult,
  type ReportScalar,
  reportParametersSchema,
  reportQuerySchema,
} from "@voyant-travel/reporting-contracts"
import { type SQL, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import {
  BOOKINGS_ACTIVITY_DATASET_FIELDS,
  BOOKINGS_ACTIVITY_DATASET_ID,
} from "./reporting-definitions.js"
import { bookings } from "./schema-core.js"

const REQUIRED_SCOPE = "bookings:read"
const DEFAULT_LIMIT = 100
const MAXIMUM_LIMIT = 1_000

type BookingActivityFieldId =
  | "createdAt"
  | "status"
  | "sourceType"
  | "startDate"
  | "endDate"
  | "pax"
  | "sellCurrency"

type ReportFilter = ReportQuery["filters"][number]
type ReportSelection = ReportQuery["select"][number]
type ReportAggregateOperation = Extract<ReportSelection, { kind: "aggregate" }>["operation"]

interface BookingActivityField {
  definition: ReportDatasetField
  expression: SQL
}

const fieldExpressions: Record<BookingActivityFieldId, SQL> = {
  createdAt: sql`${bookings.createdAt}`,
  status: sql`${bookings.status}`,
  sourceType: sql`${bookings.sourceType}`,
  startDate: sql`${bookings.startDate}`,
  endDate: sql`${bookings.endDate}`,
  pax: sql`${bookings.pax}`,
  sellCurrency: sql`${bookings.sellCurrency}`,
}

const fieldCatalog = new Map<BookingActivityFieldId, BookingActivityField>(
  BOOKINGS_ACTIVITY_DATASET_FIELDS.map(
    (definition): [BookingActivityFieldId, BookingActivityField] => [
      definition.id,
      {
        definition: {
          ...definition,
          requiredScopes: [...definition.requiredScopes],
          aggregations: [...definition.aggregations],
        },
        expression: fieldExpressions[definition.id],
      },
    ],
  ),
)

export const bookingsActivityDataset: ReportDatasetContribution = {
  definition: {
    id: BOOKINGS_ACTIVITY_DATASET_ID,
    version: 1,
    label: "Booking activity",
    description:
      "Booking-owned activity facts for bounded operational reporting. Monetary amounts are intentionally excluded because sell currencies cannot be added without an explicit normalization policy.",
    grain: "One row per booking record in the current deployment.",
    requiredScopes: [REQUIRED_SCOPE],
    fields: [...fieldCatalog.values()].map(({ definition }) => definition),
    defaultLimit: DEFAULT_LIMIT,
    maximumLimit: MAXIMUM_LIMIT,
    defaultDateField: "createdAt",
  },
  execute: executeBookingsActivity,
}

interface CompiledQuery {
  statement: SQL
  columns: ReportResult["columns"]
  outputIds: readonly string[]
  numericOutputIds: ReadonlySet<string>
  rowLimit: number
}

async function executeBookingsActivity(
  context: ReportDatasetExecutionContext,
  input: ReportDatasetExecutionInput,
): Promise<ReportResult> {
  requireReadScope(context.grantedScopes)
  throwIfAborted(context.signal)

  const query = reportQuerySchema.parse(input.query)
  const parameters = reportParametersSchema.parse(input.parameters)
  if (
    query.dataset.id !== BOOKINGS_ACTIVITY_DATASET_ID ||
    (query.dataset.version !== undefined && query.dataset.version !== 1)
  ) {
    throw new Error(
      `Bookings activity cannot execute dataset ${JSON.stringify(query.dataset.id)} version ${String(query.dataset.version ?? "latest")}.`,
    )
  }

  const compiled = compileQuery(query, parameters, input.maximumRows)
  const database = context.db as Pick<PostgresJsDatabase, "execute">
  if (!database || typeof database.execute !== "function") {
    throw new TypeError("Bookings activity reporting requires a PostgreSQL database client.")
  }

  const rawRows = Array.from(await database.execute(compiled.statement))
  throwIfAborted(context.signal)
  const truncated = rawRows.length > compiled.rowLimit
  const rows = rawRows.slice(0, compiled.rowLimit).map((row) =>
    Object.fromEntries(
      compiled.outputIds.map((id, index) => {
        const value = (row as Record<string, unknown>)[`report_column_${index}`]
        return [id, normalizeValue(value, compiled.numericOutputIds.has(id))]
      }),
    ),
  )

  return { columns: compiled.columns, rows, truncated, warnings: [] }
}

function compileQuery(
  query: ReportQuery,
  parameters: ReportParameters,
  requestedMaximumRows: number,
): CompiledQuery {
  if (!Number.isInteger(requestedMaximumRows) || requestedMaximumRows < 1) {
    throw new Error("maximumRows must be a positive integer.")
  }
  const rowLimit = Math.min(requestedMaximumRows, query.limit ?? DEFAULT_LIMIT, MAXIMUM_LIMIT)
  const groups = new Map(query.groupBy.map((group) => [group.field, group]))
  if (groups.size !== query.groupBy.length) throw new Error("A field may only be grouped once.")

  const hasAggregates = query.select.some((selection) => selection.kind === "aggregate")
  const grouped = groups.size > 0
  const outputIds = new Set<string>()
  const selectParts: SQL[] = []
  const selectedExpressions = new Map<string, SQL>()
  const columns: ReportResult["columns"][number][] = []
  const numericOutputIds = new Set<string>()

  for (const [index, selection] of query.select.entries()) {
    const outputId = selection.kind === "field" ? (selection.as ?? selection.field) : selection.as
    if (outputIds.has(outputId))
      throw new Error(`Duplicate output column ${JSON.stringify(outputId)}.`)
    outputIds.add(outputId)

    const compiled = compileSelection(selection, groups, grouped || hasAggregates)
    const alias = sql.raw(`"report_column_${index}"`)
    selectParts.push(sql`${compiled.expression} AS ${alias}`)
    selectedExpressions.set(outputId, compiled.expression)
    if (selection.kind === "field") selectedExpressions.set(selection.field, compiled.expression)
    columns.push({ id: outputId, label: compiled.label, valueType: compiled.valueType })
    if (selection.kind === "aggregate") numericOutputIds.add(outputId)
  }

  const whereParts = query.filters.map((filter) => compileFilter(filter, parameters))
  const groupExpressions = query.groupBy.map((group) =>
    compileGroupExpression(requireField(group.field), group.timeGrain),
  )
  const orderParts = query.orderBy.map((order) => {
    const expression = selectedExpressions.get(order.by)
    if (!expression) {
      throw new Error(
        `Order field ${JSON.stringify(order.by)} must be one of the selected output columns.`,
      )
    }
    return sql`${expression} ${sql.raw(order.direction === "descending" ? "DESC" : "ASC")}`
  })

  if (orderParts.length === 0) {
    if (groupExpressions.length > 0) {
      orderParts.push(...groupExpressions.map((expression) => sql`${expression} ASC`))
    } else if (!hasAggregates) {
      orderParts.push(sql`${bookings.createdAt} ASC`, sql`${bookings.id} ASC`)
    }
  }

  const statement = sql`
    SELECT ${sql.join(selectParts, sql`, `)}
    FROM ${bookings}
    ${whereParts.length > 0 ? sql`WHERE ${sql.join(whereParts, sql` AND `)}` : sql``}
    ${groupExpressions.length > 0 ? sql`GROUP BY ${sql.join(groupExpressions, sql`, `)}` : sql``}
    ${orderParts.length > 0 ? sql`ORDER BY ${sql.join(orderParts, sql`, `)}` : sql``}
    LIMIT ${rowLimit + 1}
  `

  return {
    statement,
    columns,
    outputIds: [...outputIds],
    numericOutputIds,
    rowLimit,
  }
}

/**
 * The header a selection should carry. The query language requires an alias on
 * every aggregate, so an alias that merely restates the field id is the DSL's
 * mandatory output name and the dataset's own label still reads better; an alias
 * that says something else is the author naming the column, and replacing it
 * with a canned field label loses what they asked for.
 */
function outputLabel(alias: string | undefined, fallback: string, fieldId: string): string {
  return alias && alias !== fieldId ? alias : fallback
}

function compileSelection(
  selection: ReportSelection,
  groups: ReadonlyMap<string, ReportQuery["groupBy"][number]>,
  aggregationContext: boolean,
): { expression: SQL; label: string; valueType: ReportDatasetField["valueType"] } {
  if (selection.kind === "field") {
    const field = requireField(selection.field)
    const group = groups.get(selection.field)
    if (aggregationContext && !group) {
      throw new Error(
        `Selected field ${JSON.stringify(selection.field)} must be included in groupBy when aggregates are used.`,
      )
    }
    return {
      expression: compileGroupExpression(field, group?.timeGrain),
      label: outputLabel(selection.as, field.definition.label, field.definition.id),
      valueType: group?.timeGrain ? "date" : field.definition.valueType,
    }
  }

  if (!selection.field) {
    if (selection.operation !== "count") {
      throw new Error(`${selection.operation} requires a field.`)
    }
    return { expression: sql`COUNT(*)::double precision`, label: "Count", valueType: "integer" }
  }

  const field = requireField(selection.field)
  if (!field.definition.aggregations.includes(selection.operation)) {
    throw new Error(
      `Field ${JSON.stringify(selection.field)} does not support ${selection.operation}.`,
    )
  }
  const expression = aggregateExpression(selection.operation, field.expression)
  return {
    expression,
    label: outputLabel(
      selection.as,
      `${aggregationLabel(selection.operation)} ${field.definition.label}`,
      field.definition.id,
    ),
    valueType:
      selection.operation === "count" || selection.operation === "countDistinct"
        ? "integer"
        : selection.operation === "average"
          ? "number"
          : field.definition.valueType,
  }
}

function aggregateExpression(operation: ReportAggregateOperation, field: SQL): SQL {
  switch (operation) {
    case "count":
      return sql`COUNT(${field})::double precision`
    case "countDistinct":
      return sql`COUNT(DISTINCT ${field})::double precision`
    case "sum":
      return sql`SUM(${field})::double precision`
    case "average":
      return sql`AVG(${field})::double precision`
    case "minimum":
      return sql`MIN(${field})`
    case "maximum":
      return sql`MAX(${field})`
  }
}

function compileFilter(filter: ReportFilter, parameters: ReportParameters): SQL {
  const field = requireField(filter.field)
  if (filter.operator === "isNull") return sql`${field.expression} IS NULL`
  if (filter.operator === "isNotNull") return sql`${field.expression} IS NOT NULL`
  if (!filter.value) throw new Error(`${filter.operator} requires a value.`)

  const value =
    filter.value.kind === "parameter"
      ? requireParameter(parameters, filter.value.name)
      : filter.value.value

  if (filter.operator === "in" || filter.operator === "notIn") {
    if (!Array.isArray(value)) throw new Error(`${filter.operator} requires an array value.`)
    const values = value.map((item) => validateScalar(field.definition, item))
    if (values.length === 0) return filter.operator === "in" ? sql`FALSE` : sql`TRUE`
    return filter.operator === "in"
      ? sql`${field.expression} IN (${sql.join(
          values.map((item) => sql`${item}`),
          sql`, `,
        )})`
      : sql`${field.expression} NOT IN (${sql.join(
          values.map((item) => sql`${item}`),
          sql`, `,
        )})`
  }

  if (filter.operator === "between") {
    if (!Array.isArray(value) || value.length !== 2) {
      throw new Error("between requires an array containing exactly two values.")
    }
    const lower = validateScalar(field.definition, value[0]!)
    const upper = validateScalar(field.definition, value[1]!)
    return sql`${field.expression} BETWEEN ${lower} AND ${upper}`
  }

  if (Array.isArray(value)) throw new Error(`${filter.operator} requires a scalar value.`)
  const scalar = validateScalar(field.definition, value)
  switch (filter.operator) {
    case "equal":
      return sql`${field.expression} = ${scalar}`
    case "notEqual":
      return sql`${field.expression} <> ${scalar}`
    case "greaterThan":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} > ${scalar}`
    case "greaterThanOrEqual":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} >= ${scalar}`
    case "lessThan":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} < ${scalar}`
    case "lessThanOrEqual":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} <= ${scalar}`
    case "contains":
      if (field.definition.valueType !== "string" || typeof scalar !== "string") {
        throw new Error("contains is only supported for string fields.")
      }
      return sql`${field.expression} ILIKE ${`%${scalar}%`}`
    default:
      throw new Error(`Unsupported filter operator ${JSON.stringify(filter.operator)}.`)
  }
}

function compileGroupExpression(
  field: BookingActivityField,
  timeGrain: ReportQuery["groupBy"][number]["timeGrain"],
): SQL {
  if (!timeGrain) return field.expression
  if (field.definition.valueType !== "date" && field.definition.valueType !== "datetime") {
    throw new Error(
      `Time bucketing is only supported for date and datetime fields, not ${JSON.stringify(field.definition.id)}.`,
    )
  }
  const utcValue =
    field.definition.valueType === "datetime"
      ? sql`${field.expression} AT TIME ZONE 'UTC'`
      : sql`${field.expression}::timestamp`
  // The grain must be a SQL literal, not a bound parameter: this same expression
  // is emitted in both SELECT and GROUP BY, and Postgres only treats them as the
  // same grouped column when they are byte-identical. A `date_trunc($1, …)`
  // parameter yields distinct placeholders per position, which Postgres rejects
  // with "column must appear in the GROUP BY clause". The value is a validated
  // enum, so a literal switch is safe.
  return sql`to_char(date_trunc(${truncGrainLiteral(timeGrain)}, ${utcValue}), 'YYYY-MM-DD')`
}

/** Map a validated time grain to a raw `date_trunc` field literal (never a bound param). */
function truncGrainLiteral(
  timeGrain: NonNullable<ReportQuery["groupBy"][number]["timeGrain"]>,
): SQL {
  switch (timeGrain) {
    case "day":
      return sql`'day'`
    case "week":
      return sql`'week'`
    case "month":
      return sql`'month'`
    case "quarter":
      return sql`'quarter'`
    case "year":
      return sql`'year'`
    default:
      throw new Error(`Unsupported time grain ${JSON.stringify(timeGrain)}.`)
  }
}

function requireField(fieldId: string): BookingActivityField {
  const field = fieldCatalog.get(fieldId as BookingActivityFieldId)
  if (!field) throw new Error(`Unknown booking activity field ${JSON.stringify(fieldId)}.`)
  return field
}

function requireParameter(parameters: ReportParameters, name: string): ReportParameters[string] {
  if (!Object.hasOwn(parameters, name)) {
    throw new Error(`Missing query parameter ${JSON.stringify(name)}.`)
  }
  return parameters[name]!
}

function validateScalar(definition: ReportDatasetField, value: ReportScalar): ReportScalar {
  if (value === null) {
    throw new Error(`Use isNull or isNotNull when filtering ${JSON.stringify(definition.id)}.`)
  }
  const valid = (() => {
    switch (definition.valueType) {
      case "string":
        return typeof value === "string"
      case "integer":
        return typeof value === "number" && Number.isInteger(value)
      case "number":
      case "currency":
        return typeof value === "number" && Number.isFinite(value)
      case "boolean":
        return typeof value === "boolean"
      case "date":
        return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
      case "datetime":
        return typeof value === "string" && Number.isFinite(Date.parse(value))
      case "json":
        return false
    }
  })()
  if (!valid) {
    throw new Error(
      `Filter value for ${JSON.stringify(definition.id)} must be ${definition.valueType}.`,
    )
  }
  return value
}

function requireOrderedField(definition: ReportDatasetField, operator: string): void {
  if (!["integer", "number", "currency", "date", "datetime"].includes(definition.valueType)) {
    throw new Error(`${operator} is not supported for ${definition.valueType} fields.`)
  }
}

function requireReadScope(grantedScopes: readonly string[]): void {
  if (
    !grantedScopes.some(
      (scope) =>
        scope === REQUIRED_SCOPE || scope === "bookings:*" || scope === "*" || scope === "*:*",
    )
  ) {
    throw new Error(`Missing required dataset scope: ${REQUIRED_SCOPE}.`)
  }
}

function throwIfAborted(signal: AbortSignal | undefined): void {
  if (!signal?.aborted) return
  const error = new Error("Booking activity report execution was aborted.")
  error.name = "AbortError"
  throw error
}

function normalizeValue(value: unknown, numeric: boolean): unknown {
  if (value instanceof Date) return value.toISOString()
  if (numeric && typeof value === "string") {
    const number = Number(value)
    if (Number.isFinite(number)) return number
  }
  return value
}

function aggregationLabel(operation: ReportAggregateOperation): string {
  switch (operation) {
    case "count":
      return "Count of"
    case "countDistinct":
      return "Distinct count of"
    case "sum":
      return "Total"
    case "average":
      return "Average"
    case "minimum":
      return "Minimum"
    case "maximum":
      return "Maximum"
  }
}
