import type {
  ReportDatasetExecutionInput,
  ReportDatasetField,
  ReportDatasetQueryError,
  ReportParameters,
  ReportQuery,
  ReportResult,
  ReportScalar,
} from "@voyant-travel/reporting-contracts"
import { type SQL, sql } from "drizzle-orm"

/**
 * Compile the public single-dataset AST to parameter-bound SQL over a
 * Finance-owned semantic relation.
 *
 * The compiler is shared because the alternative is not one dataset with a
 * bespoke compiler — it is every dataset with its own copy of the same
 * grouping, aliasing and filter rules, diverging one fix at a time. What a
 * dataset actually owns is its relation, its fields and its own answerability
 * rule; those are the spec below, and nothing else varies.
 *
 * Query text can never address tables or columns directly: a selection resolves
 * through the dataset's declared fields to a SQL fragment the dataset wrote.
 */
export interface FinanceReportRelationSpec {
  datasetId: string
  /** Accepted dataset version; a query pinning any other is refused. */
  version: number
  fields: readonly ReportDatasetField[]
  /** Alias the relation is exposed under, and referenced by `fieldSql`. */
  alias: string
  /** The semantic relation. Takes parameters so a dataset can own its period. */
  relation(parameters: ReportParameters): SQL
  fieldSql: Readonly<Record<string, SQL>>
  /** Fields whose values are currency minor units. */
  moneyFields: ReadonlySet<string>
  /** Dimension carrying each row's ISO currency code, when the query selects it. */
  currencyDimension: string
  /**
   * A dataset's own rule for whether a well-formed query is answerable — e.g.
   * receivables refusing to sum across currencies without grouping by one.
   */
  assertAnswerable?(input: {
    query: ReportQuery
    parameters: ReportParameters
    groups: ReadonlySet<string>
    aggregateQuery: boolean
    moneySelected: boolean
  }): void
  error(message: string): ReportDatasetQueryError
}

interface CompiledSelection {
  id: string
  field?: ReportDatasetField
  expression: SQL
  column: ReportResult["columns"][number]
}

