import { queryOptions } from "@tanstack/react-query"
import {
  type ReportDraft,
  type ReportParameters,
  type ReportQuery,
  type ReportResult,
  reportDatasetDefinitionSchema,
  reportDraftSchema,
  reportQuerySchema,
  reportResultSchema,
  reportTemplateDefinitionSchema,
  reportWidgetDefinitionSchema,
} from "@voyant-travel/reporting-contracts"
import { z } from "zod"

import { fetchWithValidation, type ReportingClient, VoyantApiError } from "./client.js"
import type { ReportingCatalog } from "./report-document.js"

/** Admin API mount for the reporting module (see `reporting/src/voyant.ts`). */
export const REPORTING_API_BASE = "/v1/admin/reporting"

const dataEnvelope = <T>(schema: z.ZodType<T>) => z.object({ data: schema })

export const reportingCatalogSchema = z.object({
  datasets: z.array(reportDatasetDefinitionSchema),
  widgets: z.array(reportWidgetDefinitionSchema),
  templates: z.array(reportTemplateDefinitionSchema),
})

/** A persisted report definition row as serialized by the admin API. */
export const reportDefinitionRowSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  sourceTemplateId: z.string().nullable(),
  sourceTemplateVersion: z.number().nullable(),
  draft: reportDraftSchema,
  revision: z.number().int(),
  createdByUserId: z.string().nullable().optional(),
  updatedByUserId: z.string().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
})
export type ReportDefinitionRow = z.infer<typeof reportDefinitionRowSchema>

const reportListSchema = z.object({
  data: z.array(reportDefinitionRowSchema),
  total: z.number(),
  limit: z.number(),
  offset: z.number(),
})
export type ReportList = z.infer<typeof reportListSchema>

export interface CreateReportInput {
  name: string
  description?: string | null
  draft?: ReportDraft
}

export interface UpdateReportInput {
  revision: number
  name?: string
  description?: string | null
  draft?: ReportDraft
}

export interface InstantiateTemplateInput {
  name: string
  description?: string | null
  version?: number
}

/** Centralized query keys so mutations can invalidate consistently. */
export const reportingQueryKeys = {
  all: ["reporting"] as const,
  catalog: () => [...reportingQueryKeys.all, "catalog"] as const,
  reports: (params?: { limit?: number; offset?: number }) =>
    [...reportingQueryKeys.all, "reports", params ?? {}] as const,
  report: (id: string) => [...reportingQueryKeys.all, "report", id] as const,
}

export function getCatalogQueryOptions(client: ReportingClient) {
  return queryOptions({
    queryKey: reportingQueryKeys.catalog(),
    queryFn: async (): Promise<ReportingCatalog> => {
      const { data } = await fetchWithValidation(
        `${REPORTING_API_BASE}/catalog`,
        dataEnvelope(reportingCatalogSchema),
        client,
      )
      return data
    },
  })
}

export function getReportsQueryOptions(
  client: ReportingClient,
  params: { limit?: number; offset?: number } = {},
) {
  const search = new URLSearchParams()
  if (params.limit !== undefined) search.set("limit", String(params.limit))
  if (params.offset !== undefined) search.set("offset", String(params.offset))
  const suffix = search.toString() ? `?${search.toString()}` : ""
  return queryOptions({
    queryKey: reportingQueryKeys.reports(params),
    queryFn: () =>
      fetchWithValidation(`${REPORTING_API_BASE}/reports${suffix}`, reportListSchema, client),
  })
}

export function getReportQueryOptions(client: ReportingClient, id: string) {
  return queryOptions({
    queryKey: reportingQueryKeys.report(id),
    queryFn: async (): Promise<ReportDefinitionRow> => {
      const { data } = await fetchWithValidation(
        `${REPORTING_API_BASE}/reports/${encodeURIComponent(id)}`,
        dataEnvelope(reportDefinitionRowSchema),
        client,
      )
      return data
    },
  })
}

