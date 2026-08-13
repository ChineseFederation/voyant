import { z } from "zod"

// Graph entity ids commonly include scoped package names and a `#facet.entity` suffix.
const identifierPattern = /^[A-Za-z0-9@][A-Za-z0-9._/@#-]*$/

export const reportingIdentifierSchema = z.string().trim().min(1).max(160).regex(identifierPattern)
export const reportingVersionSchema = z.number().int().positive()
export const reportingScopeSchema = z.string().trim().min(3).max(160)

export const reportScalarSchema = z.union([z.string(), z.number().finite(), z.boolean(), z.null()])
export type ReportScalar = z.infer<typeof reportScalarSchema>

export const reportParameterValueSchema = z.union([
  reportScalarSchema,
  z.array(reportScalarSchema).max(500),
])
export const reportParametersSchema = z.record(z.string(), reportParameterValueSchema)
export type ReportParameters = z.infer<typeof reportParametersSchema>

export const reportFieldValueTypeSchema = z.enum([
  "string",
  "integer",
  "number",
  "boolean",
  "date",
  "datetime",
  "currency",
  "json",
])
export const reportFieldSensitivitySchema = z.enum(["public", "internal", "pii", "sensitive"])
export const reportAggregationSchema = z.enum([
  "count",
  "countDistinct",
  "sum",
  "average",
  "minimum",
  "maximum",
])

export const reportDatasetFieldSchema = z
  .object({
    id: reportingIdentifierSchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1_000).optional(),
    role: z.enum(["dimension", "measure"]),
    valueType: reportFieldValueTypeSchema,
    sensitivity: reportFieldSensitivitySchema.default("internal"),
    requiredScopes: z.array(reportingScopeSchema).max(20).default([]),
    aggregations: z.array(reportAggregationSchema).max(6).default([]),
  })
  .strict()