export function compileFinanceReportQuery(
  spec: FinanceReportRelationSpec,
  input: ReportDatasetExecutionInput,
): { statement: SQL; columns: ReportResult["columns"]; rowLimit: number } {
  const { query, parameters } = input
  if (!Number.isInteger(input.maximumRows) || input.maximumRows < 1) {
    throw spec.error("maximumRows must be a positive integer.")
  }
  if (query.dataset.id !== spec.datasetId) {
    throw spec.error(`Unsupported dataset ${JSON.stringify(query.dataset.id)}.`)
  }
  if (query.dataset.version !== undefined && query.dataset.version !== spec.version) {
    throw spec.error(
      `Unsupported ${spec.datasetId} dataset version ${String(query.dataset.version)}.`,
    )
  }

  const definitions = new Map(spec.fields.map((field) => [field.id, field]))
  const requireField = (id: string): ReportDatasetField => {
    const field = definitions.get(id)
    if (!field || !spec.fieldSql[id]) {
      throw spec.error(`Unknown Finance field ${JSON.stringify(id)}.`)
    }
    return field
  }
  const fieldExpression = (id: string): SQL => {
    const expression = spec.fieldSql[id]
    if (!expression) throw spec.error(`Unknown Finance field ${JSON.stringify(id)}.`)
    return expression
  }
  const groupExpression = (
    id: string,
    grain?: ReportQuery["groupBy"][number]["timeGrain"],
  ): SQL => {
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

  const groups = new Map<string, ReportQuery["groupBy"][number]>()
  for (const group of query.groupBy) {
    const field = requireField(group.field)
    if (field.role !== "dimension") {
      throw spec.error(`Cannot group by measure ${JSON.stringify(group.field)}.`)
    }
    if (groups.has(group.field)) {
      throw spec.error(`Duplicate group ${JSON.stringify(group.field)}.`)
    }
    if (group.timeGrain && field.valueType !== "date" && field.valueType !== "datetime") {
      throw spec.error(`Time grain is not valid for ${JSON.stringify(group.field)}.`)
    }
    groups.set(group.field, group)
  }

  // The output column that carries each row's ISO currency code, when the query
  // selects one. Money measures are denominated by it; without it in the result
  // there is no currency to render with.
  const currencySelection = query.select.find(
    (selection) => selection.kind === "field" && selection.field === spec.currencyDimension,
  )
  const currencyField =
    currencySelection?.kind === "field"
      ? (currencySelection.as ?? spec.currencyDimension)
      : undefined

  const aggregateQuery = query.select.some((selection) => selection.kind === "aggregate")
  const selections = query.select.map((selection): CompiledSelection => {
    if (selection.kind === "field") {
      const field = requireField(selection.field)
      if (aggregateQuery && !groups.has(field.id)) {
        throw spec.error(`Selected field ${JSON.stringify(field.id)} must appear in groupBy.`)
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
      throw spec.error(`${spec.datasetId} does not support ${selection.operation}.`)
    }
    const field = selection.field ? requireField(selection.field) : undefined
    if (selection.operation === "sum" && field?.role !== "measure") {
      throw spec.error("sum() requires a Finance measure.")
    }
    if (selection.operation === "countDistinct" && !field) {
      throw spec.error("countDistinct() requires a field.")
    }
    if (field && !field.aggregations.includes(selection.operation)) {
      throw spec.error(`${selection.operation} is not declared for ${JSON.stringify(field.id)}.`)
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
      throw spec.error(`Duplicate selection alias ${JSON.stringify(selection.id)}.`)
    }
    aliases.add(selection.id)
  }

  spec.assertAnswerable?.({
    query,
    parameters,
    groups: new Set(groups.keys()),
    aggregateQuery,
    moneySelected: query.select.some(
      (selection) => selection.field !== undefined && spec.moneyFields.has(selection.field),
    ),
  })

  const filters = query.filters.map((filter) =>
    compileFilter(spec, filter, requireField, fieldExpression, parameters),
  )
  const selectSql = sql.join(
    selections.map(({ expression, id }) => sql`${expression} AS ${sql.identifier(id)}`),
    sql`, `,
  )
  const groupSql = [...groups.values()].map((group) =>
    groupExpression(group.field, group.timeGrain),
  )
  const orderSql = query.orderBy.map((order) => {
    if (!aliases.has(order.by)) {
      throw spec.error(
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
      WITH ${sql.identifier(spec.alias)} AS (${spec.relation(parameters)})
      SELECT ${selectSql}
      FROM ${sql.identifier(spec.alias)}
      ${filters.length ? sql`WHERE ${sql.join(filters, sql` AND `)}` : sql``}
      ${groupSql.length ? sql`GROUP BY ${sql.join(groupSql, sql`, `)}` : sql``}
      ${orderSql.length ? sql`ORDER BY ${sql.join(orderSql, sql`, `)}` : sql``}
      LIMIT ${rowLimit + 1}
    `,
    columns: selections.map(({ column }) => column),
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
function outputLabel(alias: string | undefined, field: ReportDatasetField): string {
  return alias && alias !== field.id ? alias : field.label
}

/**
 * Every money field in these datasets is a `*Cents` measure — there is no
 * major-unit alternative to select — so a currency column is always minor-unit,
 * and is denominated by the currency dimension whenever the query selects it.
 */
function moneyPresentation(
  valueType: ReportDatasetField["valueType"],
  currencyField: string | undefined,
): { minorUnit?: true; currencyField?: string } {
  if (valueType !== "currency") return {}
  return { minorUnit: true, ...(currencyField ? { currencyField } : {}) }
}

function compileFilter(
  spec: FinanceReportRelationSpec,
  filter: ReportQuery["filters"][number],
  requireField: (id: string) => ReportDatasetField,
  fieldExpression: (id: string) => SQL,
  parameters: ReportParameters,
): SQL {
  const field = requireField(filter.field)
  if (field.role !== "dimension") {
    throw spec.error("Filtering measures is not supported.")
  }
  const expression = fieldExpression(field.id)
  if (filter.operator === "isNull") return sql`${expression} IS NULL`
  if (filter.operator === "isNotNull") return sql`${expression} IS NOT NULL`
  const value = requireFilterValue(spec, filter, parameters)
  switch (filter.operator) {
    case "equal":
      return value === null
        ? sql`${expression} IS NULL`
        : sql`${expression} = ${scalar(spec, value)}`
    case "notEqual":
      return value === null
        ? sql`${expression} IS NOT NULL`
        : sql`${expression} <> ${scalar(spec, value)}`
    case "greaterThan":
      return sql`${expression} > ${scalar(spec, value)}`
    case "greaterThanOrEqual":
      return sql`${expression} >= ${scalar(spec, value)}`
    case "lessThan":
      return sql`${expression} < ${scalar(spec, value)}`
    case "lessThanOrEqual":
      return sql`${expression} <= ${scalar(spec, value)}`
    case "contains": {
      if (typeof value !== "string" || field.valueType !== "string") {
        throw spec.error("contains requires a string dimension and value.")
      }
      return sql`${expression} ILIKE ${`%${value}%`}`
    }
    case "in":
    case "notIn": {
      if (!Array.isArray(value) || value.length === 0) {
        throw spec.error(`${filter.operator} requires a non-empty array.`)
      }
      const values = sql.join(
        value.map((entry) => sql`${scalar(spec, entry)}`),
        sql`, `,
      )
      return filter.operator === "in"
        ? sql`${expression} IN (${values})`
        : sql`${expression} NOT IN (${values})`
    }
    case "between": {
      if (!Array.isArray(value) || value.length !== 2) {
        throw spec.error("between requires exactly two values.")
      }
      return sql`${expression} BETWEEN ${scalar(spec, value[0])} AND ${scalar(spec, value[1])}`
    }
    default:
      throw spec.error(`Unsupported filter operator ${filter.operator}.`)
  }
}

function requireFilterValue(
  spec: FinanceReportRelationSpec,
  filter: ReportQuery["filters"][number],
  parameters: ReportParameters,
): ReportScalar | readonly ReportScalar[] {
  if (!filter.value) throw spec.error(`${filter.operator} requires a value.`)
  if (filter.value.kind === "literal") return filter.value.value
  if (!(filter.value.name in parameters)) {
    throw spec.error(`Missing query parameter ${JSON.stringify(filter.value.name)}.`)
  }
  const value = parameters[filter.value.name]
  if (value === undefined) {
    throw spec.error(`Missing query parameter ${JSON.stringify(filter.value.name)}.`)
  }
  return value
}

function scalar(
  spec: FinanceReportRelationSpec,
  value: ReportScalar | readonly ReportScalar[],
): ReportScalar {
  if (Array.isArray(value)) throw spec.error("Expected a scalar value.")
  return value as ReportScalar
}
