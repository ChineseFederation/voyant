import { OpenAPIHono } from "@hono/zod-openapi"
import {
  ForbiddenApiError,
  openApiValidationHook,
  parseJsonBody,
  parseQuery,
} from "@voyant-travel/hono"
import {
  createReportDefinitionSchema,
  instantiateReportTemplateSchema,
  listReportDefinitionsQuerySchema,
  parseReportQuery,
  parseReportQuerySourceSchema,
  previewReportQuerySchema,
  ReportDatasetQueryError,
  type ReportParameters,
  ReportQuerySyntaxError,
  updateReportDefinitionSchema,
} from "@voyant-travel/reporting-contracts"
import { hasApiKeyPermission, permissionStringsToPermissions } from "@voyant-travel/types/api-keys"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import type { Context } from "hono"

import {
  REPORT_EXPORT_CONTENT_TYPES,
  type ReportExportFormat,
  reportExportFileBase,
  reportToCsv,
  reportToPdf,
  reportToXlsx,
} from "./export.js"
import {
  ReportingAuthorizationError,
  type ReportingRegistry,
  ReportingRegistryError,
} from "./registry.js"
import {
  createReportingService,
  ReportDefinitionRevisionConflictError,
  ReportingRecordNotFoundError,
} from "./service.js"

type Env = {
  Variables: { db: PostgresJsDatabase; userId?: string; scopes?: string[] }
}

export function createReportingRoutes(registry: ReportingRegistry) {
  const routes = new OpenAPIHono<Env>({ defaultHook: openApiValidationHook })
  const service = createReportingService(registry)

  routes.get("/catalog", (c) => {
    requireReportsPermission(c.get("scopes"), "read")
    return c.json({ data: registry.catalog() })
  })

  routes.post("/queries/parse", async (c) => {
    requireReportsPermission(c.get("scopes"), "read")
    const input = await parseJsonBody(c, parseReportQuerySourceSchema)
    try {
      const query = parseReportQuery(input.source)
      // Validate against the live registry so unknown datasets/fields, unsupported
      // aggregations, and grouping mistakes fail here — where the author clicked
      // "Parse" to check their query — instead of only when the preview executes.
      registry.validateQuery(query, c.get("scopes") ?? [])
      return c.json({ data: query })
    } catch (error) {
      // Both syntax errors and registry validation failures (unknown dataset/field,
      // bad grouping, out-of-range limit) are author mistakes → 400 with a message,
      // never a 500.
      if (error instanceof ReportQuerySyntaxError) {
        return c.json({ error: "invalid_report_query", message: error.message }, 400)
      }
      return reportingErrorResponse(c, error)
    }
  })

  routes.post("/queries/preview", async (c) => {
    requireReportsPermission(c.get("scopes"), "read")
    const input = await parseJsonBody(c, previewReportQuerySchema)
    try {
      const data = await registry.executeQuery({
        db: c.get("db"),
        actorId: c.get("userId"),
        grantedScopes: c.get("scopes") ?? [],
        query: input.query,
        parameters: input.parameters,
        signal: c.req.raw.signal,
      })
      return c.json({ data })
    } catch (error) {
      return reportingErrorResponse(c, error)
    }
  })

  routes.get("/reports", async (c) => {
    requireReportsPermission(c.get("scopes"), "read")
    const query = parseQuery(c, listReportDefinitionsQuerySchema)
    return c.json(await service.list(c.get("db"), query))
  })

  routes.post("/reports", async (c) => {
    requireReportsPermission(c.get("scopes"), "write")
    const input = await parseJsonBody(c, createReportDefinitionSchema)
    return c.json({ data: await service.create(c.get("db"), input, c.get("userId")) }, 201)
  })

  routes.get("/reports/:id", async (c) => {
    requireReportsPermission(c.get("scopes"), "read")
    const report = await service.get(c.get("db"), c.req.param("id"))
    return report ? c.json({ data: report }) : c.json({ error: "report_not_found" }, 404)
  })

  routes.patch("/reports/:id", async (c) => {
    requireReportsPermission(c.get("scopes"), "write")
    const input = await parseJsonBody(c, updateReportDefinitionSchema)
    try {
      const report = await service.update(c.get("db"), c.req.param("id"), input, c.get("userId"))
      return c.json({ data: report })
    } catch (error) {
      return reportingErrorResponse(c, error)
    }
  })

  routes.delete("/reports/:id", async (c) => {
    requireReportsPermission(c.get("scopes"), "write")
    try {
      return (await service.remove(c.get("db"), c.req.param("id")))
        ? c.json({ success: true })
        : c.json({ error: "report_not_found" }, 404)
    } catch (error) {
      return reportingErrorResponse(c, error)
    }
  })

  routes.post("/templates/:id/instantiate", async (c) => {
    requireReportsPermission(c.get("scopes"), "write")
    const input = await parseJsonBody(c, instantiateReportTemplateSchema)
    try {
      const report = await service.instantiateTemplate(
        c.get("db"),
        { templateId: c.req.param("id"), ...input },
        c.get("userId"),
      )
      return c.json({ data: report }, 201)
    } catch (error) {
      return reportingErrorResponse(c, error)
    }
  })

  routes.get("/reports/:id/export", async (c) => {
    requireReportsPermission(c.get("scopes"), "export")
    const format = (c.req.query("format") ?? "csv").toLowerCase()
    if (format !== "csv" && format !== "xlsx" && format !== "pdf") {
      return c.json({ error: "invalid_format", message: "format must be csv, xlsx, or pdf." }, 400)
    }
    try {
      // A period-parameterised report is exported once per period, and the
      // export is the artifact that gets filed. Reading parameters off the
      // query string is what lets an operator export August without first
      // editing and saving the report — which would leave the saved report
      // permanently describing whichever period was exported last.
      const report = await service.exportReport(
        c.get("db"),
        c.req.param("id"),
        exportParametersFromQuery(c.req.query()),
        {
          actorId: c.get("userId"),
          grantedScopes: c.get("scopes") ?? [],
          signal: c.req.raw.signal,
        },
      )
      if (!report) return c.json({ error: "report_not_found" }, 404)
      const typed = format as ReportExportFormat
      c.header("Content-Type", REPORT_EXPORT_CONTENT_TYPES[typed])
      c.header(
        "Content-Disposition",
        `attachment; filename="${reportExportFileBase(report)}.${typed}"`,
      )
      if (typed === "csv") {
        return c.body(reportToCsv(report))
      }
      // xlsx/pdf return raw bytes; hand Hono a standalone ArrayBuffer (a
      // Uint8Array is not part of its accepted body `Data` union, and the view
      // may be backed by a larger buffer).
      const bytes = typed === "xlsx" ? await reportToXlsx(report) : await reportToPdf(report)
      return c.body(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer,
      )
    } catch (error) {
      return reportingErrorResponse(c, error)
    }
  })

  return routes
}

