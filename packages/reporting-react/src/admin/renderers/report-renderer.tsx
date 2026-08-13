"use client"

import type { ReportResult, ReportWidgetDefinition } from "@voyant-travel/reporting-contracts"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@voyant-travel/ui/components"
import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@voyant-travel/ui/components/chart"
import type { ReactNode } from "react"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts"
import {
  type FormatOptions,
  formatReportValue,
  type ReportFieldValueType,
  toNumber,
} from "./format.js"

type ReportVisualization = ReportWidgetDefinition["visualization"]
type ReportColumn = ReportResult["columns"][number]

const CHART_COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
]

export interface ReportVisualizationViewProps {
  readonly definition: ReportWidgetDefinition
  readonly result: ReportResult
  readonly format?: FormatOptions
}

/**
 * Render a {@link ReportResult} using the widget definition's declared
 * visualization type. Domain-neutral: it reads only the generic
 * columns/rows/valueType contract, never dataset-specific knowledge.
 */
export function ReportVisualizationView({
  definition,
  result,
  format = {},
}: ReportVisualizationViewProps): ReactNode {
  const options = definition.visualization.options ?? {}
  const formatOptions: FormatOptions = {
    ...format,
    currency: readString(options.currency) ?? format.currency,
    minorUnit: readBoolean(options.minorUnit) ?? format.minorUnit,
  }

  if (result.rows.length === 0) {
    return (
      <div className="text-muted-foreground flex h-full min-h-24 items-center justify-center text-center text-sm">
        No data for the selected parameters.
      </div>
    )
  }

  switch (definition.visualization.type) {
    case "kpi":
      return <KpiView result={result} options={options} format={formatOptions} />
    case "table":
      return <TableView result={result} options={options} format={formatOptions} />
    case "line":
      return <SeriesChart kind="line" result={result} options={options} format={formatOptions} />
    case "bar":
      return <SeriesChart kind="bar" result={result} options={options} format={formatOptions} />
    case "pie":
      return <PieView result={result} options={options} format={formatOptions} />
    default:
      return <TableView result={result} options={options} format={formatOptions} />
  }
}

function KpiView({
  result,
  options,
  format,
}: {
  result: ReportResult
  options: ReportVisualization["options"]
  format: FormatOptions
}): ReactNode {
  const valueColumn =
    findColumn(result, readFirstString(options, "valueField", "value")) ??
    firstNumericColumn(result) ??
    result.columns[0]
  if (!valueColumn) return <p className="text-muted-foreground text-sm">No value to display.</p>
  const row = result.rows[0] ?? {}
  const raw = row[valueColumn.id]
  const rowFormat = cellFormat(valueColumn, row, format, readFirstString(options, "currencyField"))
  return (
    <Card size="sm" className="h-full">
      <CardHeader>
        <CardDescription>{readString(options.label) ?? valueColumn.label}</CardDescription>
        <CardTitle className="text-3xl tabular-nums">
          {formatReportValue(raw, valueColumn.valueType, rowFormat)}
        </CardTitle>
      </CardHeader>
    </Card>
  )
}