export async function createReport(
  client: ReportingClient,
  input: CreateReportInput,
): Promise<ReportDefinitionRow> {
  const { data } = await fetchWithValidation(
    `${REPORTING_API_BASE}/reports`,
    dataEnvelope(reportDefinitionRowSchema),
    client,
    { method: "POST", body: JSON.stringify(input) },
  )
  return data
}

export async function updateReport(
  client: ReportingClient,
  id: string,
  input: UpdateReportInput,
): Promise<ReportDefinitionRow> {
  const { data } = await fetchWithValidation(
    `${REPORTING_API_BASE}/reports/${encodeURIComponent(id)}`,
    dataEnvelope(reportDefinitionRowSchema),
    client,
    { method: "PATCH", body: JSON.stringify(input) },
  )
  return data
}

export async function deleteReport(client: ReportingClient, id: string): Promise<void> {
  await fetchWithValidation(
    `${REPORTING_API_BASE}/reports/${encodeURIComponent(id)}`,
    z.object({ success: z.boolean() }),
    client,
    { method: "DELETE" },
  )
}

export async function instantiateTemplate(
  client: ReportingClient,
  templateId: string,
  input: InstantiateTemplateInput,
): Promise<ReportDefinitionRow> {
  const { data } = await fetchWithValidation(
    `${REPORTING_API_BASE}/templates/${encodeURIComponent(templateId)}/instantiate`,
    dataEnvelope(reportDefinitionRowSchema),
    client,
    { method: "POST", body: JSON.stringify(input) },
  )
  return data
}

/** Compile bounded query source into an AST via the server (`/queries/parse`). */
export async function parseQuerySource(
  client: ReportingClient,
  source: string,
): Promise<ReportQuery> {
  const { data } = await fetchWithValidation(
    `${REPORTING_API_BASE}/queries/parse`,
    dataEnvelope(reportQuerySchema),
    client,
    { method: "POST", body: JSON.stringify({ source }) },
  )
  return data
}

export type ReportExportFormat = "csv" | "xlsx" | "pdf"

/**
 * Download a report as CSV / XLSX / PDF. Streams the file from the admin export
 * endpoint (which re-runs every widget server-side, honoring the report's saved
 * period) and triggers a browser download. Throws {@link VoyantApiError} on a
 * non-2xx response.
 */
export async function exportReport(
  client: ReportingClient,
  id: string,
  format: ReportExportFormat,
  /**
   * The report's current parameters. Sent explicitly rather than relying on
   * whatever was last saved, so exporting one period does not depend on a
   * flush having landed first.
   */
  parameters: Readonly<Record<string, unknown>> = {},
): Promise<void> {
  const query = new URLSearchParams({ format })
  for (const [key, value] of Object.entries(parameters)) {
    if (typeof value === "string" && value.length > 0) query.set(key, value)
  }
  const url = `${client.baseUrl.replace(/\/$/, "")}${REPORTING_API_BASE}/reports/${encodeURIComponent(
    id,
  )}/export?${query.toString()}`
  const response = await client.fetcher(url, { credentials: "include" })
  if (!response.ok) {
    throw new VoyantApiError(`Report export failed: ${response.status}`, response.status, undefined)
  }
  const blob = await response.blob()
  const disposition = response.headers.get("Content-Disposition") ?? ""
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? `report.${format}`
  const objectUrl = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = objectUrl
  anchor.download = filename
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(objectUrl)
}

/** Execute a bounded query for a live preview (`/queries/preview`). */
export async function previewQuery(
  client: ReportingClient,
  input: { query: ReportQuery; parameters?: ReportParameters },
): Promise<ReportResult> {
  const { data } = await fetchWithValidation(
    `${REPORTING_API_BASE}/queries/preview`,
    dataEnvelope(reportResultSchema),
    client,
    {
      method: "POST",
      body: JSON.stringify({ query: input.query, parameters: input.parameters ?? {} }),
    },
  )
  return data
}
