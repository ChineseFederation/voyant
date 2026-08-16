import { OpenAPIHono } from "@hono/zod-openapi"
import { handleApiError } from "@voyant-travel/hono"
import { describe, expect, it } from "vitest"

import { ReportingRegistry } from "../../src/registry.js"
import { createReportingRoutes } from "../../src/routes.js"

/**
 * A period-parameterised report is exported once per period, and the export is
 * the artifact that gets filed (voyant#4704). The export route used to pass an
 * empty parameter bag, so the only way to export August was to edit and save
 * the report first — leaving it permanently describing whichever period was
 * exported last.
 */

const reportDefinition = {
  id: "rpdf_export_params",
  name: "Contracts in progress",
  description: null,
  draft: {
    // The saved report carries a period; the caller's should win over it.
    parameters: { periodStart: "2026-01-01", periodEnd: "2026-01-31" },
    widgets: [
      {
        id: "w1",
        source: {
          kind: "custom" as const,
          definition: {
            id: "custom-1",
            version: 1,
            label: "Contracts",
            query: {
              dataset: { id: "test.periodic", version: 1 },
              select: [{ kind: "aggregate", operation: "count", as: "n" }],
              filters: [],
              groupBy: [],
              orderBy: [],
            },
            visualization: { type: "kpi", options: {} },
            defaultSize: { width: 4, height: 2 },
          },
        },
        layout: { x: 0, y: 0, width: 4, height: 2 },
      },
    ],
  },
}

/** Echoes the parameters it was executed with, so the route's plumbing is visible. */
function echoingRegistry(seen: Record<string, unknown>[]) {
  return new ReportingRegistry([
    {
      namespace: "test",
      datasets: [
        {
          definition: {
            id: "test.periodic",
            version: 1,
            label: "Periodic",
            grain: "One row per period",
            requiredScopes: [],
            fields: [
              {
                id: "n",
                label: "Count",
                role: "measure",
                valueType: "integer",
                sensitivity: "internal",
                requiredScopes: [],
                aggregations: ["sum"],
              },
            ],
            defaultLimit: 100,
            maximumLimit: 1_000,
          },
          execute: async (_context, input) => {
            seen.push(input.parameters)
            return {
              columns: [{ id: "n", label: "Count", valueType: "integer" as const }],
              rows: [{ n: 1 }],
              truncated: false,
              warnings: [],
            }
          },
        },
      ],
    },
  ])
}

function requestWith(seen: Record<string, unknown>[], query: string) {
  const app = new OpenAPIHono()
  app.use("*", async (c, next) => {
    c.set("db", {
      select: () => ({
        from: () => ({ where: () => ({ limit: async () => [reportDefinition] }) }),
      }),
    } as never)
    c.set("scopes", ["reports:export"])
    await next()
  })
  app.route("/v1/admin/reporting", createReportingRoutes(echoingRegistry(seen)))
  app.onError((error, c) => handleApiError(error, c))
  return app.request(`/v1/admin/reporting/reports/${reportDefinition.id}/export${query}`)
}

describe("report export parameters", () => {
  it("passes query-string parameters through to the dataset", async () => {
    const seen: Record<string, unknown>[] = []
    const response = await requestWith(
      seen,
      "?format=csv&periodStart=2026-08-01&periodEnd=2026-08-31",
    )

    expect(response.status).toBe(200)
    expect(seen[0]).toMatchObject({ periodStart: "2026-08-01", periodEnd: "2026-08-31" })
  })

  it("keeps the saved report's parameters when the caller supplies none", async () => {
    const seen: Record<string, unknown>[] = []
    await requestWith(seen, "?format=csv")

    expect(seen[0]).toMatchObject({ periodStart: "2026-01-01", periodEnd: "2026-01-31" })
  })

  it("does not mistake the format for a report parameter", async () => {
    const seen: Record<string, unknown>[] = []
    await requestWith(seen, "?format=csv&periodStart=2026-08-01")

    expect(seen[0]).not.toHaveProperty("format")
  })
})