/** Query keys the export route owns; everything else is a report parameter. */
const EXPORT_RESERVED_QUERY_KEYS = new Set(["format"])

/**
 * Read report parameters off the export query string. Values stay strings —
 * dataset executors already parse what they need, and coercing here would
 * guess at a type the parameter's own descriptor knows and this route does not.
 */
function exportParametersFromQuery(query: Record<string, string>): ReportParameters {
  const parameters: ReportParameters = {}
  for (const [key, value] of Object.entries(query)) {
    if (EXPORT_RESERVED_QUERY_KEYS.has(key)) continue
    if (typeof value === "string" && value.length > 0) parameters[key] = value
  }
  return parameters
}

function requireReportsPermission(
  scopes: string[] | undefined,
  action: "read" | "write" | "export",
): void {
  if (!hasApiKeyPermission(permissionStringsToPermissions(scopes ?? []), "reports", action)) {
    throw new ForbiddenApiError()
  }
}

function reportingErrorResponse(c: Context, error: unknown) {
  if (error instanceof ReportingRecordNotFoundError) return c.json({ error: "not_found" }, 404)
  if (error instanceof ReportDefinitionRevisionConflictError) {
    return c.json({ error: "revision_conflict" }, 409)
  }
  if (error instanceof ReportingAuthorizationError) {
    return c.json({ error: "forbidden", missingScopes: error.missingScopes }, 403)
  }
  if (error instanceof ReportingRegistryError || error instanceof ReportDatasetQueryError) {
    return c.json({ error: "invalid_report_query", message: error.message }, 400)
  }
  throw error
}