function TableView({
  result,
  options,
  format,
}: {
  result: ReportResult
  options: ReportVisualization["options"]
  format: FormatOptions
}): ReactNode {
  const currencyField = readFirstString(options, "currencyField")
  return (
    <Table>
      <TableHeader>
        <TableRow>
          {result.columns.map((column) => (
            <TableHead key={column.id}>{column.label}</TableHead>
          ))}
        </TableRow>
      </TableHeader>
      <TableBody>
        {result.rows.map((row, rowIndex) => (
          // Report result rows have no stable identity; the row index is stable
          // within a single immutable result snapshot.
          // biome-ignore lint/suspicious/noArrayIndexKey: intentional — report result rows carry no stable id (owner: reporting)
          <TableRow key={rowIndex}>
            {result.columns.map((column) => (
              <TableCell key={column.id}>
                {formatReportValue(
                  row[column.id],
                  column.valueType,
                  cellFormat(column, row, format, currencyField),
                )}
              </TableCell>
            ))}
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}

function SeriesChart({
  kind,
  result,
  options,
  format,
}: {
  kind: "line" | "bar"
  result: ReportResult
  options: ReportVisualization["options"]
  format: FormatOptions
}): ReactNode {
  const categoryColumn =
    findColumn(result, readFirstString(options, "xField", "x", "categoryField", "category")) ??
    firstCategoryColumn(result) ??
    result.columns[0]
  if (!categoryColumn) return <TableView result={result} options={options} format={format} />

  const requested =
    readStringArray(options.yFields) ??
    optionalArray(readFirstString(options, "yField", "y", "valueField", "value"))
  const seriesColumns = (
    requested
      ? requested
          .map((id) => findColumn(result, id))
          .filter((column): column is ReportColumn => Boolean(column))
      : numericColumns(result).filter((column) => column.id !== categoryColumn.id)
  ).slice(0, CHART_COLORS.length)

  if (seriesColumns.length === 0) {
    return <TableView result={result} options={options} format={format} />
  }

  const seriesDimension = findColumn(result, readFirstString(options, "seriesField", "series"))
  let chartSeriesColumns = seriesColumns
  let data: Record<string, unknown>[]
  if (seriesDimension && seriesColumns.length === 1) {
    const valueColumn = seriesColumns[0]!
    const keysByLabel = new Map<string, string>()
    const pointsByCategory = new Map<string, Record<string, unknown>>()
    for (const row of result.rows) {
      const category = formatReportValue(row[categoryColumn.id], categoryColumn.valueType, format)
      const seriesLabel = formatReportValue(
        row[seriesDimension.id],
        seriesDimension.valueType,
        format,
      )
      let seriesKey = keysByLabel.get(seriesLabel)
      if (!seriesKey) {
        if (keysByLabel.size >= CHART_COLORS.length) continue
        seriesKey = `series${keysByLabel.size + 1}`
        keysByLabel.set(seriesLabel, seriesKey)
      }
      const point = pointsByCategory.get(category) ?? { [categoryColumn.id]: category }
      point[seriesKey] = chartNumber(row[valueColumn.id], valueColumn, format)
      pointsByCategory.set(category, point)
    }
    chartSeriesColumns = [...keysByLabel].map(([label, id]) => ({
      id,
      label,
      valueType: valueColumn.valueType,
    }))
    data = [...pointsByCategory.values()]
  } else {
    data = result.rows.map((row) => {
      const point: Record<string, unknown> = {
        [categoryColumn.id]: formatReportValue(
          row[categoryColumn.id],
          categoryColumn.valueType,
          format,
        ),
      }
      for (const column of chartSeriesColumns) {
        point[column.id] = chartNumber(row[column.id], column, format)
      }
      return point
    })
  }
  if (readBoolean(options.reverseCategoryOrder)) data = [...data].reverse()

  const config: ChartConfig = {}
  chartSeriesColumns.forEach((column, index) => {
    config[column.id] = { label: column.label, color: CHART_COLORS[index % CHART_COLORS.length] }
  })

  return (
    <ChartContainer config={config} className="h-full w-full">
      {kind === "line" ? (
        <LineChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={categoryColumn.id} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {chartSeriesColumns.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {chartSeriesColumns.map((column) => (
            <Line
              key={column.id}
              dataKey={column.id}
              type="monotone"
              stroke={`var(--color-${column.id})`}
              strokeWidth={2}
              dot={false}
            />
          ))}
        </LineChart>
      ) : (
        <BarChart data={data} accessibilityLayer>
          <CartesianGrid vertical={false} />
          <XAxis dataKey={categoryColumn.id} tickLine={false} axisLine={false} tickMargin={8} />
          <YAxis tickLine={false} axisLine={false} width={48} />
          <ChartTooltip content={<ChartTooltipContent />} />
          {chartSeriesColumns.length > 1 ? <ChartLegend content={<ChartLegendContent />} /> : null}
          {chartSeriesColumns.map((column) => (
            <Bar
              key={column.id}
              dataKey={column.id}
              fill={`var(--color-${column.id})`}
              radius={4}
            />
          ))}
        </BarChart>
      )}
    </ChartContainer>
  )
}

function PieView({
  result,
  options,
  format,
}: {
  result: ReportResult
  options: ReportVisualization["options"]
  format: FormatOptions
}): ReactNode {
  const categoryColumn =
    findColumn(result, readFirstString(options, "categoryField", "category")) ??
    firstCategoryColumn(result) ??
    result.columns[0]
  const valueColumn =
    findColumn(result, readFirstString(options, "valueField", "value")) ??
    firstNumericColumn(result)
  if (!categoryColumn || !valueColumn) {
    return <TableView result={result} options={options} format={format} />
  }

  const data = result.rows.map((row, index) => ({
    name: formatReportValue(row[categoryColumn.id], categoryColumn.valueType, format),
    value: chartNumber(row[valueColumn.id], valueColumn, format),
    fill: CHART_COLORS[index % CHART_COLORS.length],
  }))

  const config: ChartConfig = { value: { label: valueColumn.label } }
  for (const point of data) config[point.name] = { label: point.name }

  return (
    <ChartContainer config={config} className="h-full w-full">
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="name" />} />
        <Pie data={data} dataKey="value" nameKey="name" innerRadius={0}>
          {data.map((point) => (
            <Cell key={point.name} fill={point.fill} />
          ))}
        </Pie>
        <ChartLegend content={<ChartLegendContent nameKey="name" />} />
      </PieChart>
    </ChartContainer>
  )
}

/**
 * Presentation options for one cell. The widget's own options win where the
 * author set them; otherwise the column's declaration from its dataset is used,
 * so a custom widget that never opened the inspector still renders money at the
 * right scale and in the currency its own result reports.
 */
function cellFormat(
  column: ReportColumn,
  row: Record<string, unknown>,
  format: FormatOptions,
  optionCurrencyField: string | undefined,
): FormatOptions {
  const currencyField = optionCurrencyField ?? column.currencyField
  return {
    ...format,
    minorUnit: format.minorUnit ?? column.minorUnit,
    currency: readString(currencyField ? row[currencyField] : undefined) ?? format.currency,
  }
}

function findColumn(result: ReportResult, id: string | undefined): ReportColumn | undefined {
  if (!id) return undefined
  return result.columns.find((column) => column.id === id)
}

const NUMERIC_TYPES: ReadonlySet<ReportFieldValueType> = new Set(["integer", "number", "currency"])

function numericColumns(result: ReportResult): ReportColumn[] {
  return result.columns.filter((column) => NUMERIC_TYPES.has(column.valueType))
}

function firstNumericColumn(result: ReportResult): ReportColumn | undefined {
  return numericColumns(result)[0]
}

function firstCategoryColumn(result: ReportResult): ReportColumn | undefined {
  return result.columns.find((column) => !NUMERIC_TYPES.has(column.valueType))
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined
}

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined
  const strings = value.filter((item): item is string => typeof item === "string")
  return strings.length > 0 ? strings : undefined
}

function readBoolean(value: unknown): boolean | undefined {
  return typeof value === "boolean" ? value : undefined
}

function readFirstString(
  options: ReportVisualization["options"],
  ...keys: string[]
): string | undefined {
  for (const key of keys) {
    const value = readString(options[key])
    if (value) return value
  }
  return undefined
}

function optionalArray(value: string | undefined): string[] | undefined {
  return value ? [value] : undefined
}

function chartNumber(value: unknown, column: ReportColumn, format: FormatOptions): number {
  const numeric = toNumber(value) ?? 0
  const minorUnit = format.minorUnit ?? column.minorUnit
  return column.valueType === "currency" && minorUnit ? numeric / 100 : numeric
}