export const reportDatasetDefinitionSchema = z
  .object({
    id: reportingIdentifierSchema,
    version: reportingVersionSchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).optional(),
    grain: z.string().trim().min(1).max(300),
    requiredScopes: z.array(reportingScopeSchema).max(20).default([]),
    fields: z.array(reportDatasetFieldSchema).min(1).max(250),
    defaultLimit: z.number().int().positive().max(1_000).default(100),
    maximumLimit: z.number().int().positive().max(5_000).default(1_000),
    // The date/datetime field a page-level date range filters on. When set, the
    // reporting runtime injects `>= dateFrom` / `<= dateTo` on this field from the
    // reserved `dateFrom`/`dateTo` report parameters — applying uniformly to every
    // widget (preset and custom) without editing individual queries.
    defaultDateField: reportingIdentifierSchema.optional(),
  })
  .strict()
  .superRefine((dataset, context) => {
    const ids = new Set<string>()
    for (const [index, field] of dataset.fields.entries()) {
      if (ids.has(field.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate dataset field ${JSON.stringify(field.id)}.`,
          path: ["fields", index, "id"],
        })
      }
      ids.add(field.id)
    }
    if (dataset.defaultLimit > dataset.maximumLimit) {
      context.addIssue({
        code: "custom",
        message: "defaultLimit cannot exceed maximumLimit.",
        path: ["defaultLimit"],
      })
    }
  })

export type ReportDatasetDefinition = z.infer<typeof reportDatasetDefinitionSchema>
export type ReportDatasetField = z.infer<typeof reportDatasetFieldSchema>

export const reportValueReferenceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("literal"), value: reportParameterValueSchema }).strict(),
  z.object({ kind: z.literal("parameter"), name: reportingIdentifierSchema }).strict(),
])

export const reportFilterSchema = z
  .object({
    field: reportingIdentifierSchema,
    operator: z.enum([
      "equal",
      "notEqual",
      "in",
      "notIn",
      "greaterThan",
      "greaterThanOrEqual",
      "lessThan",
      "lessThanOrEqual",
      "between",
      "contains",
      "isNull",
      "isNotNull",
    ]),
    value: reportValueReferenceSchema.optional(),
  })
  .strict()

export const reportSelectionSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("field"),
      field: reportingIdentifierSchema,
      as: reportingIdentifierSchema.optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal("aggregate"),
      operation: reportAggregationSchema,
      field: reportingIdentifierSchema.optional(),
      as: reportingIdentifierSchema,
    })
    .strict(),
])

export const reportGroupSchema = z
  .object({
    field: reportingIdentifierSchema,
    timeGrain: z.enum(["day", "week", "month", "quarter", "year"]).optional(),
  })
  .strict()

export const reportOrderSchema = z
  .object({
    by: reportingIdentifierSchema,
    direction: z.enum(["ascending", "descending"]).default("ascending"),
  })
  .strict()

export const reportQuerySchema = z
  .object({
    dataset: z.object({
      id: reportingIdentifierSchema,
      version: reportingVersionSchema.optional(),
    }),
    select: z.array(reportSelectionSchema).min(1).max(50),
    filters: z.array(reportFilterSchema).max(50).default([]),
    groupBy: z.array(reportGroupSchema).max(20).default([]),
    orderBy: z.array(reportOrderSchema).max(10).default([]),
    limit: z.number().int().positive().max(5_000).optional(),
  })
  .strict()

export type ReportQuery = z.infer<typeof reportQuerySchema>

export const reportColumnSchema = z
  .object({
    id: reportingIdentifierSchema,
    label: z.string().trim().min(1).max(160),
    valueType: reportFieldValueTypeSchema,
    // Presentation facts about a `currency` column that only the dataset that
    // produced it can know. A renderer has the value and the value type; it has
    // no way to tell whether 351533 is a balance of 351,533 or of 3,515.33, and
    // no way to tell which currency the row is denominated in. Without both, the
    // honest rendering is a plain number — a symbol picked from a default is a
    // number that reads as an amount it is not.
    /** The column's values are in minor units and must be scaled to display. */
    minorUnit: z.boolean().optional(),
    /**
     * Output column of the same result carrying this column's ISO currency code.
     * Only set when the query actually selects it, so it is absent rather than
     * guessed.
     */
    currencyField: reportingIdentifierSchema.optional(),
  })
  .strict()
export const reportResultSchema = z
  .object({
    columns: z.array(reportColumnSchema).max(100),
    rows: z.array(z.record(z.string(), z.unknown())).max(5_000),
    truncated: z.boolean().default(false),
    warnings: z.array(z.string().max(500)).max(50).default([]),
  })
  .strict()
export type ReportResult = z.infer<typeof reportResultSchema>

export const reportVisualizationSchema = z
  .object({
    type: z.enum(["kpi", "table", "line", "bar", "pie"]),
    options: z.record(z.string(), z.unknown()).default({}),
  })
  .strict()

export const reportGridSizeSchema = z
  .object({ width: z.number().int().min(1).max(12), height: z.number().int().min(1).max(100) })
  .strict()
export const reportGridLayoutSchema = reportGridSizeSchema
  .extend({ x: z.number().int().min(0).max(11), y: z.number().int().min(0).max(10_000) })
  .superRefine((layout, context) => {
    if (layout.x + layout.width > 12) {
      context.addIssue({ code: "custom", message: "Widget extends beyond the 12-column grid." })
    }
  })

export const reportWidgetDefinitionSchema = z
  .object({
    id: reportingIdentifierSchema,
    version: reportingVersionSchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(1_000).optional(),
    query: reportQuerySchema,
    visualization: reportVisualizationSchema,
    defaultSize: reportGridSizeSchema,
    minimumSize: reportGridSizeSchema.optional(),
    maximumSize: reportGridSizeSchema.optional(),
  })
  .strict()
export type ReportWidgetDefinition = z.infer<typeof reportWidgetDefinitionSchema>

export const reportWidgetInstanceSchema = z
  .object({
    id: reportingIdentifierSchema,
    source: z.discriminatedUnion("kind", [
      z
        .object({
          kind: z.literal("preset"),
          widgetId: reportingIdentifierSchema,
          version: reportingVersionSchema.optional(),
        })
        .strict(),
      z.object({ kind: z.literal("custom"), definition: reportWidgetDefinitionSchema }).strict(),
    ]),
    title: z.string().trim().min(1).max(160).optional(),
    layout: reportGridLayoutSchema,
  })
  .strict()
export type ReportWidgetInstance = z.infer<typeof reportWidgetInstanceSchema>

export const reportTemplateDefinitionSchema = z
  .object({
    id: reportingIdentifierSchema,
    version: reportingVersionSchema,
    label: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).optional(),
    parameters: z.array(reportingIdentifierSchema).max(50).default([]),
    widgets: z.array(reportWidgetInstanceSchema).max(50),
  })
  .strict()
export type ReportTemplateDefinition = z.infer<typeof reportTemplateDefinitionSchema>

export const reportDraftSchema = z
  .object({
    parameters: reportParametersSchema.default({}),
    widgets: z.array(reportWidgetInstanceSchema).max(50).default([]),
  })
  .strict()
  .superRefine((draft, context) => {
    const ids = new Set<string>()
    for (const [index, widget] of draft.widgets.entries()) {
      if (ids.has(widget.id)) {
        context.addIssue({
          code: "custom",
          message: `Duplicate widget instance ${JSON.stringify(widget.id)}.`,
          path: ["widgets", index, "id"],
        })
      }
      ids.add(widget.id)
    }
    for (let leftIndex = 0; leftIndex < draft.widgets.length; leftIndex += 1) {
      const left = draft.widgets[leftIndex]
      if (!left) continue
      for (let rightIndex = leftIndex + 1; rightIndex < draft.widgets.length; rightIndex += 1) {
        const right = draft.widgets[rightIndex]
        if (!right) continue
        const overlaps =
          left.layout.x < right.layout.x + right.layout.width &&
          left.layout.x + left.layout.width > right.layout.x &&
          left.layout.y < right.layout.y + right.layout.height &&
          left.layout.y + left.layout.height > right.layout.y
        if (overlaps) {
          context.addIssue({
            code: "custom",
            message: `Widget ${JSON.stringify(right.id)} overlaps ${JSON.stringify(left.id)}.`,
            path: ["widgets", rightIndex, "layout"],
          })
        }
      }
    }
  })
export type ReportDraft = z.infer<typeof reportDraftSchema>

export const createReportDefinitionSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).nullable().optional(),
    sourceTemplateId: reportingIdentifierSchema.nullable().optional(),
    sourceTemplateVersion: reportingVersionSchema.nullable().optional(),
    draft: reportDraftSchema.default({ parameters: {}, widgets: [] }),
  })
  .strict()

export const updateReportDefinitionSchema = z
  .object({
    revision: z.number().int().positive(),
    name: z.string().trim().min(1).max(160).optional(),
    description: z.string().trim().max(2_000).nullable().optional(),
    draft: reportDraftSchema.optional(),
  })
  .strict()

export const listReportDefinitionsQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(100).default(25),
  offset: z.coerce.number().int().nonnegative().default(0),
})

export const previewReportQuerySchema = z
  .object({ query: reportQuerySchema, parameters: reportParametersSchema.default({}) })
  .strict()

export const parseReportQuerySourceSchema = z
  .object({ source: z.string().trim().min(1).max(10_000) })
  .strict()

export const instantiateReportTemplateSchema = z
  .object({
    name: z.string().trim().min(1).max(160),
    description: z.string().trim().max(2_000).nullable().optional(),
    version: reportingVersionSchema.optional(),
  })
  .strict()
