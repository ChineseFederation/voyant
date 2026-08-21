import {
  type ReportDatasetContribution,
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

import { INQUIRY_ACTIVITY_DATASET_ID, INQUIRY_ACTIVITY_FIELDS } from "./reporting-definitions.js"
import { inquiries, inquiryConversions } from "./schema.js"

const REQUIRED_SCOPE = "crm:read"
const DEFAULT_LIMIT = 100
const MAXIMUM_LIMIT = 1_000
type FieldId = (typeof INQUIRY_ACTIVITY_FIELDS)[number]["id"]

const expressions: Record<FieldId, SQL> = {
  createdAt: sql`${inquiries.createdAt}`,
  status: sql`${inquiries.status}`,
  kind: sql`${inquiries.kind}`,
  source: sql`${inquiries.source}`,
  locale: sql`${inquiries.locale}`,
  priority: sql`${inquiries.priority}`,
  ownerId: sql`${inquiries.ownerId}`,
  teamId: sql`${inquiries.teamId}`,
  firstResponseDueAt: sql`${inquiries.firstResponseDueAt}`,
  firstRespondedAt: sql`${inquiries.firstRespondedAt}`,
  qualifiedAt: sql`${inquiries.qualifiedAt}`,
  convertedAt: sql`${inquiries.convertedAt}`,
  closedAt: sql`${inquiries.closedAt}`,
  closeOutcome: sql`${inquiries.closeOutcome}`,
  conversionCount: sql`COALESCE(conversion_totals.conversion_count, 0)`,
  unassignedCount: sql`CASE WHEN ${inquiries.ownerId} IS NULL THEN 1 ELSE 0 END`,
  overdueCount: sql`CASE WHEN ${inquiries.nextActionAt} < now() AND ${inquiries.status} NOT IN ('converted', 'closed') THEN 1 ELSE 0 END`,
  firstResponseMinutes: sql`EXTRACT(EPOCH FROM (${inquiries.firstRespondedAt} - ${inquiries.createdAt})) / 60.0`,
  firstResponseSlaMetCount: sql`CASE WHEN ${inquiries.firstRespondedAt} IS NOT NULL AND ${inquiries.firstResponseDueAt} IS NOT NULL AND ${inquiries.firstRespondedAt} <= ${inquiries.firstResponseDueAt} THEN 1 ELSE 0 END`,
  firstResponseSlaEligibleCount: sql`CASE WHEN ${inquiries.firstResponseDueAt} IS NOT NULL AND (${inquiries.firstRespondedAt} IS NOT NULL OR ${inquiries.firstResponseDueAt} <= now()) THEN 1 ELSE 0 END`,
  qualificationCount: sql`CASE WHEN ${inquiries.qualifiedAt} IS NOT NULL THEN 1 ELSE 0 END`,
  ageDays: sql`EXTRACT(EPOCH FROM (COALESCE(${inquiries.closedAt}, ${inquiries.convertedAt}, now()) - ${inquiries.createdAt})) / 86400.0`,
}

const fields = new Map<FieldId, { definition: ReportDatasetField; expression: SQL }>(
  INQUIRY_ACTIVITY_FIELDS.map((definition) => [
    definition.id,
    {
      definition: {
        ...definition,
        requiredScopes: [...definition.requiredScopes],
        aggregations: [...definition.aggregations],
      },
      expression: expressions[definition.id],
    },
  ]),
)

export const inquiryActivityDataset: ReportDatasetContribution = {
  definition: {
    id: INQUIRY_ACTIVITY_DATASET_ID,
    version: 1,
    label: "Inquiry activity",
    description: "Inquiry operations and authoritative durable conversion facts.",
    grain: "One row per inquiry.",
    requiredScopes: [REQUIRED_SCOPE],
    fields: INQUIRY_ACTIVITY_FIELDS.map((field) => ({
      ...field,
      requiredScopes: [...field.requiredScopes],
      aggregations: [...field.aggregations],
    })),
    defaultLimit: DEFAULT_LIMIT,
    maximumLimit: MAXIMUM_LIMIT,
    defaultDateField: "createdAt",
  },
  async execute(context, input): Promise<ReportResult> {
    requireScope(context.grantedScopes)
    if (context.signal?.aborted) throw abortError()
    const query = reportQuerySchema.parse(input.query)
    const parameters = reportParametersSchema.parse(input.parameters)
    if (
      query.dataset.id !== INQUIRY_ACTIVITY_DATASET_ID ||
      (query.dataset.version !== undefined && query.dataset.version !== 1)
    ) {
      throw new Error(
        `Inquiry activity cannot execute dataset ${JSON.stringify(query.dataset.id)}.`,
      )
    }
    const compiled = compile(query, parameters, input.maximumRows)
    const db = context.db as Pick<PostgresJsDatabase, "execute">
    if (!db || typeof db.execute !== "function")
      throw new TypeError("Inquiry activity reporting requires a PostgreSQL database client.")
    const raw = Array.from(await db.execute(compiled.statement))
    if (context.signal?.aborted) throw abortError()
    return {
      columns: compiled.columns,
      rows: raw
        .slice(0, compiled.limit)
        .map((row) =>
          Object.fromEntries(
            compiled.outputs.map((id, index) => [
              id,
              normalize(
                (row as Record<string, unknown>)[`report_column_${index}`],
                compiled.outputTypes.get(id),
              ),
            ]),
          ),
        ),
      truncated: raw.length > compiled.limit,
      warnings: [],
    }
  },
}

function compile(query: ReportQuery, parameters: ReportParameters, maximumRows: number) {
  if (!Number.isInteger(maximumRows) || maximumRows < 1)
    throw new Error("maximumRows must be a positive integer.")
  const limit = Math.min(maximumRows, query.limit ?? DEFAULT_LIMIT, MAXIMUM_LIMIT)
  const groups = new Map(query.groupBy.map((group) => [group.field, group]))
  if (groups.size !== query.groupBy.length) throw new Error("A field may only be grouped once.")
  const aggregateContext = groups.size > 0 || query.select.some((item) => item.kind === "aggregate")
  const outputs: string[] = []
  const outputTypes = new Map<string, ReportDatasetField["valueType"]>()
  const columns: ReportResult["columns"][number][] = []
  const aliases = new Map<string, SQL>()
  const selections = query.select.map((selection, index) => {
    const output = selection.kind === "field" ? (selection.as ?? selection.field) : selection.as
    if (outputs.includes(output))
      throw new Error(`Duplicate output column ${JSON.stringify(output)}.`)
    outputs.push(output)
    const expression =
      selection.kind === "field"
        ? (() => {
            if (aggregateContext && !groups.has(selection.field)) {
              throw new Error(
                `Selected field ${JSON.stringify(selection.field)} must be included in groupBy when aggregates are used.`,
              )
            }
            return groupedExpression(selection.field, groups.get(selection.field)?.timeGrain)
          })()
        : aggregateExpression(selection)
    aliases.set(output, expression)
    if (selection.kind === "field") aliases.set(selection.field, expression)
    const definition =
      selection.kind === "field"
        ? requireField(selection.field).definition
        : selection.field
          ? requireField(selection.field).definition
          : undefined
    const valueType =
      selection.kind === "aggregate"
        ? aggregateValueType(selection, definition)
        : groups.get(selection.field)?.timeGrain
          ? "date"
          : definition!.valueType
    outputTypes.set(output, valueType)
    columns.push({
      id: output,
      label: selection.kind === "field" ? definition!.label : output,
      valueType,
    })
    return sql`${expression} AS ${sql.raw(`"report_column_${index}"`)}`
  })
  const filters = query.filters.map((filter) => compileFilter(filter, parameters))
  const groupExpressions = query.groupBy.map((group) =>
    groupedExpression(group.field, group.timeGrain),
  )
  const order = query.orderBy.map((item) => {
    const expression = aliases.get(item.by)
    if (!expression) throw new Error(`Order field ${JSON.stringify(item.by)} must be selected.`)
    return sql`${expression} ${sql.raw(item.direction === "descending" ? "DESC" : "ASC")}`
  })
  if (order.length === 0 && !aggregateContext)
    order.push(sql`${inquiries.createdAt} ASC`, sql`${inquiries.id} ASC`)
  return {
    statement: sql`SELECT ${sql.join(selections, sql`, `)} FROM ${inquiries}
      LEFT JOIN (
        SELECT inquiry_id, COUNT(*)::integer AS conversion_count
        FROM ${inquiryConversions}
        GROUP BY inquiry_id
      ) conversion_totals ON conversion_totals.inquiry_id = ${inquiries.id}
      ${filters.length ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``}
      ${groupExpressions.length ? sql`GROUP BY ${sql.join(groupExpressions, sql`, `)}` : sql``}
      ${order.length ? sql`ORDER BY ${sql.join(order, sql`, `)}` : sql``}
      LIMIT ${limit + 1}`,
    columns,
    outputs,
    outputTypes,
    limit,
  }
}

function requireField(id: string) {
  const field = fields.get(id as FieldId)
  if (!field) throw new Error(`Unknown inquiry activity field ${JSON.stringify(id)}.`)
  return field
}

function groupedExpression(id: string, grain: ReportQuery["groupBy"][number]["timeGrain"]): SQL {
  const field = requireField(id)
  if (!grain) return field.expression
  if (field.definition.valueType !== "datetime")
    throw new Error(`Time bucketing is not supported for ${JSON.stringify(id)}.`)
  const literal = {
    day: sql`'day'`,
    week: sql`'week'`,
    month: sql`'month'`,
    quarter: sql`'quarter'`,
    year: sql`'year'`,
  }[grain]
  return sql`to_char(date_trunc(${literal}, ${field.expression} AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`
}

function aggregateExpression(
  selection: Extract<ReportQuery["select"][number], { kind: "aggregate" }>,
): SQL {
  if (!selection.field) {
    if (selection.operation !== "count") throw new Error(`${selection.operation} requires a field.`)
    return sql`COUNT(*)::integer`
  }
  const field = requireField(selection.field)
  if (!field.definition.aggregations.includes(selection.operation as never))
    throw new Error(`${selection.field} does not support ${selection.operation}.`)
  switch (selection.operation) {
    case "count":
      return sql`COUNT(${field.expression})::integer`
    case "countDistinct":
      return sql`COUNT(DISTINCT ${field.expression})::integer`
    case "sum":
      return field.definition.valueType === "integer"
        ? sql`SUM(${field.expression})`
        : sql`SUM(${field.expression})::double precision`
    case "average":
      return sql`AVG(${field.expression})::double precision`
    case "minimum":
      return sql`MIN(${field.expression})`
    case "maximum":
      return sql`MAX(${field.expression})`
  }
}

function aggregateValueType(
  selection: Extract<ReportQuery["select"][number], { kind: "aggregate" }>,
  definition: ReportDatasetField | undefined,
): ReportDatasetField["valueType"] {
  if (selection.operation === "count" || selection.operation === "countDistinct") return "integer"
  if (selection.operation === "average") return "number"
  return definition?.valueType ?? "integer"
}

function compileFilter(filter: ReportQuery["filters"][number], parameters: ReportParameters): SQL {
  const field = requireField(filter.field)
  if (filter.operator === "isNull") return sql`${field.expression} IS NULL`
  if (filter.operator === "isNotNull") return sql`${field.expression} IS NOT NULL`
  if (!filter.value) throw new Error(`${filter.operator} requires a value.`)
  const value =
    filter.value.kind === "parameter"
      ? parameter(parameters, filter.value.name)
      : filter.value.value
  if (filter.operator === "in" || filter.operator === "notIn") {
    if (!Array.isArray(value)) throw new Error(`${filter.operator} requires an array.`)
    const values = value.map((item) => scalar(field.definition, item))
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
    if (!Array.isArray(value) || value.length !== 2) throw new Error("between requires two values.")
    requireOrderedField(field.definition, filter.operator)
    return sql`${field.expression} BETWEEN ${scalar(field.definition, value[0]!)} AND ${scalar(field.definition, value[1]!)}`
  }
  if (Array.isArray(value)) throw new Error(`${filter.operator} requires a scalar.`)
  const valid = scalar(field.definition, value)
  switch (filter.operator) {
    case "equal":
      return sql`${field.expression} = ${valid}`
    case "notEqual":
      return sql`${field.expression} <> ${valid}`
    case "greaterThan":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} > ${valid}`
    case "greaterThanOrEqual":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} >= ${valid}`
    case "lessThan":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} < ${valid}`
    case "lessThanOrEqual":
      requireOrderedField(field.definition, filter.operator)
      return sql`${field.expression} <= ${valid}`
    case "contains":
      if (field.definition.valueType !== "string" || typeof valid !== "string")
        throw new Error("contains is only supported for string fields.")
      return sql`${field.expression} ILIKE ${`%${valid}%`}`
  }
}

function parameter(parameters: ReportParameters, name: string) {
  if (!Object.hasOwn(parameters, name))
    throw new Error(`Missing query parameter ${JSON.stringify(name)}.`)
  return parameters[name]!
}
function scalar(definition: ReportDatasetField, value: ReportScalar): Exclude<ReportScalar, null> {
  if (value === null) throw new Error(`Use isNull for ${definition.id}.`)
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
  if (!valid) throw new Error(`Filter value for ${definition.id} must be ${definition.valueType}.`)
  return value
}
function requireOrderedField(definition: ReportDatasetField, operator: string) {
  if (!["integer", "number", "currency", "date", "datetime"].includes(definition.valueType))
    throw new Error(`${operator} is not supported for ${definition.valueType} fields.`)
}
function normalize(value: unknown, valueType: ReportDatasetField["valueType"] | undefined) {
  if (value instanceof Date) return value.toISOString()
  if (valueType === "integer" && typeof value === "string" && /^-?\d+$/.test(value)) {
    const numeric = Number(value)
    return Number.isSafeInteger(numeric) ? numeric : value
  }
  if (
    (valueType === "number" || valueType === "currency") &&
    typeof value === "string" &&
    Number.isFinite(Number(value))
  ) {
    return Number(value)
  }
  return value
}
function requireScope(scopes: readonly string[]) {
  if (
    !scopes.some(
      (scope) => scope === REQUIRED_SCOPE || scope === "crm:*" || scope === "*" || scope === "*:*",
    )
  )
    throw new Error(`Missing required dataset scope: ${REQUIRED_SCOPE}.`)
}
function abortError() {
  const error = new Error("Inquiry activity report execution was aborted.")
  error.name = "AbortError"
  return error
}
