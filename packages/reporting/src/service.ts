import type {
  createReportDefinitionSchema,
  ReportParameters,
  updateReportDefinitionSchema,
} from "@voyant-travel/reporting-contracts"
import { and, desc, eq, sql } from "drizzle-orm"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { z } from "zod"

import type { ReportingRegistry } from "./registry.js"
import { type ReportDefinitionRow, reportDefinitions } from "./schema.js"

export type CreateReportDefinitionInput = z.infer<typeof createReportDefinitionSchema>
export type UpdateReportDefinitionInput = z.infer<typeof updateReportDefinitionSchema>

export class ReportDefinitionRevisionConflictError extends Error {
  constructor() {
    super("The report draft changed since it was loaded.")
    this.name = "ReportDefinitionRevisionConflictError"
  }
}

export class ReportingRecordNotFoundError extends Error {
  constructor(record: string) {
    super(`${record} was not found.`)
    this.name = "ReportingRecordNotFoundError"
  }
}

export function createReportingService(registry: ReportingRegistry) {
  return {
    async list(db: PostgresJsDatabase, input: { limit: number; offset: number }) {
      const [data, count] = await Promise.all([
        db
          .select()
          .from(reportDefinitions)
          .orderBy(desc(reportDefinitions.updatedAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` }).from(reportDefinitions),
      ])
      return { data, total: count[0]?.count ?? 0, ...input }
    },

    async get(db: PostgresJsDatabase, id: string): Promise<ReportDefinitionRow | null> {
      const [row] = await db
        .select()
        .from(reportDefinitions)
        .where(eq(reportDefinitions.id, id))
        .limit(1)
      return row ?? null
    },

    async create(db: PostgresJsDatabase, input: CreateReportDefinitionInput, actorId?: string) {
      const [row] = await db
        .insert(reportDefinitions)
        .values({
          ...input,
          description: input.description ?? null,
          sourceTemplateId: input.sourceTemplateId ?? null,
          sourceTemplateVersion: input.sourceTemplateVersion ?? null,
          createdByUserId: actorId,
          updatedByUserId: actorId,
        })
        .returning()
      if (!row) throw new Error("Report definition insert returned no row.")
      return row
    },

    async instantiateTemplate(
      db: PostgresJsDatabase,
      input: { templateId: string; version?: number; name: string; description?: string | null },
      actorId?: string,
    ) {
      const template = registry.getTemplate(input.templateId, input.version)
      if (!template) throw new ReportingRecordNotFoundError("Report template")
      // Seed the template's declared defaults so an instantiated report opens
      // showing something. A parameterised template that lands with an empty
      // bag renders every widget as a missing-parameter error, which reads as
      // "this template is broken" rather than "choose a period".
      const parameters: ReportParameters = {}
      for (const parameter of template.parameters) {
        if (parameter.defaultValue !== undefined) parameters[parameter.id] = parameter.defaultValue
      }
      return this.create(
        db,
        {
          name: input.name,
          description: input.description,
          sourceTemplateId: template.id,
          sourceTemplateVersion: template.version,
          draft: { parameters, widgets: template.widgets },
        },
        actorId,
      )
    },

    async update(
      db: PostgresJsDatabase,
      id: string,
      input: UpdateReportDefinitionInput,
      actorId?: string,
    ) {
      const { revision, ...patch } = input
      const [row] = await db
        .update(reportDefinitions)
        .set({ ...patch, revision: revision + 1, updatedByUserId: actorId, updatedAt: new Date() })
        .where(and(eq(reportDefinitions.id, id), eq(reportDefinitions.revision, revision)))
        .returning()
      if (row) return row
      const existing = await this.get(db, id)
      if (!existing) throw new ReportingRecordNotFoundError("Report definition")
      throw new ReportDefinitionRevisionConflictError()
    },

    async remove(db: PostgresJsDatabase, id: string): Promise<boolean> {
      const deleted = await db
        .delete(reportDefinitions)
        .where(eq(reportDefinitions.id, id))
        .returning({ id: reportDefinitions.id })
      return deleted.length > 0
    },

    /**
     * Execute every widget in a report and return its tabular data, ready to be
     * serialized to CSV / XLSX / PDF. Widgets that fail (unavailable, scope, or
     * query error) become a section carrying the error message rather than
     * aborting the whole export.
     */
    async exportReport(
      db: PostgresJsDatabase,
      id: string,
      parameters: ReportParameters,
      context: { actorId?: string; grantedScopes: readonly string[]; signal?: AbortSignal },
    ): Promise<ReportExport | null> {
      const [definition] = await db
        .select()
        .from(reportDefinitions)
        .where(eq(reportDefinitions.id, id))
        .limit(1)
      if (!definition) return null
      const merged = { ...definition.draft.parameters, ...parameters }
      const sections: ReportExportSection[] = []
      for (const resolved of registry.resolveDraft(definition.draft, "view")) {
        const title = resolved.definition
          ? (resolved.instance.title ?? resolved.definition.label)
          : (resolved.instance.title ?? resolved.instance.id)
        if (resolved.status === "missing" || !resolved.definition) {
          sections.push({ title, columns: [], rows: [], error: resolved.missingReason })
          continue
        }
        try {
          const result = await registry.executeQuery({
            db,
            actorId: context.actorId,
            grantedScopes: context.grantedScopes,
            query: resolved.definition.query,
            parameters: merged,
            signal: context.signal,
          })
          const options = resolved.definition.visualization.options ?? {}
          sections.push({
            title,
            columns: result.columns,
            rows: result.rows,
            format: {
              minorUnit: typeof options.minorUnit === "boolean" ? options.minorUnit : undefined,
              currencyField:
                typeof options.currencyField === "string" ? options.currencyField : undefined,
              currency: typeof options.currency === "string" ? options.currency : undefined,
            },
          })
        } catch (error) {
          sections.push({
            title,
            columns: [],
            rows: [],
            error: error instanceof Error ? error.message : "Widget failed to export.",
          })
        }
      }
      return { name: definition.name, description: definition.description, sections }
    },
  }
}

/** Presentation hints carried from a widget's visualization options into export. */
export interface ReportExportSectionFormat {
  /**
   * Currency values are stored in minor units (cents) and must be divided by
   * 100. Absent when the widget does not say, in which case each column's own
   * dataset-declared scale applies.
   */
  readonly minorUnit?: boolean
  /** Column whose value holds the ISO currency code for each row. */
  readonly currencyField?: string
  /** Fallback ISO currency when a row has no {@link currencyField}. */
  readonly currency?: string
}

/** A single widget's tabular data within an exported report. */
export interface ReportExportSection {
  readonly title: string
  readonly columns: ReadonlyArray<{
    id: string
    label: string
    valueType: string
    /** Dataset-declared: the column's values are in minor units. */
    minorUnit?: boolean
    /** Dataset-declared: the output column carrying this column's ISO currency. */
    currencyField?: string
  }>
  readonly rows: ReadonlyArray<Record<string, unknown>>
  readonly format?: ReportExportSectionFormat
  readonly error?: string
}

/** A report resolved to plain tabular sections for file export. */
export interface ReportExport {
  readonly name: string
  readonly description: string | null
  readonly sections: readonly ReportExportSection[]
}
