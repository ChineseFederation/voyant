import { reportQuerySchema } from "@voyant-travel/reporting-contracts"
import { PgDialect, type SQL } from "drizzle-orm/pg-core"
import { describe, expect, it, vi } from "vitest"

import { inquiryActivityDataset } from "../../src/reporting.js"
import {
  INQUIRY_ACTIVITY_DATASET_ID,
  relationshipsReportingDeclaration,
} from "../../src/reporting-definitions.js"

function conversionWidgetQuery() {
  const widget = relationshipsReportingDeclaration.widgets?.find(
    ({ id }) => id === "relationships.widget.inquiry-conversions",
  )
  if (!widget) throw new Error("Missing inquiry conversion widget.")
  return reportQuerySchema.parse({
    dataset: { id: widget.datasetId, version: 1 },
    ...widget.query,
  })
}

describe("inquiry activity reporting", () => {
  it("derives conversion totals only from durable conversion rows", async () => {
    let statement: SQL | undefined
    const execute = vi.fn(async (query: SQL) => {
      statement = query
      return [{ report_column_0: "3" }]
    })

    const result = await inquiryActivityDataset.execute(
      { db: { execute }, grantedScopes: ["crm:read"] },
      { query: conversionWidgetQuery(), parameters: {}, maximumRows: 1 },
    )

    expect(result.rows).toEqual([{ totalConversions: 3 }])
    const compiled = new PgDialect().sqlToQuery(statement!)
    expect(compiled.sql).toContain('FROM "inquiry_conversions"')
    expect(compiled.sql).toContain('conversion_totals.inquiry_id = "inquiries"."id"')
    expect(compiled.sql).not.toContain('"inquiries"."status" =')
  })

  it("rejects access without the CRM read scope", async () => {
    await expect(
      inquiryActivityDataset.execute(
        { db: { execute: vi.fn() }, grantedScopes: [] },
        {
          query: {
            dataset: { id: INQUIRY_ACTIVITY_DATASET_ID },
            select: [{ kind: "aggregate", operation: "count", as: "total" }],
            filters: [],
            groupBy: [],
            orderBy: [],
          },
          parameters: {},
          maximumRows: 1,
        },
      ),
    ).rejects.toThrow("crm:read")
  })
})
